import { useEditor } from "@/store/editor";
import { confirmAction } from "@/lib/host";
import { downloadProject, exportCanvas, openProjectFile } from "@/lib/exporters";
import { hasMotion } from "@/lib/motion/normalise";
import { playback } from "@/lib/motion/playback";

/*
  What the menu bar and keyboard shortcuts do, in one place. On the desktop a
  shortcut may reach both the page and the menu, depending on the OS: the page
  runs it and notes that it did, and the menu skips the same action straight
  after, so nothing happens twice.
*/

export const APP_ACTIONS = [
  "new",
  "open",
  "save",
  "export-png",
  "export",
  "undo",
  "redo",
  "duplicate",
  "delete",
  "select-all",
  "zoom-in",
  "zoom-out",
  "zoom-fit",
  "grid",
  "dark-mode",
  "play",
  "settings",
  "shortcuts",
  "check-updates",
] as const;

export type AppAction = (typeof APP_ACTIONS)[number];

/** Asks the TopBar to open its Export menu, where MP4 and GIF are. */
export const OPEN_EXPORT_EVENT = "layer:open-export";

const isAction = (id: string): id is AppAction => (APP_ACTIONS as readonly string[]).includes(id);

/** Typing in a field, where Undo, Delete and Select All belong to the text. */
const typing = () => {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === "TEXTAREA" || el.isContentEditable) return true;
  return el.tagName === "INPUT" && !["color", "checkbox", "radio", "range", "button"].includes((el as HTMLInputElement).type);
};

/** Set by the updater, which loads only when it's needed. */
let checkForUpdates: (() => Promise<void>) | null = null;
export const setUpdateChecker = (check: () => Promise<void>) => {
  checkForUpdates = check;
};

const run = async (action: AppAction) => {
  const s = useEditor.getState();
  switch (action) {
    case "new":
      if (
        s.elements.length === 0 ||
        (await confirmAction(
          "Start a new design? This one will be cleared. Save it first if you want to keep it.",
          "New Design",
        ))
      ) {
        s.resetProject();
      }
      return;
    case "open":
      return openProjectFile();
    case "save":
      return downloadProject();
    case "export-png":
      return exportCanvas("png", 2);
    case "export":
      window.dispatchEvent(new Event(OPEN_EXPORT_EVENT));
      return;
    case "undo":
      if (typing()) document.execCommand("undo");
      else s.undo();
      return;
    case "redo":
      if (typing()) document.execCommand("redo");
      else s.redo();
      return;
    case "duplicate":
      if (!typing()) s.selectedIds.forEach((id) => s.duplicateElement(id));
      return;
    case "delete":
      if (typing()) document.execCommand("delete");
      else s.elements.filter((el) => s.selectedIds.includes(el.id) && !el.locked).forEach((el) => s.deleteElement(el.id));
      return;
    case "select-all":
      if (typing()) document.execCommand("selectAll");
      else useEditor.setState({ selectedIds: s.elements.filter((el) => !el.hidden && !el.locked).map((el) => el.id) });
      return;
    case "zoom-in":
      return s.setZoom(s.zoom + 10);
    case "zoom-out":
      return s.setZoom(s.zoom - 10);
    case "zoom-fit":
      return s.setZoom(100);
    case "grid":
      return s.toggleGrid();
    case "dark-mode":
      return s.setPreferences({ theme: s.preferences.theme === "dark" ? "light" : "dark" });
    case "play":
      if (hasMotion(s.motion, s.elements, s.background)) playback.toggle();
      return;
    case "settings":
    case "shortcuts":
      return s.setActiveTool("customize");
    case "check-updates":
      return checkForUpdates?.();
  }
};

let lastKey: { action: AppAction; at: number } | null = null;
/** Long enough for the same press to reach the menu, too short for a second press. */
const SAME_PRESS_MS = 300;

/** A keyboard shortcut's action, noted so the menu doesn't run it again. */
export const runFromKey = (action: AppAction) => {
  lastKey = { action, at: performance.now() };
  return run(action);
};

/** A menu bar item, by its id. Items that aren't Layer's own are the system's to handle. */
export const runFromMenu = (id: string) => {
  if (!isAction(id)) return;
  if (lastKey?.action === id && performance.now() - lastKey.at < SAME_PRESS_MS) return;
  return run(id);
};
