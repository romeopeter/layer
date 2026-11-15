import { useEffect, useState } from "react";
import { useEditor, DEFAULT_BACKGROUND } from "@/store/editor";
import { cn } from "@/lib/utils";
import { DESIGN_LOOKS, lookBackground, type DesignLook } from "@/lib/looks";
import { backgroundThumb } from "@/lib/background/thumb";
import { Badge } from "@/components/ui/badge";
import { PanelHelp, SectionLabel } from "./primitives";
import { choiceClass } from "./choice";

/** Each look's own background, made once, so its thumbnail is drawn once. */
const LOOK_BACKGROUNDS = new Map(DESIGN_LOOKS.map((look) => [look.id, lookBackground(look, DEFAULT_BACKGROUND)]));

const LookTile = ({ look, onApply }: { look: DesignLook; onApply: () => void }) => {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    const background = LOOK_BACKGROUNDS.get(look.id);
    if (background) void backgroundThumb(background).then((url) => current && setThumb(url));
    return () => {
      current = false;
    };
  }, [look.id]);

  return (
    <button
      type="button"
      aria-label={`${look.label} look`}
      onClick={onApply}
      className={cn(
        "group flex cursor-pointer flex-col gap-1.5 rounded-md border bg-chrome/50 p-1.5 text-left transition-colors",
        choiceClass(false),
      )}
    >
      {/* A small picture of the look: its background, its type, and an image's corners and shadow. */}
      <span
        className="relative flex aspect-[4/3] w-full items-end overflow-hidden rounded-sm bg-chrome bg-cover bg-center p-2"
        style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}
      >
        <span
          aria-hidden
          className="absolute right-2 top-2 h-[45%] w-[38%] bg-p-200/60"
          style={{
            borderRadius: `${look.image.cornerShare * 60}px`,
            boxShadow: `0 ${look.image.shadow.offsetY / 6}px ${look.image.shadow.blur / 5}px ${look.image.shadow.color}`,
          }}
        />
        <span
          aria-hidden
          className="relative text-[17px] leading-none"
          style={{
            fontFamily: look.text.fontFamily,
            fontWeight: look.text.fontWeight,
            color: look.text.fill,
            letterSpacing: look.text.letterSpacing / 2,
          }}
        >
          Aa
        </span>
      </span>
      <span className="px-0.5">
        <span className="block text-[11.5px] text-text">{look.label}</span>
        <span className="block truncate text-[10px] text-text-muted">{look.description}</span>
      </span>
    </button>
  );
};

/** Templates: start from a look now; full templates to fill in arrive in Phase 2. */
export const TemplatesPanel = () => {
  const applyLook = useEditor((s) => s.applyLook);
  const hasContent = useEditor((s) => s.elements.length > 0);

  return (
    <div className="flex flex-col gap-2.5 px-4 pb-6 pt-4">
      <SectionLabel>START WITH A LOOK</SectionLabel>
      <PanelHelp>
        {hasContent
          ? "Sets the background and restyles the text and images in one go. Change anything after, or undo."
          : "Sets the background now. Apply it again once you've added text and images to style them too."}
      </PanelHelp>
      <div className="grid grid-cols-2 gap-1.5">
        {DESIGN_LOOKS.map((look) => (
          <LookTile key={look.id} look={look} onApply={() => applyLook(look)} />
        ))}
      </div>

      <SectionLabel right={<Badge variant="phase2" size="sm">PHASE 2</Badge>}>TEMPLATES</SectionLabel>
      <PanelHelp>Ready-made designs for posts, launches and quotes, to fill in with your own content.</PanelHelp>
    </div>
  );
};
