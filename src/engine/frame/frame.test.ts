import { describe, expect, it } from "vitest";
import { getProfile } from "../catalog/profiles";
import { boxOfPoints } from "../core/geometry";
import { memberCorners } from "../core/member";
import { buildRectFrame, buildTableFrame, endAgainstFace } from ".";

/**
 * The two things a fabricator would check on a drawing before cutting anything: that the
 * angles are right, and that the parts add up to the outside dimensions.
 */

const LEG = "shs-40x40x2-ss";
const RAIL = "rhs-40x20x2-ss";

describe("a welded rectangular frame", () => {
  const frame = buildRectFrame({
    id: "f",
    profileId: "shs-30x30x2",
    width: 1200,
    height: 800,
    plane: "xy",
    origin: [0, 0, 0],
    corners: "mitred",
  });

  it("mitres every corner at half the included angle", () => {
    for (const member of frame.members) {
      for (const end of member.ends) {
        expect(end.kind).toBe("mitre");
        expect(end.angle).toBe(45);
      }
    }
  });

  it("cuts mitred members to the outside dimension, long point to long point", () => {
    const lengths = frame.members.map((member) => member.length).sort((a, b) => a - b);
    expect(lengths).toEqual([800, 800, 1200, 1200]);
  });

  it("stays inside the rectangle it was asked for", () => {
    const box = frame.bounds;
    expect(box.min[0]).toBeCloseTo(0, 3);
    expect(box.min[1]).toBeCloseTo(0, 3);
    expect(box.max[0]).toBeCloseTo(1200, 3);
    expect(box.max[1]).toBeCloseTo(800, 3);
  });

  it("welds all four corners", () => {
    expect(frame.welds).toHaveLength(4);
    for (const weld of frame.welds) expect(weld.size).toBeGreaterThanOrEqual(3);
  });

  it("cuts butt-jointed uprights to fit between the rails", () => {
    const butt = buildRectFrame({
      id: "b",
      profileId: "shs-30x30x2",
      width: 1200,
      height: 800,
      plane: "xy",
      origin: [0, 0, 0],
      corners: "butt",
    });
    const upright = butt.members.find((member) => member.id === "b-left");
    expect(upright?.length).toBe(800 - 2 * 30);
    for (const end of upright?.ends ?? []) expect(end.kind).toBe("square");
  });
});

describe("a four-leg table frame", () => {
  const frame = buildTableFrame({
    id: "t",
    width: 1400,
    depth: 700,
    frameHeight: 880,
    legProfileId: LEG,
    railProfileId: RAIL,
    legInset: 40,
    railDrop: 20,
    shelfRailHeights: [220],
    footAllowance: 30,
    braced: false,
    ground: true,
  });

  const legs = frame.members.filter((member) => member.role === "leg");

  it("stands on four legs, cut short by the adjustable feet", () => {
    expect(legs).toHaveLength(4);
    for (const leg of legs) {
      expect(leg.length).toBe(880 - 30);
      /* The foot needs a thread in the bottom of the leg, and a leg with no hole in the
         drawing is a leg somebody has to work out for themselves. */
      expect(leg.ops.some((op) => op.purpose === "foot-thread")).toBe(true);
    }
  });

  it("cuts every rail square, to the clear distance between the legs", () => {
    const leg = getProfile(LEG);
    const rails = frame.members.filter((member) => member.role !== "leg");
    const longSpan = 1400 - 2 * 40 - 2 * leg.width;
    const shortSpan = 700 - 2 * 40 - 2 * leg.height;

    for (const rail of rails) {
      for (const end of rail.ends) expect(end.kind).toBe("square");
      expect([longSpan, shortSpan]).toContain(rail.length);
    }
    /* Two rings of four: one under the top, one for the undershelf. */
    expect(rails).toHaveLength(8);
  });

  it("keeps every member inside the footprint and under the top", () => {
    for (const member of frame.members) {
      const profile = getProfile(member.profileId);
      const box = boxOfPoints(
        memberCorners(member, { width: profile.width, height: profile.height }),
      );
      expect(box.min[0]).toBeGreaterThanOrEqual(-0.01);
      expect(box.min[2]).toBeGreaterThanOrEqual(-0.01);
      expect(box.max[0]).toBeLessThanOrEqual(1400.01);
      expect(box.max[2]).toBeLessThanOrEqual(700.01);
      expect(box.max[1]).toBeLessThanOrEqual(880.01);
    }
  });

  it("welds every rail to a leg at both ends", () => {
    const rails = frame.members.filter((member) => member.role !== "leg");
    for (const rail of rails) {
      expect(frame.welds.filter((weld) => weld.b === rail.id)).toHaveLength(2);
    }
    for (const weld of frame.welds) expect(weld.ground).toBe(true);
  });

  it("mitres a brace at the angle it meets the leg", () => {
    const braced = buildTableFrame({
      id: "b",
      width: 1400,
      depth: 700,
      frameHeight: 880,
      legProfileId: LEG,
      railProfileId: RAIL,
      legInset: 40,
      railDrop: 20,
      shelfRailHeights: [],
      footAllowance: 30,
      braced: true,
      ground: false,
    });
    const braces = braced.members.filter((member) => member.role === "brace");
    expect(braces).toHaveLength(2);
    for (const brace of braces) {
      for (const end of brace.ends) {
        expect(end.kind).toBe("mitre");
        expect(end.angle).toBeGreaterThan(20);
        expect(end.angle).toBeLessThan(70);
      }
    }
  });
});

describe("the cut on an end landing against a face", () => {
  it("is square when the member arrives perpendicular to it", () => {
    expect(endAgainstFace([0, 0, 1], [0, 0, 1]).kind).toBe("square");
  });

  it("is 45 degrees for a member at 45 degrees", () => {
    const axis = [0, Math.SQRT1_2, Math.SQRT1_2] as const;
    expect(endAgainstFace(axis, [0, 0, 1]).angle).toBeCloseTo(45, 1);
  });

  it("follows the angle between the member and the face's normal", () => {
    const radians = (30 * Math.PI) / 180;
    const axis = [0, Math.sin(radians), Math.cos(radians)] as const;
    expect(endAgainstFace(axis, [0, 0, 1]).angle).toBeCloseTo(30, 1);
  });
});
