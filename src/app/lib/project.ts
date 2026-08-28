import { serialiseSpec } from "@/engine/spec/migrate";
import { useStudio } from "../store/useStudio";
import {
  isDesktop,
  openProject as pickProject,
  readProjectAt,
  saveFile,
  writeProjectAt,
} from "./platform";

/**
 * Open, Save and Save As against a `.wardrobe` file.
 *
 * These are module functions rather than a hook because three different things trigger
 * them — a button, a keyboard shortcut and the native menu, which arrives as an event from
 * Rust with no React context to hand. They read the store directly and are safe to call
 * from anywhere. Components subscribe to `filePath` and `cleanSpec` for the title and the
 * dirty marker instead.
 */

export const PROJECT_EXTENSION = "wardrobe";

/** What the window and the top bar call the current project. */
export function projectFileName(): string {
  const { filePath, project } = useStudio.getState();
  if (filePath) {
    const parts = filePath.split(/[\\/]/);
    return parts[parts.length - 1] || filePath;
  }
  return `${suggestedStem(project.meta.name)}.${PROJECT_EXTENSION}`;
}

function suggestedStem(name: string): string {
  const trimmed = name.trim() || "wardrobe";
  return trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "wardrobe";
}

/**
 * Save to the file this project came from, or ask where to put it the first time.
 *
 * In the browser there is never a known path, so this is always the download it has always
 * been; on the desktop it only prompts once, which is the whole point of a project file.
 */
export async function saveProject(): Promise<boolean> {
  const { filePath, markFile, addNotices } = useStudio.getState();
  if (!filePath) return saveProjectAs();

  const outcome = await writeProjectAt(filePath, serialiseSpec(useStudio.getState().project));
  if (outcome.kind === "failed") {
    addNotices([`Could not save to ${filePath}: ${outcome.reason}`]);
    return false;
  }
  markFile(filePath);
  return true;
}

export async function saveProjectAs(): Promise<boolean> {
  const { markFile, addNotices, project } = useStudio.getState();
  const outcome = await saveFile({
    suggestedName: `${suggestedStem(project.meta.name)}.${PROJECT_EXTENSION}`,
    kind: "project",
    contents: serialiseSpec(project),
  });

  if (outcome.kind === "cancelled") return false;
  if (outcome.kind === "failed") {
    addNotices([`Could not save the project: ${outcome.reason}`]);
    return false;
  }
  /* A browser download reports no path, so only the "this is saved" half is recorded: the
     dirty marker clears, and a later Save downloads a fresh copy rather than overwriting. */
  markFile(outcome.path);
  return true;
}

/**
 * Opens a project.
 *
 * The browser hands us a `File` from an `<input>`, the desktop opens its own dialog, and
 * the file association calls `openProjectAt` instead.
 */
export async function openProjectFile(file?: File): Promise<boolean> {
  const { addNotices } = useStudio.getState();
  const outcome = await pickProject(file);
  if (outcome.kind === "cancelled") return false;
  if (outcome.kind === "failed") {
    addNotices([`Could not read that project: ${outcome.reason}`]);
    return false;
  }
  return apply(outcome.text, outcome.path);
}

/** Opens a path the OS gave us, from a file association or a command-line argument. */
export async function openProjectAt(path: string): Promise<boolean> {
  const outcome = await readProjectAt(path);
  if (outcome.kind !== "opened") {
    if (outcome.kind === "failed") {
      useStudio.getState().addNotices([`Could not open ${path}: ${outcome.reason}`]);
    }
    return false;
  }
  return apply(outcome.text, outcome.path);
}

function apply(text: string, path: string | null): boolean {
  const { loadJson, markFile } = useStudio.getState();
  /* loadJson reports its own repairs, clears the undo history and resets the file, so the
     path is recorded after it rather than before. */
  const result = loadJson(text);
  if (!result.ok) return false;
  if (path) markFile(path);
  return true;
}

/**
 * Whether unsaved work would be lost, and a prompt if so.
 *
 * Only the desktop asks: in the browser the autosave in IndexedDB means nothing is actually
 * lost by opening something else, and a `confirm()` on top of a file picker is noise.
 */
export async function confirmDiscard(action: string): Promise<boolean> {
  const { project, cleanProject } = useStudio.getState();
  if (project === cleanProject) return true;
  if (!isDesktop()) return true;

  try {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    return await ask(`This project has unsaved changes. ${action} anyway?`, {
      title: "Unsaved changes",
      kind: "warning",
      okLabel: action,
      cancelLabel: "Cancel",
    });
  } catch {
    return true;
  }
}
