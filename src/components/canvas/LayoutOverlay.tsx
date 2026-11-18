import { memo, useLayoutEffect, useMemo, useRef } from "react";
import Konva from "konva";
import { Arrow, Circle, Group, Image as KImage, Layer, Line, Rect, Text } from "react-konva";
import { SYSTEM_FONTS } from "@/lib/constants";
import { cardIdOf, type Arrangement, type LayoutDecor, type LayoutSurface } from "@/lib/layouts";
import { gradientEnds } from "@/lib/background/drawSource";
import { isTiltSupported, planeFrom, renderTilt, tiltBoxOf, tiltCorners, type TiltLook } from "@/lib/tiltRender";
import type { CardFill, ImageElement } from "@/types";

/** Turned parts are drawn at twice their size, so they're sharp in a 2× export too. */
const TURN_SCALE = 2;
const MAX_SIDE = 4096;

/** A tilted layout's turn, for a part of it: its tilt, and the surface seen from the part. */
const lookOn = (surface: LayoutSurface, width: number, height: number, node: { x: number; y: number; rotation: number }, cornerRadius = 0): TiltLook => ({
  tilt: { ...surface.tilt, scale: 1 },
  width,
  height,
  cornerRadius,
  border: null,
  plane: planeFrom(surface.pivot, surface.span, node),
});

/** Konva name the exporter hides before capture. */
export const LAYOUT_SLOTS_LAYER_NAME = "layout-slots";

/* Artwork, so these are drawn into the export: the app's bad and good colours. */
const BAD_COLOR = "#dc2626";
const GOOD_COLOR = "#1d9e75";
const MARK_COLOR = "#ffffff";
const MARK_SHADOW = "rgba(0,0,0,0.45)";
const LABEL_FILL = "rgba(15,14,26,0.72)";
const SLOT_FILL = "rgba(255,255,255,0.08)";
const SLOT_STROKE = "rgba(255,255,255,0.55)";
const DROP_FILL = "rgba(29,158,117,0.3)";

const Decor = ({ item }: { item: LayoutDecor }) => {
  if (item.kind === "divider") {
    const w = item.width;
    return (
      <Line
        points={item.points}
        stroke={item.color}
        strokeWidth={w}
        // A dot is a dash too short to see, with round ends.
        dash={item.style === "dashed" ? [w * 4, w * 3] : item.style === "dotted" ? [0.001, w * 2.2] : undefined}
        lineCap={item.style === "dotted" ? "round" : "butt"}
      />
    );
  }

  if (item.kind === "arrow") {
    return (
      <Arrow
        points={item.points}
        tension={0.5}
        stroke={MARK_COLOR}
        fill={MARK_COLOR}
        strokeWidth={item.width}
        pointerLength={item.width * 3}
        pointerWidth={item.width * 3}
        lineCap="round"
        shadowColor={MARK_SHADOW}
        shadowBlur={item.width * 2}
      />
    );
  }

  if (item.kind === "verdict") {
    const r = item.radius;
    return (
      <Group x={item.x} y={item.y}>
        <Circle radius={r} fill={item.good ? GOOD_COLOR : BAD_COLOR} stroke={MARK_COLOR} strokeWidth={r * 0.14} />
        {item.good ? (
          <Line
            points={[-r * 0.42, 0, -r * 0.1, r * 0.34, r * 0.46, -r * 0.34]}
            stroke={MARK_COLOR}
            strokeWidth={r * 0.2}
            lineCap="round"
            lineJoin="round"
          />
        ) : (
          <>
            <Line points={[-r * 0.34, -r * 0.34, r * 0.34, r * 0.34]} stroke={MARK_COLOR} strokeWidth={r * 0.2} lineCap="round" />
            <Line points={[r * 0.34, -r * 0.34, -r * 0.34, r * 0.34]} stroke={MARK_COLOR} strokeWidth={r * 0.2} lineCap="round" />
          </>
        )}
      </Group>
    );
  }

  const pillWidth = Math.min(item.text.length * item.size * 0.62 + item.size * 1.4, item.width);
  const pillHeight = item.size * 1.9;
  return (
    <Group x={item.x} y={item.y}>
      <Rect
        x={(item.width - pillWidth) / 2}
        width={pillWidth}
        height={pillHeight}
        fill={LABEL_FILL}
        cornerRadius={pillHeight / 2}
      />
      <Text
        text={item.text}
        width={item.width}
        height={pillHeight}
        align="center"
        verticalAlign="middle"
        wrap="none"
        ellipsis
        fontFamily={SYSTEM_FONTS[0]}
        fontStyle="bold"
        fontSize={item.size}
        fill={MARK_COLOR}
      />
    </Group>
  );
};

/** Paints a card's fill into `canvas`, `scale` pixels to a unit. */
const paintCard = (canvas: HTMLCanvasElement, fill: CardFill, width: number, height: number, scale: number) => {
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const g = canvas.getContext("2d");
  if (!g) return;
  if (fill.kind === "solid") {
    g.fillStyle = fill.color;
  } else {
    const { start, end } = gradientEnds(fill, width, height);
    const gradient = g.createLinearGradient(start.x * scale, start.y * scale, end.x * scale, end.y * scale);
    gradient.addColorStop(0, fill.from);
    gradient.addColorStop(1, fill.to);
    g.fillStyle = gradient;
  }
  g.fillRect(0, 0, canvas.width, canvas.height);
};

/**
 * The card behind one image in a layout. Artwork, so it exports. It sits where the
 * image does, turned the same way and as faded, so posing the image can pose it too.
 * In a tilted layout it's drawn turned with the rest of the surface.
 */
export const SlotCard = memo(
  ({
    el,
    pad,
    radius,
    fill,
    surface,
  }: {
    el: ImageElement;
    pad: number;
    radius: number;
    fill: CardFill;
    surface?: LayoutSurface | null;
  }) => {
    const width = el.width + pad * 2;
    const height = el.height + pad * 2;
    const ends = fill.kind === "gradient" ? gradientEnds(fill, width, height) : null;
    const turnedRef = useRef<Konva.Image>(null);
    const out = useMemo(() => document.createElement("canvas"), []);
    // The card's own corner is at -pad from the image's, which is where it's seen from.
    const look = useMemo(
      () =>
        surface && isTiltSupported()
          ? lookOn(surface, width, height, { x: el.x - pad, y: el.y - pad, rotation: el.rotation }, radius)
          : null,
      [surface, width, height, el.x, el.y, el.rotation, pad, radius],
    );
    const box = useMemo(() => (look ? tiltBoxOf(tiltCorners(look)) : null), [look]);
    useLayoutEffect(() => {
      if (!look) return;
      const plain = document.createElement("canvas");
      const scale = Math.min(TURN_SCALE, MAX_SIDE / Math.max(width, height, 1));
      paintCard(plain, fill, width, height, scale);
      renderTilt(plain, look, TURN_SCALE, out);
      turnedRef.current?.getLayer()?.batchDraw();
    }, [look, fill, width, height, out]);

    return (
      <Group
        id={cardIdOf(el.id)}
        x={el.x}
        y={el.y}
        rotation={el.rotation}
        opacity={el.opacity}
        visible={!el.hidden}
        listening={false}
      >
        {look && box ? (
          <KImage ref={turnedRef} name="turned-card" image={out} x={-pad + box.x} y={-pad + box.y} width={box.width} height={box.height} />
        ) : (
          <Rect
            x={-pad}
            y={-pad}
            width={width}
            height={height}
            cornerRadius={radius}
            fill={fill.kind === "solid" ? fill.color : undefined}
            fillLinearGradientStartPoint={ends?.start}
            fillLinearGradientEndPoint={ends?.end}
            fillLinearGradientColorStops={fill.kind === "gradient" ? [0, fill.from, 1, fill.to] : undefined}
          />
        )}
      </Group>
    );
  },
);
SlotCard.displayName = "SlotCard";

/**
 * Badges, arrows, labels and dividers. Part of the artwork, so it lives with the content.
 * In a tilted layout they're drawn flat, hidden, and shown turned with the rest of the
 * surface: one picture of them all, turned as one.
 */
export const LayoutDecorNodes = ({
  arrangement,
  surface,
}: {
  arrangement: Arrangement;
  surface?: LayoutSurface | null;
}) => {
  const flatRef = useRef<Konva.Group>(null);
  const turnedRef = useRef<Konva.Image>(null);
  const out = useMemo(() => document.createElement("canvas"), []);
  const turning = !!surface && isTiltSupported() && arrangement.decor.length > 0;

  useLayoutEffect(() => {
    const flat = flatRef.current;
    const turned = turnedRef.current;
    if (!turning || !surface || !flat || !turned) return;
    // Where they are on the canvas, whatever the camera is doing.
    const bounds = flat.getClientRect({ relativeTo: flat.getParent() ?? undefined });
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const copy = flat.clone({ visible: true }) as Konva.Group;
    const holder = new Konva.Layer();
    holder.add(copy);
    const pixelRatio = Math.min(TURN_SCALE, MAX_SIDE / Math.max(bounds.width, bounds.height));
    const picture = copy.toCanvas({ ...bounds, pixelRatio });
    holder.destroy();
    const look = lookOn(surface, bounds.width, bounds.height, { x: bounds.x, y: bounds.y, rotation: 0 });
    const box = renderTilt(picture, look, TURN_SCALE, out);
    if (!box) return;
    turned.setAttrs({ image: out, x: bounds.x + box.x, y: bounds.y + box.y, width: box.width, height: box.height });
    turned.getLayer()?.batchDraw();
  }, [turning, surface, arrangement, out]);

  return (
    <>
      <Group ref={flatRef} name="layout-decor" listening={false} visible={!turning}>
        {arrangement.decor.map((item, i) => (
          <Decor key={i} item={item} />
        ))}
      </Group>
      {turning && <KImage ref={turnedRef} name="turned-decor" image={out} listening={false} />}
    </>
  );
};

/** Empty slots and the drop highlight: editing aids, hidden from exports. */
export const LayoutSlotsLayer = ({
  arrangement,
  dropSlot,
  scale,
  onAdd,
}: {
  arrangement: Arrangement;
  dropSlot: number | null;
  scale: number;
  onAdd: (slot: number) => void;
}) => (
  <Layer name={LAYOUT_SLOTS_LAYER_NAME}>
    {arrangement.slots.map((slot, i) =>
      slot.id ? null : (
        <Group
          key={i}
          name="layout-empty-slot"
          x={slot.x}
          y={slot.y}
          rotation={slot.rotation}
          onClick={() => onAdd(i)}
          onTap={() => onAdd(i)}
        >
          <Rect
            width={slot.width}
            height={slot.height}
            fill={SLOT_FILL}
            stroke={SLOT_STROKE}
            strokeWidth={1.5 / scale}
            dash={[8 / scale, 6 / scale]}
            cornerRadius={8}
          />
          <Text
            text="Add image"
            width={slot.width}
            height={slot.height}
            align="center"
            verticalAlign="middle"
            fontFamily={SYSTEM_FONTS[0]}
            fontSize={13 / scale}
            fill={MARK_COLOR}
            listening={false}
          />
        </Group>
      ),
    )}
    {dropSlot !== null && arrangement.slots[dropSlot] && (
      <Rect
        name="layout-drop-target"
        x={arrangement.slots[dropSlot].x}
        y={arrangement.slots[dropSlot].y}
        width={arrangement.slots[dropSlot].width}
        height={arrangement.slots[dropSlot].height}
        rotation={arrangement.slots[dropSlot].rotation}
        fill={DROP_FILL}
        stroke={GOOD_COLOR}
        strokeWidth={2 / scale}
        listening={false}
      />
    )}
  </Layer>
);
