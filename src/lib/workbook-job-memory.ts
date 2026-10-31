// The runs' store (#312) in memory, for tests: the same rules as the Supabase functions (migration add_workbook_runs,
// src/lib/workbook-job-store.ts): one active run per child, stale runs stopped by the next start, every write after the
// start held by the lease, and the audit entries. `children` maps each known child to its parent; `workbooks` gives
// each child's stored workbook numbers; `now` is the clock.
import type { RenderProblem } from "@/lib/workbook-render";
import type { DraftRendering, RunActor, WorkbookRun, WorkbookRunStore } from "@/lib/workbook-job";

export interface MemoryAudit {
  at: string;
  runId: string | null;
  draftId: string | null;
  actor: string | null;
  action: string;
  detail: Record<string, unknown>;
}

export interface MemoryRevision {
  draftId: string;
  revision: number;
  kind: "generated";
  rendering: DraftRendering | null;
  problems: RenderProblem[];
}

export function memoryRunStore(o: { children: Record<string, string>; workbooks?: Record<string, number[]>; now: () => Date; newId: () => string }) {
  const runs = new Map<string, WorkbookRun & { lease: string | null }>();
  const audit: MemoryAudit[] = [];
  const revisions: MemoryRevision[] = [];
  const iso = () => o.now().toISOString();
  const log = (runId: string | null, action: string, detail: Record<string, unknown> = {}, actor: string | null = null, draftId: string | null = null) =>
    audit.push({ at: iso(), runId, draftId, actor, action, detail });
  const holding = (id: string, lease: string) => {
    const r = runs.get(id);
    return r && r.lease === lease && r.status === "running" ? r : null;
  };
  const view = (r: WorkbookRun & { lease: string | null }): WorkbookRun => {
    const { lease: _lease, ...rest } = r;
    void _lease;
    return structuredClone(rest);
  };

  const store: WorkbookRunStore = {
    async start(childId: string, by: RunActor, limits) {
      const parentId = o.children[childId];
      if (!parentId) return { status: "refused", reason: "the child is not known" };
      for (const r of runs.values()) {
        if (r.childId !== childId || (r.status !== "queued" && r.status !== "running")) continue;
        if (o.now().getTime() - Date.parse(r.heartbeatAt ?? r.createdAt) > limits.staleSeconds * 1000) {
          Object.assign(r, { status: "stale", finishedAt: iso(), lease: null, error: r.error ?? "The run stopped without finishing." });
          log(r.id, "run-stopped", {}, by.email);
        }
      }
      const active = [...runs.values()].find((r) => r.childId === childId && (r.status === "queued" || r.status === "running"));
      if (active) return { status: "busy", runId: active.id };
      const id = o.newId();
      const number = Math.max(0, ...(o.workbooks?.[childId] ?? [])) + 1;
      runs.set(id, {
        id, createdAt: iso(), parentId, childId, number, status: "queued", step: null, attempts: 0, maxAttempts: limits.maxAttempts,
        donePages: null, totalPages: null, heartbeatAt: null, startedAt: null, finishedAt: null, error: null, errors: [], draftId: null,
        startedBy: { id: by.id, email: by.email }, lease: null,
      });
      log(id, "run-started", { number }, by.email);
      return { status: "started", runId: id };
    },
    async claim(id, lease) {
      const r = runs.get(id);
      if (!r || r.status !== "queued") return null;
      Object.assign(r, { status: "running", lease, attempts: 1, step: "plan", heartbeatAt: iso(), startedAt: iso() });
      return view(r);
    },
    async progress(id, lease, p) {
      const r = holding(id, lease);
      if (!r) return false;
      r.step = p.step;
      if (p.done !== undefined) r.donePages = p.done;
      if (p.total !== undefined) r.totalPages = p.total;
      r.heartbeatAt = iso();
      return true;
    },
    async held(id, lease) {
      return !!holding(id, lease);
    },
    async retry(id, lease, error) {
      const r = holding(id, lease);
      if (!r || r.attempts >= r.maxAttempts) return false;
      r.errors.push({ attempt: r.attempts, at: iso(), error });
      r.attempts += 1;
      r.heartbeatAt = iso();
      log(id, "run-retried", { attempt: r.attempts, error });
      return true;
    },
    async fail(id, lease, error) {
      const r = holding(id, lease);
      if (!r) return false;
      r.errors.push({ attempt: r.attempts, at: iso(), error });
      Object.assign(r, { status: "failed", finishedAt: iso(), heartbeatAt: iso(), lease: null, error });
      log(id, "run-failed", { error });
      return true;
    },
    async finish(id, lease, f) {
      const r = holding(id, lease);
      if (!r) return false;
      Object.assign(r, { status: "done", step: null, finishedAt: iso(), heartbeatAt: iso(), lease: null, draftId: f.draftId });
      revisions.push({ draftId: f.draftId, revision: 1, kind: "generated", rendering: structuredClone(f.rendering), problems: structuredClone(f.problems) });
      log(id, "draft-stored", { rendered: f.rendering !== null, renderProblems: f.problems.length }, null, f.draftId);
      return true;
    },
    async run(id) {
      const r = runs.get(id);
      return r ? view(r) : null;
    },
  };
  return { ...store, runs, audit, revisions };
}
