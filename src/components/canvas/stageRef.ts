import type Konva from "konva";

// Singleton stage ref so exporters can grab it.
let stage: Konva.Stage | null = null;

export const setStage = (s: Konva.Stage | null) => { stage = s; };
export const getStage = () => stage;

/** Konva name of the layer holding the background, which an export can leave out. */
export const BACKGROUND_LAYER_NAME = "background";
