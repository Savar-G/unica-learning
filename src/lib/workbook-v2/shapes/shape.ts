// What every shape family gives. A shape is code that picks numbers, answers, explains and scores one kind of question;
// its limits are content from the bank. A new shape is one new file and one line in index.ts.
import type { Answer, AnswerKind, Face, Step } from "../contract";

export interface Item<Q> { question: Q; answer: Answer }

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
}

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

/**
 * Limits with these names and no other: ranges inside their bounds, and words from their lists. It gives the limits, or
 * the first thing that is wrong.
 */
export function readLimitFields(raw: unknown, ranges: Readonly<Record<string, Range>>, words: Readonly<Record<string, readonly string[]>>): Record<string, unknown> | string {
  if (!isRecord(raw)) return "the limits must be an object";
  const unknown = Object.keys(raw).find((k) => !hasOwn(ranges, k) && !hasOwn(words, k));
  if (unknown !== undefined) return `unknown limit "${unknown}"`;
  const limits: Record<string, unknown> = {};
  for (const [name, bounds] of Object.entries(ranges)) {
    const range = readRange(raw, name, bounds);
    if (typeof range === "string") return range;
    limits[name] = range;
  }
  for (const [name, allowed] of Object.entries(words)) {
    const word = hasOwn(raw, name) ? raw[name] : undefined;
    if (typeof word !== "string" || !allowed.includes(word)) return `${name} must be ${allowed.map((w) => `"${w}"`).join(" or ")}`;
    limits[name] = word;
  }
  return limits;
}
