// Measurement, money and time in the question package (#307): the units code converts, an amount's exact size, and the
// operation kinds on amounts. The kinds join the others in question-package-math.ts, and the checker in
// question-package.ts compares amounts through amountOf.
//
// Units: metric length (mm, cm, m, km), mass (mg, g, kg) and capacity (mL, L), time (s, min, h), and Canadian money,
// written "$4.75" and "75¢". Every amount is worked exactly: a number is read from its written digits and a change of
// unit is a whole-number factor, so no value goes through floating-point arithmetic.
// Pure TypeScript: no Next.js, React, network, database or clock.
import type { AnswerValue, ClockTime, Duration, Quantity, Unit, WorkedStep } from "@/lib/question-package";
import type { KindRules, Of } from "@/lib/question-package-math";
import {
  addColumns,
  beyond,
  decimalDigits,
  decimalPlaces,
  decimalRational,
  fail,
  fromWritten,
  isCount,
  isObject,
  isOne,
  isTwo,
  multiplyRows,
  rational,
  subtractColumns,
  written,
  type Fields,
  type OperationProblem,
  type Rational,
  type Written,
} from "@/lib/question-package-columns";

/** What a unit measures. */
export type Dimension = "length" | "mass" | "capacity" | "time" | "money";

/** Each unit's measure and its size in the measure's smallest unit. */
const UNITS: Record<Unit, { dimension: Dimension; base: number }> = {
  mm: { dimension: "length", base: 1 },
  cm: { dimension: "length", base: 10 },
  m: { dimension: "length", base: 1000 },
  km: { dimension: "length", base: 1000000 },
  mg: { dimension: "mass", base: 1 },
  g: { dimension: "mass", base: 1000 },
  kg: { dimension: "mass", base: 1000000 },
  mL: { dimension: "capacity", base: 1 },
  L: { dimension: "capacity", base: 1000 },
  s: { dimension: "time", base: 1 },
  min: { dimension: "time", base: 60 },
  h: { dimension: "time", base: 3600 },
  "¢": { dimension: "money", base: 1 },
  $: { dimension: "money", base: 100 },
};

const isUnit = (u: unknown): u is Unit => typeof u === "string" && Object.hasOwn(UNITS, u);

/** What is wrong with a unit: one code does not know is "unsupported", anything not a unit gets `missing`. */
const unitProblem = (u: unknown, missing: OperationProblem): OperationProblem | null =>
  isUnit(u) ? null : typeof u === "string" ? beyond(`code cannot check the unit ${u}`) : missing;

/** The decimal places an amount may have: cents are whole, dollars have cents, the others go to thousandths. */
const allowedPlaces = (unit: Unit) => (unit === "¢" ? 0 : unit === "$" ? 2 : 3);

const MAX_AMOUNT = 99999;

const NOT_AMOUNT = fail("the operation needs an amount from 0 in a unit");
const NOT_TWO = fail("the operation needs two amounts from 0 in units");
const NOT_TIMES = fail("the operation needs an amount and a whole number");
const BELOW_ZERO = fail("the subtraction goes below zero");
const MAX_SCALED = 9999;
const MAX_MULTIPLIER = 999;
const BIG_AMOUNT = beyond(`code checks amounts only up to ${MAX_AMOUNT}.999, with at most 3 decimal places`);
// An operation with an amount beyond code is unsupported only when the rest of it is right: 1e21 m + 1 kg still fails.

/** A whole number from 0 of any size: one beyond the safe range is beyond code, not wrong. */
const isWhole = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

// ---------- Exact sizes ----------

const big = BigInt;
const ZERO = big(0);
const ONE = big(1);
const reduce = ([n, d]: Rational): Rational => rational(n, d);

/** An amount's size in the smallest unit of its measure, exactly; a clock time is minutes after midnight. */
export interface Size {
  dimension: Dimension | "clock";
  base: Rational;
}

/**
 * A number from 0 as an exact rational, read from its written digits (2e-7 too), or null. Any number of decimal places:
 * the limit on what code computes (quantityProblem) is not a limit on which amounts are the same.
 */
function exactAmount(value: unknown): Rational | null {
  const r = decimalRational(value);
  return r !== null && r[0] >= ZERO ? r : null;
}

/** The size of an amount, or null for a value that is not an amount code can read. */
export function amountOf(v: AnswerValue): Size | null {
  switch (v.type) {
    case "quantity": {
      const r = isUnit(v.unit) ? exactAmount(v.value) : null;
      return r && { dimension: UNITS[v.unit].dimension, base: reduce([r[0] * big(UNITS[v.unit].base), r[1]]) };
    }
    case "time":
      return timeFits(v) ? { dimension: "clock", base: [big(clockMinutes(v)), ONE] } : null;
    case "compound": {
      if (!Array.isArray(v.parts) || v.parts.length === 0) return null;
      const sizes = Array.from(v.parts as unknown[], (p) => (isObject(p) ? amountOf({ type: "quantity", value: p.value as number, unit: p.unit as Unit }) : null));
      if (sizes.some((s) => s === null || s.dimension !== sizes[0]?.dimension)) return null;
      return { dimension: sizes[0]!.dimension, base: reduce(sizes.reduce<Rational>((t, s) => [t[0] * s!.base[1] + s!.base[0] * t[1], t[1] * s!.base[1]], [ZERO, ONE])) };
    }
    default:
      return null;
  }
}

/** A clock time in minutes after midnight: 12:05 a.m. is 5, 12:05 p.m. is 725. */
const clockMinutes = (t: Pick<ClockTime, "hours" | "minutes" | "period">) =>
  (t.period === null ? t.hours : (t.hours % 12) + (t.period === "p.m." ? 12 : 0)) * 60 + t.minutes;

/** Two sizes are the same amount of the same measure. */
export const sameSize = (a: Size, b: Size) => a.dimension === b.dimension && a.base[0] * b.base[1] === b.base[0] * a.base[1];

const DIMENSION_NAMES: Record<Size["dimension"], string> = {
  length: "a length", mass: "a mass", capacity: "a capacity", time: "an amount of time", money: "an amount of money", clock: "a clock time",
};
/** "a length", "an amount of money". */
export const dimensionName = (size: Size) => DIMENSION_NAMES[size.dimension];

/** A rational from 0 as a decimal number, or null when it does not end (1/3) or needs more than `maxPlaces` places. */
function decimalOf(r: Rational, maxPlaces: number): number | null {
  const places = decimalPlaces(r);
  return places === null || places > maxPlaces ? null : Number(decimalDigits(r));
}

// ---------- Checks ----------

/** What is wrong with an amount in one unit: "failed" for a wrong amount, "unsupported" for one beyond code. */
function quantityProblem(v: unknown): OperationProblem | null {
  if (!isObject(v) || v.type !== "quantity") return NOT_AMOUNT;
  const size = exactAmount(v.value);
  if (size === null) return NOT_AMOUNT;
  const unit = unitProblem(v.unit, NOT_AMOUNT);
  if (unit) return unit;
  // The decimal of a number read from its digits ends, written with an exponent or not (1e-7 has 7 places).
  const places = decimalPlaces(size) ?? Infinity;
  if (v.unit === "¢" && places > 0) return fail("an amount in ¢ is a whole number");
  if (v.unit === "$" && places > 2) return fail("an amount in $ has at most 2 decimal places");
  return places <= 3 && size[0] / size[1] <= big(MAX_AMOUNT) ? null : BIG_AMOUNT;
}

/**
 * A compound amount is whole numbers in units of one measure (not money), largest unit first, each part below one of
 * the unit before it, the first from 1: "1 h 30 min", "2 m 35 cm"; not "0 h 85 min" or "1 h 75 min".
 */
function compoundFits(v: Fields): boolean {
  if (!Array.isArray(v.parts) || v.parts.length < 2) return false;
  // Array.from fills a missing position with undefined: every() and map() skip one ([, part]).
  const parts = Array.from(v.parts as unknown[]);
  if (!parts.every((p) => isObject(p) && isWhole(p.value) && isUnit(p.unit))) return false;
  const units = parts.map((p) => UNITS[(p as { unit: Unit }).unit]);
  const values = parts.map((p) => (p as { value: number }).value);
  if (units.some((u) => u.dimension !== units[0].dimension || u.dimension === "money") || values[0] < 1) return false;
  return units.every((u, i) => i === 0 || (u.base < units[i - 1].base && values[i] * u.base < units[i - 1].base));
}

/** A clock time: 1 to 12 with a.m. or p.m., or 0 to 23 on the 24-hour clock; minutes 0 to 59. */
function timeFits(v: Fields): boolean {
  if (!isCount(v.hours) || !isCount(v.minutes) || v.minutes > 59) return false;
  if (v.period === null) return v.hours <= 23;
  return (v.period === "a.m." || v.period === "p.m.") && v.hours >= 1 && v.hours <= 12;
}

/** What is wrong with an answer value that is an amount or a clock time, as words after its name ("is not ..."), or null. */
export function amountValueProblem(v: Fields): string | null {
  switch (v.type) {
    case "quantity": {
      const problem = quantityProblem(v);
      return problem && problem !== BIG_AMOUNT ? `is not an amount code can read: ${problem.reason}` : null;
    }
    case "compound":
      return compoundFits(v) ? null : "is not whole numbers in units of one measure, largest first, each part below one of the unit before it";
    default:
      return timeFits(v) ? null : "is not a clock time: 1 to 12 with a.m. or p.m., or 0 to 23 on the 24-hour clock, and 0 to 59 minutes";
  }
}

/** The first unit in a value that code does not know, or null. */
export function unknownUnit(v: unknown): string | null {
  if (!isObject(v)) return null;
  const units = v.type === "quantity" ? [v.unit] : v.type === "compound" && Array.isArray(v.parts) ? v.parts.map((p) => (isObject(p) ? p.unit : null)) : [];
  const unknown = units.find((u) => typeof u === "string" && !isUnit(u));
  return typeof unknown === "string" ? unknown : null;
}

// ---------- Words ----------

/** A number as written. */
const numberText = (n: number) => String(n);
/** A sentence with its full stop, once: a time ends in "p.m." already. */
const sentence = (s: string) => (s.endsWith(".") ? s : `${s}.`);

/** A dollar amount with its cents: 1.5 is "1.50". */
function dollars(value: number): string {
  const w = written(value, 2);
  if (w === null) return String(value);
  const cents = String(w.scaled * 10 ** (2 - w.places)).padStart(3, "0");
  return `${cents.slice(0, -2)}.${cents.slice(-2)}`;
}

/** An amount as written: "2.5 km", "$4.75", "75¢", "1 h 30 min". */
export function amountText(v: AnswerValue): string {
  switch (v.type) {
    case "quantity":
      if (v.unit === "$") return `$${dollars(v.value)}`;
      if (v.unit === "¢") return `${numberText(v.value)}¢`;
      return `${numberText(v.value)} ${v.unit}`;
    case "compound":
      return v.parts.map((p) => amountText({ type: "quantity", ...p })).join(" ");
    case "time": {
      const minutes = String(v.minutes).padStart(2, "0");
      return v.period === null ? `${String(v.hours).padStart(2, "0")}:${minutes}` : `${v.hours}:${minutes} ${v.period}`;
    }
    default:
      return "";
  }
}

const quantity = (value: number, unit: Unit): Quantity => ({ type: "quantity", value, unit });
const cleanQuantity = (q: Quantity): Quantity => quantity(q.value, q.unit);

/** "1 km = 1000 m" for a factor to a smaller unit, "100 cm = 1 m" for a factor to a larger one. */
const factorText = (from: Unit, to: Unit, by: "multiply" | "divide", factor: number) =>
  by === "multiply" ? `${amountText(quantity(1, from))} = ${amountText(quantity(factor, to))}` : `${amountText(quantity(factor, from))} = ${amountText(quantity(1, to))}`;

// ---------- Changing a unit ----------

/** The factor between two units of one measure: multiply to a smaller unit, divide to a larger one. */
function factorOf(from: Unit, to: Unit): { by: "multiply" | "divide"; factor: number } {
  const [a, b] = [UNITS[from].base, UNITS[to].base];
  return a >= b ? { by: "multiply", factor: a / b } : { by: "divide", factor: b / a };
}

/** An amount as a number of another unit of its measure, exactly: 90 min in h is 3/2. */
function sizeIn(q: Quantity, to: Unit): Rational {
  const [n, d] = exactAmount(q.value)!;
  return rational(n * big(UNITS[q.unit].base), d * big(UNITS[to].base));
}

/** Why an amount cannot be written in another unit of its measure, or null. */
function convertProblem(q: Quantity, to: Unit): OperationProblem | null {
  if (q.unit === to) return fail(`the amount is already in ${to}`);
  if (UNITS[q.unit].dimension !== UNITS[to].dimension) return fail(`${q.unit} and ${to} do not measure the same thing`);
  const size = sizeIn(q, to);
  // A right amount code cannot write exactly (100 min is 1.666... h) is beyond code, never a failure.
  if (decimalPlaces(size) === null) return beyond(`code cannot write ${amountText(q)} in ${to} exactly: its decimal does not end`);
  const value = decimalOf(size, allowedPlaces(to));
  return value !== null && Math.floor(value) <= MAX_AMOUNT ? null : BIG_AMOUNT;
}

/** The change of unit, as a step (`same` lets a unit stay as it is). The change must be possible (convertProblem). */
function convertStep(id: string, q: Quantity, to: Unit, same = false): Extract<WorkedStep, { kind: "convert-unit" }> {
  if (same && q.unit === to) return { id, kind: "convert-unit", from: cleanQuantity(q), by: "multiply", factor: 1, to: cleanQuantity(q) };
  const { by, factor } = factorOf(q.unit, to);
  return { id, kind: "convert-unit", from: cleanQuantity(q), by, factor, to: quantity(decimalOf(sizeIn(q, to), allowedPlaces(to))!, to) };
}

/**
 * A stored change of unit with the wrong factor, said as the checker's reason: "use 1 km = 100 m, but 1 km = 1000 m".
 * Null when the stored steps have no such step.
 */
export function conversionProblem(stored: unknown, computed: WorkedStep[]): string | null {
  if (!Array.isArray(stored)) return null;
  for (const step of computed) {
    if (step.kind !== "convert-unit") continue;
    const s = stored.find((x) => isObject(x) && x.id === step.id);
    if (!isObject(s) || s.kind !== "convert-unit" || !isObject(s.from) || !isObject(s.to) || s.from.unit !== step.from.unit || s.to.unit !== step.to.unit) continue;
    if ((s.by !== "multiply" && s.by !== "divide") || !Number.isSafeInteger(s.factor) || (s.by === step.by && s.factor === step.factor)) continue;
    return `use ${factorText(step.from.unit, step.to.unit, s.by, s.factor as number)}, but ${factorText(step.from.unit, step.to.unit, step.by, step.factor)}`;
  }
  return null;
}

// ---------- Working amounts in columns ----------

/** An amount as written in columns, lined up on the point: dollars always to the cent ($2.5 is 2.50). */
function columnsOf(q: Quantity): Written {
  const w = written(q.value, 3) as Written;
  return q.unit === "$" ? { scaled: w.scaled * 10 ** (2 - w.places), places: 2 } : w;
}

/** Two written numbers lined up on the point: their digits to the same count of places, and that count. */
function aligned(a: Written, b: Written): [number, number, number] {
  const places = Math.max(a.places, b.places);
  return [a.scaled * 10 ** (places - a.places), b.scaled * 10 ** (places - b.places), places];
}

/** The value of a column addition or subtraction, from the written numbers. */
function columnValue(a: Written, b: Written, how: "add" | "subtract"): number {
  const [x, y, places] = aligned(a, b);
  return fromWritten(how === "add" ? x + y : x - y, places);
}

/** The smaller of two units of one measure. */
const smallerUnit = (a: Unit, b: Unit): Unit => (UNITS[a].base <= UNITS[b].base ? a : b);

type PairOperation = Of<"quantity-add" | "quantity-subtract">;

/** The two amounts in the smaller unit, with the changes of unit that put them there. */
function pairWork(op: PairOperation): { steps: WorkedStep[]; operands: [Quantity, Quantity] } {
  const unit = smallerUnit(op.operands[0].unit, op.operands[1].unit);
  const steps: WorkedStep[] = [];
  const operands = op.operands.map((q, i) => {
    if (q.unit === unit) return cleanQuantity(q);
    const step = convertStep(`convert-${i + 1}`, q, unit);
    steps.push(step);
    return step.to;
  }) as [Quantity, Quantity];
  return { steps, operands };
}

/** The value of two amounts added or subtracted, in the smaller unit. */
function pairValue(op: PairOperation): Quantity {
  const [a, b] = pairWork(op).operands;
  return quantity(columnValue(columnsOf(a), columnsOf(b), op.kind === "quantity-add" ? "add" : "subtract"), a.unit);
}

/** The amount as the question asks it: the worked value in the asked unit, with the change of unit when there is one. */
function asked(value: Quantity, unit: Unit | undefined): { steps: WorkedStep[]; value: Quantity } {
  if (unit === undefined || unit === value.unit) return { steps: [], value };
  const step = convertStep("convert", value, unit);
  return { steps: [step], value: step.to };
}

/** What is wrong with the unit a question asks for, the worked value being `value`. */
function askedProblem(value: Quantity, unit: unknown): OperationProblem | null {
  if (unit === undefined) return Math.floor(value.value) <= MAX_AMOUNT ? null : BIG_AMOUNT;
  const problem = unitProblem(unit, fail("the unit asked for is not a unit"));
  if (problem || !isUnit(unit)) return problem;
  if (UNITS[unit].dimension !== UNITS[value.unit].dimension) return fail(`${value.unit} and ${unit} do not measure the same thing`);
  if (unit === value.unit) return Math.floor(value.value) <= MAX_AMOUNT ? null : BIG_AMOUNT;
  return convertProblem(value, unit);
}

/** A unit asked for that is not a unit, or measures something else, fails before any limit of code (#354 review R354-3). */
function askedUnitProblem(valueUnit: Unit, unit: unknown): OperationProblem | null {
  if (unit === undefined) return null;
  const problem = unitProblem(unit, fail("the unit asked for is not a unit"));
  if (problem || !isUnit(unit)) return problem;
  return UNITS[unit].dimension === UNITS[valueUnit].dimension ? null : fail(`${valueUnit} and ${unit} do not measure the same thing`);
}

function pairProblem(op: Fields): OperationProblem | null {
  if (!isTwo(op.operands)) return NOT_TWO;
  let tooBig: OperationProblem | null = null;
  for (const q of op.operands) {
    const problem = quantityProblem(q);
    if (problem === BIG_AMOUNT) tooBig = problem;
    else if (problem) return problem === NOT_AMOUNT ? NOT_TWO : problem;
  }
  const [a, b] = op.operands as [Quantity, Quantity];
  if (UNITS[a.unit].dimension !== UNITS[b.unit].dimension) return fail(`${a.unit} and ${b.unit} do not measure the same thing`);
  const askedUnit = askedUnitProblem(a.unit, op.unit);
  if (askedUnit) return askedUnit;
  if (tooBig) return tooBig;
  const unit = smallerUnit(a.unit, b.unit);
  for (const q of [a, b]) {
    const problem = q.unit === unit ? null : convertProblem(q, unit);
    if (problem) return problem;
  }
  const pair = op as PairOperation;
  if (pair.kind === "quantity-subtract") {
    const [x, y] = aligned(...(pairWork(pair).operands.map(columnsOf) as [Written, Written]));
    if (x < y) return BELOW_ZERO;
  }
  return askedProblem(pairValue(pair), op.unit);
}

function multiplyProblem(op: Fields): OperationProblem | null {
  if (!isTwo(op.operands)) return NOT_TIMES;
  const problem = quantityProblem(op.operands[0]);
  if (problem && problem !== BIG_AMOUNT) return problem === NOT_AMOUNT ? NOT_TIMES : problem;
  if (!isWhole(op.operands[1])) return NOT_TIMES;
  const askedUnit = askedUnitProblem((op.operands[0] as Quantity).unit, op.unit);
  if (askedUnit) return askedUnit;
  if (problem) return problem;
  const [q, n] = op.operands as [Quantity, number];
  if (columnsOf(q).scaled > MAX_SCALED || n > MAX_MULTIPLIER) {
    return beyond(`code checks multiplications of amounts only with up to 4 digits in the amount and a whole number up to ${MAX_MULTIPLIER}`);
  }
  return askedProblem(productValue(op as Of<"quantity-multiply">), op.unit);
}

/** An amount times a whole number, in the amount's unit. */
function productValue({ operands: [q, n] }: Of<"quantity-multiply">): Quantity {
  const w = columnsOf(q);
  return quantity(fromWritten(w.scaled * n, w.places), q.unit);
}

/** The amount to find, in the unit the question asks for: "$?", "? cm". */
const placeholder = (unit: Unit) => (unit === "$" ? "$?" : unit === "¢" ? "?¢" : `? ${unit}`);
const withAsked = (text: string, unit: Unit | undefined) => (unit === undefined ? text : `${text} = ${placeholder(unit)}`);

// ---------- The kinds ----------

const AMOUNT_RULES = { answer: "amount", accepted: "amount", sameNumberWrong: "never" } as const;

const pairKind = (symbol: string): KindRules<PairOperation> => ({
  ...AMOUNT_RULES,
  problem: pairProblem,
  text: (op) => withAsked(`${amountText(op.operands[0])} ${symbol} ${amountText(op.operands[1])}`, op.unit),
  statement: (op) => `${amountText(op.operands[0])} ${symbol} ${amountText(op.operands[1])}`,
  steps: (op) => {
    const { steps, operands: [a, b] } = pairWork(op);
    const columns = op.kind === "quantity-add" ? addColumns([columnsOf(a), columnsOf(b)]) : subtractColumns(columnsOf(a), columnsOf(b));
    return [...steps, ...columns, ...asked(pairValue(op), op.unit).steps];
  },
  result: (op) => asked(pairValue(op), op.unit).value,
  unit: (op) => op.unit ?? null,
  top: (op) => {
    const top = pairWork(op).operands[0];
    return { scaled: columnsOf(top).scaled, text: amountText(top) };
  },
});

/** Rounding for cash, to the nearest 5 cents: the change to a last cent digit from 0 to 9. */
const CASH_ROUNDING = [0, -1, -2, 2, 1, 0, -1, -2, 2, 1];

/** An amount of money rounded for cash. */
function roundStep(q: Quantity): Extract<WorkedStep, { kind: "round-cash" }> {
  const cents = columnsOf(q).scaled;
  const rounded = cents + CASH_ROUNDING[cents % 10];
  return { id: "round", kind: "round-cash", from: cleanQuantity(q), cents: cents % 10, to: quantity(q.unit === "$" ? fromWritten(rounded, 2) : rounded, q.unit) };
}

// ---------- Clock times ----------

const MINUTES_IN_DAY = 1440;
const NOT_TWO_TIMES = fail("the operation needs two clock times");
const NOT_TIME_AND_DURATION = fail("the operation needs a clock time and an amount of time");
const BIG_DURATION = beyond("code adds only whole minutes, less than 24 h, to a clock time");

const isTime = (v: unknown): v is ClockTime => isObject(v) && v.type === "time" && timeFits(v);

/** The clock time at a count of minutes after midnight, on the 12-hour clock or the 24-hour clock. */
function clockAt(minutes: number, twelveHour: boolean): ClockTime {
  const m = ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const hours = Math.floor(m / 60);
  if (!twelveHour) return { type: "time", hours, minutes: m % 60, period: null };
  return { type: "time", hours: hours % 12 || 12, minutes: m % 60, period: hours < 12 ? "a.m." : "p.m." };
}

/** An amount of time as written: "45 min", "2 h", "1 h 30 min". */
function durationText(minutes: number): string {
  const [h, m] = [Math.floor(minutes / 60), minutes % 60];
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** An amount of time in whole minutes, or null when it is not one (90 s). The duration must be an amount of time. */
function durationMinutes(d: Duration): number | null {
  const size = amountOf(d) as Size;
  const seconds = size.base[0] / size.base[1];
  return size.base[0] % size.base[1] === ZERO && seconds % big(60) === ZERO ? Number(seconds / big(60)) : null;
}

/** A count on a clock, from minutes after midnight to later minutes, as a step. */
const countOn = (id: string, from: number, to: number, twelveHour: boolean): WorkedStep =>
  ({ id, kind: "count-on", from: clockAt(from, twelveHour), to: clockAt(to, twelveHour), minutes: to - from });

/** Counting on from one time to a later one: to the next hour, the whole hours, then the minutes. */
function elapsedLegs(start: number, end: number, twelveHour: boolean): WorkedStep[] {
  const legs: WorkedStep[] = [];
  let at = start;
  const nextHour = Math.ceil(start / 60) * 60;
  if (start % 60 !== 0 && end >= nextHour) {
    legs.push(countOn("to-hour", at, nextHour, twelveHour));
    at = nextHour;
  }
  const hours = Math.floor((end - at) / 60);
  if (hours > 0) {
    legs.push(countOn("hours", at, at + hours * 60, twelveHour));
    at += hours * 60;
  }
  if (end > at) legs.push(countOn("minutes", at, end, twelveHour));
  return legs;
}

/** Counting on an amount of time from a clock time: the whole hours, then the minutes, through the next hour. */
function addLegs(start: number, minutes: number, twelveHour: boolean): WorkedStep[] {
  const legs: WorkedStep[] = [];
  let at = start;
  if (minutes >= 60) {
    legs.push(countOn("hours", at, at + Math.floor(minutes / 60) * 60, twelveHour));
    at += Math.floor(minutes / 60) * 60;
  }
  const rest = minutes % 60;
  const nextHour = Math.ceil(at / 60) * 60;
  if (at % 60 !== 0 && at + rest > nextHour) {
    legs.push(countOn("to-hour", at, nextHour, twelveHour));
    at = nextHour;
  }
  if (start + minutes > at) legs.push(countOn("minutes", at, start + minutes, twelveHour));
  return legs;
}

type ElapsedOperation = Of<"elapsed-time">;
/** The minutes from one clock time to the next time the clock shows the other: an end before the start is the next day. */
const elapsedMinutes = ({ operands: [a, b] }: ElapsedOperation) => (clockMinutes(b) - clockMinutes(a) + MINUTES_IN_DAY) % MINUTES_IN_DAY;

/** The time from one clock time to another, in the unit the question asks for, or in hours and minutes. */
function elapsedValue(op: ElapsedOperation): Quantity | Duration {
  const minutes = elapsedMinutes(op);
  if (op.unit !== undefined) return convertStep("value", quantity(minutes, "min"), op.unit, true).to;
  if (minutes < 60) return quantity(minutes, "min");
  if (minutes % 60 === 0) return quantity(minutes / 60, "h");
  return { type: "compound", parts: [{ value: Math.floor(minutes / 60), unit: "h" }, { value: minutes % 60, unit: "min" }] };
}

function elapsedProblem(op: Fields): OperationProblem | null {
  if (!isTwo(op.operands) || !op.operands.every(isTime)) return NOT_TWO_TIMES;
  const [a, b] = op.operands as [ClockTime, ClockTime];
  if ((a.period === null) !== (b.period === null)) return fail("the two times are not on the same clock");
  const minutes = elapsedMinutes(op as ElapsedOperation);
  if (minutes === 0) return fail("the two times are the same");
  if (op.unit === undefined || op.unit === "min") return null;
  const problem = unitProblem(op.unit, fail("the unit asked for is not a unit"));
  if (problem || !isUnit(op.unit)) return problem;
  if (UNITS[op.unit].dimension !== "time") return fail(`the time between two clock times is not in ${op.unit}`);
  return convertProblem(quantity(minutes, "min"), op.unit);
}

function timeAddProblem(op: Fields): OperationProblem | null {
  if (!isTwo(op.operands) || !isTime(op.operands[0])) return NOT_TIME_AND_DURATION;
  const d = op.operands[1];
  if (!isObject(d)) return NOT_TIME_AND_DURATION;
  let tooBig: OperationProblem | null = null;
  if (d.type === "quantity") {
    tooBig = quantityProblem(d);
    if (tooBig && tooBig !== BIG_AMOUNT) return tooBig === NOT_AMOUNT ? NOT_TIME_AND_DURATION : tooBig;
  } else if (d.type !== "compound" || !compoundFits(d)) {
    return NOT_TIME_AND_DURATION;
  }
  const duration = d as Duration;
  if (amountOf(duration)?.dimension !== "time") return NOT_TIME_AND_DURATION;
  if (tooBig) return tooBig;
  const minutes = durationMinutes(duration);
  if (minutes === 0) return fail("the time to add is 0");
  return minutes !== null && minutes < MINUTES_IN_DAY ? null : BIG_DURATION;
}

type TimeAddOperation = Of<"time-add">;
const timeAddLegs = ({ operands: [t, d] }: TimeAddOperation) => addLegs(clockMinutes(t), durationMinutes(d) as number, t.period !== null);

/** The same time on the other clock. */
const otherClock = (t: ClockTime): ClockTime => clockAt(clockMinutes(t), t.period === null);

/** The operation kinds on amounts. */
type MeasureKind = "convert" | "quantity-add" | "quantity-subtract" | "quantity-multiply" | "money-round" | "elapsed-time" | "time-add" | "clock-convert";

export const MEASURE_KINDS: { [K in MeasureKind]: KindRules<Of<K>> } = {
  convert: {
    ...AMOUNT_RULES,
    problem: (op) => {
      if (!isOne(op.operands)) return NOT_AMOUNT;
      const problem = quantityProblem(op.operands[0]);
      if (problem && problem !== BIG_AMOUNT) return problem;
      const unit = unitProblem(op.unit, fail("the conversion needs the unit to change to"));
      return unit ?? convertProblem(op.operands[0] as Quantity, op.unit as Unit) ?? problem;
    },
    text: ({ operands: [q], unit }) => `${amountText(q)} = ${placeholder(unit)}`,
    statement: ({ operands: [q] }) => amountText(q),
    steps: ({ operands: [q], unit }) => [convertStep("convert", q, unit)],
    result: ({ operands: [q], unit }) => convertStep("convert", q, unit).to,
    unit: (op) => op.unit,
  },
  "quantity-add": pairKind("+"),
  "quantity-subtract": pairKind("−"),
  "quantity-multiply": {
    ...AMOUNT_RULES,
    problem: multiplyProblem,
    text: (op) => withAsked(`${amountText(op.operands[0])} × ${op.operands[1]}`, op.unit),
    statement: (op) => `${amountText(op.operands[0])} × ${op.operands[1]}`,
    steps: (op) => {
      const w = columnsOf(op.operands[0]);
      const product = w.scaled * op.operands[1];
      const point: WorkedStep[] = w.places > 0 ? [{ id: "point", kind: "place-point", product, decimals: w.places, value: fromWritten(product, w.places) }] : [];
      return [...multiplyRows(w.scaled, op.operands[1]), ...point, ...asked(productValue(op), op.unit).steps];
    },
    result: (op) => asked(productValue(op), op.unit).value,
    unit: (op) => op.unit ?? null,
    top: (op) => ({ scaled: columnsOf(op.operands[0]).scaled, text: amountText(op.operands[0]) }),
  },
  "money-round": {
    ...AMOUNT_RULES,
    problem: (op) => {
      const problem = isOne(op.operands) ? quantityProblem(op.operands[0]) : NOT_AMOUNT;
      if (problem && problem !== BIG_AMOUNT) return problem;
      return UNITS[(op.operands as [Quantity])[0].unit].dimension === "money" ? problem : fail("only an amount of money is rounded to the nearest 5 cents");
    },
    text: ({ operands: [q] }) => `Round ${amountText(q)} to the nearest 5 cents`,
    steps: ({ operands: [q] }) => [roundStep(q)],
    result: ({ operands: [q] }) => roundStep(q).to,
    say: ({ operands: [q] }, value) => `${amountText(q)} rounds to ${amountText(value)}`,
  },
  "elapsed-time": {
    ...AMOUNT_RULES,
    problem: elapsedProblem,
    text: ({ operands: [a, b] }) => `From ${amountText(a)} to ${amountText(b)}`,
    steps: (op) => {
      const start = clockMinutes(op.operands[0]);
      const legs = elapsedLegs(start, start + elapsedMinutes(op), op.operands[0].period !== null);
      const total: WorkedStep[] = legs.length > 1 ? [{ id: "total", kind: "add-durations", minutes: legs.map((l) => (l as { minutes: number }).minutes), total: elapsedMinutes(op) }] : [];
      return [...legs, ...total];
    },
    result: elapsedValue,
    unit: (op) => op.unit ?? null,
    say: ({ operands: [a, b] }, value) => sentence(`From ${amountText(a)} to ${amountText(b)} is ${amountText(value)}`),
  },
  "time-add": {
    ...AMOUNT_RULES,
    problem: timeAddProblem,
    text: ({ operands: [t, d] }) => `${amountText(d)} after ${amountText(t)}`,
    steps: timeAddLegs,
    result: ({ operands: [t, d] }) => clockAt(clockMinutes(t) + (durationMinutes(d) as number), t.period !== null),
    say: ({ operands: [t, d] }, value) => sentence(`${amountText(d)} after ${amountText(t)} is ${amountText(value)}`),
  },
  "clock-convert": {
    answer: "result",
    accepted: "none",
    sameNumberWrong: "any",
    problem: (op) => (isOne(op.operands) && isTime(op.operands[0]) ? null : fail("the operation needs a clock time")),
    text: ({ operands: [t] }) => `Write ${amountText(t)} on the ${t.period === null ? "12-hour" : "24-hour"} clock`,
    steps: ({ operands: [t] }) => [{ id: "clock", kind: "clock-change", from: clockAt(clockMinutes(t), t.period !== null), to: otherClock(t) }],
    result: ({ operands: [t] }) => otherClock(t),
    say: ({ operands: [t] }, value) => `${amountText(t)} is ${amountText(value)} on the ${t.period === null ? "12-hour" : "24-hour"} clock.`,
  },
};

/** The words of a clock change: why the hours change, then the time on the other clock. */
function clockChangeText(from: ClockTime, to: ClockTime): string {
  const [f, t] = [amountText(from), amountText(to)];
  const h24 = from.period === null ? from.hours : to.hours;
  const h12 = from.period === null ? to.hours : from.hours;
  if (h24 === 0) return sentence(`${f} is in the hour after midnight, so the hours are ${from.period === null ? 12 : 0}: ${t}`);
  if (h24 === 12) return sentence(`${f} is in the hour after noon, so the hours stay 12: ${t}`);
  if (h24 < 12) return sentence(`${f} is before noon, so the hours stay ${h12}: ${t}`);
  return sentence(from.period === null
    ? `${f} is after noon, so take 12 from the hours: ${h24} − 12 = ${h12}. ${f} is ${t}`
    : `${f} is after noon, so add 12 to the hours: ${h12} + 12 = ${h24}. ${f} is ${t}`);
}

type MeasureStep = Extract<WorkedStep, { kind: "convert-unit" | "round-cash" | "count-on" | "add-durations" | "clock-change" }>;

/** A step of an amount kind in words, for a board or a voice. `unit` is the unit the question asks for, if any. */
export function measureStepText(step: MeasureStep, kind: string, unit: Unit | null): string {
  if (step.kind === "count-on") {
    const [from, to, by] = [amountText(step.from), amountText(step.to), durationText(step.minutes)];
    return sentence(kind === "time-add" ? `${by} after ${from} is ${to}` : `From ${from} to ${to} is ${by}`);
  }
  if (step.kind === "add-durations") {
    const total = unit === null ? durationText(step.total) : amountText(convertStep("total", quantity(step.total, "min"), unit, true).to);
    return `${step.minutes.map(durationText).join(" + ")} = ${total}`;
  }
  if (step.kind === "clock-change") return clockChangeText(step.from, step.to);
  if (step.kind === "round-cash") {
    const { from, cents, to } = step;
    const ends = `${amountText(from)} ends in ${cents} ${cents === 1 ? "cent" : "cents"}, so in cash it`;
    if (CASH_ROUNDING[cents] === 0) return `${ends} stays ${amountText(to)}.`;
    return `${ends} rounds ${CASH_ROUNDING[cents] < 0 ? "down" : "up"} to the nearest 5 cents: ${amountText(to)}.`;
  }
  const { from, by, factor, to } = step;
  const symbol = by === "multiply" ? "×" : "÷";
  return `${factorText(from.unit, to.unit, by, factor)}, so ${by} by ${factor}: ${numberText(from.value)} ${symbol} ${factor} = ${numberText(to.value)}. ${amountText(from)} = ${amountText(to)}.`;
}
