import { getMaterial } from "../catalog/materials";
import type { Part } from "../core/part";
import type { CladdingSpec } from "../spec/types";
import type { Finding } from ".";

/**
 * Advice about cladding.
 *
 * Cladding is the part of a unit most likely to be specified by eye and then fail slowly.
 * Nothing here is about strength — a skin carries nothing — and all of it is about moisture,
 * movement and whether the boards can be got off again.
 */

/** Below this, a softwood board cups instead of staying flat. */
const CUP_WIDTH = 150;

export function adviseCladding(spec: CladdingSpec, parts: readonly Part[]): Finding[] {
  if (spec.style === "none") return [];
  const out: Finding[] = [];
  const material = getMaterial(spec.materialId);

  if (spec.faces.length === 0) {
    out.push({
      id: "cladding-no-faces",
      severity: "warning",
      title: "Cladding is specified but no face is clad",
      detail:
        "The style is set and the material is chosen, but nothing is selected to cover, so no boards reach the cut list. Pick the faces that are seen.",
      parameter: "cladding.faces",
    });
    return out;
  }

  if (spec.pieceWidth > CUP_WIDTH && material.category === "solid") {
    out.push({
      id: "cladding-board-width",
      severity: "advice",
      title: `${spec.pieceWidth}mm boards will cup`,
      detail: `Solid timber moves across the grain, and the wider the board the more visible it is: a ${spec.pieceWidth}mm board lifts at its edges as it dries. Cladding is sold at 90 to 145mm for exactly this reason. Two narrower boards look the same from two metres away and stay flat.`,
      parameter: "cladding.pieceWidth",
    });
  }

  if (spec.standoff === 0 && material.hasGrain) {
    out.push({
      id: "cladding-no-cavity",
      severity: "advice",
      title: "Boards fixed straight onto the unit, with no cavity",
      detail:
        "Timber fixed flat against a surface stays wet on its back long after its face has dried, and that is the face that rots. Counter-battens hold the boards off, let air move behind them and give water somewhere to run. Outdoors, treat the cavity as mandatory.",
      parameter: "cladding.standoff",
    });
  }

  if (spec.style !== "slats" && spec.gap === 0 && material.hasGrain) {
    out.push({
      id: "cladding-no-movement",
      severity: "advice",
      title: "Boards butted tight with no room to move",
      detail:
        "A wet board that has nowhere to expand into pushes its neighbour, and the run buckles or the fixings tear out. Tongue and groove allows for it in the joint; butted boards do not, so either leave a shadow gap or fit them dry in summer and accept the gaps that open in winter.",
      parameter: "cladding.gap",
    });
  }

  if (spec.fixing === "glued") {
    out.push({
      id: "cladding-glued",
      severity: "advice",
      title: "Glued cladding cannot be taken off",
      detail:
        "One damaged board means cutting it out and making good behind it. Glue is right on a board face indoors; on a run of slats it costs nothing to screw or clip them and it keeps the unit serviceable.",
      parameter: "cladding.fixing",
    });
  }

  if (spec.fixing === "secret" && spec.style === "board") {
    out.push({
      id: "cladding-secret-board",
      severity: "advice",
      title: "Secret clips on butted boards",
      detail:
        "Clips work by hooking a board's edge, which needs either a groove or a gap to reach into. On boards butted tight there is nowhere for the clip to sit, so this ends up face-fixed anyway. Slats or tongue and groove are what clips are for.",
      parameter: "cladding.fixing",
    });
  }

  if (spec.standoff > 0 && spec.riseAboveTop > 0 && spec.riseAboveTop < 60) {
    out.push({
      id: "cladding-short-rise",
      severity: "advice",
      title: `A ${spec.riseAboveTop}mm rise above the top`,
      detail:
        "Just proud of the top reads as a mistake rather than a detail: it catches drinks and it is not tall enough to hide anything. Either finish flush with the top or take it up 100 to 150mm so it works as a parapet.",
      parameter: "cladding.riseAboveTop",
    });
  }

  /* Cladding a face that opens is the one mistake this module can catch outright, and it is
     easy to make: the faces are chosen by name, and "front" is where the doors are. */
  const fronts = parts.filter((part) => part.role === "door" || part.role === "drawer-front");
  if (spec.faces.includes("front") && fronts.length > 0) {
    out.push({
      id: "cladding-over-fronts",
      severity: "error",
      title: "The clad face is the face that opens",
      detail: `Boards fixed across the front would run over ${fronts.length} door or drawer front, and the unit could not be opened. Clad the ends and the back, or take the fronts off and treat the cladding as the front.`,
      parameter: "cladding.faces",
    });
  }

  /* A ripped last board on every face is a sign the board width and the unit width are
     fighting each other, and it is cheap to fix at the design stage. */
  const boards = parts.filter((part) => part.role === "cladding");
  const ripped = boards.filter((part) => part.notes?.some((note) => note.startsWith("Ripped")));
  if (boards.length > 0 && ripped.length > 0 && spec.style === "slats" && spec.gap > 0) {
    out.push({
      id: "cladding-ripped",
      severity: "advice",
      title: `${ripped.length} of ${boards.length} boards ripped to fit`,
      detail: `With a gap between the slats the division does not have to be exact, and nudging the gap by a millimetre or two usually makes it come out whole. Worth doing on a face people stand right next to.`,
      parameter: "cladding.gap",
    });
  }

  return out;
}
