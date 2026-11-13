import type { LayerElement, ShapeKind } from "@/types";

/** What each kind of mark is called in the layer list and Properties. */
export const SHAPE_LABELS: Partial<Record<ShapeKind, string>> = {
  rect: "Rectangle",
  "rounded-rect": "Rounded",
  ellipse: "Ellipse",
  triangle: "Triangle",
  diamond: "Diamond",
  pentagon: "Pentagon",
  hexagon: "Hexagon",
  star: "Star",
  heart: "Heart",
  cross: "Cross",
  arrow: "Arrow",
  line: "Line",
  highlight: "Highlight",
  callout: "Callout",
  "qr-code": "QR Code",
  pencil: "Draw",
  number: "Number",
  emoji: "Emoji",
  icons: "Icon",
  badge: "Badge",
};

/** A layer's name: its kind, or a text layer's first line. */
export const layerName = (element: LayerElement) => {
  if (element.type === "image") return "Image";
  if (element.type === "text") return element.text.trim().split("\n")[0] || "Text";
  return SHAPE_LABELS[element.shape] ?? element.shape;
};
