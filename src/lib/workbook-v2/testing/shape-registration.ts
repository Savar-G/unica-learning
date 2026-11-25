// What a shape registers for the harness: independent facts about its printed questions, as data where possible. A
// registration shares no code with its shape.
import fc from "fast-check";
import type { Answer } from "../contract";
import type { ShapeLibrary } from "../shapes";
import type { Range } from "../shapes/shape";

/** The printed rows of one question, top to bottom, as a child reads them. */
export type Rows = readonly string[];
export type Limits = Readonly<Record<string, unknown>>;

/** What an independent reader finds in printed rows. */
export interface Printed {
  answer: Answer;
  /** One value for each limit, under the name of the limit: what that limit talks about. */
  features: Readonly<Record<string, unknown>>;
  /** Each way in which a question can be wide. The worst case is the widest in all of them. */
  widths: Readonly<Record<string, number>>;
  /** Every worked step of this question. */
  steps: readonly string[];
}

/** One limit: the values that it can have, and the features that each value permits. */
export interface LimitRule {
  values: fc.Arbitrary<unknown>;
  allows(feature: unknown, limit: unknown): boolean;
  /** A value that permits all that both permit. */
  widen(one: unknown, other: unknown): unknown;
  /** Values that the shape must refuse. */
  bad: readonly unknown[];
}

const tenOutside = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** A range of whole numbers inside its bounds. */
export function rangeLimit(min: number, max: number): LimitRule {
  const number = fc.integer({ min, max });
  const toRange = ([x, y]: [number, number]): unknown => ({ min: Math.min(x, y), max: Math.max(x, y) });
  const toPair = (range: unknown): [number, number] => {
    const { min: low, max: high, ...more } = range as Range;
    if (!(low <= high) || Object.keys(more).length > 0) throw new Error("not a range");
    return [low, high];
  };
  return {
    values: fc.tuple(number, number).map(toRange, toPair),
    allows: (feature, limit) => typeof feature === "number" && feature >= (limit as Range).min && feature <= (limit as Range).max,
    widen: (one, other) => ({ min: Math.min((one as Range).min, (other as Range).min), max: Math.max((one as Range).max, (other as Range).max) }),
    bad: [
      undefined, null, "wide", [], { min }, { max }, { min, max, more: 1 }, { min: String(min), max }, { min, max: null }, { min: min + 0.5, max },
      ...(min < max ? [{ min: max, max: min }] : []), ...tenOutside.flatMap((n) => [{ min: min - n, max }, { min, max: max + n }]),
    ],
  };
}

/** "never" or "allowed". The feature is true for a question that "never" refuses. */
export const neverLimit = (): LimitRule => ({
  values: fc.constantFrom("never", "allowed"),
  allows: (feature, limit) => feature === false || (feature === true && limit === "allowed"),
  widen: (one, other) => (one === "allowed" ? one : other),
  bad: [undefined, null, true, "", "sometimes", "Never", "allowed ", ["never"]],
});

/** A space that is too large to list: its facts, for any limits. */
export interface LargeSpace {
  /** 0 when no question meets the limits. */
  count(limits: Limits): number;
  easiest(limits: Limits): Rows;
  hardest(limits: Limits): Rows;
  widest(limits: Limits): Rows;
}

export interface ShapeRegistration {
  id: string;
  limits: Readonly<Record<string, LimitRule>>;
  /** Null for rows that print no question of the shape. */
  read(rows: Rows): Printed | null;
  /** Every printed question of the shape, or the facts of a space that is too large to list. */
  space: readonly Rows[] | LargeSpace;
  /** Limits that the bank can hold. The fingerprint covers them. */
  cases: readonly { name: string; limits: Limits }[];
  /** Small spaces with the list of their questions, written by hand. */
  smallSpaces: readonly { name: string; limits: Limits; questions: readonly Rows[] }[];
  /** For each limit: a question that meets all limits, and one that breaks this limit and no other. */
  witnesses: readonly { limit: string; limits: Limits; inside: Rows; outside: Rows }[];
  harder: readonly { name: string; easier: Rows; harder: Rows }[];
  examples: readonly { name: string; rows: Rows; answer: Answer; steps: readonly string[] }[];
  refusedLimits: readonly { name: string; raw: unknown; problem: string }[];
  refusedRows: readonly { name: string; rows: Rows }[];
}

export function isInside(registration: ShapeRegistration, printed: Printed, limits: Limits): boolean {
  for (const name in registration.limits) if (!registration.limits[name].allows(printed.features[name], limits[name])) return false;
  return true;
}

/** Whether an object has these names of its own, in any order, and no other. */
export const hasNames = (object: object, names: readonly string[]): boolean => Object.keys(object).length === names.length && names.every((name) => Object.hasOwn(object, name));

/** What an independent reader leaves out: a check would have nothing to compare. Each question has the same widths. */
export function printedProblem({ limits }: ShapeRegistration, { features, widths }: Printed, widthNames: readonly string[]): string | null {
  const names = Object.keys(limits);
  if (!hasNames(features, names)) return `says the features ${Object.keys(features).join(", ")} and the limits are ${names.join(", ")}`;
  if (widthNames.length === 0) return "says no width";
  return hasNames(widths, widthNames) ? null : `says the widths ${Object.keys(widths).join(", ")} and for other questions ${widthNames.join(", ")}`;
}

const LISTS = ["cases", "smallSpaces", "witnesses", "harder", "examples", "refusedLimits", "refusedRows"] as const;

function listProblems(registration: ShapeRegistration): string[] {
  const names = Object.keys(registration.limits);
  const found: string[] = [...LISTS.filter((list) => registration[list].length === 0), ...(names.length === 0 ? ["limits"] : [])].map((list) => `${list} must not be empty`);
  if (Array.isArray(registration.space) && registration.space.length === 0) found.push("space must not be empty");
  for (const name of names.filter((n) => !registration.witnesses.some((w) => w.limit === n))) found.push(`the limit "${name}" has no witness`);
  for (const name of names.filter((n) => registration.limits[n].bad.length === 0)) found.push(`the limit "${name}" has no bad value`);
  for (const { name, questions } of registration.smallSpaces) if (questions.length === 0) found.push(`the list of "${name}" must not be empty`);
  for (const { name, limits } of [...registration.cases, ...registration.smallSpaces, ...registration.witnesses.map((w) => ({ ...w, name: w.limit }))]) {
    if (!hasNames(limits, names)) found.push(`the limits of "${name}" must be ${names.join(", ")}`);
  }
  return found;
}

/** What is wrong with the registrations of a library: the harness and the fingerprint command both stop on it. */
export function registryProblems(shapes: ShapeLibrary, registrations: readonly ShapeRegistration[]): string[] {
  const ids = registrations.map((r) => r.id);
  return [
    ...[...shapes.keys()].filter((id) => !ids.includes(id)).map((id) => `[${id}] registration: the shape is in SHAPES and has no registration`),
    ...ids.filter((id) => !shapes.has(id)).map((id) => `[${id}] registration: there is no such shape in SHAPES`),
    ...ids.filter((id, i) => ids.indexOf(id) !== i).map((id) => `[${id}] registration: the shape is registered more than once`),
    ...registrations.flatMap((r) => listProblems(r).map((problem) => `[${r.id}] registration: ${problem}`)),
  ];
}
