import { describe, expect, it } from "vitest";
import { checkQuestionPackage, operationProblem, type QuestionPackage } from "@/lib/question-package";
import { attachWorkbookMayaOperations, withWorkbookMayaOperation } from "@/lib/workbook-maya-operation";
import type { GeneratedWorkbook } from "@/lib/workbook-generator";
import { addsThousandChain, bareSum, boxesThenSells, eachHasStory, putsInEachStory, storedQuestion, subtractFromTenThousand, thousandsSum } from "./samples";

// Wave A must not change the generator. Maya's wider limits and closed forms are passed only by her session adapter,
// so every default check, and the #525 teaching data the generator attaches, stay exactly as before. The snapshot of
// this file was written with the base versions of question-package.ts, question-package-math.ts and
// workbook-maya-operation.ts (6de7e777), before this change.

const template = (id: string, text: string, expression: string, slots: [string, number][], key: number, format: "show-work" | "write-number" = "show-work") =>
  storedQuestion({ id, text, templateId: "4.4-subtract-within-10000#5.3:story", skill: "4.4-subtract-within-10000", level: 16, format, key,
    source: { answer: expression, check: null, values: null, derived: [], slots: slots.map(([name, value]) => ({ name, value: { int: String(value) }, domain: { min: 0, max: 999_999 } })) } });

/** A fixed set: the book's shapes above today's limits, and #525 shapes within them. */
const FIXED: QuestionPackage[] = [
  subtractFromTenThousand("Leo", "stickers", [3, 6, 1, 4]),
  subtractFromTenThousand("Ivy", "points", [0, 4, 0, 8], "tick-and-number"),
  eachHasStory("crate", 284, "apples", "Nora", 7),
  putsInEachStory("Theo", 4, "shells", "box", "boxes", 6),
  thousandsSum(16200, 3900),
  thousandsSum(14700, 5100, { name: "Rui", things: "stamps" }),
  bareSum(352418, 41275),
  boxesThenSells("Mo", 4, 236, "beads"),
  addsThousandChain(73562),
  template("bare-small", "4800 + 2700 = ?", "a + b", [["a", 4800], ["b", 2700]], 7500, "write-number"),
  template("story-small", "Jin has 4300 cards. He gives 1250 away. How many cards are left?", "a - b", [["a", 4300], ["b", 1250]], 3050),
  template("story-big", "Jin has 43000 cards. He gives 1250 away. How many cards are left?", "a - b", [["a", 43000], ["b", 1250]], 41750),
  template("bond", "7 + ? = 10", "a - b", [["a", 10], ["b", 7]], 3, "write-number"),
  template("expression", "What is 9 + 3 × 2?", "a + b * 2", [["a", 9], ["b", 3]], 15, "write-number"),
  template("each-holds", "Each jar holds 120 beads. Ana fills 6 of them. How many beads is that?", "a * b", [["a", 120], ["b", 6]], 720),
  template("missing", "13000 − ? = 3000", "a - c", [["a", 13000], ["c", 3000]], 10000, "write-number"),
];

describe("the generator is unchanged by Maya's adapter", () => {
  it("still refuses 10000 + 2000 by default, in the operation check and the package check", () => {
    expect(operationProblem({ kind: "add", operands: [10000, 2000] })).toBe("code checks additions only of whole numbers up to 9999");
    expect(operationProblem({ kind: "subtract", operands: [10000, 3615] })).toBe("code checks subtractions only of whole numbers up to 9999");
    expect(operationProblem({ kind: "divide", operands: [1464, 244] })).toBe("code checks divisions only up to 9999 ÷ 99");
    // The bare sum's #525 operation is found, then refused for its size: the stored package keeps no operation.
    const bare = thousandsSum(18300, 2100);
    expect(withWorkbookMayaOperation(bare)).toBe(bare);
  });

  it("attaches the same #525 teaching data to a fixed set as before", () => {
    const out = FIXED.map((p) => {
      expect(checkQuestionPackage(p).ok, p.text).toBe(true);
      const made = withWorkbookMayaOperation(p);
      return { text: p.text, same: made === p, operation: made.operation, answer: made.answer, easier: made.easierExample?.text ?? null, source: made.operationSource ?? null };
    });
    expect(out).toMatchSnapshot();
  });

  it("finalizes a draft the same way as before", () => {
    const draft = { pages: [{ number: 1, questions: FIXED.map((p, i) => ({ number: i + 1, package: p })) }] } as unknown as GeneratedWorkbook;
    const attached = attachWorkbookMayaOperations(draft);
    expect(attached.pages[0].questions.map((q) => q.package?.operation ?? null)).toMatchSnapshot();
  });
});
