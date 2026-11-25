// What the division shapes share: the method (estimate the digit, take the product away, bring the next digit down), its
// words, and the two forms in which a row prints. The form and the number of answer areas come from the limits of the row
// and never from the numbers, so a page does not say which questions leave nothing.
import type { Answer, Face, FaceToken, Step, StepMark } from "../contract";
import { emptyLimitsProblem, isRecord, readRange, wholeNumber, type Range, type ReadLimit, type Swapped } from "./shape";

/** 37 ÷ 4 = in a line, or 4)37 in a bracket. */
export type DivisionForm = "line" | "bracket";
export const FORMS: readonly DivisionForm[] = ["line", "bracket"];

/** One part asks for the quotient; two ask for the remainder too, also when it is 0. */
export interface DivisionQuestion { dividend: number; divisor: number; form: DivisionForm; parts: 1 | 2 }

/** Every word of the worked steps. Another wording changes these and the grammar in testing/steps-evaluator.ts, and nothing else. */
const SAY = {
  less: (part: number, divisor: number) => `${part} is less than ${divisor}`,
  together: (part: number) => `use ${part}`,
  tooMuch: (divisor: number, times: number) => `${divisor} × ${times} = ${divisor * times} is too much`,
  write: (digit: number) => `write ${digit}`,
  bringDown: (digit: number, now: number) => `bring down ${digit}, now ${now}`,
};

/** One digit of the quotient: the part of the dividend that is divided, how many times the divisor fits, and what is left. */
interface Place { part: number; times: number; rest: number; next: number | null }

/** The places of the quotient, from the left. The first two digits are used together when the first one is too small. */
export function placesOf(dividend: number, divisor: number): Place[] {
  const digits = [...String(dividend)].map(Number);
  const first = digits[0] < divisor && digits.length > 1 ? 1 : 0;
  let rest = first === 1 ? digits[0] : 0;
  return digits.slice(first).map((digit, i): Place => {
    const part = rest * 10 + digit;
    const times = Math.floor(part / divisor);
    rest = part - times * divisor;
    return { part, times, rest, next: digits.at(first + i + 1) ?? null };
  });
}

export function answerOf({ dividend, divisor, parts }: DivisionQuestion): Answer {
  const places = placesOf(dividend, divisor);
  const quotient = places.map((p) => p.times).join("");
  const part = (name: string, value: string) => ({ name, kind: "whole-number" as const, value });
  return parts === 1 ? wholeNumber(quotient) : { parts: [part("quotient", quotient), part("remainder", String(places[places.length - 1].rest))] };
}

export const identity = ({ dividend, divisor }: DivisionQuestion): unknown => ({ dividend, divisor });

const mark = (kind: "quotient" | "product" | "rest" | "bring-down", row: number, place: number, digit: number | string): StepMark => ({ mark: kind, row, place, digit: String(digit) });

/** The steps of the method. A 0 of the quotient has no product, so what is left stays and the next digit comes down next to it. */
export function divisionSteps(question: DivisionQuestion, end: string): Step[] {
  const { dividend, divisor } = question;
  const places = placesOf(dividend, divisor);
  const digits = String(dividend).length;
  const steps: Step[] = [];
  if (places.length > 1 && places.length < digits) steps.push({ text: `${SAY.less(Math.floor(places[0].part / 10), divisor)}, ${SAY.together(places[0].part)}`, marks: [] });
  let row = 0;
  places.forEach(({ part, times, rest, next }, i) => {
    const place = places.length - 1 - i;
    const down = next === null ? "" : `, ${SAY.bringDown(next, rest * 10 + next)}`;
    const downMark = (): StepMark[] => (next === null ? [] : [mark("bring-down", row, place - 1, next)]);
    const quotient = mark("quotient", 0, place, times);
    if (times === 0) return void steps.push({ text: `${SAY.less(part, divisor)}, ${SAY.write(0)}${down}`, marks: [quotient, ...downMark()] });
    const product = [...String(times * divisor)];
    row += 1;
    steps.push({ text: `${divisor} × ${times} = ${times * divisor}, ${SAY.tooMuch(divisor, times + 1)}, ${SAY.write(times)}`, marks: [quotient, ...product.map((d, at) => mark("product", row, place + product.length - 1 - at, d))] });
    row += 1;
    steps.push({ text: `${part} - ${times * divisor} = ${rest}${down}`, marks: [mark("rest", row, place, rest), ...downMark()] });
  });
  return [...steps, { text: end, marks: [] }];
}

/** Two lines of work for each digit of the quotient: the product and what is left. */
export const workLinesOf = ({ dividend, divisor }: DivisionQuestion): number => 2 * placesOf(dividend, divisor).length;

export function faceOf({ dividend, divisor, form, parts }: DivisionQuestion, workLines: number): Face {
  const blanks: FaceToken[] = parts === 1 ? [{ blank: "answer" }] : [{ blank: "quotient" }, { text: "R" }, { blank: "remainder" }];
  if (form === "bracket") return { kind: "bracket", above: blanks, outside: String(divisor), inside: String(dividend), workLines };
  return { kind: "equation", tokens: [{ text: String(dividend) }, { text: "÷" }, { text: String(divisor) }, { text: "=" }, ...blanks] };
}

/** 35 ÷ 5 for 35 ÷ 7. Null when both are the same, and when the other one would divide by less than 2. */
export function swappedOf(question: DivisionQuestion, isInside: (turned: DivisionQuestion) => boolean): Swapped<DivisionQuestion> | null {
  const { dividend, divisor } = question;
  const other = dividend / divisor;
  if (other === divisor || other < 2) return null;
  const turned = { ...question, divisor: other };
  return { question: turned, inLimits: isInside(turned) };
}

/** Nothing left ("none", with no area for it), any remainder, 1 or more, or a range of remainders. */
export type RemainderLimit = "none" | "any" | "some" | Range;
const REMAINDERS: Range = { min: 0, max: 8 };
const WORDS: Readonly<Record<string, Range>> = { none: { min: 0, max: 0 }, any: REMAINDERS, some: { min: 1, max: 8 } };

export const remainderRange = (limit: RemainderLimit): Range => (typeof limit === "string" ? WORDS[limit] : limit);
export const partsOf = (limit: RemainderLimit): 1 | 2 => (limit === "none" ? 1 : 2);

/** One meaning has one form: a range that a word says is refused. */
export const readRemainder: ReadLimit = (raw, name) => {
  const value = Object.hasOwn(raw, name) ? raw[name] : undefined;
  if (typeof value === "string" && Object.hasOwn(WORDS, value)) return { value };
  if (!isRecord(value)) return { problem: `${name} must be "none" or "any" or "some" or a range` };
  const range = readRange(raw, name, REMAINDERS);
  if (typeof range === "string") return { problem: range };
  const word = Object.keys(WORDS).find((w) => WORDS[w].min === range.min && WORDS[w].max === range.max);
  return word === undefined ? { value: range } : { problem: `${name} from ${range.min} to ${range.max} must be "${word}"` };
};

/** Limits that some question meets, or the limits that stop all of them. */
export function readDivisionLimits<L>(fields: Record<string, unknown> | string, widest: Partial<L>, count: (limits: L) => number): { ok: true; limits: L } | { ok: false; problem: string } {
  if (typeof fields === "string") return { ok: false, problem: fields };
  const counted = (limits: Record<string, unknown>) => count(limits as L);
  return counted(fields) > 0 ? { ok: true, limits: fields as L } : { ok: false, problem: emptyLimitsProblem(fields, widest, counted) };
}
