import type { BackgroundState, LayerElement, WatermarkSettings } from "@/types";
import type { BrandKit } from "@/types/brand";
import type { Palette } from "@/lib/backdrops/colors";
import { lookWithColor } from "@/lib/backdrops/presets";
import { styleImage, styleText } from "@/lib/looks";
import { colorOf } from "./kits";

type Shadow = NonNullable<LayerElement["shadow"]>;

/** The shadow a brand's images get when its kit says they have one. */
export const BRAND_SHADOW: Shadow = { enabled: true, color: "rgba(0,0,0,0.35)", blur: 50, offsetX: 0, offsetY: 24 };

/**
 * The background in the brand's colours, keeping its type where the kit has
 * colours enough: a gradient or pattern needs two, so one colour makes it solid.
 * An image background stays as it is, and so do the effects.
 */
export const brandBackground = (kit: BrandKit, current: BackgroundState): BackgroundState => {
  const [first, second, third] = kit.colors.map((color) => color.hex);
  if (!first) return current;
  const solid: BackgroundState = { ...current, mode: "solid", color: first };
  switch (current.mode) {
    case "solid":
      return solid;
    case "gradient":
      return second ? { ...current, gradient: { ...current.gradient, from: first, to: second } } : solid;
    case "pattern":
      return second ? { ...current, pattern: { ...current.pattern, colors: { base: first, accent: second } } } : solid;
    case "abstract": {
      // Built round the main colour, with the brand's next colours as its accents.
      const look = lookWithColor(current.backdrop, first);
      const colors: Palette = [...look.colors];
      if (second) colors[2] = second;
      if (third) colors[3] = third;
      return { ...current, backdrop: { ...look, colors } };
    }
    default:
      return current;
  }
};

/** An element in the brand: headings and body text in their styles, images with its corners and shadow. */
export const inBrand = (kit: BrandKit, el: LayerElement): LayerElement => {
  if (el.type === "text") {
    const style = el.variant === "heading" ? kit.heading : kit.body;
    return styleText(el, {
      fontFamily: style.family,
      fontWeight: style.weight,
      letterSpacing: style.letterSpacing,
      fill: colorOf(kit, style.colorId) ?? el.fill,
    });
  }
  if (el.type === "image") {
    const shadow = kit.images.shadow ? BRAND_SHADOW : { ...(el.shadow ?? BRAND_SHADOW), enabled: false };
    return styleImage(el, kit.images.cornerShare, shadow);
  }
  return el;
};

/** The watermark with the kit's main logo as the user's own. Where it sits, and its size, stay. */
export const brandWatermark = (kit: BrandKit, current: WatermarkSettings): WatermarkSettings => {
  const logo = kit.logos[0];
  return logo ? { ...current, own: { ...current.own, kind: "logo", logoSrc: logo.src } } : current;
};

interface Design {
  background: BackgroundState;
  elements: LayerElement[];
  watermark: WatermarkSettings;
}

/** The whole design in the brand: what Apply brand sets, in one go. */
export const brandPatch = (kit: BrandKit, design: Design): Design => ({
  background: brandBackground(kit, design.background),
  elements: design.elements.map((el) => inBrand(kit, el)),
  watermark: brandWatermark(kit, design.watermark),
});
