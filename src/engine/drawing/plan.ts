import { formatMm } from "../core/units";
import type { ProjectModel } from "../project";
import type { Drawing, Primitive, Style } from "./types";

/**
 * The room in plan.
 *
 * Drawn the way a plan is always drawn: looking down, front of the room at the bottom.
 * Room space has +Z running from the back wall towards the front and the drawing's y axis
 * pointing up, so z is flipped once here and nowhere else.
 *
 * It is a locating drawing, not a manufacturing one — it answers "which unit is which and
 * where does it stand", so it carries unit outlines, names and the room's own dimensions,
 * and leaves panel-level detail to the per-panel drawings.
 */

const MARGIN = 400;

const style = (layer: Style["layer"], extra: Omit<Style, "layer"> = {}): Style => ({
  layer,
  ...extra,
});

export function renderRoomPlan(project: ProjectModel): Drawing {
  const room = project.room.spec;
  const primitives: Primitive[] = [];
  /* Plan y: 0 at the front wall, room.depth at the back. */
  const py = (z: number): number => room.depth - z;

  /* The wall structure, then the clear space inside it. */
  primitives.push({
    kind: "rect",
    x: -room.wallThickness,
    y: -room.wallThickness,
    width: room.width + 2 * room.wallThickness,
    height: room.depth + 2 * room.wallThickness,
    style: style("hidden", { strokeWidth: 0.6 }),
  });
  primitives.push({
    kind: "rect",
    x: 0,
    y: 0,
    width: room.width,
    height: room.depth,
    style: style("outline", { strokeWidth: 1.2 }),
  });

  /* Openings, as the gap they are: the wall is broken across the opening's width. */
  for (const wall of project.room.walls) {
    for (const opening of wall.openings) {
      const a = alongWall(wall, opening.u);
      const b = alongWall(wall, opening.u + opening.width);
      primitives.push({
        kind: "line",
        x1: a.x,
        y1: py(a.z),
        x2: b.x,
        y2: py(b.z),
        style: style("cut", { strokeWidth: 3, opacity: 0.9 }),
      });
    }
  }

  /* Unit footprints, already in room space and already turned by their yaw. */
  for (const unit of project.units) {
    const points = unit.footprint.map(
      (corner) => [corner[0], py(corner[2])] as readonly [number, number],
    );
    primitives.push({
      kind: "polyline",
      points,
      closed: true,
      style: style("cut", { strokeWidth: 1.6, fill: "none" }),
    });

    const cx = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const cy = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    primitives.push({
      kind: "text",
      x: cx,
      y: cy + 60,
      text: unit.name,
      size: 90,
      anchor: "middle",
      baseline: "middle",
      style: style("annotation"),
    });
    primitives.push({
      kind: "text",
      x: cx,
      y: cy - 70,
      text: `${formatMm(unit.at.x)}, ${formatMm(unit.at.z)}${unit.at.yaw ? ` · ${formatMm(unit.at.yaw)}°` : ""}`,
      size: 70,
      anchor: "middle",
      baseline: "middle",
      style: style("dimension"),
      mono: true,
    });
  }

  /* Overall dimensions, outside the walls. */
  primitives.push({
    kind: "text",
    x: room.width / 2,
    y: -room.wallThickness - 140,
    text: `${formatMm(room.width)} wide`,
    size: 90,
    anchor: "middle",
    baseline: "top",
    style: style("dimension"),
  });
  primitives.push({
    kind: "text",
    x: -room.wallThickness - 140,
    y: room.depth / 2,
    text: `${formatMm(room.depth)} deep`,
    size: 90,
    anchor: "middle",
    baseline: "bottom",
    rotate: 90,
    style: style("dimension"),
  });
  primitives.push({
    kind: "text",
    x: 0,
    y: room.depth + room.wallThickness + 60,
    text: "Back wall",
    size: 70,
    anchor: "start",
    baseline: "bottom",
    style: style("dimension"),
  });

  return {
    x: -MARGIN,
    y: -MARGIN,
    width: room.width + 2 * MARGIN,
    height: room.depth + 2 * MARGIN,
    primitives,
    title: "Room plan",
    subtitle: `${formatMm(room.width)} × ${formatMm(room.depth)} × ${formatMm(room.height)} · ${project.units.length} unit${project.units.length === 1 ? "" : "s"}`,
  };
}

/** Where a distance along a wall lands on the floor, in room space. */
function alongWall(
  wall: ProjectModel["room"]["walls"][number],
  u: number,
): { readonly x: number; readonly z: number } {
  return {
    x: wall.origin[0] + wall.uAxis[0] * u,
    z: wall.origin[2] + wall.uAxis[2] * u,
  };
}
