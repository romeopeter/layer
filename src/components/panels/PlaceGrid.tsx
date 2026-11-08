import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { choiceClass } from "./choice";

/** The nine places, left to right and top to bottom, each pointing where it sends something. */
const PLACES = [
  { label: "Top left", icon: ArrowUpLeft },
  { label: "Top", icon: ArrowUp },
  { label: "Top right", icon: ArrowUpRight },
  { label: "Left", icon: ArrowLeft },
  { label: "Center", icon: CircleDot },
  { label: "Right", icon: ArrowRight },
  { label: "Bottom left", icon: ArrowDownLeft },
  { label: "Bottom", icon: ArrowDown },
  { label: "Bottom right", icon: ArrowDownRight },
];

/**
 * Nine places as a full-width grid of arrows, the chosen one marked like every
 * other option. `labelPrefix` tells two grids in one panel apart for screen readers.
 */
export const PlaceGrid = ({
  chosen,
  onPick,
  compact = false,
  labelPrefix = "",
}: {
  /** 0 to 8, or null when it's at none of them. */
  chosen: number | null;
  onPick: (index: number) => void;
  compact?: boolean;
  labelPrefix?: string;
}) => (
  <div className="grid w-full grid-cols-3 gap-1.5">
    {PLACES.map(({ label, icon: Icon }, i) => {
      const here = chosen === i;
      return (
        <button
          key={label}
          type="button"
          title={label}
          aria-label={`${labelPrefix}${label}`}
          aria-pressed={here}
          onClick={() => onPick(i)}
          className={cn(
            "flex cursor-pointer items-center justify-center rounded-md border bg-chrome/50 transition-colors hover:text-text",
            compact ? "h-8" : "h-11",
            choiceClass(here),
            here ? "text-text" : "text-text-muted",
          )}
        >
          <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </button>
      );
    })}
  </div>
);
