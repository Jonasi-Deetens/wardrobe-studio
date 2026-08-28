import { getConnector, getHinge, getRail, getSlide } from "../catalog/hardware";
import { getMaterial, getSheetSize, MATERIALS } from "../catalog/materials";
import { mm2 } from "../core/units";
import type { UnitModel } from "../project";
import type { WardrobeModel } from "../solver";
import type { ResolvedBay } from "../solver/layout";
import { adviseCladding } from "./cladding";
import { adviseCounter } from "./counter";
import { adviseWorkTable } from "./table";

/**
 * Construction advice.
 *
 * The point of this module is that the app should know things the user does not have
 * to. Every finding says what is wrong, why it matters and what to do instead, and
 * carries the parameter path that caused it so the UI can take you straight there.
 *
 * Nothing here blocks a design. A wardrobe with a 1000mm shelf span is a real thing
 * someone might choose to build; it just deserves to be told that the shelf will
 * take a permanent set within a year.
 */

export type Severity = "error" | "warning" | "advice";

export type Finding = {
  readonly id: string;
  readonly severity: Severity;
  readonly title: string;
  /** One or two sentences: what will happen, and what to do about it. */
  readonly detail: string;
  /** Dotted path into the spec, so the UI can focus the offending field. */
  readonly parameter: string;
  /** Layout node id when the finding is about one compartment. */
  readonly bayId?: string;
  /** Part id when the finding is about one panel. */
  readonly partId?: string;
  /** Which unit the finding is about, or absent when it is about the room as a whole. */
  readonly unitId?: string;
};

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, advice: 2 };

export { adviseCladding } from "./cladding";
export { adviseCounter } from "./counter";
export { adviseProject } from "./room";
export { adviseWorkTable } from "./table";

/**
 * Whatever advice applies to this unit, whatever kind it is.
 *
 * Callers should not have to know which kinds exist: adding a unit kind should light up its
 * advice everywhere findings are shown, which is the panel, the summary and the booklet.
 */
export function adviseUnit(unit: UnitModel): Finding[] {
  /* Cladding hangs off any kind of unit, so its advice is added here rather than repeated in
     each kind's advisor. */
  const skin = adviseCladding(unit.spec.cladding, unit.parts);
  switch (unit.detail.kind) {
    case "wardrobe":
      return sortFindings([...advise(unit.detail.model), ...skin]);
    case "work-table":
      return sortFindings([...adviseWorkTable(unit.detail.model), ...skin]);
    case "counter":
      return sortFindings([...adviseCounter(unit.detail.model), ...skin]);
  }
}

export function advise(model: WardrobeModel): Finding[] {
  const findings: Finding[] = [
    ...carcaseFindings(model),
    ...shelfFindings(model),
    ...hangingFindings(model),
    ...drawerFindings(model),
    ...doorFindings(model),
    ...productionFindings(model),
  ];

  return sortFindings(findings);
}

/** Worst first, then stable by id so the list does not jump about while a slider moves. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.id.localeCompare(b.id),
  );
}

/* ---------------------------------------------------------------- carcase - */

function carcaseFindings(model: WardrobeModel): Finding[] {
  const out: Finding[] = [];
  const { spec, frame } = model;
  const material = getMaterial(spec.carcase.panelMaterialId);

  // The load path is the one thing worth being opinionated about.
  if (spec.carcase.construction === "top-over-sides") {
    out.push({
      id: "load-path-top-over-sides",
      severity: "advice",
      title: "The top is carried by its fixings rather than by the sides",
      detail:
        "With the top laid across the sides, everything on the top is held by the fastener heads in the side panels instead of bearing down through the panel. Capturing the top between full-height sides puts that load into the panel in shear, which is much stronger. Keep this arrangement if you want an unbroken top surface, but do not load it heavily.",
      parameter: "carcase.construction",
    });
  }
  if (spec.carcase.construction === "horizontals-through") {
    out.push({
      id: "load-path-horizontals-through",
      severity: "warning",
      title: "The sides push against fastener heads, not against a panel",
      detail:
        "Running the top and bottom the full width means the whole weight of the wardrobe and its contents passes through the fixings at each end of the sides. On a tall unit that is the weakest of the three arrangements. Use full-height sides unless you specifically need a continuous top and bottom.",
      parameter: "carcase.construction",
    });
  }

  if (spec.carcase.back.type === "none") {
    out.push({
      id: "no-back-panel",
      severity: "warning",
      title: "Nothing is keeping the carcase square",
      detail:
        "Without a back the box relies entirely on its corner joints to resist racking, and it will go out of square as soon as it is loaded unevenly. A back panel housed in a groove roughly doubles what the carcase will carry and keeps it square for the life of the piece.",
      parameter: "carcase.back.type",
    });
  } else if (spec.carcase.back.type === "surface") {
    out.push({
      id: "surface-back-panel",
      severity: "advice",
      title: "A surface-fixed back does much less than a housed one",
      detail:
        "Pinned to the rear face, the back can only work as well as the pins holding it. Set into a groove it acts as a shear web across the whole carcase. The groove costs one extra machining pass.",
      parameter: "carcase.back.type",
    });
  }

  if (spec.carcase.wallAnchor === "top") {
    out.push({
      id: "wall-anchor-top",
      severity: "warning",
      title: "Fixing through the top is the weaker option",
      detail:
        "A cabinet anchored through its side panels carries considerably more load and is markedly stiffer than the same cabinet anchored through the top, because the fixing then works along the panel instead of trying to pull the top off. Move the brackets to the sides.",
      parameter: "carcase.wallAnchor",
    });
  }
  if (spec.carcase.wallAnchor === "none" && frame.built.height > 1500) {
    out.push({
      id: "wall-anchor-none",
      severity: "error",
      title: "A tall wardrobe with no wall fixing can tip over",
      detail:
        "At this height, a loaded drawer or a child pulling on a door is enough to bring the unit over. Anchor it to the wall through the side panels.",
      parameter: "carcase.wallAnchor",
    });
  }

  // Unsupported side panels bow inwards, which then stops the doors closing.
  const sideHeight = frame.built.height - frame.sideBottomY;
  const bracesAtHeights = model.parts
    .filter((p) => p.role === "fixed-shelf" || p.role === "top" || p.role === "bottom")
    .map((p) => p.placement.origin[1]);
  const largestUnbracedRun = largestGap(
    [frame.sideBottomY, ...bracesAtHeights, frame.built.height].sort((a, b) => a - b),
  );
  if (sideHeight > 2200 && largestUnbracedRun > 1600) {
    out.push({
      id: "unbraced-sides",
      severity: "warning",
      title: `Side panels run ${mm2(largestUnbracedRun)}mm without a brace`,
      detail:
        "A tall side panel with nothing fixed across it will bow inwards under load, and the first symptom is doors that stop closing evenly. Add a fixed shelf somewhere in the middle of the run; an adjustable shelf on pins does not brace anything.",
      parameter: "layout",
    });
  }

  if (frame.internalDepth < 550) {
    const hasHanging = model.bays.some((b) => b.fitting.kind === "hanging");
    if (hasHanging) {
      out.push({
        id: "depth-too-shallow-for-hangers",
        severity: "error",
        title: `${mm2(frame.internalDepth)}mm internal depth will not take a coat hanger`,
        detail:
          "An adult hanger is about 450mm wide and clothes on it need roughly 550mm of clear depth, plus the door. Below that, garments press against the back and the door will not shut. Either increase the depth to at least 600mm overall or hang the rail front to back instead.",
        parameter: "carcase.depth",
      });
    }
  }

  if (spec.carcase.plinth.type === "none" && frame.built.height > 1800) {
    out.push({
      id: "no-plinth",
      severity: "advice",
      title: "No plinth means the bottom panel sits on the floor",
      detail:
        "A plinth keeps the bottom panel clear of a wet or uneven floor, gives you somewhere to scribe to the skirting, and lets you level the unit. It also stops toes hitting the door.",
      parameter: "carcase.plinth.type",
    });
  }

  if (model.ignoredOverhang) {
    out.push({
      id: "overhang-ignored",
      severity: "warning",
      title: "The top overhang cannot be built with this carcase",
      detail:
        "A top captured between the side panels physically cannot project past them. Either set the overhang back to zero or change the construction so the top is laid over the sides.",
      parameter: "carcase.topOverhang",
    });
  }

  const connector = getConnector(spec.joinery.connectorId);
  if (connector.kind === "screw") {
    out.push({
      id: "screw-joints",
      severity: "advice",
      title: "Plain screws into chipboard are the weakest joint here",
      detail:
        "A screw driven into the edge of chipboard holds far less than a dowel or a Confirmat, and it loses most of that if the joint is ever taken apart. A Confirmat is the same speed to fit and much stronger.",
      parameter: "joinery.connectorId",
    });
  }
  if (!connector.demountable && spec.carcase.back.type === "groove") {
    out.push({
      id: "glued-joints-note",
      severity: "advice",
      title: "This carcase cannot be taken apart again",
      detail:
        "Glued dowels give the strongest, cleanest result but commit you to assembling the whole box in one go, with the back slid into its groove before the last corner closes. Choose cam fittings instead if it has to move house.",
      parameter: "joinery.connectorId",
    });
  }

  if (material.category === "back") {
    out.push({
      id: "carcase-material-too-thin",
      severity: "error",
      title: `${material.shortName} is back-panel stock, not carcase stock`,
      detail:
        "At this thickness the panel will not hold a fixing in its edge and will not carry a shelf. Use 18mm or thicker board for the carcase.",
      parameter: "carcase.panelMaterialId",
    });
  }

  return out;
}

function largestGap(sorted: readonly number[]): number {
  let largest = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    largest = Math.max(largest, (sorted[i] as number) - (sorted[i - 1] as number));
  }
  return largest;
}

/* ----------------------------------------------------------------- shelves - */

function shelfFindings(model: WardrobeModel): Finding[] {
  const out: Finding[] = [];

  for (const part of model.parts) {
    if (part.role !== "adjustable-shelf" && part.role !== "fixed-shelf") continue;
    const material = getMaterial(part.materialId);
    const span = part.length;
    if (span <= material.safeShelfSpan) continue;

    const over = mm2(span - material.safeShelfSpan);
    const thicker = suggestStifferMaterial(part.materialId, span);
    out.push({
      id: `shelf-sag-${part.id}`,
      severity: span > material.safeShelfSpan * 1.25 ? "warning" : "advice",
      title: `${part.label} spans ${mm2(span)}mm and will sag`,
      detail: `${material.shortName} carrying folded clothes holds its line to about ${material.safeShelfSpan}mm; this is ${over}mm past that, and the bend becomes permanent within a year or so. ${
        thicker ? `Switch this shelf to ${thicker}, ` : ""
      }glue a solid lipping along the front edge, or put a divider in to halve the span.`,
      parameter: "layout",
      partId: part.id,
      ...(part.bayId ? { bayId: part.bayId } : {}),
    });
  }

  return out;
}

/** The cheapest catalogue board that would hold this span, if there is one. */
function suggestStifferMaterial(currentId: string, span: number): string | null {
  const better = MATERIALS.filter(
    (m) => m.category === "carcase" && m.id !== currentId && m.safeShelfSpan >= span,
  ).sort((a, b) => a.pricePerSheet - b.pricePerSheet);
  return better[0]?.name ?? null;
}

/* ----------------------------------------------------------------- hanging - */

function hangingFindings(model: WardrobeModel): Finding[] {
  const out: Finding[] = [];

  for (const bay of model.bays) {
    if (bay.fitting.kind !== "hanging") continue;
    const rail = getRail(bay.fitting.railId);
    const railsHere = model.rails.filter((r) => r.bayId === bay.id);

    for (const resolved of railsHere) {
      if (!resolved.needsCentreSupport) continue;
      out.push({
        id: `rail-span-${resolved.id}`,
        severity: "warning",
        title: `${bay.label}: the rail spans ${resolved.span}mm`,
        detail: `${rail.name} is good for about ${rail.maxSpan}mm before it starts to bow under a full load of coats. ${
          resolved.shelfAbovePartId
            ? "A centre support screwed up into the shelf above fixes it; one is on the hardware list and its holes are on that shelf's drilling drawing."
            : "A centre support needs a shelf over the rail to screw into, and this bay has none — turn on the shelf above the rail, or fit a heavier oval rail or a divider instead."
        }`,
        parameter: "layout",
        bayId: bay.id,
      });
    }

    // Hanging heights that people actually use.
    const clear = bay.fitting.clearHeight;
    if (!bay.fitting.doubleHang && clear < 1400) {
      out.push({
        id: `hang-too-short-${bay.id}`,
        severity: "advice",
        title: `${bay.label}: ${clear}mm is short for a single rail`,
        detail:
          "Long garments need 1600 to 1800mm of clear height; coats and dresses will touch down below about 1400mm. If this is meant for shirts and trousers, turn on double hanging and get two rails at 900 to 1000mm each out of the same space.",
        parameter: "layout",
        bayId: bay.id,
      });
    }
    if (bay.fitting.doubleHang) {
      for (const [label, height] of [
        ["upper", bay.fitting.clearHeight],
        ["lower", bay.fitting.lowerClearHeight],
      ] as const) {
        if (height < 850) {
          out.push({
            id: `double-hang-tight-${bay.id}-${label}`,
            severity: "advice",
            title: `${bay.label}: the ${label} rail has only ${height}mm clear`,
            detail:
              "Short hanging wants 900 to 1000mm so a folded pair of trousers or a shirt hangs without creasing at the bottom.",
            parameter: "layout",
            bayId: bay.id,
          });
        }
      }
      const needed = bay.fitting.clearHeight + bay.fitting.lowerClearHeight + 100;
      if (needed > bay.clearHeight) {
        out.push({
          id: `double-hang-wont-fit-${bay.id}`,
          severity: "error",
          title: `${bay.label}: two rails do not fit in ${bay.clearHeight}mm`,
          detail: `The two clear heights plus the rail and its fittings need about ${mm2(needed)}mm. Reduce one of them or make the bay taller.`,
          parameter: "layout",
          bayId: bay.id,
        });
      }
    }

    const railToBack = bay.fitting.railFromBack;
    if (railToBack < 250 || railToBack > bay.clearDepth - 120) {
      out.push({
        id: `rail-position-${bay.id}`,
        severity: "advice",
        title: `${bay.label}: the rail is ${railToBack}mm from the back`,
        detail:
          "A rail wants to sit close to the middle of the depth, roughly 300mm back in a 600mm carcase, so clothes hang clear of both the back and the door.",
        parameter: "layout",
        bayId: bay.id,
      });
    }
  }

  return out;
}

/* ----------------------------------------------------------------- drawers - */

function drawerFindings(model: WardrobeModel): Finding[] {
  const out: Finding[] = [];
  const slide = getSlide(model.spec.drawers.slideId);

  for (const drawer of model.drawers) {
    if (drawer.boxInsideWidth < 150) {
      out.push({
        id: `drawer-too-narrow-${drawer.id}`,
        severity: "warning",
        title: `Drawer ${drawer.index + 1} is only ${drawer.boxInsideWidth}mm wide inside`,
        detail: `${slide.name} takes ${slide.widthClearance}mm out of the opening before the box sides. There is not much left here; widen the bay or use a narrower runner.`,
        parameter: "drawers.slideId",
        bayId: drawer.bayId,
      });
    }
    if (drawer.boxHeight < 60) {
      out.push({
        id: `drawer-box-too-shallow-${drawer.id}`,
        severity: "warning",
        title: `Drawer ${drawer.index + 1} has only ${drawer.boxHeight}mm of box`,
        detail: `The opening is ${mm2(drawer.opening.y1 - drawer.opening.y0)}mm and the runner needs ${slide.bottomClearance}mm below and ${slide.topClearance}mm above, which leaves almost nothing to hold. Use fewer drawers or trays in this bay, or make it taller.`,
        parameter: "layout",
        bayId: drawer.bayId,
      });
    } else if (drawer.boxHeight < model.spec.drawers.boxHeight - 1) {
      out.push({
        id: `drawer-box-squeezed-${drawer.id}`,
        severity: "advice",
        title: `Drawer ${drawer.index + 1} box reduced to ${drawer.boxHeight}mm`,
        detail: `The opening only allows ${drawer.boxHeight}mm once the ${slide.bottomClearance}mm runner clearance below and ${slide.topClearance}mm above are taken out. The requested ${model.spec.drawers.boxHeight}mm box would not lift out.`,
        parameter: "drawers.boxHeight",
        bayId: drawer.bayId,
      });
    }
  }

  const bay = model.bays.find((b) => b.fitting.kind === "drawers");
  if (bay && slide.mount === "undermount") {
    const longest = Math.max(0, ...model.drawers.map((d) => d.slideLength));
    if (longest > 0 && longest < model.frame.internalDepth - 90) {
      out.push({
        id: "slide-shorter-than-carcase",
        severity: "advice",
        title: `The longest runner that fits is ${longest}mm`,
        detail: `That leaves ${mm2(model.frame.internalDepth - longest)}mm of depth behind the drawer doing nothing. Runners come in 50mm steps, so this is usually unavoidable, but it is worth knowing before you choose the carcase depth.`,
        parameter: "carcase.depth",
      });
    }
  }

  return out;
}

/* ------------------------------------------------------------------- doors - */

function doorFindings(model: WardrobeModel): Finding[] {
  const out: Finding[] = [];
  if (model.spec.doors.type === "none") return out;

  const hinge = getHinge(model.spec.doors.hingeId);
  const [minBoring, maxBoring] = hinge.boringDistanceRange;
  const boring = model.spec.doors.boringDistance;

  if (boring < minBoring || boring > maxBoring) {
    out.push({
      id: "boring-distance-out-of-range",
      severity: "error",
      title: `A ${boring}mm boring distance is outside this hinge's range`,
      detail: `${hinge.name} is designed for ${minBoring} to ${maxBoring}mm. Outside that the arm fouls the carcase or the leaf will not sit flat. It has been clamped to the nearest permitted value for the drawings.`,
      parameter: "doors.boringDistance",
    });
  }

  if (!hinge.plateHeights.includes(model.spec.doors.plateHeight)) {
    out.push({
      id: "plate-height-unavailable",
      severity: "warning",
      title: `No ${model.spec.doors.plateHeight}mm plate is made for this hinge`,
      detail: `Available plate heights are ${hinge.plateHeights.join(", ")}mm. The overlay shown assumes the value you entered, so check it against the plate you can actually buy.`,
      parameter: "doors.plateHeight",
    });
  }

  for (const missing of model.impossibleLeaves) {
    if (missing.reason === "drawer-bank") {
      out.push({
        id: `leaf-impossible-${missing.index}`,
        severity: "advice",
        title: `No door ${missing.index}: drawer fronts fill that bay`,
        detail:
          "A door leaf and a drawer front both sit on the front plane, so a leaf cannot cover a bank of fronts. This bay is left with its fronts, which is how it would be built. Turn the drawer fronts off if the drawers are meant to live behind a door instead.",
        parameter: "layout",
      });
      continue;
    }
    const culprit =
      missing.height <= 0
        ? { axis: "height", parameter: "doors.revealTop" as const }
        : { axis: "width", parameter: "doors.gap" as const };
    out.push({
      id: `leaf-impossible-${missing.index}`,
      severity: "error",
      title: `Door ${missing.index} cannot be made: the ${culprit.axis} works out at ${
        culprit.axis === "height" ? missing.height : missing.width
      }mm`,
      detail: `The gaps, reveals${model.spec.doors.overlayStyle === "inset" ? " and the inset allowance" : ""} take more out of the opening than there is opening, so this leaf has been left out of the cut list rather than drawn at a negative size. Reduce the top and bottom reveals${model.spec.doors.overlayStyle === "inset" ? ", the gap, or switch to an overlay door" : " or the gap"}, or make the opening bigger.`,
      parameter: culprit.parameter,
    });
  }

  const t = model.frame.thickness;
  for (const leaf of model.leaves) {
    if (leaf.hingePanelId === null) {
      out.push({
        id: `leaf-no-hinge-panel-${leaf.id}`,
        severity: "error",
        title: `Door ${leaf.index + 1} has nothing to hinge to`,
        detail:
          "Its hinged edge falls in open space rather than over a side panel or a full-height divider. Either switch the leaf count to one per bay, change the number of leaves so they meet over the dividers, or add a divider where this leaf's edge lands.",
        parameter: "doors.leafMode",
        partId: leaf.partId,
      });
      continue;
    }

    if (leaf.width > 600) {
      out.push({
        id: `leaf-too-wide-${leaf.id}`,
        severity: leaf.width > 700 ? "warning" : "advice",
        title: `Door ${leaf.index + 1} is ${leaf.width}mm wide`,
        detail:
          "Past about 600mm a wardrobe leaf needs a lot of room to swing, sags on its hinges over time, and is heavy to handle. Two narrower leaves over the same opening are easier to live with.",
        parameter: "doors.leafCount",
        partId: leaf.partId,
      });
    }

    const perHinge = leaf.mass / leaf.hingeCount;
    if (perHinge > hinge.loadPerHinge) {
      out.push({
        id: `leaf-too-heavy-${leaf.id}`,
        severity: "warning",
        title: `Door ${leaf.index + 1} loads each hinge with ${mm2(perHinge)}kg`,
        detail: `${leaf.mass}kg over ${leaf.hingeCount} hinges is past the ${hinge.loadPerHinge}kg each that ${hinge.name} is rated for. Add a hinge, or use a lighter or thinner leaf.`,
        parameter: "doors.hingeCountOverride",
        partId: leaf.partId,
      });
    }

    if (leaf.overlay < t - 3 && model.spec.doors.overlayStyle === "full") {
      out.push({
        id: `overlay-too-small-${leaf.id}`,
        severity: "warning",
        title: `A ${leaf.overlay}mm overlay does not cover a ${t}mm side panel`,
        detail: `With a full overlay the leaf should cover the panel edge, which needs roughly ${t}mm. Reduce the plate height or increase the boring distance: overlay is fixed distance ${hinge.fixedDistance} plus boring distance minus plate height.`,
        parameter: "doors.plateHeight",
        partId: leaf.partId,
      });
    }
  }

  if (model.spec.doors.overlayStyle === "half" && model.dividers.length === 0) {
    out.push({
      id: "half-overlay-no-divider",
      severity: "advice",
      title: "Half overlay is for leaves sharing a divider",
      detail:
        "There is no divider here for two leaves to meet over, so half overlay just leaves a wider gap at the edges. Full overlay is the right choice for this carcase.",
      parameter: "doors.overlayStyle",
    });
  }

  return out;
}

/* -------------------------------------------------------------- production - */

function productionFindings(model: WardrobeModel): Finding[] {
  const out: Finding[] = [];
  const { spec } = model;

  const oversized = model.parts.filter((part) => {
    const sheet = getSheetFor(model);
    const fitsAsIs = part.length <= sheet.length && part.width <= sheet.width;
    const fitsRotated = part.length <= sheet.width && part.width <= sheet.length;
    const grainLocked = spec.production.grainPolicy === "respect" && part.grain !== "none";
    return !(fitsAsIs || (fitsRotated && !grainLocked));
  });

  for (const part of oversized) {
    out.push({
      id: `part-too-big-${part.id}`,
      severity: "error",
      title: `${part.label} does not fit on the sheet`,
      detail: `At ${part.length} x ${part.width}mm this panel is larger than the ${spec.production.sheetSizeId} sheet${part.grain !== "none" && spec.production.grainPolicy === "respect" ? " with the grain running as specified" : ""}. Choose a larger sheet, or reduce the wardrobe.`,
      parameter: "production.sheetSizeId",
      partId: part.id,
    });
  }

  if (spec.production.kerf < 1) {
    out.push({
      id: "kerf-too-small",
      severity: "warning",
      title: `A ${spec.production.kerf}mm kerf is unrealistic`,
      detail:
        "A panel saw blade removes 3 to 4mm. Under-stating it makes the nesting look better than it is and leaves every part a little undersize.",
      parameter: "production.kerf",
    });
  }

  const bandingIds = new Set(
    model.parts.flatMap((part) => Object.values(part.banding)),
  );
  if (bandingIds.size > 3) {
    out.push({
      id: "too-many-banding-types",
      severity: "advice",
      title: `${bandingIds.size} different edge bandings in one job`,
      detail:
        "Each one is a separate reel and a separate machine setup. Two is usually enough: a thin one for edges that are only seen from inside, and a thicker one for shelf fronts that get knocked.",
      parameter: "production.banding",
    });
  }

  return out;
}

function getSheetFor(model: WardrobeModel): { length: number; width: number } {
  const sheet = getSheetSize(model.spec.production.sheetSizeId);
  const trim = model.spec.production.sheetTrim;
  return { length: sheet.length - 2 * trim, width: sheet.width - 2 * trim };
}

/** Counts findings by severity, for the summary panel. */
export function summariseFindings(findings: readonly Finding[]): Record<Severity, number> {
  return findings.reduce<Record<Severity, number>>(
    (acc, finding) => ({ ...acc, [finding.severity]: acc[finding.severity] + 1 }),
    { error: 0, warning: 0, advice: 0 },
  );
}

/** Convenience for a bay-scoped list, used by the layout editor. */
export function findingsForBay(
  findings: readonly Finding[],
  bay: ResolvedBay,
): Finding[] {
  return findings.filter((f) => f.bayId === bay.id);
}
