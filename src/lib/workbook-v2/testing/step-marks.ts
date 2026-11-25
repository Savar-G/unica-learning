// What the marks and clauses of worked steps must be, for an answer that is one whole number. It knows no shape:
// it parses each step with the closed clause grammar and compares marks, clauses, carries and the answer. For a
// subtraction in columns it works on the paper: it starts from the two printed rows and applies each step in order.
import { STEP_MARKS, type Step, type StepMark } from "../contract";
import { canonicalJson } from "../hash";
import { hasNames, type Rows } from "./shape-registration";
import { clauseOf, parseStep, UNITS } from "./steps-evaluator";

type WrittenMark = Extract<StepMark, { mark: "write" | "carry" }>;

function isMark(mark: StepMark): boolean {
  if (!STEP_MARKS.includes(mark.mark) || !Number.isSafeInteger(mark.place) || mark.place < 0 || typeof mark.digit !== "string") return false;
  if (mark.mark === "write" || mark.mark === "carry") return hasNames(mark, ["mark", "place", "digit"]) && /^\d$/.test(mark.digit);
  return hasNames(mark, ["mark", "row", "place", "digit"]) && "row" in mark && mark.row === "top" && /^(\d|1[0-8])$/.test(mark.digit);
}

const marksOf = ({ marks }: Step, kind: WrittenMark["mark"]): WrittenMark[] => marks.filter((m): m is WrittenMark => m.mark === kind);

/** The digits of the marks, the highest place first. A place between them that no mark has prints as "?". */
function digitsOf(marks: readonly WrittenMark[]): string {
  const byPlace = new Map(marks.map((m) => [m.place, m.digit]));
  const places = [...byPlace.keys()];
  return Array.from({ length: places.length === 0 ? 0 : Math.max(...places) + 1 }, (_, i) => byPlace.get(i) ?? "?").reverse().join("");
}

/** The two printed rows of a column: their numbers from the ones, and the sign. */
interface Paper { sign: string; top: number[]; bottom: number[] }

function paperOf(rows: Rows): Paper | null {
  const found = rows.length === 2 ? /^(\d+)\n([-+])(\d+)$/.exec(rows.join("\n")) : null;
  return found && { sign: found[2], top: [...found[1]].reverse().map(Number), bottom: [...found[3]].reverse().map(Number) };
}

const write = (place: number, digit: number): StepMark => ({ mark: "write", place, digit: String(digit) });
const onTop = (mark: "cross-out" | "borrow", place: number, digit: number): StepMark => ({ mark, row: "top", place, digit: String(digit) });

/** One step that borrows for the column at `place`. It changes the numbers that the paper shows. */
function borrowProblem({ text, marks }: Step, { top, bottom }: Paper, place: number): string | null {
  const { clauses } = parseStep(text);
  const [unit, shown] = [clauseOf(clauses, "borrow")?.unit, clauseOf(clauses, "becomes")?.from];
  if (place >= top.length) return "comes after its last column";
  if (top[place] >= (bottom[place] ?? 0)) return `needs no borrow: the paper shows ${top[place]} above ${bottom[place] ?? 0}`;
  // A child borrows from the nearest place that has something to give.
  const from = top.findIndex((n, i) => i > place && n > 0);
  if (from === -1 || UNITS[from] !== unit) return `must borrow from the ${UNITS[from]}s, not from the ${unit}s`;
  if (top[from] !== shown) return `the paper shows ${top[from]} and not ${shown}`;
  const wanted = [onTop("cross-out", from, top[from]), onTop("borrow", from, top[from] - 1), onTop("borrow", from - 1, top[from - 1] + 10)];
  if (canonicalJson(marks) !== canonicalJson(wanted)) return `has the marks ${canonicalJson(marks)} and must have ${canonicalJson(wanted)}`;
  top[from] -= 1;
  top[from - 1] += 10;
  return null;
}

/** One step that subtracts the column at `place`. A zero in front of the answer is not written. */
function columnProblem({ text, marks }: Step, { top, bottom }: Paper, place: number, answer: string): string | null {
  if (place >= top.length) return "comes after its last column";
  const low = bottom.at(place);
  if (top[place] < (low ?? 0)) return `needs a borrow: the paper shows ${top[place]} above ${low}`;
  const { clauses } = parseStep(text);
  const [line, left] = [low === undefined ? String(top[place]) : `${top[place]} - ${low}`, top[place] - (low ?? 0)];
  const said = clauseOf(clauses, "equation")?.left ?? clauseOf(clauses, "digit")?.text;
  if (said !== line) return `says ${said} and the paper shows ${line}`;
  if (clauseOf(clauses, "plus")) return "adds a number";
  const isWritten = place < answer.length;
  const wanted = isWritten ? [write(place, left)] : [];
  if (canonicalJson(marks) !== canonicalJson(wanted)) return `has the marks ${canonicalJson(marks)} and must have ${canonicalJson(wanted)}`;
  const words = clauseOf(clauses, "write")?.digits;
  const isLast = place === top.length - 1;
  if (words === undefined && isWritten) return isLast ? null : `misses "write ${left}"`;
  return words === (isWritten ? String(left) : "") ? null : `must say "write ${isWritten ? left : "nothing"}"`;
}

function subtractionProblem(working: readonly Step[], answer: string, paper: Paper): string | null {
  let place = 0;
  for (const step of working) {
    const parsed = parseStep(step.text);
    if (parsed.problem) return `the step "${step.text}": ${parsed.problem}`;
    if (parsed.answerOnly) return `the step "${step.text}" has no equation`;
    const isBorrow = clauseOf(parsed.clauses, "borrow") !== undefined;
    const problem = isBorrow ? borrowProblem(step, paper, place) : columnProblem(step, paper, place, answer);
    if (problem) return `the step "${step.text}" ${problem}`;
    if (!isBorrow) place++;
  }
  // A first digit that became 0 has nothing below it and nothing to write.
  const left = paper.top.findIndex((n, i) => i >= place && (n > 0 || i < paper.bottom.length || i < answer.length));
  return left === -1 ? null : `the column at the place ${left} has no step`;
}

/** Checks one working step against the closed clause grammar, the incoming carry and its marks. */
function stepProblem(step: Step, index: number, isLast: boolean, incomingCarry: WrittenMark | undefined, paper: Paper | null): { problem: string | null; carry: WrittenMark | undefined } {
  const at = `the step "${step.text}"`;
  const parsed = parseStep(step.text);
  if (parsed.problem) return { problem: `${at}: ${parsed.problem}`, carry: undefined };
  if (parsed.answerOnly) return { problem: `${at} has no equation`, carry: undefined };
  if (clauseOf(parsed.clauses, "borrow") || step.marks.some((m) => m.mark === "borrow" || m.mark === "cross-out")) {
    return { problem: `${at} borrows and the printed rows are no subtraction`, carry: undefined };
  }
  const [eq, digit] = [clauseOf(parsed.clauses, "equation"), clauseOf(parsed.clauses, "digit")];
  if (digit && !paper) return { problem: `${at} has no equation`, carry: undefined };
  const value = eq ? eq.value : BigInt(digit?.text ?? 0);
  if (value === null) return { problem: `${at} has no whole-number equation`, carry: undefined };
  const plus = clauseOf(parsed.clauses, "plus");
  const write = clauseOf(parsed.clauses, "write");
  const carryClause = clauseOf(parsed.clauses, "carry");

  if (index === 0 && plus) return { problem: `the first step adds ${plus.added}`, carry: undefined };
  const expectedAdded = incomingCarry ? BigInt(incomingCarry.digit) : undefined;
  if (plus?.added !== expectedAdded) {
    return { problem: `the step before carries ${incomingCarry?.digit ?? "nothing"} and ${at} adds ${plus ? String(plus.added) : "nothing"}`, carry: undefined };
  }

  const total = plus ? plus.result : value;
  const writes = marksOf(step, "write").sort((a, b) => a.place - b.place);
  if (writes.length === 0) return { problem: `${at} writes nothing`, carry: undefined };
  if (writes.some((m, i) => m.place !== writes[0].place + i)) return { problem: `${at} writes places that are not next to each other`, carry: undefined };
  if (incomingCarry && writes[0].place !== incomingCarry.place) {
    return { problem: `the step before carries to the place ${incomingCarry.place} and ${at} does not write that place`, carry: undefined };
  }

  if (digit && paper) {
    const { place } = writes[0];
    if (place < paper.bottom.length) return { problem: `${at} has one digit and its column has a digit below`, carry: undefined };
    if (paper.top.at(place) !== Number(digit.text)) return { problem: `${at}: the paper shows ${paper.top.at(place)} and not ${digit.text}`, carry: undefined };
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

/** What is wrong with the marks and clauses of the steps of one question with these printed rows, or null. */
export function marksProblem(steps: readonly Step[], answer: string, rows: Rows): string | null {
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

  const paper = paperOf(rows);
  if (paper?.sign === "-") return subtractionProblem(steps.slice(0, -1), answer, paper);

  let incomingCarry: WrittenMark | undefined;
  const workingCount = steps.length - 1;
  for (let i = 0; i < workingCount; i++) {
    const { problem, carry } = stepProblem(steps[i], i, i === workingCount - 1, incomingCarry, paper);
    if (problem) return problem;
    incomingCarry = carry;
  }
  return null;
}
