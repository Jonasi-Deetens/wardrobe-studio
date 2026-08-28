import type { WardrobeModel } from "../solver";
import type { Boundary } from "../solver/carcase";

/**
 * Renaming everything in a solved unit so its ids are unique in the room.
 *
 * A unit is solved on its own, knowing nothing about the room, so two wardrobes both
 * produce a panel called `side-left`. Prefixing every id with the unit's id afterwards is
 * what lets the rest of the app carry on addressing a panel by a single string: selection,
 * hover, the cut list, the drawings and the exports all keep working unchanged.
 *
 * Only ids move here. No geometry is touched, and the ids of derived things keep their
 * relationship to the panels they name — `${drawer.id}-side-left` is still the id of that
 * drawer's left side, because the prefix goes on the front.
 */
export function prefixModel(model: WardrobeModel, unitId: string): WardrobeModel {
  const p = (id: string): string => `${unitId}:${id}`;
  const pn = (id: string | null): string | null => (id === null ? null : p(id));
  const pb = (boundary: Boundary): Boundary =>
    boundary === null ? null : { ...boundary, partId: p(boundary.partId) };

  const parts = model.parts.map((part) => ({
    ...part,
    id: p(part.id),
    unitId,
    ...(part.drawerId !== undefined ? { drawerId: p(part.drawerId) } : {}),
  }));

  return {
    ...model,
    unitId,
    parts,
    partsById: new Map(parts.map((part) => [part.id, part])),
    joints: model.joints.map((joint) => ({
      ...joint,
      id: p(joint.id),
      throughPartId: p(joint.throughPartId),
      abuttingPartId: p(joint.abuttingPartId),
    })),
    bays: model.bays.map((bay) => ({
      ...bay,
      bounds: {
        left: pb(bay.bounds.left),
        right: pb(bay.bounds.right),
        below: pb(bay.bounds.below),
        above: pb(bay.bounds.above),
      },
    })),
    dividers: model.dividers.map((divider) => ({ ...divider, id: p(divider.id) })),
    leaves: model.leaves.map((leaf) => ({
      ...leaf,
      id: p(leaf.id),
      partId: p(leaf.partId),
      hingePanelId: pn(leaf.hingePanelId),
    })),
    drawers: model.drawers.map((drawer) => ({
      ...drawer,
      id: p(drawer.id),
      frontPartId: pn(drawer.frontPartId),
    })),
    adjustableShelves: model.adjustableShelves.map((shelf) => ({
      ...shelf,
      partId: p(shelf.partId),
    })),
    rails: model.rails.map((rail) => ({
      ...rail,
      id: p(rail.id),
      shelfAbovePartId: pn(rail.shelfAbovePartId),
    })),
  };
}
