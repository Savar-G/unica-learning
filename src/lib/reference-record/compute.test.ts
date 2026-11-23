import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  computeExprAnswer,
  computeItemFeatures,
  computePageOrderingPattern,
} from "./compute";
import type { PageItem, PageRecord } from "./types";

function makeItem(n: number, expr: PageItem["expr"]): PageItem {
  return {
    n,
    printed: `item ${n}`,
    form: expr ? "horizontal" : null,
    expr,
    responses: [{ position: "after_equals", cue: null, answer: "0", answer_source: "unchecked" }],
  };
}

function makePageWithItems(items: PageItem[]): PageRecord {
  return {
    kind: "page",
    source_ref: "demo:Z:1a",
    topic: { title: "Sample topic" },
    sections: [{ instruction: "Solve.", scaffolds: [], items }],
    examples: [],
    score_bands: [[0, 0], [1, 1], [2, 2], [3, 3], [4, "open"]],
  };
}

describe("computeExprAnswer", () => {
  it("computes addition (2 and 3+ operands), subtraction, multiplication, and division with/without remainder", () => {
    expect(computeExprAnswer({ kind: "arith", op: "add", operands: [17, 8] })).toEqual({
      kind: "single",
      value: "25",
    });
    expect(computeExprAnswer({ kind: "arith", op: "add", operands: [7, 7, 7, 7] })).toEqual({
      kind: "single",
      value: "28",
    });
    expect(computeExprAnswer({ kind: "arith", op: "sub", operands: [302, 47] })).toEqual({
      kind: "single",
      value: "255",
    });
    expect(computeExprAnswer({ kind: "arith", op: "mul", operands: [34, 6] })).toEqual({
      kind: "single",
      value: "204",
    });
    expect(computeExprAnswer({ kind: "arith", op: "div", operands: [45, 5] })).toEqual({
      kind: "single",
      value: "9",
      quotient: 9,
      remainder: 0,
    });
    expect(computeExprAnswer({ kind: "arith", op: "div", operands: [47, 5] })).toEqual({
      kind: "single",
      value: "9 R2",
      quotient: 9,
      remainder: 2,
    });
  });

  it("computes chains, missing values, linked pairs, and word problems with expr", () => {
    expect(
      computeExprAnswer({ kind: "chain", terms: [15, 20, 25, null, null, null] }),
    ).toEqual({
      kind: "multi",
      values: ["30", "35", "40"],
    });

    expect(
      computeExprAnswer({ kind: "missing", op: "mul", operands: [7, null], result: 42 }),
    ).toEqual({
      kind: "single",
      value: "6",
    });

    expect(
      computeExprAnswer({ kind: "missing", op: "add", operands: [null, 13], result: 31 }),
    ).toEqual({
      kind: "single",
      value: "18",
    });

    expect(
      computeExprAnswer({
        kind: "linked",
        pair: [
          { kind: "missing", op: "mul", operands: [6, null], result: 48 },
          { kind: "arith", op: "div", operands: [48, 6] },
        ],
      }),
    ).toEqual({
      kind: "multi",
      values: ["8", "8"],
    });

    expect(
      computeExprAnswer({
        kind: "word",
        text: "Each basket holds 14 pears. How many in 3 baskets?",
        expr: { kind: "arith", op: "mul", operands: [14, 3] },
        unit: "pears",
      }),
    ).toEqual({
      kind: "single",
      value: "42",
    });
  });

  it("returns null for uncomputable expressions (notation, null, unclear, divide by zero, word without expr)", () => {
    expect(computeExprAnswer(null)).toBeNull();
    expect(computeExprAnswer({ kind: "notation", latex: "x^2 + 1" })).toBeNull();
    expect(
      computeExprAnswer({ kind: "arith", op: "div", operands: [12, 0] }),
    ).toBeNull();
    expect(
      computeExprAnswer({ kind: "arith", op: "mul", operands: ["unclear", 4] }),
    ).toBeNull();
    expect(
      computeExprAnswer({
        kind: "word",
        text: "Each tray has 9 cups.",
        expr: "not_stated",
      }),
    ).toBeNull();
  });

  it("returns null for invalid or non-unique missing-value equations such as 0 / [] = 5", () => {
    expect(
      computeExprAnswer({ kind: "missing", op: "div", operands: [0, null], result: 5 }),
    ).toBeNull();
    expect(
      computeExprAnswer({ kind: "missing", op: "div", operands: [0, null], result: 0 }),
    ).toBeNull();
    expect(
      computeExprAnswer({ kind: "missing", op: "mul", operands: [0, null], result: 0 }),
    ).toBeNull();
    expect(
      computeExprAnswer({ kind: "missing", op: "mul", operands: [0, null], result: 5 }),
    ).toBeNull();
    expect(
      computeExprAnswer({ kind: "missing", op: "div", operands: [7, null], result: 2 }),
    ).toBeNull();
  });

  it("keeps the known answer in a linked item when one part is notation", () => {
    expect(
      computeExprAnswer({
        kind: "linked",
        pair: [
          { kind: "arith", op: "mul", operands: [4, 6] },
          { kind: "notation", latex: "y = 4x" },
        ],
      }),
    ).toEqual({
      kind: "multi",
      values: ["24", null],
    });

    expect(
      computeExprAnswer({
        kind: "linked",
        pair: [
          { kind: "notation", latex: "y = 4x" },
          { kind: "arith", op: "add", operands: [9, 5] },
        ],
      }),
    ).toEqual({
      kind: "multi",
      values: [null, "14"],
    });

    expect(
      computeExprAnswer({
        kind: "linked",
        pair: [
          { kind: "notation", latex: "f(x)" },
          { kind: "notation", latex: "g(x)" },
        ],
      }),
    ).toBeNull();
  });

  it("satisfies division identity: quotient * divisor + remainder === dividend", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 1, max: 99 }),
        (dividend, divisor) => {
          const ans = computeExprAnswer({
            kind: "arith",
            op: "div",
            operands: [dividend, divisor],
          });
          expect(ans).not.toBeNull();
          if (ans && ans.kind === "single") {
            expect(ans.quotient).toBeDefined();
            expect(ans.remainder).toBeDefined();
            expect(ans.quotient! * divisor + ans.remainder!).toBe(dividend);
            expect(ans.remainder!).toBeGreaterThanOrEqual(0);
            expect(ans.remainder!).toBeLessThan(divisor);
          }
        },
      ),
    );
  });

  it("satisfies missing-factor round-trip for multiplication", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        (a, b) => {
          const ans = computeExprAnswer({
            kind: "missing",
            op: "mul",
            operands: [a, null],
            result: a * b,
          });
          expect(ans).toEqual({ kind: "single", value: String(b) });
        },
      ),
    );
  });
});

describe("computeItemFeatures", () => {
  it("computes digit counts and exact carry places for addition and multiplication", () => {
    const noCarryMul = computeItemFeatures(
      makeItem(1, { kind: "arith", op: "mul", operands: [31, 2] }),
    );
    expect(noCarryMul.arith?.operand_digits).toEqual([2, 1]);
    expect(noCarryMul.arith?.carries).toEqual([]);
    expect(noCarryMul.arith?.has_carry).toBe(false);

    const onesCarry = computeItemFeatures(
      makeItem(2, { kind: "arith", op: "mul", operands: [27, 3] }),
    );
    expect(onesCarry.arith?.carries).toEqual(["ones_to_tens"]);
    expect(onesCarry.arith?.has_carry).toBe(true);

    const bothCarries = computeItemFeatures(
      makeItem(3, { kind: "arith", op: "mul", operands: [47, 4] }),
    );
    expect(bothCarries.arith?.carries).toEqual(["ones_to_tens", "tens_to_hundreds"]);

    const addCarry = computeItemFeatures(
      makeItem(4, { kind: "arith", op: "add", operands: [68, 7] }),
    );
    expect(addCarry.arith?.carries).toEqual(["ones_to_tens"]);
  });

  it("computes borrow kinds including borrow across zero", () => {
    const plainBorrow = computeItemFeatures(
      makeItem(1, { kind: "arith", op: "sub", operands: [241, 58] }),
    );
    expect(plainBorrow.arith?.borrows).toEqual(["tens_to_ones", "hundreds_to_tens"]);
    expect(plainBorrow.arith?.has_borrow).toBe(true);

    const acrossZero = computeItemFeatures(
      makeItem(2, { kind: "arith", op: "sub", operands: [302, 15] }),
    );
    expect(acrossZero.arith?.borrows).toContain("tens_to_ones");
    expect(acrossZero.arith?.borrows).toContain("borrow_across_zero");
  });

  it("computes remainder flag and repeated operands", () => {
    const withRem = computeItemFeatures(
      makeItem(1, { kind: "arith", op: "div", operands: [38, 5] }),
    );
    expect(withRem.arith?.has_remainder).toBe(true);
    expect(withRem.arith?.operand_digits).toEqual([2, 1]);

    const repAdd = computeItemFeatures(
      makeItem(2, { kind: "arith", op: "add", operands: [7, 7, 7] }),
    );
    expect(repAdd.arith?.repeated_operands).toBe(true);
    expect(repAdd.arith?.operand_count).toBe(3);
  });

  it("computes carries step by step for products of 3 or more factors", () => {
    const triple = computeItemFeatures(
      makeItem(1, { kind: "arith", op: "mul", operands: [19, 8, 2] }),
    );
    expect(triple.arith?.has_carry).toBe(true);
    expect(triple.arith?.carries).toContain("ones_to_tens");
    expect(triple.arith?.carries).toContain("tens_to_hundreds");

    const laterCarry = computeItemFeatures(
      makeItem(2, { kind: "arith", op: "mul", operands: [12, 2, 6] }),
    );
    expect(laterCarry.arith?.has_carry).toBe(true);
    expect(laterCarry.arith?.carries).toContain("ones_to_tens");
    expect(laterCarry.arith?.carries).toContain("tens_to_hundreds");

    const noCarryTriple = computeItemFeatures(
      makeItem(3, { kind: "arith", op: "mul", operands: [3, 2, 1] }),
    );
    expect(noCarryTriple.arith?.has_carry).toBe(false);
    expect(noCarryTriple.arith?.carries).toEqual([]);
  });
});

describe("computePageOrderingPattern", () => {
  it("detects fixed first operand with second stepping by 1", () => {
    const page = makePageWithItems([
      makeItem(1, { kind: "arith", op: "mul", operands: [7, 1] }),
      makeItem(2, { kind: "arith", op: "mul", operands: [7, 2] }),
      makeItem(3, { kind: "arith", op: "mul", operands: [7, 3] }),
      makeItem(4, { kind: "arith", op: "mul", operands: [7, 4] }),
    ]);
    const pattern = computePageOrderingPattern(page);
    expect(pattern.sections[0].kind).toBe("first_fixed_second_stepping");
    expect(pattern.summary).toContain("7");
    expect(pattern.summary).toContain("steps by 1");
  });

  it("detects grouped blocks where first operand holds across runs and second steps", () => {
    const page = makePageWithItems([
      makeItem(1, { kind: "arith", op: "div", operands: [70, 2] }),
      makeItem(2, { kind: "arith", op: "div", operands: [70, 3] }),
      makeItem(3, { kind: "arith", op: "div", operands: [70, 4] }),
      makeItem(4, { kind: "arith", op: "div", operands: [71, 2] }),
      makeItem(5, { kind: "arith", op: "div", operands: [71, 3] }),
    ]);
    const pattern = computePageOrderingPattern(page);
    expect(pattern.sections[0].kind).toBe("grouped_first_fixed_second_stepping");
  });

  it("detects repeated addition with stepping term count", () => {
    const page = makePageWithItems([
      makeItem(1, { kind: "arith", op: "add", operands: [7, 7] }),
      makeItem(2, { kind: "arith", op: "add", operands: [7, 7, 7] }),
      makeItem(3, { kind: "arith", op: "add", operands: [7, 7, 7, 7] }),
    ]);
    const pattern = computePageOrderingPattern(page);
    expect(pattern.sections[0].kind).toBe("repeated_addend_stepping_count");
  });

  it("detects mixed ordering when neither operand is fixed or grouped", () => {
    const page = makePageWithItems([
      makeItem(1, { kind: "arith", op: "mul", operands: [17, 3] }),
      makeItem(2, { kind: "arith", op: "mul", operands: [42, 8] }),
      makeItem(3, { kind: "arith", op: "mul", operands: [29, 5] }),
      makeItem(4, { kind: "arith", op: "mul", operands: [63, 2] }),
    ]);
    const pattern = computePageOrderingPattern(page);
    expect(pattern.sections[0].kind).toBe("mixed");
  });

  it("detects ordering patterns across equal-length operand sequences of 3 or more operands", () => {
    const page = makePageWithItems([
      makeItem(1, { kind: "arith", op: "add", operands: [5, 10, 1] }),
      makeItem(2, { kind: "arith", op: "add", operands: [5, 10, 2] }),
      makeItem(3, { kind: "arith", op: "add", operands: [5, 10, 3] }),
    ]);
    const pattern = computePageOrderingPattern(page);
    expect(pattern.sections[0].kind).toBe("fixed_and_stepping");
    expect(pattern.sections[0].description).not.toBe("mixed expression shapes");
    expect(pattern.sections[0].description).toContain("steps by 1");
  });
});
