import { getMaterial } from "../catalog/materials";
import { unionBox, type Box3, type Vec3 } from "../core/geometry";
import { partBounds, type Hole, type Part } from "../core/part";
import { mm2 } from "../core/units";
import type { HardwareUse } from "../solver/draft";
import type { CladdingFace, CladdingSpec } from "../spec/types";

/**
 * Cladding: a skin fixed over the outside of a finished unit.
 *
 * This runs after a unit has been solved, on its bounding box, and it is deliberately that
 * shallow. A slatted beach-bar front does not care whether what is behind it is a welded
 * frame or a chipboard carcase — it cares about the rectangle it has to cover and what it
 * screws to. Reading the box instead of the structure is what lets one implementation clad
 * every unit kind, and it is also honest about the joinery: cladding is a separate trade
 * from the carcase, fixed on last, and on site it is measured off the finished unit.
 *
 * What it produces is real work, not decoration:
 *
 * - **Boards, cut to length.** Whole pieces at the full run, and a final ripped piece where
 *   the face does not divide evenly, so the cut list totals the boards that get bought.
 * - **Counter-battens**, when the cladding stands off the unit. They run across the boards,
 *   because that is what the boards screw to, and they are what makes a ventilated cavity.
 * - **A fixing hole for every screw.** Two per crossing of a board and a batten, in the
 *   board's own coordinates, so the drilling plan and the hardware list agree — a screw
 *   count with no holes behind it is exactly the kind of thing that gets under-ordered.
 *
 * Face coordinates: each clad face is reduced to a rectangle with an origin, an "along"
 * axis running left to right *as seen from outside the face*, up, and an outward normal.
 * Everything below works in that frame, so all four faces share one implementation.
 */

export type CladdingResult = {
  readonly parts: readonly Part[];
  readonly hardware: readonly HardwareUse[];
  /** What the cladding adds to the unit's bounds, or null when there is none. */
  readonly bounds: Box3 | null;
};

const EMPTY: CladdingResult = { parts: [], hardware: [], bounds: null };

/** Batten spacing across the boards. 600 is the usual centres for a 19mm board. */
const BATTEN_SPACING = 600;

const BATTEN_WIDTH = 45;

/** Screws land this far in from each edge of a board. */
const FIXING_INSET = 22;

/** Anything narrower than this is not a board, it is a splinter: merge it instead. */
const MIN_PIECE = 25;

type FaceFrame = {
  readonly face: CladdingFace;
  /** Bottom-left corner of the clad rectangle, seen from outside, on the unit's surface. */
  readonly origin: Vec3;
  /** Left to right across the face, seen from outside. */
  readonly along: Vec3;
  /** Outward normal. */
  readonly out: Vec3;
  /** Horizontal extent of the face. */
  readonly run: number;
  readonly label: string;
};

export function solveCladding(spec: CladdingSpec, unitId: string, box: Box3): CladdingResult {
  if (spec.style === "none" || spec.faces.length === 0) return EMPTY;

  const material = getMaterial(spec.materialId);
  const thickness = material.thickness;
  const height = mm2(box.max[1] - box.min[1] + spec.riseAboveTop);
  if (height <= 0) return EMPTY;

  const parts: Part[] = [];
  const hardware: HardwareUse[] = [];
  let fixings = 0;

  const battened = spec.standoff > 0;
  const batten = battened ? battenMaterialFor(spec.standoff) : null;

  for (const frame of framesFor(spec.faces, box)) {
    if (frame.run <= 0) continue;
    const id = (suffix: string): string => `${unitId}:clad-${frame.face}-${suffix}`;

    /* Battens first: they sit on the unit and the boards sit on them, so the boards' own
       standoff is the batten thickness and the fixing lines are the batten centres. */
    const battenAt: number[] = [];
    if (batten) {
      const runs = battenRunsFor(frame, spec.direction, height);
      battenAt.push(...runs);
      runs.forEach((at, index) => {
        parts.push(
          battenPart(id(`batten-${index + 1}`), unitId, batten.id, batten.thickness, frame, {
            direction: spec.direction,
            at,
            height,
          }),
        );
      });
    }

    const pieces = piecesFor(spec, frame, height);
    pieces.forEach((piece, index) => {
      const crossings = battened
        ? battenAt.filter((at) => at >= piece.from - BATTEN_WIDTH && at <= piece.to)
        : // Screwed straight to the unit: the same 600 centres, but into whatever is behind.
          spanCentres(piece.length);
      const ops =
        spec.fixing === "glued"
          ? []
          : fixingOps(id(`piece-${index + 1}`), piece, crossings, thickness, battened);
      fixings += ops.length;

      parts.push({
        id: id(`piece-${index + 1}`),
        unitId,
        role: "cladding",
        label: `${frame.label} cladding, board ${index + 1} of ${pieces.length}`,
        materialId: spec.materialId,
        length: piece.length,
        width: piece.width,
        thickness,
        grain: material.hasGrain ? "length" : "none",
        edgeLabels: edgeLabelsFor(spec.direction),
        banding: {},
        placement: placementFor(frame, spec, piece, batten?.thickness ?? 0),
        ops,
        notes: notesFor(spec, piece, pieces.length, index),
      });
    });
  }

  if (parts.length === 0) return EMPTY;

  if (fixings > 0) {
    hardware.push(
      spec.fixing === "secret"
        ? {
            kind: "connector",
            catalogId: "clad-clip-secret",
            name: "Secret cladding clip, stainless",
            quantity: fixings,
            unit: "each",
            unitPrice: 0.42,
            note: "One clip per board per batten. Nothing shows on the face, and each board can still move.",
          }
        : {
            kind: "connector",
            catalogId: "screw-a2-4x50",
            name: "A2 stainless screw 4 x 50, countersunk",
            quantity: fixings,
            unit: "each",
            unitPrice: 0.11,
            note: "Two per board per batten, in the drilled holes. Stainless because a plated screw bleeds rust down the face.",
          },
    );
  }
  if (spec.fixing === "glued") {
    const area = parts
      .filter((part) => part.role === "cladding")
      .reduce((sum, part) => sum + part.length * part.width, 0);
    hardware.push({
      kind: "connector",
      catalogId: "adhesive-pu-310",
      name: "PU construction adhesive, 310ml",
      quantity: Math.max(1, Math.ceil(area / 3_000_000)),
      unit: "each",
      unitPrice: 8.4,
      note: "Beads at roughly 3 square metres a cartridge. Glue alone means the boards cannot be taken off again.",
    });
  }

  const bounds = parts.reduce<Box3 | null>(
    (acc, part) => (acc === null ? partBounds(part) : unionBox(acc, partBounds(part))),
    null,
  );

  return { parts, hardware, bounds };
}

/* ------------------------------------------------------------ face frames --- */

/**
 * The four faces of the unit's box, each as a rectangle seen from outside it.
 *
 * `along` reverses on the back and the right so that "board 1" is always the left-hand one
 * from where the board is looked at, which is how a fitter reads a cladding drawing.
 */
function framesFor(faces: readonly CladdingFace[], box: Box3): FaceFrame[] {
  const y = box.min[1];
  const x0 = box.min[0];
  const x1 = box.max[0];
  const z0 = box.min[2];
  const z1 = box.max[2];

  const all: Record<CladdingFace, FaceFrame> = {
    front: {
      face: "front",
      origin: [x0, y, z1],
      along: [1, 0, 0],
      out: [0, 0, 1],
      run: mm2(x1 - x0),
      label: "Front",
    },
    back: {
      face: "back",
      origin: [x1, y, z0],
      along: [-1, 0, 0],
      out: [0, 0, -1],
      run: mm2(x1 - x0),
      label: "Back",
    },
    left: {
      face: "left",
      origin: [x0, y, z0],
      along: [0, 0, 1],
      out: [-1, 0, 0],
      run: mm2(z1 - z0),
      label: "Left end",
    },
    right: {
      face: "right",
      origin: [x1, y, z1],
      along: [0, 0, -1],
      out: [1, 0, 0],
      run: mm2(z1 - z0),
      label: "Right end",
    },
  };

  const order: readonly CladdingFace[] = ["front", "left", "right", "back"];
  return order.filter((face) => faces.includes(face)).map((face) => all[face]);
}

/* ---------------------------------------------------------------- pieces --- */

type Piece = {
  /** Along the board. */
  readonly length: number;
  /** Across the board: its face width. */
  readonly width: number;
  /** Distance across the face to the near edge of this board. */
  readonly from: number;
  readonly to: number;
  /** Whether this board was ripped narrower to finish the face. */
  readonly ripped: boolean;
};

/**
 * The boards covering one face.
 *
 * A face almost never divides into a whole number of boards, and the two honest ways to
 * deal with that are to rip the last one or to open the gaps out. Ripping is what is done
 * on site — the gaps are a design decision and the offcut is not — so the last board is
 * narrowed, and if that would leave a sliver it is merged into the one before it instead.
 */
function piecesFor(spec: CladdingSpec, frame: FaceFrame, height: number): Piece[] {
  /* Vertical boards run up the face, so the length is the height and they are laid out
     across the run. Horizontal boards are the other way round. */
  const vertical = spec.direction === "vertical";
  const boardLength = vertical ? height : frame.run;
  const span = vertical ? frame.run : height;

  const gap = spec.style === "slats" ? spec.gap : 0;
  const pitch = mm2(spec.pieceWidth + gap);
  if (pitch <= 0 || span <= 0) return [];

  const pieces: Piece[] = [];
  let at = 0;
  while (at < span - 0.5) {
    const remaining = mm2(span - at);
    /* Last board: whatever is left, less the gap that would have followed it. */
    const width = mm2(Math.min(spec.pieceWidth, remaining));
    if (width < MIN_PIECE && pieces.length > 0) {
      /* A sliver: widen the previous board to swallow it, rather than cut something that
         would split as soon as a screw went near the end of it. */
      const last = pieces[pieces.length - 1] as Piece;
      pieces[pieces.length - 1] = {
        ...last,
        width: mm2(last.width + gap + width),
        to: mm2(at + width),
        ripped: true,
      };
      break;
    }
    pieces.push({
      length: boardLength,
      width,
      from: mm2(at),
      to: mm2(at + width),
      ripped: width < spec.pieceWidth - 0.5,
    });
    at = mm2(at + pitch);
  }
  return pieces;
}

function edgeLabelsFor(direction: CladdingSpec["direction"]) {
  return direction === "vertical"
    ? { l0: "bottom", l1: "top", w0: "left", w1: "right" }
    : { l0: "left", l1: "right", w0: "bottom", w1: "top" };
}

/**
 * Where a board sits in unit space.
 *
 * The board's length axis runs the way the board runs, its width axis crosses it, and its
 * thickness axis points out of the face — so face A is the visible face on every board of
 * every face of the unit, which is what makes the drilling plan readable.
 */
function placementFor(
  frame: FaceFrame,
  spec: CladdingSpec,
  piece: Piece,
  battenThickness: number,
) {
  const stand = mm2(battenThickness);
  const base: Vec3 = [
    frame.origin[0] + frame.out[0] * stand,
    frame.origin[1],
    frame.origin[2] + frame.out[2] * stand,
  ];
  const vertical = spec.direction === "vertical";

  if (vertical) {
    /* Length up, width across the face. */
    return {
      origin: alongFrom(base, frame, piece.from),
      lAxis: [0, 1, 0] as Vec3,
      wAxis: frame.along,
      tAxis: frame.out,
    };
  }
  /* Length across the face, width up. Boards are counted from the bottom. */
  return {
    origin: [base[0], mm2(base[1] + piece.from), base[2]] as Vec3,
    lAxis: frame.along,
    wAxis: [0, 1, 0] as Vec3,
    tAxis: frame.out,
  };
}

function alongFrom(base: Vec3, frame: FaceFrame, distance: number): Vec3 {
  return [
    mm2(base[0] + frame.along[0] * distance),
    base[1],
    mm2(base[2] + frame.along[2] * distance),
  ];
}

function notesFor(
  spec: CladdingSpec,
  piece: Piece,
  total: number,
  index: number,
): string[] | undefined {
  const notes: string[] = [];
  if (piece.ripped) {
    notes.push(
      index === total - 1
        ? `Ripped to ${piece.width}mm to finish the face. Put it at the end that is least seen.`
        : `Ripped to ${piece.width}mm.`,
    );
  }
  if (spec.style === "tongue-groove") {
    notes.push(
      "Tongue and groove: the face width is the covering width, so the tongue is extra and the board is bought wider.",
    );
  }
  if (spec.style === "slats" && spec.gap > 0) {
    notes.push(`${spec.gap}mm shadow gap to the next slat.`);
  }
  return notes.length > 0 ? notes : undefined;
}

/* --------------------------------------------------------------- battens --- */

/**
 * Battens come in stock thicknesses, so the standoff is snapped to one rather than the
 * batten being invented to match an arbitrary number.
 */
function battenMaterialFor(standoff: number) {
  const candidates = ["batten-20", "batten-45"].map((id) => getMaterial(id));
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate.thickness - standoff) < Math.abs(best.thickness - standoff)
      ? candidate
      : best,
  );
}

/** Batten positions across the boards: one at each end of the run, then even centres. */
function battenRunsFor(
  frame: FaceFrame,
  direction: CladdingSpec["direction"],
  height: number,
): number[] {
  /* Battens cross the boards, so vertical boards get horizontal battens laid out up the
     face, and horizontal boards get vertical battens laid out across the run. */
  const span = direction === "vertical" ? height : frame.run;
  return spanCentres(span);
}

/**
 * Positions along a span at roughly `BATTEN_SPACING` centres, including both ends.
 *
 * The ends are fixed points — a board with nothing at its end lifts — and the intermediate
 * ones are spread evenly rather than dropped at 600 with a short last bay, because an even
 * spacing is what a cladding drawing shows and what a fitter sets out.
 */
function spanCentres(span: number): number[] {
  const usable = mm2(span - BATTEN_WIDTH);
  if (usable <= 0) return [0];
  const bays = Math.max(1, Math.ceil(usable / BATTEN_SPACING));
  const step = usable / bays;
  return Array.from({ length: bays + 1 }, (_, index) => mm2(index * step));
}

function battenPart(
  partId: string,
  unitId: string,
  materialId: string,
  thickness: number,
  frame: FaceFrame,
  layout: { direction: CladdingSpec["direction"]; at: number; height: number },
): Part {
  const vertical = layout.direction === "vertical";
  /* Battens cross the boards: horizontal battens under vertical boards, and the reverse. */
  const length = vertical ? frame.run : layout.height;
  const along: Vec3 = vertical ? frame.along : [0, 1, 0];
  const origin: Vec3 = vertical
    ? [frame.origin[0], mm2(frame.origin[1] + layout.at), frame.origin[2]]
    : alongFrom(frame.origin, frame, layout.at);

  return {
    id: partId,
    unitId,
    role: "batten",
    label: `${frame.label} cladding batten`,
    materialId,
    length,
    width: BATTEN_WIDTH,
    thickness,
    grain: "length",
    edgeLabels: vertical
      ? { l0: "left", l1: "right", w0: "bottom", w1: "top" }
      : { l0: "bottom", l1: "top", w0: "left", w1: "right" },
    banding: {},
    placement: {
      origin,
      lAxis: along,
      /* Width runs the other way in the face plane, so the batten lies flat on the unit. */
      wAxis: vertical ? ([0, 1, 0] as Vec3) : frame.along,
      tAxis: frame.out,
    },
    ops: [],
    notes: [
      "Fixed to the unit first. Keeps the cladding off the structure so water can drain and air can move behind it.",
    ],
  };
}

/* --------------------------------------------------------------- fixings --- */

/**
 * Two holes at every crossing of a board and a batten.
 *
 * Two, not one, because a single central screw lets the board rotate and cup. They are in
 * the board's own coordinates: `l` along the board, `w` across it, which is where the
 * drilling plan and the DXF read them from.
 */
function fixingOps(
  partId: string,
  piece: Piece,
  crossings: readonly number[],
  thickness: number,
  battened: boolean,
): Hole[] {
  const ops: Hole[] = [];
  const across = piece.width;
  /* On a narrow slat there is no room for two, and one screw in the middle of a 40mm slat
     does not have the leverage to cup it anyway. */
  const inset = Math.min(FIXING_INSET, Math.max(6, across / 2 - 4));
  const positions = across > 2 * inset + 10 ? [inset, mm2(across - inset)] : [mm2(across / 2)];

  crossings.forEach((at, index) => {
    /* Crossings are measured along the board, because the battens always cross it. */
    const l = mm2(clamp(at + BATTEN_WIDTH / 2, 12, piece.length - 12));
    positions.forEach((w, side) => {
      ops.push({
        kind: "hole",
        id: `${partId}-fix-${index + 1}-${side + 1}`,
        face: "A",
        l,
        w,
        diameter: 4.5,
        depth: thickness,
        through: true,
        purpose: "cladding-fixing",
        note:
          index === 0
            ? `Countersunk clearance hole, ${battened ? "into the batten behind" : "into the unit behind"}.`
            : undefined,
      });
    });
  });
  return ops;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/** One line describing the cladding, for the booklet and the unit list. */
export function describeCladding(spec: CladdingSpec): string {
  if (spec.style === "none") return "No cladding";
  const material = getMaterial(spec.materialId);
  const faces = spec.faces.join(", ");
  const gap = spec.style === "slats" && spec.gap > 0 ? ` with a ${spec.gap}mm gap` : "";
  return `${material.shortName} ${spec.pieceWidth}mm ${spec.direction}${gap} on ${faces}`;
}
