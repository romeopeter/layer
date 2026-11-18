import type { ImageElement } from "@/types";
import type { LayoutSurface } from "@/lib/layouts";
import { isImageTiltActive, parseImageTilt, type ImageTilt } from "@/lib/tilt";
import { planeFrom, type TurnPlane } from "@/lib/tiltRender";

/** How an image is turned in 3D: by its own tilt, about its middle, or with its tilted layout. */
export interface ImageTurn {
  tilt: ImageTilt;
  /** A tilted layout's surface, in the image's own units. Its own middle when unset. */
  plane?: TurnPlane;
}

/**
 * How an image is turned, if at all. In a tilted layout it takes the layout's tilt and
 * turns as part of its surface; its own tilt waits, kept, until the layout is flat again.
 */
export const imageTurnOf = (el: ImageElement, surface: LayoutSurface | null | undefined): ImageTurn | null => {
  if (surface) return { tilt: { ...surface.tilt, scale: 1 }, plane: planeFrom(surface.pivot, surface.span, el) };
  return isImageTiltActive(el.transform) ? { tilt: parseImageTilt(el.transform) } : null;
};

/** A turn taken further by an animation's pose. */
export const turnedFurther = (turn: ImageTurn, turnX: number, turnY: number): ImageTurn => ({
  ...turn,
  tilt: { ...turn.tilt, tiltX: turn.tilt.tiltX + turnX, tiltY: turn.tilt.tiltY + turnY },
});
