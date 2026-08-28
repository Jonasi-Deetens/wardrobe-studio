import { memo, useMemo } from "react";
import {
  BufferGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Matrix4,
  Path,
  Shape,
  Vector3,
} from "three";
import type { Vec3 } from "@/engine/core/geometry";
import type { RoofPlaneModel, RoomModel, WallModel } from "@/engine/project";
import { useStudio } from "../store/useStudio";

/**
 * The room the units stand in: floor, walls with their openings, and the roof.
 *
 * Drawn in millimetres, inside the scene's one scaling group, so a wall and a panel are
 * placed by the same numbers the engine computed.
 *
 * Openings are genuinely holes. A wall is its silhouette as a `Shape` — a rectangle under
 * a flat roof, a pentagon under a gable — with a `Path` per window subtracted from it, and
 * `ExtrudeGeometry` gives it its thickness. That needs no CSG and no boolean library, and
 * it means a window can be moved without anything having to be recomputed but one outline.
 *
 * None of this is selectable or manufactured. It is context: it tells you whether the
 * design fits, and the floor is what a unit is dragged across.
 */

type RoomProps = { readonly room: RoomModel };

export const Room = memo(function Room({ room }: RoomProps) {
  const showRoof = useStudio((state) => state.view.showRoof);
  const spec = room.spec;

  return (
    <group>
      {/* Floor. Two-sided so looking up from below does not show a hole. */}
      <mesh
        position={[spec.width / 2, -2, spec.depth / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        raycast={noRaycast}
      >
        <planeGeometry args={[spec.width, spec.depth]} />
        <meshStandardMaterial color="#2a2c31" roughness={0.95} metalness={0} side={DoubleSide} />
      </mesh>

      {room.walls.map((wall) => (
        <Wall key={wall.side} wall={wall} />
      ))}

      {showRoof
        ? room.roof.map((plane) => <RoofPlane key={plane.id} plane={plane} />)
        : null}
    </group>
  );
});

function Wall({ wall }: { readonly wall: WallModel }) {
  const geometry = useMemo(() => wallGeometry(wall), [wall]);
  const matrix = useMemo(() => wallMatrix(wall), [wall]);

  return (
    <mesh
      geometry={geometry}
      matrix={matrix}
      matrixAutoUpdate={false}
      receiveShadow
      raycast={noRaycast}
    >
      <meshStandardMaterial color="#35383e" roughness={0.9} metalness={0} side={DoubleSide} />
    </mesh>
  );
}

/** The wall silhouette with its openings cut out, extruded to its thickness. */
function wallGeometry(wall: WallModel): ExtrudeGeometry {
  const shape = new Shape();
  const outline = wall.outline;
  const first = outline[0] ?? [0, 0];
  shape.moveTo(first[0], first[1]);
  for (const point of outline.slice(1)) shape.lineTo(point[0], point[1]);
  shape.closePath();

  for (const opening of wall.openings) {
    const hole = new Path();
    hole.moveTo(opening.u, opening.y);
    hole.lineTo(opening.u, opening.y + opening.height);
    hole.lineTo(opening.u + opening.width, opening.y + opening.height);
    hole.lineTo(opening.u + opening.width, opening.y);
    hole.closePath();
    shape.holes.push(hole);
  }

  return new ExtrudeGeometry(shape, {
    depth: wall.thickness,
    bevelEnabled: false,
    curveSegments: 1,
  });
}

/**
 * Wall-local (u, y, depth) to room space.
 *
 * The extrusion runs along the wall's inward normal, so the wall is pushed back by its own
 * thickness first: otherwise a 100mm wall would stand 100mm inside the room and every
 * clearance in the advisor would disagree with what is drawn.
 */
function wallMatrix(wall: WallModel): Matrix4 {
  const u = wall.uAxis;
  const n = wall.normal;
  const origin: Vec3 = [
    wall.origin[0] - n[0] * wall.thickness,
    wall.origin[1] - n[1] * wall.thickness,
    wall.origin[2] - n[2] * wall.thickness,
  ];
  return new Matrix4().set(
    u[0], 0, n[0], origin[0],
    u[1], 1, n[1], origin[1],
    u[2], 0, n[2], origin[2],
    0, 0, 0, 1,
  );
}

function RoofPlane({ plane }: { readonly plane: RoofPlaneModel }) {
  const geometry = useMemo(() => quadGeometry(plane.corners), [plane.corners]);
  return (
    <mesh geometry={geometry} raycast={noRaycast} castShadow>
      <meshStandardMaterial
        color="#3c4048"
        roughness={0.85}
        metalness={0}
        side={DoubleSide}
        transparent
        opacity={0.55}
      />
    </mesh>
  );
}

/** Two triangles from four corners in order, with one flat normal. */
function quadGeometry(corners: readonly [Vec3, Vec3, Vec3, Vec3]): BufferGeometry {
  const [a, b, c, d] = corners;
  const positions = [...a, ...b, ...c, ...a, ...c, ...d];
  const normal = new Vector3()
    .subVectors(new Vector3(...b), new Vector3(...a))
    .cross(new Vector3().subVectors(new Vector3(...d), new Vector3(...a)))
    .normalize();
  const normals: number[] = [];
  for (let index = 0; index < 6; index += 1) normals.push(normal.x, normal.y, normal.z);

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  return geometry;
}

/** The room is scenery. Letting it take a click would steal selections from the units. */
const noRaycast = (): void => {};
