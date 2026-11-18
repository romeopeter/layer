import { create } from "zustand";
import type {
  BackgroundEffects,
  BackgroundState,
  SavedBackground,
  WatermarkSettings,
  CanvasSize,
  DeviceFrame,
  GridState,
  ImageElement,
  LayerElement,
  LayerProject,
  MarkCategory,
  MarkTool,
  ShapeElement,
  ShapeKind,
  TextElement,
  UploadedImage,
  CanvasLayout,
  LayoutId,
} from "../types";
import type { PatternColorPair, PatternConfig } from "../types/pattern";
import { DEFAULT_PATTERN_CONFIG } from "../types/pattern";
import { withCarriedColors } from "../lib/patterns/resolveColorPair";
import type { BackdropLook } from "../types/backdrop";
import type { BrandKit, BrandKitsFile } from "../types/brand";
import type { DesignMotion, ElementMotion, EnterMove, ZoomSpot } from "../types/motion";
import type { Preferences } from "../types/preferences";
import type { UpdateState } from "../lib/updates";
import { DEFAULT_PREFERENCES, normalisePreferences } from "../lib/preferences";
import { DEFAULT_BACKDROP } from "../lib/backdrops/presets";
import { NO_EFFECTS } from "../lib/background/effects";
import { DEFAULT_GRADIENT, normaliseBackground } from "../lib/background/normalise";
import {
  applyLook,
  isShuffleMode,
  lookOfBackground,
  sameLook,
  shuffledLookFor,
  type BackgroundLook,
  type ShuffleMode,
} from "../lib/background/looks";
import {
  hasBrandKitsFile,
  storeBrandKits,
  storePatternColors,
  storePreferences,
  storeSavedBackgrounds,
} from "../lib/host";
import { packBrandKits } from "../lib/brand/storage";
import { DEFAULT_WATERMARK, marginOf, normaliseWatermark } from "../lib/watermark";
import { brandId, kitFromDesign, nextKitName } from "../lib/brand/kits";
import { brandPatch } from "../lib/brand/apply";
import { isLayerFont } from "../lib/brand/kits";
import { normaliseProjectFonts } from "../lib/brand/normalise";
import { fontFilesFor, registerFonts, setFontLoadedListener } from "../lib/fonts/registry";
import { inLook, lookBackground, type DesignLook } from "../lib/looks";
import { migrateElement, nextNumber } from "../lib/marks";
import { placeFrame } from "../lib/mockups";
import { DEFAULT_MARK_STYLES, shapeDefaults } from "../lib/markTools";
import {
  arrangeLayout,
  fittedCanvas,
  newLayout,
  normaliseLayout,
  settleLayout,
  withoutLayoutCrop,
} from "../lib/layouts";
import {
  DEFAULT_ELEMENT_MOTION,
  DEFAULT_MOTION,
  MAX_SPOTS,
  MAX_SPOT_ZOOM,
  MIN_SPOT_ZOOM,
  normaliseElementMotion,
  normaliseMotion,
} from "../lib/motion/normalise";
import { createHistory } from "./history";

/* ------------------------------------------------------- */

const uid = () => "el_" + Math.random().toString(36).slice(2, 9);

const DEFAULT_CANVAS: CanvasSize = {
  label: "Wide HD",
  width: 2400,
  height: 1350,
};

export const DEFAULT_BACKGROUND: BackgroundState = {
  mode: "gradient",
  color: "#1A1826",
  gradient: DEFAULT_GRADIENT,
  imageSrc: null,
  pattern: DEFAULT_PATTERN_CONFIG,
  backdrop: DEFAULT_BACKDROP,
  effects: NO_EFFECTS,
};

/** How many looks Back can return to, for each type. */
const TRAIL_MAX = 50;

/** How many backgrounds can be saved. Image backgrounds are large. */
export const SAVED_MAX = 24;

/** Shuffled and preset looks seen this session, for one background type. */
interface LookTrail {
  looks: BackgroundLook[];
  at: number;
}

/** A saved background is one entry however many times it's saved. */
const sameBackground = (a: BackgroundState, b: BackgroundState) => JSON.stringify(a) === JSON.stringify(b);

export const ZOOM_MIN = 20;
/**
 * 100% is fit-to-viewport, not 1:1 pixels — `CanvasStage` multiplies zoom by a
 * fit factor that is itself capped at 1. Capping here means the artboard is
 * never magnified past the size it lays out at.
 */
export const ZOOM_MAX = 100;

export const GRID_MIN_SIZE = 8;
export const GRID_MAX_SIZE = 400;

const DEFAULT_GRID: GridState = {
  enabled: false,
  size: 100,
  opacity: 0.45,
};

/**
 * What the left panel shows. Each belongs to a rail group (see `railTools.tsx`):
 * Add, Templates, Design, Brand or Animate. A selected object's settings are in
 * the Properties panel instead, whatever this is.
 */
type Tool =
  | "uploads"
  | "templates"
  | "images"
  | "annotation"
  | "background"
  | "mockup"
  | "layout"
  | "layers"
  | "header"
  | "watermark"
  | "brands"
  | "motion"
  | "customize";

interface EditorState {
  canvas: CanvasSize;
  background: BackgroundState;
  elements: LayerElement[];
  uploadedImages: UploadedImage[];
  customPatternPairs: PatternColorPair[];
  selectedIds: string[];
  /** Null means images are placed by hand. */
  layout: CanvasLayout | null;
  /** How the whole design is animated. Each object's own moves are on the object. */
  motion: DesignMotion;
  /** Transient: the canvas shows a moment of the animation and can't be edited. See `playback.ts`. */
  previewing: boolean;

  activeTool: Tool;
  /** Whether the left panel is showing. Clicking the active rail group hides it. */
  leftPanelOpen: boolean;
  /** Which Properties sections are open, by section id. Lasts the session. */
  openSections: Record<string, boolean>;
  zoom: number;
  grid: GridState;
  /** Smart guides + snapping while dragging. A view aid, like `grid`. */
  snapEnabled: boolean;
  watermark: WatermarkSettings;
  /** Transient: true while a pattern slider is held. Not part of the project. */
  patternDragging: boolean;
  /**
   * Transient: looks seen this session, for Back and Forward, by background type.
   * Not part of the project or of undo: it's a list to choose from, not a change.
   */
  lookTrails: Partial<Record<ShuffleMode, LookTrail>>;
  /** Backgrounds kept to use again in any project. Not part of the project. */
  savedBackgrounds: SavedBackground[];
  /** Brands' logos, colours and fonts, for any project. Not part of the project or of undo. */
  brandKits: BrandKit[];
  /** The kit the rest of the editor offers: its colours in pickers, its fonts first. */
  activeBrandKitId: string | null;
  /** Transient: goes up when a font finishes loading, so text set in it is measured again. */
  fontsVersion: number;
  /** How the user likes Layer set up, from Customize. Not part of the project or of undo. */
  preferences: Preferences;
  /** Transient: Layer's own update, as far as it's got. See `lib/updates.ts`. */
  update: UpdateState;
  /** Transient: what a canvas drag creates. Null means it selects and moves. */
  markTool: MarkTool | null;
  /** Style for the next mark, by category. Lasts the session, not the project. */
  markStyles: Record<MarkCategory, Partial<ShapeElement>>;
  /** Transient: the element whose text is open for typing on the canvas. */
  editingId: string | null;
  /** Transient: the image open for cropping. */
  cropId: string | null;
  canUndo: boolean;
  canRedo: boolean;

  // tool / UI
  setActiveTool: (t: Tool) => void;
  setLeftPanelOpen: (open: boolean) => void;
  setSectionOpen: (id: string, open: boolean) => void;
  /** Dresses the whole design in a look, as one undo step. */
  applyLook: (look: DesignLook) => void;
  setZoom: (z: number) => void;
  setGrid: (g: Partial<GridState>) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  setCanvas: (c: CanvasSize) => void;
  setBackground: (b: Partial<BackgroundState>) => void;
  setPattern: (p: Partial<PatternConfig>) => void;
  setPatternDragging: (v: boolean) => void;
  /** Changes the abstract background. */
  setBackdrop: (patch: Partial<BackdropLook>) => void;
  /** Changes the effects on the background, whichever type it is. */
  setEffects: (patch: Partial<BackgroundEffects>) => void;
  /** Shows a new look for a type, from Shuffle or a preset, and adds it to that type's trail. */
  showLook: (mode: ShuffleMode, look?: BackgroundLook) => void;
  /** Moves back or forward along a type's trail. Effects and other settings stay as they are. */
  stepLook: (mode: ShuffleMode, by: -1 | 1) => void;
  /** Keeps the current background to use again. */
  saveBackground: () => void;
  useSavedBackground: (id: string) => void;
  deleteSavedBackground: (id: string) => void;
  /** Fills the list from the saved file, at launch. */
  setSavedBackgrounds: (list: SavedBackground[]) => void;
  /** Fills the kits from the saved file, at launch, keeping any made since. */
  setBrandKits: (file: BrandKitsFile) => void;
  /** Starts a kit from the open design, and makes it the active one. */
  createBrandKit: () => string;
  duplicateBrandKit: (id: string) => void;
  updateBrandKit: (id: string, patch: Partial<Omit<BrandKit, "id" | "updatedAt">>) => void;
  deleteBrandKit: (id: string) => void;
  setActiveBrandKit: (id: string) => void;
  /** Puts the whole design in a brand, as one undo step. */
  applyBrand: (id: string) => void;
  /** Changes how Layer is set up, and keeps it for next time. */
  setPreferences: (patch: Partial<Preferences>) => void;
  /** Fills the preferences from their file, at launch. */
  loadPreferences: (file: unknown) => void;
  /** Changes Layer's badge. */
  setBadge: (patch: Partial<WatermarkSettings["badge"]>) => void;
  /** Changes the user's own watermark. */
  setOwnWatermark: (patch: Partial<WatermarkSettings["own"]>) => void;
  setMarkTool: (tool: MarkTool | null) => void;
  setMarkStyle: (category: MarkCategory, patch: Partial<ShapeElement>) => void;
  setEditingId: (id: string | null) => void;
  setCropId: (id: string | null) => void;
  /** Changes how the whole design is animated. */
  setMotion: (patch: Partial<DesignMotion>) => void;
  /** Adds a zoom spot framing the selected object, or the middle. Returns its id. */
  addZoomSpot: () => string | null;
  updateZoomSpot: (id: string, patch: Partial<Omit<ZoomSpot, "id">>) => void;
  removeZoomSpot: (id: string) => void;
  /** Changes one object's own moves. */
  setElementMotion: (id: string, patch: Partial<ElementMotion>) => void;
  /** Gives these objects the same way in, one after another in stacking order, as one undo step. */
  bringInOneByOne: (ids: string[], enter: EnterMove) => void;
  /** Takes every object's own moves off, as one undo step. */
  clearElementMotion: () => void;
  undo: () => void;
  redo: () => void;

  // pattern colour pairs the user made: pattern-colors.json on the desktop, the session on the web
  addCustomPatternPair: (base: string, accent: string, label?: string) => string;
  deleteCustomPatternPair: (id: string) => void;
  /** Fills the pairs from their file, at launch, keeping any made since. */
  setCustomPatternPairs: (pairs: PatternColorPair[]) => void;

  // elements
  addImage: (src: string, naturalWidth: number, naturalHeight: number) => string;
  /** A logo: small, at the top left, with no corners or shadow, and outside any layout. */
  addLogo: (src: string, naturalWidth: number, naturalHeight: number) => string;
  /** Records a picture's size once loaded, for images saved without it. Not an edit. */
  setNaturalSize: (id: string, width: number, height: number) => void;
  /** Records that a picture is an animated GIF, once it's decoded, or that it isn't. Not an edit. */
  setGifInfo: (id: string, gif: ImageElement["gif"]) => void;
  setLayout: (id: LayoutId | null) => void;
  updateLayout: (patch: Partial<CanvasLayout>) => void;
  setSlotFocus: (index: number, focus: { x: number; y: number }) => void;
  swapSlots: (a: number, b: number) => void;
  /** Adds an image into this slot, replacing what's there. */
  fillSlot: (index: number, src: string, width: number, height: number) => string;
  fitCanvasToLayout: () => void;
  /** Gives the layout's other images this one's shadow, corners, border and frame. */
  matchLayoutStyle: (sourceId: string) => void;
  addUploadedImage: (src: string, naturalWidth: number, naturalHeight: number) => string;
  deleteUploadedImage: (id: string) => void;
  addText: (variant: "heading" | "body", overrides?: Partial<TextElement>) => string;
  addShape: (shape: ShapeKind, overrides?: Partial<ShapeElement>) => string;
  updateElement: (id: string, patch: Partial<LayerElement>) => void;
  /** Puts an image on a device, or takes it off, and gives it the right shape. */
  setDeviceFrame: (id: string, frame: DeviceFrame | null) => void;
  /** Records a measured height, which isn't an edit and shouldn't be undoable. */
  measureElement: (id: string, height: number) => void;
  duplicateElement: (id: string) => void;
  deleteElement: (id: string) => void;
  selectElement: (id: string | null, additive?: boolean) => void;
  moveElement: (id: string, dz: 1 | -1) => void;
  /** Moves an element into another's place in the stacking order. */
  reorderElement: (id: string, targetId: string) => void;

  // project I/O
  loadProject: (project: LayerProject) => void;
  toProject: () => LayerProject;
  resetProject: () => void;
}

const FIT_PASSES = 8;

/** A background whose pattern names one of this install's custom pairs, with its colours written in. */
const carryPatternColors = (background: BackgroundState): BackgroundState => {
  const pattern = withCarriedColors(background.pattern, useEditor.getState().customPatternPairs);
  return pattern === background.pattern ? background : { ...background, pattern };
};

/** Seconds between objects brought in one by one. */
const STAGGER = 0.2;

/** The object with no moves of its own. */
const withoutMotion = (el: LayerElement): LayerElement => {
  if (!el.motion) return el;
  const copy = { ...el };
  delete copy.motion;
  return copy;
};

/** An object's moves from a file, checked, or none. */
const withNormalMotion = (el: LayerElement): LayerElement => {
  const motion = normaliseElementMotion(el.motion);
  return motion ? { ...el, motion } : withoutMotion(el);
};

export const useEditor = create<EditorState>((set, get) => ({
  canvas: DEFAULT_CANVAS,
  background: DEFAULT_BACKGROUND,
  elements: [],
  uploadedImages: [],
  customPatternPairs: [],
  selectedIds: [],
  layout: null,
  motion: DEFAULT_MOTION,
  previewing: false,

  activeTool: "images",
  leftPanelOpen: true,
  openSections: {},
  zoom: 100,
  grid: DEFAULT_GRID,
  // On by default: this is the behaviour people expect from an editor, and it
  // is unobtrusive because guides only appear when something actually lines up.
  snapEnabled: true,
  watermark: DEFAULT_WATERMARK,
  patternDragging: false,
  lookTrails: {},
  savedBackgrounds: [],
  brandKits: [],
  activeBrandKitId: null,
  fontsVersion: 0,
  preferences: DEFAULT_PREFERENCES,
  update: { status: "idle", open: false },
  markTool: null,
  markStyles: DEFAULT_MARK_STYLES,
  editingId: null,
  cropId: null,
  canUndo: false,
  canRedo: false,

  setActiveTool: (t) =>
    set({ activeTool: t, leftPanelOpen: true, markTool: null, editingId: null, cropId: null }),

  setLeftPanelOpen: (open) => set({ leftPanelOpen: open }),

  setSectionOpen: (id, open) => set({ openSections: { ...get().openSections, [id]: open } }),

  applyLook: (look) => {
    const { background, elements } = get();
    set({ background: lookBackground(look, background), elements: elements.map((el) => inLook(look, el)) });
  },
  setZoom: (z) => set({ zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z))) }),

  setGrid: (g) => {
    const next = { ...get().grid, ...g };
    // Clamped here rather than at the slider so any caller — hotkey, future
    // panel, restored preference — lands in a renderable range.
    next.size = Math.max(GRID_MIN_SIZE, Math.min(GRID_MAX_SIZE, Math.round(next.size)));
    next.opacity = Math.max(0, Math.min(1, next.opacity));
    set({ grid: next });
  },

  toggleGrid: () => set({ grid: { ...get().grid, enabled: !get().grid.enabled } }),

  toggleSnap: () => set({ snapEnabled: !get().snapEnabled }),
  setCanvas: (c) => set({ canvas: c }),
  setBackground: (b) => {
    const { background, lookTrails } = get();
    const next = { ...background, ...b };
    // A look changed by hand replaces the one Back and Forward are on.
    const mode = next.mode;
    const trail = isShuffleMode(mode) ? lookTrails[mode] : undefined;
    const changed =
      isShuffleMode(mode) && trail && !sameLook(lookOfBackground(background, mode), lookOfBackground(next, mode));
    set({
      background: next,
      ...(changed && trail
        ? {
            lookTrails: {
              ...lookTrails,
              [mode]: { ...trail, looks: trail.looks.map((look, i) => (i === trail.at ? lookOfBackground(next, mode) : look)) },
            },
          }
        : {}),
    });
  },

  setPattern: (p) => {
    const background = get().background;
    get().setBackground({ pattern: { ...background.pattern, ...p } });
  },

  setPatternDragging: (v) => set({ patternDragging: v }),

  setBackdrop: (patch) => {
    const { background } = get();
    get().setBackground({ mode: "abstract", backdrop: { ...background.backdrop, ...patch } });
  },

  setEffects: (patch) => {
    const { background } = get();
    get().setBackground({ effects: { ...background.effects, ...patch } });
  },

  showLook: (mode, look) => {
    const { background, lookTrails } = get();
    const current = lookOfBackground(background, mode);
    const next = look ?? shuffledLookFor(background, mode);
    const trail = lookTrails[mode];
    // Where you started is the first stop, so Back can always return to it.
    const kept = trail ? trail.looks.slice(0, trail.at + 1) : [current];
    const looks = [...kept, next].slice(-TRAIL_MAX);
    set({
      background: { ...background, ...applyLook(background, next) },
      lookTrails: { ...lookTrails, [mode]: { looks, at: looks.length - 1 } },
    });
  },

  stepLook: (mode, by) => {
    const { background, lookTrails } = get();
    const trail = lookTrails[mode];
    const look = trail?.looks[trail.at + by];
    if (!trail || !look) return;
    set({
      background: { ...background, ...applyLook(background, look) },
      lookTrails: { ...lookTrails, [mode]: { ...trail, at: trail.at + by } },
    });
  },

  saveBackground: () => {
    const { background, savedBackgrounds } = get();
    const others = savedBackgrounds.filter((saved) => !sameBackground(saved.background, background));
    const next = [{ id: "bg_" + Math.random().toString(36).slice(2, 9), background }, ...others].slice(0, SAVED_MAX);
    set({ savedBackgrounds: next });
    void storeSavedBackgrounds(next).catch((error) => console.error(error));
  },

  useSavedBackground: (id) => {
    const saved = get().savedBackgrounds.find((entry) => entry.id === id);
    if (saved) get().setBackground(saved.background);
  },

  deleteSavedBackground: (id) => {
    const next = get().savedBackgrounds.filter((entry) => entry.id !== id);
    set({ savedBackgrounds: next });
    void storeSavedBackgrounds(next).catch((error) => console.error(error));
  },

  setSavedBackgrounds: (list) => set({ savedBackgrounds: list }),

  setBrandKits: (file) => {
    // Kits made before the file finished loading are kept, after the saved ones.
    const { brandKits, activeBrandKitId } = get();
    const saved = new Set(file.kits.map((kit) => kit.id));
    const made = brandKits.filter((kit) => !saved.has(kit.id));
    set({ brandKits: [...file.kits, ...made], activeBrandKitId: activeBrandKitId ?? file.activeId });
    if (made.length > 0) saveBrandKitsSoon();
  },

  createBrandKit: () => {
    const { brandKits, background, elements, watermark, customPatternPairs } = get();
    const kit = kitFromDesign({ background, elements, watermark, customPatternPairs }, nextKitName(brandKits));
    set({ brandKits: [...brandKits, kit], activeBrandKitId: kit.id });
    saveBrandKitsSoon();
    return kit.id;
  },

  duplicateBrandKit: (id) => {
    const { brandKits } = get();
    const source = brandKits.find((kit) => kit.id === id);
    if (!source) return;
    const copy: BrandKit = { ...source, id: brandId("bk"), name: `${source.name} copy`, updatedAt: Date.now() };
    const at = brandKits.indexOf(source) + 1;
    set({ brandKits: [...brandKits.slice(0, at), copy, ...brandKits.slice(at)], activeBrandKitId: copy.id });
    saveBrandKitsSoon();
  },

  updateBrandKit: (id, patch) => {
    set({
      brandKits: get().brandKits.map((kit) => (kit.id === id ? { ...kit, ...patch, updatedAt: Date.now() } : kit)),
    });
    saveBrandKitsSoon();
  },

  deleteBrandKit: (id) => {
    const { brandKits, activeBrandKitId } = get();
    const at = brandKits.findIndex((kit) => kit.id === id);
    if (at === -1) return;
    const next = brandKits.filter((kit) => kit.id !== id);
    // The one beside it takes over, so the panel doesn't jump to the start.
    const active = activeBrandKitId === id ? (next[Math.min(at, next.length - 1)]?.id ?? null) : activeBrandKitId;
    set({ brandKits: next, activeBrandKitId: active });
    saveBrandKitsSoon();
  },

  setActiveBrandKit: (id) => {
    if (!get().brandKits.some((kit) => kit.id === id)) return;
    set({ activeBrandKitId: id });
    saveBrandKitsSoon();
  },

  applyBrand: (id) => {
    const { brandKits, background, elements, watermark } = get();
    const kit = brandKits.find((entry) => entry.id === id);
    if (kit) set(brandPatch(kit, { background, elements, watermark }));
  },

  setBadge: (patch) => {
    const { watermark } = get();
    set({ watermark: { ...watermark, badge: { ...watermark.badge, ...patch } } });
  },

  setOwnWatermark: (patch) => {
    const { watermark } = get();
    set({ watermark: { ...watermark, own: { ...watermark.own, ...patch } } });
  },

  setMarkTool: (tool) =>
    set({ markTool: tool, selectedIds: [], editingId: null, cropId: null }),

  setMarkStyle: (category, patch) => {
    const { markStyles } = get();
    set({
      markStyles: {
        ...markStyles,
        [category]: { ...markStyles[category], ...patch },
      },
    });
  },

  setEditingId: (id) => set({ editingId: id }),
  setCropId: (id) => set({ cropId: id, editingId: null }),

  setMotion: (patch) => set({ motion: { ...get().motion, ...patch } }),

  setPreferences: (patch) => {
    set({ preferences: { ...get().preferences, ...patch } });
    savePreferencesSoon();
  },

  loadPreferences: (file) => set({ preferences: normalisePreferences(file) }),

  addZoomSpot: () => {
    const { motion, canvas, elements, selectedIds } = get();
    if (motion.spots.length >= MAX_SPOTS) return null;
    const target = elements.find((el) => el.id === selectedIds[0] && !el.hidden);
    // Framing the selected object with a little room round it, or the middle at twice the size.
    const spot: ZoomSpot = target
      ? {
          id: "spot_" + Math.random().toString(36).slice(2, 9),
          cx: (target.x + target.width / 2) / canvas.width,
          cy: (target.y + target.height / 2) / canvas.height,
          zoom: Math.min(
            MAX_SPOT_ZOOM,
            Math.max(
              MIN_SPOT_ZOOM,
              Math.min(canvas.width / (target.width * 1.3), canvas.height / (target.height * 1.3)),
            ),
          ),
        }
      : { id: "spot_" + Math.random().toString(36).slice(2, 9), cx: 0.5, cy: 0.5, zoom: 2 };
    set({ motion: { ...motion, spots: [...motion.spots, spot] } });
    return spot.id;
  },

  updateZoomSpot: (id, patch) => {
    const { motion } = get();
    set({ motion: { ...motion, spots: motion.spots.map((spot) => (spot.id === id ? { ...spot, ...patch } : spot)) } });
  },

  removeZoomSpot: (id) => {
    const { motion } = get();
    set({ motion: { ...motion, spots: motion.spots.filter((spot) => spot.id !== id) } });
  },

  setElementMotion: (id, patch) =>
    set({
      elements: get().elements.map((el) => {
        if (el.id !== id) return el;
        const next = { ...DEFAULT_ELEMENT_MOTION, ...el.motion, ...patch };
        // No moves at all is the same as none, so a file stays as it was.
        if (next.enter === "none" && next.keep === "none") return withoutMotion(el);
        return { ...el, motion: next } as LayerElement;
      }),
    }),

  bringInOneByOne: (ids, enter) => {
    const chosen = new Set(ids);
    let order = 0;
    set({
      elements: get().elements.map((el) => {
        if (!chosen.has(el.id) || el.hidden) return el;
        const motion: ElementMotion = {
          ...DEFAULT_ELEMENT_MOTION,
          ...el.motion,
          enter,
          start: Math.round(order * STAGGER * 10) / 10,
        };
        order += 1;
        return { ...el, motion } as LayerElement;
      }),
    });
  },

  clearElementMotion: () => set({ elements: get().elements.map(withoutMotion) }),
  // Undo is an edit, so it ends a preview first: the canvas shows the design at rest.
  undo: () => {
    if (get().previewing) set({ previewing: false });
    history.undo();
  },
  redo: () => {
    if (get().previewing) set({ previewing: false });
    history.redo();
  },

  addCustomPatternPair: (base, accent, label) => {
    const pair: PatternColorPair = {
      id: "pair_" + Math.random().toString(36).slice(2, 9),
      base,
      accent,
      source: "custom",
      label,
    };
    set({ customPatternPairs: [...get().customPatternPairs, pair] });
    void storePatternColors(get().customPatternPairs).catch((error) => console.error(error));
    return pair.id;
  },

  deleteCustomPatternPair: (id) => {
    set({ customPatternPairs: get().customPatternPairs.filter((p) => p.id !== id) });
    void storePatternColors(get().customPatternPairs).catch((error) => console.error(error));
  },

  setCustomPatternPairs: (pairs) => {
    const made = get().customPatternPairs.filter((pair) => !pairs.some((kept) => kept.id === pair.id));
    set({ customPatternPairs: [...pairs, ...made] });
  },

  addImage: (src, naturalWidth, naturalHeight) => {
    const { canvas, elements } = get();
    // fit inside ~80% of canvas
    const maxW = canvas.width * 0.8;
    const maxH = canvas.height * 0.8;
    const ratio = Math.min(maxW / naturalWidth, maxH / naturalHeight, 1);
    const w = naturalWidth * ratio;
    const h = naturalHeight * ratio;
    const el: ImageElement = {
      id: uid(),
      type: "image",
      x: (canvas.width - w) / 2,
      y: (canvas.height - h) / 2,
      width: w,
      height: h,
      rotation: 0,
      opacity: 1,
      src,
      naturalWidth,
      naturalHeight,
      deviceFrame: null,
      cornerRadius: 8,
      shadow: { enabled: true, color: "rgba(0,0,0,0.45)", blur: 60, offsetX: 0, offsetY: 30 },
      transform: "rotate3d(0deg, 0deg, 0deg)"
    };
    // Whichever way an image arrives, it takes the layout's next free slot.
    const { layout } = get();
    const free = layout ? layout.slots.findIndex((slot) => !slot.id) : -1;
    set({
      elements: [...elements, el],
      selectedIds: [el.id],
      ...(layout && free !== -1
        ? { layout: { ...layout, slots: layout.slots.map((slot, i) => (i === free ? { id: el.id } : slot)) } }
        : {}),
    });
    return el.id;
  },

  addLogo: (src, naturalWidth, naturalHeight) => {
    const { canvas, elements } = get();
    const shorter = Math.min(canvas.width, canvas.height);
    const ratio = Math.min((canvas.width * 0.3) / naturalWidth, (shorter * 0.2) / naturalHeight);
    const margin = marginOf(canvas) * 2;
    const el: ImageElement = {
      id: uid(),
      type: "image",
      x: margin,
      y: margin,
      width: naturalWidth * ratio,
      height: naturalHeight * ratio,
      rotation: 0,
      opacity: 1,
      src,
      naturalWidth,
      naturalHeight,
      deviceFrame: null,
      cornerRadius: 0,
      shadow: { enabled: false, color: "rgba(0,0,0,0.45)", blur: 60, offsetX: 0, offsetY: 30 },
      transform: "rotate3d(0deg, 0deg, 0deg)",
    };
    set({ elements: [...elements, el], selectedIds: [el.id] });
    return el.id;
  },

  setNaturalSize: (id, naturalWidth, naturalHeight) =>
    history.silently(() =>
      get().updateElement(id, { naturalWidth, naturalHeight } as Partial<LayerElement>),
    ),

  setGifInfo: (id, gif) =>
    history.silently(() => get().updateElement(id, { gif } as Partial<LayerElement>)),

  setLayout: (id) => {
    const { layout, elements } = get();
    const bake = (keep: Set<string | null>) =>
      elements.map((el) =>
        el.type === "image" && !keep.has(el.id) ? withoutLayoutCrop(el) : el,
      );

    if (!id) {
      set({ layout: null, elements: bake(new Set()) });
      return;
    }

    // Images already in the layout keep their order, then any others fill up.
    const next = newLayout(id, layout);
    const current = (layout?.slots ?? []).flatMap((slot) => (slot.id ? [slot.id] : []));
    const others = elements
      .filter((el) => el.type === "image" && !current.includes(el.id))
      .map((el) => el.id);
    const queue = [...current, ...others].slice(0, next.slots.length);
    next.slots = next.slots.map((slot, i) => ({ id: queue[i] ?? null }));
    set({ layout: next, elements: bake(new Set(queue)) });
  },

  updateLayout: (patch) => {
    const { layout } = get();
    if (layout) set({ layout: { ...layout, ...patch } });
  },

  setSlotFocus: (index, focus) => {
    const { layout } = get();
    if (!layout) return;
    set({
      layout: {
        ...layout,
        slots: layout.slots.map((slot, i) => (i === index ? { ...slot, focus } : slot)),
      },
    });
  },

  swapSlots: (a, b) => {
    const { layout } = get();
    if (!layout || !layout.slots[a] || !layout.slots[b]) return;
    const slots = layout.slots.slice();
    // The focus belongs to the picture it was chosen for, so it moves too, as does
    // being in front. Card fills and labels belong to the place, so they stay.
    [slots[a], slots[b]] = [slots[b], slots[a]];
    const front = layout.front === a ? b : layout.front === b ? a : layout.front;
    set({ layout: { ...layout, slots, front } });
  },

  fillSlot: (index, src, width, height) => {
    const { layout, elements, addImage } = get();
    const old = layout?.slots[index]?.id;
    if (layout && old) {
      set({
        elements: elements.filter((el) => el.id !== old),
        layout: {
          ...layout,
          slots: layout.slots.map((slot, i) => (i === index ? { id: null } : slot)),
        },
      });
    }
    const id = addImage(src, width, height);
    const after = get().layout;
    if (after) {
      // addImage took the first free slot, which may be an earlier one.
      set({
        layout: {
          ...after,
          slots: after.slots.map((slot, i) => {
            if (i === index) return { id };
            return slot.id === id ? { id: null } : slot;
          }),
        },
      });
    }
    return id;
  },

  fitCanvasToLayout: () => {
    const { layout, elements, canvas } = get();
    if (!layout) return;
    // Gaps scale with the canvas, so a new size changes what fits. It settles quickly.
    let fitted = canvas;
    for (let pass = 0; pass < FIT_PASSES; pass++) {
      const next = fittedCanvas(layout, arrangeLayout(layout, elements, fitted));
      if (!next) return;
      const settled = next.width === fitted.width && next.height === fitted.height;
      fitted = next;
      if (settled) break;
    }
    set({ canvas: fitted });
  },

  matchLayoutStyle: (sourceId) => {
    const { layout, elements } = get();
    const source = elements.find((el) => el.id === sourceId);
    if (!layout || source?.type !== "image") return;
    const ids = new Set(layout.slots.map((slot) => slot.id));
    set({
      elements: elements.map((el) =>
        el.type === "image" && el.id !== sourceId && ids.has(el.id)
          ? {
              ...el,
              shadow: source.shadow,
              cornerRadius: source.cornerRadius,
              border: source.border,
              deviceFrame: source.deviceFrame,
            }
          : el,
      ),
    });
  },

  addUploadedImage: (src, naturalWidth, naturalHeight) => {
    const image: UploadedImage = {
      id: uid(),
      src,
      naturalWidth,
      naturalHeight,
      createdAt: Date.now(),
    };
    set({ uploadedImages: [...get().uploadedImages, image] });
    return image.id;
  },

  deleteUploadedImage: (id) =>
    set({
      uploadedImages: get().uploadedImages.filter((image) => image.id !== id),
    }),

  addText: (variant, overrides) => {
    const { canvas, elements } = get();
    const heading = variant === "heading";
    const el: TextElement = {
      id: uid(),
      type: "text",
      x: canvas.width * 0.1,
      y: canvas.height * 0.1,
      width: canvas.width * 0.8,
      height: heading ? 160 : 80,
      rotation: 0,
      opacity: 1,
      text: heading ? "Ship visuals,\nnot pixels." : "Tap to edit",
      variant,
      fontFamily: heading ? "Bricolage Grotesque" : "DM Sans",
      fontSize: heading ? 120 : 40,
      fontWeight: heading ? 700 : 400,
      fill: "#E7E5F5",
      align: "left",
      letterSpacing: heading ? -2 : 0,
      lineHeight: heading ? 1.05 : 1.4,
      ...overrides,
    };
    set({ elements: [...elements, el], selectedIds: [el.id] });
    return el.id;
  },

  addShape: (shape, overrides) => {
    const { canvas, elements } = get();
    const look = { ...shapeDefaults(shape, elements), ...overrides };
    const width = look.width ?? 240;
    const height = look.height ?? 240;
    // Step down from centre past anything already there, or a run of new marks
    // piles up and hides itself.
    let x = (canvas.width - width) / 2;
    let y = (canvas.height - height) / 2;
    const taken = () =>
      elements.some(
        (e) =>
          e.x + e.width / 2 === x + width / 2 &&
          e.y + e.height / 2 === y + height / 2,
      );
    while (taken()) {
      x += 32;
      y += 32;
    }
    const el: ShapeElement = {
      id: uid(),
      type: "shape",
      shape,
      x,
      y,
      width,
      height,
      rotation: 0,
      opacity: 1,
      fill: "#534AB7",
      stroke: "#1D9E75",
      strokeWidth: 0,
      cornerRadius: 0,
      dashed: false,
      ...look,
    };
    set({ elements: [...elements, el], selectedIds: [el.id] });
    return el.id;
  },

  updateElement: (id, patch) =>
    set({
      elements: get().elements.map((e) =>
        e.id === id ? ({ ...e, ...patch } as LayerElement) : e
      ),
    }),

  setDeviceFrame: (id, frame) =>
    set({
      elements: get().elements.map((el) =>
        el.id === id && el.type === "image"
          ? { ...el, deviceFrame: frame, ...placeFrame(el, frame, get().canvas) }
          : el,
      ),
    }),

  measureElement: (id, height) =>
    history.silently(() => get().updateElement(id, { height })),

  duplicateElement: (id) => {
    const source = get().elements.find((e) => e.id === id);
    if (!source) return;
    const copy = {
      // A copy is free of the layout, so the slot's trim becomes its own crop.
      ...(source.type === "image" ? withoutLayoutCrop(source) : source),
      id: uid(),
      x: source.x + 32,
      y: source.y + 32,
      locked: false,
      hidden: false,
      // A copied step marker is almost always the next step.
      ...(source.type === "shape" && source.shape === "number"
        ? { text: nextNumber(get().elements) }
        : {}),
    } as LayerElement;
    set({ elements: [...get().elements, copy], selectedIds: [copy.id] });
  },

  deleteElement: (id) =>
    set({
      elements: get().elements.filter((e) => e.id !== id),
      selectedIds: get().selectedIds.filter((s) => s !== id),
    }),

  selectElement: (id, additive = false) => {
    if (id === null) return set({ selectedIds: [] });
    if (additive) {
      const sel = get().selectedIds;
      set({ selectedIds: sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id] });
    } else {
      set({ selectedIds: [id] });
    }
  },

  moveElement: (id, dz) => {
    const els = get().elements.slice();
    const idx = els.findIndex((e) => e.id === id);
    if (idx === -1) return;
    const target = idx + dz;
    if (target < 0 || target >= els.length) return;
    const [item] = els.splice(idx, 1);
    els.splice(target, 0, item);
    set({ elements: els });
  },

  reorderElement: (id, targetId) => {
    const els = get().elements.slice();
    const from = els.findIndex((e) => e.id === id);
    const to = els.findIndex((e) => e.id === targetId);
    if (from === -1 || to === -1 || from === to) return;
    const [item] = els.splice(from, 1);
    els.splice(to, 0, item);
    set({ elements: els });
  },

  loadProject: (project) => {
    // The fonts it carries load in the background; text is measured again as each arrives.
    void registerFonts(normaliseProjectFonts(project.fonts));
    set({
      markTool: null,
      editingId: null,
      cropId: null,
      canvas: {
        label: "Custom",
        width: project.canvas.width,
        height: project.canvas.height,
      },
      // Older files lack whole parts (pattern, backdrop, effects), and keep some
      // settings where they used to live.
      background: carryPatternColors(normaliseBackground(project.background, DEFAULT_BACKGROUND)),
      lookTrails: {},
      elements: project.elements.map(migrateElement).map(withNormalMotion),
      watermark: normaliseWatermark(project.watermark),
      motion: normaliseMotion(project.motion),
      previewing: false,
      layout: normaliseLayout(project.layout),
      selectedIds: [],
    });
    history.reset();
  },

  toProject: () => {
    const { canvas, elements, watermark, layout, motion } = get();
    // A custom pattern pair's colours go with the project, so it opens the same anywhere.
    const background = carryPatternColors(get().background);
    // Fonts that aren't Layer's own go with the project, so it opens the same anywhere.
    const families = new Set(
      elements.flatMap((el) => (el.type === "text" && !isLayerFont(el.fontFamily) ? [el.fontFamily] : [])),
    );
    const fonts = [...families].flatMap(fontFilesFor);
    return {
      version: 1,
      canvas: { width: canvas.width, height: canvas.height },
      background,
      elements,
      watermark,
      layout,
      motion,
      ...(fonts.length > 0 ? { fonts } : {}),
    };
  },

  resetProject: () => {
    set({
      markTool: null,
      editingId: null,
      cropId: null,
      canvas: DEFAULT_CANVAS,
      background: DEFAULT_BACKGROUND,
      lookTrails: {},
      elements: [],
      layout: null,
      motion: DEFAULT_MOTION,
      previewing: false,
      selectedIds: [],
    });
    history.reset();
  },
}));

/** Writes preferences to their file once switches stop being flicked. */
let preferencesSave: ReturnType<typeof setTimeout> | undefined;
const savePreferencesSoon = () => {
  clearTimeout(preferencesSave);
  preferencesSave = setTimeout(() => {
    void storePreferences(useEditor.getState().preferences).catch((error) => console.error(error));
  }, 200);
};

/** How long kit changes wait before they're written: a colour picker changes many times a second. */
const BRAND_SAVE_DELAY = 400;
let brandSave: ReturnType<typeof setTimeout> | undefined;

/** Writes the kits to their file, once changes stop. Kits with fonts in them run to megabytes. */
/**
 * One write at a time. Writing the kits clears the font and logo files they no
 * longer use, so an older write mustn't land after a newer one has kept its files.
 */
let brandWrites: Promise<void> = Promise.resolve();

const saveBrandKitsSoon = () => {
  clearTimeout(brandSave);
  brandSave = setTimeout(() => {
    brandWrites = brandWrites
      .then(async () => {
        const { brandKits, activeBrandKitId } = useEditor.getState();
        const file = { version: 1 as const, activeId: activeBrandKitId, kits: brandKits };
        // On the desktop, fonts and logos are kept as files beside the JSON.
        await storeBrandKits(hasBrandKitsFile ? await packBrandKits(file) : file);
      })
      .catch((error) => console.error(error));
  }, BRAND_SAVE_DELAY);
};

const documentOf = ({
  canvas,
  background,
  elements,
  uploadedImages,
  layout,
  watermark,
  motion,
}: EditorState) => ({
  motion,
  canvas,
  background,
  elements,
  uploadedImages,
  layout,
  watermark,
});

const history = createHistory({
  read: () => documentOf(useEditor.getState()),
  write: (doc) => {
    const ids = new Set(doc.elements.map((e) => e.id));
    useEditor.setState({
      ...doc,
      // Selection isn't part of a step, but it can't outlive what it points at.
      selectedIds: useEditor.getState().selectedIds.filter((id) => ids.has(id)),
      editingId: null,
      cropId: null,
    });
  },
  onStacksChange: (canUndo, canRedo) => useEditor.setState({ canUndo, canRedo }),
});

// Keeps images in a layout where it says they go, whatever just changed.
useEditor.subscribe((state, previous) => {
  if (
    !state.layout ||
    (state.layout === previous.layout &&
      state.elements === previous.elements &&
      state.canvas === previous.canvas)
  ) {
    return;
  }
  const settled = settleLayout(state.layout, state.elements, state.canvas);
  if (settled) useEditor.setState(settled);
});

useEditor.subscribe((state, previous) => {
  if (
    state.elements !== previous.elements ||
    state.uploadedImages !== previous.uploadedImages ||
    state.layout !== previous.layout ||
    state.background !== previous.background ||
    state.canvas !== previous.canvas ||
    state.watermark !== previous.watermark ||
    state.motion !== previous.motion
  ) {
    history.changed();
  }
});

// A kit's fonts are on the page whenever the kit is, so its text can use them.
useEditor.subscribe((state, previous) => {
  if (state.brandKits === previous.brandKits) return;
  void registerFonts(
    state.brandKits.flatMap((kit) =>
      kit.fonts.flatMap((font) => font.files.map((file) => ({ family: font.family, ...file }))),
    ),
  );
});

setFontLoadedListener(() => useEditor.setState((state) => ({ fontsVersion: state.fontsVersion + 1 })));

export type { Tool };
