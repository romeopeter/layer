import type { ImageTilt } from "@/lib/tilt";
import type { Box, SolidShape } from "@/lib/mockups";
import { projectPoint, turnPoint, type TiltBox, type TurnPlane } from "@/lib/tiltRender";

/*
  A solid device in 3D, worked out without drawing anything: how deep it is, how round
  its edges are, its parts, and where it all lands once turned. The renderer builds
  exactly this, so the canvas holds just the device.

  Units are the image's own, y pointing down and z towards the viewer. A device's front
  is at z = 0, matching the flat mockup, and its depth goes back from there.

  Measured shapes (outline, corners, buttons, a laptop's base, a desktop's stand) come
  from the artwork through `npm run devices:sync`. Depths, angles and the camera on a
  phone's back are design choices, kept here.
*/

/** How deep a device is, against its own width. */
const DEPTH: Record<string, number> = {
  Phones: 0.105,
  Tablets: 0.034,
  Watches: 0.28,
  // A desktop's display.
  Computers: 0.03,
};

/** Devices unlike the rest of their group. */
const DEPTH_OF_DEVICE: Record<string, number> = {
  // Unfolded, it's thin.
  "iphone-duo": 0.045,
  "apple-watch-ultra": 0.32,
};

/** A laptop: a thin lid on a base this deep. */
const LID_DEPTH = 0.02;
const BASE_DEPTH = 0.68;

/** A desktop's foot reaches this far back, against the display's width. */
const FOOT_DEPTH = 0.3;

/**
 * How much further away a device is seen from than a flat picture of its size. A
 * laptop's base and a desktop's foot come towards the viewer, and seen as close as a
 * picture is, they'd look as if through a wide lens.
 */
const DISTANCE = { slab: 1, laptop: 2.6, desktop: 1.6 };

/** A rounded box. `z` is its front, and it goes back by `depth`. */
export interface Block {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  /** Its front shows that part of the flat mockup: a laptop's or desktop's own strip. */
  face?: boolean;
  /** Its top is a laptop's keyboard and trackpad. */
  deck?: boolean;
  /** Turned about a hinge running across at `y`, `z`. A positive angle takes its front down. */
  hinge?: { y: number; z: number; angle: number };
}

/** A flat cut-out of the flat mockup, at `z`: a desktop's stand, arms and all. */
export interface Cutout {
  box: Box;
  z: number;
}

/** A camera on a phone's or tablet's back: a raised plate with lenses, our own plain design. */
export interface Camera {
  box: Box;
  /** How far it stands out from the back. */
  height: number;
  lenses: { x: number; y: number; radius: number }[];
  /** A small light beside the lenses. */
  flash?: { x: number; y: number; radius: number };
}

/** A body, lid or display: a rounded outline, given depth, with rounded edges. */
export interface Slab {
  box: Box;
  /** Corner radii, top left going clockwise. */
  corners: number[];
  depth: number;
  /** How far its rounded edges reach in from the outline, and back from its faces. */
  inset: number;
  round: number;
}

export interface SolidModel {
  kind: SolidShape["kind"];
  body: Slab;
  blocks: Block[];
  cutouts: Cutout[];
  camera?: Camera;
  color: string;
}

/** Buttons, standing out from the body's sides. */
const buttonsOf = (shape: SolidShape, depth: number): Block[] => {
  const { body } = shape;
  const buttonDepth = depth * 0.34;
  const z = -depth / 2 + buttonDepth / 2;
  // Each is set into the side a little, so there's no seam where they meet.
  const tuck = depth * 0.15;
  return shape.buttons.map((button): Block => {
    const from = button.from;
    const size = button.to - button.from;
    switch (button.side) {
      case "left":
        return { x: body.x - button.out, y: from, z, width: button.out + tuck, height: size, depth: buttonDepth };
      case "right":
        return { x: body.x + body.width - tuck, y: from, z, width: button.out + tuck, height: size, depth: buttonDepth };
      case "top":
        return { x: from, y: body.y - button.out, z, width: size, height: button.out + tuck, depth: buttonDepth };
      case "bottom":
        return { x: from, y: body.y + body.height - tuck, z, width: size, height: button.out + tuck, depth: buttonDepth };
    }
  });
};

/**
 * The camera on the back, by the device's top right as seen from the front, which is
 * the back's top left. Phones get two lenses and a light; tablets, one lens.
 */
const cameraOf = (shape: SolidShape): Camera | undefined => {
  if (shape.group !== "Phones" && shape.group !== "Tablets") return undefined;
  const phone = shape.group === "Phones";
  const { body, across } = shape;
  const size = (phone ? 0.36 : 0.13) * across;
  const margin = (phone ? 0.07 : 0.05) * across;
  // On its side, its top right is the image's top left.
  const box = shape.turned
    ? { x: body.x + margin, y: body.y + margin, width: size, height: size }
    : { x: body.x + body.width - margin - size, y: body.y + margin, width: size, height: size };
  const at = (u: number, v: number, radius: number) => {
    // Turned a quarter anticlockwise with the device.
    const [x, y] = shape.turned ? [v, 1 - u] : [u, v];
    return { x: box.x + x * size, y: box.y + y * size, radius: radius * size };
  };
  return phone
    ? { box, height: 0, lenses: [at(0.7, 0.3, 0.2), at(0.7, 0.7, 0.2)], flash: at(0.28, 0.28, 0.07) }
    : { box, height: 0, lenses: [at(0.5, 0.5, 0.32)] };
};

/** The solid a device is built as, from its measured shape. */
export const solidModel = (shape: SolidShape): SolidModel => {
  const color = shape.color;

  if (shape.kind === "laptop" && shape.base) {
    const lidDepth = LID_DEPTH * shape.body.width;
    const depth = BASE_DEPTH * shape.body.width;
    const hinge = { y: shape.body.y + shape.body.height, z: -lidDepth };
    return {
      kind: "laptop",
      body: {
        box: shape.body,
        corners: shape.corners,
        depth: lidDepth,
        inset: Math.min(0.003 * shape.body.width, lidDepth * 0.3),
        round: lidDepth * 0.4,
      },
      blocks: [
        {
          // Level, it runs from the hinge towards the viewer; then it's turned down by
          // however far past upright the lid is open.
          x: shape.base.x,
          y: hinge.y,
          z: hinge.z + depth,
          width: shape.base.width,
          height: shape.base.height,
          depth,
          face: true,
          deck: true,
          hinge: { ...hinge, angle: ((shape.lidAngle - 90) * Math.PI) / 180 },
        },
      ],
      cutouts: [],
      color,
    };
  }

  if (shape.kind === "desktop" && shape.stand && shape.foot) {
    const depth = DEPTH.Computers * shape.body.width;
    const standZ = -depth * 0.5;
    const footDepth = FOOT_DEPTH * shape.body.width;
    return {
      kind: "desktop",
      body: {
        box: shape.body,
        corners: shape.corners,
        depth,
        inset: Math.min(0.003 * shape.body.width, depth * 0.3),
        round: depth * 0.3,
      },
      blocks: [
        {
          ...shape.foot,
          // Mostly in front of the stand, as a foot is.
          z: standZ + footDepth * 0.55,
          depth: footDepth,
          face: true,
        },
      ],
      // The stand down to its foot, cut out of the artwork, behind the display's middle.
      cutouts: [
        {
          box: { ...shape.stand, height: Math.max(0, shape.foot.y - shape.stand.y) },
          z: standZ,
        },
      ],
      color,
    };
  }

  const depth = (DEPTH_OF_DEVICE[shape.device] ?? DEPTH[shape.group] ?? DEPTH.Tablets) * shape.across;
  const camera = cameraOf(shape);
  return {
    kind: "slab",
    body: {
      box: shape.body,
      corners: shape.corners,
      depth,
      // Kept well clear of the screen, which starts further in than this on every device.
      inset: Math.min(0.008 * shape.across, depth * 0.35),
      round: depth * (shape.group === "Tablets" ? 0.3 : 0.42),
    },
    blocks: buttonsOf(shape, depth),
    cutouts: [],
    ...(camera ? { camera: { ...camera, height: depth * (shape.group === "Phones" ? 0.22 : 0.12) } } : {}),
    color,
  };
};

type Point = [number, number, number];

/** A point of a hinged block, from where it would be level. */
export const hingedPoint = (block: Block, [x, y, z]: Point): Point => {
  if (!block.hinge) return [x, y, z];
  const { y: hy, z: hz, angle } = block.hinge;
  const down = y - hy;
  const along = z - hz;
  return [x, hy + down * Math.cos(angle) + along * Math.sin(angle), hz - down * Math.sin(angle) + along * Math.cos(angle)];
};

const blockCorners = (block: Block): Point[] =>
  [0, 1].flatMap((i) =>
    [0, 1].flatMap((j) =>
      [0, 1].map(
        (k): Point => hingedPoint(block, [block.x + i * block.width, block.y + j * block.height, block.z - k * block.depth]),
      ),
    ),
  );

/** Points that enclose the whole device, at rest. */
export const hullOf = (model: SolidModel): Point[] => {
  const { box, depth } = model.body;
  const points = [...blockCorners({ ...box, z: 0, depth }), ...model.blocks.flatMap(blockCorners)];
  for (const { box: cut, z } of model.cutouts) {
    for (const x of [cut.x, cut.x + cut.width]) {
      for (const y of [cut.y, cut.y + cut.height]) points.push([x, y, z]);
    }
  }
  if (model.camera) {
    const { box: plate, height } = model.camera;
    // The lenses stand out a little further than their plate.
    points.push(...blockCorners({ ...plate, z: -depth, depth: height * 1.6 }));
  }
  return points;
};

/**
 * The turn a device is drawn with. Tipping a picture's top away is how a picture lying
 * on a table looks from above, and that's the view the same tilt gives a laptop or a
 * desktop: seen from above, standing on the desk. Turned the same way as a picture, its
 * top tipped away, it would be seen from below.
 */
export const solidTiltOf = (model: SolidModel, tilt: ImageTilt): ImageTilt =>
  model.kind === "slab" ? tilt : { ...tilt, tiltX: -tilt.tiltX };

/**
 * How the device is seen. On its own it turns about the middle of its depth, rather than
 * its front; to keep its front where the flat mockup has it at rest, it's moved back that
 * far and made larger by just as much as the distance makes it look smaller. On a tilted
 * layout it turns with the surface, its front on it, so it stays where the layout put it.
 */
export interface SolidView {
  /** From the eye to the plane it turns about. */
  distance: number;
  /** The middle of its depth, which it turns about. */
  middle: number;
  /** How much larger it's made. */
  grow: number;
}

export const solidViewOf = (model: SolidModel, tilt: ImageTilt, plane: TurnPlane): SolidView => {
  const distance = ((tilt.perspective * plane.span) / 720) * DISTANCE[model.kind];
  const zs = hullOf(model).map((point) => point[2]);
  const middle = plane.shared ? 0 : (Math.min(...zs) + Math.max(...zs)) / 2;
  return { distance, middle, grow: distance / Math.max(distance * 0.1, distance - middle) };
};

/** A point of the device, turned, relative to the point it turns about. */
export const placePoint = (view: SolidView, tilt: ImageTilt, plane: TurnPlane, [x, y, z]: Point) =>
  turnPoint(
    tilt,
    (x - plane.pivot.x) * view.grow,
    (y - plane.pivot.y) * view.grow,
    (z - view.middle) * view.grow,
    plane.spin,
  );

/** Where a point of the device lands once turned, in the image's own box. */
export const landPoint = (model: SolidModel, tilt: ImageTilt, plane: TurnPlane, point: Point) => {
  const view = solidViewOf(model, tilt, plane);
  return projectPoint(placePoint(view, solidTiltOf(model, tilt), plane, point), view.distance, plane.pivot);
};

/** The box the turned device fills, in the image's own box: where its picture goes. */
export const solidBoxOf = (model: SolidModel, tilt: ImageTilt, plane: TurnPlane): TiltBox => {
  const view = solidViewOf(model, tilt, plane);
  const turn = solidTiltOf(model, tilt);
  const landed = hullOf(model).map((point) => projectPoint(placePoint(view, turn, plane, point), view.distance, plane.pivot));
  const xs = landed.map((point) => point.x);
  const ys = landed.map((point) => point.y);
  const x = Math.floor(Math.min(...xs));
  const y = Math.floor(Math.min(...ys));
  return { x, y, width: Math.ceil(Math.max(...xs)) - x, height: Math.ceil(Math.max(...ys)) - y };
};
