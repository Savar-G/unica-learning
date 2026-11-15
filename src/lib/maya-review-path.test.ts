import { describe, expect, it } from "vitest";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession } from "@/lib/maya-text";
import { fakeTalkReviewer, type TalkReviewer } from "@/lib/maya-talk-review";
import type { TalkReviewInput, TalkReviewResult } from "@/lib/maya";
import type { TurnBrief } from "@/lib/maya-model";
import type { OperationPackage } from "@/lib/question-package";

// The review path of a plain math reply (live main 9babc50c): the wrong "12 minus 8 is 5" on the tens step had three
// sentences, each sent to its own external review, all started at once. None was a duplicate: each sentence failed the
// closed math check. A reply that code can check in full (closed forms, true, inside the number rules) needs no review;
// every other sentence keeps its review, and a review is shared only by the same input of the same request.

const PKG = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const T0 = Date.UTC(2026, 10, 14, 16, 0, 0);
const num = (value: number) => ({ type: "number", value });
const ans = (value: number, step: string, verdict: "right" | "wrong" = "right") => ({ value: num(value), step, problem: "target", verdict });
const RIGHT_ONES = reply("Yes, 12 minus 8 is 4. What is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } });
/** The admin reply of the live call, word for word. */
const LIVE = "Hmm, I'm not sure I heard that right. 12 minus 8 was the ones step. Did you say 5?";
const confirm = (say: string) => reply(say, "confirm", { step: "tens", reading: { unclear: true } });
/** The live admin proposal's reading shape: a wrong 5 for the tens, unclear, a math claim. */
const liveConfirm = (say: string) => reply(say, "confirm", { reading: { unclear: true, mathClaim: true, answers: [ans(5, "tens", "wrong")] } });

/**
 * A reviewer whose answers wait for the test: it counts physical requests and resolves them by hand. The closing ask
 * ("Did you say 5?") passes at once, so the same test runs on the source before this repair, which reviews it.
 */
function blockedReviewer() {
  const requests: TalkReviewInput[] = [];
  const pending: { input: TalkReviewInput; resolve: (r: TalkReviewResult) => void }[] = [];
  const reviewer: TalkReviewer = {
    id: "blocked-review",
    promptVersion: "test",
    review: (input) => new Promise<TalkReviewResult>((resolve) => {
      requests.push(structuredClone(input));
      if (/^Did you say 5\?$/.test(input.line)) resolve({ verdict: "pass" });
      else pending.push({ input, resolve });
    }),
  };
  const settle = (line: RegExp, result: TalkReviewResult) => {
    for (const p of pending.filter((x) => line.test(x.input.line))) p.resolve(result);
  };
  return { reviewer, requests, pending, settle };
}
const pass: TalkReviewResult = { verdict: "pass" };
const fail: TalkReviewResult = { verdict: "fail", rules: ["unkind"], reason: "the test fails this line" };
const tick = async (n = 20) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

function call(answer: (b: TurnBrief, n: number) => unknown, options: { stream?: boolean; reviewer?: TalkReviewer; beforeEnd?: () => Promise<void>; onError?: () => void; callId?: string } = {}) {
  let now = T0;
  const parts: string[] = [];
  const reviewer = options.reviewer ?? fakeTalkReviewer();
  const model = conversationalFake({ answer, ...(options.stream ? { stream: { chunk: 5, ...(options.beforeEnd ? { beforeEnd: options.beforeEnd } : {}) } } : {}) });
  const session = createTextSession({
    callId: options.callId ?? "review-path", package: PKG, model, clock: () => (now += 500), random: 3, childName: "Ava", reviewer,
    ...(options.stream ? { onSayPart: (x: string) => parts.push(x) } : {}),
    ...(options.onError ? { onError: options.onError } : {}),
  });
  return { session, model, reviewer, parts };
}
/** The second answer of the ones step: the child said 4 (right), then says `wrong` on the tens step. */
const wrongTurn = (say: string) => (b: TurnBrief) => (b.childTurn === "12 minus 8 is 4." ? RIGHT_ONES : confirm(say));
async function afterRightOnes(c: ReturnType<typeof call>) {
  await c.session.start();
  await c.session.child("12 minus 8 is 4.");
  c.parts.length = 0;
}
const lines = (r: TalkReviewer) => ((r as { requests?: TalkReviewInput[] }).requests ?? []).map((x) => x.line);

describe("a closed plain math reply to a wrong answer needs no external review", () => {
  it.each([false, true])("the live admin reply is said in full with no review request (stream %s)", async (stream) => {
    // Every review fails: a sentence that still went to the review would be dropped.
    const reviewer = fakeTalkReviewer(() => fail);
    const c = call(wrongTurn(LIVE), { stream, reviewer });
    await afterRightOnes(c);
    const out = await c.session.child("12 minus 8 is 5.");
    expect(out.say.join(" ")).toBe(LIVE);
    expect(reviewer.requests).toHaveLength(0);
    if (stream) expect(c.parts).toEqual(["Hmm, I'm not sure I heard that right.", "12 minus 8 was the ones step.", "Did you say 5?"]);
  });
  it.each([
    "Did you say 5 for the answer?",
    "12 minus 8 is the ones step. Did you say 5?",
  ])("other closed forms need no review: %s", async (say) => {
    const reviewer = fakeTalkReviewer(() => fail);
    const c = call(wrongTurn(say), { stream: true, reviewer });
    await afterRightOnes(c);
    const out = await c.session.child("12 minus 8 is 5.");
    expect(out.say.join(" ")).toBe(say);
    expect(reviewer.requests).toHaveLength(0);
  });
  it.each([false, true])("the live reading shape (unclear, a math claim, a wrong tens 5) needs no review either (stream %s)", async (stream) => {
    const reviewer = fakeTalkReviewer(() => fail);
    const c = call((b) => (b.childTurn === "12 minus 8 is 4." ? RIGHT_ONES : liveConfirm(LIVE)), { stream, reviewer });
    await afterRightOnes(c);
    const out = await c.session.child("12 minus 8 is 5.");
    expect(out.say.join(" ")).toBe(LIVE);
    expect(reviewer.requests).toHaveLength(0);
  });
  it("with the live reading shape, a turn that is not plain math keeps every review", async () => {
    const reviewer = fakeTalkReviewer();
    const c = call((b) => (b.childTurn === "12 minus 8 is 4." ? RIGHT_ONES : liveConfirm(LIVE)), { reviewer });
    await afterRightOnes(c);
    await c.session.child("My cat is sad today. 12 minus 8 is 5.");
    expect(lines(reviewer)).toEqual(expect.arrayContaining(["Hmm, I'm not sure I heard that right.", "12 minus 8 was the ones step.", "Did you say 5?"]));
  });
  it("the trace holds the said reply with no unreviewed free talk", async () => {
    const c = call(wrongTurn(LIVE), { reviewer: fakeTalkReviewer(() => fail) });
    await afterRightOnes(c);
    await c.session.child("12 minus 8 is 5.");
    const trace = JSON.stringify(c.session.trace());
    expect(trace).toContain(LIVE);
    expect(trace).not.toContain('"review":"not_run"');
  });
});

describe("strict negative controls: near-closed sentences keep their review", () => {
  // Each control sentence is outside the closed forms by its form or its truth. The outcome is pinned per mode: "reviewed"
  // (it went to the review, and with a passing review it may be said) or "refused" (code's checks kept it out, with no
  // review). It is never said without a review. The same outcomes hold on the source before this repair.
  it.each([
    ["12 minus 8 was the tens step.", "a false place", "reviewed"],
    ["4 minus 2 is the tens step.", "a step that is not done", "refused"],
    ["Did you say 4?", "a number the child did not say", "reviewed"],
    ["Did you say 5 for the tens?", "a suffix outside the closed list", "reviewed"],
    ["I'm not sure you heard that right.", "a hedge outside the fixed list", "reviewed"],
    ["I heard 12 minus 8, but for the tens it's 4 minus 2.", "the desk's wording", "refused"],
    ["You are not good at this.", "a personal statement on a math reply", "reviewed"],
  ])("%s (%s): %s", async (sentence, _why, expected) => {
    for (const stream of [false, true]) {
      const reviewer = fakeTalkReviewer();
      const c = call(wrongTurn(`${sentence} Did you say 5?`), { stream, reviewer });
      await afterRightOnes(c);
      const out = (await c.session.child("12 minus 8 is 5.")).say.join(" ");
      const said = out.includes(sentence) || c.parts.includes(sentence);
      const reviewed = lines(reviewer).includes(sentence);
      expect(said && !reviewed).toBe(false);
      expect({ stream, outcome: reviewed ? "reviewed" : "refused" }).toEqual({ stream, outcome: expected });
    }
  });
  it.each([
    ["Did you say five?", "12 minus 8 is 5."],
    ["Did you say 5?", "I am 5."],
    ["Hmm, I'm not sure I heard that right.", "I am 5."],
  ])("%s after %s is reviewed", async (sentence, child) => {
    const reviewer = fakeTalkReviewer();
    const c = call((b) => (b.childTurn === "12 minus 8 is 4." ? RIGHT_ONES : confirm(sentence === "Did you say 5?" ? sentence : `${sentence} Did you say 5?`)), { stream: true, reviewer });
    await afterRightOnes(c);
    const out = (await c.session.child(child)).say.join(" ");
    const said = out.includes(sentence) || c.parts.includes(sentence);
    expect(said && !lines(reviewer).includes(sentence)).toBe(false);
    expect(lines(reviewer)).toContain(sentence);
  });
  it("the role of a step that is not done yet is reviewed", async () => {
    const reviewer = fakeTalkReviewer();
    const c = call(() => confirm("12 minus 8 was the ones step. Did you say 5?"), { stream: true, reviewer });
    await c.session.start();
    c.parts.length = 0;
    const out = (await c.session.child("12 minus 8 is 5.")).say.join(" ");
    const sentence = "12 minus 8 was the ones step.";
    const said = out.includes(sentence) || c.parts.includes(sentence);
    expect(said && !lines(reviewer).includes(sentence)).toBe(false);
    expect(lines(reviewer)).toContain(sentence);
  });
  it("the hedge is reviewed when the child's turn holds more than plain math", async () => {
    const reviewer = fakeTalkReviewer();
    const c = call((b) => (b.childTurn === "12 minus 8 is 4." ? RIGHT_ONES : confirm(LIVE)), { reviewer });
    await afterRightOnes(c);
    await c.session.child("My cat is sad today. 12 minus 8 is 5.");
    expect(lines(reviewer)).toEqual(expect.arrayContaining(["Hmm, I'm not sure I heard that right.", "Did you say 5?"]));
  });
  it("a reply the model names math is still reviewed sentence by sentence (no bypass by kind)", async () => {
    const reviewer = fakeTalkReviewer(() => fail);
    const c = call(wrongTurn("You are not good at this. Did you say 5?"), { stream: true, reviewer });
    await afterRightOnes(c);
    const out = await c.session.child("12 minus 8 is 5.");
    expect(out.say.join(" ")).not.toMatch(/not good/);
    expect(c.parts.join(" ")).not.toMatch(/not good/);
    expect(lines(reviewer)).toContain("You are not good at this.");
  });
  it("a closed form never carries a secret number: the step's answer is refused by the number rules", async () => {
    const reviewer = fakeTalkReviewer();
    const c = call(wrongTurn("Hmm, I'm not sure I heard that right. 4 minus 2 is 2. Did you say 5?"), { stream: true, reviewer });
    await afterRightOnes(c);
    const out = await c.session.child("12 minus 8 is 5.");
    expect(out.say.join(" ")).not.toMatch(/4 minus 2 is 2/);
    expect(c.parts.join(" ")).not.toMatch(/4 minus 2 is 2/);
  });
});

/** A reply of two sentences that each need a review, on the plain math turn. */
const SOCIAL = "Thanks for sticking with it. That one is a bit tricky for everyone. Did you say 5?";
const ASK = /^Did you say 5\?$/;
/** The review requests of the two social sentences (the closing ask is a closed form after this repair). */
const social = (requests: TalkReviewInput[]) => requests.filter((x) => !ASK.test(x.line));
const S1 = /^Thanks for sticking/;
const S2 = /^That one is a bit tricky/;

describe("needed reviews start in parallel, and each is used once", () => {
  it("streamed: both reviews start while the model still streams; the whole reply reuses them, one request each", async () => {
    const gate = Promise.withResolvers<void>();
    const r = blockedReviewer();
    const c = call(wrongTurn(SOCIAL), { stream: true, reviewer: r.reviewer, beforeEnd: () => gate.promise });
    await afterRightOnes(c);
    const turn = c.session.child("12 minus 8 is 5.");
    await tick();
    // The model has not finished; both sentence reviews are already out, unresolved.
    expect(r.requests.map((x) => x.line).filter((x) => !ASK.test(x))).toEqual(["Thanks for sticking with it.", "That one is a bit tricky for everyone."]);
    expect(c.parts).toEqual([]);
    gate.resolve();
    await tick();
    expect(social(r.requests)).toHaveLength(2);
    expect(c.parts).toEqual([]);
    r.settle(S2, pass);
    await tick();
    expect(c.parts).toEqual([]);
    r.settle(S1, pass);
    const out = await turn;
    expect(out.say.join(" ")).toContain(SOCIAL);
    expect(social(r.requests)).toHaveLength(2);
  });
  it("not streamed: every needed review starts before any answers", async () => {
    const r = blockedReviewer();
    const c = call(wrongTurn(SOCIAL), { reviewer: r.reviewer });
    await afterRightOnes(c);
    const turn = c.session.child("12 minus 8 is 5.");
    await tick(60);
    expect(social(r.requests)).toHaveLength(2);
    r.settle(/./, pass);
    expect((await turn).say.join(" ")).toContain(SOCIAL);
    expect(social(r.requests)).toHaveLength(2);
  });
  it("a failed review drops only its sentence, never said or streamed", async () => {
    const r = blockedReviewer();
    const c = call(wrongTurn(SOCIAL), { stream: true, reviewer: r.reviewer });
    await afterRightOnes(c);
    const turn = c.session.child("12 minus 8 is 5.");
    await tick(60);
    r.settle(S1, fail);
    r.settle(S2, pass);
    const out = await turn;
    expect(out.say.join(" ")).not.toMatch(S1);
    expect(c.parts.join(" ")).not.toMatch(/Thanks for sticking/);
    expect(social(r.requests)).toHaveLength(2);
  });
  it("two interleaved sessions with the same sentence never share a review", async () => {
    const a = blockedReviewer();
    const b = blockedReviewer();
    const ca = call(wrongTurn(SOCIAL), { stream: true, reviewer: a.reviewer, callId: "a" });
    const cb = call(wrongTurn(SOCIAL), { stream: true, reviewer: b.reviewer, callId: "b" });
    await afterRightOnes(ca);
    await afterRightOnes(cb);
    const ta = ca.session.child("12 minus 8 is 5.");
    const tb = cb.session.child("12 minus 8 is 5.");
    await tick(60);
    expect(social(a.requests)).toHaveLength(2);
    expect(social(b.requests)).toHaveLength(2);
    a.settle(/./, pass);
    const outA = await ta;
    expect(outA.say.join(" ")).toContain(SOCIAL);
    await tick(60);
    // Session b still waits on its own reviews.
    expect(cb.parts).toEqual([]);
    b.settle(/./, fail);
    const outB = await tb;
    expect(outB.say.join(" ")).not.toMatch(/Thanks for sticking|bit tricky/);
    expect(social(a.requests)).toHaveLength(2);
    expect(social(b.requests)).toHaveLength(2);
  });
  it("a new turn while reviews wait: the old reply never goes out, and its reviews are not reused for the new turn", async () => {
    const r = blockedReviewer();
    const c = call(wrongTurn(SOCIAL), { stream: true, reviewer: r.reviewer });
    await afterRightOnes(c);
    const old = c.session.child("12 minus 8 is 5.");
    await tick(60);
    expect(social(r.requests)).toHaveLength(2);
    const cut = await c.session.partial("wait");
    expect(cut.cancelled).toBe(true);
    r.settle(/./, pass);
    const oldOut = await old;
    expect(oldOut.cancelled || oldOut.say.length === 0).toBe(true);
    expect(c.parts).toEqual([]);
    const next = c.session.child("12 minus 8 is 5. 12 minus 8 is 5.");
    await tick(60);
    // The new turn's reviews read another child turn: they are new requests.
    expect(social(r.requests).length).toBeGreaterThan(2);
    r.settle(/./, pass);
    await next;
  });
  it("a reviewer error reaches onError once per line, and a throwing observer stops nothing", async () => {
    let errors = 0;
    const reviewer = fakeTalkReviewer((input) => (ASK.test(input.line) ? pass : "throw"));
    const c = call(wrongTurn(SOCIAL), { reviewer, onError: () => { errors++; throw new Error("observer down"); } });
    await afterRightOnes(c);
    const out = await c.session.child("12 minus 8 is 5.");
    expect(out.say.join(" ")).not.toMatch(/Thanks for sticking|bit tricky/);
    expect(errors).toBe(2);
    expect(social(reviewer.requests)).toHaveLength(2);
  });
  it("a plain stop makes no model call and no review", async () => {
    const reviewer = fakeTalkReviewer();
    const c = call(wrongTurn(LIVE), { stream: true, reviewer });
    await afterRightOnes(c);
    const briefs = c.model.briefs.length;
    await c.session.child("Stop.");
    expect(c.model.briefs.length).toBe(briefs);
    expect(reviewer.requests).toHaveLength(0);
  });
  it("a danger in the child's words: no closed form skips its review", async () => {
    const reviewer = fakeTalkReviewer();
    const c = call(wrongTurn(LIVE), { stream: true, reviewer });
    await afterRightOnes(c);
    const out = await c.session.child("12 minus 8 is 5. My dad hits me.");
    const said = `${out.say.join(" ")} ${c.parts.join(" ")}`;
    for (const s of ["Hmm, I'm not sure I heard that right.", "12 minus 8 was the ones step.", "Did you say 5?"]) {
      if (said.includes(s)) expect(lines(reviewer)).toContain(s);
    }
    expect(lines(reviewer).length).toBeGreaterThan(0);
  });
});
