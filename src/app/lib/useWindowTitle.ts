import { useEffect } from "react";
import { useStudio } from "../store/useStudio";
import { isDesktop } from "./platform";
import { projectFileName } from "./project";

/**
 * Keeps the window — and the browser tab — showing what is open and whether it is saved.
 *
 * The leading dot is the convention every desktop editor uses for unsaved work: visible at a
 * glance in a taskbar or a window list, where a word would be truncated away.
 */
export function useWindowTitle(): void {
  const name = useStudio((state) => state.spec.meta.name);
  const filePath = useStudio((state) => state.filePath);
  const dirty = useStudio((state) => state.spec !== state.cleanSpec);

  useEffect(() => {
    const label = filePath ? projectFileName() : name.trim() || "Untitled";
    const title = `${dirty ? "• " : ""}${label} — Wardrobe Studio`;
    document.title = title;
    if (!isDesktop()) return;

    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().setTitle(title);
      } catch {
        // A stale title is not worth a notice.
      }
    })();
  }, [name, filePath, dirty]);
}
