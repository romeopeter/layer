import type { BackgroundState, LayerElement } from "@/types";
import type { DesignMotion, ElementMotion, ZoomSpot } from "@/types/motion";
import { CAMERA_MOVES, ENTER_MOVES, FEELS, KEEP_MOVES, STRENGTHS } from "./moves";

export const MIN_LENGTH = 2;
export const MAX_LENGTH = 15;
export const MIN_TAKES = 0.3;
export const MAX_TAKES = 2;
export const MAX_SPOTS = 4;
export const MIN_SPOT_ZOOM = 1.25;
export const MAX_SPOT_ZOOM = 4;

export const DEFAULT_MOTION: DesignMotion = {
  camera: "still",
  strength: "medium",
  feel: "smooth",
  length: 6,
  loop: true,
  depth: true,
  spots: [],
  liveBackground: false,
};

export const DEFAULT_ELEMENT_MOTION: ElementMotion = { enter: "none", keep: "none", start: 0, takes: 0.8 };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numberIn = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

const oneOf = <Id extends string>(list: { id: Id }[], value: unknown, fallback: Id): Id =>
  list.find((entry) => entry.id === value)?.id ?? fallback;

const normaliseSpot = (value: unknown, index: number): ZoomSpot | null => {
  if (!isObject(value)) return null;
  return {
    id: typeof value.id === "string" && value.id ? value.id : `spot-${index}`,
    cx: numberIn(value.cx, 0, 1, 0.5),
    cy: numberIn(value.cy, 0, 1, 0.5),
    zoom: numberIn(value.zoom, MIN_SPOT_ZOOM, MAX_SPOT_ZOOM, 2),
  };
};

/** A design's animation from a file, which may be older, newer or damaged. */
export const normaliseMotion = (value: unknown): DesignMotion => {
  if (!isObject(value)) return DEFAULT_MOTION;
  const d = DEFAULT_MOTION;
  return {
    camera: oneOf(CAMERA_MOVES, value.camera, d.camera),
    strength: oneOf(STRENGTHS, value.strength, d.strength),
    feel: oneOf(FEELS, value.feel, d.feel),
    length: numberIn(value.length, MIN_LENGTH, MAX_LENGTH, d.length),
    loop: typeof value.loop === "boolean" ? value.loop : d.loop,
    depth: typeof value.depth === "boolean" ? value.depth : d.depth,
    spots: Array.isArray(value.spots)
      ? value.spots.flatMap((spot, i) => normaliseSpot(spot, i) ?? []).slice(0, MAX_SPOTS)
      : [],
    liveBackground: value.liveBackground === true,
  };
};

/** An object's own moves from a file. Absent or still means no moves. */
export const normaliseElementMotion = (value: unknown): ElementMotion | undefined => {
  if (!isObject(value)) return undefined;
  const motion: ElementMotion = {
    enter: oneOf(ENTER_MOVES, value.enter, "none"),
    keep: oneOf(KEEP_MOVES, value.keep, "none"),
    start: numberIn(value.start, 0, MAX_LENGTH, 0),
    takes: numberIn(value.takes, MIN_TAKES, MAX_TAKES, DEFAULT_ELEMENT_MOTION.takes),
  };
  return motion.enter === "none" && motion.keep === "none" ? undefined : motion;
};

/**
 * The clip length that holds a whole number of a GIF's loops, at least the shortest
 * clip, so the GIF and the clip end together and a video repeats without a jump.
 */
export const lengthForGif = (duration: number) => {
  const loop = duration / 1000;
  const times = Math.max(1, Math.ceil(MIN_LENGTH / loop - 1e-9));
  return Math.min(MAX_LENGTH, Math.round(loop * times * 1000) / 1000);
};

/** An animated GIF that's showing: it plays, so the design moves. */
export const isPlayingGif = (el: LayerElement) => el.type === "image" && !el.hidden && (el.gif?.frames ?? 0) > 1;

export const movesOnItsOwn = (el: LayerElement) =>
  !el.hidden && !!el.motion && (el.motion.enter !== "none" || el.motion.keep !== "none");

/** Whether the background has anything that can move. A plain colour with no grain hasn't. */
export const backgroundCanMove = (background: BackgroundState) =>
  background.mode !== "solid" || background.effects.grain > 0;

export const cameraMoves = (motion: DesignMotion) => motion.camera !== "still" || motion.spots.length > 0;

/** Whether anything in the design moves at all, which is when there's something to play or export. */
export const hasMotion = (motion: DesignMotion, elements: LayerElement[], background: BackgroundState) =>
  cameraMoves(motion) ||
  (motion.liveBackground && backgroundCanMove(background)) ||
  elements.some((el) => movesOnItsOwn(el) || isPlayingGif(el));
