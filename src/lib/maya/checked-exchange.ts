import type { Command } from "@/lib/board";
import { MAX_OBSERVATIONS, type LessonObservation } from "@/lib/learning-events";
import type { OperationPackage } from "@/lib/question-package";
import { readTransferOperands, TRANSFER_GOODBYE, TRANSFER_OFFER, transferRetryWords, transferStartWords, type TransferOperands } from "./transfer";

/** "question": the related question's board (#1144), tracked like the exchange so a lost batch is shown again. */
type ActionKind = "show" | "exchange" | "question";

export const EXCHANGE_OBJECT = "exchange-before";
export const EXCHANGE_RPC = "maya.exchange";

/** A revision names the lesson board at the time this object was offered. */
export interface ExchangeTarget {
  lessonId: string;
  turnId: string;
  boardRevision: number;
  objectId: typeof EXCHANGE_OBJECT;
  batchId: string;
}

export function readExchangeTarget(value: unknown): ExchangeTarget | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { lessonId, turnId, boardRevision, objectId, batchId } = value as Partial<ExchangeTarget>;
  const id = (field: unknown): field is string => typeof field === "string" && field.length > 0 && field.length <= 160;
  if (!id(lessonId) || !id(turnId) || !id(batchId) || typeof boardRevision !== "number" ||
    !Number.isSafeInteger(boardRevision) || boardRevision < 1 || objectId !== EXCHANGE_OBJECT) return null;
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
  value: number;
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

/**
 * #1145: what the child's versioned profile said about this lesson's standard when the call started (made by
 * teachingBrief, src/lib/child-profile-teaching.ts). It changes only the first step after the child says they are stuck.
 * A lesson saved without it, or with an empty one, teaches as before.
 */
export interface LessonBrief {
  standard: string;
  /** The profile revision it was read from. */
  revision: number;
  /** The tens prerequisite: null with no evidence. */
  prerequisite: "unsure" | "gap" | "secure" | null;
  /** A gap the child has worked on with the blocks or help since its last error: check the tens again on the child's own. */
  recheck?: true;
  /** The base-ten blocks on the board: null with no evidence. */
  blocks: "helped" | "not_yet" | null;
  /** Misconceptions still open (suspected or likely), by id ("reversal", "O3"). */
  misconceptions: string[];
  /** The open review targets' reasons. */
  reviews: string[];
}

const BRIEF_VIEWS = { prerequisite: ["unsure", "gap", "secure"], blocks: ["helped", "not_yet"] } as const;

/** The brief a seam gave, checked; null when it is not one. */
export function readLessonBrief(value: unknown): LessonBrief | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const b = value as Partial<LessonBrief>;
  const ids = (list: unknown): list is string[] => Array.isArray(list) && list.length <= 20 && list.every((id) => typeof id === "string" && id.length >= 1 && id.length <= 40);
  if (typeof b.standard !== "string" || b.standard.length > 20 || !Number.isSafeInteger(b.revision) || b.revision! < 1 ||
    !(b.prerequisite === null || BRIEF_VIEWS.prerequisite.includes(b.prerequisite!)) || !(b.blocks === null || BRIEF_VIEWS.blocks.includes(b.blocks!)) ||
    !ids(b.misconceptions) || !ids(b.reviews)) return null;
  if (b.recheck !== undefined && (b.recheck !== true || b.prerequisite !== "gap")) return null;
  return { standard: b.standard, revision: b.revision!, prerequisite: b.prerequisite!, ...(b.recheck ? { recheck: true as const } : {}), blocks: b.blocks!, misconceptions: [...b.misconceptions], reviews: [...b.reviews] };
}

/**
 * The lesson's first step when the child says they are stuck (#1145). With no brief: check the tens. The tens known on
 * the child's own: go straight to the exchange question. A tens gap: show the blocks with the trade, and once the child
 * has worked with them (`recheck`), check the tens again on the child's own so the gap can be revised. The blocks
 * helped before: start with them.
 */
export function stuckStart(brief: LessonBrief | undefined): "check_place" | "check_exchange" | "place_gap" | "guide_exchange" {
  if (brief?.prerequisite === "secure") return "check_exchange";
  if (brief?.prerequisite === "gap") return brief.recheck ? "check_place" : "place_gap";
  return brief?.blocks === "helped" ? "guide_exchange" : "check_place";
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
  /** #1145: the child's teaching brief at the call's start, when the profile had one for this standard. */
  brief?: LessonBrief;
}

export interface ExchangeProposal {
  checkedExchange: 1;
  value: number;
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
    "offer" | "decline" | "transfer" | "transfer_retry" | "transfer_correct";
  usePlaceValueTerms?: true;
  /** The related question's operands, on every turn of it (#1144). */
  transfer?: TransferOperands;
  /** #1145: the brief's open swapped-digit mistake: the first ones step starts with the reminder. */
  remind?: "reversal";
  /** Omitted when naming the quantity would disclose the target answer. */
  subtrahend?: number;
}

export interface RegroupingObservation {
  skill: "identify_tens" | "explain_exchange" | "perform_exchange" | "subtract_ones" | "subtract_tens" | "difference" | "reversal";
  result: "correct" | "incorrect";
  assistance: "independent" | "hinted" | "demonstrated" | "uncertain";
  at: number;
}

/**
 * The lesson's checked observations for one question's learning event (#1145): the original question's turns, or the
 * related question's (`transfer`), oldest first, the newest MAX_OBSERVATIONS. `board`: the blocks were on the child's board
 * (a show or exchange batch the screen showed in an earlier turn of the same question, or the child's own exchange).
 */
export function lessonObservations(lesson: CheckedExchangeLesson | undefined, transfer: boolean): LessonObservation[] {
  let blocks = false;
  const found: LessonObservation[] = [];
  for (const turn of lesson?.turns ?? []) {
    if ((turn.transfer === true) !== transfer) continue;
    if (turn.observation) {
      const { skill, result, assistance } = turn.observation;
      found.push({ skill, result, assistance, board: blocks || !!turn.childAction });
    }
    if (turn.childAction || turn.actions.some((a) => a.kind !== "question" && a.fate === "shown")) blocks = true;
  }
  return found.slice(-MAX_OBSERVATIONS);
}

export function regroupingOffersAction(instruction: RegroupingInstruction | undefined): boolean {
  return instruction?.step === "guide_exchange" || instruction?.step === "place_gap" || instruction?.step === "reversal";
}

/** Code-owned lesson prompts. The only quantities here come from checked exchange facts. */
export function regroupingWords(facts: ExchangeFacts, instruction: unknown, show: boolean): string[] | null {
  if (!instruction || typeof instruction !== "object") return null;
  const { step, usePlaceValueTerms, subtrahend, remind } = instruction as RegroupingInstruction;
  if (remind !== undefined && (remind !== "reversal" || (step !== "connect" && step !== "ones"))) return null;
  const words = stepWords(facts, instruction as RegroupingInstruction, show, step, usePlaceValueTerms, subtrahend);
  return words && remind ? [REVERSAL_REMINDER, ...words] : words;
}

/** #1145: said once before the first ones step when the child's brief has an open swapped-digit mistake. */
export const REVERSAL_REMINDER = "Start with the top number in each column. Swapping the numbers changes the problem.";

function stepWords(facts: ExchangeFacts, instruction: RegroupingInstruction, show: boolean, step: RegroupingInstruction["step"],
  usePlaceValueTerms: true | undefined, subtrahend: number | undefined): string[] | null {
  const related = instruction.transfer === undefined ? null : readTransferOperands(instruction.transfer);
  if (instruction.transfer !== undefined && (!related || related[0] !== facts.value || facts.example ||
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
        ...(step === "reversal" ? [REVERSAL_REMINDER] : []),
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
  return [
    ...(show ? exchangeWords(facts, true).slice(0, 1) : []),
    "Trade one ten for ten ones. Use the Exchange one ten button on the board.",
  ];
}

export function exchangeChildWords(facts: ExchangeFacts): string[] {
  return [...exchangeWords(facts, false).slice(1, 2), "What changed when you traded a ten?"];
}

function notation(value: number, { tens, ones }: ExchangeAmounts): string {
  return `${value} = ${tens * 10} + ${ones}`;
}

export function exchangeCommands(action: Exclude<ActionKind, "question">, facts: ExchangeFacts): Command[] {
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
