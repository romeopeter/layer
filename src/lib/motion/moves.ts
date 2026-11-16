import type { LayerElement } from "@/types";
import type { CameraMove, EnterMove, KeepMove, MotionFeel, MotionStrength } from "@/types/motion";

/**
 * Every move as data: its name, what it does, and which objects can use it.
 * A new move is an entry here and a case in `camera.ts` or `objects.ts`.
 */

export interface MoveInfo<Id extends string> {
  id: Id;
  label: string;
  /** One line: what happens if you choose it. */
  description: string;
}

export const CAMERA_MOVES: MoveInfo<CameraMove>[] = [
  { id: "still", label: "Still", description: "The camera stays put. Objects, zoom spots and the background can still move." },
  { id: "push-in", label: "Push in", description: "Moves slowly closer to the main picture." },
  { id: "pull-back", label: "Pull back", description: "Starts close on the main picture and opens out to the whole design." },
  { id: "drift", label: "Drift", description: "Glides slowly from left to right." },
  { id: "rise", label: "Rise", description: "Glides slowly upward." },
];

/** What an object is, as far as moves go. */
export type ObjectKind = "picture" | "text" | "stroke" | "symbol" | "shape";

export const objectKindOf = (el: LayerElement): ObjectKind => {
  if (el.type === "image") return "picture";
  if (el.type === "text") return "text";
  if (el.connector || el.shape === "pencil" || (el.shape === "highlight" && el.points)) return "stroke";
  if (el.shape === "icons" || el.shape === "emoji" || el.shape === "badge" || el.shape === "number") return "symbol";
  return "shape";
};

interface ObjectMoveInfo<Id extends string> extends MoveInfo<Id> {
  /** Absent means every kind of object. */
  only?: ObjectKind[];
}

export const ENTER_MOVES: ObjectMoveInfo<EnterMove>[] = [
  { id: "none", label: "None", description: "It's there from the start." },
  { id: "fade", label: "Fade", description: "Fades in." },
  { id: "rise", label: "Rise", description: "Fades in as it rises into place." },
  { id: "drop", label: "Drop", description: "Fades in as it drops into place." },
  { id: "slide", label: "Slide", description: "Slides in from the left." },
  { id: "pop", label: "Pop", description: "Pops in, a little bigger, then settles." },
  { id: "grow", label: "Grow", description: "Grows from nothing to its full size." },
  { id: "turn-in", label: "Turn in", description: "Starts tipped back in 3D and turns to face you.", only: ["picture"] },
  { id: "type", label: "Type", description: "Its letters appear one by one.", only: ["text"] },
  { id: "draw", label: "Draw", description: "The line draws itself.", only: ["stroke"] },
];

export const KEEP_MOVES: ObjectMoveInfo<KeepMove>[] = [
  { id: "none", label: "None", description: "It stays still once it's in." },
  { id: "float", label: "Float", description: "Bobs gently up and down." },
  { id: "pulse", label: "Pulse", description: "Grows a little and back, like a heartbeat." },
  { id: "sway", label: "Sway", description: "Rocks gently from side to side." },
  { id: "swing", label: "Swing", description: "Turns from side to side in 3D.", only: ["picture"] },
  { id: "orbit", label: "Orbit", description: "Leans round in a slow circle, in 3D.", only: ["picture"] },
  { id: "spin", label: "Spin", description: "Turns round and round.", only: ["symbol"] },
];

export const enterMovesFor = (kind: ObjectKind) => ENTER_MOVES.filter((move) => !move.only || move.only.includes(kind));
export const keepMovesFor = (kind: ObjectKind) => KEEP_MOVES.filter((move) => !move.only || move.only.includes(kind));

/** A move an object can't make becomes the nearest one it can. */
export const enterFor = (kind: ObjectKind, move: EnterMove): EnterMove => {
  if (enterMovesFor(kind).some((entry) => entry.id === move)) return move;
  return move === "turn-in" ? "pop" : "fade";
};

export const keepFor = (kind: ObjectKind, move: KeepMove): KeepMove => {
  if (keepMovesFor(kind).some((entry) => entry.id === move)) return move;
  if (move === "swing") return "sway";
  if (move === "orbit") return "float";
  return move === "spin" ? "sway" : "none";
};

export const STRENGTHS: MoveInfo<MotionStrength>[] = [
  { id: "gentle", label: "Gentle", description: "A small move." },
  { id: "medium", label: "Medium", description: "A clear move." },
  { id: "strong", label: "Strong", description: "A big move." },
];

export const FEELS: MoveInfo<MotionFeel>[] = [
  { id: "smooth", label: "Smooth", description: "Starts and ends gently." },
  { id: "steady", label: "Steady", description: "The same speed throughout." },
  { id: "snappy", label: "Snappy", description: "Quick at first, then settles." },
];

export const labelOf = <Id extends string>(moves: MoveInfo<Id>[], id: Id) =>
  moves.find((move) => move.id === id)?.label ?? id;
