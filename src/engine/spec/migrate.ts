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
import { createDefaultSpec } from "./defaults";
import { validateSpec } from "./schema";
import { SPEC_VERSION, type WardrobeSpec } from "./types";

/**
 * Loading a spec has to be forgiving. Files come from older versions of the app,
 * from hand-edited JSON and from URLs that may have been truncated, and refusing
 * to open one is much worse than opening it with a couple of values reset.
 *
 * The pipeline is: bump the version, deep-merge over the current defaults so any
 * missing field is filled, replace catalogue ids that no longer exist, then
 * validate. Anything repaired is reported so the UI can say so.
 */

export type LoadResult = {
  readonly spec: WardrobeSpec;
  readonly repairs: readonly string[];
  readonly fatal: readonly string[];
};

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

const DEFAULT_RAIL_ID = "oval-30x15";

/**
 * Version upgrades, keyed by the version they upgrade *from*. Version 1 is the
 * first release, so there is nothing here yet; the machinery exists so the first
 * schema change does not require a rewrite.
 */
const MIGRATIONS: Record<number, Migration> = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Merges `source` over `base`, filling in anything absent. Arrays are taken from
 * the source wholesale: a partial merge of the layout tree children or of the
 * explicit drawer front heights would produce nonsense.
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

const CATALOG_CHECKS: readonly CatalogCheck[] = [
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
  { path: ["production", "sheetSizeId"], has: (id) => SHEET_SIZE_BY_ID.has(id), label: "sheet size" },
  { path: ["production", "banding", "carcaseVisibleEdges"], has: (id) => EDGE_BANDING_BY_ID.has(id), label: "visible edge banding" },
  { path: ["production", "banding", "carcaseHiddenEdges"], has: (id) => EDGE_BANDING_BY_ID.has(id), label: "hidden edge banding" },
  { path: ["production", "banding", "shelfFront"], has: (id) => EDGE_BANDING_BY_ID.has(id), label: "shelf front banding" },
  { path: ["production", "banding", "shelfOther"], has: (id) => EDGE_BANDING_BY_ID.has(id), label: "shelf edge banding" },
];

function readPath(root: Record<string, unknown>, path: readonly string[]): unknown {
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

export function loadSpec(raw: unknown): LoadResult {
  const defaults = createDefaultSpec();
  const repairs: string[] = [];

  if (!isRecord(raw)) {
    return {
      spec: defaults,
      repairs: [],
      fatal: ["The file does not contain a wardrobe specification."],
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

  const merged = deepMerge(defaults, working);
  if (!isRecord(merged)) {
    return { spec: defaults, repairs, fatal: ["The specification could not be merged."] };
  }

  for (const check of CATALOG_CHECKS) {
    const value = readPath(merged, check.path);
    if (typeof value !== "string" || !check.has(value)) {
      const fallback = readPath(defaults as unknown as Record<string, unknown>, check.path);
      repairs.push(
        `The ${check.label} "${String(value)}" is not in this build's catalogue; reset to "${String(fallback)}".`,
      );
      writePath(merged, check.path, fallback);
    }
  }

  repairLayoutIds(merged["layout"], DEFAULT_RAIL_ID, repairs);

  const validated = validateSpec(merged);
  if (!validated.ok) {
    return { spec: defaults, repairs, fatal: validated.issues };
  }

  return { spec: validated.spec, repairs, fatal: [] };
}

/** Serialises a spec for a file or a share link. */
export function serialiseSpec(spec: WardrobeSpec): string {
  return JSON.stringify(spec, null, 2);
}
