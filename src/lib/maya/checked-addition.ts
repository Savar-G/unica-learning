import type { Command } from "@/lib/board";
import type { OperationPackage } from "@/lib/question-package";
import type { CarryMistake } from "./regrouping-reads";

// #1153 (spec #1137, section 3): addition with regrouping as a checked lesson. For 38 + 45 the ones make thirteen ones;
// ten of them are exchanged for one ten, and that ten is carried to the tens column. Every quantity here comes from
// checked facts: the exchange keeps the ones total (13 ones = 1 ten and 3 ones), and no sentence or board note names
// the sum, so the child adds the columns.

/** The thirteen ones the child exchanges. A separate id from subtraction's, so the screen names the right move. */
export const ADD_EXCHANGE_OBJECT = "exchange-ones";

interface Amounts {
  tens: number;
  ones: number;
}

/** The checked facts of one exchange in an addition: the ones total before it, and a ten with the ones left after it. */
export interface AdditionFacts {
  value: number;
  add: number;
  before: Amounts;
  after: Amounts;
  example: boolean;
}

/** Two 2-digit addends whose ones make one ten and whose sum has no hundreds; null otherwise. */
export function additionFacts(top: number, add: number, example: boolean): AdditionFacts | null {
  const whole = (n: number) => Number.isInteger(n) && n >= 10 && n <= 99;
  if (!whole(top) || !whole(add) || top + add > 99) return null;
  const ones = top % 10 + add % 10;
  if (ones < 10) return null;
  const before = { tens: 0, ones };
  const after = { tens: 1, ones: ones - 10 };
  if (10 * before.tens + before.ones !== 10 * after.tens + after.ones) return null;
  return { value: top, add, before, after, example };
}

export function supportsCheckedAddition(pkg: OperationPackage): boolean {
  if (pkg.operation.kind !== "add" || pkg.answer.value.type !== "number" || pkg.answer.unit !== null) return false;
  const [top, add] = pkg.operation.operands;
  return pkg.operation.operands.length === 2 && additionFacts(top, add, false) !== null && pkg.answer.value.value === top + add;
}

/** Worked examples, in order, for a question whose own numbers would give its answer away. */
export const ADDITION_EXAMPLES: readonly [number, number][] = [[38, 45], [27, 46], [36, 58], [47, 25]];

/** Related questions (#1144's pattern): each needs one exchange of ten ones, as 38 + 45 does (27 + 46 first). */
export const ADDITION_TRANSFERS: readonly [number, number][] = [[27, 46], [36, 58], [47, 25], [58, 27], [16, 68], [38, 45], [29, 53]];

const ones = (n: number) => `${n} ${n === 1 ? "one" : "ones"}`;
const parts = ({ value, add }: AdditionFacts) => ({ top: value % 10, bottom: add % 10, tens: [Math.floor(value / 10), Math.floor(add / 10)] });

export const additionShowWords = (facts: AdditionFacts) => {
  const { top, bottom } = parts(facts);
  return `${ones(top)} and ${ones(bottom)} make ${ones(facts.before.ones)}.`;
};

const resultWords = (facts: AdditionFacts) => `Now we have 1 ten and ${ones(facts.after.ones)}, which is still ${ones(facts.before.ones)}.`;
const ONES_LEFT = "How many ones are left to write in the ones place?";

/** The plain demonstration: the exchange and the carried ten, then the ones the child writes. */
export function additionExchangeWords(facts: AdditionFacts, show: boolean): string[] {
  return [
    ...(show ? [`${facts.example ? "Use a separate example: " : ""}${additionShowWords(facts)}`] : []),
    "Trade 10 ones for 1 ten.",
    resultWords(facts),
    `Carry the new ten to the tens column. ${facts.example ? "Try the same trade on your own question." : ONES_LEFT}`,
  ];
}

export function additionPromptWords(facts: AdditionFacts, show: boolean): string[] {
  return [...(show ? [additionShowWords(facts)] : []), "Trade ten ones for one ten. Use the Exchange ten ones button on the board."];
}

export function additionChildWords(facts: AdditionFacts): string[] {
  return [resultWords(facts), "Where does the new ten go?"];
}

export type AdditionStep = "check_place" | "check_exchange" | "independent" | "guide_exchange" | "place_gap" | CarryMistake |
  "connect" | "ones" | "tens" | "recheck_tens" | "combine" | "correct" | "offer" | "decline" | "transfer" | "transfer_retry" | "transfer_correct";

/**
 * Code-owned words of an addition step. `addend` names the second addend's tens; it is omitted when that would give the
 * sum away. `related` is the related question, already checked against these facts.
 */
export function additionWords(facts: AdditionFacts, step: string, show: boolean, placeTerms: boolean, addend: boolean,
  related: [number, number] | null, offer: string, goodbye: string): string[] | null {
  const { top, bottom, tens } = parts(facts);
  const tensWords = addend
    ? `Now add the tens: ${tens[0]} tens, ${tens[1]} tens and the 1 ten you carried. How many tens?`
    : "Now add the tens and the 1 ten you carried. How many tens?";
  switch (step) {
    case "check_place":
      return [placeTerms
        ? `Add the ones digits of ${facts.value} and ${facts.add}. How many ones is that?`
        : `Start with the ones. How many ones do ${ones(top)} and ${ones(bottom)} make?`];
    case "check_exchange":
      return [placeTerms
        ? "The ones make more than 9. What can you exchange to regroup the ones?"
        : "The ones make more than 9, which is too many ones for one place. What can you trade?"];
    case "independent":
      return ["Try the whole addition on your own."];
    case "forgot_carry":
    case "both_digits":
    case "place_gap":
    case "guide_exchange":
      return [
        ...(step === "forgot_carry" ? ["The ten you made from the ones still counts in the tens."] : []),
        ...(step === "both_digits" ? ["Only one digit fits in each place. That is too many ones for the ones place."] : []),
        ...(show || step === "place_gap" ? [additionShowWords(facts)] : []),
        "We can trade ten ones for one ten and keep the same amount.",
        "Use the Exchange ten ones button to make the trade.",
      ];
    case "connect":
      return [
        resultWords(facts),
        placeTerms ? "Carry the new ten to the tens column, where it is worth 10." : "Carry the new ten to the tens column. Write a small 1 above the tens.",
        facts.example ? "Try the same trade on your own question." : ONES_LEFT,
      ];
    case "ones":
      return [`Ten of the ${ones(facts.before.ones)} make the carried ten.`, ONES_LEFT];
    case "tens":
      return [tensWords];
    case "recheck_tens":
      return ["The carried ten still counts in the tens column.", tensWords];
    case "combine":
      return ["Put your tens and ones together. What is the whole sum?"];
    case "correct":
      return ["You found the sum."];
    case "offer":
      return ["You found the sum.", offer];
    case "decline":
      return [`Okay. ${goodbye}`];
    case "transfer":
      return related ? [`Here is one more: ${related[0]} plus ${related[1]}.`, "Try it on your own. What is the sum?"] : null;
    case "transfer_retry":
      return related ? [`Try ${related[0]} plus ${related[1]} again. What is the sum?`] : null;
    case "transfer_correct":
      return related ? [`You found the sum. ${goodbye}`] : null;
    default:
      return null;
  }
}

/** The board: thirteen ones with their sum, then 1 ten and 3 ones with the same value and the carried ten named. */
export function additionCommands(action: "show" | "exchange", facts: AdditionFacts): Command[] {
  const { top, bottom } = parts(facts);
  if (action === "show") return [
    { op: "model", id: ADD_EXCHANGE_OBJECT, model: { kind: "base_ten", hundreds: 0, ...facts.before }, place: { region: "main" } },
    { op: "write", id: "exchange-ones-notation", text: `${top} + ${bottom} = ${facts.before.ones}`, place: { below: ADD_EXCHANGE_OBJECT } },
    { op: "focus", target: { objectId: ADD_EXCHANGE_OBJECT, part: "piece", piece: "ones" } },
  ];
  return [
    { op: "remove", objectId: "exchange-ones-notation" },
    { op: "remove", objectId: ADD_EXCHANGE_OBJECT },
    { op: "model", id: "exchange-ten", model: { kind: "base_ten", hundreds: 0, ...facts.after }, place: { region: "main" } },
    { op: "write", id: "exchange-ten-notation", text: `${facts.before.ones} = 10 + ${facts.after.ones}`, place: { below: "exchange-ten" } },
    {
      op: "columns", id: "addition-columns", operation: "add",
      operands: [{ id: "top", value: String(facts.value) }, { id: "bottom", value: String(facts.add) }],
      place: { below: "exchange-ten-notation" },
    },
    { op: "regroup", id: "exchange-carry", objectId: "addition-columns", rowId: "answer", kind: "carry", from: "ones", to: "tens" },
    { op: "focus", target: { objectId: "exchange-ten", part: "piece", piece: "tens" } },
  ];
}

/** Code's reads of one child turn of the addition lesson. */
export interface AdditionReads {
  step: string | undefined;
  /** A lesson turn came before this one. */
  previous: boolean;
  /** The last turn was the plain demonstration, and it reached the child. */
  demonstrated: boolean;
  example: boolean;
  /** The child already made or saw the exchange on this question. */
  exchanged: boolean;
  mistake: CarryMistake | null;
  knowsExchange: boolean;
  stuck: boolean;
  start: boolean;
  /** A right whole sum, by code's strict read. */
  rightWhole: boolean;
  saysWhole: boolean;
  ones: number | null;
  tens: number | null;
  heardTens: boolean;
}

export type AdditionSkill = "combine_ones" | "explain_exchange" | "add_ones" | "add_tens" | "sum" | "carry";
export type AdditionChoice = { step: AdditionStep; observation?: [AdditionSkill, "correct" | "incorrect"] };

/**
 * The next step of the addition lesson. Support starts from what the child shows: a prerequisite question when they say
 * it is new, the exchange to do when they are stuck or make a carry mistake, and only questions once they can go on.
 */
export function additionChoice(r: AdditionReads, [top, add]: [number, number]): AdditionChoice | undefined {
  const onesTotal = top % 10 + add % 10;
  const tensTotal = Math.floor(top / 10) + Math.floor(add / 10) + 1;
  const { step } = r;
  if (r.mistake) return { step: r.exchanged ? "recheck_tens" : r.mistake, observation: ["carry", "incorrect"] };
  const stepQuestion = ["check_place", "check_exchange", "ones", "tens", "recheck_tens"].includes(step ?? "") || (step === "connect" && !r.example);
  if ((!stepQuestion || r.saysWhole) && r.rightWhole) return { step: "correct", observation: ["sum", "correct"] };
  if (step === "check_place") {
    if (r.ones === onesTotal) return { step: "check_exchange", observation: ["combine_ones", "correct"] };
    if (r.ones !== null) return { step: "place_gap", observation: ["combine_ones", "incorrect"] };
    if (r.stuck) return { step: "place_gap" };
  }
  if (step === "check_exchange" || !r.previous) {
    if (r.knowsExchange) return { step: "independent", observation: ["explain_exchange", "correct"] };
    if (step === "check_exchange" && r.stuck) return { step: "guide_exchange" };
  }
  if (step === "independent" && r.stuck) return { step: "guide_exchange" };
  if ((step === "connect" && !r.example) || step === "ones" || (!step && r.demonstrated && !r.example)) {
    if (r.ones === onesTotal - 10) return { step: "tens", observation: ["add_ones", "correct"] };
    if (r.ones !== null) return { step: "ones", observation: ["add_ones", "incorrect"] };
    if (r.stuck) return { step: "ones" };
  }
  if (step === "tens" || step === "recheck_tens") {
    if (r.tens === tensTotal || r.heardTens) return { step: "combine", observation: ["add_tens", "correct"] };
    if (r.tens !== null) return { step: r.tens === tensTotal - 1 ? "recheck_tens" : "tens", observation: ["add_tens", "incorrect"] };
    if (r.stuck) return { step: "tens" };
  }
  if (!r.previous && r.start) return { step: "check_place" };
}
