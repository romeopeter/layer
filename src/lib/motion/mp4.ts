import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, canEncodeVideo } from "mediabunny";
import type { FrameSink } from "./exportAnimation";
import { frameTime } from "./timing";

/*
  MP4 through the system's own H.264 encoder (WebCodecs), with Mediabunny writing
  the file around it. Loaded only when a video is made, as Mediabunny is large.
  Mediabunny is MPL-2.0: used as published, its files unchanged.
*/

/** No video side is longer than 4K. */
const MAX_VIDEO_SIDE = 3840;

/** H.264 at even sizes: the encoder works in blocks of two. */
const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

export const canEncodeAvc = (width: number, height: number) =>
  canEncodeVideo("avc", { width, height, bitrate: QUALITY_HIGH }).catch(() => false);

/** The largest size, up to the one asked for, that the encoder takes. */
const videoSize = async (width: number, height: number, scale: number) => {
  let ratio = Math.min(scale, MAX_VIDEO_SIDE / Math.max(width, height));
  for (let tries = 0; tries < 6; tries++) {
    const size = { width: even(width * ratio), height: even(height * ratio) };
    if (await canEncodeAvc(size.width, size.height)) return { ...size, ratio };
    ratio *= 0.75;
  }
  throw new Error("This system can't make an MP4 this size. Try a GIF.");
};

export const mp4Sink = async (canvas: { width: number; height: number }, scale: number, fps: number): Promise<FrameSink> => {
  const size = await videoSize(canvas.width, canvas.height, scale);
  const frame = document.createElement("canvas");
  frame.width = size.width;
  frame.height = size.height;
  const g = frame.getContext("2d");
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const source = new CanvasSource(frame, { codec: "avc", bitrate: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  return {
    ratio: size.ratio,
    add: async (picture, index) => {
      g?.clearRect(0, 0, frame.width, frame.height);
      g?.drawImage(picture, 0, 0, frame.width, frame.height);
      await source.add(frameTime(index, fps), 1 / fps);
    },
    finish: async () => {
      await output.finalize();
      const buffer = (output.target as BufferTarget).buffer;
      if (!buffer) throw new Error("The video came out empty.");
      return new Blob([buffer], { type: "video/mp4" });
    },
    cancel: () => void output.cancel(),
  };
};

