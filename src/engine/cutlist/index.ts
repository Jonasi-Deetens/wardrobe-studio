import { getBanding, getMaterial, getSheetSize, type Material } from "../catalog/materials";
import { bandingLength, PANEL_EDGES, partSignature, type Part, type PanelEdge } from "../core/part";
import { mm2, mm2ToM2, mmToM } from "../core/units";
import type { HardwareUse } from "../solver/draft";
import type { WardrobeModel } from "../solver";

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
  readonly length: number;
  readonly width: number;
  readonly thickness: number;
  readonly grain: Part["grain"];
  /** Banding name per edge, using the panel's own edge labels. */
  readonly banding: { readonly edge: PanelEdge; readonly label: string; readonly name: string }[];
  readonly bandingMetres: number;
  readonly holeCount: number;
  /** Every part this row stands for, so hovering a row can highlight them all. */
  readonly partIds: readonly string[];
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
  readonly labourCost: number;
  readonly totalCost: number;
};

export function buildCutList(model: WardrobeModel): CutList {
  const grouped = new Map<string, Part[]>();
  for (const part of model.parts) {
    const key = partSignature(part);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(part);
    else grouped.set(key, [part]);
  }

  const rows: CutListRow[] = [...grouped.entries()].map(([key, parts]) => {
    const first = parts[0] as Part;
    const material = getMaterial(first.materialId);
    return {
      key,
      quantity: parts.length,
      role: first.role,
      label: parts.length === 1 ? first.label : commonLabel(parts),
      material,
      length: first.length,
      width: first.width,
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
    };
  });

  rows.sort(
    (a, b) =>
      a.material.thickness - b.material.thickness ||
      a.material.id.localeCompare(b.material.id) ||
      b.length - a.length ||
      b.width - a.width,
  );

  const materialTotals = buildMaterialTotals(model, rows);
  const bandingTotals = buildBandingTotals(model);
  const bom = buildBom(model.hardware);

  const materialCost = materialTotals.reduce((sum, t) => sum + t.cost, 0);
  const bandingCost = bandingTotals.reduce((sum, t) => sum + t.cost, 0);
  const hardwareCost = bom.reduce((sum, r) => sum + r.total, 0);
  const labourCost = mm2(
    (model.parts.length * model.spec.production.minutesPerPanel * model.spec.production.labourRate) /
      60,
  );

  return {
    rows,
    materialTotals,
    bom,
    bandingTotals,
    partCount: model.parts.length,
    holeCount: model.parts.reduce(
      (sum, part) =>
        sum +
        part.ops.filter((op) => op.kind === "hole" || op.kind === "edge-hole").length,
      0,
    ),
    panelArea: mm2(
      model.parts.reduce((sum, part) => sum + mm2ToM2(part.length * part.width), 0) * 100,
    ) / 100,
    materialCost: mm2(materialCost),
    hardwareCost: mm2(hardwareCost),
    bandingCost: mm2(bandingCost),
    labourCost,
    totalCost: mm2(materialCost + bandingCost + hardwareCost + labourCost),
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
  model: WardrobeModel,
  rows: readonly CutListRow[],
): MaterialTotal[] {
  const sheet = getSheetSize(model.spec.production.sheetSizeId);
  const usable = (sheet.length - 2 * model.spec.production.sheetTrim) *
    (sheet.width - 2 * model.spec.production.sheetTrim);

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
      const sheetsNeeded = Math.ceil((area * 1.15) / usable);
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

function buildBandingTotals(model: WardrobeModel) {
  const byId = new Map<string, number>();
  for (const part of model.parts) {
    for (const edge of PANEL_EDGES) {
      const id = part.banding[edge];
      if (!id) continue;
      const length = edge === "l0" || edge === "l1" ? part.width : part.length;
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
export function countConnectors(model: WardrobeModel): number {
  return model.parts.reduce(
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
