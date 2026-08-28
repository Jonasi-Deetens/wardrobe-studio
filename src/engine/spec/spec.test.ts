import { describe, expect, it } from "vitest";
import { createDefaultProject, createDefaultSpec, unitOfWardrobe } from "./defaults";
import { loadSpec, serialiseSpec } from "./migrate";
import { PRESETS, PROJECT_PRESETS } from "./presets";
import { validateProject, validateSpec } from "./schema";
import { collectBays, wardrobeSpecOf, type WardrobeUnitSpec } from "./types";

/** The one wardrobe in a freshly loaded project. */
function firstWardrobe(raw: unknown): WardrobeUnitSpec {
  const loaded = loadSpec(raw);
  const unit = loaded.spec.units[0]?.unit;
  if (!unit || unit.kind !== "wardrobe") throw new Error("expected a wardrobe unit");
  return unit;
}

describe("wardrobe spec", () => {
  it("validates the default wardrobe", () => {
    expect(validateSpec(createDefaultSpec()).ok).toBe(true);
  });

  it("validates every unit preset", () => {
    for (const preset of PRESETS) {
      const result = validateSpec(preset.build());
      if (!result.ok) {
        throw new Error(`Preset ${preset.id} is invalid: ${result.issues.join("; ")}`);
      }
    }
  });

  it("keeps the layout tree intact, including nested splits", () => {
    const spec = createDefaultSpec();
    const bays = collectBays(spec.layout);
    expect(bays.map((b) => b.label)).toEqual(["Long hang", "Shelves", "Drawers"]);
    expect(new Set(bays.map((b) => b.id)).size).toBe(bays.length);
  });

  it("rejects a negative carcase width", () => {
    const spec = createDefaultSpec();
    const result = validateSpec({ ...spec, carcase: { ...spec.carcase, width: -100 } });
    expect(result.ok).toBe(false);
  });
});

describe("project spec", () => {
  it("validates the default project and every project preset", () => {
    expect(validateProject(createDefaultProject()).ok).toBe(true);
    for (const preset of PROJECT_PRESETS) {
      const result = validateProject(preset.build());
      if (!result.ok) {
        throw new Error(`Project preset ${preset.id} is invalid: ${result.issues.join("; ")}`);
      }
    }
  });

  it("round-trips through JSON without changing anything", () => {
    const project = createDefaultProject();
    const loaded = loadSpec(JSON.parse(serialiseSpec(project)));
    expect(loaded.fatal).toEqual([]);
    expect(loaded.repairs).toEqual([]);
    expect(loaded.spec).toEqual(project);
  });

  it("gives every unit a distinct id and distinct bay ids", () => {
    const project = PROJECT_PRESETS[1]?.build();
    if (!project) throw new Error("expected a second project preset");
    expect(project.units).toHaveLength(2);
    expect(new Set(project.units.map((u) => u.id)).size).toBe(2);
    const bayIds = project.units.flatMap((placed) =>
      placed.unit.kind === "wardrobe" ? collectBays(placed.unit.layout).map((b) => b.id) : [],
    );
    expect(new Set(bayIds).size).toBe(bayIds.length);
  });

  it("fills in fields missing from an older file", () => {
    const project = createDefaultProject();
    const partial = JSON.parse(serialiseSpec(project)) as Record<string, unknown>;
    const units = partial["units"] as Record<string, unknown>[];
    const unit = units[0]?.["unit"] as Record<string, unknown>;
    const carcase = unit["carcase"] as Record<string, unknown>;
    delete carcase["topStretcher"];
    delete carcase["scribe"];
    delete unit["handles"];
    delete (partial["room"] as Record<string, unknown>)["roof"];

    const loaded = loadSpec(partial);
    const reference = createDefaultProject();
    const referenceUnit = reference.units[0]?.unit as WardrobeUnitSpec;
    expect(loaded.fatal).toEqual([]);
    const repaired = firstWardrobe(partial);
    expect(repaired.carcase.topStretcher).toBe(referenceUnit.carcase.topStretcher);
    expect(repaired.carcase.scribe).toEqual(referenceUnit.carcase.scribe);
    expect(repaired.handles).toEqual(referenceUnit.handles);
    expect(loaded.spec.room.roof).toEqual(reference.room.roof);
  });

  it("resets catalogue ids that no longer exist and says so", () => {
    const partial = JSON.parse(serialiseSpec(createDefaultProject())) as Record<string, unknown>;
    const units = partial["units"] as Record<string, unknown>[];
    const unit = units[0]?.["unit"] as Record<string, unknown>;
    (unit["doors"] as Record<string, unknown>)["hingeId"] = "hinge-from-1997";

    const loaded = loadSpec(partial);
    expect(loaded.fatal).toEqual([]);
    expect(firstWardrobe(partial).doors.hingeId).toBe("clip-top-110");
    expect(loaded.repairs.join(" ")).toContain("hinge-from-1997");
  });

  it("refuses a file from a newer spec version rather than guessing", () => {
    const partial = JSON.parse(serialiseSpec(createDefaultProject())) as Record<string, unknown>;
    partial["version"] = 99;

    const loaded = loadSpec(partial);
    expect(loaded.fatal.length).toBe(1);
    expect(loaded.fatal[0]).toContain("newer version");
  });
});

describe("version 1 files", () => {
  /** A version 1 file was a bare wardrobe, with meta and production at its root. */
  function v1File(): Record<string, unknown> {
    const spec = createDefaultSpec();
    const raw = JSON.parse(
      JSON.stringify({ ...spec, version: 1, meta: { name: "Bedroom 1", notes: "hi" } }),
    ) as Record<string, unknown>;
    // Cladding did not exist in version 1.
    delete raw["cladding"];
    return raw;
  }

  it("becomes a project holding that one wardrobe, dimensions and layout intact", () => {
    const original = createDefaultSpec();
    const loaded = loadSpec(v1File());

    expect(loaded.fatal).toEqual([]);
    expect(loaded.spec.version).toBe(2);
    expect(loaded.spec.meta.name).toBe("Bedroom 1");
    expect(loaded.spec.units).toHaveLength(1);

    const placed = loaded.spec.units[0];
    expect(placed?.name).toBe("Bedroom 1");
    expect(placed?.at).toEqual({ x: 0, z: 0, yaw: 0 });

    const unit = firstWardrobe(v1File());
    expect(unit.carcase).toEqual(original.carcase);
    expect(unit.layout).toEqual(original.layout);
    expect(unit.doors).toEqual(original.doors);
    expect(unit.cladding.style).toBe("none");
    expect(loaded.spec.production).toEqual(original.production);
  });

  it("resolves back into exactly the wardrobe the solver used to take", () => {
    const loaded = loadSpec(v1File());
    const unit = firstWardrobe(v1File());
    const resolved = wardrobeSpecOf(loaded.spec, unit, "Bedroom 1");

    expect(validateSpec(resolved).ok).toBe(true);
    expect(unitOfWardrobe(resolved)).toEqual(unit);
    expect(resolved.production).toEqual(loaded.spec.production);
    expect(resolved.meta.name).toBe("Bedroom 1");
  });

  it("says it upgraded the file", () => {
    expect(loadSpec(v1File()).repairs.join(" ")).toContain("version 1 to 2");
  });
});
