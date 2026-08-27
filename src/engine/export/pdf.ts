import {
  degrees,
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { buildAssemblySequence } from "../assembly";
import { getMaterial } from "../catalog/materials";
import type { CutList } from "../cutlist";
import type { NestResult } from "../cutlist/nesting";
import type { Finding } from "../advisor";
import { renderPanelDrawing } from "../drawing/panel";
import { renderSheetDrawing } from "../drawing/sheet";
import type { Drawing, Layer, Primitive } from "../drawing/types";
import { partSignature } from "../core/part";
import { formatDim } from "../core/units";
import { CARCASE_CONSTRUCTION_LABELS, FITTING_LABELS } from "../spec/types";
import { collectBays } from "../spec/types";
import type { WardrobeModel } from "../solver";

/**
 * The shop booklet.
 *
 * It draws the same `Drawing` primitives the screen uses, rather than rasterising the
 * SVG, so a hole on paper is at the coordinate the engine computed — no intermediate
 * image, no resampling, and the print stays vector-sharp at any size.
 */

const MM = 2.834645669291339;
const A4 = { width: 210, height: 297 } as const;
const MARGIN = { top: 16, right: 14, bottom: 14, left: 14 } as const;

const INK = rgb(0.08, 0.09, 0.11);
const MUTED = rgb(0.42, 0.45, 0.5);
const HAIRLINE = rgb(0.78, 0.79, 0.81);
const ACCENT = rgb(0.78, 0.42, 0.12);
const BAND = rgb(0.955, 0.957, 0.96);
const WARN = rgb(0.72, 0.45, 0.05);
const ERROR = rgb(0.7, 0.16, 0.16);

const LAYER_INK: Partial<Record<Layer, RGB>> = {
  outline: rgb(0, 0, 0),
  cut: rgb(0.1, 0.1, 0.1),
  hole: rgb(0, 0, 0),
  "hole-far": rgb(0.62, 0.62, 0.62),
  groove: rgb(0.3, 0.3, 0.3),
  rabbet: rgb(0.3, 0.3, 0.3),
  banding: rgb(0.35, 0.35, 0.35),
  grain: rgb(0.5, 0.5, 0.5),
  dimension: rgb(0.25, 0.25, 0.25),
  annotation: rgb(0.05, 0.05, 0.05),
  datum: rgb(0, 0, 0),
  hidden: rgb(0.7, 0.7, 0.7),
};

type Fonts = { readonly regular: PDFFont; readonly bold: PDFFont; readonly mono: PDFFont };

/**
 * The standard PDF fonts encode WinAnsi only, and pdf-lib throws on anything outside
 * it. Rather than let one arrow in a label fail the whole booklet, fold the few
 * symbols we use down to characters WinAnsi has, and drop anything else.
 */
const GLYPH_FALLBACK: Record<string, string> = {
  "↕": "|",
  "↔": "-",
  "→": ">",
  "←": "<",
  "↑": "^",
  "↓": "v",
  "≈": "~",
  "≤": "<=",
  "≥": ">=",
  "⌀": "\u00d8",
  "∅": "\u00d8",
  "·": "\u00b7",
  "×": "\u00d7",
};

function ansi(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) {
      out += char;
      continue;
    }
    const replacement = GLYPH_FALLBACK[char];
    if (replacement !== undefined) {
      out += replacement;
      continue;
    }
    // Latin-1 and the WinAnsi extras we actually rely on pass through unchanged.
    out += code <= 0xff || "\u2018\u2019\u201c\u201d\u2013\u2014\u2022\u2026\u2122".includes(char)
      ? char
      : "";
  }
  return out;
}

type Sheet = {
  readonly page: PDFPage;
  /** Page size in mm. */
  readonly width: number;
  readonly height: number;
  /** Layout cursor, in mm from the top edge. */
  y: number;
};

type Booklet = {
  readonly doc: PDFDocument;
  readonly fonts: Fonts;
  readonly sheets: Sheet[];
  readonly title: string;
};

/** A rendered viewport image to put on the cover. */
export type BookletView = {
  readonly label: string;
  readonly png: Uint8Array;
};

export type BookletInput = {
  readonly model: WardrobeModel;
  readonly cutList: CutList;
  readonly nest: NestResult | null;
  readonly findings: readonly Finding[];
  readonly views?: readonly BookletView[];
  readonly sections?: {
    readonly cuttingDiagrams?: boolean;
    readonly panelPages?: boolean;
    readonly drillingTable?: boolean;
    readonly assembly?: boolean;
  };
  readonly date?: Date;
};

export async function buildBooklet(input: BookletInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };

  const { model, cutList, nest, findings } = input;
  const sections = {
    cuttingDiagrams: true,
    panelPages: true,
    drillingTable: false,
    assembly: true,
    ...input.sections,
  };

  const booklet: Booklet = {
    doc,
    fonts,
    sheets: [],
    title: model.spec.meta.name || "Wardrobe",
  };

  doc.setTitle(`${booklet.title} — shop booklet`);
  doc.setSubject("Cut list, cutting diagrams, drilling drawings and assembly sequence");
  doc.setCreator("Wardrobe Studio");
  doc.setProducer("Wardrobe Studio");

  const images: PDFImage[] = [];
  for (const view of input.views ?? []) {
    try {
      images.push(await doc.embedPng(view.png));
    } catch {
      // A view that will not embed is not worth failing the whole booklet for.
    }
  }

  await coverPage(booklet, input, images);
  specPage(booklet, input);
  cutListPages(booklet, input);
  if (sections.cuttingDiagrams && nest) nestingPages(booklet, nest);
  hardwarePage(booklet, cutList);
  if (sections.assembly) assemblyPages(booklet, model, findings);
  if (sections.panelPages) panelPages(booklet, model);
  if (sections.drillingTable) drillingPages(booklet, model);

  paginate(booklet);

  return doc.save();
}

/* ------------------------------------------------------------------- pages - */

async function coverPage(
  booklet: Booklet,
  input: BookletInput,
  images: readonly PDFImage[],
): Promise<void> {
  const sheet = addSheet(booklet, false);
  const { model, cutList, findings } = input;
  const spec = model.spec;
  const inner = contentWidth(sheet);

  drawText(sheet, booklet.fonts.bold, "WARDROBE STUDIO", {
    x: MARGIN.left,
    y: MARGIN.top,
    size: 2.6,
    color: ACCENT,
    tracking: 0.9,
  });

  sheet.y = MARGIN.top + 8;
  drawText(sheet, booklet.fonts.bold, booklet.title, {
    x: MARGIN.left,
    y: sheet.y,
    size: 9,
    color: INK,
  });
  sheet.y += 11;

  const dims = `${formatDim(spec.carcase.width)} wide × ${formatDim(spec.carcase.height)} high × ${formatDim(spec.carcase.depth)} deep`;
  drawText(sheet, booklet.fonts.regular, dims, {
    x: MARGIN.left,
    y: sheet.y,
    size: 3.6,
    color: MUTED,
  });
  sheet.y += 7;

  rule(sheet, MARGIN.left, sheet.y, inner);
  sheet.y += 6;

  /* Viewport captures, laid out in a row. */
  if (images.length > 0) {
    const gap = 4;
    const boxWidth = (inner - gap * (images.length - 1)) / images.length;
    const boxHeight = 62;
    images.forEach((image, index) => {
      const scale = Math.min(boxWidth / (image.width / MM), boxHeight / (image.height / MM));
      const w = (image.width / MM) * scale;
      const h = (image.height / MM) * scale;
      const x = MARGIN.left + index * (boxWidth + gap) + (boxWidth - w) / 2;
      sheet.page.drawImage(image, {
        x: x * MM,
        y: (sheet.height - sheet.y - boxHeight / 2 - h / 2) * MM,
        width: w * MM,
        height: h * MM,
      });
      const label = input.views?.[index]?.label;
      if (label) {
        drawText(sheet, booklet.fonts.regular, label, {
          x: MARGIN.left + index * (boxWidth + gap) + boxWidth / 2,
          y: sheet.y + boxHeight + 1,
          size: 2.8,
          color: MUTED,
          align: "middle",
        });
      }
    });
    sheet.y += boxHeight + 8;
  }

  /* Headline numbers. The four a shop actually asks for before starting. */
  const stats: [string, string][] = [
    ["Panels", String(cutList.partCount)],
    ["Sheets", String(cutList.materialTotals.reduce((sum, t) => sum + t.sheetsNeeded, 0))],
    ["Holes", String(cutList.holeCount)],
    ["Banding", `${cutList.bandingTotals.reduce((s, t) => s + t.metres, 0).toFixed(1)} m`],
  ];
  const statWidth = inner / stats.length;
  stats.forEach(([label, value], index) => {
    const x = MARGIN.left + index * statWidth;
    drawText(sheet, booklet.fonts.bold, value, { x, y: sheet.y, size: 7, color: INK });
    drawText(sheet, booklet.fonts.regular, label.toUpperCase(), {
      x,
      y: sheet.y + 8.5,
      size: 2.5,
      color: MUTED,
      tracking: 0.6,
    });
  });
  sheet.y += 16;
  rule(sheet, MARGIN.left, sheet.y, inner);
  sheet.y += 6;

  /* Two columns: the build at a glance, and anything the advisor flagged. */
  const colWidth = (inner - 8) / 2;
  const startY = sheet.y;

  drawText(sheet, booklet.fonts.bold, "This build", {
    x: MARGIN.left,
    y: sheet.y,
    size: 3.4,
    color: INK,
  });
  let leftY = sheet.y + 6;
  for (const [label, value] of coverFacts(model)) {
    leftY = keyValue(sheet, booklet.fonts, label, value, MARGIN.left, leftY, colWidth);
  }

  const rightX = MARGIN.left + colWidth + 8;
  drawText(sheet, booklet.fonts.bold, "Before you cut", {
    x: rightX,
    y: startY,
    size: 3.4,
    color: INK,
  });
  let rightY = startY + 6;
  const flagged = findings.filter((f) => f.severity !== "advice").slice(0, 8);
  if (flagged.length === 0) {
    rightY = wrapText(
      sheet,
      booklet.fonts.regular,
      "Nothing flagged. Every span, hinge and slide is inside its limit.",
      { x: rightX, y: rightY, width: colWidth, size: 3, color: MUTED, lineHeight: 4.2 },
    );
  } else {
    for (const finding of flagged) {
      const color = finding.severity === "error" ? ERROR : WARN;
      sheet.page.drawCircle({
        x: (rightX + 0.9) * MM,
        y: (sheet.height - rightY - 1.6) * MM,
        size: 0.9 * MM,
        color,
      });
      rightY = wrapText(sheet, booklet.fonts.regular, finding.title, {
        x: rightX + 3.4,
        y: rightY,
        width: colWidth - 3.4,
        size: 3,
        color: INK,
        lineHeight: 4.2,
      });
      rightY += 1.4;
    }
  }

  sheet.y = Math.max(leftY, rightY) + 4;

  const date = (input.date ?? new Date()).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  drawText(sheet, booklet.fonts.regular, `Generated ${date} · all dimensions in millimetres`, {
    x: MARGIN.left,
    y: sheet.height - MARGIN.bottom - 3,
    size: 2.6,
    color: MUTED,
  });
}

function coverFacts(model: WardrobeModel): [string, string][] {
  const spec = model.spec;
  const bays = collectBays(spec.layout);
  const fittings = [...new Set(bays.map((bay) => FITTING_LABELS[bay.fitting.kind]))];
  const facts: [string, string][] = [
    ["Carcase", `${getMaterial(spec.carcase.panelMaterialId).name}`],
    ["Construction", CARCASE_CONSTRUCTION_LABELS[spec.carcase.construction]],
    ["Back", spec.carcase.back.type === "none" ? "None" : `${spec.carcase.back.type} · ${getMaterial(spec.carcase.back.materialId).shortName}`],
    ["Bays", `${bays.length} · ${fittings.join(", ")}`],
    [
      "Doors",
      spec.doors.type === "none"
        ? "Open front"
        : `${model.leaves.length} leaves, ${spec.doors.overlayStyle} overlay`,
    ],
    ["Drawers", model.drawers.length === 0 ? "None" : `${model.drawers.length}`],
    ["Internal height", formatDim(model.frame.interior.y1 - model.frame.interior.y0)],
    ["Internal depth", formatDim(model.frame.interior.z1 - model.frame.interior.z0)],
  ];
  return facts;
}

function specPage(booklet: Booklet, input: BookletInput): void {
  const sheet = addSheet(booklet, false);
  const { model, cutList, findings } = input;
  const spec = model.spec;
  heading(booklet, sheet, "Specification");

  const inner = contentWidth(sheet);
  const colWidth = (inner - 8) / 2;
  const groups: [string, [string, string][]][] = [
    [
      "Carcase",
      [
        ["Outer size", `${spec.carcase.width} × ${spec.carcase.height} × ${spec.carcase.depth}`],
        ["Panel material", getMaterial(spec.carcase.panelMaterialId).name],
        ["Construction", CARCASE_CONSTRUCTION_LABELS[spec.carcase.construction]],
        ["32mm grid snap", spec.carcase.snapToSystemGrid ? "On" : "Off"],
        ["Plinth", `${spec.carcase.plinth.type}, ${spec.carcase.plinth.height} high, ${spec.carcase.plinth.setback} setback`],
        ["Back", `${spec.carcase.back.type}, ${getMaterial(spec.carcase.back.materialId).shortName}, ${spec.carcase.back.inset} inset`],
        ["Top overhang", `L ${spec.carcase.topOverhang.left} · R ${spec.carcase.topOverhang.right} · F ${spec.carcase.topOverhang.front}`],
        ["Scribe allowance", `L ${spec.carcase.scribe.left} · R ${spec.carcase.scribe.right} · T ${spec.carcase.scribe.top}`],
        ["Wall anchor", spec.carcase.wallAnchor],
        ["Top stretcher", spec.carcase.topStretcher ? "Yes" : "No"],
      ],
    ],
    [
      "Fronts",
      [
        ["Door type", spec.doors.type],
        ["Overlay", spec.doors.overlayStyle],
        ["Leaves", `${model.leaves.length} (${spec.doors.leafMode})`],
        ["Door material", getMaterial(spec.doors.materialId).name],
        ["Gap / reveals", `${spec.doors.gap} · top ${spec.doors.revealTop} · bottom ${spec.doors.revealBottom}`],
        ["Hinge", spec.doors.hingeId],
        ["Boring distance", `${spec.doors.boringDistance} mm`],
        ["Plate height", `${spec.doors.plateHeight} mm`],
        ["Hinge side rule", spec.doors.hingeSideRule],
        ["Door handle", spec.handles.doorHandleId],
        ["Drawer handle", spec.handles.drawerHandleId],
      ],
    ],
    [
      "Joinery",
      [
        ["Corner joint", spec.joinery.connectorId],
        ["Connector spacing", `${spec.joinery.connectorSpacing} mm`],
        ["System holes", spec.joinery.systemHoles.enabled ? `${spec.joinery.systemHoles.pitch} pitch, front ${spec.joinery.systemHoles.frontOffset}` : "Off"],
        ["Rear row", spec.joinery.systemHoles.rearOffset === null ? "None" : `${spec.joinery.systemHoles.rearOffset} from back`],
        ["Row start", spec.joinery.systemHoles.startMode],
        ["Shelf support", spec.joinery.shelfSupportId],
      ],
    ],
    [
      "Drawers & production",
      [
        ["Slide", spec.drawers.slideId],
        ["Box material", getMaterial(spec.drawers.boxMaterialId).shortName],
        ["Box height", `${spec.drawers.boxHeight} mm`],
        ["Soft close", spec.drawers.softClose ? "Yes" : "No"],
        ["Sheet size", spec.production.sheetSizeId],
        ["Kerf / trim", `${spec.production.kerf} / ${spec.production.sheetTrim} mm`],
        ["Grain policy", spec.production.grainPolicy],
        ["Labour", `${spec.production.minutesPerPanel} min/panel at ${spec.production.labourRate}/h`],
      ],
    ],
  ];

  let columnY = [sheet.y, sheet.y];
  groups.forEach((group, index) => {
    const column = index % 2;
    const x = MARGIN.left + column * (colWidth + 8);
    let y = columnY[column] as number;
    drawText(sheet, booklet.fonts.bold, group[0], { x, y, size: 3.2, color: ACCENT });
    y += 5;
    for (const [label, value] of group[1]) {
      y = keyValue(sheet, booklet.fonts, label, value, x, y, colWidth);
    }
    columnY[column] = y + 6;
  });

  sheet.y = Math.max(...columnY);

  /* Cost estimate, and the advice list in full. */
  if (sheet.y > sheet.height - MARGIN.bottom - 60) {
    sheet.y = MARGIN.top;
    addSheet(booklet, false);
  }

  const costs: [string, string][] = [
    ["Sheet material", cutList.materialCost.toFixed(2)],
    ["Edge banding", cutList.bandingCost.toFixed(2)],
    ["Hardware", cutList.hardwareCost.toFixed(2)],
    ["Labour", cutList.labourCost.toFixed(2)],
    ["Total", cutList.totalCost.toFixed(2)],
  ];
  drawText(sheet, booklet.fonts.bold, "Estimate", {
    x: MARGIN.left,
    y: sheet.y,
    size: 3.2,
    color: ACCENT,
  });
  sheet.y += 5;
  for (const [label, value] of costs) {
    sheet.y = keyValue(sheet, booklet.fonts, label, value, MARGIN.left, sheet.y, colWidth);
  }
  sheet.y += 6;

  if (findings.length > 0) {
    const target = findingsSheet(booklet, sheet);
    drawText(target, booklet.fonts.bold, "Advice and warnings", {
      x: MARGIN.left,
      y: target.y,
      size: 3.2,
      color: ACCENT,
    });
    target.y += 5;
    for (const finding of findings) {
      let current = target;
      if (current.y > current.height - MARGIN.bottom - 16) {
        current = addSheet(booklet, false);
        current.y = MARGIN.top;
      }
      const color =
        finding.severity === "error" ? ERROR : finding.severity === "warning" ? WARN : MUTED;
      current.page.drawRectangle({
        x: MARGIN.left * MM,
        y: (current.height - current.y - 3.6) * MM,
        width: 1.1 * MM,
        height: 3.6 * MM,
        color,
      });
      drawText(current, booklet.fonts.bold, finding.title, {
        x: MARGIN.left + 3,
        y: current.y,
        size: 3,
        color: INK,
      });
      current.y += 4.2;
      current.y = wrapText(current, booklet.fonts.regular, finding.detail, {
        x: MARGIN.left + 3,
        y: current.y,
        width: contentWidth(current) - 3,
        size: 2.8,
        color: MUTED,
        lineHeight: 3.8,
      });
      current.y += 2.4;
      sheet.y = current.y;
    }
  }
}

/** The advice list is long; give it a fresh page rather than a cramped tail. */
function findingsSheet(booklet: Booklet, sheet: Sheet): Sheet {
  if (sheet.y < sheet.height - MARGIN.bottom - 70) return sheet;
  const next = addSheet(booklet, false);
  next.y = MARGIN.top;
  return next;
}

function cutListPages(booklet: Booklet, input: BookletInput): void {
  const { cutList } = input;
  const columns: Column[] = [
    { header: "Qty", width: 10, align: "end" },
    { header: "Part", width: 48 },
    { header: "Material", width: 28 },
    { header: "Length", width: 15, align: "end" },
    { header: "Width", width: 15, align: "end" },
    { header: "Thk", width: 11, align: "end" },
    { header: "Grain", width: 20 },
    { header: "Banding (L0/L1/W0/W1)", width: 26 },
    { header: "Holes", width: 10, align: "end" },
  ];

  const rows = cutList.rows.map((row) => {
    const band = (edge: string) => (row.banding.some((b) => b.edge === edge) ? "•" : "–");
    return [
      String(row.quantity),
      row.label,
      row.material.shortName,
      String(row.length),
      String(row.width),
      String(row.thickness),
      row.grain === "none" ? "any" : row.grain === "length" ? "along length" : "across width",
      `${band("l0")} ${band("l1")} ${band("w0")} ${band("w1")}`,
      String(row.holeCount * row.quantity),
    ];
  });

  const sheet = table(booklet, {
    title: "Cut list",
    subtitle: `${cutList.partCount} panels · dimensions are as-cut, edge banding already deducted`,
    columns,
    rows,
    landscape: false,
  });

  /* Totals, right under the table if there is room. */
  sheet.y += 4;
  const lines = [
    ...cutList.materialTotals.map(
      (total) =>
        `${total.material.name}: ${total.partCount} panels, ${total.area.toFixed(2)} m², ${total.sheetsNeeded} sheet${total.sheetsNeeded === 1 ? "" : "s"}`,
    ),
    ...cutList.bandingTotals.map((total) => `${total.name}: ${total.metres.toFixed(1)} m`),
  ];
  if (sheet.y > sheet.height - MARGIN.bottom - lines.length * 4 - 10) {
    const next = addSheet(booklet, false);
    heading(booklet, next, "Material totals");
    writeLines(next, booklet.fonts, lines);
  } else {
    drawText(sheet, booklet.fonts.bold, "Totals", {
      x: MARGIN.left,
      y: sheet.y,
      size: 3.2,
      color: ACCENT,
    });
    sheet.y += 5;
    writeLines(sheet, booklet.fonts, lines);
  }
}

function nestingPages(booklet: Booklet, nest: NestResult): void {
  for (const nested of nest.sheets) {
    const sheet = addSheet(booklet, true);
    const material = getMaterial(nested.materialId);
    heading(
      booklet,
      sheet,
      `Sheet ${nested.index + 1} — ${material.name}`,
      `${nested.length} × ${nested.width} · ${nested.placements.length} parts · ${nested.wastePercent.toFixed(1)}% waste`,
    );
    const drawing = renderSheetDrawing(nested, nested.index + 1, nest.sheets.length);
    placeDrawing(booklet, sheet, drawing, {
      x: MARGIN.left,
      y: sheet.y,
      width: contentWidth(sheet),
      height: sheet.height - sheet.y - MARGIN.bottom - 4,
    });
  }

  if (nest.cuts.length > 0) {
    const rows = nest.cuts.map((cut) => [
      String(cut.sequence),
      String(cut.sheetIndex + 1),
      cut.kind,
      String(cut.at),
      `${cut.from} to ${cut.to}`,
      cut.description,
    ]);
    table(booklet, {
      title: "Cut sequence",
      subtitle: "Guillotine order: rip the sheet into strips first, then crosscut each strip",
      columns: [
        { header: "Step", width: 12, align: "end" },
        { header: "Sheet", width: 14, align: "end" },
        { header: "Cut", width: 20 },
        { header: "At", width: 16, align: "end" },
        { header: "Extent", width: 28 },
        { header: "Description", width: 92 },
      ],
      rows,
      landscape: false,
    });
  }

  if (nest.unplaced.length > 0) {
    const sheet = addSheet(booklet, false);
    heading(booklet, sheet, "Parts that do not fit the sheet");
    writeLines(
      sheet,
      booklet.fonts,
      nest.unplaced.map(
        (part) => `${part.label} — ${part.length} × ${part.width} in ${getMaterial(part.materialId).name}`,
      ),
    );
  }
}

function hardwarePage(booklet: Booklet, cutList: CutList): void {
  const rows = cutList.bom.map((row) => [
    String(row.quantity),
    row.unit,
    row.name,
    row.kind,
    row.unitPrice.toFixed(2),
    row.total.toFixed(2),
    row.notes.slice(0, 3).join("; "),
  ]);
  const sheet = table(booklet, {
    title: "Hardware list",
    subtitle: "Order this before you start; a missing hinge stops the whole job",
    columns: [
      { header: "Qty", width: 12, align: "end" },
      { header: "Unit", width: 12 },
      { header: "Item", width: 58 },
      { header: "Type", width: 26 },
      { header: "Each", width: 16, align: "end" },
      { header: "Total", width: 16, align: "end" },
      { header: "Used for", width: 42 },
    ],
    rows,
    landscape: false,
  });
  sheet.y += 3;
  drawText(sheet, booklet.fonts.bold, `Hardware total ${cutList.hardwareCost.toFixed(2)}`, {
    x: MARGIN.left,
    y: sheet.y,
    size: 3.2,
    color: INK,
  });
}

function assemblyPages(
  booklet: Booklet,
  model: WardrobeModel,
  findings: readonly Finding[],
): void {
  const sequence = buildAssemblySequence(model);
  let sheet = addSheet(booklet, false);
  heading(
    booklet,
    sheet,
    "Assembly sequence",
    "Derived from the part graph, so it matches the panels in this booklet",
  );

  const width = contentWidth(sheet);
  for (const step of sequence.steps) {
    const needed = 16 + Math.ceil(step.detail.length / 90) * 4;
    if (sheet.y > sheet.height - MARGIN.bottom - needed) {
      sheet = addSheet(booklet, false);
      sheet.y = MARGIN.top;
    }

    sheet.page.drawCircle({
      x: (MARGIN.left + 3) * MM,
      y: (sheet.height - sheet.y - 2.6) * MM,
      size: 3 * MM,
      color: BAND,
    });
    drawText(sheet, booklet.fonts.bold, String(step.index), {
      x: MARGIN.left + 3,
      y: sheet.y + 0.8,
      size: 3.2,
      color: INK,
      align: "middle",
    });

    const textX = MARGIN.left + 9;
    const textWidth = width - 9;
    drawText(sheet, booklet.fonts.bold, step.title, {
      x: textX,
      y: sheet.y,
      size: 3.4,
      color: INK,
    });
    sheet.y += 5;
    sheet.y = wrapText(sheet, booklet.fonts.regular, step.detail, {
      x: textX,
      y: sheet.y,
      width: textWidth,
      size: 2.9,
      color: rgb(0.2, 0.22, 0.25),
      lineHeight: 4,
    });

    if (step.hardware.length > 0) {
      sheet.y += 0.6;
      sheet.y = wrapText(
        sheet,
        booklet.fonts.regular,
        `Hardware: ${step.hardware.join(", ")}`,
        { x: textX, y: sheet.y, width: textWidth, size: 2.7, color: MUTED, lineHeight: 3.6 },
      );
    }
    if (step.rationale) {
      sheet.y += 0.6;
      sheet.y = wrapText(sheet, booklet.fonts.regular, `Why: ${step.rationale}`, {
        x: textX,
        y: sheet.y,
        width: textWidth,
        size: 2.7,
        color: ACCENT,
        lineHeight: 3.6,
      });
    }
    sheet.y += 4.5;
  }

  const advice = findings.filter((f) => f.severity === "advice");
  if (advice.length > 0 && sheet.y < sheet.height - MARGIN.bottom - 20) {
    rule(sheet, MARGIN.left, sheet.y, width);
    sheet.y += 4;
    drawText(sheet, booklet.fonts.bold, "Notes from the advisor", {
      x: MARGIN.left,
      y: sheet.y,
      size: 3,
      color: MUTED,
    });
    sheet.y += 4.4;
    for (const finding of advice.slice(0, 6)) {
      if (sheet.y > sheet.height - MARGIN.bottom - 6) break;
      sheet.y = wrapText(sheet, booklet.fonts.regular, `· ${finding.title}`, {
        x: MARGIN.left,
        y: sheet.y,
        width,
        size: 2.7,
        color: MUTED,
        lineHeight: 3.6,
      });
    }
  }
}

function panelPages(booklet: Booklet, model: WardrobeModel): void {
  /* Identical panels share a page: same size, same machining, same drawing. The
     grouping is partSignature, the same one the cut list collapses rows with, so a
     page marked ×3 always corresponds to a cut list row of 3. */
  const seen = new Map<string, { part: (typeof model.parts)[number]; count: number }>();
  for (const part of model.parts) {
    const key = partSignature(part);
    const existing = seen.get(key);
    if (existing) existing.count += 1;
    else seen.set(key, { part, count: 1 });
  }

  for (const { part, count } of seen.values()) {
    const faces: ("A" | "B")[] = ["A"];
    const hasFaceB = part.ops.some(
      (op) => (op.kind === "hole" || op.kind === "groove") && op.face === "B",
    );
    if (hasFaceB) faces.push("B");

    for (const face of faces) {
      const sheet = addSheet(booklet, true);
      const drawing = renderPanelDrawing(part, face);
      heading(
        booklet,
        sheet,
        `${part.label}${count > 1 ? ` ×${count}` : ""} — face ${face}`,
        `${part.length} × ${part.width} × ${part.thickness} · ${getMaterial(part.materialId).name}`,
      );
      placeDrawing(booklet, sheet, drawing, {
        x: MARGIN.left,
        y: sheet.y,
        width: contentWidth(sheet),
        height: sheet.height - sheet.y - MARGIN.bottom - 4,
      });
    }
  }
}

function drillingPages(booklet: Booklet, model: WardrobeModel): void {
  const rows: string[][] = [];
  for (const part of model.parts) {
    for (const op of part.ops) {
      if (op.kind === "hole") {
        rows.push([part.label, `Face ${op.face}`, String(op.l), String(op.w), `Ø${op.diameter}`, String(op.depth)]);
      } else if (op.kind === "edge-hole") {
        rows.push([
          part.label,
          `Edge ${part.edgeLabels[op.edge]}`,
          String(op.along),
          String(op.acrossThickness),
          `Ø${op.diameter}`,
          String(op.depth),
        ]);
      }
    }
  }
  if (rows.length === 0) return;
  table(booklet, {
    title: "Drilling coordinates",
    subtitle: "Every hole, measured from the datum corner marked on each panel drawing",
    columns: [
      { header: "Panel", width: 58 },
      { header: "Face / edge", width: 26 },
      { header: "Along length", width: 24, align: "end" },
      { header: "Across", width: 20, align: "end" },
      { header: "Bore", width: 16, align: "end" },
      { header: "Depth", width: 16, align: "end" },
    ],
    rows,
    landscape: false,
    mono: true,
  });
}

/* --------------------------------------------------------- layout plumbing - */

function addSheet(booklet: Booklet, landscape: boolean): Sheet {
  const width = landscape ? A4.height : A4.width;
  const height = landscape ? A4.width : A4.height;
  const page = booklet.doc.addPage([width * MM, height * MM]);
  const sheet: Sheet = { page, width, height, y: MARGIN.top };
  booklet.sheets.push(sheet);
  return sheet;
}

function contentWidth(sheet: Sheet): number {
  return sheet.width - MARGIN.left - MARGIN.right;
}

function heading(booklet: Booklet, sheet: Sheet, title: string, subtitle?: string): void {
  drawText(sheet, booklet.fonts.bold, title, {
    x: MARGIN.left,
    y: sheet.y,
    size: 5,
    color: INK,
  });
  sheet.y += 6.6;
  if (subtitle) {
    drawText(sheet, booklet.fonts.regular, subtitle, {
      x: MARGIN.left,
      y: sheet.y,
      size: 2.9,
      color: MUTED,
    });
    sheet.y += 4.6;
  }
  rule(sheet, MARGIN.left, sheet.y, contentWidth(sheet));
  sheet.y += 4.5;
}

function rule(sheet: Sheet, x: number, y: number, width: number): void {
  sheet.page.drawLine({
    start: { x: x * MM, y: (sheet.height - y) * MM },
    end: { x: (x + width) * MM, y: (sheet.height - y) * MM },
    thickness: 0.2 * MM,
    color: HAIRLINE,
  });
}

type TextOptions = {
  readonly x: number;
  /** Distance from the top of the page to the top of the text. */
  readonly y: number;
  readonly size: number;
  readonly color?: RGB;
  readonly align?: "start" | "middle" | "end";
  readonly rotate?: number;
  readonly tracking?: number;
  readonly opacity?: number;
};

function drawText(sheet: Sheet, font: PDFFont, raw: string, options: TextOptions): void {
  const text = ansi(raw);
  if (!text) return;
  const size = options.size * MM;
  const width = font.widthOfTextAtSize(text, size) + (options.tracking ?? 0) * MM * (text.length - 1);
  const dx = options.align === "middle" ? -width / 2 : options.align === "end" ? -width : 0;
  // pdf-lib places the baseline at y; the caller thinks in terms of the text's top.
  const baseline = (sheet.height - options.y) * MM - size * 0.8;
  sheet.page.drawText(text, {
    x: options.x * MM + dx,
    y: baseline,
    size,
    font,
    color: options.color ?? INK,
    rotate: options.rotate ? degrees(options.rotate) : undefined,
    opacity: options.opacity,
    ...(options.tracking ? { characterSpacing: options.tracking * MM } : {}),
  });
}

type WrapOptions = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly size: number;
  readonly color?: RGB;
  readonly lineHeight: number;
};

/** Draws wrapped text and returns the y where the next line would start. */
function wrapText(sheet: Sheet, font: PDFFont, raw: string, options: WrapOptions): number {
  const size = options.size * MM;
  const maxWidth = options.width * MM;
  const words = ansi(raw).split(/\s+/).filter(Boolean);
  let line = "";
  let y = options.y;

  const flush = () => {
    if (!line) return;
    drawText(sheet, font, line, { x: options.x, y, size: options.size, color: options.color });
    y += options.lineHeight;
    line = "";
  };

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      flush();
      line = word;
    } else {
      line = candidate;
    }
  }
  flush();
  return y;
}

function keyValue(
  sheet: Sheet,
  fonts: Fonts,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
): number {
  const labelWidth = Math.min(34, width * 0.45);
  drawText(sheet, fonts.regular, label, { x, y, size: 2.9, color: MUTED });
  const end = wrapText(sheet, fonts.regular, value, {
    x: x + labelWidth,
    y,
    width: width - labelWidth,
    size: 2.9,
    color: INK,
    lineHeight: 3.9,
  });
  return Math.max(end, y + 4.2);
}

function writeLines(sheet: Sheet, fonts: Fonts, lines: readonly string[]): void {
  for (const line of lines) {
    if (sheet.y > sheet.height - MARGIN.bottom - 4) return;
    drawText(sheet, fonts.regular, line, {
      x: MARGIN.left,
      y: sheet.y,
      size: 2.9,
      color: INK,
    });
    sheet.y += 4.2;
  }
}

/* ------------------------------------------------------------------ tables - */

type Column = {
  readonly header: string;
  readonly width: number;
  readonly align?: "start" | "end";
};

type TableSpec = {
  readonly title: string;
  readonly subtitle?: string;
  readonly columns: readonly Column[];
  readonly rows: readonly (readonly string[])[];
  readonly landscape: boolean;
  readonly mono?: boolean;
};

function table(booklet: Booklet, spec: TableSpec): Sheet {
  let sheet = addSheet(booklet, spec.landscape);
  heading(booklet, sheet, spec.title, spec.subtitle);

  const rowHeight = 4.6;
  const bodyFont = spec.mono ? booklet.fonts.mono : booklet.fonts.regular;
  const fontSize = spec.mono ? 2.6 : 2.8;

  const header = () => {
    let x = MARGIN.left;
    for (const column of spec.columns) {
      drawText(sheet, booklet.fonts.bold, column.header, {
        x: column.align === "end" ? x + column.width - 1 : x,
        y: sheet.y,
        size: 2.6,
        color: MUTED,
        align: column.align === "end" ? "end" : "start",
      });
      x += column.width;
    }
    sheet.y += 4.2;
    rule(sheet, MARGIN.left, sheet.y, contentWidth(sheet));
    sheet.y += 1.6;
  };

  header();

  spec.rows.forEach((row, index) => {
    if (sheet.y > sheet.height - MARGIN.bottom - rowHeight) {
      sheet = addSheet(booklet, spec.landscape);
      heading(booklet, sheet, `${spec.title} (continued)`);
      header();
    }
    if (index % 2 === 1) {
      sheet.page.drawRectangle({
        x: (MARGIN.left - 1) * MM,
        y: (sheet.height - sheet.y - rowHeight + 0.6) * MM,
        width: (contentWidth(sheet) + 2) * MM,
        height: rowHeight * MM,
        color: BAND,
      });
    }
    let x = MARGIN.left;
    spec.columns.forEach((column, columnIndex) => {
      const value = row[columnIndex] ?? "";
      drawText(sheet, columnIndex === 1 ? booklet.fonts.regular : bodyFont, clip(value, bodyFont, column.width - 1.5, fontSize), {
        x: column.align === "end" ? x + column.width - 1.5 : x,
        y: sheet.y + 0.4,
        size: fontSize,
        color: INK,
        align: column.align === "end" ? "end" : "start",
      });
      x += column.width;
    });
    sheet.y += rowHeight;
  });

  return sheet;
}

function clip(raw: string, font: PDFFont, widthMm: number, sizeMm: number): string {
  const text = ansi(raw);
  const max = widthMm * MM;
  const size = sizeMm * MM;
  if (font.widthOfTextAtSize(text, size) <= max) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > max) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/* --------------------------------------------------- drawings onto the page - */

type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/**
 * Draws a `Drawing` into a box on the page, scaled to fit. Stroke widths stay at a
 * fixed hairline in millimetres rather than scaling with the drawing, so a small
 * panel does not print with fatter lines than a large one.
 */
function placeDrawing(booklet: Booklet, sheet: Sheet, drawing: Drawing, box: Box): void {
  if (drawing.width <= 0 || drawing.height <= 0) return;
  const scale = Math.min(box.width / drawing.width, box.height / drawing.height);
  const originX = box.x + (box.width - drawing.width * scale) / 2 - drawing.x * scale;
  // Drawing y points up; the page cursor points down, so anchor on the drawing's top.
  const topY = box.y + (box.height - drawing.height * scale) / 2;
  const originY = sheet.height - topY - (drawing.y + drawing.height) * scale;

  const px = (value: number) => (originX + value * scale) * MM;
  const py = (value: number) => (originY + value * scale) * MM;

  for (const primitive of drawing.primitives) {
    drawPrimitive(booklet, sheet, primitive, px, py, scale);
  }
}

function drawPrimitive(
  booklet: Booklet,
  sheet: Sheet,
  primitive: Primitive,
  px: (value: number) => number,
  py: (value: number) => number,
  scale: number,
): void {
  const style = primitive.style;
  const color = LAYER_INK[style.layer] ?? INK;
  const thickness = Math.max(style.strokeWidth ?? 0.3, 0.15) * MM;
  const dash = style.dash?.map((value) => value * MM);
  const opacity = style.opacity;

  switch (primitive.kind) {
    case "rect": {
      const x = px(primitive.x);
      const y = py(primitive.y);
      const width = primitive.width * scale * MM;
      const height = primitive.height * scale * MM;
      if (style.hatch) {
        hatchRect(sheet, x, y, width, height, color);
      }
      sheet.page.drawRectangle({
        x,
        y,
        width,
        height,
        borderColor: color,
        borderWidth: thickness,
        borderDashArray: dash,
        borderOpacity: opacity,
        color: style.fill && style.fill !== "none" ? BAND : undefined,
        opacity: style.fill && style.fill !== "none" ? 0.6 : undefined,
      });
      break;
    }
    case "line":
      sheet.page.drawLine({
        start: { x: px(primitive.x1), y: py(primitive.y1) },
        end: { x: px(primitive.x2), y: py(primitive.y2) },
        thickness,
        color,
        dashArray: dash,
        opacity,
      });
      break;
    case "circle":
      sheet.page.drawCircle({
        x: px(primitive.cx),
        y: py(primitive.cy),
        size: Math.max(primitive.r * scale * MM, 0.15 * MM),
        borderColor: color,
        borderWidth: thickness,
        color: style.fill && style.fill !== "none" ? color : undefined,
        opacity,
        borderOpacity: opacity,
      });
      break;
    case "polyline": {
      const points = primitive.points;
      for (let index = 0; index < points.length - 1; index += 1) {
        const a = points[index] as readonly [number, number];
        const b = points[index + 1] as readonly [number, number];
        sheet.page.drawLine({
          start: { x: px(a[0]), y: py(a[1]) },
          end: { x: px(b[0]), y: py(b[1]) },
          thickness,
          color,
          dashArray: dash,
          opacity,
        });
      }
      if (primitive.closed && points.length > 2) {
        const first = points[0] as readonly [number, number];
        const last = points[points.length - 1] as readonly [number, number];
        sheet.page.drawLine({
          start: { x: px(last[0]), y: py(last[1]) },
          end: { x: px(first[0]), y: py(first[1]) },
          thickness,
          color,
          dashArray: dash,
          opacity,
        });
      }
      break;
    }
    case "text": {
      const font = primitive.mono ? booklet.fonts.mono : booklet.fonts.regular;
      const label = ansi(primitive.text);
      if (!label) break;
      const size = Math.max(primitive.size * scale, 1.35) * MM;
      const width = font.widthOfTextAtSize(label, size);
      const rotate = primitive.rotate ?? 0;
      const dx =
        primitive.anchor === "middle" ? -width / 2 : primitive.anchor === "end" ? -width : 0;
      const dy =
        primitive.baseline === "top"
          ? -size * 0.8
          : primitive.baseline === "middle"
            ? -size * 0.32
            : 0;
      // Offsets are along the rotated text axes, so rotate them with the glyphs.
      const rad = (rotate * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      sheet.page.drawText(label, {
        x: px(primitive.x) + dx * cos - dy * sin,
        y: py(primitive.y) + dx * sin + dy * cos,
        size,
        font,
        color,
        rotate: rotate ? degrees(rotate) : undefined,
        opacity,
      });
      break;
    }
  }
}

/** 45 degree hatching, the drawing convention for material that gets removed. */
function hatchRect(
  sheet: Sheet,
  x: number,
  y: number,
  width: number,
  height: number,
  color: RGB,
): void {
  const pitch = 2.4 * MM;
  const span = width + height;
  for (let offset = 0; offset <= span; offset += pitch) {
    // Line of slope 1 through (x + offset - height, y); clip it to the rectangle.
    const x0 = offset - height;
    const startX = Math.max(x0, 0);
    const startY = startX - x0;
    const endX = Math.min(offset, width);
    const endY = endX - x0;
    if (endX <= startX || startY > height || endY < 0) continue;
    sheet.page.drawLine({
      start: { x: x + startX, y: y + Math.min(startY, height) },
      end: { x: x + endX, y: y + Math.min(endY, height) },
      thickness: 0.12 * MM,
      color,
      opacity: 0.4,
    });
  }
}

/* ------------------------------------------------------------------ footers - */

function paginate(booklet: Booklet): void {
  const total = booklet.sheets.length;
  booklet.sheets.forEach((sheet, index) => {
    if (index === 0) return;
    const y = sheet.height - MARGIN.bottom + 2;
    rule(sheet, MARGIN.left, y - 3, contentWidth(sheet));
    drawText(sheet, booklet.fonts.regular, booklet.title, {
      x: MARGIN.left,
      y,
      size: 2.5,
      color: MUTED,
    });
    drawText(sheet, booklet.fonts.regular, `${index + 1} / ${total}`, {
      x: sheet.width - MARGIN.right,
      y,
      size: 2.5,
      color: MUTED,
      align: "end",
    });
  });
}
