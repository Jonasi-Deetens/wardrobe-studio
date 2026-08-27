/**
 * The complete parameter set for a wardrobe. This is the only thing that gets
 * saved, shared or undone; everything else in the app is derived from it.
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
  /** Shop rate used for the cost estimate, per hour. */
  readonly labourRate: number;
  /** Estimated minutes per panel for cutting, banding and drilling. */
  readonly minutesPerPanel: number;
};

/* --------------------------------------------------------------- the spec - */

export const SPEC_VERSION = 1;

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
  readonly production: ProductionSpec;
};

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

export const CARCASE_CONSTRUCTION_LABELS: Record<CarcaseConstruction, string> = {
  "sides-through": "Sides full height, top and bottom between",
  "top-over-sides": "Top laid over the sides",
  "horizontals-through": "Top and bottom full width, sides between",
};
