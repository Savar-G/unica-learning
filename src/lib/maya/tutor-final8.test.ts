// Final check 8 (2026-11-15): binding tests for the nine findings on f2951bcf4, each with controls. Every case is the
// reviewers' own probe. The multiplication question is built in memory with the same question text and operation as the
// Book 1 question "3 × 2 = ?"; no customer file is read. Each binding test fails on f2951bcf4 and passes on the fix.
// Part 2 (math): N1 to N4. Part 1 (routing and records): F1 to F5.
import { describe, expect, it } from "vitest";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { createTextSession, streamedPriority } from "@/lib/maya-text";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { conversationalMayaModel } from "@/lib/maya-model";
import { openRouterClient } from "@/lib/ai-openrouter";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { aiMathReviewer, fakeMathReviewer, runMathReview } from "@/lib/maya-math-review";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, SAFETY_GUIDANCE } from "@/lib/maya";
import { mayaCalls } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { callNotes, noteStep } from "@/lib/maya-call-note";
import { memoryNoteStore } from "@/lib/maya-call-note-memory";
import { workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";
import { createSession, mathReviewInput } from "./session";
import { checkTutorSay, childFacts, isTutorQuestion, tutorKind, tutorStreamContext } from "./tutor";
import { fixedOffers } from "./lines";

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const CLAIM_TF = FIXTURES.CLAIM_TF as OperationPackage;
const DISCLOSURE = fixedOffers().find((x) => x.line === "about.ai")!.texts[0];
const num = (value: number) => ({ type: "number" as const, value });

/** The Book 1 question "3 × 2 = ?" (same text and operation), built in memory. */
function times(): OperationPackage {
  const op: Operation = { kind: "multiply", operands: [3, 2] };
  const easier: Operation = { kind: "multiply", operands: [2, 2] };
  return {
    ref: { source: "workbook", workbookId: "test", page: 1, question: 1 }, templateId: null, level: 12, difficulty: 2,
    id: "final8-times", text: "3 × 2 = ?", skill: { standard: "4.8", skills: ["4.8-multiplication-facts"] },
    answer: { value: num(6), accepted: [], unit: null }, operation: op, steps: workedSteps(op),
    wrongAnswers: [{ value: num(5), cause: "wrong-operation", description: "Adds instead of multiplying.", step: null }],
    easierExample: { text: "2 × 2 = ?", operation: easier, answer: num(4), steps: workedSteps(easier) },
  } as OperationPackage;
}

type Fake = Parameters<typeof conversationalFake>[0];
/** One child turn in the text adapter, Maya's message fixed, with the stream on or off. */
async function turn(pkg: OperationPackage, line: string, child: string, stream: boolean, math: Parameters<typeof createTextSession>[0]["mathReviewer"] = fakeMathReviewer(), extra: Partial<Fake> = {}) {
  const parts: string[] = [];
  const model = conversationalFake({ answer: () => reply(line, "guide"), ...(stream ? { stream: { chunk: 7 } } : {}), ...extra });
  const s = createTextSession({ callId: "final8", package: pkg, tutor: true, clock: () => 10_000, model, reviewer: fakeTalkReviewer(), mathReviewer: math, ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
  await s.start();
  expect(s.session.tutor).toBeDefined();
  parts.length = 0;
  const out = await s.child(child);
  return { s, out, parts, model };
}

type ReviewInput = { sentence: string; childFacts: string[]; childAnswer: { value: number | null; verdict: string; right: unknown } | null };
/** The production review adapter with a local client that follows the prompt's rule on the child's verdict. */
function verdictReader(inputs: ReviewInput[] = []) {
  return {
    inputs,
    reviewer: aiMathReviewer({ model: "local-verdict-reader", json: async (r: { content: { text: string }[] }) => {
      const x = JSON.parse(r.content[0].text) as ReviewInput;
      inputs.push(x);
      return x.childAnswer?.verdict === "right" ? { verdict: "true", reason: "all true" } : { verdict: "false", reason: "a judgment needs a right verdict" };
    } } as never),
  };
}

const verdictOf = (pkg: OperationPackage, child: string) => {
  const s = createSession({ callId: "in", package: pkg, conversational: true, tutor: true });
  s.turn = { at: 0, text: child, uncertain: false };
  return mathReviewInput(s, "Let us check that.");
};

describe("N1 (P1): the child's reader reads a clause only when it reads every token, units included", () => {
  it("binding: \"3 times 2 is 6 tens.\" prints no equation and gets no right verdict", () => {
    const p = times();
    expect(isTutorQuestion(p) && tutorKind(p).id).toBe("multiply");
    expect(childFacts(p, "3 times 2 is 6 tens.").join(" ")).not.toContain("3 × 2 = 6");
    expect(verdictOf(p, "3 times 2 is 6 tens.").childAnswer?.verdict).not.toBe("right");
  });
  it("binding: the true \"52 minus 28 is 2 tens and 4 ones.\" is never printed false, and Maya may say it", () => {
    expect(childFacts(SUB, "52 minus 28 is 2 tens and 4 ones.").join(" ")).not.toContain("52 − 28 = 2");
    expect(verdictOf(SUB, "52 minus 28 is 2 tens and 4 ones.").childAnswer?.verdict).not.toBe("wrong");
    expect(checkTutorSay("52 minus 28 is 2 tens and 4 ones.", tutorStreamContext(SUB, "Help me please.", "none", new Set())).ok).toBe(true);
  });
  for (const stream of [false, true]) it(`binding: "Perfect!" is not said after "3 times 2 is 6 tens." (stream=${stream})`, async () => {
    const { inputs, reviewer } = verdictReader();
    const r = await turn(times(), "Perfect!", "3 times 2 is 6 tens.", stream, reviewer);
    expect(r.out.say).not.toContain("Perfect!");
    expect(r.parts).not.toContain("Perfect!");
    expect(inputs.every((x) => x.childAnswer?.verdict !== "right")).toBe(true);
    expect(inputs.every((x) => !x.childFacts.join(" ").includes("3 × 2 = 6"))).toBe(true);
  });
  it("control: a whole clause is still read, true and false", () => {
    expect(childFacts(times(), "3 times 2 is 6.")).toContain("The child said 3 × 2 = 6: that is true.");
    expect(childFacts(times(), "So 3 times 2 is 6.")).toContain("The child said 3 × 2 = 6: that is true.");
    expect(childFacts(SUB, "12 minus 8 is 5.")).toContain("The child said 12 − 8 = 5: that is false.");
    expect(childFacts(SUB, "12 minus 8 is 4, and 4 minus 2 is 2.")).toEqual(expect.arrayContaining(["The child said 12 − 8 = 4: that is true.", "The child said 4 − 2 = 2: that is true."]));
    expect(verdictOf(SUB, "12 minus 8 is 24.").childAnswer?.verdict).toBe("wrong");
  });
});

describe("N2 (P1): an enclosing negation leaves the equation unread in both readers", () => {
  const line = "It is not true that 3 times 2 is 7.";
  it("binding: the child's verdict is not \"wrong\" and no equation is printed", () => {
    expect(childFacts(times(), line).join(" ")).not.toContain("3 × 2 = 7");
    expect(verdictOf(times(), line).childAnswer?.verdict).not.toBe("wrong");
  });
  it("binding: Maya's sentence goes to the math review, never a refusal", () => {
    expect(checkTutorSay(line, tutorStreamContext(times(), "Help me please.", "none", new Set()))).toMatchObject({ ok: true, math: [line] });
  });
  for (const stream of [false, true]) it(`binding: the true sentence is reviewed and said (stream=${stream})`, async () => {
    const math = fakeMathReviewer();
    const r = await turn(times(), line, "Help me please.", stream, math);
    expect(math.requests.length).toBeGreaterThan(0);
    expect(r.out.say).toContain(line);
  });
  it("control: a direct negation is read, and a false whole equation is still refused", () => {
    expect(childFacts(times(), "3 times 2 is not 7.")).toContain("The child said 3 × 2 ≠ 7: that is true.");
    expect(verdictOf(times(), "3 times 2 is 7.").childAnswer?.verdict).toBe("wrong");
    const ctx = tutorStreamContext(times(), "Help me please.", "none", new Set());
    expect(checkTutorSay("3 times 2 is 7.", ctx)).toMatchObject({ ok: false, reason: "false_equation" });
    expect(checkTutorSay("3 times 2 is not 6.", ctx)).toMatchObject({ ok: false, reason: "false_equation" });
  });
});

describe("N3 (P2): a comparison or bracket the reader cannot read in full goes to the review", () => {
  for (const line of ["4 is 6 more than minus 2.", "2 times (minus 3 plus 4) is 2."]) {
    it(`binding: ${JSON.stringify(line)} is not refused`, () => {
      expect(checkTutorSay(line, tutorStreamContext(SUB, "Help me please.", "none", new Set()))).toMatchObject({ ok: true, math: [line] });
    });
    for (const stream of [false, true]) it(`binding: ${JSON.stringify(line)} is reviewed and said (stream=${stream})`, async () => {
      const math = fakeMathReviewer();
      const r = await turn(SUB, line, "Help me please.", stream, math);
      expect(math.requests.length).toBeGreaterThan(0);
      expect(r.out.say).toContain(line);
    });
  }
  it("control: a comparison and a bracket read in full are still judged", () => {
    const ctx = tutorStreamContext(SUB, "Help me please.", "none", new Set());
    expect(checkTutorSay("4 is 2 more than 2.", ctx).ok).toBe(true);
    expect(checkTutorSay("4 is 6 more than 2.", ctx)).toMatchObject({ ok: false, reason: "false_equation" });
    expect(checkTutorSay("4 is greater than 8.", ctx)).toMatchObject({ ok: false, reason: "false_equation" });
    expect(checkTutorSay("2 times (3 plus 4) is 15.", ctx)).toMatchObject({ ok: false, reason: "false_equation" });
  });
});

describe("N4 (P1): a malformed review answer is final \"unsure\"", () => {
  it.each([["binding", "bad_json"], ["control", "throw"]] as const)("%s: %s then \"true\" makes one call only, and the answer is unsure", async (_kind, first) => {
    const math = fakeMathReviewer((_i, n) => (n === 0 ? first : { verdict: "true", reason: "all true" }));
    const retry = fakeMathReviewer();
    const r = await runMathReview({ ...math, retry }, verdictOf(times(), "Help me.") , 4000);
    expect(r.verdict).toBe("unsure");
    expect(math.requests).toHaveLength(1);
    expect(retry.requests).toHaveLength(0);
  });
  it("control: an answer outside the schema is final, with no retry (final check 5)", async () => {
    const calls: unknown[] = [];
    const reviewer = aiMathReviewer({ model: "local", json: async (x: unknown) => { calls.push(x); return { verdict: "maybe", reason: "x" }; } } as never, undefined, { client: { model: "retry", json: async (x: unknown) => { calls.push(x); return { verdict: "true", reason: "all true" }; } } as never });
    expect((await runMathReview(reviewer, verdictOf(times(), "Help me."), 4000)).verdict).toBe("unsure");
    expect(calls).toHaveLength(1);
  });
  for (const stream of [false, true]) it(`binding: bad_json then a later "true" does not release a false sentence (stream=${stream})`, async () => {
    const requests: unknown[] = [];
    const math = aiMathReviewer({ model: "local-bad-json", json: async (r: { content: { text: string }[] }) => { requests.push(JSON.parse(r.content[0].text)); if (requests.length === 1) throw new Error("The model's answer was not valid JSON."); return { verdict: "true", reason: "all true" }; } } as never);
    const line = "3 times 2 is 6 with a negative sign.";
    const r = await turn(times(), line, "Help me please.", stream, math);
    expect(r.out.say).not.toContain(line);
    expect(r.parts).not.toContain(line);
  });
  it("control: a well-formed \"unsure\" still goes once to the retry", async () => {
    const math = fakeMathReviewer(() => ({ verdict: "unsure", reason: "cannot tell" }));
    const retry = fakeMathReviewer();
    const r = await runMathReview({ ...math, retry }, verdictOf(times(), "Help me."), 4000);
    expect(r).toMatchObject({ verdict: "true", retried: true });
    expect(retry.requests).toHaveLength(1);
  });
});

/** A turn through the production OpenRouter client and Maya's model adapter, with a local fetch that streams `raw`. */
async function providerTurn(raw: string, child: string) {
  const frames = [...raw].map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join("") + `data: ${JSON.stringify({ choices: [{ finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`;
  const client = openRouterClient({ apiKey: "local", model: "anthropic/claude-sonnet-5.5", fetch: async () => new Response(frames, { headers: { "content-type": "text/event-stream" } }) } as never);
  const parts: string[] = [];
  const s = createTextSession({ callId: "shape", package: SUB, tutor: true, model: conversationalMayaModel(client), clock: () => 10_000, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(), onSayPart: (x) => parts.push(x), channel: "chat" });
  await s.start();
  parts.length = 0;
  await s.child(child);
  return { s, parts };
}

describe("F1 (P1): every priority value in the raw text applies, inside a fence or after an invalid value", () => {
  it("binding: the raw scan reads a fenced copy and a value after an invalid one", () => {
    expect(streamedPriority('{"gate":NaN,"reading":{"safety":"immediate"}}').priority).toEqual({ safety: "immediate" });
    expect(streamedPriority('```json\n{"gate":"none","reading":{"aboutMaya":"identity","aboutMaya":"none"}}\n```').priority).toEqual({ aboutMaya: "identity" });
    expect(streamedPriority('```json\n{"gate":"none","reading":{"stop":true').priority).toEqual({ stop: true });
  });
  it("control: a key written inside the say text is no member, and \"none\" values add nothing", () => {
    expect(streamedPriority('{"gate":"none","say":"I said \\"safety\\": \\"immediate\\" before.","reading":{"safety":"none","aboutMaya":"none","stop":false}}').priority).toBeNull();
  });
  for (const shape of ["plain", "fence", "fence-cut", "invalid-before"] as const) for (const priority of ["identity", "immediate", "concern", "stop"] as const) {
    it(`binding${shape === "plain" ? " (plain is the control)" : ""}: ${shape} keeps ${priority} in the provider path`, async () => {
      const p = reply("12 minus 8 is 4. What is 4 minus 2?", "guide");
      const field = priority === "identity" ? "aboutMaya" : priority === "stop" ? "stop" : "safety";
      const value = priority === "stop" ? true : priority;
      const read = JSON.stringify(p.reading).replace("{", `{${JSON.stringify(field)}:${JSON.stringify(value)},`);
      let raw = `${JSON.stringify({ ...p, reading: undefined }).slice(0, -1)},"reading":${read}}`;
      if (shape.startsWith("fence")) raw = "```json\n" + raw + "\n```";
      if (shape === "fence-cut") raw = raw.slice(0, -5);
      if (shape === "invalid-before") raw = `{"gate":NaN,"reading":{${JSON.stringify(field)}:${JSON.stringify(value)}}}`;
      const child = priority === "identity" ? "Is a grown-up helping me with 52 minus 28?" : priority === "stop" ? "I need to leave now. Help me with 52 minus 28." : "Someone is hurting me. What is 52 minus 28?";
      const { s, parts } = await providerTurn(raw, child);
      if (priority === "identity") expect(parts.join(" ")).toContain(DISCLOSURE);
      else if (priority === "stop") expect(s.session.outcome).not.toBeNull();
      else {
        expect(s.session.safety.flagged).toBe(true);
        expect(parts.join(" ")).toContain(SAFETY_GUIDANCE[priority]);
      }
    });
  }
});

const P = "11111111-1111-4111-8111-111111111111";
const C = "22222222-2222-4222-8222-222222222222";
const W = "44444444-4444-4444-8444-444444444444";
/** A public family call (chat or voice) with in-memory stores, as the reviewer's helper runs it. */
async function family(pkg: OperationPackage, script: ReturnType<typeof reply>[], childTurns: string[], voice: boolean) {
  let now = Date.UTC(2026, 10, 15);
  let id = 0;
  const clock = () => now;
  const store = memoryCallStore({ testFamilies: [], clock });
  const events = memoryLearningEventStore({ children: [{ id: C, parentId: P }] });
  const notes = memoryNoteStore({ calls: () => store.rows(), testFamilies: [] });
  const writer = callNotes({ store: notes, ai: null, isTestFamily: async () => false, childNames: async () => ({ firstName: "Ava", formerNames: [] }), clock });
  const model = conversationalFake({ id: "fake-v3", answer: (_: unknown, n: number) => script[Math.min(n, script.length - 1)] });
  const calls = mayaCalls({
    mathReviewer: () => fakeMathReviewer(), tutorFamilies: true, store, connections: memoryConnectionLog(store, clock), history: memoryWordingHistoryStore(),
    events: learningEvents(events), rebuild: async () => true, model: () => model, reviewer: () => fakeTalkReviewer(), isTestFamily: async () => false,
    canChat: async () => true, canCallVoice: async () => true, note: async (x: Parameters<typeof writer.write>[0]) => noteStep(await writer.write(x), x.call.id),
    alerts: { send: async () => {}, list: async () => [] }, clock, newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`, seed: () => 3,
  } as never);
  const input = { kind: voice ? ("family" as const) : ("chat" as const), parentId: P, childId: C, childName: "Ava", grade: 5, startedBy: P, package: { ...pkg, ref: { source: "workbook" as const, workbookId: W, page: 1, question: 1 } } };
  const start = voice ? await calls.startVoice(input as never) : await calls.start(input as never);
  if (!start.ok) throw new Error(start.error);
  let current = start;
  if (voice) {
    const open = await calls.openVoice(start.view.id, { speechToText: "fake", voice: "fake" }, "Ava");
    if (!open.ok) throw new Error(open.error);
    await open.call.start();
    for (const text of childTurns) { now += 5000; await open.call.child(text); await open.call.settled(); }
    await open.call.end({ reason: "child_stopped" });
  } else {
    for (const text of childTurns) {
      now += 5000;
      const r = await calls.input(current.view.id, current.view.revision, { type: "child", text }, "Ava");
      if (!r.ok) throw new Error(r.error);
      current = r;
    }
    if ((await store.get(start.view.id))?.status !== "ended") {
      const r = await calls.input(current.view.id, current.view.revision, { type: "end" }, "Ava");
      if (!r.ok) throw new Error(r.error);
    }
  }
  return { record: await store.get(start.view.id), events: await events.range(C, { from: "2026-11-14", to: "2026-11-16" }), notes: notes.rows() };
}
const mayaSaid = (r: Awaited<ReturnType<typeof family>>, say: string) => r.notes[0]?.transcript.some((t) => t.speaker === "maya" && t.text === say);

describe("F2 and F3 (P1): the help level is \"answer_given\" by default when Maya's words hold the answer", () => {
  for (const voice of [false, true]) {
    it.each(["Will you circle the first word: true or false?", "Can you pick the first option: true or false?"])(`binding: %j is answer_given (voice=${voice})`, async (say) => {
      const r = await family(CLAIM_TF, [reply(say, "guide"), reply("Bye for now.", "close")], ["I need help.", "I circle true."], voice);
      expect(mayaSaid(r, say)).toBe(true);
      expect(r.notes[0]?.facts.finished).toBe("answer_given");
    });
    it.each([["Is it true or false?", false], ["True or false?", false], ["The answer is true.", true]] as const)(`control: %j answer_given=%s (voice=${voice})`, async (say, given) => {
      const r = await family(CLAIM_TF, [reply(say, "guide"), reply("Bye for now.", "close")], ["I need help.", "I circle true."], voice);
      expect(mayaSaid(r, say)).toBe(true);
      if (given) expect(r.notes[0]?.facts.finished).toBe("answer_given");
      else expect(r.notes[0]?.facts.finished).not.toBe("answer_given");
    });
    it.each(["The answer is 6.", "The answer is six.", "Write 6 on your paper."])(`binding: %j on 3 × 2 is answer_given (voice=${voice})`, async (say) => {
      const r = await family(times(), [reply(say, "guide"), reply("Bye for now.", "close")], ["I need help.", "My answer is 6."], voice);
      expect(mayaSaid(r, say)).toBe(true);
      expect(r.notes[0]?.facts.finished).toBe("answer_given");
    });
    it.each([["3 times 2 is 6.", "times", "My answer is 6.", true], ["What is 3 times 2?", "times", "My answer is 6.", false], ["What is 12 minus 8?", "sub", "My answer is 24.", false]] as const)(`control: %j on %s answer_given=%s (voice=${voice})`, async (say, which, answer, given) => {
      const r = await family(which === "times" ? times() : SUB, [reply(say, "guide"), reply("Bye for now.", "close")], ["I need help.", answer], voice);
      expect(mayaSaid(r, say)).toBe(true);
      if (given) expect(r.notes[0]?.facts.finished).toBe("answer_given");
      else expect(r.notes[0]?.facts.finished).not.toBe("answer_given");
    });
  }
});

describe("F4 (P1) and F5 (P2): a number bound to a place is credited only against that place's step", () => {
  for (const child of ["I got 24 for the tens.", "My answer for the tens is 24.", "For the tens, I got 24."]) {
    it(`binding: ${JSON.stringify(child)} is wrong for the tens, never the final answer`, () => {
      expect(verdictOf(SUB, child).childAnswer).toMatchObject({ value: 24, verdict: "wrong" });
    });
    for (const stream of [false, true]) it(`binding: ${JSON.stringify(child)} gets no praise and solves nothing (stream=${stream})`, async () => {
      const { reviewer } = verdictReader();
      const r = await turn(SUB, "You got it!", child, stream, reviewer);
      expect(r.out.say).not.toContain("You got it!");
      expect(r.parts).not.toContain("You got it!");
      expect(r.s.session.solved).toBeNull();
    });
  }
  for (const voice of [false, true]) it(`binding: the public family call does not save a solved question (voice=${voice})`, async () => {
    const r = await family(SUB, [reply("What is 4 minus 2?", "guide"), reply("Yes, that's right. What did you write?", "guide")], ["12 minus 8 is 4.", "I got 24 for the tens."], voice);
    expect(r.notes[0]?.transcript.filter((t) => t.speaker === "maya").map((t) => t.text).join(" ")).not.toContain("Yes, that's right.");
    expect(r.record?.outcome?.reason).not.toBe("solved");
    expect(r.events[0]?.result).not.toBe("right_with_help");
    expect(r.notes[0]?.facts.reason).not.toBe("solved");
  });
  it("binding (F5): \"I got 4 in the ones.\" is right for the ones step in the review", () => {
    expect(verdictOf(SUB, "I got 4 in the ones.").childAnswer).toMatchObject({ value: 4, verdict: "right" });
  });
  for (const child of ["I got 4 in the ones.", "4"]) for (const stream of [false, true]) {
    it(`binding${child === "4" ? " (control)" : ""} (F5): ${JSON.stringify(child)} keeps its valid approval (stream=${stream})`, async () => {
      const { reviewer } = verdictReader();
      const r = await turn(SUB, "You got it!", child, stream, reviewer);
      expect(r.out.say.join(" ")).toContain("You got it!");
      expect(r.s.session.done).toContain("ones");
    });
  }
  it("control: a bare right final answer still solves the question", async () => {
    const r = await turn(SUB, "You got it!", "24", false, verdictReader().reviewer);
    expect(r.s.session.solved).toBe("child");
    expect(verdictOf(SUB, "24").childAnswer).toMatchObject({ value: 24, verdict: "right" });
  });
});
