import { assertTemplateInput, assertContextInput, INPUT_LIMITS } from "./limits";
import { MISCONCEPTIONS } from "@/lib/assessment/misconceptions";
import { watchOutProblems } from "./watch-out";
/** Read source JSON as data. This module validates structure before any typed consumer sees it. */
import type { CurriculumStep, StepProgressions, TemplateContexts } from "./types";
import { CONTEXT_NAMES, domainProblems, placeholders, prepareTemplateForAudit } from "./template";
function object(x: unknown): x is Record<string, unknown> { return !!x && typeof x === "object" && !Array.isArray(x); }
const strings = (x: unknown) => Array.isArray(x) && x.length > 0 && x.every(v => typeof v === "string" && v.length > 0);
const scalarList = (x: unknown) => Array.isArray(x) && x.length <= INPUT_LIMITS.collectionLength && x.every(v => typeof v === "string" || typeof v === "number" && Number.isFinite(v));
function domain(x: unknown): boolean {
  return scalarList(x) || object(x) && typeof x.min === "number" && typeof x.max === "number" && (x.decimal_places === undefined || typeof x.decimal_places === "number") && (x.values === undefined || scalarList(x.values) && (x.values as unknown[]).every(v => typeof v === "number"));
}
const pair = (x: unknown, keys: string[]) => object(x) && keys.every(k => typeof x[k] === "string");
const difficulty = (x: unknown) => ["easy", "medium", "hard"].includes(String(x));
/** Reject dangerous object keys even when they occur in an unused part of the document. */
function safeKeys(input: unknown): void {
  let size = 0;
  const visit = (value: unknown, depth: number): void => {
    if (++size > 1000000 || depth > 40) throw new Error("Source exceeds the structure limit");
    if (typeof value === "string" && value.length > INPUT_LIMITS.stringLength) throw new Error("Source string exceeds the length limit");
    if (Array.isArray(value)) {
      if (value.length > 2048) throw new Error("Source array exceeds the length limit");
      for (const item of value) visit(item, depth + 1);
    } else if (value && typeof value === "object") {
      let count = 0;
      for (const k in value) if (Object.hasOwn(value, k)) {
        if (++count > 64) throw new Error("Source object exceeds the entry limit");
        if (["__proto__", "prototype", "constructor"].includes(k)) throw new Error(`Forbidden source key: ${k}`);
        visit((value as Record<string, unknown>)[k], depth + 1);
      }
    }
  };
  visit(input, 0);
}
export function parseStepProgressions(input: unknown): StepProgressions {
  // Reject aggregate template input before the general shape walk or expression compilation.
  if (object(input) && Array.isArray(input.steps)) {
    if (input.steps.length > 2048) throw new Error("Source steps exceed the length limit");
    for (const step of input.steps) {
      if (object(step) && Array.isArray(step.templates)) {
        if (step.templates.length > 6) throw new Error("Source templates exceed the length limit");
        for (const template of step.templates) assertTemplateInput(template);
      }
    }
  }
  safeKeys(input);
  if (!object(input) || input.curriculum !== "bc" || typeof input.format !== "string" || !Array.isArray(input.steps) || !object(input.contexts)) throw new Error("Expected BC step progressions with format, steps, and contexts");
  assertContextInput(input.contexts);
  const c = input.contexts;
  if (!Array.isArray(c.people) || !c.people.length || !c.people.every(p => pair(p, ["name", "they", "them", "their"]) && Object.values(p).every(v => typeof v === "string" && v.length))) throw new Error("Invalid contexts.people");
  for (const k of ["things", "animals", "foods", "places", "containers", "units_length", "units_mass", "units_capacity"]) if (!strings(c[k])) throw new Error(`Invalid contexts.${k}`);
  if (!object(c.money) || typeof c.money.currency !== "string" || ![c.money.coins, c.money.bills].every(x => Array.isArray(x) && x.length && x.every(v => typeof v === "number" && Number.isFinite(v)))) throw new Error("Invalid contexts.money");
  for (const [i, s] of input.steps.entries()) {
    const error = (field: string): never => { throw new Error(`steps[${i}].${field} is invalid`); };
    if (!object(s)) error("step");
    const step = s as Record<string, unknown>;
    if (step.curriculum !== "bc") error("curriculum");
    for (const k of ["skill", "position", "name", "change", "rules", "representation"]) if (typeof step[k] !== "string" || !step[k]) error(k);
    if (!Number.isSafeInteger(step.number) || Number(step.number) < 1) error("number");
    if (!Number.isSafeInteger(step.pages) || Number(step.pages) < 0) error("pages");
    if (!pair(step.example, ["problem", "answer"])) error("example");
    if (!pair(step.spotTheError, ["wrong", "fix"])) error("spotTheError");
    if (!["checked", "none"].includes(String(step.arithmetic))) error("arithmetic");
    if (!Array.isArray(step.mistakes) || !step.mistakes.every(m => pair(m, ["answer", "why"]) && object(m) && ["careless", "conceptual"].includes(String(m.kind)) && (m.misconception === null || typeof m.misconception === "string") && (m.watchOut === undefined || pair(m.watchOut, ["wrong", "fix"]) && object(m.watchOut) && (m.watchOut.verified === undefined || typeof m.watchOut.verified === "boolean") && (m.watchOut.verifierModel === undefined || typeof m.watchOut.verifierModel === "string") && (m.watchOut.verificationHash === undefined || typeof m.watchOut.verificationHash === "string")))) error("mistakes");
    if (step.regrouping !== undefined && typeof step.regrouping !== "boolean") error("regrouping");
    if (step.values !== undefined && !scalarList(step.values)) error("values");
    if (step.numbers !== undefined && (!object(step.numbers) || !Object.values(step.numbers).every(domain))) error("numbers");
    if (step.practice !== undefined && (!Array.isArray(step.practice) || !step.practice.every(p => pair(p, ["problem", "answer"]) && object(p) && difficulty(p.difficulty)))) error("practice");
    if (step.calibration !== undefined && (!pair(step.calibration, ["result", "checkedAgainst", "note", "bcScope"]) || !object(step.calibration) || !["matches", "adjusted"].includes(String(step.calibration.result)))) error("calibration");
    if (step.templates !== undefined) {
      if (!Array.isArray(step.templates)) error("templates");
      for (const t of step.templates as unknown[]) {
        if (!object(t) || !pair(t, ["format", "text", "answer"]) || !difficulty(t.difficulty) || !["bare", "missing", "true-false", "choose", "story", "explain", "compare", "picture"].includes(String(t.format))) error("templates.item");
        const template = t as Record<string, unknown>;
        if (!object(template.slots) || !Object.values(template.slots).every(v => typeof v === "string" || domain(v))) error("templates.slots");
        if (template.check !== undefined && typeof template.check !== "string") error("templates.check");
        if (template.derived != null && (!object(template.derived) || !Object.values(template.derived).every(v => typeof v === "string"))) error("templates.derived");
      }
    }
  }
  // The shape checks above include every required member and every optional member we consume.
  return input as unknown as StepProgressions;
}
export function stepFieldProblems(step: CurriculumStep, contexts?: TemplateContexts): string[] {
  const errors: string[] = [], at = `${step.skill} step ${step.number}`;
  for (const [i, mistake] of step.mistakes.entries()) {
    if (mistake.misconception !== null && !Object.hasOwn(MISCONCEPTIONS, mistake.misconception)) errors.push(`${at} mistake ${i + 1}: unknown misconception`);
    if (mistake.watchOut) errors.push(...watchOutProblems(mistake.watchOut).map(p => `${at} mistake ${i + 1}: ${p}`));
  }
  for (const [key, value] of Object.entries(step.numbers ?? {})) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || ["constructor", "prototype"].includes(key)) errors.push(`${at} numbers.${key}: invalid domain name`);
    errors.push(...domainProblems(value).map(p => `${at} numbers.${key}: ${p}`));
  }
  if (step.values) errors.push(...domainProblems(step.values).map(p => `${at} values: ${p}`));
  if (step.practice && (step.practice.length !== 6 || ["easy", "medium", "hard"].some(d => step.practice!.filter(p => p.difficulty === d).length !== 2))) errors.push(`${at} practice needs two easy, two medium, and two hard questions`);
  if (step.templates && (step.templates.length < 4 || step.templates.length > 6)) errors.push(`${at} needs four to six templates`);
  for (const [i, t] of (step.templates ?? []).entries()) {
    const prefix = `${at} template ${i + 1}`;
    try { assertTemplateInput(t); } catch (e) {
      errors.push(`${prefix}: ${e instanceof Error ? e.message : String(e)}`); continue;
    }
    for (const [name, ref] of Object.entries(t.slots)) {
      if (typeof ref !== "string") errors.push(`${prefix} slot ${name} must name a numbers key or values list; inline range found`);
      else if (!(step.numbers && Object.hasOwn(step.numbers, ref)) && !(ref === "values" && step.values)) errors.push(`${prefix} slot ${name} names unknown domain ${ref}`);
    }
    try {
      const known = new Set([...Object.keys(t.slots), ...Object.keys(t.derived ?? {}), ...CONTEXT_NAMES, ...(step.values ? ["values"] : [])]);
      for (const field of placeholders(t.text)) if (!known.has(field.name)) errors.push(`${prefix} unknown placeholder ${field.name}`);
      if (!contexts) errors.push(`${prefix} has no contexts`);
      else prepareTemplateForAudit(step, t, contexts);
    } catch (e) { errors.push(`${prefix}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return errors;
}
