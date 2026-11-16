import { useEffect, useRef } from "react";
import type Konva from "konva";
import { Rect, Image as KImage, Group } from "react-konva";
import useImage from "use-image";
import type { BackgroundState } from "../../types";
import { PATTERN_FILL_NAME, PatternFillRect } from "./PatternFillRect";
import { BackgroundFill } from "./BackgroundFill";
import { isBackdropSupported } from "@/lib/backdrops/renderer";
import { changesPixels } from "@/lib/background/effects";
import {
  breathed,
  breathOf,
  coverOf,
  gradientEnds,
  IMAGE_PLACEHOLDER,
  swayedGradient,
} from "@/lib/background/drawSource";
import { registerBackgroundPainter } from "@/lib/motion/pose";

interface Props {
  bg: BackgroundState;
  width: number;
  height: number;
}

/**
 * The background, under everything. Abstract backgrounds, and any type with
 * effects, go through Layer's renderer; the rest are plain Konva nodes. Opacity
 * is the one effect Konva does itself.
 */
export const Background = ({ bg, width, height }: Props) => {
  const rendered = bg.mode === "abstract" || (changesPixels(bg.effects) && isBackdropSupported());
  return (
    <Group opacity={bg.effects.opacity} listening={false}>
      {rendered ? (
        <BackgroundFill bg={bg} width={width} height={height} />
      ) : (
        <LivePlain bg={bg} width={width} height={height} />
      )}
    </Group>
  );
};

/**
 * A live plain background: its Konva node set straight for each moment, the same
 * moves `drawBackgroundSource` makes for one with effects. At rest, as it was.
 */
const LivePlain = ({ bg, width, height }: Props) => {
  const group = useRef<Konva.Group>(null);
  const latest = useRef({ bg, width, height });
  useEffect(() => {
    latest.current = { bg, width, height };
  });
  useEffect(
    () =>
      registerBackgroundPainter((moment) => {
        const root = group.current;
        if (!root) return;
        const { bg: now, width: w, height: h } = latest.current;
        const phase = moment ?? 0;
        if (now.mode === "gradient") {
          const ends = gradientEnds(swayedGradient(now.gradient, phase), w, h);
          root.findOne(".plain-gradient")?.setAttrs({
            fillLinearGradientStartPoint: ends.start,
            fillLinearGradientEndPoint: ends.end,
          });
        } else if (now.mode === "pattern") {
          const fill = root.findOne<Konva.Rect>(`.${PATTERN_FILL_NAME}`);
          const tile = fill?.fillPatternImage();
          // One whole tile each loop, in the tile's own pixels, so the end meets the start.
          if (fill && tile) fill.fillPatternOffset({ x: phase * tile.width, y: phase * tile.height });
        } else if (now.mode === "image") {
          const picture = root.findOne<Konva.Image>(".plain-image");
          const image = picture?.image();
          if (picture && image) {
            picture.setAttrs(breathed(coverOf(image as HTMLImageElement, w, h), { width: w, height: h }, breathOf(phase)));
          }
        }
        root.getLayer()?.batchDraw();
      }),
    [],
  );
  return (
    <Group ref={group} listening={false}>
      <PlainBackground bg={bg} width={width} height={height} />
    </Group>
  );
};

const PlainBackground = ({ bg, width, height }: Props) => {
  if (bg.mode === "solid") {
    return <Rect x={0} y={0} width={width} height={height} fill={bg.color} listening={false} />;
  }

  if (bg.mode === "gradient") {
    const { start, end } = gradientEnds(bg.gradient, width, height);
    return (
      <Rect
        name="plain-gradient"
        x={0}
        y={0}
        width={width}
        height={height}
        fillLinearGradientStartPoint={start}
        fillLinearGradientEndPoint={end}
        fillLinearGradientColorStops={[0, bg.gradient.from, 1, bg.gradient.to]}
        listening={false}
      />
    );
  }

  if (bg.mode === "pattern") {
    return <PatternFillRect pattern={bg.pattern} width={width} height={height} />;
  }

  return <BackgroundImage bg={bg} width={width} height={height} />;
};

const BackgroundImage = ({ bg, width, height }: Props) => {
  const [img] = useImage(bg.imageSrc || "", "anonymous");

  return (
    <Group listening={false}>
      <Rect x={0} y={0} width={width} height={height} fill={IMAGE_PLACEHOLDER} />
      {img && bg.imageSrc && (
        <KImage name="plain-image" image={img} {...coverOf(img, width, height)} listening={false} />
      )}
    </Group>
  );
};
