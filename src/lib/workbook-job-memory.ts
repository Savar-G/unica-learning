// The runs' store (#312) in memory, for tests: the same rules as the Supabase functions (migrations add_workbook_runs
// and workbook_run_resume, src/lib/workbook-job-store.ts): one active run per child, a run stopped mid-way answered as
// "stalled" by the next start and taken up again by resume, every write after the start held by the lease, the
// finished pages, and the audit entries. `children` maps each known child to its parent; `workbooks` gives
// each child's stored workbook numbers; `now` is the clock.
import type { RenderProblem } from "@/lib/workbook-render";
import { draftProblem, type GeneratedPage, type WorkbookDraftStore } from "@/lib/workbook-generator";
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

export function memoryRunStore(o: { children: Record<string, string>; workbooks?: Record<string, number[]>; now: () => Date; newId: () => string; drafts: WorkbookDraftStore }) {
  const runs = new Map<string, WorkbookRun & { lease: string | null }>();
  const pages = new Map<string, Map<number, GeneratedPage>>();
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
      const active = [...runs.values()].find((r) => r.childId === childId && (r.status === "queued" || r.status === "running"));
      if (active) {
        const quiet = o.now().getTime() - Date.parse(active.heartbeatAt ?? active.createdAt);
        if (!((active.lease === null && quiet > 120_000) || quiet > limits.staleSeconds * 1000)) return { status: "busy", runId: active.id };
        if (active.status === "queued") Object.assign(active, { status: "running", attempts: 1, step: "plan", startedAt: iso() });
        if (active.resumes < 30) return { status: "stalled", runId: active.id };
        Object.assign(active, { status: "stale", finishedAt: iso(), lease: null, error: active.error ?? "The run stopped too many times without finishing." });
        log(active.id, "run-stopped", {}, by.email);
      }
      const id = o.newId();
      const number = Math.max(0, ...(o.workbooks?.[childId] ?? [])) + 1;
      runs.set(id, {
        id, createdAt: iso(), parentId, childId, number, status: "queued", step: null, attempts: 0, maxAttempts: limits.maxAttempts,
        donePages: null, totalPages: null, heartbeatAt: null, startedAt: null, finishedAt: null, error: null, errors: [], draftId: null,
        draftKey: o.newId(), resumes: 0, startedBy: { id: by.id, email: by.email }, lease: null,
      });
      log(id, "run-started", { number }, by.email);
      return { status: "started", runId: id };
    },
    async resume(id, lease, staleSeconds) {
      const r = runs.get(id);
      if (!r || r.status !== "running") return null;
      if (r.lease !== null && o.now().getTime() - Date.parse(r.heartbeatAt ?? r.createdAt) <= staleSeconds * 1000) return null;
      if (r.resumes >= 30) {
        Object.assign(r, { status: "failed", finishedAt: iso(), lease: null, error: "The run stopped and was taken up again 30 times without finishing." });
        log(id, "run-failed");
        return null;
      }
      log(id, "run-resumed", { pages: pages.get(id)?.size ?? 0, after: r.lease === null ? "handover" : "no progress" });
      Object.assign(r, { lease, heartbeatAt: iso(), resumes: r.resumes + 1 });
      return view(r);
    },
    async yield(id, lease) {
      const r = holding(id, lease);
      if (!r) return false;
      Object.assign(r, { lease: null, heartbeatAt: iso() });
      return true;
    },
    async pages(id) {
      return [...(pages.get(id)?.values() ?? [])].map((p) => structuredClone(p));
    },
    async savePage(id, lease, page) {
      const r = holding(id, lease);
      if (!r) return false;
      r.heartbeatAt = iso();
      if (!pages.has(id)) pages.set(id, new Map());
      if (!pages.get(id)!.has(page.number)) pages.get(id)!.set(page.number, structuredClone(page));
      return true;
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
    async saveDraft(id, lease, draft) {
      const r = holding(id, lease);
      if (!r) return "lost";
      if (draft.id !== r.draftKey) throw new Error("the draft id is not the run's draft key");
      const problem = draftProblem(draft);
      if (problem) return { refused: problem };
      if (await o.drafts.draft(draft.id)) return "used";
      const saved = await o.drafts.save(draft);
      if (saved.status === "refused") return { refused: saved.reason };
      r.heartbeatAt = iso();
      return "saved";
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
  return { ...store, runs, audit, revisions, pageStore: pages };
}
