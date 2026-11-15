// What a word problem asks (pre-launch check 2 of the tutor core, 2026-11-15). A kind fits a story only when its final
// question asks for exactly the quantity the stored operation computes, in one of the kind's closed question forms
// ("How many counters are left?", "How many books in 5 bins?"). Words that name the operation are not enough: "Mia gave
// away 52 counters and has 28 left. How many counters did she have at first?" says "gave away" and "left", but it asks
// for 80, not 52 − 28. Any other question form keeps the controller (fail closed).

/** The text with commas taken out of numbers ("10,000" is 10000) and single spaces. */
export const plainText = (text: string) => text.replace(/(\d),(?=\d{3}\b)/g, "$1").replace(/\s+/g, " ").trim();

/** The sentences of a text, each with its end mark. A "?" that stands for a number ("adds ? each time") ends none. */
export const sentencesIn = (text: string): string[] => plainText(text).split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean);

/**
 * The final question of a story, in lower case without its "?": the last sentence, when it is the text's one question.
 * Null when the text does not end with its only "?".
 */
export function finalQuestion(text: string): string | null {
  const t = plainText(text);
  if (!t.endsWith("?") || t.indexOf("?") !== t.length - 1) return null;
  return sentencesIn(t).at(-1)!.slice(0, -1).trim().toLowerCase();
}

/**
 * Words that change what a question asks when they stand in a free part of a form: another operation ("double",
 * "half", "sold", "gave"), a share ("each", "per") or another moment of the story ("at first", "before").
 */
const CHANGES_ASK = String.raw`(?:doubled?|doubles|half|halves|halved|twice|triple[ds]?|thrice|times|each|every|per|first|start|started|begin|began|sold|sells?|sell|gave|gives?|given|give|away|more|fewer|less|left|spent|spends?|spend|lost|loses?|lose|ate|eats?|eat|used|uses?|use|bought|buys?|buy|got|gets?|get|before|after|ago|groups?|shares?|shared|split|did|does|do|is|are|was|were|has|have|had|in|of|that|than|there|altogether|total|all)`;
/** One free word of a form: never a word that changes the ask. */
export const WORD = String.raw`(?!${CHANGES_ASK}\b)[a-z']+`;
/** A thing counted: one or two free words ("counters", "toy cars"). */
export const THING = String.raw`(${WORD}(?: ${WORD})?)`;
/** Who: "ava", "the school", "her friend", "she". */
export const WHO = String.raw`((?:(?:the|her|his|their|a) )?${WORD})`;

/** Things that hold or group other things: a story's groups, never the things a product counts. */
const GROUP_WORDS = new Set(["box", "pack", "bag", "bin", "jar", "bus", "basket", "tray", "row", "group", "team", "shelf", "shelve", "crate", "plate", "level", "day", "week", "month", "year", "bundle", "carton"]);

/** Whether the thing asked for is counted after a printed number of the story ("How many counters" and "52 counters"). */
export function countedInText(text: string, thing: string): boolean {
  const stem = thing.replace(/(?:es|s)$/, "");
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(String.raw`\b\d+ (?:[a-z]+ )?${escaped}(?:e?s)?\b`, "i").test(plainText(text));
}

/** Whether the thing asked for is a group (a box, a bag, a day), not a thing the groups hold. */
export function isGroup(thing: string): boolean {
  const last = thing.split(" ").at(-1)!;
  return [last, last.replace(/s$/, ""), last.replace(/es$/, "")].some((w) => GROUP_WORDS.has(w));
}

/** The story's clauses (cut at ".", "?", "!", ",", ";", "and" and "then"), each in lower case. */
export const clausesIn = (text: string): string[] => plainText(text).toLowerCase().split(/[.?!,;]|\s+(?:and|then)\s+/).map((c) => c.trim()).filter(Boolean);

/** The one clause of the story that prints `n`, or null when none or more than one does. */
export function clauseWith(text: string, n: number): string | null {
  const found = clausesIn(text).filter((c) => new RegExp(String.raw`(?<![\d.])${n}(?![\d.])`).test(c));
  return found.length === 1 ? found[0] : null;
}
