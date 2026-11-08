// Maya's code-written lines (#372, D-195): every sentence Maya says or writes that holds a number, a digit, a place
// word, an operation word or sign, a carry, a result or an instruction about the work. Code fills each line from the
// checked worked step of the question package, so its math is the package's math. The model never writes such a
// sentence: it picks a line (an id and its slots) from the lines the session offers for this act, step and hint level.
// Warm talk around the lines follows D-196 (phrases.ts).
//
// Each line has 5 to 8 child-friendly wordings (ages 6 to 12) with the same meaning, numbers and order; Savar approved
// the wording (#372). Every wording follows the plain-language rules (D-202): short sentences with one idea or action
// each, everyday words (never "in all", "altogether", "all together", "total" or "left over"), and the curriculum's math
// words. A wording is changed in place, never moved, so its id (`key#index`) in a child's wording history stays. Code picks the wording the child has heard least lately (variety.ts), so calls do not sound the
// same. Pure TypeScript: no clock, network or randomness.
import {
  equivalent,
  operationText,
  sameValue,
  stepText,
  valueText,
  type AnswerValue,
  type FractionParts,
  type OperationPackage,
  type Place,
  type WorkedStep,
} from "@/lib/question-package";
import { patternOf } from "./pattern";
import { PATTERN_OPENING, PATTERN_TEMPLATES, patternClose, patternExampleShow, patternHelp, patternTopHint } from "./pattern-lines";
import { simplestWords, teachSteps } from "./fractions";
import { evaluateFrame, partAt, withEvaluateExample } from "./evaluate";
import { EVALUATE_TEMPLATES, partEquation, partHelp, partShow } from "./evaluate-lines";
import { frameInvite, frameLead, framedLines, frameWhy, MISSING_TEMPLATES, type FramedLines } from "./missing-number";
import { showTrial, trialEquation, trialFeedback, trialHelp, trialRight, TRIAL_TEMPLATES, type TrialLine } from "./trial-factor";
import { topicFrame } from "./topic-frame";

/**
 * The version of the line set. Raise it when a line id, a slot or the meaning of a line changes. Version 2:
 * redirect.decline. Version 3 (#389): step.invite for the final step ("result"), after the last column. Version 4 (D-199):
 * answer.parts, how the parts make the answer, said before answer.give on the final step. Version 5: regroup.add, where
 * a column's carry comes from, as step.regroup in addition. Version 6 (#407): fraction steps (common denominator,
 * numerators, simplest form) and check.equal, an equal fraction when the question asks for the simplest form.
 * Version 9 (#527): held.hello, held.cannot and held.next, Maya's words on a question she cannot teach yet. Version 10
 * (#605, Savar 2026-11-06: "conversational and human-like"): check.together, check.guess, step.why,
 * step.order; check.not_yet never praises wrong work.
 * Version 11 (#605): a held question invites another question on the page, without an inability claim.
 * Version 13: answer-only clarification and checked regroup explanations from full practice.
 * Version 14 (Wave A): missing numbers: the framing invites, try.target.frame, and the try-a-number lines; a
 * check.not_yet line may name the wrong try it answers (`heard`).
 */
export const LINES_VERSION = 15;

export const LINE_IDS = [
  "about.ai",
  "about.no_secret",
  "shorter.prompt",
  "answer.area",
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
  "check.equal",
  "check.explain",
  "check.thinking",
  "check.together",
  "check.guess",
  "step.why",
  "step.order",
  "answer.right",
  "answer.give",
  "answer.parts",
  "write.answer",
  "write.yours",
  "confirm.heard",
  "confirm.which",
  "confirm.answer",
  "input.other",
  "redirect.back",
  "redirect.decline",
  "redirect.workbook",
  "close.solved",
  "close.together",
  "repair.sorry",
  "held.hello",
  "held.next",
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
  requires?: { answer: "right" | "wrong" | "equal"; step: string; heard?: string };
  /** Every variant of the line, filled in. Code picks one (`key#index` is the wording's id, see variety.ts). */
  texts: string[];
  /** Original wording ids when spoken help removes visual variants. */
  wordingIds?: string[];
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
  "about.ai": ["I'm not a real person. I'm an AI helper."],
  "about.no_secret": ["I can't be a secret friend. I don't keep secrets. A grown-up you trust is a good person to talk to."],
  "shorter.prompt": ["What part should we try again?"],
  "answer.area": ["So the area is {answer} {unit}."],
  "input.spoken": ["You can say your answer again."],
  "open.hello": [
    "Hi, I'm Maya, an AI helper.", "Hello! I'm Maya. I'm an AI, here to help you.", "Hi there! I'm Maya, an AI math helper.",
    "Hey! I'm Maya, an AI helper for your workbook.", "Hello, I'm Maya. I'm an AI. I'm here to help.", "Hi! My name is Maya. I'm an AI helper.",
  ],
  "question.problem": [
    "Today we're working on {expr}.", "Our question is {expr}.", "Let's work on {expr} together.", "We're doing {expr} today.",
    "This one is {expr}.", "Here's our question: {expr}.",
  ],
  // An "other-topic" question (Wave C, topic-frame.ts): code's topic sentence before the operation it gives. Pending
  // Savar's approval (D-202).
  "question.framed": [
    "{frame} Our question is {expr}.", "{frame} So our question is {expr}.", "{frame} So we work on {expr}.",
    "{frame} So this one is {expr}.", "{frame} Here's our question: {expr}.",
  ],
  "question.read": [
    "The question says: {sentence}", "Let's read it again: {sentence}", "Here's the question: {sentence}", "It says: {sentence}",
    "Let's read it together: {sentence}", "Here's what it says: {sentence}",
  ],
  "assess.ask": [
    "What did you try for {expr}?", "How did you start {expr}?", "Tell me what you did on {expr} so far.", "What have you done on {expr} so far?",
    "How far did you get with {expr}?", "Can you show me how you began {expr}?",
  ],
  // The first question of an "other-topic" call (Wave C): code's topic sentence, then the usual question.
  "assess.framed": [
    "{frame} What did you try for {expr}?", "{frame} How did you start {expr}?", "{frame} What have you done on {expr}?",
    "{frame} What did you do for {expr}?", "{frame} How did you begin {expr}?",
  ],
  "example.intro": [
    "Let's try an easier one first: {expr}.", "Here's a smaller one to warm up: {expr}.", "Let me show you an easier one: {expr}.",
    "Let's warm up with an easier one: {expr}.", "First, a smaller one: {expr}.", "I'll show you an easier one first: {expr}.",
  ],
  // The easier example of an "other-topic" question (Wave C): its own topic sentence, then its operation.
  "example.framed": [
    "Easier one. {frame} It is {expr}.", "A smaller one. {frame} It is {expr}.", "An easier one. {frame} It is {expr}.",
    "Smaller one first. {frame} It is {expr}.", "Warm-up. {frame} It is {expr}.",
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
  // The final step after the last column (#389): every work step is done, and the child puts the whole answer
  // together. It never says the answer. Savar approved the wording on 2026-11-01, with "So what is {expr}?" (D-202).
  "invite.result": [
    "Now put it all together. What is {expr}?", "Every part is done. So what is {expr}?", "So what is {expr}?",
    "Now say the whole answer. What is {expr}?", "Put the parts together. What does {expr} make?", "You have all the pieces. What is {expr}?",
  ],

  "point.add": [
    "Look at the {place}: {list}.", "Find the {place}. They are {list}.", "Let's look at the {place} column: {list}.",
    "In the {place} we have {list}.", "The {place} are {list}.", "Look at the {place} column. It has {list}.",
  ],
  "point.add.carry": [
    "Look at the {place}: {list}, and the {carry} you carried.", "In the {place} we have {list}, plus the carried {carry}.",
    "Don't forget the carried {carry} in the {place}. It goes with {list}.", "The {place} have {list}, and the {carry} you carried.",
    "Look at the {place} column: {list}, and the carried {carry} on top.",
  ],
  "point.add.single": [
    "Look at the {place}. There is only a {term} there.", "The {place} have just the {term}.", "Only the {term} is in the {place}.",
    "In the {place}, there's just a {term}.", "Look at the {place}: there's only the {term}.",
  ],
  // Where a carry comes from, in addition (2026-11-01, practice C01 and C02: a child who never carried heard "the 1
  // you carried" again and again). Filled from the column whose sum makes the carry ("7 + 9 = 16"): {from} is that
  // column, {to} the next one. Said before any line names a carried digit, when the child lost the carry, says they did
  // not carry, or plans to write the two-digit sum in one column. Pending Savar's approval (D-202).
  "regroup.add": [
    "{eq}. {total} is {carry} {big} and {write} {small}. Write {write} in the {from}. Carry {carry} {big} to the {to}.",
    "{eq}. {total} is {carry} {big} and {write} {small}. Write just {write} in the {from}. Move {carry} {big} to the {to}.",
    "{total} is {carry} {big} and {write} {small}. Only the {write} goes in the {from}. The {carry} {big} goes to the {to}.",
    "{eq}. Split {total} into {carry} {big} and {write} {small}. Write {write} in the {from}. Carry {carry} {big} to the {to}.",
    "{eq}. {total} has {carry} {big} and {write} {small}. The {write} stays in the {from}. The {carry} {big} goes to the {to}.",
  ],
  // A second way to say where a carry comes from (#605), for "why does the 1 go to the tens?" or when the first
  // regroup line did not land: ten of a place make one of the next. Filled like regroup.add, from the column whose sum
  // makes the carry.
  "regroup.why": [
    "Ten {from} make 1 {unit}. So {total} {from} is {carry} {big} and {write} {small}.",
    "A column holds up to 9. {total} {from} is too many. So {carry} {big} goes to the {to}.",
    "Bundle 10 {from} together. That bundle is 1 {unit}. It goes in the {to}.",
    "Think of {total} {from}. Ten of them trade for 1 {unit}. That 1 {unit} goes to the {to}.",
    "Count out 10 {from}. Those 10 make 1 {unit}. That is the {carry} in the {to}.",
  ],
  "operation.add": [
    "Add the {place}: {sum}. What do you get?", "What is {sum}?", "Let's add the {place}: {sum}.", "Add up the {place}: {sum}.",
    "What do you get for {sum}?", "Can you add {sum}?",
  ],
  "operation.add.single": [
    "Bring down the {term} in the {place}.", "There is nothing to add in the {place}. Bring down the {term}.", "Just bring down the {term} in the {place}.",
    "The {place} only have the {term}. Bring it down.", "Bring the {term} straight down in the {place}.",
  ],

  "point.subtract": [
    "Look at the {place}: {have} on top and {bottom} below.", "In the {place}, the top is {have} and the bottom is {bottom}.",
    "Find the {place}: {have} and {bottom}.", "The {place} have {have} on top and {bottom} at the bottom.",
    "Look at the {place} column: {have} over {bottom}.",
  ],
  "point.subtract.lent": [
    "The {place} gave 1 to the {next}. Now there are {have} on top. Below is {bottom}.",
    "Look at the {place}. They gave 1 to the {next}. The top is {have} now. The bottom is {bottom}.",
    "The {place} lent 1 to the {next}. So the top is {have} now. The bottom is {bottom}.",
    "The {place} gave 1 to the {next}. Now they have {have} on top and {bottom} below.",
    "Remember, the {place} gave 1 to the {next}. Now it's {have} on top and {bottom} below.",
  ],
  "point.subtract.single": [
    "Look at the {place}: {have} on top, and nothing to take away.", "The {place} have {have} on top and nothing below.",
    "In the {place}, there's {have} on top and nothing underneath.", "Only {have} is in the {place}, with nothing below it.",
    "Look at the {place}: just {have} on top.",
  ],
  "regroup.subtract": [
    "{have} is less than {bottom}. So regroup 1 {big} as 10 {place}.", "We need more {place}: trade 1 {big} for 10 {place}.",
    "Regroup 1 {big} as 10 {place}. Now {have} becomes {from}.", "{have} is smaller than {bottom}. So trade 1 {big} for 10 {place}.",
    "There aren't enough {place}. So regroup 1 {big} as 10 {place}.", "Take 1 {big} and make it 10 {place}. Now {have} becomes {from}.",
  ],
  // The order of a subtraction (#605, "I take the smaller from the bigger"): the bottom is taken from the top, and a top
  // that is too small regroups first. Filled from the checked column.
  "subtract.order": [
    "We take the bottom number from the top one. {have} is less than {bottom}. So we regroup.",
    "In subtraction, the top comes first. We can't swap {have} and {bottom}.",
    "We can't flip it and take {have} from {bottom}. So we regroup first.",
    "Order matters here. The top is {have}. We take {bottom} away from it.",
    "The top number goes first. Here it's {have}. We need more {place} to take {bottom}.",
  ],
  "subtract.why": [
    "One of the {leftCount} {leftPlace} becomes 10 {place}. Now there are {leftAfter} {leftPlace} and {from} {place}.",
    "Trade 1 {big} for 10 {place}. The {leftCount} {leftPlace} become {leftAfter} {leftPlace}, with {from} {place}.",
    "The 10 {place} come from 1 {big}. That changes {leftCount} {leftPlace} to {leftAfter} {leftPlace}, with {from} {place}.",
    "Use 1 of the {leftCount} {leftPlace} for 10 {place}. This leaves {leftAfter} {leftPlace} and {from} {place}.",
    "Change 1 {big} into 10 {place}. Instead of {leftCount} {leftPlace}, there are {leftAfter} {leftPlace} and {from} {place}.",
  ],
  "operation.subtract": [
    "Subtract the {place}: {from} − {bottom}. What do you get?", "What is {from} − {bottom}?", "Now take {bottom} away from {from}.",
    "Subtract {from} − {bottom} in the {place}.", "What do you get for {from} − {bottom}?", "In the {place}, what is {from} − {bottom}?",
  ],
  "operation.subtract.single": [
    "Bring down the {from} in the {place}.", "There is nothing to take away in the {place}. Bring down the {from}.",
    "Just bring down the {from} in the {place}.", "The {place} have only the {from}. Bring it down.",
    "Bring the {from} straight down in the {place}.",
  ],
  "operation.subtract.none": [
    "There is nothing to write in the {place}.", "The {place} stay empty. A number does not start with 0.",
    "Leave the {place} empty. A number does not start with 0.", "Nothing goes in the {place}. A number does not start with 0.",
    "We don't write anything in the {place}.",
  ],

  "point.multiply": [
    "Look at the {top} in the {place} and the {by}.", "Find the {top} on top and the {by} below.", "We use the {top} and the {by} next.",
    "Next, the {top} in the {place} and the {by}.", "Look at the {top} on top and the {by} at the bottom.",
  ],
  "point.multiply.carry": [
    "Look at the {carry} you carried.", "There's still a carried {carry}.", "We still have the carried {carry}.",
    "Don't forget the {carry} you carried.", "The carried {carry} is still there.",
  ],
  "operation.multiply": [
    "Multiply {top} × {by}. What do you get?", "What is {top} × {by}?", "Let's multiply {top} × {by}.", "What do you get for {top} × {by}?",
    "Can you work out {top} × {by}?", "Now multiply {top} × {by}.",
  ],
  "operation.multiply.carry": [
    "Multiply {top} × {by}. Then add the carried {carry}.", "What is {top} × {by} + {carry}?", "Do {top} × {by}. Then add the {carry} you carried.",
    "Work out {top} × {by}. Then add the carried {carry}.", "Multiply {top} × {by}. Don't forget to add the {carry}.",
  ],
  "operation.multiply.last": [
    "Write the carried {carry} at the front.", "Now write the {carry} you carried.", "Put the carried {carry} at the front.",
    "The carried {carry} goes at the front.", "Write the {carry} you carried at the front of the row.",
  ],

  "point.row": ["Look at the whole {row} row.", "Let's read the {row} row.", "Now look at all of the {row} row.", "Let's see the whole {row} row.", "Look across the {row} row."],
  "point.row.zeros": [
    "Start the {row} row with {zeros}. This is because the {by} is in the {row}.", "The {by} is in the {row}. So the row starts with {zeros}.",
    "The {by} is in the {row}. So begin the row with {zeros}.", "The {row} row starts with {zeros}. The {by} is in the {row}.",
    "Begin the {row} row with {zeros}. The {by} is in the {row}.",
  ],
  "operation.row": ["The {row} row is {top} × {by}.", "What is {top} × {by}?", "The {row} row is for {top} × {by}.", "This row is {top} × {by}.", "Can you work out {top} × {by}?"],

  "point.point": [
    "Count the decimal places in both numbers.", "How many digits are after the points in both numbers?", "Look at the digits after the points in both numbers.",
    "Let's count the decimal places in both numbers.", "How many decimal places do both numbers have?",
  ],
  "operation.point": [
    "Together, the numbers have {places}.", "Count {places} from the right in {product}.", "The numbers have {places} together. Count {places} from the right in {product}.",
    "Both numbers together have {places}.", "In {product}, count {places} from the right.",
  ],

  "point.divide.first": ["Look at the {current}.", "Start with the {current}.", "Let's begin with the {current}.", "First, look at the {current}.", "We start at the {current}."],
  "point.divide": [
    "Bring down the {digit} to make {current}.", "Now bring down the {digit}. That makes {current}.", "Bring the {digit} down. Now we have {current}.",
    "Bring down the {digit}. Now it's {current}.", "Next, bring down the {digit} to make {current}.",
  ],
  "operation.divide": [
    "How many {by}s fit in {current}?", "What is {current} ÷ {by}?", "Divide {current} by {by}.", "How many times does {by} go into {current}?",
    "What do you get for {current} ÷ {by}?", "Can you work out {current} ÷ {by}?",
  ],

  // The parts of an evaluate question (Wave A, A2: evaluate-lines.ts).
  ...EVALUATE_TEMPLATES,
  ...PATTERN_TEMPLATES,

  // Fractions (#407): adding and subtracting fractions, then the simplest form when the question asks for it. Every number is filled
  // from the checked step; no line says the final fraction before the child does. Math words of the curriculum stay:
  // numerator, denominator and common denominator (BC 5.3, 8.5), simplest form and lowest terms (BC 7.4).
  "point.common": [
    "Look at the denominators: {a} and {b}. They are not the same.", "The denominators are {a} and {b}. They are different.",
    "Check the denominators first. One is {a}. The other is {b}.", "The parts are not the same size. The denominators are {a} and {b}.",
    "Find the denominators. They are {a} and {b}. They don't match.", "We need parts of the same size. Right now the denominators are {a} and {b}.",
  ],
  "operation.common": [
    "Use {d} as the common denominator. Multiply the numerator and the denominator of {from} by {factor}.",
    "Make both denominators {d}. Multiply the top and the bottom of {from} by {factor}.",
    "The common denominator is {d}. Multiply {from} by {factor} on the top and the bottom.",
    "Let's use {d} as the denominator. Multiply the numerator and the denominator of {from} by {factor}.",
    "We want {d} as the denominator. Multiply both numbers in {from} by {factor}.",
    "Change {from} so its denominator is {d}. Multiply the numerator and the denominator by {factor}.",
  ],
  "operation.common.both": [
    "Use {d} as the common denominator. Multiply the top and bottom of {from} by {factor}. Multiply {from2} by {factor2} the same way.",
    "Make both denominators {d}. Multiply the top and bottom of {from} by {factor}. Multiply the top and bottom of {from2} by {factor2}.",
    "The common denominator is {d}. Multiply {from} by {factor} on the top and bottom. Multiply {from2} by {factor2} the same way.",
    "Let's use {d} as the denominator. For {from}, multiply the top and bottom by {factor}. For {from2}, multiply them by {factor2}.",
    "We want {d} as the denominator. Multiply both numbers in {from} by {factor}. Multiply both numbers in {from2} by {factor2}.",
  ],
  "point.combine": [
    "Both denominators are {d}. Look at the numerators: {a} and {b}.", "The denominators match. The numerators are {a} and {b}.",
    "Look at the numerators: {a} and {b}. The denominator is {d} for both.", "The parts are the same size. Look at the numerators, {a} and {b}.",
    "The denominators are both {d}. Find the numerators. They are {a} and {b}.", "Both fractions have {d} as the denominator. Now look at {a} and {b} on top.",
  ],
  "operation.combine.add": [
    "Add the numerators: {a} + {b}. Keep the denominator {d}.", "What is {a} + {b}? The denominator stays {d}.",
    "Add {a} + {b} for the new numerator. Keep {d} as the denominator.", "Add the tops: {a} + {b}. The bottom stays {d}.",
    "Work out {a} + {b}. That is the new numerator. The denominator stays {d}.", "Add the numerators, {a} + {b}. The denominator does not change. It stays {d}.",
  ],
  "operation.combine.subtract": [
    "Subtract the numerators: {a} − {b}. Keep the denominator {d}.", "What is {a} − {b}? The denominator stays {d}.",
    "Work out {a} − {b} for the new numerator. Keep {d} as the denominator.", "Subtract the tops: {a} − {b}. The bottom stays {d}.",
    "Work out {a} − {b}. That is the new numerator. The denominator stays {d}.", "Take {b} away from {a} in the numerators. The denominator stays {d}.",
  ],
  "point.simplify": [
    "Find a number that divides both {n} and {d}.", "Can {n} and {d} both be divided by the same number?", "Look for a number that goes into {n} and into {d}.",
    "Which number divides both {n} and {d} evenly?", "Is there a number that divides {n} and also {d}?", "Think of a number that {n} and {d} can both be divided by.",
  ],
  "operation.simplify": [
    "Divide the numerator and the denominator by {g}.", "Divide {n} and {d} by {g}.", "Both {n} and {d} can be divided by {g}. Divide them both.",
    "What is {n} ÷ {g}? And what is {d} ÷ {g}?", "Divide the top and the bottom by {g}.", "Use {g}. Divide {n} by {g}. Then divide {d} by {g}.",
  ],

  "step.show": ["{show}", "Watch me. {show}", "Here's how it goes. {show}", "Let me show you. {show}", "Follow along. {show}", "Like this. {show}", "I'll do this part. {show}"],

  "check.right_step": ["Yes! {eq}.", "That's right: {eq}.", "You got it, {eq}.", "Yes, {eq}.", "Exactly! {eq}.", "Nice, {eq}.", "That's it: {eq}."],
  "check.right_step.plain": ["Yes! {Where} is done.", "That's right. {Where} is done.", "Good, {where} is done.", "Yes, that's {where} done.", "Nice! {Where} is done."],
  "check.not_yet": [
    // #605: wordings 1, 3 and 5 no longer praise wrong work ("Almost!", "Close!", "Good try."); changed in place, so ids stay.
    "Not quite. Let's look at {where} again.", "Not yet. Let's check {where} together.", "Hmm, not yet. Let's try {where} again.",
    "That's not it yet. Let's look at {where} once more.", "Not yet. Let's go back to {where}.", "Let's check {where} again together.",
  ],
  // An equal fraction when the question asks for the simplest form (#407): the right amount, not yet in the form asked.
  // {form} is the question's own words: "simplest form" or "lowest terms".
  "check.equal": [
    "{heard} is the right amount. The question asks for {form}. Can you simplify it?", "{heard} is equal to the answer. Now write it in {form}.",
    "Good, {heard} is the same amount. The question wants {form}. Can you simplify {heard}?",
    "You found the right amount: {heard}. Now simplify it. The question asks for {form}.", "{heard} has the right value. What is {heard} in {form}?",
    "{heard} is the right amount. Let's write it in {form}.",
  ],
  "check.explain": [
    "How did you get {where}?", "Can you tell me how you did {where}?", "Show me how you worked out {where}.", "How did you work out {where}?",
    "Tell me what you did for {where}.", "What did you do in {where}?",
  ],

  // Asking for the child's thinking is a teaching move, so it is a code line, not warm talk (R374-5).
  "check.thinking": [
    "Tell me what you're thinking.", "Tell me how you thought about it.", "How did you work it out?", "What made you think of it?",
    "Tell me how you did it.", "I'm curious how you figured it out.", "How do you know?",
  ],
  // #605 (Savar 2026-11-06). The child's right final answer, said with doubt after Maya already asked "Did you say 66?":
  // a check of the first step comes next, never a third "Did you say". No math: the step line after it is code's.
  "check.together": [
    "That's okay. Let's check it together.", "It's okay to feel unsure. Let's check it together.",
    "No problem. We can check it together.", "That's fine. Let's check it one part at a time.",
    "That's alright. Let's check it together.",
  ],
  // A right answer the child says they guessed: no praise for the guess as understanding; one light check.
  "check.guess": [
    "Lucky guess? Let's check it together.", "A guess is a good start. Let's check it.",
    "Let's see if your guess works. We'll check it together.", "Okay, let's check that guess together.",
    "Guesses can be right! Let's check this one together.",
  ],
  "answer.right": [
    "Yes! {expr} = {answer}.", "That's right: {expr} = {answer}.", "You got it! {expr} = {answer}.", "Yes, {expr} = {answer}!",
    "Exactly! {expr} = {answer}.", "That's it: {expr} = {answer}.", "Well done! {expr} = {answer}.",
  ],
  "answer.give": [
    "The answer is {answer}. Please write {answer} on your paper.", "It's {answer}. Can you write {answer} on your paper?",
    "So the answer is {answer}. Please write {answer} on your paper.", "That makes {answer}. Can you write {answer} on your page?",
    "The answer is {answer}. Now write {answer} on your paper.",
  ],
  // How the parts make the answer (D-199): code says it before answer.give when it gives the answer on the final step,
  // after two wrong final answers once every column is done. Filled from the checked answer's digits by place, never
  // from the model. Savar approved the wording on 2026-11-01.
  "answer.parts": [
    "{parts} make {total}.", "Let's put the parts together: {parts} make {total}.", "Here's how the parts fit: {parts} make {total}.",
    "Put them together: {parts} make {total}.", "Look at the parts: {parts}. Together they make {total}.",
    "We have {parts}. Together they make {total}.",
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
  "confirm.answer": ["Can you say just your final answer?", "Thanks for explaining. What is your final answer on its own?"],
  "confirm.which": ["Did you say {heard} or {other}?", "Was that {heard} or {other}?", "I'm not sure. {heard} or {other}?", "Did I hear {heard}, or was it {other}?", "Was it {heard} or {other}?"],
  "input.other": [
    "You can write your answer on the board instead.", "If it's easier, write your number on the board.", "Try writing it on the board for me.",
    "You can also write it on the board.", "Would you like to write it on the board instead?",
  ],
  "redirect.workbook": ["I help with your Unica workbook. We can pick a question from it."],
  // The decline (#383, C29): for a request for sexual, violent or other harmful content. One fixed wording,
  // approved by Savar on 2026-11-01 (D-197). No detail, no echo of the request.
  "redirect.decline": ["I can't talk about this. I'm here to help with math."],
  "redirect.back": ["Let's get back to {expr}.", "Back to our question: {expr}.", "Let's keep going with {expr}.", "Now, back to {expr}.", "Let's return to {expr}.", "Okay, back to {expr}."],
  "close.solved": [
    "You worked out {expr} today!", "Great job on {expr} today!", "You solved {expr}. Well done!", "Nice work finishing {expr}!",
    "You did it: {expr} is done!", "Well done on {expr} today!",
  ],
  "close.checked": [
    "We checked your answer for {expr}. Bye for now!", "Your answer for {expr} is checked. See you next time!",
    "Your answer for {expr} is right. Bye for now!", "The answer you gave for {expr} is right. See you next time!",
    "We've checked your answer for {expr}. Goodbye for now!",
  ],
  // The honest close of an "other-topic" question left unsolved after the easier example (lessons from review 10,
  // controller decision (a)): this one is hard, it is fine to stop, and one next step. No number, so no hint at the
  // answer. Pending Savar's approval (D-202).
  "close.honest": [
    "This one is hard, and it's okay to stop. Try the easier one on paper, or ask a grown-up to help.",
    "This is a hard one. It's fine to stop here. You can ask a grown-up to try it with you.",
    "This one is hard. It's okay to stop for now. Try the easier one on your paper.",
    "That was a hard one, and stopping is okay. Ask a grown-up to look at it with you.",
    "This question is hard. It's fine to stop. Try the smaller one on paper first.",
  ],
  "close.together": [
    "We worked through {expr} together.", "We finished {expr} together today.", "We got through {expr} together.",
    "Together, we finished {expr}.", "We worked on {expr} together today.",
  ],
  "repair.sorry": [
    "Oops, I said that wrong. Let me fix it.", "Sorry, I made a mistake there. Here it is again.", "Wait, I mixed that up. Let me say it again.",
    "Oops, my mistake. Let me try again.", "Sorry, that came out wrong. Here's the right way.",
  ],
  // A held question (#605, Savar 2026-11-05): offer another question on the page, without an inability claim.
  // Code adds the AI disclosure only before the first hello. No alternate question is invented or promised.
  "held.hello": ["Hi, I'm Maya, an AI."],
  "held.next": ["Want to pick another question on this page?"],
  // Missing numbers (Wave A): the framing and the try-a-number lines, from their own modules.
  ...MISSING_TEMPLATES,
  ...TRIAL_TEMPLATES,
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
    case "common-denominator":
      return "the denominators";
    case "combine-numerators":
      return "the numerators";
    case "simplify":
      return "the simplest form";
    case "operate":
      return `${step.left} ${step.op} ${step.right}`;
    case "try-factor":
      return "the missing number";
    default:
      return "this step";
  }
}

/** The step's equation, as a line says it and the board writes it ("7 + 9 = 16"), or null for a step with none. */
function equationOf(step: WorkedStep, pkg: OperationPackage, problem: "target" | "example"): string | null {
  const part = partEquation(pkg, step, equationOf);
  if (part !== undefined) return part;
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
    // Fraction steps (#407): never the final fraction, so a judged step never gives the answer away.
    case "common-denominator": {
      const changed = changedFractions(step);
      return changed.length > 0 ? changed.map(([from, to]) => `${parts(from)} = ${parts(to)}`).join(" and ") : null;
    }
    case "combine-numerators":
      return `${step.numerators[0]} ${step.op === "add" ? "+" : "−"} ${step.numerators[1]} = ${step.numerator}`;
    case "simplify":
      return `${step.from.numerator} ÷ ${step.divisor} = ${step.to.numerator} and ${step.from.denominator} ÷ ${step.divisor} = ${step.to.denominator}`;
    case "try-factor":
      return trialEquation(step);
    default:
      return null;
  }
}

/** A fraction as written: "3/4". */
const parts = ({ numerator, denominator }: FractionParts) => `${numerator}/${denominator}`;

/** The fractions a common-denominator step changes, each with what it becomes and the factor ("3/4" to "6/8", by 2). */
function changedFractions(step: Extract<WorkedStep, { kind: "common-denominator" }>): [FractionParts, FractionParts, number][] {
  return step.from.flatMap((from, i): [FractionParts, FractionParts, number][] => (step.factors[i] > 1 ? [[from, step.to[i], step.factors[i]]] : []));
}

/**
 * A fraction step shown in words (#407), one idea a sentence (D-202), for H3 and the easier example: "Multiply the
 * numerator and the denominator of 3/4 by 2. 3/4 = 6/8." Never the final fraction: the child puts it together. Null for a
 * step that is not a fraction step.
 */
function fractionShow(step: WorkedStep): string | null {
  switch (step.kind) {
    case "common-denominator":
      return changedFractions(step).map(([from, to, factor], i) => (i === 0
        ? `Multiply the numerator and the denominator of ${parts(from)} by ${factor}. ${parts(from)} = ${parts(to)}.`
        : `Multiply ${parts(from)} by ${factor} the same way. ${parts(from)} = ${parts(to)}.`)).join(" ");
    case "combine-numerators": {
      const [a, b] = step.numerators;
      return step.op === "add"
        ? `Add the numerators: ${a} + ${b} = ${step.numerator}. The denominator stays ${step.denominator}.`
        : `Subtract the numerators: ${a} − ${b} = ${step.numerator}. The denominator stays ${step.denominator}.`;
    }
    case "simplify": {
      const { from, divisor: g, to } = step;
      return `Divide the numerator and the denominator by ${g}. ${from.numerator} ÷ ${g} = ${to.numerator}. ${from.denominator} ÷ ${g} = ${to.denominator}.`;
    }
    default:
      return null;
  }
}

/** A worked step in words: a fraction step as fractionShow says it, any other as the shared step text. */
const showOf = (step: WorkedStep, pkg: OperationPackage, problem: "target" | "example") =>
  partShow(step) ?? fractionShow(step) ?? (step.kind === "try-factor" && problem === "target" ? showTrial(step) : null)
  ?? stepText(step, problem === "target" ? pkg.operation : pkg.easierExample.operation);

/** The top number of a long multiplication as its rows work it: without its point (2.5 × 1.3 works 25 × 13). */
function rowTop(pkg: OperationPackage, problem: "target" | "example"): number {
  const op = problem === "target" ? pkg.operation : pkg.easierExample.operation;
  const a = op.operands[0] as number;
  const places = (String(a).split(".")[1] ?? "").length;
  return op.kind === "decimal-multiply" ? Math.round(a * 10 ** places) : a;
}

/** The help lines of one step of the child's question, by hint level: H0 invite, H1 point, H2 give the operation, H3 show. */
function stepLines(pkg: OperationPackage, step: WorkedStep, frameDue = false): LineOffer[] {
  const pattern = patternHelp(pkg, step.id, offer);
  if (pattern) return pattern;
  const part = partHelp(pkg, step, stepLines, offer);
  if (part) return part;
  const slots = { step: step.id };
  const where = whereOf(step);
  // A missing number's first work step says the framing first (missing-number.ts); a try step invites a try.
  const framed = framedLines(pkg.steps);
  const lead = framed && teachSteps(pkg)[0]?.id === step.id ? frameInvite(framed, where) : null;
  const trial = step.kind === "try-factor" ? trialHelp(step) : [];
  const out: LineOffer[] = [lead ? offer("step.invite", lead.key, lead.vars, { slots, level: 0 })
    : trial[0] ? trialOffer(trial[0], slots) : offer("step.invite", "step.invite", { where }, { slots, level: 0 })];
  const add = (line: LineId, key: TemplateKey, vars: Vars, level: 1 | 2, board?: string) =>
    out.push(offer(line, key, vars, { slots, level, ...(board ? { board } : {}) }));
  switch (step.kind) {
    case "add-column": {
      const { place, digits, carryIn } = step;
      const terms = [...digits, ...(carryIn > 0 ? [carryIn] : [])];
      const from = carryIn > 0 ? carrySource(pkg, step) : null;
      if (from) out.push(regroupOffer(pkg, from, { step: step.id }), whyOffer(from, { step: step.id }));
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
      const source = pkg.steps.find(s => s.kind === "subtract-column" && s.place === leftOf(place));
      if (regrouped && have >= 0 && source?.kind === "subtract-column") {
        const leftCount = source.top + (source.regrouped ? 10 : 0);
        if (leftCount > 0) add("step.why", "subtract.why", { ...vars, leftCount, leftAfter: leftCount - 1, leftPlace: source.place }, 2);
      }
      if (regrouped && have >= 0) add("step.order", "subtract.order", vars, 1);
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
    case "common-denominator": {
      const [x, y] = step.from;
      const changed = changedFractions(step);
      add("step.point", "point.common", { a: x.denominator, b: y.denominator }, 1);
      const [first, second] = changed.map(([from, , factor]) => ({ from: parts(from), factor }));
      if (first && second) add("step.operation", "operation.common.both", { d: step.denominator, from: first.from, factor: first.factor, from2: second.from, factor2: second.factor }, 2);
      else if (first) add("step.operation", "operation.common", { d: step.denominator, ...first }, 2);
      break;
    }
    case "combine-numerators": {
      const [a, b] = step.numerators;
      const sign = step.op === "add" ? "+" : "−";
      add("step.point", "point.combine", { a, b, d: step.denominator }, 1);
      add("step.operation", step.op === "add" ? "operation.combine.add" : "operation.combine.subtract", { a, b, d: step.denominator }, 2, `${a} ${sign} ${b}`);
      break;
    }
    case "simplify":
      out.push(...simplifyLines(step.from, slots));
      break;
    case "try-factor":
      out.push(...trial.slice(1).map((t) => trialOffer(t, slots)));
      break;
    default:
      break;
  }
  // A try step's equation holds the answer: its H3 shows the tries on each side, with no board note.
  const eq = step.kind === "try-factor" ? null : equationOf(step, pkg, "target");
  out.push(offer("step.show", "step.show", { show: showOf(step, pkg, "target") }, { slots, level: 3, ...(eq ? { board: eq } : {}) }));
  if (!lead || !framed) return out;
  // A missing number's first step: why it does what it does (step.why), and, while Maya has not said the framing yet
  // (frameDue), every hint after the invite starts with it, so the first hint said at any level carries it.
  const why = frameWhy(framed);
  out.push(offer("step.why", why.key, why.vars, { slots, level: 1 }));
  if (!frameDue) return out;
  const before = frameLead(framed);
  return out.map((o) => ((o.level ?? 0) >= 1 ? { ...o, texts: o.texts.map((t) => `${before} ${t}`) } : o));
}

/**
 * The H1 and H2 lines to simplify a fraction (#407): "Find a number that divides both 14 and 16." and "Divide the
 * numerator and the denominator by 2.", by the greatest number that divides both. None for a fraction already in lowest
 * terms.
 */
function simplifyLines(from: FractionParts, slots: Slots): LineOffer[] {
  const g = gcd(from.numerator, from.denominator);
  if (g <= 1) return [];
  const vars = { n: from.numerator, d: from.denominator, g };
  return [offer("step.point", "point.simplify", vars, { slots, level: 1 }), offer("step.operation", "operation.simplify", vars, { slots, level: 2 })];
}

/** A try line as an offer (trial-factor.ts): a help line at its level, or a not-yet line that needs its wrong try checked. */
function trialOffer(t: TrialLine, slots: Slots): LineOffer {
  if (t.heard === undefined) return offer(t.line, t.key, t.vars, { slots, level: t.level });
  const s = { ...slots, heard: t.heard };
  return offer(t.line, t.key, t.vars, { slots: s, requires: { answer: "wrong", step: slots.step!, heard: t.heard } });
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/** The column of an addition whose sum makes the carry a column takes ("ones" for the tens of 27 + 39), or null. */
function carrySource(pkg: OperationPackage, step: Extract<WorkedStep, { kind: "add-column" }>): Extract<WorkedStep, { kind: "add-column" }> | null {
  const columns = pkg.steps.filter((s): s is Extract<WorkedStep, { kind: "add-column" }> => s.kind === "add-column");
  const before = columns[columns.findIndex((s) => s.id === step.id) - 1];
  return before && before.carryOut > 0 && before.carryOut === step.carryIn ? before : null;
}

/**
 * The regroup line of a carry (step.regroup, H1), filled from the column whose sum makes it: "7 + 9 = 16. 16 is 1 ten
 * and 6 ones. Write 6 in the ones. Carry 1 ten to the tens."
 */
function regroupOffer(pkg: OperationPackage, from: Extract<WorkedStep, { kind: "add-column" }>, slots: Slots): LineOffer {
  const to = leftOf(from.place);
  const eq = equationOf(from, pkg, "target") ?? `${from.total}`;
  const vars = {
    eq, total: from.total, carry: from.carryOut, big: from.carryOut === 1 ? UNIT[to] : to, write: from.write,
    small: from.write === 1 ? UNIT[from.place] : from.place, from: from.place, to,
  };
  return offer("step.regroup", "regroup.add", vars, { slots, level: 1, board: eq });
}

/** The second way to say where a carry comes from (step.why, H1, #605), from the same column as regroupOffer. */
function whyOffer(from: Extract<WorkedStep, { kind: "add-column" }>, slots: Slots): LineOffer {
  const to = leftOf(from.place);
  const vars = {
    total: from.total, carry: from.carryOut, big: from.carryOut === 1 ? UNIT[to] : to, unit: UNIT[to], write: from.write,
    small: from.write === 1 ? UNIT[from.place] : from.place, from: from.place, to,
  };
  return offer("step.why", "regroup.why", vars, { slots, level: 1 });
}

/**
 * The answer's digits by place, highest first, and the number they make (D-199): "6 tens and 6 ones" make 66, "3 ones,
 * 2 tenths and 5 hundredths" make 3.25, and for 21 R 1 the quotient's "2 tens and 1 one" make 21. They are the digits
 * the done columns wrote in the answer row. Null for an answer with fewer than two places (nothing to put together), a
 * negative one, a fraction, or more places than the place names.
 */
function placeParts(value: AnswerValue): { parts: string; total: string } | null {
  const n = value.type === "number" ? value.value : value.type === "remainder" ? value.quotient : null;
  if (n === null || !Number.isFinite(n) || n < 0) return null;
  const total = String(n);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(total);
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  const ones = PLACE_ORDER.indexOf("ones");
  const digits = [
    // A whole part of 0 before a point has no parts to name ("8 tenths and 5 hundredths" make 0.85).
    ...(whole === "0" && fraction !== "" ? [] : [...whole].map((d, i) => [Number(d), PLACE_ORDER[ones + whole.length - 1 - i]] as const)),
    ...[...fraction].map((d, i) => [Number(d), PLACE_ORDER[ones - 1 - i]] as const),
  ];
  if (digits.length < 2 || digits.some(([, place]) => place === undefined)) return null;
  const named = digits.map(([d, place]) => `${d} ${d === 1 ? UNIT[place] : place}`);
  return { parts: `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`, total };
}

/** The sentences of a question text, each with its own end mark. */
const sentencesOf = (text: string) => text.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);

/** Controller-owned opening. Only checked operation data is read aloud, never arbitrary workbook prose. */
export function workbookOpening(pkg: OperationPackage): string | null {
  return pkg.ref.source === "workbook" ? (patternOf(pkg) ? PATTERN_OPENING : WORKBOOK_OPENING)
    .replace("{page}", String(pkg.ref.page)).replace("{number}", String(pkg.ref.question)).replace("{expr}", questionExpr(pkg)) : null;
}

/** The question as Maya names it: a missing number's printed equation ("30 × ? = 16200"), else its operation. */
const questionExpr = (pkg: OperationPackage) => framedLines(pkg.steps)?.printed ?? evaluateFrame(pkg)?.printed ?? operationText(pkg.operation);

/**
 * One fixed confirmation, outside the model's selectable wordings. It never carries an "other-topic" topic sentence
 * (topic-frame.ts): with it the opening passes a 25-word turn; the question and assess lines say it next.
 */
export const WORKBOOK_OPENING = "Hi, I'm Maya, an AI helper. Let's do page {page}, number {number}: {expr}.";

/**
 * The lines of one checked question package, by situation. The session picks the ones an act may use now; every line
 * is filled from the package's checked numbers and steps.
 */
export function packageLines(given: OperationPackage) {
  const pkg = withEvaluateExample(given);
  const framed: FramedLines | null = framedLines(pkg.steps);
  const expr = questionExpr(pkg);
  const asked = patternOf(pkg) ? (patternOf(pkg)!.missing ? "the missing step" : "the pattern") : evaluateFrame(pkg)?.printed ?? expr;
  const solved = framed?.inverse ?? operationText(pkg.operation);
  const exampleExpr = framedLines(pkg.easierExample.steps)?.printed ?? operationText(pkg.easierExample.operation);
  const frame = topicFrame(pkg.text, pkg.operation);
  const exampleFrame = frame ? topicFrame(pkg.easierExample.text, pkg.easierExample.operation) : null;
  const answer = valueText(pkg.answer.value);
  const steps = teachSteps(pkg);
  const find = (id: string) => steps.find((s) => s.id === id);
  return {
    hello: (): LineOffer[] => [offer("open.hello", "open.hello", {})],
    question: (): LineOffer[] => [
      frame ? offer("question.problem", "question.framed", { frame, expr }, { slots: {}, board: expr }) : offer("question.problem", "question.problem", { expr: asked }, { slots: {}, board: asked }),
      ...sentencesOf(pkg.text).map((s, i) => offer("question.read", "question.read", { sentence: s }, { slots: { sentence: i } })),
    ],
    assess: (): LineOffer[] => [frame ? offer("assess.ask", "assess.framed", { frame, expr }) : offer("assess.ask", "assess.ask", { expr: asked })],
    exampleIntro: (): LineOffer[] => [exampleFrame
      ? offer("example.intro", "example.framed", { frame: exampleFrame, expr: exampleExpr }, { slots: {}, board: exampleExpr })
      : offer("example.intro", patternOf(pkg) ? "pattern.example" : "example.intro", { expr: exampleExpr }, { slots: {}, board: exampleExpr })],
    /** Maya works one step of the easier example. */
    exampleStep: (id: string): LineOffer[] => {
      const step = pkg.easierExample.steps.find((s) => s.id === id);
      if (!step) return [];
      const show = patternExampleShow(pkg, step) ?? showOf(step, pkg, "example");
      const eq = equationOf(step, pkg, "example");
      return [offer("example.step", step.kind === "result" ? "example.result" : "example.step", { show }, { slots: { step: id }, ...(eq ? { board: eq } : {}) })];
    },
    tryTarget: (): LineOffer[] => [framed
      ? offer("try.target", "try.target.frame", { expr, inverse: framed.inverse }, { slots: {}, board: expr })
      : offer("try.target", patternOf(pkg) ? "pattern.try" : "try.target", { expr: asked }, { slots: {}, board: asked })],
    /**
     * The help lines of the child's question's step, H0 to H3. The final step ("result", once every work step is done)
     * has one line, an H0 invite to put the whole answer together (#389).
     */
    help: (id: string, frameDue = false): LineOffer[] => {
      if (id === "result" && patternOf(pkg)) return patternHelp(pkg, id, offer)!;
      if (id === "result") return [offer("step.invite", "invite.result", { expr: solved }, { slots: { step: "result" }, level: 0 })];
      const step = find(id);
      return step ? stepLines(pkg, step, frameDue) : [];
    },
    /**
     * The regroup line of the column a carry comes from (the ones of 27 + 39), for a child who plans to write its
     * two-digit sum in it ("I write 16 under the ones"). Its slots name the column and "carry", so it differs from the
     * regroup line of a column that takes a carry. Empty for a column with no carry.
     */
    regroupOut: (id: string): LineOffer[] => {
      const columns = pkg.steps.filter((s): s is Extract<WorkedStep, { kind: "add-column" }> => s.kind === "add-column");
      const at = columns.findIndex((s) => s.id === id);
      const next = columns[at + 1];
      return at >= 0 && next && carrySource(pkg, next) ? [regroupOffer(pkg, columns[at], { step: id, other: "carry" })] : [];
    },
    /** "Yes! 7 + 9 = 16.": only after code checked the child's right answer for that step. */
    rightStep: (id: string): LineOffer[] => {
      const step = find(id);
      if (!step) return [];
      const requires = { answer: "right" as const, step: id };
      // A right try is the answer itself: said back without the number until the child gives it as the answer.
      if (step.kind === "try-factor") {
        const t = trialRight(step);
        return [offer(t.line, t.key, t.vars, { slots: { step: id }, requires })];
      }
      const eq = equationOf(step, pkg, "target");
      return [eq
        ? offer("check.right_step", "check.right_step", { eq }, { slots: { step: id }, requires, board: eq })
        : offer("check.right_step", "check.right_step.plain", { Where: capital(whereOf(step)), where: whereOf(step) }, { slots: { step: id }, requires })];
    },
    /** "Not quite.": only after code checked the child's wrong answer for that step. */
    notYet: (id: string): LineOffer[] => {
      // A wrong try is multiplied out ("236 × 7 = 1652. ..."): on a try step, and on the final answer when the try
      // finds the answer itself (a missing factor).
      const trial = id === "result" ? (framed?.trial ?? null) : steps.find((s) => s.id === id && s.kind === "try-factor") ?? null;
      const tries = trial?.kind === "try-factor" && (id !== "result" || trial.value === (pkg.answer.value.type === "number" ? pkg.answer.value.value : null))
        ? trialFeedback(trial).map((t) => trialOffer(t, { step: id })) : [];
      if (id === "result") return [offer("check.not_yet", "check.not_yet", { where: "this answer" }, { slots: { step: id }, requires: { answer: "wrong", step: id } }), ...tries];
      const step = find(id);
      return step ? [offer("check.not_yet", "check.not_yet", { where: whereOf(step) }, { slots: { step: id }, requires: { answer: "wrong", step: id } }), ...tries] : [];
    },
    // An evaluate question asks about its parts, never one column of a part ("the ones" of which part?).
    explain: (): LineOffer[] => steps.filter((s) => !partAt(pkg, s.id)?.inner).map((s) => offer("check.explain", "check.explain", { where: whereOf(s) }, { slots: { step: s.id } })),
    /** A check of the child's own right answer said with doubt (#605): a lead-in to the first step's line. */
    together: (): LineOffer[] => [offer("check.together", "check.together", {})],
    /** A check of a right answer the child says they guessed (#605). */
    guess: (): LineOffer[] => [offer("check.guess", "check.guess", {})],
    thinking: (): LineOffer[] => [offer("check.thinking", "check.thinking", {})],
    /** "Yes! 3/4 + 1/8 = 7/8.", in the form the child gave when it is an equal form code accepted ("= 14/16", #407). */
    answerRight: (form: AnswerValue = pkg.answer.value): LineOffer[] => {
      const said = valueText(form);
      return [offer("answer.right", patternOf(pkg) ? "pattern.answer" : "answer.right", { expr: solved, answer: said }, { slots: {}, board: `${solved} = ${said}` })];
    },
    answerGive: (): LineOffer[] => [offer("answer.give", "answer.give", { answer })],
    /** How the parts make the answer ("6 tens and 6 ones make 66."), said before answer.give on the final step (D-199). */
    answerParts: (): LineOffer[] => {
      const parts = placeParts(pkg.answer.value);
      return parts ? [offer("answer.parts", "answer.parts", parts)] : [];
    },
    writeAnswer: (form: AnswerValue = pkg.answer.value): LineOffer[] => [offer("write.answer", "write.answer", { answer: valueText(form) })],
    /**
     * An equal fraction when the question asks for the simplest form (#407): "14/16 is the right amount. The question
     * asks for simplest form. Can you simplify it?", only after code checked the child's final answer as that equal form.
     */
    equal: (form: AnswerValue, words: string): LineOffer[] =>
      [offer("check.equal", "check.equal", { heard: valueText(form), form: words }, { slots: { step: "result", heard: valueText(form) }, requires: { answer: "equal", step: "result", heard: valueText(form) } })],
    /** The H1 and H2 help to simplify the child's own equal fraction, on the final step (#407). */
    simplifyOwn: (form: AnswerValue): LineOffer[] =>
      (form.type === "fraction" || form.type === "mixed" ? simplifyLines(form, { step: "result" }) : []),
    writeYours: (): LineOffer[] => [offer("write.yours", "write.yours", {})],
    /** "Did you say 15?" for each number Maya may have heard, and "15 or 50?" for each pair that sound alike. */
    heard: (values: readonly AnswerValue[], pairs: readonly [AnswerValue, AnswerValue][]): LineOffer[] => [
      ...unique(values.map(valueText)).map((heard) => offer("confirm.heard", "confirm.heard", { heard }, { slots: { heard } })),
      ...unique(pairs.map(([a, b]) => `${valueText(a)}\n${valueText(b)}`)).map((p) => {
        const [heard, other] = p.split("\n");
        return offer("confirm.which", "confirm.which", { heard, other }, { slots: { heard, other } });
      }),
    ],
    answerOnly: (): LineOffer[] => [offer("confirm.answer", "confirm.answer", {})],
    otherInput: (): LineOffer[] => [offer("input.other", "input.other", {})],
    redirect: (): LineOffer[] => [offer("redirect.back", "redirect.back", { expr: asked })],
    workbook: (): LineOffer[] => [offer("redirect.workbook", "redirect.workbook", {})],
    decline: (): LineOffer[] => [offer("redirect.decline", "redirect.decline", {})],
    /** The honest close of a pattern the child is still stuck on (pattern-lines.ts). */
    patternClose: (): LineOffer[] => patternClose(pkg, offer),
    /** A pattern step's top help level, or null for any other kind (pattern-lines.ts). */
    patternTop: (id: string): number | null => patternTopHint(pkg, id, offer),
    closeSolved: (by: "child" | "maya", workObserved = true): LineOffer[] => [by === "child" ? offer("close.solved", workObserved ? "close.solved" : "close.checked", { expr: asked }) : offer("close.together", "close.together", { expr: asked })],
    /** The honest close of an "other-topic" question left unsolved after the easier example: never the answer. */
    closeHonest: (): LineOffer[] => (frame ? [offer("close.together", "close.honest", {})] : []),
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
export function allLineTexts(given: OperationPackage, heardValues: readonly AnswerValue[] = []): string[] {
  const pkg = withEvaluateExample(given);
  const l = packageLines(pkg);
  const heard = [...new Map(heardValues.map((v) => [valueText(v), v])).values()];
  // An equal fraction the child said (14/16 for 7/8, #407): said back as accepted, or as an equal form to simplify.
  const equalForms = heard.filter((v) => (v.type === "fraction" || v.type === "mixed") && equivalent(v, pkg.answer.value) && !sameValue(v, pkg.answer.value));
  const offers = [
    ...equalForms.flatMap((v) => [...l.answerRight(v), ...l.writeAnswer(v), ...l.equal(v, simplestWords(pkg)), ...l.simplifyOwn(v)]),
    ...l.hello(), ...l.question(), ...l.assess(), ...l.exampleIntro(), ...pkg.easierExample.steps.flatMap((s) => l.exampleStep(s.id)),
    ...l.tryTarget(), ...l.stepIds.flatMap((id) => [...l.help(id), ...l.help(id, true), ...l.regroupOut(id), ...l.rightStep(id), ...l.notYet(id)]), ...l.help("result"), ...l.notYet("result"), ...l.explain(),
    ...l.thinking(), ...l.answerRight(), ...l.answerGive(), ...l.answerParts(), ...l.writeAnswer(), ...l.writeYours(), ...l.heard(heard, heard.flatMap((a) => heard.map((b) => [a, b] as [AnswerValue, AnswerValue]))),
    ...l.answerOnly(), ...l.otherInput(), ...l.redirect(), ...l.workbook(), ...l.decline(), ...l.closeSolved("child"), ...l.closeSolved("child", false), ...l.closeSolved("maya"), ...l.closeHonest(), ...l.repair(),
    ...l.together(), ...l.guess(), ...l.patternClose(),
  ];
  const extra = [...fixedOffers(), ...areaOffers(pkg), ...heldOffers(true)];
  return [...new Set([...offers, ...offers.map(spokenOffer), ...extra].flatMap((o) => o.texts.map(sentence)))];
}

/**
 * Maya's whole turn on a question she cannot teach yet (#527): hello and that she is an AI when she has not said hello
 * yet, then an invitation to pick another question on the page. Needs no package.
 */
export function heldOffers(hello: boolean): LineOffer[] {
  return [...(hello ? [offer("held.hello", "held.hello", {})] : []), offer("held.next", "held.next", {})];
}

/** The held turn's sentences, as Maya says them and as the desk shows them before a chat. */
export function heldSentences(hello: boolean): string[] {
  return heldOffers(hello).map((o) => o.texts[0]);
}

/** Fixed replies. Each reply is its own turn so the grade 1 limit also holds. */
export function fixedOffers(): LineOffer[] {
  return [offer("about.ai", "about.ai", {}), offer("about.no_secret", "about.no_secret", {}), offer("shorter.prompt", "shorter.prompt", {})];
}

/** Area units come from the checked package, never from the model. */
export function areaOffers(pkg: OperationPackage): LineOffer[] {
  const units: Record<string, string> = { "mm²": "square millimetres", "cm²": "square centimetres", "m²": "square metres", "km²": "square kilometres" };
  const unit = units[pkg.answer.unit ?? ""];
  return unit ? [offer("answer.area", "answer.area", { answer: valueText(pkg.answer.value), unit })] : [];
}

/** Spoken versions keep the same checked math and require no visual action. */
export function spokenOffer(o: LineOffer): LineOffer {
  if (o.line === "input.other") return offer("input.other", "input.spoken", {});
  const keep = o.texts.map((_, i) => i).filter((i) => !/\b(?:look|watch|see|show me|follow along|find|bring down|write|put|on top|below|underneath|at the bottom)\b/i.test(o.texts[i]));
  // An equation says the same checked step aloud when every wording needs a visual action.
  if (keep.length) return { ...o, texts: keep.map((i) => o.texts[i]), wordingIds: keep.map((i) => `${o.key}#${i}`) };
  if (o.board) return { ...o, texts: [`${o.board}.`], wordingIds: [`spoken:${o.key}:${o.slots.step ?? ""}#0`] };
  const safe = o.texts.map((_, i) => i).filter((i) => !/\b(?:board|look|watch|see|show me|follow along)\b/i.test(o.texts[i]));
  return { ...o, texts: safe.map((i) => o.texts[i]), wordingIds: safe.map((i) => `${o.key}#${i}`) };
}
