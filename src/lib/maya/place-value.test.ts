// B1a: the place-value derivation and the template evaluator, through their public interfaces. Synthetic numbers only.
import { describe, expect, it } from "vitest";
import { compileExpression, formatValue, EvaluationBudget } from "@/lib/workbook-curriculum/expression";
import { checkQuestionPackage, type QuestionPackage } from "@/lib/question-package";
import { evaluate, placeValueOf, type ExprValue } from "./place-value";
import { storedPlaceValue, zeroPrinted, ZERO_DERIVED, type PlaceValueVariant } from "@/lib/maya-teaching/place-value-samples";
import { placeValueTeachingPackage } from "@/lib/maya-teaching/place-value";

const int = (n: number | bigint): ExprValue => ({ num: BigInt(n), den: BigInt(1) });
const names = (o: Record<string, number>) => new Map(Object.entries(o).map(([k, v]) => [k, int(v)] as const));
/** As the generator's evaluator writes a value: Python's True and False for booleans. */
const text = (v: ExprValue): string => (typeof v === "object" ? (v.den === BigInt(1) ? v.num.toString() : `${v.num}/${v.den}`) : typeof v === "boolean" ? (v ? "True" : "False") : v);

/** A small seeded random number source, so the property tests are the same each run. */
function seeded(seed: number) {
  let x = seed >>> 0;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

describe("the template evaluator", () => {
  const SHAPES = [
    "n // 1000 % 10", "n // 10000 % 10 * 10000", "n % 10", ZERO_DERIVED, "'0' not in str(n)", "'0' in str(n)",
    "n0 - n0 // (10 ** (1 + n0 % 4)) % 10 * 10 ** (1 + n0 % 4)", "n // 100 % 10 * 100 + n // 10 % 10 * 10", "n >= 50000 and not n > 98899",
  ];
  it("agrees with the generator's evaluator on random numbers, for every expression shape the templates use", () => {
    const random = seeded(7);
    for (let i = 0; i < 400; i++) {
      const n = 10000 + Math.floor(random() * 990000);
      for (const shape of SHAPES) {
        const mine = evaluate(shape, names({ n, n0: n }));
        const budget = new EvaluationBudget();
        const reference = compileExpression(shape, budget).evaluate({ n: BigInt(n), n0: BigInt(n) }, budget);
        expect("value" in mine ? text(mine.value) : mine.refused).toBe(formatValue(reference, budget));
      }
    }
  });

  it("reads round() and true division exactly, half to even", () => {
    expect(evaluate("round(w + p / 10, 1)", names({ w: 5, p: 8 }))).toEqual({ value: { num: BigInt(29), den: BigInt(5) } });
    expect(evaluate("round(5 / 2, 0)", names({}))).toEqual({ value: int(2) });
    expect(evaluate("round(7 / 2, 0)", names({}))).toEqual({ value: int(4) });
  });

  it("refuses every token outside the grammar, and never runs it", () => {
    for (const bad of ["__import__('os')", "n.real", "n[0]", "2 ** 99", "open('x')", "n if n else", "lambda: 1", "n; n", "n @ 2", "`n`", "1e9", "n // 0", "x", "n ** -1"]) {
      expect(evaluate(bad, names({ n: 12345 }))).toHaveProperty("refused");
    }
    expect(evaluate("n" + " + n".repeat(150), names({ n: 1 }))).toHaveProperty("refused");
  });
});

const VARIANTS: { variant: PlaceValueVariant; place: "tens" | "hundreds" | "thousands" | "ten thousands" | "hundred thousands"; ask: "digit" | "value" }[] = [
  { variant: "1.1", place: "thousands", ask: "digit" }, { variant: "1.2", place: "ten thousands", ask: "value" }, { variant: "1.3", place: "hundreds", ask: "value" },
  { variant: "2.1", place: "hundred thousands", ask: "digit" }, { variant: "2.2", place: "ten thousands", ask: "value" }, { variant: "2.3", place: "thousands", ask: "value" },
  { variant: "3.1", place: "thousands", ask: "digit" }, { variant: "3.2", place: "hundreds", ask: "value" }, { variant: "3.3", place: "tens", ask: "value" },
];
const n0For = (variant: string) => (variant[0] === "1" ? 53172 : 785243);

describe("placeValueOf: the four agreements", () => {
  for (const { variant, place, ask } of VARIANTS) {
    it(`derives a ${ask} question from template ${variant}`, () => {
      const stored = storedPlaceValue({ variant, n0: n0For(variant), place });
      expect(checkQuestionPackage(stored).status).toBe("checked");
      const o = placeValueOf(stored);
      const n = variant[0] === "3" ? zeroPrinted(n0For(variant)) : n0For(variant);
      const k = { tens: 1, hundreds: 2, thousands: 3, "ten thousands": 4, "hundred thousands": 5 }[place];
      const digit = Math.floor(n / 10 ** k) % 10;
      expect(o).toEqual({ number: n, ask, place, answer: ask === "digit" ? digit : digit * 10 ** k });
    });
  }

  it("reads the short value form and the story form", () => {
    expect(placeValueOf(storedPlaceValue({ variant: "3.2", n0: 467891, place: "hundreds", form: "short" }))).toMatchObject({ ask: "value", place: "hundreds" });
    expect(placeValueOf(storedPlaceValue({ variant: "1.3", n0: 61847, place: "hundreds", name: "Mo", sign: "the bus stop" }))).toMatchObject({ number: 61847, answer: 800 });
  });

  it("teaches the printed number, not the slot, where derived changes it", () => {
    let changed = 0;
    for (const n0 of [467891, 523416, 918273, 645372, 382915, 271849]) {
      const stored = storedPlaceValue({ variant: "3.1", n0, place: "thousands" });
      const o = placeValueOf(stored);
      if (zeroPrinted(n0) !== n0) changed++;
      expect(o).toMatchObject({ number: zeroPrinted(n0) });
    }
    expect(changed).toBeGreaterThan(3);
  });

  it("holds a question when any one agreement fails", () => {
    const base = storedPlaceValue({ variant: "1.1", n0: 53172, place: "thousands" });
    const tamper = (f: (p: QuestionPackage & { item: { checks: { source: Record<string, unknown> }[]; regions: { answer: unknown }[] } }) => void) => {
      const p = structuredClone(base) as never;
      f(p);
      return placeValueOf(p);
    };
    expect(tamper((p) => (p.templateId = "5.1-place-value-million#1.5:true-false"))).toHaveProperty("held");
    expect(tamper((p) => (p.templateId = "5.1-place-value-million#1.2:bare"))).toHaveProperty("held");
    expect(tamper((p) => (p.text = "In 53172, which digit is in the thousands place? Explain."))).toHaveProperty("held");
    expect(tamper((p) => (p.text = "In 53172, which digit is in the hundreds place?"))).toHaveProperty("held");
    expect(tamper((p) => (p.text = "In 53178, which digit is in the thousands place?"))).toHaveProperty("held");
    expect(tamper((p) => (p.item.checks[0].source.answer = "n // 100 % 10"))).toHaveProperty("held");
    expect(tamper((p) => (p.item.checks[0].source.answer = "n // 1000 % 10 + 0"))).toHaveProperty("held");
    expect(tamper((p) => (p.item.checks[0].source.derived = [["n", "n0 + 1"]]))).toHaveProperty("held");
    expect(tamper((p) => (p.item.regions[0].answer = { type: "number", value: 4 }))).toHaveProperty("held");
    expect(tamper((p) => (p.item.checks[0].source.derived = [["n", "__import__('os')"]]))).toHaveProperty("held");
  });

  it("finds a zero answer", () => {
    const stored = storedPlaceValue({ variant: "3.2", n0: 402561, place: "ten thousands" });
    expect(placeValueOf(stored)).toMatchObject({ number: 402561, answer: 0 });
  });
});

describe("placeValueTeachingPackage", () => {
  it("adds only the teaching fields, and the package checks", () => {
    const stored = storedPlaceValue({ variant: "2.2", n0: 785243, place: "ten thousands" });
    const made = placeValueTeachingPackage(stored);
    if (!("package" in made)) throw new Error(made.held);
    const p = made.package;
    expect(checkQuestionPackage(p).status).toBe("checked");
    expect(p.operation).toEqual({ kind: "place-value", operands: [785243], ask: "value", place: "ten thousands" });
    expect(p.answer?.value).toEqual({ type: "number", value: 80000 });
    expect(p.steps.map((s) => s.kind)).toEqual(["read-digit", "result"]);
    for (const k of Object.keys(stored) as (keyof QuestionPackage)[]) {
      if (!["operation", "answer", "steps", "wrongAnswers", "easierExample"].includes(k)) expect(p[k]).toEqual(stored[k]);
    }
    // The easier example: same ask, fewer digits, never the question's digit or answer.
    expect(p.easierExample?.operation).toMatchObject({ kind: "place-value", ask: "value" });
    expect(String((p.easierExample!.operation.operands as number[])[0]).length).toBeLessThanOrEqual(3);
    expect(p.easierExample!.answer).not.toEqual(p.answer!.value);
    expect(p.wrongAnswers.map((w) => (w.value as { value: number }).value)).toEqual(expect.arrayContaining([8, 800000, 8000]));
  });

  it("gives a value question whose place is worth the answer an example in another place", () => {
    const made = placeValueTeachingPackage(storedPlaceValue({ variant: "1.3", n0: 53172, place: "hundreds" }));
    if (!("package" in made)) throw new Error(made.held);
    expect(made.package.answer?.value).toEqual({ type: "number", value: 100 });
    expect(made.package.easierExample?.operation).toMatchObject({ place: "tens" });
  });
});
