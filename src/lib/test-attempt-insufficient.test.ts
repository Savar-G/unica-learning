import { expect, it } from "vitest";
import { createAdaptiveSession, lockAdaptiveBlock, nextQuestion, REPORTED_STRAND, startAttempt, storedTest, submitAnswer, testStep } from "@/lib/assessment";
import { memoryAttemptStore } from "@/lib/test-attempt-memory";
import { finishTest, nextStep, startStates, startTest } from "@/lib/test-attempt";

const T0 = Date.UTC(2026, 10, 12), HOUR = 3_600_000;
const child = { id: "child-1", parentId: "parent-1", grade: 4, province: "BC" } as const;

/** A real completed block test: rushed shape errors leave too little evidence, or careful answers allow scoring. */
function family(scorable = false) {
  let session = createAdaptiveSession(child, 1);
  for (let i = 0; i < 100 && !session.adaptive!.complete; i++) {
    if (testStep(session).status === "check") session = lockAdaptiveBlock(session);
    else {
      const q = nextQuestion(session)!;
      const wrong = !scorable && REPORTED_STRAND[q.strand] === "shapes";
      session = submitAnswer(session, { questionId: q.id, response: wrong ? q.wrong[0].value : q.answer, timeMs: scorable ? 20_000 : 100 });
    }
  }
  expect(testStep(session)).toMatchObject({ status: "complete", sufficientEvidence: scorable });
  return memoryAttemptStore({ children: [child], tests: [{ ...startAttempt("a1", T0), parentId: child.parentId,
    childId: child.id, seed: 1, test: storedTest(session), route: session.route, answers: session.answers, lastAnswerAt: T0 }] });
}

it("lets a family start again immediately when a terminal block test cannot produce a report (#769)", async () => {
  const memory = family(), at = T0 + HOUR;
  const saved = structuredClone(memory.tests[0].answers);
  expect((await startStates(memory.store, child.parentId, at)).get(child.id)).toEqual({ kind: "expired", attemptId: "a1" });
  expect(await startTest(memory.store, child.parentId, child.id, at, { restart: false, newSeed: () => 2 })).toEqual({ ok: false, error: "expired" });
  expect(await startTest(memory.store, child.parentId, child.id, at, { restart: true, newSeed: () => 2 }))
    .toEqual({ ok: true, id: "a2", resumed: false });
  expect(memory.tests.map(t => ({ id: t.id, status: t.status, seed: t.seed }))).toEqual([
    { id: "a1", status: "expired", seed: 1 }, { id: "a2", status: "in_progress", seed: 2 },
  ]);
  expect(memory.tests[0].answers).toEqual(saved);
  expect(memory.tests[0].placement).toBeUndefined();
});

it.each(["read", "finish"])("expires an unscorable test on %s without making a report", async action => {
  const memory = family();
  const result = action === "read" ? await nextStep(memory.store, child.parentId, "a1", T0 + HOUR)
    : await finishTest(memory.store, child.parentId, "a1", "no", T0 + HOUR);
  expect(result).toEqual({ ok: false, error: "expired" });
  expect(memory.tests[0].status).toBe("expired");
  expect(memory.tests[0].placement).toBeUndefined();
});

it("preserves a scorable adaptive test whose scoring request is retried after 24 hours", async () => {
  const memory = family(true), at = T0 + 72 * HOUR;
  expect((await startStates(memory.store, child.parentId, at)).get(child.id)).toEqual({ kind: "finish", attemptId: "a1" });
  expect(await nextStep(memory.store, child.parentId, "a1", at)).toMatchObject({ ok: true, step: { status: "complete", sufficientEvidence: true } });
  expect(await startTest(memory.store, child.parentId, child.id, at, { restart: true, newSeed: () => 2 }))
    .toEqual({ ok: true, id: "a1", resumed: true });
  expect(memory.tests).toHaveLength(1);
  expect(memory.tests[0].status).toBe("in_progress");
});

it("keeps an unfinished adaptive test open even though it has not collected enough evidence yet", async () => {
  const session = createAdaptiveSession(child, 1);
  expect(session.adaptive).toMatchObject({ complete: false, sufficientEvidence: false });
  const memory = memoryAttemptStore({ children: [child], tests: [{ ...startAttempt("a1", T0), parentId: child.parentId,
    childId: child.id, seed: 1, test: storedTest(session), route: session.route, answers: [] }] });
  await memory.store.expire("a1", T0 + HOUR);
  expect(memory.tests[0].status).toBe("in_progress");
  expect((await startStates(memory.store, child.parentId, T0 + HOUR)).get(child.id)).toMatchObject({ kind: "resume", attemptId: "a1" });
});

it("shares one new test across two concurrent restart requests", async () => {
  const memory = family();
  const results = await Promise.all([1, 2].map(() => startTest(memory.store, child.parentId, child.id, T0 + HOUR,
    { restart: true, newSeed: () => 2 })));
  expect(results.every(r => r.ok && r.id === "a2")).toBe(true);
  expect(memory.tests.filter(t => t.status === "in_progress")).toHaveLength(1);
  expect(memory.tests).toHaveLength(2);
});
