// The reading identifies requests. Code validates their arithmetic against the stored package.
// Ordinary help has no vocabulary test. A model can add restrictions, never an allowed expression.
import { BC_SKILL_MAP } from "@/lib/assessment";
import { equivalent, type AnswerValue, type Operation, type OperationPackage } from "@/lib/question-package";
import { missingScope } from "./missing-number";
import { completeExpression, readNumbers } from "./numbers";
import { topicNumbers, topicRelations } from "./topic-frame";
import { placeRelations } from "@/lib/question-package-place-value";
import { isPartsOperation, partsRelations } from "@/lib/question-package-place-parts";
import { frameProblems, partProblems } from "./evaluate";

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
export interface ScopeReading { mathRequests?: MathRequest[]; outsideScope?: OutsideReason; scopeSkill?: string }

const skills = new Map(BC_SKILL_MAP.standards.flatMap(s => s.skills.map(k => [k.id, k] as const)));
export function scopeSkills(pkg: OperationPackage): string[] {
  return [...new Set(pkg.skill.skills.flatMap(id => skills.has(id) ? [id, ...skills.get(id)!.requires] : []))];
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
  /** A flipped column of this question ("8 - 2" for 2 - 8): the child's own error on it, so never another problem (#605). */
  const flip = (top: number, bottom: number) => expressions.push({ operation: "subtract", operands: [num(bottom), num(top)] });
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
  const problems = [pkg, ...(exampleChosen ? [pkg.easierExample] : [])];
  // An evaluate question's parts are one-step problems of their own, and a missing-number frame checks its number (evaluate.ts).
  for (const p of [...problems, ...problems.flatMap((x) => partProblems(x.operation)), ...frameProblems(pkg)]) {
    const op = family(p.operation);
    collect(p.operation.operands); collect(p.steps); collect(p === pkg ? pkg.answer.value : p.answer);
    // An "other-topic" question's checked counted numbers (topic-frame.ts): the die's odd or even numbers.
    collect(topicNumbers(p.text, p.operation));
    // A clock-time question's checked minute relations, and an area claim's other area (topic-frame.ts, C3c).
    for (const r of topicRelations(p.operation, p.text)) add(r.op, r.operands.map(num));
    const operands = p.operation.operands.map(v => typeof v === "number" ? num(v) : v).filter(value);
    if (op && operands.length === p.operation.operands.length) add(op, operands);
    // Place value (B1a): the digit times its place, and code's wrong-answer work, as the child says it.
    if (p.operation.kind === "place-value") for (const [d, worth] of placeRelations(p.operation)) add("multiply", [num(d), num(worth)]);
    // B1b: a sum's two values and their multiplications.
    if (p.operation.kind === "place-value" && isPartsOperation(p.operation)) for (const r of partsRelations(p.operation)) add(r.op, r.operands.map(num));
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
        flip(st.top, st.bottom);
        if (st.lent) flip(st.top - 1, st.bottom);
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
      // A claim's compare (A4, claim.ts): the difference of the result and the printed number, either way round, and for a
      // claim checked by division ("Mia says 6 × 8 = 56. Check with 56 ÷ 8.") the printed product and the checked one.
      if (st.kind === "claim-compare") {
        const [hi, lo] = st.value >= st.shown ? [st.value, st.shown] : [st.shown, st.value];
        add("subtract", [num(hi), num(lo)]);
        flip(hi, lo);
        if (p.operation.kind === "divide") {
          add("multiply", [num(st.shown), num(p.operation.operands[1])]);
          add("multiply", [num(st.value), num(p.operation.operands[1])]);
        }
      }
      if (st.kind === "combine-numerators") add(st.op, st.numerators.map(num));
      for (const [op, operands] of missingScope(st)) add(op, operands.map(num));
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
    pair: (op: ScopeOperation, requested: AnswerValue[]) => expressions.some(e => e.operation === op && e.operands.length === requested.length &&
      (e.operands.every((v, i) => equivalent(v, requested[i])) || ((op === "add" || op === "multiply") && [...e.operands].reverse().every((v, i) => equivalent(v, requested[i]))))) ||
      (op === "add" && sums.some(terms => sumOfTerms(requested, terms))),

  };
}

/** Refusal is best effort. Uncertain input never widens Maya's output: the controller still permits math only
 * from the stored package's lines and board commands, and no math in model-written talk. */
export function scopeReason(pkg: OperationPackage, text: string, exampleChosen: boolean, reading: ScopeReading = {}): ScopeReason | null {
  if (reading.outsideScope === "outside_work" || reading.outsideScope === "other_topic") return reading.outsideScope;
  const expression = completeExpression(text);
  if (!expression) return null;
  return allowedMath(pkg, exampleChosen).pair(expression.operation, expression.operands) ? null : "changed_problem";
}

/** Confirmation may repeat a child's own answer. It must not echo the proposed result of an outside calculation. */
export function scopeValue(pkg: OperationPackage, value: AnswerValue, exampleChosen: boolean): boolean {
  return allowedMath(pkg, exampleChosen).has(value) || pkg.wrongAnswers.some(w => equivalent(w.value, value));
}

/** This only restricts output. It never creates a scope refusal or carries numbers to a later turn. */
export function mathClaimIn(text: string, reading: { mathClaim?: boolean; mathRequests?: unknown[] } = {}): boolean {
  if (reading.mathClaim || reading.mathRequests?.length) return true;
  const numbers = readNumbers(text, { fractions: true, operands: true });
  return numbers.values.length > 1 || (numbers.values.length > 0 &&
    /\b(?:add(?:ed|ing)?|plus|minus|subtract(?:ed|ing)?|multipl(?:y|ied)|divid(?:e|ed)|combin(?:e|ed|ing)|answer|result|sum|total|got|says?|true|correct|right)\b/i.test(text));
}

/** Read the whole turn. One occurrence may be the candidate answer; every other number must be checked package math.
 * Without a candidate, more than one outside number blocks every numeric confirmation for this turn. */
export function outsideConfirmation(pkg: OperationPackage, text: string, exampleChosen: boolean, candidate?: AnswerValue): boolean {
  const allowed = allowedMath(pkg, exampleChosen);
  const outside = readNumbers(text, { fractions: true, operands: true }).values.filter(v => !allowed.has(v));
  return outside.length > 1 || (candidate !== undefined && outside.some(v => !equivalent(v, candidate)));
}
