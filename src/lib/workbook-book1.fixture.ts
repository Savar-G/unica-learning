// Synthetic Book 1 for #472: a real first book from the job with the fake AI, the fake print engine and the real
// templates; its final revision, baseline, approved and shipped rows, marks, learning events and second tries. No family,
// provider, image, Storage or credential is read.
import { expect } from "vitest";
import { fakeAiClient } from "./ai-client-fake";
import { fakePrintEngine } from "./print-engine-fake";
import { checkQuestionPackage, QUESTION_PACKAGE_VERSION, type QuestionPackage } from "./question-package";
import { expectedItems, firstObservation, type ExpectedItem, type Observation } from "./scan-observation";
import type { Json } from "./database";
import { fakeWorkbookItems } from "./workbook-ai-fake";
import { createBook1Baseline, proveBook1PlanningCapture, type Book1Baseline, type Book1BaselineRecord } from "./workbook-book1-baseline";
import { SECOND_TRY_ENGINE, type SecondTryRow } from "./workbook-correction-journal";
import { memoryDraftStore } from "./workbook-draft-memory";
import { renderableDraft } from "./workbook-fit";
import type { FitCheck, GeneratedWorkbook } from "./workbook-generator";
import { memoryRunStore } from "./workbook-job-memory";
import { runWorkbookJob, startWorkbookRun, type DraftRendering, type RunFrame, type WorkbookJobDeps } from "./workbook-job";
import { renderedPages, renderWorkbook, type WorkbookTemplate } from "./workbook-render";
import { approvedWorkbook, type DraftForApproval } from "./workbook-ship";
import { keySolver } from "./workbook-solve-check";
import { teachingFrame } from "./workbook-teaching-frame";
import { workbookTemplate } from "./workbook-template";
import type { WorkbookInput } from "./workbook-content";
import type { HistoryChangeRow, HistoryEventRow, HistoryMarkRow } from "./workbook-progress-history";
import type { FrozenSourceBook, FrozenWorkbookSourcesV2, WorkbookPreviewRequest } from "./workbook-progress-source";

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const PARENT = id(0xf1), CHILD = id(0xc1), ACTOR = id(0xad), BASELINE = id(0xb1);
const ADMIN = { id: ACTOR, email: "admin@example.com" };
const NOW = "2026-11-04T18:00:00.000Z";
export const BOUNDARY = "2026-11-08T00:00:00.000Z", DELIVERED = "2026-11-10T00:00:00.000Z", MARKED = "2026-11-12T00:00:00.000Z";
export const CUTOFF = Date.parse("2026-11-17T00:00:00.000Z");
const json = (v: unknown): Json => JSON.parse(JSON.stringify(v));
const template: WorkbookTemplate = { ...workbookTemplate(), fit: undefined };
const fits: FitCheck = { fits: async () => ({ ok: true }) };

/** A first book made by the real job, with the planning capture its frame stores. */
export async function jobBook() {
  let clock = new Date(NOW), ids = 0, tokens = 0;
  const newId = () => id(++ids);
  const drafts = memoryDraftStore({ [CHILD]: PARENT });
  const runs = memoryRunStore({ children: { [CHILD]: PARENT }, now: () => clock, newId, drafts });
  const deps: WorkbookJobDeps = {
    itemPolicy: "approved-v1", runs, drafts, files: (await import("./workbook-store-memory")).memoryWorkbookFiles(),
    ai: fakeAiClient({ answer: r => { clock = new Date(clock.getTime() + 1000); return fakeWorkbookItems(r); } }),
    template, fit: () => fits, engine: fakePrintEngine(), solver: keySolver(),
    source: { inputs: async c => (c === CHILD ? { parentId: PARENT, name: "Leah", grade: 1, province: "BC", profile: null, workbooks: [] } : null),
      prepareProfile: async () => ({ ok: true, profile: null }) },
    newId, qrToken: () => `token-${String(++tokens).padStart(12, "0")}`, fileKey: () => `k${ids}`, now: () => clock.getTime(), concurrency: 4, budgetMs: 1e9,
  };
  const start = await startWorkbookRun(runs, CHILD, ADMIN);
  if (start.status !== "started") throw Error(start.status);
  expect(await runWorkbookJob(start.runId, deps)).toBe("done");
  const run = (await runs.run(start.runId))!;
  const draft = (await drafts.draft(run.draftId!))!;
  const frame = (await runs.frame(start.runId))! as RunFrame;
  // Every question passes, as an approvable final revision does (the fake's chance failures are not under test here).
  const sound: GeneratedWorkbook = structuredClone(draft);
  const storable = (p: QuestionPackage) => ["checked", "not-checked"].includes(checkQuestionPackage(p).status);
  for (const p of sound.pages) {
    p.fit = p.fit.status === "failed" ? { status: "fits" } : p.fit;
    const good = p.questions.find(q => q.package && storable(q.package));
    for (const q of p.questions) {
      if (q.check.status === "failed") q.check = { status: "checked" };
      if (!q.package || !storable(q.package)) q.package = { ...structuredClone(good!.package!), id: `${good!.package!.id}:${q.number}`, ref: { source: "workbook", workbookId: sound.id, page: p.number, question: q.number } };
    }
  }
  const result = await renderWorkbook({ draft: renderableDraft(sound), parentId: PARENT, template, engine: fakePrintEngine(), fileKey: "final" });
  if (result.status !== "rendered") throw Error("render");
  const rendering: DraftRendering = { pdfPath: result.workbook.pdfPath, pdfSha256: result.workbook.pdfSha256, pages: renderedPages(result) };
  const final: DraftForApproval = { runId: start.runId, runDone: true, draftId: draft.id, revision: 2, oldFormat: false, draft: sound, rendering, renderProblems: [], frame: teachingFrame(frame) };
  return { runId: start.runId, frame, final };
}

export function baselineOf(b: Awaited<ReturnType<typeof jobBook>>): { baseline: Book1Baseline; record: Book1BaselineRecord } {
  const proof = proveBook1PlanningCapture(b.frame, `workbook_run_frames:${b.runId}`);
  if (!proof.ok) throw Error(proof.reason);
  const made = createBook1Baseline({ id: BASELINE, parentId: PARENT, childId: CHILD, final: b.final, frame: b.frame, planning: proof.proof });
  if (!made.ok) throw Error(made.reason);
  return made;
}

/** The approved book as the shipped rows the source store reads. */
export function shippedBook(w: WorkbookInput, runId: string, frame: RunFrame, revision = 2): FrozenSourceBook {
  const pageId = (n: number) => id(10_000 + n);
  return {
    book: { id: w.id, parent_id: PARENT, child_id: CHILD, number: w.number, status: "shipped", printed_revision: w.printedRevision!, print_manifest: json(w.printManifest) as never, profile_build: w.profileBuild },
    delivery: { auditId: 7, deliveredAt: DELIVERED },
    pages: w.pages.map(p => ({ id: pageId(p.number), parent_id: PARENT, workbook_id: w.id, page_number: p.number, day_label: p.dayLabel, page_type: p.type,
      print_contract: json(p.printContract) as never, image_width: p.image?.width ?? null, image_height: p.image?.height ?? null })),
    questions: w.pages.flatMap(p => p.questions.map(q => ({ id: id(20_000 + p.number * 100 + q.number), parent_id: PARENT, workbook_id: w.id, page_id: pageId(p.number),
      question_number: q.number, schema_version: QUESTION_PACKAGE_VERSION, package: json(q.package), teaching: json(q.teaching) as never, regions: json(q.regions ?? null) as never,
      box_x: q.box.x, box_y: q.box.y, box_width: q.box.width, box_height: q.box.height }))),
    items: [], changes: [], events: [],
    approvals: [{ id: 41, parent_id: PARENT, child_id: CHILD, workbook_id: w.id, run_id: runId, action: "workbook-approved", at: "2026-11-08T01:00:00.000Z",
      detail: { revision, number: 1, printedRevision: w.printedRevision! } }],
    frames: [{ run_id: runId, parent_id: PARENT, child_id: CHILD, created_at: "2026-11-04T18:00:00.000Z", frame: json(frame) as never }],
  };
}

/** Every printed item, with its day, from the shipped rows. */
export function printedItems(b: FrozenSourceBook): (ExpectedItem & { day: number; page: number })[] {
  return b.pages.flatMap(p => {
    const day = (p.print_contract as unknown as { day: number | null }).day;
    const questions = b.questions.filter(q => q.page_id === p.id).map(q => ({ number: q.question_number, package: q.package as unknown as QuestionPackage, teaching: q.teaching }));
    if (!questions.length || day === null) return [];
    return expectedItems({ workbookId: b.book.id, printedRevision: b.book.printed_revision!, pageId: p.id, questions }).map(e => ({ ...e, day, page: p.page_number }));
  });
}

/** Adds a scored mark and its learning event for an item. */
export function mark(b: FrozenSourceBook, e: ExpectedItem & { page: number }, result: "right" | "wrong" | "blank", at = MARKED) {
  const n = b.items.length, reading = result === "right" ? "13" : result === "wrong" ? "56" : "";
  const q = b.questions.find(x => x.page_id === e.identity.pageId && x.question_number === e.number)!;
  const pkg = q.package as unknown as QuestionPackage;
  const observation: Observation = { ...firstObservation(e, id(30_000 + n)), state: "scored", result, certainty: "certain", help: "none",
    readAnswerText: reading, regions: e.scoredRegions.map(regionId => ({ regionId, text: reading, value: reading, certainty: "certain" as const })), resultVersion: 2 };
  const event: HistoryEventRow = { id: id(40_000 + n), idempotency_key: `marking:${n}`, parent_id: PARENT, child_id: CHILD, source: "marking", question_source: "workbook",
    workbook_id: b.book.id, workbook_page: e.page, workbook_question: e.number, occurred_at: at, result, hints: 0, evidence_kind: "scan", evidence_id: id(30_000 + n),
    skill_standard: pkg.skill.standard, skills: pkg.skill.skills };
  b.events.push(event);
  const row: HistoryMarkRow = { id: id(50_000 + n), parent_id: PARENT, child_id: CHILD, workbook_id: b.book.id, printed_revision: b.book.printed_revision!,
    page_id: e.identity.pageId, item_id: e.identity.itemId, expected: json({ identity: e.identity, number: e.number, method: e.method, ...(e.twoWays ? { twoWays: true } : {}),
      scoredRegions: e.scoredRegions, mastery: e.mastery, teaching: e.teaching }), observation: json(observation), result_version: 2, evidence_at: at, event_id: event.id,
    original_event: json({ key: event.idempotency_key, parentId: PARENT, childId: CHILD, source: "marking", question: { source: "workbook", workbookId: b.book.id, page: e.page, question: e.number },
      skill: pkg.skill, result, occurredAt: at }), model: "synthetic-reader", prompt: "synthetic-prompt" };
  b.items.push(row);
  return row;
}

/** A parent's "Change this mark": an original adjudication, journaled in scan_mark_changes. */
export function parentChange(b: FrozenSourceBook, row: HistoryMarkRow, result: "right" | "wrong" | "blank", at: string) {
  const previous = structuredClone(row), o = row.observation as unknown as Observation;
  const next: Observation = { ...o, state: "parent-checked", method: "parent", actor: "parent", result, resultVersion: row.result_version + 1 };
  const change: HistoryChangeRow = { id: b.changes.length + 1, parent_id: PARENT, child_id: CHILD, item_id: row.id, from_version: row.result_version,
    to_version: row.result_version + 1, actor: "parent", changed_at: at, previous: json(previous), current: json(next) };
  b.changes.push(change);
  row.observation = json(next); row.result_version++; row.evidence_at = at;
}

/** A child's written second try, as the ledger seam records it. */
export function secondTry(rows: SecondTryRow[], b: FrozenSourceBook, row: HistoryMarkRow, result: SecondTryRow["result"], at: string, version = row.result_version): SecondTryRow {
  const t: SecondTryRow = { id: id(60_000 + rows.length), baseline_id: BASELINE, parent_id: PARENT, child_id: CHILD, workbook_id: b.book.id, printed_revision: b.book.printed_revision!,
    item_row_id: row.id, page_id: row.page_id, item_id: row.item_id, based_on_version: version, source: "child-written-answer", result, help: "none",
    evidence_reference: `scan-photo:${rows.length}`, engine: SECOND_TRY_ENGINE, recorded_at: at };
  rows.push(t);
  return t;
}

export function frozenOf(book: FrozenSourceBook, record: Book1BaselineRecord, tries: SecondTryRow[] = []): FrozenWorkbookSourcesV2 {
  return { version: 2, parentId: PARENT, childId: CHILD, markingRevision: 3, books: [book], profileReferences: [], assessmentReferences: [],
    book1: { version: 1, baseline: { id: BASELINE, ...record }, corrections: { baselineId: BASELINE, boundaryAt: BOUNDARY,
      initialActivity: { items: 0, changes: 0, events: 0, receipts: 0, secondTries: 0 }, count: tries.length, rows: tries } } };
}
export function requestOf(book: FrozenSourceBook, selection: { unit: string; skill: string; step: number }, scope: WorkbookPreviewRequest["scope"] = "day7", cutoff = CUTOFF): WorkbookPreviewRequest {
  return { version: 1, requestId: id(0x901), parentId: PARENT, childId: CHILD, workbookId: book.book.id, printedRevision: book.book.printed_revision!, selection, cutoff, scope };
}
export { approvedWorkbook };
