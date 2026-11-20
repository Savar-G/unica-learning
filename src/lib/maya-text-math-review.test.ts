import { describe, expect, it } from "vitest";
import { checkTutorSay, type MathReviewInput, type MathReviewResult, SAFETY_GUIDANCE, unreadMath } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { aiMathReviewer, fakeMathReviewer, type MathReviewer, runMathReview } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { teachingPackage } from "@/lib/maya-teaching";
import { storedPlaceValue } from "@/lib/maya-teaching/place-value-samples";
import { createTextSession, streamedPriority } from "@/lib/maya-text";
import { checkTrace } from "@/lib/maya-trace";
import { fixedOffers } from "@/lib/maya/lines";
import { OPERATOR_PHRASES, RELATION_PHRASES } from "@/lib/maya/math-words";
import { missingWork } from "@/lib/maya/missing-number";
import { sayNumbers, sentenceKey, standardNumber } from "@/lib/maya/say-check";
import { answerReadWhole, createSession, mathReviewInput, step } from "@/lib/maya/session";
import { childFacts, codeAlone, tutorKind, tutorStreamContext } from "@/lib/maya/tutor";
import { falseClaims } from "@/lib/maya/tutor-math";
import { type Operation, type OperationPackage, operationResult, workedSteps } from "@/lib/question-package";

// Two-layer true math (the Chief of Staff's design of 2026-11-15). Layer 1: a sentence passes on code alone only when the
// claim reader reads every number and relation word in it inside a claim it found true; a found false claim is refused.
// Layer 2: a sentence with no found problem that code did not read whole goes to the math-truth review, held in the
// stream; only "true" lets it be said. A fake model, a fake review and a passed-in clock.

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;

const T0 = Date.UTC(2026, 10, 15, 16, 0, 0);

const ctxOf = (pkg: OperationPackage) => {
  const k = tutorKind(pkg);
  const op = k.op?.(pkg);
  return { stance: "none" as const, claims: (x: string) => k.claimProblems(pkg, x), trades: k.workValues(pkg), ...(op ? { op } : {}), ...(pkg.answer.value.type === "number" ? { answer: pkg.answer.value.value } : {}) };
};

function make(text: string, operation: Operation): OperationPackage {
  const easy: Operation = { kind: "divide", operands: [8, 2] };
  return { ...SUB, id: `probe-${text}`, text, operation, answer: { value: operationResult(operation), accepted: [], unit: null }, steps: workedSteps(operation), wrongAnswers: [{ value: { type: "number", value: 999 }, cause: "careless", description: "A made-up error.", step: null }], easierExample: { text: "8 ÷ 2 = ?", operation: easy, answer: operationResult(easy), steps: workedSteps(easy) } } as OperationPackage;
}

const DIV = make("1340 ÷ 2 = ?", { kind: "divide", operands: [1340, 2] });

const FRACTION = createSession({ callId: "fraction", package: FIXTURES.COMPARE_FRACTIONS, conversational: true, tutor: true }).package as OperationPackage;

const settle = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };

type MathAnswer = (input: MathReviewInput, n: number) => MathReviewResult | "throw" | "bad_json" | "hang";

function call(pkg: unknown, says: string[], math: MathAnswer | null, stream = false) {
  let now = T0;
  const parts: string[] = [];
  let early: string[] = [];
  let n = 0;
  const model = conversationalFake({
    answer: () => reply(says[Math.min(n++, says.length - 1)], "guide"),
    ...(stream ? { stream: { chunk: 7, beforeEnd: async () => { await settle(); early = [...parts]; } } } : {}),
  });
  const mathReviewer = math ? fakeMathReviewer(math) : null;
  const session = createTextSession({
    callId: "math-review", package: pkg, model, clock: () => (now += 100), random: 3, tutor: true, reviewTimeLimitMs: 50,
    // The safety review passes every sentence: only the math review decides.
    reviewer: fakeTalkReviewer(),
    mathReviewer,
    ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}),
  });
  return { session, model, mathReviewer, parts, early: () => early };
}

describe("layer 1: coverage accounting in the claim reader", () => {
  it("passes a true sentence whose math code reads whole, with no review, only in an exact closed form", () => {
    for (const s of ["12 minus 8 is 4.", "So 12 minus 8 is 4.", "52 is 4 tens and 12 ones.", "4 tens minus 2 tens is 2 tens.", "What is 12 minus 8?"]) {
      expect(unreadMath(s, ctxOf(SUB)), s).toEqual([]);
      expect(checkTutorSay(s, ctxOf(SUB)), s).toMatchObject({ ok: true, math: [] });
    }
    // Final check 5: an instruction is code alone only as an exact step text: code reads these whole, and they go to the
    // math review.
    for (const s of ["Trade 1 ten for 10 ones.", "Now subtract the ones."]) {
      expect(unreadMath(s, ctxOf(SUB)), s).toEqual([]);
      expect(checkTutorSay(s, ctxOf(SUB)), s).toMatchObject({ ok: true, math: [s] });
    }
    // The exact-match rule (2026-11-15): code reads these whole and finds them true, but no closed form or step text is
    // the whole sentence, so they go to the math review.
    for (const s of ["The answer is 24.", "24 is the answer."]) {
      expect(unreadMath(s, ctxOf(SUB)), s).toEqual([]);
      expect(checkTutorSay(s, ctxOf(SUB)), s).toMatchObject({ ok: true, math: [s] });
    }
    // Final check 7: a trade holds only for one problem's work, so code no longer reads it (no literal equality); it
    // goes to the math review as before.
    expect(unreadMath("2 ones become 12.", ctxOf(SUB))).not.toEqual([]);
    expect(checkTutorSay("2 ones become 12.", ctxOf(SUB))).toMatchObject({ ok: true, math: ["2 ones become 12."] });
  });
  it("sends a sentence with any number or relation word code did not read to the review", () => {
    expect(unreadMath("The answer is 24 and a half.", ctxOf(SUB))).toEqual(["is", "24", "0.5"]);
    expect(unreadMath("12 minus 8 is 4, which is greater than 8.", ctxOf(SUB))).toEqual(["is", "greater", "than", "8"]);
    expect(unreadMath("Write 4 in the ones.", ctxOf(SUB))).toEqual(["4"]);
    expect(unreadMath("12 is 4 steps.", ctxOf(SUB))).toEqual(["12", "is", "4"]);
    // Final check 10: "a half is one half" is only part of the mixed number "one and a half": nothing of it is read.
    expect(unreadMath("One and a half is one half.", ctxOf(FRACTION))).toEqual(["1", "0.5", "is", "0.5"]);
    expect(unreadMath("Thirteen divided by two is six remainder one, which is two.", ctxOf(DIV))).toEqual(["is", "2"]);
    // A question form claims nothing only in a question: said as a statement, its numbers are not read.
    expect(unreadMath("What is 12 minus 8.", ctxOf(SUB))).not.toEqual([]);
    // Final check 6: after a sentence that needs the review, every later sentence of the message needs it too.
    expect(checkTutorSay("That is a good try. 12 minus 8 is 4.", ctxOf(SUB))).toMatchObject({ ok: true, math: ["That is a good try.", "12 minus 8 is 4."] });
  });
  it("still refuses a false claim code finds, before any review", () => {
    for (const s of ["12 minus 8 is 5.", "4 is greater than 8.", "The answer is 25.", "Five sixths is three sixths."]) expect(checkTutorSay(s, ctxOf(s.startsWith("Five") ? FRACTION : SUB)), s).toMatchObject({ ok: false, reason: "false_equation" });
  });
});

describe("layer 2: the math-truth review", () => {
  it("never throws: an error or a time-out is unsure", async () => {
    const r1 = await runMathReview(fakeMathReviewer(() => "throw"), {} as MathReviewInput, 50);
    const r2 = await runMathReview(fakeMathReviewer(() => "hang"), {} as MathReviewInput, 20);
    expect(r1.verdict).toBe("unsure");
    expect(r2).toEqual({ verdict: "unsure", reason: "the math review did not answer in time" });
  });

  it("final check 8: an answer that is not JSON is final unsure, never asked again", async () => {
    const once = fakeMathReviewer((_, n) => (n === 0 ? "bad_json" : { verdict: "true", reason: "all true" }));
    expect(await runMathReview(once, {} as MathReviewInput, 50)).toEqual({ verdict: "unsure", reason: "the math review call failed (bad_json)" });
    expect(once.requests).toHaveLength(1);
  });

  it("never asks again after a time-out or another error", async () => {
    const hang = fakeMathReviewer(() => "hang");
    expect(await runMathReview(hang, {} as MathReviewInput, 20)).toEqual({ verdict: "unsure", reason: "the math review did not answer in time" });
    expect(hang.requests).toHaveLength(1);
    const thrown = fakeMathReviewer(() => "throw");
    expect((await runMathReview(thrown, {} as MathReviewInput, 50)).verdict).toBe("unsure");
    expect(thrown.requests).toHaveLength(1);
  });

  it("final check 8: a sentence after an answer that is not JSON is not said, and its repair is not reviewed again", async () => {
    const line = "That 4 is already in the ones.";
    const { session, mathReviewer } = call(SUB, [line], (_, n) => (n === 0 ? "bad_json" : { verdict: "true", reason: "all true" }));
    await session.start();
    const out = await session.child("Help me please.");
    expect(out.say.join(" ")).not.toContain(line);
    expect(mathReviewer!.requests.map((r) => r.sentence)).toEqual([line]);
  });

  it("gives the review the last 2 turns as code holds them, with the child's name as {name}", async () => {
    let n = 0;
    const says = ["Hi Zoe! What is 2 minus 8 in the ones?", "That's 8 minus 2, the other way around. What is 12 minus 8?"];
    const model = conversationalFake({ answer: () => reply(says[Math.min(n++, says.length - 1)], "guide") });
    const mathReviewer = fakeMathReviewer();
    let now = T0;
    const session = createTextSession({ callId: "math-review-turns", package: SUB, model, clock: () => (now += 100), random: 3, tutor: true, reviewTimeLimitMs: 50, reviewer: fakeTalkReviewer(), mathReviewer, childName: "Zoe" });
    await session.start();
    await session.child("Zoe thinks it is 6.");
    await session.child("Zoe says 6 again.");
    const input = mathReviewer.requests.find((r) => r.sentence === "That's 8 minus 2, the other way around.")!;
    expect(input.lastTurns.child).toBe("{name} says 6 again.");
    expect(input.lastTurns.maya).not.toBeNull();
    expect(JSON.stringify(input)).not.toMatch(/Zoe/);
    expect(input.promptVersion).toBe("maya-math-review-8");
  });

  it("gives the review code's facts of the question and the child's turn, never the child's name", async () => {
    const { session, mathReviewer } = call(SUB, ["You can't take 8 from 2, so we use the 12 ones from the trade here. What is 12 minus 8?"], () => ({ verdict: "true", reason: "all true" }));
    await session.start();
    await session.child("I got 36.");
    const input = mathReviewer!.requests[0];
    expect(input.sentence).toBe("You can't take 8 from 2, so we use the 12 ones from the trade here.");
    expect(input.question).toBe(SUB.text);
    expect(input.answer).toBe(24);
    expect(input.steps.map((s) => s.result)).toEqual([4, 2]);
    expect(input.workValues).toContain(12);
    expect(input.childFacts.join(" ")).toContain("The child said 36:");
    expect(input.lastTurns.child).toBe("I got 36.");
    // The easier example Maya may teach first, with code's own steps and answer.
    expect(input.easierExample?.question).toBe(SUB.easierExample.text);
    expect(input.easierExample?.answer).toBe((SUB.easierExample.answer as { value: number }).value);
    expect(input.easierExample?.steps.length).toBeGreaterThan(0);
  });

  it("holds an uncovered sentence in the stream and sends it when the review says true; a covered sentence goes first with no review", async () => {
    let release: (r: MathReviewResult) => void = () => {};
    const held = new Promise<MathReviewResult>((r) => { release = r; });
    const { session, parts, early, mathReviewer } = call(SUB, ["12 minus 8 is 4. That 4 is already in the ones. What is 4 minus 2?"], () => "hang", true);
    // The fake answers when released, well inside the limit.
    (mathReviewer as { review: (i: MathReviewInput, s: AbortSignal) => Promise<MathReviewResult> }).review = (input) => { mathReviewer!.requests.push(input); return held; };
    await session.start();
    parts.length = 0;
    const out = session.child("Help me please.");
    await new Promise((r) => setTimeout(r, 5));
    expect(parts).toEqual(["12 minus 8 is 4."]);
    release({ verdict: "true", reason: "all true" });
    const got = await out;
    expect(early()).toContain("12 minus 8 is 4.");
    expect(got.say.join(" ")).toBe("12 minus 8 is 4. That 4 is already in the ones. What is 4 minus 2?");
    // Final check 6: the sentence after a reviewed one is reviewed too.
    expect(mathReviewer!.requests.map((r) => r.sentence)).toEqual(["That 4 is already in the ones.", "What is 4 minus 2?"]);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    expect(trace.counts).toMatchObject({ mathReviews: 2, mathRefusals: 0, refusals: 0 });
    expect(trace.mathReviewer).toEqual({ id: "fake-math-review", promptVersion: "maya-math-review-8" });
  });

  it.each([
    ["false", (): MathReviewResult | "throw" | "hang" => ({ verdict: "false", reason: "4 is not greater than 8" })],
    ["unsure", (): MathReviewResult | "throw" | "hang" => ({ verdict: "unsure", reason: "cannot tell" })],
    ["an error", (): MathReviewResult | "throw" | "hang" => "throw"],
    ["a time-out", (): MathReviewResult | "throw" | "hang" => "hang"],
  ])("repairs once with the reason when the review says %s, then says the repair", async (_, answer) => {
    const bad = "4 is the ones, which is greater than 8.";
    const good = "12 minus 8 is 4. What is 4 minus 2?";
    const { session, model, parts } = call(SUB, [bad, good], (input) => (input.sentence === bad ? answer() : { verdict: "true", reason: "all true" }), true);
    await session.start();
    parts.length = 0;
    const out = await session.child("Help me please.");
    expect(out.say.join(" ")).toBe(good);
    expect(parts.join(" ")).not.toContain("greater");
    expect(model.briefs).toHaveLength(2);
    expect(JSON.stringify(model.briefs[1])).toContain("The math review did not find");
    const trace = await session.finish({ reason: "child_stopped" });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    expect(trace.counts).toMatchObject({ mathRefusals: 1, repairs: 1, fallbacks: 0 });
  });

  it("says code's honest line after a second refusal", async () => {
    const { session, model } = call(SUB, ["That 4 is greater than 8."], () => ({ verdict: "false", reason: "4 is less than 8" }));
    await session.start();
    const out = await session.child("Help me please.");
    expect(model.briefs).toHaveLength(2);
    expect(out.say.join(" ")).toMatch(/^Let me say that another way\./);
    expect(out.say.join(" ")).not.toContain("greater");
  });

  it("refuses an uncovered sentence when the call has no math review (fail closed)", async () => {
    const { session } = call(SUB, ["That 4 is greater than 8."], null);
    await session.start();
    const out = await session.child("Help me please.");
    expect(out.say.join(" ")).not.toContain("greater");
  });
});

// The false sentences the Sol rounds found that code alone does not refuse (final check 2, N01 to N04): each class goes
// to the review, and with the review answering "false" none reaches the child. On the base head each was said as it was.
describe("binding: the Sol findings' layer-2 classes do not reach the child", () => {
  it.each([
    ["N01 an answer with something added", SUB, "The answer is 24 and a half."],
    ["N01 an answer with a negative added", SUB, "The answer is 24 minus negative one."],
    ["N02 a comparison after a checked relation", SUB, "12 minus 8 is 4, which is greater than 8."],
    ["N02 a fraction comparison chain", FRACTION, "Five sixths is greater than three sixths, which is greater than five sixths."],
    ["N03 a remainder claim after a checked remainder", DIV, "Thirteen divided by two is six remainder one, which is two."],
    ["N03 a remainder said in words", DIV, "2 goes into 13 6 times and 1 left over, so the remainder is 2."],
    ["N04 a mixed number", FRACTION, "One and a half is one half."],
  ] as const)("%s: %s", async (_, pkg, line) => {
    expect(checkTutorSay(line, ctxOf(pkg)), line).toMatchObject({ ok: true });
    expect(unreadMath(line, ctxOf(pkg)), line).not.toEqual([]);
    const { session, mathReviewer } = call(pkg, [line], () => ({ verdict: "false", reason: "the math is false" }));
    await session.start();
    const out = await session.child("Please help me.");
    expect(out.say.join(" ")).not.toContain(line);
    expect(mathReviewer!.requests.map((r) => r.sentence)).toContain(line);
  });
});

describe("text math-review regressions (set 1)", () => {
  const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;

  const DISCLOSURE = fixedOffers().find((x) => x.line === 'about.ai')!.texts[0];

  const SAY = '12 minus 8 is 4. What is 4 minus 2?';

  const IDENTITY_CHILD = 'Is a grown-up helping me with 52 minus 28?';

  const SAFETY_CHILD = 'Someone is hurting me. What is 52 minus 28?';

  const settle = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };

  /** A reading with every field at its plain default, and `extra` on top. */
  const reading = (extra: Record<string, unknown> = {}) => ({
    answers: [], help: 'none', unclear: false, stop: false, safety: 'none', writing: false, offTopic: false, mathClaim: false, mathRequests: [],
    outsideScope: 'none', scopeSkill: '', unsafeRequest: false, noBoard: false, shorter: false, aboutMaya: 'none', start: 'none', paper: 'none',
    correctsHearing: false, ...extra,
  });

  const j = (v: unknown) => JSON.stringify(v);

  /** One tutor turn with the stream on: the model streams `raw` 7 characters at a time, then returns JSON.parse(raw). */
  async function turn(raw: string, child: string) {
    const parts: string[] = [];
    let early: string[] = [];
    const model = {
      id: 'raw-json', promptVersion: 'test', output: 3 as const,
      propose: async (_input: unknown, _signal: AbortSignal, onText?: (soFar: string) => void) => {
        for (let i = 7; i < raw.length + 7; i += 7) onText?.(raw.slice(0, i));
        await settle();
        early = [...parts];
        return JSON.parse(raw);
      },
    };
    const s = createTextSession({ callId: 'final6', package: SUB, tutor: true, clock: () => 10_000, model: model as never, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(), onSayPart: (x: string) => parts.push(x), channel: 'chat' });
    await s.start();
    parts.length = 0;
    const out = await s.child(child);
    return { early, parts, say: out.say, flagged: s.session.safety.flagged, trace: s.trace() };
  }

  describe('S1: a priority value seen in the stream survives a failed parse', () => {
    const cases: { name: string; raw: (r: Record<string, unknown>) => string }[] = [
      // The order of #1060 (the reading before "say"), cut off as "say" starts.
      { name: 'reading before say, cut at say', raw: (r) => j({ kind: 'math', reading: reading(r) }).slice(0, -1) + ',"say":"' },
      // The order of #1060, cut before the closing brace.
      { name: 'reading before say, no closing brace', raw: (r) => j({ kind: 'math', reading: reading(r), say: SAY, act: 'guide', draw: [] }).slice(0, -1) },
      // The gate order, cut inside the reading after "say" (its priority fields already written).
      { name: 'reading after say, cut inside it', raw: (r) => j({ gate: 'none', kind: 'math', say: SAY, act: 'guide' }).slice(0, -1) + ',"reading":' + j({ ...r, answers: [] }).slice(0, -2) },
    ];
    for (const c of cases) {
      // With the gate "none" first, the words of "say" may stream before the reading after it is written (the gate
      // design); the priority then applies after them. With no gate, nothing streams.
      const afterSay = c.name.startsWith('reading after say');
      it(`identity: the disclosure is due (${c.name})`, async () => {
        const r = await turn(c.raw({ aboutMaya: 'identity' }), IDENTITY_CHILD);
        if (afterSay) {
          expect(r.parts.join(' ')).toContain(DISCLOSURE);
          expect(r.parts.slice(0, r.early.length)).toEqual(r.early);
        } else {
          expect(r.early).toEqual([]);
          expect(r.parts.join(' ').startsWith(DISCLOSURE)).toBe(true);
        }
        expect(r.parts.join(' ')).not.toContain('Let me say that another way');
      });
      for (const severity of ['concern', 'immediate'] as const) {
        it(`safety ${severity}: the guidance and the flag, no return to math (${c.name})`, async () => {
          const r = await turn(c.raw({ safety: severity }), SAFETY_CHILD);
          expect(r.early).toEqual([]);
          expect(r.flagged).toBe(true);
          expect(r.parts.join(' ')).toContain(SAFETY_GUIDANCE[severity]);
          expect(r.parts.join(' ')).not.toMatch(/12 minus 8|another way/);
        });
      }
    }
    it('a gate flag alone, cut off inside "say": the disclosure first', async () => {
      const r = await turn('{"gate":"identity","kind":"math","say":"12 minus 8 is', IDENTITY_CHILD);
      expect(r.early).toEqual([]);
      expect(r.parts.join(' ').startsWith(DISCLOSURE)).toBe(true);
    });
    it('control: a cut-off reply with no priority value still gets code\'s math line', async () => {
      const r = await turn(j({ gate: 'none', kind: 'math', say: SAY, act: 'guide', reading: reading() }).slice(0, -1), "It's 36.");
      expect(r.flagged).toBe(false);
      expect(r.parts.join(' ')).not.toContain(DISCLOSURE);
      expect(r.parts.length).toBeGreaterThan(0);
    });
  });

  describe('S2: a key written twice makes the output malformed for routing', () => {
    it('a neutral reading before "say" and an identity reading after it: nothing streams, the disclosure first', async () => {
      const raw = `{"gate":"none","kind":"math","reading":${j(reading())},"say":${j(SAY)},"act":"guide","draw":[],"reading":${j(reading({ aboutMaya: 'identity' }))}}`;
      const r = await turn(raw, IDENTITY_CHILD);
      expect(r.early).toEqual([]);
      expect(r.parts.join(' ').startsWith(DISCLOSURE)).toBe(true);
    });
    it('the same with no gate (the #1060 order): nothing streams, the disclosure first', async () => {
      const raw = `{"kind":"math","reading":${j(reading())},"say":${j(SAY)},"act":"guide","step":"","level":0,"draw":[],"reading":${j(reading({ aboutMaya: 'identity' }))}}`;
      const r = await turn(raw, IDENTITY_CHILD);
      expect(r.early).toEqual([]);
      expect(r.parts.join(' ').startsWith(DISCLOSURE)).toBe(true);
    });
    it('a second gate after "say" ("identity"): the disclosure is due, and nothing streams after it is seen', async () => {
      const say = "12 minus 8 is 4. Let's look at the tens together.";
      const raw = `{"gate":"none","kind":"math","say":${j(say)},"act":"guide","reading":${j(reading())},"draw":[],"gate":"identity"}`;
      const r = await turn(raw, IDENTITY_CHILD);
      expect(r.parts.join(' ')).toContain(DISCLOSURE);
      // The second sentence waited for its review; the second gate held it.
      expect(r.parts).not.toContain("Let's look at the tens together.");
      expect(r.say.join(' ')).not.toContain("Let's look at the tens together.");
    });
    it('a repeated key with no priority value is a failed output: code\'s line, no part of it', async () => {
      const raw = `{"gate":"none","kind":"math","reading":${j(reading())},"say":${j(SAY)},"act":"guide","draw":[],"reading":${j(reading())}}`;
      const r = await turn(raw, "It's 36.");
      expect(r.early).toEqual([]);
      expect(r.say.join(' ')).not.toContain('What is 4 minus 2?');
      const attempts = r.trace.turns.filter((t) => t.kind === 'maya').flatMap((t) => t.attempts);
      expect(attempts.some((a) => a.error?.code === 'bad_json')).toBe(true);
    });
    it('streamedPriority reads every copy of every key', () => {
      expect(streamedPriority(`{"gate":"none","reading":${j(reading())},"reading":${j(reading({ safety: 'immediate' }))}}`)).toEqual({ repeated: true, priority: { safety: 'immediate' } });
      expect(streamedPriority('{"gate":"safety","kind":"math","say":"Hi"')).toEqual({ repeated: false, priority: { safety: 'concern' } });
      expect(streamedPriority(`{"gate":"safety","kind":"math","say":"Hi","act":"guide","reading":${j(reading({ unsafeRequest: true }))}}`).priority).toEqual({ unsafeRequest: true });
      expect(streamedPriority('{"gate":"none","kind":"math","say":"Hi","act":"guide","reading":{"aboutMaya":"identity","answers":[')).toEqual({ repeated: false, priority: { aboutMaya: 'identity' } });
      expect(streamedPriority(`{"gate":"none","kind":"math","say":"Hi","act":"guide","reading":${j(reading())},"draw":[]}`)).toEqual({ repeated: false, priority: null });
    });
    it('control: a well-formed reply with one identity reading puts the disclosure first', async () => {
      const raw = j({ gate: 'identity', kind: 'math', say: SAY, act: 'guide', reading: reading({ aboutMaya: 'identity' }), draw: [] });
      const r = await turn(raw, IDENTITY_CHILD);
      expect(r.early).toEqual([]);
      expect(r.parts.join(' ').startsWith(DISCLOSURE)).toBe(true);
    });
    it('control (the gate design): a well-formed gate-first reply on a plain math turn still streams its first sentence early', async () => {
      const raw = j({ gate: 'none', kind: 'math', say: "52 minus 28 isn't 36. What is 12 minus 8?", act: 'guide', reading: reading(), draw: [] });
      const r = await turn(raw, "It's 36.");
      expect(r.early[0]).toBe("52 minus 28 isn't 36.");
    });
  });
});

describe("text math-review regressions (set 2)", () => {
  const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;

  const num = (value: number) => ({ type: 'number' as const, value });

  /** A multiplication question with its own worked steps (as multiply.test.ts builds them). */
  function product(a: number, b: number): OperationPackage {
    const operation: Operation = { kind: 'multiply', operands: [a, b] };
    const easier: Operation = { kind: 'multiply', operands: [2, 2] };
    return {
      ref: { source: 'workbook', workbookId: 'test', page: 1, question: 1 }, templateId: null, level: 12, difficulty: 2,
      id: `t-${a}x${b}`, text: `${a} × ${b} = ?`, skill: { standard: '4.8', skills: ['4.8-multiplication-facts'] },
      answer: { value: num(a * b), accepted: [], unit: null }, operation, steps: workedSteps(operation),
      wrongAnswers: [{ value: num(a * b + 1), cause: 'careless', description: 'One more than the answer.', step: null }],
      easierExample: { text: '2 × 2 = ?', operation: easier, answer: num(4), steps: workedSteps(easier) },
    } as OperationPackage;
  }

  /** A column subtraction story across zeros (as column.test.ts builds it). */
  function tickets(): OperationPackage {
    const operation = { kind: 'subtract' as const, operands: [10000, 2001] as [number, number] };
    return {
      id: 'subtract-10000-2001', operationSource: 'maya-teaching', ref: { source: 'workbook', workbookId: 'test', page: 1, question: 1 }, templateId: null,
      text: 'Noor has 10000 tickets and gives 2001 away. How many tickets are left?',
      answer: { value: num(7999), accepted: [], unit: null }, operation, steps: workedSteps(operation),
      skill: { standard: '4.4', skills: [] }, level: 12, difficulty: 2,
      wrongAnswers: [{ value: num(8009), cause: 'O1', description: 'Takes the smaller digit from the larger', step: null }],
      easierExample: { text: '7 − 3 = ?', operation: { kind: 'subtract', operands: [7, 3] }, answer: num(4), steps: workedSteps({ kind: 'subtract', operands: [7, 3] }) },
    } as OperationPackage;
  }

  const tutorPackage = (raw: unknown, id: string) => {
    const s = createSession({ callId: id, package: raw as never, conversational: true, tutor: true });
    if (!s.tutor || !s.package) throw new Error(`${id} is not a tutor question`);
    return s.package as OperationPackage;
  };

  const fractions = () => tutorPackage((FIXTURES as Record<string, unknown>).COMPARE_FRACTIONS, 'fractions');

  const placeValue = () => tutorPackage(teachingPackage(storedPlaceValue({ variant: '1.3', n0: 48942, place: 'hundreds', name: 'Ali', sign: 'the school' })), 'place-value');

  /** One tutor turn: the model says `line` after the child's words, in chat or streamed voice. */
  async function call(pkg: OperationPackage, line: string, child: string, stream: boolean, math: MathReviewer = fakeMathReviewer()) {
    const parts: string[] = [];
    const model = conversationalFake({ answer: () => reply(line, 'guide'), ...(stream ? { stream: { chunk: 7 } } : {}) });
    const s = createTextSession({ callId: 'final10-2', package: pkg, tutor: true, clock: () => Date.now(), reviewer: fakeTalkReviewer(), mathReviewer: math, model, reviewTimeLimitMs: 1000, ...(stream ? {} : { channel: 'chat' as const }), ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
    await s.start();
    parts.length = 0;
    const out = await s.child(child);
    return { s, out, parts };
  }

  /** The production review adapter with a local client: true only when code's verdict on the child is "right". */
  function verdictReader() {
    const inputs: { childAnswer: { value: unknown; verdict: string } | null }[] = [];
    const math = aiMathReviewer({
      model: 'local-verdict-reader',
      json: async (r: { content: { text: string }[] }) => {
        const x = JSON.parse(r.content[0].text);
        inputs.push(x);
        return x.childAnswer?.verdict === 'right' ? { verdict: 'true', reason: 'all true' } : { verdict: 'false', reason: 'no right answer' };
      },
    } as never);
    return { math, inputs };
  }

  describe('the one standard number-word reader', () => {
    it('values standard runs and refuses the rest', () => {
      expect(standardNumber('seven thousand nine hundred ninety-nine')).toBe(7999);
      expect(standardNumber('a hundred')).toBe(100);
      expect(standardNumber('twenty hundred')).toBeNull();
      expect(standardNumber('two thousand two thousand')).toBeNull();
    });
    it('keys a sentence by what it says, not its surface', () => {
      expect(sentenceKey('12 minus 8 is 4 with a negative sign.')).toBe(sentenceKey('12 Minus 8 is 4,  with a negative sign!'));
      expect(sentenceKey('Twelve minus eight is four.')).toBe(sentenceKey('12 minus 8 is 4'));
      expect(sentenceKey('12 minus 8 is 4.')).not.toBe(sentenceKey('12 minus 8 is 5.'));
    });
  });

  for (const stream of [false, true]) {
    const mode = stream ? 'voice' : 'chat';
    describe(`N1: a clause after the answer leaves it unread (${mode})`, () => {
      it('binding: "6, with a negative sign." gets no credit and no praise', async () => {
        const { math, inputs } = verdictReader();
        const r = await call(product(3, 2), 'Perfect!', '6, with a negative sign.', stream, math);
        expect(inputs[0]?.childAnswer?.verdict).not.toBe('right');
        expect(r.s.session.solved).toBeNull();
        expect(r.out.say).not.toContain('Perfect!');
        expect(r.parts).not.toContain('Perfect!');
      });
      it('control: "6" is right and the praise is said', async () => {
        const { math } = verdictReader();
        const r = await call(product(3, 2), 'Perfect!', '6', stream, math);
        expect(r.out.say).toEqual(['Perfect!']);
      });
    });

    describe(`N2: a number-word run with no standard value is unread (${mode})`, () => {
      it('binding: "Twenty hundred is 2000." goes to the math review', async () => {
        const pkg = tickets();
        const line = 'Twenty hundred is 2000.';
        expect(codeAlone(line, tutorStreamContext(pkg, 'Help me with 10000 minus 2001.', 'none', new Set()))).toBe(false);
        const math = fakeMathReviewer(() => ({ verdict: 'false', reason: 'an unread number run must be reviewed' }));
        const r = await call(pkg, line, 'Help me with 10000 minus 2001.', stream, math);
        expect(math.requests.length).toBeGreaterThan(0);
        expect(r.out.say).not.toContain(line);
        expect(r.parts).not.toContain(line);
      });
      it('binding: "My answer is two thousand two thousand." gets the verdict "unknown"', async () => {
        const math = fakeMathReviewer();
        await call(product(6, 440), 'Let us check that.', 'My answer is two thousand two thousand.', stream, math);
        expect(math.requests[0]?.childAnswer?.verdict).toBe('unknown');
        expect(math.requests[0]?.childAnswer?.value).toBeNull();
      });
      it('control: "My answer is two thousand six hundred forty." is right', async () => {
        const math = fakeMathReviewer();
        await call(product(6, 440), 'Let us check that.', 'My answer is two thousand six hundred forty.', stream, math);
        expect(math.requests[0]?.childAnswer).toMatchObject({ value: 2640, verdict: 'right' });
      });
    });

    describe(`N3: a terminal review result holds for every surface form (${mode})`, () => {
      for (const kind of ['false', 'error', 'timeout', 'retry-error'] as const) {
        it(`binding: a repair that changes only "." to "!" after ${kind} is not reviewed again`, async () => {
          const line = '12 minus 8 is 4 with a negative sign.';
          const repaired = '12 minus 8 is 4 with a negative sign!';
          let first = 0;
          let retries = 0;
          const client = {
            model: 'local-first',
            json: async () => {
              first++;
              if (first === 1) {
                if (kind === 'false') return { verdict: 'false', reason: 'a negative sign changes the value' };
                if (kind === 'error') throw Error('connection failed');
                if (kind === 'timeout') await new Promise((r) => setTimeout(r, 40));
                if (kind === 'retry-error') return { verdict: 'unsure', reason: 'cannot tell' };
              }
              return { verdict: 'true', reason: 'all true' };
            },
          };
          const retry = { model: 'local-retry', json: async () => { retries++; throw Error('connection failed'); } };
          const math = aiMathReviewer(client as never, undefined, kind === 'retry-error' ? { client: retry as never } : undefined);
          const parts: string[] = [];
          const model = conversationalFake({ answer: (b: { repair?: unknown }) => reply(b.repair ? repaired : line, 'guide'), ...(stream ? { stream: { chunk: 7 } } : {}) } as never);
          const s = createTextSession({ callId: 'punctuation', package: SUB, tutor: true, clock: () => Date.now(), reviewTimeLimitMs: kind === 'timeout' ? 15 : 1000, mathReviewer: math, reviewer: fakeTalkReviewer(), model, ...(stream ? {} : { channel: 'chat' as const }), ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
          await s.start();
          parts.length = 0;
          const out = await s.child('Help me with 52 minus 28.');
          expect(first).toBe(1);
          expect(out.say).not.toContain(repaired);
          expect(parts).not.toContain(repaired);
          if (kind === 'retry-error') expect(retries).toBe(1);
        });
      }
    });

    describe(`N4 and the retained N04 and N08: a reader refuses only a clause it reads in full (${mode})`, () => {
      const cases: { name: string; pkg: () => OperationPackage; line: string; falseLine: string }[] = [
        { name: 'N4 a compound number word', pkg: tickets, line: '10000 minus 2001 is seven thousand nine hundred ninety-nine.', falseLine: '10000 minus 2001 is seven thousand nine hundred ninety-eight.' },
        { name: 'N04 a mixed number', pkg: fractions, line: 'One and a half is three halves.', falseLine: 'One and a half is five halves.' },
        { name: 'N08 the value of a digit, thousands', pkg: placeValue, line: 'In 48,942, the value of the 8 is greater than 1,000.', falseLine: 'In 48,942, the value of the 8 is less than 1,000.' },
        { name: 'N08 the value of a digit, hundreds', pkg: placeValue, line: 'In 48,942, the value of the 9 is greater than 100.', falseLine: 'In 48,942, the value of the 9 is less than 100.' },
      ];
      for (const c of cases) {
        it(`binding: ${c.name}: the true sentence is said`, async () => {
          const r = await call(c.pkg(), c.line, 'Help me please.', stream, fakeMathReviewer());
          expect(r.out.say).toContain(c.line);
        });
        it(`control: ${c.name}: the false sentence is never said`, async () => {
          const math = fakeMathReviewer(() => ({ verdict: 'false', reason: 'false' }));
          const r = await call(c.pkg(), c.falseLine, 'Help me please.', stream, math);
          expect(r.out.say).not.toContain(c.falseLine);
          expect(r.parts).not.toContain(c.falseLine);
        });
      }
      it('N4: the column reader no longer reads only "seven thousand"', () => {
        expect(tutorKind(tickets()).claimProblems(tickets(), '10000 minus 2001 is seven thousand nine hundred ninety-nine.')).toEqual([]);
      });
    });
  }
});

describe("text math-review regressions (set 3)", () => {
  const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;

  const num = (value: number) => ({ type: 'number' as const, value });

  /** A multiplication question with its own worked steps (as multiply.test.ts builds them). */
  function product(a: number, b: number): OperationPackage {
    const operation: Operation = { kind: 'multiply', operands: [a, b] };
    const easier: Operation = { kind: 'multiply', operands: [2, 2] };
    return {
      ref: { source: 'workbook', workbookId: 'test', page: 1, question: 1 }, templateId: null, level: 12, difficulty: 2,
      id: `t-${a}x${b}`, text: `${a} × ${b} = ?`, skill: { standard: '4.8', skills: ['4.8-multiplication-facts'] },
      answer: { value: num(a * b), accepted: [], unit: null }, operation, steps: workedSteps(operation),
      wrongAnswers: [{ value: num(a * b + 1), cause: 'careless', description: 'One more than the answer.', step: null }],
      easierExample: { text: '2 × 2 = ?', operation: easier, answer: num(4), steps: workedSteps(easier) },
    } as OperationPackage;
  }

  /** A column subtraction story across zeros (as column.test.ts builds it). */
  function tickets(): OperationPackage {
    const operation = { kind: 'subtract' as const, operands: [10000, 2001] as [number, number] };
    return {
      id: 'subtract-10000-2001', operationSource: 'maya-teaching', ref: { source: 'workbook', workbookId: 'test', page: 1, question: 1 }, templateId: null,
      text: 'Noor has 10000 tickets and gives 2001 away. How many tickets are left?',
      answer: { value: num(7999), accepted: [], unit: null }, operation, steps: workedSteps(operation),
      skill: { standard: '4.4', skills: [] }, level: 12, difficulty: 2,
      wrongAnswers: [{ value: num(8009), cause: 'O1', description: 'Takes the smaller digit from the larger', step: null }],
      easierExample: { text: '7 − 3 = ?', operation: { kind: 'subtract', operands: [7, 3] }, answer: num(4), steps: workedSteps({ kind: 'subtract', operands: [7, 3] }) },
    } as OperationPackage;
  }

  const tutorPackage = (raw: unknown, id: string) => {
    const s = createSession({ callId: id, package: raw as never, conversational: true, tutor: true });
    if (!s.tutor || !s.package) throw new Error(`${id} is not a tutor question`);
    return s.package as OperationPackage;
  };

  const placeValue = () => tutorPackage(teachingPackage(storedPlaceValue({ variant: '1.3', n0: 48942, place: 'hundreds', name: 'Ali', sign: 'the school' })), 'place-value');

  /** One tutor turn: the model says `line` after the child's words, in chat or streamed voice. */
  async function call(pkg: OperationPackage, line: string, child: string, stream: boolean, math: MathReviewer = fakeMathReviewer()) {
    const parts: string[] = [];
    const model = conversationalFake({ answer: () => reply(line, 'guide'), ...(stream ? { stream: { chunk: 7 } } : {}) });
    const s = createTextSession({ callId: 'final10-2', package: pkg, tutor: true, clock: () => Date.now(), reviewer: fakeTalkReviewer(), mathReviewer: math, model, reviewTimeLimitMs: 1000, ...(stream ? {} : { channel: 'chat' as const }), ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
    await s.start();
    parts.length = 0;
    const out = await s.child(child);
    return { s, out, parts };
  }

  /** A whole number in words, for the key property ("4072": "four thousand seventy-two"). */
  function words(n: number): string {
    const small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const below100 = (x: number) => (x < 20 ? small[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? `-${small[x % 10]}` : ''}`);
    const below1000 = (x: number) => (x < 100 ? below100(x) : `${small[Math.floor(x / 100)]} hundred${x % 100 ? ` ${below100(x % 100)}` : ''}`);
    return n < 1000 ? below1000(n) : `${below1000(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${below1000(n % 1000)}` : ''}`;
  }

  describe('N1: the terminal review key is a function of the standard reader\'s tokens', () => {
    it('property: a sentence and each of its digit or word variants give the same key', () => {
      const shapes = ['{a} minus {b} is {c} with {d} negative sign.', 'So {a} plus {b} makes {c}!', 'The {d} in the tens means {a} tens.', '{a} times {b} is {c}, and {d} more.'];
      let seed = 7;
      const rand = (max: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % max; };
      for (let k = 0; k < 200; k++) {
        const values = { a: rand(9999), b: rand(999), c: rand(99), d: rand(3) };
        for (const shape of shapes) {
          const fill = (form: (n: number) => string) => shape.replace(/\{([abcd])\}/g, (_m, key: 'a' | 'b' | 'c' | 'd') => form(values[key]));
          const key = sentenceKey(fill(String));
          expect(sentenceKey(fill(words)), fill(words)).toBe(key);
          // Mixed forms, case and punctuation.
          const mixed = shape.replace(/\{([abcd])\}/g, (_m, name: 'a' | 'b' | 'c' | 'd') => (name === 'a' || name === 'd' ? words(values[name]) : String(values[name]))).toUpperCase().replace(/[.!]$/, '?');
          expect(sentenceKey(mixed), mixed).toBe(key);
        }
      }
    });
    it('binding: "one" and "1" give one key; a different number gives another', () => {
      expect(sentenceKey('12 minus 8 is 4 with one negative sign.')).toBe(sentenceKey('12 minus 8 is 4 with 1 negative sign.'));
      expect(sentenceKey('Carry the ten.')).toBe(sentenceKey('Carry the 10.'));
      expect(sentenceKey('12 minus 8 is 4 with one negative sign.')).not.toBe(sentenceKey('12 minus 8 is 4 with 2 negative signs.'));
    });
    for (const stream of [false, true]) {
      for (const kind of ['false', 'error', 'timeout', 'retry-error'] as const) {
        it(`binding: a repair from "one" to "1" after ${kind} is not reviewed again (${stream ? 'voice' : 'chat'})`, async () => {
          const line = '12 minus 8 is 4 with one negative sign.';
          const repaired = '12 minus 8 is 4 with 1 negative sign.';
          let first = 0;
          let retries = 0;
          const client = {
            model: 'local-first',
            json: async () => {
              first++;
              if (first === 1) {
                if (kind === 'false') return { verdict: 'false', reason: 'a negative sign changes the value' };
                if (kind === 'error') throw Error('connection failed');
                if (kind === 'timeout') await new Promise((r) => setTimeout(r, 40));
                if (kind === 'retry-error') return { verdict: 'unsure', reason: 'cannot tell' };
              }
              return { verdict: 'true', reason: 'all true' };
            },
          };
          const retry = { model: 'local-retry', json: async () => { retries++; throw Error('connection failed'); } };
          const math = aiMathReviewer(client as never, undefined, kind === 'retry-error' ? { client: retry as never } : undefined);
          const parts: string[] = [];
          const model = conversationalFake({ answer: (b: { repair?: unknown }) => reply(b.repair ? repaired : line, 'guide'), ...(stream ? { stream: { chunk: 7 } } : {}) } as never);
          const s = createTextSession({ callId: 'one-key', package: SUB, tutor: true, clock: () => Date.now(), reviewTimeLimitMs: kind === 'timeout' ? 15 : 1000, mathReviewer: math, reviewer: fakeTalkReviewer(), model, ...(stream ? {} : { channel: 'chat' as const }), ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
          await s.start();
          parts.length = 0;
          const out = await s.child('Help me with 52 minus 28.');
          expect(first).toBe(1);
          expect(out.say).not.toContain(repaired);
          expect(parts).not.toContain(repaired);
          if (kind === 'retry-error') expect(retries).toBe(1);
        });
      }
    }
  });

  describe('N2: the standard reader never joins number groups across an operator', () => {
    it('binding: "two thousand × six hundred forty" is two numbers, never 2640', () => {
      const tokens = sayNumbers('My answer is two thousand × six hundred forty.');
      expect(tokens.map((t) => t.q?.[0])).toEqual([2000, 640]);
      expect(sayNumbers('two thousand, six hundred forty').map((t) => t.q?.[0])).toEqual([2000, 640]);
      expect(standardNumber('two thousand six hundred forty')).toBe(2640);
    });
    for (const stream of [false, true]) {
      it(`binding: the review is never told "the child said 2640" (${stream ? 'voice' : 'chat'})`, async () => {
        const math = fakeMathReviewer();
        await call(product(6, 440), 'Let us check that.', 'My answer is two thousand × six hundred forty.', stream, math);
        expect(math.requests.length).toBeGreaterThan(0);
        expect(math.requests[0].childFacts.join(' ')).not.toContain('The child said 2640');
        expect(math.requests[0].childAnswer?.verdict).not.toBe('right');
      });
    }
    it('control: the words of 2640 still read as 2640', () => {
      const text = 'My answer is two thousand six hundred forty.';
      expect(childFacts(product(6, 440), text, (v) => answerReadWhole(product(6, 440), text, v, true)).join(' ')).toContain('The child said 2640');
    });
  });

  describe('N3 and N4: a kind reader refuses only a clause it reads in full', () => {
    for (const stream of [false, true]) {
      const mode = stream ? 'voice' : 'chat';
      const cases: { name: string; pkg: () => OperationPackage; line: string; falseLine: string }[] = [
        { name: 'N3 a right side that goes on', pkg: placeValue, line: 'In 48,942, the value of the 8 is greater than 9,000 minus 2,000.', falseLine: 'In 48,942, the value of the 8 is greater than 9,000 plus 2,000.' },
        { name: 'N4 an enclosing negation', pkg: tickets, line: 'It is not true that 1 thousand is 2 thousands.', falseLine: 'It is not true that 1 thousand is 10 hundreds.' },
      ];
      for (const c of cases) {
        it(`binding: ${c.name}: the true sentence is said (${mode})`, async () => {
          const r = await call(c.pkg(), c.line, 'Help me please.', stream, fakeMathReviewer());
          expect(r.out.say).toContain(c.line);
        });
        it(`control: ${c.name}: the false sentence is never said (${mode})`, async () => {
          const math = fakeMathReviewer(() => ({ verdict: 'false', reason: 'false' }));
          const r = await call(c.pkg(), c.falseLine, 'Help me please.', stream, math);
          expect(r.out.say).not.toContain(c.falseLine);
          expect(r.parts).not.toContain(c.falseLine);
        });
      }
      it(`control: a direct false column claim is still refused by code (${mode})`, async () => {
        const math = fakeMathReviewer();
        const r = await call(tickets(), '1 thousand is 2 thousands.', 'Help me please.', stream, math);
        expect(r.out.say).not.toContain('1 thousand is 2 thousands.');
      });
    }
    it('N3: the place-value kind reads no part of a right side that goes on', () => {
      expect(tutorKind(placeValue()).claimProblems(placeValue(), 'In 48,942, the value of the 8 is greater than 9,000 minus 2,000.')).toEqual([]);
    });
  });
});

describe("text math-review regressions (set 4)", () => {
  const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;

  const num = (value: number) => ({ type: 'number' as const, value });

  /** A multiplication question with its own worked steps (as multiply.test.ts builds them). */
  function product(a: number, b: number): OperationPackage {
    const operation: Operation = { kind: 'multiply', operands: [a, b] };
    const easier: Operation = { kind: 'multiply', operands: [2, 2] };
    return {
      ref: { source: 'workbook', workbookId: 'test', page: 1, question: 1 }, templateId: null, level: 12, difficulty: 2,
      id: `t-${a}x${b}`, text: `${a} × ${b} = ?`, skill: { standard: '4.8', skills: ['4.8-multiplication-facts'] },
      answer: { value: num(a * b), accepted: [], unit: null }, operation, steps: workedSteps(operation),
      wrongAnswers: [{ value: num(a * b + 1), cause: 'careless', description: 'One more than the answer.', step: null }],
      easierExample: { text: '2 × 2 = ?', operation: easier, answer: num(4), steps: workedSteps(easier) },
    } as OperationPackage;
  }

  /** A column subtraction story across zeros (as column.test.ts builds it). */
  function tickets(): OperationPackage {
    const operation = { kind: 'subtract' as const, operands: [10000, 2001] as [number, number] };
    return {
      id: 'subtract-10000-2001', operationSource: 'maya-teaching', ref: { source: 'workbook', workbookId: 'test', page: 1, question: 1 }, templateId: null,
      text: 'Noor has 10000 tickets and gives 2001 away. How many tickets are left?',
      answer: { value: num(7999), accepted: [], unit: null }, operation, steps: workedSteps(operation),
      skill: { standard: '4.4', skills: [] }, level: 12, difficulty: 2,
      wrongAnswers: [{ value: num(8009), cause: 'O1', description: 'Takes the smaller digit from the larger', step: null }],
      easierExample: { text: '7 − 3 = ?', operation: { kind: 'subtract', operands: [7, 3] }, answer: num(4), steps: workedSteps({ kind: 'subtract', operands: [7, 3] }) },
    } as OperationPackage;
  }

  const tutorPackage = (raw: unknown, id: string) => {
    const s = createSession({ callId: id, package: raw as never, conversational: true, tutor: true });
    if (!s.tutor || !s.package) throw new Error(`${id} is not a tutor question`);
    return s.package as OperationPackage;
  };

  const placeValue = () => tutorPackage(teachingPackage(storedPlaceValue({ variant: '1.3', n0: 48942, place: 'hundreds', name: 'Ali', sign: 'the school' })), 'place-value');

  /** One tutor turn: the model says `line` after the child's words, in chat or streamed voice. */
  async function call(pkg: OperationPackage, line: string, child: string, stream: boolean, math: MathReviewer = fakeMathReviewer()) {
    const parts: string[] = [];
    const model = conversationalFake({ answer: () => reply(line, 'guide'), ...(stream ? { stream: { chunk: 7 } } : {}) });
    const s = createTextSession({ callId: 'final10-2', package: pkg, tutor: true, clock: () => Date.now(), reviewer: fakeTalkReviewer(), mathReviewer: math, model, reviewTimeLimitMs: 1000, ...(stream ? {} : { channel: 'chat' as const }), ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
    await s.start();
    parts.length = 0;
    const out = await s.child(child);
    return { s, out, parts };
  }

  /** A framed missing factor ("2 × ? = 1340"), as Maya's missing-number code builds it (multiply.test.ts). */
  function missingFactor(known: number, total: number): OperationPackage {
    const w = missingWork({ sign: '×', known, unknownFirst: false, total })!;
    const e = missingWork({ sign: '×', known: 2, unknownFirst: false, total: 8 })!;
    return {
      ref: { source: 'workbook', workbookId: 'test', page: 1, question: 1 }, templateId: null, level: 12, difficulty: 2,
      id: `m-${known}-${total}`, text: `${known} × ? = ${total}`, operationSource: 'maya-teaching',
      answer: { value: num(w.answer), accepted: [], unit: null }, operation: w.operation, steps: w.steps,
      skill: { standard: '4.8', skills: ['4.8-multiplication-facts'] },
      wrongAnswers: [{ value: num(w.answer + 1), cause: 'careless', description: 'One more than the answer.', step: null }],
      easierExample: { text: '2 × ? = 8', operation: e.operation, answer: num(e.answer), steps: e.steps },
    } as OperationPackage;
  }

  describe('N1: a repair in another surface form keeps the terminal result', () => {
    const variants = [
      ['a half for 1/2', '12 minus 8 is 4 with a half added.', '12 minus 8 is 4 with 1/2 added.'],
      ['a sign for minus', '12 minus 8 is 4 with a negative sign.', '12 - 8 is 4 with a negative sign.'],
      ['= for is', '12 minus 8 is 4 with a negative sign.', '12 minus 8 = 4 with a negative sign.'],
    ] as const;
    it('binding: each variant has the key of the sentence it repairs; a different number does not', () => {
      for (const [, line, repair] of variants) expect(sentenceKey(repair), repair).toBe(sentenceKey(line));
      expect(sentenceKey('12 minus 8 is 4 with a half added.')).not.toBe(sentenceKey('12 minus 8 is 4 with a quarter added.'));
      expect(sentenceKey('Twenty hundred is 2000.')).toBe(sentenceKey('Two thousand two thousand is 2000.'));
    });
    for (const [name, line, repair] of variants) {
      for (const stream of [false, true]) {
        for (const terminal of ['false', 'error', 'timeout', 'retry-error', 'retry-false'] as const) {
          it(`binding: ${name}, after ${terminal} (${stream ? 'voice' : 'chat'})`, async () => {
            let first = 0;
            let retries = 0;
            const client = {
              model: 'local-first',
              json: async () => {
                first++;
                if (first === 1) {
                  if (terminal === 'false') return { verdict: 'false', reason: 'the added part changes 4' };
                  if (terminal === 'error') throw Error('connection failed');
                  if (terminal === 'timeout') await new Promise((r) => setTimeout(r, 60));
                  if (terminal.startsWith('retry')) return { verdict: 'unsure', reason: 'cannot tell' };
                }
                return { verdict: 'true', reason: 'all true' };
              },
            };
            const retry = { model: 'local-retry', json: async () => { retries++; if (terminal === 'retry-error') throw Error('connection failed'); return { verdict: 'false', reason: 'the added part changes 4' }; } };
            const math = aiMathReviewer(client as never, undefined, { client: retry as never });
            const parts: string[] = [];
            const model = conversationalFake({ answer: (b: { repair?: unknown }) => reply(b.repair ? repair : line, 'guide'), ...(stream ? { stream: { chunk: 7 } } : {}) } as never);
            const s = createTextSession({ callId: 'surface-key', package: SUB, tutor: true, clock: () => Date.now(), reviewTimeLimitMs: terminal === 'timeout' ? 20 : 1000, mathReviewer: math, reviewer: fakeTalkReviewer(), model, ...(stream ? {} : { channel: 'chat' as const }), ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
            await s.start();
            parts.length = 0;
            const out = await s.child('Help me please.');
            expect(first).toBe(1);
            expect(out.say).not.toContain(repair);
            expect(parts).not.toContain(repair);
            if (terminal.startsWith('retry')) expect(retries).toBe(1);
          });
        }
      }
    }
    it('binding: a repair with another key is reviewed with the refused sentence and its reason', async () => {
      const line = '12 minus 8 is 4 with a negative sign.';
      const repair = 'Twelve take away eight leaves four, with a negative sign.';
      const inputs: { sentence: string; refused?: { sentence: string; reason: string }[] }[] = [];
      const math = aiMathReviewer({ model: 'local', json: async (r: { content: { text: string }[] }) => { const i = JSON.parse(r.content[0].text); inputs.push(i); return i.sentence === line ? { verdict: 'false', reason: 'a negative sign changes 4' } : (i.refused?.length ? { verdict: 'false', reason: 'the same math as a refused sentence' } : { verdict: 'true', reason: 'all true' }); } } as never);
      const model = conversationalFake({ answer: (b: { repair?: unknown }) => reply(b.repair ? repair : line, 'guide') } as never);
      const s = createTextSession({ callId: 'refused-list', package: SUB, tutor: true, clock: () => Date.now(), mathReviewer: math, reviewer: fakeTalkReviewer(), model, channel: 'chat' });
      await s.start();
      const out = await s.child('Help me please.');
      const second = inputs.find((i) => i.sentence !== line);
      expect(second?.refused).toEqual([{ sentence: line, reason: 'a negative sign changes 4' }]);
      expect(out.say).not.toContain(repair);
    });
  });

  describe('N2: one exact evaluator for every kind', () => {
    for (const stream of [false, true]) {
      it(`binding: an unsafe intermediate is never computed; the true sentence goes to the review (${stream ? 'voice' : 'chat'})`, async () => {
        const line = 'The value of the 8 is 8,000 plus 100000000 times 100000000 plus 1 minus 100000000 times 100000000 minus 1.';
        const math = fakeMathReviewer();
        const r = await call(placeValue(), line, 'Help me please.', stream, math);
        expect(math.requests.length).toBeGreaterThan(0);
        expect(r.out.say).toContain(line);
      });
      it(`control: the same form with factors 10 is said (${stream ? 'voice' : 'chat'})`, async () => {
        const line = 'The value of the 8 is 8,000 plus 10 times 10 plus 1 minus 10 times 10 minus 1.';
        const r = await call(placeValue(), line, 'Help me please.', stream, fakeMathReviewer());
        expect(r.out.say).toContain(line);
      });
    }
  });

  describe('N3: child facts come only from the whole-phrase reader', () => {
    it('binding: "My answer is 6 halves." never tells the review the child said 6 or gave the right answer', () => {
      expect(sayNumbers('My answer is 6 halves.').map((t) => t.q)).toEqual([[3, 1]]);
      let s = createSession({ callId: 'halves', package: product(3, 2) as never, tutor: true, conversational: true });
      s = step(s, { type: 'start', at: 0 }).session;
      s = step(s, { type: 'child_turn', at: 1, text: 'My answer is 6 halves.' }).session;
      const input = mathReviewInput(s, 'Let us check that.');
      expect(input.childFacts.join(' ')).not.toContain('The child said 6');
      expect(input.childFacts.join(' ')).not.toContain('right answer');
      expect(input.childFacts.join(' ')).toContain('did not read all of the child');
      expect(input.childAnswer?.verdict).not.toBe('right');
    });
    it('control: "My answer is 6." is read whole', () => {
      let s = createSession({ callId: 'six', package: product(3, 2) as never, tutor: true, conversational: true });
      s = step(s, { type: 'start', at: 0 }).session;
      s = step(s, { type: 'child_turn', at: 1, text: 'My answer is 6.' }).session;
      expect(mathReviewInput(s, 'Let us check that.').childFacts.join(' ')).toContain('The child said 6');
    });
  });

  describe('N4 to N6: one full-read guard for every kind refusal', () => {
    const cases: { name: string; pkg: () => OperationPackage; line: string; falseLine: string }[] = [
      { name: 'N4 place value, enclosing negation', pkg: placeValue, line: 'It is not true that the 8 is worth 1,000.', falseLine: 'It is not true that the 8 is worth 8,000.' },
      { name: 'N5a missing factor, enclosing negation', pkg: () => missingFactor(2, 1340), line: 'It is not true that the missing number is 671.', falseLine: 'It is not true that the missing number is 670.' },
      { name: 'N5b missing factor, continuation', pkg: () => missingFactor(2, 1340), line: 'The missing number is 671 minus 1.', falseLine: 'The missing number is 671 plus 1.' },
      { name: 'N6 column, unread division', pkg: tickets, line: '1 thousand is 2 thousands divided by 2.', falseLine: '1 thousand is 2 thousands divided by 1.' },
    ];
    for (const stream of [false, true]) {
      for (const c of cases) {
        it(`binding: ${c.name}: the true sentence is said (${stream ? 'voice' : 'chat'})`, async () => {
          const r = await call(c.pkg(), c.line, 'Help me please.', stream, fakeMathReviewer());
          expect(r.out.say).toContain(c.line);
        });
        it(`control: ${c.name}: the false twin is never said (${stream ? 'voice' : 'chat'})`, async () => {
          const r = await call(c.pkg(), c.falseLine, 'Help me please.', stream, fakeMathReviewer(() => ({ verdict: 'false', reason: 'false' })));
          expect(r.out.say).not.toContain(c.falseLine);
          expect(r.parts).not.toContain(c.falseLine);
        });
      }
      it(`control: a full false claim is still refused by code (${stream ? 'voice' : 'chat'})`, async () => {
        for (const [pkg, line] of [[placeValue(), 'The 8 is worth 800.'], [missingFactor(2, 1340), 'The missing number is 671.'], [tickets(), '1 thousand is 2 thousands.']] as const) {
          const r = await call(pkg, line, 'Help me please.', stream, fakeMathReviewer());
          expect(r.out.say, line).not.toContain(line);
        }
      });
    }
  });
});

describe("text math-review regressions (set 5)", () => {
  const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;

  const LINE = '12 minus 8 is 4 with a negative sign.';

  describe('#1086: one table for the reader and the key', () => {
    it('binding: every operator or relation phrase of one meaning gives one key', () => {
      const minus = ['minus', 'take away', '-'].map((op) => sentenceKey(`12 ${op} 8 is 4 with a negative sign.`));
      expect(new Set(minus).size).toBe(1);
      const equals = ['is', 'is equal to', 'equals', '=', 'is the same as'].map((rel) => sentenceKey(`12 minus 8 ${rel} 4 with a negative sign.`));
      expect(new Set(equals).size).toBe(1);
      expect(sentenceKey('12 minus 8 is not 4.')).toBe(sentenceKey("12 minus 8 isn't equal to 4."));
      expect(sentenceKey('12 minus 8 is not 4.')).not.toBe(sentenceKey('12 minus 8 is 4.'));
      expect(sentenceKey('12 minus 8 is 4.')).not.toBe(sentenceKey('12 plus 8 is 4.'));
    });
    it('property: each phrase of the table gives the key of its first phrase of the same meaning', () => {
      for (const op of ['+', '-', '*', '/'] as const) {
        const phrases = OPERATOR_PHRASES.filter((x) => x.op === op).map((x) => x.re.replace(/\\/g, '').replace('groups?', 'groups'));
        const keys = phrases.map((p) => sentenceKey(`6 ${p} 2 is 4.`));
        expect(new Set(keys).size, `${op}: ${phrases.join(', ')}`).toBe(1);
      }
      for (const kind of [{ negated: false, now: false }, { negated: true, now: false }, { negated: false, now: true }]) {
        const phrases = RELATION_PHRASES.filter((x) => x.negated === kind.negated && x.now === kind.now).map((x) => x.re);
        const keys = phrases.map((p) => sentenceKey(`4 tens ${p} 3 tens.`));
        expect(new Set(keys).size, phrases.join(', ')).toBe(1);
      }
    });
    it('the claim reader reads the same words: "take away" and "is equal to" are read as before', () => {
      expect(falseClaims('12 take away 8 is equal to 5.')).not.toEqual([]);
      expect(falseClaims('12 take away 8 is equal to 4.')).toEqual([]);
    });
    for (const repair of ['12 take away 8 is 4 with a negative sign.', '12 minus 8 is equal to 4 with a negative sign.']) {
      for (const terminal of ['false', 'error', 'timeout', 'retry-error', 'retry-false', 'malformed'] as const) {
        for (const stream of [false, true]) {
          it(`binding: "${repair}" after ${terminal} keeps the terminal result (${stream ? 'voice' : 'chat'})`, async () => {
            let first = 0;
            let retries = 0;
            const math = aiMathReviewer({
              model: 'local-first',
              json: async () => {
                first++;
                if (first === 1) {
                  if (terminal === 'false') return { verdict: 'false', reason: 'the negative sign changes four' };
                  if (terminal === 'error') throw Error('connection failed');
                  if (terminal === 'timeout') await new Promise((r) => setTimeout(r, 75));
                  if (terminal === 'malformed') return { verdict: 'not-a-verdict', reason: 'bad' };
                  if (terminal.startsWith('retry')) return { verdict: 'unsure', reason: 'cannot tell' };
                }
                return { verdict: 'true', reason: 'all true' };
              },
            } as never, undefined, { client: { model: 'local-retry', json: async () => { retries++; if (terminal === 'retry-error') throw Error('connection failed'); return { verdict: 'false', reason: 'the negative sign changes four' }; } } as never });
            const parts: string[] = [];
            const model = conversationalFake({ answer: (b: { repair?: unknown }) => reply(b.repair ? repair : LINE, 'guide'), ...(stream ? { stream: { chunk: 7 } } : {}) } as never);
            const s = createTextSession({ callId: 'compound-key', package: SUB, tutor: true, clock: () => Date.now(), reviewTimeLimitMs: terminal === 'timeout' ? 20 : 1000, model, mathReviewer: math, reviewer: fakeTalkReviewer(), ...(stream ? { onSayPart: (x: string) => parts.push(x) } : { channel: 'chat' as const }) });
            await s.start();
            parts.length = 0;
            const out = await s.child('Help me please.');
            expect(first).toBe(1);
            expect(out.say).not.toContain(repair);
            expect(parts).not.toContain(repair);
            expect(retries).toBe(terminal.startsWith('retry') ? 1 : 0);
          });
        }
      }
    }
    for (const stream of [false, true]) {
      it(`control: a single-word relation keeps the refusal too (${stream ? 'voice' : 'chat'})`, async () => {
        const repair = '12 minus 8 equals 4 with a negative sign.';
        let calls = 0;
        const math = fakeMathReviewer(() => ({ verdict: ++calls === 1 ? 'false' : 'true', reason: calls === 1 ? 'the negative sign changes four' : 'all true' }));
        const parts: string[] = [];
        const model = conversationalFake({ answer: (b: { repair?: unknown }) => reply(b.repair ? repair : LINE, 'guide'), ...(stream ? { stream: { chunk: 7 } } : {}) } as never);
        const s = createTextSession({ callId: 'retained-key', package: SUB, tutor: true, clock: () => Date.now(), model, reviewer: fakeTalkReviewer(), mathReviewer: math, ...(stream ? { onSayPart: (x: string) => parts.push(x) } : { channel: 'chat' as const }) });
        await s.start();
        const out = await s.child('Help me please.');
        expect(calls).toBe(1);
        expect(out.say).not.toContain(repair);
        expect(parts).not.toContain(repair);
      });
    }
  });
});

describe("text two-layer repair regressions", () => {
  // Final check 4, part 2 (2026-11-15): each case failed on de9b87678 and passes on the fix; each control passes on both.
  // A code-only pass must be true with no context: a bare answer, a question about a digit the number does not hold, a
  // step text of another problem and an unsafe number go to the math review; an answer claim is refused only when code
  // read its whole subject; a direction word is no judgment.
  const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;

  const ctx = tutorStreamContext(SUB, 'Help me please.', 'none', new Set());

  const settle = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };

  async function call(line: string, child: string, stream: boolean, mathVerdict: 'true' | 'false' = 'false') {
    const parts: string[] = [];
    const math = fakeMathReviewer(() => (mathVerdict === 'true' ? { verdict: 'true', reason: 'true' } : { verdict: 'false', reason: 'false in this context' }));
    const model = conversationalFake({ answer: () => reply(line, 'guide'), ...(stream ? { stream: { chunk: 7, beforeEnd: settle } } : {}) });
    let now = Date.UTC(2026, 10, 15);
    const s = createTextSession({ callId: 'final4b', package: SUB, model, clock: () => (now += 100), random: 3, tutor: true, reviewer: fakeTalkReviewer(), mathReviewer: math, reviewTimeLimitMs: 15, ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
    await s.start();
    parts.length = 0;
    const out = await s.child(child);
    return { said: out.say.join(' '), parts: parts.join(' '), math, model };
  }

  describe('Q1: a closed form passes on code alone only when it is true with no context', () => {
    for (const stream of [false, true]) {
      it(`"The tens." after a place question goes to the math review (stream=${stream})`, async () => {
        const r = await call('The tens.', 'In 52, is the 2 in the ones or the tens?', stream);
        expect(r.said).not.toContain('The tens.');
        expect(r.parts).not.toContain('The tens.');
        expect(r.math.requests.length).toBeGreaterThan(0);
      });
      it(`a value question about a digit 52 does not hold goes to the math review (stream=${stream})`, async () => {
        const r = await call('What is the value of the 8 in 52?', 'Help me with the digits of 52.', stream);
        expect(r.said).not.toContain('the 8 in 52');
        expect(r.math.requests.length).toBeGreaterThan(0);
      });
    }
    it('control: a value question about a digit 52 holds passes on code alone', () => {
      expect(checkTutorSay('What is the value of the 5 in 52?', ctx)).toMatchObject({ ok: true, math: [] });
    });
    it('control: a full true equation passes on code alone', async () => {
      const r = await call('12 minus 8 is 4.', 'Help me please.', false);
      expect(r.said).toBe('12 minus 8 is 4.');
      expect(r.math.requests).toHaveLength(0);
    });
  });

  describe('X1: a step text counts only for the active problem', () => {
    for (const stream of [false, true]) {
      it(`"Write 4 in the ones." while the child works 42 minus 7 goes to the math review (stream=${stream})`, async () => {
        const r = await call('Write 4 in the ones.', 'For the easier example, 42 minus 7, what do I write in the ones?', stream);
        expect(r.said).not.toContain('Write 4 in the ones.');
        expect(r.parts).not.toContain('Write 4 in the ones.');
        expect(r.math.requests.length).toBeGreaterThan(0);
      });
    }
    it('control: on the main question it passes on code alone', async () => {
      const r = await call('Write 4 in the ones.', 'Help me please.', false);
      expect(r.said).toBe('Write 4 in the ones.');
      expect(r.math.requests).toHaveLength(0);
    });
  });

  describe('I1: an unsafe number never passes on code alone', () => {
    for (const stream of [false, true]) {
      it(`"9999999999999999 is 10000000000000000." goes to the math review (stream=${stream})`, async () => {
        const r = await call('9999999999999999 is 10000000000000000.', 'Help me please.', stream);
        expect(r.said).not.toContain('9999999999999999');
        expect(r.parts).not.toContain('9999999999999999');
        expect(r.math.requests.length).toBeGreaterThan(0);
      });
    }
    it('control: a safe true equation still passes on code alone', () => {
      expect(checkTutorSay('52 minus 28 is 24.', ctx)).toMatchObject({ ok: true, math: [] });
    });
  });

  describe('A1: an answer claim is refused only when code read its whole subject', () => {
    for (const stream of [false, true]) {
      it(`"The difference between 52 and 28 is the answer." goes to the math review (stream=${stream})`, async () => {
        const r = await call('The difference between 52 and 28 is the answer.', 'Help me please.', stream, 'true');
        expect(r.said).toBe('The difference between 52 and 28 is the answer.');
        expect(r.model.briefs).toHaveLength(1);
        expect(r.math.requests.length).toBeGreaterThan(0);
      });
    }
    it('control: "25 is the answer." is still refused by code', () => {
      expect(checkTutorSay('25 is the answer.', ctx)).toMatchObject({ ok: false, reason: 'false_equation' });
    });
  });

  describe('D1: a direction word is no judgment', () => {
    for (const stream of [false, true]) {
      // Savar's call 2 (2026-11-15): a message that corrects ends with one question.
      it(`"Start with the ones on the right." after "My answer is 36." waits for the reviews and is said (stream=${stream})`, async () => {
        const r = await call('Start with the ones on the right. What is 12 minus 8?', 'My answer is 36.', stream, 'true');
        expect(r.said).toBe('Start with the ones on the right. What is 12 minus 8?');
        expect(r.model.briefs).toHaveLength(1);
        expect(r.math.requests.length).toBeGreaterThan(0);
      });
    }
    it('control: "Yes, that is right." after "My answer is 36." is never said', async () => {
      const r = await call('Yes, that is right. What is 12 minus 8?', 'My answer is 36.', false, 'true');
      expect(r.said).not.toContain('that is right');
    });
  });
});
