// Synthetic claim questions (Wave A, A4) with the template shapes of the workbook's true/false and yes/no circle items:
// the stored package (no operation; the item's circled word is the template's answer) and its numbers chosen here, never
// copied from a child's book. src/lib/maya-teaching/claim.ts derives each one's teaching package.
import type { QuestionPackage } from "@/lib/question-package";
import type { TemplateSource } from "@/lib/question-package-template";

type Slot = [name: string, value: string, min: number, max: number];

function claimPackage(input: {
  id: string;
  question: number;
  templateId: string;
  text: string;
  skill: string;
  choices: ["true", "false"] | ["yes", "no"];
  answer: string;
  slots: Slot[];
  derived: [string, string][];
  expression: string;
  check?: string;
}): QuestionPackage {
  const source: TemplateSource = {
    answer: input.expression,
    check: input.check ?? null,
    derived: input.derived,
    slots: input.slots.map(([name, value, min, max]) => ({ name, value: { int: value }, domain: { min, max } })),
    values: null,
  };
  return {
    id: input.id,
    ref: { source: "workbook", workbookId: "claim-gate", page: 1, question: input.question },
    templateId: input.templateId,
    textSource: "code",
    text: input.text,
    item: {
      format: "circle",
      scorable: true,
      parentChecked: false,
      regions: [{ id: "answer", kind: "choice", mark: "circle", label: null, choices: input.choices, answer: input.answer }],
      checks: [{ kind: "template-choice", region: "answer", source }],
      error: null,
    },
    answer: null,
    operation: null,
    steps: [],
    skill: { standard: input.skill.split("-")[0], skills: [input.skill] },
    level: 16,
    difficulty: 2,
    wrongAnswers: [],
    easierExample: null,
  };
}

/** A true/false product claim that holds: 6 × 8 = 48 (4.8 facts shape). */
export const CLAIM_TRUE_FALSE = claimPackage({
  id: "claim-gate-tf", question: 1, templateId: "4.8-multiplication-facts#3.3:true-false",
  text: "True or false: 6 × 8 = 48.", skill: "4.8-multiplication-facts", choices: ["true", "false"], answer: "true",
  slots: [["a", "6", 6, 9], ["b", "8", 6, 9], ["flip", "0", 0, 1], ["u3", "2", 0, 9]],
  derived: [["shown", "a * b if flip == 0 else a * b + 1 + u3 % 4"]],
  expression: "'true' if flip == 0 else 'false'",
});

/** A yes/no "greater than" claim that holds: 4 × 360 is greater than 1436 (5.9 multiply-tens shape). */
export const CLAIM_GREATER = claimPackage({
  id: "claim-gate-gt", question: 2, templateId: "5.9-multiply-tens#1.4:true-false",
  text: "Is 4 × 360 greater than 1436? Circle yes or no.", skill: "5.9-multiply-tens", choices: ["yes", "no"], answer: "yes",
  slots: [["a0", "4", 1, 9], ["b0", "364", 10, 900], ["f", "0", 0, 1]],
  derived: [["a", "a0"], ["b", "b0 // 10 * 10"], ["c", "a * b - a if f == 0 else a * b + a"]],
  expression: "'yes' if f == 0 else 'no'", check: "b0 >= 10",
});

/** A true/false decimal sum that does not hold: 3.45 + 2.38 is 5.83, not 5.93 (4.6 add-decimals shape). */
export const CLAIM_DECIMAL = claimPackage({
  id: "claim-gate-dec", question: 3, templateId: "4.6-add-decimals#4.4:true-false",
  text: "True or false: 3.45 + 2.38 = 5.93.", skill: "4.6-add-decimals", choices: ["true", "false"], answer: "false",
  slots: [["A", "345", 100, 999], ["B", "238", 100, 999], ["flip", "1", 0, 1]],
  derived: [
    ["sa", "str(A // 100) + '.' + str(A % 100)"],
    ["sb", "str(B // 100) + '.' + str(B % 100)"],
    ["sh", "str((A + B + 10) // 100) + '.' + str((A + B + 10) % 100) if flip == 1 else str((A + B) // 100) + '.' + str((A + B) % 100)"],
  ],
  expression: "'true' if flip == 0 else 'false'",
});

/** "Is it right?" with the check the question prints: 56 ÷ 8 is 7, not 6, so Mia is not right (5.9 recall-facts shape). */
export const CLAIM_DIVIDE = claimPackage({
  id: "claim-gate-div", question: 4, templateId: "5.9-recall-facts#3.2:story",
  text: "Mia says 6 × 8 = 56. Check with 56 ÷ 8. Is Mia right? Circle yes or no.", skill: "5.9-recall-facts", choices: ["yes", "no"], answer: "no",
  slots: [["a0", "5", 1, 10], ["b0", "7", 2, 10], ["f", "1", 0, 1]],
  derived: [["b", "2 + (b0 - 1) % 9"], ["a", "1 + a0 % 10"], ["c", "a * b if f == 0 else a * b + b"]],
  expression: "'yes' if f == 0 else 'no'",
});

/** A yes/no "is it right?" claim that does not hold: 7 × 4 is 28, not 32 (5.9 recall-facts shape). */
export const CLAIM_RIGHT = claimPackage({
  id: "claim-gate-right", question: 5, templateId: "5.9-recall-facts#3.1:true-false",
  text: "Is 7 × 4 = 32 right? Circle yes or no.", skill: "5.9-recall-facts", choices: ["yes", "no"], answer: "no",
  slots: [["a0", "6", 1, 10], ["b0", "3", 2, 10], ["f", "1", 0, 1]],
  derived: [["b", "2 + (b0 - 1) % 9"], ["a", "1 + a0 % 10"], ["c", "a * b if f == 0 else a * b + b"]],
  expression: "'yes' if f == 0 else 'no'",
});

/** Large numbers for the word limits (lesson 3): 7 × 890 is not greater than 6237, worked as 890 × 7 (5.9 shape). */
export const CLAIM_LARGE = claimPackage({
  id: "claim-gate-large", question: 6, templateId: "5.9-multiply-tens#1.4:true-false",
  text: "Is 7 × 890 greater than 6237? Circle yes or no.", skill: "5.9-multiply-tens", choices: ["yes", "no"], answer: "no",
  slots: [["a0", "7", 1, 9], ["b0", "894", 10, 900], ["f", "1", 0, 1]],
  derived: [["a", "a0"], ["b", "b0 // 10 * 10"], ["c", "a * b - a if f == 0 else a * b + a"]],
  expression: "'yes' if f == 0 else 'no'", check: "b0 >= 10",
});

/** Large numbers, two digits by three: 70 × 790 is greater than 55230 (5.9 shape). */
export const CLAIM_LARGE_ROWS = claimPackage({
  id: "claim-gate-large-rows", question: 7, templateId: "5.9-multiply-tens#2.4:true-false",
  text: "Is 70 × 790 greater than 55230? Circle yes or no.", skill: "5.9-multiply-tens", choices: ["yes", "no"], answer: "yes",
  slots: [["a0", "78", 10, 90], ["b0", "797", 10, 900], ["f", "0", 0, 1]],
  derived: [["a", "a0 // 10 * 10"], ["b", "b0 // 10 * 10"], ["c", "a * b - a if f == 0 else a * b + a"]],
  expression: "'yes' if f == 0 else 'no'", check: "a0 >= 10 and b0 >= 10",
});

/** A round product (lesson 11): 3 × 20 is 60, so 2 × 3 = 6 would give it away. 60 is greater than 57 (5.9 shape). */
export const CLAIM_ROUND = claimPackage({
  id: "claim-gate-round", question: 8, templateId: "5.9-multiply-tens#1.4:true-false",
  text: "Is 3 × 20 greater than 57? Circle yes or no.", skill: "5.9-multiply-tens", choices: ["yes", "no"], answer: "yes",
  slots: [["a0", "3", 1, 9], ["b0", "24", 10, 900], ["f", "0", 0, 1]],
  derived: [["a", "a0"], ["b", "b0 // 10 * 10"], ["c", "a * b - a if f == 0 else a * b + a"]],
  expression: "'yes' if f == 0 else 'no'", check: "b0 >= 10",
});
