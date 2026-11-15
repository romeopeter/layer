import type { ReactNode } from "react";
import { lazy, Suspense, useState } from "react";
import {
  ArrowLeft,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Hash,
  Highlighter,
  Image,
  Lock,
  LockOpen,
  MessageSquare,
  MoveUpRight,
  Pencil,
  PlusSquare,
  QrCode,
  Shapes,
  Slash,
  Smile,
  BadgeCheck,
  Trash2,
  Type,
} from "lucide-react";
import { useEditor } from "@/store/editor";
import type { LayerElement, MarkTool, ShapeElement, ShapeKind } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyBadge } from "@/components/ui/key-badge";
import { shapeDefaults, toolCategory } from "@/lib/markTools";
import { qrShape } from "@/lib/qr";
import { cn } from "@/lib/utils";
import {
  PanelDesc,
  PanelHelp,
  PanelTitle,
  } from "./primitives";
import { OptionGrid, StyleControls } from "./mark/StyleControls";
import { layerName } from "@/lib/layerNames";

/* ------------------------------------------------------------------------------------------- */

type MarkView = "emoji" | "icons" | "qr";

const ITEMS: {
  icon: ReactNode;
  label: string;
  tool?: MarkTool;
  view?: MarkView;
  opensImages?: boolean;
}[] = [
  {
    icon: <Type className="h-4 w-4" />,
    label: "Text",
    tool: { kind: "text" },
  },
  {
    icon: <Shapes className="h-4 w-4" />,
    label: "Shapes",
    tool: { kind: "box", shape: "rect" },
  },
  {
    icon: <MoveUpRight className="h-4 w-4" />,
    label: "Arrows",
    tool: { kind: "connector", shape: "arrow" },
  },
  {
    icon: <Slash className="h-4 w-4" />,
    label: "Lines",
    tool: { kind: "connector", shape: "line" },
  },
  {
    icon: <MessageSquare className="h-4 w-4" />,
    label: "Callouts",
    tool: { kind: "box", shape: "callout" },
  },
  {
    icon: <Highlighter className="h-4 w-4" />,
    label: "Highlight",
    tool: { kind: "stroke", shape: "highlight" },
  },
  {
    icon: <Pencil className="h-4 w-4" />,
    label: "Draw",
    tool: { kind: "stroke", shape: "pencil" },
  },
  {
    icon: <Hash className="size-4" />,
    label: "Number",
    tool: { kind: "stamp", shape: "number", preset: {} },
  },
  {
    icon: <BadgeCheck className="size-4.5" />,
    label: "Badge",
    tool: { kind: "stamp", shape: "badge", preset: {} },
  },
  {
    icon: <Smile className="h-4 w-4" />,
    label: "Emoji",
    view: "emoji",
  },
  {
    icon: <PlusSquare className="size-4.5" />,
    label: "Icons",
    view: "icons",
  },
  {
    icon: <QrCode className="h-4 w-4" />,
    label: "QR Code",
    view: "qr",
  },
  {
    icon: <Image className="h-4 w-4" />,
    label: "Image",
    opensImages: true,
  },
];

const PLACE_HINT = "Click the canvas to place it, or drag to set its size.";

const TOOL_COPY: Record<string, { title: string; hint: string }> = {
  number: { title: "NUMBER", hint: PLACE_HINT },
  badge: { title: "BADGE", hint: PLACE_HINT },
  emoji: { title: "EMOJI", hint: PLACE_HINT },
  icons: { title: "ICON", hint: PLACE_HINT },
  "qr-code": { title: "QR CODE", hint: PLACE_HINT },
  text: {
    title: "TEXT",
    hint: "Click the canvas and start typing, or drag to set how wide the text can run.",
  },
  shape: {
    title: "SHAPES",
    hint: "Drag on the canvas to draw. Hold Shift for equal sides.",
  },
  arrow: {
    title: "ARROWS",
    hint: "Drag from where it starts to where it points. Hold Shift to snap to 45°.",
  },
  line: {
    title: "LINES",
    hint: "Drag from one end to the other. Hold Shift to snap to 45°.",
  },
  callout: {
    title: "CALLOUTS",
    hint: "Drag to draw the bubble, then type. Move the dot to aim it.",
  },
  highlight: {
    title: "HIGHLIGHT",
    hint: "Drag over what you want to stand out. Hold Shift for a straight line.",
  },
  pencil: {
    title: "DRAW",
    hint: "Drag on the canvas to draw. Hold Shift for a straight line.",
  },
};

// These split the bundle: each picker carries its full data set.
const EmojiPicker = lazy(() =>
  import("./mark/EmojiPicker").then((m) => ({ default: m.EmojiPicker })),
);
const IconPicker = lazy(() =>
  import("./mark/IconPicker").then((m) => ({ default: m.IconPicker })),
);

const LayerIconButton = ({
  label,
  children,
  active = false,
  onClick,
}: {
  label: string;
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={active}
    title={label}
    onClick={(event) => {
      event.stopPropagation();
      onClick?.();
    }}
    className={cn(
      "flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-p-200/10 hover:text-text",
      active ? "text-t-400" : "text-text-faint",
    )}
  >
    {children}
  </button>
);

const LayerRow = ({
  element,
  index,
  active,
  dropTarget,
  onSelect,
  onToggleLock,
  onToggleHidden,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: {
  element: LayerElement;
  index: number;
  active: boolean;
  dropTarget: boolean;
  onSelect: () => void;
  onToggleLock: () => void;
  onToggleHidden: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) => (
  // A div, not a button: a row holds its own buttons, and HTML doesn't allow
  // buttons to nest.
  <div
    role="button"
    tabIndex={0}
    draggable
    onClick={onSelect}
    onKeyDown={(event) => {
      if (event.target === event.currentTarget && event.key === "Enter") {
        onSelect();
      }
    }}
    onDragStart={(event) => {
      event.dataTransfer.effectAllowed = "move";
      // WebKit won't begin a drag unless some data is set.
      event.dataTransfer.setData("text/plain", element.id);
      onDragStart();
    }}
    onDragOver={(event) => {
      event.preventDefault();
      onDragOver();
    }}
    onDragEnd={onDragEnd}
    onDrop={(event) => {
      event.preventDefault();
      onDrop();
    }}
    className={cn(
      "grid h-11 w-full cursor-pointer grid-cols-[18px_24px_1fr_auto] items-center gap-1.5 rounded-md border px-2 text-left text-[11px] transition-colors",
      active || dropTarget
        ? "border-p-300 bg-p-200/10 text-text"
        : "border-hairline bg-chrome/40 text-text-muted hover:border-p-300/70 hover:text-text",
      element.hidden && "opacity-50",
    )}
  >
    <GripVertical className="h-3.5 w-3.5 cursor-grab text-text-faint" />
    <span className="font-mono text-[10px] text-text-faint">{index + 1}.</span>
    <span
      className={cn(
        "truncate font-semibold tracking-[0.04em]",
        element.type !== "text" && "uppercase",
      )}
    >
      {layerName(element)}
    </span>
    <span className="flex items-center gap-0.5">
      <LayerIconButton
        label={element.locked ? "Unlock" : "Lock"}
        active={element.locked}
        onClick={onToggleLock}
      >
        {element.locked ? (
          <Lock className="h-3.5 w-3.5" />
        ) : (
          <LockOpen className="h-3.5 w-3.5" />
        )}
      </LayerIconButton>
      <LayerIconButton
        label={element.hidden ? "Show" : "Hide"}
        active={element.hidden}
        onClick={onToggleHidden}
      >
        {element.hidden ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </LayerIconButton>
      <LayerIconButton label="Duplicate" onClick={onDuplicate}>
        <Copy className="h-3.5 w-3.5" />
      </LayerIconButton>
      <LayerIconButton label="Delete" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />
      </LayerIconButton>
    </span>
  </div>
);

/** Header for a screen you came to from the add grid, with a way back. */
const SubviewHeader = ({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) => (
  <div className="flex items-center gap-1.5 border-b border-border px-3 py-3">
    <Button
      type="button"
      variant="icon"
      size="iconSm"
      title="Back"
      aria-label="Back"
      onClick={onBack}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
    </Button>
    <PanelTitle className="mb-0">{title}</PanelTitle>
  </div>
);

const QrForm = ({ onAdd }: { onAdd: (text: string) => void }) => {
  const [text, setText] = useState("");
  const value = text.trim();
  const tooLong = value !== "" && !qrShape(value);

  return (
    <form
      className="flex flex-col gap-2.5 px-4 pb-6 pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (value && !tooLong) onAdd(value);
      }}
    >
      <PanelDesc>Scanning the code opens this link or shows this text.</PanelDesc>
      <Input
        autoFocus
        aria-label="QR code link or text"
        placeholder="https://"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {tooLong && (
        <PanelHelp>This is too long for a QR code. Try a shorter link.</PanelHelp>
      )}
      <Button type="submit" size="block" disabled={!value || tooLong}>
        Next
      </Button>
    </form>
  );
};

/** The panel while a tool is armed: pick a variant, set a style, drag on canvas. */
const ToolPanel = ({ tool }: { tool: MarkTool }) => {
  const setMarkTool = useEditor((s) => s.setMarkTool);
  const setMarkStyle = useEditor((s) => s.setMarkStyle);
  const markStyles = useEditor((s) => s.markStyles);
  const elements = useEditor((s) => s.elements);
  const category = toolCategory(tool);
  const copy =
    TOOL_COPY[tool.kind === "stamp" ? tool.shape : (category ?? "text")];

  const subject: ShapeElement | null =
    tool.kind !== "text"
      ? {
          id: "tool",
          type: "shape",
          shape: tool.shape,
          x: 0,
          y: 0,
          width: 320,
          height: 320,
          rotation: 0,
          opacity: 1,
          fill: "#534AB7",
          stroke: "#FFFFFF",
          strokeWidth: 0,
          cornerRadius: 0,
          dashed: false,
          ...(category ? markStyles[category] : {}),
          ...(tool.kind === "stamp"
            ? { ...shapeDefaults(tool.shape, elements), ...tool.preset }
            : {}),
        }
      : null;

  const applyStyle = ({ shape, ...patch }: Partial<ShapeElement>) => {
    if (tool.kind === "stamp") {
      setMarkTool({ ...tool, preset: { ...tool.preset, ...patch } });
      return;
    }
    if (shape && tool.kind === "box") setMarkTool({ kind: "box", shape });
    if (category) setMarkStyle(category, patch);
  };

  return (
    <div className="flex h-full flex-col">
      <SubviewHeader title={copy.title} onBack={() => setMarkTool(null)} />
      <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
        <PanelDesc>{copy.hint}</PanelDesc>
        {subject?.shape === "emoji" && (
          <span className="text-4xl leading-none">{subject.text}</span>
        )}
        {subject && (
          <StyleControls subject={subject} onChange={applyStyle} showSample />
        )}
        <PanelHelp>
          Press <KeyBadge>Esc</KeyBadge> to cancel.
        </PanelHelp>
      </div>
    </div>
  );
};

/** Add › Elements: shapes, arrows, callouts, highlighter, emoji, icons, QR codes and more. */
export const ElementsPanel = () => {
  const [view, setView] = useState<MarkView | null>(null);
  const setActiveTool = useEditor((s) => s.setActiveTool);
  const markTool = useEditor((s) => s.markTool);
  const setMarkTool = useEditor((s) => s.setMarkTool);

  const pickItem = (item: (typeof ITEMS)[number]) => {
    if (item.tool) setMarkTool(item.tool);
    if (item.view) setView(item.view);
    if (item.opensImages) setActiveTool("images");
  };

  const placeFromView = (shape: ShapeKind, preset: Partial<ShapeElement>) => {
    setMarkTool({ kind: "stamp", shape, preset });
    setView(null);
  };

  if (markTool) return <ToolPanel tool={markTool} />;

  if (view) {
    const titles: Record<MarkView, string> = {
      emoji: "EMOJI",
      icons: "ICONS",
      qr: "QR CODE",
    };

    return (
      <div className="flex h-full flex-col">
        <SubviewHeader title={titles[view]} onBack={() => setView(null)} />
        <Suspense fallback={<PanelHelp className="px-4 pt-4">Loading…</PanelHelp>}>
          {view === "emoji" && <EmojiPicker onPick={(text) => placeFromView("emoji", { text })} />}
          {view === "icons" && (
            <IconPicker onPick={(text, iconPath) => placeFromView("icons", { text, iconPath })} />
          )}
        </Suspense>
        {view === "qr" && <QrForm onAdd={(text) => placeFromView("qr-code", { text })} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 px-4 pb-6 pt-4">
      <OptionGrid options={ITEMS} onPick={(index) => pickItem(ITEMS[index])} />
      <PanelHelp>Pick one, then click or drag on the canvas to place it.</PanelHelp>
    </div>
  );
};

/** Design › Layers: everything on the canvas, front-most first, to select, lock, hide and reorder. */
export const LayersPanel = () => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const elements = useEditor((s) => s.elements);
  const selectedIds = useEditor((s) => s.selectedIds);
  const selectElement = useEditor((s) => s.selectElement);
  const updateElement = useEditor((s) => s.updateElement);
  const deleteElement = useEditor((s) => s.deleteElement);
  const duplicateElement = useEditor((s) => s.duplicateElement);
  const reorderElement = useEditor((s) => s.reorderElement);

  // Front-most first, so the list reads the way the canvas stacks.
  const layers = elements.slice().reverse();

  const endRowDrag = () => {
    setDraggingId(null);
    setDropTargetId(null);
  };

  if (!layers.length) {
    return (
      <div className="px-4 pb-6 pt-4">
        <PanelHelp>Nothing on the canvas yet. Add images, text or elements, and they'll be listed here.</PanelHelp>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 px-4 pb-6 pt-4">
      {layers.map((element, index) => (
        <LayerRow
          key={element.id}
          element={element}
          index={index}
          active={selectedIds.includes(element.id)}
          dropTarget={element.id === dropTargetId && element.id !== draggingId}
          onSelect={() => selectElement(element.id)}
          onToggleLock={() => updateElement(element.id, { locked: !element.locked })}
          onToggleHidden={() => updateElement(element.id, { hidden: !element.hidden })}
          onDragStart={() => setDraggingId(element.id)}
          onDragOver={() => setDropTargetId(element.id)}
          onDragEnd={endRowDrag}
          onDrop={() => {
            if (draggingId) reorderElement(draggingId, element.id);
            endRowDrag();
          }}
          onDuplicate={() => duplicateElement(element.id)}
          onDelete={() => deleteElement(element.id)}
        />
      ))}
      <PanelHelp>Drag a row to move it in front of or behind the others.</PanelHelp>
    </div>
  );
};
