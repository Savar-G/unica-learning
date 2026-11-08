// Code's check of a two-ways method (D-302). The AI transcribes the work and says whether it solves the question.
// Code fails closed with a narrow allow-list: only the first book's two question shapes have methods, and each has a
// small fixed set of exact templates. A template states every line: which numbers may appear, where, each one derived
// from the printed numbers, and the exact final result. A method that does not match one template exactly is unsure.
// Every other shape (1 × ? = n, ? ÷ 1 = n, c ÷ ? = a, ? - a = c, sums, stories) has no template, so it is unsure.
//
// Shapes:
//   tens product    a × b = ?, one factor a tens number (7 × 360, 50 × 80). No factor is 1 or a power of ten.
//   missing factor  k × ? = t or ? × k = t (8 × ? = 800). k and the answer are 2 or more, and the answer is not k.
//
// invalid: a written step is false, or the AI says does-not-solve.
// valid: the AI says solves, every step is true, no ban applies, and the work matches one template exactly.
// unknown: anything else.
//
// Exact rational arithmetic checks the steps. Pure TypeScript: no network, database, clock or Math.random.

/** The exact templates per shape. Two different templates, each valid, are two ways. */
export const METHOD_TEMPLATES = {
  "tens-product": ["split-place", "strip-zeros", "round-up"],
  // Groups of k: a build-up from multiples of k, a skip count (a build-up in chunks of 1 × k) and repeated subtraction
  // (the same count going down) are one strategy written three ways (D-302).
  "missing-factor": ["divide", "groups-of-k"],
} as const;
const TEMPLATE_IDS: ReadonlySet<string> = new Set(Object.values(METHOD_TEMPLATES).flat());
/** Whether two recognized templates are two different ways. Unknown templates never are. */
export const differentStrategies = (_shape: QuestionShape, a: string, b: string): boolean => a !== b && TEMPLATE_IDS.has(a) && TEMPLATE_IDS.has(b);

export type QuestionShape =
  | { kind: "add"; a: number; b: number } | { kind: "subtract"; a: number; b: number } | { kind: "multiply"; a: number; b: number }
  | { kind: "divide"; target: number; by: number } | { kind: "missing-factor"; by: number; target: number }
  | { kind: "missing-divisor"; target: number; quotient: number }
  | { kind: "missing-addend"; a: number; total: number } | { kind: "missing-subtrahend"; a: number; rest: number }
  | { kind: "missing-minuend"; b: number; rest: number } | { kind: "missing-dividend"; by: number; quotient: number };
export type MethodVerdict = "valid" | "invalid" | "unknown";
export interface MethodCheck { verdict: MethodVerdict; kind: string | null }
export const METHOD_JUDGMENTS = ["solves", "does-not-solve", "unsure"] as const;
export type MethodJudgment = (typeof METHOD_JUDGMENTS)[number];
export interface MethodRule {
  /** Code's answer, as a number or a/b. A fraction or decimal has no method template. */
  answer: string;
  /** The printed question, sent with the method region. Never the answer. */
  question: string;
  /** The printed equation's shape. null: no printed equation code can read, so no method can be valid. */
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
  return left === null ? { kind: "missing-dividend", by: known, quotient: result } : { kind: "missing-divisor", target: known, quotient: result };
}
/**
 * Only a printed equation gives a shape: 8 × ? = 800 is a missing factor whatever operation the package stores. A story
 * with no printed equation has no shape, so its methods go to our team.
 */
export function questionShape(text: string): QuestionShape | null {
  const found = [...text.matchAll(EQUATION)];
  if (found.length !== 1) return null;
  const [, left, sign, right, result] = found[0];
  const read = (side: string) => /^[?_]/.test(side) ? { unknown: true, n: null } : { unknown: false, n: wholeText(side) };
  const parts = [read(left), read(right), read(result)];
  if (parts.some(p => !p.unknown && p.n === null)) return null;
  return shapeOf(SIGNS[sign], parts[0].n, parts[1].n, parts[2].n);
}
export const methodRuleFor = (text: string, _operation: { kind: string } | null | undefined, answer: string): MethodRule =>
  ({ answer, question: text, shape: questionShape(text) });

const zeros = (n: number) => { let z = 0; while (n > 0 && n % 10 === 0) { n /= 10; z++; } return z; };
const core = (n: number) => n / 10 ** zeros(n);
/** One of the two shapes with templates, with code's answer. Anything else: null. */
type Supported = { kind: "tens-product"; a: number; b: number; answer: number } | { kind: "missing-factor"; k: number; t: number; answer: number };
function supported(shape: QuestionShape | null, answer: number | null): Supported | null {
  if (!shape || answer === null) return null;
  if (shape.kind === "multiply") {
    const { a, b } = shape, tens = [a, b].filter(n => zeros(n) > 0);
    if (a < 2 || b < 2 || !tens.length || tens.some(n => core(n) < 2) || a * b !== answer || !Number.isSafeInteger(answer)) return null;
    return { kind: "tens-product", a, b, answer };
  }
  if (shape.kind === "missing-factor") {
    const { by: k, target: t } = shape;
    if (k < 2 || answer < 2 || answer === k || k * answer !== t) return null;
    return { kind: "missing-factor", k, t, answer };
  }
  return null;
}

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
  // Children often write steps on one line, split by commas: "36 + 40 = 76, 76 + 7 = 83". Only whole equations split, so a skip count keeps its commas.
  const raw = text.split(/[\n;]/).map(l => l.trim()).filter(Boolean).flatMap(l => { const parts = l.split(/,\s+/).map(p => p.trim()); return parts.length > 1 && parts.every(p => p.includes("=")) ? parts : [l]; });
  // "... so 5" on the last line states the result or the count, as a line of its own would.
  const so = raw.length ? new RegExp(`^(.*\\S)\\s+so\\s+(${NUMBER_TEXT})$`, "i").exec(raw.at(-1)!) : null;
  if (so) raw.splice(-1, 1, so[1], so[2]);
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
        // The last part is the landing only: one bare number, which the step before it already checked.
        if (n === parts.length - 1) { if (part.length !== 1 || part[0].kind !== "number") unread = true; break; }
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

// ---------- Bans and templates ----------

interface Work { eqs: Eq[]; list: number[] | null; tail: { type: "bare" | "count"; value: number } | null }
const sorted = (ns: readonly number[]) => [...ns].sort((a, b) => a - b);
const sameNumbers = (a: readonly number[], b: readonly number[]) => a.length === b.length && sorted(a).every((n, i) => n === sorted(b)[i]);
/** Place-value parts, largest first: 360 is 300 and 60. */
const placeParts = (n: number) => [...String(n)].flatMap((d, i, all) => d === "0" ? [] : [Number(d) * 10 ** (all.length - 1 - i)]);
/** One operation on two numbers, in either order. */
const pairIs = (e: Eq, op: string, x: number, y: number) => e.ops.length === 1 && e.ops[0] === op && sameNumbers(e.nums, [x, y]);
/** Numbers in exactly this order, joined by one sign. */
const lineIs = (e: Eq, op: string, nums: readonly number[]) => e.ops.every(o => o === op) && e.nums.length === nums.length && e.nums.every((n, i) => n === nums[i]);
/** n and every whole number made from n by taking zeros off its end: 4800, 480, 48. */
const withZerosOff = (n: number) => { const out = [n]; while (n % 10 === 0 && n > 0) { n /= 10; out.push(n); } return out; };

export type MethodBan = "unread" | "not-a-step" | "unsupported-question" | "filled-in" | "reverse-check" | "padding" | "answer-operand";
function signed(e: Eq): { n: number; sign: string }[] { return e.nums.map((n, i) => ({ n, sign: i === 0 ? (e.ops[0] === "-" ? "+" : e.ops[0]) : e.ops[i - 1] })); }
const UNDO: Record<string, string> = { "+": "-", "-": "+", "×": "÷", "÷": "×" };
/** Padding: × 1, ÷ 1, + 0, - 0, and a number put on and taken off again (+ n - n), in one line or in two lines. */
function padded(eqs: readonly Eq[]): boolean {
  if (eqs.some(e => signed(e).some(({ n, sign }, i) => ((sign === "×" || sign === "÷") && n === 1 && (i > 0 || e.ops[0] === "×"))
    || ((sign === "+" || sign === "-") && n === 0)))) return true;
  if (eqs.some(e => e.ops.every(o => o === "+" || o === "-") && signed(e).some((x, i, all) => i > 0 && x.sign === "+" && all.some((y, j) => j > 0 && y.sign === "-" && y.n === x.n)))) return true;
  return eqs.some((e, i) => {
    const before = eqs[i - 1];
    if (!before || e.ops.length !== 1 || before.ops.length !== 1 || e.nums[0] !== before.result || e.ops[0] !== UNDO[before.ops[0]]) return false;
    // 36 + 5 = 41, 41 - 5 = 36. For + and × either number of the first line may be the one taken off again.
    return e.nums[1] === before.nums[1] || ((before.ops[0] === "+" || before.ops[0] === "×") && e.nums[1] === before.nums[0]);
  });
}
/** The first ban that applies, or null. Each ban has its own test. */
function banOf(q: Supported, work: Work): MethodBan | null {
  const { answer } = q;
  if (q.kind === "tens-product") {
    // The filled-in question, in either order: 7 × 360 = 2520 or 360 × 7 = 2520.
    if (work.eqs.some(e => pairIs(e, "×", q.a, q.b))) return "filled-in";
    // No template divides, so every division is a check that undoes the product: 2520 ÷ 7, 252 ÷ 7.
    if (work.eqs.some(e => e.ops.includes("÷"))) return "reverse-check";
  } else {
    // k × answer = t, in either order.
    if (work.eqs.some(e => pairIs(e, "×", q.k, answer))) return "filled-in";
    // A product of k (or k with zeros taken off) and the answer with zeros taken off: 8 × 43 = 344 for 8 × ? = 3440.
    const ks = withZerosOff(q.k), qs = withZerosOff(answer);
    if (work.eqs.some(e => e.ops.length === 1 && e.ops[0] === "×" && e.nums.some((n, i) => ks.includes(n) && qs.includes(e.nums[1 - i])))) return "reverse-check";
  }
  if (padded(work.eqs)) return "padding";
  // The answer is an operand nowhere, the final line included: it may only be a result.
  if (work.eqs.some(e => e.nums.includes(answer))) return "answer-operand";
  return null;
}

function tensProduct(q: Supported & { kind: "tens-product" }, w: Work): string | null {
  const { a, b, answer } = q, eqs = w.eqs, last = eqs.at(-1);
  if (w.list || w.tail || !last || last.result !== answer) return null;
  for (const [f, o] of [[a, b], [b, a]]) {
    // Split one factor by place value: 7 × 300 = 2100, 7 × 60 = 420, 2100 + 420 = 2520.
    const parts = placeParts(o);
    if (parts.length >= 2 && eqs.length === parts.length + 1 && parts.every((p, i) => pairIs(eqs[i], "×", f, p)) && lineIs(last, "+", parts.map(p => f * p))) return "split-place";
  }
  if (eqs.length === 2) {
    // Strip the zeros of a tens factor: its core times the other factor, then times 10^k. Both factors may lose zeros.
    const forms: [number, number, number][] = [];
    for (const [t, g] of [[a, b], [b, a]]) if (zeros(t) > 0) forms.push([core(t), g, 10 ** zeros(t)]);
    if (zeros(a) > 0 && zeros(b) > 0) forms.push([core(a), core(b), 10 ** (zeros(a) + zeros(b))]);
    if (forms.some(([c, g, p]) => pairIs(eqs[0], "×", c, g) && pairIs(last, "×", c * g, p))) return "strip-zeros";
  }
  if (eqs.length === 3) {
    // Round one factor up, then take off the stated difference: 10 × 360 = 3600, 3 × 360 = 1080, 3600 - 1080 = 2520.
    // Up only: rounding down is a split. The difference is never a factor of the question, the answer or 1.
    for (const [g, h] of [[a, b], [b, a]]) {
      const step = g % 10 !== 0 ? 10 : g % 100 !== 0 ? 100 : 0;
      if (!step) continue;
      const r = Math.ceil(g / step) * step, d = r - g;
      if (d < 2 || [a, b, answer].includes(d) || [a, b].includes(r)) continue;
      if (pairIs(eqs[0], "×", r, h) && pairIs(eqs[1], "×", d, h) && lineIs(last, "-", [r * h, d * h])) return "round-up";
    }
  }
  return null;
}
function missingFactor(q: Supported & { kind: "missing-factor" }, w: Work): string | null {
  const { k, t, answer } = q, eqs = w.eqs;
  const counted = w.tail !== null && w.tail.value === answer;
  if (w.list) {
    // Skip count by k from k to t, then the count: 50, 100, ..., 1000, 20 times.
    return counted && w.list.length === answer && w.list.every((n, i) => n === k * (i + 1)) ? "groups-of-k" : null;
  }
  const last = eqs.at(-1);
  if (!last) return null;
  if (counted) {
    // Take k away from t down to 0, one line each, then the count.
    return eqs.length === answer && eqs.every((e, i) => lineIs(e, "-", [t - i * k, k])) && last.result === 0 ? "groups-of-k" : null;
  }
  if (w.tail) return null;
  if (eqs.length === 1 && last.result === answer) {
    // The inverse division, t ÷ k, or the same division with the same zeros taken off both numbers (480 ÷ 6 for 4800 ÷ 60).
    for (let p = 1; t % p === 0 && k % p === 0 && k / p >= 2; p *= 10) if (lineIs(last, "÷", [t / p, k / p])) return "divide";
    return null;
  }
  // Build up t from exact multiples of k, stated step by step, then add the multipliers:
  // 8 × 400 = 3200, 8 × 30 = 240, 3200 + 240 = 3440, 400 + 30 = 430.
  const n = eqs.length - 2;
  if (n < 2) return null;
  const ms = eqs.slice(0, n).map(e => e.ops.length === 1 && e.ops[0] === "×" && e.nums.length === 2 ? e.nums[0] === k ? e.nums[1] : e.nums[1] === k ? e.nums[0] : null : null);
  if (ms.some(m => m === null || m < 2 || m >= answer)) return null;
  const multipliers = ms as number[];
  return lineIs(eqs[n], "+", multipliers.map(m => k * m)) && eqs[n].result === t && lineIs(last, "+", multipliers) && last.result === answer ? "groups-of-k" : null;
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
function examine(text: string, rule: MethodRule): { falseStep: boolean; ban: MethodBan | null; template: string | null } {
  const { lines, unread, falseStep } = readWork(text);
  if (unread || !lines.length) return { falseStep, ban: "unread", template: null };
  const work = asWork(lines);
  if (!work) return { falseStep, ban: "not-a-step", template: null };
  const q = supported(rule.shape, wholeText(rule.answer));
  if (!q) return { falseStep, ban: "unsupported-question", template: null };
  const ban = banOf(q, work);
  if (ban) return { falseStep, ban, template: null };
  return { falseStep, ban: null, template: q.kind === "tens-product" ? tensProduct(q, work) : missingFactor(q, work) };
}
/** The ban that keeps this work from being a method, or null. For tests and for the team's notes. */
export const methodBan = (text: string, rule: MethodRule): MethodBan | null => examine(text, rule).ban;

/** The verdict on one method's transcribed work and the AI's judgment of it. A missing judgment is never valid. */
export function checkMethodReading(text: string, rule: MethodRule, judgment: MethodJudgment | null): MethodCheck {
  const { falseStep, ban, template } = examine(text, rule);
  if (falseStep || judgment === "does-not-solve") return { verdict: "invalid", kind: null };
  return judgment === "solves" && !ban && template ? { verdict: "valid", kind: template } : { verdict: "unknown", kind: null };
}

// ---------- Made-up readings ----------

/** Two different templates for offline route checks and synthetic photos. Never a mark and never sent to a model. */
function exampleMethods(q: Supported | null): string[] {
  if (!q) return [];
  if (q.kind === "tens-product") {
    const { a, b, answer } = q, out: string[] = [];
    for (const [f, o] of [[a, b], [b, a]]) {
      const parts = placeParts(o);
      if (parts.length >= 2 && !out.length) out.push(`${parts.map(p => `${f} × ${p} = ${f * p}`).join("\n")}\n${parts.map(p => f * p).join(" + ")} = ${answer}`);
    }
    const [t, g] = zeros(a) > 0 ? [a, b] : [b, a];
    out.push(`${core(t)} × ${g} = ${core(t) * g}\n${core(t) * g} × ${10 ** zeros(t)} = ${answer}`);
    for (const [r0, h] of [[b, a], [a, b]]) {
      const step = r0 % 10 !== 0 ? 10 : r0 % 100 !== 0 ? 100 : 0, r = step ? Math.ceil(r0 / step) * step : 0, d = r - r0;
      if (step && d >= 2 && ![a, b, answer].includes(d) && ![a, b].includes(r)) { out.push(`${r} × ${h} = ${r * h}\n${d} × ${h} = ${d * h}\n${r * h} - ${d * h} = ${answer}`); break; }
    }
    return out;
  }
  const { k, t, answer } = q, parts = placeParts(answer);
  const ms = parts.length >= 2 && parts.every(p => p >= 2) ? parts : answer % 2 === 0 && answer / 2 >= 2 ? [answer / 2, answer / 2] : [answer - 2, 2];
  return [`${t} ÷ ${k} = ${answer}`, `${ms.map(m => `${k} × ${m} = ${k * m}`).join("\n")}\n${ms.map(m => k * m).join(" + ")} = ${t}\n${ms.join(" + ")} = ${answer}`];
}
/** A made-up method: two templates that code accepts, or a false step for `wrong`. Text code cannot read when no example fits. */
export function suppliedMethodText(rule: MethodRule, index: number, wrong = false): string {
  if (wrong) return index === 0 ? `${rule.answer} + 1 = ${rule.answer}` : `${rule.answer} + 2 = ${rule.answer}`;
  return exampleMethods(supported(rule.shape, wholeText(rule.answer)))[index] ?? "no example for this question";
}
/** Padding on the answer, for offline route checks. It has no template. */
export const suppliedFilledInText = (rule: MethodRule) => `${rule.answer} + 0 = ${rule.answer}`;
