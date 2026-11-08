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
