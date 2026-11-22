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

/** The question's words as printed: its stem when its options print as choices of their own, else its whole text. */
export const letteredStem = (text: string, regions: readonly AnswerRegion[]): string =>
  regions.map(r => letteredRegion(text, r)).find(x => x)?.stem ?? text;

/** The circle-target row of lettered options, or null for any other region. `words` prints an option's text as the page prints a question's. */
export function letteredHtml(text: string, region: AnswerRegion, measure: string, words: (s: string) => string): string | null {
  const lettered = letteredRegion(text, region);
  return lettered && `<span class="circ opts" ${measure}>${lettered.options.map(o => `<span class="co"><b>${o.letter})</b><span>${words(o.text)}</span></span>`).join("")}</span>`;
}

/** Each option is its own target, letter first, in a row under the question's words; wrapped cards keep the row below the words. */
export const LETTERED_CSS = `
.pg.consistent .circ.opts{display:flex;flex:1 1 100%;flex-wrap:wrap;align-items:center;gap:6px 32px;width:100%;min-height:44px;padding:0}
.pg.consistent :is(.head,.top,.act):has(>.circ.opts){flex-wrap:wrap}
.pg.consistent .story.nowork .head:has(>.circ.opts){align-items:baseline}
.pg.consistent .chc .act:has(>.circ.opts){align-items:flex-start}
.circ.opts .co{display:inline-flex;align-items:baseline;gap:10px;padding:4px 14px;font-family:"Unica Sans",Helvetica,Arial,sans-serif;font-size:var(--body);line-height:1.3}
.circ.opts .co b{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500}
`;
