import {
  CONNECTORS,
  HANDLES,
  HINGES,
  LEVELLING_LEGS,
  SHELF_SUPPORTS,
  SLIDES,
} from "@/engine/catalog/hardware";
import {
  EDGE_BANDINGS,
  MATERIALS,
  SHEET_SIZES,
  materialsFor,
  type MaterialCategory,
} from "@/engine/catalog/materials";
import { PROFILES } from "@/engine/catalog/profiles";
import {
  CARCASE_CONSTRUCTION_LABELS,
  CLADDING_STYLE_LABELS,
  COUNTER_TOP_LABELS,
  type CounterSpec,
  type RoomSpec,
  type UnitKind,
  type WardrobeSpec,
  type WorkTableSpec,
  WORK_TABLE_EDGE_LABELS,
  WORK_TABLE_FEET_LABELS,
} from "@/engine/spec/types";
import type { SelectOption } from "../ui";
import type { Path } from "../store/paths";

/**
 * Every parameter, as data.
 *
 * The panel renders this table rather than hand-written form markup. That is what keeps
 * the "why" tooltip next to the limits it explains, makes the search box a filter over
 * one array, and means a new parameter is one row rather than a component.
 */

/**
 * Whether a parameter belongs to the project or to the unit being edited.
 *
 * The store needs it to know what a path is relative to, and the panel needs it to say so:
 * the kerf is the shop's, and changing it changes every unit in the room, while a carcase
 * width is one wardrobe's business.
 */
export type ParamScope = "project" | "unit";

type Base = {
  readonly path: Path;
  readonly label: string;
  /** The construction reason. Shown on the "why" affordance, and searchable. */
  readonly why?: string;
  readonly hint?: string;
  /** Hidden when the answer cannot matter, rather than shown disabled. */
  readonly when?: (spec: EditableSpec) => boolean;
  /** Extra search terms, for the words people actually type. */
  readonly keywords?: readonly string[];
  /** Defaults to the group's scope. */
  readonly scope?: ParamScope;
  /** Kinds of unit this applies to. Unset means every kind. */
  readonly kinds?: readonly UnitKind[];
};

/** What `when` predicates read: the unit's sections, plus the project's own. */
export type EditableSpec = WardrobeSpec & { readonly room: RoomSpec };

/**
 * A kind-specific view of the spec being edited.
 *
 * Two unit kinds can both have a `top` that means different things, so there is no one
 * static type covering all of them. Reading through these keeps that honest and local:
 * `paramApplies` has already established the unit's kind before a `when` runs, and the
 * fields are optional so a stale read is `undefined` rather than a crash.
 */
const asTable = (spec: EditableSpec): Partial<WorkTableSpec> =>
  spec as unknown as Partial<WorkTableSpec>;

const asCounter = (spec: EditableSpec): Partial<CounterSpec> =>
  spec as unknown as Partial<CounterSpec>;

export type NumberParam = Base & {
  readonly kind: "number";
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly coarseStep?: number;
  readonly unit?: string;
};

export type NullableNumberParam = Base & {
  readonly kind: "nullable-number";
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly unit?: string;
  /** Label for the null state, e.g. "Automatic". */
  readonly emptyLabel: string;
};

export type BoolParam = Base & { readonly kind: "bool" };

export type EnumParam = Base & {
  readonly kind: "enum";
  readonly options: readonly SelectOption[];
};

/**
 * A set of choices rather than one, stored as an array.
 *
 * Which faces of a unit are clad is the only thing in the app shaped like this, and it is
 * genuinely a set: a beach bar is clad on the front and the two ends, and the back is bare
 * because it faces a wall.
 */
export type MultiEnumParam = Base & {
  readonly kind: "multi-enum";
  readonly options: readonly SelectOption[];
};

export type TextParam = Base & {
  readonly kind: "text";
  readonly placeholder?: string;
  readonly multiline?: boolean;
};

export type Param =
  | NumberParam
  | NullableNumberParam
  | BoolParam
  | EnumParam
  | MultiEnumParam
  | TextParam;

export type ParamGroup = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Rendered by a bespoke component instead of the generic field list. */
  readonly custom?: "layout" | "openings" | "placement";
  /** What the group's paths are relative to. Defaults to the unit. */
  readonly scope?: ParamScope;
  /** Kinds of unit the group applies to. Unset means every kind. */
  readonly kinds?: readonly UnitKind[];
  readonly params: readonly Param[];
};

export function scopeOf(group: ParamGroup, param?: Param): ParamScope {
  return param?.scope ?? group.scope ?? "unit";
}

/** Whether a group is worth showing for the unit being edited. */
export function groupApplies(group: ParamGroup, kind: UnitKind): boolean {
  return scopeOf(group) === "project" || !group.kinds || group.kinds.includes(kind);
}

export function paramApplies(group: ParamGroup, param: Param, kind: UnitKind): boolean {
  const kinds = param.kinds ?? group.kinds;
  return scopeOf(group, param) === "project" || !kinds || kinds.includes(kind);
}

/* ------------------------------------------------------------- option lists - */

const materialOptions = (category: MaterialCategory): SelectOption[] =>
  materialsFor(category).map((material) => ({
    value: material.id,
    label: material.name,
    hint: `${material.thickness}mm · safe shelf span ${material.safeShelfSpan}mm`,
  }));

const allMaterialOptions = (): SelectOption[] =>
  MATERIALS.map((material) => ({
    value: material.id,
    label: material.name,
    hint: `${material.thickness}mm`,
  }));

const bandingOptions: SelectOption[] = EDGE_BANDINGS.map((banding) => ({
  value: banding.id,
  label: banding.name,
  hint: `${banding.thickness}mm · ${banding.pricePerMetre.toFixed(2)}/m`,
}));

const hingeOptions: SelectOption[] = HINGES.map((hinge) => ({
  value: hinge.id,
  label: hinge.name,
  hint: hinge.notes,
}));

const slideOptions: SelectOption[] = SLIDES.map((slide) => ({
  value: slide.id,
  label: slide.name,
  hint: slide.notes,
}));

const handleOptions: SelectOption[] = HANDLES.map((handle) => ({
  value: handle.id,
  label: handle.name,
  hint: handle.notes,
}));

const connectorOptions: SelectOption[] = CONNECTORS.map((connector) => ({
  value: connector.id,
  label: connector.name,
  hint: connector.notes,
}));

const shelfSupportOptions: SelectOption[] = SHELF_SUPPORTS.map((support) => ({
  value: support.id,
  label: support.name,
}));

const legOptions: SelectOption[] = LEVELLING_LEGS.map((leg) => ({
  value: leg.id,
  label: leg.name,
}));

/**
 * Leg sections a table can stand on.
 *
 * Deliberately not the whole profile catalogue: a table leg is 40x40 or 50x50 square, or
 * 38.1 or 42.4 round, in mild steel or stainless, because those are the sizes the feet and
 * the fittings are made for. Offering 20x20 would only let somebody build a table that
 * wobbles.
 */
const legProfileOptions: SelectOption[] = PROFILES.filter((profile) =>
  ["shs-40x40x2", "shs-40x40x3", "shs-50x50x2", "tube-38.1x1.5", "tube-42.4x2"].some(
    (key) => profile.id === key || profile.id === `${key}-ss`,
  ),
).map((profile) => ({
  value: profile.id,
  label: profile.name,
  hint: `${profile.massPerMetre} kg/m · ${profile.pricePerMetre.toFixed(2)}/m`,
}));

/**
 * Sections a counter frame can be welded from.
 *
 * Wider than the table list because a counter is a taller, more open frame: it can want a
 * 50x50 leg at bar height, and a rectangular section laid flat makes a front rail that is
 * stiff where it matters without eating knee room.
 */
const frameProfileOptions: SelectOption[] = PROFILES.filter((profile) =>
  [
    "shs-30x30x2",
    "shs-40x40x2",
    "shs-40x40x3",
    "shs-50x50x2",
    "shs-50x50x3",
    "rhs-50x30x2",
    "rhs-60x40x2",
  ].some((key) => profile.id === key || profile.id === `${key}-ss`),
).map((profile) => ({
  value: profile.id,
  label: profile.name,
  hint: `${profile.massPerMetre} kg/m · ${profile.pricePerMetre.toFixed(2)}/m`,
}));

const enumOptions = <T extends string>(labels: Record<T, string>): SelectOption[] =>
  (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));

const claddingStyleOptions: SelectOption[] = [
  { value: "none", label: CLADDING_STYLE_LABELS.none, hint: "The unit as built, unclad" },
  {
    value: "slats",
    label: CLADDING_STYLE_LABELS.slats,
    hint: "Boards with a gap between them",
  },
  {
    value: "board",
    label: CLADDING_STYLE_LABELS.board,
    hint: "Boards butted tight, no gap",
  },
  {
    value: "tongue-groove",
    label: CLADDING_STYLE_LABELS["tongue-groove"],
    hint: "Interlocking, so nothing shows through",
  },
];

const claddingFaceOptions: SelectOption[] = [
  { value: "front", label: "Front" },
  { value: "left", label: "Left end" },
  { value: "right", label: "Right end" },
  { value: "back", label: "Back" },
];

const sheetOptions: SelectOption[] = SHEET_SIZES.map((sheet) => ({
  value: sheet.id,
  label: sheet.name,
  hint: `${sheet.length} × ${sheet.width}`,
}));

const constructionOptions: SelectOption[] = (
  Object.entries(CARCASE_CONSTRUCTION_LABELS) as [keyof typeof CARCASE_CONSTRUCTION_LABELS, string][]
).map(([value, label]) => ({
  value,
  label,
  hint:
    value === "sides-through"
      ? "Strongest: load runs down the sides in shear"
      : value === "top-over-sides"
        ? "Continuous top surface, but fittings carry the load"
        : "Face-frame style; horizontals push on fastener heads",
}));

/* ------------------------------------------------------------------- groups - */

export const PARAM_GROUPS: readonly ParamGroup[] = [
  {
    id: "project",
    label: "Project",
    description: "What this build is called",
    scope: "project",
    params: [
      { kind: "text", path: ["meta", "name"], label: "Name", placeholder: "Beach bar" },
      {
        kind: "text",
        path: ["meta", "notes"],
        label: "Notes",
        placeholder: "Anything the shop should know",
        multiline: true,
      },
    ],
  },

  {
    id: "room",
    label: "Room",
    description: "The space everything stands in — drawn and measured against, never built",
    scope: "project",
    custom: "openings",
    params: [
      {
        kind: "number",
        path: ["room", "width"],
        label: "Room width",
        min: 500,
        max: 30000,
        step: 10,
        coarseStep: 100,
        why: "Clear internal width, wall face to wall face. Units are placed against these faces, so this is the number a run of wardrobes has to fit inside.",
        keywords: ["size"],
      },
      {
        kind: "number",
        path: ["room", "depth"],
        label: "Room depth",
        min: 500,
        max: 30000,
        step: 10,
        coarseStep: 100,
        why: "Back wall to front wall. Leave 900mm clear in front of anything with a door or a drawer.",
      },
      {
        kind: "number",
        path: ["room", "height"],
        label: "Wall height",
        min: 500,
        max: 10000,
        step: 10,
        coarseStep: 100,
        why: "Height at the eaves. A pitched roof rises above this, so a tall unit under the low side is the case to watch.",
        keywords: ["ceiling", "eaves"],
      },
      {
        kind: "number",
        path: ["room", "wallThickness"],
        label: "Wall thickness",
        min: 10,
        max: 1000,
        step: 10,
        why: "Only affects how the walls are drawn — the room's dimensions are the clear inside face, which is what a unit is measured against.",
      },
      {
        kind: "enum",
        path: ["room", "roof", "kind"],
        label: "Roof",
        options: [
          { value: "flat", label: "Flat", hint: "Level ceiling throughout" },
          { value: "shed", label: "Shed", hint: "Single slope, one high wall" },
          { value: "gable", label: "Gable", hint: "Two slopes to a central ridge" },
        ],
        why: "A pitched roof takes the height away exactly where a tall unit wants to stand, so it is worth modelling before the panels are cut rather than after.",
        keywords: ["pitch", "attic", "loft", "slope"],
      },
      {
        kind: "number",
        path: ["room", "roof", "pitch"],
        label: "Pitch",
        min: 0,
        max: 60,
        step: 1,
        unit: "°",
        when: (spec) => spec.room.roof.kind !== "flat",
        why: "Degrees from horizontal. The rise is the pitch across the run, so a steep pitch over a wide room gets very tall very quickly.",
      },
      {
        kind: "enum",
        path: ["room", "roof", "slopeAxis"],
        label: "Slopes along",
        options: [
          { value: "z", label: "Back to front" },
          { value: "x", label: "Left to right" },
        ],
        when: (spec) => spec.room.roof.kind !== "flat",
        why: "For a gable this is the axis the roof falls along, so the ridge runs across it.",
      },
      {
        kind: "bool",
        path: ["room", "roof", "flip"],
        label: "High end swapped",
        when: (spec) => spec.room.roof.kind === "shed",
        why: "Which end of that axis is the high one. It decides which wall a tall unit can stand against.",
      },
      {
        kind: "number",
        path: ["room", "roof", "overhang"],
        label: "Roof overhang",
        min: 0,
        max: 2000,
        step: 10,
        when: (spec) => spec.room.roof.kind !== "flat",
      },
      {
        kind: "number",
        path: ["room", "roof", "thickness"],
        label: "Roof thickness",
        min: 10,
        max: 600,
        step: 10,
        when: (spec) => spec.room.roof.kind !== "flat",
      },
    ],
  },

  {
    id: "placement",
    label: "Placement",
    description: "Where this unit stands in the room",
    scope: "project",
    custom: "placement",
    params: [],
  },

  {
    id: "table-size",
    kinds: ["work-table"],
    label: "Table",
    description: "Overall size and the folded top",
    params: [
      {
        kind: "number",
        path: ["width"],
        label: "Width",
        min: 400,
        max: 3000,
        step: 10,
        coarseStep: 100,
        why: "A stainless top is folded from sheet, and sheet comes 2000 or 3000 long. Past about 1800 the top has to be made in two pieces with a joint in it, which is a weld on the work surface and best avoided.",
        keywords: ["length", "long"],
      },
      {
        kind: "number",
        path: ["depth"],
        label: "Depth",
        min: 400,
        max: 1200,
        step: 10,
        coarseStep: 50,
        why: "600 and 700 are the two depths the trade builds, because a gastronorm pan is 530 deep: 600 takes one across the bench, 700 leaves room to work in front of it.",
      },
      {
        kind: "number",
        path: ["height"],
        label: "Height to the surface",
        min: 500,
        max: 1200,
        step: 5,
        coarseStep: 50,
        why: "850 to 900 is standing prep height. Go higher and you are working with your shoulders up; go lower and you are bent over it all day. 900 is the usual answer for an adult.",
      },
      {
        kind: "enum",
        path: ["top", "materialId"],
        label: "Top material",
        options: materialOptions("solid"),
        why: "1.5mm 304 is the work-top standard. 1.2mm is fine for a shelf but dents under a chopping board.",
        keywords: ["inox", "stainless", "steel"],
      },
      {
        kind: "enum",
        path: ["top", "edge"],
        label: "Edge",
        options: enumOptions(WORK_TABLE_EDGE_LABELS),
        why: "Turning the edge down is what makes a thin sheet stiff, and it hides the raw edge. A boxed edge folds back under itself as well: stiffer again, and nothing sharp underneath where hands go.",
      },
      {
        kind: "number",
        path: ["top", "edgeReturn"],
        label: "Edge turn-down",
        min: 10,
        max: 100,
        step: 5,
        why: "40mm is standard. It has to clear the top rail of the frame, and it is what gives the top its stiffness — 20mm looks flimsy and drums when you put a pan down.",
        when: (spec) => asTable(spec).top?.edge !== "square",
      },
      {
        kind: "number",
        path: ["top", "upstand"],
        label: "Rear upstand",
        min: 0,
        max: 400,
        step: 10,
        coarseStep: 50,
        why: "Folded from the same sheet, so there is no seam at the back of the surface — which is exactly where everything drains to. 100mm against a wall, 150mm behind a sink or a hob.",
        keywords: ["splashback", "upturn"],
      },
      {
        kind: "number",
        path: ["top", "upstandReturn"],
        label: "Upstand top return",
        min: 0,
        max: 60,
        step: 5,
        why: "The top of the upstand folded back towards the wall, so there is no raw edge at hand height and the wall gets a small flange to seal against.",
        when: (spec) => (asTable(spec).top?.upstand ?? 0) > 0,
      },
    ],
  },

  {
    id: "table-frame",
    kinds: ["work-table"],
    label: "Frame and legs",
    description: "The welded understructure",
    params: [
      {
        kind: "enum",
        path: ["legs", "profileId"],
        label: "Leg section",
        options: legProfileOptions,
        why: "40x40 square section is the commercial standard, and 38.1mm round tube is the other half of the market. The rails are made from the same section, because one length of tube for the whole table is cheaper and nests better in the bar.",
        keywords: ["tube", "shs", "metal", "steel"],
      },
      {
        kind: "number",
        path: ["legs", "inset"],
        label: "Legs set in",
        min: 0,
        max: 300,
        step: 5,
        coarseStep: 25,
        why: "Setting the legs in keeps toes clear of them and lets the top's turned-down edge pass outside the frame. 50mm is enough for both.",
      },
      {
        kind: "enum",
        path: ["legs", "feet"],
        label: "Feet",
        options: enumOptions(WORK_TABLE_FEET_LABELS),
        why: "A kitchen floor is laid to a drain and is never level, so a fixed leg means a table that rocks. Adjustable bullet feet give 30mm to play with; castors make it movable but raise it 75mm, which the leg length allows for.",
        keywords: ["levelling", "castor", "wheel"],
      },
      {
        kind: "bool",
        path: ["legs", "braced"],
        label: "Cross-braced ends",
        why: "A diagonal in each end plane, from the foot of the front leg to the head of the back one. Worth it on a long table or one that gets leaned on; it is what stops the frame folding over sideways.",
      },
      {
        kind: "bool",
        path: ["groundWelds"],
        label: "Grind the welds flush",
        why: "A ground and re-brushed joint is invisible; an as-welded one is not. It costs about as long again as the weld itself, so it is worth it front of house and wasted in a back kitchen.",
        keywords: ["weld", "polish", "finish"],
      },
    ],
  },

  {
    id: "table-shelves",
    kinds: ["work-table"],
    label: "Undershelves",
    description: "Storage under the bench",
    params: [
      {
        kind: "number",
        path: ["shelves", "count"],
        label: "Shelves",
        min: 0,
        max: 2,
        step: 1,
        why: "One undershelf is the norm and two is the maximum that leaves anything usable between them. Each one brings its own ring of rails, which also stiffens the frame.",
      },
      {
        kind: "enum",
        path: ["shelves", "materialId"],
        label: "Shelf material",
        options: materialOptions("solid"),
        when: (spec) => (asTable(spec).shelves?.count ?? 0) > 0,
        why: "1.2mm is enough for a shelf once its edges are turned down. The turn-down is doing the work, not the thickness.",
      },
      {
        kind: "number",
        path: ["shelves", "lowest"],
        label: "Lowest shelf height",
        min: 60,
        max: 900,
        step: 10,
        coarseStep: 50,
        when: (spec) => (asTable(spec).shelves?.count ?? 0) > 0,
        why: "Leave enough under it to get a mop in — 150mm at the very least, 200 if the floor gets hosed. Anything lower and the shelf is what gets cleaned instead of the floor.",
      },
      {
        kind: "number",
        path: ["shelves", "spacing"],
        label: "Between the shelves",
        min: 150,
        max: 700,
        step: 10,
        coarseStep: 50,
        when: (spec) => (asTable(spec).shelves?.count ?? 0) > 1,
      },
      {
        kind: "number",
        path: ["shelves", "edgeReturn"],
        label: "Shelf edge turn-down",
        min: 0,
        max: 80,
        step: 5,
        when: (spec) => (asTable(spec).shelves?.count ?? 0) > 0,
        why: "25mm turned down all round is what stops a thin shelf drumming every time something is set on it, and it means the shelf can be lifted out and washed without a sharp edge to catch on.",
      },
    ],
  },

  {
    id: "counter-size",
    kinds: ["counter"],
    label: "Counter",
    description: "Overall size and the top",
    params: [
      {
        kind: "number",
        path: ["width"],
        label: "Width",
        min: 600,
        max: 4000,
        step: 10,
        coarseStep: 100,
        why: "A counter is as long as the space allows. Past about 2400 the top wants a joint, so plan where it falls: over a leg, not over an opening.",
        keywords: ["length", "long", "run"],
      },
      {
        kind: "number",
        path: ["depth"],
        label: "Depth",
        min: 400,
        max: 1200,
        step: 10,
        coarseStep: 50,
        why: "600 to 700 is a serving counter: deep enough to work on, shallow enough to reach across. Deeper than 800 and the far side cannot be cleaned from the working side.",
      },
      {
        kind: "number",
        path: ["height"],
        label: "Height to the top",
        min: 700,
        max: 1250,
        step: 5,
        coarseStep: 50,
        why: "900 to 950 is a serving counter worked at standing. 1050 to 1100 is a bar people sit at, because that is what a bar stool is made for — anything between the two suits nobody.",
        keywords: ["bar", "worktop"],
      },
      {
        kind: "enum",
        path: ["top", "kind"],
        label: "Top",
        options: enumOptions(COUNTER_TOP_LABELS),
        why: "A board top is warm, cheap and can be oiled or clad to match the front. A folded stainless tray is what goes behind a bar where drinks are poured, because it wipes and it does not swell.",
      },
      {
        kind: "enum",
        path: ["top", "materialId"],
        label: "Top material",
        options: materialOptions("solid"),
        why: "The top is unsupported between the frame rails, so its stiffness is what decides whether it flexes when someone leans on the overhang. 18mm ply is the sensible floor.",
      },
      {
        kind: "enum",
        path: ["top", "bandingId"],
        label: "Top edging",
        options: bandingOptions,
        when: (spec) => asCounter(spec).top?.kind === "panel",
        why: "The top's edge is at hand height on the customer's side, so it is the one edge that is always touched and always seen. 1mm ABS or a solid lipping, not 0.4mm.",
      },
      {
        kind: "number",
        path: ["top", "frontOverhang"],
        label: "Front overhang",
        min: 0,
        max: 400,
        step: 5,
        coarseStep: 25,
        why: "The top standing proud of the front is what gives somewhere to lean and hides the cladding's top edge. 20 to 30mm for a serving counter; 250 to 300 if people are to sit at it with their knees underneath.",
        keywords: ["nose", "lean", "bar"],
      },
      {
        kind: "number",
        path: ["top", "endOverhang"],
        label: "End overhang",
        min: 0,
        max: 200,
        step: 5,
        why: "Matching the front overhang at the ends makes the top read as one slab. Set it to zero where the counter runs into a wall or another unit.",
      },
      {
        kind: "number",
        path: ["top", "backOverhang"],
        label: "Back overhang",
        min: 0,
        max: 300,
        step: 5,
        why: "Usually zero, because the back is against something. Give it a little if the counter is free-standing and both sides are seen.",
      },
    ],
  },

  {
    id: "counter-frame",
    kinds: ["counter"],
    label: "Frame",
    description: "The welded understructure",
    params: [
      {
        kind: "enum",
        path: ["frame", "profileId"],
        label: "Frame section",
        options: frameProfileOptions,
        why: "40x40 is enough for a counter at 950. At bar height, unbraced across the front, go to 50x50 — the frame is a tall rectangle and it racks before it buckles.",
        keywords: ["tube", "shs", "steel"],
      },
      {
        kind: "number",
        path: ["frame", "inset"],
        label: "Frame set in",
        min: 0,
        max: 400,
        step: 5,
        coarseStep: 25,
        why: "Setting the frame back leaves room for the cladding and its battens to pass outside it, and keeps the legs out of sight from the front.",
      },
      {
        kind: "number",
        path: ["frame", "bottomRail"],
        label: "Bottom rail height",
        min: 0,
        max: 600,
        step: 10,
        coarseStep: 50,
        why: "The bottom ring both stiffens the frame and carries the lowest shelf. 150mm keeps it above a mop and out of the way of feet.",
      },
      {
        kind: "enum",
        path: ["frame", "feet"],
        label: "Feet",
        options: enumOptions(WORK_TABLE_FEET_LABELS),
        why: "A counter is heavy and gets pushed. Bullet feet let it be levelled on an uneven floor; castors are for a bar that has to be wheeled out, and the leg length allows for their height.",
      },
      {
        kind: "bool",
        path: ["frame", "braced"],
        label: "Cross-braced ends",
        why: "A diagonal in each end plane. On a counter it matters more than on a table, because the front is deliberately left open for knees and cladding, so the ends are all the racking resistance there is.",
      },
      {
        kind: "bool",
        path: ["groundWelds"],
        label: "Grind the welds flush",
        why: "Only worth it where the frame is seen. A clad counter hides its frame completely, so this is money spent on something nobody will look at.",
      },
    ],
  },

  {
    id: "counter-bar",
    kinds: ["counter"],
    label: "Bar shelf",
    description: "A raised surface over the back",
    params: [
      {
        kind: "number",
        path: ["bar", "height"],
        label: "Bar height",
        min: 0,
        max: 1400,
        step: 10,
        coarseStep: 50,
        why: "A second surface over the back of the counter at 1050 to 1100: it is what people stand and drink at, and it hides the working top behind it. Zero for no bar shelf.",
        keywords: ["gantry", "drink", "beach"],
      },
      {
        kind: "number",
        path: ["bar", "depth"],
        label: "Bar depth",
        min: 100,
        max: 600,
        step: 10,
        when: (spec) => (asCounter(spec).bar?.height ?? 0) > 0,
        why: "250 to 300 takes a glass and an elbow. Deeper and it starts to shadow the working surface underneath it.",
      },
      {
        kind: "enum",
        path: ["bar", "materialId"],
        label: "Bar material",
        options: materialOptions("solid"),
        when: (spec) => (asCounter(spec).bar?.height ?? 0) > 0,
      },
    ],
  },

  {
    id: "counter-drawers",
    kinds: ["counter"],
    label: "Drawer bank",
    description: "A carcase of drawers inside the frame",
    params: [
      {
        kind: "bool",
        path: ["drawerBank", "enabled"],
        label: "Fit a drawer bank",
        why: "The drawers are a small carcase built exactly like a wardrobe's and dropped into the frame, which is how it is done in practice: the metalwork carries the load and the joinery holds the drawers.",
      },
      {
        kind: "number",
        path: ["drawerBank", "fromLeft"],
        label: "From the left end",
        min: 0,
        max: 3000,
        step: 10,
        coarseStep: 50,
        when: (spec) => asCounter(spec).drawerBank?.enabled === true,
        why: "Where the bank sits along the counter. Keep it clear of the legs, and remember which side the person working the counter stands on.",
      },
      {
        kind: "number",
        path: ["drawerBank", "width"],
        label: "Bank width",
        min: 250,
        max: 1200,
        step: 10,
        coarseStep: 50,
        when: (spec) => asCounter(spec).drawerBank?.enabled === true,
        why: "400 to 600 is a comfortable drawer. Wider than about 900 and an undermount runner is at its span limit with anything heavy in it.",
      },
      {
        kind: "number",
        path: ["drawerBank", "count"],
        label: "Drawers",
        min: 1,
        max: 6,
        step: 1,
        when: (spec) => asCounter(spec).drawerBank?.enabled === true,
      },
      {
        kind: "enum",
        path: ["drawerBank", "slideId"],
        label: "Runner",
        options: slideOptions,
        when: (spec) => asCounter(spec).drawerBank?.enabled === true,
      },
      {
        kind: "enum",
        path: ["drawerBank", "carcaseMaterialId"],
        label: "Carcase material",
        options: materialOptions("carcase"),
        when: (spec) => asCounter(spec).drawerBank?.enabled === true,
      },
      {
        kind: "enum",
        path: ["drawerBank", "frontMaterialId"],
        label: "Front material",
        options: materialOptions("front"),
        when: (spec) => asCounter(spec).drawerBank?.enabled === true,
      },
      {
        kind: "enum",
        path: ["drawerBank", "handleId"],
        label: "Handle",
        options: handleOptions,
        when: (spec) => asCounter(spec).drawerBank?.enabled === true,
      },
    ],
  },

  {
    id: "counter-shelves",
    kinds: ["counter"],
    label: "Open shelves",
    description: "Shelves inside the frame",
    params: [
      {
        kind: "number",
        path: ["shelves", "count"],
        label: "Shelves",
        min: 0,
        max: 3,
        step: 1,
        why: "Shelves sit on their own ring of rails, so each one stiffens the frame as well as holding stock. Behind a bar this is where the glasses live.",
      },
      {
        kind: "enum",
        path: ["shelves", "materialId"],
        label: "Shelf material",
        options: materialOptions("solid"),
        when: (spec) => (asCounter(spec).shelves?.count ?? 0) > 0,
      },
      {
        kind: "number",
        path: ["shelves", "lowest"],
        label: "Lowest shelf height",
        min: 60,
        max: 900,
        step: 10,
        coarseStep: 50,
        when: (spec) => (asCounter(spec).shelves?.count ?? 0) > 0,
      },
      {
        kind: "number",
        path: ["shelves", "spacing"],
        label: "Between the shelves",
        min: 150,
        max: 700,
        step: 10,
        coarseStep: 50,
        when: (spec) => (asCounter(spec).shelves?.count ?? 0) > 1,
      },
      {
        kind: "number",
        path: ["shelves", "setback"],
        label: "Set back from the front",
        min: 0,
        max: 300,
        step: 5,
        when: (spec) => (asCounter(spec).shelves?.count ?? 0) > 0,
        why: "Keeping the shelf back from the front face means it cannot be seen past the cladding, and it leaves the front rail clear for a footrail or a kick.",
      },
    ],
  },

  {
    id: "cladding",
    label: "Cladding",
    description: "A skin fixed over the outside of this unit",
    params: [
      {
        kind: "enum",
        path: ["cladding", "style"],
        label: "Style",
        options: claddingStyleOptions,
        why: "Cladding is a separate trade from the carcase: the structure is whatever it needs to be, and the face the customer sees is boards fixed over it. That is how a bar front gets built out of larch without the counter having to be made of larch.",
        keywords: ["beach", "bar", "slats", "decor", "skin"],
      },
      {
        kind: "multi-enum",
        path: ["cladding", "faces"],
        label: "Faces",
        options: claddingFaceOptions,
        when: (spec) => spec.cladding.style !== "none",
        why: "Only clad what is seen. A run against a wall gets its front and its exposed end, and cladding the back of it is money spent on something nobody will look at.",
      },
      {
        kind: "enum",
        path: ["cladding", "materialId"],
        label: "Material",
        options: materialOptions("solid"),
        when: (spec) => spec.cladding.style !== "none",
        why: "Outdoors this is the whole decision: larch and cedar last unfinished, pine has to be treated and will still move.",
      },
      {
        kind: "enum",
        path: ["cladding", "direction"],
        label: "Direction",
        options: [
          { value: "horizontal", label: "Horizontal", hint: "Boards run across the face" },
          { value: "vertical", label: "Vertical", hint: "Boards run up the face" },
        ],
        when: (spec) => spec.cladding.style !== "none",
        why: "Horizontal boards make a unit look longer and shed water off each board; vertical boards look taller and drain down the joint. The battens always run the other way, because that is what the boards fix to.",
      },
      {
        kind: "number",
        path: ["cladding", "pieceWidth"],
        label: "Board width",
        min: 40,
        max: 300,
        step: 5,
        coarseStep: 20,
        when: (spec) => spec.cladding.style !== "none",
        why: "The covering width of one board. Wide softwood boards cup, which is why cladding is sold at 90 to 145mm rather than 300.",
      },
      {
        kind: "number",
        path: ["cladding", "gap"],
        label: "Shadow gap",
        min: 0,
        max: 60,
        step: 1,
        coarseStep: 5,
        when: (spec) => spec.cladding.style === "slats",
        why: "The gap between slats. It reads as a deliberate line, it lets the boards move without buckling, and it means the face does not have to divide evenly into whole boards.",
      },
      {
        kind: "number",
        path: ["cladding", "standoff"],
        label: "Batten depth",
        min: 0,
        max: 45,
        step: 5,
        when: (spec) => spec.cladding.style !== "none",
        why: "Zero fixes the boards straight onto the unit. Anything else adds counter-battens, which is what makes a ventilated cavity — outdoor cladding with no cavity behind it rots from the back. Snapped to a stock batten of 20 or 45mm.",
        keywords: ["batten", "cavity", "ventilation"],
      },
      {
        kind: "enum",
        path: ["cladding", "fixing"],
        label: "Fixing",
        options: [
          { value: "face-screwed", label: "Face screwed", hint: "Stainless screws, visible" },
          { value: "secret", label: "Secret clips", hint: "Nothing shows on the face" },
          { value: "glued", label: "Glued", hint: "No fixings, and no taking it off" },
        ],
        when: (spec) => spec.cladding.style !== "none",
        why: "Face screws in stainless are honest and serviceable; plated screws bleed rust down the boards. Clips hide the fixing and still let each board move. Glue alone means a damaged board cannot be replaced.",
      },
      {
        kind: "number",
        path: ["cladding", "riseAboveTop"],
        label: "Rise above the top",
        min: 0,
        max: 400,
        step: 10,
        when: (spec) => spec.cladding.style !== "none",
        why: "Running the cladding past the top turns the front into a parapet, which is what hides the bar clutter from the customer's side. 100 to 150mm is usually enough.",
        keywords: ["parapet", "bar"],
      },
    ],
  },

  {
    id: "carcase-size",
    kinds: ["wardrobe"],
    label: "Carcase",
    description: "Outer size, material and how the box is joined",
    params: [
      {
        kind: "number",
        path: ["carcase", "width"],
        label: "Width",
        min: 300,
        max: 4000,
        step: 10,
        coarseStep: 100,
        why: "Overall width across the outer faces of the sides. Over about 1200mm per bay you want a divider, both for shelf sag and because a wider door leaf gets awkward.",
        keywords: ["size", "dimension"],
      },
      {
        kind: "number",
        path: ["carcase", "height"],
        label: "Height",
        min: 600,
        max: 3000,
        step: 10,
        coarseStep: 100,
        why: "Floor to the top of the top panel, including the plinth. Sides over 2200mm unsupported need a fixed shelf as a brace.",
      },
      {
        kind: "number",
        path: ["carcase", "depth"],
        label: "Depth",
        min: 250,
        max: 900,
        step: 10,
        coarseStep: 50,
        why: "Rear plane to the front edge of the carcase. Under 550mm internal depth a coat hanger will not turn, so hanging bays need at least 600mm outer depth with a 19mm back.",
        keywords: ["hanger"],
      },
      {
        kind: "enum",
        path: ["carcase", "panelMaterialId"],
        label: "Panel material",
        options: materialOptions("carcase"),
        why: "Carcase board. Thicker board holds a shelf pin better and sags less; 18mm is standard, 22mm buys about 200mm of extra safe shelf span.",
      },
      {
        kind: "enum",
        path: ["carcase", "construction"],
        label: "Construction",
        options: constructionOptions,
        why: "Full-height sides with the top and bottom captured between them puts the vertical load into the side panel in shear rather than into fastener heads. The alternatives are easier to build but weaker.",
        keywords: ["load", "joint", "corner"],
      },
      {
        kind: "bool",
        path: ["carcase", "snapToSystemGrid"],
        label: "Snap to 32mm grid",
        why: "Sizes the internal height and depth as multiples of 32 so hardware indexes cleanly on the system holes. The panel sizes shift by a few millimetres; the app shows the resulting true dimension.",
        keywords: ["system", "32"],
      },
      {
        kind: "bool",
        path: ["carcase", "topStretcher"],
        label: "Top rail",
        why: "A rail across the top rear stops the carcase racking. Worth having when the top is not a full panel or the unit is wide.",
        keywords: ["stretcher", "brace"],
      },
      {
        kind: "enum",
        path: ["carcase", "wallAnchor"],
        label: "Wall anchor",
        options: [
          { value: "sides", label: "Through the sides", hint: "Highest pull-out capacity" },
          { value: "top", label: "Through the top", hint: "Easier, but weaker" },
          { value: "none", label: "None", hint: "Freestanding — a tipping risk if tall" },
        ],
        why: "Fixing through the sides rather than the top gives a measurably higher load capacity and keeps the carcase from leaning. A tall wardrobe with drawers must be anchored.",
      },
    ],
  },

  {
    id: "plinth",
    kinds: ["wardrobe"],
    label: "Plinth",
    description: "What the wardrobe stands on",
    params: [
      {
        kind: "enum",
        path: ["carcase", "plinth", "type"],
        label: "Type",
        options: [
          { value: "none", label: "None", hint: "Bottom panel on the floor" },
          { value: "recessed-rail", label: "Recessed rail", hint: "Set-back kicker, adjustable" },
          { value: "integrated-sides", label: "Sides run to the floor", hint: "Load straight down" },
          { value: "legs", label: "Legs only", hint: "Open under, easy to clean" },
        ],
        why: "A recessed rail lets you level the unit and keeps toes off the front. Sides running to the floor is the strongest, but it exposes the side edges to a wet floor.",
        keywords: ["base", "kicker", "toe"],
      },
      {
        kind: "number",
        path: ["carcase", "plinth", "height"],
        label: "Height",
        min: 0,
        max: 250,
        step: 5,
        when: (spec) => spec.carcase.plinth.type !== "none",
        why: "80 to 150mm is normal. Match the skirting board it sits next to and the wardrobe will look built in.",
      },
      {
        kind: "number",
        path: ["carcase", "plinth", "setback"],
        label: "Setback",
        min: 0,
        max: 120,
        step: 5,
        when: (spec) => spec.carcase.plinth.type === "recessed-rail",
        why: "How far the kicker sits behind the door face. 50mm keeps toes clear without looking undercut.",
      },
      {
        kind: "enum",
        path: ["carcase", "plinth", "legId"],
        label: "Levelling leg",
        options: legOptions,
        when: (spec) =>
          spec.carcase.plinth.type === "legs" || spec.carcase.plinth.type === "recessed-rail",
        why: "Adjustable legs are what make the unit plumb on a floor that is never flat. Everything above only hangs straight if the box is level.",
      },
    ],
  },

  {
    id: "back",
    kinds: ["wardrobe"],
    label: "Back panel",
    description: "What keeps the carcase square",
    params: [
      {
        kind: "enum",
        path: ["carcase", "back", "type"],
        label: "Fixing",
        options: [
          { value: "groove", label: "In a groove", hint: "Strongest and invisible" },
          { value: "rabbet", label: "In a rabbet", hint: "Strong, and lets you scribe" },
          { value: "surface", label: "On the back", hint: "Quickest, weakest" },
          { value: "none", label: "No back", hint: "Only for an open frame" },
        ],
        why: "A housed back roughly doubles the carcase's racking stiffness and is what holds it square permanently. A surface-fixed back leaves the corner joints doing that work alone.",
        keywords: ["square", "racking", "groove"],
      },
      {
        kind: "enum",
        path: ["carcase", "back", "materialId"],
        label: "Material",
        options: materialOptions("back"),
        when: (spec) => spec.carcase.back.type !== "none",
      },
      {
        kind: "number",
        path: ["carcase", "back", "inset"],
        label: "Inset from rear",
        min: 0,
        max: 120,
        step: 1,
        when: (spec) => spec.carcase.back.type !== "none",
        why: "Moving the back forward leaves a service void for skirting, cables or an out-of-plumb wall, at the cost of internal depth.",
        keywords: ["skirting", "void"],
      },
      {
        kind: "number",
        path: ["carcase", "back", "housingDepth"],
        label: "Housing depth",
        min: 4,
        max: 15,
        step: 0.5,
        when: (spec) =>
          spec.carcase.back.type === "groove" || spec.carcase.back.type === "rabbet",
        why: "Depth of the groove or rabbet. Around half the panel thickness holds well without weakening the side.",
      },
    ],
  },

  {
    id: "fit",
    kinds: ["wardrobe"],
    label: "Fit to the room",
    description: "Overhang and scribe allowances",
    params: [
      {
        kind: "number",
        path: ["carcase", "topOverhang", "left"],
        label: "Top overhang left",
        min: 0,
        max: 100,
        step: 1,
        why: "An overhanging top reads as a lid rather than a box. It also hides the joint line between the top and the side.",
      },
      {
        kind: "number",
        path: ["carcase", "topOverhang", "right"],
        label: "Top overhang right",
        min: 0,
        max: 100,
        step: 1,
      },
      {
        kind: "number",
        path: ["carcase", "topOverhang", "front"],
        label: "Top overhang front",
        min: 0,
        max: 100,
        step: 1,
      },
      {
        kind: "number",
        path: ["carcase", "scribe", "left"],
        label: "Scribe left",
        min: 0,
        max: 60,
        step: 1,
        why: "Extra material left on to plane back to an out-of-square wall. Without it a 5mm bow in the plaster shows as a 5mm gap.",
        keywords: ["wall", "filler"],
      },
      { kind: "number", path: ["carcase", "scribe", "right"], label: "Scribe right", min: 0, max: 60, step: 1 },
      {
        kind: "number",
        path: ["carcase", "scribe", "top"],
        label: "Scribe top",
        min: 0,
        max: 60,
        step: 1,
        why: "Ceilings are rarely level. A scribe strip at the top is far easier than trimming the carcase on site.",
      },
    ],
  },

  {
    id: "layout",
    kinds: ["wardrobe"],
    label: "Layout",
    description: "Bays, dividers and what goes in each compartment",
    custom: "layout",
    params: [],
  },

  {
    id: "doors",
    kinds: ["wardrobe"],
    label: "Doors",
    description: "Leaves, overlay and hinges",
    params: [
      {
        kind: "enum",
        path: ["doors", "type"],
        label: "Doors",
        options: [
          { value: "hinged", label: "Hinged" },
          { value: "none", label: "Open front" },
        ],
      },
      {
        kind: "enum",
        path: ["doors", "overlayStyle"],
        label: "Overlay",
        options: [
          { value: "full", label: "Full overlay", hint: "Covers the side edge" },
          { value: "half", label: "Half overlay", hint: "Two leaves share a divider" },
          { value: "inset", label: "Inset", hint: "Flush with the carcase front" },
        ],
        when: (spec) => spec.doors.type !== "none",
        why: "Overlay is the distance the leaf covers the carcase edge, and it follows from the hinge: overlay = fixed distance + boring distance − plate height. Full overlay hides the carcase entirely; inset needs the carcase to be dead square.",
        keywords: ["hinge", "reveal"],
      },
      {
        kind: "enum",
        path: ["doors", "leafMode"],
        label: "Leaf count",
        options: [
          { value: "per-bay", label: "One per bay", hint: "Leaves line up with the dividers" },
          { value: "count", label: "Fixed number", hint: "Spread evenly across the front" },
        ],
        when: (spec) => spec.doors.type !== "none",
        why: "One leaf per bay puts every door edge over a panel, which is where a hinge can be screwed. A fixed count can leave a leaf edge floating in mid-air with nothing to hinge to.",
      },
      {
        kind: "number",
        path: ["doors", "leafCount"],
        label: "Leaves",
        min: 1,
        max: 8,
        step: 1,
        unit: "",
        when: (spec) => spec.doors.type !== "none" && spec.doors.leafMode === "count",
        why: "Keep each leaf under about 600mm wide. Wider than that and the leaf is heavy on its hinges and awkward in a bedroom.",
      },
      {
        kind: "enum",
        path: ["doors", "materialId"],
        label: "Door material",
        options: allMaterialOptions(),
        when: (spec) => spec.doors.type !== "none",
      },
      {
        kind: "enum",
        path: ["doors", "bandingId"],
        label: "Door banding",
        options: bandingOptions,
        when: (spec) => spec.doors.type !== "none",
        why: "All four edges of a door are visible and get handled, so this is the one place a thicker 2mm band is worth the cost.",
      },
      {
        kind: "number",
        path: ["doors", "gap"],
        label: "Gap between leaves",
        min: 1,
        max: 10,
        step: 0.5,
        when: (spec) => spec.doors.type !== "none",
        why: "3mm is the usual shadow gap. Less than 2mm and the leaves touch as soon as the carcase moves a hair.",
        keywords: ["reveal", "shadow"],
      },
      {
        kind: "number",
        path: ["doors", "revealTop"],
        label: "Reveal at top",
        min: 0,
        max: 30,
        step: 0.5,
        when: (spec) => spec.doors.type !== "none",
      },
      {
        kind: "number",
        path: ["doors", "revealBottom"],
        label: "Reveal at bottom",
        min: 0,
        max: 30,
        step: 0.5,
        when: (spec) => spec.doors.type !== "none",
      },
      {
        kind: "enum",
        path: ["doors", "hingeId"],
        label: "Hinge",
        options: hingeOptions,
        when: (spec) => spec.doors.type !== "none",
        why: "Series sets the cup geometry, the opening angle and the load rating. A wide-angle hinge is worth it where a drawer has to clear the open leaf.",
      },
      {
        kind: "number",
        path: ["doors", "boringDistance"],
        label: "Boring distance",
        min: 3,
        max: 7,
        step: 0.5,
        when: (spec) => spec.doors.type !== "none",
        why: "Distance from the leaf edge to the near side of the Ø35 cup. 4.5mm is the default; less than 3mm risks blowing out the edge, more than 7mm and the hinge runs out of adjustment.",
        keywords: ["cup", "35"],
      },
      {
        kind: "number",
        path: ["doors", "plateHeight"],
        label: "Plate height",
        min: 0,
        max: 12,
        step: 1,
        when: (spec) => spec.doors.type !== "none",
        why: "Mounting plate height reduces the overlay one-for-one. It is how you fit a half-overlay leaf with a full-overlay hinge.",
      },
      {
        kind: "number",
        path: ["doors", "hingeEndInset"],
        label: "End hinge inset",
        min: 40,
        max: 200,
        step: 1,
        when: (spec) => spec.doors.type !== "none",
        why: "Distance from the leaf top and bottom to the outer hinge centres. Around 100mm keeps the hinge clear of the horizontal panel behind it and still holds the leaf flat.",
      },
      {
        kind: "nullable-number",
        path: ["doors", "hingeCountOverride"],
        label: "Hinges per leaf",
        min: 2,
        max: 7,
        step: 1,
        unit: "",
        emptyLabel: "From height",
        when: (spec) => spec.doors.type !== "none",
        why: "Derived from the leaf height: 2 up to 900mm, 3 to 1600, 4 to 2000, 5 to 2400. Add one if the leaf is heavy — solid or glass — rather than trusting the band.",
      },
      {
        kind: "enum",
        path: ["doors", "hingeSideRule"],
        label: "Hinge side",
        options: [
          { value: "alternate", label: "Alternate", hint: "Left, right, left…" },
          { value: "pairs", label: "In pairs", hint: "Leaves open away from each other" },
          { value: "all-left", label: "All on the left" },
          { value: "all-right", label: "All on the right" },
        ],
        when: (spec) => spec.doors.type !== "none",
        why: "Doors should open away from where you stand and away from each other. Pairs suit a wide unit; alternate suits a run of narrow leaves.",
      },
    ],
  },

  {
    id: "handles",
    kinds: ["wardrobe"],
    label: "Handles",
    description: "What you actually touch",
    params: [
      {
        kind: "enum",
        path: ["handles", "doorHandleId"],
        label: "Door handle",
        options: handleOptions,
        when: (spec) => spec.doors.type !== "none",
        why: "A push latch gives a handleless front but needs the leaf to spring clear, so it wants a slightly larger gap. An integrated groove is milled, so it has to be decided before the fronts are cut.",
      },
      {
        kind: "enum",
        path: ["handles", "doorOrientation"],
        label: "Orientation",
        options: [
          { value: "vertical", label: "Vertical" },
          { value: "horizontal", label: "Horizontal" },
        ],
        when: (spec) => spec.doors.type !== "none",
      },
      {
        kind: "enum",
        path: ["handles", "doorPlacement"],
        label: "Height",
        options: [
          { value: "centre", label: "Centre of the leaf" },
          { value: "top", label: "Upper third" },
          { value: "bottom", label: "Lower third" },
          { value: "custom", label: "Set a height" },
        ],
        when: (spec) => spec.doors.type !== "none",
        why: "On a full-height leaf a handle at the centre is a long reach for a child and a stoop for an adult. Around 1000 to 1100mm from the floor suits most people.",
      },
      {
        kind: "number",
        path: ["handles", "doorCustomHeight"],
        label: "Handle height",
        min: 100,
        max: 2400,
        step: 10,
        when: (spec) => spec.doors.type !== "none" && spec.handles.doorPlacement === "custom",
      },
      {
        kind: "number",
        path: ["handles", "doorEdgeOffset"],
        label: "Offset from edge",
        min: 15,
        max: 120,
        step: 1,
        when: (spec) => spec.doors.type !== "none",
        why: "Distance from the handle centre to the opening edge of the leaf. Too close and your knuckles hit the neighbouring door.",
      },
      {
        kind: "enum",
        path: ["handles", "drawerHandleId"],
        label: "Drawer handle",
        options: handleOptions,
      },
      {
        kind: "enum",
        path: ["handles", "drawerOrientation"],
        label: "Drawer orientation",
        options: [
          { value: "horizontal", label: "Horizontal" },
          { value: "vertical", label: "Vertical" },
        ],
      },
      {
        kind: "enum",
        path: ["handles", "drawerPlacement"],
        label: "Drawer position",
        options: [
          { value: "centre", label: "Centre of the front" },
          { value: "top", label: "Upper third" },
          { value: "bottom", label: "Lower third" },
          { value: "custom", label: "Set a height" },
        ],
      },
      {
        kind: "number",
        path: ["handles", "drawerCustomHeight"],
        label: "Height above front bottom",
        min: 10,
        max: 400,
        step: 5,
        when: (spec) => spec.handles.drawerPlacement === "custom",
      },
    ],
  },

  {
    id: "drawers",
    kinds: ["wardrobe"],
    label: "Drawers",
    description: "Runners, boxes and fronts",
    params: [
      {
        kind: "enum",
        path: ["drawers", "slideId"],
        label: "Runner",
        options: slideOptions,
        why: "Undermount runners are invisible and give the full box width, but the box has to be built to their tolerance: inside width is the opening less 49mm for 19mm sides. Side-mount runners are more forgiving.",
        keywords: ["slide", "undermount"],
      },
      {
        kind: "bool",
        path: ["drawers", "softClose"],
        label: "Soft close",
        why: "Soft close costs a little travel at the back of the drawer, so a shallow drawer feels it more than a deep one.",
      },
      {
        kind: "number",
        path: ["drawers", "boxHeight"],
        label: "Box side height",
        min: 60,
        max: 300,
        step: 5,
        why: "The box side, not the front. Keep it low enough that the front covers it and the drawer still takes what you meant it to.",
      },
      {
        kind: "enum",
        path: ["drawers", "boxMaterialId"],
        label: "Box material",
        options: allMaterialOptions(),
      },
      {
        kind: "enum",
        path: ["drawers", "bottomMaterialId"],
        label: "Bottom material",
        options: materialOptions("back"),
        why: "A drawer bottom in a groove is what stops the box racking. Thin ply is fine for socks; use 8mm or thicker for anything heavy.",
      },
      {
        kind: "number",
        path: ["drawers", "bottomGrooveDepth"],
        label: "Bottom groove depth",
        min: 3,
        max: 12,
        step: 0.5,
      },
      {
        kind: "number",
        path: ["drawers", "bottomGrooveOffset"],
        label: "Groove above box bottom",
        min: 0,
        max: 40,
        step: 0.5,
        why: "Lifting the bottom off the lower edge leaves room for the runner to pass under it.",
      },
      {
        kind: "enum",
        path: ["drawers", "frontMaterialId"],
        label: "Front material",
        options: allMaterialOptions(),
      },
      {
        kind: "enum",
        path: ["drawers", "frontBandingId"],
        label: "Front banding",
        options: bandingOptions,
      },
    ],
  },

  {
    id: "joinery",
    kinds: ["wardrobe"],
    label: "Joinery",
    description: "Corner joints, system holes and shelf pins",
    params: [
      {
        kind: "enum",
        path: ["joinery", "connectorId"],
        label: "Corner joint",
        options: connectorOptions,
        why: "Dowels are the strongest and invisible but need clamping and are not demountable. Confirmat is fast and strong but shows. Cam fittings and Cabineo come apart again, which matters if the wardrobe has to leave through a doorway.",
        keywords: ["dowel", "confirmat", "cam", "lamello"],
      },
      {
        kind: "number",
        path: ["joinery", "connectorSpacing"],
        label: "Connector spacing",
        min: 100,
        max: 500,
        step: 10,
        why: "Nominal spacing along a joint. Around 250mm is plenty for a carcase; closer than 150mm buys nothing but drilling time.",
      },
      {
        kind: "bool",
        path: ["joinery", "systemHoles", "enabled"],
        label: "System hole rows",
        why: "Ø5 holes at 32mm pitch down the sides. They cost a line-boring pass and give you shelves, runners and hinge plates that all index off the same grid for the life of the wardrobe.",
        keywords: ["32mm", "line boring"],
      },
      {
        kind: "number",
        path: ["joinery", "systemHoles", "pitch"],
        label: "Pitch",
        min: 16,
        max: 64,
        step: 16,
        when: (spec) => spec.joinery.systemHoles.enabled,
        why: "32mm is the industry standard, and every piece of ready-made hardware assumes it. Change it only if you are making your own fittings too.",
      },
      {
        kind: "number",
        path: ["joinery", "systemHoles", "frontOffset"],
        label: "Front row offset",
        min: 20,
        max: 60,
        step: 1,
        when: (spec) => spec.joinery.systemHoles.enabled,
        why: "37mm from the front edge to the row centre is the standard, and hinge plates and runner brackets are made to it. Sealing lips and applied edges count toward that 37mm.",
      },
      {
        kind: "nullable-number",
        path: ["joinery", "systemHoles", "rearOffset"],
        label: "Rear row offset",
        min: 20,
        max: 120,
        step: 1,
        emptyLabel: "No rear row",
        when: (spec) => spec.joinery.systemHoles.enabled,
        why: "A second row near the back carries the rear shelf pins. 37mm from the back keeps it symmetric with the front row so a shelf sits level.",
      },
      {
        kind: "enum",
        path: ["joinery", "systemHoles", "startMode"],
        label: "Row start",
        options: [
          { value: "balanced", label: "Balanced", hint: "Equal margin top and bottom" },
          { value: "custom", label: "From a set height" },
        ],
        when: (spec) => spec.joinery.systemHoles.enabled,
        why: "A balanced start leaves the same margin at both ends, so the row looks deliberate and a shelf can sit at the same height in a mirrored carcase.",
      },
      {
        kind: "number",
        path: ["joinery", "systemHoles", "customStart"],
        label: "First hole height",
        min: 0,
        max: 400,
        step: 1,
        when: (spec) =>
          spec.joinery.systemHoles.enabled && spec.joinery.systemHoles.startMode === "custom",
      },
      {
        kind: "bool",
        path: ["joinery", "systemHoles", "onlyWhereNeeded"],
        label: "Only where needed",
        when: (spec) => spec.joinery.systemHoles.enabled,
        why: "Leaves the rows out of bays that have nothing adjustable in them. Saves drilling, but you lose the option to change your mind later.",
      },
      {
        kind: "enum",
        path: ["joinery", "shelfSupportId"],
        label: "Shelf support",
        options: shelfSupportOptions,
        why: "A plain pin is fine for a light shelf. A support with a lip or a screw-in socket stops a loaded shelf walking forward off its pins.",
      },
      {
        kind: "number",
        path: ["joinery", "shelfPinInset"],
        label: "Pin inset",
        min: 20,
        max: 120,
        step: 1,
        why: "Distance from the shelf front and back edges to the outer pins. Too close to the front and the shelf tips when you load the front edge.",
      },
    ],
  },

  {
    id: "production",
    scope: "project",
    label: "Material and production",
    description: "Sheets, kerf, banding and cost",
    params: [
      {
        kind: "enum",
        path: ["production", "sheetSizeId"],
        label: "Sheet size",
        options: sheetOptions,
        why: "Nesting is done against this sheet. A part longer than the sheet is reported rather than silently split.",
      },
      {
        kind: "number",
        path: ["production", "kerf"],
        label: "Saw kerf",
        min: 0,
        max: 8,
        step: 0.1,
        why: "Blade thickness, added at every cut in the nesting layout. Ignoring it is how a layout that looks fine on screen comes up 3mm short on the last part of the row.",
        keywords: ["blade", "saw"],
      },
      {
        kind: "number",
        path: ["production", "sheetTrim"],
        label: "Sheet trim",
        min: 0,
        max: 30,
        step: 1,
        why: "Damaged and out-of-square sheet edges taken off before nesting. 10mm all round is normal.",
      },
      {
        kind: "enum",
        path: ["production", "grainPolicy"],
        label: "Grain",
        options: [
          { value: "respect", label: "Respect grain", hint: "No 90° rotation on grained parts" },
          { value: "ignore", label: "Ignore grain", hint: "Tighter nesting, mismatched panels" },
        ],
        why: "On a woodgrain board, rotating a part 90° to save material makes the mismatch obvious on any visible face. The nester will not rotate grained parts unless you allow it.",
      },
      {
        kind: "enum",
        path: ["production", "banding", "carcaseVisibleEdges"],
        label: "Banding, visible edges",
        options: bandingOptions,
        why: "Front edges of the carcase are seen and touched, so they get the good band.",
      },
      {
        kind: "enum",
        path: ["production", "banding", "carcaseHiddenEdges"],
        label: "Banding, hidden edges",
        options: bandingOptions,
        why: "Edges against a wall still want sealing against moisture, but a thin cheap band is enough.",
      },
      {
        kind: "enum",
        path: ["production", "banding", "shelfFront"],
        label: "Banding, shelf fronts",
        options: bandingOptions,
        why: "A 2mm band on a shelf front takes knocks without chipping, and stiffens a long shelf slightly.",
      },
      {
        kind: "enum",
        path: ["production", "banding", "shelfOther"],
        label: "Banding, shelf sides",
        options: bandingOptions,
      },
      {
        kind: "number",
        path: ["production", "labourRate"],
        label: "Labour rate",
        min: 0,
        max: 500,
        step: 5,
        unit: "/h",
      },
      {
        kind: "number",
        path: ["production", "minutesPerPanel"],
        label: "Minutes per panel",
        min: 0,
        max: 120,
        step: 1,
        unit: "min",
        why: "Cutting, banding and drilling one panel. Used only for the estimate.",
      },
      {
        kind: "number",
        path: ["production", "stockBarLength"],
        label: "Stock bar length",
        min: 1000,
        max: 12000,
        step: 100,
        why: "Length tube is bought in. 6000mm is the trade standard, and it is what the tube schedule nests cut lengths into.",
        keywords: ["metal", "tube", "steel", "bar"],
      },
      {
        kind: "number",
        path: ["production", "barKerf"],
        label: "Metal saw kerf",
        min: 0,
        max: 10,
        step: 0.5,
        why: "Taken off at every cut in a bar. A cold saw blade is about 2mm, an abrasive chop saw closer to 3.",
        keywords: ["metal", "tube"],
      },
      {
        kind: "number",
        path: ["production", "minutesPerMember"],
        label: "Minutes per tube",
        min: 0,
        max: 120,
        step: 1,
        unit: "min",
        keywords: ["metal", "cut"],
      },
      {
        kind: "number",
        path: ["production", "minutesPerWeld"],
        label: "Minutes per weld",
        min: 0,
        max: 120,
        step: 1,
        unit: "min",
        why: "Tacking, welding out and grinding one joint. A ground-flush joint on stainless is a good deal slower than a fillet nobody will see.",
        keywords: ["metal", "weld"],
      },
    ],
  },
];

/** Flat list, for the search index. */
export const ALL_PARAMS: readonly { group: ParamGroup; param: Param }[] = PARAM_GROUPS.flatMap(
  (group) => group.params.map((param) => ({ group, param })),
);

export function matchesSearch(param: Param, group: ParamGroup, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    param.label,
    group.label,
    param.why ?? "",
    param.hint ?? "",
    ...(param.keywords ?? []),
    param.path.join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}
