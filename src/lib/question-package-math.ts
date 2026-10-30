// The computations behind the question package (#298, #306): for each operation kind, the check of its operands, the
// value it gives, its worked steps as data, and the words of each step. The package module (question-package.ts)
// re-exports the public functions; the checker there compares a stored package with what is computed here.
//
// The steps are semantic (digits, places, carries, remainders, fraction parts), never text, so a board can lay them
// out and a later change of wording never makes a stored package invalid. A change to the shape of a step needs a new
// steps version (STEPS_VERSIONS in question-package.ts), so steps stored under the old shape stay readable.
//
// Whole numbers and decimals are worked digit by digit on safe integers; fractions on small safe integers. Nothing
// here uses floating-point arithmetic on a value: a decimal is read from its written digits.
// Pure TypeScript: no Next.js, React, network, database or clock.
import type {
  AnswerValue,
  FractionOperand,
  FractionParts,
  Operation,
  OperationKind,
  Place,
  WorkedStep,
} from "@/lib/question-package";

/** The columns of the written method, from the smallest place. */
const PLACE_ORDER: readonly Place[] = [
  "thousandths", "hundredths", "tenths", "ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands", "millions",
];
/** A place's unit name, for "carry 1 ten". */
const UNIT: Record<Place, string> = {
  thousandths: "thousandth", hundredths: "hundredth", tenths: "tenth", ones: "one", tens: "ten", hundreds: "hundred",
  thousands: "thousand", "ten thousands": "ten thousand", "hundred thousands": "hundred thousand", millions: "million",
};
/** The place of a column: 0 is the ones, 1 the tens, -1 the tenths. */
const placeAt = (column: number): Place => PLACE_ORDER[column + 3];
const left = (place: Place) => PLACE_ORDER[PLACE_ORDER.indexOf(place) + 1];
const right = (place: Place) => PLACE_ORDER[PLACE_ORDER.indexOf(place) - 1];

const MINUS = "−";
const TIMES = "×";
const DIVIDE = "÷";

const digitAt = (n: number, i: number) => Math.floor(n / 10 ** i) % 10;
const digitCount = (n: number) => String(n).length;

export const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

// ---------- Written numbers ----------

/** A number as written in a column: its digits without the point, and its count of decimal places (3.45 is 345, 2). */
interface Written {
  scaled: number;
  places: number;
}

/** A whole or decimal number as written, or null when it has more than `maxPlaces` decimal places or is negative. */
function written(x: unknown, maxPlaces: number): Written | null {
  if (typeof x !== "number" || !Number.isFinite(x) || x < 0) return null;
  // String() gives the shortest digits that read back as the same number: the number as written.
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(x));
  if (!m) return null;
  const decimals = m[2] ?? "";
  if (decimals.length > maxPlaces) return null;
  return { scaled: Number(m[1] + decimals), places: decimals.length };
}

/** The number written by digits and a count of decimal places: (325, 2) is 3.25. */
function fromWritten(scaled: number, places: number): number {
  if (places === 0) return scaled;
  const digits = String(scaled).padStart(places + 1, "0");
  return Number(`${digits.slice(0, -places)}.${digits.slice(-places)}`);
}

const whole = (n: number): Written => ({ scaled: n, places: 0 });
/** Digits left of the point; 0.5 has one, its 0. */
const wholeDigits = (w: Written) => digitCount(Math.floor(w.scaled / 10 ** w.places));
const hasDigit = (w: Written, column: number) => column >= -w.places && column < wholeDigits(w);
const digitOf = (w: Written, column: number) => digitAt(w.scaled, column + w.places);

// ---------- Column methods ----------

/** Column addition, lined up on the point, from the smallest place; `prefix` names the steps ("sum-"). */
function addColumns(numbers: Written[], prefix = ""): WorkedStep[] {
  const steps: WorkedStep[] = [];
  const top = Math.max(...numbers.map(wholeDigits));
  let carry = 0;
  for (let column = -Math.max(...numbers.map((n) => n.places)); column < top || carry > 0; column++) {
    const digits = numbers.filter((n) => hasDigit(n, column)).map((n) => digitOf(n, column));
    const total = digits.reduce((s, d) => s + d, 0) + carry;
    const place = placeAt(column);
    steps.push({ id: prefix + place, kind: "add-column", place, digits, carryIn: carry, total, write: total % 10, carryOut: Math.floor(total / 10) });
    carry = Math.floor(total / 10);
  }
  return steps;
}

/** Column subtraction, lined up on the point. A top number with fewer decimal places gets a 0 written in. */
function subtractColumns(a: Written, b: Written): WorkedStep[] {
  const places = Math.max(a.places, b.places);
  const difference = a.scaled * 10 ** (places - a.places) - b.scaled * 10 ** (places - b.places);
  const steps: WorkedStep[] = [];
  let lent = false;
  for (let column = -places; column < wholeDigits(a); column++) {
    const addedZero = !hasDigit(a, column);
    const top = addedZero ? 0 : digitOf(a, column);
    const bottom = hasDigit(b, column) ? digitOf(b, column) : null;
    const regrouped: boolean = top - (lent ? 1 : 0) < (bottom ?? 0);
    const write = top - (lent ? 1 : 0) + (regrouped ? 10 : 0) - (bottom ?? 0);
    // The columns left of the ones that are 0 on the left of the result are not written.
    const leading = column > 0 && Math.floor(difference / 10 ** (column + places)) === 0;
    const place = placeAt(column);
    steps.push({ id: place, kind: "subtract-column", place, top, bottom, lent, regrouped, write: leading ? null : write, ...(addedZero ? { addedZero: true as const } : {}) });
    lent = regrouped;
  }
  return steps;
}

/**
 * Long multiplication of whole numbers: one row for each digit of the multiplier (a 0 digit of a longer multiplier
 * has no row), each row digit by digit with its carries, then the rows added in columns.
 */
function multiplyRows(a: number, b: number): WorkedStep[] {
  const steps: WorkedStep[] = [];
  const rows: number[] = [];
  const multiplierDigits = digitCount(b);
  for (let j = 0; j < multiplierDigits; j++) {
    const multiplier = digitAt(b, j);
    if (multiplier === 0 && multiplierDigits > 1) continue;
    const row = placeAt(j);
    const value = a * multiplier;
    let carry = 0;
    for (let i = 0; i < digitCount(a) || carry > 0; i++) {
      const top = i < digitCount(a) ? digitAt(a, i) : null;
      const total = (top ?? 0) * multiplier + carry;
      // A row of 0s from a 0 multiplier writes one 0, not one for each digit.
      const leading = i > 0 && Math.floor(value / 10 ** i) === 0;
      steps.push({ id: `r${j + 1}-${placeAt(i)}`, kind: "multiply-digit", row, place: placeAt(i), top, multiplier, carryIn: carry, total, write: leading ? null : total % 10, carryOut: Math.floor(total / 10) });
      carry = Math.floor(total / 10);
    }
    rows.push(value * 10 ** j);
    if (multiplierDigits > 1) steps.push({ id: `r${j + 1}`, kind: "partial-product", row, multiplier, zeros: j, value: value * 10 ** j });
  }
  if (rows.length > 1) steps.push(...addColumns(rows.map(whole), "sum-"));
  return steps;
}

/** Long division, one digit of the dividend at a time, from the left. */
function divideDigits(dividend: number, divisor: number): WorkedStep[] {
  const steps: WorkedStep[] = [];
  let remainder = 0;
  let started = false;
  for (let i = digitCount(dividend) - 1; i >= 0; i--) {
    const digit = digitAt(dividend, i);
    const current = remainder * 10 + digit;
    const quotient = Math.floor(current / divisor);
    const product = quotient * divisor;
    // A 0 on the left of the quotient is not written; the last digit is always written (3 ÷ 5 is 0 R 3).
    const write: number | null = quotient === 0 && !started && i > 0 ? null : quotient;
    started ||= write !== null;
    remainder = current - product;
    steps.push({ id: placeAt(i), kind: "divide-digit", place: placeAt(i), digit, current, quotient, write, product, remainder });
  }
  return steps;
}

// ---------- Fractions ----------

const toParts = (numerator: number, denominator: number): FractionParts => ({ numerator, denominator });

/** An operand as a fraction: a mixed number or a whole number becomes an improper fraction. */
function improper(v: FractionOperand): FractionParts {
  switch (v.type) {
    case "number":
      return toParts(v.value, 1);
    case "fraction":
      return toParts(v.numerator, v.denominator);
    case "mixed":
      return toParts(v.whole * v.denominator + v.numerator, v.denominator);
  }
}

/** The operand as stored, with only its own fields. */
function cleanOperand(v: FractionOperand): FractionOperand {
  switch (v.type) {
    case "number":
      return { type: "number", value: v.value };
    case "fraction":
      return { type: "fraction", numerator: v.numerator, denominator: v.denominator };
    case "mixed":
      return { type: "mixed", whole: v.whole, numerator: v.numerator, denominator: v.denominator };
  }
}

/** A fraction in its simplest form: a whole number, a proper fraction, or a mixed number, in lowest terms. */
function simplest({ numerator, denominator }: FractionParts): AnswerValue {
  const g = gcd(numerator, denominator);
  const n = numerator / g;
  const d = denominator / g;
  if (d === 1) return { type: "number", value: n };
  if (n > d) return { type: "mixed", whole: Math.floor(n / d), numerator: n % d, denominator: d };
  return { type: "fraction", numerator: n, denominator: d };
}

/** The last steps of a fraction result: simplify, then write an improper fraction as a mixed number. */
function finish({ numerator, denominator }: FractionParts): WorkedStep[] {
  const steps: WorkedStep[] = [];
  const g = gcd(numerator, denominator);
  let n = numerator;
  let d = denominator;
  if (g > 1) {
    n /= g;
    d /= g;
    steps.push({ id: "simplify", kind: "simplify", from: toParts(numerator, denominator), divisor: g, to: toParts(n, d) });
  }
  if (d > 1 && n > d) steps.push({ id: "mixed", kind: "to-mixed", from: toParts(n, d), whole: Math.floor(n / d), rest: toParts(n % d, d) });
  return steps;
}

/** The unsimplified result of a two-operand fraction operation, and its steps up to it. */
function fractionWork(op: FractionPairOperation): { steps: WorkedStep[]; value: FractionParts } {
  const steps: WorkedStep[] = [];
  let [x, y] = op.operands.map(improper);
  if (op.operands.some((o) => o.type !== "fraction")) {
    steps.push({ id: "improper", kind: "to-improper", from: op.operands.map(cleanOperand), to: [x, y] });
  }
  if (op.kind === "fraction-add" || op.kind === "fraction-subtract") {
    if (x.denominator !== y.denominator) {
      const d = lcm(x.denominator, y.denominator);
      const factors = [d / x.denominator, d / y.denominator];
      const to = [toParts(x.numerator * factors[0], d), toParts(y.numerator * factors[1], d)];
      steps.push({ id: "common", kind: "common-denominator", from: [x, y], denominator: d, factors, to });
      [x, y] = to;
    }
    const add = op.kind === "fraction-add";
    const numerator = add ? x.numerator + y.numerator : x.numerator - y.numerator;
    steps.push({ id: "combine", kind: "combine-numerators", op: add ? "add" : "subtract", numerators: [x.numerator, y.numerator], denominator: x.denominator, numerator });
    return { steps, value: toParts(numerator, x.denominator) };
  }
  if (op.kind === "fraction-divide") {
    const flipped = toParts(y.denominator, y.numerator);
    steps.push({ id: "flip", kind: "flip", from: y, to: flipped });
    y = flipped;
  }
  const value = toParts(x.numerator * y.numerator, x.denominator * y.denominator);
  steps.push({ id: "multiply", kind: "multiply-fractions", numerators: [x.numerator, y.numerator], denominators: [x.denominator, y.denominator], ...value });
  return { steps, value };
}

/** How an equivalent fraction is found: multiply or divide the top and the bottom by one factor. */
function scale(op: EquivalentOperation): Extract<WorkedStep, { kind: "scale-fraction" }> {
  const from = improper(op.operands[0]);
  const target = op.denominator;
  const by = target % from.denominator === 0 ? "multiply" : "divide";
  const factor = by === "multiply" ? target / from.denominator : from.denominator / target;
  const numerator = by === "multiply" ? from.numerator * factor : from.numerator / factor;
  return { id: "scale", kind: "scale-fraction", from, by, factor, to: toParts(numerator, target) };
}

// ---------- Operand checks ----------

type Unknown = Record<string, unknown>;
const isWhole = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const pair = (operands: unknown): operands is [unknown, unknown] => Array.isArray(operands) && operands.length === 2;
const one = (operands: unknown): operands is [unknown] => Array.isArray(operands) && operands.length === 1;

const MAX_WHOLE = 9999;
const MAX_MULTIPLIER = 999;
const MAX_DIVISOR = 99;
const MAX_PLACES = 3;
const MAX_DENOMINATOR = 100;
const MAX_NUMERATOR = 999;
const MAX_MIXED_WHOLE = 99;
const MAX_NEW_DENOMINATOR = 1000;

const WHOLE_PAIR = `the operation needs two whole numbers from 0 to ${MAX_WHOLE}`;
const DECIMAL_PAIR = `the operation needs two numbers from 0 to ${MAX_WHOLE}.999 with at most ${MAX_PLACES} decimal places`;
const FRACTION_OPERANDS = `the operation needs fractions with denominators from 1 to ${MAX_DENOMINATOR}, mixed numbers or whole numbers to ${MAX_MIXED_WHOLE}`;

/** A fraction operand as code can work it: a fraction, a mixed number in lowest terms of its parts, or a whole number. */
function isFractionOperand(v: unknown): v is FractionOperand {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Unknown;
  switch (o.type) {
    case "number":
      return isWhole(o.value, 0, MAX_MIXED_WHOLE);
    case "fraction":
      return isWhole(o.numerator, 0, MAX_NUMERATOR) && isWhole(o.denominator, 1, MAX_DENOMINATOR);
    case "mixed":
      return isWhole(o.whole, 1, MAX_MIXED_WHOLE) && isWhole(o.denominator, 2, MAX_DENOMINATOR) && isWhole(o.numerator, 1, (o.denominator as number) - 1);
    default:
      return false;
  }
}

/** Below zero: a fraction subtraction whose second number is bigger than its first. */
const belowZero = (a: FractionParts, b: FractionParts) => a.numerator * b.denominator < b.numerator * a.denominator;

// ---------- The operation kinds ----------

type Of<K extends OperationKind> = Extract<Operation, { kind: K }>;
type FractionPairOperation = Of<"fraction-add" | "fraction-subtract" | "fraction-multiply" | "fraction-divide">;
type EquivalentOperation = Of<"fraction-equivalent">;

/** What counts as the answer: exactly the value the operation gives, or that value in any simplest form. */
type AnswerRule = "result" | "simplest";
/** Which other forms may be accepted: any form of the same number, only simplest forms, or none. */
type AcceptedRule = "same-number" | "simplest" | "none";
/** Which forms of the answer's number may still be listed as wrong: none, fractions not simplified, or any other form. */
type SameNumberWrongRule = "never" | "unsimplified" | "any";

export interface Computation<O extends Operation = Operation> {
  /** Why the operation's operands do not suit this kind, or null. The operation has this kind. */
  problem(op: Unknown): string | null;
  /** The operation as the child reads it, without the answer: "48 + 37", "Simplify 6/8", "3/4 = ?/12". */
  text(op: O): string;
  /** The left side of the result: "48 + 37", "6/8". */
  statement(op: O): string;
  /** The worked steps, without the result step. */
  steps(op: O): WorkedStep[];
  /** The value the operation gives, in the form its result step shows. */
  result(op: O): AnswerValue;
  /** The exact number the operation gives, as a number or a fraction (17 ÷ 4 is 17/4). */
  exact(op: O): AnswerValue;
  answer: AnswerRule;
  accepted: AcceptedRule;
  sameNumberWrong: SameNumberWrongRule;
}

const operandText = (v: FractionOperand) => valueText(v);
const pairText = (symbol: string) => (op: { operands: [unknown, unknown] }) => `${text(op.operands[0])} ${symbol} ${text(op.operands[1])}`;
const text = (v: unknown) => (typeof v === "number" ? String(v) : operandText(v as FractionOperand));

const NUMBER_RULES = { answer: "result", accepted: "same-number", sameNumberWrong: "never" } as const;
const FRACTION_RULES = { answer: "simplest", accepted: "same-number", sameNumberWrong: "unsimplified" } as const;

function wholePair(op: Unknown, max = MAX_WHOLE): [number, number] | null {
  return pair(op.operands) && isWhole(op.operands[0], 0, MAX_WHOLE) && isWhole(op.operands[1], 0, max) ? op.operands as [number, number] : null;
}

function decimalPair(op: Unknown): [Written, Written] | null {
  if (!pair(op.operands)) return null;
  const [a, b] = op.operands.map((x) => written(x, MAX_PLACES));
  return a && b && a.scaled <= MAX_WHOLE * 1000 && b.scaled <= MAX_WHOLE * 1000 ? [a, b] : null;
}

const decimalOperands = (op: { operands: [number, number] }) => op.operands.map((x) => written(x, MAX_PLACES) as Written) as [Written, Written];

function fractionPair(op: Unknown): [FractionOperand, FractionOperand] | null {
  return pair(op.operands) && op.operands.every(isFractionOperand) ? op.operands as [FractionOperand, FractionOperand] : null;
}

const fractionPairComputation = <K extends FractionPairOperation["kind"]>(symbol: string, problem: (a: FractionParts, b: FractionParts) => string | null): Computation<Of<K>> => ({
  ...FRACTION_RULES,
  problem: (op) => {
    const operands = fractionPair(op);
    return operands ? problem(improper(operands[0]), improper(operands[1])) : FRACTION_OPERANDS;
  },
  text: pairText(symbol),
  statement: pairText(symbol),
  steps: (op) => {
    const { steps, value } = fractionWork(op);
    return [...steps, ...finish(value)];
  },
  result: (op) => simplest(fractionWork(op).value),
  exact: (op) => simplest(fractionWork(op).value),
});

/** What code computes for each operation kind. */
const OPERATIONS: { [K in OperationKind]: Computation<Of<K>> } = {
  add: {
    ...NUMBER_RULES,
    problem: (op) => (wholePair(op) ? null : WHOLE_PAIR),
    text: pairText("+"),
    statement: pairText("+"),
    steps: ({ operands: [a, b] }) => addColumns([whole(a), whole(b)]),
    result: ({ operands: [a, b] }) => ({ type: "number", value: a + b }),
    exact: ({ operands: [a, b] }) => ({ type: "number", value: a + b }),
  },
  subtract: {
    ...NUMBER_RULES,
    problem: (op) => {
      const operands = wholePair(op);
      if (!operands) return WHOLE_PAIR;
      return operands[0] < operands[1] ? "the subtraction goes below zero" : null;
    },
    text: pairText(MINUS),
    statement: pairText(MINUS),
    steps: ({ operands: [a, b] }) => subtractColumns(whole(a), whole(b)),
    result: ({ operands: [a, b] }) => ({ type: "number", value: a - b }),
    exact: ({ operands: [a, b] }) => ({ type: "number", value: a - b }),
  },
  multiply: {
    ...NUMBER_RULES,
    problem: (op) => (wholePair(op, MAX_MULTIPLIER) ? null : `the multiplication needs a whole number from 0 to ${MAX_WHOLE} times a whole number from 0 to ${MAX_MULTIPLIER}`),
    text: pairText(TIMES),
    statement: pairText(TIMES),
    steps: ({ operands: [a, b] }) => multiplyRows(a, b),
    result: ({ operands: [a, b] }) => ({ type: "number", value: a * b }),
    exact: ({ operands: [a, b] }) => ({ type: "number", value: a * b }),
  },
  divide: {
    ...NUMBER_RULES,
    problem: (op) => {
      const operands = wholePair(op, MAX_DIVISOR);
      return operands && operands[1] >= 1 ? null : `the division needs a whole number from 0 to ${MAX_WHOLE} divided by a whole number from 1 to ${MAX_DIVISOR}`;
    },
    text: pairText(DIVIDE),
    statement: pairText(DIVIDE),
    steps: ({ operands: [a, b] }) => divideDigits(a, b),
    result: ({ operands: [a, b] }) => (a % b === 0 ? { type: "number", value: a / b } : { type: "remainder", quotient: Math.floor(a / b), remainder: a % b }),
    exact: ({ operands: [a, b] }) => ({ type: "fraction", numerator: a, denominator: b }),
  },
  "decimal-add": {
    ...NUMBER_RULES,
    problem: (op) => (decimalPair(op) ? null : DECIMAL_PAIR),
    text: pairText("+"),
    statement: pairText("+"),
    steps: (op) => addColumns(decimalOperands(op)),
    result: (op) => decimalResult(op, "add"),
    exact: (op) => decimalResult(op, "add"),
  },
  "decimal-subtract": {
    ...NUMBER_RULES,
    problem: (op) => {
      const operands = decimalPair(op);
      if (!operands) return DECIMAL_PAIR;
      const [a, b] = op.operands as [number, number];
      return a < b ? "the subtraction goes below zero" : null;
    },
    text: pairText(MINUS),
    statement: pairText(MINUS),
    steps: (op) => subtractColumns(...decimalOperands(op)),
    result: (op) => decimalResult(op, "subtract"),
    exact: (op) => decimalResult(op, "subtract"),
  },
  "decimal-multiply": {
    ...NUMBER_RULES,
    problem: (op) => {
      if (!decimalPair(op)) return DECIMAL_PAIR;
      const [a, b] = decimalOperands(op as Of<"decimal-multiply">);
      return a.scaled <= MAX_WHOLE && b.scaled <= MAX_MULTIPLIER ? null : "the multiplication needs at most 4 digits in the first number and 3 in the second";
    },
    text: pairText(TIMES),
    statement: pairText(TIMES),
    steps: (op) => {
      const [a, b] = decimalOperands(op);
      const product = a.scaled * b.scaled;
      return [...multiplyRows(a.scaled, b.scaled), { id: "point", kind: "place-point", product, decimals: a.places + b.places, value: fromWritten(product, a.places + b.places) }];
    },
    result: (op) => decimalResult(op, "multiply"),
    exact: (op) => decimalResult(op, "multiply"),
  },
  "fraction-add": fractionPairComputation("+", () => null),
  "fraction-subtract": fractionPairComputation(MINUS, (a, b) => (belowZero(a, b) ? "the subtraction goes below zero" : null)),
  "fraction-multiply": fractionPairComputation(TIMES, () => null),
  "fraction-divide": fractionPairComputation(DIVIDE, (_a, b) => (b.numerator === 0 ? "the division is by zero" : null)),
  "fraction-simplify": {
    answer: "simplest",
    accepted: "simplest",
    sameNumberWrong: "unsimplified",
    problem: (op) => (one(op.operands) && isFractionOperand(op.operands[0]) && (op.operands[0] as FractionOperand).type === "fraction" ? null : "the operation needs one fraction"),
    text: (op) => `Simplify ${text(op.operands[0])}`,
    statement: (op) => text(op.operands[0]),
    steps: (op) => finish(improper(op.operands[0])),
    result: (op) => simplest(improper(op.operands[0])),
    exact: (op) => simplest(improper(op.operands[0])),
  },
  "fraction-equivalent": {
    answer: "result",
    accepted: "none",
    sameNumberWrong: "any",
    problem: (op) => {
      if (!one(op.operands) || !isFractionOperand(op.operands[0]) || (op.operands[0] as FractionOperand).type !== "fraction") return "the operation needs one fraction";
      const { numerator, denominator } = improper(op.operands[0] as FractionOperand);
      const target = op.denominator;
      if (!isWhole(target, 1, MAX_NEW_DENOMINATOR) || target === denominator) {
        return `the new denominator must be a whole number from 1 to ${MAX_NEW_DENOMINATOR}, not the denominator itself`;
      }
      const fits = target % denominator === 0 || (denominator % target === 0 && numerator % (denominator / target) === 0);
      return fits ? null : "the new denominator must be a multiple or a factor of the denominator, and give a whole numerator";
    },
    text: (op) => `${text(op.operands[0])} = ?/${op.denominator}`,
    statement: (op) => text(op.operands[0]),
    steps: (op) => [scale(op)],
    result: (op) => ({ type: "fraction", ...scale(op).to }),
    exact: (op) => ({ type: "fraction", ...scale(op).to }),
  },
};

function decimalResult(op: { operands: [number, number] }, how: "add" | "subtract" | "multiply"): AnswerValue {
  const [a, b] = decimalOperands(op);
  if (how === "multiply") return { type: "number", value: fromWritten(a.scaled * b.scaled, a.places + b.places) };
  const places = Math.max(a.places, b.places);
  const x = a.scaled * 10 ** (places - a.places);
  const y = b.scaled * 10 ** (places - b.places);
  return { type: "number", value: fromWritten(how === "add" ? x + y : x - y, places) };
}

/** The operation kinds code computes. */
export const isOperationKind = (kind: unknown): kind is OperationKind => typeof kind === "string" && Object.hasOwn(OPERATIONS, kind);

/** The computation of an operation whose kind is known. */
export const computation = (op: Operation) => OPERATIONS[op.kind] as unknown as Computation;

/** What is wrong with an operation, or null. */
export function operationProblem(operation: unknown): string | null {
  if (typeof operation !== "object" || operation === null || Array.isArray(operation)) return "the operation is missing";
  const op = operation as Unknown;
  if (!isOperationKind(op.kind)) return "the operation's kind is not one code can compute";
  return OPERATIONS[op.kind].problem(op);
}

/** The value an operation gives. The operation must be valid (operationProblem). */
export const operationResult = (operation: Operation): AnswerValue => computation(operation).result(operation);

/** The operation as the child reads it, without the answer: "48 + 37". */
export const operationText = (operation: Operation): string => computation(operation).text(operation);

/** The worked steps of an operation, then the result. The operation must be valid. */
export function workedSteps(operation: Operation): WorkedStep[] {
  return [...computation(operation).steps(operation), { id: "result", kind: "result", value: operationResult(operation) }];
}

// ---------- Words ----------

/** A value as written: "85", "3/4", "1 1/2", "26 R 1". */
export function valueText(value: AnswerValue): string {
  switch (value.type) {
    case "number":
      return String(value.value);
    case "fraction":
      return `${value.numerator}/${value.denominator}`;
    case "mixed":
      return `${value.whole} ${value.numerator}/${value.denominator}`;
    case "remainder":
      return `${value.quotient} R ${value.remainder}`;
    default:
      return value.value;
  }
}

const partsText = ({ numerator, denominator }: FractionParts) => `${numerator}/${denominator}`;
/** "1 one", "3 ones". */
const count = (n: number, place: Place) => `${n} ${n === 1 ? UNIT[place] : place}`;
const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

/** A worked step in words, for a board or a voice: "Add the ones: 8 + 7 = 15. Write 5 and carry 1 ten." */
export function stepText(step: WorkedStep, operation: Operation): string {
  switch (step.kind) {
    case "add-column": {
      const { place, digits, carryIn, total, write, carryOut } = step;
      const terms = [...digits, ...(carryIn > 0 ? [carryIn] : [])];
      if (terms.length === 1) return `Bring down the ${place}: write ${write}.`;
      const carried = carryOut > 0 ? ` and carry ${carryOut} ${UNIT[left(place)]}` : "";
      return `Add the ${place}: ${terms.join(" + ")} = ${total}. Write ${write}${carried}.`;
    }
    case "subtract-column": {
      const { place, top, bottom, lent, regrouped, write } = step;
      const have = top - (lent ? 1 : 0);
      const from = have + (regrouped ? 10 : 0);
      const zero = step.addedZero ? `Write a 0 in the ${place} of ${text(operation.operands[0])}.` : "";
      // A column of 0 that must give 1 to its right first takes 1 from its left: say it in that order.
      const regroup = have < 0
        ? `There were 0 ${place}, so regroup 1 ${UNIT[left(place)]} as 10 ${place}; after the 1 ${UNIT[place]} given to the ${right(place)}, ${from} ${place} are left.`
        : [
          lent ? `The ${place} are now ${have}.` : "",
          regrouped ? `Regroup 1 ${UNIT[left(place)]} as 10 ${place}, so ${count(have, place)} ${have === 1 ? "becomes" : "become"} ${from}.` : "",
        ].filter(Boolean).join(" ");
      const difference = from - (bottom ?? 0);
      const written = write === null ? "Write nothing: a number does not start with 0." : `Write ${write}.`;
      const work = bottom === null ? written : `Subtract the ${place}: ${from} ${MINUS} ${bottom} = ${difference}. ${written}`;
      return [zero, regroup, work].filter(Boolean).join(" ");
    }
    case "multiply-digit": {
      const { row, place, top, multiplier, carryIn, total, write, carryOut } = step;
      if (top === null) return `Write the carried ${carryIn}.`;
      const work = `multiply the ${place}: ${top} ${TIMES} ${multiplier}${carryIn > 0 ? ` + ${carryIn}` : ""} = ${total}.`;
      const written = write === null ? "Write nothing: a number does not start with 0." : `Write ${write}${carryOut > 0 ? ` and carry ${carryOut}` : ""}.`;
      return `${row === "ones" ? capital(work) : `${capital(row)} row: ${work}`} ${written}`;
    }
    case "partial-product": {
      const { row, multiplier, zeros, value } = step;
      const top = typeof operation.operands[0] === "number" ? (written(operation.operands[0], MAX_PLACES)?.scaled ?? 0) : 0;
      const line = `The ${row} row: ${top} ${TIMES} ${multiplier * 10 ** zeros} = ${value}.`;
      return zeros === 0 ? line : `${line} It starts with ${zeros} ${zeros === 1 ? "zero" : "zeros"} because the ${multiplier} is in the ${row}.`;
    }
    case "place-point":
      return `The numbers have ${step.decimals} decimal ${step.decimals === 1 ? "place" : "places"} in all, so ${step.product} becomes ${step.value}.`;
    case "divide-digit": {
      const { place, digit, current, quotient, write, product, remainder } = step;
      const divisor = operation.operands[1] as number;
      const first = place === placeAt(digitCount(operation.operands[0] as number) - 1);
      const brought = first ? "" : `Bring down ${digit} to make ${current}. `;
      if (write === null) return `${brought}${current} ${DIVIDE} ${divisor} is 0, so write nothing above the ${place} yet. ${current} is left.`;
      return `${brought}${current} ${DIVIDE} ${divisor} = ${quotient}, and ${quotient} ${TIMES} ${divisor} = ${product}. ${current} ${MINUS} ${product} = ${remainder}. Write ${write}.`;
    }
    case "to-improper":
      return `Write the numbers as fractions: ${step.from.map((v, i) => `${valueText(v)} = ${partsText(step.to[i])}`).join(" and ")}.`;
    case "common-denominator":
      return `Use ${step.denominator} as the common denominator: ${step.from.map((f, i) => `${partsText(f)} = ${partsText(step.to[i])}`).join(" and ")}.`;
    case "combine-numerators": {
      const [a, b] = step.numerators;
      const how = step.op === "add" ? `Add the numerators: ${a} + ${b}` : `Subtract the numerators: ${a} ${MINUS} ${b}`;
      return `${how} = ${step.numerator}, so ${step.numerator}/${step.denominator}.`;
    }
    case "flip":
      return `Dividing by ${partsText(step.from)} is the same as multiplying by ${partsText(step.to)}.`;
    case "multiply-fractions": {
      const [a, b] = step.numerators;
      const [c, d] = step.denominators;
      return `Multiply the numerators and the denominators: ${a} ${TIMES} ${b} = ${step.numerator} and ${c} ${TIMES} ${d} = ${step.denominator}, so ${step.numerator}/${step.denominator}.`;
    }
    case "simplify":
      return `Divide the numerator and the denominator by ${step.divisor}: ${partsText(step.from)} = ${partsText(step.to)}.`;
    case "to-mixed":
      return `${partsText(step.from)} is ${step.whole} ${step.whole === 1 ? "whole" : "wholes"} and ${partsText(step.rest)} more: ${step.whole} ${partsText(step.rest)}.`;
    case "scale-fraction":
      return `${capital(step.by)} the numerator and the denominator by ${step.factor}: ${partsText(step.from)} = ${partsText(step.to)}.`;
    case "result":
      return `${computation(operation).statement(operation)} = ${valueText(step.value)}`;
  }
}
