// Page observations and completion (#455, S2b): the public contract that marking (S4) and every format extension use.
// An observation says what is known about one printed item from a scanned page. It is not a learning event: this module
// decides which observations may publish one (markingEvent), and publishes nothing.
//
// One item has one identity, whatever the scan: (workbook, printed revision, page, item). A photo is evidence, not another
// attempt. A region names a part of an item.
//
// Reading uncertainty is pending, never blank. Unscored and parent-checked are explicit states, not guessed scores.
// Pure TypeScript: no Next.js, React, network, database, clock or Math.random.
import { packageItem, type ItemFormat, type QuestionPackage } from "@/lib/question-package";
import type { StepReference, TeachingContext } from "@/lib/workbook-print-contract";

export const OBSERVATION_VERSION = 1;
/** The most characters kept of one reading. Only the expected answer region's words, never a page's. */
export const MAX_READ_TEXT = 200;

export interface ItemIdentity {
  workbookId: string;
  printedRevision: string;
  pageId: string;
  itemId: string;
}

export const itemKey = (i: ItemIdentity) => `${i.workbookId}:${i.printedRevision}:${i.pageId}:${i.itemId}`;

/**
 * How an item gets its result: code checks what the AI read; a parent checks it; or nobody scores it. "unavailable": the
 * stored question has no trusted package, so nothing can finish it.
 */
export type CheckMethod = "code" | "parent" | "unscored" | "unavailable";

export type MarkResult = "right" | "wrong" | "blank";

/**
 * - pending: no result yet, including when the reading is uncertain;
 * - scored: code checked it, with a result;
 * - parent-pending: it waits for a parent's check;
 * - parent-checked: a parent gave a result;
 * - unscored: nobody scores it, so it has no result.
 */
export type ObservationState = "pending" | "scored" | "parent-pending" | "parent-checked" | "unscored";

export type ReadingCertainty = "certain" | "uncertain" | "not-read";
/** What the marking model may report. */
export const MODEL_READING_ISSUES = ["unreadable", "crossed-out", "multiple-marks", "missing", "blurry", "cut-off", "incomplete", "answer-form", "method-form"] as const;
/** The model's reasons, plus the ones only code sets on a two-ways item. */
export const READING_ISSUES = [...MODEL_READING_ISSUES, "answer-check", "method-wrong", "method-missing"] as const;
export type ReadingIssue = (typeof READING_ISSUES)[number];
const READING_REASONS: Record<ReadingIssue, string> = {
  unreadable: "We cannot read this answer.", "crossed-out": "This answer is crossed out.",
  "multiple-marks": "More than one choice is marked.", missing: "Part of this answer was not read.",
  blurry: "The photo is blurry here.", "cut-off": "Part of this answer is cut off.", incomplete: "Part of this answer is empty.", "answer-form": "Please check this answer.",
  "method-form": "We cannot check this method.", "answer-check": "We cannot check this answer.",
  "method-wrong": "One way does not solve the question.", "method-missing": "One way is missing.",
};
export const readingIssueText = (issue: ReadingIssue) => READING_REASONS[issue];

/** Why a result does not count toward mastery, or null when it does. */
export type MasteryExclusion =
  | "no-teaching-context" | "context-mismatch" | "try-first" | "written-reason" | "not-scorable" | "parent-checked" | "no-item-step" | "unavailable";

export interface MasteryDecision {
  eligible: boolean;
  reason: MasteryExclusion | null;
}

/** Whether anyone helped with the math. Reading handwriting is not help with the math. */
export type HelpState = "none" | "math-help" | "unknown";
export type Actor = "system" | "parent" | "admin";

export interface RegionReading {
  regionId: string;
  /** What the AI read, bounded; null when unreadable or missing. Empty only for a genuinely empty answer. */
  text: string | null;
  /** The typed value code used, as text; null when code could not type it. */
  value: string | null;
  certainty: ReadingCertainty;
  /** Code's check of this region, never a model verdict. Absent in older single-box observations. */
  result?: MarkResult | null;
  issue?: ReadingIssue | null;
  /** A two-ways method only: the AI's verdict and its short reason. Evidence for the team; never shown to a parent. */
  verdict?: "solves" | "does-not-solve" | "unsure" | null;
  verdictReason?: string | null;
  /** A two-ways method only: the kind code recognized in the work. Two methods of one kind are not two ways. */
  methodKind?: string | null;
}

/** A reference to the frozen teaching context, whole. Never a current profile, template or page heading. */
export interface TeachingReference {
  curriculum: { key: string; version: string };
  part: string;
  slot: string;
  practiceType: string | null;
  itemStep: StepReference | null;
}

export interface Observation {
  version: number;
  identity: ItemIdentity;
  /** The photo revision that is evidence of it; null when a parent's change or an unscored item needs no image. */
  evidence: { photoRevision: string } | null;
  readAnswerText: string | null;
  regions: RegionReading[];
  certainty: ReadingCertainty;
  state: ObservationState;
  method: CheckMethod;
  result: MarkResult | null;
  teaching: TeachingReference | null;
  mastery: MasteryDecision;
  help: HelpState;
  actor: Actor;
  /** The canonical result's version: a higher one replaces a lower one. */
  resultVersion: number;
  issue?: ReadingIssue | null;
}

/**
 * What code's score needs: a confirmed reading of the answer. Blank is a reading too, not the absence of one: a region read
 * as genuinely empty. Reading uncertainty is pending, never blank.
 */
function scoredReadingProblem(o: Observation): string | null {
  // Another region may be unreadable, but one definite wrong region rules out
  // a right item. Keep all region readings and their uncertainty as evidence.
  if (o.result === "wrong" && o.certainty !== "not-read" && o.readAnswerText !== null && o.readAnswerText.trim() !== "" &&
      o.regions.some(r => r.result === "wrong" && r.certainty === "certain" && r.text !== null && r.text.trim() !== "")) return null;
  if (o.certainty === "uncertain") return "an uncertain reading stays pending";
  if (o.certainty !== "certain") return "a score needs a confirmed reading";
  if (o.regions.length === 0) return "a score needs a confirmed reading of its regions";
  if (o.regions.some((r) => r.certainty !== "certain" || r.text === null)) return "a score needs every region confirmed";
  const empty = (t: string | null) => t !== null && t.trim() === "";
  if (o.result === "blank") {
    if (!empty(o.readAnswerText) || !o.regions.every((r) => empty(r.text))) return "a blank result needs every region read as empty";
  } else {
    if (o.readAnswerText === null) return "a right or wrong result needs what was read";
    if (empty(o.readAnswerText) || o.regions.every((r) => empty(r.text))) return "a right or wrong result needs something read";
  }
  return null;
}

/** What is wrong with an observation's shape, or null. */
export function observationProblem(o: Observation): string | null {
  if (o.version !== OBSERVATION_VERSION) return "the observation is of a version this code does not read";
  const { workbookId, printedRevision, pageId, itemId } = o.identity;
  if (!workbookId || !printedRevision || !pageId || !itemId) return "the observation's item identity is not whole";
  if (!Number.isInteger(o.resultVersion) || o.resultVersion < 1) return "the observation has no result version";
  const texts = [o.readAnswerText, ...o.regions.map((r) => r.text)];
  if (texts.some((t) => t !== null && t.length > MAX_READ_TEXT)) return "a reading is longer than the limit";
  const hasResult = o.state === "scored" || o.state === "parent-checked";
  if (hasResult !== (o.result !== null)) return "an observation has a result only when it is scored or parent-checked";
  if (o.state === "scored" && o.method !== "code") return "only code scores an item";
  if ((o.state === "parent-pending" || o.state === "parent-checked") && o.method !== "parent") return "only a parent-checked item waits for a parent";
  if (o.state === "unscored" && o.method !== "unscored") return "only an unscored item can be unscored";
  // The page's certainty cannot say more than its regions do.
  if (o.certainty === "certain" && o.regions.some((r) => r.certainty !== "certain")) return "a region is less certain than the observation says";
  if (o.regions.some((r) => r.certainty === "not-read" && r.text !== null)) return "a region not read holds text";
  if ([o.issue, ...o.regions.map(r => r.issue)].some(i => i != null && !READING_ISSUES.includes(i))) return "a reading has an unknown uncertainty reason";
  if (o.regions.some(r => r.result != null && !["right", "wrong", "blank"].includes(r.result))) return "a region has an unknown result";
  if (o.state === "scored") {
    const problem = scoredReadingProblem(o);
    if (problem) return problem;
  }
  if (o.mastery.eligible && o.state === "unscored") return "an unscored item cannot count toward mastery";
  return null;
}

// ---------- Eligibility ----------

const WRITTEN_FORMATS: ReadonlySet<ItemFormat> = new Set(["written-reason"]);

/**
 * Whether a result on an item may count toward mastery, from both the trusted package and its frozen teaching context:
 * neither alone. Try first never counts, even when scorable. A written reason or a deliberately unscored activity never
 * counts. A parent-checked item counts only when its printed context explicitly permits it. An item with no step
 * (a review item not yet carrying one) stays out.
 */
export function masteryDecision(pkg: QuestionPackage | null, teaching: TeachingContext | null): MasteryDecision {
  const no = (reason: MasteryExclusion): MasteryDecision => ({ eligible: false, reason });
  if (!pkg || (!pkg.item && !pkg.answer)) return no("unavailable");
  const item = packageItem(pkg);
  if (WRITTEN_FORMATS.has(item.format)) return no("written-reason");
  if (!teaching) return no("no-teaching-context");
  const e = teaching.eligibility;
  if (e.format !== item.format || e.scorable !== item.scorable || e.parentChecked !== item.parentChecked) return no("context-mismatch");
  if (teaching.practiceType === "try-first") return no("try-first");
  if (item.parentChecked) return e.mastery && teaching.itemStep ? { eligible: true, reason: null } : no("parent-checked");
  if (!item.scorable) return no("not-scorable");
  if (!teaching.itemStep) return no("no-item-step");
  if (!e.mastery) return no(e.reason === "try-first" ? "try-first" : e.reason === "parent-checked" ? "parent-checked" : e.reason === "no-item-step" ? "no-item-step" : "not-scorable");
  return { eligible: true, reason: null };
}

/** A two-ways item: the AI reads both methods and the answer, and code checks all three. */
export const isTwoWays = (pkg: QuestionPackage | null) => pkg?.item?.format === "two-ways";

export function checkMethod(pkg: QuestionPackage | null): CheckMethod {
  if (!pkg || (!pkg.item && !pkg.answer)) return "unavailable";
  const item = packageItem(pkg);
  return item.scorable ? "code" : item.parentChecked ? "parent" : "unscored";
}

// ---------- Expected items ----------

export interface ExpectedItem {
  identity: ItemIdentity;
  /** The printed question number. */
  number: number;
  method: CheckMethod;
  /** A two-ways item. Absent on every other format and in older expected records. */
  twoWays?: true;
  /** The regions a score must read: each answer box and choice of the item. */
  scoredRegions: string[];
  mastery: MasteryDecision;
  teaching: TeachingReference | null;
}

export interface PageForObservation {
  workbookId: string;
  printedRevision: string;
  pageId: string;
  questions: readonly { number: number; package: QuestionPackage | null; teaching: TeachingContext | null }[];
}

const scoredRegions = (pkg: QuestionPackage | null) =>
  (checkMethod(pkg) === "code" ? packageItem(pkg!).regions.filter((r) => r.kind === "box" || r.kind === "choice" || (r.kind === "work" && isTwoWays(pkg))).map((r) => r.id) : []);

const reference = (t: TeachingContext | null): TeachingReference | null => t && {
  curriculum: t.curriculum, part: t.part, slot: t.slot, practiceType: t.practiceType, itemStep: t.itemStep,
};

/** The numbered items a page expects, from its stored questions and their frozen teaching context. */
export function expectedItems(page: PageForObservation): ExpectedItem[] {
  return [...page.questions].sort((a, b) => a.number - b.number).map((q) => ({
    identity: { workbookId: page.workbookId, printedRevision: page.printedRevision, pageId: page.pageId, itemId: q.package?.id ?? `question-${q.number}` },
    number: q.number,
    method: checkMethod(q.package),
    ...(isTwoWays(q.package) ? { twoWays: true as const } : {}),
    scoredRegions: scoredRegions(q.package),
    mastery: masteryDecision(q.package, q.teaching),
    teaching: reference(q.teaching),
  }));
}

/** An item's observation before any reading: pending, or waiting for a parent, or explicitly unscored. */
export function firstObservation(e: ExpectedItem, photoRevision: string | null): Observation {
  return {
    version: OBSERVATION_VERSION, identity: e.identity, evidence: photoRevision ? { photoRevision } : null,
    readAnswerText: null, regions: [], certainty: "not-read",
    state: e.method === "unscored" ? "unscored" : e.method === "parent" ? "parent-pending" : "pending",
    method: e.method, result: null, teaching: e.teaching, mastery: e.mastery, help: "unknown", actor: "system", resultVersion: 1,
  };
}

// ---------- Page completion ----------

export type ItemProgress = "finished" | "pending" | "parent-check" | "missing" | "unavailable";

export interface PageCompletion {
  /** Complete: each expected numbered item has a terminal observation. "no-items": the page expects none. */
  status: "complete" | "incomplete" | "no-items";
  items: { itemId: string; number: number; progress: ItemProgress }[];
  finished: number;
  total: number;
}

/** Exactly the item's scored regions, each once: a reading of part of an item does not score the item. */
const readsWholeItem = (e: ExpectedItem, o: Observation) => {
  const read = o.regions.map((r) => r.regionId).sort();
  const wanted = [...e.scoredRegions].sort();
  return read.length === wanted.length && read.every((id, i) => id === wanted[i]);
};

const isTerminal = (e: ExpectedItem, o: Observation) =>
  (e.method === "code" && ((o.state === "scored" && readsWholeItem(e, o)) || (o.state === "parent-checked" && o.actor === "parent")) && o.result !== null)
  || (e.method === "parent" && o.state === "parent-checked" && o.result !== null)
  || (e.method === "unscored" && o.state === "unscored");

/** The current observation of each item: the highest result version, of this exact revision. */
function currentObservations(expected: readonly ExpectedItem[], observations: readonly Observation[]) {
  const wanted = new Set(expected.map((e) => itemKey(e.identity)));
  const current = new Map<string, Observation>();
  for (const o of observations) {
    const key = itemKey(o.identity);
    // (An observation of another revision has another key: an old photo's result never finishes a new revision's item.)
    if (!wanted.has(key) || observationProblem(o)) continue;
    const held = current.get(key);
    if (!held || o.resultVersion > held.resultVersion) current.set(key, o);
  }
  return current;
}

/**
 * Whether a page's marks are ready: every expected item has a terminal observation. A pending parent check is not
 * finished, and an unscored item can finish with no score. This is apart from an accepted scan receipt, which counts
 * toward printed-day progress.
 */
export function pageCompletion(expected: readonly ExpectedItem[], observations: readonly Observation[]): PageCompletion {
  const current = currentObservations(expected, observations);
  const items = expected.map((e) => {
    const o = current.get(itemKey(e.identity));
    const progress: ItemProgress = e.method === "unavailable" ? "unavailable" : !o ? "missing" : isTerminal(e, o) ? "finished"
      : o.state === "parent-pending" ? "parent-check" : "pending";
    return { itemId: e.identity.itemId, number: e.number, progress };
  });
  const finished = items.filter((i) => i.progress === "finished").length;
  return { status: items.length === 0 ? "no-items" : finished === items.length ? "complete" : "incomplete", items, finished, total: items.length };
}

// ---------- Which observations may publish an event ----------

export type MarkingEventDecision =
  | { publish: true; key: string; result: MarkResult; step: StepReference }
  | { publish: false; reason: MasteryExclusion | "not-terminal" | "unscored" | "other-identity" | "invalid" };

/**
 * One decision for page results, event publication, profile facts and progress: whether this observation may publish its
 * item's one effective `marking` event. The decision reads the expected item, never the observation's own claim, so a
 * stored observation cannot make itself eligible. The event key stays the same across scans. An excluded item keeps its
 * observation and adds nothing to a scored tally. Publication belongs to S4.
 */
export function markingEvent(e: ExpectedItem, o: Observation): MarkingEventDecision {
  if (itemKey(e.identity) !== itemKey(o.identity)) return { publish: false, reason: "other-identity" };
  if (observationProblem(o)) return { publish: false, reason: "invalid" };
  if (!e.mastery.eligible) return { publish: false, reason: e.mastery.reason ?? "invalid" };
  if (!isTerminal(e, o)) return { publish: false, reason: "not-terminal" };
  if (o.result === null) return { publish: false, reason: "unscored" };
  const step = e.teaching?.itemStep;
  if (!step) return { publish: false, reason: "no-item-step" };
  return { publish: true, key: `marking:${itemKey(e.identity)}`, result: o.result, step };
}
