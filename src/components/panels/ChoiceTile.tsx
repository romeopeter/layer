import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { choiceClass } from "./choice";

/** A picture and a name to choose, as in Layout and Animate. */
export const ChoiceTile = ({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children?: ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cn(
      "flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border p-1.5 text-center text-[9.5px] leading-tight transition-colors hover:text-text",
      choiceClass(active),
      active ? "text-text" : "text-text-muted",
    )}
  >
    {children}
    <span>{label}</span>
  </button>
);
