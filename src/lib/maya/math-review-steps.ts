// Code's facts per step for the math-truth review (version 3, 2026-11-15): for each step of the question's tutor kind
// (TutorKind.steps), its operation, its operands, its value, and the state of the work after it, in plain words code
// writes ("after the trade, 52 is 4 tens and 12 ones"; "ones done: write 4 in the ones"). The review judged true
// sentences "unsure" or "false" when they named a moment of the work that the step texts did not spell out ("Now there
// are 12 ones."). Built only from the package's worked steps (code's computed facts): never from the model's words, the
// child's words or the child's name. Pure: no clock, no randomness.
import type { OperationPackage, Place, WorkedStep } from "@/lib/question-package";
import { tutorKind } from "./tutor";

/** One step of the work as the review reads it. */
export interface ReviewStep {
  /** The step's number in work order, from 1. */
  step: number;
  /** The place or part the step works on, when it has one. */
  place?: string;
  /** What the step does ("subtract", "add", "multiply", "divide", "read the digit", "compare"). */
  operation: string;
  /** The numbers the step works with, in order (after any trade). */
  operands: (number | string)[];
  /** The step's result. */
  value: number | string;
  /** The state of the work after the step, in plain words with true math. */
  after: string;
}

/** The whole-number places, ones first, and one of each. */
const PLACES = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands", "millions"] as const;
const ONE = ["one", "ten", "hundred", "thousand", "ten thousand", "hundred thousand", "million"] as const;
const idx = (p: Place | string) => PLACES.indexOf(p as (typeof PLACES)[number]);
/** "1 ten", "4 tens", "12 ones" ("ones" for any count but 1: "1 one"). */
const count = (n: number, k: number) => `${n} ${n === 1 ? ONE[k] : PLACES[k]}`;
const commas = (n: number) => n.toLocaleString("en-US");

/** A number split into its places, highest place first: "4 tens and 12 ones". Leading 0 places are left out. */
function placesText(digits: readonly number[]): string {
  let top = digits.length - 1;
  while (top > 0 && digits[top] === 0) top--;
  const parts = Array.from({ length: top + 1 }, (_, i) => top - i).map((k) => count(digits[k], k));
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** The digits written so far, as "4 in the ones" or "2 in the tens and 4 in the ones". */
function writtenText(written: readonly { k: number; digit: number }[]): string {
  const parts = [...written].sort((a, b) => b.k - a.k).map((w) => `${w.digit} in the ${PLACES[w.k]}`);
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

const answerOf = (pkg: OperationPackage): number | string | null => {
  const v = (pkg.answer.value as { value?: unknown }).value;
  return typeof v === "number" || typeof v === "string" ? v : null;
};

type Sub = Extract<WorkedStep, { kind: "subtract-column" }>;
type Add = Extract<WorkedStep, { kind: "add-column" }>;
type Mul = Extract<WorkedStep, { kind: "multiply-digit" }>;
type Div = Extract<WorkedStep, { kind: "divide-digit" }>;

/** The column subtraction played out: each column's trade, the top number after it, and the digit written. */
function subtractStates(pkg: OperationPackage): Map<string, Omit<ReviewStep, "step">> | null {
  const cols = pkg.steps.filter((s): s is Sub => s.kind === "subtract-column");
  if (cols.length === 0 || cols.some((c, i) => idx(c.place) !== i)) return null;
  const top = Number(pkg.operation.operands[0]);
  const cur = cols.map((c) => c.top);
  const written: { k: number; digit: number }[] = [];
  /** Places that already got their 10 from a trade that passed through them (the 0s of 1002 − 4). */
  const got = new Set<number>();
  const out = new Map<string, Omit<ReviewStep, "step">>();
  for (const [i, c] of cols.entries()) {
    const bottom = c.bottom ?? 0;
    const parts: string[] = [];
    if (c.regrouped && !got.has(i)) {
      // The trade as a child does it: the nearest place with something to give gives 1, each 0 place on the way gets 10
      // and gives 1 on, and this place gets 10.
      let k = i + 1;
      while (k < cur.length && cur[k] === 0) k++;
      if (k >= cur.length) return null;
      cur[k] -= 1;
      for (let m = k - 1; m > i; m--) { cur[m] += 9; got.add(m); }
      cur[i] += 10;
      const trades = Array.from({ length: k - i }, (_, j) => k - j).map((m) => `1 ${ONE[m]} for 10 ${PLACES[m - 1]}`);
      parts.push(`trade ${trades.join(", then ")}: after the trade, ${commas(top)} is ${placesText(cur)}`);
    }
    // Code's own column facts must agree with the play: else no state is given for this question.
    if (cur[i] !== c.top - (c.lent ? 1 : 0) + (c.regrouped ? 10 : 0)) return null;
    const result = cur[i] - bottom;
    const place = PLACES[i];
    if (c.write === null) {
      parts.push(`${place}: ${count(cur[i], i)} minus ${count(bottom, i)} is ${count(result, i)}; nothing is written there, because a 0 on the left of an answer is not written`);
    } else {
      if (c.write !== result) return null;
      written.push({ k: i, digit: result });
      parts.push(`${place} done: ${count(cur[i], i)} minus ${count(bottom, i)} is ${count(result, i)}; write ${result} in the ${place}`);
    }
    const last = i === cols.length - 1;
    parts.push(last ? `the answer is ${answerOf(pkg) ?? ""}`.trim() : `written so far: ${writtenText(written)}`);
    out.set(c.id, { place, operation: "subtract", operands: [cur[i], bottom], value: result, after: parts.join("; ") });
  }
  return out;
}

/** The column addition played out: each column's sum, its carry and the digits written. Also the rows of a product. */
function addStates(pkg: OperationPackage): Map<string, Omit<ReviewStep, "step">> {
  const cols = pkg.steps.filter((s): s is Add => s.kind === "add-column");
  const written: { k: number; digit: number }[] = [];
  const out = new Map<string, Omit<ReviewStep, "step">>();
  for (const [i, c] of cols.entries()) {
    const k = idx(c.place);
    if (k < 0) continue;
    const terms = [...(c.carryIn > 0 ? [c.carryIn] : []), ...c.digits];
    const place = PLACES[k];
    const parts: string[] = [];
    const sum = terms.length > 1 ? `${c.carryIn > 0 ? "the carried " : ""}${terms.join(" + ")} = ${count(c.total, k)}` : `only the ${c.digits.length === 0 ? "carried " : ""}${c.total}, which is ${count(c.total, k)}`;
    if (c.carryOut > 0 && k + 1 < PLACES.length) {
      parts.push(`${place}: ${sum}, which is ${count(c.carryOut, k + 1)} and ${count(c.write, k)}`);
      parts.push(`write ${c.write} in the ${place} and carry ${c.carryOut} to the ${PLACES[k + 1]}`);
    } else {
      parts.push(`${place}: ${sum}`);
      parts.push(`write ${c.write} in the ${place}`);
    }
    written.push({ k, digit: c.write });
    const last = i === cols.length - 1;
    parts.push(last && pkg.operation.kind === "add" ? `the answer is ${answerOf(pkg) ?? ""}`.trim() : `written so far: ${writtenText(written)}`);
    out.set(c.id, { place, operation: "add", operands: terms, value: c.total, after: parts.join("; ") });
  }
  return out;
}

/** A multiplication's digit steps and rows: each product, its carry and the row so far. */
function multiplyStates(pkg: OperationPackage): Map<string, Omit<ReviewStep, "step">> {
  const out = new Map<string, Omit<ReviewStep, "step">>();
  const rows = new Map<string, number>();
  for (const st of pkg.steps) {
    if (st.kind === "multiply-digit") {
      const m = st as Mul;
      const k = idx(m.place) + Math.max(0, idx(m.row));
      const so = (rows.get(m.row) ?? 0) + (m.write ?? 0) * 10 ** Math.max(0, k);
      rows.set(m.row, so);
      const row = `the ${m.row} row`;
      if (m.top === null) {
        out.set(m.id, { place: m.place, operation: "write the carry", operands: [m.carryIn], value: m.write ?? m.carryIn, after: `write the carried ${m.carryIn}; ${row} is now ${commas(so)}` });
        continue;
      }
      const eq = `${m.top} × ${m.multiplier}${m.carryIn > 0 ? ` + the carried ${m.carryIn}` : ""} = ${m.total}`;
      const carry = m.carryOut > 0 ? ` and carry ${m.carryOut}` : "";
      out.set(m.id, { place: m.place, operation: m.carryIn > 0 ? "multiply, then add the carry" : "multiply", operands: [m.top, m.multiplier, ...(m.carryIn > 0 ? [m.carryIn] : [])], value: m.total, after: `${eq}; write ${m.write ?? 0}${carry}; ${row} so far: ${commas(so)}` });
    } else if (st.kind === "partial-product") {
      const by = st.multiplier * 10 ** st.zeros;
      const top = Number(pkg.operation.operands[0]);
      out.set(st.id, { place: `the ${st.row} row`, operation: "multiply", operands: [top, by], value: st.value, after: `the ${st.row} row: ${commas(top)} × ${commas(by)} = ${commas(st.value)}` });
    } else if (st.kind === "place-point") {
      out.set(st.id, { operation: "put the point", operands: [st.product, st.decimals], value: st.value, after: `${commas(st.product)} with ${st.decimals} ${st.decimals === 1 ? "digit" : "digits"} after the point is ${st.value}` });
    } else if (st.kind === "divide-digit") {
      const d = st as Div;
      const divisor = d.quotient > 0 ? d.product / d.quotient : Number(pkg.operation.operands[1]);
      const so = (rows.get("quotient") ?? 0) * 10 + (d.write ?? 0);
      rows.set("quotient", so);
      const rest = d.remainder > 0 ? ` remainder ${d.remainder}` : "";
      out.set(d.id, { place: d.place, operation: "divide", operands: [d.current, divisor], value: d.remainder > 0 ? `${d.quotient} R ${d.remainder}` : d.quotient, after: `${d.current} ÷ ${divisor} = ${d.quotient}${rest}, because ${d.quotient} × ${divisor} = ${d.product} and ${d.current} − ${d.product} = ${d.remainder}; write ${d.write ?? 0} above the ${d.place}; the quotient so far is ${commas(so)}, and ${d.remainder} is left` });
    }
  }
  return out;
}

/** One step of any other kind: its own facts. Null when code has no plain state for it. */
function otherState(pkg: OperationPackage, st: WorkedStep): Omit<ReviewStep, "step"> | null {
  switch (st.kind) {
    case "operate":
      return { operation: st.op, operands: [st.left, st.right], value: st.value, after: `${st.left} ${st.op} ${st.right} = ${st.value}; that leaves ${st.rest}` };
    case "read-digit": {
      const value = st.digit * st.worth;
      return { place: st.place, operation: "read the digit", operands: [st.place], value: st.digit, after: `the digit in the ${st.place} place is ${st.digit}; it is worth ${st.digit} ${st.place}, which is ${commas(value)}` };
    }
    case "place-worth":
      return { place: st.place, operation: "the value of the digit", operands: [st.digit, st.worth], value: st.value, after: `the ${st.digit} in the ${st.place} place is worth ${st.digit} ${st.place}, which is ${commas(st.value)}` };
    case "bigger":
      return { operation: "compare the digits", operands: [st.a, st.b], value: st.bigger, after: `${st.bigger} is bigger than ${st.bigger === st.a ? st.b : st.a}` };
    case "claim-compare": {
      const rel = st.relation === "equal" ? "equal to" : st.relation === "greater" ? "greater than" : "less than";
      return { operation: "compare", operands: [st.value, st.shown], value: st.holds ? "the claim is true" : "the claim is false", after: `the work makes ${commas(st.value)}; the claim says it is ${rel} ${commas(st.shown)}; ${commas(st.value)} is ${st.value === st.shown ? "equal to" : st.value > st.shown ? "greater than" : "less than"} ${commas(st.shown)}, so the claim is ${st.holds ? "true" : "false"}` };
    }
    case "inverse":
      return { operation: st.op, operands: [st.from, st.by], value: st.value, after: `after this step the equation is ${st.equation}` };
    case "check":
      return { operation: "check", operands: [st.expression], value: st.total, after: `with ${st.name} = ${st.value}, ${st.expression} = ${st.total}` };
    default:
      return null;
  }
}

/**
 * Code's facts per step of the question's tutor kind, in work order. A step code has no plain state for still names its
 * work and result (the kind's own step text). Empty for a question no tutor kind teaches.
 */
export function reviewSteps(pkg: OperationPackage): ReviewStep[] {
  let kind;
  try { kind = tutorKind(pkg); } catch { return []; }
  const facts = kind.steps(pkg);
  const states = new Map([...addStates(pkg), ...multiplyStates(pkg), ...(subtractStates(pkg) ?? [])]);
  return facts.map((f, i) => {
    const worked = pkg.steps.find((s) => s.id === f.id);
    // A place-value kind's step names a place: its digit step is the package's step of that place.
    const placed = worked ?? pkg.steps.find((s) => (s.kind === "read-digit" || s.kind === "place-worth") && s.place === f.place);
    const state = states.get(f.id) ?? (placed ? otherState(pkg, placed) : null);
    if (state) return { step: i + 1, ...(state.place ?? f.place ? { place: state.place ?? f.place } : {}), operation: state.operation, operands: state.operands, value: state.value, after: state.after };
    return { step: i + 1, ...(f.place ? { place: f.place } : {}), operation: "see the step's work", operands: [], value: f.result, after: f.work };
  });
}

/** The question's printed numbers split into places, before any work ("52 is 5 tens and 2 ones"), or null. */
export function reviewStart(pkg: OperationPackage): string | null {
  const op = pkg.operation;
  if (op.kind !== "add" && op.kind !== "subtract" && op.kind !== "multiply") return null;
  const nums = (op.operands as unknown[]).filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 10 && n < 10_000_000);
  if (nums.length === 0) return null;
  return nums.map((n) => `${commas(n)} is ${placesText(String(n).split("").reverse().map(Number))}`).join("; ");
}
