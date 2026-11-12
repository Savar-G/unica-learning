// #472 Book 1 baseline storage and capture. The SQL transport is its own interface; book1BaselineSql binds it to the
// three service-only functions of migration workbook_book1_baseline. The admin preview reads Book 1 sources through it.
// The capture runs after each Book 1 approval and in the reminders run (#870, src/lib/workbook-book1-capture.ts), and by
// hand for a frame with no planning capture (scripts/book1-baseline-recover.ts).
//
// Capture order (the handoff names the exact root steps): the final draft revision is saved (R2) first; then
// captureBook1Baseline reads that revision as approval would, proves the planning input, and saves the baseline, whose
// SQL save opens the correction boundary in the same transaction; review comments are closed after that.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { isDeepStrictEqual as same } from "node:util";
import { createBook1Baseline, proveBook1PlanningCapture, readBook1Baseline, type Book1BaselineRecord, type Book1PlanningProof } from "./workbook-book1-baseline";
import { recoverBook1PlanningInput, type Book1RecoveryRefusal, type Book1RecoverySources, type PinnedPlanningEngine } from "./workbook-book1-recovery";
import type { Book1CorrectionSources, SecondTryRow } from "./workbook-correction-journal";
import { isUuid } from "./workbook-content";
import type { RunFrame } from "./workbook-job";
import type { FrozenBook1Sources, WorkbookPreviewRequest } from "./workbook-progress-source";
import type { DraftForApproval } from "./workbook-ship";

/** The three service-only functions of migration workbook_book1_baseline. */
export interface Book1BaselineSql {
  command(args: { p_action: "read" | "save"; p_actor: string; p_parent: string; p_child: string; p_run: string; p_draft: string;
    p_request: string; p_payload: string | null; p_hash: string | null }): Promise<unknown>;
  sources(args: { p_parent: string; p_child: string; p_workbook: string }): Promise<unknown>;
  secondTry(args: { p_id: string; p_baseline: string; p_item_row: string; p_based_on_version: number; p_result: string; p_help: string;
    p_evidence_reference: string }): Promise<unknown>;
}
/** The transport over db.rpc, with the service client: each call throws on an error, never returns partial data. */
export function book1BaselineSql(db: SupabaseClient<Database>): Book1BaselineSql {
  const data = (r: { data: unknown; error: unknown }) => { if (r.error) throw Error("book1-sql-unavailable"); return r.data; };
  return {
    command: async (args) => data(await db.rpc("workbook_book1_baseline_command", args)),
    sources: async (args) => data(await db.rpc("workbook_book1_sources", args)),
    secondTry: async (args) => data(await db.rpc("record_workbook_second_try", args)),
  };
}
export interface Book1Scope { parentId: string; childId: string; runId: string; draftId: string }
export interface StoredBook1Baseline { id: string; record: Book1BaselineRecord; boundaryAt: string; initialActivity: Book1CorrectionSources["initialActivity"] }
export type Book1SaveStatus = "saved" | "duplicate" | "conflict" | "unavailable" | { refused: string };
export interface Book1BaselineRepository {
  /** One baseline by its id, within its scope (the SQL looks it up by id only). */
  read(actorId: string, scope: Book1Scope, id: string): Promise<StoredBook1Baseline | null>;
  save(actorId: string, scope: Book1Scope, id: string, record: Book1BaselineRecord): Promise<Book1SaveStatus>;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const counts = (v: unknown): Book1CorrectionSources["initialActivity"] | null => {
  if (!object(v)) return null;
  const keys = ["items", "changes", "events", "receipts", "secondTries"];
  if (!same(Object.keys(v).sort(), [...keys].sort()) || keys.some(k => !Number.isSafeInteger(v[k]) || Number(v[k]) < 0)) return null;
  return v as Book1CorrectionSources["initialActivity"];
};

export function book1BaselineRepository(sql: Book1BaselineSql): Book1BaselineRepository {
  const args = (action: "read" | "save", actor: string, s: Book1Scope, id: string | null, record: Book1BaselineRecord | null) => ({
    p_action: action, p_actor: actor, p_parent: s.parentId, p_child: s.childId, p_run: s.runId, p_draft: s.draftId,
    p_request: id ?? "00000000-0000-4000-8000-000000000000", p_payload: record?.payload ?? null, p_hash: record?.hash ?? null });
  return {
    async read(actor, scope, id) {
      // By the baseline's id: the SQL read finds a row only by p_request (review on #472b: a read with no id always missed).
      const a = await sql.command(args("read", actor, scope, id, null));
      if (!object(a)) throw Error("baseline-sql-answer");
      if (a.status === "missing") return null;
      const activity = counts(a.initial_activity);
      if (a.status !== "found" || typeof a.id !== "string" || typeof a.payload !== "string" || typeof a.hash !== "string" || typeof a.boundary_at !== "string" || !activity) throw Error("baseline-unavailable");
      const record = { payload: a.payload, hash: a.hash };
      const b = readBook1Baseline(record);
      if (!b || b.id !== a.id || b.parentId !== scope.parentId || b.childId !== scope.childId || b.runId !== scope.runId || b.draftId !== scope.draftId) throw Error("baseline-invalid-record");
      return { id: a.id, record, boundaryAt: a.boundary_at, initialActivity: activity };
    },
    async save(actor, scope, id, record) {
      const b = readBook1Baseline(record);
      if (!b || b.id !== id || b.parentId !== scope.parentId || b.childId !== scope.childId || b.runId !== scope.runId || b.draftId !== scope.draftId) return "conflict";
      const a = await sql.command(args("save", actor, scope, id, record));
      if (!object(a)) throw Error("baseline-sql-answer");
      if (a.status === "refused" && typeof a.reason === "string") return { refused: a.reason };
      if (!["saved", "duplicate", "conflict", "unavailable"].includes(String(a.status))) throw Error("baseline-sql-answer");
      return a.status as "saved" | "duplicate" | "conflict" | "unavailable";
    },
  };
}

/** The source loader's Book 1 port: the baseline, its boundary and the complete ledger, in one SQL read. */
export interface Book1SourceReader { read(request: WorkbookPreviewRequest): Promise<FrozenBook1Sources | null> }
export function book1SourceReader(sql: Book1BaselineSql): Book1SourceReader {
  return { async read(r) {
    const a = await sql.sources({ p_parent: r.parentId, p_child: r.childId, p_workbook: r.workbookId });
    if (!object(a)) throw Error("book1-sources-answer");
    if (a.status === "missing") return null;
    const activity = counts(a.initial_activity);
    if (a.status !== "found" || typeof a.id !== "string" || typeof a.payload !== "string" || typeof a.hash !== "string" || typeof a.boundary_at !== "string"
      || !activity || !Number.isSafeInteger(a.count) || !Array.isArray(a.rows) || a.rows.length > 20_000) throw Error("book1-sources-answer");
    return { version: 1, baseline: { id: a.id, payload: a.payload, hash: a.hash },
      corrections: { baselineId: a.id, boundaryAt: a.boundary_at, initialActivity: activity, count: a.count as number, rows: a.rows as SecondTryRow[] } };
  } };
}

/** #471's seam: the marking lane records a child's written second try here. This lane adds no caller. */
export interface SecondTryLedger {
  record(o: { id: string; baselineId: string; itemRowId: string; basedOnVersion: number; result: "right" | "wrong" | "blank";
    help: "none" | "math-help" | "unknown"; evidenceReference: string }): Promise<"saved" | "duplicate" | "conflict" | "refused">;
}
export function secondTryLedger(sql: Book1BaselineSql): SecondTryLedger {
  return { async record(o) {
    if (![o.id, o.baselineId, o.itemRowId].every(isUuid) || !Number.isSafeInteger(o.basedOnVersion) || o.basedOnVersion < 1 || !o.evidenceReference.trim()) return "refused";
    const a = await sql.secondTry({ p_id: o.id, p_baseline: o.baselineId, p_item_row: o.itemRowId, p_based_on_version: o.basedOnVersion,
      p_result: o.result, p_help: o.help, p_evidence_reference: o.evidenceReference });
    if (!object(a) || !["saved", "duplicate", "conflict", "refused"].includes(String(a.status))) throw Error("second-try-sql-answer");
    return a.status as "saved" | "duplicate" | "conflict" | "refused";
  } };
}

export interface Book1CaptureDeps {
  /** The run's draft at its current revision, as approval reads it (workbookShipStore(db).draftForApproval). Read only. */
  draft(runId: string): Promise<DraftForApproval | null>;
  /** The run's stored frame row. Read only. */
  frame(runId: string): Promise<{ reference: string; createdAt: string; frame: RunFrame } | null>;
  /** Only for a frame with no planning capture: the frozen sources and the pinned planner of the frame's build. */
  recovery?: { sources(runId: string): Promise<Book1RecoverySources | null>; engine(pin: string): Promise<PinnedPlanningEngine | null> };
  repository: Book1BaselineRepository;
}
export type Book1CaptureResult = { status: "saved" | "duplicate"; baseline: StoredBook1Baseline }
  | { status: "refused"; reason: string };

/**
 * Captures one child's Book 1 baseline at the final revision the admin reviewed (`revision`). It reads, proves and saves;
 * it never writes a draft, a rendering, a question, a workbook row, an approval or a print mark.
 */
export async function captureBook1Baseline(deps: Book1CaptureDeps, o: { id: string; actorId: string; parentId: string; childId: string; runId: string; revision: number }): Promise<Book1CaptureResult> {
  const refuse = (reason: string): Book1CaptureResult => ({ status: "refused", reason });
  if (![o.id, o.actorId, o.parentId, o.childId, o.runId].every(isUuid) || !Number.isSafeInteger(o.revision)) return refuse("invalid-request");
  const final = await deps.draft(o.runId);
  if (!final) return refuse("draft-not-found");
  if (final.revision !== o.revision) return refuse("revision-changed");
  const framed = await deps.frame(o.runId);
  if (!framed) return refuse("frame-not-found");
  let planning: Book1PlanningProof;
  const captured = proveBook1PlanningCapture(framed.frame, framed.reference);
  if (captured.ok) planning = captured.proof;
  else if (captured.reason !== "planning-capture-missing") return refuse(`planning-${captured.reason}`);
  else {
    if (!deps.recovery) return refuse("planning-recovery-unavailable");
    const sources = await deps.recovery.sources(o.runId);
    if (!sources) return refuse("planning-recovery-sources-missing");
    const build = framed.frame.versions.build;
    const engine = build ? await deps.recovery.engine(build) : null;
    const recovered = recoverBook1PlanningInput(sources, engine);
    if (!recovered.ok) return refuse(`recovery-${recovered.reason satisfies Book1RecoveryRefusal}`);
    planning = recovered.proof;
  }
  const made = createBook1Baseline({ id: o.id, parentId: o.parentId, childId: o.childId, final, frame: framed.frame, planning });
  if (!made.ok) return refuse(made.reason);
  const scope = { parentId: o.parentId, childId: o.childId, runId: o.runId, draftId: final.draftId };
  const status = await deps.repository.save(o.actorId, scope, o.id, made.record);
  if (typeof status === "object") return refuse(status.refused);
  if (status !== "saved" && status !== "duplicate") return refuse(status);
  // Read back through the saved contract: a successful call alone is not storage proof.
  const saved = await deps.repository.read(o.actorId, scope, o.id);
  if (!saved || saved.record.payload !== made.record.payload || saved.record.hash !== made.record.hash) return refuse("saved-baseline-unavailable");
  return { status, baseline: saved };
}
