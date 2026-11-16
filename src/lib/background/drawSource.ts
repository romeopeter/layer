import type { BackgroundGradient, BackgroundState } from "@/types";
import type { PatternColorPair } from "@/types/pattern";
import { patternPairOf } from "@/lib/patterns/resolveColorPair";
import { getPatternTile } from "@/lib/patterns/tileCache";

/** Behind an image background that hasn't loaded, or has none. */
export const IMAGE_PLACEHOLDER = "#1A1826";

/** Pattern tiles are never drawn denser than this, whatever the scale. */
const MAX_TILE_DPI = 4;

/** Where a gradient starts and ends on a canvas, in canvas pixels. Konva and this file share it. */
export const gradientEnds = ({ angle }: BackgroundGradient, width: number, height: number) => {
  const rad = (angle * Math.PI) / 180;
  const reach = Math.max(width, height) * 0.6;
  const dx = Math.cos(rad) * reach;
  const dy = Math.sin(rad) * reach;
  return {
    start: { x: width / 2 - dx, y: height / 2 - dy },
    end: { x: width / 2 + dx, y: height / 2 + dy },
  };
};

/** The size an image is drawn at to cover the canvas, centred. */
export const coverOf = (image: { width: number; height: number }, width: number, height: number) => {
  const ratio = Math.max(width / image.width, height / image.height);
  const w = image.width * ratio;
  const h = image.height * ratio;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
};

export interface SourceAssets {
  /** The loaded picture of an image background. */
  image?: HTMLImageElement | null;
  customPairs?: PatternColorPair[];
  /** How far round its loop a live background is, 0 to 1. Absent or 0 is at rest. */
  phase?: number;
}

/*
  A live background's moves, each back where it started at the end of the loop.
  The canvas's Konva nodes and this file share them.
*/

/** A gradient sways this many degrees either way. */
const SWAY = 12;
/** An image background grows by this much and back. */
const BREATHE = 0.05;

export const swayedGradient = (gradient: BackgroundGradient, phase: number): BackgroundGradient => ({
  ...gradient,
  angle: gradient.angle + SWAY * Math.sin(phase * Math.PI * 2),
});

/** How much bigger an image background is drawn, about its middle. */
export const breathOf = (phase: number) => 1 + BREATHE * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2));

/** The image drawn bigger about the canvas's middle. */
export const breathed = (box: { x: number; y: number; width: number; height: number }, size: { width: number; height: number }, grow: number) => ({
  x: size.width / 2 - (size.width / 2 - box.x) * grow,
  y: size.height / 2 - (size.height / 2 - box.y) * grow,
  width: box.width * grow,
  height: box.height * grow,
});

/**
 * Draws a solid, gradient, image or pattern background to a 2D canvas at `scale`
 * pixels to each canvas pixel, the way the canvas shows it. Abstract backgrounds
 * are drawn by their own renderer instead.
 */
export const drawBackgroundSource = async (
  bg: BackgroundState,
  size: { width: number; height: number },
  scale: number,
  assets: SourceAssets = {},
): Promise<HTMLCanvasElement> => {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(size.width * scale));
  out.height = Math.max(1, Math.round(size.height * scale));
  const g = out.getContext("2d");
  if (!g) return out;
  g.scale(out.width / size.width, out.height / size.height);

  if (bg.mode === "solid") {
    g.fillStyle = bg.color;
    g.fillRect(0, 0, size.width, size.height);
  } else if (bg.mode === "gradient") {
    const { start, end } = gradientEnds(swayedGradient(bg.gradient, assets.phase ?? 0), size.width, size.height);
    const fill = g.createLinearGradient(start.x, start.y, end.x, end.y);
    fill.addColorStop(0, bg.gradient.from);
    fill.addColorStop(1, bg.gradient.to);
    g.fillStyle = fill;
    g.fillRect(0, 0, size.width, size.height);
  } else if (bg.mode === "image") {
    g.fillStyle = IMAGE_PLACEHOLDER;
    g.fillRect(0, 0, size.width, size.height);
    const image = assets.image;
    if (image && bg.imageSrc) {
      const box = breathed(coverOf(image, size.width, size.height), size, breathOf(assets.phase ?? 0));
      g.drawImage(image, box.x, box.y, box.width, box.height);
    }
  } else if (bg.mode === "pattern") {
    const pair = patternPairOf(bg.pattern, assets.customPairs);
    g.fillStyle = pair.base;
    g.fillRect(0, 0, size.width, size.height);
    const dpi = Math.min(Math.max(Math.ceil(scale), 1), MAX_TILE_DPI);
    const tile = await getPatternTile({ type: bg.pattern.type, size: bg.pattern.size }, pair, dpi);
    const repeat = g.createPattern(tile, "repeat");
    if (repeat) {
      // As Konva does it: turn the lattice, not the tile, then shrink the dense tile back.
      // A live pattern slides one whole tile each loop, so the end meets the start.
      const slide = assets.phase ?? 0;
      repeat.setTransform(
        new DOMMatrix()
          .rotate(bg.pattern.rotation)
          .scale(1 / dpi)
          .translate(-slide * tile.width, -slide * tile.height),
      );
      g.globalAlpha = bg.pattern.intensity;
      g.fillStyle = repeat;
      g.fillRect(0, 0, size.width, size.height);
      g.globalAlpha = 1;
    }
  }
  return out;
};
