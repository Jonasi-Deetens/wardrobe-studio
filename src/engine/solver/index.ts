import { applyDrawerHardware } from "../rules/drawers";
import { applyHandles } from "../rules/handles";
import { applyHinges } from "../rules/hinges";
import {
  applyBackHousing,
  applyJoinery,
  applyLevellingLegs,
  applyPlinthNotches,
} from "../rules/joinery";
import {
  applyRailSupports,
  applySystemHoles,
  applyWallAnchors,
  markShelfPins,
} from "../rules/system32";
import { boxOfPoints, unionBox, type Box3 } from "../core/geometry";
import { partBounds, type Part } from "../core/part";
import type { WardrobeSpec } from "../spec/types";
import { buildCarcase, buildTopStretcher, type RegionBounds } from "./carcase";
import { addParts, createContext, type SolverContext } from "./context";
import { buildDoors, type ImpossibleLeaf, type ResolvedLeaf } from "./doors";
import { freezeDraft, type HardwareUse, type Joint, type PartDraft } from "./draft";
import { buildFittings, type ResolvedAdjustableShelf, type ResolvedDrawer, type ResolvedRail } from "./fittings";
import { resolveFrame, type Frame } from "./frame";
import { buildLayout, type ResolvedBay, type ResolvedDivider } from "./layout";

/**
 * The full derived model. Everything the app shows — the 3D scene, the cut list, the
 * nesting, the drawings, the exports, the advice — is computed from this and nothing
 * else, so there is exactly one place where the wardrobe is decided.
 */
export type WardrobeModel = {
  readonly spec: WardrobeSpec;
  /**
   * Which unit in the room this is, once the project layer has placed it. Absent when a
   * wardrobe is solved on its own, which is what the engine tests and the fallback model do.
   */
  readonly unitId?: string;
  readonly frame: Frame;
  readonly parts: readonly Part[];
  readonly partsById: ReadonlyMap<string, Part>;
  readonly joints: readonly Joint[];
  readonly hardware: readonly HardwareUse[];
  readonly bays: readonly ResolvedBay[];
  readonly dividers: readonly ResolvedDivider[];
  readonly leaves: readonly ResolvedLeaf[];
  /** Door leaves the reveals and gaps left no room for. */
  readonly impossibleLeaves: readonly ImpossibleLeaf[];
  readonly drawers: readonly ResolvedDrawer[];
  readonly adjustableShelves: readonly ResolvedAdjustableShelf[];
  readonly rails: readonly ResolvedRail[];
  readonly bounds: Box3;
  /** Set when the requested top overhang could not be built as asked. */
  readonly ignoredOverhang: boolean;
};

/**
 * Builds the model from a spec.
 *
 * The order matters: geometry first, so every panel exists and knows where it is,
 * then the machining rules, which only add operations. No rule moves a panel, which
 * is why the drawings and the 3D view can never disagree.
 */
export function solve(spec: WardrobeSpec): WardrobeModel {
  const frame = resolveFrame(spec);
  const ctx = createContext(spec, frame);

  /* 1. The box itself. */
  const carcase = buildCarcase(frame);
  addParts(ctx, carcase.parts);
  ctx.joints.push(...carcase.joints);
  ctx.hardware.push(...carcase.hardware);

  /* 2. Divide the interior and place the fittings. */
  const interiorBounds: RegionBounds = carcase.interiorBounds;
  const layout = buildLayout(ctx, spec.layout, frame.interior, interiorBounds);
  /* The stretcher is fitted between the partitions, so it can only be built once they
     exist. */
  buildTopStretcher(ctx, { leftId: carcase.leftSideId, rightId: carcase.rightSideId });
  const fittings = buildFittings(ctx, layout.bays);

  /* 3. Fronts. */
  const dividerIdByX = new Map(layout.dividers.map((d) => [d.x, d.id]));
  const doors = buildDoors(
    ctx,
    layout.topLevelDividerXs,
    { left: carcase.leftSideId, right: carcase.rightSideId },
    dividerIdByX,
  );

  /* 4. Machining. Nothing below this line changes any panel's size or position. */
  const verticalPanels = ctx.parts.filter(
    (part) => part.role === "side" || part.role === "divider",
  );
  applySystemHoles(ctx, verticalPanels, layout.bays, fittings.adjustableShelves);
  markShelfPins(ctx, fittings.adjustableShelves, layout.bays);
  applyJoinery(ctx);
  applyBackHousing(ctx, {
    leftSideId: carcase.leftSideId,
    rightSideId: carcase.rightSideId,
    topId: carcase.topId,
    bottomId: carcase.bottomId,
  });
  applyPlinthNotches(ctx, {
    leftSideId: carcase.leftSideId,
    rightSideId: carcase.rightSideId,
  });
  applyLevellingLegs(ctx, { bottomId: carcase.bottomId });
  applyRailSupports(ctx, fittings.rails, layout.bays);
  applyWallAnchors(ctx, {
    leftSideId: carcase.leftSideId,
    rightSideId: carcase.rightSideId,
    topId: carcase.topId,
  });
  applyHinges(ctx, doors.leaves);
  applyDrawerHardware(ctx, fittings.drawers, layout.bays);
  applyHandles(ctx, doors.leaves, fittings.drawers);

  /* 5. Freeze. */
  const parts = sortParts(ctx.parts).map(freezeDraft);
  const partsById = new Map(parts.map((part) => [part.id, part]));
  const bounds = parts.reduce<Box3>(
    (acc, part) => unionBox(acc, partBounds(part)),
    boxOfPoints([[0, 0, 0]]),
  );

  return {
    spec,
    frame,
    parts,
    partsById,
    joints: ctx.joints,
    hardware: ctx.hardware,
    bays: layout.bays,
    dividers: layout.dividers,
    leaves: doors.leaves,
    impossibleLeaves: doors.impossible,
    drawers: fittings.drawers,
    adjustableShelves: fittings.adjustableShelves,
    rails: fittings.rails,
    bounds,
    ignoredOverhang: carcase.ignoredOverhang,
  };
}

/**
 * Assembly order, which is also the order the cut list and the printed booklet use:
 * carcase first, then what goes inside it, then the fronts. Someone working through
 * the booklet page by page builds the wardrobe in a sensible sequence.
 */
const ROLE_ORDER: readonly string[] = [
  "side",
  "top",
  "bottom",
  "divider",
  "fixed-shelf",
  "back",
  "stretcher",
  "plinth-rail",
  "adjustable-shelf",
  "shoe-shelf",
  "drawer-side",
  "drawer-back",
  "drawer-bottom",
  "drawer-front",
  "door",
  "filler",
];

function sortParts(parts: readonly PartDraft[]): PartDraft[] {
  return [...parts].sort((a, b) => {
    const roleDiff = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
    if (roleDiff !== 0) return roleDiff;
    return a.id.localeCompare(b.id);
  });
}

export type { SolverContext };
export { resolveFrame } from "./frame";
export type { Frame, Region } from "./frame";
export type { ResolvedBay, ResolvedDivider } from "./layout";
export type { ImpossibleLeaf, ResolvedLeaf } from "./doors";
export type { ResolvedDrawer, ResolvedRail, ResolvedAdjustableShelf } from "./fittings";
export type { HardwareUse, Joint } from "./draft";
export { hingeOverlay, hingePositions } from "./doors";
export { drawerFrontHeights } from "./fittings";
