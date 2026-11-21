import type { Command } from "@/lib/board";
import type { OperationPackage } from "@/lib/question-package";
import {
  chooseDivisionTransfer,
  DIVISION_CHILD_REQUEST,
  DIVISION_DEMO_REQUEST,
  DIVISION_HELP,
  DIVISION_KNOWS_EXCHANGE,
  DIVISION_REPEAT,
  DIVISION_START,
  divisionChoice,
  divisionCommands,
  divisionDemoWords,
  divisionExampleCandidates,
  divisionFacts,
  divisionFactsFromExchange,
  divisionHelpLevel,
  divisionMisconception,
  divisionOffersAction,
  divisionPromptWords,
  divisionReason,
  divisionBecauseAnswer,
  divisionShownTexts,
  divisionRelatedChoice,
  divisionTransferBoard,
  divisionTransferPackage,
  divisionWords,
  toExchangeFacts,
  type DivisionFacts,
  type DivisionInstruction,
  type DivisionSkill,
  type DivisionStep,
} from "./checked-division";
import {
  EXCHANGE_OBJECT,
  SHARE_OBJECT,
  type CheckedExchangeLesson,
  type ExchangeAction,
  type ExchangeTarget,
  type ExchangeTurn,
  type RegroupingObservation,
} from "./checked-exchange";
import { TRANSFER_MIN_MS, TRANSFER_OFFER, type TransferOperands } from "./transfer";

export interface DivisionSessionState {
  callId: string;
  grade?: number | null;
  startedAt: number | null;
  now: number | null;
  solved: unknown;
  lastResult: unknown;
  noBoard?: boolean;
  stopRequested?: boolean;
  scopeDue?: unknown;
  batches: number;
  done: string[];
  turn: { text: string; uncertain?: boolean } | null;
  turns: { speaker: string; text: string; act?: string }[];
  package: OperationPackage | null;
  checkedExchange?: CheckedExchangeLesson;
}

export interface DivisionSessionDeps {
  tutorTeachingNow: () => boolean;
  hasTranscriptAlternatives: () => boolean;
  closingAtMs: number;
  tellsAnswer: (pkg: OperationPackage, words: readonly string[], boardTexts: readonly string[]) => boolean;
  heardAnswers: (pkgOverride?: OperationPackage, doneOverride?: string[]) => { step: string; verdict: string }[];
  wholeTurn: (text: string) => string | null;
  wholeValue: (text: string) => number | null;
  plainNumber: (text: string) => number | null;
  saysGuess: (text: string) => boolean;
  childSaysFalse: (text: string) => boolean;
  yesReply: (text: string) => boolean;
  doneReply: (text: string) => boolean;
  transferAssistance: () => RegroupingObservation["assistance"];
  observation: (skill: DivisionSkill, result: "correct" | "incorrect") => RegroupingObservation;
}

export function divisionWaitingForBoard(text: string): boolean {
  return DIVISION_CHILD_REQUEST.test(text) || DIVISION_DEMO_REQUEST.test(text);
}

export function divisionSharedBefore(turns: readonly ExchangeTurn[]): boolean {
  return turns.some((t) => t.actions.some((a) => a.kind === "share" && a.fate === "shown"));
}

export function divisionExchangedBefore(turns: readonly ExchangeTurn[]): boolean {
  return turns.some((t) => t.actions.some((a) => a.kind === "exchange" && a.fate === "shown"));
}

export function matchesDivisionInstruction(value: unknown, expected: DivisionInstruction | undefined): boolean {
  if (!expected) return value === undefined;
  if (typeof value !== "object" || value === null) return false;
  const v = value as DivisionInstruction;
  return v.step === expected.step &&
    v.usePlaceValueTerms === expected.usePlaceValueTerms &&
    v.fromShare === expected.fromShare &&
    v.offerAction === expected.offerAction &&
    JSON.stringify(v.transfer) === JSON.stringify(expected.transfer);
}

export function divisionTransferFor(s: DivisionSessionState, deps: DivisionSessionDeps): TransferOperands | null {
  const lesson = s.checkedExchange;
  const pkg = s.package;
  if (!lesson?.progression || lesson.transfers !== 1 || lesson.transfer || pkg?.operation.kind !== "divide" ||
    s.startedAt === null || s.now === null || s.now - s.startedAt > deps.closingAtMs - TRANSFER_MIN_MS) return null;
  const said = s.turns.filter((turn) => turn.speaker === "maya").map((turn) => turn.text);
  return chooseDivisionTransfer(
    pkg.operation.operands as TransferOperands,
    lesson.turns.map((turn) => turn.facts.value),
    (operands) => deps.tellsAnswer(divisionTransferPackage(pkg, operands), said, []),
  );
}

function divisionOfferPending(s: DivisionSessionState): boolean {
  const last = s.turns.findLast((turn) => turn.speaker === "maya" && turn.act !== "wait" && turn.act !== "check_in");
  return s.checkedExchange?.transfer?.state === "offered" && s.lastResult === "right" && !!last?.text.endsWith(TRANSFER_OFFER);
}

function transferQuestionAction(s: DivisionSessionState): ExchangeAction {
  return { kind: "question", id: `${s.checkedExchange!.id}:question`, batchId: `${s.callId}-b${s.batches + 1}`, delivery: "generated" };
}

function divisionOfferReplyPlan(s: DivisionSessionState, deps: DivisionSessionDeps): ExchangeTurn | null {
  const lesson = s.checkedExchange!;
  const transfer = lesson.transfer!;
  const text = s.turn!.text;
  const step: DivisionStep | null = deps.yesReply(text) ? "transfer" : deps.doneReply(text) ? "decline" : null;
  if (!step) return null;
  const tf = divisionFacts(transfer.operands[0], transfer.operands[1], false)!;
  return {
    id: `${lesson.id}:${lesson.turns.length + 1}`,
    facts: step === "transfer" ? toExchangeFacts(tf) : lesson.turns.at(-1)!.facts,
    actions: step === "transfer" ? [transferQuestionAction(s)] : [],
    instruction: { step, ...(step === "transfer" ? { transfer: transfer.operands } : {}) },
    ...(step === "transfer" ? { transfer: true as const } : {}),
  };
}

function divisionRelatedPlan(s: DivisionSessionState, deps: DivisionSessionDeps): ExchangeTurn {
  const lesson = s.checkedExchange!;
  const transfer = lesson.transfer!;
  const [dividend, divisor] = transfer.operands;
  const facts = divisionFacts(dividend, divisor, false)!;
  const pkg = divisionTransferPackage(s.package!, transfer.operands);
  const text = s.turn!.text.trim();
  const body = deps.wholeTurn(text);
  const count = (place: "one" | "ten") => body === null ? null :
    deps.wholeValue(body.replace(/^(?:there (?:are|is)|i have|each group (?:has|gets)) /, "").replace(new RegExp(` ${place}s?$`), ""));
  const unclear = s.turn!.uncertain || deps.hasTranscriptAlternatives();
  const heard = unclear || s.scopeDue ? [] : deps.heardAnswers(pkg, [...transfer.done]);
  const right = (step: string) => heard.some((a) => a.step === step && a.verdict === "right");
  const said = body === null || deps.saysGuess(text) ? null : deps.wholeValue(body.replace(/^(?:my (?:final )?answer is|i got|it'?s|it is) /, ""));
  const previous = lesson.turns.filter((turn) => turn.transfer).at(-1)?.instruction?.step ?? "transfer";
  const done = !unclear && deps.doneReply(text) && !/^(?:no|nope|nah)[.!]*$/i.test(text);
  const choice = done
    ? { step: "decline" as DivisionStep }
    : unclear
      ? { step: (previous === "transfer" ? "transfer_retry" : previous) as DivisionStep }
      : divisionRelatedChoice({
          previous,
          misconception: divisionMisconception(body, text, dividend, divisor, deps.plainNumber, deps.saysGuess),
          repeat: DIVISION_REPEAT.test(text),
          asksDemo: DIVISION_DEMO_REQUEST.test(text) || DIVISION_CHILD_REQUEST.test(text),
          knowsExchange: !!body && DIVISION_KNOWS_EXCHANGE.test(body),
          stuck: DIVISION_START.test(text) || DIVISION_HELP.test(text),
          rightWhole: !deps.childSaysFalse(text) && !deps.saysGuess(text) && (right("result") || divisionBecauseAnswer(body, deps.plainNumber) === facts.quotient),
          saysWhole: /\b(?:my (?:final )?answer|(?:whole|final) (?:answer|quotient))\b/i.test(text),
          wrongWhole: !s.scopeDue && said !== null && said !== facts.quotient,
          tens: count("ten"),
          ones: count("one"),
          heardTens: right("tens"),
          heardOnes: right("ones"),
          reason: divisionReason(body, dividend, divisor, deps.plainNumber, previous === "div_explain"),
        }, facts);
  let instruction: DivisionInstruction = {
    step: choice.step,
    ...((s.grade ?? 0) >= 5 ? { usePlaceValueTerms: true as const } : {}),
    transfer: transfer.operands,
  };
  const words = divisionWords(facts, instruction, false) ?? [];
  if (choice.step !== "decline" && choice.step !== "transfer_correct" && deps.tellsAnswer(pkg, words, [])) {
    instruction = { step: "transfer_retry", transfer: transfer.operands };
  }
  const question = lesson.turns.flatMap((turn) => turn.actions).findLast((action) => action.kind === "question");
  const closes = instruction.step === "decline" || instruction.step === "transfer_correct";
  const missed = !closes && (question?.fate === "cancelled" || question?.fate === "skipped");
  return {
    id: `${lesson.id}:${lesson.turns.length + 1}`,
    facts: toExchangeFacts(facts),
    actions: missed ? [transferQuestionAction(s)] : [],
    instruction,
    transfer: true,
    ...("observation" in choice && choice.observation && instruction.step === choice.step
      ? { observation: { skill: choice.observation[0], result: choice.observation[1], assistance: deps.transferAssistance(), at: s.now! } }
      : {}),
  };
}

export function divisionLessonPlan(s: DivisionSessionState, deps: DivisionSessionDeps, afterFailure: boolean): ExchangeTurn | null {
  const lesson = s.checkedExchange;
  const pkg = s.package;
  if (lesson?.kind !== "divide" || pkg?.operation.kind !== "divide") return null;
  if (lesson.progression && lesson.transfer && deps.tutorTeachingNow() && !s.noBoard && s.turn && !s.stopRequested && s.solved !== null) {
    if (lesson.transfer.state === "started") return divisionRelatedPlan(s, deps);
    if (divisionOfferPending(s) && !s.scopeDue && !s.turn.uncertain && !deps.hasTranscriptAlternatives()) return divisionOfferReplyPlan(s, deps);
    return null;
  }
  if (lesson.version !== 1 || !deps.tutorTeachingNow() || s.scopeDue || s.noBoard ||
    s.solved !== null || !s.turn || s.turn.uncertain || deps.hasTranscriptAlternatives() || s.stopRequested) return null;

  const text = s.turn.text.trim();
  const body = deps.wholeTurn(text);
  const [dividend, divisor] = pkg.operation.operands as [number, number];
  const targetFacts = divisionFacts(dividend, divisor, false);
  if (!targetFacts) return null;

  const turns = lesson.turns;
  const previous = turns.at(-1);
  const held = turns.flatMap((t) => t.actions).filter((action) => action.fate === "shown");
  const shownAction = held.find((a) => a.kind === "show");
  const sharedAction = held.find((a) => a.kind === "share");
  const exchangedAction = held.find((a) => a.kind === "exchange");
  const shared = !!sharedAction || turns.some((t) => !t.facts.example && t.childAction?.objectId === SHARE_OBJECT);
  const exchanged = !!exchangedAction || turns.some((t) => !t.facts.example && t.childAction?.objectId === EXCHANGE_OBJECT);
  const count = (place: "one" | "ten") => body === null ? null :
    deps.wholeValue(body.replace(/^(?:there (?:are|is)|i have|each group (?:has|gets)) /, "").replace(new RegExp(` ${place}s?$`), ""));
  const heard = deps.heardAnswers();
  const prevStep = previous?.instruction?.step as DivisionStep | undefined;
  // #1155 review: a step question is graded against the problem Maya asked it about (the target or a separate example).
  const prevDiv = previous ? divisionFactsFromExchange(previous.facts) : null;
  const askedFacts = prevDiv ?? targetFacts;
  const choice = lesson.progression
    ? divisionChoice({
        text,
        body,
        previousStep: prevStep,
        previousWasDemo: !!previous && !prevStep && !previous.prompt && !previous.childAction,
        previousWasExample: previous?.facts.example === true,
        previousDemonstrated: previous?.support === "demonstrated",
        shared,
        exchanged,
        misconception: divisionMisconception(body, text, dividend, divisor, deps.plainNumber, deps.saysGuess),
        rightWhole: !deps.childSaysFalse(text) && !deps.saysGuess(text) && (heard.some((a) => a.step === "result" && a.verdict === "right") ||
          divisionBecauseAnswer(body, deps.plainNumber) === targetFacts.quotient),
        saysWhole: /\b(?:my (?:final )?answer|(?:whole|final) (?:answer|quotient))\b/i.test(text),
        wrongWhole: !deps.saysGuess(text) && body !== null && (() => {
          const v = deps.wholeValue(body.replace(/^(?:my (?:final )?answer is|i got|it'?s|it is) /, ""));
          return v !== null && v !== targetFacts.quotient;
        })(),
        tensCount: count("ten"),
        onesCount: count("one"),
        heardTens: heard.some((a) => a.step === "tens" && a.verdict === "right"),
        heardOnes: heard.some((a) => a.step === "ones" && a.verdict === "right"),
        reason: divisionReason(body, dividend, divisor, deps.plainNumber, prevStep === "div_explain"),
      }, askedFacts)
    : undefined;

  if (choice?.step === "div_correct" && divisionTransferFor(s, deps)) choice.step = "offer";
  const step = choice?.step;

  if (!step && (s.done.includes("ones") || turns.some((t) => t.childAction?.objectId === EXCHANGE_OBJECT) ||
    (targetFacts.remainingTens === 0 && turns.some((t) => t.childAction?.objectId === SHARE_OBJECT)))) {
    return null;
  }

  let promptAction: "share" | "exchange" | null = step
    ? divisionOffersAction({ step, offerAction: choice?.offerAction })
    : DIVISION_CHILD_REQUEST.test(text)
      ? (sharedAction && targetFacts.remainingTens === 1 && !exchangedAction ? "exchange" : "share")
      : null;

  const isDemo = !step && !promptAction && (DIVISION_DEMO_REQUEST.test(text) || (afterFailure && DIVISION_HELP.test(text)));
  if (!step && !promptAction && !isDemo) return null;

  const hasUnsettled = turns.some((t) => t.actions.some((a) => !a.fate));
  const isMisconceptionStep = step === "div_wrong_op" || step === "div_drop_remainder" || step === "div_ten_as_one";
  if (isMisconceptionStep) {
    if (promptAction === "share" && (hasUnsettled || !!sharedAction)) promptAction = null;
    if (promptAction === "exchange" && (hasUnsettled || !sharedAction || !!exchangedAction)) promptAction = null;
  }
  const withBoard = isDemo || promptAction !== null;
  if (withBoard && hasUnsettled) return null;
  if (isDemo && (targetFacts.remainingTens === 0 ? !!sharedAction : !!exchangedAction)) return null;
  if (promptAction === "share" && !!sharedAction) return null;
  if (promptAction === "exchange" && (!sharedAction || !!exchangedAction)) return null;

  const instruction: DivisionInstruction | undefined = step
    ? {
        step,
        ...((s.grade ?? 0) >= 5 ? { usePlaceValueTerms: true as const } : {}),
        ...(promptAction ? { offerAction: promptAction } : {}),
      }
    : undefined;

  // #1155 review: the lesson keeps its problem once a board shows it. Before that, a turn that brings a board may move to
  // a separate example. Each candidate is checked on the speech and board this turn sends, plus the board steps still due.
  const fresh: TransferOperands[] = [[dividend, divisor], ...divisionExampleCandidates(targetFacts.remainingTens === 1)];
  const candidates: TransferOperands[] = prevDiv && (shownAction || !withBoard)
    ? [[prevDiv.dividend, prevDiv.divisor]]
    : [...(prevDiv ? [[prevDiv.dividend, prevDiv.divisor] as TransferOperands] : []), ...fresh];

  const chosen = candidates
    .map(([a, b]) => divisionFacts(a, b, a !== dividend || b !== divisor))
    .find((candidate): candidate is DivisionFacts => {
      if (!candidate) return false;
      const cmds = withBoard
        ? [
            ...divisionCommands("show", candidate),
            ...divisionCommands("share", candidate),
            ...(candidate.remainingTens === 1 ? divisionCommands("exchange", candidate) : []),
          ]
        : [];
      const words = [
        ...(instruction ? (divisionWords(candidate, instruction, true, !!sharedAction) ?? []) : []),
        ...(withBoard
          ? [
              ...divisionPromptWords(candidate, true, "share"),
              ...divisionDemoWords(candidate, true, false),
            ]
          : []),
      ];
      return !deps.tellsAnswer(pkg, words, divisionShownTexts(cmds));
    });
  if (!chosen) return null;

  const batchId = (offset: number) => `${s.callId}-b${s.batches + offset}`;
  const makeAction = (kind: ExchangeAction["kind"], id: string, after?: string): ExchangeAction => ({
    kind, id: `${lesson.id}:${kind}`, batchId: id, delivery: "generated", ...(after ? { after } : {}),
  });
  const id = `${lesson.id}:${turns.length + 1}`;
  const actions: ExchangeAction[] = [];
  let prompt: ExchangeTarget | undefined;

  if (promptAction === "share") {
    const show = shownAction ?? makeAction("show", batchId(1));
    if (!shownAction) actions.push(show);
    prompt = {
      lessonId: lesson.id,
      turnId: id,
      objectId: SHARE_OBJECT,
      batchId: show.batchId,
      boardRevision: s.batches + actions.length,
    };
  } else if (promptAction === "exchange") {
    prompt = {
      lessonId: lesson.id,
      turnId: id,
      objectId: EXCHANGE_OBJECT,
      batchId: sharedAction!.batchId,
      boardRevision: s.batches,
    };
  } else if (isDemo) {
    let offset = 0;
    const show = shownAction ?? makeAction("show", batchId(++offset));
    if (!shownAction) actions.push(show);
    const share = sharedAction ?? makeAction("share", batchId(++offset), show.batchId);
    if (!sharedAction) actions.push(share);
    if (chosen.remainingTens === 1 && !exchangedAction) {
      actions.push(makeAction("exchange", batchId(++offset), share.batchId));
    }
  }

  return {
    id,
    facts: toExchangeFacts(chosen),
    actions,
    ...(prompt ? { prompt } : {}),
    ...(instruction ? { instruction } : {}),
    ...(choice?.observation ? { observation: deps.observation(choice.observation[0], choice.observation[1]) } : {}),
  };
}

export function childDivisionPlan(
  s: DivisionSessionState,
  deps: DivisionSessionDeps,
  target: ExchangeTarget,
  offered: ExchangeTarget,
): ExchangeTurn | null {
  const lesson = s.checkedExchange!;
  const pkg = s.package!;
  const previous = lesson.turns.at(-1)!;
  const facts = divisionFactsFromExchange(previous.facts);
  if (!facts) return null;
  const id = `${lesson.id}:${lesson.turns.length + 1}`;
  const nextBatch = `${s.callId}-b${s.batches + 1}`;

  if (target.objectId === SHARE_OBJECT) {
    const needsExchange = facts.remainingTens === 1;
    const instruction: DivisionInstruction = {
      step: needsExchange ? "div_guide_exchange" : "div_connect_share",
      ...((s.grade ?? 0) >= 5 ? { usePlaceValueTerms: true as const } : {}),
      ...(needsExchange ? { fromShare: true as const } : {}),
    };
    const words = divisionWords(facts, instruction, false) ?? [];
    const cmds = divisionCommands("share", facts);
    if (deps.tellsAnswer(pkg, words, divisionShownTexts(cmds))) return null;
    return {
      id,
      facts: previous.facts,
      actions: [{ kind: "share", id: `${lesson.id}:share`, batchId: nextBatch, after: target.batchId, delivery: "generated" }],
      childAction: offered,
      ...(needsExchange
        ? {
            prompt: {
              lessonId: lesson.id,
              turnId: id,
              objectId: EXCHANGE_OBJECT,
              batchId: nextBatch,
              boardRevision: s.batches + 1,
            },
          }
        : {}),
      instruction,
      observation: deps.observation("perform_share", "correct"),
    };
  }

  if (target.objectId === EXCHANGE_OBJECT && facts.remainingTens === 1) {
    const instruction: DivisionInstruction = {
      step: "div_connect_exchange",
      ...((s.grade ?? 0) >= 5 ? { usePlaceValueTerms: true as const } : {}),
    };
    const words = divisionWords(facts, instruction, false) ?? [];
    const cmds = divisionCommands("exchange", facts);
    if (deps.tellsAnswer(pkg, words, divisionShownTexts(cmds))) return null;
    return {
      id,
      facts: previous.facts,
      actions: [{ kind: "exchange", id: `${lesson.id}:exchange`, batchId: nextBatch, after: target.batchId, delivery: "generated" }],
      childAction: offered,
      instruction,
      observation: deps.observation("perform_exchange", "correct"),
    };
  }

  return null;
}

export function divisionTurnWords(plan: ExchangeTurn, show: boolean, shared: boolean): string[] {
  const facts = divisionFactsFromExchange(plan.facts)!;
  const fromInst = plan.instruction ? divisionWords(facts, plan.instruction, show, shared) : null;
  if (fromInst) return fromInst;
  if (plan.prompt) return divisionPromptWords(facts, show, plan.prompt.objectId === EXCHANGE_OBJECT ? "exchange" : "share");
  return divisionDemoWords(facts, show, shared);
}

export function divisionTurnCommands(actionKind: ExchangeAction["kind"], plan: ExchangeTurn, transferOperands?: TransferOperands): Command[] {
  if (actionKind === "question") return divisionTransferBoard(transferOperands!);
  const facts = divisionFactsFromExchange(plan.facts)!;
  return divisionCommands(actionKind, facts);
}

export function divisionBatchSentence(actionKind: ExchangeAction["kind"], index: number, plan: ExchangeTurn): number {
  const step = plan.instruction?.step as DivisionStep | undefined;
  if (actionKind === "show" && (step === "div_wrong_op" || step === "div_drop_remainder" || step === "div_ten_as_one")) {
    return 1;
  }
  return index;
}

export function divisionHelp(turn: ExchangeTurn): ExchangeTurn["support"] {
  const step = turn.instruction?.step as DivisionStep | undefined;
  return divisionHelpLevel(step, !!turn.prompt, turn.transfer === true);
}
