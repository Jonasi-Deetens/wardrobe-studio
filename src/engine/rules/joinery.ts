import { getConnector, type ConnectorSpec } from "../catalog/hardware";
import { mm2 } from "../core/units";
import type { SolverContext } from "../solver/context";
import {
  jointLength,
  jointPointOnEdge,
  jointPointOnFace,
  localOf,
  type Joint,
  type PartDraft,
} from "../solver/draft";

/**
 * Turns the abstract joints the solver produced into real holes.
 *
 * Every joint is described once, by geometry alone, and this decides what to drill
 * for it. That is what makes swapping dowels for cam fittings a one-parameter
 * change: no panel moves, only the holes differ.
 */

/**
 * How many fittings go along a joint, and where.
 *
 * The outer fittings sit `endInset` from each end, which keeps them far enough from
 * the edge not to blow out the board but close enough to stop the joint hinging
 * open. The rest are spread so no gap exceeds the nominal spacing.
 */
export function connectorPositions(
  length: number,
  connector: ConnectorSpec,
  nominalSpacing: number,
): number[] {
  const inset = Math.min(connector.endInset, length / 2);
  const span = length - 2 * inset;
  if (span <= 0) return [mm2(length / 2)];

  const spacing = Math.max(32, nominalSpacing);
  const gaps = Math.max(1, Math.ceil(span / spacing));
  const step = span / gaps;
  return Array.from({ length: gaps + 1 }, (_, i) => mm2(inset + step * i));
}

export function applyJoinery(ctx: SolverContext): void {
  const connector = getConnector(ctx.spec.joinery.connectorId);
  const spacing = ctx.spec.joinery.connectorSpacing;

  for (const joint of ctx.joints) {
    const through = ctx.partsById.get(joint.throughPartId);
    const abutting = ctx.partsById.get(joint.abuttingPartId);
    if (!through || !abutting) continue;
    applyJoint(joint, through, abutting, connector, spacing);
  }
}

function applyJoint(
  joint: Joint,
  through: PartDraft,
  abutting: PartDraft,
  connector: ConnectorSpec,
  nominalSpacing: number,
): void {
  const length = jointLength(joint);
  if (length <= 0) return;

  const positions = connectorPositions(length, connector, nominalSpacing);

  positions.forEach((distance, index) => {
    const u = distance / length;
    const facePoint = jointPointOnFace(joint, u);
    const edgeAlong = jointPointOnEdge(joint, u);
    const id = `${joint.id}-${index + 1}`;

    // The face hole goes into the panel that runs through; the edge hole goes into
    // the end of the panel that butts against it, on its centre line.
    through.ops.push({
      kind: "hole",
      id: `${id}-face`,
      face: joint.throughFace,
      l: mm2(facePoint.l),
      w: mm2(facePoint.w),
      diameter: connector.faceHole.diameter,
      depth: connector.faceHole.depth,
      through: connector.kind === "confirmat" || connector.kind === "screw",
      purpose: facePurpose(connector),
      note: joint.label,
    });

    abutting.ops.push({
      kind: "edge-hole",
      id: `${id}-edge`,
      edge: joint.abuttingEdge,
      along: mm2(edgeAlong),
      acrossThickness: mm2(abutting.thickness / 2),
      diameter: connector.edgeHole.diameter,
      depth: connector.edgeHole.depth,
      purpose: edgePurpose(connector),
      note: joint.label,
    });

    // A cam fitting needs a large housing bore in the face of the panel that
    // carries the cam, on the opposite face from the joint.
    if (connector.kind === "cam" && connector.housing) {
      abutting.ops.push({
        kind: "hole",
        id: `${id}-housing`,
        face: "A",
        l:
          joint.abuttingEdge === "l0"
            ? mm2(connector.housing.depth + 22)
            : joint.abuttingEdge === "l1"
              ? mm2(abutting.length - connector.housing.depth - 22)
              : mm2(edgeAlong),
        w:
          joint.abuttingEdge === "w0"
            ? mm2(connector.housing.depth + 22)
            : joint.abuttingEdge === "w1"
              ? mm2(abutting.width - connector.housing.depth - 22)
              : mm2(edgeAlong),
        diameter: connector.housing.diameter,
        depth: connector.housing.depth,
        through: false,
        purpose: "cam-housing",
        note: `${joint.label}: cam housing, 34mm from the edge`,
      });
    }
  });

  through.notes.push(
    `${joint.label}: ${positions.length} x ${connector.name} at ${mm2(length / Math.max(1, positions.length - 1))}mm centres.`,
  );
}

function facePurpose(connector: ConnectorSpec) {
  switch (connector.kind) {
    case "dowel":
      return "dowel" as const;
    case "confirmat":
      return "confirmat" as const;
    case "cam":
      return "cam-bolt" as const;
    case "lamello":
      return "lamello" as const;
    case "screw":
      return "confirmat" as const;
  }
}

function edgePurpose(connector: ConnectorSpec) {
  switch (connector.kind) {
    case "dowel":
      return "dowel" as const;
    case "confirmat":
      return "confirmat" as const;
    case "cam":
      return "cam-bolt" as const;
    case "lamello":
      return "lamello" as const;
    case "screw":
      return "confirmat" as const;
  }
}

/**
 * The back panel housing.
 *
 * A back in a groove is worth the extra machining: it stops the carcase racking and
 * roughly doubles what the box will carry, because the panel then works as a shear
 * web instead of a dust cover.
 */
export function applyBackHousing(
  ctx: SolverContext,
  panels: {
    readonly leftSideId: string;
    readonly rightSideId: string;
    readonly topId: string;
    readonly bottomId: string;
  },
): void {
  const back = ctx.spec.carcase.back;
  if (back.type === "none" || back.type === "surface") return;

  const bt = ctx.frame.backThickness;
  // A groove is cut slightly wide so the panel drops in without forcing the joint.
  const grooveWidth = mm2(bt + 0.5);

  const ids = [panels.leftSideId, panels.rightSideId, panels.topId, panels.bottomId];

  for (const id of ids) {
    const draft = ctx.partsById.get(id);
    if (!draft) continue;

    if (back.type === "rabbet") {
      draft.ops.push({
        kind: "rabbet",
        id: `${id}-back-rabbet`,
        edge: "w1",
        face: "B",
        width: grooveWidth,
        depth: bt,
        purpose: "back-rabbet",
        note: `Rear rabbet for the ${bt}mm back panel`,
      });
      draft.notes.push(
        `Rear edge rabbeted ${grooveWidth}mm wide x ${bt}mm deep for the back panel.`,
      );
      continue;
    }

    // The groove runs the full length of the panel, parallel to the rear edge. Its
    // position comes from projecting the groove centre plane into panel
    // coordinates, which stays correct even when the panel overhangs at the front.
    const grooveCentreZ = mm2(back.inset + bt / 2);
    const grooveW = mm2(
      localOf(draft, [
        draft.placement.origin[0],
        draft.placement.origin[1],
        grooveCentreZ,
      ]).w,
    );

    draft.ops.push({
      kind: "groove",
      id: `${id}-back-groove`,
      face: "A",
      from: { l: 0, w: grooveW },
      to: { l: draft.length, w: grooveW },
      width: grooveWidth,
      depth: back.housingDepth,
      purpose: "back-groove",
      note: `Back panel groove, centre ${mm2(back.inset + bt / 2)}mm from the rear face`,
    });
    draft.notes.push(
      `Groove ${grooveWidth}mm wide x ${back.housingDepth}mm deep, centred ${mm2(back.inset + bt / 2)}mm from the rear edge, for the back panel.`,
    );
  }
}

/**
 * Notches the front of the side panels when the plinth is formed by the sides
 * themselves, so the plinth face can be set back.
 */
export function applyPlinthNotches(
  ctx: SolverContext,
  panels: { readonly leftSideId: string; readonly rightSideId: string },
): void {
  const plinth = ctx.spec.carcase.plinth;
  if (plinth.type !== "integrated-sides" || plinth.setback <= 0) return;

  for (const id of [panels.leftSideId, panels.rightSideId]) {
    const draft = ctx.partsById.get(id);
    if (!draft) continue;
    // The notch is cut out of the bottom front corner: local l from 0 up to the
    // plinth height, local w from the front edge back by the setback.
    const height = mm2(plinth.height - draft.bandingThickness.l0);
    const depth = mm2(plinth.setback - draft.bandingThickness.w0);
    draft.ops.push({
      kind: "cutout",
      id: `${id}-plinth-notch`,
      outline: [
        { l: 0, w: 0 },
        { l: height, w: 0 },
        { l: height, w: depth },
        { l: 0, w: depth },
      ],
      through: true,
      depth: draft.thickness,
      purpose: "service-cutout",
      note: `Plinth notch, ${plinth.height}mm high x ${plinth.setback}mm deep`,
    });
    draft.notes.push(
      `Notched at the bottom front corner ${plinth.height} x ${plinth.setback}mm to form the recessed plinth.`,
    );
  }
}
