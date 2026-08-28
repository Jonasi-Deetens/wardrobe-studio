import { describe, expect, it } from "vitest";
import { getProfile } from "../catalog/profiles";
import { bendDeduction, cutSize } from "../core/part";
import { createDefaultWorkTable } from "../spec/defaults";
import type { WorkTableUnitSpec } from "../spec/types";
import { describeWorkTable, solveWorkTable } from ".";

function table(overrides: Partial<WorkTableUnitSpec> = {}): WorkTableUnitSpec {
  return { ...createDefaultWorkTable(), ...overrides };
}

const topOf = (spec: WorkTableUnitSpec) => {
  const model = solveWorkTable(spec, "u1");
  const top = model.parts.find((part) => part.role === "worktop");
  if (!top) throw new Error("the table has no top");
  return { model, top };
};

describe("the folded top", () => {
  it("is cut as a blank bigger than the finished size", () => {
    const spec = table();
    const { top } = topOf(spec);

    expect(top.length).toBe(spec.width);
    expect(top.width).toBe(spec.depth);
    expect(top.blank).toBeDefined();
    expect(cutSize(top).length).toBeGreaterThan(spec.width);
    expect(cutSize(top).width).toBeGreaterThan(spec.depth);
  });

  it("takes the bend deduction off once per bend", () => {
    /* Two turned-down ends across the width: two faces of flange plus the deck, so two
       bends, so two deductions. Getting this wrong is a scrapped sheet. */
    const spec = table({
      top: { ...createDefaultWorkTable().top, edge: "folded-down", edgeReturn: 40, upstand: 0, upstandReturn: 0 },
    });
    const { top } = topOf(spec);
    const deduction = bendDeduction(top.thickness, 90);

    expect(top.blank?.length).toBeCloseTo(spec.width + 2 * 40 - 2 * deduction, 2);
    expect(top.blank?.width).toBeCloseTo(spec.depth + 2 * 40 - 2 * deduction, 2);
  });

  it("puts the upstand on the back edge instead of a turned-down flange", () => {
    const spec = table({
      top: { ...createDefaultWorkTable().top, edge: "folded-down", edgeReturn: 40, upstand: 100, upstandReturn: 20 },
    });
    const { top } = topOf(spec);
    const deduction = bendDeduction(top.thickness, 90);

    /* Across the depth: 20 back-fold + 100 upstand + deck + 40 front flange, three bends. */
    expect(top.blank?.width).toBeCloseTo(spec.depth + 20 + 100 + 40 - 3 * deduction, 2);
    expect((top.folds ?? []).filter((fold) => fold.direction === "up")).toHaveLength(2);
  });

  it("has no folds at all when the edge is square", () => {
    const spec = table({
      top: { ...createDefaultWorkTable().top, edge: "square", upstand: 0, upstandReturn: 0 },
    });
    const { top } = topOf(spec);

    expect(top.folds ?? []).toHaveLength(0);
    expect(cutSize(top)).toEqual({ length: spec.width, width: spec.depth });
  });

  it("keeps every bend line inside the blank", () => {
    for (const spec of [
      table(),
      table({ top: { ...createDefaultWorkTable().top, edge: "boxed" } }),
      table({ width: 2400, depth: 600 }),
    ]) {
      const { top } = topOf(spec);
      const blank = cutSize(top);
      for (const fold of top.folds ?? []) {
        const limit = fold.along === "length" ? blank.width : blank.length;
        expect(fold.at).toBeGreaterThan(0);
        expect(fold.at).toBeLessThan(limit);
      }
    }
  });
});

describe("the leg frame", () => {
  it("stands the top at the height that was asked for", () => {
    const spec = table({ height: 900 });
    const { model, top } = topOf(spec);

    expect(top.placement.origin[1] + top.thickness).toBeCloseTo(900, 2);
    expect(model.bounds.max[1]).toBeGreaterThanOrEqual(900 - 0.01);
  });

  it("shortens the legs by the height the feet take up", () => {
    const bullet = solveWorkTable(table({ legs: { ...createDefaultWorkTable().legs, feet: "bullet" } }), "u1");
    const bare = solveWorkTable(table({ legs: { ...createDefaultWorkTable().legs, feet: "none" } }), "u1");

    const legLength = (model: typeof bullet) =>
      model.members.find((member) => member.role === "leg")?.length ?? 0;

    expect(legLength(bullet)).toBeLessThan(legLength(bare));
    expect(legLength(bare) - legLength(bullet)).toBeCloseTo(30, 2);
  });

  it("welds every rail to a leg at both ends", () => {
    const model = solveWorkTable(table(), "u1");
    const rails = model.members.filter((member) => member.role !== "leg");

    expect(rails.length).toBeGreaterThan(0);
    for (const rail of rails) {
      const welds = model.welds.filter((weld) => weld.a === rail.id || weld.b === rail.id);
      expect(welds.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("drills the top rails for the bolts that hold the top down, and nothing else", () => {
    const model = solveWorkTable(table(), "u1");
    const drilled = model.members.filter((member) =>
      member.ops.some((op) => op.purpose === "top-fixing"),
    );

    expect(drilled).toHaveLength(4);
    expect(drilled.every((member) => member.role === "rail")).toBe(true);

    const bolts = model.hardware.find((use) => use.catalogId === "bolt-m6-top");
    const holes = model.members.reduce(
      (count, member) => count + member.ops.filter((op) => op.purpose === "top-fixing").length,
      0,
    );
    expect(bolts?.quantity).toBe(holes);
  });

  it("keeps the legs inside the top's footprint", () => {
    const spec = table();
    const leg = getProfile(spec.legs.profileId);
    const model = solveWorkTable(spec, "u1");

    for (const member of model.members.filter((m) => m.role === "leg")) {
      expect(member.placement.origin[0]).toBeGreaterThanOrEqual(spec.legs.inset - 0.01);
      expect(member.placement.origin[0] + leg.width).toBeLessThanOrEqual(spec.width + 0.01);
    }
  });
});

describe("undershelves", () => {
  it("are cut to the clear size between the legs, not the full footprint", () => {
    const spec = table({ shelves: { ...createDefaultWorkTable().shelves, count: 1 } });
    const model = solveWorkTable(spec, "u1");
    const shelf = model.parts.find((part) => part.role === "undershelf");

    expect(shelf).toBeDefined();
    expect(shelf?.length).toBeLessThan(spec.width);
    expect(shelf?.width).toBeLessThan(spec.depth);
  });

  it("come with a clip per corner", () => {
    const model = solveWorkTable(table({ shelves: { ...createDefaultWorkTable().shelves, count: 2 } }), "u1");

    expect(model.shelfHeights).toHaveLength(2);
    expect(model.hardware.find((use) => use.catalogId === "clip-shelf-tube")?.quantity).toBe(8);
  });

  it("are dropped entirely when the count is zero", () => {
    const model = solveWorkTable(table({ shelves: { ...createDefaultWorkTable().shelves, count: 0 } }), "u1");

    expect(model.shelfHeights).toHaveLength(0);
    expect(model.parts.filter((part) => part.role === "undershelf")).toHaveLength(0);
    expect(model.hardware.find((use) => use.catalogId === "clip-shelf-tube")).toBeUndefined();
  });

  it("stack lowest first", () => {
    const model = solveWorkTable(table({ shelves: { ...createDefaultWorkTable().shelves, count: 2 } }), "u1");
    const [first, second] = model.shelfHeights;

    expect(first).toBeLessThan(second as number);
  });
});

describe("the description", () => {
  it("reads as a spec line", () => {
    expect(describeWorkTable(table())).toMatch(/x .* high/);
    expect(describeWorkTable(table({ shelves: { ...createDefaultWorkTable().shelves, count: 0 } }))).toContain(
      "no undershelf",
    );
  });
});
