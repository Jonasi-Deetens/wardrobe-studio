import { Colors, DxfWriter, LWPolylineFlags, point3d, Units } from "@tarikjabiri/dxf";
import { PANEL_EDGES, type PanelEdge, type Part, type PanelFace } from "../core/part";
import { holeLayerName } from "../drawing/types";

/**
 * DXF export, one file per panel face.
 *
 * Holes go on layers named by diameter — `HOLES_D5`, `HOLES_D35` — because that is
 * how CAM software groups work: assign one tool per layer and the whole panel is
 * programmed. Grooves and rabbets get their own layers rather than being drawn as
 * pockets, since the depth cannot be expressed in a 2D DXF and has to be set in CAM
 * anyway; the note text carries the depth so it is not lost.
 *
 * Coordinates match the panel drawing exactly: origin at the datum corner, x along
 * the length, y across the width, and face B mirrored about the width axis, which is
 * how the panel is turned over on the machine bed.
 */

const LAYER_OUTLINE = "OUTLINE";
const LAYER_GROOVE = "GROOVE";
const LAYER_RABBET = "RABBET";
const LAYER_CUTOUT = "CUTOUT";
const LAYER_EDGE_HOLE = "HOLES_EDGE";
const LAYER_NOTES = "NOTES";
const LAYER_BANDING = "EDGEBAND";

export function partToDxf(part: Part, face: PanelFace): string {
  const dxf = new DxfWriter();
  dxf.setUnits(Units.Millimeters);

  dxf.addLayer(LAYER_OUTLINE, Colors.White);
  dxf.addLayer(LAYER_GROOVE, Colors.Magenta);
  dxf.addLayer(LAYER_RABBET, Colors.Magenta);
  dxf.addLayer(LAYER_CUTOUT, Colors.Yellow);
  dxf.addLayer(LAYER_EDGE_HOLE, Colors.Green);
  dxf.addLayer(LAYER_NOTES, Colors.Blue);
  dxf.addLayer(LAYER_BANDING, Colors.Cyan);

  const project = (l: number, w: number): [number, number] =>
    face === "A" ? [l, w] : [part.length - l, w];

  /* Outline, as a closed polyline so CAM reads it as one profile. */
  dxf.setCurrentLayerName(LAYER_OUTLINE);
  dxf.addLWPolyline(
    [
      { point: { x: 0, y: 0 } },
      { point: { x: part.length, y: 0 } },
      { point: { x: part.length, y: part.width } },
      { point: { x: 0, y: part.width } },
    ],
    { flags: LWPolylineFlags.Closed },
  );

  /* Holes, grouped onto a layer per diameter. */
  const diameters = new Set<number>();
  for (const op of part.ops) {
    if (op.kind === "hole") diameters.add(op.diameter);
    if (op.kind === "edge-hole") diameters.add(op.diameter);
  }
  for (const diameter of [...diameters].sort((a, b) => a - b)) {
    dxf.addLayer(holeLayerName(diameter), colorForDiameter(diameter));
  }

  for (const op of part.ops) {
    switch (op.kind) {
      case "hole": {
        if (op.face !== face) continue;
        const [x, y] = project(op.l, op.w);
        dxf.setCurrentLayerName(holeLayerName(op.diameter));
        dxf.addCircle(point3d(x, y, 0), op.diameter / 2);
        break;
      }
      case "edge-hole": {
        // An edge hole is drilled into the narrow face, so in plan it is a line
        // crossing the outline at the position along that edge.
        const [x, y, dx, dy] = edgeHoleVector(part, face, op.edge, op.along, op.depth);
        dxf.setCurrentLayerName(LAYER_EDGE_HOLE);
        dxf.addLine(point3d(x, y, 0), point3d(x + dx, y + dy, 0));
        dxf.setCurrentLayerName(LAYER_NOTES);
        dxf.addText(point3d(x + dx, y + dy, 0), 4, `Ø${op.diameter} x ${op.depth} deep`);
        break;
      }
      case "groove": {
        if (op.face !== face) continue;
        const [x1, y1] = project(op.from.l, op.from.w);
        const [x2, y2] = project(op.to.l, op.to.w);
        dxf.setCurrentLayerName(LAYER_GROOVE);
        dxf.addLine(point3d(x1, y1, 0), point3d(x2, y2, 0));
        dxf.setCurrentLayerName(LAYER_NOTES);
        dxf.addText(
          point3d((x1 + x2) / 2, (y1 + y2) / 2 + 4, 0),
          4,
          `Groove ${op.width} wide x ${op.depth} deep`,
        );
        break;
      }
      case "rabbet": {
        const line = rabbetLine(part, face, op.edge, op.width);
        dxf.setCurrentLayerName(LAYER_RABBET);
        dxf.addLine(point3d(line[0], line[1], 0), point3d(line[2], line[3], 0));
        dxf.setCurrentLayerName(LAYER_NOTES);
        dxf.addText(
          point3d((line[0] + line[2]) / 2, (line[1] + line[3]) / 2 + 4, 0),
          4,
          `Rabbet ${op.width} x ${op.depth} deep`,
        );
        break;
      }
      case "cutout": {
        dxf.setCurrentLayerName(LAYER_CUTOUT);
        dxf.addLWPolyline(
          op.outline.map((p) => {
            const [x, y] = project(p.l, p.w);
            return { point: { x, y } };
          }),
          { flags: LWPolylineFlags.Closed },
        );
        break;
      }
    }
  }

  /* Banded edges, marked so the operator knows which edges to run. */
  dxf.setCurrentLayerName(LAYER_BANDING);
  for (const edge of PANEL_EDGES) {
    if (!part.banding[edge]) continue;
    const line = rabbetLine(part, face, edge, 0);
    dxf.addLine(point3d(line[0], line[1], 0), point3d(line[2], line[3], 0));
  }

  /* Title text below the panel. */
  dxf.setCurrentLayerName(LAYER_NOTES);
  dxf.addText(point3d(0, -14, 0), 8, `${part.label} — face ${face}`);
  dxf.addText(
    point3d(0, -26, 0),
    5,
    `${part.length} x ${part.width} x ${part.thickness} mm, datum at ${
      face === "A" ? part.edgeLabels.l0 : part.edgeLabels.l1
    } / ${part.edgeLabels.w0}${face === "B" ? ", mirrored about the width axis" : ""}`,
  );

  return dxf.stringify();
}

/** A distinct colour per common bore size, so the layers are easy to tell apart. */
function colorForDiameter(diameter: number): number {
  if (diameter <= 3.5) return Colors.Blue;
  if (diameter <= 5) return Colors.Cyan;
  if (diameter <= 8) return Colors.Green;
  if (diameter <= 10) return Colors.Yellow;
  if (diameter <= 20) return Colors.Magenta;
  return Colors.Red;
}

function edgeHoleVector(
  part: Part,
  face: PanelFace,
  edge: PanelEdge,
  along: number,
  depth: number,
): [number, number, number, number] {
  const flip = face === "B";
  switch (edge) {
    case "l0":
      return flip
        ? [part.length, along, -depth, 0]
        : [0, along, depth, 0];
    case "l1":
      return flip ? [0, along, depth, 0] : [part.length, along, -depth, 0];
    case "w0":
      return [flip ? part.length - along : along, 0, 0, depth];
    case "w1":
      return [flip ? part.length - along : along, part.width, 0, -depth];
  }
}

function rabbetLine(
  part: Part,
  face: PanelFace,
  edge: "l0" | "l1" | "w0" | "w1",
  inset: number,
): [number, number, number, number] {
  const flip = face === "B";
  const atStart = flip ? edge === "l1" : edge === "l0";
  const atEnd = flip ? edge === "l0" : edge === "l1";

  if (atStart) return [inset, 0, inset, part.width];
  if (atEnd) return [part.length - inset, 0, part.length - inset, part.width];
  if (edge === "w0") return [0, inset, part.length, inset];
  return [0, part.width - inset, part.length, part.width - inset];
}

export type DxfFile = { readonly filename: string; readonly content: string };

/**
 * A DXF for every panel. Face B is only exported when there is something on it, so
 * the export is not padded with blank rectangles.
 */
export function modelToDxfFiles(parts: readonly Part[]): DxfFile[] {
  const files: DxfFile[] = [];
  for (const part of parts) {
    const faces: PanelFace[] = ["A"];
    const hasFaceB = part.ops.some(
      (op) =>
        (op.kind === "hole" && op.face === "B") ||
        (op.kind === "groove" && op.face === "B") ||
        (op.kind === "rabbet" && op.face === "B"),
    );
    if (hasFaceB) faces.push("B");

    for (const face of faces) {
      files.push({
        filename: `${safeName(part.label)}-face-${face}.dxf`,
        content: partToDxf(part, face),
      });
    }
  }
  return files;
}

function safeName(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
