import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readMathReview, SAFETY_GUIDANCE, type MathReviewInput, type MathReviewResult } from "@/lib/maya";
import { createSession, mathReviewInput } from "@/lib/maya/session";
import { reviewSteps } from "@/lib/maya/math-review-steps";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { callMathReviewer } from "@/lib/maya-call-seams";
import { aiMathReviewer, fakeMathReviewer, MATH_REVIEW_RETRY_DEFAULT_MODEL, runMathReview, type MathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createSpendLedger, spendConfig, usdToMicros } from "@/lib/maya-spend";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession } from "@/lib/maya-text";
import { checkTrace } from "@/lib/maya-trace";
import { teachingPackage } from "@/lib/maya-teaching";
import { storedPlaceValue } from "@/lib/maya-teaching/place-value-samples";
import { operationResult, workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";

// Math review version 3 (2026-11-15): code's facts per step and the state after each one in the review's input, and one
// retry of an "unsure" answer on the retry model (Sonnet 5.5) inside the same time limit. Only the retry's "true" passes.
// Fake models, fake reviews and a passed-in clock.

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const ADD = SAMPLE_PACKAGES["add-27-39"] as OperationPackage;
const T0 = Date.UTC(2026, 10, 15, 16, 0, 0);
const tick = () => new Promise((r) => setTimeout(r, 20));
/** A probe package (no easier example): a session takes some, and reviewSteps reads any. */
function make(text: string, operation: Operation): OperationPackage {
  return { ...SUB, id: `probe-${text}`, text, operation, answer: { value: operationResult(operation), accepted: [], unit: null }, steps: workedSteps(operation) } as OperationPackage;
}
const sessionOf = (pkg: unknown, childName?: string) => createSession({ callId: "steps", package: pkg, conversational: true, tutor: true, ...(childName ? { childName } : {}) });
const NAME = "Zoe";

/** A reviewer whose "unsure" goes to `retry`. */
function withRetry(first: Parameters<typeof fakeMathReviewer>[0], second: Parameters<typeof fakeMathReviewer>[0]) {
  const retry = fakeMathReviewer(second, "fake-math-retry");
  const reviewer = Object.assign(fakeMathReviewer(first), { retry });
  return { reviewer: reviewer as MathReviewer & { requests: MathReviewInput[] }, retry };
}
const UNSURE: MathReviewResult = { verdict: "unsure", reason: "cannot tell" };
const TRUE: MathReviewResult = { verdict: "true", reason: "all true" };

describe("code's facts per step in the review's input", () => {
  const cases: [string, unknown, (states: ReturnType<typeof reviewSteps>, input: MathReviewInput) => void][] = [
    ["column subtraction", SUB, (st, input) => {
      expect(st.map((s) => [s.operation, s.operands, s.value])).toEqual([["subtract", [12, 8], 4], ["subtract", [4, 2], 2]]);
      expect(st[0].after).toContain("after the trade, 52 is 4 tens and 12 ones");
      expect(st[0].after).toContain("ones done: 12 ones minus 8 ones is 4 ones; write 4 in the ones");
      expect(st[1].after).toContain("tens done: 4 tens minus 2 tens is 2 tens");
      expect(st[1].after).toContain("the answer is 24");
      expect(input.start).toBe("52 is 5 tens and 2 ones; 28 is 2 tens and 8 ones");
      // The easier example gets its own step states.
      expect(input.easierExample?.stepStates?.length).toBeGreaterThan(0);
    }],
    ["column addition", ADD, (st) => {
      expect(st.map((s) => [s.operation, s.operands, s.value])).toEqual([["add", [7, 9], 16], ["add", [1, 2, 3], 6]]);
      expect(st[0].after).toContain("16 ones, which is 1 ten and 6 ones; write 6 in the ones and carry 1 to the tens");
      expect(st[1].after).toContain("the carried 1 + 2 + 3 = 6 tens");
    }],
    ["a trade across zeros", make("1002 − 4 = ?", { kind: "subtract", operands: [1002, 4] }), (st) => {
      expect(st[0].after).toContain("after the trade, 1,002 is 9 hundreds, 9 tens and 12 ones");
      expect(st.at(-1)!.after).toContain("the answer is 998");
    }],
    ["multiplication", make("6 × 440 = ?", { kind: "multiply", operands: [6, 440] }), (st) => {
      expect(st.find((s) => s.place === "the tens row")).toMatchObject({ operation: "multiply", operands: [6, 40], value: 240 });
      expect(st.find((s) => s.place === "the hundreds row")).toMatchObject({ operands: [6, 400], value: 2400 });
      expect(st.map((s) => s.after).join(" ")).toContain("6 × 4 = 24; write 4 and carry 2");
    }],
    ["place value", teachingPackage(storedPlaceValue({ variant: "1.2", n0: 48942, place: "ten thousands" })), (st) => {
      expect(st[0]).toMatchObject({ place: "ten thousands", value: 4 });
      expect(st[0].after).toBe("the digit in the ten thousands place is 4; it is worth 4 ten thousands, which is 40,000");
    }],
    ["a claim", FIXTURES.CLAIM_GT, (st) => {
      expect(st.at(-1)).toMatchObject({ operation: "compare", operands: [1440, 1436] });
      expect(st.at(-1)!.after).toContain("1,440 is greater than 1,436, so the claim is true");
      expect(st.map((s) => s.after).join(" ")).toContain("the ones row is now 1,440");
    }],
    ["an evaluation", FIXTURES.EV_TWO, (st) => {
      expect(st.map((s) => [s.operation, s.operands, s.value])).toEqual([["×", [7, 640], 4480], ["×", [7, 30], 210], ["+", [4480, 210], 4690]]);
      expect(st[0].after).toBe("7 × 640 = 4480; that leaves 4480 + 7 × 30");
    }],
  ];

  it.each(cases)("gives each step's operation, operands, value and state: %s", (_, pkg, check) => {
    // A probe the session does not take (the multiplication) is read by reviewSteps alone; the rest through the call's input.
    const s = sessionOf(pkg, NAME);
    const states = reviewSteps((s.package ?? pkg) as OperationPackage);
    expect(states.length).toBeGreaterThan(0);
    expect(states.every((x, i) => x.step === i + 1 && x.after.length > 0)).toBe(true);
    const input = s.package ? mathReviewInput(s, "Now there are 12 ones.") : null;
    if (input) {
      expect(states.length).toBe(input.steps.length);
      expect(input.stepStates).toEqual(states);
      expect(input.promptVersion).toBe("maya-math-review-3");
    }
    check(states, input!);
  });

  it("never holds the child's name, even when a story's person has it", () => {
    for (const [, pkg] of cases) {
      const s = sessionOf(pkg, NAME);
      if (!s.package) continue;
      const input = mathReviewInput(s, "Now there are 12 ones.");
      expect(JSON.stringify(input)).not.toMatch(/Zoe/);
    }
    // A question whose words hold the child's name: the step facts hide it too.
    const named = { ...SUB, text: "Zoe has 52 stickers and gives away 28. How many are left?" };
    const input = mathReviewInput(sessionOf(named, NAME), "Now there are 12 ones.");
    expect(JSON.stringify(input)).not.toMatch(/Zoe/);
  });

  it("builds the facts from the package alone: the model's sentence changes nothing in them", () => {
    const s = sessionOf(SUB);
    expect(mathReviewInput(s, "The answer is 99.").stepStates).toEqual(mathReviewInput(s, "Now there are 12 ones.").stepStates);
  });
});

describe("one retry of an unsure answer", () => {
  it("asks the retry model once after unsure; only its true passes", async () => {
    for (const [second, verdict] of [[TRUE, "true"], [{ verdict: "false", reason: "4 is not 8" }, "false"], [UNSURE, "unsure"]] as const) {
      const { reviewer, retry } = withRetry(() => UNSURE, () => second);
      const r = await runMathReview(reviewer, {} as MathReviewInput, 50);
      expect(r).toEqual({ verdict, reason: second.reason, retried: true });
      expect(reviewer.requests).toHaveLength(1);
      expect(retry.requests).toHaveLength(1);
    }
  });

  it("does not ask the retry model after true or false, nor after an error or a time-out of the first review", async () => {
    for (const first of [() => TRUE, () => ({ verdict: "false" as const, reason: "wrong" }), () => "throw" as const, () => "hang" as const]) {
      const { reviewer, retry } = withRetry(first, () => TRUE);
      const r = await runMathReview(reviewer, {} as MathReviewInput, 20);
      expect(r.retried).toBeUndefined();
      expect(retry.requests).toHaveLength(0);
    }
  });

  it("keeps the one second ask of an answer that is not JSON, then retries its unsure", async () => {
    const { reviewer, retry } = withRetry((_, n) => (n === 0 ? "bad_json" : UNSURE), () => TRUE);
    expect(await runMathReview(reviewer, {} as MathReviewInput, 50)).toEqual({ verdict: "true", reason: "all true", retried: true });
    expect(reviewer.requests).toHaveLength(2);
    expect(retry.requests).toHaveLength(1);
  });

  it("takes a retry error or time-out as final: unsure, never asked again", async () => {
    const thrown = withRetry(() => UNSURE, () => "throw");
    expect(await runMathReview(thrown.reviewer, {} as MathReviewInput, 50)).toEqual({ verdict: "unsure", reason: "the second math review call failed (unknown)", retried: true });
    expect(thrown.retry.requests).toHaveLength(1);
    const bad = withRetry(() => UNSURE, () => "bad_json");
    expect(await runMathReview(bad.reviewer, {} as MathReviewInput, 50)).toMatchObject({ verdict: "unsure", retried: true });
    expect(bad.retry.requests).toHaveLength(1);
    const hang = withRetry(() => UNSURE, () => "hang");
    expect(await runMathReview(hang.reviewer, {} as MathReviewInput, 20)).toEqual({ verdict: "unsure", reason: "the second math review did not answer in time", retried: true });
    expect(hang.retry.requests).toHaveLength(1);
  });

  it("fits the retry inside the same time limit: a late true changes nothing", async () => {
    let release!: (r: MathReviewResult) => void;
    const late = new Promise<MathReviewResult>((r) => { release = r; });
    const retry: MathReviewer = { id: "late", promptVersion: "t", review: () => late };
    const reviewer = { ...fakeMathReviewer(() => UNSURE), retry };
    const t = Date.now();
    const r = await runMathReview(reviewer, {} as MathReviewInput, 30);
    expect(Date.now() - t).toBeLessThan(500);
    release(TRUE);
    await tick();
    expect(r).toEqual({ verdict: "unsure", reason: "the second math review did not answer in time", retried: true });
  });

  it("reads a verdict its own reason contradicts as unsure, so it goes to the retry", () => {
    expect(readMathReview({ verdict: "true", reason: "12 minus 8 is 4, but labeling it as the tens step is wrong." }).verdict).toBe("unsure");
    expect(readMathReview({ verdict: "false", reason: "The question asks for 12 minus 8; re-check: this is true." }).verdict).toBe("unsure");
    // A reason that finds no fault, or one part true and another false, keeps its verdict.
    expect(readMathReview({ verdict: "true", reason: "A plain question; it makes no false claim." }).verdict).toBe("true");
    expect(readMathReview({ verdict: "false", reason: "12 minus 8 is 4 is true, but 4 is not greater than 8." }).verdict).toBe("false");
    expect(readMathReview({ verdict: "true", reason: "all true" })).toEqual(TRUE);
  });
});

describe("the retry in a call", () => {
  const LINE = "Now there are 12 ones.";
  function call(reviewer: MathReviewer, stream = true, says: string[] = [LINE]) {
    let now = T0;
    let n = 0;
    const parts: string[] = [];
    const model = conversationalFake({ answer: () => reply(says[Math.min(n++, says.length - 1)], "guide") });
    const session = createTextSession({
      callId: "math-retry", package: SUB, model, clock: () => (now += 100), random: 3, tutor: true, reviewTimeLimitMs: 50, turnBudgetMs: 60_000,
      reviewer: fakeTalkReviewer(), mathReviewer: reviewer, ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}),
    });
    return { session, parts, model };
  }

  it.each([true, false])("says a sentence the retry finds true, and the trace counts the retry (stream %s)", async (stream) => {
    const { reviewer, retry } = withRetry(() => UNSURE, () => TRUE);
    const { session, parts, model } = call(reviewer, stream);
    await session.start();
    parts.length = 0;
    const out = await session.child("Help me please.");
    expect(out.say.join(" ")).toBe(LINE);
    if (stream) expect(parts).toEqual([LINE]);
    expect(model.briefs).toHaveLength(1);
    expect(retry.requests.map((r) => r.sentence)).toEqual([LINE]);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    expect(trace.mathReviewer).toEqual({ id: "fake-math-review", promptVersion: "maya-math-review-3", retryId: "fake-math-retry" });
    expect(trace.counts).toMatchObject({ mathReviews: 1, mathRetries: 1, mathRefusals: 0 });
    const math = trace.turns.flatMap((t) => (t.kind === "maya" ? t.attempts.flatMap((a) => a.math ?? []) : []));
    expect(math).toEqual([{ sentence: LINE, verdict: "true", reason: "all true", retried: true }]);
  });

  it.each([
    ["false", (): MathReviewResult | "throw" | "hang" => ({ verdict: "false", reason: "not 12" })],
    ["unsure", (): MathReviewResult | "throw" | "hang" => UNSURE],
    ["an error", (): MathReviewResult | "throw" | "hang" => "throw"],
    ["a time-out", (): MathReviewResult | "throw" | "hang" => "hang"],
  ])("refuses the sentence when the retry says %s: the child never hears it", async (_, second) => {
    const { reviewer } = withRetry((i) => (i.sentence === LINE ? UNSURE : TRUE), (i) => (i.sentence === LINE ? second() : TRUE));
    const { session, parts } = call(reviewer, true, [LINE, "12 minus 8 is 4."]);
    await session.start();
    parts.length = 0;
    const out = await session.child("Help me please.");
    expect([...parts, ...out.say]).not.toContain(LINE);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    expect(trace.counts.mathRefusals).toBeGreaterThanOrEqual(1);
    expect(trace.counts.mathRetries).toBeGreaterThanOrEqual(1);
  });

  function heldRetry() {
    let pass!: (r: MathReviewResult) => void;
    let started!: () => void;
    const begun = new Promise<void>((r) => { started = r; });
    const answer = new Promise<MathReviewResult>((r) => { pass = r; });
    const retry: MathReviewer = { id: "held-retry", promptVersion: "t", review: (input) => { if (input.sentence === LINE) { started(); return answer; } return Promise.resolve(TRUE); } };
    const reviewer: MathReviewer = { ...fakeMathReviewer((i) => (i.sentence === LINE ? UNSURE : TRUE)), retry };
    const events: string[] = [];
    let n = 0;
    const model = conversationalFake({ answer: () => (n++ === 0 ? reply(LINE, "guide") : reply("12 minus 8 is 4.", "guide")) });
    const session = createTextSession({
      callId: "held-retry", package: SUB, model, tutor: true, clock: () => 10_000, turnBudgetMs: 60_000, reviewTimeLimitMs: 60_000,
      onSayPart: (s) => events.push(s), onGuidance: (out) => events.push(...out.say), reviewer: fakeTalkReviewer(), mathReviewer: reviewer,
    });
    return { session, events, begun, pass };
  }

  it("sends nothing when the retry's true comes after code's safety guidance", async () => {
    const t = heldRetry();
    await t.session.start();
    t.events.length = 0;
    const turn = t.session.child("I need help");
    await t.begun;
    const work = t.session.safety("concern");
    await tick();
    expect(t.events).toEqual([SAFETY_GUIDANCE.concern]);
    t.pass(TRUE);
    await tick();
    await Promise.all([turn, work]);
    await t.session.finish({ reason: "child_stopped" });
    expect(t.events).not.toContain(LINE);
  });

  it("sends nothing when the retry's true comes after the child's newer turn", async () => {
    const t = heldRetry();
    await t.session.start();
    t.events.length = 0;
    const first = t.session.child("I need help");
    await t.begun;
    const second = t.session.child("Wait, is it 12 minus 8?");
    await tick();
    t.pass(TRUE);
    await Promise.all([first, second]);
    await tick();
    expect(t.events).not.toContain(LINE);
  });

  it("control: with no safety and no newer turn, the held sentence goes out once the retry says true", async () => {
    const t = heldRetry();
    await t.session.start();
    t.events.length = 0;
    const turn = t.session.child("I need help");
    await t.begun;
    expect(t.events).toEqual([]);
    t.pass(TRUE);
    await turn;
    expect(t.events.filter((e) => e === LINE)).toHaveLength(1);
  });
});

describe("the retry in Maya's spend and route", () => {
  const env = { OPENROUTER_API_KEY: "test-key", AI_MODEL: "anthropic/claude-sonnet-5.5", NODE_ENV: "test" };
  const P = "00000000-0000-4000-8000-0000000000a1", C = "00000000-0000-4000-8000-0000000000c1";
  const callRow = { id: "00000000-0000-4000-8000-0000000000f1", kind: "chat", parentId: P, childId: C };
  afterEach(() => vi.unstubAllGlobals());

  it("meters the retry as its own review attempt on the retry model", async () => {
    const models: string[] = [];
    const answers = ['{"verdict":"unsure","reason":"cannot tell"}', '{"verdict":"true","reason":"all true"}'];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      models.push(JSON.parse(String(init.body)).model);
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: answers[models.length - 1] } }], usage: { cost: 0.001 } }), { status: 200 });
    }));
    let n = 0;
    const now = Date.parse("2026-11-15T18:00:00Z");
    const store = memorySpendStore({ clock: () => now });
    const ledger = createSpendLedger({ store, clock: () => now, config: spendConfig({}), zone: async () => "America/Vancouver", alert: async () => {} });
    const reviewer = callMathReviewer(env.AI_MODEL, env, { ledger, call: callRow as never, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` })!;
    expect(reviewer.retry?.id).toBe(MATH_REVIEW_RETRY_DEFAULT_MODEL);
    const r = await runMathReview(reviewer, mathReviewInput(sessionOf(SUB), "Now there are 12 ones."), 5_000);
    expect(r).toEqual({ verdict: "true", reason: "all true", retried: true });
    expect(models).toEqual(["anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5"]);
    const rows = store.rows();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.cost === usdToMicros(0.001, ledger.config))).toBe(true);
    // MAYA_MATH_REVIEW_RETRY_MODEL names another retry model.
    expect(callMathReviewer(env.AI_MODEL, { ...env, MAYA_MATH_REVIEW_RETRY_MODEL: "anthropic/claude-opus-5.5" })!.retry?.id).toBe("anthropic/claude-opus-5.5");
  });

  it("sends the review without a length bound, so the model keeps to strict JSON", async () => {
    const formats: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      formats.push(JSON.parse(String(init.body)).response_format);
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"verdict":"true","reason":"all true"}' } }], usage: { cost: 0.001 } }), { status: 200 });
    }));
    const { aiClient } = await import("@/lib/ai-client");
    await aiMathReviewer(aiClient(env, "anthropic/claude-haiku-5.5")!).review(mathReviewInput(sessionOf(SUB), "Now there are 12 ones."), new AbortController().signal);
    expect(formats[0]).toMatchObject({ type: "json_schema", json_schema: { strict: true } });
  });
});
