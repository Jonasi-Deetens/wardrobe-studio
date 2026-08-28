import { Matrix4, Vector3 } from "three";
import { getMaterial } from "@/engine/catalog/materials";
import { getProfile } from "@/engine/catalog/profiles";
import { boxCenter, type Box3, type Vec3 } from "@/engine/core/geometry";
import { memberBounds, type Member } from "@/engine/core/member";
import { partCenter, type Part, type PartRole } from "@/engine/core/part";
import type { UnitModel } from "@/engine/project";
import type { WardrobeModel } from "@/engine/solver";
import type { ResolvedRail } from "@/engine/solver/fittings";

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
 * How much further apart the assembly is spread at full explode. 1.1 rather than
 * something larger because the camera does not refit while the slider moves.
 */
const EXPLODE_SPREAD = 1.1;

/**
 * The extra forward or rearward travel a part gets, as a fraction of the longest side of
 * the wardrobe.
 *
 * A front comes off forwards and the back panel comes off backwards, whatever their
 * position says, because that is the way they actually come off — and a drawer box
 * follows its front out of the carcase, but never as far, so the front stays in front of
 * it.
 */
const ROLE_TRAVEL: Partial<Record<PartRole, number>> = {
  door: 0.34,
  "drawer-front": 0.34,
  "drawer-side": 0.2,
  "drawer-back": 0.2,
  "drawer-bottom": 0.2,
  back: -0.26,
};

/**
 * Where a part sits in an exploded view.
 *
 * Every part moves directly away from the middle of the wardrobe, by an amount
 * proportional to how far out it already is. Scaling the spacing like this is what keeps
 * the view readable: no two parts can be driven into each other, because every distance
 * between them only grows — which a per-part push along the thickness axis cannot
 * promise, and which is why a divider used to end up inside the drawer next to it.
 *
 * On top of that, fronts and drawer boxes get a push along Z, in the direction they
 * already lie, so the parts that come off the front of a wardrobe are seen to.
 */
export function explodeOffset(part: Part, bounds: SceneBounds, factor: number): Vector3 {
  const center = new Vector3(...partCenter(part));
  const offset = center
    .sub(new Vector3(bounds.center[0], bounds.center[1], bounds.center[2]))
    .multiplyScalar(EXPLODE_SPREAD * factor);

  const travel = ROLE_TRAVEL[part.role];
  if (travel !== undefined) {
    const span = Math.max(bounds.size[0], bounds.size[1], bounds.size[2]);
    offset.z += travel * span * factor;
  }
  return offset;
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
export function swingMatrix(swing: DoorSwing, angle: number): Matrix4 {
  const toPivot = new Matrix4().makeTranslation(-swing.pivotX, 0, -swing.pivotZ);
  const rotate = new Matrix4().makeRotationY(swing.sign * angle);
  const back = new Matrix4().makeTranslation(swing.pivotX, 0, swing.pivotZ);
  return back.multiply(rotate).multiply(toPivot);
}

/** Maximum leaf swing. Past this the door is behind the carcase and reads as noise. */
export const MAX_SWING = (100 * Math.PI) / 180;

export type PartTransform = {
  /** The mesh matrix, with the panel's size baked into the basis. */
  readonly matrix: Matrix4;
  /**
   * The rigid half of that transform — the explode offset and the door swing — in
   * assembly space. Hardware works out its own position from the panel's placement and
   * then needs the same movement, without the panel's size baked in.
   */
  readonly offset: Matrix4;
};

export type TransformOptions = {
  readonly explode: number;
  readonly doorsOpen: number;
  readonly bounds: SceneBounds;
};

/**
 * Everything the viewport needs to draw one unit, whatever kind it is.
 *
 * The panel renderer and the hardware renderer were both written against `WardrobeModel`,
 * back when a document was one wardrobe. Rather than teach each of them about every unit
 * kind, each kind is reduced to this once — so a work table's folded top and a counter's
 * drawer fronts are drawn by exactly the same code that draws a wardrobe's, and adding a
 * kind means answering these five questions rather than editing three components.
 */
export type PartScene = {
  readonly parts: readonly Part[];
  readonly swings: readonly DoorSwing[];
  readonly rails: readonly ResolvedRail[];
  /** Handle catalogue ids, for drawing the handles a front's holes are drilled for. */
  readonly doorHandleId: string | null;
  readonly drawerHandleId: string | null;
};

export function partSceneOf(unit: UnitModel): PartScene {
  /* `unit.parts` rather than the kind's model, because cladding is added to the unit after
     its own solver has run and it has to be drawn too. */
  const parts = unit.parts;
  switch (unit.detail.kind) {
    case "wardrobe": {
      const model = unit.detail.model;
      return {
        parts,
        swings: doorSwings(model),
        rails: model.rails,
        doorHandleId: model.spec.handles.doorHandleId,
        drawerHandleId: model.spec.handles.drawerHandleId,
      };
    }
    case "work-table":
      return { parts, swings: [], rails: [], doorHandleId: null, drawerHandleId: null };
    case "counter":
      return {
        parts,
        swings: [],
        rails: [],
        doorHandleId: null,
        drawerHandleId: unit.detail.model.spec.drawerBank.handleId,
      };
  }
}

/**
 * Every part's transform for one frame of the view state. Panels and the hardware
 * mounted on them are drawn from this one map, so a handle cannot drift away from the
 * door it is screwed to.
 */
export function partTransforms(
  scene: PartScene,
  { explode, doorsOpen, bounds }: TransformOptions,
): Map<string, PartTransform> {
  const swings = new Map<string, DoorSwing>();
  for (const swing of scene.swings) swings.set(swing.partId, swing);

  const result = new Map<string, PartTransform>();
  for (const part of scene.parts) {
    const offset = new Matrix4();
    if (explode > 0) {
      const travel = explodeOffset(part, bounds, explode);
      offset.makeTranslation(travel.x, travel.y, travel.z);
    }
    const swing = swings.get(part.id);
    if (swing && doorsOpen > 0) {
      offset.premultiply(swingMatrix(swing, doorsOpen * MAX_SWING));
    }
    result.set(part.id, {
      matrix: partMatrix(part, new Matrix4()).premultiply(offset),
      offset,
    });
  }
  return result;
}

/* ----------------------------------------------------------- metal members - */

/**
 * A member's transform.
 *
 * Unlike a panel, a length of tube is not a box: a 40x40 hollow section is a hole with a
 * wall round it, and a 38mm leg is round. So the section is built into the geometry at its
 * real size, once per profile, and only the length is scaled here — which is also why the
 * basis is ordered (width, thickness, length) rather than the panels' (length, width,
 * thickness).
 */
export function memberMatrix(
  member: Member,
  section: { readonly width: number; readonly height: number },
  target = new Matrix4(),
): Matrix4 {
  const { origin, lAxis, wAxis, tAxis } = member.placement;
  const l = V_A.set(lAxis[0], lAxis[1], lAxis[2]);
  const w = V_B.set(wAxis[0], wAxis[1], wAxis[2]);
  const t = V_C.set(tAxis[0], tAxis[1], tAxis[2]);

  const center = V_D
    .set(origin[0], origin[1], origin[2])
    .addScaledVector(l, member.length / 2)
    .addScaledVector(w, section.width / 2)
    .addScaledVector(t, section.height / 2);

  /* A left-handed basis would light the tube inside out. Hollow and round sections are
     symmetric across their width, so flipping that axis costs nothing. */
  const handedness = w.dot(new Vector3().copy(t).cross(l));
  const sw = handedness < 0 ? -1 : 1;

  target.set(
    w.x * sw, t.x, l.x * member.length, center.x,
    w.y * sw, t.y, l.y * member.length, center.y,
    w.z * sw, t.z, l.z * member.length, center.z,
    0, 0, 0, 1,
  );
  return target;
}

/**
 * Members in an exploded view come apart the same way panels do — radially from the middle
 * of the unit — so a frame and the top bolted to it separate together rather than one
 * drifting through the other.
 */
export function memberTransforms(
  members: readonly Member[],
  { explode, bounds }: { readonly explode: number; readonly bounds: SceneBounds },
): Map<string, Matrix4> {
  const result = new Map<string, Matrix4>();
  for (const member of members) {
    const profile = getProfile(member.profileId);
    const matrix = memberMatrix(member, profile, new Matrix4());
    if (explode > 0) {
      const centre = boxCenter(memberBounds(member, profile));
      const travel = new Vector3(
        centre[0] - bounds.center[0],
        centre[1] - bounds.center[1],
        centre[2] - bounds.center[2],
      ).multiplyScalar(EXPLODE_SPREAD * explode);
      matrix.premultiply(new Matrix4().makeTranslation(travel.x, travel.y, travel.z));
    }
    result.set(member.id, matrix);
  }
  return result;
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

/**
 * Bounds of anything the camera has to frame: one unit in its own space, or a whole room.
 * It takes a box rather than a model because those two callers do not share a type.
 */
export function sceneBounds(box: Box3): SceneBounds {
  const center = boxCenter(box);
  const size: Vec3 = [
    box.max[0] - box.min[0],
    box.max[1] - box.min[1],
    box.max[2] - box.min[2],
  ];
  return {
    center,
    size,
    sceneCenter: [center[0] * SCENE_SCALE, center[1] * SCENE_SCALE, center[2] * SCENE_SCALE],
    radius: Math.hypot(size[0], size[1], size[2]) * 0.5 * SCENE_SCALE,
    floorY: box.min[1] * SCENE_SCALE,
  };
}
