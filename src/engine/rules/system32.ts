import { getRail, getShelfSupport } from "../catalog/hardware";
import type { Hole, PanelFace } from "../core/part";
import { mm2 } from "../core/units";
import type { SolverContext } from "../solver/context";
import { finishedLength, fromFinishedEdge, localOf, type PartDraft } from "../solver/draft";
import type { ResolvedAdjustableShelf } from "../solver/fittings";
import type { ResolvedBay } from "../solver/layout";

/**
 * The European 32mm system.
 *
 * Two rows of Ø5mm holes at a 32mm pitch run up the inside of every vertical
 * panel. The front row is centred 37mm from the front edge, which is the dimension
 * every hinge plate, drawer runner and shelf support in the catalogue is designed
 * around; the rear row sits a multiple of 32mm behind it, conventionally also 37mm
 * from the back so the panel is symmetrical and cannot be fitted the wrong way up.
 *
 * The rows are the reference for everything else: once they exist, a shelf, a
 * hinge and a runner can all be indexed to a hole rather than to a tape measure.
 */

export type SystemRowPlan = {
  /** Distance from the finished front edge to the front row, normally 37mm. */
  readonly frontOffset: number;
  readonly rearOffset: number | null;
  readonly pitch: number;
  /** Distance from the panel's bottom finished edge to the first hole. */
  readonly startOffset: number;
  readonly holeCount: number;
  readonly diameter: number;
  readonly depth: number;
};

/**
 * Works out where the hole rows start and how many there are.
 *
 * "Balanced" starts put the first and last hole the same distance from each end of
 * the panel, which is the system default and means the panel can be turned end for
 * end without anything shifting. Half the panel thickness is used as the start
 * dimension because that is where a dowel into an abutting horizontal panel lands.
 */
export function planSystemRows(
  panelLength: number,
  params: {
    readonly frontOffset: number;
    readonly rearOffset: number | null;
    readonly pitch: number;
    readonly startMode: "balanced" | "custom";
    readonly customStart: number;
    readonly halfThickness: number;
    readonly diameter: number;
    readonly depth: number;
  },
): SystemRowPlan {
  const start =
    params.startMode === "balanced" ? params.halfThickness : params.customStart;
  const usable = panelLength - 2 * start;
  const holeCount = usable < 0 ? 0 : Math.floor(usable / params.pitch) + 1;
  // Re-centre so the run of holes is symmetrical even when the panel length is not
  // an exact multiple of the pitch.
  const span = (holeCount - 1) * params.pitch;
  const startOffset =
    holeCount > 0 ? mm2(start + (usable - span) / 2) : mm2(start);

  return {
    frontOffset: params.frontOffset,
    rearOffset: params.rearOffset,
    pitch: params.pitch,
    startOffset,
    holeCount: Math.max(0, holeCount),
    diameter: params.diameter,
    depth: params.depth,
  };
}

/**
 * Adds the system hole rows to a vertical panel face.
 *
 * `w0` is the front edge for every vertical panel and `l0` its bottom edge, so every
 * offset here is measured from a *finished* edge and converted. Banding on the bottom
 * edge is uncommon but when it is there the whole row shifts by its thickness, and a
 * shelf pin a millimetre out of line is a shelf that rocks.
 */
export function applySystemRows(
  draft: PartDraft,
  face: PanelFace,
  plan: SystemRowPlan,
  idPrefix: string,
): Hole[] {
  const holes: Hole[] = [];
  const rows: { w: number; name: string }[] = [
    { w: fromFinishedEdge(draft, "w0", plan.frontOffset), name: "front" },
  ];
  if (plan.rearOffset !== null) {
    rows.push({ w: fromFinishedEdge(draft, "w1", plan.rearOffset), name: "rear" });
  }

  for (const row of rows) {
    if (row.w < 0 || row.w > draft.width) continue;
    for (let i = 0; i < plan.holeCount; i += 1) {
      const l = mm2(fromFinishedEdge(draft, "l0", plan.startOffset + i * plan.pitch));
      if (l < 0 || l > draft.length) continue;
      holes.push({
        kind: "hole",
        id: `${idPrefix}-${face}-${row.name}-${i + 1}`,
        face,
        l,
        w: mm2(row.w),
        diameter: plan.diameter,
        depth: plan.depth,
        through: false,
        purpose: "system-hole",
      });
    }
  }
  return holes;
}

/** Which faces of a panel look into a compartment that needs system rows. */
function facesNeedingRows(draft: PartDraft, bays: readonly ResolvedBay[]): PanelFace[] {
  const faces = new Set<PanelFace>();
  for (const bay of bays) {
    if (bay.bounds.left?.partId === draft.id) faces.add(bay.bounds.left.faceTowardRegion);
    if (bay.bounds.right?.partId === draft.id) faces.add(bay.bounds.right.faceTowardRegion);
  }
  return [...faces];
}

/**
 * Drills the system rows on every vertical panel.
 *
 * When `onlyWhereNeeded` is set the rows are left off faces that have nothing
 * adjustable next to them, which saves a lot of drilling on a wardrobe that is all
 * hanging space; otherwise every inward face gets them, which is what a shop
 * building to the system would do because it costs nothing extra on a CNC.
 */
export function applySystemHoles(
  ctx: SolverContext,
  verticalPanels: readonly PartDraft[],
  bays: readonly ResolvedBay[],
  adjustableShelves: readonly ResolvedAdjustableShelf[],
): void {
  const config = ctx.spec.joinery.systemHoles;
  if (!config.enabled) return;

  const support = getShelfSupport(ctx.spec.joinery.shelfSupportId);
  const baysNeedingRows = new Set(adjustableShelves.map((s) => s.bayId));

  for (const draft of verticalPanels) {
    const faces = facesNeedingRows(draft, bays);
    const wanted = config.onlyWhereNeeded
      ? faces.filter((face) =>
          bays.some(
            (bay) =>
              baysNeedingRows.has(bay.id) &&
              ((bay.bounds.left?.partId === draft.id &&
                bay.bounds.left.faceTowardRegion === face) ||
                (bay.bounds.right?.partId === draft.id &&
                  bay.bounds.right.faceTowardRegion === face)),
          ),
        )
      : faces;

    const plan = planSystemRows(finishedLength(draft), {
      frontOffset: config.frontOffset,
      rearOffset: config.rearOffset,
      pitch: config.pitch,
      startMode: config.startMode,
      customStart: config.customStart,
      halfThickness: ctx.frame.halfThickness,
      diameter: support.holeDiameter,
      depth: support.holeDepth,
    });

    for (const face of wanted) {
      draft.ops.push(...applySystemRows(draft, face, plan, `${draft.id}-sys`));
    }
    if (wanted.length > 0) {
      draft.notes.push(
        `System rows: Ø${plan.diameter} at ${plan.pitch}mm pitch, ${plan.holeCount} holes per row, first hole ${plan.startOffset}mm from the bottom edge, rows ${config.frontOffset}mm from the front${config.rearOffset === null ? "" : ` and ${config.rearOffset}mm from the back`}.`,
      );
    }
  }
}

/**
 * Marks the four holes an adjustable shelf actually rests in.
 *
 * The rows themselves are drilled all the way up the panel, which tells the person
 * at the bench nothing about where this shelf goes. So each shelf claims the two
 * holes per side that carry it, and those holes get a note naming the shelf — the
 * drawing then shows which four of sixty holes to put pins in.
 *
 * `joinery.shelfPinInset` says how far in from the shelf's front and back edges the
 * pins should be. There are only ever two rows to choose from, so the nearest row to
 * each target is used and the shelf note says how far off it landed.
 */
export function markShelfPins(
  ctx: SolverContext,
  shelves: readonly ResolvedAdjustableShelf[],
  bays: readonly ResolvedBay[],
): void {
  const support = getShelfSupport(ctx.spec.joinery.shelfSupportId);
  const inset = ctx.spec.joinery.shelfPinInset;
  if (shelves.length === 0) return;

  for (const shelf of shelves) {
    const draft = ctx.partsById.get(shelf.partId);
    if (!draft) continue;
    const bay = bays.find((b) => b.id === shelf.bayId);

    let pins = 0;
    let worstDeviation = 0;
    for (const boundary of [bay?.bounds.left, bay?.bounds.right]) {
      if (!boundary) continue;
      const panel = ctx.partsById.get(boundary.partId);
      if (!panel) continue;

      /* Pin targets in world space: in from the shelf's own front and back edges,
         with the rear pin raised by however much the shelf is tilted. */
      const targets = [
        { z: mm2(shelf.region.z1 - inset), y: shelf.y },
        { z: mm2(shelf.region.z0 + inset), y: mm2(shelf.y + shelf.rearRise) },
      ];
      for (const point of targets) {
        const local = localOf(panel, [panel.placement.origin[0], point.y, point.z]);
        const index = nearestSystemHole(
          panel,
          boundary.faceTowardRegion,
          local.l,
          local.w,
        );
        if (index < 0) continue;
        const hole = panel.ops[index] as Hole;
        panel.ops[index] = { ...hole, note: `Shelf pin: ${draft.label}` };
        pins += 1;
        worstDeviation = Math.max(worstDeviation, Math.abs(hole.w - local.w));
      }
    }

    const height = mm2(shelf.y - ctx.frame.sideBottomY);
    if (pins === 0) {
      draft.notes.push(
        `Rests on Ø${support.holeDiameter} pins ${height}mm above the foot of the side panel. No system rows were drilled next to it, so drill for the pins by hand.`,
      );
      continue;
    }
    draft.notes.push(
      `Rests on ${pins} Ø${support.holeDiameter} pins ${height}mm above the foot of the side panel, in the holes marked with this shelf's name.${
        worstDeviation > 1
          ? ` The nearest system row is ${mm2(worstDeviation)}mm off the ${inset}mm pin inset you asked for; the rows are the only holes there are.`
          : ""
      }`,
    );
  }
}

/**
 * Index of the system hole on one face closest to a target position, or -1. The
 * search is limited to half a pitch along the panel so a shelf cannot claim a hole
 * belonging to a different height.
 */
function nearestSystemHole(
  panel: PartDraft,
  face: PanelFace,
  l: number,
  w: number,
): number {
  let best = -1;
  let bestScore = Infinity;
  panel.ops.forEach((op, index) => {
    if (op.kind !== "hole" || op.purpose !== "system-hole" || op.face !== face) return;
    if (Math.abs(op.l - l) > 16) return;
    const score = Math.abs(op.l - l) + Math.abs(op.w - w);
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

/**
 * Holes in the panels either side of a hanging rail for its end supports, and in
 * the shelf above for a centre support on a long span.
 */
export function applyRailSupports(
  ctx: SolverContext,
  rails: readonly {
    readonly id: string;
    readonly railId: string;
    readonly y: number;
    readonly z: number;
    readonly x0: number;
    readonly x1: number;
    readonly span: number;
    readonly needsCentreSupport: boolean;
    readonly shelfAbovePartId: string | null;
    readonly bayId: string;
  }[],
  bays: readonly ResolvedBay[],
): void {
  let centreSupports = 0;
  let centreRailId: string | null = null;

  for (const rail of rails) {
    const bay = bays.find((b) => b.id === rail.bayId);
    if (!bay) continue;

    if (rail.needsCentreSupport) {
      centreSupports += drillCentreSupport(ctx, rail);
      centreRailId ??= rail.railId;
    }

    for (const [side, boundary] of [
      ["left", bay.bounds.left],
      ["right", bay.bounds.right],
    ] as const) {
      if (!boundary) continue;
      const draft = ctx.partsById.get(boundary.partId);
      if (!draft) continue;

      const x = side === "left" ? rail.x0 : rail.x1;
      const local = localOf(draft, [x, rail.y, rail.z]);
      // Two screws, one above the other, so the support cannot rotate.
      for (const [index, dl] of [-16, 16].entries()) {
        const l = mm2(local.l + dl);
        if (l < 0 || l > draft.length) continue;
        draft.ops.push({
          kind: "hole",
          id: `${rail.id}-support-${side}-${index + 1}`,
          face: boundary.faceTowardRegion,
          l,
          w: mm2(local.w),
          diameter: 5,
          depth: 13,
          through: false,
          purpose: "rail-support",
          note: `Hanging rail end support, ${side} side`,
        });
      }
    }
  }

  if (centreSupports > 0 && centreRailId !== null) {
    const rail = getRail(centreRailId);
    ctx.hardware.push({
      kind: "rail-centre-support",
      catalogId: rail.id,
      name: `Centre support for ${rail.name}`,
      quantity: centreSupports,
      unit: "each",
      unitPrice: rail.pricePerSupport,
      note: "Screwed up into the shelf over the rail at mid-span.",
    });
  }
}

/**
 * A centre support for a rail that spans further than it can carry.
 *
 * The support screws upwards into the shelf above, so the holes go in the underside
 * of that shelf — face B, since a shelf's face A looks up. Without a shelf over the
 * rail there is nothing to fix to, and the advisor says so rather than the hardware
 * list quietly billing a part that cannot be fitted.
 */
function drillCentreSupport(
  ctx: SolverContext,
  rail: {
    readonly id: string;
    readonly y: number;
    readonly z: number;
    readonly x0: number;
    readonly x1: number;
    readonly shelfAbovePartId: string | null;
  },
): number {
  if (!rail.shelfAbovePartId) return 0;
  const shelf = ctx.partsById.get(rail.shelfAbovePartId);
  if (!shelf) return 0;

  const midX = mm2((rail.x0 + rail.x1) / 2);
  const local = localOf(shelf, [midX, rail.y, rail.z]);
  let drilled = 0;

  /* Two screws across the width of the support so it cannot swing on one fixing. */
  for (const [index, dl] of [-16, 16].entries()) {
    const l = mm2(local.l + dl);
    if (l < 0 || l > shelf.length) continue;
    if (local.w < 0 || local.w > shelf.width) continue;
    shelf.ops.push({
      kind: "hole",
      id: `${rail.id}-centre-support-${index + 1}`,
      face: "B",
      l,
      w: mm2(local.w),
      diameter: 5,
      depth: 13,
      through: false,
      purpose: "rail-support",
      note: "Hanging rail centre support, screwed up into the underside of this shelf",
    });
    drilled += 1;
  }

  if (drilled > 0) {
    shelf.notes.push(
      "Carries a centre support for the rail below; the two holes in the underside are at mid-span.",
    );
    return 1;
  }
  return 0;
}

/**
 * Wall fixing holes.
 *
 * Testing on four-sided cases is unambiguous: a cabinet anchored through its side
 * panels carries substantially more load and is considerably stiffer than the same
 * cabinet anchored through the top, because the fixing then works in shear along
 * the panel rather than trying to pull the top off. So the default puts the
 * brackets on the sides, and the top option exists mainly so the advisor has
 * something concrete to warn about.
 */
export function applyWallAnchors(
  ctx: SolverContext,
  panels: { readonly leftSideId: string; readonly rightSideId: string; readonly topId: string },
): void {
  const mode = ctx.spec.carcase.wallAnchor;
  if (mode === "none") return;

  const { frame } = ctx;

  if (mode === "sides") {
    for (const id of [panels.leftSideId, panels.rightSideId]) {
      const draft = ctx.partsById.get(id);
      if (!draft) continue;
      // One fixing near the top and one lower down, both close to the back edge so
      // the bracket lands on the wall behind the carcase.
      const w = fromFinishedEdge(draft, "w1", 40);
      const heights = [
        mm2(draft.length - 100),
        mm2(draft.length * 0.5),
      ];
      heights.forEach((l, index) => {
        draft.ops.push({
          kind: "hole",
          id: `${id}-wall-anchor-${index + 1}`,
          face: "A",
          l,
          w: mm2(w),
          diameter: 5,
          depth: 13,
          through: false,
          purpose: "wall-anchor",
          note: "Wall bracket, fixed through the side panel",
        });
      });
      draft.notes.push(
        "Wall brackets fix through this panel rather than the top: anchoring at the sides carries far more load and is much stiffer.",
      );
    }
    ctx.hardware.push({
      kind: "wall-bracket",
      catalogId: "wall-bracket-l",
      name: "L bracket and wall plug",
      quantity: 4,
      unit: "each",
      unitPrice: 0.9,
      note: "Two per side panel.",
    });
    return;
  }

  const top = ctx.partsById.get(panels.topId);
  if (!top) return;
  const anchorCount = Math.max(2, Math.round(frame.built.width / 600));
  for (let i = 0; i < anchorCount; i += 1) {
    const l = mm2((top.length * (i + 0.5)) / anchorCount);
    top.ops.push({
      kind: "hole",
      id: `top-wall-anchor-${i + 1}`,
      face: "A",
      l,
      w: fromFinishedEdge(top, "w1", 40),
      diameter: 5,
      depth: 13,
      through: false,
      purpose: "wall-anchor",
      note: "Wall bracket, fixed through the top panel",
    });
  }
  top.notes.push(
    "Anchored through the top. Fixing through the side panels instead would carry considerably more load and resist racking better.",
  );
  ctx.hardware.push({
    kind: "wall-bracket",
    catalogId: "wall-bracket-l",
    name: "L bracket and wall plug",
    quantity: anchorCount,
    unit: "each",
    unitPrice: 0.9,
    note: "Through the top panel.",
  });
}
