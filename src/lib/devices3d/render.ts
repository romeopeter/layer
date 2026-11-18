import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Texture,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { ImageTilt } from "@/lib/tilt";
import type { Box } from "@/lib/mockups";
import type { TiltBox, TurnPlane } from "@/lib/tiltRender";
import { solidBoxOf, solidTiltOf, solidViewOf, type Block, type SolidModel, type Slab } from "./bodies";
import { deckPicture } from "./keyboard";

/*
  Solid devices, drawn with three.js. Loaded only once a mockup is turned, through
  `./index.ts`, so the editor doesn't carry it until then.

  Like the other renderers it has one WebGL context of its own, and copies each result
  into a canvas of its own, which Konva shows and exports read. The flat mockup is the
  device's face, so its screen, picture and frame are exactly the flat ones.
*/

/** The largest side drawn. */
const MAX_SIDE = 4096;

export interface SolidPicture {
  /** What the model is kept under between drawings: the image's id. */
  id: string;
  model: SolidModel;
  /** The flat mockup, covering the image's box. */
  front: HTMLCanvasElement;
  /** Changes whenever the front's pixels do. */
  frontVersion: number;
  /** The image's box. */
  width: number;
  height: number;
  tilt: ImageTilt;
  /** What it turns about: its own middle, or a tilted layout's. */
  plane: TurnPlane;
}

interface Kept {
  key: string;
  root: Group;
  faces: { canvas: HTMLCanvasElement; texture: CanvasTexture; box: Box; color: string | null }[];
  frontVersion: number;
  dispose: () => void;
}

/** Element units, y down, to three's world: y up, about the image's centre. */
const worldX = (x: number, width: number) => x - width / 2;
const worldY = (y: number, height: number) => height / 2 - y;

/** A rounded outline in the world, `inset` in from the box on every side. */
const outline = (box: Box, corners: number[], inset: number, width: number, height: number) => {
  const left = worldX(box.x + inset, width);
  const right = worldX(box.x + box.width - inset, width);
  const top = worldY(box.y + inset, height);
  const bottom = worldY(box.y + box.height - inset, height);
  const most = Math.min(right - left, top - bottom) / 2;
  const [tl, tr, br, bl] = corners.map((corner) => Math.max(0, Math.min(most, corner - inset)));
  const shape = new Shape();
  shape.moveTo(left + bl, bottom);
  shape.lineTo(right - br, bottom);
  if (br) shape.absarc(right - br, bottom + br, br, -Math.PI / 2, 0, false);
  shape.lineTo(right, top - tr);
  if (tr) shape.absarc(right - tr, top - tr, tr, 0, Math.PI / 2, false);
  shape.lineTo(left + tl, top);
  if (tl) shape.absarc(left + tl, top - tl, tl, Math.PI / 2, Math.PI, false);
  shape.lineTo(left, bottom + bl);
  if (bl) shape.absarc(left + bl, bottom + bl, bl, Math.PI, Math.PI * 1.5, false);
  return shape;
};

/** Maps a flat face's texture to the image's box: the front covers it exactly. */
const mapToBox = (geometry: BufferGeometry, box: Box, width: number, height: number) => {
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i) + width / 2;
    const y = height / 2 - position.getY(i);
    uv.setXY(i, (x - box.x) / box.width, 1 - (y - box.y) / box.height);
  }
  uv.needsUpdate = true;
};

const createRenderer = () => {
  const canvas = document.createElement("canvas");
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  // The screen's colours go out as they came in.
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  // Turned so its dark floor is behind the viewer: anything facing straight out of the
  // page would otherwise mirror one of its bright wall lights and go white.
  scene.environmentRotation.set(-Math.PI / 2, 0, 0);
  room.dispose();
  pmrem.dispose();
  // A key light up and to the left, fixed to the viewer, so turning moves the highlights.
  const key = new DirectionalLight(0xffffff, 1.1);
  key.position.set(-1.2, 2, 3);
  scene.add(key);

  const camera = new PerspectiveCamera();
  const kept = new Map<string, Kept>();
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

  const textureOf = (picture: HTMLCanvasElement) => {
    const texture = new CanvasTexture(picture);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    return texture;
  };

  /** A face's picture: the front cut to `box`, over the device's own colour unless it's a cut-out. */
  const paintFace = (
    canvas: HTMLCanvasElement,
    front: HTMLCanvasElement,
    box: Box,
    picture: SolidPicture,
    color: string | null,
  ) => {
    const across = front.width / picture.width;
    const down = front.height / picture.height;
    canvas.width = Math.max(1, Math.round(box.width * across));
    canvas.height = Math.max(1, Math.round(box.height * down));
    const g = canvas.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (color) {
      g.fillStyle = color;
      g.fillRect(0, 0, canvas.width, canvas.height);
    }
    g.drawImage(front, -box.x * across, -box.y * down);
  };

  /** Builds a device's meshes. Everything it makes is listed, to be let go together. */
  const build = (picture: SolidPicture): Kept => {
    const { model, width, height } = picture;
    const disposables: (BufferGeometry | Material | Texture)[] = [];
    const own = <T extends BufferGeometry | Material | Texture>(thing: T) => {
      disposables.push(thing);
      return thing;
    };
    const root = new Group();
    root.matrixAutoUpdate = false;
    const faces: Kept["faces"] = [];

    const color = new Color(model.color);
    const metal = own(new MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.32 }));
    // The back is broad and flat, so it catches the room's light: a little deeper, and
    // softer, to keep its colour.
    const back = own(
      new MeshStandardMaterial({ color: color.clone().multiplyScalar(0.85), metalness: 0.2, roughness: 0.55, envMapIntensity: 0.6 }),
    );

    const faceMaterial = (texture: CanvasTexture) =>
      own(
        // Lit from within, like a screen, so the picture keeps its colours. Glass shows
        // only a faint, broad sheen of the room: a sharp highlight would hide the picture.
        new MeshPhysicalMaterial({
          color: 0x000000,
          emissive: 0xffffff,
          emissiveMap: texture,
          roughness: 0.4,
          metalness: 0,
          specularIntensity: 0.3,
          envMapIntensity: 0.7,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -2,
        }),
      );

    const addFace = (box: Box, over: string | null = model.color) => {
      const canvas = document.createElement("canvas");
      paintFace(canvas, picture.front, box, picture, over);
      const texture = own(textureOf(canvas));
      faces.push({ canvas, texture, box, color: over });
      return texture;
    };

    // The body, or a laptop's lid: rounded, with its face on the front.
    const slab = (body: Slab) => {
      const shape = outline(body.box, body.corners, body.inset, width, height);
      const length = Math.max(body.depth * 0.02, body.depth - body.round * 2);
      const solid = own(
        new ExtrudeGeometry(shape, {
          depth: length,
          bevelEnabled: body.round > 0,
          bevelThickness: body.round,
          bevelSize: body.inset,
          bevelSegments: 8,
          curveSegments: 32,
        }),
      );
      // Extruded towards the viewer from z = 0; moved back so its front is at z = 0.
      solid.translate(0, 0, -(length + body.round));
      root.add(new Mesh(solid, [back, metal]));

      const face = own(new ShapeGeometry(shape, 32));
      mapToBox(face, body.box, width, height);
      root.add(new Mesh(face, faceMaterial(addFace(body.box))));
    };

    slab(model.body);

    // Buttons, a laptop's base, a desktop's foot: rounded boxes, some with a face or deck.
    const addBlock = (block: Block) => {
      const holder = new Group();
      if (block.hinge) {
        holder.position.set(0, worldY(block.hinge.y, height), block.hinge.z);
        holder.rotation.x = block.hinge.angle;
      }
      // Where its middle is, from whatever it hangs on.
      const origin = { y: block.hinge ? worldY(block.hinge.y, height) : 0, z: block.hinge?.z ?? 0 };
      const middle = {
        x: worldX(block.x + block.width / 2, width),
        y: worldY(block.y + block.height / 2, height) - origin.y,
        z: block.z - block.depth / 2 - origin.z,
      };
      const round = Math.min(block.width, block.height, block.depth) * (block.face ? 0.25 : 0.4);
      const solid = new Mesh(own(new RoundedBoxGeometry(block.width, block.height, block.depth, 3, round)), metal);
      solid.position.set(middle.x, middle.y, middle.z);
      holder.add(solid);

      if (block.face) {
        const face = new Mesh(
          own(new PlaneGeometry(block.width - round * 2, block.height - round)),
          faceMaterial(addFace({ x: block.x + round, y: block.y, width: block.width - round * 2, height: block.height - round })),
        );
        face.position.set(middle.x, middle.y + round / 2, middle.z + block.depth / 2 + block.depth * 0.001);
        holder.add(face);
      }
      if (block.deck) {
        const deckTexture = own(textureOf(deckPicture(model.color, block.depth / block.width)));
        const deck = new Mesh(
          own(new PlaneGeometry(block.width - round * 2, block.depth - round * 2)),
          // Facing up, it catches the most light: a softer finish keeps its trackpad visible.
          own(new MeshStandardMaterial({ map: deckTexture, color: 0xc8c8c8, metalness: 0.15, roughness: 0.7 })),
        );
        deck.rotation.x = -Math.PI / 2;
        deck.position.set(middle.x, middle.y + block.height / 2 + block.height * 0.002, middle.z);
        holder.add(deck);
      }
      root.add(holder);
    };
    model.blocks.forEach(addBlock);

    // A desktop's stand: a cut-out of the artwork, seen from both sides.
    for (const cutout of model.cutouts) {
      if (cutout.box.width <= 0 || cutout.box.height <= 0) continue;
      const plane = new Mesh(
        own(new PlaneGeometry(cutout.box.width, cutout.box.height)),
        own(
          new MeshStandardMaterial({
            map: addFace(cutout.box, null),
            transparent: true,
            alphaTest: 0.5,
            side: DoubleSide,
            metalness: 0.3,
            roughness: 0.45,
          }),
        ),
      );
      plane.position.set(
        worldX(cutout.box.x + cutout.box.width / 2, width),
        worldY(cutout.box.y + cutout.box.height / 2, height),
        cutout.z,
      );
      root.add(plane);
    }

    // The camera on the back: a raised plate, lenses in rings, and a small light.
    const { camera } = model;
    if (camera) {
      const backZ = -model.body.depth;
      const plate = new Mesh(
        own(new RoundedBoxGeometry(camera.box.width, camera.box.height, camera.height, 3, camera.box.width * 0.2)),
        back,
      );
      plate.position.set(
        worldX(camera.box.x + camera.box.width / 2, width),
        worldY(camera.box.y + camera.box.height / 2, height),
        backZ - camera.height / 2 + camera.height * 0.05,
      );
      root.add(plate);
      // Dark glass. Seen head on, a mirror finish would show the room's lights instead.
      const glass = own(
        new MeshPhysicalMaterial({ color: 0x0b0b10, roughness: 0.25, metalness: 0, clearcoat: 0.4, envMapIntensity: 0.35 }),
      );
      const light = own(new MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.3, metalness: 0 }));
      const disc = (spot: { x: number; y: number; radius: number }, thick: number, material: Material, z: number) => {
        const shape = new Mesh(own(new CylinderGeometry(spot.radius, spot.radius, thick, 48)), material);
        shape.rotation.x = Math.PI / 2;
        shape.position.set(worldX(spot.x, width), worldY(spot.y, height), z);
        root.add(shape);
      };
      const face = backZ - camera.height;
      for (const lens of camera.lenses) {
        disc(lens, camera.height * 0.6, metal, face - camera.height * 0.25);
        disc({ ...lens, radius: lens.radius * 0.74 }, camera.height * 0.62, glass, face - camera.height * 0.27);
      }
      if (camera.flash) disc(camera.flash, camera.height * 0.2, light, face - camera.height * 0.05);
    }

    return {
      key: keyOf(picture),
      root,
      faces,
      frontVersion: picture.frontVersion,
      dispose: () => disposables.forEach((thing) => thing.dispose()),
    };
  };

  const keyOf = (picture: SolidPicture) =>
    JSON.stringify([picture.model, picture.width, picture.height, picture.front.width, picture.front.height]);

  const modelFor = (picture: SolidPicture) => {
    const known = kept.get(picture.id);
    if (known && known.key === keyOf(picture)) {
      if (known.frontVersion !== picture.frontVersion) {
        for (const face of known.faces) {
          paintFace(face.canvas, picture.front, face.box, picture, face.color);
          face.texture.needsUpdate = true;
        }
        known.frontVersion = picture.frontVersion;
      }
      return known;
    }
    known?.dispose();
    const fresh = build(picture);
    kept.set(picture.id, fresh);
    return fresh;
  };

  /** Draws the device turned into `out`, at `scale` pixels to each unit. Returns where it goes. */
  const render = (picture: SolidPicture, requestedScale: number, out: HTMLCanvasElement): TiltBox | null => {
    const { model, tilt, width, height, plane } = picture;
    const box = solidBoxOf(model, tilt, plane);
    if (box.width <= 0 || box.height <= 0) return null;
    const view = solidViewOf(model, tilt, plane);
    const largest = Math.min(MAX_SIDE, renderer.capabilities.maxTextureSize);
    const scale = Math.min(requestedScale, largest / Math.max(box.width, box.height, 1));
    renderer.setSize(Math.max(1, Math.round(box.width * scale)), Math.max(1, Math.round(box.height * scale)), false);

    const { root } = modelFor(picture);
    // The same turn as a tilted picture: scaled, then rotateZ, rotateY and rotateX, with
    // y flipped for three's world, which points up. It's built about the image's middle,
    // and turns about the plane's pivot.
    const turn = solidTiltOf(model, tilt);
    const [ax, ay, az, spin] = [turn.tiltX, turn.tiltY, turn.tiltZ, plane.spin ?? 0].map((deg) => (deg * Math.PI) / 180);
    const size = tilt.scale * view.grow;
    const pivot = { x: worldX(plane.pivot.x, width), y: worldY(plane.pivot.y, height) };
    // Turned on the page, it turns with the page's axes: into them first, and back after.
    root.matrix
      .makeRotationZ(spin)
      .multiply(new Matrix4().makeRotationX(-ax))
      .multiply(new Matrix4().makeRotationY(ay))
      .multiply(new Matrix4().makeRotationZ(-az))
      .multiply(new Matrix4().makeScale(size, size, size))
      .multiply(new Matrix4().makeRotationZ(-spin))
      .multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, -view.middle));
    root.matrixWorldNeedsUpdate = true;
    scene.add(root);

    // Seen from straight in front of the pivot, cut to just the device.
    const near = view.distance * 0.02;
    const far = view.distance * 4 + Math.max(width, height) * 4;
    const reach = near / view.distance;
    camera.position.set(0, 0, view.distance);
    camera.updateMatrixWorld();
    camera.projectionMatrix.makePerspective(
      (box.x - plane.pivot.x) * reach,
      (box.x + box.width - plane.pivot.x) * reach,
      (plane.pivot.y - box.y) * reach,
      (plane.pivot.y - box.y - box.height) * reach,
      near,
      far,
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    renderer.render(scene, camera);
    scene.remove(root);

    out.width = canvas.width;
    out.height = canvas.height;
    const g = out.getContext("2d");
    g?.clearRect(0, 0, out.width, out.height);
    g?.drawImage(canvas, 0, 0);
    return box;
  };

  const release = (id: string) => {
    kept.get(id)?.dispose();
    kept.delete(id);
  };

  const releaseAll = () => {
    kept.forEach((entry) => entry.dispose());
    kept.clear();
  };

  return { canvas, render, release, releaseAll };
};

let renderer: ReturnType<typeof createRenderer> | null | undefined;

const getRenderer = () => {
  if (renderer !== undefined) return renderer;
  try {
    renderer = createRenderer();
  } catch (error) {
    console.error("3D mockups are unavailable:", error);
    renderer = null;
    return null;
  }
  renderer.canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    // Everything it held went with the context; it's all made again next time.
    renderer = undefined;
  });
  return renderer;
};

/** Whether solids can be drawn here: three.js needs a WebGL context of its own. */
export const canRenderSolids = () => !!getRenderer();

/** Draws a solid device turned into `out`. Null if it can't be drawn. */
export const renderSolid = (picture: SolidPicture, scale: number, out: HTMLCanvasElement) =>
  getRenderer()?.render(picture, scale, out) ?? null;

/** Lets go of an image's model, once it's gone or no longer turned. */
export const releaseSolid = (id: string) => renderer?.release(id);

export const releaseAllSolids = () => renderer?.releaseAll();
