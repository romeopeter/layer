import { useEffect, useReducer } from "react";
import { Pause, Play, Square } from "lucide-react";
import { useEditor } from "@/store/editor";
import { hasMotion } from "@/lib/motion/normalise";
import { playback } from "@/lib/motion/playback";
import { Slider } from "@/components/ui/slider";

const BUTTON =
  "flex h-6 w-6 cursor-pointer items-center justify-center rounded text-text-muted hover:bg-p-200/10 hover:text-text";

/**
 * Plays the animation on the canvas. It's how you look at the design, like zoom,
 * so it sits with zoom and never exports. Shown only when something moves.
 */
export const PlayBar = () => {
  const moves = useEditor((s) => hasMotion(s.motion, s.elements, s.background));
  const length = useEditor((s) => s.motion.length);
  const previewing = useEditor((s) => s.previewing);
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  useEffect(() => playback.subscribe(redraw), []);
  // With nothing left to move, there's nothing to show but the design itself.
  useEffect(() => {
    if (!moves) playback.stop();
  }, [moves]);

  if (!moves) return null;
  const playing = playback.isPlaying();
  const time = Math.min(playback.time(), length);

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-hairline bg-panel p-1">
      <button
        type="button"
        title={playing ? "Pause" : "Play"}
        aria-label={playing ? "Pause animation" : "Play animation"}
        onClick={playback.toggle}
        className={BUTTON}
      >
        {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      </button>
      <Slider
        thumbLabel="Animation time"
        min={0}
        max={length}
        step={0.01}
        value={[time]}
        onValueChange={([value]) => playback.seek(value)}
        className="w-28 cursor-pointer"
      />
      <span className="min-w-15 px-1 text-center font-mono text-[11px] text-text">
        {time.toFixed(1)} / {length}s
      </span>
      {previewing && (
        <button
          type="button"
          title="Back to editing (Esc)"
          aria-label="Back to editing"
          onClick={playback.stop}
          className={BUTTON}
        >
          <Square className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};
