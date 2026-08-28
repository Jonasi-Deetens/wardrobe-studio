import {
  createDefaultCounter,
  createDefaultProject,
  createDefaultRoom,
  createDefaultSpec,
  createDefaultWorkTable,
  DEFAULT_FITTINGS,
  makeBay,
  makeSplit,
  placeUnit,
  resetNodeIds,
  resetUnitIds,
  unitOfWardrobe,
} from "./defaults";
import type { ProjectSpec, RoomSpec, UnitSpec, WardrobeSpec } from "./types";

/**
 * A unit template. Choosing one adds a unit to the room, or replaces the selected
 * unit's parameters, so it produces a unit rather than a whole document.
 */
export type Preset = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: UnitSpec["kind"];
  readonly build: () => WardrobeSpec;
};

/** A whole document: a room, and the units standing in it. */
export type ProjectPreset = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly build: () => ProjectSpec;
};

/**
 * Starting points rather than finished designs. Each one is a real arrangement a
 * cabinetmaker would recognise, so the numbers are worth copying even if the
 * layout gets rearranged afterwards.
 */
const WARDROBE_PRESETS: readonly Omit<Preset, "kind">[] = [
  {
    id: "double-hang-drawers",
    name: "Double hang with a drawer bank",
    description:
      "1800 x 2200 x 620. Shirts over trousers on the left, shelves over three drawers on the right. Three leaves.",
    build: () => createDefaultSpec(),
  },
  {
    id: "long-hang-simple",
    name: "Single long hang",
    description:
      "1200 x 2100 x 620. One full-height hanging bay with a top shelf. The simplest useful wardrobe.",
    build: () => {
      const base = createDefaultSpec();
      resetNodeIds();
      return {
        ...base,
        meta: { ...base.meta, name: "Single long hang" },
        carcase: { ...base.carcase, width: 1200, height: 2100 },
        layout: makeBay(
          { ...DEFAULT_FITTINGS.hanging, clearHeight: 1700, shelfAbove: true, shelvesAbove: 1 },
          "Long hang",
        ),
        doors: { ...base.doors, leafMode: "count", leafCount: 2 },
      };
    },
  },
  {
    id: "shirts-over-trousers",
    name: "Double hang, both bays",
    description:
      "1600 x 2200 x 620. Two bays of short hanging at 950mm clear each, which fits twice as many garments as a long hang.",
    build: () => {
      const base = createDefaultSpec();
      resetNodeIds();
      const doubleHang = {
        ...DEFAULT_FITTINGS.hanging,
        clearHeight: 950,
        doubleHang: true,
        lowerClearHeight: 950,
        shelfAbove: true,
        shelvesAbove: 0,
      };
      return {
        ...base,
        meta: { ...base.meta, name: "Double hang, both bays" },
        carcase: { ...base.carcase, width: 1600 },
        layout: makeSplit("vertical", [
          { size: null, node: makeBay(doubleHang, "Double hang, left") },
          { size: null, node: makeBay(doubleHang, "Double hang, right") },
        ]),
        doors: { ...base.doors, leafMode: "per-bay", leafCount: 2 },
      };
    },
  },
  {
    id: "walk-in-open",
    name: "Open walk-in run",
    description:
      "2400 x 2400 x 600 with no doors. Hanging at each end, shelves and a shoe rack in the middle.",
    build: () => {
      const base = createDefaultSpec();
      resetNodeIds();
      return {
        ...base,
        meta: { ...base.meta, name: "Open walk-in run" },
        carcase: {
          ...base.carcase,
          width: 2400,
          height: 2400,
          depth: 600,
          plinth: { ...base.carcase.plinth, type: "integrated-sides", height: 80, setback: 0 },
        },
        layout: makeSplit("vertical", [
          {
            size: 700,
            node: makeBay({ ...DEFAULT_FITTINGS.hanging, clearHeight: 1750 }, "Long hang, left"),
          },
          {
            size: null,
            node: makeSplit("horizontal", [
              { size: null, node: makeBay({ ...DEFAULT_FITTINGS.shelves, count: 5 }, "Shelves") },
              { size: 900, node: makeBay({ ...DEFAULT_FITTINGS["shoe-rack"], tiers: 4 }, "Shoe rack") },
            ]),
          },
          {
            size: 700,
            node: makeBay(
              { ...DEFAULT_FITTINGS.hanging, clearHeight: 950, doubleHang: true },
              "Double hang, right",
            ),
          },
        ]),
        doors: { ...base.doors, type: "none" },
      };
    },
  },
  {
    id: "kids",
    name: "Children's wardrobe",
    description:
      "900 x 1600 x 550. A low rail a child can reach, drawers underneath, and a shelf above.",
    build: () => {
      const base = createDefaultSpec();
      resetNodeIds();
      return {
        ...base,
        meta: { ...base.meta, name: "Children's wardrobe" },
        carcase: { ...base.carcase, width: 900, height: 1600, depth: 550 },
        layout: makeSplit("horizontal", [
          {
            size: null,
            node: makeBay(
              { ...DEFAULT_FITTINGS.hanging, clearHeight: 800, shelfAbove: true, shelvesAbove: 1 },
              "Hanging",
            ),
          },
          { size: 500, node: makeBay({ ...DEFAULT_FITTINGS.drawers, count: 2 }, "Drawers") },
        ]),
        doors: { ...base.doors, leafMode: "count", leafCount: 2, hingeSideRule: "pairs" },
      };
    },
  },
  {
    id: "flatpack-demountable",
    name: "Demountable flat pack",
    description:
      "Cam fittings throughout and a grooved back, so the whole carcase can be taken apart and moved without damage.",
    build: () => {
      const base = createDefaultSpec();
      return {
        ...base,
        meta: { ...base.meta, name: "Demountable flat pack" },
        joinery: {
          ...base.joinery,
          connectorId: "cam-15",
          connectorSpacing: 160,
        },
        carcase: {
          ...base.carcase,
          back: { ...base.carcase.back, type: "groove", materialId: "hdf8" },
        },
      };
    },
  },
];

export const PRESETS: readonly Preset[] = WARDROBE_PRESETS.map((preset) => ({
  ...preset,
  kind: "wardrobe" as const,
}));

export const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

/* -------------------------------------------------------- unit templates --- */

/**
 * What "add a unit" offers.
 *
 * The wardrobe presets are the same templates seen through a different door, so they are
 * folded in rather than duplicated: a preset builds a whole wardrobe spec, and this strips
 * it down to what a unit stores.
 */
export type UnitTemplate = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: UnitSpec["kind"];
  readonly build: () => UnitSpec;
};

const TABLE_TEMPLATES: readonly UnitTemplate[] = [
  {
    id: "table-1400",
    name: "Work table, 1400",
    description:
      "1400 x 700 x 900 in 1.5mm 304, with a 100mm upstand, 40x40 stainless legs, bullet feet and one undershelf. The standard commercial bench.",
    kind: "work-table",
    build: () => createDefaultWorkTable(),
  },
  {
    id: "table-1800-plain",
    name: "Work table, 1800, no upstand",
    description:
      "1800 x 700 x 900 with a plain turned-down edge and two undershelves. For an island bench, where there is no wall to splash.",
    kind: "work-table",
    build: () => {
      const base = createDefaultWorkTable();
      return {
        ...base,
        width: 1800,
        top: { ...base.top, upstand: 0, upstandReturn: 0 },
        legs: { ...base.legs, braced: true },
        shelves: { ...base.shelves, count: 2 },
      };
    },
  },
  {
    id: "table-600-round-legs",
    name: "Prep table, 600, round legs",
    description:
      "1200 x 600 x 900 on 38.1mm round tube, boxed edge, 150mm upstand. Round legs are easier to wipe round and are what a sink bench usually stands on.",
    kind: "work-table",
    build: () => {
      const base = createDefaultWorkTable();
      return {
        ...base,
        width: 1200,
        depth: 600,
        top: { ...base.top, edge: "boxed", upstand: 150 },
        legs: { ...base.legs, profileId: "tube-38.1x1.5-ss" },
      };
    },
  },
];

const COUNTER_TEMPLATES: readonly UnitTemplate[] = [
  {
    id: "counter-serving",
    name: "Serving counter, 1800",
    description:
      "1800 x 650 x 950 on a welded 40x40 frame, board top with a 30mm nose, three drawers and a shelf. The plain shop counter.",
    kind: "counter",
    build: () => createDefaultCounter(),
  },
  {
    id: "counter-bar",
    name: "Bar counter, 2400",
    description:
      "2400 x 700 x 1050 in 50x50, with a 300mm overhang to sit at and a bar shelf at 1100. Braced ends, because the front is left open for knees.",
    kind: "counter",
    build: () => {
      const base = createDefaultCounter();
      return {
        ...base,
        width: 2400,
        depth: 700,
        height: 1050,
        frame: { ...base.frame, profileId: "shs-50x50x2", braced: true },
        top: { ...base.top, frontOverhang: 300, endOverhang: 30 },
        bar: { ...base.bar, height: 1100, depth: 250 },
        shelves: { ...base.shelves, count: 2 },
      };
    },
  },
  {
    id: "counter-beach-bar",
    name: "Beach bar front",
    description:
      "2200 x 700 x 1100 in larch slats over a galvanised frame, stainless top, no drawers — everything on open shelves so it can be hosed out.",
    kind: "counter",
    build: () => {
      const base = createDefaultCounter();
      return {
        ...base,
        width: 2200,
        depth: 700,
        height: 1100,
        frame: { ...base.frame, profileId: "shs-40x40x3", braced: true, bottomRail: 200 },
        top: {
          ...base.top,
          kind: "inox",
          materialId: "inox15-304",
          frontOverhang: 60,
          endOverhang: 40,
        },
        bar: { ...base.bar, height: 0 },
        drawerBank: { ...base.drawerBank, enabled: false },
        shelves: { ...base.shelves, count: 2, materialId: "larch-21-clad", lowest: 250 },
        cladding: {
          ...base.cladding,
          style: "slats",
          materialId: "larch-21-clad",
          faces: ["front", "left", "right"],
          pieceWidth: 90,
          gap: 12,
          direction: "horizontal",
          standoff: 25,
          fixing: "face-screwed",
          riseAboveTop: 0,
        },
      };
    },
  },
];

export const UNIT_TEMPLATES: readonly UnitTemplate[] = [
  ...PRESETS.map((preset) => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
    kind: "wardrobe" as const,
    build: (): UnitSpec => unitOfWardrobe(preset.build()),
  })),
  ...TABLE_TEMPLATES,
  ...COUNTER_TEMPLATES,
];

/* ------------------------------------------------------- project presets --- */

export const PROJECT_PRESETS: readonly ProjectPreset[] = [
  {
    id: "bedroom-wardrobe",
    name: "Bedroom with one wardrobe",
    description:
      "A 4000 x 3000 x 2500 room with a window in the left wall, and the default wardrobe against the back wall.",
    build: () => createDefaultProject(),
  },
  {
    id: "wardrobe-run",
    name: "Wardrobe run, two units",
    description:
      "Two wardrobes side by side down the back wall: a double hang with drawers, and a long hang beside it.",
    build: () => {
      const base = createDefaultProject();
      resetUnitIds();
      const first = PRESET_BY_ID.get("double-hang-drawers")?.build() ?? createDefaultSpec();
      const second = PRESET_BY_ID.get("long-hang-simple")?.build() ?? createDefaultSpec();
      return {
        ...base,
        meta: { ...base.meta, name: "Wardrobe run" },
        units: [
          placeUnit(unitOfWardrobe(first), "Double hang", { x: 100, z: 0 }),
          placeUnit(unitOfWardrobe(second), "Long hang", { x: 1900, z: 0 }),
        ],
      };
    },
  },

  {
    id: "beach-bar",
    name: "Beach bar",
    description:
      "A 3 x 5 x 3 shack with a shed roof and two window openings: the clad bar counter facing out of the front, and an inox back table against the rear wall to work on.",
    build: () => {
      const base = createDefaultProject();
      resetUnitIds();
      /* A shed roof falling to the front, so the high side is the one people stand at and
         the water runs off the back. Two openings in the front wall serve as the hatch. */
      const room: RoomSpec = {
        width: 3000,
        depth: 5000,
        height: 3000,
        wallThickness: 120,
        roof: { kind: "shed", pitch: 12, slopeAxis: "z", flip: true, overhang: 400, thickness: 80 },
        openings: [
          { id: "hatch-left", wall: "front", x: 300, sill: 1100, width: 900, height: 1000 },
          { id: "hatch-right", wall: "front", x: 1600, sill: 1100, width: 900, height: 1000 },
        ],
      };

      const bar = template("counter-beach-bar");
      const back = template("table-1800-plain");

      return {
        ...base,
        meta: {
          name: "Beach bar",
          notes:
            "The counter is clad on its three exposed faces and the back is left bare, because it faces the working side. Everything inside is on open shelves so the whole thing can be hosed out at the end of the season.",
        },
        room,
        units: [
          /* Both units are turned to face the front wall, where the hatches are, because a
             unit is built with its own front towards -Z. Yaw turns a unit about its origin,
             so a half turn has to be paid for in the placement as well. */
          placeUnit(bar, "Bar counter", { x: 2600, z: 4300, yaw: 180 }),
          /* Against the back wall with its upstand to it, facing the counter, so one person
             can work between the two without turning round. */
          placeUnit(back, "Back table", { x: 2400, z: 900, yaw: 180 }),
        ],
      };
    },
  },

  {
    id: "kitchen-run",
    name: "Commercial kitchen run",
    description:
      "A 4 x 6 x 2.8 kitchen with three stainless tables down one wall and a serving counter across the end, leaving a 1200mm walkway.",
    build: () => {
      const base = createDefaultProject();
      resetUnitIds();
      const room: RoomSpec = {
        ...createDefaultRoom(),
        width: 4000,
        depth: 6000,
        height: 2800,
        openings: [
          { id: "door", wall: "front", x: 1400, sill: 0, width: 1000, height: 2100 },
          { id: "win-1", wall: "right", x: 2200, sill: 1200, width: 1600, height: 900 },
        ],
      };

      const bench = () => template("table-1400");
      const prep = template("table-600-round-legs");
      const counter = template("counter-serving");

      return {
        ...base,
        meta: {
          name: "Commercial kitchen run",
          notes:
            "Benches at 900 with a 100mm upstand against the left wall, the prep table on round legs where the sink goes, and the serving counter across the back wall facing into the room. The 3300mm aisle in front of the run is what the layout is really about: two people have to pass behind each other carrying trays.",
        },
        room,
        units: [
          /* The run turned a quarter turn anticlockwise, so each table's length goes down the
             room and its upstand lands against the left wall. Nose to tail with a 20mm gap,
             so the tops can be levelled to each other without fighting. */
          placeUnit(bench(), "Bench 1", { x: 700, z: 200, yaw: 270 }),
          placeUnit(bench(), "Bench 2", { x: 700, z: 1620, yaw: 270 }),
          placeUnit(prep, "Prep table", { x: 600, z: 3040, yaw: 270 }),
          placeUnit(counter, "Serving counter", { x: 3800, z: 750, yaw: 180 }),
        ],
      };
    },
  },
];

export const PROJECT_PRESET_BY_ID = new Map(PROJECT_PRESETS.map((p) => [p.id, p]));

/** A unit template by id, or a default wardrobe if the id has gone. */
function template(id: string): UnitSpec {
  const found = UNIT_TEMPLATES.find((entry) => entry.id === id);
  return found ? found.build() : unitOfWardrobe(createDefaultSpec());
}
