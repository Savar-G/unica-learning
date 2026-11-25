// What the harness (testing/shape-harness.ts) does not say of the three division shapes: every dividend of 2 and 3 digits
// against plain division, which question a seed picks, how hard whole kinds of questions are, and the form of a row.
import { describe, expect, it } from "vitest";
import { validateSnapshot, type SnapshotSheet } from "../bank/snapshot";
import { buildBook } from "../build/build-book";
import { repeatNotices, sheetItems } from "../build/items";
import { answerLine, type Answer, type BookItem, type Side } from "../contract";
import divisionRequest from "../fixtures/book-division.json";
import divisionSnapshot from "../fixtures/snapshot-division.json";
import { pick, seedFrom } from "../hash";
import { needsOf } from "../layout/templates";
import { openRenderer } from "../render/typst";
import { divisionProblem } from "../testing/division-steps";
import { divisionBook } from "../testing/sample";
import { skipTypstTests, testAssets } from "../testing/typst";
import { divLong, type DivLongLimits } from "./div-long";
import { divRemainder, type DivRemainderLimits } from "./div-remainder";
import { divFact } from "./div-fact";
import type { DivisionQuestion } from "./division";

const r = (min: number, max: number) => ({ min, max });
const LONG: DivLongLimits = {
  dividendDigits: r(2, 3), dividend: r(10, 999), divisor: r(2, 9), quotient: r(1, 499), quotientDigits: r(1, 3), remainder: "any", start: "either",
  bringDownZero: "allowed", zeroInside: "allowed", zeroAtEnd: "allowed", leftOver: r(0, 2), form: "line",
};
const REMAINDER: DivRemainderLimits = { dividend: r(1, 89), divisors: [2, 3, 4, 5, 6, 7, 8, 9], quotient: r(0, 9), remainder: "any", form: "line" };
const ask = (dividend: number, divisor: number, parts: 1 | 2 = 2, form: "line" | "bracket" = "line"): DivisionQuestion => ({ dividend, divisor, form, parts });
const valuesOf = ({ parts }: Answer) => parts.map((p) => `${p.name} ${p.value}`).join(", ");
const rowsOf = ({ dividend, divisor, form, parts }: DivisionQuestion): string[] => {
  const blanks = parts === 2 ? "□R□" : "□";
  return form === "line" ? [`${dividend}÷${divisor}=${blanks}`] : [blanks, `${divisor})${dividend}`];
};

/** Every question of 2 and 3 digits by 2 to 9, as numbers. */
const EVERY = Array.from({ length: 8 }, (_, d) => Array.from({ length: 990 }, (_, n) => [n + 10, d + 2] as const)).flat();

describe("every dividend of 2 and 3 digits", () => {
  it("has the answer of plain division, the second computation finds it, and its steps hold on the paper, in both forms", () => {
    const wrong = EVERY.flatMap(([dividend, divisor], i) => {
      const [quotient, remainder] = [Math.floor(dividend / divisor), dividend % divisor];
      const form = i % 2 === 0 ? "line" as const : "bracket" as const;
      return ([1, 2] as const).filter((parts) => parts === 2 || remainder === 0).flatMap((parts) => {
        const question = ask(dividend, divisor, parts, form);
        const answer = divLong.answer(question);
        const said = valuesOf(answer) === (parts === 1 ? `answer ${quotient}` : `quotient ${quotient}, remainder ${remainder}`);
        const second = divLong.solveAgain(rowsOf(question));
        const same = second !== null && valuesOf(second.answer) === valuesOf(answer) && second.question.dividend === dividend && second.question.divisor === divisor && second.question.form === form && second.question.parts === parts;
        const steps = divLong.steps(question);
        const face = divLong.face(question);
        const rows = Math.max(...steps.flatMap((s) => s.marks.map((m) => ("row" in m ? Number(m.row) : 0))));
        const hasRoom = face.kind !== "bracket" || rows <= face.workLines;
        return said && same && hasRoom && divisionProblem(steps, answer, rowsOf(question)) === null && steps[steps.length - 1].text === answerLine(answer) ? [] : [`${dividend} ÷ ${divisor}`];
      });
    });
    expect(EVERY).toHaveLength(7920);
    expect(wrong).toEqual([]);
  });

  it("with a rest has no answer of one part", () => {
    for (const rows of [["37÷4=□"], ["□", "4)37"], ["433÷6=□"]]) for (const shape of [divFact, divRemainder, divLong]) expect(shape.solveAgain(rows)).toBeNull();
    expect(valuesOf(divLong.solveAgain(["□R□", "6)438"])!.answer)).toBe("quotient 73, remainder 0");
  });

  // The digits by plain division: what each prefix of the dividend leaves.
  const kindOf = ([dividend, divisor]: readonly [number, number]) => {
    const text = String(dividend);
    const prefixes = [...text].map((_, i) => Number(text.slice(0, i + 1)));
    const start = prefixes.findIndex((n) => n >= divisor);
    const quotient = String(Math.floor(dividend / divisor));
    return {
      dividend, divisor, digits: text.length, quotient: Math.floor(dividend / divisor), quotientDigits: quotient.length, remainder: dividend % divisor, start: start === 0 ? "one" : "two",
      bringDownZero: text.slice(start + 1).includes("0"), zeroInside: quotient.slice(1, -1).includes("0"), zeroAtEnd: quotient.length > 1 && quotient.endsWith("0"),
      leftOver: prefixes.slice(start, -1).filter((n) => n % divisor > 0).length,
    };
  };
  const kinds = EVERY.map(kindOf);
  type Kind = (typeof kinds)[number];
  it.each<[string, Partial<DivLongLimits>, (k: Kind) => boolean]>([
    ["all", {}, () => true], ["nothing left", { remainder: "none" }, (k) => k.remainder === 0], ["something left", { remainder: "some" }, (k) => k.remainder > 0], ["5 to 8 left", { remainder: r(5, 8) }, (k) => k.remainder > 4],
    ["2 digits", { dividendDigits: r(2, 2) }, (k) => k.digits === 2], ["3 digits", { dividendDigits: r(3, 3) }, (k) => k.digits === 3], ["dividends from 95 to 105", { dividend: r(95, 105) }, (k) => k.dividend > 94 && k.dividend < 106],
    ["divisors 6 to 9", { divisor: r(6, 9) }, (k) => k.divisor > 5], ["quotients from 30 to 120", { quotient: r(30, 120) }, (k) => k.quotient > 29 && k.quotient < 121], ["2 digits of the quotient", { quotientDigits: r(2, 2) }, (k) => k.quotientDigits === 2],
    ["the first digit is enough", { start: "one" }, (k) => k.start === "one"], ["the first two digits", { start: "two" }, (k) => k.start === "two"], ["never brings down a zero", { bringDownZero: "never" }, (k) => !k.bringDownZero], ["always brings down a zero", { bringDownZero: "only" }, (k) => k.bringDownZero],
    ["no zero inside", { zeroInside: "never" }, (k) => !k.zeroInside], ["a zero inside", { zeroInside: "only" }, (k) => k.zeroInside], ["no zero at the end", { zeroAtEnd: "never" }, (k) => !k.zeroAtEnd], ["a zero at the end", { zeroAtEnd: "only" }, (k) => k.zeroAtEnd],
    ["nothing is carried on", { leftOver: r(0, 0) }, (k) => k.leftOver === 0], ["something is carried on two times", { leftOver: r(2, 2) }, (k) => k.leftOver === 2],
    ["many together", { dividendDigits: r(3, 3), remainder: "some", start: "two", zeroInside: "never", zeroAtEnd: "never", leftOver: r(1, 1), bringDownZero: "never" }, (k) => k.digits === 3 && k.remainder > 0 && k.start === "two" && !k.zeroInside && !k.zeroAtEnd && k.leftOver === 1 && !k.bringDownZero],
  ])("is counted one time by the limits, and the question at each place of the order is another one: %s", (_name, change, isInside) => {
    const limits = { ...LONG, ...change };
    const inside = kinds.filter(isInside);
    expect(divLong.count(limits)).toBe(inside.length);
    const seeds = Array.from({ length: 40 }, (_, i) => seedFrom("place", i));
    const found = seeds.map((seed) => divLong.generate(limits, seed).question);
    expect(found.map((q) => [q.dividend, q.divisor])).toEqual(seeds.map((seed) => inside[pick(seed, inside.length)]).map((k) => [k.dividend, k.divisor]));
    expect(new Set(found.map((q) => `${q.form} ${q.parts}`))).toEqual(new Set([limits.remainder === "none" ? "line 1" : "line 2"]));
    const scores = inside.map((k) => divLong.difficulty(ask(k.dividend, k.divisor)));
    expect(divLong.difficultyRange(limits)).toEqual({ easiest: Math.min(...scores), hardest: Math.max(...scores) });
  });

  it("is counted by div.remainder, with the divisors of the set only", () => {
    const all = Array.from({ length: 89 }, (_, n) => n + 1).flatMap((n) => [2, 3, 4, 5, 6, 7, 8, 9].filter((d) => Math.floor(n / d) <= 9).map((d) => [n, d]));
    expect(divRemainder.count(REMAINDER)).toBe(all.length);
    expect(divRemainder.count({ ...REMAINDER, quotient: r(1, 9) })).toBe(all.filter(([n, d]) => n >= d).length);
    expect(divRemainder.count({ ...REMAINDER, divisors: [3, 8], remainder: "some" })).toBe(all.filter(([n, d]) => (d === 3 || d === 8) && n % d > 0).length);
  });
});

describe("the form of a row", () => {
  it.each([["none", 1], ["any", 2], ["some", 2], [r(0, 3), 2], [r(2, 2), 2]] as const)("has the parts that the limits say, for each of its questions: remainder %j", (remainder, parts) => {
    for (const form of ["line", "bracket"] as const) {
      const long = Array.from({ length: 60 }, (_, i) => divLong.generate({ ...LONG, form, remainder }, seedFrom("form", i)).question);
      const small = divRemainder.list!({ ...REMAINDER, form, remainder });
      for (const q of [...long, ...small]) expect([q.form, q.parts]).toEqual([form, parts]);
      for (const shape of [divLong, divRemainder]) for (const q of [long[0], small[0]]) expect(shape.answer(q).parts.map((p) => p.name)).toEqual(parts === 2 ? ["quotient", "remainder"] : ["answer"]);
    }
  });

  it("with a remainder area prints it for a question that leaves nothing too, and its answer is 0", () => {
    expect(divRemainder.list!({ ...REMAINDER, dividend: r(36, 36), divisors: [4] })).toEqual([ask(36, 4)]);
    expect(valuesOf(divRemainder.answer(ask(36, 4)))).toBe("quotient 9, remainder 0");
  });

  it.each([
    [divFact, ask(35, 5, 1), [{ text: "35" }, { text: "÷" }, { text: "5" }, { text: "=" }, { blank: "answer" }]],
    [divLong, ask(437, 6), [{ text: "437" }, { text: "÷" }, { text: "6" }, { text: "=" }, { blank: "quotient" }, { text: "R" }, { blank: "remainder" }]],
  ] as const)("is a line of tokens: %#", (shape, question, tokens) => expect(shape.face(question)).toEqual({ kind: "equation", tokens }));

  it.each([
    [divFact, ask(100, 10, 1, "bracket"), { kind: "bracket", above: [{ blank: "answer" }], outside: "10", inside: "100", workLines: 0 }],
    [divRemainder, ask(37, 4, 2, "bracket"), { kind: "bracket", above: [{ blank: "quotient" }, { text: "R" }, { blank: "remainder" }], outside: "4", inside: "37", workLines: 2 }],
    [divRemainder, ask(3, 4, 2, "bracket"), { kind: "bracket", above: [{ blank: "quotient" }, { text: "R" }, { blank: "remainder" }], outside: "4", inside: "3", workLines: 2 }],
    [divLong, ask(438, 6, 1, "bracket"), { kind: "bracket", above: [{ blank: "answer" }], outside: "6", inside: "438", workLines: 4 }],
    [divLong, ask(614, 6, 2, "bracket"), { kind: "bracket", above: [{ blank: "quotient" }, { text: "R" }, { blank: "remainder" }], outside: "6", inside: "614", workLines: 6 }],
  ] as const)("is a bracket with room for two lines of work for each digit of the quotient: %#", (shape, question, face) => expect(shape.face(question)).toEqual(face));

  it("is not part of what a question is: one question in two forms is the same question", () => {
    for (const shape of [divFact, divRemainder, divLong]) {
      const forms = [ask(36, 4), ask(36, 4, 1), ask(36, 4, 2, "bracket"), ask(36, 4, 1, "bracket")].map((q) => shape.identity?.(q));
      expect(new Set(forms.map((f) => JSON.stringify(f)))).toEqual(new Set(['{"dividend":36,"divisor":4}']));
    }
  });
});

describe("a sheet with both forms", () => {
  /** One row in brackets on the front and one in lines on the back, four questions each. */
  const sheetOf = (shape: string, front: object, back: object): SnapshotSheet => {
    const side = (id: string, template: string, limits: object) => ({ instruction: "Divide.", template, rows: [{ id, shape, items: 3, limits }] });
    const snapshot = { format: 1, id: "forms", level: { id: "level", name: "3" }, topics: [{ id: "topic", code: "3-1", title: "Forms", sheets: ["s"] }], sheets: [{ id: "s", firstPage: 1, front: side("f", "brackets-1x3", front), back: side("b", "remainders-1x10", back) }] };
    const read = validateSnapshot(snapshot);
    if (!read.ok) throw new Error(read.problems.join(" "));
    return read.snapshot.sheets.get("s")!;
  };
  const numbers = (items: readonly BookItem[]) => items.map(({ question }) => { const { dividend, divisor } = question as DivisionQuestion; return `${dividend}÷${divisor}`; });
  it.each<[string, object, (last: number) => object]>([
    ["div.remainder", REMAINDER, (last) => ({ dividend: r(30, last), divisors: [4] })],
    ["div.long", LONG, (last) => ({ dividend: r(30, last), divisor: r(4, 4) })],
  ])("has no question of %s in both forms while the row has others, and says so when it has none", (shape, wide, only) => {
    const sheet = sheetOf(shape, { ...wide, ...only(35), form: "bracket" }, { ...wide, ...only(35), form: "line" });
    for (let attempt = 1; attempt <= 20; attempt++) {
      const items = sheetItems(sheet, "child", attempt);
      expect(new Set(numbers(items)).size).toBe(6);
      expect(repeatNotices(sheet, items)).toEqual([]);
    }
    const few = sheetOf(shape, { ...wide, ...only(32), form: "bracket" }, { ...wide, ...only(32), form: "line" });
    expect(repeatNotices(few, sheetItems(few, "child", 1))).toEqual(['Sheet "s", back side, row "b": 3 questions are on the front side too.']);
  });
});

describe.skipIf(skipTypstTests())("the example book of divisions, with the real Typst", () => {
  it("is built with no notice, and each side of each template of divisions has a question as large as it holds", async () => {
    const result = await buildBook({ snapshot: divisionSnapshot, book: divisionRequest }, await openRenderer(testAssets()));
    expect(result).toMatchObject({ status: "built", notices: [] });
    const { pages, items } = divisionBook();
    const largest = (template: string, side: Side) => {
      const ids = pages.filter((p) => p.template === template && p.side === side).map((p) => `${p.id}/`);
      const needs = items.filter((i) => ids.some((id) => i.id.startsWith(id))).map((i) => needsOf(i.face, i.answer));
      return Object.values(Object.fromEntries(Object.keys(needs[0]).map((name) => [name, Math.max(...needs.map((n) => n[name]))]))).join(" ");
    };
    const sides = (template: string) => [largest(template, "front"), largest(template, "back")];
    // Places in the line and characters; outside, inside, characters in an answer and lines of work.
    expect(sides("remainders-1x10")).toEqual(["7 2", "7 3"]);
    expect(sides("brackets-2x6")).toEqual(["2 3 2 0", "2 3 2 0"]);
    expect(sides("brackets-2x4")).toEqual(["1 2 1 2", "1 2 1 2"]);
    expect(sides("brackets-2x3")).toEqual(["1 3 3 6", "1 3 3 6"]);
    expect(sides("brackets-1x4")).toEqual(["1 2 1 2", "1 2 1 2"]);
    expect(sides("brackets-1x3")).toEqual(["1 3 3 6", "1 3 3 6"]);
  });
});

describe("the question of a seed", () => {
  it("does not depend on what was asked before, and does not change the limits", () => {
    const limits = structuredClone(LONG);
    const one = divLong.generate(limits, "seed");
    limits.dividend.max = 20;
    expect(divLong.generate(limits, "seed").question.dividend).toBeLessThanOrEqual(20);
    limits.dividend.max = 999;
    expect(divLong.generate(limits, "seed")).toEqual(one);
    expect(limits).toEqual(LONG);
  });
  it("is in a list only where the space is small", () => expect([divFact, divRemainder, divLong].map((s) => s.list !== undefined)).toEqual([true, true, false]));
});

describe("the difficulty of a long division", () => {
  // Each range holds all questions of its kind, so this says it of any limits inside them.
  const range = (change: Partial<DivLongLimits>) => divLong.difficultyRange({ ...LONG, ...change });
  it("rises with each digit of the quotient, then with a zero in it", () => {
    const kinds = [1, 2, 3].flatMap((n) => [range({ quotientDigits: r(n, n), zeroInside: "never", zeroAtEnd: "never" }), ...(n > 1 ? [range({ quotientDigits: r(n, n), zeroAtEnd: "only" })] : [])]);
    kinds.slice(1).forEach((kind, i) => expect(kind.easiest).toBeGreaterThan(kinds[i].hardest));
    expect(kinds).toHaveLength(5);
  });
});
