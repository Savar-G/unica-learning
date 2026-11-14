// How Maya reads a child's turn on B1b's place-value steps (design: .design/research/maya-place-value-design.md, section
// 5): "which digit is bigger" (a compare) and "what is this digit worth" (a sum). As for B1a's digit step and an addition
// column (#698), a step counts only when the child's WHOLE turn is one of the step's templates: an allow-list over the
// whole turn, never a search inside it. A hedge ("maybe 8"), a question ("is it 8?"), another speaker ("my mom said 8"),
// another number or a second sentence fits no template; neither does a turn after Maya showed the step (H3), nor one
// speech-to-text was not sure of. A plain yes credits only Maya's own "Did you say 8?" for this step.
// Pure TypeScript.
import type { AnswerValue, WorkedStep } from "@/lib/question-package";
import { plainNumber, wholeTurn, wholeYes } from "./numbers";

type Bigger = Extract<WorkedStep, { kind: "bigger" }>;
type Worth = Extract<WorkedStep, { kind: "place-worth" }>;

const DIGIT = "(\\d|zero|one|two|three|four|five|six|seven|eight|nine)";
const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const digitOf = (token: string): number | null => (/^\d$/.test(token) ? Number(token) : DIGIT_WORDS.includes(token) ? DIGIT_WORDS.indexOf(token) : null);
const UNIT: Record<string, string> = {
  ones: "one", tens: "ten", hundreds: "hundred", thousands: "thousand", "ten thousands": "ten thousand", "hundred thousands": "hundred thousand", millions: "million",
};

/**
 * The digit a whole turn names as the bigger one, or null: the digit alone, "it's 8", "8 is bigger", "8 is bigger than
 * 3", "8 is more", "the 8", "8 is the bigger digit". Only one of the step's two digits, and "than" only the other.
 */
export function biggerTemplate(body: string, step: Bigger): number | null {
  const forms = [`${DIGIT}`, `it['’]?s ${DIGIT}`, `it is ${DIGIT}`, `the ${DIGIT}`, `${DIGIT} is bigger`, `${DIGIT} is more`, `${DIGIT} is the bigger digit`, `${DIGIT} is bigger than ${DIGIT}`];
  for (const f of forms) {
    const m = new RegExp(`^${f}$`).exec(body);
    if (!m) continue;
    const d = digitOf(m[1]);
    if (d === null || (d !== step.a && d !== step.b)) return null;
    if (m[2] !== undefined && digitOf(m[2]) !== (d === step.a ? step.b : step.a)) return null;
    return d;
  }
  return null;
}

/** "9,000", "9 000", "nine thousand": one whole number, or null. */
function wholeNumber(text: string): number | null {
  const t = text.trim();
  if (/^\d{1,3}(?:[, ]\d{3})+$/.test(t)) return Number(t.replace(/[, ]/g, ""));
  return plainNumber(t);
}

/**
 * The value a whole turn gives for a place-worth step, or null: the value alone, "it's 9000", "it is 9000", "i got 9000",
 * "it's worth 9000", "9000 is the value", "the value is 9000", "9 times 1000 is 9000", "9 × 1000 = 9000", "9 thousands is
 * 9000" (only this step's digit, place and worth).
 */
export function worthTemplate(body: string, step: Worth): number | null {
  const V = "(.+)";
  const place = `(?:${step.place}|${UNIT[step.place] ?? step.place})`;
  const forms: { re: string; digit?: number; worth?: number }[] = [
    { re: `${V}` }, { re: `it['’]?s ${V}` }, { re: `it is ${V}` }, { re: `i got ${V}` }, { re: `it['’]?s worth ${V}` }, { re: `${V} is the value` },
    { re: `the value is ${V}` }, { re: `${DIGIT} times ${V} is ${V}`, digit: 1, worth: 2 }, { re: `${DIGIT} (?:×|x) ${V} = ${V}`, digit: 1, worth: 2 },
    { re: `${DIGIT} ${place} (?:is|is worth|makes) ${V}`, digit: 1 },
  ];
  for (const f of forms) {
    const m = new RegExp(`^${f.re}$`).exec(body);
    if (!m) continue;
    if (f.digit !== undefined && digitOf(m[f.digit]) !== step.digit) continue;
    if (f.worth !== undefined && wholeNumber(m[f.worth]) !== step.worth) continue;
    const v = wholeNumber(m[m.length - 1]);
    if (v !== null) return v;
  }
  return null;
}

/**
 * A bigger or place-worth step is heard: the whole turn is one of its templates with its answer, or a plain yes to Maya's
 * own "Did you say 8?" for this step (`asked`). Never after Maya showed the step (`copy`, H3), and never for a turn code
 * could not hear for sure (`uncertain`).
 */
export function partsStepHeard(input: { text: string; uncertain: boolean; step: Bigger | Worth; value: AnswerValue; copy: boolean; asked: AnswerValue | null }): boolean {
  const { step, value } = input;
  const total = step.kind === "bigger" ? step.bigger : step.value;
  if (input.uncertain || input.copy || value.type !== "number" || value.value !== total) return false;
  const body = wholeTurn(input.text);
  if (body === null) return false;
  const yes = wholeYes(body);
  if (yes) return input.asked?.type === "number" && input.asked.value === total && (yes.value === null || yes.value === total);
  return (step.kind === "bigger" ? biggerTemplate(body, step) : worthTemplate(body, step)) === total;
}

/** The step's own number, for its confirm ("Did you say 8?"): the bigger digit, or the digit's value. */
export const partsStepTotal = (step: Bigger | Worth): number => (step.kind === "bigger" ? step.bigger : step.value);
