import { Html, Line } from "@react-three/drei";
import { useMemo } from "react";
import type { Part } from "@/engine/core/part";
import { formatDim } from "@/engine/core/units";
import type { WardrobeModel } from "@/engine/solver";
import { SCENE_SCALE } from "./scene";

/**
 * Overall dimensions, drawn the way an elevation is dimensioned: witness lines standing
 * off the object, an extension line between them, and the figure sitting on the line.
 * When a panel is selected its own size is added, because "how big is this piece" is the
 * question you have while looking at it.
 */

type DimensionsProps = {
  readonly model: WardrobeModel;
  readonly selected: Part | null;
};

const OFFSET = 90;
const TICK = 26;

export function Dimensions({ model, selected }: DimensionsProps) {
  const { min, max } = model.bounds;

  const overall = useMemo(
    () => [
      /* Width, below the front of the wardrobe. */
      dimension(
        [min[0], min[1] - OFFSET, max[2]],
        [max[0], min[1] - OFFSET, max[2]],
        [0, -1, 0],
        formatDim(model.spec.carcase.width),
      ),
      /* Height, off the right-hand side. */
      dimension(
        [max[0] + OFFSET, min[1], max[2]],
        [max[0] + OFFSET, max[1], max[2]],
        [1, 0, 0],
        formatDim(model.spec.carcase.height),
      ),
      /* Depth, along the floor on the right. */
      dimension(
        [max[0] + OFFSET, min[1] - OFFSET, min[2]],
        [max[0] + OFFSET, min[1] - OFFSET, max[2]],
        [0, -1, 0],
        formatDim(model.spec.carcase.depth),
      ),
    ],
    [min, max, model.spec.carcase],
  );

  return (
    <group>
      {overall.map((entry) => (
        <DimensionLine
          key={entry.key}
          from={entry.from}
          to={entry.to}
          witness={entry.witness}
          label={entry.label}
        />
      ))}
      {selected ? <SelectedLabel part={selected} /> : null}
    </group>
  );
}

type Point = readonly [number, number, number];

type DimensionEntry = {
  readonly key: string;
  readonly from: Point;
  readonly to: Point;
  readonly witness: Point;
  readonly label: string;
};

function dimension(from: Point, to: Point, witness: Point, label: string): DimensionEntry {
  return { key: `${label}-${from.join()}-${to.join()}`, from, to, witness, label };
}

function scaled(point: Point): [number, number, number] {
  return [point[0] * SCENE_SCALE, point[1] * SCENE_SCALE, point[2] * SCENE_SCALE];
}

function DimensionLine({ from, to, witness, label }: Omit<DimensionEntry, "key">) {
  const tick: Point = [witness[0] * TICK, witness[1] * TICK, witness[2] * TICK];
  const mid: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];

  const points = useMemo(
    () => [
      [scaled(from), scaled(add(from, tick))],
      [scaled(to), scaled(add(to, tick))],
      [scaled(from), scaled(to)],
    ],
    [from, to, tick],
  );

  return (
    <group>
      {points.map((segment, index) => (
        <Line
          key={index}
          points={segment}
          color="#8b96a5"
          lineWidth={1}
          transparent
          opacity={index === 2 ? 0.9 : 0.55}
        />
      ))}
      <Html position={scaled(mid)} center distanceFactor={4} zIndexRange={[8, 0]}>
        <span className="tabular rounded bg-bg/85 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-muted ring-1 ring-line/70">
          {label}
        </span>
      </Html>
    </group>
  );
}

function add(a: Point, b: Point): Point {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function SelectedLabel({ part }: { readonly part: Part }) {
  const { origin, lAxis, wAxis, tAxis } = part.placement;
  const centre: Point = [
    origin[0] + (lAxis[0] * part.length + wAxis[0] * part.width + tAxis[0] * part.thickness) / 2,
    origin[1] + (lAxis[1] * part.length + wAxis[1] * part.width + tAxis[1] * part.thickness) / 2,
    origin[2] + (lAxis[2] * part.length + wAxis[2] * part.width + tAxis[2] * part.thickness) / 2,
  ];

  return (
    <Html position={scaled(centre)} center distanceFactor={3.2} zIndexRange={[10, 0]}>
      <div className="pointer-events-none rounded-md bg-accent px-2 py-1 text-[11px] leading-tight font-medium whitespace-nowrap text-on-accent shadow-lg">
        {part.label}
        <span className="tabular block opacity-80">
          {part.length} × {part.width} × {part.thickness}
        </span>
      </div>
    </Html>
  );
}
