import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { openRouterClient } from "@/lib/ai-openrouter";
import { aiMayaModel, PROMPT_VERSION } from "@/lib/maya-model";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import {
  aiChildSimulator, aiJudge, buildReport, cappedClient, estimateCost, fakeJudge, fileHash, judgeFile, JUDGE_PROMPT_VERSION, judgeSchema,
  meteredFetch, memoryPracticeStore, PLAN_FILE, planSuite, PRACTICE_CASES, readJudgement, recordFile, reportMarkdown, runSuite, scriptedSimulator, simFile,
  SIMULATOR_PROMPT_VERSION, Spending, traceFile, type AiJudge, type ChildSimulator, type PracticeCase, type PracticeDeps, type PracticeStore, type RunRecord,
} from "./index";

// The practice suite (#325) through its public interface, with fake models only: no network. A real run is the same
// code with OpenRouter models (`npm run maya:practice`).

const ROOT = join(__dirname, "../../..");
const byId = (id: string) => PRACTICE_CASES.find((c) => c.id === id)!;
const C07 = byId("C07");
const C01 = byId("C01");

function versions(deps: Pick<PracticeDeps, "maya" | "simulator" | "judge">) {
  return {
    maya: { model: deps.maya.id, promptVersion: deps.maya.promptVersion },
    simulator: { model: deps.simulator.id, promptVersion: deps.simulator.promptVersion },
    judge: { model: deps.judge.id, promptVersion: deps.judge.promptVersion },
    meta: { commit: "test" },
  };
}

async function suite(cases: PracticeCase[], options: { simulator?: (c: PracticeCase) => ChildSimulator; judge?: AiJudge; runs?: number } = {}) {
  const store = memoryPracticeStore();
  const judge = options.judge ?? fakeJudge();
  const maya = ruleMayaModel();
  // One child per case, chosen by the persona it is asked to play.
  const children = new Map(cases.map((c) => [c.persona.name, options.simulator?.(c) ?? scriptedSimulator(c.fakeScript)]));
  const simulator: ChildSimulator = { id: "fake-child", promptVersion: SIMULATOR_PROMPT_VERSION, next: (input, signal) => children.get(input.persona.name)!.next(input, signal) };
  const plan = planSuite(cases, versions({ maya, simulator, judge }), { runs: options.runs ?? 3 });
  await runSuite(cases, plan, { maya, simulator, judge, store });
  return { store, judge, report: buildReport(cases, store) };
}

/** Rewrites a saved file and seals the run record again, so the checks behind the record are what the test reaches. */
function rewrite(store: PracticeStore, run: string, file: string, text: string) {
  store.save(file, text);
  const record = JSON.parse(store.load(recordFile(run))!) as RunRecord;
  const hash = (name: string) => (store.load(name) === undefined ? null : fileHash(store.load(name)!));
  record.files = { trace: hash(traceFile(run))!, child: hash(simFile(run))!, judge: hash(judgeFile(run)) };
  store.save(recordFile(run), JSON.stringify(record));
}

/** The child turn texts of a saved child log replaced, in order. */
function withChildTexts(json: string, texts: string[]): string {
  const log = JSON.parse(json) as { turns: { raw: { text: string | null } }[] };
  let i = 0;
  for (const t of log.turns) if (t.raw?.text && i < texts.length) t.raw.text = texts[i++];
  return JSON.stringify(log);
}

const sayEach = (lines: string[]) => scriptedSimulator(lines);
const answer = (fn: (call: number) => unknown) => scriptedSimulator([], { answer: (_, call) => fn(call) });

describe("the practice suite", () => {
  it("runs each case three times, saves every trace, child log and judgement, and passes only when every run passes", async () => {
    const { store, report } = await suite([C07]);
    expect(report.counts).toMatchObject({ planned: 3, saved: 3, passed: 3, failed: 0, invalid: 0, unjudgeable: 0, missing: 0 });
    expect(report.passed).toBe(true);
    for (const n of [1, 2, 3]) {
      for (const f of [traceFile, simFile, judgeFile]) expect(store.load(f(`C07-r${n}`)), f(`C07-r${n}`)).toBeDefined();
    }
  });

  it("records every version: Maya's model and prompt, the simulator's, the judge's, the package hash and the suite hash", async () => {
    const { report, store } = await suite([C07], { runs: 1 });
    expect(report.versions).toMatchObject({
      maya: { model: "fake", promptVersion: PROMPT_VERSION },
      simulator: { model: "fake-child", promptVersion: SIMULATOR_PROMPT_VERSION },
      judge: { model: "fake-judge", promptVersion: JUDGE_PROMPT_VERSION },
      meta: { commit: "test" },
    });
    expect(report.versions!.suite).toMatch(/^sha256:[0-9a-f]{64}$/);
    const run = report.runs[0];
    expect(run.versions.maya).toEqual({ id: "fake", promptVersion: PROMPT_VERSION });
    expect(run.versions.packageHash).toMatch(/^sha256:/);
    expect(run.versions.simulator).toEqual({ model: "fake-child", promptVersion: SIMULATOR_PROMPT_VERSION });
    expect(run.versions.judge).toEqual({ model: "fake-judge", promptVersion: JUDGE_PROMPT_VERSION });
    expect(JSON.parse(store.load(traceFile("C07-r1"))!).model).toEqual({ id: "fake", promptVersion: PROMPT_VERSION });
  });

  it("counts the report from the saved files: a deleted trace is missing and fails the suite", async () => {
    const { store } = await suite([C07]);
    store.remove(traceFile("C07-r2"));
    const report = buildReport([C07], store);
    expect(report.counts).toMatchObject({ planned: 3, saved: 2, passed: 2, missing: 1 });
    expect(report.runs.find((r) => r.id === "C07-r2")!.status).toBe("missing");
    expect(report.passed).toBe(false);
  });

  it("fails a suite whose plan is missing, or whose plan was made for other cases", async () => {
    const { store } = await suite([C07], { runs: 1 });
    expect(buildReport([C07, C01], store)).toMatchObject({ passed: false, problem: expect.stringContaining("another version") });
    store.remove(PLAN_FILE);
    expect(buildReport([C07], store)).toMatchObject({ passed: false, problem: "no readable plan.json" });
  });

  it("applies the scripted gate's hard failures to the saved trace: a tampered outcome fails the run", async () => {
    const { store } = await suite([C07], { runs: 1 });
    const t = JSON.parse(store.load(traceFile("C07-r1"))!);
    t.outcome.safetyFlag = true;
    rewrite(store, "C07-r1", traceFile("C07-r1"), JSON.stringify(t));
    const run = buildReport([C07], store).runs[0];
    expect(run.status).toBe("fail");
    expect(run.hardFailures.map((f) => f.code)).toContain("wrong_outcome");
  });

  it("fails a run whose call ends on an outcome the case does not allow", async () => {
    const { store } = await suite([C07], { runs: 1 });
    const t = JSON.parse(store.load(traceFile("C07-r1"))!);
    t.outcome.reason = "time_limit";
    rewrite(store, "C07-r1", traceFile("C07-r1"), JSON.stringify(t));
    expect(buildReport([C07], store).runs[0].hardFailures.map((f) => f.code)).toContain("outcome_not_allowed");
  });

  it("never shows the simulator Maya's expected actions or the case's answer rules, and never shows the judge a model name", async () => {
    const sims: ReturnType<typeof scriptedSimulator>[] = [];
    const { judge } = await suite([C07], { runs: 1, simulator: (c) => { const s = scriptedSimulator(c.fakeScript); sims.push(s); return s; } });
    const seen = JSON.stringify(sims.flatMap((s) => s.inputs));
    expect(seen).not.toContain(C07.expected);
    expect(seen).not.toContain("stages");
    expect(seen).not.toContain("first try");
    const judged = JSON.stringify((judge as ReturnType<typeof fakeJudge>).inputs);
    expect(judged).toContain(C07.expected);
    expect(judged).not.toContain("fake-child");
    expect(judged).not.toMatch(/"(id|model)":"fake"/);
  });
});

describe("an invalid simulation never counts as a pass", () => {
  const C02 = byId("C02");
  const solved = ["Because the ones made sixteen.", "I wrote it."];
  const invalidCases: [string, PracticeCase, () => ChildSimulator, string][] = [
    // R386-1: the reviewer's case, and variants of the persona lexicon.
    ["calls itself an artificial intelligence", C07, () => sayEach(["I am an artificial intelligence. 7 plus 9 is 16, so I carried a ten. I got 66.", ...solved]), "persona_break"],
    ["says it is an AI", C07, () => sayEach(["I'm an AI, but 7 plus 9 is 16, so I got 66.", ...solved]), "persona_break"],
    ["says it is a chatbot", C07, () => sayEach(["As a chatbot I know 7 plus 9 is 16. I got 66.", ...solved]), "persona_break"],
    ["talks as a language model", C07, () => sayEach(["As an AI language model, I would say 66.", ...solved]), "persona_break"],
    ["writes a stage direction", C07, () => sayEach(["*sighs* 7 plus 9 is 16, so I got 66.", ...solved]), "persona_break"],
    ["writes Maya's part", C07, () => sayEach(["I got 66. Maya: Great job, that is right!", ...solved]), "answered_for_maya"],
    ["labels its own part", C07, () => sayEach(["Child: 7 plus 9 is 16. I got 66.", ...solved]), "answered_for_maya"],
    ["writes two speakers' lines", C07, () => sayEach(["7 plus 9 is 16. I got 66.\nThat is right, well done.", ...solved]), "answered_for_maya"],
    // R386-1: numbers by script stage, whatever the wording.
    ["says a number from another question", C07, () => sayEach(["I think 45 plus 12 is 57.", "7 plus 9 is 16, so I carried a ten. I got 66.", ...solved]), "number_not_allowed"],
    ["knows the answer before any help, against the persona", C01, () => sayEach(["I don't know how to start. Is it 66?", "ok", "ok", "ok", "I got 66.", ...solved]), "knew_too_much"],
    ["says the right answer in words at its first try", C02, () => sayEach(["Um, sixty-six?", ...solved]), "knew_too_much"],
    ["says the right answer at its first try even after its wrong one", C02, () => sayEach(["I got 56. No wait, 66.", ...solved]), "knew_too_much"],
    ["skips what the persona must say", C01, () => sayEach(["Hello!", "ok", "ok"]), "off_script"],
    ["stops early without reason", C07, () => sayEach(["I want to stop."]), "early_stop"],
    ["talks too long for the age", C07, () => sayEach([`${"so ".repeat(45)}I got 66.`, ...solved]), "too_long"],
    ["breaks its output schema", C07, () => answer(() => ({ action: "shout", text: "hi", seconds: null, stop: false })), "simulator_error"],
    ["fails as a model call", C07, () => answer(() => { throw new Error("OpenRouter answered 500: boom"); }), "simulator_error"],
    ["never lets the call end", C07, () => answer(() => ({ action: "wait", text: null, seconds: 1, stop: false })), "turn_cap"],
  ];

  it.each(invalidCases)("a child that %s is invalid, and the judge is not asked", async (_, c, simulator, code) => {
    const judge = fakeJudge({ score: 3 });
    const { report } = await suite([c], { runs: 1, simulator, judge });
    const run = report.runs[0];
    expect(run.status).toBe("invalid");
    expect(run.invalid.map((x) => x.code)).toContain(code);
    expect(judge.inputs).toHaveLength(0);
    expect(report.passed).toBe(false);
    expect(report.counts.passed).toBe(0);
    expect(report.invalidCodes[code]).toBeGreaterThan(0);
  });

  it("a child who works by place value (20 plus 30 is 50) is not using another question", async () => {
    const { report } = await suite([C07], { runs: 1, simulator: () => sayEach(["20 plus 30 is 50, and 7 plus 9 is 16. So I got 66.", "Because the ones made sixteen.", "I wrote it."]) });
    expect(report.runs[0].invalid).toEqual([]);
    expect(report.runs[0].status).toBe("pass");
  });

  it("every case's right answer is behind a stage: never a single digit or an operand, and not open at the start unless the persona solves it", () => {
    for (const c of PRACTICE_CASES) {
      const pkg = FIXTURES[c.fixture];
      const right = pkg.answer!.value;
      expect(right.type, c.id).toBe("number");
      const value = (right as { value: number }).value;
      expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, ...(pkg.operation!.operands as number[])], c.id).not.toContain(value);
      const atStart = c.validity.stages.filter((s) => s.opens === "start").flatMap((s) => s.numbers);
      expect(atStart.includes(value), c.id).toBe(["C07", "C09", "C26", "C28"].includes(c.id));
    }
  });

  it("a broken child log makes the run invalid even with a clean trace", async () => {
    const { store } = await suite([C07], { runs: 1 });
    rewrite(store, "C07-r1", simFile("C07-r1"), "not json");
    expect(buildReport([C07], store).runs[0]).toMatchObject({ status: "invalid", invalid: [{ code: "child_log_missing" }] });
  });
});

describe("the saved files are the run (R386-2)", () => {
  it("re-runs the rules on the raw child turns: the reviewer's edit to the raw text is found even with the record sealed again", async () => {
    const { store } = await suite([C07], { runs: 1 });
    const log = store.load(simFile("C07-r1"))!;
    rewrite(store, "C07-r1", simFile("C07-r1"), withChildTexts(log, ["As an AI, Maya: the answer is 66."]));
    const run = buildReport([C07], store).runs[0];
    expect(run.status).toBe("invalid");
    expect(run.invalid.map((x) => x.code)).toContain("child_log_mismatch");
  });

  it("an edit to the raw text and the trace together still breaks the rules on the raw words", async () => {
    const { store } = await suite([C07], { runs: 1 });
    const bad = "As an AI, Maya: the answer is 66.";
    const t = JSON.parse(store.load(traceFile("C07-r1"))!);
    t.turns.find((x: { kind: string }) => x.kind === "child").text = bad;
    store.save(traceFile("C07-r1"), JSON.stringify(t));
    rewrite(store, "C07-r1", simFile("C07-r1"), withChildTexts(store.load(simFile("C07-r1"))!, [bad]));
    const codes = buildReport([C07], store).runs[0].invalid.map((x) => x.code);
    expect(codes).toContain("persona_break");
    expect(codes).toContain("answered_for_maya");
  });

  it.each([
    ["the trace", traceFile],
    ["the child log", simFile],
    ["the judgement", judgeFile],
  ])("any change to %s after the run fails it (artifact_changed)", async (_, file) => {
    const { store } = await suite([C07], { runs: 1 });
    store.save(file("C07-r1"), `${store.load(file("C07-r1"))} `);
    const run = buildReport([C07], store).runs[0];
    expect(run.status).not.toBe("pass");
    expect(run.hardFailures.map((f) => f.code)).toContain("artifact_changed");
  });

  it("a plan changed after the runs (a run dropped from it) fails every run", async () => {
    const { store } = await suite([C07], { runs: 2 });
    const plan = JSON.parse(store.load(PLAN_FILE)!);
    plan.runs = plan.runs.slice(0, 1);
    store.save(PLAN_FILE, JSON.stringify(plan, null, 2));
    const report = buildReport([C07], store);
    expect(report.runs[0].hardFailures.map((f) => f.code)).toContain("artifact_changed");
    expect(report.passed).toBe(false);
  });

  it("a run with no record fails", async () => {
    const { store } = await suite([C07], { runs: 1 });
    store.remove(recordFile("C07-r1"));
    expect(buildReport([C07], store).runs[0].hardFailures.map((f) => f.code)).toContain("artifact_changed");
  });
});

describe("the judge", () => {
  const good = Object.fromEntries(C07.dimensions.map((id) => [id, { status: "scored", score: 3, turns: [1], reason: "ok" }]));
  const unjudgeable: [string, unknown][] = [
    ["is not an object", "66"],
    ["leaves out a dimension", { ...good, J04: undefined }],
    ["scores outside 0 to 3", { ...good, J02: { status: "scored", score: 5, turns: [1], reason: "x" } }],
    ["marks an applicable dimension not applicable", { ...good, J01: { status: "not_applicable", score: null, turns: [], reason: "x" } }],
    ["sets an applicable dimension to null", { ...good, J02: null }],
    ["adds a field inside a dimension", { ...good, J03: { status: "scored", score: 3, turns: [1], reason: "x", confidence: 1 } }],
    ["cites a turn twice", { ...good, J04: { status: "scored", score: 3, turns: [1, 1], reason: "x" } }],
    // R386-3: a dimension that does not apply is checked too.
    ["scores J07 99 with turn 99999 and no reason on a math call (the reviewer's case)", { ...good, J07: { status: "scored", score: 99, turns: [99999], reason: "" } }],
    ["scores J07 validly on a math call", { ...good, J07: { status: "scored", score: 3, turns: [1], reason: "fine" } }],
    ["marks J07 not applicable as an object on a math call", { ...good, J07: { status: "not_applicable", score: null, turns: [], reason: "" } }],
    ["puts a number in J07 on a math call", { ...good, J07: 0 }],
    ["says it cannot judge", { ...good, J03: { status: "unjudgeable", score: null, turns: [], reason: "not enough turns" } }],
    ["cites a turn that is not in the call", { ...good, J05: { status: "scored", score: 3, turns: [999], reason: "x" } }],
    ["cites no turn", { ...good, J06: { status: "scored", score: 3, turns: [], reason: "x" } }],
    ["gives no reason", { ...good, J01: { status: "scored", score: 3, turns: [1], reason: " " } }],
    ["adds a field", { ...good, overall: 3 }],
  ];

  it.each(unjudgeable)("a judgement that %s is unjudgeable and fails", async (_, raw) => {
    const { report } = await suite([C07], { runs: 1, judge: fakeJudge({ answer: () => raw }) });
    expect(report.runs[0].status).toBe("unjudgeable");
    expect(report.passed).toBe(false);
  });

  it("a judge call that fails makes the run unjudgeable; the saved file keeps only an error code", async () => {
    const { report, store } = await suite([C07], { runs: 1, judge: fakeJudge({ answer: () => { throw new Error("OpenRouter answered 401: key sk-or-v1-abcdef0123456789abcdef"); } }) });
    expect(report.runs[0]).toMatchObject({ status: "unjudgeable", unjudgeable: expect.stringContaining("http_401") });
    expect(store.load(judgeFile("C07-r1"))).not.toContain("sk-or");
  });

  it("a deleted judgement makes the run unjudgeable", async () => {
    const { store } = await suite([C07], { runs: 1 });
    store.remove(judgeFile("C07-r1"));
    rewrite(store, "C07-r1", recordFile("C07-r1"), store.load(recordFile("C07-r1"))!);
    expect(buildReport([C07], store).runs[0].status).toBe("unjudgeable");
  });

  it("fails a run when any applicable dimension scores below 2, and reports each dimension apart", async () => {
    const raw = { ...good, J04: { status: "scored", score: 1, turns: [1], reason: "the child only repeated" } };
    const { report } = await suite([C07], { runs: 1, judge: fakeJudge({ answer: () => raw }) });
    expect(report.runs[0]).toMatchObject({ status: "fail", lowScores: ["J04"] });
    expect(report.dimensions.find((d) => d.id === "J04")).toMatchObject({ below: 1, min: 1 });
    expect(report.dimensions.find((d) => d.id === "J01")).toMatchObject({ below: 0, min: 3 });
    expect(report.passed).toBe(false);
  });

  it.each([
    ["absent", good],
    ["null", { ...good, J07: null }],
  ])("a dimension that does not apply may be %s", async (_, raw) => {
    const { report } = await suite([C07], { runs: 1, judge: fakeJudge({ answer: () => raw }) });
    expect(report.runs[0].status).toBe("pass");
  });

  it("the judge gets a rubric and a schema with only the case's dimensions", async () => {
    const C30 = byId("C30");
    const { judge } = await suite([C07], { runs: 1 });
    const input = (judge as ReturnType<typeof fakeJudge>).inputs[0];
    expect(input.rubric.map((d) => d.id)).toEqual(C07.dimensions);
    expect(input.rubric.map((d) => d.id)).not.toContain("J07");
    expect((judgeSchema(C30.dimensions) as { required: string[] }).required).toEqual(C30.dimensions);
    expect(readJudgement({ J07: { status: "scored", score: 2, turns: [1], reason: "ok" } }, ["J07"], 3)).toMatchObject({ ok: true });
  });

  it("the AI judge and simulator send strict JSON schema requests with their prompt versions", async () => {
    const client = fakeAiClient({ answer: (req) => (req.name === "practice_child" ? { action: "say", text: "hi", seconds: null, stop: false } : good) });
    const sim = aiChildSimulator(client);
    const judge = aiJudge(client);
    await sim.next({ promptVersion: SIMULATOR_PROMPT_VERSION, persona: C07.persona, maxWords: 40, transcript: [] }, new AbortController().signal);
    expect(sim.promptVersion).toBe(SIMULATOR_PROMPT_VERSION);
    expect(judge.promptVersion).toBe(JUDGE_PROMPT_VERSION);
    await judge.judge({ promptVersion: JUDGE_PROMPT_VERSION, rubric: [{ id: "J01" }, { id: "J07" }] } as never, new AbortController().signal);
    expect((client.requests[1].schema as { required: string[] }).required).toEqual(["J01", "J07"]);
    for (const r of client.requests) {
      expect(r.schema).toMatchObject({ type: "object", additionalProperties: false });
      expect((r.schema as { required: string[] }).required).toEqual(Object.keys((r.schema as { properties: object }).properties));
    }
  });
});

describe("cost and the spending cap", () => {
  const price = { input: 2e-6, output: 10e-6 };

  it("estimates a full suite from a dry run with the fakes, per role", async () => {
    const e = await estimateCost(PRACTICE_CASES, 3, { maya: "m", simulator: "s", judge: "j" }, { maya: price, simulator: price, judge: price });
    expect(e.roles.judge.calls).toBeGreaterThanOrEqual(PRACTICE_CASES.length * 3);
    expect(e.roles.maya.calls).toBeGreaterThan(e.roles.judge.calls);
    expect(e.usd).toBeGreaterThan(0);
    expect(e.usd).toBeCloseTo(e.roles.maya.usd + e.roles.simulator.usd + e.roles.judge.usd);
  });

  it("stops at the cap: runs it cuts are missing and the suite fails", async () => {
    const spending = new Spending(0.05);
    const client = cappedClient(fakeAiClient({ model: "real-ish", answer: () => ({ version: 2, act: "close", parts: [] }) }), spending, price);
    // Each request reserves its worst case (4,000 output tokens = $0.04 + input): the second call meets the cap.
    const maya = aiMayaModel(client);
    const store = memoryPracticeStore();
    const sim = scriptedSimulator(C07.fakeScript);
    const judge = fakeJudge();
    const plan = planSuite([C07], versions({ maya, simulator: sim, judge }), { runs: 3, maxUsd: 0.05 });
    await runSuite([C07], plan, { maya, simulator: sim, judge, store, capped: () => spending.reached });
    expect(spending.reached).toBe(true);
    const report = buildReport([C07], store);
    expect(report.counts.missing).toBe(3);
    expect(report.passed).toBe(false);
  });

  it("adds each OpenRouter answer's reported cost, or its tokens at the price", async () => {
    const spending = new Spending(null);
    const answers = [
      { usage: { cost: 0.0123 }, choices: [{ finish_reason: "stop", message: { content: "{}" } }] },
      { usage: { prompt_tokens: 1000, completion_tokens: 100 }, choices: [{ finish_reason: "stop", message: { content: "{}" } }] },
    ];
    let i = 0;
    const fetch = (async () => new Response(JSON.stringify(answers[i++]), { status: 200 })) as typeof globalThis.fetch;
    const client = openRouterClient({ apiKey: "k", model: "m", fetch: meteredFetch(fetch, spending, price) });
    await client.json({ name: "x", system: "s", content: [], schema: {} }, new AbortController().signal);
    expect(spending.spent).toBeCloseTo(0.0123);
    await client.json({ name: "x", system: "s", content: [], schema: {} }, new AbortController().signal);
    expect(spending.spent).toBeCloseTo(0.0123 + 1000 * 2e-6 + 100 * 10e-6);
  });
});

describe("the docs", () => {
  it("AGENTS.md names the command and when it must run", () => {
    const agents = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
    expect(agents).toContain("npm run maya:practice");
    expect(agents).toMatch(/maya:practice[^\n]*before[^\n]*(controller|prompt|model)/i);
  });

  it("docs/maya-practice.md lists every case", () => {
    const doc = readFileSync(join(ROOT, "docs/maya-practice.md"), "utf8");
    for (const c of PRACTICE_CASES) expect(doc, c.id).toContain(`| ${c.id} |`);
  });

  it("the markdown report states the result, the counts and each run", async () => {
    const { report } = await suite([C07], { runs: 1 });
    const md = reportMarkdown(report);
    expect(md).toContain("PASS");
    expect(md).toContain("### C07-r1: pass");
    expect(md).toContain("Counted from the saved files.");
  });
});
