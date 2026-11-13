// The say checks of conversational Maya (D-341): pure code that reads every reply the model writes (`say`) before a
// child hears it. The model writes Maya's words in its own way; code owns the facts and the limits. Each check runs per
// sentence, so a later streaming adapter can send a sentence as soon as it passes (checkSentence), and once on the whole
// reply (checkSay) for the limits that count across sentences.
//
// (a) Numbers: every number in `say` is in the turn's allowed set (the question's printed numbers and their digits, the
//     values of credited steps, the numbers code's own plan for this act and help level holds, the child's own numbers
//     and the misconception facts code computed). A false equation fails; so does calling a true one false.
// (b) No answer: the final answer and any uncredited step value never appear, unless code's own plan for this turn shows
//     that value (a show step). An equation whose result is such a value must be one code's plan holds.
// (c) Length: 1 to 3 sentences, at most `wordLimit` words, short sentences, plain words (D-202).
// (d) Never-say patterns code can catch (feelings, claims to see, promises, secrets, personal questions, unkind words).
// (e) Calm, no hype: a small list of hype words.
// Each failure has a typed reason, which goes back to the model in the repair prompt.
import { feelingClaim, plainLanguageProblem } from "./phrases";

/** Why a reply was refused. */
export const SAY_REASONS = [
  "empty", "too_long", "too_many_sentences", "long_sentence", "number_not_allowed", "reveals_answer", "reveals_step",
  "false_equation", "affirms_wrong", "missing_number", "hard_words", "never_say", "hype", "board_words", "reintroduces", "close_asks", "empty_reply", "wrong_stance",
] as const;
export type SayReason = (typeof SAY_REASONS)[number];

/** A number as code compares it: its canonical text ("52", "2.5", "3/4", "3:45") and, for a number, its exact value. */
export interface SayValue {
  key: string;
  /** Numerator and denominator (in lowest terms) of a number, a decimal or a fraction; null for a clock time. */
  q: [number, number] | null;
}

/** One number found in a text, with where it is. */
export interface SayToken extends SayValue {
  at: number;
  end: number;
  text: string;
}

/** The limits of one turn. Code builds them from the session (session.ts, sayRules). */
export interface SayRules {
  /** Values that may be said anywhere. */
  allowed: readonly SayValue[];
  /** Values code's own plan for this turn says (they may include a step value the act shows). */
  shown: readonly SayValue[];
  /** Equations code's own plan says, as "a op b = c" keys (equationKey). */
  shownEquations: readonly string[];
  /** Values of steps the child has not been credited with: never said unless the plan shows them. */
  forbidden: readonly SayValue[];
  /** Equations of uncredited steps and of the whole question while its answer is open (equationKey): never said. */
  hidden?: readonly string[];
  /** The opening said who Maya is: no reply says it again (unless the child asked). */
  noIntro?: boolean;
  /** The final answer while it is not the child's yet: never said, not even when a plan text holds the number. */
  answer: readonly SayValue[];
  /** Values the child said this turn that code judged wrong: no sentence may call them right. */
  wrong: readonly SayValue[];
  /** A confirmation must ask about exactly this value. */
  mustAsk?: SayValue | null;
  /** Code authorized confirmation of this heard value. Kept when a streaming prefix has no completeness check. */
  confirming?: SayValue | null;
  /** Most words in the reply. */
  wordLimit: number;
  /** The child cannot see the board. */
  noBoard?: boolean;
  /** The act accepts the child's right answer (an affirmation is right then). */
  accepting?: boolean;
  /** The act ends the call: the reply asks nothing. */
  closing?: boolean;
  /** Maya goes on with no child turn after this reply (a step of the easier example): it asks nothing. */
  noQuestion?: boolean;
  /** A math turn: the reply must hold some math (a number or a place) or a question, never only praise. */
  needsSubstance?: boolean;
  /**
   * Round 4, P1-3: the steps the child has no credit for (and code's plan does not show): no sentence holds a step's
   * operands together with its result, in any wording.
   */
  openSteps?: readonly { operands: readonly SayValue[]; result: SayValue; place?: string; current?: boolean }[];
  /** Round 4, P1-3: the open answer's digits with their places ([2, "tens"], [4, "ones"]): never all said as places. */
  answerPlaces?: readonly [number, string][];
  /**
   * Round 4, P1-4: code's verdict on the child's turn. "wrong": no affirmation and no move to a later step; "none" (no
   * credit): no yes and no move to a later step; "right": no negation.
   */
  stance?: "wrong" | "none" | "right";
  /** The places of the steps after the current one ("tens"): a reply on a wrong or uncredited turn does not move there. */
  laterPlaces?: readonly string[];
}

export type SayVerdict =
  | { ok: true; sentences: string[] }
  | { ok: false; reason: SayReason; detail: string; sentence: number };

/** Most words in one sentence. */
export const SENTENCE_WORDS = 20;
/** Most sentences in one reply. */
export const SAY_SENTENCES = 3;
/** The usual word limit of a reply, and the limit of a reply that shows a step. */
export const SAY_WORDS = { normal: 30, show: 45, shorter: 25 } as const;

// ---------- Numbers ----------

const UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const DENOMINATORS: Record<string, number> = {
  half: 2, halves: 2, third: 3, thirds: 3, quarter: 4, quarters: 4, fourth: 4, fourths: 4, fifth: 5, fifths: 5, sixth: 6, sixths: 6,
  seventh: 7, sevenths: 7, eighth: 8, eighths: 8, ninth: 9, ninths: 9, tenth: 10, tenths: 10, twelfth: 12, twelfths: 12,
  sixteenth: 16, sixteenths: 16, hundredth: 100, hundredths: 100,
};
const PLACE_PLURAL = /^(?:ones|tens|hundreds|thousands)\b/;
const PLACE_SINGULAR = /^(?:ten|hundred|thousand)\b/;

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
function rational(n: number, d: number): [number, number] {
  if (d < 0) [n, d] = [-n, -d];
  const g = gcd(n, d) || 1;
  return [n / g, d / g];
}
function decimalValue(text: string): [number, number] {
  const [whole, part = ""] = text.split(".");
  const d = 10 ** part.length;
  return rational(Number(whole) * d + Number(part || "0"), d);
}

/** A value from a number. */
export const numberValue = (n: number): SayValue => {
  const q = Number.isInteger(n) ? rational(n, 1) : decimalValue(String(n));
  return { key: Number.isInteger(n) ? String(n) : String(n), q };
};
/** A value from a fraction. */
export const fractionValue = (n: number, d: number): SayValue => ({ key: `${n}/${d}`, q: rational(n, d) });
/** A value from a clock time. */
export const timeValue = (h: number, m: number): SayValue => ({ key: `${h}:${String(m).padStart(2, "0")}`, q: null });

/** The same value: the same exact number, or the same clock time. */
export const sameSayValue = (a: SayValue, b: SayValue) => (a.q && b.q ? a.q[0] === b.q[0] && a.q[1] === b.q[1] : a.key === b.key);
const within = (v: SayValue, list: readonly SayValue[]) => list.some((x) => sameSayValue(v, x));

interface WordNumber { value: number; at: number; end: number; words: string[] }

/** Number words in a row ("twenty four", "one hundred and five"), with where they are. */
function wordNumbers(text: string): WordNumber[] {
  const found: WordNumber[] = [];
  const re = /[a-z]+/gi;
  const words: { w: string; at: number; end: number }[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) words.push({ w: m[0].toLowerCase(), at: m.index, end: m.index + m[0].length });
  let i = 0;
  const unit = (w: string) => UNITS.indexOf(w);
  const ten = (w: string) => TENS.indexOf(w);
  while (i < words.length) {
    const start = i;
    let value = -1;
    const take = (): number => {
      // A number below 100: "twenty", "twenty four", "seven", "fifteen".
      const w = words[i]?.w;
      if (w === undefined) return -1;
      const t = ten(w);
      if (t >= 2) {
        i++;
        const next = words[i];
        if (next && unit(next.w) >= 1 && unit(next.w) <= 9 && text.slice(words[i - 1].end, next.at).match(/^[\s-]+$/)) {
          i++;
          return t * 10 + unit(next.w);
        }
        return t * 10;
      }
      const u = unit(w);
      if (u >= 0) {
        i++;
        return u;
      }
      return -1;
    };
    const first = take();
    if (first < 0) {
      i++;
      continue;
    }
    value = first;
    // "one hundred and five", "three thousand two hundred".
    while (words[i] && (words[i].w === "hundred" || words[i].w === "thousand")) {
      const scale = words[i].w === "hundred" ? 100 : 1000;
      // "a hundred" and "one hundred" said as a place ("trade one hundred for ten tens") stay a place word.
      const save = i;
      i++;
      value *= scale;
      if (words[i]?.w === "and") i++;
      const rest = take();
      if (rest >= 0) value += rest;
      else if (words[save + 1]?.w === "and") i = save + 1;
    }
    found.push({ value, at: words[start].at, end: words[i - 1].end, words: words.slice(start, i).map((x) => x.w) });
  }
  return found;
}

/** The numbers in a text: digits, decimals, fractions, clock times and number words, in order. */
export function sayNumbers(raw: string): SayToken[] {
  const text = raw.replace(/[−–]/g, "-").replace(/(\d),(?=\d{3}\b)/g, "$1");
  const tokens: SayToken[] = [];
  const taken: [number, number][] = [];
  const free = (at: number, end: number) => !taken.some(([a, b]) => at < b && end > a);
  const push = (t: SayToken) => {
    tokens.push(t);
    taken.push([t.at, t.end]);
  };
  for (const m of text.matchAll(/\b(\d{1,2}):(\d{2})\b/g)) push({ ...timeValue(Number(m[1]), Number(m[2])), at: m.index!, end: m.index! + m[0].length, text: m[0] });
  for (const m of text.matchAll(/\b(\d+)\s*\/\s*(\d+)\b/g)) if (free(m.index!, m.index! + m[0].length) && Number(m[2]) !== 0) push({ ...fractionValue(Number(m[1]), Number(m[2])), at: m.index!, end: m.index! + m[0].length, text: m[0] });
  for (const m of text.matchAll(/\b\d+\.\d+\b/g)) if (free(m.index!, m.index! + m[0].length)) push({ key: m[0], q: decimalValue(m[0]), at: m.index!, end: m.index! + m[0].length, text: m[0] });
  for (const m of text.matchAll(/\b\d+\b/g)) {
    const at = m.index!, end = at + m[0].length;
    if (!free(at, end)) continue;
    const after = text.slice(end).trimStart().toLowerCase();
    // "10 ones", "1 ten": a place said as a count, never a value (the regroup is the same for every question).
    if ((m[0] === "10" && PLACE_PLURAL.test(after)) || (m[0] === "1" && PLACE_SINGULAR.test(after))) continue;
    push({ key: String(Number(m[0])), q: rational(Number(m[0]), 1), at, end, text: m[0] });
  }
  for (const w of wordNumbers(text)) {
    if (!free(w.at, w.end)) continue;
    const after = text.slice(w.end).toLowerCase();
    const den = /^[\s-]+([a-z]+)/.exec(after);
    const denominator = den && Object.hasOwn(DENOMINATORS, den[1]) ? DENOMINATORS[den[1]] : undefined;
    if (denominator !== undefined) {
      const end = w.end + den![0].length;
      push({ ...fractionValue(w.value, denominator), at: w.at, end, text: text.slice(w.at, end) });
      continue;
    }
    const before = text.slice(0, w.at).toLowerCase();
    const placeAfter = after.trimStart();
    // Counting words: "one" alone ("this one", "one ten"), "ten ones", "a ten": they name a place, not a value.
    if (w.words.length === 1 && w.words[0] === "one") continue;
    if (w.words.length === 1 && w.words[0] === "ten" && (PLACE_PLURAL.test(placeAfter) || /\b(?:a|one|1|the|that|this)\s+$/.test(before))) continue;
    push({ key: String(w.value), q: rational(w.value, 1), at: w.at, end: w.end, text: text.slice(w.at, w.end) });
  }
  // "a half", "a quarter": one part.
  for (const m of text.toLowerCase().matchAll(/\ba\s+(half|third|quarter|fourth|fifth|sixth|eighth|tenth)\b/g)) {
    if (free(m.index!, m.index! + m[0].length)) push({ ...fractionValue(1, DENOMINATORS[m[1]]), at: m.index!, end: m.index! + m[0].length, text: m[0] });
  }
  return tokens.sort((a, b) => a.at - b.at);
}

/** The values in a text, to build an allowed set from code's own words. */
export const valuesOf = (text: string): SayValue[] => sayNumbers(text).map(({ key, q }) => ({ key, q }));

// ---------- Equations ----------

type Op = "+" | "-" | "*" | "/";
const OPS: [RegExp, Op][] = [
  [/^(?:\+|plus\b|add\b)/, "+"], [/^(?:take away\b|minus\b|subtract\b|-)/, "-"],
  [/^(?:times\b|multiplied by\b|x\b|\*)/, "*"], [/^(?:divided by\b|÷)/, "/"],
];
const NOT_EQUAL = /^(?:is not equal to\b|isn't equal to\b|does not equal\b|doesn't equal\b|does not make\b|doesn't make\b|is not\b|isn't\b|are not\b|aren't\b|≠)/;
const EQUAL = /^(?:is equal to\b|equals\b|equal to\b|equal\b|makes\b|make\b|gives\b|is\b|are\b|=)/;

/** An equation found in a sentence: its operands, operators, result, whether it says "not", and its result token. */
export interface SayEquation {
  operands: SayToken[];
  ops: Op[];
  result: SayToken;
  negated: boolean;
}

/** "a op b = c" with exact values, so the same equation in other words matches. */
export const equationKey = (e: Pick<SayEquation, "operands" | "ops" | "result">) =>
  `${e.operands.map((o) => o.key).join(` `)}|${e.ops.join("")}|${e.result.key}`;

/** The equations in one sentence: "12 - 8 = 4", "2 minus 8 isn't 6", "6 is 8 minus 2". */
export function equationsOf(sentence: string): SayEquation[] {
  const text = sentence.replace(/[−–]/g, "-").replace(/×/g, " x ").replace(/÷/g, " ÷ ");
  const tokens = sayNumbers(text).filter((t) => t.q !== null);
  // The stream: numbers, operators and relations, with "the" and "a" skipped; anything else breaks it.
  type Item = { kind: "n"; t: SayToken } | { kind: "op"; op: Op } | { kind: "rel"; negated: boolean } | { kind: "gap" };
  const items: Item[] = [];
  let at = 0;
  const lower = text.toLowerCase();
  for (const t of [...tokens, null]) {
    let between = lower.slice(at, t ? t.at : lower.length).replace(/[,]/g, " ");
    while (between.trim() !== "") {
      between = between.trimStart();
      const op = OPS.find(([re]) => re.test(between));
      const neg = NOT_EQUAL.exec(between);
      const eq = EQUAL.exec(between);
      if (neg) { items.push({ kind: "rel", negated: true }); between = between.slice(neg[0].length); continue; }
      if (eq) { items.push({ kind: "rel", negated: false }); between = between.slice(eq[0].length); continue; }
      if (op) { items.push({ kind: "op", op: op[1] }); between = between.slice(op[0].exec(between)![0].length); continue; }
      const word = /^(?:the|a|an|so)\b/.exec(between);
      if (word) { between = between.slice(word[0].length); continue; }
      items.push({ kind: "gap" });
      between = between.replace(/^\S+/, "");
    }
    if (t) items.push({ kind: "n", t });
    at = t ? t.end : lower.length;
  }
  const found: SayEquation[] = [];
  for (let i = 0; i < items.length; i++) {
    // expr rel n
    const expr = (from: number): { operands: SayToken[]; ops: Op[]; next: number } | null => {
      if (items[from]?.kind !== "n") return null;
      const operands = [(items[from] as { t: SayToken }).t];
      const ops: Op[] = [];
      let k = from + 1;
      while (items[k]?.kind === "op" && items[k + 1]?.kind === "n") {
        ops.push((items[k] as { op: Op }).op);
        operands.push((items[k + 1] as { t: SayToken }).t);
        k += 2;
      }
      return { operands, ops, next: k };
    };
    const left = expr(i);
    if (left && left.ops.length > 0 && items[left.next]?.kind === "rel" && items[left.next + 1]?.kind === "n") {
      found.push({ operands: left.operands, ops: left.ops, result: (items[left.next + 1] as { t: SayToken }).t, negated: (items[left.next] as { negated: boolean }).negated });
      i = left.next + 1;
      continue;
    }
    // n rel expr ("6 is 8 minus 2")
    if (items[i]?.kind === "n" && items[i + 1]?.kind === "rel") {
      const right = expr(i + 2);
      if (right && right.ops.length > 0) {
        found.push({ operands: right.operands, ops: right.ops, result: (items[i] as { t: SayToken }).t, negated: (items[i + 1] as { negated: boolean }).negated });
        i = right.next - 1;
      }
    }
  }
  return found;
}

/** The exact value of an equation's left side, with × and ÷ before + and -; null when it divides by zero. */
function evaluate(e: SayEquation): [number, number] | null {
  const vals = e.operands.map((o) => o.q!);
  const ops = [...e.ops];
  const mul = (a: [number, number], b: [number, number]) => rational(a[0] * b[0], a[1] * b[1]);
  const div = (a: [number, number], b: [number, number]) => (b[0] === 0 ? null : rational(a[0] * b[1], a[1] * b[0]));
  const terms: [number, number][] = [vals[0]];
  const signs: Op[] = [];
  for (let k = 0; k < ops.length; k++) {
    if (ops[k] === "*" || ops[k] === "/") {
      const r = ops[k] === "*" ? mul(terms[terms.length - 1], vals[k + 1]) : div(terms[terms.length - 1], vals[k + 1]);
      if (!r) return null;
      terms[terms.length - 1] = r;
    } else {
      signs.push(ops[k]);
      terms.push(vals[k + 1]);
    }
  }
  let acc = terms[0];
  for (let k = 0; k < signs.length; k++) {
    const b = terms[k + 1];
    acc = rational(signs[k] === "+" ? acc[0] * b[1] + b[0] * acc[1] : acc[0] * b[1] - b[0] * acc[1], acc[1] * b[1]);
  }
  return acc;
}

/** Whether an equation is true (its left side equals its result). */
export function equationHolds(e: SayEquation): boolean | null {
  const v = evaluate(e);
  if (!v || !e.result.q) return null;
  return v[0] === e.result.q[0] && v[1] === e.result.q[1];
}

/** The equations in code's own words, as keys (for SayRules.shownEquations). */
export const equationKeysOf = (text: string): string[] => sentencesOf(text).flatMap((x) => equationsOf(x).filter((e) => !e.negated && equationHolds(e)).map(equationKey));

// ---------- Sentences and words ----------

/** The sentences of a reply, trimmed, in order. A decimal point or a time does not end a sentence. */
export function sentencesOf(text: string): string[] {
  return text.trim().split(/(?<=[.?!]["')\]]*)\s+(?=\S)/).map((x) => x.trim()).filter(Boolean);
}

const wordsIn = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));

/** Long words a young child may still hear: the math words of the lessons. */
const LONG_OK = new Set(["multiplication", "multiplications", "multiplying", "subtraction", "regrouping", "hundredths", "thousandths", "denominator", "denominators", "numerator", "numerators"]);

const HYPE = /\b(?:amazing|awesome|fantastic|incredible|genius|superstar|brilliant|smartest|hooray|yay|woo-?hoo|wonderful|excellent|outstanding|spectacular|perfect!)|!{2,}/i;

/** Never-say patterns code can catch on its own; the review (talk-review.ts) reads the rest on non-math turns. */
const NEVER: [RegExp, string][] = [
  [/\b(?:i can see|i see your|i saw your|i'?m looking at your|looking at your (?:paper|work|page|book))\b/i, "claims to see the child or the paper"],
  [/\b(?:i promise|i'?ll always|i will always|we'?ll talk (?:again|tomorrow|soon)|see you (?:tomorrow|next|soon)|i'?ll remember|i will remember)\b/i, "a promise"],
  [/\b(?:between (?:you and me|us)|i won'?t tell|i will not tell|our (?:little )?secret|(?<!can't |cannot |can not )keep (?:it|this|that|your secret) (?:a )?secret)\b/i, "secrecy"],
  [/\b(?:where do you live|what(?:'s| is) your (?:address|last name|full name|phone|school|teacher'?s name|mom'?s name|dad'?s name)|what school|how old are you|when is your birthday|are you (?:home )?alone)\b/i, "a personal question"],
  [/\b(?:stupid|dumb|idiot|lazy|silly mistake)\b/i, "unkind words"],
  [/\b(?<!not )(?:i'?m|i am) (?:a )?(?:real|human)(?: person)?\b/i, "untrue about Maya"],
  [/\b(?:other kids|other children|lots of kids|most kids|many kids)\b/i, "other children"],
  [/\byour (?:mom|mum|dad|parents?|teacher) (?:will|would|must|is going to)\b/i, "a claim about the child's family"],
  [/\b(?:grammar|grammatical|correct english|proper english)\b/i, "a grammar correction"],
];
/** A word of the math itself: a place, a step or an operation. */
export const MATH_WORD = /\b(?:ones|tens|hundreds|thousands|column|columns|digit|digits|regroup\w*|carr(?:y|ied)|plus|minus|times|divided|equals|subtract\w*|add\w*|multiply\w*|fraction\w*|numerator|denominator|ten|answer|example)\b/i;
const AFFIRM = /^(?:yes|yep|yeah|right|correct|exactly|that'?s (?:right|correct|it)|good job|well done|nice)\b/i;

// ---------- Leaks and stance (round 4) ----------

/** A step's operands and its result in one sentence, whatever words join them ("4 take away 2 leaves 2"). */
function stepLeak(tokens: readonly SayToken[], step: { operands: readonly SayValue[]; result: SayValue }): boolean {
  const need = [...step.operands, step.result];
  const pool = [...tokens];
  for (const v of need) {
    const at = pool.findIndex((t) => sameSayValue(t, v));
    if (at === -1) return false;
    pool.splice(at, 1);
  }
  return true;
}

const PLACES = "ones|tens|hundreds|thousands|one|ten|hundred|thousand";
/** The digits a sentence names with a place ("2 tens", "4 in the ones"), as [digit, place in the plural]. */
function placed(text: string): [number, string][] {
  const out: [number, string][] = [];
  const plural = (p: string) => (p.endsWith("s") ? p : `${p}s`);
  for (const m of text.toLowerCase().matchAll(new RegExp(`\\b(\\d+|zero|one|two|three|four|five|six|seven|eight|nine)\\s+(?:(?:is|are)\\s+)?(?:(?:in|into|for|as)\\s+(?:the\\s+)?)?(${PLACES})\\b`, "g"))) {
    const n = /\d/.test(m[1]) ? Number(m[1]) : ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"].indexOf(m[1]);
    out.push([n, plural(m[2])]);
  }
  for (const m of text.toLowerCase().matchAll(new RegExp(`\\b(${PLACES})\\s*(?:(?:is|are|equals|gets|has)\\s+|:\\s*)(\\d+|zero|one|two|three|four|five|six|seven|eight|nine)\\b`, "g"))) {
    const n = /\d/.test(m[2]) ? Number(m[2]) : ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"].indexOf(m[2]);
    out.push([n, plural(m[1])]);
  }
  return out;
}

/** Literal values, including "one" when it is not part of a larger number or fraction. */
function literalValues(text: string): SayToken[] {
  const tokens = sayNumbers(text);
  const words = wordNumbers(text).filter((word) => !tokens.some((token) => token.at < word.end && token.end > word.at))
    .map((word) => ({ ...numberValue(word.value), at: word.at, end: word.end, text: text.slice(word.at, word.end) }));
  return [...tokens, ...words].sort((a, b) => a.at - b.at);
}

/** A whole question about the step's operands, with no supplied result or writing instruction. */
function operandQuestion(text: string, values: readonly SayToken[], operands: readonly SayValue[]): boolean {
  const start = /^\s*(?:(?:(?:now|next|in|for)\s+)?(?:the\s+)?(?:ones|tens|hundreds|thousands)[:,]\s*)?what\s+(?:is|are)\s+/i.exec(text);
  if (!start || values.length < 2 || values.length !== operands.length || text.slice(start[0].length, values[0].at).trim()) return false;
  for (let i = 1; i < values.length; i++) {
    if (!/^\s*(?:plus|minus|times|divided by|take away|[+×÷−-])\s*$/i.test(text.slice(values[i - 1].end, values[i].at))) return false;
  }
  if (!/^\s*(?:(?:in|for)\s+(?:the\s+)?(?:ones|tens|hundreds|thousands))?\s*\?\s*$/i.test(text.slice(values.at(-1)!.end))) return false;
  const remaining = [...values];
  for (const value of operands) {
    const at = remaining.findIndex((candidate) => sameSayValue(candidate, value));
    if (at === -1) return false;
    remaining.splice(at, 1);
  }
  return true;
}

/** Words that mark an answer right or a step done. */
export const AFFIRM_WORDS = /\b(?:yes|yep|yeah|right|correct|exactly|perfect|done|you got|got it|that'?s it)\b|\b(?:nice|good|great|well)\s+(?:work|job|thinking|done)\b/i;
/** A yes at the start of a reply on a turn with no credit ("Yes, let's start" is still fine). */
const AFFIRM_START = /^(?:yes|yep|yeah|right|correct|exactly|perfect|that'?s it|you got)\b(?!,?\s+let'?s\b)/i;
/** Words that mark an answer wrong. */
export const NEGATE_WORDS = /\b(?:not quite|not yet|wrong|incorrect|try again|that'?s not|not right)\b|^no\b/i;
/** Praise whose stance code cannot read from words alone: on a wrong verdict, the review decides. */
export const PRAISE_WORDS = /\b(?:good|great|nice|well|awesome|smart|brilliant|wow|cool|lovely|super)\b/i;

/** The sentence moves on to a later place ("Now the tens.", "What do you do in the tens?"). */
function movesTo(text: string, places: readonly string[]): boolean {
  if (places.length === 0) return false;
  const p = places.join("|");
  return new RegExp(`\\b(?:now|next|move (?:on )?to|on to|let'?s do|go to|over to)\\b[^.?!]*\\b(?:${p})\\b`, "i").test(text) ||
    (/\?\s*$/.test(text) && new RegExp(`\\b(?:${p})\\b`, "i").test(text));
}

// ---------- The checks ----------

/** The checks of one sentence (numbers, equations, words, patterns). `index` is its place in the reply. */
export function checkSentence(sentence: string, rules: SayRules, index = 0): SayVerdict {
  const no = (reason: SayReason, detail: string): SayVerdict => ({ ok: false, reason, detail, sentence: index });
  const text = sentence.replace(/[’]/g, "'");
  if (wordsIn(text).length > SENTENCE_WORDS) return no("long_sentence", `A sentence has more than ${SENTENCE_WORDS} words: "${sentence}"`);
  const feeling = feelingClaim(text);
  if (feeling) return no("never_say", `Maya claims a feeling ("${feeling}"): she is an AI helper.`);
  for (const [re, what] of NEVER) if (re.test(text)) return no("never_say", `${what}: "${sentence}"`);
  if (HYPE.test(text)) return no("hype", `Stay calm, with no hype words: "${sentence}"`);
  const plain = plainLanguageProblem(text);
  if (plain) return no("hard_words", `${plain}: use the plain words of the workbook.`);
  const long = wordsIn(text).map((w) => w.replace(/[^\p{L}]/gu, "").toLowerCase()).find((w) => w.length > 12 && !LONG_OK.has(w));
  if (long) return no("hard_words", `"${long}" is a hard word for a young child.`);
  if (rules.noIntro && /\b(?:i'?m maya|i am maya|my name is maya)\b|\bwe'?re doing\b.*\btoday\b|\bwhere do you want to start\b/i.test(text)) {
    return no("reintroduces", "The opening already said who Maya is and the question: answer what the child said instead.");
  }
  if (rules.noBoard && /\b(?:board|look|watch|see|show me|follow along)\b/i.test(text)) return no("board_words", "The child cannot see the board: use spoken words only.");
  const question = /\?\s*$/.test(text);
  // Equations first: a false one fails; one that says a hidden value must be code's own.
  const equations = equationsOf(text);
  for (const e of equations) {
    const holds = equationHolds(e);
    if (!question && holds === false && !e.negated) return no("false_equation", `"${sentence}" says a false equation.`);
    if (!question && holds === true && e.negated) return no("false_equation", `"${sentence}" calls a true equation false.`);
    const hidden = within(e.result, rules.answer) || within(e.result, rules.forbidden);
    if (!e.negated && (rules.hidden ?? []).includes(equationKey(e)) && !rules.shownEquations.includes(equationKey(e))) {
      return no("reveals_step", `"${sentence}" works out a step the child has not done: never say its result.`);
    }
    if (hidden && !e.negated && !rules.shownEquations.includes(equationKey(e))) {
      return no(within(e.result, rules.answer) ? "reveals_answer" : "reveals_step", `"${e.result.text}" is a value the child has not found yet: never say it.`);
    }
  }
  const claims = /\b(?:answer|result|equals|makes|gives|you get|you got|it'?s)\b|=/i.test(text);
  // Round 4, P1-3: an open step's operands with its result, in any words; the open answer's digits as places.
  const tokens = sayNumbers(text);
  if ((rules.openSteps ?? []).some((st) => stepLeak(tokens, st))) return no("reveals_step", `"${sentence}" works out a step the child has not done: never say its result.`);
  const places = placed(text);
  const literal = literalValues(text);
  for (const st of rules.openSteps ?? []) {
    if (!literal.some((value) => sameSayValue(value, st.result))) continue;
    if (!st.current && !(st.place && new RegExp(`\\b${st.place}\\b`, "i").test(text))) continue;
    const heard = rules.confirming ?? rules.mustAsk;
    const confirmation = heard && question && sameSayValue(heard, st.result) && literal.every((value) => sameSayValue(value, heard)) && /^(?:did you say|are you saying|do you mean)\b/i.test(text.trim());
    if (!confirmation && !operandQuestion(text, literal, st.operands)) {
      return no("reveals_step", `"${sentence}" states or assigns a result the child has not found yet. Ask only about the step's operands.`);
    }
  }
  if (rules.answerPlaces?.length && rules.answerPlaces.every(([d, p]) => places.some(([n, q]) => n === d && q === p))) {
    return no("reveals_answer", `"${sentence}" says the answer as its places: the child has not found it yet.`);
  }
  // Round 4, P1-4: the stance code's verdict sets.
  if ((rules.stance === "wrong" && AFFIRM_WORDS.test(text)) || (rules.stance === "none" && index === 0 && AFFIRM_START.test(text.trim()))) {
    return no("wrong_stance", "The child's answer is not right this turn: do not call it right or the step done.");
  }
  if ((rules.stance === "wrong" || rules.stance === "none") && movesTo(text, rules.laterPlaces ?? [])) {
    return no("wrong_stance", "The step is not done yet: stay on it, do not move to the next one.");
  }
  if (rules.stance === "right" && NEGATE_WORDS.test(text.trim())) return no("wrong_stance", "The child's answer is right this turn: do not say it is wrong.");
  for (const t of sayNumbers(text)) {
    if (within(t, rules.answer)) return no("reveals_answer", `"${t.text}" is the answer: the child has not found it yet.`);
    if (within(t, rules.forbidden) && !(within(t, rules.shown) && !claims)) return no("reveals_step", `"${t.text}" is the value of a step the child has not done: never say it.`);
    if (!within(t, rules.allowed) && !within(t, rules.shown)) return no("number_not_allowed", `"${t.text}" is not a number of this question or this turn: use only the numbers in the brief.`);
  }
  if (rules.wrong.length > 0 && !rules.accepting) {
    if (index === 0 && AFFIRM.test(text.trim())) return no("affirms_wrong", "The child's answer is not right: do not start with a yes.");
    const says = sayNumbers(text).some((t) => within(t, rules.wrong));
    if (says && /\b(?:is right|is correct|you got it|that's right|good job)\b/i.test(text) && !/\b(?:not|isn't|n't)\b/i.test(text)) return no("affirms_wrong", "Never call the child's wrong answer right.");
  }
  return { ok: true, sentences: [sentence] };
}

/** Every check of a whole reply: each sentence, then the limits across sentences. */
export function checkSay(say: string, rules: SayRules): SayVerdict {
  const sentences = sentencesOf(say);
  if (sentences.length === 0) return { ok: false, reason: "empty", detail: "Maya needs words for this turn.", sentence: 0 };
  if (sentences.length > SAY_SENTENCES) {
    return { ok: false, reason: "too_many_sentences", detail: `Say at most ${SAY_SENTENCES} sentences. This has ${sentences.length}: ${sentences.map((x, i) => `(${i + 1}) ${x}`).join(" ")} Drop one, or join two with a comma, and keep the question at the end.`, sentence: SAY_SENTENCES };
  }
  const words = wordsIn(say).length;
  if (words > rules.wordLimit) return { ok: false, reason: "too_long", detail: `Say at most ${rules.wordLimit} words (this has ${words}).`, sentence: sentences.length - 1 };
  for (const [i, x] of sentences.entries()) {
    const v = checkSentence(x, rules, i);
    if (!v.ok) return v;
  }
  const places = placed(say);
  if (rules.answerPlaces?.length && rules.answerPlaces.every(([d, p]) => places.some(([n, q]) => n === d && q === p))) {
    return { ok: false, reason: "reveals_answer", detail: "The reply says the open answer as its places across sentences.", sentence: sentences.length - 1 };
  }
  if (rules.closing && sentences.some((x) => /\?\s*$/.test(x) || /^(?:tell me|can you|could you|what|which|how)\b/i.test(x))) {
    return { ok: false, reason: "close_asks", detail: "This reply ends the call: say a short goodbye and ask nothing.", sentence: sentences.length - 1 };
  }
  if (rules.needsSubstance && !sentences.some((x) => /\?\s*$/.test(x) || MATH_WORD.test(x) || sayNumbers(x).length > 0)) {
    return { ok: false, reason: "empty_reply", detail: "Answer the child's math: say what is right or wrong about it, or ask about the step. Praise alone answers nothing.", sentence: 0 };
  }
  if (rules.noQuestion && sentences.some((x) => /\?\s*$/.test(x))) {
    return { ok: false, reason: "close_asks", detail: "Show this step of the easier example yourself, with its result: ask the child nothing until the example ends.", sentence: sentences.length - 1 };
  }
  if (rules.mustAsk && !sayNumbers(say).some((t) => sameSayValue(t, rules.mustAsk!))) {
    return { ok: false, reason: "missing_number", detail: `Ask if the child said ${rules.mustAsk.key}.`, sentence: 0 };
  }
  return { ok: true, sentences };
}

/**
 * A reply cut to the limits with no model call (D-341, round 2): the leading sentences that fit (at most SAY_SENTENCES,
 * at most `wordLimit` words, each sentence at most SENTENCE_WORDS words). When the first sentence alone breaks a limit,
 * the reply comes back as it was, and the check refuses it.
 */
export function trimSay(say: string, wordLimit: number): string {
  const sentences = sentencesOf(say);
  const kept: string[] = [];
  let words = 0;
  for (const x of sentences) {
    const n = wordsIn(x).length;
    if (kept.length >= SAY_SENTENCES || n > SENTENCE_WORDS || words + n > wordLimit) break;
    kept.push(x);
    words += n;
  }
  if (kept.length === 0) return say.trim();
  // The reply's closing question is what the child answers: when the reply is cut, the first sentence and the closing
  // question stay and the middle goes (round 3).
  const question = sentences.at(-1)!;
  const q = wordsIn(question).length;
  if (kept.length < sentences.length && /\?\s*$/.test(question) && q <= SENTENCE_WORDS && wordsIn(kept[0]).length + q <= wordLimit) {
    // A sentence that carries the correction ("2 minus 8 isn't 6.") stays beside them when it fits (round 4, P3-9).
    const correction = sentences.slice(1, -1).find((x) => /\b(?:not|isn't|aren't|no)\b|n't\b/i.test(x));
    const n = correction ? wordsIn(correction).length : 0;
    return [kept[0], ...(correction && wordsIn(kept[0]).length + n + q <= wordLimit && n <= SENTENCE_WORDS ? [correction] : []), question].join(" ");
  }
  return kept.join(" ");
}

/** A sentence that tells the child what to do now ("Try the tens.", "Tell me what 12 minus 8 is."). */
export const INSTRUCTION = /^(?:now\s+|so\s+|okay,?\s+|next,?\s+|please\s+|can you\s+)?(?:try|tell me|say|write|look at|take|find|work out|subtract|add|count|put|show me|let'?s (?:try|work|find|subtract|add|do|look))\b/i;

/**
 * A guiding reply ends with one clear question or instruction about the step (round 3). It names what it asks about (a
 * place, a number or the math), or the sentence before it does. Returns whether `text` already does.
 */
export function endsWithAsk(text: string, named = true): boolean {
  const xs = sentencesOf(text);
  const last = xs.at(-1);
  if (!last || !(/\?\s*$/.test(last) || INSTRUCTION.test(last))) return false;
  if (!named) return true;
  const names = (x: string | undefined) => !!x && (MATH_WORD.test(x) || sayNumbers(x).length > 0);
  return names(last) || names(xs.at(-2));
}
