import { describe, expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { memorySpendSeam } from "@/lib/maya-spend-seam";
import { workedSteps, type Operation } from "@/lib/question-package";

const subtract = { kind: "subtract", operands: [42, 28] } satisfies Operation;
const add = { kind: "add", operands: [27, 33] } satisfies Operation;
const subtraction = { ...structuredClone(SAMPLE_PACKAGES["subtract-52-28"]), id: "subtract-42-28", text: "42 - 28 = ?", operation: subtract, steps: workedSteps(subtract), answer: { value: { type: "number" as const, value: 14 }, unit: null, accepted: [] } };
const addition = { ...structuredClone(SAMPLE_PACKAGES["add-27-39"]), id: "add-27-33", text: "27 + 33 = ?", operation: add, steps: workedSteps(add), answer: { value: { type: "number" as const, value: 60 }, unit: null, accepted: [] } };

describe("open results written as place counts", () => {
  for (const stream of [false, true]) for (const prepared of [false, true]) {
    it.each([
      { pkg: subtraction, step: "tens", bad: "Write 1 ten. What is the whole answer?", creditOnes: true },
      { pkg: subtraction, step: "ones", bad: "Write 1 ten for the answer. What can you do in the ones?", creditOnes: false },
      { pkg: addition, step: "ones", bad: "Write 10 ones. What can you do in the ones?", creditOnes: false },
    ])("withholds $bad, stream=" + stream + ", prepared=" + prepared, async ({ pkg, step, bad, creditOnes }) => {
      const parts: string[] = [];
      const model = conversationalFake({ answer: (brief) => /12 minus 8/.test(brief.childTurn ?? "")
        ? reply("Yes, 12 minus 8 is 4. What can you do in the tens?", "guide", { step: "tens", reading: { answers: [{ value: { type: "number", value: 4 }, step: "ones", problem: "target", verdict: "right" }] } })
        : reply(bad, "guide", { step }), ...(stream ? { stream: { chunk: 5 } } : {}) });
      const session = createTextSession({ callId: "place-count", package: pkg, clock: () => 1000, model,
        reviewer: fakeTalkReviewer(() => ({ verdict: "fail", rules: ["unkind"], reason: "reject every line" })),
        spend: memorySpendSeam(20), prepareExpected: false, ...(stream ? { onSayPart: (text) => parts.push(text) } : {}) });
      await session.start();
      if (creditOnes) await session.child("12 minus 8 is 4.");
      parts.length = 0;
      const done = creditOnes ? ["ones"] : [];
      expect(session.session.done).toEqual(done);
      const child = prepared ? "5" : `I don't know the ${step}.`;
      if (prepared) {
        const before = await session.saved();
        expect(session.prepare(child)).toBe(true);
        expect(await session.saved()).toEqual(before);
        expect(parts).toEqual([]);
      }
      const out = await session.child(child);
      if (prepared) expect(out.prepared).toBe("hit");
      expect(out.say.join(" ")).not.toContain(bad);
      expect(parts.join(" ")).not.toContain(bad);
      expect(session.session.done).toEqual(done);
      await session.finish();
    });
  }
});
