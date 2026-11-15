// Final check 7 (2026-11-15): binding tests for the eight findings on debf17c8e, each with controls. Every case is the
// reviewer's own probe (the multiplication question is built in memory with the same question text and operation as the
// Book 1 question "3 × 2 = ?"; no customer file is read). Each binding test fails on debf17c8e and passes on the fix.
import { describe, expect, it } from "vitest";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { createTextSession, streamedPriority } from "@/lib/maya-text";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { aiMathReviewer, fakeMathReviewer } from "@/lib/maya-math-review";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, SAFETY_GUIDANCE } from "@/lib/maya";
import { mayaCalls } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { callNotes, noteStep } from "@/lib/maya-call-note";
import { memoryNoteStore } from "@/lib/maya-call-note-memory";
import { operationResult, workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";
import { createSession, mathReviewInput, codeStance } from "./session";
import { checkTutorSay, childFacts, childSaysFalse, codeAlone, exactTexts, isTutorQuestion, tutorKind, tutorStreamContext, tutorTexts } from "./tutor";
import { equationsOf } from "./say-check";
import { falseClaims, readClaims } from "./tutor-math";
import { fixedOffers } from "./lines";

const ADD = SAMPLE_PACKAGES["add-27-39"] as OperationPackage;
const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const CLAIM_TF = FIXTURES.CLAIM_TF as OperationPackage;
const DISCLOSURE = fixedOffers().find((x) => x.line === "about.ai")!.texts[0];

type Fake = Parameters<typeof conversationalFake>[0];
async function turn(pkg: OperationPackage, line: string, child: string, stream: boolean, math = fakeMathReviewer(), extra: Partial<Fake> = {}) {
  const parts: string[] = [];
  const model = conversationalFake({ answer: () => reply(line, "guide"), ...(stream ? { stream: { chunk: 7 } } : {}), ...extra });
  const s = createTextSession({ callId: "final7", package: pkg, tutor: true, clock: () => 10_000, model, reviewer: fakeTalkReviewer(), mathReviewer: math, ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
  await s.start();
  parts.length = 0;
  const out = await s.child(child);
  return { s, out, parts, math };
}

describe("finding 1 (P1): a column sum in a place is not context-free", () => {
  const child = "For the easier example, what do we write in the tens?";
  const lines = ["1 plus 2 plus 3 is 6 tens.", "3 plus 1 plus 2 is 6 tens.", "6 tens is 3 plus 1 plus 2."];
  it.each(lines)("binding: %j while the easier example 18 + 5 is active goes to the math review", (line) => {
    const ctx = { ...tutorStreamContext(ADD, child, "none", new Set()), exact: tutorTexts(ADD, [child]).exact };
    expect(ctx.exact).toBeUndefined();
    const v = checkTutorSay(line, ctx);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.math).toEqual([line]);
  });
  for (const stream of [false, true]) it(`binding: a false math review stops it in the adapter (stream=${stream})`, async () => {
    const math = fakeMathReviewer(() => ({ verdict: "false", reason: "the sum does not have that value in the example" }));
    const r = await turn(ADD, lines[0], child, stream, math);
    expect(math.requests.length).toBeGreaterThan(0);
    expect(r.out.say).not.toContain(lines[0]);
    expect(r.parts).not.toContain(lines[0]);
  });
  it("control: a literal place-value equation still passes on code alone", () => {
    expect(codeAlone("66 is 6 tens and 6 ones.", { op: "add", answer: 66 })).toBe(true);
    expect(codeAlone("12 minus 8 is 4.", {})).toBe(true);
  });
  it("control: the question's own column step text passes on code alone as an exact text of the active problem", () => {
    const exact = exactTexts(ADD);
    const column = [...exact].find((k) => /^1 \+ 2 \+ 3 = 6; write 6 in the tens$/.test(k));
    expect(column).toBeDefined();
    expect(codeAlone(column!, { exact })).toBe(true);
    // The same sum in other words is no exact text: it goes to the review even on the main problem.
    expect(codeAlone("1 plus 2 plus 3 is 6 tens.", { exact, op: "add", columns: [{ terms: [1, 2, 3], place: 10 }] })).toBe(false);
  });
  it("control: a false column sum is still refused or held", () => {
    const ctx = tutorStreamContext(ADD, "Help me.", "none", new Set());
    const v = checkTutorSay("1 plus 2 plus 3 is 7 tens.", ctx);
    expect(v.ok).toBe(false);
  });
});

const num = (value: number) => ({ type: "number" as const, value });
/** The Book 1 question "3 × 2 = ?" (same text and operation), built in memory. */
function times(): OperationPackage {
  const op: Operation = { kind: "multiply", operands: [3, 2] };
  const easier: Operation = { kind: "multiply", operands: [2, 2] };
  return {
    ref: { source: "workbook", workbookId: "test", page: 1, question: 1 }, templateId: null, level: 12, difficulty: 2,
    id: "final7-times", text: "3 × 2 = ?", skill: { standard: "4.8", skills: ["4.8-multiplication-facts"] },
    answer: { value: num(6), accepted: [], unit: null }, operation: op, steps: workedSteps(op),
    wrongAnswers: [{ value: num(5), cause: "wrong-operation", description: "Adds instead of multiplying.", step: null }],
    easierExample: { text: "2 × 2 = ?", operation: easier, answer: num(4), steps: workedSteps(easier) },
  } as OperationPackage;
}

describe("finding 2 (P1): each operator in the child's facts comes from its own place", () => {
  for (const stream of [false, true]) it(`binding: "3 times 2 is 6." on 3 × 2 gives the review a true multiplication (stream=${stream})`, async () => {
    const p = times();
    expect(isTutorQuestion(p)).toBe(true);
    expect(tutorKind(p).id).toBe("multiply");
    const math = fakeMathReviewer();
    await turn(p, "Let us check that.", "3 times 2 is 6.", stream, math);
    expect(math.requests.length).toBeGreaterThan(0);
    expect(math.requests[0].childFacts).toContain("The child said 3 × 2 = 6: that is true.");
    expect(math.requests[0].childFacts.join(" ")).not.toContain("3 − 2");
  });
  it.each([
    ["3 plus 2 is 5.", "3 + 2 = 5", "true"],
    ["8 minus 2 is 6.", "8 − 2 = 6", "true"],
    ["3 times 2 is 6.", "3 × 2 = 6", "true"],
    ["12 divided by 3 is 4.", "12 ÷ 3 = 4", "true"],
    ["12 divided by 3 is 5.", "12 ÷ 3 = 5", "false"],
    ["8 minus 2 plus 4 is 10.", "8 − 2 + 4 = 10", "true"],
    ["2 plus 3 times 4 is 14.", "2 + 3 × 4 = 14", "true"],
    ["12 divided by 4 minus 1 is 2.", "12 ÷ 4 − 1 = 2", "true"],
    ["6 times 2 divided by 3 is 5.", "6 × 2 ÷ 3 = 5", "false"],
  ])("binding and control: %j prints %s", (said, printed, truth) => {
    expect(childFacts(SUB, said)).toContain(`The child said ${printed}: that is ${truth}.`);
  });
});

describe("finding 3 (P1): a leading sign leaves the whole expression unread", () => {
  const line = "Minus 6 plus 10 is 4.";
  it("binding: the equation reader reads no equation and the child's verdict is unknown", () => {
    expect(equationsOf(line)).toEqual([]);
    expect(childSaysFalse(line)).toBe(false);
    const state = createSession({ callId: "signed", package: SUB, tutor: true, conversational: true });
    state.turn = { at: 0, text: line, uncertain: false };
    const x = mathReviewInput(state, "Let us check that.");
    expect(x.childAnswer?.verdict).not.toBe("wrong");
    expect(x.childFacts.join(" ")).not.toContain("6 + 10 = 4");
  });
  it("binding: the claim reader neither refuses nor reads it", () => {
    expect(falseClaims(line, "subtract")).toEqual([]);
    expect(readClaims(line, "subtract").unread.length).toBeGreaterThan(0);
    expect(checkTutorSay(line, tutorStreamContext(SUB, "Help me please.", "none", new Set()))).toMatchObject({ ok: true, math: [line] });
  });
  for (const stream of [false, true]) it(`binding: Maya's true sentence goes to the review and is said (stream=${stream})`, async () => {
    const r = await turn(SUB, line, "Help me with 52 minus 28.", stream);
    expect(r.math.requests.length).toBeGreaterThan(0);
    expect(r.out.say).toContain(line);
  });
  // "Negative 6 ..." and "-6 ..." fail on debf17c8e; the trailing and right-side signs are controls.
  it.each(["Negative 6 plus 10 is 4.", "-6 + 10 = 4.", "12 minus 8 is 4 minus.", "4 is minus 6 plus 10."])("binding and control: %j is unread, never refused", (x) => {
    expect(equationsOf(x).filter((e) => e.operands.length > 1 && e.ops.length > 0 && e.result.q?.[0] === 4 && e.operands[0].q?.[0] !== 12)).toEqual([]);
    expect(checkTutorSay(x, tutorStreamContext(SUB, "Help me please.", "none", new Set())).ok).toBe(true);
  });
  it("control: the unsigned equations are still read", () => {
    expect(childSaysFalse("6 plus 10 is 4.")).toBe(true);
    expect(childSaysFalse("6 plus 10 is 16.")).toBe(false);
    expect(checkTutorSay("6 plus 10 is 4.", tutorStreamContext(SUB, "Help me.", "none", new Set()))).toMatchObject({ ok: false, reason: "false_equation" });
    expect(codeAlone("12 minus 8 is 4.", {})).toBe(true);
  });
});

/** A pattern that starts at 20, adds an unknown amount, and reaches 36 at its third term (the reviewer's package). */
function pattern(): OperationPackage {
  const op = { kind: "evaluate", operands: ["(36 − 20) ÷ 2"] } as unknown as Operation;
  const e = { kind: "evaluate", operands: ["(10 − 2) ÷ 2"] } as unknown as Operation;
  return {
    ...SUB, id: "pattern-final7", text: "A pattern starts at 20 and adds ? each time. The 3rd term is 36.", operation: op,
    answer: { ...SUB.answer, value: operationResult(op) }, steps: workedSteps(op),
    wrongAnswers: [{ value: num(99999), cause: "careless", description: "A made-up mistake.", step: null }],
    easierExample: { text: "What is (10 − 2) ÷ 2?", operation: e, answer: operationResult(e), steps: workedSteps(e) },
  } as OperationPackage;
}

describe("finding 4 (P2): a pattern clause the kind cannot read in full goes to the review", () => {
  const ctx = () => tutorStreamContext(pattern(), "Help me please.", "none", new Set());
  it.each(["What is the second term?", "The third term is not 35.", "Is the second term 28?"])("binding: %j is not refused", (line) => {
    expect(tutorKind(pattern()).id).toBe("evaluate");
    expect(checkTutorSay(line, ctx())).toMatchObject({ ok: true, math: [line] });
  });
  for (const stream of [false, true]) it(`binding: "What is the second term?" reaches the review and is said (stream=${stream})`, async () => {
    const r = await turn(pattern(), "What is the second term?", "Help me please.", stream);
    expect(r.math.requests.length).toBeGreaterThan(0);
    expect(r.out.say).toEqual(["What is the second term?"]);
  });
  it("control: a proved false pattern claim is still refused, and a true one reaches the review", async () => {
    expect(checkTutorSay("The third term is 35.", ctx())).toMatchObject({ ok: false, reason: "false_equation" });
    expect(checkTutorSay("It adds 7 each time.", ctx())).toMatchObject({ ok: false, reason: "false_equation" });
    const r = await turn(pattern(), "The second term is 28.", "Help me please.", false);
    expect(r.out.say).toEqual(["The second term is 28."]);
    expect(r.math.requests.length).toBeGreaterThan(0);
  });
});

const settle = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
/** A turn whose model writes `raw` as its whole output text, streamed in chunks of 7 characters. */
async function rawTurn(raw: string, child: string) {
  const parts: string[] = [];
  const model = {
    id: "raw", promptVersion: "test", output: 3,
    propose: async (_i: unknown, _s: unknown, onText?: (t: string) => void) => {
      for (let i = 7; i < raw.length + 7; i += 7) onText?.(raw.slice(0, i));
      await settle();
      return JSON.parse(raw);
    },
  };
  const s = createTextSession({ callId: "raw", package: SUB, tutor: true, model: model as never, clock: () => 10_000, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(), onSayPart: (x) => parts.push(x) });
  await s.start();
  parts.length = 0;
  const out = await s.child(child);
  return { s, out, parts };
}

describe("finding 5 (P1): a repeated key at any depth makes the output malformed, and every priority value applies", () => {
  it("binding: streamedPriority sees a repeated field inside the reading and keeps the strongest value", () => {
    const raw = '{"gate":"none","kind":"math","say":"Hi.","reading":{"safety":"immediate","safety":"none"}}';
    expect(streamedPriority(raw)).toEqual({ repeated: true, priority: { safety: "immediate" } });
    expect(streamedPriority('{"reading":{"safety":"concern","x":{"y":1,"y":2}}}').repeated).toBe(true);
    expect(streamedPriority('{"reading":{"aboutMaya":"identity","aboutMaya":"none","stop":true,"stop":false}}').priority).toEqual({ aboutMaya: "identity", stop: true });
  });
  it("control: no repeated key, one value", () => {
    expect(streamedPriority('{"gate":"none","kind":"math","say":"Hi.","reading":{"safety":"none"}}')).toEqual({ repeated: false, priority: null });
    expect(streamedPriority('{"gate":"none","say":"Hi.","reading":{"safety":"immediate"}}')).toEqual({ repeated: false, priority: { safety: "immediate" } });
    expect(streamedPriority('{"draw":[{"offer":"note"},{"offer":"note"}]}').repeated).toBe(false);
  });
  for (const flag of ["identity", "immediate", "concern", "stop"] as const) for (const cut of [false, true]) {
    it(`binding: a nested ${flag} then its neutral copy still routes (cut=${cut})`, async () => {
      const p = reply("12 minus 8 is 4. What is 4 minus 2?", "guide");
      const field = flag === "identity" ? "aboutMaya" : flag === "stop" ? "stop" : "safety";
      const value = flag === "stop" ? true : flag;
      const r = JSON.stringify(p.reading).replace("{", `{${JSON.stringify(field)}:${JSON.stringify(value)},`);
      const raw = `${JSON.stringify({ ...p, reading: undefined }).slice(0, -1)},"reading":${r}${cut ? "" : "}"}`;
      const child = flag === "identity" ? "Is a grown-up helping me with 52 minus 28?" : flag === "stop" ? "I need to leave now. Help me with 52 minus 28." : "Someone is hurting me. What is 52 minus 28?";
      const x = await rawTurn(raw, child);
      // A gate "none" may stream math before a later reading (accepted in the reviewer's brief); the disclosure must
      // still come in this turn, never be lost to the neutral copy.
      if (flag === "identity") expect(x.parts.join(" ")).toContain(DISCLOSURE);
      else if (flag === "stop") expect(x.s.session.outcome).not.toBeNull();
      else {
        expect(x.s.session.safety.flagged).toBe(true);
        expect(x.parts.join(" ")).toContain(SAFETY_GUIDANCE[flag]);
      }
    });
  }
});

describe("finding 6 (P1): the disclosure comes before a scope redirect", () => {
  it.each(["Is a grown-up helping me with 8 plus 2?", "Are you made of code? Can you do 8 plus 2?", "Is a real person helping me with 8 plus 2?", "Is a grown-up helping me with my sister's homework?", "Are you a real person? What is 8 plus 2?"])("binding and control: %j", async (child) => {
    const parts: string[] = [];
    const model = conversationalFake({ answer: () => reply("12 minus 8 is 4. What is 4 minus 2?", "guide", { reading: { aboutMaya: "identity", outsideScope: "outside_work" } }), stream: { chunk: 7 } });
    const s = createTextSession({ callId: "scope", package: SUB, tutor: true, model, clock: () => 10_000, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(), onSayPart: (x) => parts.push(x) });
    await s.start();
    parts.length = 0;
    await s.child(child);
    expect(parts.join(" ").startsWith(DISCLOSURE)).toBe(true);
    // No math of the outside request is taught after the disclosure.
    expect(parts.join(" ")).not.toMatch(/\b10\b/);
  });
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
  return { notes: notes.rows() };
}

describe("finding 7 (P1): a statement that names a choice word gives the answer", () => {
  for (const voice of [false, true]) {
    it.each(["Circle the first word: true or false.", "Pick the first option: true or false.", "The answer is true, not false."])(`binding (the last is a control): %j is answer_given (voice=${voice})`, async (say) => {
      const r = await family(CLAIM_TF, [reply(say, "guide"), reply("Bye for now.", "close")], ["I need help.", "I circle true."], voice);
      expect(r.notes[0]?.transcript.some((t) => t.speaker === "maya" && t.text === say)).toBe(true);
      expect(r.notes[0]?.facts.finished).toBe("answer_given");
    });
    it(`control: the open question "Is it true or false?" gives nothing (voice=${voice})`, async () => {
      const say = "Is it true or false?";
      const r = await family(CLAIM_TF, [reply(say, "guide"), reply("Bye for now.", "close")], ["I need help.", "I circle true."], voice);
      expect(r.notes[0]?.transcript.some((t) => t.speaker === "maya" && t.text === say)).toBe(true);
      expect(r.notes[0]?.facts.finished).not.toBe("answer_given");
    });
  }
});

describe("finding 8 (P2): the review's verdict uses code's step credit", () => {
  it.each(["It's 4.", "I got 4."])("binding: %j on the ones step is right", (child) => {
    const s = createSession({ callId: "in", package: SUB, conversational: true, tutor: true });
    s.turn = { at: 0, text: child, uncertain: false };
    expect(codeStance(s)).toBe("right");
    expect(mathReviewInput(s, "You got it!").childAnswer?.verdict).toBe("right");
  });
  it.each([["My answer is 4.", "wrong"], ["My final answer is 4.", "wrong"], ["It's 36.", "wrong"], ["My answer is 36. My friend said 24.", "wrong"], ["4", "right"]])("control: %j is %s", (child, verdict) => {
    const s = createSession({ callId: "in", package: SUB, conversational: true, tutor: true });
    s.turn = { at: 0, text: child, uncertain: false };
    expect(mathReviewInput(s, "You got it!").childAnswer?.verdict).toBe(verdict);
  });
  for (const child of ["It's 4.", "4"]) for (const stream of [false, true]) {
    it(`binding: ${JSON.stringify(child)} keeps its valid approval (stream=${stream})`, async () => {
      const inputs: { sentence: string; childAnswer: { verdict: string } | null }[] = [];
      const wrong = (i: { sentence: string; childAnswer: { verdict: string } | null }) => i.childAnswer?.verdict === "wrong" && i.sentence === "You got it!";
      const math = aiMathReviewer({ model: "local-contract", json: async (request: { content: { text: string }[] }) => { const input = JSON.parse(request.content[0].text); inputs.push(input); return wrong(input) ? { verdict: "false", reason: "it affirms a wrong answer" } : { verdict: "true", reason: "all true" }; } } as never);
      const parts: string[] = [];
      const s = createTextSession({ callId: "step", package: SUB, tutor: true, clock: () => 10_000, reviewer: fakeTalkReviewer(), mathReviewer: math, model: conversationalFake({ answer: () => reply("You got it! What is 12 minus 8?", "guide"), ...(stream ? { stream: { chunk: 7 } } : {}) }), onSayPart: (x) => parts.push(x) });
      await s.start();
      const out = await s.child(child);
      expect(s.session.done).toContain("ones");
      expect(out.say.join(" ")).toContain("You got it!");
    });
  }
});
