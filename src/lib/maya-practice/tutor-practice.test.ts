import { fakeMathReviewer } from "@/lib/maya-math-review";
import { describe, expect, it } from "vitest";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import type { MayaModel, TurnBrief } from "@/lib/maya-model";
import {
  buildReport, estimateCost, fakeJudge, fakeTeachingJudge, fakeTutorModel, fakeValidityJudge, memoryPracticeStore, planSuite, recordFile, reportMarkdown, runSuite, scriptedSimulator, teachingFile,
  SIMULATOR_PROMPT_VERSION, TUTOR_CASES, type ChildSimulator, type PracticeCase, type TeachingJudge, type TeachingLog, type TeachingVerdict,
} from "./index";
import { teachingJudgeInput } from "./teaching-judge";
import { practicePackage } from "./packages";
import { measureSuite } from "./cost";

// The tutor suite (D-345) through its public interface, with fake models only: no network, no cost. The tutor core runs
// through the text adapter; the teaching judge, the trace metrics and the case checks decide each run.

const K01 = TUTOR_CASES.find((c) => c.id === "K01")!;
const TARGET = "Good question, {name}. You're right that 2 is too small to take 8 away. So we borrow: trade 1 ten from the 5 tens for 10 ones. Now how many ones do you have, 2 plus 10?";
const right = (value: number, step: string) => ({ answers: [{ value: { type: "number", value }, step, problem: "target", verdict: "right" }] });

const STEPS = [
  () => reply("Yes, 12 ones. Now what is 12 minus 8?", "guide", { reading: right(12, "ones") }),
  () => reply("That's it, 12 minus 8 is 4. We traded one ten, so how many tens are left from 5?", "guide", { reading: right(4, "ones") }),
  () => reply("Yes, 24! How did you get it?", "guide", { reading: right(24, "result") }),
  () => reply("You traded a ten and did each column. Great work today. Bye for now!", "close"),
];
/** A tutor that teaches Savar's call the way the design says, then goes step by step. */
function goodTutor(): MayaModel {
  const first = () => reply(TARGET, "guide", { reading: { help: "more", start: "no_start" }, draw: [{ offer: "trade", place: "" }] });
  return conversationalFake({ id: "fake-tutor-good", answer: (_b: TurnBrief, n: number) => (n === 0 ? first : STEPS[Math.min(n - 1, STEPS.length - 1)])() });
}
/** A tutor that ignores the child's question at first and offers another problem, then goes step by step. */
const badTutor = (): MayaModel => conversationalFake({ id: "fake-tutor-bad", answer: (_b: TurnBrief, n: number) => (n === 0 ? () => reply("Let me show you an easier one. What is 12 minus 7?", "guide") : STEPS[Math.min(n - 1, STEPS.length - 1)])() });

async function tutorSuite(cases: PracticeCase[], options: { maya?: MayaModel; teachingJudge?: TeachingJudge; runs?: number } = {}) {
  const store = memoryPracticeStore();
  const maya = options.maya ?? fakeTutorModel();
  const judge = fakeJudge();
  const validity = fakeValidityJudge();
  const teachingJudge = options.teachingJudge ?? fakeTeachingJudge();
  const children = new Map(cases.map((c) => [c.persona.name, scriptedSimulator(c.fakeScript)]));
  const simulator: ChildSimulator = { id: "fake-child", promptVersion: SIMULATOR_PROMPT_VERSION, next: (input, signal) => children.get(input.persona.name)!.next(input, signal) };
  const runs = options.runs ?? 1;
  const plan = planSuite(cases, {
    maya: { model: maya.id, promptVersion: maya.promptVersion }, simulator: { model: simulator.id, promptVersion: simulator.promptVersion },
    validity: { model: validity.id, promptVersion: validity.promptVersion }, judge: { model: judge.id, promptVersion: judge.promptVersion },
    teaching: { model: teachingJudge.id, promptVersion: teachingJudge.promptVersion }, meta: { commit: "test" },
  }, { runs, tutor: true });
  await runSuite(cases, plan, { maya, simulator, validity, judge, teachingJudge, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(), store });
  return { store, plan, teachingJudge, report: () => buildReport(cases, store, runs, { tutor: true }) };
}
const verdict = (report: ReturnType<typeof buildReport>, id: string): TeachingVerdict => report.runs.find((r) => r.id === id)!.teaching!;

describe("the tutor cases", () => {
  it("name Savar's call first, with the exact words and the three things Maya must say within 2 turns", () => {
    expect(TUTOR_CASES[0].id).toBe("K01");
    expect(K01.opener).toBe("Can you teach me how to do 2 minus 8? I don't get it.");
    expect(K01.tutor?.checks?.map((c) => c.what)).toEqual(["says why 2 is too small to take 8 from", "says that a ten becomes 10 ones", "asks the child for 12 minus 8"]);
    expect(K01.tutor?.checks?.every((c) => c.within === 2)).toBe(true);
  });
  it("hold the misconceptions the design lists: smaller-from-larger, the lost ten, the lost carry, a wrong answer then a right one, \"I don't get it\" twice", () => {
    const m = Object.fromEntries(TUTOR_CASES.map((c) => [c.id, c.tutor?.misconception]));
    expect(m.K02).toEqual({ wrong: [36], right: 24 });
    expect(m.K03).toEqual({ wrong: [34], right: 24 });
    expect(m.K04).toEqual({ wrong: [56], right: 66 });
    expect(m.K06).toEqual({ wrong: [26], right: 24 });
    expect(TUTOR_CASES.find((c) => c.id === "K05")?.opener).toBe("I don't get it.");
    expect(TUTOR_CASES.find((c) => c.id === "K05")?.validity.mustSay?.[0].within).toBe(2);
  });
  it("use packages the tutor core teaches", () => {
    for (const c of TUTOR_CASES) expect(practicePackage(c).operation?.kind).toMatch(/add|subtract/);
  });
});

describe("a tutor run: Savar's call", () => {
  it("passes with a tutor that explains in one message: the case checks, the metrics and the teaching judge", async () => {
    const { report, store } = await tutorSuite([K01], { maya: goodTutor() });
    const r = report();
    const t = verdict(r, "K01-r1");
    expect(t.checks).toEqual([
      { what: "says why 2 is too small to take 8 from (within 2 Maya turns)", ok: true },
      { what: "says that a ten becomes 10 ones (within 2 Maya turns)", ok: true },
      { what: "asks the child for 12 minus 8 (within 2 Maya turns)", ok: true },
    ]);
    expect(t.metrics).toMatchObject({ overrides: 0, overrideRate: 0, longestMayaRun: 1 });
    expect(t.status).toBe("pass");
    expect(r.runs[0].status).toBe("pass");
    expect(r.tutor?.metrics).toMatchObject({ overrides: 0, longestMayaRun: 1 });
    expect(r.tutor?.dimensions.find((d) => d.id === "T06")).toMatchObject({ median: 3 });
    // The teaching judge's file is saved, and the run record seals it.
    expect(JSON.parse(store.load(teachingFile("K01-r1"))!)).toMatchObject({ kind: "maya-practice-teaching", run: "K01-r1", skipped: null, error: null });
    expect(JSON.parse(store.load(recordFile("K01-r1"))!).files.teaching).toMatch(/^sha256:/);
    expect(r.execution).toEqual({ channel: "voice", freeTalk: true, tutor: true });
  });

  it("fails when Maya offers another problem and never says why 2 is too small", async () => {
    const { report } = await tutorSuite([K01], { maya: badTutor() });
    const r = report();
    expect(r.runs[0].invalid).toEqual([]);
    const t = verdict(r, "K01-r1");
    // The second turn asks for 12 minus 8, so only the two reasons are missing within 2 Maya turns.
    expect(t.checks.map((c) => c.ok)).toEqual([false, false, true]);
    expect(t.problems.join(" ")).toContain("Maya did not say it: says why 2 is too small");
    expect(r.runs[0].status).not.toBe("pass");
    expect(Object.keys(r.tutor!.failedChecks)).toEqual(["K01-r1"]);
    expect(reportMarkdown(r)).toContain("Case checks that failed");
  });
});

describe("the teaching judge decides the run", () => {
  it("fails a run whose turns score under the rule, and the report lists them", async () => {
    const { report } = await tutorSuite([K01], { maya: goodTutor(), teachingJudge: fakeTeachingJudge({ score: 1 }) });
    const r = report();
    expect(r.runs[0].status).toBe("fail");
    expect(verdict(r, "K01-r1").problems.join(" ")).toContain("median 1 is under 2");
    expect(reportMarkdown(r)).toMatch(/T01 1 on turn \d+/);
  });

  it("makes the run unjudgeable when the judge's answer is outside the schema, and fails the suite", async () => {
    const { report } = await tutorSuite([K01], { maya: goodTutor(), teachingJudge: fakeTeachingJudge({ answer: () => ({ turns: [] }) }) });
    const r = report();
    expect(r.runs[0].status).toBe("unjudgeable");
    expect(r.runs[0].unjudgeable).toContain("teaching judge:");
    expect(r.passed).toBe(false);
  });

  it("makes the run unjudgeable when the judge call fails, and the saved file keeps only an error code", async () => {
    const failing: TeachingJudge = { id: "failing", promptVersion: "x", judge: async () => { throw new Error("secret provider text"); } };
    const { report, store } = await tutorSuite([K01], { maya: goodTutor(), teachingJudge: failing });
    expect(report().runs[0].status).toBe("unjudgeable");
    const log = JSON.parse(store.load(teachingFile("K01-r1"))!) as TeachingLog;
    expect(log.error).not.toBeNull();
    expect(JSON.stringify(log)).not.toContain("secret provider text");
  });

  it("makes the run unjudgeable, not passed, when the judge's file is deleted", async () => {
    const { report, store } = await tutorSuite([K01], { maya: goodTutor() });
    (store as unknown as { remove(n: string): void }).remove(teachingFile("K01-r1"));
    const r = report();
    expect(r.runs[0].status).not.toBe("pass");
    expect(r.runs[0].hardFailures.map((f) => f.code)).toContain("artifact_changed");
  });

  it("finds a teaching file changed after the run", async () => {
    const { report, store } = await tutorSuite([K01], { maya: goodTutor() });
    const log = JSON.parse(store.load(teachingFile("K01-r1"))!) as TeachingLog;
    store.save(teachingFile("K01-r1"), JSON.stringify({ ...log, raw: { turns: [] } }, null, 2));
    expect(report().runs[0].hardFailures.map((f) => f.code)).toContain("artifact_changed");
  });

  it("gives the judge the turns and the plan, and never a model name", async () => {
    const { teachingJudge } = await tutorSuite([K01], { maya: goodTutor() });
    const input = (teachingJudge as ReturnType<typeof fakeTeachingJudge>).inputs[0];
    expect(input.score.length).toBeGreaterThan(0);
    expect(JSON.stringify(input)).not.toMatch(/fake-tutor|claude|gpt|anthropic|openai/i);
    expect(input.turns.some((t) => t.speaker === "child" && t.text.includes("2 minus 8"))).toBe(true);
    expect(teachingJudgeInput(practicePackage(K01), 8, JSON.parse(JSON.stringify({ turns: [], board: [] })), "voice", "Zoe").score).toEqual([]);
  });
});

describe("the whole tutor suite with the fake tutor", () => {
  it("runs every case, saves a teaching file for each judged run, and reads back as one tutor report", async () => {
    const { report, plan, store } = await tutorSuite(TUTOR_CASES, { runs: 1 });
    expect(plan.execution).toEqual({ channel: "voice", freeTalk: true, tutor: true });
    expect(plan.runs).toHaveLength(TUTOR_CASES.length);
    const r = report();
    expect(r.problem).toBeNull();
    expect(r.tutor).toBeDefined();
    expect(r.runs.filter((x) => x.teaching).length).toBeGreaterThan(0);
    for (const x of r.runs.filter((x) => x.teaching)) expect(store.load(teachingFile(x.id))).toBeDefined();
    const md = reportMarkdown(r);
    expect(md).toContain("## Tutor judge (T01 to T10) and trace metrics (D-345)");
    expect(md).toContain("Override rate");
    expect(md).toContain("Longest run of Maya turns");
  });

  it("is its own suite: a report read without --tutor does not accept the plan, and the controller's report is unchanged", async () => {
    const { store } = await tutorSuite([K01], { maya: goodTutor() });
    expect(buildReport([K01], store, 1).problem).toContain("another version");
  });
});

describe("the cost estimate with --tutor", () => {
  it("#1048 budgets math review requests in addition to the talk review allowance", async () => {
    const tutor = conversationalFake({ answer: () => reply("The result we just computed is 4.", "guide") });
    const measured = await measureSuite([K01], 1, { tutor: true }, { tutor });
    expect(measured.reviewer.calls).toBeGreaterThan(measured.maya.calls);
    expect(measured.reviewer.inputChars).toBeGreaterThan(measured.reviewer.largestChars);
  });
  it("counts a second judge call for every run, and the tutor prompt for Maya", async () => {
    const models = { maya: "m", simulator: "s", validity: "v", judge: "j" };
    const price = { input: 1e-6, output: 1e-6 };
    const prices = { maya: price, simulator: price, validity: price, judge: price };
    const plain = await estimateCost(TUTOR_CASES, 3, models, prices, {});
    const tutor = await estimateCost(TUTOR_CASES, 3, models, prices, { tutor: true });
    expect(plain.roles.judge?.calls).toBe(Math.ceil(TUTOR_CASES.length * 3 * 1.5));
    expect(tutor.roles.judge?.calls).toBe(Math.ceil(TUTOR_CASES.length * 3 * 2 * 1.5));
    expect(Number.isFinite(tutor.usd)).toBe(true);
    expect(tutor.roles.judge!.usd).toBeGreaterThan(plain.roles.judge!.usd);
  });
});
