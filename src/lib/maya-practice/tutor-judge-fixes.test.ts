import { describe, expect, it } from "vitest";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import type { MayaTrace, TraceAttempt, TraceTurn } from "@/lib/maya-trace";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import type { OperationPackage } from "@/lib/question-package";
import { measureSuite } from "./cost";
import { fakeTeachingJudge, readTeachingJudgement, teachingJudgeInput, teachingPlan } from "./teaching-judge";
import { isAttempt, misconceptionFixed, teachingMetrics } from "./teaching-metrics";
import { TUTOR_CASES } from "./tutor-cases";
import { caseChecks } from "./tutor-run";

// Binding tests for the five P2 findings of the Sol review of #1010 (issue #1015). Each one fails on 6cb668ba3.

const PKG = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const attempt = (over: Partial<TraceAttempt> = {}): TraceAttempt => ({ source: "model", proposal: null, refusal: null, ...over });
const maya = (at: number, say: string, act = "guide"): TraceTurn => ({ kind: "maya", at, state: "ASSESS", stateAfter: "ASSESS", attempts: [attempt()], output: { act: act as never, say: [say], board: [] } });
const opening = (at: number): TraceTurn => ({ kind: "maya", at, state: "ASSESS", stateAfter: "ASSESS", attempts: [attempt({ source: "controller" })], output: { act: "open", say: ["Hi, I'm Maya."], board: [] } });
const child = (at: number, text: string): TraceTurn => ({ kind: "child", at, text });
const traceOf = (turns: TraceTurn[], reason: "solved" | "child_stopped" = "solved"): MayaTrace => ({ kind: "maya-trace", turns, board: [], outcome: { reason } } as unknown as MayaTrace);
const K01 = TUTOR_CASES.find((c) => c.id === "K01")!;

describe("1. the estimate counts each sentence review of a tutor run", () => {
  it("counts more reviews than Maya calls when one message holds several sentences about the child", async () => {
    // Two sentences about the child in every message: the tutor core reviews each one.
    const tutor = conversationalFake({ id: "dry", answer: () => reply("You're right that 2 is too small to take 8 away. You are working hard on this. What is 12 minus 8?", "guide") });
    const m = await measureSuite([K01], 1, { tutor: true }, { tutor });
    expect(m.maya.calls).toBeGreaterThan(0);
    expect(m.reviewer.calls).toBeGreaterThan(m.maya.calls);
    // And it grows with the runs: the dry run's reviews are counted for every run.
    const three = await measureSuite([K01], 3, { tutor: true }, { tutor });
    expect(three.reviewer.calls).toBe(m.reviewer.calls * 3);
  });
});

describe("2. the teaching judge's answer is checked in every field, for both statuses", () => {
  const trace = traceOf([opening(0), child(1000, "12"), maya(2000, "Yes. What is 12 minus 8?")]);
  const plan = teachingPlan(trace);
  const base = async () => (await fakeTeachingJudge().judge(teachingJudgeInput(PKG, 8, trace, "voice", "Zoe"), new AbortController().signal)) as { turns: Record<string, unknown>[] };
  const with_ = async (edit: (e: Record<string, unknown>) => void) => { const raw = await base(); edit(raw.turns[0]); return readTeachingJudgement(raw, plan); };

  it("refuses an n/a with no reason, and an n/a whose reason is an object", async () => {
    expect((await with_((e) => { e.T02 = { status: "n/a", score: null }; })).ok).toBe(false);
    expect((await with_((e) => { e.T02 = { status: "n/a", score: null, reason: { x: 1 } }; })).ok).toBe(false);
    expect((await with_((e) => { e.T02 = { status: "n/a", score: null, reason: 5 }; })).problems.join(" ")).toContain("T02");
  });
  it("refuses a dimension that does not apply when its reason is missing or not a string", async () => {
    // T03 does not apply after an attempt: it must still be a complete n/a.
    expect((await with_((e) => { e.T03 = { status: "n/a", score: null }; })).problems.join(" ")).toContain("T03");
    expect((await with_((e) => { e.T03 = { status: "n/a", score: null, reason: {} }; })).ok).toBe(false);
  });
  it("still accepts a complete n/a, with an empty reason", async () => {
    expect((await with_((e) => { e.T02 = { status: "n/a", score: null, reason: "" }; })).ok).toBe(true);
  });
});

describe("3. a help request is one check: \"I can't start\" is not an attempt, and T03 applies", () => {
  it("is not an attempt, though it names the numbers", () => {
    expect(isAttempt("I can't start 52 minus 28")).toBe(false);
    expect(isAttempt("I cannot start")).toBe(false);
  });
  it("applies T03 to the reply", () => {
    const plan = teachingPlan(traceOf([opening(0), child(1000, "I can't start 52 minus 28"), maya(2000, "Let's trade a ten. What is 2 plus 10?")]));
    expect(plan[0].score).toContain("T03");
  });
  it("reports no first attempt until the child really tries, not 0 turns and 0 seconds", () => {
    const stuck = teachingMetrics(traceOf([{ kind: "start", at: 0 }, opening(0), child(1000, "I can't start 52 minus 28"), maya(2000, "Trade a ten.")]));
    expect(stuck.firstAttempt).toBeNull();
    const later = teachingMetrics(traceOf([{ kind: "start", at: 0 }, opening(0), child(1000, "I can't start 52 minus 28"), maya(2000, "Trade a ten. What is 2 plus 10?"), child(6000, "12")]));
    expect(later.firstAttempt).toEqual({ mayaTurns: 2, seconds: 6 });
  });
});

describe("4. a misconception fix is read in number words too", () => {
  it("reads \"I got 36\", then \"Twenty-four\", as fixed", () => {
    const t = traceOf([opening(0), child(1000, "I got 36"), maya(2000, "Not quite."), child(3000, "Twenty-four"), maya(4000, "Yes.")]);
    expect(misconceptionFixed(t, { wrong: [36], right: 24 })).toEqual({ held: true, fixed: true });
  });
  it("reads a wrong number said in words as held", () => {
    const t = traceOf([opening(0), child(1000, "thirty six"), maya(2000, "Not quite."), child(3000, "24"), maya(4000, "Yes.")]);
    expect(misconceptionFixed(t, { wrong: [36], right: 24 })).toEqual({ held: true, fixed: true });
  });
});

describe("5. K01 needs a request for the child to compute 12 minus 8", () => {
  const checkOf = (turns: string[]) => {
    const t = traceOf([opening(0), child(1000, "Can you teach me how to do 2 minus 8? I don't get it."), ...turns.map((s, i) => maya(2000 + i * 3000, s))]);
    return caseChecks(K01, t).find((c) => /^asks .*12 minus 8/.test(c.what))!.ok;
  };
  const WHY = "2 is too small to take 8, so trade 1 ten for 10 ones.";

  it("fails when Maya does 12 minus 8 herself and asks something else", () => {
    expect(checkOf([`${WHY} I'll do 12 minus 8 for you: 4. Now what is 4 minus 2?`])).toBe(false);
    expect(checkOf([`${WHY} 12 minus 8 is 4. What is 4 minus 2?`])).toBe(false);
  });
  it("passes when Maya asks the child for it", () => {
    for (const ask of ["Now what is 12 minus 8?", "What do you get for 12 minus 8?", "How much is 12 − 8?", "Can you do 12 minus 8?", "Try 12 minus 8.", "What's 12 take away 8?"]) expect(checkOf([`${WHY} ${ask}`]), ask).toBe(true);
  });
  it("passes when the ask comes in the second turn", () => {
    expect(checkOf([WHY, "Now what is 12 minus 8?"])).toBe(true);
  });
});
