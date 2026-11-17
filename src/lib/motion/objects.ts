import type { LayerElement } from "@/types";
import type { DesignMotion, EnterMove, KeepMove } from "@/types/motion";
import { enterFor, keepFor, objectKindOf } from "./moves";
import { clamp01, ease, overshoot, smoothstep } from "./timing";

/** Where an object is, against where it rests. Distances are in canvas pixels. */
export interface ObjectPose {
  dx: number;
  dy: number;
  /** Degrees, added to its own. */
  rotation: number;
  scale: number;
  /** Multiplies its own. */
  opacity: number;
  /** Degrees of 3D turn, added to a picture's own tilt. */
  tiltX: number;
  tiltY: number;
  /** How much of a typed text or drawn line shows, 0 to 1. */
  reveal: number;
}

export const REST_POSE: ObjectPose = { dx: 0, dy: 0, rotation: 0, scale: 1, opacity: 1, tiltX: 0, tiltY: 0, reveal: 1 };

export interface PoseContext {
  /** The canvas's shorter side, which sets how far things travel. */
  unit: number;
  /** Its place in the stacking order, so objects that keep moving aren't in step. */
  index: number;
  /** Whether it can turn in 3D: an unframed picture where WebGL works. */
  canTilt: boolean;
}

/** How long a keep move's cycle is, roughly, in seconds. Each clip holds whole cycles. */
const PERIODS: Record<Exclude<KeepMove, "none">, number> = {
  float: 3,
  pulse: 2,
  sway: 3,
  swing: 4,
  orbit: 5,
  spin: 6,
};

/** How long a keep move takes to start, so it doesn't jump in. */
const SETTLE = 0.6;

/** The timing an object's moves fit into: with a loop, they come in and go out again. */
const fitted = (start: number, takes: number, motion: DesignMotion) => {
  if (!motion.loop) return { start: Math.min(start, Math.max(0, motion.length - takes)), takes: Math.min(takes, motion.length) };
  const half = motion.length / 2;
  const fitTakes = Math.min(takes, half);
  return { start: Math.min(start, Math.max(0, half - fitTakes)), takes: fitTakes };
};

/** How far in an object is, 0 to 1, before easing. With a loop it leaves the way it came. */
const entered = (start: number, takes: number, motion: DesignMotion, t: number) => {
  const coming = clamp01((t - start) / takes);
  if (!motion.loop) return coming;
  const going = clamp01((motion.length - start - t) / takes);
  return Math.min(coming, going);
};

const enterPose = (move: EnterMove, raw: number, feel: DesignMotion["feel"], unit: number): Partial<ObjectPose> => {
  const e = ease(feel, raw);
  const q = 1 - e;
  switch (move) {
    case "fade":
      return { opacity: e };
    case "rise":
      return { opacity: e, dy: q * 0.08 * unit };
    case "drop":
      return { opacity: e, dy: -q * 0.08 * unit };
    case "slide":
      return { opacity: e, dx: -q * 0.14 * unit };
    case "pop":
      return { opacity: clamp01(raw * 2.5), scale: 0.6 + 0.4 * overshoot(raw) };
    case "grow":
      return { opacity: clamp01(raw * 4), scale: Math.max(0.001, e) };
    case "turn-in":
      return { opacity: clamp01(raw * 2), tiltX: 35 * q, tiltY: -20 * q, scale: 0.9 + 0.1 * e };
    case "type":
      return { reveal: raw };
    case "draw":
      return { reveal: e };
    default:
      return {};
  }
};

const keepPose = (move: KeepMove, phase: number, unit: number): Partial<ObjectPose> => {
  const wave = Math.sin(phase * Math.PI * 2);
  switch (move) {
    case "float":
      return { dy: -wave * 0.015 * unit };
    case "pulse":
      return { scale: 1 + 0.04 * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2)) };
    case "sway":
      return { rotation: 3 * wave };
    case "swing":
      return { tiltY: 14 * wave };
    case "orbit":
      return { tiltX: 9 * wave, tiltY: 9 * Math.cos(phase * Math.PI * 2) };
    default:
      return {};
  }
};

/** A 3D move on something that can't turn in 3D, in 2D. */
const flatten = (pose: ObjectPose, unit: number): ObjectPose => {
  if (pose.tiltX === 0 && pose.tiltY === 0) return pose;
  return {
    ...pose,
    // A small circle for an orbit, a rock for a swing, a lean for turning in.
    dx: pose.dx + (pose.tiltX / 9) * 0.004 * unit,
    dy: pose.dy - (pose.tiltY / 9) * 0.004 * unit,
    rotation: pose.rotation + pose.tiltY * 0.2,
    tiltX: 0,
    tiltY: 0,
  };
};

const combine = (a: ObjectPose, b: Partial<ObjectPose>, weight = 1): ObjectPose => ({
  dx: a.dx + (b.dx ?? 0) * weight,
  dy: a.dy + (b.dy ?? 0) * weight,
  rotation: a.rotation + (b.rotation ?? 0) * weight,
  scale: a.scale * (1 + ((b.scale ?? 1) - 1) * weight),
  opacity: a.opacity * (b.opacity ?? 1),
  tiltX: a.tiltX + (b.tiltX ?? 0) * weight,
  tiltY: a.tiltY + (b.tiltY ?? 0) * weight,
  reveal: Math.min(a.reveal, b.reveal ?? 1),
});

/** Where an object is at time `t`, against where it rests. Null when it doesn't move. */
export const objectPoseAt = (
  el: LayerElement,
  motion: DesignMotion,
  t: number,
  context: PoseContext,
): ObjectPose | null => {
  const own = el.motion;
  if (!own || el.hidden) return null;
  const kind = objectKindOf(el);
  const enter = enterFor(kind, own.enter);
  const keep = keepFor(kind, own.keep);
  if (enter === "none" && keep === "none") return null;

  const { unit } = context;
  const { start, takes } = fitted(own.start, own.takes, motion);
  let pose = REST_POSE;

  if (enter !== "none") {
    pose = combine(pose, enterPose(enter, entered(start, takes, motion, t), motion.feel, unit));
  }

  if (keep !== "none") {
    const cycles = Math.max(1, Math.round(motion.length / PERIODS[keep]));
    const phase = (t / motion.length) * cycles + ((context.index * 0.17) % 1);
    if (keep === "spin") {
      // A spin doesn't ease in: unwinding at the end would turn it backwards.
      pose = combine(pose, { rotation: 360 * ((t / motion.length) * cycles) });
    } else {
      // Starts once it's in, and with a loop, stops before it leaves, so the ends meet.
      const begin = enter === "none" ? 0 : start + takes;
      const end = enter === "none" || !motion.loop ? Infinity : motion.length - start - takes;
      const weight =
        enter === "none"
          ? 1
          : Math.min(smoothstep(begin, begin + SETTLE, t), end === Infinity ? 1 : 1 - smoothstep(end - SETTLE, end, t));
      pose = combine(pose, keepPose(keep, phase, unit), weight);
    }
  }

  return context.canTilt ? pose : flatten(pose, unit);
};

/** Whether an object at rest and at `t` look the same: nothing to draw differently. */
export const isRest = (pose: ObjectPose) =>
  pose.dx === 0 &&
  pose.dy === 0 &&
  pose.rotation === 0 &&
  pose.scale === 1 &&
  pose.opacity === 1 &&
  pose.tiltX === 0 &&
  pose.tiltY === 0 &&
  pose.reveal === 1;
