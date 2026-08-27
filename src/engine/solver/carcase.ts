import { getMaterial } from "../catalog/materials";
import type { Vec3 } from "../core/geometry";
import type { GrainDirection, PanelFace } from "../core/part";
import { mm2 } from "../core/units";
import { addPart, requirePart, type SolverContext } from "./context";
import type { Frame, Region } from "./frame";
import type { BandingChoice, HardwareUse, Joint, PartDraft } from "./draft";
import { makeJoint, makePanel } from "./draft";

/**
 * The panel a region is bounded by on one side, and which of its faces looks into
 * the region. Dividers and shelves are joined to these, which is how a shelf
 * inside a nested bay ends up fixed to the divider next to it rather than to the
 * carcase side.
 */
export type Boundary = {
  readonly partId: string;
  readonly faceTowardRegion: PanelFace;
} | null;

export type RegionBounds = {
  readonly left: Boundary;
  readonly right: Boundary;
  readonly below: Boundary;
  readonly above: Boundary;
};

export type CarcaseResult = {
  readonly parts: readonly PartDraft[];
  readonly joints: readonly Joint[];
  readonly hardware: readonly HardwareUse[];
  readonly interiorBounds: RegionBounds;
  readonly leftSideId: string;
  readonly rightSideId: string;
  readonly topId: string;
  readonly bottomId: string;
  readonly backId: string | null;
  readonly ignoredOverhang: boolean;
};

function grainOf(materialId: string): GrainDirection {
  return getMaterial(materialId).hasGrain ? "length" : "none";
}

/**
 * Builds the box: sides, top, bottom, back, plinth and the optional top stretcher,
 * plus the joints between them.
 */
export function buildCarcase(frame: Frame): CarcaseResult {
  const { spec } = frame;
  const t = frame.thickness;
  const materialId = spec.carcase.panelMaterialId;
  const grain = grainOf(materialId);
  const construction = spec.carcase.construction;
  const visible = spec.production.banding.carcaseVisibleEdges;
  const hidden = spec.production.banding.carcaseHiddenEdges;

  const parts: PartDraft[] = [];
  const joints: Joint[] = [];
  const hardware: HardwareUse[] = [];

  const horizontalsRunThrough = construction === "horizontals-through";
  const topRunsOverSides = construction === "top-over-sides";

  /* ------------------------------------------------------------- side panels */

  // With through horizontals the sides are captured between the top and bottom,
  // so they are shorter by one panel thickness at each end.
  const sideBottom = horizontalsRunThrough
    ? mm2(frame.bottomPanelY + t)
    : frame.sideBottomY;
  const sideTop = horizontalsRunThrough ? frame.topPanelY : frame.sideTopY;

  const sideBanding: BandingChoice = {
    // The front edge always shows.
    w0: visible,
    w1: hidden,
    // The top edge only shows when the side runs to the top of the carcase.
    l1: construction === "sides-through" ? visible : hidden,
    l0: spec.carcase.plinth.type === "none" ? visible : hidden,
  };

  const leftSide = makePanel({
    id: "side-left",
    role: "side",
    label: "Side, left",
    materialId,
    thickness: t,
    orientation: "vertical-x",
    finishedLength: mm2(sideTop - sideBottom),
    finishedWidth: frame.built.depth,
    origin: [frame.leftSideX, sideBottom, frame.frontZ],
    faceADirection: 1,
    grain,
    banding: sideBanding,
  });

  const rightSide = makePanel({
    id: "side-right",
    role: "side",
    label: "Side, right",
    materialId,
    thickness: t,
    orientation: "vertical-x",
    finishedLength: mm2(sideTop - sideBottom),
    finishedWidth: frame.built.depth,
    origin: [frame.rightSideX, sideBottom, frame.frontZ],
    faceADirection: -1,
    grain,
    banding: sideBanding,
  });

  parts.push(leftSide, rightSide);

  /* ------------------------------------------------- top and bottom panels - */

  const overhang = spec.carcase.topOverhang;
  const wantsOverhang = overhang.left > 0 || overhang.right > 0 || overhang.front > 0;
  // A top captured between the sides physically cannot overhang them.
  const overhangApplies = topRunsOverSides || horizontalsRunThrough;
  const ignoredOverhang = wantsOverhang && !overhangApplies;

  const horizontalSpansFullWidth = topRunsOverSides || horizontalsRunThrough;
  const topLeftX = horizontalSpansFullWidth
    ? mm2(frame.leftSideX - (overhangApplies ? overhang.left : 0))
    : mm2(frame.leftSideX + t);
  const topRightX = horizontalSpansFullWidth
    ? mm2(frame.rightSideX + (overhangApplies ? overhang.right : 0))
    : mm2(frame.rightSideX - t);
  const topFrontZ = mm2(frame.frontZ + (overhangApplies ? overhang.front : 0));

  const topPanel = makePanel({
    id: "panel-top",
    role: "top",
    label: "Top",
    materialId,
    thickness: t,
    orientation: "horizontal-y",
    finishedLength: mm2(topRightX - topLeftX),
    finishedWidth: mm2(topFrontZ - frame.rearZ),
    origin: [topLeftX, frame.built.height, topFrontZ],
    // Face A is the underside, which is the face that looks into the carcase.
    faceADirection: -1,
    grain,
    banding: {
      w0: visible,
      w1: hidden,
      l0: horizontalSpansFullWidth ? visible : hidden,
      l1: horizontalSpansFullWidth ? visible : hidden,
    },
  });

  const bottomLeftX = horizontalsRunThrough ? frame.leftSideX : mm2(frame.leftSideX + t);
  const bottomRightX = horizontalsRunThrough
    ? frame.rightSideX
    : mm2(frame.rightSideX - t);

  const bottomPanel = makePanel({
    id: "panel-bottom",
    role: "bottom",
    label: "Bottom",
    materialId,
    thickness: t,
    orientation: "horizontal-y",
    finishedLength: mm2(bottomRightX - bottomLeftX),
    finishedWidth: frame.built.depth,
    origin: [bottomLeftX, frame.bottomPanelY, frame.frontZ],
    // Face A is the upper surface, which the fittings sit on.
    faceADirection: 1,
    grain,
    banding: {
      w0: visible,
      w1: hidden,
      l0: horizontalsRunThrough ? visible : hidden,
      l1: horizontalsRunThrough ? visible : hidden,
    },
  });

  parts.push(topPanel, bottomPanel);

  /* -------------------------------------------------------- carcase joints - */

  const rearJointZ = frame.backFrontZ;
  const jointInsetFromFront = 0;

  const addHorizontalToSideJoints = (
    panel: PartDraft,
    y: number,
    label: string,
  ): void => {
    const from: Vec3 = [0, y, mm2(frame.frontZ - jointInsetFromFront)];
    const to: Vec3 = [0, y, rearJointZ];
    joints.push(
      makeJoint({
        id: `${panel.id}-to-side-left`,
        through: leftSide,
        throughFace: "A",
        abutting: panel,
        abuttingEdge: "l0",
        from: [frame.leftSideX + t, from[1], from[2]],
        to: [frame.leftSideX + t, to[1], to[2]],
        structural: true,
        label: `${label} into left side`,
      }),
      makeJoint({
        id: `${panel.id}-to-side-right`,
        through: rightSide,
        throughFace: "A",
        abutting: panel,
        abuttingEdge: "l1",
        from: [frame.rightSideX - t, from[1], from[2]],
        to: [frame.rightSideX - t, to[1], to[2]],
        structural: true,
        label: `${label} into right side`,
      }),
    );
  };

  const addSideToHorizontalJoints = (
    panel: PartDraft,
    face: PanelFace,
    sideEdge: "l0" | "l1",
    label: string,
  ): void => {
    const y = sideEdge === "l1" ? sideTop : sideBottom;
    joints.push(
      makeJoint({
        id: `side-left-to-${panel.id}`,
        through: panel,
        throughFace: face,
        abutting: leftSide,
        abuttingEdge: sideEdge,
        from: [mm2(frame.leftSideX + t / 2), y, mm2(frame.frontZ - jointInsetFromFront)],
        to: [mm2(frame.leftSideX + t / 2), y, rearJointZ],
        structural: true,
        label: `Left side into ${label}`,
      }),
      makeJoint({
        id: `side-right-to-${panel.id}`,
        through: panel,
        throughFace: face,
        abutting: rightSide,
        abuttingEdge: sideEdge,
        from: [mm2(frame.rightSideX - t / 2), y, mm2(frame.frontZ - jointInsetFromFront)],
        to: [mm2(frame.rightSideX - t / 2), y, rearJointZ],
        structural: true,
        label: `Right side into ${label}`,
      }),
    );
  };

  if (horizontalsRunThrough) {
    addSideToHorizontalJoints(topPanel, "A", "l1", "top");
    addSideToHorizontalJoints(bottomPanel, "A", "l0", "bottom");
  } else {
    if (topRunsOverSides) {
      addSideToHorizontalJoints(topPanel, "A", "l1", "top");
    } else {
      addHorizontalToSideJoints(topPanel, mm2(frame.topPanelY + t / 2), "Top");
    }
    addHorizontalToSideJoints(bottomPanel, mm2(frame.bottomPanelY + t / 2), "Bottom");
  }

  /* ------------------------------------------------------------ back panel - */

  let backId: string | null = null;
  if (spec.carcase.back.type !== "none") {
    const backMaterialId = spec.carcase.back.materialId;
    const bt = frame.backThickness;
    const hd = spec.carcase.back.housingDepth;

    let x0: number;
    let x1: number;
    let y0: number;
    let y1: number;
    let z0: number;

    if (spec.carcase.back.type === "groove") {
      // The panel reaches into the groove on all four sides, which is what keeps
      // the carcase square and roughly doubles what the box will carry.
      x0 = mm2(frame.leftSideX + t - hd);
      x1 = mm2(frame.rightSideX - t + hd);
      y0 = mm2(frame.bottomPanelY + t - hd);
      y1 = mm2(frame.topPanelY + hd);
      z0 = spec.carcase.back.inset;
    } else if (spec.carcase.back.type === "rabbet") {
      x0 = frame.leftSideX;
      x1 = frame.rightSideX;
      y0 = frame.bottomPanelY;
      y1 = frame.built.height;
      z0 = 0;
    } else {
      x0 = frame.leftSideX;
      x1 = frame.rightSideX;
      y0 = frame.bottomPanelY;
      y1 = frame.built.height;
      z0 = mm2(-bt);
    }

    const back = makePanel({
      id: "panel-back",
      role: "back",
      label: "Back",
      materialId: backMaterialId,
      thickness: bt,
      orientation: "panel-z-wide",
      finishedLength: mm2(x1 - x0),
      finishedWidth: mm2(y1 - y0),
      origin: [x0, y0, z0],
      // Face A looks into the carcase.
      faceADirection: 1,
      grain: grainOf(backMaterialId),
      banding: {},
      notes:
        spec.carcase.back.type === "groove"
          ? [
              `Sits in a ${mm2(bt + 0.5)}mm groove ${hd}mm deep, ${spec.carcase.back.inset}mm from the rear plane.`,
            ]
          : spec.carcase.back.type === "rabbet"
            ? ["Sits in a rabbet in the rear edges of the sides, top and bottom."]
            : ["Pinned to the rear face of the carcase."],
    });
    parts.push(back);
    backId = back.id;
  }

  /* ---------------------------------------------------------------- plinth - */

  const plinth = spec.carcase.plinth;
  if (plinth.type === "recessed-rail" || plinth.type === "integrated-sides") {
    const railHeight = plinth.height;
    const railBottomY = 0;
    const isIntegrated = plinth.type === "integrated-sides";
    // With integrated sides the plinth is only a front rail between the sides;
    // with a separate plinth the carcase sits on a front and rear rail.
    const railX0 = isIntegrated ? mm2(frame.leftSideX + t) : frame.leftSideX;
    const railX1 = isIntegrated ? mm2(frame.rightSideX - t) : frame.rightSideX;

    const frontRail = makePanel({
      id: "plinth-front",
      role: "plinth-rail",
      label: "Plinth rail, front",
      materialId,
      thickness: t,
      orientation: "panel-z-wide",
      finishedLength: mm2(railX1 - railX0),
      finishedWidth: railHeight,
      origin: [railX0, railBottomY, mm2(frame.frontZ - plinth.setback)],
      faceADirection: -1,
      grain,
      banding: { w1: visible, w0: hidden },
    });
    parts.push(frontRail);

    if (!isIntegrated) {
      const rearRail = makePanel({
        id: "plinth-rear",
        role: "plinth-rail",
        label: "Plinth rail, rear",
        materialId,
        thickness: t,
        orientation: "panel-z-wide",
        finishedLength: mm2(railX1 - railX0),
        finishedWidth: railHeight,
        origin: [railX0, railBottomY, mm2(frame.rearZ + t)],
        faceADirection: -1,
        grain,
        banding: {},
      });
      parts.push(rearRail);

      // Cross pieces stop the rails rolling over and carry the bottom panel. They
      // are small side panels: faces normal to X, length running up, width running
      // from the back of the front rail to the front of the rear rail.
      const crossFrontZ = mm2(frame.frontZ - plinth.setback - t);
      const crossRearZ = mm2(frame.rearZ + t);
      const crossSpan = mm2(crossFrontZ - crossRearZ);
      const crossCount = Math.max(2, Math.ceil((railX1 - railX0) / 900) + 1);
      for (let i = 0; i < crossCount; i += 1) {
        const centre = railX0 + ((railX1 - railX0 - t) * i) / (crossCount - 1) + t / 2;
        parts.push(
          makePanel({
            id: `plinth-cross-${i + 1}`,
            role: "plinth-rail",
            label: `Plinth cross piece ${i + 1}`,
            materialId,
            thickness: t,
            orientation: "vertical-x",
            finishedLength: railHeight,
            finishedWidth: crossSpan,
            origin: [mm2(centre - t / 2), railBottomY, crossFrontZ],
            faceADirection: 1,
            grain,
            banding: {},
          }),
        );
      }
    }
  }

  /* Levelling legs are billed by applyLevellingLegs, from the plates it actually
     drills into the underside of the bottom panel. */

  /* The rear top stretcher is built by buildTopStretcher, once the layout is known:
     it has to be fitted in lengths between whatever partitions reach the top. */

  const interiorBounds: RegionBounds = {
    left: { partId: leftSide.id, faceTowardRegion: "A" },
    right: { partId: rightSide.id, faceTowardRegion: "A" },
    below: { partId: bottomPanel.id, faceTowardRegion: "A" },
    above: { partId: topPanel.id, faceTowardRegion: "A" },
  };

  return {
    parts,
    joints,
    hardware,
    interiorBounds,
    leftSideId: leftSide.id,
    rightSideId: rightSide.id,
    topId: topPanel.id,
    bottomId: bottomPanel.id,
    backId,
    ignoredOverhang,
  };
}

/** The interior region, restated here so callers do not have to reach into the frame. */
export function interiorRegion(frame: Frame): Region {
  return frame.interior;
}

/**
 * The rear top stretcher.
 *
 * It is fitted in lengths between the verticals that reach the top of the carcase,
 * which is how a rail is fitted in a run of cabinets and is the reason it has to be
 * built after the layout rather than with the rest of the box. A single full-width
 * board would have to pass straight through every partition; notching each partition
 * around it is the other way a shop does this, but it costs a machining operation per
 * partition and buys nothing here, because each length is jointed at both ends and so
 * braces the carcase against racking just as well.
 */
export function buildTopStretcher(
  ctx: SolverContext,
  sides: { readonly leftId: string; readonly rightId: string },
): void {
  const { frame, spec } = ctx;
  const band = frame.stretcher;
  if (band === null) return;

  const t = frame.thickness;
  const materialId = spec.carcase.panelMaterialId;

  /* Partitions that stop below the band are no obstacle, so they do not break the
     stretcher into another length. */
  const crossing = ctx.parts
    .filter((part) => part.role === "divider")
    .filter((part) => part.placement.origin[1] + part.length > band.bottomY + 0.01)
    .map((part) => ({ id: part.id, x0: part.placement.origin[0] }))
    .sort((a, b) => a.x0 - b.x0);

  type End = { readonly partId: string; readonly x: number; readonly face: PanelFace };
  const lefts: End[] = [
    { partId: sides.leftId, x: frame.interior.x0, face: "A" },
    ...crossing.map((d) => ({ partId: d.id, x: mm2(d.x0 + t), face: "A" as const })),
  ];
  const rights: End[] = [
    ...crossing.map((d) => ({ partId: d.id, x: d.x0, face: "B" as const })),
    { partId: sides.rightId, x: frame.interior.x1, face: "A" },
  ];

  lefts.forEach((left, index) => {
    const right = rights[index] as End;
    const span = mm2(right.x - left.x);
    if (span <= 0) return;

    const stretcher = makePanel({
      id: `stretcher-top-${index + 1}`,
      role: "stretcher",
      label: lefts.length > 1 ? `Top stretcher, rear ${index + 1}` : "Top stretcher, rear",
      materialId,
      thickness: t,
      orientation: "panel-z-wide",
      finishedLength: span,
      finishedWidth: band.height,
      origin: [left.x, band.bottomY, frame.backFrontZ],
      faceADirection: 1,
      grain: grainOf(materialId),
      banding: {},
      notes: ["Resists racking and gives the wall fixings something solid to pull against."],
    });
    addPart(ctx, stretcher);

    const midZ = mm2(frame.backFrontZ + t / 2);
    const addEndJoint = (end: End, edge: "l0" | "l1"): void => {
      const panel = requirePart(ctx, end.partId);
      ctx.joints.push(
        makeJoint({
          id: `${stretcher.id}-to-${panel.id}`,
          through: panel,
          throughFace: end.face,
          abutting: stretcher,
          abuttingEdge: edge,
          from: [end.x, band.bottomY, midZ],
          to: [end.x, frame.topPanelY, midZ],
          structural: true,
          label: `${stretcher.label} into ${panel.label}`,
        }),
      );
    };

    addEndJoint(left, "l0");
    addEndJoint(right, "l1");
  });
}
