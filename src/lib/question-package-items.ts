// Workbook item formats of the question package (#362, spec #296): how one numbered item is answered on a page. An
// item has a format, its answer regions (each one box the renderer measures, so a page can hold several per item),
// whether the app can mark it from a scan, and the checks that give code the right answers of its scored regions.
// The checker (checkQuestionPackage in question-package.ts) runs itemProblem on every package with an item: a scored
// region is trusted only when code recomputes its answer; a region code cannot check is "unsupported", and an item
// that is not scorable, or that a parent checks, is "not checked by code". Nothing is guessed. Numbers are compared
// as exact rationals, never as floating-point values.
// Pure TypeScript: no Next.js, React, network, database or clock.
import type {
  AnswerRegion,
  AnswerValue,
  Equation,
  Figure,
  Item,
  ItemCheck,
  ItemFormat,
  NumberValue,
  Operation,
  OperationKind,
  Place,
  ShownError,
  Statement,
  Term,
  WrongAnswer,
} from "@/lib/question-package";
import { PATTERN_SHAPES } from "@/lib/question-package";
import {
  beyond,
  decimalDigits,
  decimalPlaces,
  fail,
  isObject,
  PLACE_ORDER,
  rational,
  written,
  type Fields,
  type Rational,
} from "@/lib/question-package-columns";
import { valueText } from "@/lib/question-package-math";

/** What the checker gives the item check: the value readers it owns, and the package's operation once checked. */
export interface ItemContext {
  /** Why a value is not a well-formed answer value ("<what> is missing"), or null. */
  valueProblem(value: unknown, what: string): string | null;
  /** Two values are the same written value. */
  sameValue(a: AnswerValue, b: AnswerValue): boolean;
  /** A number, fraction or mixed number as an exact rational, or null for any other value. */
  number(value: AnswerValue): Rational | null;
  /**
   * The package's operation, its answer, the other forms it accepts (each one checked against the operation's answer
   * rules: simplest form, the unit the question asks for) and its wrong answers; null when it has none.
   */
  computed: { operation: Operation; answer: AnswerValue; accepted: AnswerValue[]; wrongAnswers: WrongAnswer[] } | null;
}

export interface ItemProblem {
  status: "failed" | "unsupported" | "not-checked";
  reason: string;
}

/** The item of a package with none (every version 1 package): one answer box that holds the operation's answer. */
export function defaultItem(answer: AnswerValue): Item {
  return {
    format: "write-number",
    scorable: true,
    parentChecked: false,
    regions: [{ id: "answer", kind: "box", label: null, answer }],
    checks: [{ kind: "operation", region: "answer" }],
    error: null,
  };
}


const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.trim() !== "" && v.length <= max;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** The most regions (and checks) an item may have. */
const MOST_REGIONS = 40;

// ---------- Regions and formats ----------

const REGION_KINDS: readonly string[] = ["box", "choice", "work", "lines", "picture"];

/** A region as a format counts it: a choice by its mark. */
type Part = "box" | "tick" | "circle" | "work" | "lines" | "picture";
const PART_ORDER: readonly Part[] = ["box", "tick", "circle", "work", "lines", "picture"];
const PART_NAMES: Record<Part, [string, string]> = {
  box: ["box", "boxes"], tick: ["tick choice", "tick choices"], circle: ["circle choice", "circle choices"],
  work: ["work box", "work boxes"], lines: ["written reason", "written reasons"], picture: ["picture", "pictures"],
};
const partOf = (r: AnswerRegion): Part => (r.kind === "choice" ? r.mark : r.kind);

/**
 * The regions each format has, as [least, most] of each part (none when a part is not named; up to 3 written reasons
 * when they are not named), and whether it may be scorable.
 */
const FORMATS: Record<ItemFormat, { parts: Partial<Record<Part, [number, number]>>; scorable: boolean }> = {
  "write-number": { parts: { box: [1, 1] }, scorable: true },
  "write-words": { parts: { box: [1, 1] }, scorable: true },
  boxes: { parts: { box: [2, MOST_REGIONS] }, scorable: true },
  "fill-table": { parts: { box: [2, MOST_REGIONS] }, scorable: true },
  "tick-one": { parts: { tick: [1, 1] }, scorable: true },
  circle: { parts: { circle: [1, 1] }, scorable: true },
  "tick-and-number": { parts: { tick: [1, 1], box: [1, 1], work: [0, 1] }, scorable: true },
  "two-ways": { parts: { work: [2, 2], box: [1, 1] }, scorable: true },
  "spot-the-error": { parts: { box: [1, 3], tick: [0, 1], work: [0, 1] }, scorable: true },
  "show-work": { parts: { box: [1, 4], work: [1, 1] }, scorable: true },
  "written-reason": { parts: { lines: [1, 3] }, scorable: false },
  "number-line": { parts: { picture: [1, 1], box: [0, 4] }, scorable: true },
  "colour-or-shade": { parts: { picture: [1, 1] }, scorable: false },
  match: { parts: { picture: [1, 1] }, scorable: false },
  draw: { parts: { picture: [1, 1] }, scorable: false },
  "hands-on": { parts: { box: [0, 4] }, scorable: false },
};

/** Why an item's regions are not the regions of its format, or null. */
function formatProblem(format: ItemFormat, regions: AnswerRegion[]): string | null {
  const rule = FORMATS[format];
  for (const part of PART_ORDER) {
    const [least, most] = rule.parts[part] ?? (part === "lines" ? [0, 3] : [0, 0]);
    const n = regions.filter((r) => partOf(r) === part).length;
    const [one, many] = PART_NAMES[part];
    const name = (k: number) => `${k} ${k === 1 ? one : many}`;
    if (most === 0 && n > 0) return `a ${format} item has no ${one}`;
    if (least === most && n !== least) return `a ${format} item needs ${name(least)}, not ${n}`;
    if (n < least) return `a ${format} item needs at least ${name(least)}, not ${n}`;
    if (n > most) return `a ${format} item has at most ${name(most)}, not ${n}`;
  }
  return null;
}

/** What is wrong with a region's shape, or null. */
function regionProblem(r: unknown, ctx: ItemContext): string | null {
  if (!isObject(r)) return "a region is not an object";
  if (typeof r.id !== "string" || !ID.test(r.id)) return "a region id is not 1 to 40 small letters, digits or -";
  const at = `the region "${r.id}"`;
  if (!REGION_KINDS.includes(r.kind as string)) return `${at} has an unknown kind`;
  if (r.kind === "work" || r.kind === "lines") return isText(r.label, 80) ? null : `${at} needs a label of up to 80 characters`;
  if (r.label !== null && !isText(r.label, 80)) return `${at}'s label is not text of up to 80 characters or null`;
  if (r.kind === "box") return r.answer === null ? null : ctx.valueProblem(r.answer, `${at}'s answer`);
  if (r.kind === "choice") {
    if (r.mark !== "tick" && r.mark !== "circle") return `${at} is not marked with a tick or a circle`;
    if (!Array.isArray(r.choices) || r.choices.length < 2 || r.choices.length > 6 || !r.choices.every((c) => isText(c, 40))) {
      return `${at} needs 2 to 6 choices of up to 40 characters`;
    }
    if (new Set(r.choices).size !== r.choices.length) return `${at} names a choice twice`;
    if (r.answer !== null && (typeof r.answer !== "string" || !r.choices.includes(r.answer))) return `${at}'s answer is not one of its choices`;
  }
  return null;
}

// ---------- Exact numbers ----------

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);
const same = (a: Rational, b: Rational) => a[0] * b[1] === b[0] * a[1];
const less = (a: Rational, b: Rational) => a[0] * b[1] < b[0] * a[1];

/** a op b, exactly; null for a division by 0. */
function apply(op: Equation["op"], [an, ad]: Rational, [bn, bd]: Rational): Rational | null {
  switch (op) {
    case "+":
      return rational(an * bd + bn * ad, ad * bd);
    case "−":
      return rational(an * bd - bn * ad, ad * bd);
    case "×":
      return rational(an * bn, ad * bd);
    case "÷":
      return bn === ZERO ? null : rational(an * bd, ad * bn);
  }
}

/** A rational for the reasons: a whole number or a decimal when its decimal ends, else a fraction. */
function rationalText(r: Rational): string {
  if (decimalPlaces(r) !== null) return `${r[0] < ZERO ? "−" : ""}${decimalDigits(r)}`;
  return valueText({ type: "fraction", numerator: Number(r[0]), denominator: Number(r[1]) });
}

const NUMBER_TYPES: readonly string[] = ["number", "fraction", "mixed"];

/** The numbers an equations check's boxes take: counts (from 1), whole numbers (from 0), or any number. */
const NUMBER_KINDS: Record<Extract<ItemCheck, { kind: "equations" }>["numbers"], { name: string; takes: (r: Rational) => boolean }> = {
  any: { name: "any number", takes: () => true },
  whole: { name: "whole numbers (0, 1, 2, ...)", takes: (r) => wholeOf(r) !== null && wholeOf(r)! >= ZERO },
  counting: { name: "counting numbers (1, 2, 3, ...)", takes: (r) => wholeOf(r) !== null && wholeOf(r)! > ZERO },
};

/** The whole number a rational is (10/2 is 5), or null. */
const wholeOf = ([n, d]: Rational): bigint | null => (n % d === ZERO ? n / d : null);
const OPS: readonly string[] = ["+", "−", "×", "÷"];

/** Why a value is not a number code can read exactly, or null. */
function numberProblem(v: unknown, what: string, ctx: ItemContext): string | null {
  if (!isObject(v) || !NUMBER_TYPES.includes(v.type as string)) return `${what} is not a number, a fraction or a mixed number`;
  return ctx.valueProblem(v, what) ?? (ctx.number(v as NumberValue) ? null : `${what} is not a number code can read exactly`);
}

const isRegionTerm = (t: unknown): t is { region: string } => isObject(t) && t.type === undefined;

function termProblem(t: unknown, what: string, ctx: ItemContext): string | null {
  if (isRegionTerm(t)) return typeof t.region === "string" ? null : `${what} names no region`;
  return numberProblem(t, what, ctx);
}

function equationProblem(e: unknown, what: string, ctx: ItemContext): string | null {
  if (!isObject(e) || !OPS.includes(e.op as string)) return `${what} is not an equation with +, −, × or ÷`;
  return termProblem(e.left, `${what}'s left side`, ctx) ?? termProblem(e.right, `${what}'s right side`, ctx) ?? termProblem(e.result, `${what}'s result`, ctx);
}

const termRegions = (terms: Term[]) => terms.filter(isRegionTerm).map((t) => t.region);
const equationTerms = (e: Equation): Term[] => [e.left, e.right, e.result];

// ---------- Checks ----------

type Box = Extract<AnswerRegion, { kind: "box" }>;
type Choice = Extract<AnswerRegion, { kind: "choice" }>;

/** What a check reads besides itself: the item's regions, the package's operation, the shown error and the figure. */
interface CheckInput {
  regions: Map<string, AnswerRegion>;
  ctx: ItemContext;
  error: ShownError | null;
  figure: Figure | null;
}

interface CheckRule<C extends ItemCheck> {
  /** The kind of region the check marks. */
  region: "box" | "choice";
  /** What is wrong with the check's own fields, or null. */
  shape(c: Fields, ctx: ItemContext): string | null;
  /** The regions it marks. */
  regions(c: C): string[];
  /** Why its regions do not hold its right answers, or null. Each region it marks has an answer. */
  verify(c: C, read: CheckInput): ItemProblem | null;
}

const boxAnswer = (read: CheckInput, id: string) => (read.regions.get(id) as Box).answer as AnswerValue;
const choiceOf = (read: CheckInput, id: string) => read.regions.get(id) as Choice;
const isProblem = (v: unknown): v is ItemProblem => isObject(v) && typeof v.reason === "string";

/** The exact number a box holds, or a failure when it holds no number. */
function boxNumber(read: CheckInput, id: string): Rational | ItemProblem {
  const answer = boxAnswer(read, id);
  const n = NUMBER_TYPES.includes(answer.type) ? read.ctx.number(answer) : null;
  return n ?? fail(`the region "${id}" holds ${valueText(answer)}, not a number`);
}

/** The sign of an operation as a Mixed set item prints it; none for a kind with no one sign (a conversion). */
const SIGNS: Partial<Record<OperationKind, string>> = {
  add: "+", "decimal-add": "+", "fraction-add": "+", "quantity-add": "+",
  subtract: "−", "decimal-subtract": "−", "fraction-subtract": "−", "quantity-subtract": "−",
  multiply: "×", "decimal-multiply": "×", "fraction-multiply": "×", "quantity-multiply": "×",
  divide: "÷", "fraction-divide": "÷",
};

const oneRegion = (c: Fields) => (typeof c.region === "string" ? null : `the ${String(c.kind)} check names no region`);

/** A choice that must be one sign: it offers the sign, and holds it. */
function signProblem(id: string, choice: Choice, sign: string, what: string): ItemProblem | null {
  if (!choice.choices.includes(sign)) return fail(`the region "${id}" has no choice for ${what}, ${sign}`);
  return choice.answer === sign ? null : fail(`the region "${id}" holds ${choice.answer}, but ${what} is ${sign}`);
}

/** The numbers of an equation as filled in, or a failure for a box that holds no number. */
function filled(e: Equation, read: CheckInput): Rational[] | ItemProblem {
  const values: Rational[] = [];
  for (const t of equationTerms(e)) {
    const v = isRegionTerm(t) ? boxNumber(read, t.region) : (read.ctx.number(t) as Rational);
    if (isProblem(v)) return v;
    values.push(v);
  }
  return values;
}

/** The equation as filled in: "3 + 9 = 12". */
function equationText(e: Equation, read: CheckInput): string {
  const text = (t: Term) => valueText(isRegionTerm(t) ? boxAnswer(read, t.region) : t);
  return `${text(e.left)} ${e.op} ${text(e.right)} = ${text(e.result)}`;
}

/** Whether an equation with these numbers (left, right, result) holds, or a failure (a division by 0). */
function holds(e: Equation, [left, right, result]: Rational[], read: CheckInput): boolean | ItemProblem {
  const value = apply(e.op, left, right);
  if (value === null) return fail(`${equationText(e, read)} divides by 0`);
  return same(value, result);
}

/** A yes-or-no statement's truth, or a failure. */
function truth(s: Statement, read: CheckInput): boolean | ItemProblem {
  switch (s.kind) {
    case "equation":
      return holds(s.equation, filled(s.equation, read) as Rational[], read);
    case "factor":
      return s.of % s.factor === 0;
    case "shown-answer":
      return read.error ? false : fail("a shown-answer statement needs the item's shown wrong solution");
  }
}

function statementProblem(s: unknown, ctx: ItemContext): string | null {
  if (!isObject(s)) return "the yes-no check has no statement";
  switch (s.kind) {
    case "equation": {
      const problem = equationProblem(s.equation, "the statement", ctx);
      if (problem) return problem;
      return termRegions(equationTerms(s.equation as Equation)).length > 0 ? "the statement's equation has a box: it is printed whole" : null;
    }
    case "factor":
      return Number.isSafeInteger(s.factor) && (s.factor as number) >= 1 && Number.isSafeInteger(s.of) && (s.of as number) >= 0
        ? null : "a factor statement needs a whole factor from 1 and a whole number from 0";
    case "shown-answer":
      return null;
    default:
      return "the statement has an unknown kind";
  }
}

const RULES: { [K in ItemCheck["kind"]]: CheckRule<Extract<ItemCheck, { kind: K }>> } = {
  count: {
    region: "box",
    shape: oneRegion,
    regions: (c) => [c.region],
    verify: (c, read) => {
      const shown = read.figure ? figureCount(read.figure) : null;
      if (shown === null) return fail("a count check needs a figure of dots, a ten-frame, base-ten blocks or an array");
      const v = boxNumber(read, c.region);
      if (isProblem(v)) return v;
      return same(v, [BigInt(shown), ONE]) ? null : fail(`the region "${c.region}" holds ${valueText(boxAnswer(read, c.region))}, but the picture shows ${shown}`);
    },
  },

  pattern: {
    region: "choice",
    shape: oneRegion,
    regions: (c) => [c.region],
    verify: (c, read) => {
      const f = read.figure;
      if (f?.kind !== "pattern") return fail("a pattern check needs a pattern figure");
      const shape = f.core[f.blank % f.core.length];
      return signProblem(c.region, choiceOf(read, c.region), shape, "the shape in the blank");
    },
  },

  operation: {
    region: "box",
    shape: oneRegion,
    regions: (c) => [c.region],
    verify: (c, read) => {
      const computed = read.ctx.computed;
      if (!computed) return fail("an operation check needs the package's operation");
      // The answer or a form the package accepts: those forms passed the operation's rules, so no other is taken.
      const answer = boxAnswer(read, c.region);
      const right = [computed.answer, ...computed.accepted];
      if (right.some((r) => read.ctx.sameValue(answer, r))) return null;
      return fail(`the region "${c.region}" holds ${valueText(answer)}, but the question's answer is ${right.map(valueText).join(" or ")}`);
    },
  },

  "operation-sign": {
    region: "choice",
    shape: oneRegion,
    regions: (c) => [c.region],
    verify: (c, read) => {
      const computed = read.ctx.computed;
      if (!computed) return fail("an operation-sign check needs the package's operation");
      const sign = SIGNS[computed.operation.kind];
      if (!sign) return beyond(`code cannot name one sign for a ${computed.operation.kind} question`);
      return signProblem(c.region, choiceOf(read, c.region), sign, "the operation's sign");
    },
  },

  places: {
    region: "box",
    shape: (c) => {
      if (!written(c.number, 3) || (c.number as number) >= 10000000) return "the places check needs a number from 0 to 9999999.999 with at most 3 decimal places";
      if (!Array.isArray(c.parts) || c.parts.length === 0 || c.parts.length > PLACE_ORDER.length) return "the places check needs 1 to 10 parts";
      if (!c.parts.every((p) => isObject(p) && typeof p.region === "string" && PLACE_ORDER.includes(p.place as Place))) return "a part of the places check needs a region and a place";
      return new Set(c.parts.map((p) => p.place)).size === c.parts.length ? null : "the places check names a place twice";
    },
    regions: (c) => c.parts.map((p) => p.region),
    verify: (c, read) => {
      const w = written(c.number, 3)!;
      const thousandths = BigInt(w.scaled) * TEN ** BigInt(3 - w.places);
      const column = (p: Place) => PLACE_ORDER.indexOf(p);
      const count = (p: Place) => thousandths / TEN ** BigInt(column(p));
      const number = valueText({ type: "number", value: c.number });
      const parts = [...c.parts].sort((a, b) => column(b.place) - column(a.place));
      const top = parts[0].place;
      // Each place below the largest box with a digit other than 0 needs its own box, or the boxes cannot show the number.
      for (const place of PLACE_ORDER.slice(0, column(top))) {
        const digit = count(place) % TEN;
        if (digit !== ZERO && !parts.some((p) => p.place === place)) return fail(`${number} has ${digit} ${place}, but the item has no box for the ${place}`);
      }
      for (const p of parts) {
        const expected = p.place === top ? count(p.place) : count(p.place) % TEN;
        const v = boxNumber(read, p.region);
        if (isProblem(v)) return v;
        if (!same(v, [expected, ONE])) return fail(`the region "${p.region}" holds ${valueText(boxAnswer(read, p.region))}, but ${number} has ${expected} ${p.place}`);
      }
      return null;
    },
  },

  order: {
    region: "box",
    shape: (c, ctx) => {
      if (c.direction !== "up" && c.direction !== "down") return "the order check goes neither up nor down";
      if (!Array.isArray(c.numbers) || c.numbers.length < 2 || c.numbers.length > 12) return "the order check needs 2 to 12 numbers";
      for (const n of c.numbers) {
        const problem = numberProblem(n, "a number to order", ctx);
        if (problem) return problem;
      }
      if (!Array.isArray(c.regions) || c.regions.length !== c.numbers.length || !c.regions.every((r) => typeof r === "string")) {
        return "the order check needs one region for each number";
      }
      return null;
    },
    regions: (c) => c.regions,
    verify: (c, read) => {
      const sorted = c.numbers.map((n) => ({ n, v: read.ctx.number(n) as Rational })).sort((a, b) => (less(a.v, b.v) ? -1 : less(b.v, a.v) ? 1 : 0));
      if (c.direction === "down") sorted.reverse();
      const way = c.direction === "up" ? "least to greatest" : "greatest to least";
      for (const [i, id] of c.regions.entries()) {
        const v = boxNumber(read, id);
        if (isProblem(v)) return v;
        if (!same(v, sorted[i].v)) return fail(`the region "${id}" holds ${valueText(boxAnswer(read, id))}, but from ${way} number ${i + 1} is ${valueText(sorted[i].n)}`);
      }
      return null;
    },
  },

  equations: {
    region: "box",
    shape: (c, ctx) => {
      if (typeof c.different !== "boolean") return "the equations check does not say whether its equations must differ";
      if (!Object.hasOwn(NUMBER_KINDS, c.numbers as string)) return "the equations check does not say which numbers its boxes take: any, whole or counting";
      if (!Array.isArray(c.equations) || c.equations.length === 0 || c.equations.length > 12) return "the equations check needs 1 to 12 equations";
      for (const e of c.equations) {
        const problem = equationProblem(e, "an equation", ctx);
        if (problem) return problem;
      }
      const boxes = (c.equations as Equation[]).flatMap((e) => termRegions(equationTerms(e)));
      if (boxes.length === 0) return "the equations check has no box: a printed equation is a yes-no statement";
      return new Set(boxes).size === boxes.length ? null : "the equations check names one box twice";
    },
    regions: (c) => c.equations.flatMap((e) => termRegions(equationTerms(e))),
    verify: (c, read) => {
      const seen: Rational[][] = [];
      const kind = NUMBER_KINDS[c.numbers];
      for (const id of termRegions(c.equations.flatMap(equationTerms))) {
        const v = boxNumber(read, id);
        if (isProblem(v)) return v;
        if (!kind.takes(v)) return fail(`the region "${id}" holds ${valueText(boxAnswer(read, id))}, but the boxes take ${kind.name}`);
      }
      for (const e of c.equations) {
        const values = filled(e, read);
        if (isProblem(values)) return values;
        const ok = holds(e, values, read);
        if (isProblem(ok)) return ok;
        if (!ok) return fail(`the boxes make ${equationText(e, read)}, which is not true`);
        if (c.different && seen.some((s) => s.every((v, i) => same(v, values[i])))) return fail(`two equations are ${equationText(e, read)}: the ways must differ`);
        seen.push(values);
      }
      return null;
    },
  },

  sequence: {
    region: "box",
    shape: (c, ctx) => {
      if (!Array.isArray(c.terms) || c.terms.length < 3 || c.terms.length > 20) return "the sequence check needs 3 to 20 terms";
      for (const t of c.terms) {
        const problem = termProblem(t, "a term", ctx);
        if (problem) return problem;
      }
      const problem = numberProblem(c.step, "the step", ctx);
      if (problem) return problem;
      if (ctx.number(c.step as NumberValue)![0] === ZERO) return "the sequence's step is 0";
      const boxes = termRegions(c.terms as Term[]);
      if (boxes.length === 0 || boxes.length === c.terms.length) return "the sequence check needs a printed term and a box";
      return new Set(boxes).size === boxes.length ? null : "the sequence check names one box twice";
    },
    regions: (c) => termRegions(c.terms),
    verify: (c, read) => {
      const step = read.ctx.number(c.step) as Rational;
      const first = c.terms.findIndex((t) => !isRegionTerm(t));
      const start = read.ctx.number(c.terms[first] as NumberValue) as Rational;
      for (const [i, t] of c.terms.entries()) {
        const expected = apply("+", start, apply("×", step, [BigInt(i - first), ONE])!)!;
        if (!isRegionTerm(t)) {
          if (!same(read.ctx.number(t) as Rational, expected)) return fail(`the sequence's printed numbers do not change by ${valueText(c.step)} each time`);
          continue;
        }
        const v = boxNumber(read, t.region);
        if (isProblem(v)) return v;
        if (!same(v, expected)) return fail(`the region "${t.region}" holds ${valueText(boxAnswer(read, t.region))}, but the sequence has ${rationalText(expected)} there`);
      }
      return null;
    },
  },

  compare: {
    region: "choice",
    shape: (c, ctx) => oneRegion(c) ?? numberProblem(c.left, "the left number", ctx) ?? numberProblem(c.right, "the right number", ctx),
    regions: (c) => [c.region],
    verify: (c, read) => {
      const [a, b] = [read.ctx.number(c.left) as Rational, read.ctx.number(c.right) as Rational];
      const sign = less(a, b) ? "<" : less(b, a) ? ">" : "=";
      return signProblem(c.region, choiceOf(read, c.region), sign, `the sign between ${valueText(c.left)} and ${valueText(c.right)}`);
    },
  },

  "yes-no": {
    region: "choice",
    shape: (c, ctx) => {
      const region = oneRegion(c);
      if (region) return region;
      if (!isText(c.yes, 40) || !isText(c.no, 40) || c.yes === c.no) return "the yes-no check needs two different words for yes and no";
      return statementProblem(c.statement, ctx);
    },
    regions: (c) => [c.region],
    verify: (c, read) => {
      const choice = choiceOf(read, c.region);
      if (choice.choices.length !== 2 || !choice.choices.includes(c.yes) || !choice.choices.includes(c.no)) {
        return fail(`the yes-no check's yes and no are not the two choices of the region "${c.region}"`);
      }
      const t = truth(c.statement, read);
      if (isProblem(t)) return t;
      const right = t ? c.yes : c.no;
      return choice.answer === right ? null : fail(`the region "${c.region}" holds ${choice.answer}, but the answer is ${right}`);
    },
  },
};

// ---------- Figures ----------

const isWholeIn = (v: unknown, least: number, most: number): v is number => Number.isSafeInteger(v) && (v as number) >= least && (v as number) <= most;
const isCounts = (v: unknown, least: number, most: number, each: number): v is number[] =>
  Array.isArray(v) && v.length >= least && v.length <= most && v.every((n) => isWholeIn(n, 0, each));
const sum = (ns: number[]) => ns.reduce((s, n) => s + n, 0);

/**
 * What is wrong with a figure's shape, or null. Sizes are bounded so the renderer can always draw it. A figure of things
 * to count (dots, a ten-frame, base-ten blocks) may show none: "How many? 0" is an early-level item. An array has at
 * least one row and one column.
 */
function figureProblem(f: unknown): string | null {
  if (!isObject(f)) return "the figure is not an object";
  switch (f.kind) {
    case "dots":
      if (!isCounts(f.groups, 1, 3, 20) || sum(f.groups) > 30) return "a dots figure needs 1 to 3 groups of 0 to 20 dots, 0 to 30 in all";
      return isWholeIn(f.takenAway, 0, sum(f.groups)) ? null : "a dots figure crosses out 0 to all of its dots";
    case "ten-frame":
      return isCounts(f.counters, 1, 2, 20) && sum(f.counters) <= 20 ? null : "a ten-frame figure needs 1 or 2 parts of counters, 0 to 20 in all";
    case "number-line": {
      if (!isWholeIn(f.from, 0, 10000) || !isWholeIn(f.to, 0, 10000) || !isWholeIn(f.step, 1, 1000)) return "a number line needs whole numbers from, to and a step from 1";
      const ticks = (f.to - f.from) / f.step;
      return Number.isInteger(ticks) && ticks >= 1 && ticks <= 20 ? null : "a number line needs 1 to 20 equal steps from its start to its end";
    }
    case "base-ten":
      return isWholeIn(f.hundreds, 0, 9) && isWholeIn(f.tens, 0, 20) && isWholeIn(f.ones, 0, 20)
        ? null : "base-ten blocks need 0 to 9 hundreds and 0 to 20 tens and ones";
    case "array":
      return isWholeIn(f.rows, 1, 10) && isWholeIn(f.columns, 1, 10) ? null : "an array needs 1 to 10 rows and columns";
    case "pattern": {
      const shapes: readonly unknown[] = PATTERN_SHAPES;
      if (!Array.isArray(f.core) || f.core.length < 2 || f.core.length > 4 || !f.core.every((x) => shapes.includes(x))) return "a pattern needs a core of 2 to 4 known shapes";
      if (new Set(f.core).size < 2) return "a pattern's core needs two different shapes";
      if (!isWholeIn(f.length, f.core.length * 2, 12)) return "a pattern shows its core at least twice, and at most 12 shapes";
      return isWholeIn(f.blank, 0, f.length - 1) ? null : "a pattern's blank is not one of its shapes";
    }
    default:
      return "the figure has an unknown kind";
  }
}

/** The number a figure shows when the child counts it, or null for a number line or a pattern. */
export function figureCount(f: Figure): number | null {
  switch (f.kind) {
    case "dots":
      return sum(f.groups) - f.takenAway;
    case "ten-frame":
      return sum(f.counters);
    case "base-ten":
      return f.hundreds * 100 + f.tens * 10 + f.ones;
    case "array":
      return f.rows * f.columns;
    default:
      return null;
  }
}

/** The figure's text for the reasons. */
function figureText(f: Figure): string {
  switch (f.kind) {
    case "dots":
      return `dots ${f.groups.join(" and ")}${f.takenAway ? `, ${f.takenAway} crossed out` : ""}`;
    case "ten-frame":
      return `a ten-frame of ${f.counters.join(" and ")}`;
    case "number-line":
      return `a number line from ${f.from} to ${f.to}`;
    case "base-ten":
      return `${f.hundreds} hundreds, ${f.tens} tens and ${f.ones} ones`;
    case "array":
      return `${f.rows} rows of ${f.columns}`;
    case "pattern":
      return "a pattern";
  }
}

/** The whole numbers a list of values is, or null when one is not a whole number from 0. */
function wholes(values: AnswerValue[], ctx: ItemContext): number[] | null {
  const out: number[] = [];
  for (const v of values) {
    const r = ctx.number(v);
    if (!r || r[1] !== ONE || r[0] < ZERO || r[0] > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    out.push(Number(r[0]));
  }
  return out;
}

const sameList = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Whether the figure agrees with the question: what code reads it against (the operation's numbers, the places number,
 * the compared, ordered or sequence numbers) must be what it shows. A count or pattern check reads the figure itself.
 * Failed when code knows how the figure shows the question and it does not; unsupported when code cannot tell.
 */
function figureAgreement(f: Figure, checks: ItemCheck[], read: CheckInput): ItemProblem | null {
  if (checks.some((c) => c.kind === "count" || c.kind === "pattern")) return null;
  if (f.kind === "pattern") return fail("a pattern figure needs a pattern check");
  const { ctx } = read;
  const unclear = beyond(`code cannot tell whether ${figureText(f)} shows the question`);
  const differs = (what: string) => fail(`the picture shows ${figureText(f)}, not ${what}`);
  const onLine = (ns: number[] | null, what: string) => {
    if (!ns) return unclear;
    return f.kind === "number-line" && ns.every((n) => n >= f.from && n <= f.to) ? null : differs(what);
  };
  const computed = ctx.computed;
  if (computed) {
    const op = computed.operation;
    if (op.kind !== "add" && op.kind !== "subtract" && op.kind !== "multiply") return unclear;
    const [a, b] = op.operands;
    const answer = wholes([computed.answer], ctx)?.[0];
    const what = `${a} ${op.kind === "add" ? "+" : op.kind === "subtract" ? "−" : "×"} ${b}`;
    switch (f.kind) {
      case "dots":
        if (op.kind === "add") return sameList(f.groups, [a, b]) && f.takenAway === 0 ? null : differs(what);
        if (op.kind === "subtract") return sameList(f.groups, [a]) && f.takenAway === b ? null : differs(what);
        return f.groups.length === a && f.groups.every((g) => g === b) && f.takenAway === 0 ? null : differs(what);
      case "ten-frame":
        if (op.kind === "add") return sameList(f.counters, [a, b]) ? null : differs(what);
        return op.kind === "subtract" && sameList(f.counters, [a]) ? null : differs(what);
      case "array":
        return op.kind === "multiply" && f.rows === a && f.columns === b ? null : differs(what);
      case "base-ten":
        return op.kind !== "multiply" && figureCount(f) === a ? null : differs(what);
      case "number-line":
        // The hops start at the first number and land on the answer.
        return onLine(answer === undefined ? null : [a, answer], what);
    }
  }
  const check = checks[0];
  if (!check) return unclear;
  switch (check.kind) {
    case "places":
      if (f.kind === "number-line") return onLine([check.number].filter(Number.isInteger), String(check.number));
      return figureCount(f) === check.number ? null : differs(String(check.number));
    case "compare": {
      const ns = wholes([check.left, check.right], ctx);
      if (!ns) return unclear;
      const what = `${ns[0]} and ${ns[1]}`;
      if (f.kind === "dots") return sameList(f.groups, ns) && f.takenAway === 0 ? null : differs(what);
      if (f.kind === "number-line") return onLine(ns, what);
      return unclear;
    }
    case "order":
      return f.kind === "number-line" ? onLine(wholes(check.numbers, ctx), "the numbers to order") : unclear;
    case "sequence": {
      if (f.kind !== "number-line") return unclear;
      const terms = check.terms.map((t) => (isRegionTerm(t) ? boxAnswer(read, t.region) : t));
      return onLine(wholes(terms, ctx), "the sequence's numbers");
    }
    default:
      return unclear;
  }
}

/** The rule of a check of a known kind. */
const ruleOf = (c: ItemCheck) => RULES[c.kind] as CheckRule<ItemCheck>;

/** What is wrong with the shown wrong solution of an item, or null. */
function errorProblem(format: ItemFormat, error: unknown, ctx: ItemContext): string | null {
  if (format !== "spot-the-error") return error === null ? null : "only a spot-the-error item shows a wrong solution";
  const computed = ctx.computed;
  if (error === null) return computed ? "a spot-the-error item with an operation needs its shown error" : null;
  if (!computed) return "a shown wrong solution needs the question's operation";
  if (!isObject(error) || (error.step !== null && typeof error.step !== "string")) return "the shown error needs an answer, and a step or null";
  const value = ctx.valueProblem(error.answer, "the shown answer");
  if (value) return value;
  const shown = error.answer as AnswerValue;
  const wrong = computed.wrongAnswers.find((w) => ctx.sameValue(w.value, shown));
  if (!wrong) return `the shown answer ${valueText(shown)} is not one of the question's wrong answers`;
  const stepName = (s: unknown) => (s === null ? "no one step" : `the step ${String(s)}`);
  return wrong.step === error.step ? null : `the shown answer ${valueText(shown)} has its mistake at ${stepName(wrong.step)}, not ${stepName(error.step)}`;
}

/**
 * What is wrong with an item, or why code does not check it: "failed" for an unsound item or a wrong answer, then
 * "unsupported" for a scored region code cannot check, then "not-checked" for a sound item that is not scorable.
 * Null: code checked every scored region.
 */
export function itemProblem(item: unknown, ctx: ItemContext): ItemProblem | null {
  if (!isObject(item)) return fail("the item is not an object");
  if (typeof item.scorable !== "boolean" || typeof item.parentChecked !== "boolean") return fail("the item does not say whether it is scorable and whether a parent checks it");
  if (!Array.isArray(item.regions)) return fail("the item's regions are not a list");
  if (item.regions.length > MOST_REGIONS) return fail(`the item has more than ${MOST_REGIONS} regions`);
  for (const r of item.regions) {
    const problem = regionProblem(r, ctx);
    if (problem) return fail(problem);
  }
  const list = item.regions as AnswerRegion[];
  const regions = new Map(list.map((r) => [r.id, r]));
  if (regions.size !== list.length) return fail("a region id is used twice");
  if (typeof item.format !== "string" || !Object.hasOwn(FORMATS, item.format)) return fail("the item's format is not one code knows");
  const format = item.format as ItemFormat;
  const layout = formatProblem(format, list);
  if (layout) return fail(layout);
  const marked = list.filter((r): r is Box | Choice => r.kind === "box" || r.kind === "choice");
  if (item.scorable) {
    if (!FORMATS[format].scorable) return fail(`a ${format} item is never scorable`);
    if (item.parentChecked) return fail("a scorable item is not checked by a parent");
    if (marked.length === 0) return fail("a scorable item needs a box or a choice to mark");
    const open = marked.find((r) => r.answer === null);
    if (open) return fail(`the region "${open.id}" is scored, so it needs an answer`);
  }
  if (item.error === undefined) return fail("the item does not say whether it shows a wrong solution");
  const error = errorProblem(format, item.error, ctx);
  if (error) return fail(error);
  const figure = item.figure ?? null;
  if (figure !== null) {
    const problem = figureProblem(figure);
    if (problem) return fail(problem);
  }

  if (!Array.isArray(item.checks)) return fail("the item's checks are not a list");
  if (item.checks.length > MOST_REGIONS) return fail(`the item has more than ${MOST_REGIONS} checks`);
  const covered = new Set<string>();
  for (const c of item.checks) {
    if (!isObject(c) || typeof c.kind !== "string" || !Object.hasOwn(RULES, c.kind)) return fail("a check has an unknown kind");
    const rule = ruleOf(c as ItemCheck);
    const shape = rule.shape(c, ctx);
    if (shape) return fail(shape);
    for (const id of rule.regions(c as ItemCheck)) {
      const region = regions.get(id);
      if (!region) return fail(`the ${c.kind} check names a region the item does not have, "${id}"`);
      if (region.kind !== rule.region) return fail(`the ${c.kind} check needs a ${rule.region} region, not "${id}"`);
      if (region.answer === null) return fail(`the region "${id}" has no answer to check`);
      if (covered.has(id)) return fail(`the region "${id}" is in two checks`);
      covered.add(id);
    }
  }
  const read: CheckInput = { regions, ctx, error: item.error as ShownError | null, figure: figure as Figure | null };
  let unsupported: ItemProblem | null = null;
  for (const c of item.checks as ItemCheck[]) {
    const problem = ruleOf(c).verify(c, read);
    if (problem?.status === "failed") return problem;
    unsupported ??= problem;
  }
  if (figure !== null) {
    const problem = figureAgreement(figure as Figure, item.checks as ItemCheck[], read);
    if (problem?.status === "failed") return problem;
    unsupported ??= problem;
  }
  if (unsupported) return unsupported;
  if (!item.scorable) return { status: "not-checked", reason: item.parentChecked ? "a parent checks the item" : "the item is not scored" };
  const unchecked = marked.find((r) => !covered.has(r.id));
  return unchecked ? beyond(`code cannot check the region "${unchecked.id}"`) : null;
}
