import "server-only";
import type { Database } from "./database";
import { expectedItems, observationProblem, type ItemIdentity, type Observation, type PageForObservation } from "./scan-observation";
import { previewNextWorkbookPlan, type WorkbookPlanPreviewInput, type WorkbookPlanPreviewResult } from "./workbook-progress-plan";
import { deriveWorkbookProgress, type ProgressOriginal, type ProgressReading, type ProgressSampleItem, type ProgressSnapshot } from "./workbook-progress";
import { isPrintedRevision, manifestProblem, type ScanManifest } from "./workbook-print-contract";

type Tables = Database["public"]["Tables"];
export type HistoryMarkRow = Omit<Tables["scan_marking_items"]["Row"], "owner_photo">;
export type HistoryChangeRow = Tables["scan_mark_changes"]["Row"];
export type HistoryEventRow = Pick<Tables["learning_events"]["Row"], "id" | "idempotency_key" | "parent_id" | "child_id"
  | "source" | "question_source" | "workbook_id" | "workbook_page" | "workbook_question" | "occurred_at"
  | "result" | "hints" | "evidence_kind" | "evidence_id" | "skill_standard" | "skills">;
export interface HistoryBook {
  workbookId: string;
  printedRevision: string;
  manifest: ScanManifest;
  /** Complete trusted frozen page/package/context catalog for this pinned book. No model/browser input. */
  pages: readonly (PageForObservation & { number: number; day: number; type: string })[];
}
export interface WorkbookProgressHistoryInput {
  version: 1;
  snapshot: Omit<ProgressSnapshot, "requiredSample">;
  curriculum: WorkbookPlanPreviewInput["curriculum"];
  books: readonly HistoryBook[];
  /** Exact required sample identities, including items with no scan. Eligibility comes from expectedItems. */
  sample: readonly ItemIdentity[];
  proof: {
    frozenPackages: string;
    priorMastery: string;
    /** Caller attests the issued list is complete for this step through the cutoff. Empty requires this proof too. */
    issuedHistory: string;
    issuedDecisions: WorkbookPlanPreviewInput["history"]["issuedDecisions"];
    /** No merged second-try or cause proof reader exists here. Unknown cannot become a negative claim. */
    corrections: "unavailable" | { reference: string; completeThrough: number; rows: readonly {
      identity: ItemIdentity; tries: ProgressOriginal["secondTries"];
    }[] };
    causes: "unavailable" | { reference: string; rows: readonly { identity: ItemIdentity; cause: ProgressOriginal["cause"] }[] };
  };
  selection: { kind: "day7"; currentWorkbookId: string } | { kind: "later-book" | "backstop"; reference: string };
}
export interface HistoryFence {
  parentId: string;
  childId: string;
  markingRevision: number | null;
  books: readonly { workbookId: string; printedRevision: string; manifest: ScanManifest;
    counts: { items: number; changes: number; events: number } }[];
}
export interface HistoryPage<T> { rows: readonly T[]; remaining: number }
/** Each remaining count is exact for the query after the exclusive cursor, not the current response size. */
export interface WorkbookProgressHistoryStore {
  fence(input: WorkbookProgressHistoryInput): Promise<HistoryFence | null>;
  items(input: WorkbookProgressHistoryInput, book: HistoryBook, after: string | null, limit: number): Promise<HistoryPage<HistoryMarkRow>>;
  changes(input: WorkbookProgressHistoryInput, book: HistoryBook, after: number | null, limit: number): Promise<HistoryPage<HistoryChangeRow>>;
  events(input: WorkbookProgressHistoryInput, book: HistoryBook, after: string | null, limit: number): Promise<HistoryPage<HistoryEventRow>>;
}
export type HistoryRefusal = "invalid-contract" | "scope-unavailable" | "source-error" | "invalid-page" | "safety-bound"
  | "changed-during-read" | "invalid-record" | "unproved-past-state" | "missing-source-reference" | "preview-refused" | "corrections-unavailable";
export interface HistoryProof {
  cutoff: number;
  scope: ProgressSnapshot["scope"];
  markingRevision: number | null;
  counts: { items: number; changes: number; events: number; requests: number };
  sources: readonly ["scan_marking_items", "scan_mark_changes", "learning_events"];
  corrections: "caller-validated" | "unavailable";
  causes: "caller-validated" | "unavailable";
  callerProof: { frozenPackages: string; priorMastery: string; issuedHistory: string };
  /** A source reference can name an actual retained audit row. It does not assert a learning event was published. */
  references: { reference: string; source: "learning_events" | "scan_marking_items" | "scan_mark_changes"; version: number }[];
  helpEvents: { identity: ItemIdentity; ids: string[] }[];
  helpTiming: "call-before-retained-mark; original-answer-time-unavailable";
  usedVersions: { key: string; firstVersion: number; effectiveVersion: number }[];
  timeNormalization: "ceil-millisecond";
}
export type WorkbookProgressHistoryResult = { ok: false; availability: "unavailable"; reason: HistoryRefusal } | {
  ok: true;
  availability: "complete";
  snapshot: ProgressSnapshot;
  history: WorkbookPlanPreviewInput["history"];
  held: { reason: "outside-days" | "outside-sample" | "after-cutoff"; original: ProgressOriginal }[];
  heldChanges: { identity: ItemIdentity; reading: ProgressReading }[];
  proof: HistoryProof;
};
export type WorkbookProgressHistoryPreview = Extract<WorkbookProgressHistoryResult, { ok: false }> | {
  ok: true; availability: "complete"; retained: Extract<WorkbookProgressHistoryResult, { ok: true }>;
  preview: Extract<WorkbookPlanPreviewResult, { ok: true }>;
};
export interface HistoryLimits { batchSize?: number; maxRows?: number; maxRequests?: number }
const key = (i: ItemIdentity) => JSON.stringify([i.workbookId, i.printedRevision, i.pageId, i.itemId]);
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const stable = (v: unknown): string => Array.isArray(v) ? `[${v.map(stable).join(",")}]`
  : object(v) ? `{${Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`).join(",")}}`
    : JSON.stringify(v) ?? "undefined";
const same = (a: unknown, b: unknown) => stable(a) === stable(b);
function fail(reason: HistoryRefusal): never { throw new HistoryError(reason); }
class HistoryError extends Error { constructor(readonly reason: HistoryRefusal) { super(reason); } }
function at(v: unknown): number {
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v)) fail("invalid-record");
  // Postgres keeps microseconds. Round forward so a sub-millisecond post-cutoff mark cannot leak backward.
  const fraction = v.match(/\.(\d+)/)?.[1] ?? "";
  const n = Date.parse(v) + (/[1-9]/.test(fraction.slice(3)) ? 1 : 0);
  if (!integer(n)) fail("invalid-record");
  return n;
}

/**
 * The caller MUST check a live parent/admin session before use. A service client is not caller authorization.
 * This optimistic read detects observed revision/count/fence drift. It is not a database transaction or a lock.
 * No image/photo-lifetime filter, current profile aggregate, writer or provider is used.
 */
export async function readWorkbookProgressHistory(store: WorkbookProgressHistoryStore, input: WorkbookProgressHistoryInput,
  limits: HistoryLimits = {}): Promise<WorkbookProgressHistoryResult> {
  try { return await read(store, structuredClone(input), limits); }
  catch (e) { return { ok: false, availability: "unavailable", reason: e instanceof HistoryError ? e.reason : "source-error" }; }
}

async function read(store: WorkbookProgressHistoryStore, input: WorkbookProgressHistoryInput, limits: HistoryLimits): Promise<WorkbookProgressHistoryResult> {
  const batch = limits.batchSize ?? 100, maxRows = limits.maxRows ?? 20_000, maxRequests = limits.maxRequests ?? 1000;
  if (!integer(batch) || batch < 1 || batch > 500 || !integer(maxRows) || maxRows < 1 || maxRows > 100_000
    || !integer(maxRequests) || maxRequests < 1 || maxRequests > 5000) fail("invalid-contract");
  const s = input.snapshot, proof = input.proof;
  if (input.version !== 1 || !integer(s.cutoff) || ![s.parentId, s.childId, s.id, proof.frozenPackages, proof.priorMastery, proof.issuedHistory].every(text)
    || ![s.parentId, s.childId, ...input.books.map(b => b.workbookId)].every(uuid)
    || proof.priorMastery !== s.priorMastery.evidenceReference || !input.books.length || input.books.length > 20
    || !Array.isArray(proof.issuedDecisions) || !Array.isArray(input.sample)) fail("invalid-contract");
  const bookIds = new Set(input.books.map(b => b.workbookId));
  if (bookIds.size !== input.books.length || s.scope.length !== input.books.length) fail("invalid-contract");
  for (const b of input.books) {
    if (!isPrintedRevision(b.printedRevision) || b.manifest.snapshotDay !== 7
      || !same(b.manifest.curriculum, s.curriculum)
      || manifestProblem(b.manifest, b.pages.map(p => ({ number: p.number, dayLabel: `Day ${p.day}`, type: p.type, questions: p.questions })))) fail("invalid-contract");
    const selected = s.scope.filter(x => x.workbookId === b.workbookId && x.printedRevision === b.printedRevision);
    if (selected.length !== 1 || !selected[0].days.length || selected[0].days.some(d => !integer(d) || d < 1 || d > 10)
      || new Set(selected[0].days).size !== selected[0].days.length) fail("invalid-contract");
  }
  if (input.selection.kind === "day7") {
    const currentWorkbookId = input.selection.currentWorkbookId;
    const current = s.scope.find(b => b.workbookId === currentWorkbookId);
    if (!current || current.days.some(d => d > 7)) fail("invalid-contract");
  } else if (!["later-book", "backstop"].includes(input.selection.kind) || !text(input.selection.reference)) fail("invalid-contract");
  if (proof.corrections !== "unavailable" && (!text(proof.corrections.reference) || proof.corrections.completeThrough !== s.cutoff)) fail("invalid-contract");
  if (proof.causes !== "unavailable" && !text(proof.causes.reference)) fail("invalid-contract");

  const catalog = new Map<string, ProgressSampleItem>();
  if (input.books.some(b => b.pages.length > 2000)) fail("safety-bound");
  for (const b of input.books) for (const p of b.pages) {
    if (p.workbookId !== b.workbookId || p.printedRevision !== b.printedRevision || !integer(p.day) || p.day < 1 || p.day > 10
      || !integer(p.number) || p.number < 1 || !text(p.pageId)) fail("invalid-contract");
    for (const expected of expectedItems(p)) {
      const k = key(expected.identity);
      if (catalog.has(k)) fail("invalid-contract");
      const q = p.questions.find(q => q.number === expected.number)!;
      catalog.set(k, { expected, day: p.day, contextVersion: q.teaching?.version ?? null,
        question: { source: "workbook", workbookId: b.workbookId, page: p.number, question: expected.number }, resultVersion: null });
      if (catalog.size > 100_000) fail("safety-bound");
    }
  }
  const sampleKeys = new Set(input.sample.map(key));
  if (sampleKeys.size !== input.sample.length || [...sampleKeys].some(k => !catalog.has(k))) fail("invalid-contract");
  for (const k of sampleKeys) {
    const x = catalog.get(k)!;
    if (!s.scope.find(b => b.workbookId === x.expected.identity.workbookId)?.days.includes(x.day)) fail("invalid-contract");
  }
  const start = await store.fence(input);
  if (!start) fail("scope-unavailable");
  if (start.parentId !== s.parentId || start.childId !== s.childId || (start.markingRevision !== null && !integer(start.markingRevision))
    || start.books.length !== input.books.length) fail("invalid-record");
  const counts = { items: 0, changes: 0, events: 0, requests: 0 };
  let rowCount = 0;
  async function all<T, K extends string | number>(load: (after: K | null) => Promise<HistoryPage<T>>, id: (r: T) => K,
    total: number): Promise<T[]> {
    if (!integer(total)) fail("invalid-page");
    if (total + rowCount > maxRows) fail("safety-bound");
    const rows: T[] = [];
    let cursor: K | null = null, remaining = total;
    for (;;) {
      if (++counts.requests > maxRequests) fail("safety-bound");
      const p = await load(cursor);
      if (!p || !Array.isArray(p.rows) || !integer(p.remaining) || p.remaining !== remaining || p.rows.length > batch
        || p.rows.length > remaining || (remaining > 0 && p.rows.length === 0)) fail("invalid-page");
      for (const r of p.rows) {
        const next = id(r);
        if (!(typeof next === "string" ? text(next) : integer(next) && next > 0) || (cursor !== null && next <= cursor)) fail("invalid-page");
        cursor = next;
        rows.push(r);
        if (++rowCount > maxRows) fail("safety-bound");
      }
      if (remaining === 0) return rows;
      remaining -= p.rows.length;
    }
  }
  const marks: HistoryMarkRow[] = [], changes: HistoryChangeRow[] = [], events: HistoryEventRow[] = [];
  for (const b of input.books) {
    const f = start.books.filter(x => x.workbookId === b.workbookId);
    if (f.length !== 1 || f[0].printedRevision !== b.printedRevision || !same(f[0].manifest, b.manifest)) fail("scope-unavailable");
    const ms = await all<HistoryMarkRow, string>(after => store.items(input, b, after, batch), r => r.id, f[0].counts.items);
    const js = await all<HistoryChangeRow, number>(after => store.changes(input, b, after, batch), r => r.id, f[0].counts.changes);
    const es = await all<HistoryEventRow, string>(after => store.events(input, b, after, batch), r => r.id, f[0].counts.events);
    if (ms.some(m => m.workbook_id !== b.workbookId || m.printed_revision !== b.printedRevision)
      || es.some(e => e.workbook_id !== b.workbookId)) fail("invalid-record");
    const itemIds = new Set(ms.map(m => m.id));
    if (js.some(j => !itemIds.has(j.item_id))) fail("invalid-record");
    marks.push(...ms); changes.push(...js); events.push(...es);
  }
  counts.items = marks.length; counts.changes = changes.length; counts.events = events.length;
  if (new Set(changes.map(j => j.id)).size !== changes.length) fail("invalid-record");
  const byEvent = new Map<string, HistoryEventRow>(), eventKeys = new Set<string>();
  for (const e of events) {
    if (!uuid(e.id) || byEvent.has(e.id) || eventKeys.has(e.idempotency_key) || e.parent_id !== s.parentId || e.child_id !== s.childId || !bookIds.has(e.workbook_id!)
      || e.question_source !== "workbook" || !["call", "marking"].includes(e.source)
      || !["right", "wrong", "blank", "right_with_help"].includes(e.result) || !integer(e.hints) || e.hints > 100
      || !integer(e.workbook_page) || e.workbook_page < 1 || !integer(e.workbook_question) || e.workbook_question < 1
      || !integer(at(e.occurred_at)) || !text(e.idempotency_key)
      || e.evidence_kind !== (e.source === "call" ? "call" : "scan") || !text(e.evidence_id)) fail("invalid-record");
    const page = input.books.find(b => b.workbookId === e.workbook_id)?.pages.find(p => p.number === e.workbook_page);
    const pkg = page?.questions.find(q => q.number === e.workbook_question)?.package;
    if (!pkg || e.skill_standard !== pkg.skill.standard || !Array.isArray(e.skills)
      || !same([...e.skills].sort(), [...pkg.skill.skills].sort())) fail("invalid-record");
    byEvent.set(e.id, e);
    eventKeys.add(e.idempotency_key);
  }
  const references: HistoryProof["references"] = [], helpEvents: HistoryProof["helpEvents"] = [];
  const heldChanges: Extract<WorkbookProgressHistoryResult, { ok: true }>["heldChanges"] = [];
  const normalized: ProgressOriginal[] = [], seen = new Set<string>(), markIds = new Set<string>();
  function checkedMark(r: HistoryMarkRow, x: ProgressSampleItem): Observation {
    const identity = x.expected.identity;
    if (!uuid(r.id) || !uuid(r.page_id) || r.parent_id !== s.parentId || r.child_id !== s.childId || r.workbook_id !== identity.workbookId
      || r.printed_revision !== identity.printedRevision || r.page_id !== identity.pageId || r.item_id !== identity.itemId
      || !same(r.expected, x.expected) || !integer(r.result_version) || r.result_version < 1
      || ![r.model, r.prompt, r.event_id].every(v => v === null || text(v))) fail("invalid-record");
    at(r.evidence_at);
    const o = r.observation as unknown as Observation;
    if (!object(o) || !object(o.identity) || !object(o.mastery) || !Array.isArray(o.regions)
      || observationProblem(o) || !same(o.identity, identity) || !same(o.teaching, x.expected.teaching) || !same(o.mastery, x.expected.mastery)
      || o.resultVersion !== r.result_version || !["none", "math-help", "unknown"].includes(o.help)
      || !["system", "parent", "admin"].includes(o.actor) || !["code", "parent", "unscored", "unavailable"].includes(o.method)
      || !["pending", "scored", "parent-pending", "parent-checked", "unscored"].includes(o.state)
      || !["certain", "uncertain", "not-read"].includes(o.certainty)
      || !(o.readAnswerText === null || typeof o.readAnswerText === "string")
      || o.regions.some(r => !text(r.regionId) || ![r.text, r.value].every(v => v === null || typeof v === "string" && v.length <= 200)
        || !["certain", "uncertain", "not-read"].includes(r.certainty))
      || new Set(o.regions.map(r => r.regionId)).size !== o.regions.length
      || (o.result !== null && !["right", "wrong", "blank"].includes(o.result))
      || (o.evidence !== null && (!object(o.evidence) || !text(o.evidence.photoRevision)))) fail("invalid-record");
    if (o.state === "scored" && o.certainty === "certain"
      && !same(o.regions.map(r => r.regionId).sort(), [...x.expected.scoredRegions].sort())) fail("invalid-record");
    return structuredClone(o);
  }
  for (const r of marks) {
    const k = key({ workbookId: r.workbook_id, printedRevision: r.printed_revision, pageId: r.page_id, itemId: r.item_id });
    const x = catalog.get(k);
    if (!x || seen.has(k) || markIds.has(r.id)) fail("invalid-record");
    seen.add(k); markIds.add(r.id);
    const current = checkedMark(r, x);
    // A persisted publication reference must name a real, scoped original event, even when first provenance
    // comes from the pending row in the parent journal. Audit references do not invent learning-event rows.
    if (r.original_event !== null || r.event_id !== null) {
      const intent = r.original_event, event = byEvent.get(r.event_id ?? "");
      if (!object(intent) || !event || event.source !== "marking" || event.idempotency_key !== intent.key
        || intent.parentId !== s.parentId || intent.childId !== s.childId || intent.source !== "marking"
        || !same(intent.question, x.question) || event.workbook_id !== x.question.workbookId
        || event.workbook_page !== x.question.page || event.workbook_question !== x.question.question
        || event.result !== intent.result || at(event.occurred_at) !== at(intent.occurredAt)
        || !same(intent.skill, { standard: event.skill_standard, skills: event.skills })) fail("missing-source-reference");
    }
    const journal = changes.filter(j => j.item_id === r.id).sort((a, b) => a.to_version - b.to_version);
    let firstRow = r;
    if (journal.length) firstRow = journal[0].previous as unknown as HistoryMarkRow;
    const first = checkedMark(firstRow, x);
    if (firstRow.id !== r.id || first.actor !== "system" || first.state === "parent-checked" || first.method !== x.expected.method
      || first.resultVersion > 2 || (first.resultVersion === 1 && first.state === "scored")) fail("unproved-past-state");
    if (start.markingRevision === null && first.resultVersion > 1) fail("invalid-record");
    const initialTime = at(firstRow.evidence_at);
    // Automatic transitions have no full previous-row journal. Never invent a past pending reading.
    if (initialTime > s.cutoff && first.resultVersion > 1) fail("unproved-past-state");
    let previous = first, previousTime = initialTime;
    const readings: ProgressReading[] = [];
    for (const j of journal) {
      const prior = j.previous as unknown as HistoryMarkRow;
      const priorObservation = checkedMark(prior, x);
      const next = j.current as unknown as Observation;
      const nextTime = at(j.changed_at);
      if (j.parent_id !== s.parentId || j.child_id !== s.childId || j.actor !== "parent" || prior.id !== r.id
        || j.from_version !== previous.resultVersion || j.to_version !== j.from_version + 1
        || !same(priorObservation, previous) || at(prior.evidence_at) !== previousTime || nextTime < previousTime
        || prior.model !== firstRow.model || prior.prompt !== firstRow.prompt
        || (prior.original_event !== null && !same(prior.original_event, r.original_event))
        || (prior.event_id !== null && prior.event_id !== r.event_id)) fail("invalid-record");
      checkedMark({ ...prior, observation: j.current, result_version: j.to_version, evidence_at: j.changed_at }, x);
      const expectedNext = { ...previous, state: "parent-checked", method: "parent", actor: "parent", result: next.result, resultVersion: j.to_version };
      if (!same(next, expectedNext) || !["right", "wrong", "blank"].includes(next.result!)) fail("invalid-record");
      const reference = `scan_mark_changes:${j.id}`;
      const reading = { observation: structuredClone(next), at: nextTime, provenance: { eventId: reference, model: prior.model, prompt: prior.prompt } };
      if (nextTime <= s.cutoff) readings.push(reading);
      else heldChanges.push({ identity: x.expected.identity, reading });
      references.push({ reference, source: "scan_mark_changes", version: j.to_version });
      previous = next; previousTime = nextTime;
    }
    if (!same(previous, current) || previousTime !== at(r.evidence_at) || r.model !== firstRow.model || r.prompt !== firstRow.prompt) fail("invalid-record");
    const currentIntent = r.original_event;
    if (firstRow.original_event === null && object(currentIntent)
      && !journal.some(j => at(j.changed_at) === at(currentIntent.occurredAt) && object(j.current) && j.current.result === currentIntent.result)) fail("missing-source-reference");
    let reference: string, source: HistoryProof["references"][number]["source"];
    if (firstRow.original_event !== null) {
      const e = byEvent.get(firstRow.event_id ?? r.event_id ?? "");
      const intent = firstRow.original_event;
      if (!e || !object(intent) || e.source !== "marking" || e.workbook_id !== x.question.workbookId || e.workbook_page !== x.question.page
        || e.workbook_question !== x.question.question || e.idempotency_key !== intent.key || at(e.occurred_at) !== initialTime
        || !same(intent.question, x.question) || intent.parentId !== s.parentId || intent.childId !== s.childId
        || intent.source !== "marking" || intent.result !== first.result || e.result !== first.result
        || at(intent.occurredAt) !== initialTime) fail("missing-source-reference");
      reference = e.id; source = "learning_events";
    } else {
      reference = journal.length ? `scan_mark_changes:${journal[0].id}:previous` : `scan_marking_items:${r.id}:${first.resultVersion}`;
      source = journal.length ? "scan_mark_changes" : "scan_marking_items";
      if (first.state === "scored" && first.mastery.eligible) fail("missing-source-reference");
    }
    references.push({ reference, source, version: first.resultVersion });
    const helped = events.filter(e => e.source === "call" && e.workbook_id === x.question.workbookId && e.workbook_page === x.question.page
      && e.workbook_question === x.question.question && at(e.occurred_at) <= initialTime && (e.hints > 0 || e.result === "right_with_help"));
    // evidence_at is recognition time, not the child's answer time. Such a call blocks a claim of independence,
    // but cannot prove that help preceded the paper answer. Keep that ordering unknown instead of inventing it.
    if (helped.length) {
      first.help = first.help === "math-help" ? "math-help" : "unknown";
      for (const q of readings) q.observation.help = first.help;
      for (const h of heldChanges.filter(h => key(h.identity) === k)) h.reading.observation.help = first.help;
      helpEvents.push({ identity: x.expected.identity, ids: helped.map(e => e.id) });
    }
    normalized.push({ parentId: s.parentId, childId: s.childId, day: x.day,
      first: { observation: first, at: initialTime, provenance: { eventId: reference, model: firstRow.model, prompt: firstRow.prompt } },
      changes: readings, secondTries: [], cause: { kind: "unknown" } });
  }
  const byKey = new Map(normalized.map(o => [key(o.first.observation.identity), o]));
  if (proof.corrections !== "unavailable") {
    const seen = new Set<string>();
    for (const row of proof.corrections.rows) {
      const k = key(row.identity), o = byKey.get(k);
      if (!o || seen.has(k)) fail("invalid-contract");
      seen.add(k); o.secondTries = structuredClone(row.tries);
    }
  }
  if (proof.causes !== "unavailable") {
    const seen = new Set<string>();
    for (const row of proof.causes.rows) {
      const k = key(row.identity), o = byKey.get(k);
      if (!o || seen.has(k)) fail("invalid-contract");
      seen.add(k); o.cause = structuredClone(row.cause);
    }
  }
  const originals: ProgressOriginal[] = [], held: Extract<WorkbookProgressHistoryResult, { ok: true }>["held"] = [];
  for (const o of normalized) {
    const k = key(o.first.observation.identity), scope = s.scope.find(b => b.workbookId === o.first.observation.identity.workbookId)!;
    if (o.first.at > s.cutoff) held.push({ reason: "after-cutoff", original: o });
    else if (!scope.days.includes(o.day)) held.push({ reason: "outside-days", original: o });
    else if (!sampleKeys.has(k)) held.push({ reason: "outside-sample", original: o });
    else originals.push(o);
  }
  const requiredSample = [...sampleKeys].map(k => {
    const o = originals.find(o => key(o.first.observation.identity) === k);
    return { ...catalog.get(k)!, resultVersion: o ? (o.changes.at(-1) ?? o.first).observation.resultVersion : null };
  });
  const snapshot: ProgressSnapshot = { ...s, requiredSample };
  const history = { version: 1 as const, originals, issuedDecisions: proof.issuedDecisions };
  // The approved core validates all selected records before a complete result leaves this boundary.
  const derived = deriveWorkbookProgress(snapshot, input.curriculum, history);
  if (!derived.ok) fail("invalid-record");
  // Every retained row has passed the source/observation/journal checks above. The no-sample path validates held
  // selected-step evidence without making an isolated mastery decision. Other steps supply no progress decision.
  for (const h of held) {
    const o = h.original, k = key(o.first.observation.identity), x = catalog.get(k)!;
    if (o.first.observation.teaching?.itemStep?.skill !== s.selection.skill || o.first.observation.teaching?.itemStep?.step !== s.selection.step) {
      if (o.secondTries.length || o.cause.kind !== "unknown") fail("invalid-contract");
      continue;
    }
    const cutoff = Math.max(s.cutoff, o.first.at, ...o.changes.map(c => c.at));
    const check = deriveWorkbookProgress({ ...s, cutoff, scope: [{ workbookId: x.expected.identity.workbookId,
      printedRevision: x.expected.identity.printedRevision, days: [x.day] }], requiredSample: null }, input.curriculum,
    { version: 1, originals: [o], issuedDecisions: [] });
    if (!check.ok) fail("invalid-record");
  }
  const end = await store.fence(input);
  if (!end || !same(start, end)) fail("changed-during-read");
  return structuredClone({ ok: true, availability: "complete", snapshot, history, held, heldChanges,
    proof: { cutoff: s.cutoff, scope: s.scope, markingRevision: start.markingRevision, counts,
      sources: ["scan_marking_items", "scan_mark_changes", "learning_events"],
      corrections: proof.corrections === "unavailable" ? "unavailable" : "caller-validated",
      causes: proof.causes === "unavailable" ? "unavailable" : "caller-validated",
      callerProof: { frozenPackages: proof.frozenPackages, priorMastery: proof.priorMastery, issuedHistory: proof.issuedHistory }, references, helpEvents,
      usedVersions: derived.decision.consumed, timeNormalization: "ceil-millisecond",
      helpTiming: "call-before-retained-mark; original-answer-time-unavailable" } });
}

/** Public composition. No unavailable source can silently become an empty complete history. */
export async function previewNextWorkbookPlanFromHistory(store: WorkbookProgressHistoryStore, input: WorkbookProgressHistoryInput,
  planning: WorkbookPlanPreviewInput["planning"], limits?: HistoryLimits): Promise<WorkbookProgressHistoryPreview> {
  const frozen = structuredClone(input), frozenPlanning = structuredClone(planning);
  const retained = await readWorkbookProgressHistory(store, frozen, limits);
  if (!retained.ok) return retained;
  // Facts remain readable, but unknown corrections cannot establish unresolved work for a definitive plan.
  if (retained.proof.corrections === "unavailable") return { ok: false, availability: "unavailable", reason: "corrections-unavailable" };
  const preview = previewNextWorkbookPlan({ version: 1, snapshot: retained.snapshot, curriculum: frozen.curriculum, history: retained.history, planning: frozenPlanning });
  if (!preview.ok) return { ok: false, availability: "unavailable", reason: "preview-refused" };
  return { ok: true, availability: "complete", retained, preview };
}
