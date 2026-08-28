import { memo, useMemo } from "react";
import {
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  MeshStandardMaterial,
  Path,
  Shape,
  type Matrix4,
} from "three";
import { getProfile, type Profile } from "@/engine/catalog/profiles";
import type { Member } from "@/engine/core/member";

/**
 * The metalwork.
 *
 * A member is drawn as its real section extruded along its length: a hollow section is a
 * tube with a wall, not a solid bar, because the wall is the whole point of it — you can
 * see whether a bolt has anything to bite on, and a cut end reads as a cut end. The section
 * is built once per profile and shared, so a frame of forty rails is one geometry.
 *
 * Mitres are not modelled. A 45° cut takes a triangle off a corner that is 40mm across and
 * hidden inside a welded joint, and modelling it would cost a geometry per member.
 */

const geometries = new Map<string, BufferGeometry>();
const materials = new Map<string, MeshStandardMaterial>();

/**
 * The section, at real size, extruded one millimetre along Z so the length can be scaled
 * by the member's own transform.
 */
function profileGeometry(profile: Profile): BufferGeometry {
  const cached = geometries.get(profile.id);
  if (cached) return cached;

  const geometry = buildGeometry(profile);
  /* Extrusion runs from 0 to 1 in Z; the transform positions the member by its centre. */
  geometry.translate(0, 0, -0.5);
  geometries.set(profile.id, geometry);
  return geometry;
}

function buildGeometry(profile: Profile): BufferGeometry {
  if (profile.shape === "round") {
    const outer = new CylinderGeometry(profile.width / 2, profile.width / 2, 1, 24, 1, true);
    /* A cylinder is built along Y; the section plane here is XY with the length along Z. */
    outer.rotateX(Math.PI / 2);
    outer.translate(0, 0, 0.5);
    return outer;
  }

  const shape = new Shape();
  const w = profile.width;
  const h = profile.height;

  if (profile.shape === "angle") {
    /* An L, drawn from the inside corner out, so it reads as an angle rather than a box. */
    const t = profile.wall;
    shape.moveTo(-w / 2, -h / 2);
    shape.lineTo(w / 2, -h / 2);
    shape.lineTo(w / 2, -h / 2 + t);
    shape.lineTo(-w / 2 + t, -h / 2 + t);
    shape.lineTo(-w / 2 + t, h / 2);
    shape.lineTo(-w / 2, h / 2);
    shape.closePath();
  } else {
    rectangle(shape, w, h, profile.cornerRadius);
    /* Hollow sections get their bore, which is what makes a cut end look like tube. */
    if (profile.shape !== "flat" && profile.wall > 0) {
      const bore = new Path();
      rectangle(bore, w - 2 * profile.wall, h - 2 * profile.wall, Math.max(profile.cornerRadius - profile.wall, 0));
      shape.holes.push(bore);
    }
  }

  return new ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 2 });
}

/** A rectangle centred on the origin, with rounded corners when the section has them. */
function rectangle(path: Shape | Path, width: number, height: number, radius: number): void {
  const x = width / 2;
  const y = height / 2;
  const r = Math.min(radius, x, y);
  if (r <= 0.01) {
    path.moveTo(-x, -y);
    path.lineTo(x, -y);
    path.lineTo(x, y);
    path.lineTo(-x, y);
    path.closePath();
    return;
  }
  path.moveTo(-x + r, -y);
  path.lineTo(x - r, -y);
  path.quadraticCurveTo(x, -y, x, -y + r);
  path.lineTo(x, y - r);
  path.quadraticCurveTo(x, y, x - r, y);
  path.lineTo(-x + r, y);
  path.quadraticCurveTo(-x, y, -x, y - r);
  path.lineTo(-x, -y + r);
  path.quadraticCurveTo(-x, -y, -x + r, -y);
  path.closePath();
}

function profileMaterial(profile: Profile, dimmed: boolean): MeshStandardMaterial {
  const key = `${profile.id}|${dimmed ? "dim" : "on"}`;
  const cached = materials.get(key);
  if (cached) return cached;
  const stainless = profile.alloy === "stainless-304";
  const material = new MeshStandardMaterial({
    color: profile.color,
    /* Brushed stainless is a mirror that has been scratched; a painted mild steel frame
       barely reflects at all, and the difference is most of what tells them apart. */
    metalness: stainless ? 0.85 : 0.4,
    roughness: stainless ? 0.32 : 0.62,
    transparent: dimmed,
    opacity: dimmed ? 0.12 : 1,
    depthWrite: !dimmed,
  });
  materials.set(key, material);
  return material;
}

type MembersProps = {
  readonly members: readonly Member[];
  readonly transforms: ReadonlyMap<string, Matrix4>;
  /** Dimmed while a panel role is isolated, so the metal does not fight the panel. */
  readonly dimmed?: boolean;
};

export const Members = memo(function Members({ members, transforms, dimmed = false }: MembersProps) {
  if (members.length === 0) return null;
  return (
    <group>
      {members.map((member) => (
        <MemberMesh
          key={member.id}
          member={member}
          matrix={transforms.get(member.id)}
          dimmed={dimmed}
        />
      ))}
    </group>
  );
});

const MemberMesh = memo(function MemberMesh({
  member,
  matrix,
  dimmed,
}: {
  readonly member: Member;
  readonly matrix: Matrix4 | undefined;
  readonly dimmed: boolean;
}) {
  const profile = useMemo(() => getProfile(member.profileId), [member.profileId]);
  if (!matrix) return null;

  return (
    <mesh
      matrix={matrix}
      matrixAutoUpdate={false}
      geometry={profileGeometry(profile)}
      material={profileMaterial(profile, dimmed)}
      castShadow={!dimmed}
      receiveShadow={!dimmed}
      raycast={noRaycast}
      userData={{ memberId: member.id }}
    />
  );
});

/** Metalwork is not selectable yet; a click here should reach the panel behind it. */
const noRaycast = (): void => {};
