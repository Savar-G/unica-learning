// How Maya reads a child's turn on a place-value step (B1a, design: .design/research/maya-place-value-design.md, section
// 5). A step counts only when the child's WHOLE turn is one of the step's templates, as for an addition column (#698,
// stepTurnHeard in session.ts): an allow-list over the whole turn, never a search inside it. Anything else (another
// number, another place, a hedge, a question, a second sentence) is no step credit, and the session goes on as for any
// turn it did not hear as a step. A bare homophone ("for", "to", "won", "ate") is never a digit.
// Pure TypeScript.
import type { AnswerValue, WorkedStep } from "@/lib/question-package";
import { wholeTurn, wholeYes } from "./numbers";

const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const UNIT: Record<string, string> = {
  ones: "one", tens: "ten", hundreds: "hundred", thousands: "thousand", "ten thousands": "ten thousand", "hundred thousands": "hundred thousand", millions: "million",
};

/** The digit a whole turn's digit token says: "5" or "five", or null for anything else. */
function digitOf(token: string): number | null {
  if (/^\d$/.test(token)) return Number(token);
  const i = DIGIT_WORDS.indexOf(token);
  return i >= 0 ? i : null;
}

/**
 * The digit a whole turn (wholeTurn's body) gives for a read-digit step in this place, or null: the digit alone, "it's
 * 5", "it is 5", "it's a 5", "i got 5", "the digit is 5", "5 is the digit", "the thousands digit is 5", or the digit with
 * this step's own place ("5 thousands", "1 thousand"). A different place word fits no template.
 */
export function digitTemplate(body: string, place: string): number | null {
  const own = `(?:${place}|${UNIT[place] ?? place})`;
  const d = "(\\d|zero|one|two|three|four|five|six|seven|eight|nine)";
  const forms = [
    `${d}`, `it['’]?s ${d}`, `it is ${d}`, `it['’]?s a ${d}`, `i got ${d}`, `the digit is ${d}`, `${d} is the digit`,
    `the ${place} digit is ${d}`, `${d} ${own}`,
  ];
  for (const f of forms) {
    const m = new RegExp(`^${f}$`).exec(body);
    if (m) return digitOf(m[1]);
  }
  return null;
}

/**
 * A read-digit step is heard: the whole turn is one of its templates with its digit, or a plain yes to Maya's own "Did you
 * say 5?" for this step (`asked`). Never after Maya showed the step (`copy`, H3), and never for a turn code could not hear
 * for sure (`uncertain`).
 */
export function placeStepHeard(input: {
  text: string;
  uncertain: boolean;
  step: Extract<WorkedStep, { kind: "read-digit" }>;
  value: AnswerValue;
  copy: boolean;
  asked: AnswerValue | null;
}): boolean {
  const { step, value } = input;
  if (input.uncertain || input.copy || value.type !== "number" || value.value !== step.digit) return false;
  const body = wholeTurn(input.text);
  if (body === null) return false;
  const yes = wholeYes(body);
  if (yes) return input.asked?.type === "number" && input.asked.value === step.digit && (yes.value === null || yes.value === step.digit);
  return digitTemplate(body, step.place) === step.digit;
}

/**
 * The child asks about a place ("Which one is the thousands place?", "Where's the tens?", "What's the hundreds place?")
 * or why ("Why do I multiply?"): Maya answers with the code line for it (where.place, why.value) before going on (J06). A question about a place word,
 * with a question word or a question mark; never a turn with a digit answer in it.
 */
export function asksPlace(text: string): boolean {
  const t = text.toLowerCase().replace(/’/g, "'");
  const place = /\b(?:place|places|column|ones|tens|hundreds|thousands|millions)\b/.test(t);
  const question = /\b(?:which|where|what|what's|whats|how|is it)\b/.test(t) && (/\?/.test(t) || /^\s*(?:which|where|what|what's|whats|how)\b/.test(t));
  // "Why do I multiply?", "Why is it the thousands?": a question about the step, answered first too.
  const why = /\bwhy\b/.test(t) && (/\?/.test(t) || /^\s*why\b/.test(t));
  return (place && question) || why;
}
