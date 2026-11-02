import type { SupabaseClient } from "@supabase/supabase-js";
import { isGrade } from "@/lib/assessment";
import { readChildProfile } from "@/lib/child-profile";
import { childProfileStore } from "@/lib/child-profile-store";
import { toJson, type Database, type Tables } from "@/lib/database";
import { draftProblem, GENERATED_DRAFT_VERSION } from "@/lib/workbook-generator";
import { readPaged, SLOT_ATTEMPTS, type WorkbookJobSource, type WorkbookRun, type WorkbookRunStore } from "@/lib/workbook-job";
import type { SolveVerdict } from "@/lib/workbook-solve-check";

// The runs' store (#312) in Supabase (migration add_workbook_runs), and the job's read of the child. Pass a client with
// the secret key: the service role runs the run functions and the progress update; admins only read. The solve checks
// (migration workbook_run_solves) are stored through save_workbook_run_solves, and each AI call of a page (migration
// workbook_run_calls) through save_workbook_run_call; a solve check with a call key is stored once per key, and the
// run's plan (migration workbook_run_frames, R379-8-1 and R379-8-2) through save_workbook_run_frame. The functions
// hold the rules (one active run per child, stale runs stopped, every write held by the lease, the audit entries);
// tests use src/lib/workbook-job-memory.ts, which keeps the same rules. No Next.js or React.

export const RUN_COLUMNS = "id, created_at, parent_id, child_id, number, status, step, attempts, max_attempts, done_pages, total_pages, heartbeat_at, started_at, finished_at, error, errors, draft_id, draft_key, resumes, started_by, started_by_email";

type RunRow = Pick<Tables<"workbook_runs">, "id" | "created_at" | "parent_id" | "child_id" | "number" | "status" | "step" | "attempts" | "max_attempts"
  | "done_pages" | "total_pages" | "heartbeat_at" | "started_at" | "finished_at" | "error" | "errors" | "draft_id" | "draft_key" | "resumes" | "started_by" | "started_by_email">;

export const runFromRow = (r: RunRow): WorkbookRun => ({
  id: r.id, createdAt: r.created_at, parentId: r.parent_id, childId: r.child_id, number: r.number, status: r.status, step: r.step,
  attempts: r.attempts, maxAttempts: r.max_attempts, donePages: r.done_pages, totalPages: r.total_pages, heartbeatAt: r.heartbeat_at,
  startedAt: r.started_at, finishedAt: r.finished_at, error: r.error, errors: r.errors, draftId: r.draft_id, draftKey: r.draft_key, resumes: r.resumes,
  startedBy: { id: r.started_by, email: r.started_by_email },
});

/** A stored verdict as the generator reads it, or null when it is of another shape. */
function solveVerdict(x: unknown): SolveVerdict | null {
  const v = x as { status?: unknown; reason?: unknown } | null;
  if (v?.status === "agreed") return { status: "agreed" };
  if ((v?.status === "disagreed" || v?.status === "failed") && typeof v.reason === "string") return { status: v.status, reason: v.reason };
  return null;
}

function must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`workbook run ${what}: ${r.error.message}`);
  return r.data;
}

export function workbookRunStore(admin: SupabaseClient<Database>): WorkbookRunStore {
  const run = async (id: string) => {
    const data = must(await admin.from("workbook_runs").select(RUN_COLUMNS).eq("id", id).maybeSingle(), "load");
    return data ? runFromRow(data) : null;
  };
  return {
    async start(childId, by, o) {
      const { data, error } = await admin.rpc("start_workbook_run", {
        p_child: childId, p_by: by.id, p_by_email: by.email, p_max_attempts: o.maxAttempts, p_stale_seconds: o.staleSeconds,
      });
      if (error?.code === "55000") return { status: "refused", reason: "the family is being deleted" };
      if (error) throw new Error(`workbook run start: ${error.message}`);
      const answer = data as { status: "started" | "busy" | "stalled"; run: string } | { status: "refused"; reason: string };
      return answer.status === "refused" ? answer : { status: answer.status, runId: answer.run };
    },
    async claim(id, lease) {
      const claimed = must(await admin.rpc("claim_workbook_run", { p_run: id, p_lease: lease }), "claim");
      return claimed ? run(id) : null;
    },
    async resume(id, lease, staleSeconds) {
      const taken = must(await admin.rpc("resume_workbook_run", { p_run: id, p_lease: lease, p_stale_seconds: staleSeconds }), "resume") === true;
      return taken ? run(id) : null;
    },
    async yield(id, lease) {
      return must(await admin.rpc("yield_workbook_run", { p_run: id, p_lease: lease }), "yield") === true;
    },
    async attempts(id) {
      // Ordered and paged (R379-3-1): one request answers at most 1000 rows.
      const rows = await readPaged(async (from, to) =>
        must(await admin.from("workbook_run_attempts").select("page, slot, attempts").eq("run_id", id).order("page").order("slot").range(from, to), "attempts load") ?? []);
      return new Map(rows.map((r) => [`${r.page}:${r.slot}`, r.attempts]));
    },
    async useAttempts(id, lease, page, slots) {
      const answer = must(await admin.rpc("count_workbook_run_attempts", { p_run: id, p_lease: lease, p_page: page, p_slots: slots, p_max: SLOT_ATTEMPTS }), "attempts use") as { refused: string[] } | null;
      return answer ? { refused: answer.refused } : null;
    },
    async pages(id) {
      const rows = must(await admin.from("workbook_run_pages").select("page").eq("run_id", id).order("number"), "pages load") ?? [];
      return rows.map((r) => r.page);
    },
    async calls(id, pages) {
      if (pages.length === 0) return [];
      const rows = await readPaged(async (from, to) =>
        must(await admin.from("workbook_run_calls").select("page, seq, call").eq("run_id", id).in("page", pages).order("page").order("seq").range(from, to), "calls load") ?? [], 100);
      return rows.map((r) => ({ page: r.page, seq: r.seq, call: r.call }));
    },
    async saveCall(id, lease, page, seq, call) {
      return must(await admin.rpc("save_workbook_run_call", { p_run: id, p_lease: lease, p_page: page, p_seq: seq, p_call: toJson(call) }), "call save") === true;
    },
    async saveSolves(id, lease, solves) {
      return must(await admin.rpc("save_workbook_run_solves", { p_run: id, p_lease: lease, p_logs: toJson(solves) }), "solve checks save") === true;
    },
    async solves(id) {
      const rows = await readPaged(async (from, to) =>
        must(await admin.from("workbook_run_solves").select("call_key, verdict:log->verdict").eq("run_id", id).not("call_key", "is", null).order("call_key").range(from, to), "solve checks load") ?? []);
      const verdicts = new Map<string, SolveVerdict>();
      for (const r of rows) {
        const v = solveVerdict(r.verdict);
        if (r.call_key && v) verdicts.set(r.call_key, v);
      }
      return verdicts;
    },
    async frame(id) {
      const row = must(await admin.from("workbook_run_frames").select("frame").eq("run_id", id).maybeSingle(), "plan load");
      return row?.frame ?? null;
    },
    async saveFrame(id, lease, frame) {
      return must(await admin.rpc("save_workbook_run_frame", { p_run: id, p_lease: lease, p_frame: toJson(frame) }), "plan save") === true;
    },
    async savePage(id, lease, page) {
      return must(await admin.rpc("save_workbook_run_page", { p_run: id, p_lease: lease, p_number: page.number, p_page: toJson(page) }), "page save") === true;
    },
    async progress(id, lease, p) {
      const patch: Database["public"]["Tables"]["workbook_runs"]["Update"] = { step: p.step, heartbeat_at: new Date().toISOString() };
      if (p.done !== undefined) patch.done_pages = p.done;
      if (p.total !== undefined) patch.total_pages = p.total;
      const rows = must(await admin.from("workbook_runs").update(patch).eq("id", id).eq("lease", lease).eq("status", "running").select("id"), "progress");
      return (rows ?? []).length > 0;
    },
    async saveDraft(id, lease, draft) {
      const problem = draftProblem(draft);
      if (problem) return { refused: problem };
      const { data, error } = await admin.rpc("save_workbook_run_draft", {
        p_run: id, p_lease: lease, p_draft: toJson(draft), p_number: draft.number, p_levels: draft.levels, p_model: draft.model,
        p_profile_build: draft.profileBuild, p_schema_version: GENERATED_DRAFT_VERSION, p_pages: draft.counts.pages,
        p_questions: draft.counts.questions, p_failed: draft.counts.failed, p_not_checked: draft.counts.notChecked,
        p_failed_pages: draft.counts.failedPages,
      });
      if (error?.code === "55000") return { refused: "the family is being deleted" };
      if (error) throw new Error(`workbook run draft save: ${error.message}`);
      if (data === "saved" || data === "lost" || data === "used") return data;
      throw new Error(`workbook run draft save: unknown answer ${String(data)}`);
    },
    async retry(id, lease, error) {
      return must(await admin.rpc("retry_workbook_run", { p_run: id, p_lease: lease, p_error: error }), "retry") === true;
    },
    async fail(id, lease, error) {
      return must(await admin.rpc("fail_workbook_run", { p_run: id, p_lease: lease, p_error: error }), "fail") === true;
    },
    async finish(id, lease, f) {
      return must(await admin.rpc("finish_workbook_run", {
        p_run: id, p_lease: lease, p_draft: f.draftId, p_rendering: f.rendering ? toJson(f.rendering) : null, p_render_problems: toJson(f.problems),
      }), "finish") === true;
    },
    run,
  };
}

/** The child as the job reads it: grade, curriculum, current profile and stored workbooks, with the secret key. */
export function workbookJobSource(admin: SupabaseClient<Database>): WorkbookJobSource {
  return {
    async inputs(childId) {
      const [child, books, profile] = await Promise.all([
        admin.from("children").select("parent_id, first_name, grade, province").eq("id", childId).maybeSingle(),
        admin.from("workbooks").select("number, levels").eq("child_id", childId),
        readChildProfile(childProfileStore(admin), childId),
      ]);
      const row = must(child, "child load");
      if (!row) return null;
      if (!isGrade(row.grade)) throw new Error(`workbook run child load: grade ${row.grade} is not K to 9`);
      return {
        parentId: row.parent_id, name: row.first_name, grade: row.grade, province: row.province,
        profile: profile ? { revision: profile.revision, profile: profile.profile } : null,
        workbooks: must(books, "workbooks load") ?? [],
      };
    },
  };
}
