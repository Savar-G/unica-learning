import { plainNumber, saysGuess, wholeTurn, wholeValue } from "./numbers";

// Code's reads of a child turn in a checked regrouping lesson (#1143, #1153): what the child asks for, what they show
// they know, and the specific mistakes the lesson answers. Subtraction trades a ten for ten ones; addition trades ten
// ones for a ten and carries it.

export type LessonKind = "subtract" | "add";

const EXCHANGE_REQUEST = /^(?:(?:can|could|would) you (?:show|tell) me |(?:please )?show me )?(?:how (?:do (?:i|we) |to )?|why (?:do (?:i|we) |to )?)?(?:regroup(?:ing)?|borrow(?:ing)?|(?:trade|exchange) (?:a|one|1) ten)(?: again)?[.?!]*$/i;
const ADD_EXCHANGE_REQUEST = /^(?:(?:can|could|would) you (?:show|tell) me |(?:please )?show me )?(?:how (?:do (?:i|we) |to )?|why (?:do (?:i|we) |to )?)?(?:regroup(?:ing)?|carry(?:ing)?(?: (?:the|a) (?:one|1|ten))?|(?:trade|exchange) (?:10|ten) ones)(?: again)?[.?!]*$/i;
const CHILD_EXCHANGE_REQUEST = /^(?:how do (?:i|we) (?:regroup|borrow|(?:trade|exchange) (?:a|one|1) ten)|(?:can i|i want to) (?:try regrouping|(?:trade|exchange) (?:a|one|1) ten))(?: again)?[.?!]*$/i;
const ADD_CHILD_EXCHANGE_REQUEST = /^(?:how do (?:i|we) (?:regroup|carry(?: (?:the|a) (?:one|1|ten))?|(?:trade|exchange) (?:10|ten) ones)|(?:can i|i want to) (?:try regrouping|(?:trade|exchange) (?:10|ten) ones))(?: again)?[.?!]*$/i;
const HELP = /^(?:i need help|can you help me|i (?:don't|do not) know how to start)[.?!]*$/i;
const START = /^(?:i (?:still )?(?:don'?t|do not) (?:know(?: how to (?:start|regroup|borrow|subtract))?|get it|understand(?: (?:regrouping|borrowing|subtraction))?)|i(?:'m| am) (?:still )?(?:stuck|confused|new to (?:regrouping|borrowing|subtraction))|i(?:'ve| have) never (?:regrouped|done this before)|(?:can you )?(?:teach me|explain) how to (?:regroup|borrow|subtract))[.?!]*$/i;
const ADD_START = /^(?:i (?:still )?(?:don'?t|do not) (?:know how to (?:add|carry)|understand (?:carrying|addition))|i(?:'m| am) (?:still )?new to (?:carrying|addition)|i(?:'ve| have) never carried|(?:can you )?(?:teach me|explain) how to (?:add|carry))[.?!]*$/i;
const KNOWS_EXCHANGE = /^(?:i (?:can|would|will) |i'll |we can )?(?:trade|exchange|swap|break|regroup) (?:a|one|1) ten(?: (?:rod|block))? (?:for|into|to) (?:10|ten) ones$/;
const KNOWS_CARRY = /^(?:i (?:can|would|will) |i'll |we can )?(?:(?:trade|exchange|swap|group|regroup|change|make) (?:10|ten) ones(?: cubes)? (?:for|into|to) (?:a|one|1) ten(?: (?:rod|block))?(?: and carry it)?|carry (?:the|a) (?:one|1|ten)(?: to the tens)?)$/;
const REPEAT = /^(?:what did you say|(?:can|could) you repeat (?:that|it)|(?:say|explain) that again)[.?!]*$/i;

/** The child asks Maya to show the exchange. */
export const asksExchange = (kind: LessonKind, text: string) => (kind === "add" ? ADD_EXCHANGE_REQUEST : EXCHANGE_REQUEST).test(text);
/** The child asks to make the exchange themselves. */
export const asksChildExchange = (kind: LessonKind, text: string) => (kind === "add" ? ADD_CHILD_EXCHANGE_REQUEST : CHILD_EXCHANGE_REQUEST).test(text);
/** A general request for help. */
export const asksHelp = (text: string) => HELP.test(text);
/** The child says the lesson's idea is new or unclear. */
export const regroupingStart = (kind: LessonKind, text: string) => START.test(text) || (kind === "add" && ADD_START.test(text));
/** The child's whole turn (`wholeTurn`) says the exchange in its own words. */
export const knowsExchange = (kind: LessonKind, body: string) => (kind === "add" ? KNOWS_CARRY : KNOWS_EXCHANGE).test(body);
export const asksRepeat = (text: string) => REPEAT.test(text);
/** The turn names the whole answer ("my answer"), so a column question does not hold it. */
export const namesWhole = (text: string) => /\b(?:my (?:final )?answer|(?:whole|final) (?:answer|difference|sum))\b/i.test(text);

/** A column count the turn says alone ("4 ones", "there are 4 tens"), or null. */
export function columnCount(body: string | null, place: "one" | "ten"): number | null {
  return body === null ? null : wholeValue(body.replace(/^(?:there (?:are|is)|i have) /, "").replace(new RegExp(` ${place}s?$`), ""));
}

/** The subtraction reversal: "2 minus 8 is 6", "I swapped 2 and 8", "I took 2 away from 8" (the ones digits swapped). */
export function regroupingReversal(text: string, top: number, bottom: number): boolean {
  const body = wholeTurn(text);
  if (!body || saysGuess(text)) return false;
  const prefix = /^(?:(?:my (?:final )?answer is |i got )?([\w -]+) because )/.exec(body);
  if (prefix && plainNumber(prefix[1]) === null) return false;
  const reason = body.slice(prefix?.[0].length ?? 0);
  const topOnes = top % 10;
  const bottomOnes = bottom % 10;
  const sameDigits = (a: number | null, b: number | null) =>
    (a === topOnes && b === bottomOnes) || (a === bottomOnes && b === topOnes);
  const equation = /^([\w -]+?)\s*(?:minus|take away|-)\s*([\w -]+?)\s*(?:is|equals|makes|=)\s*([\w -]+)$/.exec(reason);
  if (equation) {
    const [, left, right, difference] = equation;
    return sameDigits(plainNumber(left), plainNumber(right)) && plainNumber(difference) === bottomOnes - topOnes;
  }
  const swapped = /^(?:(?:i|we) )?(?:swapped|switched|reversed) (?:the )?([\w -]+?) and (?:the )?([\w -]+)$/.exec(reason);
  if (swapped) return sameDigits(plainNumber(swapped[1]), plainNumber(swapped[2]));
  const from = /^(?:(?:i|we) )?(?:took (?:the )?([\w -]+?) away|subtracted (?:the )?([\w -]+?)) from (?:the )?([\w -]+)$/.exec(reason);
  return !!from && plainNumber(from[1] ?? from[2]) === topOnes && plainNumber(from[3]) === bottomOnes;
}

export type CarryMistake = "forgot_carry" | "both_digits";

/**
 * The addition carry mistakes, read from a whole committed number: the carried ten left out (73 for 38 + 45), or the
 * whole ones total written in the ones place (713). A guess or any other form is no read.
 */
export function carryMistake(text: string, top: number, bottom: number): CarryMistake | null {
  const body = wholeTurn(text);
  if (!body || saysGuess(text)) return null;
  const said = wholeValue(body.replace(/^(?:my (?:final )?answer is|i got|it'?s|it is) /, ""));
  const tens = Math.floor(top / 10) + Math.floor(bottom / 10);
  const ones = top % 10 + bottom % 10;
  if (said === null || ones < 10) return null;
  if (said === tens * 10 + ones - 10) return "forgot_carry";
  return said === tens * 100 + ones ? "both_digits" : null;
}
