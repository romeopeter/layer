import { useEditor } from "../store/editor";
import type { LayerProject } from "../types";
import { pickProjectFile, showError } from "./host";
import { NOT_A_PROJECT, readProjectFile } from "./projectFile";
import { looksLikeImage, usableImage } from "./heic";

export { parseProject } from "./projectFile";

export const fileToDataURL = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

/** What every image picker accepts. HEIC is listed by name too: some systems give it no type. */
export const IMAGE_FILE_TYPES =
  "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/heic,image/heif,.heic,.heif";

/** An image file as a data URL, with a HEIC photo turned into JPEG or PNG first. Throws a message for the user. */
export const readImageFile = async (file: Blob): Promise<string> => fileToDataURL(await usableImage(file));

export const importImageFile = async (
  file: File | Blob,
  addImage: (src: string, w: number, h: number) => string
) => {
  if (!looksLikeImage(file)) return;
  let dataUrl: string;
  try {
    dataUrl = await readImageFile(file);
  } catch (error) {
    await showError(error instanceof Error ? error.message : "Layer couldn't read that picture.");
    return;
  }
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });
  addImage(dataUrl, img.naturalWidth, img.naturalHeight);
};

// Convenience: opens a file picker for .layer and loads it into the store.
export const openLayerFile = async () => {
  const bytes = await pickProjectFile();
  if (bytes === null) return;

  let project: LayerProject;
  try {
    project = await readProjectFile(bytes);
  } catch (error) {
    await showError(error instanceof Error ? error.message : NOT_A_PROJECT);
    return;
  }
  useEditor.getState().loadProject(project);
};
