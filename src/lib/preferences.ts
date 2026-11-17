import type { Preferences } from "@/types/preferences";

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "dark",
  dottedGrid: true,
  reduceMotion: null,
  hiddenGroups: [],
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Preferences from their file, which may be older, newer or damaged. */
export const normalisePreferences = (value: unknown): Preferences => {
  if (!isObject(value)) return DEFAULT_PREFERENCES;
  const d = DEFAULT_PREFERENCES;
  return {
    theme: value.theme === "light" || value.theme === "dark" ? value.theme : d.theme,
    dottedGrid: typeof value.dottedGrid === "boolean" ? value.dottedGrid : d.dottedGrid,
    reduceMotion: typeof value.reduceMotion === "boolean" ? value.reduceMotion : d.reduceMotion,
    hiddenGroups: Array.isArray(value.hiddenGroups)
      ? value.hiddenGroups.filter((key): key is string => typeof key === "string").slice(0, 20)
      : d.hiddenGroups,
  };
};

/** Whether the system asks for less motion, for when the user hasn't said. */
export const systemReducesMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export const reducesMotion = (preferences: Preferences) => preferences.reduceMotion ?? systemReducesMotion();
