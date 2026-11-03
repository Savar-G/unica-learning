import { describe, expect, it, vi } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { mayaCalls, type CallResult, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { fakeMayaModel, ruleMayaModel } from "@/lib/maya-model-fake";
import { memoryWordingHistoryStore, type MathRequest, type Reading, SAFETY_GUIDANCE } from "@/lib/maya";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { learningEvents } from "@/lib/learning-events";
import { workedSteps, type QuestionPackage } from "@/lib/question-package";
vi.mock("server-only", () => ({}));
const line = "I help with your Unica workbook. We can pick a question from it.";
const pkg = SAMPLE_PACKAGES["add-27-39"], sub = SAMPLE_PACKAGES["subtract-83-46"];
const parentId = "11111111-1111-4111-8111-111111111111", childId = "22222222-2222-4222-8222-222222222222";
const ok = (r: CallResult) => { if (!r.ok) throw Error(r.error); return r; };
const n = (value: number) => ({ type: "number" as const, value });
const math = (text: string, operation: MathRequest["operation"], ...operands: number[]): MathRequest => ({ text, operation, operands: operands.map(n) });

async function run(kind: "chat" | "admin_test" | "voice", question: QuestionPackage, text: string | string[], read?: Reading, rejectedUnsafe = false) {
  const store = memoryCallStore({ testFamilies: [parentId] }), base = ruleMayaModel();
  let attempted = false;
  const model = fakeMayaModel({ answer: async input => {
    const proposal = await base.propose(input, new AbortController().signal) as Record<string, unknown>;
    if (!input.childTurn) return proposal;
    if (rejectedUnsafe && !attempted) {
      attempted = true;
      return { version: 2, act: "guide", step: "ones", level: 0, parts: [{ line: "step.invite", slots: { step: "ones" } }], reading: { unsafeRequest: true } };
    }
    // The reading can claim the package's valid skill, but cannot authorise outside arithmetic.
    return { ...proposal, ...(read ? { reading: { ...(proposal.reading as Reading), ...read } } : {}) };
  } });
  const seams: CallSeams = {
    store, connections: memoryConnectionLog(store, () => 100_000), model: () => model,
    history: memoryWordingHistoryStore(), events: learningEvents(memoryLearningEventStore({ children: [{ id: childId, parentId }] })),
    alerts: { send: async () => {}, list: async () => [] }, rebuild: async () => true,
    canChat: async () => true, isTestFamily: async () => true, clock: () => 100_000, seed: () => 42,
    newId: () => "44444444-4444-4444-8444-444444444444",
  };
  const calls = mayaCalls(seams);
  const input = { kind: kind === "chat" ? "chat" as const : "admin_test" as const, parentId, childId, childName: null, startedBy: parentId,
    package: { ...question, ref: { source: "workbook" as const, workbookId: "33333333-3333-4333-8333-333333333333", page: 1, question: 1 } } };
  let output;
  const texts = typeof text === "string" ? [text] : text;
  if (kind === "voice") {
    const started = ok(await calls.startVoice(input));
    const opened = await calls.openVoice(started.view.id, { voice: "fake", speechToText: "fake" }, null);
    if (!opened.ok) throw Error(opened.error);
    await opened.call.start();
    for (const text of texts) output = await opened.call.child(text);
    if (read?.safety) await opened.call.end({ reason: "child_stopped" });
    await opened.call.settled();
  } else {
    let result = ok(await calls.start(input));
    for (const text of texts) result = ok(await calls.input(result.view.id, result.view.revision, { type: "child", text }, null));
    output = result.output;
  }
  if (!output) throw Error("No child input");
  return { output, record: store.rows()[0], model };
}

const normalHelp = [
  "Can you read the question again?", "Can you help with my workbook question?", "Can you help me count on?",
  "Can you explain splitting tens and ones?", "why", "I don't get the counting part", "Can you explain this in unusual words?",
  "Why is 9 plus 7 sixteen?", "Why does 39 + 27 make 66?", "Why does 16 + 20 + 30 make 66?",
];
const outsideMath = [
  "What does 28 and 41 make for my answer?", "My answer is 66. Can you explain 28 and 41?",
  "66 because 28 and 41 make 69. Can you explain?",
];
const bareRequests = ["Add 28 and 41 for my answer 69.", "My answer is 66. 28 + 41 = 69.", "27 + 66 = 93."];
describe.each(["chat", "admin_test", "voice"] as const)("review cases through %s", kind => {
  it.each(normalHelp)("R491-1/2: permits ordinary help and checked work: %s", async text => {
    const r = await run(kind, pkg, text);
    expect(r.output.say).not.toEqual([line]);
    expect(r.output.say.length).toBeGreaterThan(0);
    expect(r.record.live?.text.session.scopeRefusals ?? []).toEqual([]);
    expect(r.record.outcome?.reason).not.toBe("technical_issue");
  });
  it.each(outsideMath)("R491-3: refuses and counts the separate math request: %s", async text => {
    const r = await run(kind, pkg, text, { scopeSkill: "2.4-add-within-100", mathRequests: [math("28 and 41", "add", 28, 41)] });
    expect(r.output.say).toEqual([line]); expect(r.output.newBatches).toBe(0);
    expect(r.record.live?.text.session.scopeRefusals).toHaveLength(1);
    expect(r.record.live?.text.session.solved).toBeNull();
  });
  it("R491-4: checks the operation together with the operands", async () => {
    const r = await run(kind, sub, "What is 83 + 46?", { mathRequests: [math("83 + 46", "subtract", 83, 46)] });
    expect(r.output.say).toEqual([line]); expect(r.output.newBatches).toBe(0);
    expect(r.record.live?.text.session.scopeRefusals).toHaveLength(1);
    const own = await run(kind, sub, "Why is 83 minus 46 hard?", { mathRequests: [math("83 minus 46", "subtract", 83, 46)] });
    expect(own.output.say).not.toEqual([line]);
    expect(own.record.live?.text.session.scopeRefusals ?? []).toEqual([]);
    const combined = await run(kind, sub, "Why does 30 + 7 make 37?", { mathRequests: [math("30 + 7", "add", 30, 7)] });
    expect(combined.output.say).not.toEqual([line]);
    expect(combined.record.live?.text.session.scopeRefusals ?? []).toEqual([]);
  });
  it("R491-5: preserves scope through a rejected unsafe reading and repair", async () => {
    const r = await run(kind, pkg, "What is 28 + 41?", undefined, true);
    expect(r.output.say).toEqual([line]); expect(r.output.newBatches).toBe(0);
    expect(r.record.live?.text.session.scopeRefusals).toHaveLength(1);
    expect(r.record.live?.text.session.solved).toBeNull();
  });
  it("takes the higher safety response before scope", async () => {
    const r = await run(kind, pkg, "What is 28 + 41? Someone is hurting me.", { safety: "immediate" });
    expect(r.output.say).toContain(SAFETY_GUIDANCE.immediate);
    expect(r.record.flag?.level).toBe("safety_immediate");
    expect(r.output.say).not.toContain(line);
    expect(r.record.trace?.scopeRefusals ?? r.record.live?.text.session.scopeRefusals ?? []).toEqual([]);
  });
});

it("checks every structured request, rather than one verdict for the turn", async () => {
  const text = "Explain 9 + 7, then 28 and 41 for my answer.";
  const r = await run("admin_test", pkg, text, { mathRequests: [math("9 + 7", "add", 9, 7), math("28 and 41", "add", 28, 41)] });
  expect(r.output.say).toEqual([line]); expect(r.record.live?.text.session.scopeRefusals).toHaveLength(1);
  const nearby = await run("admin_test", pkg, "Why does 16.0000000001 + 20 + 30 make 66?");
  expect(nearby.output.say).toEqual([line]);
  expect(nearby.record.live?.text.session.scopeRefusals).toHaveLength(1);
});
it("never rejects unusual words without a mathematical or reading restriction", async () => {
  const s = createTextSession({ callId: "new-words", package: pkg, model: ruleMayaModel(), clock: () => 0 });
  await s.start();
  for (const text of normalHelp.slice(0, 7)) expect((await s.child(text)).say).not.toEqual([line]);
  expect(s.trace().scopeRefusals).toEqual([]);
});
it("keeps a model's outside reading through malformed proposals and fallback", async () => {
  const base = ruleMayaModel();
  const model = fakeMayaModel({ answer: input => input.childTurn
    ? { parts: "bad", reading: { outsideScope: "other_topic" } } : base.propose(input, new AbortController().signal) });
  const s = createTextSession({ callId: "malformed-scope", package: pkg, model, clock: () => 0 });
  await s.start(); expect((await s.child("Teach me science.")).say).toEqual([line]);
  expect(s.trace().scopeRefusals).toHaveLength(1);
});

const fractions = SAMPLE_PACKAGES["add-fractions-3-4-1-8"];
const decimalOperation = { kind: "decimal-add" as const, operands: [0.27, 0.39] as [number, number] };
const decimalExample = { kind: "decimal-add" as const, operands: [0.1, 0.2] as [number, number] };
const decimals: QuestionPackage = { ...pkg, text: "0.27 + 0.39 = ?", operation: decimalOperation,
  steps: workedSteps(decimalOperation), wrongAnswers: [{ value: n(9999), cause: "O3", description: "A slip", step: null }], answer: { value: n(0.66), accepted: [], unit: null },
  easierExample: { text: "0.1 + 0.2 = ?", operation: decimalExample, steps: workedSteps(decimalExample), answer: n(0.3) } };
const outsideForms = ["1,027 + 39", "-27 + 39", "27 + -39", "27 minus -39", "27 / 39", "27 less 39", "one million plus two million"];
const fractionHelp = ["Can you explain three quarters plus one eighth?", "Can you explain three quarters plus an eighth?",
  "Can you explain three quarters plus one eighth, which makes seven eighths?", "Why is 1/8 + 3/4 hard?"];
describe.each(["chat", "admin_test", "voice"] as const)("D-199 scope through %s", kind => {
  it.each(bareRequests)("does not exempt a bare outside calculation as an answer: %s", async text => {
    const r = await run(kind, pkg, text);
    expect(r.output.say).toEqual([line]); expect(r.output.newBatches).toBe(0);
    expect(r.record.live?.text.session.scopeRefusals).toHaveLength(1);
  });
  it.each(fractionHelp)("R491-6: permits the complete stored fractions: %s", async text => {
    const r = await run(kind, fractions, text, text.includes("Can you") ? { mathRequests: [{
      text: text.includes("an eighth") ? "three quarters plus an eighth" : "three quarters plus one eighth",
      operation: "add", operands: [{ type: "fraction", numerator: 3, denominator: 4 }, { type: "fraction", numerator: 1, denominator: 8 }],
    }] } : {});
    expect(r.output.say).not.toEqual([line]);
    expect(r.output.say.length).toBeGreaterThan(0);
    expect(r.record.live?.text.session.scopeRefusals ?? []).toEqual([]);
  });
  it.each(["0.27 plus thirty-nine hundredths", "zero point two seven plus zero point three nine", "point two seven plus point three nine"])("R491-6: permits the stored decimal values: %s", async expression => {
    const r = await run(kind, decimals, `Can you explain ${expression}?`);
    expect(r.output.say).not.toEqual([line]);
    expect(r.output.say.length).toBeGreaterThan(0);
    expect(r.record.live?.text.session.scopeRefusals ?? []).toEqual([]);
  });
  it.each(outsideForms)("R491-7: checks full values and operations with an omitted reading: %s", async expression => {
    const r = await run(kind, pkg, `What is ${expression}?`, { mathRequests: [], scopeSkill: "2.4-add-within-100" });
    expect(r.output.say).toEqual([line]); expect(r.output.newBatches).toBe(0);
    expect(r.record.live?.text.session.scopeRefusals).toHaveLength(1);
  });
  it("R491-7: a reading cannot drop a sign or hide outside numbers in an answer span", async () => {
    for (const reading of [{ mathRequests: [math("27 + 39", "add", 27, 39)] }, { answerSpans: ["27"], answers: [{ value: n(27), step: "result", verdict: "wrong" as const }] }]) {
      const r = await run(kind, pkg, "What is -27 + 39?", reading);
      expect(r.output.say).toEqual([line]); expect(r.output.newBatches).toBe(0);
      expect(r.record.live?.text.session.scopeRefusals).toHaveLength(1);
    }
  });
  it("R491-8: retains an unresolved number across completed turns", async () => {
    const r = await run(kind, pkg, ["Start with twenty eight.", "What do you get if you add forty one to it?"]);
    expect(r.output.say).toEqual([line]); expect(r.output.newBatches).toBe(0);
    expect(r.record.live?.text.session.scopeRefusals).toHaveLength(1);
    const own = await run(kind, pkg, ["Start with twenty seven.", "What do you get if you add thirty nine to it?"]);
    expect(own.output.say).not.toEqual([line]);
    expect(own.record.live?.text.session.scopeRefusals ?? []).toEqual([]);
  });
  it("accounts for a clarified number without losing a different pending operand", async () => {
    const own = await run(kind, pkg, ["66 squared", "66", "Why is 27 plus 39 hard?"]);
    expect(own.output.say).not.toEqual([line]);
    expect(own.record.live?.text.session.scopeRefusals ?? []).toEqual([]);
    const outside = await run(kind, pkg, ["Start with twenty eight.", "66", "What do you get if you add forty one to it?"]);
    expect(outside.output.say).toEqual([line]);
    expect(outside.record.live?.text.session.scopeRefusals).toHaveLength(1);
  });
});

it("R491-8: saves unresolved source turns and restores them before further teaching", async () => {
  let s = createTextSession({ callId: "pending", package: pkg, model: ruleMayaModel(), clock: () => 0 });
  await s.start(); await s.child("Start with twenty eight.");
  expect(s.trace().scopeRefusals).toEqual([]);
  const saved = JSON.parse(JSON.stringify(await s.saved()));
  expect(saved.session.scopePending).toEqual([{ at: 0, text: "Start with twenty eight." }]);
  s = createTextSession({ callId: "pending", package: pkg, model: ruleMayaModel(), clock: () => 0, resume: saved });
  expect((await s.child("What do you get if you add forty one to it?")).say).toEqual([line]);
  expect(s.trace().scopeRefusals).toHaveLength(1);
});

it("R491-8: keeps the stored operands in scope across save and restore", async () => {
  let s = createTextSession({ callId: "stored-pending", package: pkg, model: ruleMayaModel(), clock: () => 0 });
  await s.start(); await s.child("Start with twenty seven.");
  s = createTextSession({ callId: "stored-pending", package: pkg, model: ruleMayaModel(), clock: () => 0,
    resume: JSON.parse(JSON.stringify(await s.saved())) });
  const result = await s.child("What do you get if you add thirty nine to it?");
  expect(result.say).not.toEqual([line]); expect(result.say.length).toBeGreaterThan(0);
  expect(s.trace().scopeRefusals).toEqual([]);
});
