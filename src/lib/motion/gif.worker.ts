import { GIFEncoder, applyPalette, quantize, type GifEncoder } from "gifenc";

/**
 * Makes a GIF away from the page, a frame at a time, so the canvas can keep
 * drawing the next frame meanwhile. Each frame gets its own 256 colours.
 */

export type GifMessage =
  | { kind: "start"; width: number; height: number; delay: number }
  | { kind: "frame"; pixels: Uint8ClampedArray }
  | { kind: "finish" };

export type GifReply = { kind: "framed" } | { kind: "done"; bytes: Uint8Array };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<GifMessage>) => void) | null;
  postMessage: (message: GifReply, transfer?: Transferable[]) => void;
};

let encoder: GifEncoder | null = null;
let size = { width: 0, height: 0, delay: 50 };

scope.onmessage = ({ data }) => {
  if (data.kind === "start") {
    encoder = GIFEncoder();
    size = { width: data.width, height: data.height, delay: data.delay };
  } else if (data.kind === "frame" && encoder) {
    const palette = quantize(data.pixels, 256);
    // Repeat 0 is forever, which is what a GIF on a page is for.
    encoder.writeFrame(applyPalette(data.pixels, palette), size.width, size.height, {
      palette,
      delay: size.delay,
      repeat: 0,
    });
    scope.postMessage({ kind: "framed" });
  } else if (data.kind === "finish" && encoder) {
    encoder.finish();
    const bytes = encoder.bytes();
    scope.postMessage({ kind: "done", bytes }, [bytes.buffer]);
    encoder = null;
  }
};
