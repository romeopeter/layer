/**
 * Animation is settings, like everything else in a design. Nothing here is a
 * frame: frames are worked out from these at any moment, on screen and in export.
 */

/** How the whole design is filmed. The camera never pulls back past the canvas. */
export type CameraMove = "still" | "push-in" | "pull-back" | "drift" | "rise";

export type MotionStrength = "gentle" | "medium" | "strong";

/** How a move speeds up and slows down. */
export type MotionFeel = "smooth" | "steady" | "snappy";

/** A place the camera zooms into, as the middle of what it shows (0 to 1 of the canvas). */
export interface ZoomSpot {
  id: string;
  cx: number;
  cy: number;
  /** 1.25 to 4: how much closer than the whole canvas. */
  zoom: number;
}

/** The animation of the whole design. Saved with the project. */
export interface DesignMotion {
  camera: CameraMove;
  strength: MotionStrength;
  feel: MotionFeel;
  /** The clip's length in seconds. */
  length: number;
  /** Ends where it starts: the camera goes there and back, and objects leave the way they came. */
  loop: boolean;
  /** The background moves less than the design when the camera moves. */
  depth: boolean;
  spots: ZoomSpot[];
  /** The background keeps moving on its own. */
  liveBackground: boolean;
}

/** How an object comes in. Some are only for some objects: see `moves.ts`. */
export type EnterMove = "none" | "fade" | "rise" | "drop" | "slide" | "pop" | "grow" | "turn-in" | "type" | "draw";

/** How an object keeps moving once it's in. */
export type KeepMove = "none" | "float" | "pulse" | "sway" | "swing" | "orbit" | "spin";

/** One object's own moves. Saved with the object. */
export interface ElementMotion {
  enter: EnterMove;
  keep: KeepMove;
  /** When it starts coming in, in seconds from the clip's start. */
  start: number;
  /** How long coming in takes, in seconds. */
  takes: number;
}
