// Consolidated tutor-core behavioral regressions.

import { describe, expect, it } from "vitest";
import { openRouterClient } from "@/lib/ai-openrouter";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, SAFETY_GUIDANCE } from "@/lib/maya";
import { mayaCalls } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { callNotes, noteStep } from "@/lib/maya-call-note";
import { memoryNoteStore } from "@/lib/maya-call-note-memory";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { aiMathReviewer, fakeMathReviewer, type MathReviewer, runMathReview } from "@/lib/maya-math-review";
import { conversationalMayaModel } from "@/lib/maya-model";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { teachingPackage } from "@/lib/maya-teaching";
import { storedPlaceValue } from "@/lib/maya-teaching/place-value-samples";
import { createTextSession, streamedPriority } from "@/lib/maya-text";
import { fixedOffers } from "@/lib/maya/lines";
import { equationsOf, sayNumbers } from "@/lib/maya/say-check";
import { codeStance, createSession, mathReviewInput } from "@/lib/maya/session";
import { checkTutorSay, childFacts, childSaysFalse, codeAlone, exactTexts, isTutorQuestion, judgment, tutorKind, tutorStreamContext, tutorStreamSentence, tutorTexts, unreadMath } from "@/lib/maya/tutor";
import { answerClaims, answerProblems, falseClaims, readClaims } from "@/lib/maya/tutor-math";
import { type Operation, type OperationPackage, operationResult, workedSteps } from "@/lib/question-package";

describe("tutor core regressions (set 1)", () => {
  const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;

  const HELP = 'Help me with 52 minus 28.';

  const ctx = () => tutorStreamContext(SUB, HELP, 'none', new Set());

  /** One tutor turn in the text adapter, whole or streamed. */
  async function turn(line: string, child: string, stream: boolean, math: ReturnType<typeof fakeMathReviewer>) {
    const parts: string[] = [];
    const model = conversationalFake({ answer: () => reply(line, 'guide'), ...(stream ? { stream: { chunk: 7 } } : {}) });
    const s = createTextSession({ callId: 'final6', package: SUB, tutor: true, clock: () => Date.now(), reviewer: fakeTalkReviewer(), mathReviewer: math, model, ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
    await s.start();
    parts.length = 0;
    const out = await s.child(child);
    return { say: out.say, parts, model };
  }

  describe('N1: a non-whole intermediate value is never read by code', () => {
    const line = '1 one divided by 10000000000 is 0 ones.';
    it('the false sentence is not code-only: it goes to the math review', () => {
      expect(BigInt(1)).not.toBe(BigInt(0) * BigInt(10000000000));
      expect(checkTutorSay(line, ctx())).toMatchObject({ ok: true, math: [line] });
      expect(readClaims(line).problems).toEqual([]);
      expect(readClaims(line).unread.length).toBeGreaterThan(0);
    });
    it('the true sentence is not refused by code either', () => {
      expect(checkTutorSay('1 one divided by 10000000000 is not 0 ones.', ctx())).toMatchObject({ ok: true });
    });
    for (const stream of [false, true]) {
      it(`a "false" review keeps it from the child, stream=${stream}`, async () => {
        const math = fakeMathReviewer(() => ({ verdict: 'false', reason: 'one divided by a positive whole number is not zero' }));
        const r = await turn(line, HELP, stream, math);
        expect(r.say).not.toContain(line);
        expect(r.parts).not.toContain(line);
        expect(math.requests.map((x) => x.sentence)).toContain(line);
      });
    }
    it('control: a whole quotient is still read ("12 divided by 4 is 3" true, "is 4" refused)', () => {
      expect(readClaims('12 divided by 4 is 3')).toEqual({ problems: [], unread: [] });
      expect(readClaims('12 divided by 4 is 4.').problems.length).toBe(1);
      expect(readClaims('100000000 times 100000000 plus 24 is 5.').problems).toEqual([]);
    });
  });

  describe('N2: a review earlier in the message holds every later sentence', () => {
    const line = 'Let us try the easier example. Write 4 in the ones.';
    it('the whole-message check sends both sentences to the math review', () => {
      expect((42 - 7) % 10).toBe(5);
      expect(checkTutorSay(line, ctx())).toMatchObject({ ok: true, math: ['Let us try the easier example.', 'Write 4 in the ones.'] });
    });
    it('the stream holds the second sentence for the math review', () => {
      const v = tutorStreamSentence('Write 4 in the ones.', ['Let us try the easier example.'], ctx());
      expect(v).toMatchObject({ math: true });
    });
    for (const stream of [false, true]) {
      it(`the reviewer reads the second sentence, stream=${stream}`, async () => {
        const first = 'Let us try the easier example.';
        const math = fakeMathReviewer((input) => (input.sentence === first ? { verdict: 'true', reason: 'all true' } : { verdict: 'false', reason: 'the example writes 5 in the ones' }));
        const r = await turn(line, HELP, stream, math);
        expect(r.say).not.toContain(line);
        expect(r.say.join(' ')).not.toContain('Write 4 in the ones.');
        expect(r.parts.join(' ')).not.toContain('Write 4 in the ones.');
        expect(math.requests.map((x) => x.sentence)).toContain('Write 4 in the ones.');
      });
    }
    it('control: a message of code-only sentences still passes on code alone', () => {
      expect(checkTutorSay('Write 4 in the ones.', ctx())).toMatchObject({ ok: true, math: [] });
      expect(tutorStreamSentence('Write 4 in the ones.', [], ctx())).toBe('send');
    });
  });

  describe('N4: an answer claim with a stated scope goes to the review', () => {
    for (const line of ['In the ones column, the answer is 4.', 'For the easier example, the answer is 35.']) {
      it(`"${line}" is not refused`, () => {
        expect(answerProblems(line, 24)).toEqual([]);
        expect(checkTutorSay(line, ctx())).toMatchObject({ ok: true, math: [line] });
      });
      for (const stream of [false, true]) {
        it(`"${line}" reaches the child after a "true" review, stream=${stream}`, async () => {
          const math = fakeMathReviewer();
          const r = await turn(line, HELP, stream, math);
          expect(r.say.join(' ')).toContain(line);
          expect(math.requests.map((x) => x.sentence)).toContain(line);
        });
      }
    }
    it('a scoped claim that names the main answer is not read by code either', () => {
      expect(checkTutorSay('In the ones column, the answer is 24.', ctx())).toMatchObject({ ok: true, math: ['In the ones column, the answer is 24.'] });
      expect(answerClaims('In the ones column, the answer is 24.', 24).read).toHaveLength(0);
    });
    it('control: an unscoped wrong answer is still refused, and the right one still read', () => {
      expect(answerProblems('The answer is 4.', 24)).toEqual(['4 is not the answer to the question']);
      expect(answerProblems('So the answer is 25.', 24)).toEqual(['25 is not the answer to the question']);
      expect(answerProblems('25 is the answer.', 24)).toEqual(['25 is not the answer to the question']);
      expect(answerClaims('The answer is 24.', 24).read).toHaveLength(1);
    });
  });

  describe('N5: an unsafe answer value goes to the review', () => {
    const line = 'The answer is 100000000 times 100000000 plus 24 minus 100000000 times 100000000.';
    it('code neither refuses nor reads it', () => {
      expect(BigInt(100000000) * BigInt(100000000) + BigInt(24) - BigInt(100000000) * BigInt(100000000)).toBe(BigInt(24));
      expect(answerProblems(line, 24)).toEqual([]);
      expect(checkTutorSay(line, tutorStreamContext(SUB, 'Help me please.', 'none', new Set()))).toMatchObject({ ok: true, math: [line] });
    });
    for (const stream of [false, true]) {
      it(`it reaches the child after a "true" review, stream=${stream}`, async () => {
        const math = fakeMathReviewer();
        const r = await turn(line, 'Help me please.', stream, math);
        expect(r.say.join(' ')).toContain(line);
        expect(math.requests.map((x) => x.sentence)).toContain(line);
      });
    }
    it('control: "The answer is 52 minus 28." is read; "The answer is 52 plus 28." is refused', () => {
      expect(answerProblems('The answer is 52 minus 28.', 24)).toEqual([]);
      expect(answerProblems('The answer is 52 plus 28.', 24)).toEqual(['80 is not the answer to the question']);
    });
  });
});

describe("tutor core regressions (set 2)", () => {
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
});

describe("tutor core regressions (set 3)", () => {
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
});

describe("tutor core regressions (set 4)", () => {
  const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;

  const W = "44444444-4444-4444-8444-444444444444";

  /** A stored question as the tutor reads it: teachingPackage, then the session's own package. */
  function stored(raw: unknown): OperationPackage {
    const s = createSession({ callId: "stored", package: teachingPackage(raw) as never, tutor: true, conversational: true });
    if (!s.tutor || !s.package) throw new Error("not a tutor question");
    return s.package;
  }

  /** The Book 1 question "Omar puts 5 books in each jar. How many books in 4 jars?", as stored. */
  const OMAR = () => stored({
    id: "final9:omar", ref: { page: 9, source: "workbook", question: 3, workbookId: W },
    item: { error: null, checks: [{ kind: "template", region: "answer", source: { check: null, slots: [{ name: "m", value: { int: "5" }, domain: { max: 7, min: 2 } }, { name: "p", value: { int: "4" }, domain: { max: 6, min: 1 } }], answer: "m * p", values: null, derived: [] } }, { kind: "template-choice", region: "operation", source: { check: null, slots: [{ name: "m", value: { int: "5" }, domain: { max: 7, min: 2 } }, { name: "p", value: { int: "4" }, domain: { max: 6, min: 1 } }], answer: "'×'", values: null, derived: [] } }], format: "tick-and-number", regions: [{ id: "operation", kind: "choice", mark: "tick", label: "Tick the operation", answer: "×", choices: ["+", "−", "×", "÷"] }, { id: "answer", kind: "box", label: "Write the answer", answer: { type: "number", value: 20 } }, { id: "work", kind: "work", label: "Show your work" }], scorable: true, parentChecked: false },
    text: "Omar puts 5 books in each jar. How many books in 4 jars?", level: 16, skill: { skills: ["4.9-table-pattern"], standard: "4.9" }, steps: [], answer: null, operation: null, difficulty: 1, templateId: "4.9-table-pattern#3.2:story", textSource: "code", wrongAnswers: [], easierExample: null,
  });

  /** The Book 1 question "6 × 440 = ?", as stored. */
  const TIMES440 = () => stored({
    id: "final9:440", ref: { page: 12, source: "workbook", question: 1, workbookId: W },
    item: { error: null, checks: [{ kind: "template", region: "answer", source: { check: "b0 >= 10", slots: [{ name: "a0", value: { int: "6" }, domain: { max: 9, min: 1 } }, { name: "b0", value: { int: "446" }, domain: { max: 900, min: 10 } }], answer: "a * b", values: null, derived: [["a", "a0"], ["b", "b0 // 10 * 10"]] } }], format: "write-number", regions: [{ id: "answer", kind: "box", label: null, answer: { type: "number", value: 2640 } }], scorable: true, parentChecked: false },
    text: "6 × 440 = ?", level: 16, skill: { skills: ["5.9-multiply-tens"], standard: "5.9" },
    steps: [
      { id: "r2-ones", row: "tens", top: 6, kind: "multiply-digit", place: "ones", total: 24, write: 4, carryIn: 0, carryOut: 2, multiplier: 4 },
      { id: "r2-tens", row: "tens", top: null, kind: "multiply-digit", place: "tens", total: 2, write: 2, carryIn: 2, carryOut: 0, multiplier: 4 },
      { id: "r2", row: "tens", kind: "partial-product", value: 240, zeros: 1, multiplier: 4 },
      { id: "r3-ones", row: "hundreds", top: 6, kind: "multiply-digit", place: "ones", total: 24, write: 4, carryIn: 0, carryOut: 2, multiplier: 4 },
      { id: "r3-tens", row: "hundreds", top: null, kind: "multiply-digit", place: "tens", total: 2, write: 2, carryIn: 2, carryOut: 0, multiplier: 4 },
      { id: "r3", row: "hundreds", kind: "partial-product", value: 2400, zeros: 2, multiplier: 4 },
      { id: "sum-ones", kind: "add-column", place: "ones", total: 0, write: 0, digits: [0, 0], carryIn: 0, carryOut: 0 },
      { id: "sum-tens", kind: "add-column", place: "tens", total: 4, write: 4, digits: [4, 0], carryIn: 0, carryOut: 0 },
      { id: "sum-hundreds", kind: "add-column", place: "hundreds", total: 6, write: 6, digits: [2, 4], carryIn: 0, carryOut: 0 },
      { id: "sum-thousands", kind: "add-column", place: "thousands", total: 2, write: 2, digits: [2], carryIn: 0, carryOut: 0 },
      { id: "result", kind: "result", value: { type: "number", value: 2640 } },
    ],
    answer: { unit: null, value: { type: "number", value: 2640 }, accepted: [] }, operation: { kind: "multiply", operands: [6, 440] }, difficulty: 1, templateId: "5.9-multiply-tens#1.1:bare", textSource: "code",
    wrongAnswers: [{ step: null, cause: "calculation", value: { type: "number", value: 2641 }, description: "Gives a different result." }],
    easierExample: { text: "0 × 1 = ?", steps: [{ id: "r1-ones", row: "ones", top: 0, kind: "multiply-digit", place: "ones", total: 0, write: 0, carryIn: 0, carryOut: 0, multiplier: 1 }, { id: "result", kind: "result", value: { type: "number", value: 0 } }], answer: { type: "number", value: 0 }, operation: { kind: "multiply", operands: [0, 1] } },
    operationSource: "maya",
  });

  /** One child turn in the text adapter, Maya's message fixed, with the stream on or off. */
  async function turn(pkg: OperationPackage, line: string, child: string, stream: boolean, math: MathReviewer = fakeMathReviewer(), ms = 1000) {
    const parts: string[] = [];
    const model = conversationalFake({ answer: () => reply(line, "guide"), ...(stream ? { stream: { chunk: 7 } } : {}) });
    const s = createTextSession({ callId: "final9", package: pkg, tutor: true, clock: () => Date.now(), reviewer: fakeTalkReviewer(), mathReviewer: math, model, reviewTimeLimitMs: ms, ...(stream ? {} : { channel: "chat" as const }), ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
    await s.start();
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

  describe("N1 (P1): credit and a right verdict need a complete answer read; an unread unit is unknown", () => {
    for (const stream of [false, true]) {
      it(`binding: "20 jars." on the books question gets no right verdict and no praise (stream=${stream})`, async () => {
        const p = OMAR();
        expect(p.answer.value).toMatchObject({ type: "number", value: 20 });
        const v = verdictReader();
        const r = await turn(p, "Perfect!", "20 jars.", stream, v.reviewer);
        expect(v.inputs[0].childAnswer?.verdict).not.toBe("right");
        expect(r.out.say).not.toContain("Perfect!");
        expect(r.parts).not.toContain("Perfect!");
        expect(r.s.session.solved).toBeNull();
      });
      it(`control: "20", "20 books." and "My answer is 20." are right; "19" and "My answer is 20 jars." are not (stream=${stream})`, async () => {
        const p = OMAR();
        for (const child of ["20", "20 books.", "My answer is 20."]) {
          const v = verdictReader();
          const r = await turn(p, "Perfect!", child, stream, v.reviewer);
          expect(v.inputs[0].childAnswer?.verdict, child).toBe("right");
          expect(r.out.say, child).toEqual(["Perfect!"]);
        }
        for (const child of ["19", "My answer is 20 jars."]) {
          const r = await turn(p, "Perfect!", child, stream, verdictReader().reviewer);
          expect(r.out.say, child).not.toContain("Perfect!");
        }
      });
    }
  });

  describe("N2 (P1): compound number words are read by their groups, and an odd word run is left unread", () => {
    const value = (text: string) => sayNumbers(text).map((t) => t.key);
    it("binding: the forms read as one standard value", () => {
      expect(value("two thousand six hundred and forty")).toEqual(["2640"]);
      expect(value("one thousand and five")).toEqual(["1005"]);
      expect(value("nine hundred ninety-nine")).toEqual(["999"]);
      expect(value("forty-two thousand")).toEqual(["42000"]);
      expect(value("three hundred forty-two thousand five hundred")).toEqual(["342500"]);
      expect(value("two thousand six hundred forty")).toEqual(["2640"]);
    });
    it("binding: \"three thousand two hundred\" is 3200, beside plain numbers (controls)", () => {
      expect(value("twenty four")).toEqual(["24"]);
      expect(value("one hundred and five")).toEqual(["105"]);
      expect(value("seven")).toEqual(["7"]);
      expect(value("three thousand two hundred")).toEqual(["3200"]);
    });
    it("control: the digit form and simple word forms read as before", () => {
      expect(value("twenty four")).toEqual(["24"]);
      expect(value("one hundred and five")).toEqual(["105"]);
      expect(childFacts(TIMES440(), "6 times 440 is 2640.")).toContain("The child said 6 × 440 = 2640: that is true.");
      expect(childFacts(TIMES440(), "6 times 440 is 2650.")).toContain("The child said 6 × 440 = 2650: that is false.");
    });
    it("binding: a run that makes no one standard value is no value", () => {
      for (const text of ["five hundred thousand thousand", "two hundred three hundred", "six thousand two thousand"]) {
        expect(sayNumbers(text).every((t) => t.q === null), text).toBe(true);
      }
      // The child's clause with such a run is unread: no fact, true or false.
      expect(childFacts(TIMES440(), "6 times 440 is two thousand two thousand.").join(" ")).not.toMatch(/6 × 440 =/);
    });
    for (const stream of [false, true]) {
      it(`binding: "6 times 440 is two thousand six hundred and forty." is a true child fact and Maya may say it (stream=${stream})`, async () => {
        const p = TIMES440();
        const line = "6 times 440 is two thousand six hundred and forty.";
        expect(6 * 440).toBe(2640);
        expect(childFacts(p, line)).toContain("The child said 6 × 440 = 2640: that is true.");
        const math = fakeMathReviewer();
        await turn(p, "Let us check that.", line, stream, math);
        expect(math.requests[0]?.childAnswer?.verdict).not.toBe("wrong");
        expect(math.requests[0]?.childFacts.join(" ")).not.toContain("200640");
        const r = await turn(p, line, "Help me with 6 times 440.", stream, fakeMathReviewer());
        expect(r.out.say).toEqual([line]);
      });
      it(`binding: a false word form is read as false (2650), beside the digit form (stream=${stream})`, async () => {
        const p = TIMES440();
        expect(childFacts(p, "6 times 440 is 2640.")).toContain("The child said 6 × 440 = 2640: that is true.");
        expect(childFacts(p, "6 times 440 is two thousand six hundred and fifty.")).toContain("The child said 6 × 440 = 2650: that is false.");
        const r = await turn(p, "6 times 440 is two thousand six hundred and fifty.", "Help me with 6 times 440.", stream, fakeMathReviewer());
        expect(r.out.say).not.toContain("6 times 440 is two thousand six hundred and fifty.");
      });
    }
  });

  describe("N3 (P1): a terminal non-true math review of a sentence is final for that child turn, across repairs", () => {
    const line = "12 minus 8 is 4 with a negative sign.";
    for (const stream of [false, true]) for (const kind of ["error", "timeout", "retry-error", "false", "bad_json"] as const) {
      it(`${kind === "bad_json" ? "control (held before the fix)" : "binding"}: ${kind}, then a repair that repeats the sentence is refused (stream=${stream})`, async () => {
        let calls = 0;
        let retries = 0;
        const first = { model: "local-failure", json: async () => {
          calls++;
          if (calls === 1) {
            if (kind === "error") throw new Error("connection failed");
            if (kind === "timeout") await new Promise((r) => setTimeout(r, 40));
            if (kind === "retry-error") return { verdict: "unsure", reason: "cannot tell" };
            if (kind === "false") return { verdict: "false", reason: "a negative sign is not 4" };
            if (kind === "bad_json") throw new Error("The model's answer was not valid JSON.");
          }
          return { verdict: "true", reason: "all true" };
        } };
        const retry = { model: "local-retry", json: async () => { retries++; throw new Error("connection failed"); } };
        const math = aiMathReviewer(first as never, undefined, kind === "retry-error" ? { client: retry as never } : undefined);
        const r = await turn(SUB, line, "Help me with 52 minus 28.", stream, math, kind === "timeout" ? 15 : 1000);
        expect(calls).toBe(1);
        expect(r.model.briefs).toHaveLength(2);
        expect(r.out.say).not.toContain(line);
        expect(r.parts).not.toContain(line);
        if (kind === "retry-error") expect(retries).toBe(1);
      });
    }
    it("binding: an error holds for its turn, and a new child turn reviews the sentence again", async () => {
      let calls = 0;
      const math = fakeMathReviewer(() => (++calls === 1 ? "throw" : { verdict: "true", reason: "all true" }));
      const model = conversationalFake({ answer: () => reply(line, "guide") });
      const s = createTextSession({ callId: "final9", package: SUB, tutor: true, clock: () => Date.now(), reviewer: fakeTalkReviewer(), mathReviewer: math, model, channel: "chat" });
      await s.start();
      const one = await s.child("Help me with 52 minus 28.");
      expect(one.say).not.toContain(line);
      const two = await s.child("Help me again please.");
      expect(two.say).toEqual([line]);
    });
    it("control: a reviewer that always fails keeps the sentence out", async () => {
      const r = await turn(SUB, line, "Help me with 52 minus 28.", false, fakeMathReviewer(() => "throw"));
      expect(r.out.say).not.toContain(line);
    });
  });

  describe("N4 (P2): an equality code cannot read goes to the review; only a clause proved false is refused", () => {
    for (const stream of [false, true]) for (const line of ["2 times (minus 3 plus 4) = 2.", "3 squared = 9."]) {
      it(`binding: "${line}" is reviewed and said (stream=${stream})`, async () => {
        expect(2 * (-3 + 4)).toBe(2);
        expect(3 ** 2).toBe(9);
        expect(checkTutorSay(line, tutorStreamContext(SUB, "Help me please.", "none", new Set()))).not.toMatchObject({ ok: false, reason: "false_equation" });
        const math = fakeMathReviewer();
        const r = await turn(SUB, line, "Help me please.", stream, math);
        expect(math.requests.length).toBeGreaterThan(0);
        expect(r.out.say).toEqual([line]);
      });
    }
    it("control: a false clause code reads whole is still refused, and the review refuses a false unread one", async () => {
      expect(checkTutorSay("12 minus 8 = 5.", tutorStreamContext(SUB, "Help me please.", "none", new Set()))).toMatchObject({ ok: false });
      const r = await turn(SUB, "3 squared = 10.", "Help me please.", false, fakeMathReviewer(() => ({ verdict: "false", reason: "3 squared is 9" })));
      expect(r.out.say).not.toContain("3 squared = 10.");
      const c = await turn(SUB, "2 times (minus 3 plus 4) is 2.", "Help me please.", false, fakeMathReviewer());
      expect(c.out.say).toEqual(["2 times (minus 3 plus 4) is 2."]);
    });
  });

  const P = "11111111-1111-4111-8111-111111111111";

  const C = "22222222-2222-4222-8222-222222222222";

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

  describe("F1 (P1): any board command that holds the answer value gives the answer", () => {
    const pkg = teachingPackage(storedPlaceValue({ variant: "1.2", n0: 48942, place: "ten thousands" })) as OperationPackage;
    for (const voice of [false, true]) for (const mode of ["answer", "value", "number", "hint"] as const) {
      it(`${mode === "answer" || mode === "value" ? "binding" : "control"}: ${mode} (voice=${voice})`, async () => {
        expect(isTutorQuestion(pkg)).toBe(true);
        expect(pkg.text).toBe("What is the value of the digit in the ten thousands place of 48942?");
        expect(pkg.answer.value).toEqual({ type: "number", value: 40000 });
        // B2: the board draws only what Maya says, so a board value is always in her words too. The model's own draw list
        // (the old way to put the answer on the board) is ignored: the answer is given by the words, and the board holds
        // no value she did not say.
        const say = mode === "number" ? "The answer is 40000." : mode === "answer" ? "Write 40000." : mode === "value" ? "Write 40000 in the ten thousands." : "Look at the place-value chart.";
        const draw = mode === "answer" ? [{ offer: "answer", place: "" }] : mode === "value" ? [{ offer: "value", place: "ten thousands" }] : [];
        const r = await family(pkg, [reply(say, "guide", { draw } as never), reply("Bye for now.", "close")], ["I need help.", "My answer is 40000."], voice);
        const n = r.notes[0];
        expect(n?.transcript.some((t) => t.speaker === "maya" && t.text === say)).toBe(true);
        if (mode === "answer" || mode === "value") {
          // The chart is not on the board, so the value and the answer row (which need it) are not drawn.
          const shown = (r.record?.trace as { board: { commands: { op: string; value?: string }[] }[] } | undefined)?.board.flatMap((b) => b.commands).filter((c) => c.op === "put" && c.value === "40000") ?? [];
          expect(shown).toEqual([]);
          expect(n?.facts.help).toBe("answer_given");
          expect(n?.sentences.join(" ")).not.toContain("finished it after a small hint");
        } else if (mode === "number") expect(n?.facts.finished).toBe("answer_given");
        else expect(n?.facts.help).toBe("hint");
      });
    }
  });

  describe("F2 (P1): a number in a turn that names a place, column, step, digit or row is never final-answer credit", () => {
    for (const child of ["The tens answer is 24.", "The tens are 24.", "I got 24 for the tens.", "My answer is 24."]) for (const voice of [false, true]) {
      it(`${child.startsWith("The tens") ? "binding" : "control"}: family record for "${child}" (voice=${voice})`, async () => {
        const r = await family(SUB, [reply("What is 4 minus 2?", "guide"), reply("Yes, that's right. What did you write?", "guide")], ["12 minus 8 is 4.", child], voice);
        const n = r.notes[0];
        if (child === "My answer is 24.") expect(r.record?.outcome?.reason).toBe("solved");
        else {
          // Maya's praise is judged by the math review against code's verdict (the test below); here the review is a fake
          // that passes all, so only the record is checked.
          expect(r.record?.outcome?.reason).not.toBe("solved");
          expect(n?.sentences.join(" ")).not.toContain("finished it");
        }
      });
    }
    for (const child of ["The tens answer is 24.", "The tens are 24.", "The answer is 24 in the tens row.", "24, that is the digit."]) for (const stream of [false, true]) {
      it(`${child.includes("row") ? "control" : "binding"}: code's verdict and praise for "${child}" (stream=${stream})`, async () => {
        const v = verdictReader();
        // Savar's call 2: a message after a wrong answer ends with one question, so the fixture asks one.
        const r = await turn(SUB, "Your answer checks out. What is 4 minus 2?", child, stream, v.reviewer);
        expect(v.inputs.length).toBeGreaterThan(0);
        expect(v.inputs[0].childAnswer?.verdict).not.toBe("right");
        expect(r.out.say).not.toContain("Your answer checks out.");
        expect(r.parts.join(" ")).not.toContain("Your answer checks out.");
        expect(r.s.session.solved).toBeNull();
      });
    }
    it("control: \"24\" alone and \"52 minus 28 is 24.\" are still final answers", async () => {
      for (const child of ["24", "52 minus 28 is 24."]) {
        const v = verdictReader();
        const r = await turn(SUB, "Your answer checks out.", child, false, v.reviewer);
        expect(v.inputs[0].childAnswer?.verdict, child).toBe("right");
        expect(r.s.session.solved, child).toBe("child");
      }
    });
  });

  describe("F3 (P1): a turn that names the easier example scopes its numbers to the example", () => {
    for (const child of ["For the easier example, I got 4 in the ones.", "For the easier example, I got 5 in the ones.", "In the practice one I got 4 in the ones.", "For the other one, I got 4 in the ones.", "For this question, I got 4 in the ones."]) for (const stream of [false, true]) {
      const control = child.includes("this question") || child.includes("got 5") || child.includes("practice one");
      it(`${control ? "control" : "binding"}: "${child}" (stream=${stream})`, async () => {
        const v = verdictReader();
        const r = await turn(SUB, "Your answer checks out.", child, stream, v.reviewer);
        expect(r.s.session.package?.easierExample?.text).toBe("42 - 7 = ?");
        expect(r.s.session.package?.easierExample?.steps.find((x) => x.id === "ones")).toMatchObject({ write: 5 });
        if (child.includes("this question")) {
          expect(r.s.session.done).toContain("ones");
          expect(r.out.say.join(" ")).toContain("Your answer checks out.");
        } else {
          expect(r.s.session.done).not.toContain("ones");
          expect(v.inputs[0]?.childAnswer?.verdict).not.toBe("right");
          if (child.includes("got 4")) {
            expect(r.out.say.join(" ")).not.toContain("Your answer checks out.");
            expect(r.parts.join(" ")).not.toContain("Your answer checks out.");
          }
        }
      });
    }
  });
});

describe("tutor prelaunch checks (set 1)", () => {
  // Pre-launch review of the tutor core, part B (true math), on main 2a6e4542d: each false sentence below passed every
  // check and reached the child. Each finding has its binding case (refused now) and a true control (still said).

  const sub = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;

  const add = SAMPLE_PACKAGES["add-27-39"] as OperationPackage;

  const frac = createSession({ callId: "fraction", package: FIXTURES.COMPARE_FRACTIONS, conversational: true, tutor: true }).package!;

  const pv = teachingPackage(storedPlaceValue({ variant: "1.2", n0: 48942, place: "ten thousands" })) as OperationPackage;

  const divOp = { kind: "divide" as const, operands: [1340, 2] as [number, number] };

  const easy = { kind: "divide" as const, operands: [8, 2] as [number, number] };

  const div = {
    ...sub, id: "probe-div", text: "1340 ÷ 2 = ?", operation: divOp, steps: workedSteps(divOp),
    answer: { value: { type: "number" as const, value: 670 }, accepted: [], unit: null },
    wrongAnswers: [{ value: { type: "number" as const, value: 999 }, cause: "careless", description: "A made-up error.", step: null }],
    easierExample: { text: "8 ÷ 2 = ?", operation: easy, answer: { type: "number" as const, value: 4 }, steps: workedSteps(easy) },
  } as OperationPackage;

  const bigOp = { kind: "add" as const, operands: [102, 1] as [number, number] };

  const big = {
    ...add, id: "add-102-1", text: "102 + 1 = ?", operation: bigOp, steps: workedSteps(bigOp),
    answer: { value: { type: "number" as const, value: 103 }, accepted: [], unit: null },
    wrongAnswers: [{ value: { type: "number" as const, value: 104 }, cause: "careless", description: "One too many.", step: null }],
  } as OperationPackage;

  /** The check context the session gives checkTutorSay for this question. */
  function context(pkg: OperationPackage) {
    const k = tutorKind(pkg);
    const op = k.op?.(pkg);
    return { stance: "none" as const, claims: (s: string) => k.claimProblems(pkg, s), trades: k.workValues(pkg), ...(op ? { op } : {}), ...(pkg.answer.value.type === "number" ? { answer: pkg.answer.value.value } : {}) };
  }

  /** One tutor turn where the model says `text`: what the child hears. */
  async function speak(pkg: OperationPackage, text: string) {
    let now = Date.UTC(2026, 10, 15);
    const model = conversationalFake({ answer: () => reply(text, "guide") });
    const s = createTextSession({ callId: "probe-" + text, package: pkg, model, clock: () => (now += 100), random: 3, mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer((input) => (judgment(input.line).any ? { verdict: "pass" } : { verdict: "fail", rules: ["math"], reason: "The math is false." })), tutor: true });
    await s.start();
    const out = await s.child("Please help me.");
    await s.finish({ reason: "child_stopped" });
    return out.say;
  }

  async function refused(pkg: OperationPackage, line: string) {
    expect(checkTutorSay(line, context(pkg)), line).toMatchObject({ ok: false, reason: "false_equation" });
    expect(await speak(pkg, line), line).not.toEqual([line]);
  }

  async function said(pkg: OperationPackage, line: string) {
    expect(checkTutorSay(line, context(pkg)), line).toMatchObject({ ok: true });
    expect(await speak(pkg, line), line).toEqual([line]);
  }

  describe("pre-launch review B: false math the child heard is refused", () => {
    it("F01: the whole answer value, in words, decimals and expressions, and its negation", async () => {
      for (const line of ["The answer is twenty-five.", "The answer is not 24.", "The answer is 24 plus 1.", "The answer is 24.5.", "Twenty-five is the answer."]) await refused(sub, line);
      // Final check 6: an answer value code cannot read whole is never refused by code; the math review reads it.
      expect(checkTutorSay("The answer is about 25.", context(sub))).toMatchObject({ ok: true, math: ["The answer is about 25."] });
      for (const line of ["The answer is twenty-four.", "The answer is 24.", "The answer is not 25.", "The answer is 2 tens and 4 ones."]) await said(sub, line);
    });
    it("F02: a comparison that does not hold is refused before any count exemption", async () => {
      for (const line of ["12 is 5 more than 8.", "12 is 4 less than 8.", "4 is greater than 8.", "8 is not bigger than 2.", "2 ones is more than 8 ones."]) await refused(sub, line);
      for (const line of ["12 is 4 more than 8.", "Since 2 is smaller than 8, we take a ten and the 2 becomes 12.", "12 is greater than 8.", "8 is not less than 2."]) await said(sub, line);
    });
    it("F03: an object count times the object's stated unit", async () => {
      for (const line of ["4 tens is 4 sticks of one.", "4 tens is 4 sticks of a hundred."]) await refused(sub, line);
      await said(sub, "Let's use a picture: 4 tens is 4 sticks of ten, and we take away 2 of those sticks.");
    });
    it("F04: spoken fractions in equality and negation", async () => {
      for (const line of ["Five sixths is three sixths.", "Five sixths is not five sixths.", "Three sixths is greater than five sixths."]) await refused(frac, line);
      for (const line of ["5/6 is greater than 3/6.", "Five sixths is greater than three sixths."]) await said(frac, line);
    });
    it("F05: \"which is\" and \"that's\" name the quantity before them", async () => {
      for (const line of ["12 minus 8 is 4 ones, which is 40.", "We borrow 1 ten, that's 100 ones."]) await refused(sub, line);
      await said(sub, "Yes, that's it: we borrow 1 ten, which is 10 ones, so 2 ones became 12 ones.");
      await said(add, "So 7 + 9 = 16, which is 1 ten and 6 ones.");
    });
    it("F06: brackets are read", async () => {
      for (const line of ["2 times (3 plus 4) is 7.", "(3 plus 4) times 2 is 10."]) await refused(sub, line);
      await said(sub, "2 times (3 plus 4) is 14.");
    });
    it("F09: a trade with no units follows the operation", async () => {
      await refused(add, "When we carry, 16 becomes 26.");
      await said(add, "When we carry, 16 becomes 6.");
      await said(sub, "The 2 becomes 12.");
    });
  });

  describe("pre-launch review B: true math the reader refused", () => {
    it("F16: both whole sides of an equation", async () => {
      for (const line of ["12 minus 8 equals 2 plus 2.", "12 minus 8 is not 4 plus 1."]) await said(sub, line);
      await refused(sub, "12 minus 8 equals 2 plus 3.");
    });
    it("F17: a remainder in number words", async () => {
      await said(div, "Thirteen divided by two is six remainder one.");
      await refused(div, "Thirteen divided by two is six remainder two.");
    });
    it("F18: the value of a digit in a named number", async () => {
      await said(pv, "In 48,942, the value of the 4 is 40,000.");
      await said(pv, "In 48,942, the value of the 8 is 8,000.");
      await refused(pv, "In 48,942, the value of the 8 is 800.");
    });
    it("F19: compound number words are one value", async () => {
      await said(big, "One hundred and two plus one is 103.");
      await refused(big, "One hundred and two plus one is 104.");
    });
  });
});

describe("tutor prelaunch checks (set 2)", () => {
  // Pre-launch check 2 of the tutor core (part 2, true math), the core findings. Each sentence reached the child with no
  // math review on main d6e32a97e. A fake model, a math review that answers "false", and a passed-in clock.

  const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;

  const ADD = SAMPLE_PACKAGES["add-27-39"] as OperationPackage;

  /** The check context as the stream builds it for a turn with no child number. */
  const ctxOf = (pkg: OperationPackage) => tutorStreamContext(pkg, "", "none", new Set());

  async function say(pkg: unknown, line: string, opts: { stream?: boolean; childName?: string } = {}) {
    let now = Date.UTC(2026, 10, 15, 16);
    const parts: string[] = [];
    const math = fakeMathReviewer(() => ({ verdict: "false", reason: "false math" }));
    const model = conversationalFake({ answer: () => reply(line, "guide"), ...(opts.stream ? { stream: { chunk: 7 } } : {}) });
    const session = createTextSession({
      callId: "prelaunch2", package: pkg, model, clock: () => (now += 100), random: 3, tutor: true, reviewTimeLimitMs: 15,
      reviewer: fakeTalkReviewer(), mathReviewer: math, ...(opts.childName ? { childName: opts.childName } : {}),
      ...(opts.stream ? { onSayPart: (x: string) => parts.push(x) } : {}),
    });
    await session.start();
    parts.length = 0;
    const out = await session.child("Help me please.");
    return { said: out.say.join(" "), parts: parts.join(" "), math };
  }

  describe("F1: a column sum said in a place is read only for the question's own column", () => {
    it("sends \"1 plus 2 plus 3 is 6 hundreds\" in 52 − 28 to the math review, which refuses it", async () => {
      const line = "1 plus 2 plus 3 is 6 hundreds.";
      expect(checkTutorSay(line, ctxOf(SUB))).toMatchObject({ ok: true, math: [line] });
      const r = await say(SUB, line);
      expect(r.said).not.toContain("hundreds");
      expect(r.math.requests.length).toBeGreaterThan(0);
    });
    it("sends the right sum in the wrong place to the review too", () => {
      // 27 + 39: the tens are 1 + 2 + 3 = 6 tens, never 6 hundreds.
      expect(unreadMath("1 plus 2 plus 3 is 6 hundreds.", ctxOf(ADD))).not.toEqual([]);
    });
    it("final check 7: the question's own column sum in other words goes to the math review too (it is not context-free)", () => {
      expect(checkTutorSay("1 plus 2 plus 3 is 6 tens.", ctxOf(ADD))).toMatchObject({ ok: true, math: ["1 plus 2 plus 3 is 6 tens."] });
      expect(checkTutorSay("3 plus 2 plus 1 is 6 tens.", ctxOf(ADD))).toMatchObject({ ok: true, math: ["3 plus 2 plus 1 is 6 tens."] });
    });
  });

  describe("F2: a word after a read claim in its clause sends the sentence to the math review", () => {
    it.each(["12 minus 8 is 4 with a negative sign.", "12 minus 8 is 4 in the hundreds place."])("%s", async (line) => {
      expect(unreadMath(line, ctxOf(SUB))).not.toEqual([]);
      const r = await say(SUB, line, { stream: true });
      expect(r.said).not.toContain("12 minus 8 is 4");
      expect(r.parts).not.toContain("12 minus 8 is 4");
      expect(r.math.requests.length).toBeGreaterThan(0);
    });
    it("control: a claim with only link words or a new clause after it passes on code alone", () => {
      for (const line of ["12 minus 8 is 4.", "So 12 minus 8 is 4 too.", "52 is 4 tens and 12 ones.", "12 minus 8 is 4, and 4 tens minus 2 tens is 2 tens."]) {
        expect(unreadMath(line, ctxOf(SUB)), line).toEqual([]);
      }
    });
  });

  describe("F8: the math review never gets the child's name, in the step facts too", () => {
    it("hides the name the story shares with the child", async () => {
      const r = await say(FIXTURES.CLAIM_DIV, "That 7 needs another look.", { childName: "Mia" });
      const input = r.math.requests[0];
      expect(input.question).not.toContain("Mia");
      expect(JSON.stringify(input.steps)).not.toContain("Mia");
      expect(JSON.stringify(input.steps)).toContain("{name}");
      expect(JSON.stringify(input.easierExample)).not.toContain("Mia");
    });
    it("control: another child's name leaves the story's person as printed", async () => {
      const r = await say(FIXTURES.CLAIM_DIV, "That 7 needs another look.", { childName: "Zed" });
      expect(JSON.stringify(r.math.requests[0].steps)).toContain("Mia");
    });
  });
});
