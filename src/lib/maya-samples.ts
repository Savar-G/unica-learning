// Sample question packages for Maya's text sessions (#322): the command line (`npm run maya:text -- --question <id>`),
// the tests and, later, the parent "Try Maya" sample. Each is built from the worked-steps code and checked by the
// session like any other package. 27 + 39 is the teaching research's binding example.
import { workedSteps, type QuestionPackage } from "@/lib/question-package";

const num = (value: number) => ({ type: "number" as const, value });

function sample(id: string, kind: "add" | "subtract", a: number, b: number, easier: [number, number], wrong: QuestionPackage["wrongAnswers"]): QuestionPackage {
  const sign = kind === "add" ? "+" : "-";
  const value = (x: number, y: number) => (kind === "add" ? x + y : x - y);
  return {
    id,
    ref: { source: "workbook", workbookId: "sample", page: 1, question: 1 },
    templateId: null,
    text: `${a} ${sign} ${b} = ?`,
    answer: { value: num(value(a, b)), accepted: [], unit: null },
    operation: { kind, operands: [a, b] },
    steps: workedSteps({ kind, operands: [a, b] }),
    skill: { standard: "2.4", skills: [kind === "add" ? "2.4-add-within-100" : "2.4-subtract-within-100"] },
    level: 9,
    difficulty: 2,
    wrongAnswers: wrong,
    easierExample: {
      text: `${easier[0]} ${sign} ${easier[1]} = ?`,
      operation: { kind, operands: easier },
      answer: num(value(...easier)),
      steps: workedSteps({ kind, operands: easier }),
    },
  };
}

export const SAMPLE_PACKAGES: Record<string, QuestionPackage> = {
  "add-27-39": sample("add-27-39", "add", 27, 39, [18, 5], [
    { value: num(56), cause: "O3", description: "Forgets to carry when adding", step: "tens" },
  ]),
  "subtract-83-46": sample("subtract-83-46", "subtract", 83, 46, [42, 7], [
    { value: num(43), cause: "O1", description: "Takes the smaller ones digit from the larger", step: "ones" },
    { value: num(47), cause: "regroup-forget", description: "Does not take the ten from the tens", step: "tens" },
  ]),
};
