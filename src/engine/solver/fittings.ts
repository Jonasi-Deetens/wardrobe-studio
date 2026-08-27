import { getRail, getShelfSupport, getSlide, slideLengthForDepth } from "../catalog/hardware";
import { getMaterial } from "../catalog/materials";
import { mm2, snap, snapDown } from "../core/units";
import type { DrawersFitting, HangingFitting, ShelvesFitting, ShoeRackFitting, PulloutFitting } from "../spec/types";
import { addHardware, addPart, type SolverContext } from "./context";
import { makePanel, type PartDraft } from "./draft";
import type { Region } from "./frame";
import type { ResolvedBay } from "./layout";

/**
 * A drawer after its geometry has been worked out. The hardware rules add the
 * runner drilling to the surrounding panels from this, and the viewport uses it to
 * slide the whole box as one.
 */
export type ResolvedDrawer = {
  readonly id: string;
  readonly bayId: string;
  readonly index: number;
  /** The clear opening this drawer occupies. */
  readonly opening: Region;
  readonly frontHeight: number;
  readonly boxHeight: number;
  readonly boxInsideWidth: number;
  readonly boxOutsideWidth: number;
  readonly boxDepth: number;
  readonly slideId: string;
  readonly slideLength: number;
  /** Y of the bottom of the drawer box. */
  readonly boxBottomY: number;
  readonly hasFront: boolean;
  readonly frontPartId: string | null;
};

/** An adjustable shelf, so the shelf-pin rule knows where to put holes. */
export type ResolvedAdjustableShelf = {
  readonly partId: string;
  readonly bayId: string;
  /** Y of the underside of the shelf. */
  readonly y: number;
  readonly region: Region;
};

export type FittingsResult = {
  readonly drawers: readonly ResolvedDrawer[];
  readonly adjustableShelves: readonly ResolvedAdjustableShelf[];
  /** Rails, so the support-hole rule can drill the panels either side. */
  readonly rails: readonly ResolvedRail[];
};

export type ResolvedRail = {
  readonly id: string;
  readonly bayId: string;
  readonly railId: string;
  /** Y of the rail centre line. */
  readonly y: number;
  /** Z of the rail centre line. */
  readonly z: number;
  readonly x0: number;
  readonly x1: number;
  readonly span: number;
  readonly needsCentreSupport: boolean;
  readonly region: Region;
};

export function buildFittings(
  ctx: SolverContext,
  bays: readonly ResolvedBay[],
): FittingsResult {
  const drawers: ResolvedDrawer[] = [];
  const adjustableShelves: ResolvedAdjustableShelf[] = [];
  const rails: ResolvedRail[] = [];

  for (const bay of bays) {
    switch (bay.fitting.kind) {
      case "empty":
        break;
      case "shelves":
        buildShelves(ctx, bay, bay.fitting, adjustableShelves);
        break;
      case "hanging":
        buildHanging(ctx, bay, bay.fitting, adjustableShelves, rails);
        break;
      case "drawers":
        buildDrawers(ctx, bay, bay.fitting, drawers);
        break;
      case "shoe-rack":
        buildShoeRack(ctx, bay, bay.fitting, adjustableShelves);
        break;
      case "pullout-trays":
        buildPullouts(ctx, bay, bay.fitting, drawers);
        break;
    }
  }

  return { drawers, adjustableShelves, rails };
}

/* ---------------------------------------------------------------- shelves - */

function shelfMaterialId(ctx: SolverContext, override: string | null): string {
  return override ?? ctx.spec.carcase.panelMaterialId;
}

/**
 * Creates a shelf inside a bay. The shelf is made a little narrower than the clear
 * opening so it can actually be dropped in, and set back from the front so a door
 * can close on it.
 */
function createShelf(
  ctx: SolverContext,
  bay: ResolvedBay,
  params: {
    readonly id: string;
    readonly label: string;
    readonly y: number;
    readonly materialId: string;
    readonly setback: number;
    readonly adjustable: boolean;
    readonly notes?: readonly string[];
  },
): PartDraft {
  const material = getMaterial(params.materialId);
  const { spec } = ctx;
  // 1mm of side clearance in total: enough to fit, too little to see.
  const clearance = params.adjustable ? 1 : 0;

  const shelf = makePanel({
    id: params.id,
    role: params.adjustable ? "adjustable-shelf" : "fixed-shelf",
    label: params.label,
    materialId: params.materialId,
    thickness: material.thickness,
    orientation: "horizontal-y",
    finishedLength: mm2(bay.clearWidth - clearance),
    finishedWidth: mm2(bay.clearDepth - params.setback),
    origin: [mm2(bay.region.x0 + clearance / 2), params.y, mm2(bay.region.z1 - params.setback)],
    faceADirection: 1,
    grain: material.hasGrain ? "length" : "none",
    banding: {
      w0: spec.production.banding.shelfFront,
      w1: spec.production.banding.shelfOther,
      l0: spec.production.banding.shelfOther,
      l1: spec.production.banding.shelfOther,
    },
    bayId: bay.id,
    ...(params.notes ? { notes: params.notes } : {}),
  });
  return addPart(ctx, shelf);
}

function buildShelves(
  ctx: SolverContext,
  bay: ResolvedBay,
  fitting: ShelvesFitting,
  out: ResolvedAdjustableShelf[],
): void {
  if (fitting.count <= 0) return;
  const materialId = shelfMaterialId(ctx, fitting.materialId);
  const thickness = getMaterial(materialId).thickness;
  const ys = shelfPositions(bay, fitting, thickness);

  ys.forEach((y, index) => {
    const shelf = createShelf(ctx, bay, {
      id: `${bay.id}-shelf-${index + 1}`,
      label: `${bay.label}: shelf ${index + 1}`,
      y,
      materialId,
      setback: fitting.setback,
      adjustable: fitting.adjustable,
    });
    if (fitting.adjustable) {
      out.push({ partId: shelf.id, bayId: bay.id, y, region: bay.region });
    }
  });

  if (fitting.adjustable) {
    const support = getShelfSupport(ctx.spec.joinery.shelfSupportId);
    addHardware(ctx, {
      kind: "shelf-support",
      catalogId: support.id,
      name: support.name,
      quantity: fitting.count * 4,
      unit: "each",
      unitPrice: support.pricePerUnit,
      note: `${bay.label}: four per shelf.`,
    });
  }
}

/**
 * Shelf heights within a bay.
 *
 * In `even` mode the clear gaps are equal. In `pitch` mode each gap is the
 * requested clear height, measured up from the bottom of the bay, and shelves that
 * would not fit are dropped rather than crowded in. Positions are snapped to the
 * 32mm grid when the carcase is on the system grid, so an adjustable shelf lands
 * on a real pair of holes rather than between them.
 */
function shelfPositions(
  bay: ResolvedBay,
  fitting: ShelvesFitting,
  thickness: number,
): number[] {
  const ys: number[] = [];
  const usable = bay.clearHeight - fitting.count * thickness;
  if (usable <= 0) return ys;

  if (fitting.spacingMode === "even") {
    const gap = usable / (fitting.count + 1);
    for (let i = 0; i < fitting.count; i += 1) {
      ys.push(mm2(bay.region.y0 + gap * (i + 1) + thickness * i));
    }
  } else {
    let cursor = bay.region.y0;
    for (let i = 0; i < fitting.count; i += 1) {
      const next = cursor + fitting.pitch;
      if (next + thickness > bay.region.y1) break;
      ys.push(mm2(next));
      cursor = next + thickness;
    }
  }
  return ys;
}

/* ---------------------------------------------------------------- hanging - */

function buildHanging(
  ctx: SolverContext,
  bay: ResolvedBay,
  fitting: HangingFitting,
  shelvesOut: ResolvedAdjustableShelf[],
  railsOut: ResolvedRail[],
): void {
  const rail = getRail(fitting.railId);
  const t = ctx.frame.thickness;
  const setback = 5;

  // The rail hangs under a shelf, which is what carries the load into the sides.
  const upperRailY = mm2(bay.region.y0 + fitting.clearHeight);
  const railZ = mm2(bay.region.z0 + fitting.railFromBack);

  let shelfAboveId: string | null = null;
  if (fitting.shelfAbove && upperRailY + rail.dropBelowShelf + t <= bay.region.y1) {
    const shelfY = mm2(upperRailY + rail.dropBelowShelf);
    const shelf = createShelf(ctx, bay, {
      id: `${bay.id}-rail-shelf`,
      label: `${bay.label}: shelf over rail`,
      y: shelfY,
      materialId: ctx.spec.carcase.panelMaterialId,
      setback,
      adjustable: false,
      notes: ["Carries the hanging rail; fix it rather than leaving it on pins."],
    });
    shelfAboveId = shelf.id;

    // Extra shelves stacked above the rail shelf, evenly spaced in what is left.
    const remaining = bay.region.y1 - (shelfY + t);
    if (fitting.shelvesAbove > 0 && remaining > 100) {
      const gap = (remaining - fitting.shelvesAbove * t) / (fitting.shelvesAbove + 1);
      for (let i = 0; i < fitting.shelvesAbove; i += 1) {
        const y = mm2(shelfY + t + gap * (i + 1) + t * i);
        const extra = createShelf(ctx, bay, {
          id: `${bay.id}-above-shelf-${i + 1}`,
          label: `${bay.label}: shelf above rail ${i + 1}`,
          y,
          materialId: ctx.spec.carcase.panelMaterialId,
          setback,
          adjustable: true,
        });
        shelvesOut.push({ partId: extra.id, bayId: bay.id, y, region: bay.region });
      }
      const support = getShelfSupport(ctx.spec.joinery.shelfSupportId);
      addHardware(ctx, {
        kind: "shelf-support",
        catalogId: support.id,
        name: support.name,
        quantity: fitting.shelvesAbove * 4,
        unit: "each",
        unitPrice: support.pricePerUnit,
        note: `${bay.label}: shelves above the rail.`,
      });
    }
  }

  const addRail = (id: string, y: number, note: string): void => {
    const span = bay.clearWidth;
    const needsCentreSupport = span > rail.maxSpan;
    railsOut.push({
      id,
      bayId: bay.id,
      railId: rail.id,
      y,
      z: railZ,
      x0: bay.region.x0,
      x1: bay.region.x1,
      span: mm2(span),
      needsCentreSupport,
      region: bay.region,
    });
    addHardware(ctx, {
      kind: "rail",
      catalogId: rail.id,
      name: rail.name,
      quantity: mm2(span) / 1000,
      unit: "metre",
      unitPrice: rail.pricePerMetre,
      note: `${bay.label}: ${note}, cut to ${mm2(span)}mm.`,
    });
    addHardware(ctx, {
      kind: "rail-support",
      catalogId: rail.id,
      name: `End support for ${rail.name}`,
      quantity: 2,
      unit: "each",
      unitPrice: rail.pricePerSupport,
      note: `${bay.label}: ${note}.`,
    });
    if (needsCentreSupport) {
      addHardware(ctx, {
        kind: "rail-centre-support",
        catalogId: rail.id,
        name: `Centre support for ${rail.name}`,
        quantity: 1,
        unit: "each",
        unitPrice: rail.pricePerSupport,
        note: `${bay.label}: the ${mm2(span)}mm span exceeds the ${rail.maxSpan}mm limit for this rail.`,
      });
    }
  };

  addRail(`${bay.id}-rail-upper`, upperRailY, fitting.doubleHang ? "upper rail" : "rail");

  if (fitting.doubleHang) {
    const lowerRailY = mm2(bay.region.y0 + fitting.lowerClearHeight);
    if (lowerRailY < upperRailY - 100) {
      addRail(`${bay.id}-rail-lower`, lowerRailY, "lower rail");
    }
  }

  if (shelfAboveId === null && fitting.shelfAbove) {
    // The bay is too short for the shelf the user asked for; the advisor reports it.
  }
}

/* ---------------------------------------------------------------- drawers - */

/**
 * Drawer front heights.
 *
 * When not given explicitly, the stack is divided into equal fronts whose heights
 * are multiples of 32mm minus the face gap, which is what makes a run of drawers
 * line up with the system holes. Any millimetres left over are added to the bottom
 * front, where a small difference is least visible.
 */
export function drawerFrontHeights(
  fitting: DrawersFitting,
  openingHeight: number,
  gap: number,
): number[] {
  if (fitting.count <= 0) return [];
  if (fitting.frontHeights && fitting.frontHeights.length === fitting.count) {
    return fitting.frontHeights.map((h) => mm2(h));
  }

  const totalGap = gap * (fitting.count - 1);
  const available = openingHeight - totalGap;
  const nominal = available / fitting.count;
  const unit = snapDown(nominal + gap, 32);
  const height = Math.max(32, unit - gap);

  const heights = Array.from({ length: fitting.count }, () => mm2(height));
  const used = height * fitting.count + totalGap;
  const leftover = mm2(openingHeight - used);
  if (leftover > 0.5 && heights.length > 0) {
    heights[0] = mm2((heights[0] as number) + leftover);
  }
  return heights;
}

function buildDrawers(
  ctx: SolverContext,
  bay: ResolvedBay,
  fitting: DrawersFitting,
  out: ResolvedDrawer[],
): void {
  if (fitting.count <= 0) return;

  const { spec, frame } = ctx;
  const slide = getSlide(spec.drawers.slideId);
  const boxMaterial = getMaterial(spec.drawers.boxMaterialId);
  const bottomMaterial = getMaterial(spec.drawers.bottomMaterialId);
  const frontMaterial = getMaterial(spec.drawers.frontMaterialId);
  const gap = spec.doors.gap;

  const heights = drawerFrontHeights(fitting, bay.clearHeight, gap);
  const slideLength = slideLengthForDepth(slide, bay.clearDepth);

  // The runner takes a fixed amount out of the opening; what is left, less the two
  // box sides, is the inside width.
  const boxOutsideWidth = mm2(bay.clearWidth - slide.widthClearance);
  const boxInsideWidth = mm2(boxOutsideWidth - 2 * boxMaterial.thickness);

  let cursorY = bay.region.y0;

  heights.forEach((frontHeight, index) => {
    const drawerId = `${bay.id}-drawer-${index + 1}`;
    const openingHeight = frontHeight;
    const opening: Region = {
      ...bay.region,
      y0: mm2(cursorY),
      y1: mm2(cursorY + openingHeight),
    };

    // The box has to clear the runner below and leave room to lift out above.
    const maxBoxHeight = mm2(openingHeight - slide.bottomClearance - slide.topClearance);
    const boxHeight = Math.max(60, Math.min(spec.drawers.boxHeight, maxBoxHeight));
    const boxBottomY = mm2(opening.y0 + slide.bottomClearance);
    const boxFrontZ = mm2(bay.region.z1 - slide.frontSetback);
    const boxRearZ = mm2(boxFrontZ - slideLength);
    const boxLeftX = mm2(bay.region.x0 + slide.widthClearance / 2);

    /* box sides */
    for (const side of ["left", "right"] as const) {
      const isLeft = side === "left";
      const x = isLeft ? boxLeftX : mm2(boxLeftX + boxOutsideWidth);
      addPart(
        ctx,
        makePanel({
          id: `${drawerId}-side-${side}`,
          role: "drawer-side",
          label: `${bay.label}: drawer ${index + 1} side, ${side}`,
          materialId: spec.drawers.boxMaterialId,
          thickness: boxMaterial.thickness,
          orientation: "drawer-side",
          finishedLength: slideLength,
          finishedWidth: boxHeight,
          origin: [x, boxBottomY, boxFrontZ],
          faceADirection: isLeft ? 1 : -1,
          grain: boxMaterial.hasGrain ? "length" : "none",
          banding: {},
          bayId: bay.id,
        }),
      );
    }

    /* box front and back */
    for (const end of ["front", "back"] as const) {
      const isFront = end === "front";
      const z = isFront
        ? mm2(boxFrontZ - boxMaterial.thickness)
        : mm2(boxRearZ + boxMaterial.thickness);
      addPart(
        ctx,
        makePanel({
          id: `${drawerId}-box-${end}`,
          role: "drawer-back",
          label: `${bay.label}: drawer ${index + 1} box ${end}`,
          materialId: spec.drawers.boxMaterialId,
          thickness: boxMaterial.thickness,
          orientation: "panel-z-wide",
          finishedLength: boxInsideWidth,
          finishedWidth: boxHeight,
          origin: [mm2(boxLeftX + boxMaterial.thickness), boxBottomY, z],
          faceADirection: isFront ? -1 : 1,
          grain: boxMaterial.hasGrain ? "length" : "none",
          banding: {},
          bayId: bay.id,
        }),
      );
    }

    /* box bottom, housed in a groove all round */
    const grooveDepth = spec.drawers.bottomGrooveDepth;
    const bottomY = mm2(boxBottomY + spec.drawers.bottomGrooveOffset);
    addPart(
      ctx,
      makePanel({
        id: `${drawerId}-bottom`,
        role: "drawer-bottom",
        label: `${bay.label}: drawer ${index + 1} bottom`,
        materialId: spec.drawers.bottomMaterialId,
        thickness: bottomMaterial.thickness,
        orientation: "drawer-bottom",
        finishedLength: mm2(boxInsideWidth + 2 * grooveDepth),
        finishedWidth: mm2(slideLength - 2 * boxMaterial.thickness + 2 * grooveDepth),
        origin: [
          mm2(boxLeftX + boxMaterial.thickness - grooveDepth),
          bottomY,
          mm2(boxFrontZ - boxMaterial.thickness + grooveDepth),
        ],
        faceADirection: 1,
        grain: bottomMaterial.hasGrain ? "length" : "none",
        banding: {},
        bayId: bay.id,
      }),
    );

    /* internal dividers */
    if (fitting.dividers > 0) {
      const usable = slideLength - 2 * boxMaterial.thickness;
      const step = usable / (fitting.dividers + 1);
      for (let d = 0; d < fitting.dividers; d += 1) {
        const z = mm2(boxFrontZ - boxMaterial.thickness - step * (d + 1));
        addPart(
          ctx,
          makePanel({
            id: `${drawerId}-divider-${d + 1}`,
            role: "drawer-back",
            label: `${bay.label}: drawer ${index + 1} divider ${d + 1}`,
            materialId: spec.drawers.boxMaterialId,
            thickness: boxMaterial.thickness,
            orientation: "panel-z-wide",
            finishedLength: boxInsideWidth,
            finishedWidth: mm2(boxHeight - spec.drawers.bottomGrooveOffset),
            origin: [
              mm2(boxLeftX + boxMaterial.thickness),
              mm2(bottomY + bottomMaterial.thickness),
              z,
            ],
            faceADirection: 1,
            grain: boxMaterial.hasGrain ? "length" : "none",
            banding: {},
            bayId: bay.id,
          }),
        );
      }
    }

    /* front */
    let frontPartId: string | null = null;
    if (fitting.hasFronts) {
      const frontWidth = mm2(bay.clearWidth + frontOverlayAllowance(ctx, bay));
      const frontX = mm2(bay.region.x0 - frontOverlayAllowance(ctx, bay) / 2);
      const front = makePanel({
        id: `${drawerId}-front`,
        role: "drawer-front",
        label: `${bay.label}: drawer front ${index + 1}`,
        materialId: spec.drawers.frontMaterialId,
        thickness: frontMaterial.thickness,
        orientation: "panel-z-wide",
        finishedLength: frontWidth,
        finishedWidth: mm2(frontHeight - gap),
        origin: [frontX, mm2(opening.y0 + gap / 2), frame.frontZ],
        // Face A is the back of the front, which is where the fixings go.
        faceADirection: -1,
        grain: frontMaterial.hasGrain ? "width" : "none",
        banding: {
          l0: spec.drawers.frontBandingId,
          l1: spec.drawers.frontBandingId,
          w0: spec.drawers.frontBandingId,
          w1: spec.drawers.frontBandingId,
        },
        bayId: bay.id,
      });
      front.drawerId = drawerId;
      addPart(ctx, front);
      frontPartId = front.id;
    }

    out.push({
      id: drawerId,
      bayId: bay.id,
      index,
      opening,
      frontHeight,
      boxHeight,
      boxInsideWidth,
      boxOutsideWidth,
      boxDepth: slideLength,
      slideId: slide.id,
      slideLength,
      boxBottomY,
      hasFront: fitting.hasFronts,
      frontPartId,
    });

    addHardware(ctx, {
      kind: "slide",
      catalogId: slide.id,
      name: `${slide.name}, ${slideLength}mm`,
      quantity: 1,
      unit: "pair",
      unitPrice: slide.pricePerPair,
      note: `${bay.label}: drawer ${index + 1}.`,
    });

    cursorY = mm2(opening.y1 + gap);
  });
}

/**
 * Extra width a front needs beyond the clear opening so it covers the panels each
 * side. Inset fronts sit inside the opening instead, so they get a negative
 * allowance.
 */
function frontOverlayAllowance(ctx: SolverContext, bay: ResolvedBay): number {
  const t = ctx.frame.thickness;
  const gap = ctx.spec.doors.gap;
  switch (ctx.spec.doors.overlayStyle) {
    case "full":
      return mm2(2 * t - gap);
    case "half":
      return mm2(t - gap);
    case "inset":
      return mm2(-2 * gap);
  }
  void bay;
  return 0;
}

/* -------------------------------------------------------------- shoe rack - */

function buildShoeRack(
  ctx: SolverContext,
  bay: ResolvedBay,
  fitting: ShoeRackFitting,
  out: ResolvedAdjustableShelf[],
): void {
  const materialId = ctx.spec.carcase.panelMaterialId;
  const thickness = getMaterial(materialId).thickness;
  const usable = bay.clearHeight - fitting.tiers * thickness;
  if (usable <= 0) return;

  const pitch = Math.min(
    fitting.tierPitch,
    (bay.clearHeight - thickness) / Math.max(1, fitting.tiers),
  );

  for (let i = 0; i < fitting.tiers; i += 1) {
    const y = mm2(bay.region.y0 + pitch * (i + 1));
    if (y + thickness > bay.region.y1) break;
    // A tilted rack keeps shoes from sliding off and shows the toes; the tilt is
    // achieved with a deeper rear pin hole, so the shelf itself is a plain panel.
    const shelf = makePanel({
      id: `${bay.id}-shoe-${i + 1}`,
      role: "shoe-shelf",
      label: `${bay.label}: shoe shelf ${i + 1}`,
      materialId,
      thickness,
      orientation: "horizontal-y",
      finishedLength: mm2(bay.clearWidth - 1),
      finishedWidth: mm2(Math.min(bay.clearDepth - 5, 350)),
      origin: [mm2(bay.region.x0 + 0.5), y, mm2(bay.region.z1 - 5)],
      faceADirection: 1,
      grain: getMaterial(materialId).hasGrain ? "length" : "none",
      banding: {
        w0: ctx.spec.production.banding.shelfFront,
        w1: ctx.spec.production.banding.shelfOther,
      },
      bayId: bay.id,
      notes:
        fitting.tilt > 0
          ? [`Tilted ${fitting.tilt} degrees: set the rear pins ${mm2(Math.tan((fitting.tilt * Math.PI) / 180) * Math.min(bay.clearDepth - 5, 350))}mm higher than the front pins.`]
          : [],
    });
    addPart(ctx, shelf);
    out.push({ partId: shelf.id, bayId: bay.id, y, region: bay.region });
  }

  const support = getShelfSupport(ctx.spec.joinery.shelfSupportId);
  addHardware(ctx, {
    kind: "shelf-support",
    catalogId: support.id,
    name: support.name,
    quantity: fitting.tiers * 4,
    unit: "each",
    unitPrice: support.pricePerUnit,
    note: `${bay.label}: shoe rack.`,
  });
}

/* ---------------------------------------------------------- pull-out trays - */

function buildPullouts(
  ctx: SolverContext,
  bay: ResolvedBay,
  fitting: PulloutFitting,
  out: ResolvedDrawer[],
): void {
  // A pull-out tray is a drawer without a front, so it reuses the drawer builder
  // rather than duplicating the runner arithmetic.
  const asDrawers: DrawersFitting = {
    kind: "drawers",
    count: fitting.count,
    frontHeights: Array.from({ length: fitting.count }, () =>
      mm2(snap(bay.clearHeight / fitting.count, 32)),
    ),
    dividers: 0,
    hasFronts: false,
  };
  buildDrawers(ctx, { ...bay, fitting: asDrawers }, asDrawers, out);
}
