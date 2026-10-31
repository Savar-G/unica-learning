// What Maya actually said, compared with what code approved for her turn (#372, review R374-2). The voice adapter
// reports the speech (or its transcript) as `maya_said`; it must be the approved text of that turn, word for word, or
// the call starts a repair, whatever the difference ("Yes!" after a wrong answer has no math, but it is unchecked
// approval). Both sides are normalised the same way, never matched loosely: case, spaces and punctuation; a number in
// digits or in words ("27", "twenty-seven"); the math signs as their spoken words; and contractions ("let's", "let us").
// Pure TypeScript; it never throws.

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES: [number, string][] = [[1e9, "billion"], [1e6, "million"], [1000, "thousand"], [100, "hundred"]];

/** A whole number in words, with no "and" and no hyphen: 1081 is "one thousand eighty one". */
function wholeWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return [TENS[Math.floor(n / 10)], n % 10 ? ONES[n % 10] : ""].filter(Boolean).join(" ");
  for (const [size, word] of SCALES) {
    if (n >= size) {
      const rest = n % size;
      return [wholeWords(Math.floor(n / size)), word, rest ? wholeWords(rest) : ""].filter(Boolean).join(" ");
    }
  }
  return String(n);
}

/** Digits as words: "27" is "twenty seven", "2.5" is "two point five". Numbers too long to say stay as digits. */
function numberWords(digits: string): string {
  const [whole, decimals] = digits.split(".");
  if (whole.length > 12) return digits;
  const said = wholeWords(Number(whole));
  return decimals === undefined ? said : `${said} point ${[...decimals].map((d) => ONES[Number(d)]).join(" ")}`;
}

/** Contractions, both ways the same: "let's" is "let us", "can't" is "can not", "I'm" is "i am". */
const CONTRACTIONS: [RegExp, string][] = [
  [/\blet's\b/g, "let us"], [/\bcan't\b/g, "can not"], [/\bcannot\b/g, "can not"], [/\bwon't\b/g, "will not"],
  [/n't\b/g, " not"], [/'re\b/g, " are"], [/'m\b/g, " am"], [/'ll\b/g, " will"], [/'ve\b/g, " have"], [/'d\b/g, " would"],
  [/\b(it|that|what|here|there|he|she|who|where)'s\b/g, "$1 is"],
];

/** Number words that a speaker joins with "and" ("one hundred and five"); the "and" between them is dropped. */
const NUMBER_WORD = new Set([...ONES, ...TENS.filter(Boolean), "hundred", "thousand", "million", "billion"]);

/**
 * The words of a text as it is spoken: lower case, numbers in words, signs as words, contractions expanded, and no
 * punctuation. Two texts with the same key say the same words.
 */
export function speechKey(text: string): string {
  let t = text.toLowerCase().replace(/[’‘`]/g, "'");
  // A remainder ("26 R 1") and the signs, as a voice says them.
  t = t.replace(/(\d)\s*r\s*(\d)/g, "$1 remainder $2");
  t = t.replace(/(\d)\s*[-−–]\s*(\d)/g, "$1 minus $2");
  t = t.replace(/\+/g, " plus ").replace(/[×*]/g, " times ").replace(/÷/g, " divided by ").replace(/=/g, " equals ");
  t = t.replace(/(\d),(\d{3})\b/g, "$1$2");
  t = t.replace(/\d+(?:\.\d+)?/g, (d) => ` ${numberWords(d)} `);
  for (const [from, to] of CONTRACTIONS) t = t.replace(from, to);
  const words = t.replace(/[^a-z0-9'\s]/g, " ").replace(/'/g, "").split(/\s+/).filter(Boolean);
  return words.filter((w, i) => !(w === "and" && NUMBER_WORD.has(words[i - 1] ?? "") && NUMBER_WORD.has(words[i + 1] ?? ""))).join(" ");
}

/**
 * What Maya said is the approved text of her turn, after both are normalised the same way, or its start cut off at a
 * sentence break (the child spoke over her). A cut inside a sentence or a word is not: "sixteen" cut short is "six".
 */
export function saidAsApproved(said: string, approved: string): boolean {
  const key = speechKey(said);
  const sentences = approved.split(/(?<=[.?!])\s+/).filter(Boolean);
  for (let n = 0; n <= sentences.length; n++) if (key === speechKey(sentences.slice(0, n).join(" "))) return true;
  return false;
}
