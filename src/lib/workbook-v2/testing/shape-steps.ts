// The step checks of the harness: the worked steps of one question against the grammar, the paper and the reader.
import { answerProblem } from "../checks/answer-form";
import { BLANK } from "../checks/printed-answers";
import { answerLine, isPrintable, type Answer, type AnswerKind, type Face, type Step } from "../contract";
import { canonicalJson } from "../hash";
import { divisionProblem } from "./division-steps";
import type { Printed, Rows, ShapeRegistration } from "./shape-registration";
import { linesProblem, marksProblem, placesProblem } from "./step-marks";
import { parseStep, type ParsedStep } from "./steps-evaluator";

/** One question as its steps see it: what it prints, what the reader says, and how its answer is worked. */
export interface WorkedQuestion {
  steps: readonly Step[];
  answer: Answer;
  printed: Printed;
  rows: Rows;
  kind: Face["kind"];
  answerKind: AnswerKind;
  working: ShapeRegistration["working"];
}

export interface StepProblem { check: "steps-end" | "steps-true" | "steps-marks" | "steps-reader"; detail: string }

/** Whether the fonts can print the rows. A blank prints nothing. */
export const canPrint = (rows: Rows): boolean => rows.every((row) => isPrintable(row.replaceAll(BLANK, "")));

/** The registration says how the answer is worked. The shape cannot: a stack is always worked in columns, on its paper. */
function workingProblem({ steps, answer, rows, kind, working }: WorkedQuestion, read: readonly ParsedStep[]): string | null {
  if (kind === "column" && working !== "columns") return "a column stack must be worked in columns";
  if (kind === "bracket" && working === "columns") return "a bracket is not worked in columns";
  if (working === "division") return divisionProblem(steps, answer, rows, read);
  if (working === "lines") return linesProblem(steps, answer, read);
  if (working === "places") return placesProblem(steps, answer, rows, read);
  if (answer.parts.length !== 1) return "an answer with more than one part is not worked in columns";
  return marksProblem(steps, answer.parts[0].value, kind === "column" ? rows : null, read);
}

/** All that is wrong with the steps of one question. */
export function stepProblems(question: WorkedQuestion): StepProblem[] {
  const { steps, answer, printed, rows, answerKind } = question;
  const found: StepProblem[] = [];
  const tell = (check: StepProblem["check"], detail: string) => void found.push({ check, detail });

  const bad = steps.find(({ text }) => typeof text !== "string" || text === "" || !isPrintable(text));
  if (bad !== undefined) tell("steps-end", `the step ${JSON.stringify(bad.text)} cannot be printed`);
  const end = steps.at(-1)?.text;
  const line = Array.isArray(answer.parts) ? answerLine(answer) : null;
  if (end !== line) tell("steps-end", `the steps end in ${JSON.stringify(end)} and not in "${line}"`);
  // The last step is the answer itself (checked above); check every working step with the closed grammar.
  // Each step is read one time, here: a step with no text was told above, and then nothing else uses what was read.
  const before = steps.slice(0, -1).filter(({ text }) => typeof text === "string");
  const read = before.map(({ text }) => parseStep(text));
  for (const [i, { wrong, unread }] of read.entries()) {
    const { text } = before[i];
    if (unread.length > 0) tell("steps-true", `cannot read "${unread[0]}" in the step "${text}"`);
    if (wrong.length > 0) tell("steps-true", `the step "${text}" holds "${wrong[0]}"`);
  }
  // Wrong answers, rows that cannot be printed, ends and unreadable steps have their own checks; the marks are compared
  // with a good step list.
  const isGood = found.length === 0 && canPrint(rows) && !answerProblem(answer, answerKind) && canonicalJson(answer) === canonicalJson(printed.answer);
  const marks = isGood ? workingProblem(question, read) : null;
  if (marks) tell("steps-marks", marks);
  const [said, wanted] = [canonicalJson(steps), canonicalJson(printed.steps)];
  if (said !== wanted) tell("steps-reader", `the steps are ${said} and must be ${wanted}`);
  return found;
}
