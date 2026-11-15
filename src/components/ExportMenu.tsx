import { useState } from "react";
import { Download, Film, Clipboard, ChevronDown, FolderOpen, Save } from "lucide-react";
import { useEditor } from "@/store/editor";
import {
  exportCanvas, copyCanvasToClipboard, downloadProject, openProjectFile,
} from "@/lib/exporters";
import { Badge } from "@/components/ui/badge";
import { KeyBadge } from "@/components/ui/key-badge";
import { Separator } from "@/components/ui/separator";

interface Props {
  onClose: () => void;
}

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

export const ExportMenu = ({ onClose }: Props) => {
  const [adv, setAdv] = useState(false);
  const [scale, setScale] = useState(2);
  const showBadge = useEditor((s) => s.watermark.badge.show);
  const setBadge = useEditor((s) => s.setBadge);
  // For this export only: the background stays on the canvas.
  const [withoutBackground, setWithoutBackground] = useState(false);
  const options = { withoutBackground };

  const close = (fn: () => void | Promise<void>) => async () => {
    await fn();
    onClose();
  };

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
      <Row icon={<Film className="h-3.5 w-3.5" />} label="Download GIF"
           right={<Badge variant="phase2" size="sm">PHASE 2</Badge>} disabled />
      <Row icon={<Film className="h-3.5 w-3.5" />} label="Download MP4"
           right={<Badge variant="phase2" size="sm">PHASE 2</Badge>} disabled />
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
          <div className="flex items-center justify-between rounded-md bg-chrome/40 px-2 py-1.5 text-xs">
            <span>Scale</span>
            <select
              aria-label="Scale"
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="rounded border border-hairline bg-transparent px-1.5 py-0.5 font-mono text-[11px] text-text"
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={3}>3×</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};
