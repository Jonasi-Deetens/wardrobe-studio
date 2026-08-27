/**
 * Every length in the engine is a number of millimetres. There is no unit type
 * and no conversion layer, because mixing units is the single most common source
 * of wrong holes and this removes the possibility entirely.
 */

/** The pitch of the European system hole grid. */
export const SYSTEM_PITCH = 32;

/** Diameter of a system / shelf-pin hole. */
export const SYSTEM_HOLE_DIA = 5;

/**
 * Centre distance from the front edge of a side panel to the front system row.
 * Sealing lips and bumpers count as part of the front edge and are included in
 * this dimension.
 */
export const SYSTEM_FRONT_OFFSET = 37;

/** Rounds to 0.1mm, which is finer than any panel saw or CNC will honour. */
export function mm(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Rounds to 0.01mm, for intermediate results that get summed many times. */
export function mm2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Nearest multiple of `step`, used for snapping to the 32mm grid. */
export function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Largest multiple of `step` that is not greater than `value`. */
export function snapDown(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

/** Smallest multiple of `step` that is not less than `value`. */
export function snapUp(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/** True when `value` is a whole multiple of `step`, within 0.05mm. */
export function isMultipleOf(value: number, step: number): boolean {
  return Math.abs(value - snap(value, step)) < 0.05;
}

/** Formats a length for display: no decimals when whole, otherwise one. */
export function formatMm(value: number): string {
  const rounded = mm(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatDim(value: number): string {
  return `${formatMm(value)} mm`;
}

/** Square millimetres to square metres. */
export function mm2ToM2(area: number): number {
  return area / 1_000_000;
}

/** Millimetres to metres, for edge banding runs. */
export function mmToM(length: number): number {
  return length / 1000;
}

/**
 * Distributes `total` over `count` bays, honouring any explicitly sized bays and
 * sharing the remainder equally between the flexible ones. Explicit sizes are
 * clamped so the result can never exceed the available space.
 */
export function distribute(
  total: number,
  weights: readonly (number | null)[],
): number[] {
  const fixed = weights.reduce<number>((sum, w) => sum + (w ?? 0), 0);
  const flexible = weights.filter((w) => w === null).length;

  if (flexible === 0) {
    // All bays are pinned: scale them so they still add up to the opening.
    const scale = fixed === 0 ? 0 : total / fixed;
    return weights.map((w) => mm2((w ?? 0) * scale));
  }

  const share = Math.max(0, total - fixed) / flexible;
  return weights.map((w) => mm2(w ?? share));
}
