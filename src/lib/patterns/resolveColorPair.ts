import type { PatternColorPair, PatternConfig } from "@/types/pattern";
import { CURATED_PATTERN_PAIRS } from "@/data/curatedPatternPairs";

const FALLBACK_PAIR = CURATED_PATTERN_PAIRS[0];

/**
 * `.layer` files store only the pair id, so hexes aren't duplicated into every
 * project and custom pairs stay editable in one place. Resolution happens at
 * render time against curated presets and the user's custom pairs. Brand pairs
 * write their colours into the pattern instead, so they never need resolving.
 *
 * Custom pairs are passed in rather than read from the store so this stays a
 * pure lookup — callers own where the list comes from.
 *
 * A missing id is expected in normal use: a project referencing a custom pair,
 * opened on an install that doesn't have it, has nothing to resolve. So this
 * falls back to a curated pair rather than throwing.
 */
export const resolveColorPair = (
  colorPairId: string,
  customPairs: PatternColorPair[] = [],
): PatternColorPair =>
  CURATED_PATTERN_PAIRS.find((p) => p.id === colorPairId) ??
  customPairs.find((p) => p.id === colorPairId) ??
  FALLBACK_PAIR;

/** The colours a pattern draws with: Shuffle's own, or its swatch's. */
export const patternPairOf = (
  pattern: PatternConfig,
  customPairs: PatternColorPair[] = [],
): PatternColorPair =>
  pattern.colors
    ? { id: "shuffled", source: "custom", ...pattern.colors }
    : resolveColorPair(pattern.colorPairId, customPairs);
