import { describe, expect, it } from "vitest";
import { getSheetSize } from "../catalog/materials";
import { createDefaultSpec } from "../spec/defaults";
import { PRESET_BY_ID } from "../spec/presets";
import type { WardrobeSpec } from "../spec/types";
import { solve } from "../solver";
import { buildCutList } from ".";
import { nest, nestablePartsOf, type NestPart } from "./nesting";

const OPTIONS = {
  sheetSizeId: "2800x2070",
  kerf: 3.2,
  trim: 10,
  respectGrain: true,
} as const;

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width - 0.01 &&
    a.x + a.width > b.x + 0.01 &&
    a.y < b.y + b.height - 0.01 &&
    a.y + a.height > b.y + 0.01
  );
}

describe("nesting", () => {
  const model = solve(createDefaultSpec());
  const parts = nestablePartsOf(model.parts);
  const result = nest(parts, OPTIONS);

  it("places every part", () => {
    expect(result.unplaced).toEqual([]);
    const placed = result.sheets.flatMap((s) => s.placements).length;
    expect(placed).toBe(parts.length);
  });

  it("never overlaps two parts on a sheet", () => {
    for (const sheet of result.sheets) {
      for (let i = 0; i < sheet.placements.length; i += 1) {
        for (let j = i + 1; j < sheet.placements.length; j += 1) {
          const a = sheet.placements[i];
          const b = sheet.placements[j];
          if (!a || !b) continue;
          expect(
            overlaps(a, b),
            `${a.label} overlaps ${b.label} on sheet ${sheet.index}`,
          ).toBe(false);
        }
      }
    }
  });

  it("leaves at least a kerf between neighbours", () => {
    for (const sheet of result.sheets) {
      for (const a of sheet.placements) {
        for (const b of sheet.placements) {
          if (a === b) continue;
          // Where two parts share a horizontal band, the gap between them along x
          // has to be at least the kerf, otherwise the saw destroys one of them.
          const sharesBand =
            a.y < b.y + b.height - 0.01 && a.y + a.height > b.y + 0.01;
          if (!sharesBand) continue;
          if (b.x >= a.x + a.width - 0.01) {
            expect(b.x - (a.x + a.width)).toBeGreaterThanOrEqual(OPTIONS.kerf - 0.05);
          }
        }
      }
    }
  });

  it("keeps every part inside the usable area of its sheet", () => {
    for (const sheet of result.sheets) {
      for (const p of sheet.placements) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x + p.width).toBeLessThanOrEqual(sheet.usableLength + 0.01);
        expect(p.y + p.height).toBeLessThanOrEqual(sheet.usableWidth + 0.01);
      }
    }
  });

  it("never rotates a part whose face has a grain direction", () => {
    const grainedIds = new Set(
      parts.filter((p) => p.grain !== "none").map((p) => p.id),
    );
    for (const sheet of result.sheets) {
      for (const p of sheet.placements) {
        if (grainedIds.has(p.partId)) expect(p.rotated).toBe(false);
      }
    }
  });

  it("does rotate a part when the grain policy allows it", () => {
    const tall: NestPart[] = [
      { id: "a", label: "A", length: 2000, width: 400, grain: "length", materialId: "m" },
      { id: "b", label: "B", length: 2000, width: 400, grain: "length", materialId: "m" },
      { id: "c", label: "C", length: 1800, width: 900, grain: "length", materialId: "m" },
    ];
    const respected = nest(tall, { ...OPTIONS, respectGrain: true });
    const ignored = nest(tall, { ...OPTIONS, respectGrain: false });
    expect(respected.sheets.flatMap((s) => s.placements).every((p) => !p.rotated)).toBe(
      true,
    );
    // With grain ignored, the packer is free to turn parts and should do no worse.
    expect(ignored.sheetCount).toBeLessThanOrEqual(respected.sheetCount);
  });

  it("reports a part that is bigger than the sheet rather than dropping it", () => {
    const sheet = getSheetSize(OPTIONS.sheetSizeId);
    const huge: NestPart[] = [
      {
        id: "huge",
        label: "Too big",
        length: sheet.length + 100,
        width: 500,
        grain: "none",
        materialId: "m",
      },
    ];
    const outcome = nest(huge, OPTIONS);
    expect(outcome.unplaced.map((p) => p.id)).toEqual(["huge"]);
    expect(outcome.sheetCount).toBe(0);
  });

  it("gives a waste figure between 0 and 100 percent", () => {
    expect(result.totalWastePercent).toBeGreaterThan(0);
    expect(result.totalWastePercent).toBeLessThan(100);
    for (const sheet of result.sheets) {
      expect(sheet.wastePercent).toBeGreaterThanOrEqual(0);
      expect(sheet.wastePercent).toBeLessThan(100);
    }
  });

  it("produces a guillotine cut sequence that starts with a rip", () => {
    expect(result.cuts.length).toBeGreaterThan(0);
    const firstForSheet = result.cuts.find((c) => c.sheetIndex === 0);
    expect(firstForSheet?.kind).toBe("rip");
  });

  it("never mixes two materials on one sheet", () => {
    const byMaterial = new Map(
      model.parts.map((p) => [p.id, p.materialId] as const),
    );
    for (const sheet of result.sheets) {
      const materials = new Set(
        sheet.placements.map((p) => byMaterial.get(p.partId)),
      );
      expect(materials.size).toBe(1);
      expect([...materials][0]).toBe(sheet.materialId);
    }
  });
});

describe("cut list", () => {
  const model = solve(createDefaultSpec());
  const cutList = buildCutList(model);

  it("accounts for every part exactly once", () => {
    const total = cutList.rows.reduce((sum, row) => sum + row.quantity, 0);
    expect(total).toBe(model.parts.length);
    const ids = cutList.rows.flatMap((row) => row.partIds);
    expect(new Set(ids).size).toBe(model.parts.length);
  });

  it("collapses identical panels into one row", () => {
    // A symmetrical wardrobe: both sides end up with exactly the same machining, so
    // the cut list should ask for two of one panel rather than list them twice.
    const symmetric = PRESET_BY_ID.get("shirts-over-trousers")?.build();
    expect(symmetric).toBeDefined();
    const rows = buildCutList(solve(symmetric as WardrobeSpec)).rows;
    const sides = rows.filter((row) => row.role === "side");
    expect(sides).toHaveLength(1);
    expect(sides[0]?.quantity).toBe(2);
  });

  it("keeps two panels apart when one has extra machining", () => {
    // In the default layout only the right-hand bay has drawers, so only the right
    // side panel is drilled for runners. Telling the shop to cut "2 of" would be a
    // lie, and this is exactly the mistake the signature is there to prevent.
    const sides = cutList.rows.filter((row) => row.role === "side");
    expect(sides).toHaveLength(2);
    expect(sides.every((row) => row.quantity === 1)).toBe(true);
    const holeCounts = sides.map((row) => row.holeCount);
    expect(holeCounts[0]).not.toBe(holeCounts[1]);
  });

  it("does not merge panels that differ only in their machining", () => {
    for (const row of cutList.rows) {
      const parts = row.partIds.map((id) => model.partsById.get(id));
      const holeCounts = new Set(
        parts.map((p) => p?.ops.filter((op) => op.kind === "hole").length),
      );
      expect(holeCounts.size).toBe(1);
    }
  });

  it("lists the hinges, runners and connectors in the bill of materials", () => {
    const kinds = new Set(cutList.bom.map((row) => row.kind));
    expect(kinds.has("hinge")).toBe(true);
    expect(kinds.has("slide")).toBe(true);
    expect(kinds.has("connector")).toBe(true);
    expect(kinds.has("rail")).toBe(true);
  });

  it("counts connectors from the holes actually drilled", () => {
    const connectorRow = cutList.bom.find((row) => row.kind === "connector");
    const edgeHoles = model.parts.reduce(
      (sum, part) =>
        sum + part.ops.filter((op) => op.kind === "edge-hole" && op.purpose === "dowel").length,
      0,
    );
    expect(connectorRow?.quantity).toBe(edgeHoles);
  });

  it("produces a positive cost estimate with every component present", () => {
    expect(cutList.materialCost).toBeGreaterThan(0);
    expect(cutList.hardwareCost).toBeGreaterThan(0);
    expect(cutList.bandingCost).toBeGreaterThan(0);
    expect(cutList.labourCost).toBeGreaterThan(0);
    expect(cutList.totalCost).toBeCloseTo(
      cutList.materialCost + cutList.hardwareCost + cutList.bandingCost + cutList.labourCost,
      1,
    );
  });
});
