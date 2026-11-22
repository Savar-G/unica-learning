/**
 * Lettered choices (#1215). A question such as "Which is prime? A) 22  B) 17  Write A or B." stores its options inside
 * the sentence and circles the letters beside it. The printed page shows the stem alone and each option on its own,
 * letter first, so a child sees what each letter stands for and circles it.
 */
import type { AnswerRegion } from "@/lib/question-package";

export interface LetteredChoices {
  /** The question without its options and without the "Write A or B." cue. */
  stem: string;
  /** One per letter, in order. */
  options: { letter: string; text: string }[];
}

const LETTERS = ["A", "B", "C", "D"];
/** The cue a template ends on: "Write A or B.", "Write A, B or C.". */
const CUE = /\s*(?:Write|Circle|Choose|Say)\s+[A-D](?:,\s*[A-D])*,?\s+or\s+[A-D]\.?\s*$/i;

/**
 * The stem and options of a question whose choices are the letters A, B (C, D) and whose text lists them as "A) ... B) ...".
 * Null for any other question: choices that are not letters, no option list, an option list the text does not end on, or an
 * option missing for a letter.
 */
export function letteredChoices(text: string, choices: readonly string[]): LetteredChoices | null {
  if (choices.length < 2 || choices.some((c, i) => c !== LETTERS[i])) return null;
  const body = text.replace(CUE, "").trim();
  const first = /(^|\s)A\)\s*/.exec(body);
  if (!first) return null;
  const stem = body.slice(0, first.index).trim();
  if (!stem) return null;
  const parts = body.slice(first.index + first[1].length).split(/\s+(?=[B-D]\)\s)/);
  if (parts.length !== choices.length) return null;
  const options = parts.map((part, i) => ({ letter: LETTERS[i], text: part.startsWith(`${LETTERS[i]})`) ? part.slice(2).trim() : "" }));
  return options.every(o => o.text) ? { stem, options } : null;
}

/** The lettered choices of a circled region of a question, or null. */
export function letteredRegion(text: string, region: AnswerRegion): LetteredChoices | null {
  return region.kind === "choice" && region.mark === "circle" ? letteredChoices(text, region.choices) : null;
}
