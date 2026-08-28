import { beforeEach, describe, expect, it } from "vitest";
import { partBounds, placePart } from "../core/part";
import { createDefaultProject, placeUnit, createDefaultUnit } from "../spec/defaults";
import { PROJECT_PRESETS } from "../spec/presets";
import type { ProjectSpec } from "../spec/types";
import { clearProjectCache, solveProject, wardrobeModelOf } from ".";
import { buildRoom, ceilingHeightAt, peakHeightOf } from "./room";

function withUnitAt(at: { x: number; z: number; yaw?: number }): ProjectSpec {
  const base = createDefaultProject();
  return { ...base, units: [placeUnit(createDefaultUnit(), "Wardrobe", at)] };
}

/** Edits the first unit only, the way the store does: everything else keeps its identity. */
function widenFirstUnit(project: ProjectSpec, width: number): ProjectSpec {
  const units = project.units.map((placed, index) => {
    if (index !== 0 || placed.unit.kind !== "wardrobe") return placed;
    return {
      ...placed,
      unit: { ...placed.unit, carcase: { ...placed.unit.carcase, width } },
    };
  });
  return { ...project, units };
}

describe("solveProject", () => {
  beforeEach(() => {
    clearProjectCache();
  });

  it("solves every unit and prefixes its ids with the unit id", () => {
    const project = PROJECT_PRESETS[1]?.build();
    if (!project) throw new Error("expected the two-unit preset");
    const model = solveProject(project);

    expect(model.units).toHaveLength(2);
    for (const unit of model.units) {
      expect(unit.parts.length).toBeGreaterThan(10);
      for (const part of unit.parts) {
        expect(part.id.startsWith(`${unit.id}:`)).toBe(true);
        expect(part.unitId).toBe(unit.id);
      }
    }
    expect(new Set(model.parts.map((p) => p.id)).size).toBe(model.parts.length);
    expect(model.partsById.size).toBe(model.parts.length);
  });

  it("keeps every internal reference pointing at a part that exists", () => {
    const model = solveProject(PROJECT_PRESETS[1]?.build() as ProjectSpec);
    for (const unit of model.units) {
      const wardrobe = wardrobeModelOf(unit);
      if (!wardrobe) continue;
      const has = (id: string | null): boolean => id === null || wardrobe.partsById.has(id);
      for (const joint of wardrobe.joints) {
        expect(has(joint.throughPartId)).toBe(true);
        expect(has(joint.abuttingPartId)).toBe(true);
      }
      for (const leaf of wardrobe.leaves) {
        expect(has(leaf.partId)).toBe(true);
        expect(has(leaf.hingePanelId)).toBe(true);
      }
      for (const drawer of wardrobe.drawers) {
        expect(has(drawer.frontPartId)).toBe(true);
        expect(wardrobe.partsById.has(`${drawer.id}-side-left`)).toBe(true);
      }
      for (const shelf of wardrobe.adjustableShelves) expect(has(shelf.partId)).toBe(true);
      for (const bay of wardrobe.bays) {
        expect(has(bay.bounds.left?.partId ?? null)).toBe(true);
        expect(has(bay.bounds.right?.partId ?? null)).toBe(true);
      }
    }
  });

  it("leaves unit space alone and moves only the room-space bounds", () => {
    const origin = solveProject(withUnitAt({ x: 0, z: 0 }));
    const moved = solveProject(withUnitAt({ x: 1200, z: 400 }));
    const a = origin.units[0];
    const b = moved.units[0];
    if (!a || !b) throw new Error("expected a unit");

    expect(b.localBounds).toEqual(a.localBounds);
    expect(b.bounds.min[0] - a.bounds.min[0]).toBeCloseTo(1200, 3);
    expect(b.bounds.min[2] - a.bounds.min[2]).toBeCloseTo(400, 3);
  });

  it("turns a unit about its own origin", () => {
    const square = solveProject(withUnitAt({ x: 0, z: 0 }));
    const turned = solveProject(withUnitAt({ x: 0, z: 0, yaw: 90 }));
    const a = square.units[0];
    const b = turned.units[0];
    if (!a || !b) throw new Error("expected a unit");

    const widthOf = (box: { min: readonly number[]; max: readonly number[] }): number =>
      (box.max[0] as number) - (box.min[0] as number);
    const depthOf = (box: { min: readonly number[]; max: readonly number[] }): number =>
      (box.max[2] as number) - (box.min[2] as number);

    // A quarter turn swaps how much room the unit takes across and back.
    expect(widthOf(b.bounds)).toBeCloseTo(depthOf(a.bounds), 3);
    expect(depthOf(b.bounds)).toBeCloseTo(widthOf(a.bounds), 3);
    expect(b.bounds.max[1]).toBeCloseTo(a.bounds.max[1] as number, 3);
  });

  it("re-uses the model of a unit that did not change", () => {
    const project = PROJECT_PRESETS[1]?.build() as ProjectSpec;
    const first = solveProject(project);
    const wider = widenFirstUnit(project, 1500);
    const second = solveProject(wider);

    expect(second.units[0]).not.toBe(first.units[0]);
    expect(second.units[1]).toBe(first.units[1]);
  });

  it("gives every unit a footprint on the floor", () => {
    const model = solveProject(withUnitAt({ x: 500, z: 100, yaw: 30 }));
    const unit = model.units[0];
    if (!unit) throw new Error("expected a unit");

    expect(unit.footprint).toHaveLength(4);
    for (const corner of unit.footprint) expect(corner[1]).toBe(0);

    // Room-space bounds have to contain every part once it is placed.
    for (const part of unit.parts) {
      const box = partBounds(placePart(part, unit.at));
      for (const axis of [0, 1, 2] as const) {
        expect(box.min[axis]).toBeGreaterThanOrEqual((unit.bounds.min[axis] as number) - 0.01);
        expect(box.max[axis]).toBeLessThanOrEqual((unit.bounds.max[axis] as number) + 0.01);
      }
    }
  });
});

describe("room geometry", () => {
  it("is level under a flat roof", () => {
    const room = createDefaultProject().room;
    expect(ceilingHeightAt(room, 0, 0)).toBe(room.height);
    expect(ceilingHeightAt(room, room.width, room.depth)).toBe(room.height);
    expect(peakHeightOf(room)).toBe(room.height);
  });

  it("rises across the room under a shed roof", () => {
    const base = createDefaultProject().room;
    const room = { ...base, roof: { ...base.roof, kind: "shed" as const, pitch: 15, slopeAxis: "z" as const } };
    expect(ceilingHeightAt(room, 0, 0)).toBeCloseTo(room.height, 3);
    // 3000 deep at 15 degrees is a rise of 3000 * tan 15 = 803.8mm.
    expect(ceilingHeightAt(room, 0, room.depth)).toBeCloseTo(room.height + 803.85, 1);
    expect(peakHeightOf(room)).toBeCloseTo(room.height + 803.85, 1);
  });

  it("peaks at the ridge under a gable, and the gable ends get an apex", () => {
    const base = createDefaultProject().room;
    const room = { ...base, roof: { ...base.roof, kind: "gable" as const, pitch: 30, slopeAxis: "z" as const } };
    const ridge = room.height + (room.depth / 2) * Math.tan(Math.PI / 6);

    expect(ceilingHeightAt(room, 0, room.depth / 2)).toBeCloseTo(ridge, 1);
    expect(ceilingHeightAt(room, 0, 0)).toBeCloseTo(room.height, 1);
    expect(ceilingHeightAt(room, 0, room.depth)).toBeCloseTo(room.height, 1);

    const model = buildRoom(room);
    const left = model.walls.find((wall) => wall.side === "left");
    const back = model.walls.find((wall) => wall.side === "back");
    // The ridge runs across Z, so the side walls are pentagons and the ends are level.
    expect(left?.outline).toHaveLength(5);
    expect(back?.outline).toHaveLength(4);
    expect(model.roof).toHaveLength(2);
  });

  it("puts each window in the wall it belongs to", () => {
    const room = createDefaultProject().room;
    const model = buildRoom(room);
    const left = model.walls.find((wall) => wall.side === "left");
    expect(left?.openings).toHaveLength(1);
    expect(left?.openings[0]?.width).toBe(1200);
    expect(model.walls.filter((wall) => wall.openings.length > 0)).toHaveLength(1);
  });
});
