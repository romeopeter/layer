/**
 * Brand kits: a brand's logos, colours and fonts, kept outside any project and
 * applied to whichever design is open. Applying copies values into the design,
 * so a project still looks right on a machine without the kit.
 */

export type FontWeight = 400 | 500 | 700;

/** In a kit's order: the first is the main colour, the second the second. */
export interface BrandColor {
  id: string;
  name: string;
  hex: string;
}

/** The first is the main logo: the one Apply brand uses as the watermark. */
export interface BrandLogo {
  id: string;
  name: string;
  /** Always a `data:image/` URL, so it travels into projects whole. */
  src: string;
}

/** One weight of a font, as a `data:` URL. */
export interface FontFile {
  weight: FontWeight;
  src: string;
}

/** A font added to a kit. Layer's own fonts need no entry here. */
export interface BrandFont {
  family: string;
  source: "google" | "upload";
  files: FontFile[];
}

/** How a heading or body text is set. A null colour keeps the text's own. */
export interface BrandTextStyle {
  family: string;
  weight: FontWeight;
  colorId: string | null;
  letterSpacing: number;
}

export interface BrandImageStyle {
  /** Corners as a share of the image's shorter side. */
  cornerShare: number;
  shadow: boolean;
}

export interface BrandKit {
  id: string;
  name: string;
  updatedAt: number;
  colors: BrandColor[];
  logos: BrandLogo[];
  fonts: BrandFont[];
  heading: BrandTextStyle;
  body: BrandTextStyle;
  images: BrandImageStyle;
}

/** What's kept on disk. */
export interface BrandKitsFile {
  version: 1;
  activeId: string | null;
  kits: BrandKit[];
}
