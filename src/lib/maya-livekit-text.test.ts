import { describe, expect, it } from "vitest";
import { livekitTextSession } from "@/lib/maya-livekit-text";
import { fakeMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession } from "@/lib/maya-text";
import { checkTrace } from "@/lib/maya-trace";

// Maya's text session inside LiveKit Agents for Node (#322): text only, no room, no network. LiveKit carries exactly
// what the text adapter output, and nothing when the adapter output nothing.

const num = (value: number) => ({ type: "number" as const, value });

describe("LiveKit text mode", () => {
  it("carries only the adapter's checked words, turn by turn", async () => {
    const wrong = { version: 2, act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [{ value: num(56), step: "result", verdict: "right" }] } };
    const model = fakeMayaModel({
      answer: (input, n) =>
        n === 0
          ? { version: 2, act: "open", parts: [{ line: "open.hello" }] }
          : n === 1
            ? wrong
            : { version: 2, act: "guide", step: "ones", level: 0, parts: [{ line: "step.invite", slots: { step: "ones" } }], reading: { answers: [{ value: num(56), step: "result", verdict: "wrong" }] } },
    });
    let now = Date.UTC(2026, 9, 31, 16);
    const text = createTextSession({ callId: "lk-1", package: SAMPLE_PACKAGES["add-27-39"], model, clock: () => (now += 1000), random: 1, runner: "livekit-text" });
    const lk = await livekitTextSession(text);
    try {
      const open = await lk.open();
      expect(open.carried).toBe(open.output.say.join(" "));
      expect(open.carried).toMatch(/\bAI\b/);
      const turn = await lk.say("I got 56.");
      expect(turn.carried).toBe(turn.output.say.join(" "));
      expect(turn.carried).not.toMatch(/66/);
      expect(model.requests[1].childTurn).toBe("I got 56.");
    } finally {
      await lk.close();
    }
    const trace = text.trace();
    expect(checkTrace(trace).ok).toBe(true);
    expect(trace.runner).toBe("livekit-text");
    expect(trace.counts).toMatchObject({ mayaTurns: 2, refusals: 1, repairedOk: 1 });
  });
});
