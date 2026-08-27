import { getBanding, getMaterial } from "../catalog/materials";
import {
  OP_PURPOSE_LABELS,
  PANEL_EDGES,
  toolList,
  type Hole,
  type MachiningOp,
  type PanelEdge,
  type PanelFace,
  type Part,
} from "../core/part";
import { formatMm, mm2 } from "../core/units";
import type { Drawing, Primitive, Style } from "./types";

/**
 * The panel drilling drawing.
 *
 * Every position is measured from one declared datum corner, and the datum is marked
 * on the drawing so there is no doubt which corner it is. That single convention is
 * what makes the drawings usable at the bench: you clamp a stop at the datum, and
 * every number on the sheet is measured from it.
 *
 * Face A is drawn as you look at it. Face B is drawn flipped left to right about the
 * width axis, which is how the panel is physically turned over on the bench, so the
 * numbers on the sheet match what you measure after flipping it.
 */

/** Room around the panel for the dimension chains and the notes. */
const MARGIN_LEFT = 90;
const MARGIN_RIGHT = 30;
const MARGIN_BOTTOM = 110;
const MARGIN_TOP = 40;

const TEXT = 9;
const SMALL = 7;

export type PanelDrawingOptions = {
  /** Show holes on the far face as dashed circles, for context. */
  readonly showFarSide: boolean;
  readonly showDimensions: boolean;
  readonly showBanding: boolean;
  readonly showGrain: boolean;
};

export const DEFAULT_PANEL_DRAWING_OPTIONS: PanelDrawingOptions = {
  showFarSide: true,
  showDimensions: true,
  showBanding: true,
  showGrain: true,
};

const style = (layer: Style["layer"], extra: Omit<Style, "layer"> = {}): Style => ({
  layer,
  ...extra,
});

/**
 * Maps a panel coordinate to drawing coordinates.
 *
 * On face B the length axis is mirrored, because the panel has been turned over.
 */
function project(part: Part, face: PanelFace, l: number, w: number): [number, number] {
  return face === "A" ? [l, w] : [part.length - l, w];
}

export function renderPanelDrawing(
  part: Part,
  face: PanelFace,
  options: PanelDrawingOptions = DEFAULT_PANEL_DRAWING_OPTIONS,
): Drawing {
  const primitives: Primitive[] = [];
  const material = getMaterial(part.materialId);

  /* -------------------------------------------------------------- outline - */

  primitives.push({
    kind: "rect",
    x: 0,
    y: 0,
    width: part.length,
    height: part.width,
    style: style("outline", { strokeWidth: 0.6 }),
  });

  /* ------------------------------------------------------------- banding -- */

  if (options.showBanding) {
    primitives.push(...bandingMarks(part, face));
  }

  /* --------------------------------------------------------------- grain -- */

  if (options.showGrain && part.grain !== "none") {
    primitives.push(...grainArrow(part));
  }

  /* ---------------------------------------------- grooves, rabbets, cutouts */

  for (const op of part.ops) {
    if (op.kind === "groove") {
      primitives.push(...grooveMarks(part, face, op));
    } else if (op.kind === "rabbet") {
      primitives.push(...rabbetMarks(part, face, op));
    } else if (op.kind === "cutout") {
      primitives.push(...cutoutMarks(part, face, op));
    }
  }

  /* ---------------------------------------------------------------- holes -- */

  const nearHoles = part.ops.filter(
    (op): op is Hole => op.kind === "hole" && op.face === face,
  );
  const farHoles = part.ops.filter(
    (op): op is Hole => op.kind === "hole" && op.face !== face,
  );

  if (options.showFarSide) {
    for (const hole of farHoles) {
      const [x, y] = project(part, face, hole.l, hole.w);
      primitives.push({
        kind: "circle",
        cx: x,
        cy: y,
        r: hole.diameter / 2,
        style: style("hole-far", { strokeWidth: 0.25, dash: [2, 2], opacity: 0.55 }),
      });
    }
  }

  for (const hole of nearHoles) {
    const [x, y] = project(part, face, hole.l, hole.w);
    primitives.push({
      kind: "circle",
      cx: x,
      cy: y,
      r: hole.diameter / 2,
      style: style("hole", { strokeWidth: 0.4 }),
    });
    // A centre cross makes a Ø5 hole findable on a printed page.
    const arm = Math.max(hole.diameter / 2 + 1.5, 2.5);
    primitives.push(
      { kind: "line", x1: x - arm, y1: y, x2: x + arm, y2: y, style: style("hole", { strokeWidth: 0.15 }) },
      { kind: "line", x1: x, y1: y - arm, x2: x, y2: y + arm, style: style("hole", { strokeWidth: 0.15 }) },
    );
  }

  /* ----------------------------------------------------------- edge holes - */

  for (const op of part.ops) {
    if (op.kind !== "edge-hole") continue;
    primitives.push(...edgeHoleMarks(part, face, op));
  }

  /* ------------------------------------------------------------ datum ----- */

  const datum = project(part, face, 0, 0);
  primitives.push(
    {
      kind: "polyline",
      points: [
        [datum[0], datum[1] + 14],
        [datum[0], datum[1]],
        [datum[0] + (face === "A" ? 14 : -14), datum[1]],
      ],
      closed: false,
      style: style("datum", { strokeWidth: 1.2 }),
    },
    {
      kind: "circle",
      cx: datum[0],
      cy: datum[1],
      r: 3,
      style: style("datum", { strokeWidth: 1.2 }),
    },
    {
      kind: "text",
      x: datum[0] + (face === "A" ? 18 : -18),
      y: datum[1] + 8,
      text: `Datum: ${datumLabel(part, face)}`,
      size: SMALL,
      anchor: face === "A" ? "start" : "end",
      baseline: "bottom",
      style: style("datum"),
    },
  );

  /* ------------------------------------------------------------ dimensions - */

  if (options.showDimensions) {
    primitives.push(...overallDimensions(part));
    primitives.push(...holeDimensions(part, face, nearHoles));
  }

  /* ----------------------------------------------------------- edge labels - */

  primitives.push(
    edgeLabel(part.edgeLabels.w1, part.length / 2, part.width + 6, "bottom"),
    edgeLabel(part.edgeLabels.w0, part.length / 2, -6, "top"),
  );

  /* ------------------------------------------------------------ title block */

  const tools = toolList(part);
  const lines: string[] = [
    `${part.length} x ${part.width} x ${part.thickness} mm  ·  ${material.name}`,
    `Face ${face}${face === "B" ? " — shown flipped left to right about the width axis" : ""}  ·  grain ${part.grain === "none" ? "not directional" : `along the ${part.grain}`}`,
  ];
  if (tools.length > 0) {
    lines.push(
      `Tools: ${tools
        .map((t) => `Ø${formatMm(t.diameter)} x ${t.count}`)
        .join("   ")}`,
    );
  }
  const banded = PANEL_EDGES.filter((edge) => part.banding[edge]);
  if (banded.length > 0) {
    lines.push(
      `Edge banding: ${banded
        .map((edge) => `${part.edgeLabels[edge]} ${getBanding(part.banding[edge] as string).name}`)
        .join(", ")}`,
    );
  }
  for (const note of part.notes ?? []) lines.push(note);

  lines.forEach((line, index) => {
    primitives.push({
      kind: "text",
      x: 0,
      y: -34 - index * (TEXT + 3),
      text: line,
      size: index === 0 ? TEXT : SMALL,
      anchor: "start",
      baseline: "top",
      style: style("annotation"),
      mono: index === 0,
    });
  });

  const textHeight = 34 + lines.length * (TEXT + 3) + 10;
  const bottomMargin = Math.max(MARGIN_BOTTOM, textHeight);

  return {
    x: -MARGIN_LEFT,
    y: -bottomMargin,
    width: part.length + MARGIN_LEFT + MARGIN_RIGHT,
    height: part.width + bottomMargin + MARGIN_TOP,
    primitives,
    title: `${part.label} — face ${face}`,
    subtitle: `${part.length} x ${part.width} x ${part.thickness} mm, ${material.shortName}`,
  };
}

function datumLabel(part: Part, face: PanelFace): string {
  const lengthEdge = face === "A" ? part.edgeLabels.l0 : part.edgeLabels.l1;
  return `${lengthEdge} / ${part.edgeLabels.w0}`;
}

function edgeLabel(
  text: string,
  x: number,
  y: number,
  baseline: "top" | "bottom",
): Primitive {
  return {
    kind: "text",
    x,
    y,
    text: text.toUpperCase(),
    size: SMALL,
    anchor: "middle",
    baseline,
    style: style("annotation", { opacity: 0.75 }),
  };
}

/* --------------------------------------------------------------- banding -- */

function bandingMarks(part: Part, face: PanelFace): Primitive[] {
  const out: Primitive[] = [];
  for (const edge of PANEL_EDGES) {
    const id = part.banding[edge];
    if (!id) continue;
    const banding = getBanding(id);
    // Drawn as a band just outside the outline, so it never hides a hole and it is
    // obvious that the banding is added to the as-cut size rather than part of it.
    const thickness = Math.max(banding.thickness, 1.2);
    const rect = bandingRect(part, face, edge, thickness);
    out.push({
      kind: "rect",
      ...rect,
      style: style("banding", { fill: banding.color, stroke: banding.color, strokeWidth: 0.2, opacity: 0.9 }),
    });
  }
  return out;
}

function bandingRect(
  part: Part,
  face: PanelFace,
  edge: PanelEdge,
  thickness: number,
): { x: number; y: number; width: number; height: number } {
  const flipped = face === "B";
  const atLengthStart = flipped ? edge === "l1" : edge === "l0";
  const atLengthEnd = flipped ? edge === "l0" : edge === "l1";

  if (atLengthStart) return { x: -thickness, y: 0, width: thickness, height: part.width };
  if (atLengthEnd) return { x: part.length, y: 0, width: thickness, height: part.width };
  if (edge === "w0") return { x: 0, y: -thickness, width: part.length, height: thickness };
  return { x: 0, y: part.width, width: part.length, height: thickness };
}

/* ----------------------------------------------------------------- grain -- */

function grainArrow(part: Part): Primitive[] {
  const alongLength = part.grain === "length";
  const cx = part.length / 2;
  const cy = part.width / 2;
  const half = Math.min(alongLength ? part.length : part.width, 220) / 2 - 8;
  const head = 5;

  const [x1, y1, x2, y2] = alongLength
    ? [cx - half, cy, cx + half, cy]
    : [cx, cy - half, cx, cy + half];

  const s = style("grain", { strokeWidth: 0.4, opacity: 0.6 });
  const out: Primitive[] = [{ kind: "line", x1, y1, x2, y2, style: s }];

  for (const [hx, hy, dir] of alongLength
    ? ([
        [x1, y1, 1],
        [x2, y2, -1],
      ] as const)
    : ([
        [x1, y1, 1],
        [x2, y2, -1],
      ] as const)) {
    out.push({
      kind: "polyline",
      points: alongLength
        ? [
            [hx + dir * head, hy - head * 0.6],
            [hx, hy],
            [hx + dir * head, hy + head * 0.6],
          ]
        : [
            [hx - head * 0.6, hy + dir * head],
            [hx, hy],
            [hx + head * 0.6, hy + dir * head],
          ],
      closed: false,
      style: s,
    });
  }

  out.push({
    kind: "text",
    x: cx,
    y: cy + (alongLength ? 8 : 0),
    text: "GRAIN",
    size: SMALL,
    anchor: "middle",
    baseline: "bottom",
    style: style("grain", { opacity: 0.6 }),
    ...(alongLength ? {} : { rotate: -90 }),
  });

  return out;
}

/* ------------------------------------------------- grooves and rabbets ---- */

function grooveMarks(part: Part, face: PanelFace, op: Extract<MachiningOp, { kind: "groove" }>): Primitive[] {
  const [x1, y1] = project(part, face, op.from.l, op.from.w);
  const [x2, y2] = project(part, face, op.to.l, op.to.w);
  const half = op.width / 2;
  const horizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1);
  const onThisFace = op.face === face;

  const s = style(onThisFace ? "groove" : "hidden", {
    strokeWidth: 0.3,
    dash: onThisFace ? undefined : [3, 2],
    hatch: onThisFace,
    opacity: onThisFace ? 1 : 0.5,
  });

  return [
    {
      kind: "rect",
      x: Math.min(x1, x2) - (horizontal ? 0 : half),
      y: Math.min(y1, y2) - (horizontal ? half : 0),
      width: horizontal ? Math.abs(x2 - x1) : op.width,
      height: horizontal ? op.width : Math.abs(y2 - y1),
      style: s,
    },
    {
      kind: "text",
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2 + half + 2,
      text: `${formatMm(op.width)} wide x ${formatMm(op.depth)} deep`,
      size: SMALL,
      anchor: "middle",
      baseline: "bottom",
      style: style("annotation"),
    },
  ];
}

function rabbetMarks(part: Part, face: PanelFace, op: Extract<MachiningOp, { kind: "rabbet" }>): Primitive[] {
  const rect = bandingRect(part, face, op.edge, op.width);
  // A rabbet removes material from inside the outline, unlike banding which adds it.
  const inward =
    op.edge === "w0"
      ? { x: 0, y: 0, width: part.length, height: op.width }
      : op.edge === "w1"
        ? { x: 0, y: part.width - op.width, width: part.length, height: op.width }
        : rect.x < 0
          ? { x: 0, y: 0, width: op.width, height: part.width }
          : { x: part.length - op.width, y: 0, width: op.width, height: part.width };

  return [
    {
      kind: "rect",
      ...inward,
      style: style("rabbet", { strokeWidth: 0.3, dash: [4, 2], opacity: 0.8 }),
    },
    {
      kind: "text",
      x: inward.x + inward.width / 2,
      y: inward.y + inward.height / 2,
      text: `Rabbet ${formatMm(op.width)} x ${formatMm(op.depth)}`,
      size: SMALL,
      anchor: "middle",
      baseline: "middle",
      style: style("annotation"),
    },
  ];
}

function cutoutMarks(part: Part, face: PanelFace, op: Extract<MachiningOp, { kind: "cutout" }>): Primitive[] {
  const points = op.outline.map((p) => project(part, face, p.l, p.w));
  return [
    {
      kind: "polyline",
      points,
      closed: true,
      style: style("cut", { strokeWidth: 0.5, dash: op.through ? undefined : [4, 2] }),
    },
  ];
}

/* ------------------------------------------------------------ edge holes -- */

function edgeHoleMarks(
  part: Part,
  face: PanelFace,
  op: Extract<MachiningOp, { kind: "edge-hole" }>,
): Primitive[] {
  // An edge hole is drilled into the narrow face, so on a flat drawing it appears as
  // a short stub crossing the outline at the position along that edge.
  const stub = Math.max(op.diameter, 4);
  let x: number;
  let y: number;
  let dx = 0;
  let dy = 0;

  switch (op.edge) {
    case "l0":
      [x, y] = project(part, face, 0, op.along);
      dx = face === "A" ? -stub : stub;
      break;
    case "l1":
      [x, y] = project(part, face, part.length, op.along);
      dx = face === "A" ? stub : -stub;
      break;
    case "w0":
      [x, y] = project(part, face, op.along, 0);
      dy = -stub;
      break;
    case "w1":
      [x, y] = project(part, face, op.along, part.width);
      dy = stub;
      break;
  }

  const s = style("hole", { strokeWidth: 0.5 });
  return [
    { kind: "line", x1: x, y1: y, x2: x + dx, y2: y + dy, style: s },
    {
      kind: "circle",
      cx: x + dx / 2,
      cy: y + dy / 2,
      r: op.diameter / 2,
      style: style("hole", { strokeWidth: 0.3, dash: [1.5, 1.5] }),
    },
  ];
}

/* ------------------------------------------------------------ dimensions -- */

function dimensionLine(
  from: readonly [number, number],
  to: readonly [number, number],
  offset: number,
  label: string,
  orientation: "horizontal" | "vertical",
): Primitive[] {
  const s = style("dimension", { strokeWidth: 0.25 });
  const tick = 2.5;

  if (orientation === "horizontal") {
    const y = offset;
    return [
      { kind: "line", x1: from[0], y1: from[1], x2: from[0], y2: y, style: s },
      { kind: "line", x1: to[0], y1: to[1], x2: to[0], y2: y, style: s },
      { kind: "line", x1: from[0], y1: y, x2: to[0], y2: y, style: s },
      { kind: "line", x1: from[0] - tick, y1: y - tick, x2: from[0] + tick, y2: y + tick, style: s },
      { kind: "line", x1: to[0] - tick, y1: y - tick, x2: to[0] + tick, y2: y + tick, style: s },
      {
        kind: "text",
        x: (from[0] + to[0]) / 2,
        y: y + 2,
        text: label,
        size: SMALL,
        anchor: "middle",
        baseline: "bottom",
        style: style("dimension"),
        mono: true,
      },
    ];
  }

  const x = offset;
  return [
    { kind: "line", x1: from[0], y1: from[1], x2: x, y2: from[1], style: s },
    { kind: "line", x1: to[0], y1: to[1], x2: x, y2: to[1], style: s },
    { kind: "line", x1: x, y1: from[1], x2: x, y2: to[1], style: s },
    { kind: "line", x1: x - tick, y1: from[1] - tick, x2: x + tick, y2: from[1] + tick, style: s },
    { kind: "line", x1: x - tick, y1: to[1] - tick, x2: x + tick, y2: to[1] + tick, style: s },
    {
      kind: "text",
      x: x - 3,
      y: (from[1] + to[1]) / 2,
      text: label,
      size: SMALL,
      anchor: "middle",
      baseline: "middle",
      rotate: -90,
      style: style("dimension"),
      mono: true,
    },
  ];
}

function overallDimensions(part: Part): Primitive[] {
  return [
    ...dimensionLine([0, 0], [part.length, 0], -20, `${formatMm(part.length)}`, "horizontal"),
    ...dimensionLine([0, 0], [0, part.width], -20, `${formatMm(part.width)}`, "vertical"),
  ];
}

/**
 * Dimensions for the holes.
 *
 * Holes that form a row at a constant pitch get one ordinate chain rather than
 * thirty separate dimension lines: the pitch and count say everything, and the sheet
 * stays readable. Isolated holes get their own pair of dimensions.
 */
function holeDimensions(part: Part, face: PanelFace, holes: readonly Hole[]): Primitive[] {
  if (holes.length === 0) return [];
  const out: Primitive[] = [];

  const rows = groupIntoRows(holes);
  let verticalOffset = -40;

  for (const row of rows) {
    const projected = row.holes
      .map((hole) => project(part, face, hole.l, hole.w))
      .sort((a, b) => a[0] - b[0]);
    const first = projected[0];
    const last = projected.at(-1);
    if (!first || !last) continue;

    // One dimension for how far the row sits from the datum edge.
    out.push(
      ...dimensionLine(
        [first[0], 0],
        [first[0], first[1]],
        Math.min(-40, first[0] - 30),
        `${formatMm(row.w)}`,
        "vertical",
      ),
    );

    if (row.holes.length === 1) {
      out.push(
        ...dimensionLine([0, first[1]], [first[0], first[1]], verticalOffset, `${formatMm(projected[0]?.[0] ?? 0)}`, "horizontal"),
      );
      verticalOffset -= 16;
      continue;
    }

    const pitch = detectPitch(projected.map((p) => p[0]));
    out.push(
      ...dimensionLine(
        [first[0], first[1]],
        [last[0], first[1]],
        verticalOffset,
        pitch
          ? `${row.holes.length} x Ø${formatMm(row.diameter)} at ${formatMm(pitch)} = ${formatMm(last[0] - first[0])}`
          : `${row.holes.length} x Ø${formatMm(row.diameter)}`,
        "horizontal",
      ),
      ...dimensionLine([0, first[1]], [first[0], first[1]], verticalOffset - 14, `${formatMm(first[0])}`, "horizontal"),
    );
    verticalOffset -= 30;
  }

  return out;
}

type HoleRow = {
  readonly w: number;
  readonly diameter: number;
  readonly purpose: string;
  readonly holes: Hole[];
};

/** Groups holes that share a face position across the width and a diameter. */
function groupIntoRows(holes: readonly Hole[]): HoleRow[] {
  const rows = new Map<string, HoleRow>();
  for (const hole of holes) {
    const key = `${mm2(hole.w)}/${hole.diameter}/${hole.purpose}`;
    const existing = rows.get(key);
    if (existing) existing.holes.push(hole);
    else
      rows.set(key, {
        w: mm2(hole.w),
        diameter: hole.diameter,
        purpose: OP_PURPOSE_LABELS[hole.purpose],
        holes: [hole],
      });
  }
  return [...rows.values()].sort((a, b) => a.w - b.w || a.diameter - b.diameter);
}

/** The common pitch of a row, or null when the spacing is irregular. */
function detectPitch(positions: readonly number[]): number | null {
  if (positions.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < positions.length; i += 1) {
    gaps.push(mm2((positions[i] as number) - (positions[i - 1] as number)));
  }
  const first = gaps[0] as number;
  return gaps.every((gap) => Math.abs(gap - first) < 0.2) ? first : null;
}
