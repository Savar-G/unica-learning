import type { QuestionPackage, WorkbookQuestionRef } from "@/lib/question-package";

// A question Maya cannot teach yet (#527), for tests: "Yes or no: 3 and 4 make 6.", a yes-no tick item with no
// operation, as a workbook prints it. Its package checks; only Maya's teaching holds it.

const n = (value: number) => ({ type: "number" as const, value });

export function heldPackage(ref: WorkbookQuestionRef = { source: "workbook", workbookId: "wb-1", page: 4, question: 9 }): QuestionPackage {
  return {
    id: `wbq-${ref.page}-${ref.question}`,
    ref,
    templateId: null,
    text: "Yes or no: 3 and 4 make 6.",
    answer: null,
    operation: null,
    steps: [],
    skill: { standard: "2.4", skills: ["2.4-add-within-100"] },
    level: 3,
    difficulty: 2,
    wrongAnswers: [],
    easierExample: null,
    item: {
      format: "tick-one", scorable: true, parentChecked: false,
      regions: [{ id: "right", kind: "choice", mark: "tick", label: null, choices: ["yes", "no"], answer: "no" }],
      checks: [{ kind: "yes-no", region: "right", yes: "yes", no: "no", statement: { kind: "equation", equation: { left: n(3), op: "+", right: n(4), result: n(6) } } }],
      error: null,
    },
  };
}
