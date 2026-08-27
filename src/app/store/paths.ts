/**
 * Path-addressed reads and writes into the spec.
 *
 * The parameter panel is a table of ~70 descriptors, each naming the value it edits by
 * path. That keeps the panel declarative — units, limits, and the construction
 * rationale live next to the path — and means adding a parameter is one row rather
 * than a store action, a setter and a component.
 */

export type Path = readonly (string | number)[];

type Indexable = Record<string | number, unknown>;

function isIndexable(value: unknown): value is Indexable {
  return typeof value === "object" && value !== null;
}

export function getAtPath(root: unknown, path: Path): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (!isIndexable(cursor)) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

/**
 * Returns a new root with `value` written at `path`. Only the objects along the path
 * are copied, so unrelated parts of the spec keep their identity and React can skip
 * re-rendering the panels that did not change.
 */
export function setAtPath<T>(root: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [key, ...rest] = path as [string | number, ...(string | number)[]];

  if (Array.isArray(root)) {
    const index = Number(key);
    const next = [...root];
    next[index] = rest.length === 0 ? value : setAtPath(root[index], rest, value);
    return next as unknown as T;
  }

  if (!isIndexable(root)) {
    // The path runs through something that is not an object; build the shape.
    const created: Indexable = {};
    created[key] = rest.length === 0 ? value : setAtPath({}, rest, value);
    return created as unknown as T;
  }

  return {
    ...root,
    [key]: rest.length === 0 ? value : setAtPath(root[key], rest, value),
  } as T;
}

export const pathKey = (path: Path): string => path.join(".");
