import type { BackgroundState, LayerElement } from "@/types";
import { BACKDROP_PRESETS } from "@/lib/backdrops/presets";
import { NO_EFFECTS } from "@/lib/background/effects";

/*
  Looks: design directions that set several things at once — the background, how
  text is set, and how images sit on the page — so a user can start from a
  finished feel instead of choosing every setting. Each uses only settings Layer
  already has, and everything stays editable afterwards.
*/

type Shadow = NonNullable<LayerElement["shadow"]>;

export interface DesignLook {
  id: string;
  label: string;
  /** What it feels like, in a few words. */
  description: string;
  background: Partial<BackgroundState>;
  text: { fontFamily: string; fontWeight: 400 | 500 | 700; fill: string; letterSpacing: number };
  /** Image corners as a share of the shorter side, and the shadow under images. */
  image: { cornerShare: number; shadow: Shadow };
}

const abstract = (id: string): Partial<BackgroundState> => {
  const preset = BACKDROP_PRESETS.find((p) => p.id === id) ?? BACKDROP_PRESETS[0];
  return { mode: "abstract", backdrop: preset.look };
};

const shadow = (color: string, blur: number, offsetY: number): Shadow => ({
  enabled: true,
  color,
  blur,
  offsetX: 0,
  offsetY,
});

export const DESIGN_LOOKS: DesignLook[] = [
  {
    id: "editorial",
    label: "Editorial",
    description: "Clean, magazine-like",
    background: { mode: "solid", color: "#F4F1EA" },
    text: { fontFamily: "Inter", fontWeight: 500, fill: "#1A1826", letterSpacing: -1 },
    image: { cornerShare: 0, shadow: shadow("rgba(26,24,38,0.18)", 30, 12) },
  },
  {
    id: "bold",
    label: "Bold",
    description: "Big type, strong contrast",
    background: abstract("sunset-streaks"),
    text: { fontFamily: "Bricolage Grotesque", fontWeight: 700, fill: "#FFFFFF", letterSpacing: -2 },
    image: { cornerShare: 0.06, shadow: shadow("rgba(0,0,0,0.55)", 60, 30) },
  },
  {
    id: "luxury",
    label: "Luxury",
    description: "Restrained and premium",
    background: { mode: "gradient", gradient: { from: "#14110C", to: "#3A2F1E", angle: 135 } },
    text: { fontFamily: "Inter", fontWeight: 400, fill: "#E8D9B5", letterSpacing: 4 },
    image: { cornerShare: 0.02, shadow: shadow("rgba(0,0,0,0.6)", 80, 40) },
  },
  {
    id: "tech",
    label: "Tech",
    description: "Dark and modern",
    background: abstract("violet-glow"),
    text: { fontFamily: "DM Sans", fontWeight: 700, fill: "#E7E5F5", letterSpacing: -1 },
    image: { cornerShare: 0.04, shadow: shadow("rgba(83,74,183,0.55)", 70, 24) },
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Plain and airy",
    background: { mode: "solid", color: "#FFFFFF" },
    text: { fontFamily: "Inter", fontWeight: 500, fill: "#111111", letterSpacing: 0 },
    image: { cornerShare: 0.03, shadow: shadow("rgba(0,0,0,0.12)", 40, 16) },
  },
  {
    id: "playful",
    label: "Playful",
    description: "Bright and friendly",
    background: abstract("coral"),
    text: { fontFamily: "Bricolage Grotesque", fontWeight: 700, fill: "#FFFFFF", letterSpacing: 0 },
    image: { cornerShare: 0.1, shadow: shadow("rgba(120,20,60,0.35)", 50, 20) },
  },
];

/** The background a look gives: its own settings, over what's there, with effects cleared. */
export const lookBackground = (look: DesignLook, current: BackgroundState): BackgroundState => ({
  ...current,
  ...look.background,
  effects: NO_EFFECTS,
});

/** An element dressed in a look. Framed images keep the frame's own edges. */
export const inLook = (look: DesignLook, el: LayerElement): LayerElement => {
  if (el.type === "text") {
    return { ...el, ...look.text };
  }
  if (el.type === "image") {
    if (el.deviceFrame) return { ...el, shadow: look.image.shadow };
    return {
      ...el,
      cornerRadius: Math.round(look.image.cornerShare * Math.min(el.width, el.height)),
      shadow: look.image.shadow,
    };
  }
  return el;
};
