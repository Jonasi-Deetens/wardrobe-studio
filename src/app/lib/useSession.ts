import { useEffect, useRef, useState } from "react";
import { clearHistory, useStudio } from "../store/useStudio";
import {
  decodeSpecFromHash,
  readAutosave,
  readSettings,
  writeAutosave,
  writeSettings,
} from "./persistence";

/**
 * Session lifecycle: restore, then keep saving.
 *
 * Priority on load is a shared link first, then the autosave, then the default. A link is
 * an explicit request to see a specific design, so it should not be silently overridden by
 * whatever the browser happened to have open last.
 *
 * Both of those reads are asynchronous, and IndexedDB on a cold start can take long
 * enough for someone to have started typing. Whatever they typed wins: restoring over
 * the top of it would throw away work with no way to get it back, so the restore is
 * abandoned and says so instead.
 */
export function useSession(): { readonly restored: boolean } {
  const setSpec = useStudio((state) => state.setSpec);
  const setOpenGroups = useStudio((state) => state.setOpenGroups);
  const loadJson = useStudio((state) => state.loadJson);
  const addNotices = useStudio((state) => state.addNotices);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const specAtStart = useStudio.getState().spec;
    const edited = (): boolean => useStudio.getState().spec !== specAtStart;

    void (async () => {
      const fromHash = await decodeSpecFromHash(window.location.hash);

      if (cancelled) return;

      if (fromHash.kind === "broken") {
        addNotices([`That share link could not be opened. ${fromHash.reason}`]);
      }

      if (fromHash.kind === "loaded") {
        if (edited()) {
          addNotices([
            "The shared link was not opened because you had already started editing. Reload the page to open it.",
          ]);
          setRestored(true);
          return;
        }
        setSpec(fromHash.load.spec, [
          "Opened from a shared link.",
          ...fromHash.load.repairs,
        ]);
        clearHistory();
        setRestored(true);
        return;
      }

      const autosave = await readAutosave();
      if (cancelled) return;
      if (autosave) {
        if (edited()) {
          addNotices([
            "Your last session was not restored because you had already started editing. Reload the page to get it back.",
          ]);
        } else {
          loadJson(autosave.json);
          clearHistory();
        }
      }

      const settings = await readSettings();
      if (cancelled) return;
      if (settings?.openGroups) setOpenGroups(settings.openGroups);
      setRestored(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [setSpec, setOpenGroups, loadJson, addNotices]);

  return { restored };
}

/** Debounced autosave. Fast enough to be safe, slow enough not to write on every keypress. */
export function useAutosave(enabled: boolean): void {
  const spec = useStudio((state) => state.spec);
  const markSaved = useStudio((state) => state.markSaved);
  const addNotices = useStudio((state) => state.addNotices);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /* One warning is enough; a browser that refuses storage will refuse every write. */
  const warned = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      writeAutosave(spec).then(markSaved, () => {
        if (warned.current) return;
        warned.current = true;
        addNotices([
          "This browser will not let the app save your work locally, so it will be lost when the tab closes. Use Save to download the project file instead. Private browsing usually causes this.",
        ]);
      });
    }, 700);
    return () => clearTimeout(timer.current);
  }, [spec, enabled, markSaved, addNotices]);

  /* A closing tab does not wait for a debounce, so flush on the way out. */
  useEffect(() => {
    if (!enabled) return;
    const flush = (): void => {
      // Nothing can be reported at this point; the page is going away.
      void writeAutosave(spec).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [spec, enabled]);
}

export function usePersistedGroups(enabled: boolean): void {
  const openGroups = useStudio((state) => state.openGroups);
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      void writeSettings({ openGroups });
    }, 500);
    return () => clearTimeout(timer);
  }, [openGroups, enabled]);
}
