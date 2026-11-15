import { describe, expect, it } from "vitest";
import type { MathReviewInput } from "@/lib/maya";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession } from "@/lib/maya-text";
import { TUTOR_PROMPT, TUTOR_PROMPT_VERSION, type TutorBrief } from "@/lib/maya/tutor-prompt";
import type { OperationPackage } from "@/lib/question-package";

// 2026-11-15 (tutor prompt version 9). After #1099, 4 of the 5 fallbacks left in desk chat were one cause: the child said
// a tentative answer ("is it 24?"), the model said "You got it", and the math review refused it, because code's verdict on
// the committed answer was "unknown". The brief gave the model code's verdict on each number ("facts"), not on the
// committed answer. Now the brief holds the same committed-answer verdict the math review judges by (childAnswerOf).

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
/** A sentence code does not read whole, so the math review reads it: each turn has a math review request to compare with. */
const SAY = "Let's look at the ones together. Which number is on top in the ones?";

async function turn(child: string): Promise<{ brief: TutorBrief; review: MathReviewInput | undefined }> {
  const model = conversationalFake({ answer: () => reply(SAY, "guide") });
  const math = fakeMathReviewer();
  const session = createTextSession({ callId: "committed", package: SUB, model, clock: () => Date.now(), random: 3, tutor: true, reviewer: fakeTalkReviewer(), mathReviewer: math, channel: "chat" });
  await session.start();
  await session.child(child);
  return { brief: model.briefs.at(-1) as unknown as TutorBrief, review: math.requests.at(-1) };
}

describe("the tutor brief holds code's verdict on the committed answer", () => {
  it.each([
    ["is it 24?", "unknown"],
    ["ok so the ones is 4 and the tens is 2, 24", "unknown"],
    ["My answer is 24.", "right"],
    ["My answer is 36.", "wrong"],
    ["I don't get 2 minus 8", "unknown"],
  ] as const)("%s: %s, the same verdict the math review judges by", async (child, verdict) => {
    const { brief, review } = await turn(child);
    expect(brief.promptVersion).toBe("maya-tutor-9");
    expect(brief.childAnswer?.verdict).toBe(verdict);
    expect(review?.childAnswer?.verdict).toBe(verdict);
    expect(brief.childAnswer?.value).toBe(review?.childAnswer?.value);
  });

  it("null when the child said no answer and no number", async () => {
    const { brief, review } = await turn("can you help me?");
    expect(brief.childAnswer).toBeNull();
    expect(review?.childAnswer ?? null).toBeNull();
  });

  it("never carries the right answer (the question has it)", async () => {
    const { brief } = await turn("is it 24?");
    expect(Object.keys(brief.childAnswer ?? {}).sort()).toEqual(["value", "verdict"]);
  });
});

describe("the tutor prompt (version 9)", () => {
  it("judges the child's answer only by childAnswer, and allows facts, agreement and a request to commit", () => {
    expect(TUTOR_PROMPT_VERSION).toBe("maya-tutor-9");
    expect(TUTOR_PROMPT).toContain(`Judge the child's answer only by "childAnswer"`);
    expect(TUTOR_PROMPT).toContain(`"unknown" (a tentative "is it 24?", or a number among others) or null: say nothing that judges the child's answer or work as right or wrong`);
    expect(TUTOR_PROMPT).toContain(`no "You got it", "That's right", "Yes", "Close" or "that part is right"`);
    expect(TUTOR_PROMPT).toContain(`ask them to commit ("Is 24 your answer?")`);
  });
});
