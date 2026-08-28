import type { Box3, Vec2, Vec3 } from "../core/geometry";
import { mm2 } from "../core/units";
import type { Opening, RoomSpec, WallSide } from "../spec/types";

/**
 * The room as geometry.
 *
 * Room space is the same as a unit's assembly space: +X right, +Y up, +Z from the back
 * wall towards the front, with the origin on the floor at the inside corner where the
 * back and left walls meet. So a unit placed at the origin with no yaw stands with its
 * back against the back wall and its left side against the left wall.
 *
 * None of this is manufactured. It is drawn, and the advisor measures clearances against
 * it, and that is all: no part of the room ever reaches the cut list.
 */

/**
 * One wall, as a flat outline that can be extruded.
 *
 * Local coordinates are (u, y): `u` runs along the wall from its left end *seen from
 * inside the room*, and `y` is the height above the floor. The outline is the wall's
 * silhouette, which is a rectangle under a flat roof and a pentagon under a gable, and
 * the openings are holes in it.
 */
export type WallModel = {
  readonly side: WallSide;
  readonly length: number;
  readonly thickness: number;
  /** Anticlockwise silhouette in (u, y). */
  readonly outline: readonly Vec2[];
  readonly openings: readonly {
    readonly id: string;
    readonly u: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[];
  /** Room-space position of local (0, 0). */
  readonly origin: Vec3;
  /** Room-space direction of +u. */
  readonly uAxis: Vec3;
  /** Room-space direction the inside face looks in. The wall is extruded backwards. */
  readonly normal: Vec3;
};

/** One flat plane of roof, as four room-space corners in order. */
export type RoofPlaneModel = {
  readonly id: string;
  readonly corners: readonly [Vec3, Vec3, Vec3, Vec3];
  readonly thickness: number;
};

export type RoomModel = {
  readonly spec: RoomSpec;
  readonly walls: readonly WallModel[];
  readonly roof: readonly RoofPlaneModel[];
  /** The clear space inside, up to the eaves. */
  readonly interior: Box3;
  /** Highest point of the room, which is the ridge of a pitched roof. */
  readonly peakHeight: number;
};

/** Where each wall's inside face sits, and which way it looks. */
const WALL_FRAMES: Record<
  WallSide,
  (room: RoomSpec) => { origin: Vec3; uAxis: Vec3; normal: Vec3; length: number }
> = {
  back: (room) => ({
    origin: [0, 0, 0],
    uAxis: [1, 0, 0],
    normal: [0, 0, 1],
    length: room.width,
  }),
  front: (room) => ({
    origin: [room.width, 0, room.depth],
    uAxis: [-1, 0, 0],
    normal: [0, 0, -1],
    length: room.width,
  }),
  left: (room) => ({
    origin: [0, 0, room.depth],
    uAxis: [0, 0, -1],
    normal: [1, 0, 0],
    length: room.depth,
  }),
  right: (room) => ({
    origin: [room.width, 0, 0],
    uAxis: [0, 0, 1],
    normal: [-1, 0, 0],
    length: room.depth,
  }),
};

export const WALL_SIDES: readonly WallSide[] = ["back", "right", "front", "left"];

/**
 * Height of the underside of the roof above a point on the floor.
 *
 * A flat roof is the same everywhere. A shed roof rises linearly along one axis, and a
 * gable rises from both ends of that axis to a ridge down the middle. The pitch is the
 * angle of the slope, so the rise depends on how far the run is, which is why a steep
 * pitch across a wide room gets very tall very quickly.
 */
export function ceilingHeightAt(room: RoomSpec, x: number, z: number): number {
  const { roof } = room;
  if (roof.kind === "flat") return room.height;

  const run = roof.slopeAxis === "x" ? room.width : room.depth;
  const along = roof.slopeAxis === "x" ? x : z;
  const rise = Math.tan((roof.pitch * Math.PI) / 180);

  if (roof.kind === "shed") {
    const fraction = roof.flip ? 1 - along / run : along / run;
    return mm2(room.height + rise * run * fraction);
  }

  // Gable: the ridge is at the middle of the run and both halves fall to the eaves.
  const half = run / 2;
  const fromRidge = Math.abs(along - half);
  return mm2(room.height + rise * (half - fromRidge));
}

export function peakHeightOf(room: RoomSpec): number {
  const { roof } = room;
  if (roof.kind === "flat") return room.height;
  const run = roof.slopeAxis === "x" ? room.width : room.depth;
  const rise = Math.tan((roof.pitch * Math.PI) / 180);
  return mm2(room.height + rise * (roof.kind === "gable" ? run / 2 : run));
}

/** Room-space point on the floor at a given (u, 0) on a wall. */
function pointAlong(
  frame: { origin: Vec3; uAxis: Vec3 },
  u: number,
): { readonly x: number; readonly z: number } {
  return {
    x: frame.origin[0] + frame.uAxis[0] * u,
    z: frame.origin[2] + frame.uAxis[2] * u,
  };
}

/**
 * The wall's silhouette. The top edge follows the roof, so a gable end comes out as a
 * pentagon with the ridge at its apex and a shed end as a trapezium, which is what makes
 * the room read as pitched rather than as a box with a lid.
 */
function wallOutline(
  room: RoomSpec,
  frame: { origin: Vec3; uAxis: Vec3 },
  length: number,
): Vec2[] {
  const topAt = (u: number): number => {
    const p = pointAlong(frame, u);
    return ceilingHeightAt(room, p.x, p.z);
  };

  const samples: number[] = [0, length];
  if (room.roof.kind === "gable") {
    /* The apex sits where the ridge crosses this wall. The wall runs along one axis, so
       that is one division rather than a search — and it is skipped for the two walls
       that run parallel to the ridge and so have a level top. */
    const onX = room.roof.slopeAxis === "x";
    const direction = onX ? frame.uAxis[0] : frame.uAxis[2];
    if (direction !== 0) {
      const run = onX ? room.width : room.depth;
      const start = onX ? frame.origin[0] : frame.origin[2];
      const u = (run / 2 - start) / direction;
      if (u > 0.01 && u < length - 0.01) samples.splice(1, 0, u);
    }
  }
  const tops: Vec2[] = samples.map((u) => [mm2(u), topAt(u)] as Vec2);

  return [[0, 0], [mm2(length), 0], ...tops.reverse()];
}

function openingsOn(
  room: RoomSpec,
  side: WallSide,
  length: number,
): WallModel["openings"] {
  return room.openings
    .filter((opening: Opening) => opening.wall === side)
    .map((opening) => ({
      id: opening.id,
      u: mm2(Math.min(opening.x, Math.max(0, length - opening.width))),
      y: opening.sill,
      width: mm2(Math.min(opening.width, length)),
      height: opening.height,
    }));
}

function buildWalls(room: RoomSpec): WallModel[] {
  return WALL_SIDES.map((side) => {
    const frame = WALL_FRAMES[side](room);
    return {
      side,
      length: frame.length,
      thickness: room.wallThickness,
      outline: wallOutline(room, frame, frame.length),
      openings: openingsOn(room, side, frame.length),
      origin: frame.origin,
      uAxis: frame.uAxis,
      normal: frame.normal,
    };
  });
}

/**
 * The roof as one plane for a flat or shed roof and two for a gable, each given as its
 * four corners so the viewport can draw it without repeating the trigonometry.
 */
function buildRoof(room: RoomSpec): RoofPlaneModel[] {
  const { roof } = room;
  const over = roof.overhang;
  const x0 = -over;
  const x1 = room.width + over;
  const z0 = -over;
  const z1 = room.depth + over;
  const height = (x: number, z: number): number =>
    ceilingHeightAt(room, Math.min(Math.max(x, 0), room.width), Math.min(Math.max(z, 0), room.depth));

  if (roof.kind !== "gable") {
    return [
      {
        id: "roof",
        corners: [
          [x0, height(x0, z0), z0],
          [x1, height(x1, z0), z0],
          [x1, height(x1, z1), z1],
          [x0, height(x0, z1), z1],
        ],
        thickness: roof.thickness,
      },
    ];
  }

  const ridgeHeight = peakHeightOf(room);
  if (roof.slopeAxis === "x") {
    const mid = room.width / 2;
    return [
      {
        id: "roof-left",
        corners: [
          [x0, height(x0, z0), z0],
          [mid, ridgeHeight, z0],
          [mid, ridgeHeight, z1],
          [x0, height(x0, z1), z1],
        ],
        thickness: roof.thickness,
      },
      {
        id: "roof-right",
        corners: [
          [mid, ridgeHeight, z0],
          [x1, height(x1, z0), z0],
          [x1, height(x1, z1), z1],
          [mid, ridgeHeight, z1],
        ],
        thickness: roof.thickness,
      },
    ];
  }

  const mid = room.depth / 2;
  return [
    {
      id: "roof-back",
      corners: [
        [x0, height(x0, z0), z0],
        [x1, height(x1, z0), z0],
        [x1, ridgeHeight, mid],
        [x0, ridgeHeight, mid],
      ],
      thickness: roof.thickness,
    },
    {
      id: "roof-front",
      corners: [
        [x0, ridgeHeight, mid],
        [x1, ridgeHeight, mid],
        [x1, height(x1, z1), z1],
        [x0, height(x0, z1), z1],
      ],
      thickness: roof.thickness,
    },
  ];
}

export function buildRoom(room: RoomSpec): RoomModel {
  return {
    spec: room,
    walls: buildWalls(room),
    roof: buildRoof(room),
    interior: { min: [0, 0, 0], max: [room.width, room.height, room.depth] },
    peakHeight: peakHeightOf(room),
  };
}
