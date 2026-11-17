import type { PatternColorPair } from "@/types/pattern";

/** Enough to choose from; a runaway file is cut short. */
const MAX_CUSTOM_PAIRS = 60;
const HEX = /^#[0-9a-f]{6}$/i;

/** Pattern colour pairs the user made, from their file, which may be damaged. */
export const normaliseCustomPairs = (value: unknown): PatternColorPair[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .flatMap((entry): PatternColorPair[] => {
      if (typeof entry !== "object" || entry === null) return [];
      const { id, base, accent, label } = entry as Record<string, unknown>;
      if (typeof id !== "string" || !id || seen.has(id)) return [];
      if (typeof base !== "string" || !HEX.test(base) || typeof accent !== "string" || !HEX.test(accent)) return [];
      seen.add(id);
      return [{ id, base, accent, source: "custom", ...(typeof label === "string" ? { label } : {}) }];
    })
    .slice(0, MAX_CUSTOM_PAIRS);
};
