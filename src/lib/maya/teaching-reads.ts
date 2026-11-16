// Small closed readers for the tutor's teaching (Savar's call 2, 2026-11-15). Each is code only, with no model guess,
// and each fails closed: a form it cannot read gives no flag, no refusal and no value.
//
// - `firstTimeTurn`: the child says they are new to the idea or lost ("I don't understand", "can you explain").
// - `echoesChild`: a question of Maya's that only says the child's own question back ("What is 2 minus 8?").
// - `selfCorrection`: a message that corrects itself ("3 tens... wait, 3 isn't it.").
// - `askedStep`: the value Maya's last open question asks for, and whether the child's number answers it, another part
//   of the work, or none ("How many ones do we have now?" asks 12; "Four" answers 12 take away 8).
// - `doneReply`: the child says they are done after the right answer ("no", "bye", "we're done").
import type { OperationPackage } from "@/lib/question-package";
import { tutorSteps } from "./tutor-kinds/column";

const SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const NUMBER = String.raw`(?:\d+|(?:${TENS.join("|")})(?:[- ](?:${SMALL.slice(1, 10).join("|")}))?|${SMALL.join("|")})`;

function numberOf(word: string): number | null {
  const w = word.toLowerCase().trim();
  if (/^\d+$/.test(w)) return Number(w);
  const small = SMALL.indexOf(w);
  if (small >= 0) return small;
  const [t, u] = w.split(/[- ]/);
  const tens = TENS.indexOf(t);
  if (tens < 0) return null;
  const unit = u === undefined ? 0 : SMALL.indexOf(u);
  return unit < 0 || unit > 9 ? null : (tens + 2) * 10 + unit;
}

const norm = (text: string) => text.replace(/[‘’ʼ]/g, "'").replace(/[−–]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

/** One subtraction or addition of two whole numbers in the words ("2 minus 8", "5 tens take away 1"). */
export interface Operation { a: number; op: "+" | "-"; b: number }

const OPERATION = new RegExp(String.raw`\b(${NUMBER})(?: (?:ones?|tens?|hundreds?))? (minus|take away|takeaway|subtract|plus|add) (${NUMBER})\b`, "g");

/** Every "A minus B" or "A plus B" of whole numbers in the text, in order. */
export function operationsIn(text: string): Operation[] {
  const out: Operation[] = [];
  for (const m of norm(text).matchAll(OPERATION)) {
    const a = numberOf(m[1]);
    const b = numberOf(m[3]);
    if (a === null || b === null) continue;
    out.push({ a, op: /plus|add/.test(m[2]) ? "+" : "-", b });
  }
  return out;
}

const valueOf = (o: Operation) => (o.op === "+" ? o.a + o.b : o.a - o.b);
const sameOperation = (x: Operation, y: Operation) => x.a === y.a && x.b === y.b && x.op === y.op;

/**
 * The child says they are new to the idea or lost: "I don't understand", "I don't get how", "can you explain", "teach
 * me", "first time", "I'm confused", "how do you do". A closed list of phrases; anything else is no flag.
 */
const FIRST_TIME = /\b(?:i (?:do not|don't|dont|still don't|really don't) (?:understand|get it|get how|get why|know how)|i'?m (?:so )?(?:confused|lost)|(?:can|could) you (?:please )?(?:explain|teach|show)|explain (?:it|this|that|how|to me|\d|(?:one|two|three|four|five|six|seven|eight|nine|ten)\b)|teach me|(?:my|the) first time|never (?:learned|done|did|seen|learnt)|how (?:do|does|did) (?:you|i|we|it) (?:do|work|subtract|add|borrow)|what does (?:borrow|borrowing|regroup|trade|trading|carry) mean)/;
export function firstTimeTurn(text: string): boolean {
  return FIRST_TIME.test(norm(text));
}

/**
 * A question of Maya's that says the child's own question back: a question sentence whose only operation is one the
 * child said, with no result in it ("What is 2 minus 8?" after "Can you explain 2 minus 8?"). A question about another
 * step of the work ("What is 12 minus 8?") is no echo.
 */
export function echoesChild(sentence: string, childTurn: string): boolean {
  const s = norm(sentence);
  if (!s.endsWith("?")) return false;
  const mine = operationsIn(s);
  if (mine.length !== 1) return false;
  const theirs = operationsIn(childTurn);
  return theirs.some((o) => sameOperation(o, mine[0]));
}

/**
 * A message that corrects itself in the middle: "wait", "I mean", "oops", "scratch that", or ", no," after other words.
 * A first "No," that answers the child is no self-correction.
 */
const SELF_CORRECTION = /\bwait\b\s*[,.!\u2026\u2014-]|\.\.\.\s*wait\b|\bi mean\b|\bi meant\b|\boops\b|\bscratch that\b|\blet me fix that\b|\w[^.?!]*,\s*no\s*,/;
export function selfCorrection(text: string): string | null {
  const m = SELF_CORRECTION.exec(norm(text));
  return m ? m[0].trim() : null;
}

/**
 * A sentence that denies the whole question's result with a number ("52 minus 28 isn't 3."). It is the wrong-answer
 * form for a wrong FINAL answer only.
 */
export function deniesWholeQuestion(sentence: string, pkg: OperationPackage): boolean {
  const [a, b] = pkg.operation.operands as [unknown, unknown];
  if (typeof a !== "number" || typeof b !== "number") return false;
  const op = pkg.operation.kind === "add" ? "+" : pkg.operation.kind === "subtract" ? "-" : null;
  if (!op) return false;
  const s = norm(sentence);
  if (!/\b(?:isn't|is not|does not equal|doesn't equal|isn't equal to|is not equal to)\b/.test(s)) return false;
  return operationsIn(s).some((o) => o.a === a && o.b === b && o.op === op);
}

/** One value of the work a child can be asked for, with how code names it to the model. */
interface WorkPart { value: number; label: string; question: string; place?: string }

/** The parts of a two-number column question's work, in work order (column kind only; else none). */
export function workParts(pkg: OperationPackage): WorkPart[] {
  const [a, b] = pkg.operation.operands as [unknown, unknown];
  if (typeof a !== "number" || typeof b !== "number" || (pkg.operation.kind !== "add" && pkg.operation.kind !== "subtract")) return [];
  let steps: ReturnType<typeof tutorSteps>;
  try { steps = tutorSteps(pkg); } catch { return []; }
  if (steps.length === 0) return [];
  const parts: WorkPart[] = [];
  const word = (op: "+" | "-") => (op === "+" ? "plus" : "minus");
  for (const st of steps) {
    if (st.op === "-") {
      if (st.trade && st.printedTop !== undefined && !st.lent) parts.push({ value: st.operands[0], label: `the ${st.place} after the trade (${st.printedTop} + 10)`, question: `What is ${st.printedTop} plus 10?`, place: st.place });
      if (st.lent && st.printedTop !== undefined) parts.push({ value: st.operands[0], label: `the ${st.place} after 1 was traded away (${st.printedTop} − 1)`, question: `What is ${st.printedTop} minus 1?`, place: st.place });
    }
    if (st.operands.length >= 2) parts.push({ value: st.total, label: `the ${st.place} step (${st.operands.join(st.op === "+" ? " + " : " − ")} = ${st.total})`, question: `What is ${st.operands.join(` ${word(st.op)} `)}?`, place: st.place });
  }
  const answer = pkg.answer.value.type === "number" ? pkg.answer.value.value : null;
  if (answer !== null) parts.push({ value: answer, label: `the whole answer (${a} ${pkg.operation.kind === "add" ? "+" : "−"} ${b} = ${answer})`, question: `What is ${a} ${pkg.operation.kind === "add" ? "plus" : "minus"} ${b}?` });
  return parts;
}

/**
 * The value one question of Maya's asks for, read in closed forms only, or null. `before`: the sentences of the same
 * message before the question, which state the work stage a place question asks about (review of #1113, P2).
 */
export function askedValue(question: string, pkg: OperationPackage, before = ""): WorkPart | null {
  const parts = workParts(pkg);
  if (parts.length === 0) return null;
  const q = norm(question);
  if (!q.endsWith("?")) return null;
  // 1. An operation of numbers in the question ("What is 12 take away 8?", "5 take away 1 is?"), one only.
  const ops = operationsIn(q);
  if (ops.length > 1) return null;
  if (ops.length === 1) {
    const v = valueOf(ops[0]);
    return parts.find((p) => p.value === v && p.question === `What is ${ops[0].a} ${ops[0].op === "+" ? "plus" : "minus"} ${ops[0].b}?`)
      ?? (v >= 0 ? { value: v, label: `${ops[0].a} ${ops[0].op === "+" ? "+" : "−"} ${ops[0].b} = ${v}`, question: `What is ${ops[0].a} ${ops[0].op === "+" ? "plus" : "minus"} ${ops[0].b}?` } : null);
  }
  // 2. The whole answer.
  if (/\b(?:whole|final) answer\b/.test(q)) return parts.at(-1) ?? null;
  // 3. "How many ones/tens ...": by the work stage the message states (review of #1113, P2). The place's result when the
  // question takes away or the message states that place's own subtraction ("12 minus 8 is 4. How many ones are
  // left?"); the place after its trade when the message states the trade and not the subtraction; else no read.
  const place = /\bhow many (ones|tens|hundreds)\b/.exec(q)?.[1];
  if (place) {
    const steps = tutorSteps(pkg);
    const st = steps.find((x) => x.place === place);
    if (!st) return null;
    const result = parts.find((p) => p.label.startsWith(`the ${place} step`)) ?? null;
    if (st.op === "+") return result;
    const context = `${norm(before)} ${q}`;
    const takes = /\b(?:take away|takeaway|minus|subtract|left after|after we take)\b/.test(q);
    const subtracted = st.operands.length >= 2 && operationsIn(context).some((o) => o.op === "-" && o.a === st.operands[0] && o.b === st.operands[1]);
    if (takes || subtracted) return result;
    const traded = /\b(?:trade|trades|traded|trading|borrow|borrowed|regroup\w*|gave 1 away|give 1 away|gave one away|take 1 ten away|took 1 ten away)\b/.test(context);
    if (traded && (st.trade || st.lent)) return parts.find((p) => p.label.startsWith(`the ${place} after`)) ?? null;
    return null;
  }
  // 4. "What do we write in the ones?"
  const write = /\bwhat (?:do|should|will|can) (?:we|you|i) write in the (ones|tens|hundreds)\b/.exec(q)?.[1];
  if (write) {
    const st = tutorSteps(pkg).find((x) => x.place === write);
    return st ? { value: st.write, label: `the ${write} digit (${st.write})`, question: `What do we write in the ${write}?`, place: write } : null;
  }
  return null;
}

/** Code's read of the child's number against the question Maya asked last (brief `asked`). */
export interface AskedRead {
  /** Maya's question, as she said it. */
  question: string;
  /** What it asks for, by code's own values. */
  asks: string;
  value: number;
  /** The child's number this turn, or null when they said none code reads. */
  childValue: number | null;
  /** "asked": the child's number answers it. "another": it is another value of the work (`another` names it). */
  fits: "asked" | "another" | "none" | "no_number";
  another?: string;
  /** Code's own question for the same value, in a closed form (code's honest line uses it). */
  codeQuestion: string;
}

/**
 * The question Maya asked that is still open, read from the call's turns, and the child's number against it. Maya's
 * newest message with a question code can read; it is open until the child says its value. Null when there is none.
 */
export function askedStep(pkg: OperationPackage, turns: readonly { speaker: "child" | "maya"; text: string }[], childValue: number | null): AskedRead | null {
  // The child turns after Maya's message, except the current one (the last turn).
  let i = turns.length - 1;
  while (i >= 0 && turns[i].speaker === "child") i--;
  const earlierChild: string[] = [];
  for (; i >= 0; i--) {
    const t = turns[i];
    if (t.speaker === "child") { earlierChild.push(t.text); continue; }
    const sentences = t.text.split(/(?<=[.?!])\s+/);
    const at = sentences.map((x) => x.trim().endsWith("?")).lastIndexOf(true);
    if (at < 0) continue;
    const q = sentences[at];
    // Review of #1113 (P2): the read is bound to the target question. A message that names the easier example, or says a
    // number the target's work never uses, may be about another problem: no read.
    if (!onTarget(t.text, pkg)) return null;
    const part = askedValue(q, pkg, sentences.slice(0, at).join(" "));
    if (!part) return null;
    // Answered on an earlier child turn: no open question.
    if (earlierChild.some((c) => numbersIn(c).includes(part.value))) return null;
    const parts = workParts(pkg);
    const other = childValue === null || childValue === part.value ? undefined : parts.find((p) => p.value === childValue);
    const fits = childValue === null ? "no_number" : childValue === part.value ? "asked" : other ? "another" : "none";
    return { question: q.trim(), asks: part.label, value: part.value, childValue, fits, ...(other ? { another: other.label } : {}), codeQuestion: part.question };
  }
  return null;
}

/** The numbers of the target's own work: its operands and their digits, each step's numbers, the answer, 10 and 1. */
function targetNumbers(pkg: OperationPackage): Set<number> {
  const out = new Set<number>([1, 10]);
  for (const v of pkg.operation.operands as unknown[]) if (typeof v === "number") { out.add(v); for (const d of String(v)) out.add(Number(d)); }
  for (const p of workParts(pkg)) out.add(p.value);
  try { for (const st of tutorSteps(pkg)) { st.operands.forEach((n) => out.add(n)); out.add(st.total); out.add(st.write); if (st.printedTop !== undefined) out.add(st.printedTop); } } catch { /* no steps */ }
  return out;
}

/** A message that is about the target question: it names no example and says only the target's own numbers. */
function onTarget(text: string, pkg: OperationPackage): boolean {
  if (/\b(?:easier|example|practice one|another one|a smaller one)\b/i.test(text)) return false;
  const own = targetNumbers(pkg);
  return numbersIn(text).every((n) => own.has(n));
}

function numbersIn(text: string): number[] {
  return [...norm(text).matchAll(new RegExp(String.raw`\b${NUMBER}\b`, "g"))].map((m) => numberOf(m[0])).filter((n): n is number => n !== null);
}

/**
 * A message whose last question it answers itself (Savar's call 2, round 2: "We traded 1 ten away, so 4 tens are left.
 * 5 tens take away 1 ten is how many tens?"): an earlier sentence says the asked value with the asked place ("4 tens"),
 * or the question's own operation with its result ("5 minus 1 is 4"). Returns that sentence, or null. Closed forms only.
 */
export function answersOwnQuestion(text: string, pkg: OperationPackage): string | null {
  const sentences = text.split(/(?<=[.?!])\s+/).map((x) => x.trim()).filter(Boolean);
  const q = sentences.at(-1);
  if (!q || !q.endsWith("?")) return null;
  const part = askedValue(q, pkg, sentences.slice(0, -1).join(" "));
  if (!part) return null;
  const ops = operationsIn(q);
  for (const x of sentences.slice(0, -1)) {
    const n = norm(x);
    if (part.place && new RegExp(String.raw`\b${part.value} ${part.place}\b`).test(n)) return x;
    if (ops.length === 1 && operationsIn(n).some((o) => sameOperation(o, ops[0])) && new RegExp(String.raw`\b(?:is|are|equals|makes|=)\s+${part.value}\b`).test(n)) return x;
  }
  return null;
}

/** The child accepts the offer of another question: a closed list of whole short replies. */
const YES = /^(?:yes|yeah|yep|yup|sure|ok|okay|yes please|sure thing|another one|one more|i want another(?: one)?)(?:,? (?:please|maya|thanks|thank you))*$/;
export function yesReply(text: string): boolean {
  return YES.test(norm(text).replace(/[.!]+$/, ""));
}

/** The child says they are done after the right answer: a closed list of whole short replies. */
const DONE = /^(?:(?:no|nope|nah)(?:,? (?:thanks|thank you|i'?m (?:good|done|ok|okay)|we'?re done|i'?m all done))?|(?:i'?m|we'?re|i am|we are) (?:all )?done|all done|done|(?:ok(?:ay)?,? )?bye(?:[- ]bye)?|good ?bye|that'?s (?:it|all)|no more|i'?m finished|finished|i want to stop|let'?s stop|(?:we'?re|we are) done(?:,? bye)?)(?:,? (?:bye|maya|thanks|thank you))*[.!]*$/;
export function doneReply(text: string): boolean {
  return DONE.test(norm(text).replace(/[.!]+$/, ""));
}
