import { useMemo } from "react";
import { Group, Image as KImage, Rect, Text } from "react-konva";
import useImage from "use-image";
import type { WatermarkSettings } from "@/types";
import {
  badgeAsDrawn,
  badgeHeightOf,
  marginOf,
  placeBox,
  stackedPast,
} from "@/lib/watermark";

/** The badge is drawn at 36 units tall and scaled, so its parts keep their proportions. */
const BADGE = { width: 120, height: 36 };
/** The user's text, in the same family as the badge. */
const TEXT_FONT = "Bricolage Grotesque";

interface Props {
  settings: WatermarkSettings;
  isPro: boolean;
  canvas: { width: number; height: number };
}

/** How wide a line of text is, to place it before Konva lays it out. */
const measure = (text: string, fontSize: number) => {
  const g = document.createElement("canvas").getContext("2d");
  if (!g) return text.length * fontSize * 0.6;
  g.font = `bold ${fontSize}px "${TEXT_FONT}"`;
  return g.measureText(text).width;
};

/**
 * Layer's badge and the user's own watermark, over everything. They're artwork:
 * export draws them like any element, which is why free exports carry the badge.
 */
export const Watermarks = ({ settings, isPro, canvas }: Props) => {
  const [logo] = useImage("/icons/logo.svg");
  const own = settings.own;
  const [ownLogo] = useImage(own.kind === "logo" && own.logoSrc ? own.logoSrc : "", "anonymous");

  const badge = badgeAsDrawn(settings, isPro);
  const margin = marginOf(canvas);
  const shorter = Math.min(canvas.width, canvas.height);
  const badgeHeight = badgeHeightOf(canvas, badge.size);
  const badgeScale = badgeHeight / BADGE.height;
  const badgeAt = placeBox(
    badge.place,
    { width: BADGE.width * badgeScale, height: badgeHeight },
    canvas,
    margin,
  );

  // The user's mark: a line of text or a logo, sized from the canvas.
  const mark = useMemo(() => {
    if (own.kind === "text" && own.text.trim()) {
      const fontSize = shorter * 0.035 * own.size;
      return { kind: "text" as const, width: measure(own.text, fontSize), height: fontSize * 1.2, fontSize };
    }
    if (own.kind === "logo" && ownLogo) {
      const height = shorter * 0.07 * own.size;
      return { kind: "logo" as const, width: (height * ownLogo.width) / ownLogo.height, height, fontSize: 0 };
    }
    return null;
  }, [own.kind, own.text, own.size, ownLogo, shorter]);

  const drawMark = (x: number, y: number, key?: string) =>
    mark?.kind === "text" ? (
      <Text
        key={key}
        x={x}
        y={y}
        text={own.text}
        fontSize={mark.fontSize}
        fontFamily={TEXT_FONT}
        fontStyle="bold"
        fill={own.color}
        listening={false}
      />
    ) : mark?.kind === "logo" && ownLogo ? (
      <KImage key={key} image={ownLogo} x={x} y={y} width={mark.width} height={mark.height} listening={false} />
    ) : null;

  let ownNode = null;
  if (mark && own.tiled) {
    // A slanted lattice, wide enough to cover the canvas at any angle, clipped to it.
    const stepX = mark.width + shorter * 0.12;
    const stepY = mark.height + shorter * 0.1;
    const reach = Math.hypot(canvas.width, canvas.height);
    const marks = [];
    for (let row = 0, y = -reach / 2; y < reach / 2; row++, y += stepY) {
      const shift = row % 2 ? stepX / 2 : 0;
      for (let x = -reach / 2 - shift; x < reach / 2; x += stepX) marks.push(drawMark(x, y, `${row}:${x}`));
    }
    ownNode = (
      <Group
        name="own-watermark"
        opacity={own.opacity}
        listening={false}
        clipX={0}
        clipY={0}
        clipWidth={canvas.width}
        clipHeight={canvas.height}
      >
        <Group x={canvas.width / 2} y={canvas.height / 2} rotation={-30}>
          {marks}
        </Group>
      </Group>
    );
  } else if (mark) {
    const at = placeBox(own.place, mark, canvas, margin);
    // Sharing the badge's place, it moves inwards past the badge rather than over it.
    const y = badge.show && own.place === badge.place ? at.y + stackedPast(own.place, badgeHeight, margin) : at.y;
    ownNode = (
      <Group name="own-watermark" opacity={own.opacity} listening={false}>
        {drawMark(at.x, y)}
      </Group>
    );
  }

  return (
    <>
      {ownNode}
      {badge.show && (
        <Group
          name="layer-badge"
          x={badgeAt.x}
          y={badgeAt.y}
          scaleX={badgeScale}
          scaleY={badgeScale}
          opacity={badge.opacity}
          listening={false}
        >
          <Rect width={BADGE.width} height={BADGE.height} cornerRadius={18} fill="rgba(15,14,26,0.6)" />
          <KImage image={logo} x={14} y={8} width={22} height={20} />
          <Text x={44} y={6} text="Layer" fontSize={22} fontFamily={TEXT_FONT} fontStyle="bold" fill="#FFFFFF" />
        </Group>
      )}
    </>
  );
};
