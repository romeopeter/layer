import { useEditor } from "@/store/editor";
import { getStage } from "@/components/canvas/stageRef";
import { poseStage, restStage, type MotionScene } from "./pose";
import { releaseTiltPictures } from "@/lib/tiltRender";

/**
 * Playing the animation on the canvas. The time lives here, outside the store:
 * it changes every frame, and the store is the document, where every change is
 * an undo step. `previewing` in the store says only that the canvas is showing
 * a moment of the animation rather than the design at rest, so it's view-only.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let time = 0;
let playing = false;
let frame = 0;
let raf = 0;
let last = 0;

const emit = () => listeners.forEach((listener) => listener());

const sceneNow = (): MotionScene => {
  const { canvas, background, elements, motion } = useEditor.getState();
  return { canvas, background, elements, motion };
};

const draw = () => {
  const stage = getStage();
  if (!stage) return;
  // Anything drawn later (a live pattern's tile) redraws its own layer when it's ready.
  void poseStage(stage, sceneNow(), time, { scale: 1, frame, preview: true });
  stage.batchDraw();
};

const rest = () => {
  const stage = getStage();
  if (!stage) return;
  restStage(stage, sceneNow(), { scale: 1, frame, preview: true });
  stage.batchDraw();
};

const tick = (now: number) => {
  const { length } = useEditor.getState().motion;
  time = (time + Math.min(0.1, (now - last) / 1000)) % length;
  last = now;
  frame += 1;
  draw();
  emit();
  raf = requestAnimationFrame(tick);
};

/** Shows a moment of the animation: the canvas can't be edited until it's stopped. */
const startPreview = () => {
  const state = useEditor.getState();
  if (!state.previewing) {
    useEditor.setState({ previewing: true, editingId: null, cropId: null, markTool: null });
  }
};

export const playback = {
  time: () => time,
  isPlaying: () => playing,

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  play: () => {
    if (playing || !getStage()) return;
    startPreview();
    playing = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
    emit();
  },

  pause: () => {
    if (!playing) return;
    playing = false;
    cancelAnimationFrame(raf);
    emit();
  },

  toggle: () => (playing ? playback.pause() : playback.play()),

  /** Shows the moment `t` seconds in, paused. */
  seek: (t: number) => {
    playback.pause();
    startPreview();
    const { length } = useEditor.getState().motion;
    time = Math.min(Math.max(0, t), length);
    draw();
    emit();
  },

  /** Back to editing, with everything where the design has it. */
  stop: () => {
    if (useEditor.getState().previewing) useEditor.setState({ previewing: false });
  },
};

// The store's `previewing` is the one switch: anything that turns it off (Stop,
// opening another project) ends playback and puts the canvas back at rest.
useEditor.subscribe((state, previous) => {
  if (previous.previewing && !state.previewing) {
    playing = false;
    cancelAnimationFrame(raf);
    time = 0;
    frame = 0;
    rest();
    emit();
    return;
  }
  // A picture kept on the GPU for the preview may have just been edited.
  if (state.previewing && state.elements !== previous.elements) releaseTiltPictures();
  // Paused on a moment, a change to the design shows at that moment. Playing,
  // the next frame shows it anyway.
  if (
    state.previewing &&
    !playing &&
    (state.elements !== previous.elements ||
      state.motion !== previous.motion ||
      state.background !== previous.background ||
      state.canvas !== previous.canvas)
  ) {
    requestAnimationFrame(draw);
  }
});
