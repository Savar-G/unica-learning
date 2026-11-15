import { describe, expect, it } from "vitest";
import type { MayaTrace, TraceAttempt, TraceTurn } from "@/lib/maya-trace";
import { isAttempt, LONGEST_RUN_TARGET, metricProblems, misconceptionFixed, OVERRIDE_TARGET, teachingMetrics } from "./teaching-metrics";

// The trace metrics (D-345): counted from a trace's turns with no AI. Synthetic traces keep each case exact.

const attempt = (over: Partial<TraceAttempt> = {}): TraceAttempt => ({ source: "model", proposal: null, refusal: null, ...over });
const maya = (at: number, say: string, attempts: TraceAttempt[] = [attempt()]): TraceTurn => ({ kind: "maya", at, state: "ASSESS", stateAfter: "ASSESS", attempts, output: { act: "guide", say: [say], board: [] } });
const opening = (at: number) => maya(at, "Hi, I'm Maya. Let's do 52 minus 28.", [attempt({ source: "controller" })]);
const child = (at: number, text: string): TraceTurn => ({ kind: "child", at, text });
const traceOf = (turns: TraceTurn[], reason: "solved" | "child_stopped" = "solved"): MayaTrace => ({ kind: "maya-trace", turns, board: [], outcome: { reason } } as unknown as MayaTrace);

describe("isAttempt", () => {
  it("is a number or a step that is not a request for help", () => {
    expect(isAttempt("12")).toBe(true);
    expect(isAttempt("Is 2 minus 8, 6?")).toBe(true);
    expect(isAttempt("I traded a ten")).toBe(true);
    expect(isAttempt("four")).toBe(true);
  });
  it("is not a request for help, even when it names the numbers", () => {
    expect(isAttempt("I don't get it.")).toBe(false);
    expect(isAttempt("Can you teach me how to do 2 minus 8? I don't get it.")).toBe(false);
    expect(isAttempt("okay")).toBe(false);
  });
  it("is an attempt when the child says a true or false equation, even beside a doubt", () => {
    expect(isAttempt("I don't know but 12 is 2 plus 10")).toBe(true);
  });
});

describe("teachingMetrics", () => {
  it("counts the override rate over teaching turns only: code's opening is not one", () => {
    const refused = attempt({ refusal: { code: "x" } as never });
    const m = teachingMetrics(traceOf([opening(0), child(4000, "12"), maya(5000, "Yes. What is 12 minus 8?"), child(9000, "4"), maya(10000, "Fine.", [refused, attempt({ source: "fallback" })])]));
    expect(m.teachingTurns).toBe(2);
    expect(m.overrides).toBe(1);
    expect(m.overrideRate).toBe(0.5);
    expect(metricProblems(m).join(" ")).toContain("override rate 50.0%");
  });

  it("a dropped sentence is an override, and a controller turn is never one", () => {
    const dropped = attempt({ dropped: [{ text: "x", reason: "plain_language" }] });
    const m = teachingMetrics(traceOf([opening(0), child(1000, "12"), maya(2000, "Yes.", [dropped])]));
    expect(m.overrides).toBe(1);
    const c = teachingMetrics(traceOf([opening(0), child(1000, "12"), maya(2000, "Yes.", [attempt({ source: "controller", dropped: [{ text: "x", reason: "y" }] })])]));
    expect(c.overrides).toBe(0);
    expect(c.teachingTurns).toBe(0);
    expect(c.overrideRate).toBeNull();
  });

  it("is under the target at 0%, and exactly 5% is not under it", () => {
    const clean = teachingMetrics(traceOf([opening(0), child(1000, "12"), maya(2000, "Yes.")]));
    expect(clean.overrideRate).toBe(0);
    expect(metricProblems(clean)).toEqual([]);
    expect(OVERRIDE_TARGET).toBe(0.05);
    expect(metricProblems({ ...clean, overrideRate: 0.05 }).length).toBe(1);
    expect(metricProblems({ ...clean, overrideRate: 0.049 })).toEqual([]);
  });

  it("finds the longest run of Maya turns, and fails a run longer than the target", () => {
    const m = teachingMetrics(traceOf([opening(0), maya(1000, "Are you there?"), maya(2000, "Still here."), child(3000, "12"), maya(4000, "Yes.")]));
    expect(m.longestMayaRun).toBe(3);
    expect(metricProblems(m).join(" ")).toContain(`3 Maya turns in a row; the target is ${LONGEST_RUN_TARGET}`);
    expect(teachingMetrics(traceOf([opening(0), child(1000, "12"), maya(2000, "Yes."), child(3000, "4"), maya(4000, "Yes.")])).longestMayaRun).toBe(1);
  });

  it("counts Maya words per child word", () => {
    const m = teachingMetrics(traceOf([opening(0), child(1000, "I don't get it"), maya(2000, "One two three four five six seven eight."), child(3000, "twelve plus four")]));
    expect(m.childWords).toBe(7);
    expect(m.mayaWords).toBe(8 + 8);
    expect(m.wordsPerChildWord).toBeCloseTo(16 / 7);
    expect(teachingMetrics(traceOf([opening(0)])).wordsPerChildWord).toBeNull();
  });

  it("finds the child's first attempt: Maya turns and seconds, skipping a request for help", () => {
    const m = teachingMetrics(traceOf([{ kind: "start", at: 1000 }, opening(1000), child(5000, "Can you teach me 2 minus 8? I don't get it."), maya(6000, "Good question."), child(10000, "I still don't get it"), maya(11000, "Trade a ten."), child(16000, "12")]));
    expect(m.firstAttempt).toEqual({ mayaTurns: 3, seconds: 15 });
  });

  it("has no first attempt when the child never tries", () => {
    expect(teachingMetrics(traceOf([opening(0), child(1000, "I don't get it"), maya(2000, "Let me help.")])).firstAttempt).toBeNull();
  });
});

describe("misconceptionFixed", () => {
  const wrongThenRight = (reason: "solved" | "child_stopped") => traceOf([opening(0), child(1000, "I got 36."), maya(2000, "Not quite."), child(3000, "12 take away 8 is 4"), maya(4000, "Yes."), child(5000, "so 24"), maya(6000, "That's it.")], reason);

  it("is fixed when the child says the wrong number and later the right one, and the call is solved", () => {
    expect(misconceptionFixed(wrongThenRight("solved"), { wrong: [36], right: 24 })).toEqual({ held: true, fixed: true });
  });
  it("is not fixed when the right number comes but the call is not solved and no answer was credited", () => {
    expect(misconceptionFixed(wrongThenRight("child_stopped"), { wrong: [36], right: 24 })).toEqual({ held: true, fixed: false });
  });
  it("is fixed when the session credited the right answer in an accepted reading", () => {
    const credited = attempt({ proposal: { reading: { answers: [{ value: { type: "number", value: 24 }, step: "result", problem: "target", verdict: "right" }] } } });
    const t = traceOf([opening(0), child(1000, "36"), maya(2000, "Not quite."), child(3000, "24"), maya(4000, "Yes.", [credited])], "child_stopped");
    expect(misconceptionFixed(t, { wrong: [36], right: 24 })).toEqual({ held: true, fixed: true });
  });
  it("is not held when the child never said the wrong number: nothing is claimed", () => {
    const t = traceOf([opening(0), child(1000, "24"), maya(2000, "Yes.")]);
    expect(misconceptionFixed(t, { wrong: [36], right: 24 })).toEqual({ held: false, fixed: false });
    expect(metricProblems(teachingMetrics(t, { wrong: [36], right: 24 }))).toEqual([]);
  });
  it("is not fixed when the child holds it to the end, and that is a problem", () => {
    const t = traceOf([opening(0), child(1000, "36"), maya(2000, "Not quite."), child(3000, "36 again"), maya(4000, "Hmm.")], "child_stopped");
    const m = teachingMetrics(t, { wrong: [36], right: 24 });
    expect(m.misconception).toEqual({ held: true, fixed: false });
    expect(metricProblems(m).join(" ")).toContain("did not fix it");
  });
  it("reads the right number only after the wrong one", () => {
    const t = traceOf([opening(0), child(1000, "24"), maya(2000, "Yes."), child(3000, "no, 36"), maya(4000, "Hmm.")], "child_stopped");
    expect(misconceptionFixed(t, { wrong: [36], right: 24 })).toEqual({ held: true, fixed: false });
  });
});
