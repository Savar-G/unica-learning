// Admit only printed comparisons whose text, template and stored key agree (readTopicQuestion).
import { checkQuestionPackage, sameValue, workedSteps, type QuestionPackage } from "../question-package";
import { comparisonAnswer, comparisonProblem, comparisonText, type ComparisonOperation } from "../question-package-comparison";
import { readTopicQuestion } from "./topic-claims";
import { MAYA_TEACHING_LIMITS, TEACHING_SOURCE } from "./limits";

function operation(printed: QuestionPackage): ComparisonOperation | null {
  const read = readTopicQuestion(printed);
  if (read?.topic === "same-denominator") return { kind: "comparison", context: "same-denominator", operands: [read.claim.left, read.claim.right], denominator: read.claim.denominator };
  if (read?.topic === "area-compare" && read.work.every(w => w.kind === "multiply")) {
    return { kind: "comparison", context: "rectangle-areas", operands: read.work.flatMap(w => [...w.operands]) as [number, number, number, number] };
  }
  if (read?.topic === "die-compare") {
    const threshold = Number(/^less than ([2356])$/.exec(read.words[1])?.[1]);
    if ([2, 3, 5, 6].includes(threshold)) return { kind: "comparison", context: "die-events", operands: [threshold as 2 | 3 | 5 | 6] };
  }
  return null;
}

/** Fresh examples never reuse a target operand, computed product, event outcome or count. */
function numbers(op: ComparisonOperation): number[] {
  const out: number[] = [];
  const visit = (v: unknown): void => {
    if (typeof v === "number") out.push(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(op); visit(workedSteps(op));
  if (op.context === "die-events") visit([1, 2, 3, 4, 5, 6]);
  return out;
}

function* examples(op: ComparisonOperation): Generator<ComparisonOperation> {
  if (op.context === "same-denominator") {
    // Comparing same-size pieces isolates the same numerator comparison with fewer written numbers.
    for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) if (a !== b) yield { kind: "comparison", context: "equal-pieces", operands: [a, b] };
  } else if (op.context === "rectangle-areas") {
    for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) if (a !== b) yield { kind: "comparison", context: "rectangle-areas", operands: [1, a, 1, b] };
  } else if (op.context === "die-events") {
    for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) if (a !== b) yield { kind: "comparison", context: "counter-counts", operands: [a, b] };
  }
}

export function deriveComparison(printed: QuestionPackage): QuestionPackage | null {
  const op = operation(printed), read = readTopicQuestion(printed);
  if (!op || !read || comparisonProblem(op)) return null;
  const answer = comparisonAnswer(op);
  if (!("answer" in read) || answer.value !== read.answer) return null;
  const own = new Set(numbers(op));
  for (const example of examples(op)) {
    if (comparisonProblem(example) || numbers(example).some(n => own.has(n))) continue;
    const exampleAnswer = comparisonAnswer(example);
    if (sameValue(answer, exampleAnswer)) continue;
    const made: QuestionPackage = {
      ...printed, operationSource: TEACHING_SOURCE, operation: op,
      answer: { value: answer, accepted: [], unit: null }, steps: workedSteps(op),
      wrongAnswers: [{ value: comparisonAnswer(op, !(comparisonSidesLeft(op))), cause: "comparison", description: "Chooses the other relation or side.", step: "compare" }],
      easierExample: { text: comparisonText(example), operation: example, answer: exampleAnswer, steps: workedSteps(example) },
    };
    if (checkQuestionPackage(made, undefined, MAYA_TEACHING_LIMITS).ok) return made;
  }
  return null;
}

const comparisonSidesLeft = (op: ComparisonOperation) => comparisonAnswer(op).value === comparisonAnswer(op, true).value;
