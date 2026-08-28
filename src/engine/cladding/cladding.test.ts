import { describe, expect, it } from "vitest";
import { partBounds, type Part } from "../core/part";
import type { Box3 } from "../core/geometry";
import { DEFAULT_CLADDING } from "../spec/defaults";
import type { CladdingSpec } from "../spec/types";
import { solveCladding } from ".";

/**
 * The cladding solver is held to two things: it covers what it says it covers, and every
 * screw on the hardware list has a hole to go in.
 */

const BOX: Box3 = { min: [0, 0, 0], max: [2000, 1100, 700] };

const clad = (over: Partial<CladdingSpec>): CladdingSpec => ({
  ...DEFAULT_CLADDING,
  style: "slats",
  ...over,
});

const boardsOf = (parts: readonly Part[]): Part[] =>
  parts.filter((part) => part.role === "cladding");

const battensOf = (parts: readonly Part[]): Part[] =>
  parts.filter((part) => part.role === "batten");

describe("cladding covers the face it is put on", () => {
  it("produces nothing when the style is none", () => {
    const result = solveCladding(clad({ style: "none" }), "u1", BOX);
    expect(result.parts).toHaveLength(0);
    expect(result.hardware).toHaveLength(0);
    expect(result.bounds).toBeNull();
  });

  it("covers the height of the unit with horizontal boards", () => {
    const spec = clad({ direction: "horizontal", pieceWidth: 90, gap: 10, faces: ["front"] });
    const boards = boardsOf(solveCladding(spec, "u1", BOX).parts);

    // Every board runs the full width of the face.
    for (const board of boards) expect(board.length).toBe(2000);

    const covered = boards.reduce((sum, board) => sum + board.width, 0);
    const gaps = (boards.length - 1) * spec.gap;
    // Boards plus their gaps make up the height, give or take the last ripped board.
    expect(covered + gaps).toBeGreaterThanOrEqual(1100 - spec.pieceWidth);
    expect(covered + gaps).toBeLessThanOrEqual(1100 + 1);
  });

  it("covers the width of the unit with vertical boards", () => {
    const spec = clad({ direction: "vertical", pieceWidth: 100, gap: 0, faces: ["front"] });
    const boards = boardsOf(solveCladding(spec, "u1", BOX).parts);

    for (const board of boards) expect(board.length).toBe(1100);
    expect(boards.reduce((sum, board) => sum + board.width, 0)).toBeCloseTo(2000, 1);
  });

  it("runs past the top when a parapet is asked for", () => {
    const plain = solveCladding(clad({ direction: "vertical" }), "u1", BOX);
    const raised = solveCladding(clad({ direction: "vertical", riseAboveTop: 150 }), "u1", BOX);
    expect(boardsOf(raised.parts)[0]?.length).toBe(
      (boardsOf(plain.parts)[0]?.length ?? 0) + 150,
    );
    expect(raised.bounds?.max[1]).toBeCloseTo(1250, 1);
  });

  it("stands the boards off the unit on battens, and puts the battens behind them", () => {
    const result = solveCladding(clad({ standoff: 20, faces: ["front"] }), "u1", BOX);
    const battens = battensOf(result.parts);
    expect(battens.length).toBeGreaterThan(1);

    /* The face of the unit is z = 700: battens on it, boards in front of them. */
    for (const batten of battens) expect(partBounds(batten).min[2]).toBeCloseTo(700, 1);
    for (const board of boardsOf(result.parts)) {
      expect(partBounds(board).min[2]).toBeCloseTo(720, 1);
    }
  });

  it("snaps the batten to a stock thickness rather than inventing one", () => {
    const result = solveCladding(clad({ standoff: 40, faces: ["front"] }), "u1", BOX);
    expect(battensOf(result.parts)[0]?.thickness).toBe(45);
  });

  it("clads each selected face and no others", () => {
    const result = solveCladding(
      clad({ faces: ["front", "left", "right"], direction: "vertical" }),
      "u1",
      BOX,
    );
    const faces = new Set(
      boardsOf(result.parts).map((part) => part.id.split(":")[1]?.split("-")[1]),
    );
    expect([...faces].sort()).toEqual(["front", "left", "right"]);
  });

  it("puts the end boards on the end faces, at the unit's own depth", () => {
    const result = solveCladding(
      clad({ faces: ["left"], direction: "vertical", gap: 0, pieceWidth: 100 }),
      "u1",
      BOX,
    );
    const boards = boardsOf(result.parts);
    // The left face is 700 deep, so seven 100mm boards cover it exactly.
    expect(boards).toHaveLength(7);
    for (const board of boards) expect(partBounds(board).max[0]).toBeCloseTo(0, 1);
  });
});

describe("every cladding fixing on the hardware list has a hole", () => {
  it("counts screws against the holes drilled for them", () => {
    const result = solveCladding(
      clad({ faces: ["front", "left"], standoff: 20, fixing: "face-screwed" }),
      "u1",
      BOX,
    );
    const holes = result.parts.reduce(
      (count, part) => count + part.ops.filter((op) => op.purpose === "cladding-fixing").length,
      0,
    );
    const screws = result.hardware.find((use) => use.catalogId === "screw-a2-4x50");
    expect(holes).toBeGreaterThan(0);
    expect(screws?.quantity).toBe(holes);
  });

  it("uses clips instead of screws when the fixing is secret", () => {
    const result = solveCladding(clad({ fixing: "secret", standoff: 20 }), "u1", BOX);
    expect(result.hardware.map((use) => use.catalogId)).toEqual(["clad-clip-secret"]);
  });

  it("drills nothing when the boards are glued on", () => {
    const result = solveCladding(clad({ fixing: "glued" }), "u1", BOX);
    const holes = result.parts.flatMap((part) => part.ops);
    expect(holes).toHaveLength(0);
    expect(result.hardware[0]?.catalogId).toBe("adhesive-pu-310");
  });

  it("keeps every hole inside the board it is drilled in", () => {
    const result = solveCladding(
      clad({ faces: ["front", "left", "right", "back"], standoff: 20, direction: "vertical" }),
      "u1",
      BOX,
    );
    for (const part of result.parts) {
      for (const op of part.ops) {
        if (op.kind !== "hole") continue;
        expect(op.l).toBeGreaterThanOrEqual(0);
        expect(op.l).toBeLessThanOrEqual(part.length);
        expect(op.w).toBeGreaterThanOrEqual(0);
        expect(op.w).toBeLessThanOrEqual(part.width);
      }
    }
  });
});
