// Maya's lines and board offers for place-value questions (B1a, design: .design/research/maya-place-value-design.md,
// section 4.3, with the parent lane's changes of 2026-11-07). Every line is filled from the checked package
// (src/lib/maya-teaching/place-value.ts), never from the model. The rules the wording keeps:
// - A digit question never gives its digit away: H1 names the places from the right with no stripe on the board, H2
//   stripes the asked column on a chart whose digit row is blank, and the child says the digit. It has no H3.
// - A value question may stripe the column at H1 (the digit is a step, the value comes after it); its last step has no H3.
// - A zero answer is said only after the child says it: the zero lines are answer lines, offered once the answer stands.
// - No wording holds the word "one" as a number, or a digit next to its place's value, where that could be the answer.
// - After two misses on the last step there is no given answer: the easier example, then an honest close (session.ts).
// Each line has 5 wordings in the plain style of lines.ts (D-202), pending Savar's approval. Pure TypeScript.
import { equivalent, operationText, valueText, type OperationPackage, type Place, type WorkedStep } from "@/lib/question-package";
import { placeIndex, withCommas, WHOLE_PLACES } from "@/lib/question-package-place-value";
import type { Command, Place as BoardPlace } from "@/lib/board";
import type { LineId, LineOffer, PackageLines, Slots } from "./lines";
import { valuesIn } from "./numbers";
import { PARTS_BAND_KEYS, PARTS_CHART_KEYS, PARTS_CIRCLE_KEYS, PARTS_WHY_KEYS, PLACE_PARTS_TEMPLATES } from "./place-value-parts-templates";
import { placePartsBoardOffers, placePartsLines } from "./place-value-parts-lines";
import { isPartsOperation, type PartsOperation } from "@/lib/question-package-place-parts";

export const PLACE_VALUE_TEMPLATES = {
  // The chart is drawn (said with question.problem's lines). The digit question's chart has no digits on it.
  "chart.open": [
    "I drew a place-value chart for {number}.", "Here is a chart of the places in {number}.", "Let's put {number} in a place-value chart.",
    "Let's think about the places in {number}.", "Every digit of {number} has its own place.",
  ],
  "chart.open.blank": [
    "I drew the places of {number} on a chart.", "Here are the places of {number}. The digits are on your page.",
    "This chart shows the places of {number}.", "Let's think about the places in {number}.", "Every digit of {number} has its own place.",
  ],
  // H0: the digit in a place.
  // H0, with the framing every first line of the step carries: where the place is, counted from the right.
  "invite.place": [
    "Which digit is in the {place} place? It is the {ordinal} place from the right.",
    "Count the places from the right. Which digit of {number} is in the {place} place?",
    "The {place} place is the {ordinal} from the right. Tell me the digit there.",
    "Start at the ones and count left to the {place} place. Which digit is there?",
    "Look at {number}. Which digit is in the {place} place, the {ordinal} from the right?",
  ],
  // H1: name the places from the right. No board: the stripe would point at the answer.
  "point.place": [
    "Count the places from the right: {count}.", "Start at the ones and count to the left: {count}.",
    "The {place} place is the {ordinal} place from the right: {count}.", "Let's name the places from the right: {count}.",
    "Places go from right to left: {count}.",
  ],
  // H1 for a value question's digit step: the column is striped (the value is the next step).
  "point.place.band": [
    "I colored the {place} place. Count from the right: {count}.", "The colored column is the {place} place: {count}.",
    "Count the places from the right: {count}.", "Start at the ones and count to the left: {count}.",
    "The {place} place is the {ordinal} place from the right.",
  ],
  // H2 for a digit question: the asked column is striped on a chart with no digits; the child reads their own page.
  "operation.place": [
    "I colored the {place} place, the {ordinal} from the right. Which digit of {number} goes there?",
    "The colored column is the {place} place, the {ordinal} from the right. Which digit of {number} is there?",
    "Look at the colored column, the {ordinal} from the right. What digit is there in {number}?",
    "In {number}, the {place} place is the {ordinal} digit from the right. Which digit is it?",
    "Count to the {ordinal} digit from the right in {number}. Which digit is it?",
  ],
  // H2 for a value question's digit step: the digit is circled.
  "operation.place.circle": [
    "I circled the digit in the {place} place, the {ordinal} from the right. What is it?",
    "Look at the circled digit, the {ordinal} from the right. Which digit is it?",
    "The circled digit is in the {place} place, the {ordinal} from the right. Which digit is it?",
    "Count to the {ordinal} place from the right. Say just the digit there.",
    "Which single digit sits in the {place} place, the {ordinal} from the right?",
  ],
  // H3 for a value question's digit step only (never a last step).
  "show.digit": ["{show}", "Here it is. {show}", "Let me show you. {show}", "Like this. {show}", "I'll do this part. {show}"],
  // The answer to a question about a place ("Which one is the thousands?"), J06: said before going on.
  "where.place": [
    "Good question. The {place} place is the {ordinal} place from the right.", "Start at the ones on the right. The {place} place is the {ordinal} place.",
    "The places go {count}. The {place} place is the {ordinal} from the right.", "Count from the right: {count}. That last place is the {place} place.",
    "Each place sits to the left of the place before it. The {place} place is the {ordinal} from the right.",
  ],
  "right.digit": [
    "Yes! The {place} digit is {digit}.", "That's right: {digit} is in the {place} place.", "You got it, the {place} digit is {digit}.",
    "Yes, {digit} is the {place} digit.", "Exactly! {digit} is in the {place} place.",
  ],
  "right.digit.zero": [
    "Yes! The {place} digit is 0. A zero holds the place.", "That's right. There are 0 {place}. The zero keeps the place.",
    "Yes, it's 0. A zero means there are no {place}.", "Good. The {place} place has 0, and the zero holds the place.",
    "You got it. 0 {place}. The zero holds the place.",
  ],
  "notyet.place": [
    "Not quite. Let's look at the {place} place again.", "Not yet. Let's check the {place} place together.", "Hmm, not yet. Let's try the {place} place again.",
    "That's not it yet. Let's look at the {place} place once more.", "Not yet. Let's go back to the {place} place.",
  ],
  // The child gave the digit's value for a digit question.
  "fix.digit": [
    "That is the value. The question asks for the digit. Which digit is in the {place} place?",
    "Careful, that is a value. We only need the digit in the {place} place.", "That is bigger than a digit. Which single digit is in the {place} place?",
    "We want just the digit, not its value. What digit is in the {place} place?", "Say only the digit, not its value. Which digit is in the {place} place?",
  ],
  // The child gave the bare digit for a value question, after the digit step.
  "fix.value": [
    "That is the digit. Now we want its value. What is {digit} {place} worth?", "That is the digit. Next, its value in the {place} place. What is it?",
    "The digit is {digit}. The question asks for the value of that digit. What is it?", "That is the digit. Its value depends on its place. What is the value of that {digit}?",
    "Now say the value, not just the digit. What is the value of the {digit} in the {place} place?",
  ],
  // H0 of a value question's last step.
  // H0 of a value question's last step, a digit from 2 to 9, with its framing: what each of the place is worth.
  "invite.value": [
    "So the digit is {digit}. Each {unit} is {perOne}. What is its value?", "Now the value. Each {unit} is worth {perOne}. What is that {digit} worth?",
    "That {digit} is in the {place} place, and each {unit} is {perOne}. What is its value?",
    "Each {unit} is {perOne}. What is the value of the {digit} in the {place} place?",
    "The digit is {digit}. Each {unit} is worth {perOne}. How much is it worth?",
  ],
  // The same with a 1: the place's worth is the answer, so the framing is that the value comes from the place.
  "invite.value.one": [
    "So the digit is 1. Its value is what the {place} place is worth. What is it?",
    "A 1 in the {place} place is worth what that place is worth. What is its value?",
    "That 1 is in the {place} place. Its value depends on the place. What is it?",
    "The value of a digit depends on its place. What is the 1 in the {place} place worth?",
    "The digit is 1, in the {place} place. How much is the {place} place worth?",
  ],
  // The same with a zero digit: the 0 is never said before the child says the value.
  "invite.value.zero": [
    "A digit's value depends on its place. What is that digit worth in the {place} place?",
    "The place tells what a digit is worth. What is the value of that digit in the {place} place?",
    "Think about how many {place} that digit shows. What is its value?",
    "A digit's value comes from its place. How much is that digit worth in the {place} place?",
    "That digit says how many {place} there are. So what is its value?",
  ],
  // The answer to "Why do I multiply?" on a value question's last step (J06): never the value itself.
  "why.value": [
    "Each {unit} is worth {perOne}. So {digit} {place} is {digit} × {perOne}.", "The {place} place counts in {perOne}s. The {digit} tells how many of them.",
    "A digit's value is the digit times its place. Here that is {digit} × {perOne}.", "The place tells what each is worth: {perOne}. The {digit} says how many.",
    "We multiply because there are {digit} {place}, and each is {perOne}.",
  ],
  "why.value.one": [
    "A 1 in a place is worth just that place.", "The digit says how many of the place there are. Here there is just 1.",
    "Each place has its own value. The 1 takes the value of its place.", "The value of a digit depends on its place. A 1 is worth exactly its place.",
    "The digit tells how many. With a 1, you count that place just once.",
  ],
  "why.value.zero": [
    "That digit says there are none of the {place}.", "The digit tells how many {place} there are.",
    "A digit's value is the digit times its place.", "Each place has a value. The digit says how many of it there are.",
    "The digit holds the place even when there are none of it.",
  ],
  // H1 of a value question's last step, a digit from 2 to 9.
  "point.times": [
    "Each {unit} is worth {perOne}. We have {digit} {place}.", "The {place} place counts in {perOne}s. There are {digit} of them.",
    "Think of {digit} {place}. Each is worth {perOne}.", "We have {digit} {place}, and each is {perOne}.",
    "The {digit} in the {place} place means {digit} {place}. Each is {perOne}.",
  ],
  // With a 1, the place's value is the answer: the line never says it.
  "point.times.one": [
    "The digit is 1. So its value is what the {place} place is worth.", "A 1 in the {place} place is worth just what that place is worth.",
    "With a 1 there, the value is the {place} place's own value.", "Think about what the {place} place is worth. The 1 is worth that much.",
    "There is a 1 in the {place} place. How much is that place worth?",
  ],
  "point.times.zero": [
    "That digit means there are no {place}.", "How many {place} does that digit show?",
    "That digit says how many {place} there are.", "Think about how many {place} there are.", "That digit holds the place. How much is it worth?",
  ],
  // H2 of a value question's last step: the multiplication, as a note.
  "operation.times": [
    "What is {digit} × {perOne}?", "Multiply {digit} × {perOne}. What do you get?", "Let's multiply {digit} × {perOne}.",
    "What do you get for {digit} × {perOne}?", "Can you work out {digit} × {perOne}?",
  ],
  "operation.times.one": [
    "How do you write the {place} place as a number?", "What number does the {place} place stand for?",
    "Write the {place} place as a number. What is it?", "Say the {place} place as a number.", "What number is the {place} place worth?",
  ],
  "operation.times.zero": [
    "How much are no {place} worth?", "What is that digit worth in the {place} place?", "So what is the value of that digit?",
    "What value does that digit have?", "If there are no {place}, how much are they worth?",
  ],
  // The easier example, worked by Maya.
  "example.digit": [
    "Look at {number}. Count from the right: {count}. The {place} digit is {digit}.", "In {number}, count {count}. The digit in the {place} place is {digit}.",
    "Here is how. {number}: {count}. So the {place} digit is {digit}.", "Count the places of {number}: {count}. {digit} is in the {place} place.",
    "In {number}, the {place} place is the {ordinal} from the right. Its digit is {digit}.",
  ],
  "example.value": [
    "So {digit} {place} is {answer}: {digit} × {perOne} = {answer}.", "Each {unit} is {perOne}, so {digit} × {perOne} = {answer}.",
    "The value of that {digit} is {answer}, because {digit} × {perOne} = {answer}.", "{digit} {place} makes {answer}: {digit} × {perOne} = {answer}.",
    "So its value is {answer}. {digit} × {perOne} = {answer}.",
  ],
  // The answer the child said and kept.
  "answer.digit": [
    "Yes! The digit in the {place} place of {number} is {answer}.", "That's right. {answer} is in the {place} place.",
    "You got it! The {place} digit is {answer}.", "Yes, {answer}. That's the digit in the {place} place.", "Exactly! {number} has {answer} in the {place} place.",
  ],
  "answer.digit.zero": [
    "Yes! The {place} digit of {number} is 0. A zero holds the place.", "That's right. There are 0 {place} in {number}.",
    "You got it! The {place} digit is 0. The zero keeps the place.", "Yes, 0. A zero means there are no {place}.",
    "Exactly! {number} has 0 in the {place} place.",
  ],
  "answer.value": [
    "Yes! {digit} {place} is {answer}.", "That's right. The value of that {digit} is {answer}.", "You got it! {digit} × {perOne} = {answer}.",
    "Yes, {answer}. {digit} {place} is worth {answer}.", "Exactly! The {digit} in the {place} place has a value of {answer}.",
  ],
  "answer.value.zero": [
    "Yes! A zero in the {place} place is worth 0.", "That's right. 0 {place} is worth 0.", "You got it! The value is 0. A zero holds the place.",
    "Yes, 0. There are no {place}, so the value is 0.", "Exactly! That zero has a value of 0.",
  ],
  // The honest close (brief lesson 10, controller decision (a), 2026-11-08): after the easier example, a child who still
  // only asks for help (or misses again) hears that the question is hard and that it is fine to stop, and one next step:
  // the easier example on paper ({example}, already worked by Maya) or a grown-up. Never a hint at the answer. Pending
  // Savar's approval (D-202).
  "close.later": [
    "This question is hard, and it is fine to stop now. You can try {example} on paper.",
    "This question is a hard puzzle. It's okay to stop here. Ask a grown-up to try it with you.",
    "That was a hard question, and stopping is fine. Try {example} on paper later.",
    "This question is tricky, and it's fine to stop. A grown-up can help you try it again.",
    "It's okay to stop. This question is hard. You can practise {example} on paper.",
  ],
  // B1b: compare, sum and tenths build (place-value-parts-templates.ts).
  ...PLACE_PARTS_TEMPLATES,
} as const satisfies Record<string, readonly string[]>;
export type PlaceValueTemplateKey = keyof typeof PLACE_VALUE_TEMPLATES;

type Vars = Record<string, string | number>;
const fill = (template: string, vars: Vars) => template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name]));
const sentence = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);
const offer = (line: LineId, key: PlaceValueTemplateKey, vars: Vars, extra: Omit<LineOffer, "line" | "texts" | "key"> = { slots: {} }): LineOffer => ({
  line, ...extra, key, texts: PLACE_VALUE_TEMPLATES[key].map((t) => sentence(fill(t, vars))),
});

const UNIT: Record<string, string> = {
  ones: "one", tens: "ten", hundreds: "hundred", thousands: "thousand", "ten thousands": "ten thousand", "hundred thousands": "hundred thousand", millions: "million",
};
const ORDINAL = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"];
/** The places from the ones up to this one: "ones, tens, hundreds, thousands". */
const countTo = (k: number) => WHOLE_PLACES.slice(0, k + 1).join(", ");

type PlaceOperation = Extract<OperationPackage["operation"], { kind: "place-value" }>;
/** The question is a place-value question (a package the adapter made). */
export const isPlaceValue = (pkg: OperationPackage | null): pkg is OperationPackage & { operation: PlaceOperation } => pkg?.operation.kind === "place-value";

/** What a place-value operation's lines are filled from. */
function factsOf(op: PlaceOperation) {
  const n = op.operands[0];
  const k = placeIndex(op.place);
  const digit = Math.floor(n / 10 ** k) % 10;
  const perOne = 10 ** k;
  const answer = op.ask === "value" ? digit * perOne : digit;
  return {
    k, digit, answer,
    vars: { number: withCommas(n), place: op.place, unit: UNIT[op.place], perOne: withCommas(perOne), digit, count: countTo(k), ordinal: ORDINAL[k], answer: withCommas(answer) },
  };
}

/** Which board mark a place-value line asks for this turn: the stripe on the asked column, or a circle on its digit. */
export const BAND_KEYS: readonly string[] = ["operation.place", "point.place.band", ...PARTS_BAND_KEYS];
export const CIRCLE_KEYS: readonly string[] = ["operation.place.circle", "show.digit", ...PARTS_CIRCLE_KEYS];

/**
 * The lines of a place-value package, with the shape of packageLines (lines.ts). The lines with no place-value meaning
 * (the hello, the confirmations, the redirects, the write and repair lines) come from the shared set.
 */
export function placeValueLines(pkg: OperationPackage & { operation: PlaceOperation }, base: PackageLines): PackageLines {
  const op = pkg.operation;
  const f = factsOf(op);
  const value = op.ask === "value";
  const digitStep = pkg.steps.find((s) => s.kind === "read-digit");
  const ex = pkg.easierExample.operation as PlaceOperation;
  const e = factsOf(ex);
  // A shared wording that says the answer as a word ("This one is ...", "an easier one" when the answer is 1) is left out
  // of every line said before the answer stands; its wording id stays (variety.ts). An answer line keeps every wording.
  const answer = pkg.answer.value;
  const safe = (offers: LineOffer[]): LineOffer[] => offers.map((o) => {
    const keep = o.texts.map((_, i) => i).filter((i) => !valuesIn(o.texts[i]).some((v) => equivalent(v, answer)));
    return { ...o, texts: keep.map((i) => o.texts[i]), wordingIds: keep.map((i) => o.wordingIds?.[i] ?? `${o.key}#${i}`) };
  }).filter((o) => o.texts.length > 0);
  // The digit question's chart has no digits; the value question's shows them.
  const open = offer("chart.open", value ? "chart.open" : "chart.open.blank", f.vars);
  const resultHelp = (): LineOffer[] => {
    const slots: Slots = { step: "result" };
    if (!value) {
      return [
        offer("step.invite", "invite.place", f.vars, { slots, level: 0 }),
        offer("step.point", "point.place", f.vars, { slots, level: 1 }),
        offer("step.why", "where.place", f.vars, { slots, level: 1 }),
        offer("step.operation", "operation.place", f.vars, { slots, level: 2 }),
        // The chart, said as it is drawn (code draws it with this line: placeAutoDraw), last so no help set starts with it.
        { ...open, slots, level: 0 },
      ];
    }
    const kind = f.digit === 0 ? "zero" : f.digit === 1 ? "one" : "many";
    return [
      offer("step.invite", kind === "zero" ? "invite.value.zero" : kind === "one" ? "invite.value.one" : "invite.value", f.vars, { slots, level: 0 }),
      offer("step.point", kind === "zero" ? "point.times.zero" : kind === "one" ? "point.times.one" : "point.times", f.vars, { slots, level: 1 }),
      offer("step.why", kind === "zero" ? "why.value.zero" : kind === "one" ? "why.value.one" : "why.value", f.vars, { slots, level: 1 }),
      offer("step.operation", kind === "zero" ? "operation.times.zero" : kind === "one" ? "operation.times.one" : "operation.times", f.vars,
        { slots, level: 2, ...(kind === "many" ? { board: `${f.digit} × ${f.vars.perOne}` } : {}) }),
    ];
  };
  const digitHelp = (step: WorkedStep): LineOffer[] => {
    const slots: Slots = { step: step.id };
    // A zero digit is also the value's answer (review of #738): its step is taught as a digit question is, on a chart
    // with no digits, with no stripe at H1 and the stripe, never a circle, at H2.
    const zero = f.digit === 0;
    return [
      offer("step.invite", "invite.place", f.vars, { slots, level: 0 }),
      offer("step.point", zero ? "point.place" : "point.place.band", f.vars, { slots, level: 1 }),
      offer("step.why", "where.place", f.vars, { slots, level: 1 }),
      offer("step.operation", zero ? "operation.place" : "operation.place.circle", f.vars, { slots, level: 2 }),
      { ...(zero ? offer("chart.open", "chart.open.blank", f.vars) : open), slots, level: 0 },
      // A zero digit is also the value's answer: its step has no H3, as a last step has none.
      ...(f.digit === 0 ? [] : [offer("step.show", "show.digit", { show: `The digit in the ${op.place} place is ${f.digit}.` }, { slots, level: 3 })]),
    ];
  };
  const lines: PackageLines = {
    ...base,
    question: () => safe(base.question()),
    assess: () => safe(base.assess()),
    exampleIntro: () => safe(base.exampleIntro()),
    tryTarget: () => safe(base.tryTarget()),
    redirect: () => safe(base.redirect()),
    thinking: () => safe(base.thinking()),
    together: () => safe(base.together()),
    guess: () => safe(base.guess()),
    repair: () => safe(base.repair()),
    answerOnly: () => safe(base.answerOnly()),
    otherInput: () => safe(base.otherInput()),
    writeYours: () => safe(base.writeYours()),
    exampleStep: (id: string): LineOffer[] => {
      const step = pkg.easierExample.steps.find((s) => s.id === id);
      if (!step) return [];
      const slots = { step: id };
      if (step.kind === "read-digit" || (step.kind === "result" && ex.ask === "digit")) return [offer("example.step", "example.digit", e.vars, { slots })];
      return [offer("example.step", "example.value", e.vars, { slots, board: `${e.digit} × ${e.vars.perOne} = ${e.vars.answer}` })];
    },
    help: (id: string): LineOffer[] => (id === "result" ? resultHelp() : digitStep && id === digitStep.id ? digitHelp(digitStep) : []),
    regroupOut: () => [],
    rightStep: (id: string): LineOffer[] => (digitStep && id === digitStep.id
      ? [offer("check.right_step", f.digit === 0 ? "right.digit.zero" : "right.digit", f.vars, { slots: { step: id }, requires: { answer: "right", step: id } })]
      : []),
    notYet: (id: string): LineOffer[] => {
      if (digitStep && id === digitStep.id) return [offer("check.not_yet", "notyet.place", f.vars, { slots: { step: id }, requires: { answer: "wrong", step: id } })];
      if (id !== "result") return [];
      // A value for a digit question, or the bare digit for a value question: the targeted line, for that answer only.
      const said = value ? f.digit : f.digit * 10 ** f.k;
      const targeted = said !== f.answer
        ? [offer("check.not_yet", value ? "fix.value" : "fix.digit", f.vars, { slots: { step: "result", heard: valueText({ type: "number", value: said }) }, requires: { answer: "wrong", step: "result", heard: valueText({ type: "number", value: said }) } })]
        : [];
      return [...safe(base.notYet("result")), ...targeted];
    },
    explain: () => (digitStep ? safe(base.explain()) : []),
    answerRight: (): LineOffer[] => {
      const key = value ? (f.digit === 0 ? "answer.value.zero" : "answer.value") : f.digit === 0 ? "answer.digit.zero" : "answer.digit";
      return [offer("answer.right", key, f.vars, { slots: {}, ...(value ? { board: `${f.digit} × ${f.vars.perOne} = ${f.vars.answer}` } : {}) })];
    },
    // No given answer for place value (parent lane, 2026-11-07): the easier example, then an honest close.
    answerGive: () => [],
    answerParts: () => [],
    closeUnsolved: () => safe([offer("close.together", "close.later", { example: operationText(ex) })]),
    stepIds: digitStep ? [digitStep.id] : [],
  };
  // B1b's asks (compare, sum, build) change the lines whose meaning differs (place-value-parts-lines.ts).
  return isPartsOperation(op) ? placePartsLines(pkg as OperationPackage & { operation: PartsOperation }, lines, base, offer) : lines;
}

/** The lines whose words say Maya drew something: the chart, the stripe or the circle. */
const CHART_KEYS: readonly string[] = ["chart.open", "chart.open.blank", ...PARTS_CHART_KEYS];
export const WHY_KEYS: readonly string[] = ["where.place", "why.value", "why.value.one", "why.value.zero", ...PARTS_WHY_KEYS];

/**
 * The board offers code draws itself in a turn whose line says Maya drew something (framing at any hint level): the
 * chart when it is not on the board yet, then the stripe or the circle the line names, each unless the proposal draws it
 * already. Wordings that name the chart are left out of a call with no board (spokenOffer), so this never runs there.
 */
export function placeAutoDraw(chosen: readonly LineOffer[], hasChart: boolean, requested: readonly string[]): string[] {
  const keys = chosen.map((o) => o.key as string);
  const band = keys.some((k) => BAND_KEYS.includes(k));
  const circle = keys.some((k) => CIRCLE_KEYS.includes(k));
  const chart = band || circle || keys.some((k) => CHART_KEYS.includes(k));
  const ids = [...(chart && !hasChart ? ["question.chart"] : []), ...(band ? ["question.band"] : []), ...(circle ? ["question.circle"] : [])];
  return ids.filter((id) => !requested.includes(id));
}

/** One board offer, as session.ts takes it: an id the model names, what it shows, and code's commands. */
export interface PlaceBoardOffer {
  id: string;
  shows: string;
  commands: (place: BoardPlace) => Command[];
}

const chartPlace = (p: Place) => p.replace(" ", "_");

/**
 * The board offers of a place-value question for an act (design 3.5): the chart (blank digits for a digit question),
 * the stripe or the circle in the turn a line that asks for it is said, and the checked answer's digit, value, sentence
 * and answer row in the turn the answer line is said. The easier example's chart, stripe and sentence in its own turns.
 */
export function placeBoardOffers(input: {
  pkg: OperationPackage & { operation: PlaceOperation };
  act: string;
  roles: Readonly<Record<string, string>>;
  batch: number;
  chosen: readonly LineOffer[];
  exampleShown: number;
}): PlaceBoardOffer[] {
  const { pkg, act, roles, chosen } = input;
  // B1b's asks have their own chart and marks (place-value-parts-lines.ts).
  if (isPartsOperation(pkg.operation)) return placePartsBoardOffers({ ...input, pkg: pkg as OperationPackage & { operation: PartsOperation } });
  const out: PlaceBoardOffer[] = [];
  const has = (id: string) => Object.hasOwn(roles, id);
  const said = (keys: readonly string[]) => chosen.some((o) => keys.includes(o.key));
  const mark = (objectId: string, target: Record<string, unknown>, style: "highlight" | "circle", i: number): Command =>
    ({ op: "mark", id: `pv-${input.batch + 1}-${i}`, target: { objectId, ...target }, style } as unknown as Command);
  if (act === "example_step") {
    const ex = pkg.easierExample.operation as PlaceOperation;
    const e = factsOf(ex);
    if (!has("example") && String(ex.operands[0]).length <= 6) out.push({ id: "example.chart", shows: `a place-value chart of the easier example's number, ${e.vars.number}`, commands: (place) => [{ op: "place_chart", id: "example", number: String(ex.operands[0]), place } as unknown as Command] });
    if (chosen.some((o) => o.line === "example.step")) {
      out.push({ id: "example.band", shows: `color the ${ex.place} place of the easier example`, commands: () => [mark("example", { part: "piece", piece: `band-${chartPlace(ex.place)}` }, "highlight", 0)] });
      if (ex.ask === "value" && chosen.some((o) => o.key === "example.value")) {
        out.push({ id: "example.value", shows: `write ${e.vars.answer} as the value of the ${ex.place} digit of the easier example`, commands: () => [
          { op: "put", target: { objectId: "example", part: "cell", rowId: "value", column: chartPlace(ex.place) }, value: String(e.answer) } as unknown as Command,
          { op: "put", target: { objectId: "example", part: "row", rowId: "equation" }, value: `${e.digit} × ${e.vars.perOne} = ${e.vars.answer}` } as unknown as Command,
        ] });
      }
    }
    return out;
  }
  const op = pkg.operation;
  const f = factsOf(op);
  const value = op.ask === "value";
  // A digit question's chart has no digits; nor has a value question's whose digit is 0, the value's answer too.
  const blank = !value || f.digit === 0;
  // A chart has room for 6 places on one board page (a 7-digit number is taught by voice and lines only).
  if (!has("question") && String(op.operands[0]).length <= 6) {
    out.push({
      id: "question.chart",
      shows: blank ? `a place-value chart of the places of ${f.vars.number}, with no digits written` : `a place-value chart of ${f.vars.number}`,
      commands: (place) => [{ op: "place_chart", id: "question", number: String(op.operands[0]), ...(blank ? { blank: true } : {}), place } as unknown as Command],
    });
  }
  if (said(BAND_KEYS)) out.push({ id: "question.band", shows: `color the ${op.place} place on the chart`, commands: () => [mark("question", { part: "piece", piece: `band-${chartPlace(op.place)}` }, "highlight", 0)] });
  if (value && !blank && said(CIRCLE_KEYS)) out.push({ id: "question.circle", shows: `circle the digit in the ${op.place} place`, commands: () => [mark("question", { part: "cell", rowId: "digits", column: chartPlace(op.place) }, "circle", 1)] });
  if (chosen.some((o) => o.line === "answer.right")) {
    const digitCell = { op: "put", target: { objectId: "question", part: "cell", rowId: "digits", column: chartPlace(op.place) }, value: String(f.digit) } as unknown as Command;
    const cells: Command[] = value
      ? [
        // On a blank chart the digit is written before its value.
        ...(blank ? [digitCell] : []),
        { op: "put", target: { objectId: "question", part: "cell", rowId: "value", column: chartPlace(op.place) }, value: String(f.answer) } as unknown as Command,
        { op: "put", target: { objectId: "question", part: "row", rowId: "equation" }, value: `${f.digit} × ${f.vars.perOne} = ${f.vars.answer}` } as unknown as Command,
      ]
      : [{ op: "put", target: { objectId: "question", part: "cell", rowId: "digits", column: chartPlace(op.place) }, value: String(f.digit) } as unknown as Command];
    out.push({ id: "question.answer", shows: `write the checked answer ${f.vars.answer} on the chart`, commands: () => [
      ...cells, { op: "put", target: { objectId: "question", part: "row", rowId: "answer" }, value: f.vars.answer } as unknown as Command,
    ] });
  }
  return out;
}
