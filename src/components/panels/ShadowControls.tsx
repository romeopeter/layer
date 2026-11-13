import { useEditor } from "@/store/editor";
import type { LayerElement } from "@/types";
import { LabeledSlider, ColorRow, SwitchRow } from "./primitives";

const NO_SHADOW = { enabled: false, color: "#0F0E1A", blur: 40, offsetX: 0, offsetY: 20 };

/** A drop shadow for any element. Its settings show once it's on. */
export const ShadowControls = ({ el }: { el: LayerElement }) => {
  const update = useEditor((s) => s.updateElement);
  const sh = el.shadow ?? NO_SHADOW;
  const set = (patch: Partial<typeof sh>) => update(el.id, { shadow: { ...sh, ...patch } });

  return (
    <div className="flex flex-col gap-2.5">
      <SwitchRow
        label="SHADOW"
        description="A soft shadow under it, so it lifts off the background."
        checked={sh.enabled}
        onCheckedChange={(v) => set({ enabled: v })}
      />
      {sh.enabled && (
        <>
          <ColorRow
            value={sh.color.startsWith("#") ? sh.color : "#000000"}
            onChange={(v) => set({ color: v })}
          />
          <LabeledSlider label="BLUR" unit="px" max={120} value={sh.blur} onChange={(v) => set({ blur: v })} />
          <LabeledSlider label="OFFSET X" min={-80} max={80} value={sh.offsetX} onChange={(v) => set({ offsetX: v })} />
          <LabeledSlider label="OFFSET Y" min={-80} max={80} value={sh.offsetY} onChange={(v) => set({ offsetY: v })} />
        </>
      )}
    </div>
  );
};
