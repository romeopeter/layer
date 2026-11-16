/**
 * Regenerates src/data/googleFonts.json from the Google Fonts Developer API.
 *
 * The list is fetched here, at build time, so the API key in .env never ships
 * inside the app; the app itself downloads fonts by name, which needs no key
 * (see src-tauri/src/fonts.rs). Re-run to pick up new fonts; the output is
 * committed.
 */
import { readFileSync, writeFileSync } from "node:fs";

const OUTPUT = new URL("../src/data/googleFonts.json", import.meta.url);
/** The weights Layer sets text in, and what the API calls them. */
const WEIGHTS = { regular: 400, 500: 500, 700: 700 };
const CATEGORIES = new Set(["sans-serif", "serif", "display", "handwriting", "monospace"]);

const readApiKey = () => {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const match = env.match(/^GOOGLE_FONTS_KEY\s*=\s*(\S+)\s*$/m);
  if (!match) throw new Error("GOOGLE_FONTS_KEY is missing from .env");
  return match[1].replace(/^["']|["']$/g, "");
};

const response = await fetch(
  `https://www.googleapis.com/webfonts/v1/webfonts?sort=popularity&key=${readApiKey()}`,
);
// The URL holds the key, so only the status is reported.
if (!response.ok) throw new Error(`The Google Fonts API returned ${response.status}`);

const { items } = await response.json();
if (!Array.isArray(items)) throw new Error("Unexpected Google Fonts API response");

const fonts = items.flatMap((item) => {
  const weights = Object.entries(WEIGHTS)
    .filter(([variant]) => item.variants?.includes(variant))
    .map(([, weight]) => weight);
  // Layer downloads by name, and only names of plain letters, digits and spaces.
  const plain = typeof item.family === "string" && /^[A-Za-z0-9]+( [A-Za-z0-9]+)*$/.test(item.family);
  if (!plain || weights.length === 0 || !CATEGORIES.has(item.category)) return [];
  return [{ family: item.family, category: item.category, weights }];
});

writeFileSync(OUTPUT, `${JSON.stringify(fonts)}\n`);
console.log(`Wrote ${fonts.length} fonts`);
