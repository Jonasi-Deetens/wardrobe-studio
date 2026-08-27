import { z } from "zod";
import type { LayoutChild, LayoutNode, WardrobeSpec } from "./types";

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
  labourRate: positive(500),
  minutesPerPanel: positive(180),
});

export const wardrobeSpecSchema = z.object({
  version: z.number().int().min(1),
  meta: z.object({
    name: z.string().max(120),
    notes: z.string().max(4000),
  }),
  carcase: carcaseSchema,
  layout: layoutNodeSchema,
  doors: doorsSchema,
  handles: handlesSchema,
  drawers: drawersSchema,
  joinery: joinerySchema,
  production: productionSchema,
}) as z.ZodType<WardrobeSpec>;

export type SpecParseResult =
  | { readonly ok: true; readonly spec: WardrobeSpec }
  | { readonly ok: false; readonly issues: readonly string[] };

export function validateSpec(value: unknown): SpecParseResult {
  const result = wardrobeSpecSchema.safeParse(value);
  if (result.success) return { ok: true, spec: result.data };
  return {
    ok: false,
    issues: result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    ),
  };
}
