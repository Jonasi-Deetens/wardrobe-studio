import { getMaterial } from "../catalog/materials";
import { formatMm } from "../core/units";
import type { NestedSheet } from "../cutlist/nesting";
import type { Drawing, Primitive, Style } from "./types";

/**
 * The cutting diagram for one sheet.
 *
 * Waste is hatched rather than left blank, because a blank area on a printed sheet
 * reads as "nothing here yet" and an operator will cut into it.
 */

const MARGIN = 60;

const style = (layer: Style["layer"], extra: Omit<Style, "layer"> = {}): Style => ({
  layer,
  ...extra,
});

export function renderSheetDrawing(sheet: NestedSheet, sheetNumber: number, sheetTotal: number): Drawing {
  const material = getMaterial(sheet.materialId);
  const primitives: Primitive[] = [];

  /* Full sheet, then the usable area inside the trim. */
  primitives.push({
    kind: "rect",
    x: -sheet.trim,
    y: -sheet.trim,
    width: sheet.length,
    height: sheet.width,
    style: style("hidden", { strokeWidth: 0.4, dash: [6, 3] }),
  });
  primitives.push({
    kind: "rect",
    x: 0,
    y: 0,
    width: sheet.usableLength,
    height: sheet.usableWidth,
    style: style("outline", { strokeWidth: 0.6 }),
  });

  /* Waste, hatched, drawn under the parts. */
  for (const rect of sheet.freeRects) {
    if (rect.width < 20 || rect.height < 20) continue;
    primitives.push({
      kind: "rect",
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      style: style("hidden", { strokeWidth: 0.2, hatch: true, opacity: 0.35 }),
    });
  }

  /* Parts. */
  for (const placement of sheet.placements) {
    primitives.push({
      kind: "rect",
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      style: style("cut", { strokeWidth: 0.5, fill: "none" }),
    });

    const cx = placement.x + placement.width / 2;
    const cy = placement.y + placement.height / 2;
    // Long thin parts read better with the label turned along them.
    const rotate = placement.height > placement.width * 1.6 ? -90 : 0;
    const room = rotate === 0 ? placement.width : placement.height;

    primitives.push({
      kind: "text",
      x: cx,
      y: cy + 6,
      text: truncate(placement.label, Math.floor(room / 5.5)),
      size: 11,
      anchor: "middle",
      baseline: "middle",
      style: style("annotation"),
      ...(rotate ? { rotate } : {}),
    });
    primitives.push({
      kind: "text",
      x: cx,
      y: cy - 8,
      text: `${formatMm(placement.width)} x ${formatMm(placement.height)}${placement.rotated ? " (turned)" : ""}`,
      size: 10,
      anchor: "middle",
      baseline: "middle",
      style: style("dimension"),
      mono: true,
      ...(rotate ? { rotate } : {}),
    });
  }

  /* Rip lines, so the operator can see the cut order. */
  const ripXs = [
    ...new Set(sheet.placements.map((p) => Math.round(p.x + p.width))),
  ].sort((a, b) => a - b);
  for (const x of ripXs) {
    if (x >= sheet.usableLength - 1) continue;
    primitives.push({
      kind: "line",
      x1: x,
      y1: 0,
      x2: x,
      y2: sheet.usableWidth,
      style: style("dimension", { strokeWidth: 0.3, dash: [8, 4], opacity: 0.5 }),
    });
  }

  primitives.push({
    kind: "text",
    x: 0,
    y: sheet.usableWidth + 12,
    text: `Sheet ${sheetNumber} of ${sheetTotal} — ${material.name}`,
    size: 16,
    anchor: "start",
    baseline: "bottom",
    style: style("annotation"),
  });
  primitives.push({
    kind: "text",
    x: sheet.usableLength,
    y: sheet.usableWidth + 12,
    text: `${sheet.placements.length} parts · ${formatMm(sheet.wastePercent)}% waste · usable ${sheet.usableLength} x ${sheet.usableWidth}mm`,
    size: 13,
    anchor: "end",
    baseline: "bottom",
    style: style("dimension"),
    mono: true,
  });

  return {
    x: -MARGIN,
    y: -MARGIN,
    width: sheet.usableLength + 2 * MARGIN,
    height: sheet.usableWidth + 2 * MARGIN,
    primitives,
    title: `Cutting diagram, sheet ${sheetNumber}`,
    subtitle: material.name,
  };
}

function truncate(text: string, maxChars: number): string {
  if (maxChars < 4) return "";
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}
