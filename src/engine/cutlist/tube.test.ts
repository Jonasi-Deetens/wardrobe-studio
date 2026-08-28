import { describe, expect, it } from "vitest";
import { buildTableFrame } from "../frame";
import { createDefaultProject } from "../spec/defaults";
import { buildMetalSchedule, endLabel, nestBars } from "./tube";
import { SQUARE_END, type Member } from "../core/member";

const production = createDefaultProject().production;

function frame() {
  return buildTableFrame({
    id: "t1",
    width: 1400,
    depth: 700,
    frameHeight: 860,
    legProfileId: "shs-40x40x2-ss",
    railProfileId: "shs-40x40x2-ss",
    legInset: 30,
    railDrop: 60,
    shelfRailHeights: [200],
    footAllowance: 40,
    braced: false,
    ground: true,
  });
}

function tube(id: string, length: number): Member {
  return {
    id,
    unitId: "u1",
    role: "leg",
    label: `Leg ${id}`,
    profileId: "shs-40x40x2",
    length,
    ends: [SQUARE_END, SQUARE_END],
    placement: {
      origin: [0, 0, 0],
      lAxis: [0, 1, 0],
      wAxis: [1, 0, 0],
      tAxis: [0, 0, 1],
    },
    ops: [],
  };
}

describe("the tube schedule", () => {
  const built = frame();
  const schedule = buildMetalSchedule(built.members, built.welds, production);

  it("collapses identical pieces into one row", () => {
    const legs = schedule.rows.find((row) => row.label.toLowerCase().includes("leg"));
    expect(legs?.quantity).toBe(4);
  });

  it("counts every piece and every weld", () => {
    expect(schedule.memberCount).toBe(built.members.length);
    expect(schedule.weldCount).toBe(built.welds.length);
    expect(schedule.weldMetres).toBeGreaterThan(0);
  });

  it("weighs and costs the metal", () => {
    expect(schedule.totalMass).toBeGreaterThan(5);
    expect(schedule.cost).toBeGreaterThan(0);
  });

  it("buys whole bars, so the cost is at least the metal used", () => {
    const used = schedule.rows.reduce(
      (sum, row) => sum + row.metres * row.profile.pricePerMetre,
      0,
    );
    expect(schedule.cost).toBeGreaterThanOrEqual(used - 0.01);
  });

  it("orders bars to buy from the nest, not from the metres", () => {
    for (const total of schedule.profileTotals) {
      const metresBought = total.bars * (total.profile.stockLength / 1000);
      expect(metresBought).toBeGreaterThanOrEqual(total.metres - 0.01);
    }
  });
});

describe("nesting cut lengths into stock bars", () => {
  it("fits pieces that add up to less than a bar into one bar", () => {
    const nest = nestBars([tube("a", 2000), tube("b", 2000), tube("c", 1900)], production);
    expect(nest.bars).toHaveLength(1);
    expect(nest.bars[0]?.cuts).toHaveLength(3);
    expect(nest.bars[0]?.offcut).toBeGreaterThanOrEqual(0);
  });

  it("charges the kerf on every cut, so three 2m pieces do not fit a 6m bar", () => {
    const nest = nestBars([tube("a", 2000), tube("b", 2000), tube("c", 2000)], production);
    expect(nest.bars).toHaveLength(2);
  });

  it("cuts the longest piece first and never overruns the bar", () => {
    const nest = nestBars(
      [tube("a", 900), tube("b", 2600), tube("c", 1200), tube("d", 2600)],
      production,
    );
    for (const bar of nest.bars) {
      expect(bar.used).toBeLessThanOrEqual(bar.stockLength);
      const lengths = bar.cuts.map((cut) => cut.length);
      expect(lengths).toEqual([...lengths].sort((x, y) => y - x));
      /* Each cut starts where the last one ended, kerf included, so the positions can be
         marked straight off the schedule with a tape. */
      bar.cuts.forEach((cut, index) => {
        const previous = bar.cuts[index - 1];
        if (previous) expect(cut.at).toBeCloseTo(previous.at + previous.length + production.barKerf, 3);
        else expect(cut.at).toBe(0);
      });
    }
  });

  it("sets anything longer than a bar aside rather than dropping it", () => {
    const nest = nestBars([tube("a", 8000), tube("b", 1000)], production);
    expect(nest.oversize.map((entry) => entry.memberId)).toEqual(["a"]);
    expect(nest.bars).toHaveLength(1);
  });

  it("numbers bars consecutively across profiles", () => {
    const mixed: Member[] = [
      tube("a", 3000),
      { ...tube("b", 3000), profileId: "shs-50x50x2" },
    ];
    const nest = nestBars(mixed, production);
    expect(nest.bars.map((bar) => bar.index)).toEqual([0, 1]);
  });

  it("keeps every piece, in a bar or in the oversize list", () => {
    const members = [tube("a", 5900), tube("b", 3000), tube("c", 3000), tube("d", 6100)];
    const nest = nestBars(members, production);
    const placed = nest.bars.flatMap((bar) => bar.cuts.map((cut) => cut.memberId));
    expect([...placed, ...nest.oversize.map((entry) => entry.memberId)].sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
});

describe("end cut labels", () => {
  it("names a square end and gives a mitre its angle", () => {
    expect(endLabel(SQUARE_END)).toBe("square");
    expect(endLabel({ kind: "mitre", angle: 45, about: "w" })).toBe("mitre 45°");
  });
});
