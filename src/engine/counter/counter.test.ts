import { describe, expect, it } from "vitest";
import { boxOverlap } from "../core/geometry";
import { partBounds } from "../core/part";
import { createDefaultCounter } from "../spec/defaults";
import type { CounterUnitSpec } from "../spec/types";
import { describeCounter, solveCounter } from ".";

const base = createDefaultCounter();

function counter(overrides: Partial<CounterUnitSpec> = {}): CounterUnitSpec {
  return { ...base, ...overrides };
}

const solved = (overrides: Partial<CounterUnitSpec> = {}) =>
  solveCounter(counter(overrides), "u1");

describe("the counter top", () => {
  it("covers the whole footprint and stands at the asked-for height", () => {
    const spec = counter();
    const model = solveCounter(spec, "u1");
    const top = model.parts.find((part) => part.role === "worktop");

    expect(top?.length).toBe(spec.width);
    expect(top?.width).toBe(spec.depth);
    expect(model.bounds.max[1]).toBeCloseTo(spec.height, 2);
  });

  it("sets the frame in by the overhangs, so the top oversails it", () => {
    const spec = counter({
      top: { ...base.top, frontOverhang: 300, endOverhang: 50, backOverhang: 0 },
    });
    const model = solveCounter(spec, "u1");
    const legs = model.members.filter((member) => member.role === "leg");
    const xs = legs.map((leg) => leg.placement.origin[0]);
    const zs = legs.map((leg) => leg.placement.origin[2]);

    expect(Math.min(...xs)).toBeGreaterThanOrEqual(50 + spec.frame.inset - 0.01);
    expect(Math.max(...zs)).toBeLessThanOrEqual(spec.depth - 300 - 0.01);
  });

  it("is a folded tray when it is stainless and a banded board when it is not", () => {
    const board = solved().parts.find((part) => part.role === "worktop");
    const inox = solved({
      top: { ...base.top, kind: "inox", materialId: "inox15-304" },
    }).parts.find((part) => part.role === "worktop");

    expect(board?.folds ?? []).toHaveLength(0);
    expect(board?.banding.w1).toBe(base.top.bandingId);
    expect((inox?.folds ?? []).length).toBeGreaterThan(0);
    expect(inox?.blank).toBeDefined();
  });
});

describe("the drawer bank", () => {
  it("is solved by the wardrobe solver, so it comes with real runner drilling", () => {
    const model = solved();

    expect(model.drawers).toHaveLength(base.drawerBank.count);
    const sides = model.parts.filter((part) => part.role === "drawer-side");
    expect(sides).toHaveLength(base.drawerBank.count * 2);

    const slideHoles = model.parts.flatMap((part) =>
      part.ops.filter((op) => op.purpose === "slide-fixing" || op.purpose === "slide-front-fixing"),
    );
    expect(slideHoles.length).toBeGreaterThan(0);
  });

  it("brings its own hardware, including the runners and the handles", () => {
    const model = solved();
    const kinds = new Set(model.hardware.map((use) => use.kind));

    expect(kinds.has("slide")).toBe(true);
    expect(kinds.has("handle")).toBe(true);
  });

  it("stands inside the frame rather than outside it", () => {
    const spec = counter();
    const model = solveCounter(spec, "u1");
    const fronts = model.parts.filter((part) => part.role === "drawer-front");

    expect(fronts.length).toBeGreaterThan(0);
    for (const front of fronts) {
      const box = partBounds(front);
      expect(box.min[0]).toBeGreaterThanOrEqual(-0.01);
      expect(box.max[0]).toBeLessThanOrEqual(spec.width + 0.01);
      expect(box.max[1]).toBeLessThanOrEqual(spec.height + 0.01);
    }
  });

  it("is pulled back inside the legs when it is asked for past the end", () => {
    const spec = counter({ drawerBank: { ...base.drawerBank, fromLeft: 5000 } });
    const model = solveCounter(spec, "u1");

    for (const part of model.parts.filter((p) => p.role === "drawer-front")) {
      expect(partBounds(part).max[0]).toBeLessThanOrEqual(spec.width + 0.01);
    }
  });

  it("is dropped entirely when it is turned off", () => {
    const model = solved({ drawerBank: { ...base.drawerBank, enabled: false } });

    expect(model.drawers).toHaveLength(0);
    expect(model.parts.filter((part) => part.role === "drawer-front")).toHaveLength(0);
  });

  it("does not run through the counter top", () => {
    const model = solved();
    const top = model.parts.find((part) => part.role === "worktop");
    if (!top) throw new Error("no top");
    const topBox = partBounds(top);

    for (const part of model.parts) {
      if (part.id === top.id) continue;
      const overlap = boxOverlap(topBox, partBounds(part));
      expect(Math.min(...overlap)).toBeLessThanOrEqual(0.5);
    }
  });
});

describe("the frame", () => {
  it("welds a rail ring at the bottom and one under the top", () => {
    const model = solved({ shelves: { ...base.shelves, count: 0 } });
    const rails = model.members.filter((member) => member.role !== "leg");

    expect(rails.length).toBeGreaterThanOrEqual(8);
    for (const rail of rails) {
      expect(model.welds.filter((weld) => weld.a === rail.id || weld.b === rail.id).length)
        .toBeGreaterThanOrEqual(2);
    }
  });

  it("puts a shelf on the bottom ring rather than welding a second ring beside it", () => {
    /* A shelf at 168 with a ring wanted at 150 is not two rings 18mm apart. */
    const one = solved({
      frame: { ...base.frame, bottomRail: 150 },
      shelves: { ...base.shelves, count: 1, lowest: 160 },
    });
    const far = solved({
      frame: { ...base.frame, bottomRail: 150 },
      shelves: { ...base.shelves, count: 1, lowest: 500 },
    });

    const ringCount = (model: typeof one): number =>
      new Set(
        model.members
          .filter((member) => member.role !== "leg" && member.role !== "brace")
          .map((member) => Math.round(member.placement.origin[1])),
      ).size;

    expect(ringCount(one)).toBeLessThan(ringCount(far));
  });

  it("drills the top rails for the screws that hold the top down", () => {
    const model = solved();
    const drilled = model.members.filter((member) =>
      member.ops.some((op) => op.purpose === "top-fixing"),
    );

    expect(drilled.length).toBe(4);
    const screws = model.hardware.find((use) => use.catalogId === "screw-6x40-top");
    expect(screws?.quantity).toBe(drilled.reduce((n, m) => n + m.ops.length, 0));
  });
});

describe("the bar shelf", () => {
  it("is left out unless it is high enough to stand over the top", () => {
    expect(solved().barY).toBeNull();
    expect(solved({ bar: { ...base.bar, height: 900 } }).barY).toBeNull();
    expect(solved({ bar: { ...base.bar, height: 1100 } }).barY).toBe(1100);
  });

  it("stands on posts and notches through the top", () => {
    const model = solved({ bar: { ...base.bar, height: 1100 } });
    const posts = model.members.filter((member) => member.role === "post");
    const top = model.parts.find((part) => part.role === "worktop");

    expect(posts).toHaveLength(2);
    expect(top?.ops.filter((op) => op.kind === "cutout")).toHaveLength(2);
  });

  it("raises the unit's bounds to the bar surface", () => {
    const model = solved({ bar: { ...base.bar, height: 1100 } });
    expect(model.bounds.max[1]).toBeCloseTo(1100, 2);
  });
});

describe("shelves", () => {
  it("are cut to drop between the legs and set back from the front", () => {
    const spec = counter({ shelves: { ...base.shelves, count: 1, setback: 40 } });
    const model = solveCounter(spec, "u1");
    const shelf = model.parts.find((part) => part.role === "undershelf");

    expect(shelf).toBeDefined();
    expect(shelf?.length).toBeLessThan(spec.width);
    expect(partBounds(shelf!).max[2]).toBeLessThanOrEqual(spec.depth - spec.top.frontOverhang);
  });

  it("stop being added once they would foul the top", () => {
    const model = solved({ shelves: { ...base.shelves, count: 3, lowest: 200, spacing: 400 } });

    for (const y of model.shelfHeights) {
      expect(y).toBeLessThan(model.frameTop);
    }
  });
});

describe("the description", () => {
  it("names the frame and what is in it", () => {
    expect(describeCounter(counter())).toContain("drawers");
    expect(describeCounter(counter({ bar: { ...base.bar, height: 1100 } }))).toContain("bar shelf");
  });
});
