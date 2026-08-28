import { getMaterial } from "../catalog/materials";
import { getProfile } from "../catalog/profiles";
import { mm2 } from "../core/units";
import type { CounterModel } from "../counter";
import type { Finding } from ".";

/**
 * Advice about a counter.
 *
 * A counter fails in different ways from a table, because it is worked at from one side and
 * leaned on from the other. Most of what can go wrong is about height, about the overhang,
 * and about whether the frame can take being pushed.
 */

/** Bar-stool height. A counter people sit at has to be in this band or it suits nobody. */
const BAR_BAND = { min: 1020, max: 1120 } as const;

/** Standing working height. */
const WORK_BAND = { min: 880, max: 980 } as const;

export function adviseCounter(model: CounterModel): Finding[] {
  const spec = model.spec;
  const out: Finding[] = [];
  const profile = getProfile(spec.frame.profileId);
  const top = getMaterial(spec.top.materialId);

  const inBand = (band: { min: number; max: number }): boolean =>
    spec.height >= band.min && spec.height <= band.max;

  if (!inBand(WORK_BAND) && !inBand(BAR_BAND)) {
    out.push({
      id: "counter-height",
      severity: "advice",
      title: `${spec.height}mm is between a working counter and a bar`,
      detail: `A counter worked at standing is ${WORK_BAND.min} to ${WORK_BAND.max}; a bar people sit at is ${BAR_BAND.min} to ${BAR_BAND.max}, because that is what a bar stool is made for. In between, it is too high to work at comfortably and too low to sit at.`,
      parameter: "height",
    });
  }

  /* The overhang cantilevers off the front rail, and a board flexes long before it breaks. */
  const overhangLimit = Math.round(top.thickness * 8);
  if (spec.top.frontOverhang > overhangLimit) {
    out.push({
      id: "counter-overhang",
      severity: spec.top.frontOverhang > overhangLimit * 1.6 ? "warning" : "advice",
      title: `A ${spec.top.frontOverhang}mm overhang on a ${top.thickness}mm top`,
      detail: `Unsupported, this thickness holds its line to about ${overhangLimit}mm. A knee-space overhang needs either a thicker top, a steel flat welded along under it, or brackets back to the frame — otherwise it dips where people lean.`,
      parameter: "top.frontOverhang",
    });
  }

  if (spec.height >= BAR_BAND.min && profile.width < 50 && !spec.frame.braced) {
    out.push({
      id: "counter-tall-frame",
      severity: "warning",
      title: `A ${spec.height}mm frame in ${profile.shortName}, unbraced`,
      detail:
        "At bar height the frame is a tall rectangle with an open front, so it racks rather than buckles. Either go to 50x50 or brace the ends — preferably both, if the counter gets pushed about.",
      parameter: "frame.profileId",
    });
  }

  if (spec.frame.feet === "none") {
    out.push({
      id: "counter-no-feet",
      severity: "advice",
      title: "No adjustable feet",
      detail:
        "A counter is heavy and long, so any twist in the floor shows up as a top that is not level and a door that does not sit square. Bullet feet give 30mm to take it out.",
      parameter: "frame.feet",
    });
  }

  if (model.barY !== null && (model.barY < BAR_BAND.min || model.barY > BAR_BAND.max)) {
    out.push({
      id: "counter-bar-height",
      severity: "advice",
      title: `The bar shelf is at ${model.barY}mm`,
      detail: `${BAR_BAND.min} to ${BAR_BAND.max} is where a standing adult can rest an elbow and set a glass down. Much lower and it fouls the working top under it; much higher and it is above shoulder height.`,
      parameter: "bar.height",
    });
  }

  if (spec.bar.height > 0 && model.barY === null) {
    out.push({
      id: "counter-bar-too-low",
      severity: "warning",
      title: "The bar shelf is too low to build",
      detail: `At ${spec.bar.height}mm it would sit on or under the counter top at ${spec.height}mm, leaving no room for the posts. Raise it to at least ${spec.height + 100}mm, or set it to zero.`,
      parameter: "bar.height",
    });
  }

  if (spec.drawerBank.enabled) {
    if (model.drawers.length === 0) {
      out.push({
        id: "counter-bank-dropped",
        severity: "error",
        title: "The drawer bank does not fit in the frame",
        detail:
          "There is not enough clear height or depth between the rails and the legs for a carcase. Lower the bottom rail, make the counter deeper, or drop the bank.",
        parameter: "drawerBank.enabled",
      });
    }
    const bankRight = spec.drawerBank.fromLeft + spec.drawerBank.width;
    if (bankRight > spec.width - spec.frame.inset) {
      out.push({
        id: "counter-bank-overruns",
        severity: "warning",
        title: "The drawer bank runs past the end of the counter",
        detail: `It starts at ${spec.drawerBank.fromLeft} and is ${spec.drawerBank.width} wide, which reaches ${mm2(bankRight)} on a ${spec.width} counter. It has been pulled back to fit inside the legs; move it or make it narrower to say what you meant.`,
        parameter: "drawerBank.fromLeft",
      });
    }
    if (spec.drawerBank.width > 900) {
      out.push({
        id: "counter-bank-wide",
        severity: "advice",
        title: `A ${spec.drawerBank.width}mm drawer is wide`,
        detail:
          "An undermount runner is rated by load, and a wide drawer full of bottles is at the limit of it. Two banks side by side carry the same stock with half the leverage on each runner.",
        parameter: "drawerBank.width",
      });
    }
  }

  if (spec.top.kind === "panel" && spec.cladding.style === "none" && spec.top.frontOverhang < 15) {
    out.push({
      id: "counter-bare-front",
      severity: "advice",
      title: "The frame is left bare at the front",
      detail:
        "With no cladding and almost no overhang, what a customer sees is the tube frame and whatever is stored inside it. That is a fine industrial look on purpose; if it is not deliberate, add cladding or let the top oversail.",
      parameter: "cladding.style",
    });
  }

  if (spec.shelves.count > 0 && spec.shelves.setback === 0) {
    out.push({
      id: "counter-shelf-flush",
      severity: "advice",
      title: "The shelves run right to the front face",
      detail:
        "A shelf flush with the front is visible past the cladding and gets knocked by knees. 40mm back is enough to hide it and to leave the front rail clear.",
      parameter: "shelves.setback",
    });
  }

  return out;
}
