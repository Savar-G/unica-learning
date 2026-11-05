// "Prepare next workbook" (#312, spec #296): the background job that makes a child's next draft workbook, the same
// pattern as the report job (src/lib/report-job.ts): the admin route starts a run and answers at once, and the job runs
// after the response. Its state is stored on the run (public.workbook_runs, migrations add_workbook_runs and
// workbook_run_resume):
//   1. plan: the child's grade, curriculum, profile and stored workbooks (the source seam), placed and planned
//      (src/lib/workbook-placement.ts, the two-week plan #308).
//   2. write: the generator (#311, src/lib/workbook-generator.ts) writes the day pages with the AI, `concurrency` pages
//      at a time, and checks every answer and every page's fit against the real templates (#310). Each finished page
//      is stored on the run (public.workbook_run_pages) as it is done; the run shows "12 of 80 day pages". Each AI
//      attempt of a question is counted on the run before its call (public.workbook_run_attempts), so a retry or a
//      resume never gives a question a fourth attempt, even when its page was never stored. Each AI call of a page is
//      stored on the run as soon as it comes back, built and checked, with the attempts it counted
//      (public.workbook_run_calls, R379-7-1): a retry or a resume replays a page's stored calls instead of asking the
//      AI again, so no paid attempt is lost and the draft is the one an uninterrupted run makes. The solve check (#380,
//      src/lib/workbook-solve-check.ts) reads each printed question the AI worded; each check is stored on the run with
//      its cost (public.workbook_run_solves) as it comes back, keyed by its call and question (R379-8-1): the call is
//      stored before its checks start, and a resume runs only the checks with no stored result.
//   The plan is made once per run (R379-8-2): the first job call reads the child, plans the workbook and stores the
//   plan with its inputs and fingerprints (public.workbook_run_frames, RunFrame), under the lease. Every later call
//   reads that plan, never the child's profile, grade or workbooks again, and refuses to go on (the run fails, with
//   the reason) when the curriculum, the planned book (layouts, rooms), the AI or solve model or the deployed code
//   changed since, or when a stored page, attempt or call does not fit the plan (ResumeMismatch).
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
import { isGrade, type Grade } from "@/lib/assessment";
import type { AiClient } from "@/lib/ai-client";
import type { ChildLearnerProfile } from "@/lib/child-profile";
import type { RenderedPage, WorkbookFiles } from "@/lib/workbook-content";
import { curriculumFor, curriculumVersion } from "@/lib/workbook-curriculum";
import {
  bookOutline,
  workbookCapacityPlan,
  prepareWorkbookCapacity,
  generateWorkbook,
  ResumeMismatch,
  type AttemptLedger,
  type CallStore,
  type FitCheck,
  type GeneratedPage,
  type GeneratedWorkbook,
  type GenerateInput,
  type PageStore,
  type StoredCall,
  type WorkbookDraftStore,
} from "@/lib/workbook-generator";
import { planNextWorkbook } from "@/lib/workbook-placement";
import type { WorkbookPlan } from "@/lib/workbook-plan";
import type { SolveLog, Solver, SolveVerdict } from "@/lib/workbook-solve-check";
import { IMAGE_SCALE, PRINT_PAGE, proofPages, renderedPages, renderWorkbook, type DraftPage, type PrintEngine, type RenderProblem, type WorkbookTemplate } from "@/lib/workbook-render";

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
  /** Where the run is made (D-200): on the server (Vercel, the API) or by the workbook worker on Savar's Mac. */
  runner: RunRunner;
}

/** Where a run is made: "server" (the site, on Vercel) or "mac" (the workbook worker, src/lib/workbook-worker.ts). */
export type RunRunner = "server" | "mac";

/**
 * A draft revision's rendering: the PDF of the pages that rendered, and each page's image with its question boxes. A
 * page that did not render has a proof image (`proof`): its failure marked on it, no boxes, never printed. Each rendered
 * page keeps its print contract and each question its regions (#536); `contractProblem` says why a page has no contract.
 * A revision stored before #536 has none of these.
 */
export interface DraftRendering {
  pdfPath: string | null;
  pdfSha256?: string | null;
  pages: (RenderedPage & { proof?: boolean; contractProblem?: string | null })[];
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
  claim(runId: string, lease: string, runner?: RunRunner): Promise<WorkbookRun | null>;
  /** Takes up a running run that no one holds, or whose holder made no progress for `staleSeconds`. Null otherwise. */
  resume(runId: string, lease: string, staleSeconds: number, runner?: RunRunner): Promise<WorkbookRun | null>;
  /** Renews only the current running lease. */
  renew(runId: string, lease: string): Promise<boolean>;
  /** The holder lets go, to go on in a new job call. */
  yield(runId: string, lease: string): Promise<boolean>;
  /** The step and progress, with a heartbeat. */
  progress(runId: string, lease: string, p: { step: RunStep; done?: number; total?: number }): Promise<boolean>;
  /**
   * Stores the run's draft (its id is the run's draft key) only while `lease` holds the run, checked and inserted in
   * one step (R379-1): "lost" stores nothing; "used" means an earlier attempt of the holder stored it.
   */
  saveDraft(runId: string, lease: string, draft: GeneratedWorkbook): Promise<"saved" | "lost" | "used" | { refused: string }>;
  /** The run's finished day pages. */
  pages(runId: string): Promise<GeneratedPage[]>;
  /** The AI attempts each question slot of the run used, by "<book page>:<slot>". */
  attempts(runId: string): Promise<Map<string, number>>;
  /**
   * Counts one AI attempt of each slot, before the call (R379-2-1), refusing a slot that used both (R379-3-1): the
   * refused slots, or null (nothing counted) when the lease is lost.
   */
  useAttempts(runId: string, lease: string, page: number, slots: string[]): Promise<{ refused: string[] } | null>;
  /** The stored AI calls of these book pages of the run (R379-7-1). */
  calls(runId: string, pages: number[]): Promise<{ page: number; seq: number; call: StoredCall }[]>;
  /**
   * Stores one AI call of a page (the first stored at its page and place wins), with a heartbeat, only while `lease`
   * holds the run: false (nothing stored) when the lease is lost.
   */
  saveCall(runId: string, lease: string, page: number, seq: number, call: StoredCall): Promise<boolean>;
  /**
   * Stores solve checks of the run (at most SOLVE_BATCH at a time), with a heartbeat; false when the lease is lost. A
   * check with a `callKey` already stored under that key is not stored again (the first stays).
   */
  saveSolves(runId: string, lease: string, solves: RunSolve[]): Promise<boolean>;
  /** The verdicts of the run's solve checks that have a call key, by that key (R379-8-1). */
  solves(runId: string): Promise<Map<string, SolveVerdict>>;
  /** The run's plan, as its first job call stored it (R379-8-2); null before. */
  frame(runId: string): Promise<RunFrame | null>;
  /** Stores the run's plan, with a heartbeat, only while `lease` holds the run (false: nothing stored); the first stays. */
  saveFrame(runId: string, lease: string, frame: RunFrame): Promise<boolean>;
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

/** The shape version of a stored RunFrame. */
export const RUN_FRAME_VERSION = 1;

/**
 * What a run is made from, stored once by its first job call (R379-8-2), so every later call makes the same book: the
 * child's inputs the plan read (grade, curriculum, profile revision, stored workbooks; never the profile's content or
 * the child's name), the plan itself, and the fingerprints a later call must find unchanged.
 */
export interface RunFrame {
  version: number;
  /** Old frames retain the original item pipeline. New frames pin the approved policy. */
  itemPolicy?: "approved-v1";
  /** The curriculum key ("bc"). */
  curriculum: string;
  grade: Grade;
  /** The child profile revision the plan was made from, or null. */
  profileRevision: number | null;
  workbooks: { number: number; levels: number[] }[];
  plan: WorkbookPlan;
  versions: {
    /** curriculumVersion of the curriculum. */
    curriculum: string;
    /** bookOutline of the planned book: its pages, layouts, rooms and planned slots. */
    outline: string;
    /** The AI model and the solve check's model. */
    model: string;
    solveModel: string;
    /** The deployed code's version (WorkbookJobDeps.build); null where none is known (development). */
    build: string | null;
  };
}

export interface WorkbookJobSource {
  /** Read only the report recommendation, test duration and device for this plan's assessment. */
  planningMetadata?(assessmentId: string): Promise<Pick<import("./workbook-signals").BookSignalsInput, "report" | "device">>;
  /** Null when there is no such child. */
  inputs(childId: string): Promise<ChildInputs | null>;
  /** Refreshes the profiles only before the run has a frame. False refuses a book from incomplete assessment facts. */
  prepareProfile(childId: string): Promise<{ ok: true; profile: ChildInputs["profile"] } | { ok: false }>;
}

/**
 * One solve check as the run stores it: the question's package id, the reader's model, the verdict, its time, its cost
 * in US dollars (null when the provider did not say) and what the reader saw, answered and was compared with.
 */
export interface RunSolve {
  /** Its key on the run (solveKey: call and question, R379-8-1); a resume reads its verdict instead of checking again. */
  callKey?: string;
  questionId: string;
  model: string;
  verdict: SolveVerdict["status"];
  ms: number;
  usd: number | null;
  /** `answers`: what the reader answered, as JSON text (at most SOLVE_ANSWERS_MOST characters; "null" for nothing). */
  log: Pick<SolveLog, "questions" | "key" | "verdict"> & { answers: string };
}

/** The most characters of a reader's answer kept in the log. */
export const SOLVE_ANSWERS_MOST = 4000;

/** Solve checks stored in one write. */
export const SOLVE_BATCH = 500;

export interface WorkbookJobDeps {
  /** Pin a new run to the old policy only for compatibility checks or rollback. */
  itemPolicy?: "approved-v1" | "legacy";
  runs: WorkbookRunStore;
  runner?: RunRunner;
  source: WorkbookJobSource;
  drafts: WorkbookDraftStore;
  files: WorkbookFiles;
  /** Null: the AI is off, and the run fails with that reason. */
  ai: AiClient | null;
  /** The solve check's reader (#380), from the same switch as `ai`: null when the AI is off. */
  solver: Solver | null;
  /** The cost of one solve check in US dollars, when the reader's provider said it; none: not known. */
  solveCost?(log: SolveLog): number | null;
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
  /**
   * The deployed code's version (the commit): a run goes on only on the code it started on (R379-8-2), since the
   * templates, the wording and the checks are code. None: not known (development), and not compared.
   */
  build?: string | null;
}

export type JobOutcome = "done" | "failed" | "stale" | "handed-on" | "not-claimed";

/**
 * The AI attempts a question slot may use: the generator's rule (one per reason it is written: the first call, the redo
 * of a failed check, the shorter rewrite of a page that did not fit; GeneratedQuestion.attempts is 1 to 3), which the
 * runs' store enforces too (count_workbook_run_attempts takes it as p_max).
 */
export const SLOT_ATTEMPTS = 3;
/** Rows a paged read asks for at a time: the database answers at most 1000 rows a request. */
export const READ_PAGE = 1000;

/**
 * Every row of an ordered read, page by page (R379-3-1): one request returns at most `size` rows (the server's row
 * limit), so it reads until a page comes back short.
 */
export async function readPaged<T>(page: (from: number, to: number) => Promise<T[]>, size = READ_PAGE): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const rows = await page(from, from + size - 1);
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

/** Starts a run for the child with the job's limits. */
export const startWorkbookRun = (runs: WorkbookRunStore, childId: string, by: RunActor) =>
  runs.start(childId, by, { maxAttempts: RUN_ATTEMPTS, staleSeconds: STALE_SECONDS });

/**
 * What a run looks like now: a running run with no progress for STALE_SECONDS has stopped, even before a start marks it.
 * A queued run for the Mac (D-200) waits for the workbook worker however long that takes: it has not stopped.
 */
export type RunState = "waiting" | "preparing" | "stopped" | "failed" | "done";

export function runState(run: Pick<WorkbookRun, "status" | "heartbeatAt" | "createdAt"> & { runner?: RunRunner }, now: Date): RunState {
  if (run.status === "done") return "done";
  if (run.status === "failed") return "failed";
  if (run.status === "stale") return "stopped";
  if (run.status === "queued" && run.runner === "mac") return "waiting";
  const last = Date.parse(run.heartbeatAt ?? run.createdAt);
  if (now.getTime() - last > STALE_SECONDS * 1000) return "stopped";
  return run.status === "queued" ? "waiting" : "preparing";
}

/** A refusal: the run fails at once, with no retry. */
class Refusal extends Error {}

/** The lease was lost: the run was taken up by another call, and this one must write nothing more. */
class Stopped extends Error {}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The refusal of a call that finds what the run was made from changed since it started (R379-8-2). */
const changed = (what: string, was: string | null, is: string | null) =>
  new Refusal(`The run cannot go on: ${what} changed since it started (${was ?? "none"} then, ${is ?? "none"} now). Start a new run.`);

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
/**
 * The failures a reviewer must see on a page besides the render's, as the sample books mark them (#380, R379-4-1):
 * each failed question (one with no package names no question: its slot has a placeholder) and each fit check failure.
 */
export function draftReviewProblems(draft: GeneratedWorkbook): RenderProblem[] {
  return [
    ...draft.pages.flatMap((p) => p.questions.flatMap((q) => (q.check.status === "failed"
      ? [{ page: p.number, question: q.package ? q.number : null, reason: `question ${q.number} failed: ${q.check.reason}` }] : []))),
    ...draft.pages.flatMap((p) => (p.fit.status === "failed" ? p.fit.problems.map((x) => ({ page: p.number, question: x.question, reason: `fit check: ${x.reason}` })) : [])),
  ];
}

async function renderDraft(draft: GeneratedWorkbook, parentId: string, deps: WorkbookJobDeps) {
  // A page with a failed question or a failed fit check is shown as a proof, even when it renders (R379-4-1).
  const problems: RenderProblem[] = draftReviewProblems(draft);
  const book = { id: draft.id, childId: draft.childId, number: draft.number, levels: draft.levels, profileBuild: draft.profileBuild };
  const marked = new Set(problems.map((p) => p.page));
  let pages = draft.pages.map(draftPage);
  const key = deps.fileKey();
  const stored: string[] = [];
  const put = async (file: Parameters<WorkbookFiles["put"]>[0]) => {
    stored.push(file.path);
    await deps.files.put(file);
  };
  const proofs: DraftRendering["pages"] = [];
  const proof = async (failing: DraftPage[], found: RenderProblem[], tag: string) => {
    for (const shot of await proofPages({ draft: { ...book, pages: failing }, template: deps.template, engine: deps.engine, problems: found })) {
      const path = `${parentId}/${draft.id}/proof-${shot.page}-${key}${tag}.png`;
      await put({ path, contentType: "image/png", bytes: shot.png });
      proofs.push({ number: shot.page, image: { path, ...PROOF_SIZE }, questions: [], proof: true });
    }
  };
  try {
    if (marked.size > 0) {
      await proof(pages.filter((p) => marked.has(p.number)), problems, "q");
      pages = pages.filter((p) => !marked.has(p.number));
    }
    for (let round = 0; round < RENDER_ROUNDS && pages.length > 0; round++) {
      const result = await renderWorkbook({ draft: { ...book, pages }, parentId, template: deps.template, engine: deps.engine, fileKey: `${key}r${round}` });
      if (result.status === "failed") {
        problems.push(...result.problems);
        const bad = new Set(result.problems.map((p) => p.page));
        await proof(pages.filter((p) => bad.has(p.number)), result.problems, `r${round}`);
        pages = pages.filter((p) => !bad.has(p.number));
        continue;
      }
      for (const file of result.files) await put(file);
      return { rendering: { pdfPath: result.workbook.pdfPath!, pdfSha256: result.workbook.pdfSha256 ?? null, pages: [...renderedPages(result), ...proofs].sort((a, b) => a.number - b.number) }, problems, paths: stored };
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
    run = o.resume ? await runs.resume(runId, lease, STALE_SECONDS, deps.runner ?? "server") : await runs.claim(runId, lease, deps.runner ?? "server");
  } catch (e) {
    console.error("[workbook job] claim failed", runId, message(e));
    return "not-claimed";
  }
  if (!run) return "not-claimed";
  const claimed = run;

  // Renew throughout work. A failed renewal or progress write stops AI calls under this lease.
  let lost = false;
  const stop = new AbortController();
  const loseLease = () => { lost = true; stop.abort(); };
  let renewing: Promise<void> | null = null;
  const renew = () => renewing ??= (async () => {
    try {
      if (!(await runs.renew(runId, lease))) loseLease();
    } catch {
      loseLease();
    }
  })().finally(() => { renewing = null; });
  const timer = setInterval(() => { void renew(); }, 30_000);
  let pending: Promise<void> = Promise.resolve();
  const progress = (p: Parameters<WorkbookRunStore["progress"]>[2]) => {
    pending = pending.then(async () => {
      if (lost) return;
      try {
        if (!(await runs.progress(runId, lease, p))) loseLease();
      } catch (e) {
        console.error("[workbook job] progress failed", runId, message(e));
        loseLease();
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

  try {
    for (;;) {
      try {
        let draft = await deps.drafts.draft(claimed.draftKey);
        if (draft) {
          // A call that only renders the stored draft renders it with the templates of the code the run started on.
          const frame = await runs.frame(runId);
          if (frame && frame.versions.build !== (deps.build ?? null)) throw changed("the site's code", frame.versions.build, deps.build ?? null);
        } else {
          const written = await write(claimed, deps, lease, progress, check, () => lost, (v) => { if (v) loseLease(); }, () => left() < PAGE_MARGIN_MS, stop.signal, renew);
          if (written === "paused") return await handOn();
          // The stored draft is the truth: an earlier attempt of this holder may have stored it ("used").
          draft = (await deps.drafts.draft(claimed.draftKey)) ?? written;
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
        const error = e instanceof ResumeMismatch ? `The run cannot go on: ${e.message}. Start a new run.` : message(e);
        try {
          if (e instanceof Refusal || e instanceof ResumeMismatch) return (await runs.fail(runId, lease, error)) ? "failed" : "stale";
          console.error("[workbook job] attempt failed", runId, error);
          if (await runs.retry(runId, lease, error)) continue;
          return (await runs.fail(runId, lease, error)) ? "failed" : "stale";
        } catch (e2) {
          console.error("[workbook job] could not store the failure", runId, message(e2));
          return "failed";
        }
      }
    }
  } finally {
    clearInterval(timer);
    await renewing;
  }
}

/** The generator's input from a run's plan and the child's name (printed only: the plan never reads it). */
const generateInput = (run: WorkbookRun, frame: RunFrame, name: string): GenerateInput => ({
  workbookId: run.draftKey, childId: run.childId, book: { child: name }, number: run.number,
  profileBuild: frame.profileRevision !== null ? `child profile revision ${frame.profileRevision}` : null,
  plan: frame.plan, curriculum: curriculumFor(frame.curriculum)!, itemPolicy: frame.itemPolicy,
});

/**
 * The run's plan (R379-8-2): the one its first job call stored; else (this is the first call) the child's inputs read
 * now, planned and stored under the lease (the first stored stays, and is the one used). Refused when a later call finds
 * what the plan was made from changed: the curriculum, the planned book, the models or the deployed code. A run with
 * pages or attempts but no stored plan was started before plans were stored: refused too (it cannot be resumed safely).
 */
async function runFrame(run: WorkbookRun, deps: WorkbookJobDeps & { ai: AiClient; solver: Solver }, lease: string, name: string, inputs: ChildInputs): Promise<RunFrame> {
  let frame = await deps.runs.frame(run.id);
  if (!frame) {
    if (run.resumes > 0 || (await deps.runs.pages(run.id)).length > 0 || (await deps.runs.attempts(run.id)).size > 0) {
      throw new Refusal("This run has no stored plan, so it cannot resume safely. Start a new run.");
    }
    const key = CURRICULUM_KEYS[inputs.province];
    const curriculum = key ? curriculumFor(key) : null;
    if (!key || !curriculum) throw new Refusal(`There is no workbook curriculum for ${inputs.province} yet. Only BC has one.`);
    const prepared = await deps.source.prepareProfile(run.childId);
    if (!prepared.ok) throw new Refusal(`We couldn't build ${name}'s profile from the assessment. Try again, or check the admin profile page.`);
    inputs = { ...inputs, profile: prepared.profile };
    const assessmentId = inputs.profile?.profile.assessment?.assessmentId;
    const metadata = assessmentId ? await deps.source.planningMetadata?.(assessmentId) : undefined;
    const planned = planNextWorkbook({ ...metadata, curriculum, grade: inputs.grade, profile: inputs.profile?.profile ?? null, workbooks: inputs.workbooks, number: run.number });
    if (!planned.ok) throw new Refusal(`The plan could not be made: ${planned.reason}.`);
    const made: RunFrame = {
      version: RUN_FRAME_VERSION, ...(deps.itemPolicy === "legacy" ? {} : { itemPolicy: "approved-v1" as const }), curriculum: key, grade: inputs.grade, profileRevision: inputs.profile?.revision ?? null, workbooks: inputs.workbooks,
      plan: deps.itemPolicy === "legacy" ? planned.plan : workbookCapacityPlan(curriculum, planned.plan), versions: { curriculum: "", outline: "", model: deps.ai.model, solveModel: deps.solver.model, build: deps.build ?? null },
    };
    if (made.itemPolicy === "approved-v1") made.plan = await prepareWorkbookCapacity(generateInput(run, made, name), deps.fit(run.parentId));
    made.versions.curriculum = curriculumVersion(key)!;
    made.versions.outline = bookOutline(generateInput(run, made, name));
    if (!(await deps.runs.saveFrame(run.id, lease, made))) throw new Stopped("the run was taken up by another call");
    frame = await deps.runs.frame(run.id);
    if (!frame) throw new Error("the run's plan was not stored");
  }
  // Every call, the first included, checks the stored plan against what this call would make it from.
  if (frame.version !== RUN_FRAME_VERSION || !isGrade(frame.grade) || !frame.plan) throw new Refusal("The run's stored plan is of another shape. Start a new run.");
  const now = curriculumVersion(frame.curriculum);
  if (!now) throw new Refusal(`There is no workbook curriculum ${frame.curriculum} any more. Start a new run.`);
  if (now !== frame.versions.curriculum) throw changed("the curriculum", frame.versions.curriculum, now);
  if ((deps.build ?? null) !== frame.versions.build) throw changed("the site's code", frame.versions.build, deps.build ?? null);
  if (deps.ai.model !== frame.versions.model) throw changed("the AI model", frame.versions.model, deps.ai.model);
  if (deps.solver.model !== frame.versions.solveModel) throw changed("the solve check's model", frame.versions.solveModel, deps.solver.model);
  const outline = bookOutline(generateInput(run, frame, name));
  if (outline !== frame.versions.outline) throw changed("the planned book (its pages, layouts or rooms)", frame.versions.outline, outline);
  return frame;
}

/** Steps 1 and 2: the plan, then the day pages (the stored ones kept), then the draft, stored. "paused": out of time. */
async function write(
  run: WorkbookRun, deps: WorkbookJobDeps, lease: string,
  progress: (p: Parameters<WorkbookRunStore["progress"]>[2]) => Promise<void>, check: () => Promise<void>,
  isLost: () => boolean, setLost: (v: boolean) => void, outOfTime: () => boolean,
  leaseSignal: AbortSignal, renew: () => Promise<void>,
): Promise<GeneratedWorkbook | "paused"> {
  await progress({ step: "plan" });
  await check();
  if (!deps.ai) throw new Refusal("The AI is off: no Claude subscription here and no OPENROUTER_API_KEY.");
  if (!deps.solver) throw new Refusal("The solve check is off: no Claude subscription here and no OPENROUTER_API_KEY.");
  // The child is read for the name the pages print, and (on the first call only) for the plan.
  const inputs = await deps.source.inputs(run.childId);
  if (!inputs) throw new Refusal("The child is not known.");
  const frame = await runFrame(run, { ...deps, ai: deps.ai, solver: deps.solver }, lease, inputs.name, inputs);

  const ai = deps.ai;
  const guardedAi: AiClient = {
    model: ai.model,
    json: async (request, signal) => {
      await renew();
      if (isLost()) throw new Stopped("the run was taken up by another call");
      return ai.json(request, AbortSignal.any([signal, leaseSignal]));
    },
  };
  // The draft is stored by the run's own lease-checked insert (R379-1): a call that lost the run stores nothing.
  const guardedDrafts: WorkbookDraftStore = {
    draft: (id) => deps.drafts.draft(id),
    async save(d) {
      await check();
      const saved = await deps.runs.saveDraft(run.id, lease, d);
      if (saved === "lost") {
        setLost(true);
        return { status: "refused", reason: "the run was taken up by another call" };
      }
      if (typeof saved === "object") return { status: "refused", reason: saved.refused };
      return { status: "saved", draftId: d.id };
    },
  };
  const solver = deps.solver;
  const guardedSolver: Solver = {
    model: solver.model,
    solve: async (request, signal) => {
      await renew();
      if (isLost()) throw new Stopped("the run was taken up by another call");
      return solver.solve(request, AbortSignal.any([signal, leaseSignal]));
    },
  };
  const lose = () => {
    setLost(true);
    throw new Stopped("the run was taken up by another call");
  };
  const attempts: AttemptLedger = {
    max: SLOT_ATTEMPTS,
    load: () => deps.runs.attempts(run.id),
    async use(page, slots) {
      const counted = isLost() ? null : await deps.runs.useAttempts(run.id, lease, page, slots);
      return counted ?? lose();
    },
  };
  // Each call is stored as soon as it is built, before its solve checks (R379-7-1, R379-8-1); each solve check as it
  // comes back, under its key, with its cost (a check of a page that is never stored is kept too: it was paid for).
  const calls: CallStore = {
    load: (numbers) => deps.runs.calls(run.id, numbers),
    async save(page, seq, call) {
      if (isLost() || !(await deps.runs.saveCall(run.id, lease, page, seq, call))) lose();
    },
    async solves(numbers) {
      const wanted = new Set(numbers);
      return new Map([...await deps.runs.solves(run.id)].filter(([key]) => wanted.has(Number(key.slice(0, key.indexOf(":"))))));
    },
    async saveSolve(callKey, log) {
      const solve: RunSolve = {
        callKey, questionId: log.id, model: log.model, verdict: log.verdict.status, ms: Math.max(0, Math.round(log.ms)), usd: deps.solveCost?.(log) ?? null,
        log: { questions: log.questions, answers: (JSON.stringify(log.answers ?? null) ?? "null").slice(0, SOLVE_ANSWERS_MOST), key: log.key, verdict: log.verdict },
      };
      if (isLost() || !(await deps.runs.saveSolves(run.id, lease, [solve]))) lose();
    },
  };
  const pages: PageStore = {
    load: () => deps.runs.pages(run.id),
    async save(page) {
      if (isLost() || !(await deps.runs.savePage(run.id, lease, page))) lose();
    },
  };
  const result = await generateWorkbook(generateInput(run, frame, inputs.name), {
    ai: guardedAi, fit: deps.fit(run.parentId), store: guardedDrafts, qrToken: deps.qrToken, pages, attempts, calls,
    concurrency: deps.concurrency ?? PAGE_CONCURRENCY, stop: () => isLost() || outOfTime(), timeLimitMs: deps.timeLimitMs,
    progress: (done, total) => { void progress({ step: "write", done, total }); },
    solver: guardedSolver, now: deps.now,
  });
  if (isLost()) throw new Stopped("the run was taken up by another call");
  if (result.status === "paused") return "paused";
  if (result.status === "refused") throw new Refusal(`The draft was not stored: ${result.reason}.`);
  return result.draft;
}
