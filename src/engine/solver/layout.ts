import { getMaterial } from "../catalog/materials";
import { distribute, mm2 } from "../core/units";
import type { BayNode, Fitting, LayoutNode, SplitNode } from "../spec/types";
import type { Boundary, RegionBounds } from "./carcase";
import { addPart, requirePart, type SolverContext } from "./context";
import { makeJoint, makePanel, type PartDraft } from "./draft";
import { regionHeight, regionWidth, type Region } from "./frame";

/**
 * A compartment after the layout tree has been resolved against real dimensions.
 * The advisor and the UI both read these rather than re-deriving anything.
 */
export type ResolvedBay = {
  readonly id: string;
  readonly label: string;
  readonly region: Region;
  readonly bounds: RegionBounds;
  readonly fitting: Fitting;
  /** Clear width, which is the span any shelf or rail in here has to cross. */
  readonly clearWidth: number;
  readonly clearHeight: number;
  readonly clearDepth: number;
};

export type LayoutResult = {
  readonly bays: readonly ResolvedBay[];
  /** Every vertical divider, left to right, with the X of its centre line. */
  readonly dividers: readonly ResolvedDivider[];
  /**
   * Dividers created by the outermost split only. Door leaves line up with these,
   * because a leaf has to meet over a panel that runs the full height.
   */
  readonly topLevelDividerXs: readonly number[];
};

export type ResolvedDivider = {
  readonly id: string;
  readonly x: number;
  readonly depth: number;
};

type SplitOutcome = {
  readonly bays: ResolvedBay[];
  readonly dividers: ResolvedDivider[];
};

/**
 * Divides the interior according to the layout tree, creating a divider for every
 * vertical split and a fixed shelf for every horizontal one.
 */
export function buildLayout(
  ctx: SolverContext,
  root: LayoutNode,
  interior: Region,
  bounds: RegionBounds,
): LayoutResult {
  const outcome = resolveNode(ctx, root, interior, bounds, 0);
  const sorted = [...outcome.dividers].sort((a, b) => a.x - b.x);
  return {
    bays: outcome.bays,
    dividers: sorted,
    topLevelDividerXs: sorted.filter((d) => d.depth === 0).map((d) => d.x),
  };
}

function resolveNode(
  ctx: SolverContext,
  node: LayoutNode,
  region: Region,
  bounds: RegionBounds,
  depth: number,
): SplitOutcome {
  if (node.kind === "bay") {
    return { bays: [resolveBay(node, region, bounds)], dividers: [] };
  }
  return node.axis === "vertical"
    ? splitVertically(ctx, node, region, bounds, depth)
    : splitHorizontally(ctx, node, region, bounds, depth);
}

function resolveBay(node: BayNode, region: Region, bounds: RegionBounds): ResolvedBay {
  return {
    id: node.id,
    label: node.label,
    region,
    bounds,
    fitting: node.fitting,
    clearWidth: mm2(regionWidth(region)),
    clearHeight: mm2(regionHeight(region)),
    clearDepth: mm2(region.z1 - region.z0),
  };
}

function splitVertically(
  ctx: SolverContext,
  node: SplitNode,
  region: Region,
  bounds: RegionBounds,
  depth: number,
): SplitOutcome {
  const t = ctx.frame.thickness;
  const dividerCount = node.children.length - 1;
  const clearTotal = mm2(regionWidth(region) - dividerCount * t);
  const sizes = distribute(clearTotal, node.children.map((c) => c.size));

  const bays: ResolvedBay[] = [];
  const dividers: ResolvedDivider[] = [];
  let cursor = region.x0;

  node.children.forEach((child, index) => {
    const size = Math.max(0, sizes[index] ?? 0);
    const childRegion: Region = { ...region, x0: mm2(cursor), x1: mm2(cursor + size) };
    cursor = mm2(cursor + size);

    const isLast = index === node.children.length - 1;
    let rightBoundary: Boundary = bounds.right;

    if (!isLast) {
      const divider = createDivider(ctx, node, index, cursor, region, bounds);
      dividers.push({ id: divider.id, x: mm2(cursor + t / 2), depth });
      // The divider's face A points along +X, so the bay to its left looks at
      // face B and the bay to its right looks at face A.
      rightBoundary = { partId: divider.id, faceTowardRegion: "B" };
      cursor = mm2(cursor + t);
    }

    const childBounds: RegionBounds = {
      left:
        index === 0
          ? bounds.left
          : { partId: dividerIdFor(node, index - 1), faceTowardRegion: "A" },
      right: rightBoundary,
      below: bounds.below,
      above: bounds.above,
    };

    const outcome = resolveNode(ctx, child.node, childRegion, childBounds, depth + 1);
    bays.push(...outcome.bays);
    dividers.push(...outcome.dividers);
  });

  return { bays, dividers };
}

function dividerIdFor(node: SplitNode, index: number): string {
  return `${node.id}-divider-${index + 1}`;
}

function createDivider(
  ctx: SolverContext,
  node: SplitNode,
  index: number,
  x: number,
  region: Region,
  bounds: RegionBounds,
): PartDraft {
  const { frame, spec } = ctx;
  const t = frame.thickness;
  const materialId = spec.carcase.panelMaterialId;
  const material = getMaterial(materialId);

  const divider = makePanel({
    id: dividerIdFor(node, index),
    role: "divider",
    label: `Divider ${index + 1}`,
    materialId,
    thickness: t,
    orientation: "vertical-x",
    finishedLength: mm2(regionHeight(region)),
    finishedWidth: mm2(region.z1 - region.z0),
    origin: [x, region.y0, region.z1],
    faceADirection: 1,
    grain: material.hasGrain ? "length" : "none",
    banding: {
      w0: spec.production.banding.carcaseVisibleEdges,
      w1: spec.production.banding.carcaseHiddenEdges,
      l0: spec.production.banding.carcaseHiddenEdges,
      l1: spec.production.banding.carcaseHiddenEdges,
    },
  });
  addPart(ctx, divider);

  // A divider is joined to whatever bounds the region above and below it, which in
  // a nested layout may be a shelf rather than the carcase top or bottom.
  const centre = mm2(x + t / 2);
  const addEndJoint = (boundary: Boundary, edge: "l0" | "l1", y: number): void => {
    if (!boundary) return;
    const panel = requirePart(ctx, boundary.partId);
    ctx.joints.push(
      makeJoint({
        id: `${divider.id}-to-${panel.id}`,
        through: panel,
        throughFace: boundary.faceTowardRegion,
        abutting: divider,
        abuttingEdge: edge,
        from: [centre, y, region.z1],
        to: [centre, y, region.z0],
        structural: true,
        label: `${divider.label} into ${panel.label}`,
      }),
    );
  };

  addEndJoint(bounds.below, "l0", region.y0);
  addEndJoint(bounds.above, "l1", region.y1);

  return divider;
}

function splitHorizontally(
  ctx: SolverContext,
  node: SplitNode,
  region: Region,
  bounds: RegionBounds,
  depth: number,
): SplitOutcome {
  const t = ctx.frame.thickness;
  const shelfCount = node.children.length - 1;
  const clearTotal = mm2(regionHeight(region) - shelfCount * t);
  const sizes = distribute(clearTotal, node.children.map((c) => c.size));

  const bays: ResolvedBay[] = [];
  const dividers: ResolvedDivider[] = [];
  let cursor = region.y0;

  node.children.forEach((child, index) => {
    const size = Math.max(0, sizes[index] ?? 0);
    const childRegion: Region = { ...region, y0: mm2(cursor), y1: mm2(cursor + size) };
    cursor = mm2(cursor + size);

    const isLast = index === node.children.length - 1;
    let aboveBoundary: Boundary = bounds.above;

    if (!isLast) {
      const shelf = createFixedShelf(ctx, node, index, cursor, region, bounds);
      // Face A of a shelf is its upper surface, so the bay below it looks at face B.
      aboveBoundary = { partId: shelf.id, faceTowardRegion: "B" };
      cursor = mm2(cursor + t);
    }

    const childBounds: RegionBounds = {
      left: bounds.left,
      right: bounds.right,
      below:
        index === 0
          ? bounds.below
          : { partId: shelfIdFor(node, index - 1), faceTowardRegion: "A" },
      above: aboveBoundary,
    };

    const outcome = resolveNode(ctx, child.node, childRegion, childBounds, depth + 1);
    bays.push(...outcome.bays);
    dividers.push(...outcome.dividers);
  });

  return { bays, dividers };
}

function shelfIdFor(node: SplitNode, index: number): string {
  return `${node.id}-shelf-${index + 1}`;
}

function createFixedShelf(
  ctx: SolverContext,
  node: SplitNode,
  index: number,
  y: number,
  region: Region,
  bounds: RegionBounds,
): PartDraft {
  const { frame, spec } = ctx;
  const t = frame.thickness;
  const materialId = spec.carcase.panelMaterialId;
  const material = getMaterial(materialId);

  const shelf = makePanel({
    id: shelfIdFor(node, index),
    role: "fixed-shelf",
    label: `Fixed shelf ${index + 1}`,
    materialId,
    thickness: t,
    orientation: "horizontal-y",
    finishedLength: mm2(regionWidth(region)),
    finishedWidth: mm2(region.z1 - region.z0),
    origin: [region.x0, y, region.z1],
    faceADirection: 1,
    grain: material.hasGrain ? "length" : "none",
    banding: {
      w0: spec.production.banding.shelfFront,
      w1: spec.production.banding.shelfOther,
      l0: spec.production.banding.shelfOther,
      l1: spec.production.banding.shelfOther,
    },
    notes: ["Fixed shelf: also braces the carcase against the sides bowing."],
  });
  addPart(ctx, shelf);

  const addSideJoint = (boundary: Boundary, edge: "l0" | "l1", x: number): void => {
    if (!boundary) return;
    const panel = requirePart(ctx, boundary.partId);
    ctx.joints.push(
      makeJoint({
        id: `${shelf.id}-to-${panel.id}`,
        through: panel,
        throughFace: boundary.faceTowardRegion,
        abutting: shelf,
        abuttingEdge: edge,
        from: [x, mm2(y + t / 2), region.z1],
        to: [x, mm2(y + t / 2), region.z0],
        structural: true,
        label: `${shelf.label} into ${panel.label}`,
      }),
    );
  };

  addSideJoint(bounds.left, "l0", region.x0);
  addSideJoint(bounds.right, "l1", region.x1);

  return shelf;
}
