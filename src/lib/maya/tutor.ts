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
import { affirms, equationHolds, equationsOf, neverSayProblem, sayNumbers, sentencesOf } from "./say-check";
import { exactSafe } from "./math-vocab";
import { falseClaims } from "./tutor-math";

/** The hard ceiling of one Maya message, in words. Over it, the model gets one repair with the reason; code never trims. */
export const TUTOR_WORD_LIMIT = 60;

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
  // Only the exact approved sentences skip the review as they are; an open frame never does (review of #1006).
  if (exactSafe(text)) return true;
  // Review of #1006 (four rounds): no word list decides it. Each clause (split at ":", ";" and ","), after a short
  // spoken lead-in, must match one of a few complete math forms built only from numbers, places and operations
  // (PLAIN_FORMS). Every other sentence is reviewed, in parallel with the stream.
  return text.replace(/[.!?]+\s*$/, "").split(/\s*[:;,]\s*/).every((raw) => {
    let clause = raw.trim();
    for (let k = 0; k < 4; k++) clause = clause.replace(LEAD_IN, "").trim();
    return clause === "" || PLAIN_FORMS.some((re) => re.test(clause));
  });
}

const N = String.raw`(?:\d{1,3}|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)`;
const U = String.raw`(?:ones?|tens?|hundreds?)`;
const Q = String.raw`(?:${N}(?:\s+${U})?)`;
const E = String.raw`(?:${Q}(?:\s+(?:plus|minus|take away|\+|-)\s+(?:the\s+)?${Q})*)`;
const PLACE = String.raw`(?:the\s+)?${U}(?:\s+(?:column|place))?`;
/** The complete math forms a clause may take with no review. Nothing else: no person, no object, no feeling. */
const PLAIN_FORMS: readonly RegExp[] = [
  // "12 minus 8 is 4", "6 is 8 minus 2", "52 is 4 tens and 12 ones", "2 minus 8 isn't 6"
  new RegExp(String.raw`^(?:so\s+)?${E}\s+(?:is|equals|=|makes|is not|isn't)\s+${E}(?:\s+and\s+${Q})*$`, "i"),
  // "6 is not right", "4 is right for the ones"
  new RegExp(String.raw`^${E}\s+(?:is|isn't|is not)\s+(?:right|correct)(?:\s+for\s+${PLACE})?$`, "i"),
    // "What is 12 minus 8?", "What do you get for 4 minus 2?"
  new RegExp(String.raw`^(?:so\s+)?(?:what is|what's|what do you get for|what do we get for)\s+${E}$`, "i"),
  // "How many ones are left?", "How many tens do we have now?"
  new RegExp(String.raw`^how many ${U}(?:\s+(?:are left|are there|do we have(?: now)?|now))?$`, "i"),
  // "What do we write in the ones?", "What goes in the tens place?"
  new RegExp(String.raw`^what (?:do we write|do you write|goes|do we put|do you put) in ${PLACE}$`, "i"),
  // "What is the whole answer?"
  /^what is the (?:whole |final )?answer$/i,
  // "Write 4 in the ones", "Put 2 in the tens place"
  new RegExp(String.raw`^(?:write|put) ${N} in ${PLACE}$`, "i"),
  // "Trade 1 ten for 10 ones", "We trade one ten for ten ones"
  new RegExp(String.raw`^(?:we\s+)?(?:trade|regroup)\s+(?:1|one|a)\s+ten\s+(?:for|into|as)\s+(?:10|ten)\s+ones$`, "i"),
  // "Subtract the ones", "Add the tens"
  new RegExp(String.raw`^(?:now\s+)?(?:subtract|add)\s+${PLACE}$`, "i"),
  // "the tens", "in the ones column", "the other way around"
  new RegExp(String.raw`^(?:(?:in|for|on|to)\s+)?${PLACE}$`, "i"),
  /^the other way around$/i,
];

/** A short spoken lead-in before the math of a clause: fixed words only. */
const LEAD_IN = /^(?:\{name\}|(?:now|so|next|then|okay|ok|yes|no|right|good question|not quite|not yet|that's it)\b)[\s!.]*/i;

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
  /** The question's answer: "N is the answer" must name it. */
  answer?: number;
  /** The question kind's own true-math checks of one sentence (TutorKind.claimProblems). */
  claims?: (sentence: string) => string[];
}

/** "4 is the answer", "the whole answer is 24", "your answer 36 is right": a claim about which number is the answer. */
const ANSWER_CLAIM = /\b(\d+) is (?:the|your|our) (?:whole |final |right )?answer\b|\b(?:the|your|our) (?:whole |final |right )?answer is (\d+)\b/gi;

/** A division with a remainder ("15 ÷ 6 = 2 R 3"): falseClaims reads it whole. */
const REMAINDER_FORM = /\d+\s*(?:÷|\/|divided by)\s*\d+\s*(?:=|is|equals|makes)\s*\d+\s*(?:R|r|remainder|with a remainder of|with remainder)\s*\d+/g;

/** A sentence that says an answer is right. */
const JUDGES_RIGHT = /^(?:yes|yep|yeah|right|correct|exactly)\b|\b(?:is|that'?s|that is|it'?s|you'?re|you are|you got it)\s+(?:right|correct)\b|\byou got it\b|\bwell done\b/i;
/** A sentence that says an answer is not right. */
const JUDGES_WRONG = /\b(?:not quite|not yet|not right|isn'?t right|incorrect|that'?s wrong|is wrong|try again)\b/i;

export type TutorVerdict =
  /** `review`: the sentences that are not plain teaching (plainTeaching): the safety review reads each before it is said. */
  | { ok: true; needsReview: boolean; review: string[] }
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
  const words = say.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  if (words > TUTOR_WORD_LIMIT) return { ok: false, reason: "too_long", detail: `The message has ${words} words; the limit is ${TUTOR_WORD_LIMIT}. Say the same one idea in fewer words, then one small question.` };
  const never = neverSayProblem(say);
  if (never) return { ok: false, reason: "never_say", detail: never };
  const sentences = sentencesOf(say);
  for (const sentence of sentences) {
    // A division with a remainder is read by falseClaims; the plain equation reader would read "2 R 3" as 2.
    for (const e of equationsOf(sentence.replace(REMAINDER_FORM, " "))) {
      const holds = equationHolds(e);
      if (holds === null) continue;
      if (holds === e.negated) return { ok: false, reason: "false_equation", detail: `"${sentence}" ${e.negated ? "calls a true equation false" : "holds a false equation"}. Every equation Maya says must be true.` };
    }
    const claim = falseClaims(sentence, ctx.op)[0] ?? ctx.claims?.(sentence)[0];
    if (claim) return { ok: false, reason: "false_equation", detail: `"${sentence}": ${claim}. Every equation and place-value statement must be true.` };
    if (ctx.answer !== undefined) for (const m of sentence.matchAll(ANSWER_CLAIM)) {
      const n = Number(m[1] ?? m[2]);
      if (n !== ctx.answer) return { ok: false, reason: "false_equation", detail: `"${sentence}": ${n} is not the answer to the question.` };
    }
  }
  // No false judgment of the child's answer, in any sentence: a "yes" or "right" for a wrong answer, a "not quite" for
  // a right one. The first sentence is judged strictly. A later one is exempt only when it judges its own true equation
  // ("Earlier you got 12 − 8 = 4, and that's right"): it names none of the child's numbers and not "your answer".
  const names = (sentence: string, values: readonly number[] | undefined) => {
    const said = sayNumbers(sentence).flatMap((t) => (t.q && t.q[1] === 1 ? [t.q[0]] : []));
    const ownEquation = equationsOf(sentence).some((e) => !e.negated && equationHolds(e) === true);
    return !ownEquation || said.some((n) => (values ?? []).includes(n)) || /\byour (?:answer|number|work)\b/i.test(sentence);
  };
  for (const [i, sentence] of sentences.entries()) {
    if (ctx.stance === "wrong" && ((i === 0 && affirms(sentence)) || (JUDGES_RIGHT.test(sentence) && names(sentence, ctx.childValues)))) {
      return { ok: false, reason: "affirms_wrong", detail: "Code found the child's answer wrong: never say it is right. Say kindly that it is not right yet, and where." };
    }
    if (ctx.stance === "right" && ((i === 0 && JUDGES_WRONG.test(sentence)) || (JUDGES_WRONG.test(sentence) && names(sentence, ctx.childValues)))) {
      return { ok: false, reason: "wrong_stance", detail: "Code found the child's answer right: say so, never \"not quite\"." };
    }
  }
  const review = sentences.filter((x) => !plainTeaching(x, ctx.extra));
  return { ok: true, needsReview: review.length > 0, review };
}

/**
 * How one tutor sentence goes out while the model still writes (D-345 streaming): "send" at once (plain teaching, and
 * every check passes on the words so far), "review" first (not plain teaching: held, alone, until its review passes),
 * or "stop" (a check fails, or the first sentence says right or wrong before code knows the stance): that sentence and
 * every later one wait for the whole message and its whole check.
 */
export function tutorStreamSentence(sentence: string, previous: readonly string[], ctx: TutorStreamContext): "send" | "review" | "stop" {
  const verdict = checkTutorSay([...previous, sentence].join(" "), ctx);
  if (!verdict.ok) return "stop";
  // A judgment of the child's answer, in any sentence, waits unless the stream is sure of it: the final check may read
  // the child's number another way (review of #1006: "I got 4." then "Yes, 4 is the answer.").
  const judgesRight = (previous.length === 0 && affirms(sentence)) || JUDGES_RIGHT.test(sentence);
  const judgesWrong = (previous.length === 0 && DENIES.test(sentence)) || JUDGES_WRONG.test(sentence);
  if ((judgesRight && !ctx.mayAffirm) || (judgesWrong && !ctx.mayDeny)) return "stop";
  // A number that is not one of this question's (an outside answer, a twin question) waits for the whole message and
  // its scope reading (review of #1006: "The answer is 56." for outside homework).
  const foreign = sayNumbers(sentence).some((t) => !t.q || t.q[1] !== 1 || !ctx.allowed.has(t.q[0]));
  if (foreign) return "stop";
  // So does an operation that is not part of this question's work, even with its numbers ("4 plus 8 is 12" in
  // 52 − 28): only the question, its steps, its trades and the child's own expressions stream.
  const outside = equationsOf(sentence).some((e) => !ctx.expressions.has(expressionKey(e.operands.map((o) => o.q?.[0] ?? NaN), e.ops)));
  if (outside) return "stop";
  return plainTeaching(sentence, ctx.extra) ? "send" : "review";
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
export function tutorStreamContext(pkg: OperationPackage, text: string, stance: TutorCheckContext["stance"], extra: ReadonlySet<string>, credited: readonly number[] = []): TutorStreamContext {
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
    allowed,
    // A "yes" streams only when no reading can make it wrong: the child said no number, or only numbers code's own read
    // credits as right (the final check keeps code's credit over the model's reading).
    mayAffirm: said.length === 0 || (stance === "right" && said.every((n) => n === answer || credited.includes(n))),
    mayDeny: stance === "wrong" || (stance === "none" && !said.some((n) => right.has(n))),
  };
}

/** A sentence that starts by saying an answer is not right. */
const DENIES = /^\s*(?:not quite|not yet|not right|no\b|nope|that'?s not|that isn'?t|incorrect|close)/i;

/** Code's honest line when the model's message failed twice (D-345): one short line and the step's question. */
export function tutorFallbackText(pkg: OperationPackage, done: readonly string[], solved: boolean): string {
  if (solved) return "Let me say that another way. How did you get your answer?";
  // Review of #1009: a kind's question is code's line only in a closed plain math form with true math; else the core's
  // own question (the child hears this line with no review).
  const kind = tutorKind(pkg);
  const q = kind.stepQuestion(pkg, done);
  const op = kind.op?.(pkg);
  const safe = q !== null && plainTeaching(q) && checkTutorSay(q, { stance: "none", claims: (x) => kind.claimProblems(pkg, x), ...(op ? { op } : {}) }).ok;
  return `Let me say that another way. ${safe ? q : "So what is the whole answer?"}`;
}

/** The commands for the model's drawing requests (the question's kind builds them from its checked steps). */
export function tutorDrawings(pkg: OperationPackage, draw: readonly { offer: string; place?: string }[], drawn: readonly string[], noteId: (i: number) => string): { commands: TutorCommand[]; keys: string[] } {
  const kind = tutorKind(pkg);
  const { commands, keys } = kind.draw(pkg, draw, drawn, noteId);
  // Review of #1009: the core checks every kind command before the board gets it. A batch with any command that fails
  // is not drawn at all (the words still go out).
  const answer = pkg.answer.value.type === "number" ? [pkg.answer.value.value] : [];
  const numbers = new Set<string>([...kind.streamScope(pkg).numbers, ...kind.workValues(pkg), ...answer].map(String));
  return commands.every((c) => safeCommand(c, numbers)) ? { commands, keys } : { commands: [], keys: [] };
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
