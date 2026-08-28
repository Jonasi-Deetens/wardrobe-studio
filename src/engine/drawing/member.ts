import { getProfile } from "../catalog/profiles";
import type { Member } from "../core/member";
import { endLabel } from "../cutlist/tube";
import { formatMm } from "../core/units";
import type { Drawing, Primitive, Style } from "./types";

/**
 * A length of tube, drawn the way a fabricator wants to see it.
 *
 * Laid out flat, length left to right, with the two end cuts drawn at their real angles and
 * every hole dimensioned from the left-hand end. That is the whole job: the datum is the
 * end you put against the saw stop, so every figure on the drawing is measured from it and
 * nothing has to be added up on the shop floor.
 *
 * The mitre is drawn, not just labelled. A 45° cut sloping the wrong way is the classic
 * expensive mistake on a mitred frame, and it is obvious in a picture and invisible in a
 * number.
 */

const MARGIN = 40;

const style = (layer: Style["layer"], extra: Omit<Style, "layer"> = {}): Style => ({
  layer,
  ...extra,
});

export function renderMemberElevation(member: Member): Drawing {
  const profile = getProfile(member.profileId);
  const height = profile.height;
  const primitives: Primitive[] = [];

  /* The outline. A mitre shortens one face and leaves the other at full length, so the
     profile is a trapezium: `cut` is how far the short face is pulled in at each end. */
  const cut = (index: 0 | 1): number => {
    const end = member.ends[index];
    if (end.kind === "square") return 0;
    return Math.min(height * Math.tan((Math.min(end.angle, 80) * Math.PI) / 180), member.length / 2);
  };
  const a = cut(0);
  const b = cut(1);

  primitives.push({
    kind: "polyline",
    /* Long point at the bottom on the left, at the top on the right, which is how a pair of
       mitres that make a corner actually run. */
    points: [
      [0, 0],
      [member.length - b, 0],
      [member.length, height],
      [a, height],
    ],
    closed: true,
    style: style("outline", { strokeWidth: 1.2 }),
  });

  /* The bore, so a hollow section reads as one and the wall thickness is visible. */
  if (profile.shape !== "flat" && profile.wall > 0 && height > 2 * profile.wall) {
    primitives.push({
      kind: "line",
      x1: Math.max(a, 0),
      y1: profile.wall,
      x2: member.length - b,
      y2: profile.wall,
      style: style("hidden", { strokeWidth: 0.5, dash: [6, 4] }),
    });
    primitives.push({
      kind: "line",
      x1: Math.max(a, 0),
      y1: height - profile.wall,
      x2: member.length - b,
      y2: height - profile.wall,
      style: style("hidden", { strokeWidth: 0.5, dash: [6, 4] }),
    });
  }

  /* Holes, on the face they are drilled into, dimensioned from the left-hand end. */
  for (const op of member.ops) {
    const y = op.face === "t1" ? height - op.across : op.face === "t0" ? op.across : height / 2;
    const radius = Math.max(op.diameter / 2, 1.5);
    primitives.push({
      kind: "circle",
      cx: op.along,
      cy: Math.min(Math.max(y, radius), height - radius),
      r: radius,
      style: style("hole", { strokeWidth: 0.8 }),
    });
    primitives.push({
      kind: "text",
      x: op.along,
      y: height + 12,
      text: `${formatMm(op.along)} · Ø${op.diameter}`,
      size: 9,
      anchor: "middle",
      baseline: "bottom",
      style: style("dimension"),
      mono: true,
    });
  }

  /* Overall length, under the piece, and an end label at each end. */
  primitives.push({
    kind: "line",
    x1: 0,
    y1: -18,
    x2: member.length,
    y2: -18,
    style: style("dimension", { strokeWidth: 0.6 }),
  });
  primitives.push({
    kind: "text",
    x: member.length / 2,
    y: -24,
    text: `${formatMm(member.length)} long point to long point`,
    size: 11,
    anchor: "middle",
    baseline: "top",
    style: style("dimension"),
  });
  primitives.push({
    kind: "text",
    x: 0,
    y: height + 30,
    text: endLabel(member.ends[0]),
    size: 10,
    anchor: "start",
    baseline: "bottom",
    style: style("annotation"),
  });
  primitives.push({
    kind: "text",
    x: member.length,
    y: height + 30,
    text: endLabel(member.ends[1]),
    size: 10,
    anchor: "end",
    baseline: "bottom",
    style: style("annotation"),
  });

  return {
    x: -MARGIN,
    y: -MARGIN - 20,
    width: member.length + 2 * MARGIN,
    height: height + 2 * MARGIN + 40,
    primitives,
    title: member.label,
    subtitle: `${profile.shortName} · ${formatMm(member.length)}mm · ${endLabel(member.ends[0])} / ${endLabel(member.ends[1])}`,
  };
}
