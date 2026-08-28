import { bendDeduction, type Fold } from "./part";
import { mm2 } from "./units";

/**
 * Flat patterns for folded sheet metal.
 *
 * A folded part is cut flat and bent afterwards, so the size that goes on the saw or the
 * laser is not the size the finished part measures. Getting that arithmetic wrong is not a
 * tolerance problem, it is scrap: a stainless top cut to its finished size comes off the
 * press brake 80mm too narrow and there is no fixing it.
 *
 * Everything here works in one axis at a time. A tray is two independent developments — one
 * across the length, one across the width — because the corners are notched out before
 * folding and welded up afterwards, which is how a sheet-metal tray is actually made.
 */

export type Segment = {
  readonly length: number;
  /** Which way this face turns off the one before it, or null for the flat deck. */
  readonly direction: "up" | "down" | null;
  readonly note?: string;
};

/** A flange, and which way it turns off the face before it. */
export function flange(length: number, direction: "up" | "down", note?: string): Segment {
  return { length, direction, ...(note === undefined ? {} : { note }) };
}

/** The flat face the flanges hang off. It is not itself a bend. */
export function deck(length: number): Segment {
  return { length, direction: null };
}

export type FlatPattern = {
  /** Blank size along this axis. */
  readonly total: number;
  readonly bends: readonly {
    readonly at: number;
    readonly direction: "up" | "down";
    readonly note?: string;
  }[];
};

/**
 * The flat development of a chain of faces.
 *
 * A single 90-degree bend joining two faces measured to the outside makes a blank shorter
 * than the sum of the two by the bend deduction, so `n` faces in a row lose it `n - 1`
 * times. Splitting that loss evenly across each bend's two neighbours puts the bend line at
 * half a deduction inside the nominal position, which is exactly where a press brake
 * operator would scribe it.
 */
export function flatten(segments: readonly Segment[], thickness: number): FlatPattern {
  /* Every boundary between two faces is a bend, so there is always one fewer bend than
     there are faces. */
  const bendCount = Math.max(segments.length - 1, 0);
  const deduction = bendDeduction(thickness, 90);
  const nominal = segments.reduce((sum, segment) => sum + segment.length, 0);
  const deckIndex = segments.findIndex((segment) => segment.direction === null);

  const bends: { at: number; direction: "up" | "down"; note?: string }[] = [];
  let cumulative = 0;
  for (let index = 0; index < bendCount; index += 1) {
    cumulative += segments[index]?.length ?? 0;
    /* Which face this boundary belongs to: before the deck it is the flange on the near
       side, after it the flange on the far side. Either way it is the piece that moves. */
    const owner = index < deckIndex ? segments[index] : segments[index + 1];
    if (!owner || owner.direction === null) continue;
    bends.push({
      at: mm2(cumulative - (bends.length + 0.5) * deduction),
      direction: owner.direction,
      ...(owner.note === undefined ? {} : { note: owner.note }),
    });
  }

  return { total: mm2(nominal - bendCount * deduction), bends };
}

/**
 * The two developments of a tray, turned into the `Fold` list a part carries.
 *
 * A bend that runs across the part's width is a line along its length, and vice versa, which
 * is the one thing worth being careful about here: get it the wrong way round and the
 * drawing shows the fold on the wrong axis.
 */
export function foldsOf(
  partId: string,
  acrossWidth: FlatPattern,
  acrossLength: FlatPattern,
  radius: number,
): Fold[] {
  return [
    ...acrossLength.bends.map((bend, index) => ({
      id: `${partId}-fz-${index}`,
      along: "length" as const,
      at: bend.at,
      angle: 90,
      direction: bend.direction,
      radius,
      ...(bend.note ? { note: bend.note } : {}),
    })),
    ...acrossWidth.bends.map((bend, index) => ({
      id: `${partId}-fx-${index}`,
      along: "width" as const,
      at: bend.at,
      angle: 90,
      direction: bend.direction,
      radius,
      ...(bend.note ? { note: bend.note } : {}),
    })),
  ];
}

/** A tray with every edge turned down the same amount: the simplest folded top. */
export function turnedDownTray(
  size: { readonly length: number; readonly width: number },
  skirt: number,
  thickness: number,
): { readonly acrossLength: FlatPattern; readonly acrossWidth: FlatPattern } {
  const turned = (across: number): FlatPattern =>
    flatten(
      skirt > 0 ? [flange(skirt, "down"), deck(across), flange(skirt, "down")] : [deck(across)],
      thickness,
    );
  return { acrossLength: turned(size.width), acrossWidth: turned(size.length) };
}
