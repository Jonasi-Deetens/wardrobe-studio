/**
 * A resolution-independent drawing, in millimetres.
 *
 * One renderer builds this, and three back ends consume it: SVG for the screen, SVG
 * again inside the PDF booklet, and DXF for the CNC. Because there is only one
 * geometry pass, a hole cannot appear in one output and not another, and the printed
 * drawing cannot disagree with the machine file.
 *
 * The y axis points up, as on a drawing board. The SVG writer flips it once.
 */

export type Layer =
  | "outline"
  | "cut"
  | "hole"
  | "hole-far"
  | "groove"
  | "rabbet"
  | "banding"
  | "grain"
  | "dimension"
  | "annotation"
  | "datum"
  | "hidden";

export type Style = {
  readonly layer: Layer;
  readonly stroke?: string;
  readonly fill?: string;
  readonly strokeWidth?: number;
  readonly dash?: readonly number[];
  readonly opacity?: number;
  /** Fill with a 45 degree hatch, the drawing convention for removed material. */
  readonly hatch?: boolean;
};

export type Primitive =
  | { readonly kind: "rect"; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly style: Style; readonly radius?: number }
  | { readonly kind: "line"; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly style: Style }
  | { readonly kind: "circle"; readonly cx: number; readonly cy: number; readonly r: number; readonly style: Style }
  | { readonly kind: "polyline"; readonly points: readonly (readonly [number, number])[]; readonly closed: boolean; readonly style: Style }
  | {
      readonly kind: "text";
      readonly x: number;
      readonly y: number;
      readonly text: string;
      readonly size: number;
      readonly anchor: "start" | "middle" | "end";
      readonly baseline: "top" | "middle" | "bottom";
      readonly rotate?: number;
      readonly style: Style;
      readonly mono?: boolean;
    };

export type Drawing = {
  /** Bounds of the drawing including its dimension lines and title text. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly primitives: readonly Primitive[];
  readonly title: string;
  readonly subtitle: string;
};

/**
 * Layer names in the DXF. CAM software groups by layer, and naming hole layers by
 * diameter means the operator can assign one tool per layer and be done.
 */
export const DXF_LAYER_NAMES: Record<Layer, string> = {
  outline: "OUTLINE",
  cut: "CUT",
  hole: "HOLES",
  "hole-far": "HOLES_REVERSE",
  groove: "GROOVE",
  rabbet: "RABBET",
  banding: "EDGEBAND",
  grain: "GRAIN",
  dimension: "DIMENSIONS",
  annotation: "TEXT",
  datum: "DATUM",
  hidden: "HIDDEN",
};

export function holeLayerName(diameter: number): string {
  const text = Number.isInteger(diameter) ? String(diameter) : diameter.toFixed(1);
  return `HOLES_D${text.replace(".", "_")}`;
}
