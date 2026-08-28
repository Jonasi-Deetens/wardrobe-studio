import { z } from "zod";
import type { LayoutChild, LayoutNode, ProjectSpec, WardrobeSpec } from "./types";

/**
 * Runtime validation for a saved or shared spec.
 *
 * Bounds here are the limits of what the engine can build sensibly, not style
 * advice: anything merely unwise (a 1200mm shelf span, a 700mm door leaf) parses
 * happily and is reported by the advisor instead, so the user is never blocked
 * from typing a number.
 */

const positive = (max: number) => z.number().finite().min(0).max(max);

const fittingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("empty") }),
  z.object({
    kind: z.literal("shelves"),
    count: z.number().int().min(0).max(40),
    adjustable: z.boolean(),
    spacingMode: z.enum(["even", "pitch"]),
    pitch: positive(2000),
    setback: positive(200),
    materialId: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("hanging"),
    railId: z.string(),
    clearHeight: positive(3000),
    railFromBack: positive(1200),
    doubleHang: z.boolean(),
    lowerClearHeight: positive(3000),
    shelfAbove: z.boolean(),
    shelvesAbove: z.number().int().min(0).max(10),
  }),
  z.object({
    kind: z.literal("drawers"),
    count: z.number().int().min(0).max(12),
    frontHeights: z.array(positive(1000)).nullable(),
    dividers: z.number().int().min(0).max(6),
    hasFronts: z.boolean(),
  }),
  z.object({
    kind: z.literal("shoe-rack"),
    tiers: z.number().int().min(1).max(12),
    tilt: z.number().min(0).max(30),
    tierPitch: positive(600),
  }),
  z.object({
    kind: z.literal("pullout-trays"),
    count: z.number().int().min(1).max(12),
    trayHeight: positive(600),
  }),
]);

const bayNodeSchema = z.object({
  kind: z.literal("bay"),
  id: z.string().min(1),
  label: z.string(),
  fitting: fittingSchema,
});

const layoutChildSchema: z.ZodType<LayoutChild> = z.lazy(() =>
  z.object({
    size: z.number().finite().min(0).max(6000).nullable(),
    node: layoutNodeSchema,
  }),
) as z.ZodType<LayoutChild>;

const splitNodeSchema = z.object({
  kind: z.literal("split"),
  id: z.string().min(1),
  axis: z.enum(["vertical", "horizontal"]),
  children: z.array(layoutChildSchema).min(1).max(20),
});

export const layoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.union([bayNodeSchema, splitNodeSchema]),
) as z.ZodType<LayoutNode>;

const carcaseSchema = z.object({
  width: positive(6000).min(200),
  height: positive(3600).min(200),
  depth: positive(1200).min(150),
  panelMaterialId: z.string(),
  construction: z.enum([
    "sides-through",
    "top-over-sides",
    "horizontals-through",
  ]),
  snapToSystemGrid: z.boolean(),
  plinth: z.object({
    type: z.enum(["none", "recessed-rail", "integrated-sides", "legs"]),
    height: positive(400),
    setback: positive(200),
    legId: z.string(),
  }),
  back: z.object({
    type: z.enum(["none", "groove", "rabbet", "surface"]),
    materialId: z.string(),
    inset: positive(200),
    housingDepth: positive(30),
  }),
  topOverhang: z.object({
    left: positive(200),
    right: positive(200),
    front: positive(200),
  }),
  scribe: z.object({
    left: positive(100),
    right: positive(100),
    top: positive(100),
  }),
  wallAnchor: z.enum(["sides", "top", "none"]),
  topStretcher: z.boolean(),
});

const doorsSchema = z.object({
  type: z.enum(["none", "hinged"]),
  overlayStyle: z.enum(["full", "half", "inset"]),
  leafMode: z.enum(["per-bay", "count"]),
  leafCount: z.number().int().min(1).max(12),
  materialId: z.string(),
  gap: positive(20),
  revealTop: z.number().min(-50).max(100),
  revealBottom: z.number().min(-50).max(100),
  hingeId: z.string(),
  boringDistance: z.number().min(0).max(12),
  plateHeight: z.number().min(0).max(20),
  hingeCountOverride: z.number().int().min(2).max(10).nullable(),
  hingeEndInset: positive(500),
  hingeSideRule: z.enum(["alternate", "all-left", "all-right", "pairs"]),
  bandingId: z.string(),
});

const handlesSchema = z.object({
  doorHandleId: z.string(),
  doorOrientation: z.enum(["vertical", "horizontal"]),
  doorPlacement: z.enum(["top", "centre", "bottom", "custom"]),
  doorEdgeOffset: positive(300),
  doorCustomHeight: positive(3000),
  drawerHandleId: z.string(),
  drawerOrientation: z.enum(["vertical", "horizontal"]),
  drawerPlacement: z.enum(["top", "centre", "bottom", "custom"]),
  drawerCustomHeight: positive(600),
});

const drawersSchema = z.object({
  slideId: z.string(),
  boxMaterialId: z.string(),
  bottomMaterialId: z.string(),
  bottomGrooveDepth: positive(20),
  bottomGrooveOffset: positive(60),
  frontMaterialId: z.string(),
  frontBandingId: z.string(),
  boxHeight: positive(500),
  softClose: z.boolean(),
});

const joinerySchema = z.object({
  connectorId: z.string(),
  connectorSpacing: positive(600).min(32),
  systemHoles: z.object({
    enabled: z.boolean(),
    frontOffset: positive(200),
    rearOffset: positive(400).nullable(),
    pitch: positive(128).min(8),
    startMode: z.enum(["balanced", "custom"]),
    customStart: positive(400),
    onlyWhereNeeded: z.boolean(),
  }),
  shelfSupportId: z.string(),
  shelfPinInset: positive(300),
});

const claddingSchema = z.object({
  style: z.enum(["none", "slats", "board", "tongue-groove"]),
  materialId: z.string(),
  faces: z.array(z.enum(["front", "left", "right", "back"])),
  pieceWidth: positive(1200).min(20),
  gap: positive(200),
  direction: z.enum(["horizontal", "vertical"]),
  standoff: positive(100),
  fixing: z.enum(["secret", "face-screwed", "glued"]),
  riseAboveTop: positive(600),
});

const productionSchema = z.object({
  sheetSizeId: z.string(),
  kerf: positive(10),
  sheetTrim: positive(50),
  grainPolicy: z.enum(["respect", "ignore"]),
  banding: z.object({
    carcaseVisibleEdges: z.string(),
    carcaseHiddenEdges: z.string(),
    shelfFront: z.string(),
    shelfOther: z.string(),
  }),
  stockBarLength: positive(12000).min(500),
  barKerf: positive(10),
  labourRate: positive(500),
  minutesPerPanel: positive(180),
  minutesPerMember: positive(180),
  minutesPerWeld: positive(180),
});

/**
 * The wardrobe's own sections. A stored unit is this plus its kind; the resolved spec
 * the solver takes is this plus the project-level sections.
 */
const wardrobeBodySchema = z.object({
  carcase: carcaseSchema,
  layout: layoutNodeSchema,
  doors: doorsSchema,
  handles: handlesSchema,
  drawers: drawersSchema,
  joinery: joinerySchema,
  cladding: claddingSchema,
});

const projectHeaderSchema = {
  version: z.number().int().min(1),
  meta: z.object({
    name: z.string().max(120),
    notes: z.string().max(4000),
  }),
  production: productionSchema,
};

export const wardrobeSpecSchema = wardrobeBodySchema.extend(
  projectHeaderSchema,
) as unknown as z.ZodType<WardrobeSpec>;

export const wardrobeUnitSchema = wardrobeBodySchema.extend({
  kind: z.literal("wardrobe"),
});

export const workTableUnitSchema = z.object({
  kind: z.literal("work-table"),
  width: positive(4000).min(300),
  depth: positive(1200).min(300),
  height: positive(1400).min(400),
  top: z.object({
    materialId: z.string(),
    edge: z.enum(["folded-down", "boxed", "square"]),
    edgeReturn: positive(120),
    upstand: positive(600),
    upstandReturn: positive(120),
  }),
  legs: z.object({
    profileId: z.string(),
    inset: positive(400),
    feet: z.enum(["bullet", "castor", "none"]),
    braced: z.boolean(),
  }),
  shelves: z.object({
    count: z.number().int().min(0).max(2),
    materialId: z.string(),
    lowest: positive(1200),
    spacing: positive(900),
    edgeReturn: positive(120),
  }),
  groundWelds: z.boolean(),
  cladding: claddingSchema,
});

export const counterUnitSchema = z.object({
  kind: z.literal("counter"),
  width: positive(6000).min(400),
  depth: positive(1500).min(300),
  height: positive(1500).min(500),
  frame: z.object({
    profileId: z.string(),
    inset: positive(600),
    feet: z.enum(["bullet", "castor", "none"]),
    braced: z.boolean(),
    bottomRail: positive(900),
  }),
  top: z.object({
    kind: z.enum(["panel", "inox"]),
    materialId: z.string(),
    bandingId: z.string(),
    frontOverhang: positive(600),
    endOverhang: positive(400),
    backOverhang: positive(400),
  }),
  bar: z.object({
    height: positive(1800),
    depth: positive(900),
    materialId: z.string(),
  }),
  drawerBank: z.object({
    enabled: z.boolean(),
    fromLeft: positive(6000),
    width: positive(1500),
    count: z.number().int().min(1).max(8),
    carcaseMaterialId: z.string(),
    frontMaterialId: z.string(),
    handleId: z.string(),
    slideId: z.string(),
  }),
  shelves: z.object({
    count: z.number().int().min(0).max(4),
    materialId: z.string(),
    lowest: positive(1400),
    spacing: positive(900),
    setback: positive(600),
  }),
  groundWelds: z.boolean(),
  cladding: claddingSchema,
});

/**
 * A discriminated union, so that adding a unit kind is an additive change: an older file
 * never contains a kind this build does not know, and a newer one fails loudly on the
 * discriminator rather than quietly validating as the wrong thing.
 */
export const unitSpecSchema = z.discriminatedUnion("kind", [
  wardrobeUnitSchema,
  workTableUnitSchema,
  counterUnitSchema,
]);

const openingSchema = z.object({
  id: z.string().min(1),
  wall: z.enum(["back", "front", "left", "right"]),
  x: z.number().finite().min(-20000).max(20000),
  sill: positive(10000),
  width: positive(20000).min(10),
  height: positive(10000).min(10),
});

const roomSchema = z.object({
  width: positive(30000).min(500),
  depth: positive(30000).min(500),
  height: positive(10000).min(500),
  wallThickness: positive(1000),
  roof: z.object({
    kind: z.enum(["flat", "shed", "gable"]),
    pitch: z.number().min(0).max(60),
    slopeAxis: z.enum(["x", "z"]),
    flip: z.boolean(),
    overhang: positive(2000),
    thickness: positive(600),
  }),
  openings: z.array(openingSchema).max(40),
});

const unitPlacementSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(120),
  at: z.object({
    x: z.number().finite().min(-30000).max(30000),
    z: z.number().finite().min(-30000).max(30000),
    yaw: z.number().finite().min(-360).max(360),
  }),
  unit: unitSpecSchema,
});

export const projectSpecSchema = z.object({
  ...projectHeaderSchema,
  room: roomSchema,
  units: z.array(unitPlacementSchema).min(1).max(60),
}) as unknown as z.ZodType<ProjectSpec>;

export type ParseResult<T> =
  | { readonly ok: true; readonly spec: T }
  | { readonly ok: false; readonly issues: readonly string[] };

export type SpecParseResult = ParseResult<WardrobeSpec>;

function parse<T>(schema: z.ZodType<T>, value: unknown): ParseResult<T> {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, spec: result.data };
  return {
    ok: false,
    issues: result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    ),
  };
}

/** Validates one resolved wardrobe. Used by the solver's tests and by the unit editor. */
export function validateSpec(value: unknown): SpecParseResult {
  return parse(wardrobeSpecSchema, value);
}

/** Validates a whole project document, which is what gets saved and shared. */
export function validateProject(value: unknown): ParseResult<ProjectSpec> {
  return parse(projectSpecSchema, value);
}
