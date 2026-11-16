import type { FontWeight } from "@/types/brand";

const MIMES: Record<string, string> = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};

/** The type a font file is saved as, from its name, or null if it isn't one Layer takes. */
export const fontMime = (fileName: string) => MIMES[fileName.split(".").pop()?.toLowerCase() ?? ""] ?? null;

/** Words font files add to their family's name, for a weight or style. */
const STYLE_WORDS =
  /^(thin|hairline|extra|ultra|light|book|regular|normal|medium|semi|demi|bold|black|heavy|italic|oblique|variable|vf|wght|latin|ext|subset|webfont|\d+)$/i;

/**
 * A family name from a font file's name: "PlayfairDisplay-SemiBoldItalic.woff2"
 * is "Playfair Display". Only letters, digits, spaces and hyphens are kept.
 */
export const familyFromFileName = (fileName: string) => {
  const words = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((word) => word && !STYLE_WORDS.test(word));
  return words.join(" ").slice(0, 64) || "My font";
};

/** The weight a font file's name gives, near enough: Layer sets text Regular, Medium or Bold. */
export const weightFromFileName = (fileName: string): FontWeight => {
  const name = fileName.toLowerCase();
  if (/black|heavy|bold/.test(name)) return 700;
  if (/medium/.test(name)) return 500;
  return 400;
};
