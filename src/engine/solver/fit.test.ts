import { describe, expect, it } from "vitest";
import { getProfile } from "../catalog/profiles";
import { interpenetration, type Box3 } from "../core/geometry";
import { memberBounds } from "../core/member";
import { partBounds, type Part } from "../core/part";
import { clearProjectCache, solveProject, type UnitModel } from "../project";
import { PRESETS, PROJECT_PRESETS } from "../spec/presets";
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
  return clashesAmong(model.parts);
}

function clashesAmong(parts: readonly Part[], allowance = HOUSING_ALLOWANCE): Clash[] {
  const boxes: { readonly id: string; readonly box: Box3 }[] = parts.map((part) => ({
    id: part.id,
    box: partBounds(part),
  }));

  const out: Clash[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i] as { id: string; box: Box3 };
      const b = boxes[j] as { id: string; box: Box3 };
      const depth = interpenetration(a.box, b.box);
      if (depth > allowance) out.push({ a: a.id, b: b.id, depth });
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

/**
 * The same rule, across the room.
 *
 * It has to run per unit in each unit's own space rather than once over the whole project,
 * for two reasons. A yawed unit's panels are no longer axis-aligned in room space, so their
 * bounding boxes overgrow and would report clashes that do not exist; and two units standing
 * next to each other are *meant* to touch. Whether units run into each other is a coarser
 * question, answered below on their footprints.
 */
describe("no panel is built inside another, anywhere in the room", () => {
  /* A unit made of metal has panels sitting on tube: a top screwed down onto a rail, a shelf
     dropped onto a ring. Those overlap by nothing, but a fold means a panel's box reaches
     down past its own surface, so the allowance is the fold depth rather than a groove's. */
  const METAL_ALLOWANCE = 45;

  for (const preset of PROJECT_PRESETS) {
    it(preset.id, () => {
      clearProjectCache();
      const project = solveProject(preset.build());
      expect(project.units.length).toBeGreaterThan(0);

      for (const unit of project.units) {
        const allowance = unit.kind === "wardrobe" ? HOUSING_ALLOWANCE : METAL_ALLOWANCE;
        const found = clashesAmong(claddingAside(unit), allowance);
        expect(describeClashes(found), `${preset.id} / ${unit.name}`).toBe("");
      }
    });
  }

  /**
   * Cladding is fixed over the outside of the unit, so it is checked on its own.
   *
   * Boards on battens across the face of a carcase genuinely do sit against it, and against
   * each other where a batten crosses a board — that is what fixing something to something
   * means. What must not happen is two boards on top of each other.
   */
  it("keeps the cladding boards clear of one another", () => {
    clearProjectCache();
    const project = solveProject(
      PROJECT_PRESETS.find((preset) => preset.id === "beach-bar")?.build() ??
        PROJECT_PRESETS[0]!.build(),
    );
    const boards = project.parts.filter((part) => part.role === "cladding");
    expect(boards.length).toBeGreaterThan(10);
    expect(describeClashes(clashesAmong(boards, 0))).toBe("");
  });
});

/** Everything the unit is made of, less the skin fixed over the outside of it. */
function claddingAside(unit: UnitModel): Part[] {
  return unit.parts.filter((part) => part.role !== "cladding" && part.role !== "batten");
}

/**
 * Where the units stand.
 *
 * Two coarse checks that the presets have to pass and that a dragged unit can break: nothing
 * pokes through a wall, and no two units try to occupy the same floor. Both are advisor
 * findings in the app rather than errors, because someone measuring a real room may know
 * better; here they are assertions, because a shipped preset that fails them is a bug.
 */
describe("units stand in the room without fouling each other", () => {
  for (const preset of PROJECT_PRESETS) {
    it(`${preset.id}: inside the room`, () => {
      clearProjectCache();
      const project = solveProject(preset.build());
      const room = project.spec.room;

      for (const unit of project.units) {
        const box = unit.bounds;
        expect(box.min[0], `${unit.name} through the left wall`).toBeGreaterThanOrEqual(-1);
        expect(box.min[2], `${unit.name} through the back wall`).toBeGreaterThanOrEqual(-1);
        expect(box.max[0], `${unit.name} through the right wall`).toBeLessThanOrEqual(
          room.width + 1,
        );
        expect(box.max[2], `${unit.name} through the front wall`).toBeLessThanOrEqual(
          room.depth + 1,
        );
        /* Height is checked at the eaves: a pitched roof only ever gives more room. */
        expect(box.max[1], `${unit.name} through the ceiling`).toBeLessThanOrEqual(
          room.height + 1,
        );
      }
    });

    it(`${preset.id}: no two units overlap`, () => {
      clearProjectCache();
      const project = solveProject(preset.build());
      const overlaps: string[] = [];
      for (let i = 0; i < project.units.length; i += 1) {
        for (let j = i + 1; j < project.units.length; j += 1) {
          const a = project.units[i] as UnitModel;
          const b = project.units[j] as UnitModel;
          const depth = interpenetration(a.bounds, b.bounds);
          /* Room-space boxes of yawed units are generous, and units are allowed to be pushed
             right up against each other, so only a real overlap counts. */
          if (depth > 5) overlaps.push(`${a.name} into ${b.name} by ${depth.toFixed(0)}mm`);
        }
      }
      expect(overlaps.join("; ")).toBe("");
    });
  }
});

/** Metalwork has to stay inside the unit too: a leg through the floor is still a bug. */
describe("metalwork stays where the unit says it is", () => {
  for (const preset of PROJECT_PRESETS) {
    it(preset.id, () => {
      clearProjectCache();
      const project = solveProject(preset.build());
      for (const unit of project.units) {
        for (const member of unit.members) {
          const profile = getProfile(member.profileId);
          const box = memberBounds(member, profile);
          expect(box.min[1], `${member.label} below the floor`).toBeGreaterThanOrEqual(-1);
          for (const axis of [0, 2] as const) {
            expect(box.min[axis]).toBeGreaterThanOrEqual(
              (unit.localBounds.min[axis] as number) - 1,
            );
            expect(box.max[axis]).toBeLessThanOrEqual((unit.localBounds.max[axis] as number) + 1);
          }
        }
      }
    });
  }
});
