// #1156: the checked fraction lesson's session hooks: the host it plans from, delivery of a planned turn, and the help
// and evidence that delivery confirms. Kept out of session.ts, which passes its internals as FractionSessionHooks.
import type { Command } from "@/lib/board";
import { MAX_HINTS, MAX_TIME_MS, type NewLearningEvent } from "@/lib/learning-events";
import type { AnswerValue, OperationPackage } from "@/lib/question-package";
import type { Effect, Outcome, Session, SessionEvent, StepResult } from "./session";
import { fractionCommands, fractionTransferFor, fractionTurnWords, helpOf, relatedPackage, type CheckedFractionLesson, type FractionHost, type FractionTurn } from "./checked-fraction-session";

export interface FractionSessionHooks<S = Session> {
  teachingNow: (s: S) => boolean;
  childMove: (s: S) => boolean;
  closingAtMs: (s: S) => number;
  unclear: (s: S) => boolean;
  view: (s: S, pkg: OperationPackage) => S;
  heardRight: (s: S) => boolean;
  final: (s: S) => AnswerValue | null;
  tells: (s: S, pkg: OperationPackage, texts: string[]) => boolean;
  boardTexts: (command: Command) => string[];
  yes: (s: S) => boolean;
  done: (s: S) => boolean;
  recordHelp: (s: S, kind: "hint" | "guided") => void;
  close: (s: S, text: string, effects: Effect[]) => void;
  guide: (s: S, text: string) => void;
  eventKey: (s: S) => string;
}

export function checkedFractionHost(s: Session, h: FractionSessionHooks): FractionHost | null {
  const lesson = s.checkedFraction;
  if (!lesson || !s.package || s.now === null) return null;
  return {
    callId: s.callId, now: s.now, startedAt: s.startedAt, batches: s.batches, closingAtMs: h.closingAtMs(s),
    lesson, package: s.package,
    teachingNow: h.teachingNow(s), childMove: h.childMove(s),
    noBoard: s.noBoard === true, stopRequested: s.stopRequested, scopeDue: !!s.scopeDue, solved: s.solved !== null,
    text: s.turn?.text ?? null, unclear: h.unclear(s),
    assistedElsewhere: s.assistance.some((kind) => kind !== "independent" && kind !== "hint"),
    hintedElsewhere: s.assistance.includes("hint"),
    said: s.turns.filter((t) => t.speaker === "maya").map((t) => t.text),
    heardRight: (pkg) => h.heardRight(h.view(s, pkg)),
    final: (pkg) => h.final(h.view(s, pkg)),
    tells: (pkg, texts) => h.tells(h.view(s, pkg), pkg, texts),
    boardTexts: h.boardTexts,
    yes: h.yes(s), done: h.done(s),
  };
}

/** Records a turn's help once: on the related question only on its own turns, else in the call's ledger too. */
function recordSupport(s: Session, turn: FractionTurn, support: "hinted" | "demonstrated", h: FractionSessionHooks) {
  if (turn.support === "demonstrated" || turn.support === support) return;
  turn.support = support;
  if (!turn.transfer) h.recordHelp(s, support === "hinted" ? "hint" : "guided");
}

export function deliverFractionTurn(s: Session, plan: FractionTurn, effects: Effect[], h: FractionSessionHooks): StepResult {
  const lesson = s.checkedFraction!;
  const words = fractionTurnWords(lesson, plan);
  const text = words.join(" ");
  const step = plan.instruction.step;
  if (step === "correct" || step === "offer") {
    s.solved = "child";
    s.lastResult = "right";
  }
  if (step === "offer") lesson.transfer = { quad: transferQuad(s, h)!, state: "offered" };
  if (step === "decline" && lesson.transfer?.state === "offered") lesson.transfer.state = "declined";
  if (step === "transfer") Object.assign(lesson.transfer!, { state: "started", startedAt: s.now!, eventKey: h.eventKey(s) });
  if (step === "transfer_correct") lesson.transfer!.state = "finished";
  if (plan.childAction) {
    h.recordHelp(s, "guided");
    effects.push({ kind: "cancel_output" });
  }
  lesson.turns.push(plan);
  s.batches += plan.actions.length;
  const closes = step === "decline" || step === "transfer_correct";
  effects.push({ kind: "say", act: closes ? "close" : "guide", text, exchangeTurnId: plan.id });
  if (closes) {
    h.close(s, text, effects);
    return { session: s, effects, refusal: null };
  }
  for (const [index, action] of plan.actions.entries()) {
    // The strips come with the words that name them; the split with the words that say what changed.
    const sentence = Math.min(action.kind === "show" && step === "misconception" ? 1 : index, Math.max(0, words.length - 1));
    effects.push({
      kind: "board", sentence,
      batch: { transactionId: action.batchId, commands: fractionCommands(lesson, plan, action), ...(action.after ? { after: [action.after] } : {}) },
    });
  }
  h.guide(s, text);
  return { session: s, effects, refusal: null };
}

/** The related question chosen at the offer (the planner checked one qualifies). */
const transferQuad = (s: Session, h: FractionSessionHooks) => fractionTransferFor(checkedFractionHost(s, h)!);

export function fractionDeliveryEvent(s: Session, event: Extract<SessionEvent, { type: "exchange_sent" | "exchange_playback" | "exchange_presented" }>, h: FractionSessionHooks) {
  const lesson = s.checkedFraction!;
  if (event.type === "exchange_presented") {
    const action = lesson.turns.flatMap((t) => t.actions).find((a) => a.batchId === event.batchId);
    if (action?.fate === "shown") action.presented = true;
    return;
  }
  const turn = lesson.turns.find((t) => t.id === event.turnId);
  if (!turn) return;
  if (event.type === "exchange_sent") {
    turn.sent = true;
    for (const action of turn.actions) action.delivery = "sent";
    // Chat help is confirmed when sent; voice help when its playback finished.
    const support = helpOf(turn);
    if (s.channel === "chat" && support) recordSupport(s, turn, support, h);
  }
  if (event.type === "exchange_playback" && !turn.playback && turn.actions.every((a) => a.delivery === "sent")) {
    turn.playback = event.playback;
    const support = helpOf(turn);
    if (event.playback === "finished" && support) recordSupport(s, turn, support, h);
  }
}

const FATES = ["shown", "skipped", "cancelled"] as const;

/** A lesson batch's fate. Strips the child saw are a hint; a split the child saw confirms its turn's help. */
export function fractionBoardFate(s: Session, e: Extract<SessionEvent, { type: "board_fate" }>, h: FractionSessionHooks): boolean {
  const lesson = s.checkedFraction!;
  const turn = lesson.turns.find((t) => t.actions.some((a) => a.batchId === e.batch));
  const action = turn?.actions.find((a) => a.batchId === e.batch);
  if (!turn || !action) return false;
  if (action.delivery === "sent" && !action.fate && (FATES as readonly string[]).includes(e.fate)) {
    action.fate = e.fate as (typeof FATES)[number];
    if (e.fate === "shown" && action.kind !== "question") {
      const support = action.kind === "show" && !turn.transfer ? "hinted" : helpOf(turn);
      if (support) recordSupport(s, turn, support, h);
    }
  }
  return true;
}

/** The help the related question had, from its own turns only (unconfirmed help wins over a confirmed hint). */
function relatedAssistance(l: CheckedFractionLesson): NonNullable<Outcome["transfer"]>["assistance"] {
  const turns = l.turns.filter((t) => t.transfer);
  if (turns.some((t) => t.support === "demonstrated")) return "demonstrated";
  if (turns.some((t) => t.sent && !t.support && t.playback !== "finished" && helpOf(t))) return "uncertain";
  return turns.some((t) => t.support === "hinted") ? "hinted" : "independent";
}

export function fractionTransferOutcome(l: CheckedFractionLesson): Pick<Outcome, "transfer"> {
  if (l.transfer?.state !== "started" && l.transfer?.state !== "finished") return {};
  const solved = l.turns.find((t) => t.transfer && t.observation?.skill === "result" && t.observation.result === "correct");
  return { transfer: { result: solved ? "right" : "unfinished", assistance: solved?.observation?.assistance ?? relatedAssistance(l) } };
}

/** The related question's learning event, beside the call question's (#1144 rules: it names that event, never the workbook). */
export function fractionTransferEvent(session: Session, original: NewLearningEvent, relatedEventId: string, key: string, endTime: number): NewLearningEvent | null {
  const l = session.checkedFraction!;
  if (l.transfer?.state !== "started" && l.transfer?.state !== "finished") return null;
  const outcome = fractionTransferOutcome(l).transfer!;
  const result = outcome.result === "unfinished" ? "blank" : outcome.assistance === "independent" ? "right" : "right_with_help";
  const started = l.transfer.startedAt ?? session.startedAt!;
  const pkg = relatedPackage({ lesson: { ...l, transfer: { ...l.transfer, state: "started" } }, package: session.package! })!;
  return {
    ...original,
    key,
    question: { source: "transfer", relatedEventId, text: pkg.text },
    result,
    stuckStep: result === "right" ? null : "result",
    hints: Math.min(l.turns.filter((t) => t.transfer && t.support === "hinted").length, MAX_HINTS),
    timeMs: Math.min(Math.max(0, endTime - started), MAX_TIME_MS),
    assistance: outcome.assistance,
  };
}
