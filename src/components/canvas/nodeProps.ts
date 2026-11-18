import type { LayerElement } from "@/types";

/**
 * Handle drags and live resizes write to the store on every pointer move, so
 * nodes must only re-render when their own element changes. `onSelect` is left
 * out on purpose: it's a new closure each render but only ever selects this id. A
 * tilted layout's surface is kept the same object until it changes.
 */
export const sameNodeProps = (
  a: { el: LayerElement; selected: boolean; surface?: unknown },
  b: { el: LayerElement; selected: boolean; surface?: unknown },
) => a.el === b.el && a.selected === b.selected && a.surface === b.surface;
