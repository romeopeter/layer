/*
  The canvas sizes Layer offers, by where the design is going. The canvas size picker
  shows them all; layouts suggest from the ones for posts.
*/

export interface PlatformSize {
  label: string;
  width: number;
  height: number;
  /** Not a design to post (a header, a banner, a cover, an icon), so layouts don't suggest it. */
  post?: false;
}

export interface Platform {
  name: string;
  sizes: PlatformSize[];
}

export const PLATFORMS: Platform[] = [
  {
    name: "Instagram",
    sizes: [
      { label: "Post (Square)", width: 1080, height: 1080 },
      { label: "Post (Portrait)", width: 1080, height: 1350 },
      { label: "Story", width: 1080, height: 1920 },
      { label: "Reel Cover", width: 1080, height: 1920 },
    ],
  },
  {
    name: "Twitter / X",
    sizes: [
      { label: "In-stream", width: 1600, height: 900 },
      { label: "Card", width: 1200, height: 628 },
      { label: "Header", width: 1500, height: 500, post: false },
    ],
  },
  {
    name: "Bluesky",
    sizes: [
      { label: "Post", width: 1200, height: 675 },
      { label: "Profile", width: 3000, height: 1000, post: false },
    ],
  },
  {
    name: "LinkedIn",
    sizes: [
      { label: "Post", width: 1200, height: 1200 },
      { label: "Article", width: 1920, height: 1080 },
      { label: "Banner", width: 1584, height: 396, post: false },
    ],
  },
  {
    name: "Facebook",
    sizes: [
      { label: "Post", width: 1200, height: 630 },
      { label: "Cover", width: 820, height: 312, post: false },
    ],
  },
  {
    name: "YouTube",
    sizes: [
      { label: "Thumbnail", width: 1280, height: 720 },
      { label: "Channel art", width: 2560, height: 1440, post: false },
    ],
  },
  {
    name: "Dribbble",
    sizes: [
      { label: "Shot", width: 1600, height: 1200 },
      { label: "Hi-res", width: 2400, height: 1800 },
    ],
  },
  {
    name: "Product Hunt",
    sizes: [
      { label: "Gallery", width: 2400, height: 1350 },
      { label: "Thumbnail", width: 240, height: 240, post: false },
    ],
  },
];

/** The name a size goes by once chosen: its platform, then its own. */
export const sizeName = (platform: Platform, size: PlatformSize) => `${platform.name} ${size.label}`;

/** Sizes for posts, one of each shape, in the picker's order. */
export const POST_SIZES = (() => {
  const shapes: number[] = [];
  return PLATFORMS.flatMap((platform) =>
    platform.sizes.flatMap((size) => {
      if (size.post === false) return [];
      const ratio = size.width / size.height;
      if (shapes.some((shape) => Math.abs(Math.log(shape / ratio)) < 0.02)) return [];
      shapes.push(ratio);
      return [{ label: sizeName(platform, size), width: size.width, height: size.height }];
    }),
  );
})();
