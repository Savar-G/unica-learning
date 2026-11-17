import { describe, expect, it } from "vitest";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession } from "@/lib/maya-text";
import { checkTrace } from "@/lib/maya-trace";

// The final Sol check of #1044 (2026-11-15): each case reached the child on f471900d2.
const SUB = SAMPLE_PACKAGES["subtract-52-28"];
const settle = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };

describe("final check of #1044 (2026-11-15)", () => {
  it("#1045 retains a review started before a later sentence causes a code refusal", async () => {
    const math = fakeMathReviewer();
    const line = "The result we just computed is 4. The answer to 52 minus 28 is 25.";
    const model = conversationalFake({ answer: (_input, n) => reply(n === 0 ? line : "What is 12 minus 8?", "guide"), stream: { chunk: 7, beforeEnd: settle } });
    const session = createTextSession({ callId: "refused-review", package: SUB, model, clock: () => Date.UTC(2026, 10, 15), tutor: true, reviewer: fakeTalkReviewer(), mathReviewer: math, onSayPart: () => {} });
    await session.start();
    const out = await session.child("Please help me.");
    const trace = await session.finish({ reason: "child_stopped" });
    expect(math.requests.map(r => r.sentence)).toEqual(["The result we just computed is 4."]);
    expect(out.say.join(" ")).not.toContain("25");
    expect(trace.turns.flatMap(t => t.kind === "maya" ? t.attempts : [])).toContainEqual(expect.objectContaining({
      source: "model", refusal: expect.any(Object), math: [{ sentence: math.requests[0].sentence, verdict: "true", reason: "all true" }],
    }));
    expect(trace.counts.mathReviews).toBe(1);
    expect(checkTrace(trace).ok).toBe(true);
  });
  it.each([false, true])("sends a number with a modifier word to the math review (stream %s)", async (stream) => {
    let now = Date.UTC(2026, 10, 15);
    const parts: string[] = [];
    const line = "12 minus 8 is 4 percent.";
    const math = fakeMathReviewer(() => ({ verdict: "false", reason: "4 percent is not 4" }));
    const model = conversationalFake({ answer: () => reply(line, "guide"), ...(stream ? { stream: { chunk: 7 } } : {}) });
    const session = createTextSession({ callId: "modifier", package: SUB, model, clock: () => (now += 100), tutor: true, reviewer: fakeTalkReviewer(), mathReviewer: math, ...(stream ? { onSayPart: (s: string) => parts.push(s) } : {}) });
    await session.start();
    parts.length = 0;
    const out = await session.child("Please help me.");
    expect(math.requests.length).toBeGreaterThan(0);
    expect([...parts, ...out.say].join(" ")).not.toContain("4 percent");
  });
  it.each([false, true])("reviews each place of a repeated sentence with its own context (stream %s)", async (stream) => {
    let now = Date.UTC(2026, 10, 15);
    const parts: string[] = [];
    const line = "12 minus 8 is 4. The result we just computed is 4. 4 minus 2 is 2. The result we just computed is 4.";
    const math = fakeMathReviewer((input) => ({ verdict: input.before.at(-1) === "4 minus 2 is 2." ? "false" : "true", reason: "the result must be the last equation's" }));
    const model = conversationalFake({ answer: () => reply(line, "guide"), ...(stream ? { stream: { chunk: 7, beforeEnd: settle } } : {}) });
    const session = createTextSession({ callId: "repeat", package: SUB, model, clock: () => (now += 100), tutor: true, reviewer: fakeTalkReviewer(), mathReviewer: math, ...(stream ? { onSayPart: (s: string) => parts.push(s) } : {}) });
    await session.start();
    parts.length = 0;
    const out = await session.child("Please help me.");
    expect(out.say.join(" ")).not.toBe(line);
    expect(parts.filter((p) => p === "The result we just computed is 4.").length).toBeLessThanOrEqual(1);
    expect(checkTrace(await session.finish({ reason: "child_stopped" }))).toMatchObject({ ok: true });
  });
  it("control: a plain equation still goes with no math review", async () => {
    const math = fakeMathReviewer();
    const session = createTextSession({ callId: "plain", package: SUB, model: conversationalFake({ answer: () => reply("12 minus 8 is 4. What is 4 minus 2?", "guide") }), clock: () => Date.UTC(2026, 10, 15), tutor: true, reviewer: fakeTalkReviewer(), mathReviewer: math });
    await session.start();
    expect((await session.child("12 minus 8 is 4")).say).toEqual(["12 minus 8 is 4. What is 4 minus 2?"]);
    expect(math.requests).toHaveLength(0);
  });
  it("stores a pass on ignored rules in a shape the trace check accepts", async () => {
    const session = createTextSession({ callId: "ignored", package: SUB, model: conversationalFake({ answer: () => reply("That result is 4.", "guide") }), clock: () => Date.UTC(2026, 10, 15), tutor: true, mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer(() => ({ verdict: "fail", rules: ["math"], reason: "math is the math review's" })) });
    await session.start();
    await session.child("Please help me.");
    expect(checkTrace(await session.finish({ reason: "child_stopped" })).ok).toBe(true);
  });
});
