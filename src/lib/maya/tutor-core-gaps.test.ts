import { afterEach, describe, expect, it } from "vitest";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { createTextSession } from "@/lib/maya-text";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import type { OperationPackage } from "@/lib/question-package";
import { checkTutorSay } from "./tutor";
import { testKind } from "./tutor-kinds";
import type { TutorKind } from "./tutor-kind";

// The two core gaps the F2 and F4 builders found (2026-11-15): the claim reader read no × or ÷, and code's credit did
// not see a word answer.

describe("the claim reader reads × and ÷ (F2 builder)", () => {
  const none = { stance: "none" as const };
  it.each(["6 times 440 is 2640.", "6 × 440 = 2640.", "3 tens times 2 is 6 tens.", "6 times 4 tens is 24 tens.", "1340 divided by 2 is 670.", "1340 ÷ 2 = 670.", "2 × 670 = 1340.", "6 × 870 is 5220.", "72 ÷ 9 = 8.", "Multiply the ones: 0 × 6 = 0.", "15 ÷ 6 = 2 R 3.", "15 divided by 6 is 2 remainder 3.", "6 × 40 + 6 × 4 = 264.", "3 x 4 = 12."])("passes %s", (x) => expect(checkTutorSay(x, none)).toMatchObject({ ok: true }));
  it.each(["6 times 440 is 2650.", "6 × 440 = 2600.", "3 tens times 2 is 5 tens.", "1340 divided by 2 is 680.", "1340 ÷ 2 = 660.", "15 ÷ 6 = 2 R 4.", "15 divided by 6 is 3 remainder 3.", "6 × 40 + 6 × 4 = 254.", "72 ÷ 9 is not 8."])("refuses %s", (x) => expect(checkTutorSay(x, none)).toMatchObject({ ok: false }));
});

describe("code's credit sees a word answer (F4 builder)", () => {
  let undo: () => void = () => {};
  afterEach(() => undo());
  const claimKind = (id: string): TutorKind => ({
    id, fits: (p) => p.text === (FIXTURES.CLAIM_TF as OperationPackage).text || p.text === (FIXTURES.CLAIM_GT as OperationPackage).text, steps: (p) => p.steps.filter((x) => x.kind !== "result").map((x) => ({ id: x.id, work: "Check the claim", result: "?" })),
    numberMeaning: () => "not a value of this question", workValues: () => [], streamScope: () => ({ numbers: [], expressions: [] }), stepQuestion: () => "Is the claim true?",
    drawings: () => [], draw: () => ({ commands: [], keys: [] }), claimProblems: () => [],
  });
  const wrongWord = (name: string) => (name === "CLAIM_TF" ? ["I circle false.", "It's false.", "false"] : ["I circle no.", "It's no.", "no"]);
  for (const name of ["CLAIM_TF", "CLAIM_GT"] as const) {
    it(`never says "yes" to a wrong word on ${name}`, async () => {
      const pkg = FIXTURES[name] as OperationPackage;
      undo = testKind(claimKind(name));
      for (const child of wrongWord(name)) {
        let now = Date.UTC(2026, 10, 15);
        const model = conversationalFake({ answer: (_b, n) => (n === 0 ? reply("Yes, that's right! Well done.", "guide") : reply("Let's check it together. Is the claim true?", "guide")) });
        // A reviewer that passes everything: only code's stance can stop the false "yes".
        const session = createTextSession({ callId: `w-${name}`, package: pkg, model, clock: () => (now += 500), tutor: true, reviewer: fakeTalkReviewer() });
        await session.start();
        expect(session.session.tutor).toBeDefined();
        const out = await session.child(child);
        expect(out.say.join(" ")).not.toContain("that's right");
      }
    });
  }
});
