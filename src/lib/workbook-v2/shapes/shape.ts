// What every shape family gives. A shape is code that picks numbers, answers, explains and scores one kind of question;
// its limits are content from the bank. A new shape is one new file and one line in index.ts.
import type { Answer, AnswerKind, Face, Step } from "../contract";
import { canonicalJson } from "../hash";

export interface Item<Q> { question: Q; answer: Answer }

/** An answer of one whole number in one answer area. */
export const wholeNumber = (value: number | string): Answer => ({ parts: [{ name: "answer", kind: "whole-number", value: String(value) }] });

/** The same question turned round, such as 7 × 5 for 5 × 7. */
export interface Swapped<Q> { question: Q; inLimits: boolean }

/** Indexed access to the space of a non-listed shape, built once per row for exact repeat selection. */
export interface ShapeSpace<Q> { count: number; at(index: number, seed: string): Item<Q> }

export interface Shape<L = unknown, Q = unknown> {
  id: string;
  /** Whole number starting at 1. Bump whenever output changes. */
  version: number;
  answerKind: AnswerKind;
  /** The limits of a bank row, or the first thing wrong with them in plain words. */
  readLimits(raw: unknown): { ok: true; limits: L } | { ok: false; problem: string };
  /** One question inside the limits. The seed alone decides which. */
  generate(limits: L, seed: string): Item<Q>;
  answer(question: Q): Answer;
  /**
   * The question and its answer, read from the rows that are printed (top to bottom, each from left to right), or null
   * when they print no question of this shape. It shares no code with `generate`, `answer` and `face`.
   */
  solveAgain(rows: readonly string[]): Item<Q> | null;
  /** The worked steps. The last one is the answer, and it draws nothing. */
  steps(question: Q): Step[];
  /** A score: more is harder. Scores compare only inside one shape. */
  difficulty(question: Q): number;
  /** The scores of the easiest and the hardest question of the limits. */
  difficultyRange(limits: L): { easiest: number; hardest: number };
  /** The widest question of the limits. */
  worstCase(limits: L): Item<Q>;
  /** How many different questions the limits allow. */
  count(limits: L): number;
  face(question: Q): Face;
  /** What two questions that a child would call the same have in common, for a shape that prints one in more than one form. */
  identity?(question: Q): unknown;
  /** Every question of the limits. Only a shape whose whole space is small has it. */
  list?(limits: L): Q[];
  /** Indexed access to the limits' space without materialising every question. Used for history-aware selection on non-listed shapes. */
  space?(limits: L): ShapeSpace<Q>;
  /** The widest question of each form: each place that a blank can have. Without it, all questions have the form of `worstCase`. */
  forms?(limits: L): Item<Q>[];
  /** Every row of this length in the order of its table, for limits that ask for one. Null for limits that mix the questions. A shape with it has a list. */
  orderedRuns?(limits: L, items: number): Q[][] | null;
  /** The swapped form and whether the limits allow it, or null for a question that has none. */
  swapped?(question: Q, limits: L): Swapped<Q> | null;
  /**
   * Whether a question, as data from a book, is one of the limits in exactly the form that the shape prints. It reads
   * the question back apart from `generate`, for the source check of each book. A shape with no `contains` is checked
   * against its list, or its whole space when that space is small (checks/membership.ts).
   */
  contains?(question: unknown, limits: L): boolean;
}

/** Whether data is exactly this question: the same fields with the same values, and no other field. */
export const isExactly = (given: unknown, question: unknown): boolean => canonicalJson(given) === canonicalJson(question);

/** The whole-number fields of a question given as data, or null when one is missing or is not a whole number. */
export function wholeFields<K extends string>(given: unknown, names: readonly K[]): Record<K, number> | null {
  if (!isRecord(given)) return null;
  const out = {} as Record<K, number>;
  for (const name of names) {
    const value = given[name];
    if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
    out[name] = value;
  }
  return out;
}

/** Tells two questions of a shape apart. Two forms of one question have one key. */
export const questionKey = (shape: Shape, question: unknown): string => canonicalJson(shape.identity?.(question) ?? question);

/** The widest question of each form of a row. */
export const formsOf = (shape: Shape, limits: unknown): Item<unknown>[] => shape.forms?.(limits) ?? [shape.worstCase(limits)];

const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export interface Range { min: number; max: number }

/** A range of whole numbers inside its allowed bounds, or the problem. */
export function readRange(raw: Record<string, unknown>, name: string, bounds: Range): Range | string {
  const value = hasOwn(raw, name) ? raw[name] : undefined;
  if (!isRecord(value) || !hasOwn(value, "min") || !hasOwn(value, "max")) return `${name} must have min and max`;
  const extra = Object.keys(value).find((k) => k !== "min" && k !== "max");
  if (extra !== undefined) return `unknown limit "${name}.${extra}"`;
  const { min, max } = value;
  if (typeof min !== "number" || !Number.isSafeInteger(min)) return `${name}.min must be a whole number`;
  if (typeof max !== "number" || !Number.isSafeInteger(max)) return `${name}.max must be a whole number`;
  if (min > max) return `${name}.min is more than ${name}.max`;
  if (min < bounds.min || max > bounds.max) return `${name} must be from ${bounds.min} to ${bounds.max}`;
  return { min, max };
}

/** A set of whole numbers inside its bounds, in rising order so that a set has one form, or the problem. */
export function readSet(raw: Record<string, unknown>, name: string, bounds: Range): number[] | string {
  const value = hasOwn(raw, name) ? raw[name] : undefined;
  if (!Array.isArray(value) || value.length === 0) return `${name} must be a list of 1 or more numbers`;
  for (const [i, n] of (value as unknown[]).entries()) {
    if (typeof n !== "number" || !Number.isSafeInteger(n)) return `${name} must hold whole numbers`;
    if (n < bounds.min || n > bounds.max) return `${name} must be from ${bounds.min} to ${bounds.max}`;
    if (i > 0 && n <= value[i - 1]) return `${name} must rise, with no number twice`;
  }
  return [...value] as number[];
}

/** Reads a limit that is none of these. */
export type ReadLimit = (raw: Record<string, unknown>, name: string) => { value: unknown } | { problem: string };

/**
 * Limits with these names and no other: ranges and sets inside their bounds, words from their lists, and those that a
 * shape reads itself. It gives the limits, or the first thing that is wrong.
 */
export function readLimitFields(raw: unknown, ranges: Readonly<Record<string, Range>>, words: Readonly<Record<string, readonly string[]>>, sets: Readonly<Record<string, Range>> = {}, others: Readonly<Record<string, ReadLimit>> = {}): Record<string, unknown> | string {
  if (!isRecord(raw)) return "the limits must be an object";
  const unknown = Object.keys(raw).find((k) => ![ranges, words, sets, others].some((known) => hasOwn(known, k)));
  if (unknown !== undefined) return `unknown limit "${unknown}"`;
  const limits: Record<string, unknown> = {};
  for (const [read, all] of [[readRange, ranges], [readSet, sets]] as const) {
    for (const [name, bounds] of Object.entries(all)) {
      const value = read(raw, name, bounds);
      if (typeof value === "string") return value;
      limits[name] = value;
    }
  }
  for (const [name, read] of Object.entries(others)) {
    const found = read(raw, name);
    if ("problem" in found) return found.problem;
    limits[name] = found.value;
  }
  for (const [name, allowed] of Object.entries(words)) {
    const word = hasOwn(raw, name) ? raw[name] : undefined;
    if (typeof word !== "string" || !allowed.includes(word)) return `${name} must be ${allowed.map((w) => `"${w}"`).join(" or ")}`;
    limits[name] = word;
  }
  return limits;
}

export const within = (n: number, { min, max }: Range): boolean => n >= min && n <= max;

/** Limits of a shape that some question meets. */
export function readLimitsThat<L>(fields: Record<string, unknown> | string, count: (limits: L) => number): { ok: true; limits: L } | { ok: false; problem: string } {
  if (typeof fields === "string") return { ok: false, problem: fields };
  return count(fields as L) > 0 ? { ok: true, limits: fields as L } : { ok: false, problem: "no question meets these limits" };
}

/**
 * Why limits have no question: the limits that alone could be wider, or, when no one change is enough, all that are
 * narrower than they could be. `ranges` and `words` are those that read the limits.
 */
export function emptyProblem(limits: Record<string, unknown>, ranges: Readonly<Record<string, Range>>, words: Readonly<Record<string, readonly string[]>>, count: (limits: Record<string, unknown>) => number): string {
  return emptyLimitsProblem(limits, { ...ranges, ...Object.fromEntries(Object.keys(words).map((name) => [name, "allowed"])) }, count);
}

/** The same for limits of any kind. `widest` holds each limit that decides which questions there are, at its widest. */
export function emptyLimitsProblem(limits: Record<string, unknown>, widest: Readonly<Record<string, unknown>>, count: (limits: Record<string, unknown>) => number): string {
  const isNarrow = (name: string) => JSON.stringify(limits[name]) !== JSON.stringify(widest[name]);
  const narrow = Object.keys(widest).filter(isNarrow);
  const alone = narrow.filter((name) => count({ ...limits, [name]: widest[name] }) > 0);
  return `no question meets these limits (${alone.length > 0 ? `a wider ${alone.join(" or ")} has some` : `together they are too narrow: ${narrow.join(", ")}`})`;
}
