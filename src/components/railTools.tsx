import type { ReactNode } from "react";
import { Award, LayoutGrid, Palette, Play, Plus } from "lucide-react";
import type { Tool } from "@/store/editor";

/** One tab of a rail group: a left-panel view, named the way users think of it. */
export interface RailTab {
  key: Tool;
  label: string;
}

/**
 * The rail, grouped by what someone is trying to do rather than by setting. A
 * selected object's own settings (Corner, Shadow, 3D, Position, Text) aren't
 * here: they're in the Properties panel on the right whenever it's selected.
 */
export interface RailGroup {
  key: string;
  label: string;
  /** What's inside, in a few words, shown as the rail item's tooltip. */
  hint: string;
  icon: ReactNode;
  tabs: RailTab[];
}

export const RAIL_GROUPS: RailGroup[] = [
  {
    key: "add",
    label: "Add",
    hint: "Images, uploads, text and elements",
    icon: <Plus className="h-4.5 w-4.5" />,
    tabs: [
      { key: "images", label: "Images" },
      { key: "uploads", label: "Uploads" },
      { key: "header", label: "Text" },
      { key: "annotation", label: "Elements" },
    ],
  },
  {
    key: "templates",
    label: "Templates",
    hint: "Ready-made looks to start from",
    icon: <LayoutGrid className="h-4.5 w-4.5" />,
    tabs: [{ key: "templates", label: "Templates" }],
  },
  {
    key: "design",
    label: "Design",
    hint: "Background, layout, mockup and layers",
    icon: <Palette className="h-4.5 w-4.5" />,
    tabs: [
      { key: "background", label: "Background" },
      { key: "layout", label: "Layout" },
      { key: "mockup", label: "Mockup" },
      { key: "layers", label: "Layers" },
    ],
  },
  {
    key: "brand",
    label: "Brand",
    hint: "Watermark and brand kit",
    icon: <Award className="h-4.5 w-4.5" />,
    tabs: [
      { key: "watermark", label: "Watermark" },
      { key: "brands", label: "Brand kit" },
    ],
  },
  {
    key: "animate",
    label: "Animate",
    hint: "Bring the design to life: camera, objects, zoom and live backgrounds",
    icon: <Play className="h-4.5 w-4.5" />,
    tabs: [{ key: "motion", label: "Animate" }],
  },
];

/** The group a left-panel view belongs to. */
export const groupOf = (tool: Tool) => RAIL_GROUPS.find((group) => group.tabs.some((tab) => tab.key === tool));
