import { afterEach, describe, expect, it, vi } from "vitest";
import { MATH_REVIEW_PROMPT_VERSION, TALK_REVIEW_PROMPT_VERSION, type MathReviewInput, type MathReviewResult, type TalkReviewInput, type TalkReviewResult } from "@/lib/maya";
import { VOICE_MATH_REVIEW_HEDGE_MS, type MathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { CONVERSATION_REVIEW_TIME_LIMIT_MS, VOICE_REVIEW_HEDGE_MS, type TalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession, VOICE_EARLY_REVIEW_EXTRA_MS, VOICE_REPAIR_BUDGET_MS } from "@/lib/maya-text";
import { checkTrace, type MayaTrace } from "@/lib/maya-trace";
import { ACK_PHRASES } from "@/lib/maya-voice-ack";
import type { OperationPackage } from "@/lib/question-package";

// Call 21665dc6 (production, 2026-11-15 23:47 UTC), turn 10: the child said "Huh, that didn't make sense." The model took
// 2.6 s, its reviews started only then, one math review ran into its 4 s limit, the repair's safety review was cut at the
// 4 s repair cap, and code's line came 10.6 s after the child. On a voice turn the reviews now start while the model
// still writes, both kinds at once for each sentence; a review started so is read no longer than a review started at the
// model's end would run (the child waits no longer), and each review is sent once more at its voice p90. The fake clock
// moves every timer; the fake reviewers answer after set times.

afterEach(() => { vi.useRealTimers(); });

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TRUE: MathReviewResult = { verdict: "true", reason: "all true" };
const FALSE: MathReviewResult = { verdict: "false", reason: "the judgment is false" };
/** Turn 10's child: not plainly math, so no word streams before the whole check (tutorStream). */
const LOST = "Huh, that didn't make sense.";
/** A sentence both reviews read: a judgment of the child's answer that code cannot read whole. */
const SLOW = "Three isn't right, but you were close.";
const ASK = "What is 4 tens minus 2 tens?";
const MESSAGE = `52 is 4 tens and 12 ones. ${SLOW} ${ASK}`;
const REPAIR = `52 is 4 tens and 12 ones. ${ASK}`;

type Answer<T> = T | "hang" | { after: number; result: T };
interface Request { kind: "safety" | "math"; sentence: string; at: number; copy: number; abortedAt?: number }

/** A reviewer pair that logs each request (each copy) with its time, and answers per sentence and copy. */
function reviewers(math: (sentence: string, copy: number) => Answer<MathReviewResult>, talk: (line: string, copy: number) => Answer<TalkReviewResult> = () => ({ verdict: "pass" })) {
  const requests: Request[] = [];
  const copies = new Map<string, number>();
  function run<T>(kind: Request["kind"], sentence: string, how: (s: string, copy: number) => Answer<T>, signal: AbortSignal): Promise<T> {
    const key = `${kind}|${sentence}`;
    const copy = copies.get(key) ?? 0;
    copies.set(key, copy + 1);
    const request: Request = { kind, sentence, at: Date.now(), copy };
    requests.push(request);
    const a = how(sentence, copy);
    return new Promise<T>((resolve, reject) => {
      signal.addEventListener("abort", () => { request.abortedAt = Date.now(); reject(new Error("aborted")); });
      if (a === "hang") return;
      if (typeof a === "object" && a !== null && "after" in a) setTimeout(() => resolve(a.result), a.after);
      else resolve(a as T);
    });
  }
  const mathReviewer: MathReviewer = { id: "timed-math", promptVersion: MATH_REVIEW_PROMPT_VERSION, review: (input: MathReviewInput, signal) => run("math", input.sentence, math, signal) };
  const reviewer: TalkReviewer = { id: "timed-review", promptVersion: TALK_REVIEW_PROMPT_VERSION, review: (input: TalkReviewInput, signal) => run("safety", input.line, talk, signal) };
  return { mathReviewer, reviewer, requests };
}

/**
 * One voice tutor turn on the fake clock. The model streams its whole JSON at once, then holds it for `modelMs` before it
 * answers (the time a real model still writes after its sentences came). `voice` false runs the same turn as chat.
 */
async function turn(opts: { says: string[]; modelMs: number[]; revs: ReturnType<typeof reviewers>; voice?: boolean; child?: string; reviewTimeLimitMs?: number; onRepairStart?: () => string | null; firstWordsMs?: number }) {
  vi.useFakeTimers({ now: 100_000 });
  const voice = opts.voice ?? true;
  const parts: { text: string; at: number }[] = [];
  const modelEnds: number[] = [];
  const modelStarts: number[] = [];
  let n = 0;
  const model = conversationalFake({
    answer: async (_brief, call) => {
      modelStarts.push(Date.now()); n = call;
      // The time before the model's first words (its JSON then streams at once).
      if (call === 0 && opts.firstWordsMs) await sleep(opts.firstWordsMs);
      return reply(opts.says[call] ?? opts.says.at(-1)!, "guide");
    },
    stream: { beforeEnd: async () => { await sleep(opts.modelMs[n] ?? opts.modelMs.at(-1)!); modelEnds.push(Date.now()); } },
  });
  const session = createTextSession({
    callId: "voice-review-timing", package: SUB, model, tutor: true, random: 3, clock: () => Date.now(),
    reviewer: opts.revs.reviewer, mathReviewer: opts.revs.mathReviewer,
    ...(opts.reviewTimeLimitMs ? { reviewTimeLimitMs: opts.reviewTimeLimitMs } : {}),
    ...(voice ? { modelRepair: false, onSayPart: (text: string) => parts.push({ text, at: Date.now() }), ...(opts.onRepairStart ? { onRepairStart: opts.onRepairStart } : {}) } : {}),
  });
  await session.start();
  parts.length = 0;
  opts.revs.requests.length = 0;
  const childAt = Date.now();
  const pending = session.child(opts.child ?? LOST);
  await vi.advanceTimersByTimeAsync(20_000);
  const out = await pending;
  const trace: MayaTrace = await session.finish({ reason: "child_stopped" });
  return { out, parts, modelStarts, modelEnds, childAt, trace, said: out.say.join(" "), attempts: trace.turns.filter((t) => t.kind === "maya").at(-1)!.attempts };
}

describe("voice reviews start while the model still writes, both kinds at once (call 21665dc6)", () => {
  it("on a turn that cannot stream, each sentence's math and safety reviews start before the model's answer, together", async () => {
    const revs = reviewers(() => TRUE);
    const t = await turn({ says: [MESSAGE], modelMs: [1_000], revs });
    expect(t.said).toBe(MESSAGE);
    // Nothing went out before the whole check: the turn is not plainly math.
    expect(t.parts.every((p) => p.at >= t.modelEnds[0])).toBe(true);
    const slow = revs.requests.filter((r) => r.sentence === SLOW);
    expect(slow.map((r) => r.kind).sort()).toEqual(["math", "safety"]);
    // Both started at the same moment, 1 s before the model's answer, and the whole check started neither again.
    expect(slow[0].at).toBe(slow[1].at);
    expect(slow[0].at).toBeLessThanOrEqual(t.modelEnds[0] - 1_000);
    expect(revs.requests.every((r) => r.at < t.modelEnds[0])).toBe(true);
    expect(checkTrace(t.trace)).toMatchObject({ ok: true });
  });

  it("chat is unchanged: no review starts before the model's answer", async () => {
    const revs = reviewers(() => TRUE);
    const t = await turn({ says: [MESSAGE], modelMs: [1_000], revs, voice: false });
    expect(t.said).toBe(MESSAGE);
    expect(revs.requests.length).toBeGreaterThan(0);
    expect(revs.requests.every((r) => r.at >= t.modelEnds[0])).toBe(true);
  });

  it("an early review is read as long as a review started at the model's answer would run: a 1.5 s review passes a 1 s limit when it started 0.8 s early", async () => {
    // Before: the review started at the model's answer (0.8 s), ran into its 1 s limit at 1.8 s, and the message was
    // refused. Now it starts at once, answers at 1.5 s, and the whole check (0.8 s to 1.8 s) reads it.
    const revs = reviewers((s) => (s === SLOW ? { after: 1_500, result: TRUE } : TRUE));
    const t = await turn({ says: [MESSAGE], modelMs: [800], revs, reviewTimeLimitMs: 1_000 });
    expect(t.said).toBe(MESSAGE);
    expect(t.attempts.map((a) => a.source)).toEqual(["model"]);
    expect(revs.requests.filter((r) => r.sentence === SLOW && r.kind === "math")).toHaveLength(1);
  });

  it("a review with no answer is a time-out at the model's answer plus the limit: never a pass, never later", async () => {
    const revs = reviewers((s) => (s === SLOW ? "hang" : TRUE));
    const t = await turn({ says: [MESSAGE, REPAIR], modelMs: [800, 100], revs, reviewTimeLimitMs: 1_000 });
    const first = t.attempts[0];
    expect(first.refusal?.reason).toContain("did not answer in time");
    expect(first.math?.find((m) => m.sentence === SLOW)?.verdict).toBe("unsure");
    // The repair's model was asked when the whole check gave up: 0.8 s + 1 s after the first model call.
    expect(t.modelStarts[1] - t.modelStarts[0]).toBe(1_800);
    expect(t.said).toBe(REPAIR);
  });
});

describe("the call 21665dc6 turn shape on the voice path: slow model, a math review time-out, the repair", () => {
  it("asks the worker for its phrase at the repair's start, keeps its id, and the repair ends inside the 4 s cap", async () => {
    // Turn 10's times: the model 2,556 ms, a math review that never answers (4 s limit), the repair's model 1,816 ms.
    const revs = reviewers((s) => (s === SLOW ? "hang" : TRUE));
    const phrase = ACK_PHRASES[2];
    let repairAt = 0;
    const t = await turn({ says: [MESSAGE, REPAIR], modelMs: [2_556, 1_816], revs, onRepairStart: () => { repairAt = Date.now(); return phrase.id; } });
    expect(t.attempts.map((a) => a.source)).toEqual(["model", "repair"]);
    expect(t.attempts[0].refusal?.reason).toContain("did not answer in time");
    // The phrase is asked for when the repair starts: the first model's answer plus the review limit, before the repair's model.
    expect(repairAt - t.modelStarts[0]).toBe(2_556 + CONVERSATION_REVIEW_TIME_LIMIT_MS);
    expect(repairAt).toBeLessThanOrEqual(t.modelStarts[1]);
    expect(t.attempts[1].filler).toBe(phrase.id);
    expect(t.trace.counts).toMatchObject({ repairs: 1, fillers: 1, fallbacks: 0 });
    expect(t.said).toBe(REPAIR);
    expect(t.parts[0].at - repairAt).toBeLessThanOrEqual(VOICE_REPAIR_BUDGET_MS);
    expect(checkTrace(t.trace)).toMatchObject({ ok: true });
  });
});

describe("voice reviews are sent once more at their voice p90 (call 21665dc6)", () => {
  it(`a math review with no answer after ${VOICE_MATH_REVIEW_HEDGE_MS} ms is sent once more; the copy's true counts`, async () => {
    expect(VOICE_EARLY_REVIEW_EXTRA_MS).toBe(3_000);
    const revs = reviewers((s, copy) => (s === SLOW && copy === 0 ? "hang" : TRUE));
    const t = await turn({ says: [MESSAGE], modelMs: [500], revs });
    const slow = revs.requests.filter((r) => r.sentence === SLOW && r.kind === "math");
    expect(slow.map((r) => r.at - slow[0].at)).toEqual([0, VOICE_MATH_REVIEW_HEDGE_MS]);
    expect(t.said).toBe(MESSAGE);
  });

  it(`a safety review with no answer after ${VOICE_REVIEW_HEDGE_MS} ms is sent once more; the copy's pass counts`, async () => {
    const revs = reviewers(() => TRUE, (line, copy) => (line === SLOW && copy === 0 ? "hang" : { verdict: "pass" }));
    const t = await turn({ says: [MESSAGE], modelMs: [500], revs });
    const slow = revs.requests.filter((r) => r.sentence === SLOW && r.kind === "safety");
    expect(slow.map((r) => r.at - slow[0].at)).toEqual([0, VOICE_REVIEW_HEDGE_MS]);
    expect(t.said).toBe(MESSAGE);
  });

  it("a time-out of both copies is still a time-out: the message is refused", async () => {
    const revs = reviewers((s) => (s === SLOW ? "hang" : TRUE));
    const t = await turn({ says: [MESSAGE, `52 is 4 tens and 12 ones. ${ASK}`], modelMs: [500, 100], revs });
    expect(revs.requests.filter((r) => r.sentence === SLOW && r.kind === "math")).toHaveLength(2);
    expect(t.attempts[0].refusal?.reason).toContain("did not answer in time");
  });
});

describe("the 4 s voice repair cap holds with early and hedged reviews (#1104)", () => {
  it("a repair whose early math review never answers: code's line inside 4 s of the repair's start, no copy after the cap", async () => {
    let repairAt = 0;
    const revs = reviewers((s) => (s === "12 minus 8 is 5." ? FALSE : s === SLOW ? "hang" : TRUE));
    const t = await turn({ says: ["12 minus 8 is 5.", MESSAGE], modelMs: [200, 1_000], revs, child: "I don't get 2 minus 8", onRepairStart: () => { repairAt = Date.now(); return null; } });
    expect(t.attempts.map((a) => a.source)).toEqual(["model", "repair", "fallback"]);
    expect(t.parts[0].at - repairAt).toBeLessThanOrEqual(VOICE_REPAIR_BUDGET_MS);
    expect(revs.requests.every((r) => r.at <= repairAt + VOICE_REPAIR_BUDGET_MS)).toBe(true);
  });

  it("a repair whose early math review answers at 3.5 s is read inside the cap", async () => {
    let repairAt = 0;
    const revs = reviewers((s) => (s === "12 minus 8 is 5." ? FALSE : s === SLOW ? { after: 3_500, result: TRUE } : TRUE));
    const t = await turn({ says: ["12 minus 8 is 5.", MESSAGE], modelMs: [200, 2_000], revs, child: "I don't get 2 minus 8", onRepairStart: () => { repairAt = Date.now(); return null; } });
    expect(t.said).toBe(MESSAGE);
    expect(t.parts[0].at - repairAt).toBeLessThanOrEqual(VOICE_REPAIR_BUDGET_MS);
  });
});

// Review of #1109 (Terra, money): an early review had no signal tied to its model request. With the voice limits, a
// safety review started at 5.5 s, the turn's 6 s budget ended the model request, and the review's copy was still sent at
// 7.4 s (5.5 + VOICE_REVIEW_HEDGE_MS): paid, and read by no one. Now every review a request started ends, with its hedge
// timer, when the request is dropped, fails or runs out of time, when the whole check stops waiting for it, or after the
// check; a review that ended sends no copy.
describe("an early review ends when no one will read it (review of #1109)", () => {
  it("a review started at 5.5 s ends at the 6 s turn end: no copy at 7.4 s, no request after the turn", async () => {
    expect(VOICE_REVIEW_HEDGE_MS).toBe(1_900);
    const revs = reviewers(() => "hang", () => "hang");
    const t = await turn({ says: [MESSAGE], firstWordsMs: 5_500, modelMs: [60_000], revs });
    const early = revs.requests.filter((r) => r.sentence === SLOW);
    expect(early.map((r) => [r.kind, r.at - t.childAt]).sort()).toEqual([["math", 5_500], ["safety", 5_500]]);
    // Each ended at the turn's end, and no request (no copy at 7.4 s or 8.7 s) came after it.
    expect(early.every((r) => r.abortedAt !== undefined && r.abortedAt - t.childAt <= 6_000)).toBe(true);
    expect(revs.requests.every((r) => r.at - t.childAt <= 6_000)).toBe(true);
    expect(t.attempts.at(-1)?.source).toBe("fallback");
  });

  it("a review the whole check stopped waiting for ends then: its copy is never sent", async () => {
    // A 1 s limit: the early review's own limit is 4 s, so its copy would go at 1.9 s; the check reads it until 1.8 s.
    const revs = reviewers(() => TRUE, (line) => (line === SLOW ? "hang" : { verdict: "pass" }));
    const t = await turn({ says: [MESSAGE, REPAIR], modelMs: [800, 100], revs, reviewTimeLimitMs: 1_000 });
    const slow = revs.requests.filter((r) => r.sentence === SLOW && r.kind === "safety");
    expect(slow).toHaveLength(1);
    expect(slow[0].abortedAt! - t.childAt).toBe(1_800);
    expect(t.attempts[0].refusal?.reason).toContain("did not answer in time");
    expect(t.said).toBe(REPAIR);
  });
});
