import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { tokenText, type FlowToken } from "../contract";
import { choosePhrasing, fill } from "./fill";
import { readExpr, solve, type Expr } from "./solver";
import type { DefinedQuestion, RegionPack, Scenario } from "./types";

const slot = (name: string): Expr => ({ slot: name });
const op = (o: "+" | "-" | "×" | "÷", left: Expr, right: Expr): Expr => ({ op: o, left, right });
const HALF: Expr = { fraction: [1, 2] };

describe("the solver of a defined question", () => {
  it("works each operation out step by step, from the inside", () => {
    expect(solve(op("-", op("×", slot("groups"), slot("each")), slot("taken")), { groups: 4, each: 6, taken: 5 })).toEqual({ ok: true, value: 19, lines: ["4 × 6 = 24", "24 - 5 = 19"] });
    expect(solve(op("+", slot("a"), { number: 10 }), { a: 7 })).toEqual({ ok: true, value: 17, lines: ["7 + 10 = 17"] });
    expect(solve(op("÷", slot("a"), slot("b")), { a: 24, b: 4 })).toEqual({ ok: true, value: 6, lines: ["24 ÷ 4 = 6"] });
  });

  it("multiplies a fraction exactly, and prints it as one character", () => {
    expect(solve(op("×", HALF, slot("count")), { count: 18 })).toEqual({ ok: true, value: 9, lines: ["½ × 18 = 9"] });
    expect(solve(op("×", slot("count"), { fraction: [3, 4] }), { count: 8 })).toEqual({ ok: true, value: 6, lines: ["8 × ¾ = 6"] });
  });

  it.each<[string, Expr, Record<string, number>, RegExp]>([
    ["a half of an odd number", op("×", HALF, slot("count")), { count: 7 }, /½ × 7 is not a whole number/],
    ["a division that leaves something", op("÷", slot("a"), slot("b")), { a: 7, b: 2 }, /7 ÷ 2 is not a whole number/],
    ["a division by zero", op("÷", slot("a"), slot("b")), { a: 7, b: 0 }, /7 ÷ 0 divides by zero/],
    ["a negative result", op("-", slot("a"), slot("b")), { a: 3, b: 5 }, /3 - 5 is less than zero/],
    ["a negative step inside", op("+", op("-", slot("a"), slot("b")), { number: 9 }), { a: 3, b: 5 }, /3 - 5 is less than zero/],
    ["a result that is too large to stay exact", op("×", op("×", op("×", op("×", slot("a"), slot("a")), slot("a")), slot("a")), slot("a")), { a: 9999 }, /is too large/],
  ])("refuses %s", (_name, expr, values, problem) => {
    const result = solve(expr, values);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toMatch(problem);
  });

  it("gives the same value as plain arithmetic for any whole numbers that it accepts", () => {
    fc.assert(fc.property(fc.nat(500), fc.nat(500), fc.nat(50), (a, b, c) => {
      const result = solve(op("-", op("+", slot("a"), slot("b")), slot("c")), { a, b, c });
      expect(result.ok).toBe(a + b - c >= 0);
      if (result.ok) expect(result.value).toBe(a + b - c);
    }));
  });

  it.each<[string, unknown, RegExp]>([
    ["an unknown slot", { slot: "boxes" }, /the slot "boxes" is not a slot of the question/],
    ["an unknown operation", { op: "^", left: { number: 2 }, right: { number: 3 } }, /"\^" is no operation: use \+, -, × or ÷/],
    ["a fraction that the fonts cannot print", { op: "×", left: { fraction: [1, 3] }, right: { slot: "a" } }, /the fraction 1\/3 cannot be printed: use 1\/2, 1\/4 or 3\/4/],
    ["a fraction of strings", { op: "×", left: { fraction: ["1", "2"] }, right: { slot: "a" } }, /cannot be printed/],
    ["a malformed fraction object", { op: "×", left: { fraction: { toString: null, valueOf: null } }, right: { slot: "a" } }, /a fraction must be a pair of whole numbers/],
    ["a fraction outside a multiplication", { op: "+", left: { fraction: [1, 2] }, right: { slot: "a" } }, /a fraction may only be multiplied/],
    ["a fraction alone", { fraction: [1, 2] }, /a fraction may only be multiplied/],
    ["a number that is not whole", { op: "+", left: { number: 2.5 }, right: { slot: "a" } }, /a number must be a whole number from 0 to 1000/],
    ["code in place of a formula", "a + 1", /a formula must be a slot, a number, a fraction or an operation/],
    ["a formula that is too deep", [1, 2, 3, 4, 5].reduce<unknown>((e) => ({ op: "+", left: e, right: { number: 1 } }), { slot: "a" }), /the formula has more than 4 operations/],
    ["a field more", { slot: "a", note: "x" }, /a formula must be a slot, a number, a fraction or an operation/],
  ])("does not read %s", (_name, raw, problem) => {
    const read = readExpr(raw, ["a"]);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.problem).toMatch(problem);
  });
});

const words = (text: string) => text.split(" ").map((w) => (w.startsWith("=") ? { math: w.slice(1) } : { word: w }));
const QUESTION: DefinedQuestion = {
  id: "ribbon-cut", scenarioKind: "measure", regions: null, unit: "[unit.length]", difficulty: 2,
  slots: { length: { min: 25, max: 90, multipleOf: 1 }, cut: { min: 5, max: 19, multipleOf: 1 } },
  solver: op("-", slot("length"), slot("cut")),
  phrasings: [
    { id: "long", tokens: words("Sam has a [spell.colour]ful ribbon at the [place]. It is [length] [units.length] long. Sam cuts off [cut] [units.length].").map(toToken) },
    { id: "short", tokens: words("A ribbon is [length] [units.length] long. [cut] [units.length] =½ is cut.").map(toToken) },
  ],
};
function toToken(raw: { word: string } | { math: string }) {
  return "word" in raw ? { kind: "word" as const, text: raw.word } : { kind: "math" as const, text: raw.math };
}
const SCENARIO: Scenario = {
  id: "craft-ribbon", interest: "default", kind: "measure", place: "craft table", container: { one: "spool", many: "spools" }, thing: { one: "ribbon", many: "ribbons" },
  verb: "cuts", unit: { one: "ribbon", many: "ribbons" }, quantityLimits: { length: { min: 25, max: 90 }, cut: { min: 5, max: 19 } },
};
const pack = (id: string, length: [string, string], colour: string): RegionPack => ({
  id, units: { length: { one: length[0], many: length[1] } }, coins: { rounding: "none", list: [] }, spelling: { colour },
});
const CA = pack("CA", ["centimetre", "centimetres"], "colour");
const US = pack("US", ["inch", "inches"], "color");
const textOf = (tokens: FlowToken[]) => tokens.map(tokenText).join(" ");

describe("the filler of a question", () => {
  it("fills the numbers, the scenario and the region pack into tokens, and gives the unit of the answer", () => {
    const filled = fill(QUESTION, { length: 45, cut: 12 }, SCENARIO, CA, 0);
    expect(filled).toMatchObject({ ok: true, unit: "centimetres" });
    if (!filled.ok) return;
    expect(textOf(filled.tokens)).toBe("Sam has a colourful ribbon at the craft table. It is 45 centimetres long. Sam cuts off 12 centimetres.");
    // A place of two words is two tokens, so a line can end between them.
    expect(filled.tokens.slice(6, 9)).toEqual([{ kind: "word", pieces: ["the"] }, { kind: "word", pieces: ["craft"] }, { kind: "word", pieces: ["table."] }]);
    const us = fill(QUESTION, { length: 45, cut: 12 }, SCENARIO, US, 1);
    expect(us.ok && [textOf(us.tokens), us.unit]).toEqual(["A ribbon is 45 inches long. 12 inches ½ is cut.", "inches"]);
    expect(us.ok && us.tokens.find((t) => t.kind === "math")).toEqual({ kind: "math", pieces: ["½"] });
  });

  it("splits a word only after its hyphens", () => {
    const question = { ...QUESTION, phrasings: [{ id: "a", tokens: [toToken({ word: "[length]-centimetre-long" })] }, QUESTION.phrasings[1]] };
    const filled = fill(question, { length: 45, cut: 12 }, SCENARIO, CA, 0);
    expect(filled.ok && filled.tokens).toEqual([{ kind: "word", pieces: ["45-", "centimetre-", "long"] }]);
  });

  it.each<[string, () => ReturnType<typeof fill>, RegExp]>([
    ["an unknown placeholder", () => fill({ ...QUESTION, phrasings: [{ id: "a", tokens: [toToken({ word: "[colour]" })] }, QUESTION.phrasings[1]] }, { length: 45, cut: 12 }, SCENARIO, CA, 0), /the placeholder \[colour\] is not known/],
    ["a spelling that the region pack does not have", () => fill(QUESTION, { length: 45, cut: 12 }, SCENARIO, { ...CA, spelling: {} }, 0), /the region pack "CA" has no \[spell\.colour\]/],
    ["a unit that the region pack does not have", () => fill(QUESTION, { length: 45, cut: 12 }, SCENARIO, { ...CA, units: {} }, 0), /the region pack "CA" has no \[units\.length\]/],
    ["a bracket that is left", () => fill({ ...QUESTION, phrasings: [{ id: "a", tokens: [toToken({ word: "[[place]]" })] }, QUESTION.phrasings[1]] }, { length: 45, cut: 12 }, SCENARIO, CA, 0), /the token "\[\[place\]\]" still has a bracket/],
    ["a slot with no number", () => fill(QUESTION, { length: 45 }, SCENARIO, CA, 0), /the slot "cut" has no number/],
    ["a scenario of another kind", () => fill(QUESTION, { length: 45, cut: 12 }, { ...SCENARIO, kind: "groups" }, CA, 0), /the scenario "craft-ribbon" is of the kind "groups" and the question needs "measure"/],
    ["a region that the question is not for", () => fill({ ...QUESTION, regions: ["US"] }, { length: 45, cut: 12 }, SCENARIO, CA, 0), /the question "ribbon-cut" is only for the region US, not CA/],
    ["a phrasing that is not there", () => fill(QUESTION, { length: 45, cut: 12 }, SCENARIO, CA, 2), /the question "ribbon-cut" has no phrasing 3/],
  ])("refuses %s", (_name, filled, problem) => {
    const result = filled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toMatch(problem);
  });
});

describe("the choice of a phrasing", () => {
  const question = { ...QUESTION, phrasings: ["a", "b", "c"].map((id) => ({ id, tokens: QUESTION.phrasings[0].tokens })) };
  it("is decided by the seed alone", () => {
    const seen = new Set(Array.from({ length: 60 }, (_, i) => choosePhrasing(question, `seed-${i}`)));
    expect(seen).toEqual(new Set([0, 1, 2]));
    expect(choosePhrasing(question, "seed-7")).toBe(choosePhrasing(question, "seed-7"));
  });
  it("takes one that the child has not seen while there is one, and any when all are seen", () => {
    for (let i = 0; i < 30; i++) {
      expect(choosePhrasing(question, `seed-${i}`, ["a", "c"])).toBe(1);
      expect([0, 2]).toContain(choosePhrasing(question, `seed-${i}`, ["b"]));
      expect(choosePhrasing(question, `seed-${i}`, ["a", "b", "c"])).toBe(choosePhrasing(question, `seed-${i}`));
    }
  });
});
