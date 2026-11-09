// The Book 1 capture the next-book snapshot freezes (#476), for the real planner (planNextBookFromSnapshot, #796).
//
// The planner reads every skill and step the printed Book 1 issued, and the marks of every one of them: the taught
// steps through the progress decision, and the review-only steps through their printed questions. So the ledger it may
// consume is every mark on the days in scope, of every skill, at its version at the cutoff. This capture builds that
// ledger through the same history reader the planner uses (readFrozenWorkbookReviewHistory), with a sample of every
// printed item on those days. It picks no skill: there is no single-step selection any more.
//
// It does not run the book 2 starting plan (book2Planning): a Book 1 record the planner later refuses (for example
// curriculum-version-changed) still freezes, and the planner's refusal is kept as the chain's answer until it plans.
//
// Pure TypeScript: no network, database, clock or randomness.
import "server-only";
import { book1BindingProblem, readBook1Baseline } from "./workbook-book1-baseline";
import { expectedItems, type ItemIdentity } from "./scan-observation";
import type { CurriculumKey } from "./workbook-curriculum/types";
import type { HistoryFence, FrozenHistoryRows, WorkbookProgressHistoryInput } from "./workbook-progress-history";
import { readFrozenWorkbookReviewHistory } from "./workbook-progress-history";
import { sourceHash } from "./workbook-progress-hash";
import { validateCatalog, type FrozenWorkbookSourcesV2, type WorkbookPreviewRequest } from "./workbook-progress-source";
import type { CaptureAnswer, CaptureRequest } from "./next-book-snapshot";

const compare = (a: unknown, b: unknown) => { const x = JSON.stringify(a), y = JSON.stringify(b); return x < y ? -1 : x > y ? 1 : 0; };

/**
 * The source store reads the family's books whatever step a request names (src/lib/workbook-progress-source-store.ts reads
 * no selection), but a preview request must name one. The capture reads with this placeholder, then anchors the catalog
 * on the first issued step, as the planner does.
 */
export const SOURCES_SELECTION: WorkbookPreviewRequest["selection"] = { unit: "next-book", skill: "next-book-sources", step: 1 };

/** The preview request the source store is read with for one capture. */
export function sourcesRequest(r: CaptureRequest): WorkbookPreviewRequest {
  return { version: 1, requestId: r.snapshotId, parentId: r.parentId, childId: r.childId, workbookId: r.workbookId,
    printedRevision: r.printedRevision, selection: SOURCES_SELECTION, cutoff: r.cutoff, scope: r.scope };
}

/** Capture every mark of the printed Book 1 in scope, from one complete frozen read of its sources. */
export function captureNextBookEvidence(r: CaptureRequest, sources: FrozenWorkbookSourcesV2): CaptureAnswer {
  const unavailable = (reason: string): CaptureAnswer => ({ status: "unavailable", reason });
  try {
    const f = sources.book1;
    if (sources.version !== 2 || !f || f.version !== 1) return unavailable("book1-sources-unavailable");
    const baseline = readBook1Baseline(f.baseline);
    if (!baseline || baseline.id !== f.baseline.id) return unavailable("baseline-invalid");
    if (baseline.parentId !== r.parentId || baseline.childId !== r.childId || sources.parentId !== r.parentId || sources.childId !== r.childId) {
      return unavailable("baseline-owner");
    }
    // Book 1 to book 2 only: the selected book is the bound Book 1, and it is the only book so far.
    const book = sources.books.find(b => b.book.id === r.workbookId);
    if (!book || sources.books.length !== 1 || book.book.number !== 1 || book.book.printed_revision !== r.printedRevision) return unavailable("not-book2-scope");
    const binding = book1BindingProblem(baseline, book);
    if (binding) return unavailable(`baseline-binding-${binding}`);
    const initial = baseline.initialIssues.map(i => i.selection).sort(compare)[0];
    const skill = initial && baseline.curriculum.skills.find(s => s.skill.id === initial.skill && s.skill.unit === initial.unit);
    if (!initial || !skill) return unavailable("baseline-invalid");
    const request: WorkbookPreviewRequest = { ...sourcesRequest(r), selection: { unit: initial.unit, skill: initial.skill, step: initial.step } };
    const catalog = validateCatalog(request, sources);
    const pages = catalog.pages.get(book.book.id)!, off = catalog.undated.get(book.book.id)!;
    const scope = catalog.outcome.scope.find(s => s.workbookId === book.book.id);
    if (!scope) return unavailable("scope-unavailable");
    // Marks of pages of no day (extra practice) are held: no sample has them (as captureBook1Progress does).
    const items = book.items.filter(m => !off.pageIds.has(m.page_id)), ids = new Set(items.map(m => m.id));
    // #628: with no marked scan of the book, hold book 2. Never advance or repeat by plan.
    if (!items.length) return { status: "held", reason: "no-marked-scans" };
    const changes = book.changes.filter(c => ids.has(c.item_id));
    const events = book.events.filter(e => e.workbook_page === null || !off.numbers.has(e.workbook_page));
    const approval = book.approvals.filter(a => a.action === "workbook-approved").sort((a, b) => a.id - b.id).at(-1);
    const manifest = book.book.print_manifest;
    if (!approval || !manifest) return unavailable("approval-unavailable");
    const printedRevision = book.book.printed_revision!;
    // The sample: every printed item on the days in scope, of every step. A Day 7 capture has Days 1-7 only.
    const days = new Set(scope.days);
    const sample: ItemIdentity[] = pages.filter(p => days.has(p.day)).flatMap(p => expectedItems(p).map(e => e.identity));
    const evidence = `workbook_book1_baselines:${baseline.id}:${f.baseline.hash}`;
    const input: WorkbookProgressHistoryInput = { version: 1,
      snapshot: { version: 1, id: r.snapshotId, parentId: r.parentId, childId: r.childId, cutoff: r.cutoff,
        selection: { ...initial, approvalReference: `workbook_audit:${approval.id}` },
        curriculum: { key: manifest.curriculum.key as CurriculumKey, version: manifest.curriculum.version },
        priorMastery: { passedSteps: baseline.planning.input.passed[initial.skill] ?? 0, evidenceReference: evidence },
        scope: catalog.outcome.scope, reviews: [], missedReviews: [] },
      curriculum: { key: baseline.curriculum.key as CurriculumKey, version: baseline.curriculum.version, skill: skill.skill, steps: skill.steps },
      books: [{ workbookId: book.book.id, printedRevision, manifest, pages }], sample,
      // The planner reads the second tries itself, from the frozen sources, per step. The ledger does not need them.
      proof: { frozenPackages: `workbook-preview-sources:${sourceHash(catalog.outcome.sources)}`, priorMastery: evidence,
        issuedHistory: `book1-initial-issues:${baseline.id}`, issuedDecisions: [], corrections: "unavailable", causes: "unavailable" },
      selection: r.scope === "day7" ? { kind: "day7", currentWorkbookId: book.book.id } : { kind: r.scope, reference: `snapshot:${r.snapshotId}` } };
    const fence: HistoryFence = { parentId: r.parentId, childId: r.childId, markingRevision: sources.markingRevision,
      books: [{ workbookId: book.book.id, printedRevision, manifest, counts: { items: items.length, changes: changes.length, events: events.length } }] };
    const rows: FrozenHistoryRows = { fence, books: [{ workbookId: book.book.id, items, changes, events }] };
    const retained = readFrozenWorkbookReviewHistory(input, rows);
    if (!retained.ok) return unavailable(`history-${retained.reason}`);
    return { status: "captured", sources, fence, snapshot: retained.snapshot, history: retained.history, held: retained.held };
  } catch (e) {
    return unavailable(e instanceof Error && e.message === "invalid-source" ? "invalid-source" : "source-error");
  }
}
