import { afterEach, describe, expect, it, vi } from "vitest";
import { createFacts, createSession, nextQuestion, restoreSession, startAttempt, storedTest, submitAnswer, type Attempt, type Submission } from "@/lib/assessment";
import { answerFact, answerQuestion, nextStep, finishTest, recordBreak, recordDevice, startFacts, StoreError } from "@/lib/test-attempt";
import { memoryAttemptStore, type MemoryTest } from "@/lib/test-attempt-memory";
import type { TestDevice } from "@/lib/test-context";

// The test context (#185) through the test attempt module, against the in-memory store with the clock passed in:
// the time for each quick fact (from the server, and from the browser when it sent one), the halfway break and the
// device. The facts section's other rules are in test-attempt.test.ts.
const HOUR = 60 * 60_000;
const T0 = Date.UTC(2026, 10, 2, 18, 0);
const P1 = "parent-1";
const ASHA = { grade: 4, province: "BC" } as const;

/** Asha's test (grade 4, BC, seed 7), with the first `answered` answers right. */
function stored(attempt: Attempt, { parent = P1, answered = 0 }: { parent?: string; answered?: number } = {}): MemoryTest {
  const test = storedTest(createSession(ASHA, 7));
  let session = restoreSession(test, []);
  const answers: Submission[] = [];
  for (let q = nextQuestion(session); q && answers.length < answered; q = nextQuestion(session)) {
    answers.push({ questionId: q.id, response: q.answer, timeMs: 20_000 });
    session = submitAnswer(session, answers.at(-1)!);
  }
  return { ...attempt, parentId: parent, childId: "child-1", seed: 7, test, answers };
}

const open = (id: string, at: number) => startAttempt(id, at);
/** Asha's open test with `answered` answers in: 18 is the halfway break (the end of stage 1), 42 is every answer (all right routes up, #188). */
const testWith = (answered: number) => memoryAttemptStore({ tests: [stored(open("a1", T0), { answered })] });

afterEach(() => vi.restoreAllMocks());

describe("the time for each quick fact", () => {
  const [f0, f1, f2] = createFacts(ASHA, 7).facts;

  it("stores the server's time since the answer before it, and the browser's time on the fact when the screen sent one", async () => {
    const memory = testWith(18);
    await startFacts(memory.store, P1, "a1", T0 + HOUR);
    await answerFact(memory.store, P1, "a1", T0 + HOUR + 2_500, { factId: f0.id, response: String(f0.answer), browserMs: 1_900 });
    // Answers that waited behind a slow save arrive close together; the browser's time is still the child's own.
    await answerFact(memory.store, P1, "a1", T0 + HOUR + 2_700, { factId: f1.id, response: "", browserMs: 1_200 });
    // An older screen sends no time: the server's time is all there is.
    await answerFact(memory.store, P1, "a1", T0 + HOUR + 6_000, { factId: f2.id, response: String(f2.answer) });
    expect(memory.facts[0].answers).toEqual([
      { position: 0, factId: f0.id, response: String(f0.answer), correct: true, atMs: 2_500, serverMs: 2_500, browserMs: 1_900 },
      { position: 1, factId: f1.id, response: "", correct: false, atMs: 2_700, serverMs: 200, browserMs: 1_200 },
      { position: 2, factId: f2.id, response: String(f2.answer), correct: true, atMs: 6_000, serverMs: 3_300, browserMs: null },
    ]);
  });

  it("keeps a browser time within the time the section has run, and keeps none that is not a time", async () => {
    const memory = testWith(18);
    await startFacts(memory.store, P1, "a1", T0 + HOUR);
    const facts = createFacts(ASHA, 7).facts;
    const sent = [90_000, -5, Number.NaN, 1_234.6];
    for (const [i, browserMs] of sent.entries()) {
      const at = T0 + HOUR + 2_500 * (i + 1);
      expect(await answerFact(memory.store, P1, "a1", at, { factId: facts[i].id, response: "1", browserMs })).toMatchObject({ ok: true });
    }
    expect(memory.facts[0].answers.map((a) => a.browserMs)).toEqual([2_500, null, null, 1_235]);
  });

  it("gives the finished test its fact speed from each fact's browser time, not from when the answers reached the server", async () => {
    const memory = testWith(42);
    await startFacts(memory.store, P1, "a1", T0 + HOUR);
    const facts = createFacts(ASHA, 7).facts;
    // The child took about 3 seconds on each fact, but the saves queued, so the answers reached the server in a burst.
    const browser = [3_000, 3_400, 3_200, 3_600, 3_100];
    const arrival = [3_500, 3_700, 3_900, 15_000, 16_500];
    for (const [i, fact] of facts.slice(0, 5).entries()) {
      await answerFact(memory.store, P1, "a1", T0 + HOUR + arrival[i], { factId: fact.id, response: String(fact.answer), browserMs: browser[i] });
    }
    expect(await finishTest(memory.store, P1, "a1", "no", T0 + 2 * HOUR)).toMatchObject({ ok: true, finished: "now" });
    expect(memory.tests[0].placement?.facts).toMatchObject({ answered: 5, correct: 5, medianMs: 3_200, speed: "needs-practice" });
  });
});

/** Keeps the expected store failures out of the test output, and lets a test read what was logged. */
const logs = () => vi.spyOn(console, "error").mockImplementation(() => {});
/** The break's stored fields, with "not stored" as null. */
const breakOf = (t: MemoryTest) => ({
  startedAt: t.breakStartedAt ?? null,
  endedAt: t.breakEndedAt ?? null,
  skipped: t.breakSkipped ?? null,
  lengthMs: t.breakMs ?? null,
});
const NO_BREAK = { startedAt: null, endedAt: null, skipped: null, lengthMs: null };
const SHOWN = { event: "shown" } as const;
/** The end of the break as the screen sends it: how it ended, and its length as the browser measured it. */
const skipped = (lengthMs: number) => ({ event: "skipped", lengthMs }) as const;
const rested = (lengthMs: number) => ({ event: "rested", lengthMs }) as const;

describe("the halfway break", () => {
  it("is saved when it is shown and when it ends: Keep going is a skip, with the length the browser measured", async () => {
    const memory = testWith(18);
    expect(await recordBreak(memory.store, P1, "a1", SHOWN, T0 + HOUR)).toEqual({ ok: true });
    expect(await recordBreak(memory.store, P1, "a1", skipped(3_900), T0 + HOUR + 4_000)).toEqual({ ok: true });
    expect(breakOf(memory.tests[0])).toEqual({ startedAt: T0 + HOUR, endedAt: T0 + HOUR + 4_000, skipped: true, lengthMs: 3_900 });
  });

  it("returns only the break resume state with the next question after a reload", async () => {
    const memory = testWith(18);
    await recordBreak(memory.store, P1, "a1", SHOWN, T0 + HOUR);
    expect(await nextStep(memory.store, P1, "a1", T0 + HOUR + 5_000)).toMatchObject({ ok: true, break: { startedAt: T0 + HOUR, ended: false } });
    await recordBreak(memory.store, P1, "a1", rested(6_000), T0 + HOUR + 6_000);
    expect(await nextStep(memory.store, P1, "a1", T0 + HOUR + 7_000)).toMatchObject({ ok: true, break: { startedAt: T0 + HOUR, ended: true } });
  });

  it("saves a captured break end after the next question answer", async () => {
    const memory = testWith(18);
    await recordBreak(memory.store, P1, "a1", SHOWN, T0 + HOUR);
    const step = await nextStep(memory.store, P1, "a1", T0 + HOUR + 2_000);
    if (!step.ok || step.step.status !== "question") throw new Error("missing question");
    const question = nextQuestion(restoreSession(memory.tests[0].test, memory.tests[0].answers))!;
    expect(await answerQuestion(memory.store, P1, "a1", { questionId: question.id, response: question.answer, timeMs: 5_000, work: { png: null, text: "5 + 1" } }, T0 + HOUR + 5_000)).toMatchObject({ ok: true });
    expect(await recordBreak(memory.store, P1, "a1", rested(1_500), T0 + HOUR + 8_000)).toEqual({ ok: true });
    expect(breakOf(memory.tests[0])).toEqual({ startedAt: T0 + HOUR, endedAt: T0 + HOUR + 8_000, skipped: false, lengthMs: 1_500 });
  });

  it("keeps a captured end when finish wins the write race, without changing the score", async () => {
    const memory = testWith(42);
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => (entered = resolve));
    const held = new Promise<void>((resolve) => (release = resolve));
    const store = { ...memory.store, endBreak: async (...args: Parameters<typeof memory.store.endBreak>) => { entered(); await held; return memory.store.endBreak(...args); } };
    const end = recordBreak(store, P1, "a1", rested(1_500), T0 + HOUR);
    await waiting;
    expect(await finishTest(memory.store, P1, "a1", "no", T0 + HOUR + 1)).toMatchObject({ ok: true });
    const placement = structuredClone(memory.tests[0].placement);
    release();
    expect(await end).toEqual({ ok: true });
    expect(breakOf(memory.tests[0])).toMatchObject({ skipped: false, lengthMs: 1_500 });
    expect(memory.tests[0].placement).toEqual(placement);
  });

  it("a child who rested did not skip it, and the break ends when they come back", async () => {
    const memory = testWith(18);
    await recordBreak(memory.store, P1, "a1", SHOWN, T0 + HOUR);
    await recordBreak(memory.store, P1, "a1", rested(3 * 60_000), T0 + HOUR + 3 * 60_000);
    expect(breakOf(memory.tests[0])).toEqual({ startedAt: T0 + HOUR, endedAt: T0 + HOUR + 3 * 60_000, skipped: false, lengthMs: 3 * 60_000 });
  });

  it("keeps the length the browser measured, not the time between the two requests", async () => {
    const memory = testWith(18);
    await recordBreak(memory.store, P1, "a1", SHOWN, T0 + HOUR);
    // The child pressed Keep going after 1.5 seconds; the end reached the server 8 seconds after the start did.
    await recordBreak(memory.store, P1, "a1", skipped(1_500), T0 + HOUR + 8_000);
    expect(breakOf(memory.tests[0])).toMatchObject({ startedAt: T0 + HOUR, skipped: true, lengthMs: 1_500 });
  });

  it("a slow 'shown' save does not make the stored break longer: the end saved first sets the start from its length", async () => {
    const memory = testWith(18);
    // The "shown" request reads the test at once, but its write lands only after the end is saved.
    let land!: () => void;
    const slow = new Promise<void>((resolve) => (land = resolve));
    const store = { ...memory.store, startBreak: async (id: string, at: number) => { await slow; return memory.store.startBreak(id, at); } };
    const shown = recordBreak(store, P1, "a1", SHOWN, T0 + HOUR);
    expect(await recordBreak(store, P1, "a1", skipped(1_500), T0 + HOUR + 1_500)).toEqual({ ok: true });
    land();
    expect(await shown).toEqual({ ok: true });
    expect(breakOf(memory.tests[0])).toEqual({ startedAt: T0 + HOUR, endedAt: T0 + HOUR + 1_500, skipped: true, lengthMs: 1_500 });
  });

  it("keeps a length over a day as a day: the test closes 24 hours after the last answer", async () => {
    const memory = testWith(18);
    await recordBreak(memory.store, P1, "a1", SHOWN, T0 + HOUR);
    await recordBreak(memory.store, P1, "a1", rested(30 * HOUR + 0.4), T0 + HOUR + 1_000);
    expect(breakOf(memory.tests[0]).lengthMs).toBe(24 * HOUR);
  });

  it("is saved once per test: a break shown again (a resume on another device) keeps its first start and its first end", async () => {
    const memory = testWith(18);
    await recordBreak(memory.store, P1, "a1", SHOWN, T0 + HOUR);
    await recordBreak(memory.store, P1, "a1", SHOWN, T0 + HOUR + 60_000);
    await recordBreak(memory.store, P1, "a1", rested(2 * 60_000), T0 + HOUR + 2 * 60_000);
    await recordBreak(memory.store, P1, "a1", SHOWN, T0 + HOUR + 3 * 60_000);
    await recordBreak(memory.store, P1, "a1", skipped(1_000), T0 + HOUR + 4 * 60_000);
    expect(breakOf(memory.tests[0])).toEqual({ startedAt: T0 + HOUR, endedAt: T0 + HOUR + 2 * 60_000, skipped: false, lengthMs: 2 * 60_000 });
  });

  it("keeps the first start when the break is shown twice at once", async () => {
    const memory = testWith(18);
    await Promise.all([recordBreak(memory.store, P1, "a1", SHOWN, T0 + HOUR), recordBreak(memory.store, P1, "a1", SHOWN, T0 + HOUR + 5)]);
    expect(breakOf(memory.tests[0])).toEqual({ startedAt: T0 + HOUR, endedAt: null, skipped: null, lengthMs: null });
  });

  it.each([10, 19, 42])("refuses a new break screen away from halfway (%i answers in)", async (answered) => {
    const memory = testWith(answered);
    expect(await recordBreak(memory.store, P1, "a1", SHOWN, T0 + HOUR)).toEqual({ ok: false, error: "conflict" });
    expect(breakOf(memory.tests[0])).toEqual(NO_BREAK);
  });

  it("refuses an end before halfway and invalid module timings", async () => {
    const early = testWith(10);
    expect(await recordBreak(early.store, P1, "a1", rested(1_000), T0 + HOUR)).toEqual({ ok: false, error: "conflict" });
    expect(breakOf(early.tests[0])).toEqual(NO_BREAK);
    const memory = testWith(18);
    for (const length of [-1, NaN, Infinity]) expect(await recordBreak(memory.store, P1, "a1", rested(length), T0 + HOUR)).toEqual({ ok: false, error: "conflict" });
    expect(breakOf(memory.tests[0])).toEqual(NO_BREAK);
  });

  it("accepts the end after finish only within the original deadline, and keeps its first value", async () => {
    const memory = testWith(42);
    expect(await finishTest(memory.store, P1, "a1", "no", T0 + HOUR)).toMatchObject({ ok: true });
    const placement = structuredClone(memory.tests[0].placement);
    const deadline = memory.tests[0].resumeUntil;
    expect(await recordBreak(memory.store, P1, "a1", rested(1_500), deadline)).toEqual({ ok: true });
    const first = breakOf(memory.tests[0]);
    expect(first).toMatchObject({ endedAt: deadline, skipped: false, lengthMs: 1_500 });
    expect(await recordBreak(memory.store, P1, "a1", skipped(8_000), deadline)).toEqual({ ok: true });
    expect(breakOf(memory.tests[0])).toEqual(first);
    expect(memory.tests[0].placement).toEqual(placement);
    expect(memory.tests[0].resumeUntil).toBe(deadline);
    expect(await recordBreak(memory.store, P1, "a1", rested(1_500), deadline + 1)).toEqual({ ok: false, error: "conflict" });
  });

  it("saves only one of two concurrent ends, and a concurrent expiry prevents the held write", async () => {
    const memory = testWith(18);
    await Promise.all([recordBreak(memory.store, P1, "a1", rested(1_500), T0 + HOUR), recordBreak(memory.store, P1, "a1", skipped(1_600), T0 + HOUR)]);
    expect(breakOf(memory.tests[0])).toMatchObject({ skipped: false, lengthMs: 1_500 });
    const stale = testWith(18);
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((r) => (entered = r));
    const held = new Promise<void>((r) => (release = r));
    const store = { ...stale.store, endBreak: async (...args: Parameters<typeof stale.store.endBreak>) => { entered(); await held; return stale.store.endBreak(...args); } };
    const end = recordBreak(store, P1, "a1", rested(1_500), T0 + HOUR);
    await waiting;
    await nextStep(stale.store, P1, "a1", T0 + 25 * HOUR);
    release();
    await end;
    expect(stale.tests[0].status).toBe("expired");
    expect(breakOf(stale.tests[0])).toEqual(NO_BREAK);
  });

  it("takes no context after the deadline even before another request marks it expired", async () => {
    const memory = testWith(18);
    expect(await recordBreak(memory.store, P1, "a1", SHOWN, T0 + 25 * HOUR)).toEqual({ ok: false, error: "conflict" });
    expect(await recordBreak(memory.store, P1, "a1", rested(1_000), T0 + 25 * HOUR)).toEqual({ ok: false, error: "conflict" });
    expect(breakOf(memory.tests[0])).toEqual(NO_BREAK);
  });

  it.each(["completed", "expired"] as const)("takes no break once the test is %s, and stores nothing", async (status) => {
    const memory = memoryAttemptStore({ tests: [{ ...stored(open("a1", T0), { answered: 18 }), status }] });
    expect(await recordBreak(memory.store, P1, "a1", SHOWN, T0 + HOUR)).toEqual({ ok: false, error: "conflict" });
    expect(await recordBreak(memory.store, P1, "a1", rested(1_000), T0 + HOUR)).toEqual({ ok: false, error: "conflict" });
    expect(breakOf(memory.tests[0])).toEqual(NO_BREAK);
  });

  it("is not found for another family's test, or an unknown one, and stores nothing", async () => {
    const memory = memoryAttemptStore({ tests: [stored(open("a1", T0), { parent: "parent-2", answered: 18 })] });
    expect(await recordBreak(memory.store, P1, "a1", SHOWN, T0 + HOUR)).toEqual({ ok: false, error: "not_found" });
    expect(await recordBreak(memory.store, P1, "a2", SHOWN, T0 + HOUR)).toEqual({ ok: false, error: "not_found" });
    expect(breakOf(memory.tests[0])).toEqual(NO_BREAK);
  });

  it("a failed read or write is store_failed, and logged", async () => {
    const log = logs();
    const memory = testWith(18);
    memory.fail.startBreak = new StoreError("break save failed", "timeout");
    expect(await recordBreak(memory.store, P1, "a1", SHOWN, T0 + HOUR)).toEqual({ ok: false, error: "store_failed" });
    memory.fail.endBreak = new StoreError("break save failed", "timeout");
    expect(await recordBreak(memory.store, P1, "a1", skipped(1_000), T0 + HOUR)).toEqual({ ok: false, error: "store_failed" });
    memory.fail.load = new StoreError("load failed", "timeout");
    expect(await recordBreak(memory.store, P1, "a1", rested(1_000), T0 + HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect(log.mock.calls).toEqual([["[test] break save failed", "timeout"], ["[test] break save failed", "timeout"], ["[test] load failed", "timeout"]]);
    expect(breakOf(memory.tests[0])).toEqual(NO_BREAK);
  });
});

const IPAD: TestDevice = { deviceClass: "tablet", input: "pen", screenWidth: 1024, screenHeight: 1366, browser: "safari" };
const LAPTOP: TestDevice = { deviceClass: "desktop", input: "mouse", screenWidth: 1440, screenHeight: 900, browser: "chrome" };

describe("the device", () => {
  it("is saved once per test: a resume on another device keeps the first", async () => {
    const memory = testWith(3);
    expect(await recordDevice(memory.store, P1, "a1", IPAD)).toEqual({ ok: true });
    expect(await recordDevice(memory.store, P1, "a1", LAPTOP)).toEqual({ ok: true });
    expect(memory.tests[0].device).toEqual(IPAD);
  });

  it("two devices sent at once store one of them", async () => {
    const memory = testWith(0);
    await Promise.all([recordDevice(memory.store, P1, "a1", IPAD), recordDevice(memory.store, P1, "a1", LAPTOP)]);
    expect(memory.tests[0].device).toEqual(IPAD);
  });

  it.each(["completed", "expired"] as const)("is not saved once the test is %s", async (status) => {
    const memory = memoryAttemptStore({ tests: [{ ...stored(open("a1", T0), { answered: 3 }), status }] });
    expect(await recordDevice(memory.store, P1, "a1", IPAD)).toEqual({ ok: false, error: "conflict" });
    expect(memory.tests[0].device ?? null).toBeNull();
  });

  it("is not found for another family's test, and stores nothing", async () => {
    const memory = memoryAttemptStore({ tests: [stored(open("a1", T0), { parent: "parent-2" })] });
    expect(await recordDevice(memory.store, P1, "a1", IPAD)).toEqual({ ok: false, error: "not_found" });
    expect(memory.tests[0].device ?? null).toBeNull();
  });

  it("a failed write is store_failed, and logged", async () => {
    const log = logs();
    const memory = testWith(3);
    memory.fail.recordDevice = new StoreError("device save failed", "timeout");
    expect(await recordDevice(memory.store, P1, "a1", IPAD)).toEqual({ ok: false, error: "store_failed" });
    expect(log.mock.calls).toEqual([["[test] device save failed", "timeout"]]);
  });
});
