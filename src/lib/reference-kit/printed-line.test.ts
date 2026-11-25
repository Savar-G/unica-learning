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
      ["2 + 3 =", { kind: "equation", op: "add", operands: [2, 3], end: "open" }],
      ["1,250 − 3 = ___", { kind: "equation", op: "sub", operands: [1250, 3], end: "open" }],
      ["12 + 5 = □□", { kind: "equation", op: "add", operands: [12, 5], end: "open" }],
      ["17 ÷ 2 = □ R □", { kind: "equation", op: "div", operands: [17, 2], end: "open" }],
      ["2 x 3 =", { kind: "equation", op: "mul", operands: [2, 3], end: "open" }],
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
    for (const form of ["vertical", "bracket"] as const) {
      expect(parsePrintedLine("24 - 5", form)).toEqual({ kind: "equation", op: "sub", operands: [24, 5], end: "none" });
    }
    expect(parsePrintedLine("9) 76", "bracket")).toEqual({ kind: "equation", op: "div", operands: [76, 9], end: "none" });
  });

  it("takes nothing else", () => {
    const notTaken = [
      "24 + 5",
      "3 - 4",
      "3 \u2013 4",
      "2 x 3",
      "2 + \u25A1",
      "2026-11-24",
      "11-24-26",
      "1, ___",
      "9007199254740993 + 1 =",
      "2.0000000000000001 + 3 =",
      "2 + 3 = 9007199254740993",
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

  it("property: no date, range, page number, list number, sentence or read-aloud row is taken", () => {
    const n = fc.integer({ min: 1, max: 999 });
    const day = fc.integer({ min: 1, max: 31 });
    const dash = fc.constantFrom("-", "\u2013", "\u2212", " - ", " \u2013 ");
    const word = fc.constantFrom("Add", "Find", "Read", "the", "numbers", "from", "apples", "and", "in");
    const texts = fc.oneof(
      fc.tuple(day, day, fc.integer({ min: 1, max: 2100 }), fc.constantFrom("-", "/", ".")).map(([d, m, y, sign]) => [d, m, y].join(sign)),
      fc.tuple(fc.integer({ min: 1900, max: 2100 }), day, day, fc.constantFrom("-", "/", ".")).map(([y, m, d, sign]) => [y, m, d].join(sign)),
      fc.tuple(n, dash, n).map((parts) => parts.join("")),
      fc.tuple(fc.constantFrom("", "Page ", "p. ", "- "), n, fc.constantFrom("", " -", "/10")).map((parts) => parts.join("")),
      fc.tuple(fc.constantFrom("(", ""), n, fc.constantFrom(")", ".", ".)")).map((parts) => parts.join("")),
      fc.tuple(n, fc.constantFrom(". ", ") ", ".) "), n, n).map(([i, mark, a, b]) => `${i}${mark}${a} + ${b} =`),
      fc.tuple(word, n, word, fc.constantFrom("+", "-", "\u00D7", "="), n).map((parts) => parts.join(" ")),
      fc.tuple(n, fc.constantFrom("+", "\u00D7"), n, word).map((parts) => parts.join(" ")),
    );
    fc.assert(
      fc.property(texts, fc.constantFrom("horizontal" as const, null, undefined), (text, form) => {
        expect(parsePrintedLine(text, form), text).toBeNull();
      }),
      { numRuns: 1000 },
    );
    // Also in a vertical form, a date is no subtraction.
    for (const date of ["2026-11-24", "11-24-26"]) expect(parsePrintedLine(date, "vertical")).toBeNull();
    const scaffold = { kind: "table_read_aloud" as const, applies_to: [1] };
    fc.assert(
      fc.property(n, n, fc.constantFrom("=", "= \u25A1", "= 5"), (a, b, end) => {
        const row = pageWith({ printed: `${a} \u00D7 ${b} ${end}`, expr: null, form: null });
        row.sections[0].scaffolds = [scaffold];
        expect(findPrintedConflicts(row)).toEqual([]);
      }),
    );
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
    expect(conflictsOf("2 + 3", null, { form: "vertical", responses: [] })).toBe(1);
    expect(conflictsOf("2 + 3 =", null, { form: null, responses: [] })).toBe(1);
    expect(conflictsOf("2 + 3", add(3, 2), { form: "vertical" })).toBe(1);
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
      ["2 + 3 = 5", { kind: "notation", latex: "2 + 3" }],
      ["2 + 3 =", { kind: "notation", latex: "2 + 3 = 5.0" }],
      ["\u25A1 + 3 = 5", { kind: "notation", latex: "\\square + 3 = 5" }],
      ["1,000 + 5 = 1,005", add(1000, 5)],
      ["17 \u00F7 5 = 3.4", arith("div", 17, 5)],
      ["0.5 + 0.25 = 9", add(0.5, 0.25)],
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
      ["a false line", example(["2 + 3 = 99"], [add(2, 3)])],
      ["the result of another part", example(["2 + 3 = 6"], [add(2, 3), arith("mul", 2, 3)])],
      ["no part of two", example(["2 + 2 =", "2 \u00D7 3 ="], [add(2, 2), arith("mul", 2, 2)])],
      ["a line that is not the first step", example(["2 + 3 ="], [arith("mul", 2, 3)], [{ shows: "rule_statement", printed: "Look." }])],
      ["no half of a linked part", example(["2 + 3 ="], [{ kind: "linked", pair: [add(3, 2), arith("mul", 2, 3)] }])],
      ["a vertical part", { ...example(["2 + 3"], [arith("mul", 2, 3)]), parts: [{ form: "vertical", expr: arith("mul", 2, 3) }] }],
    ];
    for (const [label, ex] of stops) expect(count(ex), label).toBe(1);
    const passes: Array<[string, Example]> = [
      ["one part", example(["2 + 3 ="], [add(2, 3)])],
      ["two parts", example(["43 + 43 =", "43 \u00D7 2 ="], [add(43, 43), arith("mul", 43, 2)])],
      ["two parts in the other order", example(["43 \u00D7 2 =", "43 + 43 ="], [add(43, 43), arith("mul", 43, 2)])],
      ["two lines of one part", example(["2 + 3 =", "2 + 3 = 5"], [add(2, 3), arith("mul", 2, 3)])],
      ["a solved line", example(["2 \u00D7 3 = 6"], [missing("mul", [2, null], 6)])],
      ["a half of a linked part", example(["2 + 3 ="], [{ kind: "linked", pair: [add(2, 3), arith("mul", 2, 3)] }])],
      ["a part that the parser cannot take", example(["2 + 3 ="], [arith("mul", 2, 3), { kind: "notation", latex: "\\frac{1}{2}" }])],
      ["a part with no expression", example(["2 + 3 ="], [arith("mul", 2, 3), null])],
      ["an unclear operand", example(["2 + 3 ="], [arith("mul", 2, 3), { kind: "arith", op: "add", operands: [2, "unclear"] }])],
      ["a table", { ...example(["2 + 3 ="], [arith("mul", 2, 3)]), relation: "table" }],
      ["a bare horizontal line", example(["30 + 6"], [arith("mul", 36, 2)])],
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
          const form = end === "" ? ("vertical" as const) : ("horizontal" as const);
          const count = (text: string) => conflictsOf(text, { kind: "arith", op, operands }, { form });
          expect(count(line(operands, signs[op]))).toBe(0);
          const changed = operands.map((n, i) => (i === at % operands.length ? n + delta : n));
          expect(count(line(changed, signs[op]))).toBe(1);
          const otherSign = op === "add" ? signs.mul : signs.add;
          expect(count(line(operands, otherSign))).toBe(1);
          if (op !== "div") {
            const result = { add: (x: number, y: number) => x + y, sub: (x: number, y: number) => x - y, mul: (x: number, y: number) => x * y }[op];
            const value = operands.slice(1, 2).reduce(result, operands[0]);
            const pair = operands.slice(0, 2);
            const solved = (n: number) => `${pair.join(` ${signs[op]} `)} = ${n}`;
            expect(conflictsOf(solved(value), { kind: "arith", op, operands: pair })).toBe(0);
            expect(conflictsOf(solved(value + delta), { kind: "arith", op, operands: pair })).toBe(1);
          }
        },
      ),
    );
  });
});
