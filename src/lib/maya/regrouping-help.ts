import { solvesQuestion, type ExchangeTurn, type RegroupingObservation } from "./checked-exchange";
import type { Assistance, Outcome, Session } from "./session";

// The help a checked regrouping lesson gave (#1143, #1144, #1153): what reached the child, kept apart for the call's
// question and its related question, so hinted, demonstrated and independent work stay distinct evidence.

export function recordExchangeHelp(s: Session, kind: "hint" | "guided") {
  if (!s.assistance.includes(kind)) s.assistance.push(kind);
  s.stuckStep ??= "ones";
}

export function recordRegroupingSupport(s: Session, turn: ExchangeTurn, support: "hinted" | "demonstrated") {
  // #1144: help on the related question stays on its own turns; the original question's help is unchanged.
  if (turn.transfer) {
    if (turn.support !== "demonstrated") turn.support = support;
    return;
  }
  if (!s.checkedExchange?.progression) {
    recordExchangeHelp(s, "guided");
    return;
  }
  if (turn.support === "demonstrated" || turn.support === support) return;
  turn.support = support;
  if (support === "hinted") s.hints += 1;
  recordExchangeHelp(s, support === "hinted" ? "hint" : "guided");
}

/** The help a turn gives once it reaches the child: the exchange shown or done, or a question that points to a step. */
export function regroupingHelp(turn: ExchangeTurn): ExchangeTurn["support"] {
  const step = turn.instruction?.step;
  if (turn.transfer && (step === "check_exchange" || step === "combine")) return "hinted";
  if (step === "connect" || (!step && !turn.prompt)) return "demonstrated";
  if (turn.prompt || step === "ones" || step === "recheck_ones" || step === "tens" || step === "recheck_tens") return "hinted";
}

function unconfirmedRegroupingHelp(s: Session): NonNullable<ExchangeTurn["support"]>[] {
  const lesson = s.checkedExchange;
  if (lesson?.progression !== 1) return [];
  return lesson.turns.filter((turn) => !turn.transfer).map(unconfirmedHelp).filter((help) => help !== undefined);
}

function unconfirmedHelp(turn: ExchangeTurn): ExchangeTurn["support"] {
  if (!turn.sent || turn.playback === "finished") return undefined;
  const help = regroupingHelp(turn);
  return help && (!turn.support || (turn.support === "hinted" && help === "demonstrated")) ? help : undefined;
}

export function helpUnconfirmed(s: Session, assistance: Assistance): boolean {
  const unconfirmed = unconfirmedRegroupingHelp(s);
  return assistance === "independent" ? unconfirmed.length > 0 : assistance === "hint" && unconfirmed.includes("demonstrated");
}

export function recordRegroupingDelivery(s: Session, turn: ExchangeTurn) {
  const support = regroupingHelp(turn);
  if (support) recordRegroupingSupport(s, turn, support);
}

export function regroupingObservation(s: Session, skill: RegroupingObservation["skill"], result: RegroupingObservation["result"]): RegroupingObservation {
  const turns = s.checkedExchange!.turns;
  const demonstrated = turns.some((turn) => turn.support === "demonstrated");
  const hinted = turns.some((turn) => turn.support === "hinted") || s.assistance.includes("hint");
  const assistedElsewhere = s.assistance.some((kind) => kind !== "independent" && kind !== "hint");
  // A demonstration the child may have heard part of is stronger help than a hint: the help is unknown.
  const assistance = demonstrated || assistedElsewhere ? "demonstrated" : unconfirmedRegroupingHelp(s).includes("demonstrated") ? "uncertain" :
    hinted ? "hinted" : unconfirmedRegroupingHelp(s).length ? "uncertain" : "independent";
  return { skill, result, assistance, at: s.now! };
}

/** The help the related question had so far, from its own turns only. */
export function transferAssistance(s: Session): RegroupingObservation["assistance"] {
  const turns = s.checkedExchange?.turns.filter((turn) => turn.transfer) ?? [];
  if (turns.some((turn) => turn.support === "demonstrated")) return "demonstrated";
  const unconfirmed = turns.map(unconfirmedHelp);
  // A demonstration the child may have heard part of is stronger help than a finished hint: the help is unknown.
  if (unconfirmed.includes("demonstrated")) return "uncertain";
  if (turns.some((turn) => turn.support === "hinted")) return "hinted";
  return unconfirmed.some(Boolean) ? "uncertain" : "independent";
}

export function transferOutcome(s: Session): Pick<Outcome, "transfer"> {
  const transfer = s.checkedExchange?.transfer;
  if (transfer?.state !== "started" && transfer?.state !== "finished") return {};
  const solved = s.checkedExchange!.turns.find((turn) => turn.transfer && solvesQuestion(turn.observation?.skill) && turn.observation!.result === "correct");
  return { transfer: { result: solved ? "right" : "unfinished", assistance: solved?.observation?.assistance ?? transferAssistance(s) } };
}
