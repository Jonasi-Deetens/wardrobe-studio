import { type ThreeEvent, useThree } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import { BoxGeometry, EdgesGeometry, Plane, Vector3 } from "three";
import type { Box3 } from "@/engine/core/geometry";
import type { ProjectModel, UnitModel } from "@/engine/project";
import type { RoomSpec } from "@/engine/spec/types";
import { useStudio } from "../store/useStudio";
import { Hardware } from "./Hardware";
import { Members } from "./Members";
import { Parts } from "./Parts";
import {
  memberTransforms,
  partSceneOf,
  partTransforms,
  SCENE_SCALE,
  sceneBounds,
} from "./scene";

/**
 * The units standing in the room.
 *
 * Each one is drawn in its own space inside a group carrying its placement, so exploding,
 * swinging doors, selecting a panel and the hardware layers all work exactly as they did
 * when the app could only build one wardrobe — none of them knows the room exists. The
 * placement is applied once, here, by the same numbers `solveProject` used for the
 * room-space bounds, so what is drawn and what the advisor measures cannot disagree.
 *
 * A unit is also dragged from here, by the footprint plate on the floor beneath it.
 */

const UNIT_BOX = new BoxGeometry(1, 1, 1);
const UNIT_BOX_EDGES = new EdgesGeometry(UNIT_BOX);

type UnitsProps = { readonly project: ProjectModel };

export const Units = memo(function Units({ project }: UnitsProps) {
  const selectedUnitId = useStudio((state) => state.selectedUnitId);
  const isolate = useStudio((state) => state.view.isolateUnit);

  const shown = isolate
    ? project.units.filter((unit) => unit.id === selectedUnitId)
    : project.units;

  return (
    <group>
      {shown.map((unit) => (
        <UnitGroup
          key={unit.id}
          unit={unit}
          room={project.spec.room}
          selected={unit.id === selectedUnitId}
          alone={project.units.length === 1}
        />
      ))}
    </group>
  );
});

type UnitGroupProps = {
  readonly unit: UnitModel;
  readonly room: RoomSpec;
  readonly selected: boolean;
  readonly alone: boolean;
};

const UnitGroup = memo(function UnitGroup({ unit, room, selected, alone }: UnitGroupProps) {
  const explode = useStudio((state) => state.view.explode);
  const doorsOpen = useStudio((state) => state.view.doorsOpen);

  /* Explode radiates from the unit's own centre, so a unit at the far end of the room does
     not fly towards the middle of the floor. */
  const bounds = useMemo(() => sceneBounds(unit.localBounds), [unit.localBounds]);
  const scene = useMemo(() => partSceneOf(unit), [unit]);
  const transforms = useMemo(
    () => partTransforms(scene, { explode, doorsOpen, bounds }),
    [scene, explode, doorsOpen, bounds],
  );
  const metal = useMemo(
    () => memberTransforms(unit.members, { explode, bounds }),
    [unit.members, explode, bounds],
  );

  return (
    <group position={[unit.at.x, 0, unit.at.z]} rotation-y={(unit.at.yaw * Math.PI) / 180}>
      <Parts parts={scene.parts} transforms={transforms} />
      <Hardware scene={scene} transforms={transforms} />
      <Members members={unit.members} transforms={metal} />
      {selected && !alone ? <UnitOutline bounds={unit.localBounds} /> : null}
      <UnitHandle unit={unit} room={room} selected={selected} />
    </group>
  );
});

/** A wire box round the unit being edited, so it can be told apart in a crowded room. */
function UnitOutline({ bounds }: { readonly bounds: Box3 }) {
  const size = [
    Math.max(bounds.max[0] - bounds.min[0], 1),
    Math.max(bounds.max[1] - bounds.min[1], 1),
    Math.max(bounds.max[2] - bounds.min[2], 1),
  ] as const;
  const centre = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ] as const;

  return (
    <lineSegments
      geometry={UNIT_BOX_EDGES}
      position={[centre[0], centre[1], centre[2]]}
      scale={[size[0] + 24, size[1] + 24, size[2] + 24]}
      raycast={noRaycast}
    >
      <lineBasicMaterial color="#f0a35e" transparent opacity={0.7} depthWrite={false} />
    </lineSegments>
  );
}

/* ------------------------------------------------------------------ moving - */

const GRID = 10;
/** How close to a wall a unit has to be dragged before it snaps against it. */
const WALL_SNAP = 60;

type HandleProps = {
  readonly unit: UnitModel;
  readonly room: RoomSpec;
  readonly selected: boolean;
};

/**
 * The plate on the floor under a unit: click it to select the unit, drag it to move the
 * unit across the room.
 *
 * Dragging reads a ray against the floor plane rather than the plate's own surface, because
 * the plate moves with the unit — following its surface would make the pointer chase a
 * target that keeps running away, and the drag would stop the moment the pointer left it.
 */
function UnitHandle({ unit, room, selected }: HandleProps) {
  const moveUnit = useStudio((state) => state.moveUnit);
  const selectUnit = useStudio((state) => state.selectUnit);
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;

  const drag = useRef<{ readonly dx: number; readonly dz: number } | null>(null);

  const local = unit.localBounds;
  const width = Math.max(local.max[0] - local.min[0], 1);
  const depth = Math.max(local.max[2] - local.min[2], 1);

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    selectUnit(unit.id);
    const hit = floorHit(event);
    if (!hit) return;
    drag.current = { dx: unit.at.x - hit.x, dz: unit.at.z - hit.z };
    if (controls) controls.enabled = false;
    /* Capture on the object, so the drag survives the pointer leaving the plate — which it
       does immediately, because the plate is only as big as the unit. */
    capture(event).setPointerCapture(event.pointerId);
    document.body.style.cursor = "grabbing";
  };

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    const grab = drag.current;
    if (!grab) return;
    event.stopPropagation();
    const hit = floorHit(event);
    if (!hit) return;
    moveUnit(unit.id, snapToRoom(unit, room, hit.x + grab.dx, hit.z + grab.dz));
  };

  const endDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    event.stopPropagation();
    drag.current = null;
    if (controls) controls.enabled = true;
    capture(event).releasePointerCapture(event.pointerId);
    document.body.style.cursor = "";
  };

  return (
    <mesh
      position={[(local.min[0] + local.max[0]) / 2, 1, (local.min[2] + local.max[2]) / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = drag.current ? "grabbing" : "grab";
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        if (!drag.current) document.body.style.cursor = "";
      }}
    >
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial
        color={selected ? "#f0a35e" : "#7f8b9c"}
        transparent
        opacity={selected ? 0.35 : 0.14}
        depthWrite={false}
      />
    </mesh>
  );
}

type PointerCapture = {
  setPointerCapture: (id: number) => void;
  releasePointerCapture: (id: number) => void;
};

/**
 * Pointer capture on the picked object.
 *
 * react-three-fiber replaces `target` with a capture handle bound to the object that was
 * hit, but types it as the DOM `EventTarget` the event came from, hence the cast.
 */
function capture(event: ThreeEvent<PointerEvent>): PointerCapture {
  return event.target as unknown as PointerCapture;
}

const FLOOR = new Plane(new Vector3(0, 1, 0), 0);
const hitPoint = new Vector3();

/**
 * Where the pointer is on the floor, in millimetres.
 *
 * The whole scene hangs off one group scaled from millimetres to metres, and the floor is
 * the world's y = 0 plane, so undoing that one scale is all it takes to get back to the
 * units the placement is written in.
 */
function floorHit(event: ThreeEvent<PointerEvent>): { x: number; z: number } | null {
  const point = event.ray.intersectPlane(FLOOR, hitPoint);
  if (!point) return null;
  return { x: point.x / SCENE_SCALE, z: point.z / SCENE_SCALE };
}

/**
 * Round the placement to the grid, and pull it flush against a wall when it is close.
 *
 * Snapping is on the unit's own edges rather than its origin, which is what makes "against
 * the back wall" reachable: the origin of a wardrobe is its left-back corner, but a unit
 * yawed 90 degrees has its back somewhere else entirely, and the offsets below come from
 * the room-space bounds so both cases work the same way.
 */
export function snapToRoom(
  unit: UnitModel,
  room: RoomSpec,
  x: number,
  z: number,
): { x: number; z: number } {
  /* Where the room-space box sits relative to the placement. Yaw is already baked in. */
  const offsetMinX = unit.bounds.min[0] - unit.at.x;
  const offsetMaxX = unit.bounds.max[0] - unit.at.x;
  const offsetMinZ = unit.bounds.min[2] - unit.at.z;
  const offsetMaxZ = unit.bounds.max[2] - unit.at.z;

  let nextX = Math.round(x / GRID) * GRID;
  let nextZ = Math.round(z / GRID) * GRID;

  if (Math.abs(nextX + offsetMinX) < WALL_SNAP) nextX = -offsetMinX;
  else if (Math.abs(nextX + offsetMaxX - room.width) < WALL_SNAP) {
    nextX = room.width - offsetMaxX;
  }
  if (Math.abs(nextZ + offsetMinZ) < WALL_SNAP) nextZ = -offsetMinZ;
  else if (Math.abs(nextZ + offsetMaxZ - room.depth) < WALL_SNAP) {
    nextZ = room.depth - offsetMaxZ;
  }

  return { x: Math.round(nextX), z: Math.round(nextZ) };
}

const noRaycast = (): void => {};
