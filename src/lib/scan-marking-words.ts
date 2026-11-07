// Write-words marking (#715, D-266): the AI only transcribes the words; code decides whether they name the key.
// A number name in an ordinary form is the same number: with or without "and", with hyphens or spaces, in any case.
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
const NUMBER_WORDS = VOCABULARY.filter(w => w !== "and");
/** Pairs of word answers where the other word is a clear wrong answer. */
const OPPOSITES: readonly (readonly [string, string])[] = [["true", "false"], ["even", "odd"], ["yes", "no"]];

/** Lower case, hyphens and dashes as spaces, no commas or end punctuation, single spaces. */
export function plainWords(text: string): string {
  return text.toLowerCase().replace(/[‐-―\-_]/g, " ").replace(/[,.!]/g, " ").replace(/\s+/g, " ").trim();
}

/** A run-together token ("fortytwo") as known number words, fewest pieces first; null when it is not one. */
function split(token: string): string[] | null {
  const best: (string[] | null)[] = [[]];
  for (let end = 1; end <= token.length; end++) {
    best[end] = null;
    for (const word of VOCABULARY) {
      const start = end - word.length, before = start >= 0 ? best[start] : null;
      if (before && token.slice(start, end) === word && (!best[end] || before.length + 1 < best[end]!.length)) best[end] = [...before, word];
    }
  }
  return best[token.length];
}

/** Edit distance with one swap of neighbours counted as one edit. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

/** The one number word a misspelled token clearly is: one edit for short words, two for long ones, and no tie. */
function corrected(token: string): string | null {
  if (token.length < 3 || /[^a-z]/.test(token)) return null;
  const allowed = token.length <= 5 ? 1 : 2;
  const near = NUMBER_WORDS.map(w => ({ w, d: distance(token, w) })).filter(x => x.d <= allowed).sort((a, b) => a.d - b.d);
  return near.length && (near.length === 1 || near[1].d > near[0].d) ? near[0].w : null;
}

function tokens(text: string, fixSpelling: boolean): { words: string[]; fixed: boolean } | null {
  const out: string[] = [];
  let fixed = false;
  for (const raw of plainWords(text).split(" ")) {
    if (!raw) continue;
    const pieces = VOCABULARY.includes(raw) ? [raw] : split(raw);
    if (pieces) { out.push(...pieces); continue; }
    const fix = fixSpelling ? corrected(raw) : null;
    if (!fix) return null;
    out.push(fix); fixed = true;
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

/** The whole number the words name in an ordinary form, or null. "and" is ignored. */
function wordsValue(words: readonly string[]): number | null {
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

/** The number a written number name gives, or null. With fixSpelling, a clear misspelling of a number word counts. */
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
    const read = plainWords(reading), expected = plainWords(key);
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
