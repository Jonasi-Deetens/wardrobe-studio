import { useEffect } from "react";
import { isDesktop } from "../lib/platform";
import { confirmDiscard, openProjectFile, saveProject, saveProjectAs } from "../lib/project";
import { MODES, redo, undo, useStudio, type StandardView } from "../store/useStudio";

const VIEW_KEYS: Record<string, StandardView> = {
  "1": "front",
  "2": "left",
  "3": "right",
  "4": "back",
  "5": "top",
  "6": "iso",
};

/**
 * Keyboard shortcuts.
 *
 * They are skipped while a text field has focus, because typing "1800" into the width box
 * must not fly the camera to the front elevation.
 */
export function useKeyboard(): void {
  const setMode = useStudio((state) => state.setMode);
  const requestView = useStudio((state) => state.requestView);
  const setView = useStudio((state) => state.setView);
  const selectPart = useStudio((state) => state.selectPart);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable === true;

      /*
       * Every modifier shortcut belongs to the native menu on the desktop.
       *
       * A menu accelerator is handled by the window before the webview ever sees the key, so
       * anything also handled here would run twice — two save dialogs for one Ctrl+S. The
       * split is drawn at the modifier deliberately: bare keys cannot go in a menu at all,
       * since an accelerator would fire while someone is typing a width into a text box.
       */
      const meta = (event.ctrlKey || event.metaKey) && !isDesktop();

      if (meta) {
        switch (event.key.toLowerCase()) {
          case "z":
            event.preventDefault();
            if (event.shiftKey) redo();
            else undo();
            return;
          case "y":
            event.preventDefault();
            redo();
            return;
          case "s":
            event.preventDefault();
            void (event.shiftKey ? saveProjectAs() : saveProject());
            return;
          case "o":
            event.preventDefault();
            void (async () => {
              if (await confirmDiscard("Open another project")) await openProjectFile();
            })();
            return;
          case "n":
            event.preventDefault();
            void (async () => {
              if (await confirmDiscard("Start a new project")) {
                useStudio.getState().resetToDefault();
              }
            })();
            return;
          default:
            break;
        }
      }

      if (typing) {
        if (event.key === "Escape") target?.blur();
        return;
      }

      if (event.key === "Escape") {
        selectPart(null);
        return;
      }

      /* Mode switching on Alt+number keeps the bare digits free for the camera. */
      if (event.altKey) {
        const index = Number(event.key) - 1;
        const mode = MODES[index];
        if (mode) {
          event.preventDefault();
          setMode(mode.id);
        }
        return;
      }

      const view = VIEW_KEYS[event.key];
      if (view) {
        requestView(view);
        return;
      }

      switch (event.key.toLowerCase()) {
        case "g":
          setView({ grid: !useStudio.getState().view.grid });
          break;
        case "d":
          setView({ dimensions: !useStudio.getState().view.dimensions });
          break;
        case "x":
          setView({ xray: !useStudio.getState().view.xray });
          break;
        case "o":
          setView({ doorsOpen: useStudio.getState().view.doorsOpen > 0.02 ? 0 : 1 });
          break;
        case "p":
          setView({
            projection:
              useStudio.getState().view.projection === "perspective"
                ? "orthographic"
                : "perspective",
          });
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setMode, requestView, setView, selectPart]);
}
