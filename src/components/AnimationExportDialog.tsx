import { AppModal } from "@/components/ui/app-modal";
import { Button } from "@/components/ui/button";
import { PanelHelp } from "@/components/panels/primitives";
import type { AnimationFormat } from "@/lib/motion/exportAnimation";
import type { AnimationJob } from "./useAnimationExport";

const NAMES: Record<AnimationFormat, string> = { mp4: "MP4", gif: "GIF" };

/** Shows how far an animation's export has got, with Cancel. */
export const AnimationExportDialog = ({ job, onCancel }: { job: AnimationJob | null; onCancel: () => void }) => {
  const name = job ? NAMES[job.format] : "";
  const share = job && job.total > 0 ? job.done / job.total : 0;
  return (
    <AppModal
      open={!!job}
      onOpenChange={(open) => !open && onCancel()}
      title={job?.error ? `Your ${name} couldn't be made` : `Making your ${name}`}
      description={job?.error ? undefined : "Each frame is drawn on the canvas, then added to the file."}
    >
      {job?.error ? (
        <div className="space-y-3">
          <PanelHelp className="my-0 text-a-200">{job.error}</PanelHelp>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="cursor-pointer" onClick={onCancel}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            role="progressbar"
            aria-label="Export progress"
            aria-valuemin={0}
            aria-valuemax={job?.total ?? 0}
            aria-valuenow={job?.done ?? 0}
            className="h-1.5 w-full overflow-hidden rounded-full bg-p-200/20"
          >
            <div className="h-full bg-t-400 transition-[width]" style={{ width: `${Math.round(share * 100)}%` }} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-text-muted">
              {job && job.total > 0 ? `Frame ${job.done} of ${job.total}` : "Getting ready…"}
            </span>
            <Button variant="ghost" size="sm" className="cursor-pointer" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </AppModal>
  );
};
