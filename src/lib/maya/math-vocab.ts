// The closed vocabulary of math-only sentences (D-341, round 4): a sentence Maya says with no review must use only
// these words, the question's own words and the child's name token. Any other word sends the sentence to the review.
// The vocabulary is only the first check. Personal statements, general acknowledgements and unclassified characters
// also need a review. A word list alone cannot establish the meaning of a sentence.
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

/** More plain words of a tutor's talk, from the real runs of round 4 (sentences that were reviewed for no reason). */
const TUTOR_WORDS = [
  "since", "through", "fix", "fixes", "fixed", "today", "tricky", "hard", "easy", "harder", "yet", "goodbye", "bye",
  "paper", "solve", "solved", "solves", "steady", "nicely", "quick", "quickly", "nearly", "simple", "land", "lands",
  "everything", "something", "each", "kept", "going", "hear", "heard", "worked", "matters", "matter", "careful",
  "track", "tracking", "line", "lines", "together", "turn", "great", "job", "minute", "moment", "already", "still",
  "even", "well", "said", "talked", "ask", "asked", "answer", "check", "sure", "fine", "too", "okay",
];

/** Every word a math-only sentence may hold, in lower case. */
export const MATH_VOCAB: ReadonlySet<string> = new Set([...NUMBER_WORDS, ...MATH_WORDS, ...VERBS, ...SMALL_WORDS, ...TUTOR_WORDS]);

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

/** A complete question about the child's next math action, with no unmatched clause. */
const TASK_NUMBER = `(?:\\d+(?:\\.\\d+)?|${NUMBER_WORDS.join("|")})`;
const TASK_OBJECT = `(?:the )?(?:ones|tens|hundreds|thousands|column|step|numbers?|fraction|${TASK_NUMBER}(?: (?:and|plus|minus|times|divided by) (?:the )?${TASK_NUMBER}){0,3})`;
const TASK_QUESTION = new RegExp(`^what (?:do|did|can|could|would|will) you (?:do|try|write|see|notice|find|add|subtract|count)(?: (?:next|now))? (?:in|with|for|on) ${TASK_OBJECT}\\?$`, "i");
/** Words of a question about the math itself. Personal observations and evaluations are not math questions. */
const QUESTION_WORDS = new Set([
  ...NUMBER_WORDS, ...MATH_WORDS.filter((w) => w !== "nothing"),
  "what", "which", "how", "many", "much", "is", "are", "it", "this", "that", "the", "a", "an", "and", "or",
  "to", "in", "on", "of", "from", "with", "for", "as", "than", "will", "be", "next", "now", "here", "there",
  "can", "could", "do", "does",
]);
/** Words that establish a concrete math action or fact, without an evaluation of the child or the task. */
const DIRECT_MATH_WORDS = new Set([
  ...QUESTION_WORDS, "yes", "so", "since", "because", "then", "still", "again", "just", "only", "all", "not", "no",
  "let's", "look", "at", "check", "try", "write", "find", "see", "notice", "work", "out", "start", "begin", "trade", "we", "you", "together",
  "did", "would", "should", "right", "isn't", "aren't", "doesn't", "don't", "we're", "you're",
]);

/**
 * A math sentence that code can send without review: classified words in a concrete math statement, question or
 * positive instruction. General personal statements need review. The child's name is the token {name}.
 */
export function mathOnly(sentence: string, extra: ReadonlySet<string> = new Set()): boolean {
  const text = sentence.replace(/[’]/g, "'").trim();
  // A parser that reads ASCII words cannot establish the meaning of other letters or symbols.
  if (/[^a-z0-9\s.,?!:;()'"+*=<>%/\-×÷−]/i.test(text.replace(/\{name\}/g, " "))) return false;
  const words = wordsOf(text);
  if (!words.every((w) => MATH_VOCAB.has(w) || extra.has(w))) return false;
  if (/^(?:hi|hello|hey)(?:\s+(?:\{name\}|there))?[.!]*$/i.test(text)) return true;
  if (!words.every((word) => DIRECT_MATH_WORDS.has(word))) return false;
  const concrete = MATH_OBJECT.test(text) || words.some((w) => NUMBER_WORDS.includes(w));
  if (!concrete) return false;
  // A word list does not make a personal statement safe. Only a math question or positive math instruction
  // can address the child without review. Other personal statements always go to the independent review.
  const personal = /\b(?:you|your|you're|yourself|we|us|our|we're|i|me|my|i'm)\b/i;
  const question = /\?\s*$/.test(text);
  const instruction = /^(?:(?:let's|can you|could you|will you|would you|you can|you could|you should|we can|we could|we should)\s+)?(?:look at|check|try|add|subtract|multiply|divide|count|write|regroup|carry|trade|find|work out|start with|begin with|take)\b/i.exec(text);
  // This exact regroup action describes the math, rather than the people in the call.
  const personalText = text.replace(/\bwe (?:can )?(?:take|trade|regroup) (?:a|one|1) ten\b/gi, "a ten");
  if (personal.test(personalText)) {
    if (question && TASK_QUESTION.test(text.replace(/,?\s+\{name\}(?=\?$)/, ""))) return true;
    if (!instruction || personal.test(text.slice(instruction[0].length))) return false;
  }
  if (instruction) return !/\b(?:no|not|nothing|stop|never)\b/i.test(text);
  if (question) return words.every((word) => QUESTION_WORDS.has(word)) && /^(?:what|which|how|where|is|are|can|could|do|does)\b/i.test(text);
  // Plain number/place statements stream. General observations and acknowledgements need a review.
  const statement = text.replace(/^(?:yes[,!]?|so|since|because|now|then)\s+/i, "");
  return /^(?:[0-9]|zero\b|one\b|two\b|three\b|four\b|five\b|six\b|seven\b|eight\b|nine\b|ten\b|eleven\b|twelve\b|thirteen\b|fourteen\b|fifteen\b|sixteen\b|seventeen\b|eighteen\b|nineteen\b|twenty\b|thirty\b|forty\b|fifty\b|sixty\b|seventy\b|eighty\b|ninety\b|(?:the )?(?:ones|tens|hundreds|thousands|top|bottom|number|digit|fraction|numerator|denominator)\b)/i.test(statement);
}
