// Claim questions in Maya's calls (Wave A, A4): "True or false: 8 × 850 = 6800." and "Is 6 × 870 greater than 5226?
// Circle yes or no." The deriver (src/lib/maya-teaching/claim.ts) gives the package the claim's computed side as its
// operation. Here the session teaches it: the operation's own worked steps, then one checked compare step (the result
// the child puts together, compared with the printed number), then the circled word as the final answer.
//
// The word is read by code, never by the model, and only in exact forms (an allow-list over the whole turn):
// - a committed form, after any Maya turn: "It's true.", "I circle no.", "The answer is yes.", "..., so it's false."
// - after Maya's own claim question only (`claimAsked`: her last accepted turn chose the final step's invite, point or
//   operation line, or confirm.claim): a bare word ("True.", "No, 5220 is less than 5226.") is said back
//   (confirm.word), and only a plain yes to that commits it; "maybe true", "true?", "not true", "true or false" and both
//   words get confirm.claim, which names both choices.
// - after any other question of Maya's ("Did you say 5220?", "Can you show me how you began 870 × 6?"), a bare yes, no,
//   true or false answers that question: it is no claim turn at all, with no say-back and no confirm.
// The compare step ("claim") is credited only from a whole-turn template (claimStepHeard), as a column is.
// The two words come from code (the item's printed choices). Maya never gives the word (no give_answer), and she asks the
// child to circle it, never to write a number. Pure TypeScript: no clock, network or randomness.
import { equivalent, operationText, type AnswerValue, type Operation, type OperationPackage, type WorkedStep } from "@/lib/question-package";
import { claimExample, claimStep, readClaim, type Claim } from "@/lib/maya-teaching/claim";
import type { Act, ChildAnswer } from "./proposal";
import { confirmWordsOnly, plainNumber, wholeTurn, wholeYes, type AnswerRead } from "./numbers";
import type { LineId, LineOffer, Slots } from "./lines";

/** The claim as a session holds it: read again from the teaching package's steps and item. */
export interface SessionClaim {
  choices: readonly [string, string];
  relation: "equal" | "greater";
  value: number;
  shown: number;
  holds: boolean;
  word: string;
  other: string;
}

type ClaimStep = Extract<WorkedStep, { kind: "claim-compare" }>;
const choice = (value: string): AnswerValue => ({ type: "choice", value });

/** The session's claim: its compare step, its answer word and the item's two printed words; null for any other package. */
export function sessionClaim(pkg: OperationPackage | null): SessionClaim | null {
  if (!pkg) return null;
  const step = pkg.steps.find((s): s is ClaimStep => s.kind === "claim-compare");
  const region = pkg.item?.regions.find((r) => r.kind === "choice");
  if (!step || region?.kind !== "choice" || region.choices.length !== 2 || pkg.answer.value.type !== "choice") return null;
  const [first, second] = region.choices;
  const word = pkg.answer.value.value;
  if (word !== (step.holds ? first : second)) return null;
  return { choices: [first, second], relation: step.relation, value: step.value, shown: step.shown, holds: step.holds, word, other: word === first ? second : first };
}

/**
 * The package must be taught as a claim: its item is a circle item with a choice of true and false or of yes and no,
 * so its answer is a word, not the operation's answer. A Mixed set's "Tick the operation" is not one.
 */
const isClaimItem = (pkg: OperationPackage) => pkg.item?.format === "circle" && pkg.item.regions.some((r) => r.kind === "choice" &&
  r.choices.length === 2 && [["true", "false"], ["yes", "no"]].some(([a, b]) => r.choices.includes(a) && r.choices.includes(b)));

/**
 * The package a session teaches for a claim question: the operation's worked steps, the compare step and the word as the
 * answer, with the same for its easier example. Null for a package whose item is not a circled template word (it is
 * taught as it is); a held reason for one code cannot read and check as a claim (fail closed: never taught as a number).
 */
export function claimSessionPackage(pkg: OperationPackage): { pkg: OperationPackage } | { held: string } | null {
  if (!isClaimItem(pkg)) return null;
  const held = { held: "Maya cannot teach this circle question yet" };
  const claim = readClaim(pkg, pkg.operation);
  if (!claim || !equivalent(pkg.answer.value, { type: "number", value: claim.value })) return held;
  const example = claimExample(claim, pkg);
  if (!example) return held;
  const work = (steps: WorkedStep[], c: Claim): WorkedStep[] =>
    [...steps.filter((s) => s.kind !== "result"), claimStep(c), { id: "result", kind: "result", value: choice(c.word) }];
  return {
    pkg: {
      ...pkg,
      answer: { value: choice(claim.word), accepted: [], unit: null },
      steps: work(pkg.steps, claim),
      wrongAnswers: [
        { value: choice(claim.other), cause: "claim", description: "Circles the other word.", step: "claim" },
        ...pkg.wrongAnswers.map((w) => ({ ...w, step: null })),
      ],
      easierExample: {
        text: claimSentence(example, operationText(example.operation)),
        operation: example.operation,
        answer: choice(example.word),
        steps: work(pkg.easierExample.steps, example),
      },
    },
  };
}

/** The package as a session teaches it: a claim question's session package, else the package itself. */
export function claimView(pkg: OperationPackage): OperationPackage {
  if (sessionClaim(pkg)) return pkg;
  const made = claimSessionPackage(pkg);
  return made && "pkg" in made ? made.pkg : pkg;
}

/** The claim as Maya asks it: "Is 2 × 3 = 7 true or false?", "Is 2 × 3 greater than 5?", "Is 2 × 3 = 7 right?". */
function claimSentence(c: Pick<SessionClaim, "choices" | "relation" | "shown">, expr: string): string {
  if (c.choices[0] === "true") return `Is ${expr} = ${c.shown} true or false?`;
  return c.relation === "greater" ? `Is ${expr} greater than ${c.shown}?` : `Is ${expr} = ${c.shown} right?`;
}

// ---------- Maya's lines ----------

/**
 * The claim lines' wordings (lines.ts takes them into TEMPLATES). `{ask}` is the claim's own question, ending with its
 * two words ("Is 8 × 850 = 6800 true or false?", "Is 6 × 870 greater than 5226? Circle yes or no."), so a bare word after
 * it answers the claim. No line here says the word before the child does, except the answer and the request to circle it.
 */
export const CLAIM_TEMPLATES = {
  // Every claim line fits 25 spoken words at grade 3 with the book's largest numbers (wave brief, lessons 2 and 3).
  "question.claim": ["First we work out {expr}.", "Let's work out {expr} first.", "We start with {expr}.", "Let's find {expr} first.", "First, let's find {expr}."],
  // The product printed with its shorter number first ("6 × 870") is worked as "870 × 6": the same number, one row.
  "question.claim.swap": [
    "{printed} is the same as {expr}.", "We can swap them: {printed} is the same as {expr}.", "{printed} makes the same number as {expr}.",
    "Swap the numbers: {printed} is the same as {expr}.", "{printed} and {expr} make the same number.",
  ],
  "example.intro.claim": [
    "Let's try an easier one first. {ask}", "Here's a smaller one to warm up. {ask}", "Let me show you an easier one. {ask}",
    "First, a smaller one. {ask}", "I'll show you an easier one first. {ask}",
  ],
  "example.claim": ["So {show}.", "And that's it: {show}.", "There we go: {show}.", "All done: {show}.", "So in the end, {show}."],
  // The compare step: each level says that the result is compared with the page's number (lesson 2: the framing comes
  // with the first line on the step, at whatever level the child enters).
  "invite.claim.product": [
    "What is {expr}? Then we compare it with {shown}.", "Now find {expr}. Then we compare it with {shown}.",
    "What does {expr} make? Then we check {shown}.", "So what is {expr}? Then we look at {shown}.", "Put it together: what is {expr}? Then we check {shown}.",
  ],
  // Never "read the digits you wrote": the result is this step's answer (brief lesson 9).
  "point.claim.product": [
    "Put the parts together to get {expr}. Then compare it with {shown}.", "Your columns make {expr}. Then we compare it with {shown}.",
    "Join the parts of {expr}. Then we look at {shown}.", "Put your columns together for {expr}. Then check {shown}.",
    "The columns together make {expr}. Then compare it with {shown}.",
  ],
  "operation.claim.product": [
    "First find {expr}. Then we compare it with {shown}.", "We need {expr} first. Then we look at {shown}.",
    "Work out {expr}. Then check it against {shown}.", "Find {expr}. After that, compare it with {shown}.",
    "Let's finish {expr}. Then we check {shown}.",
  ],
  "invite.claim": ["{ask}", "Now check it. {ask}", "Last part. {ask}", "Let's check. {ask}", "Now the question. {ask}"],
  "point.claim": [
    "Compare {value} with {shown}. Circle {first} or {second}.", "We found {value}. The page says {shown}. Circle {first} or {second}.",
    "Look at {value} and {shown}. Circle {first} or {second}.", "Our number is {value}. The page has {shown}. Circle {first} or {second}.",
    "Check {value} against {shown}. Circle {first} or {second}.",
  ],
  "compare.claim": [
    "{compare} Circle {first} or {second}.", "Look: {compare} Circle {first} or {second}.", "Let's compare. {compare} Circle {first} or {second}.",
    "Here's the check. {compare} Circle {first} or {second}.", "{compare} Which word do you circle?",
  ],
  "answer.claim": [
    "Yes! {expr} = {value}. So you circle {word}.", "That's right: {expr} = {value}. You circle {word}.",
    "You got it! {expr} = {value}. It's {word}.", "Well done! {expr} = {value}. You circle {word}.", "Exactly! {expr} = {value}. The answer is {word}.",
  ],
  "write.claim": [
    "Please circle {word} on your page.", "Can you circle {word} on your page?", "Now circle {word} on your page.",
    "Go ahead and circle {word} on your paper.", "Circle {word} on your page, please.",
  ],
  "write.claim.yours": [
    "Please circle your answer on your page.", "Can you circle your answer on your page?", "Go ahead and circle your answer on your paper.",
    "Now circle your answer on your page.", "Circle your answer on your page, please.",
  ],
  // The honest close (controller decision (a), #735; pending Savar's approval, D-202): this one is hard, stopping is fine,
  // and one next step. No number, no word to circle, no hint at the answer.
  "close.honest": [
    "This one is hard, and it's okay to stop. You can try the easier one on paper.",
    "This is a tricky one. It's fine to stop here. You could ask a grown-up to try it with you.",
    "This one is hard. We can stop for now. Try the easier one on your paper later.",
    "This one is tough, and stopping is fine. A grown-up can help you try it.",
    "This question is hard, and that's okay. Let's stop here. Try the smaller one on paper.",
  ],
  // A bare word said back (controller rule 4): the child's own word, never the other one.
  "confirm.claim.said": [
    "You said {heard}. Is {heard} the word you circle?", "I heard {heard}. Do you circle {heard}?", "So you circle {heard}?",
    "Is {heard} your answer?", "Just checking: do you circle {heard}?",
  ],
  "confirm.claim": [
    "Which word do you circle: {first} or {second}?", "Do you circle {first} or {second}?", "Which one is it: {first} or {second}?",
    "Tell me one word: {first} or {second}?", "Which word is your answer: {first} or {second}?",
  ],
} as const satisfies Record<string, readonly string[]>;
export type ClaimTemplateKey = keyof typeof CLAIM_TEMPLATES;

/** How lines.ts builds an offer from a template; passed in, so this module does not import lines.ts. */
export type MakeOffer = (line: LineId, key: ClaimTemplateKey, vars: Record<string, string | number>, extra?: Omit<LineOffer, "line" | "texts" | "key">) => LineOffer;

/** "6800", "9.22". */
const num = (n: number) => String(n);

/** The claim's question, ending with its two words: a bare word after it answers the claim. */
function askOf(c: SessionClaim, expr: string): string {
  const [a, b] = c.choices;
  return c.choices[0] === "true" ? `Is ${expr} = ${num(c.shown)} ${a} or ${b}?` : `${claimSentence(c, expr)} Circle ${a} or ${b}.`;
}

/**
 * The child's own claim question, after they found the result. An "equal" claim names the sentence on the page, not its
 * equation: "Yes! 6 × 8 = 48." then "Is 6 × 8 = 48 true or false?" says one equation twice. Every equal claim asks it
 * this way, true or not, so the wording says nothing of the answer.
 */
function targetAsk(c: SessionClaim, expr: string): string {
  const [a, b] = c.choices;
  if (c.relation !== "equal") return askOf(c, expr);
  return a === "true" ? `Is the sentence on your page ${a} or ${b}?` : `Is the sentence on your page right? Circle ${a} or ${b}.`;
}

/** The comparison in words, without the word to circle: "5220 is less than 5226.", "6800 and 6800 are the same number." */
function compareOf(c: Pick<SessionClaim, "relation" | "value" | "shown">): string {
  const [v, s] = [num(c.value), num(c.shown)];
  if (c.relation === "equal") return c.value === c.shown ? `${v} and ${s} are the same number.` : `${v} is not ${s}.`;
  return c.value > c.shown ? `${v} is greater than ${s}.` : c.value === c.shown ? `${v} is the same as ${s}, not greater.` : `${v} is less than ${s}.`;
}

/**
 * The claim lines of a session package, or null for a package that is not a claim. `step.invite` for the compare step is
 * lines.ts's own "invite.result" ("So what is 8 × 850?"); the final step ("result") has H0 to H2 and no H3: its H3 would
 * be the word.
 */
export function claimLines(pkg: OperationPackage, offer: MakeOffer) {
  const c = sessionClaim(pkg);
  if (!c) return null;
  const expr = operationText(pkg.operation);
  const ask = targetAsk(c, expr);
  const step = (id: string, level: 0 | 1 | 2): Pick<LineOffer, "slots" | "level"> => ({ slots: { step: id } as Slots, level });
  const vars = { expr, value: num(c.value), shown: num(c.shown), ask, word: c.word, compare: compareOf(c), first: c.choices[0], second: c.choices[1] };
  const example = sessionClaim({ ...pkg, steps: pkg.easierExample.steps, answer: { value: pkg.easierExample.answer, accepted: [], unit: null } });
  const exampleExpr = operationText(pkg.easierExample.operation);
  const printed = printedOrder(pkg);
  return {
    /** The claim is circled yes or no. */
    yesNo: c.choices[0] === "yes",
    question: (): LineOffer[] => [printed
      ? offer("question.problem", "question.claim.swap", { expr, printed }, { slots: {}, board: expr })
      : offer("question.problem", "question.claim", { expr }, { slots: {}, board: expr })],
    exampleIntro: (): LineOffer[] => (example ? [offer("example.intro", "example.intro.claim", { ask: askOf(example, exampleExpr) }, { slots: {}, board: exampleExpr })] : []),
    /** The example's last step (its word): "So we circle false." */
    exampleResult: (id: string): LineOffer[] => (example ? [offer("example.step", "example.claim", { show: `we circle ${example.word}` }, { slots: { step: id } })] : []),
    /** The compare step's H1 and H2 (H0 is invite.result, H3 the step shown). */
    /** The compare step's H0 to H2, each with what the result is compared with (H3 is the step shown). */
    claimStep: (id: string): LineOffer[] => [
      offer("step.invite", "invite.claim.product", vars, step(id, 0)),
      offer("step.point", "point.claim.product", vars, step(id, 1)),
      offer("step.operation", "operation.claim.product", vars, step(id, 2)),
    ],
    /** The final step: the claim's question (H0), the two numbers to compare (H1), and how they compare (H2). */
    result: (): LineOffer[] => [
      offer("step.invite", "invite.claim", vars, step("result", 0)),
      offer("step.point", "point.claim", vars, step("result", 1)),
      offer("step.operation", "compare.claim", vars, step("result", 2)),
    ],
    answerRight: (): LineOffer[] => [offer("answer.right", "answer.claim", vars, { slots: {}, board: `${expr} = ${num(c.value)}` })],
    writeAnswer: (): LineOffer[] => [offer("write.answer", "write.claim", vars)],
    writeYours: (): LineOffer[] => [offer("write.yours", "write.claim.yours", {})],
    which: (): LineOffer[] => [offer("confirm.claim", "confirm.claim", { first: c.choices[0], second: c.choices[1] })],
    /** The honest close: no answer, one next step. */
    honestClose: (): LineOffer[] => [offer("close.honest", "close.honest", {})],
    /** "You said true. Is true the word you circle?": only for a word the child said bare. */
    said: (word: string): LineOffer[] => (c.choices.includes(word) ? [offer("confirm.word", "confirm.claim.said", { heard: word }, { slots: { heard: word } })] : []),
  };
}

/** The product as printed, when the operation works it the other way round ("6 × 870" for 870 × 6), else null. */
function printedOrder(pkg: OperationPackage): string | null {
  if (pkg.operation.kind !== "multiply") return null;
  const [a, b] = pkg.operation.operands;
  const text = pkg.text.replace(/\s+/g, " ");
  return !text.includes(`${a} × ${b}`) && text.includes(`${b} × ${a}`) ? `${b} × ${a}` : null;
}

/** A worked claim step in words, for the board and the example: the compare step as its equation and comparison. */
export function claimShow(step: WorkedStep, expr: string, problem: "target" | "example" = "target"): string | null {
  if (step.kind !== "claim-compare") return null;
  // The child's own comparison is the final step's (H1, H2); the example shows it whole.
  return problem === "example" ? `${expr} = ${num(step.value)}. ${compareOf(step)}` : `${expr} = ${num(step.value)}. Now we compare it with ${num(step.shown)}.`;
}

// ---------- Reading the child's word ----------

/** The word forms each pair of words takes, as the child may say them. */
const FORMS: Record<string, Record<string, string>> = {
  "true": { true: "true" }, "false": { false: "false" },
  yes: { yes: "yes", yeah: "yes", yep: "yes", yup: "yes" }, no: { no: "no", nope: "no" },
};
/** Every claim word, of either pair, and words that judge without being one of them. */
const ANY_WORD = /\b(?:true|false|yes|yeah|yep|yup|no|nope|nah|right|wrong|correct|incorrect)\b/g;
/** One test for any of them, with no state between calls. */
const HAS_WORD = new RegExp(ANY_WORD.source);
/** Words that are no answer at all: "no idea", "I don't know". */
const NO_ANSWER = /\bno (?:idea|clue)\b|\b(?:don'?t|do not|dunno) know\b|\bdunno\b|\bnot sure\b/;
const HEDGE = /^(?:maybe|probably|perhaps|i think|i guess|i believe|is it|might be)\b/;
/** Committed lead-ins: the child says which word is their answer. */
const COMMIT = /^(?:it'?s|it is|that'?s|that is|(?:the |my )?answer is|i say|i'?d say|i circle|i circled|i'?ll circle|i will circle|i would circle|i pick|i picked|i choose|i chose|we circle|circle)\s+/;
const FILLER = /^(?:(?:um+|uh+|oh|okay|ok|so|well),?\s+)+/;
/** An explanation after the word: a reason ("because ...") or a sentence with a number ("No, 5220 is less."). */
const REASON = /^(?:because|since|cause|cuz|as)\b/;
const NEGATION = /\b(?:not|n't|isn'?t|less|smaller|fewer)\b/;

/**
 * What a turn says about the claim's word: a committed word, a bare word (its confirm comes first), unclear (ask which
 * word), or nothing (a turn about something else).
 */
export type WordRead = { word: string; committed: boolean } | { unclear: true } | null;

/**
 * Reads the circled word in a child's turn, by an allow-list over the whole turn. `choices`: the claim's two words. Only a
 * committed form ("It's true.", "I circle no.", "..., so it's false.") is an answer. A bare word ("True.", "No, 5220 is
 * less.") after any question of Maya's answers that question, never the claim (wave brief, controller rule 4): it is read
 * as not committed, and Maya says it back before it counts.
 */
export function readClaimWord(text: string, choices: readonly [string, string]): WordRead {
  const t = text.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
  if (NO_ANSWER.test(t)) return null;
  const found = t.match(ANY_WORD) ?? [];
  if (found.length === 0) return null;
  const forms = Object.assign({}, ...choices.map((w) => FORMS[w])) as Record<string, string>;
  const mapped = new Set(found.map((w) => forms[w] ?? `other:${w}`));
  const words = [...mapped].filter((w) => !w.startsWith("other:"));
  if (words.length === 0) return null;
  // Both words, a word of the other pair beside one of these, a question, a hedge or a negated word: ask which.
  if (mapped.size > 1 || t.includes("?") || /\b(?:not|isn'?t|n't)\s+(?:true|false|yes|no|right|correct)\b/.test(t)) return { unclear: true };
  const body = t.replace(FILLER, "").replace(/[.!]+$/, "").trim();
  if (HEDGE.test(body)) return { unclear: true };
  const word = words[0];
  const said = found[0] as string;
  const affirmative = word === choices[0] && (word === "true" || word === "yes");
  // The explanation after the word: none, a reason, or a sentence with a number; never another word or a negation of a "yes".
  const tailOk = (tail: string) => {
    const rest = tail.replace(/^[,.!;:]\s*/, "").trim();
    if (rest === "") return true;
    if (HAS_WORD.test(rest)) return false;
    if (affirmative && NEGATION.test(rest)) return false;
    return REASON.test(rest) || /\d/.test(rest);
  };
  const committed = COMMIT.exec(body);
  if (committed) {
    const after = body.slice(committed[0].length);
    return after.startsWith(said) && tailOk(after.slice(said.length)) ? { word, committed: true } : null;
  }
  // "..., so it's false.": a conclusion at the end, after an explanation with no claim word in it.
  const so = new RegExp(`^(.*?),?\\s+so\\s+(?:it'?s\\s+|it is\\s+|the answer is\\s+|i circle\\s+)?${said}$`).exec(body);
  if (so && !HAS_WORD.test(so[1])) return { word, committed: true };
  if (body.startsWith(said) && tailOk(body.slice(said.length))) return { word, committed: false };
  return null;
}

/** A plain yes, the whole turn: the answer to Maya's "You said no. Is no the word you circle?". */
const PLAIN_YES = /^(?:(?:um+|uh+|oh|okay|ok|well),?\s+)*(?:yes|yeah|yep|yup)(?:,?\s+(?:it is|that's it|i do))?[.!]*$/;

/** What the session needs to read a turn: its claim, the child's words, and what Maya's last turn asked. */
export interface ClaimTurn {
  pkg: OperationPackage | null;
  text: string | null;
  /** Maya's last turn asked about one number ("Did you say 5220?"): a plain yes answers that, never the claim. */
  heardAsked: boolean;
  /** The bare word Maya said back in her last turn ("You said no. Is no the word you circle?"): a plain yes commits it. */
  wordAsked: string | null;
  /** Maya's last accepted turn asked the claim itself (claimQuestionAsked). Only then is a bare word a claim turn. */
  claimAsked?: boolean;
}

/** The lines that ask the claim itself: the final step's H0 to H2 and "Which word do you circle: yes or no?". */
export function claimQuestionAsked(chosen: readonly Pick<LineOffer, "line" | "slots">[]): boolean {
  return chosen.some((o) => o.line === "confirm.claim" || (["step.invite", "step.point", "step.operation"].includes(o.line) && o.slots.step === "result"));
}

function wordIn(t: ClaimTurn): WordRead {
  const c = sessionClaim(t.pkg);
  if (!c || t.text === null) return null;
  // A plain yes to Maya's "Is no the word you circle?" commits the word the child said (as heardAsked for a number).
  if (t.wordAsked !== null && !t.heardAsked && c.choices.includes(t.wordAsked) && PLAIN_YES.test(t.text.toLowerCase().replace(/[’]/g, "'").trim())) {
    return { word: t.wordAsked, committed: true };
  }
  const read = readClaimWord(t.text, c.choices);
  // A bare or unsure word answers the claim only when Maya just asked it; after any other question it is no claim turn.
  return read && "word" in read && read.committed ? read : t.claimAsked === true ? read : null;
}

/** The child's committed word as read: the final answer, kept after any numbers of their explanation. */
function committedWord(t: ClaimTurn): string | null {
  const read = wordIn(t);
  return read && "word" in read && read.committed ? read.word : null;
}

/** The child's turn as read with their committed word: the word is the final answer. A bare word changes nothing. */
export function claimRead(t: ClaimTurn, base: AnswerRead): AnswerRead {
  const word = committedWord(t);
  if (word === null) return base;
  const w = choice(word);
  return { ...base, kept: [...base.kept, w], final: w, choice: false, outside: [...base.outside, w], sure: true };
}

/**
 * The confirm a claim turn needs before anything else: "which" for an unsure word or both words ("Which word do you
 * circle: true or false?"), "said" for a bare word ("You said true. Is true the word you circle?"), else null.
 */
export function claimConfirm(t: ClaimTurn): { kind: "which" } | { kind: "said"; word: string } | null {
  const read = wordIn(t);
  if (!read) return null;
  if ("unclear" in read) return { kind: "which" };
  return read.committed ? null : { kind: "said", word: read.word };
}

/** The word the child said in this turn, bare or committed, or null. */
export function claimSaid(t: ClaimTurn): string | null {
  const read = t.text === null || !sessionClaim(t.pkg) ? null : readClaimWord(t.text, sessionClaim(t.pkg)!.choices);
  return read && "word" in read ? read.word : null;
}

/**
 * The claim's result is checked right (its step "claim" is done): the operation's whole result shows every step of it
 * done, as an equal fraction does (#407) and as a right final answer does for a number. So the ladder goes on to the
 * claim's question, and Maya never asks again for a column of work the result already shows (J06).
 */
export const claimResultDone = (pkg: OperationPackage | null, done: readonly string[]): boolean => !!sessionClaim(pkg) && done.includes("claim");

/** The turn needs the claim's confirm (claimConfirm). */
export const claimUnclear = (t: ClaimTurn): boolean => claimConfirm(t) !== null;

/**
 * The answers of a reading in a claim call: the model's final answers are left out (code reads the word), and the word
 * the child said is the final answer, judged by code against the claim. Other packages: the answers as they are.
 */
export function claimAnswers(t: ClaimTurn, answers: readonly ChildAnswer[] | undefined, solvedRight: boolean): ChildAnswer[] | undefined {
  const c = sessionClaim(t.pkg);
  if (!c) return answers ? [...answers] : undefined;
  const own = (answers ?? []).filter((a) => !(a.step === "result" && (a.problem ?? "target") === "target"));
  const word = committedWord(t);
  // A right word the child says again once it stands carries nothing new (as withoutRepeats for a number).
  const add: ChildAnswer[] = word && !(solvedRight && word === c.word) ? [{ value: choice(word), step: "result", verdict: word === c.word ? "right" : "wrong" }] : [];
  const out = [...own, ...add];
  return out.length > 0 ? out : undefined;
}

/**
 * The acts allowed in a claim call: Maya never gives the word (no give_answer). Where giving it was the only way on (H3
 * shown and more help asked, or two wrong words), and where a child who only asks for help is at the top of the final
 * step's ladder (`stuck`: H2, the final step has no H3), the way out is the honest close (controller decision (a), #735,
 * brief lesson 10): no endless top hint, no answer. `exampleDue`: the easier example comes before that close.
 */
export function claimActs(pkg: OperationPackage | null, acts: Act[], stuck = false, exampleDue = false): Act[] {
  if (!sessionClaim(pkg)) return acts;
  const out = claimActsOf(acts, stuck);
  // The honest close comes only after the easier example (brief lessons 7 and 10): when it would close a child who only
  // asks for help, who has done no step and has not seen the example (`exampleDue`), the example comes instead.
  // On any help-only turn before that, the example is offered beside the guide (code's fallback says it first).
  const closing = out.includes("close") && !out.some((a) => TEACHING.includes(a));
  if (!exampleDue) return out;
  if (closing) return ["example_step", ...out.filter((a) => a === "confirm")];
  return out.includes("guide") && !out.includes("example_step") ? [...out, "example_step"] : out;
}

const TEACHING: readonly Act[] = ["accept_answer", "guide", "try_target", "example_step", "clarify", "ask_write"];

function claimActsOf(acts: Act[], stuck: boolean): Act[] {
  if (stuck && acts.includes("guide")) return ["close", ...acts.filter((a) => a === "confirm")];
  if (!acts.includes("give_answer")) return acts;
  const rest = acts.filter((a) => a !== "give_answer");
  const teaching = rest.some((a) => TEACHING.includes(a));
  return teaching ? rest : [...new Set<Act>([...rest.filter((a) => a !== "close"), "close"])];
}

/**
 * Maya's words say the claim's word as the answer before it may be said: "circle no", "it's true", "the answer is yes".
 * Naming both words ("Circle yes or no.") gives nothing away, the easier example circles its own word, and a confirm may
 * say back the word the child said in the turn it answers (`said`, as a confirm says back a number).
 */
export function claimReveals(pkg: OperationPackage, act: Act, texts: readonly string[], said: string | null = null): boolean {
  const c = sessionClaim(pkg);
  if (!c || act === "example_step" || (act === "confirm" && said === c.word)) return false;
  const says = new RegExp(`\\b(?:circle|answer is|it'?s|it is)\\s+${c.word}\\b(?!\\s+or\\b)`, "i");
  return texts.some((t) => says.test(t));
}

/** The claim's committed word as the gate's judge reads it in a child turn (the same allow-list), or null. */
export function claimFinal(pkg: OperationPackage | null, text: string, wordAsked: string | null, heardAsked = false): AnswerValue | null {
  const word = committedWord({ pkg, text, heardAsked, wordAsked });
  return word === null ? null : choice(word);
}

// ---------- The compare step's credit ----------

/** A number in a claim template: digits (a decimal too) or number words. */
function numberIn(text: string): number | null {
  const t = text.trim();
  return /^\d+(?:\.\d+)?$/.test(t) ? Number(t) : plainNumber(t);
}

/** The words of each operation in "<a> times <b> is <n>", and whether its numbers may come in either order. */
const OPERATION_WORDS: Partial<Record<Operation["kind"], { words: string; swap: boolean }>> = {
  add: { words: "plus|and|\\+", swap: true }, "decimal-add": { words: "plus|and|\\+", swap: true },
  multiply: { words: "times|x|×|multiplied by", swap: true }, "decimal-multiply": { words: "times|x|×|multiplied by", swap: true },
  subtract: { words: "minus|take away|−|-", swap: false }, "decimal-subtract": { words: "minus|take away|−|-", swap: false },
  divide: { words: "divided by|÷", swap: false },
};

/**
 * The child's whole turn says the claim's result, in one of these forms only (an allow-list, as stepTurnHeard for a
 * column): the value alone or "it's / it is / i got / that's N"; "<a> times <b> is N" with the operation's own numbers
 * (either order for + and ×); a plain yes to Maya's own "Did you say N?" about this result (`resultAsked`: only the confirm
 * the session asked for the claim's result, never one for another reason, #737 review P1); or a claim about the child's own
 * paper ("I wrote N", "N is on my paper"). A question, a hedge, another sentence, another speaker, a copy or any other
 * word fits none. After H3 (`shown`) only the paper claim counts: the rest copies what Maya showed.
 */
export function claimStepHeard(input: { text: string; uncertain: boolean; operation: Operation; value: number; resultAsked: AnswerValue | null; shown: boolean }): boolean {
  const body = input.uncertain ? null : wholeTurn(input.text);
  if (body === null) return false;
  const is = (n: number | null) => n !== null && equivalent({ type: "number", value: n }, { type: "number", value: input.value });
  const paper = /^(?:i wrote|i have|i've got)\s+(.+?)(?:\s+on my (?:paper|page))?$/.exec(body) ?? /^(.+?)\s+is on my (?:paper|page)$/.exec(body);
  if (paper && is(numberIn(paper[1]))) return true;
  if (input.shown) return false;
  const yes = wholeYes(body);
  if (yes) return input.resultAsked?.type === "number" && is(input.resultAsked.value) && (yes.value === null || is(yes.value));
  const bare = /^(?:it's|it is|i got|that's)\s+(.+)$/.exec(body);
  if (is(numberIn(bare ? bare[1] : body))) return true;
  const op = OPERATION_WORDS[input.operation.kind];
  const m = op ? new RegExp(`^(.+?)\\s+(?:${op.words})\\s+(.+?)\\s+(?:is|equals|makes|=)\\s+(.+)$`).exec(body) : null;
  if (!op || !m || !is(numberIn(m[3]))) return false;
  const [a, b] = [numberIn(m[1]), numberIn(m[2])];
  const [x, y] = input.operation.operands as number[];
  const same = (p: number | null, q: number) => p !== null && equivalent({ type: "number", value: p }, { type: "number", value: q });
  return (same(a, x) && same(b, y)) || (op.swap && same(a, y) && same(b, x));
}

/**
 * A turn about the claim's result that may get the confirm: exactly one number, the result, and only the step confirm's
 * short list of words beside it ("Maybe 1440.", "I got 1440, I think."). Never a speaker, a verb or "answer" ("My mom said
 * 1440.", "I copied 1440."): the #698 rule for a column's confirm.
 */
export function claimStepConfirmable(text: string, value: number): boolean {
  const numbers = text.match(/\d+(?:\.\d+)?/g) ?? [];
  return numbers.length === 1 && Number(numbers[0]) === value && confirmWordsOnly(text.replace(/\d+(?:\.\d+)?/, " "));
}
