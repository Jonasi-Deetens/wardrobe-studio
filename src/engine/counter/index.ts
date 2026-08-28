import { getMaterial } from "../catalog/materials";
import { getProfile } from "../catalog/profiles";
import { foldsOf, turnedDownTray } from "../core/flat";
import { boxOfPoints, unionBox, type Box3, type Vec3 } from "../core/geometry";
import {
  SQUARE_END,
  translateMember,
  translateWeld,
  type Member,
  type Weld,
} from "../core/member";
import {
  partBounds,
  translatePart,
  type Fold,
  type MachiningOp,
  type Part,
} from "../core/part";
import { mm2 } from "../core/units";
import { buildTableFrame } from "../frame";
import { solve, type WardrobeModel } from "../solver";
import type { HardwareUse } from "../solver/draft";
import type { ResolvedDrawer } from "../solver/fittings";
import { createDefaultSpec, makeBay } from "../spec/defaults";
import type { CounterSpec, CounterUnitSpec, WardrobeSpec } from "../spec/types";
import { topFixingOps } from "../table";

/**
 * A counter on a welded frame.
 *
 * The difference from the work table is not the metal, it is what the metal is for. A table
 * frame holds a work surface up. A counter frame is a piece of furniture with a public face:
 * the top oversails it so there is something to lean on, the front is deliberately left open
 * so it can be clad, and what hangs inside it — drawers, shelves — is joinery rather than
 * sheet metal.
 *
 * Two decisions are worth stating because they are the ones that make it buildable:
 *
 * - **The drawer bank is a small wardrobe.** It is solved by the wardrobe solver, at its own
 *   origin, and then moved into the frame. So it gets the real runner drilling, the real
 *   system holes, the real handle positions and the real hardware list, and a fix to the
 *   drawer geometry fixes it here too. Building a second drawer solver would guarantee the
 *   two drifted apart.
 * - **The frame carries the load and the joinery only holds the drawers.** That is why the
 *   bank is cut to drop between the legs rather than to fill the counter: the metalwork is
 *   already square and already standing, and a carcase that has to be structural as well
 *   would need a back, a plinth and a tighter fit than a welded frame can promise.
 *
 * Unit space: origin on the floor at the back-left corner of the *top*, so the unit's
 * footprint is what someone measures with a tape. The frame sits inside that by the
 * overhangs, which is exactly what an overhang is.
 */

export type CounterModel = {
  /** The unit spec, cladding and all, because the cladding pass reads it back off here. */
  readonly spec: CounterUnitSpec;
  readonly unitId: string;
  readonly parts: readonly Part[];
  readonly members: readonly Member[];
  readonly welds: readonly Weld[];
  readonly hardware: readonly HardwareUse[];
  readonly bounds: Box3;
  /** The drawer bank, so the viewport can slide the drawers as one. */
  readonly drawers: readonly ResolvedDrawer[];
  /** Heights above the floor of the open shelves, lowest first. */
  readonly shelfHeights: readonly number[];
  /** Y of the underside of the top, which is where the frame stops. */
  readonly frameTop: number;
  /** Y of the bar surface, or null when there is no bar shelf. */
  readonly barY: number | null;
};

/** Inside bend radius on thin stainless: one thickness. */
const BEND_RADIUS_FACTOR = 1;

/** Turn-down on a folded stainless counter top. */
const INOX_SKIRT = 40;

export function solveCounter(spec: CounterUnitSpec, unitId: string): CounterModel {
  const id = (suffix: string): string => `${unitId}:${suffix}`;
  const topMaterial = getMaterial(spec.top.materialId);
  const frameProfile = getProfile(spec.frame.profileId);

  const parts: Part[] = [];
  const hardware: HardwareUse[] = [];

  const topThickness = topMaterial.thickness;
  const frameTop = mm2(spec.height - topThickness);
  const topOps: MachiningOp[] = [];

  /* The body: the footprint the frame actually occupies, inside the overhangs. */
  const bodyX0 = mm2(spec.top.endOverhang);
  const bodyZ0 = mm2(spec.top.backOverhang);
  const bodyWidth = mm2(spec.width - 2 * spec.top.endOverhang);
  const bodyDepth = mm2(spec.depth - spec.top.frontOverhang - spec.top.backOverhang);

  /* ------------------------------------------------------------------ top -- */

  /* The top is pushed last, because the bar posts notch through it and the notches are only
     known once the gantry has been laid out. */

  /* ---------------------------------------------------------------- frame -- */

  const footAllowance = spec.frame.feet === "castor" ? 75 : spec.frame.feet === "bullet" ? 30 : 0;
  const shelfHeights = shelfHeightsOf(spec, footAllowance, frameTop);
  const shelfThickness = getMaterial(spec.shelves.materialId).thickness;

  /**
   * Rail rings, lowest first.
   *
   * The bottom ring is structural and also carries the lowest shelf when the two are at
   * much the same height, which is the usual case: a ring at 150 and a shelf at 168 would
   * be two rings 18mm apart, which is a waste of tube and impossible to weld neatly.
   */
  const bottomRing = mm2(Math.max(spec.frame.bottomRail, footAllowance));
  const rings: number[] = [bottomRing];
  const shelfRingFor = new Map<number, number>();
  for (const y of shelfHeights) {
    const wanted = mm2(y - shelfThickness);
    const existing = rings.find((ring) => Math.abs(ring - wanted) <= 25);
    if (existing !== undefined) {
      shelfRingFor.set(y, existing);
      continue;
    }
    rings.push(wanted);
    shelfRingFor.set(y, wanted);
  }
  rings.sort((a, b) => a - b);

  const frame = buildTableFrame({
    id: id("frame"),
    width: bodyWidth,
    depth: bodyDepth,
    frameHeight: frameTop,
    legProfileId: spec.frame.profileId,
    railProfileId: spec.frame.profileId,
    legInset: spec.frame.inset,
    /* The top rail sits right under the top, because on a counter there is no turned-down
       edge to clear — the top is a board, and the rail is what it screws down to. */
    railDrop: 0,
    shelfRailHeights: rings,
    footAllowance,
    braced: spec.frame.braced,
    ground: spec.groundWelds,
  });

  const offset: Vec3 = [bodyX0, 0, bodyZ0];
  const members: Member[] = frame.members.map((member) => {
    const moved = translateMember({ ...member, unitId }, offset);
    return member.role === "rail"
      ? { ...moved, ops: [...moved.ops, ...topFixingOps(moved.id, moved.length)] }
      : moved;
  });
  const welds: Weld[] = frame.welds.map((weld) => translateWeld(weld, offset));

  /* ------------------------------------------------------------- bar shelf -- */

  const barY = spec.bar.height > frameTop + 100 ? mm2(spec.bar.height) : null;
  if (barY !== null) {
    const gantry = buildBarGantry(spec, id("bar"), unitId, {
      bodyX0,
      bodyZ0,
      bodyWidth,
      frameTop,
      barY,
    });
    parts.push(...gantry.parts);
    members.push(...gantry.members.map((member) => ({ ...member, unitId })));
    welds.push(...gantry.welds);
    topOps.push(...gantry.topNotches);
  }

  parts.push(buildTop(spec, id("top"), unitId, frameTop, topThickness, topOps));

  /* --------------------------------------------------------------- shelves -- */

  const legFace = {
    x0: mm2(bodyX0 + spec.frame.inset),
    x1: mm2(bodyX0 + bodyWidth - spec.frame.inset),
    z0: mm2(bodyZ0 + spec.frame.inset),
    z1: mm2(bodyZ0 + bodyDepth - spec.frame.inset),
  };

  shelfHeights.forEach((y, index) => {
    const ring = shelfRingFor.get(y) ?? y;
    parts.push(
      buildShelf(spec, id(`shelf-${index + 1}`), unitId, {
        y: mm2(ring + frameProfile.height),
        index,
        thickness: shelfThickness,
        legFace,
      }),
    );
  });

  /* ----------------------------------------------------------- drawer bank -- */

  let drawers: readonly ResolvedDrawer[] = [];
  if (spec.drawerBank.enabled) {
    const bank = buildDrawerBank(spec, unitId, {
      frameTop,
      bottomRing: mm2(bottomRing + frameProfile.height),
      legFace,
      bodyX0,
    });
    if (bank) {
      parts.push(...bank.parts);
      hardware.push(...bank.hardware);
      drawers = bank.drawers;
    }
  }

  /* -------------------------------------------------------------- hardware -- */

  if (spec.frame.feet !== "none") {
    hardware.push(
      spec.frame.feet === "bullet"
        ? {
            kind: "levelling-leg",
            catalogId: "foot-bullet-m10",
            name: "Adjustable bullet foot, M10 stem",
            quantity: 4,
            unit: "each",
            unitPrice: 3.4,
            note: "Screws into the M10 insert welded inside each leg. A counter is heavy and a floor is never flat.",
          }
        : {
            kind: "levelling-leg",
            catalogId: "castor-braked-75",
            name: "Braked castor, 75mm",
            quantity: 4,
            unit: "each",
            unitPrice: 11.5,
            note: "For a counter that has to be wheeled out. The leg length already allows for their height.",
          },
    );
  }

  hardware.push({
    kind: "connector",
    catalogId: "screw-6x40-top",
    name: "6 x 40 screw, washered",
    quantity: members.reduce(
      (count, member) => count + member.ops.filter((op) => op.purpose === "top-fixing").length,
      0,
    ),
    unit: "each",
    unitPrice: 0.12,
    note: "Up through the top rail into the underside of the top. A washer lets the board move with the weather without splitting.",
  });

  if (shelfHeights.length > 0) {
    hardware.push({
      kind: "shelf-support",
      catalogId: "clip-shelf-tube",
      name: "Shelf clip for tube frame",
      quantity: 4 * shelfHeights.length,
      unit: "each",
      unitPrice: 0.9,
      note: "Locates each shelf corner on its rail ring without a fixing through the shelf.",
    });
  }

  const bounds = parts.reduce<Box3>(
    (acc, part) => unionBox(acc, partBounds(part)),
    unionBox(
      boxOfPoints([
        [0, 0, 0],
        [spec.width, barY ?? spec.height, spec.depth],
      ]),
      { min: [offset[0], frame.bounds.min[1], offset[2]], max: [offset[0] + bodyWidth, frame.bounds.max[1], offset[2] + bodyDepth] },
    ),
  );

  return {
    spec,
    unitId,
    parts,
    members,
    welds,
    hardware,
    bounds,
    drawers,
    shelfHeights,
    frameTop,
    barY,
  };
}

/* ------------------------------------------------------------------- top --- */

/**
 * The counter top.
 *
 * A board top is one panel, banded all round, oversailing the frame. A stainless one is a
 * folded tray exactly like the work table's, because a flat sheet on a frame drums and
 * shows every rail underneath it.
 */
function buildTop(
  spec: CounterSpec,
  partId: string,
  unitId: string,
  y: number,
  thickness: number,
  ops: readonly MachiningOp[],
): Part {
  const inox = spec.top.kind === "inox";
  const folded = inox
    ? turnedDownTray({ length: spec.width, width: spec.depth }, INOX_SKIRT, thickness)
    : null;
  const folds: Fold[] = folded
    ? foldsOf(partId, folded.acrossWidth, folded.acrossLength, mm2(thickness * BEND_RADIUS_FACTOR))
    : [];

  const banding = inox
    ? {}
    : {
        l0: spec.top.bandingId,
        l1: spec.top.bandingId,
        w0: spec.top.bandingId,
        w1: spec.top.bandingId,
      };

  const notes: string[] = inox
    ? [
        `Folded tray, ${INOX_SKIRT}mm turned down all round. Corners notched before folding, welded up after, then ground and re-brushed.`,
      ]
    : [
        `Oversails the frame by ${spec.top.frontOverhang} at the front and ${spec.top.endOverhang} at each end.`,
        "Screwed down through the top rails from underneath, so there is no fixing visible in the surface.",
      ];
  if (spec.top.frontOverhang >= 250) {
    notes.push(
      "The overhang is deep enough to sit at, so it needs a bracket or a cantilevered rail under it — 300mm of unsupported board will flex under an elbow.",
    );
  }

  return {
    id: partId,
    unitId,
    role: "worktop",
    label: "Counter top",
    materialId: spec.top.materialId,
    length: spec.width,
    width: spec.depth,
    ...(folded
      ? { blank: { length: folded.acrossWidth.total, width: folded.acrossLength.total }, folds }
      : {}),
    thickness,
    grain: getMaterial(spec.top.materialId).hasGrain ? "length" : "none",
    edgeLabels: { l0: "left", l1: "right", w0: "back", w1: "front" },
    banding,
    placement: {
      origin: [0, y, spec.depth] as Vec3,
      lAxis: [1, 0, 0],
      wAxis: [0, 0, -1],
      tAxis: [0, 1, 0],
    },
    ops,
    notes,
  };
}

/* ------------------------------------------------------------- bar gantry --- */

type GantryContext = {
  readonly bodyX0: number;
  readonly bodyZ0: number;
  readonly bodyWidth: number;
  readonly frameTop: number;
  readonly barY: number;
};

/**
 * The raised bar surface, on two posts off the back legs.
 *
 * Posts rather than a second frame, because the counter top is already carrying the load
 * down to the legs and all the gantry has to do is hold a shelf at drinking height. They
 * stand on the back legs so the load goes straight down the same tube.
 */
function buildBarGantry(
  spec: CounterSpec,
  baseId: string,
  unitId: string,
  ctx: GantryContext,
): {
  parts: Part[];
  members: Member[];
  welds: Weld[];
  /** Where the posts pass through the counter top. */
  topNotches: MachiningOp[];
} {
  const profile = getProfile(spec.frame.profileId);
  const material = getMaterial(spec.bar.materialId);
  const postLength = mm2(ctx.barY - ctx.frameTop - material.thickness);
  if (postLength <= 0) return { parts: [], members: [], welds: [], topNotches: [] };

  const legX = [
    mm2(ctx.bodyX0 + spec.frame.inset),
    mm2(ctx.bodyX0 + ctx.bodyWidth - spec.frame.inset - profile.width),
  ];
  const postZ = mm2(ctx.bodyZ0 + spec.frame.inset);

  const posts: Member[] = legX.map((x, index) => ({
    id: `${baseId}-post-${index === 0 ? "left" : "right"}`,
    role: "post" as const,
    label: `Bar post, ${index === 0 ? "left" : "right"}`,
    profileId: spec.frame.profileId,
    length: postLength,
    ends: [SQUARE_END, SQUARE_END],
    placement: {
      origin: [x, ctx.frameTop, postZ] as Vec3,
      lAxis: [0, 1, 0] as Vec3,
      wAxis: [1, 0, 0] as Vec3,
      tAxis: [0, 0, 1] as Vec3,
    },
    ops: [],
    notes: [
      "Stands on the back leg below it and passes the counter top through a notch, so the load goes down the same tube rather than into the board.",
    ],
  }));

  /* One rail across the top of the posts, which the bar shelf sits on. */
  const railSpan = mm2((legX[1] as number) - (legX[0] as number) - profile.width);
  const rail: Member = {
    id: `${baseId}-rail`,
    role: "rail",
    label: "Bar shelf rail",
    profileId: spec.frame.profileId,
    length: railSpan,
    ends: [SQUARE_END, SQUARE_END],
    placement: {
      origin: [
        mm2((legX[0] as number) + profile.width),
        mm2(ctx.barY - material.thickness - profile.height),
        postZ,
      ] as Vec3,
      lAxis: [1, 0, 0],
      wAxis: [0, 0, 1],
      tAxis: [0, 1, 0],
    },
    ops: [],
  };

  const welds: Weld[] = posts.map((post, index) => ({
    id: `${baseId}-w-${index}`,
    a: post.id,
    b: rail.id,
    kind: "fillet" as const,
    size: profile.wall,
    length: mm2(2 * (profile.width + profile.height)),
    at: [
      index === 0 ? mm2((legX[0] as number) + profile.width) : (legX[1] as number),
      mm2(ctx.barY - material.thickness),
      postZ,
    ] as Vec3,
    ground: spec.groundWelds,
    label: `Bar rail to ${index === 0 ? "left" : "right"} post`,
  }));

  const shelf: Part = {
    id: `${baseId}-shelf`,
    unitId,
    role: "bar-shelf",
    label: "Bar shelf",
    materialId: spec.bar.materialId,
    length: spec.width,
    width: spec.bar.depth,
    thickness: material.thickness,
    grain: material.hasGrain ? "length" : "none",
    edgeLabels: { l0: "left", l1: "right", w0: "back", w1: "front" },
    banding: {
      l0: spec.top.bandingId,
      l1: spec.top.bandingId,
      w0: spec.top.bandingId,
      w1: spec.top.bandingId,
    },
    placement: {
      origin: [0, mm2(ctx.barY - material.thickness), spec.bar.depth] as Vec3,
      lAxis: [1, 0, 0],
      wAxis: [0, 0, -1],
      tAxis: [0, 1, 0],
    },
    ops: [],
    notes: [
      `At ${ctx.barY}mm, which is standing-and-drinking height. It also screens the working top behind it from anyone in front of the counter.`,
    ],
  };

  /**
   * The top has to be cut round the posts.
   *
   * 2mm of clearance all round, because a post welded up on the bench is never exactly where
   * the drawing says and a board cut tight to a tube cannot be dropped over it.
   */
  const clearance = 2;
  const topNotches: MachiningOp[] = legX.map((x, index) => {
    /* Top-local coordinates: l runs along the width from the left end, w runs from the
       back edge forwards, which is the top's own `wAxis`. */
    const l0 = mm2(x - clearance);
    const l1 = mm2(x + profile.width + clearance);
    const w0 = mm2(postZ - clearance);
    const w1 = mm2(postZ + profile.height + clearance);
    return {
      kind: "cutout" as const,
      id: `${baseId}-notch-${index}`,
      outline: [
        { l: l0, w: w0 },
        { l: l1, w: w0 },
        { l: l1, w: w1 },
        { l: l0, w: w1 },
      ],
      through: true,
      depth: 0,
      purpose: "service-cutout" as const,
      note: `Cut round the ${index === 0 ? "left" : "right"} bar post, ${clearance}mm clearance all round.`,
    };
  });

  return { parts: [shelf], members: [...posts, rail], welds, topNotches };
}

/* ----------------------------------------------------------------- shelf --- */

function buildShelf(
  spec: CounterSpec,
  partId: string,
  unitId: string,
  ctx: {
    readonly y: number;
    readonly index: number;
    readonly thickness: number;
    readonly legFace: { x0: number; x1: number; z0: number; z1: number };
  },
): Part {
  const material = getMaterial(spec.shelves.materialId);
  const length = mm2(ctx.legFace.x1 - ctx.legFace.x0);
  const width = mm2(ctx.legFace.z1 - ctx.legFace.z0 - spec.shelves.setback);

  return {
    id: partId,
    unitId,
    role: "undershelf",
    label: `Shelf ${ctx.index + 1}`,
    materialId: spec.shelves.materialId,
    length,
    width,
    thickness: ctx.thickness,
    grain: material.hasGrain ? "length" : "none",
    edgeLabels: { l0: "left", l1: "right", w0: "back", w1: "front" },
    banding: { w1: spec.top.bandingId },
    placement: {
      origin: [ctx.legFace.x0, ctx.y, mm2(ctx.legFace.z1 - spec.shelves.setback)] as Vec3,
      lAxis: [1, 0, 0],
      wAxis: [0, 0, -1],
      tAxis: [0, 1, 0],
    },
    ops: [],
    notes: [
      `Drops in between the legs onto the rail ring, so it can be lifted out. Set back ${spec.shelves.setback}mm from the front so it is not seen past the cladding.`,
    ],
  };
}

/* ------------------------------------------------------------ drawer bank --- */

type BankContext = {
  readonly frameTop: number;
  readonly bottomRing: number;
  readonly legFace: { x0: number; x1: number; z0: number; z1: number };
  readonly bodyX0: number;
};

/**
 * The drawer bank, solved as a wardrobe and moved into the frame.
 *
 * The synthetic spec is deliberately spare: one bay of drawers, no doors, no plinth — the
 * frame is the plinth — and a grooved back, which is the cheapest thing that makes a small
 * carcase square enough to hang runners in.
 */
function buildDrawerBank(
  spec: CounterSpec,
  unitId: string,
  ctx: BankContext,
): {
  parts: readonly Part[];
  hardware: readonly HardwareUse[];
  drawers: readonly ResolvedDrawer[];
} | null {
  const bank = spec.drawerBank;
  const height = mm2(ctx.frameTop - ctx.bottomRing);
  const depth = mm2(ctx.legFace.z1 - ctx.legFace.z0);
  const width = mm2(Math.min(bank.width, ctx.legFace.x1 - ctx.legFace.x0));
  if (height < 200 || depth < 250 || width < 200) return null;

  const model = solve(bankSpecOf(spec, { width, height, depth }));

  /* Where the bank stands: along the counter from the left leg face, on the bottom ring,
     with its front flush with the front leg face so the fronts are what is seen. */
  const at: Vec3 = [
    mm2(Math.min(Math.max(ctx.legFace.x0, ctx.bodyX0 + bank.fromLeft), ctx.legFace.x1 - width)),
    ctx.bottomRing,
    ctx.legFace.z0,
  ];

  const parts = model.parts.map((part) =>
    translatePart({ ...part, unitId, id: `${unitId}:${part.id}` }, at),
  );

  return {
    parts,
    hardware: model.hardware,
    drawers: model.drawers.map((drawer) => ({ ...drawer, id: `${unitId}:${drawer.id}` })),
  };
}

/** The wardrobe spec that describes a counter's drawer bank. */
function bankSpecOf(
  spec: CounterSpec,
  size: { readonly width: number; readonly height: number; readonly depth: number },
): WardrobeSpec {
  const base = createDefaultSpec();
  const bank = spec.drawerBank;
  return {
    ...base,
    meta: { ...base.meta, name: "Drawer bank" },
    carcase: {
      ...base.carcase,
      width: size.width,
      height: size.height,
      depth: size.depth,
      panelMaterialId: bank.carcaseMaterialId,
      construction: "top-over-sides",
      snapToSystemGrid: false,
      /* No plinth: the bank sits on the frame's bottom rail, which is its plinth. */
      plinth: { ...base.carcase.plinth, type: "none", height: 0, setback: 0 },
      back: { ...base.carcase.back, type: "groove", materialId: "hdf8" },
      topOverhang: { left: 0, right: 0, front: 0 },
      scribe: { left: 0, right: 0, top: 0 },
      wallAnchor: "none",
      topStretcher: false,
    },
    layout: makeBay(
      {
        kind: "drawers",
        count: Math.max(1, Math.round(bank.count)),
        frontHeights: null,
        hasFronts: true,
        dividers: 0,
      },
      "Drawer bank",
    ),
    doors: { ...base.doors, type: "none", overlayStyle: "full" },
    drawers: {
      ...base.drawers,
      slideId: bank.slideId,
      frontMaterialId: bank.frontMaterialId,
      frontBandingId: spec.top.bandingId,
    },
    handles: { ...base.handles, drawerHandleId: bank.handleId },
  };
}

/* ------------------------------------------------------------------ misc --- */

function shelfHeightsOf(
  spec: CounterSpec,
  footAllowance: number,
  frameTop: number,
): number[] {
  const count = Math.max(0, Math.min(Math.round(spec.shelves.count), 3));
  const heights: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const y = mm2(
      Math.max(spec.shelves.lowest, footAllowance + 50) +
        index * Math.max(spec.shelves.spacing, 150),
    );
    if (y > frameTop - 100) break;
    heights.push(y);
  }
  return heights;
}

/** A one-line description for the unit list and the booklet. */
export function describeCounter(spec: CounterSpec): string {
  const profile = getProfile(spec.frame.profileId);
  const parts = [
    `${spec.width} x ${spec.depth} x ${spec.height} high`,
    `${profile.shortName} frame`,
    spec.top.kind === "inox" ? "folded stainless top" : `${getMaterial(spec.top.materialId).shortName} top`,
  ];
  if (spec.drawerBank.enabled) parts.push(`${spec.drawerBank.count} drawers`);
  if (spec.bar.height > 0) parts.push(`bar shelf at ${spec.bar.height}`);
  return parts.join(" · ");
}
