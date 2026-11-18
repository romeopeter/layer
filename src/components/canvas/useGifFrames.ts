import { useEffect, useRef, useState } from "react";
import type { ImageElement } from "@/types";
import { useEditor } from "@/store/editor";
import {
  acquireAnimation,
  frameIndexAt,
  isGifSource,
  releaseAnimation,
  type GifAnimation,
} from "@/lib/gif/frames";
import { registerGifPlayer } from "@/lib/gif/player";

interface Decoded {
  src: string;
  animation: GifAnimation;
  /** Where the current frame is drawn: what the image node shows. */
  canvas: HTMLCanvasElement;
}

const frameCanvasFor = (animation: GifAnimation) => {
  const canvas = document.createElement("canvas");
  canvas.width = animation.width;
  canvas.height = animation.height;
  return canvas;
};

const paint = (canvas: HTMLCanvasElement, frame: ImageBitmap) => {
  const g = canvas.getContext("2d");
  g?.clearRect(0, 0, canvas.width, canvas.height);
  g?.drawImage(frame, 0, 0);
};

/** Records on the element whether it's an animated GIF. Silently: it's not an edit. */
const record = (id: string, gif: ImageElement["gif"]) => {
  const now = useEditor.getState().elements.find((entry) => entry.id === id);
  if (now?.type !== "image") return;
  if (now.gif?.frames === gif?.frames && now.gif?.duration === gif?.duration) return;
  useEditor.getState().setGifInfo(id, gif);
};

/**
 * An animated GIF's current frame, drawn into a canvas of its own that the image
 * node shows in place of the still picture. The GIF player (lib/gif/player.ts)
 * chooses the moment; `onFrame` runs whenever a different frame lands, since Konva
 * can't see a canvas change. Null for anything that isn't an animated GIF.
 */
export const useGifFrames = (el: ImageElement, onFrame: () => void) => {
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  });

  const { id, src } = el;
  const gifSource = isGifSource(src);

  // Decoded once per file.
  useEffect(() => {
    if (!gifSource) {
      record(id, undefined);
      return;
    }
    let current = true;
    void acquireAnimation(src).then((animation) => {
      if (!current) return;
      setDecoded(animation ? { src, animation, canvas: frameCanvasFor(animation) } : null);
      record(id, animation ? { frames: animation.frames.length, duration: animation.duration } : undefined);
    });
    return () => {
      current = false;
      releaseAnimation(src);
    };
  }, [id, src, gifSource]);

  // A replaced picture stops showing the old GIF at once.
  const shown = decoded && decoded.src === src ? decoded : null;

  // Kept true if the element's record changes without the picture changing (a
  // project opened over the same one, undo past it).
  const frames = el.gif?.frames;
  const duration = el.gif?.duration;
  useEffect(() => {
    if (shown && (frames !== shown.animation.frames.length || duration !== shown.animation.duration)) {
      record(id, { frames: shown.animation.frames.length, duration: shown.animation.duration });
    }
  }, [shown, frames, duration, id]);

  // Shown by the player, live or at a moment of the animation.
  useEffect(() => {
    if (!shown) return;
    let index = -1;
    return registerGifPlayer(id, (ms) => {
      const next = frameIndexAt(shown.animation, ms);
      if (next === index) return;
      index = next;
      paint(shown.canvas, shown.animation.frames[next].bitmap);
      onFrameRef.current();
    });
  }, [shown, id]);

  return shown ? { canvas: shown.canvas, animation: shown.animation } : null;
};
