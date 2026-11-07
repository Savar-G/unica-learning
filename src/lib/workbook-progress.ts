// Pure, normalized evidence contract for #472. This does not call or change the planner.
import type { ExpectedItem, HelpState, ItemIdentity, MarkResult, Observation, TeachingReference } from "./scan-observation";
import type { CurriculumKey, CurriculumSkill, CurriculumStep } from "./workbook-curriculum/types";
import type { SpacedReview, StepRef, UnresolvedMiss } from "./workbook-plan";
import type { WorkbookQuestionRef } from "./question-package";

export const WORKBOOK_PROGRESS_VERSION = 1;

/** A trusted, version-pinned slice of the curriculum, not model-written mistake text. */
export interface ProgressCurriculum {
  key: CurriculumKey;
  version: string;
  skill: Pick<CurriculumSkill, "id" | "unit" | "curriculum">;
  steps: readonly CurriculumStep[];
}
export interface ProgressSampleItem {
  expected: ExpectedItem;
  /** Version of the stored TeachingContext from which expected.teaching was projected. */
  contextVersion: number | null;
  day: number;
  question: WorkbookQuestionRef;
  /** Exact effective original version frozen at the cutoff; null means no result was captured. */
  resultVersion: number | null;
}
export interface ProgressSnapshot {
  version: 1;
  id: string;
  parentId: string;
  childId: string;
  cutoff: number;
  selection: StepRef & { approvalReference: string };
  curriculum: { key: CurriculumKey; version: string };
  /** The adapter freezes the allowed books, revisions and days. Days 8-10 need explicit inclusion. */
  scope: readonly { workbookId: string; printedRevision: string; days: readonly number[] }[];
  requiredSample: readonly ProgressSampleItem[] | null;
  reviews: readonly SpacedReview[];
  missedReviews: readonly SpacedReview[];
}
export interface ProgressReading {
  observation: Observation;
  at: number;
  provenance: { eventId: string; model: string | null; prompt: string | null };
}
export type ProgressCause = { kind: "unknown" } | {
  kind: "careless";
  evidenceId: string;
  resultVersion: number;
} | {
  kind: "conceptual";
  evidenceId: string;
  resultVersion: number;
  /** Index in the version-pinned selected CurriculumStep.mistakes. */
  mistake: { stepPosition: string; index: number };
};
export interface ProgressOriginal {
  parentId: string;
  childId: string;
  day: number;
  first: ProgressReading;
  /** Contiguous explicit parent/admin original-mark changes, in result-version order. */
  changes: readonly ProgressReading[];
  secondTries: readonly {
    id: string; at: number; basedOnResultVersion: number; result: MarkResult; help: HelpState;
  }[];
  /** Established against the named original-result version. No arithmetic or text inference occurs here. */
  cause: ProgressCause;
}
export interface IssuedProgressDecision {
  version: 1;
  id: string;
  parentId: string;
  childId: string;
  workbookId: string;
  issuedAt: number;
  curriculum: { key: CurriculumKey; version: string };
  selection: StepRef;
  action: "advance" | "repeat" | "regress" | "retain-review" | "change-approach";
}
export interface ProgressHistory {
  version: 1;
  /** Already scoped canonical results, not HistoryRecord photos, names, jobs or costs. */
  originals: readonly ProgressOriginal[];
  /** Complete issued-book decision history for this selected step, through the cutoff. */
  issuedDecisions: readonly IssuedProgressDecision[];
}
export type ProgressAction = "retain-unfinished" | "advance" | "skill-complete" | "repeat-new-numbers"
  | "regress-represent" | "repeat-check-work" | "retain-review" | "change-approach";
export interface ProgressItemDecision {
  key: string;
  identity: ItemIdentity;
  question: WorkbookQuestionRef;
  eligible: boolean;
  status: "excluded" | "missing-context" | "missing" | "pending" | "resolved";
  first: ProgressReading | null;
  effective: ProgressReading | null;
  secondTries: ProgressOriginal["secondTries"];
  cause: ProgressCause;
  effectiveCause: ProgressCause;
  unresolved: boolean;
}
export interface WorkbookProgressDecision {
  version: 1;
  snapshotId: string;
  cutoff: number;
  curriculum: ProgressSnapshot["curriculum"];
  selection: StepRef;
  status: "insufficient-evidence" | "complete";
  action: ProgressAction;
  target: StepRef;
  reason: "incomplete-sample" | "mastered" | "practice" | "conceptual" | "careless" | "unknown-cause" | "repeat-cap";
  score: { required: number; resolved: number; independentFirstRight: number; percent: number | null };
  /** Only consecutive prior issued repeats count. Calling this function never issues a book. */
  priorRepeats: number;
  repeatIncrement: 0 | 1;
  representation: { current: string; request: "keep" | "another"; maya: boolean };
  parentFollowUp: boolean;
  focusedPractice: { stepPosition: string; mistakeIndex: number; misconception: string | null; occurrences: number; keys: string[] }[];
  /** A one-skill projection for the future adapter. It cannot encode regression on its own. */
  passed: Readonly<Record<string, number>>;
  misses: UnresolvedMiss[];
  items: ProgressItemDecision[];
  consumed: { key: string; firstVersion: number; effectiveVersion: number }[];
  reviews: readonly SpacedReview[];
  missedReviews: readonly SpacedReview[];
}
export type WorkbookProgressResult = { ok: true; decision: WorkbookProgressDecision } | {
  ok: false; reason: "invalid-contract" | "invalid-scope" | "invalid-context" | "invalid-evidence" | "conflicting-duplicate";
};

// Tuple encoding avoids the delimiter collision of user-supplied item IDs containing colons.
const keyOf = (i: ItemIdentity) => JSON.stringify([i.workbookId, i.printedRevision, i.pageId, i.itemId]);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const time = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const identityOK = (i: ItemIdentity) => i && [i.workbookId, i.printedRevision, i.pageId, i.itemId].every(text);
const same = (a: unknown, b: unknown): boolean => stable(a) === stable(b);
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v !== null && typeof v === "object") return `{${Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`).join(",")}}`;
  return JSON.stringify(v) ?? "undefined";
}
const copy = <T>(v: T): T => structuredClone(v);
const stepRef = (s: StepRef): StepRef => ({ unit: s.unit, skill: s.skill, step: s.step });
const resolved = (o: Observation) => o.certainty !== "uncertain"
  && (o.state === "parent-checked" || (o.state === "scored" && o.certainty === "certain"));
const resultOK = (v: unknown) => ["right", "wrong", "blank"].includes(v as string);
const helpOK = (v: unknown) => ["none", "math-help", "unknown"].includes(v as string);

function teachingOK(t: TeachingReference, s: ProgressSnapshot): boolean {
  return same(t.curriculum, s.curriculum) && text(t.part) && text(t.slot)
    && (t.practiceType === null || text(t.practiceType))
    && (t.itemStep === null || same(t.itemStep, stepRef(s.selection)));
}
function readingOK(r: ProgressReading, e: ExpectedItem, cutoff: number): boolean {
  const o = r.observation;
  if (!time(r.at) || r.at > cutoff || !text(r.provenance.eventId)
    || ![r.provenance.model, r.provenance.prompt].every(v => v === null || text(v))
    || o.version !== 1 || !positive(o.resultVersion) || !same(o.identity, e.identity)
    || !same(o.teaching, e.teaching) || !same(o.mastery, e.mastery) || !helpOK(o.help)
    || !["system", "parent", "admin"].includes(o.actor)
    || !["certain", "uncertain", "not-read"].includes(o.certainty)
    || !["pending", "scored", "parent-pending", "parent-checked", "unscored"].includes(o.state)
    || !["code", "parent", "unscored", "unavailable"].includes(o.method)
    || (o.result !== null && !resultOK(o.result)) || !Array.isArray(o.regions)
    || (o.evidence !== null && !text(o.evidence.photoRevision))) return false;
  const bounded = (v: unknown) => v === null || (typeof v === "string" && v.length <= 200);
  if (!bounded(o.readAnswerText) || o.regions.some(r => !text(r.regionId) || !bounded(r.text) || !bounded(r.value)
    || !["certain", "uncertain", "not-read"].includes(r.certainty)
    || (r.result != null && !resultOK(r.result))
    || (r.certainty === "not-read" && r.text !== null))) return false;
  if (new Set(o.regions.map(r => r.regionId)).size !== o.regions.length) return false;
  const terminal = o.state === "scored" || o.state === "parent-checked";
  if (terminal !== (o.result !== null) || (o.state === "scored" && o.method !== "code")
    || (["parent-pending", "parent-checked"].includes(o.state) && o.method !== "parent")
    || (o.state === "unscored" && o.method !== "unscored")) return false;
  if (o.state === "scored" && o.certainty === "certain") {
    if (o.regions.length === 0 || !same([...o.regions.map(r => r.regionId)].sort(), [...e.scoredRegions].sort())
      || o.regions.some(r => r.certainty !== "certain" || r.text === null) || o.readAnswerText === null) return false;
    if (o.result === "blank") {
      if (o.readAnswerText.trim() !== "" || o.regions.some(r => r.text!.trim() !== "")) return false;
    } else if (o.readAnswerText.trim() === "" || o.regions.every(r => r.text!.trim() === "")) return false;
  }
  return true;
}

/** No store, clock, random value, provider, photo lifecycle or global configuration is read. */
export function deriveWorkbookProgress(snapshot: ProgressSnapshot, curriculum: ProgressCurriculum, history: ProgressHistory): WorkbookProgressResult {
  // The typed boundary still refuses malformed persisted JSON. Error results never echo private evidence.
  try { return derive(snapshot, curriculum, history); }
  catch { return { ok: false, reason: "invalid-contract" }; }
}
function derive(s: ProgressSnapshot, c: ProgressCurriculum, h: ProgressHistory): WorkbookProgressResult {
  const fail = (reason: Extract<WorkbookProgressResult, { ok: false }>["reason"]): WorkbookProgressResult => ({ ok: false, reason });
  if (s.version !== 1 || h.version !== 1 || ![s.id, s.parentId, s.childId, s.selection.approvalReference, c.version].every(text)
    || !time(s.cutoff) || !same(s.curriculum, { key: c.key, version: c.version })
    || c.key !== c.skill.curriculum || s.selection.skill !== c.skill.id || s.selection.unit !== c.skill.unit
    || !positive(s.selection.step) || !c.steps.length) return fail("invalid-contract");
  if (c.steps.some((x, i) => x.number !== i + 1 || x.skill !== c.skill.id || x.curriculum !== c.key || !text(x.position) || !text(x.representation))
    || new Set(c.steps.map(x => x.position)).size !== c.steps.length) return fail("invalid-contract");
  const selected = c.steps[s.selection.step - 1];
  if (!selected) return fail("invalid-contract");
  for (const r of [...s.reviews, ...s.missedReviews]) {
    if (!text(r.skill) || !positive(r.step) || (r.skill === c.skill.id && r.step > c.steps.length) || !Number.isInteger(r.interval)
      || r.interval < 0 || r.interval > 3 || !Number.isSafeInteger(r.due)) return fail("invalid-contract");
  }
  const scope = new Map<string, ProgressSnapshot["scope"][number]>();
  for (const x of s.scope) {
    const key = JSON.stringify([x.workbookId, x.printedRevision]);
    if (!text(x.workbookId) || !text(x.printedRevision) || scope.has(key) || !x.days.length
      || x.days.some(d => !positive(d) || d > 10) || new Set(x.days).size !== x.days.length) return fail("invalid-scope");
    scope.set(key, x);
  }
  const samples = new Map<string, ProgressSampleItem>();
  const pages = new Map<string, { number: number; day: number }>(), positions = new Set<string>();
  const printedPages = new Map<string, string>();
  for (const x of s.requiredSample ?? []) {
    const e = x.expected, key = keyOf(e.identity), allowed = scope.get(JSON.stringify([e.identity.workbookId, e.identity.printedRevision]));
    if (!identityOK(e.identity) || !allowed?.days.includes(x.day) || !positive(e.number)
      || x.question.source !== "workbook" || x.question.workbookId !== e.identity.workbookId
      || !positive(x.question.page) || x.question.question !== e.number
      || (x.resultVersion !== null && !positive(x.resultVersion))) return fail("invalid-scope");
    if (samples.has(key)) return fail("conflicting-duplicate");
    const pageKey = JSON.stringify([e.identity.workbookId, e.identity.printedRevision, e.identity.pageId]);
    const printedPageKey = JSON.stringify([e.identity.workbookId, e.identity.printedRevision, x.question.page]);
    const positionKey = JSON.stringify([e.identity.workbookId, e.identity.printedRevision, x.question.page, x.question.question]);
    if ((pages.has(pageKey) && !same(pages.get(pageKey), { number: x.question.page, day: x.day })) || positions.has(positionKey)
      || (printedPages.has(printedPageKey) && printedPages.get(printedPageKey) !== e.identity.pageId)) return fail("invalid-scope");
    pages.set(pageKey, { number: x.question.page, day: x.day }); positions.add(positionKey);
    printedPages.set(printedPageKey, e.identity.pageId);
    if ((x.contextVersion !== null && x.contextVersion !== 1) || (e.teaching && !teachingOK(e.teaching, s))) return fail("invalid-context");
    if (!['code', 'parent', 'unscored', 'unavailable'].includes(e.method) || typeof e.mastery.eligible !== "boolean"
      || !Array.isArray(e.scoredRegions) || e.scoredRegions.some(r => !text(r)) || new Set(e.scoredRegions).size !== e.scoredRegions.length
      || (e.mastery.eligible && (e.mastery.reason !== null || e.method === "unscored" || e.method === "unavailable"
        || e.teaching?.practiceType === "try-first" || (e.teaching && e.teaching.itemStep === null)))
      || (!e.mastery.eligible && !text(e.mastery.reason))) return fail("invalid-context");
    samples.set(key, x);
  }
  const originals = new Map<string, ProgressOriginal>();
  const eventIds = new Set<string>(), tryIds = new Set<string>();
  for (const r of h.originals) {
    const key = keyOf(r.first.observation.identity), x = samples.get(key);
    if (!x || r.parentId !== s.parentId || r.childId !== s.childId || r.day !== x.day) return fail("invalid-scope");
    if (originals.has(key)) {
      if (!same(originals.get(key), r)) return fail("conflicting-duplicate");
      continue;
    }
    if (!readingOK(r.first, x.expected, s.cutoff) || r.first.observation.method !== x.expected.method) return fail("invalid-evidence");
    if (eventIds.has(r.first.provenance.eventId)) return fail("conflicting-duplicate");
    eventIds.add(r.first.provenance.eventId);
    let previous = r.first;
    for (const change of r.changes) {
      if (!readingOK(change, x.expected, s.cutoff) || !resolved(change.observation)
        || change.observation.state !== "parent-checked" || change.observation.actor === "system"
        || change.observation.resultVersion !== previous.observation.resultVersion + 1 || change.at < previous.at
        || change.provenance.eventId === previous.provenance.eventId) return fail("invalid-evidence");
      if (eventIds.has(change.provenance.eventId)) return fail("conflicting-duplicate");
      eventIds.add(change.provenance.eventId);
      previous = change;
    }
    if (previous.observation.resultVersion !== x.resultVersion) return fail("invalid-evidence");
    const versions = [r.first, ...r.changes];
    for (const t of r.secondTries) {
      const atVersion = versions.findIndex(v => v.observation.resultVersion === t.basedOnResultVersion);
      if (!text(t.id) || tryIds.has(t.id) || !time(t.at) || t.at > s.cutoff || atVersion < 0
        || t.at < versions[atVersion].at || (versions[atVersion + 1] && t.at >= versions[atVersion + 1].at)
        || !resultOK(t.result) || !helpOK(t.help)) return fail("invalid-evidence");
      tryIds.add(t.id);
    }
    const cause = r.cause;
    if (!["unknown", "careless", "conceptual"].includes(cause.kind)) return fail("invalid-evidence");
    if (cause.kind !== "unknown") {
      const established = versions.find(v => v.observation.resultVersion === cause.resultVersion);
      if (!text(cause.evidenceId) || !established || established.observation.result !== "wrong"
        || !resolved(established.observation)) return fail("invalid-evidence");
    }
    if (cause.kind === "conceptual") {
      const m = selected.mistakes[cause.mistake.index];
      if (cause.mistake.stepPosition !== selected.position || !Number.isInteger(cause.mistake.index) || !m || m.kind !== "conceptual") return fail("invalid-evidence");
    }
    originals.set(key, r);
  }
  const issued = new Map<string, IssuedProgressDecision>(), books = new Set<string>();
  for (const d of h.issuedDecisions) {
    if (d.version !== 1 || !text(d.id) || !text(d.workbookId) || d.parentId !== s.parentId || d.childId !== s.childId
      || !same(d.curriculum, s.curriculum) || !same(d.selection, stepRef(s.selection)) || !time(d.issuedAt) || d.issuedAt > s.cutoff
      || !["advance", "repeat", "regress", "retain-review", "change-approach"].includes(d.action)) return fail("invalid-evidence");
    if (issued.has(d.id)) {
      if (!same(issued.get(d.id), d)) return fail("conflicting-duplicate");
      continue;
    }
    if (books.has(d.workbookId)) return fail("conflicting-duplicate");
    issued.set(d.id, d); books.add(d.workbookId);
  }
  const ordered = [...issued.values()].sort((a, b) => a.issuedAt - b.issuedAt);
  if (ordered.some((d, i) => i > 0 && d.issuedAt === ordered[i - 1].issuedAt)) return fail("invalid-evidence");
  let priorRepeats = 0;
  for (const d of ordered.reverse()) { if (d.action !== "repeat") break; priorRepeats++; }
  const items: ProgressItemDecision[] = [...samples.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([key, x]) => {
    const r = originals.get(key), e = x.expected;
    const first = r?.first ?? null, effective = r ? r.changes.at(-1) ?? r.first : null;
    const missingContext = !e.teaching || x.contextVersion === null;
    const status: ProgressItemDecision["status"] = missingContext ? "missing-context" : !e.mastery.eligible ? "excluded"
      : !r ? "missing" : !resolved(first!.observation) || !resolved(effective!.observation) ? "pending" : "resolved";
    const secondTryFixed = r?.secondTries.some(t => t.result === "right" && t.basedOnResultVersion === effective?.observation.resultVersion);
    const independentRight = effective?.observation.result === "right" && first?.observation.help === "none";
    const cause = r?.cause ?? { kind: "unknown" as const };
    const effectiveCause: ProgressCause = effective?.observation.result === "wrong" && cause.kind !== "unknown"
      && cause.resultVersion === effective.observation.resultVersion ? cause : { kind: "unknown" };
    return copy({ key, identity: e.identity, question: x.question, eligible: e.mastery.eligible, status,
      first, effective, secondTries: r?.secondTries ?? [], cause, effectiveCause,
      unresolved: e.mastery.eligible && !!effective && resolved(effective.observation) && !independentRight && !secondTryFixed });
  });
  const eligible = items.filter(x => x.eligible), complete = eligible.length > 0 && items.every(x => x.status === "excluded" || x.status === "resolved");
  // Parent mark changes correct the effective first answer. A second try never enters this score.
  const independent = (x: ProgressItemDecision) => x.effective?.observation.result === "right" && x.first?.observation.help === "none";
  const right = eligible.filter(x => x.status === "resolved" && independent(x)).length;
  const misses: UnresolvedMiss[] = items.filter(x => x.unresolved).map(x => ({
    skill: c.skill.id, question: x.question, event: x.first!.provenance.eventId,
    result: x.effective!.observation.result === "blank" ? "blank" : x.effective!.observation.result === "right" ? "right_with_help" : "wrong",
    mistake: x.effectiveCause.kind === "conceptual" ? selected.mistakes[x.effectiveCause.mistake.index].misconception : null, stuckStep: null,
  }));
  let action: ProgressAction = "retain-unfinished", reason: WorkbookProgressDecision["reason"] = "incomplete-sample", target = stepRef(s.selection);
  let repeatIncrement: 0 | 1 = 0;
  if (complete) {
    if (right * 100 >= eligible.length * 90) {
      action = s.selection.step === c.steps.length ? "skill-complete" : "advance"; reason = "mastered";
      target = { ...target, step: Math.min(c.steps.length, target.step + 1) };
    } else if (right * 100 >= eligible.length * 75) { action = "repeat-new-numbers"; reason = "practice"; }
    else if (eligible.filter(x => x.effectiveCause.kind === "conceptual").length >= 2) {
      action = "regress-represent"; reason = "conceptual"; target = { ...target, step: Math.max(1, target.step - 1) };
    } else if (eligible.filter(x => !independent(x)).every(x => x.effectiveCause.kind === "careless")) {
      action = "repeat-check-work"; reason = "careless";
    } else { action = "retain-review"; reason = "unknown-cause"; }
    if (action === "repeat-new-numbers" || action === "repeat-check-work") {
      if (priorRepeats >= 2) { action = "change-approach"; reason = "repeat-cap"; }
      else repeatIncrement = 1;
    }
  }
  const focused = new Map<number, string[]>();
  for (const x of eligible) if (x.effectiveCause.kind === "conceptual") {
    const index = x.effectiveCause.mistake.index;
    focused.set(index, [...(focused.get(index) ?? []), x.key]);
  }
  return { ok: true, decision: {
    version: 1, snapshotId: s.id, cutoff: s.cutoff, curriculum: copy(s.curriculum), selection: stepRef(s.selection),
    status: complete ? "complete" : "insufficient-evidence", action, target, reason,
    score: { required: eligible.length, resolved: eligible.filter(x => x.status === "resolved").length,
      independentFirstRight: right, percent: complete ? right * 100 / eligible.length : null }, priorRepeats, repeatIncrement,
    representation: { current: selected.representation, request: action === "regress-represent" || action === "change-approach" ? "another" : "keep", maya: action === "change-approach" },
    parentFollowUp: action === "change-approach",
    focusedPractice: complete ? [...focused].filter(([, keys]) => keys.length >= 3).map(([mistakeIndex, keys]) => ({
      stepPosition: selected.position, mistakeIndex, misconception: selected.mistakes[mistakeIndex].misconception, occurrences: keys.length, keys,
    })) : [],
    passed: { [c.skill.id]: action === "advance" || action === "skill-complete" ? s.selection.step : s.selection.step - 1 },
    misses, items, consumed: items.filter(x => x.first).map(x => ({ key: x.key, firstVersion: x.first!.observation.resultVersion, effectiveVersion: x.effective!.observation.resultVersion })),
    reviews: copy(s.reviews), missedReviews: copy(s.missedReviews),
  } };
}
