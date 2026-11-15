import { describe, expect, it, vi } from "vitest";
import { createBudget } from "@/lib/maya-spend-block";
import { createTextSession } from "@/lib/maya-text";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import type { MayaModel, TurnBrief } from "@/lib/maya-model";
import type { SpendSeam } from "@/lib/maya-spend-seam";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { workedSteps, type QuestionPackage } from "@/lib/question-package";

vi.mock("server-only", () => ({}));

const desk: QuestionPackage = {
  ...SAMPLE_PACKAGES["subtract-52-28"], id: "synthetic-532-178", text: "532 - 178 = ?", level: 10,
  skill: { standard: "3.3", skills: ["3.3-subtract-within-1000"] },
  answer: { value: { type: "number", value: 354 }, accepted: [], unit: null },
  operation: { kind: "subtract", operands: [532, 178] }, steps: workedSteps({ kind: "subtract", operands: [532, 178] }),
  wrongAnswers: [{ value: { type: "number", value: 446 }, cause: "O1", step: "ones", description: "Subtracts the smaller digit from the larger in each column" }],
};

async function claimAfterGreeting(pkg: unknown) {
  let now = 1000, id = 0;
  const rows: string[] = [], settled: string[] = [], predicted: string[] = [], live: string[] = [];
  const budget = createBudget({ modelMicros: 210000, reviewMicros: 10000, usdToMicros: usd => Math.ceil(usd * 1e6), clock: () => now,
    newId: () => `block-${++id}`, reserve: async id => { rows.push(id); return { ok: true }; }, settle: async id => { settled.push(id); } });
  await budget.open();
  const fake = conversationalFake({ answer: (brief: TurnBrief) => brief.childTurn === "Hi Maya."
    ? reply("Hi! Let's start with the ones: 2 on top and 8 below. What can you do there?", "guide", { step: "ones", level: 0 })
    : reply("2 minus 8 isn't 6; 6 is 8 minus 2. Since 2 is smaller than 8, we take a ten. What is 12 minus 8?", "guide", { step: "ones", level: 2, reading: { answers: [{ value: { type: "number", value: 6 }, step: "ones", problem: "target", verdict: "wrong" }] } }) });
  const model: MayaModel = { ...fake, propose: async (brief, signal, onText, onCost) => {
    live.push((brief as unknown as TurnBrief).childTurn ?? "");
    const handle = budget.claim(210000);
    if (!handle || !budget.canSend(handle)) throw new Error("no admitted live handle");
    try { const value = await fake.propose(brief, signal, onText, onCost); budget.finish(handle, 5000); return value; }
    catch (error) { budget.finish(handle, 0); throw error; }
  } };
  const prepared: MayaModel = { ...fake, propose: async (brief, signal, onText, onCost) => {
    predicted.push((brief as unknown as TurnBrief).childTurn ?? "");
    const value = await fake.propose(brief, signal, onText, onCost); onCost?.(0.005); return value;
  } };
  // The seam keeps the actual handle objects. Its take is called only with model or speculative, never review.
  const session = createTextSession({ callId: "budget-claim", package: pkg, clock: () => now, model, spend: budget.seam as SpendSeam,
    prepareModel: () => prepared, modelRepair: false,
    reviewer: { id: "fake", promptVersion: "fake", review: async () => { const h = budget.take("review"); if (!h) throw new Error("no review room"); budget.finish(h, 100); return { verdict: "pass" }; } } });
  budget.newTurn(); const opening = budget.admit(2)!;
  await session.start(); budget.release(opening);
  // Wait for an already-started background refill while the child listens. open() adds no refill when a block exists.
  await budget.open();
  const at = predicted.length;
  now += 5000; budget.newTurn(); const hello = budget.admit(1)!;
  await session.child("Hi Maya."); budget.release(hello);
  const beforeClaim = predicted.slice(at), free = budget.attempts();
  now += 5000; budget.newTurn(); const claim = budget.admit(1)!;
  const result = await session.child("Is 2 minus 8, 6?"); budget.release(claim);
  session.cancelPending(); await session.finish(); await budget.stop();
  return { beforeClaim, free, result, live, rows, settled };
}

describe("preparation room before the first claim", () => {
  it.each([{ label: "two-column", pkg: SAMPLE_PACKAGES["subtract-52-28"] }, { label: "three-column", pkg: desk }])("prepares both values after the greeting for $label", async ({ pkg }) => {
    const r = await claimAfterGreeting(pkg);
    expect(r.beforeClaim).toEqual(["4", "6"]);
    expect(r.free).toBeGreaterThanOrEqual(2);
    expect(r.result).toMatchObject({ prepared: "hit", preparedKind: "expected" });
    expect(r.live).not.toContain("Is 2 minus 8, 6?");
    expect(r.settled.sort()).toEqual(r.rows.sort());
    expect(new Set(r.settled).size).toBe(r.settled.length);
  });

  it("starts one refill at two free attempts but cannot spend either protected attempt before it arrives", async () => {
    const response = Promise.withResolvers<{ ok: true }>();
    let n = 0;
    const reserve = vi.fn(async () => ++n === 1 ? { ok: true as const } : response.promise);
    const budget = createBudget({ modelMicros: 100, reviewMicros: 10, usdToMicros: usd => usd, clock: () => 1000, newId: () => String(n), reserve, settle: async () => {} });
    await budget.open();
    const live = budget.admit(1)!;
    const speculative = budget.seam.take("speculative")!;
    expect(budget.attempts()).toBe(2);
    expect(reserve).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 3; i++) { budget.tick(); expect(budget.seam.take("speculative")).toBeNull(); }
    expect(reserve).toHaveBeenCalledTimes(2);
    // A live turn can still claim its admitted attempt without waiting for the refill.
    expect(budget.claim(100)).toBe(live);
    expect(budget.canSend(live)).toBe(true);
    expect(budget.attempts()).toBe(2);
    response.resolve({ ok: true }); await budget.open();
    expect(budget.attempts()).toBe(6);
    const next = budget.seam.take("speculative");
    expect(next).not.toBeNull();
    budget.finish(live, 1); budget.finish(speculative, 1); budget.finish(next!, 1); await budget.stop();
  });

  it("starts the early refill on the timer, and settles its late response after stop", async () => {
    const response = Promise.withResolvers<{ ok: true }>();
    let n = 0;
    const reserve = vi.fn(async () => ++n === 1 ? { ok: true as const } : response.promise);
    const settle = vi.fn(async () => {});
    const budget = createBudget({ modelMicros: 100, reviewMicros: 10, usdToMicros: usd => usd, clock: () => 1000,
      newId: () => String(n), reserve, settle });
    await budget.open();
    expect(budget.admit(1)).not.toBeNull();
    expect(budget.admit(1)).not.toBeNull();
    expect(budget.attempts()).toBe(2);
    // Live admission at two free attempts keeps its existing no-reservation path.
    expect(reserve).toHaveBeenCalledTimes(1);
    budget.tick();
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(budget.seam.take("speculative")).toBeNull();
    const stopped = budget.stop();
    response.resolve({ ok: true });
    await stopped;
    expect(settle).toHaveBeenCalledTimes(2);
    expect(budget.seam.take("model")).toBeNull();
    expect(budget.seam.take("speculative")).toBeNull();
    expect(budget.attempts()).toBe(0);
  });
});
