import { describe, expect, it } from "vitest";
import {
  checkQuestionPackage,
  operationProblem,
  operationResult,
  stepText,
  workedSteps,
  type AnswerValue,
  type ClockTime,
  type Operation,
  type OperationPackage,
  type Unit,
} from "@/lib/question-package";

// Property checks (#307): many generated problems of each measure, money, time and algebra kind. For each one, an
// independent computation here gives the exact answer; every equality said in the step words is read back with its
// units and checked exactly (the #344 review: a step states only true equalities); a package built from the steps is
// checked, and the same package with a wrong answer or a changed step fails.

/** A seeded generator, so a failure always comes back the same. */
function generator(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return { int, pick: <T,>(xs: readonly T[]) => xs[int(0, xs.length - 1)] };
}
type Gen = ReturnType<typeof generator>;

// ---------- Exact numbers and units, independent of the module ----------

type Q = [bigint, bigint];
const big = BigInt;
const absBig = (x: bigint) => (x < big(0) ? -x : x);
const bigGcd = (a: bigint, b: bigint): bigint => (b === big(0) ? absBig(a) : bigGcd(b, a % b));
const q = (n: bigint, d: bigint): Q => {
  const g = bigGcd(n, d) || big(1);
  return d < big(0) ? [-n / g, -d / g] : [n / g, d / g];
};
const decimalQ = (text: string): Q => {
  const negative = text.startsWith("-") || text.startsWith("−");
  const [whole, frac = ""] = text.replace(/^[-−]/, "").split(".");
  const r = q(big(whole + frac), big(10) ** big(frac.length));
  return negative ? [-r[0], r[1]] : r;
};
const numQ = (x: number) => decimalQ(String(x));
const add = (a: Q, b: Q) => q(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const sub = (a: Q, b: Q) => q(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const mul = (a: Q, b: Q) => q(a[0] * b[0], a[1] * b[1]);
const div = (a: Q, b: Q) => q(a[0] * b[1], a[1] * b[0]);
const same = (a: Q, b: Q) => a[0] * b[1] === b[0] * a[1];

/** Each unit's measure and size in the smallest unit, written out here from the SI and the Canadian dollar. */
const UNIT_SIZE: Record<Unit, [string, number]> = {
  mm: ["length", 1], cm: ["length", 10], m: ["length", 1000], km: ["length", 1000000],
  mg: ["mass", 1], g: ["mass", 1000], kg: ["mass", 1000000], mL: ["capacity", 1], L: ["capacity", 1000],
  s: ["time", 1], min: ["time", 60], h: ["time", 3600], "¢": ["money", 1], $: ["money", 100],
};
const UNITS_OF: Record<string, Unit[]> = { length: ["mm", "cm", "m", "km"], mass: ["mg", "g", "kg"], capacity: ["mL", "L"], time: ["s", "min", "h"], money: ["¢", "$"] };

/** A measured value: a measure (null for a plain number) and its size in the measure's smallest unit. */
interface Measured {
  dim: string | null;
  size: Q;
}
const amount = (value: Q, unit: Unit): Measured => ({ dim: UNIT_SIZE[unit][0], size: mul(value, q(big(UNIT_SIZE[unit][1]), big(1))) });
const minutesOf = (t: ClockTime) => (t.period === null ? t.hours : (t.hours % 12) + (t.period === "p.m." ? 12 : 0)) * 60 + t.minutes;

/** An answer value as a measured value, or a clock time in minutes after midnight. */
function measured(v: AnswerValue): Measured {
  switch (v.type) {
    case "number":
      return { dim: null, size: numQ(v.value) };
    case "quantity":
      return amount(numQ(v.value), v.unit);
    case "compound":
      return v.parts.map((p) => amount(numQ(p.value), p.unit)).reduce((a, b) => ({ dim: a.dim, size: add(a.size, b.size) }));
    case "time":
      return { dim: "clock", size: q(big(minutesOf(v)), big(1)) };
    default:
      throw new Error(`no measure for ${v.type}`);
  }
}
const sameMeasured = (a: Measured, b: Measured) => a.dim === b.dim && same(a.size, b.size);

// ---------- Reading the equalities in the words ----------

type Token = { k: "value"; v: Measured } | { k: "unknown"; coefficient: Q; name: string } | { k: "sign"; s: string } | { k: "(" | ")" | "=" } | { k: "break" };

const UNIT_PATTERN = "mm|cm|km|mg|kg|mL|min|m|g|L|s|h";
const PATTERNS: [RegExp, (m: RegExpExecArray) => Token][] = [
  [/^\d{1,2}:\d{2}(?: [ap]\.m\.)?/, () => ({ k: "break" })],
  [/^\$(\d+(?:\.\d+)?)/, (m) => ({ k: "value", v: amount(decimalQ(m[1]), "$") })],
  [/^(\d+)¢/, (m) => ({ k: "value", v: amount(decimalQ(m[1]), "¢") })],
  [new RegExp(`^(\\d+(?:\\.\\d+)?) (${UNIT_PATTERN})(?![A-Za-z])`), (m) => ({ k: "value", v: amount(decimalQ(m[1]), m[2] as Unit) })],
  [/^\(−(\d+(?:\.\d+)?)\)/, (m) => ({ k: "value", v: { dim: null, size: decimalQ(`−${m[1]}`) } })],
  [/^(−?\d+(?:\.\d+)?)?([a-z])(?![A-Za-z])/, (m) => ({ k: "unknown", coefficient: m[1] ? decimalQ(m[1]) : q(big(1), big(1)), name: m[2] })],
  [/^−?\d+(?:\.\d+)?/, (m) => ({ k: "value", v: { dim: null, size: decimalQ(m[0]) } })],
  [/^[+−×÷](?= )/, (m) => ({ k: "sign", s: m[0] })],
  [/^[()=]/, (m) => ({ k: m[0] as "(" | ")" | "=" })],
];

function tokens(sentence: string): Token[] {
  const out: Token[] = [];
  for (let rest = sentence; rest.length > 0;) {
    if (rest[0] === " ") {
      rest = rest.slice(1);
      continue;
    }
    const hit = PATTERNS.map(([re, make]) => [re.exec(rest), make] as const).find(([m]) => m !== null);
    if (hit && hit[0]) {
      out.push(hit[1](hit[0]));
      rest = rest.slice(hit[0][0].length);
    } else {
      out.push({ k: "break" });
      rest = rest.replace(/^[^ ]*/, "");
    }
  }
  return out;
}

/** The value of a side: brackets, then × and ÷, then + and −; amounts written side by side add up ("1 h 30 min"). */
function sideValue(side: Token[], unknowns: Map<string, Q>): Measured {
  let i = 0;
  const primary = (): Measured => {
    const t = side[i++];
    if (t?.k === "value") {
      let v = t.v;
      while (side[i]?.k === "value" && v.dim !== null) v = { dim: v.dim, size: add(v.size, (side[i++] as { v: Measured }).v.size) };
      return v;
    }
    if (t?.k === "unknown") {
      const value = unknowns.get(t.name);
      if (!value) throw new Error(`the unknown ${t.name} has no value`);
      return { dim: null, size: mul(t.coefficient, value) };
    }
    if (t?.k === "(") {
      const v = sum();
      if (side[i++]?.k !== ")") throw new Error("a bracket is not closed");
      return v;
    }
    throw new Error("a side is not an expression");
  };
  const product = (): Measured => {
    let v = primary();
    // A sign × or ÷, or a product written without × ("2(x + 3)").
    for (let t = side[i]; (t?.k === "sign" && (t.s === "×" || t.s === "÷")) || t?.k === "(" || t?.k === "unknown"; t = side[i]) {
      if (t.k === "sign") i++;
      const r = primary();
      if (r.dim !== null && v.dim !== null) throw new Error("two amounts multiplied");
      v = { dim: v.dim ?? r.dim, size: t.k === "sign" && t.s === "÷" ? div(v.size, r.size) : mul(v.size, r.size) };
    }
    return v;
  };
  const sum = (): Measured => {
    let v = product();
    for (let t = side[i]; t?.k === "sign" && (t.s === "+" || t.s === "−"); t = side[i]) {
      i++;
      const r = product();
      if (r.dim !== v.dim) throw new Error("amounts of two measures added");
      v = { dim: v.dim, size: t.s === "+" ? add(v.size, r.size) : sub(v.size, r.size) };
    }
    return v;
  };
  const v = sum();
  if (i !== side.length) throw new Error("a side has more after it");
  return v;
}

/** Every equality chain in a sentence ("45 min + 45 min = 1 h 30 min"), checked exactly; the count checked. */
function checkEqualities(sentence: string, unknowns: Map<string, Q>): number {
  const all = tokens(sentence);
  let checked = 0;
  for (let start = 0; start < all.length;) {
    let end = start;
    while (end < all.length && all[end].k !== "break") end++;
    const run = all.slice(start, end);
    if (run.some((t) => t.k === "=")) {
      const sides: Token[][] = [[]];
      for (const t of run) if (t.k === "=") sides.push([]); else sides[sides.length - 1].push(t);
      // A run starts or ends at a word; the sides next to the "=" are the equality's.
      const values = sides.map((s) => {
        try {
          return sideValue(s, unknowns);
        } catch (e) {
          throw new Error(`${(e as Error).message} in "${sentence}"`);
        }
      });
      for (let k = 1; k < values.length; k++) {
        if (!sameMeasured(values[0], values[k])) throw new Error(`a false equality in "${sentence}"`);
        checked++;
      }
    }
    start = end + 1;
  }
  return checked;
}

// ---------- Generated problems ----------

const qty = (value: number, unit: Unit): AnswerValue & { type: "quantity" } => ({ type: "quantity", value, unit });
const decimal = (g: Gen, max: number, places: number) => Number((g.int(0, max * 10 ** places) / 10 ** places).toFixed(places));
const placesFor = (unit: Unit) => (unit === "¢" ? 0 : unit === "$" ? 2 : 3);
const anyQuantity = (g: Gen, unit: Unit) => qty(decimal(g, unit === "¢" ? 9999 : 999, g.int(0, placesFor(unit))), unit);
const clock = (g: Gen, twelveHour: boolean): ClockTime => {
  const m = g.int(0, 1439);
  const [h, min] = [Math.floor(m / 60), m % 60];
  return twelveHour ? { type: "time", hours: h % 12 || 12, minutes: min, period: h < 12 ? "a.m." : "p.m." } : { type: "time", hours: h, minutes: min, period: null };
};

/** An expression tree written here, with its value worked here, for the evaluate kind. */
type Tree = { n: Q } | { name: string } | { sign: string; left: Tree; right: Tree };
const treeText = (t: Tree, first: boolean, parentSign: string | null, right: boolean): string => {
  if ("n" in t) return t.n[0] < big(0) ? (first ? `−${absBig(t.n[0])}` : `(−${absBig(t.n[0])})`) : String(t.n[0]);
  if ("name" in t) return t.name;
  const inner = `${treeText(t.left, first, t.sign, false)} ${t.sign} ${treeText(t.right, false, t.sign, true)}`;
  const level = (s: string) => (s === "×" || s === "÷" ? 2 : 1);
  const brackets = parentSign !== null && (level(t.sign) < level(parentSign) || (right && level(t.sign) === level(parentSign)));
  return brackets ? `(${treeText(t.left, true, t.sign, false)} ${t.sign} ${treeText(t.right, false, t.sign, true)})` : inner;
};
function treeValue(t: Tree, values: Map<string, Q>): Q | null {
  if ("n" in t) return t.n;
  if ("name" in t) return values.get(t.name)!;
  const [a, b] = [treeValue(t.left, values), treeValue(t.right, values)];
  if (a === null || b === null || (t.sign === "÷" && b[0] === big(0))) return null;
  return t.sign === "+" ? add(a, b) : t.sign === "−" ? sub(a, b) : t.sign === "×" ? mul(a, b) : div(a, b);
}
function tree(g: Gen, depth: number, names: string[]): Tree {
  if (depth === 0 || g.int(0, 3) === 0) {
    if (names.length > 0 && g.int(0, 2) === 0) return { name: g.pick(names) };
    return { n: q(big(g.int(0, 4) === 0 ? -g.int(1, 20) : g.int(0, 40)), big(1)) };
  }
  return { sign: g.pick(["+", "−", "×", "÷"]), left: tree(g, depth - 1, names), right: tree(g, depth - 1, names) };
}

interface Case {
  make(g: Gen): Operation;
  /** The exact answer, worked here. */
  oracle(op: Operation): AnswerValue | Measured;
  easier: Operation;
}

/** An end time before the start time is the next day. */
const elapsedOracle = (op: Extract<Operation, { kind: "elapsed-time" }>): Measured => amount(q(big((minutesOf(op.operands[1]) - minutesOf(op.operands[0]) + 1440) % 1440), big(1)), "min");

const CASES: Record<string, Case> = {
  convert: {
    make: (g) => {
      const dim = g.pick(Object.keys(UNITS_OF));
      const [from, to] = [g.pick(UNITS_OF[dim]), g.pick(UNITS_OF[dim])];
      return { kind: "convert", operands: [anyQuantity(g, from)], unit: to };
    },
    oracle: (op) => measured((op as Extract<Operation, { kind: "convert" }>).operands[0]),
    easier: { kind: "convert", operands: [qty(1, "m")], unit: "cm" },
  },
  "quantity-add": {
    make: (g) => {
      const dim = g.pick(Object.keys(UNITS_OF));
      const asked = g.int(0, 2) === 0 ? { unit: g.pick(UNITS_OF[dim]) } : {};
      return { kind: "quantity-add", operands: [anyQuantity(g, g.pick(UNITS_OF[dim])), anyQuantity(g, g.pick(UNITS_OF[dim]))], ...asked };
    },
    oracle: (op) => {
      const [a, b] = (op as Extract<Operation, { kind: "quantity-add" }>).operands.map(measured);
      return { dim: a.dim, size: add(a.size, b.size) };
    },
    easier: { kind: "quantity-add", operands: [qty(1, "¢"), qty(1, "¢")] },
  },
  "quantity-subtract": {
    make: (g) => {
      const dim = g.pick(Object.keys(UNITS_OF));
      const asked = g.int(0, 2) === 0 ? { unit: g.pick(UNITS_OF[dim]) } : {};
      return { kind: "quantity-subtract", operands: [anyQuantity(g, g.pick(UNITS_OF[dim])), anyQuantity(g, g.pick(UNITS_OF[dim]))], ...asked };
    },
    oracle: (op) => {
      const [a, b] = (op as Extract<Operation, { kind: "quantity-subtract" }>).operands.map(measured);
      return { dim: a.dim, size: sub(a.size, b.size) };
    },
    easier: { kind: "quantity-subtract", operands: [qty(2, "¢"), qty(1, "¢")] },
  },
  "quantity-multiply": {
    make: (g) => {
      const dim = g.pick(Object.keys(UNITS_OF));
      const asked = g.int(0, 3) === 0 ? { unit: g.pick(UNITS_OF[dim]) } : {};
      return { kind: "quantity-multiply", operands: [anyQuantity(g, g.pick(UNITS_OF[dim])), g.int(0, 999)], ...asked };
    },
    oracle: (op) => {
      const [a, n] = (op as Extract<Operation, { kind: "quantity-multiply" }>).operands;
      const m = measured(a);
      return { dim: m.dim, size: mul(m.size, q(big(n), big(1))) };
    },
    easier: { kind: "quantity-multiply", operands: [qty(1, "¢"), 2] },
  },
  "money-round": {
    make: (g) => ({ kind: "money-round", operands: [anyQuantity(g, g.pick(["$", "¢"] as const))] }),
    oracle: (op) => {
      const cents = measured((op as Extract<Operation, { kind: "money-round" }>).operands[0]).size;
      const fives = Math.round(Number(cents[0]) / Number(cents[1]) / 5);
      return { dim: "money", size: q(big(fives * 5), big(1)) };
    },
    easier: { kind: "money-round", operands: [qty(1, "¢")] },
  },
  "elapsed-time": {
    make: (g) => {
      const twelve = g.int(0, 1) === 0;
      const unit = g.pick([undefined, undefined, "min", "h", "s"] as const);
      return { kind: "elapsed-time", operands: [clock(g, twelve), clock(g, twelve)], ...(unit ? { unit } : {}) };
    },
    oracle: (op) => elapsedOracle(op as Extract<Operation, { kind: "elapsed-time" }>),
    easier: { kind: "elapsed-time", operands: [{ type: "time", hours: 1, minutes: 0, period: "p.m." }, { type: "time", hours: 1, minutes: 5, period: "p.m." }] },
  },
  "time-add": {
    make: (g) => {
      const duration: AnswerValue & { type: "quantity" | "compound" } = g.pick([
        () => qty(g.int(1, 1439), "min"),
        () => qty(g.int(1, 23), "h"),
        () => qty(g.int(1, 47) / 2, "h"),
        () => ({ type: "compound" as const, parts: [{ value: g.int(1, 23), unit: "h" as const }, { value: g.int(1, 59), unit: "min" as const }] }),
      ])();
      return { kind: "time-add", operands: [clock(g, g.int(0, 1) === 0), duration] };
    },
    oracle: (op) => {
      const [t, d] = (op as Extract<Operation, { kind: "time-add" }>).operands;
      const minutes = Number(div(measured(d).size, q(big(60), big(1)))[0]);
      return { dim: "clock", size: q(big((minutesOf(t) + minutes) % 1440), big(1)) };
    },
    easier: { kind: "time-add", operands: [{ type: "time", hours: 1, minutes: 0, period: "p.m." }, qty(5, "min")] },
  },
  "clock-convert": {
    make: (g) => ({ kind: "clock-convert", operands: [clock(g, g.int(0, 1) === 0)] }),
    oracle: (op) => ({ dim: "clock", size: q(big(minutesOf((op as Extract<Operation, { kind: "clock-convert" }>).operands[0])), big(1)) }),
    easier: { kind: "clock-convert", operands: [{ type: "time", hours: 1, minutes: 0, period: "a.m." }] },
  },
  evaluate: {
    make: (g) => {
      const names = g.int(0, 1) === 0 ? [] : ["n", "a"].slice(0, g.int(1, 2));
      const t = tree(g, g.int(1, 3), names);
      const values = Object.fromEntries(names.map((n) => [n, g.int(0, 4) === 0 ? -g.int(1, 9) : g.int(0, 12)]));
      return { kind: "evaluate", operands: [treeText(t, true, null, false)], ...(names.length > 0 ? { values } : {}), tree: t } as unknown as Operation;
    },
    oracle: (op) => {
      const o = op as unknown as { tree: Tree; values?: Record<string, number> };
      const value = treeValue(o.tree, new Map(Object.entries(o.values ?? {}).map(([k, v]) => [k, q(big(v), big(1))])));
      return { dim: null, size: value! };
    },
    easier: { kind: "evaluate", operands: ["1 + 1"] },
  },
  solve: {
    make: (g) => {
      const x = q(big(g.int(-20, 60)), big(1));
      let text = g.pick(["x", "n", "y"]);
      const name = text;
      let value = x;
      for (let layers = g.int(1, 3), k = 0; k < layers; k++) {
        const c = big(g.int(1, 12));
        const form = g.pick(["+", "c+", "−", "×", "÷"]);
        const bare = /^[a-z]$/.test(text) || /^\d+[a-z]$/.test(text);
        if (form === "+") [text, value] = [`${text} + ${c}`, add(value, q(c, big(1)))];
        if (form === "c+") [text, value] = [`${c} + ${text}`, add(value, q(c, big(1)))];
        if (form === "−") [text, value] = [`${text} − ${c}`, sub(value, q(c, big(1)))];
        if (form === "×") [text, value] = [/^[a-z]$/.test(text) ? `${c}${text}` : `${c}(${text})`, mul(value, q(c, big(1)))];
        if (form === "÷") [text, value] = [bare ? `${text} ÷ ${c}` : `(${text}) ÷ ${c}`, div(value, q(c, big(1)))];
      }
      const number = (() => {
        const d = value[1];
        let places = 0;
        while (places <= 3 && (value[0] * big(10) ** big(places)) % d !== big(0)) places++;
        // A number side with more than 3 decimal places is beyond the reader, so the problem is skipped.
        if (places > 3) return "0.0001";
        const scaled = absBig(value[0]) * big(10) ** big(places) / d;
        const digits = scaled.toString().padStart(places + 1, "0");
        const written = places === 0 ? digits : `${digits.slice(0, -places)}.${digits.slice(-places)}`;
        return `${value[0] < big(0) ? "−" : ""}${written}`;
      })();
      const equation = g.int(0, 3) === 0 ? `${number} = ${text}` : `${text} = ${number}`;
      return { kind: "solve", operands: [equation], x, name } as unknown as Operation;
    },
    oracle: (op) => ({ dim: null, size: (op as unknown as { x: Q }).x }),
    easier: { kind: "solve", operands: ["x + 1 = 2"] },
  },
};

const PROBLEMS_PER_KIND = 300;
/** Cash rounding and a time later say no equality; a clock change and an elapsed time in one count say none in some problems. */
const MIN_EQUALITIES: Record<string, number> = { "money-round": 0, "time-add": 0, "clock-convert": 100, "elapsed-time": 200 };

/** The operation without the fields the generator keeps for its oracle. */
const clean = (op: Operation): Operation =>
  Object.fromEntries(Object.entries(op).filter(([key]) => !["tree", "x", "name"].includes(key))) as unknown as Operation;

function packageFor(operation: Operation, easier: Operation): OperationPackage {
  return {
    id: "gen-1",
    ref: { source: "workbook", workbookId: "wb-gen", page: 1, question: 1 },
    templateId: null,
    text: "Generated.",
    answer: { value: operationResult(operation), accepted: [], unit: null },
    operation,
    steps: workedSteps(operation),
    skill: { standard: "5.14", skills: [] },
    level: 20,
    difficulty: 2,
    wrongAnswers: [{ value: { type: "text", value: "no idea" }, cause: "M9", description: "A made-up mistake", step: null }],
    easierExample: { text: "Easier.", operation: easier, answer: operationResult(easier), steps: workedSteps(easier) },
  };
}

/** Another value of the same form: one more in its last part. */
function changed(v: AnswerValue): AnswerValue {
  switch (v.type) {
    case "number":
      return { type: "number", value: v.value + 1 };
    case "quantity":
      return { ...v, value: v.value + 1 };
    case "compound":
      return { ...v, parts: [{ ...v.parts[0], value: v.parts[0].value + 1 }, ...v.parts.slice(1)] };
    case "time":
      return { ...v, minutes: (v.minutes + 1) % 60 };
    default:
      throw new Error(`no change for ${v.type}`);
  }
}

describe.each(Object.entries(CASES))("generated %s problems", (kind, c) => {
  it(`recomputes ${PROBLEMS_PER_KIND} problems exactly, and every equality in their words is true`, () => {
    const g = generator(kind.length * 7919 + 307);
    let equalities = 0;
    for (let found = 0, tries = 0; found < PROBLEMS_PER_KIND; tries++) {
      expect(tries, `${kind}: too few valid problems`).toBeLessThan(PROBLEMS_PER_KIND * 40);
      const generated = c.make(g);
      const op = clean(generated);
      if (operationProblem(op) !== null) continue;
      const p = packageFor(op, c.easier);
      const check = checkQuestionPackage(p);
      // The easier example's rules are not what this test checks: a problem as small as the easier one, or with its
      // answer, is skipped.
      if (!check.ok && (check.reason === "the easier example is not smaller than the question" || check.reason === "the easier example has the question's answer")) continue;
      found++;

      const result = operationResult(op);
      const expected = c.oracle(generated);
      const exact = "dim" in expected ? expected : measured(expected);
      expect(sameMeasured(measured(result), exact), `${JSON.stringify(op)} gives ${JSON.stringify(result)}`).toBe(true);
      if ("unit" in op && op.unit !== undefined) expect(result).toMatchObject({ type: "quantity", unit: op.unit });

      const unknowns = new Map<string, Q>(op.kind === "solve" ? [[(generated as unknown as { name: string }).name, exact.size]] : []);
      const steps = workedSteps(op);
      expect(new Set(steps.map((s) => s.id)).size, "step ids are unique").toBe(steps.length);
      for (const s of steps) {
        const said = stepText(s, op);
        expect(said).not.toMatch(/undefined|NaN|null|-\d|\.\./);
        equalities += checkEqualities(said, unknowns);
      }

      expect(check, JSON.stringify(op)).toEqual({ ok: true, status: "checked", package: p });

      const wrongAnswer = structuredClone(p);
      wrongAnswer.answer.value = changed(p.answer.value);
      expect(checkQuestionPackage(wrongAnswer).status, JSON.stringify(op)).toBe("failed");

      const wrongStep = structuredClone(p);
      const step = wrongStep.steps[g.int(0, wrongStep.steps.length - 2)] as unknown as Record<string, unknown>;
      const field = Object.keys(step).find((k) => typeof step[k] === "number");
      if (field) step[field] = (step[field] as number) + 1;
      else step.id = "changed";
      expect(checkQuestionPackage(wrongStep).status, JSON.stringify(op)).toBe("failed");
    }
    expect(equalities, "equalities read back").toBeGreaterThanOrEqual(MIN_EQUALITIES[kind] ?? PROBLEMS_PER_KIND);
  });
});

describe("the reader of equalities", () => {
  it("finds a false equality, with units, clock words and unknowns", () => {
    expect(checkEqualities("1 km = 1000 m, so multiply by 1000: 2.5 × 1000 = 2500. 2.5 km = 2500 m.", new Map())).toBe(3);
    expect(checkEqualities("45 min + 45 min = 1 h 30 min", new Map())).toBe(1);
    expect(checkEqualities("From 2:15 p.m. to 3:00 p.m. is 45 min.", new Map())).toBe(0);
    expect(checkEqualities("Subtract 5 from both sides: 20 − 5 = 15, so 3x = 15.", new Map([["x", q(big(5), big(1))]]))).toBe(2);
    expect(() => checkEqualities("1 km = 100 m", new Map())).toThrow(/false equality/);
    expect(() => checkEqualities("$1.00 = 10¢", new Map())).toThrow(/false equality/);
    expect(() => checkEqualities("5 − (−2) = 3", new Map())).toThrow(/false equality/);
    expect(() => checkEqualities("so 3x = 14.", new Map([["x", q(big(5), big(1))]]))).toThrow(/false equality/);
  });
});

describe("the same sum in every other unit of its measure (#354 review)", () => {
  // A sum in one unit, worked here, is written in every other unit of its measure whose decimal ends (0.2 mm is
  // 0.0002 m, and 2e-7 km as String writes it). That form must be taken as the answer and as an accepted form, and
  // refused as a wrong answer: a right answer marked wrong, or allowed as a wrong answer, is the defect.

  /** A rational as decimal digits, or null when its decimal does not end. */
  function decimalText([n, d]: Q): string | null {
    let [digits, places] = [n, 0];
    for (; digits % d !== big(0) && places < 40; places++) digits *= big(10);
    if (digits % d !== big(0)) return null;
    const text = (digits / d).toString().padStart(places + 1, "0");
    return places === 0 ? text : `${text.slice(0, -places)}.${text.slice(-places)}`;
  }
  const unitSize = (u: Unit) => q(big(UNIT_SIZE[u][1]), big(1));
  const g = generator(354);
  const cases: { from: Unit; to: Unit; operands: [number, number]; other: number }[] = [];
  for (const units of Object.values(UNITS_OF)) {
    for (const from of units) {
      for (const to of units) {
        if (from === to) continue;
        for (let made = 0, tries = 0; made < 25 && tries < 1000; tries++) {
          const places = g.int(0, placesFor(from));
          const [a, b] = [g.int(100, 4999), g.int(100, 4999)].map((n) => q(big(n), big(10) ** big(places)));
          const other = decimalText(div(mul(add(a, b), unitSize(from)), unitSize(to)));
          if (other === null || (other.split(".")[1] ?? "").length > (to === "¢" ? 0 : to === "$" ? 2 : Infinity)) continue;
          cases.push({ from, to, operands: [Number(decimalText(a)), Number(decimalText(b))], other: Number(other) });
          made++;
        }
      }
    }
  }

  it("has cases for each of the 28 pairs of units of one measure", () => {
    expect(new Set(cases.map((c) => `${c.from} ${c.to}`)).size).toBe(28);
    expect(cases.length).toBe(28 * 25);
  });

  it("takes the sum in the other unit as the answer and as an accepted form, and refuses it as a wrong answer", () => {
    const wrongWays: string[] = [];
    for (const c of cases) {
      const zero = c.from === "$" ? "¢" : c.from;
      const op: Operation = { kind: "quantity-add", operands: [qty(c.operands[0], c.from), qty(c.operands[1], c.from)] };
      const make = () => packageFor(op, { kind: "quantity-add", operands: [qty(0, zero), qty(0, zero)] });
      const label = `${c.operands[0]} ${c.from} + ${c.operands[1]} ${c.from} = ${c.other} ${c.to}`;
      const control = checkQuestionPackage(make());
      if (control.status !== "checked") {
        wrongWays.push(`${label}, control: ${JSON.stringify(control)}`);
        continue;
      }
      const [main, accepted, wrong] = [make(), make(), make()];
      main.answer.value = qty(c.other, c.to);
      accepted.answer.accepted = [qty(c.other, c.to)];
      wrong.wrongAnswers[0].value = qty(c.other, c.to);
      for (const [where, p] of [["answer", main], ["accepted form", accepted]] as const) {
        const check = checkQuestionPackage(p);
        if (check.status === "failed") wrongWays.push(`${label}, ${where}: ${check.reason}`);
      }
      if (checkQuestionPackage(wrong).status === "checked") wrongWays.push(`${label}, wrong answer: checked`);
    }
    expect(wrongWays).toEqual([]);
  });
});
