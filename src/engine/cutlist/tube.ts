import { getProfile, massOf, type Profile } from "../catalog/profiles";
import { memberSignature, type Member, type MemberEnd, type Weld } from "../core/member";
import { mm2, mmToM } from "../core/units";
import type { ProductionSpec } from "../spec/types";

/**
 * What the metal shop gets: a tube schedule, a bar nest, and a weld schedule.
 *
 * The panel side of this app answers "what do I cut from a sheet". Metal asks the same
 * question about a six-metre bar, and two more besides: what angle is each end cut at, and
 * what gets welded to what. A drawing that leaves either out is a drawing somebody has to
 * guess from.
 */

export type TubeRow = {
  readonly key: string;
  readonly quantity: number;
  readonly profile: Profile;
  readonly label: string;
  /** Cut length, long point to long point where an end is mitred. */
  readonly length: number;
  readonly ends: readonly [MemberEnd, MemberEnd];
  readonly holeCount: number;
  /** Metres and kilograms for the quantity in this row. */
  readonly metres: number;
  readonly mass: number;
  readonly cost: number;
  readonly memberIds: readonly string[];
  readonly unitIds: readonly string[];
};

export type ProfileTotal = {
  readonly profile: Profile;
  readonly pieces: number;
  readonly metres: number;
  readonly mass: number;
  /** Bars to buy, from the nest rather than from the metres. */
  readonly bars: number;
  readonly cost: number;
};

/** One stock bar, and the cuts taken out of it in order. */
export type BarLayout = {
  readonly index: number;
  readonly profileId: string;
  readonly stockLength: number;
  readonly cuts: readonly {
    readonly memberId: string;
    readonly label: string;
    readonly length: number;
    /** Distance from the start of the bar to this cut's near end. */
    readonly at: number;
  }[];
  /** Metal used, cuts and saw losses together. */
  readonly used: number;
  /** What is left on the end of the bar. */
  readonly offcut: number;
};

export type BarNest = {
  readonly bars: readonly BarLayout[];
  /** Members longer than a stock bar, which have to be joined or bought special. */
  readonly oversize: readonly { readonly memberId: string; readonly label: string; readonly length: number }[];
  readonly wastePercent: number;
  /** The bar length asked for. Individual bars may be longer where the profile only comes longer. */
  readonly stockLength: number;
};

export type WeldRow = {
  readonly key: string;
  readonly kind: Weld["kind"];
  readonly size: number;
  readonly ground: boolean;
  readonly count: number;
  /** Total run of weld, in metres. */
  readonly metres: number;
  readonly examples: readonly string[];
};

export type MetalSchedule = {
  readonly rows: readonly TubeRow[];
  readonly profileTotals: readonly ProfileTotal[];
  readonly nest: BarNest;
  readonly welds: readonly WeldRow[];
  readonly memberCount: number;
  readonly weldCount: number;
  readonly weldMetres: number;
  readonly totalMass: number;
  readonly cost: number;
};

const EMPTY_NEST: BarNest = { bars: [], oversize: [], wastePercent: 0, stockLength: 6000 };

export const EMPTY_METAL: MetalSchedule = {
  rows: [],
  profileTotals: [],
  nest: EMPTY_NEST,
  welds: [],
  memberCount: 0,
  weldCount: 0,
  weldMetres: 0,
  totalMass: 0,
  cost: 0,
};

export function buildMetalSchedule(
  members: readonly Member[],
  welds: readonly Weld[],
  production: ProductionSpec,
): MetalSchedule {
  if (members.length === 0 && welds.length === 0) return EMPTY_METAL;

  const grouped = new Map<string, Member[]>();
  for (const member of members) {
    const key = memberSignature(member);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(member);
    else grouped.set(key, [member]);
  }

  const rows: TubeRow[] = [...grouped.entries()].map(([key, group]) => {
    const first = group[0] as Member;
    const profile = getProfile(first.profileId);
    const metres = mm2(mmToM(first.length) * group.length * 1000) / 1000;
    const mass = mm2(massOf(profile, first.length) * group.length * 100) / 100;
    return {
      key,
      quantity: group.length,
      profile,
      label: group.length === 1 ? first.label : commonLabel(group),
      length: first.length,
      ends: first.ends,
      holeCount: first.ops.length,
      metres,
      mass,
      cost: mm2(metres * profile.pricePerMetre),
      memberIds: group.map((member) => member.id),
      unitIds: [
        ...new Set(group.map((member) => member.unitId).filter((id): id is string => !!id)),
      ],
    };
  });

  rows.sort(
    (a, b) =>
      a.profile.id.localeCompare(b.profile.id) || b.length - a.length || a.label.localeCompare(b.label),
  );

  const nest = nestBars(members, production);
  const weldRows = buildWeldSchedule(welds);

  const profileTotals = buildProfileTotals(rows, nest);

  return {
    rows,
    profileTotals,
    nest,
    welds: weldRows,
    memberCount: members.length,
    weldCount: welds.length,
    weldMetres: mm2(weldRows.reduce((sum, row) => sum + row.metres, 0) * 100) / 100,
    totalMass: mm2(rows.reduce((sum, row) => sum + row.mass, 0) * 10) / 10,
    /* Costed on the bars bought rather than the metres used: a 900mm leg cut from a 6m bar
       is paid for as part of that bar, and the offcut is the shop's problem. */
    cost: mm2(profileTotals.reduce((sum, total) => sum + total.cost, 0)),
  };
}

function buildProfileTotals(
  rows: readonly TubeRow[],
  nest: BarNest,
): ProfileTotal[] {
  const byProfile = new Map<string, { profile: Profile; pieces: number; metres: number; mass: number }>();
  for (const row of rows) {
    const entry = byProfile.get(row.profile.id) ?? {
      profile: row.profile,
      pieces: 0,
      metres: 0,
      mass: 0,
    };
    entry.pieces += row.quantity;
    entry.metres += row.metres;
    entry.mass += row.mass;
    byProfile.set(row.profile.id, entry);
  }

  return [...byProfile.values()]
    .map(({ profile, pieces, metres, mass }) => {
      const bars = nest.bars.filter((bar) => bar.profileId === profile.id).length;
      return {
        profile,
        pieces,
        metres: mm2(metres * 100) / 100,
        mass: mm2(mass * 10) / 10,
        bars,
        cost: mm2(bars * mmToM(profile.stockLength) * profile.pricePerMetre),
      };
    })
    .sort((a, b) => b.metres - a.metres);
}

/**
 * First-fit-decreasing into stock bars, per profile.
 *
 * The longest piece goes into the first bar it fits in, and so on down. For cutting bars
 * this heuristic is within a few per cent of optimal and it has the property that matters
 * in a workshop: the order is stable and readable, so a cutting list can be worked through
 * from the top without deciding anything.
 *
 * The saw kerf is charged on every cut, and the last cut on a bar takes it too — the offcut
 * end is not free.
 */
export function nestBars(members: readonly Member[], production: ProductionSpec): BarNest {
  const oversize: { memberId: string; label: string; length: number }[] = [];
  const bars: BarLayout[] = [];
  const kerf = production.barKerf;

  const byProfile = new Map<string, Member[]>();
  for (const member of members) {
    const bucket = byProfile.get(member.profileId);
    if (bucket) bucket.push(member);
    else byProfile.set(member.profileId, [member]);
  }

  for (const [profileId, group] of [...byProfile.entries()].sort()) {
    const profile = getProfile(profileId);
    /* A bar can be bought longer than the shop's default, so the profile's own stock length
       wins where it is longer — round tube in particular comes in 6m and not much else. */
    const stock = Math.max(production.stockBarLength, 0) || profile.stockLength;
    const open: { layout: BarLayout; remaining: number }[] = [];

    for (const member of [...group].sort((a, b) => b.length - a.length)) {
      const needed = member.length + kerf;
      if (member.length > stock) {
        oversize.push({ memberId: member.id, label: member.label, length: member.length });
        continue;
      }

      let target = open.find((bar) => bar.remaining >= needed);
      if (!target) {
        const layout: BarLayout = {
          index: bars.length,
          profileId,
          stockLength: stock,
          cuts: [],
          used: 0,
          offcut: stock,
        };
        target = { layout, remaining: stock };
        open.push(target);
        bars.push(layout);
      }

      const at = target.layout.used;
      const cuts = [
        ...target.layout.cuts,
        { memberId: member.id, label: member.label, length: member.length, at },
      ];
      const used = mm2(at + needed);
      const updated: BarLayout = {
        ...target.layout,
        cuts,
        used,
        offcut: mm2(stock - used),
      };
      bars[bars.indexOf(target.layout)] = updated;
      target.layout = updated;
      target.remaining = stock - used;
    }
  }

  const bought = bars.reduce((sum, bar) => sum + bar.stockLength, 0);
  const cut = bars.reduce(
    (sum, bar) => sum + bar.cuts.reduce((inner, entry) => inner + entry.length, 0),
    0,
  );

  return {
    /* Renumbered after the fact: bars are created per profile, and a cutting list that
       jumps from bar 3 to bar 7 and back invites somebody to cut the wrong one. */
    bars: bars.map((bar, index) => ({ ...bar, index })),
    oversize,
    wastePercent: bought === 0 ? 0 : mm2(((bought - cut) / bought) * 1000) / 10,
    stockLength: Math.max(production.stockBarLength, 0) || 6000,
  };
}

/**
 * Welds, grouped by what they are rather than by where they are.
 *
 * A fabricator wants to know how many 3mm fillets there are and how many have to be ground
 * flush, because grinding is what the time goes on — a ground joint on a visible stainless
 * corner costs about as long again as the weld itself.
 */
export function buildWeldSchedule(welds: readonly Weld[]): WeldRow[] {
  const byKey = new Map<string, WeldRow>();
  for (const weld of welds) {
    const key = `${weld.kind}/${weld.size}/${weld.ground ? "ground" : "as-welded"}`;
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, {
        ...existing,
        count: existing.count + 1,
        metres: mm2((existing.metres + mmToM(weld.length)) * 1000) / 1000,
        examples:
          existing.examples.length < 3 && !existing.examples.includes(weld.label)
            ? [...existing.examples, weld.label]
            : existing.examples,
      });
      continue;
    }
    byKey.set(key, {
      key,
      kind: weld.kind,
      size: weld.size,
      ground: weld.ground,
      count: 1,
      metres: mm2(mmToM(weld.length) * 1000) / 1000,
      examples: [weld.label],
    });
  }

  return [...byKey.values()].sort(
    (a, b) => b.count - a.count || a.size - b.size || Number(a.ground) - Number(b.ground),
  );
}

function commonLabel(members: readonly Member[]): string {
  const labels = members.map((member) => member.label);
  const first = labels[0] ?? "";
  const shared = labels.reduce((prefix, label) => {
    let i = 0;
    while (i < prefix.length && i < label.length && prefix[i] === label[i]) i += 1;
    return prefix.slice(0, i);
  }, first);
  const trimmed = shared.replace(/[\s,:-]+$/, "");
  return trimmed.length >= 4 ? trimmed : first;
}

/** How an end cut reads on a schedule: "square" or "mitre 45°". */
export function endLabel(end: MemberEnd): string {
  if (end.kind === "square") return "square";
  return `${end.kind} ${mm2(end.angle)}°`;
}
