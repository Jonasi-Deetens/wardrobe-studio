import type { Placement, Vec3 } from "./geometry";
import { boxOfPoints, toWorld, type Box3 } from "./geometry";
import { mm } from "./units";

/**
 * A panel is the atomic unit of the whole app. It carries its as-cut size, where
 * it sits in the model, and a list of machining operations expressed in a single
 * panel-local coordinate system.
 *
 * Machining coordinates are always (l, w) measured from the panel-local origin,
 * for both faces. They are deliberately *not* mirrored for face B: the mirror is
 * a presentation concern, applied once in the drawing renderer and in the DXF
 * writer, so the data model has exactly one coordinate system per panel and
 * nothing downstream can disagree about where a hole is.
 */

export type PartRole =
  | "side"
  | "divider"
  | "top"
  | "bottom"
  | "fixed-shelf"
  | "adjustable-shelf"
  | "back"
  | "plinth-rail"
  | "stretcher"
  | "door"
  | "drawer-front"
  | "drawer-side"
  | "drawer-back"
  | "drawer-bottom"
  | "shoe-shelf"
  | "filler";

/** Which of the two large faces of the panel an operation applies to. */
export type PanelFace = "A" | "B";

/**
 * The four narrow edges, named by the local coordinate they sit on. Each part
 * also carries human labels for these (`edgeLabels`), so the UI can say "front"
 * or "top" while the data stays generic.
 */
export type PanelEdge = "l0" | "l1" | "w0" | "w1";

export const PANEL_EDGES: readonly PanelEdge[] = ["l0", "l1", "w0", "w1"];

export type EdgeLabels = Record<PanelEdge, string>;

/** Grain direction relative to the panel's own length axis. */
export type GrainDirection = "length" | "width" | "none";

/** What a machining operation is for. Drives colour, layer names and tool lists. */
export type OpPurpose =
  | "system-hole"
  | "shelf-pin"
  | "dowel"
  | "confirmat"
  | "cam-housing"
  | "cam-bolt"
  | "lamello"
  | "hinge-cup"
  | "hinge-cup-fixing"
  | "hinge-plate"
  | "slide-fixing"
  | "slide-front-fixing"
  | "drawer-lock"
  | "handle"
  | "rail-support"
  | "wall-anchor"
  | "leg-plate"
  | "back-groove"
  | "back-rabbet"
  | "shelf-groove"
  | "service-cutout"
  | "handle-groove";

export type Hole = {
  readonly kind: "hole";
  readonly id: string;
  readonly face: PanelFace;
  /** Distance along the length axis from the panel origin. */
  readonly l: number;
  /** Distance along the width axis from the panel origin. */
  readonly w: number;
  readonly diameter: number;
  readonly depth: number;
  readonly through: boolean;
  readonly purpose: OpPurpose;
  readonly note?: string;
};

/** A hole drilled into a narrow edge, as used for dowels and Confirmats. */
export type EdgeHole = {
  readonly kind: "edge-hole";
  readonly id: string;
  readonly edge: PanelEdge;
  /** Position along the edge, measured from the panel origin end of that edge. */
  readonly along: number;
  /** Position through the thickness, measured from face B (local t = 0). */
  readonly acrossThickness: number;
  readonly diameter: number;
  readonly depth: number;
  readonly purpose: OpPurpose;
  readonly note?: string;
};

/** A straight groove or dado cut into a face. */
export type Groove = {
  readonly kind: "groove";
  readonly id: string;
  readonly face: PanelFace;
  readonly from: { readonly l: number; readonly w: number };
  readonly to: { readonly l: number; readonly w: number };
  readonly width: number;
  readonly depth: number;
  readonly purpose: OpPurpose;
  readonly note?: string;
};

/** Material removed along a full edge, as used for a rear rabbet. */
export type Rabbet = {
  readonly kind: "rabbet";
  readonly id: string;
  readonly edge: PanelEdge;
  readonly face: PanelFace;
  readonly width: number;
  readonly depth: number;
  readonly purpose: OpPurpose;
  readonly note?: string;
};

/** An arbitrary opening, used for service holes and plinth notches. */
export type Cutout = {
  readonly kind: "cutout";
  readonly id: string;
  readonly outline: readonly { readonly l: number; readonly w: number }[];
  readonly through: boolean;
  readonly depth: number;
  readonly purpose: OpPurpose;
  readonly note?: string;
};

export type MachiningOp = Hole | EdgeHole | Groove | Rabbet | Cutout;

export type Part = {
  readonly id: string;
  readonly role: PartRole;
  /** Human label, e.g. "Side, left" or "Adjustable shelf, bay 2". */
  readonly label: string;
  /** Grouping key for identical parts in the cut list. */
  readonly materialId: string;
  /** As-cut length. Banding allowance is already deducted. */
  readonly length: number;
  /** As-cut width. Banding allowance is already deducted. */
  readonly width: number;
  readonly thickness: number;
  readonly grain: GrainDirection;
  readonly edgeLabels: EdgeLabels;
  /** Edge banding applied per edge, by banding id. */
  readonly banding: Partial<Record<PanelEdge, string>>;
  readonly placement: Placement;
  readonly ops: readonly MachiningOp[];
  /** Which bay or compartment the part belongs to, for filtering in the UI. */
  readonly bayId?: string;
  /** Set on doors and drawer fronts so the viewport can animate them. */
  readonly hinge?: {
    readonly side: "left" | "right";
    readonly openAngle: number;
  };
  /** Set on drawer parts so the viewport can slide the whole box together. */
  readonly drawerId?: string;
  /** Free-form notes shown on the panel drawing. */
  readonly notes?: readonly string[];
};

export function faceArea(part: Part): number {
  return part.length * part.width;
}

export function bandedEdgeLength(part: Part, edge: PanelEdge): number {
  return edge === "l0" || edge === "l1" ? part.width : part.length;
}

/** Total metres of edge banding this part needs. */
export function bandingLength(part: Part): number {
  return PANEL_EDGES.reduce(
    (sum, edge) => (part.banding[edge] ? sum + bandedEdgeLength(part, edge) : sum),
    0,
  );
}

/**
 * Just enough of a panel to say where it is: what the solver has while it is still
 * working, before a draft has been frozen into a Part.
 */
export type PanelBox = {
  readonly placement: Placement;
  readonly length: number;
  readonly width: number;
  readonly thickness: number;
};

/** The eight corners of the panel in assembly space. */
export function partCorners(part: PanelBox): Vec3[] {
  const { placement, length, width, thickness } = part;
  const corners: Vec3[] = [];
  for (const l of [0, length]) {
    for (const w of [0, width]) {
      for (const t of [0, thickness]) {
        corners.push(toWorld(placement, l, w, t));
      }
    }
  }
  return corners;
}

export function partBounds(part: PanelBox): Box3 {
  return boxOfPoints(partCorners(part));
}

/** Assembly-space centre of the panel, which is what the renderer positions. */
export function partCenter(part: Part): Vec3 {
  return toWorld(part.placement, part.length / 2, part.width / 2, part.thickness / 2);
}

/**
 * Assembly-space position of a machining operation's reference point, so the
 * viewport can draw holes and the UI can point at them.
 */
export function opWorldPosition(part: Part, op: MachiningOp): Vec3 {
  switch (op.kind) {
    case "hole": {
      const t = op.face === "A" ? part.thickness : 0;
      return toWorld(part.placement, op.l, op.w, t);
    }
    case "edge-hole": {
      switch (op.edge) {
        case "l0":
          return toWorld(part.placement, 0, op.along, op.acrossThickness);
        case "l1":
          return toWorld(part.placement, part.length, op.along, op.acrossThickness);
        case "w0":
          return toWorld(part.placement, op.along, 0, op.acrossThickness);
        case "w1":
          return toWorld(part.placement, op.along, part.width, op.acrossThickness);
      }
    }
    case "groove": {
      const t = op.face === "A" ? part.thickness : 0;
      return toWorld(
        part.placement,
        (op.from.l + op.to.l) / 2,
        (op.from.w + op.to.w) / 2,
        t,
      );
    }
    case "rabbet": {
      const t = op.face === "A" ? part.thickness : 0;
      switch (op.edge) {
        case "l0":
          return toWorld(part.placement, 0, part.width / 2, t);
        case "l1":
          return toWorld(part.placement, part.length, part.width / 2, t);
        case "w0":
          return toWorld(part.placement, part.length / 2, 0, t);
        case "w1":
          return toWorld(part.placement, part.length / 2, part.width, t);
      }
    }
    case "cutout": {
      const first = op.outline[0] ?? { l: 0, w: 0 };
      return toWorld(part.placement, first.l, first.w, part.thickness);
    }
  }
}

/** Counts holes by diameter, which is what the shop needs as a tool list. */
export function toolList(part: Part): { diameter: number; count: number; purposes: string[] }[] {
  const byDia = new Map<number, { count: number; purposes: Set<string> }>();
  for (const op of part.ops) {
    if (op.kind !== "hole" && op.kind !== "edge-hole") continue;
    const entry = byDia.get(op.diameter) ?? { count: 0, purposes: new Set<string>() };
    entry.count += 1;
    entry.purposes.add(op.purpose);
    byDia.set(op.diameter, entry);
  }
  return [...byDia.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([diameter, entry]) => ({
      diameter,
      count: entry.count,
      purposes: [...entry.purposes].sort(),
    }));
}

/**
 * Cut-list identity. Two parts collapse into one row only when every dimension,
 * material, banding pattern and machining operation matches, so the shop is never
 * told to cut two panels the same when one has an extra hole.
 */
export function partSignature(part: Part): string {
  const ops = [...part.ops]
    .map(opSignature)
    .sort()
    .join("|");
  const banding = (["l0", "l1", "w0", "w1"] as const)
    .map((edge) => part.banding[edge] ?? "-")
    .join(",");
  return [
    part.role,
    part.materialId,
    mm(part.length),
    mm(part.width),
    mm(part.thickness),
    part.grain,
    banding,
    ops,
  ].join("/");
}

function opSignature(op: MachiningOp): string {
  switch (op.kind) {
    case "hole":
      return `h:${op.face}:${mm(op.l)}:${mm(op.w)}:${op.diameter}:${op.depth}:${op.through}`;
    case "edge-hole":
      return `e:${op.edge}:${mm(op.along)}:${mm(op.acrossThickness)}:${op.diameter}:${op.depth}`;
    case "groove":
      return `g:${op.face}:${mm(op.from.l)}:${mm(op.from.w)}:${mm(op.to.l)}:${mm(op.to.w)}:${op.width}:${op.depth}`;
    case "rabbet":
      return `r:${op.edge}:${op.face}:${op.width}:${op.depth}`;
    case "cutout":
      return `c:${op.outline.map((p) => `${mm(p.l)},${mm(p.w)}`).join(";")}:${op.through}`;
  }
}

export const OP_PURPOSE_LABELS: Record<OpPurpose, string> = {
  "system-hole": "System hole",
  "shelf-pin": "Shelf pin",
  dowel: "Dowel",
  confirmat: "Confirmat",
  "cam-housing": "Cam housing",
  "cam-bolt": "Cam bolt",
  lamello: "Lamello connector",
  "hinge-cup": "Hinge cup",
  "hinge-cup-fixing": "Hinge cup fixing",
  "hinge-plate": "Hinge mounting plate",
  "slide-fixing": "Drawer slide fixing",
  "slide-front-fixing": "Drawer front fixing",
  "drawer-lock": "Drawer locking device",
  handle: "Handle fixing",
  "rail-support": "Hanging rail support",
  "wall-anchor": "Wall anchor",
  "leg-plate": "Levelling leg plate",
  "back-groove": "Back panel groove",
  "back-rabbet": "Back panel rabbet",
  "shelf-groove": "Shelf groove",
  "service-cutout": "Service cutout",
  "handle-groove": "Handle groove",
};

export const PART_ROLE_LABELS: Record<PartRole, string> = {
  side: "Side",
  divider: "Divider",
  top: "Top",
  bottom: "Bottom",
  "fixed-shelf": "Fixed shelf",
  "adjustable-shelf": "Adjustable shelf",
  back: "Back",
  "plinth-rail": "Plinth rail",
  stretcher: "Stretcher",
  door: "Door",
  "drawer-front": "Drawer front",
  "drawer-side": "Drawer side",
  "drawer-back": "Drawer back",
  "drawer-bottom": "Drawer bottom",
  "shoe-shelf": "Shoe shelf",
  filler: "Filler",
};
