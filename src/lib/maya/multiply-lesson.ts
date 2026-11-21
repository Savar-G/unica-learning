import type { Command } from "@/lib/board";
import type { OperationPackage } from "@/lib/question-package";
import {
  chooseMultiplyTransfer,
  GROUPS_OBJECT,
  initialPartialGroups,
  isValidMultiplyContext,
  MULTIPLY_EXAMPLE_CANDIDATES,
  multiplyBoardFits,
  multiplyCommands,
  multiplyContext,
  multiplyFacts,
  multiplyOffersAction,
  multiplyRelatedChoice,
  multiplyTransferBoard,
  multiplyTransferPackage,
  multiplyWords,
  type CheckedMultiplyLesson,
  type MultiplyAction,
  type MultiplyFacts,
  type MultiplyInstruction,
  type MultiplyObservation,
  type MultiplyProposal,
  type MultiplySkill,
  type MultiplyTurn,
  type VisualSupport,
} from "./checked-multiply";
import { readExchangeTarget, sameExchangeTarget, type ExchangeTarget } from "./checked-exchange";
import { committedText, saysGuess, wholeTurn, withoutExplanations } from "./numbers";
import { TRANSFER_MIN_MS, TRANSFER_OFFER, type TransferOperands } from "./transfer";

const EXAMPLE_REQUEST = /^(?:(?:can|could|would) you )?(?:please )?(?:show me (?:an? )?(?:example|how to multiply|equal groups|an array)|show me how)[.?!]*$/i;
const BUILD_REQUEST = /^(?:how do (?:i|we) (?:make|build|draw|show) (?:equal )?(?:groups|an array|the groups)|(?:can i|i want to) (?:build|make|add|draw) (?:the )?(?:equal )?(?:groups|array))(?: again)?[.?!]*$/i;
const MULTIPLY_HELP = /^(?:i need help|can you help me|i (?:don't|do not) know how to start)[.?!]*$/i;
const MULTIPLY_START = /^(?:i (?:still )?(?:don'?t|do not) (?:know(?: how to (?:start|multiply|make groups|do this))?|get it|understand(?: multiplication)?)|i(?:'m| am) (?:still )?(?:stuck|confused|new to multiplication)|i(?:'ve| have) never (?:multiplied|done multiplication|done this before)|(?:can you )?(?:teach me|explain) how to multiply)[.?!]*$/i;
const REPEAT_MULTIPLY = /^(?:what did you say|(?:can|could) you repeat (?:that|it)|(?:say|explain) that again)[.?!]*$/i;

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

function smallNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (/^\d+$/.test(s)) return Number(s);
  if (s in NUMBER_WORDS) return NUMBER_WORDS[s];
  if (/^(?:one |a )?hundred$/.test(s)) return 100;
  const parts = s.split(/[\s-]+/);
  if (parts.length === 2 && parts[0] in NUMBER_WORDS && parts[1] in NUMBER_WORDS && NUMBER_WORDS[parts[0]] >= 20 && NUMBER_WORDS[parts[1]] < 10) {
    return NUMBER_WORDS[parts[0]] + NUMBER_WORDS[parts[1]];
  }
  return null;
}

const NUM_PAT = String.raw`(?:\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)`;
/** A whole number up to 100, in digits or words ("twenty-four", "one hundred"). */
const NUMBER_PHRASE = String.raw`(?:\d+|(?:one |a )?hundred|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-](?:one|two|three|four|five|six|seven|eight|nine))?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)`;
const NEGATION = /\b(?:not|no|never|isn't|aren't|wasn't|weren't|don't|doesn't|didn't|can't|cannot|won't)\b/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface QuantityClaims {
  counts: number[];
  sizes: number[];
}

/** The group counts and group sizes the child states ("4 bags of 3", "each bag has 3 apples", "3 in each bag"). */
function quantityClaims(text: string, facts: MultiplyFacts): QuantityClaims {
  const lower = text.toLowerCase().replace(/[’']/g, "'").trim();
  const { context, product } = facts;
  const gPat = `(?:groups?|rows?|${escapeRe(context.groupNoun)}|${escapeRe(context.groupSingular)})`;
  const counts: number[] = [];
  const sizes: number[] = [];
  const read = (re: string, count: number | null, size: number | null) => {
    for (const m of lower.matchAll(new RegExp(re, "g"))) {
      if (count !== null) { const n = smallNumber(m[count]); if (n !== null) counts.push(n); }
      if (size !== null) { const n = smallNumber(m[size]); if (n !== null) sizes.push(n); }
    }
  };
  read(String.raw`\b(${NUM_PAT})\s+${gPat}\s+(?:of|with)\s+(${NUM_PAT})\b`, 1, 2);
  read(String.raw`\b(${NUM_PAT})\s+${gPat}[,\s]+(?:and\s+)?(${NUM_PAT})\s+(?:[a-z]+\s+){0,2}(?:in|on|per)\s+each\b`, 1, 2);
  read(String.raw`\b(${NUM_PAT})\s+(?:[a-z]+\s+){0,2}(?:in|on|per)\s+(?:each\s+|every\s+|a\s+|one\s+)?${gPat}\b`, null, 1);
  read(String.raw`\b(?:each|every|a|one)\s+${gPat}\s+(?:has|holds|gets|contains|carries|had)\s+(${NUM_PAT})\b`, null, 1);
  for (const m of lower.matchAll(new RegExp(String.raw`\b(${NUM_PAT})\s+${gPat}\b(?!\s+(?:of|with)\b)`, "g"))) {
    const n = smallNumber(m[1]);
    if (n !== null && n !== product) counts.push(n);
  }
  return { counts, sizes };
}

/**
 * Whether the child's stated groups contradict the question: "swapped" when the group count and group size trade
 * places in a story, "wrong" when a stated count or size is another number, null when nothing contradicts it.
 */
export function multiplyClaimConflict(text: string, facts: MultiplyFacts): "swapped" | "wrong" | null {
  const { groups, size, context } = facts;
  const { counts, sizes } = quantityClaims(text, facts);
  if (!context.contextual) {
    const either = (n: number) => n === groups || n === size;
    return counts.every(either) && sizes.every(either) ? null : "wrong";
  }
  const wrongCounts = counts.filter((n) => n !== groups);
  const wrongSizes = sizes.filter((n) => n !== size);
  if (wrongCounts.length === 0 && wrongSizes.length === 0) return null;
  return groups !== size && wrongCounts.every((n) => n === size) && wrongSizes.every((n) => n === groups) ? "swapped" : "wrong";
}

/** Detects whether the child swapped group count and group size in a contextual word problem. */
export function multiplySwappedContext(text: string, facts: MultiplyFacts): boolean {
  return multiplyClaimConflict(text, facts) === "swapped";
}

/** Detects whether the child identified the right group count and group size. */
export function multiplyIdentifiesGroups(text: string, facts: MultiplyFacts): boolean {
  const lower = text.toLowerCase().replace(/[’']/g, "'").trim();
  if (NEGATION.test(lower) || /\?$/.test(lower) || multiplyClaimConflict(text, facts)) return false;
  const { groups, size, context } = facts;
  const gPat = `(?:groups?|rows?|${escapeRe(context.groupNoun)}|${escapeRe(context.groupSingular)})`;
  const pairRe = new RegExp(String.raw`\b(${NUM_PAT})\s+${gPat}\s+(?:of|with)\s+(${NUM_PAT})\b`, "g");
  for (const m of lower.matchAll(pairRe)) {
    const g = smallNumber(m[1]);
    const s = smallNumber(m[2]);
    if (g === groups && s === size) return true;
    if (!context.contextual && g === size && s === groups) return true;
  }
  const andEach = new RegExp(String.raw`\b(${NUM_PAT})\s+${gPat}[,\s]+(?:and\s+)?(${NUM_PAT})\s+(?:[a-z]+\s+){0,2}(?:in|on|per)\s+each\b`, "g");
  for (const m of lower.matchAll(andEach)) {
    const g = smallNumber(m[1]);
    const s = smallNumber(m[2]);
    if (g === groups && s === size) return true;
    if (!context.contextual && g === size && s === groups) return true;
  }
  return false;
}

/** Detects whether the child explained repeated addition, skip counting, or multiplication for the groups. */
export function multiplyExplainsMeaning(text: string, facts: MultiplyFacts): boolean {
  const lower = text.toLowerCase().replace(/[’']/g, "'").trim();
  if (
    MULTIPLY_START.test(lower) ||
    MULTIPLY_HELP.test(lower) ||
    /\?$/.test(lower) ||
    NEGATION.test(lower) ||
    /\b(?:do not|not sure|no idea|confused|stuck|help|how do|what does|teach me|explain)\b/.test(lower)
  ) {
    return false;
  }
  const { groups, size } = facts;
  const countBy = new RegExp(String.raw`\b(?:skip[- ]?count(?:ing)?|count(?:ing)?)\s+(?:by|in)\s+(${NUM_PAT})(?:s|'s)?\b`).exec(lower);
  if (countBy) {
    const by = smallNumber(countBy[1]);
    return by === size || (!facts.context.contextual && by === groups);
  }
  const skipSequence = /\bskip[- ]?count(?:ing)?\s+(.*)/.exec(lower);
  if (skipSequence) {
    const counts = [...skipSequence[1].matchAll(new RegExp(String.raw`\b${NUMBER_PHRASE}\b`, "g"))].map((m) => smallNumber(m[0]));
    const follows = (by: number, steps: number) =>
      counts.length >= 2 && counts.length <= steps && counts.every((value, i) => value === (i + 1) * by);
    return follows(size, groups) || (!facts.context.contextual && follows(groups, size));
  }
  if (/\b(?:repeated addition|add equal groups)\b/.test(lower) &&
    !new RegExp(String.raw`\b${NUMBER_PHRASE}\b`).test(lower)) return true;
  const mulPair = new RegExp(
    String.raw`\bmultiply\s+(?:(${NUM_PAT})\s+(?:by|and|times)\s+(${NUM_PAT})|(?:the\s+)?(?:groups?|rows?|numbers?|them|both))\b`,
  ).exec(lower);
  if (mulPair) {
    if (!mulPair[1]) return true;
    const a = smallNumber(mulPair[1]);
    const b = smallNumber(mulPair[2]);
    if ((a === groups && b === size) || (a === size && b === groups)) return true;
  }
  const addTimes = new RegExp(String.raw`\badd\s+(${NUM_PAT})\s+(${NUM_PAT})\s+times\b`).exec(lower);
  if (addTimes) {
    const a = smallNumber(addTimes[1]);
    const b = smallNumber(addTimes[2]);
    if ((a === size && b === groups) || (!facts.context.contextual && a === groups && b === size)) return true;
  }
  const plusParts = lower.match(new RegExp(String.raw`\b${NUM_PAT}\b(?=\s*(?:\+|plus)\s*${NUM_PAT}\b)|(?<=(?:\+|plus)\s*)\b${NUM_PAT}\b`, "g"));
  if (plusParts && plusParts.length === groups && plusParts.every((p) => smallNumber(p) === size)) return true;
  if (!facts.context.contextual && plusParts && plusParts.length === size && plusParts.every((p) => smallNumber(p) === groups)) return true;
  return false;
}

/** Detects adding factors instead of multiplying (e.g. "3 plus 4 is 7" or bare "7" for 3 x 4). */
export function multiplyAdditiveError(text: string, groups: number, size: number, committedNumber: number | null): boolean {
  const product = groups * size;
  const sum = groups + size;
  if (sum === product) return false;
  const lower = text.toLowerCase();
  if (new RegExp(String.raw`\badd\s+${NUM_PAT}\s+${NUM_PAT}\s+times\b`).test(lower)) return false;
  const plusRe = new RegExp(String.raw`\b(${NUM_PAT})\s*(?:\+|plus)\s*(${NUM_PAT})\b`, "g");
  for (const m of lower.matchAll(plusRe)) {
    const x = smallNumber(m[1]);
    const y = smallNumber(m[2]);
    if ((x === groups && y === size) || (x === size && y === groups)) return true;
  }
  const addJoinRe = new RegExp(String.raw`\badd(?:ed|ing)?\s+(${NUM_PAT})\s+(?:and|to|with)\s+(${NUM_PAT})\b`, "g");
  for (const m of lower.matchAll(addJoinRe)) {
    const x = smallNumber(m[1]);
    const y = smallNumber(m[2]);
    if ((x === groups && y === size) || (x === size && y === groups)) return true;
  }
  return committedNumber !== null && committedNumber === sum;
}

export function multiplyOffByOne(committedNumber: number | null, groups: number, size: number): boolean {
  if (committedNumber === null) return false;
  const product = groups * size;
  if (committedNumber === product || committedNumber === groups + size) return false;
  return committedNumber === (groups - 1) * size || committedNumber === (groups + 1) * size ||
    committedNumber === groups * (size - 1) || committedNumber === groups * (size + 1);
}

/** Every written form of each measure unit, area forms before linear ones so "cm2" never reads as "cm". */
const UNIT_FORMS: readonly [string, string][] = [
  ["mm²", String.raw`mm²|mm2|sq\.?\s*mm|square\s+millimet(?:re|er)s?`],
  ["cm²", String.raw`cm²|cm2|sq\.?\s*cm|square\s+centimet(?:re|er)s?`],
  ["km²", String.raw`km²|km2|sq\.?\s*km|square\s+kilomet(?:re|er)s?`],
  ["m²", String.raw`m²|m2|sq\.?\s*m|square\s+met(?:re|er)s?`],
  ["mm", String.raw`mm|millimet(?:re|er)s?`],
  ["cm", String.raw`cm|centimet(?:re|er)s?`],
  ["km", String.raw`km|kilomet(?:re|er)s?`],
  ["kg", String.raw`kg|kilograms?`],
  ["mL", String.raw`ml|millilit(?:re|er)s?`],
  ["m", String.raw`m|met(?:re|er)s?`],
  ["g", String.raw`g|grams?`],
  ["L", String.raw`l|lit(?:re|er)s?`],
];
const MEASURE_RE = new RegExp(String.raw`^(?:my (?:final )?answer is\s+|i (?:already )?got\s+|it(?:'s| is)\s+)?(${NUMBER_PHRASE})\s*(${UNIT_FORMS.map(([, form]) => form).join("|")})$`, "i");
const MEASURE_UNITS = new Set(UNIT_FORMS.map(([unit]) => unit));

/** The number and unit the child kept, after explanations and corrections are applied. */
function committedMeasure(text: string): { value: number; unit: string } | null {
  if (text.includes("?") || saysGuess(text)) return null;
  const body = wholeTurn(committedText(withoutExplanations(text)).trim().replace(/,$/, ""));
  const match = body && MEASURE_RE.exec(body);
  if (!match) return null;
  const value = smallNumber(match[1]);
  const unit = UNIT_FORMS.find(([, form]) => new RegExp(`^(?:${form})$`, "i").test(match[2]))?.[0];
  return value !== null && unit ? { value, unit } : null;
}

/**
 * Checks whether the child named the right product number with a WRONG unit
 * (e.g. "12 bags" for "How many apples?", or "12 cm" when the unit is "cm²").
 */
export function multiplyWrongUnit(text: string, facts: MultiplyFacts): boolean {
  const { product, context } = facts;
  const lower = text.toLowerCase();
  if (context.unit && MEASURE_UNITS.has(context.unit)) {
    const measure = committedMeasure(text);
    return measure?.value === product && measure.unit !== context.unit;
  }
  const prodRe = new RegExp(String.raw`(?<![\w.])(${NUMBER_PHRASE})(?![\w.])`, "gi");
  if (![...text.matchAll(prodRe)].some((m) => smallNumber(m[1]) === product)) return false;
  if (context.unit) {
    // Custom unit text (e.g. "apples"): the unit right after the product is the right unit.
    const unitStem = context.unit.toLowerCase().replace(/s$/, "");
    if (new RegExp(String.raw`(?<![\w.])(${NUMBER_PHRASE})\s+${escapeRe(unitStem)}s?\b`, "i").test(lower)) return false;
  }
  // Contextual story: saying "12 bags" / "12 rows" / "12 jars" instead of the counted items is a wrong unit.
  if (context.contextual && context.itemNoun) {
    const gRe = new RegExp(String.raw`(?<![\w.])(${NUMBER_PHRASE})\s+(?:${escapeRe(context.groupNoun)}|${escapeRe(context.groupSingular)}|groups?|rows?)\b`, "gi");
    if ([...lower.matchAll(gRe)].some((m) => smallNumber(m[1]) === product)) return true;
  }
  return false;
}

/** Whether the child stated the right product with the question's measure unit in any written form ("12 sq cm"). */
export function multiplyRightWithUnit(text: string, facts: MultiplyFacts): boolean {
  const { product, context } = facts;
  if (!context.unit || !MEASURE_UNITS.has(context.unit)) return false;
  const measure = committedMeasure(text);
  return measure?.value === product && measure.unit === context.unit;
}

export function initCheckedMultiply(callId: string, pkg: OperationPackage): CheckedMultiplyLesson | undefined {
  const context = multiplyContext(pkg);
  if (!context) return undefined;
  return {
    version: 1,
    transfers: 1,
    id: `${callId}:multiply`,
    context,
    visualSupport: "faded",
    builtGroups: 0,
    turns: [],
  };
}

export function multiplyHelp(turn: MultiplyTurn): MultiplyTurn["support"] {
  const step = turn.instruction.step;
  if (turn.transfer) {
    if (step === "transfer_show") return "demonstrated";
    if (step === "transfer_hint") return "hinted";
    return undefined;
  }
  if (step === "worked_example" || step === "connect_notation" || step === "paper_groups" || step === "skip_count") return "demonstrated";
  if (turn.prompt || step === "guide_groups" || step === "additive_error" || step === "swapped_factors" || step === "off_by_one" || step === "group_added") {
    return "hinted";
  }
  return undefined;
}

function unconfirmedMultiplyHelp(turn: MultiplyTurn): MultiplyTurn["support"] {
  if (!turn.sent || turn.playback === "finished") return undefined;
  const help = multiplyHelp(turn);
  if (!turn.support || (turn.support === "hinted" && help === "demonstrated")) return help;
}

/** Keep the observation and call outcome in agreement with the regrouping lesson's help precedence. */
export function multiplyAssistance(
  lesson: CheckedMultiplyLesson,
  sessionAssistance: readonly string[],
): MultiplyObservation["assistance"] {
  const turns = lesson.turns.filter((t) => !t.transfer);
  const demonstrated = turns.some((t) => t.support === "demonstrated") ||
    sessionAssistance.some((k) => k !== "independent" && k !== "hint");
  if (demonstrated) return "demonstrated";
  const hinted = turns.some((t) => t.support === "hinted") || sessionAssistance.includes("hint");
  if (turns.some((t) => {
    const help = unconfirmedMultiplyHelp(t);
    return help === "demonstrated" || (help === "hinted" && !hinted);
  })) return "uncertain";
  if (hinted) return "hinted";
  return "independent";
}

export function multiplyTransferAssistance(lesson: CheckedMultiplyLesson | undefined): MultiplyObservation["assistance"] {
  const turns = lesson?.turns.filter((t) => t.transfer) ?? [];
  if (turns.some((t) => t.support === "demonstrated")) return "demonstrated";
  if (turns.some((t) => unconfirmedMultiplyHelp(t) !== undefined)) return "uncertain";
  if (turns.some((t) => t.support === "hinted")) return "hinted";
  // The related question's batch clears the lesson board; work done before the screen confirms it is not independent.
  const question = lesson?.turns.flatMap((t) => t.actions).findLast((a) => a.kind === "question");
  return question?.fate === "shown" ? "independent" : "uncertain";
}

export function multiplyTransferOutcome(lesson: CheckedMultiplyLesson | undefined): {
  transfer?: { result: "right" | "unfinished"; assistance: MultiplyObservation["assistance"] };
} {
  const transfer = lesson?.transfer;
  if (transfer?.state !== "started" && transfer?.state !== "finished") return {};
  const solved = lesson!.turns.find((t) => t.transfer && t.observation?.skill === "product" && t.observation.result === "correct");
  return {
    transfer: {
      result: solved ? "right" : "unfinished",
      assistance: solved?.observation?.assistance ?? multiplyTransferAssistance(lesson),
    },
  };
}

export interface MultiplySessionHost {
  callId: string;
  now: number | null;
  startedAt: number | null;
  channel: string;
  state: string;
  expect: string;
  batches: number;
  outcome: unknown;
  solved: unknown;
  lastResult: string | null;
  noBoard: boolean;
  stopRequested: boolean;
  sensitiveHold?: boolean;
  safetyFlagged: boolean;
  scopeDue?: string;
  turn: { text: string; uncertain: boolean } | null;
  turns: readonly { speaker: string; text: string; act?: string }[];
  assistance: readonly string[];
  package: OperationPackage | null;
  checkedMultiply?: CheckedMultiplyLesson;
  closingAtMs: number;
  tutorTeachingNow: boolean;
  isTeachingState: boolean;
  hasAlternatives: boolean;
  rightProduct: boolean;
  childSaysFalse: boolean;
  committedNumber: number | null;
  yesReply: boolean;
  doneReply: boolean;
  tellsAnswer(pkg: OperationPackage, texts: readonly string[]): boolean;
  boardTexts(cmd: Command): string[];
}

export function multiplyTransferFor(host: MultiplySessionHost): TransferOperands | null {
  const lesson = host.checkedMultiply;
  const pkg = host.package;
  if (!lesson || lesson.transfers !== 1 || lesson.transfer || !pkg || host.startedAt === null || host.now === null ||
    host.now - host.startedAt > host.closingAtMs - TRANSFER_MIN_MS) return null;
  const said = host.turns.filter((t) => t.speaker === "maya").map((t) => t.text);
  // The lesson board stays until the related question's batch clears it, so its text must not hold the new product.
  const written = lesson.turns.flatMap((t) => t.actions.flatMap((a) =>
    a.kind === "question" || a.fate === "cancelled" || a.fate === "skipped" ? [] : multiplyCommands(a.kind, t.facts).flatMap(host.boardTexts)));
  const worked: TransferOperands[] = lesson.turns.filter((t) => t.facts.example).map((t) => [t.facts.groups, t.facts.size]);
  return chooseMultiplyTransfer(
    [lesson.context.groups, lesson.context.size],
    worked,
    (operands) => written.some((text) => new RegExp(String.raw`(?<!\d)${operands[0] * operands[1]}(?!\d)`).test(text)) ||
      host.tellsAnswer(multiplyTransferPackage(pkg, operands), [...said, ...written]),
  );
}

export function multiplyTransferOfferPending(host: MultiplySessionHost): boolean {
  const last = host.turns.findLast((t) => t.speaker === "maya" && t.act !== "wait" && t.act !== "check_in");
  return host.checkedMultiply?.transfer?.state === "offered" && host.lastResult === "right" && !!last?.text.endsWith(TRANSFER_OFFER);
}

export function multiplyWaitingForBoard(host: MultiplySessionHost): boolean {
  const turn = host.turn;
  return !!turn && !turn.uncertain && host.tutorTeachingNow &&
    !!host.checkedMultiply?.turns.at(-1)?.actions.some((a) => !a.fate) &&
    (BUILD_REQUEST.test(turn.text.trim()) || EXAMPLE_REQUEST.test(turn.text.trim()));
}

export function childMultiplyTarget(host: MultiplySessionHost): ExchangeTarget | undefined {
  const lesson = host.checkedMultiply;
  const prompt = lesson?.turns.at(-1)?.prompt;
  if (!prompt || prompt.boardRevision !== host.batches || host.outcome || host.safetyFlagged || host.sensitiveHold ||
    host.stopRequested || host.solved !== null || host.noBoard || !host.isTeachingState || host.expect !== "child" || host.turn) {
    return undefined;
  }
  const show = lesson!.turns.flatMap((t) => t.actions).find((a) => a.batchId === prompt.batchId);
  if (show?.delivery === "sent" && show.fate !== "cancelled" && show.fate !== "skipped") return prompt;
  return undefined;
}

/** The groups board the screen shows now: the last shown board batch, unless that batch cleared it. */
function hasShownGroupsBoard(lesson: CheckedMultiplyLesson): MultiplyAction | undefined {
  const last = lesson.turns.flatMap((t) => t.actions).findLast((a) => a.kind !== "question" && a.fate === "shown");
  return last?.kind === "clear" ? undefined : last;
}

/** A worked example still drawn (or on its way) on the board: the last live board batch belongs to an example turn. */
function visibleExample(lesson: CheckedMultiplyLesson): MultiplyAction | undefined {
  for (const turn of [...lesson.turns].reverse()) {
    const action = turn.actions.findLast((a) => a.kind !== "question" && a.fate !== "cancelled" && a.fate !== "skipped");
    if (action) return action.kind !== "clear" && turn.facts.example ? action : undefined;
  }
  return undefined;
}

const DRAWN_REPORT = /\b(?:i (?:drew|draw|made|built|did|have drawn|have made)|i've (?:drawn|made|got)|on my paper|i have)\b/i;

function hasPendingGroupsBoard(lesson: CheckedMultiplyLesson): boolean {
  return lesson.turns.some((t) => t.actions.some((a) => a.kind !== "question" && !a.fate));
}

function chooseSafeExample(host: MultiplySessionHost, pkg: OperationPackage): MultiplyFacts | null {
  const ctx = host.checkedMultiply!.context;
  for (const [g, s] of MULTIPLY_EXAMPLE_CANDIDATES) {
    if ((g === ctx.groups && s === ctx.size) || (g === ctx.size && s === ctx.groups)) continue;
    const exCtx = { groups: g, size: s, contextual: false, groupNoun: "groups", groupSingular: "group", itemNoun: null, unit: null };
    const f = multiplyFacts(g, s, 1, true, "full", exCtx);
    if (!f) continue;
    const words = multiplyWords(f, { step: "worked_example" }, true) ?? [];
    const board = [...multiplyCommands("show", f), ...multiplyCommands("complete_example", f)];
    if (!host.tellsAnswer(pkg, [...words, ...board.flatMap(host.boardTexts)])) return f;
  }
  return null;
}

export function planMultiplyTurn(host: MultiplySessionHost, afterFailure: boolean): MultiplyTurn | null {
  const lesson = host.checkedMultiply;
  const pkg = host.package;
  if (!lesson || !pkg || !host.tutorTeachingNow || host.noBoard || !host.turn || host.stopRequested) return null;

  // Transfer phase (after original question is solved).
  if (lesson.transfer && host.solved !== null) {
    if (lesson.transfer.state === "started") return planMultiplyTransferTurn(host);
    if (multiplyTransferOfferPending(host) && !host.scopeDue && !host.turn.uncertain && !host.hasAlternatives) {
      return planMultiplyOfferReply(host);
    }
    return null;
  }

  if (host.scopeDue || host.solved !== null || host.turn.uncertain || host.hasAlternatives) return null;

  const text = host.turn.text.trim();
  const ctx = lesson.context;
  const previous = lesson.turns.at(-1);
  const prevStep = previous?.instruction.step;
  const targetFacts = multiplyFacts(ctx.groups, ctx.size, lesson.builtGroups, false, lesson.visualSupport, ctx)!;
  const assistance = multiplyAssistance(lesson, host.assistance);
  const observe = (skill: MultiplySkill, result: "correct" | "incorrect" = "correct"): MultiplyObservation =>
    ({ skill, result, assistance, at: host.now! });

  const stuck = MULTIPLY_START.test(text) || MULTIPLY_HELP.test(text);
  const asksExample = EXAMPLE_REQUEST.test(text);
  const asksBuild = BUILD_REQUEST.test(text);

  const conflict = multiplyClaimConflict(text, targetFacts);
  const swapped = conflict === "swapped";
  const additive = multiplyAdditiveError(text, ctx.groups, ctx.size, host.committedNumber);
  const offByOne = multiplyOffByOne(host.committedNumber, ctx.groups, ctx.size);
  const wrongUnit = multiplyWrongUnit(text, targetFacts);
  const rightUnit = multiplyRightWithUnit(text, targetFacts);
  const rightWhole = (host.rightProduct || rightUnit) && !host.childSaysFalse && !conflict && !additive && !wrongUnit;
  const drawnReport = !!previous?.prompt && DRAWN_REPORT.test(text) && multiplyIdentifiesGroups(text, targetFacts);

  let step: MultiplyInstruction["step"] | undefined;
  let observation: MultiplyObservation | undefined;
  let visualSupport: VisualSupport = lesson.visualSupport;
  let exampleFacts: MultiplyFacts | null = null;

  if (swapped) {
    step = "swapped_factors";
    observation = observe("swapped_factors", "incorrect");
    visualSupport = "partial";
  } else if (wrongUnit) {
    step = "wrong_unit";
    observation = observe("unit_missing", "incorrect");
  } else if (rightWhole) {
    step = multiplyTransferFor(host) ? "offer" : "correct";
    observation = observe("product", "correct");
  } else if (previous && REPEAT_MULTIPLY.test(text) && prevStep !== "correct" && prevStep !== "offer") {
    return repeatMultiplyTurn(host, previous);
  } else if (conflict === "wrong") {
    // A stated count or size that is not the question's: ask for the groups again before any credit.
    step = "check_groups";
    observation = observe("group_structure", "incorrect");
  } else if (drawnReport) {
    step = "paper_groups";
    observation = observe("build_group", "correct");
    visualSupport = "partial";
  } else if (asksExample) {
    exampleFacts = chooseSafeExample(host, pkg);
    if (!exampleFacts) return null;
    step = "worked_example";
    visualSupport = "full";
  } else if (asksBuild) {
    step = "guide_groups";
    visualSupport = "partial";
  } else if (additive) {
    step = "additive_error";
    observation = observe("additive_error", "incorrect");
    visualSupport = "partial";
  } else if (offByOne) {
    step = "off_by_one";
    observation = observe("off_by_one_group", "incorrect");
    visualSupport = "partial";
  } else if (prevStep === "check_groups" || prevStep === "worked_example") {
    if (stuck) {
      step = "guide_groups";
      visualSupport = "partial";
    } else if (multiplyIdentifiesGroups(text, targetFacts)) {
      step = "check_meaning";
      observation = observe("equal_groups", "correct");
      visualSupport = "faded";
    }
  } else if (prevStep === "check_meaning") {
    if (stuck) {
      step = "guide_groups";
      visualSupport = "partial";
    } else if (multiplyExplainsMeaning(text, targetFacts)) {
      step = "independent";
      observation = observe("repeated_addition", "correct");
      visualSupport = "faded";
    }
  } else if (prevStep === "independent" && stuck) {
    step = "guide_groups";
    visualSupport = "partial";
  } else if ((prevStep === "connect_notation" || prevStep === "paper_groups" || prevStep === "skip_count") && (stuck || host.committedNumber !== null)) {
    step = "skip_count";
    if (host.committedNumber !== null) observation = observe("product", "incorrect");
  } else if (!previous && (MULTIPLY_START.test(text) || (afterFailure && MULTIPLY_HELP.test(text)))) {
    step = "check_groups";
    visualSupport = "faded";
  } else if (afterFailure && MULTIPLY_HELP.test(text)) {
    step = lesson.builtGroups >= ctx.groups ? "skip_count" : "guide_groups";
    if (step === "guide_groups") visualSupport = "partial";
  }

  if (!step) return null;

  const id = `${lesson.id}:${lesson.turns.length + 1}`;
  const instruction: MultiplyInstruction = { step };
  const batchId = (offset: number) => `${host.callId}-b${host.batches + offset}`;
  const mkAction = (kind: MultiplyAction["kind"], bId: string, after?: string): MultiplyAction => ({
    kind, id: `${lesson.id}:${kind}`, batchId: bId, delivery: "generated", ...(after ? { after } : {}),
  });

  if (step === "worked_example" && exampleFacts) {
    if (hasPendingGroupsBoard(lesson)) return null;
    const prevShown = hasShownGroupsBoard(lesson);
    const firstKind = prevShown ? "replace" : "show";
    const first = mkAction(firstKind, batchId(1), prevShown?.batchId);
    const second = mkAction("complete_example", batchId(2), first.batchId);
    return {
      id,
      facts: exampleFacts,
      actions: [first, second],
      instruction,
    };
  }

  const offersBoardAction = multiplyOffersAction(instruction, lesson.builtGroups, ctx.groups);
  const built = offersBoardAction ? Math.max(lesson.builtGroups, initialPartialGroups(ctx.groups)) : lesson.builtGroups;
  const facts = multiplyFacts(ctx.groups, ctx.size, built, false, visualSupport, ctx)!;
  // Every board state the action leads to must draw, or the button would offer a move the board refuses.
  if (offersBoardAction && !multiplyBoardFits(facts)) return null;

  let actions: MultiplyAction[] = [];
  let prompt: ExchangeTarget | undefined;

  if (offersBoardAction) {
    if (hasPendingGroupsBoard(lesson)) return null;
    const prevShown = hasShownGroupsBoard(lesson);
    const alreadyShowingTarget = prevShown && lesson.builtGroups > 0 && !lesson.turns.findLast((t) => t.actions.some((a) => a.batchId === prevShown.batchId))?.facts.example;
    if (alreadyShowingTarget) {
      prompt = {
        lessonId: lesson.id,
        turnId: id,
        boardRevision: host.batches,
        objectId: GROUPS_OBJECT,
        batchId: prevShown.batchId,
        groupSize: ctx.size,
        nextGroups: built + 1,
      };
    } else {
      const kind = prevShown ? "replace" : "show";
      const showAction = mkAction(kind, batchId(1), prevShown?.batchId);
      actions = [showAction];
      prompt = {
        lessonId: lesson.id,
        turnId: id,
        boardRevision: host.batches + 1,
        objectId: GROUPS_OBJECT,
        batchId: showAction.batchId,
        groupSize: ctx.size,
        nextGroups: built + 1,
      };
    }
  }

  // Independent work starts on a board without the solved example.
  const example = step === "independent" && !offersBoardAction ? visibleExample(lesson) : undefined;
  if (example) actions = [mkAction("clear", batchId(1), example.batchId)];

  const show = actions.some((a) => a.kind === "show" || a.kind === "replace");
  const words = multiplyWords(facts, instruction, show);
  if (!words) return null;
  const boardTexts = actions.flatMap((a) =>
    a.kind === "question" ? [] : multiplyCommands(a.kind, facts).flatMap(host.boardTexts),
  );
  if (step !== "correct" && step !== "offer" && host.tellsAnswer(pkg, [...words, ...boardTexts])) return null;

  return {
    id,
    facts,
    actions,
    ...(prompt ? { prompt } : {}),
    instruction,
    ...(observation ? { observation } : {}),
  };
}

/** The previous turn's words again, with its facts (an example stays an example) and no new board batch. */
function repeatMultiplyTurn(host: MultiplySessionHost, previous: MultiplyTurn): MultiplyTurn | null {
  const lesson = host.checkedMultiply!;
  const instruction: MultiplyInstruction = { step: previous.instruction.step };
  const id = `${lesson.id}:${lesson.turns.length + 1}`;
  const prompt = previous.prompt && previous.prompt.boardRevision === host.batches ? { ...previous.prompt, turnId: id } : undefined;
  const words = multiplyWords(previous.facts, instruction, false);
  if (!words || host.tellsAnswer(host.package!, words)) return null;
  return { id, facts: previous.facts, actions: [], ...(prompt ? { prompt } : {}), instruction };
}

export function planMultiplyChildAction(host: MultiplySessionHost, target: ExchangeTarget): MultiplyTurn | null {
  const lesson = host.checkedMultiply;
  const pkg = host.package;
  const offered = childMultiplyTarget(host);
  if (!lesson || !pkg || !offered || !sameExchangeTarget(offered, target)) return null;
  if (!lesson.turns.some((t) => t.actions.some((a) => a.batchId === target.batchId && a.fate === "shown"))) return null;
  if (target.objectId !== GROUPS_OBJECT || target.groupSize !== lesson.context.size) return null;

  const ctx = lesson.context;
  const nextBuilt = target.nextGroups;
  if (nextBuilt === undefined || nextBuilt <= lesson.builtGroups || nextBuilt > ctx.groups) return null;

  const completed = nextBuilt === ctx.groups;
  const step: MultiplyInstruction["step"] = completed ? "connect_notation" : "group_added";
  const facts = multiplyFacts(ctx.groups, ctx.size, nextBuilt, false, "partial", ctx)!;
  const instruction: MultiplyInstruction = { step };
  const words = multiplyWords(facts, instruction, false);
  if (!words) return null;
  const cmds = multiplyCommands("add_group", facts);
  if (host.tellsAnswer(pkg, [...words, ...cmds.flatMap(host.boardTexts)])) return null;

  const id = `${lesson.id}:${lesson.turns.length + 1}`;
  const nextBatchId = `${host.callId}-b${host.batches + 1}`;
  const action: MultiplyAction = {
    kind: "add_group",
    id: `${lesson.id}:add_group:${nextBuilt}`,
    batchId: nextBatchId,
    after: target.batchId,
    delivery: "generated",
  };
  const prompt: ExchangeTarget | undefined = completed ? undefined : {
    lessonId: lesson.id,
    turnId: id,
    boardRevision: host.batches + 1,
    objectId: GROUPS_OBJECT,
    batchId: nextBatchId,
    groupSize: ctx.size,
    nextGroups: nextBuilt + 1,
  };
  return {
    id,
    facts,
    actions: [action],
    childAction: offered,
    ...(prompt ? { prompt } : {}),
    instruction,
    observation: { skill: "build_group", result: "correct", assistance: multiplyAssistance(lesson, host.assistance), at: host.now! },
  };
}

function planMultiplyOfferReply(host: MultiplySessionHost): MultiplyTurn | null {
  const lesson = host.checkedMultiply!;
  const transfer = lesson.transfer!;
  const step = host.yesReply ? "transfer" : host.doneReply ? "decline" : null;
  if (!step) return null;
  const [g, s] = transfer.operands;
  const tCtx = { groups: g, size: s, contextual: false, groupNoun: "groups", groupSingular: "group", itemNoun: null, unit: null };
  const facts = step === "transfer"
    ? multiplyFacts(g, s, 0, false, "faded", tCtx)!
    : lesson.turns.at(-1)!.facts;
  const action: MultiplyAction[] = step === "transfer"
    ? [{ kind: "question", id: `${lesson.id}:question`, batchId: `${host.callId}-b${host.batches + 1}`, delivery: "generated" }]
    : [];
  return {
    id: `${lesson.id}:${lesson.turns.length + 1}`,
    facts,
    actions: action,
    instruction: { step, ...(step === "transfer" ? { transfer: transfer.operands } : {}) },
    ...(step === "transfer" ? { transfer: true as const } : {}),
  };
}

function planMultiplyTransferTurn(host: MultiplySessionHost): MultiplyTurn {
  const lesson = host.checkedMultiply!;
  const transfer = lesson.transfer!;
  const [g, s] = transfer.operands;
  const pkg = multiplyTransferPackage(host.package!, transfer.operands);
  const tCtx = { groups: g, size: s, contextual: false, groupNoun: "groups", groupSingular: "group", itemNoun: null, unit: null };
  const facts = multiplyFacts(g, s, 0, false, "faded", tCtx)!;
  const text = host.turn!.text.trim();
  const unclear = host.turn!.uncertain || host.hasAlternatives;
  const previous = lesson.turns.filter((t) => t.transfer).at(-1)?.instruction.step ?? "transfer";
  const done = !unclear && host.doneReply && !/^(?:no|nope|nah)[.!]*$/i.test(text);

  const choice: { step: MultiplyInstruction["step"]; observation?: [MultiplySkill, "correct" | "incorrect"] } = done
    ? { step: "decline" }
    : unclear
      ? { step: previous === "transfer" ? "transfer_retry" : (previous as MultiplyInstruction["step"]) }
      : multiplyRelatedChoice({
        previous,
        repeat: REPEAT_MULTIPLY.test(text),
        asksShow: EXAMPLE_REQUEST.test(text) || BUILD_REQUEST.test(text),
        stuck: MULTIPLY_START.test(text) || MULTIPLY_HELP.test(text),
        rightProduct: !host.scopeDue && host.rightProduct && !host.childSaysFalse,
        wrongProduct: !host.scopeDue && host.committedNumber !== null && host.committedNumber !== g * s,
        additive: !host.scopeDue && multiplyAdditiveError(text, g, s, host.committedNumber),
        offByOne: !host.scopeDue && multiplyOffByOne(host.committedNumber, g, s),
      });

  let instruction: MultiplyInstruction = { step: choice.step, transfer: transfer.operands };
  const words = multiplyWords(facts, instruction, false) ?? [];
  if (choice.step !== "transfer_correct" && choice.step !== "decline" && host.tellsAnswer(pkg, words)) {
    instruction = { step: "transfer_retry", transfer: transfer.operands };
  }
  const question = lesson.turns.flatMap((t) => t.actions).findLast((a) => a.kind === "question");
  const closes = instruction.step === "decline" || instruction.step === "transfer_correct";
  const missed = !closes && (question?.fate === "cancelled" || question?.fate === "skipped");
  const actions: MultiplyAction[] = missed
    ? [{ kind: "question", id: `${lesson.id}:question`, batchId: `${host.callId}-b${host.batches + 1}`, delivery: "generated" }]
    : [];
  return {
    id: `${lesson.id}:${lesson.turns.length + 1}`,
    facts,
    actions,
    instruction,
    transfer: true,
    ...(choice.observation && instruction.step === choice.step
      ? { observation: { skill: choice.observation[0], result: choice.observation[1], assistance: multiplyTransferAssistance(lesson), at: host.now! } }
      : {}),
  };
}

export function multiplyProposalOf(plan: MultiplyTurn, afterFailure?: boolean): MultiplyProposal {
  const show = plan.actions.some((a) => a.kind === "show" || a.kind === "replace" || a.kind === "question");
  return {
    checkedMultiply: 1,
    groups: plan.facts.groups,
    size: plan.facts.size,
    builtGroups: plan.facts.builtGroups,
    example: plan.facts.example,
    visualSupport: plan.facts.visualSupport,
    context: plan.facts.context,
    show,
    boardCount: plan.actions.length,
    ...(plan.prompt ? { prompt: true } : {}),
    ...(plan.childAction ? { childAction: plan.childAction } : {}),
    ...(afterFailure ? { afterFailure: true } : {}),
    instruction: plan.instruction,
  };
}

export function matchesMultiplyProposal(raw: Record<string, unknown>, plan: MultiplyTurn): boolean {
  const expected = multiplyProposalOf(plan, raw.afterFailure === true);
  return raw.noDraw !== "all" &&
    raw.groups === expected.groups &&
    raw.size === expected.size &&
    raw.builtGroups === expected.builtGroups &&
    raw.example === expected.example &&
    raw.visualSupport === expected.visualSupport &&
    raw.show === expected.show &&
    raw.boardCount === expected.boardCount &&
    (raw.prompt === true) === !!plan.prompt &&
    JSON.stringify(raw.context) === JSON.stringify(expected.context) &&
    JSON.stringify(raw.instruction) === JSON.stringify(expected.instruction);
}

/** Validates a trace's checkedMultiply proposal and output from the proposal alone. */
export function checkedMultiplyOutput(proposal: unknown, output: unknown): boolean {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) return false;
  const p = proposal as Record<string, unknown>;
  if (p.checkedMultiply !== 1 || typeof p.groups !== "number" || typeof p.size !== "number" ||
    typeof p.builtGroups !== "number" || typeof p.example !== "boolean" || typeof p.show !== "boolean" ||
    typeof p.boardCount !== "number" || !isValidMultiplyContext(p.context) || !output || typeof output !== "object") {
    return false;
  }
  const facts = multiplyFacts(p.groups, p.size, p.builtGroups, p.example, p.visualSupport as VisualSupport, p.context);
  if (!facts) return false;
  const out = output as Record<string, unknown>;
  if (!Array.isArray(out.say) || out.say.length !== 1 || !Array.isArray(out.board)) return false;
  const step = p.instruction && typeof p.instruction === "object" ? (p.instruction as Record<string, unknown>).step : undefined;
  const closes = step === "decline" || step === "transfer_correct";
  if (out.act !== (closes ? "close" : "guide")) return false;
  if (closes && p.boardCount !== 0) return false;
  if (p.childAction !== undefined && !readExchangeTarget(p.childAction)) return false;
  const words = multiplyWords(facts, p.instruction, p.show);
  return !!words && out.say[0] === words.join(" ") && out.board.length === p.boardCount;
}

export function multiplyBatchCommands(action: MultiplyAction, plan: MultiplyTurn, transferOperands?: TransferOperands): Command[] {
  if (action.kind === "question") return multiplyTransferBoard(transferOperands!);
  return multiplyCommands(action.kind, plan.facts);
}
