import type { DecodeReply, DecodeRequest, DecodedFrame } from "./decode.worker";

/*
  Animated GIFs, decoded once into whole frames (in a worker, decode.worker.ts) and
  shared by every element that shows the same file. A GIF with one frame isn't
  animated: it stays an ordinary picture.
*/

export interface GifAnimation {
  /** The size the frames were decoded at: the GIF's own, unless it was too big to hold. */
  width: number;
  height: number;
  frames: DecodedFrame[];
  /** One loop, in milliseconds. */
  duration: number;
  /** When each frame starts within a loop, in milliseconds. */
  starts: number[];
}

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, (reply: DecodeReply) => void>();

const decoder = () => {
  if (worker) return worker;
  worker = new Worker(new URL("./decode.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }: MessageEvent<DecodeReply>) => {
    waiting.get(data.id)?.(data);
    waiting.delete(data.id);
  };
  return worker;
};

const decode = async (src: string): Promise<GifAnimation | null> => {
  const bytes = await (await fetch(src)).arrayBuffer();
  const id = nextId++;
  const reply = await new Promise<DecodeReply>((resolve) => {
    waiting.set(id, resolve);
    decoder().postMessage({ id, bytes } satisfies DecodeRequest, [bytes]);
  });
  if (reply.kind !== "animated") return null;
  const starts: number[] = [];
  let duration = 0;
  for (const frame of reply.frames) {
    starts.push(duration);
    duration += frame.delay;
  }
  return { width: reply.width, height: reply.height, frames: reply.frames, duration, starts };
};

/** Whether a picture is a GIF, which may be animated. */
export const isGifSource = (src: string) => /^data:image\/gif[;,]/i.test(src);

interface Entry {
  animation: Promise<GifAnimation | null>;
  users: number;
  release?: ReturnType<typeof setTimeout>;
}

const entries = new Map<string, Entry>();
/** A moment's grace before an unused GIF is freed, so a remounted node doesn't decode it again. */
const RELEASE_AFTER = 2000;

/** The GIF's frames, decoded once however many elements show it. Pair with `releaseAnimation`. */
export const acquireAnimation = (src: string) => {
  let entry = entries.get(src);
  if (!entry) {
    entry = { animation: decode(src).catch(() => null), users: 0 };
    entries.set(src, entry);
  }
  clearTimeout(entry.release);
  entry.users += 1;
  return entry.animation;
};

export const releaseAnimation = (src: string) => {
  const entry = entries.get(src);
  if (!entry) return;
  entry.users -= 1;
  if (entry.users > 0) return;
  entry.release = setTimeout(() => {
    if (entry.users > 0) return;
    entries.delete(src);
    void entry.animation.then((animation) => animation?.frames.forEach((frame) => frame.bitmap.close()));
  }, RELEASE_AFTER);
};

/** Which frame shows `ms` milliseconds in, looping. */
export const frameIndexAt = (animation: GifAnimation, ms: number) => {
  const t = ((ms % animation.duration) + animation.duration) % animation.duration;
  let low = 0;
  let high = animation.starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (animation.starts[middle] <= t) low = middle;
    else high = middle - 1;
  }
  return low;
};
