import { useState, type ReactNode } from "react";
import { Frame, MoveRight, MoveUp, Plus, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useEditor } from "@/store/editor";
import type { CameraMove, EnterMove, MotionFeel, MotionStrength } from "@/types/motion";
import { CAMERA_MOVES, FEELS, STRENGTHS } from "@/lib/motion/moves";
import {
  MAX_LENGTH,
  MAX_SPOTS,
  MAX_SPOT_ZOOM,
  MIN_LENGTH,
  MIN_SPOT_ZOOM,
  cameraMoves,
  movesOnItsOwn,
} from "@/lib/motion/normalise";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChoiceTile } from "./ChoiceTile";
import { Field, LabeledSlider, Linebreak, PanelDesc, PanelHelp, SectionLabel, SwitchRow } from "./primitives";

const CAMERA_ICONS: Record<CameraMove, ReactNode> = {
  still: <Frame className="h-4 w-4" />,
  "push-in": <ZoomIn className="h-4 w-4" />,
  "pull-back": <ZoomOut className="h-4 w-4" />,
  drift: <MoveRight className="h-4 w-4" />,
  rise: <MoveUp className="h-4 w-4" />,
};

/** Places the camera zooms into, in turn. They're drawn on the canvas while this tab is open. */
const Zoom = () => {
  const spots = useEditor((s) => s.motion.spots);
  const depth = useEditor((s) => s.motion.depth);
  const filmed = useEditor((s) => cameraMoves(s.motion));
  const selected = useEditor((s) => s.selectedIds.length === 1);
  const setMotion = useEditor((s) => s.setMotion);
  const add = useEditor((s) => s.addZoomSpot);
  const update = useEditor((s) => s.updateZoomSpot);
  const remove = useEditor((s) => s.removeZoomSpot);

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>ZOOM</SectionLabel>
      <PanelHelp className="my-0">
        {spots.length === 0
          ? "Zoom into a spot to show off a detail. Select something first to zoom right to it."
          : "The camera zooms into each spot in turn. Drag a spot's edge on the canvas to move it, or its corners to zoom."}
      </PanelHelp>
      {spots.map((spot, index) => (
        <div key={spot.id} className="flex items-end gap-2">
          <LabeledSlider
            className="flex-1"
            label={`SPOT ${index + 1}`}
            unit="×"
            min={MIN_SPOT_ZOOM}
            max={MAX_SPOT_ZOOM}
            step={0.05}
            value={Math.round(spot.zoom * 100) / 100}
            onChange={(zoom) => update(spot.id, { zoom })}
          />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 cursor-pointer"
            aria-label={`Delete spot ${index + 1}`}
            title="Delete"
            onClick={() => remove(spot.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {spots.length < MAX_SPOTS && (
        <Button variant="ghost" size="block" className="cursor-pointer" onClick={() => add()}>
          <Plus className="h-3 w-3" /> {selected ? "Zoom to the selection" : "Add a zoom spot"}
        </Button>
      )}
      {filmed && (
        <SwitchRow
          label="DEPTH"
          description="The background moves less than the design, as if it were further away."
          checked={depth}
          onCheckedChange={(value) => setMotion({ depth: value })}
        />
      )}
    </div>
  );
};

/** Ways in that suit a whole design brought in piece by piece. */
const ONE_BY_ONE: { id: EnterMove; label: string }[] = [
  { id: "fade", label: "Fade" },
  { id: "rise", label: "Rise" },
  { id: "pop", label: "Pop" },
];

/**
 * Many objects at once: the same way in for each, one after another. Like a look,
 * it sets each object's own moves, which stay theirs to change.
 */
const Objects = () => {
  const moving = useEditor((s) => s.elements.filter(movesOnItsOwn).length);
  const selected = useEditor((s) => s.selectedIds.length);
  const bringIn = useEditor((s) => s.bringInOneByOne);
  const clear = useEditor((s) => s.clearElementMotion);
  const [enter, setEnter] = useState<EnterMove>("rise");

  const bringInNow = () => {
    const { elements, selectedIds } = useEditor.getState();
    bringIn(selectedIds.length > 1 ? selectedIds : elements.map((el) => el.id), enter);
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>OBJECTS</SectionLabel>
      <PanelHelp className="my-0">
        {moving === 0 ? "Nothing moves on its own yet." : moving === 1 ? "1 object moves on its own." : `${moving} objects move on their own.`}{" "}
        Select an object to set its own moves in Properties.
      </PanelHelp>
      <Field label="BRING IN ONE BY ONE">
        <ToggleGroup
          type="single"
          aria-label="Way in"
          value={enter}
          onValueChange={(value) => value && setEnter(value as EnterMove)}
          className="w-full"
        >
          {ONE_BY_ONE.map((entry) => (
            <ToggleGroupItem key={entry.id} value={entry.id} className="cursor-pointer">
              {entry.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Button variant="ghost" size="block" className="cursor-pointer" onClick={bringInNow}>
        {selected > 1 ? `Bring in the ${selected} selected, one by one` : "Bring in everything, one by one"}
      </Button>
      {moving > 0 && (
        <Button variant="ghost" size="block" className="cursor-pointer" onClick={clear}>
          Clear object moves
        </Button>
      )}
    </div>
  );
};

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

      <Linebreak />

      <Zoom />

      <Linebreak />

      <Objects />
    </div>
  );
};
