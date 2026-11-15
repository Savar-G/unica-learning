import { describe, expect, it } from "vitest";
import { checkTutorSay, unreadMath, type MathReviewInput, type MathReviewResult } from "@/lib/maya";
import { createSession } from "@/lib/maya/session";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { fakeMathReviewer, runMathReview } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession } from "@/lib/maya-text";
import { checkTrace } from "@/lib/maya-trace";
import { operationResult, workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";
import { tutorKind } from "@/lib/maya/tutor";

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
    const says = ["Hi Zoe! What is 2 minus 8 in the ones?", "That's 8 minus 2, the other way around."];
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
    const { session, mathReviewer } = call(SUB, ["You can't take 8 from 2, so we use the 12 ones from the trade."], () => ({ verdict: "true", reason: "all true" }));
    await session.start();
    await session.child("I got 36.");
    const input = mathReviewer!.requests[0];
    expect(input.sentence).toBe("You can't take 8 from 2, so we use the 12 ones from the trade.");
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
