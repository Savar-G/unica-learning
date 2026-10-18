import { describe, expect, it, vi } from "vitest";
import { checked } from "@/lib/assessment/scripted-child";
import {
  COPY_FIELDS,
  anonymousTestCopy,
  createSession,
  learnerProfile,
  nextQuestion,
  restoreSession,
  startAttempt,
  storedTest,
  submitAnswer,
  type Question,
  type StoredTest,
} from "@/lib/assessment";
import type { AnswerEvents } from "@/lib/answer-events";
import { answerQuestion, changeAnswer, doneChecking, finishTest, type ChangeInput } from "@/lib/test-attempt";
import { memoryAttemptStore, type MemoryAnswer as StoredAttemptAnswer, type MemoryTest } from "@/lib/test-attempt-memory";
import { exportChunks, type ExportRequest } from "@/lib/admin-export";
import { memoryExportReader, type ExportData } from "@/lib/admin-export-memory";
import { loadReportInputs } from "@/lib/report-loading";
import { memoryReportReaders } from "@/lib/report-loading-memory";

vi.mock("server-only", () => ({}));

// A changed answer (spec #249, stories 24 and 30) must reach every reader of the stored test as the child's final
// answer, with no new logic in the readers: the admin export (D-118), the copy without names (D-119) and the learner
// profile (D-115). One test is taken through the test attempt module against the in-memory store with the clock passed
// in; two answers are changed on the way; each reader then reads the stored result through its public interface.
// Asha, grade 4 in BC, seed 7: stage 1 has 18 questions, stage 2 has 24.
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 17, 18, 0);
const P1 = "00000000-0000-4000-8000-0000000000a1";
const C1 = "00000000-0000-4000-8000-0000000000c1";
const TEST_ID = "00000000-0000-4000-8000-0000000000e1";
const ASHA = { grade: 4, province: "BC" } as const;
const iso = (ms: number) => new Date(ms).toISOString();

/** The answers a scripted child gives to the first `count` questions of a stored test, 20 seconds each, marked as the module stores them. */
function answersOf(test: StoredTest, count: number, script: (q: Question, index: number) => string): StoredAttemptAnswer[] {
  let session = restoreSession(test, []);
  for (let q = nextQuestion(session); q && session.answers.length < count; q = nextQuestion(session)) {
    session = checked(submitAnswer(session, { questionId: q.id, response: script(q, session.answers.length), timeMs: 20_000 }));
  }
  return session.answers.map((a) => ({ ...a }));
}

/** A wrong answer the screen offers that matches no known mistake: another choice, or a number. */
const uncoded = (q: Question) => (q.format === "choice" ? q.choices!.find((c) => c !== q.answer && !q.wrong.some((w) => w.value === c))! : "9999");
const hasUncoded = (q: Question) => uncoded(q) !== undefined && !q.wrong.some((w) => w.value === uncoded(q));

/** What the child did in one visit: answer changes, read-aloud uses, time away. */
const events = (changes: [string, number][], read: number[] = [], away = { count: 0, ms: 0 }): AnswerEvents =>
  ({ changes: changes.map(([value, atMs]) => ({ value, atMs })), readAloud: { count: read.length, atMs: read }, away });

/** A revisit of the question at `position` that sends `response` after `timeMs`, with an unchanged board. */
const revisit = (row: MemoryTest, position: number, response: string, more: Partial<ChangeInput> = {}): ChangeInput => {
  const session = restoreSession(row.test, row.answers, row.route ?? null);
  const q = [...session.stage1, ...(session.route ? session.stage2[session.route] : [])][position];
  return { questionId: q.id, response, timeMs: 4 * SECOND, work: { png: null, text: "" }, workChanged: false, ...more };
};

/**
 * The test, finished. The child changed two answers of stage 1 before the grid's "Done checking" locked it:
 * - question A was right (first visit) and became a coded wrong answer (a known mistake);
 * - question B was a wrong answer matching no known mistake and became the right answer.
 * Both carry typed working, which only the stored row may keep. Then the child answered stage 2, all right.
 */
async function changedTest() {
  const test = storedTest(createSession(ASHA, 7));
  const stage1 = test.stage1;
  // A: the first stage 1 question at or below the school grade with a known mistake; B: the first after it with a choice or number.
  const a = stage1.findIndex((q) => q.level <= ASHA.grade && q.wrong.length > 0);
  const b = stage1.findIndex((q, i) => i > a && q.level <= ASHA.grade && hasUncoded(q));
  const qa = stage1[a], qb = stage1[b];
  const coded = qa.wrong[0];
  const first = answersOf(test, 18, (q) => (q.id === qb.id ? uncoded(q) : q.answer));
  const row: MemoryTest = {
    ...startAttempt("a1", T0), lastAnswerAt: T0 + HOUR, resumeUntil: T0 + HOUR + DAY,
    parentId: P1, childId: C1, seed: 7, test, answers: first,
  };
  // The first visit's timeline of A and B, as the answer request stored it.
  const visit = (position: number, changes: [string, number][], read: number[], away: { count: number; ms: number }) => {
    row.answers[position] = { ...row.answers[position], workText: "I counted on my fingers", timeline: { shownAt: T0 + 30 * MINUTE + position * SECOND, answeredAt: T0 + HOUR - 18 * SECOND + position * SECOND, events: events(changes, read, away) } } as StoredAttemptAnswer;
  };
  visit(a, [["1", 3_000], [qa.answer, 15_000]], [1_000], { count: 1, ms: 2_000 });
  visit(b, [[uncoded(qb), 5_000]], [], { count: 0, ms: 0 });
  const memory = memoryAttemptStore({ children: [{ id: C1, parentId: P1, ...ASHA }], tests: [row] });
  const tests = memory.tests;

  // The second visit of A: 4 s on the question, one change to the known mistake, one more read-aloud use, one more time away.
  const changeA = revisit(row, a, coded.value, { timeMs: 4 * SECOND, events: events([[coded.value, 2_000]], [500], { count: 1, ms: 300 }), work: { png: null, text: "" } });
  expect(await changeAnswer(memory.store, P1, "a1", changeA, T0 + 2 * HOUR)).toMatchObject({ ok: true });
  // The second visit of B: 6 s, one change to the right answer.
  const changeB = revisit(row, b, qb.answer, { timeMs: 6 * SECOND, events: events([[qb.answer, 3_000]]) });
  expect(await changeAnswer(memory.store, P1, "a1", changeB, T0 + 2 * HOUR + MINUTE)).toMatchObject({ ok: true });

  expect(await doneChecking(memory.store, P1, "a1", "stage1", T0 + 2 * HOUR + 2 * MINUTE)).toMatchObject({ ok: true });
  // Stage 2: every answer right, 20 s each.
  let now = T0 + 3 * HOUR;
  for (let i = 18; i < 42; i++) {
    const session = restoreSession(tests[0].test, tests[0].answers, tests[0].route ?? null);
    const q = nextQuestion(session)!;
    expect(await answerQuestion(memory.store, P1, "a1", { questionId: q.id, response: q.answer, timeMs: 20_000, work: { png: null, text: "" } }, (now += 30 * SECOND))).toMatchObject({ ok: true });
  }
  expect(await finishTest(memory.store, P1, "a1", "no", now + MINUTE)).toMatchObject({ ok: true, finished: "now" });
  return { row: tests[0], a, b, qa, qb, coded };
}

/** What every reader must find for the two changed answers. */
function finalOf(t: Awaited<ReturnType<typeof changedTest>>) {
  return {
    a: { position: t.a, response: t.coded.value, correct: false, misconception: t.coded.misconception, timeMs: 24_000 },
    b: { position: t.b, response: t.qb.answer, correct: true, misconception: null, timeMs: 26_000 },
    // The visits merged in order, the second visit timed from the first visit's total time.
    changesA: [{ value: "1", atMs: 3_000 }, { value: t.qa.answer, atMs: 15_000 }, { value: t.coded.value, atMs: 22_000 }],
    changesB: [{ value: uncoded(t.qb), atMs: 5_000 }, { value: t.qb.answer, atMs: 23_000 }],
  };
}

describe("a changed answer, as the module stores it (the fixture the readers below read)", () => {
  it("holds the final response, mark, misconception, total time and merged timeline", async () => {
    const t = await changedTest();
    const want = finalOf(t);
    expect(t.row.answers[t.a]).toMatchObject({
      response: want.a.response, correct: false, misconception: want.a.misconception, timeMs: 24_000,
      timeline: { events: { changes: want.changesA, readAloud: { count: 2, atMs: [1_000, 20_500] }, away: { count: 2, ms: 2_300 } } },
    });
    expect(t.row.answers[t.b]).toMatchObject({
      response: want.b.response, correct: true, misconception: null, timeMs: 26_000, timeline: { events: { changes: want.changesB } },
    });
    expect(want.a.misconception).not.toBeNull();
    expect(t.row.answers).toHaveLength(42);
    expect(t.row.status).toBe("completed");
  });
});

describe("the admin export (D-118) of a changed answer", () => {
  /** The rows of public.answers as the Supabase adapter writes them (timeline columns: src/lib/test-attempt-server.ts). */
  const dataOf = (t: Awaited<ReturnType<typeof changedTest>>): Partial<ExportData> => ({
    assessments: [{
      id: TEST_ID, created_at: iso(T0), parent_id: P1, child_id: C1, grade: 4, province: "BC", status: t.row.status, seed: 7,
      started_at: iso(T0), last_answer_at: iso(T0), completed_at: iso(T0 + 4 * HOUR), resume_until: iso(T0 + DAY), route: t.row.route ?? null,
      help: t.row.help ?? null, placement: t.row.placement ?? null, device: null, break_started_at: null, break_ended_at: null,
      break_skipped: null, break_ms: null, extra_offered_at: null, extra_skipped_at: null, extra_started_at: null, extra_finished_at: null,
      test: t.row.test,
    }],
    answers: t.row.answers.map((x, position) => ({
      id: `00000000-0000-4000-8000-${(0x100 + position).toString(16).padStart(12, "0")}`, created_at: iso(T0), assessment_id: TEST_ID, position,
      question_id: x.questionId, template_id: x.templateId ?? null, values: x.values ?? null, response: x.response, correct: x.correct ?? null,
      misconception: x.misconception ?? null, time_ms: x.timeMs,
      shown_at: x.timeline?.shownAt == null ? null : iso(x.timeline.shownAt), answered_at: x.timeline ? iso(x.timeline.answeredAt) : null,
      answer_changes: x.timeline?.events?.changes ?? null, read_aloud_count: x.timeline?.events?.readAloud.count ?? null,
      read_aloud_at_ms: x.timeline?.events?.readAloud.atMs ?? null, away_count: x.timeline?.events?.away.count ?? null,
      away_ms: x.timeline?.events?.away.ms ?? null, work_required: x.workRequired ?? false, work_path: x.workPath ?? null,
      work_text: x.workText ?? null, strokes_path: x.strokesPath ?? null, round: x.round ?? "main",
    })),
  });

  async function download(data: Partial<ExportData>, request: ExportRequest): Promise<string> {
    let text = "";
    for await (const chunk of exportChunks(memoryExportReader(data), request)) text += chunk;
    return text;
  }

  it("holds the final response, mark, misconception and total time of the changed answers, one row each, in the JSON", async () => {
    const t = await changedTest();
    const want = finalOf(t);
    const rows = JSON.parse(await download(dataOf(t), { dataset: "answers", format: "json", withTests: false }));
    expect(rows).toHaveLength(42);
    expect(rows[t.a]).toMatchObject({ position: want.a.position, response: want.a.response, correct: false, misconception: want.a.misconception, time_ms: 24_000 });
    expect(rows[t.b]).toMatchObject({ position: want.b.position, response: want.b.response, correct: true, misconception: null, time_ms: 26_000 });
    // The total time of the test is the sum of the rows: every visit, counted once.
    expect(rows.reduce((n: number, r: { time_ms: number }) => n + r.time_ms, 0)).toBe(42 * 20_000 + 4_000 + 6_000);
  });

  it("holds the merged timeline in order: the answer changes of every visit, and the read-aloud and away totals", async () => {
    const t = await changedTest();
    const want = finalOf(t);
    const rows = JSON.parse(await download(dataOf(t), { dataset: "answers", format: "json", withTests: false }));
    expect(rows[t.a].answer_changes).toEqual(want.changesA);
    expect(rows[t.b].answer_changes).toEqual(want.changesB);
    expect(rows[t.a]).toMatchObject({ read_aloud_count: 2, read_aloud_at_ms: [1_000, 20_500], away_count: 2, away_ms: 2_300 });
    // The changes are in the order the child made them.
    const times = (rows[t.a].answer_changes as { atMs: number }[]).map((c) => c.atMs);
    expect(times).toEqual([...times].sort((x, y) => x - y));
  });

  it("reads the same in the CSV: the final values in their cells, and the timeline as JSON text", async () => {
    const t = await changedTest();
    const want = finalOf(t);
    const text = await download(dataOf(t), { dataset: "answers", format: "csv", withTests: false });
    const lines = text.replace(/^﻿/, "").split("\r\n").filter(Boolean);
    const head = lines[0].split(",");
    const cell = (line: string, name: string) => {
      // The changed rows hold quoted JSON cells with commas: read the row as a spreadsheet does.
      const out: string[] = []; let cur = ""; let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quoted) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c; }
        else if (c === '"' && cur === "") quoted = true;
        else if (c === ",") { out.push(cur); cur = ""; }
        else cur += c;
      }
      out.push(cur);
      return out[head.indexOf(name)];
    };
    const rowA = lines.slice(1).find((l) => cell(l, "position") === String(t.a))!;
    expect(cell(rowA, "response")).toBe(want.a.response);
    expect(cell(rowA, "correct")).toBe("false");
    expect(cell(rowA, "misconception")).toBe(want.a.misconception);
    expect(cell(rowA, "time_ms")).toBe("24000");
    expect(JSON.parse(cell(rowA, "answer_changes"))).toEqual(want.changesA);
    expect(lines).toHaveLength(1 + 42);
  });
});

describe("the copy without names (D-119) of a changed answer", () => {
  /** What family_copy_sources returns for the test (supabase/migrations/20261016_test_copies_without_names.sql), plus identifying values the copy must drop. */
  const sourceOf = (t: Awaited<ReturnType<typeof changedTest>>) => {
    const row = t.row;
    const session = restoreSession(row.test, row.answers, row.route ?? null);
    const questions: Question[] = [...session.stage1, ...session.stage2[session.route!]];
    return {
      id: TEST_ID, copied: false, testFamily: false, parentId: P1, childId: C1, firstName: "Maya", email: "maya.parent@example.invalid", seed: 7,
      grade: 4, province: "BC", status: row.status, route: row.route ?? null, help: row.help ?? null,
      startedAt: iso(T0), completedAt: iso(T0 + 4 * HOUR), lastAnswerAt: iso(T0 + 4 * HOUR),
      breakStartedAt: null, breakEndedAt: null, breakSkipped: null, breakMs: null, device: null,
      stored: { ...row.test, childName: "Maya" }, placement: { ...row.placement!, parentEmail: "maya.parent@example.invalid" },
      answers: row.answers.map((x, i) => ({
        position: i, questionId: x.questionId, templateId: questions[i].templateId, values: questions[i].values, response: x.response,
        correct: x.correct, misconception: x.misconception, timeMs: x.timeMs, workRequired: false,
        drawing: false, typed: x.workText != null, strokes: false, workPath: x.workPath ?? null, workText: x.workText ?? null, strokesPath: null,
        shownAt: x.timeline?.shownAt == null ? null : iso(x.timeline.shownAt), answeredAt: x.timeline ? iso(x.timeline.answeredAt) : null,
        changes: x.timeline?.events?.changes ?? null, readAloudCount: x.timeline?.events?.readAloud.count ?? null,
        readAloudAtMs: x.timeline?.events?.readAloud.atMs ?? null, awayCount: x.timeline?.events?.away.count ?? null, awayMs: x.timeline?.events?.away.ms ?? null,
      })),
      shows: [], facts: null, profile: null, learning: null,
    };
  };
  const keysOf = (value: unknown): string[] => typeof value !== "object" || value === null ? []
    : Array.isArray(value) ? value.flatMap(keysOf) : Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]);

  it("keeps the final response, mark, misconception and total time, and the merged answer changes in order", async () => {
    const t = await changedTest();
    const want = finalOf(t);
    const copy = anonymousTestCopy(sourceOf(t));
    expect(copy.questions).toHaveLength(42);
    expect(copy.questions[t.a]).toMatchObject({
      position: t.a, questionId: t.qa.id, response: want.a.response, correct: false, misconception: want.a.misconception, timeMs: 24_000,
      changes: want.changesA, readAloud: { count: 2, atMs: [1_000, 20_500] }, away: { count: 2, ms: 2_300 },
    });
    expect(copy.questions[t.b]).toMatchObject({
      position: t.b, response: want.b.response, correct: true, misconception: null, timeMs: 26_000, changes: want.changesB,
    });
  });

  it("leaks nothing new: the same fields as for any test, no typed working, no id or name, and no date and time", async () => {
    const t = await changedTest();
    const copy = anonymousTestCopy(sourceOf(t));
    expect(Object.keys(copy)).toEqual([...COPY_FIELDS.test]);
    for (const q of copy.questions) expect(Object.keys(q)).toEqual([...COPY_FIELDS.question]);
    const text = JSON.stringify(copy);
    for (const value of [P1, C1, TEST_ID, "Maya", "maya.parent@example.invalid", "I counted on my fingers"]) expect(text).not.toContain(value);
    for (const key of ["parentId", "childId", "firstName", "email", "seed", "workPath", "workText", "strokesPath", "childName", "parentEmail"]) expect(keysOf(copy)).not.toContain(key);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    // The changed answer's work flags say there was work, never what it was.
    expect(copy.questions[t.a].work).toEqual({ required: false, drawing: false, typed: true, strokes: false });
  });
});

describe("the learner profile (D-115) of a changed answer", () => {
  /** The report job's read of the stored test: the profile is built from what loadReportInputs reads back. */
  async function inputsOf(t: Awaited<ReturnType<typeof changedTest>>) {
    const row = t.row;
    const readers = memoryReportReaders({
      assessments: [{
        id: TEST_ID, parentId: P1, childId: C1, status: "completed", grade: 4, province: "BC", completedAt: iso(T0 + 4 * HOUR),
        placement: row.placement!, help: row.help ?? null, test: row.test,
      }],
      answers: row.answers.map((x, position) => ({
        assessmentId: TEST_ID, position, questionId: x.questionId, response: x.response, correct: x.correct ?? false,
        misconception: x.misconception ?? null, timeMs: x.timeMs, workRequired: false, workPath: x.workPath ?? null, workText: x.workText ?? null,
        readAloud: x.timeline?.events?.readAloud.count ?? null, away: x.timeline?.events?.away ?? null,
      })),
    });
    const inputs = (await loadReportInputs(readers.key(), TEST_ID, async () => { throw new Error("the comparison was read"); }))!;
    return { inputs, answers: inputs.profileAnswers() };
  }

  it("reads the final response, mark, misconception and total time of each changed answer, and the merged read-aloud and away totals", async () => {
    const t = await changedTest();
    const want = finalOf(t);
    const { answers, inputs } = await inputsOf(t);
    expect(answers).toHaveLength(42);
    expect(answers[t.a]).toMatchObject({ question: { id: t.qa.id }, response: want.a.response, correct: false, misconception: want.a.misconception, timeMs: 24_000, readAloud: 2, away: { count: 2, ms: 2_300 } });
    expect(answers[t.b]).toMatchObject({ question: { id: t.qb.id }, response: want.b.response, correct: true, misconception: null, timeMs: 26_000 });
    // The report's minutes are the sum of the final times.
    expect(inputs.minutes).toBe(Math.round((42 * 20_000 + 10_000) / 60_000));
  });

  it("builds a profile of the final answers: the changed-to-wrong answer is a struggle with its known mistake, the changed-to-right one is not", async () => {
    const t = await changedTest();
    const want = finalOf(t);
    const { inputs, answers } = await inputsOf(t);
    const profile = learnerProfile({ placement: inputs.assessment.placement, answers, help: "no", learning: null })!;
    const wrong = profile.struggles.flatMap((s) => s.wrong);
    expect(wrong).toEqual([expect.objectContaining({ questionId: t.qa.id, response: want.a.response, rightAnswer: t.qa.answer, misconception: want.a.misconception })]);
    expect(profile.struggles.flatMap((s) => s.misconceptions)).toEqual([want.a.misconception]);
    expect(wrong.map((w) => w.response)).not.toContain(t.qa.answer);
    expect(wrong.map((w) => w.questionId)).not.toContain(t.qb.id);
    // The read-aloud and away totals are those of the merged visits.
    expect(profile.behaviour.readAloud).toMatchObject({ uses: 2 });
    expect(profile.behaviour.away).toMatchObject({ times: 2, ms: 2_300 });
  });
});
