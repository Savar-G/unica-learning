import { describe, expect, it } from "vitest";
import type { QuestionPackage } from "./question-package";
import { contentIssues, guideIsAnswer, malformedLine } from "./workbook-content-checks";
import type { GeneratedPage } from "./workbook-generator";
import { trivialCalculation, twoWaysMethods } from "./workbook-two-ways";

// Made-up pages: each check is shown failing on the problem a read of the live U10 Book 1 found (2026-11-17), and
// passing once it is put right.
const pkg = (text: string, o: { templateId?: string; kind?: string; answer?: number | string } = {}): QuestionPackage => ({
  text, level: 10, templateId: o.templateId ?? null, operation: o.kind ? { kind: o.kind, operands: [0, 0] } : null,
  answer: typeof o.answer === "number" ? { value: { type: "number", value: o.answer } } : null,
  item: { regions: typeof o.answer === "string" ? [{ id: "c", kind: "choice", mark: "circle", label: null, choices: [o.answer], answer: o.answer }] : [] },
} as unknown as QuestionPackage);
const page = (number: number, day: number | null, questions: { place: string; package: QuestionPackage }[], content: unknown = null): GeneratedPage =>
  ({ number, day, questions: questions.map((q, i) => ({ number: i + 1, itemPlan: { template: { challengeTemplates: 6 } }, ...q })), content } as unknown as GeneratedPage);
const reasons = (pages: GeneratedPage[]) => contentIssues(pages).map((i) => i.reason);

describe("Use 2 ways methods come from the kind of question", () => {
  it("gives a pattern its own methods, never the times-table pair", () => {
    const pair = twoWaysMethods(pkg("Number 1 is 26. Add 2 each time. Number 4 is ?", { templateId: "3.6-increasing-pattern#2.1:bare" }));
    expect(pair).toEqual(["write each number of the pattern in turn", "add all the jumps at once"]);
    expect(twoWaysMethods(pkg("The first two numbers in a pattern are 71 and 69. How much is taken away each time?", { templateId: "3.6-decreasing-pattern#1.2:bare" })))
      .toEqual(["subtract the second number from the first", "count back from the first number to the second"]);
  });
  it("gives place value and expanded form no pair, and refuses trivial sums", () => {
    expect(twoWaysMethods(pkg("Complete the expanded form: 450 = 400 + ?", { templateId: "3.1-place-value-1000#2.3:missing" }))).toBeNull();
    expect(twoWaysMethods(pkg("6 hundreds + 10 tens + 7 ones = ?", { templateId: "3.1-place-value-1000#3.2:bare" }))).toBeNull();
    expect(twoWaysMethods(pkg("300 + 0 = ?", { kind: "add" }))).toBeNull();
    expect(twoWaysMethods(pkg("10 + ? = 17", { kind: "missing-addend" }))).toBeNull();
    expect(twoWaysMethods(pkg("Start at 14. Add 2. What comes next?", { templateId: "3.6-increasing-pattern#1.1:bare" }))).toBeNull();
    expect(twoWaysMethods(pkg("A pattern adds 25 each time. Its second number is 451. What is its first number?", { templateId: "3.6-increasing-pattern#2.3:missing" })))
      .toEqual(["take away one jump from the second number", "count back from the second number"]);
    expect(twoWaysMethods(pkg("300 + 200 = ?", { kind: "add" }))).toBeNull();
    expect(trivialCalculation([40, 30])).toBe(true);
    expect(twoWaysMethods(pkg("47 + 28 = ?", { kind: "add" }))).toEqual(["add the tens, then the ones", "make a friendly number first"]);
    expect(twoWaysMethods(pkg("81 − 37 = ?", { kind: "subtract" }))).toEqual(["take away the tens, then the ones", "count up from the smaller number"]);
  });
  it("fails a book whose Use 2 ways question has no pair", () => {
    expect(reasons([page(22, 3, [{ place: "solve-it-two-ways", package: pkg("300 + 0 = ?", { kind: "add" }) }])])[0]).toMatch(/asks for 2 ways but has no two methods/);
    expect(reasons([page(22, 3, [{ place: "solve-it-two-ways", package: pkg("47 + 28 = ?", { kind: "add" }) }])])).toEqual([]);
  });
});

describe("a sensible estimate never answers itself", () => {
  it("fails a guide that is the answer, and passes a guide for one group of several", () => {
    const old = pkg("Use about 21 grapes per small bunch as a guide. About how many grapes are in one small bunch?", { answer: 21 });
    const fixed = pkg("Use about 20 grapes per small bunch as a guide. About how many grapes are in 3 small bunches?", { answer: 60 });
    expect(guideIsAnswer(old)).toBe(true);
    expect(guideIsAnswer(fixed)).toBe(false);
    expect(guideIsAnswer(pkg("Use about 21 grapes per small bunch as a guide. True or false: about 21 grapes are in a small bunch.", { answer: "21" }))).toBe(true);
    expect(reasons([page(60, 8, [{ place: "now-you", package: old }])])[0]).toMatch(/answer is the guide/);
  });
});

describe("headings, Watch out lines and the plan", () => {
  const day = (blocks: unknown[]) => ({ kind: "day", title: "Trading tens and ones (up to 19 tens)", blocks });
  it("fails an empty section heading", () => {
    expect(reasons([page(6, 1, [], day([{ slot: "practice-row", items: [], label: "A little harder" }]))])[0]).toMatch(/heading "A little harder" over no questions/);
    expect(reasons([page(6, 1, [], day([{ slot: "practice-row", items: [], label: undefined }]))])).toEqual([]);
    // "A little harder" over a row of review only reads as an empty section followed by Review.
    expect(reasons([page(6, 1, [], day([{ slot: "practice-row", items: [5, 6, 7, 8], label: "A little harder", reviewFrom: 5 }]))])[0]).toMatch(/over review questions only/);
    expect(reasons([page(6, 1, [], day([{ slot: "practice-row", items: [5, 6, 7, 8], label: "A little harder", reviewFrom: 7 }]))])).toEqual([]);
  });
  it("fails a topic name where the Watch out goes, and a broken Watch out", () => {
    expect(reasons([page(52, 7, [], day([{ slot: "worked-example", items: [], label: "Trading tens and ones (up to 19 tens)", explain: "Trading tens and ones (up to 19 tens)." }]))])[0])
      .toMatch(/prints its topic/);
    expect(malformedLine("Watch out: 50, 45, 40, 45:. No: the pattern goes down by 5, so after 40 comes 35.")).toBe(true);
    expect(malformedLine("Watch out: In 50, 45, 40, the next number is 45. No: the pattern goes down by 5, so after 40 comes 35.")).toBe(false);
    expect(reasons([page(68, 9, [], day([{ slot: "worked-example", items: [], explain: "Watch out: 50, 45, 40, 45:. No: after 40 comes 35." }]))])[0]).toMatch(/broken line/);
  });
  it("fails a plan whose rows say the same thing on two days", () => {
    const plan = (seconds: string[]) => page(2, null, [], { kind: "how-plan", rows: seconds.map((second, i) => ({ day: i + 1, topic: `T${i}`, second, pages: [0, 0] })) });
    expect(reasons([plan(["Learn, practise, then apply", "Learn, practise, then apply"])])[0]).toMatch(/on more than one day/);
    expect(reasons([plan(["Learn it, then review facts to 20", "Learn it, then review add within 100"])])).toEqual([]);
  });
});

describe("number stories and Challenges vary across the book", () => {
  it("fails a story or Challenge template that comes back on another day", () => {
    const story = (day: number) => page(day * 8, day, [{ place: "word-problems", package: pkg("Hana has $15 and wants a toy for $19.", { templateId: "2.12-spend-save#2.2:story" }) }]);
    // Days 1, 4 and 7 (the live book): the third use fails; Days 8 and 10 (two days apart) fail; Days 2 and 8 pass.
    expect(reasons([story(1), story(4), story(7)])[0]).toMatch(/repeats the number story template of page 8/);
    expect(reasons([story(8), story(10)])[0]).toMatch(/repeats the number story template/);
    expect(reasons([story(2), story(8)])).toEqual([]);
    expect(reasons([story(1)])).toEqual([]);
    // (U4 to U9 keep their small pools: no check below U10.)
    const young = (day: number) => page(day * 8, day, [{ place: "word-problems", package: { ...pkg("A story."), level: 4, templateId: "1.1-count#1.1:story" } as QuestionPackage }]);
    expect(reasons([young(1), young(2), young(3)])).toEqual([]);
    // A Challenge page sharing 2 or more templates with one 1 or 2 days away is nearly identical (Days 8 and 10 shared 3),
    // when the step has two sets of hard forms to give each day its own.
    const challenge = (day: number, ids: number[]) => page(day * 8, day, ids.map((i) => ({ place: "challenge", package: pkg("A task.", { templateId: `3.1-estimate-quantity#3.${i}:story` }) })));
    expect(reasons([challenge(8, [8, 9, 10]), challenge(10, [8, 9, 10])])[0]).toMatch(/the Challenge repeats 3 templates of page 64/);
    expect(reasons([challenge(9, [5, 6, 8]), challenge(10, [8, 9, 10])])).toEqual([]);
    expect(reasons([challenge(2, [8, 9, 10]), challenge(10, [8, 9, 10])])).toEqual([]);
  });
});

describe("choices print in one form", () => {
  it("keeps the article on every choice when the key has one", async () => {
    const { choicesFor } = await import("./workbook-step-items");
    expect(choicesFor("Which is worth more in 658: the hundreds digit or the tens digit?", "the hundreds digit")).toEqual(["the hundreds digit", "the tens digit"]);
    expect(choicesFor("Which is worth more in 568: the hundreds digit or the tens digit?", "the tens digit")).toEqual(["the hundreds digit", "the tens digit"]);
    expect(choicesFor("Is it a cone or a cube?", "cube")).toEqual(["cone", "cube"]);
  });
});
