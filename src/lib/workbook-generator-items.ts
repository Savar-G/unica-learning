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
// Pure TypeScript: no Next.js, React, network, database, clock or randomness.
import { BC_SKILL_MAP } from "@/lib/assessment";
import { defaultItem, figureCount } from "@/lib/question-package-items";
import { PLACE_ORDER, written } from "@/lib/question-package-columns";
import {
  checkQuestionPackage,
  PATTERN_SHAPES,
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
  type QuestionPackage,
  type WrongAnswer,
} from "@/lib/question-package";

// ---------- What the AI writes ----------

/** The item formats the generator builds. */
export const GENERATED_FORMATS = [
  "write-number", "show-work", "two-ways", "tick-and-number", "spot-the-error", "number-line",
  "places", "order", "compare", "sequence", "count", "pattern",
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
  "add", "subtract", "multiply", "divide", "decimal-add", "decimal-subtract", "decimal-multiply",
  "fraction-add", "fraction-subtract", "fraction-multiply", "fraction-divide", "fraction-simplify", "fraction-equivalent",
  "convert", "quantity-add", "quantity-subtract", "quantity-multiply", "money-round", "elapsed-time", "time-add",
  "clock-convert", "evaluate", "solve",
] as const satisfies readonly OperationKind[];
const ALL_KINDS: Exclude<OperationKind, (typeof OPERATION_KINDS)[number]> extends never ? true : false = true;
void ALL_KINDS;

/** Kinds whose operands are plain numbers. */
const NUMBER_KINDS: readonly string[] = ["add", "subtract", "multiply", "divide", "decimal-add", "decimal-subtract", "decimal-multiply"];
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

/** The figure of an operation question: the operation's numbers drawn as the kind the AI named. */
function operationFigure(kind: FigureKind, op: Operation, answer: AnswerValue): Figure | string {
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
      return w !== null && w <= 20 ? { kind: "ten-frame", counters: w <= 10 ? [w] : [10, w - 10] } : "a ten-frame shows whole numbers to 20";
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
}

const fail = (reason: string, pkg: QuestionPackage | null = null, stepIds: string[] = []): BuiltQuestion => ({ check: { status: "failed", reason }, package: pkg, stepIds });

/** The standard (BC code) a skill id belongs to, or null. */
const standardOf = (skill: string) => BC_SKILL_MAP.standards.find((s) => s.skills.some((k) => k.id === skill))?.code ?? null;

/**
 * One slot's question: the AI's item made into a package with code's answer, steps, easier example answer and item,
 * then checked. Never throws: anything code cannot build is a failed question with the reason.
 */
export function buildQuestion(raw: unknown, place: SlotPlace): BuiltQuestion {
  try {
    return build(raw, place);
  } catch (e) {
    return fail(`code could not build the question: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function build(raw: unknown, place: SlotPlace): BuiltQuestion {
  if (!isObject(raw)) return fail("the AI wrote nothing for this question");
  const format = raw.format as GeneratedFormat;
  if (!GENERATED_FORMATS.includes(format)) return fail("the item format is not one the generator builds");
  if (typeof raw.skill !== "string" || !place.skills.includes(raw.skill)) return fail(`the skill ${String(raw.skill)} is not one the plan asks for here (${place.skills.join(", ")})`);
  const standard = standardOf(raw.skill);
  if (!standard) return fail(`the skill ${raw.skill} is not in the BC skill map`);
  const kind = raw.figure === null || raw.figure === undefined ? null : (raw.figure as FigureKind);
  if (kind !== null && !FIGURE_KINDS.includes(kind)) return fail("the picture is not a kind code draws");

  const pkg = (item: Item, op: Operation | null, wrongAnswers: WrongAnswer[], easierExample: QuestionPackage["easierExample"]): QuestionPackage => ({
    id: place.id,
    ref: { source: "workbook", workbookId: place.workbookId, page: place.page, question: place.question },
    templateId: null,
    text: raw.text as string,
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
    return checked(pkg(item, null, [], null), []);
  }

  if (raw.operation === null || raw.operation === undefined) return fail(`a ${format} item needs an operation code can compute`);
  const candidate = operationFrom(raw.operation);
  const problem = operationProblem(candidate);
  if (problem) return fail(`the operation: ${problem}`);
  const op = candidate as Operation;
  const answer = operationResult(op);
  const stepIds = workedSteps(op).map((s) => s.id);

  const wrongAnswers: WrongAnswer[] = Array.isArray(raw.wrongAnswers)
    ? raw.wrongAnswers.filter(isObject).map((w) => ({
      value: valueFrom(w.value) as AnswerValue, cause: w.cause as string, description: w.description as string, step: (w.step ?? null) as string | null,
    }))
    : [];
  const shown = format === "spot-the-error" && typeof raw.shownWrong === "number" ? (wrongAnswers[raw.shownWrong] ?? null) : null;
  const built = itemFor(format, op, answer, shown, place.signs ?? SIGNS);
  if (typeof built === "string") return fail(built, null, stepIds);
  // A number line item always draws its line; another format draws the picture the AI named, if any.
  const figureKind = format === "number-line" ? "number-line" : kind;
  const figure = figureKind ? operationFigure(figureKind, op, answer) : null;
  if (typeof figure === "string") return fail(figure, null, stepIds);
  const item = figure ? { ...built, figure } : built;

  const easier = isObject(raw.easier) ? raw.easier : null;
  if (!easier) return fail("the question has no easier example", null, stepIds);
  const easierOp = operationFrom(easier.operation);
  const easierProblem = operationProblem(easierOp);
  if (easierProblem) return fail(`the easier example's operation: ${easierProblem}`, null, stepIds);
  const easierExample = {
    text: easier.text as string,
    operation: easierOp as Operation,
    answer: operationResult(easierOp as Operation),
    steps: workedSteps(easierOp as Operation),
  };
  return checked(pkg(item, op, wrongAnswers, easierExample), stepIds);
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
