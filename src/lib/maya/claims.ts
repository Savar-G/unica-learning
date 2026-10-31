// The strict no-math rule for Maya's warm talk (#372, D-195). Every sentence Maya says or writes that holds math comes
// from a code-written line (lines.ts), filled from the checked worked step. The model may add warm talk around the
// lines, and this rule checks that talk: it holds no digit or other number character, no operation or comparison sign,
// no number word, and no word about the math or the work (operation, place, carry, write, answer and judgement words).
// Anything on the list is refused and the model tries again, so the check never needs to read what a sentence means.
// It replaces the free-text claim parser of #321, whose eleven review rounds showed that reading free text for math
// errors is never airtight. Pure TypeScript; it never throws.

/** Number characters (any script, fractions such as ½, Roman numeral signs) and the signs of operations and amounts. */
const NUMBER_CHAR = /\p{N}/u;
const SIGNS = new Set([..."+−–\u2014×*÷/=<>%$¢€£^√∑·~#&@\\|"]);

/**
 * Words warm talk may not hold, each with its forms. Maya's math and every instruction about the work comes from a
 * line, so talk needs none of them. Ordinals and counts ("first", "once", "second") are on the list too: a line says
 * the order of the work.
 */
const WORDS: ReadonlySet<string> = new Set([
  // Numbers, ordinals, counts and amounts
  "zero", "nil", "nought", "naught", "dozen", "dozens", "half", "halves", "halve", "halved", "halving", "quarter",
  "quarters", "first", "second", "seconds", "third", "thirds", "fifth", "eighth", "ninth", "twelfth", "twentieth",
  "thirtieth", "fortieth", "fiftieth", "sixtieth", "seventieth", "eightieth", "ninetieth", "once", "twice", "thrice",
  "double", "doubles", "doubled", "doubling", "triple", "tripled", "fourty", "ninty", "x", "ii", "iii", "iv", "vi", "vii",
  "viii", "ix", "xi", "xii", "xx",
  // Money
  "money", "dollar", "dollars", "buck", "bucks", "cent", "cents", "penny", "pennies", "nickel", "nickels", "dime",
  "dimes", "loonie", "loonies", "toonie", "toonies", "coin", "coins", "bill", "bills", "price", "prices", "cost",
  "costs", "costing", "worth", "pay", "pays", "paid", "paying", "spend", "spends", "spent", "spending", "cad",
  // Operations, comparisons and results
  "add", "adds", "added", "adding", "addition", "plus", "sum", "sums", "total", "totals", "totaled", "totalled",
  "altogether", "subtract", "subtracts", "subtracted", "subtracting", "subtraction", "minus", "difference",
  "differences", "away", "takeaway", "less", "fewer", "more", "most", "least", "than", "left", "times", "multiply",
  "multiplies", "multiplied", "multiplying", "multiplication", "product", "products", "group", "groups", "grouped",
  "divide", "divides", "divided", "dividing", "division", "share", "shares", "shared", "sharing", "split", "splits",
  "splitting", "each", "equal", "equals", "equaled", "equalled", "equaling", "equalling", "equation", "equations",
  "increase", "increases", "increased", "decrease", "decreases", "decreased", "reduce", "reduces", "reduced", "remove",
  "removes", "removed", "removing", "gain", "gains", "gained", "lose", "loses", "lost", "losing", "square", "squared",
  "root", "power", "percent", "percentage", "round", "rounded", "rounding", "estimate", "count", "counts", "counted",
  "counting", "combine", "combines", "combined", "quotient", "dividend", "divisor", "remainder", "remainders", "factor",
  "factors", "multiple", "multiples", "fraction", "fractions", "numerator", "numerators", "denominator", "denominators",
  "decimal", "decimals", "bigger", "biggest", "greater", "greatest", "larger", "largest", "smaller", "smallest",
  // Places, columns and numbers as things
  "ones", "tens", "hundreds", "thousands", "tenths", "hundredths", "thousandths", "column", "columns", "row", "rows",
  "place", "places", "digit", "digits", "number", "numbers", "numeral", "numerals", "value", "values", "point", "points",
  "unit", "units",
  // Carrying, writing and the work on paper or the board
  "carry", "carries", "carried", "carrying", "borrow", "borrows", "borrowed", "borrowing", "regroup", "regroups",
  "regrouped", "regrouping", "trade", "trades", "traded", "trading", "exchange", "exchanges", "exchanged", "write",
  "writes", "wrote", "written", "writing", "rewrite", "put", "puts", "putting", "bring", "brings", "brought", "cross",
  "crossed",
  // Answers and judgements: a line checks the child's answer
  "answer", "answers", "answered", "result", "results", "solution", "solutions", "solve", "solves", "solved", "correct",
  "correctly", "incorrect", "wrong", "right", "mistake", "mistakes", "exactly",
]);

/**
 * Verbs of the math and the work, refused in every form (R374-2-1): "exchange", "exchanges", "exchanged",
 * "exchanging", "carries", "splitting" ...
 */
const VERBS = [
  "add", "subtract", "multiply", "divide", "share", "split", "carry", "borrow", "regroup", "trade", "exchange", "count",
  "remove", "combine", "increase", "decrease", "reduce", "halve", "double", "triple", "round", "estimate", "total",
  "equal", "write", "rewrite", "put", "bring", "cross", "solve", "answer", "group", "square", "times",
];
/** Every form of a verb: -s, -es, -ed, -d, -ing, -er, with a final e dropped, y as i, and a doubled last consonant. */
export function forms(verb: string): string[] {
  const out = [verb, `${verb}s`, `${verb}es`, `${verb}ed`, `${verb}d`, `${verb}ing`, `${verb}er`, `${verb}ers`];
  if (verb.endsWith("e")) out.push(`${verb.slice(0, -1)}ing`, `${verb.slice(0, -1)}er`);
  if (/[^aeiou]y$/.test(verb)) out.push(`${verb.slice(0, -1)}ies`, `${verb.slice(0, -1)}ied`, `${verb.slice(0, -1)}ier`);
  const last = verb[verb.length - 1];
  if (/[^aeiouwxy]/.test(last)) out.push(`${verb}${last}ing`, `${verb}${last}ed`, `${verb}${last}er`);
  return out;
}
/** The word list with every form of each verb. */
const ALL_WORDS: ReadonlySet<string> = new Set([...WORDS, ...VERBS.flatMap(forms), "wrote", "written", "brought"]);

/**
 * Word pairs on the list as a pair: "in all", "take away", "count on" and "count back" are operation words. A few
 * everyday pairs are fine talk although a word in them is on the list: "all right", "right now", "more time", "more help".
 */
const PAIRS: ReadonlySet<string> = new Set(["in all", "take away", "count on", "count back", "line up"]);
const ALLOWED_PAIRS: ReadonlySet<string> = new Set(["all right", "right now", "more time", "more help"]);

/** A word made only of number words, with an ordinal or plural ending: "seventeen", "twentyseven", "sixths". */
const NUMBER_WORD = new RegExp(
  "^(?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|" +
    "seventeen|eighteen|nineteen|twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|" +
    "billion)(?:and)?)+(?:th|ths|s)?$",
);

/** The words of a text, in lower case: runs of letters and apostrophes, with a possessive "'s" left off. */
const wordsOf = (text: string) =>
  (text.toLowerCase().match(/[\p{L}\p{M}'’]+/gu) ?? []).map((w) => w.replace(/['’]s$/, "").replace(/['’]/g, ""));

/**
 * The first thing in `text` warm talk may not hold, or null when the talk is math-free: a number character, a sign, a
 * number word or a word about the math or the work. A hyphen between two letters ("well-done") is no sign.
 */
export function talkMath(text: string): string | null {
  for (const [i, ch] of [...text].entries()) {
    if (NUMBER_CHAR.test(ch) || SIGNS.has(ch)) return ch;
    if (ch === "-") {
      const chars = [...text];
      if (!(/\p{L}/u.test(chars[i - 1] ?? "") && /\p{L}/u.test(chars[i + 1] ?? ""))) return ch;
    }
  }
  const words = wordsOf(text);
  for (const [i, w] of words.entries()) {
    const pair = `${w} ${words[i + 1] ?? ""}`;
    const before = `${words[i - 1] ?? ""} ${w}`;
    if (ALLOWED_PAIRS.has(pair) || ALLOWED_PAIRS.has(before)) continue;
    if (PAIRS.has(pair)) return pair;
    if (ALL_WORDS.has(w) || NUMBER_WORD.test(w)) return w;
  }
  return null;
}
