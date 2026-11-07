// Code's check of a two-ways method. The AI only transcribes the work; this module decides what the arithmetic shows.
// Exact rational arithmetic. Pure TypeScript: no network, database, clock or Math.random.
//
// valid: every step is true, the method uses a number from the question, and it holds the right answer.
// invalid: a step is false, the work is only a number, or true steps stop at a number that is neither the answer nor one
//   from the question.
// unknown: code cannot tell (words, a symbol it cannot read, or true steps it cannot tie to the question or the answer).
// A limit: code checks that the arithmetic is true, not that the method is a sensible way to teach the question.

export type MethodVerdict = "valid" | "invalid" | "unknown";
export interface MethodRule {
  /** Code's answer, as a number or a/b. */
  answer: string;
  /** The numbers printed in the question. */
  given: readonly string[];
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

type Token = { kind: "number"; value: Value } | { kind: "op"; op: "+" | "-" | "×" | "÷" } | { kind: "=" } | { kind: "(" } | { kind: ")" } | { kind: "?" };
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
    const sides: Token[][] = [[]];
    for (const t of chain) if (t.kind === "=") sides.push([]); else sides.at(-1)!.push(t);
    const values = sides.map(evaluate);
    if (values.some(v => !v)) { unread = true; continue; }
    const known = values as Value[];
    read.push({ tokens: chain, sides: known, holds: known.every(v => same(v, known[0])) });
  }
  return { read, unread };
}

/** The verdict on one method's transcribed work. */
export function checkMethodReading(text: string, rule: MethodRule): MethodVerdict {
  const { read, unread } = steps(text);
  if (read.some(s => !s.holds)) return "invalid";
  const answer = ruleValue(rule.answer), given = rule.given.flatMap(g => { const v = ruleValue(g); return v ? [v] : []; });
  if (unread || !read.length || !answer) return "unknown";
  if (!read.some(s => s.tokens.some(t => t.kind === "op"))) return "invalid";
  const seen = new Set(read.flatMap(s => [...s.sides.map(key), ...s.tokens.flatMap(t => t.kind === "number" ? [key(t.value)] : [])]));
  if (seen.has(key(answer)) && given.some(g => seen.has(key(g)))) return "valid";
  const last = read.at(-1)!.sides.at(-1)!;
  return same(last, answer) || given.some(g => same(g, last)) ? "unknown" : "invalid";
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
  const given = rule.given.find(g => { const v = ruleValue(g); return v && v.n !== ZERO; }) ?? "1";
  if (wrong) return index === 0 ? `${given} + 1 = ${given}` : `${given} + 2 = ${given}`;
  return index === 0 ? `${given} + ${rule.answer} - ${given} = ${rule.answer}` : `${given} × ${rule.answer} ÷ ${given} = ${rule.answer}`;
}
