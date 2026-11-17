import type { BackgroundGradient } from "@/types";
import { cn } from "@/lib/utils";
import { choiceClass } from "./choice";
import { ColorRow, LabeledSlider, SectionLabel } from "./primitives";

const GRADIENTS = [
  { from: "#6E5BFF", to: "#3FCBA6" },
  { from: "#EF9F27", to: "#FF5577" },
  { from: "#0F0E1A", to: "#534AB7" },
  { from: "#FAEEDA", to: "#EF9F27" },
  { from: "#1D9E75", to: "#085041" },
  { from: "#AFA9EC", to: "#3C3489" },
];

/** A two-colour gradient: its colours, its angle, and presets. For the background and for cards. */
export const GradientControls = ({
  value,
  onChange,
}: {
  value: BackgroundGradient;
  onChange: (next: BackgroundGradient) => void;
}) => {
  const isPreset = (g: { from: string; to: string }) => value.from === g.from && value.to === g.to;
  return (
    <div className="w-full space-y-2.5">
      <SectionLabel>GRADIENT</SectionLabel>
      <div
        className="h-3 rounded border border-hairline"
        style={{ background: `linear-gradient(90deg, ${value.from}, ${value.to})` }}
      />
      <ColorRow value={value.from} label="FROM" onChange={(from) => onChange({ ...value, from })} />
      <ColorRow value={value.to} label="TO" onChange={(to) => onChange({ ...value, to })} />
      <LabeledSlider
        label="ANGLE"
        unit="°"
        min={0}
        max={360}
        value={value.angle}
        onChange={(angle) => onChange({ ...value, angle })}
      />

      <div>
        <SectionLabel>GRADIENT PRESETS</SectionLabel>
        <div className="grid grid-cols-6 gap-1.5">
          {GRADIENTS.map((g, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Gradient ${i + 1}`}
              onClick={() => onChange({ ...g, angle: 135 })}
              aria-pressed={isPreset(g)}
              className={cn("aspect-square cursor-pointer rounded-md border transition-colors", choiceClass(isPreset(g)))}
              style={{ background: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
