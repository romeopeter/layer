import type { PatternColorPair } from "@/types/pattern";
import type { BrandColor } from "@/types/brand";

/** Enough to choose from without a row of near-twins. */
const MAX_BRAND_PAIRS = 6;

/**
 * Pairs from the active brand kit's colours, for the pattern's "From your brand"
 * row. Its first three colours, each way round: swapping base and accent reads as
 * a different pattern, not a duplicate.
 *
 * Ids come from the colours' own ids, so they don't change when the kit's order
 * does. Choosing one writes its colours into the pattern (see `PatternPanel`),
 * so a project never needs the kit to look right.
 */
export const deriveBrandPatternPairs = (colors: BrandColor[]): PatternColorPair[] => {
  const main = colors.slice(0, 3);
  const pairs: PatternColorPair[] = [];
  for (let gap = 1; gap < main.length; gap++) {
    for (let i = 0; i + gap < main.length; i++) {
      for (const [base, accent] of [
        [main[i], main[i + gap]],
        [main[i + gap], main[i]],
      ]) {
        if (base.hex === accent.hex) continue;
        pairs.push({
          id: `brand-${base.id}-${accent.id}`,
          base: base.hex,
          accent: accent.hex,
          source: "brand",
          label: `${base.name} / ${accent.name}`,
        });
      }
    }
  }
  return pairs.slice(0, MAX_BRAND_PAIRS);
};
