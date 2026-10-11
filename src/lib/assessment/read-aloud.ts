// "Read it to me" (#69, #79): the words the browser voice says for a question. The core shuffles the answer choices,
// so a template's read-aloud text never lists them: the screen passes the choices in the order its buttons show them,
// and they are read last, after the question.
import type { PublicQuestion } from "./types";

/**
 * One choice as words. The question's `say` wins (a template sets it where the default is wrong: "9:3" is a ratio,
 * "7:55" a time). Otherwise fractions read as "a out of b", like the templates' own read-aloud text.
 */
export function sayChoice(choice: string, say: Record<string, string> | undefined): string {
  const own = say?.[choice];
  if (own) return own;
  return choice
    .replace(/^(\d+) (\d+)\/(\d+)$/, "$1 and $2 out of $3")
    .replace(/^(\d+)\/(\d+)$/, "$1 out of $2");
}

/** "a", "a, or b", "a, b, or c". */
const list = (words: string[]) => (words.length < 3 ? words.join(", or ") : `${words.slice(0, -1).join(", ")}, or ${words.at(-1)}`);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when `text` says this choice as a whole word or number ("1 out of 3" is in "...: 1 out of 3, or ..."). */
export function namesChoice(text: string, choice: string, say?: Record<string, string>): boolean {
  return new RegExp(`(^|[^\\w.])${escape(sayChoice(choice, say))}(?![\\w]|\\.\\d)`, "i").test(text);
}

/**
 * The spoken text: the question's read-aloud text, then "Is it ...?" with the choices in the order `shown`.
 * A question stored before #79 can name every choice in its own text (in template order); it is read as it is, once.
 */
export function readAloudText(question: Pick<PublicQuestion, "readAloud" | "say">, shown: readonly string[] = []): string {
  if (shown.length === 0 || shown.every((c) => namesChoice(question.readAloud, c, question.say))) return question.readAloud;
  return `${question.readAloud} Is it ${list(shown.map((c) => sayChoice(c, question.say)))}?`;
}
