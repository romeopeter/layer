import type { PatternColorPair, PatternConfig } from "@/types/pattern";
import { CURATED_PATTERN_PAIRS } from "@/data/curatedPatternPairs";

const FALLBACK_PAIR = CURATED_PATTERN_PAIRS[0];

/**
 * A curated pair is stored by its id alone: every install has the same ones.
 * Brand and custom pairs write their colours into the pattern (`colors`), so a
 * project carries them and never needs the kit or the user's list to look right.
 *
 * Custom pairs are passed in rather than read from the store so this stays a
 * pure lookup — callers own where the list comes from.
 *
 * A missing id is still possible: a project from before custom pairs carried
 * their colours, opened on an install that doesn't have the pair. So this falls
 * back to a curated pair rather than throwing.
 */
export const resolveColorPair = (
  colorPairId: string,
  customPairs: PatternColorPair[] = [],
): PatternColorPair =>
  CURATED_PATTERN_PAIRS.find((p) => p.id === colorPairId) ??
  customPairs.find((p) => p.id === colorPairId) ??
  FALLBACK_PAIR;

/**
 * The pattern with its custom pair's colours written in, if it names one this
 * install has and doesn't carry them yet (projects from before they did).
 */
export const withCarriedColors = (pattern: PatternConfig, customPairs: PatternColorPair[]): PatternConfig => {
  if (pattern.colors) return pattern;
  const pair = customPairs.find((entry) => entry.id === pattern.colorPairId);
  return pair ? { ...pattern, colors: { base: pair.base, accent: pair.accent } } : pattern;
};

/** The colours a pattern draws with: its own (Shuffle, a brand or custom pair), or its curated swatch's. */
export const patternPairOf = (
  pattern: PatternConfig,
  customPairs: PatternColorPair[] = [],
): PatternColorPair =>
  pattern.colors
    ? { id: "shuffled", source: "custom", ...pattern.colors }
    : resolveColorPair(pattern.colorPairId, customPairs);
