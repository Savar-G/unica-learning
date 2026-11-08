// #472 The book 2 preview's positive path. From frozen sources that hold a Book 1 baseline (version 2), it binds the
// baseline to the shipped book, reads the second-try ledger, plans book 2 from the frozen Book 1 inputs, and calls the
// existing public preview (previewNextWorkbookPlanFromHistory: readWorkbookProgressHistory, then
// previewNextWorkbookPlan). It adds no planner, threshold or review policy, and it issues, saves and queues nothing.
//
// It answers "unavailable" with one reason whenever a proof is missing or does not hold, and "held" when the book has
// no marked scan at all (#628: never advance or repeat by plan). Only a Book 1 to book 2 preview is supported here:
// later books need book 2's issued decisions (#473, #476).
import "server-only";
import { book1BindingProblem, book2Planning, readBook1Baseline, type Book1Baseline } from "./workbook-book1-baseline";
import { readBook1Corrections, type CorrectionRefusal } from "./workbook-correction-journal";
import type { CurriculumKey } from "./workbook-curriculum/types";
import type { PlanInput, WorkbookPlan } from "./workbook-plan";
import type { WorkbookProgressDecision } from "./workbook-progress";
import { previewNextWorkbookPlan, type PlanPreviewRefusal } from "./workbook-progress-plan";
import { readWorkbookProgressHistory, type HistoryFence, type HistoryPage, type HistoryRefusal,
  type WorkbookProgressHistoryInput, type WorkbookProgressHistoryStore } from "./workbook-progress-history";
import { sourceHash } from "./workbook-progress-hash";
import { validateCatalog, type FrozenWorkbookSourcesV2, type SourceUnavailable, type WorkbookPreviewRequest } from "./workbook-progress-source";

export const PREVIEW_ENGINE_V2 = "workbook-preview-sources/2;progress/1;history/1;plan-preview/1;book1-baseline/1";

export type Book1PreviewRefusal = "baseline-invalid" | "baseline-owner" | `baseline-binding-${"owner" | "book" | "revision" | "approval" | "frame" | "issues"}`
  | "not-book2-scope" | "selection-not-issued" | "selection-not-in-baseline-curriculum" | CorrectionRefusal
  | "curriculum-version-changed" | "profile-unreadable" | "next-planner-refused" | "invalid-planning" | `history-${HistoryRefusal}`
  | `preview-${PlanPreviewRefusal}`;
interface Book1Common {
  requiredSample: SourceUnavailable["requiredSample"];
  scope: SourceUnavailable["scope"];
  sources: SourceUnavailable["sources"];
}
export interface Book1Unavailable extends Book1Common {
  ok: false; availability: "unavailable"; reasons: [Book1PreviewRefusal]; sourceStatus: { catalog: "validated"; book1: "refused" };
  consumedVersions: []; decision: null; plan: null;
}
export interface Book1Held extends Book1Common {
  ok: false; availability: "held"; reasons: ["no-marked-scans"]; sourceStatus: { catalog: "validated"; book1: "held" };
  consumedVersions: []; decision: null; plan: null;
  baseline: { id: string; hash: string };
}
export interface Book1Complete extends Book1Common {
  ok: true;
  availability: "complete";
  sourceStatus: { catalog: "validated"; retainedHistory: "derived"; priorMastery: "book1-baseline"; planning: "book1-baseline";
    issuedDecisions: "book1-initial-issues"; corrections: "second-try-ledger"; causes: "unavailable" };
  baseline: { id: string; hash: string; draftRevision: number; printedRevision: string; boundaryAt: number; planningKind: Book1Baseline["planning"]["kind"] };
  consumedVersions: WorkbookProgressDecision["consumed"];
  decision: WorkbookProgressDecision;
  /** The exact input the public planner received for book 2, and its plan. Preview only: nothing is queued. */
  planningInput: PlanInput;
  plan: WorkbookPlan;
  held: { originals: { reason: string; key: string }[]; changes: number; secondTries: { reason: string; id: string }[]; undatedMarks: number };
}
export type Book1PreviewOutcome = SourceUnavailable | Book1Unavailable | Book1Held | Book1Complete;

const keyOf = (i: { workbookId: string; printedRevision: string; pageId: string; itemId: string }) => JSON.stringify([i.workbookId, i.printedRevision, i.pageId, i.itemId]);
function page<T extends { id: string | number }>(rows: readonly T[], after: string | number | null, limit: number): HistoryPage<T> {
  const rest = rows.filter(r => after === null || r.id > after).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return structuredClone({ rows: rest.slice(0, limit), remaining: rest.length });
}

/** Throws "invalid-source" on a catalog that does not validate, as the version 1 evaluator does. */
export async function evaluateBook1Preview(request: WorkbookPreviewRequest, frozen: FrozenWorkbookSourcesV2): Promise<Book1PreviewOutcome> {
  const { outcome: base, pages, undated } = validateCatalog(request, frozen);
  if (!frozen.book1) return base;
  const common: Book1Common = { requiredSample: base.requiredSample, scope: base.scope, sources: base.sources };
  const refuse = (reason: Book1PreviewRefusal): Book1Unavailable => structuredClone({ ok: false, availability: "unavailable", reasons: [reason],
    sourceStatus: { catalog: "validated", book1: "refused" }, ...common, consumedVersions: [], decision: null, plan: null });
  const f = frozen.book1;
  if (f.version !== 1) return refuse("baseline-invalid");
  const baseline = readBook1Baseline(f.baseline);
  if (!baseline || baseline.id !== f.baseline.id) return refuse("baseline-invalid");
  if (baseline.parentId !== request.parentId || baseline.childId !== request.childId) return refuse("baseline-owner");
  // Book 1 to book 2 only: the selected book is the bound Book 1, and it is the only book so far.
  const selected = frozen.books.find(b => b.book.id === request.workbookId)!;
  if (frozen.books.length !== 1 || selected.book.number !== 1) return refuse("not-book2-scope");
  const binding = book1BindingProblem(baseline, selected);
  if (binding) return refuse(`baseline-binding-${binding}`);
  const s = request.selection;
  if (!baseline.initialIssues.some(i => i.selection.unit === s.unit && i.selection.skill === s.skill && i.selection.step === s.step)) return refuse("selection-not-issued");
  const skill = baseline.curriculum.skills.find(c => c.skill.id === s.skill && c.skill.unit === s.unit);
  if (!skill) return refuse("selection-not-in-baseline-curriculum");
  const w = selected.book, printedRevision = w.printed_revision!;
  // Marks of pages of no day (extra practice) are held: no day's sample has them, and no proof reads them yet.
  const off = undated.get(w.id)!;
  const items = selected.items.filter(m => !off.pageIds.has(m.page_id)), itemIds = new Set(items.map(m => m.id));
  const changes = selected.changes.filter(c => itemIds.has(c.item_id));
  const events = selected.events.filter(e => e.workbook_page === null || !off.numbers.has(e.workbook_page));
  const corrections = readBook1Corrections({ sources: f.corrections, baselineId: baseline.id, parentId: request.parentId, childId: request.childId,
    workbookId: w.id, printedRevision, cutoff: request.cutoff, selection: s, items: selected.items, changes: selected.changes, events: selected.events,
    undatedPages: off.pageIds });
  if (!corrections.ok) return refuse(corrections.reason);
  const sources = [...base.sources, { reference: `workbook_book1_baselines:${baseline.id}`, hash: f.baseline.hash, version: 1 },
    { reference: corrections.corrections.reference, hash: sourceHash(corrections.corrections.rows), version: 1 }];
  // #628: with no marked scan of the book, hold book 2. Never advance or repeat by plan.
  if (!items.length) {
    return structuredClone({ ok: false, availability: "held", reasons: ["no-marked-scans"], sourceStatus: { catalog: "validated", book1: "held" }, ...common, sources, consumedVersions: [], decision: null, plan: null,
      baseline: { id: baseline.id, hash: f.baseline.hash } } satisfies Book1Held);
  }
  const next = book2Planning(baseline);
  if (!next.ok) return refuse(next.reason);
  const approval = selected.approvals.filter(a => a.action === "workbook-approved").sort((a, b) => a.id - b.id).at(-1)!;
  const manifest = w.print_manifest!;
  const evidence = `workbook_book1_baselines:${baseline.id}:${f.baseline.hash}`;
  const input: WorkbookProgressHistoryInput = {
    version: 1,
    snapshot: { version: 1, id: request.requestId, parentId: request.parentId, childId: request.childId, cutoff: request.cutoff,
      selection: { ...s, approvalReference: `workbook_audit:${approval.id}` }, curriculum: { key: manifest.curriculum.key as CurriculumKey, version: manifest.curriculum.version },
      // The proved starting mastery: Book 1's own (empty) passed map. A printed step proves no earlier step.
      priorMastery: { passedSteps: baseline.planning.input.passed[s.skill] ?? 0, evidenceReference: evidence },
      scope: base.scope, reviews: [], missedReviews: [] },
    curriculum: { key: baseline.curriculum.key as CurriculumKey, version: baseline.curriculum.version, skill: skill.skill, steps: skill.steps },
    books: [{ workbookId: w.id, printedRevision, manifest, pages: pages.get(w.id)! }],
    sample: base.requiredSample,
    proof: { frozenPackages: `workbook-preview-sources:${sourceHash(base.sources)}`, priorMastery: evidence,
      // The complete issued list before book 2 is Book 1's first issue, which is no advance or repeat decision.
      issuedHistory: `book1-initial-issues:${baseline.id}`, issuedDecisions: [],
      corrections: corrections.corrections, causes: "unavailable" },
    selection: request.scope === "day7" ? { kind: "day7", currentWorkbookId: w.id } : { kind: request.scope, reference: `workbook-preview:${request.requestId}` },
  };
  const fence: HistoryFence = { parentId: request.parentId, childId: request.childId, markingRevision: frozen.markingRevision,
    books: [{ workbookId: w.id, printedRevision, manifest, counts: { items: items.length, changes: changes.length, events: events.length } }] };
  const store: WorkbookProgressHistoryStore = {
    fence: async () => structuredClone(fence),
    items: async (_i, _b, after, limit) => page(items, after, limit),
    changes: async (_i, _b, after, limit) => page(changes, after, limit),
    events: async (_i, _b, after, limit) => page(events, after, limit),
  };
  const { progress: _none, ...planning } = next.input;
  void _none;
  // The public composition (previewNextWorkbookPlanFromHistory), keeping the preview's own refusal reason.
  const retained = await readWorkbookProgressHistory(store, input);
  if (!retained.ok) return refuse(`history-${retained.reason}`);
  if (retained.proof.corrections === "unavailable") return refuse("history-corrections-unavailable");
  const preview = previewNextWorkbookPlan({ version: 1, snapshot: retained.snapshot, curriculum: input.curriculum, history: retained.history, planning });
  if (!preview.ok) return refuse(`preview-${preview.reason}`);
  const result = { retained }, p = preview;
  return JSON.parse(JSON.stringify({ ok: true, availability: "complete",
    sourceStatus: { catalog: "validated", retainedHistory: "derived", priorMastery: "book1-baseline", planning: "book1-baseline",
      issuedDecisions: "book1-initial-issues", corrections: "second-try-ledger", causes: "unavailable" },
    ...common, sources,
    baseline: { id: baseline.id, hash: f.baseline.hash, draftRevision: baseline.draftRevision, printedRevision, boundaryAt: corrections.boundaryAt, planningKind: baseline.planning.kind },
    consumedVersions: p.decision.consumed, decision: p.decision, planningInput: p.planningInput, plan: p.plan,
    held: { originals: result.retained.held.map(h => ({ reason: h.reason, key: keyOf(h.original.first.observation.identity) })),
      changes: result.retained.heldChanges.length, secondTries: corrections.held, undatedMarks: selected.items.length - items.length },
  } satisfies Book1Complete));
}
