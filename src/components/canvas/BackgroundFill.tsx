import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Image as KImage, Rect } from "react-konva";
import type Konva from "konva";
import useImage from "use-image";
import type { BackgroundState } from "@/types";
import { useEditor } from "@/store/editor";
import { isBackdropSupported, renderBackground, type LiveMoment } from "@/lib/backdrops/renderer";
import { drawBackgroundSource } from "@/lib/background/drawSource";
import { registerBackgroundPainter } from "@/lib/motion/pose";

/** Found by name at export, which draws it again at the export's own scale. */
export const BACKGROUND_FILL_NAME = "background-fill";

/** The node attribute holding how to draw this background at any scale, for export. */
export const DRAW_AT_ATTR = "drawAt";

/** Draws the background at any scale; a live background also takes the moment to draw. */
export type DrawAt = (scale: number, out: HTMLCanvasElement, live?: LiveMoment | null) => Promise<boolean>;

/** The preview never needs more pixels than a large screen can show. */
const PREVIEW_SIDE = 2048;
/** While playing, a live background is drawn every frame, so smaller, for speed. */
const LIVE_PREVIEW_SIDE = 1024;

const previewScaleOf = (width: number, height: number) =>
  Math.min(1, PREVIEW_SIDE / Math.max(width, height));

interface Props {
  bg: BackgroundState;
  width: number;
  height: number;
}

/**
 * A background drawn by Layer's renderer: always for abstract ones, and for any
 * other type once it has effects. Other types are drawn to a 2D canvas first,
 * which the renderer takes as its source.
 */
export const BackgroundFill = ({ bg, width, height }: Props) => {
  const ref = useRef<Konva.Image>(null);
  const picture = useMemo(() => document.createElement("canvas"), []);
  const supported = isBackdropSupported();
  const [image] = useImage(bg.mode === "image" ? (bg.imageSrc ?? "") : "", "anonymous");
  const customPairs = useEditor((s) => s.customPatternPairs);

  const drawAt = useCallback<DrawAt>(
    async (scale, out, live = null) => {
      const size = { width, height };
      const source =
        bg.mode === "abstract"
          ? { look: bg.backdrop }
          : { canvas: await drawBackgroundSource(bg, size, scale, { image, customPairs, phase: live?.phase }) };
      return renderBackground(source, bg.effects, size, scale, out, live);
    },
    [bg, width, height, image, customPairs],
  );

  // A live background, drawn again for each moment of an animation into a canvas
  // of its own; at rest, the preview above shows again.
  const live = useMemo(() => document.createElement("canvas"), []);
  const latest = useRef({ drawAt, width, height });
  useEffect(() => {
    latest.current = { drawAt, width, height };
  });
  useEffect(() => {
    let drawing = 0;
    return registerBackgroundPainter(async (phase, options) => {
      const node = ref.current;
      if (!node) return;
      const turn = ++drawing;
      if (phase === null) {
        node.image(picture);
        node.getLayer()?.batchDraw();
        return;
      }
      const { drawAt: draw, width: w, height: h } = latest.current;
      const scale = options.preview ? Math.min(1, LIVE_PREVIEW_SIDE / Math.max(w, h)) : options.scale;
      const drawn = await draw(scale, live, { phase, frame: options.frame });
      // A later moment may have been asked for meanwhile; only the latest shows.
      if (!drawn || turn !== drawing) return;
      node.image(live);
      node.getLayer()?.batchDraw();
    });
  }, [live, picture]);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!supported || !node) return;
    node.setAttr(DRAW_AT_ATTR, drawAt);
    const scale = previewScaleOf(width, height);

    // Abstract backgrounds draw at once; the others may wait on a picture or a tile.
    if (bg.mode === "abstract") {
      renderBackground({ look: bg.backdrop }, bg.effects, { width, height }, scale, picture);
      node.getLayer()?.batchDraw();
      return;
    }
    let current = true;
    const scratch = document.createElement("canvas");
    void drawAt(scale, scratch).then((drawn) => {
      if (!current || !drawn) return;
      picture.width = scratch.width;
      picture.height = scratch.height;
      picture.getContext("2d")?.drawImage(scratch, 0, 0);
      // Konva can't see a canvas change, so it's told.
      node.getLayer()?.batchDraw();
    });
    return () => {
      current = false;
    };
  }, [supported, drawAt, bg.mode, bg.backdrop, bg.effects, width, height, picture]);

  if (!supported) {
    // Without WebGL2, an abstract background's colours as a plain gradient.
    const [deep, main, accent] = bg.backdrop.colors;
    return (
      <Rect
        width={width}
        height={height}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }}
        fillLinearGradientEndPoint={{ x: width, y: height }}
        fillLinearGradientColorStops={[0, deep, 0.55, main, 1, accent]}
        listening={false}
      />
    );
  }

  return (
    <KImage
      ref={ref}
      name={BACKGROUND_FILL_NAME}
      image={picture}
      width={width}
      height={height}
      listening={false}
    />
  );
};
