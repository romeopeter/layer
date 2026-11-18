/*
  The way in to 3D mockups. The renderer, and three.js with it, is loaded the first time
  a solid device is turned, so the editor doesn't carry it until then.
*/

type SolidRenderer = typeof import("./render");

let loaded: SolidRenderer | null = null;
let loading: Promise<SolidRenderer | null> | null = null;

/** The renderer, once loaded. Null until then, or if it couldn't load. */
export const solidRenderer = () => loaded;

/** Loads the renderer, once. */
export const loadSolids = () => {
  loading ??= import("./render")
    .then((module) => (loaded = module))
    .catch((error: unknown) => {
      console.error("3D mockups couldn't load:", error);
      loading = null;
      return null;
    });
  return loading;
};

/** Turned mockups still to be drawn: an export waits for them. */
let pending = 0;
let waiting: (() => void)[] = [];

/** Marks a drawing as started. Call what it returns once it's done, or abandoned. */
export const startTurnedDrawing = () => {
  pending += 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    pending -= 1;
    if (pending === 0) waiting.splice(0).forEach((resolve) => resolve());
  };
};

/** How long an export waits for 3D before going ahead with what's drawn. */
const PATIENCE = 15_000;

/** Resolves once every turned mockup is drawn. */
export const whenTurnedDrawn = () =>
  pending === 0
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        waiting.push(resolve);
        setTimeout(() => {
          waiting = waiting.filter((entry) => entry !== resolve);
          resolve();
        }, PATIENCE);
      });
