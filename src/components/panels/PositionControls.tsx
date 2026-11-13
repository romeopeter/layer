import { useEditor } from "@/store/editor";
import type { LayerElement } from "@/types";
import { SectionLabel, LabeledSlider, PanelHelp } from "./primitives";
import { PlaceGrid } from "./PlaceGrid";

/* ---------------------------------------------------------------------------------------------- */

/** Where a layer sits and how big it is: nine quick places, then exact numbers. */
export const PositionControls = ({ el }: { el: LayerElement }) => {
  const canvas = useEditor((s) => s.canvas);
  const update = useEditor((s) => s.updateElement);
  const inLayout = useEditor((s) => !!s.layout?.slots.some((slot) => slot.id === el.id));

  if (inLayout) {
    return <PanelHelp>Its place comes from the layout. Choose None in Layout to move it freely.</PanelHelp>;
  }

  const placeOf = (h: number, v: number) => ({
    x: (h * (canvas.width - el.width)) / 2,
    y: (v * (canvas.height - el.height)) / 2,
  });
  /** Where the layer already sits, so that place shows as chosen. */
  const isAt = (h: number, v: number) => {
    const place = placeOf(h, v);
    return Math.abs(el.x - place.x) < 0.5 && Math.abs(el.y - place.y) < 0.5;
  };

  return (
    <div className="flex flex-col gap-2.5">

      <PlaceGrid
        chosen={[0, 1, 2, 3, 4, 5, 6, 7, 8].find((i) => isAt(i % 3, Math.floor(i / 3))) ?? null}
        onPick={(i) => update(el.id, placeOf(i % 3, Math.floor(i / 3)))}
      />

      <SectionLabel>POSITION</SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-1.5 rounded-md border border-hairline bg-chrome/40 px-2 py-1.5">
          <span className="font-mono text-[10px] font-semibold text-text-faint">
            X
          </span>
          <input
            aria-label="X"
            value={Math.round(el.x)}
            onChange={(e) => update(el.id, { x: Number(e.target.value) || 0 })}
            className="w-full bg-transparent font-mono text-[11px] text-text outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5 rounded-md border border-hairline bg-chrome/40 px-2 py-1.5">
          <span className="font-mono text-[10px] font-semibold text-text-faint">
            Y
          </span>
          <input
            aria-label="Y"
            value={Math.round(el.y)}
            onChange={(e) => update(el.id, { y: Number(e.target.value) || 0 })}
            className="w-full bg-transparent font-mono text-[11px] text-text outline-none"
          />
        </label>
      </div>

      <SectionLabel>SIZE</SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-1.5 rounded-md border border-hairline bg-chrome/40 px-2 py-1.5">
          <span className="font-mono text-[10px] font-semibold text-text-faint">
            W
          </span>
          <input
            aria-label="Width"
            value={Math.round(el.width)}
            onChange={(e) =>
              update(el.id, {
                width: Math.max(10, Number(e.target.value) || 0),
              })
            }
            className="w-full bg-transparent font-mono text-[11px] text-text outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5 rounded-md border border-hairline bg-chrome/40 px-2 py-1.5">
          <span className="font-mono text-[10px] font-semibold text-text-faint">
            H
          </span>
          <input
            aria-label="Height"
            value={Math.round(el.height)}
            onChange={(e) =>
              update(el.id, {
                height: Math.max(10, Number(e.target.value) || 0),
              })
            }
            className="w-full bg-transparent font-mono text-[11px] text-text outline-none"
          />
        </label>
      </div>

      <LabeledSlider
        label="ROTATION"
        unit="°"
        min={-180}
        max={180}
        value={Math.round(el.rotation)}
        onChange={(v) => update(el.id, { rotation: v })}
      />

    </div>
  );
};
