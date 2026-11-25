// The pure parts of the harness.
import { plainCopy } from "../bank/plain";
import { BLANK } from "../checks/printed-answers";
import type { Answer, AnswerKind, AnswerPart } from "../contract";
import type { Shape } from "../shapes";
import { hasNames, type Rows } from "./shape-registration";

/** What the value of each kind must look like. A new kind needs its rule here. */
const VALUE_FORMS: Readonly<Record<AnswerKind, RegExp>> = { "whole-number": /^(0|[1-9]\d*)$/ };
const PART_NAME = /^[a-z]+(-[a-z0-9]+)*$/;

/** Each part is a name, a kind and a value of this kind, and no two parts have one name. */
export function hasAnswerForm(answer: Answer, kind: AnswerKind): boolean {
  const { parts, ...more } = answer;
  if (!Array.isArray(parts) || parts.length === 0 || Object.keys(more).length > 0 || !Object.hasOwn(VALUE_FORMS, kind)) return false;
  const isPart = (part: AnswerPart) => hasNames(part, ["name", "kind", "value"]) && part.kind === kind && typeof part.name === "string" && PART_NAME.test(part.name) && typeof part.value === "string" && VALUE_FORMS[kind].test(part.value);
  return parts.every(isPart) && new Set(parts.map((p) => p.name)).size === parts.length;
}

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
  ...(shape.orderedRow && { orderedRow: (limits: unknown, items: number, seed: string) => shape.orderedRow?.(frozen(limits), items, seed) }),
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
