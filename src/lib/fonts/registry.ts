import type { FontWeight, ProjectFont } from "@/types/brand";

/*
  Fonts that aren't Layer's own (uploaded, or from Google Fonts), added to the
  page so the canvas, the text editor and exports can all use them by name.
  Each is kept with its file, so a project can carry the fonts it uses.
*/

type FontSource = ProjectFont;

const registered = new Map<string, FontSource & { face: FontFace }>();
const keyOf = (family: string, weight: FontWeight) => `${family}|${weight}`;

let onLoaded = () => {};
/** Called whenever a font finishes loading, so text set in it is measured again. */
export const setFontLoadedListener = (listener: () => void) => {
  onLoaded = listener;
};

/** The bytes in a base64 `data:` URL. Read here, so no CSP rule decides whether it loads. */
const bytesOf = (src: string): ArrayBuffer => {
  const base64 = src.slice(src.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

/** Loads a font file, or fails if it isn't one. */
const faceOf = async (family: string, weight: FontWeight, src: string) => {
  const face = new FontFace(family, bytesOf(src), { weight: String(weight) });
  await face.load();
  return face;
};

/** Adds one weight of a font to the page. A different file for the same weight replaces it. */
export const registerFont = async ({ family, weight, src }: FontSource): Promise<boolean> => {
  const key = keyOf(family, weight);
  const existing = registered.get(key);
  if (existing?.src === src) return true;
  let face: FontFace;
  try {
    face = await faceOf(family, weight, src);
  } catch {
    return false;
  }
  if (existing) document.fonts.delete(existing.face);
  document.fonts.add(face);
  registered.set(key, { family, weight, src, face });
  onLoaded();
  return true;
};

export const registerFonts = (fonts: FontSource[]) => Promise.all(fonts.map(registerFont));

/** The files added for a family, to carry in a project. */
export const fontFilesFor = (family: string): FontSource[] =>
  [...registered.values()]
    .filter((font) => font.family === family)
    .map(({ family: name, weight, src }) => ({ family: name, weight, src }));

/** Whether a file is a font the browser can use, tried under a name nothing else uses. */
export const isUsableFont = async (src: string) => {
  try {
    await faceOf(`layer-check-${Math.random().toString(36).slice(2)}`, 400, src);
    return true;
  } catch {
    return false;
  }
};
