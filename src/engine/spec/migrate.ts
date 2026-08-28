import { EDGE_BANDING_BY_ID, MATERIAL_BY_ID, SHEET_SIZE_BY_ID } from "../catalog/materials";
import {
  CONNECTOR_BY_ID,
  HANDLE_BY_ID,
  HINGE_BY_ID,
  LEVELLING_LEG_BY_ID,
  RAIL_BY_ID,
  SHELF_SUPPORT_BY_ID,
  SLIDE_BY_ID,
} from "../catalog/hardware";
import { PROFILE_BY_ID } from "../catalog/profiles";
import {
  createDefaultCounter,
  createDefaultProject,
  createDefaultRoom,
  createDefaultUnit,
  createDefaultWorkTable,
  DEFAULT_CLADDING,
} from "./defaults";
import { validateProject } from "./schema";
import { SPEC_VERSION, type ProjectSpec, type UnitKind, type WardrobeSpec } from "./types";

/**
 * Loading a project has to be forgiving. Files come from older versions of the app,
 * from hand-edited JSON and from URLs that may have been truncated, and refusing
 * to open one is much worse than opening it with a couple of values reset.
 *
 * The pipeline is: migrate to the current version, deep-merge over the current
 * defaults so any missing field is filled, replace catalogue ids that no longer
 * exist, then validate. Anything repaired is reported so the UI can say so.
 */

export type LoadResult = {
  readonly spec: ProjectSpec;
  readonly repairs: readonly string[];
  readonly fatal: readonly string[];
};

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

const DEFAULT_RAIL_ID = "oval-30x15";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Version 1 was a bare wardrobe and was the whole document. It becomes a project
 * holding that wardrobe, standing against the back wall of a default room.
 */
function v1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
  const meta = isRecord(raw["meta"]) ? raw["meta"] : { name: "Untitled project", notes: "" };
  const unit: Record<string, unknown> = { kind: "wardrobe", cladding: DEFAULT_CLADDING };
  for (const key of ["carcase", "layout", "doors", "handles", "drawers", "joinery"]) {
    if (raw[key] !== undefined) unit[key] = raw[key];
  }
  return {
    version: 2,
    meta,
    production: raw["production"],
    room: createDefaultRoom(),
    units: [
      {
        id: "u1",
        name: typeof meta["name"] === "string" && meta["name"] ? meta["name"] : "Wardrobe",
        at: { x: 0, z: 0, yaw: 0 },
        unit,
      },
    ],
  };
}

/** Version upgrades, keyed by the version they upgrade *from*. */
const MIGRATIONS: Record<number, Migration> = {
  1: v1ToV2,
};

/**
 * Merges `source` over `base`, filling in anything absent. Arrays are taken from
 * the source wholesale: a partial merge of the layout tree children or of the
 * explicit drawer front heights would produce nonsense. The unit list is an array too,
 * so its elements are merged one by one afterwards.
 */
function deepMerge(base: unknown, source: unknown): unknown {
  if (!isRecord(base) || !isRecord(source)) {
    return source === undefined ? base : source;
  }
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    out[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return out;
}

type CatalogCheck = {
  readonly path: readonly string[];
  readonly has: (id: string) => boolean;
  readonly label: string;
};

/** Checks against a stored unit, so paths are relative to the unit spec. */
const UNIT_CHECKS: readonly CatalogCheck[] = [
  { path: ["carcase", "panelMaterialId"], has: (id) => MATERIAL_BY_ID.has(id), label: "carcase material" },
  { path: ["carcase", "back", "materialId"], has: (id) => MATERIAL_BY_ID.has(id), label: "back panel material" },
  { path: ["carcase", "plinth", "legId"], has: (id) => LEVELLING_LEG_BY_ID.has(id), label: "levelling leg" },
  { path: ["doors", "materialId"], has: (id) => MATERIAL_BY_ID.has(id), label: "door material" },
  { path: ["doors", "hingeId"], has: (id) => HINGE_BY_ID.has(id), label: "hinge" },
  { path: ["doors", "bandingId"], has: (id) => EDGE_BANDING_BY_ID.has(id), label: "door edge banding" },
  { path: ["handles", "doorHandleId"], has: (id) => HANDLE_BY_ID.has(id), label: "door handle" },
  { path: ["handles", "drawerHandleId"], has: (id) => HANDLE_BY_ID.has(id), label: "drawer handle" },
  { path: ["drawers", "slideId"], has: (id) => SLIDE_BY_ID.has(id), label: "drawer slide" },
  { path: ["drawers", "boxMaterialId"], has: (id) => MATERIAL_BY_ID.has(id), label: "drawer box material" },
  { path: ["drawers", "bottomMaterialId"], has: (id) => MATERIAL_BY_ID.has(id), label: "drawer bottom material" },
  { path: ["drawers", "frontMaterialId"], has: (id) => MATERIAL_BY_ID.has(id), label: "drawer front material" },
  { path: ["drawers", "frontBandingId"], has: (id) => EDGE_BANDING_BY_ID.has(id), label: "drawer front banding" },
  { path: ["joinery", "connectorId"], has: (id) => CONNECTOR_BY_ID.has(id), label: "carcase connector" },
  { path: ["joinery", "shelfSupportId"], has: (id) => SHELF_SUPPORT_BY_ID.has(id), label: "shelf support" },
  { path: ["cladding", "materialId"], has: (id) => MATERIAL_BY_ID.has(id), label: "cladding material" },
];

/** Checks against a stored work table. */
const TABLE_CHECKS: readonly CatalogCheck[] = [
  { path: ["top", "materialId"], has: (id) => MATERIAL_BY_ID.has(id), label: "top material" },
  { path: ["shelves", "materialId"], has: (id) => MATERIAL_BY_ID.has(id), label: "undershelf material" },
  { path: ["legs", "profileId"], has: (id) => PROFILE_BY_ID.has(id), label: "leg section" },
  { path: ["cladding", "materialId"], has: (id) => MATERIAL_BY_ID.has(id), label: "cladding material" },
];

/** Checks against a stored counter. */
const COUNTER_CHECKS: readonly CatalogCheck[] = [
  { path: ["top", "materialId"], has: (id) => MATERIAL_BY_ID.has(id), label: "top material" },
  { path: ["top", "bandingId"], has: (id) => EDGE_BANDING_BY_ID.has(id), label: "top edge banding" },
  { path: ["frame", "profileId"], has: (id) => PROFILE_BY_ID.has(id), label: "frame section" },
  { path: ["bar", "materialId"], has: (id) => MATERIAL_BY_ID.has(id), label: "bar shelf material" },
  { path: ["shelves", "materialId"], has: (id) => MATERIAL_BY_ID.has(id), label: "shelf material" },
  { path: ["drawerBank", "carcaseMaterialId"], has: (id) => MATERIAL_BY_ID.has(id), label: "drawer bank carcase material" },
  { path: ["drawerBank", "frontMaterialId"], has: (id) => MATERIAL_BY_ID.has(id), label: "drawer front material" },
  { path: ["drawerBank", "handleId"], has: (id) => HANDLE_BY_ID.has(id), label: "drawer handle" },
  { path: ["drawerBank", "slideId"], has: (id) => SLIDE_BY_ID.has(id), label: "drawer slide" },
  { path: ["cladding", "materialId"], has: (id) => MATERIAL_BY_ID.has(id), label: "cladding material" },
];

/** Checks against the project root. */
const PROJECT_CHECKS: readonly CatalogCheck[] = [
  { path: ["production", "sheetSizeId"], has: (id) => SHEET_SIZE_BY_ID.has(id), label: "sheet size" },
  { path: ["production", "banding", "carcaseVisibleEdges"], has: (id) => EDGE_BANDING_BY_ID.has(id), label: "visible edge banding" },
  { path: ["production", "banding", "carcaseHiddenEdges"], has: (id) => EDGE_BANDING_BY_ID.has(id), label: "hidden edge banding" },
  { path: ["production", "banding", "shelfFront"], has: (id) => EDGE_BANDING_BY_ID.has(id), label: "shelf front banding" },
  { path: ["production", "banding", "shelfOther"], has: (id) => EDGE_BANDING_BY_ID.has(id), label: "shelf edge banding" },
];

function readPath(root: unknown, path: readonly string[]): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

function writePath(
  root: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
): void {
  let cursor: Record<string, unknown> = root;
  for (const key of path.slice(0, -1)) {
    const next = cursor[key];
    if (!isRecord(next)) return;
    cursor = next;
  }
  const last = path.at(-1);
  if (last) cursor[last] = value;
}

function applyChecks(
  target: Record<string, unknown>,
  defaults: unknown,
  checks: readonly CatalogCheck[],
  where: string,
  repairs: string[],
): void {
  for (const check of checks) {
    const value = readPath(target, check.path);
    if (typeof value === "string" && check.has(value)) continue;
    const fallback = readPath(defaults, check.path);
    repairs.push(
      `${where}the ${check.label} "${String(value)}" is not in this build's catalogue; reset to "${String(fallback)}".`,
    );
    writePath(target, check.path, fallback);
  }
}

/** Walks the layout tree replacing rail ids that are no longer in the catalogue. */
function repairLayoutIds(node: unknown, fallbackRailId: string, repairs: string[]): void {
  if (!isRecord(node)) return;
  if (node["kind"] === "bay") {
    const fitting = node["fitting"];
    if (isRecord(fitting)) {
      if (fitting["kind"] === "hanging") {
        const railId = fitting["railId"];
        if (typeof railId !== "string" || !RAIL_BY_ID.has(railId)) {
          repairs.push(`Hanging rail "${String(railId)}" is unknown; reset to the default rail.`);
          fitting["railId"] = fallbackRailId;
        }
      }
      if (fitting["kind"] === "shelves") {
        const materialId = fitting["materialId"];
        if (typeof materialId === "string" && !MATERIAL_BY_ID.has(materialId)) {
          repairs.push(`Shelf material "${materialId}" is unknown; the shelves now follow the carcase material.`);
          fitting["materialId"] = null;
        }
      }
    }
    return;
  }
  const children = node["children"];
  if (Array.isArray(children)) {
    for (const child of children) {
      if (isRecord(child)) repairLayoutIds(child["node"], fallbackRailId, repairs);
    }
  }
}

const DEFAULT_UNIT_BY_KIND: Record<UnitKind, () => Record<string, unknown>> = {
  wardrobe: () => createDefaultUnit() as unknown as Record<string, unknown>,
  "work-table": () => createDefaultWorkTable() as unknown as Record<string, unknown>,
  counter: () => createDefaultCounter() as unknown as Record<string, unknown>,
};

function defaultPlacement(kind: UnitKind, index: number): Record<string, unknown> {
  const build = DEFAULT_UNIT_BY_KIND[kind] ?? DEFAULT_UNIT_BY_KIND.wardrobe;
  return {
    id: `u${index + 1}`,
    name: `Unit ${index + 1}`,
    at: { x: 0, z: 0, yaw: 0 },
    unit: build(),
  };
}

/** Fills in and repairs one placement, which the wholesale array merge cannot do. */
function repairPlacement(raw: unknown, index: number, repairs: string[]): Record<string, unknown> {
  const source = isRecord(raw) ? raw : {};
  const unitSource = isRecord(source["unit"]) ? source["unit"] : {};
  const rawKind = unitSource["kind"];
  const kind: UnitKind =
    typeof rawKind === "string" && rawKind in DEFAULT_UNIT_BY_KIND
      ? (rawKind as UnitKind)
      : "wardrobe";
  if (kind !== rawKind) {
    repairs.push(
      `Unit ${index + 1} has an unknown kind "${String(rawKind)}"; it was read as a wardrobe.`,
    );
  }
  const merged = deepMerge(defaultPlacement(kind, index), { ...source, unit: { ...unitSource, kind } });
  const placement = isRecord(merged) ? merged : defaultPlacement(kind, index);
  const unit = placement["unit"];
  if (isRecord(unit)) {
    const name = typeof placement["name"] === "string" ? placement["name"] : `Unit ${index + 1}`;
    if (unit["kind"] === "wardrobe") {
      applyChecks(unit, createDefaultUnit(), UNIT_CHECKS, `In "${name}", `, repairs);
      repairLayoutIds(unit["layout"], DEFAULT_RAIL_ID, repairs);
    }
    if (unit["kind"] === "work-table") {
      applyChecks(unit, createDefaultWorkTable(), TABLE_CHECKS, `In "${name}", `, repairs);
    }
    if (unit["kind"] === "counter") {
      applyChecks(unit, createDefaultCounter(), COUNTER_CHECKS, `In "${name}", `, repairs);
    }
  }
  return placement;
}

export function loadSpec(raw: unknown): LoadResult {
  const defaults = createDefaultProject();
  const repairs: string[] = [];

  if (!isRecord(raw)) {
    return {
      spec: defaults,
      repairs: [],
      fatal: ["The file does not contain a Wardrobe Studio project."],
    };
  }

  let working: Record<string, unknown> = structuredClone(raw);

  const rawVersion = working["version"];
  let version = typeof rawVersion === "number" ? rawVersion : 0;
  if (version === 0) {
    repairs.push("The file had no version number and was read as version 1.");
    version = 1;
  }
  if (version > SPEC_VERSION) {
    return {
      spec: defaults,
      repairs: [],
      fatal: [
        `This project was saved by a newer version of Wardrobe Studio (spec version ${version}, this build understands ${SPEC_VERSION}).`,
      ],
    };
  }
  while (version < SPEC_VERSION) {
    const migration = MIGRATIONS[version];
    if (!migration) break;
    working = migration(working);
    version += 1;
    repairs.push(`Upgraded the project from spec version ${version - 1} to ${version}.`);
  }
  working["version"] = SPEC_VERSION;

  const merged = deepMerge({ ...defaults, units: undefined }, working);
  if (!isRecord(merged)) {
    return { spec: defaults, repairs, fatal: ["The specification could not be merged."] };
  }

  const rawUnits = merged["units"];
  const units = Array.isArray(rawUnits) && rawUnits.length > 0 ? rawUnits : [null];
  if (!Array.isArray(rawUnits) || rawUnits.length === 0) {
    repairs.push("The project had no units; a default wardrobe was added.");
  }
  merged["units"] = units.map((unit, index) => repairPlacement(unit, index, repairs));

  applyChecks(merged, defaults, PROJECT_CHECKS, "", repairs);

  const validated = validateProject(merged);
  if (!validated.ok) {
    return { spec: defaults, repairs, fatal: validated.issues };
  }

  return { spec: validated.spec, repairs, fatal: [] };
}

/** Serialises a project for a file or a share link. */
export function serialiseSpec(spec: ProjectSpec): string {
  return JSON.stringify(spec, null, 2);
}

/** Serialises one resolved wardrobe, for tests and for debugging output. */
export function serialiseWardrobe(spec: WardrobeSpec): string {
  return JSON.stringify(spec, null, 2);
}
