import type { Command } from "@/lib/board";
import { workedSteps, type OperationPackage } from "@/lib/question-package";
import { EXCHANGE_OBJECT, SHARE_OBJECT, type ExchangeAmounts, type ExchangeFacts, type ExchangeTarget } from "./checked-exchange";
import { TRANSFER_GOODBYE, TRANSFER_OFFER, type TransferOperands } from "./transfer";

export interface DivisionFacts {
  dividend: number;
  divisor: number;
  quotient: number;
  tens: number;
  ones: number;
  tensPerGroup: number;
  sharedTens: number;
  remainingTens: number;
  onesAfterExchange: number;
  onesPerGroup: number;
  example: boolean;
}

export type DivisionStep =
  | "div_check_place"
  | "div_check_share"
  | "div_check_exchange"
  | "div_independent"
  | "div_place_gap"
  | "div_guide_share"
  | "div_guide_exchange"
  | "div_drop_remainder"
  | "div_ten_as_one"
  | "div_wrong_op"
  | "div_connect_share"
  | "div_connect_exchange"
  | "div_ones"
  | "div_combine"
  | "div_correct"
  | "offer"
  | "decline"
  | "transfer"
  | "transfer_retry"
  | "transfer_correct";

export type DivisionSkill =
  | "identify_tens"
  | "share_tens"
  | "explain_exchange"
  | "perform_share"
  | "perform_exchange"
  | "share_ones"
  | "quotient"
  | "division_misconception";

export interface DivisionInstruction {
  step: DivisionStep;
  usePlaceValueTerms?: true;
  transfer?: TransferOperands;
  /** True when `div_guide_exchange` immediately follows a completed share-tens action in the same response. */
  fromShare?: true;
  /** Which board action (if any) this step offers to the child. */
  offerAction?: "share" | "exchange";
}

export type DivisionMisconception = "drop_remainder" | "ten_as_one" | "wrong_op";

/** Related questions with no remaining ten (same structure as 84 ÷ 4). */
const NO_EXCHANGE_CANDIDATES: readonly TransferOperands[] = [
  [69, 3], [48, 2], [86, 2], [68, 2], [88, 4], [63, 3], [84, 4],
];

/** Related questions with 1 remaining ten exchanged into 10 ones (same structure as 96 ÷ 4). */
const EXCHANGE_CANDIDATES: readonly TransferOperands[] = [
  [75, 3], [56, 4], [92, 4], [52, 4], [65, 5], [78, 3], [72, 3], [96, 4],
];

export function divisionFacts(dividend: number, divisor: number, example: boolean): DivisionFacts | null {
  if (!Number.isInteger(dividend) || dividend < 10 || dividend > 99) return null;
  if (!Number.isInteger(divisor) || divisor < 2 || divisor > 9) return null;
  if (dividend % divisor !== 0) return null;
  const tens = Math.floor(dividend / 10);
  const ones = dividend % 10;
  if (tens < divisor) return null;
  const tensPerGroup = Math.floor(tens / divisor);
  const sharedTens = tensPerGroup * divisor;
  const remainingTens = tens - sharedTens;
  if (remainingTens !== 0 && remainingTens !== 1) return null;
  const onesAfterExchange = ones + remainingTens * 10;
  if (onesAfterExchange > 19 || onesAfterExchange % divisor !== 0) return null;
  const onesPerGroup = onesAfterExchange / divisor;
  const quotient = tensPerGroup * 10 + onesPerGroup;
  if (
    10 * tens + ones !== dividend ||
    sharedTens + remainingTens !== tens ||
    10 * sharedTens + onesAfterExchange !== dividend ||
    divisor * quotient !== dividend ||
    dividend / divisor !== quotient
  ) return null;
  return {
    dividend, divisor, quotient, tens, ones,
    tensPerGroup, sharedTens, remainingTens, onesAfterExchange, onesPerGroup, example,
  };
}

export function toExchangeFacts(facts: DivisionFacts): ExchangeFacts {
  return {
    value: facts.dividend,
    divisor: facts.divisor,
    before: { tens: facts.tens, ones: facts.ones },
    after: { tens: facts.sharedTens, ones: facts.onesAfterExchange },
    example: facts.example,
  };
}

export function divisionFactsFromExchange(facts: ExchangeFacts): DivisionFacts | null {
  return facts.divisor === undefined ? null : divisionFacts(facts.value, facts.divisor, facts.example);
}

export function supportsCheckedDivision(pkg: OperationPackage): boolean {
  if (pkg.operation.kind !== "divide" || pkg.answer.value.type !== "number" || pkg.answer.unit !== null) return false;
  const [dividend, divisor] = pkg.operation.operands;
  const facts = divisionFacts(dividend, divisor, false);
  return facts !== null && pkg.answer.value.value === facts.quotient;
}

export function divisionTransferPackage(pkg: OperationPackage, [dividend, divisor]: TransferOperands): OperationPackage {
  const operation = { kind: "divide" as const, operands: [dividend, divisor] as [number, number] };
  return {
    ...pkg,
    id: `${pkg.id}:transfer`,
    text: `${dividend} ÷ ${divisor} = ?`,
    answer: { value: { type: "number", value: dividend / divisor }, accepted: [], unit: null },
    operation,
    steps: workedSteps(operation),
    wrongAnswers: [],
  };
}

export function chooseDivisionTransfer(
  original: TransferOperands,
  worked: readonly number[],
  disclosed: (operands: TransferOperands) => boolean,
): TransferOperands | null {
  const orig = divisionFacts(original[0], original[1], false);
  if (!orig) return null;
  const list = orig.remainingTens === 1 ? EXCHANGE_CANDIDATES : NO_EXCHANGE_CANDIDATES;
  return list.find((candidate) =>
    candidate[0] !== original[0] &&
    candidate[0] / candidate[1] !== orig.quotient &&
    !worked.includes(candidate[0]) &&
    !disclosed(candidate),
  ) ?? null;
}

export function readDivisionTransferOperands(value: unknown): TransferOperands | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [dividend, divisor] = value;
  return [...NO_EXCHANGE_CANDIDATES, ...EXCHANGE_CANDIDATES].some(
    (candidate) => candidate[0] === dividend && candidate[1] === divisor,
  ) ? [dividend, divisor] : null;
}

export function divisionTransferBoard([dividend, divisor]: TransferOperands): Command[] {
  return [
    { op: "clear", scope: "maya_objects" },
    { op: "write", id: "transfer-question", text: `${dividend} ÷ ${divisor} = ?`, place: { region: "main" } },
  ];
}

export function divisionExampleCandidates(needsExchange: boolean): readonly TransferOperands[] {
  return needsExchange ? [[96, 4], [75, 3], [56, 4], [92, 4]] : [[84, 4], [69, 3], [48, 2], [86, 2]];
}

const groups = ({ tens, ones }: ExchangeAmounts) =>
  `${tens} ${tens === 1 ? "ten" : "tens"} and ${ones} ${ones === 1 ? "one" : "ones"}`;

const unit = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;

export function divisionStartLine(facts: DivisionFacts): string {
  return `${facts.example ? "Use a separate example: " : ""}${facts.dividend} is ${groups({ tens: facts.tens, ones: facts.ones })}.`;
}

export function divisionShareLine(facts: DivisionFacts): string {
  const each = unit(facts.tensPerGroup, "ten", "tens");
  return facts.remainingTens === 0
    ? `${facts.tens} tens shared into ${facts.divisor} equal groups gives ${each} in each group, using ${facts.sharedTens} tens with 0 tens left.`
    : `${facts.tens} tens shared into ${facts.divisor} equal groups gives ${each} in each group, using ${facts.sharedTens} tens with 1 ten left over.`;
}

function writtenShareLine(facts: DivisionFacts): string {
  const each = unit(facts.tensPerGroup, "ten", "tens");
  return facts.remainingTens === 0
    ? `In the written division, ${facts.tensPerGroup} above the tens records ${each} per group, subtracting ${facts.sharedTens} tens leaves 0 tens, and ${unit(facts.ones, "one", "ones")} remain to share.`
    : `In the written division, ${facts.tensPerGroup} above the tens records ${each} per group, and subtracting ${facts.sharedTens} tens leaves 1 remaining ten.`;
}

function writtenExchangeLine(facts: DivisionFacts): string {
  return `In the written division, writing ${facts.ones} beside the 1 remaining ten records those ${facts.onesAfterExchange} ones.`;
}

/** Demonstration words when Maya shows sharing (and exchange if needed) without waiting for a button tap. */
export function divisionDemoWords(facts: DivisionFacts, show: boolean, shared: boolean): string[] {
  return [
    ...(show ? [divisionStartLine(facts)] : []),
    ...(shared ? [] : [divisionShareLine(facts)]),
    ...(facts.remainingTens > 0
      ? [
          "Trade 1 remaining ten for 10 ones.",
          `Now we have ${facts.sharedTens} tens and ${facts.onesAfterExchange} ones, which is still ${facts.dividend}.`,
        ]
      : []),
    `How many ones go in each of the ${facts.divisor} equal groups?`,
  ];
}

/** Prompt words when the child explicitly asks to try sharing or exchanging on the board. */
export function divisionPromptWords(facts: DivisionFacts, show: boolean, action: "share" | "exchange"): string[] {
  if (action === "exchange") {
    return [
      "There is 1 ten left over. Trade 1 ten for 10 ones to combine with the ones.",
      "Use the Exchange one ten button on the board.",
    ];
  }
  return [
    ...(show ? [divisionStartLine(facts)] : []),
    `Share the ${facts.tens} tens equally into ${facts.divisor} groups. Use the Share the tens button on the board.`,
  ];
}

/** Code-owned division lesson prompts. Every quantity comes from checked DivisionFacts; never uses an unexplained bring-down. */
export function divisionWords(facts: DivisionFacts, instruction: unknown, show: boolean, shared = false): string[] | null {
  if (!instruction || typeof instruction !== "object") return null;
  const { step, usePlaceValueTerms, fromShare, offerAction, transfer } = instruction as DivisionInstruction;
  const related = transfer === undefined ? null : readDivisionTransferOperands(transfer);
  if (transfer !== undefined && (!related || related[0] !== facts.dividend || related[1] !== facts.divisor || facts.example)) return null;

  switch (step) {
    case "div_check_place":
      return [usePlaceValueTerms ? `What is the tens digit in ${facts.dividend}?` : `How many tens are in ${facts.dividend}?`];
    case "div_check_share":
      return [usePlaceValueTerms
        ? `What is ${facts.tens} tens divided equally into ${facts.divisor} groups?`
        : `If we share ${facts.tens} tens equally into ${facts.divisor} groups, how many tens go in each group?`];
    case "div_check_exchange":
      return facts.remainingTens === 1
        ? [usePlaceValueTerms
            ? "1 ten remains unshared. What can you exchange it for to regroup into ones?"
            : "There is 1 ten left over. What can you trade that ten for to make more ones?"]
        : null;
    case "div_independent":
      return ["Try the whole division on your own."];
    case "div_place_gap":
    case "div_guide_share":
      return [
        ...(show || step === "div_place_gap" ? [divisionStartLine(facts)] : []),
        `Start by sharing the ${facts.tens} tens equally into ${facts.divisor} groups.`,
        "Use the Share the tens button to share the tens.",
      ];
    case "div_wrong_op":
      return [
        `Division shares ${facts.dividend} into ${facts.divisor} equal groups, rather than subtracting or multiplying.`,
        ...(show ? [divisionStartLine(facts)] : []),
        ...(offerAction === "share"
          ? [`Start by sharing the ${facts.tens} tens equally into ${facts.divisor} groups.`, "Use the Share the tens button to share the tens."]
          : offerAction === "exchange"
            ? ["Use the Exchange one ten button to trade the remaining ten."]
            : [`Share ${unit(facts.onesAfterExchange, "one", "ones")} into ${facts.divisor} equal groups. How many ones go in each group?`]),
      ];
    case "div_drop_remainder":
      if (facts.remainingTens !== 1) return null;
      return [
        `We cannot leave the remaining ten out. That 1 remaining ten equals 10 ones, so with ${unit(facts.ones, "one", "ones")} there are ${facts.onesAfterExchange} ones to share.`,
        ...(show ? [divisionStartLine(facts)] : []),
        ...(offerAction === "share"
          ? ["Use the Share the tens button to share the tens."]
          : offerAction === "exchange"
            ? ["Use the Exchange one ten button to trade the remaining ten."]
            : [`Share ${facts.onesAfterExchange} ones into ${facts.divisor} equal groups. How many ones go in each group?`]),
      ];
    case "div_ten_as_one":
      if (facts.remainingTens !== 1) return null;
      return [
        `The 1 left over is 1 ten, not 1 one. Trading 1 ten gives 10 ones, and 10 ones plus ${unit(facts.ones, "one", "ones")} makes ${facts.onesAfterExchange} ones.`,
        ...(show ? [divisionStartLine(facts)] : []),
        ...(offerAction === "share"
          ? ["Use the Share the tens button to share the tens."]
          : offerAction === "exchange"
            ? ["Use the Exchange one ten button to trade the remaining ten."]
            : [`Share ${facts.onesAfterExchange} ones into ${facts.divisor} equal groups. How many ones go in each group?`]),
      ];
    case "div_guide_exchange":
      if (facts.remainingTens !== 1) return null;
      return fromShare
        ? [
            divisionShareLine(facts),
            writtenShareLine(facts),
            "We can trade that 1 remaining ten for 10 ones to combine with the ones.",
            "Use the Exchange one ten button to make the trade.",
          ]
        : [
            ...(show ? [divisionStartLine(facts)] : []),
            ...(shared ? [] : [divisionShareLine(facts)]),
            "There is 1 ten left over. We can trade 1 ten for 10 ones and keep the same amount.",
            "Use the Exchange one ten button to make the trade.",
          ];
    case "div_connect_share":
      return [
        divisionShareLine(facts),
        writtenShareLine(facts),
        facts.example
          ? "Try the same equal sharing on your own question."
          : `Share ${unit(facts.onesAfterExchange, "one", "ones")} into ${facts.divisor} equal groups. How many ones go in each group?`,
      ];
    case "div_connect_exchange":
      if (facts.remainingTens !== 1) return null;
      return [
        "Trade 1 remaining ten for 10 ones.",
        `Now we have ${facts.sharedTens} tens and ${facts.onesAfterExchange} ones, which is still ${facts.dividend}.`,
        writtenExchangeLine(facts),
        facts.example
          ? "Try the same sharing and trade on your own question."
          : `Share ${facts.onesAfterExchange} ones into ${facts.divisor} equal groups. How many ones go in each group?`,
      ];
    case "div_ones":
      return [`Share ${unit(facts.onesAfterExchange, "one", "ones")} into ${facts.divisor} equal groups. How many ones go in each group?`];
    case "div_combine":
      return ["Put the tens and ones for each group together. What is the whole quotient?"];
    case "div_correct":
      return ["You found the quotient."];
    case "offer":
      return ["You found the quotient.", TRANSFER_OFFER];
    case "decline":
      return [`Okay. ${TRANSFER_GOODBYE}`];
    case "transfer":
      return related ? [`Here is one more: ${related[0]} divided by ${related[1]}.`, "Try it on your own. What is the quotient?"] : null;
    case "transfer_retry":
      return related ? [`Try ${related[0]} divided by ${related[1]} again. What is the quotient?`] : null;
    case "transfer_correct":
      return related ? [`You found the quotient. ${TRANSFER_GOODBYE}`] : null;
    default:
      return null;
  }
}

export function divisionCommands(action: "show" | "share" | "exchange", facts: DivisionFacts): Command[] {
  if (action === "show") {
    return [
      { op: "model", id: SHARE_OBJECT, model: { kind: "base_ten", hundreds: 0, tens: facts.tens, ones: facts.ones }, place: { region: "main" } },
      { op: "write", id: "division-share-notation", text: `${facts.dividend} = ${facts.tens * 10} + ${facts.ones}`, place: { below: SHARE_OBJECT } },
      { op: "focus", target: { objectId: SHARE_OBJECT, part: "piece", piece: "tens" } },
    ];
  }
  if (action === "share") {
    if (facts.remainingTens === 0) {
      return [
        { op: "remove", objectId: "division-share-notation" },
        { op: "remove", objectId: SHARE_OBJECT },
        { op: "model", id: "division-shared", model: { kind: "base_ten", hundreds: 0, tens: facts.tens, ones: facts.ones }, place: { region: "main" } },
        { op: "write", id: "division-shared-notation", text: `${facts.dividend} = ${facts.divisor} × ${facts.tensPerGroup * 10} + ${facts.ones}`, place: { below: "division-shared" } },
        { op: "division", id: "division-written", dividend: String(facts.dividend), divisor: String(facts.divisor), place: { rightOf: "division-shared" } },
        { op: "put", target: { objectId: "division-written", part: "cell", rowId: "quotient", column: "tens" }, value: String(facts.tensPerGroup) },
        { op: "put", target: { objectId: "division-written", part: "row", rowId: "product1" }, value: String(facts.sharedTens) },
        { op: "put", target: { objectId: "division-written", part: "row", rowId: "difference1" }, value: "0" },
        { op: "put", target: { objectId: "division-written", part: "row", rowId: "bring2" }, value: String(facts.ones) },
      ];
    }
    return [
      { op: "remove", objectId: "division-share-notation" },
      { op: "remove", objectId: SHARE_OBJECT },
      { op: "model", id: EXCHANGE_OBJECT, model: { kind: "base_ten", hundreds: 0, tens: facts.tens, ones: facts.ones }, place: { region: "main" } },
      { op: "write", id: "exchange-before-notation", text: `${facts.dividend} = ${facts.sharedTens * 10} + 10 + ${facts.ones}`, place: { below: EXCHANGE_OBJECT } },
      { op: "focus", target: { objectId: EXCHANGE_OBJECT, part: "piece", piece: `ten-${facts.tens}` } },
      { op: "division", id: "division-written", dividend: String(facts.dividend), divisor: String(facts.divisor), place: { rightOf: EXCHANGE_OBJECT } },
      { op: "put", target: { objectId: "division-written", part: "cell", rowId: "quotient", column: "tens" }, value: String(facts.tensPerGroup) },
      { op: "put", target: { objectId: "division-written", part: "row", rowId: "product1" }, value: String(facts.sharedTens) },
      { op: "put", target: { objectId: "division-written", part: "row", rowId: "difference1" }, value: "1" },
    ];
  }
  return [
    { op: "remove", objectId: "exchange-before-notation" },
    { op: "remove", objectId: EXCHANGE_OBJECT },
    { op: "model", id: "exchange-after", model: { kind: "base_ten", hundreds: 0, tens: facts.sharedTens, ones: facts.onesAfterExchange }, place: { region: "main" } },
    { op: "write", id: "exchange-after-notation", text: `${facts.dividend} = ${facts.sharedTens * 10} + ${facts.onesAfterExchange}`, place: { below: "exchange-after" } },
    { op: "put", target: { objectId: "division-written", part: "row", rowId: "bring2" }, value: String(facts.ones) },
  ];
}

export const DIVISION_DEMO_REQUEST = /^(?:(?:can|could|would) you (?:show|tell) me |(?:please )?show me )?(?:how (?:do (?:i|we) |to )?|why (?:do (?:i|we) |to )?)?(?:divide|share(?: the tens)?|split(?: the tens)?|regroup(?:ing)?|(?:trade|exchange) (?:a|one|1) ten)(?: again)?[.?!]*$/i;
export const DIVISION_CHILD_REQUEST = /^(?:how do (?:i|we) (?:divide|share(?: the tens)?|(?:trade|exchange) (?:a|one|1) ten)|(?:can i|i want to) (?:try (?:dividing|sharing)|share(?: the tens)?|(?:trade|exchange) (?:a|one|1) ten))(?: again)?[.?!]*$/i;
export const DIVISION_START = /^(?:i (?:still )?(?:don'?t|do not) (?:know(?: how to (?:start|divide|share|regroup))?|get it|understand(?: (?:division|dividing|sharing))?)|i(?:'m| am) (?:still )?(?:stuck|confused|new to (?:division|dividing|sharing))|i(?:'ve| have) never (?:divided|done this before)|(?:can you )?(?:teach me|explain) how to (?:divide|share))[.?!]*$/i;
export const DIVISION_HELP = /^(?:i need help|can you help me|i (?:don't|do not) know how to start)[.?!]*$/i;
export const DIVISION_KNOWS_EXCHANGE = /^(?:(?:i (?:can|would|will) |i'll |we can )?(?:trade|exchange|swap|break|regroup|turn) (?:it |(?:the |that )?(?:remaining |leftover )?ten|(?:a|one|1)(?: remaining| leftover)? ten(?: (?:rod|block))?) (?:for|into|to) (?:10|ten) ones|(?:10|ten) ones)$/;
export const DIVISION_REPEAT = /^(?:what did you say|(?:can|could) you repeat (?:that|it)|(?:say|explain) that again)[.?!]*$/i;

/**
 * Detects division-specific misconceptions in the child's turn:
 * - `ten_as_one`: treating the 1 remaining ten as 1 one (e.g. 1 + 6 = 7 on 96 ÷ 4)
 * - `drop_remainder`: ignoring the remaining ten and dividing only the printed ones (e.g. 6 ÷ 4 on 96 ÷ 4)
 * - `wrong_op`: subtracting or multiplying the dividend and divisor instead of dividing
 */
export function divisionMisconception(
  body: string | null,
  rawText: string,
  dividend: number,
  divisor: number,
  plainNumber: (s: string) => number | null,
  saysGuess: (s: string) => boolean,
): DivisionMisconception | null {
  if (!body || saysGuess(rawText)) return null;
  const facts = divisionFacts(dividend, divisor, false);
  if (!facts) return null;
  const prefix = /^(?:(?:my (?:final )?answer is |i got )?([\w -]+) because )/.exec(body);
  if (prefix && plainNumber(prefix[1]) === null) return null;
  const reason = body.slice(prefix?.[0].length ?? 0);

  if (facts.remainingTens === 1) {
    // Treating 1 remaining ten as 1 one: "1 plus 6 is 7" or "7 ones" (when 1 + ones !== onesAfterExchange)
    const addEq = /^([\w -]+?)\s*(?:plus|\+)\s*([\w -]+?)\s*(?:is|equals|makes|=)\s*([\w -]+?)(?: ones?)?$/.exec(reason);
    if (addEq) {
      const a = plainNumber(addEq[1]);
      const b = plainNumber(addEq[2]);
      const c = plainNumber(addEq[3]);
      if (((a === 1 && b === facts.ones) || (a === facts.ones && b === 1)) && c === facts.ones + 1) {
        return "ten_as_one";
      }
    }
    if (/^(?:i )?(?:added|put) (?:the )?(?:1|one) (?:and|to) /.test(reason) && reason.includes(String(facts.ones))) {
      return "ten_as_one";
    }
    // Dropping the remaining ten: dividing just the printed ones digit by divisor (e.g. "6 divided by 4 is ...")
    const divEq = /^([\w -]+?)\s*(?:divided by|shared (?:by|into)|÷|\/)\s*([\w -]+?)\s*(?:is|equals|makes|=)\s*([\w -]+)$/.exec(reason);
    if (divEq) {
      const a = plainNumber(divEq[1]);
      const b = plainNumber(divEq[2]);
      if (a === facts.ones && b === divisor) return "drop_remainder";
    }
    if (/\b(?:ignor|drop|skip|leav|forgot|forget)\w*\s+(?:the\s+)?(?:remaining|leftover|extra|other)?\s*(?:1|one)?\s*ten\b/.test(reason)) {
      return "drop_remainder";
    }
  }

  // Wrong operation: subtracting or multiplying dividend and divisor instead of sharing equally.
  const subEq = /^([\w -]+?)\s*(?:minus|take away|-)\s*([\w -]+?)\s*(?:is|equals|makes|=)\s*([\w -]+)$/.exec(reason);
  if (subEq && plainNumber(subEq[1]) === dividend && plainNumber(subEq[2]) === divisor) return "wrong_op";
  const mulEq = /^([\w -]+?)\s*(?:times|multiplied by|×|x|\*)\s*([\w -]+?)\s*(?:is|equals|makes|=)\s*([\w -]+)$/.exec(reason);
  if (mulEq && ((plainNumber(mulEq[1]) === dividend && plainNumber(mulEq[2]) === divisor) || (plainNumber(mulEq[1]) === divisor && plainNumber(mulEq[2]) === dividend))) {
    return "wrong_op";
  }
  const bare = plainNumber(body.replace(/^(?:my (?:final )?answer is |i got |it'?s |it is )/, ""));
  const explicitAnswer = /^(?:my (?:final )?answer is |i got )/.test(body);
  if (bare !== null && ((bare === dividend - divisor && (explicitAnswer || bare !== facts.tens * 10)) || bare === dividend * divisor)) return "wrong_op";
  if (/^(?:i )?(?:subtracted|took away|multiplied)\b/.test(reason)) return "wrong_op";
  return null;
}

export function divisionOffersAction(instruction: DivisionInstruction | undefined): "share" | "exchange" | null {
  if (!instruction) return null;
  if (instruction.offerAction) return instruction.offerAction;
  if (instruction.step === "div_place_gap" || instruction.step === "div_guide_share") return "share";
  if (instruction.step === "div_guide_exchange") return "exchange";
  return null;
}

export function divisionHelpLevel(step: DivisionStep | undefined, hasPrompt: boolean, transfer: boolean): "hinted" | "demonstrated" | undefined {
  if (transfer && (step === "div_check_share" || step === "div_check_exchange" || step === "div_combine")) return "hinted";
  if (step === "div_connect_share" || step === "div_connect_exchange" || (!step && !hasPrompt)) return "demonstrated";
  if (hasPrompt || step === "div_ones" || step === "div_drop_remainder" || step === "div_ten_as_one" || step === "div_wrong_op" || step === "div_guide_exchange") return "hinted";
  return undefined;
}

export interface DivisionTurnReads {
  text: string;
  body: string | null;
  previousStep: DivisionStep | undefined;
  previousWasDemo: boolean;
  previousWasExample: boolean;
  previousDemonstrated: boolean;
  shared: boolean;
  exchanged: boolean;
  misconception: DivisionMisconception | null;
  rightWhole: boolean;
  saysWhole: boolean;
  wrongWhole: boolean;
  tensCount: number | null;
  onesCount: number | null;
  heardTens: boolean;
  heardOnes: boolean;
}

export interface DivisionChoiceResult {
  step: DivisionStep;
  offerAction?: "share" | "exchange";
  observation?: [DivisionSkill, "correct" | "incorrect"];
}

export function divisionChoice(r: DivisionTurnReads, facts: DivisionFacts): DivisionChoiceResult | undefined {
  const stuck = DIVISION_START.test(r.text) || DIVISION_HELP.test(r.text);
  const step = r.previousStep;

  if (r.misconception) {
    const nextAction = !r.shared ? "share" as const : facts.remainingTens === 1 && !r.exchanged ? "exchange" as const : undefined;
    if (r.misconception === "wrong_op") {
      return {
        step: "div_wrong_op",
        ...(nextAction ? { offerAction: nextAction } : {}),
        observation: ["division_misconception", "incorrect"],
      };
    }
    return {
      step: r.misconception === "ten_as_one" ? "div_ten_as_one" : "div_drop_remainder",
      ...(nextAction ? { offerAction: nextAction } : {}),
      observation: ["division_misconception", "incorrect"],
    };
  }

  if (step && DIVISION_REPEAT.test(r.text)) {
    if (step === "div_connect_share" || step === "div_connect_exchange") {
      if (r.previousDemonstrated) return { step };
    } else if (step !== "div_correct" && step !== "offer") {
      const offer = divisionOffersAction({ step });
      return { step, ...(offer ? { offerAction: offer } : {}) };
    }
  }

  const stepQuestion =
    step === "div_check_place" ||
    step === "div_check_share" ||
    step === "div_check_exchange" ||
    step === "div_ones" ||
    ((step === "div_connect_share" || step === "div_connect_exchange") && !r.previousWasExample);

  if (r.rightWhole && (!stepQuestion || r.saysWhole)) {
    return { step: "div_correct", observation: ["quotient", "correct"] };
  }

  if (step === "div_check_place") {
    if (r.tensCount === facts.tens) return { step: "div_check_share", observation: ["identify_tens", "correct"] };
    if (r.tensCount !== null) return { step: "div_place_gap", offerAction: "share", observation: ["identify_tens", "incorrect"] };
    if (stuck) return { step: "div_place_gap", offerAction: "share" };
  }

  if (step === "div_check_share") {
    if (r.tensCount === facts.tensPerGroup || r.heardTens) {
      return {
        step: facts.remainingTens === 1 ? "div_check_exchange" : "div_independent",
        observation: ["share_tens", "correct"],
      };
    }
    if (r.tensCount !== null) return { step: "div_guide_share", offerAction: "share", observation: ["share_tens", "incorrect"] };
    if (stuck) return { step: "div_guide_share", offerAction: "share" };
  }

  if (step === "div_check_exchange") {
    if (r.body && DIVISION_KNOWS_EXCHANGE.test(r.body)) {
      return { step: "div_independent", observation: ["explain_exchange", "correct"] };
    }
    if (stuck || r.onesCount !== null) {
      return {
        step: r.shared ? "div_guide_exchange" : "div_guide_share",
        offerAction: r.shared ? "exchange" : "share",
        ...(r.onesCount !== null ? { observation: ["explain_exchange", "incorrect"] as [DivisionSkill, "incorrect"] } : {}),
      };
    }
  }

  if (step === "div_independent" && stuck) {
    return { step: "div_guide_share", offerAction: "share" };
  }

  if (r.previousWasDemo && r.previousDemonstrated && !r.previousWasExample) {
    if (r.onesCount === facts.onesPerGroup || r.heardOnes) {
      return { step: "div_combine", observation: ["share_ones", "correct"] };
    }
    if (r.onesCount !== null) return { step: "div_ones", observation: ["share_ones", "incorrect"] };
  }

  if (
    ((step === "div_connect_share" || step === "div_connect_exchange") && !r.previousWasExample) ||
    step === "div_ones" ||
    ((step === "div_drop_remainder" || step === "div_ten_as_one") && (facts.remainingTens === 0 || r.exchanged))
  ) {
    if (r.onesCount === facts.onesPerGroup || r.heardOnes) {
      return { step: "div_combine", observation: ["share_ones", "correct"] };
    }
    if (r.onesCount !== null) {
      // Catch 1 + ones = 7 when child just answers "7 ones" or "7" on 96 ÷ 4
      if (facts.remainingTens === 1 && r.onesCount === facts.ones + 1) {
        return { step: "div_ten_as_one", observation: ["division_misconception", "incorrect"] };
      }
      return { step: "div_ones", observation: ["share_ones", "incorrect"] };
    }
    if (stuck) return { step: "div_ones" };
  }

  if (step === "div_combine") {
    if (r.wrongWhole) return { step: "div_combine", observation: ["quotient", "incorrect"] };
    if (stuck) return { step: "div_combine" };
  }

  if (!step && !r.previousWasDemo && DIVISION_START.test(r.text)) {
    return { step: "div_check_place" };
  }
  return undefined;
}

export interface DivisionRelatedReads {
  previous: string;
  misconception: DivisionMisconception | null;
  repeat: boolean;
  asksDemo: boolean;
  knowsExchange: boolean;
  stuck: boolean;
  rightWhole: boolean;
  saysWhole: boolean;
  wrongWhole: boolean;
  tens: number | null;
  ones: number | null;
  heardTens: boolean;
  heardOnes: boolean;
}

export function divisionRelatedChoice(
  r: DivisionRelatedReads,
  facts: DivisionFacts,
): { step: DivisionStep; observation?: [DivisionSkill, "correct" | "incorrect"] } {
  const again: DivisionStep = r.previous === "transfer" || r.previous === "transfer_retry" ? "transfer_retry" : r.previous as DivisionStep;
  if (r.misconception === "ten_as_one") return { step: "div_ten_as_one", observation: ["division_misconception", "incorrect"] };
  if (r.misconception === "drop_remainder") return { step: "div_drop_remainder", observation: ["division_misconception", "incorrect"] };
  if (r.misconception === "wrong_op") return { step: "div_check_share", observation: ["division_misconception", "incorrect"] };
  if (r.repeat) return { step: again };
  if (r.asksDemo) return { step: facts.remainingTens === 1 ? "div_connect_exchange" : "div_connect_share" };

  const stepQuestion = ["div_check_share", "div_check_exchange", "div_connect_share", "div_connect_exchange", "div_ones", "div_drop_remainder", "div_ten_as_one"].includes(r.previous);
  if (r.rightWhole && (!stepQuestion || r.saysWhole)) {
    return { step: "transfer_correct", observation: ["quotient", "correct"] };
  }
  if (r.previous === "div_check_share") {
    if (r.tens === facts.tensPerGroup || r.heardTens) {
      return {
        step: facts.remainingTens === 1 ? "div_check_exchange" : "div_ones",
        observation: ["share_tens", "correct"],
      };
    }
    if (r.tens !== null) return { step: "div_check_share", observation: ["share_tens", "incorrect"] };
    if (r.stuck) return { step: facts.remainingTens === 1 ? "div_connect_exchange" : "div_connect_share" };
  }
  if (r.previous === "div_check_exchange") {
    if (r.knowsExchange) return { step: "div_ones", observation: ["explain_exchange", "correct"] };
    if (r.stuck) return { step: "div_connect_exchange" };
  }
  if (["div_connect_share", "div_connect_exchange", "div_ones", "div_drop_remainder", "div_ten_as_one"].includes(r.previous)) {
    if (r.ones === facts.onesPerGroup || r.heardOnes) return { step: "div_combine", observation: ["share_ones", "correct"] };
    if (r.ones !== null) return { step: "div_ones", observation: ["share_ones", "incorrect"] };
    if (r.stuck) return { step: "div_ones" };
  }
  if (r.previous === "div_combine" && r.wrongWhole) return { step: "div_combine", observation: ["quotient", "incorrect"] };
  if (again === "transfer_retry" && (r.wrongWhole || r.stuck)) {
    return {
      step: "div_check_share",
      ...(r.wrongWhole ? { observation: ["quotient", "incorrect"] as [DivisionSkill, "incorrect"] } : {}),
    };
  }
  return { step: again };
}

/** Validates a division ExchangeProposal against the expected output in maya-trace.ts. */
export function checkDivisionOutput(
  proposal: Record<string, unknown>,
  output: { act?: unknown; say?: unknown; board?: unknown },
  readTarget: (v: unknown) => ExchangeTarget | null,
): boolean {
  if (typeof proposal.value !== "number" || typeof proposal.divisor !== "number" ||
    typeof proposal.example !== "boolean" || typeof proposal.show !== "boolean") return false;
  const facts = divisionFacts(proposal.value, proposal.divisor, proposal.example);
  if (!facts || !Array.isArray(output.say) || output.say.length !== 1 || !Array.isArray(output.board)) return false;
  const step = typeof proposal.instruction === "object" && proposal.instruction !== null
    ? (proposal.instruction as DivisionInstruction).step
    : undefined;
  const closes = step === "decline" || step === "transfer_correct";
  if (output.act !== (closes ? "close" : "guide")) return false;
  const shared = proposal.shared === true;
  if (proposal.instruction !== undefined) {
    const words = divisionWords(facts, proposal.instruction, proposal.show, shared);
    const child = readTarget(proposal.childAction);
    const expectedBoards = child ? 1 : proposal.show ? 1 : 0;
    return !!words && output.say[0] === words.join(" ") && output.board.length === expectedBoards;
  }
  if (proposal.prompt === true) {
    const action = shared && facts.remainingTens === 1 ? "exchange" : "share";
    return output.say[0] === divisionPromptWords(facts, proposal.show, action).join(" ") && output.board.length === Number(proposal.show);
  }
  const child = readTarget(proposal.childAction);
  if (child) {
    const words = child.objectId === SHARE_OBJECT
      ? divisionWords(facts, { step: facts.remainingTens === 1 ? "div_guide_exchange" : "div_connect_share", ...(facts.remainingTens === 1 ? { fromShare: true as const } : {}) }, false)
      : divisionWords(facts, { step: "div_connect_exchange" }, false);
    return !proposal.show && !!words && output.say[0] === words.join(" ") && output.board.length === 1;
  }
  const expectedBoards = Number(proposal.show) + Number(!shared) + Number(facts.remainingTens > 0);
  return output.say[0] === divisionDemoWords(facts, proposal.show, shared).join(" ") && output.board.length === expectedBoards;
}
