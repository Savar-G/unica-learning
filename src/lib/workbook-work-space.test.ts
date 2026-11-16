import { expect, it } from "vitest";
import { bcStepProgressions } from "./workbook-curriculum";
import { buildStepItem, stepTemplateItem } from "./workbook-step-items";
import { workQuestionNumbers, workbookWorkLine } from "./workbook-page-instructions";
import { bareCalculationWithoutRegrouping, questionWorkSpace, WORK_INSTRUCTION } from "./workbook-work-space";
import type { QuestionPackage } from "./question-package";

// Cedric's printed pages (#1116): "834 − 121 = ?" asked the child to show work, and the child copied the question. A
// question that is only its calculation and needs no carrying or borrowing gets no work space and is not on the "Show
// your work" line; one that regroups keeps its space and stays on the line.

const curriculum = bcStepProgressions();

/** The first bare item of a step whose text passes `want`. */
function bare(skill: string, step: number, want: (text: string) => boolean): QuestionPackage {
  for (let seed = 1; seed < 400; seed++) for (let attempt = 0; attempt < 8; attempt++) {
    const fill = stepTemplateItem({ curriculum, skill, step, place: "remember-these", level: 16, day: 1, seed, attempt, ordinal: 1 });
    if (!fill || fill.ref.format !== "bare" || !want(fill.text)) continue;
    const built = buildStepItem(fill.ref, fill.text, { id: "q1", workbookId: "w", page: 5, question: 1, level: 16, skills: [skill] }, "code");
    if (built.package && want(built.package.text)) return built.package;
  }
  throw new Error(`No bare item for ${skill}#${step}`);
}

it("finds a bare calculation with no carrying or borrowing", () => {
  for (const text of ["834 − 121 = ?", "834 - 121 = ?", "550 − 120 = ?", "3,412 + 5,231 = ?", "9 × 110 = ?", "110 × 9 = ?", "4.08 + 5.0 = ?", "7.95 − 2.4 = ?"])
    expect(bareCalculationWithoutRegrouping(text), text).toBe(true);
});

it("leaves a calculation that regroups, or one that is not bare, alone", () => {
  for (const text of [
    "3527 + 2436 = ?", "834 − 129 = ?", "1,000 − 1 = ?", "9 × 120 = ?", "10 × 40 = ?", "23 × 12 = ?", "1.8 + 2.9 = ?", "1.2 × 3 = ?",
    "120 ÷ 4 = ?", "? + 7 = 15", "4 × ? = 1,040", "121 − 834 = ?", "Mia has 834 tickets and gives 121 away. How many are left?", "−3 + 5 = ?",
  ]) expect(bareCalculationWithoutRegrouping(text), text).toBe(false);
});

it("gives a bare calculation with no regrouping no work space, and keeps the space of one that regroups", () => {
  const plain = bare("4.4-add-within-10000", 5, t => /^\s*[\d,]+ \+ [\d,]+ = \?$/.test(t) && bareCalculationWithoutRegrouping(t));
  const regroups = bare("4.4-add-within-10000", 5, t => /^\s*[\d,]+ \+ [\d,]+ = \?$/.test(t) && !bareCalculationWithoutRegrouping(t));
  expect(questionWorkSpace(plain)).toBe(0);
  expect(questionWorkSpace(regroups)).toBeGreaterThanOrEqual(32);

  const page = {
    content: { kind: "day" as const, id: "t", level: 16, day: 1, page: 3, pages: 8, topic: "Numbers", title: "Practice", subtitle: `Circle your answers. ${WORK_INSTRUCTION}`,
      grownUp: null, consistentLayout: true, blocks: [{ slot: "on-your-own" as const, items: [1, 2] }] },
    questions: [{ number: 1, package: plain }, { number: 2, package: regroups }],
  };
  expect(workQuestionNumbers(page)).toEqual([2]);
  expect(workbookWorkLine(page)).toBe("Show your work under question 2.");
});
