import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type Konva from "konva";
import type { ImageElement } from "@/types";
import { solidOf } from "@/lib/mockups";
import { isImageTiltActive, parseImageTilt, type ImageTilt } from "@/lib/tilt";
import { isTiltSupported, renderTilt, tiltBoxOf, tiltCorners, type TiltBox } from "@/lib/tiltRender";
import { solidBoxOf, solidModel, type SolidModel } from "@/lib/devices3d/bodies";
import { loadSolids, solidRenderer, startTurnedDrawing } from "@/lib/devices3d";
import { flatMockupCanvas } from "./flatMockup";

/** A turned mockup is drawn at twice its size, so it's sharp in a 2× export too. */
export const TURN_SCALE = 2;

const modelOf = (el: ImageElement): SolidModel | null => {
  const shape = solidOf(el);
  return shape ? solidModel(shape) : null;
};

interface Front {
  canvas: HTMLCanvasElement;
  version: number;
  /** What it was drawn from, so it's drawn again once that changes. */
  el: ImageElement;
}

/**
 * Draws a mockup turned by `tilt` from its flat front: a phone, tablet or laptop as a
 * solid, anything else as a flat card. A solid is drawn flat, as a card, until three.js
 * has loaded, or if it can't.
 */
const drawTurned = (
  el: ImageElement,
  model: SolidModel | null,
  front: Front,
  tilt: ImageTilt,
  scale: number,
  out: HTMLCanvasElement,
  keep: boolean,
): TiltBox | null => {
  const solids = model ? solidRenderer() : null;
  if (model && solids?.canRenderSolids()) {
    return solids.renderSolid(
      { id: el.id, model, front: front.canvas, frontVersion: front.version, width: el.width, height: el.height, tilt },
      scale,
      out,
    );
  }
  return renderTilt(front.canvas, { tilt, width: el.width, height: el.height, cornerRadius: 0, border: null }, scale, out, keep);
};

/** Where a turned mockup's picture goes, worked out without drawing it. */
const turnedBoxOf = (el: ImageElement, model: SolidModel | null, tilt: ImageTilt) =>
  model && solidRenderer()?.canRenderSolids()
    ? solidBoxOf(model, tilt, el.width, el.height)
    : tiltBoxOf(tiltCorners({ tilt, width: el.width, height: el.height, cornerRadius: 0 }));

/**
 * A mockup turned in 3D by its tilt (Properties › 3D), drawn from its own flat group.
 * `shown` once it's drawn: until then, and while cropping, the flat mockup shows.
 * `pose` draws it turned further, for Animate.
 */
export const useTurnedMockup = (
  el: ImageElement,
  flatRef: RefObject<Konva.Group | null>,
  /** The picture and frame have loaded, so the flat group is complete. */
  ready: boolean,
  /** Changes when the flat mockup's pixels do without the element changing: an edit drawn, a GIF frame. */
  picture: unknown,
  onDraw: () => void,
) => {
  const turned = !!el.deviceFrame && isImageTiltActive(el.transform) && isTiltSupported();
  const active = turned && ready;
  const model = useMemo(() => (el.deviceFrame ? modelOf(el) : null), [el]);
  const tilt = useMemo(() => parseImageTilt(el.transform), [el.transform]);
  const out = useMemo(() => document.createElement("canvas"), []);
  // Set once three.js has loaded, or failed to: then it's drawn as a solid, or as a card.
  const [solidsTried, setSolidsTried] = useState(() => !!solidRenderer());
  const box = useMemo(
    () => (active ? turnedBoxOf(el, model, tilt) : null),
    [active, el, model, tilt, solidsTried], // eslint-disable-line react-hooks/exhaustive-deps -- a solid's box once it can be drawn as one
  );

  const front = useRef<Front | null>(null);
  // Kept current before anything below draws: a frame and a turn can change together.
  const latest = useRef({ el, model, onDraw });
  useLayoutEffect(() => {
    latest.current = { el, model, onDraw };
  });

  /** The flat front, drawn again from the mockup as it is now. */
  const refreshFront = useCallback(() => {
    const group = flatRef.current;
    if (!group) return null;
    const { el: now } = latest.current;
    front.current = {
      canvas: flatMockupCanvas(group, now.width, now.height, TURN_SCALE),
      version: (front.current?.version ?? 0) + 1,
      el: now,
    };
    return front.current;
  }, [flatRef]);

  const draw = useCallback(() => {
    const current = refreshFront();
    if (!current) return false;
    const { el: now, model: solid } = latest.current;
    return !!drawTurned(now, solid, current, parseImageTilt(now.transform), TURN_SCALE, out, false);
  }, [refreshFront, out]);

  // Drawn before the screen updates, so it's never seen stale. A solid waits for three.js,
  // and shows flat until then.
  const shown = active && (!model || solidsTried) && !!box;
  useLayoutEffect(() => {
    if (!active) return;
    if (model && !solidsTried) {
      // three.js comes in the first time a solid turns. An export waits for it: it's
      // drawn in the commit that follows, just after this is let go.
      const done = startTurnedDrawing();
      let gone = false;
      void loadSolids().then(() => {
        if (!gone) setSolidsTried(true);
      });
      return () => {
        gone = true;
        done();
      };
    }
    if (draw()) latest.current.onDraw();
  }, [active, el, model, solidsTried, picture, draw]);

  // Its model is let go with the image.
  useEffect(() => () => void solidRenderer()?.releaseSolid(el.id), [el.id]);

  /** Draws it again from the same element, whose picture changed: a GIF's next frame. */
  const redraw = useCallback(() => {
    if (!active || !draw()) return;
    latest.current.onDraw();
  }, [active, draw]);

  /**
   * Draws it turned further by an animation into `target`, at `scale`. Returns where it
   * goes, or null if it can't be drawn. A GIF's front is drawn again every frame.
   */
  const pose = useCallback(
    (turnX: number, turnY: number, scale: number, target: HTMLCanvasElement, animated: boolean) => {
      const { el: now, model: solid } = latest.current;
      const current = animated || front.current?.el !== now ? refreshFront() : front.current;
      if (!current) return null;
      if (solid && !solidRenderer()) void loadSolids();
      const base = parseImageTilt(now.transform);
      return drawTurned(
        now,
        solid,
        current,
        { ...base, tiltX: base.tiltX + turnX, tiltY: base.tiltY + turnY },
        scale,
        target,
        !animated,
      );
    },
    [refreshFront],
  );

  return { shown, canvas: out, box, redraw, pose };
};
