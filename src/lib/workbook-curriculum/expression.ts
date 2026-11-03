/** A bounded interpreter for the expression language in the progression brief. No host runtime access. */
const ZERO = BigInt(0), ONE = BigInt(1), TWO = BigInt(2);
const MAX_BITS = 4096;
export class ExpressionError extends Error {
  constructor(message: string) { super(message); this.name = "ExpressionError"; }
}
const fail = (message: string): never => { throw new ExpressionError(message); };
function bounded(n: bigint): bigint {
  if (n.toString(2).length > MAX_BITS) fail("Integer exceeds the 4096-bit limit");
  return n;
}
function gcd(a: bigint, b: bigint): bigint {
  a = a < ZERO ? -a : a; b = b < ZERO ? -b : b;
  while (b !== ZERO) [a, b] = [b, a % b];
  return a;
}
/** Reduced exact rational. A denominator of one still has Fraction semantics. */
export class FractionValue {
  readonly numerator: bigint;
  readonly denominator: bigint;
  constructor(n: bigint, d: bigint = ONE) {
    if (d === ZERO) fail("Division by zero");
    const g = gcd(n, d), sign = d < ZERO ? -ONE : ONE;
    this.numerator = bounded(n / g * sign); this.denominator = bounded(d / g * sign);
  }
}
export type ExpressionValue = bigint | number | string | boolean | FractionValue | readonly ExpressionValue[];
export type Bindings = Readonly<Record<string, ExpressionValue>>;
const functions = new Set(["gcd", "lcm", "floor", "ceil", "round", "abs", "min", "max", "sqrt", "isqrt", "int", "str", "Fraction", "sum", "len", "sorted"]);
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
export function validName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(name) && !forbidden.has(name) && !functions.has(name) && !["pi", "True", "False", "and", "or", "not", "if", "else"].includes(name);
}
type Node =
  | { kind: "value"; value: ExpressionValue }
  | { kind: "name"; name: string }
  | { kind: "list"; items: Node[] }
  | { kind: "unary"; op: string; child: Node }
  | { kind: "binary"; op: string; left: Node; right: Node }
  | { kind: "compare"; first: Node; rest: { op: string; right: Node }[] }
  | { kind: "conditional"; yes: Node; condition: Node; no: Node }
  | { kind: "call"; name: string; args: Node[]; reverse?: Node }
  | { kind: "index"; target: Node; index: Node };
type Token = { text: string; value?: ExpressionValue };
function tokenize(source: string): Token[] {
  if (source.length > 16000) fail("Expression exceeds the size limit");
  const tokens: Token[] = [];
  for (let i = 0; i < source.length;) {
    const c = source[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'" || c === '"') {
      let value = ""; const quote = c; i++;
      while (i < source.length && source[i] !== quote) {
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
      const op = tail.match(/^(?:\*\*|\/\/|<=|>=|==|!=|[+\-*/%<>()\[\],=])/);
      if (number) {
        const text = number[0];
        tokens.push({ text: "literal", value: /[.eE]/.test(text) ? finite(Number(text)) : bounded(BigInt(text)) }); i += text.length;
      } else if (name) { tokens.push({ text: name[0] }); i += name[0].length; }
      else if (op) { tokens.push({ text: op[0] }); i += op[0].length; }
      else fail(`Unsupported token ${JSON.stringify(c)} at position ${i}`);
    }
    if (tokens.length > 4096) fail("Expression exceeds the token limit");
  }
  tokens.push({ text: "<end>" }); return tokens;
}
class Parser {
  private at = 0;
  private depth = 0;
  private readonly tokens: Token[];
  readonly names = new Set<string>();
  constructor(source: string) { this.tokens = tokenize(source); }
  private peek() { return this.tokens[this.at].text; }
  private take(text: string) { if (this.peek() === text) { this.at++; return true; } return false; }
  private need(text: string) { if (!this.take(text)) fail(`Expected ${text}, found ${this.peek()}`); }
  parse(): Node { const n = this.expression(); this.need("<end>"); return n; }
  private expression(): Node {
    if (++this.depth > 64) fail("Expression exceeds the nesting limit");
    let n = this.or();
    if (this.take("if")) { const condition = this.or(); this.need("else"); n = { kind: "conditional", yes: n, condition, no: this.expression() }; }
    this.depth--; return n;
  }
  private chain(next: () => Node, ops: string[]): Node {
    let n = next();
    while (ops.includes(this.peek())) { const op = this.tokens[this.at++].text; n = { kind: "binary", op, left: n, right: next() }; }
    return n;
  }
  private or = (): Node => this.chain(this.and, ["or"]);
  private and = (): Node => this.chain(this.not, ["and"]);
  private not = (): Node => {
    if (!this.take("not")) return this.compare();
    if (++this.depth > 64) fail("Expression exceeds the nesting limit");
    const child = this.not(); this.depth--; return { kind: "unary", op: "not", child };
  };
  private compare(): Node {
    const first = this.add(), rest: { op: string; right: Node }[] = [];
    while (["<", ">", "<=", ">=", "==", "!="].includes(this.peek())) rest.push({ op: this.tokens[this.at++].text, right: this.add() });
    return rest.length ? { kind: "compare", first, rest } : first;
  }
  private add = (): Node => this.chain(this.multiply, ["+", "-"]);
  private multiply = (): Node => this.chain(this.unary, ["*", "/", "//", "%"]);
  private unary = (): Node => {
    if (!["+", "-"].includes(this.peek())) return this.power();
    if (++this.depth > 64) fail("Expression exceeds the nesting limit");
    const op = this.tokens[this.at++].text, child = this.unary(); this.depth--; return { kind: "unary", op, child };
  };
  private power(): Node {
    const left = this.atom();
    return this.take("**") ? { kind: "binary", op: "**", left, right: this.unaryWithDepth() } : left;
  }
  private unaryWithDepth(): Node {
    if (++this.depth > 64) fail("Expression exceeds the nesting limit");
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
    else if (t.text === "(") {
      n = this.expression();
      if (this.take(",")) { const items = [n]; if (this.peek() !== ")") do { items.push(this.expression()); } while (this.take(",") && this.peek() !== ")"); n = { kind: "list", items }; }
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
function finite(x: number): number { return Number.isFinite(x) ? x : fail("Non-finite numeric result"); }
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
function rational(v: ExpressionValue): FractionValue {
  const n = numeric(v); if (n instanceof FractionValue) return n;
  if (typeof n === "bigint") return new FractionValue(n);
  // Exact IEEE-754 value, including subnormals. This is also Python's float rounding input.
  if (n === 0) return new FractionValue(ZERO);
  const view = new DataView(new ArrayBuffer(8)); view.setFloat64(0, n);
  const hi = view.getUint32(0), lo = view.getUint32(4), exp = (hi >>> 20) & 2047;
  let mantissa = (BigInt(hi & 0xfffff) << BigInt(32)) + BigInt(lo);
  if (exp) mantissa += ONE << BigInt(52);
  if (hi >>> 31) mantissa = -mantissa;
  const shift = (exp || 1) - 1023 - 52;
  return shift >= 0 ? new FractionValue(mantissa << BigInt(shift)) : new FractionValue(mantissa, ONE << BigInt(-shift));
}
const floorRatio = (n: bigint, d: bigint) => { const q = n / d; return n % d !== ZERO && (n < ZERO) !== (d < ZERO) ? q - ONE : q; };
function truth(v: ExpressionValue): boolean {
  if (v instanceof FractionValue) return v.numerator !== ZERO;
  return Array.isArray(v) ? v.length > 0 : !!v;
}
function compare(a: ExpressionValue, b: ExpressionValue): number {
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  const x = rational(a), y = rational(b), d = x.numerator * y.denominator - y.numerator * x.denominator;
  return d < ZERO ? -1 : d > ZERO ? 1 : 0;
}
function equal(a: ExpressionValue, b: ExpressionValue): boolean {
  if (typeof a === "string" || typeof b === "string") return a === b;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i]));
  return compare(a, b) === 0;
}
function binary(op: string, a: ExpressionValue, b: ExpressionValue): ExpressionValue {
  if (op === "+" && typeof a === "string" && typeof b === "string") {
    if (a.length + b.length > 16000) fail("String exceeds the size limit"); return a + b;
  }
  const x = numeric(a), y = numeric(b);
  if (op === "**") {
    if (typeof y === "bigint" && typeof x !== "number") {
      if (y > BigInt(MAX_BITS) || y < -BigInt(MAX_BITS)) fail("Exponent exceeds the limit");
      const f = rational(x), power = y < ZERO ? -y : y;
      if (f.numerator.toString(2).length * Number(power) > MAX_BITS || f.denominator.toString(2).length * Number(power) > MAX_BITS) fail("Power exceeds the integer limit");
      const n = f.numerator ** power, d = f.denominator ** power;
      if (y < ZERO) return x instanceof FractionValue ? new FractionValue(d, n) : finite(Number(d) / Number(n));
      return x instanceof FractionValue ? new FractionValue(n, d) : bounded(n);
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
  const l = rational(x), r = rational(y);
  if (["/", "//", "%"].includes(op) && r.numerator === ZERO) fail("Division by zero");
  if (op === "//") return bounded(floorRatio(l.numerator * r.denominator, l.denominator * r.numerator));
  if (op === "%") return binary("-", x, binary("*", binary("//", x, y), y));
  const n = op === "+" ? l.numerator * r.denominator + r.numerator * l.denominator : op === "-" ? l.numerator * r.denominator - r.numerator * l.denominator : op === "*" ? l.numerator * r.numerator : l.numerator * r.denominator;
  const d = op === "/" ? l.denominator * r.numerator : l.denominator * r.denominator;
  const result = new FractionValue(n, d);
  return x instanceof FractionValue || y instanceof FractionValue ? result : result.numerator;
}
function halfEven(n: bigint, d: bigint): bigint {
  const q = floorRatio(n, d), rem = n - q * d;
  return rem * TWO > d || (rem * TWO === d && q % TWO !== ZERO) ? q + ONE : q;
}
function scaledRound(v: ExpressionValue, places: number): bigint {
  if (!Number.isInteger(places) || Math.abs(places) > 100) fail("Precision must be an integer from -100 to 100");
  const f = rational(v), scale = BigInt(10) ** BigInt(Math.abs(places));
  return halfEven(f.numerator * (places >= 0 ? scale : ONE), f.denominator * (places < 0 ? scale : ONE));
}
/** Python fixed-point format, with ties to even using the exact stored numeric value. */
export function formatFixed(v: ExpressionValue, places: number): string {
  if (places < 0) fail("Fixed precision must not be negative");
  const n = scaledRound(v, places), negative = n < ZERO || (n === ZERO && (floating(v) < 0 || Object.is(floating(v), -0)));
  const digits = (n < ZERO ? -n : n).toString().padStart(places + 1, "0");
  return (negative ? "-" : "") + (places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits);
}
export function formatValue(v: ExpressionValue): string {
  if (v instanceof FractionValue) return v.denominator === ONE ? String(v.numerator) : `${v.numerator}/${v.denominator}`;
  if (typeof v === "boolean") return v ? "True" : "False";
  if (Array.isArray(v)) return `[${v.map(x => typeof x === "string" ? `'${x}'` : formatValue(x)).join(", ")}]`;
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
function iterable(v: ExpressionValue): readonly ExpressionValue[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return [...v];
  return fail("Expected a list or a string");
}
function call(name: string, a: ExpressionValue[], reverse?: ExpressionValue): ExpressionValue {
  const arity: Record<string, [number, number]> = { gcd: [0, 100], lcm: [0, 100], floor: [1, 1], ceil: [1, 1], round: [1, 2], abs: [1, 1], min: [1, 100], max: [1, 100], sqrt: [1, 1], isqrt: [1, 1], int: [1, 1], str: [1, 1], Fraction: [1, 2], sum: [1, 2], len: [1, 1], sorted: [1, 1] };
  const [lo, hi] = arity[name]; if (a.length < lo || a.length > hi) fail(`Invalid argument count for ${name}`);
  const x = a[0];
  switch (name) {
    case "str": return formatValue(x);
    case "int": {
      if (typeof x === "string") return /^[+-]?\d+$/.test(x.trim()) ? bounded(BigInt(x.trim())) : fail("Invalid integer string");
      const f = rational(x); return bounded(f.numerator / f.denominator);
    }
    case "Fraction": return a.length === 2 ? new FractionValue(integral(x), integral(a[1])) : rational(x);
    case "gcd": return a.reduce<bigint>((v, x) => gcd(v, integral(x)), ZERO);
    case "lcm": return a.reduce<bigint>((v, x) => { const n = integral(x); return v === ZERO || n === ZERO ? ZERO : bounded((v / gcd(v, n) * n) < ZERO ? -(v / gcd(v, n) * n) : v / gcd(v, n) * n); }, ONE);
    case "floor": { const f = rational(x); return floorRatio(f.numerator, f.denominator); }
    case "ceil": { const f = rational(x); return -floorRatio(-f.numerator, f.denominator); }
    case "abs": return compare(x, ZERO) < 0 ? binary("*", x, -ONE) : numeric(x);
    case "round": {
      const places = a.length === 2 ? Number(integral(a[1])) : 0, n = scaledRound(x, places);
      if (a.length === 1) return n;
      if (typeof x === "bigint" && places >= 0) return x;
      if (typeof x === "bigint") return bounded(n * BigInt(10) ** BigInt(-places));
      if (x instanceof FractionValue) return places >= 0 ? new FractionValue(n, BigInt(10) ** BigInt(places)) : new FractionValue(n * BigInt(10) ** BigInt(-places));
      return finite(Number(`${n}e${-places}`));
    }
    case "min": case "max": {
      const items = a.length === 1 ? iterable(x) : a;
      if (!items.length) fail(`${name} has an empty list`);
      return items.reduce((v, n) => (compare(n, v) * (name === "min" ? 1 : -1) < 0 ? n : v));
    }
    case "sqrt": { const n = floating(x); if (n < 0) fail("Square root of a negative number"); return finite(Math.sqrt(n)); }
    case "isqrt": {
      const n = integral(x); if (n < ZERO) fail("Square root of a negative number");
      if (n < TWO) return n;
      let r = ONE << BigInt(Math.ceil(n.toString(2).length / 2));
      for (;;) { const next = (r + n / r) / TWO; if (next >= r) return r; r = next; }
    }
    case "len": return BigInt(iterable(x).length);
    case "sum": return iterable(x).reduce<ExpressionValue>((v, n) => binary("+", v, n), a[1] ?? ZERO);
    case "sorted": {
      if (reverse !== undefined && typeof reverse !== "boolean") fail("sorted reverse must be a boolean");
      return [...iterable(x)].sort((l, r) => compare(l, r) * (reverse ? -1 : 1));
    }
    default: return fail(`Unknown function: ${name}`);
  }
}
export interface CompiledExpression {
  readonly names: readonly string[];
  evaluate(values?: Bindings): ExpressionValue;
}
/** Parse once, then evaluate with only the supplied own names. Lazy branches retain Python semantics. */
export function compileExpression(source: string): CompiledExpression {
  const parser = new Parser(source), tree = parser.parse();
  const pending: { node: Node; depth: number }[] = [{ node: tree, depth: 0 }];
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (depth > 128) fail("Expression exceeds the evaluation nesting limit");
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
  return { names: [...parser.names], evaluate(values = {}) {
    let budget = 10000;
    const run = (n: Node): ExpressionValue => {
      if (--budget < 0) fail("Expression exceeds the operation limit");
      switch (n.kind) {
        case "value": return n.value;
        case "name": return Object.hasOwn(values, n.name) ? values[n.name] : fail(`Unknown name: ${n.name}`);
        case "list": return n.items.map(run);
        case "unary": { const v = run(n.child); return n.op === "not" ? !truth(v) : n.op === "+" ? numeric(v) : binary("*", -ONE, v); }
        case "binary": {
          const l = run(n.left);
          if (n.op === "and") return truth(l) ? run(n.right) : l;
          if (n.op === "or") return truth(l) ? l : run(n.right);
          return binary(n.op, l, run(n.right));
        }
        case "compare": {
          let l = run(n.first);
          for (const part of n.rest) {
            const r = run(part.right), op = part.op;
            const ok = op === "==" ? equal(l, r) : op === "!=" ? !equal(l, r) : op === "<" ? compare(l, r) < 0 : op === ">" ? compare(l, r) > 0 : op === "<=" ? compare(l, r) <= 0 : compare(l, r) >= 0;
            if (!ok) return false; l = r;
          }
          return true;
        }
        case "conditional": return truth(run(n.condition)) ? run(n.yes) : run(n.no);
        case "call": return call(n.name, n.args.map(run), n.reverse && run(n.reverse));
        case "index": {
          const items = iterable(run(n.target)), index = Number(integral(run(n.index))), at = index < 0 ? items.length + index : index;
          return at >= 0 && at < items.length ? items[at] : fail(`Index ${index} is outside the list`);
        }
      }
    };
    return run(tree);
  } };
}
export function evaluateExpression(source: string, values: Bindings = {}): ExpressionValue { return compileExpression(source).evaluate(values); }
export function expressionIsTrue(value: ExpressionValue): boolean { return truth(value); }
