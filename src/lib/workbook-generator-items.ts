// The generator's items (#311, spec #296): what the AI writes for one question slot, its JSON schema, and how code turns
// it into a question package (#298). The AI writes content only: the words, the numbers of the operation, the expected
// wrong answers with their causes, an easier example of the same operation, the skill (one the plan names) and an item
// format from a closed list. It never writes the answer, a worked step or an answer region: code computes the answer
// and every step from the operation (operationResult, workedSteps), builds the item's regions and checks from the
// format (the answer of every box and choice is computed by code: D-195 spirit, the AI is never the source of math
// truth), and then the checker (checkQuestionPackage) runs on the whole package. It never sets a layout, a font, a size
// or a position: the schema has no field for one, and code takes only the fields named here.
//
// Formats with no operation (#377): places, order, compare, sequence, count and pattern. The AI gives their numbers (a
// number to split into places, numbers to order or compare, a sequence's start, step and blanks, the counts of a
// picture, a pattern's core); code computes every box and choice answer and the item check verifies it. Pictures (#377):
// the AI names a figure kind only (dots, ten-frame, number-line, base-ten, array); code draws the figure's numbers from
// the operation or the item's numbers (a count item's counts are its numbers), and the checker checks that the figure
// agrees with the question. A draw item ("Draw 6 dots.") and a written reason are parent-checked: "not checked by code".
//
// The printed question asks what the answer key answers (round 6, R380-11-1): a relation's text is written by code from
// the data its choices and answer come from; a whole-number operation's text must name the numbers it works (or its
// picture show them), an easier example's text that names others is written by code from its operation, and a compare,
// order, places or sequence text must name the same numbers and direction as its data.
//
// Code writes the text wherever it can (round 7, R380-12-1): at U1 to U9 a whole-number +, -, missing part, × or ÷
// prints one of code's wordings (src/lib/workbook-wording.ts), filled from the same operation as the answer key, and its
// easier example prints the easier operation ("7 - 3 = ?"). The AI's words are never printed there: it may only choose
// the person and the thing to count from the lists code offers. Any other printed text the AI writes that has an answer
// key goes to the solve check (src/lib/workbook-solve-check.ts) in the generator.
// Pure TypeScript: no Next.js, React, network, database, clock or randomness.
import { BC_SKILL_MAP } from "@/lib/assessment";
import { readNumbers } from "@/lib/number-words";
import { defaultItem, figureCount } from "@/lib/question-package-items";
import { codeWordings, isWorded, operationQuestion, type WordingKind } from "@/lib/workbook-wording";
import { PLACE_ORDER, written } from "@/lib/question-package-columns";
import {
  checkQuestionPackage,
  PATTERN_SHAPES,
  RELATIONS,
  relationChoices,
  operationProblem,
  operationResult,
  workedSteps,
  type AnswerRegion,
  type AnswerValue,
  type Figure,
  type Item,
  type ItemCheck,
  type NumberValue,
  type Operation,
  type OperationKind,
  type PatternShape,
  type Place,
  type Relation,
  type QuestionPackage,
  type WrongAnswer,
} from "@/lib/question-package";

// ---------- What the AI writes ----------

/** The item formats the generator builds. */
export const GENERATED_FORMATS = [
  "write-number", "show-work", "two-ways", "tick-and-number", "spot-the-error", "number-line",
  "places", "order", "compare", "sequence", "count", "pattern", "relation",
  "written-reason", "draw",
] as const;
export type GeneratedFormat = (typeof GENERATED_FORMATS)[number];

/** Formats that need an operation code can compute: the answer and the steps come from it. */
const OPERATION_FORMATS: readonly GeneratedFormat[] = ["write-number", "show-work", "two-ways", "tick-and-number", "spot-the-error", "number-line"];

/** The figure kinds the AI may name; code draws each from numbers (a pattern figure comes with the pattern format). */
export const FIGURE_KINDS = ["dots", "ten-frame", "number-line", "base-ten", "array"] as const;
export type FigureKind = (typeof FIGURE_KINDS)[number];

/** Every operation kind the question package computes (a kind missing here fails the build). */
const OPERATION_KINDS = [
  "add", "subtract", "missing-addend", "multiply", "divide", "decimal-add", "decimal-subtract", "decimal-multiply",
  "fraction-add", "fraction-subtract", "fraction-multiply", "fraction-divide", "fraction-simplify", "fraction-equivalent",
  "convert", "quantity-add", "quantity-subtract", "quantity-multiply", "money-round", "elapsed-time", "time-add",
  "clock-convert", "evaluate", "solve",
] as const satisfies readonly OperationKind[];
const ALL_KINDS: Exclude<OperationKind, (typeof OPERATION_KINDS)[number]> extends never ? true : false = true;
void ALL_KINDS;

/** Kinds whose operands are plain numbers. */
const NUMBER_KINDS: readonly string[] = ["add", "subtract", "missing-addend", "multiply", "divide", "decimal-add", "decimal-subtract", "decimal-multiply"];
/** Kinds whose one operand is an expression or an equation. */
const EXPRESSION_KINDS: readonly string[] = ["evaluate", "solve"];

/** A value as the AI writes it: every field present, null where it does not apply. */
export interface AiValue {
  type: "number" | "fraction" | "mixed" | "quantity" | "compound" | "time" | "text";
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  whole: number | null;
  unit: string | null;
  hours: number | null;
  minutes: number | null;
  period: "a.m." | "p.m." | null;
  parts: { value: number; unit: string }[];
  text: string | null;
}

/** An operation as the AI writes it. */
export interface AiOperation {
  kind: OperationKind;
  /** The numbers or amounts, in order; empty for evaluate and solve. */
  operands: AiValue[];
  /** The expression (evaluate) or equation (solve); else null. */
  expression: string | null;
  /** The unit the answer must be in (convert; amounts and elapsed time when the question asks for one), else null. */
  unit: string | null;
  /** The new denominator of fraction-equivalent, else null. */
  denominator: number | null;
  /** The values of the unknowns of evaluate; else empty. */
  values: { name: string; value: number }[];
}

/** One question slot as the AI fills it. */
export interface AiItem {
  /** The slot id the plan gave. */
  slot: string;
  /** One of the slot's skill ids. */
  skill: string;
  difficulty: 1 | 2 | 3;
  /** The question as the child reads it. */
  text: string;
  format: GeneratedFormat;
  operation: AiOperation | null;
  wrongAnswers: { value: AiValue; cause: string; description: string; step: string | null }[];
  easier: { text: string; operation: AiOperation } | null;
  /** Spot the error: the index of the wrong answer the page shows as Sam's work; else null. */
  shownWrong: number | null;
  /** The picture the child reads, as a kind only: code draws its numbers. Null: no picture. */
  figure: FigureKind | null;
  /**
   * The numbers of a format with no operation: places, the one number; order, the numbers; compare, the two numbers;
   * count, the picture's counts (dots: each group; ten-frame: each part; base-ten: hundreds, tens, ones; array: rows,
   * columns). Else empty.
   */
  numbers: AiValue[];
  /** Places: the places to ask, or null for every place of the number. */
  places: Place[] | null;
  /** Order: up (least to greatest) or down; else null. */
  direction: "up" | "down" | null;
  /** Sequence: the first term, the step, how many terms, and which terms (from 0) are blanks; else null. */
  sequence: { start: AiValue; step: AiValue; terms: number; blanks: number[] } | null;
  /** Pattern: the core that repeats, how many shapes are shown, and which one (from 0) is the blank; else null. */
  pattern: { core: PatternShape[]; shapes: number; blank: number } | null;
  /**
   * Relation (#380): which relation in words the child circles, its benchmarks and, for more and fewer, a label for each
   * of the two numbers (in `numbers`); code writes the choices and the answer. Else null.
   */
  relation: { kind: Relation; to: number[]; labels: string[] } | null;
  /** A picture of a missing part shows the part given or the total (#380); null for any other picture. */
  figureShows: "part" | "total" | null;
  /** The person code's wording names, one of the names code offers (round 7); null for code's choice. */
  name: string | null;
  /** The thing code's wording counts, one of the things code offers (round 7); null for code's choice. */
  thing: string | null;
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const object = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

const VALUE_SCHEMA = object({
  type: { type: "string", enum: ["number", "fraction", "mixed", "quantity", "compound", "time", "text"] },
  value: nullable({ type: "number" }),
  numerator: nullable({ type: "integer" }),
  denominator: nullable({ type: "integer" }),
  whole: nullable({ type: "integer" }),
  unit: nullable({ type: "string" }),
  hours: nullable({ type: "integer" }),
  minutes: nullable({ type: "integer" }),
  period: nullable({ type: "string", enum: ["a.m.", "p.m."] }),
  parts: { type: "array", items: object({ value: { type: "number" }, unit: { type: "string" } }) },
  text: nullable({ type: "string" }),
});

const OPERATION_SCHEMA = object({
  kind: { type: "string", enum: [...OPERATION_KINDS] },
  operands: { type: "array", items: VALUE_SCHEMA },
  expression: nullable({ type: "string" }),
  unit: nullable({ type: "string" }),
  denominator: nullable({ type: "integer" }),
  values: { type: "array", items: object({ name: { type: "string" }, value: { type: "number" } }) },
});

const ITEM_SCHEMA = object({
  slot: { type: "string" },
  skill: { type: "string" },
  difficulty: { type: "integer", enum: [1, 2, 3] },
  text: { type: "string" },
  format: { type: "string", enum: [...GENERATED_FORMATS] },
  operation: nullable(OPERATION_SCHEMA),
  wrongAnswers: {
    type: "array",
    items: object({ value: VALUE_SCHEMA, cause: { type: "string" }, description: { type: "string" }, step: nullable({ type: "string" }) }),
  },
  easier: nullable(object({ text: { type: "string" }, operation: OPERATION_SCHEMA })),
  shownWrong: nullable({ type: "integer" }),
  figure: nullable({ type: "string", enum: [...FIGURE_KINDS] }),
  numbers: { type: "array", items: VALUE_SCHEMA },
  places: nullable({ type: "array", items: { type: "string", enum: [...PLACE_ORDER] } }),
  direction: nullable({ type: "string", enum: ["up", "down"] }),
  sequence: nullable(object({ start: VALUE_SCHEMA, step: VALUE_SCHEMA, terms: { type: "integer" }, blanks: { type: "array", items: { type: "integer" } } })),
  pattern: nullable(object({ core: { type: "array", items: { type: "string", enum: [...PATTERN_SHAPES] } }, shapes: { type: "integer" }, blank: { type: "integer" } })),
  relation: nullable(object({ kind: { type: "string", enum: [...RELATIONS] }, to: { type: "array", items: { type: "integer" } }, labels: { type: "array", items: { type: "string" } } })),
  figureShows: nullable({ type: "string", enum: ["part", "total"] }),
  name: nullable({ type: "string" }),
  thing: nullable({ type: "string" }),
});

/** The output schema of one page or redo call: the filled slots. Content only: no field sets a layout. */
export const ITEMS_SCHEMA = object({ items: { type: "array", items: ITEM_SCHEMA } });

// ---------- From the AI's fields to the package's ----------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A value with only the fields its type uses; the checker judges it. */
function valueFrom(raw: unknown): unknown {
  if (!isObject(raw)) return raw;
  switch (raw.type) {
    case "number":
      return { type: "number", value: raw.value };
    case "fraction":
      return { type: "fraction", numerator: raw.numerator, denominator: raw.denominator };
    case "mixed":
      return { type: "mixed", whole: raw.whole, numerator: raw.numerator, denominator: raw.denominator };
    case "quantity":
      return { type: "quantity", value: raw.value, unit: raw.unit };
    case "compound":
      return { type: "compound", parts: Array.isArray(raw.parts) ? raw.parts.map((p) => (isObject(p) ? { value: p.value, unit: p.unit } : p)) : raw.parts };
    case "time":
      return { type: "time", hours: raw.hours, minutes: raw.minutes, period: raw.period ?? null };
    case "text":
      return { type: "text", value: raw.text };
    default:
      return { type: raw.type };
  }
}

/** An operation in the package's shape, from the AI's fields; the checker judges it. */
function operationFrom(raw: unknown): unknown {
  if (!isObject(raw) || typeof raw.kind !== "string") return raw;
  const operands = Array.isArray(raw.operands) ? raw.operands : [];
  const op: Record<string, unknown> = { kind: raw.kind };
  if (NUMBER_KINDS.includes(raw.kind)) op.operands = operands.map((o) => (isObject(o) ? o.value : o));
  else if (EXPRESSION_KINDS.includes(raw.kind)) op.operands = [raw.expression];
  else if (raw.kind === "quantity-multiply") op.operands = [valueFrom(operands[0]), isObject(operands[1]) ? operands[1].value : operands[1]];
  else op.operands = operands.map(valueFrom);
  if (raw.kind === "fraction-equivalent") op.denominator = raw.denominator;
  if (raw.unit !== null && raw.unit !== undefined) op.unit = raw.unit;
  if (raw.kind === "evaluate" && Array.isArray(raw.values) && raw.values.length > 0) {
    op.values = Object.fromEntries(raw.values.filter(isObject).map((v) => [v.name, v.value]));
  }
  return op;
}

/** The sign a Mixed set item ticks, computed from the operation's kind; null for a kind with no one sign. */
function signOf(kind: OperationKind): string | null {
  if (/(^|-)add$/.test(kind)) return "+";
  if (/(^|-)subtract$/.test(kind)) return "−";
  if (/(^|-)multiply$/.test(kind)) return "×";
  if (/(^|-)divide$/.test(kind)) return "÷";
  return null;
}
const SIGNS = ["+", "−", "×", "÷"];

/** The item of an operation format, its answers computed by code from the operation's answer. */
function itemFor(format: GeneratedFormat, op: Operation, answer: AnswerValue, shown: WrongAnswer | null, signs: readonly string[]): Item | string {
  const box: AnswerRegion = { id: "answer", kind: "box", label: null, answer };
  const onAnswer: ItemCheck = { kind: "operation", region: "answer" };
  const base = { format, scorable: true, parentChecked: false, error: null };
  switch (format) {
    case "write-number":
      return defaultItem(answer);
    case "show-work":
      return { ...base, format, regions: [box, { id: "work", kind: "work", label: "Show your work" }], checks: [onAnswer] };
    case "two-ways":
      return {
        ...base, format,
        regions: [{ id: "method-1", kind: "work", label: "Method 1" }, { id: "method-2", kind: "work", label: "Method 2" }, box],
        checks: [onAnswer],
      };
    case "number-line":
      // The child draws the hops on the line, then writes where they land.
      return { ...base, format, regions: [{ id: "line", kind: "picture", label: null }, box], checks: [onAnswer] };
    case "tick-and-number": {
      const sign = signOf(op.kind);
      if (!sign) return "a Mixed set item needs an operation with +, −, × or ÷";
      return {
        ...base, format,
        regions: [
          { id: "operation", kind: "choice", mark: "tick", label: "Tick the operation", choices: SIGNS.filter((x) => x === sign || signs.includes(x)), answer: sign },
          { ...box, label: "Write the answer" },
          { id: "work", kind: "work", label: "Show your work" },
        ],
        checks: [{ kind: "operation-sign", region: "operation" }, onAnswer],
      };
    }
    case "spot-the-error":
      if (!shown) return "a spot-the-error item needs the wrong answer it shows";
      return {
        ...base, format,
        regions: [
          { id: "right", kind: "choice", mark: "tick", label: "Is it right?", choices: ["Yes", "No"], answer: "No" },
          { ...box, id: "fix", label: "Fix it" },
        ],
        checks: [
          { kind: "yes-no", statement: { kind: "shown-answer" }, region: "right", yes: "Yes", no: "No" },
          { kind: "operation", region: "fix" },
        ],
        error: { answer: shown.value, step: shown.step },
      };
    default:
      return `a ${format} item has no operation`;
  }
}

// ---------- Figures, drawn by code ----------

/** A whole number from 0, or null. */
const whole = (n: unknown): number | null => (Number.isSafeInteger(n) && (n as number) >= 0 ? (n as number) : null);

/**
 * A number line through every number: from 0 to 10 or 20 when every number is that small; else a tick every 1, 2, 5,
 * 10, 20, 50 or 100 (the first that gives at most 20 steps), its ends on a multiple of 10 ticks (38 and 43: 30 to 50).
 * A reason when a number is not a whole number from 0.
 */
function lineThrough(values: number[]): Figure | string {
  if (values.length === 0 || values.some((v) => whole(v) === null)) return "a number line shows whole numbers from 0 only";
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi <= 20) return { kind: "number-line", from: 0, to: hi <= 10 ? 10 : 20, step: 1 };
  for (const step of [1, 2, 5, 10, 20, 50, 100]) {
    const end = step * 10;
    const from = Math.floor(lo / end) * end;
    const to = Math.max(Math.ceil(hi / end) * end, from + end);
    if ((to - from) / step <= 20 && to <= 10000) return { kind: "number-line", from, to, step };
  }
  return "the numbers are too far apart for one number line";
}

/**
 * What a missing part's picture shows when the text says it ("Ten-frame: 7 dots. How many more make 10?" shows the part,
 * 7; "8 dots. 5 and how many more?" the total, 8): the text is explicit, so it decides over the AI's figureShows. Null
 * when the text says no number of the picture, or for another operation.
 */
function shownBy(text: unknown, op: Operation): "part" | "total" | null {
  if (op.kind !== "missing-addend" || typeof text !== "string") return null;
  const said = [
    ...[...text.matchAll(/\b(\d+)\s+(?:dots?|counters?|filled)\b/gi)].map((m) => Number(m[1])),
    ...[...text.matchAll(/\b(?:ten|five)-frame(?:\s+(?:has|shows|with))?:?\s+(\d+)\b/gi)].map((m) => Number(m[1])),
  ];
  const [part, total] = op.operands;
  if (said.includes(part) && !said.includes(total)) return "part";
  if (said.includes(total) && !said.includes(part)) return "total";
  return null;
}

/** The figure of an operation question: the operation's numbers drawn as the kind the AI named. */
function operationFigure(kind: FigureKind, op: Operation, answer: AnswerValue, shows: unknown = null): Figure | string {
  if (op.kind === "missing-addend") {
    const [part, total] = op.operands;
    if (kind === "number-line") return lineThrough([part, total]);
    // The item says what its picture shows (#380): the part given ("Mia has 3. How many more make 8?") or the total
    // ("Ten-frame: 8 dots. 5 and how many more?"). Never guessed.
    if (shows !== "part" && shows !== "total") return "say what the picture of a missing part shows: figureShows part (the part given) or total";
    const n = shows === "part" ? part : total;
    if (kind === "dots") return { kind: "dots", groups: [n], takenAway: 0 };
    if (kind === "ten-frame") return { kind: "ten-frame", counters: [n] };
    return `a missing part draws dots, a ten-frame or a number line, not ${kind}`;
  }
  if (op.kind !== "add" && op.kind !== "subtract" && op.kind !== "multiply") return `code draws a picture only for +, − and × of whole numbers, not ${op.kind}`;
  const [a, b] = op.operands;
  if (whole(a) === null || whole(b) === null) return "code draws a picture only for whole numbers";
  switch (kind) {
    case "dots":
      if (op.kind === "add") return { kind: "dots", groups: [a, b], takenAway: 0 };
      if (op.kind === "subtract") return { kind: "dots", groups: [a], takenAway: b };
      return { kind: "dots", groups: Array.from({ length: a }, () => b), takenAway: 0 };
    case "ten-frame":
      if (op.kind === "multiply") return "a ten-frame shows + or −, not ×";
      return { kind: "ten-frame", counters: op.kind === "add" ? [a, b] : [a] };
    case "array":
      return op.kind === "multiply" ? { kind: "array", rows: a, columns: b } : "an array shows ×, not + or −";
    case "base-ten":
      if (op.kind === "multiply") return "base-ten blocks show + or −, not ×";
      return a < 1000 ? { kind: "base-ten", hundreds: Math.floor(a / 100), tens: Math.floor(a / 10) % 10, ones: a % 10 } : "base-ten blocks show numbers to 999";
    case "number-line":
      return answer.type === "number" ? lineThrough([a, answer.value]) : "a number line shows a whole-number answer";
  }
}

/** The figure of one number (a places item): base-ten blocks, a ten-frame, dots or a number line. */
function numberFigure(kind: FigureKind, n: number): Figure | string {
  const w = whole(n);
  switch (kind) {
    case "base-ten":
      return w !== null && w < 1000 ? { kind: "base-ten", hundreds: Math.floor(w / 100), tens: Math.floor(w / 10) % 10, ones: w % 10 } : "base-ten blocks show whole numbers to 999";
    case "ten-frame":
      // One number is one part, in one colour (a second frame fills past 10).
      return w !== null && w <= 20 ? { kind: "ten-frame", counters: [w] } : "a ten-frame shows whole numbers to 20";
    case "dots":
      return w !== null && w <= 20 ? { kind: "dots", groups: [w], takenAway: 0 } : "a dots picture shows whole numbers to 20";
    case "number-line":
      return lineThrough([n]);
    case "array":
      return "an array shows ×, not one number";
  }
}

/** The figure of a count item: the AI's counts drawn as the kind it named. */
function countFigure(kind: FigureKind, counts: number[]): Figure | string {
  if (counts.some((c) => whole(c) === null)) return "a count picture's numbers are whole numbers from 0";
  switch (kind) {
    case "dots":
      return { kind: "dots", groups: counts, takenAway: 0 };
    case "ten-frame":
      return { kind: "ten-frame", counters: counts };
    case "base-ten":
      return counts.length === 3 ? { kind: "base-ten", hundreds: counts[0], tens: counts[1], ones: counts[2] } : "base-ten blocks need 3 numbers: hundreds, tens and ones";
    case "array":
      return counts.length === 2 ? { kind: "array", rows: counts[0], columns: counts[1] } : "an array needs 2 numbers: rows and columns";
    case "number-line":
      return "a count item draws dots, a ten-frame, base-ten blocks or an array";
  }
}

// ---------- Formats with no operation ----------

/** A number from the AI's value; the checker judges its form. */
const numberValue = (raw: unknown): NumberValue => valueFrom(raw) as NumberValue;

/** A number value as a JavaScript number, for sorting only: the item check compares exactly. */
function approx(v: NumberValue): number {
  switch (v.type) {
    case "number":
      return v.value;
    case "fraction":
      return v.numerator / v.denominator;
    case "mixed":
      return v.whole + v.numerator / v.denominator;
  }
}

const isNumberValue = (v: unknown): v is NumberValue =>
  isObject(v) && (v.type === "number" ? Number.isFinite(v.value) : (v.type === "fraction" || v.type === "mixed") && Number.isSafeInteger(v.numerator) && Number.isSafeInteger(v.denominator) && (v.denominator as number) > 0);

const regionId = (place: Place) => place.replace(/ /g, "-");

/** How many of `place` a number has: the largest place asked takes all of them (347 is 34 tens), the others a digit. */
function placeCounts(n: number, places: Place[]): { place: Place; count: number }[] | string {
  const w = written(n, 3);
  if (!w || n >= 10000000) return "a places item needs a number from 0 to 9999999.999 with at most 3 decimal places";
  const thousandths = w.scaled * 10 ** (3 - w.places);
  const column = (p: Place) => PLACE_ORDER.indexOf(p);
  const sorted = [...places].sort((a, b) => column(b) - column(a));
  return sorted.map((place, i) => {
    const above = Math.floor(thousandths / 10 ** column(place));
    return { place, count: i === 0 ? above : above % 10 };
  });
}

/** Every place of a number, from its largest digit down to its last decimal place (ones at least). */
function allPlaces(n: number): Place[] {
  const w = written(n, 3);
  if (!w) return ["ones"];
  const thousandths = w.scaled * 10 ** (3 - w.places);
  const lowest = 3 - w.places;
  let highest = 3;
  while (highest + 1 < PLACE_ORDER.length && thousandths >= 10 ** (highest + 1)) highest++;
  return PLACE_ORDER.slice(Math.min(lowest, 3), highest + 1).reverse();
}

/** A choice region marked as the level's children mark: a circle at U1 to U3 (parent-led), else a tick. */
function choiceItem(level: number, id: string, choices: string[], answer: string, check: ItemCheck): Item {
  const circle = level <= 3;
  return {
    format: circle ? "circle" : "tick-one", scorable: true, parentChecked: false,
    regions: [{ id, kind: "choice", mark: circle ? "circle" : "tick", label: null, choices, answer }],
    checks: [check], error: null,
  };
}

/** Boxes as one item: one box is a write-number item, more are a boxes item. */
function boxesItem(boxes: AnswerRegion[], checks: ItemCheck[]): Item {
  return { format: boxes.length === 1 ? "write-number" : "boxes", scorable: true, parentChecked: false, regions: boxes, checks, error: null };
}

/** The item of a format with no operation, every answer computed by code from the AI's numbers; or why not. */
function numberItem(format: GeneratedFormat, raw: Record<string, unknown>, level: number, kind: FigureKind | null): Item | string {
  const numbers = Array.isArray(raw.numbers) ? raw.numbers.map(numberValue) : [];
  const withFigure = (item: Item, figure: Figure | string | null): Item | string => {
    if (typeof figure === "string") return figure;
    return figure ? { ...item, figure } : item;
  };
  switch (format) {
    case "places": {
      const n = numbers[0];
      if (numbers.length !== 1 || n?.type !== "number") return "a places item needs one number";
      const places = Array.isArray(raw.places) ? (raw.places as Place[]) : allPlaces(n.value);
      if (places.length === 0 || !places.every((p) => PLACE_ORDER.includes(p))) return "a places item needs places from the list";
      const counts = placeCounts(n.value, places);
      if (typeof counts === "string") return counts;
      const boxes: AnswerRegion[] = counts.map((c) => ({ id: regionId(c.place), kind: "box", label: c.place, answer: { type: "number", value: c.count } }));
      const item = boxesItem(boxes, [{ kind: "places", number: n.value, parts: counts.map((c) => ({ region: regionId(c.place), place: c.place })) }]);
      return withFigure(item, kind ? numberFigure(kind, n.value) : null);
    }
    case "order": {
      if (numbers.length < 2 || numbers.length > 12 || !numbers.every(isNumberValue)) return "an order item needs 2 to 12 numbers";
      // A parent-led card (U1 to U3) has room for a row of 4 answer boxes.
      if (level <= 3 && numbers.length > 4) return "an order item at U1 to U3 has 2 to 4 numbers: its card has room for 4 boxes in a row";
      const direction = raw.direction === "down" ? "down" : raw.direction === "up" ? "up" : null;
      if (!direction) return "an order item goes up or down";
      const sorted = [...numbers].sort((a, b) => approx(a) - approx(b));
      if (direction === "down") sorted.reverse();
      const ids = sorted.map((_, i) => `place-${i + 1}`);
      const item = boxesItem(sorted.map((v, i) => ({ id: ids[i], kind: "box", label: null, answer: v })), [{ kind: "order", numbers, direction, regions: ids }]);
      if (kind && kind !== "number-line") return "an order item draws a number line only";
      return withFigure(item, kind ? lineThrough(numbers.map(approx)) : null);
    }
    case "compare": {
      const [left, right] = numbers;
      if (numbers.length !== 2 || !isNumberValue(left) || !isNumberValue(right)) return "a compare item needs two numbers";
      const sign = approx(left) < approx(right) ? "<" : approx(left) > approx(right) ? ">" : "=";
      const item = choiceItem(level, "sign", ["<", ">", "="], sign, { kind: "compare", left, right, region: "sign" });
      if (!kind) return item;
      if (kind === "dots") return withFigure(item, whole(approx(left)) !== null && whole(approx(right)) !== null && left.type === "number" && right.type === "number"
        ? { kind: "dots", groups: [left.value, right.value], takenAway: 0 } : "a dots picture compares whole numbers");
      if (kind === "number-line") return withFigure(item, lineThrough([approx(left), approx(right)]));
      return "a compare item draws dots or a number line";
    }
    case "sequence": {
      const seq = isObject(raw.sequence) ? raw.sequence : null;
      const start = seq && numberValue(seq.start);
      const step = seq && numberValue(seq.step);
      if (!seq || start?.type !== "number" || step?.type !== "number") return "a sequence item needs a first number and a step";
      const terms = whole(seq.terms);
      const blanks = Array.isArray(seq.blanks) ? seq.blanks : [];
      if (terms === null || terms < 3 || terms > 20) return "a sequence item has 3 to 20 numbers";
      if (blanks.length === 0 || blanks.length >= terms || !blanks.every((b) => whole(b) !== null && (b as number) < terms) || new Set(blanks).size !== blanks.length) {
        return "a sequence item needs at least one blank and one printed number, each blank a different place in it";
      }
      // Exact to the thousandth: the terms are written decimals, never floating-point sums.
      const s = written(start.value, 3);
      const d = written(Math.abs(step.value), 3);
      if (!s || !d || step.value === 0) return "a sequence item starts at a number from 0 and steps by a number other than 0, each with at most 3 decimal places";
      const sign = step.value < 0 ? -1 : 1;
      const at = (i: number) => (s.scaled * 10 ** (3 - s.places) + sign * i * d.scaled * 10 ** (3 - d.places)) / 1000;
      const values = Array.from({ length: terms }, (_, i) => at(i));
      if (values.some((v) => v < 0)) return "a sequence item stays at 0 or above";
      const order = [...blanks].sort((a, b) => (a as number) - (b as number)) as number[];
      const id = (i: number) => `blank-${order.indexOf(i) + 1}`;
      const termList = values.map((v, i) => (order.includes(i) ? { region: id(i) } : { type: "number" as const, value: v }));
      const boxes: AnswerRegion[] = order.map((i) => ({ id: id(i), kind: "box", label: null, answer: { type: "number", value: values[i] } }));
      const item = boxesItem(boxes, [{ kind: "sequence", terms: termList, step }]);
      if (kind && kind !== "number-line") return "a sequence item draws a number line only";
      return withFigure(item, kind ? lineThrough(values) : null);
    }
    case "count": {
      if (!kind) return "a count item needs a picture to count";
      const counts = numbers.map((v) => (isObject(v) && v.type === "number" ? v.value : Number.NaN));
      const figure = countFigure(kind, counts);
      if (typeof figure === "string") return figure;
      const shown = figureCount(figure);
      if (shown === null) return "a count item needs a picture code can count";
      return { ...boxesItem([{ id: "answer", kind: "box", label: null, answer: { type: "number", value: shown } }], [{ kind: "count", region: "answer" }]), figure };
    }
    case "relation": {
      // "Is 7 less than 5?", "Is 8 close to 0 or to 10?", "Equal or not?", "Who has more?": the child circles one of
      // two choices code writes; the answer is computed from the numbers.
      const rel = isObject(raw.relation) ? raw.relation : null;
      const values = numbers.map((v) => (v?.type === "number" ? v.value : Number.NaN));
      if (!rel) return "a relation item needs its relation";
      const r = { relation: String(rel.kind), numbers: values, to: rel.to, labels: Array.isArray(rel.labels) ? rel.labels : [] };
      const decided = relationChoices(r);
      if (typeof decided === "string") return decided;
      const check: ItemCheck = { kind: "relation", relation: r.relation as Relation, numbers: values, to: rel.to as number[], labels: r.labels as string[], region: "answer" };
      const item = choiceItem(level, "answer", decided.choices, decided.answer, check);
      if (!kind) return item;
      if (values.length === 1) return withFigure(item, numberFigure(kind, values[0]));
      if (kind === "dots") return withFigure(item, { kind: "dots", groups: values, takenAway: 0 });
      return "a relation of two numbers draws dots";
    }
    case "pattern": {
      const pattern = isObject(raw.pattern) ? raw.pattern : null;
      const core = pattern && Array.isArray(pattern.core) ? (pattern.core as PatternShape[]) : [];
      const length = whole(pattern?.shapes);
      const blank = whole(pattern?.blank);
      if (!pattern || core.length === 0 || length === null || blank === null) return "a pattern item needs a core, how many shapes it shows and the blank";
      const choices = [...new Set(core)];
      const item = choiceItem(level, "shape", choices, core[blank % core.length] ?? "", { kind: "pattern", region: "shape" });
      return { ...item, figure: { kind: "pattern", core, length, blank } };
    }
    default:
      return `a ${format} item needs an operation`;
  }
}

/** The item of a format a parent checks: writing lines (written-reason) or a picture to draw in (draw). */
function parentItem(format: "written-reason" | "draw"): Item {
  const regions: AnswerRegion[] = format === "draw" ? [{ id: "drawing", kind: "picture", label: null }] : [{ id: "reason", kind: "lines", label: "How do you know?" }];
  return { format, scorable: false, parentChecked: true, regions, checks: [], error: null };
}

/** Code's verdict on one question: checked, "not checked by code" with why, or failed with why. */
export type QuestionCheck =
  | { status: "checked" }
  | { status: "not-checked"; reason: string }
  | { status: "failed"; reason: string };

export interface BuiltQuestion {
  check: QuestionCheck;
  /** The package, when code could build one (also for a failed check, for the reviewer); else null. */
  package: QuestionPackage | null;
  /** The worked step ids of the AI's operation, when it is valid: the names a wrong answer's step may use. */
  stepIds: string[];
  /**
   * Code's sound wordings of the question, when code writes its text (round 7): the printed one first, then the others
   * the generator may print instead (so a page never asks one shape twice).
   */
  wordings?: string[];
}

/** Where a slot's question goes, and what the plan lets it be. */
export interface SlotPlace {
  /** The package's stable id. */
  id: string;
  workbookId: string;
  page: number;
  question: number;
  level: number;
  /** The skill ids the plan aims the slot at. */
  skills: readonly string[];
  /**
   * The operation signs the level has met, which a Mixed set offers to tick (+ always; −, × and ÷ from their first
   * levels). Absent: all four.
   */
  signs?: readonly string[];
  /** The most characters the question's text has room for, when code writes the text (a relation, round 6). */
  room?: number;
  /** Which of code's wordings a code-written text starts from (round 6): slots of one page take different ones. */
  variant?: number;
  /** What code words a whole-number question with at U1 to U9 (round 7); absent: code's defaults. */
  wording?: SlotWording;
}

/** What the plan gives code to word a slot's whole-number question with (round 7). */
export interface SlotWording {
  /** The planned person and thing, and the ones the AI may choose instead (the planned ones among them). */
  name: string;
  thing: string;
  names: readonly string[];
  things: readonly string[];
  /** The kinds of question to word it as, best first. */
  kinds: readonly WordingKind[];
  /** A skill about 1 (or 2) more and less. */
  step: boolean;
  /** The skill has met subtraction. */
  subtraction: boolean;
  /** The slot's planned wording and what it works. */
  planned?: { say: string; operation: { kind: string; operands: number[] }; figure: string | null } | null;
}

/** People code names when the plan gives none: never Sam (Spot the error's child). */
const DEFAULT_NAMES = ["Mia", "Ben", "Ava", "Leo", "Lia", "Tom"];
const DEFAULT_THINGS = ["shells", "apples", "cars", "stickers", "hats", "cups"];

/** A question whose printed text code writes (round 7): a whole-number +, -, missing part, × or ÷ at U1 to U9. */
export const isCodeWorded = (p: QuestionPackage) => p.level <= 9 && isWorded(p.operation);

const fail = (reason: string, pkg: QuestionPackage | null = null, stepIds: string[] = []): BuiltQuestion => ({ check: { status: "failed", reason }, package: pkg, stepIds });

/** The standard (BC code) a skill id belongs to, or null. */
const standardOf = (skill: string) => BC_SKILL_MAP.standards.find((s) => s.skills.some((k) => k.id === skill))?.code ?? null;

/**
 * One slot's question: the AI's item made into a package with code's answer, steps, easier example answer and item,
 * then checked. Never throws: anything code cannot build is a failed question with the reason.
 */
export function buildQuestion(raw: unknown, place: SlotPlace): BuiltQuestion {
  try {
    const built = build(raw, place);
    if (built.check.status === "failed" || !built.package || !isObject(raw)) return built;
    const pkg = built.package;
    if (built.wordings) {
      // Code's wordings that pass every text check, the first printed (one always does: the bare sum).
      const sound = built.wordings.filter((w) => !kindProblem({ ...pkg, text: w }, raw));
      if (sound.length === 0) return fail(kindProblem(pkg, raw)!, pkg, built.stepIds);
      return { ...built, package: { ...pkg, text: sound[0] }, wordings: sound };
    }
    const problem = kindProblem(pkg, raw);
    return problem ? fail(problem, pkg, built.stepIds) : built;
  } catch (e) {
    return fail(`code could not build the question: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function build(raw: unknown, place: SlotPlace): BuiltQuestion {
  if (!isObject(raw)) return fail("the AI wrote nothing for this question");
  // A parent-led card (U1 to U3) has no work box: a show-work item there is a write-number item (#380).
  const format = (place.level <= 3 && raw.format === "show-work" ? "write-number" : raw.format) as GeneratedFormat;
  if (!GENERATED_FORMATS.includes(format)) return fail("the item format is not one the generator builds");
  if (typeof raw.skill !== "string" || !place.skills.includes(raw.skill)) return fail(`the skill ${String(raw.skill)} is not one the plan asks for here (${place.skills.join(", ")})`);
  const standard = standardOf(raw.skill);
  if (!standard) return fail(`the skill ${raw.skill} is not in the BC skill map`);
  const kind = raw.figure === null || raw.figure === undefined ? null : (raw.figure as FigureKind);
  if (kind !== null && !FIGURE_KINDS.includes(kind)) return fail("the picture is not a kind code draws");

  const pkg = (item: Item, op: Operation | null, wrongAnswers: WrongAnswer[], easierExample: QuestionPackage["easierExample"], text = raw.text as string): QuestionPackage => ({
    id: place.id,
    ref: { source: "workbook", workbookId: place.workbookId, page: place.page, question: place.question },
    templateId: null,
    text,
    item,
    answer: op ? { value: operationResult(op), accepted: [], unit: null } : null,
    operation: op,
    steps: op ? workedSteps(op) : [],
    skill: { standard, skills: [raw.skill as string] },
    level: place.level,
    difficulty: raw.difficulty as QuestionPackage["difficulty"],
    wrongAnswers,
    easierExample,
  });

  // No operation: the answers come from the item's numbers or figure (wrong answers and an easier example need one).
  if (!OPERATION_FORMATS.includes(format)) {
    if (format === "written-reason" || format === "draw") {
      if (kind !== null) return fail(`a ${format} item has no picture`);
      return checked(pkg(parentItem(format), null, [], null), []);
    }
    const item = numberItem(format, raw, place.level, kind);
    if (typeof item === "string") return fail(item);
    // A relation's text is code's (round 6, R380-11-1): written from the same numbers, benchmarks, kind and labels as
    // its choices and answer, so the printed question always asks what the answer key answers.
    const relation = item.checks.find((c) => c.kind === "relation");
    const text = relation ? pickWording(wordingsOf(relation), place.variant ?? place.question - 1, place.room) : raw.text as string;
    return checked(pkg(item, null, [], null, text), []);
  }

  if (raw.operation === null || raw.operation === undefined) return fail(`a ${format} item needs an operation code can compute`);
  const candidate = operationFrom(raw.operation);
  const problem = operationProblem(candidate);
  if (problem) return fail(`the operation: ${problem}`);
  const op = candidate as Operation;
  // Code writes the text of a whole-number question at U1 to U9 (round 7): the AI's words are not printed.
  const worded = place.level <= 9 && isWorded(op);
  // The box takes the operation's number, so the question must ask for that number, never yes or no or a choice.
  const asks = !worded && typeof raw.text === "string" ? choiceAsked(raw.text) : null;
  if (asks) return fail(`the question asks ${asks}, but its answer is the operation's number: ask for a number (How far is 8 from 10?), or use draw`);
  const answer = operationResult(op);
  const stepIds = workedSteps(op).map((s) => s.id);

  // A missing part has one worked step (the count): a wrong answer that names another is not one step (null, #380).
  // Up to U6 sums are counted on and back, not worked in columns: a step the sum does not have is not one step either.
  const stepOf = (step: unknown) => ((op.kind === "missing-addend" || place.level <= 6) && step !== null && !stepIds.includes(step as string) ? null : (step ?? null) as string | null);
  const wrongAnswers: WrongAnswer[] = Array.isArray(raw.wrongAnswers)
    ? raw.wrongAnswers.filter(isObject).map((w) => ({
      value: valueFrom(w.value) as AnswerValue, cause: w.cause as string, description: w.description as string, step: stepOf(w.step),
    }))
    : [];
  const shown = format === "spot-the-error" && typeof raw.shownWrong === "number" ? (wrongAnswers[raw.shownWrong] ?? null) : null;
  const built = itemFor(format, op, answer, shown, place.signs ?? SIGNS);
  if (typeof built === "string") return fail(built, null, stepIds);
  // A number line item always draws its line; another format draws the picture the AI named, if any.
  const figureKind = format === "number-line" ? "number-line" : kind;
  // Code's wording follows the picture, so a missing part's picture code words shows the part given unless the item says.
  const shows = worded ? (raw.figureShows ?? "part") : shownBy(raw.text, op) ?? raw.figureShows;
  const figure = figureKind ? operationFigure(figureKind, op, answer, shows) : null;
  if (typeof figure === "string") return fail(figure, null, stepIds);
  const item = figure ? { ...built, figure } : built;
  const wordings = worded ? wordingsFor(op, format, figure, raw, place) : [];
  const text = worded ? wordings[0] : raw.text as string;

  const easier = isObject(raw.easier) ? raw.easier : null;
  // A missing part's easier example has one less to count on, to a total one less (3 + ? = 4 for 3 + ? = 5): code
  // writes it when the AI's is missing or is not easier (#380). So does a sum or a take-away of two whole numbers
  // (round 5): one number smaller, so the answer differs (8 - 4: 7 - 4, then 8 - 3; never 6 - 2, which is 4 again).
  const ownEasiers = codeEasiers(op);
  const done = (b: BuiltQuestion): BuiltQuestion => (worded && b.check.status !== "failed" ? { ...b, wordings } : b);
  const own = (e: { text: string; operation: Operation }) => done(checked(pkg(item, op, wrongAnswers, { ...e, answer: operationResult(e.operation), steps: workedSteps(e.operation) }, text), stepIds));
  const firstOwn = () => ownEasiers.map(own).find((x) => x.check.status !== "failed") ?? null;
  if (!easier) return firstOwn() ?? fail("the question has no easier example", null, stepIds);
  const easierOp = operationFrom(easier.operation);
  const easierProblem = operationProblem(easierOp);
  if (easierProblem) return firstOwn() ?? fail(`the easier example's operation: ${easierProblem}`, null, stepIds);
  // The easier example's text names the numbers of its operation (round 6): one that names others is written by code
  // from the operation, so the text read to the child and the answer worked from the operation agree.
  // At U1 to U9 code writes it from its operation, as it writes the question (round 7).
  const easierText = !worded && typeof easier.text === "string" && !operationTextProblem(easier.text, easierOp as Operation, null) ? easier.text : operationQuestion(easierOp as Operation);
  const easierExample = {
    text: easierText,
    operation: easierOp as Operation,
    answer: operationResult(easierOp as Operation),
    steps: workedSteps(easierOp as Operation),
  };
  const result = done(checked(pkg(item, op, wrongAnswers, easierExample, text), stepIds));
  if (result.check.status === "failed" && /the easier example/.test(result.check.reason)) return firstOwn() ?? result;
  return result;
}

/**
 * Code's wordings of a whole-number question (round 7): with the slot's planned person and thing, or the ones the AI
 * chose from those code offered; as the kinds the plan gives, else as the AI's question reads (a story or a bare sum).
 */
function wordingsFor(op: Operation, format: GeneratedFormat, figure: Figure | null, raw: Record<string, unknown>, place: SlotPlace): string[] {
  const w = place.wording;
  const variant = place.variant ?? place.question - 1;
  const offered = (list: readonly string[] | undefined, chosen: unknown) => (typeof chosen === "string" && list?.includes(chosen) ? chosen : null);
  const name = offered(w?.names, raw.name) ?? w?.name ?? DEFAULT_NAMES[((variant % DEFAULT_NAMES.length) + DEFAULT_NAMES.length) % DEFAULT_NAMES.length];
  const thing = offered(w?.things, raw.thing) ?? w?.thing ?? DEFAULT_THINGS[((variant % DEFAULT_THINGS.length) + DEFAULT_THINGS.length) % DEFAULT_THINGS.length];
  const words = typeof raw.text === "string" && /[a-z]{3,}/i.test(raw.text);
  return codeWordings(op, {
    format, figure, name, thing,
    kinds: w?.kinds ?? (words ? ["story", "picture", "missing-part", "fact"] : ["fact", "missing-part"]),
    step: w?.step ?? false,
    subtraction: w?.subtraction ?? op.kind === "subtract",
    variant, room: place.room,
    // The planned wording names the planned person and thing.
    planned: w && name === w.name && thing === w.thing ? w.planned ?? null : null,
  });
}

/**
 * The easier examples code can write for an operation, best first: a missing part with one less to count on; a sum or
 * take-away of two whole numbers with one number smaller (the first, then the second), whose answer differs.
 */
function codeEasiers(op: Operation): { text: string; operation: Operation }[] {
  const [a, b] = op.operands as unknown[];
  if (op.operands.length !== 2 || !Number.isInteger(a) || !Number.isInteger(b)) return [];
  const [x, y] = [a as number, b as number];
  const make = (kind: "add" | "subtract" | "missing-addend", p: number, q: number) => {
    const operation = { ...op, kind, operands: [p, q] } as Operation;
    return { text: operationQuestion(operation), operation };
  };
  if (op.kind === "missing-addend") return y > x ? [make("missing-addend", x, y - 1)] : [];
  if (op.kind === "add") return [[x - 1, y], [x, y - 1]].filter(([p, q]) => p >= 0 && q >= 0 && p + q > 0).map(([p, q]) => make("add", p, q));
  // A take-away of nothing left (7 - 7) goes last.
  if (op.kind === "subtract") return [[x - 1, y], [x, y - 1]].filter(([p, q]) => q >= 0 && p >= q && p - q !== x - y).sort((m, n) => Number(m[0] === m[1]) - Number(n[0] === n[1])).map(([p, q]) => make("subtract", p, q));
  return [];
}

// ---------- A relation's wording, by code (round 6) ----------

const relationCheck = (c: ItemCheck): c is Extract<ItemCheck, { kind: "relation" }> => c.kind === "relation";
/** A label after a count: one cat, 2 cats. */
const counted = (n: number, label: string) => `${n} ${n === 1 && /[^s]s$/.test(label) ? label.slice(0, -1) : label}`;

/**
 * The wordings code writes for a relation question, from the same data as its choices and answer (round 6, R380-11-1):
 * "Is 7 less than 5?", "Is 8 close to 0 or to 10?", "Are 4 and 6 equal?", "Mia has 6. Ben has 9. Who has more?". Each
 * wording of a relation has its own words, so two relations of one page never read as one question twice.
 */
function wordingsOf(c: Extract<ItemCheck, { kind: "relation" }>): string[] {
  const [x, y] = c.numbers;
  switch (c.relation) {
    case "less-than": {
      const [b] = c.to;
      return [`Is ${x} less than ${b}?`, `${x}: less than ${b}, or not?`, `Look at ${x}. Is it less than ${b}?`, `Think of ${x}. Is it less than ${b}?`];
    }
    case "closer": {
      const [a, b] = c.to;
      return [`Is ${x} close to ${a} or to ${b}?`, `${x}: close to ${a} or close to ${b}?`, `Which is ${x} close to, ${a} or ${b}?`, `Look at ${x}. Close to ${a} or to ${b}?`];
    }
    case "equal":
      return [`Are ${x} and ${y} equal?`, `${x} and ${y}: equal or not?`, `Is ${x} equal to ${y}?`];
    case "more": case "fewer": {
      const [l, m] = c.labels;
      const word = c.relation;
      // Two names (capitalised) are people; else two things to count.
      if (/^[A-Z]/.test(l) && /^[A-Z]/.test(m)) {
        return [`${l} has ${x}. ${m} has ${y}. Who has ${word}?`, `${l}: ${x}. ${m}: ${y}. Who has ${word}?`, `${l} has ${x} and ${m} has ${y}. Who has ${word}?`];
      }
      return [`${counted(x, l)} and ${counted(y, m)}. Which group has ${word}?`, `${counted(x, l)}, ${counted(y, m)}. Circle the ${word}.`, `Look: ${counted(x, l)} and ${counted(y, m)}. Which has ${word}?`];
    }
  }
}

/** The wording at `variant` (in turn), or the next that fits the room; the shortest when none fits. */
function pickWording(wordings: string[], variant: number, room = Infinity): string {
  const n = wordings.length;
  const start = ((Math.trunc(variant) % n) + n) % n;
  const turn = Array.from({ length: n }, (_, i) => wordings[(start + i) % n]);
  return turn.find((w) => w.length <= room) ?? [...turn].sort((a, b) => a.length - b.length)[0];
}

/** Every wording code writes for a relation package's question, in turn from the first; empty for another package. */
export function relationWordings(p: QuestionPackage): string[] {
  const c = p.item?.checks.find(relationCheck);
  return c ? wordingsOf(c) : [];
}

// ---------- A text that names other numbers than its data (round 6) ----------

/** Whole-number operations whose operands the text names: a + b, a - b, a + ? = b, a × b, a ÷ b. */
const NAMED_KINDS: readonly string[] = ["add", "subtract", "missing-addend", "multiply", "divide"];

/** The numbers a text names, with "one more" and "one less" as 1 (the words a skill about them may use). */
const namedIn = (text: string) => [...readNumbers(text).map((r) => r.value), ...(/\bone (?:more|less)\b/i.test(text) ? [1] : [])];

/** The numbers a figure shows: each group or part, and all of them (and a ten-frame its 10 boxes). */
function figureShows(f: Figure | null | undefined): number[] {
  if (!f) return [];
  if (f.kind === "dots") return [...f.groups, f.groups.reduce((a, b) => a + b, 0)];
  // A ten-frame shows its size too: "How many boxes are empty?" works up to 10.
  if (f.kind === "ten-frame") return [...f.counters, f.counters.reduce((a, b) => a + b, 0), 10];
  const n = figureCount(f);
  return n === null ? [] : [n];
}

/**
 * Why a text and its whole-number operation disagree, or null (round 6): every number the operation works is in the
 * text or its picture, and (up to U9, where a question has no extra information) every number the text names is one the
 * operation works or its answer. A text that asks how many are left takes something away, and one that asks how many
 * in all puts together. "Gus finds 2 plums, then 5 more" worked as 2 + 6 would print 8 as the answer to 7.
 */
function operationTextProblem(text: string, op: Operation, figure: Figure | null, level = 1): string | null {
  if (!NAMED_KINDS.includes(op.kind) || !op.operands.every((x) => Number.isInteger(x))) return null;
  const operands = op.operands as number[];
  const said = namedIn(text);
  const opText = operationQuestion(op).replace(" = ?", "");
  const hint = `write the operation of the text's numbers (${op.kind === "missing-addend" ? "a missing part is [the part given, the total]" : "a take-away is [the start, the number taken]"})`;
  if (said.length > 0 || !figure) {
    const shown = new Set([...said, ...figureShows(figure)]);
    const missing = operands.filter((x) => !shown.has(x));
    if (missing.length > 0) return `the operation works ${opText}, but the text does not name ${[...new Set(missing)].join(" or ")}: ${hint}`;
  }
  const answer = operationResult(op);
  const value = answer.type === "number" ? answer.value : null;
  const extra = level <= 9 ? said.filter((x) => !operands.includes(x) && x !== value) : [];
  if (extra.length > 0) return `the text names ${[...new Set(extra)].join(" and ")}, but the operation works ${opText}: ${hint}`;
  if (/\bleft\b/i.test(text) && op.kind !== "subtract") return `the text asks how many are left, but the operation is ${opText}: a take-away is subtract [the start, the number taken]`;
  if (/\bin all\b|\baltogether\b/i.test(text) && op.kind === "subtract") return `the text asks how many in all, but the operation takes away (${opText}): putting together is add`;
  return null;
}

/** Up, down, or null: what an order text asks ("least to greatest", "greatest first", "biggest to smallest"). */
function orderAsked(text: string): "up" | "down" | null {
  const small = text.search(/\b(least|smallest|fewest|lowest)\b/i);
  const big = text.search(/\b(greatest|biggest|largest|most|highest)\b/i);
  if (small < 0 && big < 0) return null;
  if (big < 0) return "up";
  if (small < 0) return "down";
  return small < big ? "up" : "down";
}

/**
 * Why the text of a format with no operation disagrees with its data, or null (round 6): a compare text names its two
 * numbers in order, an order text the numbers to order and the direction its boxes take, a places text the number it
 * splits, and a sequence text its direction and step ("count back", "by 2s").
 */
function dataTextProblem(p: QuestionPackage): string | null {
  const text = p.text;
  const said = readNumbers(text).map((r) => r.value);
  for (const c of p.item?.checks ?? []) {
    switch (c.kind) {
      case "compare": {
        if (c.left.type !== "number" || c.right.type !== "number") break;
        const [l, r] = [c.left.value, c.right.value];
        if (said.length === 0 && !p.item?.figure) return `the text names no numbers to compare: write "Compare ${l} and ${r}."`;
        if (said.length > 0 && (said.length !== 2 || said[0] !== l || said[1] !== r)) return `the text names ${said.join(" and ")}, but the item compares ${l} with ${r}: name the two numbers in that order, left first`;
        break;
      }
      case "order": {
        const ns = c.numbers.map((v) => (v.type === "number" ? v.value : Number.NaN));
        const sort = (xs: number[]) => [...xs].sort((a, b) => a - b).join(",");
        if (said.length > 0 && ns.every(Number.isFinite) && sort(said) !== sort(ns)) return `the text names ${said.join(", ")}, but the numbers to order are ${ns.join(", ")}: name the same numbers, or none`;
        const asked = orderAsked(text);
        if (asked && asked !== c.direction) return `the text asks for ${asked === "up" ? "least" : "greatest"} first, but the boxes go ${c.direction === "up" ? "least" : "greatest"} first: make direction ${asked}`;
        break;
      }
      case "places":
        if (said.some((x) => x !== c.number)) return `the text names ${said.join(" and ")}, but the item splits ${c.number}: name only that number`;
        break;
      case "sequence": {
        if (c.step.type !== "number") break;
        const step = c.step.value;
        if (/\b(?:count(?:ing)?|skip-count|go(?:es)?)\s+(?:back|down|backward)/i.test(text) && step > 0) return "the text counts back, but the sequence goes up: give it a step below 0";
        if (/\bcount(?:ing)?\s+(?:on|up|forward)\b/i.test(text) && step < 0) return "the text counts up, but the sequence goes down: give it a step above 0";
        const by = text.match(/\bby\s+(\d+)s?\b/i);
        if (by && Number(by[1]) !== Math.abs(step)) return `the text counts by ${by[1]}, but the sequence steps by ${Math.abs(step)}: make them the same`;
        break;
      }
    }
  }
  return null;
}

/**
 * What the question asks when it is not a number, or null: its last question (the sentence that ends in "?") asks yes
 * or no ("Is 8 close to 10?", "Are they equal?") or for a choice between words ("close to 10 or less than 5?"). A
 * number answer with "or" between two numbers ("4 or 7?") is a choice too: the box would take the operation's number.
 */
export function choiceAsked(text: string): string | null {
  const questions = text.match(/[^.?!]*\?/g);
  const last = questions?.at(-1)?.trim() ?? "";
  if (!last) return null;
  if (/^(is|are|am|was|were|does|do|did|can|could|will|would|should|has|have)\b/i.test(last)) return "yes or no";
  if (/\bor\b/i.test(last)) return "for a choice";
  return null;
}

/**
 * Why the text and the picture disagree, or null (#380): a number the text says the picture shows ("8 dots",
 * "Ten-frame: 8", "a ten-frame shows 8", "5 filled") must be one of its groups or all of it.
 */
export function pictureProblem(text: string, f: Figure | null): string | null {
  if (!f || (f.kind !== "dots" && f.kind !== "ten-frame")) return null;
  const groups = f.kind === "dots" ? f.groups : f.counters;
  const shown = new Set([...groups, groups.reduce((a, b) => a + b, 0)]);
  const said = [
    ...[...text.matchAll(/\b(\d+)\s+(?:dots?|counters?|filled)\b/gi)].map((m) => Number(m[1])),
    ...[...text.matchAll(/\b(?:ten|five)-frame(?:\s+(?:has|shows|with))?:?\s+(\d+)\b/gi)].map((m) => Number(m[1])),
  ];
  const wrong = said.find((n) => !shown.has(n));
  return wrong === undefined ? null : `the text says the picture shows ${wrong}, but it shows ${[...new Set(groups)].join(" and ")}: make the picture show what the text says (for a missing part, figureShows total or part)`;
}

/** "Count from 1 to 10", "count back from 10 to 1": the start and the end the text states. */
const COUNT_FROM_TO = /\bcount(?:\s+(?:on|up|back|down))?\s+from\s+(\d+)\s+to\s+(\d+)/i;
const START_AT = /\bstart(?:ing)?\s+at\s+(\d+)/i;

/**
 * Why the item's kind does not fit its text, or null (#380, round 3): a count from one number to another is a sequence
 * whose first and last terms are those numbers (and one that says where to start starts there); and a question never
 * gives its own answer: an operation that adds or takes away 0 hands back a number the text gives, and an answer printed
 * in the text that is not one of the numbers worked with is given away.
 */
export function kindProblem(p: QuestionPackage, raw: Record<string, unknown>): string | null {
  const text = p.text;
  const fromTo = text.match(COUNT_FROM_TO);
  const seq = isObject(raw.sequence) ? raw.sequence : null;
  if (fromTo) {
    if (p.item?.format !== "boxes" && p.item?.format !== "write-number" || !p.item.checks.some((c) => c.kind === "sequence") || !seq) {
      return `"${fromTo[0]}" is a count: write it as the sequence format, from ${fromTo[1]} to ${fromTo[2]}, with blanks to fill`;
    }
  }
  if (seq && p.item?.checks.some((c) => c.kind === "sequence")) {
    const start = (seq.start as { value?: unknown } | null)?.value;
    const step = (seq.step as { value?: unknown } | null)?.value;
    const terms = seq.terms;
    if (typeof start === "number" && typeof step === "number" && typeof terms === "number") {
      const last = start + (terms - 1) * step;
      if (fromTo && (Number(fromTo[1]) !== start || Number(fromTo[2]) !== last)) {
        return `the text counts from ${fromTo[1]} to ${fromTo[2]}, but the sequence goes from ${start} to ${last}: make them the same`;
      }
      const at = text.match(START_AT);
      if (at && Number(at[1]) !== start) return `the text starts at ${at[1]}, but the sequence starts at ${start}: make them the same`;
    }
    return dataTextProblem(p);
  }
  const pictured = pictureProblem(text, p.item?.figure ?? null);
  if (pictured) return pictured;
  // A draw item asks the child to draw (a parent checks it), never for a number or a name.
  if (p.item?.format === "draw") {
    if (!/\b(draw|colour|color|circle|show|make|put|line up|trace)\b/i.test(text)) return "a draw item asks the child to draw: say what to draw, or use another format (a relation for 'who has more?')";
    if (/\bhow many\b|\bwho\b|\bwhich number\b|\bwhat number\b/i.test(text)) return "a draw item asks for no number or name: ask for the number in a write-number item, or for which has more in a relation item";
  }
  if (p.item?.checks.some((c) => c.kind === "order") && !/\border\b|\bleast\b|\bgreatest\b|\bsmallest\b|\bbiggest\b|\blargest\b/i.test(text)) {
    return "an order item asks to put the numbers in order (least first, or greatest first): ask that, or use another format";
  }
  const op = p.operation;
  // Code's own wording names the 0 (round 7), but adding or taking away 0 still hands back a number it gives.
  if (op && (op.kind === "add" || op.kind === "subtract") && op.operands.includes(0) && (isCodeWorded(p) || !/\bzero\b|\b0\b/.test(text))) {
    return "adding or taking away 0 gives back a number the question already says: ask for a number the child works out";
  }
  const answer = p.answer?.value ?? null;
  const counted = p.item?.checks.some((c) => c.kind === "count") ? p.item.checks : null;
  const value = answer?.type === "number" ? answer.value : counted && p.item?.figure ? figureCount(p.item.figure) : null;
  if (value !== null && (op || counted)) {
    const given = readNumbers(text).map((r) => r.value);
    const worked = op ? (op.operands as unknown[]).filter((x): x is number => typeof x === "number") : [];
    if (given.includes(value) && !worked.includes(value)) return `the question gives its own answer (${value}) in its text: ask for it instead`;
  }
  // The text names the numbers its data works (round 6): the answer key answers the printed question.
  if (op) return operationTextProblem(text, op, p.item?.figure ?? null, p.level);
  return dataTextProblem(p);
}

/** The checker's verdict on a built package. */
function checked(pkg: QuestionPackage, stepIds: string[]): BuiltQuestion {
  const check = checkQuestionPackage(pkg);
  switch (check.status) {
    case "checked":
      return { check: { status: "checked" }, package: pkg, stepIds };
    case "not-checked":
    case "unsupported":
      return { check: { status: "not-checked", reason: check.reason }, package: pkg, stepIds };
    case "failed":
      return fail(check.reason, pkg, stepIds);
  }
}
