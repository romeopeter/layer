import { useState, type ReactNode } from "react";
import {
  Instagram, Twitter, Facebook, Linkedin, Youtube, Globe, Dribbble, Sparkles, Link as LinkIcon,
} from "lucide-react";
import { useEditor } from "@/store/editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PLATFORMS, sizeName } from "@/lib/canvasSizes";

interface Props {
  onClose: () => void;
}

const ICONS: Record<string, ReactNode> = {
  Instagram: <Instagram className="h-3 w-3" />,
  "Twitter / X": <Twitter className="h-3 w-3" />,
  Bluesky: <Sparkles className="h-3 w-3" />,
  LinkedIn: <Linkedin className="h-3 w-3" />,
  Facebook: <Facebook className="h-3 w-3" />,
  YouTube: <Youtube className="h-3 w-3" />,
  Dribbble: <Dribbble className="h-3 w-3" />,
  "Product Hunt": <Globe className="h-3 w-3" />,
};

export const CanvasSizePicker = ({ onClose }: Props) => {
  const canvas = useEditor((s) => s.canvas);
  const setCanvas = useEditor((s) => s.setCanvas);
  const [w, setW] = useState(canvas.width);
  const [h, setH] = useState(canvas.height);
  const current = `${canvas.width} × ${canvas.height}`;

  const apply = (label: string, width: number, height: number) => {
    setCanvas({ label, width, height });
    onClose();
  };

  return (
    <div>
      <div className="grid grid-cols-4 gap-px bg-hairline">
        {PLATFORMS.map((p) => (
          <div key={p.name} className="min-h-[160px] bg-panel px-3.5 py-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-text">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-p-200/10 text-p-200">
                {ICONS[p.name]}
              </span>
              <span>{p.name}</span>
            </div>
            <div className="flex flex-col gap-px">
              {p.sizes.map((size) => {
                const { label, width, height } = size;
                const dim = `${width} × ${height}`;
                const active = current === dim;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => apply(sizeName(p, size), width, height)}
                    className={cn(
                      "flex items-center justify-between rounded px-1.5 py-1 text-left text-[11.5px] transition-colors",
                      active
                        ? "bg-t-400/[0.12] text-t-200"
                        : "text-text-muted hover:bg-p-200/[0.08] hover:text-text"
                    )}
                  >
                    <span>{label}</span>
                    <span className="font-mono text-[10.5px] text-text-faint">{dim}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-t border-hairline bg-panel-2 px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="sm">More size presets</Button>
          <Button variant="text" size="sm">+ Create size preset</Button>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-1 rounded-md border border-hairline bg-chrome px-2 py-1">
            <span className="font-mono text-[10px] font-semibold text-text-faint">W</span>
            <input
              aria-label="Width"
              value={w}
              onChange={(e) => setW(Number(e.target.value) || 0)}
              className="w-12 border-none bg-transparent font-mono text-[11px] text-text outline-none"
            />
          </label>
          <label className="flex items-center gap-1 rounded-md border border-hairline bg-chrome px-2 py-1">
            <span className="font-mono text-[10px] font-semibold text-text-faint">H</span>
            <input
              aria-label="Height"
              value={h}
              onChange={(e) => setH(Number(e.target.value) || 0)}
              className="w-12 border-none bg-transparent font-mono text-[11px] text-text outline-none"
            />
          </label>
          <Button variant="icon" size="iconSm" title="Lock aspect"><LinkIcon className="h-3 w-3" /></Button>
        </div>
        <div className="flex items-center justify-end gap-2.5">
          <Button variant="primary" size="sm" onClick={() => apply("Custom", w, h)}>
            Apply size
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-text-muted">
            <Input type="checkbox" defaultChecked className="h-3 w-auto accent-t-400" />
            Keep padding
          </label>
        </div>
      </div>
    </div>
  );
};
