// Spot the error in Maya's calls (Wave C, C2; design: .design/research/maya-spot-error-design.md). The page prints a
// question and a worked answer ("6 × 830 = ? Answer given: 498."); the child ticks "Is it right?" (Yes or No) and, when it
// is not, writes the right answer in the "Fix it" box. The deriver (src/lib/maya-teaching/spot-error.ts) gives the package
// the question's own operation, from the path that teaches it (place value, a missing number, one multiply).
//
// The session teaches it as a claim (claim.ts) with a fix: the operation's own steps, then the compare step "claim" (the
// result, compared with the answer given), then the word yes or no as the final answer, then: tick it, and write the fix.
// - The compare step's value is the fix, so it has H0 to H2 and no H3: showing it would give the fix away.
// - The word is read by claim.ts, with "right" and "wrong" read as yes and no (spot-words.ts). A bare word counts only
//   after Maya's own "Is the answer given right?" (lesson 5).
// - A right word before the fix is known is not an answer yet (spotAnswers): the fix would be missing.
// - A child who only asks for help at the top of a step gets the easier example, then the honest close (session.ts, the
//   place-value rule, lessons 7 and 10). Maya never gives the word or the fix (no give_answer).
// Code computes and checks every number here (D-195). Pure TypeScript: no clock, network or randomness.
import { equivalent, operationResult, operationText, type AnswerValue, type Operation, type OperationPackage, type WorkedStep } from "@/lib/question-package";
import { claimStep } from "@/lib/maya-teaching/claim";
import { readSpotItem, spotExampleShown } from "@/lib/maya-teaching/spot-item";
import { claimStepHeard, type SessionClaim } from "./claim";
import { framedLines, type FrameState } from "./missing-number";
import { plainNumber, valuesIn, wholeTurn } from "./numbers";
import { speechWords } from "./speech";
import { placeOpeningText } from "@/lib/question-package-place-value";
import type { ChildAnswer } from "./proposal";
import type { LineId, LineOffer, PackageLines, Slots } from "./lines";

type ClaimStep = Extract<WorkedStep, { kind: "claim-compare" }>;
const choice = (value: string): AnswerValue => ({ type: "choice", value });

/** The package is a spot-the-error question (its item prints a worked answer to tick and fix). */
export const isSpot = (pkg: OperationPackage | null | undefined): boolean => pkg?.item?.format === "spot-the-error";

/**
 * The package a session teaches for a spot-the-error question: the operation's steps, the compare step and the word as the
 * answer, with the same for its easier example (a spot-the-error of the same shape, its answer given made by code). Null
 * for any other package; a held reason for one code cannot read and check (fail closed: never taught as a number).
 */
export function spotSessionPackage(pkg: OperationPackage): { pkg: OperationPackage } | { held: string } | null {
  if (!isSpot(pkg)) return null;
  const held = { held: "Maya cannot teach this spot-the-error question yet" };
  const spot = readSpotItem(pkg);
  const result = operationResult(pkg.operation);
  if (!spot || result.type !== "number" || !equivalent(pkg.answer.value, result) || spot.fix !== result.value) return held;
  const holds = result.value === spot.shown;
  if (spot.right !== (holds ? "Yes" : "No")) return held;
  const exampleResult = operationResult(pkg.easierExample.operation);
  if (exampleResult.type !== "number") return held;
  // Never a number the question prints: its operands and its printed text (lesson 11).
  const printed = [...(pkg.operation.operands as unknown[]).filter((v): v is number => typeof v === "number"),
    ...valuesIn(pkg.text).flatMap((v) => (v.type === "number" ? [v.value] : []))];
  const exampleShown = spotExampleShown(exampleResult.value, { value: result.value, shown: spot.shown, printed });
  if (exampleShown === null) return held;
  const word = (h: boolean) => (h ? "yes" : "no");
  const work = (steps: WorkedStep[], value: number, shown: number): WorkedStep[] => [
    ...steps.filter((s) => s.kind !== "result"),
    claimStep({ relation: "equal", value, shown, holds: value === shown }),
    { id: "result", kind: "result", value: choice(word(value === shown)) },
  ];
  return {
    pkg: {
      ...pkg,
      answer: { value: choice(word(holds)), accepted: [], unit: null },
      steps: work(pkg.steps, result.value, spot.shown),
      wrongAnswers: [
        { value: choice(word(!holds)), cause: "claim", description: "Ticks the other word.", step: "claim" },
        ...pkg.wrongAnswers.map((w) => ({ ...w, step: null })),
      ],
      easierExample: { ...pkg.easierExample, answer: choice("no"), steps: work(pkg.easierExample.steps, exampleResult.value, exampleShown) },
    },
  };
}

/** The package as a session teaches it: a spot-the-error question's session package, else the package itself. */
export function spotView(pkg: OperationPackage): OperationPackage {
  if (!isSpot(pkg) || pkg.answer.value.type === "choice") return pkg;
  const made = spotSessionPackage(pkg);
  return made && "pkg" in made ? made.pkg : pkg;
}

/** The compare step of a session package's steps. */
const compareIn = (steps: readonly WorkedStep[]) => steps.find((s): s is ClaimStep => s.kind === "claim-compare");

/** The fix of a spot session package (the compare step's value), or null for any other package. */
export function spotFix(pkg: OperationPackage | null): number | null {
  return pkg && isSpot(pkg) ? compareIn(pkg.steps)?.value ?? null : null;
}

/**
 * What Maya calls the thing the child finds: "6 × 830", "the missing number in 5 × ? = 750", "the value of the ten
 * thousands digit of 35,449".
 */
function nameOf(op: Operation, steps: readonly WorkedStep[]): string {
  const framed = framedLines(steps);
  return framed ? `the missing number in ${framed.printed}` : operationText(op);
}
const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

// ---------- Maya's lines ----------

/**
 * The spot-the-error wordings (lines.ts takes them into TEMPLATES). Every wording is pending Savar's approval (D-202). No
 * line says the word or the fix before the child does, except the answer and the request to tick and write it. No line
 * on a step says "right", "correct" or "yes" (they would sound like the word). Each fits 25 spoken words at grade 3 with
 * the book's longest names (lessons 2 and 3).
 */
export const SPOT_TEMPLATES = {
  // Said after "Hi, I'm Maya" in the opening, so it names the question without its numbers (they are on the page): a grade
  // 3 opening fits 25 spoken words.
  "question.spot": [
    "First, {opening}. Then check the answer given.", "Let's find {opening}. Then check the answer given.",
    "Find {opening}. Then check the answer given.", "Find {opening} first. Then check the answer given.",
  ],
  "example.intro.spot": [
    "Let's try an easier one first. {ask}", "Here's a smaller one to warm up. {ask}", "Let me show you an easier one. {ask}",
    "First, a smaller one. {ask}", "I'll show you an easier one first. {ask}",
  ],
  "example.spot.compare": [
    "{Name} is {value}. The answer given was {shown}.", "We get {value} for {name}. The answer given was {shown}.",
    "So {name} is {value}. The page says {shown}.", "{Name} is {value}. The page shows {shown}.", "We found {value}. The answer given was {shown}.",
  ],
  "example.spot": [
    "So it's not right. We tick no and write {value} in the Fix it box.", "{value} is not {shown}. We tick no and write {value} to fix it.",
    "The answer given is not right. We tick no and write {value} in the Fix it box.", "It does not match. We tick no, and the fix is {value}.",
    "{shown} is not right. We tick no and write {value}.",
  ],
  "try.spot": [
    "Now yours. Find {name}. Then check the answer given, {shown}.", "Your turn: find {name}. Then we check {shown}.",
    "Now you try. What is {name}? Then we check the answer given.", "Your turn. Work out {name}. Then we look at {shown}.",
    "Now yours: what is {name}? Then we check {shown}.",
  ],
  // The compare step (lesson 2: each level says the result is checked against the answer given). No H3: it is the fix.
  "invite.spot.find": [
    "What is {name}? Then we check the answer given, {shown}.", "Now find {name}. Then we compare it with {shown}.",
    "So what is {name}? Then we look at {shown}.", "Put it together: what is {name}? Then we check {shown}.",
    "Tell me {name}. Then we check the answer given, {shown}.",
  ],
  "point.spot.find": [
    "Put your work together to get {name}. Then compare it with {shown}.", "Your steps make {name}. Then we check the answer given, {shown}.",
    "Join your work for {name}. Then we look at {shown}.", "Use your steps to find {name}. Then we check {shown}.",
    "Your work gives {name}. Then we compare it with {shown}.",
  ],
  "operation.spot.find": [
    "Work out {name} from your steps. Then check it against {shown}.", "Find {name} from what you worked out. Then compare it with {shown}.",
    "Finish {name} first. Then we check the answer given, {shown}.", "Finish your work for {name}. Then we look at {shown}.",
    "Use what you worked out to get {name}. Then we check {shown}.",
  ],
  "right.spot.find": ["That's it: {name} is {value}.", "Good work: {name} is {value}.", "You got it: {name} is {value}.", "Nice: {name} is {value}.", "Great: {name} is {value}."],
  // The word: each level ends with the two words, so a bare word after it answers it (lesson 5).
  "invite.spot": [
    "Is the answer given right? Tick yes or no.", "Now check it. Is {shown} right? Tick yes or no.", "Last part. Is the answer given right? Tick yes or no.",
    "Let's check. Is the answer given, {shown}, right? Tick yes or no.", "Now look at the answer given. Is it right? Tick yes or no.",
  ],
  "point.spot": [
    "We found {value}. The answer given is {shown}. Is it right? Tick yes or no.", "Our number is {value}. The page says {shown}. Tick yes or no.",
    "Look at {value} and {shown}. Is the answer given right? Tick yes or no.", "You found {value}. The answer given says {shown}. Tick yes or no.",
    "Compare {value} with {shown}. Is the answer given right? Tick yes or no.",
  ],
  "compare.spot": [
    "{compare} Is the answer given right? Tick yes or no.", "Look: {compare} So, tick yes or no?", "{compare} Do you tick yes or no?",
    "Here is the check: {compare} Tick yes or no?", "{compare} So is the answer given right? Tick yes or no.",
  ],
  "answer.spot": [
    "Well done! {Name} is {value}, not {shown}. You tick no.", "That's it! {Name} is {value}, not {shown}. So you tick no.",
    "Exactly! The answer given, {shown}, is not right. It's {value}. You tick no.", "You got it! {Name} is {value}. So {shown} is not right.",
    "Great work! {Name} is {value}. The answer given, {shown}, is not right.",
  ],
  "answer.spot.holds": [
    "Well done! {Name} is {value}, the same as the answer given. You tick yes.", "That's it! {Name} is {value}. The answer given is right.",
    "You got it! {value} matches the answer given. You tick yes.", "Great work! {Name} is {value}. It matches the answer given.",
    "Nice work! {value} is the answer given. You tick yes.",
  ],
  "write.spot": [
    "Tick no, and write {value} in the Fix it box.", "Now tick no on your page, and write {value} in the Fix it box.",
    "Please tick no. Write {value} in the Fix it box.", "Tick no on your page. Then write {value} in the Fix it box.",
    "On your page, tick no and write {value} in the Fix it box.",
  ],
  "write.spot.holds": [
    "Tick yes on your page. The Fix it box stays empty.", "Please tick yes. There is nothing to fix.", "Now tick yes on your page. No fix needed.",
    "Tick yes on your page. You don't need a fix.", "Please tick yes. Leave the Fix it box empty.",
  ],
  "write.spot.yours": [
    "Please tick your answer, and write your fix in the Fix it box.", "Go ahead and tick your answer. Then fix it if it needs it.",
    "Tick your answer on your page, and fix it in the box if it needs it.", "Please tick your answer. Then write your fix in the box if it needs one.",
    "Tick yes or no on your page. Fix it in the box if it needs it.",
  ],
  "confirm.spot.said": [
    "You said {heard}. Do you tick {heard}?", "So you tick {heard}?", "Just checking: do you tick {heard}?", "I heard {heard}. Is that what you tick?",
    "Did you mean {heard}? Is that the one you tick?",
  ],
  "confirm.spot": ["Do you tick yes or no?", "Is the answer given right: yes or no?", "Tell me one word: yes or no?", "Which do you tick: yes or no?", "Yes or no: which do you tick?"],
} as const satisfies Record<string, readonly string[]>;
export type SpotTemplateKey = keyof typeof SPOT_TEMPLATES;

/**
 * The framing a place-value help line carries on the compare step ("Which digit is in the hundred thousands place? Then
 * check 7."): one fixed wording after the place-value line's own, pending Savar's approval (D-202). Not a line by itself.
 */
export const SPOT_FRAME = "Then check {shown}.";

/** How lines.ts builds an offer from a template; passed in, so this module does not import lines.ts. */
export type SpotOffer = (line: LineId, key: SpotTemplateKey, vars: Record<string, string | number>, extra?: Omit<LineOffer, "line" | "texts" | "key">) => LineOffer;

/** The comparison in words: "4980 is not 498.", "8000 and 8000 are the same number." */
const compareOf = (value: number, shown: number) => (value === shown ? `${value} and ${shown} are the same number.` : `${value} is not ${shown}.`);

/** The lines of a step id, re-slotted to another step: a place-value result's help said on the compare step. */
const onStep = (offers: LineOffer[], step: string): LineOffer[] => offers.map((o) => ({ ...o, slots: { ...o.slots, step } as Slots }));

/**
 * The spot-the-error lines of a session package, over its package lines (`lines`: the place-value lines for a place-value
 * question, else the shared ones, `shared`), or the lines unchanged for any other package.
 */
export function spotLines(pkg: OperationPackage, lines: PackageLines, shared: PackageLines, makeOffer: SpotOffer): PackageLines {
  // A wording the book's numbers would take past 25 spoken words (a grade 3 turn, lesson 3) is left out. If none fits,
  // the shortest stays, and the session's turn check refuses it (the tests prove the book's longest wordings fit).
  const offer: SpotOffer = (...args) => {
    const o = makeOffer(...args);
    const fits = o.texts.map((_, i) => i).filter((i) => speechWords(o.texts[i]) <= 25);
    const keep = fits.length > 0 ? fits : [o.texts.reduce((best, t, i) => (speechWords(t) < speechWords(o.texts[best]) ? i : best), 0)];
    return { ...o, texts: keep.map((i) => o.texts[i]), wordingIds: keep.map((i) => o.wordingIds?.[i] ?? `${o.key}#${i}`) };
  };
  const compare = compareIn(pkg.steps);
  const exCompare = compareIn(pkg.easierExample.steps);
  if (!isSpot(pkg) || pkg.answer.value.type !== "choice" || !compare || !exCompare) return lines;
  const { value, shown, holds } = compare;
  const name = nameOf(pkg.operation, pkg.steps);
  const exName = nameOf(pkg.easierExample.operation, pkg.easierExample.steps);
  // The opening names the question without its numbers: "7 × 640", "the missing number", "the value of the thousands digit".
  const opening = pkg.operation.kind === "place-value" ? placeOpeningText(pkg.operation) : framedLines(pkg.steps) ? "the missing number" : operationText(pkg.operation);
  const vars = { name, Name: capital(name), opening, value, shown, compare: compareOf(value, shown) };
  const step = (id: string, level: 0 | 1 | 2): Pick<LineOffer, "slots" | "level"> => ({ slots: { step: id } as Slots, level });
  const board = pkg.operation.kind === "place-value" ? {} : { board: framedLines(pkg.steps)?.printed ?? operationText(pkg.operation) };
  // Never the fix in a line said before it stands: a place-value help line is left out where a wording would say it.
  const noFix = (offers: LineOffer[]) => offers.map((o) => {
    const keep = o.texts.map((_, i) => i).filter((i) => !valuesIn(o.texts[i]).some((v) => equivalent(v, { type: "number", value })));
    return { ...o, texts: keep.map((i) => o.texts[i]), wordingIds: keep.map((i) => o.wordingIds?.[i] ?? `${o.key}#${i}`) };
  }).filter((o) => o.texts.length > 0);
  const frame = SPOT_FRAME.replace("{shown}", String(shown));
  const compareHelp = (): LineOffer[] => {
    if (pkg.operation.kind !== "place-value") {
      return [
        offer("step.invite", "invite.spot.find", vars, step("claim", 0)),
        offer("step.point", "point.spot.find", vars, step("claim", 1)),
        offer("step.operation", "operation.spot.find", vars, step("claim", 2)),
      ];
    }
    // A place-value result's own help (place-value-lines.ts), each line with the framing after it; the chart line as it is.
    // A wording the framing would take past 25 spoken words (a grade 3 turn) is left out.
    return noFix(onStep(lines.help("result"), "claim")).map((o) => {
      if (o.line === "chart.open") return o;
      const keep = o.texts.map((_, i) => i).filter((i) => speechWords(`${o.texts[i]} ${frame}`) <= 25);
      return { ...o, texts: keep.map((i) => `${o.texts[i]} ${frame}`), wordingIds: keep.map((i) => o.wordingIds?.[i] ?? `${o.key}#${i}`) };
    }).filter((o) => o.texts.length > 0);
  };
  const resultHelp = (): LineOffer[] => [
    offer("step.invite", "invite.spot", vars, step("result", 0)),
    offer("step.point", "point.spot", vars, step("result", 1)),
    offer("step.operation", "compare.spot", vars, step("result", 2)),
  ];
  const ask = `${capital(exName)}: the answer given is ${exCompare.shown}. Is it right?`;
  return {
    ...lines,
    question: () => [offer("question.problem", "question.spot", vars, { slots: {}, ...board })],
    exampleIntro: () => [offer("example.intro", "example.intro.spot", { ask }, { slots: {} })],
    exampleStep: (id: string) => {
      if (id === "claim") return [offer("example.step", "example.spot.compare", { name: exName, Name: capital(exName), value: exCompare.value, shown: exCompare.shown }, { slots: { step: id } })];
      if (id === "result") return [offer("example.step", "example.spot", { value: exCompare.value, shown: exCompare.shown }, { slots: { step: id } })];
      return lines.exampleStep(id);
    },
    tryTarget: () => [offer("try.target", "try.spot", vars, { slots: {}, ...board })],
    help: (id: string, framing?: FrameState, compact?: boolean) =>
      id === "claim" ? compareHelp() : id === "result" ? resultHelp() : lines.help(id, framing, compact),
    rightStep: (id: string) => (id === "claim"
      ? [offer("check.right_step", "right.spot.find", vars, { slots: { step: id }, requires: { answer: "right", step: id } })]
      : lines.rightStep(id)),
    notYet: (id: string) => (id === "claim" ? shared.notYet(id) : lines.notYet(id)),
    answerRight: () => [offer("answer.right", holds ? "answer.spot.holds" : "answer.spot", vars, { slots: {} })],
    answerGive: () => [],
    answerParts: () => [],
    writeAnswer: () => [offer("write.answer", holds ? "write.spot.holds" : "write.spot", vars)],
    writeYours: () => [offer("write.yours", "write.spot.yours", {})],
    which: () => [offer("confirm.claim", "confirm.spot", {})],
    said: (word: string) => {
      const heard = word.toLowerCase();
      return heard === "yes" || heard === "no" ? [offer("confirm.word", "confirm.spot.said", { heard }, { slots: { heard } })] : [];
    },
    honestClose: () => shared.honestClose(),
    closeUnsolved: () => shared.honestClose(),
    stepIds: [...lines.stepIds.filter((id) => id !== "claim"), "claim"],
  };
}

// ---------- The child's turns ----------

/** A number in a child's words: digits (with or without commas) or number words. */
function numberIn(text: string): number | null {
  const t = text.trim().replace(/(\d),(?=\d{3}\b)/g, "$1");
  return /^\d+$/.test(t) ? Number(t) : plainNumber(t);
}

/** The judgement around a result, which the step credit leaves out: "No, ...", "It's wrong, because ...", "..., so it's wrong.". */
const JUDGE = "(?:not right|wrong|right|correct|incorrect|yes|no)";
const LEAD = new RegExp(`^(?:(?:yes|no|nope|yeah)|(?:it's|it is|that's|that is)\\s+${JUDGE})[,.!]?\\s+(?:because\\s+)?`);
const TAIL = new RegExp(`,?\\s+so\\s+(?:it's\\s+|it is\\s+|that's\\s+)?${JUDGE}$`);
const NOT_SHOWN = /,?\s+not\s+(\S+)$/;
/** The child names the fix in their own words: "it should be 4980", "the right answer is 4980", "the value is 30000". */
const FIX_FORMS = /^(?:it should be|it should say|should be|it's supposed to be|the right answer is|the correct answer is|the real answer is|the answer is|the fix is|the missing number is|the value is|the digit is)\s+(.+)$/;

/**
 * The child's whole turn says a spot-the-error result (its compare step), in one of these forms beside claim.ts's own: the
 * result with the judgement before or after it ("No, 6 times 830 is 4980.", "6 times 830 is 4980, so it's wrong."); the
 * fix named ("It should be 4980, not 498."); a place value's digit times its place ("3 times 10000 is 30000"). An allow-list over the whole turn: a hedge, a question, another speaker or a
 * copy fits none. After H3 nothing counts (the compare step has none, so this never meets one).
 */
export function spotStepHeard(input: { pkg: OperationPackage; text: string; uncertain: boolean; value: number; resultAsked: AnswerValue | null; shown: boolean }): boolean {
  const { pkg, value } = input;
  if (!isSpot(pkg) || input.uncertain || input.shown) return false;
  const body = wholeTurn(input.text);
  if (body === null) return false;
  const core = body.replace(LEAD, "").replace(TAIL, "").trim();
  const step = compareIn(pkg.steps);
  const notShown = NOT_SHOWN.exec(core);
  if (notShown && step && numberIn(notShown[1]) !== step.shown) return false;
  const said = notShown ? core.slice(0, notShown.index).trim() : core;
  if (said !== body && claimStepHeard({ text: said, uncertain: false, operation: pkg.operation, value, resultAsked: null, shown: false })) return true;
  const fix = FIX_FORMS.exec(said);
  if (fix) return numberIn(fix[1]) === value;
  const times = /^(.+?)\s+(?:times|x|×)\s+(.+?)\s+(?:is|equals|makes|=)\s+(.+)$/.exec(said);
  if (!times) return false;
  const [a, b, c] = [numberIn(times[1]), numberIn(times[2]), numberIn(times[3])];
  const pair = (x: number, y: number) => (a === x && b === y) || (a === y && b === x);
  const digit = pkg.steps.find((s) => s.kind === "read-digit");
  if (digit?.kind === "read-digit") return c === value && pair(digit.digit, digit.worth);
  return false;
}

/**
 * The answers of a spot-the-error reading: a right word before the fix is known (the compare step not done and not
 * credited in this turn) is not an answer yet. The fix would be missing, and the answer line would say it. A wrong word
 * stays wrong. Other packages: the answers as they are.
 */
export function spotAnswers(pkg: OperationPackage | null, answers: ChildAnswer[] | undefined, done: readonly string[]): ChildAnswer[] | undefined {
  if (!pkg || !isSpot(pkg) || !answers) return answers;
  const fixKnown = done.includes("claim") || answers.some((a) => a.step === "claim" && a.verdict === "right" && (a.problem ?? "target") === "target");
  if (fixKnown) return answers;
  const out = answers.filter((a) => !(a.step === "result" && a.verdict === "right" && (a.problem ?? "target") === "target" && a.value.type === "choice"));
  return out.length > 0 ? out : undefined;
}

/**
 * Maya's words give a spot-the-error answer away before it may be said: the word to tick ("tick no"), or the fix before the
 * child found it (`fixDone`: the compare step is done). The easier example works its own; a confirm may say back what the
 * child said in the turn it answers (`saidWord`, `saidValues`).
 */
export function spotReveals(pkg: OperationPackage, act: string, texts: readonly string[], c: SessionClaim | null, fixDone: boolean, said: { word: string | null; values: readonly AnswerValue[] }): boolean {
  if (!isSpot(pkg) || !c || act === "example_step") return false;
  const tick = new RegExp(`\\btick\\s+${c.word}\\b(?!\\s+or\\b)`, "i");
  if (!(act === "confirm" && said.word === c.word) && texts.some((t) => tick.test(t))) return true;
  const fix = spotFix(pkg);
  // A shown answer that is right is the fix, printed on the page: saying it gives nothing away.
  if (fix === null || fixDone || fix === c.shown) return false;
  const own = (pkg.operation.operands as unknown[]).some((v) => v === fix);
  const fixValue: AnswerValue = { type: "number", value: fix };
  if (own || (act === "confirm" && said.values.some((v) => equivalent(v, fixValue)))) return false;
  return texts.some((t) => valuesIn(t).some((v) => equivalent(v, fixValue)));
}

/**
 * The dropped or added zero of a spot-the-error answer, as the child may say it: "498 times 10 is 4980". Only for a
 * shown answer that is the result over or times a power of 10.
 */
export function spotScope(step: WorkedStep): [number, number][] {
  if (step.kind !== "claim-compare" || step.value === step.shown || step.shown <= 0) return [];
  const [hi, lo] = step.value > step.shown ? [step.value, step.shown] : [step.shown, step.value];
  for (let k = 1; k <= 6; k++) if (lo * 10 ** k === hi) return [[lo, 10 ** k]];
  return [];
}
