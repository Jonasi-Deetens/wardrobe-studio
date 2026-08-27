import type { WardrobeSpec } from "../spec/types";
import type { HardwareUse, Joint, PartDraft } from "./draft";
import type { Frame } from "./frame";

/**
 * Shared mutable state while a model is being assembled. The solver is pure from
 * the outside: `solve()` creates one of these, fills it, and freezes the result.
 */
export type SolverContext = {
  readonly spec: WardrobeSpec;
  readonly frame: Frame;
  readonly parts: PartDraft[];
  readonly partsById: Map<string, PartDraft>;
  readonly joints: Joint[];
  readonly hardware: HardwareUse[];
};

export function createContext(spec: WardrobeSpec, frame: Frame): SolverContext {
  return {
    spec,
    frame,
    parts: [],
    partsById: new Map(),
    joints: [],
    hardware: [],
  };
}

export function addPart(ctx: SolverContext, part: PartDraft): PartDraft {
  ctx.parts.push(part);
  ctx.partsById.set(part.id, part);
  return part;
}

export function addParts(ctx: SolverContext, parts: readonly PartDraft[]): void {
  for (const part of parts) addPart(ctx, part);
}

export function requirePart(ctx: SolverContext, id: string): PartDraft {
  const part = ctx.partsById.get(id);
  if (!part) throw new Error(`Part ${id} has not been created yet`);
  return part;
}

export function addHardware(ctx: SolverContext, use: HardwareUse): void {
  ctx.hardware.push(use);
}
