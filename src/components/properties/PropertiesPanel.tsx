import { useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Frame,
  Image as ImageIcon,
  Layers,
  RefreshCw,
  Shapes,
  Type,
} from "lucide-react";
import { useEditor } from "@/store/editor";
import type { ImageElement, LayerElement, ShapeElement, TextElement } from "@/types";
import { cn } from "@/lib/utils";
import { fileToDataURL } from "@/lib/importers";
import { layerName } from "@/lib/layerNames";
import { layoutOf } from "@/lib/layouts";
import { activeKit } from "@/lib/brand/kits";
import { DEVICES } from "@/lib/mockups";
import { CAMERA_MOVES, labelOf } from "@/lib/motion/moves";
import { hasMotion, movesOnItsOwn } from "@/lib/motion/normalise";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CanvasSizePicker } from "@/components/CanvasSizePicker";
import { LabeledSlider, PanelHelp, PanelLink } from "@/components/panels/primitives";
import { CornerControls } from "@/components/panels/CornerControls";
import { ShadowControls } from "@/components/panels/ShadowControls";
import { PositionControls } from "@/components/panels/PositionControls";
import { TiltControls } from "@/components/panels/TiltControls";
import { ImageEditSection } from "@/components/panels/ImageEditSection";
import { StyleControls } from "@/components/panels/mark/StyleControls";
import { ElementMotionControls } from "@/components/panels/ElementMotionControls";
import { SpacingControls, TextColorControls, TypographyControls } from "@/components/panels/TextControls";

/* ------------------------------------------------------------------------------------------- */

/**
 * One group of settings, opened and closed by its title. Which are open is kept
 * per object type for the session, so choosing another image keeps the same
 * sections open.
 */
export const PropertySection = ({
  id,
  title,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) => {
  const open = useEditor((s) => s.openSections[id] ?? defaultOpen);
  const setOpen = useEditor((s) => s.setSectionOpen);
  return (
    <section className="border-b border-hairline" data-section={id}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(id, !open)}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-p-200 transition-colors hover:text-text"
      >
        {title}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="flex flex-col gap-2.5 px-4 pb-4">{children}</div>}
    </section>
  );
};

/** What's being edited, at the top, so canvas and object settings are never confused. */
const Heading = ({ icon, kind, name }: { icon: ReactNode; kind: string; name?: string }) => (
  <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-p-200/10 text-t-400">{icon}</span>
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-p-200">{kind}</div>
      {name && <div className="truncate text-[12px] text-text">{name}</div>}
    </div>
  </div>
);

/** A setting that lives in a left-panel tab: what it is now, and a way there. */
const Jump = ({ value, action, onClick }: { value: string; action: string; onClick: () => void }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="truncate text-[12px] text-text">{value}</span>
    <Button variant="outline" size="sm" className="shrink-0 cursor-pointer" onClick={onClick}>
      {action}
    </Button>
  </div>
);

const OpacityControl = ({ el }: { el: LayerElement }) => {
  const update = useEditor((s) => s.updateElement);
  return (
    <LabeledSlider
      label="OPACITY"
      unit="%"
      max={100}
      value={Math.round(el.opacity * 100)}
      onChange={(v) => update(el.id, { opacity: v / 100 })}
    />
  );
};

/* ------------------------------------------------------------------------------------------- */

/** Swaps the picture, keeping the image's place, width and settings. */
const ReplaceImage = ({ image }: { image: ImageElement }) => {
  const update = useEditor((s) => s.updateElement);
  const inputRef = useRef<HTMLInputElement>(null);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file?.type.startsWith("image/")) return;
    const src = await fileToDataURL(file);
    const picture = new Image();
    picture.src = src;
    await picture.decode();
    update(image.id, {
      src,
      naturalWidth: picture.naturalWidth,
      naturalHeight: picture.naturalHeight,
      crop: undefined,
      // A frame sets its own shape; otherwise the new picture keeps its own proportions.
      ...(image.deviceFrame ? {} : { height: (image.width * picture.naturalHeight) / picture.naturalWidth }),
    });
  };
  return (
    <>
      <Button variant="outline" size="block" className="cursor-pointer" onClick={() => inputRef.current?.click()}>
        <RefreshCw className="h-3 w-3" /> Replace image
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={onFile}
        aria-label="Choose a picture to replace this one"
      />
    </>
  );
};

const ImageProperties = ({ image }: { image: ImageElement }) => {
  const setActiveTool = useEditor((s) => s.setActiveTool);
  const device = image.deviceFrame && DEVICES.find((d) => d.id === image.deviceFrame?.device);
  return (
    <>
      <Heading icon={<ImageIcon className="h-3.5 w-3.5" />} kind="Image" />
      <PropertySection id="image.edit" title="Edit" defaultOpen>
        <ReplaceImage image={image} />
        <ImageEditSection image={image} />
      </PropertySection>
      <PropertySection id="image.appearance" title="Appearance" defaultOpen>
        <OpacityControl el={image} />
        <CornerControls el={image} />
      </PropertySection>
      <PropertySection id="image.shadow" title="Shadow">
        <ShadowControls el={image} />
      </PropertySection>
      <PropertySection id="image.3d" title="3D">
        <TiltControls image={image} />
      </PropertySection>
      <PropertySection id="image.mockup" title="Mockup">
        <Jump
          value={device ? device.label : "None"}
          action={device ? "Change" : "Choose a mockup"}
          onClick={() => setActiveTool("mockup")}
        />
      </PropertySection>
      <PropertySection id="image.position" title="Position & size">
        <PositionControls el={image} />
      </PropertySection>
      <PropertySection id="image.motion" title="Animate">
        <ElementMotionControls el={image} />
      </PropertySection>
    </>
  );
};

const TextProperties = ({ text }: { text: TextElement }) => (
  <>
    <Heading icon={<Type className="h-3.5 w-3.5" />} kind="Text" name={layerName(text)} />
    <PropertySection id="text.typography" title="Typography" defaultOpen>
      <TypographyControls text={text} />
    </PropertySection>
    <PropertySection id="text.spacing" title="Spacing" defaultOpen>
      <SpacingControls text={text} />
    </PropertySection>
    <PropertySection id="text.appearance" title="Appearance" defaultOpen>
      <TextColorControls text={text} />
      <OpacityControl el={text} />
    </PropertySection>
    <PropertySection id="text.shadow" title="Shadow">
      <ShadowControls el={text} />
    </PropertySection>
    <PropertySection id="text.position" title="Position & size">
      <PositionControls el={text} />
    </PropertySection>
    <PropertySection id="text.motion" title="Animate">
      <ElementMotionControls el={text} />
    </PropertySection>
  </>
);

/** Marks bring their own fill, border, corner, shadow (Effect) and opacity, in StyleControls. */
const ShapeProperties = ({ shape }: { shape: ShapeElement }) => {
  const update = useEditor((s) => s.updateElement);
  return (
    <>
      <Heading icon={<Shapes className="h-3.5 w-3.5" />} kind="Element" name={layerName(shape)} />
      <PropertySection id="shape.style" title="Style" defaultOpen>
        <StyleControls subject={shape} onChange={(patch) => update(shape.id, patch)} />
      </PropertySection>
      {!shape.connector && (
        <PropertySection id="shape.position" title="Position & size">
          <PositionControls el={shape} />
        </PropertySection>
      )}
      <PropertySection id="shape.motion" title="Animate">
        <ElementMotionControls el={shape} />
      </PropertySection>
    </>
  );
};

/** The design's animation in a few words, such as "Push in · 6s · 3 objects". */
const animationSummary = (s: ReturnType<typeof useEditor.getState>) => {
  if (!hasMotion(s.motion, s.elements, s.background)) return "No motion";
  const objects = s.elements.filter(movesOnItsOwn).length;
  return [
    labelOf(CAMERA_MOVES, s.motion.camera),
    `${s.motion.length}s`,
    ...(objects > 0 ? [objects === 1 ? "1 object" : `${objects} objects`] : []),
  ].join(" · ");
};

const CanvasProperties = () => {
  const canvas = useEditor((s) => s.canvas);
  const background = useEditor((s) => s.background);
  const layout = useEditor((s) => s.layout);
  const layerCount = useEditor((s) => s.elements.length);
  const watermark = useEditor((s) => s.watermark);
  const kit = useEditor(activeKit);
  const setActiveTool = useEditor((s) => s.setActiveTool);
  const motionSummary = useEditor(animationSummary);
  const [sizeOpen, setSizeOpen] = useState(false);

  const backgroundName = {
    solid: "Solid color",
    gradient: "Gradient",
    image: "Image",
    pattern: "Pattern",
    abstract: "Abstract",
  }[background.mode];
  const own = watermark.own.kind === "none" ? "" : `, your ${watermark.own.kind}`;

  return (
    <>
      <Heading icon={<Frame className="h-3.5 w-3.5" />} kind="Canvas" name="Click anything on it to change it" />
      <PropertySection id="canvas.size" title="Size" defaultOpen>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[12px] text-text">
            {canvas.width} × {canvas.height}
          </span>
          <Popover open={sizeOpen} onOpenChange={setSizeOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="cursor-pointer">
                Change size
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-205 max-w-[calc(100vw-32px)] p-0" align="end" sideOffset={6}>
              <CanvasSizePicker onClose={() => setSizeOpen(false)} />
            </PopoverContent>
          </Popover>
        </div>
      </PropertySection>
      <PropertySection id="canvas.background" title="Background" defaultOpen>
        <Jump value={backgroundName} action="Edit background" onClick={() => setActiveTool("background")} />
      </PropertySection>
      <PropertySection id="canvas.layout" title="Layout" defaultOpen>
        <Jump
          value={layout ? (layoutOf(layout.id)?.label ?? "Layout") : "None"}
          action={layout ? "Change" : "Choose a layout"}
          onClick={() => setActiveTool("layout")}
        />
      </PropertySection>
      <PropertySection id="canvas.layers" title="Layers" defaultOpen>
        <Jump
          value={layerCount === 1 ? "1 layer" : `${layerCount} layers`}
          action="Show layers"
          onClick={() => setActiveTool("layers")}
        />
      </PropertySection>
      <PropertySection id="canvas.watermark" title="Watermark">
        <Jump
          value={(watermark.badge.show ? "Layer badge" : "No badge") + own}
          action="Edit"
          onClick={() => setActiveTool("watermark")}
        />
      </PropertySection>
      <PropertySection id="canvas.animate" title="Animate">
        <Jump value={motionSummary} action="Open Animate" onClick={() => setActiveTool("motion")} />
      </PropertySection>
      <PropertySection id="canvas.brand" title="Brand">
        <Jump
          value={kit ? kit.name : "No brand kit"}
          action={kit ? "Open brand kit" : "Make a brand kit"}
          onClick={() => setActiveTool("brands")}
        />
      </PropertySection>
    </>
  );
};

/* ------------------------------------------------------------------------------------------- */

/**
 * The right-hand panel: the settings of whatever is selected, or the canvas's
 * when nothing is. It reuses each panel's own controls, so there's one
 * implementation of every setting, reached from here.
 */
export const PropertiesPanel = () => {
  const selectedIds = useEditor((s) => s.selectedIds);
  const selected = useEditor((s) => s.elements.find((el) => el.id === s.selectedIds[0]));

  let body: ReactNode;
  if (selectedIds.length > 1) {
    body = (
      <>
        <Heading icon={<Layers className="h-3.5 w-3.5" />} kind={`${selectedIds.length} layers`} />
        <div className="px-4 py-3">
          <PanelHelp>Drag to move them together. Select one on its own to change its settings.</PanelHelp>
          <PanelHelp>
            To bring them in one after another, use
            <PanelLink onClick={() => useEditor.getState().setActiveTool("motion")}>Animate</PanelLink>
          </PanelHelp>
        </div>
      </>
    );
  } else if (selected?.type === "image") {
    body = <ImageProperties key={selected.id} image={selected} />;
  } else if (selected?.type === "text") {
    body = <TextProperties key={selected.id} text={selected} />;
  } else if (selected?.type === "shape") {
    body = <ShapeProperties key={selected.id} shape={selected} />;
  } else {
    body = <CanvasProperties />;
  }

  return (
    <aside
      aria-label="Properties"
      className="z-10 w-72 shrink-0 overflow-y-auto border-l border-hairline bg-panel"
    >
      {body}
    </aside>
  );
};
