// "Prepare next workbook" (#312, spec #296): the background job that makes a child's next draft workbook, the same
// pattern as the report job (src/lib/report-job.ts): the admin route starts a run and answers at once, and the job runs
// after the response. Its state is stored on the run (public.workbook_runs, migrations add_workbook_runs and
// workbook_run_resume):
//   1. plan: the child's grade, curriculum, profile and stored workbooks (the source seam), placed and planned
//      (src/lib/workbook-placement.ts, the two-week plan #308).
//   2. write: the generator (#311, src/lib/workbook-generator.ts) writes the day pages with the AI, `concurrency` pages
//      at a time, and checks every answer and every page's fit against the real templates (#310). Each finished page
//      is stored on the run (public.workbook_run_pages) as it is done; the run shows "12 of 80 day pages".
//   3. render: the template makes one image per page and the PDF, into the workbook bucket at <parent id>/<draft id>/.
//      A page that does not render gets a proof image (#310 proofPages) with its failure marked; the other pages render.
//   4. save: the run ends as done, naming the draft, and the draft gets revision 1 with its rendering, in one step.
//
// The time limit (a function stops at 300 s): a job call works for at most `budgetMs`. Near it, the generator stops
// starting pages, the job lets go of the run (yield) and calls `handOff`, which starts a new job call through the
// protected resume route; that call takes the run up again (resume) with a new lease, loads the stored pages and
// writes only the missing ones. If the hand-over never arrives (a crash), the run has no holder; the next "Prepare next
// workbook" for the child takes it up the same way instead of starting over (start answers "stalled"). The draft id
// is fixed on the run (draft_key), so every job call writes the same draft.
// Retries: an error that throws (a database or Storage error, a print engine crash) is kept on the run and the job
// tries again, up to RUN_ATTEMPTS attempts in all; stored pages and a stored draft are not written again. A refusal
// (no curriculum, the AI off, a plan or draft refused) fails the run at once: trying again gives the same answer.
// Stale runs: every write names the lease. A job call whose run was taken up by another (it made no progress for
// STALE_SECONDS) writes nothing more: its AI calls stop, its page saves and its draft save are refused, and its finish
// is refused, so its files are removed. A late call never replaces what the newer holder wrote.
// Pure TypeScript: no Next.js, React, network, database or clock (the stores, the AI, the engine, the clock and ids are
// passed in).
import type { Grade } from "@/lib/assessment";
import type { AiClient } from "@/lib/ai-client";
import type { ChildLearnerProfile } from "@/lib/child-profile";
import type { PageImage, QuestionBox, WorkbookFiles } from "@/lib/workbook-content";
import { curriculumFor } from "@/lib/workbook-curriculum";
import {
  generateWorkbook,
  type FitCheck,
  type GeneratedPage,
  type GeneratedWorkbook,
  type PageStore,
  type WorkbookDraftStore,
} from "@/lib/workbook-generator";
import { planNextWorkbook } from "@/lib/workbook-placement";
import { IMAGE_SCALE, PRINT_PAGE, proofPages, renderWorkbook, type DraftPage, type PrintEngine, type RenderProblem, type WorkbookTemplate } from "@/lib/workbook-render";

/** Attempts of one run in all: the first and one retry. */
export const RUN_ATTEMPTS = 2;
/** A run whose holder made no progress for this long has stopped: past the 300 s function limit, with a margin. */
export const STALE_SECONDS = 360;
/** Day pages written at the same time when the caller does not say. */
export const PAGE_CONCURRENCY = 4;
/** How long one job call works before it hands the run on (the function stops at 300 s). */
export const CALL_BUDGET_MS = 240_000;
/** No new day page starts this close to the budget: a page in flight takes up to about this long. */
const PAGE_MARGIN_MS = 150_000;
/** The render starts only with at least this much of the budget left; else it runs in the next call. */
const RENDER_MS = 150_000;

export type RunStatus = "queued" | "running" | "done" | "failed" | "stale";
export type RunStep = "plan" | "write" | "render" | "save";

export interface RunError {
  attempt: number;
  at: string;
  error: string;
}

export interface WorkbookRun {
  id: string;
  createdAt: string;
  parentId: string;
  childId: string;
  /** The workbook number the run makes: the child's highest stored workbook number plus 1. */
  number: number;
  status: RunStatus;
  step: RunStep | null;
  attempts: number;
  maxAttempts: number;
  /** Day pages written, of all; null before the writing starts. */
  donePages: number | null;
  totalPages: number | null;
  heartbeatAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  errors: RunError[];
  draftId: string | null;
  /** The id of the draft the run writes, fixed when it starts. */
  draftKey: string;
  /** How many times a new job call took the run up again. */
  resumes: number;
  startedBy: { id: string | null; email: string | null };
}

/**
 * A draft revision's rendering: the PDF of the pages that rendered, and each page's image with its question boxes. A
 * page that did not render has a proof image (`proof`): its failure marked on it, no boxes, never printed.
 */
export interface DraftRendering {
  pdfPath: string | null;
  pages: { number: number; image: PageImage; questions: { number: number; box: QuestionBox }[]; proof?: boolean }[];
}

export type StartResult =
  | { status: "started"; runId: string }
  | { status: "busy"; runId: string }
  /** The child's run stopped mid-way: take it up again (resume) instead of starting over. */
  | { status: "stalled"; runId: string }
  | { status: "refused"; reason: string };

/** Who starts a run: the admin. */
export interface RunActor {
  id: string;
  email: string;
}

/**
 * The runs' store. Adapters: Supabase (src/lib/workbook-job-store.ts, the functions of migrations add_workbook_runs and
 * workbook_run_resume) and in memory (src/lib/workbook-job-memory.ts). Every write after the start names the lease and
 * changes nothing (false) when the lease no longer holds the run. A database error throws.
 */
export interface WorkbookRunStore {
  /** Adds a queued run, unless one is active ("busy") or stopped mid-way ("stalled"). Writes the audit entry. */
  start(childId: string, by: RunActor, o: { maxAttempts: number; staleSeconds: number }): Promise<StartResult>;
  /** Takes a queued run: running, attempt 1. Null when it is not queued. */
  claim(runId: string, lease: string): Promise<WorkbookRun | null>;
  /** Takes up a running run that no one holds, or whose holder made no progress for `staleSeconds`. Null otherwise. */
  resume(runId: string, lease: string, staleSeconds: number): Promise<WorkbookRun | null>;
  /** The holder lets go, to go on in a new job call. */
  yield(runId: string, lease: string): Promise<boolean>;
  /** The step and progress, with a heartbeat. */
  progress(runId: string, lease: string, p: { step: RunStep; done?: number; total?: number }): Promise<boolean>;
  held(runId: string, lease: string): Promise<boolean>;
  /** The run's finished day pages. */
  pages(runId: string): Promise<GeneratedPage[]>;
  /** Stores a finished day page (the first stored wins), with a heartbeat. */
  savePage(runId: string, lease: string, page: GeneratedPage): Promise<boolean>;
  /** Keeps the attempt's error and starts the next attempt; false too when no attempt is left. */
  retry(runId: string, lease: string, error: string): Promise<boolean>;
  fail(runId: string, lease: string, error: string): Promise<boolean>;
  /** Done: the run names the draft, the draft's revision 1 holds the rendering, and the audit entry, in one step. */
  finish(runId: string, lease: string, o: { draftId: string; rendering: DraftRendering | null; problems: RenderProblem[] }): Promise<boolean>;
  run(runId: string): Promise<WorkbookRun | null>;
}

/** What the job reads about the child. */
export interface ChildInputs {
  parentId: string;
  /** The child's first name, as the cover prints it. */
  name: string;
  grade: Grade;
  /** The child's curriculum, as signup stores it ("BC"). */
  province: string;
  /** The current child profile with its revision, or null. */
  profile: { revision: number; profile: ChildLearnerProfile } | null;
  workbooks: { number: number; levels: number[] }[];
}

export interface WorkbookJobSource {
  /** Null when there is no such child. */
  inputs(childId: string): Promise<ChildInputs | null>;
}

export interface WorkbookJobDeps {
  runs: WorkbookRunStore;
  source: WorkbookJobSource;
  drafts: WorkbookDraftStore;
  files: WorkbookFiles;
  /** Null: the AI is off, and the run fails with that reason. */
  ai: AiClient | null;
  /** The page templates: the real ones (#310) in live use. */
  template: WorkbookTemplate;
  /** The fit check of each written page: the templates' strict check through the renderer in live use. */
  fit: (parentId: string) => FitCheck;
  engine: PrintEngine;
  /** A new UUID: leases. */
  newId(): string;
  /** A new QR token for a page. */
  qrToken(): string;
  /** A new file key for a render's file names. */
  fileKey(): string;
  /** The clock, in milliseconds. */
  now(): number;
  /** Day pages written at the same time; PAGE_CONCURRENCY when not given. */
  concurrency?: number;
  /** How long this call works before it hands the run on; CALL_BUDGET_MS when not given. */
  budgetMs?: number;
  /** Starts a new job call that takes the run up again (the resume route); none: the next start takes it up. */
  handOff?(runId: string): Promise<void>;
  /** The time limit of one AI call; the generator's default when not given. */
  timeLimitMs?: number;
}

export type JobOutcome = "done" | "failed" | "stale" | "handed-on" | "not-claimed";

/** Starts a run for the child with the job's limits. */
export const startWorkbookRun = (runs: WorkbookRunStore, childId: string, by: RunActor) =>
  runs.start(childId, by, { maxAttempts: RUN_ATTEMPTS, staleSeconds: STALE_SECONDS });

/** What a run looks like now: a running run with no progress for STALE_SECONDS has stopped, even before a start marks it. */
export type RunState = "waiting" | "preparing" | "stopped" | "failed" | "done";

export function runState(run: Pick<WorkbookRun, "status" | "heartbeatAt" | "createdAt">, now: Date): RunState {
  if (run.status === "done") return "done";
  if (run.status === "failed") return "failed";
  if (run.status === "stale") return "stopped";
  const last = Date.parse(run.heartbeatAt ?? run.createdAt);
  if (now.getTime() - last > STALE_SECONDS * 1000) return "stopped";
  return run.status === "queued" ? "waiting" : "preparing";
}

/** A refusal: the run fails at once, with no retry. */
class Refusal extends Error {}

/** The lease was lost: the run was taken up by another call, and this one must write nothing more. */
class Stopped extends Error {}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The curriculum key of a signup curriculum: only BC has a map. */
const CURRICULUM_KEYS: Record<string, string> = { BC: "bc" };

const draftPage = (p: GeneratedPage): DraftPage => ({
  number: p.number,
  dayLabel: p.dayLabel,
  type: p.type,
  qrToken: p.qrToken,
  questions: p.questions.flatMap((q) => (q.package ? [{ number: q.number, package: q.package }] : [])),
  content: p.content,
});

/** Render rounds: each leaves out the pages that failed the last. */
const RENDER_ROUNDS = 3;

/** The size of a proof image: the page at the image scale. */
const PROOF_SIZE = { width: Math.round(PRINT_PAGE.width * IMAGE_SCALE), height: Math.round(PRINT_PAGE.height * IMAGE_SCALE) };

/**
 * Renders the draft and stores the files: the pages that render, with their PDF, and a proof image of each page that
 * does not, with its problems. Returns the paths stored, so a refused finish removes them.
 */
async function renderDraft(draft: GeneratedWorkbook, parentId: string, deps: WorkbookJobDeps) {
  const problems: RenderProblem[] = [];
  const book = { id: draft.id, childId: draft.childId, number: draft.number, levels: draft.levels, profileBuild: draft.profileBuild };
  let pages = draft.pages.map(draftPage);
  const key = deps.fileKey();
  const stored: string[] = [];
  const put = async (file: Parameters<WorkbookFiles["put"]>[0]) => {
    stored.push(file.path);
    await deps.files.put(file);
  };
  const proofs: DraftRendering["pages"] = [];
  try {
    for (let round = 0; round < RENDER_ROUNDS && pages.length > 0; round++) {
      const result = await renderWorkbook({ draft: { ...book, pages }, parentId, template: deps.template, engine: deps.engine, fileKey: `${key}r${round}` });
      if (result.status === "failed") {
        problems.push(...result.problems);
        const bad = new Set(result.problems.map((p) => p.page));
        const failing = pages.filter((p) => bad.has(p.number));
        for (const proof of await proofPages({ draft: { ...book, pages: failing }, template: deps.template, engine: deps.engine, problems: result.problems })) {
          const path = `${parentId}/${draft.id}/proof-${proof.page}-${key}r${round}.png`;
          await put({ path, contentType: "image/png", bytes: proof.png });
          proofs.push({ number: proof.page, image: { path, ...PROOF_SIZE }, questions: [], proof: true });
        }
        pages = pages.filter((p) => !bad.has(p.number));
        continue;
      }
      for (const file of result.files) await put(file);
      const rendered = result.workbook.pages.map((p) => ({ number: p.number, image: p.image!, questions: p.questions.map((q) => ({ number: q.number, box: q.box })) }));
      return { rendering: { pdfPath: result.workbook.pdfPath!, pages: [...rendered, ...proofs].sort((a, b) => a.number - b.number) }, problems, paths: stored };
    }
  } catch (e) {
    await deps.files.remove(stored).catch(() => undefined);
    throw e;
  }
  return { rendering: proofs.length ? { pdfPath: null, pages: proofs.sort((a, b) => a.number - b.number) } : null, problems, paths: stored };
}

/**
 * Runs one run until it is done, fails, or hands on near the time budget. `resume`: take up a running run (a hand-over,
 * or a run that stopped) instead of a queued one. Never throws: every failure is stored on the run. "not-claimed": the
 * run was not there to take (another call took it, or it ended).
 */
export async function runWorkbookJob(runId: string, deps: WorkbookJobDeps, o: { resume?: boolean } = {}): Promise<JobOutcome> {
  const { runs } = deps;
  const lease = deps.newId();
  const started = deps.now();
  const budget = deps.budgetMs ?? CALL_BUDGET_MS;
  let run: WorkbookRun | null;
  try {
    run = o.resume ? await runs.resume(runId, lease, STALE_SECONDS) : await runs.claim(runId, lease);
  } catch (e) {
    console.error("[workbook job] claim failed", runId, message(e));
    return "not-claimed";
  }
  if (!run) return "not-claimed";
  const claimed = run;

  // The lease, as the last write saw it. Progress writes go one after another, and never fail the job.
  let lost = false;
  let pending: Promise<void> = Promise.resolve();
  const progress = (p: Parameters<WorkbookRunStore["progress"]>[2]) => {
    pending = pending.then(async () => {
      if (lost) return;
      try {
        if (!(await runs.progress(runId, lease, p))) lost = true;
      } catch (e) {
        console.error("[workbook job] progress failed", runId, message(e));
      }
    });
    return pending;
  };
  const check = async () => {
    await pending;
    if (lost) throw new Stopped("the run was taken up by another call");
  };
  const handOn = async (): Promise<JobOutcome> => {
    await pending;
    if (lost || !(await runs.yield(runId, lease))) return "stale";
    try {
      await deps.handOff?.(runId);
    } catch (e) {
      // The run has no holder now: the next "Prepare next workbook" takes it up.
      console.error("[workbook job] hand-over failed", runId, message(e));
    }
    return "handed-on";
  };
  const left = () => budget - (deps.now() - started);

  for (;;) {
    try {
      let draft = await deps.drafts.draft(claimed.draftKey);
      if (!draft) {
        const written = await write(claimed, deps, lease, progress, check, () => lost, (v) => { lost = v; }, () => left() < PAGE_MARGIN_MS);
        if (written === "paused") return await handOn();
        draft = written;
      }
      if (left() < RENDER_MS) return await handOn();
      await progress({ step: "render" });
      await check();
      const rendered = await renderDraft(draft, claimed.parentId, deps);
      await progress({ step: "save" });
      const finished = await runs.finish(runId, lease, { draftId: draft.id, rendering: rendered.rendering, problems: rendered.problems });
      if (!finished) {
        await deps.files.remove(rendered.paths).catch(() => undefined);
        return "stale";
      }
      return "done";
    } catch (e) {
      if (e instanceof Stopped || lost) return "stale";
      const error = message(e);
      try {
        if (e instanceof Refusal) return (await runs.fail(runId, lease, error)) ? "failed" : "stale";
        console.error("[workbook job] attempt failed", runId, error);
        if (await runs.retry(runId, lease, error)) continue;
        return (await runs.fail(runId, lease, error)) ? "failed" : "stale";
      } catch (e2) {
        console.error("[workbook job] could not store the failure", runId, message(e2));
        return "failed";
      }
    }
  }
}

/** Steps 1 and 2: the plan, then the day pages (the stored ones kept), then the draft, stored. "paused": out of time. */
async function write(
  run: WorkbookRun, deps: WorkbookJobDeps, lease: string,
  progress: (p: Parameters<WorkbookRunStore["progress"]>[2]) => Promise<void>, check: () => Promise<void>,
  isLost: () => boolean, setLost: (v: boolean) => void, outOfTime: () => boolean,
): Promise<GeneratedWorkbook | "paused"> {
  await progress({ step: "plan" });
  await check();
  const inputs = await deps.source.inputs(run.childId);
  if (!inputs) throw new Refusal("The child is not known.");
  const key = CURRICULUM_KEYS[inputs.province];
  const curriculum = key ? curriculumFor(key) : null;
  if (!curriculum) throw new Refusal(`There is no workbook curriculum for ${inputs.province} yet. Only BC has one.`);
  if (!deps.ai) throw new Refusal("The AI is off: OPENROUTER_API_KEY is not set.");
  const planned = planNextWorkbook({ curriculum, grade: inputs.grade, profile: inputs.profile?.profile ?? null, workbooks: inputs.workbooks, number: run.number });
  if (!planned.ok) throw new Refusal(`The plan could not be made: ${planned.reason}.`);

  const ai = deps.ai;
  const guardedAi: AiClient = {
    model: ai.model,
    json: async (request, signal) => {
      if (isLost()) throw new Stopped("the run was taken up by another call");
      return ai.json(request, signal);
    },
  };
  const guardedDrafts: WorkbookDraftStore = {
    draft: (id) => deps.drafts.draft(id),
    async save(d) {
      await check();
      if (!(await deps.runs.held(run.id, lease))) {
        setLost(true);
        return { status: "refused", reason: "the run was taken up by another call" };
      }
      return deps.drafts.save(d);
    },
  };
  const pages: PageStore = {
    load: () => deps.runs.pages(run.id),
    async save(page) {
      if (isLost() || !(await deps.runs.savePage(run.id, lease, page))) {
        setLost(true);
        throw new Stopped("the run was taken up by another call");
      }
    },
  };
  const result = await generateWorkbook(
    {
      workbookId: run.draftKey, childId: run.childId, child: inputs.name, number: run.number,
      profileBuild: inputs.profile ? `child profile revision ${inputs.profile.revision}` : null,
      plan: planned.plan, curriculum,
    },
    {
      ai: guardedAi, fit: deps.fit(inputs.parentId), store: guardedDrafts, qrToken: deps.qrToken, pages,
      concurrency: deps.concurrency ?? PAGE_CONCURRENCY, stop: () => isLost() || outOfTime(), timeLimitMs: deps.timeLimitMs,
      progress: (done, total) => { void progress({ step: "write", done, total }); },
    },
  );
  if (isLost()) throw new Stopped("the run was taken up by another call");
  if (result.status === "paused") return "paused";
  if (result.status === "refused") throw new Refusal(`The draft was not stored: ${result.reason}.`);
  return result.draft;
}
