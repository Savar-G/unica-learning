import { workedSteps, type OperationPackage } from "@/lib/question-package";

// #1144 (spec #1137, section 5): after a solved checked regrouping lesson, Maya offers one optional related question.
// The related question is code's own: a checked subtraction that needs one exchange, with different numbers. It never
// replaces the call's question: the session package, outcome reason and learning event stay the original question's.

/** Maya's offer. Its exact text is the pending marker: the next child turn answers it only right after it. */
export const TRANSFER_OFFER = "Do you want to try one more like this on your own?";
/** The goodbye after a declined offer or a finished related question. */
export const TRANSFER_GOODBYE = "Great work today. Bye for now!";
/** A related question needs this much time before the call starts closing, or Maya does not offer it. */
export const TRANSFER_MIN_MS = 2 * 60_000;

export type TransferOperands = [number, number];

/** Related questions to try in order: each needs one exchange of a ten, as 52 - 28 does (63 - 27 first, per #1137). */
const CANDIDATES: readonly TransferOperands[] = [[63, 27], [74, 38], [85, 49], [61, 35], [93, 56], [52, 28], [42, 17]];

/** The related question as a checked package for code's own readings. Its reference stays the original question's. */
export function transferPackage(pkg: OperationPackage, [top, bottom]: TransferOperands): OperationPackage {
  const operation = { kind: "subtract" as const, operands: [top, bottom] as [number, number] };
  return {
    ...pkg,
    id: `${pkg.id}:transfer`,
    text: `${top} - ${bottom} = ?`,
    answer: { value: { type: "number", value: top - bottom }, accepted: [], unit: null },
    operation,
    steps: workedSteps(operation),
    wrongAnswers: [],
  };
}

/**
 * The first related question that differs from the original, uses no minuend Maya already worked on the board, and
 * whose answer nothing Maya said gives away (`disclosed`). Null when none qualifies.
 */
export function chooseTransfer(original: TransferOperands, worked: readonly number[], disclosed: (operands: TransferOperands) => boolean): TransferOperands | null {
  const answer = original[0] - original[1];
  return CANDIDATES.find((candidate) => candidate[0] !== original[0] && candidate[0] - candidate[1] !== answer &&
    !worked.includes(candidate[0]) && !disclosed(candidate)) ?? null;
}

export function transferStartWords([top, bottom]: TransferOperands): string[] {
  return [`Here is one more: ${top} minus ${bottom}.`, "Try it on your own. What is the difference?"];
}

export function transferRetryWords([top, bottom]: TransferOperands): string[] {
  return [`Try ${top} minus ${bottom} again. What is the difference?`];
}

/** The board for the related question: earlier worked solutions go, and only the new question stays. */
export function transferBoard([top, bottom]: TransferOperands) {
  return [
    { op: "clear" as const, scope: "maya_objects" as const },
    { op: "write" as const, id: "transfer-question", text: `${top} - ${bottom} = ?`, place: { region: "main" as const } },
  ];
}

export function readTransferOperands(value: unknown): TransferOperands | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [top, bottom] = value;
  return CANDIDATES.some((candidate) => candidate[0] === top && candidate[1] === bottom) ? [top, bottom] : null;
}

export type RelatedStep = "transfer_retry" | "check_exchange" | "connect" | "ones" | "recheck_ones" | "tens" | "combine" | "transfer_correct";
type RelatedSkill = "reversal" | "difference" | "explain_exchange" | "subtract_ones" | "subtract_tens";

/** Code's reads of one child turn of the related question. */
export interface RelatedReads {
  /** Maya's last step of the related question ("transfer" for its start). */
  previous: string;
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
export function relatedChoice(r: RelatedReads, [top, bottom]: TransferOperands): { step: RelatedStep; observation?: [RelatedSkill, "correct" | "incorrect"] } {
  const again: RelatedStep = r.previous === "transfer" || r.previous === "transfer_retry" ? "transfer_retry" : r.previous as RelatedStep;
  if (r.reversal) return { step: "recheck_ones", observation: ["reversal", "incorrect"] };
  if (r.repeat) return { step: again };
  if (r.asksExchange) return { step: "connect" };
  // Only a step that asks for a column count holds a bare number as that count.
  const stepQuestion = ["connect", "ones", "recheck_ones", "tens"].includes(r.previous);
  if (r.rightWhole && (!stepQuestion || r.saysWhole)) return { step: "transfer_correct", observation: ["difference", "correct"] };
  if (r.previous === "check_exchange") {
    if (r.knowsExchange) return { step: "ones", observation: ["explain_exchange", "correct"] };
    if (r.stuck) return { step: "connect" };
  }
  if (r.previous === "connect" || r.previous === "ones" || r.previous === "recheck_ones") {
    if (r.ones === top % 10 + 10 - bottom % 10 || r.heardOnes) return { step: "tens", observation: ["subtract_ones", "correct"] };
    if (r.ones !== null) return { step: "ones", observation: ["subtract_ones", "incorrect"] };
    if (r.stuck) return { step: "ones" };
  }
  if (r.previous === "tens") {
    if (r.tens === Math.floor(top / 10) - 1 - Math.floor(bottom / 10) || r.heardTens) return { step: "combine", observation: ["subtract_tens", "correct"] };
    if (r.tens !== null) return { step: "tens", observation: ["subtract_tens", "incorrect"] };
    if (r.stuck) return { step: "tens" };
  }
  if (r.previous === "combine" && r.wrongWhole) return { step: "combine", observation: ["difference", "incorrect"] };
  if (again === "transfer_retry" && (r.wrongWhole || r.stuck)) {
    return { step: "check_exchange", ...(r.wrongWhole ? { observation: ["difference", "incorrect"] as [RelatedSkill, "incorrect"] } : {}) };
  }
  return { step: again };
}
