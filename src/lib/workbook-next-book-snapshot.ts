// Pure snapshot planning. A caller must capture the source rows atomically before calling this function.
import "server-only";
import { isDeepStrictEqual } from "node:util";
import { book1BindingProblem, book2Planning, readBook1Baseline } from "./workbook-book1-baseline";
import { ledgerTime, readBook1Corrections } from "./workbook-correction-journal";
import { expectedItems, type ItemIdentity } from "./scan-observation";
import { sourceHash } from "./workbook-progress-hash";
import { readFrozenWorkbookProgressHistory, readFrozenWorkbookReviewHistory, type FrozenHistoryRows, type HistoryMarkRow, type WorkbookProgressHistoryInput } from "./workbook-progress-history";
import { validateCatalog, type FrozenWorkbookSourcesV2, type WorkbookPreviewRequest } from "./workbook-progress-source";
import { previewMultipleWorkbookSkills, type WorkbookPlanPreviewInput } from "./workbook-progress-plan";
import { reviewInputsFromMarks, sourceReviewDay, type PrintedReviewEvidence, type PrintedReviewQuestion, type ReviewHeld } from "./workbook-review-from-marks";
import type { CurriculumKey } from "./workbook-curriculum/types";
import type { RunFrame } from "./workbook-job";
import { planWorkbook, type PlanInput, type SpacedReview, type StepRef, type WorkbookPlan } from "./workbook-plan";
import type { TeachingContext } from "./workbook-print-contract";

export interface NextBookSnapshot {
  id: string;
  workbookId: string;
  cutoff: number;
  scope: "day7" | "later-book" | "backstop";
  /** Complete skill IDs in the captured book, from the snapshot admission. */
  issuedSkills: readonly string[];
}
export type ConsumedItem = { key: string; firstVersion: number; effectiveVersion: number; correctionIds?: string[] };
export type HeldItem = { key: string | null; reason: string; skill?: string; step?: number; version?: number };
export type NextBookSnapshotResult = { ok: false; reason: string } | {
  ok: true; planHash: string; planningInput: PlanInput; plan: WorkbookPlan; consumed: ConsumedItem[]; held: HeldItem[];
};
const identityKey = (i: ItemIdentity) => JSON.stringify([i.workbookId, i.printedRevision, i.pageId, i.itemId]);
const stepKey = (s: Pick<StepRef, "skill" | "step">) => JSON.stringify([s.skill, s.step]);
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const compareValue = (a: unknown, b: unknown) => compareText(JSON.stringify(a), JSON.stringify(b));

/**
 * The complete list of skills a snapshot must name in `issuedSkills`: every skill the printed Book 1 issued, from its
 * Book 1 starting record (the same list planNextBookFromSnapshot checks). Null when the starting record is missing or
 * invalid. Call it at snapshot admission and store the result.
 */
export function nextBookIssuedSkills(sources: FrozenWorkbookSourcesV2): string[] | null {
  const f = sources.book1;
  if (!f || f.version !== 1) return null;
  const baseline = readBook1Baseline(f.baseline);
  if (!baseline || baseline.id !== f.baseline.id || baseline.parentId !== sources.parentId || baseline.childId !== sources.childId) return null;
  return [...new Set(baseline.initialIssues.map(i => i.selection.skill))].sort();
}

/** Plan Book 2 from one complete frozen capture. No current profile, store, clock or provider is read. */
export function planNextBookFromSnapshot(input: { sources: FrozenWorkbookSourcesV2; snapshot: NextBookSnapshot }): NextBookSnapshotResult {
  const refuse = (reason: string): NextBookSnapshotResult => ({ ok: false, reason });
  try {
    const { sources, snapshot } = structuredClone(input);
    const f = sources.book1;
    if (!f || f.version !== 1) return refuse("The Book 1 starting record is unavailable.");
    const baseline = readBook1Baseline(f.baseline);
    if (!baseline || baseline.id !== f.baseline.id || baseline.parentId !== sources.parentId || baseline.childId !== sources.childId)
      return refuse("The Book 1 starting record is invalid.");
    const book = sources.books.find(b => b.book.id === snapshot.workbookId);
    if (!book || sources.books.length !== 1 || book1BindingProblem(baseline, book)) return refuse("The printed Book 1 does not match its starting record.");
    // Frozen database rows have no inherent order. Normalize the private copy before deriving evidence or planning.
    book.pages.sort((a, b) => a.page_number - b.page_number || compareText(a.id, b.id));
    book.questions.sort((a, b) => compareText(a.page_id, b.page_id) || a.question_number - b.question_number || compareText(a.id, b.id));
    book.items.sort((a, b) => compareText(a.id, b.id));
    book.changes.sort((a, b) => a.id - b.id);
    book.events.sort((a, b) => compareText(a.id, b.id));
    const skills = nextBookIssuedSkills(sources) ?? [];
    if (!Array.isArray(snapshot.issuedSkills) || new Set(snapshot.issuedSkills).size !== snapshot.issuedSkills.length
      || !isDeepStrictEqual([...snapshot.issuedSkills].sort(), skills)) return refuse("A printed skill is missing from the snapshot.");
    const next = book2Planning(baseline, { prepareOnly: true });
    if (!next.ok) return refuse("The Book 1 starting plan is unavailable.");
    const frame = book.frames.find(x => x.run_id === baseline.runId)?.frame as unknown as RunFrame;
    if (!frame?.plan?.days || frame.plan.level !== next.input.level.number) return refuse("The printed plan is unavailable.");
    const printedRevision = book.book.printed_revision!;
    const approval = book.approvals.filter(a => a.action === "workbook-approved").sort((a, b) => a.id - b.id).at(-1);
    if (!approval || !book.book.print_manifest) return refuse("The printed approval is unavailable.");
    const manifest = book.book.print_manifest;
    const evidence = `workbook_book1_baselines:${baseline.id}:${f.baseline.hash}`;
    const request = (selection: StepRef): WorkbookPreviewRequest => ({ version: 1, requestId: snapshot.id, parentId: sources.parentId,
      childId: sources.childId, workbookId: snapshot.workbookId, printedRevision, selection, cutoff: snapshot.cutoff, scope: snapshot.scope });
    const taught = new Map<string, StepRef[]>();
    for (const q of book.questions) {
      const t = q.teaching as TeachingContext | null, step = t?.plannedStep;
      if (step && baseline.curriculum.skills.some(s => s.skill.id === step.skill && s.skill.level === `U${next.input.level.number}` && s.skill.delivery === "new-step")) {
        const list = taught.get(step.skill) ?? [];
        if (!list.some(x => x.unit === step.unit && x.step === step.step)) list.push(step);
        taught.set(step.skill, list);
      }
    }
    const held: HeldItem[] = [], used = new Map<string, ConsumedItem>();
    const heldCorrections = new Map<string, HeldItem>();
    const recordUsed = (item: ConsumedItem) => {
      const prior = used.get(item.key);
      if (prior && (prior.firstVersion !== item.firstVersion || prior.effectiveVersion !== item.effectiveVersion)) throw Error("Conflicting mark versions.");
      used.set(item.key, item);
    };
    type Loaded = { input: WorkbookProgressHistoryInput; retained: Extract<ReturnType<typeof readFrozenWorkbookProgressHistory>, { ok: true }> };
    function load(selection: StepRef, reviewOnly: boolean): Loaded {
      const skill = baseline!.curriculum.skills.find(s => s.skill.id === selection.skill && s.skill.unit === selection.unit);
      if (!skill) throw Error("A printed skill has no curriculum record.");
      const validated = validateCatalog(request(selection), sources);
      const pages = validated.pages.get(book!.book.id)!;
      const off = validated.undated.get(book!.book.id)!;
      const days = new Set(validated.outcome.scope.find(x => x.workbookId === book!.book.id)?.days ?? []);
      const scopedPages = new Set(pages.filter(p => days.has(p.day)).map(p => p.pageId));
      const scopedNumbers = new Set(pages.filter(p => days.has(p.day)).map(p => p.number));
      const firstAt = (m: HistoryMarkRow) => {
        const first = book!.changes.filter(c => c.item_id === m.id).sort((a, b) => a.to_version - b.to_version)[0];
        return ledgerTime(first ? (first.previous as unknown as { evidence_at: string }).evidence_at : m.evidence_at);
      };
      // A first mark after cutoff cannot establish earlier state. Keep it outside the history and hold it below.
      const items = book!.items.filter(m => scopedPages.has(m.page_id) && firstAt(m) <= snapshot.cutoff);
      const ids = new Set(items.map(m => m.id));
      const changes = book!.changes.filter(c => ids.has(c.item_id));
      const events = book!.events.filter(e => e.workbook_page !== null && scopedNumbers.has(e.workbook_page));
      const corrections = readBook1Corrections({ sources: f!.corrections, baselineId: baseline!.id, parentId: sources.parentId, childId: sources.childId,
        workbookId: book!.book.id, printedRevision, cutoff: snapshot.cutoff, selection, items: book!.items, changes: book!.changes, events: book!.events, undatedPages: off.pageIds });
      if (!corrections.ok) throw Error("The correction history is incomplete.");
      for (const c of corrections.held) if (c.reason !== "other-step") {
        heldCorrections.set(c.id, { key: `second-try:${c.id}`, reason: c.reason });
      }
      const included = new Set(items.map(m => identityKey((m.observation as unknown as { identity: ItemIdentity }).identity)));
      const correctionProof = { ...corrections.corrections, rows: corrections.corrections.rows.filter(r => included.has(identityKey(r.identity))) };
      const sample = reviewOnly ? pages.filter(p => validated.outcome.scope.find(x => x.workbookId === p.workbookId)?.days.includes(p.day))
        .flatMap(p => expectedItems(p).filter(e => e.teaching?.itemStep?.skill === selection.skill && e.teaching.itemStep.step === selection.step).map(e => e.identity))
        : validated.outcome.requiredSample;
      const historyInput: WorkbookProgressHistoryInput = { version: 1,
        snapshot: { version: 1, id: snapshot.id, parentId: sources.parentId, childId: sources.childId, cutoff: snapshot.cutoff,
          selection: { ...selection, approvalReference: `workbook_audit:${approval!.id}` }, curriculum: { key: manifest.curriculum.key as CurriculumKey, version: manifest.curriculum.version },
          priorMastery: { passedSteps: baseline!.planning.input.passed[selection.skill] ?? 0, evidenceReference: evidence },
          scope: validated.outcome.scope, reviews: [], missedReviews: [] },
        curriculum: { key: baseline!.curriculum.key as CurriculumKey, version: baseline!.curriculum.version, skill: skill.skill, steps: skill.steps },
        books: [{ workbookId: book!.book.id, printedRevision, manifest, pages }], sample,
        proof: { frozenPackages: `workbook-preview-sources:${sourceHash(validated.outcome.sources)}`, priorMastery: evidence,
          issuedHistory: `book1-initial-issues:${baseline!.id}`, issuedDecisions: [], corrections: correctionProof, causes: "unavailable" },
        selection: snapshot.scope === "day7" ? { kind: "day7", currentWorkbookId: book!.book.id } : { kind: snapshot.scope, reference: `snapshot:${snapshot.id}` } };
      const rows: FrozenHistoryRows = { fence: { parentId: sources.parentId, childId: sources.childId, markingRevision: sources.markingRevision,
        books: [{ workbookId: book!.book.id, printedRevision, manifest, counts: { items: items.length, changes: changes.length, events: events.length } }] },
        books: [{ workbookId: book!.book.id, items, changes, events }] };
      const retained = reviewOnly ? readFrozenWorkbookReviewHistory(historyInput, rows) : readFrozenWorkbookProgressHistory(historyInput, rows);
      if (!retained.ok) throw Error(`The printed evidence is unavailable: ${retained.reason}.`);
      return { input: historyInput, retained };
    }
    const allIssues = baseline.initialIssues.map(i => i.selection).sort(compareValue);
    const initial = allIssues[0];
    if (!initial) return refuse("The printed book has no issued skills.");
    const catalog = validateCatalog(request(initial), sources);
    const allPages = catalog.pages.get(book.book.id)!;
    const inScope = new Set(catalog.outcome.scope.find(s => s.workbookId === book.book.id)?.days ?? []);
    const hasMarkedScan = book.items.some(m => {
      const page = allPages.find(p => p.pageId === m.page_id);
      if (!page || !inScope.has(page.day)) return false;
      const chain = book.changes.filter(c => c.item_id === m.id).sort((a, b) => a.to_version - b.to_version);
      const first = chain.length ? chain[0].previous as unknown as HistoryMarkRow : m;
      if (ledgerTime(first.evidence_at) > snapshot.cutoff) return false;
      const changes = chain.filter(c => ledgerTime(c.changed_at) <= snapshot.cutoff);
      const observation = (changes.at(-1)?.current ?? first.observation) as unknown as { state: string; result: string | null };
      return (observation.state === "scored" || observation.state === "parent-checked") && observation.result !== null;
    });
    if (!hasMarkedScan) return refuse("The selected days have no marked scans.");
    const samples = allPages.flatMap(page => expectedItems(page).map(expected => ({ page, expected })));
    const reviewGroups: PrintedReviewEvidence[] = [];
    const heldReviews: ReviewHeld[] = [];
    const reviewInputs = new Map<string, { selection: StepRef; loaded: Loaded }>();
    for (const selection of allIssues.filter(s => !taught.has(s.skill))) {
      const k = stepKey(selection);
      if (!reviewInputs.has(k)) reviewInputs.set(k, { selection, loaded: load(selection, true) });
    }
    function questionsFor(selection: StepRef): PrintedReviewQuestion[] {
      const entry = reviewInputs.get(stepKey(selection));
      if (!entry) return [];
      const originals = new Map(entry.loaded.retained.history.originals.map(o => [identityKey(o.first.observation.identity), o]));
      return samples.filter(({ page, expected }) => inScope.has(page.day)
        && expected.teaching?.itemStep?.skill === selection.skill && expected.teaching.itemStep.step === selection.step)
        .map(({ page, expected }) => {
          const key = identityKey(expected.identity), original = originals.get(key);
          if (!expected.teaching) throw Error("A printed review has no teaching record.");
          return { identity: expected.identity, teaching: expected.teaching,
            question: { source: "workbook" as const, workbookId: page.workbookId, page: page.number, question: expected.number },
            mark: original ? { firstVersion: original.first.observation.resultVersion, observation: (original.changes.at(-1) ?? original.first).observation,
              event: original.first.provenance.eventId } : null };
        });
    }
    // Bind scheduled intervals to printed pages. A missing scheduled slot remains held.
    const scheduled = new Map<string, { review: SpacedReview; reviewDay: number; missingPrinted: boolean }>();
    for (const day of frame.plan.days) {
      if (!inScope.has(day.day)) continue;
      const pages = book.pages.filter(p => p.print_contract?.day === day.day).sort((a, b) => a.page_number - b.page_number);
      for (const page of day.pages) for (const part of page.parts) for (const review of part.reviews ?? []) {
        const printed = pages[page.number - 1];
        if (!printed || printed.page_type !== page.type) throw Error("The printed review page does not match the saved plan.");
        const matching = book.questions.filter(q => q.page_id === printed.id).some(q => {
          const t = q.teaching as TeachingContext | null;
          return t?.part === part.kind && t.itemStep?.skill === review.skill && t.itemStep.step === review.step;
        });
        const stored: SpacedReview = { ...review, due: sourceReviewDay(day.day) };
        const k = stepKey(review);
        if (reviewInputs.has(k)) {
          if (scheduled.has(k)) throw Error("A printed review has more than one saved interval.");
          scheduled.set(k, { review: stored, reviewDay: sourceReviewDay(day.day), missingPrinted: !matching });
        } else if (!matching) {
          reviewGroups.push({ review: stored, reviewDay: sourceReviewDay(day.day), questions: [] });
        }
      }
    }
    // Score every printed question for each review-only skill and step together.
    for (const [k, { selection }] of reviewInputs) {
      const questions = questionsFor(selection), scheduledReview = scheduled.get(k);
      if (scheduledReview) {
        const reviewDay = questions.length ? sourceReviewDay(Math.max(...questions.map(q => allPages.find(p => p.pageId === q.identity.pageId)!.day))) : scheduledReview.reviewDay;
        reviewGroups.push({ ...scheduledReview, reviewDay, questions });
      } else if (questions.length) {
        const days = questions.map(q => allPages.find(p => p.pageId === q.identity.pageId)!.day);
        reviewGroups.push({ review: null, skill: selection.skill, step: selection.step, reviewDay: sourceReviewDay(Math.max(...days)), questions });
      } else {
        held.push({ key: null, reason: "no review question in selected days", skill: selection.skill, step: selection.step });
      }
    }
    // Reviews already carried beyond Book 1 were not printed in this book. Keep their saved schedule.
    for (const review of frame.plan.reviewsAfter) {
      reviewGroups.push({ review, reviewDay: review.due, questions: [] });
    }
    const reviews = reviewInputsFromMarks(reviewGroups);
    if (!reviews.ok) return refuse("The printed review evidence is inconsistent.");
    heldReviews.push(...reviews.held);
    for (const item of reviews.consumed) recordUsed({ key: identityKey(item.identity), firstVersion: item.firstVersion, effectiveVersion: item.effectiveVersion });
    for (const h of heldReviews) held.push({ key: h.identity ? identityKey(h.identity) : null, reason: h.reason, skill: h.skill, step: h.step });
    const planning: Omit<PlanInput, "progress" | "previewDecisions"> = { ...next.input,
      reviews: [...next.input.reviews, ...reviews.reviews].sort(compareValue), missedReviews: [...next.input.missedReviews, ...reviews.missedReviews].sort(compareValue),
      misses: [...next.input.misses, ...reviews.misses].sort(compareValue) };
    const inputs: WorkbookPlanPreviewInput[] = [];
    for (const [skill, steps] of [...taught].sort(([a], [b]) => compareText(a, b))) {
      const selection = [...steps].sort((a, b) => a.step - b.step)[0];
      if (!skills.includes(skill) || !allIssues.some(s => s.unit === selection.unit && s.skill === skill && s.step === selection.step))
        return refuse("A printed skill has no progress record.");
      const loaded = load(selection, false);
      inputs.push({ version: 1, snapshot: { ...loaded.retained.snapshot, reviews: planning.reviews, missedReviews: planning.missedReviews },
        curriculum: loaded.input.curriculum, history: loaded.retained.history, planning });
    }
    let planningInput: PlanInput, plan: WorkbookPlan;
    let decisions: import("./workbook-progress").WorkbookProgressDecision[] = [];
    if (inputs.length) {
      const result = previewMultipleWorkbookSkills(inputs);
      if (!result.ok) return refuse(`The next plan is unavailable: ${result.reason}.`);
      planningInput = result.planningInput; plan = result.plan;
      decisions = result.version === 1 ? [result.decision] : result.decisions;
    } else {
      const result = planWorkbook(planning);
      if (!result.ok) return refuse("The next plan is unavailable.");
      planningInput = planning; plan = result.plan;
    }
    const usedCorrections = new Set<string>();
    for (const d of decisions) {
      const pending = new Map(d.items.filter(i => i.status === "pending" && i.first).map(i => [i.key, i]));
      for (const item of d.consumed) {
        if (pending.has(item.key)) held.push({ key: item.key, version: item.effectiveVersion, reason: "not marked" });
        else recordUsed(item);
      }
      for (const item of d.items) if (item.secondTries.length && used.has(item.key)) {
        const ids = item.secondTries.map(t => t.id).sort();
        ids.forEach(id => usedCorrections.add(id));
        used.set(item.key, { ...used.get(item.key)!, correctionIds: ids });
      }
    }
    // Every stored mark not used by the plan remains available for a later snapshot.
    const off = catalog.undated.get(book.book.id)!;
    for (const m of book.items) {
      const k = identityKey((m.observation as unknown as { identity: ItemIdentity }).identity);
      if (used.has(k)) continue;
      const page = allPages.find(p => p.pageId === m.page_id);
      const first = book.changes.filter(c => c.item_id === m.id).sort((a, b) => a.to_version - b.to_version)[0];
      const firstAt = ledgerTime(first ? (first.previous as unknown as { evidence_at: string }).evidence_at : m.evidence_at);
      if (held.some(h => h.key === k) && firstAt <= snapshot.cutoff) continue;
      held.push({ key: k, version: m.result_version, reason: off.pageIds.has(m.page_id) ? "extra practice" : page && !inScope.has(page.day) ? "outside selected days" : firstAt > snapshot.cutoff ? "after cutoff" : "not used in this plan" });
    }
    for (const c of book.changes) if (ledgerTime(c.changed_at) > snapshot.cutoff) {
      const item = book.items.find(m => m.id === c.item_id);
      if (!item) throw Error("A held mark change has no printed item.");
      const k = identityKey((item.observation as unknown as { identity: ItemIdentity }).identity);
      held.push({ key: `${k}:version:${c.to_version}`, reason: "changed after the snapshot", version: c.to_version });
    }
    for (const row of f.corrections.rows) if (!usedCorrections.has(row.id) && !heldCorrections.has(row.id)) {
      heldCorrections.set(row.id, { key: `second-try:${row.id}`, reason: "not used in this plan" });
    }
    held.push(...heldCorrections.values());
    const consumed = [...used.values()].sort((a, b) => a.key.localeCompare(b.key));
    held.sort(compareValue);
    const planHash = sourceHash(JSON.parse(JSON.stringify({ planningInput, plan })));
    return { ok: true, planHash, planningInput, plan, consumed, held };
  } catch (error) {
    return refuse(error instanceof Error && error.message !== "invalid-source" ? error.message : "The frozen book evidence is invalid.");
  }
}
