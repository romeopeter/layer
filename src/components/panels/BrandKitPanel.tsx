import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Copy, Plus, Search, Stamp, Star, Trash2, Upload, X } from "lucide-react";
import { useEditor } from "@/store/editor";
import type { BrandColor, BrandKit, BrandLogo, BrandTextStyle, FontWeight } from "@/types/brand";
import { cn } from "@/lib/utils";
import { SYSTEM_FONTS } from "@/lib/constants";
import { fileToDataURL } from "@/lib/importers";
import { hasBrandKitsFile, hasGoogleFonts } from "@/lib/host";
import { backgroundThumb } from "@/lib/background/thumb";
import { brandBackground } from "@/lib/brand/apply";
import {
  DEFAULT_BODY,
  DEFAULT_HEADING,
  MAX_BRAND_COLORS,
  MAX_BRAND_FONTS,
  MAX_BRAND_LOGOS,
  brandId,
  colorName,
  colorOf,
  isLayerFont,
  withFont,
} from "@/lib/brand/kits";
import { isFamilyName } from "@/lib/brand/normalise";
import { isUsableFont } from "@/lib/fonts/registry";
import { WEIGHT_NAMES, familyFromFileName, fontMime, weightFromFileName } from "@/lib/fonts/files";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ColorRow, LabeledSlider, Linebreak, MutedMini, PanelDesc, PanelHelp, SectionLabel, SwitchRow } from "./primitives";
import { choiceClass } from "./choice";
import { GoogleFontPicker } from "./GoogleFontPicker";

/** Logos are kept whole in the kit's file, so very large ones are refused. */
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const useKit = (kit: BrandKit) => {
  const update = useEditor((s) => s.updateBrandKit);
  return (patch: Partial<Omit<BrandKit, "id" | "updatedAt">>) => update(kit.id, patch);
};

/** Moves an item one place along a list. */
const moved = <T,>(list: T[], from: number, by: -1 | 1) => {
  const to = from + by;
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return next;
};

/* ------------------------------------------------------------------------------------------- */

const NoKits = () => {
  const create = useEditor((s) => s.createBrandKit);
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-6 pt-4">
      <PanelDesc>Keep your logos, colors and fonts here, then apply them to any design in one click.</PanelDesc>
      <Button variant="primary" size="block" className="cursor-pointer" onClick={() => create()}>
        <Plus className="h-3.5 w-3.5" /> Create a brand kit
      </Button>
      <PanelHelp>It starts with this design's colors and fonts. Change anything after.</PanelHelp>
    </div>
  );
};

const KitBar = ({ kit }: { kit: BrandKit }) => {
  const kits = useEditor((s) => s.brandKits);
  const setActive = useEditor((s) => s.setActiveBrandKit);
  const create = useEditor((s) => s.createBrandKit);
  const duplicate = useEditor((s) => s.duplicateBrandKit);
  const remove = useEditor((s) => s.deleteBrandKit);
  const set = useKit(kit);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <Select value={kit.id} onValueChange={setActive}>
          <SelectTrigger aria-label="Brand kit" className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kits.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="icon" size="icon" className="cursor-pointer" aria-label="New brand kit" title="New brand kit, from this design" onClick={() => create()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button variant="icon" size="icon" className="cursor-pointer" aria-label="Duplicate this kit" title="Duplicate this kit" onClick={() => duplicate(kit.id)}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Popover open={confirming} onOpenChange={setConfirming}>
          <PopoverTrigger asChild>
            <Button variant="icon" size="icon" className="cursor-pointer" aria-label="Delete this kit" title="Delete this kit">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 space-y-2.5 p-3">
            <PanelDesc>Delete {kit.name}? Its logos, colors and fonts go too. Designs keep what you applied.</PanelDesc>
            <div className="flex justify-end gap-1.5">
              <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="cursor-pointer"
                onClick={() => {
                  setConfirming(false);
                  remove(kit.id);
                }}
              >
                Delete kit
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <Input
        aria-label="Brand name"
        maxLength={60}
        value={kit.name}
        onChange={(e) => set({ name: e.target.value })}
        onBlur={(e) => !e.target.value.trim() && set({ name: "Brand" })}
      />
    </div>
  );
};

/** What Apply brand gives this design: its background, type and main logo. */
const ApplyBrand = ({ kit }: { kit: BrandKit }) => {
  const apply = useEditor((s) => s.applyBrand);
  const background = useEditor((s) => s.background);
  const customPairs = useEditor((s) => s.customPatternPairs);
  const hasContent = useEditor((s) => s.elements.length > 0);
  const preview = useMemo(() => brandBackground(kit, background), [kit, background]);
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void backgroundThumb(preview, customPairs).then((url) => current && setThumb(url));
    return () => {
      current = false;
    };
  }, [preview, customPairs]);

  const logo = kit.logos[0];
  const textColor = (style: BrandTextStyle) => colorOf(kit, style.colorId) ?? undefined;

  return (
    <div className="space-y-2">
      <div
        aria-hidden
        className="relative flex aspect-[16/9] w-full flex-col justify-end gap-0.5 overflow-hidden rounded-md border border-hairline bg-chrome bg-cover bg-center p-3"
        style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}
      >
        {logo && <img src={logo.src} alt="" className="absolute right-2.5 top-2.5 h-6 max-w-[40%] object-contain" />}
        <span
          className="text-[22px] leading-none text-text"
          style={{
            fontFamily: kit.heading.family,
            fontWeight: kit.heading.weight,
            letterSpacing: kit.heading.letterSpacing / 4,
            color: textColor(kit.heading),
          }}
        >
          Aa
        </span>
        <span
          className="text-[10.5px] text-text-muted"
          style={{ fontFamily: kit.body.family, fontWeight: kit.body.weight, color: textColor(kit.body) }}
        >
          Your body text
        </span>
      </div>
      <Button variant="primary" size="block" className="cursor-pointer" onClick={() => apply(kit.id)}>
        Apply brand
      </Button>
      <PanelHelp>
        {hasContent
          ? "Sets the background, text, images and watermark in your brand. Undo brings back what was there."
          : "Sets the background and watermark now. Apply it again once you've added text and images."}
      </PanelHelp>
    </div>
  );
};

/* ------------------------------------------------------------------------------------------- */

const LogoTile = ({ kit, logo, index }: { kit: BrandKit; logo: BrandLogo; index: number }) => {
  const addLogo = useEditor((s) => s.addLogo);
  const setOwn = useEditor((s) => s.setOwnWatermark);
  const set = useKit(kit);

  const place = async () => {
    const picture = new Image();
    picture.src = logo.src;
    await picture.decode().catch(() => undefined);
    // An SVG with no size of its own is drawn square.
    addLogo(logo.src, picture.naturalWidth || 512, picture.naturalHeight || 512);
  };

  const action = "flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-hairline bg-chrome text-text-muted hover:text-text";
  return (
    <div className="group relative flex min-w-0 flex-col gap-1">
      <button
        type="button"
        aria-label={`Add ${logo.name} to the canvas`}
        title="Add to the canvas"
        onClick={() => void place()}
        className={cn("flex aspect-square w-full cursor-pointer items-center justify-center rounded-md border bg-chrome/50 p-2", choiceClass(false))}
      >
        <img src={logo.src} alt="" className="max-h-full max-w-full object-contain" />
      </button>
      <span className="flex items-center gap-1 truncate text-[10px] text-text-muted">
        {index === 0 && <Star className="h-2.5 w-2.5 shrink-0 fill-current text-t-400" aria-label="Main logo" />}
        <span className="truncate">{logo.name}</span>
      </span>
      <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex group-focus-within:flex">
        <button type="button" aria-label={`Use ${logo.name} as your watermark`} title="Use as your watermark" className={action} onClick={() => setOwn({ kind: "logo", logoSrc: logo.src })}>
          <Stamp className="h-2.5 w-2.5" />
        </button>
        {index > 0 && (
          <button
            type="button"
            aria-label={`Make ${logo.name} the main logo`}
            title="Make it the main logo"
            className={action}
            onClick={() => set({ logos: [logo, ...kit.logos.filter((other) => other.id !== logo.id)] })}
          >
            <Star className="h-2.5 w-2.5" />
          </button>
        )}
        <button
          type="button"
          aria-label={`Delete ${logo.name}`}
          title="Delete"
          className={action}
          onClick={() => set({ logos: kit.logos.filter((other) => other.id !== logo.id) })}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
};

const Logos = ({ kit }: { kit: BrandKit }) => {
  const set = useKit(kit);
  const fileRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const room = MAX_BRAND_LOGOS - kit.logos.length;

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    const pictures = files.filter((file) => file.type.startsWith("image/"));
    const fitting = pictures.filter((file) => file.size <= MAX_LOGO_BYTES).slice(0, room);
    setProblem(
      fitting.length < pictures.length
        ? pictures.some((file) => file.size > MAX_LOGO_BYTES)
          ? "A logo can be up to 5 MB. Larger ones weren't added."
          : `A kit holds up to ${MAX_BRAND_LOGOS} logos.`
        : null,
    );
    const added: BrandLogo[] = await Promise.all(
      fitting.map(async (file) => ({
        id: brandId("bl"),
        name: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Logo",
        src: await fileToDataURL(file),
      })),
    );
    // Reading the files took a moment: add to the logos as they are now.
    const latest = useEditor.getState().brandKits.find((entry) => entry.id === kit.id)?.logos ?? kit.logos;
    if (added.length > 0) set({ logos: [...latest, ...added] });
  };

  return (
    <div className="space-y-2">
      <SectionLabel right={<MutedMini>{`${kit.logos.length} OF ${MAX_BRAND_LOGOS}`}</MutedMini>}>LOGOS</SectionLabel>
      {kit.logos.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {kit.logos.map((logo, i) => (
            <LogoTile key={logo.id} kit={kit} logo={logo} index={i} />
          ))}
        </div>
      )}
      {room > 0 && (
        <Button variant="outline" size="block" className="cursor-pointer" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3 w-3" /> Upload a logo
        </Button>
      )}
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/png,image/svg+xml,image/webp,image/jpeg"
        className="hidden"
        onChange={(e) => void onFiles(e)}
        aria-label="Upload logos to the brand kit"
      />
      {problem && <PanelHelp className="text-a-200">{problem}</PanelHelp>}
      <PanelHelp>
        {kit.logos.length > 0
          ? "Click a logo to put it on the canvas. The starred one is your watermark when you apply the brand."
          : "A PNG or SVG with a see-through background works best."}
      </PanelHelp>
    </div>
  );
};

/* ------------------------------------------------------------------------------------------- */

const HEX = /^#?([0-9a-f]{6})$/i;

const ColorEditor = ({ kit, color, index }: { kit: BrandKit; color: BrandColor; index: number }) => {
  const set = useKit(kit);
  // What's being typed, until it's a whole hex code; otherwise the colour's own.
  const [draft, setDraft] = useState<string | null>(null);

  const change = (patch: Partial<BrandColor>) =>
    set({ colors: kit.colors.map((other) => (other.id === color.id ? { ...other, ...patch } : other)) });
  const typed = (value: string) => {
    setDraft(value);
    const match = HEX.exec(value.trim());
    if (match) change({ hex: `#${match[1].toUpperCase()}` });
  };

  return (
    <div className="space-y-2">
      <Input aria-label="Color name" maxLength={40} value={color.name} onChange={(e) => change({ name: e.target.value })} />
      <ColorRow value={color.hex} onChange={(value) => change({ hex: value.toUpperCase() })} brandSwatches={false} />
      <Input aria-label="Hex code" className="font-mono" value={draft ?? color.hex} onChange={(e) => typed(e.target.value)} onBlur={() => setDraft(null)} />
      <div className="flex items-center gap-1">
        <Button variant="icon" size="icon" className="cursor-pointer" aria-label="Move earlier" title="Move earlier" disabled={index === 0} onClick={() => set({ colors: moved(kit.colors, index, -1) })}>
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <Button variant="icon" size="icon" className="cursor-pointer" aria-label="Move later" title="Move later" disabled={index === kit.colors.length - 1} onClick={() => set({ colors: moved(kit.colors, index, 1) })}>
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer"
          onClick={() =>
            set({
              colors: kit.colors.filter((other) => other.id !== color.id),
              // Text set in this color keeps its own instead.
              heading: kit.heading.colorId === color.id ? { ...kit.heading, colorId: null } : kit.heading,
              body: kit.body.colorId === color.id ? { ...kit.body, colorId: null } : kit.body,
            })
          }
        >
          <Trash2 className="h-3 w-3" /> Delete
        </Button>
      </div>
    </div>
  );
};

const Colors = ({ kit }: { kit: BrandKit }) => {
  const set = useKit(kit);
  const [open, setOpen] = useState<string | null>(null);

  const add = () => {
    const color: BrandColor = { id: brandId("bc"), name: colorName(kit.colors.length), hex: "#FFFFFF" };
    set({ colors: [...kit.colors, color] });
    setOpen(color.id);
  };

  return (
    <div className="space-y-2">
      <SectionLabel right={<MutedMini>{`${kit.colors.length} OF ${MAX_BRAND_COLORS}`}</MutedMini>}>COLORS</SectionLabel>
      <div className="grid grid-cols-4 gap-1.5">
        {kit.colors.map((color, i) => (
          <Popover key={color.id} open={open === color.id} onOpenChange={(next) => setOpen(next ? color.id : null)}>
            <div className="flex min-w-0 flex-col gap-1">
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`Edit ${color.name}, ${color.hex}`}
                  className={cn("h-9 w-full cursor-pointer rounded-md border", choiceClass(open === color.id))}
                  style={{ background: color.hex }}
                />
              </PopoverTrigger>
              <span className="truncate text-[10px] text-text-muted">{color.name}</span>
            </div>
            <PopoverContent align="start" className="w-60 p-3">
              <ColorEditor kit={kit} color={color} index={i} />
            </PopoverContent>
          </Popover>
        ))}
        {kit.colors.length < MAX_BRAND_COLORS && (
          <button
            type="button"
            aria-label="Add a color"
            onClick={add}
            className="flex h-9 cursor-pointer items-center justify-center rounded-md border border-dashed border-hairline-strong text-text-muted transition-colors hover:border-secondary hover:text-text"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <PanelHelp>The first is your main color and the second your second. They show in every color picker.</PanelHelp>
    </div>
  );
};

/* ------------------------------------------------------------------------------------------- */

const WeightToggle = ({ value, onChange, label }: { value: FontWeight; onChange: (weight: FontWeight) => void; label: string }) => (
  <ToggleGroup
    type="single"
    aria-label={label}
    value={String(value)}
    onValueChange={(v) => v && onChange(Number(v) as FontWeight)}
    className="w-full"
  >
    {([400, 500, 700] as const).map((weight) => (
      <ToggleGroupItem key={weight} value={String(weight)} className="cursor-pointer">
        {WEIGHT_NAMES[weight]}
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
);

/** Fonts are kept whole in the kit's file. */
const MAX_FONT_BYTES = 10 * 1024 * 1024;

interface PendingFont {
  src: string;
  family: string;
  weight: FontWeight;
}

/** Choose a font file, check it's one, then name it and say which weight it is. */
const FontUpload = ({ kit }: { kit: BrandKit }) => {
  const set = useKit(kit);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingFont | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const mime = fontMime(file.name);
    if (!mime) return setProblem("Choose a .woff2, .woff, .ttf or .otf file.");
    if (file.size > MAX_FONT_BYTES) return setProblem("A font file can be up to 10 MB.");
    const src = await fileToDataURL(new Blob([file], { type: mime }));
    if (!(await isUsableFont(src))) return setProblem("That file isn't a font Layer can use, or it's damaged.");
    setProblem(null);
    setPending({ src, family: familyFromFileName(file.name), weight: weightFromFileName(file.name) });
  };

  const name = pending?.family.trim() ?? "";
  const nameProblem = !pending
    ? null
    : !isFamilyName(name)
      ? "Use letters, numbers, spaces and hyphens."
      : isLayerFont(name)
        ? "Layer already has a font by that name."
        : null;

  const add = () => {
    if (!pending || nameProblem) return;
    set({ fonts: withFont(kit, { family: name, source: "upload", files: [{ weight: pending.weight, src: pending.src }] }) });
    setPending(null);
  };

  return (
    <div className="space-y-2">
      {pending ? (
        <div className="space-y-2 rounded-md border border-hairline bg-chrome/40 p-2">
          <Input
            aria-label="Font name"
            maxLength={64}
            value={pending.family}
            onChange={(e) => setPending({ ...pending, family: e.target.value })}
          />
          <WeightToggle label="Font file's weight" value={pending.weight} onChange={(weight) => setPending({ ...pending, weight })} />
          {nameProblem && <PanelHelp className="text-a-200">{nameProblem}</PanelHelp>}
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" className="cursor-pointer" disabled={!!nameProblem} onClick={add}>
              Add font
            </Button>
          </div>
        </div>
      ) : (
        kit.fonts.length < MAX_BRAND_FONTS && (
          <Button variant="outline" size="block" className="cursor-pointer" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3 w-3" /> Upload a font
          </Button>
        )
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".woff2,.woff,.ttf,.otf"
        className="hidden"
        onChange={(e) => void onFile(e)}
        aria-label="Upload a font file to the brand kit"
      />
      {problem && <PanelHelp className="text-a-200">{problem}</PanelHelp>}
    </div>
  );
};

const Fonts = ({ kit }: { kit: BrandKit }) => {
  const set = useKit(kit);
  const [googleOpen, setGoogleOpen] = useState(false);
  const remove = (family: string) =>
    set({
      fonts: kit.fonts.filter((font) => font.family !== family),
      // Text styles set in it go back to Layer's own.
      heading: kit.heading.family === family ? { ...kit.heading, family: DEFAULT_HEADING.family } : kit.heading,
      body: kit.body.family === family ? { ...kit.body, family: DEFAULT_BODY.family } : kit.body,
    });

  return (
    <div className="space-y-2">
      <SectionLabel right={<MutedMini>{`${kit.fonts.length} OF ${MAX_BRAND_FONTS}`}</MutedMini>}>FONTS</SectionLabel>
      {kit.fonts.map((font) => (
        <div key={font.family} className="flex items-center gap-2 rounded-md border border-hairline bg-chrome/40 px-2.5 py-1.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] text-text" style={{ fontFamily: font.family }}>
              {font.family}
            </div>
            <div className="truncate text-[10px] text-text-muted">
              {[...font.files]
                .sort((a, b) => a.weight - b.weight)
                .map((file) => WEIGHT_NAMES[file.weight])
                .join(", ")}
              {font.source === "google" ? " · Google Fonts" : " · Uploaded"}
            </div>
          </div>
          <Button variant="icon" size="iconSm" className="cursor-pointer" aria-label={`Delete ${font.family}`} title="Delete" onClick={() => remove(font.family)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      {kit.fonts.length < MAX_BRAND_FONTS &&
        (hasGoogleFonts ? (
          <Button variant="outline" size="block" className="cursor-pointer" onClick={() => setGoogleOpen(true)}>
            <Search className="h-3 w-3" /> Add from Google Fonts
          </Button>
        ) : (
          <PanelHelp>Google Fonts are in the desktop app. You can upload font files here.</PanelHelp>
        ))}
      <FontUpload kit={kit} />
      <PanelHelp>Only upload fonts you're licensed to use. They're saved in projects that use them.</PanelHelp>
      <GoogleFontPicker kit={kit} open={googleOpen} onOpenChange={setGoogleOpen} />
    </div>
  );
};

const KEEP = "keep";

const TextStyleRow = ({ kit, title, which }: { kit: BrandKit; title: string; which: "heading" | "body" }) => {
  const set = useKit(kit);
  const style = kit[which];
  const change = (patch: Partial<BrandTextStyle>) =>
    set(which === "heading" ? { heading: { ...style, ...patch } } : { body: { ...style, ...patch } });
  const families = [...new Set([...kit.fonts.map((font) => font.family), ...SYSTEM_FONTS])];

  return (
    <div className="space-y-2">
      <SectionLabel>{title}</SectionLabel>
      <Select value={style.family} onValueChange={(family) => change({ family })}>
        <SelectTrigger aria-label={`${title.toLowerCase()} font`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {families.map((family) => (
            <SelectItem key={family} value={family}>
              <span style={{ fontFamily: family }}>{family}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <WeightToggle label={`${title.toLowerCase()} weight`} value={style.weight} onChange={(weight) => change({ weight })} />
      <Select value={style.colorId ?? KEEP} onValueChange={(v) => change({ colorId: v === KEEP ? null : v })}>
        <SelectTrigger aria-label={`${title.toLowerCase()} color`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={KEEP}>Keep each text's color</SelectItem>
          {kit.colors.map((color) => (
            <SelectItem key={color.id} value={color.id}>
              <span className="flex items-center gap-2">
                <span aria-hidden className="h-3 w-3 rounded-sm border border-hairline" style={{ background: color.hex }} />
                {color.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <LabeledSlider
        label="LETTER SPACING"
        min={-10}
        max={20}
        value={style.letterSpacing}
        onChange={(letterSpacing) => change({ letterSpacing })}
      />
    </div>
  );
};

const Section = ({ children }: { children: ReactNode }) => (
  <>
    <Linebreak />
    {children}
  </>
);

/** Brand › Brand kit: the active kit's logos, colours, fonts and image style, and Apply brand. */
export const BrandKitPanel = () => {
  const kit = useEditor((s) => s.brandKits.find((entry) => entry.id === s.activeBrandKitId) ?? null);
  if (!kit) return <NoKits />;
  return (
    <BrandKitView kit={kit} />
  );
};

const BrandKitView = ({ kit }: { kit: BrandKit }) => {
  const set = useKit(kit);
  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      <KitBar kit={kit} />
      <ApplyBrand kit={kit} />
      <Section>
        <Logos kit={kit} />
      </Section>
      <Section>
        <Colors kit={kit} />
      </Section>
      <Section>
        <Fonts kit={kit} />
        <TextStyleRow kit={kit} title="HEADING" which="heading" />
        <TextStyleRow kit={kit} title="BODY" which="body" />
      </Section>
      <Section>
        <div className="space-y-2">
          <SectionLabel>IMAGES</SectionLabel>
          <LabeledSlider
            label="CORNERS"
            unit="%"
            max={25}
            value={Math.round(kit.images.cornerShare * 100)}
            onChange={(v) => set({ images: { ...kit.images, cornerShare: v / 100 } })}
          />
          <SwitchRow
            label="SHADOW"
            checked={kit.images.shadow}
            onCheckedChange={(shadow) => set({ images: { ...kit.images, shadow } })}
          />
        </div>
      </Section>
      {!hasBrandKitsFile && <PanelHelp>In the browser, brand kits last until you close Layer.</PanelHelp>}
    </div>
  );
};
