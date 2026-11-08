// B1b: the four agreements for compare, sum and tenths build, through the deriver and the session adapter. Synthetic
// numbers only.
import { describe, expect, it } from "vitest";
import type { QuestionPackage } from "@/lib/question-package";
import { placePartsOf } from "./place-value-parts";
import { exampleGiveaway, placePartsTeachingPackage } from "@/lib/maya-teaching/place-value-parts";
import { derivePlaceValue } from "@/lib/maya-teaching/place-value";
import { storedBuild, storedCompare, storedSum } from "@/lib/maya-teaching/place-value-parts-samples";
import { storedPlaceValue, zeroPrinted } from "@/lib/maya-teaching/place-value-samples";
import { heldReason } from "./session";

const tamper = (p: QuestionPackage, f: (x: Record<string, unknown> & QuestionPackage) => void): QuestionPackage => {
  const c = structuredClone(p) as Record<string, unknown> & QuestionPackage;
  f(c);
  return c;
};
const source = (p: QuestionPackage) => (p.item!.checks[0] as unknown as { source: Record<string, unknown> }).source;

describe("place-value compare, sum and build: what the stored question asks", () => {
  it("reads each ask when the key, the text, the expression and code agree", () => {
    expect(placePartsOf(storedCompare({ step: 1, n0: 38472, place: "thousands", second: "hundreds" }))).toEqual({ ask: "compare", number: 38472, place: "thousands", second: "hundreds", answer: "true" });
    expect(placePartsOf(storedCompare({ step: 2, n0: 735561, place: "thousands", second: "hundreds" }))).toMatchObject({ answer: "false" });
    expect(placePartsOf(storedSum({ step: 1, n0: 87346, place: "thousands", second: "tens" }))).toEqual({ ask: "sum", number: 87346, place: "thousands", second: "tens", answer: 7040 });
    expect(placePartsOf(storedSum({ step: 2, n0: 985939, place: "ten thousands", second: "hundreds" }))).toMatchObject({ answer: 80900 });
    expect(placePartsOf(storedBuild({ wholes: 6, tenths: 4 }))).toEqual({ ask: "build", wholes: 6, tenths: 4, answer: 6.4 });
    expect(placePartsOf(storedBuild({ wholes: 6, tenths: 1 }))).toMatchObject({ answer: 6.1 });
  });

  it("reads the zero-placeholder variant's printed number, not its slot", () => {
    const n0 = 774785;
    expect(zeroPrinted(n0)).not.toBe(n0);
    const o = placePartsOf(storedCompare({ step: 3, n0, place: "ten thousands", second: "hundreds" }));
    expect(o).toMatchObject({ ask: "compare", number: zeroPrinted(n0) });
  });

  it("leaves B1a's and other templates to their own derivers", () => {
    expect(placePartsOf(storedPlaceValue({ variant: "1.1", n0: 53172, place: "thousands" }))).toBeNull();
  });

  it("holds the question when any one agreement fails", () => {
    const c = storedCompare({ step: 1, n0: 38472, place: "thousands", second: "hundreds" });
    const s = storedSum({ step: 1, n0: 87346, place: "thousands", second: "tens" });
    const b = storedBuild({ wholes: 6, tenths: 4 });
    const cases: [string, QuestionPackage][] = [
      ["unknown key", tamper(c, (x) => { x.templateId = "5.1-place-value-million#1.6:true-false"; })],
      ["text names another place", tamper(c, (x) => { x.text = x.text.replace("hundreds place.", "tens place."); })],
      ["text another number", tamper(c, (x) => { x.text = x.text.replace("38472", "38473"); })],
      ["expression another place", tamper(c, (x) => { source(x).answer = "'true' if n // 1000 % 10 > n // 10 % 10 else 'false'"; })],
      ["expression refused", tamper(c, (x) => { source(x).answer = "__import__('os')"; })],
      ["key the other word", tamper(c, (x) => { (x.item!.regions[0] as { answer: string }).answer = "false"; })],
      ["yes and no", tamper(c, (x) => { (x.item!.regions[0] as { choices: string[] }).choices = ["yes", "no"]; })],
      ["sum key", tamper(s, (x) => { (x.item!.regions[0] as { answer: { value: number } }).answer.value = 7041; })],
      ["sum expression swapped", tamper(s, (x) => { source(x).answer = "n // 10 % 10 * 10 + n // 1000 % 10 * 1000"; })],
      ["sum with a 0 digit", storedSum({ step: 1, n0: 87306, place: "thousands", second: "tens" })],
      ["build slot", tamper(b, (x) => { (source(x).slots as { value: { int: string } }[])[1].value.int = "5"; })],
      ["build key", tamper(b, (x) => { (x.item!.regions[0] as { answer: { value: number } }).answer.value = 64; })],
      ["build plural", tamper(b, (x) => { x.text = "6 wholes and 4 tenth is ? as a decimal."; })],
      ["build expression", tamper(b, (x) => { source(x).answer = "round(w + p / 100, 2)"; })],
    ];
    for (const [why, p] of cases) {
      const r = placePartsOf(p);
      expect(r === null || "held" in r, why).toBe(true);
      expect(derivePlaceValue(p), why).toBeNull();
    }
  });

  it("makes a checked teaching package with an easier example of the same ask and wrong answers from code", () => {
    for (const stored of [
      storedCompare({ step: 1, n0: 38472, place: "thousands", second: "hundreds" }),
      storedCompare({ step: 2, n0: 735561, place: "thousands", second: "hundreds" }),
      storedSum({ step: 3, n0: 977179, place: "hundred thousands", second: "thousands" }),
      storedBuild({ wholes: 6, tenths: 1 }),
      storedBuild({ wholes: 2, tenths: 7 }),
    ]) {
      const r = placePartsTeachingPackage(stored);
      if (!r || "held" in r) throw new Error(`held ${stored.text}: ${r?.held}`);
      const p = r.package;
      expect(p.operation!.kind).toBe("place-value");
      expect(p.easierExample!.operation).toMatchObject({ kind: "place-value", ask: (p.operation as { ask: string }).ask });
      expect(p.easierExample!.answer).not.toEqual(p.answer!.value);
      expect(p.wrongAnswers.length).toBeGreaterThan(0);
      expect(p.text).toBe(stored.text);
      expect(heldReason(p)).toBeNull();
    }
  });

  it("gives a compare the steps it teaches: both digits, then the bigger one only when they differ", () => {
    const steps = (stored: QuestionPackage) => { const r = placePartsTeachingPackage(stored); return r && "package" in r ? r.package.steps.map((s) => s.kind) : null; };
    expect(steps(storedCompare({ step: 1, n0: 38472, place: "thousands", second: "hundreds" }))).toEqual(["read-digit", "read-digit", "bigger", "result"]);
    expect(steps(storedCompare({ step: 2, n0: 735561, place: "thousands", second: "hundreds" }))).toEqual(["read-digit", "read-digit", "result"]);
    expect(steps(storedSum({ step: 1, n0: 87346, place: "thousands", second: "tens" }))).toEqual(["place-worth", "place-worth", "result"]);
    expect(steps(storedBuild({ wholes: 5, tenths: 8 }))).toEqual(["result"]);
  });

  it("never makes an easier example that gives the answer away (lesson 11), over many numbers", () => {
    const places = ["ten thousands", "thousands", "hundreds", "tens"] as const;
    let made = 0;
    for (let n0 = 11111; n0 <= 99999; n0 += 3917) {
      for (const [i, place] of places.entries()) for (const second of places.slice(i + 1)) {
        for (const stored of [storedCompare({ step: 1, n0, place, second }), storedSum({ step: 1, n0, place, second })]) {
          const o = placePartsOf(stored);
          const r = placePartsTeachingPackage(stored);
          if (!o || "held" in o || !r || "held" in r) continue;
          made++;
          expect(exampleGiveaway(o, r.package.easierExample!), stored.text).toBeNull();
        }
      }
    }
    for (let w = 2; w <= 6; w++) for (let t = 1; t <= 9; t++) {
      const stored = storedBuild({ wholes: w, tenths: t });
      const o = placePartsOf(stored);
      const r = placePartsTeachingPackage(stored);
      if (!o || "held" in o || !r || "held" in r) throw new Error(`held ${stored.text}`);
      made++;
      expect(exampleGiveaway(o, r.package.easierExample!), stored.text).toBeNull();
    }
    expect(made).toBeGreaterThan(100);
  });

  it("names each giveaway: a power of 10, the first digits, the question's operands, the question's word", () => {
    const num = (value: number) => ({ type: "number" as const, value });
    const sumOf = (n: number) => ({ kind: "place-value" as const, operands: [n] as [number], ask: "sum" as const, place: "hundreds" as const, second: "tens" as const });
    const sum = { ask: "sum" as const, number: 6304, place: "thousands" as const, second: "hundreds" as const, answer: 6300 };
    expect(exampleGiveaway(sum, { text: "", operation: sumOf(635), answer: num(630), steps: [] })).toMatch(/power of 10/);
    expect(exampleGiveaway({ ...sum, answer: 6340 }, { text: "", operation: sumOf(635), answer: num(63), steps: [] })).toMatch(/first digits/);
    expect(exampleGiveaway({ ...sum, number: 46104, answer: 6100 }, { text: "", operation: sumOf(635), answer: num(630), steps: [] })).toMatch(/own number or digits/);
    const build = { ask: "build" as const, wholes: 6, tenths: 1, answer: 6.1 };
    const buildOf = (w: number, t: number) => ({ kind: "place-value" as const, operands: [w, t] as [number, number], ask: "build" as const, place: "tenths" as const });
    expect(exampleGiveaway(build, { text: "", operation: buildOf(2, 1), answer: num(2.1), steps: [] })).toMatch(/wholes or tenths/);
    expect(exampleGiveaway(build, { text: "", operation: buildOf(2, 7), answer: num(2.7), steps: [] })).toBeNull();
    const compare = { ask: "compare" as const, number: 38472, place: "thousands" as const, second: "hundreds" as const, answer: "true" as const };
    const cmp = { kind: "place-value" as const, operands: [275] as [number], ask: "compare" as const, place: "hundreds" as const, second: "tens" as const };
    expect(exampleGiveaway(compare, { text: "", operation: cmp, answer: { type: "choice", value: "true" }, steps: [] })).toMatch(/word/);
  });
});
