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
  Unit,
  WorkedStep,
} from "@/lib/question-package";
import {
  PLACE_ORDER,
  addColumns,
  beyond,
  digitAt,
  digitCount,
  fail,
  fromWritten,
  isCount,
  isOne,
  isTwo,
  multiplyRows,
  placeAt,
  subtractColumns,
  whole,
  written,
  type OperationProblem,
  type Written,
} from "@/lib/question-package-columns";
import { MEASURE_KINDS, amountText, measureStepText } from "@/lib/question-package-measures";

/** A place's unit name, for "carry 1 ten". */
const UNIT: Record<Place, string> = {
  thousandths: "thousandth", hundredths: "hundredth", tenths: "tenth", ones: "one", tens: "ten", hundreds: "hundred",
  thousands: "thousand", "ten thousands": "ten thousand", "hundred thousands": "hundred thousand", millions: "million",
};
const left = (place: Place) => PLACE_ORDER[PLACE_ORDER.indexOf(place) + 1];
const right = (place: Place) => PLACE_ORDER[PLACE_ORDER.indexOf(place) - 1];

const MINUS = "−";
const TIMES = "×";
const DIVIDE = "÷";

export const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

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

/** Multiply the top and the bottom by the factor that gives the new denominator. */
const multiplyTo = (from: FractionParts, target: number): WorkedStep => {
  const factor = target / from.denominator;
  return { id: "scale", kind: "scale-fraction", from, by: "multiply", factor, to: toParts(from.numerator * factor, target) };
};

/**
 * How an equivalent fraction is found: multiply or divide the top and the bottom by one factor. When the new
 * denominator is neither a multiple nor a factor (2/6 = ?/9), simplify first (1/3), then multiply (3/9).
 */
function scaleSteps(op: EquivalentOperation): WorkedStep[] {
  const from = improper(op.operands[0]);
  const target = op.denominator;
  if (target % from.denominator === 0) return [multiplyTo(from, target)];
  if (from.denominator % target === 0 && from.numerator % (from.denominator / target) === 0) {
    const factor = from.denominator / target;
    return [{ id: "scale", kind: "scale-fraction", from, by: "divide", factor, to: toParts(from.numerator / factor, target) }];
  }
  // The operation check admits only a target that gives a whole numerator, so the simplest denominator divides it.
  const common = gcd(from.numerator, from.denominator);
  const simple = toParts(from.numerator / common, from.denominator / common);
  return [{ id: "simplify", kind: "simplify", from, divisor: common, to: simple }, multiplyTo(simple, target)];
}

/** The equivalent fraction with the new denominator; its numerator is whole (the operation check). */
function equivalentTo(op: EquivalentOperation): FractionParts {
  const { numerator, denominator } = improper(op.operands[0]);
  return toParts((numerator * op.denominator) / denominator, op.denominator);
}

// ---------- Operand checks ----------

type Fields = Record<string, unknown>;

const MAX_WHOLE = 9999;
const MAX_MULTIPLIER = 999;
const MAX_DIVISOR = 99;
const MAX_PLACES = 3;
const MAX_DENOMINATOR = 100;
const MAX_NUMERATOR = 999;
const MAX_FRACTION_WHOLE = 99;
const MAX_NEW_DENOMINATOR = 1000;

const NOT_WHOLE = fail("the operation needs two whole numbers");
const NOT_DECIMAL = fail("the operation needs two numbers from 0");
const NOT_FRACTIONS = fail("the operation needs fractions, mixed numbers or whole numbers");
const NOT_ONE_FRACTION = fail("the operation needs one fraction");
const BIG_DECIMAL = beyond(`code checks decimals only up to ${MAX_WHOLE}.999, with at most ${MAX_PLACES} decimal places`);
const BIG_FRACTION = beyond(`code checks fractions only with denominators up to ${MAX_DENOMINATOR}, numerators up to ${MAX_NUMERATOR} and whole numbers up to ${MAX_FRACTION_WHOLE}`);
const BELOW_ZERO = fail("the subtraction goes below zero");

/** Two whole numbers, then the limits of the kind. */
function wholeProblem(op: Fields, max: [number, number], limit: string): OperationProblem | null {
  if (!isTwo(op.operands) || !op.operands.every(isCount)) return NOT_WHOLE;
  const [a, b] = op.operands as [number, number];
  return a <= max[0] && b <= max[1] ? null : beyond(limit);
}

/** Two numbers from 0, each written with at most 3 decimal places and a whole part to 9999. */
function decimalProblem(op: Fields): OperationProblem | null {
  if (!isTwo(op.operands) || !op.operands.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0)) return NOT_DECIMAL;
  const fits = op.operands.every((x) => {
    const w = written(x, MAX_PLACES);
    return w !== null && Math.floor(w.scaled / 10 ** w.places) <= MAX_WHOLE;
  });
  return fits ? null : BIG_DECIMAL;
}

const decimalOperands = (op: { operands: [number, number] }) => op.operands.map((x) => written(x, MAX_PLACES) as Written) as [Written, Written];

/** A fraction, a mixed number (whole from 1, a proper fraction part) or a whole number. */
function isFractionOperand(v: unknown): v is FractionOperand {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Fields;
  switch (o.type) {
    case "number":
      return isCount(o.value);
    case "fraction":
      return isCount(o.numerator) && isCount(o.denominator) && o.denominator >= 1;
    case "mixed":
      return isCount(o.whole) && o.whole >= 1 && isCount(o.numerator) && o.numerator >= 1 && isCount(o.denominator) && o.numerator < o.denominator;
    default:
      return false;
  }
}

/** A fraction operand within what code computes. */
function fractionFits(v: FractionOperand): boolean {
  switch (v.type) {
    case "number":
      return v.value <= MAX_FRACTION_WHOLE;
    case "fraction":
      return v.numerator <= MAX_NUMERATOR && v.denominator <= MAX_DENOMINATOR;
    case "mixed":
      return v.whole <= MAX_FRACTION_WHOLE && v.denominator <= MAX_DENOMINATOR;
  }
}

/** Below zero: a fraction subtraction whose second number is bigger than its first. */
const belowZero = (a: FractionParts, b: FractionParts) => a.numerator * b.denominator < b.numerator * a.denominator;

/** One fraction, within what code computes. */
function oneFractionProblem(op: Fields): OperationProblem | null {
  if (!isOne(op.operands) || !isFractionOperand(op.operands[0]) || op.operands[0].type !== "fraction") return NOT_ONE_FRACTION;
  return fractionFits(op.operands[0]) ? null : BIG_FRACTION;
}

// ---------- The operation kinds ----------

export type Of<K extends OperationKind> = Extract<Operation, { kind: K }>;
type FractionPairOperation = Of<"fraction-add" | "fraction-subtract" | "fraction-multiply" | "fraction-divide">;
type EquivalentOperation = Of<"fraction-equivalent">;

/**
 * What counts as the answer: exactly the value the operation gives, that value in any simplest form, or the same amount
 * in any unit of its measure (only in the unit the question asks for, when it asks for one).
 */
export type AnswerRule = "result" | "simplest" | "amount";
/** Which other forms may be accepted: any form of the same number, only simplest forms, none, or the same amount. */
export type AcceptedRule = "same-number" | "simplest" | "none" | "amount";
/** Which forms of the answer's number may still be listed as wrong: none, fractions not simplified, or any other form. */
export type SameNumberWrongRule = "never" | "unsimplified" | "any";

export interface KindRules<O extends Operation> {
  /** What is wrong with the operation's operands, or null. The operation has this kind. */
  problem(op: Fields): OperationProblem | null;
  /** The operation as the child reads it, without the answer: "48 + 37", "Simplify 6/8", "3/4 = ?/12". */
  text(op: O): string;
  /** The left side of the result, when it is not the text: "6/8" for "Simplify 6/8". */
  statement?(op: O): string;
  /** The worked steps, without the result step. */
  steps(op: O): WorkedStep[];
  /** The value the operation gives, in the form its result step shows. */
  result(op: O): AnswerValue;
  /** The exact number, when the result is not a number or a fraction: 17 ÷ 4 is 17/4. */
  exact?(op: O): AnswerValue;
  /** The unit the question asks the answer in, for an amount; none means any unit of the measure. */
  unit?(op: O): Unit | null;
  /** The result step in words, when it is not "<statement> = <value>". */
  say?(op: O, value: AnswerValue): string;
  /** The top number of the columns as worked, when it is not the first operand (an amount changed to a smaller unit). */
  top?(op: O): { scaled: number; text: string };
  answer: AnswerRule;
  accepted: AcceptedRule;
  sameNumberWrong: SameNumberWrongRule;
}

/** What code computes for an operation kind, and the rules for its answer forms. */
export interface Computation<O extends Operation = Operation> extends KindRules<O> {
  statement(op: O): string;
  exact(op: O): AnswerValue;
  unit(op: O): Unit | null;
}

const text = (v: unknown) => (typeof v === "number" ? String(v) : valueText(v as FractionOperand));
const pairText = (symbol: string) => (op: { operands: [unknown, unknown] }) => `${text(op.operands[0])} ${symbol} ${text(op.operands[1])}`;

const NUMBER_RULES = { answer: "result", accepted: "same-number", sameNumberWrong: "never" } as const;
const FRACTION_RULES = { answer: "simplest", accepted: "same-number", sameNumberWrong: "unsimplified" } as const;

const fractionPair = <K extends FractionPairOperation["kind"]>(symbol: string, problem: (a: FractionParts, b: FractionParts) => OperationProblem | null): KindRules<Of<K>> => ({
  ...FRACTION_RULES,
  problem: (op) => {
    if (!isTwo(op.operands) || !op.operands.every(isFractionOperand)) return NOT_FRACTIONS;
    const operands = op.operands as [FractionOperand, FractionOperand];
    if (!operands.every(fractionFits)) return BIG_FRACTION;
    return problem(improper(operands[0]), improper(operands[1]));
  },
  text: pairText(symbol),
  steps: (op) => {
    const { steps, value } = fractionWork(op);
    return [...steps, ...finish(value)];
  },
  result: (op) => simplest(fractionWork(op).value),
});

const KINDS: { [K in OperationKind]: KindRules<Of<K>> } = {
  add: {
    ...NUMBER_RULES,
    problem: (op) => wholeProblem(op, [MAX_WHOLE, MAX_WHOLE], `code checks additions only of whole numbers up to ${MAX_WHOLE}`),
    text: pairText("+"),
    steps: ({ operands: [a, b] }) => addColumns([whole(a), whole(b)]),
    result: ({ operands: [a, b] }) => ({ type: "number", value: a + b }),
  },
  subtract: {
    ...NUMBER_RULES,
    problem: (op) => wholeProblem(op, [MAX_WHOLE, MAX_WHOLE], `code checks subtractions only of whole numbers up to ${MAX_WHOLE}`)
      ?? ((op.operands as number[])[0] < (op.operands as number[])[1] ? BELOW_ZERO : null),
    text: pairText(MINUS),
    steps: ({ operands: [a, b] }) => subtractColumns(whole(a), whole(b)),
    result: ({ operands: [a, b] }) => ({ type: "number", value: a - b }),
  },
  multiply: {
    ...NUMBER_RULES,
    problem: (op) => wholeProblem(op, [MAX_WHOLE, MAX_MULTIPLIER], `code checks multiplications only up to ${MAX_WHOLE} ${TIMES} ${MAX_MULTIPLIER}`),
    text: pairText(TIMES),
    steps: ({ operands: [a, b] }) => multiplyRows(a, b),
    result: ({ operands: [a, b] }) => ({ type: "number", value: a * b }),
  },
  divide: {
    ...NUMBER_RULES,
    problem: (op) => {
      if (isTwo(op.operands) && op.operands[1] === 0) return fail("the division is by zero");
      return wholeProblem(op, [MAX_WHOLE, MAX_DIVISOR], `code checks divisions only up to ${MAX_WHOLE} ${DIVIDE} ${MAX_DIVISOR}`);
    },
    text: pairText(DIVIDE),
    steps: ({ operands: [a, b] }) => divideDigits(a, b),
    result: ({ operands: [a, b] }) => (a % b === 0 ? { type: "number", value: a / b } : { type: "remainder", quotient: Math.floor(a / b), remainder: a % b }),
    exact: ({ operands: [a, b] }) => ({ type: "fraction", numerator: a, denominator: b }),
  },
  "decimal-add": {
    ...NUMBER_RULES,
    problem: decimalProblem,
    text: pairText("+"),
    steps: (op) => addColumns(decimalOperands(op)),
    result: (op) => decimalResult(op, "add"),
  },
  "decimal-subtract": {
    ...NUMBER_RULES,
    problem: (op) => decimalProblem(op) ?? ((op.operands as number[])[0] < (op.operands as number[])[1] ? BELOW_ZERO : null),
    text: pairText(MINUS),
    steps: (op) => subtractColumns(...decimalOperands(op)),
    result: (op) => decimalResult(op, "subtract"),
  },
  "decimal-multiply": {
    ...NUMBER_RULES,
    problem: (op) => {
      const problem = decimalProblem(op);
      if (problem) return problem;
      const [a, b] = decimalOperands(op as Of<"decimal-multiply">);
      return a.scaled <= MAX_WHOLE && b.scaled <= MAX_MULTIPLIER ? null : beyond("code checks decimal multiplications only with up to 4 digits in the first number and 3 in the second");
    },
    text: pairText(TIMES),
    steps: (op) => {
      const [a, b] = decimalOperands(op);
      const product = a.scaled * b.scaled;
      return [...multiplyRows(a.scaled, b.scaled), { id: "point", kind: "place-point", product, decimals: a.places + b.places, value: fromWritten(product, a.places + b.places) }];
    },
    result: (op) => decimalResult(op, "multiply"),
  },
  "fraction-add": fractionPair("+", () => null),
  "fraction-subtract": fractionPair(MINUS, (a, b) => (belowZero(a, b) ? BELOW_ZERO : null)),
  "fraction-multiply": fractionPair(TIMES, () => null),
  "fraction-divide": fractionPair(DIVIDE, (_a, b) => (b.numerator === 0 ? fail("the division is by zero") : null)),
  "fraction-simplify": {
    answer: "simplest",
    accepted: "simplest",
    sameNumberWrong: "unsimplified",
    problem: oneFractionProblem,
    text: (op) => `Simplify ${text(op.operands[0])}`,
    statement: (op) => text(op.operands[0]),
    steps: (op) => finish(improper(op.operands[0])),
    result: (op) => simplest(improper(op.operands[0])),
  },
  "fraction-equivalent": {
    answer: "result",
    accepted: "none",
    sameNumberWrong: "any",
    problem: (op) => {
      const problem = oneFractionProblem(op);
      if (problem) return problem;
      const { numerator, denominator } = improper((op.operands as [FractionOperand])[0]);
      const target = op.denominator;
      if (!isCount(target) || target < 1 || target === denominator) return fail("the new denominator must be a whole number from 1, not the denominator itself");
      if (target > MAX_NEW_DENOMINATOR) return beyond(`code checks new denominators only up to ${MAX_NEW_DENOMINATOR}`);
      return (numerator * target) % denominator === 0 ? null : fail("the new denominator must give a whole numerator");
    },
    text: (op) => `${text(op.operands[0])} = ?/${op.denominator}`,
    statement: (op) => text(op.operands[0]),
    steps: scaleSteps,
    result: (op) => ({ type: "fraction", ...equivalentTo(op) }),
  },
  ...MEASURE_KINDS,
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
export const isOperationKind = (kind: unknown): kind is OperationKind => typeof kind === "string" && Object.hasOwn(KINDS, kind);

/** The computation of an operation whose kind is known. */
export function computation(op: Operation): Computation {
  const rules = KINDS[op.kind] as unknown as KindRules<Operation>;
  return { ...rules, statement: rules.statement ?? rules.text, exact: rules.exact ?? rules.result, unit: rules.unit ?? (() => null) };
}

/** What is wrong with an operation, or null: "failed" for a wrong operation, "unsupported" for one beyond code. */
export function operationCheck(operation: unknown): OperationProblem | null {
  if (typeof operation !== "object" || operation === null || Array.isArray(operation)) return fail("the operation is missing");
  const op = operation as Fields;
  if (!isOperationKind(op.kind)) return typeof op.kind === "string" ? beyond(`code cannot check the operation ${op.kind}`) : fail("the operation has no kind");
  return KINDS[op.kind].problem(op);
}

/** What is wrong with an operation, or null. */
export const operationProblem = (operation: unknown): string | null => operationCheck(operation)?.reason ?? null;

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
    case "quantity":
    case "compound":
    case "time":
      return amountText(value);
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
      const zero = step.addedZero ? `Write a 0 in the ${place} of ${computation(operation).top?.(operation).text ?? text(operation.operands[0])}.` : "";
      // A column of 0 that must give 1 to its right first takes 1 from its left: say it in that order.
      const regroup = have < 0
        ? `There were 0 ${place}, so regroup 1 ${UNIT[left(place)]} as 10 ${place}; after the 1 ${UNIT[place]} given to the ${right(place)}, ${from} ${place} are left.`
        : [
          lent ? `The ${place} are now ${have}.` : "",
          regrouped ? `Regroup 1 ${UNIT[left(place)]} as 10 ${place}, so ${count(have, place)} ${have === 1 ? "becomes" : "become"} ${from}.` : "",
        ].filter(Boolean).join(" ");
      const difference = from - (bottom ?? 0);
      const writing = write === null ? "Write nothing: a number does not start with 0." : `Write ${write}.`;
      const work = bottom === null ? writing : `Subtract the ${place}: ${from} ${MINUS} ${bottom} = ${difference}. ${writing}`;
      return [zero, regroup, work].filter(Boolean).join(" ");
    }
    case "multiply-digit": {
      const { row, place, top, multiplier, carryIn, total, write, carryOut } = step;
      if (top === null) return `Write the carried ${carryIn}.`;
      const work = `multiply the ${place}: ${top} ${TIMES} ${multiplier}${carryIn > 0 ? ` + ${carryIn}` : ""} = ${total}.`;
      const writing = write === null ? "Write nothing: a number does not start with 0." : `Write ${write}${carryOut > 0 ? ` and carry ${carryOut}` : ""}.`;
      return `${row === "ones" ? capital(work) : `${capital(row)} row: ${work}`} ${writing}`;
    }
    case "partial-product": {
      const { row, multiplier, zeros, value } = step;
      const top = computation(operation).top?.(operation).scaled ?? written(operation.operands[0], MAX_PLACES)?.scaled ?? 0;
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
      // Every division is said with its remainder, so each "=" is true: 15 ÷ 6 = 2 R 3, never 15 ÷ 6 = 2.
      const divided = `${current} ${DIVIDE} ${divisor} = ${remainder > 0 ? `${quotient} R ${remainder}` : quotient}`;
      if (write === null) return `${brought}${divided}, so write nothing above the ${place} yet. ${current} is left.`;
      return `${brought}${divided}, because ${quotient} ${TIMES} ${divisor} = ${product} and ${current} ${MINUS} ${product} = ${remainder}. Write ${write}.`;
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
    case "convert-unit":
    case "round-cash":
    case "count-on":
    case "add-durations":
    case "clock-change":
      return measureStepText(step, operation.kind, computation(operation).unit(operation));
    case "result": {
      const rules = computation(operation);
      return rules.say ? rules.say(operation, step.value) : `${rules.statement(operation)} = ${valueText(step.value)}`;
    }
  }
}
