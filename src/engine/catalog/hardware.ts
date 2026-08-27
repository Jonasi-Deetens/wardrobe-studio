/**
 * Hardware geometry. These numbers are the whole reason the drilling drawings can
 * be trusted, so each one is either an industry constant or taken from a
 * manufacturer's planning data.
 */

/* ------------------------------------------------------------------ hinges - */

/**
 * A concealed hinge.
 *
 * Overlay follows the standard relation used by every European hinge maker:
 *
 *     overlay = fixedDistance + boringDistance - plateHeight
 *
 * `fixedDistance` is how far the cup overlays the side panel with a 0mm plate,
 * `boringDistance` is the distance from the door edge to the near side of the
 * Ø35mm cup, and `plateHeight` is the thickness of the mounting plate.
 */
export type HingeSpec = {
  readonly id: string;
  readonly name: string;
  readonly openingAngle: number;
  /** Cup diameter, Ø35mm on everything in normal use. */
  readonly cupDiameter: number;
  /** Minimum drilling depth for the cup. */
  readonly cupDepth: number;
  /** Diameter of the two cup fixing holes. */
  readonly fixingHoleDiameter: number;
  /** Centre-to-centre spacing of the two cup fixing holes. */
  readonly fixingHoleSpacing: number;
  /**
   * Distance from the cup centre line to the fixing hole line, across the door.
   * Positive means further from the door edge than the cup centre.
   */
  readonly fixingHoleOffset: number;
  readonly fixedDistance: number;
  /** Allowed range for the cup boring distance. */
  readonly boringDistanceRange: readonly [min: number, max: number];
  /** Mounting plate hole spacing along the panel, always a multiple of 32. */
  readonly plateHoleSpacing: number;
  /** Mounting plate hole diameter. */
  readonly plateHoleDiameter: number;
  readonly plateHoleDepth: number;
  /** Plate heights this hinge is offered with. */
  readonly plateHeights: readonly number[];
  /** Recommended gap between adjacent fronts. */
  readonly frontGap: number;
  /** Maximum door leaf mass this hinge is rated for, kilograms per hinge. */
  readonly loadPerHinge: number;
  readonly pricePerHinge: number;
  readonly notes?: string;
};

export const HINGES: readonly HingeSpec[] = [
  {
    id: "clip-top-110",
    name: "CLIP top 110 degree, full overlay",
    openingAngle: 110,
    cupDiameter: 35,
    cupDepth: 13,
    fixingHoleDiameter: 8,
    fixingHoleSpacing: 45,
    fixingHoleOffset: 9.5,
    fixedDistance: 11,
    boringDistanceRange: [3, 7],
    plateHoleSpacing: 32,
    plateHoleDiameter: 5,
    plateHoleDepth: 13,
    plateHeights: [0, 3, 6, 9],
    frontGap: 3,
    loadPerHinge: 8,
    pricePerHinge: 3.4,
    notes:
      "The default. Bored at 4.5mm with a 3mm plate it gives a 17.5mm overlay, which suits an 18mm side panel.",
  },
  {
    id: "clip-top-155",
    name: "CLIP top 155 degree, wide opening",
    openingAngle: 155,
    cupDiameter: 35,
    cupDepth: 13,
    fixingHoleDiameter: 8,
    fixingHoleSpacing: 45,
    fixingHoleOffset: 9.5,
    fixedDistance: 11,
    boringDistanceRange: [3, 7],
    plateHoleSpacing: 32,
    plateHoleDiameter: 5,
    plateHoleDepth: 13,
    plateHeights: [0, 3, 6, 9],
    frontGap: 3,
    loadPerHinge: 7,
    pricePerHinge: 6.9,
    notes: "Use where a drawer behind the door has to clear the open leaf.",
  },
  {
    id: "clip-top-95-inset",
    name: "CLIP top 95 degree, inset",
    openingAngle: 95,
    cupDiameter: 35,
    cupDepth: 13,
    fixingHoleDiameter: 8,
    fixingHoleSpacing: 45,
    fixingHoleOffset: 9.5,
    fixedDistance: 1.5,
    boringDistanceRange: [3, 7],
    plateHoleSpacing: 32,
    plateHoleDiameter: 5,
    plateHoleDepth: 13,
    plateHeights: [0, 3],
    frontGap: 3,
    loadPerHinge: 7,
    pricePerHinge: 5.2,
    notes: "For inset fronts, where the leaf sits inside the carcase opening.",
  },
  {
    id: "clip-top-110-halfoverlay",
    name: "CLIP top 110 degree, half overlay",
    openingAngle: 110,
    cupDiameter: 35,
    cupDepth: 13,
    fixingHoleDiameter: 8,
    fixingHoleSpacing: 45,
    fixingHoleOffset: 9.5,
    fixedDistance: 1.5,
    boringDistanceRange: [3, 7],
    plateHoleSpacing: 32,
    plateHoleDiameter: 5,
    plateHoleDepth: 13,
    plateHeights: [0, 3, 6, 9],
    frontGap: 3,
    loadPerHinge: 8,
    pricePerHinge: 4.1,
    notes: "For a shared divider carrying a leaf on each side.",
  },
];

export const HINGE_BY_ID = new Map(HINGES.map((h) => [h.id, h]));

export function getHinge(id: string): HingeSpec {
  const hinge = HINGE_BY_ID.get(id);
  if (!hinge) throw new Error(`Unknown hinge: ${id}`);
  return hinge;
}

/**
 * Hinges needed for a leaf of a given height. These bands are the standard trade
 * guidance; leaf mass can still push the count up, which the advisor checks
 * separately against `loadPerHinge`.
 */
export function hingeCountForHeight(height: number): number {
  if (height <= 900) return 2;
  if (height <= 1600) return 3;
  if (height <= 2000) return 4;
  if (height <= 2400) return 5;
  return 6;
}

/* ------------------------------------------------------- drawer slides ---- */

export type SlideMount = "undermount" | "side-mount";

export type SlideSpec = {
  readonly id: string;
  readonly name: string;
  readonly mount: SlideMount;
  /** Nominal length, which is also the usable box depth. */
  readonly lengths: readonly number[];
  /**
   * Total width the pair of runners takes out of the opening. The drawer box
   * inside width is `opening - clearance - 2 * boxSideThickness`.
   */
  readonly widthClearance: number;
  /** Space needed below the drawer box for the runner. */
  readonly bottomClearance: number;
  /** Space to leave above the box so it can be lifted out. */
  readonly topClearance: number;
  /** Setback of the runner front from the carcase front edge. */
  readonly frontSetback: number;
  /** Height of the first runner fixing hole above the bottom of the opening. */
  readonly firstFixingHeight: number;
  /** Fixing hole spacing along the runner, a multiple of 32. */
  readonly fixingSpacing: number;
  readonly fixingHoleDiameter: number;
  readonly fixingHoleDepth: number;
  /** Diameter of the locking device hole in the drawer bottom. */
  readonly lockingHoleDiameter: number;
  /** Distance from the box front to the locking device hole. */
  readonly lockingHoleFromFront: number;
  /** Rear notch in the drawer bottom for the rear hook. */
  readonly rearNotch: { readonly width: number; readonly depth: number } | null;
  readonly maxLoad: number;
  readonly pricePerPair: number;
  readonly notes?: string;
};

export const SLIDES: readonly SlideSpec[] = [
  {
    id: "undermount-softclose",
    name: "Undermount runner, soft close",
    mount: "undermount",
    lengths: [270, 300, 350, 400, 450, 500, 550, 600],
    widthClearance: 49,
    bottomClearance: 14,
    topClearance: 6,
    frontSetback: 3,
    firstFixingHeight: 37,
    fixingSpacing: 32,
    fixingHoleDiameter: 5,
    fixingHoleDepth: 13,
    lockingHoleDiameter: 6,
    lockingHoleFromFront: 11,
    rearNotch: { width: 35, depth: 13 },
    maxLoad: 30,
    pricePerPair: 19.5,
    notes:
      "Hidden under the box, so the drawer sides stay clean. Box inside width is the opening minus 49mm for 19mm sides.",
  },
  {
    id: "undermount-heavy",
    name: "Undermount runner, heavy duty",
    mount: "undermount",
    lengths: [300, 350, 400, 450, 500, 550, 600, 650],
    widthClearance: 49,
    bottomClearance: 14,
    topClearance: 6,
    frontSetback: 3,
    firstFixingHeight: 37,
    fixingSpacing: 32,
    fixingHoleDiameter: 5,
    fixingHoleDepth: 13,
    lockingHoleDiameter: 6,
    lockingHoleFromFront: 11,
    rearNotch: { width: 35, depth: 13 },
    maxLoad: 60,
    pricePerPair: 34,
  },
  {
    id: "side-mount-ballbearing",
    name: "Side-mount ball bearing runner",
    mount: "side-mount",
    lengths: [300, 350, 400, 450, 500, 550, 600],
    widthClearance: 25.4,
    bottomClearance: 3,
    topClearance: 3,
    frontSetback: 0,
    firstFixingHeight: 37,
    fixingSpacing: 32,
    fixingHoleDiameter: 5,
    fixingHoleDepth: 13,
    lockingHoleDiameter: 0,
    lockingHoleFromFront: 0,
    rearNotch: null,
    maxLoad: 35,
    pricePerPair: 11,
    notes:
      "Cheapest option, but the runner is visible inside the drawer and eats 12.7mm each side.",
  },
];

export const SLIDE_BY_ID = new Map(SLIDES.map((s) => [s.id, s]));

export function getSlide(id: string): SlideSpec {
  const slide = SLIDE_BY_ID.get(id);
  if (!slide) throw new Error(`Unknown slide: ${id}`);
  return slide;
}

/** Longest runner that fits a carcase of the given internal depth. */
export function slideLengthForDepth(slide: SlideSpec, internalDepth: number): number {
  const usable = internalDepth - 10;
  const fitting = slide.lengths.filter((l) => l <= usable);
  return fitting.at(-1) ?? (slide.lengths[0] as number);
}

/* -------------------------------------------------------------- handles --- */

export type HandleKind =
  | "bar"
  | "knob"
  | "recessed"
  | "push-to-open"
  | "profile-groove"
  | "edge-pull";

export type HandleSpec = {
  readonly id: string;
  readonly name: string;
  readonly kind: HandleKind;
  /** Centre-to-centre distance of the fixing holes. 0 for a single-hole knob. */
  readonly centres: number;
  readonly fixingHoleDiameter: number;
  /** Overall length, used for the 3D representation. */
  readonly length: number;
  readonly projection: number;
  readonly pricePerUnit: number;
  /** Whether the front needs any drilling at all. */
  readonly needsDrilling: boolean;
  readonly notes?: string;
};

export const HANDLES: readonly HandleSpec[] = [
  {
    id: "bar-128",
    name: "Bar handle, 128mm centres",
    kind: "bar",
    centres: 128,
    fixingHoleDiameter: 5,
    length: 148,
    projection: 32,
    pricePerUnit: 6.5,
    needsDrilling: true,
  },
  {
    id: "bar-192",
    name: "Bar handle, 192mm centres",
    kind: "bar",
    centres: 192,
    fixingHoleDiameter: 5,
    length: 212,
    projection: 32,
    pricePerUnit: 8.2,
    needsDrilling: true,
  },
  {
    id: "bar-320",
    name: "Bar handle, 320mm centres",
    kind: "bar",
    centres: 320,
    fixingHoleDiameter: 5,
    length: 340,
    projection: 34,
    pricePerUnit: 12.4,
    needsDrilling: true,
  },
  {
    id: "knob-30",
    name: "Knob, 30mm",
    kind: "knob",
    centres: 0,
    fixingHoleDiameter: 5,
    length: 30,
    projection: 28,
    pricePerUnit: 4.2,
    needsDrilling: true,
  },
  {
    id: "recessed-oval",
    name: "Recessed oval pull",
    kind: "recessed",
    centres: 0,
    fixingHoleDiameter: 0,
    length: 120,
    projection: 0,
    pricePerUnit: 9.8,
    needsDrilling: false,
    notes: "Needs a routed pocket rather than holes; shown as a cutout.",
  },
  {
    id: "push-to-open",
    name: "Push to open latch, handleless",
    kind: "push-to-open",
    centres: 0,
    fixingHoleDiameter: 0,
    length: 0,
    projection: 0,
    pricePerUnit: 5.4,
    needsDrilling: false,
    notes:
      "No drilling in the front. The latch mounts to the carcase, so leave a 2mm gap for the front to travel.",
  },
  {
    id: "profile-groove",
    name: "Integrated groove, milled in the front",
    kind: "profile-groove",
    centres: 0,
    fixingHoleDiameter: 0,
    length: 0,
    projection: 0,
    pricePerUnit: 0,
    needsDrilling: false,
    notes: "A 20 x 12mm groove along the top edge of the front, on the back face.",
  },
  {
    id: "edge-pull",
    name: "Edge pull, screwed to the front edge",
    kind: "edge-pull",
    centres: 96,
    fixingHoleDiameter: 4,
    length: 200,
    projection: 12,
    pricePerUnit: 11,
    needsDrilling: true,
  },
];

export const HANDLE_BY_ID = new Map(HANDLES.map((h) => [h.id, h]));

export function getHandle(id: string): HandleSpec {
  const handle = HANDLE_BY_ID.get(id);
  if (!handle) throw new Error(`Unknown handle: ${id}`);
  return handle;
}

/* --------------------------------------------------------- hanging rails - */

export type RailSpec = {
  readonly id: string;
  readonly name: string;
  /** Cross-section, for the 3D representation and for the support hole. */
  readonly profile: "round" | "oval";
  readonly width: number;
  readonly height: number;
  /** Span beyond which a centre support is required. */
  readonly maxSpan: number;
  /** Diameter of the hole the end support screws into. */
  readonly supportHoleDiameter: number;
  readonly supportHoleDepth: number;
  /** Centre of the rail below the shelf or top above it. */
  readonly dropBelowShelf: number;
  readonly pricePerMetre: number;
  readonly pricePerSupport: number;
};

export const RAILS: readonly RailSpec[] = [
  {
    id: "round-25",
    name: "Round rail, 25mm chrome tube",
    profile: "round",
    width: 25,
    height: 25,
    maxSpan: 900,
    supportHoleDiameter: 5,
    supportHoleDepth: 13,
    dropBelowShelf: 60,
    pricePerMetre: 7.5,
    pricePerSupport: 2.8,
  },
  {
    id: "oval-30x15",
    name: "Oval rail, 30 x 15mm",
    profile: "oval",
    width: 30,
    height: 15,
    maxSpan: 1100,
    supportHoleDiameter: 5,
    supportHoleDepth: 13,
    dropBelowShelf: 55,
    pricePerMetre: 9.2,
    pricePerSupport: 3.4,
  },
  {
    id: "oval-30x15-heavy",
    name: "Oval rail, 30 x 15mm reinforced",
    profile: "oval",
    width: 30,
    height: 15,
    maxSpan: 1300,
    supportHoleDiameter: 5,
    supportHoleDepth: 13,
    dropBelowShelf: 55,
    pricePerMetre: 14,
    pricePerSupport: 4.1,
  },
];

export const RAIL_BY_ID = new Map(RAILS.map((r) => [r.id, r]));

export function getRail(id: string): RailSpec {
  const rail = RAIL_BY_ID.get(id);
  if (!rail) throw new Error(`Unknown rail: ${id}`);
  return rail;
}

/* ----------------------------------------------------- carcase connectors - */

export type ConnectorKind = "dowel" | "confirmat" | "cam" | "lamello" | "screw";

export type ConnectorSpec = {
  readonly id: string;
  readonly kind: ConnectorKind;
  readonly name: string;
  /** Hole drilled into the face of the through panel. */
  readonly faceHole: { readonly diameter: number; readonly depth: number };
  /** Hole drilled into the edge of the abutting panel. */
  readonly edgeHole: { readonly diameter: number; readonly depth: number };
  /**
   * Second face hole, where the fitting needs one. Cam fittings need a large
   * housing bore in the face plus a small bolt hole in the edge.
   */
  readonly housing?: { readonly diameter: number; readonly depth: number };
  /** Whether the fitting can be undone and reassembled. */
  readonly demountable: boolean;
  /** Whether the fixing head shows on the outside of the panel. */
  readonly visible: boolean;
  /** Nominal spacing between fittings along a joint. */
  readonly spacing: number;
  /** Distance from the end of a joint to the first fitting. */
  readonly endInset: number;
  readonly pricePerUnit: number;
  readonly notes?: string;
};

export const CONNECTORS: readonly ConnectorSpec[] = [
  {
    id: "dowel-8x30",
    kind: "dowel",
    name: "Wood dowel 8 x 30mm, glued",
    faceHole: { diameter: 8, depth: 12 },
    edgeHole: { diameter: 8, depth: 20 },
    demountable: false,
    visible: false,
    spacing: 128,
    endInset: 48,
    pricePerUnit: 0.04,
    notes:
      "Strongest and cleanest joint, and invisible. Needs accurate boring and glue-up in one go.",
  },
  {
    id: "confirmat-7x50",
    kind: "confirmat",
    name: "Confirmat screw 7 x 50mm",
    faceHole: { diameter: 7, depth: 20 },
    edgeHole: { diameter: 5, depth: 40 },
    demountable: true,
    visible: true,
    spacing: 160,
    endInset: 50,
    pricePerUnit: 0.11,
    notes:
      "Fast, forgiving and strong in chipboard. The head shows, so cap it or keep it on a hidden face.",
  },
  {
    id: "cam-15",
    kind: "cam",
    name: "Eccentric cam and bolt, 15mm housing",
    faceHole: { diameter: 15, depth: 12.5 },
    edgeHole: { diameter: 5, depth: 34 },
    housing: { diameter: 15, depth: 12.5 },
    demountable: true,
    visible: true,
    spacing: 160,
    endInset: 50,
    pricePerUnit: 0.28,
    notes: "Flat-pack fitting. Take apart and rebuild as often as you like.",
  },
  {
    id: "lamello-cabineo",
    kind: "lamello",
    name: "Cabineo connector",
    faceHole: { diameter: 12, depth: 12 },
    edgeHole: { diameter: 6, depth: 12 },
    demountable: true,
    visible: true,
    spacing: 192,
    endInset: 64,
    pricePerUnit: 0.55,
    notes:
      "One-sided assembly from a single 12mm bore. Ideal when only one face is accessible.",
  },
  {
    id: "screw-4x50",
    kind: "screw",
    name: "Chipboard screw 4 x 50mm",
    faceHole: { diameter: 4.5, depth: 20 },
    edgeHole: { diameter: 2.5, depth: 35 },
    demountable: true,
    visible: true,
    spacing: 160,
    endInset: 45,
    pricePerUnit: 0.03,
    notes: "The simplest option. Weakest of the group, so keep the back panel in a groove.",
  },
];

export const CONNECTOR_BY_ID = new Map(CONNECTORS.map((c) => [c.id, c]));

export function getConnector(id: string): ConnectorSpec {
  const connector = CONNECTOR_BY_ID.get(id);
  if (!connector) throw new Error(`Unknown connector: ${id}`);
  return connector;
}

/* -------------------------------------------------------------- sundries - */

export type ShelfSupportSpec = {
  readonly id: string;
  readonly name: string;
  readonly holeDiameter: number;
  readonly holeDepth: number;
  readonly pricePerUnit: number;
  /** Whether it also stops the shelf lifting. */
  readonly locking: boolean;
};

export const SHELF_SUPPORTS: readonly ShelfSupportSpec[] = [
  { id: "pin-5", name: "Shelf pin, 5mm steel", holeDiameter: 5, holeDepth: 13, pricePerUnit: 0.08, locking: false },
  { id: "pin-5-locking", name: "Shelf pin with locking clip, 5mm", holeDiameter: 5, holeDepth: 13, pricePerUnit: 0.22, locking: true },
  { id: "pin-3", name: "Shelf pin, 3mm", holeDiameter: 3, holeDepth: 10, pricePerUnit: 0.05, locking: false },
];

export const SHELF_SUPPORT_BY_ID = new Map(SHELF_SUPPORTS.map((s) => [s.id, s]));

export function getShelfSupport(id: string): ShelfSupportSpec {
  const support = SHELF_SUPPORT_BY_ID.get(id);
  if (!support) throw new Error(`Unknown shelf support: ${id}`);
  return support;
}

export type LevellingLegSpec = {
  readonly id: string;
  readonly name: string;
  /** Range of heights the leg can be set to. */
  readonly range: readonly [min: number, max: number];
  /** Diameter of the mounting plate hole pattern. */
  readonly plateHoleDiameter: number;
  readonly plateHoleDepth: number;
  /** Inset of the leg centre from the panel edges. */
  readonly inset: number;
  readonly pricePerUnit: number;
};

export const LEVELLING_LEGS: readonly LevellingLegSpec[] = [
  { id: "leg-100", name: "Levelling leg, 100mm nominal", range: [95, 120], plateHoleDiameter: 4.5, plateHoleDepth: 14, inset: 50, pricePerUnit: 1.3 },
  { id: "leg-150", name: "Levelling leg, 150mm nominal", range: [140, 175], plateHoleDiameter: 4.5, plateHoleDepth: 14, inset: 50, pricePerUnit: 1.7 },
];

export const LEVELLING_LEG_BY_ID = new Map(LEVELLING_LEGS.map((l) => [l.id, l]));

export function getLevellingLeg(id: string): LevellingLegSpec {
  const leg = LEVELLING_LEG_BY_ID.get(id);
  if (!leg) throw new Error(`Unknown levelling leg: ${id}`);
  return leg;
}
