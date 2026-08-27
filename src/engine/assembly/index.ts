import {
  getConnector,
  getHandle,
  getHinge,
  getLevellingLeg,
  getRail,
  getShelfSupport,
  getSlide,
} from "../catalog/hardware";
import { PART_ROLE_LABELS, type Part, type PartRole } from "../core/part";
import type { WardrobeModel } from "../solver";

/**
 * Assembly instructions derived from the part graph rather than written by hand, so
 * they cannot drift from the model. The order comes from how the box actually goes
 * together on the bench: dowel the horizontals into one side lying flat, stand it up,
 * square it with the back, then fit everything that only drops into holes, and hang
 * the fronts last because they are what you adjust against.
 */

export type AssemblyStep = {
  readonly index: number;
  readonly title: string;
  readonly detail: string;
  /** Panels this step handles, for highlighting in 3D. */
  readonly partIds: readonly string[];
  readonly hardware: readonly string[];
  /** Why this step comes where it does, when the reason is not obvious. */
  readonly rationale?: string;
};

export type AssemblySequence = {
  readonly steps: readonly AssemblyStep[];
  readonly totalPanels: number;
};

const stageOf: Partial<Record<PartRole, number>> = {
  side: 0,
  top: 0,
  bottom: 0,
  stretcher: 0,
  divider: 1,
  "fixed-shelf": 1,
  back: 2,
  "plinth-rail": 3,
  "adjustable-shelf": 4,
  "shoe-shelf": 4,
  "drawer-side": 5,
  "drawer-back": 5,
  "drawer-bottom": 5,
  "drawer-front": 6,
  door: 6,
  filler: 6,
};

export function buildAssemblySequence(model: WardrobeModel): AssemblySequence {
  const steps: AssemblyStep[] = [];
  const byRole = new Map<PartRole, Part[]>();
  for (const part of model.parts) {
    const bucket = byRole.get(part.role);
    if (bucket) bucket.push(part);
    else byRole.set(part.role, [part]);
  }
  const of = (...roles: PartRole[]) => roles.flatMap((role) => byRole.get(role) ?? []);
  const ids = (parts: readonly Part[]) => parts.map((p) => p.id);

  const push = (step: Omit<AssemblyStep, "index">) => {
    steps.push({ ...step, index: steps.length + 1 });
  };

  const spec = model.spec;
  const connector = getConnector(spec.joinery.connectorId);
  const construction = spec.carcase.construction;

  /* Preparation. */
  push({
    title: "Check the panels against the cut list",
    detail:
      `Lay out all ${model.parts.length} panels and tick them off the cut list. Confirm the ` +
      `edge banding is on the edges the drawings show, and mark the datum corner on each ` +
      `panel before you drill anything — every hole position in this booklet is measured ` +
      `from that corner.`,
    partIds: [],
    hardware: [],
    rationale:
      "A panel banded on the wrong edge is easy to fix now and impossible to fix once it is drilled.",
  });

  const drilledPanels = model.parts.filter((part) => part.ops.length > 0);
  push({
    title: "Drill and machine",
    detail:
      `${drilledPanels.length} panels carry machining. Work through the per-panel pages: ` +
      `system hole rows first with a jig or a line-boring machine so the pitch stays true, ` +
      `then joint holes, then hardware holes.`,
    partIds: ids(drilledPanels),
    hardware: [],
  });

  /* Carcase. */
  const sides = of("side");
  const horizontals = of("top", "bottom");
  const jointCount = model.joints.filter(
    (joint) => joint.structural && isCarcaseJoint(model, joint.throughPartId, joint.abuttingPartId),
  ).length;

  push({
    title: "Assemble the carcase flat",
    detail:
      `Lay the left side on the bench, inside face up. Fit the ${describe(horizontals)} into it, ` +
      `then bring the right side on. ${connectorInstruction(connector.kind)} ` +
      `Do not glue anything until the back is on and the box is square.`,
    partIds: [...ids(sides), ...ids(horizontals)],
    hardware: [connector.name],
    rationale:
      construction === "sides-through"
        ? "The top and bottom sit captured between full-height sides, so the load runs down the side panels in shear instead of hanging off fastener heads."
        : construction === "top-over-sides"
          ? "This variant lays the top across the sides, so the joint holds the top in tension on the fittings. It is easier to build and gives a continuous top surface, but it is the weaker arrangement."
          : "The top and bottom run the full width with the sides between them, so the horizontals push against fastener heads rather than sitting on the sides.",
  });

  if (jointCount > 0) {
    push({
      title: "Check for square before the glue grabs",
      detail:
        "Measure both diagonals across the carcase. They must match within about 2mm. Adjust by " +
        "racking the box, not by forcing a joint.",
      partIds: ids(sides),
      hardware: [],
    });
  }

  const back = of("back");
  if (back.length > 0) {
    const backType = spec.carcase.back.type;
    push({
      title: backType === "surface" ? "Fix the back panel" : "Slide the back panel in",
      detail:
        backType === "groove"
          ? "Slide the back into its grooves before the last side goes home. Once it is in and the box is square, the back is what holds it square permanently."
          : backType === "rabbet"
            ? "Drop the back into the rabbet, check the diagonals again, then pin and screw around the perimeter at roughly 150mm centres."
            : "Screw the back to the rear edges at roughly 150mm centres, checking the diagonals as you go.",
      partIds: ids(back),
      hardware: [],
      rationale:
        backType === "groove"
          ? "A housed back roughly doubles the carcase's racking stiffness compared with a surface-fixed one."
          : "A surface-fixed back is quicker but leaves the carcase relying on the corner joints for squareness.",
    });
  }

  const plinth = of("plinth-rail");
  const hasLegs = spec.carcase.plinth.type === "legs";
  if (plinth.length > 0 || hasLegs) {
    push({
      title: "Fit the plinth and level the unit",
      detail:
        `${plinth.length > 0 ? `Assemble the ${describe(plinth)} and fix it under the carcase. ` : ""}` +
        `${hasLegs ? "Fit the levelling legs, stand the unit in place and level it front to back and side to side before anything else goes in. " : "Stand the unit in place and pack it level. "}` +
        "Everything above only hangs straight if the box is level and plumb.",
      partIds: ids(plinth),
      hardware: hasLegs ? [getLevellingLeg(spec.carcase.plinth.legId).name] : [],
    });
  }

  const anchorHoles = model.parts.filter((part) =>
    part.ops.some((op) => op.kind === "hole" && op.purpose === "wall-anchor"),
  );
  if (anchorHoles.length > 0) {
    push({
      title: "Anchor to the wall",
      detail:
        `Fix through the pre-drilled anchor holes in the ${describe(anchorHoles)}. ` +
        "Find the studs or use fixings rated for the wall type. A tall wardrobe with drawers " +
        "open is a tipping hazard until this is done.",
      partIds: ids(anchorHoles),
      hardware: ["Wall anchor"],
      rationale:
        "Anchoring through the sides rather than the top gives a much higher pull-out capacity and stops the carcase leaning.",
    });
  }

  /* Interior. */
  const dividers = of("divider");
  const fixedShelves = of("fixed-shelf");
  if (dividers.length > 0 || fixedShelves.length > 0) {
    push({
      title: "Fit the dividers and fixed shelves",
      detail:
        `${describe([...dividers, ...fixedShelves])} are structural: they brace the sides and ` +
        `carry the load above them. Fit them before any loose fittings so the openings settle ` +
        `to their final size.`,
      partIds: [...ids(dividers), ...ids(fixedShelves)],
      hardware: [connector.name],
    });
  }

  if (model.rails.length > 0) {
    push({
      title: "Fit the hanging rails",
      detail:
        `${model.rails.length} rail${model.rails.length === 1 ? "" : "s"} to cut and fit. ` +
        `The end support holes are already drilled — screw the supports on, then drop the rail in. ` +
        `Rails longer than 900mm also get a centre support.`,
      partIds: [],
      hardware: [...new Set(model.rails.map((rail) => getRail(rail.railId).name))],
    });
  }

  const adjustables = of("adjustable-shelf", "shoe-shelf");
  if (adjustables.length > 0) {
    push({
      title: "Insert the shelf supports and adjustable shelves",
      detail:
        `Push the supports into the system holes at the heights on the drawings and drop ` +
        `${describe(adjustables)} on. These stay adjustable, so treat the marked heights as a ` +
        `starting point.`,
      partIds: ids(adjustables),
      hardware: [getShelfSupport(spec.joinery.shelfSupportId).name],
    });
  }

  /* Drawers. */
  const drawerBox = of("drawer-side", "drawer-back", "drawer-bottom");
  if (drawerBox.length > 0) {
    push({
      title: "Build the drawer boxes",
      detail:
        `${model.drawers.length} drawer${model.drawers.length === 1 ? "" : "s"}. Assemble each box ` +
        `square — a racked box will bind on its runners no matter how well the runners are fitted.`,
      partIds: ids(drawerBox),
      hardware: [],
    });
    push({
      title: "Mount the runners and hang the drawers",
      detail:
        "Screw the runners to the pre-drilled holes in the sides, clip the locking devices into " +
        "the drawer bottoms, and slide each box in. Check every drawer runs without rubbing before " +
        "the fronts go on.",
      partIds: [],
      hardware: [...new Set(model.drawers.map((drawer) => getSlide(drawer.slideId).name))],
    });
  }

  /* Fronts. */
  const doors = of("door");
  if (doors.length > 0) {
    push({
      title: "Hang the doors",
      detail:
        `Press the hinges into the ${doors.length} cup bore${doors.length === 1 ? "" : "s"}, screw ` +
        `the mounting plates to the carcase at the marked heights, then clip the doors on. ` +
        `Adjust overlay, height and depth on the hinges until the gaps read even all round.`,
      partIds: ids(doors),
      hardware: [getHinge(spec.doors.hingeId).name],
      rationale:
        "Hinges are adjustable in three axes, which is why they are the last chance to absorb any small error from earlier steps.",
    });
  }

  const drawerFronts = of("drawer-front");
  if (drawerFronts.length > 0) {
    push({
      title: "Fit the drawer fronts",
      detail:
        "Fix each front to its box through the pre-drilled holes, setting the gaps with spacers " +
        "so the reveal is even. Work from the bottom drawer up.",
      partIds: ids(drawerFronts),
      hardware: [],
    });
  }

  const doorHandle = getHandle(spec.handles.doorHandleId);
  const drawerHandle = getHandle(spec.handles.drawerHandleId);
  const handleNames = [
    ...new Set(
      [doors.length > 0 ? doorHandle : null, drawerFronts.length > 0 ? drawerHandle : null]
        .filter((handle) => handle !== null)
        .map((handle) => handle.name),
    ),
  ];
  const pushOnly = [doorHandle, drawerHandle].every((handle) => handle.kind === "push-to-open");

  if (handleNames.length > 0) {
    push({
      title: pushOnly ? "Fit the push latches" : "Fit the handles",
      detail: pushOnly
        ? "There are no handles, so each front opens on a push latch. Fit and adjust one per front, then check the fronts sit flush when closed."
        : "Handle holes are already drilled to the centres on the drawings. Fit them last so a slipped drill cannot mark a front you have already hung.",
      partIds: [...ids(doors), ...ids(drawerFronts)],
      hardware: handleNames,
    });
  }

  push({
    title: "Final check",
    detail:
      "Run every drawer, open and close every door, check the gaps, and load the shelves you " +
      "intend to load. Re-check the wall fixings once the wardrobe is filled.",
    partIds: [],
    hardware: [],
  });

  return { steps, totalPanels: model.parts.length };
}

function isCarcaseJoint(model: WardrobeModel, aId: string, bId: string): boolean {
  const a = model.partsById.get(aId);
  const b = model.partsById.get(bId);
  if (!a || !b) return false;
  const carcaseStages = new Set([0, 1]);
  return (
    carcaseStages.has(stageOf[a.role] ?? 9) && carcaseStages.has(stageOf[b.role] ?? 9)
  );
}

function connectorInstruction(kind: ReturnType<typeof getConnector>["kind"]): string {
  switch (kind) {
    case "dowel":
      return "Glue the dowels into the edge holes, dry-fit first, then draw the joints up with clamps.";
    case "confirmat":
      return "Drive the Confirmat screws through the face holes into the pilot holes in the edges.";
    case "cam":
      return "Screw the bolts into the edges, drop the cams into the 15mm face bores and turn them a half turn to lock.";
    case "lamello":
      return "Glue the biscuits into the slots and clamp until set.";
    case "screw":
      return "Drive the screws through the counterbored face holes into the pilot holes.";
  }
}

/** "left and right sides", "the top and bottom" — readable without listing 30 ids. */
function describe(parts: readonly Part[]): string {
  if (parts.length === 0) return "nothing";
  const roles = [...new Set(parts.map((part) => part.role))];
  const names = roles.map((role) => {
    const count = parts.filter((part) => part.role === role).length;
    const label = PART_ROLE_LABELS[role].toLowerCase();
    return count === 1 ? `the ${label}` : `${count} ${label}s`;
  });
  if (names.length === 1) return names[0] as string;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
