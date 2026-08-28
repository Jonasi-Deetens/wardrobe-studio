import { useEffect } from "react";
import { MODES, redo, undo, useStudio, type StandardView } from "../store/useStudio";
import { isDesktop } from "./platform";
import { confirmDiscard, openProjectAt, openProjectFile, saveProject, saveProjectAs } from "./project";

/**
 * The things that only exist once there is a window: a menu bar, a file association, and a
 * close button that does not silently throw away an afternoon's work.
 *
 * The menu is built here rather than in Rust so that each item calls the same function the
 * matching button calls — there is no second copy of "what Save means" to drift out of step.
 * Only modifier accelerators appear in it; see the note in useKeyboard.ts for why bare keys
 * cannot.
 */
export function useDesktopIntegration(): void {
  useEffect(() => {
    if (!isDesktop()) return;

    let dispose: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const [{ Menu, MenuItem, PredefinedMenuItem, Submenu }, { getCurrentWindow }, { listen }] =
        await Promise.all([
          import("@tauri-apps/api/menu"),
          import("@tauri-apps/api/window"),
          import("@tauri-apps/api/event"),
        ]);
      if (cancelled) return;

      const item = (text: string, action: () => void, accelerator?: string) =>
        MenuItem.new({ text, accelerator, action });

      const separator = () => PredefinedMenuItem.new({ item: "Separator" });

      const newProject = async () => {
        if (await confirmDiscard("Start a new project")) useStudio.getState().resetToDefault();
      };
      const open = async () => {
        if (await confirmDiscard("Open another project")) await openProjectFile();
      };

      const fileItems = [
        await item("New project", () => void newProject(), "CmdOrCtrl+N"),
        await item("Open project…", () => void open(), "CmdOrCtrl+O"),
        await separator(),
        await item("Save", () => void saveProject(), "CmdOrCtrl+S"),
        await item("Save as…", () => void saveProjectAs(), "CmdOrCtrl+Shift+S"),
      ];

      /* On macOS the window controls live in the app menu, not the File menu. */
      if (isMac()) {
        fileItems.push(
          await separator(),
          await PredefinedMenuItem.new({ item: "CloseWindow", text: "Close window" }),
        );
      } else {
        fileItems.push(await separator(), await PredefinedMenuItem.new({ item: "Quit", text: "Exit" }));
      }

      const menu = await Menu.new({
        items: [
          /* The application submenu is what gives macOS its About, Hide and Quit items, and
             it has to be first. */
          ...(isMac()
            ? [
                await Submenu.new({
                  text: "Wardrobe Studio",
                  items: [
                    await PredefinedMenuItem.new({
                      item: { About: { name: "Wardrobe Studio" } },
                      text: "About Wardrobe Studio",
                    }),
                    await separator(),
                    await PredefinedMenuItem.new({ item: "Hide" }),
                    await PredefinedMenuItem.new({ item: "HideOthers" }),
                    await separator(),
                    await PredefinedMenuItem.new({ item: "Quit" }),
                  ],
                }),
              ]
            : []),
          await Submenu.new({ text: "File", items: fileItems }),
          await Submenu.new({
            text: "Edit",
            items: [
              await item("Undo", undo, "CmdOrCtrl+Z"),
              await item("Redo", redo, "CmdOrCtrl+Shift+Z"),
              await separator(),
              /* Without these the text fields lose copy and paste on macOS, where those
                 accelerators are delivered by the menu rather than the webview. */
              await PredefinedMenuItem.new({ item: "Cut" }),
              await PredefinedMenuItem.new({ item: "Copy" }),
              await PredefinedMenuItem.new({ item: "Paste" }),
              await PredefinedMenuItem.new({ item: "SelectAll" }),
            ],
          }),
          await Submenu.new({
            text: "View",
            items: [
              /* No accelerators on these: the app already answers Alt+1…5 and the bare view
                 keys, and a menu accelerator would swallow them mid-word in a text field. */
              ...(await Promise.all(
                MODES.map((mode) => item(mode.label, () => useStudio.getState().setMode(mode.id))),
              )),
              await separator(),
              ...(await Promise.all(
                (
                  [
                    ["Front", "front"],
                    ["Left", "left"],
                    ["Right", "right"],
                    ["Back", "back"],
                    ["Top", "top"],
                    ["Isometric", "iso"],
                  ] as const
                ).map(([label, view]) =>
                  item(label, () => useStudio.getState().requestView(view as StandardView)),
                ),
              )),
              await separator(),
              await item("Toggle grid", () =>
                useStudio.getState().setView({ grid: !useStudio.getState().view.grid }),
              ),
              await item("Toggle dimensions", () =>
                useStudio.getState().setView({ dimensions: !useStudio.getState().view.dimensions }),
              ),
              await item("Toggle x-ray", () =>
                useStudio.getState().setView({ xray: !useStudio.getState().view.xray }),
              ),
              await separator(),
              await PredefinedMenuItem.new({ item: "Fullscreen" }),
            ],
          }),
        ],
      });

      await menu.setAsAppMenu();

      /*
       * Double-clicking a .wardrobe file, or dropping one on the icon, arrives as an event
       * from Rust rather than a navigation — the window is already running.
       */
      const unlistenOpen = await listen<string[]>("open-project", (event) => {
        const path = event.payload[0];
        if (!path) return;
        void (async () => {
          if (await confirmDiscard("Open that project")) await openProjectAt(path);
        })();
      });

      /*
       * The window closes once this handler returns; preventing that is what keeps it open.
       * There is no three-button native dialog, so the safe pair is offered instead — nobody
       * can lose work by accident, and saving first is one keystroke away.
       */
      const unlistenClose = await getCurrentWindow().onCloseRequested(async (event) => {
        const { project, cleanProject } = useStudio.getState();
        if (project === cleanProject) return;
        const { ask } = await import("@tauri-apps/plugin-dialog");
        const discard = await ask("This project has unsaved changes. Close anyway?", {
          title: "Unsaved changes",
          kind: "warning",
          okLabel: "Close without saving",
          cancelLabel: "Keep editing",
        });
        if (!discard) event.preventDefault();
      });

      /* A cold start from a double-clicked file has its path waiting in Rust; this is the
         handshake that says the listener above is now attached. */
      const { emit } = await import("@tauri-apps/api/event");
      await emit("app-ready");

      dispose = () => {
        unlistenOpen();
        unlistenClose();
      };
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);
}

function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}
