// What the two shapes with a missing number register in the same way. It tries each number and keeps those that fit.
import { choiceLimit, rangeLimit, setLimit, step, wholeAnswer, type Printed, type Rows, type ShapeRegistration } from "./shape-registration";

export const r = (min: number, max: number) => ({ min, max });
export const span = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => min + i);

interface MissingKind {
  id: string;
  sign: string;
  back: string;
  known: [min: number, max: number];
  most: [missing: number, result: number];
  /** The result, from lists of things. */
  result(a: number, b: number): number;
}

type Named = Pick<ShapeRegistration, "cases" | "smallSpaces" | "witnesses" | "harder" | "refusedLimits" | "refusedRows">;

export function missingRegistration({ id, sign, back, known: [knownMin, knownMax], most: [mostMissing, mostResult], result }: MissingKind, examples: readonly [name: string, row: string, lines: readonly string[]][], named: Named): ShapeRegistration {
  const read = (rows: Rows): Printed | null => {
    const sides = rows.length === 1 ? rows[0].split("=") : [];
    const pair = sides.length === 2 ? sides[0].split(sign) : [];
    const blank = pair.indexOf("□");
    const isNumber = (text: string | undefined) => text !== undefined && /^\d+$/.test(text) && String(Number(text)) === text;
    if (pair.length !== 2 || blank < 0 || !isNumber(pair[1 - blank]) || !isNumber(sides[1])) return null;
    const [known, total] = [Number(pair[1 - blank]), Number(sides[1])];
    if (known < knownMin || known > knownMax || total > mostResult) return null;
    const fitting = span(0, mostMissing).filter((n) => result(known, n) === total);
    if (fitting.length !== 1) return null;
    const [missing] = fitting;
    const [a, b] = blank === 0 ? [missing, known] : [known, missing];
    return {
      answer: wholeAnswer(String(missing)), features: { tables: known, missing, result: total, blank: blank === 0 ? "first" : "second" },
      widths: { characters: Math.max(...[known, missing, total].map((n) => String(n).length)) },
      steps: [step(`${total} ${back} ${known} = ${missing}`), step(`${a} ${sign} ${b} = ${total}`), step(String(missing))],
    };
  };
  const space = span(knownMin, knownMax).flatMap((known) => span(0, mostMissing).filter((n) => result(known, n) <= mostResult).flatMap((n) => [[`□${sign}${known}=${result(known, n)}`], [`${known}${sign}□=${result(known, n)}`]]));
  return {
    id, working: "lines",
    limits: { tables: setLimit(knownMin, knownMax), missing: rangeLimit(0, mostMissing), result: rangeLimit(0, mostResult), blank: choiceLimit(["first", "second"], "either") },
    read, space,
    examples: examples.map(([name, row, lines]) => ({ name, rows: [row], answer: wholeAnswer(lines[lines.length - 1]), steps: lines.map((line) => step(line)) })),
    ...named,
  };
}
