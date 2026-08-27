import { getSlide } from "../catalog/hardware";
import { mm2 } from "../core/units";
import { addHardware, type SolverContext } from "../solver/context";
import { fromFinishedEdge, localOf, type PartDraft } from "../solver/draft";
import type { ResolvedDrawer } from "../solver/fittings";
import type { ResolvedBay } from "../solver/layout";

/**
 * Drawer runner drilling.
 *
 * An undermount runner needs, per drawer:
 *
 * - a row of Ø5mm fixings in the carcase panel each side, on the front system row
 *   37mm from the front edge, with the first hole 37mm above the bottom of the
 *   opening and the rest at multiples of 32mm behind it;
 * - a Ø6mm hole in the drawer bottom for the locking device, 11mm from the front;
 * - a notch in the back of the drawer bottom for the rear hook.
 *
 * The runner also fixes the box width: the inside width is the opening less the
 * runner clearance (49mm for a pair of undermounts with 19mm sides) and less the two
 * box sides. That relation is applied in the solver, where the box is built; this
 * module only drills.
 */
export function applyDrawerHardware(
  ctx: SolverContext,
  drawers: readonly ResolvedDrawer[],
  bays: readonly ResolvedBay[],
): void {
  for (const drawer of drawers) {
    const bay = bays.find((b) => b.id === drawer.bayId);
    if (!bay) continue;
    const slide = getSlide(drawer.slideId);

    for (const [side, boundary] of [
      ["left", bay.bounds.left],
      ["right", bay.bounds.right],
    ] as const) {
      if (!boundary) continue;
      const panel = ctx.partsById.get(boundary.partId);
      if (!panel) continue;
      drillRunnerFixings(ctx, panel, boundary.faceTowardRegion, drawer, slide, side);
    }

    drillBottom(ctx, drawer, slide);
    if (drawer.hasFront && drawer.frontPartId) {
      drillFrontFixings(ctx, drawer);
    }
  }
}

function drillRunnerFixings(
  ctx: SolverContext,
  panel: PartDraft,
  face: "A" | "B",
  drawer: ResolvedDrawer,
  slide: ReturnType<typeof getSlide>,
  side: "left" | "right",
): void {
  const frontOffset = ctx.spec.joinery.systemHoles.frontOffset;
  // The runner sits at a fixed height above the bottom of its own opening.
  const worldY = mm2(drawer.opening.y0 + slide.firstFixingHeight);
  const l = localOf(panel, [
    panel.placement.origin[0],
    worldY,
    panel.placement.origin[2],
  ]).l;
  if (l < 0 || l > panel.length) return;

  // Fixings run back from the front row at multiples of the runner hole spacing,
  // as far as the runner is long.
  const count = Math.max(2, Math.floor(drawer.slideLength / slide.fixingSpacing / 2));
  for (let i = 0; i < count; i += 1) {
    const w = fromFinishedEdge(
      panel,
      "w0",
      mm2(frontOffset + i * slide.fixingSpacing * 2),
    );
    if (w < 0 || w > panel.width) continue;
    panel.ops.push({
      kind: "hole",
      id: `${drawer.id}-runner-${side}-${i + 1}`,
      face,
      l: mm2(l),
      w: mm2(w),
      diameter: slide.fixingHoleDiameter,
      depth: slide.fixingHoleDepth,
      through: false,
      purpose: "slide-fixing",
      note: `${drawer.id} runner, ${side} side`,
    });
  }

  panel.notes.push(
    `${drawer.id}: runner fixings ${slide.firstFixingHeight}mm above the bottom of the opening, on the front system row ${frontOffset}mm from the front edge.`,
  );
}

function drillBottom(
  ctx: SolverContext,
  drawer: ResolvedDrawer,
  slide: ReturnType<typeof getSlide>,
): void {
  if (slide.mount !== "undermount") return;
  const bottom = ctx.partsById.get(`${drawer.id}-bottom`);
  if (!bottom) return;

  // Locking devices clip into the bottom near the front, one at each side.
  const w = fromFinishedEdge(bottom, "w0", slide.lockingHoleFromFront);
  for (const [side, l] of [
    ["left", mm2(11)],
    ["right", mm2(bottom.length - 11)],
  ] as const) {
    bottom.ops.push({
      kind: "hole",
      id: `${drawer.id}-lock-${side}`,
      face: "B",
      l,
      w: mm2(w),
      diameter: slide.lockingHoleDiameter,
      depth: bottom.thickness,
      through: true,
      purpose: "drawer-lock",
      note: `Locking device, ${side}`,
    });
  }

  if (slide.rearNotch) {
    const notchW = mm2(bottom.width - slide.rearNotch.depth);
    for (const [side, centre] of [
      ["left", mm2(slide.rearNotch.width / 2 + 4)],
      ["right", mm2(bottom.length - slide.rearNotch.width / 2 - 4)],
    ] as const) {
      const half = slide.rearNotch.width / 2;
      bottom.ops.push({
        kind: "cutout",
        id: `${drawer.id}-rear-notch-${side}`,
        outline: [
          { l: mm2(centre - half), w: notchW },
          { l: mm2(centre + half), w: notchW },
          { l: mm2(centre + half), w: bottom.width },
          { l: mm2(centre - half), w: bottom.width },
        ],
        through: true,
        depth: bottom.thickness,
        purpose: "service-cutout",
        note: `Rear hook notch, ${side}`,
      });
    }
  }

  bottom.notes.push(
    `Undermount runner: Ø${slide.lockingHoleDiameter} locking device holes ${slide.lockingHoleFromFront}mm from the front edge${slide.rearNotch ? `, and a ${slide.rearNotch.width} x ${slide.rearNotch.depth}mm rear hook notch at each side` : ""}.`,
  );

  addHardware(ctx, {
    kind: "drawer-locking-device",
    catalogId: `${slide.id}-lock`,
    name: "Locking device pair",
    quantity: 1,
    unit: "pair",
    unitPrice: 2.4,
    note: `${drawer.id}.`,
  });
}

/**
 * Holes through the box front for the fixings that hold the drawer front on.
 *
 * Four fixings in a rectangle, set in far enough from the edges to stay in solid
 * material but wide enough apart that the front cannot rock.
 */
function drillFrontFixings(ctx: SolverContext, drawer: ResolvedDrawer): void {
  const boxFront = ctx.partsById.get(`${drawer.id}-box-front`);
  if (!boxFront) return;

  const inset = 32;
  const ls = [mm2(inset), mm2(boxFront.length - inset)];
  const ws = [mm2(inset), mm2(boxFront.width - inset)].filter(
    (w) => w > 0 && w < boxFront.width,
  );

  let index = 0;
  for (const l of ls) {
    for (const w of ws) {
      if (l < 0 || l > boxFront.length) continue;
      index += 1;
      boxFront.ops.push({
        kind: "hole",
        id: `${drawer.id}-front-fixing-${index}`,
        face: "A",
        l,
        w,
        diameter: 4.5,
        depth: boxFront.thickness,
        through: true,
        purpose: "slide-front-fixing",
        note: "Drawer front fixing",
      });
    }
  }

  boxFront.notes.push(
    "Drilled through for the drawer front fixings; adjust the front on the runner cams before final tightening.",
  );
}
