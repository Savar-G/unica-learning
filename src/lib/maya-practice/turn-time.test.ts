import { describe, expect, it } from "vitest";
import type { MayaModel } from "@/lib/maya-model";
import { fakeTalkReviewer, type TalkReviewer } from "@/lib/maya-talk-review";
import { timedTurns, turnTimeMarkdown } from "./turn-time";

function setup(steps: (number | "throw")[]) {
  let t = 0;
  const left = [...steps];
  const seen: unknown[] = [];
  const maya: MayaModel = {
    id: "claude-haiku-5-5", promptVersion: "p1",
    propose: async (input) => {
      seen.push(input);
      const step = left.shift()!;
      if (step === "throw") { t += 5; throw new Error("no answer"); }
      t += step;
      return { answer: step };
    },
  };
  return { maya, seen, now: () => t };
}
const signal = new AbortController().signal;
const input = {} as Parameters<MayaModel["propose"]>[0];

describe("timedTurns", () => {
  it("keeps what the plan and the traces read: the same ids, input and answers", async () => {
    const s = setup([10]);
    const reviewer = fakeTalkReviewer();
    const t = timedTurns(s.maya, reviewer, s.now);
    expect([t.maya.id, t.maya.promptVersion]).toEqual(["claude-haiku-5-5", "p1"]);
    expect([t.reviewer!.id, t.reviewer!.promptVersion]).toEqual([reviewer.id, reviewer.promptVersion]);
    await expect(t.maya.propose(input, signal)).resolves.toEqual({ answer: 10 });
    expect(s.seen).toEqual([input]);
  });

  it("times each call by the clock, counts a failed call, and passes its error on", async () => {
    const s = setup([100, 200, 300, "throw"]);
    const t = timedTurns(s.maya, null, s.now);
    for (let i = 0; i < 3; i++) await t.maya.propose(input, signal);
    await expect(t.maya.propose(input, signal)).rejects.toThrow("no answer");
    expect(t.report()).toEqual({ maya: { id: "claude-haiku-5-5", calls: 4, failed: 1, p50Ms: 100, p95Ms: 300 }, review: null });
  });

  it("times the review apart from the model", async () => {
    const s = setup([100]);
    let t = 0;
    const reviewer: TalkReviewer = { id: "review", promptVersion: "r1", review: async () => { t += 7; return { verdict: "pass" }; } };
    const timed = timedTurns(s.maya, reviewer, () => s.now() + t);
    await timed.maya.propose(input, signal);
    await timed.reviewer!.review({} as Parameters<TalkReviewer["review"]>[0], signal);
    expect(timed.report()).toMatchObject({ maya: { calls: 1, p50Ms: 100 }, review: { id: "review", calls: 1, p50Ms: 7 } });
  });

  it("reports no calls as no times, and says what the times do not hold", () => {
    const s = setup([]);
    const md = turnTimeMarkdown(timedTurns(s.maya, null, s.now).report(), "subscription");
    expect(md).toContain("| Maya | claude-haiku-5-5 | 0 | 0 | - | - |");
    expect(md).toContain("not a gate result");
    expect(md).toContain("starts a process");
    expect(turnTimeMarkdown(timedTurns(s.maya, null, s.now).report(), "anthropic")).not.toContain("starts a process");
  });
});
