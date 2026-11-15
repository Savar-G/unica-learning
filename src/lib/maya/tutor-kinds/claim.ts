// The claim kind of the tutor core (D-345, Phase 2, family F4): true or false and yes or no claims ("Is 6 × 870
// greater than 5226? Circle yes or no.", "Noah says 7 × 9 = 72. Check with 72 ÷ 9. Is Noah right?"), spot the error
// ("6 × 830 = ? Answer given: 498."), and the closed comparisons ("True or false: 5/6 > 3/6.", "Which is bigger: 7 by 6
// squares, or 5 by 6 squares?", "Which is more likely when you roll a die?").
//
// The session package holds the operation's own worked steps, then one checked compare step: "claim" (claim-compare,
// claim.ts and spot-error.ts) or "compare" (comparison, question-package-comparison.ts). The answer is a word. This kind
// gives those steps as facts (stepText of each work step; its own text for the compare step, with the reason), and reads
// Maya's comparison and claim sentences: every one it reads must be true ("5220 is less than 5226", "Noah is not
// right", "the answer is no"). A package fits only when every step's text passes the core's math readers and this
// kind's own, so a step code cannot state truly keeps the controller (fail closed).
import { operationResult, operationText, stepText, type OperationPackage, type WorkedStep } from "@/lib/question-package";
import { comparisonAnswer, comparisonProblem, comparisonSides, comparisonWords, type ComparisonOperation } from "@/lib/question-package-comparison";
import { sessionClaim, type SessionClaim } from "../claim";
import { missingStepText } from "../missing-number-text";
import { equationHolds, equationsOf, sentencesOf } from "../say-check";
import { falseClaims } from "../tutor-math";
import { expressionKey, noteFromEquation, type TutorCommand, type TutorKind, type TutorStepFact } from "../tutor-kind";

type ClaimStep = Extract<WorkedStep, { kind: "claim-compare" }>;
type CompareStep = Extract<WorkedStep, { kind: "comparison" }>;

/** The work step kinds this kind states with code's own text. Any other step keeps the controller. */
const WORK_KINDS = new Set<WorkedStep["kind"]>([
  "add-column", "subtract-column", "multiply-digit", "partial-product", "divide-digit", "operate", "read-digit",
  "try-factor", "comparison-count", "claim-compare", "comparison",
]);
/** Framing steps: their facts go in the notes, never as steps of the brief. */
const FRAME_KINDS = new Set<WorkedStep["kind"]>(["missing-frame", "drop-zeros"]);

const claimStepOf = (pkg: OperationPackage) => pkg.steps.find((s): s is ClaimStep => s.kind === "claim-compare");
const compareStepOf = (pkg: OperationPackage) => pkg.steps.find((s): s is CompareStep => s.kind === "comparison");
const comparisonOp = (pkg: OperationPackage): ComparisonOperation | null =>
  pkg.operation.kind === "comparison" && comparisonProblem(pkg.operation) === null ? (pkg.operation as ComparisonOperation) : null;
const answerWord = (pkg: OperationPackage): string | null =>
  pkg.answer.value.type === "choice" || pkg.answer.value.type === "text" ? pkg.answer.value.value.toLowerCase() : null;
const isSpot = (pkg: OperationPackage) => pkg.item?.format === "spot-the-error";

/** The person whose claim the child checks ("Noah says 7 × 9 = 72."), or null. */
const personOf = (pkg: OperationPackage): string | null => /\b([A-Z][a-z]+) says\b/.exec(pkg.text)?.[1] ?? null;

// ---------- The claim's own facts ----------

/** What the computed side is called in a sentence: "6 × 870", "60 + 2 × 10", or a place-value read in words. */
function exprOf(pkg: OperationPackage): string {
  const op = pkg.operation;
  if (op.kind === "place-value") return "the value";
  return operationText(op);
}

/** "5220 is less than 5226", "5220 = 5220", "7 is not 6": the claim step's comparison, true by construction. */
function relationText(st: ClaimStep): string {
  if (st.relation === "equal") return st.value === st.shown ? `${st.value} = ${st.shown}` : `${st.value} is not ${st.shown}`;
  return `${st.value} is ${st.value > st.shown ? "greater" : st.value < st.shown ? "less" : "the same as"}${st.value === st.shown ? "" : " than"} ${st.shown}`;
}

function claimWork(pkg: OperationPackage, st: ClaimStep, c: SessionClaim): string {
  const read = pkg.steps.find((s): s is Extract<WorkedStep, { kind: "read-digit" }> => s.kind === "read-digit");
  const head = pkg.operation.kind === "place-value"
    ? read ? `the ${read.digit} is in the ${read.place}, so its value is ${st.value}` : `the digit in the ${"place" in pkg.operation ? pkg.operation.place : "place asked"} place is ${st.value}`
    : `${exprOf(pkg)} = ${st.value}`;
  const person = personOf(pkg);
  const verdict = isSpot(pkg)
    ? `so the answer given is ${st.holds ? "right" : "not right"}: the answer is ${c.word}${st.holds ? "" : `, and the fix is ${st.value}`}`
    : person ? `so ${person} is ${st.holds ? "right" : "not right"}: the answer is ${c.word}`
    : `so the claim is ${st.holds ? "true" : "false"}: the answer is ${c.word}`;
  return `${head}; ${relationText(st)}, ${verdict}`;
}

/** The compare step of a closed comparison, with its reason. */
function comparisonWork(op: ComparisonOperation, st: CompareStep): string {
  const [left, right] = [st.left, st.right];
  const bigger = left > right ? "greater" : "less";
  const word = comparisonAnswer(op).value;
  const [w0, w1] = comparisonWords(op);
  switch (op.context) {
    case "same-denominator":
      return `the pieces are the same size, so compare the numerators: ${left} is ${bigger} than ${right}, so ${left}/${op.denominator} is ${bigger} than ${right}/${op.denominator}: the answer is ${word}`;
    case "equal-pieces":
      return `the pieces are the same size: ${left} is ${bigger} than ${right}, so the answer is ${word}`;
    case "rectangle-areas":
      return `${left} squares is ${bigger} than ${right} squares, so ${left > right ? w0 : w1} is bigger: the answer is ${word}`;
    case "counter-counts":
      return `${left} red is ${bigger} than ${right} blue, so ${word} is more likely: the answer is ${word}`;
    case "die-events":
      return `${left} outcomes is ${bigger} than ${right} ${right === 1 ? "outcome" : "outcomes"}, so ${word} is more likely: the answer is ${word}`;
  }
}

/** One work step in words with true math; null when code has no true text for it. */
function workText(pkg: OperationPackage, st: WorkedStep): string | null {
  if (st.kind === "claim-compare") {
    const c = sessionClaim(pkg);
    return c ? claimWork(pkg, st, c) : null;
  }
  if (st.kind === "comparison") {
    const op = comparisonOp(pkg);
    return op ? comparisonWork(op, st) : null;
  }
  if (st.kind === "comparison-count") {
    const op = comparisonOp(pkg);
    const name = op?.context === "die-events" ? (st.side === "left" ? "even" : `less than ${op.operands[0]}`) : st.side;
    return `${name}: ${st.outcomes.join(", ")}, so ${st.value} ${st.value === 1 ? "outcome" : "outcomes"}`;
  }
  if (st.kind === "try-factor") return missingStepText(st).replace(/\.$/, "").replace(/\. /g, "; ");
  return stepText(st, pkg.operation).replace(/\.$/, "").replace(/\. /g, "; ");
}

/** Every number a step computes. */
function stepValues(st: WorkedStep): number[] {
  switch (st.kind) {
    case "add-column": return [st.total, st.write];
    case "subtract-column": return st.write === null ? [] : [st.write];
    case "multiply-digit": return [st.total, ...(st.write === null ? [] : [st.write])];
    case "partial-product": return [st.value];
    case "divide-digit": return [st.current, st.quotient, st.product, st.remainder, ...(st.write === null ? [] : [st.write])];
    case "operate": return [st.value];
    case "read-digit": return [st.digit, st.worth];
    case "try-factor": return [st.value, st.total, ...st.tries.flatMap((t) => [t.value, t.product])];
    case "comparison-count": return [st.value, ...st.outcomes];
    case "claim-compare": return [st.value];
    case "comparison": return [st.left, st.right];
    case "missing-frame": return [st.from, st.by];
    case "drop-zeros": return [st.toFrom, st.toBy];
    default: return [];
  }
}

/** The result of a step as the child says it. */
function stepResult(pkg: OperationPackage, st: WorkedStep): number | string {
  switch (st.kind) {
    case "add-column": return st.write;
    case "subtract-column": return st.write ?? 0;
    case "multiply-digit": return st.write ?? st.total;
    case "partial-product": return st.value;
    case "divide-digit": return st.write ?? st.quotient;
    case "operate": return st.value;
    case "read-digit": return st.digit;
    case "try-factor": return st.value;
    case "comparison-count": return st.value;
    case "claim-compare": return st.value;
    case "comparison": return answerWord(pkg) ?? "";
    default: return "";
  }
}

const placeOf = (st: WorkedStep): string | undefined => ("place" in st && typeof st.place === "string" ? st.place : undefined);

// ---------- Reading Maya's sentences ----------

const NUMBER = String.raw`\d+(?:\.\d+)?(?:\s*\/\s*\d+)?`;
const TERM = String.raw`${NUMBER}(?:\s+by\s+\d+)?`;
const OPWORD = String.raw`(?:\+|-|−|–|×|x|\*|÷|plus|minus|times|divided by)`;
const EXPR = String.raw`${TERM}(?:\s*${OPWORD}\s*${TERM})*`;
const NOUN = String.raw`(?:\s+(?:red|blue|squares?|outcomes?|pieces?|counters?|sixths?|marbles?|numbers?))?`;
const MORE = "greater|more|bigger|larger|higher";
const LESS = "less|smaller|fewer|lower";
/** "X is (not) greater than Y", "X > Y". */
const COMPARE_WORDS = new RegExp(String.raw`(${EXPR})${NOUN}\s+(?:is|are)\s+(not\s+)?(?:a\s+lot\s+|much\s+)?(${MORE}|${LESS})\s+than\s+(${EXPR})`, "gi");
const COMPARE_SIGNS = new RegExp(String.raw`(${EXPR})\s*([<>])\s*(${EXPR})`, "g");

/** The value of a term: "5220", "5/6", "7 by 6" (the area), or null. */
function termValue(raw: string): number | null {
  const t = raw.trim();
  const by = /^(\d+)\s+by\s+(\d+)$/.exec(t);
  if (by) return Number(by[1]) * Number(by[2]);
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (frac) return Number(frac[2]) === 0 ? null : Number(frac[1]) / Number(frac[2]);
  return /^\d+(?:\.\d+)?$/.test(t) ? Number(t) : null;
}

/** The value of an expression of terms, products and quotients first; null when code cannot read it. */
function exprValue(raw: string): number | null {
  const parts = raw.trim().split(new RegExp(String.raw`\s*(${OPWORD})\s*`, "i"));
  const terms = parts.filter((_, i) => i % 2 === 0).map(termValue);
  const ops = parts.filter((_, i) => i % 2 === 1).map((o) => o.toLowerCase());
  if (terms.some((x) => x === null)) return null;
  let total = 0;
  let term = terms[0]!;
  let sign = 1;
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k];
    const next = terms[k + 1]!;
    if (["×", "x", "*", "times"].includes(o)) term *= next;
    else if (["÷", "divided by"].includes(o)) { if (next === 0) return null; term /= next; }
    else { total += sign * term; sign = ["+", "plus"].includes(o) ? 1 : -1; term = next; }
  }
  return total + sign * term;
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** The false comparisons of numbers in a sentence, and those code cannot read (fail closed). */
function comparisonProblems(sentence: string): string[] {
  const problems: string[] = [];
  const text = sentence.replace(/(\d),(?=\d{3}\b)/g, "$1");
  for (const m of text.matchAll(COMPARE_WORDS)) {
    const [a, b] = [exprValue(m[1]), exprValue(m[4])];
    if (a === null || b === null) { problems.push(`code cannot read the comparison "${m[0]}"`); continue; }
    const more = new RegExp(`^(?:${MORE})$`, "i").test(m[3]);
    const holds = more ? a > b && !close(a, b) : a < b && !close(a, b);
    if (holds === !!m[2]) problems.push(`it says ${m[0].trim()}, which is false`);
  }
  for (const m of text.matchAll(COMPARE_SIGNS)) {
    const [a, b] = [exprValue(m[1]), exprValue(m[3])];
    if (a === null || b === null) { problems.push(`code cannot read the comparison "${m[0]}"`); continue; }
    if (!(m[2] === ">" ? a > b && !close(a, b) : a < b && !close(a, b))) problems.push(`it says ${m[0].trim()}, which is false`);
  }
  return problems;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The false claims of the answer word, the claim's truth, or who is right. */
function wordProblems(pkg: OperationPackage, sentence: string): string[] {
  const word = answerWord(pkg);
  if (word === null) return ["code cannot read this question's answer"];
  const problems: string[] = [];
  const s = sentence.toLowerCase().replace(/[’]/g, "'");
  const words = new Set<string>([word]);
  const claim = sessionClaim(pkg);
  const cmp = comparisonOp(pkg);
  if (claim) for (const c of claim.choices) words.add(c);
  if (cmp) for (const c of comparisonWords(cmp)) words.add(c.toLowerCase());
  const alt = [...words].sort((x, y) => y.length - x.length).map(escape).join("|");
  // "the answer is no", "we circle yes", "you tick no", "it's true", "the word is false", "the right answer is 7 by 6".
  const said = new RegExp(String.raw`\b(?:(?:the|your|our)\s+(?:right\s+|final\s+)?(?:answer|word)\s+(?:is|was)|(?:we|you|i)\s+(?:circle|tick|pick|choose|write)|circle|tick|it'?s|it\s+is|so)\s+(?:the\s+word\s+)?(not\s+)?(${alt})\b(?!\s+or\b)`, "g");
  for (const m of s.matchAll(said)) {
    // "Circle yes or no" names both choices; a question asks, it claims nothing.
    if (/\?\s*$/.test(s) || /\bor\b/.test(s.slice(m.index! + m[0].length, m.index! + m[0].length + 4))) continue;
    if ((m[2] === word) === !!m[1]) problems.push(`it says the answer is ${m[1] ? "not " : ""}${m[2]}, but the answer is ${word}`);
  }
  // "the claim is true", "the answer given is not right", "Noah is right".
  const holds = claim ? claim.holds : cmp ? word === comparisonWords(cmp)[0] && (cmp.context === "same-denominator" || cmp.context === "equal-pieces") : null;
  const person = personOf(pkg)?.toLowerCase();
  const subjects = [String.raw`the (?:claim|statement|sentence)`, String.raw`the answer given`, String.raw`the given answer`, ...(person ? [escape(person)] : [])].join("|");
  const truth = new RegExp(String.raw`\b(${subjects})\s+(?:is|was)\s+(not\s+)?(true|false|right|correct|wrong)\b`, "g");
  for (const m of s.matchAll(truth)) {
    if (holds === null) { problems.push(`code cannot check "${m[0]}" on this question`); continue; }
    if (/\?\s*$/.test(s)) continue;
    const positive = ["true", "right", "correct"].includes(m[3]) !== !!m[2];
    if (positive !== holds) problems.push(`it says ${m[0]}, but ${m[1]} is ${holds ? "true" : "not true"}`);
  }
  // A closed comparison's words: "even is more likely", "7 by 6 is bigger", "red is less likely".
  if (cmp && cmp.context !== "same-denominator" && cmp.context !== "equal-pieces") {
    const [w0, w1] = comparisonWords(cmp).map((w) => w.toLowerCase());
    const [left, right] = comparisonSides(cmp);
    const pick = new RegExp(String.raw`\b(${[w0, w1].sort((x, y) => y.length - x.length).map(escape).join("|")})(?:\s+(?:squares|counters|numbers?))?\s+(?:is|are)\s+(not\s+)?(?:the\s+)?(?:more|most|less|least|bigger|biggest|smaller|smallest|larger|greater)\b`, "g");
    for (const m of s.matchAll(pick)) {
      if (/\?\s*$/.test(s)) continue;
      const up = /\b(?:more|most|bigger|biggest|larger|greater)\b/.test(m[0].slice(m[1].length));
      const isLeft = m[1] === w0;
      const really = isLeft ? left > right : right > left;
      if ((up !== !!m[2]) !== really) problems.push(`it says ${m[0]}, which is false`);
    }
  }
  return problems;
}

function claimProblems(pkg: OperationPackage, sentence: string): string[] {
  return [...comparisonProblems(sentence), ...wordProblems(pkg, sentence)];
}

/** The core's math readers and this kind's: true for a text with only true math code can read. */
/** A division with a remainder ("15 ÷ 6 = 2 R 3"): falseClaims reads it whole, as the core does (tutor.ts). */
const REMAINDER_FORM = /\d+\s*(?:÷|\/|divided by)\s*\d+\s*(?:=|is|equals|makes)\s*\d+\s*(?:R|r|remainder|with a remainder of|with remainder)\s*\d+/g;

function trueMath(pkg: OperationPackage, text: string): boolean {
  return sentencesOf(text).every((x) =>
    equationsOf(x.replace(REMAINDER_FORM, " ")).every((e) => { const h = equationHolds(e); return h === null || h !== e.negated; }) &&
    falseClaims(x).length === 0 && claimProblems(pkg, x).length === 0);
}

// ---------- The kind ----------

function fitsShape(pkg: OperationPackage): boolean {
  const word = answerWord(pkg);
  if (word === null) return false;
  if (!pkg.steps.every((s) => s.kind === "result" || WORK_KINDS.has(s.kind) || FRAME_KINDS.has(s.kind))) return false;
  const claim = claimStepOf(pkg);
  const compare = compareStepOf(pkg);
  if (claim) {
    // The claim's computed side is what the operation gives, and its word is code's.
    const c = sessionClaim(pkg);
    if (!c || c.word !== word || compare) return false;
    if (pkg.operation.kind !== "place-value") {
      const result = operationResult(pkg.operation);
      if (result.type !== "number" || !close(result.value, claim.value)) return false;
    }
    const holds = claim.relation === "equal" ? close(claim.value, claim.shown) : claim.relation === "greater" ? claim.value > claim.shown : claim.value < claim.shown;
    return holds === claim.holds;
  }
  const op = comparisonOp(pkg);
  if (!op || !compare) return false;
  const [left, right] = comparisonSides(op);
  return compare.left === left && compare.right === right && comparisonAnswer(op).value.toLowerCase() === word;
}

function workSteps(pkg: OperationPackage): WorkedStep[] {
  return pkg.steps.filter((s) => s.kind !== "result" && !FRAME_KINDS.has(s.kind));
}

function steps(pkg: OperationPackage): TutorStepFact[] {
  return workSteps(pkg).map((st) => {
    const place = placeOf(st);
    return { id: st.id, ...(place ? { place } : {}), work: workText(pkg, st) ?? "", result: stepResult(pkg, st) };
  });
}

function fits(pkg: OperationPackage): boolean {
  if (!fitsShape(pkg)) return false;
  // Fail closed: every step must be stated with true math the readers check.
  return workSteps(pkg).every((st) => { const w = workText(pkg, st); return !!w && trueMath(pkg, `${w}.`); }) &&
    notes(pkg).every((x) => trueMath(pkg, x));
}

function workValues(pkg: OperationPackage): number[] {
  return [...new Set(pkg.steps.flatMap(stepValues))];
}

function numberMeaning(pkg: OperationPackage, n: number): string {
  const claim = claimStepOf(pkg);
  const compare = compareStepOf(pkg);
  const meanings: string[] = [];
  if (claim && close(n, claim.value)) meanings.push(`right: ${pkg.operation.kind === "place-value" ? "the value the question asks for" : `${exprOf(pkg)} = ${claim.value}`}; the child compares it with ${claim.shown}`);
  for (const st of workSteps(pkg)) {
    if (st.kind === "claim-compare") continue;
    if (stepValues(st).some((v) => close(v, n))) meanings.push(`right for the step "${(workText(pkg, st) ?? "").slice(0, 80)}"`);
  }
  if (compare && (close(n, compare.left) || close(n, compare.right))) meanings.push("right: one side of the comparison");
  if (meanings.length) return meanings.join("; ");
  if (claim && close(n, claim.shown)) {
    return isSpot(pkg)
      ? `the answer given on the page, which the child checks: it is not what the work gives (${claim.value})`
      : `the number printed in the claim, which the child checks against: it is not what the work gives (${claim.value})`;
  }
  if (claim && claim.value !== 0 && (close(n, claim.value / 10) || close(n, claim.value * 10))) return `a likely mistake: a zero lost or added (the work gives ${claim.value})`;
  const op = pkg.operation;
  if (op.kind === "comparison" && op.context === "rectangle-areas") {
    const [a, b, c, d] = op.operands;
    if (n === a + b || n === c + d) return "a likely mistake: added the two sides instead of multiplying them";
  }
  const printed = [...(op.operands as unknown[]).filter((v): v is number => typeof v === "number"), ...(pkg.text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)];
  if (printed.some((v) => close(v, n))) return "a number of the question";
  return "not a value of this question";
}

function streamScope(pkg: OperationPackage): { numbers: number[]; expressions: string[] } {
  const op = pkg.operation;
  const printed = [...(op.operands as unknown[]).filter((v): v is number => typeof v === "number"), ...(pkg.text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)];
  const claim = claimStepOf(pkg);
  const numbers = [...new Set([...printed, ...workValues(pkg), ...(claim ? [claim.shown, claim.value] : []), 1, 10])];
  const expressions: string[] = [];
  const sign = op.kind === "multiply" || op.kind === "decimal-multiply" ? "*" : op.kind === "divide" ? "/" : op.kind === "add" || op.kind === "decimal-add" ? "+" : op.kind === "subtract" || op.kind === "decimal-subtract" ? "-" : null;
  if (sign && typeof op.operands[0] === "number" && typeof op.operands[1] === "number") expressions.push(expressionKey([op.operands[0], op.operands[1]], [sign]));
  for (const st of pkg.steps) {
    if (st.kind === "operate") expressions.push(expressionKey([st.left, st.right], [st.op === "×" ? "*" : st.op === "÷" ? "/" : st.op === "+" ? "+" : "-"]));
    if (st.kind === "multiply-digit" && st.top !== null) expressions.push(expressionKey([st.top, st.multiplier], ["*"]));
    if (st.kind === "add-column" && st.digits.length + (st.carryIn ? 1 : 0) > 1) { const t = [...st.digits, ...(st.carryIn ? [st.carryIn] : [])]; expressions.push(expressionKey(t, t.slice(1).map(() => "+"))); }
    if (st.kind === "divide-digit" && typeof op.operands[1] === "number") expressions.push(expressionKey([st.current, op.operands[1]], ["/"]), expressionKey([st.quotient, op.operands[1]], ["*"]));
    if (st.kind === "try-factor") for (const t of st.tries) expressions.push(expressionKey([st.factor, t.value], ["*"]));
  }
  return { numbers, expressions: [...new Set(expressions)] };
}

/** The first whole-number operation of a step's text ("Multiply the tens: 6 × 4 + 2 = 14" gives "6 × 4 + 2"), or null. */
const OPERATION_IN = /(\d+(?:\s*[+\-−×÷]\s*\d+)+)\s*=/;

/**
 * The next open step's question in a closed plain form (the core's PLAIN_FORMS): "What is 6 × 4 + 2?", "Is 1440
 * greater than 1436?", "Which is bigger, 42 or 30?", "What is the digit in the thousands place?". Null for a step with
 * no such form (a carried digit written, a count of outcomes): then the core's own line is used.
 */
function stepQuestion(pkg: OperationPackage, done: readonly string[]): string | null {
  const next = workSteps(pkg).find((st) => !done.includes(st.id));
  if (!next) return null;
  switch (next.kind) {
    case "claim-compare":
      if (!Number.isInteger(next.value) || !Number.isInteger(next.shown)) return null;
      return next.relation === "equal" ? `Is ${next.value} the same as ${next.shown}?` : `Is ${next.value} ${next.relation === "greater" ? "greater" : "less"} than ${next.shown}?`;
    case "comparison":
      return `Which is bigger, ${next.left} or ${next.right}?`;
    case "read-digit":
      return `What is the digit in the ${next.place} place?`;
    case "comparison-count":
      return null;
    default: {
      const m = OPERATION_IN.exec(workText(pkg, next) ?? "");
      return m ? `What is ${m[1].replace(/\s+/g, " ")}?` : null;
    }
  }
}

/** The true integer equations of the work, as a note may show them. */
function equationNotes(pkg: OperationPackage): string[] {
  const out: string[] = [];
  const claim = claimStepOf(pkg);
  const op = pkg.operation;
  if (claim && op.kind !== "place-value") {
    const t = noteFromEquation(`${operationText(op)} = ${claim.value}`);
    if (t) out.push(t);
  }
  for (const st of pkg.steps) {
    if (st.kind === "operate") { const t = noteFromEquation(`${st.left} ${st.op} ${st.right} = ${st.value}`); if (t) out.push(t); }
  }
  return [...new Set(out)];
}

const DRAWINGS = [{ id: "note", does: "writes one true equation of numbers on the board (\"place\": \"6 × 870 = 5220\")" }];

function draw(pkg: OperationPackage, requests: readonly { offer: string; place?: string }[], drawn: readonly string[], noteId: (i: number) => string): { commands: TutorCommand[]; keys: string[] } {
  const commands: TutorCommand[] = [];
  const keys: string[] = [];
  let n = 0;
  for (const d of requests) {
    if (d.offer !== "note") continue;
    // A note the model names, rebuilt from its values; with no equation, the claim's own one.
    const text = (d.place ? noteFromEquation(d.place) : null) ?? (d.place ? null : equationNotes(pkg)[0] ?? null);
    if (!text) continue;
    const key = `note:${text}`;
    if (drawn.includes(key) || keys.includes(key)) continue;
    // A claim question has no columns object on the board: the note goes in the main region.
    commands.push({ op: "write", id: noteId(n++), text, place: { region: "main" } });
    keys.push(key);
  }
  return { commands, keys };
}

function notes(pkg: OperationPackage): string[] {
  const out: string[] = [];
  for (const st of pkg.steps) if (st.kind === "missing-frame" || st.kind === "drop-zeros") out.push(missingStepText(st));
  const claim = claimStepOf(pkg);
  if (claim) out.push(isSpot(pkg)
    ? `The page gives the answer ${claim.shown}. The child works the question, checks the answer given, ticks yes or no, and writes the fix when it is not right.`
    : `The claim's number is ${claim.shown}. The child works the left side, compares it with ${claim.shown}, then circles one word.`);
  const op = comparisonOp(pkg);
  if (op) out.push(`The child compares the two sides, then gives one word: ${comparisonWords(op).join(" or ")}.`);
  return out;
}

export const claimKind: TutorKind = {
  id: "claim",
  fits,
  steps,
  numberMeaning,
  workValues,
  streamScope,
  stepQuestion,
  drawings: (pkg) => (equationNotes(pkg).length ? DRAWINGS : []),
  drawingExamples: (pkg) => equationNotes(pkg).slice(0, 1).map((place) => ({ offer: "note", place })),
  draw,
  claimProblems,
  notes,
};
