import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import type { LayerProject } from "@/types";

/*
  A .layer file is a zip:

    project.json            the design, with each picture and font named, not inlined
    images/<sha256>.<ext>   every picture it uses, once each, as the file it was
    fonts/<sha256>.<ext>    the files of fonts that aren't Layer's own

  In the app, pictures and fonts are `data:` URLs, as everything else expects. Saving
  moves each one into the zip and leaves a name in its place (`layer-file:images/…`);
  opening puts them back. Older .layer files, plain JSON with everything inline, still
  open. Pictures are stored as they are (they're compressed already); project.json is
  compressed.
*/

export const NOT_A_PROJECT = "This file isn't a Layer project, or it's damaged.";
const NEWER = "This project was made with a newer version of Layer. Update Layer to open it.";

const PROJECT_JSON = "project.json";
const REFERENCE = "layer-file:";
const REFERENCE_PATTERN = /^layer-file:(images|fonts)\/[0-9a-f]{64}\.[a-z0-9]+$/;
/** The newest project.json this build reads. Version 2 names its files; 1 has them inline. */
const VERSION = 2;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
  "font/otf": "otf",
  "application/font-woff": "woff",
};
const TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSIONS)
    .filter(([type]) => type !== "application/font-woff")
    .map(([type, extension]) => [extension, type]),
);

const ELEMENT_TYPES = ["image", "text", "shape"];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPositive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;

/** Checks what the canvas would crash on, before the current work is replaced. */
export const parseProject = (text: string): LayerProject => {
  let project: unknown;
  try {
    project = JSON.parse(text);
  } catch (error) {
    throw new Error(NOT_A_PROJECT, { cause: error });
  }

  if (!isObject(project)) throw new Error(NOT_A_PROJECT);
  if (typeof project.version === "number" && project.version > VERSION) throw new Error(NEWER);

  const { version, canvas, background, elements } = project;
  const valid =
    (version === 1 || version === 2) &&
    isObject(canvas) &&
    isPositive(canvas.width) &&
    isPositive(canvas.height) &&
    isObject(background) &&
    Array.isArray(elements) &&
    elements.every(
      (element) =>
        isObject(element) &&
        typeof element.id === "string" &&
        typeof element.type === "string" &&
        ELEMENT_TYPES.includes(element.type),
    );
  if (!valid) throw new Error(NOT_A_PROJECT);

  return project as unknown as LayerProject;
};

/** Every string in a JSON value, replaced, wherever it is. */
const mapStrings = async (value: unknown, replace: (text: string) => Promise<string>): Promise<unknown> => {
  if (typeof value === "string") return replace(value);
  if (Array.isArray(value)) return Promise.all(value.map((entry) => mapStrings(entry, replace)));
  if (isObject(value)) {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, entry]) => [key, await mapStrings(entry, replace)] as const),
    );
    return Object.fromEntries(entries);
  }
  return value;
};

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");

const typeOf = (dataUrl: string) => /^data:([^;,]+)[;,]/.exec(dataUrl)?.[1]?.toLowerCase() ?? "";

const folderOf = (type: string) =>
  type.startsWith("image/") ? "images" : type.startsWith("font/") || type === "application/font-woff" ? "fonts" : null;

/** The project as a .layer file: a zip with each picture and font as a file of its own. */
export const packProject = async (project: LayerProject): Promise<Uint8Array> => {
  const files: Zippable = {};
  // The same picture used twice is kept once.
  const named = new Map<string, string>();
  const packed = await mapStrings(project, async (text) => {
    if (!text.startsWith("data:")) return text;
    const known = named.get(text);
    if (known) return known;
    const type = typeOf(text);
    const folder = folderOf(type);
    const extension = EXTENSIONS[type];
    if (!folder || !extension) return text;
    const bytes = new Uint8Array(await (await fetch(text)).arrayBuffer());
    const name = `${folder}/${hex(await crypto.subtle.digest("SHA-256", bytes))}.${extension}`;
    files[name] = [bytes, { level: 0 }];
    named.set(text, REFERENCE + name);
    return REFERENCE + name;
  });
  return zipSync({
    [PROJECT_JSON]: [strToU8(JSON.stringify({ ...(packed as object), version: VERSION }, null, 2)), { level: 6 }],
    ...files,
  });
};

const dataUrlOf = (bytes: Uint8Array, type: string) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
  });

const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

/** A .layer file's bytes, of either kind, as a checked project with its pictures back in. */
export const readProjectFile = async (bytes: Uint8Array): Promise<LayerProject> => {
  if (!isZip(bytes)) return parseProject(new TextDecoder().decode(bytes));

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (error) {
    throw new Error(NOT_A_PROJECT, { cause: error });
  }
  const json = entries[PROJECT_JSON];
  if (!json) throw new Error(NOT_A_PROJECT);
  const project = parseProject(strFromU8(json));

  const read = new Map<string, Promise<string>>();
  const unpacked = await mapStrings(project, async (text) => {
    if (!REFERENCE_PATTERN.test(text)) return text;
    const name = text.slice(REFERENCE.length);
    const file = entries[name];
    // A file missing from the zip leaves its name, which shows as a picture that won't load.
    if (!file) return text;
    if (!read.has(name)) read.set(name, dataUrlOf(file, TYPES[name.split(".").pop() ?? ""] ?? "application/octet-stream"));
    return read.get(name) as Promise<string>;
  });
  return unpacked as LayerProject;
};
