// The multiplication and division kind of the tutor core (D-345, Phase 2, family F2): facts (3 × 2), times 10 and
// multiples of ten (6 × 440 by partial products and their sum), word problems with both numbers in the text, division
// by a digit or a 2-digit number, and missing factors (2 × ? = 1340 by the inverse, 80 × ? = 11200 by dropping zeros,
// 244 × ? = 1464 by trying factors). No claim-compare or comparison step: true/false and spot-the-error are F4.
//
// Every fact comes from the package's own worked steps, and `fits` computes those steps again from the operation (and
// the printed missing number), so a stored package that differs keeps the controller (fail closed).
import { workedSteps, type MissingNumberStep, type OperationPackage, type WorkedStep } from "@/lib/question-package";
import { missingWork, readPrinted } from "../missing-number";
import { sayNumbers, sentencesOf } from "../say-check";
import { plainTeaching } from "../tutor";
import { expressionKey, noteFromEquation, type TutorCommand, type TutorKind, type TutorStepFact } from "../tutor-kind";

type MulStep = Extract<WorkedStep, { kind: "multiply-digit" }>;
type PartialStep = Extract<WorkedStep, { kind: "partial-product" }>;
type AddStep = Extract<WorkedStep, { kind: "add-column" }>;
type DivStep = Extract<WorkedStep, { kind: "divide-digit" }>;
type FrameStep = Extract<MissingNumberStep, { kind: "missing-frame" }>;
type ZerosStep = Extract<MissingNumberStep, { kind: "drop-zeros" }>;
type TryStep = Extract<MissingNumberStep, { kind: "try-factor" }>;
type AnyStep = WorkedStep | MissingNumberStep;

const PLACES = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands", "millions"] as const;
const placeIndex = (p: string) => (PLACES as readonly string[]).indexOf(p);

const stepsOf = (pkg: OperationPackage) => pkg.steps as AnyStep[];
const answerOf = (pkg: OperationPackage) => (pkg.answer.value.type === "number" ? pkg.answer.value.value : null);
const operandsOf = (pkg: OperationPackage) => pkg.operation.operands as [number, number];
/** Plain data equal at every depth, whatever the key order (a stored package keeps its own key order). */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
const isWhole = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;

/** The whole numbers a text holds as digits ("1,340" is 1340), never parts of a bigger number. */
function textNumbers(text: string): number[] {
  return [...text.replace(/(\d),(?=\d{3}\b)/g, "$1").matchAll(/(?<![\d.])\d+(?![\d.])/g)].map((m) => Number(m[0]));
}

/** "6 × 440 = ?" or "440 × 6 = ?"; "1340 ÷ 2 = ?". */
function printedOperation(text: string): { sign: "×" | "÷"; a: number; b: number } | null {
  const m = /^\s*(\d{1,7})\s*([×x÷])\s*(\d{1,7})\s*=\s*\?\s*$/i.exec(text);
  return m ? { sign: m[2] === "÷" ? "÷" : "×", a: Number(m[1]), b: Number(m[3]) } : null;
}

/** A word problem: both numbers of the operation stand in the text, and it is not about dice or chance. */
function story(pkg: OperationPackage): boolean {
  const [a, b] = operandsOf(pkg);
  const nums = textNumbers(pkg.text);
  if (/\b(?:die|dice|roll|rolls|spinner|likely|chance)\b/i.test(pkg.text)) return false;
  if (/[=?]\s*$/.test(pkg.text.trim()) && /[×x÷+\-−]\s*\d|\d\s*[×x÷+\-−]/.test(pkg.text)) return false;
  return /[a-z]{3,}/i.test(pkg.text) && nums.includes(a) && nums.includes(b);
}

/** What the question is: a product, a division, or a missing factor and how it is found. */
type Shape =
  | { kind: "multiply"; a: number; b: number }
  | { kind: "divide"; a: number; b: number; frame: FrameStep | null; zeros: ZerosStep | null; printed: { known: number; total: number; unknownFirst: boolean } | null }
  | { kind: "try"; frame: FrameStep; trial: TryStep };

function shapeOf(pkg: OperationPackage): Shape | null {
  const op = pkg.operation;
  if (op.kind !== "multiply" && op.kind !== "divide") return null;
  const [a, b] = op.operands as unknown[];
  if (!isWhole(a) || !isWhole(b) || (op.operands as unknown[]).length !== 2) return null;
  const answer = answerOf(pkg);
  if (answer === null) return null;
  const steps = stepsOf(pkg);
  if (steps.some((s) => s.kind === "claim-compare" || s.kind === "comparison" || s.kind === "comparison-count")) return null;
  if (op.kind === "multiply") {
    if (a < 1 || b < 1 || a * b !== answer || a * b > 9_999_999) return null;
    if (!steps.every((s) => ["multiply-digit", "partial-product", "add-column", "result"].includes(s.kind))) return null;
    if (!same(steps, workedSteps(op))) return null;
    const printed = printedOperation(pkg.text);
    const ok = printed ? printed.sign === "×" && ((printed.a === a && printed.b === b) || (printed.a === b && printed.b === a)) : story(pkg);
    return ok ? { kind: "multiply", a, b } : null;
  }
  if (b < 1 || a % b !== 0 || a / b !== answer || a > 999_999 || b > 999) return null;
  const miss = readPrinted(pkg.text);
  const work = miss && miss.sign === "×" ? missingWork(miss) : null;
  if (steps[0]?.kind === "missing-frame") {
    // A framed missing factor: the steps code computes from the printed equation, exactly.
    if (!work || work.answer !== answer || !same(steps, work.steps) || !same(op, work.operation)) return null;
    const frame = steps[0] as FrameStep;
    const trial = steps.find((s): s is TryStep => s.kind === "try-factor");
    if (trial) return { kind: "try", frame, trial };
    return { kind: "divide", a, b, frame, zeros: steps.find((s): s is ZerosStep => s.kind === "drop-zeros") ?? null, printed: miss };
  }
  if (!steps.every((s) => s.kind === "divide-digit" || s.kind === "result")) return null;
  if (!same(steps, workedSteps(op))) return null;
  // A missing factor printed as "2 × ? = 1340" and worked as 1340 ÷ 2; a printed division; or a word problem.
  if (miss) return miss.sign === "×" && miss.total === a && miss.known === b ? { kind: "divide", a, b, frame: null, zeros: null, printed: miss } : null;
  const printed = printedOperation(pkg.text);
  if (printed) return printed.sign === "÷" && printed.a === a && printed.b === b ? { kind: "divide", a, b, frame: null, zeros: null, printed: null } : null;
  return story(pkg) ? { kind: "divide", a, b, frame: null, zeros: null, printed: null } : null;
}

const fits = (pkg: OperationPackage) => shapeOf(pkg) !== null;
const shape = (pkg: OperationPackage) => shapeOf(pkg)!;

// ---------- Steps ----------

const mulSteps = (pkg: OperationPackage) => stepsOf(pkg).filter((s): s is MulStep => s.kind === "multiply-digit");
const partials = (pkg: OperationPackage) => stepsOf(pkg).filter((s): s is PartialStep => s.kind === "partial-product");
const sums = (pkg: OperationPackage) => stepsOf(pkg).filter((s): s is AddStep => s.kind === "add-column");
/** The division steps from the first quotient digit written (a 0 on the left of the quotient is not a board step). */
const divSteps = (pkg: OperationPackage) => {
  const all = stepsOf(pkg).filter((s): s is DivStep => s.kind === "divide-digit");
  const first = all.findIndex((s) => s.write !== null);
  return first < 0 ? all : all.slice(first);
};
/** The divisor the long division works with (after any zeros were dropped). */
const divisorOf = (pkg: OperationPackage) => operandsOf(pkg)[1];

const mulEq = (st: MulStep) => `${st.top} × ${st.multiplier}${st.carryIn > 0 ? ` + ${st.carryIn}` : ""} = ${st.total}`;
const divEq = (st: DivStep, d: number) => `${st.current} ÷ ${d} = ${st.remainder > 0 ? `${st.quotient} R ${st.remainder}` : st.quotient}`;

function steps(pkg: OperationPackage): TutorStepFact[] {
  const sh = shape(pkg);
  if (sh.kind === "try") {
    const t = sh.trial;
    const est = Math.floor(t.total / t.round);
    const tryLine = (v: number) => t.tries.find((x) => x.value === v);
    const near = [tryLine(t.value - 1), tryLine(t.value + 1)].filter(Boolean) as { value: number; product: number }[];
    const parts = [
      `${t.factor} is about ${t.round}, and ${t.round} × ${est} = ${t.round * est}, so try numbers near ${est}`,
      ...near.map((x) => `${t.factor} × ${x.value} = ${x.product}, which is too ${x.product > t.total ? "big" : "small"}`),
      `${t.factor} × ${t.value} = ${t.total}, so the missing number is ${t.value}`,
    ];
    return [{ id: t.id, work: parts.join("; "), result: t.value }];
  }
  if (sh.kind === "divide") {
    const d = divisorOf(pkg);
    return divSteps(pkg).map((st, i) => {
      const parts: string[] = [];
      if (i > 0) parts.push(`bring down ${st.digit} to make ${st.current}`);
      parts.push(`${divEq(st, d)}, because ${st.quotient} × ${d} = ${st.product} and ${st.current} − ${st.product} = ${st.remainder}`);
      parts.push(`write ${st.write ?? 0} above the ${st.place}`);
      return { id: st.id, place: st.place, work: parts.join("; "), result: st.write ?? 0 };
    });
  }
  const top = operandsOf(pkg)[0];
  const facts: TutorStepFact[] = [];
  for (const st of stepsOf(pkg)) {
    if (st.kind === "multiply-digit") {
      const where = st.row === "ones" ? ` in the ${placeIndex(st.place) >= 0 ? PLACES[placeIndex(st.place)] : st.place}` : "";
      if (st.top === null) facts.push({ id: st.id, place: st.row === "ones" ? st.place : undefined, work: `write the carried ${st.carryIn}${where}`, result: st.write ?? st.carryIn });
      else {
        const carry = st.carryOut > 0 ? ` and carry ${st.carryOut}` : "";
        facts.push({ id: st.id, ...(st.row === "ones" ? { place: st.place } : {}), work: `${mulEq(st)}; write ${st.write ?? 0}${where}${carry}`, result: st.write ?? 0 });
      }
    } else if (st.kind === "partial-product") {
      const by = st.multiplier * 10 ** st.zeros;
      const zeros = st.zeros === 1 ? "1 zero" : `${st.zeros} zeros`;
      facts.push({ id: st.id, place: `the ${st.row} row`, work: `the ${st.multiplier} is in the ${st.row}, so it means ${by}; ${top} × ${by} = ${st.value}, so this row starts with ${zeros}`, result: st.value });
    } else if (st.kind === "add-column") {
      const terms = [...st.digits, ...(st.carryIn > 0 ? [st.carryIn] : [])];
      const carry = st.carryOut > 0 ? ` and carry ${st.carryOut}` : "";
      facts.push({ id: st.id, place: st.place, work: terms.length === 1 ? `add the rows: bring down ${st.write} in the ${st.place}` : `add the rows: ${terms.join(" + ")} = ${st.total}; write ${st.write} in the ${st.place}${carry}`, result: st.write });
    }
  }
  return facts;
}

// ---------- Numbers ----------

function workValues(pkg: OperationPackage): number[] {
  const sh = shape(pkg);
  const out: number[] = [];
  if (sh.kind === "try") out.push(sh.trial.value, sh.trial.total, sh.frame.known, sh.frame.total);
  if (sh.kind === "divide") {
    if (sh.zeros) out.push(sh.zeros.toFrom, sh.zeros.toBy, sh.zeros.from, sh.zeros.by);
    if (sh.frame) out.push(sh.frame.from, sh.frame.by);
    for (const st of divSteps(pkg)) out.push(st.current, st.quotient, st.product, st.remainder, st.digit, ...(st.write === null ? [] : [st.write]));
  }
  for (const st of stepsOf(pkg)) {
    if (st.kind === "multiply-digit") out.push(st.total, st.carryIn, st.carryOut, ...(st.write === null ? [] : [st.write]));
    if (st.kind === "partial-product") out.push(st.value);
    if (st.kind === "add-column") out.push(st.total, st.write, st.carryOut);
  }
  return [...new Set(out)];
}

/** Named likely mistakes of this question: value and what it shows. */
function mistakes(pkg: OperationPackage): [number, string][] {
  const sh = shape(pkg);
  const answer = answerOf(pkg)!;
  const out: [number, string][] = [];
  const zeroShift = (n: number, what: string) => {
    if (n % 10 === 0 && n > 0) out.push([n / 10, `a likely mistake: a zero dropped from ${what}`]);
    out.push([n * 10, `a likely mistake: one zero too many in ${what}`]);
  };
  if (sh.kind === "multiply") {
    const { a, b } = sh;
    out.push([a + b, `a likely mistake: added ${a} and ${b} instead of multiplying`]);
    zeroShift(answer, "the product");
    if (a < 10 && b < 10) {
      out.push([a * (b + 1), `a likely mistake: one group too many (${a} × ${b + 1})`], [a * (b - 1), `a likely mistake: one group too few (${a} × ${b - 1})`]);
      out.push([b * (a + 1), `a likely mistake: one group too many (${b} × ${a + 1})`], [b * (a - 1), `a likely mistake: one group too few (${b} × ${a - 1})`]);
    }
    // A carry forgotten: each multiply digit written with no carry added in, and the last carry not written.
    const rows = new Map<string, MulStep[]>();
    for (const st of mulSteps(pkg)) rows.set(st.row, [...(rows.get(st.row) ?? []), st]);
    if (partials(pkg).length === 0) {
      const noCarry = mulSteps(pkg).filter((st) => st.top !== null).reduce((t, st) => t + ((st.top! * st.multiplier) % 10) * 10 ** placeIndex(st.place), 0);
      if (mulSteps(pkg).some((st) => st.carryIn > 0)) out.push([noCarry, "a likely mistake: a carry left out of the product"]);
      const noLast = mulSteps(pkg).filter((st) => st.top !== null).reduce((t, st) => t + (st.total % 10) * 10 ** placeIndex(st.place), 0);
      if (mulSteps(pkg).some((st) => st.top === null)) out.push([noLast, "a likely mistake: the last carry not written"]);
    }
    // A partial product in the wrong place: a row written without its zeros, then added.
    for (const p of partials(pkg)) {
      if (p.zeros > 0) out.push([answer - p.value + p.value / 10 ** p.zeros, `a likely mistake: the ${p.row} row put in the wrong place (without its ${p.zeros === 1 ? "zero" : "zeros"})`]);
      if (p.zeros > 0) out.push([p.value / 10 ** p.zeros, `a likely mistake: the ${p.row} row without its ${p.zeros === 1 ? "zero" : "zeros"}`]);
    }
    if (partials(pkg).length > 1) out.push([partials(pkg).reduce((t, p) => t + p.value / 10 ** p.zeros, 0), "a likely mistake: every row added with no zeros, so the partial products are in the wrong places"]);
  } else if (sh.kind === "divide") {
    const { a, b } = sh;
    const from = sh.printed?.total ?? a;
    const by = sh.printed?.known ?? b;
    out.push([from * by, `a likely mistake: multiplied ${from} by ${by} instead of dividing`]);
    if (from > by) out.push([from - by, `a likely mistake: took ${by} away from ${from} instead of dividing`]);
    // A 0 left out of the quotient (670 read as 67), or an extra one.
    const q = String(answer);
    for (let i = 0; i < q.length; i++) if (q[i] === "0" && q.length > 1) out.push([Number(q.slice(0, i) + q.slice(i + 1)), "a likely mistake: a 0 left out of the quotient"]);
    out.push([answer * 10, "a likely mistake: one zero too many in the quotient"]);
    if (sh.zeros) out.push([answer * 10 ** sh.zeros.zeros, `a likely mistake: the zeros taken off only one number (${sh.zeros.toFrom} ÷ ${sh.zeros.by} or ${sh.zeros.from} ÷ ${sh.zeros.toBy})`]);
  } else {
    const t = sh.trial;
    for (const x of t.tries) if (x.value !== t.value) out.push([x.value, `a likely mistake: ${t.factor} × ${x.value} = ${x.product}, which is too ${x.product > t.total ? "big" : "small"}`]);
    out.push([t.total * t.factor, `a likely mistake: multiplied ${t.total} by ${t.factor} instead of finding the missing factor`]);
    out.push([t.total - t.factor, `a likely mistake: took ${t.factor} away from ${t.total} instead of finding the missing factor`]);
  }
  for (const w of pkg.wrongAnswers ?? []) if (w.value.type === "number") out.push([w.value.value, `a likely mistake: ${w.description.replace(/\.$/, "").toLowerCase()}`]);
  return out.filter(([n]) => isWhole(n) && n !== answer);
}

function numberMeaning(pkg: OperationPackage, n: number): string {
  const sh = shape(pkg);
  const answer = answerOf(pkg)!;
  if (n === answer) return sh.kind === "multiply" ? "the right answer to the whole question" : "the right answer to the whole question (the missing number or the quotient)";
  const right: string[] = [];
  if (sh.kind === "try" && n === sh.trial.total) right.push(`the product to reach (${sh.trial.factor} × ${sh.trial.value} = ${sh.trial.total})`);
  if (sh.kind === "divide") {
    const d = divisorOf(pkg);
    if (sh.zeros && (n === sh.zeros.toFrom || n === sh.zeros.toBy)) right.push(`a number of the division after the zeros came off (${sh.zeros.toFrom} ÷ ${sh.zeros.toBy})`);
    for (const st of divSteps(pkg)) {
      if (n === st.write) right.push(`right for the ${st.place} digit of the quotient (${divEq(st, d)})`);
      else if (n === st.quotient) right.push(`right for the ${st.place} step (${divEq(st, d)})`);
      if (n === st.product) right.push(`right for the product of the ${st.place} step (${st.quotient} × ${d} = ${st.product})`);
      if (n === st.remainder) right.push(`right for what is left in the ${st.place} step (${st.current} − ${st.product} = ${st.remainder})`);
      if (n === st.current) right.push(`the number divided in the ${st.place} step`);
    }
  }
  for (const st of stepsOf(pkg)) {
    if (st.kind === "multiply-digit" && st.top !== null && (n === st.total || n === st.write)) right.push(`right for ${n === st.total ? "" : "the digit of "}${mulEq(st)}`);
    if (st.kind === "multiply-digit" && st.top === null && n === st.carryIn) right.push(`the carried ${st.carryIn}, written as it is`);
    if (st.kind === "multiply-digit" && st.carryOut > 0 && n === st.carryOut) right.push(`the carry of ${mulEq(st as MulStep)}`);
    if (st.kind === "partial-product" && n === st.value) right.push(`right for the ${st.row} row (${operandsOf(pkg)[0]} × ${st.multiplier * 10 ** st.zeros} = ${st.value})`);
    if (st.kind === "add-column" && (n === st.total || n === st.write)) right.push(`right for adding the rows in the ${st.place}`);
  }
  if (right.length) return [...new Set(right)].join("; ");
  if (workValues(pkg).includes(n)) return "a number of the work";
  const wrong = mistakes(pkg).filter(([v]) => v === n).map(([, why]) => why);
  if (wrong.length) return [...new Set(wrong)].join("; ");
  const [a, b] = operandsOf(pkg);
  const shown = sh.kind === "try" ? [sh.frame.known, sh.frame.total] : sh.kind === "divide" && sh.printed ? [sh.printed.known, sh.printed.total] : [a, b];
  if ([a, b, ...shown].includes(n)) return "a number of the question";
  if ([a, b, ...shown].some((x) => String(x).split("").map(Number).includes(n))) return "a digit of the question";
  return "not a value of this question";
}

function streamScope(pkg: OperationPackage): { numbers: number[]; expressions: string[] } {
  const sh = shape(pkg);
  const [a, b] = operandsOf(pkg);
  const answer = answerOf(pkg)!;
  const numbers = new Set<number>([a, b, answer, 1, 10, ...workValues(pkg), ...String(a).split("").map(Number), ...String(b).split("").map(Number)]);
  const ex = new Set<string>();
  const mul = (x: number, y: number) => ex.add(expressionKey([x, y], ["*"]));
  const div = (x: number, y: number) => ex.add(expressionKey([x, y], ["/"]));
  if (sh.kind === "multiply") {
    mul(a, b);
    for (const st of mulSteps(pkg)) if (st.top !== null) {
      mul(st.top, st.multiplier);
      numbers.add(st.top * st.multiplier);
      if (st.carryIn > 0) { ex.add(expressionKey([st.top, st.multiplier, st.carryIn], ["*", "+"])); ex.add(expressionKey([st.top * st.multiplier, st.carryIn], ["+"])); }
    }
    for (const p of partials(pkg)) { const by = p.multiplier * 10 ** p.zeros; mul(a, by); numbers.add(by); numbers.add(p.multiplier); if (p.zeros > 0) mul(p.multiplier, 10 ** p.zeros); numbers.add(10 ** p.zeros); }
    if (partials(pkg).length > 1) ex.add(expressionKey(partials(pkg).map((p) => p.value), partials(pkg).slice(1).map(() => "+")));
    for (const st of sums(pkg)) { const terms = [...st.digits, ...(st.carryIn > 0 ? [st.carryIn] : [])]; if (terms.length > 1) ex.add(expressionKey(terms, terms.slice(1).map(() => "+"))); }
  } else if (sh.kind === "divide") {
    div(a, b);
    mul(b, answer);
    if (sh.printed) { div(sh.printed.total, sh.printed.known); mul(sh.printed.known, answer); numbers.add(sh.printed.known).add(sh.printed.total); }
    if (sh.zeros) { div(sh.zeros.from, sh.zeros.by); div(sh.zeros.toFrom, sh.zeros.toBy); numbers.add(10 ** sh.zeros.zeros); }
    for (const st of divSteps(pkg)) { div(st.current, b); mul(st.quotient, b); ex.add(expressionKey([st.current, st.product], ["-"])); }
  } else {
    const t = sh.trial;
    div(t.total, t.factor);
    numbers.add(t.round).add(t.factor);
    for (const x of t.tries) { mul(t.factor, x.value); mul(t.round, x.value); numbers.add(x.value).add(x.product).add(t.round * x.value); }
    div(t.total, t.round);
  }
  return { numbers: [...numbers], expressions: [...ex] };
}

function stepQuestion(pkg: OperationPackage, done: readonly string[]): string | null {
  const sh = shape(pkg);
  const ask = (q: string) => (plainTeaching(q) ? q : null);
  const facts = steps(pkg).filter((st) => !done.includes(st.id));
  const next = facts[0];
  if (!next) return null;
  const step = stepsOf(pkg).find((s) => s.id === next.id);
  if (!step) return null;
  if (step.kind === "multiply-digit") return step.top === null ? null : ask(`What is ${step.top} times ${step.multiplier}${step.carryIn > 0 ? ` plus ${step.carryIn}` : ""}?`);
  if (step.kind === "partial-product") return ask(`What is ${operandsOf(pkg)[0]} times ${step.multiplier * 10 ** step.zeros}?`);
  if (step.kind === "add-column") {
    const terms = [...step.digits, ...(step.carryIn > 0 ? [step.carryIn] : [])];
    return terms.length > 1 ? ask(`What do you get for ${terms.join(" plus ")}?`) : null;
  }
  if (step.kind === "divide-digit") return ask(`What is ${step.current} divided by ${divisorOf(pkg)}?`);
  if (step.kind === "try-factor" && sh.kind === "try") return ask(`What is ${sh.trial.factor} times ${Math.floor(sh.trial.total / sh.trial.round)}?`);
  return null;
}

function notes(pkg: OperationPackage): string[] {
  const sh = shape(pkg);
  const answer = answerOf(pkg)!;
  if (sh.kind === "multiply") {
    const out = [`${sh.a} × ${sh.b} = ${answer}: multiplying is adding equal groups (${Math.min(sh.a, sh.b)} groups of ${Math.max(sh.a, sh.b)}).`];
    if (partials(pkg).length) out.push("Each row of a long multiplication is a partial product: the top number times one digit of the bottom number, with one 0 on the right for each place that digit stands to the left. The rows added give the product.");
    return out;
  }
  if (sh.kind === "divide") {
    const out: string[] = [];
    if (sh.printed) out.push(`${sh.printed.unknownFirst ? `? × ${sh.printed.known}` : `${sh.printed.known} × ?`} = ${sh.printed.total}: division undoes multiplication, so the missing number is ${sh.printed.total} ÷ ${sh.printed.known} = ${answer}. Check: ${sh.printed.known} × ${answer} = ${sh.printed.total}.`);
    if (sh.zeros) out.push(`${sh.zeros.from} ÷ ${sh.zeros.by} is the same as ${sh.zeros.toFrom} ÷ ${sh.zeros.toBy}: taking the same ${sh.zeros.zeros === 1 ? "zero" : `${sh.zeros.zeros} zeros`} off both numbers divides both by ${10 ** sh.zeros.zeros}, and the quotient stays the same.`);
    out.push("Long division works from the left: divide, multiply, subtract, then bring down the next digit.");
    return out;
  }
  return [`${sh.frame.known} × ? = ${sh.frame.total}: the missing factor is found by trying numbers and multiplying each one out; ${sh.trial.factor} is about ${sh.trial.round}, so ${sh.trial.total} ÷ ${sh.trial.round} gives a near guess.`];
}

// ---------- Board ----------

const DRAW_MULTIPLY = [
  { id: "digit", does: "writes the answer digit in the place given (\"place\": \"ones\", \"tens\", ...), with every work row it needs first" },
  { id: "note", does: "writes one true equation of numbers below the question (\"place\": \"6 × 4 = 24\")" },
];
const DRAW_ROWS = { id: "row", does: "writes the next partial product row of the long multiplication (6 × 40 = 240)" };
const DRAW_DIVIDE = [
  { id: "division", does: "lays out the long division (the divisor, the bracket and the dividend)" },
  { id: "step", does: "shows the next step of the long division: bring down, the quotient digit, the product and what is left" },
  { id: "note", does: "writes one true equation of numbers on the board (\"place\": \"14 ÷ 2 = 7\")" },
];
const DRAW_TRY = [
  { id: "try", does: "writes the next try below the question (\"place\": the number to try, such as \"6\")" },
  { id: "note", does: "writes one true equation of numbers on the board (\"place\": \"244 × 6 = 1464\")" },
];

function drawings(pkg: OperationPackage) {
  const sh = shape(pkg);
  if (sh.kind === "multiply") return partials(pkg).length ? [DRAW_ROWS, ...DRAW_MULTIPLY] : DRAW_MULTIPLY;
  return sh.kind === "divide" ? DRAW_DIVIDE : DRAW_TRY;
}

function drawingExamples(pkg: OperationPackage) {
  const sh = shape(pkg);
  if (sh.kind === "multiply") {
    const first = mulSteps(pkg).find((s) => s.top !== null);
    return [{ offer: "row", place: "" }, { offer: "digit", place: "ones" }, ...(first ? [{ offer: "note", place: mulEq(first) }] : [])];
  }
  if (sh.kind === "divide") {
    const st = divSteps(pkg)[0];
    return [{ offer: "division", place: "" }, { offer: "step", place: "" }, ...(st && st.remainder === 0 ? [{ offer: "note", place: `${st.current} ÷ ${divisorOf(pkg)} = ${st.quotient}` }] : [{ offer: "note", place: `${sh.b} × ${answerOf(pkg)} = ${sh.a}` }])];
  }
  return [{ offer: "try", place: String(sh.trial.value) }, { offer: "note", place: `${sh.trial.factor} × ${sh.trial.value} = ${sh.trial.total}` }];
}

const DIVISION_ID = "tutor-division";
/** A board column name the core lets through as an id: one word only. */
const oneWord = (place: string) => !/\s/.test(place);

function draw(pkg: OperationPackage, requests: readonly { offer: string; place?: string }[], drawn: readonly string[], noteId: (i: number) => string): { commands: TutorCommand[]; keys: string[] } {
  const sh = shape(pkg);
  const commands: TutorCommand[] = [];
  const keys: string[] = [];
  const has = (k: string) => drawn.includes(k) || keys.includes(k);
  let notes = 0;
  const note = (text: string | null, place: Record<string, unknown>) => {
    if (text) commands.push({ op: "write", id: noteId(notes++), text, place });
  };
  if (sh.kind === "multiply") {
    const multiRow = String(sh.b).length > 1;
    const answer = String(answerOf(pkg));
    // The board's work rows: p0 is the ones digit of the bottom number (a row of 0s when it is 0), p1 the tens...
    const rowValues = multiRow ? [...String(sh.b)].reverse().map((d, i) => (sh.a * Number(d) === 0 ? "0".repeat(i + 1) : String(sh.a * Number(d)) + "0".repeat(i))) : [];
    const putRow = (i: number) => {
      if (has(`row:${i}`)) return;
      commands.push({ op: "put", target: { objectId: "question", part: "row", rowId: `p${i}` }, value: rowValues[i] });
      keys.push(`row:${i}`);
    };
    const putDigit = (place: string) => {
      const at = placeIndex(place);
      if (at < 0 || at >= answer.length || !oneWord(place) || has(`digit:${place}`)) return;
      if (multiRow) rowValues.forEach((_, i) => putRow(i));
      commands.push({ op: "put", target: { objectId: "question", part: "cell", rowId: "answer", column: place }, value: answer[answer.length - 1 - at] });
      keys.push(`digit:${place}`);
    };
    for (const d of requests) {
      if (d.offer === "row" && multiRow) {
        const i = rowValues.findIndex((_, k) => !has(`row:${k}`));
        if (i >= 0) putRow(i);
      } else if (d.offer === "digit") {
        const place = d.place && placeIndex(d.place) >= 0 ? d.place : PLACES.find((p, i) => i < answer.length && !has(`digit:${p}`));
        if (place) putDigit(place);
      } else if (d.offer === "note" && d.place) note(noteFromEquation(d.place), { below: "question" });
    }
    return { commands, keys };
  }
  const where = () => (has("division") ? { below: DIVISION_ID } : { region: "main" });
  if (sh.kind === "divide") {
    const dsteps = divSteps(pkg);
    const layout = () => {
      if (has("division")) return;
      commands.push({ op: "division", id: DIVISION_ID, dividend: String(sh.a), divisor: String(sh.b), place: { region: "main" } });
      keys.push("division");
    };
    const target = (rowId: string, column?: string) => ({ objectId: DIVISION_ID, part: column ? "cell" : "row", rowId, ...(column ? { column } : {}) });
    for (const d of requests) {
      if (d.offer === "division") layout();
      else if (d.offer === "step") {
        const n = dsteps.findIndex((_, k) => !has(`step:${k + 1}`));
        if (n < 0 || !oneWord(dsteps[n].place)) continue;
        // Steps in order: every earlier step must be on the board first (the board refuses a step out of order).
        layout();
        const st = dsteps[n];
        if (n > 0) commands.push({ op: "put", target: target(`bring${n + 1}`), value: String(st.digit) });
        commands.push({ op: "put", target: target("quotient", st.place), value: String(st.quotient) });
        commands.push({ op: "put", target: target(`product${n + 1}`), value: String(st.product) });
        commands.push({ op: "put", target: target(`difference${n + 1}`), value: String(st.remainder) });
        keys.push(`step:${n + 1}`);
      } else if (d.offer === "note" && d.place) note(noteFromEquation(d.place), where());
    }
    return { commands, keys };
  }
  for (const d of requests) {
    if (d.offer === "try") {
      const v = Number(d.place);
      const t = sh.trial.tries.find((x) => x.value === v) ?? sh.trial.tries.find((x) => !has(`try:${x.value}`));
      if (!t || has(`try:${t.value}`)) continue;
      note(`${sh.trial.factor} × ${t.value} = ${t.product}`, { region: "main" });
      keys.push(`try:${t.value}`);
    } else if (d.offer === "note" && d.place) note(noteFromEquation(d.place), { region: "main" });
  }
  return { commands, keys };
}

// ---------- Claims ----------

const WORD_NUMBERS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const NUM = String.raw`(\d+|${Object.keys(WORD_NUMBERS).join("|")})`;
const valueOf = (w: string) => (/^\d+$/.test(w) ? Number(w) : WORD_NUMBERS[w.toLowerCase()]);

/**
 * The F2 claim forms the core does not read: which number is missing ("the missing number is 670"), equal groups ("6
 * groups of 440 is 2640"), halves and doubles ("half of 1340 is 670"), and "2 goes into 13 6 times". A form of these
 * the reader cannot read whole is refused (fail closed).
 */
function claimProblems(pkg: OperationPackage, sentence: string): string[] {
  const problems: string[] = [];
  const answer = answerOf(pkg);
  const text = sentence.replace(/(\d),(?=\d{3}\b)/g, "$1").toLowerCase();
  for (const m of text.matchAll(/\bthe missing (?:number|factor)\s+(?:is|=|must be|has to be)\s+(\d+)\b|\b(\d+)\s+is the missing (?:number|factor)\b/g)) {
    const n = Number(m[1] ?? m[2]);
    if (n !== answer) problems.push(`it says ${n} is the missing number, but it is ${answer}`);
  }
  const relation = String.raw`\s+(?:is|are|makes|make|equals|=|gives)\s+`;
  const grouped = new RegExp(String.raw`\b${NUM}\s+(?:groups|lots|sets|rows|jars|boxes|bags) of\s+${NUM}${relation}${NUM}\b`, "g");
  for (const m of text.matchAll(grouped)) {
    const [x, y, z] = [valueOf(m[1]), valueOf(m[2]), valueOf(m[3])];
    if (x * y !== z) problems.push(`it says ${x} groups of ${y} is ${z}, but it is ${x * y}`);
  }
  for (const m of text.matchAll(new RegExp(String.raw`\b(half|double|twice) of\s+${NUM}${relation}${NUM}\b|\b(double|twice)\s+${NUM}${relation}${NUM}\b`, "g"))) {
    const kind = m[1] ?? m[4];
    const [x, z] = m[1] ? [valueOf(m[2]), valueOf(m[3])] : [valueOf(m[5]), valueOf(m[6])];
    const want = kind === "half" ? x / 2 : x * 2;
    if (want !== z) problems.push(`it says ${kind} of ${x} is ${z}, but it is ${want}`);
  }
  if (/\bgoes into\b|\bgo into\b/.test(text)) {
    const m = new RegExp(String.raw`\b${NUM}\s+goes into\s+${NUM}\s+${NUM}\s+times\b`).exec(text);
    if (!m) problems.push("it says \"goes into\" in a form code cannot read");
    else {
      const [d, n, q] = [valueOf(m[1]), valueOf(m[2]), valueOf(m[3])];
      if (d === 0 || Math.floor(n / d) !== q) problems.push(`it says ${d} goes into ${n} ${q} times, but it is ${d === 0 ? "no" : Math.floor(n / d)} times`);
    }
  }
  // "? = 670" or "the ? is 670" said aloud as a number.
  for (const s of sentencesOf(sentence)) if (/\?\s*(?:=|is)\s*\d/.test(s)) {
    const n = sayNumbers(s.slice(s.indexOf("?"))).find((t) => t.q && t.q[1] === 1)?.q?.[0];
    if (n !== undefined && n !== answer) problems.push(`it says the ? is ${n}, but it is ${answer}`);
  }
  return problems;
}

export const multiplyKind: TutorKind = {
  id: "multiply",
  fits,
  steps,
  numberMeaning,
  workValues,
  streamScope,
  stepQuestion,
  drawings,
  drawingExamples,
  draw,
  claimProblems,
  notes,
};
