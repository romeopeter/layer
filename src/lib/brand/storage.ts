import type { BrandKit, BrandKitsFile } from "@/types/brand";
import { loadBrandAsset, storeBrandAsset } from "@/lib/host";

/*
  How brand kits sit on disk. In the app a kit's fonts and logos are `data:` URLs,
  which everything else (the font registry, the watermark, the canvas) already
  takes. In brand-kits.json each is the name of a file the desktop keeps beside it
  (`asset`), so the JSON stays small and is cheap to write on every change. A file
  that couldn't be kept stays inline (`src`), as version 1 files had everything.
*/

/** Names the desktop gave each `data:` URL this session, so nothing is sent twice. */
const named = new Map<string, string>();

const nameOf = async (src: string): Promise<string | null> => {
  const known = named.get(src);
  if (known) return known;
  try {
    const name = await storeBrandAsset(src);
    named.set(src, name);
    return name;
  } catch (error) {
    console.error(error);
    return null;
  }
};

/** A font file or logo as it's written: by name if it could be kept, otherwise inline. */
const packed = async <T extends { src: string }>(entry: T) => {
  const name = await nameOf(entry.src);
  if (!name) return entry;
  const byName: Record<string, unknown> = { ...entry, asset: name };
  delete byName.src;
  return byName;
};

const packKit = async (kit: BrandKit) => ({
  ...kit,
  logos: await Promise.all(kit.logos.map(packed)),
  fonts: await Promise.all(
    kit.fonts.map(async (font) => ({ ...font, files: await Promise.all(font.files.map(packed)) })),
  ),
});

/** The kits as brand-kits.json holds them, with their files kept beside it. */
export const packBrandKits = async (file: BrandKitsFile) => ({
  version: 2,
  activeId: file.activeId,
  kits: await Promise.all(file.kits.map(packKit)),
});

type Stored = Record<string, unknown>;

/** A stored font file or logo, back as a `data:` URL. Left without one if its file is gone. */
const unpacked = async (entry: unknown) => {
  if (typeof entry !== "object" || entry === null) return entry;
  const { asset, ...rest } = entry as Stored;
  if (typeof asset !== "string") return entry;
  try {
    const src = await loadBrandAsset(asset);
    named.set(src, asset);
    return { ...rest, src };
  } catch {
    // The normaliser drops a font file or logo with nothing to show.
    return rest;
  }
};

const listOf = (value: unknown) => (Array.isArray(value) ? value : []);

/**
 * brand-kits.json, any version, with every kept file read back in. What comes
 * back is still unchecked: `normaliseBrandKits` does that.
 */
export const unpackBrandKits = async (file: unknown): Promise<unknown> => {
  if (typeof file !== "object" || file === null) return file;
  const stored = file as Stored;
  return {
    ...stored,
    kits: await Promise.all(
      listOf(stored.kits).map(async (kit) => {
        if (typeof kit !== "object" || kit === null) return kit;
        const entry = kit as Stored;
        return {
          ...entry,
          logos: await Promise.all(listOf(entry.logos).map(unpacked)),
          fonts: await Promise.all(
            listOf(entry.fonts).map(async (font) =>
              typeof font === "object" && font !== null
                ? { ...font, files: await Promise.all(listOf((font as Stored).files).map(unpacked)) }
                : font,
            ),
          ),
        };
      }),
    ),
  };
};
