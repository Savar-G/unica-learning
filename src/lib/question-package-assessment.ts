// The assessment adapter (#298, spec #295): turns a question of a child's stored assessment test into a question
// package (src/lib/question-package.ts), so Maya and the team can work on assessment questions before workbook data
// exists. It gives a package only for the templates listed here, where code knows the operation behind the drawn
// numbers and the step of each coded wrong answer. Every other template is "content unavailable": its text is not
// parsed and nothing is guessed.
//
// Supported templates (BC standard 2.4, level U9 "Adding to 100, rulers and money", difficulty 2):
// - 2-add-2-digit: a + b, two-digit numbers whose ones carry and whose sum stays under 100 (48 + 37). Easier example:
//   a two-digit number plus a one-digit number that carries (26 + 7).
// - 2-subtract-2-digit: a - b, two-digit numbers whose ones need regrouping (83 - 46). Easier example: a two-digit
//   number minus a one-digit number that needs regrouping (42 - 7).
// The story versions (2-story-add-2-digit, 2-story-subtract-2-digit) are not supported yet.
//
// The readers (src/lib/assessment-questions.ts in Supabase, src/lib/assessment-questions-memory.ts in memory) find the
// stored question and pass it here. Pure TypeScript: no Next.js, React, network, database or clock.
import { MISCONCEPTIONS, templateSkills, type MisconceptionId, type Question, type Route, type StoredTest } from "@/lib/assessment";
import {
  checkQuestionPackage,
  operationProblem,
  operationResult,
  operationText,
  sameValue,
  workedSteps,
  type AssessmentQuestionRef,
  type Difficulty,
  type Operation,
  type QuestionLookup,
  type QuestionPackage,
  type UnavailableReason,
  type WrongAnswer,
} from "@/lib/question-package";

/** What code knows about a supported template. */
interface Supported {
  kind: "add" | "subtract";
  standard: string;
  level: number;
  difficulty: Difficulty;
  /** The worked step where each coded wrong answer's mistake happens; null when it is not one step. */
  steps: Partial<Record<MisconceptionId, string | null>>;
  /** Easier examples in order of preference; the first whose ones differ from the question's is used. */
  easier: readonly [number, number][];
}

const SUPPORTED: Record<string, Supported> = {
  "2-add-2-digit": {
    kind: "add", standard: "2.4", level: 9, difficulty: 2,
    // O3 forgets the carried ten in the tens; "operation" subtracts instead.
    steps: { O3: "tens", operation: null },
    easier: [[26, 7], [38, 5], [17, 6], [45, 9]],
  },
  "2-subtract-2-digit": {
    kind: "subtract", standard: "2.4", level: 9, difficulty: 2,
    // O1 takes the smaller ones digit from the larger; regroup-forget does not take the ten from the tens.
    steps: { O1: "ones", "regroup-forget": "tens" },
    easier: [[42, 7], [53, 8], [31, 4], [64, 9]],
  },
};

/** The assessment templates that have full packages. */
export const SUPPORTED_ASSESSMENT_TEMPLATES: readonly string[] = Object.keys(SUPPORTED);

const ones = ([a, b]: readonly [number, number]) => `${a % 10}-${b % 10}`;
const unavailable = (reason: UnavailableReason, detail: string): QuestionLookup => ({ status: "unavailable", reason, detail });

/** The package for a stored assessment question, or "content unavailable" for a template that is not supported. */
export function assessmentQuestionPackage(ref: AssessmentQuestionRef, question: Question): QuestionLookup {
  const known = SUPPORTED[question.templateId];
  if (!known) return unavailable("unsupported-template", `template ${question.templateId} has no question package`);

  const operands: [number, number] = [question.values.a, question.values.b];
  const operation: Operation = { kind: known.kind, operands };
  const problem = operationProblem(operation);
  if (problem) return unavailable("invalid-package", `the stored numbers: ${problem}`);
  const answer = operationResult(operation);
  if (!sameValue(answer, { type: "number", value: Number(question.answer) })) {
    return unavailable("invalid-package", `the stored answer ${question.answer} is not what ${operationText(operation)} gives`);
  }

  const wrongAnswers: WrongAnswer[] = [];
  for (const w of question.wrong) {
    const step = known.steps[w.misconception];
    if (step === undefined) return unavailable("invalid-package", `the wrong answer ${w.value} has a cause (${w.misconception}) this template does not expect`);
    wrongAnswers.push({ value: { type: "number", value: Number(w.value) }, cause: w.misconception, description: MISCONCEPTIONS[w.misconception].description, step });
  }

  const pair = known.easier.find((p) => ones(p) !== ones(operands)) ?? known.easier[0];
  const easier: Operation = { kind: known.kind, operands: [...pair] };
  const candidate: QuestionPackage = {
    id: `${ref.assessmentId}:${ref.questionId}`,
    ref,
    templateId: question.templateId,
    text: question.prompt,
    answer: { value: answer, accepted: [], unit: null },
    operation,
    steps: workedSteps(operation),
    skill: { standard: known.standard, skills: templateSkills(question.templateId).map((s) => s.id) },
    level: known.level,
    difficulty: known.difficulty,
    wrongAnswers,
    easierExample: { text: `${operationText(easier)} = ?`, operation: easier, answer: operationResult(easier), steps: workedSteps(easier) },
  };
  const check = checkQuestionPackage(candidate);
  return check.ok ? { status: "found", package: check.package } : unavailable("invalid-package", check.reason);
}

/** Reads a question of a stored assessment test as a package. Adapters: Supabase and in memory. */
export interface AssessmentQuestionReader {
  question(ref: AssessmentQuestionRef): Promise<QuestionLookup>;
}

/**
 * The questions a child was given in a stored test: stage 1, and the stage 2 form of its route once it is routed.
 * The other stage 2 forms are kept in the test but never shown.
 */
function givenQuestion(test: StoredTest, route: Route | null, questionId: string): Question | undefined {
  return [...test.stage1, ...(route ? test.stage2[route] : [])].find((q) => q.id === questionId);
}

/** A reader's answer from a stored test row: the package of a question the child was given, or not found. */
export function lookupStoredQuestion(ref: AssessmentQuestionRef, row: { test: StoredTest; route: Route | null } | null): QuestionLookup {
  const question = row && givenQuestion(row.test, row.route, ref.questionId);
  return question ? assessmentQuestionPackage(ref, question) : { status: "not-found" };
}
