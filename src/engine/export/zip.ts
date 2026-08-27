/**
 * A minimal ZIP writer, store-only (no deflate).
 *
 * The archive exists so a folder of per-panel DXFs downloads as one file. DXF is
 * plain text and CAM software does not care whether it was compressed, so pulling in
 * a compression library to save a few hundred kilobytes is not worth the dependency.
 */

export type ZipEntry = {
  readonly name: string;
  readonly content: string | Uint8Array;
};

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = ((crc >>> 8) ^ (CRC_TABLE[(crc ^ byte) & 0xff] as number)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS date/time, which is what the ZIP header wants. */
function dosDateTime(date: Date): { time: number; date: number } {
  const time =
    (Math.floor(date.getSeconds() / 2) & 0x1f) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getHours() & 0x1f) << 11);
  const day =
    (date.getDate() & 0x1f) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    ((Math.max(date.getFullYear() - 1980, 0) & 0x7f) << 9);
  return { time, date: day };
}

class ByteWriter {
  private chunks: Uint8Array[] = [];
  private length = 0;

  push(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }

  u16(value: number): void {
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
  }

  u32(value: number): void {
    this.push(
      new Uint8Array([
        value & 0xff,
        (value >>> 8) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 24) & 0xff,
      ]),
    );
  }

  get offset(): number {
    return this.length;
  }

  toUint8Array(): Uint8Array {
    const output = new Uint8Array(this.length);
    let at = 0;
    for (const chunk of this.chunks) {
      output.set(chunk, at);
      at += chunk.length;
    }
    return output;
  }
}

export function createZip(entries: readonly ZipEntry[], now = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const writer = new ByteWriter();
  const { time, date } = dosDateTime(now);

  const central: {
    name: Uint8Array;
    crc: number;
    size: number;
    offset: number;
  }[] = [];

  const used = new Set<string>();

  for (const entry of entries) {
    const name = encoder.encode(uniqueName(entry.name, used));
    const data =
      typeof entry.content === "string" ? encoder.encode(entry.content) : entry.content;
    const crc = crc32(data);
    const offset = writer.offset;

    writer.u32(0x04034b50);
    writer.u16(20); // version needed
    writer.u16(0x0800); // UTF-8 filenames
    writer.u16(0); // stored
    writer.u16(time);
    writer.u16(date);
    writer.u32(crc);
    writer.u32(data.length);
    writer.u32(data.length);
    writer.u16(name.length);
    writer.u16(0);
    writer.push(name);
    writer.push(data);

    central.push({ name, crc, size: data.length, offset });
  }

  const centralStart = writer.offset;
  for (const entry of central) {
    writer.u32(0x02014b50);
    writer.u16(20); // version made by
    writer.u16(20); // version needed
    writer.u16(0x0800);
    writer.u16(0);
    writer.u16(time);
    writer.u16(date);
    writer.u32(entry.crc);
    writer.u32(entry.size);
    writer.u32(entry.size);
    writer.u16(entry.name.length);
    writer.u16(0);
    writer.u16(0);
    writer.u16(0);
    writer.u16(0);
    writer.u32(0); // external attributes
    writer.u32(entry.offset);
    writer.push(entry.name);
  }
  const centralSize = writer.offset - centralStart;

  writer.u32(0x06054b50);
  writer.u16(0);
  writer.u16(0);
  writer.u16(central.length);
  writer.u16(central.length);
  writer.u32(centralSize);
  writer.u32(centralStart);
  writer.u16(0);

  return writer.toUint8Array();
}

/** Two identical panels would otherwise overwrite each other inside the archive. */
function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  let counter = 2;
  let candidate = `${stem}-${counter}${extension}`;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${stem}-${counter}${extension}`;
  }
  used.add(candidate);
  return candidate;
}
