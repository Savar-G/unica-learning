import {
  computeExprAnswer,
  type ComputedMultiAnswer,
  type ComputedSingleAnswer,
  type Example,
  type ExamplePart,
  type ExampleStep,
  type Expr,
  type ReferenceRecord,
} from "@/lib/reference-record";
import { isConcreteAnswer, normalizeAnswerCompare, plainNumber, wholeNumberLists } from "./answer-text";
import type { AnswerNote } from "./answers";
import { compareLineWithExpr, parsePrintedLine, type LineVerdict, type PrintedLine } from "./printed-line";
import { answerValues, completeAnswer } from "./unproved-answers";

function sameAnswer(a: string, b: string): boolean {
  return normalizeAnswerCompare(a) === normalizeAnswerCompare(b);
}

// The whole chain with its blanks filled in, or the values themselves.
function filledValues(expr: Expr | null, values: readonly string[]): readonly string[] {
  if (expr?.kind === "word") return typeof expr.expr === "string" ? values : filledValues(expr.expr, values);
  if (expr?.kind !== "chain") return values;
  let next = 0;
  return expr.terms.map((term) => (term === null ? values[next++] : String(term)));
}

// A list that shows every answer must be the answers in order; a list that shows every term must be
// the whole chain; any other list may leave terms out, but every number in it must be one of them.
function listFits(list: readonly string[], values: readonly string[], filled: readonly string[]): boolean {
  const equals = (other: readonly string[]): boolean =>
    list.length === other.length && list.every((v, i) => sameAnswer(v, other[i]));
  if (equals(values) || equals(filled)) return true;
  if (list.length === values.length || list.length === filled.length) return false;
  let at = 0;
  return list.every((v) => {
    while (at < filled.length && !sameAnswer(v, filled[at])) at += 1;
    at += 1;
    return at <= filled.length;
  });
}

function multiVerdict(text: string, expr: Expr | null, computed: ComputedMultiAnswer): LineVerdict {
  const values = answerValues(computed);
  const filled = filledValues(expr, values);
  const lists = wholeNumberLists(text);
  if (lists.length === 0) return "unknown";
  return lists.some((list) => listFits(list, values, filled)) ? "match" : "differs";
}

// One number against one computed answer. A division with remainder may print its quotient alone;
// a decimal there is a result that code does not compute.
function numberVerdict(value: string, computed: ComputedSingleAnswer): LineVerdict {
  if (sameAnswer(value, computed.value)) return "match";
  const decimal = value.includes(".");
  if ((computed.remainder ?? 0) > 0) {
    if (decimal) return "unknown";
    return sameAnswer(value, String(computed.quotient)) ? "match" : "differs";
  }
  return decimal && Number(value) === Number(computed.value) ? "match" : "differs";
}

interface StepText {
  text: string;
  // The one number that the step prints, also after "=" in a whole equation.
  value: string | null;
  line: PrintedLine | null;
}

function readStep(printed: string): StepText {
  const line = parsePrintedLine(printed);
  const end = line?.kind === "equation" && typeof line.end === "object" ? line.end.value : null;
  return { text: printed, value: plainNumber(end ?? printed), line };
}

// An equation whose own two sides are not equal.
function isFalseEquation(step: StepText): boolean {
  if (step.value === null || step.line?.kind !== "equation" || step.line.operands.includes(null)) return false;
  const left = computeExprAnswer({
    kind: "arith",
    op: step.line.op,
    operands: step.line.operands as number[],
  });
  return left?.kind === "single" && numberVerdict(step.value, left) === "differs";
}

// What a part that code cannot compute says about a step: its shown answer is all that is known.
function shownVerdict(step: StepText, part: ExamplePart): LineVerdict {
  if (!isConcreteAnswer(part.shown_answer)) return part.expr === null ? "differs" : "unknown";
  const shown: string[] = normalizeAnswerCompare(part.shown_answer).match(/-?\d+(?:\.\d+)?(?: R\d+)?/g) ?? [];
  return step.value === null || shown.includes(step.value) ? "match" : "differs";
}

function answerStepVerdict(step: StepText, part: ExamplePart): LineVerdict {
  const computed = completeAnswer(part.expr);
  if (!computed) return shownVerdict(step, part);
  if (part.expr && step.line && compareLineWithExpr(step.line, part.expr) === "match") return "match";
  if (computed.kind === "multi") return multiVerdict(step.value ?? step.text, part.expr, computed);
  return step.value === null ? "unknown" : numberVerdict(step.value, computed);
}

function remainderStepVerdict(step: StepText, part: ExamplePart): LineVerdict {
  const computed = completeAnswer(part.expr);
  if (!computed) return shownVerdict(step, part);
  if (computed.kind !== "single" || computed.remainder === undefined) return "differs";
  const value = step.value ?? /^\s*[rR]\s*(\d+)\s*$/.exec(step.text)?.[1] ?? null;
  if (value === null) return "unknown";
  const wholeAnswer = computed.remainder > 0 && sameAnswer(value, computed.value);
  return wholeAnswer || sameAnswer(value, String(computed.remainder)) ? "match" : "differs";
}

// A step of kind "answer" or "remainder" must print an answer (or remainder) of one of the parts.
function stepConflict(step: ExampleStep, parts: readonly ExamplePart[], path: string): AnswerNote[] {
  if (!isConcreteAnswer(step.printed) || (step.shows !== "answer" && step.shows !== "remainder")) return [];
  const isRemainder = step.shows === "remainder";
  const known = parts.flatMap((part) => {
    const computed = completeAnswer(part.expr);
    if (!computed) return [];
    if (!isRemainder) return [answerValues(computed).join(", ")];
    return computed.kind === "single" && computed.remainder !== undefined ? [String(computed.remainder)] : [];
  });
  if (known.length === 0) return [];
  const read = readStep(step.printed);
  const verdicts = parts.map((part) => (isRemainder ? remainderStepVerdict : answerStepVerdict)(read, part));
  if (!isFalseEquation(read) && verdicts.some((v) => v !== "differs")) return [];
  const at = `${path}.steps[n=${step.n}].printed`;
  const what = isRemainder ? "computed remainder" : "computed";
  return [
    {
      kind: "answer_differs",
      path: at,
      message: `${at}: step prints "${step.printed}", ${what} "${[...new Set(known)].join('" or "')}"`,
    },
  ];
}

function shownConflict(part: ExamplePart, path: string): AnswerNote[] {
  const shown = part.shown_answer;
  const computed = completeAnswer(part.expr);
  if (!isConcreteAnswer(shown) || !computed) return [];
  const differs =
    computed.kind === "single"
      ? !sameAnswer(shown, computed.value)
      : multiVerdict(shown, part.expr, computed) === "differs";
  if (!differs) return [];
  const values = answerValues(computed).join(", ");
  return [{ kind: "answer_differs", path, message: `${path}: shown "${shown}", computed "${values}"` }];
}

function exampleConflicts(example: Example, path: string): AnswerNote[] {
  const steps = Array.isArray(example.steps) ? example.steps : [];
  return [
    ...example.parts.flatMap((part, pi) => shownConflict(part, `${path}.parts[${pi}].shown_answer`)),
    ...steps.flatMap((step) => stepConflict(step, example.parts, path)),
  ];
}

// Worked examples whose shown answers, answer steps or remainder steps conflict with the answers
// that code computes from the expressions. Never changes the record; used by compare (not by
// reference:check, where a person decides).
export function findExampleAnswerConflicts(
  record: ReferenceRecord | null | undefined,
): AnswerNote[] {
  if (!record || record.kind !== "page" || !Array.isArray(record.examples)) return [];
  return record.examples.flatMap((example, ei) => exampleConflicts(example, `examples[${ei}]`));
}

// The same finder on the final record and on the reading of each reader. Reader a is not listed
// again when the final record is reader a's fresh record.
export function collectRecordFindings(
  find: (record: ReferenceRecord | null | undefined) => readonly AnswerNote[],
  finalRecord: ReferenceRecord | null | undefined,
  recA: ReferenceRecord | null | undefined,
  recB: ReferenceRecord | null | undefined,
  opts: { finalIsFreshA: boolean },
): { finalMessages: string[]; readerMessages: string[] } {
  const listed = (who: string, record: ReferenceRecord | null | undefined): string[] =>
    find(record).map((note) => `${who}: ${note.message}`);
  return {
    finalMessages: listed("final record", finalRecord),
    readerMessages: [
      ...(opts.finalIsFreshA ? [] : listed("reader a", recA)),
      ...listed("reader b", recB),
    ],
  };
}

export function collectExampleAnswerConflicts(
  finalRecord: ReferenceRecord | null | undefined,
  recA: ReferenceRecord | null | undefined,
  recB: ReferenceRecord | null | undefined,
  opts: { finalIsFreshA: boolean },
): { finalMessages: string[]; readerMessages: string[] } {
  return collectRecordFindings(findExampleAnswerConflicts, finalRecord, recA, recB, opts);
}
