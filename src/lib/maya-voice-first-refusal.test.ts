import { describe, expect, it } from "vitest";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { memorySpendSeam } from "@/lib/maya-spend-seam";
import { createTextSession } from "@/lib/maya-text";
import { checkTrace } from "@/lib/maya-trace";
import type { TurnBrief } from "@/lib/maya-model";

// Live practice at 980571e0: on a voice call a refused first proposal waited for a model repair (2.2 to 2.3 s) that was
// refused as well, then code's own line came. On a voice call the first refusal now goes straight to code's line.
// `modelRepair: false` is the voice call's setting (openVoice); chat and admin text calls keep their repair.

const PKG = SAMPLE_PACKAGES["subtract-52-28"];
const T0 = Date.UTC(2026, 10, 13, 16, 0, 0);
const LEAK = reply("The answer is 24.", "guide", { step: "ones", level: 0 });
const GOOD = reply("Let's look at the ones. What is 12 minus 8?", "guide", { step: "ones", level: 2 });

function call(answer: (brief: TurnBrief, n: number) => unknown, more: Partial<Parameters<typeof createTextSession>[0]> = {}) {
  let now = T0;
  const model = conversationalFake({ answer });
  const session = createTextSession({ callId: "voice-first", package: PKG, model, clock: () => (now += 500), random: 3, childName: "Ava", reviewer: fakeTalkReviewer(), prepareExpected: false, ...more });
  return { session, model };
}
const lastAttempts = (s: ReturnType<typeof call>["session"]) => s.trace().turns.filter((t) => t.kind === "maya").at(-1)!.attempts!.map((a) => [a.source, a.refusal?.say ?? null]);

describe("a refused first proposal", () => {
  it("voice (modelRepair: false): goes straight to code's line, one model request, in order model then fallback", async () => {
    const { session, model } = call((_b, n) => (n === 0 ? LEAK : GOOD), { modelRepair: false });
    await session.start();
    const out = await session.child("6");
    expect(model.briefs).toHaveLength(1);
    expect(lastAttempts(session)).toEqual([["model", "reveals_answer"], ["fallback", null]]);
    expect(out.say.join(" ")).not.toContain("24");
    expect(out.say.length).toBeGreaterThan(0);
    expect(checkTrace(session.trace()).ok).toBe(true);
  });
  it.each([["chat", { channel: "chat" as const }], ["the default (admin text call)", {}]])("%s: keeps the model repair", async (_n, more) => {
    const { session, model } = call((_b, n) => (n === 0 ? LEAK : GOOD), more);
    await session.start();
    const out = await session.child("6");
    expect(model.briefs).toHaveLength(2);
    expect(model.briefs[1].repair?.refusal.say).toBe("reveals_answer");
    expect(lastAttempts(session)).toEqual([["model", "reveals_answer"], ["repair", null]]);
    expect(out.say).toEqual(["Let's look at the ones. What is 12 minus 8?"]);
  });
  it("voice: a good first proposal is unchanged", async () => {
    const { session, model } = call(() => GOOD, { modelRepair: false });
    await session.start();
    const out = await session.child("6");
    expect(model.briefs).toHaveLength(1);
    expect(lastAttempts(session)).toEqual([["model", null]]);
    expect(out.say).toEqual(["Let's look at the ones. What is 12 minus 8?"]);
  });
  it("voice: a first proposal the review refuses goes straight to code's line, with no repair", async () => {
    const warm = reply("You are so smart, I am proud of you!", "guide", { step: "ones", level: 0 });
    const reviewer = fakeTalkReviewer(() => ({ verdict: "fail", reason: "praise of intelligence", rules: ["ability_praise"] }));
    for (const modelRepair of [false, true]) {
      const { session, model } = call((_b, n) => (n === 0 ? warm : GOOD), { modelRepair, reviewer });
      await session.start();
      await session.child("6");
      const attempts = lastAttempts(session);
      expect(model.briefs).toHaveLength(modelRepair ? 2 : 1);
      if (!modelRepair) expect(attempts.map((a) => a[0])).toEqual(["model", "fallback"]);
    }
  });
  it("voice: a prepared reply the real turn refuses goes straight to code's line, and its one spend handle settles once", async () => {
    const spend = memorySpendSeam(10);
    const { session, model } = call((_b, n) => (n === 0 ? LEAK : GOOD), { modelRepair: false, spend });
    await session.start();
    expect(session.prepare("6")).toBe(true);
    const out = await session.child("6");
    expect(out.prepared).toBe("hit");
    expect(model.briefs).toHaveLength(1);
    expect(lastAttempts(session)).toEqual([["model", "reveals_answer"], ["fallback", null]]);
    expect(out.say.join(" ")).not.toContain("24");
    expect(spend.taken).toHaveLength(1);
    expect(spend.settled).toHaveLength(1);
    expect(spend.givenBack).toHaveLength(0);
  });
  it("voice: a delayed first proposal (the turn's time is up) is not asked for again, and code's line follows", async () => {
    const { session, model } = call(() => new Promise(() => undefined), { modelRepair: false, turnBudgetMs: 20 });
    await session.start();
    const out = await session.child("6");
    expect(model.briefs).toHaveLength(1);
    expect(out.say.length).toBeGreaterThan(0);
    expect(checkTrace(session.trace()).ok).toBe(true);
  });
  it("voice: a new child turn that stops the first request starts no repair for it", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => { release = r; });
    const { session, model } = call((_b, n) => (n === 0 ? gate.then(() => LEAK) : GOOD), { modelRepair: false });
    await session.start();
    const first = session.child("6");
    await Promise.resolve();
    const second = session.child("7");
    release!();
    await Promise.all([first, second]);
    expect(model.briefs.every((b) => b.repair === null)).toBe(true);
  });
});

describe("safety stays code's, with or without the repair", () => {
  it("a refused proposal that reads the child's words as a danger gets code's guidance at once, the same on a voice call as on a text call", async () => {
    const flagged = { ...LEAK, kind: "safety", reading: { ...LEAK.reading, safety: "immediate" } };
    const said: string[][] = [];
    const asked: number[] = [];
    for (const modelRepair of [false, true]) {
      const { session, model } = call(() => flagged, { modelRepair });
      await session.start();
      const turn = await session.child("I want to hurt myself.");
      said.push(turn.say);
      asked.push(model.briefs.length);
      expect(turn.say.length).toBeGreaterThan(0);
      expect(turn.say.join(" ")).not.toContain("24");
      expect(checkTrace(session.trace()).ok).toBe(true);
    }
    expect(said[0]).toEqual(said[1]);
    // The text call may repair first; the voice call never asks more often than it.
    expect(asked[0]).toBeLessThanOrEqual(asked[1]);
  });
});
