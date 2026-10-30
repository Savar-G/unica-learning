// The number claims in what Maya says or writes (#321): every equation ("7 + 9 = 16", "seven plus nine is sixteen",
// "(7 + 9) × 2 = 32", "two tens plus three tens is five tens", "53 ÷ 2 = 26 R 1") and every other statement that gives
// a number a value ("the ones total is fifteen", "seven plus nine comes to fifteen", "7 + 9 > 20"). Code checks each
// claim completely, by exact rational arithmetic on the digits as written (never floating point). Given the checked
// numbers of the step a turn is about, every other number must be one of them ("Look at the 7"), and a number Maya
// tells the child to carry or to write must be that step's carry or written digit ("carry the 1", never "carry the
// 2"). A claim code cannot read completely is unsupported, and the session refuses it like a false one: no numeric
// statement passes unchecked. Pure TypeScript; it never throws.
import { kindOf, startsNewNumber, wordValue, type NumberWord } from "./numbers";

export type MathOp = "+" | "-" | "×" | "÷";

/** A problem Maya may name ("It is 27 plus 39."): its operation and its two numbers. */
export interface NamedProblem {
  symbol: MathOp;
  operands: readonly [number, number];
}

export interface MathClaim {
  /** The claim as written. */
  text: string;
  /** true: it holds by exact arithmetic; false: it does not; unsupported: code cannot check it. */
  status: "true" | "false" | "unsupported";
  /** The index of the named problem a side of the claim states exactly ("27 + 39"), or null. */
  problem: number | null;
  /** The claim gives a value for its expression ("27 + 39 = 66"), not only names it ("It is 27 plus 39"). */
  result: boolean;
}

/**
 * The checked numbers of the worked step a turn is about (#321): `known` are the numbers Maya may say outside a true
 * equation (the step's digits, carries and results, the question's numbers, what the child said); `carry` are the
 * values she may tell the child to carry, borrow or regroup; `write` the digits she may tell the child to write.
 */
export interface StepNumbers {
  known: readonly number[];
  carry: readonly number[];
  write: readonly number[];
  /** The problem's own unit words ("minutes" in "27 minutes + 39 minutes"): a number with one stays bound to the step. */
  units?: readonly string[];
  /**
   * The problem the turn is about, for amounts of money (see stepClaims): its question text, its operands and its
   * answers. Absent: no amount of money is supported.
   */
  money?: { text: string; operands: readonly number[]; results: readonly number[] };
  /**
   * The question text of the problem the turn is about: a sentence that is an unchanged clause of it is not a claim
   * (see restated).
   */
  questions?: readonly string[];
  /**
   * The operation of the problem the turn is about: every operation word Maya says must be one of its words, or of the
   * problem a sentence names ("In 18 + 5, add the ones."). See operationClaims.
   */
  operation?: MathOp;
}

/** An exact rational [numerator, denominator], denominator above 0. */
type Ratio = [bigint, bigint];

// ---------- Tokens ----------

type Tok =
  | { t: "num"; v: Ratio; whole: boolean }
  | { t: "unit"; v: Ratio }
  | { t: "op"; op: MathOp; unaryOnly?: boolean }
  | { t: "eq" }
  | { t: "lp" }
  | { t: "rp" }
  | { t: "rem" }
  /** A math form code does not read: "²", "%", "half", "squared". */
  | { t: "sym" }
  /** An amount named by a word, with no number code reads: "a quarter", "a loonie", "half a dollar", "a five-dollar bill". */
  | { t: "amount" }
  /** A relation other than "equals": "\u2192", ">", "isn't". */
  | { t: "rel" }
  | { t: "word"; w: string }
  /** A comma, colon, quote or dash: it ends a claim, not the sentence. */
  | { t: "soft" }
  | { t: "end"; question: boolean };
type Spanned = Tok & { from: number; to: number };

const ONE = BigInt(1);
const ZERO = BigInt(0);
const TEN = BigInt(10);
const HUNDRED = BigInt(100);
const THOUSAND = BigInt(1000);

// Every word table is a Map or a Set: a word such as "constructor" must never reach an inherited property.
/** Place-value words after a number: "two tens" is 20, "five tenths" is 1/2. */
const PLACES = new Map<string, Ratio>([
  ["ones", [ONE, ONE]], ["tens", [TEN, ONE]], ["hundreds", [HUNDRED, ONE]], ["thousands", [THOUSAND, ONE]],
  ["tenth", [ONE, TEN]], ["tenths", [ONE, TEN]], ["hundredth", [ONE, HUNDRED]], ["hundredths", [ONE, HUNDRED]], ["thousandth", [ONE, THOUSAND]], ["thousandths", [ONE, THOUSAND]],
]);
/**
 * Coins and notes: a word that is an amount on its own ("a quarter", "two dimes"). A money word that is a unit ("dollar",
 * "cent", "buck") is an amount when no number comes just before it ("a dollar", "half a dollar"); after a number ("65
 * dollars") the number is bound to the step.
 */
const COINS = /^(?:quarters?|dimes?|nickels?|penny|pennies|loonies?|toonies?|bills?|notes?|coins?)$/;
const MONEY_UNITS = /^(?:dollars?|bucks?|cents?|cad)$/;
const UNREAD = /^(?:halfs?|halves|thirds?|quarters?|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?|squared|cubed|percent|power|root|dozens?|twice|double|triple)$/;
const EQUALS = new Set(["is", "are", "was", "were", "equals", "equal", "makes", "make", "gives", "give", "gets", "get", "totals", "total", "leaves", "leave", "that's", "it's"]);
const RELATIONS = new Set(["isn't", "aren't", "wasn't", "weren't", "doesn't", "don't", "didn't"]);
const OPS = new Map<string, MathOp>([["plus", "+"], ["minus", "-"], ["times", "×"]]);
/** Two-word operations and equals words. */
const PAIRS = new Map<string, Tok>([
  ["multiplied by", { t: "op", op: "×" }], ["divided by", { t: "op", op: "÷" }], ["take away", { t: "op", op: "-" }],
  ...["comes to", "come to", "adds to", "add to", "sums to", "equal to", "equals to"].map((w): [string, Tok] => [w, { t: "eq" }]),
]);
/** Words that may come just before a claim without changing what it says. */
const LEAD = new Set(["so", "and", "now", "then", "yes", "sorry", "because", "since", "remember", "well", "okay", "ok", "oh", "see", "great", "good", "right", "correct", "also", "first", "next", "means", "that", "here", "look", "but", "or"]);
/** Words that may come just after a claim without changing what it says. */
const TRAIL = new Set(["so", "and", "then", "now", "because", "right", "too", "again", "yes", "ok", "okay", "see", "but", "which", "since"]);
/** A longer run of math is unsupported, which also bounds the arithmetic and the parse depth. */
const MAX_RUN = 200;
const MAX_DEPTH = 32;

const RAW = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+|\p{L}+(?:['\u2019]\p{L}+)*|\n|[^\S\n]+|./gu;

/** A written decimal ("1,234.50", ".85") as an exact ratio. */
function decimal(text: string): Ratio {
  const [whole, frac = ""] = text.replace(/,/g, "").split(".");
  return [BigInt((whole || "0") + frac), TEN ** BigInt(frac.length)];
}

function charToken(c: string): Tok {
  if (c === "+") return { t: "op", op: "+" };
  if (/[-−‒–﹣－]/.test(c)) return { t: "op", op: "-" };
  if (/[×*·⋅]/.test(c)) return { t: "op", op: "×" };
  if (c === "÷" || c === "/") return { t: "op", op: "÷" };
  if (c === "=") return { t: "eq" };
  if (c === "(") return { t: "lp" };
  if (c === ")") return { t: "rp" };
  if (c === "?") return { t: "end", question: true };
  if (/[.!;\n\u2026]/.test(c)) return { t: "end", question: false };
  if (/[<>~←-⇿≈≠≤≥≪≫]/.test(c)) return { t: "rel" };
  if (/[,:"'\u2018\u2019\u201C\u201D\u2014]/.test(c) || /\p{Extended_Pictographic}/u.test(c)) return { t: "soft" };
  return { t: "sym" };
}

interface Piece {
  s: string;
  /** The lowercase word, or null for a number or a sign. */
  w: string | null;
  from: number;
  to: number;
}

/** Number words from piece i: "sixty six" is 66, "two hundred and five" is 205, "point eight five" is 0.85. */
function numberWords(p: Piece[], i: number): { v: Ratio; whole: boolean; next: number } {
  const kind = (k: number) => (p[k]?.w ? kindOf(p[k].w!) : null);
  let total = ZERO;
  let current = ZERO;
  let last: NumberWord | null = null;
  let j = i;
  let decimals = "";
  while (j < p.length) {
    const word = p[j].w;
    const k = kind(j);
    if (k === null) {
      if (word === "and" && (last === "hundred" || last === "thousand") && ["unit", "teen", "ten"].includes(kind(j + 1) ?? "")) { j++; continue; }
      if (word === "point" && kind(j + 1) === "unit") {
        for (j++; kind(j) === "unit"; j++) decimals += String(wordValue(p[j].w!)!);
      }
      break;
    }
    // "one thousand hundred" is no number: a hundred follows a smaller number, a thousand does not repeat.
    if (startsNewNumber(last, k) || (k === "hundred" && (last === "hundred" || last === "thousand")) || (k === "thousand" && last === "thousand")) break;
    if (k === "hundred") current = (last === null ? ONE : current) * HUNDRED;
    else if (k === "thousand") { total += (last === null ? ONE : current) * THOUSAND; current = ZERO; }
    else current += BigInt(wordValue(word!)!);
    last = k;
    j++;
  }
  const whole = total + current;
  const scale = TEN ** BigInt(decimals.length);
  return { v: [whole * scale + (decimals ? BigInt(decimals) : ZERO), scale], whole: decimals === "", next: j };
}

/** The tokens of a text, with number words joined into numbers. */
function tokenize(text: string): Spanned[] {
  // A hyphen between letters joins a number word ("sixty-six"); the text keeps its length, so spans stay exact.
  const plain = text.replace(/(\p{L})-(?=\p{L})/gu, "$1 ");
  const p: Piece[] = [];
  for (const m of plain.matchAll(RAW)) {
    if (/^[^\S\n]+$/.test(m[0])) continue;
    p.push({ s: m[0], w: /^\p{L}/u.test(m[0]) ? m[0].toLowerCase().replace(/\u2019/g, "'") : null, from: m.index, to: m.index + m[0].length });
  }
  const out: Spanned[] = [];
  for (let i = 0; i < p.length; i++) {
    const { s, w, from, to } = p[i];
    const prev = out[out.length - 1];
    const add = (tok: Tok, end = to) => out.push({ ...tok, from, to: end });
    if (w === null) {
      if (/\d/.test(s)) {
        const v = decimal(s);
        add({ t: "num", v, whole: v[1] === ONE });
      } else add(charToken(s));
      continue;
    }
    // A place-value "ten" right after a small number: "one ten", "carry 1 ten".
    if (w === "ten" && prev?.t === "num" && prev.whole && prev.v[0] < TEN) { add({ t: "unit", v: [TEN, ONE] }); continue; }
    // "point" next to a number it does not join ("one point sixty-six", "66 point 0"): a form code does not read.
    const nextIsNumber = /^\d/.test(p[i + 1]?.s ?? "") || kindOf(p[i + 1]?.w ?? "") !== null;
    if (w === "point" && kindOf(p[i + 1]?.w ?? "") !== "unit" && (prev?.t === "num" || nextIsNumber)) { add({ t: "sym" }); continue; }
    if (kindOf(w) !== null || (w === "point" && kindOf(p[i + 1]?.w ?? "") === "unit")) {
      const { v, whole, next } = numberWords(p, i);
      add({ t: "num", v, whole }, p[next - 1].to);
      i = next - 1;
      continue;
    }
    // One "equals" for "is equal to", "equals", "adds up to".
    const equals = (end: number) => (prev?.t === "eq" ? (prev.to = end) : add({ t: "eq" }, end));
    const pair = PAIRS.get(`${w} ${p[i + 1]?.w ?? ""}`);
    if (pair) { if (pair.t === "eq") equals(p[i + 1].to); else add(pair, p[i + 1].to); i++; continue; }
    if (w === "adds" && p[i + 1]?.w === "up" && p[i + 2]?.w === "to") { equals(p[i + 2].to); i += 2; continue; }
    if (EQUALS.has(w)) { equals(to); continue; }
    const place = PLACES.get(w);
    const op = OPS.get(w);
    if (place) add({ t: "unit", v: place });
    else if (COINS.test(w) || (MONEY_UNITS.test(w) && prev?.t !== "num")) add({ t: "amount" });
    else if (UNREAD.test(w)) add({ t: "sym" });
    else if (RELATIONS.has(w)) add({ t: "rel" });
    else if (op) add({ t: "op", op });
    else if (w === "negative") add({ t: "op", op: "-", unaryOnly: true });
    else add({ t: "word", w });
  }
  // Words that are math only between numbers: "6 x 4", "3 over 4", "26 R 1", "6 tens and 6 ones".
  const isValue = (x?: Tok) => x?.t === "num" || x?.t === "unit" || x?.t === "rp";
  for (let i = 0; i < out.length; i++) {
    const x = out[i];
    if (x.t !== "word") continue;
    const [before, after] = [out[i - 1], out[i + 1]];
    const at = { from: x.from, to: x.to };
    if ((x.w === "x" || x.w === "over") && isValue(before) && (after?.t === "num" || after?.t === "lp")) out[i] = { t: "op", op: x.w === "x" ? "×" : "÷", ...at };
    else if ((x.w === "r" || x.w === "remainder") && before?.t === "num" && after?.t === "num") out[i] = { t: "rem", ...at };
    else if (x.w === "and" && before?.t === "unit" && after?.t === "num" && out[i + 2]?.t === "unit") out[i] = { t: "op", op: "+", ...at };
  }
  return out;
}

// ---------- Parsing one side of a claim ----------

type Expr = { k: "num"; v: Ratio; plain: boolean; whole: boolean } | { k: "neg"; e: Expr } | { k: "bin"; op: MathOp; l: Expr; r: Expr };
type Read = { k: "value"; v: Ratio; e: Expr } | { k: "rem"; q: bigint; r: bigint };
type Side = { k: "empty" } | { k: "fail" } | Read;

function parseSide(toks: Tok[]): Side {
  if (toks.length === 0) return { k: "empty" };
  const [a, mark, b] = toks;
  if (toks.length === 3 && a.t === "num" && mark.t === "rem" && b.t === "num" && a.whole && b.whole) return { k: "rem", q: a.v[0], r: b.v[0] };
  let i = 0;
  const binary = (ops: MathOp[]): MathOp | null => {
    const x = toks[i];
    if (x?.t !== "op" || x.unaryOnly || !ops.includes(x.op)) return null;
    i++;
    return x.op;
  };
  const chain = (next: (depth: number) => Expr | null, ops: MathOp[]) => (depth: number): Expr | null => {
    let l = next(depth);
    for (let op = binary(ops); l && op; op = binary(ops)) {
      const r = next(depth);
      l = r && { k: "bin", op, l, r };
    }
    return l;
  };
  const factor = (depth: number): Expr | null => {
    const x = toks[i];
    if (depth > MAX_DEPTH || !x) return null;
    i++;
    if (x.t === "op" && x.op === "-") {
      const e = factor(depth + 1);
      return e && { k: "neg", e };
    }
    if (x.t === "lp") {
      const e = expr(depth + 1);
      if (!e || toks[i]?.t !== "rp") return null;
      i++;
      return e;
    }
    if (x.t !== "num") return null;
    const unit = toks[i];
    if (unit?.t !== "unit") return { k: "num", v: x.v, plain: true, whole: x.whole };
    i++;
    return { k: "num", v: [x.v[0] * unit.v[0], x.v[1] * unit.v[1]], plain: false, whole: false };
  };
  const expr = chain(chain(factor, ["×", "÷"]), ["+", "-"]);
  const e = expr(0);
  const v = e && i === toks.length ? evaluate(e) : null;
  return e && v ? { k: "value", v, e } : { k: "fail" };
}

/** An expression's exact value, or null for a division by zero. Its depth is bounded by MAX_RUN. */
function evaluate(e: Expr): Ratio | null {
  if (e.k === "num") return e.v;
  if (e.k === "neg") {
    const v = evaluate(e.e);
    return v && [-v[0], v[1]];
  }
  const [l, r] = [evaluate(e.l), evaluate(e.r)];
  if (!l || !r) return null;
  switch (e.op) {
    case "+": return [l[0] * r[1] + r[0] * l[1], l[1] * r[1]];
    case "-": return [l[0] * r[1] - r[0] * l[1], l[1] * r[1]];
    case "×": return [l[0] * r[0], l[1] * r[1]];
    case "÷": {
      if (r[0] === ZERO) return null;
      const [n, d] = [l[0] * r[1], l[1] * r[0]];
      return d < ZERO ? [-n, -d] : [n, d];
    }
  }
}

const same = (a: Ratio, b: Ratio) => a[0] * b[1] === b[0] * a[1];

/** A number from the question package as an exact ratio, or null when it is not a plain decimal. */
function ratioOf(n: number): Ratio | null {
  if (!Number.isFinite(n) || /e/i.test(String(n))) return null;
  const [num, den] = decimal(String(Math.abs(n)));
  return [n < 0 ? -num : num, den];
}

/** The side states a named problem exactly: its operation on its two plain numbers (either order for + and ×). */
function problemOf(side: Side, problems: readonly NamedProblem[]): number | null {
  if (side.k !== "value" || side.e.k !== "bin") return null;
  const { op, l, r } = side.e;
  if (l.k !== "num" || r.k !== "num" || !l.plain || !r.plain) return null;
  const index = problems.findIndex((p) => {
    const [a, b] = p.operands.map(ratioOf);
    if (p.symbol !== op || !a || !b) return false;
    return (same(l.v, a) && same(r.v, b)) || ((op === "+" || op === "×") && same(l.v, b) && same(r.v, a));
  });
  return index === -1 ? null : index;
}

/** A remainder side "q R r" against "a ÷ b": b × q + r = a, with 0 ≤ r < b, all whole numbers. */
function remainderHolds(rem: { q: bigint; r: bigint }, other: Read): boolean {
  if (other.k !== "value" || other.e.k !== "bin" || other.e.op !== "÷") return false;
  const { l, r } = other.e;
  if (l.k !== "num" || r.k !== "num" || !l.whole || !r.whole) return false;
  const [a, b] = [l.v[0], r.v[0]];
  return b > ZERO && rem.r >= ZERO && rem.r < b && b * rem.q + rem.r === a;
}

/** Whether the read sides agree: all equal, or one remainder against its division. Null when code cannot tell. */
function agrees(read: Read[]): boolean | null {
  const rem = read.find((s) => s.k === "rem");
  if (rem) return read.length === 2 ? remainderHolds(rem, read.find((s) => s !== rem)!) : null;
  const values = read.flatMap((s) => (s.k === "value" ? [s.v] : []));
  return values.every((v) => same(v, values[0]));
}

// ---------- Claims ----------

const MATH: ReadonlySet<Tok["t"]> = new Set(["num", "unit", "op", "eq", "lp", "rp", "rem", "sym", "rel", "amount"]);
const isNumber = (x: Tok) => x.t === "num" || x.t === "unit" || x.t === "sym" || x.t === "amount";

/**
 * Every number claim in a text, in order. A run of math with an "equals" in it ("=", "is", "makes", "comes to") must
 * read completely in a statement: every side a full expression, every side equal, and only neutral words around it.
 * A question ("What is seven plus nine?") is a claim only when two of its sides read, and then they must be equal; a
 * question that offers a value after its "equals" ("7 + 9 = bananas 15?", "Seven plus nine is, fifteen?") is
 * unsupported. A relation other than "equals" ("7 + 9 > 15", "isn't"), a form code does not read next to a number
 * ("one point sixty-six"), and a statement that names an operation and then a number with no "equals" ("seven plus
 * nine, then fifteen") are unsupported. A statement may name a problem ("It is 27 plus 39") only when it is one of
 * `problems`. With `step`, every number outside a true claim is bound to the step's checked numbers (StepNumbers): a
 * wrong carry or written digit is false, any other number not among them is unsupported.
 */
export function mathClaims(text: string, problems: readonly NamedProblem[] = [], step?: StepNumbers): MathClaim[] {
  if (typeof text !== "string") return [];
  const toks = tokenize(text);
  // The end of the sentence each token is in (its index, or the token count when the text has no end).
  const sentenceEnd: number[] = new Array(toks.length);
  for (let k = toks.length - 1, end = toks.length; k >= 0; k--) {
    if (toks[k].t === "end") end = k;
    sentenceEnd[k] = end;
  }
  // A number comes after each token in the same sentence.
  const numberAfter: boolean[] = new Array(toks.length);
  for (let k = toks.length - 1, seen = false; k >= 0; k--) {
    if (toks[k].t === "end") seen = false;
    numberAfter[k] = seen;
    if (toks[k].t === "num") seen = true;
  }
  const claims: MathClaim[] = [];
  /** The problem each sentence names, by the index of its end: "In 18 + 5, ..." is about the easier example. */
  const names = new Map<number, number>();
  // The tokens of a claim: its numbers are checked by the claim itself, not by the step.
  const claimed: boolean[] = new Array(toks.length).fill(false);
  // A number that counts something outside the math ("two steps", "2 seconds") is talk, not part of a claim; a
  // sentence that restates the question ("Sam has 27 dollars and gets 39 dollars.") is no claim at all.
  const counts = toks.map((_, k) => quantityNoun(toks, k) !== null);
  const restates = restated(text, toks, step?.questions ?? []);
  restates.forEach((r, k) => { if (r) claimed[k] = true; });
  const isMath = (k: number) => MATH.has(toks[k].t) && !counts[k] && !restates[k];
  for (let i = 0; i < toks.length; i++) {
    if (!isMath(i)) continue;
    let j = i;
    while (j + 1 < toks.length && isMath(j + 1)) j++;
    const run = toks.slice(i, j + 1);
    const [before, after, stop] = [toks[i - 1], toks[j + 1], toks[sentenceEnd[j]]];
    const question = stop?.t === "end" && stop.question;
    const start = i;
    i = j;
    if (!run.some(isNumber)) continue;
    const sides: Side[] = [];
    if (run.length <= MAX_RUN) {
      let part: Tok[] = [];
      for (const x of run) if (x.t === "eq") { sides.push(parseSide(part)); part = []; } else part.push(x);
      sides.push(parseSide(part));
    }
    const read = sides.filter((s): s is Read => s.k === "value" || s.k === "rem");
    const found = sides.map((s) => problemOf(s, problems)).find((p) => p !== null) ?? null;
    if (found !== null) names.set(sentenceEnd[j], found);
    const claim = (status: MathClaim["status"]) => {
      claimed.fill(true, start, j + 1);
      claims.push({ text: text.slice(run[0].from, run[run.length - 1].to).trim(), status, problem: found, result: read.length >= 2 });
    };

    if (run.length > MAX_RUN || run.some((x) => x.t === "rel")) { claim("unsupported"); continue; }
    if (!run.some((x) => x.t === "eq")) {
      // "Seven plus nine comes to fifteen": an operation, then a number, in one statement.
      const operation = run.some((x, n) => x.t === "op" && n > 0 && ["num", "unit", "rp"].includes(run[n - 1].t));
      if ((!question && operation && found === null && numberAfter[j]) || run.some((x) => x.t === "amount") || (run.some((x) => x.t === "sym") && run.some((x) => x.t === "num"))) claim("unsupported");
      continue;
    }
    if (question && read.length < 2) {
      // "What is seven plus nine?" asks; "Seven plus nine is, fifteen?" offers a value code cannot place.
      if (run.some((x) => x.t === "amount")) claim("unsupported");
      else if (run.some((x) => x.t === "num") && (sides.some((s) => s.k === "fail") || (sides[sides.length - 1].k === "empty" && numberAfter[j]))) claim("unsupported");
      continue;
    }
    const leadOk = !before || before.t !== "word" || LEAD.has(before.w);
    const trailOk = !after || after.t !== "word" || (TRAIL.has(after.w) && !(after.w === "and" && toks[j + 2]?.t === "num"));
    if (!question && sides.some((s) => s.k === "fail" || s.k === "empty")) {
      // "It is 27 plus 39.", "18 + 5 is easier.": a statement may name a problem, never give another value without an
      // equation, so no number may follow it in the sentence.
      const names = sides.length === 2 && found !== null && ((sides[0].k === "empty" && trailOk) || (sides[1].k === "empty" && sides[0].k !== "fail" && !numberAfter[j]));
      claim(names ? "true" : "unsupported");
      continue;
    }
    const holds = leadOk && trailOk ? agrees(read) : null;
    claim(holds === null ? "unsupported" : holds ? "true" : "false");
  }
  if (step) claims.push(...stepClaims(text, toks, claimed, step));
  if (step?.operation) claims.push(...operationClaims(text, toks, restates, step.operation, (end) => {
    const named = names.get(end);
    return named === undefined ? undefined : problems[named]?.symbol;
  }));
  return claims;
}

/** The words of each operation: Maya says only those of the problem she talks about. */
const OPERATION_WORDS: readonly [MathOp, RegExp][] = [
  ["+", /^(?:add|adds|added|adding|addition|plus|sum|sums|altogether|in all|more)$/],
  ["-", /^(?:subtract|subtracts|subtracted|subtracting|subtraction|minus|take away|takes away|taking away|took away|difference|less|fewer)$/],
  ["×", /^(?:times|multiply|multiplies|multiplied|multiplying|multiplication|groups of)$/],
  ["÷", /^(?:divide|divides|divided|dividing|division|share|shares|shared|sharing|split|splits|splitting|each)$/],
];
/**
 * Phrases with an operation word that say nothing about the problem's operation ("take your time", "one more try",
 * "look at each column"). The list is short on purpose: any other use of an operation word is checked.
 */
const NOT_OPERATIONS: readonly string[][] = [
  ["take", "your", "time"], ["take", "a", "break"], ["less", "work"], ["more", "time"], ["one", "more"], ["once", "more"],
  ["tell", "me", "more"], ["more", "help"], ["each", "step"], ["each", "time"], ["each", "column"], ["each", "digit"],
  ["each", "number"], ["each", "row"], ["each", "place"], ["each", "one"],
];

/**
 * Every operation word in a sentence that is not the operation of the problem it is about: the problem the sentence
 * names ("In 18 + 5, add the ones"), else the turn's own. "Now subtract the 39 dollars." is false for 27 + 39. A
 * restatement keeps the question's own words, and a phrase in NOT_OPERATIONS is no operation.
 */
function operationClaims(text: string, toks: Spanned[], restates: boolean[], own: MathOp, named: (end: number) => MathOp | undefined): MathClaim[] {
  const out: MathClaim[] = [];
  for (let a = 0; a < toks.length; ) {
    let b = a;
    while (b < toks.length && toks[b].t !== "end") b++;
    if (b > a && !restates[a]) {
      const op = named(b) ?? own;
      const words = [...text.slice(toks[a].from, toks[b - 1].to).toLowerCase().matchAll(/[a-z]+/g)].map((m) => m[0]);
      const skip = new Set<number>();
      words.forEach((_, n) => NOT_OPERATIONS.forEach((p) => {
        if (p.every((w, m) => words[n + m] === w)) p.forEach((__, m) => skip.add(n + m));
      }));
      words.forEach((w, n) => {
        if (skip.has(n)) return;
        const two = n + 1 < words.length ? `${w} ${words[n + 1]}` : "";
        for (const [symbol, group] of OPERATION_WORDS) {
          const said = group.test(two) ? two : group.test(w) ? w : null;
          if (said && symbol !== op) out.push({ text: said, status: "false", problem: null, result: false });
        }
      });
    }
    a = b + 1;
  }
  return out;
}

/** Words that may lead into a restatement without changing it ("So, Sam has 27 dollars."). */
const LEAD_INS: readonly string[][] = [["so"], ["remember"], ["okay"], ["ok"], ["the", "question", "says"], ["the", "question", "says", "that"]];
/** Words after "and" that do not start a clause: "a toy for 27 dollars and a book for 39 dollars" is one clause. */
const NOT_A_CLAUSE = new Set(["a", "an", "the"]);

/** A run of tokens as a restatement compares them: words and signs in lowercase, numbers by value, no punctuation. */
function canonical(text: string, toks: Spanned[]): string[] {
  return toks.flatMap((t) => {
    if (t.t === "soft" || t.t === "end") return [];
    if (t.t === "num") return [`#${t.v[0]}/${t.v[1]}`];
    return text.slice(t.from, t.to).toLowerCase().match(/[a-z']+|\S/g) ?? [];
  });
}

/**
 * The clauses of each sentence of a question, in order: it splits at sentence ends (a "?" too), at commas and colons,
 * and before an "and" that starts a clause ("and gets 39 dollars", not "and a book"). That "and" stays at the start of
 * its clause. A restatement never joins clauses of two sentences.
 */
function clausesOf(q: string): string[][][] {
  const qt = tokenize(q);
  const sentences: string[][][] = [[]];
  let part: Spanned[] = [];
  const cut = () => {
    const c = canonical(q, part);
    if (c.length > 0) sentences[sentences.length - 1].push(c);
    part = [];
  };
  qt.forEach((t, k) => {
    if (t.t === "end") {
      cut();
      sentences.push([]);
      return;
    }
    if (t.t === "soft") return cut();
    const next = qt[k + 1];
    // A verb ("gets", "is") or another word starts a clause; a number, a sign or an article goes on the one before.
    if (t.t === "word" && t.w === "and" && (next?.t === "eq" || (next?.t === "word" && !NOT_A_CLAUSE.has(next.w)))) cut();
    part.push(t);
  });
  cut();
  return sentences.filter((c) => c.length > 0);
}

/**
 * For each token, whether its sentence restates a question: after an optional lead-in ("So,", "Remember,", "The
 * question says"), it is one or more clauses of one sentence of that question in a row, unchanged but for case, spaces
 * and punctuation;
 * an "and" may join two of them or be left off the start of one. Nothing else is a restatement: a changed, added or
 * moved word or number ("Sam has 27 dollars altogether.", "Sam has 39 dollars.") goes through the usual checks.
 */
function restated(text: string, toks: Spanned[], questions: readonly string[]): boolean[] {
  const out: boolean[] = new Array(toks.length).fill(false);
  const asked = questions.map(clausesOf);
  const eq = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((w, n) => w === b[n]);
  /** The words s, from `at`, are the clauses from c on, each whole, to the end of s. */
  const rest = (s: string[], at: number, clauses: string[][], c: number, first: boolean): boolean => {
    if (at === s.length) return !first;
    if (c >= clauses.length) return false;
    const clause = clauses[c];
    const forms = clause[0] === "and" ? [clause, clause.slice(1)] : first ? [clause] : [clause, ["and", ...clause]];
    return forms.some((f) => eq(s.slice(at, at + f.length), f) && rest(s, at + f.length, clauses, c + 1, false));
  };
  for (let a = 0; a < toks.length; ) {
    let b = a;
    while (b < toks.length && toks[b].t !== "end") b++;
    let s = canonical(text, toks.slice(a, b));
    for (let lead = LEAD_INS.find((l) => eq(s.slice(0, l.length), l)); lead; lead = LEAD_INS.find((l) => eq(s.slice(0, l.length), l))) s = s.slice(lead.length);
    if (s.length > 0 && asked.some((sentences) => sentences.some((clauses) => clauses.some((_, c) => rest(s, 0, clauses, c, true))))) out.fill(true, a, b);
    a = b + 1;
  }
  return out;
}

/** Words that make a number in their sentence a price or an amount of money ("it costs 5", "Sam pays 27"). */
const PRICE = /^(?:costs?|costing|worth|pays?|paid|paying|spends?|spent|spending|price[sd]?|prices|saves?|saved|earns?|earned|change|owes?|owed|dollars?|bucks?|cents?|cad)$/;

/** Words that tell the child to carry, borrow or regroup a number ("carry the 1", "carry forward the 1"). */
const CARRY = /^(?:carry|carries|carried|carrying|borrow|borrows|borrowed|borrowing|regroup|regroups|regrouped|regrouping|trade|trades|traded|trading)$/;
/** Words that tell the child to write a number ("write the 6", "put a 6 on top"). */
const WRITE = /^(?:write|writes|wrote|writing|written|put|puts|putting|record|records)$/;
/** Words that do not change which number a word is about ("carry the 1", "write down a 6"). */
const FILLER = new Set(["the", "a", "an", "down", "over", "up", "your", "that", "this", "just", "only"]);
/** Words that end an instruction: the numbers after them are not what it carries or writes. */
const BREAK = new Set(["then", "so", "but", "because", "when", "if", "which", "since", "while", "now", "after", "before"]);
/** Words that point at where to carry or write ("write the 6 under the 7"): the number after them is a place. */
const LOCATION = new Set(["under", "below", "beneath", "above", "beside", "next", "to", "from", "by", "in", "on", "at", "of", "near", "into", "onto", "with", "than", "between"]);

/** Words before a spoken "one" that make it a pronoun ("this one", "which one"), not the number 1. */
const PRONOUN = new Set(["this", "that", "each", "which", "another", "next", "last", "every", "no", "any", "other", "same"]);

/**
 * Words that count something outside the math: the steps and tries of the work, and time. A number with one ("two
 * steps", "wait 2 seconds") is checked as such a count, not as a value of the step. Every other noun is math and stays
 * bound: measures ("cm"), "times", and money, which Maya has no reason to name outside the problem.
 */
const COUNTS = new Set(["step", "steps", "try", "tries", "second", "seconds", "minute", "minutes"]);
/** The unit a word names, the same for its plural ("steps" is "step"). */
const unitOf = (word: string): string => {
  const w = word.toLowerCase();
  return w.endsWith("s") && w.length > 1 ? w.slice(0, -1) : w;
};
/** Words between a count and its noun ("two more tries"). */
const COUNT_FILLER = new Set(["more", "extra", "other", "whole", "short", "small", "big", "quick"]);
/** Words that name a result: a count in their sentence is a value of the math ("the answer is 65 dollars"). */
const RESULTS = new Set(["answer", "answers", "total", "totals", "sum", "difference", "product", "quotient", "result", "remainder"]);
/** The largest count of steps, time or money said as talk. */
const MAX_COUNT = BigInt(100);

/** The count noun a whole number token comes before ("2 more seconds"), or null. */
function quantityNoun(toks: Spanned[], k: number): string | null {
  const x = toks[k];
  if (x?.t !== "num" || !x.whole) return null;
  let n = k + 1;
  while (toks[n]?.t === "word" && COUNT_FILLER.has((toks[n] as { w: string }).w)) n++;
  const noun = toks[n];
  return noun?.t === "word" && COUNTS.has(noun.w) ? noun.w : null;
}

/**
 * The numbers outside every claim, each bound to the step's checked numbers.
 *
 * An instruction to carry or to write runs from its word to the end of its clause (a sentence end, "then", or a comma
 * or "and" before another verb). Every number in it is what it carries or writes ("carry forward the 7", "write a
 * small 7", "put a 7 on top"), unless a place word comes before it ("write the 6 under the 7", "... and the 9"), and
 * must be the step's carry or written digit: anything else is false.
 *
 * A number that counts steps, tries, time or money ("we have two steps", "wait 2 seconds", "it costs 2 dollars") is
 * a count: a whole number up to 100, said away from any operation and any result word, with a noun that is not the
 * problem's own unit. Any other number not among the step's numbers is unsupported. Counting on from one of them
 * (three or more whole numbers in a row with only commas between them, "from nine: ten, eleven, twelve") and a spoken
 * "one" that is not a carry or a written digit ("let's do this one") say no value of the step.
 */
function stepClaims(text: string, toks: Spanned[], claimed: boolean[], step: StepNumbers): MathClaim[] {
  const ratios = (list: readonly number[]) => list.map(ratioOf).filter((r): r is Ratio => r !== null);
  const [known, carry, write] = [ratios(step.known), ratios(step.carry), ratios([...step.write, ...step.carry])];
  const units = new Set((step.units ?? []).map(unitOf));
  const among = (v: Ratio, list: Ratio[]) => list.some((r) => same(v, r));
  // Money: the amounts the question states with a money unit or sign, and its answers when every operand is one.
  const stated = step.money ? moneyStated(step.money.text) : [];
  const results = step.money && step.money.operands.length > 0 && step.money.operands.every((n) => among(ratioOf(n) ?? [ZERO, ZERO], stated))
    ? ratios(step.money.results) : [];
  const word = (k: number) => (toks[k]?.t === "word" ? (toks[k] as { w: string }).w : "");
  const free = (k: number): Tok | null => (toks[k]?.t === "num" && !claimed[k] ? toks[k] : null);

  // Counting on.
  const counted = new Set<number>();
  for (let k = 0; k < toks.length; k++) {
    const x = free(k);
    if (x?.t !== "num" || !x.whole || !among(x.v, known)) continue;
    const seq = [k];
    let by: bigint | null = null;
    for (let n = k + 2; toks[n - 1]?.t === "soft"; n += 2) {
      const [a, b] = [toks[seq[seq.length - 1]], free(n)];
      if (a.t !== "num" || b?.t !== "num" || !b.whole) break;
      const d = b.v[0] - a.v[0];
      if ((d !== ONE && d !== -ONE) || (by !== null && d !== by)) break;
      by = d;
      seq.push(n);
    }
    if (seq.length >= 3) seq.forEach((n) => counted.add(n));
  }

  // The instruction each number is in: what it may carry or write, and where the instruction starts.
  const roles = new Map<number, { allowed: Ratio[]; from: number }>();
  let verb: { allowed: Ratio[]; from: number } | null = null;
  let lastIsObject = false;
  for (let k = 0; k < toks.length; k++) {
    const x = toks[k];
    const w = word(k);
    if (x.t === "end" || BREAK.has(w)) { verb = null; continue; }
    if (CARRY.test(w) || WRITE.test(w)) { verb = { allowed: CARRY.test(w) ? carry : write, from: x.from }; lastIsObject = false; continue; }
    if (!verb) continue;
    if (x.t === "soft" || w === "and") {
      // The list goes on ("write the 6 and the 1"); another verb or word starts a new clause.
      let n = k + 1;
      while (FILLER.has(word(n))) n++;
      if (toks[n]?.t !== "num") verb = null;
      continue;
    }
    if (x.t !== "num") continue;
    let r = k - 1;
    while (FILLER.has(word(r))) r--;
    const before = toks[r];
    const place: boolean = LOCATION.has(word(r)) || ((before?.t === "soft" || word(r) === "and") && !lastIsObject);
    const pronoun = text.slice(x.from, x.to).toLowerCase() === "one" && PRONOUN.has(word(k - 1));
    lastIsObject = !place && !pronoun;
    if (lastIsObject) roles.set(k, verb);
  }

  const out: MathClaim[] = [];
  for (let k = 0; k < toks.length; k++) {
    const x = toks[k];
    if (x.t !== "num" || claimed[k]) continue;
    // A sign that touches the number ("-66"), or "negative", with no value before it, is the number's own sign; a
    // spoken "minus" or "take away" is an operation.
    const sign = toks[k - 1];
    const negative = sign?.t === "op" && sign.op === "-" && (sign.unaryOnly || sign.to === x.from) && !["num", "unit", "rp"].includes(toks[k - 2]?.t ?? "");
    const v: Ratio = negative ? [-x.v[0], x.v[1]] : x.v;
    const role = roles.get(k);
    const from = role ? role.from : negative ? sign.from : x.from;
    const claim = (status: MathClaim["status"]) => out.push({ text: text.slice(from, x.to).trim(), status, problem: null, result: false });
    if (role) {
      if (!among(v, role.allowed)) claim("false");
      continue;
    }
    // An amount of money is the problem's checked money result, or an amount the question states, named as that one
    // ("the 27 dollars"). A carry, a digit or a count is never money.
    if (priced(text, toks, k)) {
      if (!among(v, results) && !(among(v, stated) && referenced(text, toks, k))) claim("unsupported");
      continue;
    }
    if (counted.has(k) || text.slice(x.from, x.to).toLowerCase() === "one" || among(v, known) || isCount(text, toks, k, units)) continue;
    claim("unsupported");
  }
  return out;
}

/** A money sign ("$", "¢") right before the number at k. */
const signed = (text: string, toks: Spanned[], k: number) => toks[k - 1]?.t === "sym" && /^[$¢]$/.test(text.slice(toks[k - 1].from, toks[k - 1].to));

/** The amounts a question states with a money unit after them or a money sign before them ("27 dollars", "$39"). */
function moneyStated(q: string): Ratio[] {
  const qt = tokenize(q);
  return qt.flatMap((t, k) => {
    const unit = qt[k + 1];
    return t.t === "num" && ((unit?.t === "word" && MONEY_UNITS.test(unit.w)) || signed(q, qt, k)) ? [t.v] : [];
  });
}

/** Words that name a stated amount as that one ("the 27 dollars", "his 39 dollars"). */
const REFERENCE = new Set(["the", "those", "these", "that", "this", "his", "her", "their", "its"]);

/** The number at k is named as one the question states: a reference word right before it, or before its sign. */
function referenced(text: string, toks: Spanned[], k: number): boolean {
  const before = toks[signed(text, toks, k) ? k - 2 : k - 1];
  return before?.t === "word" && REFERENCE.has(before.w);
}

/**
 * The number at k is a price or an amount: a money word comes right after it ("5 cents"), a money sign before it
 * ("$5"), or a price word is in its sentence ("it costs 5", "Sam pays 27").
 */
function priced(text: string, toks: Spanned[], k: number): boolean {
  if ((toks[k + 1]?.t === "word" && MONEY_UNITS.test((toks[k + 1] as { w: string }).w)) || signed(text, toks, k)) return true;
  for (const d of [-1, 1]) {
    for (let m = k + d; toks[m] && toks[m].t !== "end"; m += d) if (toks[m].t === "word" && PRICE.test((toks[m] as { w: string }).w)) return true;
  }
  return false;
}

/** The number at k counts steps, tries, time or money as talk (see stepClaims), away from the problem's math. */
function isCount(text: string, toks: Spanned[], k: number, units: ReadonlySet<string>): boolean {
  const x = toks[k];
  const noun = quantityNoun(toks, k);
  if (x.t !== "num" || noun === null || units.has(unitOf(noun)) || x.v[0] < ZERO || x.v[0] > MAX_COUNT) return false;
  let n = k + 1;
  while (toks[n]?.t === "word" && (toks[n] as { w: string }).w !== noun) n++;
  const near = [toks[k - 1], toks[n + 1]];
  if (near.some((t) => t?.t === "op" || t?.t === "lp" || t?.t === "rp" || t?.t === "sym" || t?.t === "rel")) return false;
  // No result word in the same sentence, as a word or as an "equals" ("the total is", "it totals").
  for (const d of [-1, 1]) {
    for (let m = k + d; toks[m] && toks[m].t !== "end"; m += d) {
      const words = text.slice(toks[m].from, toks[m].to).toLowerCase().split(/[^a-z]+/);
      if ((toks[m].t === "word" || toks[m].t === "eq") && words.some((w) => RESULTS.has(w))) return false;
    }
  }
  return true;
}
