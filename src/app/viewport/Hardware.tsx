import { memo, useLayoutEffect, useMemo, useRef } from "react";
import {
  CylinderGeometry,
  Matrix4,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
} from "three";
import { getHandle, getRail, type HandleSpec } from "@/engine/catalog/hardware";
import { toWorld, type Vec3 } from "@/engine/core/geometry";
import type { Hole, OpPurpose, Part } from "@/engine/core/part";
import { useStudio } from "../store/useStudio";
import type { PartScene, PartTransform } from "./scene";

/**
 * The hardware layer.
 *
 * Panels come out of the solver as boxes, but a hanging rail, a handle and a dowel are
 * only ever a line and a diameter in the data. They are drawn here from that data —
 * rails from their resolved span, handles and fixings from the holes that were actually
 * drilled for them — so nothing can appear in the 3D view that the drilling plan does
 * not also account for, and nothing on the hardware list is invisible.
 *
 * Everything is instanced: a wardrobe with four bays of shelves runs to a couple of
 * hundred dowels and shelf pins, which as individual meshes would cost more draw calls
 * than the whole carcase.
 */

/** Unit primitives: a cylinder one long and one across, axis on +Y, and a unit ball. */
const UNIT_TUBE = new CylinderGeometry(0.5, 0.5, 1, 20, 1);
const UNIT_BALL = new SphereGeometry(0.5, 20, 12);

const GEOMETRIES = { tube: UNIT_TUBE, ball: UNIT_BALL } as const;

const MATERIALS = {
  chrome: new MeshStandardMaterial({ color: "#c6ccd6", roughness: 0.24, metalness: 0.92 }),
  steel: new MeshStandardMaterial({ color: "#8f959f", roughness: 0.42, metalness: 0.78 }),
  wood: new MeshStandardMaterial({ color: "#c8a97b", roughness: 0.76, metalness: 0.02 }),
} as const;

type GeometryKey = keyof typeof GEOMETRIES;
type MaterialKey = keyof typeof MATERIALS;

type Bucket = {
  readonly key: string;
  readonly geometry: BufferGeometry;
  readonly material: MeshStandardMaterial;
  readonly matrices: Matrix4[];
};

const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Y = new Vector3(0, 1, 0);

function push(
  buckets: Map<string, Bucket>,
  geometry: GeometryKey,
  material: MaterialKey,
  matrix: Matrix4,
): void {
  const key = `${geometry}-${material}`;
  const bucket = buckets.get(key);
  if (bucket) {
    bucket.matrices.push(matrix);
    return;
  }
  buckets.set(key, {
    key,
    geometry: GEOMETRIES[geometry],
    material: MATERIALS[material],
    matrices: [matrix],
  });
}

function vec(point: Vec3): Vector3 {
  return new Vector3(point[0], point[1], point[2]);
}

/** A cylinder of the given length and diameter, centred on a point, axis along a line. */
function tube(centre: Vector3, axis: Vector3, length: number, diameter: number): Matrix4 {
  const along = axis.clone().normalize();
  const seed = Math.abs(along.y) > 0.9 ? AXIS_X : AXIS_Y;
  const across = new Vector3().crossVectors(seed, along).normalize();
  const other = new Vector3().crossVectors(across, along).normalize();
  return new Matrix4()
    .makeBasis(
      across.multiplyScalar(diameter),
      along.multiplyScalar(length),
      other.multiplyScalar(diameter),
    )
    .setPosition(centre);
}

function ball(centre: Vector3, diameter: number): Matrix4 {
  return new Matrix4().makeScale(diameter, diameter, diameter).setPosition(centre);
}

/**
 * How far each fitting stands out of the face it is drilled into, and what it looks
 * like. A cam housing is sunk flush, so it only shows in x-ray or exploded views; a
 * dowel or a hinge cup protrudes, which is what makes an exploded view readable.
 */
type FittingLook = {
  readonly material: MaterialKey;
  readonly stand: number;
  readonly diameter?: number;
};

const FITTINGS: Partial<Record<OpPurpose, FittingLook>> = {
  dowel: { material: "wood", stand: 14 },
  confirmat: { material: "steel", stand: 18 },
  "cam-bolt": { material: "steel", stand: 11 },
  lamello: { material: "wood", stand: 9 },
  "cam-housing": { material: "steel", stand: 0 },
  "shelf-pin": { material: "steel", stand: 9 },
  "hinge-cup": { material: "steel", stand: 13 },
};

type HardwareProps = {
  readonly scene: PartScene;
  readonly transforms: ReadonlyMap<string, PartTransform>;
};

export const Hardware = memo(function Hardware({ scene, transforms }: HardwareProps) {
  const show = useStudio((state) => state.view.showHardware);
  const showDoors = useStudio((state) => state.view.showDoors);
  const showBack = useStudio((state) => state.view.showBack);
  const isolateRole = useStudio((state) => state.view.isolateRole);

  const buckets = useMemo(
    () => (show ? build(scene, transforms, showDoors, showBack) : []),
    [show, scene, transforms, showDoors, showBack],
  );

  /* Isolating a role is about reading one panel; hardware at full opacity over dimmed
     panels only gets in the way. */
  if (!show || isolateRole !== null) return null;

  return (
    <group>
      {buckets.map((bucket) => (
        <Instances key={`${bucket.key}-${bucket.matrices.length}`} bucket={bucket} />
      ))}
    </group>
  );
});

function build(
  scene: PartScene,
  transforms: ReadonlyMap<string, PartTransform>,
  showDoors: boolean,
  showBack: boolean,
): Bucket[] {
  const buckets = new Map<string, Bucket>();

  for (const rail of scene.rails) {
    const spec = getRail(rail.railId);
    const centre = new Vector3((rail.x0 + rail.x1) / 2, rail.y, rail.z);
    /* An oval rail is not a cylinder, so the cross-section is scaled per axis rather
       than through the round-tube helper. */
    push(
      buckets,
      "tube",
      "chrome",
      new Matrix4()
        .makeBasis(
          new Vector3(0, 0, spec.width),
          new Vector3(rail.span, 0, 0),
          new Vector3(0, spec.height, 0),
        )
        .setPosition(centre),
    );

    // End supports, on the panel face at each end of the span.
    const flange = Math.max(spec.width, spec.height) + 12;
    for (const x of [rail.x0 + 2, rail.x1 - 2]) {
      push(buckets, "tube", "steel", tube(new Vector3(x, rail.y, rail.z), AXIS_X, 4, flange));
    }
  }

  const doorHandle = scene.doorHandleId === null ? null : getHandle(scene.doorHandleId);
  const drawerHandle = scene.drawerHandleId === null ? null : getHandle(scene.drawerHandleId);

  for (const part of scene.parts) {
    if (hidden(part, showDoors, showBack)) continue;
    const offset = transforms.get(part.id)?.offset;

    const handle = part.role === "door" ? doorHandle : part.role === "drawer-front" ? drawerHandle : null;
    if (handle) addHandle(buckets, part, handle, offset);

    for (const op of part.ops) {
      if (op.kind !== "hole") continue;
      const look = FITTINGS[op.purpose];
      if (!look) continue;

      // The hole is drilled inwards from its face; the fitting fills it and stands out
      // of it, towards whatever it fixes to.
      const out = vec(part.placement.tAxis).multiplyScalar(op.face === "A" ? 1 : -1);
      const sunk = op.through ? part.thickness : Math.min(op.depth, part.thickness);
      const centre = vec(toWorld(part.placement, op.l, op.w, op.face === "A" ? part.thickness : 0))
        .addScaledVector(out, (look.stand - sunk) / 2);
      push(
        buckets,
        "tube",
        look.material,
        place(tube(centre, out, sunk + look.stand, look.diameter ?? op.diameter), offset),
      );
    }
  }

  return [...buckets.values()];
}

/** Hardware follows the panel it is mounted on when the view explodes or opens. */
function place(matrix: Matrix4, offset: Matrix4 | undefined): Matrix4 {
  return offset ? matrix.premultiply(offset) : matrix;
}

function hidden(part: Part, showDoors: boolean, showBack: boolean): boolean {
  if (!showDoors && (part.role === "door" || part.role === "drawer-front")) return true;
  return !showBack && part.role === "back";
}

function addHandle(
  buckets: Map<string, Bucket>,
  part: Part,
  spec: HandleSpec,
  offset: Matrix4 | undefined,
): void {
  const holes = part.ops.filter(
    (op): op is Hole => op.kind === "hole" && op.purpose === "handle",
  );
  const first = holes[0];
  // A groove, a recessed pocket or a push latch leaves nothing to draw on the front.
  if (!first) return;

  /* Fixing holes are dimensioned from the back of the front, which is the face they are
     drilled from. The handle itself sits on the other one. */
  const out = vec(part.placement.tAxis).multiplyScalar(first.face === "A" ? -1 : 1);
  const faceT = first.face === "A" ? 0 : part.thickness;
  const points = holes.map((hole) => vec(toWorld(part.placement, hole.l, hole.w, faceT)));

  const grip = Math.min(14, Math.max(8, spec.projection * 0.4));
  const [a, b] = points;

  if (a && b) {
    const centre = new Vector3()
      .addVectors(a, b)
      .multiplyScalar(0.5)
      .addScaledVector(out, spec.projection - grip / 2);
    const bar = tube(centre, new Vector3().subVectors(b, a), Math.max(spec.length, 40), grip);
    push(buckets, "tube", "chrome", place(bar, offset));

    const post = Math.max(spec.projection - grip / 2, 2);
    for (const point of points) {
      const leg = tube(point.clone().addScaledVector(out, post / 2), out, post, grip * 0.7);
      push(buckets, "tube", "chrome", place(leg, offset));
    }
    return;
  }

  if (!a) return;

  // A single fixing is a knob: a stem with a head on the end of it.
  const head = Math.max(spec.length, 16);
  const stem = Math.max(spec.projection - head / 2, 2);
  push(
    buckets,
    "tube",
    "chrome",
    place(tube(a.clone().addScaledVector(out, stem / 2), out, stem, 10), offset),
  );
  push(
    buckets,
    "ball",
    "chrome",
    place(ball(a.clone().addScaledVector(out, spec.projection - head / 2), head), offset),
  );
}

function Instances({ bucket }: { readonly bucket: Bucket }) {
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    bucket.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
  }, [bucket]);

  return (
    <instancedMesh
      ref={ref}
      args={[bucket.geometry, bucket.material, bucket.matrices.length]}
      /* Instance matrices are set imperatively, so three cannot derive useful bounds
         from them, and a stale bounding sphere culls the whole batch. */
      frustumCulled={false}
      /* Hardware is decoration for the panels; a handle should not swallow the click
         that selects the door it is on. */
      raycast={noRaycast}
    />
  );
}

const noRaycast = (): void => {};
