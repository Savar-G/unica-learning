// Write-words marking (#715, D-266): the AI only transcribes the words; code decides whether they name the key.
// A number name in an ordinary form is the same number: with or without "and" (after hundred or thousand), with hyphens
// or spaces, in any case. A misspelling counts only when it is in a short closed list (KNOWN_MISSPELLINGS).
// A clear different number is wrong. Anything code cannot read as a number name stays unsure, for our team to check.
// Pure TypeScript: no network, database, clock or Math.random.
import type { MarkResult } from "@/lib/scan-observation";

/**
 * The one switch for a spelling mistake that still clearly names the key's number ("fourty two" for 42). Until Savar
 * answers, this is a math book, so it counts as right. His answer flips it to "wrong". A misspelling that would name a
 * different number is never a mark: it stays unsure.
 */
export const MISSPELLED_NUMBER_NAME: "right" | "wrong" = "right";

const UNITS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { thousand: 1_000, million: 1_000_000 };
const VOCABULARY = ["zero", "hundred", "and", ...Object.keys(UNITS), ...Object.keys(TEENS), ...Object.keys(TENS), ...Object.keys(SCALES)];
/** Pairs of word answers where the other word is a clear wrong answer. */
const OPPOSITES: readonly (readonly [string, string])[] = [["true", "false"], ["even", "odd"], ["yes", "no"]];

/** For a number name only: lower case, hyphens and dashes as spaces, no commas or end punctuation, single spaces. */
function plainNumberWords(text: string): string {
  return text.toLowerCase().replace(/[‐-―\-_]/g, " ").replace(/[,.!]/g, " ").replace(/\s+/g, " ").trim();
}
/** Any other answer: only case and spacing, so "9 4" is not "9 - 4" and "$4 05" is not "$4.05". */
const plainText = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
/**
 * Known child spellings of a number word, each to its one word. A closed list: nothing is guessed from how close a word
 * is, so a real word ("fifths", "sixties", "tens") or a cut-off word ("sevente") is never read as a number. Add a spelling
 * only when it cannot be another real word.
 */
export const KNOWN_MISSPELLINGS: Readonly<Record<string, string>> = {
  fourty: "forty", ninty: "ninety", ninteen: "nineteen", eightteen: "eighteen", twelv: "twelve",
  fivety: "fifty", fivty: "fifty", fiveteen: "fifteen", hundered: "hundred", hunderd: "hundred",
};

/** A run-together token ("fortytwo", "fourtyfive") as known words, fewest pieces first; null when it is not one. */
function split(token: string, words: readonly string[]): string[] | null {
  const best: (string[] | null)[] = [[]];
  for (let end = 1; end <= token.length; end++) {
    best[end] = null;
    for (const word of words) {
      const start = end - word.length, before = start >= 0 ? best[start] : null;
      if (before && token.slice(start, end) === word && (!best[end] || before.length + 1 < best[end]!.length)) best[end] = [...before, word];
    }
  }
  return best[token.length];
}

/** Every token must be a number word, "and", or (with fixSpelling) a known misspelling; anything else makes it unsure. */
function tokens(text: string, fixSpelling: boolean): { words: string[]; fixed: boolean } | null {
  const known = fixSpelling ? [...VOCABULARY, ...Object.keys(KNOWN_MISSPELLINGS)] : VOCABULARY;
  const out: string[] = [];
  let fixed = false;
  for (const raw of plainNumberWords(text).split(" ")) {
    if (!raw) continue;
    const pieces = known.includes(raw) ? [raw] : split(raw, known);
    if (!pieces) return null;
    for (const piece of pieces) {
      const word = KNOWN_MISSPELLINGS[piece];
      if (fixSpelling && word) { out.push(word); fixed = true; } else out.push(piece);
    }
  }
  return out.length ? { words: out, fixed } : null;
}

/** 1 to 999 from the start of the words, with the index after it; null when the words do not start with one. */
function belowThousand(w: readonly string[], i: number): [number, number] | null {
  let value = 0, at = i;
  const unit = UNITS[w[at]];
  if (unit !== undefined && w[at + 1] === "hundred") { value = unit * 100; at += 2; }
  if (TENS[w[at]] !== undefined) { value += TENS[w[at]]; at++; if (UNITS[w[at]] !== undefined) { value += UNITS[w[at]]; at++; } }
  else if (TEENS[w[at]] !== undefined) { value += TEENS[w[at]]; at++; }
  else if (UNITS[w[at]] !== undefined && w[at + 1] !== "hundred") { value += UNITS[w[at]]; at++; }
  return at > i && value > 0 ? [value, at] : null;
}

/** "and" only right after hundred, thousand or million, and before more number words. */
const andPlaced = (words: readonly string[]) => words.every((x, i) => x !== "and"
  || (i > 0 && ["hundred", "thousand", "million"].includes(words[i - 1]) && i + 1 < words.length && words[i + 1] !== "and"));
/** The whole number the words name in an ordinary form, or null. A well-placed "and" is ignored. */
function wordsValue(words: readonly string[]): number | null {
  if (!andPlaced(words)) return null;
  const w = words.filter(x => x !== "and");
  if (!w.length) return null;
  if (w.length === 1 && w[0] === "zero") return 0;
  let total = 0, at = 0, lastScale = Infinity;
  while (at < w.length) {
    const group = belowThousand(w, at);
    if (!group) return null;
    const [value, next] = group, scale = SCALES[w[next]];
    if (scale === undefined) { if (next !== w.length || value >= lastScale) return null; total += value; at = next; break; }
    if (scale >= lastScale) return null;
    total += value * scale; lastScale = scale; at = next + 1;
  }
  return at === w.length && total <= Number.MAX_SAFE_INTEGER ? total : null;
}

/** The number a written number name gives, or null. With fixSpelling, a known misspelling of a number word counts. */
export function numberFromWords(text: string, fixSpelling = false): { value: number; misspelled: boolean } | null {
  // "a" is "one" only at the start, before "hundred" or "thousand" ("a hundred and six").
  const read = tokens(text.replace(/^\s*a\s+(?=(?:hundred|thousand)\b)/i, "one "), fixSpelling);
  if (!read) return null;
  const value = wordsValue(read.words);
  return value === null ? null : { value, misspelled: read.fixed };
}

/**
 * Code's mark for a clear write-words reading: right, wrong, or null when code cannot decide (our team checks it).
 * A key that is a number name is compared as a number. Any other key needs the same words; its opposite is wrong.
 */
export function checkWordsReading(reading: string, key: string): MarkResult | null {
  const want = numberFromWords(key);
  if (!want) {
    const read = plainText(reading), expected = plainText(key);
    if (!read || !expected) return null;
    if (read === expected) return "right";
    return OPPOSITES.some(([a, b]) => (a === expected && b === read) || (b === expected && a === read)) ? "wrong" : null;
  }
  const plain = numberFromWords(reading);
  if (plain) return plain.value === want.value ? "right" : "wrong";
  const fixed = numberFromWords(reading, true);
  if (!fixed || fixed.value !== want.value) return null;
  return MISSPELLED_NUMBER_NAME;
}
