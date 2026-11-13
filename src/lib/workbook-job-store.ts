import type { SupabaseClient } from "@supabase/supabase-js";
import { isGrade } from "@/lib/assessment";
import { toJson, type Database, type Tables } from "@/lib/database";
import { draftProblem, GENERATED_DRAFT_VERSION } from "@/lib/workbook-generator";
import { newGate, type ProviderGate, type AiCallRecord, type AiProvider } from "@/lib/ai-fallback";
import type { AiCallKind } from "@/lib/workbook-ai";
import type { FirstPagesResult } from "@/lib/first-pages";
import { firstPagesCandidates } from "@/lib/first-pages-store";
import { readPaged, SLOT_ATTEMPTS, STALE_SECONDS, type ReadyFirstPages, type RunFrame, type RunRunner, type WorkbookJobSource, type WorkbookRun, type WorkbookRunStore } from "@/lib/workbook-job";
import type { WorkerCandidate, WorkerQueue } from "@/lib/workbook-worker";
import type { SolveVerdict } from "@/lib/workbook-solve-check";
import { QUESTION_GATES, type QuestionGate } from "@/lib/workbook-gates";
import { PAGE_GATES, type PageGate, type StoredPageGate } from "@/lib/workbook-page-gates";
import type { StoredQuestionGate } from "@/lib/workbook-run-gates";
import { workbookInstructions } from "@/lib/workbook-instructions";
import { workbookPlanRefusal } from "@/lib/workbook-plan-refusal";

// The runs' store (#312) in Supabase (migration add_workbook_runs), and the job's read of the child. Pass a client with
// the secret key: the service role runs the run functions and the progress update; admins only read. The solve checks
// (migration workbook_run_solves) are stored through save_workbook_run_solves, and each AI call of a page (migration
// workbook_run_calls) through save_workbook_run_call; a solve check with a call key is stored once per key, and the
// run's plan (migration workbook_run_frames, R379-8-1 and R379-8-2) through save_workbook_run_frame. The functions
// hold the rules (one active run per child, stale runs stopped, every write held by the lease, the audit entries);
// tests use src/lib/workbook-job-memory.ts, which keeps the same rules. No Next.js or React.

export const RUN_COLUMNS = "id, created_at, parent_id, child_id, number, status, step, attempts, max_attempts, done_pages, total_pages, heartbeat_at, started_at, finished_at, error, errors, draft_id, draft_key, resumes, started_by, started_by_email, runner, stopped_by_email";

type RunRow = Pick<Tables<"workbook_runs">, "id" | "created_at" | "parent_id" | "child_id" | "number" | "status" | "step" | "attempts" | "max_attempts"
  | "done_pages" | "total_pages" | "heartbeat_at" | "started_at" | "finished_at" | "error" | "errors" | "draft_id" | "draft_key" | "resumes" | "started_by" | "started_by_email" | "runner" | "stopped_by_email">;

export const runFromRow = (r: RunRow): WorkbookRun => ({
  id: r.id, createdAt: r.created_at, parentId: r.parent_id, childId: r.child_id, number: r.number, status: r.status, step: r.step,
  attempts: r.attempts, maxAttempts: r.max_attempts, donePages: r.done_pages, totalPages: r.total_pages, heartbeatAt: r.heartbeat_at,
  startedAt: r.started_at, finishedAt: r.finished_at, error: r.error, errors: r.errors, draftId: r.draft_id, draftKey: r.draft_key, resumes: r.resumes,
  startedBy: { id: r.started_by, email: r.started_by_email }, runner: r.runner, stoppedBy: r.stopped_by_email,
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
      if (error?.code === "55000") return { status: "refused", reason: workbookPlanRefusal(error.message, "prepare") };
      if (error) throw new Error(`workbook run start: ${error.message}`);
      const answer = data as { status: "started" | "busy" | "stalled"; run: string } | { status: "refused"; reason: string };
      return answer.status === "refused" ? answer : { status: answer.status, runId: answer.run };
    },
    async claim(id, lease, runner = "server") {
      const claimed = must(await admin.rpc("claim_workbook_run", { p_run: id, p_lease: lease, p_runner: runner }), "claim");
      return claimed ? run(id) : null;
    },
    async resume(id, lease, staleSeconds, runner = "server") {
      const taken = must(await admin.rpc("resume_workbook_run", { p_run: id, p_lease: lease, p_stale_seconds: staleSeconds, p_runner: runner }), "resume") === true;
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
    async saveGates(id, lease, gates) {
      return must(await admin.rpc("save_workbook_run_gates", { p_run: id, p_lease: lease, p_rows: toJson(gates) }), "quality gates save") === true;
    },
    async gates(id) {
      const rows = await readPaged(async (from, to) =>
        must(await admin.from("workbook_run_gates").select("call_key, question_id, model, threshold_version, outcome, flags, probabilities, reason").eq("run_id", id).order("id").range(from, to), "quality gates load") ?? []);
      // (A row at "page:<page>" is the page layout gate's, #859; the others are question gates. Each keeps its own flags.)
      return rows.flatMap((r): (StoredQuestionGate | StoredPageGate)[] => {
        if (!r.call_key) return [];
        const base = { callKey: r.call_key, questionId: r.question_id, model: r.model, thresholdVersion: r.threshold_version, outcome: r.outcome, reason: r.reason };
        const probabilities = r.probabilities as Record<string, number>;
        return r.call_key.startsWith("page:")
          ? [{ ...base, flags: r.flags.filter((f): f is PageGate => (PAGE_GATES as readonly string[]).includes(f)), probabilities }]
          : [{ ...base, flags: r.flags.filter((f): f is QuestionGate => (QUESTION_GATES as readonly string[]).includes(f)), probabilities }];
      });
    },
    async frame(id) {
      const row = must(await admin.from("workbook_run_frames").select("frame").eq("run_id", id).maybeSingle(), "plan load");
      return row?.frame ?? null;
    },
    async hasStoredWork(id) {
      const results = await Promise.all([
        admin.from("workbook_run_pages").select("run_id").eq("run_id", id).limit(1),
        admin.from("workbook_run_attempts").select("run_id").eq("run_id", id).limit(1),
        admin.from("workbook_run_calls").select("run_id").eq("run_id", id).limit(1),
        admin.from("workbook_run_solves").select("run_id").eq("run_id", id).limit(1),
        admin.from("workbook_run_gates").select("run_id").eq("run_id", id).limit(1),
        admin.from("workbook_run_ai_calls").select("run_id").eq("run_id", id).limit(1),
      ]);
      if (results.map((result) => must(result, "stored work load") ?? []).some((rows) => rows.length > 0)) return true;
      // Fail closed: progress, an error history or a saved draft on the run row is also stored work (every run has a
      // draft key from its start, so the key alone is not work).
      const run = must(await admin.from("workbook_runs").select("done_pages, errors, draft_id").eq("id", id).maybeSingle(), "stored work load");
      if (!run) return true;
      return (run.done_pages ?? 0) > 0 || (Array.isArray(run.errors) && run.errors.length > 0) || run.draft_id !== null;
    },
    async saveFrame(id, lease, frame) {
      return must(await admin.rpc("save_workbook_run_frame", { p_run: id, p_lease: lease, p_frame: toJson(frame) }), "plan save") === true;
    },
    async adoptFirstPages(id, lease, firstPagesId, frame) {
      const answer = must(await admin.rpc("adopt_workbook_first_pages", { p_run: id, p_lease: lease, p_first_pages: firstPagesId, p_frame: toJson(frame) }), "first pages keep") as { status?: string; reason?: string } | null;
      if (answer?.status === "adopted") return "adopted";
      if (answer?.status === "lost") return "lost";
      return { refused: answer?.reason ?? "the database gave no answer" };
    },
    async savePage(id, lease, page) {
      return must(await admin.rpc("save_workbook_run_page", { p_run: id, p_lease: lease, p_number: page.number, p_page: toJson(page) }), "page save") === true;
    },
    async renew(id, lease) {
      return must(await admin.rpc("renew_workbook_run", { p_run: id, p_lease: lease }).abortSignal(AbortSignal.timeout(10_000)), "lease renewal") === true;
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
      if (error?.code === "55000") return { refused: workbookPlanRefusal(error.message, "draft") };
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
    async stop(id, by) {
      const answer = must(await admin.rpc("stop_workbook_run", { p_run: id, p_by: by.id, p_by_email: by.email }), "stop");
      if (answer === "stopped" || answer === "already" || answer === "done" || answer === "failed" || answer === "stale" || answer === "not_found") return answer;
      throw new Error(`workbook run stop: unknown answer ${String(answer)}`);
    },
  };
}

/** The child's display and plan inputs. The profile is prepared separately, only before a frame exists. */
export function workbookJobSource(admin: SupabaseClient<Database>, prepareProfile: WorkbookJobSource["prepareProfile"]): WorkbookJobSource {
  return {
    prepareProfile,
    firstPages: (childId) => readyFirstPages(admin, childId),
    async planningMetadata(assessmentId) {
      const [test, report] = await Promise.all([
        admin.from("assessments").select("device").eq("id", assessmentId).maybeSingle(),
        admin.from("reports").select("minutes, recommendation:model->>howWeHelp").eq("assessment_id", assessmentId).maybeSingle(),
      ]);
      const device = must(test, "plan device load")?.device ?? null;
      const row = must(report, "plan report load");
      const recommendation = row?.recommendation;
      return { device, report: { minutes: row?.minutes ?? null,
        howWeHelp: recommendation === "ahead" || recommendation === "behind" || recommendation === "on-grade" ? recommendation : null } };
    },
    async inputs(childId) {
      const [child, books, told] = await Promise.all([
        admin.from("children").select("parent_id, first_name, grade, province").eq("id", childId).maybeSingle(),
        admin.from("workbooks").select("number, levels").eq("child_id", childId),
        admin.from("workbook_instructions").select("instructions").eq("child_id", childId).maybeSingle(),
      ]);
      const row = must(child, "child load");
      if (!row) return null;
      if (!isGrade(row.grade)) throw new Error(`workbook run child load: grade ${row.grade} is not K to 9`);
      const stored = must(told, "book instructions load");
      // A stored set the code cannot read stops the run: a book made without the admin's instructions would look right.
      const instructions = stored ? workbookInstructions(stored.instructions) : null;
      if (stored && !instructions) throw new Error("workbook run child load: the book instructions cannot be read");
      return {
        parentId: row.parent_id, name: row.first_name, grade: row.grade, province: row.province,
        profile: null,
        workbooks: must(books, "workbooks load") ?? [],
        instructions,
      };
    },
  };
}

/**
 * Moves a run no one is working on to a runner (D-200, route_workbook_run): "queued", "stalled" (a running run with no
 * holder or no progress for STALE_SECONDS: the runner takes it up with resume) or null (done, failed, or being worked on).
 */
export async function routeWorkbookRun(admin: SupabaseClient<Database>, runId: string, runner: RunRunner): Promise<"queued" | "stalled" | null> {
  const answer = must(await admin.rpc("route_workbook_run", { p_run: runId, p_runner: runner, p_stale_seconds: STALE_SECONDS }), "route");
  return answer === "queued" || answer === "stalled" ? answer : null;
}

/** The Mac worker's queue (src/lib/workbook-worker.ts): its runs, and its heartbeat row (public.workbook_workers). */
export function workbookWorkerQueue(admin: SupabaseClient<Database>, worker: { id: string; build: string | null; primary: AiProvider }): WorkerQueue {
  return {
    async candidates(staleSeconds) {
      const rows = must(await admin.from("workbook_runs").select("id, status, lease, heartbeat_at, created_at").eq("runner", "mac")
        .in("status", ["queued", "running"]).order("created_at").limit(50), "worker queue") ?? [];
      const cutoff = Date.now() - staleSeconds * 1000;
      const edits = must(await admin.from("workbook_edits").select("id,status,heartbeat_at").eq("runner", "mac")
        .in("status", ["queued", "running"]).order("created_at").limit(50), "worker edit queue") ?? [];
      // The first pages of Workbook 1 (docs/first-pages.md) come after the runs: a family's book goes first.
      const first = await firstPagesCandidates(admin, "mac", staleSeconds);
      return [...edits.filter((e) => e.status === "queued" || Date.parse(e.heartbeat_at) < cutoff)
        .map((e) => ({ id: e.id, resume: e.status === "running" })), ...rows.flatMap((r): WorkerCandidate[] => {
        if (r.status === "queued") return [{ id: r.id, resume: false }];
        const quiet = r.lease === null || !r.heartbeat_at || Date.parse(r.heartbeat_at) < cutoff;
        return quiet ? [{ id: r.id, resume: true }] : [];
      }), ...first.map((id) => ({ id, resume: false }))];
    },
    async beat({ runId, started, note }) {
      // The heartbeat's foreign key names a generation run. A review batch keeps that run as its owner.
      let ownerRun = runId;
      if (runId) {
        const edit = must(await admin.from("workbook_edits").select("draft_id").eq("id", runId).maybeSingle(), "worker edit owner");
        if (edit) ownerRun = must(await admin.from("workbook_runs").select("id").eq("draft_id", edit.draft_id).maybeSingle(), "worker generation owner")?.id ?? null;
        // First pages are no run: the heartbeat names none.
        else if (must(await admin.from("workbook_first_pages").select("id").eq("id", runId).maybeSingle(), "worker first pages owner")) ownerRun = null;
      }
      must(await admin.rpc("beat_workbook_worker", {
        p_id: worker.id, p_build: worker.build, p_run: ownerRun, p_primary_ai: worker.primary, p_note: note, p_started: started,
      }), "worker heartbeat");
    },
  };
}

/** One AI call of a run as stored (public.workbook_run_ai_calls). */
export type RunAiCall = Omit<AiCallRecord, "name"> & { kind: AiCallKind };

/** Calls stored in one write. */
const AI_CALL_BATCH = 200;

/** Saves before a caller can checkpoint a result. A failed batch stays queued with the same ids. */
export function runAiCallLog(save: (calls: RunAiCall[]) => Promise<void>, o: { batch?: number } = {}) {
  const batch = o.batch ?? 1;
  const queue: RunAiCall[] = [];
  let chain: Promise<void> = Promise.resolve();
  const flush = () => {
    chain = chain.catch(() => undefined).then(async () => {
      while (queue.length) {
        const calls = queue.slice(0, AI_CALL_BATCH);
        await save(calls);
        queue.splice(0, calls.length);
      }
    });
    return chain;
  };
  return {
    add(kind: AiCallKind, r: AiCallRecord) {
      queue.push({ id: r.id ?? crypto.randomUUID(), kind, provider: r.provider, model: r.model, outcome: r.outcome,
        ms: Math.max(0, Math.round(r.ms)), usd: r.usd, note: r.note, requests: r.requests ?? 1 });
      return queue.length >= batch ? flush() : Promise.resolve();
    },
    flush,
  };
}

/** A run keeps lasting provider exclusions across job calls and worker restarts. */
export async function loadRunProviderGate(admin: SupabaseClient<Database>, runId: string): Promise<ProviderGate> {
  const row = must(await admin.from("workbook_runs").select("ai_off").eq("id", runId).maybeSingle(), "provider exclusions load");
  const gate = newGate();
  const off = row?.ai_off as Record<string, { note?: unknown }> | undefined;
  for (const provider of ["subscription", "api"] as const) {
    if (typeof off?.[provider]?.note === "string") gate.off[provider] = off[provider].note;
  }
  return gate;
}

export async function excludeRunProvider(admin: SupabaseClient<Database>, runId: string, provider: AiProvider, reason: string) {
  if (!must(await admin.rpc("exclude_workbook_run_ai", { p_run: runId, p_provider: provider, p_note: reason }), "provider exclusion save")) {
    throw new Error("workbook run no longer exists");
  }
}

/** Stores AI calls of a run through save_workbook_run_ai_calls_v2. */
export const saveRunAiCalls = (admin: SupabaseClient<Database>, runId: string) => async (calls: RunAiCall[]) => {
  for (let i = 0; i < calls.length; i += AI_CALL_BATCH) {
    const chunk = calls.slice(i, i + AI_CALL_BATCH);
    const saved = must(await admin.rpc("save_workbook_run_ai_calls_v2", { p_run: runId, p_calls: toJson(chunk) }), "AI calls save");
    if (saved !== chunk.length) throw new Error("workbook run AI calls were not saved");
  }
};

/**
 * The child's ready first pages a Workbook 1 run may keep (docs/first-pages.md), newest first: ready, or ready and
 * chosen to "keep-plan"; not kept by a run that is waiting, working or done. Hidden sets ("drop") are not ready.
 */
export async function readyFirstPages(admin: SupabaseClient<Database>, childId: string): Promise<ReadyFirstPages | null> {
  const rows = must(await admin.from("workbook_first_pages").select("id, workbook_id, frame, result, decision, kept_by")
    .eq("child_id", childId).eq("status", "ready").order("ready_at", { ascending: false }).limit(5), "first pages load") ?? [];
  for (const row of rows) {
    if (row.kept_by) {
      const holder = must(await admin.from("workbook_runs").select("status").eq("id", row.kept_by).maybeSingle(), "first pages holder load");
      if (holder && holder.status !== "failed" && holder.status !== "stale") continue;
    }
    const result = row.result as unknown as FirstPagesResult | null;
    const frame = row.frame as unknown as RunFrame | null;
    if (!result || !frame || result.version !== 1) continue;
    return {
      id: row.id, workbookId: row.workbook_id, frame, coverToken: result.cover.qrToken, pages: result.pages.map((p) => p.number), digest: result.digest,
      decision: row.decision === "keep-plan" ? "keep-plan" : row.decision === "drop" ? "drop" : null,
    };
  }
  return null;
}
