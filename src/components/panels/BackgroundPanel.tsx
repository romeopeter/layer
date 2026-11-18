import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useEditor } from "@/store/editor";
import { cn } from "@/lib/utils";
import { fileToDataURL } from "@/lib/importers";
import { ScreenshotButton } from "./ScreenshotButton";
import { StockImages } from "./StockImages";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SectionLabel,
  ColorRow,
  Linebreak,
} from "./primitives";
import { PatternPanel } from "./background/PatternPanel";
import { BackdropPanel } from "./background/BackdropPanel";
import { ShuffleRow } from "./background/ShuffleRow";
import { SavedBackgrounds } from "./background/SavedBackgrounds";
import { EffectsControls } from "./background/EffectsControls";
import { choiceClass } from "./choice";
import { GradientControls } from "./GradientControls";
import { IMAGE_FILE_TYPES, readImageFile } from "@/lib/importers";
import { showError } from "@/lib/host";

const SWATCHES = [
  "#6E5BFF",
  "#A06FFF",
  "#3FCBA6",
  "#1D9E75",
  "#EF9F27",
  "#FF7A59",
  "#0F0E1A",
  "#1A1826",
  "#3C3489",
  "#534AB7",
  "#AFA9EC",
  "#EEEDFE",
];

export const BackgroundPanel = () => {
  const bg = useEditor((s) => s.background);
  const setBg = useEditor((s) => s.setBackground);
  const [tab, setTab] = useState("effects");
  const fileRef = useRef<HTMLInputElement>(null);

  const onUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setBg({ mode: "image", imageSrc: await readImageFile(file) });
    } catch (error) {
      await showError(error instanceof Error ? error.message : "Layer couldn't read that picture.");
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">

      <div className="w-full max-w-full space-y-2.5">
        <SectionLabel>TYPE</SectionLabel>
        {/* Five types only fit with tighter padding than the usual two or three. */}
        <ToggleGroup
          type="single"
          value={bg.mode}
          onValueChange={(v) => v && setBg({ mode: v as typeof bg.mode })}
          className="w-full"
        >
          <ToggleGroupItem value="solid" className="cursor-pointer px-1">Solid</ToggleGroupItem>
          <ToggleGroupItem value="gradient" className="cursor-pointer px-1">Gradient</ToggleGroupItem>
          <ToggleGroupItem value="image" className="cursor-pointer px-1">Image</ToggleGroupItem>
          <ToggleGroupItem value="pattern" className="cursor-pointer px-1">Pattern</ToggleGroupItem>
          <ToggleGroupItem value="abstract" className="cursor-pointer px-1">Abstract</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="space-y-2.5">
        {bg.mode === "solid" && (
          <div className="w-full space-x-2.5">
            <SectionLabel>COLOR</SectionLabel>
            <ColorRow value={bg.color} onChange={(v) => setBg({ color: v })} />

            <div id="solid-swatches">
              <SectionLabel>SOLID SWATCHES</SectionLabel>
              <div className="grid grid-cols-6 gap-1.5">
                {SWATCHES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-label={s}
                    aria-pressed={bg.mode === "solid" && bg.color.toLowerCase() === s.toLowerCase()}
                    onClick={() => setBg({ mode: "solid", color: s })}
                    className={cn(
                      "aspect-square cursor-pointer rounded-md border transition-colors",
                      choiceClass(bg.mode === "solid" && bg.color.toLowerCase() === s.toLowerCase()),
                    )}
                    style={{ background: s }}
                  />
                ))}
              </div>
            </div>
            <ShuffleRow mode="solid" />
          </div>
        )}

        {bg.mode === "gradient" && (
          <div className="w-full space-y-2.5">
            <GradientControls value={bg.gradient} onChange={(gradient) => setBg({ gradient })} />
            <ShuffleRow mode="gradient" />
          </div>
        )}

        {bg.mode === "image" && (
          <>
            <SectionLabel>BACKGROUND IMAGE</SectionLabel>
            <Button
              variant="primary"
              size="block"
              className="cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-3 w-3" /> Upload background
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept={IMAGE_FILE_TYPES}
              className="hidden"
              onChange={onUploadImage}
              aria-label="Upload background image"
            />
            <ScreenshotButton
              onCapture={async (blob) =>
                setBg({ mode: "image", imageSrc: await fileToDataURL(blob) })
              }
            />
            <StockImages
              onPick={async (blob) =>
                setBg({ mode: "image", imageSrc: await fileToDataURL(blob) })
              }
            />
          </>
        )}

        {bg.mode === "pattern" && <PatternPanel />}
        {bg.mode === "abstract" && <BackdropPanel />}
      </div>

      <Linebreak />

      <Tabs value={tab} onValueChange={setTab} className="space-y-3">
        <TabsList>
          <TabsTrigger value="saved" className="cursor-pointer">
            Saved
          </TabsTrigger>
          <TabsTrigger value="effects" className="cursor-pointer">
            Effects
          </TabsTrigger>
        </TabsList>
        <TabsContent value="saved">
          <SavedBackgrounds />
        </TabsContent>
        <TabsContent value="effects">
          <EffectsControls />
        </TabsContent>
      </Tabs>
    </div>
  );
};
