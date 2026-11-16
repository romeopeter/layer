import type { ReactNode } from "react";
import { Frame, MoveRight, MoveUp, ZoomIn, ZoomOut } from "lucide-react";
import { useEditor } from "@/store/editor";
import type { CameraMove, MotionFeel, MotionStrength } from "@/types/motion";
import { CAMERA_MOVES, FEELS, STRENGTHS } from "@/lib/motion/moves";
import { MAX_LENGTH, MIN_LENGTH, cameraMoves } from "@/lib/motion/normalise";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChoiceTile } from "./ChoiceTile";
import { LabeledSlider, Linebreak, PanelDesc, PanelHelp, SectionLabel, SwitchRow } from "./primitives";

const CAMERA_ICONS: Record<CameraMove, ReactNode> = {
  still: <Frame className="h-4 w-4" />,
  "push-in": <ZoomIn className="h-4 w-4" />,
  "pull-back": <ZoomOut className="h-4 w-4" />,
  drift: <MoveRight className="h-4 w-4" />,
  rise: <MoveUp className="h-4 w-4" />,
};

/** A name over a set of choices, as a slider has. */
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-p-200">{label}</span>
    {children}
  </div>
);

/**
 * Animate › Animate: how the whole design moves. Each object's own moves are in
 * its Properties, since they belong to what's selected.
 */
export const AnimatePanel = () => {
  const motion = useEditor((s) => s.motion);
  const setMotion = useEditor((s) => s.setMotion);
  const anyEntrance = useEditor((s) => s.elements.some((el) => !el.hidden && el.motion && el.motion.enter !== "none"));

  const camera = CAMERA_MOVES.find((move) => move.id === motion.camera) ?? CAMERA_MOVES[0];
  const filmed = cameraMoves(motion);
  // Feel and looping shape one-way moves; moves that go round and round loop anyway.
  const oneWay = filmed || anyEntrance;

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <PanelDesc>Bring the design to life, then export it as a video or a GIF.</PanelDesc>

      <div className="space-y-2">
        <SectionLabel>CAMERA</SectionLabel>
        <div role="group" aria-label="Camera moves" className="grid grid-cols-3 gap-1.5">
          {CAMERA_MOVES.map((move) => (
            <ChoiceTile
              key={move.id}
              label={move.label}
              active={motion.camera === move.id}
              onClick={() => setMotion({ camera: move.id })}
            >
              {CAMERA_ICONS[move.id]}
            </ChoiceTile>
          ))}
        </div>
        <PanelHelp>{camera.description}</PanelHelp>
      </div>

      <Linebreak />

      <div className="flex flex-col gap-3">
        <SectionLabel>CLIP</SectionLabel>
        <LabeledSlider
          label="LENGTH"
          unit="s"
          min={MIN_LENGTH}
          max={MAX_LENGTH}
          step={0.5}
          value={motion.length}
          onChange={(length) => setMotion({ length })}
        />
        {motion.camera !== "still" && (
          <Field label="STRENGTH">
            <ToggleGroup
              type="single"
              aria-label="Strength"
              value={motion.strength}
              onValueChange={(value) => value && setMotion({ strength: value as MotionStrength })}
              className="w-full"
            >
              {STRENGTHS.map((entry) => (
                <ToggleGroupItem key={entry.id} value={entry.id} className="cursor-pointer">
                  {entry.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        )}
        {oneWay && (
          <>
            <Field label="FEEL">
              <ToggleGroup
                type="single"
                aria-label="Feel"
                value={motion.feel}
                onValueChange={(value) => value && setMotion({ feel: value as MotionFeel })}
                className="w-full"
              >
                {FEELS.map((entry) => (
                  <ToggleGroupItem key={entry.id} value={entry.id} title={entry.description} className="cursor-pointer">
                    {entry.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <SwitchRow
              label="LOOP SMOOTHLY"
              description="Ends where it starts, so a GIF repeats without a jump."
              checked={motion.loop}
              onCheckedChange={(loop) => setMotion({ loop })}
            />
          </>
        )}
      </div>
    </div>
  );
};
