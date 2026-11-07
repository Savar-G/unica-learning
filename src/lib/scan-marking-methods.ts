// Code's check of a two-ways method. The AI transcribes the work and says whether it is a way to solve the question.
// Code alone cannot judge that. Code checks the arithmetic and refuses a restatement of the question (D-302).
// Exact rational arithmetic. Pure TypeScript: no network, database, clock or Math.random.
//
// invalid: a written step is false, or the AI says does-not-solve.
// valid: the AI says solves, every step is true arithmetic, the work has working numbers of its own (it is not the
//   question with the answer filled in, nor its reverse or check), and it ends at the answer or a number in the question.
// unknown: anything else. It stays unsure, with a plain reason.

export type MethodVerdict = "valid" | "invalid" | "unknown";
export const METHOD_JUDGMENTS = ["solves", "does-not-solve", "unsure"] as const;
export type MethodJudgment = (typeof METHOD_JUDGMENTS)[number];
export interface MethodRule {
  /** Code's answer, as a number or a/b. */
  answer: string;
  /** The numbers printed in the question. */
  given: readonly string[];
  /** The printed question, sent with the method region. Never the answer. */
  question: string;
}

type Value = { n: bigint; d: bigint };
const ZERO = BigInt(0), ONE = BigInt(1);
const gcd = (a: bigint, b: bigint): bigint => { a = a < ZERO ? -a : a; b = b < ZERO ? -b : b; while (b !== ZERO) [a, b] = [b, a % b]; return a; };
function value(n: bigint, d: bigint): Value | null {
  if (d === ZERO) return null;
  const g = gcd(n, d) || ONE, sign = d < ZERO ? -ONE : ONE;
  return { n: sign * n / g, d: sign * d / g };
}
const same = (a: Value, b: Value) => a.n === b.n && a.d === b.d;
const key = (v: Value) => `${v.n}/${v.d}`;

type Token = { kind: "number"; value: Value } | { kind: "op"; op: "+" | "-" | "×" | "÷" } | { kind: "=" } | { kind: "(" } | { kind: ")" } | { kind: "?" } | { kind: "arrow" };
const NUMBER = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/;
const OPS: Record<string, "+" | "-" | "×" | "÷"> = { "+": "+", "-": "-", "−": "-", "–": "-", "\u2014": "-", "×": "×", x: "×", X: "×", "*": "×", "·": "×", "÷": "÷", "/": "÷" };

function numberValue(text: string): Value | null {
  const [whole, fraction = ""] = text.replaceAll(",", "").split(".");
  return value(BigInt(whole + fraction), BigInt(10) ** BigInt(fraction.length));
}
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
    if (OPS[ch]) out.push({ kind: "op", op: OPS[ch] });
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
function ruleValue(text: string): Value | null {
  const parts = tokens(text);
  return parts && parts.length ? evaluate(parts) : null;
}

interface Step { tokens: Token[]; sides: Value[]; holds: boolean }
const hasOp = (parts: readonly Token[]) => parts.some(t => t.kind === "op");
/** A jump line: "36 +40 → 76 +7 → 83". Each jump must land on the number the next part starts from. */
function jumpSteps(line: readonly Token[]): Step[] | null {
  const parts: Token[][] = [[]];
  for (const t of line) if (t.kind === "arrow") parts.push([]); else parts.at(-1)!.push(t);
  const out: Step[] = [];
  for (const [n, part] of parts.entries()) {
    const own = evaluate(part);
    if (!own) return null;
    if (n === parts.length - 1) { out.push({ tokens: part, sides: [own], holds: true }); continue; }
    // A bare number has no operation to check, so the arrow says nothing code can test.
    const next = parts[n + 1][0];
    if (!hasOp(part) || next?.kind !== "number") return null;
    out.push({ tokens: part, sides: [own, next.value], holds: same(own, next.value) });
  }
  return out;
}
/** One equation chain per line. A line that starts with "=" goes on from the line before it. */
function steps(text: string): { read: Step[]; unread: boolean } {
  const read: Step[] = [];
  let unread = false, carry: Token[] | null = null;
  const lines = text.split(/[\n;]/).map(l => l.trim()).filter(Boolean);
  const chains: Token[][] = [];
  for (const line of lines) {
    const parts = tokens(line);
    if (!parts) { unread = true; carry = null; continue; }
    // The child copied the question: "8 × ? = 800". It claims nothing about the answer.
    if (parts.some(t => t.kind === "?")) { carry = null; continue; }
    if (parts[0]?.kind === "=" && carry) { carry.push(...parts); continue; }
    carry = parts; chains.push(parts);
  }
  for (const chain of chains) {
    if (chain.some(t => t.kind === "arrow")) {
      const jumps = jumpSteps(chain);
      if (jumps) read.push(...jumps); else unread = true;
      continue;
    }
    const sides: Token[][] = [[]];
    for (const t of chain) if (t.kind === "=") sides.push([]); else sides.at(-1)!.push(t);
    const values = sides.map(evaluate);
    if (values.some(v => !v)) { unread = true; continue; }
    const known = values as Value[];
    read.push({ tokens: chain, sides: known, holds: known.every(v => same(v, known[0])) });
  }
  return { read, unread };
}

/** The verdict on one method's transcribed work and the AI's judgment of it. A missing judgment is never valid. */
export function checkMethodReading(text: string, rule: MethodRule, judgment: MethodJudgment | null): MethodVerdict {
  const { read, unread } = steps(text);
  if (read.some(s => !s.holds) || judgment === "does-not-solve") return "invalid";
  const answer = ruleValue(rule.answer), given = rule.given.flatMap(g => { const v = ruleValue(g); return v ? [v] : []; });
  if (judgment !== "solves" || unread || !read.length || !answer || !read.some(s => hasOp(s.tokens))) return "unknown";
  // Every number is the question's, the answer, or padding (0 and 1): the question filled in, its reverse or its check.
  const own = [answer, ...given, value(ZERO, ONE)!, value(ONE, ONE)!].map(key);
  const literals = read.flatMap(s => s.tokens.flatMap(t => t.kind === "number" ? [key(t.value)] : []));
  if (literals.every(l => own.includes(l))) return "unknown";
  const last = read.at(-1)!.sides.at(-1)!;
  return same(last, answer) || given.some(g => same(g, last)) ? "valid" : "unknown";
}

const canonical = (text: string) => text.replace(/\s+/g, "").replace(/[xX*·]/g, "×").replace(/[−–\u2014]/g, "-").replace(/\//g, "÷");
/** Whether two methods are the same work: letter for letter, or the same numbers and symbols in another order. */
export function compareMethods(one: string, two: string): "same" | "reordered" | "different" {
  const a = canonical(one), b = canonical(two);
  if (a === b) return "same";
  const parts = (t: string) => (t.match(/\d[\d,.]*|[^\d]/g) ?? []).sort().join(" ");
  return parts(a) === parts(b) ? "reordered" : "different";
}

/** A made-up reading for offline route checks and synthetic photos. Never a mark and never sent to a model. */
export function suppliedMethodText(rule: MethodRule, index: number, wrong = false): string {
  if (wrong) return index === 0 ? `${rule.answer} + 1 = ${rule.answer}` : `${rule.answer} + 2 = ${rule.answer}`;
  return index === 0 ? `${rule.answer} + 97 - 97 = ${rule.answer}` : `${rule.answer} × 89 ÷ 89 = ${rule.answer}`;
}
/** The filled-in question, for offline route checks. */
export function suppliedFilledInText(rule: MethodRule): string {
  return rule.given.length ? `${rule.given[0]} + ${rule.answer} - ${rule.given[0]} = ${rule.answer}` : `${rule.answer} + 0 = ${rule.answer}`;
}
