import { useEditor } from "@/store/editor";
import type { ImageElement } from "@/types";
import { cn } from "@/lib/utils";
import { parseImageTilt, serializeImageTilt, type ImageTilt } from "@/lib/tilt";
import { LID_ANGLE, solidKindOf } from "@/lib/mockups";
import { isLayoutTilted } from "@/lib/layouts";
import { LabeledSlider, PanelHelp, PanelLink, SwitchRow } from "./primitives";
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

type Turn = Pick<ImageTilt, "tiltX" | "tiltY" | "tiltZ" | "perspective" | "innerShadow">;

/**
 * Presets, then the angles themselves. One set of controls for turning anything in 3D:
 * an image, a mockup, or a whole layout.
 */
export const TiltPicker = ({
  tilt,
  onChange,
  shade = true,
}: {
  tilt: Turn;
  onChange: (patch: Partial<Turn>) => void;
  /** Off for a solid device, which is lit and shades its far side already. */
  shade?: boolean;
}) => (
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
            onClick={() => onChange({ tiltX: p.x, tiltY: p.y, tiltZ: p.z })}
          >
            <div
              className="h-5.5 w-7.5 rounded-sm border border-white bg-primary"
              style={{ transform: `rotateX(${p.x}deg) rotateY(${p.y}deg) rotateZ(${p.z}deg)` }}
            />
          </button>
        );
      })}
    </div>
    <LabeledSlider label="VERTICAL TILT" unit="°" min={-45} max={45} value={tilt.tiltX} onChange={(v) => onChange({ tiltX: v })} />
    <LabeledSlider label="HORIZONTAL TILT" unit="°" min={-45} max={45} value={tilt.tiltY} onChange={(v) => onChange({ tiltY: v })} />
    <LabeledSlider
      label="PERSPECTIVE"
      unit="px"
      min={400}
      max={1200}
      step={10}
      value={tilt.perspective}
      onChange={(v) => onChange({ perspective: v })}
    />
    {shade && <SwitchRow label="INNER SHADE" checked={tilt.innerShadow} onCheckedChange={(v) => onChange({ innerShadow: v })} />}
  </div>
);

/**
 * 3D tilt for an image. A mockup turns too: a phone, tablet, laptop, desktop or watch as
 * a solid, anything else as a flat card. In a tilted layout, the layout's tilt is used.
 */
export const TiltControls = ({ image }: { image: ImageElement }) => {
  const update = useEditor((s) => s.updateElement);
  const setDeviceFrame = useEditor((s) => s.setDeviceFrame);
  const setActiveTool = useEditor((s) => s.setActiveTool);
  const inTiltedLayout = useEditor(
    (s) => isLayoutTilted(s.layout) && !!s.layout?.slots.some((slot) => slot.id === image.id),
  );
  const frame = image.deviceFrame;
  const kind = frame ? solidKindOf(frame) : undefined;

  if (inTiltedLayout) {
    return (
      <PanelHelp>
        It tilts with its layout, as one surface. Change the tilt in
        <PanelLink onClick={() => setActiveTool("layout")}>Layout</PanelLink>
      </PanelHelp>
    );
  }

  const tilt = parseImageTilt(image.transform || "");
  const set = (patch: Partial<ImageTilt>) =>
    update(image.id, { transform: serializeImageTilt({ ...tilt, ...patch }) });
  const turned = tilt.tiltX !== 0 || tilt.tiltY !== 0 || tilt.tiltZ !== 0;

  return (
    <div className="flex flex-col gap-2.5">
      {/* A solid device is lit, which shades its far side already. */}
      <TiltPicker tilt={tilt} onChange={set} shade={!kind} />
      {/* How far the lid is open only shows once it's turned. */}
      {frame && kind === "laptop" && turned && (
        <LabeledSlider
          label="LID ANGLE"
          unit="°"
          min={LID_ANGLE.min}
          max={LID_ANGLE.max}
          value={frame.lidAngle ?? LID_ANGLE.usual}
          onChange={(lidAngle) => setDeviceFrame(image.id, { ...frame, lidAngle })}
        />
      )}
    </div>
  );
};
