// Code's check of a two-ways method (D-302). The AI transcribes the work and says whether it solves the question.
// Code fails closed: it recognizes each method as one kind from a fixed list for the question's shape, and every number
// in the method must fit that kind. Anything else is unsure. It never asks "what is wrong with this?", because the list
// of wrong work has no end. So copies, padding (x 1, + 0, + n - n), extra lines and checks that use the answer have no
// kind. The answer can appear only as a final result.
//
// invalid: a written step is false, or the AI says does-not-solve.
// valid: the AI says solves, every step is true, and the whole method is one kind.
// unknown: anything else, including a whole-number shape code cannot read, or a fraction or decimal answer.
//
// Exact rational arithmetic checks the steps. Pure TypeScript: no network, database, clock or Math.random.

export const METHOD_KINDS = {
  add: ["split-one-addend", "partial-sums", "compensation", "column", "counting-on"],
  subtract: ["split-subtrahend", "partial-differences", "compensation", "column", "counting-back", "counting-up"],
  multiply: ["split-factor", "round-and-adjust", "strip-zeros", "strip-zeros-from-one", "repeated-addition", "skip-counting"],
  divide: ["repeated-subtraction", "skip-counting", "repeated-addition", "division-with-tens", "build-up"],
  "missing-factor": ["inverse-division", "repeated-subtraction", "skip-counting", "repeated-addition", "division-with-tens", "build-up"],
  "missing-addend": ["inverse-subtraction", "split-subtrahend", "partial-differences", "compensation", "column", "counting-back", "counting-up"],
  "missing-subtrahend": ["inverse-subtraction", "split-subtrahend", "partial-differences", "compensation", "column", "counting-back", "counting-up"],
  "missing-minuend": ["inverse-addition", "split-one-addend", "partial-sums", "compensation", "column", "counting-on"],
  "missing-dividend": ["inverse-multiplication", "split-factor", "round-and-adjust", "strip-zeros", "strip-zeros-from-one", "repeated-addition", "skip-counting"],
} as const;

export type QuestionShape =
  | { kind: "add"; a: number; b: number } | { kind: "subtract"; a: number; b: number } | { kind: "multiply"; a: number; b: number }
  | { kind: "divide"; target: number; by: number } | { kind: "missing-factor"; by: number; target: number }
  | { kind: "missing-addend"; a: number; total: number } | { kind: "missing-subtrahend"; a: number; rest: number }
  | { kind: "missing-minuend"; b: number; rest: number } | { kind: "missing-dividend"; by: number; quotient: number };
export type MethodVerdict = "valid" | "invalid" | "unknown";
export interface MethodCheck { verdict: MethodVerdict; kind: string | null }
export const METHOD_JUDGMENTS = ["solves", "does-not-solve", "unsure"] as const;
export type MethodJudgment = (typeof METHOD_JUDGMENTS)[number];
export interface MethodRule {
  /** Code's answer, as a number or a/b. A fraction or decimal has no method kinds yet. */
  answer: string;
  /** The printed question, sent with the method region. Never the answer. */
  question: string;
  /** null: code cannot read the question's shape, so no method can be valid. */
  shape: QuestionShape | null;
}

// ---------- Numbers ----------

type Value = { n: bigint; d: bigint };
const ZERO = BigInt(0), ONE = BigInt(1);
const gcd = (a: bigint, b: bigint): bigint => { a = a < ZERO ? -a : a; b = b < ZERO ? -b : b; while (b !== ZERO) [a, b] = [b, a % b]; return a; };
function value(n: bigint, d: bigint): Value | null {
  if (d === ZERO) return null;
  const g = gcd(n, d) || ONE, sign = d < ZERO ? -ONE : ONE;
  return { n: sign * n / g, d: sign * d / g };
}
const same = (a: Value, b: Value) => a.n === b.n && a.d === b.d;
/** A thousands group written with a comma or a space is one number: 12 500, 10,000. */
const NUMBER_TEXT = String.raw`(?:\d{1,3}(?:[ ,]\d{3})+|\d+)(?:\.\d+)?`;
const NUMBER = new RegExp(`^${NUMBER_TEXT}`);
function numberValue(text: string): Value | null {
  const [whole, fraction = ""] = text.replace(/[ ,]/g, "").split(".");
  return value(BigInt(whole + fraction), BigInt(10) ** BigInt(fraction.length));
}
/** A whole number code can do plain arithmetic with, or null. */
function whole(v: Value | null): number | null {
  if (!v || v.d !== ONE) return null;
  const n = Number(v.n);
  return Number.isSafeInteger(n) ? n : null;
}
const wholeText = (text: string) => { const m = new RegExp(`^${NUMBER_TEXT}$`).exec(text.trim()); return m ? whole(numberValue(m[0])) : null; };

// ---------- The question's shape ----------

const SIGNS: Record<string, "+" | "-" | "×" | "÷"> = { "+": "+", "-": "-", "−": "-", "–": "-", "\u2014": "-", "×": "×", x: "×", X: "×", "*": "×", "·": "×", "÷": "÷", "/": "÷" };
const SIDE = String.raw`(${NUMBER_TEXT}|\?|_+)`;
const EQUATION = new RegExp(String.raw`(?<![\d.,/+\-−–×xX*·÷=]\s*)${SIDE}\s*([+\-−–×xX*·÷/])\s*${SIDE}\s*=\s*${SIDE}(?!\s*[\d/.+\-−–×xX*·÷=])`, "g");
function shapeOf(op: "+" | "-" | "×" | "÷", left: number | null, right: number | null, result: number | null): QuestionShape | null {
  const unknowns = [left, right, result].filter(n => n === null).length;
  if (unknowns !== 1) return null;
  if (result === null) return op === "+" ? { kind: "add", a: left!, b: right! } : op === "-" ? { kind: "subtract", a: left!, b: right! }
    : op === "×" ? { kind: "multiply", a: left!, b: right! } : { kind: "divide", target: left!, by: right! };
  const known = (left ?? right)!;
  if (op === "+") return { kind: "missing-addend", a: known, total: result };
  if (op === "×") return { kind: "missing-factor", by: known, target: result };
  if (op === "-") return left === null ? { kind: "missing-minuend", b: known, rest: result } : { kind: "missing-subtrahend", a: known, rest: result };
  return left === null ? { kind: "missing-dividend", by: known, quotient: result } : { kind: "missing-factor", by: result, target: known };
}
const expectedAnswer = (s: QuestionShape): number | null => {
  const exact = (n: number, by: number) => by !== 0 && n % by === 0 ? n / by : null;
  switch (s.kind) {
    case "add": return s.a + s.b;
    case "subtract": return s.a - s.b;
    case "multiply": return s.a * s.b;
    case "divide": return exact(s.target, s.by);
    case "missing-factor": return exact(s.target, s.by);
    case "missing-addend": return s.total - s.a;
    case "missing-subtrahend": return s.a - s.rest;
    case "missing-minuend": return s.rest + s.b;
    case "missing-dividend": return s.by * s.quotient;
  }
};
const OPERATIONS: Record<string, "+" | "-" | "×" | "÷"> = { add: "+", subtract: "-", multiply: "×", divide: "÷" };
/** The printed equation decides: 8 × ? = 800 is stored as a division. A story with none uses its stored operation. */
export function questionShape(text: string, operation: { kind: string } | null | undefined): QuestionShape | null {
  const found = [...text.matchAll(EQUATION)];
  if (found.length > 1) return null;
  if (found.length === 1) {
    const [, left, sign, right, result] = found[0];
    const read = (side: string) => /^[?_]/.test(side) ? { unknown: true, n: null } : { unknown: false, n: wholeText(side) };
    const parts = [read(left), read(right), read(result)];
    if (parts.some(p => !p.unknown && p.n === null)) return null;
    return shapeOf(SIGNS[sign], parts[0].n, parts[1].n, parts[2].n);
  }
  const op = operation ? OPERATIONS[operation.kind] : undefined;
  const operands = (operation as { operands?: unknown } | null | undefined)?.operands;
  if (!op || !Array.isArray(operands) || operands.length !== 2 || !operands.every(n => Number.isSafeInteger(n) && n >= 0)) return null;
  return shapeOf(op, operands[0], operands[1], null);
}
export const methodRuleFor = (text: string, operation: { kind: string } | null | undefined, answer: string): MethodRule =>
  ({ answer, question: text, shape: questionShape(text, operation) });

// ---------- Reading the work ----------

type Token = { kind: "number"; value: Value } | { kind: "op"; op: "+" | "-" | "×" | "÷" } | { kind: "=" } | { kind: "(" } | { kind: ")" } | { kind: "?" } | { kind: "arrow" };
/** null: the text holds something that is not arithmetic. */
function tokens(line: string): Token[] | null {
  const out: Token[] = [];
  for (let i = 0; i < line.length;) {
    const ch = line[i];
    if (/\s/.test(ch)) { i++; continue; }
    const m = NUMBER.exec(line.slice(i));
    if (m) {
      const v = numberValue(m[0]);
      // Two numbers side by side, or a letter after a number, are not a step code can read.
      if (!v || out.at(-1)?.kind === "number" || /[A-WYZa-wyz]/.test(line[i + m[0].length] ?? "")) return null;
      out.push({ kind: "number", value: v }); i += m[0].length; continue;
    }
    if (ch === "→" || (ch === "-" && line[i + 1] === ">")) { out.push({ kind: "arrow" }); i += ch === "→" ? 1 : 2; continue; }
    if (SIGNS[ch]) out.push({ kind: "op", op: SIGNS[ch] });
    else if (ch === "=") out.push({ kind: "=" });
    else if (ch === "(" || ch === ")") out.push({ kind: ch });
    else if (ch === "?" || ch === "_") out.push({ kind: "?" });
    else return null;
    i++;
  }
  return out;
}
/** Precedence parser over one side of an equation. null: not well formed, or a division by zero. */
function evaluate(side: readonly Token[]): Value | null {
  let at = 0;
  const factor = (): Value | null => {
    const t = side[at++];
    if (!t) return null;
    if (t.kind === "number") return t.value;
    if (t.kind === "op" && t.op === "-") { const v = factor(); return v && { n: -v.n, d: v.d }; }
    if (t.kind === "(") { const v = sum(); if (side[at++]?.kind !== ")") return null; return v; }
    return null;
  };
  const product = (): Value | null => {
    let left = factor();
    for (let t = side[at]; left && t?.kind === "op" && (t.op === "×" || t.op === "÷"); t = side[at]) {
      at++;
      const right = factor();
      if (!right) return null;
      left = t.op === "×" ? value(left.n * right.n, left.d * right.d) : value(left.n * right.d, left.d * right.n);
    }
    return left;
  };
  const sum = (): Value | null => {
    let left = product();
    for (let t = side[at]; left && t?.kind === "op" && (t.op === "+" || t.op === "-"); t = side[at]) {
      at++;
      const right = product();
      if (!right) return null;
      left = t.op === "+" ? value(left.n * right.d + right.n * left.d, left.d * right.d) : value(left.n * right.d - right.n * left.d, left.d * right.d);
    }
    return left;
  };
  const result = sum();
  return result && at === side.length ? result : null;
}

/** One step in plain form: numbers joined by signs, then a result. Only whole numbers. */
interface Eq { nums: number[]; ops: string[]; result: number }
type Line = { type: "eq"; eq: Eq } | { type: "bare"; value: number } | { type: "count"; value: number } | { type: "list"; values: number[] } | { type: "other" };
const hasOp = (parts: readonly Token[]) => parts.some(t => t.kind === "op");
/** A flat left side and a plain result, or null. Brackets, a leading sign or a fraction have no place in a kind. */
function plainEq(left: readonly Token[], result: Value): Eq | null {
  const nums: number[] = [], ops: string[] = [];
  for (const [n, t] of left.entries()) {
    if (n % 2 === 0) { const v = t.kind === "number" ? whole(t.value) : null; if (v === null) return null; nums.push(v); }
    else if (t.kind === "op") ops.push(t.op); else return null;
  }
  const end = whole(result);
  return nums.length >= 2 && ops.length === nums.length - 1 && end !== null ? { nums, ops, result: end } : null;
}
/** The last line may state a count in these words only: "5 times". */
const COUNT_LINE = new RegExp(`^(${NUMBER_TEXT})\\s+(?:times?|groups?|jumps?|steps?|lots?)$`, "i");
/** A skip count: numbers split by commas. A comma at the end or a missing number leaves it unread. */
function listLine(line: string): number[] | null {
  if (!line.includes(",")) return null;
  const out: number[] = [];
  let rest = line;
  for (;;) {
    const m = NUMBER.exec(rest);
    if (!m) return null;
    const n = whole(numberValue(m[0]));
    if (n === null) return null;
    out.push(n);
    rest = rest.slice(m[0].length).trimStart();
    if (!rest) return out.length >= 2 ? out : null;
    if (rest[0] !== ",") return null;
    rest = rest.slice(1).trimStart();
  }
}
function readWork(text: string): { lines: Line[]; unread: boolean; falseStep: boolean } {
  const lines: Line[] = [];
  let unread = false, falseStep = false, carry: Token[] | null = null;
  const raw = text.split(/[\n;]/).map(l => l.trim()).filter(Boolean);
  const chains: (Token[] | Line)[] = [];
  for (const [n, line] of raw.entries()) {
    const count = n === raw.length - 1 ? COUNT_LINE.exec(line) : null;
    if (count) { const v = whole(numberValue(count[1])); chains.push(v === null ? { type: "other" } : { type: "count", value: v }); carry = null; continue; }
    const list = listLine(line);
    if (list) { chains.push({ type: "list", values: list }); carry = null; continue; }
    const parts = tokens(line);
    // A question mark never hides a line: code cannot check what it stands for.
    if (!parts || parts.some(t => t.kind === "?")) { unread = true; carry = null; continue; }
    if (parts[0]?.kind === "=" && carry) { carry.push(...parts); continue; }
    carry = parts; chains.push(parts);
  }
  for (const chain of chains) {
    if (!Array.isArray(chain)) { lines.push(chain); continue; }
    if (chain.some(t => t.kind === "arrow")) {
      const parts: Token[][] = [[]];
      for (const t of chain) if (t.kind === "arrow") parts.push([]); else parts.at(-1)!.push(t);
      for (const [n, part] of parts.entries()) {
        const own = evaluate(part);
        if (!own) { unread = true; break; }
        if (n === parts.length - 1) break;
        // A bare number has no operation to check, so the arrow says nothing code can test.
        const next = parts[n + 1][0];
        if (!hasOp(part) || next?.kind !== "number") { unread = true; break; }
        if (!same(own, next.value)) falseStep = true;
        const eq = plainEq(part, next.value);
        lines.push(eq ? { type: "eq", eq } : { type: "other" });
      }
      continue;
    }
    const groups: Token[][] = [[]];
    for (const t of chain) if (t.kind === "=") groups.push([]); else groups.at(-1)!.push(t);
    const values = groups.map(evaluate);
    if (values.some(v => !v)) { unread = true; continue; }
    const known = values as Value[];
    if (known.length === 1) {
      const bare = groups[0].length === 1 ? whole(known[0]) : null;
      lines.push(bare === null ? { type: "other" } : { type: "bare", value: bare });
    } else if (known.length === 2) {
      if (!same(known[0], known[1])) falseStep = true;
      const right = groups[1];
      const signed = right.length === 2 && right[0].kind === "op" && right[0].op === "-" && right[1].kind === "number";
      const eq = right.length === 1 || signed ? plainEq(groups[0], known[1]) : null;
      lines.push(eq ? { type: "eq", eq } : { type: "other" });
    } else {
      // A run-on chain is unsure when each step is true as a chain ("36 + 40 = 76 + 7 = 83"). The team checks it.
      const runOn = groups.every((g, n) => n === 0 || (g[0]?.kind === "number" && same(g[0].value, known[n - 1])));
      if (!runOn && !known.every(v => same(v, known[0]))) falseStep = true;
      lines.push({ type: "other" });
    }
  }
  return { lines, unread, falseStep };
}

// ---------- Recognizing a kind ----------

interface Work { eqs: Eq[]; list: number[] | null; tail: { type: "bare" | "count"; value: number } | null }
const sorted = (ns: readonly number[]) => [...ns].sort((a, b) => a - b);
const sameNumbers = (a: readonly number[], b: readonly number[]) => a.length === b.length && sorted(a).every((n, i) => n === sorted(b)[i]);
const total = (ns: readonly number[]) => ns.reduce((a, b) => a + b, 0);
/** Place-value parts: 3400 is 3000 and 400. */
const placeParts = (n: number) => [...String(n)].flatMap((d, i, all) => d === "0" ? [] : [Number(d) * 10 ** (all.length - 1 - i)]);
const places = (n: number) => new Map(placeParts(n).map(p => [String(p).length, p]));
const digits = (n: number) => [...String(n)].reverse().map(Number);
const isOnly = (e: Eq, sign: string, ...nums: number[]) => e.ops.every(o => o === sign) && sameNumbers(e.nums, nums);
/** The running total of steps with one sign, from a start. A single flat line counts as the same steps. */
function steps(eqs: readonly Eq[], sign: string, start: number): { amounts: number[]; end: number } | null {
  if (!eqs.length || eqs.some(e => e.ops.some(o => o !== sign))) return null;
  if (eqs.length === 1 && eqs[0].nums[0] === start) return { amounts: eqs[0].nums.slice(1), end: eqs[0].result };
  const commutes = sign === "+" || sign === "×", amounts: number[] = [];
  let at = start;
  for (const e of eqs) {
    if (e.nums.length !== 2) return null;
    if (e.nums[0] === at) amounts.push(e.nums[1]);
    else if (commutes && e.nums[1] === at) amounts.push(e.nums[0]);
    else return null;
    at = e.result;
  }
  return { amounts, end: at };
}
const positive = (ns: readonly number[]) => ns.every(n => n > 0);
const plainTail = (w: Work, answer: number) => !w.tail || (w.tail.type === "bare" && w.tail.value === answer);
const roundedFor = (r: number, n: number) => r > 0 && r !== n && (r % 100 === 0 ? Math.abs(r - n) < 100 : r % 10 === 0 && Math.abs(r - n) < 10);

function additionKind(a: number, b: number, answer: number, w: Work): string | null {
  if (w.list) return null;
  if (w.tail?.type === "bare" && w.tail.value === answer && columnAddition(a, b, w.eqs)) return "column";
  if (!plainTail(w, answer) || !w.eqs.length) return null;
  for (const [s, o] of [[a, b], [b, a]]) {
    const run = steps(w.eqs, "+", s);
    if (run && run.end === answer && run.amounts.length >= 2 && positive(run.amounts) && total(run.amounts) === o) {
      if (sameNumbers(run.amounts, placeParts(o))) return "split-one-addend";
      // Jumps show their landings. A flat line with a chunk taken off is only the question rewritten.
      if (w.eqs.length >= 2) return "counting-on";
    }
  }
  if (partialSums(a, b, answer, w.eqs)) return "partial-sums";
  for (const [s, o] of [[a, b], [b, a]]) if (compensated("+", s, o, answer, w.eqs)) return "compensation";
  return null;
}
function subtractionKind(a: number, b: number, answer: number, w: Work): string | null {
  if (w.list) return null;
  if (w.tail?.type === "bare" && w.tail.value === answer && columnSubtraction(a, b, w.eqs)) return "column";
  if (!plainTail(w, answer) || !w.eqs.length) return null;
  const down = steps(w.eqs, "-", a);
  if (down && down.end === answer && down.amounts.length >= 2 && positive(down.amounts) && total(down.amounts) === b) {
    if (sameNumbers(down.amounts, placeParts(b))) return "split-subtrahend";
    if (w.eqs.length >= 2) return "counting-back";
  }
  const up = steps(w.eqs.slice(0, -1), "+", b), last = w.eqs.at(-1)!;
  if (up && up.end === a && up.amounts.length >= 2 && positive(up.amounts) && last.result === answer && isOnly(last, "+", ...up.amounts)) return "counting-up";
  if (partialDifferences(a, b, answer, w.eqs)) return "partial-differences";
  return compensated("-", a, b, answer, w.eqs) ? "compensation" : null;
}
/** Each shared place added once, then the results and any other part added: 30 + 40 = 70, 6 + 7 = 13, 70 + 13 = 83. */
function partialSums(a: number, b: number, answer: number, eqs: readonly Eq[]): boolean {
  const pa = places(a), pb = places(b), shared = [...pa.keys()].filter(k => pb.has(k));
  if (!shared.length || eqs.length !== shared.length + 1 || pa.size + pb.size - shared.length < 2) return false;
  const results: number[] = [], rest = [...[...pa].filter(([k]) => !pb.has(k)), ...[...pb].filter(([k]) => !pa.has(k))].map(([, p]) => p);
  for (const k of shared) {
    const e = eqs.slice(0, -1).find(e => isOnly(e, "+", pa.get(k)!, pb.get(k)!));
    if (!e) return false;
    results.push(e.result);
  }
  const last = eqs.at(-1)!;
  return last.result === answer && isOnly(last, "+", ...results, ...rest);
}
/** Each shared place taken away, then the results joined: 80 - 40 = 40, 3 - 7 = -4, 40 - 4 = 36. */
function partialDifferences(a: number, b: number, answer: number, eqs: readonly Eq[]): boolean {
  const pa = places(a), pb = places(b);
  if ([...pb.keys()].some(k => !pa.has(k)) || pb.size < 2 || eqs.length !== pb.size + 1) return false;
  const adds = [...pa].filter(([k]) => !pb.has(k)).map(([, p]) => p), takes: number[] = [];
  for (const k of pb.keys()) {
    const e = eqs.slice(0, -1).find(e => e.ops.join() === "-" && e.nums[0] === pa.get(k) && e.nums[1] === pb.get(k));
    if (!e) return false;
    if (e.result >= 0) adds.push(e.result); else takes.push(-e.result);
  }
  const last = eqs.at(-1)!;
  if (last.result !== answer) return false;
  const plus = [last.nums[0], ...last.nums.slice(1).filter((_, n) => last.ops[n] === "+")], minus = last.nums.slice(1).filter((_, n) => last.ops[n] === "-");
  return sameNumbers(plus, adds) && sameNumbers(minus, takes);
}
/** Round one number, then put the difference back: 36 + 50 = 86, 86 - 3 = 83; or 83 - 50 = 33, 33 + 3 = 36. */
function compensated(sign: "+" | "-", s: number, other: number, answer: number, eqs: readonly Eq[]): boolean {
  const back = (r: number) => sign === "+" ? (r > other ? "-" : "+") : (r > other ? "+" : "-");
  if (eqs.length === 1) {
    const [e] = eqs;
    if (e.nums.length !== 3 || e.nums[0] !== s || e.ops[0] !== sign || e.result !== answer) return false;
    return roundedFor(e.nums[1], other) && e.nums[2] === Math.abs(e.nums[1] - other) && e.ops[1] === back(e.nums[1]);
  }
  if (eqs.length !== 2 || eqs[0].ops.join() !== sign || eqs[1].ops.length !== 1 || eqs[1].nums[0] !== eqs[0].result || eqs[1].result !== answer) return false;
  const r = eqs[0].nums[0] === s ? eqs[0].nums[1] : sign === "+" && eqs[0].nums[1] === s ? eqs[0].nums[0] : null;
  return r !== null && roundedFor(r, other) && eqs[1].nums[1] === Math.abs(r - other) && eqs[1].ops[0] === back(r);
}
/** One line per column, ones first, with a carry only when the column before it made one. The bare last line joins them. */
function columnAddition(a: number, b: number, eqs: readonly Eq[]): boolean {
  const da = digits(a), db = digits(b), size = Math.max(da.length, db.length);
  if (size < 2 || eqs.length !== size) return false;
  let carry = 0;
  return eqs.every((e, k) => {
    const want = [da[k], db[k], ...(carry ? [carry] : [])].filter(d => d !== undefined);
    if (want.length < 2 || !isOnly(e, "+", ...want)) return false;
    carry = e.result >= 10 ? 1 : 0;
    return true;
  });
}
/** One line per column, ones first, borrowing only when the top digit is too small. */
function columnSubtraction(a: number, b: number, eqs: readonly Eq[]): boolean {
  const da = digits(a), db = digits(b);
  if (da.length < 2 || db.length !== da.length || eqs.length !== da.length) return false;
  let borrow = 0;
  return eqs.every((e, k) => {
    const top = da[k] - borrow, needs = top < db[k];
    if (e.ops.join() !== "-" || e.nums[0] !== (needs ? top + 10 : top) || e.nums[1] !== db[k]) return false;
    borrow = needs ? 1 : 0;
    return true;
  });
}
function multiplicationKind(a: number, b: number, answer: number, w: Work): string | null {
  for (const [s, o] of [[a, b], [b, a]]) {
    if (s < 1 || o < 2) continue;
    if (w.list && (!w.tail || (w.tail.type === "bare" && w.tail.value === answer)) && w.list.length === o && w.list.at(-1) === answer && w.list.every((n, i) => n === s * (i + 1))) return "skip-counting";
    const run = w.eqs.length ? steps(w.eqs, "+", s) : null;
    if (run && plainTail(w, answer) && run.end === answer && run.amounts.length === o - 1 && run.amounts.every(n => n === s)) return "repeated-addition";
  }
  if (w.list || !plainTail(w, answer) || !w.eqs.length) return null;
  const last = w.eqs.at(-1)!;
  for (const [f, o] of [[a, b], [b, a]]) {
    const parts = placeParts(o);
    if (parts.length >= 2 && w.eqs.length === parts.length + 1 && last.result === answer) {
      const products = parts.map(p => w.eqs.slice(0, -1).find(e => isOnly(e, "×", f, p))?.result);
      if (products.every((n): n is number => n !== undefined) && isOnly(last, "+", ...products)) return "split-factor";
    }
    if (w.eqs.length === 3 && last.result === answer && last.ops.length === 1 && last.nums[0] === w.eqs[0].result && last.nums[1] === w.eqs[1].result) {
      const first = w.eqs[0], second = w.eqs[1], r = first.nums.find(n => roundedFor(n, o));
      if (r !== undefined && isOnly(first, "×", f, r) && isOnly(second, "×", f, Math.abs(r - o)) && last.ops[0] === (r > o ? "-" : "+")) return "round-and-adjust";
    }
  }
  const zeros = (n: number) => { let z = 0; while (n > 0 && n % 10 === 0) { n /= 10; z++; } return z; };
  const za = zeros(a), zb = zeros(b), ca = a / 10 ** za, cb = b / 10 ** zb, tens = 10 ** (za + zb);
  if (za + zb > 0 && last.result === answer && isOnly(last, "×", w.eqs[0].result, tens) && w.eqs.length >= 2 && isOnly(w.eqs[0], "×", ca, cb)) {
    if (w.eqs.length === 2) return "strip-zeros";
    if (w.eqs.length === 3 && za > 0 && zb > 0 && isOnly(w.eqs[1], "×", 10 ** za, 10 ** zb)) return "strip-zeros";
  }
  if (za > 0 && zb > 0 && w.eqs.length === 2 && last.result === answer) {
    if ((isOnly(w.eqs[0], "×", ca, b) && isOnly(last, "×", w.eqs[0].result, 10 ** za)) || (isOnly(w.eqs[0], "×", a, cb) && isOnly(last, "×", w.eqs[0].result, 10 ** zb))) return "strip-zeros-from-one";
  }
  return null;
}
/** Dividing by groups: `by` is the group and the answer is how many. A count must end these kinds. */
function divisionKind(by: number, target: number, answer: number, w: Work, inverse: boolean): string | null {
  if (by < 1) return null;
  const counted = w.tail !== null && w.tail.value === answer;
  if (w.list) return counted && w.list.length === answer && w.list.every((n, i) => n === by * (i + 1)) && w.list.at(-1) === target ? "skip-counting" : null;
  if (!w.eqs.length) return null;
  if (counted) {
    const down = steps(w.eqs, "-", target);
    if (down && down.end === 0 && down.amounts.length === answer && down.amounts.every(n => n === by)) return "repeated-subtraction";
    const up = steps(w.eqs, "+", by);
    if (up && up.end === target && up.amounts.length === answer - 1 && up.amounts.every(n => n === by)) return "repeated-addition";
  }
  if (!plainTail(w, answer)) return null;
  const last = w.eqs.at(-1)!;
  if (inverse && w.eqs.length === 1 && last.result === answer && last.ops.join() === "÷" && last.nums[0] === target && last.nums[1] === by) return "inverse-division";
  for (let k = 10; k <= target; k *= 10) {
    if (w.eqs.length === 1 && target % k === 0 && by % k === 0 && last.result === answer && last.ops.join() === "÷" && last.nums[0] === target / k && last.nums[1] === by / k) return "division-with-tens";
    if (w.eqs.length === 2 && target % k === 0 && last.result === answer) {
      const first = w.eqs[0];
      if (first.ops.join() === "÷" && first.nums[0] === target / k && first.nums[1] === by && isOnly(last, "×", first.result, k)) return "division-with-tens";
    }
  }
  const built = steps(w.eqs.slice(0, -1), "×", by);
  if (built && built.end === target && built.amounts.length >= 2 && built.amounts.every(n => n > 1) && last.result === answer && isOnly(last, "×", ...built.amounts)) return "build-up";
  return null;
}
const oneLine = (w: Work, sign: string, left: number, right: number, answer: number, commutes = false) =>
  !w.list && plainTail(w, answer) && w.eqs.length === 1 && w.eqs[0].result === answer && w.eqs[0].ops.join() === sign
  && (commutes ? sameNumbers(w.eqs[0].nums, [left, right]) : w.eqs[0].nums.join() === `${left},${right}`);
function recognize(shape: QuestionShape, answer: number, work: Work): string | null {
  switch (shape.kind) {
    case "add": return additionKind(shape.a, shape.b, answer, work);
    case "subtract": return subtractionKind(shape.a, shape.b, answer, work);
    case "multiply": return multiplicationKind(shape.a, shape.b, answer, work);
    case "divide": return divisionKind(shape.by, shape.target, answer, work, false);
    case "missing-factor": return divisionKind(shape.by, shape.target, answer, work, true);
    case "missing-addend": return oneLine(work, "-", shape.total, shape.a, answer) ? "inverse-subtraction" : subtractionKind(shape.total, shape.a, answer, work);
    case "missing-subtrahend": return oneLine(work, "-", shape.a, shape.rest, answer) ? "inverse-subtraction" : subtractionKind(shape.a, shape.rest, answer, work);
    case "missing-minuend": return oneLine(work, "+", shape.rest, shape.b, answer, true) ? "inverse-addition" : additionKind(shape.rest, shape.b, answer, work);
    case "missing-dividend": return oneLine(work, "×", shape.by, shape.quotient, answer, true) ? "inverse-multiplication" : multiplicationKind(shape.by, shape.quotient, answer, work);
  }
}
function asWork(lines: readonly Line[]): Work | null {
  const last = lines.at(-1);
  const tail = last?.type === "bare" || last?.type === "count" ? last : null;
  const body = tail ? lines.slice(0, -1) : lines;
  if (!body.length || body.some(l => l.type !== "eq" && l.type !== "list")) return null;
  const list = body.find(l => l.type === "list");
  if (list && body.length !== 1) return null;
  return { eqs: body.flatMap(l => l.type === "eq" ? [l.eq] : []), list: list?.type === "list" ? list.values : null, tail: tail && { type: tail.type as "bare" | "count", value: tail.value } };
}

/** The verdict on one method's transcribed work and the AI's judgment of it. A missing judgment is never valid. */
export function checkMethodReading(text: string, rule: MethodRule, judgment: MethodJudgment | null): MethodCheck {
  const { lines, unread, falseStep } = readWork(text);
  if (falseStep || judgment === "does-not-solve") return { verdict: "invalid", kind: null };
  const unknown: MethodCheck = { verdict: "unknown", kind: null };
  const answer = wholeText(rule.answer);
  if (judgment !== "solves" || unread || !lines.length || answer === null || !rule.shape || expectedAnswer(rule.shape) !== answer) return unknown;
  const work = asWork(lines), kind = work && recognize(rule.shape, answer, work);
  return kind ? { verdict: "valid", kind } : unknown;
}

// ---------- Made-up readings ----------

/** Two different kinds for offline route checks and synthetic photos. Never a mark and never sent to a model. */
function exampleMethods(shape: QuestionShape | null, answer: number): string[] {
  const split = (a: number, b: number, sign: "+" | "-") => {
    let at = a;
    return placeParts(b).map(p => { const next = sign === "+" ? at + p : at - p, line = `${at} ${sign} ${p} = ${next}`; at = next; return line; }).join("\n");
  };
  const round = (a: number, b: number, sign: "+" | "-") => {
    const r = (Math.floor(b / 10) + 1) * 10, d = r - b, x = sign === "+" ? a + r : a - r;
    return `${a} ${sign} ${r} = ${x}\n${x} ${sign === "+" ? "-" : "+"} ${d} = ${answer}`;
  };
  const skip = (by: number, count: number) => `${Array.from({ length: count }, (_, i) => by * (i + 1)).join(", ")}\n${count} times`;
  switch (shape?.kind) {
    case "add": return [split(shape.a, shape.b, "+"), round(shape.a, shape.b, "+")];
    case "subtract": return [split(shape.a, shape.b, "-"), round(shape.a, shape.b, "-")];
    case "missing-addend": return [`${shape.total} - ${shape.a} = ${answer}`, split(shape.total, shape.a, "-")];
    case "missing-subtrahend": return [`${shape.a} - ${shape.rest} = ${answer}`, split(shape.a, shape.rest, "-")];
    case "missing-minuend": return [`${shape.rest} + ${shape.b} = ${answer}`, split(shape.rest, shape.b, "+")];
    case "multiply": case "missing-dividend": {
      const [a, b] = shape.kind === "multiply" ? [shape.a, shape.b] : [shape.by, shape.quotient];
      const [f, o] = placeParts(b).length >= 2 ? [a, b] : [b, a], parts = placeParts(o), out: string[] = [];
      const z = (n: number) => { let c = 0; while (n > 0 && n % 10 === 0) { n /= 10; c++; } return c; };
      const za = z(a), zb = z(b), ca = a / 10 ** za, cb = b / 10 ** zb;
      if (parts.length >= 2) out.push(`${parts.map(p => `${f} × ${p} = ${f * p}`).join("\n")}\n${parts.map(p => f * p).join(" + ")} = ${answer}`);
      if (za + zb > 0) out.push(`${ca} × ${cb} = ${ca * cb}\n${ca * cb} × ${10 ** (za + zb)} = ${answer}`);
      if (za > 0 && zb > 0) out.push(`${ca} × ${b} = ${ca * b}\n${ca * b} × ${10 ** za} = ${answer}`);
      if (b <= 12) out.push(`${Array.from({ length: b }, () => a).join(" + ")} = ${answer}`);
      return out;
    }
    case "divide": case "missing-factor": {
      const { by, target } = shape, out: string[] = [];
      if (shape.kind === "missing-factor") out.push(`${target} ÷ ${by} = ${answer}`);
      if (target % 10 === 0 && by % 10 === 0) out.push(`${target / 10} ÷ ${by / 10} = ${answer}`);
      else if (target % 10 === 0 && (target / 10) % by === 0) out.push(`${target / 10} ÷ ${by} = ${target / 10 / by}\n${target / 10 / by} × 10 = ${answer}`);
      if (answer <= 12) out.push(skip(by, answer));
      return out;
    }
    default: return [];
  }
}
/** A made-up method: two kinds that code accepts, or a false step for `wrong`. Text code cannot read when no example fits. */
export function suppliedMethodText(rule: MethodRule, index: number, wrong = false): string {
  if (wrong) return index === 0 ? `${rule.answer} + 1 = ${rule.answer}` : `${rule.answer} + 2 = ${rule.answer}`;
  const answer = wholeText(rule.answer);
  return (answer === null ? [] : exampleMethods(rule.shape, answer))[index] ?? "no example for this question";
}
/** Padding on the answer, for offline route checks. It has no kind. */
export const suppliedFilledInText = (rule: MethodRule) => `${rule.answer} + 0 = ${rule.answer}`;
