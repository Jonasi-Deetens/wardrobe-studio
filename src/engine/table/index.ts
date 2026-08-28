import { getMaterial } from "../catalog/materials";
import { getProfile } from "../catalog/profiles";
import {
  deck,
  flange,
  flatten,
  foldsOf,
  turnedDownTray,
  type FlatPattern,
} from "../core/flat";
import { boxOfPoints, unionBox, type Box3, type Vec3 } from "../core/geometry";
import type { Member, MemberOp, Weld } from "../core/member";
import { partBounds, type Fold, type Part } from "../core/part";
import { mm2 } from "../core/units";
import { buildTableFrame } from "../frame";
import type { HardwareUse } from "../solver/draft";
import type { WorkTableSpec, WorkTableUnitSpec } from "../spec/types";

/**
 * A commercial stainless work table.
 *
 * The construction is the one every catering supplier builds, because it is the one that
 * survives a kitchen:
 *
 * - **The top is one folded sheet, not a panel on a frame.** A 1.5mm sheet laid flat would
 *   drum and dent; turn 40mm of it down all round and it becomes a stiff tray, with no raw
 *   edge to cut a hand on and nowhere for water to sit.
 * - **The upstand is part of the same sheet.** A separate splashback bolted on leaves a seam
 *   at the worst possible place — the back of the surface, where everything drains to. Folded
 *   in one piece there is no seam at all, which is what makes it wipeable.
 * - **The legs carry the load, the rails only keep them square.** So the legs run the full
 *   height and the rails are cut to fit between them, leaving the leg's own face flat where
 *   the foot goes in and where the top sits down on it.
 * - **The feet are adjustable.** A kitchen floor is laid to a drain and is never level, and a
 *   table that rocks is a table nobody uses.
 *
 * Everything is solved in the unit's own space: origin on the floor at the back-left corner
 * of the top's footprint, +X right, +Y up, +Z towards the front.
 */

export type WorkTableModel = {
  readonly spec: WorkTableSpec;
  readonly unitId: string;
  readonly parts: readonly Part[];
  readonly members: readonly Member[];
  readonly welds: readonly Weld[];
  readonly hardware: readonly HardwareUse[];
  readonly bounds: Box3;
  /** Heights above the floor of the undershelves, lowest first. */
  readonly shelfHeights: readonly number[];
  /** Clear height under the frame, which is what decides whether it can be mopped under. */
  readonly clearUnder: number;
};

/** Inside bend radius on thin stainless: one thickness, which is what a standard tool gives. */
const BEND_RADIUS_FACTOR = 1;

/** How far the top oversails the leg frame, so a wiped edge does not run onto the legs. */
const TOP_OVERSAIL = 0;

export function solveWorkTable(spec: WorkTableUnitSpec, unitId: string): WorkTableModel {
  const id = (suffix: string): string => `${unitId}:${suffix}`;
  const topMaterial = getMaterial(spec.top.materialId);
  const legProfile = getProfile(spec.legs.profileId);

  const parts: Part[] = [];
  const hardware: HardwareUse[] = [];

  /* ------------------------------------------------------------------ top -- */

  const topThickness = topMaterial.thickness;
  const topY = mm2(spec.height - topThickness);
  parts.push(buildTop(spec, id("top"), unitId, topY, topThickness));

  /* ----------------------------------------------------------------- frame -- */

  /**
   * Feet take up height under the leg, so the leg is cut shorter by exactly that much and
   * the table still finishes at the height that was asked for. A bullet foot at mid travel
   * stands about 30mm proud; a braked castor is a different animal at 75.
   */
  const footAllowance = spec.legs.feet === "castor" ? 75 : spec.legs.feet === "bullet" ? 30 : 0;
  /* The frame stops under the top, so the legs plus the top come to the finished height. */
  const frameHeight = topY;
  const shelfHeights = shelfHeightsOf(spec, footAllowance);

  const frame = buildTableFrame({
    id: id("frame"),
    width: spec.width,
    depth: spec.depth,
    frameHeight,
    legProfileId: spec.legs.profileId,
    /* Rails in the same section as the legs: one length of tube for the whole table is
       cheaper than two, and it nests better in the bar. */
    railProfileId: spec.legs.profileId,
    legInset: spec.legs.inset + TOP_OVERSAIL,
    /* The top rail hangs just under the top, leaving room for the turned-down edge to pass
       outside it. */
    railDrop: Math.max(spec.top.edgeReturn + 5, 30),
    shelfRailHeights: shelfHeights.map((y) => mm2(y - shelfRailDrop(spec))),
    footAllowance,
    braced: spec.legs.braced,
    ground: spec.groundWelds,
  });

  /* Only the top ring is a "rail"; the shelf rings are stretchers. So this drills the four
     rails the top actually bolts down to, and nothing else. */
  const members = frame.members.map((member) => ({
    ...member,
    unitId,
    ...(member.role === "rail"
      ? { ops: [...member.ops, ...topFixingOps(member.id, member.length)] }
      : {}),
  }));

  /* ----------------------------------------------------------- undershelves -- */

  const shelfMaterial = getMaterial(spec.shelves.materialId);
  shelfHeights.forEach((y, index) => {
    parts.push(
      buildShelf(spec, id(`shelf-${index + 1}`), unitId, y, index, shelfMaterial.thickness),
    );
  });

  /* -------------------------------------------------------------- hardware -- */

  if (spec.legs.feet === "bullet") {
    hardware.push({
      kind: "levelling-leg",
      catalogId: "foot-bullet-m10",
      name: "Adjustable bullet foot, M10 stem, stainless",
      quantity: 4,
      unit: "each",
      unitPrice: 3.4,
      note: "Screws into the M10 insert welded inside each leg. 30mm of adjustment.",
    });
  }
  if (spec.legs.feet === "castor") {
    hardware.push({
      kind: "levelling-leg",
      catalogId: "castor-braked-75",
      name: "Braked castor, 75mm, stainless housing",
      quantity: 4,
      unit: "each",
      unitPrice: 11.5,
      note: "Two braked and two free is enough; four braked is easier to specify and to buy.",
    });
  }

  /* The top is not welded to the frame. It is bolted down through the rails, because a weld
     from underneath pulls the sheet and leaves a visible dent in the work surface. */
  hardware.push({
    kind: "connector",
    catalogId: "bolt-m6-top",
    name: "M6 x 16 flanged bolt and nyloc nut",
    quantity: members.reduce(
      (count, member) =>
        count + member.ops.filter((op) => op.purpose === "top-fixing").length,
      0,
    ),
    unit: "each",
    unitPrice: 0.24,
    note: "Up through the top rail into a captive nut on a bracket welded to the underside of the top, so nothing is welded to the work surface itself.",
  });

  if (shelfHeights.length > 0) {
    hardware.push({
      kind: "shelf-support",
      catalogId: "clip-shelf-tube",
      name: "Shelf clip for tube frame",
      quantity: 4 * shelfHeights.length,
      unit: "each",
      unitPrice: 0.9,
      note: "Locates each shelf corner on the rail ring without a fixing through the shelf.",
    });
  }

  const bounds = parts.reduce<Box3>(
    (acc, part) => unionBox(acc, partBounds(part)),
    unionBox(frame.bounds, boxOfPoints([[0, 0, 0], [spec.width, spec.height, spec.depth]])),
  );

  return {
    spec,
    unitId,
    parts,
    members,
    welds: frame.welds.map((weld) => ({ ...weld, id: weld.id })),
    hardware,
    bounds,
    shelfHeights,
    clearUnder: mm2(Math.max(shelfHeights[0] ?? frameHeight, 0) - legProfile.height),
  };
}

/**
 * The folded top, as a flat blank with its bend lines.
 *
 * The blank runs the finished size plus one flange per folded edge, less the bend deduction
 * at each bend. Getting that arithmetic right is the whole point of doing it here rather than
 * on the shop floor: a blank cut to the finished size makes a top that is 80mm too narrow
 * once it is folded, and there is no fixing it.
 */
function buildTop(
  spec: WorkTableSpec,
  partId: string,
  unitId: string,
  y: number,
  thickness: number,
): Part {
  const radius = mm2(thickness * BEND_RADIUS_FACTOR);

  const skirt = spec.top.edge === "square" ? 0 : spec.top.edgeReturn;
  /* A boxed edge turns down and then back in under itself: two bends per edge, and the
     tucked-back leg is about half the skirt. */
  const boxReturn = spec.top.edge === "boxed" ? Math.max(spec.top.edgeReturn / 2, 15) : 0;
  const upstand = spec.top.upstand;
  const upstandReturn = upstand > 0 ? spec.top.upstandReturn : 0;

  /* The blank across the depth, walked from the back edge of the sheet to the front. */
  const acrossDepth = flatten(
    [
      ...(upstand > 0
        ? [
            ...(upstandReturn > 0
              ? [
                  flange(
                    upstandReturn,
                    "up",
                    "Top of the upstand, folded back towards the wall so there is no raw edge",
                  ),
                ]
              : []),
            flange(
              upstand,
              "up",
              `${upstand}mm upstand from the same sheet, so there is no seam where everything drains to`,
            ),
          ]
        : skirt > 0
          ? [
              ...(boxReturn > 0 ? [flange(boxReturn, "down", "Boxed edge, tucked back under")] : []),
              flange(skirt, "down", "Back edge, turned down"),
            ]
          : []),
      deck(spec.depth),
      ...(skirt > 0
        ? [
            flange(skirt, "down", "Front edge, turned down"),
            ...(boxReturn > 0 ? [flange(boxReturn, "down", "Boxed edge, tucked back under")] : []),
          ]
        : []),
    ],
    thickness,
  );

  /* And across the width, where both ends are simply turned down. */
  const acrossWidth = flatten(
    [
      ...(skirt > 0
        ? [
            ...(boxReturn > 0 ? [flange(boxReturn, "down", "Boxed edge, tucked back under")] : []),
            flange(skirt, "down", "Left end, turned down"),
          ]
        : []),
      deck(spec.width),
      ...(skirt > 0
        ? [
            flange(skirt, "down", "Right end, turned down"),
            ...(boxReturn > 0 ? [flange(boxReturn, "down", "Boxed edge, tucked back under")] : []),
          ]
        : []),
    ],
    thickness,
  );

  const folds: Fold[] = foldsOf(partId, acrossWidth, acrossDepth, radius);

  const blankLength = acrossWidth.total;
  const blankWidth = acrossDepth.total;

  const notes: string[] = [
    `Finished ${spec.width} x ${spec.depth}${upstand > 0 ? ` with a ${upstand}mm upstand` : ""}, ${spec.top.edge === "boxed" ? "boxed" : spec.top.edge === "square" ? "square" : `${spec.top.edgeReturn}mm turned-down`} edge.`,
    "Brushed finish runs along the length. Fold with the brushing outwards.",
  ];
  if (spec.top.edge !== "square") {
    notes.push(
      "The corners are notched before folding and welded up afterwards, then ground and re-brushed.",
    );
  }

  return {
    id: partId,
    unitId,
    role: "worktop",
    label: "Work top",
    materialId: spec.top.materialId,
    length: spec.width,
    width: spec.depth,
    blank: { length: blankLength, width: blankWidth },
    thickness,
    grain: "length",
    edgeLabels: { l0: "left", l1: "right", w0: "back", w1: "front" },
    banding: {},
    placement: {
      origin: [0, y, spec.depth] as Vec3,
      lAxis: [1, 0, 0],
      wAxis: [0, 0, -1],
      tAxis: [0, 1, 0],
    },
    ops: [],
    folds,
    notes,
  };
}

/**
 * An undershelf, sitting on the rail ring.
 *
 * Cut to the clear size between the legs rather than the full footprint, because it drops
 * in from above between them — which is also what lets it be lifted out to be washed.
 */
function buildShelf(
  spec: WorkTableSpec,
  partId: string,
  unitId: string,
  y: number,
  index: number,
  thickness: number,
): Part {
  const leg = getProfile(spec.legs.profileId);
  const clearWidth = mm2(spec.width - 2 * (spec.legs.inset + leg.width) + 2 * SHELF_LAP);
  const clearDepth = mm2(spec.depth - 2 * (spec.legs.inset + leg.height) + 2 * SHELF_LAP);
  const radius = mm2(thickness * BEND_RADIUS_FACTOR);
  const skirt = spec.shelves.edgeReturn;

  const { acrossLength: acrossDepth, acrossWidth } = turnedDownTray(
    { length: clearWidth, width: clearDepth },
    skirt,
    thickness,
  );
  const folds: Fold[] = foldsOf(partId, acrossWidth, acrossDepth, radius);

  return {
    id: partId,
    unitId,
    role: "undershelf",
    label: `Undershelf ${index + 1}`,
    materialId: spec.shelves.materialId,
    length: clearWidth,
    width: clearDepth,
    ...(skirt > 0
      ? { blank: { length: acrossWidth.total, width: acrossDepth.total }, folds }
      : {}),
    thickness,
    grain: "length",
    edgeLabels: { l0: "left", l1: "right", w0: "back", w1: "front" },
    banding: {},
    placement: {
      origin: [
        mm2(spec.legs.inset + leg.width - SHELF_LAP),
        y,
        mm2(spec.depth - (spec.legs.inset + leg.height) + SHELF_LAP),
      ] as Vec3,
      lAxis: [1, 0, 0],
      wAxis: [0, 0, -1],
      tAxis: [0, 1, 0],
    },
    ops: [],
    notes:
      skirt > 0
        ? [`Edges turned down ${skirt}mm, which is what stops a thin shelf drumming.`]
        : [],
  };
}

/** How far the shelf laps over the rails it sits on. */
const SHELF_LAP = 10;

/** How far below the shelf its rail ring sits: the shelf rests on top of the rail. */
function shelfRailDrop(spec: WorkTableSpec): number {
  return getMaterial(spec.shelves.materialId).thickness;
}

function shelfHeightsOf(spec: WorkTableSpec, footAllowance: number): number[] {
  const count = Math.max(0, Math.min(Math.round(spec.shelves.count), 2));
  if (count === 0) return [];
  const lowest = Math.max(spec.shelves.lowest, footAllowance + 50);
  const heights = [lowest];
  if (count > 1) heights.push(mm2(lowest + Math.max(spec.shelves.spacing, 150)));
  return heights.map(mm2);
}

/** A one-line description for the unit list and the booklet. */
export function describeWorkTable(spec: WorkTableSpec): string {
  const material = getMaterial(spec.top.materialId);
  const legs = getProfile(spec.legs.profileId);
  const shelves = Math.max(0, Math.min(Math.round(spec.shelves.count), 2));
  return [
    `${spec.width} x ${spec.depth} x ${spec.height} high`,
    `${material.shortName} top${spec.top.upstand > 0 ? ` with a ${spec.top.upstand}mm upstand` : ""}`,
    `${legs.shortName} legs`,
    shelves === 0 ? "no undershelf" : `${shelves} undershelf${shelves > 1 ? "s" : ""}`,
  ].join(" · ");
}

/** Holes for bolting the top down, added to the top rails. */
export function topFixingOps(memberId: string, length: number): readonly MemberOp[] {
  const positions = [length * 0.25, length * 0.75];
  return positions.map((along, index) => ({
    kind: "hole" as const,
    id: `${memberId}-top-fix-${index}`,
    along: mm2(along),
    face: "t1" as const,
    across: 0,
    diameter: 7,
    through: false,
    purpose: "top-fixing" as const,
    note: "M6 clearance for the bolt that holds the top down",
  }));
}
