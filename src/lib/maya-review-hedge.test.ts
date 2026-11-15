import { afterEach, describe, expect, it, vi } from "vitest";
import { hedged } from "@/lib/ai-client";
import { MATH_REVIEW_PROMPT_VERSION, type MathReviewInput, type MathReviewResult, TUTOR_REVIEW_SYSTEM, TALK_REVIEW_PROMPT_VERSION, type TalkReviewInput, type TalkReviewResult } from "@/lib/maya";
import { fromMalformedAnswer, MATH_REVIEW_HEDGE_MS, runMathReview, type MathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { CONVERSATION_REVIEW_TIME_LIMIT_MS, fakeTalkReviewer, REVIEW_HEDGE_MS, runReview, type TalkReviewer } from "@/lib/maya-talk-review";
import { CHAT_MATH_REVIEW_TIME_LIMIT_MS, createTextSession, REVIEW_FLOOR_MS } from "@/lib/maya-text";
import type { OperationPackage } from "@/lib/question-package";

// 2026-11-15 (fallback rate). A real-model sample of desk chat lost teaching turns to review time-outs (the math review's
// p50 was 2.2 s against a 4 s limit) and to a voice repair whose reviews got 76 ms. The fixes: a hedged review (a review
// with no answer after REVIEW_HEDGE_MS is sent once more, the first answer counts), a longer math-review limit on a chat
// turn, and a floor under a voice repair's review time. A time-out still never passes a sentence.

afterEach(() => { vi.useRealTimers(); });

/** A request fake: copy n answers `value` after `after[n]` ms, or fails with `error`; it records each start and abort. */
function copies(after: (number | "fail" | "never")[], value = "answer") {
  const starts: number[] = [];
  const aborted: number[] = [];
  const request = (signal: AbortSignal) => {
    const n = starts.length;
    starts.push(Date.now());
    signal.addEventListener("abort", () => aborted.push(n));
    const how = after[n] ?? "never";
    return new Promise<string>((resolve, reject) => {
      if (how === "never") return;
      if (how === "fail") { reject(new Error(`copy ${n} failed`)); return; }
      setTimeout(() => resolve(`${value} ${n}`), how);
    });
  };
  return { request, starts, aborted };
}

describe("hedged: one request, sent once more after the delay, the first answer counts", () => {
  it("a slow first copy: the second copy starts at the delay and its answer counts; the first is aborted", async () => {
    vi.useFakeTimers({ now: 0 });
    const c = copies([5_000, 1_000]);
    const out = hedged(2_500, new AbortController().signal, c.request);
    await vi.advanceTimersByTimeAsync(3_500);
    await expect(out).resolves.toBe("answer 1");
    expect(c.starts).toEqual([0, 2_500]);
    expect(c.aborted).toContain(0);
  });

  it("a first copy that answers before the delay: no second copy", async () => {
    vi.useFakeTimers({ now: 0 });
    const c = copies([2_000]);
    const out = hedged(2_500, new AbortController().signal, c.request);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(out).resolves.toBe("answer 0");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(c.starts).toHaveLength(1);
  });

  it("a first copy that fails before the delay: the error at once, and no second copy (the hedge is no retry)", async () => {
    vi.useFakeTimers({ now: 0 });
    const c = copies(["fail", 100]);
    const out = hedged(2_500, new AbortController().signal, c.request);
    const caught = out.catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(0);
    expect(await caught).toBe("copy 0 failed");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(c.starts).toHaveLength(1);
  });

  it("a copy that fails with no answer while the other runs: the other's answer counts", async () => {
    vi.useFakeTimers({ now: 0 });
    const c = copies([5_000, "fail"]);
    const out = hedged(2_500, new AbortController().signal, c.request);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(out).resolves.toBe("answer 0");
  });

  it("an error named an answer (a malformed answer) ends it at once, as an answer would", async () => {
    vi.useFakeTimers({ now: 0 });
    const c = copies(["never", "fail"]);
    const out = hedged(2_500, new AbortController().signal, c.request, (e) => (e as Error).message === "copy 1 failed");
    const caught = out.catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(await caught).toBe("copy 1 failed");
    expect(c.aborted).toContain(0);
  });

  it("the outer signal ends both copies", async () => {
    vi.useFakeTimers({ now: 0 });
    const c = copies(["never", "never"]);
    const outer = new AbortController();
    const out = hedged(2_500, outer.signal, c.request);
    const caught = out.catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(3_000);
    outer.abort();
    expect(await caught).toBe("aborted");
    expect(c.aborted.sort()).toEqual([0, 1]);
  });
});

const INPUT = { sentence: "12 minus 8 is 4." } as unknown as MathReviewInput;
const TRUE: MathReviewResult = { verdict: "true", reason: "all true" };

/** A math reviewer whose call n answers `answers[n]` after `after[n]` ms (it honours the abort signal). */
function slowMath(after: number[], answers: (MathReviewResult | "bad_json")[] = []): MathReviewer & { calls: () => number } {
  let n = 0;
  return {
    id: "slow-math", promptVersion: MATH_REVIEW_PROMPT_VERSION, calls: () => n,
    review: (_input, signal) => {
      const k = n++;
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => (answers[k] === "bad_json" ? reject(new Error("The model's answer was not valid JSON.")) : resolve((answers[k] as MathReviewResult | undefined) ?? TRUE)), after[k] ?? 60_000);
        signal.addEventListener("abort", () => { clearTimeout(t); reject(new Error("aborted")); });
      });
    },
  };
}

describe("the math review is hedged", () => {
  it(`a first review with no answer after ${MATH_REVIEW_HEDGE_MS} ms is sent once more; the second's "true" counts inside the chat limit`, async () => {
    expect(MATH_REVIEW_HEDGE_MS).toBe(3_500);
    vi.useFakeTimers({ now: 0 });
    const r = slowMath([60_000, 1_000]);
    const out = runMathReview(r, INPUT, CHAT_MATH_REVIEW_TIME_LIMIT_MS);
    await vi.advanceTimersByTimeAsync(3_499);
    expect(r.calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1_001);
    await expect(out).resolves.toEqual(TRUE);
    expect(r.calls()).toBe(2);
  });

  it("on a 4 s voice limit no second copy is sent: it would have less than 1 s", async () => {
    vi.useFakeTimers({ now: 0 });
    const r = slowMath([60_000, 100]);
    const out = runMathReview(r, INPUT, CONVERSATION_REVIEW_TIME_LIMIT_MS);
    await vi.advanceTimersByTimeAsync(4_000);
    await expect(out).resolves.toMatchObject({ verdict: "unsure" });
    expect(r.calls()).toBe(1);
  });

  it("a time-out of both copies is still unsure: never a pass", async () => {
    vi.useFakeTimers({ now: 0 });
    const r = slowMath([60_000, 60_000]);
    const out = runMathReview(r, INPUT, 6_000);
    await vi.advanceTimersByTimeAsync(6_000);
    await expect(out).resolves.toEqual({ verdict: "unsure", reason: "the math review did not answer in time" });
  });

  it("the first answer counts, also a false one: the later true of the other copy changes nothing", async () => {
    vi.useFakeTimers({ now: 0 });
    const r = slowMath([4_000, 1_000], [{ verdict: "false", reason: "12 minus 8 is 4, not 5" }, TRUE]);
    const out = runMathReview(r, INPUT, 6_000);
    await vi.advanceTimersByTimeAsync(4_000);
    await expect(out).resolves.toMatchObject({ verdict: "false" });
  });

  it("a malformed answer of the first copy is final (final check 8): the other copy's later true does not count", async () => {
    vi.useFakeTimers({ now: 0 });
    const r = slowMath([4_000, 1_000], ["bad_json", TRUE]);
    const out = runMathReview(r, INPUT, 6_000);
    await vi.advanceTimersByTimeAsync(4_000);
    const result = await out;
    expect(result.verdict).toBe("unsure");
    expect(fromMalformedAnswer(result)).toBe(true);
  });

  it("no hedge when the delay is not less than the limit", async () => {
    vi.useFakeTimers({ now: 0 });
    const r = slowMath([60_000, 100]);
    const out = runMathReview(r, INPUT, 2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(out).resolves.toMatchObject({ verdict: "unsure" });
    expect(r.calls()).toBe(1);
  });
});

describe("the safety review is hedged", () => {
  it("a review with no answer after the delay is sent once more; the second's pass counts", async () => {
    expect(REVIEW_HEDGE_MS).toBe(2_500);
    vi.useFakeTimers({ now: 0 });
    let n = 0;
    const r: TalkReviewer = {
      id: "slow-review", promptVersion: TALK_REVIEW_PROMPT_VERSION,
      review: (_i, signal) => {
        const k = n++;
        return new Promise<TalkReviewResult>((resolve, reject) => {
          const t = setTimeout(() => resolve({ verdict: "pass" }), k === 0 ? 60_000 : 500);
          signal.addEventListener("abort", () => { clearTimeout(t); reject(new Error("aborted")); });
        });
      },
    };
    const out = runReview(r, { line: "Good thinking." } as TalkReviewInput, CONVERSATION_REVIEW_TIME_LIMIT_MS);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(out).resolves.toEqual({ verdict: "pass" });
    expect(n).toBe(2);
  });
});

describe("the tutor safety review knows the board (talk review version 12)", () => {
  it("says Maya and the child share a board, and keeps the limits of untrue_self", () => {
    expect(TALK_REVIEW_PROMPT_VERSION).toBe("maya-talk-review-12");
    expect(TUTOR_REVIEW_SYSTEM).toContain("Maya and the child share a board on the screen.");
    expect(TUTOR_REVIEW_SYSTEM).toContain("she still cannot see the child, their hands or their paper, and she cannot draw or write on their paper.");
    expect(TUTOR_REVIEW_SYSTEM).toContain("untrue_self");
  });
});

// The text session on the real clock: a fake model, a fake safety review, and a math review that takes `mathMs`.
const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
/** A sentence code does not read whole (a judgment of the child's thinking): the math review must read it. */
const REVIEWED = "You're right that 2 is too small to take 8 away. We trade 1 ten for 10 ones. What is 12 minus 8?";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tutorSession(opts: { voice: boolean; mathMs: (n: number) => number; modelMs?: (n: number) => number; says?: (n: number) => string; reading?: Record<string, unknown> }) {
  let mathCalls = 0;
  const math: MathReviewer = {
    id: "timed-math", promptVersion: MATH_REVIEW_PROMPT_VERSION,
    review: (_i, signal) => {
      const k = mathCalls++;
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve(TRUE), opts.mathMs(k));
        signal.addEventListener("abort", () => { clearTimeout(t); reject(new Error("aborted")); });
      });
    },
  };
  const model = conversationalFake({
    answer: async (_b, n) => {
      await sleep(opts.modelMs?.(n) ?? 0);
      return reply(opts.says?.(n) ?? REVIEWED, "guide", opts.reading ? { reading: opts.reading } : {});
    },
  });
  const session = createTextSession({
    callId: "fallback-rate", package: SUB, model, clock: () => Date.now(), random: 3, tutor: true,
    reviewer: fakeTalkReviewer(), mathReviewer: math,
    ...(opts.voice ? { modelRepair: false, onSayPart: () => {} } : { channel: "chat" as const }),
  });
  return { session, mathCalls: () => mathCalls };
}

describe("the math review's time limit on a chat turn", () => {
  it(`is ${CHAT_MATH_REVIEW_TIME_LIMIT_MS} ms in chat: a review that answers at 4.5 s passes the sentence`, async () => {
    expect(CHAT_MATH_REVIEW_TIME_LIMIT_MS).toBe(6_000);
    const c = tutorSession({ voice: false, mathMs: () => 4_500 });
    await c.session.start();
    const out = await c.session.child("I don't get 2 minus 8");
    expect(out.say.join(" ")).toBe(REVIEWED);
    const trace = await c.session.finish({ reason: "child_stopped" });
    expect(trace.counts).toMatchObject({ fallbacks: 0, repairs: 0 });
  }, 20_000);

  it("stays 4 s on a voice turn: the same review times out, and the sentence is not said", async () => {
    const c = tutorSession({ voice: true, mathMs: () => 4_500 });
    await c.session.start();
    const out = await c.session.child("I don't get 2 minus 8");
    expect(out.say.join(" ")).not.toContain("You're right that 2 is too small");
  }, 30_000);
});

describe("a voice repair's review gets at least REVIEW_FLOOR_MS", () => {
  it("a repair whose model used 3.8 s of its 4 s still has its review read: a 1 s review passes", async () => {
    expect(REVIEW_FLOOR_MS).toBe(1_500);
    // The first message holds a false sentence (refused); the repair's model takes 3.8 s and its review 1 s.
    const c = tutorSession({
      voice: true,
      says: (n) => (n === 0 ? "12 minus 8 is 5. What is 12 minus 8?" : REVIEWED),
      modelMs: (n) => (n === 0 ? 0 : 3_800),
      mathMs: () => 1_000,
    });
    await c.session.start();
    const out = await c.session.child("I don't get 2 minus 8");
    expect(out.say.join(" ")).toBe(REVIEWED);
    const trace = await c.session.finish({ reason: "child_stopped" });
    expect(trace.counts).toMatchObject({ repairs: 1, repairedOk: 1, fallbacks: 0 });
  }, 30_000);
});

describe("a tutor help request with no answer is no confirm (2026-11-15)", () => {
  const TEACH = "We trade 1 ten for 10 ones. What is 12 minus 8?";
  it("unclear, help and no answer: the model's message teaches; no \"Was that 20?\"", async () => {
    const c = tutorSession({ voice: false, mathMs: () => 0, says: () => TEACH, reading: { unclear: true, help: "more", answers: [] } });
    await c.session.start();
    const out = await c.session.child("what do I do with the 20?");
    expect(out.say.join(" ")).toBe(TEACH);
  }, 20_000);

  it("unclear with a help request and an answer still confirms first", async () => {
    const answers = [{ value: { type: "number", value: 20 }, step: "result", problem: "target", verdict: "wrong" }];
    const c = tutorSession({ voice: false, mathMs: () => 0, says: () => TEACH, reading: { unclear: true, help: "more", answers } });
    await c.session.start();
    const out = await c.session.child("is it 20? I need help");
    expect(out.say.join(" ")).not.toBe(TEACH);
  }, 20_000);

  it("unclear with no help request still confirms first", async () => {
    const c = tutorSession({ voice: false, mathMs: () => 0, says: () => TEACH, reading: { unclear: true } });
    await c.session.start();
    const out = await c.session.child("the 20");
    expect(out.say.join(" ")).not.toBe(TEACH);
  }, 20_000);
});
