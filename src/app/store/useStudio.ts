import { create } from "zustand";
import { temporal } from "zundo";
import { useStore } from "zustand";
import type { PartRole } from "@/engine/core/part";
import { createDefaultSpec } from "@/engine/spec/defaults";
import { loadSpec, serialiseSpec } from "@/engine/spec/migrate";
import {
  removeNode,
  replaceNode,
  updateChildSize,
  type Fitting,
  type LayoutNode,
  type WardrobeSpec,
} from "@/engine/spec/types";
import { setAtPath, type Path } from "./paths";

/**
 * The whole application state. The spec is the only thing that is persisted, shared or
 * undone; everything else — the model, the cut list, the drawings — is derived from it,
 * which is why there is no cache to invalidate here.
 */

export type Mode = "design" | "parts" | "nesting" | "panel" | "export";

export const MODES: readonly { id: Mode; label: string; hint: string }[] = [
  { id: "design", label: "Design", hint: "3D model and parameters" },
  { id: "parts", label: "Parts", hint: "Cut list and hardware" },
  { id: "nesting", label: "Nesting", hint: "Sheet layouts" },
  { id: "panel", label: "Panel", hint: "Drilling drawing" },
  { id: "export", label: "Export", hint: "PDF, DXF, CSV" },
];

export type StandardView = "front" | "back" | "left" | "right" | "top" | "iso";

export type ViewState = {
  readonly projection: "perspective" | "orthographic";
  /** Bumped on every request so asking for the current view again still moves the camera. */
  readonly viewRequest: { readonly view: StandardView; readonly nonce: number } | null;
  readonly grid: boolean;
  readonly dimensions: boolean;
  readonly xray: boolean;
  /** 0 assembled, 1 fully exploded. */
  readonly explode: number;
  /** 0 shut, 1 open. */
  readonly doorsOpen: number;
  readonly showDoors: boolean;
  readonly showBack: boolean;
  /** Rails, handles, hinges and the joint fixings, as opposed to the panels. */
  readonly showHardware: boolean;
  readonly isolateRole: PartRole | null;
};

const DEFAULT_VIEW: ViewState = {
  projection: "perspective",
  viewRequest: null,
  grid: true,
  dimensions: true,
  xray: false,
  explode: 0,
  doorsOpen: 0,
  showDoors: true,
  showBack: true,
  showHardware: true,
  isolateRole: null,
};

export type StudioState = {
  readonly spec: WardrobeSpec;
  readonly mode: Mode;
  readonly view: ViewState;
  readonly selectedPartId: string | null;
  readonly hoveredPartId: string | null;
  /** Cut list row under the cursor; highlights every part the row stands for. */
  readonly hoveredPartIds: readonly string[];
  readonly selectedFace: "A" | "B";
  readonly search: string;
  readonly openGroups: readonly string[];
  readonly selectedBayId: string | null;
  /** Repairs reported by the loader, shown once then dismissed. */
  readonly notices: readonly string[];
  readonly savedAt: number | null;
  /** Where this project lives on disk. Desktop only; the browser has no path. */
  readonly filePath: string | null;
  /**
   * The spec as it was last written to or read from that file.
   *
   * Specs are immutable and replaced wholesale on every edit, so comparing references is
   * all "has this changed since it was saved" needs — no deep compare, no dirty flag to
   * keep in step with the edits.
   */
  readonly cleanSpec: WardrobeSpec;

  readonly setMode: (mode: Mode) => void;
  readonly setValue: (path: Path, value: unknown) => void;
  readonly setSpec: (spec: WardrobeSpec, notices?: readonly string[]) => void;
  readonly resetToDefault: () => void;
  readonly loadPreset: (spec: WardrobeSpec, name: string) => void;
  readonly loadJson: (json: string) => { ok: boolean; notices: readonly string[] };
  readonly toJson: () => string;
  readonly replaceLayoutNode: (id: string, node: LayoutNode) => void;
  readonly removeLayoutNode: (id: string) => void;
  readonly setChildSize: (nodeId: string, size: number | null) => void;
  readonly setFitting: (bayId: string, fitting: Fitting) => void;
  readonly selectPart: (id: string | null) => void;
  readonly openPanelFor: (id: string) => void;
  readonly hoverPart: (id: string | null) => void;
  readonly hoverParts: (ids: readonly string[]) => void;
  readonly setFace: (face: "A" | "B") => void;
  readonly selectBay: (id: string | null) => void;
  readonly setView: (patch: Partial<ViewState>) => void;
  readonly requestView: (view: StandardView) => void;
  readonly setSearch: (search: string) => void;
  readonly toggleGroup: (id: string) => void;
  readonly setOpenGroups: (ids: readonly string[]) => void;
  readonly addNotices: (notices: readonly string[]) => void;
  readonly dismissNotices: () => void;
  readonly markSaved: (at: number) => void;
  /** Records that the current spec is now what sits in `path`. */
  readonly markFile: (path: string | null) => void;
};

/** Parameter groups that start open: the ones nearly every design touches. */
const INITIAL_GROUPS = ["carcase-size", "layout", "doors"];

const INITIAL_SPEC = createDefaultSpec();

export const useStudio = create<StudioState>()(
  temporal(
    (set, get) => ({
      spec: INITIAL_SPEC,
      mode: "design",
      view: DEFAULT_VIEW,
      selectedPartId: null,
      hoveredPartId: null,
      hoveredPartIds: [],
      selectedFace: "A",
      search: "",
      openGroups: INITIAL_GROUPS,
      selectedBayId: null,
      notices: [],
      savedAt: null,
      filePath: null,
      cleanSpec: INITIAL_SPEC,

      setMode: (mode) => set({ mode }),

      setValue: (path, value) =>
        set((state) => ({ spec: setAtPath(state.spec, path, value) })),

      setSpec: (spec, notices = []) =>
        set({ spec, notices, selectedPartId: null, hoveredPartId: null, hoveredPartIds: [] }),

      /* The way out of a design the engine cannot solve. Selections are cleared with
         it, since they point at parts that are about to stop existing. */
      resetToDefault: () => {
        const spec = createDefaultSpec();
        get().setSpec(spec, ["Started again from the default wardrobe."]);
        set({ filePath: null, cleanSpec: spec });
        clearHistory();
      },

      /* A preset replaces the project, so the history goes with it — undoing back into
         the design you just abandoned produces something nobody asked for. */
      loadPreset: (spec, name) => {
        get().setSpec(spec, [`Loaded the “${name}” preset. Undo history was cleared.`]);
        /* A preset is a starting point, not a document: it has no file of its own, and
           saving it must not overwrite whatever was open before. */
        set({ filePath: null, cleanSpec: spec });
        clearHistory();
      },

      loadJson: (json) => {
        try {
          const parsed: unknown = JSON.parse(json);
          const result = loadSpec(parsed);
          if (result.fatal.length > 0) {
            set({ notices: result.fatal });
            return { ok: false, notices: result.fatal };
          }
          get().setSpec(result.spec, result.repairs);
          /* Loading does not know where the text came from — the caller records the path
             afterwards with markFile — so until then this is an unsaved project. */
          set({ filePath: null, cleanSpec: result.spec });
          /* A different project is a different history. Without this, undo walks back
             into the previous one and produces a design that was never opened. */
          clearHistory();
          return { ok: true, notices: result.repairs };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unreadable file";
          set({ notices: [`Could not read that project: ${message}`] });
          return { ok: false, notices: [message] };
        }
      },

      toJson: () => serialiseSpec(get().spec),

      replaceLayoutNode: (id, node) =>
        set((state) => ({ spec: { ...state.spec, layout: replaceNode(state.spec.layout, id, node) } })),

      removeLayoutNode: (id) =>
        set((state) => ({
          spec: { ...state.spec, layout: removeNode(state.spec.layout, id) },
          selectedBayId: state.selectedBayId === id ? null : state.selectedBayId,
        })),

      setChildSize: (nodeId, size) =>
        set((state) => ({
          spec: { ...state.spec, layout: updateChildSize(state.spec.layout, nodeId, size) },
        })),

      setFitting: (bayId, fitting) =>
        set((state) => ({
          spec: {
            ...state.spec,
            layout: mapBay(state.spec.layout, bayId, (bay) => ({ ...bay, fitting })),
          },
        })),

      selectPart: (id) => set({ selectedPartId: id }),

      openPanelFor: (id) => set({ selectedPartId: id, mode: "panel", selectedFace: "A" }),

      hoverPart: (id) => set({ hoveredPartId: id }),

      hoverParts: (ids) => set({ hoveredPartIds: ids }),

      setFace: (selectedFace) => set({ selectedFace }),

      selectBay: (selectedBayId) => set({ selectedBayId }),

      setView: (patch) => set((state) => ({ view: { ...state.view, ...patch } })),

      requestView: (view) =>
        set((state) => ({
          view: {
            ...state.view,
            viewRequest: { view, nonce: (state.view.viewRequest?.nonce ?? 0) + 1 },
          },
        })),

      setSearch: (search) => set({ search }),

      toggleGroup: (id) =>
        set((state) => ({
          openGroups: state.openGroups.includes(id)
            ? state.openGroups.filter((group) => group !== id)
            : [...state.openGroups, id],
        })),

      setOpenGroups: (ids) => set({ openGroups: [...ids] }),

      addNotices: (notices) =>
        set((state) => ({
          notices: [...state.notices, ...notices.filter((n) => !state.notices.includes(n))],
        })),

      dismissNotices: () => set({ notices: [] }),

      markSaved: (savedAt) => set({ savedAt }),

      markFile: (filePath) => set((state) => ({ filePath, cleanSpec: state.spec })),
    }),
    {
      /* Only the spec is undoable. Undoing a camera move or a mode switch would be
         surprising, and worse, it would bury the edit you actually wanted back. */
      partialize: (state) => ({ spec: state.spec }),
      limit: 120,
      equality: (past, next) => past.spec === next.spec,
      /* Dragging a slider fires dozens of sets; collapse them into one undo entry
         unless the user pauses, which is the natural boundary for an edit. */
      handleSet: (handleSet) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let pending: Parameters<typeof handleSet>[0] | undefined;
        return (...args) => {
          if (pending === undefined) pending = args[0];
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            if (pending !== undefined) handleSet(pending);
            pending = undefined;
            timer = undefined;
          }, 320);
        };
      },
    },
  ),
);

function mapBay(
  node: LayoutNode,
  bayId: string,
  update: (bay: Extract<LayoutNode, { kind: "bay" }>) => LayoutNode,
): LayoutNode {
  if (node.kind === "bay") return node.id === bayId ? update(node) : node;
  return {
    ...node,
    children: node.children.map((child) => ({ ...child, node: mapBay(child.node, bayId, update) })),
  };
}

/* ------------------------------------------------------------- undo / redo - */

export function useTemporal<T>(selector: (state: TemporalState) => T): T {
  return useStore(useStudio.temporal, selector);
}

type TemporalState = {
  pastStates: unknown[];
  futureStates: unknown[];
  undo: (steps?: number) => void;
  redo: (steps?: number) => void;
  clear: () => void;
};

export const undo = (): void => {
  (useStudio.temporal.getState() as unknown as TemporalState).undo();
};

export const redo = (): void => {
  (useStudio.temporal.getState() as unknown as TemporalState).redo();
};

export const clearHistory = (): void => {
  (useStudio.temporal.getState() as unknown as TemporalState).clear();
};
