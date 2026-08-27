import { createDefaultSpec, DEFAULT_FITTINGS, makeBay, makeSplit, resetNodeIds } from "./defaults";
import type { WardrobeSpec } from "./types";

export type Preset = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly build: () => WardrobeSpec;
};

/**
 * Starting points rather than finished designs. Each one is a real arrangement a
 * cabinetmaker would recognise, so the numbers are worth copying even if the
 * layout gets rearranged afterwards.
 */
export const PRESETS: readonly Preset[] = [
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

export const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));
