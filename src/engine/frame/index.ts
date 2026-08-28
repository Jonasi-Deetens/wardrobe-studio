import { getProfile, type Profile } from "../catalog/profiles";
import {
  boxOfPoints,
  unionBox,
  type Box3,
  type Placement,
  type Vec3,
} from "../core/geometry";
import {
  memberCorners,
  SQUARE_END,
  type Member,
  type MemberEnd,
  type MemberOp,
  type MemberRole,
  type Weld,
} from "../core/member";
import { mm2 } from "../core/units";

/**
 * Welded frames.
 *
 * Two builders cover everything the metal units need: a flat rectangular frame — a gate, a
 * face frame, the ring of rails under a top — and a four-legged table frame, which is that
 * ring plus legs plus whatever rails and braces hold it square.
 *
 * The rules encoded here are the ones a fabricator applies without thinking:
 *
 * - **A mitred corner is cut at half the included angle.** Two members meeting at 90° are
 *   each cut at 45°, and the cut length is measured long point to long point, because that
 *   is the number you set the saw stop to.
 * - **A member butting into a face is cut square**, unless it arrives at an angle, in which
 *   case the cut is the angle between the member and the face's normal. That is why a
 *   diagonal brace at 45° is cut at 45° and a brace at 30° is cut at 60°.
 * - **Every joint gets a weld.** A frame with no weld at a joint is not a frame, so the
 *   builders emit one per joint rather than leaving it to be remembered later, and the weld
 *   schedule is generated from the same list the geometry came from.
 */

export type FrameBuild = {
  readonly members: readonly Member[];
  readonly welds: readonly Weld[];
  readonly bounds: Box3;
};

const EMPTY: Box3 = { min: [0, 0, 0], max: [0, 0, 0] };

export function frameBounds(members: readonly Member[]): Box3 {
  if (members.length === 0) return EMPTY;
  return members
    .map((member) => boxOfPoints(memberCorners(member, sectionOf(member))))
    .reduce((acc, box) => unionBox(acc, box));
}

function sectionOf(member: Member): { readonly width: number; readonly height: number } {
  const profile = getProfile(member.profileId);
  return { width: profile.width, height: profile.height };
}

/** A mitre, in the plane the frame lies in. */
function mitre(degrees: number, about: "w" | "t" = "t"): MemberEnd {
  return { kind: "mitre", angle: mm2(degrees), about };
}

/**
 * The cut on an end that lands against a flat face.
 *
 * Square when the member arrives perpendicular to the face; otherwise the angle between the
 * member's own axis and the face's normal, which is the angle the saw is set to.
 */
export function endAgainstFace(axis: Vec3, faceNormal: Vec3, about: "w" | "t" = "t"): MemberEnd {
  const dot = Math.abs(
    axis[0] * faceNormal[0] + axis[1] * faceNormal[1] + axis[2] * faceNormal[2],
  );
  const degrees = mm2((Math.acos(Math.min(1, dot)) * 180) / Math.PI);
  if (degrees < 0.05) return SQUARE_END;
  return { kind: "mitre", angle: degrees, about };
}

/**
 * A weld all the way round a hollow section, which is what a structural joint gets.
 *
 * The leg of the fillet is the wall thickness: a bigger weld on thin tube burns through,
 * and a smaller one is not the full strength of the section.
 */
function weldAt(
  id: string,
  a: Member,
  b: Member,
  at: Vec3,
  ground: boolean,
  label: string,
): Weld {
  const profile = getProfile(b.profileId);
  const perimeter =
    profile.shape === "round"
      ? Math.PI * profile.width
      : 2 * (profile.width + profile.height);
  return {
    id,
    a: a.id,
    b: b.id,
    kind: "fillet",
    size: Math.max(3, Math.round(profile.wall)),
    length: mm2(perimeter),
    at,
    ground,
    label,
  };
}

/* ------------------------------------------------- flat rectangular frame - */

/** The plane a flat frame lies in, named by the two axes it spans. */
export type FramePlane = "xy" | "xz" | "yz";

export type RectFrameSpec = {
  /** Prefix for the member ids: `${id}-top`, `${id}-left`, and so on. */
  readonly id: string;
  readonly profileId: string;
  /** Outside size along the plane's first axis. */
  readonly width: number;
  /** Outside size along the plane's second axis. */
  readonly height: number;
  readonly plane: FramePlane;
  /** Room-space position of the frame's own (0, 0) corner. */
  readonly origin: Vec3;
  /** Mitred corners are cleaner to weld and to look at; butt joints are quicker to cut. */
  readonly corners: "mitred" | "butt";
  readonly role?: MemberRole;
  readonly label?: string;
  readonly ground?: boolean;
};

const PLANE_AXES: Record<FramePlane, { readonly u: Vec3; readonly v: Vec3; readonly n: Vec3 }> = {
  xy: { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
  xz: { u: [1, 0, 0], v: [0, 0, 1], n: [0, 1, 0] },
  yz: { u: [0, 0, 1], v: [0, 1, 0], n: [1, 0, 0] },
};

/**
 * A rectangle of tube: two members along the first axis, two along the second.
 *
 * Mitred, all four are cut to the outside dimension with 45° on both ends, and the corners
 * meet on the diagonal. Butt-jointed, the members along the first axis run the full width
 * and the other two are cut to fit between them, which is the arrangement that puts the
 * visible joint on the ends rather than on the face.
 */
export function buildRectFrame(spec: RectFrameSpec): FrameBuild {
  const profile = getProfile(spec.profileId);
  const { u, v, n } = PLANE_AXES[spec.plane];
  const role: MemberRole = spec.role ?? "rail";
  const ground = spec.ground ?? false;
  const label = spec.label ?? "Frame";
  const mitred = spec.corners === "mitred";
  const t = profile.height;

  const at = (du: number, dv: number): Vec3 => [
    spec.origin[0] + u[0] * du + v[0] * dv,
    spec.origin[1] + u[1] * du + v[1] * dv,
    spec.origin[2] + u[2] * du + v[2] * dv,
  ];

  /* Section across the member: `w` runs along the frame's plane normal and `t` across the
     member inside the plane, so the frame is as thick as the profile is wide and every
     member lies flat in it. `t` always points into the frame, which is what lets a member
     be positioned by the corner it starts from. */
  const along = (origin: Vec3, axis: Vec3): Placement => ({
    origin,
    lAxis: axis,
    wAxis: n,
    tAxis: axis === u ? v : u,
  });

  const uprightLength = mitred ? spec.height : spec.height - 2 * t;

  const members: Member[] = [
    {
      id: `${spec.id}-bottom`,
      role,
      label: `${label} bottom rail`,
      profileId: spec.profileId,
      length: mm2(spec.width),
      ends: mitred ? [mitre(45), mitre(45)] : [SQUARE_END, SQUARE_END],
      placement: along(at(0, 0), u),
      ops: [],
    },
    {
      id: `${spec.id}-top`,
      role,
      label: `${label} top rail`,
      profileId: spec.profileId,
      length: mm2(spec.width),
      ends: mitred ? [mitre(45), mitre(45)] : [SQUARE_END, SQUARE_END],
      placement: along(at(0, spec.height - t), u),
      ops: [],
    },
    {
      id: `${spec.id}-left`,
      role,
      label: `${label} left upright`,
      profileId: spec.profileId,
      length: mm2(uprightLength),
      ends: mitred ? [mitre(45), mitre(45)] : [SQUARE_END, SQUARE_END],
      placement: along(at(0, mitred ? 0 : t), v),
      ops: [],
    },
    {
      id: `${spec.id}-right`,
      role,
      label: `${label} right upright`,
      profileId: spec.profileId,
      length: mm2(uprightLength),
      ends: mitred ? [mitre(45), mitre(45)] : [SQUARE_END, SQUARE_END],
      placement: along(at(spec.width - t, mitred ? 0 : t), v),
      ops: [],
    },
  ];

  const [bottom, top, left, right] = members as [Member, Member, Member, Member];
  const welds: Weld[] = [
    weldAt(`${spec.id}-w-bl`, bottom, left, at(0, 0), ground, `${label}: bottom to left`),
    weldAt(`${spec.id}-w-br`, bottom, right, at(spec.width, 0), ground, `${label}: bottom to right`),
    weldAt(`${spec.id}-w-tl`, top, left, at(0, spec.height), ground, `${label}: top to left`),
    weldAt(`${spec.id}-w-tr`, top, right, at(spec.width, spec.height), ground, `${label}: top to right`),
  ];

  return { members, welds, bounds: frameBounds(members) };
}

/* ------------------------------------------------------ four-leg table frame - */

export type TableFrameSpec = {
  readonly id: string;
  /** Overall footprint. Legs are set in from these faces. */
  readonly width: number;
  readonly depth: number;
  /**
   * Height of the top of the frame, which is where the underside of the top sits. A
   * commercial table is 850 to 900mm to the top surface, so the frame is that less the
   * thickness of the top.
   */
  readonly frameHeight: number;
  readonly legProfileId: string;
  readonly railProfileId: string;
  /** How far the legs are set in from the outside faces. */
  readonly legInset: number;
  /** Drop from the top of the frame to the top of the perimeter rails. */
  readonly railDrop: number;
  /** Heights above the floor for extra rail rings, one per undershelf. */
  readonly shelfRailHeights: readonly number[];
  /** Adjustable feet take up this much under the leg, so the leg is cut shorter. */
  readonly footAllowance: number;
  /** Diagonal braces in the end planes, for a tall or a heavily loaded frame. */
  readonly braced: boolean;
  /** Ground the welds flush. What a visible stainless corner needs. */
  readonly ground: boolean;
};

/**
 * Legs, a ring of rails under the top, a ring per undershelf, and optional bracing.
 *
 * Rails butt into the legs and are cut square, which is how a welded table is actually
 * made: mitring a rail into a leg buys nothing, because the joint is hidden and the weld
 * carries the load either way. The legs are the full height of the frame and the rails are
 * cut to fit between them, so the leg faces stay flat where the top and the feet land.
 */
export function buildTableFrame(spec: TableFrameSpec): FrameBuild {
  const leg = getProfile(spec.legProfileId);
  const rail = getProfile(spec.railProfileId);

  const legLength = mm2(spec.frameHeight - spec.footAllowance);
  const x0 = spec.legInset;
  const x1 = spec.width - spec.legInset - leg.width;
  const z0 = spec.legInset;
  const z1 = spec.depth - spec.legInset - leg.height;

  const legSpots: readonly { readonly id: string; readonly x: number; readonly z: number; readonly label: string }[] = [
    { id: "bl", x: x0, z: z0, label: "back left" },
    { id: "br", x: x1, z: z0, label: "back right" },
    { id: "fl", x: x0, z: z1, label: "front left" },
    { id: "fr", x: x1, z: z1, label: "front right" },
  ];

  const legs: Member[] = legSpots.map((spot) => ({
    id: `${spec.id}-leg-${spot.id}`,
    role: "leg" as MemberRole,
    label: `Leg, ${spot.label}`,
    profileId: spec.legProfileId,
    length: legLength,
    ends: [SQUARE_END, SQUARE_END],
    placement: {
      origin: [spot.x, spec.footAllowance, spot.z] as Vec3,
      lAxis: [0, 1, 0] as Vec3,
      wAxis: [1, 0, 0] as Vec3,
      tAxis: [0, 0, 1] as Vec3,
    },
    ops:
      spec.footAllowance > 0
        ? [
            {
              kind: "hole",
              id: `${spec.id}-leg-${spot.id}-foot`,
              along: 0,
              face: "t0",
              across: leg.width / 2,
              diameter: 10,
              through: false,
              purpose: "foot-thread",
              note: "M10 insert welded inside the leg for the levelling foot",
            } satisfies MemberOp,
          ]
        : [],
  }));

  const legById = new Map(legs.map((member, index) => [legSpots[index]?.id ?? "", member]));
  const members: Member[] = [...legs];
  const welds: Weld[] = [];

  /* Rail rings. The top one hangs under the top; the rest carry undershelves. */
  const rings: readonly { readonly y: number; readonly name: string; readonly role: MemberRole }[] = [
    {
      y: mm2(spec.frameHeight - spec.railDrop - rail.height),
      name: "Top rail",
      role: "rail",
    },
    ...spec.shelfRailHeights.map((y) => ({
      y: mm2(y),
      name: "Shelf rail",
      role: "stretcher" as MemberRole,
    })),
  ];

  rings.forEach((ring, index) => {
    const ringId = `${spec.id}-r${index}`;
    /* Rails along X run between the left and right legs; rails along Z between back and
       front. Both are cut to the clear distance, which is the number that goes on the saw. */
    const spanX = mm2(x1 - (x0 + leg.width));
    const spanZ = mm2(z1 - (z0 + leg.height));
    const railW = rail.width;

    const definitions: readonly {
      readonly key: string;
      readonly label: string;
      readonly length: number;
      readonly placement: Placement;
      readonly joins: readonly [string, string];
      readonly at: readonly [Vec3, Vec3];
    }[] = [
      {
        key: "back",
        label: `${ring.name}, back`,
        length: spanX,
        placement: {
          origin: [x0 + leg.width, ring.y, z0 + (leg.height - railW) / 2],
          lAxis: [1, 0, 0],
          wAxis: [0, 0, 1],
          tAxis: [0, 1, 0],
        },
        joins: ["bl", "br"],
        at: [
          [x0 + leg.width, ring.y, z0],
          [x1, ring.y, z0],
        ],
      },
      {
        key: "front",
        label: `${ring.name}, front`,
        length: spanX,
        placement: {
          origin: [x0 + leg.width, ring.y, z1 + (leg.height - railW) / 2],
          lAxis: [1, 0, 0],
          wAxis: [0, 0, 1],
          tAxis: [0, 1, 0],
        },
        joins: ["fl", "fr"],
        at: [
          [x0 + leg.width, ring.y, z1],
          [x1, ring.y, z1],
        ],
      },
      {
        key: "left",
        label: `${ring.name}, left`,
        length: spanZ,
        placement: {
          origin: [x0 + (leg.width - railW) / 2, ring.y, z0 + leg.height],
          lAxis: [0, 0, 1],
          wAxis: [1, 0, 0],
          tAxis: [0, 1, 0],
        },
        joins: ["bl", "fl"],
        at: [
          [x0, ring.y, z0 + leg.height],
          [x0, ring.y, z1],
        ],
      },
      {
        key: "right",
        label: `${ring.name}, right`,
        length: spanZ,
        placement: {
          origin: [x1 + (leg.width - railW) / 2, ring.y, z0 + leg.height],
          lAxis: [0, 0, 1],
          wAxis: [1, 0, 0],
          tAxis: [0, 1, 0],
        },
        joins: ["br", "fr"],
        at: [
          [x1, ring.y, z0 + leg.height],
          [x1, ring.y, z1],
        ],
      },
    ];

    for (const definition of definitions) {
      if (definition.length <= 0) continue;
      const member: Member = {
        id: `${ringId}-${definition.key}`,
        role: ring.role,
        label: definition.label,
        profileId: spec.railProfileId,
        length: definition.length,
        ends: [SQUARE_END, SQUARE_END],
        placement: definition.placement,
        ops: [],
      };
      members.push(member);

      definition.joins.forEach((legKey, end) => {
        const target = legById.get(legKey);
        if (!target) return;
        welds.push(
          weldAt(
            `${member.id}-w${end}`,
            target,
            member,
            definition.at[end] as Vec3,
            spec.ground,
            `${definition.label} to ${target.label.toLowerCase()}`,
          ),
        );
      });
    }
  });

  if (spec.braced) {
    /* One diagonal in each end plane, from the foot of the front leg to the head of the
       back leg. That is what stops a tall frame folding over sideways, and it goes in the
       end rather than the front so nobody kicks it. */
    const braceProfile = rail;
    const y0 = spec.footAllowance + 60;
    const y1 = mm2(spec.frameHeight - spec.railDrop - rail.height - 40);
    const rise = y1 - y0;
    const run = mm2(z1 - (z0 + leg.height));
    if (rise > 100 && run > 100) {
      const length = mm2(Math.hypot(rise, run));
      const axis: Vec3 = [0, rise / length, -run / length];
      const end = endAgainstFace(axis, [0, 0, 1], "w");

      for (const side of [
        { key: "left", x: x0, legs: ["fl", "bl"] as const },
        { key: "right", x: x1, legs: ["fr", "br"] as const },
      ]) {
        const member: Member = {
          id: `${spec.id}-brace-${side.key}`,
          role: "brace",
          label: `Brace, ${side.key} end`,
          profileId: braceProfile.id,
          length,
          ends: [end, end],
          placement: {
            origin: [side.x + (leg.width - braceProfile.width) / 2, y0, z1],
            lAxis: axis,
            wAxis: [1, 0, 0],
            /* Perpendicular to the brace in the end plane, so the section stands up in it. */
            tAxis: [0, run / length, rise / length],
          },
          ops: [],
        };
        members.push(member);
        side.legs.forEach((legKey, index) => {
          const target = legById.get(legKey);
          if (!target) return;
          welds.push(
            weldAt(
              `${member.id}-w${index}`,
              target,
              member,
              [side.x, index === 0 ? y0 : y1, index === 0 ? z1 : z0 + leg.height],
              spec.ground,
              `${member.label} to ${target.label.toLowerCase()}`,
            ),
          );
        });
      }
    }
  }

  return { members, welds, bounds: frameBounds(members) };
}

/** Every profile a frame uses, for the advisor and for the tube schedule's headings. */
export function profilesUsed(members: readonly Member[]): readonly Profile[] {
  const ids = [...new Set(members.map((member) => member.profileId))];
  return ids.map((id) => getProfile(id));
}
