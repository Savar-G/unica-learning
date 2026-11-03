/** Standalone template API. The book writer does not call this module. */
import { compileExpression, decimalValue, DecimalValue, numericCompare, expressionIsTrue, formatFixed, formatValue, validName, type Bindings, type ExpressionValue } from "./expression";
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
function grid(r: NumberRange): { scale: bigint; lo: bigint; hi: bigint; places: number } {
  const places = r.decimal_places ?? Math.max(decimalPlaces(r.min), decimalPlaces(r.max));
  if (!Number.isInteger(places) || places < 0 || places > 18) return fail("decimal_places must be an integer from 0 to 18");
  const scale = BigInt(10) ** BigInt(places), min = decimalValue(r.min), max = decimalValue(r.max);
  const floor = (n: bigint, d: bigint) => n / d - (n < BigInt(0) && n % d !== BigInt(0) ? BigInt(1) : BigInt(0));
  return { scale, lo: -floor(-min.numerator * scale, min.denominator), hi: floor(max.numerator * scale, max.denominator), places };
}
export function domainContains(domain: NumberDomain, value: ExpressionValue): boolean {
  const matches = (candidate: string | number) => typeof candidate === "string" ? value === candidate : typeof value !== "string" && numericCompare(value, decimalValue(candidate)) === 0;
  if (Array.isArray(domain)) return domain.some(matches);
  const r = domain as NumberRange;
  return numericCompare(value, decimalValue(r.min)) >= 0 && numericCompare(value, decimalValue(r.max)) <= 0 && (!r.values || r.values.some(matches));
}
export function domainProblems(domain: NumberDomain): string[] {
  if (Array.isArray(domain)) return domain.length && domain.every(x => typeof x === "string" || typeof x === "number" && Number.isFinite(x)) ? [] : ["values must be a nonempty list of finite numbers or strings"];
  const r = domain as NumberRange, errors: string[] = [];
  if (!Number.isFinite(r.min) || !Number.isFinite(r.max) || r.min > r.max) return ["range must have finite min <= max"];
  try {
    const { lo, hi } = grid(r);
    if (!r.values && lo > hi) errors.push("range has no value on its decimal grid");
    if (!r.values && hi - lo + BigInt(1) > BigInt(Number.MAX_SAFE_INTEGER)) errors.push("range grid exceeds the safe sampling limit");
  } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
  if (r.values && (!r.values.length || r.values.some(v => !Number.isFinite(v) || !domainContains({ min: r.min, max: r.max }, decimalValue(v))))) errors.push("range values must be nonempty and within min and max");
  return errors;
}
function scalar(value: string | number): ExpressionValue {
  return typeof value === "number" ? Number.isInteger(value) ? BigInt(value) : decimalValue(value) : value;
}
function sample(domain: NumberDomain, random: RandomSource): ExpressionValue {
  const errors = domainProblems(domain); if (errors.length) fail(errors.join("; "));
  if (Array.isArray(domain)) return scalar(choose(domain, random));
  const r = domain as NumberRange;
  if (r.values) return scalar(choose(r.values, random));
  const { scale, lo, hi, places } = grid(r);
  const n = random(); if (!Number.isFinite(n) || n < 0 || n >= 1) fail("Random source must return a number in [0, 1)");
  const tick = lo + BigInt(Math.floor(n * Number(hi - lo + BigInt(1))));
  return places === 0 ? tick : new DecimalValue(tick, scale);
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
    Object.assign(values, person, { They: person.they[0].toUpperCase() + person.they.slice(1), Their: person.their[0].toUpperCase() + person.their.slice(1) });
  }
  for (const k of ["things", "animals", "foods", "places", "units_length", "units_mass", "units_capacity"] as const) if (requested.has(k)) values[k] = choose(contexts[k], random);
  if (requested.has("container")) values.container = choose(contexts.containers, random);
  if (requested.has("currency")) values.currency = contexts.money.currency;
  return values;
}
function render(text: string, values: Bindings): string {
  let output = "";
  for (let i = 0; i < text.length;) {
    if (text.slice(i, i + 2) === "{{" || text.slice(i, i + 2) === "}}") { output += text[i]; i += 2; continue; }
    if (text[i] !== "{") { output += text[i++]; continue; }
    const end = text.indexOf("}", i), [field] = placeholders(text.slice(i, end + 1));
    if (!Object.hasOwn(values, field.name)) fail(`Unknown placeholder: ${field.name}`);
    output += field.places === undefined ? formatValue(values[field.name]) : formatFixed(values[field.name], field.places);
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
export function prepareTemplate(step: CurriculumStep, template: StepTemplate, contexts: TemplateContexts): PreparedTemplate {
  const fields = placeholders(template.text), requested = new Set(fields.map(x => x.name));
  const known = new Set<string>(step.values ? ["values"] : []);
  const slots = Object.entries(template.slots).map(([name, ref]) => {
    if (!validName(name) || (CONTEXT_NAMES as readonly string[]).includes(name) || name === "values") fail(`Reserved slot name: ${name}`);
    const domain = slotDomain(step, ref), errors = domainProblems(domain); if (errors.length) fail(`${name}: ${errors.join("; ")}`);
    known.add(name); return { name, domain };
  });
  const parse = (source: string) => {
    const expression = compileExpression(source);
    for (const name of expression.names) if (!known.has(name)) fail(`Unknown expression name: ${name}`);
    return expression;
  };
  const derived = Object.entries(template.derived ?? {}).map(([name, source]) => {
    if (!validName(name) || name === "values" || (CONTEXT_NAMES as readonly string[]).includes(name)) fail(`Reserved derived name: ${name}`);
    const expression = parse(source); known.add(name); return { name, expression };
  });
  const check = template.check ? parse(template.check) : undefined, answer = parse(template.answer);
  for (const f of fields) if (!known.has(f.name) && !(CONTEXT_NAMES as readonly string[]).includes(f.name)) fail(`Unknown placeholder: ${f.name}`);
  return { fill(random, maxAttempts = 100) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 1000) fail("Attempt limit must be an integer from 1 to 1000");
    for (let attempts = 1; attempts <= maxAttempts; attempts++) {
      const values: Record<string, ExpressionValue> = Object.create(null);
      if (step.values) values.values = step.values.map(scalar);
      for (const { name, domain } of slots) values[name] = sample(domain, random);
      for (const { name, expression } of derived) values[name] = expression.evaluate(values);
      if (check && !expressionIsTrue(check.evaluate(values))) continue;
      const result = answer.evaluate(values), text = render(template.text, { ...contextValues(contexts, random, requested), ...values });
      return { text, answer: formatValue(result), values, attempts };
    }
    return fail(`Check did not pass within ${maxAttempts} attempts`);
  } };
}
export function fillTemplate(step: CurriculumStep, template: StepTemplate, contexts: TemplateContexts, random: RandomSource, maxAttempts = 100): FilledTemplate {
  return prepareTemplate(step, template, contexts).fill(random, maxAttempts);
}
