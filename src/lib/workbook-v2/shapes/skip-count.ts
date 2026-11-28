// Skip counting: terms that go up or down by one step, with blanks. The space is large, but a question is a line (its step,
// its direction, its start, its terms) and a choice of blanks, and only the number of terms joins the two: each part is
// counted apart. A blank may stand where `places` allows it, and two printed neighbours must show the step.
import { pick } from "../hash";
import type { Answer, Step } from "../contract";
import { isExactly, readLimitFields, readLimitsThat, wholeFields, within, type Item, type Range, type Shape } from "./shape";

export interface SkipCountLimits {
  /** The size of the step. */
  step: Range;
  direction: "up" | "down" | "either";
  start: Range;
  /** Whether the start may be a number that the step does not divide. */
  offStep: "never" | "allowed";
  terms: Range;
  /** How many blanks there are, and the places in which they may stand, from 1. */
  blanks: Range;
  places: Range;
}
/** A step below 0 counts down. */
export interface SkipCountQuestion { start: number; step: number; terms: number; blanks: number[] }

const BOUNDS = { step: { min: 2, max: 10 }, start: { min: 0, max: 100 }, terms: { min: 5, max: 10 }, blanks: { min: 1, max: 5 }, places: { min: 1, max: 10 } };
const WORDS = { direction: ["up", "down", "either"], offStep: ["never", "allowed"] };

function termsOf({ start, step, terms }: SkipCountQuestion): number[] {
  const out: number[] = [];
  for (let i = 0; i < terms; i++) out.push(start + i * step);
  return out;
}
/** The answer of the blanks at these places. */
const partsOf = (values: readonly number[], blanks: readonly number[]): Answer =>
  ({ parts: blanks.map((place, i) => ({ name: `blank-${i + 1}`, kind: "whole-number", value: String(values[place - 1]) })) });
const answer = (q: SkipCountQuestion): Answer => partsOf(termsOf(q), q.blanks);
const item = (question: SkipCountQuestion): Item<SkipCountQuestion> => ({ question, answer: answer(question) });

const showsStep = (terms: number, blanks: readonly number[]): boolean => Array.from({ length: terms - 1 }, (_, i) => i + 1).some((place) => !blanks.includes(place) && !blanks.includes(place + 1));

function choicesFor(terms: number): number[][] {
  const out: number[][] = [];
  const add = (chosen: number[], from: number) => {
    if (within(chosen.length, BOUNDS.blanks) && showsStep(terms, chosen)) out.push(chosen);
    if (chosen.length < BOUNDS.blanks.max) for (let place = from; place <= terms; place++) add([...chosen, place], place + 1);
  };
  add([], 1);
  return out;
}
/** Every choice of blanks for each number of terms: there are fewer than 1,500, so they are made one time. */
const CHOICES: ReadonlyMap<number, readonly number[][]> = new Map(Array.from({ length: BOUNDS.terms.max - BOUNDS.terms.min + 1 }, (_, i) => [BOUNDS.terms.min + i, choicesFor(BOUNDS.terms.min + i)]));

const choices = ({ blanks, places }: SkipCountLimits, terms: number): number[][] =>
  (CHOICES.get(terms) ?? []).filter((chosen) => within(chosen.length, blanks) && chosen[0] >= places.min && chosen[chosen.length - 1] <= places.max);

/** The lines with one step, direction and number of terms: their starts are `first`, `first + every` and up. */
interface Lines { step: number; terms: number; first: number; every: number; count: number }

function linesOf({ step, direction, start, offStep, terms }: SkipCountLimits): Lines[] {
  const out: Lines[] = [];
  const signs = direction === "either" ? [1, -1] : [direction === "up" ? 1 : -1];
  for (let length = terms.min; length <= terms.max; length++) {
    for (const sign of signs) {
      for (let size = step.min; size <= step.max; size++) {
        // Counting down never passes 0.
        const low = sign > 0 ? start.min : Math.max(start.min, size * (length - 1));
        const every = offStep === "never" ? size : 1;
        const first = Math.ceil(low / every) * every;
        const count = Math.max(0, Math.floor((start.max - first) / every) + 1);
        if (count > 0) out.push({ step: sign * size, terms: length, first, every, count });
      }
    }
  }
  return out;
}

interface Group { lines: Lines; blanks: number[][] }
/** The lines of some limits with the choices of blanks that go with them. */
function groups(limits: SkipCountLimits): Group[] {
  const byTerms = new Map<number, number[][]>();
  for (let terms = limits.terms.min; terms <= limits.terms.max; terms++) byTerms.set(terms, choices(limits, terms));
  return linesOf(limits).map((lines) => ({ lines, blanks: byTerms.get(lines.terms) ?? [] })).filter(({ blanks }) => blanks.length > 0);
}

const sizeOf = ({ lines, blanks }: Group): number => lines.count * blanks.length;
const countAll = (all: readonly Group[]): number => all.reduce((sum, group) => sum + sizeOf(group), 0);
const count = (limits: SkipCountLimits): number => countAll(groups(limits));

function generate(limits: SkipCountLimits, seed: string): Item<SkipCountQuestion> {
  const all = groups(limits);
  let place = pick(seed, countAll(all));
  for (const group of all) {
    const { lines, blanks } = group;
    if (place < sizeOf(group)) return item({ start: lines.first + Math.floor(place / blanks.length) * lines.every, step: lines.step, terms: lines.terms, blanks: [...blanks[place % blanks.length]] });
    place -= sizeOf(group);
  }
  throw new Error("the count is wrong");
}

/** Whether data is a question of the limits: a line of some group (its step, its terms and a start of it) with a choice of blanks of that group. */
function contains(question: unknown, limits: SkipCountLimits): boolean {
  const fields = wholeFields(question, ["start", "step", "terms"] as const);
  const blanks = (question as { blanks?: unknown } | null)?.blanks;
  if (!fields || !Array.isArray(blanks) || !blanks.every((n) => typeof n === "number" && Number.isSafeInteger(n))) return false;
  if (!isExactly(question, { ...fields, blanks })) return false;
  return groups(limits).some(({ lines, blanks: choices }) => {
    const offset = fields.start - lines.first;
    const isStart = offset >= 0 && offset % lines.every === 0 && offset / lines.every < lines.count;
    return lines.step === fields.step && lines.terms === fields.terms && isStart && choices.some((one) => one.length === blanks.length && one.every((n, i) => n === blanks[i]));
  });
}

/** The order in which steps get harder: 2, 10 and 5 first, then by size. */
const STEPS = [2, 10, 5, 3, 4, 6, 7, 8, 9];

/** From the first difference on: counting down, then a start that the step does not divide, then the step, then more blanks. */
const score = (down: boolean, off: boolean, size: number, blanks: number): number => (down ? 200 : 0) + (off ? 100 : 0) + STEPS.indexOf(size) * 10 + blanks;

function difficultyRange(limits: SkipCountLimits): { easiest: number; hardest: number } {
  const scores = groups(limits).flatMap(({ lines, blanks }) => {
    const size = Math.abs(lines.step);
    const last = lines.first + (lines.count - 1) * lines.every;
    const starts = [...(Math.ceil(lines.first / size) * size <= last ? [false] : []), ...((lines.every === 1 && last > lines.first) || lines.first % size !== 0 ? [true] : [])];
    const numbers = blanks.map((b) => b.length);
    return starts.flatMap((off) => [Math.min(...numbers), Math.max(...numbers)].map((n) => score(lines.step < 0, off, size, n)));
  });
  return { easiest: Math.min(...scores), hardest: Math.max(...scores) };
}

/** For each number of terms, the line with the largest number: it is the last term when the line goes up and the first when it goes down. */
function widestLines(limits: SkipCountLimits): { question: SkipCountQuestion; blanks: number[][]; width: number }[] {
  const widest = new Map<number, { question: SkipCountQuestion; blanks: number[][]; width: number }>();
  for (const { lines, blanks } of groups(limits)) {
    const question = { start: lines.first + (lines.count - 1) * lines.every, step: lines.step, terms: lines.terms, blanks: [...blanks[0]] };
    const width = lines.terms * 10 + String(Math.max(question.start, question.start + (lines.terms - 1) * lines.step)).length;
    if (width > (widest.get(lines.terms)?.width ?? 0)) widest.set(lines.terms, { question, blanks, width });
  }
  return [...widest.values()];
}

const worstCase = (limits: SkipCountLimits): Item<SkipCountQuestion> => item(widestLines(limits).reduce((widest, line) => (line.width > widest.width ? line : widest)).question);
const forms = (limits: SkipCountLimits): Item<SkipCountQuestion>[] => widestLines(limits).flatMap(({ question, blanks }) => blanks.map((b) => item({ ...question, blanks: [...b] })));

/** Two printed neighbours say the step; the other terms come from them, one step at a time, and must be the printed ones. */
function solveAgain(rows: readonly string[]): Item<SkipCountQuestion> | null {
  if (!within(rows.length, BOUNDS.terms) || rows.some((row) => !/^(□|0|[1-9]\d{0,2})$/.test(row))) return null;
  const at = rows.findIndex((row, i) => i > 0 && row !== "□" && rows[i - 1] !== "□");
  if (at < 0) return null;
  const values = rows.map((row) => (row === "□" ? null : Number(row)));
  const [before, known] = [Number(rows[at - 1]), Number(rows[at])];
  const step = known - before;
  const filled = new Array<number>(rows.length).fill(0);
  for (let i = at, value = known; i < rows.length; i++, value += step) filled[i] = value;
  for (let i = at - 1, value = before; i >= 0; i--, value -= step) filled[i] = value;
  const blanks = rows.flatMap((row, i) => (row === "□" ? [i + 1] : []));
  const isGood = within(Math.abs(step), BOUNDS.step) && within(filled[0], BOUNDS.start) && filled.every((v, i) => v >= 0 && (values[i] === null || values[i] === v)) && within(blanks.length, BOUNDS.blanks);
  if (!isGood) return null;
  return { question: { start: filled[0], step, terms: rows.length, blanks }, answer: partsOf(filled, blanks) };
}

/** Each blank comes from the term before it. Blanks at the start come from the first printed term, going back. */
function steps(q: SkipCountQuestion): Step[] {
  const values = termsOf(q);
  const size = Math.abs(q.step);
  const firstPrinted = values.findIndex((_, i) => !q.blanks.includes(i + 1));
  const [on, back] = q.step > 0 ? ["+", "-"] : ["-", "+"];
  const early = q.blanks.filter((place) => place <= firstPrinted).reverse();
  const late = q.blanks.filter((place) => place > firstPrinted);
  return [
    ...early.map((place) => `${values[place]} ${back} ${size} = ${values[place - 1]}`),
    ...late.map((place) => `${values[place - 2]} ${on} ${size} = ${values[place - 1]}`),
    q.blanks.map((place) => values[place - 1]).join(", "),
  ].map((text) => ({ text, marks: [] }));
}

export const skipCount: Shape<SkipCountLimits, SkipCountQuestion> = {
  id: "count.skip",
  version: 1,
  answerKind: "whole-number",
  readLimits: (raw) => readLimitsThat<SkipCountLimits>(readLimitFields(raw, BOUNDS, WORDS), count),
  generate,
  answer,
  solveAgain,
  steps,
  difficulty: (q) => score(q.step < 0, q.start % Math.abs(q.step) !== 0, Math.abs(q.step), q.blanks.length),
  difficultyRange,
  worstCase,
  forms,
  count,
  contains,
  face: (q) => ({
    kind: "sequence",
    tokens: termsOf(q).map((value, i) => {
      const blank = q.blanks.indexOf(i + 1);
      return blank < 0 ? { text: String(value) } : { blank: `blank-${blank + 1}` };
    }),
  }),
};
