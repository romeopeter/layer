import { useEditor } from "@/store/editor";
import type { ImageElement } from "@/types";
import { cn } from "@/lib/utils";
import { parseImageTilt, serializeImageTilt, type ImageTilt } from "@/lib/tilt";
import { LabeledSlider, PanelHelp, SwitchRow } from "./primitives";
import { choiceClass } from "./choice";

const PRESETS = [
  { name: "Flat", x: 0, y: 0, z: 0 },
  { name: "Gentle Left", x: 10, y: -10, z: 0 },
  { name: "Gentle Right", x: 10, y: 10, z: 0 },
  { name: "Viewer", x: 20, y: 0, z: 0 },
  { name: "Iso Left", x: 25, y: -25, z: 0 },
  { name: "Iso Right", x: 25, y: 25, z: 0 },
  { name: "Twist Left", x: 20, y: -20, z: 5 },
  { name: "Twist Right", x: 20, y: 20, z: -5 },
  { name: "Table Left", x: 50, y: 0, z: -30 },
  { name: "Table Right", x: 50, y: 0, z: 30 },
  { name: "Hard Left", x: 45, y: -20, z: -15 },
  { name: "Hard Right", x: 45, y: 20, z: 15 },
];

/** 3D tilt for an image: presets first, then the angles themselves. */
export const TiltControls = ({ image }: { image: ImageElement }) => {
  const update = useEditor((s) => s.updateElement);

  if (image.deviceFrame) {
    return <PanelHelp>A mockup stays flat. Choose None in Mockup to tilt the picture.</PanelHelp>;
  }

  const tilt = parseImageTilt(image.transform || "");
  const set = (patch: Partial<ImageTilt>) =>
    update(image.id, { transform: serializeImageTilt({ ...tilt, ...patch }) });

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-4 gap-1.5">
        {PRESETS.map((p) => {
          const selected = tilt.tiltX === p.x && tilt.tiltY === p.y && tilt.tiltZ === p.z;
          return (
            <button
              key={p.name}
              type="button"
              title={p.name}
              aria-label={p.name}
              aria-pressed={selected}
              style={{ perspective: "100px" }}
              className={cn(
                "flex h-10 cursor-pointer items-center justify-center rounded-md border transition-colors",
                choiceClass(selected),
              )}
              onClick={() => set({ tiltX: p.x, tiltY: p.y, tiltZ: p.z })}
            >
              <div
                className="h-5.5 w-7.5 rounded-sm border border-white bg-primary"
                style={{ transform: `rotateX(${p.x}deg) rotateY(${p.y}deg) rotateZ(${p.z}deg)` }}
              />
            </button>
          );
        })}
      </div>
      <LabeledSlider label="VERTICAL TILT" unit="°" min={-45} max={45} value={tilt.tiltX} onChange={(v) => set({ tiltX: v })} />
      <LabeledSlider label="HORIZONTAL TILT" unit="°" min={-45} max={45} value={tilt.tiltY} onChange={(v) => set({ tiltY: v })} />
      <LabeledSlider
        label="PERSPECTIVE"
        unit="px"
        min={400}
        max={1200}
        step={10}
        value={tilt.perspective}
        onChange={(v) => set({ perspective: v })}
      />
      <SwitchRow label="INNER SHADE" checked={tilt.innerShadow} onCheckedChange={(v) => set({ innerShadow: v })} />
    </div>
  );
};
