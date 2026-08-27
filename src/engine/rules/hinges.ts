import { getHinge } from "../catalog/hardware";
import { mm2 } from "../core/units";
import type { SolverContext } from "../solver/context";
import { fromFinishedEdge, localOf, type PartDraft } from "../solver/draft";
import type { ResolvedLeaf } from "../solver/doors";

/**
 * Concealed hinge drilling.
 *
 * Two panels get machined for every hinge:
 *
 * - the leaf, which takes a Ø35mm cup 13mm deep plus two Ø8mm fixing holes 45mm
 *   apart and 9.5mm further in from the edge than the cup centre;
 * - the carcase panel, which takes two Ø5mm holes 32mm apart on the front system
 *   row for the mounting plate.
 *
 * The distance from the leaf edge to the near side of the cup is the *boring
 * distance*, and it is what sets the overlay together with the plate height. It has
 * to stay inside the hinge's permitted range, so it is clamped here rather than
 * silently producing a leaf that fouls the carcase.
 */
export function applyHinges(
  ctx: SolverContext,
  leaves: readonly ResolvedLeaf[],
): void {
  if (leaves.length === 0) return;
  const hinge = getHinge(ctx.spec.doors.hingeId);
  const [minBoring, maxBoring] = hinge.boringDistanceRange;
  const boring = Math.min(maxBoring, Math.max(minBoring, ctx.spec.doors.boringDistance));
  // The cup centre sits half a cup diameter in from the near side of the bore.
  const cupCentreFromEdge = mm2(boring + hinge.cupDiameter / 2);

  for (const leaf of leaves) {
    const door = ctx.partsById.get(leaf.partId);
    if (door) drillLeaf(door, leaf, hinge, boring, cupCentreFromEdge);
    if (leaf.hingePanelId) {
      const panel = ctx.partsById.get(leaf.hingePanelId);
      if (panel) drillMountingPlates(ctx, panel, leaf, hinge);
    }
  }
}

function drillLeaf(
  door: PartDraft,
  leaf: ResolvedLeaf,
  hinge: ReturnType<typeof getHinge>,
  boring: number,
  cupCentreFromEdge: number,
): void {
  // A door is built with its length running up and its width across, so the hinged
  // edge is w0 for a left-hand hinge and w1 for a right-hand one.
  const hingedEdge = leaf.hingeSide === "left" ? "w0" : "w1";
  const cupW = fromFinishedEdge(door, hingedEdge, cupCentreFromEdge);
  const fixingW = fromFinishedEdge(
    door,
    hingedEdge,
    mm2(cupCentreFromEdge + hinge.fixingHoleOffset),
  );

  leaf.hingeYs.forEach((worldY, index) => {
    const l = localOf(door, [leaf.x0, worldY, door.placement.origin[2]]).l;
    if (l < 0 || l > door.length) return;

    door.ops.push({
      kind: "hole",
      id: `${door.id}-cup-${index + 1}`,
      face: "A",
      l: mm2(l),
      w: mm2(cupW),
      diameter: hinge.cupDiameter,
      depth: hinge.cupDepth,
      through: false,
      purpose: "hinge-cup",
      note: `Hinge ${index + 1}: boring distance ${boring}mm`,
    });

    for (const [side, offset] of [
      ["a", -hinge.fixingHoleSpacing / 2],
      ["b", hinge.fixingHoleSpacing / 2],
    ] as const) {
      const fl = mm2(l + offset);
      if (fl < 0 || fl > door.length) continue;
      door.ops.push({
        kind: "hole",
        id: `${door.id}-cup-fixing-${index + 1}${side}`,
        face: "A",
        l: fl,
        w: mm2(fixingW),
        diameter: hinge.fixingHoleDiameter,
        depth: hinge.cupDepth,
        through: false,
        purpose: "hinge-cup-fixing",
        note: `Hinge ${index + 1} fixing`,
      });
    }
  });

  door.notes.push(
    `${leaf.hingeCount} x ${hinge.name}, hinged on the ${leaf.hingeSide}. Ø${hinge.cupDiameter} cup ${hinge.cupDepth}mm deep, centre ${cupCentreFromEdge}mm from the hinged edge; Ø${hinge.fixingHoleDiameter} fixings ${hinge.fixingHoleSpacing}mm apart, ${mm2(cupCentreFromEdge + hinge.fixingHoleOffset)}mm from the edge.`,
    `Overlay ${leaf.overlay}mm = fixed distance ${hinge.fixedDistance} + boring ${boring} - plate ${
      leaf.overlay === 0 ? 0 : mm2(hinge.fixedDistance + boring - leaf.overlay)
    }.`,
  );
}

/**
 * Mounting plate holes.
 *
 * The plate screws into the front system row, 37mm from the front edge, with its two
 * holes 32mm apart along the panel. Because the hinge positions were already pulled
 * onto the 32mm grid, both plate holes land on existing system holes, which is
 * exactly what the system is for.
 */
function drillMountingPlates(
  ctx: SolverContext,
  panel: PartDraft,
  leaf: ResolvedLeaf,
  hinge: ReturnType<typeof getHinge>,
): void {
  const frontOffset = ctx.spec.joinery.systemHoles.frontOffset;
  const face = plateFace(panel, leaf);
  const w = fromFinishedEdge(panel, "w0", frontOffset);

  leaf.hingeYs.forEach((worldY, index) => {
    const l = localOf(panel, [leaf.hingePanelX, worldY, panel.placement.origin[2]]).l;
    for (const [side, offset] of [
      ["a", -hinge.plateHoleSpacing / 2],
      ["b", hinge.plateHoleSpacing / 2],
    ] as const) {
      const pl = mm2(l + offset);
      if (pl < 0 || pl > panel.length) continue;
      panel.ops.push({
        kind: "hole",
        id: `${panel.id}-plate-${leaf.id}-${index + 1}${side}`,
        face,
        l: pl,
        w: mm2(w),
        diameter: hinge.plateHoleDiameter,
        depth: hinge.plateHoleDepth,
        through: false,
        purpose: "hinge-plate",
        note: `${leaf.id} hinge ${index + 1} mounting plate`,
      });
    }
  });

  panel.notes.push(
    `Carries ${leaf.hingeCount} mounting plates for ${leaf.id}: pairs of Ø${hinge.plateHoleDiameter} holes ${hinge.plateHoleSpacing}mm apart on the front system row, ${frontOffset}mm from the front edge.`,
  );
}

/**
 * Which face of the carcase panel the plate screws to.
 *
 * A leaf hinged on its left hangs on the panel to its left, so the plate goes on
 * that panel's right-hand face. For an outer side panel that is always face A, the
 * inward face; for a divider it depends on which side the leaf is.
 */
function plateFace(panel: PartDraft, leaf: ResolvedLeaf): "A" | "B" {
  if (panel.role === "side") return "A";
  // A divider's face A points along +X. A leaf hinged on its left edge hangs on the
  // divider to its left and therefore on that divider's +X face.
  return leaf.hingeSide === "left" ? "A" : "B";
}
