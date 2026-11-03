// The reading identifies requests. Code validates their arithmetic against the stored package.
// Ordinary help has no vocabulary test. A model can add restrictions, never an allowed expression.
import { BC_SKILL_MAP } from "@/lib/assessment";
import { equivalent, type AnswerValue, type Operation, type OperationPackage } from "@/lib/question-package";
import { answerStatement, plainMinus, readAnswer, readNumbers, writtenFractions } from "./numbers";

export const SCOPE_REASONS = ["outside_work", "other_person", "changed_problem", "other_topic", "unverified_request", "model_scope"] as const;
export type ScopeReason = typeof SCOPE_REASONS[number];
export type OutsideReason = "outside_work" | "other_person" | "other_topic";
export interface ScopeRefusal { at: number; reason: ScopeReason }
export const SCOPE_LABELS: Record<ScopeReason, string> = {
  outside_work: "Outside homework or schoolwork", other_person: "Another person's question",
  changed_problem: "Different question or numbers", other_topic: "Another topic",
  unverified_request: "Request outside the checked question", model_scope: "Model requested a scope limit",
};
export const SCOPE_OPERATIONS = ["add", "subtract", "multiply", "divide", "pair"] as const;
export type ScopeOperation = typeof SCOPE_OPERATIONS[number];
/** One expression, not the whole turn. text quotes only its operands and operation, without its result. */
export interface MathRequest { text: string; operation: ScopeOperation; operands: AnswerValue[] }
export interface ScopeReading { mathRequests?: MathRequest[]; outsideScope?: OutsideReason; scopeSkill?: string; answerSpans?: string[] }

const skills = new Map(BC_SKILL_MAP.standards.flatMap(s => s.skills.map(k => [k.id, k] as const)));
export function scopeSkills(pkg: OperationPackage): string[] {
  return [...new Set(pkg.skill.skills.flatMap(id => skills.has(id) ? [id, ...skills.get(id)!.requires] : []))];
}
const normal = (s: string) => s.normalize("NFKC").replace(/\u2212/g, "-").replace(/[’‘]/g, "'").toLowerCase();
/** Operations only. All numeric syntax belongs to the D-199 readers in numbers.ts. A word hyphen is not subtraction;
 * a fraction bar is part of a number, whose complete value is checked below. */
function operationsIn(text: string): ScopeOperation[] {
  const t = writtenFractions(plainMinus(normal(text)), { operands: true }).replace(/([a-z])-(?=[a-z])/g, "$1 ");
  const out: ScopeOperation[] = [];
  if (/\+|\b(?:plus|add|added|adding)\b/.test(t)) out.push("add");
  if (/\b(?:minus|subtract|subtracted|subtracting|less|take away|took away)\b|\d\s*-/.test(t)) out.push("subtract");
  if (/[×*]|\bx\b|\b(?:times|multiply|multiplied|multiplying)\b/.test(t)) out.push("multiply");
  if (/÷|\b(?:divide|divided|dividing)\b/.test(t)) out.push("divide");
  return out;
}

const num = (value: number): AnswerValue => ({ type: "number", value });
const family = (op: Operation): ScopeOperation | null => op.kind.includes("add") ? "add" : op.kind.includes("subtract") ? "subtract" : op.kind.includes("multiply") ? "multiply" : op.kind.includes("divide") ? "divide" : null;
interface Allowed { operation: ScopeOperation; operands: AnswerValue[] }
const value = (x: unknown): x is AnswerValue => typeof x === "object" && x !== null &&
  (("type" in x && x.type === "number" && "value" in x && typeof x.value === "number" && Number.isFinite(x.value)) ||
   ("type" in x && x.type === "fraction" && "numerator" in x && "denominator" in x && Number.isInteger(x.numerator) && Number.isInteger(x.denominator) && Number(x.denominator) > 0));

function sumOfTerms(requested: AnswerValue[], terms: number[]): boolean {
  if (requested.some(v => v.type !== "number") || terms.length > 10 || requested.length > terms.length) return false;
  const sums = Array.from({ length: 1 << terms.length }, (_, mask) => terms.reduce((sum, n, i) => sum + ((mask & (1 << i)) ? n : 0), 0));
  const place = (at: number, used: number): boolean => {
    if (at === requested.length) return true;
    const target = requested[at];
    for (let mask = 1; mask < sums.length; mask++) if (!(mask & used) && target.type === "number" && Number(sums[mask].toFixed(10)) === target.value && place(at + 1, used | mask)) return true;
    return false;
  };
  return place(0, 0);
}
/** Values and operations come only from the checked package, including its checked prerequisite work. */
function allowedMath(pkg: OperationPackage, exampleChosen: boolean) {
  const expressions: Allowed[] = [], sums: number[][] = [], values: AnswerValue[] = [];
  const add = (operation: ScopeOperation, operands: AnswerValue[]) => { expressions.push({ operation, operands }); values.push(...operands); };
  const collect = (v: unknown): void => {
    if (typeof v === "number" && Number.isFinite(v)) values.push(num(v));
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") {
      if (value(v)) values.push(v);
      if ("numerator" in v && "denominator" in v) values.push({ type: "fraction", numerator: Number(v.numerator), denominator: Number(v.denominator) });
      Object.values(v).forEach(collect);
    }
  };
  for (const p of [pkg, ...(exampleChosen ? [pkg.easierExample] : [])]) {
    const op = family(p.operation);
    collect(p.operation.operands); collect(p.steps); collect(p === pkg ? pkg.answer.value : pkg.easierExample.answer);
    const operands = p.operation.operands.map(v => typeof v === "number" ? num(v) : v).filter(value);
    if (op && operands.length === p.operation.operands.length) add(op, operands);
    const placeTerms = operands.flatMap(v => {
      if (v.type !== "number" || v.value < 0) return [];
      const [whole, fraction = ""] = String(v.value).split(".");
      const terms = [...whole, ...fraction].map((d, i) => Number((Number(d) * 10 ** (whole.length - 1 - i)).toFixed(10))).filter(n => n !== 0);
      sums.push(terms); // Decomposing one stored operand does not permit adding different operands together.
      return terms;
    });
    if (op === "add") sums.push(placeTerms);
    const places = ["thousandths", "hundredths", "tenths", "ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands", "millions"];
    const subtractionParts = p.steps.flatMap(st => st.kind === "subtract-column" && st.write !== null
      ? [st.write * 10 ** (places.indexOf(st.place) - 3)] : []);
    if (subtractionParts.length > 1) sums.push(subtractionParts);
    const partials = p.steps.flatMap(st => st.kind === "partial-product" ? [st.value] : []);
    if (partials.length > 1) sums.push(partials);
    for (const st of p.steps) {
      if (st.kind === "add-column") {
        sums.push([...st.digits, ...(st.carryIn ? [st.carryIn] : [])]);
        if (st.carryIn || st.carryOut) values.push(num(10));
      }
      if (st.kind === "subtract-column" && st.bottom !== null) {
        add("subtract", [num(st.top - Number(st.lent) + (st.regrouped ? 10 : 0)), num(st.bottom)]);
        if (st.regrouped) add("add", [num(st.top - Number(st.lent)), num(10)]);
        if (st.lent) add("subtract", [num(st.top), num(1)]);
      }
      if (st.kind === "multiply-digit" && st.top !== null) {
        add("multiply", [num(st.top), num(st.multiplier)]);
        if (st.carryIn) sums.push([st.total - st.carryIn, st.carryIn]);
      }
      if (st.kind === "divide-digit" && p.operation.kind === "divide") {
        add("divide", [num(st.current), num(p.operation.operands[1])]);
        add("multiply", [num(st.quotient), num(p.operation.operands[1])]);
        add("subtract", [num(st.current), num(st.product)]);
      }
      if (st.kind === "combine-numerators") add(st.op, st.numerators.map(num));
      if (st.kind === "common-denominator") for (let i = 0; i < st.from.length; i++) {
        add("multiply", [num(st.from[i].numerator), num(st.factors[i])]);
        add("multiply", [num(st.from[i].denominator), num(st.factors[i])]);
      }
      if (st.kind === "simplify") {
        add("divide", [num(st.from.numerator), num(st.divisor)]);
        add("divide", [num(st.from.denominator), num(st.divisor)]);
      }
    }
  }
  // All combinations are built from disjoint checked place terms. No child-provided term enters this set.
  for (const terms of sums) {
    if (terms.length > 10) continue;
    const combinations = Array.from({ length: 1 << terms.length }, (_, mask) => num(Number(terms.reduce((sum, n, i) => sum + ((mask & (1 << i)) ? n : 0), 0).toFixed(10))));
    values.push(...combinations);
  }
  return {
    has: (v: AnswerValue) => values.some(n => equivalent(n, v)),
    operation: (op: ScopeOperation) => expressions.some(e => e.operation === op) || (op === "add" && sums.length > 0),
    pair: (op: ScopeOperation, requested: AnswerValue[]) => expressions.some(e => e.operation === op && e.operands.length === requested.length &&
      (e.operands.every((v, i) => equivalent(v, requested[i])) || ((op === "add" || op === "multiply") && [...e.operands].reverse().every((v, i) => equivalent(v, requested[i]))))) ||
      (op === "add" && sums.some(terms => sumOfTerms(requested, terms))),
    forOperation: (op: ScopeOperation, numbers: AnswerValue[]) => numbers.every(v => expressions.some(e => e.operation === op && e.operands.some(n => equivalent(n, v))) || (op === "add" && sums.some(terms => sumOfTerms([v], terms)))),
  };
}

export interface ScopePending { at: number; text: string }
export interface ScopeCheck { reason: ScopeReason | null; pending: ScopePending[] }

/** A checked answer/explanation span cannot cut a sign, a number word, a separator or a fraction in half. The same
 * D-199 reading must result before and after partitioning the source. There is no substring numeric parser. */
function removeAnswers(text: string, spans: string[], allowed: ReturnType<typeof allowedMath>): string | null {
  let remaining = text;
  for (const span of spans) {
    const at = remaining.indexOf(span);
    if (!span || at < 0 || !answerStatement(span, { fractions: true })) return null;
    for (const clause of span.split(/[!?;\n]|\.(?=\s|$)/)) {
      const numbers = readNumbers(clause, { fractions: true });
      // A child's account of their work may contain a mistake. A bare calculation is still a proposed problem:
      // only its result can be their answer. Its operands must already belong to the checked work.
      if (numbers.values.every(allowed.has) || /^\s*(?:i\b|my\b|so\b|then\b)/i.test(clause) ||
          /\b(?:because|since|cause|cuz|coz)\b/i.test(clause) || !numbers.operand.some(Boolean)) continue;
      const operands = numbers.lastInOperation ? numbers.values : numbers.values.slice(0, -1);
      const operations = operationsIn(clause);
      if (operands.some(v => !allowed.has(v)) || !(operations.length ? operations : SCOPE_OPERATIONS.filter(op => op !== "pair"))
        .some(op => allowed.pair(op, operands))) return null;
    }
    const before = remaining.slice(0, at), after = remaining.slice(at + span.length);
    if ((before.trim() && !/[.!?;\n]\s*$/.test(before)) ||
        (after.trim() && !/[.!?;\n]\s*$/.test(span) && !/^\s*[.!?;\n]/.test(after))) return null;
    const whole = readNumbers(remaining, { fractions: true });
    const pieces = [before, span, after].flatMap(t => readNumbers(t, { fractions: true }).values);
    if (whole.unreadable || whole.values.length !== pieces.length || !whole.values.every((v, i) => equivalent(v, pieces[i]))) return null;
    remaining = `${before} [checked answer] ${after}`;
  }
  return remaining;
}

/** Each number is read in full by D-199, including unknown forms. Model readings can only remove a code-checked
 * answer span or add a restriction. Unaccounted single numbers wait across responses and saved sessions. */
export function checkScope(pkg: OperationPackage, text: string, exampleChosen: boolean, reading: ScopeReading = {}, previous: ScopePending[] = [], at = 0): ScopeCheck {
  const fail = (reason: ScopeReason): ScopeCheck => ({ reason, pending: previous });
  if (reading.outsideScope) return fail(reading.outsideScope);
  if (reading.scopeSkill && !scopeSkills(pkg).includes(reading.scopeSkill)) return fail("model_scope");
  const allowed = allowedMath(pkg, exampleChosen);
  const remaining = removeAnswers(text, reading.answerSpans ?? [], allowed);
  if (remaining === null) return fail("unverified_request");
  if (readAnswer(remaining, { fractions: true }).choice && !operationsIn(remaining).length) return { reason: null, pending: [...previous, { at, text: remaining }] };
  const pending: ScopePending[] = [];
  let numberCount = 0, hasOperation = false, unreadable = false;
  for (const source of [...previous, { at, text: remaining }]) {
    const stated = operationsIn(source.text);
    const numbers = readNumbers(source.text, { fractions: true, operands: stated.length > 0 });
    const ordinary = readNumbers(source.text);
    if (numbers.unreadable && !numbers.values.length && !ordinary.values.length && !ordinary.unreadable) continue;
    const operations = (numbers.values.length || previous.length ? stated : []).filter(op =>
      !(op === "subtract" && numbers.values.length === 1 && numbers.values[0].type === "number" && numbers.values[0].value < 0 && !numbers.lastInOperation));
    // A slash inside a stored fraction is notation. A different fraction is not permission to divide new numbers.
    if (source.text.includes("/") && numbers.values.some(v => v.type === "fraction" && !allowed.has(v))) operations.push("divide");
    if (numbers.values.length === 2 && operations.length === 1 && !numbers.unreadable && !allowed.pair(operations[0], numbers.values)) return fail("changed_problem");
    if (operations.some(op => !allowed.operation(op))) return fail("changed_problem");
    // A prerequisite operation cannot use the target's operands as a new problem. The model may identify each
    // separate request; without such a reading the complete numeric context must fit that operation's values.
    if (operations.length === 1 && !allowed.forOperation(operations[0], numbers.values) && numbers.values.every(allowed.has)) {
      // Results are checked values too, even when not operands of a further step.
      const primary = family(pkg.operation);
      if (operations[0] !== primary) return fail("changed_problem");
    }
    numberCount += numbers.values.length;
    hasOperation ||= operations.length > 0;
    unreadable ||= numbers.unreadable;
    if (numbers.unreadable || numbers.values.some(v => !allowed.has(v))) pending.push(source);
  }
  for (const r of reading.mathRequests ?? []) {
    if (!r || typeof r.text !== "string" || !normal(text).includes(normal(r.text)) || !SCOPE_OPERATIONS.includes(r.operation) ||
        !Array.isArray(r.operands) || !r.operands.every(value)) return fail("unverified_request");
    const heard = readNumbers(r.text, { fractions: true, operands: true });
    if (heard.unreadable || heard.values.length !== r.operands.length || !heard.values.every((v, i) => equivalent(v, r.operands[i])) ||
        operationsIn(r.text).some(op => op !== r.operation)) return fail("unverified_request");
    if (r.operands.some(v => !allowed.has(v)) || (r.operation !== "pair" && !allowed.operation(r.operation))) return fail("changed_problem");
  }
  if (pending.length && (hasOperation || (!unreadable && numberCount > 1) || (reading.mathRequests?.length ?? 0) > 0)) return fail(unreadable ? "unverified_request" : "changed_problem");
  return { reason: null, pending };
}

export function scopeReason(pkg: OperationPackage, text: string, exampleChosen: boolean, reading: ScopeReading = {}): ScopeReason | null {
  return checkScope(pkg, text, exampleChosen, reading).reason;
}
