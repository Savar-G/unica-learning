/** Standalone template API. The book writer does not call this module. */
import { compileExpression, expressionIsTrue, formatFixed, formatValue, validName, type Bindings, type ExpressionValue } from "./expression";
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
function grid(r: NumberRange): { scale: number; lo: number; hi: number } {
  const scale = 10 ** (r.decimal_places ?? 0);
  let lo = Math.ceil(r.min * scale - 1e-8), hi = Math.floor(r.max * scale + 1e-8);
  // Correct binary endpoint noise, but never move a sample beyond the actual source bounds.
  if (lo / scale < r.min) lo++;
  if (hi / scale > r.max) hi--;
  return { scale, lo, hi };
}
export function domainProblems(domain: NumberDomain): string[] {
  if (Array.isArray(domain)) return domain.length && domain.every(x => typeof x === "string" || typeof x === "number" && Number.isFinite(x)) ? [] : ["values must be a nonempty list of finite numbers or strings"];
  const r = domain as NumberRange, errors: string[] = [];
  if (!Number.isFinite(r.min) || !Number.isFinite(r.max) || r.min > r.max) errors.push("range must have finite min <= max");
  const places = r.decimal_places ?? 0;
  if (!Number.isInteger(places) || places < 0 || places > 6) errors.push("decimal_places must be an integer from 0 to 6");
  const { lo, hi } = grid(r);
  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || !Number.isSafeInteger(hi - lo + 1) || lo > hi) errors.push("range has no safe sample on its decimal grid");
  if (r.values && (!r.values.length || r.values.some(v => !Number.isFinite(v) || v < r.min || v > r.max))) errors.push("range values must be nonempty and within min and max");
  return errors;
}
function sample(domain: NumberDomain, random: RandomSource): ExpressionValue {
  const errors = domainProblems(domain); if (errors.length) fail(errors.join("; "));
  let value: number | string;
  if (Array.isArray(domain)) value = choose(domain, random);
  else {
    const r = domain as NumberRange;
    if (r.values) value = choose(r.values, random);
    else {
      const { scale, lo, hi } = grid(r);
      const n = random(); if (!Number.isFinite(n) || n < 0 || n >= 1) fail("Random source must return a number in [0, 1)");
      value = (lo + Math.floor(n * (hi - lo + 1))) / scale;
    }
  }
  return typeof value === "number" && Number.isInteger(value) ? BigInt(value) : value;
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
      if (step.values) values.values = step.values.map(v => typeof v === "number" && Number.isInteger(v) ? BigInt(v) : v);
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
