// What the harness (testing/shape-harness.ts) does not say of add.column and sub.column: their counts against every
// question of 1 to 3 digits and against parts of the 4-digit ones, the question at each place of the order, how hard whole
// kinds are, and how long a book takes.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { planBook } from "../build/build-book";
import rawBook from "../fixtures/book-add-sub.json";
import rawSnapshot from "../fixtures/snapshot-add-sub.json";
import { pick, seedFrom } from "../hash";
import { ADD_WIDE, addColumnEnds, addColumnFeatures, addColumnRegistration } from "../testing/registrations/add-column";
import { SUB_WIDE, subColumnEnds, subColumnFeatures, subColumnRegistration } from "../testing/registrations/sub-column";
import { hasFeatures, type Limits, type Rows, type ShapeRegistration } from "../testing/shape-registration";
import { addColumn, addColumnRules, type AddColumnLimits } from "./add-column";
import { chooseQuestion, scoreRange, widestQuestion, type ColumnQuestion, type ColumnRules } from "./column-count";
import type { Shape } from "./shape";
import { subColumn, subColumnRules, type SubColumnLimits } from "./sub-column";

const r = (min: number, max: number) => ({ min, max });
type Sign = "+" | "-";
interface Subject { sign: Sign; shape: Shape; registration: ShapeRegistration; wide: Limits; rules(limits: Limits): ColumnRules; ends: typeof addColumnEnds; features(a: number, b: number): Readonly<Record<string, unknown>>; lists: [string, Limits][]; parts: Limits[] }

const add: Subject = {
  sign: "+", shape: addColumn as Shape, registration: addColumnRegistration, wide: ADD_WIDE, ends: addColumnEnds, features: addColumnFeatures, rules: (limits) => addColumnRules(limits as unknown as AddColumnLimits),
  lists: [
    ["every question of 1 and 2 digits under 24", { ...ADD_WIDE, a: r(5, 23), b: r(1, 19) }],
    ["bounds that no digit ends", { ...ADD_WIDE, a: r(98, 108), b: r(6, 108), sum: r(152, 199), carries: r(1, 2) }],
    ["a carry that makes the next one", { ...ADD_WIDE, a: r(185, 215), b: r(5, 125), carryChain: "only" }],
    ["zeros and no zero in the sum", { ...ADD_WIDE, a: r(98, 205), b: r(5, 105), aZeroInTens: "only", bZeroInOnes: "never", zeroInSum: "never" }],
    ["4 digits around a thousand", { ...ADD_WIDE, a: r(987, 1023), b: r(978, 1012), sum: r(1990, 2021), carryIntoThousands: r(1, 1) }],
  ],
  parts: [
    ADD_WIDE, { ...ADD_WIDE, carryChain: "only" }, { ...ADD_WIDE, carries: r(2, 2), zeroInSum: "never" }, { ...ADD_WIDE, bDigits: r(2, 3), aZeroInHundreds: "never", bZeroInTens: "only" }, { ...ADD_WIDE, b: r(123, 8765), sum: r(5678, 12_345) },
  ],
};
const sub: Subject = {
  sign: "-", shape: subColumn as Shape, registration: subColumnRegistration, wide: SUB_WIDE, ends: subColumnEnds, features: subColumnFeatures, rules: (limits) => subColumnRules(limits as unknown as SubColumnLimits),
  lists: [
    ["every question of 1 and 2 digits under 24", { ...SUB_WIDE, a: r(1, 23), b: r(1, 59) }],
    ["bounds that no digit ends", { ...SUB_WIDE, a: r(98, 108), b: r(6, 58), difference: r(52, 99), borrows: r(1, 2) }],
    ["across a zero", { ...SUB_WIDE, a: r(195, 305), b: r(5, 115), acrossZero: "only", shorterAnswer: "only" }],
    ["never across a zero, with equal digits", { ...SUB_WIDE, a: r(195, 225), b: r(95, 125), acrossZero: "never", equalDigits: "only", bZeroInOnes: "never" }],
    ["4 digits around a thousand", { ...SUB_WIDE, a: r(992, 1008), b: r(978, 1002), zeroAnswer: "never", borrowFromThousands: r(1, 1) }],
    ["4 digits across two zeros", { ...SUB_WIDE, a: r(1987, 3023), b: r(9, 12), acrossTwoZeros: "only" }],
  ],
  parts: [
    SUB_WIDE, { ...SUB_WIDE, acrossTwoZeros: "only" }, { ...SUB_WIDE, acrossZero: "only", acrossTwoZeros: "never" }, { ...SUB_WIDE, borrows: r(2, 2), equalDigits: "never", shorterAnswer: "only" },
    { ...SUB_WIDE, b: r(123, 8765), difference: r(234, 3456) }, { ...SUB_WIDE, bDigits: r(2, 3), aZeroInHundreds: "never", bZeroInTens: "only", zeroAnswer: "never" },
  ],
};
const both = [["add.column", add], ["sub.column", sub]] as const;

const rowsOf = (sign: Sign, { a, b }: ColumnQuestion): Rows => [String(a), `${sign}${b}`];
const textOf = ({ a, b }: ColumnQuestion) => `${a} ${b}`;
const digitsOf = (n: number) => (n < 10 ? 1 : n < 100 ? 2 : n < 1000 ? 3 : 4);

/** Every question inside some limits, by the facts of the registration. */
function listOf({ sign, registration, features }: Subject, limits: Limits): ColumnQuestion[] {
  const { a, b } = limits as unknown as ColumnRules;
  const all: ColumnQuestion[] = [];
  for (let top = a.min; top <= a.max; top++) {
    for (let low = b.min; low <= (sign === "+" ? Math.min(b.max, 10 ** digitsOf(top) - 1) : Math.min(b.max, top)); low++) {
      if (hasFeatures(registration, features(top, low), limits)) all.push({ a: top, b: low });
    }
  }
  return all;
}

/** The questions with each set of features, for numbers of 1 to 3 digits: one example and how many there are. */
function tally(sign: Sign): Map<number, { n: number; example: ColumnQuestion }> {
  const found = new Map<number, { n: number; example: ColumnQuestion }>();
  for (let a = 1; a <= 999; a++) {
    const [aDigits, a0, a1] = [digitsOf(a), a % 10, Math.floor(a / 10) % 10];
    for (let b = 1; b <= (sign === "+" ? 10 ** aDigits - 1 : a); b++) {
      const [bDigits, b0, b1] = [digitsOf(b), b % 10, Math.floor(b / 10) % 10];
      const result = sign === "+" ? a + b : a - b;
      const tens = sign === "+" ? (aDigits > 1 && a0 + b0 > 9) : a0 < b0;
      const hundreds = sign === "+" ? (aDigits > 2 && (a % 100) + (b % 100) > 99) : a % 100 < b % 100;
      const makes = sign === "+" && tens && hundreds && a1 + b1 === 9;
      const equal = sign === "-" && (a0 === b0 || (bDigits > 1 && a1 === b1) || (bDigits > 2 && Math.floor(a / 100) === Math.floor(b / 100)));
      const inner = sign === "+" && result > 99 && (Math.floor(result / 10) % 10 === 0 || (result > 999 && Math.floor(result / 100) % 10 === 0));
      const key = Number(a0 === 0) + 2 * Number(aDigits > 2 && a1 === 0) + 4 * Number(b0 === 0) + 8 * Number(bDigits > 2 && b1 === 0) + 16 * Number(tens) + 32 * Number(hundreds)
        + 64 * Number(makes) + 128 * Number(equal) + 256 * Number(inner) + 512 * Number(result === 0) + 1024 * Number(digitsOf(result) < aDigits) + 2048 * (aDigits * 4 + bDigits);
      const known = found.get(key);
      if (known) known.n++;
      else found.set(key, { n: 1, example: { a, b } });
    }
  }
  return found;
}

describe.each(both)("the count of %s", (_id, subject) => {
  const { sign, shape, registration, wide, ends } = subject;

  it("is the number of all questions of 1 to 3 digits, for any limits of digits, places and words", () => {
    const classes = [...tally(sign).values()].map(({ n, example }) => ({ n, printed: registration.read(rowsOf(sign, example)) }));
    const free = Object.entries(registration.limits).filter(([name]) => !["a", "b", "sum", "difference"].includes(name));
    const some = fc.record(Object.fromEntries(free.map(([name, rule]) => [name, fc.oneof({ weight: 2, arbitrary: fc.constant(wide[name]) }, rule.values)])));
    let withQuestions = 0;
    fc.assert(fc.property(some, (picked) => {
      const limits: Limits = { ...wide, ...picked, a: r(1, 999) };
      const wanted = classes.reduce((sum, { n, printed }) => sum + (printed && hasFeatures(registration, printed.features, limits) ? n : 0), 0);
      expect([shape.count(limits), ends(limits).count]).toEqual([wanted, wanted]);
      if (wanted > 0) withQuestions++;
    }), { seed: 237, numRuns: 30 });
    expect(shape.count({ ...wide, a: r(1, 999) })).toBe(sign === "+" ? 9 * 9 + 90 * 99 + 900 * 999 : (999 * 1000) / 2);
    expect(withQuestions).toBeGreaterThan(15);
  });

  it.each(subject.lists)("is the length of the list, and each place of the order has its own question: %s", (_name, limits) => {
    const list = listOf(subject, limits);
    expect(list.length).toBeGreaterThan(4);
    expect(shape.count(limits)).toBe(list.length);
    const places = Array.from({ length: list.length }, (_, i) => i);
    const found = places.map((i) => chooseQuestion(subject.rules(limits), (count) => { expect(count).toBe(list.length); return i; }));
    expect(found.map(textOf).sort()).toEqual(list.map(textOf).sort());
    const scores = list.map((q) => shape.difficulty(q));
    expect(scoreRange(subject.rules(limits))).toEqual({ easiest: scores.reduce((x, y) => Math.min(x, y)), hardest: scores.reduce((x, y) => Math.max(x, y)) });
    const wide = (q: ColumnQuestion) => Math.max(digitsOf(q.a), 1 + digitsOf(q.b)) * 10 ** 9 + (q.a + q.b) * 10 ** 4 + q.a;
    expect(widestQuestion(subject.rules(limits))).toEqual(list.reduce((widest, q) => (wide(q) > wide(widest) ? q : widest)));
  });

  it.each(subject.parts.map((limits, i) => [i, limits] as const))("is right for the top numbers 3999 and 4000 with all lower numbers, limits %i", (_i, given) => {
    const limits = { ...given, a: r(3999, 4000) };
    expect(shape.count(limits)).toBe(listOf(subject, limits).length);
  });

  it("is the sum of its parts with 4 digits, and the questions of the first, the last and some places are inside and different", () => {
    const four: Limits = { ...wide, aDigits: r(4, 4) };
    const total = shape.count(four);
    expect(total).toBe(sign === "+" ? 9000 * 9999 : (9999 * 10_000) / 2 - (999 * 1000) / 2);
    const passes = sign === "+" ? "carries" : "borrows";
    expect([0, 1, 2, 3].reduce((sum, n) => sum + shape.count({ ...four, [passes]: r(n, n) }), 0)).toBe(total);
    const tops = Array.from({ length: 9 }, (_, i) => shape.count({ ...four, a: r(1000 * (i + 1), 1000 * (i + 1) + 999) }));
    expect(tops.reduce((x, y) => x + y)).toBe(total);
    const places = [0, total - 1, ...Array.from({ length: 100 }, (_, i) => Math.floor((total / 100) * i) + 7)];
    const found = places.map((i) => chooseQuestion(subject.rules(four), () => i));
    expect(new Set(found.map(textOf)).size).toBe(places.length);
    for (const q of found) {
      const printed = registration.read(rowsOf(sign, q));
      expect(printed && hasFeatures(registration, printed.features, four), textOf(q)).toBe(true);
    }
  });

  it("asks for a question that the seed alone picks, and changes no limits", () => {
    const limits = structuredClone(wide) as { a: { max: number } } & Limits;
    const one = shape.generate(limits, "seed");
    limits.a.max = 20;
    expect((shape.generate(limits, "seed").question as ColumnQuestion).a).toBeLessThanOrEqual(20);
    limits.a.max = 9999;
    expect(shape.generate(limits, "seed")).toEqual(one);
    expect(limits).toEqual(wide);
    const seeds = Array.from({ length: 20 }, (_, i) => seedFrom("place", i));
    expect(seeds.map((seed) => shape.generate(wide, seed).question)).toEqual(seeds.map((seed) => chooseQuestion(subject.rules(wide), (count) => pick(seed, count))));
  });
});

describe("the difficulty", () => {
  it("does not change when the numbers of an addition change places", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 4 }), fc.nat(), fc.nat(), (digits, one, other) => {
      const [a, b] = [one, other].map((n) => 10 ** (digits - 1) + (n % (9 * 10 ** (digits - 1))));
      expect(addColumn.difficulty({ a, b })).toBe(addColumn.difficulty({ a: b, b: a }));
    }));
  });

  // Each range holds all questions of its kind, so this says it of any limits inside them.
  it.each<[string, Subject, Limits[]]>([
    ["add.column", add, [1, 2, 3, 4].flatMap((digits) => [0, 1, 2, 3].slice(0, digits).flatMap((carries) =>
      (["never", "only"] as const).slice(0, carries > 1 ? 2 : 1).map((carryChain): Limits => ({ ...ADD_WIDE, aDigits: r(digits, digits), carries: r(carries, carries), carryChain }))))],
    ["sub.column", sub, [1, 2, 3, 4].flatMap((digits) => [0, 1, 2, 3].slice(0, digits).flatMap((borrows) =>
      (["never", "only"] as const).slice(0, borrows > 1 ? 2 : 1).flatMap((acrossZero) => (["never", "only"] as const).slice(0, acrossZero === "only" && borrows > 2 ? 2 : 1).map((acrossTwoZeros): Limits =>
        ({ ...SUB_WIDE, aDigits: r(digits, digits), borrows: r(borrows, borrows), acrossZero, acrossTwoZeros })))))],
  ])("of %s rises with each kind: digits, carries or borrows, one that makes the next, zeros", (_id, { shape }, kinds) => {
    const ranges = kinds.map((limits) => shape.difficultyRange(limits));
    expect(ranges.length).toBeGreaterThan(12);
    ranges.slice(1).forEach((range, i) => expect(range.easiest).toBeGreaterThan(ranges[i].hardest));
  });
});

describe("the bank", () => {
  it("refuses a row with limits that contradict each other, and names them", () => {
    const snapshot = structuredClone(rawSnapshot);
    Object.assign(snapshot.sheets[0].front.rows[0].limits, { carries: r(3, 3), sum: r(20, 99) });
    expect(planBook({ snapshot, book: rawBook })).toEqual({ ok: false, problems: [
      'Sheet "column-addition", front side, row "no-carry": no question meets these limits (a wider carries has some).',
    ] });
  });

  it("plans a book of 120 pages of 4-digit rows of both shapes in less than 5 seconds, with every page full", () => {
    const side = (id: string, { wide }: Subject) =>
      ({ instruction: "Work it out.", template: "columns-2x4-wide", rows: [{ id: id.slice(0, 3), shape: id, items: 8, limits: { ...wide, aDigits: r(4, 4), bDigits: r(4, 4) } }] });
    const sheets = Array.from({ length: 60 }, (_, i) => ({ id: `sheet-${i}`, firstPage: 2 * i + 1, front: side("add.column", add), back: side("sub.column", sub) }));
    const ids = sheets.map((s) => s.id);
    const snapshot = { ...rawSnapshot, topics: [{ ...rawSnapshot.topics[0], sheets: ids }], sheets };
    const book = { bookId: "long", childId: "child", sheets: ids.map((sheetId) => ({ sheetId, attempt: 1, qr: { front: `${sheetId}-f`, back: `${sheetId}-b` } })) };
    const started = performance.now();
    const plan = planBook({ snapshot, book });
    const taken = performance.now() - started;
    expect(plan).toMatchObject({ ok: true });
    if (plan.ok) expect([plan.pages.length, plan.items.length]).toEqual([120, 960]);
    expect(taken).toBeLessThan(5000);
  });
});

describe("the example sheets", () => {
  it("print every question in a place of its template, from easy to hard", () => {
    const plan = planBook({ snapshot: rawSnapshot, book: rawBook });
    if (!plan.ok) throw new Error(plan.problems.join("\n"));
    expect(plan.pages.map((page) => [page.template, page.regions.filter((region) => region.role === "answer").length])).toEqual([["columns-2x4", 8], ["columns-2x4-wide", 8], ["columns-2x4", 8], ["columns-2x4-wide", 8]]);
  });
});
