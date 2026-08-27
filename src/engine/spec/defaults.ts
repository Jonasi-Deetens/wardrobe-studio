import type {
  BayNode,
  Fitting,
  FittingKind,
  LayoutNode,
  SplitNode,
  WardrobeSpec,
} from "./types";
import { SPEC_VERSION } from "./types";

let nodeCounter = 0;

/**
 * Layout node ids only have to be unique within one spec, and they end up in
 * saved files, so a short readable counter beats a uuid.
 */
export function nextNodeId(prefix: "bay" | "split"): string {
  nodeCounter += 1;
  return `${prefix}-${nodeCounter}`;
}

/** Restarts the counter, so golden-file tests produce stable ids. */
export function resetNodeIds(): void {
  nodeCounter = 0;
}

export const DEFAULT_FITTINGS: { [K in FittingKind]: Extract<Fitting, { kind: K }> } = {
  empty: { kind: "empty" },
  shelves: {
    kind: "shelves",
    count: 4,
    adjustable: true,
    spacingMode: "even",
    pitch: 320,
    setback: 5,
    materialId: null,
  },
  hanging: {
    kind: "hanging",
    railId: "oval-30x15",
    // A long hang wants 1600-1800mm clear so coats and dresses do not touch down.
    clearHeight: 1650,
    railFromBack: 310,
    doubleHang: false,
    lowerClearHeight: 950,
    shelfAbove: true,
    shelvesAbove: 1,
  },
  drawers: {
    kind: "drawers",
    count: 3,
    frontHeights: null,
    dividers: 0,
    hasFronts: true,
  },
  "shoe-rack": {
    kind: "shoe-rack",
    tiers: 4,
    tilt: 12,
    tierPitch: 200,
  },
  "pullout-trays": {
    kind: "pullout-trays",
    count: 4,
    trayHeight: 100,
  },
};

export function makeBay(fitting: Fitting, label: string): BayNode {
  return { kind: "bay", id: nextNodeId("bay"), label, fitting };
}

export function makeSplit(
  axis: "vertical" | "horizontal",
  children: readonly { size: number | null; node: LayoutNode }[],
): SplitNode {
  return { kind: "split", id: nextNodeId("split"), axis, children };
}

/**
 * The default layout: a long-hang bay next to a bay of shelves over drawers.
 * It exercises every part of the solver, so a new user immediately sees what the
 * app can do rather than an empty box.
 */
function defaultLayout(): LayoutNode {
  return makeSplit("vertical", [
    { size: null, node: makeBay(DEFAULT_FITTINGS.hanging, "Long hang") },
    {
      size: null,
      node: makeSplit("horizontal", [
        {
          size: null,
          node: makeBay({ ...DEFAULT_FITTINGS.shelves, count: 4 }, "Shelves"),
        },
        {
          size: 700,
          node: makeBay({ ...DEFAULT_FITTINGS.drawers, count: 3 }, "Drawers"),
        },
      ]),
    },
  ]);
}

export function createDefaultSpec(): WardrobeSpec {
  resetNodeIds();
  return {
    version: SPEC_VERSION,
    meta: {
      name: "Untitled wardrobe",
      notes: "",
    },
    carcase: {
      width: 1800,
      // 2003mm is the 32mm-friendly height for 19mm board: 1984 + 2 x 9.5.
      height: 2200,
      // 600mm internal depth is what an adult hanger needs; 620 overall allows
      // for an 18mm front plus a 2mm gap.
      depth: 620,
      panelMaterialId: "mfc19-white",
      construction: "sides-through",
      snapToSystemGrid: true,
      plinth: {
        type: "recessed-rail",
        height: 100,
        setback: 50,
        legId: "leg-100",
      },
      back: {
        type: "groove",
        materialId: "hdf8",
        inset: 16,
        housingDepth: 9,
      },
      topOverhang: { left: 0, right: 0, front: 0 },
      scribe: { left: 0, right: 0, top: 0 },
      // Anchoring through the sides rather than the top carries substantially
      // more load and is far stiffer.
      wallAnchor: "sides",
      topStretcher: true,
    },
    layout: defaultLayout(),
    doors: {
      type: "hinged",
      overlayStyle: "full",
      // One leaf per bay by default, so every leaf has a full-height panel to hang
      // on. A leaf that meets over nothing cannot be hinged at all.
      leafMode: "per-bay",
      leafCount: 2,
      materialId: "mfc18-front-white",
      gap: 3,
      revealTop: 1.5,
      revealBottom: 1.5,
      hingeId: "clip-top-110",
      // 4.5mm boring with a 3mm plate gives 17.5mm overlay, which suits an
      // 18-19mm side panel.
      boringDistance: 4.5,
      plateHeight: 3,
      hingeCountOverride: null,
      hingeEndInset: 96,
      hingeSideRule: "alternate",
      bandingId: "abs1-white",
    },
    handles: {
      doorHandleId: "bar-320",
      doorOrientation: "vertical",
      doorPlacement: "centre",
      doorEdgeOffset: 45,
      doorCustomHeight: 1050,
      drawerHandleId: "bar-192",
      drawerOrientation: "horizontal",
      drawerPlacement: "centre",
      drawerCustomHeight: 0,
    },
    drawers: {
      slideId: "undermount-softclose",
      boxMaterialId: "ply15-drawer",
      bottomMaterialId: "ply6-drawer-bottom",
      bottomGrooveDepth: 6,
      bottomGrooveOffset: 12,
      frontMaterialId: "mfc18-front-white",
      frontBandingId: "abs1-white",
      boxHeight: 120,
      softClose: true,
    },
    joinery: {
      connectorId: "dowel-8x30",
      connectorSpacing: 128,
      systemHoles: {
        enabled: true,
        frontOffset: 37,
        rearOffset: 37,
        pitch: 32,
        startMode: "balanced",
        customStart: 96,
        onlyWhereNeeded: false,
      },
      shelfSupportId: "pin-5",
      shelfPinInset: 37,
    },
    production: {
      sheetSizeId: "2800x2070",
      kerf: 3.2,
      sheetTrim: 10,
      grainPolicy: "respect",
      banding: {
        carcaseVisibleEdges: "abs1-white",
        carcaseHiddenEdges: "none",
        shelfFront: "abs2-white",
        shelfOther: "none",
      },
      labourRate: 45,
      minutesPerPanel: 9,
    },
  };
}
