import { describe, expect, it } from "vitest";
import { advise } from "../advisor";
import type { Hole, MachiningOp, OpPurpose, Part } from "../core/part";
import { createDefaultSpec, makeBay, makeSplit, DEFAULT_FITTINGS } from "../spec/defaults";
import type { WardrobeSpec } from "../spec/types";
import { solve, type WardrobeModel } from "../solver";

/**
 * The machining rules, tested through the whole solver rather than in isolation.
 *
 * A rule is only correct in the context of the panel it drills, so these build a
 * real model and then look at what came out. The recurring shape of the assertions
 * is "this hardware is on the list, therefore these holes exist" — the two drifted
 * apart once and the invariant test at the bottom is what stops it happening again.
 */

function holesFor(part: Part, purpose: OpPurpose): Hole[] {
  return part.ops.filter((op): op is Hole => op.kind === "hole" && op.purpose === purpose);
}

function allOps(model: WardrobeModel, purpose: OpPurpose): MachiningOp[] {
  return model.parts.flatMap((part) =>
    part.ops.filter((op) => "purpose" in op && op.purpose === purpose),
  );
}

function hardwareOf(model: WardrobeModel, kind: string): number {
  return model.hardware
    .filter((use) => use.kind === kind)
    .reduce((sum, use) => sum + use.quantity, 0);
}

describe("levelling legs", () => {
  const spec: WardrobeSpec = (() => {
    const base = createDefaultSpec();
    return {
      ...base,
      carcase: {
        ...base.carcase,
        plinth: { ...base.carcase.plinth, type: "legs", height: 100, legId: "leg-100" },
      },
    };
  })();

  const model = solve(spec);

  it("drills a plate for every leg it bills", () => {
    const bottom = model.parts.find((part) => part.role === "bottom");
    expect(bottom).toBeDefined();
    const plates = holesFor(bottom as Part, "leg-plate");
    const legs = hardwareOf(model, "levelling-leg");

    expect(legs).toBeGreaterThan(0);
    // Four screws hold each plate.
    expect(plates).toHaveLength(legs * 4);
  });

  it("puts the plates on the underside, inside the panel, at the catalogue inset", () => {
    const bottom = model.parts.find((part) => part.role === "bottom") as Part;
    const plates = holesFor(bottom, "leg-plate");

    for (const hole of plates) {
      expect(hole.face).toBe("B");
      expect(hole.l).toBeGreaterThanOrEqual(0);
      expect(hole.l).toBeLessThanOrEqual(bottom.length);
      expect(hole.w).toBeGreaterThanOrEqual(0);
      expect(hole.w).toBeLessThanOrEqual(bottom.width);
    }

    // Two rows, front and rear, each 50mm in from the edge give or take the 20mm
    // half-pattern.
    const rows = [...new Set(plates.map((hole) => hole.w))].sort((a, b) => a - b);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toBeCloseTo(30, 1);
    expect(rows[3]).toBeCloseTo(bottom.width - 30, 1);
  });

  it("bills no legs and drills no plates for a plinth that is not legs", () => {
    const plinth = solve(createDefaultSpec());
    expect(hardwareOf(plinth, "levelling-leg")).toBe(0);
    expect(allOps(plinth, "leg-plate")).toHaveLength(0);
  });
});

describe("hanging rail centre support", () => {
  /** A bay wide enough that the rail cannot carry its own span. */
  function wideHang(shelfAbove: boolean): WardrobeSpec {
    const base = createDefaultSpec();
    return {
      ...base,
      carcase: { ...base.carcase, width: 2400 },
      layout: makeBay(
        { ...DEFAULT_FITTINGS.hanging, shelfAbove, clearHeight: 1600 },
        "Wide hang",
      ),
    };
  }

  it("drills the shelf over the rail when the span needs a centre support", () => {
    const model = solve(wideHang(true));
    const rail = model.rails[0];
    expect(rail?.needsCentreSupport).toBe(true);
    expect(rail?.shelfAbovePartId).not.toBeNull();

    const shelf = model.partsById.get(rail?.shelfAbovePartId as string);
    expect(shelf).toBeDefined();
    const centre = holesFor(shelf as Part, "rail-support");
    // Two screws, in the underside.
    expect(centre).toHaveLength(2);
    expect(centre.every((hole) => hole.face === "B")).toBe(true);

    expect(hardwareOf(model, "rail-centre-support")).toBe(1);
  });

  it("does not bill a centre support when there is no shelf to fix it to", () => {
    const model = solve(wideHang(false));
    expect(model.rails[0]?.needsCentreSupport).toBe(true);
    expect(model.rails[0]?.shelfAbovePartId).toBeNull();
    expect(hardwareOf(model, "rail-centre-support")).toBe(0);
  });

  it("bills nothing for a span the rail can carry", () => {
    const base = createDefaultSpec();
    const model = solve({
      ...base,
      carcase: { ...base.carcase, width: 900 },
      layout: makeBay({ ...DEFAULT_FITTINGS.hanging, clearHeight: 1600 }, "Narrow hang"),
    });
    expect(model.rails[0]?.needsCentreSupport).toBe(false);
    expect(hardwareOf(model, "rail-centre-support")).toBe(0);
  });
});

describe("side-mount drawer runners", () => {
  const base = createDefaultSpec();
  const spec: WardrobeSpec = {
    ...base,
    drawers: { ...base.drawers, slideId: "side-mount-ballbearing" },
    layout: makeBay({ ...DEFAULT_FITTINGS.drawers, count: 3 }, "Drawer bank"),
  };
  const model = solve(spec);

  it("drills the drawer sides as well as the carcase", () => {
    const sides = model.parts.filter((part) => part.role === "drawer-side");
    expect(sides).toHaveLength(6);

    for (const side of sides) {
      const fixings = holesFor(side, "slide-fixing");
      expect(fixings.length).toBeGreaterThanOrEqual(2);
      // The outside face of the box, since face A looks in.
      expect(fixings.every((hole) => hole.face === "B")).toBe(true);
      // All at one height, level with the cabinet member.
      expect(new Set(fixings.map((hole) => hole.w)).size).toBe(1);
    }
  });

  it("leaves the drawer sides alone for an undermount runner", () => {
    const undermount = solve({
      ...spec,
      drawers: { ...base.drawers, slideId: "undermount-softclose" },
    });
    const sides = undermount.parts.filter((part) => part.role === "drawer-side");
    expect(sides.length).toBeGreaterThan(0);
    for (const side of sides) {
      expect(holesFor(side, "slide-fixing")).toHaveLength(0);
    }
  });

  it("still drills the cabinet member on the carcase panels", () => {
    const carcaseFixings = model.parts
      .filter((part) => part.role === "side" || part.role === "divider")
      .flatMap((part) => holesFor(part, "slide-fixing"));
    expect(carcaseFixings.length).toBeGreaterThan(0);
  });
});

describe("pull-out trays", () => {
  /** Five trays in a 450mm bay used to overrun the top of the bay by about 31mm. */
  function trays(count: number, carcaseDepth: number): WardrobeModel {
    const base = createDefaultSpec();
    return solve({
      ...base,
      carcase: { ...base.carcase, width: 600, depth: carcaseDepth },
      layout: makeBay({ kind: "pullout-trays", count, trayHeight: 100 }, "Trays"),
    });
  }

  for (const count of [2, 3, 4, 5, 6, 8]) {
    it(`keeps ${count} trays inside the bay`, () => {
      const model = trays(count, 450);
      const bay = model.bays[0];
      expect(bay).toBeDefined();
      expect(model.drawers).toHaveLength(count);

      for (const drawer of model.drawers) {
        expect(drawer.opening.y0).toBeGreaterThanOrEqual((bay?.region.y0 as number) - 0.01);
        expect(drawer.opening.y1).toBeLessThanOrEqual((bay?.region.y1 as number) + 0.01);
      }

      // And the boxes themselves, which is what would actually collide.
      const top = model.parts
        .filter((part) => part.role.startsWith("drawer-"))
        .flatMap((part) => [part.placement.origin[1]]);
      expect(Math.max(...top)).toBeLessThanOrEqual((bay?.region.y1 as number) + 0.01);
    });
  }

  it("stacks the trays without overlapping each other", () => {
    const model = trays(5, 450);
    const sorted = [...model.drawers].sort((a, b) => a.opening.y0 - b.opening.y0);
    for (let i = 1; i < sorted.length; i += 1) {
      const below = sorted[i - 1];
      const above = sorted[i];
      expect(above?.opening.y0).toBeGreaterThanOrEqual((below?.opening.y1 as number) - 0.01);
    }
  });
});

describe("doors that cannot be made", () => {
  it("reports an error rather than dropping the leaf", () => {
    const base = createDefaultSpec();
    const model = solve({
      ...base,
      carcase: { ...base.carcase, height: 800, plinth: { ...base.carcase.plinth, height: 100 } },
      doors: {
        ...base.doors,
        type: "hinged",
        overlayStyle: "inset",
        revealTop: 400,
        revealBottom: 400,
      },
    });

    expect(model.impossibleLeaves.length).toBeGreaterThan(0);
    const findings = advise(model);
    const error = findings.find((f) => f.id.startsWith("leaf-impossible-"));
    expect(error).toBeDefined();
    expect(error?.severity).toBe("error");
  });

  it("says nothing when every leaf fits", () => {
    const model = solve(createDefaultSpec());
    expect(model.impossibleLeaves).toEqual([]);
    expect(advise(model).some((f) => f.id.startsWith("leaf-impossible-"))).toBe(false);
  });
});

/**
 * The invariant that would have caught all three of the bugs above at once: a piece
 * of hardware that is screwed to a panel has to have holes in a panel somewhere.
 */
describe("hardware and machining agree", () => {
  /* Each kind of hardware, against the purposes any of its holes could carry — a
     connector is drilled differently depending on whether it is a dowel or a cam. */
  const FIXED_WITH_HOLES: Record<string, readonly OpPurpose[]> = {
    connector: ["dowel", "confirmat", "cam-bolt", "cam-housing", "lamello"],
    hinge: ["hinge-cup", "hinge-plate"],
    "rail-support": ["rail-support"],
    "rail-centre-support": ["rail-support"],
    "levelling-leg": ["leg-plate"],
    "drawer-locking-device": ["drawer-lock"],
    "wall-bracket": ["wall-anchor"],
  };

  function check(spec: WardrobeSpec, label: string): void {
    const model = solve(spec);
    for (const [kind, purposes] of Object.entries(FIXED_WITH_HOLES)) {
      if (hardwareOf(model, kind) === 0) continue;
      const ops = purposes.flatMap((purpose) => allOps(model, purpose));
      expect(
        ops.length,
        `${label}: ${kind} is on the hardware list but nothing is drilled for it`,
      ).toBeGreaterThan(0);
    }
  }

  it("holds for the default wardrobe", () => {
    check(createDefaultSpec(), "default");
  });

  it("holds for legs, side-mount drawers and a wide rail together", () => {
    const base = createDefaultSpec();
    check(
      {
        ...base,
        carcase: {
          ...base.carcase,
          width: 2400,
          plinth: { ...base.carcase.plinth, type: "legs" },
        },
        drawers: { ...base.drawers, slideId: "side-mount-ballbearing" },
        layout: makeSplit("vertical", [
          {
            size: null,
            node: makeBay({ ...DEFAULT_FITTINGS.hanging, shelfAbove: true }, "Hang"),
          },
          { size: 600, node: makeBay({ ...DEFAULT_FITTINGS.drawers, count: 3 }, "Drawers") },
        ]),
      },
      "mixed",
    );
  });

  it("holds for a cam-fixed carcase", () => {
    const base = createDefaultSpec();
    check(
      { ...base, joinery: { ...base.joinery, connectorId: "cam-15" } },
      "cam",
    );
  });
});
