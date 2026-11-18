import type { ImageTilt } from "@/lib/tilt";
import type { Box, SolidShape } from "@/lib/mockups";
import { perspectiveOf, projectPoint, turnPoint, type TiltBox } from "@/lib/tiltRender";

/*
  A solid device in 3D, worked out without drawing anything: how deep it is, how round
  its edges are, its buttons, a laptop's base, and where it all lands once turned. The
  renderer builds exactly this, so the canvas holds just the device.

  Units are the image's own, y pointing down and z towards the viewer. A device's front
  is at z = 0, matching the flat mockup, and its depth goes back from there.

  Measured shapes (outline, corners, buttons, base) come from the artwork through
  `npm run devices:sync`. Depths and angles are design choices, kept here.
*/

/** How deep a device is, against its own width. */
const DEPTH: Record<string, number> = {
  Phones: 0.105,
  Tablets: 0.034,
};

/** Devices unlike the rest of their group: an unfolded phone is thin. */
const DEPTH_OF_DEVICE: Record<string, number> = {
  "iphone-duo": 0.045,
};

/** A laptop: a thin lid, open a little past upright, on a base this deep. */
const LID_DEPTH = 0.02;
const BASE_DEPTH = 0.68;
const LID_OPEN = (102 * Math.PI) / 180;

/**
 * How much further away a laptop is seen from than a flat picture of its size. Its base
 * comes as far towards the viewer as its lid is tall, and seen as close as a picture is,
 * it would look as if through a wide lens.
 */
const DISTANCE = { slab: 1, laptop: 2.6 };

/** A box in 3D: `z` is its front, and it goes back by `depth`. */
export interface Block {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
}

/** A body or lid: a rounded outline, given depth, with rounded edges. */
export interface Slab {
  box: Box;
  /** Corner radii, top left going clockwise. */
  corners: number[];
  depth: number;
  /** How far its rounded edges reach in from the outline, and back from its faces. */
  inset: number;
  round: number;
}

export interface LaptopBase {
  /** Its front strip as the artwork shows it: across, and its thickness down. */
  box: Box;
  /** From the hinge to its front. */
  depth: number;
  /** Down from level, towards the viewer. */
  drop: number;
  /** The hinge: the lid's bottom edge, at the back of the lid. */
  hinge: { y: number; z: number };
}

export interface SolidModel {
  kind: SolidShape["kind"];
  body: Slab;
  buttons: Block[];
  base?: LaptopBase;
  color: string;
}

/** The solid a device is built as, from its measured shape. */
export const solidModel = (shape: SolidShape): SolidModel => {
  if (shape.kind === "laptop" && shape.base) {
    const lidDepth = LID_DEPTH * shape.body.width;
    return {
      kind: "laptop",
      body: {
        box: shape.body,
        corners: shape.corners,
        depth: lidDepth,
        inset: Math.min(0.003 * shape.body.width, lidDepth * 0.3),
        round: lidDepth * 0.4,
      },
      buttons: [],
      base: {
        box: shape.base,
        depth: BASE_DEPTH * shape.body.width,
        drop: LID_OPEN - Math.PI / 2,
        hinge: { y: shape.body.y + shape.body.height, z: -lidDepth },
      },
      color: shape.color,
    };
  }

  const depth = (DEPTH_OF_DEVICE[shape.device] ?? DEPTH[shape.group] ?? DEPTH.Tablets) * shape.across;
  const { body } = shape;
  const buttonDepth = depth * 0.34;
  const buttonZ = -depth / 2 + buttonDepth / 2;
  // Each button is set into the side a little, so there's no seam where they meet.
  const tuck = depth * 0.15;
  const buttons = shape.buttons.map((button): Block => {
    const along = { from: button.from, size: button.to - button.from };
    switch (button.side) {
      case "left":
        return { x: body.x - button.out, y: along.from, z: buttonZ, width: button.out + tuck, height: along.size, depth: buttonDepth };
      case "right":
        return { x: body.x + body.width - tuck, y: along.from, z: buttonZ, width: button.out + tuck, height: along.size, depth: buttonDepth };
      case "top":
        return { x: along.from, y: body.y - button.out, z: buttonZ, width: along.size, height: button.out + tuck, depth: buttonDepth };
      case "bottom":
        return { x: along.from, y: body.y + body.height - tuck, z: buttonZ, width: along.size, height: button.out + tuck, depth: buttonDepth };
    }
  });
  return {
    kind: "slab",
    body: {
      box: body,
      corners: shape.corners,
      depth,
      // Kept well clear of the screen, which starts further in than this on every device.
      inset: Math.min(0.008 * shape.across, depth * 0.35),
      round: depth * (shape.group === "Phones" ? 0.42 : 0.3),
    },
    buttons,
    color: shape.color,
  };
};

type Point = [number, number, number];

/**
 * The turn a device is drawn with. Tipping a picture's top away is how a picture lying
 * on a table looks from above, and that's the view the same tilt gives a laptop: seen
 * from above, its keyboard in view. Turned the same way as a picture, its top tipped
 * away, it would be seen from below.
 */
export const solidTiltOf = (model: SolidModel, tilt: ImageTilt): ImageTilt =>
  model.kind === "laptop" ? { ...tilt, tiltX: -tilt.tiltX } : tilt;

/** A laptop base's point: `along` from the hinge towards its front, `down` through it. */
export const basePoint = (base: LaptopBase, x: number, along: number, down: number): Point => [
  x,
  base.hinge.y + along * Math.sin(base.drop) + down * Math.cos(base.drop),
  base.hinge.z + along * Math.cos(base.drop) - down * Math.sin(base.drop),
];

const blockCorners = (block: Block): Point[] =>
  [0, 1].flatMap((i) =>
    [0, 1].flatMap((j) =>
      [0, 1].map((k): Point => [block.x + i * block.width, block.y + j * block.height, block.z - k * block.depth]),
    ),
  );

/** Points that enclose the whole device, at rest. */
export const hullOf = (model: SolidModel): Point[] => {
  const { box, depth } = model.body;
  const points = [...blockCorners({ ...box, z: 0, depth }), ...model.buttons.flatMap(blockCorners)];
  const { base } = model;
  if (base) {
    for (const x of [base.box.x, base.box.x + base.box.width]) {
      for (const along of [0, base.depth]) {
        for (const down of [0, base.box.height]) points.push(basePoint(base, x, along, down));
      }
    }
  }
  return points;
};

/**
 * How the device is seen. It turns about its own middle, front to back, rather than its
 * front; to keep its front where the flat mockup has it at rest, it's moved back that far
 * and made larger by just as much as the distance makes it look smaller.
 */
export interface SolidView {
  /** From the eye to the image's plane. */
  distance: number;
  /** The middle of its depth, which it turns about. */
  middle: number;
  /** How much larger it's made. */
  grow: number;
}

export const solidViewOf = (model: SolidModel, tilt: ImageTilt, width: number, height: number): SolidView => {
  const distance = perspectiveOf(tilt, width, height) * DISTANCE[model.kind];
  const zs = hullOf(model).map((point) => point[2]);
  const middle = (Math.min(...zs) + Math.max(...zs)) / 2;
  return { distance, middle, grow: distance / Math.max(distance * 0.1, distance - middle) };
};

/** A point of the device, turned, relative to the image's centre. */
export const placePoint = (view: SolidView, tilt: ImageTilt, width: number, height: number, [x, y, z]: Point) =>
  turnPoint(
    tilt,
    (x - width / 2) * view.grow,
    (y - height / 2) * view.grow,
    (z - view.middle) * view.grow,
  );

/** The box the turned device fills, in the image's own box: where its picture goes. */
export const solidBoxOf = (model: SolidModel, tilt: ImageTilt, width: number, height: number): TiltBox => {
  const view = solidViewOf(model, tilt, width, height);
  const turn = solidTiltOf(model, tilt);
  const landed = hullOf(model).map((point) =>
    projectPoint(placePoint(view, turn, width, height, point), view.distance, width, height),
  );
  const xs = landed.map((point) => point.x);
  const ys = landed.map((point) => point.y);
  const x = Math.floor(Math.min(...xs));
  const y = Math.floor(Math.min(...ys));
  return { x, y, width: Math.ceil(Math.max(...xs)) - x, height: Math.ceil(Math.max(...ys)) - y };
};
