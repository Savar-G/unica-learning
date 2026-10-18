import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REPORTED_STRAND, createSession, nextQuestion, restoreSession, startAttempt, storedTest, type LearnerProfile, type Question } from "@/lib/assessment";
import type { AiClient } from "@/lib/ai-client";
import { memoryTransport } from "@/lib/email-delivery-memory";
import { fakeProfileAi } from "@/lib/learner-profile-ai-fake";
import { memoryLearnerProfileStore } from "@/lib/learner-profile-memory";
import { runReportJob } from "@/lib/report-job";
import { memoryReportJobStore } from "@/lib/report-job-memory";
import { memoryReportReaders, type MemoryReportTables } from "@/lib/report-loading-memory";
import { memoryReportLedger } from "@/lib/report-row-ledger-memory";
import { answerQuestion, extraRoundState, finishTest, skipExtraRound, stopExtraRound, takeExtraRound, doneChecking } from "@/lib/test-attempt";
import { memoryAttemptStore, type MemoryTest } from "@/lib/test-attempt-memory";

// #190 (spec #181): a finished extra round builds the report again. The child's test runs through the test attempt
// module on its in-memory store; after each finish, its stored rows are copied into the report job's in-memory tables
// (one database), and the job runs as the finish route runs it. The simpler path for the report email: no second email.
// The report row is rebuilt in place, and the parent reads the new report in the account.
vi.mock("server-only", () => ({}));

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 16, 18, 0);
const ORIGIN = "https://unica.test";
const ASHA = { grade: 4, province: "BC" } as const;
const PRIYA = { name: "Priya Shah", email: "priya@family.ca" };

/** A wrong answer the module takes for the question: another choice, or a number. */
const wrongTo = (q: Question) => (q.format === "choice" ? q.choices!.find((c) => c !== q.answer)! : "9999");

/**
 * Asha's whole main test through the module, one minute apart, 20 seconds a question: the first answer wrong, every
 * other one right (seed 1: routed up, the first question's area is 5 of 6, an early sign). Then she skips the round
 * and the test is finished.
 */
async function finishedAfterSkip() {
  const test = storedTest(createSession(ASHA, 1));
  const row: MemoryTest = { ...startAttempt("a1", T0), parentId: "parent-1", childId: "child-1", seed: 1, test, answers: [] };
  const memory = memoryAttemptStore({ children: [{ id: "child-1", parentId: "parent-1", ...ASHA }], tests: [row] });
  let at = T0;
  await answerAll(memory, (n) => n !== 0, () => (at += MINUTE));
  await skipExtraRound(memory.store, "parent-1", "a1", (at += MINUTE));
  await finishTest(memory.store, "parent-1", "a1", "no", (at += MINUTE));
  return memory;
}

/** Answers every question the test asks now, through the module: right when `right(n)` says so. */
async function answerAll(memory: ReturnType<typeof memoryAttemptStore>, right: (n: number) => boolean, clock: () => number) {
  for (;;) {
    const row = memory.tests[0];
    const n = row.answers.length;
    const session = restoreSession(row.test, row.answers, row.route ?? null);
    const q = nextQuestion(session);
    if (!q && session.route) return;
    if (!q) {
      // #253: the stage 1 grid; the child presses "Done checking" at once.
      const locked = await doneChecking(memory.store, "parent-1", "a1", "stage1", clock());
      if (!locked.ok) throw new Error(`stage 1 lock: ${locked.error}`);
      continue;
    }
    const input = { questionId: q.id, response: right(n) ? q.answer : wrongTo(q), timeMs: 20_000, work: { png: null, text: q.showWork ? "My working" : "" } };
    const result = await answerQuestion(memory.store, "parent-1", "a1", input, clock());
    if (!result.ok) throw new Error(`answer ${n + 1}: ${result.error}`);
  }
}

/** Copies the attempt module's stored test into the report tables, as one database holds them (in place: the readers hold the arrays). */
function copy(row: MemoryTest, tables: MemoryReportTables) {
  const assessments = (tables.assessments ??= []);
  const answers = (tables.answers ??= []);
  assessments.splice(0, assessments.length, {
    id: row.id, parentId: row.parentId, childId: row.childId, status: row.status, grade: ASHA.grade, province: ASHA.province,
    completedAt: row.completedAt === null ? null : new Date(row.completedAt).toISOString(), placement: row.placement ?? null, help: row.help ?? null, test: row.test,
  });
  answers.splice(0, answers.length, ...row.answers.map((a) => ({
    assessmentId: row.id, position: a.position!, questionId: a.questionId, response: a.response, correct: a.correct!, misconception: a.misconception ?? null,
    timeMs: a.timeMs, workRequired: a.workRequired!, workPath: a.workPath ?? null, workText: a.workText ?? null,
  })));
}

beforeEach(() => {
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
  vi.stubEnv("RESEND_API_KEY", "re_synthetic");
  vi.stubEnv("EMAIL_FROM", "Unica Learning <hello@unicalearning.com>");
  vi.stubEnv("SIGNUP_NOTIFY_EMAIL", "savar@unicalearning.com");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a finished extra round", () => {
  it("builds the report again, in place, with the round's answers, and sends no second email", async () => {
    const memory = await finishedAfterSkip();
    const tables: MemoryReportTables = { reports: [], children: [{ id: "child-1", parentId: "parent-1", firstName: "Asha" }], drawings: [] };
    copy(memory.tests[0], tables);
    const readers = memoryReportReaders(tables);
    const job = memoryReportJobStore(tables, { reads: readers.reads, parents: [{ id: "parent-1", ...PRIYA }] });
    const mail = memoryTransport();
    const book = memoryReportLedger();
    const run = () => runReportJob("a1", ORIGIN, { reader: readers.key(), comparison: async (id) => ({ assessmentId: id, tests: [] }), store: job.store, profiles: memoryLearnerProfileStore(tables).store, reviewer: null, transport: mail.transport, ledger: book.ledger });

    // After the finish: the report of the main test, emailed once.
    await run();
    const early = REPORTED_STRAND[memory.tests[0].test.stage1[0].strand];
    expect(tables.reports).toHaveLength(1);
    expect(tables.reports![0]).toMatchObject({ id: "report-1", questions: 42, minutes: 14 });
    expect(tables.reports![0].model.strands.find((s) => s.strand === early)).toMatchObject({ correct: 5, total: 6, certainty: "early-sign" });
    expect(tables.reports![0].model).not.toHaveProperty("extraRound");
    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);

    // Two days later, from the report: the round, every answer right, and its finish.
    let at = T0 + 2 * DAY;
    expect(await takeExtraRound(memory.store, "parent-1", "a1", at)).toMatchObject({ ok: true });
    await answerAll(memory, () => true, () => (at += MINUTE));
    expect(await finishTest(memory.store, "parent-1", "a1", null, (at += MINUTE))).toEqual({ ok: true, id: "a1", finished: "now" });
    copy(memory.tests[0], tables);

    // The finish route runs the job again: the same report row, built again with the round.
    await run();
    expect(tables.reports).toHaveLength(1);
    expect(tables.reports![0]).toMatchObject({ id: "report-1", questions: 50, minutes: 17 });
    expect(tables.reports![0].model.strands.find((s) => s.strand === early)).toMatchObject({ correct: 13, total: 14, certainty: "clear" });
    expect(tables.reports![0].model.extraRound).toEqual({ questions: 8, strands: [early] });
    // No second email: the parent reads the new report in the account.
    expect(mail.delivered).toHaveLength(2);

    // A later run (a repeated finish) changes nothing.
    const rebuilt = JSON.stringify(tables.reports);
    await run();
    expect(JSON.stringify(tables.reports)).toBe(rebuilt);
    expect(mail.delivered).toHaveLength(2);
  });

  it("after a stop part way during the test: the report is built from the main test, offered again, and built again with the whole round", async () => {
    const test = storedTest(createSession(ASHA, 1));
    const row: MemoryTest = { ...startAttempt("a1", T0), parentId: "parent-1", childId: "child-1", seed: 1, test, answers: [] };
    const memory = memoryAttemptStore({ children: [{ id: "child-1", parentId: "parent-1", ...ASHA }], tests: [row] });
    let at = T0;
    await answerAll(memory, (n) => n !== 0, () => (at += MINUTE));
    await takeExtraRound(memory.store, "parent-1", "a1", (at += MINUTE));
    // Three round answers, each with typed work, then the stop.
    for (let n = 0; n < 3; n++) {
      const q = nextQuestion(restoreSession(memory.tests[0].test, memory.tests[0].answers, memory.tests[0].route ?? null))!;
      const input = { questionId: q.id, response: q.answer, timeMs: 20_000, work: { png: null, text: "Round working" } };
      expect(await answerQuestion(memory.store, "parent-1", "a1", input, (at += MINUTE))).toMatchObject({ ok: true });
    }
    expect(await stopExtraRound(memory.store, "parent-1", "a1", (at += MINUTE))).toEqual({ ok: true, step: { status: "complete", total: 42 } });
    expect(await finishTest(memory.store, "parent-1", "a1", "no", (at += MINUTE))).toEqual({ ok: true, id: "a1", finished: "now" });
    expect(memory.tests[0].answers).toHaveLength(45);

    const tables: MemoryReportTables = { reports: [], children: [{ id: "child-1", parentId: "parent-1", firstName: "Asha" }], drawings: [] };
    copy(memory.tests[0], tables);
    const readers = memoryReportReaders(tables);
    const job = memoryReportJobStore(tables, { reads: readers.reads, parents: [{ id: "parent-1", ...PRIYA }] });
    const mail = memoryTransport();
    const book = memoryReportLedger();
    const run = () => runReportJob("a1", ORIGIN, { reader: readers.key(), comparison: async (id) => ({ assessmentId: id, tests: [] }), store: job.store, profiles: memoryLearnerProfileStore(tables).store, reviewer: null, transport: mail.transport, ledger: book.ledger });

    // The report of the main test alone, emailed once: the 3 round answers and their work are not in it.
    await run();
    const early = REPORTED_STRAND[memory.tests[0].test.stage1[0].strand];
    expect(tables.reports).toHaveLength(1);
    expect(tables.reports![0]).toMatchObject({ id: "report-1", questions: 42, minutes: 14 });
    expect(tables.reports![0].model.strands.find((s) => s.strand === early)).toMatchObject({ correct: 5, total: 6, certainty: "early-sign" });
    expect(tables.reports![0].model).not.toHaveProperty("extraRound");
    expect(JSON.stringify(tables.reports![0].model)).not.toContain("Round working");
    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);

    // The report offers the rest of the round; finished from the report, the same report row is built again.
    expect(await extraRoundState(memory.store, "parent-1", "a1")).toEqual({ kind: "continue", offer: { questions: 8, strands: [early] }, answered: 3 });
    at = T0 + 2 * DAY;
    expect(await takeExtraRound(memory.store, "parent-1", "a1", at)).toMatchObject({ ok: true, step: { number: 46 } });
    await answerAll(memory, () => true, () => (at += MINUTE));
    expect(await finishTest(memory.store, "parent-1", "a1", null, (at += MINUTE))).toEqual({ ok: true, id: "a1", finished: "now" });
    copy(memory.tests[0], tables);
    await run();
    expect(tables.reports).toHaveLength(1);
    expect(tables.reports![0]).toMatchObject({ id: "report-1", questions: 50, minutes: 17 });
    expect(tables.reports![0].model.extraRound).toEqual({ questions: 8, strands: [early] });
    expect(mail.delivered).toHaveLength(2);
  });

  it("is in the first report when the round was taken during the test", async () => {
    const test = storedTest(createSession(ASHA, 1));
    const row: MemoryTest = { ...startAttempt("a1", T0), parentId: "parent-1", childId: "child-1", seed: 1, test, answers: [] };
    const memory = memoryAttemptStore({ children: [{ id: "child-1", parentId: "parent-1", ...ASHA }], tests: [row] });
    let at = T0;
    await answerAll(memory, (n) => n !== 0, () => (at += MINUTE));
    await takeExtraRound(memory.store, "parent-1", "a1", (at += MINUTE));
    await answerAll(memory, () => true, () => (at += MINUTE));
    await finishTest(memory.store, "parent-1", "a1", "no", (at += MINUTE));
    const tables: MemoryReportTables = { reports: [], children: [{ id: "child-1", parentId: "parent-1", firstName: "Asha" }], drawings: [] };
    copy(memory.tests[0], tables);
    const readers = memoryReportReaders(tables);
    const job = memoryReportJobStore(tables, { reads: readers.reads, parents: [{ id: "parent-1", ...PRIYA }] });
    const mail = memoryTransport();
    await runReportJob("a1", ORIGIN, { reader: readers.key(), comparison: async (id) => ({ assessmentId: id, tests: [] }), store: job.store, profiles: memoryLearnerProfileStore(tables).store, reviewer: null, transport: mail.transport, ledger: memoryReportLedger().ledger });
    const early = REPORTED_STRAND[memory.tests[0].test.stage1[0].strand];
    expect(tables.reports![0]).toMatchObject({ questions: 50, minutes: 17 });
    expect(tables.reports![0].model.extraRound).toEqual({ questions: 8, strands: [early] });
    expect(mail.delivered).toHaveLength(2);
  });
});

// #196 (D-115) with #190 (D-116): the report job builds the learner profile from the same answers as the report.
describe("the learner profile after an extra round", () => {
  /**
   * The report job over the attempt module's test, with its own profile store; `run` copies the test in first.
   * `profileAi`: the profile's AI parts (#197), off by default.
   */
  function job(memory: ReturnType<typeof memoryAttemptStore>, profileAi: AiClient | null = null) {
    const tables: MemoryReportTables = { reports: [], children: [{ id: "child-1", parentId: "parent-1", firstName: "Asha" }], drawings: [] };
    const readers = memoryReportReaders(tables);
    const reports = memoryReportJobStore(tables, { reads: readers.reads, parents: [{ id: "parent-1", ...PRIYA }] });
    const profiles = memoryLearnerProfileStore(tables);
    const run = async () => {
      copy(memory.tests[0], tables);
      await runReportJob("a1", ORIGIN, { reader: readers.key(), comparison: async (id) => ({ assessmentId: id, tests: [] }), store: reports.store, profiles: profiles.store, reviewer: null, profileAi, transport: memoryTransport().transport, ledger: memoryReportLedger().ledger });
    };
    return { run, rows: profiles.rows };
  }
  const stored = (rows: ReturnType<ReturnType<typeof job>["rows"]>) => rows.map((r) => r.profile as LearnerProfile);

  it("is rebuilt in place with the round's answers when the round is finished from the report", async () => {
    const memory = await finishedAfterSkip();
    const { run, rows } = job(memory);
    const early = REPORTED_STRAND[memory.tests[0].test.stage1[0].strand];

    await run();
    expect(rows()).toHaveLength(1);
    const before = stored(rows())[0];
    expect(before.test.answered).toBe(42);
    expect(before.strands.find((s) => s.strand === early)).toMatchObject({ correct: 5, total: 6, certainty: "early-sign" });
    expect(before.unknowns.earlySigns.strands).toContain(early);

    let at = T0 + 2 * DAY;
    expect(await takeExtraRound(memory.store, "parent-1", "a1", at)).toMatchObject({ ok: true });
    await answerAll(memory, () => true, () => (at += MINUTE));
    expect(await finishTest(memory.store, "parent-1", "a1", null, (at += MINUTE))).toEqual({ ok: true, id: "a1", finished: "now" });
    await run();

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ assessmentId: "a1", parentId: "parent-1", childId: "child-1" });
    const after = stored(rows())[0];
    expect(after.test.answered).toBe(50);
    expect(after.strands.find((s) => s.strand === early)).toMatchObject({ correct: 13, total: 14, certainty: "clear" });
    expect(after.unknowns.earlySigns.strands).not.toContain(early);
  });

  it("gets its AI parts (#197) again with the rebuild, written from the round's answers", async () => {
    const memory = await finishedAfterSkip();
    const ai = fakeProfileAi("sure");
    const { run, rows } = job(memory, ai);
    const read = (n: number) => {
      const part = ai.requests[n].content[0];
      return JSON.parse(part.type === "text" ? part.text : "null").profile as LearnerProfile;
    };

    await run();
    expect(read(0).test.answered).toBe(42);
    expect(stored(rows())[0].ai?.workbookPlan?.model).toBe("fake");

    let at = T0 + 2 * DAY;
    await takeExtraRound(memory.store, "parent-1", "a1", at);
    await answerAll(memory, () => true, () => (at += MINUTE));
    expect(await finishTest(memory.store, "parent-1", "a1", null, (at += MINUTE))).toEqual({ ok: true, id: "a1", finished: "now" });
    await run();

    // The rebuild stored the facts without the first build's parts, then asked the AI again, from the new facts.
    expect(ai.requests).toHaveLength(2);
    expect(read(1).test.answered).toBe(50);
    const after = stored(rows())[0];
    expect(after.test.answered).toBe(50);
    expect(after.ai?.workbookPlan?.model).toBe("fake");
  });

  it("is built from the main test only when the round is stopped part way", async () => {
    const test = storedTest(createSession(ASHA, 1));
    const row: MemoryTest = { ...startAttempt("a1", T0), parentId: "parent-1", childId: "child-1", seed: 1, test, answers: [] };
    const memory = memoryAttemptStore({ children: [{ id: "child-1", parentId: "parent-1", ...ASHA }], tests: [row] });
    let at = T0;
    await answerAll(memory, (n) => n !== 0, () => (at += MINUTE));
    await takeExtraRound(memory.store, "parent-1", "a1", (at += MINUTE));
    // Three round answers, all wrong: were they counted, the area would be 5 of 9.
    for (let i = 0; i < 3; i++) {
      const q = nextQuestion(restoreSession(memory.tests[0].test, memory.tests[0].answers, memory.tests[0].route ?? null))!;
      expect(await answerQuestion(memory.store, "parent-1", "a1", { questionId: q.id, response: wrongTo(q), timeMs: 20_000, work: { png: null, text: q.showWork ? "My working" : "" } }, (at += MINUTE))).toMatchObject({ ok: true });
    }
    await stopExtraRound(memory.store, "parent-1", "a1", (at += MINUTE));
    await finishTest(memory.store, "parent-1", "a1", "no", (at += MINUTE));
    expect(memory.tests[0].answers).toHaveLength(45);
    const { run, rows } = job(memory);
    const early = REPORTED_STRAND[memory.tests[0].test.stage1[0].strand];

    await run();
    const [profile] = stored(rows());
    expect(profile.test.answered).toBe(42);
    expect(profile.strands.find((s) => s.strand === early)).toMatchObject({ correct: 5, total: 6, certainty: "early-sign" });
    const round = new Set(memory.tests[0].test.extra!.map((q) => q.id));
    expect(profile.struggles.flatMap((s) => s.wrong).filter((w) => round.has(w.questionId))).toEqual([]);
  });
});
