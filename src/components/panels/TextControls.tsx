import { AlignLeft, AlignCenter, AlignRight, Heading, Pilcrow } from "lucide-react";
import { useEditor } from "@/store/editor";
import type { TextElement } from "@/types";
import { SYSTEM_FONTS } from "@/lib/constants";
import { activeKit, brandFamilies } from "@/lib/brand/kits";
import { brandText } from "@/lib/brand/apply";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SectionLabel, LabeledSlider, ColorRow, PanelHelp } from "./primitives";

/** Add › Text: puts a heading or body text on the canvas, in the active brand if there is one. */
export const TextAddPanel = () => {
  const addText = useEditor((s) => s.addText);
  const kit = useEditor(activeKit);
  const add = (variant: TextElement["variant"]) => addText(variant, kit ? brandText(kit, variant) : undefined);
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-6 pt-4">
      <Button variant="primary" size="block" className="cursor-pointer" onClick={() => add("heading")}>
        <Heading className="h-3.5 w-3.5" /> Add a heading
      </Button>
      <Button variant="outline" size="block" className="cursor-pointer" onClick={() => add("body")}>
        <Pilcrow className="h-3.5 w-3.5" /> Add body text
      </Button>
      <PanelHelp>
        {kit
          ? `New text is set in ${kit.name}'s fonts and colors. Its settings are on the right.`
          : "Double-click text on the canvas to type. Its font, size and color are on the right."}
      </PanelHelp>
    </div>
  );
};

const FontItems = ({ label, families }: { label: string; families: string[] }) =>
  families.length > 0 ? (
    <SelectGroup>
      <SelectLabel>{label}</SelectLabel>
      {families.map((family) => (
        <SelectItem key={family} value={family}>
          <span style={{ fontFamily: family }}>{family}</span>
        </SelectItem>
      ))}
    </SelectGroup>
  ) : null;

const useTextUpdate = (text: TextElement) => {
  const update = useEditor((s) => s.updateElement);
  return (patch: Partial<TextElement>) => update(text.id, patch);
};

/** What it says, its font, weight, size and alignment. */
export const TypographyControls = ({ text }: { text: TextElement }) => {
  const set = useTextUpdate(text);
  const kit = useEditor(activeKit);
  // The brand's first, then Layer's own, then any other this text already uses.
  const brand = kit ? brandFamilies(kit) : [];
  const layer = SYSTEM_FONTS.filter((family) => !brand.includes(family));
  const other = [text.fontFamily].filter((family) => !brand.includes(family) && !layer.includes(family));
  return (
    <div className="flex flex-col gap-2.5">
      <Textarea aria-label="Text" value={text.text} onChange={(e) => set({ text: e.target.value })} rows={3} />
      <Select value={text.fontFamily} onValueChange={(v) => set({ fontFamily: v })}>
        <SelectTrigger aria-label="Font"><SelectValue placeholder="Font" /></SelectTrigger>
        <SelectContent>
          <FontItems label={kit ? kit.name : "Brand"} families={brand} />
          <FontItems label="Layer" families={layer} />
          <FontItems label="In this design" families={other} />
        </SelectContent>
      </Select>
      <ToggleGroup
        type="single"
        value={String(text.fontWeight)}
        onValueChange={(v) => v && set({ fontWeight: Number(v) as 400 | 500 | 700 })}
        className="w-full"
      >
        <ToggleGroupItem value="400" className="cursor-pointer">Regular</ToggleGroupItem>
        <ToggleGroupItem value="500" className="cursor-pointer">Medium</ToggleGroupItem>
        <ToggleGroupItem value="700" className="cursor-pointer">Bold</ToggleGroupItem>
      </ToggleGroup>
      <LabeledSlider label="SIZE" unit="px" min={12} max={240} value={text.fontSize} onChange={(v) => set({ fontSize: v })} />
      <SectionLabel>ALIGN</SectionLabel>
      <ToggleGroup
        type="single"
        value={text.align}
        onValueChange={(v) => v && set({ align: v as "left" | "center" | "right" })}
        className="w-full"
      >
        <ToggleGroupItem value="left" aria-label="Align left" className="cursor-pointer"><AlignLeft className="h-3 w-3" /></ToggleGroupItem>
        <ToggleGroupItem value="center" aria-label="Align center" className="cursor-pointer"><AlignCenter className="h-3 w-3" /></ToggleGroupItem>
        <ToggleGroupItem value="right" aria-label="Align right" className="cursor-pointer"><AlignRight className="h-3 w-3" /></ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
};

/** Letter spacing and line height. */
export const SpacingControls = ({ text }: { text: TextElement }) => {
  const set = useTextUpdate(text);
  return (
    <div className="flex flex-col gap-2.5">
      <LabeledSlider label="LETTER SPACING" min={-10} max={20} value={text.letterSpacing} onChange={(v) => set({ letterSpacing: v })} />
      <LabeledSlider
        label="LINE HEIGHT"
        min={80}
        max={250}
        unit="%"
        value={Math.round(text.lineHeight * 100)}
        onChange={(v) => set({ lineHeight: v / 100 })}
      />
    </div>
  );
};

/** The text's colour. */
export const TextColorControls = ({ text }: { text: TextElement }) => {
  const set = useTextUpdate(text);
  return <ColorRow value={text.fill} onChange={(v) => set({ fill: v })} />;
};
