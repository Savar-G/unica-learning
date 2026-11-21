import type { Command } from "@/lib/board";
import type { OperationPackage } from "@/lib/question-package";
import { multiplyFacts, multiplyTransferPackage, multiplyWords, unitDisplay, type CheckedMultiplyLesson, type MultiplyTurn } from "./checked-multiply";
import { multiplyAdditiveError, multiplyBatchCommands, multiplyClaimConflict, multiplyHelp, multiplySwappedContext, multiplyTransferOutcome } from "./multiply-lesson";
import type { MultiplySessionHost } from "./multiply-lesson";
import type { Session } from "./session";
import type { TransferOperands } from "./transfer";

// The checked multiplication lesson's side of the session (#1154): what a delivered turn changes in the lesson, how
// delivery and board fates confirm its help, and how its evidence reads. The session passes in the few session
// effects these need (`MultiplyHelpPort`), so this module never imports the session.

/** Records confirmed help on the call: a hint counts once per turn, and both reach the call's assistance. */
export interface MultiplyHelpPort {
  help(kind: "hint" | "guided"): void;
}

/** Confirmed help on one turn. Help on the related question stays on its own turns. */
export function recordMultiplySupport(turn: MultiplyTurn, support: "hinted" | "demonstrated", port: MultiplyHelpPort) {
  if (turn.transfer) {
    if (turn.support !== "demonstrated") turn.support = support;
    return;
  }
  if (turn.support === "demonstrated" || turn.support === support) return;
  turn.support = support;
  port.help(support === "hinted" ? "hint" : "guided");
}

export type MultiplyDeliveryEvent =
  | { type: "exchange_presented"; batchId: string }
  | { type: "exchange_sent"; turnId: string }
  | { type: "exchange_playback"; turnId: string; playback: "finished" | "interrupted" };

/** Chat help counts once sent; voice help once its playback finished; a shown batch can then be marked presented. */
export function multiplyDelivery(lesson: CheckedMultiplyLesson, event: MultiplyDeliveryEvent, chat: boolean, port: MultiplyHelpPort) {
  if (event.type === "exchange_presented") {
    const action = lesson.turns.flatMap((turn) => turn.actions).find((a) => a.batchId === event.batchId);
    if (action?.fate === "shown") action.presented = true;
    return;
  }
  const turn = lesson.turns.find((t) => t.id === event.turnId);
  if (!turn) return;
  if (event.type === "exchange_sent") {
    turn.sent = true;
    for (const action of turn.actions) action.delivery = "sent";
    const support = chat ? multiplyHelp(turn) : undefined;
    if (support) recordMultiplySupport(turn, support, port);
    return;
  }
  if (!turn.playback && turn.actions.every((a) => a.delivery === "sent")) {
    turn.playback = event.playback;
    const support = event.playback === "finished" ? multiplyHelp(turn) : undefined;
    if (support) recordMultiplySupport(turn, support, port);
  }
}

/**
 * The screen's word on one sent batch. Once shown, every batch whose own link is shown confirms its turn's help: a
 * drawn groups board is a hint, the rest follow the turn. Returns false when the batch is not this lesson's.
 */
export function multiplyBoardFate(lesson: CheckedMultiplyLesson, batchId: string, fate: "shown" | "skipped" | "cancelled", port: MultiplyHelpPort): boolean {
  const actions = lesson.turns.flatMap((turn) => turn.actions);
  const action = actions.find((a) => a.batchId === batchId);
  if (!action) return false;
  if (action.delivery !== "sent" || action.fate) return true;
  action.fate = fate;
  if (fate !== "shown") return true;
  const shown = new Set(actions.filter((a) => a.fate === "shown").map((a) => a.batchId));
  for (const turn of lesson.turns) {
    for (const item of turn.actions) {
      if (!shown.has(item.batchId) || (item.after && !shown.has(item.after)) || item.kind === "question" || item.kind === "clear") continue;
      const support = item.kind === "show" || item.kind === "replace" ? "hinted" : multiplyHelp(turn);
      if (support) recordMultiplySupport(turn, support, port);
    }
  }
  return true;
}

/** What the session needs to apply a planned turn. */
export interface MultiplyDelivered {
  text: string;
  closes: boolean;
  solved: boolean;
  boards: { sentence: number; transactionId: string; commands: Command[]; after?: string[] }[];
}

/**
 * Applies a planned turn to the lesson: its visual support and built rows, the related question's state, and the
 * turn itself. `transfer` is the related question chosen now (for an offer). The session applies the rest.
 */
export function applyMultiplyTurn(
  lesson: CheckedMultiplyLesson,
  plan: MultiplyTurn,
  at: { now: number; eventKey: string },
  transfer: () => TransferOperands | null,
): MultiplyDelivered {
  const show = plan.actions.some((a) => a.kind === "show" || a.kind === "replace" || a.kind === "question");
  const words = multiplyWords(plan.facts, plan.instruction, show) ?? [];
  const step = plan.instruction.step;
  if (plan.facts.example) {
    lesson.visualSupport = "full";
    lesson.builtGroups = 0;
  } else if (!plan.transfer) {
    lesson.visualSupport = plan.facts.visualSupport;
    lesson.builtGroups = Math.max(lesson.builtGroups, plan.facts.builtGroups);
  }
  if (step === "offer") lesson.transfer = { operands: transfer()!, state: "offered", done: [] };
  if (step === "decline" && lesson.transfer?.state === "offered") lesson.transfer.state = "declined";
  if (step === "transfer") {
    Object.assign(lesson.transfer!, { state: "started", startedAt: at.now, eventKey: at.eventKey });
    lesson.visualSupport = "faded";
  }
  if (step === "transfer_correct") lesson.transfer!.state = "finished";
  lesson.turns.push(plan);
  const boards = plan.actions.map((action, index) => {
    const raw = (action.kind === "show" || action.kind === "replace") && step !== "worked_example" ? 1 : index;
    return {
      sentence: Math.min(raw, Math.max(0, words.length - 1)),
      transactionId: action.batchId,
      commands: multiplyBatchCommands(action, plan, lesson.transfer?.operands),
      ...(action.after ? { after: [action.after] } : {}),
    };
  });
  return { text: words.join(" "), closes: step === "decline" || step === "transfer_correct", solved: step === "correct" || step === "offer", boards };
}

/** The whole-number answer the child committed to, read with the question's own item noun or unit after it. */
export function multiplyCommittedNumber(
  lesson: CheckedMultiplyLesson | undefined,
  body: string | null,
  wholeValue: (text: string) => number | null,
): number | null {
  if (body === null) return null;
  const stripped = body.replace(/^(?:my (?:final )?answer is|i got|it'?s|it is)\s+/, "");
  const value = wholeValue(stripped);
  if (value !== null || !lesson) return value;
  const tails = [lesson.context.itemNoun, lesson.context.unit, unitDisplay(lesson.context.unit)]
    .filter((x): x is string => !!x)
    .map((x) => x.toLowerCase());
  for (const tail of tails) {
    if (!stripped.endsWith(` ${tail}`)) continue;
    const found = wholeValue(stripped.slice(0, -(tail.length + 1)).trim());
    if (found !== null) return found;
  }
  return null;
}

/** A right number the child gave with wrong groups or as a sum is not the lesson's answer. */
export function multiplyHidesAnswer(lesson: CheckedMultiplyLesson | undefined, pkg: OperationPackage, text: string): boolean {
  if (!lesson || pkg.operation.kind !== "multiply") return false;
  const ctx = lesson.context;
  const facts = multiplyFacts(ctx.groups, ctx.size, lesson.builtGroups, false, lesson.visualSupport, ctx);
  return !!facts && (multiplyClaimConflict(text, facts) !== null || multiplyAdditiveError(text, ctx.groups, ctx.size, null));
}

/** Swapped groups or an added pair are the lesson's mistakes to teach, not a changed problem. */
export function multiplyKeepsProblem(lesson: CheckedMultiplyLesson | undefined, pkg: OperationPackage, text: string): boolean {
  if (!lesson || pkg.operation.kind !== "multiply") return false;
  const ctx = lesson.context;
  const facts = multiplyFacts(ctx.groups, ctx.size, lesson.builtGroups, false, lesson.visualSupport, ctx);
  const [a, b] = pkg.operation.operands;
  return (!!facts && multiplySwappedContext(text, facts)) || multiplyAdditiveError(text, a, b, null);
}

/** The related question's learning event fields, or null before it started. */
export function multiplyTransferEvent(lesson: CheckedMultiplyLesson, pkg: OperationPackage): {
  text: string;
  result: "right" | "right_with_help" | "blank";
  hintedTurns: number;
  startedAt?: number;
  assistance: NonNullable<ReturnType<typeof multiplyTransferOutcome>["transfer"]>["assistance"];
} | null {
  const transfer = lesson.transfer;
  if (transfer?.state !== "started" && transfer?.state !== "finished") return null;
  const outcome = multiplyTransferOutcome(lesson).transfer!;
  return {
    text: multiplyTransferPackage(pkg, transfer.operands).text,
    result: outcome.result === "unfinished" ? "blank" : outcome.assistance === "independent" ? "right" : "right_with_help",
    hintedTurns: lesson.turns.filter((turn) => turn.transfer && turn.support === "hinted").length,
    startedAt: transfer.startedAt,
    assistance: outcome.assistance,
  };
}

/** The session reads the lesson needs that only the session can make (its answer readers and checks). */
export type MultiplySessionReads = Pick<MultiplySessionHost, "closingAtMs" | "tutorTeachingNow" | "isTeachingState" |
  "hasAlternatives" | "rightProduct" | "childSaysFalse" | "committedNumber" | "yesReply" | "doneReply" | "tellsAnswer" | "boardTexts">;

/** The lesson's view of the session: plain session fields plus the session's own reads. */
export function multiplySessionHost(s: Session, reads: MultiplySessionReads): MultiplySessionHost {
  return {
    callId: s.callId,
    now: s.now,
    startedAt: s.startedAt,
    channel: s.channel ?? "voice",
    state: s.state,
    expect: s.expect,
    batches: s.batches,
    outcome: s.outcome,
    solved: s.solved,
    lastResult: s.lastResult,
    noBoard: s.noBoard === true,
    stopRequested: s.stopRequested,
    sensitiveHold: s.sensitiveHold,
    safetyFlagged: s.safety.flagged,
    scopeDue: s.scopeDue,
    turn: s.turn ? { text: s.turn.text, uncertain: s.turn.uncertain } : null,
    turns: s.turns,
    assistance: s.assistance,
    package: s.package,
    checkedMultiply: s.checkedMultiply,
    ...reads,
  };
}
