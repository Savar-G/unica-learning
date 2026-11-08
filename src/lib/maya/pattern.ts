// Closed pattern forms. The adapter checks the template separately. No stored book data changes.
import { operationResult, workedSteps, type Operation, type EasierExample } from "@/lib/question-package";

export type PatternForm = "missing3" | "missing9" | "term4" | "plant3" | "pair" | "days8";
export interface Pattern {
  form: PatternForm;
  start: number;
  step: number;
  count: number;
  missing: boolean;
  text: string;
  operation: Extract<Operation, { kind: "evaluate" }>;
}

/** Exact printed forms only. The step of a missing rule comes from the printed difference. */
export function readPattern(text: string): Pattern | null {
  const forms: [PatternForm, RegExp, number, boolean][] = [
    ["missing3", /^A pattern starts at (\d+) and adds \? each time\. The 3rd term is (\d+)\.$/, 2, true],
    ["missing9", /^A pattern starts at (\d+) and adds \? each time\. Its 9th term is (\d+)\.$/, 8, true],
    ["term4", /^A pattern starts at (\d+) and adds (\d+) each time\. What is the 4th term\?$/, 3, false],
    ["plant3", /^A plant is (\d+) cm tall and grows (\d+) cm each week\. How tall is it after 3 weeks\?$/, 3, false],
    ["pair", /^A pattern starts at (\d+) and adds (\d+) each time\. What is its 8th term plus its 2nd term\?$/, 8, false],
    ["days8", /^([A-Z][a-z]+) has (\d+) ([a-z]+) and gets (\d+) more each day\. How many \3 does \1 have after 8 days\?$/, 8, false],
  ];
  for (const [form, re, count, missing] of forms) {
    const m = re.exec(text);
    if (!m) continue;
    const start = Number(m[form === "days8" ? 2 : 1]);
    const other = Number(m[form === "days8" ? 4 : 2]);
    const step = missing ? (other - start) / count : other;
    // The increasing-rule template's own limits. No changes to generator limits.
    if (!Number.isSafeInteger(start) || start < 1 || start > 50 || !Number.isSafeInteger(step) || step < 1 || step > 12) return null;
    const expr = missing ? `(${other} − ${start}) ÷ ${count}`
      : form === "pair" ? `(${start} + 7 × ${step}) + (${start} + ${step})` : `${start} + ${count} × ${step}`;
    return { form, start, step, count, missing, text, operation: { kind: "evaluate", operands: [expr] } };
  }
  return null;
}

/** A pattern only when its printed relation and its checked operation agree exactly. */
export function patternOf(p: { text: string; operation: Operation | null } | null | undefined): Pattern | null {
  if (!p) return null;
  const pattern = readPattern(p.text);
  return pattern && JSON.stringify(pattern.operation) === JSON.stringify(p.operation) ? pattern : null;
}

/** Code-written synthetic example text with the same question shape. */
export function patternText(form: PatternForm, s: number, d: number): string {
  switch (form) {
    case "missing3": return `A pattern starts at ${s} and adds ? each time. The 3rd term is ${s + 2 * d}.`;
    case "missing9": return `A pattern starts at ${s} and adds ? each time. Its 9th term is ${s + 8 * d}.`;
    case "term4": return `A pattern starts at ${s} and adds ${d} each time. What is the 4th term?`;
    case "plant3": return `A plant is ${s} cm tall and grows ${d} cm each week. How tall is it after 3 weeks?`;
    case "pair": return `A pattern starts at ${s} and adds ${d} each time. What is its 8th term plus its 2nd term?`;
    case "days8": return `Leo has ${s} beads and gets ${d} more each day. How many beads does Leo have after 8 days?`;
  }
}

/** The checked forward additions and differences, and a missing step's multiplication fact (2 × 7 = 14). Scope uses these, never child-provided numbers. */
export function patternProblems(p: { text: string; operation: Operation }): EasierExample[] {
  const pattern = patternOf(p);
  if (!pattern) return [];
  return Array.from({ length: pattern.count }, (_, i) => {
    const a = pattern.start + i * pattern.step;
    const b = a + pattern.step;
    return [
      { kind: "add", operands: [a, pattern.step] },
      { kind: "subtract", operands: [b, a] },
    ] as Operation[];
  }).flat().concat(pattern.missing ? [{ kind: "multiply", operands: [pattern.count, pattern.step] }] : []).map(operation => ({ text: "", operation, answer: operationResult(operation), steps: [] }));
}

/** Two short table rows. Unknown terms and the missing rule stay hidden until the child supplies the answer. */
export function patternRows(p: { text: string; operation: Operation }, answered: boolean): string[] {
  const pattern = patternOf(p);
  if (!pattern) return [];
  const { start: s, step: d, count, missing, form } = pattern;
  // A long table names the omitted terms explicitly.
  const last = form === "pair" ? 7 : count;
  const places = last > 3 ? [0, 1, last] : Array.from({ length: last + 1 }, (_, i) => i);
  const terms = places.map(i => answered || i === 0 || (missing && i === count) ? String(s + i * d) : "?");
  if (last > 3) terms.splice(2, 0, "...");
  const step = missing && !answered ? "?" : String(d);
  return [terms.join("    "), `Add ${step} each time`];
}

/** Every value a pattern's checked parts make, the result included. */
function partValues(p: Pattern): number[] {
  return workedSteps(p.operation).flatMap(st => (st.kind === "operate" ? [st.value] : []));
}

/** The numbers the printed question shows: the start, and the step or the given term. */
const printedNumbers = (p: Pattern) => [p.start, p.missing ? p.start + p.count * p.step : p.step];

/** The form's own counts, the same in every pattern of the form ("÷ 2" for the 3rd term, "7 ×" for the 8th). */
const formCounts = (p: Pattern) => [p.form === "pair" ? 7 : p.count];

/**
 * Whether an easier pattern would give the question away (lessons 11 and 12): it writes the question's answer or one of its
 * part values anywhere (a form's count included), uses one of the question's own printed numbers, or has an answer that is
 * the question's answer times a power of 10 or its first digits.
 */
export function exampleGivesAway(question: Pattern, example: Pattern): boolean {
  const answer = partValues(question).at(-1)!;
  const hidden = new Set(partValues(question));
  const own = new Set(printedNumbers(question));
  const made = [...printedNumbers(example), ...partValues(example)];
  if ([...made, ...formCounts(example)].some(n => hidden.has(n)) || made.some(n => own.has(n))) return true;
  const small = partValues(example).at(-1)!;
  for (let k = 1; small * 10 ** k <= answer; k++) if (small * 10 ** k === answer) return true;
  return String(small).length < String(answer).length && String(answer).startsWith(String(small));
}
