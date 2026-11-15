import { useEffect, useRef } from "react";
import { Settings } from "lucide-react";
import { useEditor, type Tool } from "@/store/editor";
import { cn } from "@/lib/utils";
import { RAIL_GROUPS, groupOf } from "./railTools";

interface Props {
  hiddenTools: Record<string, boolean>;
}

const RAIL_BUTTON =
  "relative flex w-full flex-col items-center gap-0.75 rounded-lg px-0.5 py-2 text-[9.5px] font-medium tracking-[0.01em] transition-colors cursor-pointer";

export const LeftRail = ({ hiddenTools }: Props) => {
  const activeTool = useEditor((s) => s.activeTool);
  const leftPanelOpen = useEditor((s) => s.leftPanelOpen);
  const setActiveTool = useEditor((s) => s.setActiveTool);
  const setLeftPanelOpen = useEditor((s) => s.setLeftPanelOpen);
  const activeGroup = groupOf(activeTool)?.key;

  // Each group reopens on the tab last used in it.
  const lastTabs = useRef<Record<string, Tool>>({});
  useEffect(() => {
    if (activeGroup) lastTabs.current[activeGroup] = activeTool;
  }, [activeGroup, activeTool]);

  return (
    <nav aria-label="Tools" className="relative z-20 flex w-17 shrink-0 flex-col border-r border-hairline bg-panel">
      <div className="flex-1 overflow-y-auto px-1 py-1.5 [&::-webkit-scrollbar]:hidden scrollbar-none space-y-0.5">
        {RAIL_GROUPS.filter((group) => !hiddenTools[group.key]).map((group) => {
          const isActive = activeGroup === group.key && leftPanelOpen;
          return (
            <button
              key={group.key}
              type="button"
              title={group.hint}
              aria-pressed={isActive}
              onClick={() =>
                // The open group's button hides the panel, for more room on the canvas.
                activeGroup === group.key
                  ? setLeftPanelOpen(!leftPanelOpen)
                  : setActiveTool(lastTabs.current[group.key] ?? group.tabs[0].key)
              }
              className={cn(
                RAIL_BUTTON,
                isActive
                  ? "rail-active-underline bg-p-200/[0.14] text-text [&_svg]:text-t-400"
                  : "text-text-muted hover:bg-p-200/10 hover:text-text [&:hover_svg]:text-t-400",
              )}
            >
              <span className="flex items-center justify-center">{group.icon}</span>
              <span className="leading-[1.1]">{group.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-2 px-1 pb-3 pt-2">
        <div className="my-0.5 h-px w-7 bg-hairline" />
        <button
          type="button"
          aria-pressed={activeTool === "customize" && leftPanelOpen}
          onClick={() =>
            activeTool === "customize" ? setLeftPanelOpen(!leftPanelOpen) : setActiveTool("customize")
          }
          className={cn(
            RAIL_BUTTON,
            activeTool === "customize" && leftPanelOpen
              ? "bg-p-200/[0.14] text-text [&_svg]:text-t-400"
              : "text-text-muted hover:bg-p-200/10 hover:text-text [&:hover_svg]:text-t-400",
          )}
        >
          <span className="flex items-center justify-center">
            <Settings className="h-4.5 w-4.5" />
          </span>
          <span className="leading-[1.1]">Customize</span>
        </button>
      </div>
    </nav>
  );
};
