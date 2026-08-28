import { describe, expect, it } from "vitest";
import { buildAssemblySequence } from "../assembly";
import { advise, adviseUnit } from "../advisor";
import { buildCutList, cutListOfModel } from "../cutlist";
import { nest, nestablePartsOf } from "../cutlist/nesting";
import { holeLayerName } from "../drawing/types";
import { clearProjectCache, cutListInputOf, solveProject } from "../project";
import { createDefaultProject, createDefaultSpec } from "../spec/defaults";
import { PRESETS, PROJECT_PRESETS } from "../spec/presets";
import { solve } from "../solver";
import { bomToCsv, cutListToCsv, drillingToCsv, nestingToCsv } from "./csv";
import { modelToDxfFiles, partToDxf } from "./dxf";
import { buildBooklet } from "./pdf";
import { createZip } from "./zip";

const model = solve(createDefaultSpec());
const cutList = cutListOfModel(model);
const nestResult = nest(nestablePartsOf(model.parts), {
  sheetSizeId: "2800x2070",
  kerf: 3.2,
  trim: 10,
  respectGrain: true,
});
const findings = advise(model);
const project = solveProject(createDefaultProject());

describe("DXF export", () => {
  const side = model.parts.find((part) => part.role === "side");
  if (!side) throw new Error("the default wardrobe has no side panel");
  const dxf = partToDxf(side, "A");

  it("writes a parseable DXF envelope", () => {
    expect(dxf.startsWith("0\nSECTION")).toBe(true);
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
    expect(dxf).toContain("$INSUNITS");
  });

  it("puts holes on a layer named for their diameter", () => {
    const diameters = new Set(
      side.ops.flatMap((op) => (op.kind === "hole" ? [op.diameter] : [])),
    );
    expect(diameters.size).toBeGreaterThan(0);
    for (const diameter of diameters) {
      expect(dxf).toContain(holeLayerName(diameter));
    }
    expect(dxf).toContain("HOLES_D5");
  });

  it("emits one circle per hole on the exported face", () => {
    const expected = side.ops.filter((op) => op.kind === "hole" && op.face === "A").length;
    const circles = dxf.split("\nCIRCLE\n").length - 1;
    expect(circles).toBe(expected);
  });

  it("mirrors face B so the panel can be turned over", () => {
    const faceA = partToDxf(side, "A");
    const faceB = partToDxf(side, "B");
    expect(faceA).not.toBe(faceB);
    expect(faceB).toContain("mirrored about the width axis");
  });

  it("exports a file for every panel", () => {
    const files = modelToDxfFiles(model.parts);
    expect(files.length).toBeGreaterThanOrEqual(model.parts.length);
    for (const file of files) {
      expect(file.filename).toMatch(/^[a-z0-9-]+-face-[AB]\.dxf$/);
      expect(file.content.length).toBeGreaterThan(100);
    }
  });

  it("keeps every hole inside the panel outline", () => {
    for (const part of model.parts) {
      for (const op of part.ops) {
        if (op.kind !== "hole") continue;
        expect(op.l).toBeGreaterThanOrEqual(0);
        expect(op.l).toBeLessThanOrEqual(part.length);
        expect(op.w).toBeGreaterThanOrEqual(0);
        expect(op.w).toBeLessThanOrEqual(part.width);
      }
    }
  });
});

describe("CSV export", () => {
  it("writes one cut list line per row plus a header", () => {
    const csv = cutListToCsv(cutList);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("Qty,Part,Material");
    for (const row of cutList.rows) {
      expect(csv).toContain(row.label.includes(",") ? `"${row.label}"` : row.label);
    }
    expect(csv).toContain("Cost summary");
  });

  it("quotes fields that contain a comma", () => {
    const csv = cutListToCsv(cutList);
    for (const line of csv.split("\r\n")) {
      // An odd number of quotes would mean an unterminated field.
      expect((line.match(/"/g) ?? []).length % 2).toBe(0);
    }
  });

  it("lists every hole in the drilling table", () => {
    const csv = drillingToCsv(model.parts);
    const holes = model.parts.reduce(
      (sum, part) =>
        sum + part.ops.filter((op) => op.kind === "hole" || op.kind === "edge-hole").length,
      0,
    );
    expect(csv.split("\r\n").length).toBe(holes + 1);
  });

  it("writes the hardware BOM with quantities", () => {
    const csv = bomToCsv(cutList);
    expect(cutList.bom.length).toBeGreaterThan(0);
    for (const row of cutList.bom) {
      expect(csv).toContain(String(row.quantity));
    }
  });

  it("writes a nesting placement per part", () => {
    const csv = nestingToCsv(nestResult);
    const placements = nestResult.sheets.reduce((sum, s) => sum + s.placements.length, 0);
    expect(csv).toContain("Cut sequence");
    expect(csv.split("Cut sequence")[0]?.trim().split("\r\n").length).toBe(placements + 1);
  });
});

describe("assembly sequence", () => {
  const sequence = buildAssemblySequence(model);

  it("starts with checking the panels and ends with a final check", () => {
    expect(sequence.steps[0]?.title).toMatch(/cut list/i);
    expect(sequence.steps[sequence.steps.length - 1]?.title).toMatch(/final/i);
  });

  it("numbers the steps consecutively", () => {
    sequence.steps.forEach((step, index) => {
      expect(step.index).toBe(index + 1);
    });
  });

  it("hangs the doors after the carcase is together", () => {
    const carcase = sequence.steps.findIndex((step) => step.title.includes("carcase"));
    const doors = sequence.steps.findIndex((step) => step.title.includes("doors"));
    expect(carcase).toBeGreaterThanOrEqual(0);
    expect(doors).toBeGreaterThan(carcase);
  });

  it("only references parts that exist", () => {
    for (const step of sequence.steps) {
      for (const id of step.partIds) {
        expect(model.partsById.has(id)).toBe(true);
      }
    }
  });

  it("produces a sequence for every preset", () => {
    for (const preset of PRESETS) {
      const built = buildAssemblySequence(solve(preset.build()));
      expect(built.steps.length).toBeGreaterThan(4);
    }
  });
});

describe("zip", () => {
  it("writes a store-only archive with the right signatures", () => {
    const zip = createZip([
      { name: "a.txt", content: "hello" },
      { name: "b.txt", content: "world" },
    ]);
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(zip[2]).toBe(0x03);
    expect(zip[3]).toBe(0x04);
    const text = new TextDecoder().decode(zip);
    expect(text).toContain("hello");
    expect(text).toContain("world");
    expect(text).toContain("a.txt");
  });

  it("does not let two identical filenames collide", () => {
    const zip = createZip([
      { name: "side.dxf", content: "one" },
      { name: "side.dxf", content: "two" },
    ]);
    const text = new TextDecoder().decode(zip);
    expect(text).toContain("side-2.dxf");
  });
});

describe("PDF booklet", () => {
  it("builds a valid PDF covering every section", async () => {
    const bytes = await buildBooklet({
      project,
      cutList,
      nest: nestResult,
      findings,
      sections: { cuttingDiagrams: true, panelPages: true, drillingTable: true, assembly: true },
      date: new Date("2026-01-15T09:00:00Z"),
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(new TextDecoder().decode(bytes.slice(-6)).trim()).toContain("%%EOF");
    // Cover, spec, cut list, sheets, cut sequence, hardware, assembly, panels.
    expect(bytes.length).toBeGreaterThan(40_000);
  }, 120_000);

  it("builds without nesting or optional sections", async () => {
    const bytes = await buildBooklet({
      project,
      cutList,
      nest: null,
      findings: [],
      sections: { cuttingDiagrams: false, panelPages: false, drillingTable: false, assembly: false },
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  }, 60_000);

  /**
   * Every shipped room, all the way to a printable booklet.
   *
   * This is the one test that runs the whole pipeline over every unit kind at once: a folded
   * stainless top, a welded frame with its tube and weld schedules, a drawer bank inside a
   * counter, cladding boards with their fixing holes, and a room plan on the cover. A booklet
   * that throws is the most expensive kind of bug, because it happens at the end of the job.
   */
  for (const preset of PROJECT_PRESETS) {
    it(`builds a booklet for the ${preset.name} preset`, async () => {
      clearProjectCache();
      const solved = solveProject(preset.build());
      const list = buildCutList(cutListInputOf(solved));
      const bytes = await buildBooklet({
        project: solved,
        cutList: list,
        nest: nest(nestablePartsOf(solved.parts), {
          sheetSizeId: solved.spec.production.sheetSizeId,
          kerf: solved.spec.production.kerf,
          trim: solved.spec.production.sheetTrim,
          respectGrain: solved.spec.production.grainPolicy === "respect",
        }),
        findings: solved.units.flatMap((unit) => adviseUnit(unit)),
        sections: { cuttingDiagrams: true, panelPages: true, drillingTable: true, assembly: true },
        date: new Date("2026-01-15T09:00:00Z"),
      });
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
      expect(bytes.length).toBeGreaterThan(40_000);
    }, 180_000);
  }
});

/**
 * A preset is an answer, not a question. Anything the advisor calls an error is something
 * that cannot be built, so shipping one would be telling the user to fix our own work.
 */
describe("no shipped preset is broken by its own advice", () => {
  for (const preset of PROJECT_PRESETS) {
    it(preset.id, () => {
      clearProjectCache();
      const solved = solveProject(preset.build());
      const errors = solved.units
        .flatMap((unit) => adviseUnit(unit).map((finding) => ({ unit, finding })))
        .filter((entry) => entry.finding.severity === "error");
      expect(
        errors.map((entry) => `${entry.unit.name}: ${entry.finding.title}`).join("; "),
      ).toBe("");
    });
  }
});
