import { copyToClipboard, downloadBytes, downloadCsv, downloadText } from "./download";

/**
 * The four things a browser and a desktop app disagree about.
 *
 * Everything else in Wardrobe Studio — the solver, the drawing renderer, both workers, the
 * whole UI — is identical on both targets. Only saving, opening, the clipboard and printing
 * need to know where they are running, so they are the only things behind this seam. Call
 * sites get one async function each and never test for the platform themselves.
 *
 * The Tauri modules are imported lazily. In a browser build they end up in a chunk that is
 * never fetched, and nothing throws when the plugins are absent.
 */

/** Tauri 2 injects this before any application code runs. */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type FileKind = "project" | "csv" | "pdf" | "dxf" | "zip" | "svg";

type FileType = {
  readonly label: string;
  readonly extensions: readonly string[];
  readonly mime: string;
};

const FILE_TYPES: Record<FileKind, FileType> = {
  project: {
    label: "Wardrobe project",
    extensions: ["wardrobe", "json"],
    mime: "application/json",
  },
  csv: { label: "Comma-separated values", extensions: ["csv"], mime: "text/csv" },
  pdf: { label: "PDF document", extensions: ["pdf"], mime: "application/pdf" },
  dxf: { label: "DXF drawing", extensions: ["dxf"], mime: "application/dxf" },
  zip: { label: "ZIP archive", extensions: ["zip"], mime: "application/zip" },
  svg: { label: "SVG drawing", extensions: ["svg"], mime: "image/svg+xml" },
};

export type SaveRequest = {
  readonly suggestedName: string;
  readonly kind: FileKind;
  readonly contents: string | Uint8Array;
};

/**
 * Where a save ended up, or why it did not.
 *
 * The browser cannot report either: the download is handed to the browser and the page is
 * not told what happened to it. So `path` is null there, and "cancelled" only ever comes
 * back from a real dialog.
 */
export type SaveOutcome =
  | { readonly kind: "saved"; readonly path: string | null }
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly reason: string };

export async function saveFile(request: SaveRequest): Promise<SaveOutcome> {
  const type = FILE_TYPES[request.kind];

  if (!isDesktop()) {
    if (typeof request.contents === "string") {
      if (request.kind === "csv") downloadCsv(request.suggestedName, request.contents);
      else downloadText(request.suggestedName, request.contents, type.mime);
    } else {
      downloadBytes(request.suggestedName, request.contents, type.mime);
    }
    return { kind: "saved", path: null };
  }

  try {
    const [{ save }, { writeFile, writeTextFile }] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/plugin-fs"),
    ]);

    const path = await save({
      defaultPath: request.suggestedName,
      filters: [{ name: type.label, extensions: [...type.extensions] }],
    });
    if (!path) return { kind: "cancelled" };

    /* The dialog plugin adds the chosen path to the filesystem scope as the user picks it,
       which is why writing to an arbitrary location needs no static permission. */
    if (typeof request.contents === "string") {
      /* Excel on a non-UTF-8 locale mangles accents and the millimetre sign without a
         byte-order mark, and the shop office is exactly where that happens. */
      await writeTextFile(path, request.kind === "csv" ? `\uFEFF${request.contents}` : request.contents);
    } else {
      await writeFile(path, request.contents);
    }
    return { kind: "saved", path };
  } catch (error) {
    return { kind: "failed", reason: message(error) };
  }
}

export type OpenOutcome =
  | { readonly kind: "opened"; readonly name: string; readonly text: string; readonly path: string | null }
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly reason: string };

/**
 * Picks a project file and reads it.
 *
 * The browser half builds its own throwaway `<input type="file">` rather than expecting one
 * in the tree, so opening a project works from a button, a shortcut or a menu without any
 * component having to be mounted. Nothing is awaited before `click()`, which is what keeps
 * the user gesture intact — browsers refuse to show the picker otherwise.
 */
export async function openProject(file?: File): Promise<OpenOutcome> {
  if (!isDesktop()) {
    const picked = file ?? (await pickFileInBrowser());
    if (!picked) return { kind: "cancelled" };
    try {
      return { kind: "opened", name: picked.name, text: await picked.text(), path: null };
    } catch (error) {
      return { kind: "failed", reason: message(error) };
    }
  }

  try {
    const [{ open }, { readTextFile }] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/plugin-fs"),
    ]);
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: FILE_TYPES.project.label,
          extensions: [...FILE_TYPES.project.extensions],
        },
      ],
    });
    if (!picked || Array.isArray(picked)) return { kind: "cancelled" };
    return {
      kind: "opened",
      name: basename(picked),
      text: await readTextFile(picked),
      path: picked,
    };
  } catch (error) {
    return { kind: "failed", reason: message(error) };
  }
}

/** Reads a project the OS handed us, from a file association or a command-line argument. */
export async function readProjectAt(path: string): Promise<OpenOutcome> {
  try {
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    return { kind: "opened", name: basename(path), text: await readTextFile(path), path };
  } catch (error) {
    return { kind: "failed", reason: message(error) };
  }
}

/** Writes over a file the user has already chosen, for Save against a known path. */
export async function writeProjectAt(path: string, text: string): Promise<SaveOutcome> {
  try {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(path, text);
    return { kind: "saved", path };
  } catch (error) {
    return { kind: "failed", reason: message(error) };
  }
}

export async function copyText(text: string): Promise<boolean> {
  if (!isDesktop()) return copyToClipboard(text);
  try {
    /* The macOS webview is served over a custom scheme, which is not a secure context, so
       navigator.clipboard is unavailable there even though it works on Windows. */
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(text);
    return true;
  } catch {
    return copyToClipboard(text);
  }
}

/** True when `revealFile` will do something, so the UI can decide whether to offer it. */
export function canReveal(): boolean {
  return isDesktop();
}

export async function revealFile(path: string): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    await revealItemInDir(path);
  } catch {
    // Showing the file is a courtesy; the export itself already succeeded.
  }
}

/**
 * Whether the current webview can actually print.
 *
 * `window.print()` is implemented in WebView2 but not in WKWebView, and is unreliable in
 * WebKitGTK — so on the desktop the drawing is written out as a print-themed SVG and the
 * containing folder is opened instead. Every desktop OS prints an SVG from its default
 * viewer, and it comes from the same renderer as the screen and the PDF, so it cannot
 * disagree with them.
 */
export function canPrintInPlace(): boolean {
  return !isDesktop();
}

/**
 * Where a share link should point.
 *
 * A desktop window is served from `tauri://localhost`, so a link built against its own
 * location opens nothing on anybody else's machine. The desktop build therefore needs to be
 * told the address of the hosted version at build time; without it, there is no honest link
 * to hand out and the UI offers to save a copy of the project instead.
 */
const configuredWebUrl = ((import.meta.env.VITE_WEB_APP_URL as string | undefined) ?? "")
  .trim()
  .replace(/\/+$/, "");

export function canShareLink(): boolean {
  return !isDesktop() || configuredWebUrl.length > 0;
}

export function shareBaseUrl(): string {
  if (isDesktop()) return configuredWebUrl;
  return `${window.location.origin}${window.location.pathname}`;
}

function pickFileInBrowser(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".wardrobe,.json,application/json";
    input.style.display = "none";
    let settled = false;
    const finish = (value: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null));
    /* Not every browser fires `cancel`; the promise simply never settles there, which the
       callers treat the same as a cancel because nothing further happens. */
    input.addEventListener("cancel", () => finish(null));
    document.body.append(input);
    input.click();
  });
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "unknown error";
}
