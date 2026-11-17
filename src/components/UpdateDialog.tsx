import { useEditor } from "@/store/editor";
import { installUpdate, showUpdate } from "@/lib/updates";
import { AppModal } from "@/components/ui/app-modal";
import { Button } from "@/components/ui/button";
import { PanelHelp } from "@/components/panels/primitives";
import { version as CURRENT } from "../../package.json";

const TITLES = {
  idle: "Updates",
  checking: "Checking for updates…",
  current: "Layer is up to date",
  available: "A new Layer is ready",
  downloading: "Updating Layer",
  error: "Layer couldn't update",
} as const;

/** What a check for Layer's own updates found, and the way to install it. */
export const UpdateDialog = () => {
  const update = useEditor((s) => s.update);
  const close = () => showUpdate(false);

  return (
    <AppModal
      open={update.open}
      // Mid-download there's nothing to stop; the dialog stays to show it's working.
      onOpenChange={(open) => update.status !== "downloading" && showUpdate(open)}
      title={TITLES[update.status]}
    >
      <div className="space-y-3">
        {update.status === "checking" && <PanelHelp className="my-0">Asking for the newest version…</PanelHelp>}

        {update.status === "current" && (
          <PanelHelp className="my-0">Version {CURRENT} is the newest.</PanelHelp>
        )}

        {update.status === "available" && (
          <>
            <PanelHelp className="my-0">
              Version {update.version} is ready. You have {CURRENT}. Layer restarts to finish, so save your work
              first.
            </PanelHelp>
            {update.notes && (
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-hairline bg-chrome/40 p-2.5 text-[12px] text-text-muted">
                {update.notes}
              </div>
            )}
          </>
        )}

        {update.status === "downloading" && (
          <>
            <div
              role="progressbar"
              aria-label="Update progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={update.progress == null ? undefined : Math.round(update.progress * 100)}
              className="h-1.5 w-full overflow-hidden rounded-full bg-p-200/20"
            >
              <div
                className="h-full bg-t-400 transition-[width]"
                style={{ width: `${Math.round((update.progress ?? 0) * 100)}%` }}
              />
            </div>
            <PanelHelp className="my-0">Downloading. Layer restarts when it's done.</PanelHelp>
          </>
        )}

        {update.status === "error" && <PanelHelp className="my-0 text-a-200">{update.message}</PanelHelp>}

        <div className="flex justify-end gap-2">
          {update.status === "available" ? (
            <>
              <Button variant="ghost" size="sm" className="cursor-pointer" onClick={close}>
                Later
              </Button>
              <Button variant="primary" size="sm" className="cursor-pointer" onClick={() => void installUpdate()}>
                Restart and update
              </Button>
            </>
          ) : (
            update.status !== "downloading" &&
            update.status !== "checking" && (
              <Button variant="ghost" size="sm" className="cursor-pointer" onClick={close}>
                OK
              </Button>
            )
          )}
        </div>
      </div>
    </AppModal>
  );
};
