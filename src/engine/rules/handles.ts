import { getHandle, type HandleSpec } from "../catalog/hardware";
import { mm2 } from "../core/units";
import type { HandlePlacement } from "../spec/types";
import { addHardware, type SolverContext } from "../solver/context";
import { fromFinishedEdge, type PartDraft } from "../solver/draft";
import type { ResolvedLeaf } from "../solver/doors";
import type { ResolvedDrawer } from "../solver/fittings";

/**
 * Handle drilling.
 *
 * A door handle goes on the opening edge, opposite the hinges, so the leverage is
 * greatest. A drawer handle is centred on the front. Handles that do not need holes
 * — push latches, integrated grooves, recessed pulls — produce a groove, a cutout or
 * nothing at all, which is why this cannot just be "two holes".
 */
export function applyHandles(
  ctx: SolverContext,
  leaves: readonly ResolvedLeaf[],
  drawers: readonly ResolvedDrawer[],
): void {
  const doorHandle = getHandle(ctx.spec.handles.doorHandleId);
  const drawerHandle = getHandle(ctx.spec.handles.drawerHandleId);

  for (const leaf of leaves) {
    const door = ctx.partsById.get(leaf.partId);
    if (!door) continue;
    applyDoorHandle(ctx, door, leaf, doorHandle);
  }

  if (leaves.length > 0) {
    addHandleHardware(ctx, doorHandle, leaves.length, "doors");
  }

  const frontedDrawers = drawers.filter((d) => d.hasFront && d.frontPartId);
  for (const drawer of frontedDrawers) {
    const front = drawer.frontPartId ? ctx.partsById.get(drawer.frontPartId) : undefined;
    if (!front) continue;
    applyDrawerHandle(ctx, front, drawerHandle);
  }
  if (frontedDrawers.length > 0) {
    addHandleHardware(ctx, drawerHandle, frontedDrawers.length, "drawer fronts");
  }
}

function addHandleHardware(
  ctx: SolverContext,
  handle: HandleSpec,
  count: number,
  where: string,
): void {
  addHardware(ctx, {
    kind: "handle",
    catalogId: handle.id,
    name: handle.name,
    quantity: count,
    unit: "each",
    unitPrice: handle.pricePerUnit,
    note: `One per front on the ${where}.`,
  });
  if (handle.kind === "push-to-open") {
    addHardware(ctx, {
      kind: "push-latch",
      catalogId: handle.id,
      name: "Push latch, carcase mounted",
      quantity: count,
      unit: "each",
      unitPrice: handle.pricePerUnit,
      note: "Mounts to the carcase; leave a 2mm gap for the front to travel.",
    });
  }
}

/**
 * Height of the handle centre on a door leaf.
 *
 * Centred is the safe default on a tall wardrobe leaf. Top and bottom placements
 * put the handle a comfortable 100mm in from the end rather than right at the
 * corner, where it looks like an afterthought and is awkward to grip.
 */
function doorHandleHeight(
  placement: HandlePlacement,
  leafHeight: number,
  customHeightFromBottom: number,
): number {
  switch (placement) {
    case "centre":
      return leafHeight / 2;
    case "top":
      return leafHeight - 100;
    case "bottom":
      return 100;
    case "custom":
      return customHeightFromBottom;
  }
}

function applyDoorHandle(
  ctx: SolverContext,
  door: PartDraft,
  leaf: ResolvedLeaf,
  handle: HandleSpec,
): void {
  const cfg = ctx.spec.handles;
  // The handle goes on the edge the leaf opens from, which is opposite the hinges.
  const openingEdge = leaf.hingeSide === "left" ? "w1" : "w0";
  const w = fromFinishedEdge(door, openingEdge, cfg.doorEdgeOffset);
  const centreL = mm2(
    doorHandleHeight(cfg.doorPlacement, door.length, cfg.doorCustomHeight),
  );

  if (handle.kind === "profile-groove") {
    // A milled finger groove along the opening edge on the back of the leaf.
    door.ops.push({
      kind: "groove",
      id: `${door.id}-handle-groove`,
      face: "A",
      from: { l: 0, w: mm2(w) },
      to: { l: door.length, w: mm2(w) },
      width: 20,
      depth: 12,
      purpose: "handle-groove",
      note: "Integrated finger groove",
    });
    door.notes.push(
      `Integrated groove 20 x 12mm on the back face, ${cfg.doorEdgeOffset}mm from the opening edge.`,
    );
    return;
  }

  if (handle.kind === "recessed") {
    const half = handle.length / 2;
    door.ops.push({
      kind: "cutout",
      id: `${door.id}-handle-recess`,
      outline: [
        { l: mm2(centreL - half), w: mm2(w - 20) },
        { l: mm2(centreL + half), w: mm2(w - 20) },
        { l: mm2(centreL + half), w: mm2(w + 20) },
        { l: mm2(centreL - half), w: mm2(w + 20) },
      ],
      through: true,
      depth: door.thickness,
      purpose: "handle",
      note: "Recessed pull pocket",
    });
    door.notes.push(`Recessed pull: ${handle.length} x 40mm pocket, cut through.`);
    return;
  }

  if (!handle.needsDrilling) {
    door.notes.push(`${handle.name}: no drilling in the front.`);
    return;
  }

  // Bar handles run along the leaf when vertical, across it when horizontal.
  const alongLeaf = cfg.doorOrientation === "vertical";
  const offsets =
    handle.centres > 0 ? [-handle.centres / 2, handle.centres / 2] : [0];

  offsets.forEach((offset, index) => {
    const l = alongLeaf ? mm2(centreL + offset) : centreL;
    const hw = alongLeaf ? mm2(w) : mm2(w + offset);
    if (l < 0 || l > door.length || hw < 0 || hw > door.width) return;
    door.ops.push({
      kind: "hole",
      id: `${door.id}-handle-${index + 1}`,
      face: "A",
      l,
      w: hw,
      diameter: handle.fixingHoleDiameter,
      depth: door.thickness,
      through: true,
      purpose: "handle",
      note: `${handle.name} fixing ${index + 1}`,
    });
  });

  door.notes.push(
    `${handle.name}: ${handle.centres > 0 ? `${handle.centres}mm centres, ` : ""}${cfg.doorEdgeOffset}mm from the opening edge, centre ${centreL}mm from the bottom.`,
  );
}

function applyDrawerHandle(
  ctx: SolverContext,
  front: PartDraft,
  handle: HandleSpec,
): void {
  const cfg = ctx.spec.handles;
  // A drawer front is built with its length across the opening and its width up.
  const centreW =
    cfg.drawerPlacement === "custom"
      ? mm2(cfg.drawerCustomHeight)
      : cfg.drawerPlacement === "top"
        ? mm2(front.width - 40)
        : cfg.drawerPlacement === "bottom"
          ? 40
          : mm2(front.width / 2);
  const centreL = mm2(front.length / 2);

  if (handle.kind === "profile-groove") {
    front.ops.push({
      kind: "groove",
      id: `${front.id}-handle-groove`,
      face: "A",
      from: { l: 0, w: mm2(front.width - 20) },
      to: { l: front.length, w: mm2(front.width - 20) },
      width: 20,
      depth: 12,
      purpose: "handle-groove",
      note: "Integrated finger groove along the top edge",
    });
    front.notes.push("Integrated groove 20 x 12mm on the back face along the top edge.");
    return;
  }

  if (!handle.needsDrilling) {
    front.notes.push(`${handle.name}: no drilling in the front.`);
    return;
  }

  const acrossFront = cfg.drawerOrientation === "horizontal";
  const offsets =
    handle.centres > 0 ? [-handle.centres / 2, handle.centres / 2] : [0];

  offsets.forEach((offset, index) => {
    const l = acrossFront ? mm2(centreL + offset) : centreL;
    const w = acrossFront ? centreW : mm2(centreW + offset);
    if (l < 0 || l > front.length || w < 0 || w > front.width) return;
    front.ops.push({
      kind: "hole",
      id: `${front.id}-handle-${index + 1}`,
      face: "A",
      l,
      w,
      diameter: handle.fixingHoleDiameter,
      depth: front.thickness,
      through: true,
      purpose: "handle",
      note: `${handle.name} fixing ${index + 1}`,
    });
  });

  front.notes.push(
    `${handle.name}${handle.centres > 0 ? `, ${handle.centres}mm centres` : ""}, centred ${centreW}mm from the bottom edge.`,
  );
}
