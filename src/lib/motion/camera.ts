import type { DesignMotion, ZoomSpot } from "@/types/motion";
import { AMOUNTS, clamp01, ease, lerp } from "./timing";

/**
 * What the camera shows: the middle of its window, as 0 to 1 of the canvas, and
 * how much closer than the whole canvas it is. Zoom is never below 1, so the
 * canvas is always filled and an export never shows past the design's edge.
 */
export interface View {
  cx: number;
  cy: number;
  zoom: number;
}

export const WIDE: View = { cx: 0.5, cy: 0.5, zoom: 1 };

/** Keeps the window inside the canvas. */
export const clampView = (view: View): View => {
  const zoom = Math.max(1, view.zoom);
  const half = 0.5 / zoom;
  return {
    zoom,
    cx: Math.min(1 - half, Math.max(half, view.cx)),
    cy: Math.min(1 - half, Math.max(half, view.cy)),
  };
};

/** Zoom changes by ratio, so a zoom from 1× to 4× feels even all the way. */
const between = (a: View, b: View, p: number): View => ({
  cx: lerp(a.cx, b.cx, p),
  cy: lerp(a.cy, b.cy, p),
  zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), p)),
});

/**
 * How far along a one-way move is. Looping, it goes there and back so the end
 * meets the start; otherwise it arrives a little early and holds.
 */
export const travel = (motion: DesignMotion, t: number) => {
  const x = clamp01(t / motion.length);
  if (motion.loop) return x < 0.5 ? ease(motion.feel, x * 2) : ease(motion.feel, 2 - x * 2);
  return ease(motion.feel, x / 0.85);
};

/** The camera move alone, with `focus` as the main picture's middle. */
const moveView = (motion: DesignMotion, focus: { x: number; y: number }, p: number): View => {
  const amount = AMOUNTS[motion.strength];
  switch (motion.camera) {
    case "push-in":
    case "pull-back": {
      const q = motion.camera === "push-in" ? p : 1 - p;
      return { cx: lerp(0.5, focus.x, q), cy: lerp(0.5, focus.y, q), zoom: 1 + 0.15 * amount * q };
    }
    case "drift":
    case "rise": {
      const zoom = 1 + 0.08 * amount;
      const room = ((1 - 1 / zoom) / 2) * 0.9;
      const along = lerp(-room, room, p);
      return motion.camera === "drift"
        ? { cx: 0.5 + along, cy: 0.5, zoom }
        : { cx: 0.5, cy: 0.5 - along, zoom };
    }
    default:
      return WIDE;
  }
};

/**
 * Zoom spots, in turn: in from wide, hold, on to the next, and back out if it
 * loops. A move takes one unit of time and a hold two.
 */
export const spotView = (motion: DesignMotion, t: number): View => {
  const spots: ZoomSpot[] = motion.spots;
  if (spots.length === 0) return WIDE;
  const views: View[] = spots.map((spot) => clampView({ cx: spot.cx, cy: spot.cy, zoom: spot.zoom }));
  const units = spots.length * 3 + (motion.loop ? 1 : 0);
  let at = (clamp01(t / motion.length) * units);
  let from = WIDE;
  for (const view of views) {
    if (at < 1) return between(from, view, ease(motion.feel, at));
    at -= 1;
    if (at < 2) return view;
    at -= 2;
    from = view;
  }
  return motion.loop ? between(from, WIDE, ease(motion.feel, at)) : from;
};

/** A view inside another: the move happens within whatever the zoom spots show. */
const within = (outer: View, inner: View): View => ({
  zoom: outer.zoom * inner.zoom,
  cx: outer.cx + (inner.cx - 0.5) / outer.zoom,
  cy: outer.cy + (inner.cy - 0.5) / outer.zoom,
});

/** What the camera shows at time `t`. */
export const cameraAt = (motion: DesignMotion, focus: { x: number; y: number }, t: number): View => {
  const move = motion.camera === "still" ? WIDE : moveView(motion, focus, travel(motion, t));
  return clampView(within(spotView(motion, t), move));
};

/** How deep the background sits: it moves this share of what the design does. */
const DEPTH = 0.35;

/** The background's view: the same, or with depth, pulled toward the middle. */
export const backgroundViewOf = (view: View, depth: boolean): View =>
  depth
    ? clampView({
        cx: 0.5 + (view.cx - 0.5) * DEPTH,
        cy: 0.5 + (view.cy - 0.5) * DEPTH,
        zoom: 1 + (view.zoom - 1) * DEPTH,
      })
    : view;

/** As a transform of what's in the canvas, in canvas pixels. */
export const viewTransform = (view: View, width: number, height: number) => ({
  scaleX: view.zoom,
  scaleY: view.zoom,
  x: width / 2 - view.cx * width * view.zoom,
  y: height / 2 - view.cy * height * view.zoom,
});
