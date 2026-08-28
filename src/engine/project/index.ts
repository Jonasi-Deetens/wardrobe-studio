import {
  boxOfPoints,
  transformPoint,
  unionBox,
  type Box3,
  type UnitTransform,
  type Vec3,
} from "../core/geometry";
import { getProfile } from "../catalog/profiles";
import { solveCladding } from "../cladding";
import { memberBounds, placeMember, type Member, type Weld } from "../core/member";
import { partBounds, placePart, type Part } from "../core/part";
import { solveCounter, type CounterModel } from "../counter";
import { solve, type HardwareUse, type WardrobeModel } from "../solver";
import { solveWorkTable, type WorkTableModel } from "../table";
import type { ProductionSpec, ProjectSpec, UnitKind, UnitPlacement, UnitSpec } from "../spec/types";
import { wardrobeSpecOf } from "../spec/types";
import { prefixModel } from "./rekey";
import { buildRoom, type RoomModel } from "./room";

/**
 * Solving a room full of units.
 *
 * Each unit is solved on its own, in its own space, by its own kind's solver — the
 * wardrobe solver has no idea a room exists. This layer places the results: it prefixes
 * every id with the unit's id so they are unique across the project, and it keeps a
 * room-space copy of the geometry for anything that has to reason about where units are
 * in relation to each other and to the walls.
 *
 * Two spaces, deliberately:
 *
 * - **Unit space** is what a unit was solved in. The cut list, the drawings, the exports,
 *   the assembly sequence and the per-unit advice all live here, unchanged from when the
 *   app could only build one wardrobe. The viewport draws each unit in unit space too,
 *   inside a group carrying the placement, which is why exploding and swinging doors still
 *   work without knowing about the room.
 * - **Room space** is where the units stand. Only geometry queries need it: the project
 *   bounds, whether two units overlap, whether a unit is outside the room or a door swings
 *   into a wall.
 */

export type UnitDetail =
  | { readonly kind: "wardrobe"; readonly model: WardrobeModel }
  | { readonly kind: "work-table"; readonly model: WorkTableModel }
  | { readonly kind: "counter"; readonly model: CounterModel };

export type UnitModel = {
  readonly id: string;
  readonly name: string;
  readonly kind: UnitKind;
  readonly at: UnitTransform;
  readonly spec: UnitSpec;
  /** The solved unit, in its own space, with ids prefixed. */
  readonly detail: UnitDetail;
  readonly parts: readonly Part[];
  readonly members: readonly Member[];
  readonly welds: readonly Weld[];
  readonly hardware: readonly HardwareUse[];
  /** Bounds in the unit's own space. */
  readonly localBounds: Box3;
  /** Bounds in room space. */
  readonly bounds: Box3;
  /** Plan outline in room space, anticlockwise, for the plan view and overlap checks. */
  readonly footprint: readonly Vec3[];
};

export type ProjectModel = {
  readonly spec: ProjectSpec;
  readonly room: RoomModel;
  readonly units: readonly UnitModel[];
  readonly unitsById: ReadonlyMap<string, UnitModel>;
  /** Every panel in the project, each in its own unit's space. */
  readonly parts: readonly Part[];
  readonly partsById: ReadonlyMap<string, Part>;
  readonly members: readonly Member[];
  readonly welds: readonly Weld[];
  readonly hardware: readonly HardwareUse[];
  /** Everything the project occupies, in room space, together with the room itself. */
  readonly bounds: Box3;
  readonly elapsedMs: number;
};

/**
 * Solved units, kept between calls.
 *
 * `deriveAll` runs on the main thread so that dragging a slider updates the 3D view in the
 * same frame, and with several units in the room that only stays true if editing unit A
 * leaves unit B alone. Structural sharing in the store means an untouched unit keeps its
 * spec object identity, so identity is all this has to compare.
 */
type CacheEntry = {
  readonly spec: UnitSpec;
  readonly production: ProductionSpec;
  readonly name: string;
  readonly at: UnitTransform;
  readonly unit: UnitModel;
};

const cache = new Map<string, CacheEntry>();

/** Drops the memoised units. Tests use it to measure real work. */
export function clearProjectCache(): void {
  cache.clear();
}

function solveUnit(
  project: ProjectSpec,
  placed: UnitPlacement,
): UnitModel {
  const cached = cache.get(placed.id);
  if (
    cached &&
    cached.spec === placed.unit &&
    cached.production === project.production &&
    cached.name === placed.name &&
    cached.at === placed.at
  ) {
    return cached.unit;
  }

  const unit = buildUnit(project, placed);
  cache.set(placed.id, {
    spec: placed.unit,
    production: project.production,
    name: placed.name,
    at: placed.at,
    unit,
  });
  return unit;
}

function buildUnit(project: ProjectSpec, placed: UnitPlacement): UnitModel {
  const at: UnitTransform = placed.at;
  const detail = solveDetail(project, placed);
  const local = detail.model;
  const members = detail.kind === "wardrobe" ? [] : detail.model.members;
  const welds = detail.kind === "wardrobe" ? [] : detail.model.welds;

  /* Cladding is a skin over the finished unit, so it is solved here rather than in each
     kind's solver: it reads the box the unit came out as, which is the same question
     whatever is inside it. */
  const skin = solveCladding(placed.unit.cladding, placed.id, local.bounds);
  const parts = skin.parts.length > 0 ? [...local.parts, ...skin.parts] : local.parts;
  const hardware =
    skin.hardware.length > 0 ? [...local.hardware, ...skin.hardware] : local.hardware;
  const localBounds = skin.bounds ? unionBox(local.bounds, skin.bounds) : local.bounds;

  const roomParts = parts.map((part) => placePart(part, at));
  const bounds = roomParts.reduce<Box3 | null>(
    (acc, part) => (acc === null ? partBounds(part) : unionBox(acc, partBounds(part))),
    null,
  );
  /* A unit can be all metal and no panels, so the members have to be able to set the
     bounds on their own. */
  const withMetal = members.reduce<Box3 | null>((acc, member) => {
    const box = memberBounds(placeMember(member, at), getProfile(member.profileId));
    return acc === null ? box : unionBox(acc, box);
  }, bounds);

  return {
    id: placed.id,
    name: placed.name,
    kind: placed.unit.kind,
    at,
    spec: placed.unit,
    detail,
    parts,
    members,
    welds,
    hardware,
    localBounds,
    bounds: withMetal ?? boxOfPoints([transformPoint([0, 0, 0], at)]),
    footprint: footprintOf(localBounds, at),
  };
}

function solveDetail(project: ProjectSpec, placed: UnitPlacement): UnitDetail {
  switch (placed.unit.kind) {
    case "wardrobe": {
      const spec = wardrobeSpecOf(project, placed.unit, placed.name);
      return { kind: "wardrobe", model: prefixModel(solve(spec), placed.id) };
    }
    /* The metal solvers prefix their own ids, because their parts and their members have to
       agree about which unit they belong to and there is no second pass to do it in. */
    case "work-table":
      return { kind: "work-table", model: solveWorkTable(placed.unit, placed.id) };
    case "counter":
      return { kind: "counter", model: solveCounter(placed.unit, placed.id) };
  }
}

/** The unit's footprint on the floor, turned into the room. */
function footprintOf(local: Box3, at: UnitTransform): Vec3[] {
  const corners: Vec3[] = [
    [local.min[0], 0, local.min[2]],
    [local.max[0], 0, local.min[2]],
    [local.max[0], 0, local.max[2]],
    [local.min[0], 0, local.max[2]],
  ];
  return corners.map((corner) => transformPoint(corner, at));
}

export function solveProject(project: ProjectSpec): ProjectModel {
  const started = performance.now();
  const room = buildRoom(project.room);
  const units = project.units.map((placed) => solveUnit(project, placed));

  const parts = units.flatMap((unit) => unit.parts);
  const roomBounds = units.reduce<Box3>(
    (acc, unit) => unionBox(acc, unit.bounds),
    {
      min: [0, 0, 0],
      max: [project.room.width, project.room.height, project.room.depth],
    },
  );

  return {
    spec: project,
    room,
    units,
    unitsById: new Map(units.map((unit) => [unit.id, unit])),
    parts,
    partsById: new Map(parts.map((part) => [part.id, part])),
    members: units.flatMap((unit) => unit.members),
    welds: units.flatMap((unit) => unit.welds),
    hardware: units.flatMap((unit) => unit.hardware),
    bounds: roomBounds,
    elapsedMs: performance.now() - started,
  };
}

/**
 * The project as it looks with only one unit in it.
 *
 * Every output — cut list, nesting, booklet, DXF — reads a `ProjectModel`, so narrowing to
 * one unit is done once here rather than in each of them. The room stays whole: it is
 * context for the drawings, not something the filter is about.
 */
export function scopeProject(project: ProjectModel, unitId: string | null): ProjectModel {
  if (!unitId) return project;
  const unit = project.unitsById.get(unitId);
  if (!unit) return project;
  return {
    ...project,
    units: [unit],
    unitsById: new Map([[unit.id, unit]]),
    parts: unit.parts,
    partsById: new Map(unit.parts.map((part) => [part.id, part])),
    members: unit.members,
    welds: unit.welds,
    hardware: unit.hardware,
  };
}

/** What the project's cut list, nesting and exports are built from. */
export function cutListInputOf(project: ProjectModel): {
  readonly parts: readonly Part[];
  readonly members: readonly Member[];
  readonly welds: readonly Weld[];
  readonly hardware: readonly HardwareUse[];
  readonly production: ProductionSpec;
} {
  return {
    parts: project.parts,
    members: project.members,
    welds: project.welds,
    hardware: project.hardware,
    production: project.spec.production,
  };
}

/** The unit a part belongs to, or null for a part that has no unit. */
export function unitOfPart(project: ProjectModel, part: Part): UnitModel | null {
  return part.unitId ? (project.unitsById.get(part.unitId) ?? null) : null;
}

/**
 * The wardrobe a unit resolves to, for the views that only know how to show a wardrobe.
 * Returns null for a unit of another kind, which is the caller's cue to show nothing
 * rather than to guess.
 */
export function wardrobeModelOf(unit: UnitModel): WardrobeModel | null {
  return unit.detail.kind === "wardrobe" ? unit.detail.model : null;
}

export { buildRoom, ceilingHeightAt, peakHeightOf, WALL_SIDES } from "./room";
export type { RoofPlaneModel, RoomModel, WallModel } from "./room";
