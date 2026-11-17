import type Konva from "konva";
import type { BackgroundState, CanvasSize, LayerElement } from "@/types";
import type { DesignMotion } from "@/types/motion";
import { backgroundViewOf, cameraAt, viewTransform, WIDE } from "./camera";
import { objectPoseAt, type ObjectPose } from "./objects";
import { backgroundCanMove } from "./normalise";
import { releaseTiltPictures } from "@/lib/tiltRender";
import { resumeGifs, showGifsAt } from "@/lib/gif/player";
import { cardIdOf } from "@/lib/layouts";

/**
 * Puts the canvas in its pose at a moment of the animation, straight onto the
 * Konva nodes. The store is never written: every write is an undo step, and
 * nodes only re-render when their element changes, so a pose lasts until
 * `restStage` takes it off.
 */

/** Konva name of the group that holds the elements and moves as the camera does. */
export const CAMERA_GROUP_NAME = "motion-camera";
/** Konva name of the group that holds the background, which moves less with depth. */
export const BACKGROUND_CAMERA_NAME = "motion-background";

export interface MotionScene {
  canvas: CanvasSize;
  background: BackgroundState;
  elements: LayerElement[];
  motion: DesignMotion;
}

export interface PoseOptions {
  /** How many pixels per canvas pixel the result is drawn at, for painters that draw their own. */
  scale: number;
  /** Which frame this is, for anything that changes every frame, such as grain. */
  frame: number;
  /** On screen while playing, where speed matters more than the last pixel. */
  preview: boolean;
}

/** Draws what Konva can't pose by moving a node: a 3D turn, typing, a line drawing itself. */
export type ObjectPainter = (pose: ObjectPose | null, options: PoseOptions) => void;
/**
 * Draws the live background at a point in its cycle (0 to 1), or at rest when
 * null. Drawing may take a moment (a pattern's tile); an export waits for it.
 */
export type BackgroundPainter = (phase: number | null, options: PoseOptions) => void | Promise<void>;

const objectPainters = new Map<string, ObjectPainter>();
let backgroundPainter: BackgroundPainter | null = null;

/** Registered by a node while it's on the canvas. Returns how to unregister. */
export const registerObjectPainter = (id: string, painter: ObjectPainter) => {
  objectPainters.set(id, painter);
  return () => {
    if (objectPainters.get(id) === painter) objectPainters.delete(id);
  };
};

export const registerBackgroundPainter = (painter: BackgroundPainter) => {
  backgroundPainter = painter;
  return () => {
    if (backgroundPainter === painter) backgroundPainter = null;
  };
};

/** What the camera follows when it pushes in: the largest picture, or the middle. */
export const focusOf = (scene: Pick<MotionScene, "canvas" | "elements">) => {
  let best: LayerElement | null = null;
  for (const el of scene.elements) {
    if (el.type !== "image" || el.hidden) continue;
    if (!best || el.width * el.height > best.width * best.height) best = el;
  }
  if (!best) return { x: 0.5, y: 0.5 };
  return {
    x: (best.x + best.width / 2) / scene.canvas.width,
    y: (best.y + best.height / 2) / scene.canvas.height,
  };
};

const turned = (angle: number, x: number, y: number) => {
  const r = (angle * Math.PI) / 180;
  return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
};

/** The node's own attributes at rest, which are the element's. */
const restAttrs = (el: LayerElement) => ({
  x: el.x,
  y: el.y,
  rotation: el.rotation,
  scaleX: 1,
  scaleY: 1,
  opacity: el.opacity,
});

/** Moves, turns and scales an object about its middle, and fades it. */
const placeAttrs = (el: LayerElement, pose: ObjectPose) => {
  const half = turned(el.rotation, el.width / 2, el.height / 2);
  const middle = { x: el.x + half.x + pose.dx, y: el.y + half.y + pose.dy };
  const rotation = el.rotation + pose.rotation;
  const corner = turned(rotation, (el.width / 2) * pose.scale, (el.height / 2) * pose.scale);
  return {
    x: middle.x - corner.x,
    y: middle.y - corner.y,
    rotation,
    scaleX: pose.scale,
    scaleY: pose.scale,
    opacity: el.opacity * pose.opacity,
  };
};

/** An object's nodes: its own, and the card behind it in a layout, which moves with it. */
const nodesOf = (stage: Konva.Stage, id: string) =>
  [stage.findOne(`#${id}`), stage.findOne(`#${cardIdOf(id)}`)].filter((node) => !!node);

/** Nodes posed since the last rest, so resting puts back only what moved. */
const posed = new Set<string>();

/**
 * Puts the whole canvas in its pose at time `t`. Resolves once everything is
 * drawn, which an export waits for and a preview doesn't.
 */
export const poseStage = async (stage: Konva.Stage, scene: MotionScene, t: number, options: PoseOptions) => {
  const { canvas, motion } = scene;
  // GIFs first: a picture turned in 3D below is drawn from the frame they show.
  showGifsAt(t * 1000);
  const view = cameraAt(motion, focusOf(scene), t);
  stage.findOne(`.${CAMERA_GROUP_NAME}`)?.setAttrs(viewTransform(view, canvas.width, canvas.height));
  stage
    .findOne(`.${BACKGROUND_CAMERA_NAME}`)
    ?.setAttrs(viewTransform(backgroundViewOf(view, motion.depth), canvas.width, canvas.height));

  const unit = Math.min(canvas.width, canvas.height);
  const moving = new Set<string>();
  scene.elements.forEach((el, index) => {
    const nodes = nodesOf(stage, el.id);
    if (!nodes.length) return;
    const canTilt = el.type === "image" && !el.deviceFrame;
    const pose = objectPoseAt(el, motion, t, { unit, index, canTilt });
    if (!pose) return;
    moving.add(el.id);
    const attrs = placeAttrs(el, pose);
    nodes.forEach((node) => node.setAttrs(attrs));
    objectPainters.get(el.id)?.(pose, options);
  });

  // Something that stopped moving since the last pose goes back to rest.
  for (const id of posed) {
    if (moving.has(id)) continue;
    const el = scene.elements.find((entry) => entry.id === id);
    if (el) nodesOf(stage, id).forEach((node) => node.setAttrs(restAttrs(el)));
    objectPainters.get(id)?.(null, options);
  }
  posed.clear();
  moving.forEach((id) => posed.add(id));

  const live = motion.liveBackground && backgroundCanMove(scene.background);
  await backgroundPainter?.(live ? (t / motion.length) % 1 : null, options);
};

/** Takes the pose off: everything back where the design has it. */
export const restStage = (stage: Konva.Stage, scene: MotionScene, options: PoseOptions) => {
  const { canvas } = scene;
  const identity = viewTransform(WIDE, canvas.width, canvas.height);
  stage.findOne(`.${CAMERA_GROUP_NAME}`)?.setAttrs(identity);
  stage.findOne(`.${BACKGROUND_CAMERA_NAME}`)?.setAttrs(identity);
  for (const id of posed) {
    const el = scene.elements.find((entry) => entry.id === id);
    if (el) nodesOf(stage, id).forEach((node) => node.setAttrs(restAttrs(el)));
    objectPainters.get(id)?.(null, options);
  }
  posed.clear();
  void backgroundPainter?.(null, options);
  releaseTiltPictures();
  resumeGifs();
};
