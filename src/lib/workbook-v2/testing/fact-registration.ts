// What the three fact shapes register in the same way. It counts things in lists where the shape computes.
import { isInside, orderLimit, rangeLimit, setLimit, step, wholeAnswer, type Limits, type Printed, type Rows, type ShapeRegistration } from "./shape-registration";

export const r = (min: number, max: number) => ({ min, max });
const span = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => min + i);
export const q = (text: string): Rows => text.split(" ");
/** One question for each text between spaces. */
export const each = (texts: string): Rows[] => texts.split(" ").map((text) => [text]);

interface FactKind {
  id: string;
  sign: string;
  /** The largest first and second number and result. */
  most: [a: number, b: number, result: number];
  /** The result, from lists of things; null when there is none. */
  result(a: number, b: number): number | null;
  swaps: boolean;
}

type Named = Pick<ShapeRegistration, "cases" | "smallSpaces" | "witnesses" | "harder" | "refusedLimits" | "refusedRows">;

export function factRegistration({ id, sign, most, result, swaps }: FactKind, examples: readonly [name: string, row: string, line: string][], named: Named): ShapeRegistration {
  const [mostA, mostB, mostResult] = most;
  const rowOf = (a: number, b: number): Rows => [`${a}${sign}${b}=□`];
  const numbersOf = (rows: Rows): [number, number] | null => {
    const parts = rows.length === 1 && rows[0].endsWith("=□") ? rows[0].slice(0, -2).split(sign) : [];
    const numbers = parts.map(Number);
    return parts.length === 2 && parts.every((p, i) => /^\d+$/.test(p) && String(numbers[i]) === p) ? [numbers[0], numbers[1]] : null;
  };
  const read = (rows: Rows): Printed | null => {
    const numbers = numbersOf(rows);
    if (!numbers || numbers[0] > mostA || numbers[1] > mostB) return null;
    const [a, b] = numbers;
    const found = result(a, b);
    if (found === null || found > mostResult) return null;
    return {
      answer: wholeAnswer(String(found)), features: { tables: a, second: b, result: found, order: null },
      widths: { characters: Math.max(...[a, b, found].map((n) => (n < 10 ? 1 : n < 100 ? 2 : 3))) },
      steps: [step(`${a} ${sign} ${b} = ${found}`), step(String(found))],
    };
  };
  const space = span(0, mostA).flatMap((a) => span(0, mostB).map((b) => rowOf(a, b))).filter((rows) => read(rows) !== null);
  const inside = new Map<string, readonly string[]>();
  const registration: ShapeRegistration = {
    id, working: "lines",
    limits: { tables: setLimit(0, mostA), second: rangeLimit(0, mostB), result: rangeLimit(0, mostResult), order: orderLimit() },
    read, space,
    ordered: {
      asked: ({ order }) => order !== "mixed",
      next(rows, limits) {
        const key = JSON.stringify(limits);
        const all = inside.get(key) ?? space.filter((other) => { const p = read(other); return p !== null && isInside(registration, p, limits); }).map(([row]) => row);
        inside.set(key, all);
        const after = all[all.indexOf(rows[0]) + (limits.order === "up" ? 1 : -1)];
        return after === undefined ? null : [after];
      },
    },
    ...(swaps ? { swapped: (rows: Rows) => { const [a, b] = numbersOf(rows) ?? [0, 0]; return a === b ? null : rowOf(b, a); } } : {}),
    examples: examples.map(([name, row, line]) => ({ name, rows: [row], answer: wholeAnswer(line.split(" = ")[1]), steps: [step(line), step(line.split(" = ")[1])] })),
    ...named,
  };
  return registration;
}

/** Limits with everything allowed. */
export const wideFacts = (a: number, b: number, result: number): Limits => ({ tables: span(0, a), second: r(0, b), result: r(0, result), order: "mixed" });
export { span };
