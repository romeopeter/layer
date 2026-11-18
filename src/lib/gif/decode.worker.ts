import { GifReader } from "omggif";

/*
  Splits an animated GIF into whole frames, away from the page. A GIF stores each
  frame as a patch over the last, with a rule for what happens to it after
  (`disposal`): this paints them in order onto one picture, so every frame comes
  out complete, as a browser would show it.
*/

export interface DecodeRequest {
  id: number;
  bytes: ArrayBuffer;
}

export interface DecodedFrame {
  bitmap: ImageBitmap;
  /** How long it shows, in milliseconds. */
  delay: number;
}

export type DecodeReply =
  | { id: number; kind: "still" }
  | { id: number; kind: "animated"; width: number; height: number; frames: DecodedFrame[] }
  | { id: number; kind: "failed" };

/** All of one GIF's frames together stay under this; a bigger one is decoded smaller. */
const MAX_BYTES = 256 * 1024 * 1024;

/** GIF delays are hundredths of a second. Browsers show anything under 2 as 10. */
const delayOf = (hundredths: number) => (hundredths < 2 ? 100 : hundredths * 10);

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<DecodeRequest>) => void) | null;
  postMessage: (message: DecodeReply, transfer?: Transferable[]) => void;
};

const decode = async ({ id, bytes }: DecodeRequest): Promise<DecodeReply> => {
  const reader = new GifReader(new Uint8Array(bytes));
  const count = reader.numFrames();
  if (count < 2) return { id, kind: "still" };

  const { width, height } = reader;
  const scale = Math.min(1, Math.sqrt(MAX_BYTES / (width * height * 4 * count)));
  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));

  // The picture the frames are painted onto, in turn.
  const pixels = new Uint8ClampedArray(width * height * 4);
  const canvas = new OffscreenCanvas(width, height);
  const g = canvas.getContext("2d");
  const small = scale < 1 ? new OffscreenCanvas(outWidth, outHeight) : null;
  const smallG = small?.getContext("2d") ?? null;
  if (!g || (small && !smallG)) return { id, kind: "failed" };

  const frames: DecodedFrame[] = [];
  for (let index = 0; index < count; index++) {
    const info = reader.frameInfo(index);
    const before = info.disposal === 3 ? pixels.slice() : null;
    reader.decodeAndBlitFrameRGBA(index, pixels);
    g.putImageData(new ImageData(pixels, width, height), 0, 0);
    let bitmap: ImageBitmap;
    if (small && smallG) {
      smallG.clearRect(0, 0, outWidth, outHeight);
      smallG.drawImage(canvas, 0, 0, outWidth, outHeight);
      bitmap = small.transferToImageBitmap();
    } else {
      bitmap = await createImageBitmap(canvas);
    }
    frames.push({ bitmap, delay: delayOf(info.delay) });

    // What the frame leaves behind for the next one.
    if (info.disposal === 2) {
      for (let y = info.y; y < Math.min(height, info.y + info.height); y++) {
        pixels.fill(0, (y * width + info.x) * 4, (y * width + Math.min(width, info.x + info.width)) * 4);
      }
    } else if (before) {
      pixels.set(before);
    }
  }
  return { id, kind: "animated", width: outWidth, height: outHeight, frames };
};

scope.onmessage = ({ data }) => {
  decode(data)
    .then((reply) =>
      scope.postMessage(reply, reply.kind === "animated" ? reply.frames.map((frame) => frame.bitmap) : []),
    )
    .catch(() => scope.postMessage({ id: data.id, kind: "failed" }));
};
