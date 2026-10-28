// "Read it to me" (#69, #79): the words the browser voice says for a question. The core shuffles the answer choices,
// so a template's read-aloud text never lists them: the screen passes the choices in the order its rows show them,
// and they are read last, after the question: "Choose one." and then one choice per sentence.
import type { Grade, PublicQuestion } from "./types";

/**
 * D-156: for a Kindergarten child the voice reads each question as it opens, with no tap: most cannot read it yet. The
 * "Read it to me" button stays, to hear it again or to stop it. Older children tap the button, as before (#69).
 */
export const readsAloudFirst = (grade: Grade): boolean => grade === 0;

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

/** Saved tests from before #79 can contain option lists. Remove only list clauses, keeping facts and patterns. */
function removeLegacyChoiceLists(text: string, choices: readonly string[]): string {
  const key = (s: string) => s.toLowerCase().replace(/^or\s+/, "").replace(/[.?!]$/, "").trim();
  const words = new Set(choices.map(key));
  // The old spoken lists sometimes shortened a row's label ("a jar", "the green one", "neither side").
  const aliases = choices.flatMap((c) => {
    const full = key(c);
    const short = full.replace(/^(?:a|an|the) /, "").replace(/ \([^)]*\)$/, "");
    return [full, short, short.replace(/ (snake|ribbon|rope|stick|box)$/, " one"),
      short.replace(/^neither side, it balances$/, "neither side"),
      short.replace(/^they are /, "are they ").replace(/^they weigh /, "do they weigh "),
      short.replace(/^both are /, "both ")];
  });
  const option = `(?:a |an |the )?(?:${aliases.map((c) => escape(c).replace(/, /g, ",?\\s+")).join("|")})`;
  const list = new RegExp(`^(?:or )?${option}(?:(?:,\\s*(?:or\\s+)?|\\s+or\\s+)${option})+[.?!]$`, "i");
  let markedList = false;
  return text.split(/(?<=[.?!])\s+/).flatMap((sentence) => {
    if (key(sentence) === "choose one") { markedList = true; return []; }
    // A bare numeric list may be the pattern being tested. Only an explicit option marker makes it a choice list.
    const numericPattern = /^[\d.,\s]+[.?!]$/.test(sentence) && !markedList;
    if (!numericPattern && (words.has(key(sentence)) || list.test(sentence))) return [];
    // In old comparison questions the last alternative was phrased as another question.
    if (/^Or (?:are they the same(?: length)?|do they weigh the same)\?$/i.test(sentence)) return [];
    // These older templates put the alternatives inside the question, rather than after a colon.
    if (/^Will .+ get more than \d+, fewer than \d+, or exactly \d+\?$/.test(sentence)) {
      return [sentence.replace(/^Will (.+) get .+$/, "How many will $1 get?")];
    }
    if (/^Is it certain, possible but not certain, or impossible that .+\?$/.test(sentence)) {
      return [sentence.replace(/^Is it certain, possible but not certain, or impossible that /, "How likely is it that ")];
    }
    if (/^Is picking .+ unlikely, impossible, or certain\?$/.test(sentence)) {
      return [sentence.replace(/^Is picking (.+) unlikely, impossible, or certain\?$/, "How likely is picking $1?")];
    }
    if (/^On the next toss, is heads more likely, is tails more likely, or are they equally likely\?$/.test(sentence)) {
      return ["On the next toss, which is more likely?"];
    }
    const colon = sentence.indexOf(": ");
    if (/^(Which|Who|What|How)\b/i.test(sentence) && colon >= 0 && list.test(sentence.slice(colon + 2))) {
      return [sentence.slice(0, colon) + "?"];
    }
    return [sentence];
  }).join(" ");
}

/** The spoken text: the question's read-aloud text, then "Choose one." and the choices in the order `shown`. */
export function readAloudText(question: Pick<PublicQuestion, "readAloud" | "say">, shown: readonly string[] = []): string {
  if (shown.length === 0) return question.readAloud;
  const choices = spokenChoices(question, shown);
  const sentences = choices.map((w) => (/[.?!]$/.test(w) ? w : `${w}.`));
  return `${removeLegacyChoiceLists(question.readAloud, choices)} Choose one. ${sentences.join(" ")}`;
}
