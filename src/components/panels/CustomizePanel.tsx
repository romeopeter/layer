import { useEditor } from "@/store/editor";
import { reducesMotion } from "@/lib/preferences";
import { Button } from "@/components/ui/button";
import { KeyBadge } from "@/components/ui/key-badge";
import { PanelDesc, PanelTitle, SectionLabel, SwitchRow } from "./primitives";

const HOTKEYS = [
  ["Save", "⌘S"],
  ["Open", "⌘O"],
  ["Export PNG", "⌘E"],
  ["Export…", "⇧⌘E"],
  ["Copy", "⌘C"],
  ["Paste", "⌘V"],
  ["Duplicate", "⌘D"],
  ["Select all", "⌘A"],
  ["Undo", "⌘Z"],
  ["Redo", "⇧⌘Z"],
  ["Zoom in / out", "⌘= ⌘−"],
  ["Fit to window", "⌘0"],
  ["Show grid", "⇧G"],
  ["Delete", "⌫"],
];

/** How Layer is set up: the rail, how it looks, and its shortcuts. Kept for next time. */
export const CustomizePanel = ({ onOpenModal }: { onOpenModal: () => void }) => {
  const showBadge = useEditor((s) => s.watermark.badge.show);
  const setBadge = useEditor((s) => s.setBadge);
  const preferences = useEditor((s) => s.preferences);
  const setPreferences = useEditor((s) => s.setPreferences);

  return (
    <div className="flex flex-col gap-2.5 px-4 pb-6 pt-4">
      <PanelTitle>CUSTOMIZE</PanelTitle>
      <PanelDesc>Tailor the sidebar and theme to fit your flow.</PanelDesc>
      <Button variant="ghost" size="block" className="cursor-pointer" onClick={onOpenModal}>
        Customize Sidebar
      </Button>

      <SectionLabel>APPEARANCE</SectionLabel>
      <SwitchRow
        label="DARK MODE"
        description="Off shows Layer in light colors. Your design looks the same either way."
        checked={preferences.theme === "dark"}
        onCheckedChange={(dark) => setPreferences({ theme: dark ? "dark" : "light" })}
      />
      <SwitchRow
        label="SHOW DOTTED GRID"
        description="The dots behind the canvas. They never export."
        checked={preferences.dottedGrid}
        onCheckedChange={(dottedGrid) => setPreferences({ dottedGrid })}
      />
      <SwitchRow
        label="REDUCE MOTION"
        description="Menus, dialogs and panels appear without moving. Follows your system until you change it."
        checked={reducesMotion(preferences)}
        onCheckedChange={(reduceMotion) => setPreferences({ reduceMotion })}
      />
      <SwitchRow
        label="SHOW WATERMARK"
        description="The Layer badge on this design and its exports."
        checked={showBadge}
        onCheckedChange={(show) => setBadge({ show })}
      />

      <SectionLabel>HOTKEYS</SectionLabel>
      <div className="flex flex-col gap-1">
        {HOTKEYS.map(([label, key]) => (
          <div key={label} className="flex items-center justify-between rounded-md bg-chrome/40 px-2 py-1.5 text-xs">
            <span>{label}</span>
            <KeyBadge>{key}</KeyBadge>
          </div>
        ))}
      </div>
    </div>
  );
};
