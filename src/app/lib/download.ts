/**
 * Browser downloads. A revoked object URL after a tick keeps the tab from leaking a blob
 * for every export, which adds up when someone exports a booklet a dozen times.
 */

function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(filename: string, text: string, type = "text/plain"): void {
  save(new Blob([text], { type: `${type};charset=utf-8` }), filename);
}

/**
 * CSV gets a BOM. Excel on a machine with a non-UTF-8 locale otherwise mangles every
 * accented character and the millimetre sign, and the shop office is exactly where that
 * happens.
 */
export function downloadCsv(filename: string, csv: string): void {
  save(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), filename);
}

export function downloadBytes(filename: string, bytes: Uint8Array, type: string): void {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  save(new Blob([buffer], { type }), filename);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
