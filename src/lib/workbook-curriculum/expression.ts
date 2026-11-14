/** A bounded interpreter for the expression language in the progression brief. No host runtime access. */
const ZERO = BigInt(0), ONE = BigInt(1), TWO = BigInt(2);
import { INPUT_LIMITS, assertExpressionInput, ExpressionError } from "./limits";
export { ExpressionError } from "./limits";
const MAX_BITS = INPUT_LIMITS.integerBits;
const MAX_INTEGER = (BigInt(1) << BigInt(MAX_BITS)) - BigInt(1);
const fail = (message: string): never => { throw new ExpressionError(message); };
function bounded(n: bigint): bigint {
  if (n < -MAX_INTEGER || n > MAX_INTEGER) fail("Integer exceeds the 256-bit value limit");
  return n;
}
function integerPower(base: bigint, exponent: bigint, budget: EvaluationBudget): bigint {
  let result = ONE;
  while (exponent > ZERO) {
    budget.step();
    if (exponent % TWO !== ZERO) result = bounded(result * base);
    exponent /= TWO;
    if (exponent > ZERO) base = bounded(base * base);
  }
  return result;
}
function gcd(a: bigint, b: bigint, budget: EvaluationBudget): bigint {
  bounded(a); bounded(b);
  a = a < ZERO ? -a : a; b = b < ZERO ? -b : b;
  while (b !== ZERO) { budget.step(); [a, b] = [b, a % b]; }
  return a;
}
/** Reduced exact rational. A denominator of one still has Fraction semantics. */
export class FractionValue {
  readonly numerator: bigint;
  readonly denominator: bigint;
  constructor(n: bigint, d: bigint = ONE, budget = new EvaluationBudget()) {
    bounded(n); bounded(d);
    if (d === ZERO) fail("Division by zero");
    const g = gcd(n, d, budget), sign = d < ZERO ? -ONE : ONE;
    this.numerator = bounded(n / g * sign); this.denominator = bounded(d / g * sign);
  }
}
/** Exact finite decimal. Division still produces a float unless a Fraction is involved. */
export class DecimalValue extends FractionValue {
  constructor(n: bigint, d: bigint = ONE, readonly negativeZero = false, budget = new EvaluationBudget()) { super(n, d, budget); }
}
export function decimalValue(value: string | number, budget = new EvaluationBudget()): DecimalValue {
  const text = String(value);
  if (text.length > INPUT_LIMITS.stringLength) fail("Decimal input exceeds the string length limit");
  const match = text.match(/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!match || !(match[2] || match[3]) || !Number.isFinite(Number(text))) return fail("Invalid finite decimal");
  const digits = (match[2] || "0") + (match[3] || ""), places = (match[3]?.length ?? 0) - Number(match[4] ?? 0);
  if (Math.abs(places) > 76) fail("Decimal exceeds the precision limit");
  const n = bounded(BigInt(digits) * (match[1] === "-" ? -ONE : ONE)), scale = bounded(BigInt(10) ** BigInt(Math.abs(places)));
  return new DecimalValue(places < 0 ? bounded(n * scale) : n, places > 0 ? scale : ONE, match[1] === "-" && n === ZERO, budget);
}
/** Numeric equality across exact decimals, integers and computed floats. */
export function numericCompare(a: ExpressionValue, b: ExpressionValue, budget = new EvaluationBudget()): number { return compare(a, b, budget); }
class TupleValue {
  constructor(readonly items: readonly ExpressionValue[]) { Object.freeze(items); Object.freeze(this); }
}
function hashable(value: ExpressionValue, budget: EvaluationBudget, depth = 0): boolean {
  budget.step(); budget.depth(depth);
  if (Array.isArray(value) || value instanceof SetValue) return false;
  return !(value instanceof TupleValue) || value.items.every(item => hashable(item, budget, depth + 1));
}
class SetValue {
  readonly items: readonly ExpressionValue[];
  constructor(items: ExpressionValue[], budget: EvaluationBudget) {
    budget.created(items);
    const unique: ExpressionValue[] = [];
    for (const item of items) {
      if (!hashable(item, budget)) fail("Unhashable set member");
      if (!unique.some(v => equal(v, item, budget))) unique.push(item);
    }
    this.items = Object.freeze(unique); Object.freeze(this);
  }
}
export type ExpressionValue = bigint | number | string | boolean | FractionValue | SetValue | TupleValue | readonly ExpressionValue[];
export type Bindings = Readonly<Record<string, ExpressionValue>>;
export const EVALUATION_LIMITS = Object.freeze({ work: 50000, depth: 32, expandedValueSize: 4096, totalValueSize: 32768, outputLength: 2048 });
/** One budget per fill, including retries, all expressions, collection operations and rendered output. */
export class EvaluationBudget {
  private remainingWork = EVALUATION_LIMITS.work;
  private remainingValues = EVALUATION_LIMITS.totalValueSize;
  private readonly sizes = new WeakMap<object, { size: number; depth: number }>();
  step(cost = 1): void {
    this.remainingWork -= cost;
    if (this.remainingWork < 0) fail("Evaluation exceeds the work limit");
  }
  depth(depth: number): void {
    if (depth > EVALUATION_LIMITS.depth) fail("Evaluation exceeds the value nesting limit");
  }
  private stats(value: ExpressionValue, depth = 0): { size: number; depth: number } {
    this.step(); this.depth(depth);
    if (typeof value === "string") {
      if (value.length > INPUT_LIMITS.stringLength) fail("Value string exceeds the length limit");
      return { size: 1 + value.length, depth: 0 };
    }
    const items = Array.isArray(value) ? value : value instanceof TupleValue || value instanceof SetValue ? value.items : null;
    if (!items) {
      if (typeof value === "bigint") bounded(value);
      else if (typeof value === "number") finite(value);
      else if (value instanceof FractionValue) { bounded(value.numerator); bounded(value.denominator); }
      return { size: 1, depth: 0 };
    }
    if (items.length > INPUT_LIMITS.collectionLength) fail("Collection exceeds the length limit");
    const cached = this.sizes.get(value as object);
    if (cached) { this.depth(depth + cached.depth); return cached; }
    let size = 1, nested = 0;
    for (const item of items) {
      const child = this.stats(item, depth + 1);
      size += child.size; nested = Math.max(nested, child.depth + 1);
      if (size > EVALUATION_LIMITS.expandedValueSize) fail("Evaluation exceeds the expanded value size limit");
    }
    const result = { size, depth: nested };
    this.sizes.set(value as object, result); return result;
  }
  created<T extends ExpressionValue>(value: T): T {
    this.remainingValues -= this.stats(value).size;
    if (this.remainingValues < 0) fail("Evaluation exceeds the total value size limit");
    return value;
  }
  output(length: number): void {
    if (length > EVALUATION_LIMITS.outputLength) fail("Evaluation exceeds the output string length limit");
  }
  append(current: string, part: string): string {
    this.output(current.length + part.length); this.step(part.length + 1);
    return current + part;
  }
}

const functions = new Set(["gcd", "lcm", "floor", "ceil", "round", "abs", "min", "max", "sqrt", "isqrt", "int", "str", "Fraction", "sum", "len", "sorted"]);
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
export function validName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(name) && !forbidden.has(name) && !functions.has(name) && !["pi", "True", "False", "and", "or", "not", "in", "for", "if", "else"].includes(name);
}
/** A parsed expression: read-only, for code that explains an expression step by step (question-package-steps.ts). */
export type ExpressionNode = Node;
type Node =
  | { kind: "value"; value: ExpressionValue }
  | { kind: "name"; name: string }
  | { kind: "list" | "set" | "tuple"; items: Node[] }
  | { kind: "unary"; op: string; child: Node }
  | { kind: "binary"; op: string; left: Node; right: Node }
  | { kind: "compare"; first: Node; rest: { op: string; right: Node }[] }
  | { kind: "conditional"; yes: Node; condition: Node; no: Node }
  | { kind: "call"; name: string; args: Node[]; reverse?: Node }
  | { kind: "index"; target: Node; index: Node };
type Token = { text: string; value?: ExpressionValue };
function tokenize(source: string, budget: EvaluationBudget): Token[] {
  assertExpressionInput(source);
  const tokens: Token[] = [];
  for (let i = 0; i < source.length;) {
    budget.step();
    const c = source[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'" || c === '"') {
      let value = ""; const quote = c; i++;
      while (i < source.length && source[i] !== quote) {
        budget.step();
        let ch = source[i++];
        if (ch === "\\") {
          ch = source[i++];
          const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", "\\": "\\", "'": "'", '"': '"' };
          if (!Object.hasOwn(escapes, ch)) fail(`Unsupported string escape: \\${ch}`);
          ch = escapes[ch];
        }
        value += ch;
      }
      if (source[i++] !== quote) fail("Unclosed string literal");
      tokens.push({ text: "literal", value });
    } else {
      const tail = source.slice(i);
      const number = tail.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      const name = tail.match(/^[A-Za-z_][A-Za-z0-9_]*/);
      const op = tail.match(/^(?:\*\*|\/\/|<=|>=|==|!=|[+\-*/%<>()\[\]{},=])/);
      if (number) {
        const text = number[0];
        tokens.push({ text: "literal", value: /[.eE]/.test(text) ? decimalValue(text, budget) : bounded(BigInt(text)) }); i += text.length;
      } else if (name) { tokens.push({ text: name[0] }); i += name[0].length; }
      else if (op) { tokens.push({ text: op[0] }); i += op[0].length; }
      else fail(`Unsupported token ${JSON.stringify(c)} at position ${i}`);
    }
    if (tokens.length > INPUT_LIMITS.expressionTokens) fail("Expression exceeds the token limit");
  }
  tokens.push({ text: "<end>" }); return tokens;
}
class Parser {
  private at = 0;
  private depth = 0;
  private readonly tokens: Token[];
  get tokenCount(): number { return this.tokens.length - 1; }
  readonly names = new Set<string>();
  constructor(source: string, private readonly budget: EvaluationBudget) { this.tokens = tokenize(source, budget); }
  private peek() { return this.tokens[this.at].text; }
  private take(text: string) { this.budget.step(); if (this.peek() === text) { this.at++; return true; } return false; }
  private need(text: string) {
    if (this.peek() === "for") fail("Generator expressions and comprehensions are not supported");
    if (!this.take(text)) fail(`Expected ${text}, found ${this.peek()}`);
  }
  parse(): Node { const n = this.expression(); this.need("<end>"); return n; }
  private expression(): Node {
    if (++this.depth > INPUT_LIMITS.expressionDepth) fail("Expression exceeds the nesting limit");
    let n = this.or();
    if (this.take("if")) { const condition = this.or(); this.need("else"); n = { kind: "conditional", yes: n, condition, no: this.expression() }; }
    this.depth--; return n;
  }
  private chain(next: () => Node, ops: string[]): Node {
    let n = next();
    while (ops.includes(this.peek())) { this.budget.step(); const op = this.tokens[this.at++].text; n = { kind: "binary", op, left: n, right: next() }; }
    return n;
  }
  private or = (): Node => this.chain(this.and, ["or"]);
  private and = (): Node => this.chain(this.not, ["and"]);
  private not = (): Node => {
    if (!this.take("not")) return this.compare();
    if (++this.depth > INPUT_LIMITS.expressionDepth) fail("Expression exceeds the nesting limit");
    const child = this.not(); this.depth--; return { kind: "unary", op: "not", child };
  };
  private compare(): Node {
    const first = this.add(), rest: { op: string; right: Node }[] = [];
    while (["<", ">", "<=", ">=", "==", "!=", "in"].includes(this.peek()) || this.peek() === "not" && this.tokens[this.at + 1].text === "in") {
      const op = this.tokens[this.at++].text;
      if (op === "not") this.need("in");
      rest.push({ op: op === "not" ? "not in" : op, right: this.add() });
    }
    return rest.length ? { kind: "compare", first, rest } : first;
  }
  private add = (): Node => this.chain(this.multiply, ["+", "-"]);
  private multiply = (): Node => this.chain(this.unary, ["*", "/", "//", "%"]);
  private unary = (): Node => {
    if (!["+", "-"].includes(this.peek())) return this.power();
    if (++this.depth > INPUT_LIMITS.expressionDepth) fail("Expression exceeds the nesting limit");
    const op = this.tokens[this.at++].text, child = this.unary(); this.depth--; return { kind: "unary", op, child };
  };
  private power(): Node {
    const left = this.atom();
    return this.take("**") ? { kind: "binary", op: "**", left, right: this.unaryWithDepth() } : left;
  }
  private unaryWithDepth(): Node {
    if (++this.depth > INPUT_LIMITS.expressionDepth) fail("Expression exceeds the nesting limit");
    const n = this.unary(); this.depth--; return n;
  }
  private sequence(end: string): Node[] {
    const items: Node[] = [];
    if (!this.take(end)) { do { items.push(this.expression()); } while (this.take(",") && this.peek() !== end); this.need(end); }
    return items;
  }
  private atom(): Node {
    const t = this.tokens[this.at++]; let n: Node;
    if (t.text === "literal") n = { kind: "value", value: t.value! };
    else if (t.text === "[") n = { kind: "list", items: this.sequence("]") };
    else if (t.text === "{") {
      if (this.peek() === "}") fail("Empty braces are a dictionary; dictionaries are not supported");
      n = { kind: "set", items: this.sequence("}") };
    }
    else if (t.text === "(") {
      if (this.take(")")) return { kind: "tuple", items: [] };
      n = this.expression();
      if (this.take(",")) { const items = [n]; if (this.peek() !== ")") do { items.push(this.expression()); } while (this.take(",") && this.peek() !== ")"); n = { kind: "tuple", items }; }
      this.need(")");
    } else if (["True", "False", "pi"].includes(t.text)) n = { kind: "value", value: t.text === "pi" ? Math.PI : t.text === "True" };
    else if (/^[A-Za-z][A-Za-z0-9_]*$/.test(t.text) && !forbidden.has(t.text)) {
      if (this.take("(")) {
        if (!functions.has(t.text)) fail(`Unknown function: ${t.text}`);
        const args: Node[] = []; let reverse: Node | undefined;
        if (!this.take(")")) {
          do {
            if (this.peek() === "reverse" && this.tokens[this.at + 1].text === "=") {
              if (t.text !== "sorted" || reverse || args.length !== 1) fail("Only sorted accepts reverse after one argument");
              this.at += 2; reverse = this.expression();
            } else { if (reverse) fail("Positional argument after reverse"); args.push(this.expression()); }
          } while (this.take(",") && this.peek() !== ")");
          this.need(")");
        }
        n = { kind: "call", name: t.text, args, reverse };
      } else {
        if (!validName(t.text)) fail(`Reserved name: ${t.text}`);
        this.names.add(t.text); n = { kind: "name", name: t.text };
      }
    } else return fail(`Unsupported token or name: ${t.text}`);
    while (this.take("[")) { const index = this.expression(); this.need("]"); n = { kind: "index", target: n, index }; }
    return n;
  }
}
function finite(x: number): number {
  if (!Number.isFinite(x)) fail("Non-finite numeric result");
  if (Math.abs(x) >= 2 ** MAX_BITS) fail("Number exceeds the 256-bit value limit");
  return x;
}
function numeric(v: ExpressionValue): bigint | number | FractionValue {
  if (typeof v === "bigint") return bounded(v);
  if (typeof v === "number") return finite(v);
  if (v instanceof FractionValue) return v;
  if (typeof v === "boolean") return v ? ONE : ZERO;
  return fail("Expected a number");
}
function floating(v: ExpressionValue): number {
  const n = numeric(v); return finite(n instanceof FractionValue ? Number(n.numerator) / Number(n.denominator) : Number(n));
}
function integral(v: ExpressionValue): bigint {
  const n = numeric(v); if (typeof n === "bigint") return n;
  if (n instanceof FractionValue && n.denominator === ONE) return n.numerator;
  return fail("Expected an integer");
}
function rational(v: ExpressionValue, budget: EvaluationBudget): FractionValue {
  const n = numeric(v); if (n instanceof FractionValue) { bounded(n.numerator); bounded(n.denominator); return n; }
  if (typeof n === "bigint") return new FractionValue(n, ONE, budget);
  // Exact IEEE-754 value, including subnormals. This is also Python's float rounding input.
  if (n === 0) return new FractionValue(ZERO, ONE, budget);
  const view = new DataView(new ArrayBuffer(8)); view.setFloat64(0, n);
  const hi = view.getUint32(0), lo = view.getUint32(4), exp = (hi >>> 20) & 2047;
  let mantissa = (BigInt(hi & 0xfffff) << BigInt(32)) + BigInt(lo);
  if (exp) mantissa += ONE << BigInt(52);
  if (hi >>> 31) mantissa = -mantissa;
  const shift = (exp || 1) - 1023 - 52;
  return shift >= 0 ? new FractionValue(mantissa << BigInt(shift), ONE, budget) : new FractionValue(mantissa, ONE << BigInt(-shift), budget);
}
const floorRatio = (n: bigint, d: bigint) => { const q = n / d; return n % d !== ZERO && (n < ZERO) !== (d < ZERO) ? q - ONE : q; };
function truth(v: ExpressionValue): boolean {
  if (v instanceof FractionValue) return v.numerator !== ZERO;
  if (v instanceof SetValue || v instanceof TupleValue) return v.items.length > 0;
  return Array.isArray(v) ? v.length > 0 : !!v;
}
function compare(a: ExpressionValue, b: ExpressionValue, budget = new EvaluationBudget()): number {
  budget.step();
  if (typeof a === "string" && typeof b === "string") { budget.step(a.length + b.length); return a < b ? -1 : a > b ? 1 : 0; }
  const decimal = a instanceof DecimalValue || b instanceof DecimalValue;
  const x = rational(decimal && typeof a === "number" ? decimalValue(a, budget) : a, budget), y = rational(decimal && typeof b === "number" ? decimalValue(b, budget) : b, budget), d = x.numerator * y.denominator - y.numerator * x.denominator;
  return d < ZERO ? -1 : d > ZERO ? 1 : 0;
}
function equal(a: ExpressionValue, b: ExpressionValue, budget: EvaluationBudget, depth = 0): boolean {
  budget.step(); budget.depth(depth);
  if (a instanceof TupleValue || b instanceof TupleValue) return a instanceof TupleValue && b instanceof TupleValue && a.items.length === b.items.length && a.items.every((v, i) => equal(v, b.items[i], budget, depth + 1));
  if (a instanceof SetValue || b instanceof SetValue) return a instanceof SetValue && b instanceof SetValue && a.items.length === b.items.length && a.items.every(v => b.items.some(w => equal(v, w, budget, depth + 1)));
  if (typeof a === "string" || typeof b === "string") { budget.step((typeof a === "string" ? a.length : 0) + (typeof b === "string" ? b.length : 0)); return a === b; }
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i], budget, depth + 1));
  return compare(a, b, budget) === 0;
}
function contains(container: ExpressionValue, value: ExpressionValue, budget: EvaluationBudget): boolean {
  budget.step();
  if (typeof container === "string") { budget.step(container.length + (typeof value === "string" ? value.length : 0)); return typeof value === "string" ? container.includes(value) : fail("String membership requires a string"); }
  if (container instanceof SetValue || container instanceof TupleValue) return container.items.some(v => equal(v, value, budget));
  if (Array.isArray(container)) return container.some(v => equal(v, value, budget));
  return fail("Membership requires a string, list, tuple or set");
}
function decimalArithmetic(op: string, a: ExpressionValue, b: ExpressionValue, budget: EvaluationBudget): ExpressionValue {
  const x = typeof a === "number" ? decimalValue(a, budget) : rational(a, budget), y = typeof b === "number" ? decimalValue(b, budget) : rational(b, budget);
  const l = new FractionValue(x.numerator, x.denominator, budget), r = new FractionValue(y.numerator, y.denominator, budget);
  const result = binary(op, l, op === "**" && r.denominator === ONE ? r.numerator : r, budget);
  if (!(result instanceof FractionValue)) return typeof result === "bigint" ? new DecimalValue(result, ONE, false, budget) : result;
  let d = result.denominator;
  while (d % TWO === ZERO) { budget.step(); d /= TWO; }
  while (d % BigInt(5) === ZERO) { budget.step(); d /= BigInt(5); }
  if (d !== ONE) return result;
  const negativeZero = result.numerator === ZERO && op === "*" && Object.is(floating(a) * floating(b), -0);
  return new DecimalValue(result.numerator, result.denominator, negativeZero, budget);
}
function binary(op: string, a: ExpressionValue, b: ExpressionValue, budget: EvaluationBudget): ExpressionValue {
  budget.step();
  if (op === "+" && typeof a === "string" && typeof b === "string") {
    return budget.append(a, b);
  }
  const x = numeric(a), y = numeric(b);
  const exactFraction = (n: typeof x) => n instanceof FractionValue && !(n instanceof DecimalValue);
  if (op === "/" && !exactFraction(x) && !exactFraction(y)) {
    if (!truth(y)) fail("Division by zero"); return finite(floating(x) / floating(y));
  }
  if ((x instanceof DecimalValue || y instanceof DecimalValue) && !exactFraction(x) && !exactFraction(y)) {
    return decimalArithmetic(op, x, y, budget);
  }
  if (op === "**") {
    if (typeof y === "bigint" && typeof x !== "number") {
      if (y > BigInt(MAX_BITS) || y < -BigInt(MAX_BITS)) fail("Exponent exceeds the limit");
      const f = rational(x, budget), power = y < ZERO ? -y : y;
      const n = integerPower(f.numerator, power, budget), d = integerPower(f.denominator, power, budget);
      if (y < ZERO) return x instanceof FractionValue ? new FractionValue(d, n, budget) : finite(Number(d) / Number(n));
      return x instanceof FractionValue ? new FractionValue(n, d, budget) : bounded(n);
    }
    return finite(floating(x) ** floating(y));
  }
  if (op === "/" && !(x instanceof FractionValue || y instanceof FractionValue)) {
    if (!truth(y)) fail("Division by zero"); return finite(floating(x) / floating(y));
  }
  if (typeof x === "number" || typeof y === "number") {
    const l = floating(x), r = floating(y);
    if (["/", "//", "%"].includes(op) && r === 0) fail("Division by zero");
    if (op === "//" || op === "%") {
      let mod = l % r, div = (l - mod) / r;
      if (mod && (mod < 0) !== (r < 0)) { mod += r; div--; }
      if (op === "%") return finite(mod);
      const floored = Math.floor(div);
      return finite(div - floored > 0.5 ? floored + 1 : floored);
    }
    return finite(op === "+" ? l + r : op === "-" ? l - r : op === "*" ? l * r : op === "/" ? l / r : op === "//" ? Math.floor(l / r) : ((l % r) + r) % r);
  }
  const l = rational(x, budget), r = rational(y, budget);
  if (["/", "//", "%"].includes(op) && r.numerator === ZERO) fail("Division by zero");
  if (op === "//") return bounded(floorRatio(l.numerator * r.denominator, l.denominator * r.numerator));
  if (op === "%") return binary("-", x, binary("*", binary("//", x, y, budget), y, budget), budget);
  const n = op === "+" ? l.numerator * r.denominator + r.numerator * l.denominator : op === "-" ? l.numerator * r.denominator - r.numerator * l.denominator : op === "*" ? l.numerator * r.numerator : l.numerator * r.denominator;
  const d = op === "/" ? l.denominator * r.numerator : l.denominator * r.denominator;
  const result = new FractionValue(n, d, budget);
  return x instanceof FractionValue || y instanceof FractionValue ? result : result.numerator;
}
function halfEven(n: bigint, d: bigint): bigint {
  const q = floorRatio(n, d), rem = n - q * d;
  return rem * TWO > d || (rem * TWO === d && q % TWO !== ZERO) ? q + ONE : q;
}
function scaledRound(v: ExpressionValue, places: number, budget: EvaluationBudget): bigint {
  if (!Number.isInteger(places) || Math.abs(places) > 100) fail("Precision must be an integer from -100 to 100");
  const f = rational(v, budget), scale = BigInt(10) ** BigInt(Math.abs(places));
  return halfEven(f.numerator * (places >= 0 ? scale : ONE), f.denominator * (places < 0 ? scale : ONE));
}
/** Python fixed-point format, with ties to even using the exact stored numeric value. */
export function formatFixed(v: ExpressionValue, places: number, budget = new EvaluationBudget()): string {
  budget.step();
  if (places < 0) fail("Fixed precision must not be negative");
  const n = scaledRound(v, places, budget), negative = n < ZERO || (n === ZERO && (v instanceof DecimalValue && v.negativeZero || floating(v) < 0 || Object.is(floating(v), -0)));
  const digits = (n < ZERO ? -n : n).toString().padStart(places + 1, "0");
  return (negative ? "-" : "") + (places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits);
}
function formatScalar(v: ExpressionValue, budget: EvaluationBudget): string {
  if (v instanceof DecimalValue) {
    if (v.numerator === ZERO && v.negativeZero) return "-0.0";
    if (v.denominator === ONE) return `${v.numerator}.0`;
    let d = v.denominator, places = 0;
    while (d !== ONE && places < 1000) { budget.step(); d /= gcd(d, BigInt(10), budget); places++; }
    if (d !== ONE) return fail("Decimal does not have a finite expansion");
    return formatFixed(v, places, budget);
  }
  if (v instanceof FractionValue) return v.denominator === ONE ? String(v.numerator) : `${v.numerator}/${v.denominator}`;
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") {
    if (Object.is(v, -0)) return "-0.0";
    const magnitude = Math.abs(v);
    if (magnitude !== 0 && (magnitude < 0.0001 || magnitude >= 1e16)) {
      const [mantissa, exponent] = v.toExponential().split("e");
      return `${mantissa}e${Number(exponent) < 0 ? "-" : "+"}${String(Math.abs(Number(exponent))).padStart(2, "0")}`;
    }
    return Number.isInteger(v) ? `${v}.0` : String(v);
  }
  return String(v);
}
export function formatValue(value: ExpressionValue, budget = new EvaluationBudget()): string {
  budget.created(value);
  let output = "";
  const write = (part: string) => { output = budget.append(output, part); };
  const visit = (value: ExpressionValue, depth: number, quote = false): void => {
    budget.step(); budget.depth(depth);
    const items = Array.isArray(value) ? value : value instanceof TupleValue || value instanceof SetValue ? value.items : null;
    if (items) {
      write(Array.isArray(value) ? "[" : value instanceof TupleValue ? "(" : "{");
      for (let i = 0; i < items.length; i++) {
        if (i) write(", ");
        visit(items[i], depth + 1, !(value instanceof SetValue));
      }
      if (value instanceof TupleValue && items.length === 1) write(",");
      write(Array.isArray(value) ? "]" : value instanceof TupleValue ? ")" : "}");
    } else {
      if (quote && typeof value === "string") write("'");
      write(formatScalar(value, budget));
      if (quote && typeof value === "string") write("'");
    }
  };
  visit(value, 0); return output;
}
function iterable(v: ExpressionValue, budget: EvaluationBudget): readonly ExpressionValue[] {
  budget.step();
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { budget.step(v.length); return [...v]; }
  if (v instanceof SetValue || v instanceof TupleValue) return v.items;
  return fail("Expected a list or a string");
}
function call(name: string, a: ExpressionValue[], budget: EvaluationBudget, reverse?: ExpressionValue): ExpressionValue {
  budget.step();
  const arity: Record<string, [number, number]> = { gcd: [0, 100], lcm: [0, 100], floor: [1, 1], ceil: [1, 1], round: [1, 2], abs: [1, 1], min: [1, 100], max: [1, 100], sqrt: [1, 1], isqrt: [1, 1], int: [1, 1], str: [1, 1], Fraction: [1, 2], sum: [1, 2], len: [1, 1], sorted: [1, 1] };
  const [lo, hi] = arity[name]; if (a.length < lo || a.length > hi) fail(`Invalid argument count for ${name}`);
  const x = a[0];
  switch (name) {
    case "str": return formatValue(x, budget);
    case "int": {
      if (typeof x === "string") return /^[+-]?\d+$/.test(x.trim()) ? bounded(BigInt(x.trim())) : fail("Invalid integer string");
      const f = rational(x, budget); return bounded(f.numerator / f.denominator);
    }
    case "Fraction": {
      if (a.length === 2) return new FractionValue(integral(x), integral(a[1]), budget);
      const f = rational(x, budget); return new FractionValue(f.numerator, f.denominator, budget);
    }
    case "gcd": return a.reduce<bigint>((v, x) => { budget.step(); return gcd(v, integral(x), budget); }, ZERO);
    case "lcm": return a.reduce<bigint>((v, x) => {
      budget.step(); const n = integral(x);
      if (v === ZERO || n === ZERO) return ZERO;
      const result = bounded(v / gcd(v, n, budget) * n);
      return result < ZERO ? -result : result;
    }, ONE);
    case "floor": { const f = rational(x, budget); return floorRatio(f.numerator, f.denominator); }
    case "ceil": { const f = rational(x, budget); return -floorRatio(-f.numerator, f.denominator); }
    case "abs": return compare(x, ZERO, budget) < 0 ? binary("*", x, -ONE, budget) : numeric(x);
    case "round": {
      const places = a.length === 2 ? Number(integral(a[1])) : 0, n = scaledRound(x, places, budget);
      if (a.length === 1) return bounded(n);
      if (typeof x === "bigint" && places >= 0) return x;
      if (typeof x === "bigint") return bounded(n * BigInt(10) ** BigInt(-places));
      if (x instanceof DecimalValue) {
        const negativeZero = n === ZERO && (x.numerator < ZERO || x.negativeZero);
        return places >= 0 ? new DecimalValue(n, BigInt(10) ** BigInt(places), negativeZero, budget) : new DecimalValue(n * BigInt(10) ** BigInt(-places), ONE, negativeZero, budget);
      }
      if (x instanceof FractionValue) return places >= 0 ? new FractionValue(n, BigInt(10) ** BigInt(places), budget) : new FractionValue(n * BigInt(10) ** BigInt(-places), ONE, budget);
      return n === ZERO && (floating(x) < 0 || Object.is(floating(x), -0)) ? -0 : finite(Number(`${n}e${-places}`));
    }
    case "min": case "max": {
      const items = a.length === 1 ? iterable(x, budget) : a;
      if (!items.length) fail(`${name} has an empty list`);
      return items.reduce((v, n) => (compare(n, v, budget) * (name === "min" ? 1 : -1) < 0 ? n : v));
    }
    case "sqrt": { const n = floating(x); if (n < 0) fail("Square root of a negative number"); return finite(Math.sqrt(n)); }
    case "isqrt": {
      const n = integral(x); if (n < ZERO) fail("Square root of a negative number");
      if (n < TWO) return n;
      let r = ONE << BigInt(Math.ceil(n.toString(2).length / 2));
      for (;;) { budget.step(); const next = (r + n / r) / TWO; if (next >= r) return r; r = next; }
    }
    case "len": return BigInt(iterable(x, budget).length);
    case "sum": return iterable(x, budget).reduce<ExpressionValue>((v, n) => binary("+", v, n, budget), a[1] ?? ZERO);
    case "sorted": {
      if (reverse !== undefined && typeof reverse !== "boolean") fail("sorted reverse must be a boolean");
      return [...iterable(x, budget)].sort((l, r) => compare(l, r, budget) * (reverse ? -1 : 1));
    }
    default: return fail(`Unknown function: ${name}`);
  }
}
export interface CompiledExpression {
  readonly names: readonly string[];
  readonly inputProfile: { characters: number; tokens: number; depth: number };
  /** The parsed tree. Evaluate any part of it with evaluateTree. */
  readonly tree: ExpressionNode;
  evaluate(values?: Bindings, budget?: EvaluationBudget): ExpressionValue;
}
/** Parse once, then evaluate with only the supplied own names. Lazy branches retain Python semantics. */
export function compileExpression(source: string, budget = new EvaluationBudget()): CompiledExpression {
  const parser = new Parser(source, budget), tree = parser.parse();
  let maximumDepth = 0;
  const pending: { node: Node; depth: number }[] = [{ node: tree, depth: 0 }];
  while (pending.length) {
    budget.step();
    const { node, depth } = pending.pop()!;
    maximumDepth = Math.max(maximumDepth, depth);
    if (depth > INPUT_LIMITS.expressionDepth) fail("Expression exceeds the evaluation nesting limit");
    for (const value of Object.values(node)) {
      if (value && typeof value === "object" && "kind" in value) pending.push({ node: value as Node, depth: depth + 1 });
      else if (Array.isArray(value)) for (const part of value) {
        if (part && typeof part === "object") {
          if ("kind" in part) pending.push({ node: part as Node, depth: depth + 1 });
          else if ("right" in part) pending.push({ node: part.right, depth: depth + 1 });
        }
      }
    }
  }
  return { names: [...parser.names], inputProfile: { characters: source.length, tokens: parser.tokenCount, depth: maximumDepth }, tree,
    evaluate: (values = {}, budget = new EvaluationBudget()) => evaluateTree(tree, values, budget) };
}
/** Evaluate a tree from compileExpression, or any part of one, with the same rules as evaluate. */
export function evaluateTree(tree: ExpressionNode, values: Bindings = {}, budget = new EvaluationBudget()): ExpressionValue {
  {
    const run = (node: Node, depth = 0): ExpressionValue => {
      budget.step(); budget.depth(depth);
      return budget.created(evaluateNode(node, depth));
    };
    const evaluateNode = (n: Node, depth: number): ExpressionValue => {
      const child = (node: Node) => run(node, depth + 1);
      switch (n.kind) {
        case "value": return n.value;
        case "name": return Object.hasOwn(values, n.name) ? values[n.name] : fail(`Unknown name: ${n.name}`);
        case "list": return Object.freeze(n.items.map(child));
        case "set": return new SetValue(n.items.map(child), budget);
        case "tuple": return new TupleValue(n.items.map(child));
        case "unary": { const v = child(n.child); return n.op === "not" ? !truth(v) : n.op === "+" ? numeric(v) : binary("*", -ONE, v, budget); }
        case "binary": {
          const l = child(n.left);
          if (n.op === "and") return truth(l) ? child(n.right) : l;
          if (n.op === "or") return truth(l) ? l : child(n.right);
          return binary(n.op, l, child(n.right), budget);
        }
        case "compare": {
          let l = child(n.first);
          for (const part of n.rest) {
            const r = child(part.right), op = part.op;
            const ok = op === "in" ? contains(r, l, budget) : op === "not in" ? !contains(r, l, budget) : op === "==" ? equal(l, r, budget) : op === "!=" ? !equal(l, r, budget) : op === "<" ? compare(l, r, budget) < 0 : op === ">" ? compare(l, r, budget) > 0 : op === "<=" ? compare(l, r, budget) <= 0 : compare(l, r, budget) >= 0;
            if (!ok) return false; l = r;
          }
          return true;
        }
        case "conditional": return truth(child(n.condition)) ? child(n.yes) : child(n.no);
        case "call": return call(n.name, n.args.map(child), budget, n.reverse && child(n.reverse));
        case "index": {
          const target = child(n.target);
          if (target instanceof SetValue) fail("Sets do not support indexing");
          const items = iterable(target, budget), index = Number(integral(child(n.index))), at = index < 0 ? items.length + index : index;
          return at >= 0 && at < items.length ? items[at] : fail(`Index ${index} is outside the list`);
        }
      }
    };
    return run(tree);
  }
}
export function evaluateExpression(source: string, values: Bindings = {}): ExpressionValue { return compileExpression(source).evaluate(values); }
export function expressionIsTrue(value: ExpressionValue): boolean { return truth(value); }
