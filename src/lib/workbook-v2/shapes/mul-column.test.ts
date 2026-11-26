// What the harness (testing/shape-harness.ts) does not say of mul.column: what version 1 gave, how hard whole kinds of
// questions are, and which question a seed picks.
import { describe, expect, it } from "vitest";
import { planBook } from "../build/build-book";
import rawSnapshot from "../fixtures/snapshot.json";
import wideSnapshot from "../fixtures/snapshot-4-digits.json";
import { pick, seedFrom } from "../hash";
import versionOne from "../testing/mul-column-v1.json";
import { mulColumnQuestions, mulColumnRegistration } from "../testing/registrations/mul-column";
import type { Limits } from "../testing/shape-registration";
import { mulColumn, type MulColumnLimits, type MulColumnQuestion } from "./mul-column";
import { chooseQuestion } from "./mul-column-count";

const r = (min: number, max: number) => ({ min, max });
const WIDE: MulColumnLimits = {
  digits: r(2, 4), a: r(10, 9999), b: r(2, 9), carries: r(0, 3), carryIntoTens: r(0, 8), carryIntoHundreds: r(0, 8), carryIntoThousands: r(0, 8),
  product: r(10, 99_999), zeroInProduct: "allowed", wholeTens: "allowed",
};
const textOf = ({ a, b }: MulColumnQuestion) => `${a}x${b}`;

describe("the outputs of version 1", () => {
  it.each(Object.entries(versionOne.questions))("are the same questions for 200 seeds: %s", (id, questions) => {
    const row = rawSnapshot.sheets.flatMap((s) => [...s.front.rows, ...s.back.rows]).find((x) => x.id === id);
    const read = mulColumn.readLimits(row?.limits);
    if (!read.ok) throw new Error(read.problem);
    expect(Array.from({ length: 200 }, (_, i) => textOf(mulColumn.generate(read.limits, seedFrom("s1", i)).question)).join(" ")).toBe(questions);
  });

  it("have the same order of difficulty, with the same equal ones, for all 720 questions of 2 digits", () => {
    const scores = Array.from({ length: 720 }, (_, i) => mulColumn.difficulty({ a: 10 + Math.floor(i / 8), b: 2 + (i % 8) }));
    const order = [...new Set(scores)].sort((x, y) => x - y);
    expect(scores.map((s) => order.indexOf(s)).join(" ")).toBe(versionOne.ranks);
  });
});

describe("the difficulty", () => {
  const range = (limits: Partial<MulColumnLimits>) => mulColumn.difficultyRange({ ...WIDE, ...limits });
  it.each<[string, Partial<MulColumnLimits>, MulColumnQuestion, MulColumnQuestion]>([
    ["2 digits, no carry and no 100", { digits: r(2, 2), b: r(2, 4), carries: r(0, 0), product: r(10, 99) }, { a: 10, b: 2 }, { a: 12, b: 4 }],
    ["2 digits, one carry and no 100", { digits: r(2, 2), b: r(2, 4), carries: r(1, 1), product: r(10, 99) }, { a: 15, b: 2 }, { a: 13, b: 4 }],
    ["2 digits past 100", { digits: r(2, 2), product: r(100, 999) }, { a: 60, b: 2 }, { a: 89, b: 9 }],
    ["3 digits", { digits: r(3, 3) }, { a: 111, b: 2 }, { a: 889, b: 9 }],
    ["4 digits with no carry", { digits: r(4, 4), carries: r(0, 0) }, { a: 1111, b: 2 }, { a: 5011, b: 9 }],
    ["4 digits", { digits: r(4, 4) }, { a: 1111, b: 2 }, { a: 8889, b: 9 }],
    ["every question", {}, { a: 11, b: 2 }, { a: 8889, b: 9 }],
  ])("has the named easiest and hardest question: %s", (_name, limits, easiest, hardest) => {
    const all = range(limits);
    expect(all).toEqual({ easiest: mulColumn.difficulty(easiest), hardest: mulColumn.difficulty(hardest) });
  });

  // Each range holds all questions of its kind, so this says it of any limits inside them.
  it("rises with each kind: digits, then a longer product, then carries", () => {
    const kinds = [2, 3, 4].flatMap((digits) => [r(0, 10 ** digits - 1), r(10 ** digits, 99_999)].flatMap((product) =>
      [0, 1, 2, 3].slice(0, digits).map((n) => range({ digits: r(digits, digits), product: r(Math.max(10, product.min), product.max), carries: r(n, n) }))));
    kinds.slice(1).forEach((kind, i) => expect(kind.easiest).toBeGreaterThan(kinds[i].hardest));
    expect(kinds).toHaveLength(18);
  });
});

describe("the question of a seed", () => {
  // The list is of the registration, which counts in another way.
  it.each(mulColumnRegistration.cases.map((c) => [c.name, c.limits] as const))("is the one at the place that the seed picks in the list: %s", (_name, limits) => {
    const all = mulColumnQuestions(limits);
    const seeds = Array.from({ length: 60 }, (_, i) => seedFrom("place", i));
    expect(seeds.map((seed) => textOf(mulColumn.generate(limits as unknown as MulColumnLimits, seed).question))).toEqual(seeds.map((seed) => textOf(all[pick(seed, all.length)])));
  });

  const placesOf = (limits: Limits, every: number) => {
    const all = mulColumnQuestions(limits);
    const places = Array.from({ length: Math.ceil(all.length / every) }, (_, i) => i * every);
    return { listed: places.map((i) => textOf(all[i])), found: places.map((i) => textOf(chooseQuestion(limits as unknown as MulColumnLimits, (count) => { expect(count).toBe(all.length); return i; }))) };
  };
  it.each<[string, Limits, number]>([
    ["all 2-digit questions", { ...WIDE, digits: r(2, 2) }, 1],
    ["3 digits with one carry and 4 digits in the product", { ...WIDE, digits: r(3, 3), carries: r(1, 1), product: r(1000, 9999) }, 1],
    ["around 999 and 1000", { ...WIDE, a: r(985, 1120), b: r(6, 8) }, 1],
    ["every question, one place of 149", { ...WIDE }, 149],
  ])("is found at its own place of the order: %s", (_name, limits, every) => {
    const { listed, found } = placesOf(limits, every);
    expect(listed.length).toBeGreaterThan(400);
    expect(found).toEqual(listed);
  });

  it("does not depend on what was asked before, and does not change the limits", () => {
    const limits = structuredClone(WIDE);
    const one = mulColumn.generate(limits, "seed");
    limits.a.max = 20;
    expect(mulColumn.generate(limits, "seed").question.a).toBeLessThanOrEqual(20);
    limits.a.max = WIDE.a.max;
    expect(mulColumn.generate(limits, "seed")).toEqual(one);
    expect(limits).toEqual(WIDE);
  });
});

describe("a book of 120 pages of 4-digit questions", () => {
  it("is planned in less than 5 seconds, with every page full", () => {
    const [sheet] = wideSnapshot.sheets;
    const sheets = Array.from({ length: 60 }, (_, i) => ({ ...sheet, id: `sheet-${i}`, firstPage: 2 * i + 1 }));
    const ids = sheets.map((s) => s.id);
    const snapshot = { ...wideSnapshot, topics: [{ ...wideSnapshot.topics[0], sheets: ids }], sheets };
    const book = { bookId: "long", childId: "child", sheets: ids.map((sheetId) => ({ sheetId, attempt: 1, qr: { front: `${sheetId}-f`, back: `${sheetId}-b` } })) };
    const started = performance.now();
    const plan = planBook({ snapshot, book });
    const taken = performance.now() - started;
    expect(plan).toMatchObject({ ok: true });
    if (plan.ok) expect([plan.pages.length, plan.items.length]).toEqual([120, 960]);
    expect(taken).toBeLessThan(5000);
  });
});
