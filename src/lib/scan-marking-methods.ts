// Code's check of a two-ways method. The AI transcribes the work and says whether it is a way to solve the question.
// Code alone cannot judge that. Code checks the arithmetic and refuses a restatement of the question (D-302).
// Exact rational arithmetic. Pure TypeScript: no network, database, clock or Math.random.
//
// invalid: a written step is false, or the AI says does-not-solve.
// valid: the AI says solves, every step is true arithmetic, and the work meets all of these:
//   (a) its final result is the answer;
//   (b) the answer is never an operand in it, unless the question prints the same number;
//   (c) it is not the question's own operation on the question's own printed numbers.
//   So an inverse operation on the question's numbers is valid, and a check that uses the answer is not.
// unknown: anything else. It stays unsure, with a plain reason. A missing method is decided by the item, not here.

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
  /** The question's own operations. Empty when neither its text nor its package says. */
  ops: readonly string[];
}
const OPERATION_SIGNS: Record<string, string> = { add: "+", subtract: "-", multiply: "×", divide: "÷" };
/** The operation the question prints. The stored operation is used only when the text shows none: 8 × ? = 800 is stored as a division. */
export function questionOps(text: string, operationKind: string | null | undefined): string[] {
  const printed = [...text.matchAll(/(?:\d|\?)\s*([+\-−–×xX*·÷/])\s*(?=\d|\?)/g)].map(m => OPS[m[1]]);
  if (printed.length) return [...new Set(printed)];
  const stored = operationKind ? OPERATION_SIGNS[operationKind] : undefined;
  return stored ? [stored] : [];
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

/** One line of work. Each side is what stands between "=" signs or arrows. */
interface Step { sides: { tokens: Token[]; value: Value }[]; holds: boolean; counted?: boolean }
const hasOp = (parts: readonly Token[]) => parts.some(t => t.kind === "op");
/** A jump line: "36 +40 → 76 +7 → 83". Each jump must land on the number the next part starts from. */
function jumpSteps(line: readonly Token[]): Step[] | null {
  const parts: Token[][] = [[]];
  for (const t of line) if (t.kind === "arrow") parts.push([]); else parts.at(-1)!.push(t);
  const out: Step[] = [];
  for (const [n, part] of parts.entries()) {
    const own = evaluate(part);
    if (!own) return null;
    if (n === parts.length - 1) { out.push({ sides: [{ tokens: part, value: own }], holds: true }); continue; }
    // A bare number has no operation to check, so the arrow says nothing code can test.
    const next = parts[n + 1][0];
    if (!hasOp(part) || next?.kind !== "number") return null;
    out.push({ sides: [{ tokens: part, value: own }, { tokens: [next], value: next.value }], holds: same(own, next.value) });
  }
  return out;
}
/** A skip count: "8, 16, 24, 32, 40". It holds only when it goes up by one number, and it reads as counted groups. */
function skipCount(line: string): Step | null {
  if (!/^\d+(?:\s*,\s*\d+){2,}$/.test(line)) return null;
  const values = line.split(",").map(n => numberValue(n.trim()));
  if (values.some(v => !v)) return null;
  const known = values as Value[], gap = known[1].n - known[0].n;
  if (known.some((v, i) => i > 0 && (v.d !== ONE || known[i - 1].d !== ONE || v.n - known[i - 1].n !== gap))) return null;
  return { sides: [{ tokens: known.map(value => ({ kind: "number", value })), value: known.at(-1)! }], holds: true, counted: true };
}
/** One equation chain per line. A line that starts with "=" goes on from the line before it. */
function steps(text: string): { read: Step[]; unread: boolean } {
  const read: Step[] = [];
  let unread = false, carry: Token[] | null = null;
  const lines = text.split(/[\n;]/).map(l => l.trim()).filter(Boolean);
  const chains: (Token[] | Step)[] = [];
  for (const [n, raw] of lines.entries()) {
    // Only the last line may state the result in words: "5 times".
    const line = n === lines.length - 1 ? raw.replace(/^(\d[\d,]*(?:\.\d+)?)\s+[a-z ]+$/i, "$1") : raw;
    const count = skipCount(line);
    if (count) { chains.push(count); carry = null; continue; }
    const parts = tokens(line);
    if (!parts) { unread = true; carry = null; continue; }
    // The child copied the question: "8 × ? = 800". It claims nothing about the answer.
    if (parts.some(t => t.kind === "?")) { carry = null; continue; }
    if (parts[0]?.kind === "=" && carry) { carry.push(...parts); continue; }
    carry = parts; chains.push(parts);
  }
  for (const chain of chains) {
    if (!Array.isArray(chain)) { read.push(chain); continue; }
    if (chain.some(t => t.kind === "arrow")) {
      const jumps = jumpSteps(chain);
      if (jumps) read.push(...jumps); else unread = true;
      continue;
    }
    const groups: Token[][] = [[]];
    for (const t of chain) if (t.kind === "=") groups.push([]); else groups.at(-1)!.push(t);
    const values = groups.map(evaluate);
    if (values.some(v => !v)) { unread = true; continue; }
    const known = values as Value[];
    read.push({ sides: groups.map((tokens, n) => ({ tokens, value: known[n] })), holds: known.every(v => same(v, known[0])) });
  }
  return { read, unread };
}
const numbersIn = (side: readonly Token[]) => side.flatMap(t => t.kind === "number" ? [t.value] : []);

/** The verdict on one method's transcribed work and the AI's judgment of it. A missing judgment is never valid. */
export function checkMethodReading(text: string, rule: MethodRule, judgment: MethodJudgment | null): MethodVerdict {
  const { read, unread } = steps(text);
  if (read.some(s => !s.holds) || judgment === "does-not-solve") return "invalid";
  const answer = ruleValue(rule.answer), given = rule.given.flatMap(g => { const v = ruleValue(g); return v ? [v] : []; });
  if (judgment !== "solves" || unread || !read.length || !answer || !read.some(s => s.counted || s.sides.some(side => hasOp(side.tokens)))) return "unknown";
  // (a) The final result is the answer.
  if (!same(read.at(-1)!.sides.at(-1)!.value, answer)) return "unknown";
  const opSides = read.flatMap(s => s.sides.map(side => side.tokens).filter(hasOp));
  // (b) The answer is never an operand, unless the question prints the same number.
  if (!given.some(g => same(g, answer)) && opSides.some(side => numbersIn(side).some(n => same(n, answer)))) return "unknown";
  // (c) Not the question's own operation on its own numbers. 0 and 1 are padding, so they do not count as working numbers.
  const padding = [value(ZERO, ONE)!, value(ONE, ONE)!];
  const ownNumbers = opSides.length > 0 && opSides.every(side => numbersIn(side).every(n => [...given, ...padding].some(g => same(g, n))));
  const used = opSides.flatMap(side => side.flatMap(t => t.kind === "op" ? [t.op as string] : []));
  if (ownNumbers && (!rule.ops.length || used.every(op => rule.ops.includes(op)))) return "unknown";
  return "valid";
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
  // Working numbers of its own, with a final result that is the answer and is never an operand.
  const answer = ruleValue(rule.answer), add = BigInt(index === 0 ? 97 : 89);
  if (!answer) return `${add} - ${add} = ${rule.answer}`;
  const start = answer.n + add * answer.d;
  return `${answer.d === ONE ? String(start) : `${start} / ${answer.d}`} - ${add} = ${rule.answer}`;
}
/** A check that uses the answer, for offline route checks. */
export function suppliedFilledInText(rule: MethodRule): string {
  return rule.given.length ? `${rule.given[0]} + ${rule.answer} - ${rule.given[0]} = ${rule.answer}` : `${rule.answer} + 0 = ${rule.answer}`;
}
