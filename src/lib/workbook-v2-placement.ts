// Workbook placement uses assessment evidence without changing the assessment report's working level.
import { GRADE_1_2_BANK } from "@/lib/assessment/bank";
import { fillTemplate, sameQuestion } from "@/lib/assessment/session";
import type { Answer, Question } from "@/lib/assessment/types";

export type V2WorkbookLevel = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type V2WorkbookStart = { level: V2WorkbookLevel; topic: 1 };
type WorkingLevel = 0 | 1 | V2WorkbookLevel;
type Evidence = {
  questions: readonly Question[];
  answers: readonly Pick<Answer, "questionId" | "correct">[];
};
type Placement =
  | { kind: "needs_assessment" }
  | { kind: "needs_level_3_check"; questions: readonly Question[] }
  | ({ kind: "placed" } & V2WorkbookStart);

const ADDITION = ["2-add-2-digit", "2-story-add-2-digit"];
const SUBTRACTION = ["2-subtract-2-digit", "2-story-subtract-2-digit"];
const PREREQUISITE_IDS = [...ADDITION, ...SUBTRACTION];
export const LEVEL_3_CHECK_QUESTION_COUNT = PREREQUISITE_IDS.length;
export const workbookStartFromPrerequisites = (right: number): V2WorkbookStart => ({ level: right >= 3 ? 3 : 2, topic: 1 });

export function placeV2Workbook(
  workingLevel: WorkingLevel | null,
  assessment: Evidence,
  seed: number,
  checkAnswers: Evidence["answers"] = [],
): Placement {
  if (workingLevel === null) return { kind: "needs_assessment" };
  if (workingLevel === 0 || workingLevel === 1) return { kind: "placed", level: 2, topic: 1 };
  if (workingLevel !== 2 && workingLevel !== 3) return { kind: "placed", level: workingLevel, topic: 1 };

  const scored = new Map(assessment.answers.map(answer => [answer.questionId, answer.correct]));
  const answeredTemplates = new Map(
    assessment.questions.filter(question => scored.has(question.id)).map(question => [question.templateId, question]),
  );
  const equivalent = PREREQUISITE_IDS.map(id => answeredTemplates.get(id));
  if (equivalent.every(question => question !== undefined)) {
    const right = equivalent.filter(question => scored.get(question.id) === true).length;
    return { kind: "placed", ...workbookStartFromPrerequisites(right) };
  }

  const used = new Set(assessment.questions.map(sameQuestion));
  const questions = PREREQUISITE_IDS.map((id, index) => {
    const template = GRADE_1_2_BANK.find(candidate => candidate.id === id);
    if (!template) throw new Error(`Missing Level 3 prerequisite template ${id}`);
    for (let variant = 0; variant < 100; variant++) {
      const question = fillTemplate(template, seed, "BC", `level-3-check-${index + 1}-${variant}`);
      const key = sameQuestion(question);
      if (used.has(key)) continue;
      used.add(key);
      return question;
    }
    throw new Error(`Could not draw a fresh Level 3 prerequisite question for ${id}`);
  });
  const checks = new Map(checkAnswers.map(answer => [answer.questionId, answer.correct]));
  if (questions.some(question => !checks.has(question.id))) return { kind: "needs_level_3_check", questions };
  const right = questions.filter(question => checks.get(question.id) === true).length;
  return { kind: "placed", ...workbookStartFromPrerequisites(right) };
}
