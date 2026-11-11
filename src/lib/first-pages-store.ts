// The first pages' store in Supabase (docs/first-pages.md, migration workbook_first_pages). Pass a client with the
// secret key: the functions hold the rules (one set per test, every write held by the lease, the first value at a key
// stays, a claim counts an attempt); tests use src/lib/first-pages-memory.ts, which keeps the same rules. No Next.js.
import type { SupabaseClient } from "@supabase/supabase-js";
import { toJson, type Database, type Json, type Tables } from "@/lib/database";
import type { FirstPagesResult, FirstPagesRow, FirstPagesStatus, FirstPagesStore } from "@/lib/first-pages";
import type { GeneratedPage, StoredCall } from "@/lib/workbook-generator";
import type { RunError, RunFrame, RunRunner, RunSolve } from "@/lib/workbook-job";
import type { SolveVerdict } from "@/lib/workbook-solve-check";

const COLUMNS = "id, created_at, assessment_id, parent_id, child_id, workbook_id, status, runner, attempts, max_attempts, heartbeat_at, ready_at, error, errors, frame, result, kept_by, decision";
type Row = Pick<Tables<"workbook_first_pages">, "id" | "created_at" | "assessment_id" | "parent_id" | "child_id" | "workbook_id" | "status" | "runner"
  | "attempts" | "max_attempts" | "heartbeat_at" | "ready_at" | "error" | "errors" | "frame" | "result" | "kept_by" | "decision">;

function must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`first pages ${what}: ${r.error.message}`);
  return r.data;
}

export const firstPagesFromRow = (r: Row): FirstPagesRow => ({
  id: r.id, assessmentId: r.assessment_id, parentId: r.parent_id, childId: r.child_id, workbookId: r.workbook_id,
  status: r.status as FirstPagesStatus, runner: r.runner as RunRunner, attempts: r.attempts, maxAttempts: r.max_attempts,
  createdAt: r.created_at, heartbeatAt: r.heartbeat_at, readyAt: r.ready_at, error: r.error, errors: (r.errors as unknown as RunError[]) ?? [],
  frame: r.frame as unknown as RunFrame | null, result: r.result as unknown as FirstPagesResult | null, keptBy: r.kept_by,
  decision: r.decision === "keep-plan" || r.decision === "drop" ? r.decision : null,
});

/** A stored verdict as the generator reads it, or null when it is of another shape. */
function verdictOf(x: unknown): SolveVerdict | null {
  const v = x as { status?: unknown; reason?: unknown } | null;
  if (v?.status === "agreed") return { status: "agreed" };
  if ((v?.status === "disagreed" || v?.status === "failed") && typeof v.reason === "string") return { status: v.status, reason: v.reason };
  return null;
}

export function firstPagesStore(admin: SupabaseClient<Database>): FirstPagesStore {
  const part = async (id: string, lease: string, p: "frame" | "page" | "call" | "solve", key: string, value: Json) =>
    must(await admin.rpc("save_workbook_first_pages_part", { p_id: id, p_lease: lease, p_part: p, p_key: key, p_value: value }), `${p} save`) === true;
  const work = async (id: string) => {
    const row = must(await admin.from("workbook_first_pages").select("pages, calls, slot_attempts, solves").eq("id", id).maybeSingle(), "work load");
    return {
      pages: (row?.pages ?? {}) as unknown as Record<string, GeneratedPage>,
      calls: (row?.calls ?? {}) as unknown as Record<string, StoredCall>,
      attempts: (row?.slot_attempts ?? {}) as unknown as Record<string, number>,
      solves: (row?.solves ?? {}) as unknown as Record<string, RunSolve>,
    };
  };
  const get = async (id: string) => {
    const row = must(await admin.from("workbook_first_pages").select(COLUMNS).eq("id", id).maybeSingle(), "load");
    return row ? firstPagesFromRow(row) : null;
  };
  return {
    get,
    async claim(id, lease, runner, staleSeconds) {
      const taken = must(await admin.rpc("claim_workbook_first_pages", { p_id: id, p_lease: lease, p_runner: runner, p_stale_seconds: staleSeconds }), "claim") === true;
      return taken ? get(id) : null;
    },
    async renew(id, lease) {
      return must(await admin.rpc("renew_workbook_first_pages", { p_id: id, p_lease: lease }).abortSignal(AbortSignal.timeout(10_000)), "renew") === true;
    },
    saveFrame: (id, lease, frame) => part(id, lease, "frame", "frame", toJson(frame)),
    async pages(id) {
      return Object.values((await work(id)).pages).sort((a, b) => a.number - b.number);
    },
    savePage: (id, lease, page) => part(id, lease, "page", String(page.number), toJson(page)),
    async attempts(id) {
      return new Map(Object.entries((await work(id)).attempts));
    },
    async useAttempts(id, lease, page, slots, max) {
      const answer = must(await admin.rpc("count_workbook_first_pages_attempts", { p_id: id, p_lease: lease, p_page: page, p_slots: slots, p_max: max }), "attempts use") as { refused?: string[] } | null;
      return answer ? { refused: answer.refused ?? [] } : null;
    },
    async calls(id, pages) {
      const wanted = new Set(pages);
      return Object.entries((await work(id)).calls).map(([key, call]) => ({ page: Number(key.split(":")[0]), seq: Number(key.split(":")[1]), call }))
        .filter((c) => wanted.has(c.page)).sort((a, b) => a.page - b.page || a.seq - b.seq);
    },
    saveCall: (id, lease, page, seq, call) => part(id, lease, "call", `${page}:${seq}`, toJson(call)),
    async solves(id) {
      const out = new Map<string, SolveVerdict>();
      for (const [key, s] of Object.entries((await work(id)).solves)) {
        const v = verdictOf(s.log?.verdict);
        if (v) out.set(key, v);
      }
      return out;
    },
    saveSolve: (id, lease, solve) => part(id, lease, "solve", solve.callKey, toJson(solve)),
    async solveCosts(id) {
      const all = Object.values((await work(id)).solves);
      const known = all.map((s) => s.usd).filter((x): x is number => typeof x === "number");
      return { count: all.length, usd: known.length ? known.reduce((a, b) => a + b, 0) : null };
    },
    async finish(id, lease, result, calls) {
      return must(await admin.rpc("finish_workbook_first_pages", { p_id: id, p_lease: lease, p_result: toJson(result), p_ai_calls: toJson(calls) }), "finish") === true;
    },
    async end(id, lease, o) {
      return must(await admin.rpc("end_workbook_first_pages", { p_id: id, p_lease: lease, p_outcome: o.outcome, p_error: o.error, p_ai_calls: toJson(o.calls) }), "end") === true;
    },
  };
}

/** What queuing a test answered. */
export type QueueAnswer = { status: "queued" | "exists"; id: string } | { status: "refused"; reason: string };

/** Queues the first pages of a finished test after the database's checks (queue_workbook_first_pages). */
export async function queueFirstPages(admin: SupabaseClient<Database>, assessmentId: string, o: { runner: RunRunner; by: "report" | "admin" }): Promise<QueueAnswer> {
  const answer = must(await admin.rpc("queue_workbook_first_pages", { p_assessment: assessmentId, p_runner: o.runner, p_by: o.by }), "queue") as { status?: string; id?: string; reason?: string } | null;
  if ((answer?.status === "queued" || answer?.status === "exists") && answer.id) return { status: answer.status, id: answer.id };
  return { status: "refused", reason: answer?.reason ?? "the database gave no answer" };
}

/** The test's set, or null. */
export async function firstPagesOfTest(admin: SupabaseClient<Database>, assessmentId: string): Promise<FirstPagesRow | null> {
  const row = must(await admin.from("workbook_first_pages").select(COLUMNS).eq("assessment_id", assessmentId).maybeSingle(), "test load");
  return row ? firstPagesFromRow(row) : null;
}

/** The child's sets, newest first, for the admin. */
export async function firstPagesOfChild(admin: SupabaseClient<Database>, childId: string): Promise<FirstPagesRow[]> {
  const rows = must(await admin.from("workbook_first_pages").select(COLUMNS).eq("child_id", childId).order("created_at", { ascending: false }).limit(10), "child load") ?? [];
  return rows.map(firstPagesFromRow);
}

/** The admin's choice after Workbook 1's plan stopped matching (decide_workbook_first_pages). */
export async function decideFirstPages(admin: SupabaseClient<Database>, id: string, decision: "keep-plan" | "drop", by: { id: string; email: string }): Promise<"decided" | "not_found" | { refused: string }> {
  const answer = must(await admin.rpc("decide_workbook_first_pages", { p_id: id, p_decision: decision, p_by: by.id, p_by_email: by.email }), "decide") as { status?: string; reason?: string } | null;
  if (answer?.status === "decided" || answer?.status === "not_found") return answer.status;
  return { refused: answer?.reason ?? "the database gave no answer" };
}

/** The Mac's or the server's sets that may be taken now, oldest first: queued, or running with no progress. */
export async function firstPagesCandidates(admin: SupabaseClient<Database>, runner: RunRunner, staleSeconds: number): Promise<string[]> {
  const rows = must(await admin.from("workbook_first_pages").select("id, status, heartbeat_at, created_at").eq("runner", runner)
    .in("status", ["queued", "running"]).order("created_at").limit(20), "candidates") ?? [];
  const cutoff = Date.now() - staleSeconds * 1000;
  return rows.filter((r) => r.status === "queued" || Date.parse(r.heartbeat_at ?? r.created_at) < cutoff).map((r) => r.id);
}
