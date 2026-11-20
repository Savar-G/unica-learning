import type { Command } from "@/lib/board";
import type { OperationPackage } from "@/lib/question-package";
import { readTransferOperands, TRANSFER_GOODBYE, TRANSFER_OFFER, transferRetryWords, transferStartWords, type TransferOperands } from "./transfer";
import { ADD_EXCHANGE_OBJECT, ADDITION_EXAMPLES, additionChildWords, additionCommands, additionExchangeWords, additionFacts, additionPromptWords, additionWords, type AdditionFacts, type AdditionSkill, type AdditionStep } from "./checked-addition";
import type { LessonKind } from "./regrouping-reads";

/** "question": the related question's board (#1144), tracked like the exchange so a lost batch is shown again. */
type ActionKind = "show" | "exchange" | "question";

export const EXCHANGE_OBJECT = "exchange-before";
/** The object the child exchanges: a ten in subtraction, ten ones in addition (#1153). */
export type ExchangeObject = typeof EXCHANGE_OBJECT | typeof ADD_EXCHANGE_OBJECT;
export const EXCHANGE_RPC = "maya.exchange";

/** A revision names the lesson board at the time this object was offered. */
export interface ExchangeTarget {
  lessonId: string;
  turnId: string;
  boardRevision: number;
  objectId: ExchangeObject;
  batchId: string;
}

export function readExchangeTarget(value: unknown): ExchangeTarget | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { lessonId, turnId, boardRevision, objectId, batchId } = value as Partial<ExchangeTarget>;
  const id = (field: unknown): field is string => typeof field === "string" && field.length > 0 && field.length <= 160;
  if (!id(lessonId) || !id(turnId) || !id(batchId) || typeof boardRevision !== "number" ||
    !Number.isSafeInteger(boardRevision) || boardRevision < 1 || (objectId !== EXCHANGE_OBJECT && objectId !== ADD_EXCHANGE_OBJECT)) return null;
  return { lessonId, turnId, boardRevision, objectId, batchId };
}

export function sameExchangeTarget(a: ExchangeTarget | undefined, b: ExchangeTarget): boolean {
  return !!a && a.lessonId === b.lessonId && a.turnId === b.turnId && a.boardRevision === b.boardRevision &&
    a.objectId === b.objectId && a.batchId === b.batchId;
}

export interface ExchangeAmounts {
  tens: number;
  ones: number;
}

export interface ExchangeFacts {
  /** The minuend, or the first addend. */
  value: number;
  /** The second addend: set only in an addition lesson (#1153), where `before` and `after` count the ones total. */
  add?: number;
  before: ExchangeAmounts;
  after: ExchangeAmounts;
  example: boolean;
}

export interface ExchangeAction {
  id: string;
  kind: ActionKind;
  batchId: string;
  after?: string;
  delivery: "generated" | "sent";
  fate?: "shown" | "skipped" | "cancelled";
  presented?: true;
}

export interface ExchangeTurn {
  id: string;
  facts: ExchangeFacts;
  actions: ExchangeAction[];
  sent?: true;
  playback?: "finished" | "interrupted";
  prompt?: ExchangeTarget;
  childAction?: ExchangeTarget;
  instruction?: RegroupingInstruction;
  /** Help sent in chat, shown by the board, or confirmed by voice playback. */
  support?: "hinted" | "demonstrated";
  /** A checked child response. The learning event refers to the call that stores this observation. */
  observation?: RegroupingObservation;
  /** A turn of the related question (#1144). Its help and evidence never change the original question's record. */
  transfer?: true;
}

/** The optional related question after the original question is solved (#1144). */
export interface TransferTask {
  operands: TransferOperands;
  state: "offered" | "declined" | "started" | "finished";
  /** Columns the child finished in the related question. */
  done: ("ones" | "tens")[];
  /** When the related question started (#1144: its learning event's time spent). */
  startedAt?: number;
  /** The idempotency key of the related question's learning event, set when it starts (#1145 reads the event by it). */
  eventKey?: string;
}

export interface CheckedExchangeLesson {
  version: 1;
  /** Older saved sessions continue with the original exchange interaction. */
  progression?: 1;
  /** #1144: offers the related question. A lesson saved without it replays its old "correct" step unchanged. */
  transfers?: 1;
  id: string;
  turns: ExchangeTurn[];
  transfer?: TransferTask;
}

export interface ExchangeProposal {
  checkedExchange: 1;
  value: number;
  /** The second addend of an addition lesson's facts (#1153). */
  add?: number;
  example: boolean;
  show: boolean;
  prompt?: true;
  childAction?: ExchangeTarget;
  afterFailure?: true;
  instruction?: RegroupingInstruction;
}

export interface RegroupingInstruction {
  step: "check_place" | "check_exchange" | "independent" | "guide_exchange" | "place_gap" | "reversal" |
    "connect" | "ones" | "recheck_ones" | "tens" | "combine" | "correct" |
    "offer" | "decline" | "transfer" | "transfer_retry" | "transfer_correct" | AdditionStep;
  usePlaceValueTerms?: true;
  /** The related question's operands, on every turn of it (#1144). */
  transfer?: TransferOperands;
  /** The second operand (the subtrahend, or the second addend). Omitted when naming it would disclose the target answer. */
  subtrahend?: number;
}

export interface RegroupingObservation {
  skill: "identify_tens" | "explain_exchange" | "perform_exchange" | "subtract_ones" | "subtract_tens" | "difference" | "reversal" | AdditionSkill;
  result: "correct" | "incorrect";
  assistance: "independent" | "hinted" | "demonstrated" | "uncertain";
  at: number;
}

export function regroupingOffersAction(instruction: RegroupingInstruction | undefined): boolean {
  return ["guide_exchange", "place_gap", "reversal", "forgot_carry", "both_digits"].includes(instruction?.step ?? "");
}

/** The column a correct step observation finishes. */
export function observedColumn(skill: RegroupingObservation["skill"]): "ones" | "tens" | null {
  return skill === "subtract_ones" || skill === "add_ones" ? "ones" : skill === "subtract_tens" || skill === "add_tens" ? "tens" : null;
}

/** A right whole answer: the difference, or the sum (#1153). */
export const solvesQuestion = (skill: RegroupingObservation["skill"] | undefined) => skill === "difference" || skill === "sum";

/** The lesson's operation, from its question. */
export function lessonKind(pkg: OperationPackage | null | undefined): LessonKind | null {
  return pkg?.operation.kind === "subtract" || pkg?.operation.kind === "add" ? pkg.operation.kind : null;
}

/** The checked facts a proposal names, or null when they do not hold. */
export function checkedFacts(value: number, example: boolean, add: unknown): ExchangeFacts | null {
  if (add === undefined) return exchangeFacts(value, example);
  return typeof add === "number" ? additionFacts(value, add, example) : null;
}

/** The facts to try for a turn: the previous turn's, else the question's, then separate worked examples. */
export function factCandidates(kind: LessonKind, [top, bottom]: [number, number], previous: ExchangeFacts | undefined): ExchangeFacts[] {
  const pairs: [number, number][] = previous ? [[previous.value, previous.add ?? bottom]] : kind === "add"
    ? [[top, bottom], ...ADDITION_EXAMPLES]
    : [top, 52, 63, 74, 85].map((value) => [value, bottom]);
  return pairs.flatMap(([value, add]) => {
    const example = kind === "add" ? value !== top || add !== bottom : value !== top;
    const facts = kind === "add" ? additionFacts(value, add, example) : exchangeFacts(value, example);
    return facts ? [facts] : [];
  });
}

/** The facts of a related question (#1144). */
export const relatedFacts = (kind: LessonKind, [top, bottom]: [number, number]) => (kind === "add" ? additionFacts(top, bottom, false) : exchangeFacts(top, false))!;

export const exchangeObject = (facts: ExchangeFacts): ExchangeObject => facts.add === undefined ? EXCHANGE_OBJECT : ADD_EXCHANGE_OBJECT;

const asAddition = (facts: ExchangeFacts) => facts as AdditionFacts;

/** Code-owned lesson prompts. The only quantities here come from checked exchange facts. */
export function regroupingWords(facts: ExchangeFacts, instruction: unknown, show: boolean): string[] | null {
  if (!instruction || typeof instruction !== "object") return null;
  const { step, usePlaceValueTerms, subtrahend } = instruction as RegroupingInstruction;
  const related = (instruction as RegroupingInstruction).transfer === undefined ? null : readTransferOperands((instruction as RegroupingInstruction).transfer);
  if (facts.add !== undefined) {
    if ((instruction as RegroupingInstruction).transfer !== undefined && (!related || related[0] !== facts.value || related[1] !== facts.add || facts.example)) return null;
    if (subtrahend !== undefined && (facts.example || subtrahend !== facts.add)) return null;
    return additionWords(asAddition(facts), step, show, usePlaceValueTerms === true, subtrahend !== undefined, related, TRANSFER_OFFER, TRANSFER_GOODBYE);
  }
  if ((instruction as RegroupingInstruction).transfer !== undefined && (!related || related[0] !== facts.value || facts.example ||
    (subtrahend !== undefined && subtrahend !== related[1]))) return null;
  if (subtrahend !== undefined && (facts.example || !Number.isInteger(subtrahend) || subtrahend <= 0 ||
    subtrahend >= facts.value || subtrahend % 10 <= facts.before.ones)) return null;
  const ones = subtrahend === undefined ? "the bottom ones" : `${subtrahend % 10} ones`;
  const tens = subtrahend === undefined ? "the bottom tens" : `${Math.floor(subtrahend / 10)} tens`;
  switch (step) {
    case "check_place":
      return [usePlaceValueTerms ? `What is the tens digit in ${facts.value}?` : `How many tens are in ${facts.value}?`];
    case "check_exchange":
      return [usePlaceValueTerms ? "What can you exchange to regroup the ones?" : "What can you trade to make more ones?"];
    case "independent":
      return ["Try the whole subtraction on your own."];
    case "place_gap":
    case "reversal":
    case "guide_exchange":
      return [
        ...(step === "reversal" ? ["Start with the top number in each column. Swapping the numbers changes the problem."] : []),
        ...(show || step === "place_gap" ? exchangePromptWords(facts, true).slice(0, 1) : []),
        "We need more ones. We can trade a ten for ten ones and keep the same amount.",
        "Use the Exchange one ten button to make the trade.",
      ];
    case "connect":
      return [
        exchangeChildWords(facts)[0],
        usePlaceValueTerms
          ? "The tens and ones columns record these new amounts."
          : "Write the new counts above the old tens and ones.",
        facts.example ? "Try the same trade on your own question." : `Take away ${ones}. How many ones are left?`,
      ];
    case "ones":
    case "recheck_ones":
      return [
        ...(step === "recheck_ones" ? ["Start with the top number. Swapping the numbers changes the problem."] : []),
        `Start with the regrouped ones. Take away ${ones}. How many are left?`,
      ];
    case "tens":
      return [`Now take away ${tens}. How many tens are left?`];
    case "combine":
      return ["Put your tens and ones together. What is the whole difference?"];
    case "correct":
      return ["You found the difference."];
    case "offer":
      return ["You found the difference.", TRANSFER_OFFER];
    case "decline":
      return [`Okay. ${TRANSFER_GOODBYE}`];
    case "transfer":
      return related ? transferStartWords(related) : null;
    case "transfer_retry":
      return related ? transferRetryWords(related) : null;
    case "transfer_correct":
      return related ? [`You found the difference. ${TRANSFER_GOODBYE}`] : null;
    default:
      return null;
  }
}

export function supportsCheckedExchange(pkg: OperationPackage): boolean {
  if (pkg.operation.kind !== "subtract" || pkg.answer.value.type !== "number" || pkg.answer.unit !== null) return false;
  const [top, bottom] = pkg.operation.operands;
  return exchangeFacts(top, false) !== null && Number.isInteger(bottom) && bottom > 0 &&
    top > bottom && top % 10 < bottom % 10 && pkg.answer.value.value === top - bottom;
}

/** Check the place values, the single exchange and the value of both representations. */
export function exchangeFacts(value: number, example: boolean): ExchangeFacts | null {
  if (!Number.isInteger(value) || value < 10 || value > 99) return null;
  const before = { tens: Math.floor(value / 10), ones: value % 10 };
  const after = { tens: before.tens - 1, ones: before.ones + 10 };
  if (10 * before.tens + before.ones !== value || 10 * after.tens + after.ones !== value) return null;
  return { value, before, after, example };
}

export function exchangeWords(facts: ExchangeFacts, show: boolean): string[] {
  if (facts.add !== undefined) return additionExchangeWords(asAddition(facts), show);
  const { value, before, after, example } = facts;
  const groups = ({ tens, ones }: ExchangeAmounts) => `${tens} ${tens === 1 ? "ten" : "tens"} and ${ones} ${ones === 1 ? "one" : "ones"}`;
  return [
    ...(show ? [`${example ? "Use a separate example: " : ""}${value} is ${groups(before)}.`] : []),
    "Trade 1 ten for 10 ones.",
    `Now we have ${groups(after)}, which is still ${value}.`,
    "What changed when we traded a ten?",
  ];
}

export function exchangePromptWords(facts: ExchangeFacts, show: boolean): string[] {
  if (facts.add !== undefined) return additionPromptWords(asAddition(facts), show);
  return [
    ...(show ? exchangeWords(facts, true).slice(0, 1) : []),
    "Trade one ten for ten ones. Use the Exchange one ten button on the board.",
  ];
}

export function exchangeChildWords(facts: ExchangeFacts): string[] {
  if (facts.add !== undefined) return additionChildWords(asAddition(facts));
  return [...exchangeWords(facts, false).slice(1, 2), "What changed when you traded a ten?"];
}

function notation(value: number, { tens, ones }: ExchangeAmounts): string {
  return `${value} = ${tens * 10} + ${ones}`;
}

export function exchangeCommands(action: Exclude<ActionKind, "question">, facts: ExchangeFacts): Command[] {
  if (facts.add !== undefined) return additionCommands(action, asAddition(facts));
  if (action === "show") return [
    { op: "model", id: EXCHANGE_OBJECT, model: { kind: "base_ten", hundreds: 0, ...facts.before }, place: { region: "main" } },
    { op: "write", id: "exchange-before-notation", text: notation(facts.value, facts.before), place: { below: EXCHANGE_OBJECT } },
    { op: "focus", target: { objectId: EXCHANGE_OBJECT, part: "piece", piece: `ten-${facts.before.tens}` } },
  ];
  return [
    { op: "remove", objectId: "exchange-before-notation" },
    { op: "remove", objectId: EXCHANGE_OBJECT },
    { op: "model", id: "exchange-after", model: { kind: "base_ten", hundreds: 0, ...facts.after }, place: { region: "main" } },
    { op: "write", id: "exchange-after-notation", text: notation(facts.value, facts.after), place: { below: "exchange-after" } },
  ];
}
