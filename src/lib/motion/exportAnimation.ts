import type Konva from "konva";
import { useEditor } from "@/store/editor";
import { getStage } from "@/components/canvas/stageRef";
import { captureBox, withOverlaysHidden } from "@/lib/exporters";
import { saveExport } from "@/lib/host";
import { prepareExportTiles } from "@/lib/export/prepareExportTiles";
import { prepareExportBackdrop } from "@/lib/export/prepareExportBackdrop";
import { poseStage, type MotionScene } from "./pose";
import { frameCount } from "./timing";
import type { GifMessage, GifReply } from "./gif.worker";

/*
  An animation is exported a frame at a time: the canvas is posed at each moment,
  captured at the export's size, and handed to an encoder. MP4 uses the system's
  own H.264 encoder through WebCodecs (Mediabunny writes the file around it), so
  nothing is bundled; a GIF is made by gifenc in a worker. Frames are never all
  kept: each goes to the encoder and is let go.
*/

export type AnimationFormat = "mp4" | "gif";

/** GIFs are made at 20 frames a second: GIF delays are hundredths, so 5 is exact. */
export const GIF_FPS = 20;
export const GIF_SIZES = [
  { id: "small", label: "Small", side: 480 },
  { id: "medium", label: "Medium", side: 720 },
  { id: "large", label: "Large", side: 1080 },
] as const;
export type GifSize = (typeof GIF_SIZES)[number]["id"];

export interface AnimationExport {
  format: AnimationFormat;
  /** For MP4: pixels to each canvas pixel, as for a still. */
  scale: number;
  /** For MP4: 30 or 60. */
  fps: number;
  gifSize: GifSize;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** The MP4 maker (and Mediabunny with it) loads when it's needed, not with the app. */
const loadMp4 = () => import("./mp4");

let mp4Support: Promise<boolean> | null = null;

/** Whether this system can make an MP4. Some Linux and web browsers can't; GIF always works. */
export const canMakeMp4 = () => {
  mp4Support ??=
    typeof VideoEncoder === "undefined"
      ? Promise.resolve(false)
      : loadMp4()
          .then(({ canEncodeAvc }) => canEncodeAvc(1920, 1080))
          .catch(() => false);
  return mp4Support;
};

const cancelled = () => new DOMException("The export was cancelled.", "AbortError");

/** Something that takes frames, one at a time, and gives back a file. */
export interface FrameSink {
  ratio: number;
  add: (frame: HTMLCanvasElement, index: number) => Promise<void>;
  finish: () => Promise<Blob>;
  cancel: () => void;
}

const gifSink = (canvas: { width: number; height: number }, gifSize: GifSize): FrameSink => {
  const side = GIF_SIZES.find((entry) => entry.id === gifSize)?.side ?? 720;
  const ratio = Math.min(1, side / Math.max(canvas.width, canvas.height));
  const width = Math.max(1, Math.round(canvas.width * ratio));
  const height = Math.max(1, Math.round(canvas.height * ratio));
  const frame = document.createElement("canvas");
  frame.width = width;
  frame.height = height;
  const g = frame.getContext("2d", { willReadFrequently: true });
  const worker = new Worker(new URL("./gif.worker.ts", import.meta.url), { type: "module" });
  const send = (message: GifMessage, transfer: Transferable[] = []) => worker.postMessage(message, transfer);
  // Frames waiting in the worker. A few may queue; more would only hold memory.
  let queued = 0;
  const waiting: (() => void)[] = [];
  let done: ((bytes: Uint8Array) => void) | null = null;
  let failed: ((error: Error) => void) | null = null;
  worker.onmessage = ({ data }: MessageEvent<GifReply>) => {
    if (data.kind === "framed") {
      queued -= 1;
      waiting.shift()?.();
    } else {
      done?.(data.bytes);
    }
  };
  worker.onerror = (event) => failed?.(new Error(event.message || "The GIF couldn't be made."));
  send({ kind: "start", width, height, delay: Math.round(1000 / GIF_FPS) });

  return {
    ratio,
    add: async (picture) => {
      if (!g) return;
      g.clearRect(0, 0, width, height);
      g.drawImage(picture, 0, 0, width, height);
      const pixels = g.getImageData(0, 0, width, height).data;
      queued += 1;
      send({ kind: "frame", pixels }, [pixels.buffer]);
      if (queued > 3) await new Promise<void>((resolve) => waiting.push(resolve));
    },
    finish: () =>
      new Promise<Blob>((resolve, reject) => {
        done = (bytes) => {
          worker.terminate();
          resolve(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/gif" }));
        };
        failed = (error) => {
          worker.terminate();
          reject(error);
        };
        send({ kind: "finish" });
      }),
    cancel: () => worker.terminate(),
  };
};

const sceneOf = (): MotionScene => {
  const { canvas, background, elements, motion } = useEditor.getState();
  return { canvas, background, elements, motion };
};

/** Renders every frame of the animation into a file. Doesn't save it. */
export const renderAnimation = async (options: AnimationExport): Promise<Blob> => {
  const stage: Konva.Stage | null = getStage();
  if (!stage) throw new Error("There's no canvas to export.");
  const scene = sceneOf();
  const fps = options.format === "gif" ? GIF_FPS : options.fps;
  const total = frameCount(scene.motion.length, fps);
  const sink =
    options.format === "gif"
      ? gifSink(scene.canvas, options.gifSize)
      : await (await loadMp4()).mp4Sink(scene.canvas, options.scale, fps);

  // The canvas shows the animation while it's made, and can't be edited meanwhile.
  useEditor.setState({ previewing: true, editingId: null, cropId: null, markTool: null });
  try {
    return await withOverlaysHidden(stage, {}, async () => {
      await document.fonts.ready;
      const cleanupTiles = await prepareExportTiles(stage, sink.ratio);
      const cleanupBackdrop = await prepareExportBackdrop(stage, sink.ratio);
      try {
        for (let index = 0; index < total; index++) {
          if (options.signal?.aborted) throw cancelled();
          await poseStage(stage, scene, index / fps, { scale: sink.ratio, frame: index, preview: false });
          await sink.add(stage.toCanvas(captureBox(stage, sink.ratio)), index);
          options.onProgress?.(index + 1, total);
        }
        if (options.signal?.aborted) throw cancelled();
        return await sink.finish();
      } catch (error) {
        sink.cancel();
        throw error;
      } finally {
        cleanupBackdrop?.();
        cleanupTiles?.();
      }
    });
  } finally {
    // Back to the design at rest. See playback.ts.
    useEditor.setState({ previewing: false });
  }
};

/** Renders the animation and saves it: a download on the web, a save dialog on the desktop. */
export const exportAnimation = async (options: AnimationExport) => {
  const blob = await renderAnimation(options);
  await saveExport(blob, `layer-design-${Date.now()}.${options.format}`);
};
