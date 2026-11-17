import { useEffect, useState } from "react";
import { Download, Film, Clipboard, ChevronDown, FolderOpen, Save } from "lucide-react";
import { useEditor } from "@/store/editor";
import {
  exportCanvas, copyCanvasToClipboard, downloadProject, openProjectFile,
} from "@/lib/exporters";
import { hasMotion } from "@/lib/motion/normalise";
import { canMakeMp4, GIF_SIZES, type AnimationFormat, type GifSize } from "@/lib/motion/exportAnimation";
import { KeyBadge } from "@/components/ui/key-badge";
import { Separator } from "@/components/ui/separator";
import { PanelLink } from "@/components/panels/primitives";
import type { AnimationSettings } from "./useAnimationExport";

interface Props {
  onClose: () => void;
  /** Starts making an MP4 or GIF, which shows its own progress. */
  onExportAnimation: (settings: AnimationSettings) => void;
}

/** Whether this system can make MP4s, once known. */
const useMp4 = () => {
  const [able, setAble] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    void canMakeMp4().then((value) => current && setAble(value));
    return () => {
      current = false;
    };
  }, []);
  return able;
};

const SETTING_ROW = "flex items-center justify-between rounded-md bg-chrome/40 px-2 py-1.5 text-xs";
const SETTING_SELECT = "rounded border border-hairline bg-transparent px-1.5 py-0.5 font-mono text-[11px] text-text";

interface RowProps {
  icon: React.ReactNode;
  label: string;
  right?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

const Row = ({ icon, label, right, onClick, disabled }: RowProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-text transition-colors hover:bg-p-200/[0.06] disabled:opacity-50"
  >
    <span className="flex h-3.5 w-3.5 items-center justify-center text-text-muted">{icon}</span>
    <span className="flex-1">{label}</span>
    {right}
  </button>
);

export const ExportMenu = ({ onClose, onExportAnimation }: Props) => {
  const [adv, setAdv] = useState(false);
  const [scale, setScale] = useState(2);
  const [fps, setFps] = useState(30);
  const [gifSize, setGifSize] = useState<GifSize>("medium");
  const moves = useEditor((s) => hasMotion(s.motion, s.elements, s.background));
  const setActiveTool = useEditor((s) => s.setActiveTool);
  const mp4 = useMp4();
  const showBadge = useEditor((s) => s.watermark.badge.show);
  const setBadge = useEditor((s) => s.setBadge);
  // For this export only: the background stays on the canvas.
  const [withoutBackground, setWithoutBackground] = useState(false);
  const options = { withoutBackground };

  const close = (fn: () => void | Promise<void>) => async () => {
    await fn();
    onClose();
  };

  const animate = (format: AnimationFormat) => () => {
    onClose();
    onExportAnimation({ format, scale, fps, gifSize });
  };
  // Why an animation can't be made right now, if it can't.
  const stillOnly = !moves
    ? "nothing"
    : withoutBackground
      ? "background"
      : null;

  return (
    <div className="text-text">
      <div className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-p-200">
        EXPORT OPTIONS
      </div>
      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs hover:bg-p-200/[0.06]">
        {/* The same switch as the Watermark panel's Show badge. */}
        <input
          type="checkbox"
          checked={!showBadge}
          onChange={(e) => setBadge({ show: !e.target.checked })}
          className="accent-t-400"
        />
        <span className="flex-1">Remove watermark</span>
      </label>
      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs hover:bg-p-200/[0.06]">
        <input
          type="checkbox"
          checked={withoutBackground}
          onChange={(e) => setWithoutBackground(e.target.checked)}
          className="accent-t-400"
        />
        <span className="flex-1">Remove background</span>
      </label>
      {withoutBackground && (
        <p className="px-2.5 pb-1 text-[10.5px] text-text-faint">PNG and WebP keep it see-through. JPG can't.</p>
      )}
      <Separator className="my-1.5" />
      <Row icon={<Download className="h-3.5 w-3.5" />} label="Download PNG"
           right={<KeyBadge>⌘E</KeyBadge>}
           onClick={close(() => exportCanvas("png", scale, options))} />
      <Row icon={<Download className="h-3.5 w-3.5" />} label="Download JPG"
           disabled={withoutBackground}
           onClick={close(() => exportCanvas("jpg", scale))} />
      <Row icon={<Download className="h-3.5 w-3.5" />} label="Download WebP"
           onClick={close(() => exportCanvas("webp", scale, options))} />
      <Separator className="my-1.5" />
      <Row icon={<Film className="h-3.5 w-3.5" />} label="Download MP4"
           disabled={!!stillOnly || mp4 !== true}
           onClick={animate("mp4")} />
      <Row icon={<Film className="h-3.5 w-3.5" />} label="Download GIF"
           disabled={!!stillOnly}
           onClick={animate("gif")} />
      {stillOnly === "nothing" && (
        <p className="flex flex-wrap items-center gap-1 px-2.5 pb-1 text-[10.5px] text-text-faint">
          Add motion in
          <PanelLink
            onClick={() => {
              setActiveTool("motion");
              onClose();
            }}
          >
            Animate
          </PanelLink>
          first.
        </p>
      )}
      {stillOnly === "background" && (
        <p className="px-2.5 pb-1 text-[10.5px] text-text-faint">Videos and GIFs keep their background.</p>
      )}
      {!stillOnly && mp4 === false && (
        <p className="px-2.5 pb-1 text-[10.5px] text-text-faint">This system can't make MP4s. GIF still works.</p>
      )}
      <Separator className="my-1.5" />
      <Row icon={<Clipboard className="h-3.5 w-3.5" />} label="Copy to clipboard"
           right={<KeyBadge>⌘C</KeyBadge>}
           onClick={close(() => copyCanvasToClipboard(options))} />
      <Separator className="my-1.5" />
      <Row icon={<Save className="h-3.5 w-3.5" />} label="Save project (.layer)"
           onClick={close(downloadProject)} />
      <Row icon={<FolderOpen className="h-3.5 w-3.5" />} label="Open project (.layer)"
           onClick={close(openProjectFile)} />
      <button
        type="button"
        onClick={() => setAdv(!adv)}
        className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-p-200 hover:bg-p-200/[0.06]"
      >
        ADVANCE OPTIONS
        <ChevronDown className={"h-3 w-3 transition-transform " + (adv ? "rotate-180" : "")} />
      </button>
      {adv && (
        <div className="flex flex-col gap-1 px-2.5 pb-2">
          <div className={SETTING_ROW}>
            <span>Scale</span>
            <select
              aria-label="Scale"
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className={SETTING_SELECT}
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={3}>3×</option>
            </select>
          </div>
          <div className={SETTING_ROW}>
            <span>Video frame rate</span>
            <select
              aria-label="Video frame rate"
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              className={SETTING_SELECT}
            >
              <option value={30}>30 fps</option>
              <option value={60}>60 fps</option>
            </select>
          </div>
          <div className={SETTING_ROW}>
            <span>GIF size</span>
            <select
              aria-label="GIF size"
              value={gifSize}
              onChange={(e) => setGifSize(e.target.value as GifSize)}
              className={SETTING_SELECT}
            >
              {GIF_SIZES.map((size) => (
                <option key={size.id} value={size.id}>
                  {size.label} · {size.side}px
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
};
