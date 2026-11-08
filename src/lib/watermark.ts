import type { WatermarkPlace, WatermarkSettings } from "@/types";

export const WATERMARK_PLACES: WatermarkPlace[] = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

export const DEFAULT_WATERMARK: WatermarkSettings = {
  badge: { show: true, place: "bottom-right", size: 1, opacity: 1 },
  own: {
    kind: "none",
    text: "",
    color: "#FFFFFF",
    logoSrc: null,
    place: "bottom-left",
    tiled: false,
    size: 1,
    opacity: 0.8,
  },
};

/** Size and opacity ranges, as shares. */
export const WATERMARK_SIZE = { min: 0.5, max: 3 };
export const WATERMARK_OPACITY_MIN = 0.05;

/**
 * The badge as it's drawn. Free exports always carry it at full size and
 * strength, whatever a file or the store says; only its place can change.
 */
export const badgeAsDrawn = (settings: WatermarkSettings, isPro: boolean) =>
  isPro ? settings.badge : { ...settings.badge, show: true, size: 1, opacity: 1 };

/** The badge's height, in canvas units: a share of the shorter side, never too small to read. */
export const badgeHeightOf = (canvas: { width: number; height: number }, size: number) =>
  Math.max(20, Math.min(canvas.width, canvas.height) * 0.027) * size;

/** The gap kept from the canvas edge. */
export const marginOf = (canvas: { width: number; height: number }) =>
  Math.max(12, Math.min(canvas.width, canvas.height) * 0.018);

/** Where a box of this size sits, for a place on the canvas. */
export const placeBox = (
  place: WatermarkPlace,
  size: { width: number; height: number },
  canvas: { width: number; height: number },
  margin: number,
) => {
  const column = place.endsWith("left") ? 0 : place.endsWith("right") ? 2 : 1;
  const row = place.startsWith("top") ? 0 : place.startsWith("bottom") ? 2 : 1;
  const x = [margin, (canvas.width - size.width) / 2, canvas.width - size.width - margin][column];
  const y = [margin, (canvas.height - size.height) / 2, canvas.height - size.height - margin][row];
  return { x, y };
};

/** When the badge and the user's own share a place, the user's moves inwards past it. */
export const stackedPast = (place: WatermarkPlace, badgeHeight: number, margin: number) =>
  place.startsWith("top") ? badgeHeight + margin / 2 : -(badgeHeight + margin / 2);

const isPlace = (value: unknown): value is WatermarkPlace => WATERMARK_PLACES.includes(value as WatermarkPlace);
const isHex = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const share = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback;

/** Saved watermark settings, made safe. Older files only said whether the badge showed. */
export const normaliseWatermark = (saved: unknown): WatermarkSettings => {
  if (typeof saved === "boolean") return { ...DEFAULT_WATERMARK, badge: { ...DEFAULT_WATERMARK.badge, show: saved } };
  const value = (saved && typeof saved === "object" ? saved : {}) as Record<string, Record<string, unknown> | undefined>;
  const badge = value.badge ?? {};
  const own = value.own ?? {};
  const fallback = DEFAULT_WATERMARK;
  return {
    badge: {
      show: typeof badge.show === "boolean" ? badge.show : fallback.badge.show,
      place: isPlace(badge.place) ? badge.place : fallback.badge.place,
      size: share(badge.size, WATERMARK_SIZE.min, WATERMARK_SIZE.max, 1),
      opacity: share(badge.opacity, WATERMARK_OPACITY_MIN, 1, 1),
    },
    own: {
      kind: own.kind === "text" || own.kind === "logo" ? own.kind : "none",
      text: typeof own.text === "string" ? own.text.slice(0, 120) : "",
      color: isHex(own.color) ? own.color : fallback.own.color,
      logoSrc: typeof own.logoSrc === "string" && own.logoSrc.startsWith("data:image/") ? own.logoSrc : null,
      place: isPlace(own.place) ? own.place : fallback.own.place,
      tiled: own.tiled === true,
      size: share(own.size, WATERMARK_SIZE.min, WATERMARK_SIZE.max, 1),
      opacity: share(own.opacity, WATERMARK_OPACITY_MIN, 1, fallback.own.opacity),
    },
  };
};
