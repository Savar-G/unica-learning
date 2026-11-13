// The closed vocabulary of math-only sentences (D-341, round 4): a sentence Maya says with no review must use only
// these words, the question's own words and the child's name token. Any other word sends the sentence to the review.
// An allow-list, not a block-list: a new kind of unsafe sentence needs a new word, and a new word goes to the review.
// Exact safe sentences that are not math (EXACT_SAFE) also skip the review; nothing else does.

/** Words of numbers, written out. Digits are numbers already. */
const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
  "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty",
  "seventy", "eighty", "ninety", "hundred", "thousand", "half", "halves", "third", "thirds", "quarter", "quarters",
  "fourth", "fourths", "fifth", "fifths", "sixth", "sixths", "eighth", "eighths", "tenth", "tenths", "hundredth",
  "hundredths", "first", "second", "last", "once", "twice",
];

/** Operations, places and the parts of a question. */
const MATH_WORDS = [
  "plus", "minus", "times", "divided", "by", "add", "adds", "adding", "added", "addition", "subtract", "subtracts",
  "subtracting", "subtracted", "subtraction", "multiply", "multiplying", "multiplied", "multiplication", "divide",
  "dividing", "division", "take", "takes", "taking", "took", "taken", "away", "equals", "equal", "sum", "difference",
  "total", "product", "left", "ones", "tens", "hundreds", "thousands", "column", "columns", "place", "places", "digit",
  "digits", "number", "numbers", "top", "bottom", "below", "above", "under", "over", "row", "rows", "answer", "answers",
  "question", "problem", "step", "steps", "example", "easier", "part", "parts", "fraction", "fractions", "numerator",
  "denominator", "whole", "remainder", "regroup", "regroups", "regrouping", "regrouped", "carry", "carries", "carrying",
  "carried", "borrow", "borrowing", "borrowed", "trade", "trading", "traded", "bigger", "smaller", "larger", "greater",
  "less", "more", "fewer", "most", "least", "same", "enough", "count", "counting", "counted", "nothing", "math", "point",
  "decimal", "times", "lot", "group", "groups", "each", "both", "other", "another", "next", "zeros",
];

/** Plain tutoring verbs. */
const VERBS = [
  "look", "looks", "looking", "try", "tries", "trying", "tried", "make", "makes", "making", "made", "write", "writes",
  "writing", "wrote", "written", "think", "thinks", "thinking", "thought", "tell", "show", "shows", "showing", "showed",
  "find", "finds", "found", "work", "works", "working", "worked", "start", "starts", "started", "begin", "check",
  "checking", "checked", "see", "notice", "have", "has", "had", "having", "need", "needs", "needed", "do", "does",
  "doing", "did", "done", "put", "puts", "bring", "keep", "keeps", "use", "used", "using", "become", "becomes",
  "became", "give", "gives", "gave", "go", "goes", "going", "went", "come", "comes", "came", "get", "gets", "getting",
  "got", "know", "knew", "say", "said", "saying", "move", "moved", "stays", "stay", "change", "changes", "changed",
  "fit", "fits", "means", "mean", "let", "lets", "stop", "help", "ready",
];

/** Small words that hold sentences together. No third-person pronouns ("tell them"), and no "like" or "love". */
const SMALL_WORDS = [
  "the", "a", "an", "and", "or", "but", "so", "then", "now", "first", "next", "because", "if", "when", "after", "before",
  "still", "again", "too", "also", "just", "only", "all", "not", "no", "yes", "of", "to", "in", "on", "at", "for",
  "from", "with", "into", "out", "up", "down", "about", "as", "than", "it", "its", "this", "that", "these", "those",
  "there", "here", "what", "how", "which", "why", "where", "is", "are", "was", "were", "be", "been", "am", "will",
  "would", "should", "can", "could", "may", "might", "must", "you", "your", "we", "us", "our", "i", "me", "let's",
  "it's", "that's", "there's", "what's", "you're", "we're", "i'm", "isn't", "aren't", "can't", "don't", "doesn't",
  "didn't", "won't", "wasn't", "we'll", "you'll", "i'll", "let", "one", "ones", "way", "time", "together", "right",
  "wrong", "correct", "okay", "ok", "sure", "oh", "hmm", "well", "very", "really", "much", "many", "any", "some",
  "every", "until", "while", "go", "hi", "hello",
  "hey", "thanks", "thank", "good", "great", "nice", "careful", "carefully", "slowly", "clear", "clearly", "close",
  "almost", "idea", "job", "part", "start", "end", "on", "off", "own", "yourself", "itself", "other",
];

/** Every word a math-only sentence may hold, in lower case. */
export const MATH_VOCAB: ReadonlySet<string> = new Set([...NUMBER_WORDS, ...MATH_WORDS, ...VERBS, ...SMALL_WORDS]);

/**
 * The non-math sentences Maya may say with no review: exact sentences only (compared after case and a final "." or "!"
 * are set aside). Everything else that is not math-only is reviewed.
 */
export const EXACT_SAFE: readonly string[] = [
  "I'm an AI, so I don't have pets",
  "I'm an AI, so I don't have a pet",
  "I'm an AI, so I don't have a dog",
  "I'm an AI, so I have no pet",
  "I'm an AI, so I have no pets",
  "I'm an AI, so I don't eat",
  "I'm an AI, so I don't eat food",
  "I'm an AI, so I don't eat or have favourites",
  "I'm an AI, so I don't have a favourite food",
  "I'm not a real person",
  "I'm an AI helper",
  "I'm an AI math helper",
  "Thanks for telling me",
  "That sounds fun",
  "That sounds nice",
];

const key = (sentence: string) => sentence.trim().replace(/[’]/g, "'").replace(/[.!]+$/, "").toLowerCase();
const SAFE: ReadonlySet<string> = new Set(EXACT_SAFE.map(key));

/** An exact safe sentence (EXACT_SAFE). */
export const exactSafe = (sentence: string): boolean => SAFE.has(key(sentence));

/** The words of a sentence, in lower case, with numbers, signs and the name token left out. */
export function wordsOf(sentence: string): string[] {
  return (sentence.replace(/[’]/g, "'").replace(/\{name\}/g, " ").toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? []);
}

/** The words of a second-person question that make it about the math: a question about "you" must name one. */
const MATH_OBJECT = /\b(?:ones|tens|hundreds|thousands|column|digit|number|answer|step|sum|difference|plus|minus|times|divided|total|top|bottom|regroup\w*|carr\w+|fraction|example|question|problem)\b|\d/i;

/**
 * A math-only sentence (round 4): every word in MATH_VOCAB or the question's own words (`extra`), and a question to the
 * child ("you", "your") names the math it asks about. The child's name is the token {name}.
 */
export function mathOnly(sentence: string, extra: ReadonlySet<string> = new Set()): boolean {
  if (!wordsOf(sentence).every((w) => MATH_VOCAB.has(w) || extra.has(w))) return false;
  if (/\?\s*$/.test(sentence) && /\b(?:you|your|you're)\b/i.test(sentence) && !MATH_OBJECT.test(sentence)) return false;
  return true;
}
