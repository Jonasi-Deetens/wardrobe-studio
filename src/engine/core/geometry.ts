/**
 * Assembly space is millimetres, right-handed, and anchored to the wardrobe:
 *
 *   +X  left  -> right   (0 at the outer face of the left side panel)
 *   +Y  floor -> ceiling (0 at the floor the wardrobe stands on)
 *   +Z  back  -> front   (0 at the rear plane of the carcase)
 *
 * A panel occupies the local box [0..length] x [0..width] x [0..thickness] and is
 * placed by an origin plus three orthonormal axes. Axes are used instead of Euler
 * angles because there is no rotation-order ambiguity to get wrong, and because
 * mapping a local machining coordinate into the model becomes a single dot
 * product per axis.
 *
 * Placements are allowed to be left-handed. A box is symmetric about its own
 * thickness, so the visual result is identical, and keeping the thickness axis
 * pointing at the face that carries the machining is worth more than a positive
 * determinant.
 */

export type Vec3 = readonly [x: number, y: number, z: number];
export type Vec2 = readonly [x: number, y: number];

export const X_AXIS: Vec3 = [1, 0, 0];
export const Y_AXIS: Vec3 = [0, 1, 0];
export const Z_AXIS: Vec3 = [0, 0, 1];
export const NEG_X: Vec3 = [-1, 0, 0];
export const NEG_Y: Vec3 = [0, -1, 0];
export const NEG_Z: Vec3 = [0, 0, -1];

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function negate(a: Vec3): Vec3 {
  return [-a[0], -a[1], -a[2]];
}

/**
 * Where a panel sits in assembly space.
 *
 * `origin` is the model position of panel-local (0, 0, 0); `lAxis`, `wAxis` and
 * `tAxis` are unit vectors for the length, width and thickness directions.
 */
export type Placement = {
  readonly origin: Vec3;
  readonly lAxis: Vec3;
  readonly wAxis: Vec3;
  readonly tAxis: Vec3;
};

/**
 * Turns a vector about the Y axis. Positive degrees turn anticlockwise seen from
 * above, with the front of the room at the bottom of the plan.
 */
export function rotateY(v: Vec3, degrees: number): Vec3 {
  if (degrees === 0) return v;
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [v[0] * cos + v[2] * sin, v[1], -v[0] * sin + v[2] * cos];
}

/**
 * Where a unit's placement puts it in the room: turned about its own origin, then
 * moved. This is the only place the room transform is applied, so a part, its
 * machining and its hardware cannot end up in different places.
 */
export type UnitTransform = {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
};

export const IDENTITY_TRANSFORM: UnitTransform = { x: 0, z: 0, yaw: 0 };

export function transformPoint(point: Vec3, at: UnitTransform): Vec3 {
  const turned = rotateY(point, at.yaw);
  return [turned[0] + at.x, turned[1], turned[2] + at.z];
}

export function transformPlacement(placement: Placement, at: UnitTransform): Placement {
  return {
    origin: transformPoint(placement.origin, at),
    lAxis: rotateY(placement.lAxis, at.yaw),
    wAxis: rotateY(placement.wAxis, at.yaw),
    tAxis: rotateY(placement.tAxis, at.yaw),
  };
}

/** Maps a panel-local point to assembly space. */
export function toWorld(
  placement: Placement,
  l: number,
  w: number,
  t: number,
): Vec3 {
  const { origin, lAxis, wAxis, tAxis } = placement;
  return [
    origin[0] + lAxis[0] * l + wAxis[0] * w + tAxis[0] * t,
    origin[1] + lAxis[1] * l + wAxis[1] * w + tAxis[1] * t,
    origin[2] + lAxis[2] * l + wAxis[2] * w + tAxis[2] * t,
  ];
}

/** Axis-aligned bounding box, used for the model bounds and for fit checks. */
export type Box3 = { readonly min: Vec3; readonly max: Vec3 };

export function boxOfPoints(points: readonly Vec3[]): Box3 {
  if (points.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let i = 0; i < 3; i += 1) {
      const v = p[i] as number;
      if (v < (min[i] as number)) min[i] = v;
      if (v > (max[i] as number)) max[i] = v;
    }
  }
  return { min, max };
}

export function unionBox(a: Box3, b: Box3): Box3 {
  return {
    min: [
      Math.min(a.min[0], b.min[0]),
      Math.min(a.min[1], b.min[1]),
      Math.min(a.min[2], b.min[2]),
    ],
    max: [
      Math.max(a.max[0], b.max[0]),
      Math.max(a.max[1], b.max[1]),
      Math.max(a.max[2], b.max[2]),
    ],
  };
}

export function boxCenter(box: Box3): Vec3 {
  return [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
}

export function boxSize(box: Box3): Vec3 {
  return [
    box.max[0] - box.min[0],
    box.max[1] - box.min[1],
    box.max[2] - box.min[2],
  ];
}

export function translateBox(box: Box3, by: Vec3): Box3 {
  return { min: add(box.min, by), max: add(box.max, by) };
}

/**
 * How deeply two boxes interpenetrate on each axis. Negative on an axis means they are
 * clear of each other along it, and since every panel is axis-aligned, one negative axis
 * is enough to prove two panels do not touch.
 */
export function boxOverlap(a: Box3, b: Box3): Vec3 {
  return [
    Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]),
    Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]),
    Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]),
  ];
}

/** The deepest a pair of boxes overlap, or 0 when they are clear of each other. */
export function interpenetration(a: Box3, b: Box3): number {
  const overlap = boxOverlap(a, b);
  return Math.min(...overlap) <= 0 ? 0 : Math.min(...overlap);
}
