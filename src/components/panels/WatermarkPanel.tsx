import { useRef } from "react";
import { Lock, Stamp, Upload, X } from "lucide-react";
import { useEditor } from "@/store/editor";
import type { WatermarkSettings } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fileToDataURL } from "@/lib/importers";
import { WATERMARK_OPACITY_MIN, WATERMARK_PLACES, WATERMARK_SIZE } from "@/lib/watermark";
import {
  ColorRow,
  LabeledSlider,
  Linebreak,
  PanelDesc,
  PanelHelp,
  PanelTitle,
  SectionLabel,
  SwitchRow,
} from "./primitives";
import { PlaceGrid } from "./PlaceGrid";

type Own = WatermarkSettings["own"];

const percent = (share: number) => Math.round(share * 100);

/** Layer's badge, and the user's own text or logo watermark. */
export const WatermarkPanel = () => {
  const watermark = useEditor((s) => s.watermark);
  const isPro = useEditor((s) => s.isPro);
  const setBadge = useEditor((s) => s.setBadge);
  const setOwn = useEditor((s) => s.setOwnWatermark);
  const uploads = useEditor((s) => s.uploadedImages);
  const fileRef = useRef<HTMLInputElement>(null);
  const { badge, own } = watermark;

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setOwn({ kind: "logo", logoSrc: await fileToDataURL(file) });
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <PanelTitle>
        <div className="flex items-center gap-1">
          <span>WATERMARK</span> <Stamp className="h-4.5 w-4.5" />
        </div>
      </PanelTitle>
      <PanelDesc>Mark your exports with the Layer badge, your own name or your logo.</PanelDesc>

      <div className="space-y-2.5">
        <SectionLabel>LAYER BADGE</SectionLabel>
        {isPro ? (
          <SwitchRow label="SHOW BADGE" checked={badge.show} onCheckedChange={(show) => setBadge({ show })} />
        ) : (
          <PanelHelp>Free exports always carry the Layer badge. You can move it anywhere.</PanelHelp>
        )}
        {(badge.show || !isPro) && (
          <>
            <PlaceGrid
              compact
              labelPrefix="Badge: "
              chosen={WATERMARK_PLACES.indexOf(badge.place)}
              onPick={(i) => setBadge({ place: WATERMARK_PLACES[i] })}
            />
            {isPro && (
              <>
                <LabeledSlider
                  label="SIZE"
                  unit="%"
                  min={percent(WATERMARK_SIZE.min)}
                  max={percent(WATERMARK_SIZE.max)}
                  value={percent(badge.size)}
                  onChange={(v) => setBadge({ size: v / 100 })}
                />
                <LabeledSlider
                  label="OPACITY"
                  unit="%"
                  min={percent(WATERMARK_OPACITY_MIN)}
                  value={percent(badge.opacity)}
                  onChange={(v) => setBadge({ opacity: v / 100 })}
                />
              </>
            )}
          </>
        )}
        {!isPro && (
          <Button variant="ghost" size="block" disabled title="Pro is coming soon">
            <Lock className="h-3 w-3" /> Hide or resize the badge (PRO)
          </Button>
        )}
      </div>

      <Linebreak />

      <div className="space-y-2.5">
        <SectionLabel>YOUR WATERMARK</SectionLabel>
        <ToggleGroup
          type="single"
          value={own.kind}
          onValueChange={(kind) => kind && setOwn({ kind: kind as Own["kind"] })}
          className="w-full"
        >
          <ToggleGroupItem value="none" className="cursor-pointer">None</ToggleGroupItem>
          <ToggleGroupItem value="text" className="cursor-pointer">Text</ToggleGroupItem>
          <ToggleGroupItem value="logo" className="cursor-pointer">Logo</ToggleGroupItem>
        </ToggleGroup>

        {own.kind === "none" && <PanelHelp>Add your name, handle or logo to every export.</PanelHelp>}

        {own.kind === "text" && (
          <>
            <Input
              aria-label="Watermark text"
              placeholder="@yourname or yoursite.com"
              maxLength={120}
              value={own.text}
              onChange={(e) => setOwn({ text: e.target.value })}
            />
            <ColorRow value={own.color} onChange={(color) => setOwn({ color })} />
          </>
        )}

        {own.kind === "logo" && (
          <>
            {own.logoSrc ? (
              <div className="flex items-center gap-2 rounded-md border border-hairline bg-chrome/40 p-1.5">
                <img src={own.logoSrc} alt="Your logo" className="h-9 w-12 rounded-sm object-contain" />
                <Button variant="ghost" size="sm" className="flex-1 cursor-pointer" onClick={() => fileRef.current?.click()}>
                  Change
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove logo"
                  className="cursor-pointer"
                  onClick={() => setOwn({ logoSrc: null })}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="block" className="cursor-pointer" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3 w-3" /> Upload logo
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/svg+xml,image/webp,image/jpeg"
              className="hidden"
              onChange={onLogo}
              aria-label="Upload a logo for the watermark"
            />
            {uploads.length > 0 && (
              <div className="grid grid-cols-6 gap-1.5">
                {uploads.slice(0, 12).map((upload) => (
                  <button
                    key={upload.id}
                    type="button"
                    aria-label="Use this upload as the logo"
                    onClick={() => setOwn({ logoSrc: upload.src })}
                    className="aspect-square cursor-pointer overflow-hidden rounded-sm border border-hairline transition-colors hover:border-secondary"
                  >
                    <img src={upload.src} alt="" className="size-full object-contain" />
                  </button>
                ))}
              </div>
            )}
            <PanelHelp>A PNG or SVG with a see-through background works best.</PanelHelp>
          </>
        )}

        {own.kind !== "none" && (
          <>
            <SwitchRow
              label="REPEAT"
              description="Across the whole canvas, on a slant."
              checked={own.tiled}
              onCheckedChange={(tiled) => setOwn({ tiled })}
            />
            {!own.tiled && (
              <PlaceGrid
                compact
                labelPrefix="Watermark: "
                chosen={WATERMARK_PLACES.indexOf(own.place)}
                onPick={(i) => setOwn({ place: WATERMARK_PLACES[i] })}
              />
            )}
            <LabeledSlider
              label="SIZE"
              unit="%"
              min={percent(WATERMARK_SIZE.min)}
              max={percent(WATERMARK_SIZE.max)}
              value={percent(own.size)}
              onChange={(v) => setOwn({ size: v / 100 })}
            />
            <LabeledSlider
              label="OPACITY"
              unit="%"
              min={percent(WATERMARK_OPACITY_MIN)}
              value={percent(own.opacity)}
              onChange={(v) => setOwn({ opacity: v / 100 })}
            />
          </>
        )}
      </div>
    </div>
  );
};
