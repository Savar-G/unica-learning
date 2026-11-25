import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ArithOp, Example, Expr, PageItem, PageRecord, SimpleExpr } from "@/lib/reference-record";
import { findPrintedConflicts, parsePrintedLine } from "./printed-line";

const add = (...operands: number[]): SimpleExpr => ({ kind: "arith", op: "add", operands });
const arith = (op: ArithOp, ...operands: number[]): SimpleExpr => ({ kind: "arith", op, operands });
const missing = (op: ArithOp, operands: Array<number | null>, result: number | null): Expr => ({
  kind: "missing",
  op,
  operands,
  result,
});

function pageWith(item: Partial<PageItem>, examples: Example[] = []): PageRecord {
  return {
    kind: "page",
    source_ref: "sample:M:3a",
    topic: { title: "Practice" },
    sections: [
      {
        instruction: "Solve.",
        scaffolds: [],
        items: [
          {
            n: 1,
            printed: "Read aloud",
            form: "horizontal",
            expr: null,
            responses: [{ position: "after_equals", cue: null, answer: "1", answer_source: "reader" }],
            ...item,
          },
        ],
      },
    ],
    examples,
    score_bands: "unclear",
  };
}

const conflictsOf = (printed: string, expr: Expr | null, more: Partial<PageItem> = {}): number =>
  findPrintedConflicts(pageWith({ printed, expr, ...more })).length;

describe("parsePrintedLine", () => {
  it("takes one expression with one sign, an optional equals sign with a blank or a number, chains and division brackets", () => {
    const taken: Array<[string, unknown]> = [
      ["24 + 5", { kind: "equation", op: "add", operands: [24, 5], end: "none" }],
      ["2 + 3 =", { kind: "equation", op: "add", operands: [2, 3], end: "open" }],
      ["1,250 − 3 = ___", { kind: "equation", op: "sub", operands: [1250, 3], end: "open" }],
      ["12 + 5 = □□", { kind: "equation", op: "add", operands: [12, 5], end: "open" }],
      ["17 ÷ 2 = □ R □", { kind: "equation", op: "div", operands: [17, 2], end: "open" }],
      ["2 x 3", { kind: "equation", op: "mul", operands: [2, 3], end: "none" }],
      ["4×5=", { kind: "equation", op: "mul", operands: [4, 5], end: "open" }],
      ["0.5 + 1.25 =", { kind: "equation", op: "add", operands: [0.5, 1.25], end: "open" }],
      ["5 - -3 =", { kind: "equation", op: "sub", operands: [5, -3], end: "open" }],
      ["□ + 3 = 8", { kind: "equation", op: "add", operands: [null, 3], end: { value: "8" } }],
      ["17 ÷ 2 = 8 R1", { kind: "equation", op: "div", operands: [17, 2], end: { value: "8 R1" } }],
      ["2, □, 6", { kind: "chain", terms: [2, null, 6] }],
      ["1,000, ___, 1,020", { kind: "chain", terms: [1000, null, 1020] }],
      ["9 → □ → 5", { kind: "chain", terms: [9, null, 5] }],
    ];
    for (const [text, line] of taken) expect(parsePrintedLine(text), text).toEqual(line);
    expect(parsePrintedLine("9) 76", "bracket")).toEqual({ kind: "equation", op: "div", operands: [76, 9], end: "none" });
  });

  it("takes nothing else", () => {
    const notTaken = [
      "Add 2 and 3.",
      "2 + 3 = ?",
      "(1) 2 + 3 =",
      "1. 2 + 3 =",
      "9) 76",
      "2 + 3 - 1 =",
      "2 + 3 × 4 =",
      "(2 + 3) =",
      "1/2 + 1/4 =",
      "6/2 =",
      "1,5 + 2 =",
      "2,50 + 1,25 =",
      "3 cm + 4 cm =",
      "$5 + $3 =",
      "50% + 3 =",
      "2x + 1",
      "3x",
      "x + 1 = 5",
      "2 × 3 = 6 → 6 ÷ 2 = 3",
      "3 × □ = 15    15 ÷ 3 = □",
      "□ + 3",
      "8 = □ + 3",
      "2 + 3 = □ + 1",
      "2 + 3 = 5 apples",
      "5 =",
      "5",
      "□",
      "2, 4, 6",
      "100,200,300",
      "2, □, 6, ...",
      "",
    ];
    for (const text of notTaken) expect(parsePrintedLine(text), text).toBeNull();
  });
});

describe("findPrintedConflicts", () => {
  it("lists a line that says something else than the expression, also a commuted or rewritten form", () => {
    const stops: Array<[string, Expr | null]> = [
      ["2 + 3 =", arith("mul", 2, 3)],
      ["2 + 3 =", add(3, 2)],
      ["5 - 3 =", arith("sub", 3, 5)],
      ["2 × 3 =", arith("mul", 2, 4)],
      ["6 ÷ 2 =", arith("mul", 6, 2)],
      ["2 + 3 + 4 =", add(2, 3)],
      ["1,250 + 3 =", add(125, 3)],
      ["□ + 3 = 8", arith("sub", 8, 3)],
      ["□ + 3 = 8", missing("add", [3, null], 8)],
      ["□ + 3 = 8", missing("add", [null, 3], 9)],
      ["2 + □ = 5", add(2, 3)],
      ["2 × 3 = 6", add(2, 3)],
      ["2 × 3 = 6", missing("mul", [2, null], 8)],
      ["2, □, 6", { kind: "chain", terms: [2, null, 8], step: 2 }],
      ["2, □, 6", add(2, 6)],
      ["2 + 3 =", { kind: "linked", pair: [add(2, 3), add(3, 2)] }],
      ["2 + 3 =", { kind: "word", text: "Add.", expr: arith("mul", 2, 3) }],
      ["2 + 3 =", { kind: "word", text: "Add.", expr: null }],
      ["2 + 3 =", { kind: "notation", latex: "2 \\times 3" }],
      ["□ - 3 = 8", null],
    ];
    for (const [printed, expr] of stops) expect(conflictsOf(printed, expr), `${printed} | ${JSON.stringify(expr)}`).toBe(1);
    expect(conflictsOf("9) 76", arith("div", 9, 76), { form: "bracket" })).toBe(1);
    expect(conflictsOf("2 + 3", null)).toBe(1);
  });

  it("passes a line that says the same, and every line or expression that the parser does not take", () => {
    const passes: Array<[string, Expr | null]> = [
      ["2 + 3 =", add(2, 3)],
      ["2 + 3 = □", missing("add", [2, 3], null)],
      ["43 × 2", arith("mul", 43, 2)],
      ["1,250 - 3 =", arith("sub", 1250, 3)],
      ["□ + 3 = 8", missing("add", [null, 3], 8)],
      ["2 × 3 = 6", missing("mul", [2, null], 6)],
      ["2 × 3 = 6", arith("mul", 2, 3)],
      ["17 ÷ 2 = □ R □", arith("div", 17, 2)],
      ["2, □, 6", { kind: "chain", terms: [2, null, 6], step: 2 }],
      ["2, □, 6", { kind: "chain", terms: [2, null, 6] }],
      ["2 + 3 =", { kind: "word", text: "Add.", expr: add(2, 3) }],
      ["2 + 3 =", { kind: "word", text: "Add.", expr: "unclear" }],
      ["2 + 3 =", { kind: "notation", latex: "2+3" }],
      ["2 + 3 =", { kind: "arith", op: "unclear", operands: [2, 3] }],
      ["2 + 3 =", { kind: "arith", op: "add", operands: [2, "unclear"] }],
      ["2 + 3 =", { kind: "notation", latex: "\\frac{2}{3}" }],
      ["Add 2 and 3.", arith("mul", 2, 3)],
      ["1,5 + 2 =", add(1, 2)],
      ["3 cm + 4 cm =", arith("mul", 3, 4)],
      ["2 + 3 - 1 =", add(2, 3)],
      ["unclear", add(2, 3)],
    ];
    for (const [printed, expr] of passes) expect(conflictsOf(printed, expr), `${printed} | ${JSON.stringify(expr)}`).toBe(0);
    expect(conflictsOf("9) 76", arith("div", 76, 9), { form: "bracket" })).toBe(0);
    // A row of a table that is read aloud is no question.
    const checkbox = { position: "checkbox" as const, cue: null, answer: null, answer_source: "unchecked" as const };
    expect(conflictsOf("2 × 3 = 6", null, { form: null, responses: [checkbox] })).toBe(0);
    expect(conflictsOf("Read the table aloud.", null, { form: null, responses: [checkbox] })).toBe(0);
  });

  it("compares the setup steps of a worked example with its parts", () => {
    const example = (setups: string[], exprs: Array<Expr | null>, first: Array<{ shows: "rule_statement"; printed: string }> = []): Example => ({
      position: "top",
      relation: "compare",
      parts: exprs.map((expr) => ({ form: "horizontal", expr })),
      steps: [...first, ...setups.map((printed) => ({ shows: "setup" as const, printed }))].map((s, i) => ({ ...s, n: i + 1 })),
    });
    const count = (ex: Example) => findPrintedConflicts(pageWith({}, [ex])).length;
    const stops: Array<[string, Example]> = [
      ["one part", example(["2 + 3 ="], [arith("mul", 2, 3)])],
      ["second of two parts", example(["2 + 2", "2 × 3"], [add(2, 2), arith("mul", 2, 2)])],
      ["two lines of one part", example(["2 + 3", "2 + 3"], [add(2, 3), arith("mul", 2, 3)])],
      ["first line of a longer working", example(["2 + 3", "20 + 1", "30 + 1"], [arith("mul", 2, 3)])],
    ];
    for (const [label, ex] of stops) expect(count(ex), label).toBe(1);
    const passes: Array<[string, Example]> = [
      ["one part", example(["2 + 3 ="], [add(2, 3)])],
      ["two parts", example(["43 + 43", "43 × 2"], [add(43, 43), arith("mul", 43, 2)])],
      ["later setup lines of one part", example(["36 × 2", "30 + 6"], [arith("mul", 36, 2)])],
      ["a setup line that is not the first line", example(["30 + 6", "6 + 6"], [arith("mul", 36, 2)], [{ shows: "rule_statement", printed: "Split the tens." }])],
      ["a solved line", example(["2 × 3 = 6"], [missing("mul", [2, null], 6)])],
      ["a part that the parser cannot take", example(["2 + 3"], [{ kind: "notation", latex: "\\frac{1}{2}" }])],
      ["a part with no expression", example(["2 + 3"], [null])],
      ["words", example(["Start with 2 + 3"], [arith("mul", 2, 3)])],
    ];
    for (const [label, ex] of passes) expect(count(ex), label).toBe(0);
  });

  it("property: the line of an expression passes in every printed form, and one changed operand or sign never does", () => {
    const signs: Record<ArithOp, string> = { add: "+", sub: "−", mul: "×", div: "÷" };
    const number = fc.integer({ min: 0, max: 99999 });
    fc.assert(
      fc.property(
        fc.constantFrom<ArithOp>("add", "sub", "mul", "div"),
        fc.array(number, { minLength: 2, maxLength: 4 }),
        fc.constantFrom("", " =", " = □", " = ___", "="),
        fc.boolean(),
        fc.nat(),
        fc.integer({ min: 1, max: 9 }),
        (op, drawn, end, grouped, at, delta) => {
          const operands = op === "div" ? drawn.slice(0, 2) : drawn;
          const line = (ns: number[], sign: string) =>
            ns.map((n) => (grouped ? n.toLocaleString("en-US") : String(n))).join(` ${sign} `) + end;
          expect(conflictsOf(line(operands, signs[op]), { kind: "arith", op, operands })).toBe(0);
          const changed = operands.map((n, i) => (i === at % operands.length ? n + delta : n));
          expect(conflictsOf(line(changed, signs[op]), { kind: "arith", op, operands })).toBe(1);
          const otherSign = op === "add" ? signs.mul : signs.add;
          expect(conflictsOf(line(operands, otherSign), { kind: "arith", op, operands })).toBe(1);
        },
      ),
    );
  });
});
