import { describe, expect, it } from "vitest";
import {
  checkQuestionPackage,
  operationResult,
  stepText,
  workedSteps,
  type AnswerValue,
  type FractionOperand,
  type Operation,
  type QuestionPackage,
  type WorkedStep,
} from "@/lib/question-package";

// Property checks (#306): many generated problems of each kind. For each one, an independent BigInt computation here
// gives the exact value, and the worked steps are read back as a child would: the written digits must make the
// answer, every carry and remainder must add up, and every fraction step must keep the value. A package built from the
// steps is checked, and the same package with a wrong answer or a changed step fails.

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

// ---------- An exact rational, independent of the module ----------

type Q = [bigint, bigint];
const big = BigInt;
const absBig = (x: bigint) => (x < big(0) ? -x : x);
const bigGcd = (a: bigint, b: bigint): bigint => (b === big(0) ? absBig(a) : bigGcd(b, a % b));
const q = (n: bigint, d: bigint): Q => {
  const g = bigGcd(n, d) || big(1);
  return [n / g, d / g];
};
const decimalQ = (x: number): Q => {
  const [whole, frac = ""] = String(x).split(".");
  return q(big(whole + frac), big(10) ** big(frac.length));
};
const valueQ = (v: AnswerValue): Q => {
  switch (v.type) {
    case "number":
      return decimalQ(v.value);
    case "fraction":
      return q(big(v.numerator), big(v.denominator));
    case "mixed":
      return q(big(v.whole * v.denominator + v.numerator), big(v.denominator));
    default:
      throw new Error(`no number: ${v.type}`);
  }
};
const add = (a: Q, b: Q) => q(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const sub = (a: Q, b: Q) => q(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const mul = (a: Q, b: Q) => q(a[0] * b[0], a[1] * b[1]);
const div = (a: Q, b: Q) => q(a[0] * b[1], a[1] * b[0]);
const same = (a: Q, b: Q) => a[0] * b[1] === b[0] * a[1];

/** The exact value of an operation, worked here without the module. */
function oracle(op: Operation): Q {
  switch (op.kind) {
    case "add":
    case "decimal-add":
      return add(decimalQ(op.operands[0]), decimalQ(op.operands[1]));
    case "subtract":
    case "decimal-subtract":
      return sub(decimalQ(op.operands[0]), decimalQ(op.operands[1]));
    case "multiply":
    case "decimal-multiply":
      return mul(decimalQ(op.operands[0]), decimalQ(op.operands[1]));
    case "divide":
      return q(big(op.operands[0]), big(op.operands[1]));
    case "fraction-add":
      return add(valueQ(op.operands[0]), valueQ(op.operands[1]));
    case "fraction-subtract":
      return sub(valueQ(op.operands[0]), valueQ(op.operands[1]));
    case "fraction-multiply":
      return mul(valueQ(op.operands[0]), valueQ(op.operands[1]));
    case "fraction-divide":
      return div(valueQ(op.operands[0]), valueQ(op.operands[1]));
    case "fraction-simplify":
    case "fraction-equivalent":
      return valueQ(op.operands[0]);
  }
}

// ---------- Reading the steps back ----------

/** The power of ten of each column. */
const POWER: Record<string, number> = {
  thousandths: -3, hundredths: -2, tenths: -1, ones: 0, tens: 1, hundreds: 2, thousands: 3, "ten thousands": 4, "hundred thousands": 5, millions: 6,
};
/** The number written by digits in columns: digit times its column's power of ten. */
const assemble = (cells: { place: string; write: number | null }[]): Q =>
  cells.reduce<Q>((sum, c) => add(sum, mul(q(big(c.write ?? 0), big(1)), POWER[c.place] >= 0 ? q(big(10) ** big(POWER[c.place]), big(1)) : q(big(1), big(10) ** big(-POWER[c.place])))), q(big(0), big(1)));
const whole = (n: number): Q => q(big(n), big(1));
const of = <K extends WorkedStep["kind"]>(steps: WorkedStep[], kind: K) => steps.filter((s): s is Extract<WorkedStep, { kind: K }> => s.kind === kind);
const partsQ = (f: { numerator: number; denominator: number }) => q(big(f.numerator), big(f.denominator));

/** Reads the steps back and checks that they give `expected`; throws with the reason when they do not. */
function readBack(op: Operation, steps: WorkedStep[], expected: Q): void {
  const fail = (why: string) => {
    throw new Error(`${JSON.stringify(op)}: ${why}`);
  };
  for (const s of of(steps, "add-column")) {
    if (s.total !== s.digits.reduce((a, b) => a + b, 0) + s.carryIn || s.write !== s.total % 10 || s.carryOut !== Math.floor(s.total / 10)) fail(`column ${s.id} does not add up`);
  }
  for (const s of of(steps, "multiply-digit")) {
    if (s.total !== (s.top ?? 0) * s.multiplier + s.carryIn || (s.write !== null && s.write !== s.total % 10) || s.carryOut !== Math.floor(s.total / 10)) fail(`digit ${s.id} does not multiply`);
  }
  const columns = (prefix: string) => of(steps, "add-column").filter((s) => s.id.startsWith(prefix) && (prefix !== "" || !s.id.startsWith("sum-")));
  switch (op.kind) {
    case "add":
    case "decimal-add":
      if (!same(assemble(columns("")), expected)) fail("the written digits are not the sum");
      return;
    case "subtract":
    case "decimal-subtract": {
      const cells = of(steps, "subtract-column");
      for (const s of cells) {
        const from = s.top - (s.lent ? 1 : 0) + (s.regrouped ? 10 : 0);
        if (from < (s.bottom ?? 0) || (s.write !== null && s.write !== from - (s.bottom ?? 0))) fail(`column ${s.id} does not subtract`);
      }
      if (!same(assemble(cells), expected)) fail("the written digits are not the difference");
      return;
    }
    case "multiply":
    case "decimal-multiply": {
      const [a, b] = op.operands.map((x) => Number(String(x).replace(".", "")));
      const rows = of(steps, "partial-product");
      let product: Q;
      if (rows.length === 0) {
        product = assemble(of(steps, "multiply-digit"));
      } else {
        for (const r of rows) {
          const digits = of(steps, "multiply-digit").filter((s) => s.id.startsWith(`${r.id}-`));
          if (!same(assemble(digits), whole(a * r.multiplier))) fail(`row ${r.id} is not the top number times ${r.multiplier}`);
          if (r.value !== a * r.multiplier * 10 ** r.zeros) fail(`row ${r.id} has the wrong 0s`);
        }
        const sum = columns("sum-");
        product = sum.length > 0 ? assemble(sum) : whole(rows[0].value);
        if (!same(product, whole(rows.reduce((t, r) => t + r.value, 0)))) fail("the rows do not add up to the product");
      }
      if (!same(product, whole(a * b))) fail("the product is not the top number times the multiplier");
      const point = of(steps, "place-point")[0];
      const value = point ? decimalQ(point.value) : product;
      if (point && !same(mul(whole(point.product), q(big(1), big(10) ** big(point.decimals))), value)) fail("the point is in the wrong place");
      if (!same(value, expected)) fail("the steps do not give the product");
      return;
    }
    case "divide": {
      const [dividend, divisor] = op.operands;
      let remainder = 0;
      for (const s of of(steps, "divide-digit")) {
        if (s.current !== remainder * 10 + s.digit || s.product !== s.quotient * divisor || s.remainder !== s.current - s.product || s.remainder >= divisor || s.remainder < 0) fail(`step ${s.id} does not divide`);
        if (s.write !== null && s.write !== s.quotient) fail(`step ${s.id} writes another digit`);
        remainder = s.remainder;
      }
      const quotient = assemble(of(steps, "divide-digit"));
      if (!same(quotient, whole(Math.floor(dividend / divisor))) || remainder !== dividend % divisor) fail("the steps do not give the quotient and remainder");
      if (!same(add(quotient, q(big(remainder), big(divisor))), expected)) fail("the quotient and remainder are not the number");
      return;
    }
    default: {
      let value: Q | null = null;
      for (const s of steps) {
        switch (s.kind) {
          case "to-improper":
            s.from.forEach((f, i) => {
              if (!same(valueQ(f), partsQ(s.to[i]))) fail("an improper fraction is another number");
            });
            break;
          case "common-denominator":
            s.from.forEach((f, i) => {
              if (!same(partsQ(f), partsQ(s.to[i])) || s.to[i].denominator !== s.denominator || f.denominator * s.factors[i] !== s.denominator) fail("a common-denominator fraction is another number");
            });
            break;
          case "combine-numerators":
            if (s.numerator !== (s.op === "add" ? s.numerators[0] + s.numerators[1] : s.numerators[0] - s.numerators[1])) fail("the numerators do not combine");
            value = q(big(s.numerator), big(s.denominator));
            break;
          case "flip":
            if (s.to.numerator !== s.from.denominator || s.to.denominator !== s.from.numerator) fail("the flip is wrong");
            break;
          case "multiply-fractions":
            if (s.numerator !== s.numerators[0] * s.numerators[1] || s.denominator !== s.denominators[0] * s.denominators[1]) fail("the fractions do not multiply");
            value = q(big(s.numerator), big(s.denominator));
            break;
          case "simplify":
            if (s.from.numerator !== s.to.numerator * s.divisor || s.from.denominator !== s.to.denominator * s.divisor) fail("the simplification is wrong");
            value = partsQ(s.to);
            break;
          case "to-mixed":
            if (s.whole * s.rest.denominator + s.rest.numerator !== s.from.numerator || s.rest.denominator !== s.from.denominator || s.rest.numerator >= s.rest.denominator) fail("the mixed number is wrong");
            break;
          case "scale-fraction":
            if (!same(partsQ(s.from), partsQ(s.to)) || (op.kind === "fraction-equivalent" && s.to.denominator !== op.denominator)) fail("the scaled fraction is another number");
            value = partsQ(s.to);
            break;
          case "result":
            break;
          default:
            fail(`an unexpected step ${s.kind}`);
        }
      }
      if (value !== null && !same(value, expected)) fail("the fraction steps do not give the value");
    }
  }
}

// ---------- Generated problems ----------

/** A decimal with `places` decimal places from scaled digits. */
const decimal = (scaled: number, places: number) => Number((scaled / 10 ** places).toFixed(places));
const decimalWith = (g: Gen, minWhole: number, maxWhole: number) => {
  const places = g.int(1, 3);
  return decimal(g.int(minWhole, maxWhole) * 10 ** places + g.int(1, 10 ** places - 1), places);
};
const fraction = (g: Gen, minDenominator: number) => ({ type: "fraction" as const, numerator: g.int(0, 999), denominator: g.int(minDenominator, 100) });
const anyOperand = (g: Gen): FractionOperand => {
  const kind = g.pick(["fraction", "fraction", "mixed", "number"] as const);
  if (kind === "number") return { type: "number", value: g.int(0, 99) };
  if (kind === "fraction") return fraction(g, 1);
  const denominator = g.int(2, 100);
  return { type: "mixed", whole: g.int(1, 99), numerator: g.int(1, denominator - 1), denominator };
};
/** A first operand with a denominator from 10, so it is written with more digits than the easier example. */
const bigOperand = (g: Gen): FractionOperand =>
  g.int(0, 1) ? { type: "fraction", numerator: g.int(10, 999), denominator: g.int(10, 100) } : { type: "mixed", whole: g.int(1, 99), numerator: 1, denominator: g.int(10, 100) };
const larger = (a: FractionOperand, b: FractionOperand) => (same(valueQ(a), valueQ(b)) || sub(valueQ(a), valueQ(b))[0] > big(0));

interface KindCase {
  /** A generated problem, bigger than `easier`. */
  make(g: Gen): Operation;
  easier: Operation;
}

const f = (numerator: number, denominator: number) => ({ type: "fraction" as const, numerator, denominator });

const CASES: Record<Operation["kind"], KindCase> = {
  add: { make: (g) => ({ kind: "add", operands: [g.int(10, 9999), g.int(0, 9999)] }), easier: { kind: "add", operands: [1, 2] } },
  subtract: {
    make: (g) => {
      const a = g.int(10, 9999);
      return { kind: "subtract", operands: [a, g.int(0, a)] };
    },
    easier: { kind: "subtract", operands: [3, 1] },
  },
  multiply: { make: (g) => ({ kind: "multiply", operands: [g.int(10, 9999), g.int(0, 999)] }), easier: { kind: "multiply", operands: [2, 3] } },
  divide: { make: (g) => ({ kind: "divide", operands: [g.int(10, 9999), g.int(1, 99)] }), easier: { kind: "divide", operands: [7, 2] } },
  "decimal-add": { make: (g) => ({ kind: "decimal-add", operands: [decimalWith(g, 10, 9999), decimalWith(g, 0, 9999)] }), easier: { kind: "decimal-add", operands: [0.1, 0.2] } },
  "decimal-subtract": {
    make: (g) => {
      const a = decimalWith(g, 10, 9999);
      const b = decimalWith(g, 0, Math.floor(a) - 1);
      return { kind: "decimal-subtract", operands: [a, b] };
    },
    easier: { kind: "decimal-subtract", operands: [0.3, 0.1] },
  },
  "decimal-multiply": {
    make: (g) => {
      const places = g.int(1, 3);
      // The first number ends in a digit other than 0, so it keeps 4 digits.
      return { kind: "decimal-multiply", operands: [decimal(g.int(100, 999) * 10 + g.int(1, 9), places), decimal(g.int(1, 999), g.int(0, 2))] };
    },
    easier: { kind: "decimal-multiply", operands: [0.2, 3] },
  },
  "fraction-add": { make: (g) => ({ kind: "fraction-add", operands: [bigOperand(g), anyOperand(g)] }), easier: { kind: "fraction-add", operands: [f(1, 3), f(1, 3)] } },
  "fraction-subtract": {
    make: (g) => {
      for (;;) {
        const a = bigOperand(g);
        const b = anyOperand(g);
        if (larger(a, b)) return { kind: "fraction-subtract", operands: [a, b] };
      }
    },
    easier: { kind: "fraction-subtract", operands: [f(2, 3), f(1, 3)] },
  },
  "fraction-multiply": { make: (g) => ({ kind: "fraction-multiply", operands: [bigOperand(g), anyOperand(g)] }), easier: { kind: "fraction-multiply", operands: [f(1, 2), f(1, 3)] } },
  "fraction-divide": {
    make: (g) => {
      for (;;) {
        const b = anyOperand(g);
        if (!same(valueQ(b), q(big(0), big(1)))) return { kind: "fraction-divide", operands: [bigOperand(g), b] };
      }
    },
    easier: { kind: "fraction-divide", operands: [f(1, 2), f(1, 3)] },
  },
  "fraction-simplify": { make: (g) => ({ kind: "fraction-simplify", operands: [fraction(g, 10)] }), easier: { kind: "fraction-simplify", operands: [f(2, 4)] } },
  "fraction-equivalent": {
    make: (g) => {
      const factor = g.int(2, 10);
      if (g.int(0, 1)) {
        const d = g.int(10, 100);
        return { kind: "fraction-equivalent", operands: [f(g.int(0, 99), d)], denominator: d * factor };
      }
      const d = g.int(2, Math.floor(100 / factor));
      return { kind: "fraction-equivalent", operands: [f(g.int(Math.ceil(10 / factor), Math.floor(999 / factor)) * factor, d * factor)], denominator: d };
    },
    easier: { kind: "fraction-equivalent", operands: [f(1, 2)], denominator: 4 },
  },
};

const PROBLEMS_PER_KIND = 300;

function packageFor(operation: Operation, easier: Operation): QuestionPackage {
  return {
    id: "gen-1",
    ref: { source: "workbook", workbookId: "wb-gen", page: 1, question: 1 },
    templateId: null,
    text: "Generated.",
    answer: { value: operationResult(operation), accepted: [], unit: null },
    operation,
    steps: workedSteps(operation),
    skill: { standard: "5.6", skills: [] },
    level: 20,
    difficulty: 2,
    wrongAnswers: [{ value: { type: "number", value: -1 }, cause: "O9", description: "A made-up mistake", step: null }],
    easierExample: { text: "Easier.", operation: easier, answer: operationResult(easier), steps: workedSteps(easier) },
  };
}

describe.each(Object.entries(CASES))("generated %s problems", (kind, c) => {
  it(`recomputes ${PROBLEMS_PER_KIND} problems exactly, step by step`, () => {
    const g = generator(kind.length * 7919 + 306);
    for (let i = 0; i < PROBLEMS_PER_KIND; i++) {
      const op = c.make(g);
      const expected = oracle(op);
      const result = operationResult(op);
      if (result.type === "remainder") {
        const [dividend, divisor] = op.operands as [number, number];
        expect([result.quotient, result.remainder]).toEqual([Math.floor(dividend / divisor), dividend % divisor]);
      } else {
        expect(same(valueQ(result), expected), `${JSON.stringify(op)} gives ${JSON.stringify(result)}`).toBe(true);
      }
      const steps = workedSteps(op);
      readBack(op, steps, expected);
      expect(steps.at(-1)).toEqual({ id: "result", kind: "result", value: result });
      expect(new Set(steps.map((s) => s.id)).size, "step ids are unique").toBe(steps.length);
      for (const s of steps) expect(stepText(s, op)).not.toMatch(/undefined|NaN|null/);

      const p = packageFor(op, c.easier);
      const check = checkQuestionPackage(p);
      expect(check, JSON.stringify(op)).toEqual({ ok: true, status: "checked", package: p });

      const wrongAnswer = structuredClone(p);
      wrongAnswer.answer.value = { type: "number", value: -1 };
      wrongAnswer.wrongAnswers[0].value = { type: "number", value: -2 };
      expect(checkQuestionPackage(wrongAnswer).status).toBe("failed");

      const wrongStep = structuredClone(p);
      const step = wrongStep.steps[g.int(0, wrongStep.steps.length - 2)] as unknown as Record<string, unknown>;
      const field = Object.keys(step).find((k) => typeof step[k] === "number");
      if (field) step[field] = (step[field] as number) + 1;
      else step.id = "changed";
      expect(checkQuestionPackage(wrongStep).status).toBe("failed");
    }
  });
});
