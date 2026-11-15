// The tutor core's reader of math claims in Maya's own words (D-345, review of #1002): every relation between numbers
// and place quantities in a sentence, in digits or words, chained or not. "1 ten is 10 ones", "52 is 4 tens and 12
// ones", "12 − 8 = 4" and "4 tens minus 2 tens is 2 tens" are read and computed; a false one is refused. An "=" the
// reader cannot read is refused too. Trades ("2 ones become 12") are read by tutor.ts.
//
// Pre-launch review B (2026-11-15): compound number words ("one hundred and two"), decimals, spoken fractions ("five
// sixths"), brackets, comparisons ("12 is 4 more than 8", "4 is greater than 8"), objects with a stated unit ("4 sticks of
// ten"), "which is" / "that's" after a quantity and the value of a digit in a named number are read too. A comparison or
// a bracket that is said but cannot be read whole is refused (fail closed), never skipped as a count.

import { standardNumber, unreadNumberRuns } from "./say-check";

const SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
/** Denominator words of a spoken fraction ("five sixths", "a half"). */
const DENOMINATORS: Record<string, number> = {
  half: 2, halves: 2, third: 3, thirds: 3, quarter: 4, quarters: 4, fourth: 4, fourths: 4, fifth: 5, fifths: 5, sixth: 6, sixths: 6,
  seventh: 7, sevenths: 7, eighth: 8, eighths: 8, ninth: 9, ninths: 9, tenth: 10, tenths: 10, twelfth: 12, twelfths: 12, hundredth: 100, hundredths: 100,
};

/** Longest first, so "sixteen" is never read as "six" and the rest. */
const alternatives = (words: readonly string[]) => [...words].sort((a, b) => b.length - a.length).join("|");
/** A number word below 100: "seven", "sixteen", "forty", "forty-two". */
const W99 = String.raw`(?:(?:${alternatives(TENS)})(?:[- ](?:${alternatives(SMALL.slice(1, 10))}))?|(?:${alternatives(SMALL)}))\b`;
const UNIT = String.raw`(?:hundred thousands?|ten thousands?|ones?|tens?|hundreds?|thousands?)\b`;
const DENOMINATOR = String.raw`(?:${alternatives(Object.keys(DENOMINATORS))})\b`;
const HUNDREDS = String.raw`(?:(?:${W99}|an?)\s+hundred\b(?:\s+(?:and\s+)?${W99})?)`;
/** A compound number word with a part after its scale: "one hundred and two", "two thousand three hundred". */
const COMPOUND = String.raw`(?:(?:${HUNDREDS}|${W99}|an?)\s+thousand\b\s+(?:and\s+)?(?:${HUNDREDS}|${W99})|(?:${W99}|an?)\s+hundred\b\s+(?:and\s+)?${W99})(?![-\w])(?!\s+(?:${UNIT}|${DENOMINATOR}))`;
const NUM = String.raw`(?:\d+(?:\.\d+)?(?!\.?\d)|${W99})`;
/** A spoken fraction: "five sixths", "5 sixths", "a half", "three-quarters". */
const FRACTION = String.raw`(?:\d+|${W99}|an?)[\s-]+${DENOMINATOR}`;
/** A place quantity: "4 tens and 12 ones", "a ten", "one hundred". */
const QUANTITY = String.raw`(?:(?:${NUM}|an?)\s+${UNIT})(?:\s+(?:and\s+)?(?:${NUM}|an?)\s+${UNIT})*`;
const OP = String.raw`(?:plus|\+|minus|take away|-|times|multiplied by|groups? of|×|\*|x|divided by|÷|/)`;
const REL = String.raw`(?:is not equal to|isn't equal to|is not|isn't|are not|aren't|is the same as|is equal to|equals|is now|are now|is still|becomes|become|became|turns into|turn into|turned into|=|is|are|makes|make|gives)`;
const TOKEN = new RegExp(String.raw`(${FRACTION})|(${COMPOUND})|(${QUANTITY})|(${NUM})(?!\s+${UNIT})|(${OP})(?=\s|\d|\(|$)|(${REL})(?=\s|\d|\(|$)|([()])|([a-z']+|[^\sa-z0-9])`, "gi");

/** A number said in digits (with a decimal part) or in words, compound words too ("one hundred and two"). */
export const NUMBER_SAID = String.raw`(?:\d+(?:\.\d+)?|(?:${W99}|hundred\b|thousand\b)(?:[\s-]+(?:and\s+)?(?:${W99}|hundred\b|thousand\b))*)`;

type Item =
  | { kind: "term"; value: number; unit: boolean; place?: number; word?: true; fraction?: true; ambiguous?: true }
  | { kind: "op"; op: "+" | "-" | "*" | "/" }
  | { kind: "rel"; negated: boolean; eq: boolean; now: boolean }
  | { kind: "open" }
  | { kind: "close" }
  | { kind: "other"; word?: string };

/**
 * A number in digits (a decimal too) or words ("forty-two", "one hundred and two", "two thousand three hundred"), or
 * "a"/"an" (1). Final check 10 (2026-11-15): words are read by the one standard reader (say-check.ts standardNumber), so
 * "twenty hundred" or "two thousand two thousand" has no value here either.
 */
export function numberOf(word: string): number | null {
  const w = word.toLowerCase().trim();
  if (/^\d+(?:\.\d+)?$/.test(w)) return Number(w);
  if (w === "a" || w === "an") return 1;
  return standardNumber(w);
}

/** "five sixths" is 5/6, "a half" is 1/2. */
function fractionOf(text: string): number | null {
  const m = /^(.*?)[\s-]+([a-z]+)$/i.exec(text.trim());
  if (!m) return null;
  const n = numberOf(m[1]);
  const d = DENOMINATORS[m[2].toLowerCase()];
  return n === null || !d ? null : n / d;
}

const PLACE: Record<string, number> = { one: 1, ten: 10, hundred: 100, thousand: 1000, "ten thousand": 10000, "hundred thousand": 100000 };

/** The parts of a place quantity ("4 tens and 12 ones": 4 of place 10, 12 of place 1), or null. */
function quantityParts(text: string): { n: number; place: number }[] | null {
  const parts: { n: number; place: number }[] = [];
  const re = new RegExp(String.raw`(${NUM}|an?)\s+(hundred thousand|ten thousand|one|ten|hundred|thousand)s?\b`, "gi");
  for (const m of text.toLowerCase().replace(/\band\b/g, " ").matchAll(re)) {
    const n = numberOf(m[1]);
    if (n === null) return null;
    parts.push({ n, place: PLACE[m[2]] });
  }
  return parts.length ? parts : null;
}

/** A value code computed that it cannot hold exactly: past the safe integers. */
const unsafeValue = (v: number) => !Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER;

/** An arithmetic operation the shared evaluator computes. */
export type ArithOp = "+" | "-" | "*" | "/";

/**
 * Final check 12 (2026-11-15): THE one evaluator of arithmetic for the core and every tutor kind. `values` joined by
 * `ops`, products and quotients first, then sums and differences, left to right. With no operation it is the value
 * itself (a fraction too). With any operation every value and every intermediate product, quotient and sum must be a
 * safe whole number and every division exact; else null: code cannot hold it exactly, so the clause is unread (the math
 * review reads it), never computed another way.
 */
export function exactValue(values: readonly number[], ops: readonly ArithOp[]): number | null {
  if (values.length === 0 || values.length !== ops.length + 1) return null;
  if (ops.length === 0) return unsafeValue(values[0]) ? null : values[0];
  if (!values.every((v) => Number.isSafeInteger(v))) return null;
  let total = 0;
  let term = values[0];
  let sign = 1;
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    const next = values[k + 1];
    if (op === "*") term *= next;
    else if (op === "/") { if (next === 0 || term % next !== 0) return null; term /= next; }
    else { total += sign * term; sign = op === "+" ? 1 : -1; term = next; }
    if (!Number.isSafeInteger(term) || !Number.isSafeInteger(total)) return null;
  }
  const value = total + sign * term;
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Final check 5 (2026-11-15): the digits a sentence names in a place, in digits or words, as groups: each place quantity
 * ("2 tens and 4 ones", "12 ones") is one group, and each "N in the P" ("Write 2 in the tens place") is a group of one.
 * `place` is the place's value (1, 10, 100, ...). The session reads them to tell whether a message gives the answer.
 */
export function placeDigitsSaid(sentence: string): { n: number; place: number }[][] {
  const text = sentence.replace(/[−–]/g, "-").replace(/(\d),(?=\d{3}\b)/g, "$1");
  const groups: { n: number; place: number }[][] = [];
  const into = new RegExp(String.raw`(${NUM})\s+(?:in|into|for|at|on)\s+(?:the\s+)?(hundred thousand|ten thousand|one|ten|hundred|thousand)s?\b`, "gi");
  const rest = text.replace(into, (_m, n: string, place: string) => {
    const v = numberOf(n);
    if (v !== null) groups.push([{ n: v, place: PLACE[place.toLowerCase()] }]);
    return " ; ";
  });
  for (const m of rest.matchAll(new RegExp(QUANTITY, "gi"))) {
    const parts = quantityParts(m[0]);
    if (parts) groups.push(parts);
  }
  return groups;
}

/**
 * `cuts`: when given, gets the index of each item that starts a new clause after a comma (pre-launch check 2: a word
 * after a read claim in the same clause can change it). The items are the same with or without it.
 */
function itemsOf(sentence: string, cuts?: Set<number>): Item[] {
  // A comma never joins a number to a place word after it: "15, one less than 16" is 15 and one, not 15 ones.
  const said = sentence.replace(/[−–]/g, "-").replace(/(\d),(?=\d{3}\b)/g, "$1").replace(/,(?=\s*(?:ones?|tens?|hundreds?|thousands?)\b)/gi, " ¦ ");
  const commas = [...said.matchAll(/,/g)].map((m) => m.index!);
  // Final check 10 (2026-11-15): a run of number words with no one standard value ("twenty hundred") is one number code
  // cannot read: a term with no value, so its clause stays unread (neither refused nor read).
  let text = said.replace(/,/g, " ");
  for (const run of unreadNumberRuns(text)) text = `${text.slice(0, run.at)}¤${" ".repeat(run.end - run.at - 1)}${text.slice(run.end)}`;
  const items: Item[] = [];
  let end = 0;
  for (const m of text.matchAll(TOKEN)) {
    // A comma between two items starts a clause at the next one; a comma inside one item (a place quantity) does not.
    while (cuts && commas.length && commas[0] < m.index!) if (commas.shift()! >= end) cuts.add(items.length);
    end = m.index! + m[0].length;
    if (m[1]) {
      const v = fractionOf(m[1]);
      items.push(v === null ? { kind: "other", word: m[1].toLowerCase() } : { kind: "term", value: v, unit: false, fraction: true });
    } else if (m[2]) {
      const v = numberOf(m[2]);
      items.push(v === null ? { kind: "other" } : { kind: "term", value: v, unit: false, word: true });
    } else if (m[3]) {
      // The place of each part comes from its unit word only ("one ten" is 1 of place 10).
      const parts = quantityParts(m[3]);
      const places = [...new Set((parts ?? []).map((x) => x.place))];
      // "one hundred and two tens" is 120 or 102 tens (1,020): in words, a hundred or a thousand joined by "and" to a
      // smaller place is never read as covered (two-layer true math); the review reads it.
      const ambiguous = /\b(?:hundred|thousand)s?\s+and\s+[a-z]/i.test(m[3]) && !/^\d/.test(m[3].trim());
      items.push(parts === null ? { kind: "other" } : { kind: "term", value: parts.reduce((t, x) => t + x.n * x.place, 0), unit: true, ...(places.length === 1 && parts.length === 1 ? { place: places[0] } : {}), ...(ambiguous ? { ambiguous: true as const } : {}) });
    } else if (m[4]) {
      const v = numberOf(m[4]);
      // "one" after a word such as "this" or "each" is a pronoun ("this one is tricky"), not the number 1.
      const prev = items.at(-1);
      const pronoun = m[4].toLowerCase() === "one" && prev?.kind === "other" && !!prev.word && DETERMINERS.has(prev.word);
      items.push(v === null || pronoun ? { kind: "other", word: m[4].toLowerCase() } : { kind: "term", value: v, unit: false, ...(/^\d/.test(m[4]) ? {} : { word: true as const }) });
    } else if (m[5]) {
      const w = m[5].toLowerCase();
      // "x" is an operator only between two numbers ("6 x 4").
      if (w === "x" && items.at(-1)?.kind !== "term" && items.at(-1)?.kind !== "close") { items.push({ kind: "other", word: "x" }); continue; }
      // "6 groups of 440" is 6 × 440 (F2 builder, 2026-11-15); "in groups of 4" names a thing.
      if (/^groups? of$/.test(w) && items.at(-1)?.kind !== "term") { items.push({ kind: "other", word: "groups" }); continue; }
      items.push({ kind: "op", op: /^(?:plus|\+)$/.test(w) ? "+" : /^(?:times|multiplied by|groups? of|×|\*|x)$/.test(w) ? "*" : /^(?:divided by|÷|\/)$/.test(w) ? "/" : "-" });
    } else if (m[6]) {
      const r = m[6].toLowerCase();
      items.push({ kind: "rel", negated: /not|n't/.test(r), eq: r === "=", now: /\bnow\b|becom|became|turn/.test(r) });
    } else if (m[7]) {
      items.push({ kind: m[7] === "(" ? "open" : "close" });
    } else {
      const word = m[8]?.toLowerCase();
      if (word === "¦") continue;
      if (word === "¤") { items.push({ kind: "term", value: NaN, unit: false, word: true }); continue; }
      // "the" after an operator changes nothing ("12 minus the 8 is 4").
      if (word === "the" && items.at(-1)?.kind === "op") continue;
      items.push({ kind: "other", word });
    }
  }
  return items;
}

/** "a ÷ b = q R r", in digits or words ("thirteen divided by two is six remainder one"). */
export const REMAINDER_SAID = String.raw`\b(${NUMBER_SAID})\s*(?:÷|\/|divided by)\s*(${NUMBER_SAID})\s*(?:=|is|equals|makes)\s*(${NUMBER_SAID})\s*(?:with a remainder of|with remainder|remainder|R|r)\s*(${NUMBER_SAID})(?![\w.]*\d)`;

/** Words before "one" that make it a pronoun. */
const DETERMINERS = new Set(["this", "that", "each", "every", "which", "another", "next", "last", "first", "other", "any", "no", "new", "same", "easier", "harder", "tricky", "hard", "easy"]);

/**
 * Words a number may run on into that make it a count, not a claim of equality ("12 is 4 steps", "8 and 4 more make
 * 12"). Any other word after a claim leaves the claim checked (fail closed: "4 is 4 tens left"). A comparison with
 * "than" is never a count: it is read, and refused when it does not hold.
 */
const COUNT_WORDS = new Set(["more", "less", "fewer", "bigger", "smaller", "greater", "larger", "away", "apart", "times", "counts", "numbers"]);
/** Things a number may count, also after a place quantity ("4 tens is 4 sticks of ten"). */
const OBJECT_WORDS = new Set(["steps", "step", "jumps", "jump", "fingers", "finger", "blocks", "block", "sticks", "stick", "bundles", "bundle", "rods", "rod", "cubes", "cube"]);
/** Comparison words: +1 says "more than", -1 says "less than". */
const COMPARE: Record<string, 1 | -1> = { more: 1, bigger: 1, greater: 1, larger: 1, higher: 1, less: -1, fewer: -1, smaller: -1, lower: -1 };
const compareSign = (word: string): 1 | -1 | 0 => (Object.hasOwn(COMPARE, word) ? COMPARE[word] : 0);

/** One side of a relation: its value, whether any term is a place quantity, and its one place when it has one. */
interface Side { at: number; value: number; units: boolean; place: number | null; next: number; ops: boolean; sums: boolean }

const wordAt = (items: readonly Item[], at: number): string => {
  const it = items[at];
  return it?.kind === "other" ? it.word ?? "" : "";
};

/** Reads sides of claims from one sentence's items: sums of products of terms and brackets. */
function sideReader(items: readonly Item[]) {
  /** Brackets read as part of a side. */
  const read = new Set<number>();
  const primary = (at: number): { value: number; units: boolean; place: number | null; next: number } | null => {
    const it = items[at];
    if (it?.kind === "term") return { value: it.value, units: it.unit, place: it.place ?? null, next: at + 1 };
    if (it?.kind === "open") {
      const inner = side(at + 1);
      if (!inner || items[inner.next]?.kind !== "close") return null;
      read.add(at).add(inner.next);
      return { value: inner.value, units: inner.units, place: null, next: inner.next + 1 };
    }
    return null;
  };
  const side = (at: number): Side | null => {
    const first = primary(at);
    if (!first) return null;
    const values = [first.value];
    const signs: ("+" | "-" | "*" | "/")[] = [];
    let units = first.units;
    let place = first.place;
    let next = first.next;
    let ops = items[at]?.kind === "open";
    while (items[next]?.kind === "op") {
      const t = primary(next + 1);
      if (!t) break;
      ops = true;
      signs.push((items[next] as Extract<Item, { kind: "op" }>).op);
      values.push(t.value);
      units ||= t.units;
      place = null;
      next = t.next;
    }
    // Final check 12: the one shared evaluator (exactValue). Every intermediate must be a safe whole number and every
    // division exact (final checks 5 and 6); else the side is NaN: not read, neither true nor false; the review reads it.
    const value = exactValue(values, signs) ?? NaN;
    return { at, value, units, place, next, ops, sums: signs.length > 0 && signs.every((x) => x === "+") && items[at]?.kind !== "open" };
  };
  /** A side, with an object count and its stated unit read as their product ("4 sticks of ten" is 40). */
  const full = (at: number): Side | null => {
    const s = side(at);
    // "two thirds of 6" is 2/3 × 6.
    const fraction = items[at]?.kind === "term" && (items[at] as Extract<Item, { kind: "term" }>).fraction === true;
    if (s && !s.ops && fraction && wordAt(items, s.next) === "of") {
      const whole = side(s.next + 1);
      // Final check 6: a product that is not a whole number ("two thirds of 5") is not held exactly: not read.
      if (whole) { const v = s.value * whole.value; return { ...whole, at, value: Number.isInteger(v) && !unsafeValue(v) ? v : NaN, place: null, ops: true, sums: false }; }
    }
    if (!s || s.ops || !OBJECT_WORDS.has(wordAt(items, s.next)) || wordAt(items, s.next + 1) !== "of") return s;
    const unit = side(s.next + 2);
    if (!unit || unit.ops) return s;
    return { ...s, value: exactValue([s.value, unit.value], ["*"]) ?? NaN, units: true, place: null, next: unit.next };
  };
  return { side, full, read };
}

/**
 * The value of a digit side said as "the value of the 8": that digit's place value in the one number of the sentence
 * that holds the digit once ("In 48,942, the value of the 8 is 8,000"). Undefined: the side is not such a side. Null:
 * code cannot tell which digit it names (the kind's own claim check reads it).
 */
function digitValue(items: readonly Item[], s: Side): number | null | undefined {
  const it = items[s.at];
  if (s.ops || it?.kind !== "term" || it.unit || !Number.isInteger(it.value) || it.value > 9 || it.value < 0) return undefined;
  const before = wordAt(items, s.at - 1) === "the" ? s.at - 2 : s.at - 1;
  if (wordAt(items, before) !== "of" || !["value", "worth"].includes(wordAt(items, before - 1))) return undefined;
  const digit = String(it.value);
  const named = [...new Set(items.flatMap((x) => (x.kind === "term" && !x.unit && Number.isInteger(x.value) && x.value >= 10 ? [String(x.value)] : [])))];
  const holds = named.filter((n) => n.split(digit).length === 2);
  if (holds.length !== 1) return null;
  return it.value * 10 ** (holds[0].length - 1 - holds[0].indexOf(digit));
}

/**
 * The math claims of a sentence that do not hold, as reasons; empty when every claim holds. A claim is a chain
 * `side REL side (REL side)*`, each side terms joined by operators, with brackets. Values are compared exactly: a number
 * said with no unit is that number ("4 is 4 tens" is false). "is now" / "are now" between two quantities of one place also
 * says a trade of the question's operation (`op`, a subtraction when not given): in a subtraction the ones gain 10 and
 * the tens give 1 ten ("the 2 ones are now 12 ones", "the 5 tens are now 4 tens"); in an addition the ones give 10 and the
 * tens gain 1 ten. Comparisons ("12 is 4 more than 8", "4 is greater than 8") must hold.
 */
/**
 * `trades`: the question's own work values (TutorKind.workValues). A place above the ones that both lends and borrows
 * ("2 tens become 11 tens" in 223 − 129) is true only when its result is one of them (review of #1009).
 */
export function falseClaims(sentence: string, op?: "add" | "subtract", trades: readonly number[] = []): string[] {
  return readClaims(sentence, op, trades).problems;
}

/**
 * Words that relate numbers ("4 is greater than 8", "12, so 4"): each must be inside a claim code read (two-layer true
 * math, 2026-11-15). The relation items (is, are, equals, makes, becomes, =) count too, and every number.
 */
/** Words that may stand next to a read number without changing it. Any other word next to it sends the sentence to the math review. */
const LINK_WORDS = new Set(["and", "so", "then", "now", "next", "first", "because", "in", "on", "at", "the", "we", "you", "it", "yes", "okay", "ok", "here", "also", "too", "from", "to", "for", "with", "is", "are", "what", "get", "gives", "make", "makes", "left", "if", "when", "after", "before", "this", "that's", "but"]);
/**
 * Final check 8: a word before a claim in its clause that encloses it: a negation, a word that opens an embedded clause
 * or a hypothesis, or a word that opens a scope (a place, an example, a condition).
 */
export const ENCLOSING = /^(?:not|never|no|nor|neither|false|untrue|wrong|that|if|whether|unless|suppose|pretend|imagine|when|where|in|for|on|at|with|without|during|instead|rather|than|example|easier|maybe|might|could|would|should|wish|doubt)$/;
/** Final check 8: words that start a new clause after a claim: the scope scan after it stops there. */
const NEW_CLAUSE = new Set(["so", "then", "because", "cause", "cuz", "before", "after", "and", "but", "when", "while", "since", "which", "until", "or", "as"]);

/**
 * Final check 12 (2026-11-15): a refusal of a tutor kind, with what the kind read: `text` (the text the kind read, as it
 * read it) and the span [`at`, `end`) of the claim in it. A plain string is a refusal about the whole sentence.
 */
export interface KindRead { problem: string; text: string; at: number; end: number }

const NUMBER_WORDS = /^(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|half|halves|third|thirds|quarter|quarters|fourth|fourths|fifth|fifths|sixth|sixths|eighth|eighths|tenth|tenths)$/;
const OPERATOR_WORD = /^(?:plus|minus|times|divided|multiplied|over|point|squared|cubed|percent|[+\-×x÷*/=<>^%])$/;
const numberish = (w: string) => /^(?:\d|@\d)/.test(w) || NUMBER_WORDS.test(w);

/**
 * Final check 12 (2026-11-15): THE one full-read guard. A kind may refuse a claim only when it read the claim in full:
 * nothing in its clause before it encloses it (a negation or a scope word: "It is not true that ...", "If ...", "In the
 * easier example ..."), nothing of a number or an operator runs into it from before ("negative", "plus", a number), and
 * nothing runs on after it: no number, operator or number word in the rest of its clause, and no number, operator or
 * number word right after a comma or a joining word that ends it ("8000, plus 1", "8000 and a half"). Else the claim is
 * unread: no refusal, and the math review reads the sentence.
 */
export function fullRead(text: string, at: number, end: number): boolean {
  const lower = text.toLowerCase().replace(/[’]/g, "'");
  const tokens = (piece: string) => piece.match(/@\d|\d+(?:\.\d+)?|[a-z']+|[^\s\da-z']/g) ?? [];
  // Before: from the last clause mark (a comma that is not inside a number, or a sentence mark) to the claim.
  const marks = [...lower.slice(0, at).matchAll(/[;:!?]|\.(?!\d)|,(?!\d{3})/g)].map((m) => m.index! + 1);
  const lead = tokens(lower.slice(marks.length ? Math.max(...marks) : 0, at));
  const last = lead.at(-1);
  if (last !== undefined && (numberish(last) || OPERATOR_WORD.test(last) || /^(?:negative|positive)$/.test(last))) return false;
  if (lead.some((w) => ENCLOSING.test(w) || w === "not" || /n't$/.test(w) || w === "true" || w === "false")) return false;
  // After: a decimal or digit group that goes on ("40000.5", "8,0"), the rest of the clause, then the first words after
  // the mark or joining word that ends it.
  if (/^(?:\.\d|,\d)/.test(lower.slice(end))) return false;
  const rest = tokens(lower.slice(end));
  for (let k = 0; k < rest.length; k++) {
    const w = rest[k];
    if (/^[;:.!?]$/.test(w)) return true;
    if (w === "," || NEW_CLAUSE.has(w)) {
      let j = k + 1;
      while (rest[j] === "," || rest[j] === "a" || rest[j] === "an") j++;
      const next = rest[j];
      return next === undefined || !(numberish(next) || OPERATOR_WORD.test(next));
    }
    if (numberish(w) || OPERATOR_WORD.test(w)) return false;
  }
  return true;
}

/** Final check 12: the kind refusals that stand: each read through the one full-read guard (`fullRead`). */
export function guardedProblems(reads: readonly (string | KindRead)[]): string[] {
  return reads.flatMap((r) => (typeof r === "string" ? [r] : fullRead(r.text, r.at, r.end) ? [r.problem] : []));
}
const RELATION_WORDS = new Set(["greater", "less", "more", "fewer", "bigger", "smaller", "larger", "higher", "lower", "than", "same", "equal", "twice", "double", "half"]);

/**
 * The claim reader with its coverage (two-layer true math, CoS design of 2026-11-15). `problems`: the claims that do not
 * hold (falseClaims). `unread`: each number, relation and operator of the sentence that is not inside a claim code read
 * and found true, as the word said ("8", "is", "greater"). A sentence passes on code alone only when nothing is unread;
 * any other sentence with no problem goes to the math-truth review (src/lib/maya-math-review.ts).
 */
/** One column sum of the question's own work: the numbers added in that column and the place's value (pre-launch check 2). */
export interface ColumnSum { terms: readonly number[]; place: number }

/**
 * Final check 4 (2026-11-15): a number said with more digits than code reads exactly (more than 15 significant digits:
 * Number() rounds "9999999999999999" to 10000000000000000). A sentence with one is never read by code, neither true nor
 * false: it goes to the math review.
 */
export function unsafeNumberSaid(sentence: string): boolean {
  return [...sentence.replace(/(\d),(?=\d{3}\b)/g, "$1").matchAll(/\d+(?:\.\d+)?/g)].some((m) => m[0].replace(".", "").replace(/^0+/, "").length > 15);
}


/**
 * Final check 5 (2026-11-15): ", and" can end a clause ("make 16 ones, and 10 ones can be traded") or join the parts of
 * one quantity ("52 is 4 tens, and 12 ones"). Code reads such a sentence both ways. It refuses only when both reads find
 * a problem, and passes a claim only when both reads agree; otherwise every number goes to the review.
 */
export function readClaims(sentence: string, op?: "add" | "subtract", trades: readonly number[] = [], columns: readonly ColumnSum[] = []): { problems: string[]; unread: string[] } {
  const joined = readClaimsOnce(sentence, op, trades, columns);
  if (!/,\s*(?:and|or|but)\b/i.test(sentence)) return joined;
  const split = readClaimsOnce(sentence.replace(/,(?=\s*(?:and|or|but)\b)/gi, ", ¦"), op, trades, columns);
  if (joined.problems.length && split.problems.length) return joined;
  const unread = [...new Set([...joined.unread, ...split.unread])];
  if (!joined.problems.length && !split.problems.length) return { problems: [], unread };
  return { problems: [], unread: [...unread, ...[...sentence.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]), "a clause after \", and\" that code reads two ways"] };
}

function readClaimsOnce(sentence: string, op?: "add" | "subtract", trades: readonly number[] = [], columns: readonly ColumnSum[] = []): { problems: string[]; unread: string[] } {
  // Final check 4: an unsafe number is never read; every number of the sentence stays unread.
  if (unsafeNumberSaid(sentence)) return { problems: [], unread: [...sentence.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]) };
  const problems: string[] = [];
  // A division with a remainder ("15 ÷ 6 = 2 R 3", "thirteen divided by two is six remainder one") is read whole, then
  // left out.
  sentence = sentence.replace(new RegExp(REMAINDER_SAID, "gi"), (all, a: string, b: string, q: string, r: string) => {
    const [x, y, z, w] = [a, b, q, r].map(numberOf);
    if (x === null || y === null || z === null || w === null) problems.push(`it has a remainder code cannot read: "${all}"`);
    else if (!(y > 0 && x === y * z + w && w < y)) problems.push(`${x} divided by ${y} is not ${z} remainder ${w}`);
    return " ";
  });
  // "4 ones, which is 40", "1 ten, that's 10 ones": the words name the quantity before them (pre-launch review B).
  sentence = sentence.replace(/,\s*(?:and\s+)?(?:which|that)\s+(?:is|are)\b/gi, " is").replace(/,\s*(?:and\s+)?that['’]s\b/gi, " is");
  const cuts = new Set<number>();
  const items = itemsOf(sentence, cuts);
  const { full, read } = sideReader(items);
  /** The items inside a claim code read and found true. */
  const used = new Set<number>();
  /** Where each claim code read and found true ends: the words after it in its clause are read too (pre-launch check 2). */
  const ends: number[] = [];
  const mark = (from: number, to: number) => { for (let k = from; k < to; k++) used.add(k); ends.push(to); };
  const unread: string[] = [];
  let i = 0;
  let eqSeen = 0;
  let eqRead = 0;
  for (const it of items) if (it.kind === "rel" && it.eq) eqSeen++;
  // The core cannot check a decimal relation yet ("2.5 × 4 = 10"): it is refused, never read as whole numbers.
  // A term with no value (a number-word run the standard reader cannot read, final check 10) is unread, not a decimal.
  if (items.some((x) => x.kind === "term" && Number.isFinite(x.value) && !Number.isInteger(x.value) && x.fraction !== true) && items.some((x) => x.kind === "rel")) problems.push("it has a decimal code cannot read");
  // A column's sum of digits said in its place: "1 + 2 + 3 = 6 tens" (never a bare "4 is 4 tens", and never a product or
  // a difference: "3 groups of 4 is 12 tens" is false, review of #1009).
  const inPlace = (a: Side, b: Side): boolean =>
    (a.sums && !a.units && b.place !== null && a.value * b.place === b.value) || (b.sums && !b.units && a.place !== null && b.value * a.place === a.value);
  // Pre-launch check 2: such a sum is read whole only when it is one of the question's own column sums, in that column's
  // place ("1 + 2 + 3 = 6 tens" in 27 + 39). Any other ("1 plus 2 plus 3 is 6 hundreds" in 52 − 28) is not refused, but
  // goes to the math review.
  const termsOf = (x: Side) => items.slice(x.at, x.next).flatMap((t) => (t.kind === "term" ? [t.value] : [])).sort((p, q) => p - q).join();
  const ownColumn = (sum: Side, place: number) => columns.some((c) => c.place === place && [...c.terms].sort((p, q) => p - q).join() === termsOf(sum));
  const boundInPlace = (a: Side, b: Side): boolean =>
    (a.sums && !a.units && b.place !== null && a.value * b.place === b.value && ownColumn(a, b.place)) || (b.sums && !b.units && a.place !== null && b.value * a.place === a.value && ownColumn(b, a.place));
  const trade = (a: Side, b: Side): boolean => {
    // Two digits with no place ("the 2 becomes 12", "the 5 becomes 4"): in a subtraction the ones gain 10 or the tens
    // give 1; in an addition the ones give 10 or the tens gain 1 ("16 becomes 6", pre-launch review B).
    if (!a.units && !b.units) return op === "add" ? b.value === a.value - 10 || b.value === a.value + 1 : b.value === a.value + 10 || b.value === a.value - 1;
    // A number with no unit beside a place quantity is in its place ("2 ones become 12", "5 tens become 4", "the 2
    // becomes 12 ones").
    const place = a.place ?? b.place;
    if (place === null || (a.units && b.units && a.place !== b.place)) return false;
    const aValue = a.units ? a.value : a.value * place;
    const bValue = b.units ? b.value : b.value * place;
    const gainsTen = place === 1 ? op !== "add" : op === "add";
    const delta = place === 1 ? 10 : place;
    // A borrow across a zero (#1012): in a subtraction a place above the ones may also take 10 of its own units from
    // the left ("0 tens become 10 tens"), then give 1 to the right ("0 tens are now 9 tens").
    // Only a zero place borrows this way: "5 tens become 15 tens" is false (review of #1009).
    if (place > 1 && op !== "add" && aValue === 0 && (bValue === 10 * place || bValue === 9 * place)) return true;
    if (place > 1 && op !== "add" && trades.includes(bValue / place) && (bValue === aValue + 10 * place || bValue === aValue + 9 * place)) return true;
    return gainsTen ? bValue === aValue + delta : bValue === aValue - delta;
  };
  /** A side's value as the claim means it: a "value of the 8" side becomes its place value; null when code cannot tell. */
  const valued = (s: Side): Side | null => {
    const v = digitValue(items, s);
    return v === undefined ? s : v === null ? null : { ...s, value: v, units: true, place: null };
  };
  /** "than C" at `at` (with an optional "the"): the side C. */
  const than = (at: number): Side | null => (wordAt(items, at) !== "than" ? null : full(wordAt(items, at + 1) === "the" ? at + 2 : at + 1));
  const near = (x: number, y: number) => Math.abs(x - y) < 1e-9;
  // Final check 7 (2026-11-15): a side is read only in full. A sign or an operator right before it ("Minus 6 plus 10 is
  // 4", "negative 6 plus 10 is 4") or right after it ("12 minus 8 is 4 minus") is part of it that this reader does not
  // read: the whole claim stays unread (no refusal and no read), and the sentence goes to the math review.
  // Final check 10 (2026-11-15): a side is a part of a longer number when another number runs on from it ("seven thousand
  // nine hundred" read in parts, "One and a half": the whole number before "and" a fraction, or a fraction after it).
  // The reader reads such a side only in part: the whole claim stays unread, like a side with a sign.
  const isTerm = (k: number) => items[k]?.kind === "term";
  const isFraction = (k: number) => items[k]?.kind === "term" && (items[k] as Extract<Item, { kind: "term" }>).fraction === true;
  const signedAt = (k: number) => items[k]?.kind === "op" || (items[k]?.kind === "other" && /^(?:negative|positive)$/.test((items[k] as { word?: string }).word ?? "")) ||
    (isTerm(k) && (isTerm(k - 1) || isTerm(k + 1))) || (wordAt(items, k) === "and" && ((isTerm(k - 1) && isFraction(k + 1)) || (isFraction(k - 1) && isTerm(k + 1))));
  /** Skips a claim this reader does not read in full: its "=" counts as seen on purpose, so it is not refused. */
  const skipClaim = (relAt: number) => { const r = items[relAt]; if (r?.kind === "rel" && r.eq) eqRead++; };
  // Final check 8 (2026-11-15): an enclosing negation or a scope phrase around a claim ("It is not true that 3 times 2 is
  // 7.", "If 3 times 2 is 7, ...", "... in the easier example", "... with a negative sign") can change what it says.
  // Such a claim is unread: no refusal and no read; the sentence goes to the math review. Before the claim, in its
  // clause, a negation, a relation or a word that opens a scope or an embedded clause encloses it; after it, to the end
  // of its clause or the next word that starts a new clause, any word that is not a plain link word does.
  const stops = (k: number) => cuts.has(k + 1) || (items[k]?.kind === "other" && /^[;:.!?]$/.test((items[k] as { word?: string }).word ?? ""));
  const scopedBefore = (from: number): boolean => {
    for (let k = from - 1; k >= 0 && !stops(k); k--) {
      const it = items[k];
      if (it.kind === "rel" && it.negated) return true;
      if (it.kind === "other" && (ENCLOSING.test(it.word ?? "") || /n't$/.test(it.word ?? ""))) return true;
    }
    return false;
  };
  const scopedAfter = (to: number): boolean => {
    for (let k = to; k < items.length && !cuts.has(k); k++) {
      const it = items[k];
      if (it.kind !== "other") return false;
      const w = it.word ?? "";
      if (/^[;:.!?]$/.test(w) || NEW_CLAUSE.has(w)) return false;
      if (!LINK_WORDS.has(w)) return true;
    }
    return false;
  };
  /** Takes back what a scoped claim found (from `pb` and `eb`): its problems and its read become unread. */
  const unscope = (pb: number, eb: number, from: number, to: number) => {
    problems.splice(pb);
    ends.splice(eb);
    for (let k = from; k < to; k++) used.delete(k);
    unread.push("a claim inside a scope or a negation");
  };
  while (i < items.length) {
    const left = full(i);
    if (!left || items[left.next]?.kind !== "rel") { i++; continue; }
    if (signedAt(i - 1) || scopedBefore(i)) {
      // Every "=" of the claim's chain is left unread on purpose.
      let k = left.next;
      while (items[k]?.kind === "rel") { skipClaim(k); const r = full(k + 1); if (!r) break; k = r.next; }
      i = Math.max(k, left.next + 1);
      continue;
    }
    const chain = [left];
    const rels: Extract<Item, { kind: "rel" }>[] = [];
    let at = left.next;
    let cutOff = false;
    while (items[at]?.kind === "rel") {
      // "the" before a number word alone names a thing ("the 1 is the ten we carried"); before a digit or a place
      // quantity it is read through ("52 is the 4 tens and 2 ones").
      const article = wordAt(items, at + 1) === "the";
      // Only a lone number word with no operator after it ("4 tens is the twenty plus thirty" is read).
      const named = article && items[at + 2]?.kind === "term" && (items[at + 2] as Extract<Item, { kind: "term" }>).word === true && !(items[at + 2] as Extract<Item, { kind: "term" }>).unit && items[at + 3]?.kind !== "op";
      const right = named ? null : full(at + (article ? 2 : 1));
      if (!right) break;
      if (signedAt(right.next)) { cutOff = true; at = right.next; break; }
      rels.push(items[at] as Extract<Item, { kind: "rel" }>);
      chain.push(right);
      at = right.next;
    }
    if (cutOff) {
      // A side runs on into a sign or an operator this reader does not read: the whole chain stays unread.
      for (let k = left.next; k < at; k++) skipClaim(k);
      i = at;
      continue;
    }
    if (chain.length < 2) {
      // "4 is greater than 8", "2 is not smaller than 8": a comparison must hold (pre-launch review B).
      const rel = items[left.next] as Extract<Item, { kind: "rel" }>;
      const sign = compareSign(wordAt(items, left.next + 1));
      const base = sign && !rel.now ? than(left.next + 2) : null;
      // Final check 8: a base that runs on into an operator or a sign is not read in full: unread.
      if (sign && base && signedAt(base.next)) { skipClaim(left.next); i = base.next; continue; }
      if (sign && base) {
        const [a, b] = [valued(left), valued(base)];
        if (a && b && !unsafeValue(a.value) && !unsafeValue(b.value)) {
          const [pb, eb] = [problems.length, ends.length];
          const holds = sign > 0 ? a.value > b.value + 1e-9 : a.value < b.value - 1e-9;
          if (holds === rel.negated) problems.push(`it says ${a.value} is ${rel.negated ? "not " : ""}${sign > 0 ? "more" : "less"} than ${b.value}`);
          else mark(left.at, base.next);
          if (scopedAfter(base.next)) unscope(pb, eb, left.at, base.next);
          if (rel.eq) eqRead++;
        }
        i = base.next;
        continue;
      }
      i = left.next + 1;
      continue;
    }
    // Not a claim of equality: a counting list ("9, 10, 11, 12 is 4 steps") or a number that goes on into a word that
    // is not a place ("12 is 4 steps", "8 and 4 more make 12"). An "=" is always read.
    // A count ("12 is 4 steps", "12 is 4 more than 8"): only with a count word after it and no place unit on any
    // side; a place-value claim is always read (#1008).
    const word = wordAt(items, at);
    // "A is B more than C" ("12 is 4 more than 8", "4 tens is 1 ten more than 3 tens"): true when A = C + B, or C - B
    // for "less". A comparison that does not hold is refused before any count exemption (pre-launch review B).
    const sign = compareSign(word);
    const base = sign && chain.length === 2 && !rels[0].now ? than(at + 1) : null;
    // Final check 8 (2026-11-15): a comparison this reader cannot read in full ("4 is 6 more than minus 2": its base has
    // a sign; a chain or a "now" relation before the comparison word; a base that runs on into an operator or a sign) is
    // unread: no refusal and no read, never the equality of its first two numbers. It goes to the math review.
    if (sign && (!base || signedAt(base.next))) {
      for (let k = left.next; k < at; k++) skipClaim(k);
      i = at;
      continue;
    }
    if (sign && base) {
      const [a, b, c] = [valued(chain[0]), valued(chain[1]), valued(base)];
      if (a && b && c && ![a, b, c].some((x) => unsafeValue(x.value))) {
        const [pb, eb] = [problems.length, ends.length];
        const holds = near(a.value, c.value + sign * b.value);
        if (holds === rels[0].negated) problems.push(`it says ${a.value} is ${rels[0].negated ? "not " : ""}${b.value} ${sign > 0 ? "more" : "less"} than ${c.value}`);
        else mark(chain[0].at, base.next);
        if (scopedAfter(base.next)) unscope(pb, eb, chain[0].at, base.next);
        if (rels[0].eq) eqRead++;
      }
      i = base.next;
      continue;
    }
    // An object count after a place quantity with no stated unit names the same number of that place ("4 tens is 4
    // sticks"); with a stated unit ("4 sticks of ten") the side is already the product. Any other count is read as a
    // claim ("4 tens is 5 bundles of ten" is false, review of #1032).
    const unitSide = chain.find((c) => c.units && c.place !== null);
    const objects = OBJECT_WORDS.has(word) && wordAt(items, at + 1) !== "of" && (!chain.some((c) => c.units) || (!!unitSide && chain.every((c) => c === unitSide || (!c.units && c.value * unitSide.place! === unitSide.value))));
    const runsOn = objects || (COUNT_WORDS.has(word) && wordAt(items, at + 1) !== "than" && !chain.some((c) => c.units));
    if (runsOn && !rels.some((r) => r.eq)) { i = at; continue; }
    // An object word with "of" and a unit code could not read ("4 tens is 4 sticks of wood") leaves the count unread.
    if (OBJECT_WORDS.has(word) && wordAt(items, at + 1) === "of" && chain.some((c) => c.units)) problems.push(`it counts ${word} with a size code cannot read`);
    // Final check 4: a side code computed past the safe integers is not read, neither true nor false.
    const sides = chain.map(valued).map((x) => (x && unsafeValue(x.value) ? null : x));
    const before = problems.length;
    let unbound = false;
    // Final check 7 (2026-11-15): a relation that holds only by reading a bare number in a place ("1 + 2 + 3 = 6 tens":
    // the sum is read as tens) or as a trade depends on which problem and which column it means. It is not
    // context-free, so code alone never reads it (it passes on code alone only as an exact text of the active problem,
    // tutor.ts codeAlone); it goes to the math review. Only relations of literally equal values are read.
    let literal = true;
    for (let k = 0; k < rels.length; k++) {
      const [a, b] = [sides[k], sides[k + 1]];
      if (rels[k].eq) eqRead++;
      // A "value of the 4" side code cannot tie to one digit: the kind's own check reads it.
      if (!a || !b) continue;
      const same = near(a.value, b.value);
      const traded = rels[k].now && trade(a, b);
      if (!same && !traded && inPlace(a, b) && !boundInPlace(a, b)) unbound = true;
      const equal = same || inPlace(a, b) || traded;
      if (!same && !rels[k].negated) literal = false;
      if (!rels[k].negated && !equal) problems.push(`it says ${a.value} and ${b.value} are the same`);
      if (rels[k].negated && same) problems.push(`it says ${a.value} and ${b.value} are not the same`);
    }
    // Read whole and true: every side code could value, and no problem found.
    const eb = ends.length;
    if (problems.length === before && sides.every((x) => x !== null) && !unbound && literal) mark(chain[0].at, at);
    // Final check 8: a scope phrase after the claim in its clause leaves it unread, true or false.
    if (scopedAfter(at)) unscope(before, eb, chain[0].at, at);
    i = at;
  }
  // Final check 9 (2026-11-15): an "=" code cannot read ("2 times (minus 3 plus 4) = 2", "3 squared = 9") leaves its
  // clause unread, never refused: the math review judges it. Only a complete clause code proves false is refused.
  if (eqRead < eqSeen) unread.push("=");
  // Final check 8 (2026-11-15): a bracket this reader cannot read whole ("2 times (minus 3 plus 4) is 2": a sign inside;
  // "2 times (3 plus 4 is 7)") is unread, never refused: the sentence goes to the math review, which judges it.
  for (const [k, it] of items.entries()) {
    if ((it.kind === "open" || it.kind === "close") && !read.has(k)) unread.push(it.kind === "open" ? "(" : ")");
  }
  // A word right before or after a read number that is not a plain link word can change its meaning ("4 percent", "4
  // squared", "4 million", "false that 12 minus 8 is 4"): such a claim is not read whole (final check of #1044).
  for (const k of used) {
    if (items[k]?.kind !== "term") continue;
    for (const n of [k - 1, k + 1]) {
      const it = items[n];
      const w = it?.kind === "other" ? it.word ?? "" : "";
      if (w && !used.has(n) && !LINK_WORDS.has(w)) unread.push(w);
    }
  }
  // Pre-launch check 2: every word after a read claim, to the end of its clause, is a plain link word or part of a claim
  // code read ("12 minus 8 is 4 with a negative sign", "12 minus 8 is 4 in the hundreds place" are not read whole).
  for (const e of new Set(ends)) {
    for (let k = e; k < items.length && !cuts.has(k); k++) {
      const it = items[k];
      if (used.has(k)) continue;
      // A number, a relation or an operator code did not read is unread already.
      if (it.kind !== "other") break;
      const w = it.word ?? "";
      if (/^[:;.!?]$/.test(w)) break;
      if (w && !LINK_WORDS.has(w)) { unread.push(w); break; }
    }
  }
  let termSeen = false;
  for (const [k, it] of items.entries()) {
    const word = it.kind === "other" ? it.word ?? "" : "";
    // "so" relates only after a number ("12 minus 8 is 4, so the tens are 2"); a lead-in "So" relates nothing.
    const relates = it.kind === "term" || it.kind === "rel" || it.kind === "op" || RELATION_WORDS.has(word) || (word === "so" && termSeen);
    if (it.kind === "term") termSeen = true;
    if (relates && (!used.has(k) || (it.kind === "term" && it.ambiguous))) unread.push(it.kind === "term" ? String(Math.round(it.value * 1e6) / 1e6) : it.kind === "rel" ? (it.eq ? "=" : it.negated ? "is not" : "is") : it.kind === "op" ? it.op : word);
  }
  return { problems, unread };
}

/**
 * Final check 6 (2026-11-15): whether words before an answer claim, in its sentence, may give it a scope ("In the ones
 * column, the answer is 4."): anything but a short lead-in ({name}, now, so, next, then) and punctuation. No word list of
 * scopes: every other word counts as one, so the claim goes to the math review.
 */
function scoped(text: string, at: number): boolean {
  let lead = text.slice(0, at).split(/[!?]|\.(?!\d)/).at(-1)!.replace(/[\s,;:]+/g, " ").trim();
  for (let k = 0; k < 4; k++) lead = lead.replace(/^(?:\{name\}|(?:now|so|next|then)\b)[\s!.]*/i, "").trim();
  return lead !== "";
}

/** Words that may stand between "the answer is" and its value ("the answer is still 24"). */
const ANSWER_FILLERS = new Set(["the", "just", "exactly", "still", "now", "really", "actually"]);

/**
 * A claim about which number is the question's answer that does not hold, as reasons (pre-launch review B): "the answer
 * is twenty-five", "the answer is not 24", "the answer is 24 plus 1", "24.5 is the answer". The whole value after "the
 * (whole, final, right) answer is" is read with the claim reader. Final check 6 (2026-11-15): a value code cannot read
 * whole and exactly ("the answer is about 25", an unsafe or inexact side) or a claim with a stated scope ("In the ones
 * column, the answer is 4.") is never refused: it goes to the math review. A clause with no number ("the answer is
 * right") is no claim.
 */
export function answerProblems(sentence: string, answer: number): string[] {
  return answerClaims(sentence, answer).problems;
}

/**
 * The answer claims of a sentence (answerProblems), with the spans of those code read whole and found true (`read`:
 * "the answer is 24", "24 is the answer"). "The answer is 24 and a half" is not read whole: its rest stays unread
 * (two-layer true math, 2026-11-15).
 */
export function answerClaims(sentence: string, answer: number): { problems: string[]; read: { index: number; length: number }[] } {
  const problems: string[] = [];
  const read: { index: number; length: number }[] = [];
  // Final check 4: an unsafe number is never read; the sentence goes to the math review.
  if (unsafeNumberSaid(sentence)) return { problems, read };
  const text = sentence.replace(/[’]/g, "'");
  const after = /\b(?:the|your|our)\s+(?:whole\s+|final\s+|right\s+)?answer\s+(is not|isn't|is|equals|=|would be|will be|should be|must be)\s+([^,;:!?]*?)(?=[,;:!?]|\.(?!\d)|$)/gi;
  for (const m of text.matchAll(after)) {
    // Final check 6 (2026-11-15): code reads an answer claim only when it names the question's answer with no stated
    // scope: nothing before "the answer" in its sentence but a short lead-in. Any other words ("In the ones column, the
    // answer is 4.", "For the easier example, the answer is 35.") may name another answer: no refusal and no read.
    if (scoped(text, m.index!)) continue;
    const negated = /not|n't/.test(m[1]);
    const items = itemsOf(m[2]);
    const { full } = sideReader(items);
    let at = 0;
    while (ANSWER_FILLERS.has(wordAt(items, at))) at++;
    const s = full(at);
    // Final check 6: a value code cannot read whole and exactly (an unread word, an unsafe or inexact side, words after
    // it) is neither refused nor read: the sentence goes to the math review.
    if (!s || !Number.isSafeInteger(s.value) || s.next !== items.length) continue;
    const same = s.value === answer;
    if (same === negated) problems.push(`${s.value} is ${negated ? "" : "not "}the answer to the question`);
    else read.push({ index: m.index!, length: m[0].length });
  }
  const before = new RegExp(String.raw`(?:^|[^\w.])(${NUMBER_SAID})\s+(is not|isn't|is)\s+(?:the|your|our)\s+(?:whole\s+|final\s+|right\s+)?answer\b`, "gi");
  for (const m of text.matchAll(before)) {
    const lead = text.slice(0, m.index! + m[0].indexOf(m[1])).trim().split(/\s+/).at(-1)?.toLowerCase() ?? "";
    if (DETERMINERS.has(lead)) continue;
    // Final check 3 (P2): a number after an operation ("52 minus 28 is the answer") is not the subject alone. Code
    // cannot read the subject whole, so it neither refuses nor reads it: the sentence goes to the math review.
    if (/^(?:minus|plus|times|by|away|over|x)$|[+\-−–×÷*/]$/i.test(lead)) continue;
    // Final check 4 (P2): code reads "N is the answer" only when N is the whole subject of its clause ("The difference
    // between 52 and 28 is the answer" is not "28 is the answer"). Any other word before N, after a short lead-in, leaves
    // the claim unread: no refusal, and the sentence goes to the math review.
    const start = m.index! + m[0].indexOf(m[1]);
    let subject = text.slice(0, start).split(/[,;:!?]|\.(?!\d)/).at(-1)!.trim();
    for (let k = 0; k < 4; k++) subject = subject.replace(/^(?:\{name\}|(?:now|so|next|then)\b)[\s!.]*/i, "").trim();
    if (subject !== "") continue;
    // Final check 6: a stated scope before or after the claim ("For the easier example, 35 is the answer.", "4 is the
    // answer in the ones column") is not resolved by code: no refusal and no read.
    if (scoped(text, start) || !/^\s*(?:[,;:!?]|\.(?!\d)|$)/.test(text.slice(m.index! + m[0].length))) continue;
    const n = numberOf(m[1]);
    if (n === null || !Number.isSafeInteger(n)) continue;
    const negated = /not|n't/.test(m[2]);
    if ((n === answer) === negated) problems.push(`${n} is ${negated ? "" : "not "}the answer to the question`);
    else {
      read.push({ index: start, length: m.index! + m[0].length - start });
    }
  }
  return { problems, read };
}
