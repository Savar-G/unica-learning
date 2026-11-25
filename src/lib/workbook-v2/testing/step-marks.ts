// What the marks of worked steps must be, for an answer that is one whole number. It knows no shape: it compares the
// marks with the answer, with each other, and with the words "write", "carry" and "plus ... is" of the lines.
import { STEP_MARKS, type Step, type StepMark } from "../contract";
import { hasNames } from "./shape-registration";

const isMark = (mark: StepMark): boolean =>
  hasNames(mark, ["mark", "place", "digit"]) && STEP_MARKS.includes(mark.mark) && Number.isSafeInteger(mark.place) && mark.place >= 0 && typeof mark.digit === "string" && /^\d$/.test(mark.digit);

const marksOf = ({ marks }: Step, kind: StepMark["mark"]) => marks.filter((m) => m.mark === kind);
/** The number that comes after some words of a line. */
const said = ({ text }: Step, words: RegExp): string | undefined => words.exec(text)?.[1];

const WRITE = /\bwrite (\d+)/;
const CARRY = /\bcarry (\d+)/;
const ADD = /\bplus (\d+) is\b/;

/** The digits of the marks, the highest place first. A place between them that no mark has prints as "?". */
function digitsOf(marks: readonly StepMark[]): string {
  const byPlace = new Map(marks.map((m) => [m.place, m.digit]));
  const places = [...byPlace.keys()];
  return Array.from({ length: places.length === 0 ? 0 : Math.max(...places) + 1 }, (_, i) => byPlace.get(i) ?? "?").reverse().join("");
}

function writeProblem(steps: readonly Step[], answer: string): string | null {
  const writes = steps.flatMap((s) => marksOf(s, "write"));
  const twice = writes.find((m, i) => writes.findIndex((other) => other.place === m.place) !== i);
  if (twice) return `the steps write the place ${twice.place} more than once`;
  if (digitsOf(writes) !== answer) return `the steps write "${digitsOf(writes)}" and not the answer "${answer}"`;
  for (const step of steps) {
    const word = said(step, WRITE);
    const own = marksOf(step, "write").sort((a, b) => b.place - a.place).map((m) => m.digit).join("");
    if (word !== undefined && word !== own) return `the step "${step.text}" says "write ${word}" and writes "${own}"`;
  }
  return null;
}

function carryProblem(step: Step, next: Step | undefined): string | null {
  const at = `the step "${step.text}"`;
  const carries = marksOf(step, "carry");
  if (carries.length > 1) return `${at} has ${carries.length} carries`;
  const carry = carries.at(0);
  const word = said(step, CARRY);
  if (carry?.digit === "0") return `${at} carries 0`;
  if (carry?.digit !== word) return `${at} says ${word === undefined ? "no carry" : `"carry ${word}"`} and carries ${carry?.digit ?? "nothing"}`;
  const added = next && said(next, ADD);
  if (carry?.digit !== added) return `${at} carries ${carry?.digit ?? "nothing"} and the next step adds ${added ?? "nothing"}`;
  if (!carry) return null;
  const column = marksOf(step, "write").map((m) => m.place);
  if (column.length !== 1 || carry.place !== column[0] + 1) return `${at}: its carry stands at the place ${carry.place} and must stand at ${column.map((p) => p + 1).join()}`;
  return next && marksOf(next, "write").some((m) => m.place === carry.place) ? null : `${at} carries to the place ${carry.place} and the next step does not write that place`;
}

/** What is wrong with the marks of the steps of one question, or null. */
export function marksProblem(steps: readonly Step[], answer: string): string | null {
  for (const step of steps) {
    if (!hasNames(step, ["text", "marks"]) || !Array.isArray(step.marks)) return `the step ${JSON.stringify(step)} is not a text with marks`;
    if (!step.marks.every(isMark)) return `the step "${step.text}" holds a mark that is not one`;
  }
  if (steps.at(-1)?.marks.length !== 0) return "the last step draws something";
  const write = writeProblem(steps, answer);
  if (write) return write;
  const first = said(steps[0], ADD);
  if (first !== undefined) return `the first step adds ${first}`;
  for (let i = 0; i < steps.length; i++) {
    const problem = carryProblem(steps[i], steps.at(i + 1));
    if (problem) return problem;
  }
  return null;
}
