// "Read it to me" (#69, #79): the words the browser voice says for a question. The core shuffles the answer choices,
// so a template's read-aloud text never lists them: the screen passes the choices in the order its rows show them,
// and they are read last, after the question: "Choose one." and then one choice per sentence.
import type { PublicQuestion } from "./types";

/** The shape glyphs of the banks (#74), as words. */
const GLYPH_WORDS: Record<string, string> = { "●": "circle", "■": "square", "▲": "triangle", "★": "star", "▬": "rectangle", "▮": "rectangle", "◆": "diamond", "▼": "triangle" };
const GLYPH = "[●■▲★▬▮◆▼]";
const ORDINALS = ["first", "second", "third", "fourth", "fifth"];

/** A choice drawn as a line (k-longer-line, #74): a run of ▬. The screen draws it; the voice says only its place. */
export const isLineChoice = (choice: string) => /^▬+$/.test(choice);

/**
 * One choice as words. The question's `say` wins (a template sets it where the default is wrong: "9:3" is a ratio,
 * "7:55" a time). Otherwise: fractions read as "a out of b", like the templates' own read-aloud text; shape glyphs as
 * their names ("● circle" says "circle" once); sums with "plus", "minus" and "is the same as"; pattern letters as
 * "letter A".
 */
export function sayChoice(choice: string, say: Record<string, string> | undefined): string {
  const own = say?.[choice];
  if (own) return own;
  const c = choice.replace(/ /g, " ").trim();
  const named = c.match(new RegExp(`^${GLYPH} (\\p{L}.*)$`, "u"));
  if (named) return named[1];
  if (new RegExp(`^${GLYPH}( ${GLYPH})*$`).test(c)) return c.split(" ").map((g) => GLYPH_WORDS[g]).join(", ");
  if (/^[A-Z]( [A-Z])+$/.test(c)) return c.split(" ").map((l) => `letter ${l}`).join(", ");
  return c
    .replace(/^(\d+) (\d+)\/(\d+)$/, "$1 and $2 out of $3")
    .replace(/^(\d+)\/(\d+)$/, "$1 out of $2")
    .replace(/ \+ /g, " plus ")
    .replace(/ [−-] /g, " minus ")
    .replace(/ = /g, " is the same as ");
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when `text` says this choice as a whole word or number ("1 out of 3" is in "...: 1 out of 3, or ..."). */
export function namesChoice(text: string, choice: string, say?: Record<string, string>): boolean {
  return new RegExp(`(^|[^\\w.])${escape(sayChoice(choice, say))}(?![\\w]|\\.\\d)`, "i").test(text);
}

/** Each choice in the order `shown`, as the voice says it. The screen uses the same words to name its rows. */
export function spokenChoices(question: Pick<PublicQuestion, "say">, shown: readonly string[]): string[] {
  let lines = 0;
  return shown.map((c) => (isLineChoice(c) ? `the ${ORDINALS[lines++] ?? "next"} line` : sayChoice(c, question.say)));
}

/** The spoken text: the question's read-aloud text, then "Choose one." and the choices in the order `shown`. */
export function readAloudText(question: Pick<PublicQuestion, "readAloud" | "say">, shown: readonly string[] = []): string {
  if (shown.length === 0) return question.readAloud;
  const sentences = spokenChoices(question, shown).map((w) => (/[.?!]$/.test(w) ? w : `${w}.`));
  return `${question.readAloud} Choose one. ${sentences.join(" ")}`;
}
