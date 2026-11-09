// Supabase adapter of NextBookSnapshotStore (#476). Service role only: the SQL functions own every decision, lock and
// refusal (supabase/migrations/20261109050245_next_book_snapshots.sql). This file maps rows and answers, and reads.
// The caller authorizes the session; the service client is not caller authorization.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database";
import type { AdmitAnswer, FrozenPayload, HoldAnswer, NextBookSnapshotRecord, NextBookSnapshotStore, SavedPlan, SnapshotEvidence,
  SnapshotReason, StoreAnswer } from "./next-book-snapshot";
import { itemKey, plainJson } from "./next-book-snapshot";

type Row = Database["public"]["Tables"]["next_book_snapshots"]["Row"];
const PAGE = 1000, MAX_ROWS = 20_000, CHUNK = 100;
const REASONS: readonly SnapshotReason[] = ["day7_scanned", "delivery_backstop", "admin_prepare"];
function shape(): never { throw new Error("next_book_snapshot_shape"); }
const time = (v: unknown): number => {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : shape();
};
const json = (v: unknown): Json => plainJson(v) as Json;

/** A row from the table or from a function's to_jsonb answer: the same snake_case columns. */
export function snapshotRecord(raw: unknown): NextBookSnapshotRecord {
  const r = raw as Row | null;
  if (!r || typeof r !== "object" || typeof r.id !== "string" || !REASONS.includes(r.trigger_reason as SnapshotReason)
    || !Number.isSafeInteger(r.revision) || !Array.isArray(r.receipt_ids)) shape();
  const frozen = r.frozen_at === null ? null : {
    frozenAt: (r.scope as { cutoff?: number } | null)?.cutoff ?? shape(),
    scope: r.scope, sources: r.sources, historyFence: r.history_fence, snapshot: r.progress_snapshot, history: r.progress_history,
    ledger: r.consumed_ledger, pending: r.pending_items, held: r.held_for_later,
  } as unknown as FrozenPayload;
  const plan = r.plan_hash === null ? null : { planHash: r.plan_hash, planInput: r.plan_input, consumed: r.planner_consumed,
    held: r.planner_held } as unknown as SavedPlan;
  return { id: r.id, triggerId: r.trigger_id, reason: r.trigger_reason as SnapshotReason, parentId: r.parent_id, childId: r.child_id,
    workbookId: r.workbook_id, number: r.number, printedRevision: r.printed_revision, triggerAt: time(r.trigger_at),
    prepareFrom: time(r.prepare_from), revision: r.revision, draftId: r.draft_id, receiptIds: r.receipt_ids,
    deliveryAuditId: r.delivery_audit_id,
    held: r.held_reason === null ? null : { reason: "no-accepted-scans-at-backstop", at: time(r.held_at) },
    actor: r.actor_id === null ? null : { id: r.actor_id, email: r.actor_email },
    frozen, snapshotHash: r.snapshot_hash, plan, runId: r.run_id, createdAt: time(r.created_at) };
}

type Answer = { status?: string; reason?: string; snapshot?: unknown; run?: string; existing?: boolean };
function answer(data: unknown, error: { code?: string; message: string } | null): Answer {
  // The family write fence and the plan fences raise 55000; the family is being deleted or the plan forbids a book.
  if (error?.code === "55000") return { status: "refused", reason: error.message.includes("family") ? "family-unavailable" : error.message };
  if (error) throw new Error(`next book snapshot: ${error.message}`);
  if (!data || typeof data !== "object" || typeof (data as Answer).status !== "string") shape();
  return data as Answer;
}
function stored(a: Answer): StoreAnswer {
  if (a.status === "ok") return { status: "ok", snapshot: snapshotRecord(a.snapshot) };
  if (a.status === "refused" && typeof a.reason === "string") return { status: "refused", reason: a.reason };
  return shape();
}

async function paged<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await load(from, from + PAGE - 1);
    if (error || !Array.isArray(data)) throw new Error("next_book_snapshot_read");
    rows.push(...data);
    if (rows.length > MAX_ROWS) throw new Error("next_book_snapshot_read_bound");
    if (data.length < PAGE) return rows;
  }
}
const chunks = <T>(list: readonly T[]) => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));

export function nextBookSnapshotStore(db: SupabaseClient<Database>): NextBookSnapshotStore {
  async function read(id: string) {
    const { data, error } = await db.from("next_book_snapshots").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`next book snapshot read: ${error.message}`);
    return data ? snapshotRecord(data) : null;
  }
  return {
    async claim(source) {
      const by = "triggerId" in source ? null : source.actor;
      const { data, error } = await db.rpc("claim_next_book_snapshot", { p_trigger: "triggerId" in source ? source.triggerId : null,
        p_book: "workbookId" in source ? source.workbookId : null, p_actor: by?.id ?? null, p_email: by?.email ?? null });
      return stored(answer(data, error));
    },
    async hold(workbookId, deliveryAuditId): Promise<HoldAnswer> {
      const { data, error } = await db.rpc("hold_next_book_snapshot", { p_book: workbookId, p_delivery_audit: deliveryAuditId });
      const a = answer(data, error);
      return a.status === "held" ? { status: "held", snapshot: snapshotRecord(a.snapshot) } : stored(a);
    },
    async save(id, frozen, hash) {
      const { data, error } = await db.rpc("save_next_book_snapshot", { p_id: id, p_data: json(frozen), p_hash: hash });
      return stored(answer(data, error));
    },
    async savePlan(id, plan) {
      const p = plainJson(plan);
      const { data, error } = await db.rpc("save_next_book_plan", { p_snapshot: id, p_plan_input: json(p.planInput), p_plan_hash: p.planHash,
        p_consumed: json(p.consumed), p_held: json(p.held) });
      return stored(answer(data, error));
    },
    async retake(id, draftId, actor) {
      const { data, error } = await db.rpc("retake_next_book_snapshot", { p_snapshot: id, p_draft: draftId, p_actor: actor.id, p_email: actor.email });
      return stored(answer(data, error));
    },
    async admit(id, by, limits): Promise<AdmitAnswer> {
      const { data, error } = await db.rpc("admit_next_book_run", { p_snapshot: id, p_by: by?.id ?? null, p_email: by?.email ?? null,
        p_max_attempts: limits.maxAttempts, p_stale_seconds: limits.staleSeconds, p_test_only: limits.testOnly ?? false });
      const a = answer(data, error);
      if (a.status === "started" && typeof a.run === "string") return { status: "started", runId: a.run, existing: a.existing === true };
      if ((a.status === "busy" || a.status === "stalled") && typeof a.run === "string") return { status: a.status, runId: a.run };
      if (a.status === "refused" && typeof a.reason === "string") return { status: "refused", reason: a.reason };
      return shape();
    },
    read,
    async latestForDraft(draftId) {
      const run = await db.from("workbook_runs").select("snapshot_id").eq("draft_id", draftId).not("snapshot_id", "is", null).maybeSingle();
      if (run.error) throw new Error(`next book snapshot draft read: ${run.error.message}`);
      const first = run.data?.snapshot_id ? await read(run.data.snapshot_id) : null;
      if (!first) return null;
      const latest = await db.from("next_book_snapshots").select("*").eq("workbook_id", first.workbookId).is("held_reason", null)
        .order("revision", { ascending: false }).limit(1).maybeSingle();
      if (latest.error) throw new Error(`next book snapshot chain read: ${latest.error.message}`);
      return latest.data ? snapshotRecord(latest.data) : null;
    },
    async jobs(id) {
      const s = await read(id);
      if (!s) return [];
      const photos: string[] = [];
      for (const ids of chunks(s.receiptIds)) {
        const r = await db.from("workbook_scan_receipts").select("id,photo_revision").in("id", ids);
        if (r.error || !r.data) throw new Error("next_book_snapshot_receipts_read");
        photos.push(...r.data.map(x => x.photo_revision));
      }
      const states: ("finished" | "waiting")[] = [];
      for (const ids of chunks(photos)) {
        const r = await db.from("scan_marking_jobs").select("photo_id,state").in("photo_id", ids);
        if (r.error || !r.data) throw new Error("next_book_snapshot_jobs_read");
        // A job blocked by the price, the budget or a missing key still waits: only the deadline ends that wait.
        states.push(...r.data.map(j => j.state === "finished" ? "finished" as const : "waiting" as const));
      }
      return states;
    },
    async evidence(id): Promise<SnapshotEvidence[]> {
      const s = await read(id);
      if (!s) return [];
      const pages = await paged((from, to) => db.from("workbook_pages").select("id,print_contract")
        .eq("parent_id", s.parentId).eq("workbook_id", s.workbookId).order("id").range(from, to));
      const days = new Map<string, number>();
      for (const p of pages) {
        const day = (p.print_contract as { day?: unknown } | null)?.day;
        if (typeof day === "number" && Number.isSafeInteger(day)) days.set(p.id, day);
      }
      const items = await paged((from, to) => db.from("scan_marking_items").select("id,page_id,item_id,printed_revision,result_version,observation")
        .eq("parent_id", s.parentId).eq("workbook_id", s.workbookId).eq("printed_revision", s.printedRevision).order("id").range(from, to));
      return items.flatMap(m => {
        const state = (m.observation as { state?: unknown } | null)?.state, day = days.get(m.page_id);
        if (day === undefined || state === "pending" || state === "parent-pending") return [];
        return [{ key: itemKey({ workbookId: s.workbookId, printedRevision: m.printed_revision, pageId: m.page_id, itemId: m.item_id }),
          version: m.result_version, day, pageId: m.page_id }];
      });
    },
  };
}
