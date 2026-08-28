import type { ThreeEvent } from "@react-three/fiber";
import { memo, useMemo } from "react";
import {
  BoxGeometry,
  Color,
  EdgesGeometry,
  LineBasicMaterial,
  MeshStandardMaterial,
  type Matrix4,
} from "three";
import type { Part } from "@/engine/core/part";
import { useStudio } from "../store/useStudio";
import { visualFor, type PartTransform } from "./scene";

/*
 * One geometry and one material per appearance, for the whole scene.
 *
 * Panel size is baked into each mesh's matrix, so every panel is the same unit box and
 * they can all share it — and a wardrobe with drawers and shelves easily runs to a
 * hundred panels, which was a hundred box geometries, a hundred edge geometries and two
 * hundred materials uploaded to the GPU to draw a hundred identical cubes. Materials are
 * cached by appearance rather than by part, and in practice nearly every panel in a
 * design is cut from the same board, so the cache stays tiny.
 */
const UNIT_BOX = new BoxGeometry(1, 1, 1);
const UNIT_BOX_EDGES = new EdgesGeometry(UNIT_BOX, 20);

const surfaces = new Map<string, MeshStandardMaterial>();
const outlines = new Map<string, LineBasicMaterial>();

type Appearance = {
  readonly color: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly emissive: string;
  readonly emissiveIntensity: number;
  readonly transparent: boolean;
  readonly opacity: number;
};

function surfaceMaterial(look: Appearance): MeshStandardMaterial {
  const key = `${look.color}|${look.roughness}|${look.metalness}|${look.emissive}|${look.emissiveIntensity}|${look.transparent}|${look.opacity}`;
  const cached = surfaces.get(key);
  if (cached) return cached;
  const material = new MeshStandardMaterial({
    color: new Color(look.color),
    roughness: look.roughness,
    metalness: look.metalness,
    emissive: new Color(look.emissive),
    emissiveIntensity: look.emissiveIntensity,
    transparent: look.transparent,
    opacity: look.opacity,
    depthWrite: !look.transparent,
    polygonOffset: true,
    polygonOffsetFactor: 1,
  });
  surfaces.set(key, material);
  return material;
}

function outlineMaterial(color: string, transparent: boolean, opacity: number): LineBasicMaterial {
  const key = `${color}|${transparent}|${opacity}`;
  const cached = outlines.get(key);
  if (cached) return cached;
  const material = new LineBasicMaterial({
    color: new Color(color),
    transparent,
    opacity,
    depthWrite: false,
  });
  outlines.set(key, material);
  return material;
}

type PartsProps = {
  readonly parts: readonly Part[];
  readonly transforms: ReadonlyMap<string, PartTransform>;
};

export const Parts = memo(function Parts({ parts, transforms }: PartsProps) {
  const showDoors = useStudio((state) => state.view.showDoors);
  const showBack = useStudio((state) => state.view.showBack);
  const isolateRole = useStudio((state) => state.view.isolateRole);
  const xray = useStudio((state) => state.view.xray);

  const visible = useMemo(
    () =>
      parts.filter((part) => {
        if (!showDoors && (part.role === "door" || part.role === "drawer-front")) return false;
        if (!showBack && part.role === "back") return false;
        return true;
      }),
    [parts, showDoors, showBack],
  );

  return (
    <group>
      {visible.map((part) => (
        <PartMesh
          key={part.id}
          part={part}
          matrix={(transforms.get(part.id) as PartTransform).matrix}
          dimmed={isolateRole !== null && part.role !== isolateRole}
          xray={xray}
        />
      ))}
    </group>
  );
});

type PartMeshProps = {
  readonly part: Part;
  readonly matrix: Matrix4;
  readonly dimmed: boolean;
  readonly xray: boolean;
};

const PartMesh = memo(function PartMesh({ part, matrix, dimmed, xray }: PartMeshProps) {
  const selected = useStudio((state) => state.selectedPartId === part.id);
  const hovered = useStudio(
    (state) => state.hoveredPartId === part.id || state.hoveredPartIds.includes(part.id),
  );
  const selectPart = useStudio((state) => state.selectPart);
  const openPanelFor = useStudio((state) => state.openPanelFor);
  const hoverPart = useStudio((state) => state.hoverPart);

  const visual = useMemo(() => visualFor(part), [part]);

  const onPointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    hoverPart(part.id);
    document.body.style.cursor = "pointer";
  };

  const onPointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    hoverPart(null);
    document.body.style.cursor = "";
  };

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    selectPart(part.id);
  };

  const onDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    openPanelFor(part.id);
  };

  /* X-ray keeps the selected panel solid: the point of looking through the carcase is
     to find the panel you are working on. */
  const transparent = (xray && !selected) || dimmed;
  const opacity = dimmed ? 0.08 : xray ? (hovered ? 0.4 : 0.16) : 1;

  const surface = surfaceMaterial({
    color: selected ? "#f0a35e" : hovered ? "#d8d2c8" : visual.color,
    roughness: visual.roughness,
    metalness: visual.metalness,
    emissive: selected ? "#7a3f0a" : hovered ? "#2a2622" : "#000000",
    emissiveIntensity: selected ? 0.55 : hovered ? 0.4 : 0,
    transparent,
    opacity,
  });
  const outline = outlineMaterial(
    selected ? "#ffd7a8" : "#12100e",
    transparent,
    dimmed ? 0.15 : xray ? 0.5 : 0.75,
  );

  return (
    <mesh
      matrix={matrix}
      matrixAutoUpdate={false}
      castShadow={!transparent}
      receiveShadow={!transparent}
      geometry={UNIT_BOX}
      material={surface}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      userData={{ partId: part.id }}
    >
      <lineSegments geometry={UNIT_BOX_EDGES} material={outline} raycast={noRaycast} />
    </mesh>
  );
});

/** Outlines are decoration; letting them take a click would block the panel beneath. */
const noRaycast = (): void => {};
