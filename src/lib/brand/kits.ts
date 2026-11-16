import type { BackgroundState, LayerElement, WatermarkSettings } from "@/types";
import type { PatternColorPair } from "@/types/pattern";
import type { BrandColor, BrandImageStyle, BrandKit, BrandTextStyle } from "@/types/brand";
import { SYSTEM_FONTS } from "@/lib/constants";
import { isHex } from "@/lib/backdrops/colors";
import { patternPairOf } from "@/lib/patterns/resolveColorPair";

export const brandId = (prefix: "bk" | "bc" | "bl") => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

export const MAX_BRAND_COLORS = 12;
export const MAX_BRAND_LOGOS = 12;
export const MAX_BRAND_FONTS = 12;

const COLOR_NAMES = ["Primary", "Secondary", "Accent"];
/** What a colour is called until it's renamed, by its place in the kit. */
export const colorName = (index: number) => COLOR_NAMES[index] ?? `Color ${index + 1}`;

export const DEFAULT_HEADING: BrandTextStyle = {
  family: "Bricolage Grotesque",
  weight: 700,
  colorId: null,
  letterSpacing: -2,
};
export const DEFAULT_BODY: BrandTextStyle = { family: "DM Sans", weight: 400, colorId: null, letterSpacing: 0 };
export const DEFAULT_IMAGE_STYLE: BrandImageStyle = { cornerShare: 0.04, shadow: true };

/** The colours a kit starts with when the design has none to give. */
const STARTER_COLORS = ["#534AB7", "#1D9E75"];

export const isLayerFont = (family: string) => SYSTEM_FONTS.includes(family);

export const colorOf = (kit: BrandKit, id: string | null) =>
  (id && kit.colors.find((color) => color.id === id)?.hex) || null;

/** Every family a kit uses: its heading's, its body's, then fonts added to it. */
export const brandFamilies = (kit: BrandKit) => [
  ...new Set([kit.heading.family, kit.body.family, ...kit.fonts.map((font) => font.family)]),
];

/** A name not already taken. */
export const nextKitName = (kits: BrandKit[]) => {
  const taken = new Set(kits.map((kit) => kit.name));
  if (!taken.has("My brand")) return "My brand";
  let n = kits.length + 1;
  while (taken.has(`Brand ${n}`)) n++;
  return `Brand ${n}`;
};

interface Design {
  background: BackgroundState;
  elements: LayerElement[];
  watermark: WatermarkSettings;
  customPatternPairs: PatternColorPair[];
}

const backgroundColors = (bg: BackgroundState, customPairs: PatternColorPair[]): string[] => {
  switch (bg.mode) {
    case "solid":
      return [bg.color];
    case "gradient":
      return [bg.gradient.from, bg.gradient.to];
    case "pattern": {
      const pair = patternPairOf(bg.pattern, customPairs);
      return [pair.base, pair.accent];
    }
    case "abstract":
      // Main, accent and deep: the colours the eye takes from it first.
      return [bg.backdrop.colors[1], bg.backdrop.colors[2], bg.backdrop.colors[0]];
    default:
      return [];
  }
};

/**
 * A new kit, started from the open design so it's never empty: its background's
 * colours, its text's fonts and colours, its images' corners and shadow, and its
 * logo watermark. Everything can be changed after.
 */
export const kitFromDesign = (design: Design, name: string): BrandKit => {
  const heading = design.elements.find((el) => el.type === "text" && el.variant === "heading");
  const body = design.elements.find((el) => el.type === "text" && el.variant === "body");
  const image = design.elements.find((el) => el.type === "image" && !el.deviceFrame);

  const hexes = [
    ...backgroundColors(design.background, design.customPatternPairs),
    ...[heading, body].flatMap((el) => (el?.type === "text" ? [el.fill] : [])),
  ]
    .filter(isHex)
    .map((hex) => hex.toUpperCase());
  const unique = [...new Set(hexes.length > 0 ? hexes : STARTER_COLORS)].slice(0, 5);
  const colors: BrandColor[] = unique.map((hex, i) => ({ id: brandId("bc"), name: colorName(i), hex }));
  const idOf = (fill: string) => colors.find((color) => color.hex === fill.toUpperCase())?.id ?? null;

  const styleOf = (el: LayerElement | undefined, fallback: BrandTextStyle): BrandTextStyle =>
    el?.type === "text"
      ? {
          family: isLayerFont(el.fontFamily) ? el.fontFamily : fallback.family,
          weight: el.fontWeight,
          colorId: idOf(el.fill),
          letterSpacing: el.letterSpacing,
        }
      : fallback;

  const own = design.watermark.own;
  return {
    id: brandId("bk"),
    name,
    updatedAt: Date.now(),
    colors,
    logos: own.kind === "logo" && own.logoSrc ? [{ id: brandId("bl"), name: "Logo", src: own.logoSrc }] : [],
    fonts: [],
    heading: styleOf(heading, DEFAULT_HEADING),
    body: styleOf(body, DEFAULT_BODY),
    images:
      image?.type === "image"
        ? {
            cornerShare: Math.min(0.25, (image.cornerRadius ?? 0) / Math.max(1, Math.min(image.width, image.height))),
            shadow: image.shadow?.enabled ?? false,
          }
        : DEFAULT_IMAGE_STYLE,
  };
};
