import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fillTemplate, placeholders, seededRandom } from "./template";
import { parseStepProgressions } from "./step-source";
import type { CurriculumStep, StepTemplate } from "./types";
const source = parseStepProgressions(JSON.parse(readFileSync("data/curriculum/step-progressions-k9.json", "utf8")));
const step: CurriculumStep = {
  ...source.steps[0], numbers: { a: { min: 1, max: 9 }, price: { min: 1, max: 2, decimal_places: 2 }, list: { min: 3, max: 9, values: [3, 9] } }, values: ["red", "blue"],
};
const template: StepTemplate = { format: "story", difficulty: "easy", text: "{name}: {They} put {a} {things} in a {container}. {Their} total is {total}. Price {p:.2f}. {colour}", slots: { a: "a", p: "price", colour: "values" }, derived: { total: "a * 2" }, check: "a >= 2", answer: "Fraction(total, 3)" };
describe("pure seeded template filler", () => {
  it("fills deterministically and leaves source data intact", () => {
    const before = JSON.stringify({ step, template });
    const a = fillTemplate(step, template, source.contexts, seededRandom(17));
    expect(fillTemplate(step, template, source.contexts, seededRandom(17))).toEqual(a);
    expect(a.text).not.toMatch(/[{}]/);
    expect(a.answer).toMatch(/^\d+(\/\d+)?$/);
    expect(a.text).toMatch(/Price [12]\.\d{2}\./);
    expect(JSON.stringify({ step, template })).toBe(before);
  });
  it("takes the name and all pronouns from one person", () => {
    const t = { ...template, text: "{name}|{they}|{They}|{them}|{their}|{Their}" };
    const names = new Set();
    for (let seed = 0; seed < 100; seed++) {
      const [name, they, They, them, their, Their] = fillTemplate(step, t, source.contexts, seededRandom(seed)).text.split("|");
      const p = source.contexts.people.find(p => p.name === name)!; names.add(name);
      expect({ they, them, their }).toEqual({ they: p.they, them: p.them, their: p.their });
      expect(They).toBe(p.they[0].toUpperCase() + p.they.slice(1));
      expect(Their).toBe(p.their[0].toUpperCase() + p.their.slice(1));
    }
    expect(names.size).toBe(source.contexts.people.length);
  });
  it("retries a false check and stops at the limit", () => {
    let n = 0;
    const t = { ...template, slots: { a: "a" }, text: "{a}", derived: {}, answer: "a", check: "a == 9" };
    const filled = fillTemplate(step, t, source.contexts, () => ++n === 3 ? 0.999 : 0, 3);
    expect(filled).toMatchObject({ text: "9", answer: "9", attempts: 3 });
    expect(() => fillTemplate(step, t, source.contexts, () => 0, 3)).toThrow("within 3 attempts");
    expect(() => fillTemplate(step, t, source.contexts, () => 0, 0)).toThrow("Attempt limit");
  });
  it("respects inclusive endpoints, decimal grids and explicit lists", () => {
    const t: StepTemplate = { format: "bare", difficulty: "easy", slots: { a: "a", p: "price", n: "list", colour: "values" }, text: "{a}|{p:.2f}|{n}|{colour}", answer: "a" };
    expect(fillTemplate(step, t, source.contexts, () => 0).text).toBe("1|1.00|3|red");
    expect(fillTemplate(step, t, source.contexts, () => 0.9999999).text).toBe("9|2.00|9|blue");
  });
  it("infers exact decimal grids and evaluates exact sums in checks", () => {
    const decimalStep = { ...step, numbers: { a: { min: 0.1, max: 0.1 }, b: { min: 0.2, max: 0.2 }, tenths: { min: 0.1, max: 0.9 }, mixed: { min: -0.15, max: 0.2 }, small: { min: 1e-7, max: 3e-7 } } };
    const t: StepTemplate = { format: "bare", difficulty: "easy", slots: { a: "a", b: "b", c: "tenths", d: "mixed", e: "small" }, text: "{total:.2f}|{c}|{d}|{e}", derived: { total: "a + b" }, check: "total == 0.3", answer: "total" };
    expect(fillTemplate(decimalStep, t, source.contexts, () => 0)).toMatchObject({ text: "0.30|0.1|-0.15|0.0000001", answer: "0.3", attempts: 1 });
    expect(fillTemplate(decimalStep, t, source.contexts, () => 0.999999)).toMatchObject({ text: "0.30|0.9|0.2|0.0000003" });
    const samples = new Set(Array.from({ length: 300 }, (_, seed) => fillTemplate(decimalStep, t, source.contexts, seededRandom(seed)).text.split("|")[1]));
    expect([...samples].sort()).toEqual(["0.1", "0.2", "0.3", "0.4", "0.5", "0.6", "0.7", "0.8", "0.9"]);
  });
  it("keeps expression braces separate from text placeholders", () => {
    const t: StepTemplate = { format: "bare", difficulty: "easy", slots: { a: "a" }, text: "{a}: {count}", derived: { count: "len({a, a, 10})" }, check: "a in [1, 2, 3, 4, 5, 6, 7, 8, 9]", answer: "len({a, a, 10})" };
    expect(fillTemplate(step, t, source.contexts, () => 0)).toMatchObject({ text: "1: 2", answer: "2" });
  });
  it("applies derived values in order and permits assignment to a sampled slot", () => {
    const t: StepTemplate = { format: "bare", difficulty: "easy", slots: { a: "a" }, derived: { a: "a * 10", b: "a + 1" }, text: "{a}: {b}", answer: "b" };
    expect(fillTemplate(step, t, source.contexts, () => 0)).toMatchObject({ text: "10: 11", answer: "11" });
    expect(() => fillTemplate(step, { ...t, derived: { b: "c + 1", c: "1" } }, source.contexts, () => 0)).toThrow("Unknown expression name: c");
  });
  it.each(["{a.x}", "{a[0]}", "{__proto__}", "{constructor}", "{a:.2g}", "{", "}"])("rejects placeholder %s", text => expect(() => placeholders(text)).toThrow());
  it("fails closed on unknown slots, placeholders and names even in a lazy branch", () => {
    expect(() => fillTemplate(step, { ...template, slots: { a: "missing" } }, source.contexts, seededRandom(1))).toThrow("Unknown slot domain");
    expect(() => fillTemplate(step, { ...template, text: "{missing}" }, source.contexts, seededRandom(1))).toThrow("Unknown placeholder");
    expect(() => fillTemplate(step, { ...template, answer: "1 if True else process" }, source.contexts, seededRandom(1))).toThrow("Unknown expression name: process");
    expect(() => fillTemplate(step, template, source.contexts, () => 1)).toThrow("Random source");
  });
  it("rejects invalid domains before attempting a fill", () => {
    for (const numbers of [{ a: { min: 5, max: 2 } }, { a: { min: 0, max: 1, values: [2] } }, { a: [] }, { a: { min: 0.1, max: 0.9, decimal_places: 0 } }]) {
      expect(() => fillTemplate({ ...step, numbers }, { ...template, slots: { a: "a" } }, source.contexts, seededRandom(1))).toThrow();
    }
  });
});
