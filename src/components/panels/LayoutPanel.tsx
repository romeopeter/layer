import { useRef, useState } from "react";
import { Maximize, Upload, Paintbrush } from "lucide-react";
import { useEditor } from "@/store/editor";
import type { CanvasLayout, CardFill, LayoutAlign, LayoutCards, LayoutDivider, LayoutId } from "@/types";
import { importImageFile } from "@/lib/importers";
import {
  arrangeLayout,
  DEFAULT_CARD_FILL,
  hasDivider,
  isOverlap,
  layoutOf,
  LAYOUTS,
  newLayout,
  suitedSizes,
} from "@/lib/layouts";
import { POST_SIZES } from "@/lib/canvasSizes";
import { DEFAULT_GRADIENT } from "@/lib/background/normalise";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ColorRow,
  LabeledSlider,
  Linebreak,
  PanelDesc,
  PanelHelp,
  SectionLabel,
  SwitchRow,
} from "./primitives";
import { ChoiceTile } from "./ChoiceTile";
import { choiceClass } from "./choice";
import { GradientControls } from "./GradientControls";
import { IMAGE_FILE_TYPES } from "@/lib/importers";

const PREVIEW = { width: 44, height: 32 };

/* Drawn with the real layout maths, so a preview can't drift from the result. */
const previewOf = (id: LayoutId) => {
  const layout: CanvasLayout = {
    ...newLayout(id, null),
    scale: 100,
    spacing: id === "side" || id === "stacked" ? 40 : 30,
    showLabels: false,
  };
  return arrangeLayout(layout, [], PREVIEW);
};

const PREVIEWS = LAYOUTS.map((layout) => ({ layout, preview: previewOf(layout.id) }));

const LayoutPreview = ({ id }: { id: LayoutId }) => {
  const entry = PREVIEWS.find(({ layout }) => layout.id === id);
  if (!entry) return null;
  return (
    <svg viewBox={`0 0 ${PREVIEW.width} ${PREVIEW.height}`} className="h-8 w-11" aria-hidden>
      {entry.preview.slots.map((slot, i) => (
        <rect
          key={i}
          x={slot.x}
          y={slot.y}
          width={slot.width}
          height={slot.height}
          rx={1.5}
          transform={slot.rotation ? `rotate(${slot.rotation} ${slot.x} ${slot.y})` : undefined}
          className="fill-primary/25 stroke-primary"
          strokeWidth={0.8}
        />
      ))}
      {entry.preview.decor.map((item, i) => {
        if (item.kind === "verdict") {
          return (
            <circle
              key={i}
              cx={item.x}
              cy={Math.max(item.y, 2.5)}
              r={2.5}
              className={item.good ? "fill-primary" : "fill-destructive"}
            />
          );
        }
        if (item.kind === "arrow") {
          const [x0, y0, cx, cy, x1, y1] = item.points;
          return (
            <path
              key={i}
              d={`M${x0} ${y0} Q${cx} ${cy} ${x1} ${y1}`}
              fill="none"
              className="stroke-text-muted"
              strokeWidth={1}
            />
          );
        }
        return null;
      })}
    </svg>
  );
};

/** What a slot is called in the panel: its label if it has one. */
const slotName = (layout: CanvasLayout, index: number) => layout.labels[index]?.trim() || `Image ${index + 1}`;

const cssOf = (fill: CardFill) =>
  fill.kind === "solid" ? fill.color : `linear-gradient(135deg, ${fill.from}, ${fill.to})`;

/** The picture in a slot, small, so you can tell which is which. */
const SlotPicture = ({ id }: { id: string }) => {
  const src = useEditor((s) => {
    const el = s.elements.find((entry) => entry.id === id);
    return el?.type === "image" ? el.src : null;
  });
  if (!src) return null;
  return <img src={src} alt="" className="h-8 w-11 rounded-sm object-cover" />;
};

/** Which image sits on top, for layouts whose images overlap. */
const InFront = ({ layout }: { layout: CanvasLayout }) => {
  const updateLayout = useEditor((s) => s.updateLayout);
  const front = layout.front ?? layout.slots.length - 1;
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>IN FRONT</SectionLabel>
      <div className="grid grid-cols-3 gap-1.5">
        {layout.slots.map((slot, i) =>
          slot.id ? (
            <ChoiceTile key={i} label={slotName(layout, i)} active={front === i} onClick={() => updateLayout({ front: i })}>
              <SlotPicture id={slot.id} />
            </ChoiceTile>
          ) : null,
        )}
      </div>
    </div>
  );
};

const DividerSection = ({ divider }: { divider: LayoutDivider }) => {
  const updateLayout = useEditor((s) => s.updateLayout);
  const set = (patch: Partial<LayoutDivider>) => updateLayout({ divider: { ...divider, ...patch } });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <SectionLabel>DIVIDER</SectionLabel>
        <PanelHelp>A line in the gap between images.</PanelHelp>
      </div>
      <ToggleGroup
        type="single"
        value={divider.style}
        onValueChange={(style) => style && set({ style: style as LayoutDivider["style"] })}
        className="w-full"
        aria-label="Divider"
      >
        <ToggleGroupItem value="none" className="cursor-pointer px-1">None</ToggleGroupItem>
        <ToggleGroupItem value="solid" className="cursor-pointer px-1">Solid</ToggleGroupItem>
        <ToggleGroupItem value="dashed" className="cursor-pointer px-1">Dashed</ToggleGroupItem>
        <ToggleGroupItem value="dotted" className="cursor-pointer px-1">Dotted</ToggleGroupItem>
      </ToggleGroup>
      {divider.style !== "none" && (
        <>
          <ColorRow value={divider.color} label="Divider color" onChange={(color) => set({ color })} />
          <LabeledSlider label="THICKNESS" min={1} max={10} value={divider.width} onChange={(width) => set({ width })} />
        </>
      )}
    </div>
  );
};

const CardsSection = ({ layout }: { layout: CanvasLayout }) => {
  const updateLayout = useEditor((s) => s.updateLayout);
  // Which card the colours below change: every one, or one of them.
  const [target, setTarget] = useState<"all" | number>("all");
  const { cards } = layout;
  const set = (patch: Partial<LayoutCards>) => updateLayout({ cards: { ...cards, ...patch } });

  const editing = target === "all" || target >= cards.fills.length ? "all" : target;
  const fill = cards.fills[editing === "all" ? 0 : editing] ?? DEFAULT_CARD_FILL;
  const setFill = (next: CardFill) =>
    set({ fills: cards.fills.map((old, i) => (editing === "all" || i === editing ? next : old)) });
  const setKind = (kind: CardFill["kind"]) => {
    if (kind === fill.kind) return;
    setFill(
      fill.kind === "solid"
        ? { kind: "gradient", ...DEFAULT_GRADIENT, from: fill.color }
        : { kind: "solid", color: fill.from },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <SwitchRow
        label="CARDS"
        description="A colour or gradient card behind each image."
        checked={cards.show}
        onCheckedChange={(show) => set({ show })}
      />
      {cards.show && (
        <>
          <div role="group" aria-label="Which card" className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              aria-pressed={editing === "all"}
              onClick={() => setTarget("all")}
              className={cn(
                "h-5 cursor-pointer rounded-sm border px-1.5 text-[10px] transition-colors",
                choiceClass(editing === "all"),
                editing === "all" ? "text-text" : "text-text-muted",
              )}
            >
              All
            </button>
            {cards.fills.map((each, i) => (
              <button
                key={i}
                type="button"
                title={slotName(layout, i)}
                aria-label={`Card for ${slotName(layout, i)}`}
                aria-pressed={editing === i}
                onClick={() => setTarget(i)}
                className={cn("h-5 w-5 cursor-pointer rounded-sm border transition-colors", choiceClass(editing === i))}
                style={{ background: cssOf(each) }}
              />
            ))}
          </div>
          <ToggleGroup
            type="single"
            value={fill.kind}
            onValueChange={(kind) => kind && setKind(kind as CardFill["kind"])}
            className="w-full"
            aria-label="Card fill"
          >
            <ToggleGroupItem value="solid" className="cursor-pointer px-1">Solid</ToggleGroupItem>
            <ToggleGroupItem value="gradient" className="cursor-pointer px-1">Gradient</ToggleGroupItem>
          </ToggleGroup>
          {fill.kind === "solid" ? (
            <ColorRow value={fill.color} label="Card color" onChange={(color) => setFill({ kind: "solid", color })} />
          ) : (
            <GradientControls value={fill} onChange={(gradient) => setFill({ kind: "gradient", ...gradient })} />
          )}
          <LabeledSlider label="PADDING" unit="%" value={cards.padding} onChange={(padding) => set({ padding })} />
          <LabeledSlider label="CORNERS" unit="%" value={cards.corners} onChange={(corners) => set({ corners })} />
        </>
      )}
    </div>
  );
};

const SHAPE_BOX = { width: 44, height: 32, margin: 4 };

/** A size's shape, small. */
const ShapePreview = ({ width, height }: { width: number; height: number }) => {
  const room = { width: SHAPE_BOX.width - SHAPE_BOX.margin * 2, height: SHAPE_BOX.height - SHAPE_BOX.margin * 2 };
  const scale = Math.min(room.width / width, room.height / height);
  const w = width * scale;
  const h = height * scale;
  return (
    <svg viewBox={`0 0 ${SHAPE_BOX.width} ${SHAPE_BOX.height}`} className="h-8 w-11" aria-hidden>
      <rect
        x={(SHAPE_BOX.width - w) / 2}
        y={(SHAPE_BOX.height - h) / 2}
        width={w}
        height={h}
        rx={1.5}
        className="fill-primary/25 stroke-primary"
        strokeWidth={0.8}
      />
    </svg>
  );
};

/** Sizes that suit the layout and its images, and fitting the canvas around them. */
const CanvasSizeSection = ({ filled }: { filled: number }) => {
  const canvas = useEditor((s) => s.canvas);
  const setCanvas = useEditor((s) => s.setCanvas);
  const fitCanvasToLayout = useEditor((s) => s.fitCanvasToLayout);
  // As names, so the panel only redraws when the suggestions change.
  const suggested = useEditor((s) =>
    s.layout ? suitedSizes(s.layout, s.elements).map((size) => size.label).join("\n") : "",
  );
  const sizes = suggested
    .split("\n")
    .flatMap((label) => POST_SIZES.filter((size) => size.label === label));

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>CANVAS SIZE</SectionLabel>
      <PanelHelp>Sizes that suit this layout and its images.</PanelHelp>
      <div role="group" aria-label="Suggested sizes" className="grid grid-cols-3 gap-1.5">
        {sizes.map((size) => (
          <ChoiceTile
            key={size.label}
            label={size.label}
            active={canvas.width === size.width && canvas.height === size.height}
            onClick={() => setCanvas(size)}
          >
            <ShapePreview width={size.width} height={size.height} />
            <span className="font-mono text-[9px] text-text-faint">
              {size.width} × {size.height}
            </span>
          </ChoiceTile>
        ))}
      </div>
      <Button variant="outline" size="block" className="cursor-pointer" disabled={!filled} onClick={fitCanvasToLayout}>
        <Maximize className="h-3 w-3" /> Fit canvas to layout
      </Button>
      <PanelHelp>
        {filled
          ? "Resizes the canvas around the images, with even padding."
          : "Add images to the layout, then fit the canvas around them."}
      </PanelHelp>
    </div>
  );
};

export const LayoutPanel = () => {
  const layout = useEditor((s) => s.layout);
  const selectedIds = useEditor((s) => s.selectedIds);
  const setLayout = useEditor((s) => s.setLayout);
  const updateLayout = useEditor((s) => s.updateLayout);
  const addImage = useEditor((s) => s.addImage);
  const matchLayoutStyle = useEditor((s) => s.matchLayoutStyle);
  const fileRef = useRef<HTMLInputElement>(null);

  const def = layout ? layoutOf(layout.id) : undefined;
  const filled = layout?.slots.filter((slot) => slot.id) ?? [];
  const free = (layout?.slots.length ?? 0) - filled.length;
  const fixedSlots = def?.kind === "grid";
  const overlapping = !!layout && isOverlap(layout.id);
  // The selected image, or the first in the layout when nothing in it is selected.
  const styleSource = filled.find((slot) => slot.id && selectedIds.includes(slot.id))?.id ?? filled[0]?.id;

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    for (const file of Array.from(input.files ?? [])) {
      await importImageFile(file, addImage);
    }
    input.value = "";
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <div className="flex flex-col gap-2">
        <PanelDesc>Put images together. They arrange themselves.</PanelDesc>
      </div>

      <div className="space-y-2">
        <SectionLabel>PICK A LAYOUT</SectionLabel>
        <div className="grid grid-cols-3 gap-1.5">
          <ChoiceTile label="None" active={!layout} onClick={() => setLayout(null)} />
          {LAYOUTS.map(({ id, label }) => (
            <ChoiceTile key={id} label={label} active={layout?.id === id} onClick={() => setLayout(id)}>
              <LayoutPreview id={id} />
            </ChoiceTile>
          ))}
        </div>
      </div>

      {layout && (
        <>
          <Linebreak />

          <div className="flex flex-col gap-2">
            <SectionLabel>IMAGES</SectionLabel>
            <PanelHelp>
              {free > 0
                ? `${filled.length} of ${layout.slots.length} filled. Add images, or click an empty slot on the canvas.`
                : "Drag one image onto another to swap them."}
            </PanelHelp>
            {free > 0 && (
              <>
                <Button variant="ghost" size="block" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3 w-3" /> Add images
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={IMAGE_FILE_TYPES}
                  className="hidden"
                  onChange={onPick}
                  aria-label="Add images to layout"
                />
              </>
            )}
          </div>

          <Linebreak />

          <div className="flex flex-col gap-3">
            <SectionLabel>LAYOUT SETTINGS</SectionLabel>
            <ToggleGroup
              type="single"
              value={layout.align}
              onValueChange={(align) => align && updateLayout({ align: align as LayoutAlign })}
              className="w-full"
            >
              <ToggleGroupItem value="start" className="cursor-pointer">Start</ToggleGroupItem>
              <ToggleGroupItem value="center" className="cursor-pointer">Center</ToggleGroupItem>
              <ToggleGroupItem value="end" className="cursor-pointer">End</ToggleGroupItem>
            </ToggleGroup>
            {overlapping ? (
              <LabeledSlider
                label="OVERLAP"
                unit="%"
                value={layout.overlap}
                onChange={(overlap) => updateLayout({ overlap })}
              />
            ) : (
              <LabeledSlider
                label="SPACING"
                unit="%"
                value={layout.spacing}
                onChange={(spacing) => updateLayout({ spacing })}
              />
            )}
            <LabeledSlider
              label="SCALE"
              unit="%"
              min={30}
              max={100}
              value={layout.scale}
              onChange={(scale) => updateLayout({ scale })}
            />
            {!fixedSlots && (
              <SwitchRow
                label="SAME WIDTH"
                checked={layout.sameWidth}
                onCheckedChange={(sameWidth) => updateLayout({ sameWidth })}
              />
            )}
            <SwitchRow
              label="SAME SHAPE"
              description="Trims images to fit. Drag a picture to choose what shows."
              checked={layout.sameShape}
              onCheckedChange={(sameShape) => updateLayout({ sameShape })}
            />
          </div>

          {overlapping && filled.length >= 2 && <InFront layout={layout} />}

          {def?.labels && (
            <>
              <Linebreak />
              <div className="flex flex-col gap-2">
                <SwitchRow
                  label="LABELS"
                  checked={layout.showLabels}
                  onCheckedChange={(showLabels) => updateLayout({ showLabels })}
                />
                {layout.showLabels &&
                  layout.labels.map((text, i) => (
                    <Input
                      key={i}
                      aria-label={`Label ${i + 1}`}
                      value={text}
                      onChange={(event) =>
                        updateLayout({
                          labels: layout.labels.map((label, at) =>
                            at === i ? event.target.value : label,
                          ),
                        })
                      }
                    />
                  ))}
              </div>
            </>
          )}

          {hasDivider(layout.id) && (
            <>
              <Linebreak />
              <DividerSection divider={layout.divider} />
            </>
          )}

          <Linebreak />
          <CardsSection layout={layout} />

          <Linebreak />

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="block"
              className="cursor-pointer"
              disabled={filled.length < 2 || !styleSource}
              onClick={() => styleSource && matchLayoutStyle(styleSource)}
            >
              <Paintbrush className="h-3 w-3" /> Apply style to images
            </Button>
            <PanelHelp>
              {filled.length < 2
                ? "Add two or more images to the layout to share a style."
                : !styleSource
                  ? "Select an image in the layout, then apply its style to the rest."
                  : "Gives every image the selected one's shadow, corners, border and frame."}
            </PanelHelp>
          </div>

          <Linebreak />
          <CanvasSizeSection filled={filled.length} />
        </>
      )}
    </div>
  );
};
