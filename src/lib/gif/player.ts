import { useEditor } from "@/store/editor";
import { reducesMotion } from "@/lib/preferences";

/*
  Which frame each GIF on the canvas shows. While you edit, one shared ticker plays
  them all in step (on their first frame with Reduce motion). In the Animate preview
  and in exports, `poseStage` sets the moment instead, so every exported frame is
  exact; still exports hold them on their first frame.
*/

/** Shows the frame for `ms` milliseconds in. Cheap when that frame is already showing. */
export type ShowGifAt = (ms: number) => void;

const players = new Map<string, ShowGifAt>();
/** Something else (a preview, an export) is choosing the moment. */
let held = false;
let raf = 0;
const start = performance.now();

const liveMoment = () => (reducesMotion(useEditor.getState().preferences) ? 0 : performance.now() - start);

const tick = () => {
  raf = 0;
  if (players.size === 0) return;
  if (!held) {
    const ms = liveMoment();
    players.forEach((show) => show(ms));
  }
  raf = requestAnimationFrame(tick);
};

/** A GIF on the canvas, shown at the live moment until it unregisters. */
export const registerGifPlayer = (id: string, show: ShowGifAt) => {
  players.set(id, show);
  show(held ? 0 : liveMoment());
  if (!raf) raf = requestAnimationFrame(tick);
  return () => {
    if (players.get(id) === show) players.delete(id);
  };
};

/** Every GIF at one moment of the animation, for a preview or an export frame. */
export const showGifsAt = (ms: number) => {
  held = true;
  players.forEach((show) => show(ms));
};

/** Back to playing live. */
export const resumeGifs = () => {
  held = false;
};

/** Holds every GIF on its first frame, as a still export shows it. Returns how to let go. */
export const holdGifsOnFirstFrame = () => {
  const wasHeld = held;
  showGifsAt(0);
  return () => {
    held = wasHeld;
  };
};
