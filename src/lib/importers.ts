import { useEditor } from "../store/editor";
import type { LayerProject } from "../types";
import { pickProjectFile, showError } from "./host";
import { NOT_A_PROJECT, readProjectFile } from "./projectFile";

export { parseProject } from "./projectFile";

export const fileToDataURL = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

export const importImageFile = async (
  file: File | Blob,
  addImage: (src: string, w: number, h: number) => string
) => {
  if (!file.type.startsWith("image/")) return;
  const dataUrl = await fileToDataURL(file);
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
