// Maya's tutor core (D-345, the teaching rebuild of 2026-11-14): the model is the tutor, and code is the safety net.
//
// One child turn gets ONE model call and ONE Maya message, then Maya waits for the child. The model decides how to teach
// (explain, ask, tell a step, tell the answer); code gives it the facts (this file's brief helpers) and checks the whole
// message once (`checkTutorSay`): child safety (the never-say patterns here, and the talk review in the adapter for any
// sentence that is not plain math), true math (every equation and place-value statement), a hard length ceiling, and no
// false "yes" or false "not quite" against code's own verdict. A failed check gets one repair with the reason, then
// code's honest line with the step's question (`tutorFallbackText`). Code never cuts or drops the model's words.
//
// The answer rule is lifted (D-345 replaces D-199, D-306's no-answer reading and D-326): Maya may tell a step or the
// answer; no check blocks a true value. Code still owns safety guidance, the AI disclosure opening, the held close,
// the stop and time closes, the spend block and the {name} token (session.ts and the adapters).
//
// Phase 1 scope: 2-digit whole-number addition and subtraction (`isTutorQuestion`), on admin test calls.
import type { OperationPackage, WorkedStep } from "@/lib/question-package";
import { affirms, equationHolds, equationsOf, neverSayProblem, sayNumbers, sentencesOf } from "./say-check";
import { falseClaims } from "./tutor-math";
import { mathOnly } from "./math-vocab";

/** The hard ceiling of one Maya message, in words. Over it, the model gets one repair with the reason; code never trims. */
export const TUTOR_WORD_LIMIT = 60;

/** Review rules that only shape talk: the tutor review ignores them (D-345). The math rule: code checks the math. */
export const TUTOR_REVIEW_IGNORED: readonly string[] = ["math", "plain_language", "held_limit"];

/** Words of a teaching sentence that are math, not talk, beyond the math vocabulary (so they skip the talk review). */
const TUTOR_MATH_WORDS: ReadonlySet<string> = new Set(["become", "becomes", "make", "makes", "borrow", "borrowed", "trade", "traded", "swap", "left", "now", "have", "has", "get", "gives", "take", "takes", "away", "more", "enough", "small", "smaller", "bigger", "too", "into"]);

type ColumnStep = Extract<WorkedStep, { kind: "add-column" | "subtract-column" }>;

const isColumn = (s: WorkedStep): s is ColumnStep => s.kind === "add-column" || s.kind === "subtract-column";

/** Whether the tutor core teaches this question now (Phase 1): a 2-digit whole-number addition or subtraction. */
export function isTutorQuestion(pkg: OperationPackage | null | undefined): pkg is OperationPackage {
  if (!pkg) return false;
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
export function stepFacts(pkg: OperationPackage): { id: string; place: string; work: string; result: number }[] {
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
export function numberMeaning(pkg: OperationPackage, n: number): string {
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

/** Code's verdict on every number and every equation in the child's turn, as sentences for the brief. */
export function childFacts(pkg: OperationPackage, text: string): string[] {
  const facts: string[] = [];
  for (const sentence of sentencesOf(text)) {
    for (const e of equationsOf(sentence)) {
      const holds = equationHolds(e);
      if (holds === null) continue;
      const said = `${e.operands.map((o) => o.key).join(` ${e.ops[0] === "+" ? "+" : "−"} `)} ${e.negated ? "≠" : "="} ${e.result.key}`;
      facts.push(`The child said ${said}: that is ${holds !== e.negated ? "true" : "false"}.`);
    }
  }
  const seen = new Set<number>();
  for (const t of sayNumbers(text)) {
    if (!t.q || t.q[1] !== 1 || seen.has(t.q[0])) continue;
    seen.add(t.q[0]);
    facts.push(`The child said ${t.q[0]}: ${numberMeaning(pkg, t.q[0])}.`);
  }
  return facts;
}

/** The child's turn says a false equation ("12 minus 8 is 5"): code's own read, whatever step it is about. */
export function childSaysFalse(text: string): boolean {
  return sentencesOf(text).some((x) => equationsOf(x).some((e) => equationHolds(e) === e.negated && equationHolds(e) !== null));
}

/** The context of the whole-message check: code's verdict on the child's answer this turn. */
export interface TutorCheckContext {
  /** "wrong": the child committed to a wrong answer this turn; "right": a right one; else "none". */
  stance: "right" | "wrong" | "none";
  /** The numbers the child committed to this turn (what a judgment names). */
  childValues?: readonly number[];
  /** The question's operation, for the direction of a trade ("5 tens are now 4 tens" in a subtraction). */
  op?: "add" | "subtract";
}

/** A sentence that says an answer is right. */
const JUDGES_RIGHT = /^(?:yes|yep|yeah|right|correct|exactly)\b|\b(?:is|that'?s|that is|it'?s|you'?re|you are|you got it)\s+(?:right|correct)\b|\byou got it\b|\bwell done\b/i;
/** A sentence that says an answer is not right. */
const JUDGES_WRONG = /\b(?:not quite|not yet|not right|isn'?t right|incorrect|that'?s wrong|is wrong|try again)\b/i;

export type TutorVerdict =
  | { ok: true; needsReview: boolean }
  | { ok: false; reason: "empty" | "too_long" | "never_say" | "false_equation" | "affirms_wrong" | "wrong_stance"; detail: string };

/** "N tens and M ones" said equal to a number, or "N (ones) become M": the place-value claims code can check. */
function placeValueProblem(sentence: string): string | null {
  const text = sentence.replace(/[−–]/g, "-").toLowerCase();
  const word = String.raw`(\d+)`;
  // Equalities ("52 is 4 tens and 12 ones", "1 ten is 10 ones") and "is now" are read by falseClaims (tutor-math.ts).
  for (const m of text.matchAll(new RegExp(String.raw`${word}\s+(ones?\b|tens?\b)?\s*(?:becomes?|became|turns? into)\s+${word}(?:\s+(ones?\b|tens?\b))?`, "g"))) {
    const [from, to] = [Number(m[1]), Number(m[3])];
    const tens = /^ten/.test(m[2] ?? m[4] ?? "");
    const fine = tens ? to === from - 1 : to === from + 10 || to === from - 1;
    if (!fine) return `${from} ${m[2] ?? ""} does not become ${to} in a trade`.replace(/\s+/g, " ");
  }
  return null;
}

/**
 * The whole-message check (D-345), run once on the model's message. Refuses only: an empty or over-long message, a
 * never-say pattern, a false equation or place-value claim (or a true equation called false), and a "yes" to a wrong
 * answer or a "not quite" to a right one. `needsReview`: a sentence is not plain math, so the talk review reads the
 * whole message before it is said.
 */
export function checkTutorSay(text: string, ctx: TutorCheckContext): TutorVerdict {
  const say = text.trim();
  if (!say) return { ok: false, reason: "empty", detail: "The message is empty: say one short helpful thing and ask one small question." };
  const words = say.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  if (words > TUTOR_WORD_LIMIT) return { ok: false, reason: "too_long", detail: `The message has ${words} words; the limit is ${TUTOR_WORD_LIMIT}. Say the same one idea in fewer words, then one small question.` };
  const never = neverSayProblem(say);
  if (never) return { ok: false, reason: "never_say", detail: never };
  const sentences = sentencesOf(say);
  for (const sentence of sentences) {
    for (const e of equationsOf(sentence)) {
      const holds = equationHolds(e);
      if (holds === null) continue;
      if (holds === e.negated) return { ok: false, reason: "false_equation", detail: `"${sentence}" ${e.negated ? "calls a true equation false" : "holds a false equation"}. Every equation Maya says must be true.` };
    }
    const claim = falseClaims(sentence, ctx.op)[0];
    if (claim) return { ok: false, reason: "false_equation", detail: `"${sentence}": ${claim}. Every equation and place-value statement must be true.` };
    const place = placeValueProblem(sentence);
    if (place) return { ok: false, reason: "false_equation", detail: `"${sentence}": ${place}. Every place-value statement must be true.` };
  }
  // No false judgment of the child's answer, in any sentence: a "yes" or "right" for a wrong answer, a "not quite" for
  // a right one. The first sentence is judged strictly. A later one is exempt only when it judges its own true equation
  // ("Earlier you got 12 − 8 = 4, and that's right"): it names none of the child's numbers and not "your answer".
  const names = (sentence: string, values: readonly number[] | undefined) => {
    const said = sayNumbers(sentence).flatMap((t) => (t.q && t.q[1] === 1 ? [t.q[0]] : []));
    const ownEquation = equationsOf(sentence).some((e) => !e.negated && equationHolds(e) === true);
    return !ownEquation || said.some((n) => (values ?? []).includes(n)) || /your (?:answer|number|work)/i.test(sentence);
  };
  for (const [i, sentence] of sentences.entries()) {
    if (ctx.stance === "wrong" && ((i === 0 && affirms(sentence)) || (JUDGES_RIGHT.test(sentence) && names(sentence, ctx.childValues)))) {
      return { ok: false, reason: "affirms_wrong", detail: "Code found the child's answer wrong: never say it is right. Say kindly that it is not right yet, and where." };
    }
    if (ctx.stance === "right" && ((i === 0 && JUDGES_WRONG.test(sentence)) || (JUDGES_WRONG.test(sentence) && names(sentence, ctx.childValues)))) {
      return { ok: false, reason: "wrong_stance", detail: "Code found the child's answer right: say so, never \"not quite\"." };
    }
  }
  const needsReview = !sentences.every((x) => mathOnly(x, TUTOR_MATH_WORDS));
  return { ok: true, needsReview };
}

/** Code's honest line when the model's message failed twice (D-345): one short line and the step's question. */
export function tutorFallbackText(pkg: OperationPackage, done: readonly string[], solved: boolean): string {
  if (solved) return "Let me say that another way. How did you get your answer?";
  const next = tutorSteps(pkg).find((st) => !done.includes(st.id));
  if (!next) {
    const [a, b] = pkg.operation.operands as [number, number];
    return `Let me say that another way. So what is ${a} ${pkg.operation.kind === "add" ? "plus" : "minus"} ${b}?`;
  }
  return `Let me say that another way. What do you get for ${next.operands.join(next.op === "+" ? " plus " : " minus ")}?`;
}

/** The board drawings the model may ask for (D-345). Code builds every command from the checked steps. */
export const TUTOR_DRAWINGS = ["trade", "digit", "note"] as const;

/** A board command, as the board core reads it. */
type Command = Record<string, unknown>;

/**
 * The commands for the model's drawing requests, in order, and the keys of what they drew. `drawn`: what the call drew
 * already (never twice: the board would refuse it, and a refused board must never cost the child Maya's words).
 * "trade": the next trade (a borrow in the top row, or a carry above the answer). "digit": an answer digit
 * (`place`: ones, tens, hundreds), with the trade it needs first. "note": a true equation written beside the question.
 */
export function tutorDrawings(pkg: OperationPackage, draw: readonly { offer: string; place?: string }[], drawn: readonly string[], noteId: (i: number) => string): { commands: Command[]; keys: string[] } {
  const steps = tutorSteps(pkg);
  const commands: Command[] = [];
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
  for (const d of draw) {
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
      const m = /^\s*(\d{1,4}(?:\s*[+\-−–]\s*\d{1,4}){1,3})\s*=\s*(\d{1,5})\s*$/.exec(d.place);
      if (!m) continue;
      const nums = m[1].split(/[+\-−–]/).map((x) => Number(x.trim()));
      const signs = [...m[1].matchAll(/[+\-−–]/g)].map((x) => (x[0] === "+" ? 1 : -1));
      const value = nums.slice(1).reduce((acc, n, k) => acc + signs[k] * n, nums[0]);
      if (value !== Number(m[2])) continue;
      const text = `${nums.map((n, k) => (k === 0 ? String(n) : `${signs[k - 1] === 1 ? "+" : "−"} ${n}`)).join(" ")} = ${Number(m[2])}`;
      commands.push({ op: "write", id: noteId(notes++), text, place: { below: "question" } });
    }
  }
  return { commands, keys };
}
