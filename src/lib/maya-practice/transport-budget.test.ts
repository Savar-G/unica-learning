import { afterEach, expect, it, vi } from "vitest";
import { PRACTICE_CASES, fakeJudge, fakeValidityJudge, memoryPracticeStore, runPractice, scriptedSimulator, traceFile, type PracticeDeps } from "@/lib/maya-practice";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import type { MayaTrace } from "@/lib/maya-trace";
vi.mock("server-only", () => ({}));
afterEach(() => vi.useRealTimers());
async function run(turnBudgetMs?: number) {
  vi.useFakeTimers();
  const rule = ruleMayaModel(), store = memoryPracticeStore();
  const deps: PracticeDeps & { turnBudgetMs?: number } = {
    maya: { ...rule, async propose(...args) {
      await new Promise<void>(resolve => setTimeout(resolve, 7_000));
      return rule.propose(...args);
    } },
    channel: "chat", freeTalk: false, simulator: scriptedSimulator(["stop"]),
    validity: fakeValidityJudge(), judge: fakeJudge(), store, turnBudgetMs,
  };
  const pending = runPractice(PRACTICE_CASES.find(c => c.id === "C07")!, 1, 1, deps);
  await vi.runAllTimersAsync();
  await pending;
  const trace = JSON.parse(store.load(traceFile("C07-r1"))!) as MayaTrace;
  return trace.turns.flatMap(t => t.kind === "maya" ? t.attempts : []);
}
it("forwards an explicit practice budget to the real text adapter", async () => {
  const attempts = await run(20_000);
  expect(attempts.length).toBeGreaterThan(0);
  expect(attempts[0].error).toBeUndefined();
  expect(attempts[0].proposal).not.toBeNull();
});
it("keeps the live default when no practice budget is supplied", async () => {
  const attempts = await run();
  expect(attempts[0].error).toMatchObject({ code: "timeout" });
});
