// What else the child may have said, when a spoken number can be heard two ways (#1146). The speech-to-text gives one
// transcript; these rules add other readings so the session can check whether they change the result.

/** The teen and tens words that sound alike, and the same numbers in digits: "fourteen" and "forty", "14" and "40". */
const SOUND_ALIKE: Readonly<Record<string, string>> = Object.fromEntries(
  ["thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"].flatMap((teen, i) => {
    const tens = ["thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"][i];
    const n = i + 3;
    return [[teen, tens], [tens, teen], [`1${n}`, `${n}0`], [`${n}0`, `1${n}`]];
  }),
);
const ONES = "one|two|three|four|five|six|seven|eight|nine";
/** A sound-alike number on its own: not "forty-six", "forty six" or "40.5". */
const SOUND_ALIKE_WORD = new RegExp(
  `(?<![\\p{L}\\d.,])(${Object.keys(SOUND_ALIKE).join("|")})(?![\\p{L}\\d]|[.,]\\d|[\\s-]+(?:${ONES})\\b)`, "giu");
/** The teen each first part of a teen makes. */
const TEEN_OF: Readonly<Record<string, string>> = {
  three: "thirteen", thir: "thirteen", four: "fourteen", five: "fifteen", fif: "fifteen", six: "sixteen",
  seven: "seventeen", eight: "eighteen", eigh: "eighteen", nine: "nineteen",
};
/** A teen split by a pause: "four teen", "six-teen", "fif teen". */
const SPLIT_TEEN = new RegExp(`(?<![\\p{L}\\d])(${Object.keys(TEEN_OF).join("|")})[\\s-]+teens?(?![\\p{L}\\d])`, "giu");

/** `word` in the case of `like`: "Forty" for "Fourteen", "forty" for "fourteen". */
function caseOf(like: string, word: string): string {
  return /^\p{Lu}/u.test(like) ? word[0].toUpperCase() + word.slice(1) : word;
}

/**
 * The other readings of a turn's text: a teen split by a pause is heard as the teen and as its first word, and makes
 * the turn uncertain. Below the confidence bar, a sound-alike number is also heard as its partner.
 */
export function otherReadings(text: string, confidence: number, bar: number): { uncertain: boolean; alternatives: string[] } {
  const alternatives: string[] = [];
  let uncertain = false;
  for (const m of text.matchAll(SPLIT_TEEN)) {
    uncertain = true;
    const [whole, first] = m;
    const before = text.slice(0, m.index), after = text.slice(m.index + whole.length);
    alternatives.push(before + caseOf(first, TEEN_OF[first.toLowerCase()]) + after);
    // "four teen" may be "four" and a word lost: a part that is a number of its own is the other reading.
    if (new RegExp(`^(?:${ONES})$`, "i").test(first)) alternatives.push(before + first + after);
  }
  if (confidence < bar) {
    for (const m of text.matchAll(SOUND_ALIKE_WORD)) {
      const word = m[1];
      alternatives.push(text.slice(0, m.index) + caseOf(word, SOUND_ALIKE[word.toLowerCase()]) + text.slice(m.index + word.length));
    }
  }
  return { uncertain, alternatives };
}
