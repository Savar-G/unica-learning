import type { SupabaseClient } from "@supabase/supabase-js";
import { isGrade } from "@/lib/assessment";
import { readChildProfile } from "@/lib/child-profile";
import { childProfileStore } from "@/lib/child-profile-store";
import { toJson, type Database, type Tables } from "@/lib/database";
import type { WorkbookJobSource, WorkbookRun, WorkbookRunStore } from "@/lib/workbook-job";

// The runs' store (#312) in Supabase (migration add_workbook_runs), and the job's read of the child. Pass a client with
// the secret key: the service role runs the run functions and the progress update; admins only read. The functions
// hold the rules (one active run per child, stale runs stopped, every write held by the lease, the audit entries);
// tests use src/lib/workbook-job-memory.ts, which keeps the same rules. No Next.js or React.

export const RUN_COLUMNS = "id, created_at, parent_id, child_id, number, status, step, attempts, max_attempts, done_pages, total_pages, heartbeat_at, started_at, finished_at, error, errors, draft_id, started_by, started_by_email";

type RunRow = Pick<Tables<"workbook_runs">, "id" | "created_at" | "parent_id" | "child_id" | "number" | "status" | "step" | "attempts" | "max_attempts"
  | "done_pages" | "total_pages" | "heartbeat_at" | "started_at" | "finished_at" | "error" | "errors" | "draft_id" | "started_by" | "started_by_email">;

export const runFromRow = (r: RunRow): WorkbookRun => ({
  id: r.id, createdAt: r.created_at, parentId: r.parent_id, childId: r.child_id, number: r.number, status: r.status, step: r.step,
  attempts: r.attempts, maxAttempts: r.max_attempts, donePages: r.done_pages, totalPages: r.total_pages, heartbeatAt: r.heartbeat_at,
  startedAt: r.started_at, finishedAt: r.finished_at, error: r.error, errors: r.errors, draftId: r.draft_id,
  startedBy: { id: r.started_by, email: r.started_by_email },
});

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
      const answer = data as { status: "started" | "busy"; run: string } | { status: "refused"; reason: string };
      return answer.status === "refused" ? answer : { status: answer.status, runId: answer.run };
    },
    async claim(id, lease) {
      const claimed = must(await admin.rpc("claim_workbook_run", { p_run: id, p_lease: lease }), "claim");
      return claimed ? run(id) : null;
    },
    async progress(id, lease, p) {
      const patch: Database["public"]["Tables"]["workbook_runs"]["Update"] = { step: p.step, heartbeat_at: new Date().toISOString() };
      if (p.done !== undefined) patch.done_pages = p.done;
      if (p.total !== undefined) patch.total_pages = p.total;
      const rows = must(await admin.from("workbook_runs").update(patch).eq("id", id).eq("lease", lease).eq("status", "running").select("id"), "progress");
      return (rows ?? []).length > 0;
    },
    async held(id, lease) {
      return must(await admin.rpc("workbook_run_held", { p_run: id, p_lease: lease }), "lease check") === true;
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
        admin.from("children").select("parent_id, grade, province").eq("id", childId).maybeSingle(),
        admin.from("workbooks").select("number, levels").eq("child_id", childId),
        readChildProfile(childProfileStore(admin), childId),
      ]);
      const row = must(child, "child load");
      if (!row) return null;
      if (!isGrade(row.grade)) throw new Error(`workbook run child load: grade ${row.grade} is not K to 9`);
      return {
        parentId: row.parent_id, grade: row.grade, province: row.province,
        profile: profile ? { revision: profile.revision, profile: profile.profile } : null,
        workbooks: must(books, "workbooks load") ?? [],
      };
    },
  };
}
