// Part C of the pre-launch review of the tutor core (2026-11-15): the session's credit of a final answer, and the
// voice stream's "yes" to a word answer.
import { describe, expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import type { TurnBrief } from "@/lib/maya-model";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { FIXTURES, type FixtureId } from "@/lib/maya-gate/fixtures";
import { learningEvent } from "@/lib/maya";
import type { QuestionPackage } from "@/lib/question-package";
import { codeSentences, noteFacts } from "@/lib/maya-call-note";

const SUBTRACT = SAMPLE_PACKAGES["subtract-52-28"];
type Answer = (brief: TurnBrief, call: number) => unknown;

/** A tutor text session. With `stream`, `before()` holds the parts said before the model's reply ended. */
function session(pkg: QuestionPackage, answer: Answer, stream = false) {
  let now = Date.UTC(2026, 10, 15);
  const parts: string[] = [];
  let beforeEnd: string[] = [];
  const model = conversationalFake({
    answer,
    ...(stream ? { stream: { chunk: 7, beforeEnd: async () => { await new Promise((r) => setTimeout(r, 30)); beforeEnd = [...parts]; } } } : {}),
  });
  const s = createTextSession({ callId: "credit-c", package: pkg, model, clock: () => (now += 500), random: 3, tutor: true, reviewer: fakeTalkReviewer(), onSayPart: (x) => parts.push(x) });
  return { s, parts, before: () => beforeEnd };
}

const afterRight: Answer = (_brief, n) => (n === 0 ? reply("Yes, 24. What did you write?", "guide") : reply("Bye for now.", "close"));

describe("tutor core credit of a final answer (part C)", () => {
  it.each(["Actually, my answer is 36.", "Actually, my answer is 12.", "No, my answer is 4.", "My answer is 36."])("a new wrong final answer replaces the right one: %s", async (wrong) => {
    const { s } = session(SUBTRACT, afterRight);
    await s.start();
    await s.child("It's 24.");
    expect(s.session.solved).toBe("child");
    await s.child(wrong);
    const trace = await s.finish({ reason: "child_stopped" });
    const event = learningEvent(s.session, { parentId: "p", childId: "c" });
    expect(event?.result).toBe("blank");
    const facts = noteFacts({ outcome: trace.outcome!, event, package: s.session.package, question: SUBTRACT.ref });
    expect(codeSentences(facts).join(" ")).not.toContain("with no help");
  });

  it("control: a work value after the right answer keeps the credit", async () => {
    const { s } = session(SUBTRACT, (_brief, n) => (n === 0 ? reply("Yes, 24. How did you get the ones?", "guide") : reply("Bye for now.", "close")));
    await s.start();
    await s.child("It's 24.");
    await s.child("12 minus 8 is 4.");
    await s.finish({ reason: "child_stopped" });
    expect(learningEvent(s.session, { parentId: "p", childId: "c" })?.result).toBe("right");
  });
});

describe("the voice stream's yes to a word answer (part C)", () => {
  const yes: Answer = () => reply("Yes, that's right! What do you get?", "guide");
  const wrongWords: [FixtureId, string][] = [["CLAIM_GT", "I circle no."], ["CLAIM_TF", "It's false."], ["SPOT_MUL", "I tick yes."], ["COMPARE_FRACTIONS", "It's false."]];
  for (const [id, wrong] of wrongWords) {
    it(`control: the whole message gets no yes for a wrong word (${id})`, async () => {
      const { s } = session(FIXTURES[id], yes);
      await s.start();
      expect((await s.child(wrong)).say.join(" ")).not.toContain("that's right");
    });
    it(`the stream says no yes for a wrong word (${id})`, async () => {
      const { s, parts, before } = session(FIXTURES[id], yes, true);
      await s.start();
      parts.length = 0;
      await s.child(wrong);
      expect(before().join(" ")).not.toContain("that's right");
      expect(parts.join(" ")).not.toContain("that's right");
    });
  }
  const rightWords: [FixtureId, string][] = [["CLAIM_GT", "I circle yes."], ["CLAIM_TF", "It's true."], ["COMPARE_FRACTIONS", "It's true."]];
  for (const [id, right] of rightWords) {
    it(`control: the stream says yes for the right word (${id})`, async () => {
      const { s, parts, before } = session(FIXTURES[id], yes, true);
      await s.start();
      parts.length = 0;
      await s.child(right);
      expect(before().join(" ")).toContain("that's right");
    });
  }
});
