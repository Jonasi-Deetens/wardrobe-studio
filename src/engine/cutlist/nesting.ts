import { getSheetSize, MATERIAL_BY_ID } from "../catalog/materials";
import { cutSize, type GrainDirection, type Part } from "../core/part";
import { mm2 } from "../core/units";

/**
 * Sheet nesting.
 *
 * This is a MaxRects packer written from scratch rather than taken off the shelf,
 * because the two things that matter most in a real workshop are exactly the two
 * things general-purpose packers get wrong:
 *
 * 1. **Kerf.** The saw destroys 3 to 4mm at every cut. A layout that ignores that is
 *    not merely optimistic, it produces undersized parts. Here each placed part
 *    reserves its own size plus one kerf on the two sides that will be cut, so the
 *    gaps in the layout are real gaps.
 *
 * 2. **Grain.** A part whose face has a direction cannot be turned 90 degrees to
 *    make it fit. Packers that rotate freely will happily lay a wardrobe side across
 *    the grain of an oak-decor board.
 *
 * The result is then ordered into guillotine cuts, because that is what a panel saw
 * can physically do: full-width rips first, then cross-cuts within each strip.
 */

export type NestPart = {
  readonly id: string;
  readonly label: string;
  readonly length: number;
  readonly width: number;
  readonly grain: GrainDirection;
  readonly materialId: string;
  readonly unitId?: string;
};

export type Placement = {
  readonly partId: string;
  readonly label: string;
  /** Which unit the part belongs to, so the diagram can show one unit's panels. */
  readonly unitId?: string;
  /** Position of the part's lower-left corner on the sheet. */
  readonly x: number;
  readonly y: number;
  /** Size on the sheet, after any rotation. */
  readonly width: number;
  readonly height: number;
  readonly rotated: boolean;
  /** Which rip strip the part belongs to, for the cut sequence. */
  readonly stripIndex: number;
};

export type NestedSheet = {
  readonly index: number;
  readonly materialId: string;
  readonly length: number;
  readonly width: number;
  /** Usable area after edge trim. */
  readonly usableLength: number;
  readonly usableWidth: number;
  readonly trim: number;
  readonly placements: readonly Placement[];
  readonly usedArea: number;
  readonly wastePercent: number;
  readonly freeRects: readonly Rect[];
};

export type CutInstruction = {
  readonly sequence: number;
  readonly sheetIndex: number;
  readonly kind: "rip" | "crosscut";
  /** Distance from the sheet datum edge to the cut line. */
  readonly at: number;
  /** Extent of the cut along the other axis. */
  readonly from: number;
  readonly to: number;
  readonly description: string;
};

export type NestResult = {
  readonly sheets: readonly NestedSheet[];
  readonly cuts: readonly CutInstruction[];
  readonly unplaced: readonly NestPart[];
  readonly sheetCount: number;
  readonly totalWastePercent: number;
  readonly sheetCountByMaterial: readonly { materialId: string; sheets: number }[];
};

export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type NestOptions = {
  readonly sheetSizeId: string;
  readonly kerf: number;
  readonly trim: number;
  readonly respectGrain: boolean;
};

/** Panels that come from sheet goods; hardware and rails are not nested. */
export function nestablePartsOf(parts: readonly Part[]): NestPart[] {
  return parts.map((part) => ({
    id: part.id,
    label: part.label,
    /* A folded part is nested as its flat blank: that is the shape the sheet has to hold. */
    ...cutSize(part),
    grain: part.grain,
    materialId: part.materialId,
    ...(part.unitId !== undefined ? { unitId: part.unitId } : {}),
  }));
}

export function nest(parts: readonly NestPart[], options: NestOptions): NestResult {
  const byMaterial = new Map<string, NestPart[]>();
  for (const part of parts) {
    const bucket = byMaterial.get(part.materialId);
    if (bucket) bucket.push(part);
    else byMaterial.set(part.materialId, [part]);
  }

  const sheets: NestedSheet[] = [];
  const unplaced: NestPart[] = [];
  const sheetCountByMaterial: { materialId: string; sheets: number }[] = [];

  for (const [materialId, group] of [...byMaterial.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const before = sheets.length;
    /* Stainless sheet and cladding boards do not come as 2800 x 2070 panels, so a material
       that names its own stock is nested on that instead of on the project's board. */
    const sheet = getSheetSize(MATERIAL_BY_ID.get(materialId)?.sheetSizeId ?? options.sheetSizeId);
    const result = nestOneMaterial(group, {
      materialId,
      usableLength: mm2(sheet.length - 2 * options.trim),
      usableWidth: mm2(sheet.width - 2 * options.trim),
      sheetLength: sheet.length,
      sheetWidth: sheet.width,
      trim: options.trim,
      kerf: options.kerf,
      respectGrain: options.respectGrain,
      startIndex: sheets.length,
    });
    sheets.push(...result.sheets);
    unplaced.push(...result.unplaced);
    sheetCountByMaterial.push({ materialId, sheets: sheets.length - before });
  }

  const cuts = sheets.flatMap((s) => cutSequence(s, options.kerf));
  const totalUsable = sheets.reduce((sum, s) => sum + s.usableLength * s.usableWidth, 0);
  const totalUsed = sheets.reduce((sum, s) => sum + s.usedArea, 0);

  return {
    sheets,
    cuts,
    unplaced,
    sheetCount: sheets.length,
    totalWastePercent:
      totalUsable === 0 ? 0 : mm2(((totalUsable - totalUsed) / totalUsable) * 1000) / 10,
    sheetCountByMaterial,
  };
}

type MaterialNestOptions = {
  readonly materialId: string;
  readonly usableLength: number;
  readonly usableWidth: number;
  readonly sheetLength: number;
  readonly sheetWidth: number;
  readonly trim: number;
  readonly kerf: number;
  readonly respectGrain: boolean;
  readonly startIndex: number;
};

function nestOneMaterial(
  parts: readonly NestPart[],
  options: MaterialNestOptions,
): { sheets: NestedSheet[]; unplaced: NestPart[] } {
  // Largest first. Big panels are the ones with nowhere else to go, and getting them
  // down early leaves usable offcuts rather than a scatter of unusable slivers.
  const queue = [...parts].sort(
    (a, b) =>
      Math.max(b.length, b.width) - Math.max(a.length, a.width) ||
      b.length * b.width - a.length * a.width,
  );

  const sheets: NestedSheet[] = [];
  const unplaced: NestPart[] = [];
  let remaining = queue;

  while (remaining.length > 0) {
    const sheetIndex = options.startIndex + sheets.length;
    const packer = new MaxRectsPacker(options.usableLength, options.usableWidth);
    const placements: Placement[] = [];
    const leftovers: NestPart[] = [];

    for (const part of remaining) {
      const placement = packer.insert(part, options.kerf, options.respectGrain);
      if (placement) placements.push(placement);
      else leftovers.push(part);
    }

    if (placements.length === 0) {
      // Nothing on this sheet fits at all, so no further sheet will help.
      unplaced.push(...leftovers);
      break;
    }

    const withStrips = assignStrips(placements, options.kerf);
    const usedArea = withStrips.reduce((sum, p) => sum + p.width * p.height, 0);
    const usable = options.usableLength * options.usableWidth;

    sheets.push({
      index: sheetIndex,
      materialId: options.materialId,
      length: options.sheetLength,
      width: options.sheetWidth,
      usableLength: options.usableLength,
      usableWidth: options.usableWidth,
      trim: options.trim,
      placements: withStrips,
      usedArea: mm2(usedArea),
      wastePercent: mm2(((usable - usedArea) / usable) * 1000) / 10,
      freeRects: packer.freeRects,
    });

    remaining = leftovers;
  }

  return { sheets, unplaced };
}

/**
 * MaxRects with the best-short-side-fit heuristic.
 *
 * Free space is kept as a list of maximal rectangles. Placing a part splits every
 * free rectangle it overlaps, then any rectangle wholly inside another is dropped.
 * Best-short-side-fit picks the position that leaves the least slack on the tighter
 * axis, which in practice produces fewer long thin offcuts than area-based scoring.
 */
class MaxRectsPacker {
  freeRects: Rect[];

  constructor(width: number, height: number) {
    this.freeRects = [{ x: 0, y: 0, width, height }];
  }

  insert(part: NestPart, kerf: number, respectGrain: boolean): Placement | null {
    // The part must take its own size plus a saw cut on the two sides that will be
    // cut away from the parent offcut.
    const orientations: { w: number; h: number; rotated: boolean }[] = [
      { w: part.length, h: part.width, rotated: false },
    ];
    const grainLocked = respectGrain && part.grain !== "none";
    if (!grainLocked && part.length !== part.width) {
      orientations.push({ w: part.width, h: part.length, rotated: true });
    }

    let best: {
      rect: Rect;
      w: number;
      h: number;
      rotated: boolean;
      score: [number, number];
    } | null = null;

    for (const orientation of orientations) {
      const needW = orientation.w + kerf;
      const needH = orientation.h + kerf;
      for (const rect of this.freeRects) {
        if (rect.width < needW || rect.height < needH) continue;
        const leftoverX = rect.width - needW;
        const leftoverY = rect.height - needH;
        const score: [number, number] = [
          Math.min(leftoverX, leftoverY),
          Math.max(leftoverX, leftoverY),
        ];
        if (
          best === null ||
          score[0] < best.score[0] ||
          (score[0] === best.score[0] && score[1] < best.score[1])
        ) {
          best = { rect, w: orientation.w, h: orientation.h, rotated: orientation.rotated, score };
        }
      }
    }

    if (!best) return null;

    const placement: Placement = {
      partId: part.id,
      label: part.label,
      ...(part.unitId !== undefined ? { unitId: part.unitId } : {}),
      x: mm2(best.rect.x),
      y: mm2(best.rect.y),
      width: mm2(best.w),
      height: mm2(best.h),
      rotated: best.rotated,
      stripIndex: 0,
    };

    this.occupy({
      x: best.rect.x,
      y: best.rect.y,
      width: best.w + kerf,
      height: best.h + kerf,
    });

    return placement;
  }

  private occupy(used: Rect): void {
    const next: Rect[] = [];
    for (const free of this.freeRects) {
      next.push(...splitRect(free, used));
    }
    this.freeRects = pruneContained(next);
  }
}

function splitRect(free: Rect, used: Rect): Rect[] {
  const overlaps =
    used.x < free.x + free.width &&
    used.x + used.width > free.x &&
    used.y < free.y + free.height &&
    used.y + used.height > free.y;
  if (!overlaps) return [free];

  const parts: Rect[] = [];

  if (used.y > free.y) {
    parts.push({ x: free.x, y: free.y, width: free.width, height: used.y - free.y });
  }
  const usedTop = used.y + used.height;
  if (usedTop < free.y + free.height) {
    parts.push({
      x: free.x,
      y: usedTop,
      width: free.width,
      height: free.y + free.height - usedTop,
    });
  }
  if (used.x > free.x) {
    parts.push({ x: free.x, y: free.y, width: used.x - free.x, height: free.height });
  }
  const usedRight = used.x + used.width;
  if (usedRight < free.x + free.width) {
    parts.push({
      x: usedRight,
      y: free.y,
      width: free.x + free.width - usedRight,
      height: free.height,
    });
  }

  return parts.filter((r) => r.width > 0.5 && r.height > 0.5);
}

function pruneContained(rects: readonly Rect[]): Rect[] {
  const kept: Rect[] = [];
  for (let i = 0; i < rects.length; i += 1) {
    const a = rects[i] as Rect;
    let contained = false;
    for (let j = 0; j < rects.length; j += 1) {
      if (i === j) continue;
      const b = rects[j] as Rect;
      if (isInside(a, b) && !(isInside(b, a) && j > i)) {
        contained = true;
        break;
      }
    }
    if (!contained) kept.push(a);
  }
  return kept;
}

function isInside(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x - 0.01 &&
    inner.y >= outer.y - 0.01 &&
    inner.x + inner.width <= outer.x + outer.width + 0.01 &&
    inner.y + inner.height <= outer.y + outer.height + 0.01
  );
}

/**
 * Groups placements into rip strips.
 *
 * A panel saw cuts right through the board, so the layout has to be readable as a
 * set of full-length rips followed by cross-cuts within each resulting strip. Parts
 * that share a left edge and a width form one strip; the cut list is then honest
 * about the order the operator will actually work in.
 */
function assignStrips(placements: readonly Placement[], kerf: number): Placement[] {
  const sorted = [...placements].sort((a, b) => a.x - b.x || a.y - b.y);
  const strips: { x: number; width: number }[] = [];

  return sorted.map((placement) => {
    let stripIndex = strips.findIndex(
      (strip) =>
        Math.abs(strip.x - placement.x) < kerf + 0.5 &&
        Math.abs(strip.width - placement.width) < kerf + 0.5,
    );
    if (stripIndex === -1) {
      strips.push({ x: placement.x, width: placement.width });
      stripIndex = strips.length - 1;
    }
    return { ...placement, stripIndex };
  });
}

/**
 * The cut sequence for one sheet: rip along the length to free each strip, then
 * cross-cut each strip into parts.
 */
export function cutSequence(sheet: NestedSheet, kerf: number): CutInstruction[] {
  const cuts: CutInstruction[] = [];
  let sequence = 0;

  const strips = new Map<number, Placement[]>();
  for (const placement of sheet.placements) {
    const bucket = strips.get(placement.stripIndex);
    if (bucket) bucket.push(placement);
    else strips.set(placement.stripIndex, [placement]);
  }

  const ordered = [...strips.entries()].sort(
    (a, b) => (a[1][0]?.x ?? 0) - (b[1][0]?.x ?? 0),
  );

  for (const [, placements] of ordered) {
    const first = placements[0];
    if (!first) continue;
    const ripAt = mm2(first.x + first.width);
    sequence += 1;
    cuts.push({
      sequence,
      sheetIndex: sheet.index,
      kind: "rip",
      at: ripAt,
      from: 0,
      to: sheet.usableWidth,
      description: `Rip at ${ripAt}mm to free a ${first.width}mm strip.`,
    });

    for (const placement of [...placements].sort((a, b) => a.y - b.y)) {
      const cutAt = mm2(placement.y + placement.height);
      if (cutAt >= sheet.usableWidth - kerf) continue;
      sequence += 1;
      cuts.push({
        sequence,
        sheetIndex: sheet.index,
        kind: "crosscut",
        at: cutAt,
        from: placement.x,
        to: mm2(placement.x + placement.width),
        description: `Cross-cut the strip at ${cutAt}mm for ${placement.label}.`,
      });
    }
  }

  return cuts;
}
