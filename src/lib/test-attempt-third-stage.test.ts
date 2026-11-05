import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSession,
  nextQuestion,
  restoreSession,
  startAttempt,
  storedTest,
  submitAnswer,
  type Question,
  type StoredTest,
  type Submission,
} from "@/lib/assessment";
import { beforeThirdStage, checked } from "@/lib/assessment/scripted-child";
import { answerQuestion, changeAnswer, doneChecking, finishTest, nextStep, recordBreak, startStates, type AttemptStore, type ChangeInput } from "@/lib/test-attempt";
import { memoryAttemptStore, type MemoryTest } from "@/lib/test-attempt-memory";

// The stage 2 lock and the third stage (D-282) through the test attempt module, against the in-memory store with the
// clock passed in. Asha, grade 4 in BC, seed 7: stage 1 has 18 questions; the up form has 24, the down form 18; each third
// stage has 8. Stage 2 of an up or down route waits on its grid; "Done checking" stores the record and goes on.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 10, 5, 18, 0);
const P1 = "parent-1";
const C1 = "child-1";
const ASHA = { grade: 4, province: "BC" } as const;

type Script = (q: Question) => boolean;
const wrongTo = (q: Question) => (q.format === "choice" ? q.choices!.find((c) => c !== q.answer)! : "9999");

/** Asha's open test with every stage 1 and stage 2 answer in, stage 1 locked, and no stage 2 record: on the stage 2 grid. */
function onGrid(script: Script, over: Partial<MemoryTest> = {}): MemoryTest {
  const test: StoredTest = storedTest(createSession(ASHA, 7));
  let session = restoreSession(test, []);
  const answers: Submission[] = [];
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    const answer = { questionId: q.id, response: script(q) ? q.answer : wrongTo(q), timeMs: 20_000 };
    session = checked(submitAnswer(session, answer));
    answers.push(answer);
  }
  return {
    ...startAttempt("a1", T0), lastAnswerAt: T0 + HOUR, resumeUntil: T0 + HOUR + DAY, parentId: P1, childId: C1, seed: 7,
    test, answers, route: session.route, ...over,
  };
}

const family = (test: MemoryTest) => memoryAttemptStore({ children: [{ id: C1, parentId: P1, ...ASHA }], tests: [test] });
const right: Script = () => true;
const rightBelowGrade: Script = () => false;
const revisit = (q: Question, response: string): ChangeInput => ({ questionId: q.id, response, timeMs: 4_000, work: { png: null, text: "" }, workChanged: false });
const at = T0 + 2 * HOUR;

/** Answers the third stage, all right or all wrong, one by one through the module. */
async function answerThird(memory: ReturnType<typeof family>, stage3Route: "up" | "down", isRight: boolean) {
  for (const [i, q] of memory.tests[0].test.stage3![stage3Route].entries()) {
    const done = await answerQuestion(memory.store, P1, "a1", { questionId: q.id, response: isRight ? q.answer : wrongTo(q), timeMs: 20_000, work: { png: null, text: "" } }, at + (i + 1) * MINUTE);
    expect(done).toMatchObject({ ok: true });
  }
}

afterEach(() => vi.restoreAllMocks());

describe("a child who aces stage 2", () => {
  it("is on the grid, cannot finish, and goes up another grade at Done checking", async () => {
    const memory = family(onGrid(right));
    expect(await nextStep(memory.store, P1, "a1", at)).toMatchObject({ ok: true, step: { status: "check", section: "stage2", total: 42 } });
    expect(await finishTest(memory.store, P1, "a1", "no", at)).toEqual({ ok: false, error: "incomplete" });

    const result = await doneChecking(memory.store, P1, "a1", "stage2", at);
    const first = memory.tests[0].test.stage3!.up[0];
    expect(result).toMatchObject({ ok: true, step: { status: "question", number: 43, total: 50, breakAfter: 18, stage3After: 42, question: { id: first.id, level: 6 } } });
    expect(memory.tests[0].stage3Route).toBe("up");
    expect(memory.tests[0].resumeUntil).toBe(at + DAY);
    expect(memory.tests[0].lastAnswerAt).toBe(at);
  });

  it("works through the third stage, its grid, and a finish that scores it", async () => {
    const memory = family(onGrid(right));
    await doneChecking(memory.store, P1, "a1", "stage2", at);
    await answerThird(memory, "up", true);
    const grid = await nextStep(memory.store, P1, "a1", at + HOUR);
    expect(grid).toMatchObject({ ok: true, step: { status: "check", section: "stage3", numbers: [43, 44, 45, 46, 47, 48, 49, 50] } });
    expect(await doneChecking(memory.store, P1, "a1", "stage3", at + HOUR)).toEqual({ ok: true, step: { status: "complete", total: 50 } });
    expect(await finishTest(memory.store, P1, "a1", "no", at + HOUR)).toMatchObject({ ok: true, finished: "now" });
    expect(memory.tests[0].placement).toMatchObject({ route: "up", stage3Route: "up", workingLevel: 6, atCeiling: true });
    expect(memory.tests[0].answers).toHaveLength(50);
  });

  it("closes stage 2 at the lock: a change of a stage 2 answer is refused, also on the store itself", async () => {
    const memory = family(onGrid(right));
    await doneChecking(memory.store, P1, "a1", "stage2", at);
    const stage2 = memory.tests[0].test.stage2.up[0];
    expect(await changeAnswer(memory.store, P1, "a1", revisit(stage2, wrongTo(stage2)), at + MINUTE)).toMatchObject({ ok: false, error: "conflict", step: { status: "question", number: 43 } });
    expect(memory.tests[0].answers[18].response).toBe(stage2.answer);
    expect(await memory.store.changeAnswer("a1", { questionId: stage2.id, response: "1", timeMs: 1, correct: false, misconception: null, position: 18, answeredAt: at, events: null as never }, 42)).toBe("closed");
  });

  it("takes changes in the third stage while it is open", async () => {
    const memory = family(onGrid(right));
    await doneChecking(memory.store, P1, "a1", "stage2", at);
    await answerThird(memory, "up", true);
    const q = memory.tests[0].test.stage3!.up[2];
    expect(await changeAnswer(memory.store, P1, "a1", revisit(q, wrongTo(q)), at + HOUR)).toMatchObject({ ok: true, step: { status: "check", section: "stage3" } });
    expect(memory.tests[0].answers[44]).toMatchObject({ response: wrongTo(q), correct: false });
  });

  it("sets the third stage from the final stage 2 answers", async () => {
    const memory = family(onGrid(right));
    // On the grid the child changes every higher-grade answer to a wrong one: no third stage.
    const form = memory.tests[0].test.stage2.up;
    for (const [i, q] of form.entries()) {
      if (q.level === 5) expect(await changeAnswer(memory.store, P1, "a1", revisit(q, wrongTo(q)), at + i * 1_000)).toMatchObject({ ok: true });
    }
    expect(await doneChecking(memory.store, P1, "a1", "stage2", at + HOUR)).toEqual({ ok: true, step: { status: "complete", total: 42 } });
    expect(memory.tests[0].stage3Route).toBe("none");
  });
});

describe("a child who does not clear the down form", () => {
  it("goes down another grade, and the report level is measured, not estimated", async () => {
    const memory = family(onGrid(rightBelowGrade));
    expect(memory.tests[0].route).toBe("down");
    const result = await doneChecking(memory.store, P1, "a1", "stage2", at);
    expect(result).toMatchObject({ ok: true, step: { status: "question", number: 37, total: 44, stage3After: 36, question: { level: 2 } } });
    await answerThird(memory, "down", true);
    expect(await finishTest(memory.store, P1, "a1", "no", at + HOUR)).toMatchObject({ ok: true });
    expect(memory.tests[0].placement).toMatchObject({ route: "down", stage3Route: "down", workingLevel: 2, confidence: "normal", atCeiling: false });
  });
});

describe("a child with no third stage after the lock", () => {
  const partly: Script = (q) => q.level < 5 || Number(q.id.split("-")[1]) % 2 === 0;

  it("goes on to the finish, with nothing left to change", async () => {
    const memory = family(onGrid(partly));
    expect(memory.tests[0].route).toBe("up");
    expect(await doneChecking(memory.store, P1, "a1", "stage2", at)).toEqual({ ok: true, step: { status: "complete", total: 42 } });
    expect(memory.tests[0].stage3Route).toBe("none");
    expect(memory.tests[0].resumeUntil).toBe(T0 + HOUR + DAY);
    const q = memory.tests[0].test.stage2.up[0];
    expect(await changeAnswer(memory.store, P1, "a1", revisit(q, wrongTo(q)), at)).toMatchObject({ ok: false, error: "conflict", step: { status: "complete" } });
    expect(await finishTest(memory.store, P1, "a1", "yes", at)).toMatchObject({ ok: true, finished: "now" });
    expect(memory.tests[0].placement).toMatchObject({ route: "up", stage3Route: "none", atCeiling: false });
  });

  it("says All your answers are in on a resume, not Check your answers", async () => {
    const memory = family(onGrid(partly));
    await doneChecking(memory.store, P1, "a1", "stage2", at);
    expect((await startStates(memory.store, P1, at + HOUR)).get(C1)).toEqual({ kind: "finish", attemptId: "a1" });
  });
});

describe("the lock under real conditions", () => {
  it("stores once when Done checking comes twice at once: both go on to the same step", async () => {
    const memory = family(onGrid(right));
    const [a, b] = await Promise.all([doneChecking(memory.store, P1, "a1", "stage2", at), doneChecking(memory.store, P1, "a1", "stage2", at)]);
    expect(a).toMatchObject({ ok: true, step: { number: 43 } });
    expect(b).toMatchObject({ ok: true, step: { number: 43 } });
    expect(memory.tests[0].stage3Route).toBe("up");
  });

  it("keeps the first record on a retry after a lost response", async () => {
    const memory = family(onGrid(right));
    await doneChecking(memory.store, P1, "a1", "stage2", at);
    await answerThird(memory, "up", false);
    expect(await doneChecking(memory.store, P1, "a1", "stage2", at + HOUR)).toMatchObject({ ok: true, step: { status: "check", section: "stage3" } });
    expect(memory.tests[0].stage3Route).toBe("up");
  });

  it("reads again when an answer changed between the read and the lock, and sets the record from the final answers", async () => {
    const memory = family(onGrid(right));
    let tries = 0;
    const store: AttemptStore = {
      ...memory.store,
      lockStage2: async (id, lock) => {
        tries++;
        // Another tab changes answers in the gap: enough of them that the child no longer goes up.
        if (tries === 1) {
          for (const [i, q] of memory.tests[0].test.stage2.up.entries()) {
            if (q.level === 5) memory.tests[0].answers[18 + i] = { ...memory.tests[0].answers[18 + i], response: wrongTo(q), correct: false };
          }
        }
        return memory.store.lockStage2(id, lock);
      },
    };
    expect(await doneChecking(store, P1, "a1", "stage2", at)).toEqual({ ok: true, step: { status: "complete", total: 42 } });
    expect(tries).toBe(2);
    expect(memory.tests[0].stage3Route).toBe("none");
  });

  it("stays on the grid with store_failed when the lock cannot be saved, and the next press works", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const memory = family(onGrid(right));
    const failing: AttemptStore = { ...memory.store, lockStage2: async () => { throw new Error("down"); } };
    expect(await doneChecking(failing, P1, "a1", "stage2", at)).toEqual({ ok: false, error: "store_failed" });
    expect(memory.tests[0].stage3Route ?? null).toBeNull();
    expect(await nextStep(memory.store, P1, "a1", at)).toMatchObject({ ok: true, step: { status: "check", section: "stage2" } });
    expect(await doneChecking(memory.store, P1, "a1", "stage2", at)).toMatchObject({ ok: true, step: { number: 43 } });
  });

  it("lets a child come back to the grid long after the deadline, and opens 24 hours for the third stage", async () => {
    const memory = family(onGrid(right));
    const late = T0 + 10 * DAY;
    expect((await startStates(memory.store, P1, late)).get(C1)).toEqual({ kind: "finish", attemptId: "a1", checkGrid: true });
    expect(await doneChecking(memory.store, P1, "a1", "stage2", late)).toMatchObject({ ok: true, step: { number: 43 } });
    expect(memory.tests[0].resumeUntil).toBe(late + DAY);
    const q = memory.tests[0].test.stage3!.up[0];
    expect(await answerQuestion(memory.store, P1, "a1", { questionId: q.id, response: q.answer, timeMs: 20_000, work: { png: null, text: "" } }, late + MINUTE)).toMatchObject({ ok: true, step: { number: 44 } });
  });

  it("closes a third stage left for more than 24 hours, like any open test", async () => {
    const memory = family(onGrid(right));
    await doneChecking(memory.store, P1, "a1", "stage2", at);
    expect((await startStates(memory.store, P1, at + 2 * DAY)).get(C1)).not.toMatchObject({ kind: "finish" });
    expect(await nextStep(memory.store, P1, "a1", at + 2 * DAY)).toMatchObject({ ok: false, error: "expired" });
  });

  it("accepts the end of the halfway break while the child is on the stage 2 grid", async () => {
    const memory = family(onGrid(right, { breakStartedAt: T0 + 30 * MINUTE }));
    expect(await recordBreak(memory.store, P1, "a1", { event: "skipped", lengthMs: 1_000 }, at)).toEqual({ ok: true });
  });

  it("refuses Done checking on stage 3 before its grid, and sends the step the test is at", async () => {
    const memory = family(onGrid(right));
    expect(await doneChecking(memory.store, P1, "a1", "stage3", at)).toMatchObject({ ok: false, error: "conflict", step: { status: "check", section: "stage2" } });
  });

  it("keeps a test from before the third stage as it was", async () => {
    const old = beforeThirdStage(storedTest(createSession(ASHA, 7)));
    const memory = family(onGrid(right, { test: old }));
    expect(await doneChecking(memory.store, P1, "a1", "stage2", at)).toEqual({ ok: true, step: { status: "complete", total: 42 } });
    expect(memory.tests[0].stage3Route ?? null).toBeNull();
    expect(await finishTest(memory.store, P1, "a1", "no", at)).toMatchObject({ ok: true, finished: "now" });
    expect(memory.tests[0].placement).toMatchObject({ workingLevel: 5, atCeiling: true });
    expect(memory.tests[0].placement).not.toHaveProperty("stage3Route");
  });
});

