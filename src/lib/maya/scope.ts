// The reading identifies requests. Code validates their arithmetic against the stored package.
// Ordinary help has no vocabulary test. A model can add restrictions, never an allowed expression.
import { BC_SKILL_MAP } from "@/lib/assessment";
import { equivalent, type AnswerValue, type Operation, type OperationPackage } from "@/lib/question-package";
import { valuesIn } from "./numbers";
import { readOptionsFor } from "./fractions";

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
const normal = (s: string) => s.normalize("NFKC").replace(/\u2212/g, "-").replace(/[’‘]/g, "'").toLowerCase();
const words = "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand";
const number = `(?:\\d+(?:\\.\\d+)?(?:\\s+\\d+\\s*\\/\\s*\\d+|\\s*\\/\\s*\\d+)?|(?:${words})(?:[ -]+(?:${words}))*(?:\\s+(?:halves|quarters|eighths|sixteenths|thirds|fourths|fifths|sixths|sevenths|tenths))?)(?![a-z0-9])`;
const operator = "(?:\\+|-(?=\\s*\\d)|×|\\*|÷|\\bx\\b|plus|minus|times|multiplied by|divided by|take away|and)";
const operationOf = (s: string): ScopeOperation => /^(?:\+|plus)$/.test(s) ? "add" : /^(?:-|minus|take away)$/.test(s) ? "subtract"
  : /^(?:×|\*|x|times|multiplied by)$/.test(s) ? "multiply" : /^(?:÷|\/|divided by)$/.test(s) ? "divide" : "pair";

/** Numeric syntax only. These expressions also constrain a missing or incorrect model reading.
 * The model supplies semantic pairs and requests across clauses through mathRequests. */
export function mathRequestsIn(text: string, pkg: OperationPackage): MathRequest[] {
  const t = normal(text), out: MathRequest[] = [];
  const asks = /\?|\b(?:why|what|how|explain|solve|calculate|teach|help|add|subtract|multiply|divide)\b/.test(t);
  const expression = new RegExp(`(?<![a-z0-9])${number}(?:\\s*${operator}\\s*${number})+`, "g");
  for (const match of t.matchAll(expression)) {
    const span = match[0];
    if (!asks && t.trim().replace(/[.?!]$/, "") !== span) continue; // Statements remain answers, checked by D-199.
    const terms = [...span.matchAll(new RegExp(number, "g"))];
    if (terms.length < 2) continue;
    const operands = terms.map(m => valuesIn(m[0], readOptionsFor(pkg)));
    if (operands.some(v => v.length !== 1)) continue;
    const ops = terms.slice(1).map((m, i) => operationOf(span.slice(terms[i].index! + terms[i][0].length, m.index).trim()));
    if (!asks && ops.every(op => op === "pair")) continue;
    // Keep mixed operations as individual expressions. Never join unrelated requests or use a turn-wide exemption.
    if (ops.every(op => op === ops[0])) out.push({ text: span, operation: ops[0], operands: operands.map(v => v[0]) });
    else for (let i = 0; i < ops.length; i++) out.push({ text: span.slice(terms[i].index, terms[i + 1].index! + terms[i + 1][0].length), operation: ops[i], operands: [operands[i][0], operands[i + 1][0]] });
  }
  return out;
}

const num = (value: number): AnswerValue => ({ type: "number", value });
const family = (op: Operation): ScopeOperation | null => op.kind.includes("add") ? "add" : op.kind.includes("subtract") ? "subtract" : op.kind.includes("multiply") ? "multiply" : op.kind.includes("divide") ? "divide" : null;
interface Allowed { operation: ScopeOperation; operands: AnswerValue[] }
const value = (x: unknown): x is AnswerValue => typeof x === "object" && x !== null &&
  (("type" in x && x.type === "number" && "value" in x && typeof x.value === "number" && Number.isFinite(x.value)) ||
   ("type" in x && x.type === "fraction" && "numerator" in x && "denominator" in x && Number.isInteger(x.numerator) && Number.isInteger(x.denominator) && Number(x.denominator) > 0));

/** A requested sum is a partition of these checked terms. Each term can be used once.
 * Thus 9+7, 20+30, 16+20+30 and 39+27 all belong to 27+39; 28+38 does not. */
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
function allowedMath(pkg: OperationPackage, exampleChosen: boolean) {
  const expressions: Allowed[] = [], sums: number[][] = [];
  const add = (operation: ScopeOperation, operands: AnswerValue[]) => expressions.push({ operation, operands });
  for (const p of [pkg, ...(exampleChosen ? [pkg.easierExample] : [])]) {
    const op = family(p.operation);
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
      if (st.kind === "add-column") sums.push([...st.digits, ...(st.carryIn ? [st.carryIn] : [])]);
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
  return (r: MathRequest) => {
    const matches = (op: ScopeOperation) => expressions.some(e => {
      if (e.operation !== op || e.operands.length !== r.operands.length) return false;
      const remaining = [...e.operands];
      return r.operands.every((v, i) => {
        const at = op === "add" || op === "multiply" ? remaining.findIndex(n => equivalent(n, v)) : equivalent(e.operands[i], v) ? 0 : -1;
        if (at < 0) return false;
        remaining.splice(at, 1); return true;
      });
    }) || (op === "add" && sums.some(terms => sumOfTerms(r.operands, terms)));
    return r.operation === "pair" ? ["add", "subtract", "multiply", "divide"].some(op => matches(op as ScopeOperation)) : matches(r.operation);
  };
}

/** Called on every reading, including a rejected or malformed proposal. It can only add a restriction. */
export function scopeReason(pkg: OperationPackage, text: string, exampleChosen: boolean, reading: ScopeReading = {}): ScopeReason | null {
  if (reading.outsideScope) return reading.outsideScope;
  if (reading.scopeSkill && !scopeSkills(pkg).includes(reading.scopeSkill)) return "model_scope";
  const requests = mathRequestsIn(text, pkg);
  for (const r of reading.mathRequests ?? []) {
    if (!r || typeof r.text !== "string" || !normal(text).includes(normal(r.text)) || !SCOPE_OPERATIONS.includes(r.operation) ||
        !Array.isArray(r.operands) || r.operands.length < 2 || r.operands.length > 8 || !r.operands.every(value)) return "unverified_request";
    const syntax = mathRequestsIn(r.text, pkg);
    if (syntax.some(e => e.operation !== "pair" && e.operation !== r.operation)) return "unverified_request";
    const heard = valuesIn(r.text, readOptionsFor(pkg));
    if (heard.length !== r.operands.length || !heard.every((v, i) => equivalent(v, r.operands[i]))) return "unverified_request";
    requests.push(r);
  }
  const permits = requests.length ? allowedMath(pkg, exampleChosen) : () => true;
  return requests.some(r => !permits(r)) ? "changed_problem" : null;
}
