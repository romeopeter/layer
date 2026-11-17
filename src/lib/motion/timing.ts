import type { MotionFeel, MotionStrength } from "@/types/motion";

/** How time turns into progress. Each takes and gives 0 to 1. */
export const ease = (feel: MotionFeel, p: number) => {
  const x = clamp01(p);
  if (feel === "steady") return x;
  if (feel === "snappy") return 1 - (1 - x) ** 4;
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

/** Past the end and back: what makes a pop pop. */
export const overshoot = (p: number) => {
  const x = clamp01(p);
  const c = 1.70158;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
};

/** From 0 to 1 between two moments, eased at both ends. */
export const smoothstep = (from: number, to: number, x: number) => {
  if (to <= from) return x < from ? 0 : 1;
  const p = clamp01((x - from) / (to - from));
  return p * p * (3 - 2 * p);
};

export const AMOUNTS: Record<MotionStrength, number> = { gentle: 0.6, medium: 1, strong: 1.6 };

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** How many frames a clip has. A loop's last frame isn't its first again. */
export const frameCount = (length: number, fps: number) => Math.max(1, Math.round(length * fps));
export const frameTime = (index: number, fps: number) => index / fps;
