import { getHinge, hingeCountForHeight } from "../catalog/hardware";
import { getMaterial } from "../catalog/materials";
import { mm2 } from "../core/units";
import type { HingeSideRule } from "../spec/types";
import { addHardware, addPart, type SolverContext } from "./context";
import { makePanel } from "./draft";

/**
 * A door leaf after its size and hinge arrangement have been worked out. The hinge
 * rules drill from these, and the advisor checks leaf mass and width against them.
 */
export type ResolvedLeaf = {
  readonly id: string;
  readonly partId: string;
  readonly index: number;
  readonly hingeSide: "left" | "right";
  /** X of the leaf's left edge. */
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly width: number;
  readonly height: number;
  readonly thickness: number;
  readonly mass: number;
  readonly hingeCount: number;
  /** Y of each hinge cup centre. */
  readonly hingeYs: readonly number[];
  /** X of the carcase panel the hinges screw to. */
  readonly hingePanelX: number;
  readonly hingePanelId: string | null;
  readonly overlay: number;
};

/** A leaf that could not be built, so the advisor can say why rather than it vanishing. */
export type ImpossibleLeaf = {
  readonly index: number;
  readonly width: number;
  readonly height: number;
};

export type DoorsResult = {
  readonly leaves: readonly ResolvedLeaf[];
  /** Overlay achieved by the chosen boring distance and plate height. */
  readonly overlay: number;
  /** Leaves the gaps and reveals left no room for. */
  readonly impossible: readonly ImpossibleLeaf[];
};

/**
 * The relation every European hinge maker publishes:
 *
 *     overlay = fixed distance + boring distance - plate height
 *
 * With the default 110 degree hinge (fixed distance 11), a 4.5mm boring distance
 * and a 3mm plate that gives 12.5mm... which is why the catalogue's default plate
 * is chosen to land on a sensible overlay for the panel thickness in use.
 */
export function hingeOverlay(
  fixedDistance: number,
  boringDistance: number,
  plateHeight: number,
): number {
  return mm2(fixedDistance + boringDistance - plateHeight);
}

function hingeSides(rule: HingeSideRule, count: number): ("left" | "right")[] {
  switch (rule) {
    case "all-left":
      return Array.from({ length: count }, () => "left" as const);
    case "all-right":
      return Array.from({ length: count }, () => "right" as const);
    case "alternate":
      return Array.from({ length: count }, (_, i) => (i % 2 === 0 ? "left" : "right"));
    case "pairs": {
      // Outer leaves hinge on the outside so the pair opens away from the centre.
      const half = Math.ceil(count / 2);
      return Array.from({ length: count }, (_, i) => (i < half ? "left" : "right"));
    }
  }
}

/**
 * Hinge cup positions along the leaf.
 *
 * The outer hinges sit an equal distance from each end, and any middle hinges are
 * spread evenly between them. Every position is then pulled onto the 32mm grid
 * measured from the bottom of the side panel, because the mounting plate screws
 * into the system row and has to line up with a hole.
 */
export function hingePositions(
  leafY0: number,
  leafHeight: number,
  count: number,
  endInset: number,
  gridOrigin: number | null,
): number[] {
  if (count < 2) return [mm2(leafY0 + leafHeight / 2)];
  const first = leafY0 + endInset;
  const last = leafY0 + leafHeight - endInset;
  const step = (last - first) / (count - 1);
  const raw = Array.from({ length: count }, (_, i) => first + step * i);
  if (gridOrigin === null) return raw.map((y) => mm2(y));
  return raw.map((y) => mm2(gridOrigin + Math.round((y - gridOrigin) / 32) * 32));
}

export function buildDoors(
  ctx: SolverContext,
  topLevelDividerXs: readonly number[],
  hingePanelIds: { readonly left: string; readonly right: string },
  dividerIdByX: ReadonlyMap<number, string>,
): DoorsResult {
  const { spec, frame } = ctx;
  if (spec.doors.type === "none") return { leaves: [], overlay: 0, impossible: [] };

  const hinge = getHinge(spec.doors.hingeId);
  const material = getMaterial(spec.doors.materialId);
  const overlay = hingeOverlay(
    hinge.fixedDistance,
    spec.doors.boringDistance,
    spec.doors.plateHeight,
  );

  const inset = spec.doors.overlayStyle === "inset";
  const gap = spec.doors.gap;
  const t = frame.thickness;

  // Fronts cover from the top of the plinth to the top of the carcase.
  const frontBottomY =
    spec.carcase.plinth.type === "none" ? frame.bottomPanelY : frame.plinthHeight;
  const frontTopY = frame.built.height;

  // Leaf boundaries across the carcase. Leaves meet over a full-height divider
  // when there is one, otherwise the width is divided equally.
  const boundaries: number[] = [0];
  if (spec.doors.leafMode === "per-bay" && topLevelDividerXs.length > 0) {
    boundaries.push(...topLevelDividerXs);
  } else {
    const n = Math.max(1, spec.doors.leafCount);
    for (let i = 1; i < n; i += 1) {
      boundaries.push(mm2((frame.built.width * i) / n));
    }
  }
  boundaries.push(frame.built.width);

  const leafCount = boundaries.length - 1;
  const sides = hingeSides(spec.doors.hingeSideRule, leafCount);
  const leaves: ResolvedLeaf[] = [];
  const impossible: ImpossibleLeaf[] = [];

  for (let i = 0; i < leafCount; i += 1) {
    const spanStart = boundaries[i] as number;
    const spanEnd = boundaries[i + 1] as number;
    const isFirst = i === 0;
    const isLast = i === leafCount - 1;

    // Half the gap is taken from each leaf at an internal joint; at the outer edges
    // an inset leaf gives up a full gap and an overlay leaf runs to the outside.
    const leftTrim = isFirst ? (inset ? gap + t : 0) : gap / 2;
    const rightTrim = isLast ? (inset ? gap + t : 0) : gap / 2;

    const x0 = mm2(spanStart + leftTrim);
    const x1 = mm2(spanEnd - rightTrim);
    const width = mm2(x1 - x0);

    const y0 = mm2(frontBottomY + spec.doors.revealBottom + (inset ? t + gap : 0));
    const y1 = mm2(frontTopY - spec.doors.revealTop - (inset ? t + gap : 0));
    const height = mm2(y1 - y0);
    if (width <= 0 || height <= 0) {
      // The gaps, reveals and inset allowances have eaten the whole opening. Record
      // it so the advisor can name the parameter instead of a leaf just missing.
      impossible.push({ index: i + 1, width, height });
      continue;
    }

    const hingeSide = sides[i] ?? "left";
    const hingeCount =
      spec.doors.hingeCountOverride ?? hingeCountForHeight(height);

    // Plates screw into the system row of whichever panel the leaf hangs on.
    const hingePanelX = hingeSide === "left" ? spanStart : spanEnd;
    const hingePanelId = panelAtX(
      hingePanelX,
      frame.built.width,
      hingePanelIds,
      dividerIdByX,
    );

    // The system grid on a side panel starts half a panel thickness from its foot.
    const gridOrigin = spec.carcase.snapToSystemGrid
      ? mm2(frame.sideBottomY + frame.halfThickness)
      : null;
    const hingeYs = hingePositions(
      y0,
      height,
      hingeCount,
      spec.doors.hingeEndInset,
      gridOrigin,
    );

    const mass = mm2(
      (width * height * material.thickness * material.density) / 1_000_000_000,
    );

    const zOuter = inset ? frame.frontZ : mm2(frame.frontZ + material.thickness);

    const door = makePanel({
      id: `door-${i + 1}`,
      role: "door",
      label: `Door ${i + 1}`,
      materialId: spec.doors.materialId,
      thickness: material.thickness,
      orientation: "panel-z-tall",
      finishedLength: height,
      finishedWidth: width,
      origin: [x0, y0, zOuter],
      // Face A is the inside of the leaf, which carries the hinge cups.
      faceADirection: -1,
      grain: material.hasGrain ? "length" : "none",
      banding: {
        l0: spec.doors.bandingId,
        l1: spec.doors.bandingId,
        w0: spec.doors.bandingId,
        w1: spec.doors.bandingId,
      },
    });
    door.hinge = { side: hingeSide, openAngle: hinge.openingAngle };
    addPart(ctx, door);

    leaves.push({
      id: `leaf-${i + 1}`,
      partId: door.id,
      index: i,
      hingeSide,
      x0,
      x1,
      y0,
      y1,
      width,
      height,
      thickness: material.thickness,
      mass,
      hingeCount,
      hingeYs,
      hingePanelX,
      hingePanelId,
      overlay,
    });

    addHardware(ctx, {
      kind: "hinge",
      catalogId: hinge.id,
      name: hinge.name,
      quantity: hingeCount,
      unit: "each",
      unitPrice: hinge.pricePerHinge,
      note: `Door ${i + 1}: bored at ${spec.doors.boringDistance}mm for a ${overlay}mm overlay.`,
    });
    addHardware(ctx, {
      kind: "hinge-plate",
      catalogId: `plate-${spec.doors.plateHeight}`,
      name: `Mounting plate, ${spec.doors.plateHeight}mm`,
      quantity: hingeCount,
      unit: "each",
      unitPrice: 1.2,
      note: `Door ${i + 1}.`,
    });
  }

  return { leaves, overlay, impossible };
}

/** Which carcase panel sits at a given X: an outer side, or a divider. */
function panelAtX(
  x: number,
  width: number,
  sides: { readonly left: string; readonly right: string },
  dividerIdByX: ReadonlyMap<number, string>,
): string | null {
  if (x <= 1) return sides.left;
  if (x >= width - 1) return sides.right;
  for (const [dividerX, id] of dividerIdByX) {
    if (Math.abs(dividerX - x) < 2) return id;
  }
  return null;
}
