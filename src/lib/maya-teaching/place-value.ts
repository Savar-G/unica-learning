// Maya's session adapter for place-value questions (B1a, design: .design/research/maya-place-value-design.md, section 2.4):
// the teaching package of a stored "which digit" or "value of the digit" workbook question, made in memory when a call
// starts. The stored package and the printed book never change: only the teaching fields (operation, answer, steps,
// wrong answers, easier example) are added, and code computes each of them from the checked object
// (src/lib/maya/place-value.ts). The deriver registry (src/lib/maya-teaching/index.ts, A1) calls `derivePlaceValue`.
// Pure TypeScript.
import { checkQuestionPackage, workedSteps, type AnswerValue, type EasierExample, type Operation, type Place, type QuestionPackage, type WrongAnswer } from "@/lib/question-package";
import { digitAt, placeIndex, WHOLE_PLACES } from "@/lib/question-package-place-value";
import { placeValueOf, type PlaceValueObject } from "@/lib/maya/place-value";
import { MAYA_TEACHING_LIMITS, TEACHING_SOURCE } from "./limits";

type PlaceValueOperation = Extract<Operation, { kind: "place-value" }>;
const num = (value: number): AnswerValue => ({ type: "number", value });

/** The easier example's digits (design 4.5): three rows with no zero and no digit twice; the first that differs wins. */
const EXAMPLE_ROWS: readonly (readonly number[])[] = [[8, 4, 7], [6, 3, 9], [2, 5, 8]];

/**
 * An example that would give the question's answer away (brief lesson 11, from #724's review): its answer times a power
 * of 10 is the answer (600 for 6000), or it is the answer's first digits, or the example shares the asked digit in the
 * asked place, or it is the question's own number.
 */
export function givesAway(o: Pick<PlaceValueObject, "number" | "place" | "answer">, exampleNumber: number, exampleAnswer: number): boolean {
  const k = placeIndex(o.place);
  const powers = [0, 1, 2, 3, 4, 5, 6, 7].some((j) => exampleAnswer * 10 ** j === o.answer || o.answer * 10 ** j === exampleAnswer);
  const firstDigits = String(o.answer).startsWith(String(exampleAnswer));
  const sharedDigit = k < String(exampleNumber).length && digitAt(exampleNumber, k) === digitAt(o.number, k);
  return powers || firstDigits || sharedDigit || exampleNumber === o.number;
}

/**
 * The easier example: the same ask, a number with fewer digits (at most 3), the place capped at the hundreds, and a
 * digit (and so an answer) that is not the question's. Null when no row gives one.
 */
function easierExampleOf(o: PlaceValueObject): EasierExample | null {
  const length = Math.min(3, String(o.number).length - 1);
  const first = Math.min(placeIndex(o.place), length - 1);
  // The asked place, capped at the hundreds; then the other places of the example, highest first.
  const places = [first, ...[2, 1, 0].filter((k) => k !== first && k < length)].filter((k) => o.ask === "digit" || k >= 1);
  const questionDigit = digitAt(o.number, placeIndex(o.place));
  for (const [k, row] of places.flatMap((k) => EXAMPLE_ROWS.map((row) => [k, row] as const))) {
    const number = Number(row.slice(0, length).join(""));
    const operation: PlaceValueOperation = { kind: "place-value", operands: [number], ask: o.ask, place: WHOLE_PLACES[k] };
    const answer = o.ask === "value" ? digitAt(number, k) * 10 ** k : digitAt(number, k);
    // Never the question's digit or answer, and for a value never the place's own worth when that is the answer
    // (the example says "6 × 100": a question whose answer is 100 would hear it).
    if (digitAt(number, k) === questionDigit || answer === o.answer || (o.ask === "value" && 10 ** k === o.answer) || givesAway(o, number, answer)) continue;
    const text = o.ask === "digit"
      ? `In ${number}, which digit is in the ${operation.place} place?`
      : `What is the value of the digit in the ${operation.place} place of ${number}?`;
    return { text, operation, answer: num(answer), steps: workedSteps(operation) };
  }
  return null;
}

/**
 * The wrong answers code expects (design 5.4), each with its cause: a neighbour's digit (the wrong place), the digit's
 * value for a digit ask (a value, not a digit), and for a value ask the bare digit, one zero too many or too few, and a
 * neighbour's digit times the place. None equals the answer, none twice.
 */
function wrongAnswersOf(o: PlaceValueObject): WrongAnswer[] {
  const k = placeIndex(o.place);
  const digit = digitAt(o.number, k);
  const length = String(o.number).length;
  const neighbours = [k + 1, k - 1].filter((j) => j >= 0 && j < length).map((j) => digitAt(o.number, j));
  const out: WrongAnswer[] = [];
  const add = (value: number, cause: string, description: string) => {
    if (value === o.answer || value < 0 || out.some((w) => w.value.type === "number" && w.value.value === value)) return;
    out.push({ value: num(value), cause, step: "result", description });
  };
  if (o.ask === "digit") {
    for (const d of neighbours) add(d, "place-shift", `Reads the digit of the place next to the ${o.place}`);
    add(digit * 10 ** k, "N2", "Gives the digit's value, not the digit");
  } else {
    add(digit, "N2", "Gives the digit, not its value");
    add(digit * 10 ** (k + 1), "place-shift", "Gives the value one place too large");
    add(digit * 10 ** (k - 1), "place-shift", "Gives the value one place too small");
    for (const d of neighbours) add(d * 10 ** k, "place-shift", `Uses the digit of the place next to the ${o.place}`);
  }
  return out;
}

/** The package Maya teaches from, or why the question stays held. The printed package's own fields are kept as they are. */
export function placeValueTeachingPackage(printed: QuestionPackage): { package: QuestionPackage } | { held: string } {
  const o = placeValueOf(printed);
  if ("held" in o) return o;
  const operation: PlaceValueOperation = { kind: "place-value", operands: [o.number], ask: o.ask, place: o.place as Place };
  const easierExample = easierExampleOf(o);
  if (!easierExample) return { held: "code has no easier example of the same shape" };
  const wrongAnswers = wrongAnswersOf(o);
  if (wrongAnswers.length === 0) return { held: "code expects no wrong answer for this number" };
  const made: QuestionPackage = {
    ...printed,
    operation,
    answer: { value: num(o.answer), accepted: [], unit: null },
    steps: workedSteps(operation),
    wrongAnswers,
    easierExample,
    // Marked as made by the session adapter: only Maya's check (mayaPackageCheck) knows the place-value kind.
    operationSource: TEACHING_SOURCE,
  };
  const check = checkQuestionPackage(made, undefined, MAYA_TEACHING_LIMITS);
  return check.ok ? { package: made } : { held: `the teaching package does not check: ${check.reason}` };
}

/** The deriver for the registry in src/lib/maya-teaching/index.ts: the teaching package, or null to leave it held. */
export function derivePlaceValue(printed: QuestionPackage): QuestionPackage | null {
  const made = placeValueTeachingPackage(printed);
  return "package" in made ? made.package : null;
}
