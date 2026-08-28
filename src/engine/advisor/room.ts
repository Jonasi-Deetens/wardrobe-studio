import { boxOfPoints, boxOverlap, transformPoint, type Vec3 } from "../core/geometry";
import type { ProjectModel, UnitModel } from "../project";
import { ceilingHeightAt } from "../project/room";
import { mm2 } from "../core/units";
import type { Finding } from ".";

/**
 * Advice about the room rather than about any one unit.
 *
 * These are the mistakes that only exist once there is more than one thing in the room: a
 * unit that does not fit, two units in the same place, a door that cannot open, a gangway
 * nobody can walk down.
 *
 * Room checks are deliberately coarse. A unit's own panels are checked against each other
 * exactly, in the unit's own space, by the fit invariant; here the unit is a box on the
 * floor, because that is the level at which the question "will this arrangement work" is
 * actually asked.
 */

/** Below this a gangway between two units stops being usable. */
const MIN_WALKWAY = 900;

/** How much of a unit may stand outside the room before it counts as a mistake. */
const OUTSIDE_TOLERANCE = 1;

export function adviseProject(project: ProjectModel): Finding[] {
  return [
    ...outsideRoom(project),
    ...overlaps(project),
    ...underRoof(project),
    ...walkways(project),
    ...doorSwings(project),
    ...blockedOpenings(project),
  ];
}

function footprintBox(unit: UnitModel): {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
} {
  const xs = unit.footprint.map((corner) => corner[0]);
  const zs = unit.footprint.map((corner) => corner[2]);
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    z0: Math.min(...zs),
    z1: Math.max(...zs),
  };
}

function outsideRoom(project: ProjectModel): Finding[] {
  const room = project.spec.room;
  const out: Finding[] = [];

  for (const unit of project.units) {
    const box = footprintBox(unit);
    const over = [
      box.x0 < -OUTSIDE_TOLERANCE ? "past the left wall" : null,
      box.x1 > room.width + OUTSIDE_TOLERANCE ? "past the right wall" : null,
      box.z0 < -OUTSIDE_TOLERANCE ? "through the back wall" : null,
      box.z1 > room.depth + OUTSIDE_TOLERANCE ? "past the front wall" : null,
    ].filter((reason): reason is string => reason !== null);

    if (over.length === 0) continue;
    out.push({
      id: `unit-outside-${unit.id}`,
      severity: "error",
      title: `${unit.name} stands outside the room`,
      detail: `It reaches ${over.join(" and ")}. Move it back inside, or make the room bigger — the walls are what the wall fixings pull against.`,
      parameter: "units",
      unitId: unit.id,
    });
  }

  return out;
}

function overlaps(project: ProjectModel): Finding[] {
  const out: Finding[] = [];
  const units = project.units;

  for (let i = 0; i < units.length; i += 1) {
    for (let j = i + 1; j < units.length; j += 1) {
      const a = units[i] as UnitModel;
      const b = units[j] as UnitModel;
      const overlap = boxOverlap(a.bounds, b.bounds);
      const depth = Math.min(overlap[0], overlap[1], overlap[2]);
      if (depth <= 1) continue;
      out.push({
        id: `units-overlap-${a.id}-${b.id}`,
        severity: "error",
        title: `${a.name} and ${b.name} are in the same place`,
        detail: `They share ${mm2(depth)}mm of space. Two units cannot be built into each other: move one along, or if they are meant to be one run, make them touch rather than overlap.`,
        parameter: "units",
        unitId: a.id,
      });
    }
  }

  return out;
}

/** A pitched roof takes the height away exactly where a tall unit wants to stand. */
function underRoof(project: ProjectModel): Finding[] {
  const room = project.spec.room;
  if (room.roof.kind === "flat") return [];

  const out: Finding[] = [];
  for (const unit of project.units) {
    const box = footprintBox(unit);
    const top = unit.bounds.max[1];
    const corners: readonly [number, number][] = [
      [box.x0, box.z0],
      [box.x1, box.z0],
      [box.x1, box.z1],
      [box.x0, box.z1],
    ];
    const lowest = Math.min(
      ...corners.map(([x, z]) =>
        ceilingHeightAt(room, Math.min(Math.max(x, 0), room.width), Math.min(Math.max(z, 0), room.depth)),
      ),
    );
    if (top <= lowest + 1) continue;
    out.push({
      id: `unit-under-roof-${unit.id}`,
      severity: "error",
      title: `${unit.name} is taller than the roof above it`,
      detail: `The unit is ${mm2(top)}mm tall and the roof is down to ${mm2(lowest)}mm over its footprint. Move it towards the ridge, lose the top ${mm2(top - lowest)}mm, or scribe the top to the slope.`,
      parameter: "room.roof.pitch",
      unitId: unit.id,
    });
  }
  return out;
}

/**
 * The gap between two units that face each other, and between a unit and the wall it opens
 * towards. 900mm is the working minimum: below that a drawer cannot be pulled out and
 * stood in front of.
 */
function walkways(project: ProjectModel): Finding[] {
  const out: Finding[] = [];
  const units = project.units;

  for (let i = 0; i < units.length; i += 1) {
    for (let j = i + 1; j < units.length; j += 1) {
      const a = units[i] as UnitModel;
      const b = units[j] as UnitModel;
      const boxA = footprintBox(a);
      const boxB = footprintBox(b);

      const gapX = Math.max(boxB.x0 - boxA.x1, boxA.x0 - boxB.x1);
      const gapZ = Math.max(boxB.z0 - boxA.z1, boxA.z0 - boxB.z1);
      const overlapX = Math.min(boxA.x1, boxB.x1) - Math.max(boxA.x0, boxB.x0) > 100;
      const overlapZ = Math.min(boxA.z1, boxB.z1) - Math.max(boxA.z0, boxB.z0) > 100;

      /* Only a gap someone would actually walk down counts: two units side by side with
         100mm between them are a badly aligned run, not a corridor. */
      const gap = overlapZ && gapX > 1 ? gapX : overlapX && gapZ > 1 ? gapZ : null;
      if (gap === null || gap >= MIN_WALKWAY) continue;

      out.push({
        id: `walkway-${a.id}-${b.id}`,
        severity: "warning",
        title: `Only ${mm2(gap)}mm between ${a.name} and ${b.name}`,
        detail: `A gangway wants ${MIN_WALKWAY}mm so a door or a drawer can be opened and someone can stand in front of it. Below about 700mm two people cannot pass at all.`,
        parameter: "units",
        unitId: a.id,
      });
    }
  }

  return out;
}

/**
 * A door that cannot be opened.
 *
 * A hinged leaf sweeps a quarter circle of its own width out of the front of the carcase,
 * so the clearance it needs in front is the width of the widest leaf. That is measured
 * against the room and against the other units, because a leaf that opens into the
 * neighbour is exactly as useless as one that opens into a wall.
 */
function doorSwings(project: ProjectModel): Finding[] {
  const out: Finding[] = [];
  const room = project.spec.room;

  for (const unit of project.units) {
    if (unit.detail.kind !== "wardrobe") continue;
    const leaves = unit.detail.model.leaves;
    if (leaves.length === 0) continue;
    const swing = Math.max(...leaves.map((leaf) => leaf.width));

    /* The swept volume, as a box in front of the unit, turned into the room with it. */
    const local = unit.localBounds;
    const sweptCorners: readonly Vec3[] = [
      [local.min[0], 0, local.max[2]],
      [local.max[0], 0, local.max[2]],
      [local.max[0], 0, local.max[2] + swing],
      [local.min[0], 0, local.max[2] + swing],
    ];
    const swept = boxOfPoints(sweptCorners.map((corner) => transformPoint(corner, unit.at)));

    const outsideBy = Math.max(
      -swept.min[0],
      swept.max[0] - room.width,
      -swept.min[2],
      swept.max[2] - room.depth,
    );

    const blocker = project.units.find((other) => {
      if (other.id === unit.id) return false;
      const overlap = boxOverlap(
        { min: [swept.min[0], 0, swept.min[2]], max: [swept.max[0], 1, swept.max[2]] },
        { min: [other.bounds.min[0], 0, other.bounds.min[2]], max: [other.bounds.max[0], 1, other.bounds.max[2]] },
      );
      return Math.min(overlap[0], overlap[2]) > 50;
    });

    if (blocker) {
      out.push({
        id: `swing-into-unit-${unit.id}`,
        severity: "error",
        title: `${unit.name}'s doors open into ${blocker.name}`,
        detail: `The widest leaf is ${mm2(swing)}mm, so it needs that much clear in front of the carcase. Turn one of the units, move them apart, or change the hinge sides so the leaves swing the other way.`,
        parameter: "doors.leafMode",
        unitId: unit.id,
      });
      continue;
    }

    if (outsideBy > 50) {
      out.push({
        id: `swing-into-wall-${unit.id}`,
        severity: "warning",
        title: `${unit.name}'s doors need ${mm2(swing)}mm in front`,
        detail: `The swing reaches ${mm2(outsideBy)}mm past a wall. Turn the unit so its front faces into the room, or use narrower leaves — two 400mm leaves need half the clearance of one 800mm leaf.`,
        parameter: "doors.leafCount",
        unitId: unit.id,
      });
    }
  }

  return out;
}

/**
 * Where an opening sits in room space.
 *
 * Openings are positioned along their own wall, and each wall measures from its own left
 * end *as seen from inside the room* — so the front and left walls run backwards along the
 * room axis, and taking that for granted put a window on the wrong end of the wall.
 */
function openingSpan(
  room: ProjectModel["spec"]["room"],
  opening: { readonly wall: string; readonly x: number; readonly width: number },
): { readonly axis: "x" | "z"; readonly from: number; readonly to: number } {
  switch (opening.wall) {
    case "back":
      return { axis: "x", from: opening.x, to: opening.x + opening.width };
    case "front":
      return { axis: "x", from: room.width - opening.x - opening.width, to: room.width - opening.x };
    case "left":
      return { axis: "z", from: room.depth - opening.x - opening.width, to: room.depth - opening.x };
    default:
      return { axis: "z", from: opening.x, to: opening.x + opening.width };
  }
}

/** A unit standing in front of a window, which is usually not what was intended. */
function blockedOpenings(project: ProjectModel): Finding[] {
  const room = project.spec.room;
  const out: Finding[] = [];

  for (const opening of room.openings) {
    const along = openingSpan(room, opening);

    for (const unit of project.units) {
      const box = footprintBox(unit);
      const nearWall =
        opening.wall === "back"
          ? box.z0 < 600
          : opening.wall === "front"
            ? box.z1 > room.depth - 600
            : opening.wall === "left"
              ? box.x0 < 600
              : box.x1 > room.width - 600;
      if (!nearWall) continue;

      const span = along.axis === "x" ? [box.x0, box.x1] : [box.z0, box.z1];
      const covered =
        Math.min(span[1] as number, along.to) - Math.max(span[0] as number, along.from);
      if (covered <= 100) continue;
      if (unit.bounds.max[1] <= opening.sill) continue;

      out.push({
        id: `opening-blocked-${opening.id}-${unit.id}`,
        severity: "warning",
        title: `${unit.name} covers ${mm2(covered)}mm of the ${opening.wall} wall opening`,
        detail:
          "The unit stands in front of the window. If that is deliberate, nothing here is wrong; if not, slide it along the wall or turn it.",
        parameter: "room.openings",
        unitId: unit.id,
      });
    }
  }

  return out;
}
