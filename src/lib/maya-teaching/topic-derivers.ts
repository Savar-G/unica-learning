// The teaching packages of the "other-topic" questions that C3b teaches (Maya coverage, Wave C, after #731): each is
// read first by `readTopicQuestion` (topic-claims.ts: the printed text, code's work and the stored template agree), then
// given an operation Maya teaches and a checked easier example. Pure TypeScript.
//
// - Clock times ("What time is 50 minutes after 6:13?", C3c): time-add, counted on to the next hour and then the minutes
//   left (src/lib/maya/clock-lines.ts), with an easier example of the same shape and none of the question's numbers.
// - Scale, minute-hand and money claims ("True or false: 2 intervals above 90 is 94."): the claim's computed side is
//   the operation (an `evaluate` for the scale and the minute hand, taught by A2; a decimal addition of the bills and
//   the quarters for money), and A4's claim session teaches the compare and the circled word (topic-claim.ts gives that
//   session the claim).
import { heldReason } from "@/lib/maya";
import { claimView } from "@/lib/maya/claim";
import { checkQuestionPackage, operationResult, sameValue, workedSteps, type AnswerValue, type Operation, type OperationPackage, type QuestionPackage } from "@/lib/question-package";
import { withTeachingOperation } from "@/lib/workbook-maya-operation";
import { givesAway } from "./examples";
import { MAYA_TEACHING_LIMITS, TEACHING_SOURCE } from "./limits";
import { readTopicQuestion } from "./topic-claims";
import { claimOperation, claimReading, resultOf } from "./topic-claim";
import type { Deriver } from "./index";

/** Every number printed in the question's text ("$40.50" is 40.5), for the examples' refusals (lessons 11 and 12). */
function printedNumbers(text: string): number[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

/**
 * True when an example would give the question away (lessons 11 and 12): one of its numbers, its step value or its
 * result is a number the question prints or works out (`own`), or its result is the answer times a power of 10 or
 * begins with the answer's digits (givesAway). 0 is never an example's number.
 */
function examplesGiveAway(numbers: number[], got: number, own: number[], answer: number): boolean {
  const same = (x: number, y: number) => Math.abs(x - y) < 1e-9;
  const tenfold = [1, 10, 100, 1000, 10000].some((p) => same(got * p, answer) || same(got, answer * p));
  return [...numbers, got].some((x) => x <= 0 || own.some((y) => same(x, y))) || tenfold ||
    givesAway({ type: "number", value: answer }, { type: "number", value: got });
}

/**
 * Money's easier examples, of its shape (some dollars plus some quarters, as a decimal addition), best first, made by
 * code and refused when they reuse a number of the question (review of #741, P2-1): the bill and quarter counts, the
 * $20, the shown amount, the bills' and the quarters' sums, or the answer (examplesGiveAway). The package check then
 * takes the first that is smaller than the question.
 */
export function moneyExamples(operation: Operation, printed: number[]): Operation[] {
  if (operation.kind !== "decimal-add") return [];
  const [d, q] = operation.operands as number[];
  const answer = d + q;
  const own = [...printed, d, q, answer];
  const out: Operation[] = [];
  // Fewer digits first (every amount is written to the cent, so $5.75 is easier than $40.50 and $10.75 is not).
  for (const dollars of [5, 4, 3, 2, 1, 10, 30, 50]) for (const quarters of [0.5, 0.75, 0.25]) {
    const got = Math.round((dollars + quarters) * 100) / 100;
    if (examplesGiveAway([dollars, quarters], got, own, answer)) continue;
    out.push({ kind: "decimal-add", operands: [dollars, quarters] });
  }
  return out;
}

/**
 * A sum's or a product's easier examples (marbles, area: C3c): two one-digit numbers, with a smaller result, smallest
 * first, with products using 1 tried last, none of them a number the question prints or computes (`own`: the red count, the other area's sides, the
 * results and the compared number; lesson 11, review of #742 P2-b). The example's own result and compared number are
 * checked against `own` too, once the claim session makes them (exampleFresh).
 */
function freshPairs(operation: Operation, own: ReadonlySet<number>): Operation[] {
  if (operation.kind !== "add" && operation.kind !== "multiply") return [];
  const [a, b] = operation.operands as [number, number];
  const result = operation.kind === "add" ? a + b : a * b;
  const out: Operation[] = [];
  // A factor of 1 is useful when the other fresh pairs cannot make a safe example.
  const low = 1;
  for (let x = low; x <= 9; x++) for (let y = low; y <= x; y++) {
    const got = operation.kind === "add" ? x + y : x * y;
    if (own.has(x) || own.has(y) || own.has(got)) continue;
    if (got < result) out.push({ kind: operation.kind, operands: [x, y] });
  }
  return operation.kind === "multiply" ? out.sort((a, b) => Number((a.operands as number[]).includes(1)) - Number((b.operands as number[]).includes(1))) : out;
}

/** Every number a marbles or area claim prints or computes: the printed numbers, its results and its compared number. */
function claimNumbers(printed: QuestionPackage, reading: NonNullable<ReturnType<typeof claimReading>>): Set<number> {
  const own = new Set(printedNumbers(printed.text));
  const works = reading.topic === "area" ? reading.work : reading.topic === "marbles" ? [reading.work] : [];
  for (const w of works) { const v = resultOf(w); if (v !== null) own.add(v); }
  if (reading.topic === "marbles") own.add(reading.left);
  return own;
}

/** The claim session's easier example: its result and compared number are none of the question's numbers. */
function exampleFresh(made: QuestionPackage, own: ReadonlySet<number>): boolean {
  const view = claimView(made as OperationPackage);
  const compare = view.easierExample.steps.find((st) => st.kind === "claim-compare");
  if (!compare || compare.kind !== "claim-compare") return false;
  return !own.has(compare.value) && !own.has(compare.shown);
}

/**
 * The minute hand's easier examples, of its shape ("4 × 5 + 3": a number on the clock times 5, plus the marks past it),
 * best first: a smaller number on the clock, then a larger one, each with 1 to 4 marks. Refused when the example reuses
 * a number of the question (review of #741, P2-1): the marks, the number, the shown minutes, the number times 5 or the
 * answer, as its own numbers, its step value (times 5) or its result (examplesGiveAway). Its single digits leave the
 * adapter's one-place-smaller examples (examples.ts) none.
 */
export function minuteExamples(operation: Operation, printed: number[]): Operation[] {
  const m = /^(\d+) × 5 \+ (\d+)$/.exec(operation.kind === "evaluate" ? operation.operands[0] : "");
  if (!m) return [];
  const [k, x] = [Number(m[1]), Number(m[2])];
  const answer = k * 5 + x;
  const own = [...printed, k, x, k * 5, answer];
  const numbers = [...Array.from({ length: k - 1 }, (_, i) => k - 1 - i), ...Array.from({ length: Math.max(0, 11 - k) }, (_, i) => k + 1 + i)];
  const out: Operation[] = [];
  for (const a of numbers) for (const b of [1, 2, 3, 4]) {
    if (examplesGiveAway([a, b, a * 5], a * 5 + b, own, answer)) continue;
    out.push({ kind: "evaluate", operands: [`${a} × 5 + ${b}`] });
  }
  return out;
}

/**
 * A scale's easier examples, of its shape ("20 + 3 × 5": the mark the count starts at, plus the intervals times the
 * step), best first, made by code and not from the question's own digits (review of #741, P2: "9 + 3 × 1" for
 * "90 + 3 × 10" gave 12 for 120). Each is refused when it uses any number of the question (its start, count or step),
 * the question's answer, a 0 or a 1; when its answer is the question's, or that times a power of 10; and when its
 * answer's digits begin the question's answer (givesAway; lessons 11 and 12). Its start is a round mark where it can be,
 * and its step a scale's step (5, 2 or 10) before 3, so it reads as a scale. The package check then takes the first
 * that is smaller than the question.
 */
export function scaleExamples(operation: Operation): Operation[] {
  const m = /^(\d+) \+ (\d+) × (\d+)$/.exec(operation.kind === "evaluate" ? operation.operands[0] : "");
  if (!m) return [];
  const own = [Number(m[1]), Number(m[2]), Number(m[3])];
  const answer = own[0] + own[1] * own[2];
  const tenfold = (x: number) => [10, 100, 1000, 10000].some((p) => x * p === answer);
  const out: Operation[] = [];
  // A round start first; a 1-digit start after, for a question with few digits (an example must have fewer, as the
  // package check counts them: "90 + 3 × 2" has 4).
  for (const start of [10, 20, 30, 40, 4, 6, 8]) for (const step of [5, 2, 10, 3]) for (const count of [2, 3, 4]) {
    const got = start + count * step;
    const numbers = [start, count, step];
    if (numbers.some((x) => x <= 1 || own.includes(x) || x === answer) || got === answer || tenfold(got)) continue;
    if (givesAway({ type: "number", value: answer }, { type: "number", value: got })) continue;
    out.push({ kind: "evaluate", operands: [`${start} + ${count} × ${step}`] });
  }
  return out;
}

/** The teaching package of a scale, minute-hand or money claim, or null. */
export function deriveTopicClaim(printed: QuestionPackage): QuestionPackage | null {
  const reading = claimReading(printed);
  if (!reading || !readTopicQuestion(printed)) return null;
  const operation = claimOperation(reading);
  const value = operation && resultOf(operation);
  if (!operation || value === null) return null;
  // The money operation must give what code's evaluate of the bills and quarters gives.
  if (reading.topic === "money" && !sameValue(operationResult(reading.work), { type: "number", value })) return null;
  const answer = { type: "number" as const, value };
  const pairs = reading.topic === "marbles" || reading.topic === "area";
  const own = pairs ? claimNumbers(printed, reading) : new Set<number>();
  const printedNow = printedNumbers(printed.text);
  const examples = pairs ? freshPairs(operation, own) : reading.topic === "money" ? moneyExamples(operation, printedNow)
    : reading.topic === "scale" ? scaleExamples(operation) : minuteExamples(operation, printedNow);
  for (const example of examples) {
    const made = withTeachingOperation(printed, operation, answer, { source: TEACHING_SOURCE, limits: MAYA_TEACHING_LIMITS, examples: [example] });
    if (!made?.easierExample || givesAway(answer, made.easierExample.answer) || heldReason(made) !== null) continue;
    if (!pairs || exampleFresh(made, own)) return made;
  }
  return null;
}

type Clock = Extract<AnswerValue, { type: "time" }>;
const clock = (hours: number, minutes: number): Clock => ({ type: "time", hours, minutes, period: null });
const timeAdd = (from: Clock, minutes: number): Operation => ({ kind: "time-add", operands: [from, { type: "quantity", value: minutes, unit: "min" }] });

/**
 * A clock-time question's easier examples: the same shape (one count, or a count to the next hour then the rest), with
 * none of the question's numbers (lesson 11) and another answer. Smallest first.
 */
function clockExamples(operation: Operation): Operation[] {
  if (operation.kind !== "time-add") return [];
  const [from, d] = operation.operands;
  const end = operationResult(operation);
  if (d.type !== "quantity" || end.type !== "time") return [];
  const crosses = from.minutes !== 0 && from.minutes + d.value > 60;
  // Every number of the question: its start, its minutes, each count's minutes ("3 minutes are left") and its answer's
  // hour and minutes (lessons 11 and 12, review of #742 P2-a: 2:55 + 8 = 3:03 showed the 3 and the ":03" of 7:03).
  const own = new Set([from.hours, from.minutes, d.value, end.hours, end.minutes, ...countMinutes(operation)]);
  const fresh = (example: Operation) => {
    const got = operationResult(example);
    return got.type === "time" && got.minutes !== end.minutes && got.hours !== end.hours && countMinutes(example).every((n) => !own.has(n));
  };
  const out: Operation[] = [];
  for (const h of [2, 3, 4, 5]) {
    if (own.has(h)) continue;
    // The example's count has one digit, so the package check finds it smaller (question-package.ts `smaller`).
    const starts = crosses ? [55, 56, 57, 58] : [0];
    for (const m of starts) for (const add of crosses ? [8, 7, 9, 6] : [5, 4, 3, 6, 7, 8, 2]) {
      // Two counts only when the minutes pass the next hour (question-package-measures.ts, addLegs).
      if (own.has(add) || (m !== 0 && own.has(m)) || (m + add > 60) !== crosses) continue;
      const example = timeAdd(clock(h, m), add);
      if (fresh(example)) out.push(example);
    }
  }
  return out;
}

/** The minutes each count of a time-add counts (47 and 3 for 50 minutes after 6:13). */
const countMinutes = (op: Operation): number[] => workedSteps(op).flatMap((st) => (st.kind === "count-on" ? [st.minutes] : []));

/** The teaching package of a clock-time question ("What time is 50 minutes after 6:13?"), or null. */
export function deriveClockTime(printed: QuestionPackage): QuestionPackage | null {
  const reading = readTopicQuestion(printed);
  if (reading?.topic !== "time") return null;
  const operation = reading.work;
  const answer = operationResult(operation);
  if (answer.type !== "time" || operation.kind !== "time-add") return null;
  const [from, d] = operation.operands;
  // Held (review of #742, P2-d and P3-a): a time past 12:59 on the book's 12-hour clock ("13:03" from a start at 12), and
  // a start whose minutes reach the hour exactly (6:10 + 50 min), which the count to the next hour does not teach yet.
  const steps = workedSteps(operation);
  const times = [from, answer, ...steps.flatMap((st) => (st.kind === "count-on" ? [st.from, st.to] : []))];
  if (times.some((t) => t.type !== "time" || t.hours < 1 || t.hours > 12)) return null;
  if (d.type !== "quantity" || (from.minutes !== 0 && from.minutes + d.value === 60)) return null;
  // A slip that keeps the hour: the minutes of the answer on the starting hour (6:13 + 50 min as 6:03), else one hour on.
  const wrong = from.hours !== answer.hours ? clock(from.hours, answer.minutes) : clock(answer.hours + 1, answer.minutes);
  for (const example of clockExamples(operation)) {
    const candidate: QuestionPackage = {
      ...printed,
      operationSource: TEACHING_SOURCE,
      operation,
      answer: { value: answer, accepted: [], unit: null },
      steps: workedSteps(operation),
      wrongAnswers: [{ value: wrong, cause: "calculation", description: "Keeps the hour or moves it wrongly.", step: null }],
      easierExample: { text: `What time is ${(example.operands[1] as { value: number }).value} minutes after ${clockText(example.operands[0] as Clock)}?`, operation: example, answer: operationResult(example), steps: workedSteps(example) },
    };
    if (!checkQuestionPackage(candidate, undefined, MAYA_TEACHING_LIMITS).ok) continue;
    if (heldReason(candidate) === null) return candidate;
  }
  return null;
}

/** "6:13". */
const clockText = (t: Clock) => `${t.hours}:${String(t.minutes).padStart(2, "0")}`;

/** C3b's and C3c's derivers, registered in index.ts. */
export const TOPIC_DERIVERS: readonly Deriver[] = [deriveTopicClaim, deriveClockTime];
