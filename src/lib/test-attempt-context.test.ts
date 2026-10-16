import { afterEach, describe, expect, it, vi } from "vitest";
import { createFacts, createSession, nextQuestion, restoreSession, startAttempt, storedTest, submitAnswer, type Attempt, type Submission } from "@/lib/assessment";
import { answerFact, finishTest, recordBreak, recordDevice, startFacts, StoreError } from "@/lib/test-attempt";
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
/** Asha's open test with `answered` answers in: 18 is the halfway break (the end of stage 1), 36 is every answer. */
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
    const memory = testWith(36);
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
const breakOf = (t: MemoryTest) => ({ startedAt: t.breakStartedAt ?? null, endedAt: t.breakEndedAt ?? null, skipped: t.breakSkipped ?? null });
const NO_BREAK = { startedAt: null, endedAt: null, skipped: null };

describe("the halfway break", () => {
  it("is saved when it is shown and when it ends, by the server's clock: Keep going is a skip", async () => {
    const memory = testWith(18);
    expect(await recordBreak(memory.store, P1, "a1", "shown", T0 + HOUR)).toEqual({ ok: true });
    expect(await recordBreak(memory.store, P1, "a1", "skipped", T0 + HOUR + 4_000)).toEqual({ ok: true });
    expect(breakOf(memory.tests[0])).toEqual({ startedAt: T0 + HOUR, endedAt: T0 + HOUR + 4_000, skipped: true });
  });

  it("a child who rested did not skip it, and the break ends when they come back", async () => {
    const memory = testWith(18);
    await recordBreak(memory.store, P1, "a1", "shown", T0 + HOUR);
    await recordBreak(memory.store, P1, "a1", "rested", T0 + HOUR + 3 * 60_000);
    expect(breakOf(memory.tests[0])).toEqual({ startedAt: T0 + HOUR, endedAt: T0 + HOUR + 3 * 60_000, skipped: false });
  });

  it("is saved once per test: a break shown again (a resume on another device) keeps its first start and its first end", async () => {
    const memory = testWith(18);
    await recordBreak(memory.store, P1, "a1", "shown", T0 + HOUR);
    await recordBreak(memory.store, P1, "a1", "shown", T0 + HOUR + 60_000);
    await recordBreak(memory.store, P1, "a1", "rested", T0 + HOUR + 2 * 60_000);
    await recordBreak(memory.store, P1, "a1", "shown", T0 + HOUR + 3 * 60_000);
    await recordBreak(memory.store, P1, "a1", "skipped", T0 + HOUR + 4 * 60_000);
    expect(breakOf(memory.tests[0])).toEqual({ startedAt: T0 + HOUR, endedAt: T0 + HOUR + 2 * 60_000, skipped: false });
  });

  it("keeps the first start when the break is shown twice at once", async () => {
    const memory = testWith(18);
    await Promise.all([recordBreak(memory.store, P1, "a1", "shown", T0 + HOUR), recordBreak(memory.store, P1, "a1", "shown", T0 + HOUR + 5)]);
    expect(breakOf(memory.tests[0])).toEqual({ startedAt: T0 + HOUR, endedAt: null, skipped: null });
  });

  it("stores no end for a break that was never shown", async () => {
    const memory = testWith(18);
    expect(await recordBreak(memory.store, P1, "a1", "skipped", T0 + HOUR)).toEqual({ ok: true });
    expect(breakOf(memory.tests[0])).toEqual(NO_BREAK);
  });

  it.each([10, 19, 36])("refuses a break shown when the test is not at the halfway point (%i answers in), and stores nothing", async (answered) => {
    const memory = testWith(answered);
    expect(await recordBreak(memory.store, P1, "a1", "shown", T0 + HOUR)).toEqual({ ok: false, error: "conflict" });
    expect(breakOf(memory.tests[0])).toEqual(NO_BREAK);
  });

  it.each(["completed", "expired"] as const)("takes no break once the test is %s, and stores nothing", async (status) => {
    const memory = memoryAttemptStore({ tests: [{ ...stored(open("a1", T0), { answered: 18 }), status }] });
    expect(await recordBreak(memory.store, P1, "a1", "shown", T0 + HOUR)).toEqual({ ok: false, error: "conflict" });
    expect(await recordBreak(memory.store, P1, "a1", "rested", T0 + HOUR)).toEqual({ ok: false, error: "conflict" });
    expect(breakOf(memory.tests[0])).toEqual(NO_BREAK);
  });

  it("is not found for another family's test, or an unknown one, and stores nothing", async () => {
    const memory = memoryAttemptStore({ tests: [stored(open("a1", T0), { parent: "parent-2", answered: 18 })] });
    expect(await recordBreak(memory.store, P1, "a1", "shown", T0 + HOUR)).toEqual({ ok: false, error: "not_found" });
    expect(await recordBreak(memory.store, P1, "a2", "shown", T0 + HOUR)).toEqual({ ok: false, error: "not_found" });
    expect(breakOf(memory.tests[0])).toEqual(NO_BREAK);
  });

  it("a failed read or write is store_failed, and logged", async () => {
    const log = logs();
    const memory = testWith(18);
    memory.fail.startBreak = new StoreError("break save failed", "timeout");
    expect(await recordBreak(memory.store, P1, "a1", "shown", T0 + HOUR)).toEqual({ ok: false, error: "store_failed" });
    memory.fail.load = new StoreError("load failed", "timeout");
    expect(await recordBreak(memory.store, P1, "a1", "rested", T0 + HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect(log.mock.calls).toEqual([["[test] break save failed", "timeout"], ["[test] load failed", "timeout"]]);
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
