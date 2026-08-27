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
import { CARCASE_CONSTRUCTION_LABELS, type WardrobeSpec } from "@/engine/spec/types";
import type { SelectOption } from "../ui";
import type { Path } from "../store/paths";

/**
 * Every parameter, as data.
 *
 * The panel renders this table rather than hand-written form markup. That is what keeps
 * the "why" tooltip next to the limits it explains, makes the search box a filter over
 * one array, and means a new parameter is one row rather than a component.
 */

type Base = {
  readonly path: Path;
  readonly label: string;
  /** The construction reason. Shown on the "why" affordance, and searchable. */
  readonly why?: string;
  readonly hint?: string;
  /** Hidden when the answer cannot matter, rather than shown disabled. */
  readonly when?: (spec: WardrobeSpec) => boolean;
  /** Extra search terms, for the words people actually type. */
  readonly keywords?: readonly string[];
};

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

export type TextParam = Base & {
  readonly kind: "text";
  readonly placeholder?: string;
  readonly multiline?: boolean;
};

export type Param = NumberParam | NullableNumberParam | BoolParam | EnumParam | TextParam;

export type ParamGroup = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Rendered by a bespoke component instead of the generic field list. */
  readonly custom?: "layout";
  readonly params: readonly Param[];
};

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
    params: [
      { kind: "text", path: ["meta", "name"], label: "Name", placeholder: "Bedroom wardrobe" },
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
    id: "carcase-size",
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
    label: "Layout",
    description: "Bays, dividers and what goes in each compartment",
    custom: "layout",
    params: [],
  },

  {
    id: "doors",
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
