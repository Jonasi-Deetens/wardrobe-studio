import { getMaterial } from "../catalog/materials";
import { mm2, snap } from "../core/units";
import type { WardrobeSpec } from "../spec/types";

/**
 * A clear rectangular space inside the carcase. Regions are what the layout tree
 * divides up, and every fitting is placed inside one.
 */
export type Region = {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  /** Rear limit: the front face of the back panel, or the rear plane if none. */
  readonly z0: number;
  /** Front limit: the front edge of the carcase. */
  readonly z1: number;
};

export function regionWidth(r: Region): number {
  return r.x1 - r.x0;
}

export function regionHeight(r: Region): number {
  return r.y1 - r.y0;
}

export function regionDepth(r: Region): number {
  return r.z1 - r.z0;
}

export type SnapNote = {
  readonly parameter: string;
  readonly requested: number;
  readonly built: number;
  readonly reason: string;
};

/**
 * The resolved skeleton of the carcase: outer dimensions after any 32mm snapping,
 * the planes each panel sits on, and the clear interior region.
 */
export type Frame = {
  readonly spec: WardrobeSpec;
  readonly thickness: number;
  /** Half the panel thickness, the standard dowel start dimension. */
  readonly halfThickness: number;
  readonly requested: { readonly width: number; readonly height: number; readonly depth: number };
  readonly built: { readonly width: number; readonly height: number; readonly depth: number };
  readonly snapNotes: readonly SnapNote[];

  readonly plinthHeight: number;
  /** Y of the underside of the side panels. */
  readonly sideBottomY: number;
  /** Y of the top of the side panels. */
  readonly sideTopY: number;
  /** Y of the underside of the bottom panel. */
  readonly bottomPanelY: number;
  /** Y of the underside of the top panel. */
  readonly topPanelY: number;
  /** X extents of the left and right side panels. */
  readonly leftSideX: number;
  readonly rightSideX: number;
  /** Z of the front edge of the carcase. */
  readonly frontZ: number;
  /** Z of the rear plane of the side panels. */
  readonly rearZ: number;
  /** Z of the front face of the back panel; equals rearZ when there is no back. */
  readonly backFrontZ: number;
  readonly backThickness: number;
  /** Clear space the layout tree divides up. */
  readonly interior: Region;
  /** Depth of a full-depth internal panel, front edge to back panel. */
  readonly internalDepth: number;
};

/**
 * The System 32 sizing relations.
 *
 * A side panel's height is `X + 2B`, where X is a multiple of 32 (the distance
 * between the first and last system hole) and B is the distance from the panel end
 * to the first hole, conventionally half the panel thickness so a dowel lands on
 * the centre line of the abutting panel. The depth is `Y + 2 x 37`, where Y is a
 * multiple of 32, which puts both system rows 37mm from their edge.
 *
 * Snapping to these makes every shelf position, hinge plate and drawer runner land
 * on the grid, which is the entire point of the system.
 */
export function systemHeight(rawInteriorSpan: number, halfThickness: number): number {
  const x = Math.max(32, snap(rawInteriorSpan - 2 * halfThickness, 32));
  return mm2(x + 2 * halfThickness);
}

export function systemDepth(rawDepth: number, frontOffset: number, rearOffset: number): number {
  const y = Math.max(32, snap(rawDepth - frontOffset - rearOffset, 32));
  return mm2(y + frontOffset + rearOffset);
}

export function resolveFrame(spec: WardrobeSpec): Frame {
  const material = getMaterial(spec.carcase.panelMaterialId);
  const t = material.thickness;
  const halfT = t / 2;

  const requested = {
    width: spec.carcase.width,
    height: spec.carcase.height,
    depth: spec.carcase.depth,
  };
  const snapNotes: SnapNote[] = [];

  const plinthType = spec.carcase.plinth.type;
  const plinthHeight = plinthType === "none" ? 0 : spec.carcase.plinth.height;

  // Sides run to the floor when the plinth is formed by the sides themselves;
  // otherwise the carcase sits on top of rails or legs.
  const sidesToFloor = plinthType === "integrated-sides";
  const sideBottomY = sidesToFloor ? 0 : plinthHeight;

  let height = requested.height;
  let depth = requested.depth;

  if (spec.carcase.snapToSystemGrid) {
    const construction = spec.carcase.construction;
    // The span the system grid has to fit is the side panel between the faces of
    // the top and bottom panels, which is what the hole rows are indexed to.
    const rawSideSpan =
      construction === "top-over-sides"
        ? height - t - sideBottomY
        : height - sideBottomY;
    const snappedSideSpan = systemHeight(rawSideSpan, halfT);
    const snappedHeight = mm2(
      construction === "top-over-sides"
        ? snappedSideSpan + t + sideBottomY
        : snappedSideSpan + sideBottomY,
    );
    if (Math.abs(snappedHeight - height) > 0.05) {
      snapNotes.push({
        parameter: "carcase.height",
        requested: height,
        built: snappedHeight,
        reason:
          "Height snapped so the side panel is a multiple of 32mm plus half the panel thickness at each end, which puts every system hole on the grid.",
      });
      height = snappedHeight;
    }

    const frontOffset = spec.joinery.systemHoles.frontOffset;
    const rearOffset = spec.joinery.systemHoles.rearOffset ?? frontOffset;
    const snappedDepth = systemDepth(depth, frontOffset, rearOffset);
    if (Math.abs(snappedDepth - depth) > 0.05) {
      snapNotes.push({
        parameter: "carcase.depth",
        requested: depth,
        built: snappedDepth,
        reason: `Depth snapped so the two system rows sit ${frontOffset}mm from the front and ${rearOffset}mm from the back with a multiple of 32mm between them.`,
      });
      depth = snappedDepth;
    }
  }

  const width = requested.width;
  const construction = spec.carcase.construction;

  const sideTopY = construction === "top-over-sides" ? mm2(height - t) : height;
  const topPanelY = mm2(height - t);
  // With an integrated plinth the sides continue past the bottom panel to the
  // floor, so the bottom sits at the plinth height rather than at the side foot.
  const bottomPanelY = sidesToFloor ? plinthHeight : sideBottomY;

  const leftSideX = 0;
  const rightSideX = width;
  const frontZ = depth;
  const rearZ = 0;

  const backMaterial = getMaterial(spec.carcase.back.materialId);
  const backThickness = spec.carcase.back.type === "none" ? 0 : backMaterial.thickness;
  const backFrontZ =
    spec.carcase.back.type === "none"
      ? rearZ
      : spec.carcase.back.type === "groove"
        ? mm2(spec.carcase.back.inset + backThickness)
        : spec.carcase.back.type === "rabbet"
          ? backThickness
          : rearZ;

  const interior: Region = {
    x0: mm2(leftSideX + t),
    x1: mm2(rightSideX - t),
    y0: mm2(bottomPanelY + t),
    y1: topPanelY,
    z0: backFrontZ,
    z1: frontZ,
  };

  return {
    spec,
    thickness: t,
    halfThickness: halfT,
    requested,
    built: { width, height, depth },
    snapNotes,
    plinthHeight,
    sideBottomY,
    sideTopY,
    bottomPanelY,
    topPanelY,
    leftSideX,
    rightSideX,
    frontZ,
    rearZ,
    backFrontZ,
    backThickness,
    interior,
    internalDepth: mm2(frontZ - backFrontZ),
  };
}
