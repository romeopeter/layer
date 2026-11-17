import { useCallback, useState } from "react";
import { exportAnimation, type AnimationExport, type AnimationFormat } from "@/lib/motion/exportAnimation";

export type AnimationSettings = Omit<AnimationExport, "onProgress" | "signal">;

export interface AnimationJob {
  format: AnimationFormat;
  done: number;
  total: number;
  error: string | null;
  stop: AbortController;
}

/**
 * Making an MP4 or GIF takes a while: each frame is drawn and encoded. This starts
 * one and keeps its progress, from the click itself, so it runs exactly once.
 */
export const useAnimationExport = () => {
  const [job, setJob] = useState<AnimationJob | null>(null);

  const start = useCallback((settings: AnimationSettings) => {
    const stop = new AbortController();
    const mine = (update: (current: AnimationJob) => AnimationJob | null) =>
      setJob((current) => (current?.stop === stop ? update(current) : current));
    setJob({ format: settings.format, done: 0, total: 0, error: null, stop });
    exportAnimation({
      ...settings,
      signal: stop.signal,
      onProgress: (done, total) => mine((current) => ({ ...current, done, total })),
    })
      .then(() => mine(() => null))
      .catch((error: unknown) =>
        mine((current) =>
          error instanceof DOMException && error.name === "AbortError"
            ? null
            : { ...current, error: error instanceof Error ? error.message : String(error) },
        ),
      );
  }, []);

  const cancel = useCallback(() => {
    setJob((current) => {
      current?.stop.abort();
      return current?.error ? null : current;
    });
  }, []);

  return { job, start, cancel };
};

