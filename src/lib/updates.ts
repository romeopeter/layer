import { useEditor } from "@/store/editor";
import { checkUpdate, hasUpdates, installUpdate as install } from "@/lib/host";

/*
  Layer's own updates, on the desktop. A quiet check runs once soon after launch
  (built apps only); if there's a newer version, an Update button shows in the top
  bar. Check for Updates in the menu bar asks straight away and shows the answer.
  Installing downloads the update, which Rust checks against the key built into
  the app, and restarts into it. See learn/18-releases-and-updates.md.
*/

export type UpdateStatus = "idle" | "checking" | "current" | "available" | "downloading" | "error";

export interface UpdateState {
  status: UpdateStatus;
  /** Whether the update dialog is showing. */
  open: boolean;
  version?: string;
  notes?: string | null;
  /** 0 to 1 while downloading, when the size is known. */
  progress?: number | null;
  message?: string;
}

const set = (patch: Partial<UpdateState>) =>
  useEditor.setState({ update: { ...useEditor.getState().update, ...patch } });

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Layer couldn't check for updates. Try again later.";

/** Asks whether there's a newer Layer. Asked for (from the menu), it shows the answer either way. */
export const checkForUpdates = async ({ manual }: { manual: boolean }) => {
  if (!hasUpdates) return;
  if (useEditor.getState().update.status === "downloading") {
    set({ open: true });
    return;
  }
  set({ status: "checking", open: manual, message: undefined });
  try {
    const found = await checkUpdate();
    if (found) set({ status: "available", version: found.version, notes: found.notes });
    else set({ status: manual ? "current" : "idle" });
  } catch (error) {
    // A quiet check that fails says nothing: there's no one waiting on it.
    set(manual ? { status: "error", message: messageOf(error) } : { status: "idle" });
  }
};

/** Downloads and installs the update, then Layer restarts into it. */
export const installUpdate = async () => {
  set({ status: "downloading", open: true, progress: null });
  try {
    await install((done, total) => set({ progress: total ? Math.min(1, done / total) : null }));
  } catch (error) {
    set({ status: "error", message: messageOf(error) });
  }
};

export const showUpdate = (open: boolean) => set({ open });

/** How long after launch the quiet check waits, so it never slows opening Layer. */
export const QUIET_CHECK_DELAY = 5000;
