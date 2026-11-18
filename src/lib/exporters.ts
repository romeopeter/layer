import Konva from "konva";
import { BACKGROUND_LAYER_NAME, getStage } from "../components/canvas/stageRef";
import { useEditor } from "../store/editor";
import { saveExport, saveProject } from "./host";
import { openLayerFile } from "./importers";
import { packProject } from "./projectFile";
import { prepareExportTiles } from "./export/prepareExportTiles";
import { prepareExportBackdrop } from "./export/prepareExportBackdrop";
import { GRID_LAYER_NAME } from "../components/canvas/GridOverlay";
import { SNAP_GUIDES_LAYER_NAME } from "../components/canvas/SnapGuides";
import { MARK_DRAFT_LAYER_NAME } from "../components/canvas/MarkDraft";
import { MARK_HANDLES_LAYER_NAME } from "../components/canvas/MarkHandles";
import { CROP_LAYER_NAME } from "../components/canvas/CropOverlay";
import { LAYOUT_SLOTS_LAYER_NAME } from "../components/canvas/LayoutOverlay";
import { ZOOM_SPOTS_LAYER_NAME } from "../components/canvas/ZoomSpotsLayer";
import { holdGifsOnFirstFrame } from "./gif/player";

const dataURLtoBlob = (dataUrl: string): Blob => {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/data:([^;]+);/)?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: mime });
};


/**
 * Hide everything that is editor chrome rather than artwork, run the capture,
 * then restore. Selection handles and the layout grid both live in the stage
 * but must never reach the output — any future viewport aid (rulers, safe-area
 * guides) belongs in this list too.
 */
export const withOverlaysHidden = async <T,>(
  stage: Konva.Stage,
  options: { withoutBackground?: boolean },
  fn: () => Promise<T>,
) => {
  const overlays = [
    ...(options.withoutBackground ? stage.find(`.${BACKGROUND_LAYER_NAME}`) : []),
    ...stage.find("Transformer"),
    ...stage.find(`.${GRID_LAYER_NAME}`),
    ...stage.find(`.${SNAP_GUIDES_LAYER_NAME}`),
    ...stage.find(`.${MARK_DRAFT_LAYER_NAME}`),
    ...stage.find(`.${MARK_HANDLES_LAYER_NAME}`),
    ...stage.find(`.${CROP_LAYER_NAME}`),
    ...stage.find(`.${LAYOUT_SLOTS_LAYER_NAME}`),
    ...stage.find(`.${ZOOM_SPOTS_LAYER_NAME}`),
  ];
  const visible = overlays.map((node) => node.visible());
  overlays.forEach((node) => node.visible(false));
  // A still export shows each GIF's first frame; an animation export then poses each moment.
  const letGifsGo = holdGifsOnFirstFrame();

  try {
    return await fn();
  } finally {
    letGifsGo();
    overlays.forEach((node, index) => node.visible(visible[index]));
    stage.batchDraw();
  }
};

export interface ExportOptions {
  /** Leaves the background out, so PNG and WebP come out see-through. */
  withoutBackground?: boolean;
}

/**
 * What to capture: the canvas at its own size, `pixelRatio` pixels to each of its
 * pixels. The stage is scaled to fit the screen, which this undoes.
 */
export const captureBox = (stage: Konva.Stage, pixelRatio: number) => {
  const { canvas } = useEditor.getState();
  const scaleX = stage.scaleX();
  const scaleY = stage.scaleY();
  return {
    pixelRatio: pixelRatio / scaleX,
    x: 0,
    y: 0,
    width: canvas.width * scaleX,
    height: canvas.height * scaleY,
  };
};

export const renderCanvasDataURL = (
  format: "png" | "jpg" | "webp" = "png",
  pixelRatio = 2,
  options: ExportOptions = {},
): Promise<string | null> => {
  const stage = getStage();
  if (!stage) return Promise.resolve(null);

  return withOverlaysHidden(stage, options, async () => {
    // Text in a font still loading would export in a stand-in.
    await document.fonts.ready;
    // The stage is scaled to fit, and the pixelRatio below compensates for that,
    // so the background pattern is rasterized at `pixelRatio` device pixels per
    // canvas unit regardless of the current zoom.
    const cleanupPatternTiles = await prepareExportTiles(stage, pixelRatio);
    const cleanupBackdrop = await prepareExportBackdrop(stage, pixelRatio);

    try {
      return stage.toDataURL({
        ...captureBox(stage, pixelRatio),
        mimeType: format === "jpg" ? "image/jpeg" : `image/${format}`,
        quality: 0.95,
      });
    } finally {
      cleanupPatternTiles?.();
      cleanupBackdrop?.();
    }
  });
};

export const exportCanvas = async (
  format: "png" | "jpg" | "webp" = "png",
  pixelRatio = 2,
  options: ExportOptions = {},
) => {
  const dataUrl = await renderCanvasDataURL(format, pixelRatio, options);
  if (!dataUrl) return;
  const ext = format === "jpg" ? "jpg" : format;
  const blob = dataURLtoBlob(dataUrl);
  await saveExport(blob, `layer-design-${Date.now()}.${ext}`);
};

export const copyCanvasToClipboard = async (options: ExportOptions = {}) => {
  const png = renderCanvasDataURL("png", 2, options).then((dataUrl) => {
    if (!dataUrl) throw new Error("There's no canvas to copy.");
    return dataURLtoBlob(dataUrl);
  });
  try {
    // Handed over unfinished: WebKit refuses a write that starts after an await,
    // because it no longer counts as part of the user's key press or click.
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
  } catch {
    // Fallback: download
    const blob = await png.catch(() => null);
    if (blob) await saveExport(blob, `layer-design-${Date.now()}.png`);
  }
};

export const downloadProject = async () => {
  const project = useEditor.getState().toProject();
  await saveProject(await packProject(project), `layer-project-${Date.now()}.layer`);
};

export const openProjectFile = async () => {
  await openLayerFile();
};
