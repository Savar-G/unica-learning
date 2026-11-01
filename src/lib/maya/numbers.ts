// The numbers in a spoken or written turn (#321): what the child said, as speech-to-text writes it ("66", "sixty-six",
// "two hundred and five", "0.85", ".85", "point eight five", "-66", "minus 66", "3/4", "26 R 1", "26 remainder 1").
// A number form code cannot read ("three quarters", "a half", "66 squared") is flagged, so the session confirms it
// instead of guessing. Maya's own claims are checked in claims.ts. Pure TypeScript.
import type { AnswerValue } from "@/lib/question-package";

// Maps, not objects: a word such as "constructor" must never reach an inherited property.
const WORD_VALUES = new Map<string, number>([
  ["zero", 0], ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9],
  ["ten", 10], ["eleven", 11], ["twelve", 12], ["thirteen", 13], ["fourteen", 14], ["fifteen", 15], ["sixteen", 16], ["seventeen", 17], ["eighteen", 18], ["nineteen", 19],
  ["twenty", 20], ["thirty", 30], ["forty", 40], ["fifty", 50], ["sixty", 60], ["seventy", 70], ["eighty", 80], ["ninety", 90],
]);
/**
 * Fraction words, scale words, and words and signs that change a number's value ("three quarters", "half of 66",
 * "66 million", "66 squared", "66%", "the square root of 66", "to the power"), next to a number or joined to one by
 * LINK words: a form code does not read yet, so the turn is confirmed and no number in it is scored. Away from a number
 * they are ordinary words ("I double checked, 66").
 */
const CHANGES = /^(?:halfs?|halves|thirds?|quarters?|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?|hundredths?|thousandths?|millions?|billions?|trillions?|zillions?|gazillions?|lakhs?|crores?|dozens?|squared?|cubed?|roots?|sqrt|factorial|percent|power|twice|double|triple|decimal|dot|%|\^|[\u00B2\u00B3\u00B9\u2070-\u2079])$/;
/** Words that join a value-changing word to its number ("half of 66", "66 and a half", "square root of 66"). */
const LINK = /^(?:of|a|an|the|and)$/;
/** Place words right after a number ("66 tens"): they change its value, a form code does not read yet. */
const PLACE = /^(?:ones|tens|hundreds|thousands)$/;
/**
 * Operations between two numbers ("27 minus 66", "27 + 66", "27 take away 66"): the second number is part of the
 * operation, not an answer. "minus" and "-" are read with the signs below.
 */
const OPERATION = /^(?:plus|times|add|added|adding|subtract|subtracted|take|multiplied|divided|less|\+|×|\*|÷|x)$/;
/** Words a child says while thinking ("minus, uh, 66"): they keep a sign. */
const FILLER = /^(?:uh|um|umm|er|erm|hmm|like)$/;
/** Words that give a result ("is", "=", "got"): the number after one is no longer inside an operation. */
const RESULT = /^(?:is|are|was|equals?|makes?|gives?|gets?|got|=)$/;

/** The kind of a number word: it says which words can follow it in one number. */
export type NumberWord = "unit" | "teen" | "ten" | "hundred" | "thousand";

const KINDS = new Map<string, NumberWord>([
  ...[...WORD_VALUES].map(([w, n]): [string, NumberWord] => [w, n < 10 ? "unit" : n < 20 ? "teen" : "ten"]),
  ["hundred", "hundred"],
  ["thousand", "thousand"],
]);
/** The kind of a number word ("sixty" is a ten), or null for any other word. */
export const kindOf = (word: string): NumberWord | null => KINDS.get(word) ?? null;
/** The value of a unit, teen or ten word ("sixty" is 60), or null for any other word. */
export const wordValue = (word: string): number | null => WORD_VALUES.get(word) ?? null;
/** A number word of this kind cannot continue a number whose last word was `last` ("six sixty" is 6 and 60). */
export const startsNewNumber = (last: NumberWord | null, kind: NumberWord) =>
  kind === "unit" ? last === "unit" || last === "teen" : (kind === "teen" || kind === "ten") && (last === "unit" || last === "teen" || last === "ten");

/**
 * A token: a written number ("1,234", "0.85", ".85"), a word, a fraction bar, a minus sign, an operation or equals sign,
 * a sign that changes a value, or the end of a sentence or a turn (".", "!", "?", ";", a new line).
 */
const TOKEN = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+|\/|-|[a-z]+|[+×*÷=%^\u00B2\u00B3\u00B9\u2070-\u2079]|[.!?;\n]/g;
const BOUNDARY = /^[.!?;\n]$/;
/** An ordinal ending on a written number ("66th"): the number is not an answer as said. */
const ORDINAL = /\d(?:st|nd|rd|th)\b/i;

/** Every minus sign as "-": the true minus and the dashes speech-to-text may write. */
const plainMinus = (text: string) => text.replace(/[\u2212\u2012\u2013\u2014\uFE63\uFF0D]/g, "-");

export interface NumbersRead {
  values: AnswerValue[];
  /** The text has a number form code does not read ("three quarters", "66 squared"): confirm it, do not guess. */
  unreadable: boolean;
  /** The last number is the second number of an operation ("27 minus 66"), so it is not an answer the child kept. */
  lastInOperation: boolean;
}

/**
 * The numbers, fractions and remainder answers in a text, in order. Number words join into one number ("sixty six" is
 * 66); a new number starts where the words cannot continue one ("sixty... no, sixty-six" is 60 and 66). A minus sign or
 * "negative" before a number makes it negative; "minus" or "-" after a number in the same sentence is a subtraction.
 * A sentence end or a new line (between two turns) ends a number, so "27. -66." is 27 and -66.
 */
export function readNumbers(text: string): NumbersRead {
  // A hyphen between words joins a number ("sixty-six"); elsewhere it is a minus sign.
  const tokens = plainMinus(text).toLowerCase().replace(/([a-z])-(?=[a-z])/g, "$1 ").match(TOKEN) ?? [];
  // First the numbers, with a fraction bar or a remainder mark where one was said; then each "number bar number" becomes
  // a fraction and each "number R number" a remainder answer.
  const items: (number | "bar" | "rem")[] = [];
  /** For each number in items: it is the second number of an operation. */
  const operands = new Map<number, boolean>();
  let inOperation = false;
  let total = 0;
  let current = 0;
  let last: NumberWord | null = null;
  let decimals = "";
  let negative = false;
  let afterNumber = false;
  const isNumber = (t = "") => /^\d/.test(t) || kindOf(t) !== null;
  // A value-changing word reaches a number across link words and other value-changing words, in either direction.
  const linked = (i: number) => [-1, 1].some((d) => {
    let k = i + d;
    while (LINK.test(tokens[k] ?? "") || CHANGES.test(tokens[k] ?? "")) k += d;
    return isNumber(tokens[k]);
  });
  let unreadable = ORDINAL.test(text);
  const push = (n: number) => {
    operands.set(items.length, inOperation);
    items.push(negative ? -n : n);
    negative = false;
    inOperation = false;
    afterNumber = true;
  };
  const flush = () => {
    if (last === null && decimals === "") return;
    const whole = total + current;
    push(decimals ? Number(`${whole}.${decimals}`) : whole);
    total = current = 0;
    last = null;
    decimals = "";
  };
  const mark = (m: "bar" | "rem") => {
    flush();
    items.push(m);
    afterNumber = false;
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (BOUNDARY.test(token)) {
      flush();
      afterNumber = negative = inOperation = false;
      continue;
    }
    const next = tokens[i + 1] ?? "";
    const numberNext = isNumber(next);
    if (CHANGES.test(token)) {
      if (linked(i)) unreadable = true;
      continue;
    }
    if ((token === "to" && next === "the" && (afterNumber || last !== null)) || (PLACE.test(token) && (afterNumber || last !== null))) {
      unreadable = true;
      continue;
    }
    if (FILLER.test(token)) continue;
    if (RESULT.test(token)) {
      flush();
      afterNumber = negative = inOperation = false;
      continue;
    }
    if (OPERATION.test(token) && (afterNumber || last !== null)) {
      flush();
      afterNumber = false;
      inOperation = true;
      continue;
    }
    if (/^[\d.]/.test(token)) {
      flush();
      push(Number(token.replace(/,/g, "")));
      continue;
    }
    if (token === "-" || token === "minus" || token === "dash" || token === "negative") {
      flush();
      negative = token === "negative" || !afterNumber;
      if (!negative) inOperation = true;
      afterNumber = false;
      continue;
    }
    if (token === "/" || token === "over") {
      mark("bar");
      continue;
    }
    if ((token === "r" || token === "remainder") && (afterNumber || last !== null)) {
      mark("rem");
      continue;
    }
    if (token === "point" && kindOf(next) === "unit") {
      // "point eight five": the digits after the point, one word each. A number word or a digit after them
      // ("point six sixty") is a form code does not read.
      last ??= "unit";
      while (kindOf(tokens[i + 1] ?? "") === "unit") decimals += String(wordValue(tokens[++i])!);
      if (/^\d/.test(tokens[i + 1] ?? "") || kindOf(tokens[i + 1] ?? "") !== null) unreadable = true;
      flush();
      continue;
    }
    // Any other "point" next to a number ("point sixty-six", "one point sixty-six", "66 point 0").
    if (token === "point" && (numberNext || afterNumber || last !== null)) {
      unreadable = true;
      continue;
    }
    // "two hundred and five" is one number; "27 and 66" is two numbers, and 66 is no answer on its own.
    if (token === "and" && (last === "hundred" || last === "thousand") && kindOf(tokens[i + 1] ?? "") !== null) continue;
    if (token === "and" && (afterNumber || last !== null)) {
      flush();
      afterNumber = false;
      inOperation = true;
      continue;
    }
    const kind = kindOf(token);
    if (kind === null) {
      // Another word ends a number; a sign said before it still holds ("negative, I think, 66").
      flush();
      afterNumber = false;
      continue;
    }
    if (startsNewNumber(last, kind)) flush();
    switch (kind) {
      case "unit":
      case "teen":
      case "ten":
        current += wordValue(token)!;
        break;
      case "hundred":
        current = (last === null ? 1 : current) * 100;
        break;
      case "thousand":
        total += (last === null ? 1 : current) * 1000;
        current = 0;
        break;
    }
    last = kind;
  }
  flush();

  const values: AnswerValue[] = [];
  let lastInOperation = false;
  const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item !== "number") continue;
    const [between, after] = [items[i + 1], items[i + 2]];
    lastInOperation = operands.get(i) ?? false;
    if (between === "bar" && whole(item) && whole(after) && after > 0) {
      values.push({ type: "fraction", numerator: item, denominator: after });
      i += 2;
    } else if (between === "rem" && whole(item) && whole(after) && item >= 0 && after >= 0) {
      values.push({ type: "remainder", quotient: item, remainder: after });
      i += 2;
    } else {
      values.push({ type: "number", value: item });
    }
  }
  return { values, unreadable, lastInOperation };
}

/** The numbers, fractions and remainder answers in a text, in order (readNumbers). */
export const valuesIn = (text: string): AnswerValue[] => readNumbers(text).values;

/** Words a child uses to take back what they just said: "sixty-six... no, sixty", "66... no, I don't know". */
const CORRECTION = /\b(?:no|wait|i mean|actually|oops)\b/gi;
/** Words that may sit between a correction word and the number it puts in place ("no wait, 65", "no, I mean 65"). */
const TAKE_BACK_FILLER = /^(?:[\s,.!?…:;-]|\b(?:no|wait|i mean|actually|oops|um+|uh+|it's|its|it is|it was|i got|i get|i think|i think it's|the answer is|it should be|that's|thats|that is)\b)*/i;

/** Words a spoken number may start with before its digits or number words ("point sixty-six", "minus 3"). */
const NUMBER_LEAD = /^(?:point|minus|negative|a|an|one|half)$/i;

/** One run of correction words ("no wait", "no, I mean"), and whether it is a clean correction or only unclear. */
interface CorrectionRun { index: number; end: number; clean: boolean; numberNext?: boolean }

/**
 * Every run of correction words in a turn (R391-1-1, R391-2). A run is clean only in one of two shapes: it starts a
 * clause (the start of the turn or a punctuation mark before it) and a number is the next word after it ("65, no, 66",
 * "No wait, 65", "It's 66, actually 65"); or it starts a clause and stands alone, so it withdraws what came before with
 * nothing in its place ("66... no, I don't know"). Any other correction word ("66 no that is wrong", "there are actually
 * 66 blocks", "I have no idea") is unclear: the turn then holds no final answer, so Maya asks rather than guess.
 */
function correctionRuns(text: string): CorrectionRun[] {
  const runs: CorrectionRun[] = [];
  for (const m of text.matchAll(CORRECTION)) {
    const index = m.index ?? 0;
    const end = index + m[0].length;
    const last = runs[runs.length - 1];
    // A correction word right after another (only punctuation between) continues its run: "no wait", "no, I mean".
    if (last && /^[\s,.!?…:;-]*$/.test(text.slice(last.end, index))) {
      last.end = end;
      continue;
    }
    runs.push({ index, end, clean: false });
  }
  for (const r of runs) {
    const after = text.slice(r.end);
    const words = after.slice((TAKE_BACK_FILLER.exec(after)?.[0] ?? "").length).split(/\s+/);
    // The next word is a number, or starts a spoken number form ("point sixty-six", "minus 3", "a half").
    const lead = NUMBER_LEAD.test(words[0] ?? "") ? words.slice(0, 3).join(" ") : words[0] ?? "";
    const read = readNumbers(lead);
    const numberFollows = read.values.length > 0 || read.unreadable;
    // The start of the turn or a punctuation mark before it, maybe with an interjection ("Oh wait, 28", "Hmm, no, 66").
    const clauseStart = /(?:^|[,.!?…;:-])\s*(?:(?:oh|ah|oops|um+|uh+|hmm+|okay|ok)[\s,.!?…]*)?$/i.test(text.slice(0, r.index));
    const alone = /^\s*(?:[,.!?…;:-]|$)/.test(after);
    // A bare "no" straight before a number ("No 66") may answer "no" to Maya and then give 66, or take something back:
    // unclear (R391-4-2). "No, 66" and "no wait, 66" are clean.
    const bareNo = /^no$/i.test(text.slice(r.index, r.end).trim()) && !/^\s*[,.!?…;:-]/.test(after);
    r.clean = clauseStart && (alone || (numberFollows && !bareNo));
    r.numberNext = numberFollows;
  }
  return runs;
}

/** Where the child takes something back: every correction run, clean or unclear (correctionRuns). */
const takeBacks = (text: string) => correctionRuns(text);

/**
 * A negative anywhere in the turn ("It is not 66", "66 isn't right", "that's wrong", "I don't think it's 66"): a number
 * near it may be rejected rather than given, so the turn holds no answer and Maya asks (R391-3). No reading of what the
 * negative applies to is tried, because none is reliable in children's speech.
 */
const NEGATIVE = /\b(?:not|never|wrong|nope|nah|false|untrue|doubt|doubts|withdraw|withdrawn|retract|incorrect|mistake|mistaken|reject|rejected|ruled|scratch|forget|ignore|undo|cancel|dont|doesnt|didnt|isnt|wasnt|arent|werent|cant|wont|couldnt|shouldnt|aint)\b|\w+n['’]t\b|\btake (?:that|it) back\b/i;
/**
 * Words of doubt, and a question mark (R391-5): "maybe 66", "is it 66?", "66 or something", "66, I am unsure". The
 * number may still be judged wrong, but it is never accepted as right: Maya confirms it first.
 */
const DOUBT = /\b(?:maybe|perhaps|probably|possibly|guess|guessing|unsure|sure|or something|or so|ish|dunno|idk|kinda|sorta)\b|\?/i;

/** The first line to read from: the line before `first` when it runs on into it (no sentence end: "Maybe" then "66"). */
const runsOn = (lines: string[], first: number) => (first > 0 && !/[.!?]\s*$/.test(lines[first - 1]) ? first - 1 : first);

/**
 * A negative in the child's first turn that holds a number, the turn just before it ("I reject this answer:" then
 * "66", R391-6-2), or any turn after it (a line is one child turn: "I don't
 * know." then "Sixteen for the ones." keeps 16, but "It is not 66.", or "66" then "That is wrong", keeps nothing:
 * R391-3, R391-4-1).
 */
const negativeNearAnswer = (text: string) => {
  const lines = text.split("\n");
  const first = lines.findIndex((line) => { const r = readNumbers(line); return r.values.length > 0 || r.unreadable; });
  return first >= 0 && lines.slice(runsOn(lines, first)).some((line) => NEGATIVE.test(line));
};

/** A word of doubt or a question mark in the child's first turn with a number or any turn after it (DOUBT). */
const doubtNearAnswer = (text: string) => {
  const lines = text.split("\n");
  const first = lines.findIndex((line) => { const r = readNumbers(line); return r.values.length > 0 || r.unreadable; });
  return first >= 0 && lines.slice(runsOn(lines, first)).some((line) => DOUBT.test(line));
};

/**
 * The turn has a correction word in an unclear shape after a number it could take back: it holds no final answer
 * (correctionRuns). An unclear word before any number ("I am software with no body. I got 66.") takes nothing back.
 */
const unclearCorrection = (text: string) => correctionRuns(text).some((r) => {
  if (r.clean) return false;
  if (r.numberNext) return true;
  const before = readNumbers(text.slice(0, r.index));
  return before.values.length > 0 || before.unreadable;
});

/** The text split at every word that takes something back (takeBacks). */
function splitTakeBacks(text: string): string[] {
  const parts: string[] = [];
  let from = 0;
  for (const t of takeBacks(text)) {
    parts.push(text.slice(from, t.index));
    from = t.end;
  }
  parts.push(text.slice(from));
  return parts;
}

/**
 * The child's committed words: what follows the last word that takes something back ("sixty... no, sixty-six" commits
 * to "sixty-six"; "66... no, I don't know" commits to no number). The whole text when nothing was taken back.
 */
export function committedText(text: string): string {
  const parts = splitTakeBacks(text);
  return parts[parts.length - 1];
}

/**
 * Words that start the child's explanation of an answer (D-199): "because", "since", "cause" (also "'cause"), "cuz" and
 * "coz". "So I got 66, because six tens and six ones": the numbers after "because" explain 66, they are not the answer.
 */
const EXPLANATION = /\b(?:because|since|cause|cuz|coz)\b/i;

/**
 * The text with the child's explanations left out (D-199). An explanation runs from an explanation word to the end of
 * its turn (a new line), or to a word that takes something back, whichever comes first: "66 because six tens, no wait,
 * 65" keeps "66 no wait, 65", so the correction still wins. A sentence end does not end it, because speech-to-text puts
 * full stops anywhere ("66 because 7 + 9 is 16. And 2 + 3 + 1 is 6.").
 */
export function withoutExplanations(text: string): string {
  return text.split("\n").map((line) => {
    let out = "";
    let rest = line;
    for (let m = EXPLANATION.exec(rest); m; m = EXPLANATION.exec(rest)) {
      out += rest.slice(0, m.index);
      rest = rest.slice(m.index + m[0].length);
      const correction = takeBacks(rest)[0];
      if (!correction) return out;
      rest = rest.slice(correction.index);
    }
    return out + rest;
  }).join("\n");
}

export interface AnswerRead {
  /**
   * The numbers the child kept, in order, after the last word that takes something back: a step answer is one of them.
   * When an explanation holds a number form code cannot read ("six tens"), only the numbers outside the explanations.
   */
  kept: AnswerValue[];
  /**
   * The child's final answer: the last number kept outside any explanation, or null when there is none, it is the second
   * number of an operation ("27 plus 39"), the part outside the explanations has a form code cannot read, or the turn
   * offers numbers as a choice.
   */
  final: AnswerValue | null;
  /** The turn offers numbers as a choice ("is it 66 or 56?"): none of them is the child's answer yet. */
  choice: boolean;
  /**
   * The child committed (R391-5): no doubt ("maybe", "?", "or something") and the final answer stands among plain answer
   * words (committedFinal). A number the child was not sure of may be judged wrong, never accepted as right.
   */
  sure: boolean;
}

/**
 * The plain words a committed answer may stand among (R391-5): "I got 66", "It's 66", "So, all together, 66", "66
 * centimetres", "The answer is sixty-six". A final answer is sure only when its own clause holds nothing else, so any
 * other word beside it ("maybe 66", "66 or something", "I reject 66") makes Maya confirm it before it is accepted. An allow-list, because no list of doubting or rejecting words is ever complete.
 */
const ANSWER_WORDS = new Set([
  "i", "i'm", "im", "got", "get", "gets", "it", "it's", "its", "is", "was", "the", "answer", "my", "so", "then", "and",
  "that's", "thats", "that", "makes", "make", "equals", "equal", "to", "gives", "oh", "ok", "okay", "well", "yes", "yeah",
  "yep", "now", "think", "all", "together", "total", "in", "for", "final", "sum", "have", "has",
  "are", "there", "here", "wrote", "write", "down", "done", "a", "an", "of", "on", "one", "mean", "meant", "groups", "group",
  "rows", "row", "lots", "sets", "set", "each", "left", "over", "remainder", "r", "whole", "number", "altogether", "but",
  "said", "just", "really", "actually", "wait", "no", "point", "zero",
]);
/** Words of ordinary math talk after an answer ("I carried the ten", "I added the ones first", "I counted on my fingers"). */
const MATH_WORDS = new Set([
  "added", "carried", "carry", "counted", "count", "took", "borrowed", "regrouped", "regroup", "used", "did", "worked",
  "out", "first", "next", "last", "lined", "up", "put", "made", "split", "broke", "apart", "doubled", "halved", "subtracted",
  "multiplied", "divided", "shared", "grouped", "drew", "dots", "blocks", "fingers", "line", "head", "with", "from", "by",
  "me", "them", "they", "these", "those", "this", "column", "columns", "top", "bottom", "under", "above", "extra", "more",
  "less", "other", "both", "times", "again", "too", "also", "checked", "check", "know", "knew", "remember", "remembered",
  "away", "fine", "alright",
]);
const UNIT_WORD = /^(?:mm|cm|dm|m|km|g|kg|mg|ml|l|(?:milli|centi|deci|kilo)?(?:metre|meter|gram|litre|liter)s?|metres?|meters?|grams?|litres?|liters?|dollars?|cents?|seconds?|minutes?|hours?|days?|weeks?|months?|years?|o'clock|am|pm|a\.m\.|p\.m\.|degrees?|percent|\$|¢|%)$/i;

/** Every word of a clause is a plain answer word, a number word, a place, an operation, a filler or a unit. */
function plainClause(clause: string): boolean {
  const words = clause.toLowerCase().replace(/[’]/g, "'").replace(/[^\w'$¢%.+×÷=\/-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.every((w) => {
    const bare = w.replace(/^[.'-]+|[.'-]+$/g, "");
    if (!bare) return true;
    if (ANSWER_WORDS.has(bare) || MATH_WORDS.has(bare) || UNIT_WORD.test(bare) || PLACE.test(bare) || OPERATION.test(bare) || RESULT.test(bare) || FILLER.test(bare) || LINK.test(bare) || CHANGES.test(bare)) return true;
    const read = readNumbers(bare);
    return read.values.length > 0 || read.unreadable;
  });
}

/**
 * Every clause of the final number's sentence (with a line before that runs on into it) and of every sentence after it
 * is plain (plainClause: answer words, math talk, numbers, units): the child committed to it (R391-6). Any other word anywhere there ("66, I doubt it", "Maybe" then
 * "66", "I would say 66", "Suppose: 66") means Maya confirms the answer before she accepts it.
 */
function committedFinal(text: string): boolean {
  const lines = text.split("\n");
  const at = lines.map((l) => { const r = readNumbers(l); return r.values.length > 0 || r.unreadable; }).lastIndexOf(true);
  if (at < 0) return false;
  // The line before counts when it runs on into the answer ("Maybe" then "66", "I reject this answer:" then "66"); one
  // that ends a sentence ("I don't know." then "66") does not.
  const before = at > 0 && !/[.!?]\s*$/.test(lines[at - 1]) ? `${lines[at - 1]}: ` : "";
  const sentences = `${before}${lines[at]}`.split(/[.!?]+/);
  const last = sentences.map((x) => { const r = readNumbers(x); return r.values.length > 0 || r.unreadable; }).lastIndexOf(true);
  // The final number's sentence, with whatever introduces it in that sentence ("Suppose: 66", "I would say 66"), and
  // every sentence after it.
  return last >= 0 && sentences.slice(last).every((x) => x.split(/[,;:]+/).every(plainClause));
}

/**
 * What the child kept in a turn, and their final answer (D-199). The rule never needs the answer key. First the last word
 * that takes something back wins (committedText: "65, no, 66" is 66), then every explanation is left out
 * (withoutExplanations), and the final answer is the last number left: "So I got 66, because six tens and six ones" is
 * 66, "I think it's sixty-six because seven and nine make sixteen" is 66. A number in an explanation is never the final
 * answer: "Because seven and nine make sixteen" has none, and "Because 7 + 9 is 16, it's 66" has none either (the
 * explanation runs to the end of the turn), so Maya asks again rather than guess.
 */
export function readAnswer(text: string): AnswerRead {
  const committed = committedText(text);
  if (offersChoice(committed)) return { kept: [], final: null, choice: true, sure: false };
  const all = readNumbers(committed);
  const answer = readNumbers(withoutExplanations(committed));
  // A correction word in an unclear shape after a number, or a negative anywhere, leaves no final answer: Maya asks
  // (R391-2, R391-3).
  const unsure = unclearCorrection(text) || negativeNearAnswer(text);
  const final = unsure || answer.unreadable || answer.lastInOperation ? null : answer.values[answer.values.length - 1] ?? null;
  // An unclear correction keeps no number at all, so no step answer is taken from the turn either (R391-2).
  const kept = unsure ? [] : all.unreadable ? answer.values : all.values;
  // Sure: no doubt anywhere from the first number on, and the final answer stands only among plain answer words.
  const sure = !unsure && !doubtNearAnswer(text) && committedFinal(withoutExplanations(committed));
  return { kept, final, choice: false, sure };
}

/** The text has a number form code cannot read outside the child's explanations: confirm it before judging (D-199). */
export const unreadableAnswer = (text: string) => readNumbers(withoutExplanations(text)).unreadable;

/**
 * What a turn takes back to, or null when it takes nothing back. A correction word takes back a number said before it
 * ("66, no, 56"), and it puts a new answer in place when a number, or a form code cannot read, comes after it
 * ("actually 56", "actually point sixty-six"). "No, I just knew it" takes nothing back. `kept` is the final answer kept
 * (readAnswer: "actually 66 because six tens" keeps 66), or null when no number is kept or code cannot read it.
 */
export function takenBack(text: string): { kept: AnswerValue | null } | null {
  const parts = splitTakeBacks(text);
  if (parts.length === 1) return null;
  const last = parts[parts.length - 1];
  const after = readNumbers(last);
  const before = parts.slice(0, -1).some((p) => {
    const read = readNumbers(p);
    return read.values.length > 0 || read.unreadable;
  });
  if (!before && after.values.length === 0 && !after.unreadable) return null;
  // An unclear correction anywhere puts nothing in place: what was said is taken back, and Maya asks (R391-2).
  const read = readAnswer(last);
  return { kept: unclearCorrection(text) || negativeNearAnswer(text) || !read.sure ? null : read.final };
}

/** The text offers numbers as a choice ("is it 66 or 56?"): none of them is the child's answer yet. */
export const offersChoice = (text: string) => text.split(/\bor\b/i).filter((p) => valuesIn(p).length > 0).length > 1;
