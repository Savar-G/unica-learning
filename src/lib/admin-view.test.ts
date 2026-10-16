import { describe, expect, it } from "vitest";
import type { FactsTest, Flag, Question, StoredTest } from "@/lib/assessment";
import {
  NO_FILTERS,
  answerLines,
  duration,
  factLines,
  filterQuery,
  filterTests,
  flagText,
  helpAnswerText,
  parseFilters,
  when,
  type AdminTestRow,
  type AnswerRecord,
  type ReviewRecord,
} from "@/lib/admin-view";

describe("admin list filters (#77)", () => {
  it("reads each filter from the query string", () => {
    expect(parseFilters({ status: "completed", grade: "3", province: "ON", flag: "help", ai: "low" })).toEqual({
      status: "completed",
      grade: 3,
      province: "ON",
      help: true,
      flagged: false,
      lowAi: true,
    });
  });

  it("ignores values that are not real choices, so a typed URL cannot reach the query", () => {
    expect(parseFilters({ status: "deleted", grade: "9", province: "QC", flag: "yes", ai: "high" })).toEqual(NO_FILTERS);
    expect(parseFilters({ grade: "3.5" })).toEqual(NO_FILTERS);
    expect(parseFilters({ grade: ["3", "4"] })).toEqual(NO_FILTERS);
    expect(parseFilters({})).toEqual(NO_FILTERS);
  });

  it("writes the filters back as a query string for links, and nothing when none is set", () => {
    expect(filterQuery({ ...NO_FILTERS, grade: 4, help: true })).toBe("?grade=4&flag=help");
    expect(filterQuery(NO_FILTERS)).toBe("");
    const all = parseFilters({ status: "expired", grade: "7", province: "other", flag: "help", ai: "low" });
    expect(parseFilters(Object.fromEntries(new URLSearchParams(filterQuery(all))))).toEqual(all);
  });
});

describe("which tests the filters keep (#77)", () => {
  const test = (id: string, over: Partial<AdminTestRow> = {}, flags?: Flag[]): AdminTestRow => ({
    id,
    status: "completed",
    grade: 3,
    province: "BC",
    flags: flags ?? [],
    ...over,
  });
  const tests = [
    test("helped", {}, [{ kind: "helped", answer: "a-little" }]),
    test("fast-right", { grade: 5 }, [{ kind: "too-fast", questionIds: ["q1", "q2", "q3"], right: 3 }]),
    test("fast-wrong", { province: "ON" }, [{ kind: "too-fast", questionIds: ["q1", "q2", "q3"], right: 2 }]),
    test("clean", { status: "expired", flags: null }),
  ];
  const ids = (f: Parameters<typeof filterTests>[1], low = new Set<string>()) => filterTests(tests, f, low).map((t) => t.id);

  it("keeps every test with no filter", () => {
    expect(ids(NO_FILTERS)).toEqual(["helped", "fast-right", "fast-wrong", "clean"]);
  });

  it("includes fast wrong answers in the flagged filter", () => {
    expect(ids(parseFilters({ flag: "any" }))).toEqual(["helped", "fast-right", "fast-wrong"]);
  });

  it("flagged: keeps the tests where help is likely, by the assessment core's rule", () => {
    // Fast wrong answers make a level lower, not higher, so 2 fast right answers are not enough.
    expect(ids({ ...NO_FILTERS, help: true })).toEqual(["helped", "fast-right"]);
  });

  it("low AI: keeps the tests with a low-confidence review", () => {
    expect(ids({ ...NO_FILTERS, lowAi: true }, new Set(["fast-wrong", "not-listed"]))).toEqual(["fast-wrong"]);
  });

  it("grade, province and status narrow the list, and filters add up", () => {
    expect(ids({ ...NO_FILTERS, grade: 5 })).toEqual(["fast-right"]);
    expect(ids({ ...NO_FILTERS, province: "ON" })).toEqual(["fast-wrong"]);
    expect(ids({ ...NO_FILTERS, status: "expired" })).toEqual(["clean"]);
    expect(ids({ ...NO_FILTERS, status: "completed", help: true, grade: 3 })).toEqual(["helped"]);
  });
});

describe("a test's answers beside its questions (#77)", () => {
  const question = (id: string, prompt: string, answer: string, over: Partial<Question> = {}): Question => ({
    id,
    templateId: `t-${id}`,
    level: 3,
    strand: "O",
    format: "number",
    whiteboard: true,
    prompt,
    readAloud: prompt,
    values: {},
    answer,
    wrong: [],
    ...over,
  });
  const test: StoredTest = {
    profile: { grade: 3, province: "BC" },
    seed: 7,
    stage1: [question("q1", "What is 52 - 17?", "35", { wrong: [{ value: "45", misconception: "O1" }] }), question("q2", "What is 6 + 7?", "13")],
    stage2: { up: [question("u1", "What is 4 x 6?", "24", { level: 4, strand: "A" })], stay: [], down: [] },
  };
  const answer = (position: number, question_id: string, over: Partial<AnswerRecord> = {}): AnswerRecord => ({
    position,
    question_id,
    response: "",
    correct: true,
    misconception: null,
    time_ms: 20_000,
    work_required: false,
    work_path: null,
    work_text: null,
    ...over,
  });
  const review: ReviewRecord = {
    question_id: "q1",
    error_type: "subtraction",
    kind: "misunderstanding",
    comment: "Took 2 from 7 in the ones column.",
    score: "0.55",
    confidence: "low",
    model: "claude-test",
  };
  const lines = answerLines(
    test,
    [
      answer(0, "q1", { response: "45", correct: false, misconception: "O1", time_ms: 41_000, work_required: true, work_path: "p/a/q1-x.png", work_text: "52-17" }),
      answer(1, "q2", { response: "13", time_ms: 2_500 }),
      answer(2, "u1", { response: "24", time_ms: 3_000 }),
    ],
    [review],
  );

  it("shows each answer, in test order, with its question, the right answer and the stage", () => {
    expect(lines.map((l) => [l.number, l.stage, l.prompt, l.rightAnswer, l.response, l.correct])).toEqual([
      [1, 1, "What is 52 - 17?", "35", "45", false],
      [2, 1, "What is 6 + 7?", "13", "13", true],
      [3, 2, "What is 4 x 6?", "24", "24", true],
    ]);
    expect(lines[2]).toMatchObject({ level: 4, strand: "A" });
  });

  it("names the coded mistake a wrong answer matches", () => {
    expect(lines[0].misconception).toBe("O1: Subtracts the smaller digit from the larger in each column");
    expect(lines[1].misconception).toBeNull();
  });

  it("marks answers under 3 seconds as too fast, as the help flags count them", () => {
    expect(lines.map((l) => [l.timeMs, l.tooFast])).toEqual([[41_000, false], [2_500, true], [3_000, false]]);
  });

  it("keeps the shown work and the AI review with the answer, the score as a number", () => {
    expect(lines[0].work).toEqual({ required: true, image: "p/a/q1-x.png", text: "52-17" });
    expect(lines[0].review).toEqual({ ...review, score: 0.55 });
    expect(lines[1].review).toBeNull();
    expect(lines[1].work).toEqual({ required: false, image: null, text: null });
  });

  it("still shows an answer whose question is missing from the stored test", () => {
    const [line] = answerLines(test, [answer(0, "gone", { response: "9" })], []);
    expect(line).toMatchObject({ number: 1, prompt: null, rightAnswer: null, response: "9" });
  });
});

describe("the quick facts answers (#77)", () => {
  const facts: FactsTest = {
    grade: 3,
    facts: [
      { id: "f1", family: "add20", a: 7, op: "+", b: 5, answer: 12 },
      { id: "f2", family: "sub20", a: 15, op: "-", b: 8, answer: 7 },
      { id: "f3", family: "add20", a: 9, op: "+", b: 9, answer: 18 },
    ],
  };

  it("shows each fact in order, the answer, and the server's time after the one before (answers from before #185)", () => {
    const lines = factLines(facts, [
      { position: 1, fact_id: "f2", response: "", correct: false, at_ms: 6_100 },
      { position: 0, fact_id: "f1", response: "12", correct: true, at_ms: 2_400 },
      { position: 2, fact_id: "f3", response: "17", correct: false, at_ms: 9_000 },
    ]);
    expect(lines).toEqual([
      { number: 1, fact: "7 + 5", rightAnswer: "12", response: "12", skipped: false, correct: true, atMs: 2_400, serverMs: 2_400, browserMs: null },
      { number: 2, fact: "15 - 8", rightAnswer: "7", response: "", skipped: true, correct: false, atMs: 6_100, serverMs: 3_700, browserMs: null },
      { number: 3, fact: "9 + 9", rightAnswer: "18", response: "17", skipped: false, correct: false, atMs: 9_000, serverMs: 2_900, browserMs: null },
    ]);
  });

  it("shows the time for each fact as stored: the server's and the browser's (#185)", () => {
    const lines = factLines(facts, [
      { position: 0, fact_id: "f1", response: "12", correct: true, at_ms: 2_400, server_ms: 2_400, browser_ms: 1_950 },
      { position: 1, fact_id: "f2", response: "7", correct: true, at_ms: 2_600, server_ms: 200, browser_ms: 2_100 },
      { position: 2, fact_id: "f3", response: "18", correct: true, at_ms: 9_000, server_ms: 6_400, browser_ms: null },
    ]);
    expect(lines.map(({ number, atMs, serverMs, browserMs }) => ({ number, atMs, serverMs, browserMs }))).toEqual([
      { number: 1, atMs: 2_400, serverMs: 2_400, browserMs: 1_950 },
      { number: 2, atMs: 2_600, serverMs: 200, browserMs: 2_100 },
      { number: 3, atMs: 9_000, serverMs: 6_400, browserMs: null },
    ]);
  });
});

describe("flags and times in plain words (#77)", () => {
  const numbers = new Map([["q2", 2], ["q5", 5], ["q7", 7]]);

  it("says each flag with the question numbers of the test", () => {
    expect(flagText({ kind: "helped", answer: "a-little" }, numbers)).toBe('Answered "A little" to "Did anyone help?"');
    expect(flagText({ kind: "too-fast", questionIds: ["q2", "q5"], right: 1 }, numbers)).toBe("2 answers under 3 s, 1 right: questions 2, 5");
    expect(flagText({ kind: "too-fast", questionIds: ["q7"], right: 1 }, numbers)).toBe("1 answer under 3 s, 1 right: question 7");
    expect(flagText({ kind: "pause-then-perfect", questionId: "q7", pauseMs: 250_000, rightBefore: 1 }, numbers))
      .toBe("4 min 10 s on question 7, then 4 right in a row (1 of 4 right before)");
  });

  it("falls back to the question id when the number is not known", () => {
    expect(flagText({ kind: "too-fast", questionIds: ["x9"], right: 0 }, numbers)).toBe("1 answer under 3 s, 0 right: question x9");
  });

  it("says the help answer, and when the test did not ask it", () => {
    expect(["yes", "a-little", "no", null].map((h) => helpAnswerText(h as never))).toEqual(["Yes", "A little", "No", "Not asked"]);
  });

  it("writes a moment in Pacific time, summer and winter, and a dash for none", () => {
    expect(when("2026-10-11T17:55:09Z")).toBe("2026-10-11 10:55");
    expect(when("2026-12-01T08:05:00Z")).toBe("2026-12-01 00:05");
    expect(when(null)).toBe("-");
  });

  it("writes a time in seconds below a minute, else in minutes and seconds", () => {
    expect([0, 2_540, 59_400, 60_000, 250_000, 3_600_000].map(duration)).toEqual(["0.0 s", "2.5 s", "59.4 s", "1 min 0 s", "4 min 10 s", "60 min 0 s"]);
  });
});
