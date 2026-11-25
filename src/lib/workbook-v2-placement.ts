// Workbook placement uses assessment evidence without changing the assessment report's working level.
import { fillTemplate, GRADE_1_2_BANK, type Answer, type Question } from "@/lib/assessment";
import { sameQuestion } from "@/lib/assessment/session";

export type V2WorkbookLevel = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
type WorkingLevel = 0 | 1 | V2WorkbookLevel;
type Evidence = {
  questions: readonly Question[];
  answers: readonly Pick<Answer, "questionId" | "correct">[];
};
type Placement =
  | { kind: "needs_assessment" }
  | { kind: "needs_level_3_check"; questions: readonly Question[] }
  | { kind: "placed"; level: V2WorkbookLevel; topic: 1 };

const ADDITION = ["2-add-2-digit", "2-story-add-2-digit"];
const SUBTRACTION = ["2-subtract-2-digit", "2-story-subtract-2-digit"];

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
  const prerequisiteIds = [...ADDITION, ...SUBTRACTION];
  const equivalent = prerequisiteIds.map(id => answeredTemplates.get(id));
  if (equivalent.every(question => question !== undefined)) {
    const right = equivalent.filter(question => scored.get(question.id) === true).length;
    return { kind: "placed", level: right >= 3 ? 3 : 2, topic: 1 };
  }

  const used = new Set(assessment.questions.map(sameQuestion));
  const questions = prerequisiteIds.map((id, index) => {
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
  return { kind: "placed", level: right >= 3 ? 3 : 2, topic: 1 };
}
