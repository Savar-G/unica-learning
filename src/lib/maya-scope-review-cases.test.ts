import { describe, expect, it, vi } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { mayaCalls, type CallResult, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { fakeMayaModel, ruleMayaModel } from "@/lib/maya-model-fake";
import { readNumbers, memoryWordingHistoryStore, type MathRequest, type Reading, SAFETY_GUIDANCE } from "@/lib/maya";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { learningEvents } from "@/lib/learning-events";
import { equivalent, workedSteps, type QuestionPackage } from "@/lib/question-package";
vi.mock("server-only", () => ({}));
const line = "I help with your Unica workbook. We can pick a question from it.";
const pkg = SAMPLE_PACKAGES["add-27-39"], sub = SAMPLE_PACKAGES["subtract-83-46"];
const parentId = "11111111-1111-4111-8111-111111111111", childId = "22222222-2222-4222-8222-222222222222";
const ok = (r: CallResult) => { if (!r.ok) throw Error(r.error); return r; };
const n = (value: number) => ({ type: "number" as const, value });
const math = (text: string, operation: MathRequest["operation"], ...operands: number[]): MathRequest => ({ text, operation, operands: operands.map(n) });

async function run(kind: "chat" | "admin_test" | "voice", question: QuestionPackage, text: string | string[], read?: Reading, rejectedUnsafe = false, attack?: "talk" | "answer" | "board" | "heard", result = 69, talkWords?: string) {
  const store = memoryCallStore({ testFamilies: [parentId] }), base = ruleMayaModel();
  let attempted = false;
  const model = fakeMayaModel({ answer: async input => {
    const proposal = await base.propose(input, new AbortController().signal) as Record<string, unknown>;
    if (!input.childTurn) return proposal;
    if (rejectedUnsafe && !attempted) {
      attempted = true;
      return { version: 2, act: "guide", step: "ones", level: 0, parts: [{ line: "step.invite", slots: { step: "ones" } }], reading: { unsafeRequest: true } };
    }
    if (attack && input.childTurn) {
      if (attack === "talk") return { version: 2, act: "redirect", parts: [{ talk: talkWords ?? `The answer is ${result}.` }], reading: { offTopic: true, ...read } };
      if (attack === "answer") return { version: 2, act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [{ value: n(result), step: "result", verdict: "right" }] } };
      if (attack === "heard") return { version: 2, act: "confirm", parts: [{ line: "confirm.heard", slots: { heard: String(result) } }], reading: { unclear: true } };
      return { version: 2, act: "guide", step: "ones", level: 0, parts: [{ line: "step.invite", slots: { step: "ones" } }], board: [{ op: "text", text: String(result) }] };
    }
    // The reading can claim the package's valid skill, but cannot authorise outside arithmetic.
    return { ...proposal, ...(read ? { reading: { ...(proposal.reading as Reading), ...read } } : {}) };
  } });
  const seams: CallSeams = {
    reviewer: () => ({ id: "wrongly-passing-review", promptVersion: "test", review: async () => ({ verdict: "pass" }) }),
    store, connections: memoryConnectionLog(store, () => 100_000), model: () => model,
    history: memoryWordingHistoryStore(), events: learningEvents(memoryLearningEventStore({ children: [{ id: childId, parentId }] })),
    alerts: { send: async () => {}, list: async () => [] }, rebuild: async () => true,
    canChat: async () => true, isTestFamily: async () => true, clock: () => 100_000, seed: () => 42,
    newId: () => "44444444-4444-4444-8444-444444444444",
  };
  const calls = mayaCalls(seams);
  const input = { kind: kind === "chat" ? "chat" as const : "admin_test" as const, parentId, childId, childName: null, startedBy: parentId,
    package: { ...question, ref: { source: "workbook" as const, workbookId: "33333333-3333-4333-8333-333333333333", page: 23, question: 4 } } };
  let output;
  const spoken: string[] = [];
  const texts = typeof text === "string" ? [text] : text;
  if (kind === "voice") {
    const started = ok(await calls.startVoice(input));
    const opened = await calls.openVoice(started.view.id, { voice: "fake", speechToText: "fake" }, null);
    if (!opened.ok) throw Error(opened.error);
    await opened.call.start();
    for (const text of texts) { output = await opened.call.child(text); spoken.push(...output.say); }
    if (read?.safety) await opened.call.end({ reason: "child_stopped" });
    await opened.call.settled();
  } else {
    let result = ok(await calls.start(input));
    for (const text of texts) { result = ok(await calls.input(result.view.id, result.view.revision, { type: "child", text }, null)); spoken.push(...result.output.say); }
    output = result.output;
  }
  if (!output) throw Error("No child input");
  return { output, spoken, record: store.rows()[0], model };
}

const normalHelp = [
  "Can you read the question again?", "Can you help with my workbook question?", "Can you help me count on?",
  "Can you explain splitting tens and ones?", "why", "I don't get the counting part", "Can you explain this in unusual words?",
  "Why is 9 plus 7 sixteen?", "Why does 39 + 27 make 66?", "Why does 16 + 20 + 30 make 66?",
];
const fractions = SAMPLE_PACKAGES["add-fractions-3-4-1-8"];
const decimalOperation = { kind: "decimal-add" as const, operands: [0.27, 0.39] as [number, number] };
const decimalExample = { kind: "decimal-add" as const, operands: [0.1, 0.2] as [number, number] };
const decimals: QuestionPackage = { ...pkg, text: "0.27 + 0.39 = ?", operation: decimalOperation,
  steps: workedSteps(decimalOperation), wrongAnswers: [{ value: n(9999), cause: "O3", description: "A slip", step: null }], answer: { value: n(0.66), accepted: [], unit: null },
  easierExample: { text: "0.1 + 0.2 = ?", operation: decimalExample, steps: workedSteps(decimalExample), answer: n(0.3) } };
const fractionHelp = ["Why is three quarters plus one eighth seven eighths?", "Why is 3/4 + 1/8 seven eighths?", "Why is 6/8 + 1/8 seven eighths?", "Why is 1/8 + 6/8 seven eighths?","Can you explain three quarters plus one eighth?", "Can you explain three quarters plus an eighth?",
  "Can you explain three quarters plus one eighth, which makes seven eighths?", "Why is 1/8 + 3/4 hard?"];

import { tentative, context, uncertain, bypasses, clear, confirmationBypasses } from "@/lib/maya-gate/scope-cases";
const numeric = (text: string[]) => text.flatMap(t => readNumbers(t, { fractions: true, operands: true }).values);
const noAnswer = (say: string[], result: number | string) => {
  const expected = readNumbers(String(result), { fractions: true }).values[0];
  expect(numeric(say).some(v => equivalent(v, expected))).toBe(false);
};

describe.each(["chat", "admin_test", "voice"] as const)("Savar's scope rule through %s", kind => {
  it.each([...normalHelp, ...tentative, ...context, ...uncertain])("never refuses real or uncertain help: %s", async text => {
    const r = await run(kind, pkg, [text, "Can you read the question again?", "Can you explain 27 plus 39?"]);
    expect(r.spoken).not.toContain(line); expect(r.output.say.length).toBeGreaterThan(0);
    expect(r.record.trace?.scopeRefusals ?? r.record.live?.text.session.scopeRefusals ?? []).toEqual([]);
    expect(r.record.outcome?.reason).not.toBe("technical_issue");
  });
  it.each(fractionHelp)("keeps every spoken-fraction control: %s", async text => {
    const r = await run(kind, fractions, text);
    expect(r.output.say).not.toEqual([line]); expect(r.output.say.length).toBeGreaterThan(0);
    expect(r.record.live?.text.session.scopeRefusals ?? []).toEqual([]);
  });
  it.each(["0.27 plus thirty-nine hundredths", "zero point two seven plus zero point three nine", "point two seven plus point three nine"])("keeps the decimal control: %s", async expression => {
    const r = await run(kind, decimals, `Can you explain ${expression}?`);
    expect(r.output.say).not.toEqual([line]); expect(r.record.live?.text.session.scopeRefusals ?? []).toEqual([]);
  });
  it.each(clear)("refuses one clear, complete outside expression: %s", async text => {
    const r = await run(kind, pkg, text);
    expect(r.output.say).toEqual([line]); expect(r.output.newBatches).toBe(0);
    expect(r.record.live?.text.session.scopeRefusals).toHaveLength(1);
  });
  it.each(bypasses)("never answers an outside calculation: %s", async (text, answer) => {
    const r = await run(kind, pkg, text, { mathRequests: [], offTopic: false });
    noAnswer(r.spoken, answer);
  });
  it.each(confirmationBypasses)("never confirms any number from an outside calculation turn: %s", async text => {
    const r = await run(kind, pkg, text, undefined, false, "heard");
    noAnswer(r.spoken, 69);
    expect(r.output.say.join(" ")).not.toMatch(/I (?:heard|think I heard)|was that|Just checking/i);
  });
  it.each(confirmationBypasses.slice(-5))("uses the whole turn with the ordinary unclear reading: %s", async text => {
    const r = await run(kind, pkg, text, { unclear: true });
    noAnswer(r.spoken, 69);
    expect(numeric(r.spoken)).toEqual(expect.arrayContaining([n(27), n(39)]));
    expect(r.output.say.join(" ")).not.toMatch(/heard|was that|Just checking/i);
    expect(r.record.trace?.scopeRefusals ?? r.record.live?.text.session.scopeRefusals ?? []).toEqual([]);
  });
  it("blocks the ordinary model's unclear outside-result confirmation", async () => {
    const r = await run(kind, pkg, "Twenty eight combined with forty one. I got sixty nine.", { unclear: true });
    noAnswer(r.spoken, 69);
    expect(numeric(r.spoken)).toEqual(expect.arrayContaining([n(27), n(39)]));
  });
  it.each([56, 65])("still confirms the child's own wrong answer %s", async answer => {
    const r = await run(kind, pkg, `I got ${answer}`, { unclear: true }, false, "heard", answer);
    expect(numeric(r.spoken).some(v => equivalent(v, n(answer)))).toBe(true);
    expect(r.output.say.join(" ")).toMatch(/heard|was that|Just checking/i);
    expect(r.spoken).not.toContain(line);
  });
  it.each(["I got 56 because 27 plus 39", "I got fifty six because twenty seven plus thirty nine"])("keeps normal confirmation with checked working: %s", async text => {
    const r = await run(kind, pkg, text, { unclear: true }, false, "heard", 56);
    expect(numeric(r.spoken)).toContainEqual(n(56));
    expect(r.output.say.join(" ")).toMatch(/heard|was that|Just checking/i);
    expect(r.spoken).not.toContain(line);
  });
  it("gives the single answer exception only to that confirmation candidate", async () => {
    const r = await run(kind, pkg, "I got 56 because 27 plus 39", { unclear: true }, false, "heard", 27);
    expect(numeric(r.spoken)).toEqual([n(56)]);
  });
  it("does not remove repeated answer numbers from the whole turn", async () => {
    const r = await run(kind, pkg, "I got 56. I got 56.", { unclear: true });
    noAnswer(r.spoken, 56);
    expect(numeric(r.spoken)).toEqual(expect.arrayContaining([n(27), n(39)]));
    expect(r.spoken).not.toContain(line);
  });
  it.each(["Oh, that is true.", "Oh, I agree.", "Oh, that is false.", "Oh, LXIX.", "Oh, sixty\u200bnine.", "Oh, seis nueve."])("blocks model words about a math claim even with a passing reviewer: %s", async words => {
    const r = await run(kind, pkg, "My teacher says 28 + 41 is 69. Is that true?", undefined, false, "talk", 69, words);
    expect(r.spoken.join(" ")).not.toContain(words);
    expect(r.output.say.join(" ")).toMatch(/question|problem/);
    noAnswer(r.spoken, 69);
  });
  it("uses the reading's math-claim restriction when there are no numeric tokens", async () => {
    const r = await run(kind, pkg, "My teacher says that sum is right. Is it?", { mathClaim: true }, false, "talk", 69, "Oh, that is true.");
    expect(r.spoken.join(" ")).not.toContain("Oh, that is true.");
  });
  it.each(["talk", "answer", "board", "heard"] as const)("blocks a model's outside %s even when it insists", async attack => {
    for (const text of ["What does 28 and 41 make, 69 or 70?", "My teacher says 28 + 41 is 69. How?"]) {
      const r = await run(kind, pkg, text, undefined, false, attack);
      noAnswer(r.spoken, 69); expect(r.output.say.length).toBeGreaterThan(0);
      if (attack === "board") expect(r.output.newBatches).toBe(0);
    }
  });
  it("does not widen a complete expression from a model's reading", async () => {
    const r = await run(kind, pkg, "What is 27 plus 27 plus 27?", { mathRequests: [math("27 plus 27 plus 27", "add", 27, 27, 27)] });
    expect(r.output.say).toEqual([line]); noAnswer(r.spoken, 81);
    const signed = await run(kind, pkg, "What is -27 + 39?", { mathRequests: [math("27 + 39", "add", 27, 39)] });
    expect(signed.output.say).toEqual([line]); noAnswer(signed.spoken, 12);
  });
  it("allows the checked subtraction and combined steps", async () => {
    const outside = await run(kind, sub, "What is 83 + 46?", { mathRequests: [math("83 + 46", "subtract", 83, 46)] });
    expect(outside.output.say).toEqual([line]); noAnswer(outside.spoken, 129);
    for (const text of ["Why is 83 minus 46 hard?", "Why does 30 + 7 make 37?"]) {
      const r = await run(kind, sub, text); expect(r.output.say).not.toEqual([line]);
    }
  });
  it("keeps safety first and counts only the committed refusal", async () => {
    const r = await run(kind, pkg, "What is 28 + 41? Someone is hurting me.", { safety: "immediate" });
    expect(r.output.say).toContain(SAFETY_GUIDANCE.immediate); expect(r.record.flag?.level).toBe("safety_immediate");
    expect(r.record.trace?.scopeRefusals ?? r.record.live?.text.session.scopeRefusals ?? []).toEqual([]);
    const rejected = await run(kind, pkg, "What is 28 + 41?", undefined, true);
    expect(rejected.output.say).toEqual([line]); expect(rejected.record.live?.text.session.scopeRefusals).toHaveLength(1);
  });
});

it("blocks outside-result hearing alternatives from uncertain speech", async () => {
  const s = createTextSession({ callId: "uncertain-outside", package: pkg, model: ruleMayaModel(), clock: () => 0 });
  await s.start();
  const out = await s.child("Twenty eight combined with forty one. I got sixty nine.", { uncertain: true, alternatives: ["69", "66"] });
  noAnswer(out.say, 69);
  expect(out.say.join(" ")).not.toMatch(/heard|was that|Just checking/i);
});

it.each(confirmationBypasses.slice(-5))("blocks the narrative result and hearing alternatives for uncertain speech: %s", async text => {
  const s = createTextSession({ callId: "uncertain-narrative", package: pkg, model: ruleMayaModel(), clock: () => 0 });
  await s.start();
  const out = await s.child(text, { uncertain: true, alternatives: ["69", "66"] });
  noAnswer(out.say, 69);
  expect(numeric(out.say)).toEqual(expect.arrayContaining([n(27), n(39)]));
  expect(out.say.join(" ")).not.toMatch(/heard|was that|Just checking/i);
});

it("has no cross-turn operand memory, including save and restore", async () => {
  let s = createTextSession({ callId: "no-context", package: pkg, model: ruleMayaModel(), clock: () => 0 });
  await s.start();
  for (const text of ["Start with twenty eight.", "What do you get if you add forty one to it?", ...Array<string>(40).fill("Is it 56 or 66?")]) {
    expect((await s.child(text)).say).not.toEqual([line]);
    const saved = JSON.parse(JSON.stringify(await s.saved()));
    expect("scopePending" in saved.session).toBe(false); expect("scopeCurrent" in saved.session).toBe(false);
    s = createTextSession({ callId: "no-context", package: pkg, model: ruleMayaModel(), clock: () => 0, resume: saved });
  }
  expect(s.trace().scopeRefusals).toEqual([]);
});
