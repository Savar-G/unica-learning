// Maya's session adapter for B1b's place-value questions (design: .design/research/maya-place-value-design.md, sections
// 2.4, 4.5 and 5.4): the teaching package of a stored compare, sum or tenths-build workbook question, made in memory when
// a call starts. The stored package and the printed book never change: only the teaching fields are added, and code
// computes each of them from the checked object (src/lib/maya/place-value-parts.ts). Pure TypeScript.
import { checkQuestionPackage, workedSteps, type AnswerValue, type EasierExample, type Operation, type QuestionPackage, type WrongAnswer } from "@/lib/question-package";
import { placePartsOf, type PlacePartsObject } from "@/lib/maya/place-value-parts";
import { placeIndex } from "@/lib/question-package-place-value";
import { MAYA_TEACHING_LIMITS, TEACHING_SOURCE } from "./limits";

type PartsOperation = Extract<Operation, { kind: "place-value"; ask: "compare" | "sum" | "build" }>;
const num = (value: number): AnswerValue => ({ type: "number", value });
const choice = (value: string): AnswerValue => ({ type: "choice", value });

const operationOf = (o: PlacePartsObject): PartsOperation => (o.ask === "build"
  ? { kind: "place-value", operands: [o.wholes, o.tenths], ask: "build", place: "tenths" }
  : { kind: "place-value", operands: [o.number], ask: o.ask, place: o.place, second: o.second });

/**
 * The easier example's pairs of digits (design 4.5). A compare's example circles the other word (an example with the
 * question's word gives it away, and the package check refuses it): a "true" question gets a smaller first digit, a
 * "false" one a bigger first digit.
 */
const COMPARE_PAIRS = { bigger: [[8, 3], [7, 2], [9, 4]], smaller: [[3, 8], [2, 7], [4, 9]] } as const;
const SUM_PAIRS = [[6, 3], [4, 7], [2, 5]] as const;
const ONES = [5, 6, 1] as const;

/** The easier example's wholes and tenths for a build, in order of preference: fewer wholes, and no number of the question's. */
const BUILD_WHOLES = [2, 1, 3, 4, 5] as const;
const BUILD_TENTHS = [7, 3, 5, 4, 6, 8, 9, 2, 1] as const;

/**
 * Why a made example gives the question's answer away, or null (brief lesson 11): its answer times a power of 10 is the
 * question's answer (630 for 6300); its answer's digits start the answer's digits (63 for 6304); it uses one of the
 * question's own operands (a digit of a compare or a sum, the wholes or the tenths of a build, or the number itself); a
 * compare's example circles the question's word.
 */
export function exampleGiveaway(o: PlacePartsObject, example: EasierExample): string | null {
  const op = example.operation as PartsOperation;
  const ans = example.answer;
  if (o.ask === "compare") {
    if (ans.type !== "choice" || ans.value === o.answer) return "the example circles the question's word";
  } else {
    if (ans.type !== "number") return "the example's answer is not a number";
    const e = ans.value;
    for (let k = -6; k <= 6; k++) if (Math.abs(e * 10 ** k - o.answer) < 1e-9) return "the example's answer times a power of 10 is the question's answer";
    const digits = (n: number) => String(n).replace(".", "").replace(/^0+/, "");
    if (digits(o.answer).startsWith(digits(e))) return "the example's answer is the first digits of the question's answer";
  }
  if (o.ask === "build") {
    // Across positions too (review of #740): 3.7 must not get 2.3, and 2.1 must not get 1.7.
    if (op.ask !== "build" || op.operands.some((v) => v === o.wholes || v === o.tenths)) return "the example uses the question's wholes or tenths";
    return null;
  }
  if (op.ask === "build") return "the example is not the question's ask";
  const own = [o.number, ...[o.place, o.second].map((p) => Math.floor(o.number / 10 ** placeIndex(p)) % 10)];
  const theirs = [op.operands[0], ...[op.place, op.second].map((p) => Math.floor(op.operands[0] / 10 ** placeIndex(p)) % 10)];
  return theirs.some((v) => own.includes(v)) ? "the example uses the question's own number or digits" : null;
}

/**
 * The easier example: the same ask with a 3-digit number (the hundreds and the tens), or fewer wholes and other tenths;
 * the first candidate with no giveaway (exampleGiveaway). Null when none has none.
 */
function easierExampleOf(o: PlacePartsObject): EasierExample | null {
  const candidates: EasierExample[] = [];
  if (o.ask === "build") {
    for (const w of BUILD_WHOLES.filter((x) => x < o.wholes)) for (const t of BUILD_TENTHS) {
      // "2 wholes and 2 tenths" does not show which digit is which.
      if (t === w) continue;
      const operation: PartsOperation = { kind: "place-value", operands: [w, t], ask: "build", place: "tenths" };
      candidates.push({ text: `${w} ${w === 1 ? "whole" : "wholes"} and ${t} ${t === 1 ? "tenth" : "tenths"} is ? as a decimal.`, operation, answer: num((w * 10 + t) / 10), steps: workedSteps(operation) });
    }
  } else {
    const digits = (n: number, place: Parameters<typeof placeIndex>[0]) => Math.floor(n / 10 ** placeIndex(place)) % 10;
    const a = digits(o.number, o.place);
    const b = digits(o.number, o.second);
    const pairs: readonly (readonly [number, number])[] = o.ask === "compare" ? COMPARE_PAIRS[a > b ? "smaller" : "bigger"] : SUM_PAIRS;
    for (const [x, y] of pairs) {
      const ones = ONES.find((d) => d !== x && d !== y)!;
      const number = x * 100 + y * 10 + ones;
      const operation: PartsOperation = { kind: "place-value", operands: [number], ask: o.ask, place: "hundreds", second: "tens" };
      const text = o.ask === "compare"
        ? `True or false: in ${number}, the digit in the hundreds place is bigger than the digit in the tens place.`
        : `In ${number}, what is the value of the hundreds digit plus the value of the tens digit?`;
      const answer = o.ask === "compare" ? choice(x > y ? "true" : "false") : num(x * 100 + y * 10);
      candidates.push({ text, operation, answer, steps: workedSteps(operation) });
    }
  }
  return candidates.find((e) => exampleGiveaway(o, e) === null) ?? null;
}

/** The wrong answers code expects (design 5.4), each with its cause. None equals the answer, none twice. */
function wrongAnswersOf(o: PlacePartsObject): WrongAnswer[] {
  if (o.ask === "compare") {
    return [{ value: choice(o.answer === "true" ? "false" : "true"), cause: "N2", step: "result", description: "Compares the wrong digits, or reads the comparison the other way" }];
  }
  const out: WrongAnswer[] = [];
  const add = (value: number, cause: string, description: string) => {
    if (!(value > 0) || value === o.answer || out.some((w) => w.value.type === "number" && w.value.value === value)) return;
    out.push({ value: num(value), cause, step: "result", description });
  };
  if (o.ask === "build") {
    const { wholes: w, tenths: t } = o;
    add(w * 10 + t, "decimal-point", "Leaves out the decimal point");
    add((t * 10 + w) / 10, "N2", "Puts the tenths before the point and the wholes after it");
    add((w * 100 + t) / 100, "place-shift", "Writes the tenths as hundredths");
    add(w + t, "N2", "Adds the wholes and the tenths as numbers");
    return out;
  }
  const ka = placeIndex(o.place);
  const kb = placeIndex(o.second);
  const a = Math.floor(o.number / 10 ** ka) % 10;
  const b = Math.floor(o.number / 10 ** kb) % 10;
  add(a + b, "N2", "Adds the two digits, not their values");
  add(a * 10 + b, "parts-joined", "Writes the two digits side by side");
  add(a * 10 ** ka, "N2", "Gives only the first value");
  add(b * 10 ** kb, "N2", "Gives only the second value");
  if (ka >= 1) add(a * 10 ** (ka - 1) + b * 10 ** kb, "place-shift", "Gives the first value one place too small");
  return out;
}

/**
 * The package Maya teaches from, why the question stays held, or null for a question that is not one of B1b's
 * templates. The printed package's own fields are kept as they are.
 */
export function placePartsTeachingPackage(printed: QuestionPackage): { package: QuestionPackage } | { held: string } | null {
  const o = placePartsOf(printed);
  if (o === null || "held" in o) return o;
  const operation = operationOf(o);
  const easierExample = easierExampleOf(o);
  if (!easierExample) return { held: "code has no easier example of the same shape" };
  const made: QuestionPackage = {
    ...printed,
    operation,
    answer: { value: o.ask === "compare" ? choice(o.answer) : num(o.answer), accepted: [], unit: null },
    steps: workedSteps(operation),
    wrongAnswers: wrongAnswersOf(o),
    easierExample,
    // Marked as made by the session adapter: only Maya's check (mayaPackageCheck) knows the place-value kind.
    operationSource: TEACHING_SOURCE,
  };
  const check = checkQuestionPackage(made, undefined, MAYA_TEACHING_LIMITS);
  return check.ok ? { package: made } : { held: `the teaching package does not check: ${check.reason}` };
}
