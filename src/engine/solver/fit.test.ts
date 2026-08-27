import { describe, expect, it } from "vitest";
import { interpenetration, type Box3 } from "../core/geometry";
import { partBounds } from "../core/part";
import { PRESETS } from "../spec/presets";
import { solve, type WardrobeModel } from ".";

/**
 * Nothing may occupy the same space twice.
 *
 * Every panel is an axis-aligned box, so this is exact rather than an approximation: if
 * two boxes overlap on all three axes, the two panels are inside each other, and either
 * the 3D view shows it or the shop finds out with a saw. The only overlaps allowed are
 * the ones a groove or a rabbet is supposed to produce — a back panel housed in the sides
 * and a drawer bottom housed in its box — and those are shallow by definition, which is
 * what the allowance below is for.
 */
const HOUSING_ALLOWANCE = 10;

type Clash = { readonly a: string; readonly b: string; readonly depth: number };

function clashes(model: WardrobeModel): Clash[] {
  const boxes: { readonly id: string; readonly box: Box3 }[] = model.parts.map((part) => ({
    id: part.id,
    box: partBounds(part),
  }));

  const out: Clash[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i] as { id: string; box: Box3 };
      const b = boxes[j] as { id: string; box: Box3 };
      const depth = interpenetration(a.box, b.box);
      if (depth > HOUSING_ALLOWANCE) out.push({ a: a.id, b: b.id, depth });
    }
  }
  return out;
}

function describeClashes(found: readonly Clash[]): string {
  return found.map((c) => `${c.a} into ${c.b} by ${c.depth.toFixed(1)}mm`).join("; ");
}

describe("no panel is built inside another", () => {
  for (const preset of PRESETS) {
    it(preset.id, () => {
      const found = clashes(solve(preset.build()));
      expect(describeClashes(found)).toBe("");
    });
  }

  it("keeps the rear stretcher clear of the partitions that reach it", () => {
    // The stretcher is fitted in lengths between them, so a two-column layout gets two.
    const model = solve(PRESETS[0]!.build());
    const stretchers = model.parts.filter((part) => part.role === "stretcher");
    expect(stretchers.length).toBe(2);
  });

  it("keeps door leaves off the drawer fronts they would otherwise cover", () => {
    const model = solve(PRESETS[0]!.build());
    const fronts = model.parts.filter((part) => part.role === "drawer-front");
    expect(fronts.length).toBeGreaterThan(0);

    for (const leaf of model.leaves) {
      const covered = fronts
        .map((front) => partBounds(front))
        .filter((box) => box.max[0] > leaf.x0 + 1 && box.min[0] < leaf.x1 - 1);
      for (const box of covered) {
        expect(leaf.y0).toBeGreaterThanOrEqual(box.max[1]);
      }
    }
  });
});
