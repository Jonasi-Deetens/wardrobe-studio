import { Matrix4, Vector3 } from "three";
import { getMaterial } from "@/engine/catalog/materials";
import { boxCenter, type Vec3 } from "@/engine/core/geometry";
import type { Part, PartRole } from "@/engine/core/part";
import type { WardrobeModel } from "@/engine/solver";

/**
 * Turning parts into scene transforms.
 *
 * The scene is drawn in metres — the engine works in millimetres, but a 2m box built
 * from 2000-unit geometry pushes shadow bias, camera near planes and orbit damping
 * into territory three.js is not tuned for.
 */
export const SCENE_SCALE = 0.001;

const V_A = new Vector3();
const V_B = new Vector3();
const V_C = new Vector3();
const V_D = new Vector3();

/**
 * A part's transform, with the panel's length, width and thickness baked into the
 * basis so every panel can share one unit box geometry. A hundred panels then cost one
 * geometry upload instead of a hundred.
 *
 * Placements may be left-handed, since the engine keeps the thickness axis pointing at
 * the machined face. A left-handed basis would invert the lighting, and because a box
 * is symmetric about its thickness, flipping that one axis fixes the normals without
 * moving anything.
 */
export function partMatrix(part: Part, target = new Matrix4()): Matrix4 {
  const { origin, lAxis, wAxis, tAxis } = part.placement;
  const l = V_A.set(lAxis[0], lAxis[1], lAxis[2]);
  const w = V_B.set(wAxis[0], wAxis[1], wAxis[2]);
  const t = V_C.set(tAxis[0], tAxis[1], tAxis[2]);

  const center = V_D
    .set(origin[0], origin[1], origin[2])
    .addScaledVector(l, part.length / 2)
    .addScaledVector(w, part.width / 2)
    .addScaledVector(t, part.thickness / 2);

  const handedness = l.dot(new Vector3().copy(w).cross(t));
  const tz = handedness < 0 ? -1 : 1;
  const sl = part.length;
  const sw = part.width;
  const st = part.thickness * tz;

  target.set(
    l.x * sl, w.x * sw, t.x * st, center.x,
    l.y * sl, w.y * sw, t.y * st, center.y,
    l.z * sl, w.z * sw, t.z * st, center.z,
    0, 0, 0, 1,
  );
  return target;
}

/**
 * The direction a part travels in an exploded view.
 *
 * Panels read best when they separate along their own thickness — that is the gap the
 * eye expects to see open up — so the direction is the thickness axis, turned to point
 * away from the middle of the wardrobe.
 */
export function explodeDirection(part: Part, modelCenter: Vec3): Vector3 {
  const { origin, lAxis, wAxis, tAxis } = part.placement;
  const center = new Vector3(origin[0], origin[1], origin[2])
    .addScaledVector(new Vector3(lAxis[0], lAxis[1], lAxis[2]), part.length / 2)
    .addScaledVector(new Vector3(wAxis[0], wAxis[1], wAxis[2]), part.width / 2)
    .addScaledVector(new Vector3(tAxis[0], tAxis[1], tAxis[2]), part.thickness / 2);

  const away = center.clone().sub(new Vector3(modelCenter[0], modelCenter[1], modelCenter[2]));
  const normal = new Vector3(tAxis[0], tAxis[1], tAxis[2]);
  if (normal.dot(away) < 0) normal.negate();

  /* Fronts come off forwards whatever their thickness axis says, because that is how
     they actually come off. */
  if (part.role === "door" || part.role === "drawer-front") return new Vector3(0, 0, 1);
  if (part.role === "back") return new Vector3(0, 0, -1);
  if (isDrawerBox(part.role)) return new Vector3(0, 0, 1);
  return normal.normalize();
}

function isDrawerBox(role: PartRole): boolean {
  return role === "drawer-side" || role === "drawer-back" || role === "drawer-bottom";
}

/** How far a part moves at full explode, in millimetres. */
export function explodeDistance(part: Part, modelSize: Vec3): number {
  const span = Math.max(modelSize[0], modelSize[1], modelSize[2]);
  switch (part.role) {
    case "door":
    case "drawer-front":
      return span * 0.42;
    case "drawer-side":
    case "drawer-back":
    case "drawer-bottom":
      return span * 0.3;
    case "back":
      return span * 0.28;
    case "adjustable-shelf":
    case "shoe-shelf":
      return span * 0.16;
    default:
      return span * 0.2;
  }
}

export type PartVisual = {
  readonly color: string;
  readonly roughness: number;
  readonly metalness: number;
};

/**
 * Colour comes from the material, then gets nudged by role so the eye can separate the
 * carcase from what is inside it without a legend.
 */
export function visualFor(part: Part): PartVisual {
  const material = getMaterial(part.materialId);
  return {
    color: material.color,
    /* Fronts are the parts that get a lacquer or a foil, so they catch light more. */
    roughness: material.category === "front" ? 0.48 : 0.7,
    metalness: 0.02,
  };
}

export type DoorSwing = {
  readonly partId: string;
  /** World X of the hinge line. */
  readonly pivotX: number;
  readonly pivotZ: number;
  /** Positive for a right-hand swing, negative for left. */
  readonly sign: number;
};

/** Where each leaf pivots, so the open/close toggle rotates it about its real hinges. */
export function doorSwings(model: WardrobeModel): DoorSwing[] {
  return model.leaves.map((leaf) => {
    const part = model.partsById.get(leaf.partId);
    const pivotZ = part ? part.placement.origin[2] : 0;
    return {
      partId: leaf.partId,
      pivotX: leaf.hingeSide === "left" ? leaf.x0 : leaf.x1,
      pivotZ,
      sign: leaf.hingeSide === "left" ? -1 : 1,
    };
  });
}

/** A hinged leaf rotates about its hinge edge, not about its centre. */
export function applySwing(matrix: Matrix4, swing: DoorSwing, angle: number): Matrix4 {
  if (angle === 0) return matrix;
  const toPivot = new Matrix4().makeTranslation(-swing.pivotX, 0, -swing.pivotZ);
  const rotate = new Matrix4().makeRotationY(swing.sign * angle);
  const back = new Matrix4().makeTranslation(swing.pivotX, 0, swing.pivotZ);
  return back.multiply(rotate).multiply(toPivot).multiply(matrix);
}

export type SceneBounds = {
  readonly center: Vec3;
  readonly size: Vec3;
  /** Centre in scene units, which is what the camera and controls want. */
  readonly sceneCenter: readonly [number, number, number];
  readonly radius: number;
  /**
   * Scene Y of the lowest geometry, which is where the ground plane belongs. World zero
   * is the underside of the plinth, and on a design whose plinth is a set of levelling
   * legs there is nothing modelled down there — so a shadow at zero floats a hundred
   * millimetres clear of the carcase and reads as a mistake.
   */
  readonly floorY: number;
};

export function sceneBounds(model: WardrobeModel): SceneBounds {
  const center = boxCenter(model.bounds);
  const size: Vec3 = [
    model.bounds.max[0] - model.bounds.min[0],
    model.bounds.max[1] - model.bounds.min[1],
    model.bounds.max[2] - model.bounds.min[2],
  ];
  return {
    center,
    size,
    sceneCenter: [center[0] * SCENE_SCALE, center[1] * SCENE_SCALE, center[2] * SCENE_SCALE],
    radius: Math.hypot(size[0], size[1], size[2]) * 0.5 * SCENE_SCALE,
    floorY: model.bounds.min[1] * SCENE_SCALE,
  };
}
