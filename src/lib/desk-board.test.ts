import { describe, expect, it } from "vitest";
import { questionBoard } from "@/lib/desk-board";

// The picked question on the desk's board (#301, D-184): drawn by the board core in Maya's font, as the child wrote it
// on paper, before any help. Only the question: never a digit of the answer.

const glyphs = (board: NonNullable<ReturnType<typeof questionBoard>>) =>
  [...new Set(board.steps.flatMap((s) => s.drawn.flatMap((p) => (p.glyph ? [p.glyph] : []))))].sort();

describe("the question on the board", () => {
  it("writes an addition in columns with its line, and no answer", () => {
    const board = questionBoard({ kind: "add", operands: [27, 39] });
    if (!board) throw new Error("expected a board");
    expect(glyphs(board)).toEqual(["+", "2", "3", "7", "9"]);
    expect(board.steps.flatMap((s) => s.drawn).some((p) => p.kind === "rule")).toBe(true);
    expect(board.viewBox).toMatch(/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/);
  });

  it("writes a subtraction with its minus sign", () => {
    const board = questionBoard({ kind: "subtract", operands: [532, 178] });
    if (!board) throw new Error("expected a board");
    expect(glyphs(board)).toEqual(["1", "2", "3", "5", "7", "8", "−"]);
  });

  it("draws nothing for a question the board cannot lay out in columns", () => {
    expect(questionBoard({ kind: "subtract", operands: [12, 345] })).toBeNull();
    expect(questionBoard(null)).toBeNull();
  });
});
