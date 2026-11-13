// The first pages' store in memory (docs/first-pages.md), for tests: the same rules as the Supabase functions of
// migration workbook_first_pages (src/lib/first-pages-store.ts). One set per test; every write after the claim held by
// the lease; the first value stored at a key stays; a claim counts an attempt; a set past its last attempt fails. It also
// answers what a Workbook 1 run keeps (`forRuns`, as adopt_workbook_first_pages) and the ready set a run's source reads
// (`ready`, as the Supabase source).
import type { GeneratedPage, StoredCall } from "@/lib/workbook-generator";
import { FIRST_PAGES_ATTEMPTS, type AiCallCost, type FirstPagesRow, type FirstPagesStore } from "@/lib/first-pages";
import type { ReadyFirstPages, RunSolve, WorkbookRun } from "@/lib/workbook-job";
import type { SolveVerdict } from "@/lib/workbook-solve-check";

interface Held extends FirstPagesRow {
  lease: string | null;
  pagesMap: Map<number, GeneratedPage>;
  callsMap: Map<string, { page: number; seq: number; call: StoredCall }>;
  attemptsMap: Map<string, number>;
  solvesMap: Map<string, RunSolve>;
  aiCalls: AiCallCost[];
}

const json = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function memoryFirstPagesStore(o: {
  now: () => Date; newId: () => string;
  /** Whether the child has a Workbook 1 run that is waiting, working or done (finish_workbook_first_pages refuses then). */
  runActive?: (childId: string) => Promise<boolean>;
}) {
  const sets = new Map<string, Held>();
  const iso = () => o.now().toISOString();
  const holding = (id: string, lease: string) => {
    const r = sets.get(id);
    return r && r.lease === lease && r.status === "running" ? r : null;
  };
  const beat = (r: Held) => { r.heartbeatAt = iso(); return true; };
  const view = (r: Held): FirstPagesRow => {
    const { lease: _l, pagesMap: _p, callsMap: _c, attemptsMap: _a, solvesMap: _s, aiCalls: _x, ...rest } = r;
    void _l; void _p; void _c; void _a; void _s; void _x;
    return json(rest);
  };

  const store: FirstPagesStore = {
    async get(id) {
      const r = sets.get(id);
      return r ? view(r) : null;
    },
    async claim(id, lease, runner, staleSeconds) {
      const r = sets.get(id);
      if (!r) return null;
      const quiet = o.now().getTime() - Date.parse(r.heartbeatAt ?? r.createdAt);
      const takeable = r.status === "queued" || (r.status === "running" && (r.lease === null || quiet > staleSeconds * 1000));
      if (!takeable) return null;
      if (r.attempts >= r.maxAttempts) {
        Object.assign(r, { status: "failed", lease: null, error: r.error ?? "The first pages stopped too many times without finishing." });
        return null;
      }
      Object.assign(r, { status: "running", lease, runner, attempts: r.attempts + 1, heartbeatAt: iso() });
      return view(r);
    },
    async renew(id, lease) {
      const r = holding(id, lease);
      return r ? beat(r) : false;
    },
    async saveFrame(id, lease, frame) {
      const r = holding(id, lease);
      if (!r) return false;
      if (!r.frame) r.frame = json(frame);
      return beat(r);
    },
    async pages(id) {
      return [...(sets.get(id)?.pagesMap.values() ?? [])].map(json).sort((a, b) => a.number - b.number);
    },
    async savePage(id, lease, page) {
      const r = holding(id, lease);
      if (!r) return false;
      if (!r.pagesMap.has(page.number)) r.pagesMap.set(page.number, json(page));
      return beat(r);
    },
    async attempts(id) {
      return new Map(sets.get(id)?.attemptsMap ?? []);
    },
    async useAttempts(id, lease, page, slots, max) {
      const r = holding(id, lease);
      if (!r) return null;
      const refused: string[] = [];
      for (const slot of slots) {
        const key = `${page}:${slot}`;
        const used = r.attemptsMap.get(key) ?? 0;
        if (used >= max) refused.push(slot);
        else r.attemptsMap.set(key, used + 1);
      }
      beat(r);
      return { refused };
    },
    async calls(id, pages) {
      const wanted = new Set(pages);
      return [...(sets.get(id)?.callsMap.values() ?? [])].filter((c) => wanted.has(c.page)).map(json).sort((a, b) => a.page - b.page || a.seq - b.seq);
    },
    async saveCall(id, lease, page, seq, call) {
      const r = holding(id, lease);
      if (!r) return false;
      const key = `${page}:${seq}`;
      if (!r.callsMap.has(key)) r.callsMap.set(key, { page, seq, call: json(call) });
      return beat(r);
    },
    async solves(id) {
      return new Map([...(sets.get(id)?.solvesMap ?? new Map<string, RunSolve>())].map(([k, s]) => [k, json(s.log.verdict) as SolveVerdict]));
    },
    async saveSolve(id, lease, solve) {
      const r = holding(id, lease);
      if (!r) return false;
      if (!r.solvesMap.has(solve.callKey)) r.solvesMap.set(solve.callKey, json(solve));
      return beat(r);
    },
    async solveCosts(id) {
      const all = [...(sets.get(id)?.solvesMap.values() ?? [])];
      const known = all.map((s) => s.usd).filter((x): x is number => x !== null);
      return { count: all.length, usd: known.length ? known.reduce((a, b) => a + b, 0) : null };
    },
    async finish(id, lease, result, calls) {
      const r = holding(id, lease);
      if (!r) return false;
      r.aiCalls.push(...json(calls));
      if (await o.runActive?.(r.childId)) {
        Object.assign(r, { status: "unavailable", lease: null, error: "Workbook 1 started before the first pages were ready." });
        return false;
      }
      Object.assign(r, { status: "ready", lease: null, result: json(result), readyAt: iso(), heartbeatAt: iso(), error: null });
      return true;
    },
    async reseed(id, lease, { error, calls }) {
      const r = holding(id, lease);
      if (!r || r.frame || r.pagesMap.size || r.callsMap.size || r.attemptsMap.size || r.solvesMap.size) return false;
      r.aiCalls.push(...json(calls));
      r.errors.push({ attempt: r.attempts, at: iso(), error });
      Object.assign(r, { workbookId: o.newId(), error, lease: null, status: r.attempts < r.maxAttempts ? "queued" : "unavailable" });
      return true;
    },
    async end(id, lease, { outcome, error, calls }) {
      const r = holding(id, lease);
      if (!r) return false;
      r.aiCalls.push(...json(calls));
      r.errors.push({ attempt: r.attempts, at: iso(), error });
      r.error = error;
      r.lease = null;
      r.status = outcome === "retry" ? (r.attempts < r.maxAttempts ? "queued" : "failed") : outcome;
      return true;
    },
  };

  /** Adds a queued set for a finished test, as queue_first_pages does after its checks; the same test twice: the first. */
  function queue(o2: { assessmentId: string; parentId: string; childId: string; workbookId?: string; runner?: "server" | "mac" }): FirstPagesRow {
    const existing = [...sets.values()].find((r) => r.assessmentId === o2.assessmentId);
    if (existing) return view(existing);
    const r: Held = {
      id: o.newId(), assessmentId: o2.assessmentId, parentId: o2.parentId, childId: o2.childId, workbookId: o2.workbookId ?? o.newId(),
      status: "queued", runner: o2.runner ?? "mac", attempts: 0, maxAttempts: FIRST_PAGES_ATTEMPTS, createdAt: iso(), heartbeatAt: null, readyAt: null,
      error: null, errors: [], frame: null, result: null, keptBy: null, decision: null,
      lease: null, pagesMap: new Map(), callsMap: new Map(), attemptsMap: new Map(), solvesMap: new Map(), aiCalls: [],
    };
    sets.set(r.id, r);
    return view(r);
  }

  /** The ready set of a child that Workbook 1 may keep, newest first, as the run's source reads it. */
  async function ready(childId: string, runs: readonly WorkbookRun[] = []): Promise<ReadyFirstPages | null> {
    const usable = [...sets.values()].filter((r) => r.childId === childId && r.status === "ready" && r.result && r.frame
      && !(r.keptBy && runs.some((x) => x.id === r.keptBy && x.status !== "failed" && x.status !== "stale")))
      .sort((a, b) => (b.readyAt ?? "").localeCompare(a.readyAt ?? ""));
    const r = usable[0];
    if (!r?.result || !r.frame) return null;
    return {
      id: r.id, workbookId: r.workbookId, frame: json(r.frame), coverToken: r.result.cover.qrToken,
      pages: r.result.pages.map((p) => p.number), digest: r.result.digest, decision: r.decision === "keep-plan" ? "keep-plan" : r.decision === "drop" ? "drop" : null,
    };
  }

  /** The run store's hook (memoryRunStore's `firstPages`), with the rules of adopt_workbook_first_pages. */
  const forRuns = {
    take(firstPagesId: string, run: WorkbookRun, others: readonly WorkbookRun[]) {
      const r = sets.get(firstPagesId);
      if (!r || r.childId !== run.childId) return { refused: "the first pages are not this child's" };
      if (r.status !== "ready" || !r.result) return { refused: "the first pages are not ready" };
      if (r.decision === "drop") return { refused: "the first pages are hidden" };
      const holder = r.keptBy ? others.find((x) => x.id === r.keptBy) : undefined;
      if (holder && holder.status !== "failed" && holder.status !== "stale") return { refused: "another run keeps the first pages" };
      if (others.some((x) => x.draftKey === r.workbookId && x.status !== "failed" && x.status !== "stale")) return { refused: "another run writes the first pages' workbook" };
      const numbers = new Set(r.result.pages.map((p) => p.number));
      return {
        workbookId: r.workbookId,
        pages: [...r.pagesMap.values()].filter((p) => numbers.has(p.number)).map(json),
        attempts: new Map([...r.attemptsMap].filter(([k]) => numbers.has(Number(k.slice(0, k.indexOf(":")))))),
      };
    },
    kept(firstPagesId: string, runId: string) {
      const r = sets.get(firstPagesId);
      if (r) r.keptBy = runId;
    },
  };

  /** The admin's choice after Workbook 1's plan stopped matching. "drop" hides the set. */
  function decide(id: string, decision: "keep-plan" | "drop", runs: readonly WorkbookRun[] = []) {
    const r = sets.get(id);
    if (!r || r.status !== "ready") return false;
    // A Workbook 1 run that is waiting, working or done keeps the pages: they stay.
    if (r.keptBy && runs.some((x) => x.id === r.keptBy && x.status !== "failed" && x.status !== "stale")) return false;
    r.decision = decision;
    if (decision === "drop") r.status = "hidden";
    return true;
  }

  /** Everything stored for a set, for tests: the AI calls, the attempts and the solve checks. */
  const inside = (id: string) => {
    const r = sets.get(id);
    return r ? { aiCalls: json(r.aiCalls), attempts: new Map(r.attemptsMap), calls: [...r.callsMap.values()].map(json), solves: [...r.solvesMap.values()].map(json), lease: r.lease } : null;
  };
  /** Sets the clock of a set's last progress, for tests of a stopped holder. */
  const age = (id: string, at: string) => { const r = sets.get(id); if (r) r.heartbeatAt = at; };

  return { store, queue, ready, forRuns, decide, inside, age };
}
