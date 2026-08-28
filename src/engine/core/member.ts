import type { Placement, UnitTransform, Vec3 } from "./geometry";
import { add, boxOfPoints, toWorld, transformPlacement, type Box3 } from "./geometry";
import { mm } from "./units";

/**
 * A length of metal section: a leg, a rail, a brace.
 *
 * A tube is not a panel. A panel is length x width x thickness with machining on its two
 * broad faces, which is exactly wrong for a mitred 40x40 hollow section, so members are a
 * sibling of `Part` rather than a contortion of it. They share the placement convention —
 * local (0, 0, 0) at one end, length along `lAxis` — so one transform moves a whole unit,
 * panels and metalwork together.
 */

export type MemberRole =
  | "leg"
  | "rail"
  | "brace"
  | "post"
  | "stretcher"
  | "upright"
  | "cross-member"
  | "trim";

/** How an end is cut. The angle is measured from square, so a square end is zero. */
export type MemberEnd = {
  readonly kind: "square" | "mitre" | "coped";
  /** Degrees off square. A 45 degree mitre on both ends makes a right-angled corner. */
  readonly angle: number;
  /** Which local axis the cut turns about: `w` for a flat mitre, `t` for a bevel. */
  readonly about: "w" | "t";
  readonly note?: string;
};

export const SQUARE_END: MemberEnd = { kind: "square", angle: 0, about: "w" };

export type MemberOpPurpose =
  | "bolt-hole"
  | "foot-thread"
  | "top-fixing"
  | "shelf-fixing"
  | "drain"
  | "cable";

/**
 * A hole in a member, positioned along its length and around its section: `along` is the
 * distance from the origin end, `face` says which side of the section it enters.
 */
export type MemberOp = {
  readonly kind: "hole" | "slot";
  readonly id: string;
  readonly along: number;
  readonly face: "w0" | "w1" | "t0" | "t1";
  /** Position across that face, from the section's own origin corner. */
  readonly across: number;
  readonly diameter: number;
  readonly through: boolean;
  readonly purpose: MemberOpPurpose;
  readonly note?: string;
};

export type Member = {
  readonly id: string;
  readonly unitId?: string;
  readonly role: MemberRole;
  readonly label: string;
  readonly profileId: string;
  /** Cut length, long point to long point where an end is mitred. */
  readonly length: number;
  readonly ends: readonly [MemberEnd, MemberEnd];
  readonly placement: Placement;
  readonly ops: readonly MemberOp[];
  readonly notes?: readonly string[];
};

/**
 * A weld between two members, or between a member and a panel edge.
 *
 * `size` is the leg length of a fillet in millimetres. `ground` means the weld is dressed
 * back flush, which is what a visible corner on a stainless table needs and which costs
 * roughly as long again as the weld itself.
 */
export type Weld = {
  readonly id: string;
  readonly a: string;
  readonly b: string;
  readonly kind: "fillet" | "butt" | "plug";
  readonly size: number;
  readonly length: number;
  readonly at: Vec3;
  readonly ground: boolean;
  readonly label: string;
};

/** The member's local box in the unit's space, section included. */
export function memberCorners(
  member: Member,
  section: { readonly width: number; readonly height: number },
): Vec3[] {
  const corners: Vec3[] = [];
  for (const l of [0, member.length]) {
    for (const w of [0, section.width]) {
      for (const t of [0, section.height]) {
        corners.push(toWorld(member.placement, l, w, t));
      }
    }
  }
  return corners;
}

export function memberBounds(
  member: Member,
  section: { readonly width: number; readonly height: number },
): Box3 {
  return boxOfPoints(memberCorners(member, section));
}

export function placeMember(member: Member, at: UnitTransform): Member {
  if (at.x === 0 && at.z === 0 && at.yaw === 0) return member;
  return { ...member, placement: transformPlacement(member.placement, at) };
}

/** The same member, moved by an offset without turning it. */
export function translateMember(member: Member, by: Vec3): Member {
  if (by[0] === 0 && by[1] === 0 && by[2] === 0) return member;
  return {
    ...member,
    placement: { ...member.placement, origin: add(member.placement.origin, by) },
  };
}

/** A weld follows the members it joins. */
export function translateWeld(weld: Weld, by: Vec3): Weld {
  if (by[0] === 0 && by[1] === 0 && by[2] === 0) return weld;
  return { ...weld, at: add(weld.at, by) };
}

/**
 * Cut-list identity for metal: two members collapse into one line of the tube schedule
 * only when the section, the length, both end cuts and every hole match.
 */
export function memberSignature(member: Member): string {
  const ends = member.ends.map((end) => `${end.kind}${end.angle}${end.about}`).join(",");
  const ops = [...member.ops]
    .map((op) => `${op.kind}:${mm(op.along)}:${op.face}:${mm(op.across)}:${op.diameter}`)
    .sort()
    .join("|");
  return [member.role, member.profileId, mm(member.length), ends, ops].join("/");
}

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  leg: "Leg",
  rail: "Rail",
  brace: "Brace",
  post: "Post",
  stretcher: "Stretcher",
  upright: "Upright",
  "cross-member": "Cross member",
  trim: "Trim",
};
