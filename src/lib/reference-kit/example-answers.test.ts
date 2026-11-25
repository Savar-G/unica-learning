import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Example, ExamplePart, ExampleStep, Expr, PageRecord, SimpleExpr } from "@/lib/reference-record";
import { findExampleAnswerConflicts } from "./example-answers";

const add = (...operands: number[]): SimpleExpr => ({ kind: "arith", op: "add", operands });
const div = (a: number, b: number): SimpleExpr => ({ kind: "arith", op: "div", operands: [a, b] });
const chain = (terms: Array<number | null>, step?: number): SimpleExpr => ({
  kind: "chain",
  terms,
  ...(step === undefined ? {} : { step }),
});
const notation: SimpleExpr = { kind: "notation", latex: "x + 1" };
const part = (expr: Expr | null, shown?: string): ExamplePart => ({ form: "horizontal", expr, shown_answer: shown });
const steps = (...list: Array<[ExampleStep["shows"], string | null]>): ExampleStep[] =>
  list.map(([shows, printed], i) => ({ n: i + 1, shows, printed }));

function conflicts(parts: ExamplePart[], stepList: Example["steps"] = []): string[] {
  const page: PageRecord = {
    kind: "page",
    source_ref: "sample:M:3a",
    topic: { title: "Practice" },
    sections: [],
    examples: [{ position: "top", relation: "sequence", parts, steps: stepList }],
    score_bands: "unclear",
  };
  const before = structuredClone(page);
  const found = findExampleAnswerConflicts(page);
  expect(page).toEqual(before);
  return found.map((note) => note.message);
}

describe("findExampleAnswerConflicts", () => {
  it("checks a shown answer of an expression with more than one value wherever code can compute each value", () => {
    const pair: Expr = { kind: "linked", pair: [add(2, 3), div(17, 2)] };
    const passes: Array<[Expr, string]> = [
      [chain([2, null, 6], 2), "4"],
      [chain([2, null, 6]), "2, 4, 6"],
      [chain([9, null, 5], -2), "7"],
      [chain([9, null, null, 3], -2), "7, 5"],
      [chain([2, null, 6, null], 2), "4 and 8"],
      [chain([2, null, 6, null], 2), "4 8"],
      [chain([2, null, 6, null], 2), "2 → 4 → 6 → 8"],
      [chain([2, null, 6, null], 2), "8"],
      [chain([2, null, 6, null], 2), "04"],
      [pair, "5"],
      [chain([990, null, 1010], 10), "1,000"],
      [chain([null, null, 300], 100), "100,200"],
      [chain([2, null, -2], -2), "0"],
      [chain([2, null, null, -4], -2), "0, −2"],
      [pair, "5, 8 R1"],
      [pair, "5 and 8r1"],
      [{ kind: "word", text: "Count on.", expr: chain([2, null, 6], 2) }, "4"],
      // Code cannot compute or read these.
      [chain([2, null, 7], 2), "99"],
      [chain([null, 5]), "99"],
      [chain([2, "unclear" as never, null]), "99"],
      [{ kind: "linked", pair: [add(2, 3), notation] }, "99"],
      [notation, "99"],
      [chain([2, null, 6], 2), "4 apples"],
      [chain([2, null, 6], 2), "count by twos"],
    ];
    for (const [expr, shown] of passes) expect(conflicts([part(expr, shown)]), `${JSON.stringify(expr)} ${shown}`).toEqual([]);

    const stops: Array<[Expr, string, string]> = [
      [chain([2, null, 6], 2), "99", "4"],
      [chain([2, null, 6, null], 2), "4, 9", "4, 8"],
      [chain([2, null, 6, null], 2), "5 and 8", "4, 8"],
      [chain([2, null, 6, null], 2), "4, 6", "4, 8"],
      [chain([2, null, 6, null], 2), "2, 4, 6, 9", "4, 8"],
      [chain([2, null, 6, null], 2), "99", "4, 8"],
      [chain([2, null, 6, null], 2), "6", "4, 8"],
      [chain([2, null, 6, null], 2), "2, 4, 6", "4, 8"],
      [pair, "8 R2", "5, 8 R1"],
      [chain([2, null, 6, null], 2), "8, 4", "4, 8"],
      [chain([9, null, 5], -2), "11", "7"],
      [chain([990, null, 1010], 10), "1,001", "1000"],
      [pair, "5, 8 R2", "5, 8 R1"],
      [pair, "6, 8 R1", "5, 8 R1"],
      [{ kind: "word", text: "Count on.", expr: chain([2, null, 6], 2) }, "5", "4"],
    ];
    for (const [expr, shown, computed] of stops) {
      expect(conflicts([part(expr, shown)]), shown).toEqual([
        `examples[0].parts[0].shown_answer: shown "${shown}", computed "${computed}"`,
      ]);
    }
    expect(conflicts([part(add(2, 3), "5"), part(chain([2, null, 6], 2), "99")])).toHaveLength(1);
  });

  it("compares answer and remainder steps with the computed answer of a part", () => {
    const passes: Array<[string, ExamplePart[], ExampleStep[]]> = [
      ["right value", [part(add(2, 3), "5")], steps(["setup", "2 + 3"], ["answer", "5"])],
      ["in another form", [part(add(500, 500))], steps(["answer", " 1,000 "])],
      ["after an equals sign", [part(add(2, 3))], steps(["answer", "= 5"])],
      ["as an equation", [part(add(2, 3))], steps(["answer", "2 + 3 = 5"])],
      ["another equation with that value", [part(add(2, 3, 4))], steps(["answer", "5 + 4 = 9"])],
      ["a filled missing number", [part({ kind: "missing", op: "add", operands: [null, 3], result: 8 })], steps(["answer", "5 + 3 = 8"])],
      ["a negative value", [part({ kind: "arith", op: "sub", operands: [3, 5] })], steps(["answer", "−2"])],
      ["quotient with remainder", [part(div(17, 2))], steps(["answer", "8 r 1"], ["remainder", "1"])],
      ["quotient, then remainder", [part(div(17, 2))], steps(["answer", "8"], ["remainder", "R1"])],
      ["remainder as a difference", [part(div(17, 2))], steps(["remainder", "17 − 16 = 1"], ["remainder", "8 R1"])],
      ["remainder forms", [part(div(17, 2))], steps(["remainder", "R 1"], ["remainder", "r1"], ["remainder", "R = 1"], ["remainder", "1 = 1"], ["answer", "R1"])],
      ["equal numbers", [part(add(2, 3))], steps(["answer", "05"], ["answer", "5.0"], ["answer", "5 = 5"])],
      ["words at a remainder", [part(div(17, 2))], steps(["remainder", "Remainder 9"])],
      ["no remainder", [part(div(16, 2))], steps(["remainder", "0"])],
      ["chain values step by step", [part(chain([2, null, 6, null], 2))], steps(["answer", "4"], ["answer", "8"])],
      ["several parts", [part(add(2, 3)), part(add(4, 4))], steps(["answer", "5"], ["answer", "8"])],
      ["partial working of other kinds", [part(add(2, 3))], steps(["partial_sum", "99"], ["carry", "1"], ["check", "6"], ["subtract", "7"])],
      ["no number", [part(add(2, 3))], steps(["answer", "The answer."], ["answer", null], ["remainder", "none"])],
      ["with a unit or words", [part(add(2, 3))], steps(["answer", "6 cm"], ["answer", "Ans. 6"])],
      ["a fraction or a decimal of a division", [part(div(17, 2))], steps(["answer", "8 1/2"], ["answer", "8.5"])],
      ["a remainder step of a sum", [part(add(2, 3))], steps(["remainder", "9"])],
      ["notation", [part(notation, "7")], steps(["answer", "99"])],
      ["the answer of a part that code cannot compute", [part(add(2, 3), "5"), part(notation, "x = 7")], steps(["answer", "7"])],
      ["a part that code cannot compute and that shows no answer", [part(add(2, 3), "5"), part(notation)], steps(["answer", "99"])],
      ["a word problem that code cannot compute", [part({ kind: "word", text: "Share 17.", expr: div(17, 2) }, "8.5")], steps(["answer", "9"])],
      ["no readable steps", [part(add(2, 3))], "unclear" as never],
    ];
    for (const [label, parts, list] of passes) expect(conflicts(parts, list), label).toEqual([]);

    const stops: Array<[string, ExamplePart[], ExampleStep[], string]> = [
      ["wrong beside a right shown answer", [part(add(2, 3), "5")], steps(["answer", "6"]), 'step prints "6", computed "5"'],
      ["far off", [part(add(2, 3))], steps(["answer", "99"]), 'step prints "99", computed "5"'],
      ["after an equals sign", [part(add(2, 3))], steps(["answer", "= 6"]), 'step prints "= 6", computed "5"'],
      ["as an equation", [part(add(2, 3))], steps(["answer", "2 + 3 = 6"]), 'computed "5" for its left side'],
      ["an equation that is false", [part(add(2, 3))], steps(["answer", "4 + 3 = 5"]), 'step prints "4 + 3 = 5", computed "7" for its left side'],
      ["a false equation in a remainder step", [part(div(17, 2))], steps(["remainder", "17 - 16 = 2"]), 'computed "1" for its left side'],
      ["two sides", [part(add(2, 3))], steps(["answer", "5 = 99"]), 'computed "5"'],
      ["a remainder with its letter and sign", [part(div(17, 2))], steps(["remainder", "R = 2"]), 'computed remainder "1"'],
      ["a remainder in an answer step", [part(div(17, 2))], steps(["answer", "r9"]), 'computed remainder "1"'],
      ["a printed term of a chain", [part(chain([2, null, 6], 2), "4")], steps(["answer", "6"]), 'computed "4"'],
      ["a decimal for a whole answer", [part(add(2, 3))], steps(["answer", "5.5"]), 'computed "5"'],
      ["a wrong remainder", [part(div(17, 2), "8 R1")], steps(["answer", "8"], ["remainder", "2"]), 'step prints "2", computed remainder "1"'],
      ["the quotient as the remainder of an exact division", [part(div(16, 2), "8")], steps(["remainder", "8"]), 'computed remainder "0"'],
      ["a wrong remainder with its letter", [part(div(17, 2))], steps(["remainder", "R 2"]), 'computed remainder "1"'],
      ["a wrong remainder in the answer", [part(div(17, 2))], steps(["answer", "8 R2"]), 'computed "8 R1"'],
      ["a chain", [part(chain([2, null, 6], 2), "4")], steps(["answer", "5"]), 'computed "4"'],
      ["beside a part that shows another answer", [part(add(2, 3), "5"), part(notation, "3/4")], steps(["answer", "99"]), 'computed "5"'],
      ["beside a part with no question", [part(add(2, 3), "5"), part(null)], steps(["answer", "99"]), 'computed "5"'],
      ["no answer of any of the parts", [part(add(2, 3)), part(add(4, 4))], steps(["answer", "7"]), 'computed "5" or "8"'],
    ];
    for (const [label, parts, list, text] of stops) {
      const found = conflicts(parts, list);
      expect(found, label).toHaveLength(1);
      expect(found[0], label).toContain(text);
      expect(found[0], label).toMatch(/^examples\[0\]\.steps\[n=\d\]\.printed: /);
    }
  });

  it("checks an example that stores its question as notation or not at all by its one setup line", () => {
    const shown = (expr: Expr | null, answer: string, ...lines: string[]): number =>
      conflicts([part(expr, answer)], steps(...lines.map((l): [ExampleStep["shows"], string] => ["setup", l]))).length;
    const two: SimpleExpr = { kind: "notation", latex: "2 + 3" };
    expect([shown(null, "99", "2 + 3 ="), shown(two, "99", "2 + 3 ="), shown(null, "99", "2, \u25A1, 6")]).toEqual([1, 1, 1]);
    const passes: Array<[Expr | null, string, ...string[]]> = [
      [null, "5", "2 + 3 ="],
      [two, "5", "2 + 3 = 5"],
      [null, "five", "2 + 3 ="],
      [null, "99", "Add 2 and 3."],
      [null, "99", "2 + 3 =", "4 + 5 ="],
      [null, "3 2/5", "17 \u00F7 5 ="],
      [notation, "99", "2 + 3 ="],
      [two, "99"],
    ];
    for (const [expr, answer, ...lines] of passes) expect(shown(expr, answer, ...lines), `${answer} ${lines.join()}`).toBe(0);
  });

  it("property: a right chain and right steps pass, and one changed value is always listed", () => {
    const whole = fc.integer({ min: 0, max: 9999 });
    fc.assert(
      fc.property(whole, fc.integer({ min: -50, max: 50 }), fc.uniqueArray(fc.integer({ min: 1, max: 5 }), { minLength: 1, maxLength: 2 }), fc.integer({ min: 1, max: 9 }), (start, step, blanks, delta) => {
        const full = Array.from({ length: 6 }, (_, i) => start + i * step);
        const expr = chain(full.map((v, i) => (blanks.includes(i) ? null : v)), step);
        const values = full.filter((_, i) => blanks.includes(i));
        const shown = values.join(", ");
        expect(conflicts([part(expr, shown)], steps(...values.map((v): [ExampleStep["shows"], string] => ["answer", String(v)])))).toEqual([]);
        for (const at of values.keys()) {
          const wrong = values.map((v, i) => (i === at ? v + delta : v));
          expect(conflicts([part(expr, wrong.join(", "))])).toHaveLength(1);
        }
      }),
    );
    fc.assert(
      fc.property(whole, fc.integer({ min: 1, max: 99 }), fc.integer({ min: 1, max: 9 }), (a, b, delta) => {
        const q = Math.floor(a / b);
        const r = a % b;
        const value = r === 0 ? String(q) : `${q} R${r}`;
        expect(conflicts([part(div(a, b), value)], steps(["answer", value], ["answer", String(q)], ["remainder", String(r)]))).toEqual([]);
        expect(conflicts([part(div(a, b))], steps(["remainder", String(r + delta)]))).toHaveLength(1);
        expect(conflicts([part(add(a, b))], steps(["answer", String(a + b + delta)]))).toHaveLength(1);
      }),
      { numRuns: 1000 },
    );
  });
});
