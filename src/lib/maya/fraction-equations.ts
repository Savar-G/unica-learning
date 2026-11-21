// #959 (spec #1137, #1156): the child's own fraction working, checked exactly. A fraction call keeps spoken number
// words ("one and one eighth"), which the whole-number sum reader (falseEquationResults) cannot read, so a false sum of
// mixed numbers or a false compound scalar claim ("one hundred and two is one hundred and three") could hide behind a
// right final fraction. This reader finds each equation whose sides are plain number phrases and works it out with
// exact fractions. An equation it cannot read is left alone: it never judges a sum it does not understand.
import type { AnswerValue } from "@/lib/question-package";
import { readNumbers, type ReadOptions } from "./numbers";

type Q = [bigint, bigint];

const CARDINAL = /^(?:a|an|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)$/;
const PART = /^(?:half|halves|thirds?|fourths?|quarters?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?|elevenths?|twelfths?|thirteenths?|fourteenths?|fifteenths?|sixteenths?|seventeenths?|eighteenths?|nineteenths?|twentieths?|hundredths?)$/;
const NUMERAL = /^\d+(?:\/\d+)?$/;
const OPS: Record<string, "+" | "-" | "*"> = { plus: "+", "+": "+", minus: "-", "-": "-", "−": "-", times: "*", "×": "*" };
const RESULT = new Set(["is", "equals", "makes", "make", "gives", "="]);
/** Words right before a first operand that make it part of another operation ("groups of", "half of"). */
const BOUND_BEFORE = new Set(["of", "to", "from", "by", "and", "plus", "minus", "times", "add", "added", "take", "away", "than", "the", "those", "these", "all", "both", "my", "our"]);

const isNumberWord = (w: string) => CARDINAL.test(w) || PART.test(w) || NUMERAL.test(w) || w === "and";

function gcd(a: bigint, b: bigint): bigint {
  let [x, y] = [a < 0n ? -a : a, b < 0n ? -b : b];
  while (y) [x, y] = [y, x % y];
  return x || 1n;
}
const norm = ([n, d]: Q): Q => { const g = gcd(n, d); return [n / g, d / g]; };
const apply = (a: Q, op: "+" | "-" | "*", b: Q): Q =>
  norm(op === "*" ? [a[0] * b[0], a[1] * b[1]] : [a[0] * b[1] + (op === "+" ? 1n : -1n) * b[0] * a[1], a[1] * b[1]]);

function exact(v: AnswerValue): Q | null {
  if (v.type === "number") return Number.isSafeInteger(v.value) ? [BigInt(v.value), 1n] : null;
  if (v.type === "fraction" || v.type === "mixed") {
    const whole = v.type === "mixed" ? v.whole : 0;
    return v.denominator > 0 ? norm([BigInt(whole) * BigInt(v.denominator) + BigInt(v.numerator), BigInt(v.denominator)]) : null;
  }
  return null;
}

/** One number phrase as one exact value: "one and one eighth", "one hundred and two", "6/8"; "a and b" sums otherwise. */
function phraseValue(words: string[], options: ReadOptions): Q | null {
  const trimmed = words.join(" ").replace(/^(?:and\s+)+|(?:\s+and)+$/g, "").trim();
  if (!trimmed) return null;
  const read = readNumbers(trimmed, { ...options, fractions: true });
  if (!read.unreadable && read.values.length === 1) return exact(read.values[0]);
  // "three fourths and one eighth": two values joined by "and" are a sum, as the whole-number reader takes them.
  const parts = trimmed.split(/\s+and\s+/);
  if (parts.length < 2) return null;
  let total: Q = [0n, 1n];
  for (const part of parts) {
    const one = readNumbers(part, { ...options, fractions: true });
    if (one.unreadable || one.values.length !== 1) return null;
    const value = exact(one.values[0]);
    if (!value) return null;
    total = apply(total, "+", value);
  }
  return total;
}

/** The words of one clause, with a pause ("is... seven eighths") kept inside it. */
function clauses(text: string): string[][] {
  return text.toLowerCase().replace(/[’]/g, "'").replace(/\s*(?:\.{2,}|…)\s*/g, " ")
    .replace(/\bis\s+equal\s+to\b|\bequals?\s+to\b/g, " equals ").replace(/\btake\s+away\b/g, " minus ")
    .replace(/(\d)\s*([+=×−])\s*/g, "$1 $2 ").replace(/([+=×−])\s*(\d)/g, "$1 $2")
    .split(/[.!?;,:]+(?=\s|$)|[;,:]|\b(?:because|so|then|but)\b/)
    .map((clause) => clause.replace(/(?<=[a-z])-(?=[a-z])/g, " ").split(/[^a-z0-9/+=×−-]+/).filter(Boolean));
}

/** Each false equation in one clause: a chain of number phrases joined by operation words, then a result word. */
function falseIn(words: string[], options: ReadOptions): boolean {
  for (let r = 0; r < words.length; r++) {
    if (!RESULT.has(words[r])) continue;
    // The right side: the number phrase right after the result word, up to the next non-number word.
    let end = r + 1;
    while (end < words.length && isNumberWord(words[end])) end++;
    const right = phraseValue(words.slice(r + 1, end), options);
    if (!right) continue;
    // The left side: phrases between operation words, read back from the result word.
    const operands: string[][] = [];
    const ops: ("+" | "-" | "*")[] = [];
    let j = r - 1;
    let phrase: string[] = [];
    let readable = true;
    while (j >= 0) {
      const w = words[j];
      if (OPS[w]) {
        if (!phrase.length) { readable = false; break; }
        operands.unshift(phrase);
        ops.unshift(OPS[w]);
        phrase = [];
      } else if (isNumberWord(w)) phrase.unshift(w);
      else break;
      j--;
    }
    if (!readable || !phrase.length) continue;
    operands.unshift(phrase);
    // A first operand bound to words before it ("groups of one hundred and two") belongs to another operation.
    if (j >= 0 && (BOUND_BEFORE.has(words[j]) || OPS[words[j]])) continue;
    // A scalar claim stands only at the start of its clause ("one hundred and two is one hundred and three").
    if (!ops.length && j >= 0 && !/^(?:well|um|uh|and|okay|ok|yes|yeah|first|i|we|think|know|said)$/.test(words[j])) continue;
    if (ops.includes("*") && ops.some((op) => op !== "*")) continue;
    const values = operands.map((p) => phraseValue(p, options));
    if (values.some((v) => v === null)) continue;
    const truth = ops.reduce<Q>((acc, op, k) => apply(acc, op, values[k + 1]!), values[0]!);
    if (truth[0] * right[1] !== right[0] * truth[1]) return true;
  }
  return false;
}

/** The child's turn states a false equation of exact number phrases (a fraction call's own working, #959). */
export function hasFalseFractionWork(text: string, options: ReadOptions = {}): boolean {
  return clauses(text).some((words) => falseIn(words, options));
}
