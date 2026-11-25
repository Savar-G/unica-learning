// What the marks and clauses of worked steps must be, for an answer that is one whole number. It knows no shape:
// it parses each step with the closed clause grammar and compares marks, clauses, carries and the answer.
import { STEP_MARKS, type Answer, type Step, type StepMark } from "../contract";
import { hasNames } from "./shape-registration";
import { parseStep, type StepClause } from "./steps-evaluator";

const isMark = (mark: StepMark): boolean =>
  hasNames(mark, ["mark", "place", "digit"]) && STEP_MARKS.includes(mark.mark) && Number.isSafeInteger(mark.place) && mark.place >= 0 && typeof mark.digit === "string" && /^\d$/.test(mark.digit);

const marksOf = ({ marks }: Step, kind: StepMark["mark"]) => marks.filter((m) => m.mark === kind);

/** The digits of the marks, the highest place first. A place between them that no mark has prints as "?". */
function digitsOf(marks: readonly StepMark[]): string {
  const byPlace = new Map(marks.map((m) => [m.place, m.digit]));
  const places = [...byPlace.keys()];
  return Array.from({ length: places.length === 0 ? 0 : Math.max(...places) + 1 }, (_, i) => byPlace.get(i) ?? "?").reverse().join("");
}

function clauseOf<K extends StepClause["kind"]>(clauses: readonly StepClause[], kind: K): Extract<StepClause, { kind: K }> | undefined {
  return clauses.find((c): c is Extract<StepClause, { kind: K }> => c.kind === kind);
}

/** Checks one working step against the closed clause grammar, the incoming carry and its marks. */
function stepProblem(step: Step, index: number, isLast: boolean, incomingCarry: StepMark | undefined): { problem: string | null; carry: StepMark | undefined } {
  const at = `the step "${step.text}"`;
  const parsed = parseStep(step.text);
  if (parsed.problem) return { problem: `${at}: ${parsed.problem}`, carry: undefined };
  if (parsed.answerOnly) return { problem: `${at} has no equation`, carry: undefined };
  const eq = clauseOf(parsed.clauses, "equation");
  if (!eq || eq.value === null) return { problem: `${at} has no whole-number equation`, carry: undefined };
  const plus = clauseOf(parsed.clauses, "plus");
  const write = clauseOf(parsed.clauses, "write");
  const carryClause = clauseOf(parsed.clauses, "carry");

  if (index === 0 && plus) return { problem: `the first step adds ${plus.added}`, carry: undefined };
  const expectedAdded = incomingCarry ? BigInt(incomingCarry.digit) : undefined;
  if (plus?.added !== expectedAdded) {
    return { problem: `the step before carries ${incomingCarry?.digit ?? "nothing"} and ${at} adds ${plus ? String(plus.added) : "nothing"}`, carry: undefined };
  }

  const total = plus ? plus.result : eq.value;
  const writes = marksOf(step, "write").sort((a, b) => a.place - b.place);
  if (writes.length === 0) return { problem: `${at} writes nothing`, carry: undefined };
  if (writes.some((m, i) => m.place !== writes[0].place + i)) return { problem: `${at} writes places that are not next to each other`, carry: undefined };
  if (incomingCarry && writes[0].place !== incomingCarry.place) {
    return { problem: `the step before carries to the place ${incomingCarry.place} and ${at} does not write that place`, carry: undefined };
  }

  const carries = marksOf(step, "carry");
  if (carries.length > 1) return { problem: `${at} has ${carries.length} carries`, carry: undefined };
  const carryMark = carries.at(0);
  if (carryMark?.digit === "0") return { problem: `${at} carries 0`, carry: undefined };

  const writtenDigits = [...writes].reverse().map((m) => m.digit).join("");
  const expectedWrite = isLast ? String(total) : String(total % BigInt(10));
  const expectedCarry = !isLast && total >= BigInt(10) ? String(total / BigInt(10)) : undefined;

  if (!isLast && !write) return { problem: `${at} misses "write ${expectedWrite}"`, carry: undefined };
  if (write && write.digits !== expectedWrite) return { problem: `${at} says "write ${write.digits}" and must write "${expectedWrite}"`, carry: undefined };
  if (writtenDigits !== expectedWrite) return { problem: `${at} writes "${writtenDigits}" and must write "${expectedWrite}"`, carry: undefined };
  if (!isLast && writes.length !== 1) return { problem: `${at} writes ${writes.length} digits before the last column`, carry: undefined };

  if (carryClause?.digit !== expectedCarry) {
    return { problem: `${at} says ${carryClause ? `"carry ${carryClause.digit}"` : "no carry"} and must carry ${expectedCarry ?? "nothing"}`, carry: undefined };
  }
  if (carryMark?.digit !== expectedCarry) {
    return { problem: `${at} says ${carryClause ? `"carry ${carryClause.digit}"` : "no carry"} and carries ${carryMark?.digit ?? "nothing"}`, carry: undefined };
  }
  if (carryMark && carryMark.place !== writes[0].place + 1) {
    return { problem: `${at}: its carry stands at the place ${carryMark.place} and must stand at ${writes[0].place + 1}`, carry: undefined };
  }
  return { problem: null, carry: carryMark };
}

/**
 * What is wrong with the steps of a question that is not worked in columns, or null: each line before the answer is one
 * true equation, nothing is drawn, and the lines come to the value of each part.
 */
export function linesProblem(steps: readonly Step[], { parts }: Answer): string | null {
  const wrong = steps.find((s) => !hasNames(s, ["text", "marks"]) || !Array.isArray(s.marks) || s.marks.length > 0);
  if (wrong) return `the step ${JSON.stringify(wrong)} is not a text that draws nothing`;
  const results = new Set<string>();
  for (const { text } of steps.slice(0, -1)) {
    const { clauses, answerOnly, problem } = parseStep(text);
    const [equation, ...more] = clauses;
    if (problem || answerOnly || equation?.kind !== "equation" || equation.value === null || more.length > 0) return `the step "${text}" is not one equation with a whole number`;
    results.add(String(equation.value));
  }
  const missing = parts.find((p) => !results.has(p.value));
  return missing ? `no step comes to "${missing.value}", the value of the part "${missing.name}"` : null;
}

/** What is wrong with the marks and clauses of the steps of one question, or null. */
export function marksProblem(steps: readonly Step[], answer: string): string | null {
  for (const step of steps) {
    if (!hasNames(step, ["text", "marks"]) || !Array.isArray(step.marks)) return `the step ${JSON.stringify(step)} is not a text with marks`;
    if (!step.marks.every(isMark)) return `the step "${step.text}" holds a mark that is not one`;
  }
  if (steps.length < 2) return `the steps write "" and not the answer "${answer}"`;
  if (steps.at(-1)?.marks.length !== 0) return "the last step draws something";
  if (steps.at(-1)?.text !== answer) return `the last step is "${steps.at(-1)?.text}" and not "${answer}"`;

  const writes = steps.flatMap((s) => marksOf(s, "write"));
  const twice = writes.find((m, i) => writes.findIndex((other) => other.place === m.place) !== i);
  if (twice) return `the steps write the place ${twice.place} more than once`;
  const far = writes.find((m) => m.place >= answer.length);
  if (far) return `the steps write the place ${far.place} and the answer is "${answer}"`;
  if (digitsOf(writes) !== answer) return `the steps write "${digitsOf(writes)}" and not the answer "${answer}"`;

  let incomingCarry: StepMark | undefined;
  const workingCount = steps.length - 1;
  for (let i = 0; i < workingCount; i++) {
    const { problem, carry } = stepProblem(steps[i], i, i === workingCount - 1, incomingCarry);
    if (problem) return problem;
    incomingCarry = carry;
  }
  return null;
}
