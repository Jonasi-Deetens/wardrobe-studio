import { getBanding } from "../catalog/materials";
import type { Placement, Vec3 } from "../core/geometry";
import { NEG_X, NEG_Y, NEG_Z, X_AXIS, Y_AXIS, Z_AXIS } from "../core/geometry";
import type {
  EdgeLabels,
  GrainDirection,
  MachiningOp,
  PanelEdge,
  PanelFace,
  Part,
  PartRole,
} from "../core/part";
import { mm2 } from "../core/units";

/**
 * A panel while it is still being built up.
 *
 * The solver produces drafts with geometry only; the rules modules then push
 * machining operations onto them. Splitting it this way means the geometry code
 * never has to know about hinges and the hinge code never has to work out where a
 * panel is.
 */
export type PartDraft = {
  id: string;
  role: PartRole;
  label: string;
  materialId: string;
  /** As-cut length: the finished size less any banding on the l0 and l1 edges. */
  length: number;
  /** As-cut width: the finished size less any banding on the w0 and w1 edges. */
  width: number;
  thickness: number;
  grain: GrainDirection;
  edgeLabels: EdgeLabels;
  banding: Partial<Record<PanelEdge, string>>;
  /** Banding thickness per edge, so rules can convert finished-edge references. */
  bandingThickness: Record<PanelEdge, number>;
  placement: Placement;
  ops: MachiningOp[];
  bayId?: string;
  hinge?: { side: "left" | "right"; openAngle: number };
  drawerId?: string;
  notes: string[];
};

export function freezeDraft(draft: PartDraft): Part {
  const part: Part = {
    id: draft.id,
    role: draft.role,
    label: draft.label,
    materialId: draft.materialId,
    length: mm2(draft.length),
    width: mm2(draft.width),
    thickness: draft.thickness,
    grain: draft.grain,
    edgeLabels: draft.edgeLabels,
    banding: draft.banding,
    placement: draft.placement,
    ops: draft.ops,
    ...(draft.bayId !== undefined ? { bayId: draft.bayId } : {}),
    ...(draft.hinge !== undefined ? { hinge: draft.hinge } : {}),
    ...(draft.drawerId !== undefined ? { drawerId: draft.drawerId } : {}),
    ...(draft.notes.length > 0 ? { notes: draft.notes } : {}),
  };
  return part;
}

/**
 * Machining coordinates are measured from the as-cut panel edges, because that is
 * what someone measures on the bench or what a CNC sees after nesting. Hardware
 * dimensions, on the other hand, are quoted from the *finished* edge: the 37mm
 * system row offset explicitly includes edge banding. This converts between them.
 */
export function fromFinishedEdge(
  draft: PartDraft,
  edge: PanelEdge,
  distance: number,
): number {
  const band = draft.bandingThickness[edge];
  const local = distance - band;
  switch (edge) {
    case "l0":
      return local;
    case "l1":
      return draft.length - local;
    case "w0":
      return local;
    case "w1":
      return draft.width - local;
  }
}

/** Finished length including banding, which is the size that has to fit. */
export function finishedLength(draft: PartDraft): number {
  return draft.length + draft.bandingThickness.l0 + draft.bandingThickness.l1;
}

export function finishedWidth(draft: PartDraft): number {
  return draft.width + draft.bandingThickness.w0 + draft.bandingThickness.w1;
}

export type BandingChoice = Partial<Record<PanelEdge, string>>;

function bandingThicknessOf(banding: BandingChoice): Record<PanelEdge, number> {
  const thicknessFor = (edge: PanelEdge): number => {
    const id = banding[edge];
    if (!id || id === "none") return 0;
    return getBanding(id).thickness;
  };
  return {
    l0: thicknessFor("l0"),
    l1: thicknessFor("l1"),
    w0: thicknessFor("w0"),
    w1: thicknessFor("w1"),
  };
}

/** Drops "none" entries so the cut list only lists edges that are actually banded. */
function cleanBanding(banding: BandingChoice): Partial<Record<PanelEdge, string>> {
  const out: Partial<Record<PanelEdge, string>> = {};
  for (const edge of ["l0", "l1", "w0", "w1"] as const) {
    const id = banding[edge];
    if (id && id !== "none") out[edge] = id;
  }
  return out;
}

export type PanelOrientation =
  /** Faces normal to X. Length runs up, width runs from the front edge backwards. */
  | "vertical-x"
  /** Faces normal to Y. Length runs left to right, width runs from front backwards. */
  | "horizontal-y"
  /** Faces normal to Z. Length runs left to right, width runs upwards. */
  | "panel-z-wide"
  /** Faces normal to Z. Length runs upwards, width runs left to right. */
  | "panel-z-tall"
  /** Faces normal to X, length front to back, width upwards. Drawer box sides. */
  | "drawer-side"
  /** Faces normal to Y, length left to right, width front to back. Drawer bottoms. */
  | "drawer-bottom";

const EDGE_LABELS_BY_ORIENTATION: Record<PanelOrientation, EdgeLabels> = {
  "vertical-x": { l0: "bottom", l1: "top", w0: "front", w1: "back" },
  "horizontal-y": { l0: "left", l1: "right", w0: "front", w1: "back" },
  "panel-z-wide": { l0: "left", l1: "right", w0: "bottom", w1: "top" },
  "panel-z-tall": { l0: "bottom", l1: "top", w0: "left", w1: "right" },
  "drawer-side": { l0: "front", l1: "back", w0: "bottom", w1: "top" },
  "drawer-bottom": { l0: "left", l1: "right", w0: "front", w1: "back" },
};

type Axes = { lAxis: Vec3; wAxis: Vec3; tAxis: Vec3 };

function axesFor(orientation: PanelOrientation, faceADirection: 1 | -1): Axes {
  const t = faceADirection;
  switch (orientation) {
    case "vertical-x":
      return { lAxis: Y_AXIS, wAxis: NEG_Z, tAxis: t > 0 ? X_AXIS : NEG_X };
    case "horizontal-y":
      return { lAxis: X_AXIS, wAxis: NEG_Z, tAxis: t > 0 ? Y_AXIS : NEG_Y };
    case "panel-z-wide":
      return { lAxis: X_AXIS, wAxis: Y_AXIS, tAxis: t > 0 ? Z_AXIS : NEG_Z };
    case "panel-z-tall":
      return { lAxis: Y_AXIS, wAxis: X_AXIS, tAxis: t > 0 ? Z_AXIS : NEG_Z };
    case "drawer-side":
      return { lAxis: NEG_Z, wAxis: Y_AXIS, tAxis: t > 0 ? X_AXIS : NEG_X };
    case "drawer-bottom":
      return { lAxis: X_AXIS, wAxis: NEG_Z, tAxis: t > 0 ? Y_AXIS : NEG_Y };
  }
}

export type PanelRequest = {
  readonly id: string;
  readonly role: PartRole;
  readonly label: string;
  readonly materialId: string;
  readonly thickness: number;
  readonly orientation: PanelOrientation;
  /** Finished size along the length axis, banding included. */
  readonly finishedLength: number;
  /** Finished size along the width axis, banding included. */
  readonly finishedWidth: number;
  /**
   * Assembly-space position of the finished panel corner that local (0, 0, 0)
   * sits at. Banding is deducted from here automatically.
   */
  readonly origin: Vec3;
  /**
   * Which way the thickness axis points, so face A lands on the side that gets
   * the machining: +1 follows the orientation's natural axis, -1 reverses it.
   */
  readonly faceADirection: 1 | -1;
  readonly grain: GrainDirection;
  readonly banding: BandingChoice;
  readonly bayId?: string;
  readonly notes?: readonly string[];
};

/**
 * Builds a draft from a finished-size request, deducting edge banding and shifting
 * the origin so the as-cut panel sits inside the space the finished panel occupies.
 */
export function makePanel(request: PanelRequest): PartDraft {
  const bandingThickness = bandingThicknessOf(request.banding);
  const length = mm2(
    request.finishedLength - bandingThickness.l0 - bandingThickness.l1,
  );
  const width = mm2(request.finishedWidth - bandingThickness.w0 - bandingThickness.w1);
  const axes = axesFor(request.orientation, request.faceADirection);

  const origin: Vec3 = [
    request.origin[0] +
      axes.lAxis[0] * bandingThickness.l0 +
      axes.wAxis[0] * bandingThickness.w0,
    request.origin[1] +
      axes.lAxis[1] * bandingThickness.l0 +
      axes.wAxis[1] * bandingThickness.w0,
    request.origin[2] +
      axes.lAxis[2] * bandingThickness.l0 +
      axes.wAxis[2] * bandingThickness.w0,
  ];

  return {
    id: request.id,
    role: request.role,
    label: request.label,
    materialId: request.materialId,
    length,
    width,
    thickness: request.thickness,
    grain: request.grain,
    edgeLabels: EDGE_LABELS_BY_ORIENTATION[request.orientation],
    banding: cleanBanding(request.banding),
    bandingThickness,
    placement: { origin, ...axes },
    ops: [],
    ...(request.bayId !== undefined ? { bayId: request.bayId } : {}),
    notes: request.notes ? [...request.notes] : [],
  };
}

/**
 * Projects an assembly-space point into a panel's local coordinates.
 *
 * Because the axes are orthonormal and the origin already carries the edge-banding
 * offset, this is exact and removes every opportunity to get the banding
 * arithmetic wrong by hand: the solver works in assembly space, where panel
 * positions are obvious, and lets this convert.
 */
export function localOf(
  draft: PartDraft,
  point: Vec3,
): { l: number; w: number; t: number } {
  const { origin, lAxis, wAxis, tAxis } = draft.placement;
  const d: Vec3 = [
    point[0] - origin[0],
    point[1] - origin[1],
    point[2] - origin[2],
  ];
  return {
    l: mm2(d[0] * lAxis[0] + d[1] * lAxis[1] + d[2] * lAxis[2]),
    w: mm2(d[0] * wAxis[0] + d[1] * wAxis[1] + d[2] * wAxis[2]),
    t: mm2(d[0] * tAxis[0] + d[1] * tAxis[1] + d[2] * tAxis[2]),
  };
}

/* ----------------------------------------------------------------- joints - */

/**
 * A description of two panels meeting, independent of how they will be fastened.
 *
 * The connector rules turn one of these into face holes in the through panel and
 * matching edge holes in the abutting panel. Keeping the description separate is
 * what lets the user swap dowels for cam fittings without any geometry changing.
 */
export type Joint = {
  readonly id: string;
  /** The panel whose broad face is drilled. */
  readonly throughPartId: string;
  readonly throughFace: PanelFace;
  /**
   * The joint centre line in the through panel's local coordinates, running along
   * the middle of the abutting panel's thickness.
   */
  readonly line: {
    readonly from: { readonly l: number; readonly w: number };
    readonly to: { readonly l: number; readonly w: number };
  };
  /** The panel whose narrow edge is drilled. */
  readonly abuttingPartId: string;
  readonly abuttingEdge: PanelEdge;
  /**
   * Where `line.from` and `line.to` fall along the abutting panel's edge, so a
   * position on the joint can be expressed in either panel.
   */
  readonly abuttingAlong: { readonly from: number; readonly to: number };
  /** Load-bearing joints get more fittings than a mere alignment joint. */
  readonly structural: boolean;
  readonly label: string;
};

/** The local axis a given edge runs along: `l0`/`l1` run along w, `w0`/`w1` along l. */
function edgeRunsAlong(edge: PanelEdge): "l" | "w" {
  return edge === "l0" || edge === "l1" ? "w" : "l";
}

/**
 * Builds a joint from the two assembly-space endpoints of the line where the
 * panels meet, which is the middle of the abutting panel's thickness.
 */
export function makeJoint(params: {
  readonly id: string;
  readonly through: PartDraft;
  readonly throughFace: PanelFace;
  readonly abutting: PartDraft;
  readonly abuttingEdge: PanelEdge;
  readonly from: Vec3;
  readonly to: Vec3;
  readonly structural: boolean;
  readonly label: string;
}): Joint {
  const throughFrom = localOf(params.through, params.from);
  const throughTo = localOf(params.through, params.to);
  const abuttingFrom = localOf(params.abutting, params.from);
  const abuttingTo = localOf(params.abutting, params.to);
  const axis = edgeRunsAlong(params.abuttingEdge);

  return {
    id: params.id,
    throughPartId: params.through.id,
    throughFace: params.throughFace,
    line: {
      from: { l: throughFrom.l, w: throughFrom.w },
      to: { l: throughTo.l, w: throughTo.w },
    },
    abuttingPartId: params.abutting.id,
    abuttingEdge: params.abuttingEdge,
    abuttingAlong: {
      from: axis === "w" ? abuttingFrom.w : abuttingFrom.l,
      to: axis === "w" ? abuttingTo.w : abuttingTo.l,
    },
    structural: params.structural,
    label: params.label,
  };
}

export function jointLength(joint: Joint): number {
  const dl = joint.line.to.l - joint.line.from.l;
  const dw = joint.line.to.w - joint.line.from.w;
  return Math.hypot(dl, dw);
}

/** Interpolates a point on the joint line in the through panel's coordinates. */
export function jointPointOnFace(
  joint: Joint,
  u: number,
): { l: number; w: number } {
  return {
    l: joint.line.from.l + (joint.line.to.l - joint.line.from.l) * u,
    w: joint.line.from.w + (joint.line.to.w - joint.line.from.w) * u,
  };
}

/** The matching position along the abutting panel's edge. */
export function jointPointOnEdge(joint: Joint, u: number): number {
  return (
    joint.abuttingAlong.from +
    (joint.abuttingAlong.to - joint.abuttingAlong.from) * u
  );
}

/* --------------------------------------------------------------- hardware - */

export type HardwareKind =
  | "hinge"
  | "hinge-plate"
  | "slide"
  | "handle"
  | "rail"
  | "rail-support"
  | "rail-centre-support"
  | "connector"
  | "shelf-support"
  | "levelling-leg"
  | "wall-bracket"
  | "push-latch"
  | "drawer-locking-device";

/** One line of the hardware bill of materials before aggregation. */
export type HardwareUse = {
  readonly kind: HardwareKind;
  readonly catalogId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unit: "each" | "pair" | "metre";
  readonly unitPrice: number;
  readonly note?: string;
};
