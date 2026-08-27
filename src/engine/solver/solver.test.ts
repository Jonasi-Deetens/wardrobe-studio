import { describe, expect, it } from "vitest";
import { getMaterial } from "../catalog/materials";
import { partBounds, type Part } from "../core/part";
import { isMultipleOf } from "../core/units";
import { createDefaultSpec } from "../spec/defaults";
import { PRESETS } from "../spec/presets";
import { solve } from ".";
import { hingeOverlay, hingePositions } from "./doors";
import { drawerFrontHeights } from "./fittings";
import { systemDepth, systemHeight } from "./frame";

function partsOfRole(parts: readonly Part[], role: Part["role"]): Part[] {
  return parts.filter((p) => p.role === role);
}

describe("frame sizing", () => {
  it("makes the side panel span a multiple of 32 plus half a thickness each end", () => {
    // 19mm board: half thickness is 9.5, so the classic answer is 1984 + 19 = 2003.
    expect(systemHeight(2000, 9.5)).toBe(2003);
    expect(isMultipleOf(systemHeight(2000, 9.5) - 19, 32)).toBe(true);
  });

  it("puts both system rows 37mm from their edge with a multiple of 32 between", () => {
    // The worked example from the System 32 design guide: 600 becomes 586.
    expect(systemDepth(600, 37, 37)).toBe(586);
    expect(isMultipleOf(systemDepth(600, 37, 37) - 74, 32)).toBe(true);
  });

  it("reports what it changed rather than silently resizing", () => {
    const model = solve({ ...createDefaultSpec() });
    const heightNote = model.frame.snapNotes.find((n) => n.parameter === "carcase.height");
    expect(heightNote).toBeDefined();
    expect(heightNote?.requested).toBe(2200);
    expect(model.frame.built.height).toBe(heightNote?.built);
  });

  it("leaves the dimensions alone when snapping is off", () => {
    const spec = createDefaultSpec();
    const model = solve({
      ...spec,
      carcase: { ...spec.carcase, snapToSystemGrid: false },
    });
    expect(model.frame.snapNotes).toEqual([]);
    expect(model.frame.built).toEqual({ width: 1800, height: 2200, depth: 620 });
  });
});

describe("carcase geometry", () => {
  const model = solve(createDefaultSpec());
  const t = getMaterial(createDefaultSpec().carcase.panelMaterialId).thickness;

  it("builds two sides, a top, a bottom and a back", () => {
    expect(partsOfRole(model.parts, "side")).toHaveLength(2);
    expect(partsOfRole(model.parts, "top")).toHaveLength(1);
    expect(partsOfRole(model.parts, "bottom")).toHaveLength(1);
    expect(partsOfRole(model.parts, "back")).toHaveLength(1);
  });

  it("captures the top and bottom between the sides, not the other way round", () => {
    const top = partsOfRole(model.parts, "top")[0];
    const bottom = partsOfRole(model.parts, "bottom")[0];
    expect(top).toBeDefined();
    expect(bottom).toBeDefined();
    // Finished length plus the banding is the clear span between the two sides.
    const clear = model.frame.built.width - 2 * t;
    expect(top?.length).toBeCloseTo(clear, 1);
    expect(bottom?.length).toBeCloseTo(clear, 1);
  });

  it("runs the sides the full height of the carcase", () => {
    const sides = partsOfRole(model.parts, "side");
    expect(sides).toHaveLength(2);
    for (const side of sides) {
      // The as-cut panel is smaller than the space it fills by the banding on the
      // top edge, which is added back when the edge is applied.
      const bandingAllowance = (side.banding.l0 ? 1 : 0) + (side.banding.l1 ? 1 : 0);
      expect(side.length + bandingAllowance).toBeCloseTo(
        model.frame.built.height - model.frame.sideBottomY,
        1,
      );
    }
  });

  it("keeps every part inside the wardrobe footprint", () => {
    for (const part of model.parts) {
      const bounds = partBounds(part);
      expect(bounds.min[0]).toBeGreaterThanOrEqual(-1);
      expect(bounds.max[0]).toBeLessThanOrEqual(model.frame.built.width + 1);
      expect(bounds.min[1]).toBeGreaterThanOrEqual(-1);
      expect(bounds.max[1]).toBeLessThanOrEqual(model.frame.built.height + 1);
    }
  });

  it("gives every part a unique id", () => {
    const ids = model.parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every machining operation inside its panel", () => {
    for (const part of model.parts) {
      for (const op of part.ops) {
        if (op.kind === "hole") {
          expect(op.l, `${part.id} ${op.id} l`).toBeGreaterThanOrEqual(-0.5);
          expect(op.l, `${part.id} ${op.id} l`).toBeLessThanOrEqual(part.length + 0.5);
          expect(op.w, `${part.id} ${op.id} w`).toBeGreaterThanOrEqual(-0.5);
          expect(op.w, `${part.id} ${op.id} w`).toBeLessThanOrEqual(part.width + 0.5);
        }
        if (op.kind === "edge-hole") {
          const limit = op.edge === "l0" || op.edge === "l1" ? part.width : part.length;
          expect(op.along, `${part.id} ${op.id}`).toBeGreaterThanOrEqual(-0.5);
          expect(op.along, `${part.id} ${op.id}`).toBeLessThanOrEqual(limit + 0.5);
        }
      }
    }
  });

  it("never drills a hole deeper than the panel it goes into", () => {
    for (const part of model.parts) {
      for (const op of part.ops) {
        if (op.kind !== "hole" || op.through) continue;
        expect(op.depth, `${part.id} ${op.id}`).toBeLessThanOrEqual(part.thickness + 0.01);
      }
    }
  });
});

describe("system holes", () => {
  const model = solve(createDefaultSpec());

  it("puts the front row 37mm from the finished front edge", () => {
    const side = model.parts.find((p) => p.id === "side-left");
    expect(side).toBeDefined();
    const systemHoles = (side?.ops ?? []).filter(
      (op) => op.kind === "hole" && op.purpose === "system-hole",
    );
    expect(systemHoles.length).toBeGreaterThan(20);

    const banding = side?.banding.w0 ? 1 : 0;
    const frontRow = systemHoles.filter(
      (op) => op.kind === "hole" && Math.abs(op.w - (37 - banding)) < 0.05,
    );
    expect(frontRow.length).toBeGreaterThan(10);
  });

  it("spaces the holes 32mm apart", () => {
    const side = model.parts.find((p) => p.id === "side-left");
    const ls = [
      ...new Set(
        (side?.ops ?? [])
          .filter((op) => op.kind === "hole" && op.purpose === "system-hole")
          .map((op) => (op.kind === "hole" ? op.l : 0)),
      ),
    ].sort((a, b) => a - b);

    for (let i = 1; i < ls.length; i += 1) {
      expect((ls[i] as number) - (ls[i - 1] as number)).toBeCloseTo(32, 2);
    }
  });

  it("makes both hole rows symmetrical about the panel", () => {
    const side = model.parts.find((p) => p.id === "side-left");
    expect(side).toBeDefined();
    const ls = (side?.ops ?? [])
      .filter((op) => op.kind === "hole" && op.purpose === "system-hole")
      .map((op) => (op.kind === "hole" ? op.l : 0));
    const first = Math.min(...ls);
    const last = Math.max(...ls);
    expect(first).toBeCloseTo((side?.length ?? 0) - last, 1);
  });
});

describe("hinges", () => {
  it("uses the manufacturer's overlay relation", () => {
    // Fixed distance 11, bored at 4.5, on a 3mm plate.
    expect(hingeOverlay(11, 4.5, 3)).toBe(12.5);
    // A thicker plate pulls the leaf closer to the carcase.
    expect(hingeOverlay(11, 4.5, 9)).toBe(6.5);
  });

  it("counts hinges by leaf height", () => {
    const model = solve(createDefaultSpec());
    for (const leaf of model.leaves) {
      // The default carcase is over 2000mm, so a leaf needs five hinges.
      expect(leaf.hingeCount).toBeGreaterThanOrEqual(4);
      expect(leaf.hingeYs).toHaveLength(leaf.hingeCount);
    }
  });

  it("pulls hinge positions onto the 32mm grid so the plate lands on a system hole", () => {
    const positions = hingePositions(100, 2000, 4, 96, 9.5);
    for (const y of positions) {
      expect(isMultipleOf(y - 9.5, 32)).toBe(true);
    }
  });

  it("drills a 35mm cup and two 8mm fixings per hinge in the leaf", () => {
    const model = solve(createDefaultSpec());
    const leaf = model.leaves[0];
    expect(leaf).toBeDefined();
    const door = model.partsById.get(leaf?.partId ?? "");
    const cups = (door?.ops ?? []).filter(
      (op) => op.kind === "hole" && op.purpose === "hinge-cup",
    );
    const fixings = (door?.ops ?? []).filter(
      (op) => op.kind === "hole" && op.purpose === "hinge-cup-fixing",
    );
    expect(cups).toHaveLength(leaf?.hingeCount ?? 0);
    expect(fixings).toHaveLength((leaf?.hingeCount ?? 0) * 2);
    for (const cup of cups) {
      if (cup.kind !== "hole") continue;
      expect(cup.diameter).toBe(35);
      expect(cup.depth).toBe(13);
    }
  });

  it("puts the mounting plate holes on the carcase panel the leaf hangs on", () => {
    const model = solve(createDefaultSpec());
    const plateHoles = model.parts.flatMap((p) =>
      p.ops.filter((op) => op.kind === "hole" && op.purpose === "hinge-plate"),
    );
    const expected = model.leaves.reduce((sum, l) => sum + l.hingeCount * 2, 0);
    expect(plateHoles).toHaveLength(expected);
  });
});

describe("drawers", () => {
  it("makes front heights multiples of 32 less the gap", () => {
    const heights = drawerFrontHeights(
      { kind: "drawers", count: 3, frontHeights: null, dividers: 0, hasFronts: true },
      700,
      3,
    );
    expect(heights).toHaveLength(3);
    // Every front but the first is a clean 32n - gap.
    for (const h of heights.slice(1)) {
      expect(isMultipleOf(h + 3, 32)).toBe(true);
    }
    expect(heights.reduce((a, b) => a + b, 0) + 2 * 3).toBeCloseTo(700, 1);
  });

  it("takes the runner clearance out of the box width", () => {
    const model = solve(createDefaultSpec());
    expect(model.drawers.length).toBeGreaterThan(0);
    for (const drawer of model.drawers) {
      const bay = model.bays.find((b) => b.id === drawer.bayId);
      expect(bay).toBeDefined();
      // 49mm for a pair of undermount runners.
      expect(drawer.boxOutsideWidth).toBeCloseTo((bay?.clearWidth ?? 0) - 49, 1);
    }
  });

  it("builds a box of four sides plus a bottom for every drawer", () => {
    const model = solve(createDefaultSpec());
    for (const drawer of model.drawers) {
      for (const suffix of [
        "side-left",
        "side-right",
        "box-front",
        "box-back",
        "bottom",
      ]) {
        expect(
          model.partsById.get(`${drawer.id}-${suffix}`),
          `${drawer.id}-${suffix}`,
        ).toBeDefined();
      }
    }
  });
});

describe("layout", () => {
  it("creates a divider for a vertical split and a shelf for a horizontal one", () => {
    const model = solve(createDefaultSpec());
    // The default layout is one vertical split with a nested horizontal split.
    expect(partsOfRole(model.parts, "divider")).toHaveLength(1);
    expect(partsOfRole(model.parts, "fixed-shelf").length).toBeGreaterThanOrEqual(1);
  });

  it("shares the width between bays after taking out the divider", () => {
    const model = solve(createDefaultSpec());
    const t = model.frame.thickness;
    const clear = model.frame.interior.x1 - model.frame.interior.x0;
    const bayWidths = new Set(model.bays.map((b) => Math.round(b.clearWidth)));
    const expected = Math.round((clear - t) / 2);
    expect(bayWidths.has(expected)).toBe(true);
  });

  it("joins a nested shelf to the divider next to it, not to the carcase side", () => {
    const model = solve(createDefaultSpec());
    const nested = model.joints.filter(
      (j) => j.throughPartId.includes("divider") && j.abuttingPartId.includes("shelf"),
    );
    expect(nested.length).toBeGreaterThan(0);
  });
});

describe("every preset solves", () => {
  for (const preset of PRESETS) {
    it(preset.name, () => {
      const model = solve(preset.build());
      expect(model.parts.length).toBeGreaterThan(3);
      for (const part of model.parts) {
        expect(part.length, `${part.id} length`).toBeGreaterThan(0);
        expect(part.width, `${part.id} width`).toBeGreaterThan(0);
        expect(part.thickness, `${part.id} thickness`).toBeGreaterThan(0);
        expect(Number.isFinite(part.length)).toBe(true);
        expect(Number.isFinite(part.width)).toBe(true);
      }
    });
  }
});
