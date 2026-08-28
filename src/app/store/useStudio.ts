import { useMemo } from "react";
import { create } from "zustand";
import { temporal } from "zundo";
import { useStore } from "zustand";
import type { PartRole } from "@/engine/core/part";
import {
  createDefaultProject,
  createDefaultUnit,
  nextUnitId,
  placeUnit,
  unitOfWardrobe,
} from "@/engine/spec/defaults";
import { loadSpec, serialiseSpec } from "@/engine/spec/migrate";
import {
  removeNode,
  replaceNode,
  updateChildSize,
  wardrobeSpecOf,
  type Fitting,
  type LayoutNode,
  type ProjectSpec,
  type RoomSpec,
  type UnitPlacement,
  type UnitSpec,
  type WardrobeSpec,
  type WardrobeUnitSpec,
  type WorkTableSpec,
} from "@/engine/spec/types";
import { setAtPath, type Path } from "./paths";

/**
 * The whole application state. The project is the only thing that is persisted, shared or
 * undone; everything else — the models, the cut list, the drawings — is derived from it,
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
  /** Draw the room around the units: floor, walls, roof. */
  readonly showRoom: boolean;
  readonly showRoof: boolean;
  /** Show only the selected unit, so a crowded room can be worked on one unit at a time. */
  readonly isolateUnit: boolean;
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
  showRoom: true,
  showRoof: false,
  isolateUnit: false,
};

/**
 * Everything the parameter panel can read through one object: the selected unit with the
 * project's own sections folded in, plus the room.
 *
 * The panel addresses values by path, and a path is either a unit's (`carcase.width`) or
 * the project's (`production.kerf`, `room.depth`). Resolving both against one object means
 * the ~70 descriptors did not have to learn that a project holds several units.
 */
/**
 * One object the parameter panel can read every value out of.
 *
 * Every parameter is read by path rather than by property, so what this has to provide is
 * a root where both the project's paths and the selected unit's resolve. A default wardrobe
 * stands behind whatever the unit actually is, so a wardrobe path reads as the default
 * rather than throwing on the way to a control that is not on screen, and the unit's own
 * sections are laid over the top.
 *
 * It is typed as a wardrobe because that is the shape the `when` predicates share. A
 * predicate that needs a table's or a counter's own fields reads them through `asTable` or
 * `asCounter` in the descriptors, which is sound because the panel has already filtered
 * that parameter down to the kind it belongs to.
 */
export type EditingSpec = WardrobeSpec & { readonly room: RoomSpec };

/** Paths that start with one of these belong to the project, not to a unit. */
const PROJECT_ROOTS: ReadonlySet<string> = new Set([
  "meta",
  "room",
  "production",
  "units",
  "version",
]);

export function isProjectPath(path: Path): boolean {
  const head = path[0];
  return typeof head === "string" && PROJECT_ROOTS.has(head);
}

export type StudioState = {
  readonly project: ProjectSpec;
  readonly selectedUnitId: string;
  /**
   * Which unit the output views are narrowed to, or null for the whole room.
   *
   * Separate from the selected unit on purpose: you edit one unit while reading the cut
   * list for everything, because that is the list you take to the merchant.
   */
  readonly unitFilter: string | null;
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
   * The project as it was last written to or read from that file.
   *
   * Projects are immutable and replaced wholesale on every edit, so comparing references is
   * all "has this changed since it was saved" needs — no deep compare, no dirty flag to
   * keep in step with the edits.
   */
  readonly cleanProject: ProjectSpec;

  readonly setMode: (mode: Mode) => void;
  readonly setValue: (path: Path, value: unknown) => void;
  readonly setProject: (project: ProjectSpec, notices?: readonly string[]) => void;
  readonly resetToDefault: () => void;
  readonly loadPreset: (project: ProjectSpec, name: string) => void;
  readonly loadJson: (json: string) => { ok: boolean; notices: readonly string[] };
  readonly toJson: () => string;

  /* Units. */
  readonly selectUnit: (id: string) => void;
  readonly addUnit: (unit: UnitSpec, name: string) => void;
  readonly duplicateUnit: (id: string) => void;
  readonly renameUnit: (id: string, name: string) => void;
  readonly removeUnit: (id: string) => void;
  readonly moveUnit: (id: string, at: Partial<UnitPlacement["at"]>) => void;
  readonly setUnitFilter: (id: string | null) => void;

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
  /** Records that the current project is now what sits in `path`. */
  readonly markFile: (path: string | null) => void;
};

/** Parameter groups that start open: the ones nearly every design touches. */
const INITIAL_GROUPS = ["carcase-size", "layout", "doors"];

const INITIAL_PROJECT = createDefaultProject();

/* ------------------------------------------------------------ unit access - */

export function unitIndexOf(project: ProjectSpec, id: string): number {
  return project.units.findIndex((placed) => placed.id === id);
}

/** The selected unit, falling back to the first so this can never be undefined. */
export function placementOf(project: ProjectSpec, id: string): UnitPlacement {
  const found = project.units.find((placed) => placed.id === id);
  return found ?? (project.units[0] as UnitPlacement);
}

/**
 * The selected unit resolved for the parameter panel. A unit that is not a wardrobe still
 * has to produce something readable, so the default wardrobe stands in for the sections it
 * does not have; the panel only shows the groups that apply to the unit's kind.
 */
export function editingSpecOf(project: ProjectSpec, unitId: string): EditingSpec {
  const placed = placementOf(project, unitId);
  const wardrobe: WardrobeUnitSpec =
    placed.unit.kind === "wardrobe" ? placed.unit : createDefaultUnit();
  const base = { ...wardrobeSpecOf(project, wardrobe, placed.name), room: project.room };
  if (placed.unit.kind === "wardrobe") return base;
  const { kind: _kind, ...own } = placed.unit;
  return { ...base, ...own } as EditingSpec;
}

/** The spec the parameter panel reads and writes, memoised so controls do not rerender. */
export function useEditingSpec(): EditingSpec {
  const project = useStudio((state) => state.project);
  const unitId = useStudio((state) => state.selectedUnitId);
  return useMemo(() => editingSpecOf(project, unitId), [project, unitId]);
}

function mapUnit(
  project: ProjectSpec,
  unitId: string,
  update: (placed: UnitPlacement) => UnitPlacement,
): ProjectSpec {
  const index = unitIndexOf(project, unitId);
  if (index < 0) return project;
  const units = project.units.map((placed, at) => (at === index ? update(placed) : placed));
  return { ...project, units };
}

/** Edits the selected unit's wardrobe sections, leaving every other unit untouched. */
function mapWardrobe(
  state: StudioState,
  update: (unit: WardrobeUnitSpec) => WardrobeUnitSpec,
): ProjectSpec {
  return mapUnit(state.project, state.selectedUnitId, (placed) =>
    placed.unit.kind === "wardrobe" ? { ...placed, unit: update(placed.unit) } : placed,
  );
}

/** How wide a unit is, without solving it. Enough to find it somewhere to stand. */
export function nominalWidthOf(unit: UnitSpec): number {
  return unit.kind === "wardrobe" ? unit.carcase.width : unit.width;
}

/** Somewhere to stand a new unit: to the right of everything already in the room. */
function nextFreeSpot(project: ProjectSpec): { x: number; z: number } {
  const rightEdge = project.units.reduce(
    (max, placed) => Math.max(max, placed.at.x + nominalWidthOf(placed.unit)),
    0,
  );
  return { x: rightEdge + 100, z: 0 };
}

export const useStudio = create<StudioState>()(
  temporal(
    (set, get) => ({
      project: INITIAL_PROJECT,
      selectedUnitId: INITIAL_PROJECT.units[0]?.id ?? "u1",
      unitFilter: null,
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
      cleanProject: INITIAL_PROJECT,

      setMode: (mode) => set({ mode }),

      /* A path either names something on the project — the room, the shop's production
         settings, the project name — or something on the unit being edited. */
      setValue: (path, value) =>
        set((state) => {
          if (isProjectPath(path)) {
            return { project: setAtPath(state.project, path, value) };
          }
          const index = unitIndexOf(state.project, state.selectedUnitId);
          if (index < 0) return {};
          return {
            project: setAtPath(state.project, ["units", index, "unit", ...path], value),
          };
        }),

      setProject: (project, notices = []) =>
        set((state) => ({
          project,
          notices,
          selectedUnitId:
            unitIndexOf(project, state.selectedUnitId) >= 0
              ? state.selectedUnitId
              : (project.units[0]?.id ?? "u1"),
          unitFilter: null,
          selectedPartId: null,
          hoveredPartId: null,
          hoveredPartIds: [],
          selectedBayId: null,
        })),

      /* The way out of a design the engine cannot solve. Selections are cleared with
         it, since they point at parts that are about to stop existing. */
      resetToDefault: () => {
        const project = createDefaultProject();
        get().setProject(project, ["Started again from the default project."]);
        set({ filePath: null, cleanProject: project });
        clearHistory();
      },

      /* A preset replaces the project, so the history goes with it — undoing back into
         the design you just abandoned produces something nobody asked for. */
      loadPreset: (project, name) => {
        get().setProject(project, [`Loaded the “${name}” preset. Undo history was cleared.`]);
        /* A preset is a starting point, not a document: it has no file of its own, and
           saving it must not overwrite whatever was open before. */
        set({ filePath: null, cleanProject: project });
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
          get().setProject(result.spec, result.repairs);
          /* Loading does not know where the text came from — the caller records the path
             afterwards with markFile — so until then this is an unsaved project. */
          set({ filePath: null, cleanProject: result.spec });
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

      toJson: () => serialiseSpec(get().project),

      /* ------------------------------------------------------------- units - */

      selectUnit: (id) =>
        set((state) => ({
          selectedUnitId: id,
          selectedBayId: null,
          selectedPartId:
            state.selectedPartId?.startsWith(`${id}:`) === true ? state.selectedPartId : null,
        })),

      addUnit: (unit, name) =>
        set((state) => {
          const placed = placeUnit(unit, name, nextFreeSpot(state.project));
          return {
            project: { ...state.project, units: [...state.project.units, placed] },
            selectedUnitId: placed.id,
            selectedBayId: null,
          };
        }),

      duplicateUnit: (id) =>
        set((state) => {
          const source = state.project.units.find((placed) => placed.id === id);
          if (!source) return {};
          const copy = placeUnit(
            source.unit,
            `${source.name} copy`,
            nextFreeSpot(state.project),
          );
          return {
            project: { ...state.project, units: [...state.project.units, copy] },
            selectedUnitId: copy.id,
            selectedBayId: null,
          };
        }),

      renameUnit: (id, name) =>
        set((state) => ({
          project: mapUnit(state.project, id, (placed) => ({ ...placed, name })),
        })),

      removeUnit: (id) =>
        set((state) => {
          if (state.project.units.length <= 1) {
            return { notices: ["A project needs at least one unit in it."] };
          }
          const units = state.project.units.filter((placed) => placed.id !== id);
          return {
            project: { ...state.project, units },
            selectedUnitId:
              state.selectedUnitId === id ? (units[0]?.id ?? "u1") : state.selectedUnitId,
            unitFilter: state.unitFilter === id ? null : state.unitFilter,
            selectedPartId: null,
            selectedBayId: null,
          };
        }),

      moveUnit: (id, at) =>
        set((state) => ({
          project: mapUnit(state.project, id, (placed) => ({
            ...placed,
            at: { ...placed.at, ...at },
          })),
        })),

      setUnitFilter: (unitFilter) => set({ unitFilter }),

      /* ------------------------------------------------------------ layout - */

      replaceLayoutNode: (id, node) =>
        set((state) => ({
          project: mapWardrobe(state, (unit) => ({
            ...unit,
            layout: replaceNode(unit.layout, id, node),
          })),
        })),

      removeLayoutNode: (id) =>
        set((state) => ({
          project: mapWardrobe(state, (unit) => ({
            ...unit,
            layout: removeNode(unit.layout, id),
          })),
          selectedBayId: state.selectedBayId === id ? null : state.selectedBayId,
        })),

      setChildSize: (nodeId, size) =>
        set((state) => ({
          project: mapWardrobe(state, (unit) => ({
            ...unit,
            layout: updateChildSize(unit.layout, nodeId, size),
          })),
        })),

      setFitting: (bayId, fitting) =>
        set((state) => ({
          project: mapWardrobe(state, (unit) => ({
            ...unit,
            layout: mapBay(unit.layout, bayId, (bay) => ({ ...bay, fitting })),
          })),
        })),

      selectPart: (id) =>
        set((state) => {
          const unitId = id?.includes(":") ? (id.split(":")[0] as string) : null;
          return {
            selectedPartId: id,
            selectedUnitId: unitId ?? state.selectedUnitId,
          };
        }),

      openPanelFor: (id) => {
        get().selectPart(id);
        set({ mode: "panel", selectedFace: "A" });
      },

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

      markFile: (filePath) => set((state) => ({ filePath, cleanProject: state.project })),
    }),
    {
      /* Only the project is undoable. Undoing a camera move or a mode switch would be
         surprising, and worse, it would bury the edit you actually wanted back. */
      partialize: (state) => ({ project: state.project }),
      limit: 120,
      equality: (past, next) => past.project === next.project,
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

/** A fresh unit id, for callers building a placement themselves. */
export { nextUnitId };

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
