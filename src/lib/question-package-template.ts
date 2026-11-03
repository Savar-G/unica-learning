// The template source of a workbook question (#489): the step template a question was filled from, kept beside its
// answer so the checker recomputes the answer from the sampled numbers, never from the printed words. The numbers are
// the template's slots as code sampled them, each with the step's range it was drawn from; the answer, the derived
// values and the check are the template's own expressions, run by the safe expression evaluator
// (src/lib/workbook-curriculum/expression.ts). Pure TypeScript: no Next.js, React, network, database or clock.
import { compileExpression, decimalValue, EvaluationBudget, expressionIsTrue, formatValue, type ExpressionValue } from "@/lib/workbook-curriculum/expression";
import { domainContains, domainProblems } from "@/lib/workbook-curriculum/template";
import type { NumberDomain } from "@/lib/workbook-curriculum/types";

/** A step's range or list as stored with a question: plain data, a copy of the step's. */
export type StoredDomain = { min: number; max: number; decimal_places?: number; values?: number[] } | (number | string)[];

/** A copy of a step's range or list, to store. */
export function storedDomain(d: NumberDomain): StoredDomain {
  if (Array.isArray(d)) return [...d];
  const r = d as { min: number; max: number; decimal_places?: number; values?: readonly number[] };
  return { min: r.min, max: r.max, ...(r.decimal_places !== undefined ? { decimal_places: r.decimal_places } : {}), ...(r.values ? { values: [...r.values] } : {}) };
}

/** A sampled value: a whole number, an exact decimal (both as written) or a word. */
export type TemplateScalar = { int: string } | { dec: string } | { text: string };

export interface TemplateSource {
  /** The answer expression, for example "s - c". */
  answer: string;
  /** The template's check, or null: the sampled values must pass it. */
  check: string | null;
  /** The derived values in order: [name, expression]. */
  derived: [string, string][];
  /** Each sampled slot: its name, its value and the step's range or list it was drawn from. */
  slots: { name: string; value: TemplateScalar; domain: StoredDomain }[];
  /** The step's `values` list, when the template reads it. */
  values: TemplateScalar[] | null;
  /**
   * The words a word answer prints as, when the template's answer names a person ("'name' if a > b else 'friend'"):
   * [answer, printed], for example ["name", "Zara"], ["friend", "the friend"].
   */
  labels?: [string, string][] | null;
}

const SOURCE_TEXT = 2000;
const MOST_SLOTS = 24;

/** A sampled value as the template filler holds it, tagged for storage; null for a value no slot can take. */
export function templateScalar(v: ExpressionValue): TemplateScalar | null {
  if (typeof v === "bigint") return { int: v.toString() };
  if (typeof v === "string") return { text: v };
  if (typeof v === "object" && v !== null && "denominator" in v) {
    const text = formatValue(v);
    return /^-?\d+(?:\.\d+)?$/.test(text) ? { dec: text } : null;
  }
  return null;
}

function scalarValue(s: TemplateScalar, budget: EvaluationBudget): ExpressionValue {
  if ("int" in s) return BigInt(s.int);
  if ("dec" in s) return decimalValue(s.dec, budget);
  return s.text;
}

const scalarOk = (s: unknown): s is TemplateScalar => {
  if (!s || typeof s !== "object" || Array.isArray(s)) return false;
  const keys = Object.keys(s);
  if (keys.length !== 1) return false;
  const v = (s as Record<string, unknown>)[keys[0]];
  if (typeof v !== "string" || v.length > 80) return false;
  return keys[0] === "int" ? /^-?\d{1,18}$/.test(v) : keys[0] === "dec" ? /^-?\d{1,18}(?:\.\d{1,12})?$/.test(v) : keys[0] === "text";
};
const text = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= SOURCE_TEXT;
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

/** What is wrong with a stored template source's shape, or null. */
export function templateSourceProblem(s: unknown): string | null {
  if (!s || typeof s !== "object" || Array.isArray(s)) return "the template source is not an object";
  const src = s as Record<string, unknown>;
  if (!text(src.answer)) return "the template source has no answer expression";
  if (src.check !== null && !text(src.check)) return "the template source's check is not an expression or null";
  if (!Array.isArray(src.derived) || src.derived.length > MOST_SLOTS || !src.derived.every((d) => Array.isArray(d) && d.length === 2 && typeof d[0] === "string" && NAME.test(d[0]) && text(d[1]))) return "the template source's derived values are not [name, expression] pairs";
  if (!Array.isArray(src.slots) || src.slots.length > MOST_SLOTS) return "the template source's slots are not a list";
  for (const slot of src.slots as unknown[]) {
    const x = slot as Record<string, unknown> | null;
    if (!x || typeof x.name !== "string" || !NAME.test(x.name) || !scalarOk(x.value)) return "a template slot needs a name and a sampled value";
    let problems: string[];
    try { problems = domainProblems(x.domain as NumberDomain); } catch { problems = ["invalid"]; }
    if (problems.length) return `the template slot ${x.name} has no valid range`;
  }
  if (src.values !== null && (!Array.isArray(src.values) || src.values.length > 64 || !src.values.every(scalarOk))) return "the template source's values are not a list of values";
  if (src.labels !== undefined && src.labels !== null && (!Array.isArray(src.labels) || src.labels.length > 4
    || !src.labels.every((l) => Array.isArray(l) && l.length === 2 && NAME.test(String(l[0])) && typeof l[1] === "string" && l[1].trim().length > 0 && l[1].length <= 40))) return "the template source's labels are not [answer, printed words] pairs";
  return null;
}

/**
 * The answer the template gives for its stored values, as the filler writes it ("11", "3/4", "true"), or why there is
 * none: a value outside its range, a check that does not pass, or an expression that cannot run.
 */
export function templateAnswer(src: TemplateSource): { answer: string } | { problem: string } {
  try {
    const budget = new EvaluationBudget();
    const values: Record<string, ExpressionValue> = Object.create(null);
    if (src.values) values.values = Object.freeze(src.values.map((v) => scalarValue(v, budget)));
    for (const slot of src.slots) {
      const v = scalarValue(slot.value, budget);
      if (!domainContains(slot.domain, v, budget)) return { problem: `the number ${formatValue(v, budget)} is outside its step's range for ${slot.name}` };
      values[slot.name] = v;
    }
    for (const [name, expression] of src.derived) values[name] = compileExpression(expression, budget).evaluate(values, budget);
    if (src.check && !expressionIsTrue(compileExpression(src.check, budget).evaluate(values, budget))) return { problem: "the sampled numbers do not pass the template's check" };
    const answer = formatValue(compileExpression(src.answer, budget).evaluate(values, budget), budget);
    return { answer: src.labels?.find(([key]) => key === answer)?.[1] ?? answer };
  } catch (e) {
    return { problem: `the template cannot be worked out: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** A template answer as a typed answer value: a number, a fraction, a mixed number, else words. */
export function templateAnswerValue(answer: string):
  | { type: "number"; value: number } | { type: "fraction"; numerator: number; denominator: number }
  | { type: "mixed"; whole: number; numerator: number; denominator: number } | { type: "text"; value: string } {
  if (/^-?\d+(?:\.\d+)?$/.test(answer)) return { type: "number", value: Number(answer) };
  const f = answer.match(/^(-?\d+)\/(\d+)$/);
  if (f) return { type: "fraction", numerator: Number(f[1]), denominator: Number(f[2]) };
  const m = answer.match(/^(\d+) (\d+)\/(\d+)$/);
  if (m) return { type: "mixed", whole: Number(m[1]), numerator: Number(m[2]), denominator: Number(m[3]) };
  return { type: "text", value: answer };
}
