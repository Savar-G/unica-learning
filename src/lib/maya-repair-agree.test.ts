import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { MathReviewInput, MathReviewResult } from "@/lib/maya";
import { agreesWithFact, createSession, mathReviewInput, step } from "@/lib/maya/session";
import { agreementClause, checkTutorSay, childAnswerCandidate, tooSmallProblems } from "@/lib/maya/tutor";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession } from "@/lib/maya-text";
import { checkTrace, type MayaTrace } from "@/lib/maya-trace";
import { operationResult, workedSteps, type OperationPackage } from "@/lib/question-package";

// #1072 (2026-11-15): production chat call 1b428d5b, 83 − 34, the child said "I don't get 3 minus 4". Maya's good
// teaching message held "You're right, 3 ones is too small to take 4 ones, ...". The math review refused it (a verdict
// while code's verdict was unknown), and no repair ran: the model took 3,128 ms and the review 2,804 ms of the 6,000 ms
// turn. Code's plain line went out with no teaching. Fake models, fake reviews; the budgets run on the real clock.

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const op = { kind: "subtract" as const, operands: [83, 34] as [number, number] };
const P83 = { ...SUB, id: "subtract-83-34", text: "83 − 34 = ?", operation: op, answer: { value: operationResult(op), accepted: [], unit: null }, steps: workedSteps(op) } as OperationPackage;
const T0 = Date.UTC(2026, 10, 15, 18, 43, 0);
const TRUE: MathReviewResult = { verdict: "true", reason: "all true" };
const FALSE: MathReviewResult = { verdict: "false", reason: "the judgment is false" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const AGREE = "You're right, 3 ones is too small to take 4 ones, so we borrow: we trade 1 ten for 10 ones.";
const PRODUCTION = `What is 83 in tens and ones? It is 8 tens and 3 ones. ${AGREE} Then 3 ones become 13 ones. What is 13 minus 4?`;

/** A math reviewer that acts as the real one did: a judgment sentence is "true" only as an agreement with a fact. */
const realLike = (judged: (s: string) => boolean = (s) => /^you're right/i.test(s)) => fakeMathReviewer((input) => (judged(input.sentence) ? (input.agreement ? TRUE : FALSE) : TRUE));

function call(pkg: OperationPackage, says: (call: number) => string | Promise<string>, opts: { math?: ReturnType<typeof fakeMathReviewer>; stream?: boolean; turnBudgetMs?: number; repairBudgetMs?: number; reviewTimeLimitMs?: number } = {}) {
  let now = T0;
  const parts: string[] = [];
  const math = opts.math ?? realLike();
  const model = conversationalFake({ answer: async (_brief, n) => reply(await says(n), "guide") });
  const session = createTextSession({
    callId: "repair-agree", package: pkg, model, clock: () => (now += 100), random: 3, tutor: true,
    reviewTimeLimitMs: opts.reviewTimeLimitMs ?? 2_000, turnBudgetMs: opts.turnBudgetMs ?? 60_000,
    ...(opts.repairBudgetMs !== undefined ? { repairBudgetMs: opts.repairBudgetMs } : {}),
    reviewer: fakeTalkReviewer(), mathReviewer: math,
    ...(opts.stream ? { onSayPart: (x: string) => parts.push(x) } : {}),
  });
  return { session, parts, model, math };
}

/** What the child heard: with the voice hooks every sentence goes through onSayPart (streamed or after the check). */
const heard = (parts: string[], say: string[]) => (parts.length ? parts : say).join(" ");
const refusals = (trace: MayaTrace) => trace.turns.flatMap((t) => (t.kind === "maya" ? t.attempts.flatMap((a) => (a.refusal ? [a.refusal] : [])) : []));

describe("agreeing with a true fact the child stated (#1072 part b)", () => {
  it.each([false, true])("the production case: the teaching reaches the child, with no repair (stream %s)", async (stream) => {
    const { session, parts, model, math } = call(P83, () => PRODUCTION, { stream });
    await session.start();
    parts.length = 0;
    const out = await session.child("I don't get 3 minus 4");
    expect(heard(parts, out.say)).toBe(PRODUCTION);
    expect(out.say.join(" ")).toBe(PRODUCTION);
    expect(model.briefs).toHaveLength(1);
    const input = math.requests.find((r) => r.sentence === AGREE)!;
    expect(input.agreement).toBe(true);
    expect(input.lastTurns.child).toBe("I don't get 3 minus 4");
    const trace = await session.finish({ reason: "child_stopped" });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    expect(refusals(trace)).toEqual([]);
  });

  it("\"You're right that 2 is too small to take 8 away\" on 52 − 28 after \"I can't do 2 minus 8\"", async () => {
    const say = "You're right that 2 is too small to take 8 away. Trade 1 ten for 10 ones. What is 12 minus 8?";
    const { session, model, math } = call(SUB, () => say);
    await session.start();
    const out = await session.child("I can't do 2 minus 8");
    expect(out.say.join(" ")).toBe(say);
    expect(model.briefs).toHaveLength(1);
    expect(math.requests.find((r) => r.sentence.startsWith("You're right"))?.agreement).toBe(true);
  });

  it("reads the clause, the candidate and the false comparison as the rules say", () => {
    expect(agreementClause(AGREE)).toBe("3 ones is too small to take 4 ones, so we borrow: we trade 1 ten for 10 ones");
    expect(agreementClause("You're right that 2 is too small to take 8 away.")).toBe("2 is too small to take 8 away");
    // A bare judgment is always a verdict; so is a clause that holds another judgment word, or a question.
    for (const bare of ["You're right.", "Yes!", "You're right!", "Exactly.", "You're right, good job.", "{name}, you're right.", "Right, is it 12?"]) expect(agreementClause(bare)).toBeNull();
    // Review of #1074 (P1): the turn is no candidate only when the closed step-request reader accepts the WHOLE turn.
    for (const none of ["I don't get 3 minus 4", "I can't do 2 minus 8", "I don't know how to do thirteen take away four", "I cannot do 2 minus 8.", "Um, I'm stuck on 12 minus 8.", "How do I do 13 minus 4?", "I can't do two minus eight"]) expect(childAnswerCandidate(none), none).toBe(false);
    for (const some of ["is it 51?", "It's 49.", "3 is smaller than 4", "3 minus 4 is 1", "Is it 3 minus 4?", "yes", "I think 7", "I got 13 minus 4", "I don't get forty nine", "help",
      "My final answer: twelve minus eight.", "My final answer: 12 minus 8.", "My answer is: 12 minus 8.", "My answer: 12 minus 8.", "I think 12 minus 8.", "12 minus 8.", "I can do 2 minus 8.",
      "My friend said 12 minus 8.", "I don't get 3 minus 4 is 1.", "I can't do 2 minus 8, I wrote 2 minus 8.", "I did 2 minus 8 for the tens.", "I got: 12 minus 8.", "It is 12 minus 8.",
      "I can't do 2 minus 8 for the tens.", "I don't get 3 minus 4. It's 1.", "I don't get 3 minus 4 = 1", "I don't get 3 minus 4 equals 1", "I can't do 1,000 minus 8"]) expect(childAnswerCandidate(some), some).toBe(true);
    expect(tooSmallProblems("You're right that 4 is too small to take 3 away.")).toHaveLength(1);
    expect(tooSmallProblems("You're right that 2 is too small to take 8 away.")).toEqual([]);
    expect(tooSmallProblems("It is not true that 4 is too small to take 3 away.")).toEqual([]);
    expect(tooSmallProblems("4 tens is too small to take 3 ones away.")).toEqual([]);
    // Review of #1074 (P2): refused only when both complete quantities and their places are read in full.
    expect(tooSmallProblems("4 tens is too small to take 3 tens away.")).toHaveLength(1);
    for (const unread of ["12 is too small to take 2 tens away.", "12 is too small to take 8 plus 8 away.", "12 ones is too small to take 2 tens away.", "4 is too small to take 3 tens away.",
      "8 plus 12 is too small to take 3 away.", "Twenty three is too small to take 4 away.", "12 is too small to take twenty three away.", "2.5 is too small to take 1 away.", "4 is too small to take 3 away from 40."]) expect(tooSmallProblems(unread), unread).toEqual([]);
  });

  it("a bare \"You're right.\" with no answer candidate is still a verdict: no agreement goes to the review", () => {
    const s = createSession({ callId: "bare", package: P83, conversational: true, tutor: true });
    const turned = step(step(s, { type: "start", at: T0 }).session, { type: "child_turn", at: T0 + 1, text: "I don't get 3 minus 4" }).session;
    expect(agreesWithFact(turned, "You're right.")).toBe(false);
    expect(agreesWithFact(turned, AGREE)).toBe(true);
    const asked = step(step(s, { type: "start", at: T0 }).session, { type: "child_turn", at: T0 + 1, text: "is it 51?" }).session;
    expect(agreesWithFact(asked, AGREE)).toBe(false);
  });
});

describe("review of #1074 (Sol high), binding", () => {
  const LINE = "You're right, 12 ones is more than 8 ones.";
  /** The review as prompt 7 acts: it trusts code's agreement mark; with no mark it follows the unknown verdict. */
  const v7 = () => fakeMathReviewer((i: MathReviewInput) => (i.sentence !== LINE ? TRUE : i.agreement ? TRUE : FALSE));
  it.each([false, true].flatMap((stream) => ["My final answer: 12 minus 8.", "My final answer: twelve minus eight.", "My answer is: 12 minus 8."].map((child) => [child, stream] as const)))(
    "P1: an offered expression (%s) is an answer candidate: no agreement, and the judgment is never said (stream %s)", async (child, stream) => {
      const { session, parts, math } = call(SUB, () => `${LINE} What is the whole answer?`, { math: v7(), stream });
      await session.start();
      parts.length = 0;
      const out = await session.child(child);
      expect(math.requests.find((r) => r.sentence === LINE)?.agreement).toBeUndefined();
      expect(heard(parts, out.say)).not.toContain(LINE);
    });

  it("P1: a step request with a scope (\"I can't do 2 minus 8 for the tens.\") is read as a candidate (fail closed)", async () => {
    const line = "You're right, 2 ones is too small to take 8 away.";
    const { session, math } = call(SUB, () => `${line} What is 12 minus 8?`, { math: realLike((x) => x === line) });
    await session.start();
    const out = await session.child("I can't do 2 minus 8 for the tens.");
    expect(math.requests.find((r) => r.sentence === line)?.agreement).toBeUndefined();
    expect(out.say.join(" ")).not.toContain(line);
  });

  it("P1 controls: no agreement after a result, a choice, another person's number or the easier example", () => {
    for (const child of ["3 minus 4 is 1, I do not get it.", "No.", "I got twenty four.", "My friend said 24.", "For the easier example, 12 minus 8."]) {
      const base = createSession({ callId: "control", package: SUB, conversational: true, tutor: true });
      const s = step(step(base, { type: "start", at: 1000 }).session, { type: "child_turn", at: 1001, text: child }).session;
      expect(mathReviewInput(s, "You're right, 12 minus 8 is 4.").agreement, child).toBeUndefined();
    }
  });

  it.each(["12 is too small to take 2 tens away.", "12 is too small to take 8 plus 8 away."])("P2: a true comparison code cannot read in full (%s) is not refused: it goes to the math review", async (said) => {
    expect(checkTutorSay(said, { stance: "none" })).toMatchObject({ ok: true });
    const { session, math, model } = call(SUB, () => `${said} What is 12 minus 8?`, { math: fakeMathReviewer() });
    await session.start();
    const out = await session.child("I need help");
    expect(out.say.join(" ")).toBe(`${said} What is 12 minus 8?`);
    expect(model.briefs).toHaveLength(1);
    expect(math.requests.map((r) => r.sentence)).toContain(said);
  });

  it.each(["false", "unsure"] as const)("a later clause that praises a result stays blocked by a terminal %s review, and the repair runs", async (verdict) => {
    const line = "You're right, 2 ones is too small to take 8 away, and you solved it.";
    const math = fakeMathReviewer((i: MathReviewInput) => (i.sentence === line ? { verdict, reason: "the later clause praises a result without a right answer" } : TRUE));
    const { session, parts, model } = call(SUB, (n) => (n === 0 ? line : "What is 12 minus 8?"), { math, stream: true });
    await session.start();
    parts.length = 0;
    const out = await session.child("I can't do 2 minus 8.");
    expect(math.requests.find((i) => i.sentence === line)?.agreement).toBe(true);
    expect(heard(parts, out.say)).not.toContain("you solved it");
    expect(math.requests.filter((i) => i.sentence === line)).toHaveLength(1);
    expect(model.briefs).toHaveLength(2);
  });
});

describe("must refuse (#1072 part b, fail closed)", () => {
  const FIX = "What is 12 minus 8?";
  it("\"You're right!\" after a wrong answer: never said", async () => {
    const { session, parts } = call(SUB, (n) => (n === 0 ? `You're right! ${FIX}` : `You're right! ${FIX}`), { math: fakeMathReviewer(), stream: true });
    await session.start();
    parts.length = 0;
    const out = await session.child("It's 36.");
    expect(heard(parts, out.say)).not.toMatch(/you're right/i);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(refusals(trace).map((r) => r.say)).toContain("affirms_wrong");
  });

  it("\"You're right, 3 ones is too small ...\" after \"is it 51?\" (an answer candidate): a verdict, never an agreement, so the review's verdict rule refuses it", async () => {
    // The review as it really acts: a judgment is "true" only as an agreement with a fact (code's verdict is unknown).
    const { session, math } = call(P83, () => PRODUCTION);
    await session.start();
    const out = await session.child("is it 51?");
    expect(out.say.join(" ")).not.toMatch(/you're right/i);
    const input = math.requests.find((r) => r.sentence === AGREE)!;
    expect(input.agreement).toBeUndefined();
    expect(input.childAnswer?.verdict).toBe("unknown");
    const trace = await session.finish({ reason: "child_stopped" });
    expect(refusals(trace).map((r) => r.say)).toContain("math_review");
  });

  it("\"You're right that 4 is too small to take 3 away\" (a false fact): code refuses it, even with a review that says true", async () => {
    const { session } = call(SUB, (n) => (n === 0 ? "You're right that 4 is too small to take 3 away. What is 12 minus 8?" : FIX), { math: fakeMathReviewer() });
    await session.start();
    const out = await session.child("I can't do 2 minus 8");
    expect(out.say.join(" ")).toBe(FIX);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(refusals(trace).map((r) => r.say)).toContain("false_equation");
    expect(checkTutorSay("You're right that 4 is too small to take 3 away.", { stance: "none" })).toMatchObject({ ok: false, reason: "false_equation" });
  });

  it("a false fact code does not read goes to the review; its \"false\" refuses it and the repair is said", async () => {
    const wrong = "You're right, the 2 is in the tens place.";
    const math = fakeMathReviewer((i: MathReviewInput) => (i.sentence === wrong ? FALSE : TRUE));
    const { session, model } = call(SUB, (n) => (n === 0 ? `${wrong} ${FIX}` : `The 2 is in the ones place. ${FIX}`), { math });
    await session.start();
    const out = await session.child("I can't do 2 minus 8");
    expect(out.say.join(" ")).toBe(`The 2 is in the ones place. ${FIX}`);
    expect(model.briefs).toHaveLength(2);
    expect(math.requests.find((r) => r.sentence === wrong)?.agreement).toBe(true);
  });
});

describe("the repair always runs on a tutor teaching turn (#1072 part a)", () => {
  const BAD = "You're right, so we trade.";
  const GOOD = "We trade 1 ten for 10 ones. What is 13 minus 4?";
  it("after a math review refusal, when the first attempt and its review used the whole turn budget", async () => {
    // Production timing, scaled: the model takes most of the turn and the review the rest.
    const math = fakeMathReviewer((i: MathReviewInput) => (i.sentence === BAD ? FALSE : TRUE));
    const slow = Object.assign(Object.create(math), { review: async (i: MathReviewInput, sig: AbortSignal) => { await sleep(120); return math.review(i, sig); } });
    const { session, model } = call(P83, async (n) => { if (n === 0) { await sleep(150); return `${BAD} What is 13 minus 4?`; } return GOOD; }, { math: slow, turnBudgetMs: 200 });
    await session.start();
    const out = await session.child("I don't get 3 minus 4");
    expect(model.briefs).toHaveLength(2);
    expect(out.say.join(" ")).toBe(GOOD);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    expect(trace.counts).toMatchObject({ repairs: 1, fallbacks: 0 });
  });

  it("the repair's own budget bounds it: a repair that never answers ends in code's line", async () => {
    const math = fakeMathReviewer((i: MathReviewInput) => (i.sentence === BAD ? FALSE : TRUE));
    const { session, model } = call(P83, (n) => (n === 0 ? `${BAD} What is 13 minus 4?` : new Promise<string>(() => undefined)), { math, turnBudgetMs: 200, repairBudgetMs: 150 });
    await session.start();
    const started = Date.now();
    const out = await session.child("I don't get 3 minus 4");
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(model.briefs).toHaveLength(2);
    expect(out.say.join(" ")).toMatch(/^Let me say that another way\./);
  });
});
