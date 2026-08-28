import { describe, expect, it } from "vitest";
import { interpenetration, translateBox, type Box3, type Vec3 } from "@/engine/core/geometry";
import { partBounds } from "@/engine/core/part";
import { PRESETS } from "@/engine/spec/presets";
import { solve } from "@/engine/solver";
import { explodeOffset, sceneBounds } from "./scene";

/**
 * An exploded view is only useful if it takes the wardrobe apart. A part that travels
 * into its neighbour instead is worse than no explode at all, so the same
 * no-two-panels-inside-each-other rule the solver is held to applies at every position of
 * the slider.
 */
const HOUSING_ALLOWANCE = 10;

describe("the exploded view separates parts rather than driving them together", () => {
  for (const preset of PRESETS) {
    it(preset.id, () => {
      const model = solve(preset.build());
      const bounds = sceneBounds(model.bounds);

      for (const factor of [0.15, 0.4, 0.7, 1]) {
        const boxes = model.parts.map((part) => {
          const offset = explodeOffset(part, bounds, factor);
          const by: Vec3 = [offset.x, offset.y, offset.z];
          return { id: part.id, box: translateBox(partBounds(part), by) };
        });

        const clashes: string[] = [];
        for (let i = 0; i < boxes.length; i += 1) {
          for (let j = i + 1; j < boxes.length; j += 1) {
            const a = boxes[i] as { id: string; box: Box3 };
            const b = boxes[j] as { id: string; box: Box3 };
            const depth = interpenetration(a.box, b.box);
            if (depth > HOUSING_ALLOWANCE) {
              clashes.push(`${a.id} into ${b.id} by ${depth.toFixed(1)}mm`);
            }
          }
        }
        expect(clashes.join("; "), `at explode ${factor}`).toBe("");
      }
    });
  }

  it("leaves nothing where it started", () => {
    const model = solve(PRESETS[0]!.build());
    const bounds = sceneBounds(model.bounds);
    const moved = model.parts.filter((part) => explodeOffset(part, bounds, 1).length() > 1);
    // Parts sitting on the centre of the wardrobe have nowhere to go, but almost
    // everything should have moved.
    expect(moved.length).toBeGreaterThan(model.parts.length * 0.9);
  });
});
