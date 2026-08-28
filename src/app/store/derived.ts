import { useMemo } from "react";
import {
  adviseProject,
  adviseUnit,
  sortFindings,
  summariseFindings,
  type Finding,
} from "@/engine/advisor";
import { buildAssemblySequence, type AssemblySequence } from "@/engine/assembly";
import type { Member } from "@/engine/core/member";
import type { Part } from "@/engine/core/part";
import { buildCutList, type CutList } from "@/engine/cutlist";
import {
  cutListInputOf,
  scopeProject,
  solveProject,
  type ProjectModel,
  type UnitModel,
} from "@/engine/project";
import { solve, type WardrobeModel } from "@/engine/solver";
import { createDefaultSpec } from "@/engine/spec/defaults";
import type { ProjectSpec } from "@/engine/spec/types";
import { useStudio } from "./useStudio";

/**
 * Everything derived from the project, memoised on its identity.
 *
 * The solver runs on the main thread on purpose: it is a few milliseconds for a wardrobe,
 * and having the model synchronously available is what lets a dragged slider update the 3D
 * view, the warnings and the cut list in the same frame. With several units in the room that
 * only holds because each unit is memoised on its own spec identity inside `solveProject`,
 * so editing one unit does not re-solve the others. Nesting is the one expensive step, and
 * that runs in a worker.
 */

type Derived = {
  readonly project: ProjectModel;
  readonly cutList: CutList;
  readonly findings: readonly Finding[];
  readonly summary: ReturnType<typeof summariseFindings>;
  readonly elapsedMs: number;
};

let cache: { spec: ProjectSpec; derived: Derived } | null = null;

export function deriveAll(spec: ProjectSpec): Derived {
  if (cache && cache.spec === spec) return cache.derived;
  const started = performance.now();
  const project = solveProject(spec);
  const cutList = buildCutList(cutListInputOf(project));
  const findings = sortFindings([
    ...project.units.flatMap((unit) =>
      adviseUnit(unit).map((finding) => ({
        ...finding,
        id: `${unit.id}:${finding.id}`,
        unitId: unit.id,
      })),
    ),
    ...adviseProject(project),
  ]);
  const derived: Derived = {
    project,
    cutList,
    findings,
    summary: summariseFindings(findings),
    elapsedMs: performance.now() - started,
  };
  cache = { spec, derived };
  return derived;
}

export function useDerived(): Derived {
  const spec = useStudio((state) => state.project);
  return useMemo(() => deriveAll(spec), [spec]);
}

export function useProjectModel(): ProjectModel {
  return useDerived().project;
}

/** The unit being edited. A project always has at least one, so this is never null. */
export function useSelectedUnit(): UnitModel {
  const project = useProjectModel();
  const id = useStudio((state) => state.selectedUnitId);
  return project.unitsById.get(id) ?? (project.units[0] as UnitModel);
}

/**
 * The selected unit as a wardrobe.
 *
 * The 3D dimensions, the bay list and the drilling views only know how to show a wardrobe.
 * A unit of another kind falls back to the first wardrobe in the room, and to an untouched
 * default if there is none, so those views never have to render null — they are hidden for
 * other kinds of unit instead.
 */
export function useModel(): WardrobeModel {
  const project = useProjectModel();
  const unit = useSelectedUnit();
  return useMemo(() => {
    if (unit.detail.kind === "wardrobe") return unit.detail.model;
    for (const other of project.units) {
      if (other.detail.kind === "wardrobe") return other.detail.model;
    }
    return fallbackModel();
  }, [project, unit]);
}

let fallback: WardrobeModel | null = null;

function fallbackModel(): WardrobeModel {
  fallback ??= solve(createDefaultSpec());
  return fallback;
}

/** The assembly sequence of the unit being built, which is a per-unit job. */
export function useAssembly(): AssemblySequence {
  const model = useModel();
  return useMemo(() => buildAssemblySequence(model), [model]);
}

export function useSelectedPart() {
  const project = useProjectModel();
  const id = useStudio((state) => state.selectedPartId);
  return id ? (project.partsById.get(id) ?? null) : null;
}

/* --------------------------------------------------- narrowing to one unit - */

/**
 * The output views read the whole room by default and can be narrowed to one unit.
 *
 * Narrowing rebuilds the cut list rather than filtering its rows, because a row is an
 * aggregate: two identical panels in two units are one row of quantity 2, and dropping a
 * unit has to take its share of that quantity, its sheet count and its cost with it.
 */
export type UnitScope = {
  /** Null for the whole room. */
  readonly unitId: string | null;
  /** The project narrowed to that unit, which is what the exports are built from. */
  readonly project: ProjectModel;
  readonly units: readonly UnitModel[];
  readonly parts: readonly Part[];
  readonly members: readonly Member[];
  readonly cutList: CutList;
};

export function useUnitScope(): UnitScope {
  const derived = useDerived();
  const filter = useStudio((state) => state.unitFilter);
  return useMemo(() => {
    const whole = derived.project;
    const scoped = scopeProject(whole, filter);
    if (scoped === whole) {
      return {
        unitId: null,
        project: whole,
        units: whole.units,
        parts: whole.parts,
        members: whole.members,
        cutList: derived.cutList,
      };
    }
    return {
      unitId: filter,
      project: scoped,
      units: scoped.units,
      parts: scoped.parts,
      members: scoped.members,
      cutList: buildCutList(cutListInputOf(scoped)),
    };
  }, [derived, filter]);
}
