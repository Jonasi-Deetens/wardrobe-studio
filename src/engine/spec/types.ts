/**
 * The complete parameter set for a project: a room, and the units standing in it.
 * This is the only thing that gets saved, shared or undone; everything else in the
 * app is derived from it.
 *
 * Most of this file describes a wardrobe, which is one kind of unit. The room and
 * the unit list are at the bottom.
 */

/* ---------------------------------------------------------------- carcase - */

/**
 * How the corners of the box are put together. The load path differs, which is
 * why this is a first-class choice rather than a detail.
 *
 * - `sides-through`   Full-height sides; top and bottom are captured between
 *                     them. Vertical load is carried in shear by the side panel,
 *                     which is the strongest arrangement and the default.
 * - `top-over-sides`  Top laid across the sides. Easier to build and gives a
 *                     continuous top surface, but the top is then held by the
 *                     fittings in tension rather than sitting on the sides.
 * - `horizontals-through` Top and bottom run the full width with the sides
 *                     between them. Common in face-frame work; the horizontals
 *                     push against fastener heads.
 */
export type CarcaseConstruction =
  | "sides-through"
  | "top-over-sides"
  | "horizontals-through";

export type PlinthType = "none" | "recessed-rail" | "integrated-sides" | "legs";

export type BackType = "none" | "groove" | "rabbet" | "surface";

export type WallAnchorMode = "sides" | "top" | "none";

export type CarcaseSpec = {
  /** Overall width across the outer faces of the side panels. */
  readonly width: number;
  /** Overall height from the floor to the top of the top panel. */
  readonly height: number;
  /** Overall depth from the rear plane to the front edge of the carcase. */
  readonly depth: number;
  readonly panelMaterialId: string;
  readonly construction: CarcaseConstruction;
  /**
   * Snap the internal height and depth to the 32mm system grid so hardware
   * indexes cleanly. Shows the resulting true dimensions when on.
   */
  readonly snapToSystemGrid: boolean;
  readonly plinth: {
    readonly type: PlinthType;
    readonly height: number;
    /** How far the plinth face is set back from the carcase front. */
    readonly setback: number;
    readonly legId: string;
  };
  readonly back: {
    readonly type: BackType;
    readonly materialId: string;
    /** Distance from the rear plane of the carcase to the back panel. */
    readonly inset: number;
    /** Depth of the groove or rabbet the panel sits in. */
    readonly housingDepth: number;
  };
  readonly topOverhang: {
    readonly left: number;
    readonly right: number;
    readonly front: number;
  };
  /** Extra material left on for scribing to an out-of-square wall or ceiling. */
  readonly scribe: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
  };
  readonly wallAnchor: WallAnchorMode;
  /** Adds a rail across the top rear to stop the carcase racking. */
  readonly topStretcher: boolean;
};

/* ----------------------------------------------------------------- layout - */

export type ShelfSpacingMode = "even" | "pitch";

/** Adjustable or fixed shelves filling a compartment. */
export type ShelvesFitting = {
  readonly kind: "shelves";
  readonly count: number;
  readonly adjustable: boolean;
  readonly spacingMode: ShelfSpacingMode;
  /** Clear height between shelves when `spacingMode` is `pitch`. */
  readonly pitch: number;
  /** How far the shelf front sits back from the carcase front edge. */
  readonly setback: number;
  /** Override the carcase material, e.g. a thicker board for a long span. */
  readonly materialId: string | null;
};

export type HangingFitting = {
  readonly kind: "hanging";
  readonly railId: string;
  /** Clear height under the rail. Long hang wants 1600-1800, short hang 900-1000. */
  readonly clearHeight: number;
  /** Rail centre distance from the back of the carcase. */
  readonly railFromBack: number;
  /** A second rail below the first, for shirts over trousers. */
  readonly doubleHang: boolean;
  /** Clear height under the lower rail when double hanging. */
  readonly lowerClearHeight: number;
  /** A fixed shelf directly above the rail, which also stiffens the carcase. */
  readonly shelfAbove: boolean;
  /** Extra shelves stacked above the rail shelf. */
  readonly shelvesAbove: number;
};

export type DrawersFitting = {
  readonly kind: "drawers";
  readonly count: number;
  /**
   * Explicit front heights, front to back of the stack from the bottom up. When
   * null the heights are derived as equal multiples of 32 minus the front gap.
   */
  readonly frontHeights: readonly number[] | null;
  /** Internal dividers per drawer, front to back. */
  readonly dividers: number;
  /** Fronts on the drawers, as opposed to open boxes behind a door. */
  readonly hasFronts: boolean;
};

export type ShoeRackFitting = {
  readonly kind: "shoe-rack";
  readonly tiers: number;
  /** Tilt of each shelf in degrees; 0 is a flat shelf. */
  readonly tilt: number;
  readonly tierPitch: number;
};

export type PulloutFitting = {
  readonly kind: "pullout-trays";
  readonly count: number;
  readonly trayHeight: number;
};

export type EmptyFitting = { readonly kind: "empty" };

export type Fitting =
  | ShelvesFitting
  | HangingFitting
  | DrawersFitting
  | ShoeRackFitting
  | PulloutFitting
  | EmptyFitting;

export type FittingKind = Fitting["kind"];

/**
 * A compartment. Bays are the leaves of the layout tree and each one carries one
 * fitting.
 */
export type BayNode = {
  readonly kind: "bay";
  readonly id: string;
  readonly label: string;
  readonly fitting: Fitting;
};

/**
 * A division of the parent space. `vertical` inserts vertical dividers and splits
 * the width; `horizontal` inserts fixed shelves and splits the height.
 */
export type SplitNode = {
  readonly kind: "split";
  readonly id: string;
  readonly axis: "vertical" | "horizontal";
  readonly children: readonly LayoutChild[];
};

export type LayoutChild = {
  /** Clear size of this child, or null to share the remaining space equally. */
  readonly size: number | null;
  readonly node: LayoutNode;
};

export type LayoutNode = BayNode | SplitNode;

/* ------------------------------------------------------------------ doors - */

export type DoorType = "none" | "hinged";

/**
 * Where the leaf sits relative to the carcase.
 *
 * - `full`  covers the side panel edge; the usual choice
 * - `half`  covers half a shared divider, so two leaves meet over one panel
 * - `inset` sits inside the opening, flush with the carcase front
 */
export type OverlayStyle = "full" | "half" | "inset";

export type HingeSideRule = "alternate" | "all-left" | "all-right" | "pairs";

export type DoorsSpec = {
  readonly type: DoorType;
  readonly overlayStyle: OverlayStyle;
  /** One leaf per bay, or an explicit count spread evenly across the carcase. */
  readonly leafMode: "per-bay" | "count";
  readonly leafCount: number;
  readonly materialId: string;
  /** Gap between adjacent leaves and around the carcase. */
  readonly gap: number;
  readonly revealTop: number;
  readonly revealBottom: number;
  readonly hingeId: string;
  /** Distance from the leaf edge to the near side of the Ø35 cup, 3 to 7mm. */
  readonly boringDistance: number;
  readonly plateHeight: number;
  /** Force a hinge count instead of deriving it from the leaf height. */
  readonly hingeCountOverride: number | null;
  /** Distance from the leaf top and bottom to the outer hinge centres. */
  readonly hingeEndInset: number;
  readonly hingeSideRule: HingeSideRule;
  readonly bandingId: string;
};

/* ---------------------------------------------------------------- handles - */

export type HandlePlacement = "top" | "centre" | "bottom" | "custom";

export type HandlesSpec = {
  readonly doorHandleId: string;
  readonly doorOrientation: "vertical" | "horizontal";
  readonly doorPlacement: HandlePlacement;
  /** Distance from the handle centre to the opening edge of the leaf. */
  readonly doorEdgeOffset: number;
  /** Height of the handle centre, measured from the bottom of the leaf. */
  readonly doorCustomHeight: number;
  readonly drawerHandleId: string;
  readonly drawerOrientation: "vertical" | "horizontal";
  readonly drawerPlacement: HandlePlacement;
  /** Height of the handle centre above the bottom of the drawer front. */
  readonly drawerCustomHeight: number;
};

/* ---------------------------------------------------------------- drawers - */

export type DrawersSpec = {
  readonly slideId: string;
  readonly boxMaterialId: string;
  readonly bottomMaterialId: string;
  /** Depth of the groove the drawer bottom sits in. */
  readonly bottomGrooveDepth: number;
  /** Height of the bottom groove above the lower edge of the box side. */
  readonly bottomGrooveOffset: number;
  readonly frontMaterialId: string;
  readonly frontBandingId: string;
  /** Nominal clear height of a drawer box side. */
  readonly boxHeight: number;
  readonly softClose: boolean;
};

/* --------------------------------------------------------------- joinery -- */

export type SystemHoleStartMode = "balanced" | "custom";

export type JoinerySpec = {
  readonly connectorId: string;
  /** Nominal spacing of connectors along a joint. */
  readonly connectorSpacing: number;
  readonly systemHoles: {
    readonly enabled: boolean;
    /** Centre distance from the front edge to the front row. 37mm is standard. */
    readonly frontOffset: number;
    /** Centre distance from the back edge to the rear row, or null for none. */
    readonly rearOffset: number | null;
    readonly pitch: number;
    readonly startMode: SystemHoleStartMode;
    /** Distance from the panel bottom to the first hole when start is custom. */
    readonly customStart: number;
    /** Leave the rows out where a bay has no adjustable shelves. */
    readonly onlyWhereNeeded: boolean;
  };
  readonly shelfSupportId: string;
  /** Distance from the shelf front and back edges to the outer pins. */
  readonly shelfPinInset: number;
};

/* -------------------------------------------------------------- cladding -- */

/**
 * A skin over the outside of a unit. A bar front is the obvious case: the carcase or
 * the frame is whatever it needs to be structurally, and the face the customer sees
 * is boards or slats fixed over it.
 */
export type CladdingStyle = "none" | "slats" | "board" | "tongue-groove";

export type CladdingFace = "front" | "left" | "right" | "back";

export type CladdingSpec = {
  readonly style: CladdingStyle;
  readonly materialId: string;
  /** Which faces of the unit are clad. */
  readonly faces: readonly CladdingFace[];
  /** Face width of one slat or board. */
  readonly pieceWidth: number;
  /** Gap between pieces. Board and tongue-and-groove close up, so they ignore it. */
  readonly gap: number;
  readonly direction: "horizontal" | "vertical";
  /** Battens behind the cladding hold it this far off the unit. */
  readonly standoff: number;
  readonly fixing: "secret" | "face-screwed" | "glued";
  /** How far the cladding runs past the top of the unit, for a bar front. */
  readonly riseAboveTop: number;
};

/* ------------------------------------------------------------ production -- */

export type GrainPolicy = "respect" | "ignore";

export type BandingDefaults = {
  readonly carcaseVisibleEdges: string;
  readonly carcaseHiddenEdges: string;
  readonly shelfFront: string;
  readonly shelfOther: string;
};

export type ProductionSpec = {
  readonly sheetSizeId: string;
  /** Saw blade thickness, added to every cut in the nesting layout. */
  readonly kerf: number;
  /** Trim removed from the sheet edges before nesting. */
  readonly sheetTrim: number;
  readonly grainPolicy: GrainPolicy;
  readonly banding: BandingDefaults;
  /** Length of a stock bar of tube, which metal members are cut from. */
  readonly stockBarLength: number;
  /** Cut-off allowance per metal cut; a cold saw takes about 2mm. */
  readonly barKerf: number;
  /** Shop rate used for the cost estimate, per hour. */
  readonly labourRate: number;
  /** Estimated minutes per panel for cutting, banding and drilling. */
  readonly minutesPerPanel: number;
  /** Estimated minutes per metal member for cutting, and per weld for welding. */
  readonly minutesPerMember: number;
  readonly minutesPerWeld: number;
};

/* --------------------------------------------------------- the wardrobe --- */

/**
 * Everything about one wardrobe, with the project-level sections folded back in.
 *
 * This is what the wardrobe solver takes. It is not what gets saved: a saved unit
 * holds the wardrobe's own sections only, and `wardrobeSpecOf` puts the name, the
 * version and the shop's production settings back on top of it. Keeping this shape
 * means the solver, the machining rules, the advisor and the assembly sequence never
 * had to learn that a project can hold more than one wardrobe.
 */
export type WardrobeSpec = {
  readonly version: number;
  readonly meta: {
    readonly name: string;
    readonly notes: string;
  };
  readonly carcase: CarcaseSpec;
  readonly layout: LayoutNode;
  readonly doors: DoorsSpec;
  readonly handles: HandlesSpec;
  readonly drawers: DrawersSpec;
  readonly joinery: JoinerySpec;
  readonly cladding: CladdingSpec;
  readonly production: ProductionSpec;
};

/* ------------------------------------------------------------------ room -- */

export type WallSide = "back" | "front" | "left" | "right";

export type RoofKind = "flat" | "shed" | "gable";

/**
 * A hole in a wall. Only the hole is modelled: no frame, no sill, no glazing, which
 * is enough to see whether a unit blocks a window or a door.
 */
export type Opening = {
  readonly id: string;
  readonly wall: WallSide;
  /** Distance along the wall from its left end, seen from inside the room. */
  readonly x: number;
  /** Height of the sill above the floor. Zero makes it a doorway. */
  readonly sill: number;
  readonly width: number;
  readonly height: number;
};

/**
 * The space the units stand in. The room is context: it is drawn, and it is what the
 * advisor measures clearances against, but nothing about it is manufactured, so no
 * part of it reaches the cut list.
 */
export type RoomSpec = {
  /** Clear internal width, left to right. */
  readonly width: number;
  /** Clear internal depth, back to front. */
  readonly depth: number;
  /** Clear height at the eaves. A pitched roof rises above this. */
  readonly height: number;
  readonly wallThickness: number;
  readonly roof: {
    readonly kind: RoofKind;
    /** Degrees from horizontal. */
    readonly pitch: number;
    /** The axis the roof slopes along. A gable's ridge runs across it. */
    readonly slopeAxis: "x" | "z";
    /** Swaps which end of that axis is the high one. Shed roofs only. */
    readonly flip: boolean;
    /** How far the roof oversails the walls. */
    readonly overhang: number;
    readonly thickness: number;
  };
  readonly openings: readonly Opening[];
};

/* ----------------------------------------------------------------- units -- */

export type UnitKind = "wardrobe" | "work-table" | "counter";

/* ------------------------------------------------------------ work table -- */

/**
 * A commercial stainless work table.
 *
 * The proportions are not free: a gastronorm pan is 530mm deep, so a table is 600 or 700
 * deep and nothing in between is useful; a work surface is 850 to 900 high because that is
 * what a standing adult can lean on; and legs are 40x40 square section or 38.1mm round
 * because those are the sizes the fittings are made for.
 */
export type WorkTableTopEdge =
  /** The simplest and the most common: the whole edge turned down 40mm. */
  | "folded-down"
  /** Turned down, then back in under itself. Stiffer, and no raw edge underneath. */
  | "boxed"
  /** No fold at all, for a top let into a frame. */
  | "square";

export type WorkTableFeet = "bullet" | "castor" | "none";

export type WorkTableSpec = {
  readonly width: number;
  readonly depth: number;
  /** To the top of the work surface. */
  readonly height: number;
  readonly top: {
    readonly materialId: string;
    readonly edge: WorkTableTopEdge;
    /** How far the edge turns down. 40mm is standard. */
    readonly edgeReturn: number;
    /** Rear upstand height. 0 for none, otherwise 100 or 150. */
    readonly upstand: number;
    /** The upstand's own top return, folded back towards the wall. */
    readonly upstandReturn: number;
  };
  readonly legs: {
    readonly profileId: string;
    /** How far the legs are set in from the outside faces of the top. */
    readonly inset: number;
    readonly feet: WorkTableFeet;
    readonly braced: boolean;
  };
  readonly shelves: {
    /** 0, 1 or 2 undershelves. */
    readonly count: number;
    readonly materialId: string;
    /** Height above the floor of the lowest shelf. */
    readonly lowest: number;
    /** Gap between shelves when there are two. */
    readonly spacing: number;
    /** Turn the shelf edges down as well, which is what stops a thin shelf drumming. */
    readonly edgeReturn: number;
  };
  /** Grind the visible welds flush. What a front-of-house table needs. */
  readonly groundWelds: boolean;
};

export type WorkTableUnitSpec = { readonly kind: "work-table" } & WorkTableSpec & {
    readonly cladding: CladdingSpec;
  };

/* ---------------------------------------------------------------- counter -- */

/**
 * A counter: a welded tube frame, a panel top, and whatever is hung inside it.
 *
 * This is the beach-bar and shop-counter case, and it is a different animal from the
 * wardrobe even though it shares the drawer. The frame carries everything, the top is a
 * board rather than a folded sheet, and the front is a face to be clad rather than a
 * carcase side.
 *
 * Heights are not free either. A serving counter is 900 to 950 so it works standing;
 * a bar counter people sit at is 1050 to 1100, which is what a bar stool is made for.
 */
export type CounterTopMaterial = "panel" | "inox";

export type CounterSpec = {
  readonly width: number;
  readonly depth: number;
  /** To the top of the working surface, on the serving side. */
  readonly height: number;
  readonly frame: {
    readonly profileId: string;
    /** How far the frame is set back from the outside faces of the top. */
    readonly inset: number;
    readonly feet: WorkTableFeet;
    readonly braced: boolean;
    /** Rail height above the floor for the bottom ring, which also carries a shelf. */
    readonly bottomRail: number;
  };
  readonly top: {
    readonly kind: CounterTopMaterial;
    readonly materialId: string;
    readonly bandingId: string;
    /** How far the top oversails the frame at the front, for a bar to lean on. */
    readonly frontOverhang: number;
    /** And at the two ends. */
    readonly endOverhang: number;
    /** Behind, where the counter stands against something. */
    readonly backOverhang: number;
  };
  /**
   * A raised bar shelf over the back of the counter, at drinking height. 0 for none.
   * This is the part that makes a counter a bar rather than a table.
   */
  readonly bar: {
    /** Height above the floor of the bar surface. 0 disables it. */
    readonly height: number;
    readonly depth: number;
    readonly materialId: string;
  };
  /** A carcase of drawers dropped into the frame, or none. */
  readonly drawerBank: {
    readonly enabled: boolean;
    /** Which end of the counter it sits at, measured from the left. */
    readonly fromLeft: number;
    readonly width: number;
    readonly count: number;
    readonly carcaseMaterialId: string;
    readonly frontMaterialId: string;
    readonly handleId: string;
    readonly slideId: string;
  };
  /** Open shelves inside the frame, above the bottom rail. */
  readonly shelves: {
    readonly count: number;
    readonly materialId: string;
    readonly lowest: number;
    readonly spacing: number;
    /** Keep the shelf back from the front face, so it is not seen from the outside. */
    readonly setback: number;
  };
  readonly groundWelds: boolean;
};

export type CounterUnitSpec = { readonly kind: "counter" } & CounterSpec & {
    readonly cladding: CladdingSpec;
  };

/**
 * A wardrobe as it is stored in a project: its own sections, without the name, the
 * version or the production settings, which belong to the project as a whole.
 */
export type WardrobeUnitSpec = { readonly kind: "wardrobe" } & Omit<
  WardrobeSpec,
  "version" | "meta" | "production"
>;

export type UnitSpec = WardrobeUnitSpec | WorkTableUnitSpec | CounterUnitSpec;

/**
 * A unit and where it stands.
 *
 * A unit is designed in its own space — +X right, +Y up, +Z back to front, origin on
 * the floor at the back-left corner of its footprint — and placed in the room by
 * moving that origin to `at` and turning it about it. A yaw of zero therefore puts
 * the unit's back against the back wall, facing into the room.
 */
export type UnitPlacement = {
  readonly id: string;
  readonly name: string;
  readonly at: {
    readonly x: number;
    readonly z: number;
    /** Degrees, turning the unit anticlockwise seen from above. */
    readonly yaw: number;
  };
  readonly unit: UnitSpec;
};

/* -------------------------------------------------------------- the spec -- */

/**
 * Version 1 was a single wardrobe and was the whole document. Version 2 wraps that in
 * a room and a list of units; `migrate.ts` upgrades a version 1 file by putting its
 * wardrobe in a default room at the origin.
 */
export const SPEC_VERSION = 2;

export type ProjectSpec = {
  readonly version: number;
  readonly meta: {
    readonly name: string;
    readonly notes: string;
  };
  readonly room: RoomSpec;
  readonly units: readonly UnitPlacement[];
  /** The shop, not the design: sheet stock, saw, bar stock, rates. */
  readonly production: ProductionSpec;
};

/** Rebuilds the shape the wardrobe solver takes from a stored unit. */
export function wardrobeSpecOf(
  project: ProjectSpec,
  unit: WardrobeUnitSpec,
  name?: string,
): WardrobeSpec {
  const { kind: _kind, ...body } = unit;
  return {
    version: project.version,
    meta: { name: name ?? project.meta.name, notes: project.meta.notes },
    production: project.production,
    ...body,
  };
}

/** The units in a project that are wardrobes, with their placement. */
export function wardrobeUnits(
  project: ProjectSpec,
): readonly (UnitPlacement & { readonly unit: WardrobeUnitSpec })[] {
  return project.units.filter(
    (placed): placed is UnitPlacement & { unit: WardrobeUnitSpec } =>
      placed.unit.kind === "wardrobe",
  );
}

/* ------------------------------------------------------------ tree helpers - */

export function isBay(node: LayoutNode): node is BayNode {
  return node.kind === "bay";
}

export function isSplit(node: LayoutNode): node is SplitNode {
  return node.kind === "split";
}

/** Depth-first walk over the layout tree. */
export function walkLayout(
  node: LayoutNode,
  visit: (node: LayoutNode, path: readonly number[]) => void,
  path: readonly number[] = [],
): void {
  visit(node, path);
  if (node.kind === "split") {
    node.children.forEach((child, index) => {
      walkLayout(child.node, visit, [...path, index]);
    });
  }
}

export function collectBays(node: LayoutNode): BayNode[] {
  const bays: BayNode[] = [];
  walkLayout(node, (n) => {
    if (n.kind === "bay") bays.push(n);
  });
  return bays;
}

export function findNode(root: LayoutNode, id: string): LayoutNode | null {
  let found: LayoutNode | null = null;
  walkLayout(root, (n) => {
    if (found) return;
    if (n.kind === "bay" ? n.id === id : n.id === id) found = n;
  });
  return found;
}

/** Replaces a node by id, returning a new tree. */
export function replaceNode(
  root: LayoutNode,
  id: string,
  replacement: LayoutNode,
): LayoutNode {
  if (root.id === id) return replacement;
  if (root.kind !== "split") return root;
  return {
    ...root,
    children: root.children.map((child) => ({
      ...child,
      node: replaceNode(child.node, id, replacement),
    })),
  };
}

/** Removes a node by id. A split left with one child collapses into that child. */
export function removeNode(root: LayoutNode, id: string): LayoutNode {
  if (root.kind !== "split") return root;
  const kept = root.children
    .filter((child) => child.node.id !== id)
    .map((child) => ({ ...child, node: removeNode(child.node, id) }));
  if (kept.length === 0) return root;
  if (kept.length === 1) {
    const only = kept[0];
    if (only) return only.node;
  }
  return { ...root, children: kept };
}

export function updateChildSize(
  root: LayoutNode,
  nodeId: string,
  size: number | null,
): LayoutNode {
  if (root.kind !== "split") return root;
  return {
    ...root,
    children: root.children.map((child) =>
      child.node.id === nodeId
        ? { ...child, size }
        : { ...child, node: updateChildSize(child.node, nodeId, size) },
    ),
  };
}

export const FITTING_LABELS: Record<FittingKind, string> = {
  empty: "Empty",
  shelves: "Shelves",
  hanging: "Hanging rail",
  drawers: "Drawers",
  "shoe-rack": "Shoe rack",
  "pullout-trays": "Pull-out trays",
};

export const UNIT_KIND_LABELS: Record<UnitKind, string> = {
  wardrobe: "Wardrobe",
  "work-table": "Work table",
  counter: "Counter",
};

export const COUNTER_TOP_LABELS: Record<CounterTopMaterial, string> = {
  panel: "Board on the frame",
  inox: "Folded stainless tray",
};

export const WORK_TABLE_EDGE_LABELS: Record<WorkTableTopEdge, string> = {
  "folded-down": "Turned down",
  boxed: "Boxed edge",
  square: "Square, no fold",
};

export const WORK_TABLE_FEET_LABELS: Record<WorkTableFeet, string> = {
  bullet: "Adjustable bullet feet",
  castor: "Braked castors",
  none: "None, legs on the floor",
};

export const CLADDING_STYLE_LABELS: Record<CladdingStyle, string> = {
  none: "No cladding",
  slats: "Slats with gaps",
  board: "Butted boards",
  "tongue-groove": "Tongue and groove",
};

export const WALL_SIDE_LABELS: Record<WallSide, string> = {
  back: "Back wall",
  front: "Front wall",
  left: "Left wall",
  right: "Right wall",
};

export const CARCASE_CONSTRUCTION_LABELS: Record<CarcaseConstruction, string> = {
  "sides-through": "Sides full height, top and bottom between",
  "top-over-sides": "Top laid over the sides",
  "horizontals-through": "Top and bottom full width, sides between",
};
