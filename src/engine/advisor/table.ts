import { getMaterial } from "../catalog/materials";
import { getProfile } from "../catalog/profiles";
import { mm2 } from "../core/units";
import type { WorkTableModel } from "../table";
import type { Finding } from ".";

/**
 * Advice about a stainless work table.
 *
 * These are the things a catering fabricator would say looking over the drawing, and they
 * are mostly about stiffness and about cleaning. A table that flexes under a chopping board
 * is unusable, and a detail that traps water fails a hygiene inspection however well it is
 * welded.
 */

/** How far a 1.5mm folded top will span before it visibly deflects, in mm. */
const SPAN_LIMITS: readonly { readonly thickness: number; readonly span: number }[] = [
  { thickness: 0.8, span: 900 },
  { thickness: 1.0, span: 1100 },
  { thickness: 1.2, span: 1400 },
  { thickness: 1.5, span: 1800 },
  { thickness: 2.0, span: 2400 },
];

function spanLimitFor(thickness: number): number {
  const match = [...SPAN_LIMITS]
    .reverse()
    .find((limit) => thickness >= limit.thickness - 0.01);
  return match?.span ?? 800;
}

export function adviseWorkTable(model: WorkTableModel): Finding[] {
  const spec = model.spec;
  const out: Finding[] = [];
  const top = getMaterial(spec.top.materialId);
  const leg = getProfile(spec.legs.profileId);

  /* The unsupported span is between the legs, not the whole width. */
  const span = mm2(spec.width - 2 * spec.legs.inset - leg.width);
  const limit = spanLimitFor(top.thickness);
  if (span > limit) {
    out.push({
      id: "table-top-span",
      severity: span > limit * 1.25 ? "error" : "warning",
      title: `The top spans ${span}mm between the legs`,
      detail: `A ${top.thickness}mm folded top holds its line to about ${limit}mm. Beyond that it drums when it is wiped and dents under a chopping board. Go up a gauge, add a centre leg pair, or weld a hat section under the middle.`,
      parameter: "width",
    });
  }

  if (spec.top.edge === "square") {
    out.push({
      id: "table-square-edge",
      severity: "warning",
      title: "A square-cut edge is sharp and floppy",
      detail:
        "A flat sheet with no turned-down edge has a raw cut edge at hand height and nothing stiffening it. Every commercial table turns the edge down at least 40mm; there is no cost to it beyond the sheet it uses.",
      parameter: "top.edge",
    });
  } else if (spec.top.edgeReturn < 30) {
    out.push({
      id: "table-shallow-edge",
      severity: "advice",
      title: `A ${spec.top.edgeReturn}mm turned edge is shallow`,
      detail:
        "40mm is the standard return. It is what makes the top behave like a tray rather than a sheet, and it hides the frame from anyone standing at the table.",
      parameter: "top.edgeReturn",
    });
  }

  if (spec.top.upstand > 0 && spec.top.upstandReturn === 0) {
    out.push({
      id: "table-upstand-raw",
      severity: "advice",
      title: "The upstand has a raw top edge",
      detail:
        "Folding 15 to 20mm back towards the wall stiffens the upstand and removes the cut edge, which is the edge someone reaching over the table will catch a sleeve on.",
      parameter: "top.upstandReturn",
    });
  }

  if (spec.height < 850 || spec.height > 950) {
    out.push({
      id: "table-height",
      severity: "advice",
      title: `${spec.height}mm is outside the usual working height`,
      detail:
        "Commercial benches are 850 to 900mm, which suits standing prep for most people. Lower suits heavy mixing and dough; higher suits plating and detail work.",
      parameter: "height",
    });
  }

  if (leg.width < 38 && spec.height >= 850) {
    out.push({
      id: "table-leg-light",
      severity: "warning",
      title: `${leg.shortName} legs are light for a ${spec.height}mm table`,
      detail:
        "40x40 SHS or 38.1mm round tube is the standard, and it is standard because a thinner leg racks sideways when the table is pushed. It also gives the 2mm wall that an M10 foot insert needs.",
      parameter: "legs.profileId",
    });
  }

  if (spec.legs.feet === "none") {
    out.push({
      id: "table-no-feet",
      severity: "warning",
      title: "No adjustable feet",
      detail:
        "A kitchen floor falls to a drain and is never flat, so a table on bare tube ends rocks and its top no longer reads level. Bullet feet give 30mm of adjustment and lift the tube off the wet floor.",
      parameter: "legs.feet",
    });
  }

  if (spec.width >= 1800 && !spec.legs.braced) {
    out.push({
      id: "table-unbraced",
      severity: "advice",
      title: "A long table without cross bracing",
      detail:
        "At 1800mm and over the rail ring alone lets the frame lozenge when the table is pushed along the floor. A diagonal at each end costs two short cuts and stops it.",
      parameter: "legs.braced",
    });
  }

  if (model.shelfHeights.length > 0 && model.clearUnder < 150) {
    out.push({
      id: "table-clear-under",
      severity: "warning",
      title: `Only ${model.clearUnder}mm clear under the bottom shelf`,
      detail:
        "A mop head needs about 150mm, and anything less means the floor under the table cannot be cleaned. Raise the lowest shelf.",
      parameter: "shelves.lowest",
    });
  }

  if (getMaterial(spec.shelves.materialId).thickness < 1 && model.shelfHeights.length > 0) {
    out.push({
      id: "table-thin-shelf",
      severity: "advice",
      title: "A thin undershelf will bow",
      detail:
        "Under 1mm a shelf carrying stacked pans takes a set in the middle and never comes back. Either go up a gauge or keep the turned-down edge, which is what carries the load back to the rails.",
      parameter: "shelves.materialId",
    });
  }

  if (!spec.groundWelds) {
    out.push({
      id: "table-welds-proud",
      severity: "advice",
      title: "Welds left as welded",
      detail:
        "A proud fillet on a food-preparation frame collects grease and is hard to wipe. Grinding the visible ones flush and re-brushing costs about as long again as the welding, and it is what a hygiene inspection looks for.",
      parameter: "groundWelds",
    });
  }

  return out;
}
