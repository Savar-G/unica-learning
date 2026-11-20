import { describe, expect, it } from "vitest";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { measureSuite } from "@/lib/maya-practice/cost";
import { aiTeachingJudge, cannotStart, fakeTeachingJudge, JUDGED_IDS, judgeFamilyProblem, modelFamily, readTeachingJudgement, summarizeTeaching, TEACHING_IDS, TEACHING_JUDGE_SYSTEM, teachingJudgeInput, type TeachingJudgeInput, teachingJudgeSchema, teachingPlan, teachingProblems } from "@/lib/maya-practice/teaching-judge";
import { isAttempt, misconceptionFixed, teachingMetrics } from "@/lib/maya-practice/teaching-metrics";
import { TUTOR_CASES } from "@/lib/maya-practice/tutor-cases";
import { caseChecks } from "@/lib/maya-practice/tutor-run";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { classifyError, type MayaTrace, type TraceAttempt, type TraceTurn } from "@/lib/maya-trace";
import type { OperationPackage } from "@/lib/question-package";

// The teaching judge (D-345): the plan code makes, the strict reader, the aggregation and the family rule. No model call.

const PKG = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;

const attempt = (over: Partial<TraceAttempt> = {}): TraceAttempt => ({ source: "model", proposal: null, refusal: null, ...over });

const maya = (at: number, say: string, act = "guide", attempts: TraceAttempt[] = [attempt()]): TraceTurn => ({ kind: "maya", at, state: "ASSESS", stateAfter: "ASSESS", attempts, output: { act: act as never, say: [say], board: [] } });

const opening = (at: number) => maya(at, "Hi, I'm Maya. Let's do 52 minus 28.", "open", [attempt({ source: "controller" })]);

const child = (at: number, text: string): TraceTurn => ({ kind: "child", at, text });

const traceOf = (turns: TraceTurn[]): MayaTrace => ({ kind: "maya-trace", turns, board: [], outcome: null } as unknown as MayaTrace);

const SAVAR = "Can you teach me how to do 2 minus 8? I don't get it.";

describe("cannotStart", () => {
  it("reads a request for help with no attempt", () => {
    expect(cannotStart(SAVAR)).toBe(true);
    expect(cannotStart("I don't get it")).toBe(true);
    expect(cannotStart("I'm stuck")).toBe(true);
    expect(cannotStart("12")).toBe(false);
    expect(cannotStart("I got 36")).toBe(false);
  });
});

describe("teachingPlan: which dimensions apply, decided by code", () => {
  const savar = traceOf([opening(0), child(4000, SAVAR), maya(5000, "Good question. 2 is too small to take 8. Trade 1 ten for 10 ones. What is 12 minus 8?")]);

  it("skips code's opening, and scores the reply on every dimension that applies to it", () => {
    const plan = teachingPlan(savar);
    expect(plan).toHaveLength(1);
    expect(plan[0].turn).toBe(3);
    // T03 applies: the child could not start. T10 does not: one teaching turn cannot repeat.
    expect(plan[0].score).toEqual(["T01", "T02", "T03", "T04", "T05", "T07", "T08", "T09"]);
    expect(plan[0].mayBeNotApplicable).toEqual(["T02"]);
    expect(plan[0].code.T06).toBe(3);
    expect(plan[0].words).toBe(20);
  });

  it("does not apply T03 after an attempt, and applies T10 from two teaching turns", () => {
    const plan = teachingPlan(traceOf([opening(0), child(1000, "12"), maya(2000, "Yes. What is 12 minus 8?"), child(3000, "4"), maya(4000, "That's it. What is 4 tens minus 2 tens?")]));
    expect(plan).toHaveLength(2);
    expect(plan[0].score).toContain("T10");
    expect(plan[0].score).not.toContain("T03");
  });

  it("does not apply T04 or T08 to a closing turn", () => {
    const plan = teachingPlan(traceOf([opening(0), child(1000, "24"), maya(2000, "You traded a ten. Great work today. Bye!", "close")]));
    expect(plan[0].score).not.toContain("T04");
    expect(plan[0].score).not.toContain("T08");
    expect(plan[0].score).toContain("T01");
  });

  it("scores T06 from the run of Maya turns: 1 is 3, 2 is 2, 3 or more is 0", () => {
    const plan = teachingPlan(traceOf([opening(0), maya(1000, "Are you there?"), maya(2000, "I am here."), child(3000, "12"), maya(4000, "Yes.")]));
    // The opening, then two teaching turns in a row: the second is the third Maya turn without the child.
    expect(plan.map((p) => p.code.T06)).toEqual([2, 0, 3]);
  });

  it("does not apply T01 to a turn before the child has spoken", () => {
    const plan = teachingPlan(traceOf([opening(0), maya(1000, "Take your time.")]));
    expect(plan[0].score).not.toContain("T01");
  });
});

describe("teachingJudgeInput", () => {
  it("numbers the turns, puts the child's name back, and holds only the rubric the plan uses", () => {
    const t = traceOf([opening(0), child(4000, SAVAR), maya(5000, "Good question, {name}. What is 12 minus 8?")]);
    const input = teachingJudgeInput(PKG, 8, t, "voice", "Zoe");
    expect(input.turns.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(input.turns[2].text).toContain("Zoe");
    expect(input.question.answer).toBe("24");
    expect(input.score).toEqual([{ turn: 3, words: 8, dimensions: ["T01", "T02", "T03", "T04", "T05", "T07", "T08", "T09"], mayBeNotApplicable: ["T02"] }]);
    expect(input.rubric.map((r) => r.id)).toEqual(["T01", "T02", "T03", "T04", "T05", "T07", "T08", "T09"]);
    expect(JSON.stringify(input)).not.toMatch(/claude|gpt|model/i);
  });
});

describe("readTeachingJudgement: the strict reader", () => {
  const trace = traceOf([opening(0), child(1000, SAVAR), maya(2000, "Good question. What is 12 minus 8?"), child(3000, "4"), maya(4000, "That's it. What is 4 tens minus 2 tens?")]);
  const plan = teachingPlan(trace);
  const good = async () => (await fakeTeachingJudge().judge(teachingJudgeInput(PKG, 8, trace, "voice", "Zoe"), new AbortController().signal)) as { turns: Record<string, unknown>[] };
  const withEntry = async (edit: (e: Record<string, unknown>) => void, i = 0) => {
    const raw = await good();
    edit(raw.turns[i]);
    return readTeachingJudgement(raw, plan);
  };

  it("accepts the fake judge's answer, adds T06 from code, and keeps every score", async () => {
    const r = readTeachingJudgement(await good(), plan);
    expect(r.ok).toBe(true);
    expect(r.turns).toHaveLength(2);
    expect(r.turns[0].scores.T01).toEqual({ score: 3, reason: "fake judgement" });
    expect(r.turns[0].scores.T06?.score).toBe(3);
    expect(r.turns[0].scores.T03).toBeDefined();
    expect(r.turns[1].scores.T03).toBeUndefined();
  });

  it("refuses an answer that is not an object, has no turns, or has the wrong number of turns", () => {
    expect(readTeachingJudgement("x", plan).ok).toBe(false);
    expect(readTeachingJudgement({}, plan).ok).toBe(false);
    expect(readTeachingJudgement({ turns: [] }, plan).ok).toBe(false);
    expect(readTeachingJudgement({ turns: [], extra: 1 }, plan).problems.join(" ")).toContain("unknown field extra");
  });

  it("refuses a turn for another id, an unknown key, and a T06 from the judge", async () => {
    expect((await withEntry((e) => { e.turn = 9; })).problems.join(" ")).toContain("expected 3");
    expect((await withEntry((e) => { e.T11 = {}; })).problems.join(" ")).toContain("unknown field T11");
    expect((await withEntry((e) => { e.T06 = { status: "scored", score: 3, reason: "x" }; })).problems.join(" ")).toContain("T06 is scored by code");
  });

  it("refuses a score outside 0 to 3, a missing reason, an extra key and a missing dimension", async () => {
    expect((await withEntry((e) => { e.T01 = { status: "scored", score: 4, reason: "x" }; })).ok).toBe(false);
    expect((await withEntry((e) => { e.T01 = { status: "scored", score: 1.5, reason: "x" }; })).ok).toBe(false);
    expect((await withEntry((e) => { e.T01 = { status: "scored", score: 2, reason: " " }; })).problems.join(" ")).toContain("no reason");
    expect((await withEntry((e) => { e.T01 = { status: "scored", score: 2, reason: "x", turns: [1] }; })).problems.join(" ")).toContain("unknown field turns");
    expect((await withEntry((e) => { delete e.T09; })).problems.join(" ")).toContain("T09 is missing");
  });

  it("allows n/a only where the plan allows it", async () => {
    const na = { status: "n/a", score: null, reason: "" };
    expect((await withEntry((e) => { e.T02 = na; })).ok).toBe(true);
    expect((await withEntry((e) => { e.T01 = na; })).problems.join(" ")).toContain("T01 applies to this turn and cannot be \"n/a\"");
    expect((await withEntry((e) => { e.T02 = { status: "n/a", score: 2, reason: "" }; })).problems.join(" ")).toContain("null score");
  });

  it("refuses a score on a dimension that does not apply to the turn", async () => {
    // T03 does not apply to the second turn (the child tried).
    const r = await withEntry((e) => { e.T03 = { status: "scored", score: 3, reason: "x" }; }, 1);
    expect(r.problems.join(" ")).toContain("T03 does not apply to this turn");
  });

  it("a refused turn keeps no judged score, and another turn keeps its scores", async () => {
    const r = await withEntry((e) => { e.T01 = { status: "scored", score: 9, reason: "x" }; });
    expect(r.ok).toBe(false);
    expect(r.turns[0].scores.T02).toBeUndefined();
    expect(r.turns[0].scores.T06?.score).toBe(3);
    expect(r.turns[1].scores.T01?.score).toBe(3);
  });
});

describe("summarizeTeaching and the pass rule", () => {
  const turn = (n: number, scores: Record<string, number>) => ({ turn: n, scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, { score: v as 0 | 1 | 2 | 3, reason: "r" }])) });

  it("gives the worst and the median of each dimension", () => {
    const s = summarizeTeaching([turn(1, { T01: 3, T05: 1 }), turn(2, { T01: 2, T05: 2 }), turn(3, { T01: 3, T05: 3 })]);
    expect(s.find((d) => d.id === "T01")).toMatchObject({ scored: 3, worst: 2, median: 3 });
    expect(s.find((d) => d.id === "T05")).toMatchObject({ worst: 1, median: 2 });
    expect(s.find((d) => d.id === "T08")).toMatchObject({ scored: 0, worst: null, median: null });
    expect(s).toHaveLength(TEACHING_IDS.length);
  });
  it("passes at a median of 2 with no 0, and misses on a median under 2 or any 0", () => {
    expect(teachingProblems(summarizeTeaching([turn(1, { T01: 2 }), turn(2, { T01: 2 })]))).toEqual([]);
    expect(teachingProblems(summarizeTeaching([turn(1, { T01: 1 }), turn(2, { T01: 2 })]))[0]).toContain("T01");
    expect(teachingProblems(summarizeTeaching([turn(1, { T01: 0 }), turn(2, { T01: 3 }), turn(3, { T01: 3 })])).join(" ")).toContain("a turn scored 0");
  });
});

describe("the judge's family", () => {
  it("reads the vendor of a model id", () => {
    expect(modelFamily("anthropic/claude-sonnet-5.5")).toBe("anthropic");
    expect(modelFamily("openai/gpt-5.4")).toBe("openai");
    expect(modelFamily("claude-opus-5-5")).toBe("anthropic");
    expect(modelFamily("gpt-5.4")).toBe("openai");
  });
  it("refuses a judge of Maya's own family, and accepts another", () => {
    expect(judgeFamilyProblem("anthropic/claude-sonnet-5.5", "openai/gpt-5.4")).toBeNull();
    expect(judgeFamilyProblem("anthropic/claude-sonnet-5.5", "anthropic/claude-opus-5.5")).toContain("another family");
    expect(judgeFamilyProblem("claude-sonnet-5-5", "claude-opus-5-5")).toContain("same model family");
  });
});

describe("the prompt and the schema", () => {
  it("has the strict schema: nine judged dimensions per turn, T06 never", () => {
    const schema = teachingJudgeSchema() as { properties: { turns: { items: { required: string[]; additionalProperties: boolean } } } };
    expect(schema.properties.turns.items.required).toEqual(["turn", ...JUDGED_IDS]);
    expect(schema.properties.turns.items.required).not.toContain("T06");
    expect(schema.properties.turns.items.additionalProperties).toBe(false);
  });
  it("tells the judge that Maya may tell, and to judge T07 by what the child still does", () => {
    expect(TEACHING_JUDGE_SYSTEM).toContain("she may tell a step or the answer");
    expect(TEACHING_JUDGE_SYSTEM).toContain("2 minus 8");
  });
  it("sends the judge client one strict request and returns its answer unread", async () => {
    const seen: { schema: unknown; system: string }[] = [];
    const judge = aiTeachingJudge({ model: "other-family/judge", json: async (r) => { seen.push({ schema: r.schema, system: r.system }); return { turns: [] }; } });
    const input: TeachingJudgeInput = teachingJudgeInput(PKG, 8, traceOf([opening(0)]), "voice", "Zoe");
    expect(await judge.judge(input, new AbortController().signal)).toEqual({ turns: [] });
    expect(seen[0].system).toBe(TEACHING_JUDGE_SYSTEM);
    expect(JSON.stringify(seen[0].schema)).toContain("additionalProperties");
    expect(classifyError(new Error("x"), "model").code).toBeDefined();
  });
});

describe("tutor judge regressions", () => {
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
});
