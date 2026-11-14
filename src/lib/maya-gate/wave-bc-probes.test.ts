import { describe, expect, it, vi } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { createSession, nextActs, step, TIME_LIMITS } from "@/lib/maya/session";
import { FIXTURES } from "./fixtures";
import { scenarioModel, memoryTraceStore, runBehaviour, judge } from "./gate";
import { C3B_REVIEW_BEHAVIOURS } from "./c3b-review-cases";
import { C3C_REVIEW_BEHAVIOURS } from "./c3c-review-cases";

vi.mock("server-only", () => ({}));

async function start(id: "SCALE" | "MONEY" | "MINUTE" | "MARBLES" | "AREA_TF" | "CLOCK_REVIEW") {
  const model = scenarioModel();
  const text = createTextSession({ callId: `probe-${id}`, package: FIXTURES[id], model, clock: () => 1000, random: 1 });
  model.next([], undefined);
  await text.start();
  return { text, model };
}

describe("cross-wave claim and topic probes", () => {
  it("does not offer the clock answer at the time limit without misses", () => {
    let session = createSession({ callId: "clock-time-close", package: FIXTURES.CLOCK_REVIEW });
    session = step(session, { type: "start", at: 0 }).session;
    session = step(session, { type: "tick", at: TIME_LIMITS.closingAtMs + 1 }).session;
    expect(session.state).toBe("TIME_CLOSE");
    expect(nextActs(session).acts).not.toContain("give_answer");
  });
  it.each(["SCALE", "MONEY", "MINUTE", "MARBLES", "AREA_TF", "CLOCK_REVIEW"] as const)("%s does not count help, hedges, or questions as a step miss", async (id) => {
    for (const said of ["Help, 7.", "I think it's 7.", "Is it 7?"]) {
      const { text, model } = await start(id);
      const step = text.session.ladder.step;
      model.next([{ act: "guide", level: 0 }], { answers: [[7, step, "wrong"]] });
      await text.child(said);
      expect(text.session.finalMisses ?? 0, said).toBe(0);
      expect(text.session.ladder.failures, said).toBe(0);
    }
  });
  it("does not credit or count another person's scale answer", async () => {
    const { text, model } = await start("SCALE");
    model.next([{ act: "accept_answer" }], { start: "has_work" });
    await text.child("My mom said 80, so it's true.");
    expect(text.session.solved).toBeNull();
    expect(text.session.finalMisses ?? 0).toBe(0);
    expect(text.session.ladder.failures).toBe(0);
  });
  it("does not count a hedged marbles word", async () => {
    const { text, model } = await start("MARBLES");
    model.next([], { start: "has_work" });
    await text.child("I think it's true.");
    expect(text.session.finalMisses ?? 0).toBe(0);
    expect(text.session.ladder.failures).toBe(0);
  });
  it("gives no word after two committed wrong area words once the work is done: the easier example comes (D-306)", async () => {
    const { text, model } = await start("AREA_TF");
    model.next([{ throws: true }], { start: "has_work" });
    await text.child("6 times 3 is 18.");
    model.next([{ throws: true }], undefined);
    await text.child("It's false.");
    expect(text.session.finalMisses).toBe(1);
    model.next([{ throws: true }], undefined);
    await text.child("It's false.");
    expect(text.session.finalMisses).toBe(2);
    expect(text.session.solved).toBeNull();
    expect(text.session.assistance).not.toContain("answer_given");
    expect(text.session.assistance).toContain("worked_example");
  });
  it.each([
    ["MINUTE after example", C3B_REVIEW_BEHAVIOURS.find((b) => b.id === "OTWM4d")!],
    ["clock copy after H3", C3C_REVIEW_BEHAVIOURS.find((b) => b.id === "OTCLOCKCOPY")!],
    ["other area product", C3C_REVIEW_BEHAVIOURS.find((b) => b.id === "OTAREA8")!],
  ])("%s", async (_, b) => {
    const store = memoryTraceStore();
    const run = await runBehaviour(b, store);
    expect(run.error ?? null).toBeNull();
    expect(judge(b, store.load(b.id)).failures).toEqual([]);
  });
});
