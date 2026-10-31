// Maya's code-written lines (#372, D-195): every sentence Maya says or writes that holds a number, a digit, a place
// word, an operation word or sign, a carry, a result or an instruction about the work. Code fills each line from the
// checked worked step of the question package, so its math is the package's math. The model never writes such a
// sentence: it picks a line (an id and its slots) from the lines the session offers for this act, step and hint level.
// Warm talk around the lines follows D-196 (phrases.ts).
//
// Each line has 5 to 8 child-friendly wordings (ages 6 to 12) with the same meaning, numbers and order; Savar approved
// the wording (#372). Code picks the wording the child has heard least lately (variety.ts), so calls do not sound the
// same. Pure TypeScript: no clock, network or randomness.
import {
  operationText,
  stepText,
  valueText,
  type AnswerValue,
  type OperationPackage,
  type Place,
  type WorkedStep,
} from "@/lib/question-package";

/** The version of the line set. Raise it when a line id, a slot or the meaning of a line changes. */
export const LINES_VERSION = 1;

export const LINE_IDS = [
  "open.hello",
  "question.problem",
  "question.read",
  "assess.ask",
  "example.intro",
  "example.step",
  "try.target",
  "step.invite",
  "step.point",
  "step.regroup",
  "step.operation",
  "step.show",
  "check.right_step",
  "check.not_yet",
  "check.explain",
  "answer.right",
  "answer.give",
  "write.answer",
  "write.yours",
  "confirm.heard",
  "confirm.which",
  "input.other",
  "redirect.back",
  "close.solved",
  "close.together",
  "repair.sorry",
] as const;
export type LineId = (typeof LINE_IDS)[number];

/**
 * The slots of a line: which step it is about, which sentence of the question it reads, and which number Maya heard.
 * Code offers every allowed set of slots; the model copies one.
 */
export interface Slots {
  step?: string;
  sentence?: number;
  heard?: string;
  other?: string;
}

/** The model's choice of a line: an id and the slots of one offer. */
export interface LineChoice {
  line: LineId;
  slots?: Slots;
}

/** A line the session offers now, with every variant filled in. */
export interface LineOffer {
  line: LineId;
  slots: Slots;
  /** The hint level of a step line (H0 invite to H3 show the step); help lines only. */
  level?: 0 | 1 | 2 | 3;
  /**
   * The line judges the child's answer for a step: it is allowed only when the proposal's reading has an answer for
   * that step that code checked and found right (or wrong).
   */
  requires?: { answer: "right" | "wrong"; step: string };
  /** Every variant of the line, filled in. Code picks one (`key#index` is the wording's id, see variety.ts). */
  texts: string[];
  /** The template the variants come from. */
  key: TemplateKey;
  /** The text Maya may write on the board with this line: its expression or its equation. */
  board?: string;
}

// ---------- The wording ----------

/**
 * Every template, by key, with its variants. `{name}` is filled from the checked step. One key per wording, so the
 * review copy shows each wording once.
 */
export const TEMPLATES = {
  "open.hello": [
    "Hi, I'm Maya, an AI helper.", "Hello! I'm Maya. I'm an AI, here to help you.", "Hi there! I'm Maya, an AI math helper.",
    "Hey! I'm Maya, an AI helper for your workbook.", "Hello, I'm Maya. I'm an AI, and I'm here to help.", "Hi! My name is Maya, and I'm an AI helper.",
  ],
  "question.problem": [
    "Today we're working on {expr}.", "Our question is {expr}.", "Let's work on {expr} together.", "We're doing {expr} today.",
    "This one is {expr}.", "Here's our question: {expr}.",
  ],
  "question.read": [
    "The question says: {sentence}", "Let's read it again: {sentence}", "Here's the question: {sentence}", "It says: {sentence}",
    "Let's read it together: {sentence}", "Here's what it says: {sentence}",
  ],
  "assess.ask": [
    "What did you try for {expr}?", "How did you start {expr}?", "Tell me what you did on {expr} so far.", "What have you done on {expr} so far?",
    "How far did you get with {expr}?", "Can you show me how you began {expr}?",
  ],
  "example.intro": [
    "Let's try an easier one first: {expr}.", "Here's a smaller one to warm up: {expr}.", "Let me show you an easier one: {expr}.",
    "Let's warm up with an easier one: {expr}.", "First, a smaller one: {expr}.", "I'll show you an easier one first: {expr}.",
  ],
  "example.step": ["{show}", "Watch this. {show}", "Here's how. {show}", "Look. {show}", "Follow along. {show}", "Like this. {show}"],
  "example.result": ["So {show}.", "And that's it: {show}.", "There we go: {show}.", "All done: {show}.", "So in the end, {show}."],
  "try.target": [
    "Now you try yours: {expr}.", "Your turn! Try {expr}.", "Can you try {expr} the same way?", "Now it's your turn with {expr}.",
    "Let's go back to yours: {expr}. You try it.", "Over to you! Try {expr} the same way.",
  ],

  "step.invite": [
    "Let's look at {where}. What can you do there?", "Now {where}. What do you think comes next?", "What could you try for {where}?",
    "Let's go to {where}. What do you think?", "Next up, {where}. What would you do?", "How about {where}? What can you do there?",
  ],

  "point.add": [
    "Look at the {place}: {list}.", "Find the {place}. They are {list}.", "Let's look at the {place} column: {list}.",
    "In the {place} we have {list}.", "The {place} are {list}.", "Look at the {place} column. It has {list}.",
  ],
  "point.add.carry": [
    "Look at the {place}: {list}, and the {carry} you carried.", "In the {place} we have {list}, plus the carried {carry}.",
    "Don't forget the carried {carry} in the {place}, with {list}.", "The {place} have {list}, and the {carry} you carried.",
    "Look at the {place} column: {list}, and the carried {carry} on top.",
  ],
  "point.add.single": [
    "Look at the {place}. There is only a {term} there.", "The {place} have just the {term}.", "Only the {term} is in the {place}.",
    "In the {place}, there's just a {term}.", "Look at the {place}: there's only the {term}.",
  ],
  "operation.add": [
    "Add the {place}: {sum}. What do you get?", "What is {sum}?", "Let's add the {place}: {sum}.", "Add up the {place}: {sum}.",
    "What do you get for {sum}?", "Can you add {sum}?",
  ],
  "operation.add.single": [
    "Bring down the {term} in the {place}.", "Nothing to add in the {place}, so bring down the {term}.", "Just bring down the {term} in the {place}.",
    "The {place} only have the {term}, so bring it down.", "Bring the {term} straight down in the {place}.",
  ],

  "point.subtract": [
    "Look at the {place}: {have} on top and {bottom} below.", "In the {place}, the top is {have} and the bottom is {bottom}.",
    "Find the {place}: {have} and {bottom}.", "The {place} have {have} on top and {bottom} at the bottom.",
    "Look at the {place} column: {have} over {bottom}.",
  ],
  "point.subtract.lent": [
    "The {place} gave 1 to the {next}, so there are {have} on top now. Below is {bottom}.",
    "Look at the {place}: after giving 1 to the {next}, the top is {have}. The bottom is {bottom}.",
    "The {place} lent 1 to the {next}, so the top is {have} now. The bottom is {bottom}.",
    "After giving 1 to the {next}, the {place} have {have} on top and {bottom} below.",
    "Remember, the {place} gave 1 to the {next}. Now it's {have} on top and {bottom} below.",
  ],
  "point.subtract.single": [
    "Look at the {place}: {have} on top, and nothing to take away.", "The {place} have {have} on top and nothing below.",
    "In the {place}, there's {have} on top and nothing underneath.", "Only {have} is in the {place}, with nothing below it.",
    "Look at the {place}: just {have} on top.",
  ],
  "regroup.subtract": [
    "{have} is less than {bottom}, so regroup 1 {big} as 10 {place}.", "We need more {place}: trade 1 {big} for 10 {place}.",
    "Regroup 1 {big} as 10 {place}, so {have} becomes {from}.", "{have} is smaller than {bottom}, so trade 1 {big} for 10 {place}.",
    "There aren't enough {place}, so regroup 1 {big} as 10 {place}.", "Take 1 {big} and make it 10 {place}, so {have} becomes {from}.",
  ],
  "operation.subtract": [
    "Subtract the {place}: {from} − {bottom}. What do you get?", "What is {from} − {bottom}?", "Now take {bottom} away from {from}.",
    "Subtract {from} − {bottom} in the {place}.", "What do you get for {from} − {bottom}?", "In the {place}, what is {from} − {bottom}?",
  ],
  "operation.subtract.single": [
    "Bring down the {from} in the {place}.", "Nothing to take away in the {place}, so bring down the {from}.",
    "Just bring down the {from} in the {place}.", "The {place} have only the {from}, so bring it down.",
    "Bring the {from} straight down in the {place}.",
  ],
  "operation.subtract.none": [
    "There is nothing to write in the {place}.", "The {place} stay empty: a number does not start with 0.",
    "Leave the {place} empty: a number does not start with 0.", "Nothing goes in the {place}, because a number does not start with 0.",
    "We don't write anything in the {place}.",
  ],

  "point.multiply": [
    "Look at the {top} in the {place} and the {by}.", "Find the {top} on top and the {by} below.", "We use the {top} and the {by} next.",
    "Next, the {top} in the {place} and the {by}.", "Look at the {top} on top and the {by} at the bottom.",
  ],
  "point.multiply.carry": [
    "Look at the {carry} you carried.", "There's a carried {carry} left over.", "We still have the carried {carry}.",
    "Don't forget the {carry} you carried.", "The carried {carry} is still waiting.",
  ],
  "operation.multiply": [
    "Multiply {top} × {by}. What do you get?", "What is {top} × {by}?", "Let's multiply {top} × {by}.", "What do you get for {top} × {by}?",
    "Can you work out {top} × {by}?", "Now multiply {top} × {by}.",
  ],
  "operation.multiply.carry": [
    "Multiply {top} × {by}, then add the carried {carry}.", "What is {top} × {by} + {carry}?", "Do {top} × {by} and add the {carry} you carried.",
    "Work out {top} × {by}, then add the carried {carry}.", "Multiply {top} × {by}, and don't forget to add the {carry}.",
  ],
  "operation.multiply.last": [
    "Write the carried {carry} at the front.", "Now write the {carry} you carried.", "Put the carried {carry} at the front.",
    "The carried {carry} goes at the front.", "Write the {carry} you carried at the front of the row.",
  ],

  "point.row": ["Look at the whole {row} row.", "Let's read the {row} row.", "Now look at all of the {row} row.", "Let's see the whole {row} row.", "Look across the {row} row."],
  "point.row.zeros": [
    "Start the {row} row with {zeros}, because the {by} is in the {row}.", "The {by} is in the {row}, so the row starts with {zeros}.",
    "Because the {by} is in the {row}, begin the row with {zeros}.", "The {row} row starts with {zeros}, since the {by} is in the {row}.",
    "Begin the {row} row with {zeros}: the {by} is in the {row}.",
  ],
  "operation.row": ["The {row} row is {top} × {by}.", "What is {top} × {by}?", "The {row} row works out {top} × {by}.", "This row is {top} × {by}.", "Can you work out {top} × {by}?"],

  "point.point": [
    "Count the decimal places in both numbers.", "How many digits are after the points in both numbers?", "Look at the digits after the points in both numbers.",
    "Let's count the decimal places in both numbers.", "How many decimal places do both numbers have?",
  ],
  "operation.point": [
    "The numbers have {places} in all.", "Count {places} from the right in {product}.", "There are {places} in all, so count them from the right in {product}.",
    "Both numbers together have {places}.", "In {product}, count {places} from the right.",
  ],

  "point.divide.first": ["Look at the {current}.", "Start with the {current}.", "Let's begin with the {current}.", "First, look at the {current}.", "We start at the {current}."],
  "point.divide": [
    "Bring down the {digit} to make {current}.", "Now bring down the {digit}. That makes {current}.", "Bring the {digit} down, and now we have {current}.",
    "Bring down the {digit}: now it's {current}.", "Next, bring down the {digit} to make {current}.",
  ],
  "operation.divide": [
    "How many {by}s fit in {current}?", "What is {current} ÷ {by}?", "Divide {current} by {by}.", "How many times does {by} go into {current}?",
    "What do you get for {current} ÷ {by}?", "Can you work out {current} ÷ {by}?",
  ],

  "step.show": ["{show}", "Watch me. {show}", "Here's how it goes. {show}", "Let me show you. {show}", "Follow along. {show}", "Like this. {show}", "I'll do this part. {show}"],

  "check.right_step": ["Yes! {eq}.", "That's right: {eq}.", "You got it, {eq}.", "Yes, {eq}.", "Exactly! {eq}.", "Nice, {eq}.", "That's it: {eq}."],
  "check.right_step.plain": ["Yes! {Where} is done.", "That's right. {Where} is done.", "Good, {where} is done.", "Yes, that's {where} done.", "Nice! {Where} is done."],
  "check.not_yet": [
    "Not quite. Let's look at {where} again.", "Almost! Let's check {where} together.", "Hmm, not yet. Let's try {where} again.",
    "Close! Let's look at {where} once more.", "Not yet. Let's go back to {where}.", "Good try. Let's check {where} again together.",
  ],
  "check.explain": [
    "How did you get {where}?", "Can you tell me how you did {where}?", "Show me how you worked out {where}.", "How did you work out {where}?",
    "Tell me what you did for {where}.", "What did you do in {where}?",
  ],

  "answer.right": [
    "Yes! {expr} = {answer}.", "That's right: {expr} = {answer}.", "You got it! {expr} = {answer}.", "Yes, {expr} = {answer}!",
    "Exactly! {expr} = {answer}.", "That's it: {expr} = {answer}.", "Well done! {expr} = {answer}.",
  ],
  "answer.give": [
    "The answer is {answer}. Please write {answer} on your paper.", "It comes to {answer}. Can you write {answer} on your paper?",
    "So the answer is {answer}. Please write {answer} on your paper.", "That makes {answer}. Can you write {answer} on your page?",
    "The answer is {answer}. Now write {answer} on your paper.",
  ],
  "write.answer": [
    "Please write {answer} on your paper.", "Can you write {answer} on your paper?", "Now write {answer} on your page.",
    "Go ahead and write {answer} on your paper.", "Let's put {answer} on your paper.", "Write {answer} on your page, please.",
  ],
  "write.yours": [
    "Please write your answer on your paper.", "Can you write your answer on your page?", "Go ahead and write your answer on your paper.",
    "Now write your answer on your page.", "Let's put your answer on your paper.",
  ],

  "confirm.heard": ["Did you say {heard}?", "I heard {heard}. Is that right?", "Just checking, was that {heard}?", "Was that {heard}?", "So you said {heard}?", "I think I heard {heard}. Is that it?"],
  "confirm.which": ["Did you say {heard} or {other}?", "Was that {heard} or {other}?", "I'm not sure. {heard} or {other}?", "Did I hear {heard}, or was it {other}?", "Was it {heard} or {other}?"],
  "input.other": [
    "You can write your answer on the board instead.", "If it's easier, write your number on the board.", "Try writing it on the board for me.",
    "You can also write it on the board.", "Would you like to write it on the board instead?",
  ],
  "redirect.back": ["Let's get back to {expr}.", "Back to our question: {expr}.", "Let's keep going with {expr}.", "Now, back to {expr}.", "Let's return to {expr}.", "Okay, back to {expr}."],
  "close.solved": [
    "You worked out {expr} today!", "Great job on {expr} today!", "You solved {expr}. Well done!", "Nice work finishing {expr}!",
    "You did it: {expr} is done!", "Well done on {expr} today!",
  ],
  "close.together": [
    "We worked through {expr} together.", "We finished {expr} together today.", "We got through {expr} together.",
    "Together, we finished {expr}.", "We worked on {expr} together today.",
  ],
  "repair.sorry": [
    "Oops, I said that wrong. Let me fix it.", "Sorry, I made a mistake there. Here it is again.", "Wait, I mixed that up. Let me say it again.",
    "Oops, my mistake. Let me try again.", "Sorry, that came out wrong. Here's the right way.",
  ],
} as const satisfies Record<string, readonly string[]>;
export type TemplateKey = keyof typeof TEMPLATES;

// ---------- Filling the lines ----------

type Vars = Record<string, string | number>;

const fill = (template: string, vars: Vars) => template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name]));
const offer = (line: LineId, key: TemplateKey, vars: Vars, extra: Omit<LineOffer, "line" | "texts" | "key"> = { slots: {} }): LineOffer => ({
  line,
  ...extra,
  key,
  texts: TEMPLATES[key].map((t) => sentence(fill(t, vars))),
});

const PLACE_ORDER: Place[] = ["thousandths", "hundredths", "tenths", "ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands", "millions"];
const UNIT: Record<Place, string> = {
  thousandths: "thousandth", hundredths: "hundredth", tenths: "tenth", ones: "one", tens: "ten", hundreds: "hundred",
  thousands: "thousand", "ten thousands": "ten thousand", "hundred thousands": "hundred thousand", millions: "million",
};
const leftOf = (p: Place) => PLACE_ORDER[PLACE_ORDER.indexOf(p) + 1] ?? p;
const rightOf = (p: Place) => PLACE_ORDER[PLACE_ORDER.indexOf(p) - 1] ?? p;
/** "7 and 9", "7, 9 and 4". */
const listOf = (ns: readonly number[]) => (ns.length <= 1 ? ns.join("") : `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`);
const capital = (s: string) => s[0].toUpperCase() + s.slice(1);
/** A sentence ends with its punctuation. */
const sentence = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);

/** What a step is about, as Maya names it: "the ones", "the tens in the tens row", "the tens row", "the decimal point". */
function whereOf(step: WorkedStep): string {
  switch (step.kind) {
    case "add-column":
    case "subtract-column":
    case "divide-digit":
      return `the ${step.place}`;
    case "multiply-digit":
      return step.row === "ones" ? `the ${step.place}` : `the ${step.place} in the ${step.row} row`;
    case "partial-product":
      return `the ${step.row} row`;
    case "place-point":
      return "the decimal point";
    default:
      return "this step";
  }
}

/** The step's equation, as a line says it and the board writes it ("7 + 9 = 16"), or null for a step with none. */
function equationOf(step: WorkedStep, pkg: OperationPackage, problem: "target" | "example"): string | null {
  const op = problem === "target" ? pkg.operation : pkg.easierExample.operation;
  switch (step.kind) {
    case "add-column": {
      const terms = [...step.digits, ...(step.carryIn > 0 ? [step.carryIn] : [])];
      return terms.length > 1 ? `${terms.join(" + ")} = ${step.total}` : null;
    }
    case "subtract-column": {
      if (step.bottom === null) return null;
      const from = step.top - (step.lent ? 1 : 0) + (step.regrouped ? 10 : 0);
      return `${from} − ${step.bottom} = ${from - step.bottom}`;
    }
    case "multiply-digit":
      return step.top === null ? null : `${step.top} × ${step.multiplier}${step.carryIn > 0 ? ` + ${step.carryIn}` : ""} = ${step.total}`;
    case "partial-product":
      return `${rowTop(pkg, problem)} × ${step.multiplier * 10 ** step.zeros} = ${step.value}`;
    case "divide-digit": {
      const by = op.operands[1] as number;
      return `${step.current} ÷ ${by} = ${step.remainder > 0 ? `${step.quotient} R ${step.remainder}` : step.quotient}`;
    }
    case "result":
      return `${operationText(op)} = ${valueText(step.value)}`;
    default:
      return null;
  }
}

/** The top number of a long multiplication as its rows work it: without its point (2.5 × 1.3 works 25 × 13). */
function rowTop(pkg: OperationPackage, problem: "target" | "example"): number {
  const op = problem === "target" ? pkg.operation : pkg.easierExample.operation;
  const a = op.operands[0] as number;
  const places = (String(a).split(".")[1] ?? "").length;
  return op.kind === "decimal-multiply" ? Math.round(a * 10 ** places) : a;
}

/** The help lines of one step of the child's question, by hint level: H0 invite, H1 point, H2 give the operation, H3 show. */
function stepLines(pkg: OperationPackage, step: WorkedStep): LineOffer[] {
  const slots = { step: step.id };
  const where = whereOf(step);
  const out: LineOffer[] = [offer("step.invite", "step.invite", { where }, { slots, level: 0 })];
  const add = (line: LineId, key: TemplateKey, vars: Vars, level: 1 | 2, board?: string) =>
    out.push(offer(line, key, vars, { slots, level, ...(board ? { board } : {}) }));
  switch (step.kind) {
    case "add-column": {
      const { place, digits, carryIn } = step;
      const terms = [...digits, ...(carryIn > 0 ? [carryIn] : [])];
      if (terms.length === 1) {
        add("step.point", "point.add.single", { place, term: terms[0] }, 1);
        add("step.operation", "operation.add.single", { place, term: terms[0] }, 2);
      } else {
        const list = listOf(digits);
        add("step.point", carryIn > 0 ? "point.add.carry" : "point.add", { place, list, carry: carryIn }, 1);
        add("step.operation", "operation.add", { place, sum: terms.join(" + ") }, 2, terms.join(" + "));
      }
      break;
    }
    case "subtract-column": {
      const { place, top, bottom, lent, regrouped, write } = step;
      const have = top - (lent ? 1 : 0);
      const from = have + (regrouped ? 10 : 0);
      const vars = { place, have, from, bottom: bottom ?? 0, next: rightOf(place), big: UNIT[leftOf(place)] };
      if (bottom === null) {
        if (have >= 0) add("step.point", "point.subtract.single", vars, 1);
        add("step.operation", write === null ? "operation.subtract.none" : "operation.subtract.single", vars, 2);
        break;
      }
      if (have >= 0) add("step.point", lent ? "point.subtract.lent" : "point.subtract", vars, 1);
      if (regrouped && have >= 0) add("step.regroup", "regroup.subtract", vars, 2);
      add("step.operation", "operation.subtract", vars, 2, `${from} − ${bottom}`);
      break;
    }
    case "multiply-digit": {
      const { place, top, multiplier: by, carryIn: carry } = step;
      if (top === null) {
        add("step.point", "point.multiply.carry", { carry }, 1);
        add("step.operation", "operation.multiply.last", { carry }, 2);
        break;
      }
      add("step.point", "point.multiply", { place, top, by }, 1);
      const expr = `${top} × ${by}${carry > 0 ? ` + ${carry}` : ""}`;
      add("step.operation", carry > 0 ? "operation.multiply.carry" : "operation.multiply", { top, by, carry }, 2, expr);
      break;
    }
    case "partial-product": {
      const { row, multiplier, zeros } = step;
      const zerosText = `${zeros} ${zeros === 1 ? "zero" : "zeros"}`;
      add("step.point", zeros > 0 ? "point.row.zeros" : "point.row", { row, zeros: zerosText, by: multiplier }, 1);
      const by = multiplier * 10 ** zeros;
      add("step.operation", "operation.row", { row, top: rowTop(pkg, "target"), by }, 2, `${rowTop(pkg, "target")} × ${by}`);
      break;
    }
    case "place-point": {
      const places = `${step.decimals} decimal ${step.decimals === 1 ? "place" : "places"}`;
      add("step.point", "point.point", {}, 1);
      add("step.operation", "operation.point", { places, product: step.product }, 2);
      break;
    }
    case "divide-digit": {
      const by = pkg.operation.operands[1] as number;
      const first = pkg.steps.find((s) => s.kind === "divide-digit")?.id === step.id;
      add("step.point", first ? "point.divide.first" : "point.divide", { digit: step.digit, current: step.current }, 1);
      add("step.operation", "operation.divide", { current: step.current, by }, 2, `${step.current} ÷ ${by}`);
      break;
    }
    default:
      break;
  }
  const eq = equationOf(step, pkg, "target");
  out.push(offer("step.show", "step.show", { show: stepText(step, pkg.operation) }, { slots, level: 3, ...(eq ? { board: eq } : {}) }));
  return out;
}

/** The worked steps a child does, without the result. */
const workSteps = (steps: WorkedStep[]) => steps.filter((s) => s.kind !== "result");

/** The sentences of a question text, each with its own end mark. */
const sentencesOf = (text: string) => text.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);

/**
 * The lines of one checked question package, by situation. The session picks the ones an act may use now; every line
 * is filled from the package's checked numbers and steps.
 */
export function packageLines(pkg: OperationPackage) {
  const expr = operationText(pkg.operation);
  const exampleExpr = operationText(pkg.easierExample.operation);
  const answer = valueText(pkg.answer.value);
  const steps = workSteps(pkg.steps);
  const find = (id: string) => steps.find((s) => s.id === id);
  return {
    hello: (): LineOffer[] => [offer("open.hello", "open.hello", {})],
    question: (): LineOffer[] => [
      offer("question.problem", "question.problem", { expr }, { slots: {}, board: expr }),
      ...sentencesOf(pkg.text).map((s, i) => offer("question.read", "question.read", { sentence: s }, { slots: { sentence: i } })),
    ],
    assess: (): LineOffer[] => [offer("assess.ask", "assess.ask", { expr })],
    exampleIntro: (): LineOffer[] => [offer("example.intro", "example.intro", { expr: exampleExpr }, { slots: {}, board: exampleExpr })],
    /** Maya works one step of the easier example. */
    exampleStep: (id: string): LineOffer[] => {
      const step = pkg.easierExample.steps.find((s) => s.id === id);
      if (!step) return [];
      const show = stepText(step, pkg.easierExample.operation);
      const eq = equationOf(step, pkg, "example");
      return [offer("example.step", step.kind === "result" ? "example.result" : "example.step", { show }, { slots: { step: id }, ...(eq ? { board: eq } : {}) })];
    },
    tryTarget: (): LineOffer[] => [offer("try.target", "try.target", { expr }, { slots: {}, board: expr })],
    /** The help lines of the child's question's step, H0 to H3. */
    help: (id: string): LineOffer[] => {
      const step = find(id);
      return step ? stepLines(pkg, step) : [];
    },
    /** "Yes! 7 + 9 = 16.": only after code checked the child's right answer for that step. */
    rightStep: (id: string): LineOffer[] => {
      const step = find(id);
      if (!step) return [];
      const eq = equationOf(step, pkg, "target");
      const requires = { answer: "right" as const, step: id };
      return [eq
        ? offer("check.right_step", "check.right_step", { eq }, { slots: { step: id }, requires, board: eq })
        : offer("check.right_step", "check.right_step.plain", { Where: capital(whereOf(step)), where: whereOf(step) }, { slots: { step: id }, requires })];
    },
    /** "Not quite.": only after code checked the child's wrong answer for that step. */
    notYet: (id: string): LineOffer[] => {
      const step = find(id);
      return step ? [offer("check.not_yet", "check.not_yet", { where: whereOf(step) }, { slots: { step: id }, requires: { answer: "wrong", step: id } })] : [];
    },
    explain: (): LineOffer[] => steps.map((s) => offer("check.explain", "check.explain", { where: whereOf(s) }, { slots: { step: s.id } })),
    answerRight: (): LineOffer[] => [offer("answer.right", "answer.right", { expr, answer }, { slots: {}, board: `${expr} = ${answer}` })],
    answerGive: (): LineOffer[] => [offer("answer.give", "answer.give", { answer })],
    writeAnswer: (): LineOffer[] => [offer("write.answer", "write.answer", { answer })],
    writeYours: (): LineOffer[] => [offer("write.yours", "write.yours", {})],
    /** "Did you say 15?" for each number Maya may have heard, and "15 or 50?" for each pair that sound alike. */
    heard: (values: readonly AnswerValue[], pairs: readonly [AnswerValue, AnswerValue][]): LineOffer[] => [
      ...unique(values.map(valueText)).map((heard) => offer("confirm.heard", "confirm.heard", { heard }, { slots: { heard } })),
      ...unique(pairs.map(([a, b]) => `${valueText(a)}\n${valueText(b)}`)).map((p) => {
        const [heard, other] = p.split("\n");
        return offer("confirm.which", "confirm.which", { heard, other }, { slots: { heard, other } });
      }),
    ],
    otherInput: (): LineOffer[] => [offer("input.other", "input.other", {})],
    redirect: (): LineOffer[] => [offer("redirect.back", "redirect.back", { expr })],
    closeSolved: (by: "child" | "maya"): LineOffer[] => [by === "child" ? offer("close.solved", "close.solved", { expr }) : offer("close.together", "close.together", { expr })],
    repair: (): LineOffer[] => [offer("repair.sorry", "repair.sorry", {})],
    /** The ids of the child's question's work steps, in order. */
    stepIds: steps.map((s) => s.id),
  };
}

const unique = (xs: string[]) => [...new Set(xs)];

/** The offer a choice names: the same line with the same slots, or null. */
export function findOffer(offers: readonly LineOffer[], choice: LineChoice): LineOffer | null {
  const want = choice.slots ?? {};
  const same = (a: Slots, b: Slots) =>
    a.step === b.step && a.sentence === b.sentence && a.heard === b.heard && a.other === b.other;
  return offers.find((o) => o.line === choice.line && same(o.slots, normalSlots(want))) ?? null;
}

/** Slots with null or missing fields left out, as structured output may send null for an unused slot. */
export function normalSlots(raw: Slots | Record<string, unknown>): Slots {
  const r = raw as Record<string, unknown>;
  const out: Slots = {};
  if (typeof r.step === "string") out.step = r.step;
  if (typeof r.sentence === "number") out.sentence = r.sentence;
  if (typeof r.heard === "string") out.heard = r.heard;
  if (typeof r.other === "string") out.other = r.other;
  return out;
}

/**
 * Every text any line can give for this package, in every variant: what Maya can ever say in math. `heard` adds the
 * confirmation lines for those numbers. For tests and the review copy.
 */
export function allLineTexts(pkg: OperationPackage, heardValues: readonly AnswerValue[] = []): string[] {
  const l = packageLines(pkg);
  const heard = [...new Map(heardValues.map((v) => [valueText(v), v])).values()];
  const offers = [
    ...l.hello(), ...l.question(), ...l.assess(), ...l.exampleIntro(), ...pkg.easierExample.steps.flatMap((s) => l.exampleStep(s.id)),
    ...l.tryTarget(), ...l.stepIds.flatMap((id) => [...l.help(id), ...l.rightStep(id), ...l.notYet(id)]), ...l.explain(),
    ...l.answerRight(), ...l.answerGive(), ...l.writeAnswer(), ...l.writeYours(), ...l.heard(heard, heard.flatMap((a) => heard.map((b) => [a, b] as [AnswerValue, AnswerValue]))),
    ...l.otherInput(), ...l.redirect(), ...l.closeSolved("child"), ...l.closeSolved("maya"), ...l.repair(),
  ];
  return [...new Set(offers.flatMap((o) => o.texts.map(sentence)))];
}
