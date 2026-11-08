// The checked fixtures of the behaviour gate (#324): the teaching research's questions A to F
// (`.design/research/ta-pedagogy-2026-10/maya-teaching.md`, section 7), each a full question package built from the
// worked-steps code, with its wrong answers and an easier example, checked by `checkQuestionPackage` like any package.
// `A_BAD_KEY` is fixture A with a wrong answer key (56 while the checked steps total 66), for the content hold (C36).
// `D_SIMPLEST` is fixture D with a question that asks for the simplest form (C38c, #407). `G` is a fraction kind Maya does
// not teach yet (equivalent fractions, C36b). `EV_TWO`, `EV_STORY` and `EV_MISSING` are evaluate questions (Wave A, A2):
// a two-part expression, a story's two operations, and a missing number found by working the other side first. Synthetic
// numbers, in the shapes of the workbook's multi-step templates.
import { mayaPackageCheck } from "@/lib/maya";
import { claimTeaching } from "@/lib/maya-teaching/claim";
import { deriveDieCount } from "@/lib/maya-teaching/die-count";
import { deriveSymmetry } from "@/lib/maya-teaching/symmetry";
import { diePrinted, symmetryPrinted } from "@/lib/maya-teaching/topic-samples";
import { workedSteps, type AnswerValue, type Operation, type QuestionPackage, type WrongAnswer } from "@/lib/question-package";
import { CLAIM_DECIMAL, CLAIM_DIVIDE, CLAIM_GREATER, CLAIM_TRUE_FALSE } from "./claim-fixtures";
import { ONE_STEP_FIXTURES, type OneStepFixtureId } from "./one-step-cases";

export type FixtureId = "A" | "B" | "C" | "D" | "D_SIMPLEST" | "E" | "F" | "G" | "A_BAD_KEY" | OneStepFixtureId
  | "EV_TWO" | "EV_STORY" | "EV_MISSING" | "CLAIM_TF" | "CLAIM_GT" | "CLAIM_DEC" | "CLAIM_DIV" | "DIE" | "SHAPES" | "DIE12" | "SHAPES_LONG";

/** A claim question's teaching package (A4): the stored synthetic package with its derived operation. */
function claimFixture(raw: QuestionPackage): QuestionPackage {
  const pkg = claimTeaching(raw);
  if (!pkg) throw new Error(`fixtures: the claim ${raw.id} does not derive`);
  return pkg;
}

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

const D = fixture({
  id: "gate-D-3/4+1/8",
  text: "3/4 + 1/8 = ?",
  operation: { kind: "fraction-add", operands: [frac(3, 4), frac(1, 8)] },
  answer: frac(7, 8),
  skill: "8.5-add-subtract-unlike",
  level: 26,
  wrong: [{ value: frac(4, 12), cause: "F2", description: "Adds the denominators", step: null }],
  easier: { text: "1/5 + 2/5 = ?", operation: { kind: "fraction-add", operands: [frac(1, 5), frac(2, 5)] }, answer: frac(3, 5) },
});

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
  D,
  // C38c: the same question, asking for the simplest form: an equal fraction (14/16) is simplified first.
  D_SIMPLEST: { ...D, id: "gate-D-simplest", text: "3/4 + 1/8 = ? Write your answer in simplest form." },
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
  // C36b: equivalent fractions, a kind Maya does not teach yet (#407): held.
  G: fixture({
    id: "gate-G-3/4=?/12",
    text: "3/4 = ?/12",
    operation: { kind: "fraction-equivalent", operands: [frac(3, 4)], denominator: 12 },
    answer: frac(9, 12),
    skill: "5.3-equivalent-fractions",
    level: 17,
    wrong: [{ value: frac(11, 12), cause: "F9", description: "Adds the same number to the top and the bottom", step: null }],
    easier: { text: "1/2 = ?/4", operation: { kind: "fraction-equivalent", operands: [frac(1, 2)], denominator: 4 }, answer: frac(2, 4) },
  }),
  // Evaluate (Wave A, A2): each part in the order of operations, with an easier example of the same shape.
  EV_TWO: fixture({
    id: "gate-EV-7x640+7x30",
    text: "What is 7 × 640 + 7 × 30?",
    operation: { kind: "evaluate", operands: ["7 × 640 + 7 × 30"] },
    answer: num(4690),
    skill: "5.9-multiply-tens",
    level: 16,
    wrong: [{ value: num(4480), cause: "stops-early", description: "Works out only the first part", step: null }],
    easier: { text: "2 × 30 + 2 × 4 = ?", operation: { kind: "evaluate", operands: ["2 × 30 + 2 × 4"] }, answer: num(68) },
  }),
  EV_STORY: fixture({
    id: "gate-EV-4x260-590",
    text: "A shop has 4 boxes with 260 beads in each. It sells 590 beads. How many beads does it have now?",
    operation: { kind: "evaluate", operands: ["4 × 260 − 590"] },
    answer: num(450),
    skill: "5.9-multiply-tens",
    level: 16,
    wrong: [{ value: num(1630), cause: "wrong-operation", description: "Adds the beads sold", step: null }],
    easier: { text: "3 × 20 − 15 = ?", operation: { kind: "evaluate", operands: ["3 × 20 − 15"] }, answer: num(45) },
  }),
  EV_MISSING: fixture({
    id: "gate-EV-8x?=7360-400",
    text: "8 × ? = 7360 − 400",
    operation: { kind: "evaluate", operands: ["(7360 − 400) ÷ 8"] },
    answer: num(870),
    skill: "5.9-multiply-tens",
    level: 16,
    wrong: [{ value: num(6960), cause: "stops-early", description: "Works out the other side and stops", step: null }],
    easier: { text: "(20 − 4) ÷ 8 = ?", operation: { kind: "evaluate", operands: ["(20 − 4) ÷ 8"] }, answer: num(2) },
  }),
  // C36: the package says 56 while its checked steps total 66. The package check refuses it, so the call is held.
  A_BAD_KEY: { ...A, id: "gate-A-bad-key", answer: { value: num(56), accepted: [], unit: null } },
  // Wave C "other-topic" (src/lib/maya-teaching): made by the derivers from synthetic printed packages. DIE: "Roll a die
  // numbered 1 to 8. How many of the numbers are even?" as 8 ÷ 2; SHAPES: a regular hexagon and a regular pentagon,
  // 6 + 5 lines of symmetry from code's table.
  DIE: deriveDieCount(diePrinted(8, "even"))!,
  SHAPES: deriveSymmetry(symmetryPrinted(4, 5))!,
  ...ONE_STEP_FIXTURES,
  // Claim questions (A4): "True or false: 6 × 8 = 48.", "Is 4 × 360 greater than 1436?", "True or false: 3.45 + 2.38 = 5.93."
  CLAIM_TF: claimFixture(CLAIM_TRUE_FALSE),
  CLAIM_GT: claimFixture(CLAIM_GREATER),
  CLAIM_DEC: claimFixture(CLAIM_DECIMAL),
  // "Mia says 6 × 8 = 56. Check with 56 ÷ 8. Is Mia right?": the claim checked by the division the question prints.
  CLAIM_DIV: claimFixture(CLAIM_DIVIDE),
  // Review of #731: die 12 (two division steps, 12 ÷ 2) and the longest shape names (a rectangle that is not a square and
  // an isosceles triangle, 2 + 1), for grade 3 turns.
  DIE12: deriveDieCount(diePrinted(12, "odd"))!,
  SHAPES_LONG: deriveSymmetry(symmetryPrinted(1, 2))!,
};

/** Fixtures that must pass the package check; the bad key must fail it. */
export function fixtureProblems(): string[] {
  return (Object.entries(FIXTURES) as [FixtureId, QuestionPackage][]).flatMap(([id, pkg]) => {
    // Maya's own check: her wider limits hold for the adapter-made fixtures (W5, W3, W6) only.
    const check = mayaPackageCheck(pkg);
    if (id === "A_BAD_KEY") return check.ok ? [`${id}: the bad key passed the package check`] : [];
    return check.ok ? [] : [`${id}: ${check.reason}`];
  });
}
