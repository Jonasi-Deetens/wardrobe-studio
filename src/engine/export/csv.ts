import { getMaterial } from "../catalog/materials";
import type { CutList } from "../cutlist";
import type { NestResult } from "../cutlist/nesting";
import { endLabel } from "../cutlist/tube";
import { OP_PURPOSE_LABELS, type Part } from "../core/part";

/**
 * CSV exports. Semicolon-free, comma-separated, CRLF line endings and a UTF-8 BOM
 * added at download time, because the most likely destination is Excel on a shop
 * office machine and that is the combination it opens without an import dialog.
 */

/**
 * One cell, quoted where it has to be and defused where it could be dangerous.
 *
 * A project name or a part label is free text, and Excel treats a leading `=`, `+`,
 * `-` or `@` as the start of a formula — so `=cmd|...` in a label becomes a live
 * formula in whoever opens the file. Prefixing a tab is the standard mitigation:
 * Excel and LibreOffice both then read the cell as text, and the tab is invisible.
 */
function cell(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return String(value);
  const text = /^[=+\-@\t\r]/.test(value) ? `\t${value}` : value;
  return /[",\r\n\t]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: readonly (readonly (string | number | undefined | null)[])[]): string {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

export function cutListToCsv(cutList: CutList): string {
  const rows: (string | number | undefined)[][] = [
    [
      "Qty",
      "Part",
      "Material",
      "Length (mm)",
      "Width (mm)",
      "Thickness (mm)",
      "Grain",
      "Banding L0",
      "Banding L1",
      "Banding W0",
      "Banding W1",
      "Banding (m)",
      "Holes",
    ],
  ];

  for (const row of cutList.rows) {
    const banding = (edge: string) =>
      row.banding.find((b) => b.edge === edge)?.name ?? "";
    rows.push([
      row.quantity,
      row.label,
      row.material.name,
      row.length,
      row.width,
      row.thickness,
      row.grain === "none" ? "any" : row.grain,
      banding("l0"),
      banding("l1"),
      banding("w0"),
      banding("w1"),
      row.bandingMetres.toFixed(2),
      row.holeCount * row.quantity,
    ]);
  }

  rows.push([]);
  rows.push(["Material totals"]);
  rows.push(["Material", "Panels", "Area (m²)", "Sheets", "Cost"]);
  for (const total of cutList.materialTotals) {
    rows.push([
      total.material.name,
      total.partCount,
      total.area.toFixed(2),
      total.sheetsNeeded,
      total.cost.toFixed(2),
    ]);
  }

  rows.push([]);
  rows.push(["Edge banding totals"]);
  rows.push(["Banding", "Metres", "Cost"]);
  for (const total of cutList.bandingTotals) {
    rows.push([total.name, total.metres.toFixed(2), total.cost.toFixed(2)]);
  }

  rows.push([]);
  rows.push(["Cost summary"]);
  rows.push(["Sheet material", cutList.materialCost.toFixed(2)]);
  rows.push(["Edge banding", cutList.bandingCost.toFixed(2)]);
  rows.push(["Hardware", cutList.hardwareCost.toFixed(2)]);
  if (cutList.metal.memberCount > 0) {
    rows.push(["Metal sections", cutList.metalCost.toFixed(2)]);
  }
  rows.push(["Labour", cutList.labourCost.toFixed(2)]);
  rows.push(["Total", cutList.totalCost.toFixed(2)]);

  return toCsv(rows);
}

/**
 * The tube schedule: what to cut from bar stock, at what angle, and how it nests.
 *
 * Both end cuts are on the row, because a mitred length means nothing without them: the
 * same 600mm figure is a different piece of metal square-cut than it is at 45 degrees.
 */
export function tubeScheduleToCsv(cutList: CutList): string {
  const { metal } = cutList;
  const rows: (string | number | undefined)[][] = [
    [
      "Qty",
      "Member",
      "Profile",
      "Alloy",
      "Cut length (mm)",
      "End A",
      "End B",
      "Holes",
      "Metres",
      "Mass (kg)",
    ],
  ];

  for (const row of metal.rows) {
    rows.push([
      row.quantity,
      row.label,
      row.profile.shortName,
      row.profile.alloy === "stainless-304" ? "304 stainless" : "mild steel",
      row.length,
      endLabel(row.ends[0]),
      endLabel(row.ends[1]),
      row.holeCount * row.quantity,
      row.metres.toFixed(2),
      row.mass.toFixed(2),
    ]);
  }

  rows.push([]);
  rows.push(["Profile totals"]);
  rows.push(["Profile", "Pieces", "Metres", "Mass (kg)", "Stock bars", "Cost"]);
  for (const total of metal.profileTotals) {
    rows.push([
      total.profile.name,
      total.pieces,
      total.metres.toFixed(2),
      total.mass.toFixed(1),
      total.bars,
      total.cost.toFixed(2),
    ]);
  }

  rows.push([]);
  rows.push(["Bar cutting list"]);
  rows.push(["Bar", "Profile", "Stock (mm)", "Cut", "At (mm)", "Length (mm)", "Offcut (mm)"]);
  for (const bar of metal.nest.bars) {
    bar.cuts.forEach((cut, index) => {
      rows.push([
        bar.index + 1,
        index === 0 ? bar.profileId : "",
        index === 0 ? bar.stockLength : "",
        cut.label,
        cut.at,
        cut.length,
        index === bar.cuts.length - 1 ? bar.offcut : "",
      ]);
    });
  }

  rows.push([]);
  rows.push(["Bars", metal.nest.bars.length]);
  rows.push(["Bar waste", `${metal.nest.wastePercent.toFixed(1)}%`]);
  rows.push(["Total mass (kg)", metal.totalMass.toFixed(1)]);
  if (metal.nest.oversize.length > 0) {
    rows.push([
      "Longer than a stock bar",
      metal.nest.oversize.map((entry) => `${entry.label} (${entry.length}mm)`).join("; "),
    ]);
  }
  return toCsv(rows);
}

/** The weld schedule, grouped by size and whether the joint is ground flush. */
export function weldScheduleToCsv(cutList: CutList): string {
  const rows: (string | number | undefined)[][] = [
    ["Joints", "Type", "Size (mm)", "Finish", "Run (m)", "Examples"],
  ];
  for (const row of cutList.metal.welds) {
    rows.push([
      row.count,
      row.kind,
      row.size,
      row.ground ? "ground flush" : "as welded",
      row.metres.toFixed(2),
      row.examples.join("; "),
    ]);
  }
  rows.push([]);
  rows.push(["Joints", cutList.metal.weldCount]);
  rows.push(["Total run (m)", cutList.metal.weldMetres.toFixed(2)]);
  return toCsv(rows);
}

export function bomToCsv(cutList: CutList): string {
  const rows: (string | number | undefined)[][] = [
    ["Qty", "Unit", "Item", "Category", "Unit price", "Total", "Used for"],
  ];
  for (const row of cutList.bom) {
    rows.push([
      row.quantity,
      row.unit,
      row.name,
      row.kind,
      row.unitPrice.toFixed(2),
      row.total.toFixed(2),
      row.notes.join("; "),
    ]);
  }
  rows.push([]);
  rows.push(["Hardware total", "", "", "", "", cutList.hardwareCost.toFixed(2)]);
  return toCsv(rows);
}

/**
 * Every hole as a row. Useful for hand-drilling with a digital rule and for feeding
 * simple drill-and-dowel machines that accept a coordinate table.
 */
export function drillingToCsv(parts: readonly Part[]): string {
  const rows: (string | number | undefined)[][] = [
    [
      "Part",
      "Part id",
      "Face / edge",
      "Along length (mm)",
      "Across width / thickness (mm)",
      "Diameter (mm)",
      "Depth (mm)",
      "Purpose",
    ],
  ];
  for (const part of parts) {
    for (const op of part.ops) {
      if (op.kind === "hole") {
        rows.push([
          part.label,
          part.id,
          `Face ${op.face}`,
          op.l,
          op.w,
          op.diameter,
          op.depth,
          OP_PURPOSE_LABELS[op.purpose],
        ]);
      } else if (op.kind === "edge-hole") {
        rows.push([
          part.label,
          part.id,
          `Edge ${part.edgeLabels[op.edge]}`,
          op.along,
          op.acrossThickness,
          op.diameter,
          op.depth,
          OP_PURPOSE_LABELS[op.purpose],
        ]);
      }
    }
  }
  return toCsv(rows);
}

export function nestingToCsv(nest: NestResult): string {
  const rows: (string | number | undefined)[][] = [
    [
      "Sheet",
      "Material",
      "Part",
      "X (mm)",
      "Y (mm)",
      "Length (mm)",
      "Width (mm)",
      "Rotated",
    ],
  ];
  for (const sheet of nest.sheets) {
    for (const placement of sheet.placements) {
      rows.push([
        sheet.index + 1,
        getMaterial(sheet.materialId).name,
        placement.label,
        placement.x,
        placement.y,
        placement.width,
        placement.height,
        placement.rotated ? "yes" : "no",
      ]);
    }
  }

  rows.push([]);
  rows.push(["Cut sequence"]);
  rows.push(["Step", "Sheet", "Cut", "At (mm)", "From (mm)", "To (mm)", "Description"]);
  for (const cut of nest.cuts) {
    rows.push([
      cut.sequence,
      cut.sheetIndex + 1,
      cut.kind,
      cut.at,
      cut.from,
      cut.to,
      cut.description,
    ]);
  }

  rows.push([]);
  rows.push(["Sheets", nest.sheetCount]);
  rows.push(["Waste", `${nest.totalWastePercent.toFixed(1)}%`]);
  if (nest.unplaced.length > 0) {
    rows.push(["Parts too large for the sheet", nest.unplaced.map((p) => p.label).join("; ")]);
  }
  return toCsv(rows);
}
