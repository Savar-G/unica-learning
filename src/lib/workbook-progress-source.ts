import "server-only";
import { canonical, sourceHash } from "./workbook-progress-hash";
export { canonical, sourceHash } from "./workbook-progress-hash";
import { isDeepStrictEqual } from "node:util";
import type { Tables } from "./database";
import { storedContent, isUuid } from "./workbook-content";
import { expectedItems, observationProblem, type ItemIdentity, type Observation, type PageForObservation } from "./scan-observation";
import { isPrintedRevision, manifestProblem, printContractProblem, teachingProblem } from "./workbook-print-contract";
import type { HistoryBook, HistoryMarkRow, HistoryChangeRow, HistoryEventRow } from "./workbook-progress-history";
import type { Book1BaselineRecord } from "./workbook-book1-baseline";
import type { Book1CorrectionSources } from "./workbook-correction-journal";
import { evaluateBook1Preview, type Book1PreviewOutcome } from "./workbook-book1-preview";

export const WORKBOOK_PROGRESS_SOURCE_VERSION = 1;
export const PREVIEW_ENGINE = "workbook-preview-sources/1;progress/1;history/1;plan-preview/1";
export interface WorkbookPreviewRequest {
  version: 1;
  requestId: string;
  parentId: string;
  childId: string;
  workbookId: string;
  printedRevision: string;
  selection: { unit: string; skill: string; step: number };
  cutoff: number;
  scope: "day7" | "later-book" | "backstop";
}
export type SourceBookRow = Pick<Tables<"workbooks">, "id" | "parent_id" | "child_id" | "number" | "status" | "printed_revision" | "print_manifest" | "profile_build">;
export type SourcePageRow = Pick<Tables<"workbook_pages">, "id" | "parent_id" | "workbook_id" | "page_number" | "day_label" | "page_type" | "print_contract" | "image_width" | "image_height">;
export type SourceQuestionRow = Pick<Tables<"workbook_questions">, "id" | "parent_id" | "workbook_id" | "page_id" | "question_number" | "schema_version" | "package" | "teaching" | "regions" | "box_x" | "box_y" | "box_width" | "box_height">;
export interface FrozenSourceBook {
  book: SourceBookRow;
  delivery: { auditId: number; deliveredAt: string };
  pages: SourcePageRow[];
  questions: SourceQuestionRow[];
  items: HistoryMarkRow[];
  changes: HistoryChangeRow[];
  events: HistoryEventRow[];
  approvals: Pick<Tables<"workbook_audit">, "id" | "parent_id" | "child_id" | "workbook_id" | "run_id" | "action" | "at" | "detail">[];
  frames: Pick<Tables<"workbook_run_frames">, "run_id" | "parent_id" | "child_id" | "created_at" | "frame">[];
}
export interface FrozenWorkbookSources {
  version: 1;
  parentId: string;
  childId: string;
  markingRevision: number | null;
  books: FrozenSourceBook[];
  /** Metadata only. Current mutable profiles never supply mastery or planning truth. */
  profileReferences: Pick<Tables<"child_profiles">, "parent_id" | "child_id" | "assessment_id" | "revision" | "schema_version" | "build_token" | "built_at">[];
  assessmentReferences: Pick<Tables<"learner_profiles">, "id" | "parent_id" | "child_id" | "assessment_id" | "schema_version" | "built_at">[];
}
/** The Book 1 baseline record, its correction boundary and its complete second-try ledger, frozen in the same read. */
export interface FrozenBook1Sources {
  version: 1;
  baseline: Book1BaselineRecord & { id: string };
  corrections: Book1CorrectionSources;
}
/** Version 2 adds the Book 1 sources (#472). Null keeps the version 1 outcome: unavailable. */
export type FrozenWorkbookSourcesV2 = Omit<FrozenWorkbookSources, "version"> & { version: 2; book1: FrozenBook1Sources | null };
/** Internal trusted server port. Never accept a store or frozen sources from an HTTP payload. */
export interface WorkbookProgressSourceStore { capture(request: WorkbookPreviewRequest): Promise<FrozenWorkbookSources | null> }
/** A store that also reads the Book 1 baseline sources (#472): it answers version 2. */
export interface WorkbookProgressSourceStoreV2 { capture(request: WorkbookPreviewRequest): Promise<FrozenWorkbookSources | FrozenWorkbookSourcesV2 | null> }
export interface SourceUnavailable {
  ok: false;
  availability: "unavailable";
  reasons: readonly ["frozen-prior-mastery-unavailable", "frozen-planning-input-unavailable", "issued-decisions-unavailable", "corrections-unavailable"];
  sourceStatus: {
    catalog: "validated";
    retainedHistory: "loaded-not-derived";
    priorMastery: "unavailable";
    planning: "unavailable";
    issuedDecisions: "unavailable";
    corrections: "unavailable";
    causes: "unavailable";
  };
  requiredSample: ItemIdentity[];
  scope: { workbookId: string; printedRevision: string; days: number[] }[];
  sources: { reference: string; hash: string; version: number | null }[];
  consumedVersions: [];
  decision: null;
  plan: null;
}
export type SourceLoadRefusal = { ok: false; reason: "invalid-request" | "scope-unavailable" | "source-error" | "invalid-source" | "changed-during-read" };
export type SourceLoadResult = SourceLoadRefusal | { ok: true; frozen: FrozenWorkbookSources; outcome: SourceUnavailable };
export type SourceLoadResultV2 = SourceLoadResult | { ok: true; frozen: FrozenWorkbookSourcesV2; outcome: Book1PreviewOutcome };
const exact = (v: object, keys: string[]) => isDeepStrictEqual(Object.keys(v).sort(), keys.sort());
export function workbookPreviewRequest(v: unknown): WorkbookPreviewRequest | null {
  try {
    const r = v as WorkbookPreviewRequest;
    if (!r || !exact(r, ["version", "requestId", "parentId", "childId", "workbookId", "printedRevision", "selection", "cutoff", "scope"])
      || r.version !== 1 || ![r.requestId, r.parentId, r.childId, r.workbookId].every(isUuid) || !isPrintedRevision(r.printedRevision)
      || !exact(r.selection, ["unit", "skill", "step"]) || ![r.selection.unit, r.selection.skill].every(s => typeof s === "string" && /^[a-zA-Z0-9_.-]{1,100}$/.test(s))
      || !Number.isSafeInteger(r.selection.step) || r.selection.step < 1 || r.selection.step > 100
      || !Number.isSafeInteger(r.cutoff) || r.cutoff < 0 || r.cutoff > 8_640_000_000_000_000
      || !["day7", "later-book", "backstop"].includes(r.scope)) return null;
    return structuredClone(r);
  } catch { return null; }
}
function requireSource(test: unknown): asserts test { if (!test) throw Error("invalid-source"); }
const time = (v: string) => {
  requireSource(typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v));
  const fraction = v.match(/\.(\d+)/)?.[1] ?? "";
  const t = Date.parse(v) + (/[1-9]/.test(fraction.slice(3)) ? 1 : 0);
  requireSource(Number.isSafeInteger(t)); return t;
};

/** Validate frozen catalogs again on restart. Missing canonical proofs remain unavailable in this version. */
export function evaluateWorkbookProgressSources(request: WorkbookPreviewRequest, frozen: FrozenWorkbookSources): SourceUnavailable {
  return validateCatalog(request, frozen).outcome;
}
/** The frozen catalog, validated: the version 1 outcome and each book's pages as the history reader takes them. */
export function validateCatalog(request: WorkbookPreviewRequest, frozen: FrozenWorkbookSources | FrozenWorkbookSourcesV2): {
  outcome: SourceUnavailable; pages: Map<string, HistoryBook["pages"][number][]>;
  /** Printed pages of no day (D-233 extra practice): validated, never in a day's sample, their marks held. */
  undated: Map<string, { pageIds: Set<string>; numbers: Set<number> }>;
} {
  requireSource(workbookPreviewRequest(request));
  const keys = ["version", "parentId", "childId", "markingRevision", "books", "profileReferences", "assessmentReferences"];
  requireSource(frozen.version === 1 ? exact(frozen, keys) : frozen.version === 2 && exact(frozen, [...keys, "book1"]));
  requireSource(frozen.parentId === request.parentId && frozen.childId === request.childId
    && (frozen.markingRevision === null || Number.isSafeInteger(frozen.markingRevision) && frozen.markingRevision >= 0)
    && Array.isArray(frozen.books) && frozen.books.length > 0 && frozen.books.length <= 20);
  const ids = new Set<string>(), numbers = new Set<number>(), sample: ItemIdentity[] = [], scopes: SourceUnavailable["scope"] = [];
  const catalog = new Map<string, HistoryBook["pages"][number][]>();
  const undatedPages = new Map<string, { pageIds: Set<string>; numbers: Set<number> }>();
  const sources: SourceUnavailable["sources"] = [];
  const selected = frozen.books.find(b => b.book.id === request.workbookId);
  requireSource(selected && selected.book.printed_revision === request.printedRevision);
  const owner = (r: { parent_id: string; child_id: string }) => r.parent_id === request.parentId && r.child_id === request.childId;
  let selectedContext = false;
  for (const b of frozen.books) {
    const w = b.book;
    requireSource(exact(b, ["book", "delivery", "pages", "questions", "items", "changes", "events", "approvals", "frames"]));
    requireSource(owner(w) && isUuid(w.id) && !ids.has(w.id) && !numbers.has(w.number) && Number.isSafeInteger(w.number) && w.number > 0
      && w.number <= selected.book.number && w.status === "shipped" && isPrintedRevision(w.printed_revision)
      && b.delivery.auditId > 0 && Number.isSafeInteger(b.delivery.auditId) && time(b.delivery.deliveredAt) <= request.cutoff
      && b.pages.length > 0 && b.pages.length <= 2000 && b.questions.length <= 20_000);
    ids.add(w.id); numbers.add(w.number);
    const pages: HistoryBook["pages"][number][] = [], pageIds = new Set<string>(), pageNumbers = new Set<number>(), questionIds = new Set<string>();
    const undated: (PageForObservation & { number: number })[] = [];
    for (const p of b.pages) {
      requireSource(isUuid(p.id) && !pageIds.has(p.id) && !pageNumbers.has(p.page_number) && p.parent_id === request.parentId && p.workbook_id === w.id
        && Number.isSafeInteger(p.page_number) && p.page_number > 0);
      pageIds.add(p.id); pageNumbers.add(p.page_number);
      sources.push({ reference: `workbook_pages:${p.id}`, hash: sourceHash(p), version: 1 });
      const image = p.image_width !== null && p.image_height !== null ? { width: p.image_width, height: p.image_height } : null;
      requireSource(!printContractProblem(p.print_contract, { workbookId: w.id, page: p.page_number, image }));
      requireSource(p.print_contract);
      const contract = p.print_contract;
      const questions: HistoryBook["pages"][number]["questions"][number][] = [], seen = new Set<number>();
      for (const q of b.questions.filter(q => q.page_id === p.id)) {
        requireSource(isUuid(q.id) && !questionIds.has(q.id) && !seen.has(q.question_number) && q.parent_id === request.parentId && q.workbook_id === w.id
          && Number.isSafeInteger(q.question_number) && q.question_number > 0 && !teachingProblem(q.teaching));
        seen.add(q.question_number); questionIds.add(q.id);
        const content = storedContent({ number: q.question_number, box: { x: q.box_x, y: q.box_y, width: q.box_width, height: q.box_height }, schemaVersion: q.schema_version, package: q.package },
          { source: "workbook", workbookId: w.id, page: p.page_number, question: q.question_number });
        requireSource(content.status === "found");
        requireSource(q.teaching && w.print_manifest);
        const teaching = q.teaching;
        requireSource(isDeepStrictEqual(teaching.curriculum, w.print_manifest.curriculum));
        sources.push({ reference: `workbook_questions:${q.id}:teaching/1`, hash: sourceHash(q), version: q.schema_version });
        questions.push({ number: q.question_number, package: content.package, teaching });
      }
      if (questions.length && contract.day === null && !/^Day \d+$/.test(p.day_label ?? "")) {
        // A page of no day prints optional practice. Its marks are checked like any other and held from every sample.
        undated.push({ workbookId: w.id, printedRevision: w.printed_revision!, pageId: p.id, number: p.page_number, questions });
      } else if (questions.length) {
        requireSource(contract.day !== null && Number.isSafeInteger(contract.day) && contract.day >= 1 && contract.day <= 10 && p.day_label === `Day ${contract.day}`);
        pages.push({ workbookId: w.id, printedRevision: w.printed_revision!, pageId: p.id, number: p.page_number, day: contract.day, type: p.page_type, questions });
      }
    }
    catalog.set(w.id, pages);
    undatedPages.set(w.id, { pageIds: new Set(undated.map(p => p.pageId)), numbers: new Set(undated.map(p => p.number)) });
    requireSource(questionIds.size === b.questions.length && !manifestProblem(w.print_manifest,
      b.pages.map(p => ({ number: p.page_number, dayLabel: p.day_label, type: p.page_type, questions: b.questions.filter(q => q.page_id === p.id) }))));
    requireSource(w.print_manifest);
    const manifest = w.print_manifest;
    requireSource(undated.every(p => !manifest.days.some(d => d.pages.includes(p.number))));
    requireSource(manifest.snapshotDay === 7 && typeof manifest.curriculum.key === "string" && typeof manifest.curriculum.version === "string"
      && manifest.curriculum.version.length > 0 && new Set(manifest.days.map(d => d.day)).size === manifest.days.length);
    // No currently marked-row filter defines the sample. Every eligible printed item enters, even without a result.
    const days = [...new Set(manifest.days.map(d => d.day))].filter(d => request.scope !== "day7" || w.id !== request.workbookId || d <= 7).sort((a, b) => a - b);
    scopes.push({ workbookId: w.id, printedRevision: w.printed_revision!, days });
    for (const p of pages) for (const e of expectedItems(p)) {
      const step = e.teaching?.itemStep;
      if (step?.unit === request.selection.unit && step.skill === request.selection.skill && step.step === request.selection.step) {
        if (w.id === request.workbookId) selectedContext = true;
        if (e.mastery.eligible && days.includes(p.day) && manifest.days.some(d => d.day === p.day && d.pages.includes(p.number))) sample.push(e.identity);
      }
    }
    const expectedItemsList = [...pages, ...undated].flatMap(p => expectedItems(p));
    const expected = new Map(expectedItemsList.map(e => [canonical(e.identity), e]));
    requireSource(expected.size === expectedItemsList.length);
    const marks = new Map<string, HistoryMarkRow>(), markKeys = new Set<string>();
    for (const m of b.items) {
      const o = m.observation as unknown as Observation, e = expected.get(canonical(o.identity));
      requireSource(owner(m) && m.workbook_id === w.id && m.printed_revision === w.printed_revision && isUuid(m.id) && !marks.has(m.id)
        && e && isDeepStrictEqual(m.expected, e) && o.identity.pageId === m.page_id && o.identity.itemId === m.item_id
        && !markKeys.has(canonical(o.identity)) && Number.isSafeInteger(m.result_version) && m.result_version > 0
        && !observationProblem(o) && o.resultVersion === m.result_version && isDeepStrictEqual(o.teaching, e.teaching) && isDeepStrictEqual(o.mastery, e.mastery));
      time(m.evidence_at); marks.set(m.id, m); markKeys.add(canonical(o.identity));
      sources.push({ reference: `scan_marking_items:${m.id}`, hash: sourceHash(m), version: m.result_version });
    }
    const changes = new Set<number>();
    for (const c of b.changes) {
      requireSource(owner(c) && marks.has(c.item_id) && Number.isSafeInteger(c.id) && c.id > 0 && !changes.has(c.id)
        && Number.isSafeInteger(c.from_version) && c.from_version > 0 && Number.isSafeInteger(c.to_version)
        && c.to_version === c.from_version + 1 && ["parent", "admin"].includes(c.actor));
      const current = c.current as unknown as Observation, previous = c.previous as unknown as HistoryMarkRow;
      const mark = marks.get(c.item_id)!;
      requireSource(previous && previous.id === mark.id && owner(previous) && previous.workbook_id === w.id && previous.printed_revision === w.printed_revision
        && previous.page_id === mark.page_id && previous.item_id === mark.item_id && previous.result_version === c.from_version
        && isDeepStrictEqual(previous.expected, mark.expected));
      for (const [o, version] of [[previous.observation, c.from_version], [current, c.to_version]] as const) {
        const value = o as unknown as Observation;
        requireSource(!observationProblem(value) && value.resultVersion === version
          && isDeepStrictEqual(value.identity, (mark.observation as unknown as Observation).identity)
          && isDeepStrictEqual(value.teaching, (mark.observation as unknown as Observation).teaching)
          && isDeepStrictEqual(value.mastery, (mark.observation as unknown as Observation).mastery));
      }
      time(c.changed_at); changes.add(c.id);
      sources.push({ reference: `scan_mark_changes:${c.id}`, hash: sourceHash(c), version: c.to_version });
    }
    const events = new Set<string>();
    for (const e of b.events) {
      const p = [...pages, ...undated].find(p => p.number === e.workbook_page), q = p?.questions.find(q => q.number === e.workbook_question)?.package;
      requireSource(owner(e) && e.workbook_id === w.id && isUuid(e.id) && !events.has(e.id) && e.question_source === "workbook"
        && ["marking", "call"].includes(e.source) && ["right", "wrong", "blank", "right_with_help"].includes(e.result)
        && Number.isSafeInteger(e.hints) && e.hints >= 0 && e.hints <= 100
        && e.evidence_kind === (e.source === "call" ? "call" : "scan") && typeof e.evidence_id === "string" && e.evidence_id.length > 0
        && q && q.skill.standard === e.skill_standard && isDeepStrictEqual([...q.skill.skills].sort(), [...e.skills].sort()));
      time(e.occurred_at); events.add(e.id);
      sources.push({ reference: `learning_events:${e.id}`, hash: sourceHash(e), version: null });
    }
    for (const a of b.approvals) {
      requireSource(owner(a) && a.workbook_id === w.id && a.action === "workbook-approved");
      sources.push({ reference: `workbook_audit:${a.id}`, hash: sourceHash(a), version: null });
    }
    for (const f of b.frames) {
      requireSource(owner(f) && b.approvals.some(a => a.run_id === f.run_id));
      sources.push({ reference: `workbook_run_frames:${f.run_id}`, hash: sourceHash(f), version: typeof f.frame === "object" && f.frame && !Array.isArray(f.frame) && typeof f.frame.version === "number" ? f.frame.version : null });
    }
    sources.push({ reference: `workbooks:${w.id}:${w.printed_revision}`, hash: sourceHash(b), version: 1 });
  }
  requireSource(selectedContext);
  for (const p of frozen.profileReferences) requireSource(owner(p) && Number.isSafeInteger(p.revision) && p.revision > 0);
  for (const p of frozen.assessmentReferences) requireSource(owner(p) && isUuid(p.assessment_id));
  // Neither these mutable metadata references nor the frame's revision number authenticate historical profile facts.
  sources.push({ reference: "profile-source-metadata", hash: sourceHash([frozen.profileReferences, frozen.assessmentReferences]), version: null });
  return { pages: catalog, undated: undatedPages, outcome: { ok: false, availability: "unavailable", reasons: ["frozen-prior-mastery-unavailable", "frozen-planning-input-unavailable", "issued-decisions-unavailable", "corrections-unavailable"],
    sourceStatus: { catalog: "validated", retainedHistory: "loaded-not-derived", priorMastery: "unavailable", planning: "unavailable", issuedDecisions: "unavailable", corrections: "unavailable", causes: "unavailable" },
    requiredSample: sample, scope: scopes, sources, consumedVersions: [], decision: null, plan: null } };
}

export async function loadWorkbookProgressSources(store: WorkbookProgressSourceStore, raw: unknown): Promise<SourceLoadResult>;
export async function loadWorkbookProgressSources(store: WorkbookProgressSourceStoreV2, raw: unknown): Promise<SourceLoadResultV2>;
export async function loadWorkbookProgressSources(store: WorkbookProgressSourceStoreV2, raw: unknown): Promise<SourceLoadResultV2> {
  const request = workbookPreviewRequest(raw);
  if (!request) return { ok: false, reason: "invalid-request" };
  try {
    const start = await store.capture(request);
    if (!start) return { ok: false, reason: "scope-unavailable" };
    const result: SourceLoadResultV2 = start.version === 2 ? { ok: true, frozen: start, outcome: await evaluateBook1Preview(request, start) }
      : { ok: true, frozen: start, outcome: evaluateWorkbookProgressSources(request, start) };
    const end = await store.capture(request);
    if (!end || !isDeepStrictEqual(start, end)) return { ok: false, reason: "changed-during-read" };
    return structuredClone(result);
  } catch (e) { return { ok: false, reason: e instanceof Error && e.message === "invalid-source" ? "invalid-source" : "source-error" }; }
}
