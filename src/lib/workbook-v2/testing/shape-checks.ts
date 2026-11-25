// The pure parts of the harness.
import { plainCopy } from "../bank/plain";
import type { Answer, AnswerKind } from "../contract";
import type { Rows } from "./shape-registration";

/** What an answer of each kind must look like. A new kind needs its rule here. */
const ANSWER_FORMS: Readonly<Record<AnswerKind, (answer: Answer) => boolean>> = {
  "whole-number": ({ value, ...more }) => /^(0|[1-9]\d*)$/.test(value) && Object.keys(more).join() === "kind",
};
export const hasAnswerForm = (answer: Answer): boolean => Object.hasOwn(ANSWER_FORMS, answer.kind) && ANSWER_FORMS[answer.kind](answer);

export const isPlain = (value: unknown): boolean => plainCopy("value", value).ok;

/** A shape that changes the limits that it gets throws. */
export function frozen<T>(value: T): T {
  if (typeof value === "object" && value !== null) Object.values(value).forEach(frozen);
  return Object.freeze(value);
}

/** The widest of each width. */
export const maxOf = (widths: readonly Readonly<Record<string, number>>[]): Record<string, number> =>
  Object.fromEntries(Object.keys(widths[0] ?? {}).map((name) => [name, Math.max(...widths.map((w) => w[name]))]));

/** Copies of good rows, each with one thing wrong or changed. */
export const brokenRows = (good: readonly Rows[]): Rows[] => good.flatMap((rows) => [
  [], [...rows, ""], [...rows, rows[0]], [...rows].reverse(),
  ...rows.flatMap((row, i) => ["", `0${row}`, ` ${row}`, `${row} `, `${row}0`, row.slice(1), row.slice(0, -1), `-${row}`, `${row}.0`, ...["+", "-", "×", "÷", "x"].map((sign) => row.replace(/[-+×÷]/, sign))]
    .map((other) => rows.map((r, j) => (j === i ? other : r)))),
]);
