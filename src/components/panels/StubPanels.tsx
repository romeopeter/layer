import { Sparkles } from "lucide-react";
import { useEditor } from "@/store/editor";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { KeyBadge } from "@/components/ui/key-badge";
import { Badge } from "@/components/ui/badge";
import { PanelTitle, SectionLabel, SwitchRow, PanelDesc } from "./primitives";

const Phase2Tag = () => <Badge variant="phase2" size="sm">PHASE 2</Badge>;

export const AiPanel = () => (
  <div className="flex flex-col gap-2.5 px-4 pb-6 pt-4">
    <PanelTitle badge={<Phase2Tag />}>AI</PanelTitle>
    <SectionLabel>DESCRIBE WHAT YOU WANT</SectionLabel>
    <Textarea
      defaultValue="Make this screenshot pop with a teal gradient background and 3D tilt."
      disabled
    />
    <Button variant="primary" size="block" disabled>
      <Sparkles className="h-3 w-3" /> Generate (Phase 2)
    </Button>
    <SectionLabel>QUICK ACTIONS</SectionLabel>
    <div className="flex flex-wrap gap-1.5">
      {["Bg from image", "Caption it", "Match brand", "Add motion"].map((q) => (
        <button
          key={q}
          type="button"
          disabled
          className="rounded-full border border-hairline bg-p-200/10 px-2.5 py-1 text-[11px] text-text opacity-50"
        >
          {q}
        </button>
      ))}
    </div>
  </div>
);

export const CustomizePanel = ({ onOpenModal }: { onOpenModal: () => void }) => {
  const showBadge = useEditor((s) => s.watermark.badge.show);
  const setBadge = useEditor((s) => s.setBadge);
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-6 pt-4">
      <PanelTitle>CUSTOMIZE</PanelTitle>
      <PanelDesc>Tailor the sidebar and theme to fit your flow.</PanelDesc>
      <Button variant="ghost" size="block" onClick={onOpenModal}>Customize Sidebar</Button>

      <SectionLabel>APPEARANCE</SectionLabel>
      <SwitchRow label="DARK MODE" checked onCheckedChange={() => {}} />
      <SwitchRow label="SHOW DOTTED GRID" checked onCheckedChange={() => {}} />
      <SwitchRow label="REDUCE MOTION" onCheckedChange={() => {}} />
      <SwitchRow label="SHOW WATERMARK" checked={showBadge} onCheckedChange={(show) => setBadge({ show })} />

      <SectionLabel>HOTKEYS</SectionLabel>
      <div className="flex flex-col gap-1">
        {[
          ["Export", "⌘E"], ["Copy", "⌘C"], ["Paste", "⌘V"],
          ["Undo", "⌘Z"], ["Delete", "⌫"],
        ].map(([label, key]) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-md bg-chrome/40 px-2 py-1.5 text-xs"
          >
            <span>{label}</span>
            <KeyBadge>{key}</KeyBadge>
          </div>
        ))}
      </div>
    </div>
  );
};
