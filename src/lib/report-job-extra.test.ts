import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REPORTED_STRAND, createSession, nextQuestion, restoreSession, startAttempt, storedTest, type Question } from "@/lib/assessment";
import { memoryTransport } from "@/lib/email-delivery-memory";
import { runReportJob } from "@/lib/report-job";
import { memoryReportJobStore } from "@/lib/report-job-memory";
import { memoryReportReaders, type MemoryReportTables } from "@/lib/report-loading-memory";
import { memoryReportLedger } from "@/lib/report-row-ledger-memory";
import { answerQuestion, finishTest, skipExtraRound, takeExtraRound } from "@/lib/test-attempt";
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
  for (let n = 0; ; n++) {
    const row = memory.tests[0];
    const q = nextQuestion(restoreSession(row.test, row.answers));
    if (!q) return;
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
    const run = () => runReportJob("a1", ORIGIN, { reader: readers.key(), comparison: async (id) => ({ assessmentId: id, tests: [] }), store: job.store, reviewer: null, transport: mail.transport, ledger: book.ledger });

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
    await runReportJob("a1", ORIGIN, { reader: readers.key(), comparison: async (id) => ({ assessmentId: id, tests: [] }), store: job.store, reviewer: null, transport: mail.transport, ledger: memoryReportLedger().ledger });
    const early = REPORTED_STRAND[memory.tests[0].test.stage1[0].strand];
    expect(tables.reports![0]).toMatchObject({ questions: 50, minutes: 17 });
    expect(tables.reports![0].model.extraRound).toEqual({ questions: 8, strands: [early] });
    expect(mail.delivered).toHaveLength(2);
  });
});
