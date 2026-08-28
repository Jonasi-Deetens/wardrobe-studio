/**
 * Sheet materials and edge banding. Values are typical European trade stock.
 *
 * `stiffness` is a relative index used by the shelf-sag advisor rather than a
 * real modulus: it only has to rank materials against each other, and a single
 * honest ratio is more useful than a precise number that ignores creep, load
 * distribution and humidity.
 */

export type MaterialCategory = "carcase" | "back" | "front" | "solid";

export type Material = {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly category: MaterialCategory;
  readonly thickness: number;
  /** Whether the face has a directional pattern that must be respected. */
  readonly hasGrain: boolean;
  /** Relative bending stiffness, with 18mm particleboard as 1.0. */
  readonly stiffness: number;
  /** Sag-safe span for a shelf carrying folded clothes, in millimetres. */
  readonly safeShelfSpan: number;
  readonly pricePerSheet: number;
  /** Kilograms per cubic metre, used to work out door leaf mass for the hinges. */
  readonly density: number;
  /** Rendering colour, sRGB hex. */
  readonly color: string;
  /**
   * Stock this material comes in, when it is not the project's board size. Stainless
   * sheet and cladding boards do not arrive as 2800 x 2070 panels.
   */
  readonly sheetSizeId?: string;
  readonly notes?: string;
};

export const MATERIALS: readonly Material[] = [
  {
    id: "mfc18-white",
    name: "Melamine faced chipboard 18mm, white",
    shortName: "MFC 18 white",
    category: "carcase",
    thickness: 18,
    hasGrain: false,
    stiffness: 1,
    safeShelfSpan: 800,
    pricePerSheet: 42,
    density: 650,
    color: "#e8e6e1",
    notes: "The default carcase board. Cheap, stable, needs edge banding.",
  },
  {
    id: "mfc18-oak",
    name: "Melamine faced chipboard 18mm, oak decor",
    shortName: "MFC 18 oak",
    category: "carcase",
    thickness: 18,
    hasGrain: true,
    stiffness: 1,
    safeShelfSpan: 800,
    pricePerSheet: 54,
    density: 650,
    color: "#c69c66",
  },
  {
    id: "mfc19-white",
    name: "Melamine faced chipboard 19mm, white",
    shortName: "MFC 19 white",
    category: "carcase",
    thickness: 19,
    hasGrain: false,
    stiffness: 1.18,
    safeShelfSpan: 850,
    pricePerSheet: 46,
    density: 650,
    color: "#e8e6e1",
    notes:
      "19mm keeps the 32mm system arithmetic tidy: half the thickness is 9.5mm, which is the standard dowel start dimension.",
  },
  {
    id: "mdf18",
    name: "MDF 18mm, raw",
    shortName: "MDF 18",
    category: "carcase",
    thickness: 18,
    hasGrain: false,
    stiffness: 1.15,
    safeShelfSpan: 800,
    pricePerSheet: 38,
    density: 750,
    color: "#c9a882",
    notes: "Machines cleanly and takes paint. Not for humid rooms.",
  },
  {
    id: "mdf22",
    name: "MDF 22mm, raw",
    shortName: "MDF 22",
    category: "carcase",
    thickness: 22,
    hasGrain: false,
    stiffness: 2.1,
    safeShelfSpan: 1000,
    pricePerSheet: 52,
    density: 750,
    color: "#c9a882",
    notes: "The straightforward answer to a shelf that would otherwise sag.",
  },
  {
    id: "ply18-birch",
    name: "Birch plywood 18mm",
    shortName: "Ply 18 birch",
    category: "carcase",
    thickness: 18,
    hasGrain: true,
    stiffness: 1.9,
    safeShelfSpan: 950,
    pricePerSheet: 88,
    density: 680,
    color: "#e0c9a0",
    notes: "Stiffest of the common 18mm boards and holds screws best.",
  },
  {
    id: "ply12-birch",
    name: "Birch plywood 12mm",
    shortName: "Ply 12 birch",
    category: "carcase",
    thickness: 12,
    hasGrain: true,
    stiffness: 0.55,
    safeShelfSpan: 600,
    pricePerSheet: 62,
    density: 680,
    color: "#e0c9a0",
  },
  {
    id: "hdf8",
    name: "HDF 8mm, white one side",
    shortName: "HDF 8",
    category: "back",
    thickness: 8,
    hasGrain: false,
    stiffness: 0.12,
    safeShelfSpan: 300,
    pricePerSheet: 22,
    density: 850,
    color: "#dcd9d2",
    notes: "Back panel stock thick enough to sit in a groove.",
  },
  {
    id: "hdf3",
    name: "Hardboard 3mm",
    shortName: "HDF 3",
    category: "back",
    thickness: 3,
    hasGrain: false,
    stiffness: 0.02,
    safeShelfSpan: 200,
    pricePerSheet: 12,
    density: 900,
    color: "#b7a894",
    notes: "Only for a rabbeted or surface-fixed back.",
  },
  {
    id: "mfc18-front-white",
    name: "Front panel MFC 18mm, white",
    shortName: "Front 18 white",
    category: "front",
    thickness: 18,
    hasGrain: false,
    stiffness: 1,
    safeShelfSpan: 800,
    pricePerSheet: 46,
    density: 650,
    color: "#f2f0ec",
  },
  {
    id: "mdf19-lacquer",
    name: "Front panel MDF 19mm, lacquered",
    shortName: "Front 19 lacquer",
    category: "front",
    thickness: 19,
    hasGrain: false,
    stiffness: 1.18,
    safeShelfSpan: 850,
    pricePerSheet: 96,
    density: 760,
    color: "#f6f5f2",
  },
  {
    id: "ply15-drawer",
    name: "Birch plywood 15mm, drawer box",
    shortName: "Ply 15",
    category: "carcase",
    thickness: 15,
    hasGrain: true,
    stiffness: 1.05,
    safeShelfSpan: 700,
    pricePerSheet: 74,
    density: 680,
    color: "#e6d3ae",
  },
  {
    id: "ply6-drawer-bottom",
    name: "Birch plywood 6mm, drawer bottom",
    shortName: "Ply 6",
    category: "back",
    thickness: 6,
    hasGrain: true,
    stiffness: 0.06,
    safeShelfSpan: 250,
    pricePerSheet: 34,
    density: 680,
    color: "#e6d3ae",
  },
  {
    id: "pine-19-clad",
    name: "Pine cladding board 19mm",
    shortName: "Pine 19",
    category: "solid",
    thickness: 19,
    hasGrain: true,
    stiffness: 1.1,
    safeShelfSpan: 700,
    // Sold by the board, so this is the price of the equivalent area in boards.
    pricePerSheet: 68,
    density: 500,
    color: "#dcbe92",
    sheetSizeId: "board-3000x150",
    notes: "Softwood cladding. Cheap, takes stain and oil, and moves with humidity.",
  },
  {
    id: "larch-21-clad",
    name: "Siberian larch cladding 21mm",
    shortName: "Larch 21",
    category: "solid",
    thickness: 21,
    hasGrain: true,
    stiffness: 1.4,
    safeShelfSpan: 800,
    pricePerSheet: 124,
    density: 590,
    color: "#c99a63",
    sheetSizeId: "board-3000x150",
    notes: "Durable enough to leave unfinished outdoors, which is what a beach bar wants.",
  },
  {
    id: "batten-20",
    name: "Softwood batten 20mm",
    shortName: "Batten 20",
    category: "solid",
    thickness: 20,
    hasGrain: true,
    stiffness: 1.1,
    safeShelfSpan: 700,
    pricePerSheet: 44,
    density: 500,
    color: "#cbb491",
    sheetSizeId: "board-3000x150",
    notes:
      "Counter-battens behind cladding. Ripped from board, so it costs board area rather than a section price.",
  },
  {
    id: "batten-45",
    name: "Softwood batten 45mm",
    shortName: "Batten 45",
    category: "solid",
    thickness: 45,
    hasGrain: true,
    stiffness: 3.2,
    safeShelfSpan: 1100,
    pricePerSheet: 88,
    density: 500,
    color: "#c4ab86",
    sheetSizeId: "board-3000x150",
    notes: "The deeper batten, where the cavity behind the cladding has to be ventilated.",
  },
  {
    id: "inox15-304",
    name: "Stainless steel 304 sheet 1.5mm, brushed",
    shortName: "Inox 1.5",
    category: "solid",
    thickness: 1.5,
    // A brushed finish has a direction and it shows badly if two adjacent panels
    // disagree, so it is treated exactly like a grain.
    hasGrain: true,
    stiffness: 0.9,
    safeShelfSpan: 700,
    pricePerSheet: 210,
    density: 7900,
    color: "#c4c8cc",
    sheetSizeId: "2000x1000",
    notes:
      "Folded, not sawn: a table top is cut flat with the folds allowed for, then bent up on the press brake.",
  },
  {
    id: "inox12-304",
    name: "Stainless steel 304 sheet 1.2mm, brushed",
    shortName: "Inox 1.2",
    category: "solid",
    thickness: 1.2,
    hasGrain: true,
    stiffness: 0.6,
    safeShelfSpan: 600,
    pricePerSheet: 172,
    density: 7900,
    color: "#c4c8cc",
    sheetSizeId: "2000x1000",
    notes: "Fine for undershelves; a work top wants 1.5mm.",
  },
];

export const MATERIAL_BY_ID = new Map(MATERIALS.map((m) => [m.id, m]));

export function getMaterial(id: string): Material {
  const material = MATERIAL_BY_ID.get(id);
  if (!material) throw new Error(`Unknown material: ${id}`);
  return material;
}

export function materialsFor(category: MaterialCategory): readonly Material[] {
  return MATERIALS.filter((m) => m.category === category);
}

export type EdgeBanding = {
  readonly id: string;
  readonly name: string;
  readonly thickness: number;
  readonly pricePerMetre: number;
  readonly color: string;
};

export const EDGE_BANDINGS: readonly EdgeBanding[] = [
  { id: "none", name: "None", thickness: 0, pricePerMetre: 0, color: "#000000" },
  { id: "abs04-white", name: "ABS 0.4mm white", thickness: 0.4, pricePerMetre: 0.35, color: "#e8e6e1" },
  { id: "abs1-white", name: "ABS 1mm white", thickness: 1, pricePerMetre: 0.6, color: "#e8e6e1" },
  { id: "abs2-white", name: "ABS 2mm white", thickness: 2, pricePerMetre: 0.95, color: "#e8e6e1" },
  { id: "abs1-oak", name: "ABS 1mm oak", thickness: 1, pricePerMetre: 0.85, color: "#c69c66" },
  { id: "abs2-oak", name: "ABS 2mm oak", thickness: 2, pricePerMetre: 1.25, color: "#c69c66" },
  { id: "veneer06-birch", name: "Birch veneer 0.6mm", thickness: 0.6, pricePerMetre: 1.1, color: "#e0c9a0" },
  { id: "solid20-lipping", name: "Solid lipping 20mm", thickness: 20, pricePerMetre: 4.5, color: "#c9a06a" },
];

export const EDGE_BANDING_BY_ID = new Map(EDGE_BANDINGS.map((b) => [b.id, b]));

export function getBanding(id: string): EdgeBanding {
  const banding = EDGE_BANDING_BY_ID.get(id);
  if (!banding) throw new Error(`Unknown edge banding: ${id}`);
  return banding;
}

export type SheetSize = {
  readonly id: string;
  readonly name: string;
  readonly length: number;
  readonly width: number;
};

export const SHEET_SIZES: readonly SheetSize[] = [
  { id: "2440x1220", name: "2440 x 1220 (8 x 4 ft)", length: 2440, width: 1220 },
  { id: "2800x2070", name: "2800 x 2070 (European board)", length: 2800, width: 2070 },
  { id: "3050x1300", name: "3050 x 1300", length: 3050, width: 1300 },
  { id: "2500x1250", name: "2500 x 1250", length: 2500, width: 1250 },
  { id: "2000x1000", name: "2000 x 1000 (stainless sheet)", length: 2000, width: 1000 },
  { id: "3000x1500", name: "3000 x 1500 (stainless sheet)", length: 3000, width: 1500 },
  { id: "board-3000x150", name: "3000 x 150 (cladding board)", length: 3000, width: 150 },
];

export const SHEET_SIZE_BY_ID = new Map(SHEET_SIZES.map((s) => [s.id, s]));

export function getSheetSize(id: string): SheetSize {
  const sheet = SHEET_SIZE_BY_ID.get(id);
  if (!sheet) throw new Error(`Unknown sheet size: ${id}`);
  return sheet;
}
