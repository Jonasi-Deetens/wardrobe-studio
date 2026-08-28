import type {
  BayNode,
  CladdingSpec,
  Fitting,
  FittingKind,
  LayoutNode,
  ProductionSpec,
  ProjectSpec,
  RoomSpec,
  SplitNode,
  UnitPlacement,
  UnitSpec,
  WardrobeSpec,
  WardrobeUnitSpec,
  CounterUnitSpec,
  WorkTableUnitSpec,
} from "./types";
import { SPEC_VERSION } from "./types";

let nodeCounter = 0;
let unitCounter = 0;

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

export function nextUnitId(): string {
  unitCounter += 1;
  return `u${unitCounter}`;
}

export function resetUnitIds(): void {
  unitCounter = 0;
}

/**
 * Copies a layout tree with fresh ids. Adding a second unit from the same template
 * would otherwise give two bays the same id, and bay selection, findings and the
 * layout editor all address a bay by id alone.
 */
export function reidLayout(node: LayoutNode): LayoutNode {
  if (node.kind === "bay") return { ...node, id: nextNodeId("bay") };
  return {
    ...node,
    id: nextNodeId("split"),
    children: node.children.map((child) => ({ ...child, node: reidLayout(child.node) })),
  };
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

export const DEFAULT_CLADDING: CladdingSpec = {
  style: "none",
  materialId: "pine-19-clad",
  faces: ["front"],
  // 90mm boards with a 10mm shadow gap reads as a plank front without needing a
  // perfectly even division of the height.
  pieceWidth: 90,
  gap: 10,
  direction: "horizontal",
  standoff: 0,
  fixing: "face-screwed",
  riseAboveTop: 0,
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
    cladding: DEFAULT_CLADDING,
    production: createDefaultProduction(),
  };
}

export function createDefaultProduction(): ProductionSpec {
  return {
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
    // Tube is sold in 6m lengths and a cold saw takes about 2mm a cut.
    stockBarLength: 6000,
    barKerf: 2,
    labourRate: 45,
    minutesPerPanel: 9,
    minutesPerMember: 4,
    minutesPerWeld: 6,
  };
}

/* ---------------------------------------------------------- the project --- */

/**
 * Strips a wardrobe spec down to what a unit stores. The version, the name and the
 * production settings belong to the project, so they are dropped here and put back by
 * `wardrobeSpecOf`.
 */
export function unitOfWardrobe(spec: WardrobeSpec): WardrobeUnitSpec {
  return {
    kind: "wardrobe",
    carcase: spec.carcase,
    layout: spec.layout,
    doors: spec.doors,
    handles: spec.handles,
    drawers: spec.drawers,
    joinery: spec.joinery,
    cladding: spec.cladding,
  };
}

export function createDefaultUnit(): WardrobeUnitSpec {
  return unitOfWardrobe(createDefaultSpec());
}

/**
 * A stainless work table at the size the trade actually builds.
 *
 * 1400 x 700 x 900 with a 100mm upstand is the single most common bench in a commercial
 * kitchen: 700 deep takes a gastronorm pan across it with room to work in front, 900 high
 * suits standing prep, and the upstand keeps splashes off the wall behind.
 */
export function createDefaultWorkTable(): WorkTableUnitSpec {
  return {
    kind: "work-table",
    width: 1400,
    depth: 700,
    height: 900,
    top: {
      materialId: "inox15-304",
      edge: "folded-down",
      edgeReturn: 40,
      upstand: 100,
      upstandReturn: 20,
    },
    legs: {
      profileId: "shs-40x40x2-ss",
      inset: 50,
      feet: "bullet",
      braced: false,
    },
    shelves: {
      count: 1,
      materialId: "inox12-304",
      lowest: 200,
      spacing: 300,
      edgeReturn: 25,
    },
    groundWelds: true,
    cladding: DEFAULT_CLADDING,
  };
}

/**
 * A serving counter on a welded frame: 1800 long, 650 deep, 950 to the top, with a bank of
 * three drawers at the left end and a shelf underneath.
 *
 * 950 rather than 900 because a counter is worked at from one side and leaned on from the
 * other, and 650 deep because that is as far as anyone can reach across it.
 */
export function createDefaultCounter(): CounterUnitSpec {
  return {
    kind: "counter",
    width: 1800,
    depth: 650,
    height: 950,
    frame: {
      profileId: "shs-40x40x2",
      inset: 60,
      feet: "bullet",
      braced: true,
      bottomRail: 150,
    },
    top: {
      kind: "panel",
      materialId: "ply18-birch",
      bandingId: "abs1-oak",
      frontOverhang: 30,
      endOverhang: 20,
      backOverhang: 0,
    },
    bar: {
      height: 0,
      depth: 250,
      materialId: "ply18-birch",
    },
    drawerBank: {
      enabled: true,
      fromLeft: 60,
      width: 500,
      count: 3,
      carcaseMaterialId: "ply18-birch",
      frontMaterialId: "ply18-birch",
      handleId: "bar-128",
      slideId: "undermount-softclose",
    },
    shelves: {
      count: 1,
      materialId: "ply18-birch",
      lowest: 200,
      spacing: 350,
      setback: 40,
    },
    groundWelds: false,
    cladding: DEFAULT_CLADDING,
  };
}

/** Wraps a unit spec in a placement, with fresh ids so it can join a project. */
export function placeUnit(
  unit: UnitSpec,
  name: string,
  at: { x: number; z: number; yaw?: number } = { x: 0, z: 0 },
): UnitPlacement {
  const withFreshIds: UnitSpec =
    unit.kind === "wardrobe" ? { ...unit, layout: reidLayout(unit.layout) } : unit;
  return {
    id: nextUnitId(),
    name,
    at: { x: at.x, z: at.z, yaw: at.yaw ?? 0 },
    unit: withFreshIds,
  };
}

/**
 * A room big enough to walk around in: 4m across, 3m deep, 2.5m to the ceiling, which
 * is an ordinary bedroom and makes the default wardrobe look the size it really is.
 */
export function createDefaultRoom(): RoomSpec {
  return {
    width: 4000,
    depth: 3000,
    height: 2500,
    wallThickness: 100,
    roof: {
      kind: "flat",
      pitch: 15,
      slopeAxis: "z",
      flip: false,
      overhang: 0,
      thickness: 60,
    },
    openings: [
      { id: "win-1", wall: "left", x: 900, sill: 900, width: 1200, height: 1300 },
    ],
  };
}

export function createDefaultProject(): ProjectSpec {
  resetUnitIds();
  const unit = createDefaultUnit();
  return {
    version: SPEC_VERSION,
    meta: { name: "Untitled project", notes: "" },
    room: createDefaultRoom(),
    units: [placeUnit(unit, "Wardrobe", { x: 200, z: 0 })],
    production: createDefaultProduction(),
  };
}
