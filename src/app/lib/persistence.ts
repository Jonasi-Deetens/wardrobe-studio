import { del, get, set } from "idb-keyval";
import { loadSpec, serialiseSpec } from "@/engine/spec/migrate";
import type { ProjectSpec } from "@/engine/spec/types";

/**
 * Local-first storage.
 *
 * There is no server, so IndexedDB is the only thing standing between a closed tab and an
 * afternoon of work. Autosave writes on a debounce; the spec is small enough that saving
 * the whole thing is simpler and safer than tracking a diff.
 */

const AUTOSAVE_KEY = "wardrobe-studio:autosave";
const SETTINGS_KEY = "wardrobe-studio:settings";

export type Autosave = {
  readonly json: string;
  readonly savedAt: number;
};

export async function writeAutosave(spec: ProjectSpec): Promise<number> {
  const savedAt = Date.now();
  const entry: Autosave = { json: serialiseSpec(spec), savedAt };
  await set(AUTOSAVE_KEY, entry);
  return savedAt;
}

export async function readAutosave(): Promise<Autosave | null> {
  try {
    const entry = await get<Autosave>(AUTOSAVE_KEY);
    if (!entry || typeof entry.json !== "string") return null;
    return entry;
  } catch {
    return null;
  }
}

export async function clearAutosave(): Promise<void> {
  await del(AUTOSAVE_KEY);
}

export type StoredSettings = {
  readonly openGroups?: readonly string[];
};

export async function writeSettings(settings: StoredSettings): Promise<void> {
  try {
    await set(SETTINGS_KEY, settings);
  } catch {
    // Settings are a convenience; a private-mode browser refusing storage is not an error.
  }
}

export async function readSettings(): Promise<StoredSettings | null> {
  try {
    return (await get<StoredSettings>(SETTINGS_KEY)) ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- share links - */

/**
 * The whole spec, in the URL fragment.
 *
 * Deflate first where the browser has it: a spec is repetitive JSON and compresses to
 * roughly a fifth, which is the difference between a link that survives being pasted into
 * a chat window and one that gets truncated. The fragment is used rather than a query
 * string so the design never reaches a server log.
 */
export async function encodeSpecToHash(spec: ProjectSpec): Promise<string> {
  const json = serialiseSpec(spec);
  const bytes = new TextEncoder().encode(json);
  const compressed = await deflate(bytes);
  return compressed
    ? `#z=${toBase64Url(compressed)}`
    : `#s=${toBase64Url(bytes)}`;
}

export type HashLoad = {
  readonly spec: ProjectSpec;
  readonly repairs: readonly string[];
};

/**
 * What a URL fragment turned out to be.
 *
 * "Absent" and "broken" have to be told apart. A fragment that is not a share link at
 * all should quietly fall through to the autosave, but a link that was meant to be a
 * design and could not be read has to say so — otherwise someone follows a truncated
 * link, sees somebody else's wardrobe, and has no idea they are not looking at the one
 * they were sent.
 */
export type HashResult =
  | { readonly kind: "absent" }
  | { readonly kind: "loaded"; readonly load: HashLoad }
  | { readonly kind: "broken"; readonly reason: string };

export async function decodeSpecFromHash(hash: string): Promise<HashResult> {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return { kind: "absent" };
  const params = new URLSearchParams(raw);
  const compressed = params.get("z");
  const plain = params.get("s");
  if (!compressed && !plain) return { kind: "absent" };

  try {
    const bytes = fromBase64Url((compressed ?? plain) as string);
    const decoded = compressed ? await inflate(bytes) : bytes;
    if (!decoded) {
      return {
        kind: "broken",
        reason: "This browser cannot decompress the link. Ask for the project file instead.",
      };
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(decoded));
    const result = loadSpec(parsed);
    if (result.fatal.length > 0) {
      return { kind: "broken", reason: result.fatal.join(" ") };
    }
    return { kind: "loaded", load: { spec: result.spec, repairs: result.repairs } };
  } catch {
    return {
      kind: "broken",
      reason: "The link is incomplete or corrupted — it was most likely truncated somewhere along the way.",
    };
  }
}

type StreamCtor = new (format: string) => { readable: ReadableStream; writable: WritableStream };

async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  const Ctor = (globalThis as { CompressionStream?: StreamCtor }).CompressionStream;
  if (!Ctor) return null;
  try {
    return await pump(new Ctor("deflate-raw"), bytes);
  } catch {
    return null;
  }
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  const Ctor = (globalThis as { DecompressionStream?: StreamCtor }).DecompressionStream;
  if (!Ctor) return null;
  try {
    return await pump(new Ctor("deflate-raw"), bytes);
  } catch {
    return null;
  }
}

async function pump(
  stream: { readable: ReadableStream; writable: WritableStream },
  bytes: Uint8Array,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  void writer.write(new Uint8Array(buffer));
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = (stream.readable as ReadableStream<Uint8Array>).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    output.set(chunk, at);
    at += chunk.length;
  }
  return output;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
