// Place value in Maya's calls (B1a, design: .design/research/maya-place-value-design.md): what a stored place-value
// workbook question asks, worked out from the stored package only when four things agree, and the small evaluator for
// the template's Python-style expressions that one of them needs. A question that fails any check stays held, with the
// reason. Nothing here changes the stored package or the printed book.
//
// The four agreements (design section 2.2), each computed without reading the others:
// 1. the template key, from an exact allow-list, gives the ask (a digit or a value);
// 2. the printed text matches one closed form, which gives the number, the ask and the place (never a slot name);
// 3. the template's own expressions, run by `evaluate` on the stored slot values, give the printed number (`derived`
//    first: in the zero-placeholder variants it is not the slot) and an answer whose expression has the ask's shape
//    for the printed place;
// 4. code's result from the printed number and the place equals that answer and the stored answer key.
// Pure TypeScript: no clock, network or randomness, no `eval` and no `Function`.
import type { Place, QuestionPackage } from "@/lib/question-package";
import { digitAt, placeIndex, WHOLE_PLACES, MAX_PLACE_NUMBER } from "@/lib/question-package-place-value";

// ---------- The evaluator ----------

/** A value of the template grammar: an exact rational (integers have denominator 1), a string or a boolean. */
export type ExprValue = { num: bigint; den: bigint } | string | boolean;

/** The evaluator's fixed limits. */
export const EVAL_LIMITS = { tokens: 200, magnitude: BigInt(10) ** BigInt(15), exponent: 12, string: 40 } as const;

class Refused extends Error {}
const refuse = (why: string): never => {
  throw new Refused(why);
};

type Token = { t: "int"; v: bigint } | { t: "str"; v: string } | { t: "name"; v: string } | { t: "op"; v: string };
const KEYWORDS = new Set(["if", "else", "and", "not", "in", "or"]);
const OPS = ["**", "//", "<=", ">=", "==", "!=", "+", "-", "*", "/", "%", "<", ">", "(", ")", ","];

function tokens(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === " ") {
      i++;
      continue;
    }
    if (out.length >= EVAL_LIMITS.tokens) refuse(`an expression has at most ${EVAL_LIMITS.tokens} tokens`);
    const digits = /^\d{1,16}(?![\d.A-Za-z_])/.exec(text.slice(i));
    if (digits) {
      out.push({ t: "int", v: BigInt(digits[0]) });
      i += digits[0].length;
      continue;
    }
    const str = /^'([0-9A-Za-z ]{0,40})'/.exec(text.slice(i)) ?? /^"([0-9A-Za-z ]{0,40})"/.exec(text.slice(i));
    if (str) {
      out.push({ t: "str", v: str[1] });
      i += str[0].length;
      continue;
    }
    const name = /^[a-z][a-z0-9_]{0,31}(?![A-Za-z0-9_])/.exec(text.slice(i));
    if (name) {
      out.push(KEYWORDS.has(name[0]) ? { t: "op", v: name[0] } : { t: "name", v: name[0] });
      i += name[0].length;
      continue;
    }
    const op = OPS.find((o) => text.startsWith(o, i));
    if (!op) refuse(`the expression has a character the evaluator does not read: "${c}"`);
    out.push({ t: "op", v: op! });
    i += op!.length;
  }
  return out;
}

const isNum = (v: ExprValue): v is { num: bigint; den: bigint } => typeof v === "object";
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);
const babs = (a: bigint) => (a < ZERO ? -a : a);
const gcd = (a: bigint, b: bigint): bigint => (b === ZERO ? babs(a) : gcd(b, a % b));
function rat(num: bigint, den: bigint): ExprValue {
  if (den === ZERO) refuse("the expression divides by zero");
  if (den < ZERO) [num, den] = [-num, -den];
  const g = gcd(num, den) || ONE;
  const v = { num: num / g, den: den / g };
  if (babs(v.num) >= EVAL_LIMITS.magnitude * v.den || v.den >= EVAL_LIMITS.magnitude) refuse("the expression's value is too large");
  return v;
}
const int = (n: bigint) => rat(n, ONE);
const asInt = (v: ExprValue, what: string): bigint => (isNum(v) && v.den === ONE ? v.num : refuse(`${what} needs a whole number`));
const asNum = (v: ExprValue, what: string) => (isNum(v) ? v : refuse(`${what} needs a number`));
const asBool = (v: ExprValue, what: string): boolean => (typeof v === "boolean" ? v : refuse(`${what} needs true or false`));
/** Python's floor division and modulo on whole numbers. */
const floorDiv = (a: bigint, b: bigint) => {
  if (b === ZERO) refuse("the expression divides by zero");
  const q = a / b;
  return (a % b !== ZERO && (a < ZERO) !== (b < ZERO)) ? q - ONE : q;
};
const mod = (a: bigint, b: bigint) => a - b * floorDiv(a, b);
const compare = (a: ExprValue, b: ExprValue): number => {
  const x = asNum(a, "a comparison");
  const y = asNum(b, "a comparison");
  const d = x.num * y.den - y.num * x.den;
  return d < ZERO ? -1 : d > ZERO ? 1 : 0;
};
const same = (a: ExprValue, b: ExprValue) => (isNum(a) && isNum(b) ? compare(a, b) === 0 : a === b);
/** A rational as Python's str() writes it: a whole number's digits; any other value is refused. */
const strOf = (v: ExprValue) => (isNum(v) && v.den === ONE ? v.num.toString() : typeof v === "string" ? v : refuse("str() takes a whole number"));
/** Python's round(x, k) for a rational, half to even, k from 0 to 3. */
function roundOf(v: ExprValue, places: ExprValue): ExprValue {
  const x = asNum(v, "round()");
  const k = asInt(places, "round()'s places");
  if (k < ZERO || k > BigInt(3)) refuse("round() takes 0 to 3 places");
  const scale = TEN ** k;
  const scaled = x.num * scale;
  let q = floorDiv(scaled, x.den);
  const r2 = (scaled - q * x.den) * BigInt(2);
  if (r2 > x.den || (r2 === x.den && q % BigInt(2) !== ZERO)) q += ONE;
  return rat(q, scale);
}

/** A recursive-descent parser that evaluates as it reads. The grammar is the 117 place-value expressions' (design 2.3). */
class Parser {
  private i = 0;
  constructor(private readonly ts: Token[], private readonly names: ReadonlyMap<string, ExprValue>) {}
  private peek(): Token | undefined {
    return this.ts[this.i];
  }
  private isOp(v: string) {
    const t = this.peek();
    return t?.t === "op" && t.v === v;
  }
  private take(v: string) {
    if (!this.isOp(v)) refuse(`the expression needs "${v}"`);
    this.i++;
  }
  run(): ExprValue {
    const v = this.ternary();
    if (this.i !== this.ts.length) refuse("the expression has more after its end");
    return v;
  }
  // a if cond else b: both branches are read (and checked) before one is chosen.
  private ternary(): ExprValue {
    const a = this.or();
    if (!this.isOp("if")) return a;
    this.i++;
    const cond = asBool(this.or(), "if");
    this.take("else");
    const b = this.ternary();
    return cond ? a : b;
  }
  private or(): ExprValue {
    let a = this.and();
    while (this.isOp("or")) {
      this.i++;
      const b = this.and();
      a = asBool(a, "or") || asBool(b, "or");
    }
    return a;
  }
  private and(): ExprValue {
    let a = this.not();
    while (this.isOp("and")) {
      this.i++;
      const b = this.not();
      a = asBool(a, "and") && asBool(b, "and");
    }
    return a;
  }
  private not(): ExprValue {
    if (this.isOp("not")) {
      this.i++;
      return !asBool(this.not(), "not");
    }
    return this.comparison();
  }
  private comparison(): ExprValue {
    const a = this.arith();
    const t = this.peek();
    if (t?.t !== "op") return a;
    if (t.v === "in" || (t.v === "not" && this.ts[this.i + 1]?.t === "op" && (this.ts[this.i + 1] as { v: string }).v === "in")) {
      const negated = t.v === "not";
      this.i += negated ? 2 : 1;
      const b = this.arith();
      if (typeof a !== "string" || typeof b !== "string") refuse("in compares a string with a string");
      return (b as string).includes(a as string) !== negated;
    }
    const ops: Record<string, (c: number) => boolean> = { "<": (c) => c < 0, ">": (c) => c > 0, "<=": (c) => c <= 0, ">=": (c) => c >= 0 };
    if (t.v in ops) {
      this.i++;
      return ops[t.v](compare(a, this.arith()));
    }
    if (t.v === "==" || t.v === "!=") {
      this.i++;
      const b = this.arith();
      return same(a, b) === (t.v === "==");
    }
    return a;
  }
  private arith(): ExprValue {
    let a = this.term();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.ts[this.i++] as { v: string }).v;
      const x = asNum(a, op);
      const y = asNum(this.term(), op);
      a = rat(op === "+" ? x.num * y.den + y.num * x.den : x.num * y.den - y.num * x.den, x.den * y.den);
    }
    return a;
  }
  private term(): ExprValue {
    let a = this.unary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("//") || this.isOp("%")) {
      const op = (this.ts[this.i++] as { v: string }).v;
      const b = this.unary();
      if (op === "*") {
        const x = asNum(a, op);
        const y = asNum(b, op);
        a = rat(x.num * y.num, x.den * y.den);
      } else if (op === "/") {
        const x = asNum(a, op);
        const y = asNum(b, op);
        a = rat(x.num * y.den, x.den * y.num);
      } else {
        const x = asInt(a, op);
        const y = asInt(b, op);
        a = int(op === "//" ? floorDiv(x, y) : mod(x, y));
      }
    }
    return a;
  }
  private unary(): ExprValue {
    if (this.isOp("-") || this.isOp("+")) {
      const op = (this.ts[this.i++] as { v: string }).v;
      const v = asNum(this.unary(), op);
      return op === "-" ? rat(-v.num, v.den) : v;
    }
    return this.power();
  }
  private power(): ExprValue {
    const base = this.atom();
    if (!this.isOp("**")) return base;
    this.i++;
    const b = asInt(base, "**");
    const e = asInt(this.unary(), "**");
    if (e < ZERO || e > BigInt(EVAL_LIMITS.exponent)) refuse(`an exponent is from 0 to ${EVAL_LIMITS.exponent}`);
    return int(b ** e);
  }
  private atom(): ExprValue {
    const t = this.peek();
    if (!t) return refuse("the expression ends too soon");
    this.i++;
    if (t.t === "int") return int(t.v);
    if (t.t === "str") return t.v;
    if (t.t === "name") {
      if (this.isOp("(")) {
        this.i++;
        const args: ExprValue[] = [this.ternary()];
        while (this.isOp(",")) {
          this.i++;
          args.push(this.ternary());
        }
        this.take(")");
        if (t.v === "str" && args.length === 1) return strOf(args[0]);
        if (t.v === "round" && args.length === 2) return roundOf(args[0], args[1]);
        return refuse(`the evaluator calls only str(x) and round(x, k), not ${t.v}`);
      }
      const v = this.names.get(t.v);
      return v === undefined ? refuse(`the expression names ${t.v}, which is not a slot or a derived value`) : v;
    }
    if (t.v === "(") {
      const v = this.ternary();
      this.take(")");
      return v;
    }
    return refuse(`the expression has "${t.v}" where a value goes`);
  }
}

/**
 * Evaluates one template expression with the given names, or says why not. Only the grammar of the place-value
 * templates is read: whole numbers, string literals, names, + - * / // % **, comparisons, and, or, not, in, if-else,
 * str() and round(). Anything else (a dot, a bracket, an underscore name, a huge exponent) is refused, never run.
 */
export function evaluate(expression: string, names: ReadonlyMap<string, ExprValue>): { value: ExprValue } | { refused: string } {
  if (typeof expression !== "string" || expression.length > 400) return { refused: "the expression is not text of up to 400 characters" };
  try {
    return { value: new Parser(tokens(expression), names).run() };
  } catch (e) {
    if (e instanceof Refused) return { refused: e.message };
    throw e;
  }
}

// ---------- The derived teaching object ----------

/** What a place-value question asks, as all four agreements found it. */
export interface PlaceValueObject {
  number: number;
  ask: "digit" | "value";
  place: Place;
  answer: number;
}

/** The template keys taught here, and the ask each gives (agreement 1). Compare, sum and build are held (B1b). */
const TEMPLATE_KEY = /^5\.1-place-value-million#[123]\.([123]):(bare|story)$/;

const PLACE_WORDS = [...WHOLE_PLACES].sort((a, b) => b.length - a.length).join("|");
const NUMBER = "([1-9]\\d{0,6})";
/** The printed forms (agreement 2), each whole: the text matches one exactly, or the question is held. */
const FORMS: { ask: "digit" | "value"; style: "bare" | "story"; re: RegExp; number: number; place: number }[] = [
  { ask: "digit", style: "bare", re: new RegExp(`^In ${NUMBER}, which digit is in the (${PLACE_WORDS}) place\\?$`), number: 1, place: 2 },
  { ask: "value", style: "bare", re: new RegExp(`^What is the value of the digit in the (${PLACE_WORDS}) place of ${NUMBER}\\?$`), number: 2, place: 1 },
  { ask: "value", style: "bare", re: new RegExp(`^${NUMBER}: value of the (${PLACE_WORDS}) digit\\?$`), number: 1, place: 2 },
  {
    ask: "value", style: "story", number: 2, place: 4,
    re: new RegExp(`^([A-Z][a-z]{1,19}) saw the number ${NUMBER} on a sign at ([a-z]{1,20}(?: [a-z]{1,20}){0,3})\\. What is the value of the digit in the (${PLACE_WORDS}) place\\?$`),
  },
];

/** The answer expression's shape for each ask (agreement 3): a digit, or a digit times its place, of `n`. */
const DIGIT_SHAPE = /^n(?: \/\/ (1(?:0{0,6})))? % 10$/;
const VALUE_SHAPE = /^n \/\/ (1(?:0{1,6})) % 10 \* (1(?:0{1,6}))$/;

type Held = { held: string };
const held = (why: string): Held => ({ held: why });

/**
 * What a stored place-value question asks, when the template key, the printed text, the template's expressions and
 * code's own result all agree; otherwise why the question stays held. Reads the printed package only.
 */
export function placeValueOf(raw: QuestionPackage): PlaceValueObject | Held {
  if (raw.operation !== null || raw.answer !== null || raw.easierExample !== null || raw.steps.length > 0 || raw.wrongAnswers.length > 0) {
    return held("the stored question already has teaching data");
  }
  // 1. The template key.
  const key = TEMPLATE_KEY.exec(raw.templateId ?? "");
  if (!key) return held("the template is not a place-value digit or value template");
  const keyAsk = key[1] === "1" ? "digit" : "value";
  const keyStyle = key[2] as "bare" | "story";

  // 2. The printed text, by one closed form.
  const forms = FORMS.flatMap((f) => {
    const m = f.re.exec(raw.text);
    return m ? [{ ask: f.ask, style: f.style, number: Number(m[f.number]), place: m[f.place] as Place }] : [];
  });
  if (forms.length !== 1) return held("the printed text is not one of the place-value forms");
  const printed = forms[0];
  if (printed.ask !== keyAsk || printed.style !== keyStyle) return held("the printed text asks something else than its template");
  const k = placeIndex(printed.place);
  if (printed.number > MAX_PLACE_NUMBER || k < 0 || k >= String(printed.number).length) return held("the printed place is not a place of the printed number");
  if (printed.ask === "value" && k === 0) return held("a value question about the ones place is the digit itself");

  // 3. The template's expressions on the stored slot values.
  const item = raw.item;
  if (!item || item.checks.length !== 1 || item.regions.length !== 1) return held("the item has not one check and one answer region");
  const check = item.checks[0];
  const region = item.regions[0];
  if (check.kind !== "template" || region.kind !== "box" || check.region !== region.id) return held("the item's check is not the template's answer box");
  const src = check.source;
  if (src.values !== null || (src.labels ?? null) !== null) return held("the template source has values or labels a place-value template does not use");
  const names = new Map<string, ExprValue>();
  for (const slot of src.slots) {
    if (!("int" in slot.value)) return held(`the slot ${slot.name} is not a whole number`);
    names.set(slot.name, int(BigInt(slot.value.int)));
  }
  for (const [name, expression] of src.derived) {
    if (names.has(name)) return held(`the derived value ${name} names a slot again`);
    const r = evaluate(expression, names);
    if ("refused" in r) return held(`the derived value ${name}: ${r.refused}`);
    names.set(name, r.value);
  }
  if (src.check !== null) {
    const r = evaluate(src.check, names);
    if ("refused" in r || r.value !== true) return held("the stored numbers do not pass the template's check");
  }
  const n = names.get("n");
  if (n === undefined || !isNum(n) || n.den !== ONE || n.num !== BigInt(printed.number)) return held("the template's number is not the printed number");
  const answerText = src.answer.trim().replace(/\s+/g, " ");
  const shape = printed.ask === "digit" ? DIGIT_SHAPE.exec(answerText) : VALUE_SHAPE.exec(answerText);
  if (!shape) return held(`the answer expression is not a ${printed.ask} of n`);
  const powers = (printed.ask === "digit" ? [shape[1] ?? "1"] : [shape[1], shape[2]]).map((p) => p.length - 1);
  if (powers.some((p) => p !== k)) return held("the answer expression is about another place than the printed text");
  const evaluated = evaluate(src.answer, names);
  if ("refused" in evaluated) return held(`the answer expression: ${evaluated.refused}`);
  const ev = evaluated.value;
  if (!isNum(ev) || ev.den !== ONE) return held("the answer expression does not give a whole number");

  // 4. Code's result, the template's answer and the stored answer key agree.
  const digit = digitAt(printed.number, k);
  const result = printed.ask === "digit" ? digit : digit * 10 ** k;
  const key4 = region.answer;
  if (ev.num !== BigInt(result)) return held("the template's answer is not code's result");
  if (key4?.type !== "number" || key4.value !== result) return held("the stored answer key is not code's result");
  return { number: printed.number, ask: printed.ask, place: printed.place, answer: result };
}
