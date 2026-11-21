// #1156: the checked fraction lesson's state and planner. The session (session.ts) builds a FractionHost from its own
// state and keeps only thin dispatch hooks; every fraction lesson turn is planned and checked here.
import type { Command } from "@/lib/board";
import type { AnswerValue, OperationPackage } from "@/lib/question-package";
import { FRACTION_OBJECT, FRACTION_OFFER, chooseFractionTransfer, fractionChoice, fractionHelp, fractionMistake, fractionQuestionCommands,
  fractionShowCommands, fractionSplitCommands, fractionTransferPackage, fractionWords, packageFacts, quadFacts, readTransferQuad,
  type FractionFacts, type FractionInstruction, type FractionOp, type FractionSkill, type FractionStep, type Frac } from "./checked-fraction";
import { isEqualForm, rightForQuestion } from "./fractions";
import { readExchangeTarget, sameExchangeTarget, type ExchangeTarget } from "./checked-exchange";

type Quad = [number, number, number, number];

export interface FractionAction {
  id: string;
  kind: "show" | "split" | "question";
  batchId: string;
  after?: string;
  delivery: "generated" | "sent";
  fate?: "shown" | "skipped" | "cancelled";
  presented?: true;
}

export interface FractionObservation {
  skill: FractionSkill | "perform_split";
  result: "correct" | "incorrect";
  assistance: "independent" | "hinted" | "demonstrated" | "uncertain";
  at: number;
}

export interface FractionTurn {
  id: string;
  instruction: FractionInstruction;
  actions: FractionAction[];
  sent?: true;
  playback?: "finished" | "interrupted";
  prompt?: ExchangeTarget;
  childAction?: ExchangeTarget;
  support?: "hinted" | "demonstrated";
  observation?: FractionObservation;
  transfer?: true;
}

export interface CheckedFractionLesson {
  version: 1;
  id: string;
  op: FractionOp;
  a: Frac;
  b: Frac;
  asksSimplest: boolean;
  turns: FractionTurn[];
  transfer?: { quad: Quad; state: "offered" | "declined" | "started" | "finished"; startedAt?: number; eventKey?: string };
}

/** The proposal the adapter folds as a checked turn; the trace recomputes its words from it alone. */
export interface FractionProposal {
  checkedFraction: 1;
  op: FractionOp;
  a: Frac;
  b: Frac;
  instruction: FractionInstruction;
  boards: number;
  prompt?: true;
  childAction?: ExchangeTarget;
  afterFailure?: true;
}

/** What the planner reads from the session. Callbacks read the child's turn against a given package. */
export interface FractionHost {
  callId: string;
  now: number;
  startedAt: number | null;
  batches: number;
  closingAtMs: number;
  lesson: CheckedFractionLesson;
  package: OperationPackage;
  /** The session may plan a teaching turn now (state, priorities and gates allow it). */
  teachingNow: boolean;
  /** The screen may take the child's board action now (no turn in progress, the child's move). */
  childMove: boolean;
  noBoard: boolean;
  stopRequested: boolean;
  scopeDue: boolean;
  solved: boolean;
  text: string | null;
  unclear: boolean;
  /** Help noted outside the lesson's own turns (s.assistance), other than a hint. */
  assistedElsewhere: boolean;
  hintedElsewhere: boolean;
  /** Maya's earlier words, for the related question's disclosure check. */
  said: string[];
  heardRight: (pkg: OperationPackage) => boolean;
  final: (pkg: OperationPackage) => AnswerValue | null;
  tells: (pkg: OperationPackage, texts: string[]) => boolean;
  boardTexts: (command: Command) => string[];
  yes: boolean;
  done: boolean;
}

const STUCK = /^(?:i (?:still )?(?:don'?t|do not) (?:know|get it|understand)(?: how(?: to (?:start|do (?:it|this)|add|subtract))?)?|i(?:'m| am) (?:still )?(?:stuck|confused|new to (?:this|fractions))|i need help|can you help(?: me)?|help(?: me)?|i(?:'ve| have) never done this before)[.?!]*$/i;
const HOW = /^(?:(?:can|could) you )?(?:show|teach|tell) me how(?: to (?:add|subtract|do) (?:these |the |this )?(?:fractions?|it|this))?[.?!]*$|^how do (?:i|you|we) (?:add|subtract|do) (?:these |the |this )?(?:fractions?|it|this)[.?!]*$/i;
const REPEAT = /^(?:what did you say|(?:can|could) you repeat (?:that|it)|(?:say|explain) that again)[.?!]*$/i;

export function initCheckedFraction(callId: string, pkg: OperationPackage, asksSimplest: boolean): CheckedFractionLesson | null {
  const f = packageFacts(pkg);
  return f ? { version: 1, id: `${callId}:fraction`, op: f.op, a: f.a, b: f.b, asksSimplest, turns: [] } : null;
}

const lessonFacts = (l: CheckedFractionLesson) => packageFacts({ operation: { kind: l.op === "add" ? "fraction-add" : "fraction-subtract", operands: [
  { type: "fraction", numerator: l.a[0], denominator: l.a[1] }, { type: "fraction", numerator: l.b[0], denominator: l.b[1] }] }, answer: { unit: null } } as unknown as OperationPackage)!;

/** The facts a turn's words use: the related question's on its turns, else the original's. */
export function turnFacts(l: CheckedFractionLesson, turn: Pick<FractionTurn, "instruction">): FractionFacts {
  return turn.instruction.transfer ? quadFacts(l.op, turn.instruction.transfer)! : lessonFacts(l);
}

export function relatedPackage(h: Pick<FractionHost, "lesson" | "package">): OperationPackage | null {
  const t = h.lesson.transfer;
  return t?.state === "started" ? fractionTransferPackage(h.package, h.lesson.op, t.quad, h.lesson.asksSimplest) : null;
}

/** The board batches of one action. */
export function fractionCommands(l: CheckedFractionLesson, turn: FractionTurn, action: FractionAction): Command[] {
  const f = turnFacts(l, turn);
  if (action.kind === "question") return fractionQuestionCommands(f);
  if (action.kind === "split") return fractionSplitCommands(f);
  // The related question's strips come split already: Maya shows the same-size parts (a demonstration).
  return turn.transfer ? [...fractionShowCommands(f), ...fractionSplitCommands(f)] : fractionShowCommands(f);
}

export function fractionTurnWords(l: CheckedFractionLesson, turn: Pick<FractionTurn, "instruction">): string[] {
  return fractionWords(turnFacts(l, turn), turn.instruction) ?? [];
}

const allActions = (l: CheckedFractionLesson) => l.turns.flatMap((t) => t.actions);

/** Help precedence: a confirmed demonstration, then help nobody confirmed, then a confirmed hint, then none. */
function assistanceOf(h: FractionHost, turns: FractionTurn[], elsewhere: boolean): FractionObservation["assistance"] {
  if (turns.some((t) => t.support === "demonstrated") || (elsewhere && h.assistedElsewhere)) return "demonstrated";
  if (turns.some(unconfirmedHelp)) return "uncertain";
  if (turns.some((t) => t.support === "hinted") || (elsewhere && h.hintedElsewhere)) return "hinted";
  return "independent";
}

export const helpOf = (turn: FractionTurn) => fractionHelp(turn.instruction.step, !!turn.childAction);
const unconfirmedHelp = (t: FractionTurn) => !!t.sent && !t.support && t.playback !== "finished" && helpOf(t) !== undefined;
export const hasUnconfirmedFractionHelp = (l: CheckedFractionLesson | undefined) => !!l?.turns.some((t) => !t.transfer && unconfirmedHelp(t));

function observe(h: FractionHost, transfer: boolean, skill: FractionObservation["skill"], result: FractionObservation["result"]): FractionObservation {
  const turns = h.lesson.turns.filter((t) => !!t.transfer === transfer);
  return { skill, result, assistance: assistanceOf(h, turns, !transfer), at: h.now };
}

export function fractionTransferFor(h: FractionHost): Quad | null {
  const l = h.lesson;
  if (l.transfer || h.startedAt === null || h.now - h.startedAt > h.closingAtMs - 2 * 60_000) return null;
  return chooseFractionTransfer(lessonFacts(l), (q) => h.tells(fractionTransferPackage(h.package, l.op, q, l.asksSimplest), h.said));
}

function offerPending(h: FractionHost): boolean {
  const last = h.lesson.turns.at(-1);
  return h.lesson.transfer?.state === "offered" && !!last && fractionTurnWords(h.lesson, last).at(-1) === FRACTION_OFFER;
}

const count = (v: AnswerValue | null, common: number): number | null =>
  !v ? null : v.type === "number" && Number.isInteger(v.value) ? v.value : v.type === "fraction" && v.denominator === common ? v.numerator : null;

function newTurn(h: FractionHost, instruction: FractionInstruction, extra: Partial<FractionTurn> = {}): FractionTurn {
  return { id: `${h.lesson.id}:${h.lesson.turns.length + 1}`, instruction, actions: [], ...extra };
}

function action(h: FractionHost, kind: FractionAction["kind"], offset: number, after?: string): FractionAction {
  return { id: `${h.lesson.id}:${kind}`, kind, batchId: `${h.callId}-b${h.batches + offset}`, delivery: "generated", ...(after ? { after } : {}) };
}

/** Words and board of a planned turn must not give away the answer of the question it teaches. */
function discloses(h: FractionHost, pkg: OperationPackage, turn: FractionTurn): boolean {
  const board = turn.actions.flatMap((a) => fractionCommands(h.lesson, turn, a)).flatMap(h.boardTexts);
  return h.tells(pkg, [...fractionTurnWords(h.lesson, turn), ...board]);
}

/** The next checked fraction turn, or null: the existing route keeps the turn. */
export function planFractionTurn(h: FractionHost): FractionTurn | null {
  const l = h.lesson;
  if (!h.teachingNow || h.noBoard || h.text === null || h.stopRequested) return null;
  if (h.solved) {
    if (l.transfer?.state === "started") return relatedPlan(h);
    if (offerPending(h) && !h.scopeDue && !h.unclear) return offerReply(h);
    return null;
  }
  if (h.scopeDue || h.unclear) return null;
  const f = lessonFacts(l);
  const own = l.turns.filter((t) => !t.transfer);
  const previous = own.at(-1);
  const text = h.text.trim();
  const final = h.final(h.package);
  const split = own.some((t) => t.childAction || t.actions.some((a) => a.kind === "split" && a.fate === "shown"));
  const right = h.heardRight(h.package);
  const choice = fractionChoice(f, {
    previous: previous?.instruction.step,
    rightWhole: right,
    unsimplified: !right && !!final && isEqualForm(h.package, final) && !rightForQuestion(h.package, final),
    mistake: !right && final && !rightForQuestion(h.package, final) ? fractionMistake(f, final) : null,
    wrongWhole: !right && !!final && !rightForQuestion(h.package, final) && !isEqualForm(h.package, final),
    count: count(final, f.common),
    stuck: STUCK.test(text),
    asksHow: HOW.test(text),
    repeat: REPEAT.test(text),
    split,
  });
  if (!choice) return null;
  let step: FractionStep = choice.step;
  if (step === "correct" && fractionTransferFor(h)) step = "offer";
  const shows = step === "show" || step === "misconception";
  const shown = allActions(l).find((a) => !l.turns.find((t) => t.actions.includes(a))?.transfer && a.kind === "show" && a.fate === "shown");
  // An unknown delivery may have reached the board: wait for its fate before drawing again.
  if ((shows || step === "demonstrate") && allActions(l).some((a) => !a.fate)) return null;
  const turn = newTurn(h, { step }, choice.observation ? { observation: observe(h, false, choice.observation[0], choice.observation[1]) } : {});
  if (shows) {
    const show = shown ?? action(h, "show", 1);
    if (!shown) turn.actions.push(show);
    if (f.renamed && !split) {
      turn.prompt = { lessonId: l.id, turnId: turn.id, boardRevision: h.batches + (shown ? 0 : 1), objectId: FRACTION_OBJECT, batchId: show.batchId, parts: f.common };
    }
  }
  if (step === "demonstrate") {
    if (!shown) return null;
    turn.actions.push(action(h, "split", 1, shown.batchId));
  }
  return discloses(h, h.package, turn) ? null : turn;
}

/** Voice: a help request while a sent lesson batch has no fate yet waits for the board's answer before planning. */
export function fractionWaitingForBoard(h: FractionHost): boolean {
  return h.teachingNow && !h.solved && !h.unclear && h.text !== null && (STUCK.test(h.text.trim()) || HOW.test(h.text.trim())) &&
    allActions(h.lesson).some((a) => a.delivery === "sent" && !a.fate);
}

/** The screen offers the split once it drew the strips. */
export function childFractionTarget(h: FractionHost): ExchangeTarget | undefined {
  const prompt = h.lesson.turns.at(-1)?.prompt;
  if (!prompt || prompt.boardRevision !== h.batches || h.solved || h.noBoard || h.stopRequested || !h.childMove) return;
  const show = allActions(h.lesson).find((a) => a.batchId === prompt.batchId);
  if (show?.delivery === "sent" && show.fate !== "cancelled" && show.fate !== "skipped") return prompt;
}

export function planFractionChildAction(h: FractionHost, target: ExchangeTarget): FractionTurn | null {
  const offered = childFractionTarget(h);
  if (!offered || !sameExchangeTarget(offered, target) || !allActions(h.lesson).some((a) => a.batchId === target.batchId && a.fate === "shown")) return null;
  const turn = newTurn(h, { step: "renamed" }, { childAction: offered, observation: observe(h, false, "perform_split", "correct") });
  turn.actions.push(action(h, "split", 1, target.batchId));
  return discloses(h, h.package, turn) ? null : turn;
}

function offerReply(h: FractionHost): FractionTurn | null {
  const quad = h.lesson.transfer!.quad;
  if (h.yes) {
    const turn = newTurn(h, { step: "transfer", transfer: quad }, { transfer: true });
    turn.actions.push(action(h, "question", 1));
    return turn;
  }
  return h.done ? newTurn(h, { step: "decline" }) : null;
}

/** Every turn of a started related question is code's own: the model brief knows only the original question. */
function relatedPlan(h: FractionHost): FractionTurn {
  const l = h.lesson;
  const quad = l.transfer!.quad;
  const pkg = relatedPackage(h)!;
  const own = l.turns.filter((t) => t.transfer);
  const previous = own.at(-1)?.instruction.step ?? "transfer";
  const text = h.text!.trim();
  const unclear = h.unclear || h.scopeDue;
  const final = unclear ? null : h.final(pkg);
  const right = !unclear && h.heardRight(pkg);
  const stuck = STUCK.test(text) || HOW.test(text);
  const quit = !unclear && h.done && !/^(?:no|nope|nah)[.!]*$/i.test(text);
  const showed = own.some((t) => t.instruction.step === "transfer_show");
  let step: FractionStep;
  let observation: FractionObservation | undefined;
  if (quit) step = "decline";
  else if (right) { step = "transfer_correct"; observation = observe(h, true, "result", "correct"); }
  else if (!unclear && final && isEqualForm(pkg, final)) { step = "simplify"; observation = observe(h, true, "simplify", "incorrect"); }
  else if (!unclear && final) {
    step = previous === "transfer" ? "transfer_retry" : showed ? "count_hint" : "transfer_show";
    observation = observe(h, true, "result", "incorrect");
  } else if (stuck) step = previous === "transfer" ? "transfer_retry" : showed ? "count_hint" : "transfer_show";
  else step = previous === "transfer" ? "transfer_retry" : previous;
  const turn = newTurn(h, { step, transfer: quad }, { transfer: true, ...(observation ? { observation } : {}) });
  const closes = step === "decline" || step === "transfer_correct";
  const question = allActions(l).findLast((a) => a.kind === "question");
  if (!closes && (question?.fate === "cancelled" || question?.fate === "skipped")) turn.actions.push(action(h, "question", 1));
  if (step === "transfer_show") turn.actions.push(action(h, "show", turn.actions.length + 1));
  // A step that would give the related answer away falls back to asking it again.
  if (discloses(h, pkg, turn)) return newTurn(h, { step: "transfer_retry", transfer: quad }, { transfer: true });
  return turn;
}

export function fractionProposalOf(l: CheckedFractionLesson, turn: FractionTurn, afterFailure = false): FractionProposal {
  return {
    checkedFraction: 1, op: l.op, a: l.a, b: l.b, instruction: turn.instruction, boards: turn.actions.length,
    ...(turn.prompt ? { prompt: true } : {}), ...(turn.childAction ? { childAction: turn.childAction } : {}), ...(afterFailure ? { afterFailure: true } : {}),
  };
}

export function matchesFractionProposal(p: Record<string, unknown>, l: CheckedFractionLesson, turn: FractionTurn): boolean {
  const expected = fractionProposalOf(l, turn);
  return p.op === expected.op && JSON.stringify(p.a) === JSON.stringify(expected.a) && JSON.stringify(p.b) === JSON.stringify(expected.b) &&
    JSON.stringify(p.instruction) === JSON.stringify(expected.instruction) && p.boards === expected.boards &&
    (p.prompt === true) === !!expected.prompt && JSON.stringify(readExchangeTarget(p.childAction) ?? undefined) === JSON.stringify(expected.childAction);
}

/** Trace check: a fraction turn's saved words and board count follow from its proposal alone. */
export function checkedFractionOutput(proposal: unknown, output: unknown): boolean {
  if (!proposal || typeof proposal !== "object" || !output || typeof output !== "object") return false;
  const p = proposal as Partial<FractionProposal>;
  const o = output as { say?: unknown; board?: unknown; act?: unknown };
  if (p.checkedFraction !== 1 || (p.op !== "add" && p.op !== "subtract") || !Array.isArray(p.a) || !Array.isArray(p.b) ||
    !p.instruction || typeof p.instruction !== "object" || typeof p.boards !== "number") return false;
  const quad = p.instruction.transfer === undefined ? null : readTransferQuad(p.op, p.instruction.transfer);
  if (p.instruction.transfer !== undefined && !quad) return false;
  const facts = quad ? quadFacts(p.op, quad) : packageFacts({ operation: { kind: p.op === "add" ? "fraction-add" : "fraction-subtract", operands: [
    { type: "fraction", numerator: p.a[0], denominator: p.a[1] }, { type: "fraction", numerator: p.b[0], denominator: p.b[1] }] }, answer: { unit: null } } as unknown as OperationPackage);
  const words = facts ? fractionWords(facts, p.instruction) : null;
  const step = p.instruction.step;
  return !!words && Array.isArray(o.say) && o.say.length === 1 && o.say[0] === words.join(" ") && Array.isArray(o.board) &&
    o.board.length === p.boards && o.act === (step === "decline" || step === "transfer_correct" ? "close" : "guide");
}
