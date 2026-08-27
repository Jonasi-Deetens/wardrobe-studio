import { useMemo } from "react";
import { advise, summariseFindings, type Finding } from "@/engine/advisor";
import { buildAssemblySequence, type AssemblySequence } from "@/engine/assembly";
import { buildCutList, type CutList } from "@/engine/cutlist";
import { solve, type WardrobeModel } from "@/engine/solver";
import type { WardrobeSpec } from "@/engine/spec/types";
import { useStudio } from "./useStudio";

/**
 * Everything derived from the spec, memoised on spec identity.
 *
 * The solver runs on the main thread on purpose: it is a few milliseconds for a
 * wardrobe this size, and having the model synchronously available is what lets a
 * dragged slider update the 3D view, the warnings and the cut list in the same frame.
 * Nesting is the one expensive step, and that runs in a worker.
 */

type Derived = {
  readonly model: WardrobeModel;
  readonly cutList: CutList;
  readonly findings: readonly Finding[];
  readonly summary: ReturnType<typeof summariseFindings>;
  readonly assembly: AssemblySequence;
  readonly elapsedMs: number;
};

let cache: { spec: WardrobeSpec; derived: Derived } | null = null;

export function deriveAll(spec: WardrobeSpec): Derived {
  if (cache && cache.spec === spec) return cache.derived;
  const started = performance.now();
  const model = solve(spec);
  const cutList = buildCutList(model);
  const findings = advise(model);
  const derived: Derived = {
    model,
    cutList,
    findings,
    summary: summariseFindings(findings),
    assembly: buildAssemblySequence(model),
    elapsedMs: performance.now() - started,
  };
  cache = { spec, derived };
  return derived;
}

export function useDerived(): Derived {
  const spec = useStudio((state) => state.spec);
  return useMemo(() => deriveAll(spec), [spec]);
}

export function useModel(): WardrobeModel {
  return useDerived().model;
}

export function useSelectedPart() {
  const model = useModel();
  const id = useStudio((state) => state.selectedPartId);
  return id ? (model.partsById.get(id) ?? null) : null;
}
