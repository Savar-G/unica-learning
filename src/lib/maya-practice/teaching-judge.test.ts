import { describe, expect, it } from "vitest";
import { classifyError, type MayaTrace, type TraceAttempt, type TraceTurn } from "@/lib/maya-trace";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import type { OperationPackage } from "@/lib/question-package";
import {
  aiTeachingJudge, cannotStart, fakeTeachingJudge, judgeFamilyProblem, JUDGED_IDS, modelFamily, readTeachingJudgement, summarizeTeaching, teachingJudgeInput, teachingJudgeSchema, TEACHING_IDS,
  TEACHING_JUDGE_SYSTEM, teachingPlan, teachingProblems, type TeachingJudgeInput,
} from "./teaching-judge";

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
