/** How the user likes Layer set up. Not part of any project, and not undone. */
export interface Preferences {
  theme: "dark" | "light";
  /** The dotted grid behind the canvas. */
  dottedGrid: boolean;
  /** Fewer moving parts in the interface. Null follows the system's setting. */
  reduceMotion: boolean | null;
  /** Rail groups taken off the rail in Customize Sidebar, by key. */
  hiddenGroups: string[];
}
