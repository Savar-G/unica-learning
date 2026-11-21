import { workedSteps, type OperationPackage } from "@/lib/question-package";
import { ADDITION_TRANSFERS } from "./checked-addition";
import type { LessonKind } from "./regrouping-reads";

// #1144 (spec #1137, section 5): after a solved checked regrouping lesson, Maya offers one optional related question.
// The related question is code's own: a checked subtraction that needs one exchange, with different numbers. It never
// replaces the call's question: the session package, outcome reason and learning event stay the original question's.
// #1153: an addition lesson offers a related addition the same way.

/** Maya's offer. Its exact text is the pending marker: the next child turn answers it only right after it. */
export const TRANSFER_OFFER = "Do you want to try one more like this on your own?";
/** The goodbye after a declined offer or a finished related question. */
export const TRANSFER_GOODBYE = "Great work today. Bye for now!";
/** A related question needs this much time before the call starts closing, or Maya does not offer it. */
export const TRANSFER_MIN_MS = 2 * 60_000;

export type TransferOperands = [number, number];

/** Related questions to try in order: each needs one exchange of a ten, as 52 - 28 does (63 - 27 first, per #1137). */
const CANDIDATES: readonly TransferOperands[] = [[63, 27], [74, 38], [85, 49], [61, 35], [93, 56], [52, 28], [42, 17]];
const candidatesFor = (kind: LessonKind) => kind === "add" ? ADDITION_TRANSFERS : CANDIDATES;
const solve = (kind: LessonKind, [top, bottom]: TransferOperands) => kind === "add" ? top + bottom : top - bottom;
const sign = (kind: LessonKind) => kind === "add" ? "+" : "-";

/** The related question as a checked package for code's own readings. Its reference stays the original question's. */
export function transferPackage(pkg: OperationPackage, [top, bottom]: TransferOperands): OperationPackage {
  const kind: LessonKind = pkg.operation.kind === "add" ? "add" : "subtract";
  const operation = { kind, operands: [top, bottom] as [number, number] };
  return {
    ...pkg,
    id: `${pkg.id}:transfer`,
    text: `${top} ${sign(kind)} ${bottom} = ?`,
    answer: { value: { type: "number", value: solve(kind, [top, bottom]) }, accepted: [], unit: null },
    operation,
    steps: workedSteps(operation),
    wrongAnswers: [],
  };
}

/**
 * The first related question that differs from the original, uses no minuend Maya already worked on the board, and
 * whose answer nothing Maya said gives away (`disclosed`). Null when none qualifies.
 */
export function chooseTransfer(kind: LessonKind, original: TransferOperands, worked: readonly number[], disclosed: (operands: TransferOperands) => boolean): TransferOperands | null {
  const answer = solve(kind, original);
  return candidatesFor(kind).find((candidate) => candidate[0] !== original[0] && solve(kind, candidate) !== answer &&
    !worked.includes(candidate[0]) && !disclosed(candidate)) ?? null;
}

export function transferStartWords([top, bottom]: TransferOperands): string[] {
  return [`Here is one more: ${top} minus ${bottom}.`, "Try it on your own. What is the difference?"];
}

export function transferRetryWords([top, bottom]: TransferOperands): string[] {
  return [`Try ${top} minus ${bottom} again. What is the difference?`];
}

/** The board for the related question: earlier worked solutions go, and only the new question stays. */
export function transferBoard([top, bottom]: TransferOperands, kind: LessonKind = "subtract") {
  return [
    { op: "clear" as const, scope: "maya_objects" as const },
    { op: "write" as const, id: "transfer-question", text: `${top} ${sign(kind)} ${bottom} = ?`, place: { region: "main" as const } },
  ];
}

export function readTransferOperands(value: unknown): TransferOperands | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [top, bottom] = value;
  return [...CANDIDATES, ...ADDITION_TRANSFERS].some((candidate) => candidate[0] === top && candidate[1] === bottom) ? [top, bottom] : null;
}

export type RelatedStep = "transfer_retry" | "check_exchange" | "connect" | "ones" | "recheck_ones" | "tens" | "recheck_tens" | "combine" | "transfer_correct";
type RelatedSkill = "reversal" | "difference" | "explain_exchange" | "subtract_ones" | "subtract_tens" | "carry" | "sum" | "add_ones" | "add_tens";

/** Code's reads of one child turn of the related question. */
export interface RelatedReads {
  /** Maya's last step of the related question ("transfer" for its start). */
  previous: string;
  /** The operation's known mistake: the subtraction reversal, or an addition carry mistake. */
  reversal: boolean;
  repeat: boolean;
  asksExchange: boolean;
  knowsExchange: boolean;
  stuck: boolean;
  /** A right whole difference, by code's strict read. */
  rightWhole: boolean;
  /** The turn names the whole difference ("my answer"), so a step question does not hold it. */
  saysWhole: boolean;
  /** A committed plain number that is not the difference. */
  wrongWhole: boolean;
  ones: number | null;
  tens: number | null;
  heardOnes: boolean;
  heardTens: boolean;
}

/**
 * The next step of the related question. Support rises only when the child asks or shows a gap: a hint question, then
 * the trade in words. No step names a result, so the child's answer stays their own.
 */
export function relatedChoice(r: RelatedReads, kind: LessonKind, [top, bottom]: TransferOperands): { step: RelatedStep; observation?: [RelatedSkill, "correct" | "incorrect"] } {
  const add = kind === "add";
  const ones = add ? top % 10 + bottom % 10 - 10 : top % 10 + 10 - bottom % 10;
  const tens = add ? Math.floor(top / 10) + Math.floor(bottom / 10) + 1 : Math.floor(top / 10) - 1 - Math.floor(bottom / 10);
  const skill = { ones: add ? "add_ones" : "subtract_ones", tens: add ? "add_tens" : "subtract_tens", whole: add ? "sum" : "difference" } as const;
  const again: RelatedStep = r.previous === "transfer" || r.previous === "transfer_retry" ? "transfer_retry" : r.previous as RelatedStep;
  if (r.reversal) return add ? { step: "recheck_tens", observation: ["carry", "incorrect"] } : { step: "recheck_ones", observation: ["reversal", "incorrect"] };
  if (r.repeat) return { step: again };
  if (r.asksExchange) return { step: "connect" };
  // Only a step that asks for a column count holds a bare number as that count.
  const stepQuestion = ["connect", "ones", "recheck_ones", "tens", "recheck_tens"].includes(r.previous);
  if (r.rightWhole && (!stepQuestion || r.saysWhole)) return { step: "transfer_correct", observation: [skill.whole, "correct"] };
  if (r.previous === "check_exchange") {
    if (r.knowsExchange) return { step: "ones", observation: ["explain_exchange", "correct"] };
    if (r.stuck) return { step: "connect" };
  }
  if (r.previous === "connect" || r.previous === "ones" || r.previous === "recheck_ones") {
    if (r.ones === ones || r.heardOnes) return { step: "tens", observation: [skill.ones, "correct"] };
    if (r.ones !== null) return { step: "ones", observation: [skill.ones, "incorrect"] };
    if (r.stuck) return { step: "ones" };
  }
  if (r.previous === "tens" || r.previous === "recheck_tens") {
    if (r.tens === tens || r.heardTens) return { step: "combine", observation: [skill.tens, "correct"] };
    if (r.tens !== null) return { step: add && r.tens === tens - 1 ? "recheck_tens" : "tens", observation: [skill.tens, "incorrect"] };
    if (r.stuck) return { step: "tens" };
  }
  if (r.previous === "combine" && r.wrongWhole) return { step: "combine", observation: [skill.whole, "incorrect"] };
  if (again === "transfer_retry" && (r.wrongWhole || r.stuck)) {
    return { step: "check_exchange", ...(r.wrongWhole ? { observation: [skill.whole, "incorrect"] as [RelatedSkill, "incorrect"] } : {}) };
  }
  return { step: again };
}
