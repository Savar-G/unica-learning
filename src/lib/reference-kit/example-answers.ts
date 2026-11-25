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
import { isConcreteAnswer, normalizeAnswerCompare, plainNumber, sameValue, stepNumbers, wholeNumberLists } from "./answer-text";
import type { AnswerNote } from "./answers";
import {
  compareLineWithExpr,
  exprOfLine,
  exprWithExactAnswer,
  parsePrintedLine,
  setupLine,
  wrongResult,
  type LineVerdict,
  type PrintedLine,
} from "./printed-line";
import { answerValues, completeAnswer } from "./unproved-answers";

// The whole chain with its blanks filled in, or the values themselves.
function filledValues(expr: Expr | null, values: readonly string[]): readonly string[] {
  if (expr?.kind === "word") return typeof expr.expr === "string" ? values : filledValues(expr.expr, values);
  if (expr?.kind !== "chain") return values;
  let next = 0;
  return expr.terms.map((term) => (term === null ? values[next++] : String(term)));
}

// One number must be one of the answers (never a printed term); a list must be all the answers in
// order or the whole chain.
function listFits(list: readonly string[], values: readonly string[], filled: readonly string[]): boolean {
  if (list.length === 1) return values.some((v) => sameValue(v, list[0]));
  return [values, filled].some((all) => all.length === list.length && all.every((v, i) => sameValue(v, list[i])));
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
  if (sameValue(value, computed.value)) return "match";
  if ((computed.remainder ?? 0) === 0) return "differs";
  if (value.includes(".")) return "unknown";
  return sameValue(value, String(computed.quotient)) ? "match" : "differs";
}

interface StepText {
  text: string;
  // The numbers that the step prints as answers: see stepNumbers; also the result of an equation.
  numbers: string[];
  isRemainder: boolean;
  line: PrintedLine | null;
}

function readStep(printed: string): StepText {
  const line = parsePrintedLine(printed);
  const end = line?.kind === "equation" && typeof line.end === "object" ? line.end.value : null;
  const direct = stepNumbers(printed);
  return { text: printed, line, ...direct, numbers: end === null ? direct.numbers : [end] };
}

function allOf(numbers: readonly string[], verdictOf: (value: string) => LineVerdict): LineVerdict {
  const verdicts = numbers.map(verdictOf);
  if (verdicts.includes("differs")) return "differs";
  return verdicts.length > 0 && verdicts.every((v) => v === "match") ? "match" : "unknown";
}

// The value of the left side of an equation whose own two sides are not equal (a division with
// remainder may print its quotient alone).
function falseLeftSide(step: StepText): string | null {
  if (!step.line || wrongResult(step.line) === null) return null;
  const left = computeExprAnswer(exprOfLine(step.line));
  return left?.kind === "single" && numberVerdict(step.numbers[0], left) === "differs" ? left.value : null;
}

// What a part that code cannot compute says about a step: its shown answer is all that is known.
function shownVerdict(step: StepText, part: ExamplePart): LineVerdict {
  if (!isConcreteAnswer(part.shown_answer)) return part.expr === null ? "differs" : "unknown";
  const shown: string[] = normalizeAnswerCompare(part.shown_answer).match(/-?\d+(?:\.\d+)?(?: R\d+)?/g) ?? [];
  return step.numbers.every((value) => shown.some((s) => sameValue(s, value))) ? "match" : "differs";
}

function remainderVerdict(step: StepText, part: ExamplePart): LineVerdict {
  const computed = completeAnswer(part.expr);
  if (!computed) return shownVerdict(step, part);
  if (computed.kind !== "single" || computed.remainder === undefined) return "differs";
  const right = [String(computed.remainder), ...(computed.remainder > 0 ? [computed.value] : [])];
  return allOf(step.numbers, (value) => (right.some((r) => sameValue(r, value)) ? "match" : "differs"));
}

function answerVerdict(step: StepText, part: ExamplePart): LineVerdict {
  const computed = completeAnswer(part.expr);
  if (!computed) return shownVerdict(step, part);
  if (part.expr && step.line && compareLineWithExpr(step.line, part.expr) === "match") return "match";
  if (computed.kind === "single") return allOf(step.numbers, (value) => numberVerdict(value, computed));
  if (step.numbers.length === 0) return multiVerdict(step.text, part.expr, computed);
  return allOf(step.numbers, (value) => multiVerdict(value, part.expr, computed));
}

// A step of kind "answer" or "remainder" must print an answer (or remainder) of one of the parts.
function stepConflict(step: ExampleStep, parts: readonly ExamplePart[], path: string): AnswerNote[] {
  if (!isConcreteAnswer(step.printed) || (step.shows !== "answer" && step.shows !== "remainder")) return [];
  const read = readStep(step.printed);
  const isRemainder = step.shows === "remainder" || read.isRemainder;
  const known = parts.flatMap((part) => {
    const computed = completeAnswer(part.expr);
    if (!computed) return [];
    if (!isRemainder) return [answerValues(computed).join(", ")];
    return computed.kind === "single" && computed.remainder !== undefined ? [String(computed.remainder)] : [];
  });
  if (known.length === 0) return [];
  const at = `${path}.steps[n=${step.n}].printed`;
  const note = (text: string): AnswerNote[] => [
    { kind: "answer_differs", path: at, message: `${at}: step prints "${step.printed}", ${text}` },
  ];
  const left = falseLeftSide(read);
  if (left !== null) return note(`computed "${left}" for its left side`);
  const verdicts = parts.map((part) => (isRemainder ? remainderVerdict : answerVerdict)(read, part));
  if (verdicts.some((v) => v !== "differs")) return [];
  return note(`${isRemainder ? "computed remainder" : "computed"} "${[...new Set(known)].join('" or "')}"`);
}

function shownConflict(part: ExamplePart, path: string): AnswerNote[] {
  const shown = part.shown_answer;
  const computed = completeAnswer(part.expr);
  if (!isConcreteAnswer(shown) || !computed) return [];
  const differs =
    computed.kind === "single"
      ? !sameValue(shown, computed.value)
      : multiVerdict(shown, part.expr, computed) === "differs";
  if (!differs) return [];
  const values = answerValues(computed).join(", ");
  return [{ kind: "answer_differs", path, message: `${path}: shown "${shown}", computed "${values}"` }];
}

// The parts of an example. The one part of an example that stores its question as notation or not
// at all takes the expression of the one setup line, when that has one exact answer.
function partsWithLineExpr(example: Example, steps: readonly ExampleStep[]): ExamplePart[] {
  const [part] = example.parts;
  const stored = part?.expr ?? null;
  if (example.parts.length !== 1 || example.relation === "table") return example.parts;
  if (stored !== null && stored.kind !== "notation") return example.parts;
  const lines = steps.flatMap((step) => (step.shows === "setup" ? (setupLine(step.printed, part.form) ?? []) : []));
  if (lines.length !== 1 || (stored && compareLineWithExpr(lines[0], stored) !== "match")) return example.parts;
  const expr = exprWithExactAnswer(lines[0]);
  const readable = !isConcreteAnswer(part.shown_answer) || plainNumber(part.shown_answer) !== null;
  return expr && readable ? [{ ...part, expr }] : example.parts;
}

function exampleConflicts(example: Example, path: string): AnswerNote[] {
  const steps = Array.isArray(example.steps) ? example.steps : [];
  const parts = partsWithLineExpr(example, steps);
  return [
    ...parts.flatMap((part, pi) => shownConflict(part, `${path}.parts[${pi}].shown_answer`)),
    ...steps.flatMap((step) => stepConflict(step, parts, path)),
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
