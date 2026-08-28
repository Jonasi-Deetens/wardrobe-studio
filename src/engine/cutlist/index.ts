import { getBanding, getMaterial, getSheetSize, type Material } from "../catalog/materials";
import type { Member, Weld } from "../core/member";
import {
  bandingLength,
  cutSize,
  faceArea,
  PANEL_EDGES,
  partSignature,
  type Part,
  type PanelEdge,
} from "../core/part";
import { mm2, mm2ToM2, mmToM } from "../core/units";
import type { HardwareUse } from "../solver/draft";
import type { WardrobeModel } from "../solver";
import type { ProductionSpec } from "../spec/types";
import { buildMetalSchedule, type MetalSchedule } from "./tube";

/**
 * One line of the cut list. Identical panels collapse into a single row, but only
 * when their machining matches too: two shelves the same size are the same row, a
 * shelf and a divider that happen to be the same size are not.
 */
export type CutListRow = {
  readonly key: string;
  readonly quantity: number;
  readonly role: Part["role"];
  readonly label: string;
  readonly material: Material;
  /** As-cut size. For a folded part this is the flat blank. */
  readonly length: number;
  readonly width: number;
  /** Set only on a folded part: the size it ends up after bending. */
  readonly finished?: { readonly length: number; readonly width: number };
  readonly folded?: true;
  readonly thickness: number;
  readonly grain: Part["grain"];
  /** Banding name per edge, using the panel's own edge labels. */
  readonly banding: { readonly edge: PanelEdge; readonly label: string; readonly name: string }[];
  readonly bandingMetres: number;
  readonly holeCount: number;
  /** Every part this row stands for, so hovering a row can highlight them all. */
  readonly partIds: readonly string[];
  /**
   * Which units the parts came from. Identical panels in two units collapse into one row
   * of quantity two — that is where the material saving is — so the row has to be able to
   * say where they go.
   */
  readonly unitIds: readonly string[];
};

export type MaterialTotal = {
  readonly material: Material;
  readonly partCount: number;
  readonly area: number;
  readonly sheetsNeeded: number;
  readonly cost: number;
};

export type BomRow = {
  readonly key: string;
  readonly kind: HardwareUse["kind"];
  readonly name: string;
  readonly quantity: number;
  readonly unit: HardwareUse["unit"];
  readonly unitPrice: number;
  readonly total: number;
  readonly notes: readonly string[];
};

export type CutList = {
  readonly rows: readonly CutListRow[];
  readonly materialTotals: readonly MaterialTotal[];
  readonly bom: readonly BomRow[];
  /** Tube schedule, bar nest and weld schedule. Empty for a project with no metalwork. */
  readonly metal: MetalSchedule;
  readonly bandingTotals: readonly {
    readonly id: string;
    readonly name: string;
    readonly metres: number;
    readonly cost: number;
  }[];
  readonly partCount: number;
  readonly holeCount: number;
  readonly panelArea: number;
  readonly materialCost: number;
  readonly hardwareCost: number;
  readonly bandingCost: number;
  /** Stock bars of tube, costed on the bars bought rather than the metres used. */
  readonly metalCost: number;
  readonly labourCost: number;
  readonly totalCost: number;
};

/**
 * What a cut list is made from. Deliberately not a model: one cut list covers a whole
 * room, so it takes the panels, the metalwork and the hardware of every unit in it, and
 * the shop's production settings, which belong to the project rather than to any unit.
 */
export type CutListInput = {
  readonly parts: readonly Part[];
  readonly members: readonly Member[];
  readonly welds: readonly Weld[];
  readonly hardware: readonly HardwareUse[];
  readonly production: ProductionSpec;
};

/** One wardrobe on its own, which is what the solver's own tests and the advisor use. */
export function cutListOfModel(model: WardrobeModel): CutList {
  return buildCutList({
    parts: model.parts,
    members: [],
    welds: [],
    hardware: model.hardware,
    production: model.spec.production,
  });
}

export function buildCutList(input: CutListInput): CutList {
  const { production } = input;
  const grouped = new Map<string, Part[]>();
  for (const part of input.parts) {
    const key = partSignature(part);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(part);
    else grouped.set(key, [part]);
  }

  const rows: CutListRow[] = [...grouped.entries()].map(([key, parts]) => {
    const first = parts[0] as Part;
    const material = getMaterial(first.materialId);
    /* A folded part is cut to its blank, so that is the size that goes on the list; the
       finished size travels alongside it, because that is what has to fit. */
    const size = cutSize(first);
    return {
      key,
      quantity: parts.length,
      role: first.role,
      label: parts.length === 1 ? first.label : commonLabel(parts),
      material,
      length: size.length,
      width: size.width,
      ...(first.blank
        ? { finished: { length: first.length, width: first.width }, folded: true as const }
        : {}),
      thickness: first.thickness,
      grain: first.grain,
      banding: PANEL_EDGES.filter((edge) => first.banding[edge]).map((edge) => ({
        edge,
        label: first.edgeLabels[edge],
        name: getBanding(first.banding[edge] as string).name,
      })),
      bandingMetres: mm2(mmToM(bandingLength(first)) * parts.length * 1000) / 1000,
      holeCount: first.ops.filter(
        (op) => op.kind === "hole" || op.kind === "edge-hole",
      ).length,
      partIds: parts.map((p) => p.id),
      unitIds: [...new Set(parts.map((p) => p.unitId).filter((id): id is string => !!id))],
    };
  });

  rows.sort(
    (a, b) =>
      a.material.thickness - b.material.thickness ||
      a.material.id.localeCompare(b.material.id) ||
      b.length - a.length ||
      b.width - a.width,
  );

  const materialTotals = buildMaterialTotals(production, rows);
  const bandingTotals = buildBandingTotals(input.parts);
  const bom = buildBom(input.hardware);
  const metal = buildMetalSchedule(input.members, input.welds, production);

  const materialCost = materialTotals.reduce((sum, t) => sum + t.cost, 0);
  const bandingCost = bandingTotals.reduce((sum, t) => sum + t.cost, 0);
  const hardwareCost = bom.reduce((sum, r) => sum + r.total, 0);
  /* Panels are cut, banded and drilled; tube is cut and then welded, and the welding is
     the slower half of a metal-framed unit. */
  const minutes =
    input.parts.length * production.minutesPerPanel +
    input.members.length * production.minutesPerMember +
    input.welds.length * production.minutesPerWeld;
  const labourCost = mm2((minutes * production.labourRate) / 60);

  return {
    rows,
    materialTotals,
    bom,
    metal,
    bandingTotals,
    partCount: input.parts.length,
    holeCount: input.parts.reduce(
      (sum, part) =>
        sum +
        part.ops.filter((op) => op.kind === "hole" || op.kind === "edge-hole").length,
      0,
    ),
    panelArea: mm2(input.parts.reduce((sum, part) => sum + mm2ToM2(faceArea(part)), 0) * 100) / 100,
    materialCost: mm2(materialCost),
    hardwareCost: mm2(hardwareCost),
    bandingCost: mm2(bandingCost),
    metalCost: metal.cost,
    labourCost,
    totalCost: mm2(materialCost + bandingCost + hardwareCost + metal.cost + labourCost),
  };
}

/**
 * A label that covers several identical parts. When they all come from the same
 * kind of thing ("Shelf 1", "Shelf 2") the shared prefix reads better than a list.
 */
function commonLabel(parts: readonly Part[]): string {
  const labels = parts.map((p) => p.label);
  const first = labels[0] ?? "";
  const shared = labels.reduce((prefix, label) => {
    let i = 0;
    while (i < prefix.length && i < label.length && prefix[i] === label[i]) i += 1;
    return prefix.slice(0, i);
  }, first);
  const trimmed = shared.replace(/[\s,:-]+$/, "");
  return trimmed.length >= 4 ? trimmed : first;
}

/**
 * Sheet counts here are a first estimate from area plus a waste allowance; the
 * nesting run replaces them with a real figure. The estimate exists so the summary
 * has a number before nesting has finished in its worker.
 */
function buildMaterialTotals(
  production: ProductionSpec,
  rows: readonly CutListRow[],
): MaterialTotal[] {
  const usableAreaOf = (material: Material): number => {
    const sheet = getSheetSize(material.sheetSizeId ?? production.sheetSizeId);
    return (
      (sheet.length - 2 * production.sheetTrim) * (sheet.width - 2 * production.sheetTrim)
    );
  };

  const byMaterial = new Map<string, { material: Material; area: number; count: number }>();
  for (const row of rows) {
    const entry = byMaterial.get(row.material.id) ?? {
      material: row.material,
      area: 0,
      count: 0,
    };
    entry.area += row.length * row.width * row.quantity;
    entry.count += row.quantity;
    byMaterial.set(row.material.id, entry);
  }

  return [...byMaterial.values()]
    .map(({ material, area, count }) => {
      // 15% is a realistic allowance for offcuts before a real nesting run.
      const sheetsNeeded = Math.ceil((area * 1.15) / usableAreaOf(material));
      return {
        material,
        partCount: count,
        area: mm2(mm2ToM2(area) * 100) / 100,
        sheetsNeeded,
        cost: mm2(sheetsNeeded * material.pricePerSheet),
      };
    })
    .sort((a, b) => b.area - a.area);
}

function buildBandingTotals(parts: readonly Part[]) {
  const byId = new Map<string, number>();
  for (const part of parts) {
    for (const edge of PANEL_EDGES) {
      const id = part.banding[edge];
      if (!id) continue;
      const size = cutSize(part);
      const length = edge === "l0" || edge === "l1" ? size.width : size.length;
      byId.set(id, (byId.get(id) ?? 0) + length);
    }
  }

  return [...byId.entries()]
    .map(([id, millimetres]) => {
      const banding = getBanding(id);
      // 10% extra covers the trim at each end of every run.
      const metres = mm2(mmToM(millimetres) * 1.1 * 100) / 100;
      return {
        id,
        name: banding.name,
        metres,
        cost: mm2(metres * banding.pricePerMetre),
      };
    })
    .sort((a, b) => b.metres - a.metres);
}

function buildBom(hardware: readonly HardwareUse[]): BomRow[] {
  const byKey = new Map<string, BomRow>();

  for (const use of hardware) {
    const key = `${use.kind}/${use.catalogId}/${use.name}/${use.unit}`;
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, {
        ...existing,
        quantity: mm2(existing.quantity + use.quantity),
        // Accumulated, not recomputed: two uses can share a key and still have been
        // priced differently, and the running total has to reflect what was billed.
        total: mm2(existing.total + use.quantity * use.unitPrice),
        notes: use.note && !existing.notes.includes(use.note)
          ? [...existing.notes, use.note]
          : existing.notes,
      });
      continue;
    }
    byKey.set(key, {
      key,
      kind: use.kind,
      name: use.name,
      quantity: mm2(use.quantity),
      unit: use.unit,
      unitPrice: use.unitPrice,
      total: mm2(use.quantity * use.unitPrice),
      notes: use.note ? [use.note] : [],
    });
  }

  const KIND_ORDER: readonly HardwareUse["kind"][] = [
    "connector",
    "hinge",
    "hinge-plate",
    "slide",
    "drawer-locking-device",
    "handle",
    "push-latch",
    "rail",
    "rail-support",
    "rail-centre-support",
    "shelf-support",
    "levelling-leg",
    "wall-bracket",
  ];

  return [...byKey.values()].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name),
  );
}

/**
 * Connectors are counted from the machining rather than declared by the rules, so
 * the number in the bill of materials can never drift from the number of holes on
 * the drawings.
 */
export function countConnectors(parts: readonly Part[]): number {
  return parts.reduce(
    (sum, part) =>
      sum +
      part.ops.filter(
        (op) =>
          op.kind === "edge-hole" &&
          (op.purpose === "dowel" ||
            op.purpose === "confirmat" ||
            op.purpose === "cam-bolt" ||
            op.purpose === "lamello"),
      ).length,
    0,
  );
}
