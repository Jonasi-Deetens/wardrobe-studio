import { describe, expect, it } from "vitest";
import { createDefaultSpec } from "./defaults";
import { loadSpec, serialiseSpec } from "./migrate";
import { PRESETS } from "./presets";
import { validateSpec } from "./schema";
import { collectBays } from "./types";

describe("wardrobe spec", () => {
  it("validates the default spec", () => {
    const result = validateSpec(createDefaultSpec());
    expect(result.ok).toBe(true);
  });

  it("validates every preset", () => {
    for (const preset of PRESETS) {
      const result = validateSpec(preset.build());
      if (!result.ok) {
        throw new Error(`Preset ${preset.id} is invalid: ${result.issues.join("; ")}`);
      }
    }
  });

  it("round-trips through JSON without changing anything", () => {
    const spec = createDefaultSpec();
    const loaded = loadSpec(JSON.parse(serialiseSpec(spec)));
    expect(loaded.fatal).toEqual([]);
    expect(loaded.repairs).toEqual([]);
    expect(loaded.spec).toEqual(spec);
  });

  it("fills in fields missing from an older file", () => {
    const spec = createDefaultSpec();
    const partial = JSON.parse(serialiseSpec(spec)) as Record<string, unknown>;
    const carcase = partial["carcase"] as Record<string, unknown>;
    delete carcase["topStretcher"];
    delete carcase["scribe"];
    delete partial["handles"];

    const loaded = loadSpec(partial);
    expect(loaded.fatal).toEqual([]);
    expect(loaded.spec.carcase.topStretcher).toBe(spec.carcase.topStretcher);
    expect(loaded.spec.carcase.scribe).toEqual(spec.carcase.scribe);
    expect(loaded.spec.handles).toEqual(spec.handles);
  });

  it("resets catalogue ids that no longer exist and says so", () => {
    const partial = JSON.parse(serialiseSpec(createDefaultSpec())) as Record<string, unknown>;
    (partial["doors"] as Record<string, unknown>)["hingeId"] = "hinge-from-1997";

    const loaded = loadSpec(partial);
    expect(loaded.fatal).toEqual([]);
    expect(loaded.spec.doors.hingeId).toBe("clip-top-110");
    expect(loaded.repairs.join(" ")).toContain("hinge-from-1997");
  });

  it("refuses a file from a newer spec version rather than guessing", () => {
    const partial = JSON.parse(serialiseSpec(createDefaultSpec())) as Record<string, unknown>;
    partial["version"] = 99;

    const loaded = loadSpec(partial);
    expect(loaded.fatal.length).toBe(1);
    expect(loaded.fatal[0]).toContain("newer version");
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
