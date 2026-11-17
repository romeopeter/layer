import { convertHeic, isTauri } from "@/lib/host";

/*
  HEIC and HEIF photos (what iPhones take) become a JPEG, or a PNG if they have
  see-through parts, as soon as they come in, so the canvas, every export and every
  .layer file only ever hold formats every platform reads. On the desktop Rust
  decodes them (heic.rs), the same on macOS, Windows and Linux. In the browser,
  Safari reads them itself; other browsers can't, and say so.
*/

const HEIC_TYPES = ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"];
/** The brands a HEIC file names in its first box (`ftyp`). */
const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"];

export const BROWSER_CANT_READ_HEIC =
  "This browser can't open HEIC photos. Open it in the Layer desktop app, or save it as a JPG first.";

const nameOf = (file: Blob) => ("name" in file && typeof file.name === "string" ? file.name.toLowerCase() : "");

const hasHeicName = (file: Blob) => /\.(heic|heif)$/.test(nameOf(file));

/** Whether a file is a picture Layer takes, going by its type or, for HEIC with none, its name. */
export const looksLikeImage = (file: Blob) => file.type.startsWith("image/") || hasHeicName(file);

/** Whether a file is a HEIC or HEIF photo: by its type, its name, or its first bytes. */
export const isHeic = async (file: Blob): Promise<boolean> => {
  if (HEIC_TYPES.includes(file.type) || hasHeicName(file)) return true;
  if (file.type && file.type !== "application/octet-stream") return false;
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const text = String.fromCharCode(...head);
  if (text.slice(4, 8) !== "ftyp") return false;
  const major = text.slice(8, 12);
  // `mif1` is shared with AVIF, so only with a HEIC brand among those it's compatible with.
  return HEIC_BRANDS.includes(major) || (["mif1", "msf1"].includes(major) && /heic|heix/.test(text.slice(16)));
};

/** In a browser that reads HEIC itself (Safari): drawn once and saved as JPEG, or PNG if see-through. */
const inBrowser = async (file: Blob): Promise<Blob> => {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(BROWSER_CANT_READ_HEIC);
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error(BROWSER_CANT_READ_HEIC);
  g.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = g.getImageData(0, 0, canvas.width, canvas.height).data;
  let opaque = true;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 255) {
      opaque = false;
      break;
    }
  }
  const type = opaque ? "image/jpeg" : "image/png";
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(BROWSER_CANT_READ_HEIC))), type, 0.92),
  );
};

/** A HEIC or HEIF photo as a JPEG or PNG. Throws a message for the user if it can't be read. */
export const fromHeic = (file: Blob): Promise<Blob> => (isTauri ? convertHeic(file) : inBrowser(file));

/** The file as a picture any platform reads: HEIC turned into JPEG or PNG, anything else as it is. */
export const usableImage = async (file: Blob): Promise<Blob> => ((await isHeic(file)) ? fromHeic(file) : file);
