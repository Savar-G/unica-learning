import { assertTemplateInput, assertContextInput, INPUT_LIMITS, limitError } from "./limits";
/** Standalone template API. The book writer does not call this module. */
import { compileExpression, EvaluationBudget, EVALUATION_LIMITS, decimalValue, DecimalValue, numericCompare, expressionIsTrue, formatFixed, formatValue, validName, type Bindings, type ExpressionValue } from "./expression";
import type { CurriculumStep, NumberDomain, NumberRange, StepTemplate, TemplateContexts } from "./types";
export type RandomSource = () => number;
export class TemplateError extends Error {
  constructor(message: string) { super(message); this.name = "TemplateError"; }
}
const fail = (message: string): never => { throw new TemplateError(message); };
/** Mulberry32, with an explicit 32-bit seed. Output is always in [0, 1). */
export function seededRandom(seed: number): RandomSource {
  if (!Number.isSafeInteger(seed)) fail("Seed must be a safe integer");
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ state >>> 15, state | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
function choose<T>(items: readonly T[], random: RandomSource): T {
  if (!items.length) fail("Cannot sample an empty list");
  const n = random();
  if (!Number.isFinite(n) || n < 0 || n >= 1) fail("Random source must return a number in [0, 1)");
  return items[Math.floor(n * items.length)];
}
function decimalPlaces(value: number): number {
  const [coefficient, exponent = "0"] = String(value).toLowerCase().split("e");
  return Math.max(0, (coefficient.split(".")[1]?.length ?? 0) - Number(exponent));
}
function grid(r: NumberRange, budget = new EvaluationBudget()): { scale: bigint; lo: bigint; hi: bigint; places: number } {
  const places = r.decimal_places ?? Math.max(decimalPlaces(r.min), decimalPlaces(r.max));
  if (!Number.isInteger(places) || places < 0 || places > 18) return fail("decimal_places must be an integer from 0 to 18");
  const scale = BigInt(10) ** BigInt(places), min = decimalValue(r.min, budget), max = decimalValue(r.max, budget);
  const floor = (n: bigint, d: bigint) => n / d - (n < BigInt(0) && n % d !== BigInt(0) ? BigInt(1) : BigInt(0));
  return { scale, lo: -floor(-min.numerator * scale, min.denominator), hi: floor(max.numerator * scale, max.denominator), places };
}
export function domainContains(domain: NumberDomain, value: ExpressionValue, budget = new EvaluationBudget()): boolean {
  const matches = (candidate: string | number) => typeof candidate === "string" ? value === candidate : typeof value !== "string" && numericCompare(value, decimalValue(candidate, budget), budget) === 0;
  if (Array.isArray(domain)) return domain.some(matches);
  const r = domain as NumberRange;
  return numericCompare(value, decimalValue(r.min, budget), budget) >= 0 && numericCompare(value, decimalValue(r.max, budget), budget) <= 0 && (!r.values || r.values.some(matches));
}
export function domainProblems(domain: NumberDomain, budget = new EvaluationBudget()): string[] {
  if (Array.isArray(domain) && domain.length > INPUT_LIMITS.collectionLength) return ["domain values exceed the collection length limit"];
  if (!Array.isArray(domain) && (domain as NumberRange).values && (domain as NumberRange).values!.length > INPUT_LIMITS.collectionLength) return ["range values exceed the collection length limit"];
  if (Array.isArray(domain)) return domain.length && domain.every(x => typeof x === "string" && x.length <= INPUT_LIMITS.stringLength || typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 2 ** INPUT_LIMITS.integerBits) ? [] : ["values must be a nonempty list of finite numbers or strings"];
  const r = domain as NumberRange, errors: string[] = [];
  if (!Number.isFinite(r.min) || !Number.isFinite(r.max) || r.min > r.max) return ["range must have finite min <= max"];
  try {
    const { lo, hi } = grid(r, budget);
    if (!r.values && lo > hi) errors.push("range has no value on its decimal grid");
    if (!r.values && hi - lo + BigInt(1) > BigInt(Number.MAX_SAFE_INTEGER)) errors.push("range grid exceeds the safe sampling limit");
  } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
  if (r.values && (!r.values.length || r.values.some(v => !Number.isFinite(v) || !domainContains({ min: r.min, max: r.max }, decimalValue(v, budget), budget)))) errors.push("range values must be nonempty and within min and max");
  return errors;
}
function scalar(value: string | number, budget: EvaluationBudget): ExpressionValue {
  return typeof value === "number" ? Number.isInteger(value) ? BigInt(value) : decimalValue(value, budget) : value;
}
function sample(domain: NumberDomain, random: RandomSource, budget: EvaluationBudget): ExpressionValue {
  if (Array.isArray(domain)) return scalar(choose(domain, random), budget);
  const r = domain as NumberRange;
  if (r.values) return scalar(choose(r.values, random), budget);
  const { scale, lo, hi, places } = grid(r, budget);
  const n = random(); if (!Number.isFinite(n) || n < 0 || n >= 1) fail("Random source must return a number in [0, 1)");
  const tick = lo + BigInt(Math.floor(n * Number(hi - lo + BigInt(1))));
  return places === 0 ? tick : new DecimalValue(tick, scale, false, budget);
}
export function slotDomain(step: CurriculumStep, reference: string | NumberDomain): NumberDomain {
  if (typeof reference !== "string") return reference;
  if (step.numbers && Object.hasOwn(step.numbers, reference)) return step.numbers[reference];
  if (reference === "values" && step.values) return step.values;
  return fail(`Unknown slot domain: ${reference}`);
}
export interface Placeholder { name: string; places?: number }
/** Only simple own names and the Python .Nf format. No attributes, calls or field indexing. */
export function placeholders(text: string): Placeholder[] {
  const fields: Placeholder[] = [];
  for (let i = 0; i < text.length;) {
    if (text[i] === "{" && text[i + 1] === "{" || text[i] === "}" && text[i + 1] === "}") { i += 2; continue; }
    if (text[i] === "}") fail("Unmatched closing brace in text");
    if (text[i++] !== "{") continue;
    const end = text.indexOf("}", i); if (end < 0) fail("Unclosed placeholder");
    const field = text.slice(i, end), match = field.match(/^([A-Za-z][A-Za-z0-9_]*)(?::\.(\d{1,2})f)?$/);
    if (!match || ["constructor", "prototype"].includes(match[1])) return fail(`Unsupported placeholder: {${field}}`);
    const places = match[2] === undefined ? undefined : Number(match[2]);
    fields.push({ name: match[1], places }); i = end + 1;
  }
  return fields;
}
export const CONTEXT_NAMES = ["name", "they", "They", "them", "their", "Their", "things", "animals", "foods", "places", "container", "units_length", "units_mass", "units_capacity", "currency"] as const;
function contextValues(contexts: TemplateContexts, random: RandomSource, requested: Set<string>): Record<string, ExpressionValue> {
  const values: Record<string, ExpressionValue> = Object.create(null);
  if (["name", "they", "They", "them", "their", "Their"].some(k => requested.has(k))) {
    const person = choose(contexts.people, random);
    Object.assign(values, { name: person.name, they: person.they, them: person.them, their: person.their, They: person.they[0].toUpperCase() + person.they.slice(1), Their: person.their[0].toUpperCase() + person.their.slice(1) });
  }
  for (const k of ["things", "animals", "foods", "places", "units_length", "units_mass", "units_capacity"] as const) if (requested.has(k)) values[k] = choose(contexts[k], random);
  if (requested.has("container")) values.container = choose(contexts.containers, random);
  if (requested.has("currency")) values.currency = contexts.money.currency;
  return values;
}
function render(text: string, values: Bindings, budget: EvaluationBudget): string {
  let output = "";
  for (let i = 0; i < text.length;) {
    if (text.slice(i, i + 2) === "{{" || text.slice(i, i + 2) === "}}") { output = budget.append(output, text[i]); i += 2; continue; }
    if (text[i] !== "{") { output = budget.append(output, text[i++]); continue; }
    const end = text.indexOf("}", i), [field] = placeholders(text.slice(i, end + 1));
    if (!Object.hasOwn(values, field.name)) fail(`Unknown placeholder: ${field.name}`);
    output = budget.append(output, field.places === undefined ? formatValue(values[field.name], budget) : formatFixed(values[field.name], field.places, budget));
    i = end + 1;
  }
  return output;
}
export interface FilledTemplate {
  text: string;
  answer: string;
  /** Includes sampled slots and ordered derived values. Exact integers and fractions retain their types. */
  values: Bindings;
  attempts: number;
}
export interface PreparedTemplate { fill(random: RandomSource, maxAttempts?: number): FilledTemplate }
/** Validate and compile once. Use the prepared object for a batch of fills. */
/** Production admission uses the same named-domain and compiler checks as the importer. */
export function prepareTemplate(step: CurriculumStep, template: StepTemplate, contexts: TemplateContexts): PreparedTemplate {
  assertTemplateInput(template);
  for (const [name, ref] of Object.entries(template.slots)) if (typeof ref !== "string") limitError(`Slot ${name} must name a numbers key or values list`);
  return compileValidatedTemplate(step, template, contexts);
}
/** Diagnostic only: retain the legacy corpus audit's inline-range fills and error classification. */
export function prepareTemplateForAudit(step: CurriculumStep, template: StepTemplate, contexts: TemplateContexts): PreparedTemplate {
  return compileValidatedTemplate(step, template, contexts);
}
function compileValidatedTemplate(step: CurriculumStep, template: StepTemplate, contexts: TemplateContexts): PreparedTemplate {
  assertTemplateInput(template);
  assertContextInput(contexts);
  const textSource = template.text;
  if (template.text.length > EVALUATION_LIMITS.outputLength) throw new TemplateError("Template text exceeds the output length limit");
  if (step.values && step.values.length > INPUT_LIMITS.collectionLength) limitError("Step values exceed the collection length limit");
  const stepValues = step.values && Object.freeze([...step.values]);
  const admissionBudget = new EvaluationBudget();
  const fields = placeholders(template.text), requested = new Set(fields.map(x => x.name));
  const known = new Set<string>(step.values ? ["values"] : []);
  const slots = Object.entries(template.slots).map(([name, ref]) => {
    if (!validName(name) || (CONTEXT_NAMES as readonly string[]).includes(name) || name === "values") fail(`Reserved slot name: ${name}`);
    const domain = slotDomain(step, ref), errors = domainProblems(domain, admissionBudget); if (errors.length) fail(`${name}: ${errors.join("; ")}`);
    const r = domain as NumberRange;
    const admittedDomain = Array.isArray(domain) ? Object.freeze([...domain]) : Object.freeze({ min: r.min, max: r.max, ...(r.decimal_places !== undefined ? { decimal_places: r.decimal_places } : {}), ...(r.values ? { values: Object.freeze([...r.values]) } : {}) });
    known.add(name); return { name, domain: admittedDomain };
  });
  const parse = (source: string) => {
    const expression = compileExpression(source, admissionBudget);
    for (const name of expression.names) if (!known.has(name)) fail(`Unknown expression name: ${name}`);
    return expression;
  };
  const derived = Object.entries(template.derived ?? {}).map(([name, source]) => {
    if (!validName(name) || name === "values" || (CONTEXT_NAMES as readonly string[]).includes(name)) fail(`Reserved derived name: ${name}`);
    const expression = parse(source); known.add(name); return { name, expression };
  });
  const check = template.check ? parse(template.check) : undefined, answer = parse(template.answer);
  for (const f of fields) if (!known.has(f.name) && !(CONTEXT_NAMES as readonly string[]).includes(f.name)) fail(`Unknown placeholder: ${f.name}`);
  return Object.freeze({ fill(random: RandomSource, maxAttempts = 100) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 1000) fail("Attempt limit must be an integer from 1 to 1000");
    const budget = new EvaluationBudget();
    for (let attempts = 1; attempts <= maxAttempts; attempts++) {
      budget.step();
      const values: Record<string, ExpressionValue> = Object.create(null);
      if (stepValues) values.values = budget.created(Object.freeze(stepValues.map(value => { budget.step(); return scalar(value, budget); })));
      for (const { name, domain } of slots) { budget.step(); values[name] = budget.created(sample(domain, random, budget)); }
      for (const { name, expression } of derived) values[name] = expression.evaluate(values, budget);
      if (check && !expressionIsTrue(check.evaluate(values, budget))) continue;
      const result = answer.evaluate(values, budget), text = render(textSource, { ...contextValues(contexts, random, requested), ...values }, budget);
      return { text, answer: formatValue(result, budget), values, attempts };
    }
    return fail(`Check did not pass within ${maxAttempts} attempts`);
  } });
}
export function fillTemplate(step: CurriculumStep, template: StepTemplate, contexts: TemplateContexts, random: RandomSource, maxAttempts = 100): FilledTemplate {
  return prepareTemplate(step, template, contexts).fill(random, maxAttempts);
}
