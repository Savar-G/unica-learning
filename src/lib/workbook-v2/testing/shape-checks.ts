// The pure parts of the harness.
import { plainCopy } from "../bank/plain";
import { BLANK } from "../checks/printed-answers";
import type { Shape } from "../shapes";
import type { Rows } from "./shape-registration";

export const isPlain = (value: unknown): boolean => plainCopy("value", value).ok;

/** What `frozen` has frozen with all its parts. */
const done = new WeakSet<object>();
function frozen<T>(value: T): T {
  if (typeof value !== "object" || value === null || done.has(value)) return value;
  Object.values(value).forEach(frozen);
  done.add(value);
  return Object.freeze(value);
}

/** The shape, with limits that nothing can change: a shape that changes the limits that it gets throws. */
export const onFrozenLimits = (shape: Shape): Shape => Object.assign(Object.create(shape) as Shape, {
  generate: (limits: unknown, seed: string) => shape.generate(frozen(limits), seed),
  count: (limits: unknown) => shape.count(frozen(limits)),
  difficultyRange: (limits: unknown) => shape.difficultyRange(frozen(limits)),
  worstCase: (limits: unknown) => shape.worstCase(frozen(limits)),
  ...(shape.list && { list: (limits: unknown) => shape.list?.(frozen(limits)) }),
  ...(shape.orderedRuns && { orderedRuns: (limits: unknown, items: number) => shape.orderedRuns?.(frozen(limits), items) }),
  ...(shape.forms && { forms: (limits: unknown) => shape.forms?.(frozen(limits)) }),
  ...(shape.swapped && { swapped: (question: unknown, limits: unknown) => shape.swapped?.(question, frozen(limits)) }),
});

/** The widest of each width. */
export const maxOf = (widths: readonly Readonly<Record<string, number>>[]): Record<string, number> =>
  Object.fromEntries(Object.keys(widths[0] ?? {}).map((name) => [name, Math.max(...widths.map((w) => w[name]))]));

/** Copies of good rows, each with one thing wrong or changed. */
export const brokenRows = (good: readonly Rows[]): Rows[] => good.flatMap((rows) => [
  [], [...rows, ""], [...rows, rows[0]], [...rows].reverse(),
  ...rows.flatMap((row, i) => ["", `0${row}`, ` ${row}`, `${row} `, `${row}0`, row.slice(1), row.slice(0, -1), `-${row}`, `${row}.0`, ...["+", "-", "×", "÷", "x"].map((sign) => row.replace(/[-+×÷]/, sign)), ...(row.includes(BLANK) ? [`${row}${BLANK}`, row.replace(BLANK, "?")] : [])]
    .map((other) => rows.map((r, j) => (j === i ? other : r)))),
]);
