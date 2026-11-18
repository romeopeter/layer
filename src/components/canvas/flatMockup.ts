import Konva from "konva";

/** The largest side drawn. */
const MAX_SIDE = 4096;

/** The name of a mockup's flat group in ImageNode: its frame, screen and picture. */
export const FLAT_MOCKUP_NAME = "mockup-flat";

/**
 * A mockup as it shows flat, drawn to a canvas covering the image's box at `scale`
 * pixels to a unit: frame, picture on its screen, bars and chrome. Taken from the
 * mockup's own Konva group, so it's whatever the flat mockup is, pixel for pixel, with
 * no second way of drawing frames. Shadows are left off: a turned mockup casts its own.
 */
export const flatMockupCanvas = (group: Konva.Group, width: number, height: number, scale: number) => {
  const copy = group.clone({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true }) as Konva.Group;
  copy.find((node: Konva.Node) => node instanceof Konva.Shape).forEach((node) => (node as Konva.Shape).shadowEnabled(false));
  const layer = new Konva.Layer();
  layer.add(copy);
  const pixelRatio = Math.min(scale, MAX_SIDE / Math.max(width, height, 1));
  const canvas = copy.toCanvas({ x: 0, y: 0, width, height, pixelRatio });
  layer.destroy();
  return canvas;
};
