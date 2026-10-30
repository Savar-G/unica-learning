// The number claims in what Maya says or writes (#321): every equation ("7 + 9 = 16", "seven plus nine is sixteen",
// "(7 + 9) × 2 = 32", "two tens plus three tens is five tens", "53 ÷ 2 = 26 R 1") and every other statement that gives
// a number a value ("the ones total is fifteen", "seven plus nine comes to fifteen", "7 + 9 > 20"). Code checks each
// claim completely, by exact rational arithmetic on the digits as written (never floating point). A claim code cannot
// read completely is unsupported, and the session refuses it like a false one: no numeric statement passes unchecked.
// Pure TypeScript; it never throws.
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

/** Place-value words after a number: "two tens" is 20, "five tenths" is 1/2. */
const PLACES: Record<string, Ratio> = {
  ones: [ONE, ONE], tens: [TEN, ONE], hundreds: [HUNDRED, ONE], thousands: [THOUSAND, ONE],
  tenth: [ONE, TEN], tenths: [ONE, TEN], hundredth: [ONE, HUNDRED], hundredths: [ONE, HUNDRED], thousandth: [ONE, THOUSAND], thousandths: [ONE, THOUSAND],
};
const UNREAD = /^(?:halfs?|halves|thirds?|quarters?|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?|squared|cubed|percent|power|root|dozens?|twice|double|triple)$/;
const EQUALS = new Set(["is", "are", "was", "were", "equals", "equal", "makes", "make", "gives", "give", "gets", "get", "totals", "total", "leaves", "leave", "that's", "it's"]);
const RELATIONS = new Set(["isn't", "aren't", "wasn't", "weren't", "doesn't", "don't", "didn't"]);
const OPS: Record<string, MathOp> = { plus: "+", minus: "-", times: "×" };
/** Two-word operations and equals words. */
const PAIRS: Record<string, Tok> = {
  "multiplied by": { t: "op", op: "×" }, "divided by": { t: "op", op: "÷" }, "take away": { t: "op", op: "-" },
  "comes to": { t: "eq" }, "come to": { t: "eq" }, "adds to": { t: "eq" }, "add to": { t: "eq" }, "sums to": { t: "eq" }, "equal to": { t: "eq" }, "equals to": { t: "eq" },
};
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
        for (j++; kind(j) === "unit"; j++) decimals += String(wordValue(p[j].w!));
      }
      break;
    }
    // "one thousand hundred" is no number: a hundred follows a smaller number, a thousand does not repeat.
    if (startsNewNumber(last, k) || (k === "hundred" && (last === "hundred" || last === "thousand")) || (k === "thousand" && last === "thousand")) break;
    if (k === "hundred") current = (last === null ? ONE : current) * HUNDRED;
    else if (k === "thousand") { total += (last === null ? ONE : current) * THOUSAND; current = ZERO; }
    else current += BigInt(wordValue(word!));
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
    if (kindOf(w) !== null || (w === "point" && kindOf(p[i + 1]?.w ?? "") === "unit")) {
      const { v, whole, next } = numberWords(p, i);
      add({ t: "num", v, whole }, p[next - 1].to);
      i = next - 1;
      continue;
    }
    // One "equals" for "is equal to", "equals", "adds up to".
    const equals = (end: number) => (prev?.t === "eq" ? (prev.to = end) : add({ t: "eq" }, end));
    const pair = PAIRS[`${w} ${p[i + 1]?.w ?? ""}`];
    if (pair) { if (pair.t === "eq") equals(p[i + 1].to); else add(pair, p[i + 1].to); i++; continue; }
    if (w === "adds" && p[i + 1]?.w === "up" && p[i + 2]?.w === "to") { equals(p[i + 2].to); i += 2; continue; }
    if (EQUALS.has(w)) { equals(to); continue; }
    if (w in PLACES) add({ t: "unit", v: PLACES[w] });
    else if (UNREAD.test(w)) add({ t: "sym" });
    else if (RELATIONS.has(w)) add({ t: "rel" });
    else if (w in OPS) add({ t: "op", op: OPS[w] });
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

const MATH: ReadonlySet<Tok["t"]> = new Set(["num", "unit", "op", "eq", "lp", "rp", "rem", "sym", "rel"]);
const isNumber = (x: Tok) => x.t === "num" || x.t === "unit" || x.t === "sym";

/**
 * Every number claim in a text, in order. A run of math with an "equals" in it ("=", "is", "makes", "comes to") must
 * read completely in a statement: every side a full expression, every side equal, and only neutral words around it.
 * A question ("What is seven plus nine?") is a claim only when two of its sides read, and then they must be equal.
 * A relation other than "equals" ("7 + 9 > 15", "isn't"), and a statement that names an operation and then a number
 * with no "equals" ("seven plus nine, then fifteen"), are unsupported. A statement may name a problem ("It is 27 plus
 * 39") only when it is one of `problems`.
 */
export function mathClaims(text: string, problems: readonly NamedProblem[] = []): MathClaim[] {
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
  for (let i = 0; i < toks.length; i++) {
    if (!MATH.has(toks[i].t)) continue;
    let j = i;
    while (j + 1 < toks.length && MATH.has(toks[j + 1].t)) j++;
    const run = toks.slice(i, j + 1);
    const [before, after, stop] = [toks[i - 1], toks[j + 1], toks[sentenceEnd[j]]];
    const question = stop?.t === "end" && stop.question;
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
    const claim = (status: MathClaim["status"]) => claims.push({ text: text.slice(run[0].from, run[run.length - 1].to).trim(), status, problem: found, result: read.length >= 2 });

    if (run.length > MAX_RUN || run.some((x) => x.t === "rel")) { claim("unsupported"); continue; }
    if (!run.some((x) => x.t === "eq")) {
      // "Seven plus nine comes to fifteen": an operation, then a number, in one statement.
      const operation = run.some((x, n) => x.t === "op" && n > 0 && ["num", "unit", "rp"].includes(run[n - 1].t));
      if (!question && operation && found === null && numberAfter[j]) claim("unsupported");
      continue;
    }
    if (question && read.length < 2) continue;
    const leadOk = !before || before.t !== "word" || LEAD.has(before.w);
    const trailOk = !after || after.t !== "word" || (TRAIL.has(after.w) && !(after.w === "and" && toks[j + 2]?.t === "num"));
    if (!question && sides.some((s) => s.k === "fail" || s.k === "empty")) {
      // "It is 27 plus 39.": a statement may name a problem, never give another value without an equation.
      claim(sides.length === 2 && sides[0].k === "empty" && found !== null && trailOk ? "true" : "unsupported");
      continue;
    }
    const holds = leadOk && trailOk ? agrees(read) : null;
    claim(holds === null ? "unsupported" : holds ? "true" : "false");
  }
  return claims;
}
