import { useEditor } from "@/store/editor";

/** Opens a section of the Properties panel and brings it into view, for links from elsewhere. */
export const revealSection = (id: string) => {
  useEditor.getState().setSectionOpen(id, true);
  requestAnimationFrame(() =>
    document.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ block: "start" }),
  );
};
