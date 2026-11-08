// The topic sentence of an "other-topic" question (Maya coverage, Wave C): one or two code-written sentences that say
// how the printed question becomes the operation Maya teaches, said with the question and with the easier example.
// "Roll a die numbered 1 to 8. How many of the numbers are odd?" is 8 ÷ 2 because odd and even numbers take turns;
// "a square and a scalene triangle" is 4 + 0 because of code's symmetry facts. The sentence is read from the printed
// text by the topic's own closed form, and only when the package's operation is the one that form gives, so it never
// names a number the operation does not hold. Plain language (D-202). Pure TypeScript.
import type { Operation } from "@/lib/question-package";
import { dieOperation, readDieCount } from "@/lib/maya-teaching/die-count";
import { readSymmetry, symmetryOperation, SYMMETRY_LINES } from "@/lib/maya-teaching/symmetry";
import { perimeterOperation, readPerimeter } from "@/lib/maya-teaching/perimeter";

const same = (a: Operation, b: Operation) => JSON.stringify(a) === JSON.stringify(b);
const capital = (s: string) => s[0].toUpperCase() + s.slice(1);
const lines = (n: number) => `${n} ${n === 1 ? "line" : "lines"} of symmetry`;

/** The topic sentence of a question text worked as `operation`, or null when the text is not a topic form. */
export function topicFrame(text: string, operation: Operation): string | null {
  const die = readDieCount(text);
  if (die && same(operation, dieOperation(die.last))) {
    return `From 1 to ${die.last}, odd and even take turns. So half are ${die.kind}.`;
  }
  const shapes = readSymmetry(text);
  if (shapes && same(operation, symmetryOperation(...shapes))) {
    const [[a, x], [b, y]] = shapes.map((i) => SYMMETRY_LINES[i]);
    return `${capital(a)} has ${lines(x)}. ${capital(b)} has ${y}.`;
  }
  const claim = claimFrame(text, operation);
  if (claim) return claim;
  const clock = clockFrame(text, operation);
  if (clock) return clock;
  const rectangle = readPerimeter(text);
  if (rectangle && same(operation, perimeterOperation(rectangle.length, rectangle.width))) {
    return "A rectangle has 2 lengths and 2 widths. Add one length and one width. Then double it.";
  }
  return null;
}

/**
 * The topic sentence Maya still owes on this question: its sentence while no turn of Maya's has said it yet, else null.
 * The first step line Maya says carries it, at any hint level (brief, "Lessons from review" 2): a workbook call opens
 * with the fixed opening, which has no room for it in a 25-word turn.
 */
export function frameOwed(text: string, operation: Operation, said: readonly string[]): string | null {
  const frame = topicFrame(text, operation);
  return frame && !said.some((t) => t.includes(frame)) ? frame : null;
}

/**
 * The checked numbers a child may name while working a topic question, beyond the operation's own: the die's odd or
 * even numbers, counted by code ("1, 3, 5 and 7 are odd"). For the scope check (scope.ts, "Lessons from review" 1).
 */
export function topicNumbers(text: string, operation: Operation): number[] {
  const die = readDieCount(text);
  if (!die || !same(operation, dieOperation(die.last))) return [];
  return Array.from({ length: die.last }, (_, i) => i + 1).filter((x) => (x % 2 === 1) === (die.kind === "odd"));
}

const SCALE = /^A scale's marks are (\d+), (\d+), (\d+)\. True or false: (\d+) intervals above \2 is (\d+)\.$/;
const MINUTE = /^True or false: the minute hand (\d) marks past the (\d{1,2}) shows (\d+) minutes\.$/;
const MARBLES = /^True or false: with (\d+) red, (\d+) blue and (\d+) green marbles, red is more likely than the other colours together\.$/;
const AREA = /^True or false: (\d+) by (\d+) squares is bigger than (\d+) by (\d+) squares\.$/;
const MONEY = /^True or false: (\d+) \$20 bills and (\d+) quarters is \$\d+\.\d\d\.$/;
/** "$60", "$0.75". */
const dollars = (n: number) => "$" + (Number.isInteger(n) ? String(n) : n.toFixed(2));

/**
 * The topic sentence of a scale, minute-hand or money claim (C3b), or a marbles or area claim (C3c), by its closed form,
 * when the operation is the one that form gives: the scale's step between marks, the minute hand's 5 minutes a number,
 * the bills' and quarters' dollars, when red is more likely, and the other area (code's product). The claim's own
 * question line follows it.
 */
function claimFrame(text: string, operation: Operation): string | null {
  const t = text.trim();
  const scale = SCALE.exec(t);
  if (scale) {
    const [a, b, c, m] = [+scale[1], +scale[2], +scale[3], +scale[4]];
    const k = b - a;
    if (k > 0 && c - b === k && same(operation, { kind: "evaluate", operands: [`${b} + ${m} × ${k}`] })) return `The marks go up by ${k} each time. So each interval is ${k}.`;
  }
  const minute = MINUTE.exec(t);
  if (minute && same(operation, { kind: "evaluate", operands: [`${minute[2]} × 5 + ${minute[1]}`] })) {
    return "Each number on the clock is 5 minutes. Each small mark is 1 more minute.";
  }
  const marbles = MARBLES.exec(t);
  if (marbles && same(operation, { kind: "add", operands: [+marbles[2], +marbles[3]] })) {
    return "Red is more likely only if there are more red marbles than blue and green together.";
  }
  const area = AREA.exec(t);
  if (area && same(operation, { kind: "multiply", operands: [+area[1], +area[2]] })) {
    return `${area[3]} by ${area[4]} squares is ${+area[3] * +area[4]} squares. Bigger means more squares.`;
  }
  const cash = MONEY.exec(t);
  if (cash) {
    const [bills, quarters] = [+cash[1], +cash[2]];
    if (same(operation, { kind: "decimal-add", operands: [bills * 20, (quarters * 25) / 100] })) {
      return `${bills} $20 bills make ${dollars(bills * 20)}. ${quarters} quarters make ${dollars((quarters * 25) / 100)}.`;
    }
  }
  return null;
}

/**
 * An "other-topic" question (C3, C3b, C3c): one with a topic sentence, or a clock-time question (time-add, which only
 * the session adapter makes). Its way out is the easier example, then the honest close (lessons from review 7 and 10).
 */
export const topicQuestion = (text: string, operation: Operation): boolean => topicFrame(text, operation) !== null || operation.kind === "time-add";

const CLOCK = /^What time is (\d+) minutes after (1[0-2]|[1-9]):([0-5]\d)\?$/;

/**
 * The topic sentence of a clock-time question (C3c), when its time-add is the printed one: count on to the next hour
 * first when the minutes pass it ("First count on to the next hour, 7:00. Then count the minutes left."), else the
 * hour stays ("The hour stays 9. Count on the minutes.").
 */
function clockFrame(text: string, operation: Operation): string | null {
  const m = CLOCK.exec(text.trim());
  if (!m || operation.kind !== "time-add") return null;
  const [minutes, hours, mm] = [+m[1], +m[2], +m[3]];
  const [from, d] = operation.operands;
  if (from.hours !== hours || from.minutes !== mm || d.type !== "quantity" || d.unit !== "min" || d.value !== minutes) return null;
  if (mm !== 0 && mm + minutes > 60) return `First count on to the next hour, ${hours + 1}:00. Then count the minutes left.`;
  return mm + minutes < 60 ? `The hour stays ${hours}. Count on the minutes.` : null;
}

/**
 * The checked relations a child may say while working a clock-time question, for the scope check (scope.ts,
 * "Lessons from review" 1): the minutes to the next hour ("13 plus 47 is 60", "60 minus 13 is 47"), the minutes left
 * ("50 minus 47 is 3"), and the minutes of a one-count question ("0 plus 40 is 40").
 */
export function topicRelations(operation: Operation, text = ""): { op: "add" | "subtract" | "multiply"; operands: number[] }[] {
  // An area claim's other area, by the same closed form as its topic sentence ("4 by 2 squares is 8 squares"): a child
  // who works it ("4 times 2 is 8.") stays on the question (review of #742, P1-c).
  const area = AREA.exec(text.trim());
  if (area && same(operation, { kind: "multiply", operands: [+area[1], +area[2]] })) return [{ op: "multiply", operands: [+area[3], +area[4]] }];
  if (operation.kind !== "time-add") return [];
  const [from, d] = operation.operands;
  if (d.type !== "quantity" || d.unit !== "min") return [];
  const toHour = 60 - from.minutes;
  if (from.minutes !== 0 && from.minutes + d.value > 60) {
    return [
      { op: "add", operands: [from.minutes, toHour] }, { op: "subtract", operands: [60, from.minutes] },
      { op: "subtract", operands: [d.value, toHour] }, { op: "add", operands: [toHour, d.value - toHour] },
    ];
  }
  return [{ op: "add", operands: [from.minutes, d.value] }];
}
