// The checked fixtures of the behaviour gate (#324): the teaching research's questions A to F
// (`.design/research/ta-pedagogy-2026-10/maya-teaching.md`, section 7), each a full question package built from the
// worked-steps code, with its wrong answers and an easier example, checked by `checkQuestionPackage` like any package.
// `A_BAD_KEY` is fixture A with a wrong answer key (56 while the checked steps total 66), for the content hold (C36).
import { checkQuestionPackage, workedSteps, type AnswerValue, type Operation, type QuestionPackage, type WrongAnswer } from "@/lib/question-package";

export type FixtureId = "A" | "B" | "C" | "D" | "E" | "F" | "A_BAD_KEY";

const num = (value: number): AnswerValue => ({ type: "number", value });
const frac = (numerator: number, denominator: number) => ({ type: "fraction" as const, numerator, denominator });

function fixture(input: {
  id: string;
  text: string;
  operation: Operation;
  answer: AnswerValue;
  unit?: string | null;
  skill: string;
  level: number;
  wrong: WrongAnswer[];
  easier: { text: string; operation: Operation; answer: AnswerValue };
}): QuestionPackage {
  return {
    id: input.id,
    ref: { source: "workbook", workbookId: "behaviour-gate", page: 1, question: 1 },
    templateId: null,
    text: input.text,
    answer: { value: input.answer, accepted: [], unit: input.unit ?? null },
    operation: input.operation,
    steps: workedSteps(input.operation),
    skill: { standard: input.skill.split("-")[0], skills: [input.skill] },
    level: input.level,
    difficulty: 2,
    wrongAnswers: input.wrong,
    easierExample: { ...input.easier, steps: workedSteps(input.easier.operation) },
  };
}

const A = fixture({
  id: "gate-A-27-39",
  text: "27 + 39 = ?",
  operation: { kind: "add", operands: [27, 39] },
  answer: num(66),
  skill: "2.4-add-within-100",
  level: 9,
  wrong: [{ value: num(56), cause: "O3", description: "Forgets the extra ten from the ones", step: "tens" }],
  easier: { text: "18 + 15 = ?", operation: { kind: "add", operands: [18, 15] }, answer: num(33) },
});

export const FIXTURES: Record<FixtureId, QuestionPackage> = {
  A,
  B: fixture({
    id: "gate-B-52-28",
    text: "52 - 28 = ?",
    operation: { kind: "subtract", operands: [52, 28] },
    answer: num(24),
    skill: "2.4-subtract-within-100",
    level: 9,
    wrong: [{ value: num(36), cause: "O1", description: "Takes the smaller digit from the larger in each column", step: "ones" }],
    easier: { text: "31 - 17 = ?", operation: { kind: "subtract", operands: [31, 17] }, answer: num(14) },
  }),
  C: fixture({
    id: "gate-C-6x4",
    text: "6 × 4 = ?",
    operation: { kind: "multiply", operands: [6, 4] },
    answer: num(24),
    skill: "4.8-multiplication-facts",
    level: 12,
    wrong: [{ value: num(10), cause: "wrong-operation", description: "Adds instead of multiplying", step: null }],
    easier: { text: "3 × 2 = ?", operation: { kind: "multiply", operands: [3, 2] }, answer: num(6) },
  }),
  D: fixture({
    id: "gate-D-3/4+1/8",
    text: "3/4 + 1/8 = ?",
    operation: { kind: "fraction-add", operands: [frac(3, 4), frac(1, 8)] },
    answer: frac(7, 8),
    skill: "8.5-add-subtract-fractions",
    level: 24,
    wrong: [{ value: frac(4, 12), cause: "F2", description: "Adds the denominators", step: null }],
    easier: { text: "1/5 + 2/5 = ?", operation: { kind: "fraction-add", operands: [frac(1, 5), frac(2, 5)] }, answer: frac(3, 5) },
  }),
  E: fixture({
    id: "gate-E-0.6+0.25",
    text: "0.6 + 0.25 = ?",
    operation: { kind: "decimal-add", operands: [0.6, 0.25] },
    answer: num(0.85),
    skill: "4.6-add-decimals",
    level: 14,
    wrong: [{ value: num(0.31), cause: "D1", description: "Lines up the last digits instead of the places", step: null }],
    easier: { text: "0.4 + 0.3 = ?", operation: { kind: "decimal-add", operands: [0.4, 0.3] }, answer: num(0.7) },
  }),
  F: fixture({
    id: "gate-F-area-7x4",
    text: "A rectangle is 7 cm long and 4 cm wide. What is its area? 7 × 4 = ?",
    operation: { kind: "multiply", operands: [7, 4] },
    answer: num(28),
    unit: "cm²",
    skill: "3.9-area-square-units",
    level: 11,
    wrong: [{ value: num(22), cause: "M2", description: "Finds the perimeter instead of the area", step: null }],
    easier: { text: "3 × 2 = ?", operation: { kind: "multiply", operands: [3, 2] }, answer: num(6) },
  }),
  // C36: the package says 56 while its checked steps total 66. The package check refuses it, so the call is held.
  A_BAD_KEY: { ...A, id: "gate-A-bad-key", answer: { value: num(56), accepted: [], unit: null } },
};

/** Fixtures that must pass the package check; the bad key must fail it. */
export function fixtureProblems(): string[] {
  return (Object.entries(FIXTURES) as [FixtureId, QuestionPackage][]).flatMap(([id, pkg]) => {
    const check = checkQuestionPackage(pkg);
    if (id === "A_BAD_KEY") return check.ok ? [`${id}: the bad key passed the package check`] : [];
    return check.ok ? [] : [`${id}: ${check.reason}`];
  });
}
