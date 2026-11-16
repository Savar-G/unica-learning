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
import type { OperationPackage } from "@/lib/question-package";
import { expressionKey, noteFromEquation, type TutorCommand, type TutorKind, type TutorStepFact } from "./tutor-kind";
import { tutorKindOf } from "./tutor-kinds";
import { patternOf } from "./tutor-kinds/evaluate";
import { affirms, equationHolds, equationsOf, neverSayProblem, sayNumbers, sentenceKey, sentencesOf, type SayEquation } from "./say-check";
import { exactSafe } from "./math-vocab";
import { exactColumnPhrases } from "./tutor-exact-phrases";
import { deniesWholeQuestion, echoesChild, selfCorrection } from "./teaching-reads";
import { answerClaims, answerProblems, falseClaims, fullRead, guardedProblems, readClaims, REMAINDER_SAID, unsafeNumberSaid, type ColumnSum, type KindRead } from "./tutor-math";

/** The hard ceiling of one Maya message, in words. Over it, the model gets one repair with the reason; code never trims. */
export const TUTOR_WORD_LIMIT = 60;
/**
 * The word limit while the child is a first-time learner (Savar's call 2, 2026-11-15): the slow, concrete explanation
 * (what we have, the problem, the move, the result, one easy question) takes more short sentences.
 */
export const TUTOR_FIRST_TIME_WORD_LIMIT = 80;

/** Review rules that only shape talk: the tutor review ignores them (D-345). The math rule: code checks the math. */
export const TUTOR_REVIEW_IGNORED: readonly string[] = ["math", "plain_language", "held_limit"];


/**
 * A sentence the child may hear with no safety review (D-345; the CoS rule of 2026-11-14: review only non-math or
 * personal content). Only an exact approved sentence (EXACT_SAFE), or a sentence whose every clause is one of the
 * complete math forms in PLAIN_FORMS (numbers, places and operations only). The never-say patterns and the math checks
 * run on every sentence either way.
 */
export function plainTeaching(sentence: string, _extra: ReadonlySet<string> = new Set()): boolean {
  void _extra;
  const text = sentence.replace(/[’]/g, "'").replace(/[−–]/g, "-").trim();
  // Final check 3 (2026-11-15): a sentence with a correctness judgment word always goes to the talk review, and the
  // review's refusal of it is binding (bindingReview).
  if (judgment(text).any) return false;
  // Only the exact approved sentences skip the review as they are; an open frame never does (review of #1006).
  // Sixth check of #1006: only an approved sentence that means the same after any child turn ("I'm an AI helper").
  // "That sounds fun", "Thanks for telling me" and the like depend on what the child said, so they are reviewed.
  if (exactSafe(text)) return CONTEXT_FREE.test(text);
  // "Which is bigger, 42 or 30?" holds a comma inside one closed form, so it is read whole (F4 builder, 2026-11-15).
  if (WHICH_FORM.test(text.replace(/[.!?]+\s*$/, ""))) return true;
  // Review of #1006 (four rounds): no word list decides it. Each clause (split at ":", ";" and ","), after a short
  // spoken lead-in, must match one of a few complete math forms built only from numbers, places and operations
  // (PLAIN_FORMS). Every other sentence is reviewed, in parallel with the stream.
  // Sixth check of #1006: a sentence with no math clause left after its lead-in ("Yes.") is reviewed: a bare word can
  // answer anything the child asked.
  // A comma inside a number ("9,000") does not split a clause (F3 builder, 2026-11-15).
  const clauses = text.replace(/[.!?]+\s*$/, "").split(/\s*[:;]\s*|(?<!\d),\s*|,(?!\d{3}(?!\d))\s*/).map((raw) => {
    let clause = raw.trim();
    for (let k = 0; k < 4; k++) clause = clause.replace(LEAD_IN, "").trim();
    return clause;
  });
  return clauses.some((c) => c !== "") && clauses.every((c) => c === "" || PLAIN_FORMS.some((re) => re.test(c)));
}

const N = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)`;
const U = String.raw`(?:hundred thousands?|ten thousands?|ones?|tens?|hundreds?|thousands?)`;
const Q = String.raw`(?:${N}(?:\s+${U})?)`;
const E = String.raw`(?:${Q}(?:\s+(?:plus|minus|take away|times|multiplied by|divided by|\+|-|×|÷|x)\s+(?:the\s+)?${Q})*)`;
const PLACE = String.raw`(?:the\s+)?${U}(?:\s+(?:column|place))?`;
const WHICH_FORM = new RegExp(String.raw`^(?:so\s+)?which is (?:bigger|greater|smaller|less|more),?\s+${E}\s+or\s+${E}$`, "i");
/** "12 minus 8 is 4", "6 is 8 minus 2", "52 is 4 tens and 12 ones", "2 minus 8 isn't 6": a claim the reader checks. */
const ASSERT_FORM = new RegExp(String.raw`^(?:so\s+)?${E}\s+(?:is|equals|=|makes|is not|isn't)\s+${E}(?:\s+and\s+${Q})*$`, "i");
/** "Write 4 in the ones", "Put 2 in the tens place": an instruction whose number no core claim reads. */
const WRITE_FORM = new RegExp(String.raw`^(?:write|put) ${N} in ${PLACE}$`, "i");
/**
 * The closed forms that claim nothing about numbers: questions, the one fixed true trade and a place named alone. Their
 * numbers are read as asked, not claimed (two-layer true math, 2026-11-15); a question form counts only in a question.
 */
const QUESTION_FORMS: readonly RegExp[] = [
  // "What is 12 minus 8?", "What do you get for 4 minus 2?"
  new RegExp(String.raw`^(?:so\s+)?(?:what is|what's|what do you get for|what do we get for)\s+${E}$`, "i"),
  // "How many ones are left?", "How many tens do we have now?"
  new RegExp(String.raw`^how many ${U}(?:\s+(?:are left|are there|do we have(?: now)?|now))?$`, "i"),
  // "What do we write in the ones?", "What goes in the tens place?"
  new RegExp(String.raw`^what (?:do we write|do you write|goes|do we put|do you put) in ${PLACE}$`, "i"),
  // "What is the whole answer?"
  /^what is the (?:whole |final )?answer$/i,
  // "Is 7 the same as 6?" (F4 builder, 2026-11-15)
  new RegExp(String.raw`^is\s+${E}\s+the same as\s+${E}$`, "i"),
  // "Is 5220 greater than 5226?", "Is 6 times 870 less than 5226?"
  new RegExp(String.raw`^is\s+${E}\s+(?:greater|less|more|bigger|smaller)\s+than\s+${E}$`, "i"),
  // "Which digit is in the thousands place?", "What is the digit in the tens place?"
  new RegExp(String.raw`^(?:which digit is|what digit is|what is the digit) in ${PLACE}(?:\s+of\s+${N})?$`, "i"),
  // "What is the value of the 4?", "What is the value of the 4 in 48942?"
  new RegExp(String.raw`^what is the value of (?:the\s+)?(?:${N}|digit in ${PLACE})(?:\s+in\s+${N})?$`, "i"),
  // "What is the missing number?"
  /^what is the missing number$/i,
  WHICH_FORM,
];
/** The closed forms that claim nothing in any sentence: the fixed true trade, an operation on a place, a place alone. */
const NO_CLAIM_FORMS: readonly RegExp[] = [
  // "Trade 1 ten for 10 ones", "We trade one ten for ten ones"
  new RegExp(String.raw`^(?:we\s+)?(?:trade|regroup)\s+(?:1|one|a)\s+ten\s+(?:for|into|as)\s+(?:10|ten)\s+ones$`, "i"),
  // "Subtract the ones", "Add the tens"
  new RegExp(String.raw`^(?:now\s+)?(?:subtract|add)\s+${PLACE}$`, "i"),
  // "the tens", "in the ones column". Pre-launch review: "N is right" and "the other way around" can answer what the
  // child asked ("How many punches ...? One is right."), so they are reviewed.
  new RegExp(String.raw`^(?:(?:in|for|on|to)\s+)?${PLACE}$`, "i"),
];
/** The complete math forms a clause may take with no review. Nothing else: no person, no object, no feeling. */
const PLAIN_FORMS: readonly RegExp[] = [ASSERT_FORM, ...QUESTION_FORMS.filter((re) => re !== WHICH_FORM), WRITE_FORM, ...NO_CLAIM_FORMS];

/** A sentence as the exact-match rule compares it: plain apostrophes and minus signs, one space, no final ".", "!" or "?", lower case. */
export function exactKey(sentence: string): string {
  return sentence.replace(/[‘’ʼ]/g, "'").replace(/[−–]/g, "-").replace(/\s+/g, " ").trim().replace(/[.!?]$/, "").trim().toLowerCase();
}

/**
 * Code's own texts for this question, as exact keys (exact-match rule, the CoS decision of 2026-11-15): each step's work
 * text (TutorKind.steps) sentence by sentence, and each of its parts between ";" or ":" (each part is code's own true
 * statement of this question), the kind's step question after each number of done steps (TutorKind.stepQuestion),
 * and a finite bank of complete phrases generated from recomputed column facts (exactColumnPhrases).
 */
export function exactTexts(pkg: OperationPackage): ReadonlySet<string> {
  const kind = tutorKind(pkg);
  const steps = kind.steps(pkg);
  const keys = new Set<string>();
  for (const phrase of exactColumnPhrases(pkg)) keys.add(exactKey(phrase));
  for (const st of steps) for (const sentence of sentencesOf(st.work)) {
    keys.add(exactKey(sentence));
    for (const part of sentence.split(/\s*[;:]\s*/)) if (part.trim()) keys.add(exactKey(part));
  }
  for (let k = 0; k <= steps.length; k++) {
    const q = kind.stepQuestion(pkg, steps.slice(0, k).map((st) => st.id));
    if (q) for (const sentence of sentencesOf(q)) keys.add(exactKey(sentence));
  }
  keys.delete("");
  return keys;
}

/**
 * The question's own numbers (final check 4): its operands, answer, work values, stream scope, and every number of its
 * text and of code's own step texts.
 */
export function ownNumbers(pkg: OperationPackage): ReadonlySet<number> {
  const kind = tutorKind(pkg);
  const answer = pkg.answer.value.type === "number" ? [pkg.answer.value.value] : [];
  const operands = (pkg.operation.operands as unknown[]).filter((v): v is number => typeof v === "number");
  const said = [pkg.text, ...kind.steps(pkg).map((st) => st.work)].flatMap((t) => (typeof t === "string" ? sayNumbers(t).flatMap((x) => (x.q && x.q[1] === 1 ? [x.q[0]] : [])) : []));
  return new Set<number>([...operands, ...answer, ...kind.workValues(pkg), ...kind.streamScope(pkg).numbers, ...said]);
}

/** The numbers of the question's easier example that are not the question's own (final check 4). */
export function exampleOnly(pkg: OperationPackage): ReadonlySet<number> {
  const e = pkg.easierExample;
  if (!e) return new Set();
  const own = ownNumbers(pkg);
  const value = (e.answer as { value?: unknown } | undefined)?.value;
  const operands = (((e.operation as { operands?: unknown[] } | undefined)?.operands) ?? []).filter((v): v is number => typeof v === "number");
  const said = typeof e.text === "string" ? sayNumbers(e.text).flatMap((t) => (t.q && t.q[1] === 1 ? [t.q[0]] : [])) : [];
  return new Set([...operands, ...said, ...(typeof value === "number" ? [value] : [])].filter((n) => !own.has(n)));
}

/**
 * Final check 4 (2026-11-15): the context fields that bind code's own texts to the ACTIVE problem. The main question is
 * the active problem only while no turn of the call names a number of the easier example only; once one does, code
 * cannot tell which problem is active, and no step text passes on code alone (`exact` is left out).
 */
export function tutorTexts(pkg: OperationPackage, turns: readonly string[], exampleSeen = false): Pick<TutorCheckContext, "exact" | "own" | "exampleOnly"> {
  const only = exampleOnly(pkg);
  // Final check 5 (2026-11-15): the easier example is in play for the rest of the call once code introduced or showed
  // it (`exampleSeen`), once any turn, Maya's or the child's, names it ("For the easier example, what do I write in the
  // ones?") or once a turn says a number only it has. Then no step text passes on code alone, for either problem.
  const named = (t: string) => /\b(?:easier|example)\b/i.test(t) || sayNumbers(t).some((x) => !!x.q && x.q[1] === 1 && only.has(x.q[0]));
  const inPlay = pkg.easierExample ? (exampleSeen || only.size === 0 || turns.some(named)) : false;
  return { ...(inPlay ? {} : { exact: exactTexts(pkg) }), own: ownNumbers(pkg), exampleOnly: only };
}

/**
 * Whether a sentence passes on code alone (the exact-match rule, the CoS decision of 2026-11-15). Only when the whole
 * sentence (exactKey) is (a) one of code's own texts for this question (ctx.exact, exactTexts), or (b) one closed plain
 * form: an equation or place-value claim of numbers (ASSERT_FORM) whose every number and relation code read inside a
 * claim it found true, or a closed question form, only in a question. An instruction is code alone only as an exact
 * text (final check 5). No lead-in, no {name}, no other word. The true-math checks of
 * checkTutorSay still run on it. Every other sentence goes to the math-truth review. The claim reader (falseClaims,
 * answerProblems, claimProblems) only refuses; it never grants a pass.
 */
export function codeAlone(sentence: string, ctx: Pick<TutorCheckContext, "op" | "trades" | "answer" | "columns" | "exact" | "own"> = {}): boolean {
  const key = exactKey(sentence);
  if (!key || /\{name\}/i.test(key)) return false;
  // Final check 4: a number code cannot hold exactly never passes on code alone, not even in code's own text.
  if (unsafeNumberSaid(sentence)) return false;
  if (ctx.exact?.has(key)) return true;
  if (judgment(sentence).any) return false;
  const asks = /\?\s*$/.test(sentence.trim());
  // Final check 5 (2026-11-15): an instruction (a trade, an operation on a place, "write N in the P") is code alone ONLY
  // as an exact text of the active problem (ctx.exact above): "Subtract the hundred thousands." in 52 - 28 is no step of
  // it. No instruction form passes otherwise. Final check 4: a place named alone ("The tens.") is never code alone.
  const form = ASSERT_FORM.test(key) || (asks && QUESTION_FORMS.some((re) => re.test(key)) && questionHolds(key, ctx.own));
  return form && unreadMath(sentence, ctx).length === 0;
}

const VALUE_QUESTION = new RegExp(String.raw`^what is the value of (?:the\s+)?(?:(${N})|digit in (${PLACE}))(?:\s+in\s+(${N}))?$`, "i");
const DIGIT_QUESTION = new RegExp(String.raw`^(?:which digit is|what digit is|what is the digit) in (${PLACE})(?:\s+of\s+(${N}))?$`, "i");
const PLACE_INDEX: Record<string, number> = { one: 0, ten: 1, hundred: 2, thousand: 3, "ten thousand": 4, "hundred thousand": 5 };
const placeIndex = (place: string) => PLACE_INDEX[place.toLowerCase().replace(/^the\s+/, "").replace(/\s+(?:column|place)$/, "").replace(/s$/, "")] ?? -1;
const valueOf = (said: string) => sayNumbers(said).find((t) => t.q && t.q[1] === 1)?.q?.[0] ?? null;

/**
 * Final check 4 (2026-11-15): a closed question form is true with no context only when it is built from this question's
 * own numbers (`own`), and a question about a digit or a place names a number of the question that really holds that
 * digit or place ("What is the value of the 5 in 52?"; never "the 8 in 52", never "the 4" with no number). Without
 * `own` (a caller with no question), only the digit or place premise is checked.
 */
function questionHolds(key: string, own: ReadonlySet<number> | undefined): boolean {
  const value = VALUE_QUESTION.exec(key);
  const digit = value ? null : DIGIT_QUESTION.exec(key);
  if (value || digit) {
    const said = value ? value[3] : digit![2];
    const n = said === undefined ? null : valueOf(said);
    if (n === null || !Number.isSafeInteger(n) || n < 0 || (own !== undefined && !own.has(n))) return false;
    const digits = String(n);
    if (value && value[1] !== undefined) {
      const d = valueOf(value[1]);
      return d !== null && Number.isInteger(d) && d >= 0 && d <= 9 && digits.includes(String(d));
    }
    const at = placeIndex((value ? value[2] : digit![1]) ?? "");
    return at >= 0 && at < digits.length;
  }
  return sayNumbers(key).every((t) => !!t.q && t.q[1] === 1 && (own === undefined || own.has(t.q[0])));
}

/**
 * The words of a sentence's math that code did not read inside a claim it found true (two-layer true math, the CoS design
 * of 2026-11-15): numbers (digits, number words, fractions, "and a half", a remainder), relation words (is, are, equals,
 * makes, becomes, greater, less, more, than, same) and operators. Since the exact-match rule (2026-11-15) an empty list
 * grants nothing alone: it is one condition of a closed plain form in codeAlone. A closed question form asks and claims nothing (only in a
 * question); the fixed true trade and a place named alone claim nothing; an answer claim read whole and true is read.
 * The kinds' own checks (claimProblems) refuse, but read nothing here: a sentence only a kind reads goes to the review.
 */
export function unreadMath(sentence: string, ctx: Pick<TutorCheckContext, "op" | "trades" | "answer" | "columns"> = {}): string[] {
  let text = sentence.replace(/[’]/g, "'").replace(/[−–]/g, "-").trim();
  const asks = /\?\s*$/.test(text);
  // The clauses as plainTeaching splits them, with their separators kept, so the claim reader reads the rest as said.
  const parts = text.replace(/[.!?]+\s*$/, "").split(/(\s*[:;]\s*|(?<!\d),\s*|,(?!\d{3}(?!\d))\s*)/);
  text = parts.map((raw, k) => {
    if (k % 2 === 1) return raw;
    let clause = raw.trim();
    for (let n = 0; n < 4; n++) clause = clause.replace(LEAD_IN, "").replace(/^(?:and|or|but)\s+/i, "").trim();
    return NO_CLAIM_FORMS.some((re) => re.test(clause)) || (asks && QUESTION_FORMS.some((re) => re.test(clause))) ? " ; " : raw;
  }).join("");
  if (ctx.answer !== undefined) {
    // Final check 6: the clause forms above can drop a stated scope ("In the ones column, the answer is 24."), so a
    // claim is read only when the sentence as said reads as many claims whole.
    const said = answerClaims(sentence.replace(/[’]/g, "'").replace(/[−–]/g, "-").trim(), ctx.answer).read.length;
    const found = answerClaims(text, ctx.answer).read;
    const spans = (found.length <= said ? found : []).sort((a, b) => b.index - a.index);
    for (const { index, length } of spans) text = `${text.slice(0, index)} ; ${text.slice(index + length)}`;
  }
  return readClaims(text, ctx.op, ctx.trades, ctx.columns).unread;
}

const COLUMN_PLACES = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands", "millions"];

/** The question's own column sums (each add-column step: its carry and digits, and its place), for unreadMath. */
export function columnSums(pkg: OperationPackage): ColumnSum[] {
  return pkg.steps.flatMap((s) => (s.kind === "add-column" && COLUMN_PLACES.includes(s.place) ? [{ terms: [...(s.carryIn > 0 ? [s.carryIn] : []), ...s.digits], place: 10 ** COLUMN_PLACES.indexOf(s.place) }] : []));
}

/** A short spoken lead-in before the math of a clause: fixed words only. */
// Sixth check of #1006: only lead-ins that answer nothing. "Yes", "no", "right", "okay", "not quite" and the like can
// agree with or deny what the child said, so a sentence that starts with one is reviewed.
const LEAD_IN = /^(?:\{name\}|(?:now|so|next|then)\b)[\s!.]*/i;
/** The approved sentences that mean the same after any child turn: what Maya is. */
const CONTEXT_FREE = /^i'm (?:an ai\b|not a real person\b)/i;

/** Whether the tutor core teaches this question now: a kind of the registry (tutor-kinds/index.ts) fits it. */
export function isTutorQuestion(pkg: OperationPackage | null | undefined): pkg is OperationPackage {
  return !!pkg && tutorKindOf(pkg) !== null;
}

/** The question's kind; only for a question isTutorQuestion admits. */
export function tutorKind(pkg: OperationPackage): TutorKind {
  const kind = tutorKindOf(pkg);
  if (!kind) throw new Error("maya tutor: no tutor kind fits this question");
  return kind;
}

/** Each step as plain facts for the brief, in the order a child works them. */
export const stepFacts = (pkg: OperationPackage): TutorStepFact[] => tutorKind(pkg).steps(pkg);

/** What a number the child said means for this question: right, a known mistake, or not one of its values. */
export const numberMeaning = (pkg: OperationPackage, n: number): string => tutorKind(pkg).numberMeaning(pkg, n);

/** The printed sign of each operator the equation reader reads. */
const OP_SIGN: Record<SayEquation["ops"][number], string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };
/** The operator words and symbols that join two operands of an expression the child offers. */
const EXPRESSION_OP: Record<string, string> = { plus: "+", "+": "+", minus: "−", "-": "−", "take away": "−", times: "×", "×": "×", x: "×", "*": "×", "multiplied by": "×", "divided by": "÷", "÷": "÷", "/": "÷" };

/** The operator signs of EXPRESSION_OP as the equation reader writes them (expressionKey). */
const KEY_OP: Record<string, string> = { "+": "+", "−": "-", "×": "*", "÷": "/" };
/** A place word a question may say after an operand ("4 tens minus 2 tens"). */
const PLACE_AFTER = /^(?:ones?|tens?|hundreds?|thousands?)\b\s*/i;

/**
 * The expressions a question of Maya's asks for, each read in full: two or more whole numbers joined only by operator
 * words, each operand with an optional place word after it ("What is 13 minus 6?", "What is 4 tens minus 2 tens?"). An
 * expression followed by a relation ("13 minus 6 is 7") is a statement, not one the question asks for.
 */
export function questionExpressions(sentence: string): { operands: number[]; ops: string[] }[] {
  const out: { operands: number[]; ops: string[] }[] = [];
  const tokens = sayNumbers(sentence);
  let k = 0;
  while (k < tokens.length) {
    if (!tokens[k].q || tokens[k].q![1] !== 1) { k++; continue; }
    const run = [tokens[k]];
    const ops: string[] = [];
    while (k + 1 < tokens.length && tokens[k + 1].q && tokens[k + 1].q![1] === 1) {
      const gap = sentence.slice(run.at(-1)!.end, tokens[k + 1].at).trim().toLowerCase().replace(PLACE_AFTER, "").trim();
      const op = EXPRESSION_OP[gap];
      if (!op) break;
      ops.push(KEY_OP[op]);
      run.push(tokens[++k]);
    }
    k++;
    if (run.length < 2) continue;
    // Both boundaries must be complete: an unread operation, fraction or relation cannot leave a prefix to credit.
    // A colon can separate the teaching lead-in from the question ("Take away the 6 ones: what is 13 minus 6?").
    const before = sentence.slice(0, run[0].at).split(":").at(-1)!.trim();
    if (!/^(?:(?:now|so)[,\s]+)?(?:what(?:'s| is| are)|what do you get (?:for|from)|how much is|calculate|work out)?$/i.test(before)) continue;
    const after = sentence.slice(run.at(-1)!.end).trimStart().replace(PLACE_AFTER, "").trim();
    if (!/^(?:(?:in all|altogether|now)\s*)?\?$/i.test(after)) continue;
    out.push({ operands: run.map((t) => t.q![0]), ops });
  }
  return out;
}

/**
 * 2026-11-15 (voice fallbacks, turn 7): the step that Maya's question asks, read only in full: the question holds one
 * expression (questionExpressions), and it is the expression of one equation in exactly one step's work ("What do you get
 * for 13 minus 6?" asks the ones of 83 − 46, where 13 − 6 = 7). `value` is that equation's result: the number the child
 * says for the step ("What is 7 plus 9?" is 16 for the ones of 27 + 39). Null for any other question.
 */
export function askedStep(pkg: OperationPackage, question: string): { step: string; value: number } | null {
  if (!/\?\s*$/.test(question)) return null;
  // A pattern term is a computed work value, even when it has no package step of its own.
  const term = /^what is the (?:(\d+)(?:st|nd|rd|th)|(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)) term\?$/i.exec(question.trim());
  const pattern = term && tutorKind(pkg).id === "evaluate" ? patternOf(pkg) : null;
  if (term && pattern) {
    const n = term[1] ? Number(term[1]) : ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"].indexOf(term[2].toLowerCase()) + 1;
    if (n >= 1 && n <= pattern.term) return { step: `pattern-term:${n}`, value: pattern.start + (n - 1) * pattern.step };
  }
  const asked = questionExpressions(question);
  if (asked.length !== 1) return null;
  const key = expressionKey(asked[0].operands, asked[0].ops);
  const hits = stepFacts(pkg).flatMap((st) => equationsOf(st.work).flatMap((e) => {
    const whole = [...e.operands, e.result].every((o) => o.q !== null && o.q[1] === 1);
    return !e.negated && whole && equationHolds(e) === true && expressionKey(e.operands.map((o) => o.q![0]), e.ops) === key ? [{ step: st.id, value: e.result.q![0] }] : [];
  }));
  return hits.length > 0 && hits.every((h) => h.step === hits[0].step && h.value === hits[0].value) ? hits[0] : null;
}

/**
 * Code's verdict on every number and every equation in the child's turn, as sentences for the brief. Final check 8
 * (2026-11-15): an equation is printed only when code read every token of its clause (`equationsOf` with `whole`): "3
 * times 2 is 6 tens", "It is not true that 3 times 2 is 7" print no equation, never one of their parts.
 */
export function childFacts(pkg: OperationPackage, text: string, readWhole: (value: number) => boolean = () => false, answer: { value: number | string | null; verdict: "right" | "wrong" | "unknown" } | null = null): string[] {
  const facts: string[] = [];
  /** Numbers an equation fact below already states. */
  const inEquations = new Set<number>();
  for (const sentence of sentencesOf(text)) {
    for (const e of equationsOf(sentence, { whole: true })) {
      const holds = equationHolds(e);
      if (holds === null) continue;
      // Final check 7 (2026-11-15): each operator is printed from its own place, as the reader read it ("3 × 2 = 6",
      // "8 − 2 + 4 = 10"), never the first operator for all of them.
      const said = `${e.operands.map((o, k) => (k === 0 ? o.key : `${OP_SIGN[e.ops[k - 1]]} ${o.key}`)).join(" ")} ${e.negated ? "≠" : "="} ${e.result.key}`;
      facts.push(`The child said ${said}: that is ${holds !== e.negated ? "true" : "false"}.`);
      for (const v of [...e.operands, e.result]) if (v.q && v.q[1] === 1) inEquations.add(v.q[0]);
    }
  }
  // An expression the child offers with no result ("teach me 2 minus 8", "two thousand × six hundred forty"): each
  // operand read whole by the standard reader, joined only by an operator. Stated as it is, with no value and no verdict.
  for (const sentence of sentencesOf(text)) {
    const tokens = sayNumbers(sentence).filter((t) => t.q && t.q[1] === 1);
    let k = 0;
    while (k < tokens.length) {
      const run = [tokens[k]];
      const ops: string[] = [];
      while (k + 1 < tokens.length) {
        const gap = sentence.slice(run.at(-1)!.end, tokens[k + 1].at).trim().toLowerCase();
        const op = EXPRESSION_OP[gap];
        if (!op) break;
        ops.push(op);
        run.push(tokens[++k]);
      }
      k++;
      if (run.length < 2) continue;
      // An expression followed by a relation is an equation: the equation facts above read it, or it stays unread.
      if (/^\s*(?:is|are|=|equals|makes|gives)\b/i.test(sentence.slice(run.at(-1)!.end))) continue;
      facts.push(`The child said ${run.map((t, i) => (i === 0 ? t.q![0] : `${ops[i - 1]} ${t.q![0]}`)).join(" ")}: an expression with no result.`);
      for (const t of run) inEquations.add(t.q![0]);
    }
  }
  // Final check 12 (2026-11-15): a number's fact comes only from the whole-phrase reader (`readWhole`, the session's
  // answerReadWhole): the number, at most the question's unit and answer words. Any other number, or a number form that
  // is no whole number ("6 halves"), gets no value: one fact says code did not read it.
  const seen = new Set<number>();
  let unread = false;
  for (const t of sayNumbers(text)) {
    if (!t.q || t.q[1] !== 1) { unread = true; continue; }
    if (seen.has(t.q[0]) || inEquations.has(t.q[0])) continue;
    seen.add(t.q[0]);
    if (!readWhole(t.q[0])) { unread = true; continue; }
    // 2026-11-15 (voice fallbacks, turn 7): one verdict. The number the child committed to (code's childAnswer) carries
    // that verdict in its own fact, so a fact never says "right for the ones" beside an "unknown" or "wrong" answer.
    // An "unknown" with no value (a tentative "is it 7?") is about every number of the turn.
    const judged = answer && (answer.value === t.q[0] || (answer.value === null && answer.verdict === "unknown")) && answer.verdict !== "right"
      ? answer.verdict === "wrong" ? ` As the child's answer this turn it is wrong (childAnswer "wrong").` : ` Code does not judge it: it cannot tell whether the child gave ${t.q[0]} as their answer (childAnswer "unknown").`
      : "";
    facts.push(`The child said ${t.q[0]}: ${numberMeaning(pkg, t.q[0])}.${judged}`);
  }
  if (unread) facts.push("Code did not read all of the child's words in full: it cannot say which number the child gave, or whether it is right.");
  return facts;
}

/**
 * The child's turn says a false equation ("12 minus 8 is 5"): code's own read, whatever step it is about. `whole` (final
 * check 8): only an equation read in its whole clause counts; the child's verdict for the review uses it. Without it the
 * read is broad on purpose: it only keeps Maya from praising the turn (the stance), so reading too much fails closed.
 */
export function childSaysFalse(text: string, options: { whole?: boolean } = {}): boolean {
  return sentencesOf(text).some((x) => equationsOf(x, options).some((e) => equationHolds(e) === e.negated && equationHolds(e) !== null));
}

/** The context of the whole-message check: code's verdict on the child's answer this turn. */
export interface TutorCheckContext {
  /** "wrong": the child committed to a wrong answer this turn; "right": a right one; else "none". */
  stance: "right" | "wrong" | "none";
  /** The numbers the child committed to this turn (what a judgment names). */
  childValues?: readonly number[];
  /** The question's operation, for the direction of a trade ("5 tens are now 4 tens" in a subtraction). */
  op?: "add" | "subtract";
  /** The question's answer: "N is the answer" must name it. */
  answer?: number;
  /** The question kind's own true-math checks of one sentence (TutorKind.claimProblems). */
  claims?: (sentence: string) => string[];
  /** The question's work values (TutorKind.workValues): the results a place may reach in a trade across a borrow. */
  trades?: readonly number[];
  /** The words of the child's name, which replaces each {name} before the child hears it (default 1). */
  nameWords?: number;
  /** The question's own column sums (columnSums): only these read "1 + 2 + 3 = 6 tens" whole (pre-launch check 2). */
  columns?: readonly ColumnSum[];
  /**
   * Code's own texts for the ACTIVE problem (exactTexts): a sentence that is one of them passes on code alone. Final check
   * 4: only while the main question is the active problem (tutorTexts); a message that names a number of the easier
   * example only (`exampleOnly`) drops them.
   */
  exact?: ReadonlySet<string>;
  /** The question's own numbers (ownNumbers): a closed question form passes on code alone only when built from them. */
  own?: ReadonlySet<number>;
  /** The numbers of the easier example that are not the question's own (exampleOnly). */
  exampleOnly?: ReadonlySet<number>;
  /** The question's answer is a word ("true", "false", a comparison): "true" and "false" are its content, not a judgment. */
  wordAnswer?: boolean;
  /** The child's turn this message answers (Savar's call 2): the first sentence never says the child's question back. */
  childTurn?: string;
  /** The word limit of this message (TUTOR_FIRST_TIME_WORD_LIMIT for a first-time learner); default TUTOR_WORD_LIMIT. */
  wordLimit?: number;
  /**
   * Savar's call 2: the child's wrong number answered a step, not the whole question. The whole question's "isn't" form
   * ("52 minus 28 isn't 3.") is then refused: it is the form for a wrong final answer only.
   */
  stepMiss?: { pkg: OperationPackage };
}

/** Negative judgment words and phrases (final check 3, 2026-11-15). */
const NEGATIVE_JUDGMENT = /\b(?:not\s+(?:quite|yet|right|correct|true|exactly|it)|isn'?t\s+(?:right|correct|true)|wrong|incorrect|false|nope|try again)\b/gi;
/** Positive judgment words and phrases. */
const POSITIVE_JUDGMENT = /\b(?:right|correct(?:ly)?|true|yes|yep|yeah|exactly|perfect(?:ly)?|great job|good job|great work|good work|well done|nice|spot on|got it|nail(?:ed)?|excellent|awesome|brilliant|amazing|you did it)\b/i;

/**
 * Whether a sentence judges correctness (final check 3, 2026-11-15): any judgment word makes it a judgment, wherever it
 * stands. Fail closed: the reader is broad on purpose. With stance "wrong" a positive judgment is refused, with stance
 * "right" a negative one; with stance "none" it goes to the talk review, whose refusal of it is binding. A negative
 * phrase ("not right") is negative, not positive. On a word question, "true" and "false" in a question are its content.
 */
export function judgment(sentence: string, wordAnswer = false): { any: boolean; positive: boolean; negative: boolean } {
  let text = sentence.replace(/[‘’ʼ]/g, "'");
  if (wordAnswer) text = text.replace(/\b(?:true|false)\b/gi, " ");
  const negative = new RegExp(NEGATIVE_JUDGMENT.source, "i").test(text);
  const positive = POSITIVE_JUDGMENT.test(text.replace(NEGATIVE_JUDGMENT, " "));
  return { any: negative || positive, positive, negative };
}

/**
 * A talk-review refusal of this sentence is binding, whatever rules it names: the sentence judges correctness, or
 * (final check 4) code's stance is "wrong" or "right", when every refusal by either review is binding for the turn.
 */
export const bindingReview = (sentence: string, wordAnswer = false, stance: TutorCheckContext["stance"] = "none"): boolean => stance !== "none" || judgment(sentence, wordAnswer).any;

/**
 * Final check 4 (2026-11-15), no word list: on a turn where code's stance is "wrong" or "right" (the child committed an
 * answer), a sentence of Maya's waits for both reviews unless it is code's exact text of the active problem, a question,
 * code's own fixed line, or a closed plain form that is true with no context (plainTeaching and codeAlone: it claims
 * only math code checked, so it judges nothing). Any judgment of the child's answer, in any words, is then read by the
 * reviews before it is said, and their refusal is binding (bindingReview).
 */
export function stanceHeld(sentence: string, ctx: Pick<TutorCheckContext, "stance" | "exact" | "op" | "trades" | "answer" | "columns" | "own"> & { extra?: ReadonlySet<string> }): boolean {
  if (ctx.stance === "none") return false;
  const text = sentence.replace(/[’]/g, "'").trim();
  if (ctx.exact?.has(exactKey(text)) || /\?\s*$/.test(text) || (exactSafe(text) && CONTEXT_FREE.test(text))) return false;
  return !(plainTeaching(text, ctx.extra) && codeAlone(text, ctx));
}

/** Whether one sentence, on its own, needs the math-truth review: it does not pass on code alone, or the stance holds it. */
const needsMath = (sentence: string, ctx: Parameters<typeof stanceHeld>[1]): boolean => !codeAlone(sentence, ctx) || stanceHeld(sentence, ctx);

/**
 * #1072 (2026-11-15): the factual clause a judgment word is attached to, or null. "You're right, 3 ones is too small to
 * take 4 away." and "You're right that 2 is too small to take 8 away." attach a clause (after a comma or "that"): the
 * judgment word may agree with a fact the child stated. A bare judgment ("You're right.", "Yes!") attaches none and is
 * always a verdict, and so is a clause that holds another judgment word ("You're right, good job."). The clause is only
 * found here; it is never read as true here (the math review reads it, see `agreesWithFact` in session.ts).
 */
export function agreementClause(sentence: string): string | null {
  const text = sentence.replace(/[‘’ʼ]/g, "'").trim();
  const m = AGREE_OPENER.exec(text);
  if (!m) return null;
  const clause = m[1].replace(/[.!]+\s*$/, "").trim();
  if (!/[\p{L}\p{N}]/u.test(clause.replace(/\{name\}/gi, "")) || /\?\s*$/.test(text)) return null;
  return judgment(clause).any ? null : clause;
}
const AGREE_OPENER = /^(?:\{name\}\s*,?\s*)?(?:yes|yeah|yep|right|exactly|true|correct|that'?s (?:right|true|correct)|that is (?:right|true|correct)|you'?re (?:right|correct)|you are (?:right|correct))(?:\s*,\s*(?:\{name\}\s*,\s*)?|\s+that\s+)(\S.*)$/i;

const CAND_NUM = String.raw`(?:\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)`;
const CAND_UNIT = String.raw`(?:ones?|tens?|hundreds?|thousands?)`;
const CAND_OP = String.raw`(?:plus|minus|take away|times|multiplied by|divided by|\+|-|×|÷|x)`;
/** An operation of numbers with no result: "3 minus 4", "2 - 8", "thirteen take away four". */
const CAND_OPERATION = String.raw`(?:the\s+)?${CAND_NUM}(?:\s+${CAND_UNIT})?(?:\s+${CAND_OP}\s+${CAND_NUM}(?:\s+${CAND_UNIT})?)+`;
/**
 * #1072 review (P1): the closed reader of a step request. The WHOLE turn must be one request about a step: a short spoken
 * lead-in, then "I don't get", "I can't do", "I'm stuck on", "how do I do" (or the like), then one operation with no
 * result, and nothing else but "please", "yet" or "at all". This reads requests, never answers.
 */
const STEP_REQUEST = new RegExp(String.raw`^(?:(?:um|uh|so|but|well|okay|ok|hmm)[,\s]+)*(?:i\s+(?:still\s+)?(?:don't|do not|can't|cannot|can not)\s+(?:get|understand|do|figure out|work out|solve)|i\s+(?:don't|do not)\s+know how to\s+(?:do|solve|work out)|(?:i'm|i am)\s+(?:stuck|confused)\s+(?:on|with|about|by)|how\s+(?:do|can|should)\s+(?:i|we|you)\s+(?:do|solve|work out)|(?:can you\s+|please\s+)?(?:help me with|help me do|explain|show me how to do))\s+${CAND_OPERATION}(?:\s+(?:please|yet|at all))?$`, "i");

/**
 * #1072 (2026-11-15): whether the child's turn holds an answer candidate. Review of #1074 (P1), fail closed: the turn
 * holds none only when the closed reader STEP_REQUEST accepts the whole turn as one request about a step ("I don't get
 * 3 minus 4", "I can't do 2 minus 8", "How do I do 13 minus 4?"). Any answer word ("answer", "is", "=", "I got",
 * "it's"), any other word code does not read, a second sentence, or an offered expression ("My final answer: twelve
 * minus eight") makes it a candidate. A judgment word of Maya's after a turn with a candidate is a verdict on an answer:
 * code's stance and the math review's verdict rule read it, as before.
 */
export function childAnswerCandidate(text: string): boolean {
  const said = text.replace(/[‘’ʼ]/g, "'").replace(/[−–]/g, "-").replace(/\s+/g, " ").trim();
  const asks = /^how\b/i.test(said);
  // One sentence only, with one final mark: "?" only on a "how" question.
  const body = said.replace(asks ? /\s*[?.!]?$/ : /\s*[.!]?$/, "");
  if (!body || /[.!?;:,]/.test(body.replace(/^(?:(?:um|uh|so|but|well|okay|ok|hmm),\s*)+/i, ""))) return true;
  return !STEP_REQUEST.test(body);
}

/**
 * #1072 (2026-11-15): "A is too small to take B away" claims A < B. Code refuses it only when it reads the claim whole and
 * finds it false ("4 is too small to take 3 away"): both numbers read, the same place (or none), and no negation or scope
 * before it in its clause ("It is not true that 4 is too small ..." is not refused). It never grants a pass: a sentence
 * with it still goes to the math review.
 */
export function tooSmallProblems(sentence: string): string[] {
  const text = sentence.replace(/[‘’ʼ]/g, "'").replace(/[−–]/g, "-");
  const out: KindRead[] = [];
  for (const m of text.matchAll(TOO_SMALL)) {
    // Final check 12: a negation or a scope before it in its clause is the one full-read guard's (guardedProblems below).
    // Review of #1074 (P2): refuse only when both complete quantities and their places are read in full. Nothing that
    // can join a quantity may stand right before the first number ("8 plus 12 is ...", "twenty three is ...", "2.5")
    // or right after the second ("take 8 plus 8 away", "take twenty three away"): the claim must end its clause there.
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    if (QUANTITY_JOIN_BEFORE.test(before) || !CLAUSE_END_AFTER.test(after)) continue;
    const a = valueOf(m[1]);
    const b = valueOf(m[3]);
    const ua = m[2]?.toLowerCase().replace(/s$/, "");
    const ub = m[4]?.toLowerCase().replace(/s$/, "");
    // Both places said and the same, or neither said: "12 is too small to take 2 tens away" (12 < 20) is not read.
    if (a === null || b === null || !Number.isSafeInteger(a) || !Number.isSafeInteger(b) || (ua ?? null) !== (ub ?? null)) continue;
    // Equal numbers are not refused: code's own step text says the column's top before its trade ("2 tens is too
    // small to take 2" in 223 − 129, where the tens are 1 after the ones' trade).
    if (a > b) out.push({ problem: `${a} is not too small to take ${b} away: ${a} is not less than ${b}`, text, at: m.index, end: m.index + m[0].length });
  }
  return guardedProblems(out);
}
/** Something right before a number that can join it into a larger quantity: a digit, a mark inside a number, a sign, an operator or a number word. */
const QUANTITY_JOIN_BEFORE = new RegExp(String.raw`(?:[\d.,+\-×÷*/=x]|\b(?:plus|minus|times|by|of|over|point|negative|and|a|away|hundred|thousand|${N}))\s*$`, "i");
/** After the second quantity: only "away", then the end of the clause. */
const CLAUSE_END_AFTER = /^(?:\s+away)?\s*(?:$|[.!?;:](?!\d)|,(?!\d)|\s+(?:so|because|since|but)\b)/i;
const TOO_SMALL = new RegExp(String.raw`\b(${N})(?:\s+(${U}))?\s+(?:is|are)\s+(?:too small|too little|not (?:big|large) enough)\s+to\s+(?:take|subtract)\s+(?:away\s+)?(${N})(?:\s+(${U}))?`, "gi");

/** A division with a remainder ("15 ÷ 6 = 2 R 3", in digits or words): falseClaims reads it whole. */
const REMAINDER_FORM = new RegExp(REMAINDER_SAID, "gi");

/** A sentence that says an answer is right. */
const JUDGES_RIGHT = /^(?:yes|yep|yeah|right|correct|exactly)\b|\b(?:is|that'?s|that is|it'?s|you'?re|you are|you got it)\s+(?:right|correct)\b|\byou got it\b|\bwell done\b/i;
/** A sentence that says an answer is not right. */
const JUDGES_WRONG = /\b(?:not quite|not yet|not right|isn'?t right|incorrect|that'?s wrong|is wrong|try again)\b/i;

export type TutorVerdict =
  /**
   * `review`: the sentences that are not plain teaching (plainTeaching): the safety review reads each before it is said.
   * `math`: the sentences with math code did not read whole (unreadMath): the math-truth review reads each before it is
   * said. A sentence may be in both lists; both reviews must pass.
   */
  | { ok: true; needsReview: boolean; review: string[]; math: string[] }
  | { ok: false; reason: "empty" | "too_long" | "never_say" | "false_equation" | "affirms_wrong" | "wrong_stance"; detail: string };


/**
 * The whole-message check (D-345), run once on the model's message. Refuses only: an empty or over-long message, a
 * never-say pattern, a false equation or place-value claim (or a true equation called false), and a "yes" to a wrong
 * answer or a "not quite" to a right one. `needsReview`: a sentence is not plain math, so the talk review reads the
 * whole message before it is said.
 */
export function checkTutorSay(text: string, ctx: TutorCheckContext & { extra?: ReadonlySet<string> }): TutorVerdict {
  const say = text.trim();
  if (!say) return { ok: false, reason: "empty", detail: "The message is empty: say one short helpful thing and ask one small question." };
  // The ceiling counts the child's name as it will be heard (pre-launch review: "Mary Jane" made a 60-word message 61).
  const words = say.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length + ((ctx.nameWords ?? 1) - 1) * (say.match(/\{name\}/g)?.length ?? 0);
  const limit = ctx.wordLimit ?? TUTOR_WORD_LIMIT;
  if (words > limit) return { ok: false, reason: "too_long", detail: `The message has ${words} words; the limit is ${limit}. Say the same one idea in fewer words, then one small question.` };
  const never = neverSayProblem(say);
  if (never) return { ok: false, reason: "never_say", detail: never };
  const sentences = sentencesOf(say);
  // Savar's call 2 (2026-11-15): no self-correction inside a message ("3 tens... wait, 3 isn't it.").
  const fix = selfCorrection(say);
  if (fix) return { ok: false, reason: "never_say", detail: `The message corrects itself ("${fix}"). Say only what is true, once, with no "wait" or "I mean", and end with one question.` };
  // Savar's call 2 (final runs): Maya talks to the child, never about "the child" ("The child answered 2, which fits ...").
  const third = sentences.find((x) => /\bthe child(?:'s)?\b/i.test(x));
  if (third) return { ok: false, reason: "never_say", detail: `"${third}" talks about "the child". Talk to the child: say "you".` };
  // #1105: the first sentence never says the child's own question back ("What is 2 minus 8?"): start with the explanation.
  if (ctx.childTurn && sentences.length > 0 && echoesChild(sentences[0], ctx.childTurn)) {
    return { ok: false, reason: "never_say", detail: `"${sentences[0]}" says the child's own question back. Start with the explanation of what they asked, then ask one small question about the next step.` };
  }
  // Savar's call 2: the whole question's "isn't" form is for a wrong final answer only; a wrong step answer gets "Not
  // quite." or the step's own true fact.
  if (ctx.stepMiss) {
    const deny = sentences.find((x) => deniesWholeQuestion(x, ctx.stepMiss!.pkg));
    if (deny) return { ok: false, reason: "never_say", detail: `"${deny}" denies the whole question, but the child's number answered a step. Start with "Not quite." or the step's own true fact, then ask the step's question again with its numbers.` };
  }
  for (const sentence of sentences) {
    // A division with a remainder is read by falseClaims; the plain equation reader would read "2 R 3" as 2.
    // Final check 8 (2026-11-15): only an equation read in its whole clause is refused. An enclosing negation, a scope,
    // a unit or any other word around it ("It is not true that 3 times 2 is 7.", "52 minus 28 is 2 tens and 4 ones.")
    // leaves it unread: the sentence goes to the math review, never a refusal.
    // 2026-11-15 (fallback rate): and only one the one full-read guard finds read in full ("34 times 12 is 34 times 2,
    // plus 34 times 10" runs on after its comma: it goes to the math review).
    for (const e of equationsOf(sentence.replace(REMAINDER_FORM, " "), { whole: true, guard: fullRead })) {
      const holds = equationHolds(e);
      if (holds === null) continue;
      if (holds === e.negated) return { ok: false, reason: "false_equation", detail: `"${sentence}" ${e.negated ? "calls a true equation false" : "holds a false equation"}. Every equation Maya says must be true.` };
    }
    const claim = falseClaims(sentence, ctx.op, ctx.trades)[0] ?? tooSmallProblems(sentence)[0] ?? ctx.claims?.(sentence)[0];
    if (claim) return { ok: false, reason: "false_equation", detail: `"${sentence}": ${claim}. Every equation and place-value statement must be true.` };
    // "4 is the answer", "the whole answer is 24": the whole value and its "not" (pre-launch review B).
    const wrongAnswer = ctx.answer === undefined ? undefined : answerProblems(sentence, ctx.answer)[0];
    if (wrongAnswer) return { ok: false, reason: "false_equation", detail: `"${sentence}": ${wrongAnswer}.` };
  }
  // No false judgment of the child's answer, in any sentence (final check 3, 2026-11-15): any sentence with a judgment
  // word is a judgment. With stance "wrong" a positive judgment is refused, with stance "right" a negative one. The
  // first sentence is also read by the older forms ("Yes", "Not quite").
  // Final check 4: the broad judgment words no longer refuse (a direction "on the right" is no praise); every other
  // sentence on a "wrong" or "right" stance waits for both reviews instead (stanceHeld), whose refusal is binding.
  for (const [i, sentence] of sentences.entries()) {
    if (ctx.stance === "wrong" && ((i === 0 && affirms(sentence)) || JUDGES_RIGHT.test(sentence))) {
      return { ok: false, reason: "affirms_wrong", detail: "Code found the child's answer wrong: never say it is right, correct or well done. Say kindly that it is not right yet, and where." };
    }
    if (ctx.stance === "right" && JUDGES_WRONG.test(sentence)) {
      return { ok: false, reason: "wrong_stance", detail: "Code found the child's answer right: say so, never \"not quite\" or \"wrong\"." };
    }
  }
  // Final check 4: code's texts count only for the active problem: a message that names a number of the easier example
  // only (and not of the question) drops them.
  const active = sentences.some((x) => sayNumbers(x).some((t) => !!t.q && t.q[1] === 1 && !!ctx.exampleOnly?.has(t.q[0]))) ? { ...ctx, exact: undefined } : ctx;
  const review = sentences.filter((x) => !plainTeaching(x, ctx.extra) || stanceHeld(x, active));
  // The exact-match rule (2026-11-15): only an exact match of code's own text or of a closed plain form passes on code
  // alone; every other sentence goes to the math-truth review. Final check 6: a sentence passes on code alone only when
  // every sentence before it in the message passed on code alone too ("Let us try the easier example. Write 4 in the
  // ones." may have changed the active problem); after the first sentence that needs the review, every later one does.
  const first = sentences.findIndex((x) => needsMath(x, active));
  const math = first === -1 ? [] : sentences.slice(first);
  return { ok: true, needsReview: review.length > 0, review, math };
}

/**
 * How one tutor sentence goes out while the model still writes (D-345 streaming): "send" at once (plain teaching with
 * all its math read by code, and every check passes on the words so far), reviews first (`talk`: not plain teaching;
 * `math`: math code did not read whole; held, alone, until each review passes),
 * or "stop" (a check fails, or the first sentence says right or wrong before code knows the stance): that sentence and
 * every later one wait for the whole message and its whole check.
 */
export function tutorStreamSentence(sentence: string, previous: readonly string[], streamCtx: TutorStreamContext): "send" | "stop" | { talk: boolean; math: boolean } {
  // Final check 4: once the message names a number of the easier example only, code's texts of the question no longer
  // count (the active problem may have changed).
  const ctx = [...previous, sentence].some((x) => sayNumbers(x).some((t) => !!t.q && t.q[1] === 1 && !!streamCtx.exampleOnly?.has(t.q[0]))) ? { ...streamCtx, exact: undefined } : streamCtx;
  const verdict = checkTutorSay([...previous, sentence].join(" "), ctx);
  if (!verdict.ok) return "stop";
  // A judgment of the child's answer, in any sentence, waits unless the stream is sure of it: the final check may read
  // the child's number another way (review of #1006: "I got 4." then "Yes, 4 is the answer.").
  const j = judgment(sentence, ctx.wordAnswer);
  const judgesRight = (previous.length === 0 && affirms(sentence)) || JUDGES_RIGHT.test(sentence) || j.positive;
  const judgesWrong = (previous.length === 0 && DENIES.test(sentence)) || JUDGES_WRONG.test(sentence) || j.negative;
  if ((judgesRight && !ctx.mayAffirm) || (judgesWrong && !ctx.mayDeny)) return "stop";
  // A number that is not one of this question's (an outside answer, a twin question) waits for the whole message and
  // its scope reading (review of #1006: "The answer is 56." for outside homework).
  const foreign = sayNumbers(sentence).some((t) => !t.q || t.q[1] !== 1 || !ctx.allowed.has(t.q[0]));
  if (foreign) return "stop";
  // So does an operation that is not part of this question's work, even with its numbers ("4 plus 8 is 12" in
  // 52 − 28): only the question, its steps, its trades and the child's own expressions stream.
  const outside = equationsOf(sentence).some((e) => !ctx.expressions.has(expressionKey(e.operands.map((o) => o.q?.[0] ?? NaN), e.ops)));
  if (outside) return "stop";
  // Two-layer true math: a sentence with math code did not read whole is held for the math-truth review, beside the
  // safety review when it is not plain teaching.
  const held = stanceHeld(sentence, ctx);
  const talk = !plainTeaching(sentence, ctx.extra) || held;
  // Final check 6: once a sentence already sent or held in this message needed the math review, every later one does.
  const math = needsMath(sentence, ctx) || previous.some((x) => needsMath(x, ctx));
  return talk || math ? { talk, math } : "send";
}

/**
 * What the stream knows before the model writes. `mayAffirm`: a first "yes" cannot be a yes to a wrong answer (code
 * found the child right, or the child said no number). `mayDeny`: a first "not quite" cannot deny a right answer (code
 * found the child wrong, or no number the child said is a value of the question's answer or steps).
 */
export interface TutorStreamContext extends TutorCheckContext {
  extra?: ReadonlySet<string>;
  mayAffirm: boolean;
  mayDeny: boolean;
  /** The numbers a streamed sentence may hold: the question's own, its work's, and the child's. */
  allowed: ReadonlySet<number>;
  /** The operations a streamed sentence may state (expressionKey): the question's, its steps', its trades', the child's. */
  expressions: ReadonlySet<string>;
}

/** The stream's context for the child's turn `text`, from code's stance. */
export function tutorStreamContext(pkg: OperationPackage, text: string, stance: TutorCheckContext["stance"], extra: ReadonlySet<string>, credited: readonly number[] = [], wordQuestion = false): TutorStreamContext {
  const kind = tutorKind(pkg);
  // The child's candidate answers: the last number of each sentence ("Is 2 minus 8, 6?" offers 6, not 2 or 8).
  const said = sentencesOf(text).flatMap((x) => {
    const last = sayNumbers(x).filter((t) => t.q && t.q[1] === 1).at(-1);
    return last ? [last.q![0]] : [];
  });
  const answer = pkg.answer.value.type === "number" ? pkg.answer.value.value : null;
  const right = new Set<number>([...(answer === null ? [] : [answer]), ...kind.workValues(pkg)]);
  const scope = kind.streamScope(pkg);
  const allowed = new Set<number>([...scope.numbers, ...(answer === null ? [] : [answer]), ...sayNumbers(text).flatMap((t) => (t.q && t.q[1] === 1 ? [t.q[0]] : []))]);
  const expressions = new Set<string>([...scope.expressions, ...sentencesOf(text).flatMap((x) => equationsOf(x).map((e) => expressionKey(e.operands.map((o) => o.q?.[0] ?? NaN), e.ops)))]);
  const op = kind.op?.(pkg);
  return {
    stance,
    extra,
    expressions,
    childValues: said,
    ...(op ? { op } : {}),
    ...(answer === null ? {} : { answer }),
    claims: (sentence: string) => kind.claimProblems(pkg, sentence),
    trades: kind.workValues(pkg),
    columns: columnSums(pkg),
    // Final check 4: the caller binds `exact` to the active problem (tutorTexts with the call's turns); a streamed
    // sentence after one that names a number of the easier example only drops it (tutorStreamSentence).
    exact: exactTexts(pkg),
    own: ownNumbers(pkg),
    exampleOnly: exampleOnly(pkg),
    ...(wordQuestion ? { wordAnswer: true } : {}),
    allowed,
    // A "yes" streams only when no reading can make it wrong: the child said no number, or only numbers code's own read
    // credits as right (the final check keeps code's credit over the model's reading). On a word question (a claim or a
    // comparison) the child's answer is a word, not a number: only code's right word lets a "yes" stream.
    mayAffirm: wordQuestion ? stance === "right" && said.every((n) => n === answer || credited.includes(n)) : said.length === 0 || (stance === "right" && said.every((n) => n === answer || credited.includes(n))),
    mayDeny: stance === "wrong" || (stance === "none" && !said.some((n) => right.has(n))),
  };
}

/** A sentence that starts by saying an answer is not right. */
const DENIES = /^\s*(?:not quite|not yet|not right|no\b|nope|that'?s not|that isn'?t|incorrect|close)/i;

/**
 * 2026-11-15 (voice fallbacks): a repair that CONTINUES a message whose first sentences were already said (streamed). The
 * sentences said are fixed: the message is them, then the repair's own sentences. A repair that starts by saying the
 * fixed sentences again, in order, has them left out once (`echoed`, how many). Null when nothing is left after them, or
 * when the rest says a fixed sentence again (by sentenceKey): a continuation never repeats what the child heard.
 * Pure: the voice turn and a streaming chat turn use it the same way.
 */
export function continuedSay(sent: readonly string[], say: string): { text: string; echoed: number } | null {
  const rest = sentencesOf(say.trim());
  let echoed = 0;
  while (echoed < sent.length && echoed < rest.length && sentenceKey(rest[echoed]) === sentenceKey(sent[echoed])) echoed++;
  const tail = rest.slice(echoed);
  const fixed = new Set(sent.map(sentenceKey));
  if (tail.length === 0 || tail.some((x) => fixed.has(sentenceKey(x)))) return null;
  return { text: [...sent, ...tail].join(" "), echoed };
}

/**
 * The steps whose own equation the sentences say as a true equation ("13 minus 6 is 7." tells the ones of 83 − 46): after
 * those sentences code's line asks the next step, never one the child just heard told or got right.
 */
export function stepsStated(pkg: OperationPackage, sentences: readonly string[]): string[] {
  const said = new Set(sentences.flatMap((x) => equationsOf(x).filter((e) => !e.negated && equationHolds(e) === true && [...e.operands, e.result].every((o) => o.q?.[1] === 1)).map((e) => expressionKey(e.operands.map((o) => o.q![0]), e.ops))));
  return stepFacts(pkg).filter((st) => equationsOf(st.work).some((e) => [...e.operands, e.result].every((o) => o.q?.[1] === 1) && said.has(expressionKey(e.operands.map((o) => o.q![0]), e.ops)))).map((st) => st.id);
}

/** Code's honest line when the model's message failed twice (D-345): one short line and the step's question. */
export function tutorFallbackText(pkg: OperationPackage, done: readonly string[], solved: boolean, asked?: string | null): string {
  // Savar's call 2 (2026-11-15): no explain-back after the right final answer; ask whether the child wants another.
  if (solved) return `You solved this one. ${FINAL_ASK}`;
  // Review of #1009: a kind's question is code's line only in a closed plain math form with true math; else the core's
  // own question (the child hears this line with no review).
  const kind = tutorKind(pkg);
  const op = kind.op?.(pkg);
  const safe = (q: string | null | undefined): q is string => {
    if (!q) return false;
    const verdict = checkTutorSay(q, { stance: "none", claims: (x) => kind.claimProblems(pkg, x), trades: kind.workValues(pkg), exact: exactTexts(pkg), ...(op ? { op } : {}) });
    // Two-layer true math: code's own line has every number read by code (it gets no math review either).
    return plainTeaching(q) && verdict.ok && verdict.math.length === 0;
  };
  // Savar's call 2: the question Maya asked that the child has not answered (code's own form of it) comes first, so
  // code's line never jumps past the part the child is on ("5 tens take away 1" before "4 minus 2").
  if (safe(asked)) return `Let me say that another way. ${asked}`;
  const q = kind.stepQuestion(pkg, done);
  return `Let me say that another way. ${safe(q) ? q : "So what is the whole answer?"}`;
}

/**
 * Savar's call 2 and the Chief of Staff (2026-11-15, round 2): Maya's ONE yes/no question after the right final answer.
 * A "no" or a "yes" ends the call only after this offer (a call has one question, so "yes" ends warmly too).
 */
export const FINAL_ASK = "Do you want to try another one?";

/** The commands for the model's drawing requests (the question's kind builds them from its checked steps). */
export function tutorDrawings(pkg: OperationPackage, draw: readonly { offer: string; place?: string; sentence?: number }[], drawn: readonly string[], noteId: (i: number) => string): { commands: TutorCommand[]; keys: string[] } {
  const kind = tutorKind(pkg);
  const { commands, keys } = kind.draw(pkg, draw, drawn, noteId);
  // Review of #1009: the core checks every kind command before the board gets it. A batch with any command that fails
  // is not drawn at all (the words still go out).
  const numbers = tutorBoardNumbers(pkg);
  return commands.every((c) => safeCommand(c, numbers)) ? { commands, keys } : { commands: [], keys: [] };
}

/** The numbers a tutor drawing may show (safeCommand): the question's own, its work's and the answer. */
export function tutorBoardNumbers(pkg: OperationPackage): ReadonlySet<string> {
  const kind = tutorKind(pkg);
  const answer = pkg.answer.value.type === "number" ? [pkg.answer.value.value] : [];
  return new Set<string>([...kind.streamScope(pkg).numbers, ...kind.workValues(pkg), ...answer].map(String));
}

/** Fields of a board command that carry text a child sees. */
const SHOWN_FIELDS = new Set(["text", "label", "caption", "title", "value", "values"]);

/**
 * A kind's board command the child may see: every shown field is one of the question's own numbers ("value") or a
 * whole true equation that noteFromEquation rebuilds the same ("text"); every other string is a short structural id
 * (no spaces). Nested objects and lists are read the same way.
 */
export function safeCommand(cmd: unknown, numbers: ReadonlySet<string>, key = ""): boolean {
  if (typeof cmd === "string") {
    if (!SHOWN_FIELDS.has(key)) return !/\s/.test(cmd) && cmd.length <= 40;
    if (/^\d+$/.test(cmd)) return numbers.has(String(Number(cmd)));
    return noteFromEquation(cmd) === cmd;
  }
  if (typeof cmd === "number") return !SHOWN_FIELDS.has(key) || numbers.has(String(cmd));
  if (cmd === null || typeof cmd === "boolean") return true;
  if (Array.isArray(cmd)) return cmd.every((x) => safeCommand(x, numbers, key));
  if (typeof cmd === "object") return Object.entries(cmd as Record<string, unknown>).every(([k, v]) => safeCommand(v, numbers, k));
  return false;
}

export { expressionKey } from "./tutor-kind";
export { tutorSteps, stepEquation, type TutorStep } from "./tutor-kinds/column";
