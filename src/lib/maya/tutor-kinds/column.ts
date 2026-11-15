// The column kind of the tutor core (D-345): 2-digit whole-number addition and subtraction, by place, with trades.
// The first kind of the registry, moved here from tutor.ts when the interface was frozen (tutor-kind.ts). F1 extends it
// to every size.
import type { OperationPackage, WorkedStep } from "@/lib/question-package";
import { expressionKey, noteFromEquation, type TutorCommand, type TutorKind, type TutorStepFact } from "../tutor-kind";

type ColumnStep = Extract<WorkedStep, { kind: "add-column" | "subtract-column" }>;

const isColumn = (s: WorkedStep): s is ColumnStep => s.kind === "add-column" || s.kind === "subtract-column";

/** Phase 1: a 2-digit whole-number addition or subtraction. */
function fits(pkg: OperationPackage): boolean {
  const op = pkg.operation;
  if (op.kind !== "add" && op.kind !== "subtract") return false;
  const [a, b] = op.operands;
  if (![a, b].every((n) => Number.isInteger(n) && n >= 10 && n <= 99)) return false;
  if (pkg.answer.value.type !== "number") return false;
  const work = pkg.steps.filter((s) => s.kind !== "result");
  const kind = op.kind === "add" ? "add-column" : "subtract-column";
  return work.length > 0 && work.every((s) => s.kind === kind);
}

const PLACE_ORDER = ["ones", "tens", "hundreds"] as const;
const placeLeft = (place: string) => PLACE_ORDER[PLACE_ORDER.indexOf(place as (typeof PLACE_ORDER)[number]) + 1] ?? null;

/** One column step as the tutor sees it: the numbers worked, its result, and the trade it needs. */
export interface TutorStep {
  id: string;
  place: string;
  /** The two numbers worked in this column after any trade (12 and 8 for the ones of 52 - 28; 7, 9 and a carry 0 for 27 + 39). */
  operands: number[];
  op: "+" | "-";
  /** The column's result before writing (12 - 8 = 4; 7 + 9 = 16). */
  total: number;
  /** The digit written in the answer. */
  write: number;
  /** Subtraction: this column took 1 ten from the left. Addition: this column carries 1 to the left. */
  trade: boolean;
  /** Subtraction: the top digit as printed, before the trade. */
  printedTop?: number;
}

export function tutorSteps(pkg: OperationPackage): TutorStep[] {
  return pkg.steps.filter(isColumn).map((st) => {
    if (st.kind === "subtract-column") {
      const top = st.top - (st.lent ? 1 : 0) + (st.regrouped ? 10 : 0);
      const bottom = st.bottom ?? 0;
      return { id: st.id, place: st.place, operands: [top, bottom], op: "-" as const, total: top - bottom, write: st.write ?? 0, trade: st.regrouped, printedTop: st.top };
    }
    const operands = st.carryIn ? [st.carryIn, ...st.digits] : [...st.digits];
    return { id: st.id, place: st.place, operands, op: "+" as const, total: st.total, write: st.write, trade: st.carryOut > 0 };
  });
}

const opWord = (op: "+" | "-") => (op === "+" ? "+" : "−");
export const stepEquation = (st: TutorStep) => `${st.operands.join(` ${opWord(st.op)} `)} = ${st.total}`;

/** Each step as plain facts for the brief, in the order a child works them. */
function steps(pkg: OperationPackage): TutorStepFact[] {
  return tutorSteps(pkg).map((st) => {
    const parts: string[] = [];
    if (st.op === "-" && st.trade) parts.push(`${st.printedTop} ${st.place} is too small to take ${st.operands[1]}: trade 1 ${placeLeft(st.place) === "tens" ? "ten" : placeLeft(st.place) ?? "ten"} for 10 ${st.place}, so ${st.printedTop} ${st.place} become ${st.operands[0]}`);
    if (st.op === "-" && st.printedTop !== undefined && st.operands[0] === st.printedTop - 1) parts.push(`1 ${st.place === "tens" ? "ten" : st.place} was traded away, so ${st.printedTop} ${st.place} are now ${st.operands[0]}`);
    parts.push(stepEquation(st));
    if (st.op === "+" && st.trade) parts.push(`write ${st.write} and carry 1 to the ${placeLeft(st.place)}`);
    else parts.push(`write ${st.write} in the ${st.place}`);
    return { id: st.id, place: st.place, work: parts.join("; "), result: st.write };
  });
}

/** What a number the child said means for this question: right, a known mistake, or not one of its values. */
function numberMeaning(pkg: OperationPackage, n: number): string {
  const answer = pkg.answer.value.type === "number" ? pkg.answer.value.value : null;
  const [a, b] = pkg.operation.operands as [number, number];
  const steps = tutorSteps(pkg);
  if (n === answer) return "the right answer to the whole question";
  const meanings: string[] = [];
  for (const [i, st] of steps.entries()) {
    if (n === st.write) meanings.push(`right for the ${st.place} digit (${stepEquation(st)})`);
    else if (n === st.total) meanings.push(`right for the ${st.place} (${stepEquation(st)})`);
    if (st.op === "-" && st.trade && n === st.operands[0]) meanings.push(`the ${st.place} after the trade (${st.printedTop} + 10)`);
    if (st.op === "-" && st.trade && st.printedTop !== undefined && n === st.operands[1] - st.printedTop) meanings.push(`a likely mistake: the small digit taken from the big one in the ${st.place} (${st.operands[1]} − ${st.printedTop}) instead of trading first`);
    if (st.op === "-" && st.printedTop !== undefined && st.operands[0] === st.printedTop - 1 && n === st.printedTop - st.operands[1]) meanings.push(`a likely mistake: the ${st.place} without taking away the traded ten (${st.printedTop} − ${st.operands[1]})`);
    if (st.op === "+" && i > 0 && steps[i - 1].trade && (n === st.total - 1 || n === (st.total - 1) % 10)) meanings.push(`a likely mistake: the ${st.place} without the carried 1`);
  }
  const sub = pkg.operation.kind === "subtract";
  if (sub && meanings.length === 0) {
    // Smaller-from-larger in every column (52 - 28 read as 36), and a trade without taking the ten away (52 - 28 read as 34).
    const digits = (x: number) => [x % 10, Math.floor(x / 10)];
    const [ta, tb] = [digits(a), digits(b)];
    const sfl = Math.abs(ta[1] - tb[1]) * 10 + Math.abs(ta[0] - tb[0]);
    if (n === sfl) meanings.push("a likely mistake: the smaller digit taken from the bigger one in each column, with no trade");
    const noDecrement = (ta[1] - tb[1]) * 10 + ((ta[0] + 10 - tb[0]) % 10);
    if (n === noDecrement && n !== answer) meanings.push("a likely mistake: traded for the ones but did not take the ten away from the tens");
  }
  if (!sub && meanings.length === 0) {
    const ones = (a % 10) + (b % 10);
    if (ones >= 10 && n === (Math.floor(a / 10) + Math.floor(b / 10)) * 10 + (ones % 10)) meanings.push("a likely mistake: forgot the carried 1 in the tens");
    if (ones >= 10 && n === (Math.floor(a / 10) + Math.floor(b / 10)) * 100 + ones) meanings.push("a likely mistake: wrote the whole ones total instead of carrying");
  }
  if (meanings.length) return meanings.join("; ");
  if (n === a || n === b) return "a number of the question";
  const digitsOf = (x: number) => [x % 10, Math.floor(x / 10)];
  if ([...digitsOf(a), ...digitsOf(b)].includes(n)) return "a digit of the question";
  return "not a value of this question";
}


/** Values of the work that are never a wrong answer: each column's result, digit and top after the trade. */
function workValues(pkg: OperationPackage): number[] {
  return tutorSteps(pkg).flatMap((st) => [st.write, st.total, st.operands[0]]);
}

/** The numbers and operations a streamed sentence may hold. */
function streamScope(pkg: OperationPackage): { numbers: number[]; expressions: string[] } {
  const steps = tutorSteps(pkg);
  const [a, b] = pkg.operation.operands as [number, number];
  const answer = pkg.answer.value.type === "number" ? pkg.answer.value.value : null;
  const numbers = [
    a, b, ...(answer === null ? [] : [answer]), a % 10, Math.floor(a / 10), b % 10, Math.floor(b / 10), 1, 10,
    ...steps.flatMap((st) => [...st.operands, st.total, st.write, ...(st.printedTop === undefined ? [] : [st.printedTop])]),
    ...steps.flatMap((st) => [st.total * (st.place === "tens" ? 10 : 1), st.write * (st.place === "tens" ? 10 : 1)]),
  ];
  const expressions = [
    expressionKey([a, b], [pkg.operation.kind === "add" ? "+" : "-"]),
    ...steps.flatMap((st) => {
      const op = st.op === "+" ? "+" : "-";
      const keys = [expressionKey(st.operands, st.operands.slice(1).map(() => op))];
      if (st.op === "-") keys.push(expressionKey([st.operands[1], st.operands[0]], ["-"]));
      if (st.op === "-" && st.printedTop !== undefined) keys.push(expressionKey([st.printedTop, 10], ["+"]), expressionKey([st.printedTop, 1], ["-"]), expressionKey([st.printedTop, st.operands[1]], ["-"]), expressionKey([st.operands[1], st.printedTop], ["-"]));
      if (st.op === "+") keys.push(expressionKey(st.operands.filter((_, i) => !(i === 0 && st.operands.length > 2)), st.operands.slice(2).map(() => "+")), expressionKey([st.total, 10], ["-"]));
      return keys;
    }),
  ];
  return { numbers, expressions };
}

/** The next open step's question, or the whole question when every step is done. */
function stepQuestion(pkg: OperationPackage, done: readonly string[]): string {
  const next = tutorSteps(pkg).find((st) => !done.includes(st.id));
  if (!next) {
    const [a, b] = pkg.operation.operands as [number, number];
    return `So what is ${a} ${pkg.operation.kind === "add" ? "plus" : "minus"} ${b}?`;
  }
  return `What do you get for ${next.operands.join(next.op === "+" ? " plus " : " minus ")}?`;
}

const DRAWINGS = [
  { id: "trade", does: "shows the next trade on the question (it crosses out a tens digit and gives the ones 10 more; for addition, the carried 1)" },
  { id: "digit", does: "writes the answer digit in the place given (\"place\": \"ones\" or \"tens\"), after the trade it needs" },
  { id: "note", does: "writes one true equation of numbers below the question (\"place\": \"12 − 8 = 4\")" },
];

/**
 * The commands for the model's drawing requests, in order, and the keys of what they drew. `drawn`: what the call drew
 * already (never twice: the board would refuse it, and a refused board must never cost the child Maya's words).
 * "trade": the next trade (a borrow in the top row, or a carry above the answer). "digit": an answer digit
 * (`place`: ones, tens, hundreds), with the trade it needs first. "note": a true equation written beside the question.
 */
function draw(pkg: OperationPackage, requests: readonly { offer: string; place?: string }[], drawn: readonly string[], noteId: (i: number) => string): { commands: TutorCommand[]; keys: string[] } {
  const steps = tutorSteps(pkg);
  const commands: TutorCommand[] = [];
  const keys: string[] = [];
  const has = (k: string) => drawn.includes(k) || keys.includes(k);
  const cell = (column: string) => ({ objectId: "question", part: "cell", rowId: "answer", column });
  const putDigit = (st: TutorStep) => {
    if (has(`digit:${st.place}`)) return;
    commands.push({ op: "put", target: cell(st.place), value: String(st.write) });
    keys.push(`digit:${st.place}`);
  };
  const trade = (st: TutorStep) => {
    if (!st.trade || has(`trade:${st.place}`)) return;
    const left = placeLeft(st.place);
    if (!left) return;
    if (st.op === "-") commands.push({ op: "regroup", id: `tutor-trade-${st.place}`, objectId: "question", rowId: "top", kind: "borrow", from: left, to: st.place });
    else {
      putDigit(st);
      commands.push({ op: "regroup", id: `tutor-carry-${st.place}`, objectId: "question", rowId: "answer", kind: "carry", from: st.place, to: left });
    }
    keys.push(`trade:${st.place}`);
  };
  let notes = 0;
  for (const d of requests) {
    if (d.offer === "trade") {
      const st = steps.find((x) => x.trade && !has(`trade:${x.place}`));
      if (st) trade(st);
    } else if (d.offer === "digit") {
      const st = steps.find((x) => x.place === d.place) ?? steps.find((x) => !has(`digit:${x.place}`));
      if (!st) continue;
      // Every trade to the right of this column first, so the board holds the method's own order.
      for (const x of steps) {
        if (x === st) break;
        trade(x);
        if (x.op === "-") putDigit(x);
      }
      trade(st);
      putDigit(st);
      // An addition's last carry writes its digit in the next place too (78 + 56: the 1 in the hundreds).
      const last = steps.at(-1)!;
      if (st === last && st.op === "+" && st.trade && !has("digit:hundreds")) {
        commands.push({ op: "put", target: cell(placeLeft(st.place)!), value: "1" });
        keys.push("digit:hundreds");
      }
    } else if (d.offer === "note" && d.place) {
      // Only a whole equation of numbers, rebuilt from its values: no other text reaches the board.
      const text = noteFromEquation(d.place);
      if (text) commands.push({ op: "write", id: noteId(notes++), text, place: { below: "question" } });
    }
  }
  return { commands, keys };
}

export const columnKind: TutorKind = {
  id: "column",
  fits,
  steps,
  numberMeaning,
  workValues,
  streamScope,
  stepQuestion,
  drawings: () => DRAWINGS,
  draw,
  // The core reads this kind's equations, place quantities and trades (tutor-math.ts).
  claimProblems: () => [],
  op: (pkg) => (pkg.operation.kind === "add" ? "add" : "subtract"),
};
