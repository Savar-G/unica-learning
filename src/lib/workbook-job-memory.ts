// The runs' store (#312) in memory, for tests: the same rules as the Supabase functions (migrations add_workbook_runs
// and workbook_run_resume, src/lib/workbook-job-store.ts): one active run per child, a run stopped mid-way answered as
// "stalled" by the next start and taken up again by resume, every write after the start held by the lease, the
// finished pages, the solve checks (one per call key), the run's plan (the first stored stays), and the audit entries. `children` maps each known child to its parent; `workbooks` gives
// each child's stored workbook numbers; `now` is the clock.
import type { RenderProblem } from "@/lib/workbook-render";
import { draftProblem, type GeneratedPage, type StoredCall, type WorkbookDraftStore } from "@/lib/workbook-generator";
import { READ_PAGE, readPaged, SLOT_ATTEMPTS, SOLVE_BATCH, type ChildInputs, type DraftRendering, type RunActor, type RunFrame, type RunSolve, type WorkbookJobSource, type WorkbookRun, type WorkbookRunStore } from "@/lib/workbook-job";
import type { SolveVerdict } from "@/lib/workbook-solve-check";

/** The job's child reads and profile preparation in memory. Tests can use the real profile builds behind this seam. */
export function memoryWorkbookJobSource(children: Record<string, ChildInputs>, prepareProfile: WorkbookJobSource["prepareProfile"]): WorkbookJobSource {
  return {
    inputs: async (childId) => children[childId] ? structuredClone(children[childId]) : null,
    prepareProfile,
  };
}

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

export function memoryRunStore(o: {
  children: Record<string, string>; workbooks?: Record<string, number[]>; now: () => Date; newId: () => string; drafts: WorkbookDraftStore;
  /** The most rows one read answers, as the database's row limit: reads page through it like the Supabase adapter. */
  rowLimit?: number;
  /**
   * The first pages a Workbook 1 run keeps (docs/first-pages.md), as adopt_workbook_first_pages decides: their Workbook
   * 1 id, day pages and attempts, or why not. `kept` marks them kept by the run. None: no run can keep first pages.
   */
  firstPages?: {
    take(firstPagesId: string, run: WorkbookRun, runs: readonly WorkbookRun[]): { workbookId: string; pages: GeneratedPage[]; attempts: Map<string, number> } | { refused: string };
    kept(firstPagesId: string, runId: string): void;
  };
}) {
  const runs = new Map<string, WorkbookRun & { lease: string | null }>();
  const pages = new Map<string, Map<number, GeneratedPage>>();
  const attempts = new Map<string, Map<string, number>>();
  const solves = new Map<string, RunSolve[]>();
  const calls = new Map<string, Map<string, { page: number; seq: number; call: StoredCall }>>();
  const frames = new Map<string, RunFrame>();
  // The database keeps JSON (jsonb): a stored call comes back as JSON does.
  // Stored as jsonb is: Postgres keeps no key order (shorter keys first, then bytewise), so a value read back has its
  // keys in that order. Kept here so a check that depends on key order fails in tests as it does in Supabase.
  const json = <T>(x: T): T => jsonbOrder(JSON.parse(JSON.stringify(x))) as T;
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
        draftKey: o.newId(), resumes: 0, startedBy: { id: by.id, email: by.email }, runner: "server", lease: null,
      });
      log(id, "run-started", { number }, by.email);
      return { status: "started", runId: id };
    },
    async resume(id, lease, staleSeconds, runner = "server") {
      const r = runs.get(id);
      if (!r || r.status !== "running" || r.runner !== runner) return null;
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
    async attempts(id) {
      // Ordered rows, read a page at a time: a request answers at most rowLimit rows (the database's limit).
      const rows = [...(attempts.get(id) ?? [])].sort(([a], [b]) => a.localeCompare(b));
      const limit = o.rowLimit ?? READ_PAGE;
      return new Map(await readPaged(async (from, to) => rows.slice(from, Math.min(to + 1, from + limit)), limit));
    },
    async useAttempts(id, lease, page, slots) {
      // The database's check (migrations workbook_run_attempts and workbook_run_attempts_panels): a question slot or a
      // worked example.
      const bad = slots.find((slot) => !/^([0-9]{1,3}\.[0-9]{1,3}|e[0-9]{1,3})$/.test(slot));
      if (bad) throw new Error(`workbook run attempts use: the slot ${bad} breaks workbook_run_attempts_slot_check`);
      const r = holding(id, lease);
      if (!r) return null;
      if (!attempts.has(id)) attempts.set(id, new Map());
      const counts = attempts.get(id)!;
      const refused = slots.filter((slot) => (counts.get(`${page}:${slot}`) ?? 0) >= SLOT_ATTEMPTS);
      for (const slot of slots) if (!refused.includes(slot)) counts.set(`${page}:${slot}`, (counts.get(`${page}:${slot}`) ?? 0) + 1);
      r.heartbeatAt = iso();
      return { refused };
    },
    async pages(id) {
      return [...(pages.get(id)?.values() ?? [])].map((p) => json(p));
    },
    async calls(id, numbers) {
      return [...(calls.get(id)?.values() ?? [])].filter((c) => numbers.includes(c.page)).sort((a, b) => a.page - b.page || a.seq - b.seq).map(json);
    },
    async saveCall(id, lease, page, seq, call) {
      // The database's checks (migration workbook_run_calls).
      if (!Number.isInteger(page) || page < 1 || page > 1000 || !Number.isInteger(seq) || seq < 0 || seq > 9) {
        throw new Error(`workbook run call save: page ${page}, call ${seq} breaks workbook_run_calls' checks`);
      }
      const r = holding(id, lease);
      if (!r) return false;
      r.heartbeatAt = iso();
      if (!calls.has(id)) calls.set(id, new Map());
      if (!calls.get(id)!.has(`${page}:${seq}`)) calls.get(id)!.set(`${page}:${seq}`, json({ page, seq, call }));
      return true;
    },
    async saveSolves(id, lease, batch) {
      if (batch.length > SOLVE_BATCH) throw new Error(`workbook run solve checks save: ${batch.length} checks in one write`);
      // The database's check (migration workbook_run_frames): "<page>:<seq>:<slot or panel>".
      const bad = batch.find((x) => x.callKey !== undefined && !/^[0-9]{1,4}:[0-9]:([0-9]{1,3}\.[0-9]{1,3}|e[0-9]{1,3})$/.test(x.callKey));
      if (bad) throw new Error(`workbook run solve checks save: the call key ${bad.callKey} breaks workbook_run_solves_call_key_check`);
      const r = holding(id, lease);
      if (!r) return false;
      r.heartbeatAt = iso();
      const had = solves.get(id) ?? [];
      // A check already stored under its call key stays (on conflict do nothing).
      const fresh = batch.filter((x, k) => x.callKey === undefined || (!had.some((y) => y.callKey === x.callKey) && !batch.slice(0, k).some((y) => y.callKey === x.callKey)));
      solves.set(id, [...had, ...json(fresh)]);
      return true;
    },
    async solves(id) {
      const verdicts = new Map<string, SolveVerdict>();
      for (const x of solves.get(id) ?? []) if (x.callKey !== undefined) verdicts.set(x.callKey, json(x.log.verdict));
      return verdicts;
    },
    async frame(id) {
      const f = frames.get(id);
      return f ? json(f) : null;
    },
    async hasStoredWork(id) {
      const r = runs.get(id);
      if (!r) return true;
      return (pages.get(id)?.size ?? 0) > 0 || (attempts.get(id)?.size ?? 0) > 0 ||
        (calls.get(id)?.size ?? 0) > 0 || (solves.get(id)?.length ?? 0) > 0 ||
        (r.donePages ?? 0) > 0 || (r.errors?.length ?? 0) > 0 || r.draftId !== null;
    },
    async saveFrame(id, lease, frame) {
      const r = holding(id, lease);
      if (!r) return false;
      r.heartbeatAt = iso();
      if (!frames.has(id)) frames.set(id, json(frame));
      return true;
    },
    async adoptFirstPages(id, lease, firstPagesId, frame) {
      const r = holding(id, lease);
      if (!r) return "lost";
      if (!o.firstPages) return { refused: "this store keeps no first pages" };
      if (frames.has(id) || (pages.get(id)?.size ?? 0) > 0 || (attempts.get(id)?.size ?? 0) > 0) return { refused: "the run already has stored work" };
      if (r.number !== 1) return { refused: "only Workbook 1 keeps first pages" };
      const taken = o.firstPages.take(firstPagesId, view(r), [...runs.values()].filter((x) => x.id !== id).map(view));
      if ("refused" in taken) return taken;
      if (await o.drafts.draft(taken.workbookId)) return { refused: "a draft with the first pages' workbook id exists" };
      r.draftKey = taken.workbookId;
      r.heartbeatAt = iso();
      pages.set(id, new Map(taken.pages.map((p) => [p.number, json(p)])));
      attempts.set(id, new Map(taken.attempts));
      frames.set(id, json(frame));
      o.firstPages.kept(firstPagesId, id);
      log(id, "first-pages-kept", { firstPages: firstPagesId });
      return "adopted";
    },
    async savePage(id, lease, page) {
      const r = holding(id, lease);
      if (!r) return false;
      r.heartbeatAt = iso();
      if (!pages.has(id)) pages.set(id, new Map());
      if (!pages.get(id)!.has(page.number)) pages.get(id)!.set(page.number, json(page));
      return true;
    },
    async claim(id, lease, runner = "server") {
      const r = runs.get(id);
      if (!r || r.status !== "queued" || r.runner !== runner) return null;
      Object.assign(r, { status: "running", lease, attempts: 1, step: "plan", heartbeatAt: iso(), startedAt: iso() });
      return view(r);
    },
    async renew(id, lease) {
      const r = holding(id, lease);
      if (!r) return false;
      r.heartbeatAt = iso();
      return true;
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
    async stop(id, by) {
      const r = runs.get(id);
      if (!r) return "not_found";
      if (r.stoppedBy) return "already";
      if (r.status !== "queued" && r.status !== "running") return r.status;
      Object.assign(r, { status: "stale", finishedAt: iso(), heartbeatAt: iso(), lease: null, stoppedBy: by.email });
      log(id, "run-stopped-by-admin", { pages: r.donePages ?? 0 }, by.email);
      return "stopped";
    },
  };
  return { ...store, runs, audit, revisions, pageStore: pages, attemptStore: attempts, solveStore: solves, callStore: calls, frameStore: frames };
}

/** A parsed JSON value with its object keys in Postgres jsonb order: shorter keys first, then bytewise. */
export function jsonbOrder(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(jsonbOrder);
  if (v && typeof v === "object") {
    const keys = Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(keys.map((k) => [k, jsonbOrder((v as Record<string, unknown>)[k])]));
  }
  return v;
}
