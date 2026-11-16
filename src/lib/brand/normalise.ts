import type {
  BrandColor,
  BrandFont,
  BrandKit,
  BrandKitsFile,
  BrandLogo,
  BrandTextStyle,
  FontFile,
  FontWeight,
} from "@/types/brand";
import { isHex } from "@/lib/backdrops/colors";
import {
  DEFAULT_BODY,
  DEFAULT_HEADING,
  DEFAULT_IMAGE_STYLE,
  MAX_BRAND_COLORS,
  MAX_BRAND_FONTS,
  MAX_BRAND_LOGOS,
  colorName,
  isLayerFont,
} from "./kits";

export const EMPTY_BRAND_KITS: BrandKitsFile = { version: 1, activeId: null, kits: [] };

type Entry = Record<string, unknown>;

const entriesOf = (value: unknown): Entry[] =>
  Array.isArray(value) ? value.filter((item): item is Entry => !!item && typeof item === "object") : [];

const text = (value: unknown, max: number, fallback: string) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;

const number = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback;

export const isFontWeight = (value: unknown): value is FontWeight => value === 400 || value === 500 || value === 700;

/**
 * Family names go into CSS and the canvas's font strings, so they're kept to
 * letters, digits, spaces, hyphens and underscores.
 */
export const isFamilyName = (value: unknown): value is string =>
  typeof value === "string" && /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,63}$/u.test(value);

export const isFontSrc = (value: unknown): value is string =>
  typeof value === "string" && (value.startsWith("data:font/") || value.startsWith("data:application/"));

const byId = <T extends { id: string }>(list: T[]) => {
  const seen = new Set<string>();
  return list.filter((item) => !seen.has(item.id) && seen.add(item.id));
};

const colorsOf = (value: unknown): BrandColor[] =>
  byId(
    entriesOf(value).flatMap((entry, i) =>
      typeof entry.id === "string" && isHex(entry.hex)
        ? [{ id: entry.id, name: text(entry.name, 40, colorName(i)), hex: entry.hex.toUpperCase() }]
        : [],
    ),
  ).slice(0, MAX_BRAND_COLORS);

const logosOf = (value: unknown): BrandLogo[] =>
  byId(
    entriesOf(value).flatMap((entry) =>
      typeof entry.id === "string" && typeof entry.src === "string" && entry.src.startsWith("data:image/")
        ? [{ id: entry.id, name: text(entry.name, 60, "Logo"), src: entry.src }]
        : [],
    ),
  ).slice(0, MAX_BRAND_LOGOS);

const filesOf = (value: unknown): FontFile[] => {
  const files = entriesOf(value).flatMap((entry) =>
    isFontWeight(entry.weight) && isFontSrc(entry.src) ? [{ weight: entry.weight, src: entry.src }] : [],
  );
  // One file a weight.
  return files.filter((file, i) => files.findIndex((other) => other.weight === file.weight) === i);
};

const fontsOf = (value: unknown): BrandFont[] => {
  const fonts = entriesOf(value).flatMap((entry): BrandFont[] => {
    const files = filesOf(entry.files);
    if (!isFamilyName(entry.family) || isLayerFont(entry.family) || files.length === 0) return [];
    return [{ family: entry.family, source: entry.source === "google" ? "google" : "upload", files }];
  });
  return fonts.filter((font, i) => fonts.findIndex((other) => other.family === font.family) === i).slice(0, MAX_BRAND_FONTS);
};

const styleOf = (value: unknown, fallback: BrandTextStyle, families: Set<string>, colorIds: Set<string>): BrandTextStyle => {
  const entry = (value && typeof value === "object" ? value : {}) as Entry;
  return {
    // A font that's gone from the kit falls back to one of Layer's.
    family:
      typeof entry.family === "string" && (isLayerFont(entry.family) || families.has(entry.family))
        ? entry.family
        : fallback.family,
    weight: isFontWeight(entry.weight) ? entry.weight : fallback.weight,
    colorId: typeof entry.colorId === "string" && colorIds.has(entry.colorId) ? entry.colorId : null,
    letterSpacing: number(entry.letterSpacing, -10, 20, fallback.letterSpacing),
  };
};

/** A kit made safe to show and apply, whatever the file says. Null if it's past saving. */
export const normaliseBrandKit = (value: unknown): BrandKit | null => {
  if (!value || typeof value !== "object") return null;
  const entry = value as Entry;
  if (typeof entry.id !== "string") return null;
  const colors = colorsOf(entry.colors);
  const fonts = fontsOf(entry.fonts);
  const families = new Set(fonts.map((font) => font.family));
  const colorIds = new Set(colors.map((color) => color.id));
  const images = (entry.images && typeof entry.images === "object" ? entry.images : {}) as Entry;
  return {
    id: entry.id,
    name: text(entry.name, 60, "Brand"),
    updatedAt: number(entry.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    colors,
    logos: logosOf(entry.logos),
    fonts,
    heading: styleOf(entry.heading, DEFAULT_HEADING, families, colorIds),
    body: styleOf(entry.body, DEFAULT_BODY, families, colorIds),
    images: {
      cornerShare: number(images.cornerShare, 0, 0.5, DEFAULT_IMAGE_STYLE.cornerShare),
      shadow: typeof images.shadow === "boolean" ? images.shadow : DEFAULT_IMAGE_STYLE.shadow,
    },
  };
};

/** The kits file, keeping what's whole enough to use. */
export const normaliseBrandKits = (value: unknown): BrandKitsFile => {
  if (!value || typeof value !== "object") return EMPTY_BRAND_KITS;
  const entry = value as Entry;
  const kits = byId(
    (Array.isArray(entry.kits) ? entry.kits : []).flatMap((kit) => {
      const normalised = normaliseBrandKit(kit);
      return normalised ? [normalised] : [];
    }),
  );
  const activeId = kits.some((kit) => kit.id === entry.activeId) ? (entry.activeId as string) : (kits[0]?.id ?? null);
  return { version: 1, activeId, kits };
};
