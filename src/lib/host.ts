/**
 * The one boundary between the UI and the desktop shell. Everything here works
 * in a plain browser too, and `@tauri-apps/*` is only ever imported dynamically
 * so the web build never needs it.
 */
export const isTauri = "__TAURI__" in window;

/** On macOS the OS window buttons sit on top of the app's top bar. */
export const hasOverlayTitleBar = isTauri && navigator.userAgent.includes("Mac");

/** On macOS, screenshots use the system's own picker rather than the webview's. */
export const hasNativeScreenshot = hasOverlayTitleBar;

const invokeCore = () => import("@tauri-apps/api/core");

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

export const saveExport = async (blob: Blob, filename: string) => {
  if (!isTauri) return downloadBlob(blob, filename);

  const { invoke } = await invokeCore();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await invoke("export_static", bytes, {
    headers: { "x-layer-filename": filename },
  });
};

/** Saves a .layer file's bytes: a download on the web, a save dialog on the desktop. */
export const saveProject = async (bytes: Uint8Array, filename: string) => {
  if (!isTauri) {
    return downloadBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/zip" }), filename);
  }

  const { invoke } = await invokeCore();
  await invoke("save_project", bytes, { headers: { "x-layer-filename": filename } });
};

/**
 * The picture on the system clipboard, read by the desktop shell, for when a paste
 * event carries none. Null on the web, or when there's no picture.
 */
export const readClipboardImage = async (): Promise<Blob | null> => {
  if (!isTauri) return null;
  const { invoke } = await invokeCore();
  const bytes = await invoke<ArrayBuffer>("read_clipboard_image").catch(() => null);
  return bytes && bytes.byteLength > 0 ? new Blob([bytes], { type: "image/png" }) : null;
};

/** Layer's own updates come with the desktop app. */
export const hasUpdates = isTauri;

export interface AvailableUpdate {
  version: string;
  notes: string | null;
}

/** Asks whether there's a newer Layer. Throws a message for the user if it couldn't ask. */
export const checkUpdate = async (): Promise<AvailableUpdate | null> => {
  const { invoke } = await invokeCore();
  try {
    return await invoke<AvailableUpdate | null>("check_for_update");
  } catch (error) {
    throw new Error(String(error), { cause: error });
  }
};

/**
 * Downloads and installs the update the last check found, then restarts into it.
 * `onProgress` hears bytes so far and the total, if known. Returns only on failure.
 */
export const installUpdate = async (onProgress: (done: number, total: number | null) => void) => {
  const { invoke } = await invokeCore();
  const { listen } = await import("@tauri-apps/api/event");
  const stop = await listen<[number, number | null]>("update-progress", (event) => onProgress(...event.payload));
  try {
    await invoke("install_update");
  } catch (error) {
    throw new Error(String(error), { cause: error });
  } finally {
    stop();
  }
};

/** Asks before something that can't be undone. True if the user chose `go`. */
export const confirmAction = async (message: string, go: string): Promise<boolean> => {
  if (!isTauri) return window.confirm(message);
  const { invoke } = await invokeCore();
  return invoke<boolean>("confirm", { message, go }).catch(() => false);
};

/**
 * Calls `handler` with the id of each menu bar item the user chooses. The menu bar is
 * the desktop's; on the web nothing is ever called. Returns how to stop listening.
 */
export const onMenu = (handler: (id: string) => void): (() => void) => {
  if (!isTauri) return () => {};
  let stop: (() => void) | null = null;
  let stopped = false;
  void import("@tauri-apps/api/event")
    .then(({ listen }) => listen<string>("menu", (event) => handler(event.payload)))
    .then((unlisten) => {
      if (stopped) unlisten();
      else stop = unlisten;
    });
  return () => {
    stopped = true;
    stop?.();
  };
};

/** Ticks the menu bar's setting items to match the page. */
export const syncMenu = async (state: { darkMode: boolean; grid: boolean }) => {
  if (!isTauri) return;
  const { invoke } = await invokeCore();
  await invoke("sync_menu", state).catch(() => {});
};

/** Tells the user something went wrong, for where no panel can show it. */
export const showError = async (message: string) => {
  if (!isTauri) return window.alert(message);

  const { invoke } = await invokeCore();
  await invoke("show_error", { message });
};

/** Resolves to the chosen project's text, or null if the user cancelled. */
/** A .layer file the user picks, as bytes, or null if they cancelled. */
export const pickProjectFile = async (): Promise<Uint8Array | null> => {
  if (isTauri) {
    const { invoke } = await invokeCore();
    // The command has already told the user about any failure. Nothing back is a cancel.
    const bytes = await invoke<ArrayBuffer>("open_project").catch(() => null);
    return bytes && bytes.byteLength > 0 ? new Uint8Array(bytes) : null;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".layer,.laybel,application/json,application/zip";
  return new Promise((resolve, reject) => {
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) file.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
      else resolve(null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
};

/** One frame of a screen, window or tab, chosen in the browser's own picker. */
const captureWithPicker = async (): Promise<Blob | null> => {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screenshots aren't available here. Try uploading an image instead.");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (error) {
    // Closing the picker is reported the same way as refusing it.
    if (error instanceof DOMException && error.name === "NotAllowedError") return null;
    throw new Error("Screenshots aren't available here. Try uploading an image instead.", {
      cause: error,
    });
  }

  try {
    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    // The first frame can be blank until one has really been drawn.
    await new Promise((resolve) => setTimeout(resolve, 250));

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
};

/** Resolves to a PNG of what the user chose, or null if they cancelled. */
export const captureScreen = async (): Promise<Blob | null> => {
  if (!hasNativeScreenshot) return captureWithPicker();

  const { invoke } = await invokeCore();
  let bytes: ArrayBuffer;
  try {
    bytes = await invoke<ArrayBuffer>("capture_screen");
  } catch (error) {
    // Commands report failures as a message that's already written for the user.
    throw new Error(String(error), { cause: error });
  }
  return bytes.byteLength ? new Blob([bytes], { type: "image/png" }) : null;
};

export interface StockImage {
  id: number;
  tags: string;
  previewUrl: string;
  largeImageUrl: string;
}

/**
 * Image search needs an API key, which can only stay private on the Rust side,
 * so the web build has no image search.
 */
export const hasStockImages = isTauri;

export const searchStockImages = async (query: string, page: number) => {
  const { invoke } = await invokeCore();
  return invoke<{ images: StockImage[]; hasMore: boolean }>("search_images", { query, page });
};

export const downloadStockImage = async (url: string): Promise<Blob> => {
  const { invoke } = await invokeCore();
  const bytes = await invoke<ArrayBuffer>("download_image", { url });
  return new Blob([bytes], { type: url.endsWith(".png") ? "image/png" : "image/jpeg" });
};

/**
 * Saved backgrounds live in a file in the app's data folder on the desktop, until
 * SQLite lands. The web build keeps them for the session only: the spec rules out
 * localStorage.
 */
export const hasSavedBackgroundsFile = isTauri;

export const loadSavedBackgrounds = async (): Promise<unknown[]> => {
  if (!isTauri) return [];
  const { invoke } = await invokeCore();
  try {
    const list: unknown = JSON.parse(await invoke<string>("load_saved_backgrounds"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export const storeSavedBackgrounds = async (list: unknown[]) => {
  if (!isTauri) return;
  const { invoke } = await invokeCore();
  try {
    await invoke("store_saved_backgrounds", { list: JSON.stringify(list) });
  } catch (error) {
    // Commands report failures as a message that's already written for the user.
    throw new Error(String(error), { cause: error });
  }
};

/**
 * Brand kits live in a file in the app's data folder on the desktop, until SQLite
 * lands, like saved backgrounds. The web build keeps them for the session only.
 */
export const hasBrandKitsFile = isTauri;

/** What's in the file, unchecked: the caller normalises it. Null on the web or if it can't be read. */
export const loadBrandKits = async (): Promise<unknown> => {
  if (!isTauri) return null;
  const { invoke } = await invokeCore();
  try {
    return JSON.parse(await invoke<string>("load_brand_kits"));
  } catch {
    return null;
  }
};

export const storeBrandKits = async (file: unknown) => {
  if (!isTauri) return;
  const { invoke } = await invokeCore();
  try {
    await invoke("store_brand_kits", { kits: JSON.stringify(file) });
  } catch (error) {
    throw new Error(String(error), { cause: error });
  }
};

/** Pattern colour pairs the user made. Null on the web, where they last for the session. */
export const loadPatternColors = async (): Promise<unknown> => {
  if (!isTauri) return null;
  const { invoke } = await invokeCore();
  try {
    return JSON.parse(await invoke<string>("load_pattern_colors"));
  } catch {
    return null;
  }
};

export const storePatternColors = async (list: unknown) => {
  if (!isTauri) return;
  const { invoke } = await invokeCore();
  try {
    await invoke("store_pattern_colors", { list: JSON.stringify(list) });
  } catch (error) {
    throw new Error(String(error), { cause: error });
  }
};

/** How the user likes Layer set up. Null on the web, where they last for the session. */
export const loadPreferences = async (): Promise<unknown> => {
  if (!isTauri) return null;
  const { invoke } = await invokeCore();
  try {
    return JSON.parse(await invoke<string>("load_preferences"));
  } catch {
    return null;
  }
};

export const storePreferences = async (preferences: unknown) => {
  if (!isTauri) return;
  const { invoke } = await invokeCore();
  try {
    await invoke("store_preferences", { preferences: JSON.stringify(preferences) });
  } catch (error) {
    throw new Error(String(error), { cause: error });
  }
};

/**
 * Keeps a brand kit's font or logo (a `data:` URL) as a file of its own, and gives
 * back the name the desktop filed it under. Desktop only.
 */
export const storeBrandAsset = async (src: string): Promise<string> => {
  const { invoke } = await invokeCore();
  const blob = await (await fetch(src)).blob();
  return invoke<string>("store_brand_asset", new Uint8Array(await blob.arrayBuffer()), {
    headers: { "x-layer-asset-type": blob.type },
  });
};

/** The types a kept asset's extension stands for. */
const ASSET_TYPES: Record<string, string> = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

/** A kept font or logo, back as a `data:` URL. */
export const loadBrandAsset = async (name: string): Promise<string> => {
  const { invoke } = await invokeCore();
  const bytes = await invoke<ArrayBuffer>("load_brand_asset", { name });
  const type = ASSET_TYPES[name.split(".").pop() ?? ""] ?? "application/octet-stream";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([bytes], { type }));
  });
};

/** Google Fonts come through the desktop shell, so the webview never talks to Google. */
export const hasGoogleFonts = isTauri;

const dataUrlOf = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/** One weight of a Google font, as a `data:` URL. Fails with a message written for the user. */
export const downloadGoogleFont = async (family: string, weight: 400 | 500 | 700): Promise<string> => {
  if (!isTauri) throw new Error("Google Fonts are in the desktop app.");
  const { invoke } = await invokeCore();
  try {
    const bytes = await invoke<ArrayBuffer>("google_font", { family, weight });
    return await dataUrlOf(new Blob([bytes], { type: "font/ttf" }));
  } catch (error) {
    throw new Error(String(error), { cause: error });
  }
};
