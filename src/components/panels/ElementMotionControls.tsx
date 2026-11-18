import { useEditor } from "@/store/editor";
import type { LayerElement } from "@/types";
import type { EnterMove, KeepMove } from "@/types/motion";
import { enterMovesFor, keepMovesFor, objectKindOf } from "@/lib/motion/moves";
import { DEFAULT_ELEMENT_MOTION, MAX_TAKES, MIN_TAKES } from "@/lib/motion/normalise";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, LabeledSlider, PanelHelp, PanelLink } from "./primitives";

/**
 * One object's own moves: how it comes in, how it keeps moving, and when. Shown
 * in that object's Properties; the design's camera and length are in Animate.
 */
export const ElementMotionControls = ({ el }: { el: LayerElement }) => {
  const setElementMotion = useEditor((s) => s.setElementMotion);
  const length = useEditor((s) => s.motion.length);
  const setActiveTool = useEditor((s) => s.setActiveTool);

  const kind = objectKindOf(el);
  const motion = el.motion ?? DEFAULT_ELEMENT_MOTION;
  const enters = enterMovesFor(kind);
  const keeps = keepMovesFor(kind);
  const enter = enters.find((move) => move.id === motion.enter) ?? enters[0];
  const keep = keeps.find((move) => move.id === motion.keep) ?? keeps[0];
  const set = (patch: Parameters<typeof setElementMotion>[1]) => setElementMotion(el.id, patch);

  return (
    <div className="flex flex-col gap-3">
      <Field label="COMES IN">
        <Select value={enter.id} onValueChange={(value) => set({ enter: value as EnterMove })}>
          <SelectTrigger aria-label="Comes in">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {enters.map((move) => (
              <SelectItem key={move.id} value={move.id}>
                {move.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {enter.id !== "none" && <PanelHelp className="my-0">{enter.description}</PanelHelp>}
      </Field>

      {enter.id !== "none" && (
        <>
          <LabeledSlider
            label="STARTS AT"
            unit="s"
            min={0}
            max={length}
            step={0.1}
            value={Math.min(motion.start, length)}
            onChange={(start) => set({ start })}
          />
          <LabeledSlider
            label="TAKES"
            unit="s"
            min={MIN_TAKES}
            max={MAX_TAKES}
            step={0.1}
            value={motion.takes}
            onChange={(takes) => set({ takes })}
          />
        </>
      )}

      <Field label="KEEPS MOVING">
        <Select value={keep.id} onValueChange={(value) => set({ keep: value as KeepMove })}>
          <SelectTrigger aria-label="Keeps moving">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {keeps.map((move) => (
              <SelectItem key={move.id} value={move.id}>
                {move.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {keep.id !== "none" && <PanelHelp className="my-0">{keep.description}</PanelHelp>}
      </Field>

      <PanelHelp className="my-0">
        The camera and the clip's length are in
        <PanelLink onClick={() => setActiveTool("motion")}>Animate</PanelLink>
      </PanelHelp>
    </div>
  );
};
