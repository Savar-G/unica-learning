// The first pages of Workbook 1 (docs/first-pages.md): four real pages of a child's first workbook, made right after
// the report for a BC family without a saved card. The job claims one queued set under a lease, plans Workbook 1 as the
// workbook job does (makeRunFrame: the real placement and planner, the capacity check of the whole book, code only),
// picks the cover, the first lesson page and the two practice pages after it (firstPagesOf), writes only those three day
// pages with the real generator (generateWorkbookPages: the AI, the solve check, the fit check, the attempt limit),
// checks that every question is checked and every page fits, prints the four pages with the strict renderer, and stores
// them as ready. Workbook 1 later keeps exactly these pages (workbook-job.ts, adoptFirstPages).
//
// Durable: the plan, each AI call, each solve check, each finished page and each slot's attempts are stored under the
// lease as they come, so a call that stops (a crash, the 300 s limit) is taken up again and pays for nothing twice. A
// refusal (no curriculum, no profile, no plan, no first lesson) ends the set as "unavailable"; a page that does not pass
// its checks or does not print ends it as "failed"; any other error is kept and the set is tried again, up to
// FIRST_PAGES_ATTEMPTS attempts in all. A call whose lease was taken writes nothing more.
// Pure TypeScript: the store, the child source, the AI, the print engine, the files, the clock and ids are passed in.
import type { AiClient } from "@/lib/ai-client";
import { bookPageContent } from "@/lib/workbook-book";
import type { WorkbookFiles } from "@/lib/workbook-content";
import {
  CapacityProblem,
  firstPagesOf,
  generateWorkbookPages,
  pagesDigest,
  ResumeMismatch,
  type AttemptLedger,
  type CallStore,
  type FitCheck,
  type GeneratedPage,
  type PageStore,
  type StoredCall,
} from "@/lib/workbook-generator";
import {
  frameInput,
  frameProblem,
  makeRunFrame,
  SLOT_ATTEMPTS,
  SOLVE_ANSWERS_MOST,
  STALE_SECONDS,
  WorkbookRefusal,
  type FrameTarget,
  type RunError,
  type RunFrame,
  type RunRunner,
  type RunSolve,
  type WorkbookJobSource,
} from "@/lib/workbook-job";
import { withWorkbookMayaOperation } from "@/lib/workbook-maya-operation";
import { renderedPages, renderWorkbook, type DraftPage, type PrintEngine, type WorkbookTemplate } from "@/lib/workbook-render";
import type { SolveLog, Solver, SolveVerdict } from "@/lib/workbook-solve-check";

/** Attempts of one set in all: the first and one retry. */
export const FIRST_PAGES_ATTEMPTS = 2;
/** The day pages a set writes with the AI: the lesson and two practice pages. The cover has no AI content. */
export const FIRST_DAY_PAGES = 3;

export type FirstPagesStatus = "queued" | "running" | "ready" | "failed" | "unavailable" | "hidden";

/** One AI call's cost as the provider reported it (null: not known), for the counts. */
export interface AiCallCost {
  kind: "writer" | "solve";
  model: string;
  provider: string | null;
  usd: number | null;
  ms: number;
}

/** What a ready set holds: the four pages, the files, and what making them took. */
export interface FirstPagesResult {
  version: 1;
  /** Book page numbers: the cover is 1. */
  numbers: { lesson: number; practice: [number, number] };
  cover: GeneratedPage;
  /** The three day pages, in book order: the lesson, then the two practice pages. */
  pages: GeneratedPage[];
  /** pagesDigest of the plan's input and the three day pages: Workbook 1 keeps them only when its plan gives the same. */
  digest: string;
  files: { pdf: { path: string; sha256: string | null; bytes: number }; images: { number: number; path: string; width: number; height: number }[] };
  counts: FirstPagesCounts;
}

export interface FirstPagesCounts {
  /** Day pages written with the AI (3); the cover has none. */
  dayPages: number;
  /** AI calls of the day pages that are stored (the first call, a redo, a shorter rewrite), of every attempt. */
  writerCalls: number;
  /** Solve checks that are stored, of every attempt. */
  solveChecks: number;
  /** The provider's cost of every AI call this set paid for, where it said; null when no call said. */
  usd: number | null;
  /** Each AI call of each job call, with its cost. */
  calls: AiCallCost[];
}

/** One set of first pages: one per finished test. */
export interface FirstPagesRow {
  id: string;
  assessmentId: string;
  parentId: string;
  childId: string;
  /** The Workbook 1 id the pages are written with: the draft id Workbook 1 then uses, and the seed of the code's choices. */
  workbookId: string;
  status: FirstPagesStatus;
  runner: RunRunner;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  heartbeatAt: string | null;
  readyAt: string | null;
  error: string | null;
  errors: RunError[];
  frame: RunFrame | null;
  result: FirstPagesResult | null;
  /** The Workbook 1 run that keeps the pages, once one does. */
  keptBy: string | null;
  /** The admin's choice after Workbook 1's plan stopped matching. "drop" hides the set. */
  decision: "keep-plan" | "drop" | null;
}

/**
 * The sets' store. Adapters: Supabase (src/lib/first-pages-store.ts, migration workbook_first_pages) and in memory
 * (src/lib/first-pages-memory.ts). Every write after the claim names the lease and changes nothing (false, or null)
 * when the lease no longer holds the set. The first value stored at a key stays.
 */
export interface FirstPagesStore {
  get(id: string): Promise<FirstPagesRow | null>;
  /**
   * Takes a queued set (one more attempt), or a running one with no holder or no progress for `staleSeconds` (one more
   * attempt; past the last, the set fails). Null when there is nothing to take.
   */
  claim(id: string, lease: string, runner: RunRunner, staleSeconds: number): Promise<FirstPagesRow | null>;
  renew(id: string, lease: string): Promise<boolean>;
  saveFrame(id: string, lease: string, frame: RunFrame): Promise<boolean>;
  pages(id: string): Promise<GeneratedPage[]>;
  savePage(id: string, lease: string, page: GeneratedPage): Promise<boolean>;
  attempts(id: string): Promise<Map<string, number>>;
  /** Counts one attempt of each slot before its AI call; the refused slots (they used `max`), or null (lease lost). */
  useAttempts(id: string, lease: string, page: number, slots: string[], max: number): Promise<{ refused: string[] } | null>;
  calls(id: string, pages: number[]): Promise<{ page: number; seq: number; call: StoredCall }[]>;
  saveCall(id: string, lease: string, page: number, seq: number, call: StoredCall): Promise<boolean>;
  /** The verdicts of the stored solve checks by key. */
  solves(id: string): Promise<Map<string, SolveVerdict>>;
  saveSolve(id: string, lease: string, solve: RunSolve & { callKey: string }): Promise<boolean>;
  /** The stored solve checks' costs: how many, and their sum in US dollars (null when none said). */
  solveCosts(id: string): Promise<{ count: number; usd: number | null }>;
  /** Ready, with the result and this call's AI costs. */
  finish(id: string, lease: string, result: FirstPagesResult, calls: AiCallCost[]): Promise<boolean>;
  /**
   * Ends this attempt: "failed" or "unavailable" ends the set; "retry" keeps the error and queues the set again, or fails
   * it when no attempt is left. Keeps this call's AI costs.
   */
  end(id: string, lease: string, o: { outcome: "failed" | "unavailable" | "retry"; error: string; calls: AiCallCost[] }): Promise<boolean>;
  /**
   * The plan's capacity check failed for the reserved Workbook 1 id, which seeds the code's choices: before anything is
   * stored for the set, it takes a new id and is queued again (unavailable past its last attempt). False when the lease
   * does not hold it or something is stored.
   */
  reseed(id: string, lease: string, o: { error: string; calls: AiCallCost[] }): Promise<boolean>;
}

export interface FirstPagesJobDeps {
  store: FirstPagesStore;
  runner: RunRunner;
  source: WorkbookJobSource;
  files: WorkbookFiles;
  /** Null: the AI is off; the set is tried again later (it is not the set's fault). */
  ai: AiClient | null;
  solver: Solver | null;
  solveCost?(log: SolveLog): number | null;
  /** This job call's AI calls with their costs, as the live AI client logged them; none: not known. */
  aiCalls?(): AiCallCost[];
  template: WorkbookTemplate;
  fit: (parentId: string, signal?: AbortSignal) => FitCheck;
  engine: PrintEngine;
  newId(): string;
  qrToken(): string;
  fileKey(): string;
  now(): number;
  build?: string | null;
  itemPolicy?: "approved-v1" | "legacy";
  concurrency?: number;
  timeLimitMs?: number;
}

export type FirstPagesOutcome = "ready" | "failed" | "unavailable" | "retry" | "stale" | "not-claimed";

class Lost extends Error {}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Why written pages may not be shown, or null: every question checked by code, every page fits. */
export function firstPagesProblem(pages: readonly GeneratedPage[]): string | null {
  if (pages.length !== FIRST_DAY_PAGES) return `${pages.length} day pages were written, not ${FIRST_DAY_PAGES}`;
  for (const p of pages) {
    if (p.questions.length === 0) return `page ${p.number} has no questions`;
    if (p.fit.status !== "fits") return `page ${p.number} does not fit: ${p.fit.status === "failed" ? p.fit.problems.map((x) => x.reason).join("; ") : "not checked"}`;
    for (const q of p.questions) {
      if (!q.package) return `page ${p.number}, question ${q.number} has no question`;
      if (q.check.status !== "checked") return `page ${p.number}, question ${q.number} is ${q.check.status === "failed" ? "failed" : "not checked by code"}: ${q.check.reason ?? ""}`;
    }
  }
  return null;
}

const draftPage = (p: GeneratedPage): DraftPage => ({
  number: p.number, dayLabel: p.dayLabel, type: p.type, qrToken: p.qrToken,
  questions: p.questions.flatMap((q) => (q.package ? [{ number: q.number, package: q.package }] : [])),
  content: p.content,
});

/**
 * Makes one set's first pages, or goes on with them. Never throws: every outcome is stored on the set. "not-claimed":
 * nothing to take (another call holds it, or it ended).
 */
export async function runFirstPagesJob(id: string, deps: FirstPagesJobDeps): Promise<FirstPagesOutcome> {
  const { store } = deps;
  const lease = deps.newId();
  let row: FirstPagesRow | null;
  try {
    row = await store.claim(id, lease, deps.runner, STALE_SECONDS);
  } catch (e) {
    console.error("[first pages] claim failed", id, message(e));
    return "not-claimed";
  }
  if (!row) return "not-claimed";
  const set = row;
  let lost = false;
  const stop = new AbortController();
  const lose = (): never => {
    lost = true;
    stop.abort();
    throw new Lost("another call took the first pages");
  };
  const renewTimer = setInterval(() => {
    void store.renew(id, lease).then((held) => { if (!held) { lost = true; stop.abort(); } }).catch(() => { lost = true; stop.abort(); });
  }, 30_000);
  const costs = () => deps.aiCalls?.() ?? [];
  const end = async (outcome: "failed" | "unavailable" | "retry", error: string): Promise<FirstPagesOutcome> => {
    if (lost) return "stale";
    try {
      const ended = await store.end(id, lease, { outcome, error, calls: costs() });
      if (!ended) return "stale";
      if (outcome !== "retry") return outcome;
      const now = await store.get(id);
      return now?.status === "queued" ? "retry" : "failed";
    } catch (e) {
      console.error("[first pages] could not store the outcome", id, message(e));
      return "failed";
    }
  };
  const stored: string[] = [];
  try {
    if (!deps.ai || !deps.solver) return await end("retry", "The AI is off here: no Claude subscription and no OPENROUTER_API_KEY.");
    const inputs = await deps.source.inputs(set.childId);
    if (!inputs) return await end("unavailable", "The child is not known.");
    if (inputs.parentId !== set.parentId) return await end("unavailable", "The child belongs to another family.");
    if (inputs.workbooks.length > 0) return await end("unavailable", "The child already has a workbook: first pages are for Workbook 1 only.");
    const target: FrameTarget = { childId: set.childId, parentId: set.parentId, number: 1, workbookId: set.workbookId };
    const frameDeps = { source: deps.source, fit: deps.fit, build: deps.build ?? null, itemPolicy: deps.itemPolicy, ai: deps.ai, solver: deps.solver };
    let frame = set.frame;
    if (!frame) {
      frame = await makeRunFrame(target, frameDeps, inputs.name, inputs);
      if (!(await store.saveFrame(id, lease, frame))) lose();
      frame = (await store.get(id))?.frame ?? null;
      if (!frame) throw new Error("the first pages' plan was not stored");
    }
    const problem = frameProblem(target, frame, frameDeps, inputs.name);
    if (problem) return await end("failed", problem);
    const input = frameInput(target, frame, inputs.name);
    const first = firstPagesOf(input);
    if (!first) return await end("unavailable", "Workbook 1 has no first lesson page with two practice pages after it on the same topic.");
    const numbers = [first.lesson, ...first.practice];

    const ai = deps.ai;
    const solver = deps.solver;
    const guardedAi: AiClient = {
      model: ai.model,
      json: async (request, signal) => {
        if (lost) lose();
        return ai.json(request, AbortSignal.any([signal, stop.signal]));
      },
    };
    const guardedSolver: Solver = {
      model: solver.model,
      solve: async (request, signal) => {
        if (lost) lose();
        return solver.solve(request, AbortSignal.any([signal, stop.signal]));
      },
    };
    const attempts: AttemptLedger = {
      max: SLOT_ATTEMPTS,
      load: () => store.attempts(id),
      async use(page, slots) {
        const counted = lost ? null : await store.useAttempts(id, lease, page, slots, SLOT_ATTEMPTS);
        return counted ?? lose();
      },
    };
    const calls: CallStore = {
      load: (pages) => store.calls(id, pages),
      async save(page, seq, call) {
        if (lost || !(await store.saveCall(id, lease, page, seq, call))) lose();
      },
      async solves(pages) {
        const wanted = new Set(pages);
        return new Map([...await store.solves(id)].filter(([key]) => wanted.has(Number(key.slice(0, key.indexOf(":"))))));
      },
      async saveSolve(callKey, log) {
        const solve = {
          callKey, questionId: log.id, model: log.model, verdict: log.verdict.status, ms: Math.max(0, Math.round(log.ms)), usd: deps.solveCost?.(log) ?? null,
          log: { questions: log.questions, answers: (JSON.stringify(log.answers ?? null) ?? "null").slice(0, SOLVE_ANSWERS_MOST), key: log.key, verdict: log.verdict },
        };
        if (lost || !(await store.saveSolve(id, lease, solve))) lose();
      },
    };
    const pageStore: PageStore = {
      load: () => store.pages(id),
      async save(page) {
        if (lost || !(await store.savePage(id, lease, page))) lose();
      },
    };
    const fit = deps.fit(set.parentId, stop.signal);
    const written = await generateWorkbookPages(input, {
      ai: guardedAi, solver: guardedSolver, fit: { fits: async (page, book) => (lost ? lose() : fit.fits(page, book)) },
      store: { save: async () => ({ status: "refused", reason: "first pages store no draft" }), draft: async () => null },
      qrToken: deps.qrToken, pages: pageStore, attempts, calls, concurrency: deps.concurrency ?? FIRST_DAY_PAGES,
      timeLimitMs: deps.timeLimitMs, now: deps.now,
    }, numbers);
    if (lost) lose();
    if (written.status === "refused") return await end("unavailable", `The pages could not be written: ${written.reason}.`);
    if (written.status === "paused") return await end("retry", "The pages stopped before they were all written.");
    const notReady = firstPagesProblem(written.pages);
    if (notReady) return await end("failed", `A page did not pass its checks: ${notReady}.`);

    // Print the cover and the three pages with the strict renderer; the cover reads How + Plan from the whole book.
    const how: DraftPage = { number: 2, dayLabel: null, type: "how-plan", qrToken: written.cover.qrToken, questions: [],
      content: bookPageContent({ curriculum: input.curriculum, plan: input.plan, child: inputs.name, workbook: 1, type: "how-plan", number: 2 }) };
    const pages = [written.cover, ...written.pages].map(draftPage);
    const book = { id: set.workbookId, childId: set.childId, number: 1, levels: [input.plan.level], profileBuild: input.profileBuild };
    const rendered = await renderWorkbook({
      draft: { ...book, pages }, book: { ...book, pages: [pages[0], how, ...pages.slice(1)] },
      parentId: set.parentId, template: deps.template, engine: { print: (job) => deps.engine.print({ ...job, signal: stop.signal }) },
      fileKey: `first-${deps.fileKey()}`,
    });
    if (lost) lose();
    if (rendered.status === "failed") return await end("failed", `The pages did not print: ${rendered.problems.map((p) => `page ${p.page}: ${p.reason}`).join("; ")}.`);
    for (const file of rendered.files) {
      stored.push(file.path);
      await deps.files.put(file);
    }
    const pdf = rendered.files.find((f) => f.contentType === "application/pdf")!;
    const solves = await store.solveCosts(id);
    const writerCalls = (await store.calls(id, numbers)).length;
    const calls_ = costs();
    const known = [...calls_.filter((c) => c.kind === "writer").map((c) => c.usd), solves.usd].filter((x): x is number => x !== null);
    const result: FirstPagesResult = {
      version: 1,
      numbers: { lesson: first.lesson, practice: first.practice },
      cover: written.cover,
      // As the whole book stores them: each question with the operation Maya teaches (attachWorkbookMayaOperations).
      pages: written.pages.map((p) => ({ ...p, questions: p.questions.map((q) => ({ ...q, package: q.package ? withWorkbookMayaOperation(q.package) : null })) })),
      digest: pagesDigest(input, numbers),
      files: {
        pdf: { path: pdf.path, sha256: rendered.workbook.pdfSha256 ?? null, bytes: pdf.bytes.length },
        images: renderedPages(rendered).map((p) => ({ number: p.number, path: p.image.path, width: p.image.width, height: p.image.height })),
      },
      counts: { dayPages: written.pages.length, writerCalls, solveChecks: solves.count, usd: known.length ? known.reduce((a, b) => a + b, 0) : null, calls: calls_ },
    };
    if (!(await store.finish(id, lease, result, calls_))) {
      await deps.files.remove(stored).catch(() => undefined);
      return "stale";
    }
    return "ready";
  } catch (e) {
    if (stored.length) await deps.files.remove(stored).catch(() => undefined);
    if (e instanceof Lost || lost) return "stale";
    if (e instanceof WorkbookRefusal) return await end("unavailable", e.message);
    // The plan's capacity check gives the same answer for the same plan and id: a new id, once more within the attempts.
    if (e instanceof CapacityProblem) {
      const error = `Workbook 1's pages could not be planned: ${e.message}.`;
      if (lost) return "stale";
      try {
        if (await store.reseed(id, lease, { error, calls: costs() })) return (await store.get(id))?.status === "queued" ? "retry" : "unavailable";
      } catch (e2) {
        console.error("[first pages] could not take a new id", id, message(e2));
      }
      return await end("unavailable", error);
    }
    if (e instanceof ResumeMismatch) return await end("failed", `What was stored does not fit the plan: ${e.message}.`);
    console.error("[first pages] attempt failed", id, message(e));
    return await end("retry", message(e));
  } finally {
    clearInterval(renewTimer);
  }
}
