import { WORKBOOK_COUNTS_CALL_EVENTS } from "@/lib/workbook-call-policy";
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
  pagesDigest,
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
import { instructionsEmpty, type WorkbookInstructions } from "@/lib/workbook-instructions";
import { skillUnits } from "@/lib/workbook-teaching-frame";
import type { WorkbookPlan, PlanInput } from "@/lib/workbook-plan";
import type { SolveLog, Solver, SolveVerdict } from "@/lib/workbook-solve-check";
import { openQuestionGateRun, type QuestionGateChecker, type StoredQuestionGate } from "@/lib/workbook-run-gates";
import { checkRenderedPages, pageGateMark, type PageGateChecker, type PageGateMark, type StoredPageGate } from "@/lib/workbook-page-gates";
import { IMAGE_SCALE, PRINT_PAGE, proofPages, renderedPages, renderWorkbook, type DraftPage, type PrintEngine, type RenderProblem, type WorkbookTemplate } from "@/lib/workbook-render";

/** Attempts of one run in all: the first and one retry. */
export const RUN_ATTEMPTS = 2;
/** A run whose holder made no progress for this long has stopped: past the 300 s function limit, with a margin. */
export const STALE_SECONDS = 360;
/** Day pages written at the same time when the caller does not say. */
export const PAGE_CONCURRENCY = 4;
/** How long one job call works before it hands the run on (the function stops at 300 s). */
export const CALL_BUDGET_MS = 240_000;
/** How often a job asks whether an admin stopped the run. A failed read changes nothing: the lease renewal decides. */
export const STOP_CHECK_MS = 10_000;
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
  /** The admin who stopped the run with the Stop button; its time is `finishedAt`. */
  stoppedBy?: string | null;
  /**
   * The next-book snapshot the run was admitted from (#476, admit_next_book_run): its first job call makes the book from
   * the snapshot's saved plan input, never from the child read now. Absent or null: an ordinary run.
   */
  snapshotId?: string | null;
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
  pages: (RenderedPage & { proof?: boolean; contractProblem?: string | null; layoutGate?: PageGateMark })[];
}

export type StartResult =
  | { status: "started"; runId: string }
  | { status: "busy"; runId: string }
  /** The child's run stopped mid-way: take it up again (resume) instead of starting over. */
  | { status: "stalled"; runId: string }
  | { status: "refused"; reason: string };

/**
 * What a stop answers: "stopped" (this stop ended the run), "already" (an admin stopped it before), or how it ended
 * otherwise, so a stop that lost the race to a finish says the run is done.
 */
export type StopResult = "stopped" | "already" | "done" | "failed" | "stale" | "not_found";

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
  /** Stores quality-gate results (the first row at a call key stays). False when the lease is lost. */
  saveGates(runId: string, lease: string, gates: (StoredQuestionGate | StoredPageGate)[]): Promise<boolean>;
  /** Every stored quality-gate result of the run: the questions' and, at "page:<page>", the rendered pages' (#859). */
  gates(runId: string): Promise<(StoredQuestionGate | StoredPageGate)[]>;
  /** The run's plan, as its first job call stored it (R379-8-2); null before. */
  frame(runId: string): Promise<RunFrame | null>;
  /** Whether any page, counted attempt, call or solve check exists, including old solve checks without a call key. */
  hasStoredWork(runId: string): Promise<boolean>;
  /** Stores the run's plan, with a heartbeat, only while `lease` holds the run (false: nothing stored); the first stays. */
  saveFrame(runId: string, lease: string, frame: RunFrame): Promise<boolean>;
  /**
   * Workbook 1 keeps the first pages (docs/first-pages.md), in one step under the lease, before the run has a plan or
   * stored work: the run's draft key becomes the first pages' Workbook 1 id, their day pages and attempts become the
   * run's, the plan is stored, and the first pages name the run. Refused when they are not ready, are hidden, another
   * working or finished run keeps them, or a draft with that id exists.
   */
  adoptFirstPages?(runId: string, lease: string, firstPagesId: string, frame: RunFrame): Promise<AdoptResult>;
  /** Stores a finished day page (the first stored wins), with a heartbeat. */
  savePage(runId: string, lease: string, page: GeneratedPage): Promise<boolean>;
  /** Keeps the attempt's error and starts the next attempt; false too when no attempt is left. */
  retry(runId: string, lease: string, error: string): Promise<boolean>;
  fail(runId: string, lease: string, error: string): Promise<boolean>;
  /** Done: the run names the draft, the draft's revision 1 holds the rendering, and the audit entry, in one step. */
  finish(runId: string, lease: string, o: { draftId: string; rendering: DraftRendering | null; problems: RenderProblem[] }): Promise<boolean>;
  run(runId: string): Promise<WorkbookRun | null>;
  /**
   * An admin ends a queued or running run, in one step with the audit entry and with no lease needed: every later write
   * under the old lease changes nothing, and the next start finds no active run.
   */
  stop(runId: string, by: RunActor): Promise<StopResult>;
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
  /**
   * The admin's book instructions for the child (public.workbook_instructions), read with the child. Only the first job
   * call of a run plans from them; the plan keeps the exact set (plan.instructions), so a later change never reaches a
   * run that has a frame.
   */
  instructions?: WorkbookInstructions | null;
}

/** The shape version of a stored RunFrame. */
export const RUN_FRAME_VERSION = 1;

/**
 * What a run is made from, stored once by its first job call (R379-8-2), so every later call makes the same book: the
 * child's inputs the plan read (grade, curriculum, profile revision, stored workbooks; never the child's name), the plan
 * itself, and the fingerprints a later call must find unchanged. Since #472 it also keeps the planning capture: the
 * frozen profile and report signals the planner read, and its exact PlanInput (admins only, deleted with the family).
 */
export interface RunFrame {
  version: number;
  /** Old frames retain the original item pipeline. New frames pin the approved policy. */
  itemPolicy?: "approved-v1";
  /** The curriculum key ("bc"). */
  curriculum: string;
  /** Each skill's unit in that curriculum, frozen for the print contract's teaching context (#536); absent on older frames. */
  units?: Record<string, string>;
  grade: Grade;
  /** The child profile revision the plan was made from, or null. */
  profileRevision: number | null;
  /** Absent on older frames, which counted call events. */
  countsCallEvents?: boolean;
  /**
   * The planner's exact input, captured at the public planning boundary before it ran, and the placement facts it was
   * made from (#472 Book 1 baseline). Admins read it; it is never shown to a parent. Absent on frames stored before it.
   * It holds the frozen child profile the plan read, because the current profile changes and cannot prove it later.
   */
  planning?: RunPlanningCapture;
  /** A next-book run (#476): the snapshot whose saved plan input made this plan, and that plan's hash. */
  nextBook?: { snapshotId: string; planHash: string };
  workbooks: { number: number; levels: number[] }[];
  plan: WorkbookPlan;
  /**
   * Workbook 1 keeps the first pages its parent saw (docs/first-pages.md): their row, the day pages kept exactly, the
   * cover's QR code, and "keep-plan" when the admin chose their plan after a refusal. Absent on other runs.
   */
  firstPages?: { id: string; pages: number[]; coverToken: string; decision?: "keep-plan" };
  versions: {
    /** curriculumVersion of the curriculum. */
    curriculum: string;
    /** bookOutline of the planned book: its pages, layouts, rooms and planned slots. */
    outline: string;
    /** The AI model and the solve check's model. */
    model: string;
    solveModel: string;
    /** The quality-gate model, or null when this run asks no gates. Absent on a frame stored before gates. */
    gateModel?: string | null;
    /** The deployed code's version (WorkbookJobDeps.build); null where none is known (development). */
    build: string | null;
  };
}

/** What planNextWorkbook read and the PlanInput it gave planWorkbook, frozen once with the run's plan. */
export interface RunPlanningCapture {
  version: 1;
  input: PlanInput;
  placement: {
    curriculum: { key: string; version: string };
    grade: Grade;
    profile: ChildLearnerProfile | null;
    report?: import("./workbook-signals").BookSignalsInput["report"];
    device?: import("./workbook-signals").BookSignalsInput["device"];
    workbooks: { number: number; levels: number[] }[];
    number: number;
    /** The admin's book instructions the plan read; absent when there were none. */
    instructions?: WorkbookInstructions;
  };
}

/**
 * The saved plan of a next-book snapshot, as a run with that snapshot_id makes its book from it (#476): the plan input the
 * snapshot's planner saved and the plan it makes, checked against the saved hash, only on the curriculum version the plan
 * was made on (nextBookRunBook in src/lib/next-book-snapshot.ts). Else the reason: curriculum-changed,
 * curriculum-unrecorded, plan-mismatch, or why the snapshot cannot be read.
 */
export type NextBookRunBook =
  | { ok: true; snapshotId: string; planHash: string; planInput: PlanInput; plan: WorkbookPlan }
  | { ok: false; reason: string };

export interface WorkbookJobSource {
  /** A next-book run's saved plan (#476). Absent: this place cannot make a run that has a snapshot (refused). */
  nextBookPlan?(snapshotId: string): Promise<NextBookRunBook>;
  /** Read only the report recommendation, test duration and device for this plan's assessment. */
  planningMetadata?(assessmentId: string): Promise<Pick<import("./workbook-signals").BookSignalsInput, "report" | "device">>;
  /** Null when there is no such child. */
  inputs(childId: string): Promise<ChildInputs | null>;
  /** Refreshes the profiles only before the run has a frame. False refuses a book from incomplete assessment facts. */
  prepareProfile(childId: string): Promise<{ ok: true; profile: ChildInputs["profile"] } | { ok: false }>;
  /**
   * The child's ready first pages that Workbook 1 may keep (docs/first-pages.md): not hidden, not kept by another run
   * that is still working or finished. None: no first pages.
   */
  firstPages?(childId: string): Promise<ReadyFirstPages | null>;
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
  /** The quality gates (spec #850). Null or absent: this run asks none. */
  gates?: QuestionGateChecker | null;
  /** The page layout gate on the rendered pages (#859). Null or absent: this run asks none. */
  pageGates?: PageGateChecker | null;
  /** The cost of one solve check in US dollars, when the reader's provider said it; none: not known. */
  solveCost?(log: SolveLog): number | null;
  /** The page templates: the real ones (#310) in live use. */
  template: WorkbookTemplate;
  /** The fit check of each written page: the templates' strict check through the renderer in live use. `signal`: ends a print in progress. */
  fit: (parentId: string, signal?: AbortSignal) => FitCheck;
  engine: PrintEngine;
  /** A new UUID: leases. */
  newId(): string;
  /** A new QR token for a page. */
  qrToken(): string;
  /** A new file key for a render's file names. */
  fileKey(): string;
  /** The clock, in milliseconds. */
  now(): number;
  /** How often the job asks whether an admin stopped the run; STOP_CHECK_MS when not given. */
  stopCheckMs?: number;
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
/** A refusal of a run or of the first pages: trying again gives the same answer. */
export { Refusal as WorkbookRefusal };

/** The lease was lost: the run was taken up by another call, and this one must write nothing more. */
class Stopped extends Error {}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The refusal of a call that finds what the run was made from changed since it started (R379-8-2). */
const changed = (what: string, was: string | null, is: string | null) =>
  new Refusal(`The run cannot go on: ${what} changed since it started (${was ?? "none"} then, ${is ?? "none"} now). Start a new run.`);

/** The curriculum key of a signup curriculum: only BC has a map. */
const CURRICULUM_KEYS: Record<string, string> = { BC: "bc" };

/** A generated page as the renderer prints it (also the page layout gate set, #859). */
export const draftPage = (p: GeneratedPage): DraftPage => ({
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
      const rendered: DraftRendering["pages"] = renderedPages(result);
      // (The rendered page images, for the page layout gate, #859; a proof image is a page that failed already.)
      const images = new Map(result.files.map((f) => [f.path, f.bytes]));
      const pngs = rendered.flatMap((p) => { const png = images.get(p.image.path); return png ? [{ number: p.number, png }] : []; });
      return { rendering: { pdfPath: result.workbook.pdfPath!, pdfSha256: result.workbook.pdfSha256 ?? null, pages: [...rendered, ...proofs].sort((a, b) => a.number - b.number) }, problems, paths: stored, pngs };
    }
  } catch (e) {
    await deps.files.remove(stored).catch(() => undefined);
    throw e;
  }
  return { rendering: proofs.length ? { pdfPath: null, pages: proofs.sort((a, b) => a.number - b.number) } : null, problems, paths: stored, pngs: [] };
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
  // The Stop button: seen sooner than the renewal sees it, with no more renewals to fail on a network error.
  const stopTimer = setInterval(() => {
    void runs.run(runId).then((r) => { if (r && r.status !== "running") loseLease(); }).catch(() => undefined);
  }, deps.stopCheckMs ?? STOP_CHECK_MS);
  // A stop ends a print in progress, and no fit check or print starts after it.
  const stoppable: WorkbookJobDeps = {
    ...deps,
    engine: { print: (job) => deps.engine.print({ ...job, signal: stop.signal }) },
    fit: (parentId) => {
      const fit = deps.fit(parentId, stop.signal);
      return { fits: async (page, book) => {
        if (lost) throw new Stopped("the run was taken up by another call");
        return fit.fits(page, book);
      } };
    },
  };
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
          const written = await write(claimed, stoppable, lease, progress, check, () => lost, (v) => { if (v) loseLease(); }, () => left() < PAGE_MARGIN_MS, stop.signal, renew);
          if (written === "paused") return await handOn();
          // The stored draft is the truth: an earlier attempt of this holder may have stored it ("used").
          draft = (await deps.drafts.draft(claimed.draftKey)) ?? written;
        }
        if (left() < RENDER_MS) return await handOn();
        await progress({ step: "render" });
        await check();
        const rendered = await renderDraft(draft, claimed.parentId, stoppable);
        if (deps.pageGates && rendered.rendering && rendered.pngs.length) {
          // #859: each rendered page once; a stored page is not asked again. A flag marks the page; nothing is rewritten.
          const stored = (await runs.gates(runId)).filter((r): r is StoredPageGate => r.callKey.startsWith("page:"));
          const { rows, unavailable } = await checkRenderedPages(deps.pageGates, stored, rendered.pngs, async (row) => {
            if (lost || !(await runs.saveGates(runId, lease, [row]))) { loseLease(); throw new Stopped("the run was taken up by another call"); }
          }, stop.signal);
          for (const page of rendered.rendering.pages) {
            const row = rows.get(page.number);
            if (page.proof) continue;
            // A page the pass skipped after the model stopped answering is shown as not checked, never as passed.
            const mark = row ? pageGateMark(row) : unavailable ? { outcome: "unknown" as const, flags: [], reason: "The page layout gate stopped answering before this page, so it was not checked and is flagged for review." } : null;
            if (mark) page.layoutGate = mark;
          }
        }
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
    clearInterval(stopTimer);
    await renewing;
  }
}

/** What a plan is made for: the child, the family, the workbook number and the draft id that seeds the code's choices. */
export interface FrameTarget {
  childId: string;
  parentId: string;
  number: number;
  /** The draft id: the run's draft key, or the id the first pages reserved for Workbook 1 (docs/first-pages.md). */
  workbookId: string;
}

const targetOf = (run: WorkbookRun): FrameTarget => ({ childId: run.childId, parentId: run.parentId, number: run.number, workbookId: run.draftKey });

/** The generator's input from a plan and the child's name (printed only: the plan never reads it). */
export const frameInput = (t: FrameTarget, frame: RunFrame, name: string): GenerateInput => ({
  workbookId: t.workbookId, childId: t.childId, book: { child: name }, number: t.number,
  profileBuild: frame.profileRevision !== null ? `child profile revision ${frame.profileRevision}` : null,
  plan: frame.plan, curriculum: curriculumFor(frame.curriculum)!, itemPolicy: frame.itemPolicy,
  schoolGrade: frame.grade,
});

/** The deps a plan is made and checked with. */
export type FrameDeps = Pick<WorkbookJobDeps, "source" | "fit" | "build" | "itemPolicy" | "gates"> & { ai: Pick<AiClient, "model">; solver: Pick<Solver, "model"> };

/**
 * Plans a workbook from the child's inputs read now (R379-8-2): the profile refreshed, the report's signals, the admin's
 * instructions, placed and planned, and (approved items) its capacity measured with the fit check. Not stored. Throws
 * a refusal (WorkbookRefusal) when there is no curriculum, profile or plan.
 */
export async function makeRunFrame(t: FrameTarget, deps: FrameDeps, name: string, inputs: ChildInputs): Promise<RunFrame> {
  const key = CURRICULUM_KEYS[inputs.province];
  const curriculum = key ? curriculumFor(key) : null;
  if (!key || !curriculum) throw new Refusal(`There is no workbook curriculum for ${inputs.province} yet. Only BC has one.`);
  const prepared = await deps.source.prepareProfile(t.childId);
  if (!prepared.ok) throw new Refusal(`We couldn't build ${name}'s profile from the assessment. Try again, or check the admin profile page.`);
  inputs = { ...inputs, profile: prepared.profile };
  const assessmentId = inputs.profile?.profile.assessment?.assessmentId;
  const metadata = assessmentId ? await deps.source.planningMetadata?.(assessmentId) : undefined;
  const instructions = instructionsEmpty(inputs.instructions) ? undefined : inputs.instructions!;
  const placement: RunPlanningCapture["placement"] = structuredClone({ ...metadata, curriculum: { key, version: curriculumVersion(key)! },
    grade: inputs.grade, profile: inputs.profile?.profile ?? null, workbooks: inputs.workbooks, number: t.number, ...(instructions ? { instructions } : {}) });
  let input: PlanInput | undefined;
  // The capture is a copy taken at the public boundary: it cannot change the plan.
  const planned = planNextWorkbook({ ...metadata, curriculum, grade: inputs.grade, profile: inputs.profile?.profile ?? null, workbooks: inputs.workbooks, number: t.number, instructions }, captured => { input = captured; });
  if (!planned.ok) throw new Refusal(`The plan could not be made: ${planned.reason}.`);
  const made: RunFrame = {
    version: RUN_FRAME_VERSION, ...(deps.itemPolicy === "legacy" ? {} : { itemPolicy: "approved-v1" as const }), curriculum: key, units: skillUnits(curriculum), grade: inputs.grade, profileRevision: inputs.profile?.revision ?? null, countsCallEvents: WORKBOOK_COUNTS_CALL_EVENTS, workbooks: inputs.workbooks,
    ...(input ? { planning: { version: 1 as const, input, placement } } : {}),
    plan: deps.itemPolicy === "legacy" ? planned.plan : workbookCapacityPlan(curriculum, planned.plan), versions: { curriculum: "", outline: "", model: deps.ai.model, solveModel: deps.solver.model, gateModel: deps.gates?.model ?? null, build: deps.build ?? null },
  };
  if (made.itemPolicy === "approved-v1") made.plan = await prepareWorkbookCapacity(frameInput(t, made, name), deps.fit(t.parentId));
  made.versions.curriculum = curriculumVersion(key)!;
  made.versions.outline = bookOutline(frameInput(t, made, name));
  return made;
}

/** The plain error of a next-book run whose saved plan cannot be used (#476). Nothing is planned again. */
export function nextBookRefusal(reason: string): string {
  if (reason === "curriculum-changed") return "The next book's saved plan was made on another version of the workbook curriculum, so the book cannot be made from it. Prepare the next book from the snapshot again.";
  if (reason === "curriculum-unrecorded") return "The next book's saved plan does not record the curriculum version it was made on, so the book cannot be made from it.";
  if (reason === "plan-mismatch") return "The next book's saved plan does not make the plan it was saved with, so the book cannot be made from it.";
  return `The next book's saved plan cannot be read (${reason}), so the book cannot be made from it.`;
}

/**
 * A next-book run's plan (#476): the plan the snapshot's saved plan input makes, never the child read now (no profile
 * refresh, no placement, no instructions read again: the saved input holds what the planner used). Then the same capacity
 * steps and fingerprints as makeRunFrame. Throws a refusal, before any AI call, when the saved plan cannot be used.
 */
export async function makeNextBookFrame(t: FrameTarget, snapshotId: string, deps: FrameDeps, name: string, inputs: ChildInputs): Promise<RunFrame> {
  if (!deps.source.nextBookPlan) throw new Refusal("This place cannot read the next book's saved plan. Run it on the workbook worker.");
  const key = CURRICULUM_KEYS[inputs.province];
  const curriculum = key ? curriculumFor(key) : null;
  if (!key || !curriculum) throw new Refusal(`There is no workbook curriculum for ${inputs.province} yet. Only BC has one.`);
  const saved = await deps.source.nextBookPlan(snapshotId);
  if (!saved.ok) throw new Refusal(nextBookRefusal(saved.reason));
  if (saved.snapshotId !== snapshotId) throw new Refusal(nextBookRefusal("not-found"));
  if (saved.planInput.curriculum?.key !== key) throw new Refusal(`The next book's saved plan is for another curriculum (${saved.planInput.curriculum?.key ?? "none"}) than ${name}'s (${key}).`);
  const grade = saved.planInput.grade;
  if (!isGrade(grade)) throw new Refusal(nextBookRefusal("plan-mismatch"));
  const made: RunFrame = {
    version: RUN_FRAME_VERSION, ...(deps.itemPolicy === "legacy" ? {} : { itemPolicy: "approved-v1" as const }), curriculum: key, units: skillUnits(curriculum), grade,
    profileRevision: inputs.profile?.revision ?? null, countsCallEvents: WORKBOOK_COUNTS_CALL_EVENTS, workbooks: inputs.workbooks,
    nextBook: { snapshotId, planHash: saved.planHash },
    plan: deps.itemPolicy === "legacy" ? saved.plan : workbookCapacityPlan(curriculum, saved.plan),
    versions: { curriculum: "", outline: "", model: deps.ai.model, solveModel: deps.solver.model, gateModel: deps.gates?.model ?? null, build: deps.build ?? null },
  };
  if (made.itemPolicy === "approved-v1") made.plan = await prepareWorkbookCapacity(frameInput(t, made, name), deps.fit(t.parentId));
  made.versions.curriculum = curriculumVersion(key)!;
  made.versions.outline = bookOutline(frameInput(t, made, name));
  return made;
}

/**
 * Why a stored plan cannot be used by this call (R379-8-2), or null: its shape, the call event policy, the curriculum,
 * the deployed code, the AI or solve model, or the planned book changed since it was made.
 */
export function frameProblem(t: FrameTarget, frame: RunFrame, deps: FrameDeps, name: string): string | null {
  const refusal = (() => {
    if (frame.version !== RUN_FRAME_VERSION || !isGrade(frame.grade) || !frame.plan) return new Refusal("The run's stored plan is of another shape. Start a new run.");
    if ((frame.countsCallEvents ?? true) !== WORKBOOK_COUNTS_CALL_EVENTS) return new Refusal("The workbook call event policy changed. Start a new run.");
    const now = curriculumVersion(frame.curriculum);
    if (!now) return new Refusal(`There is no workbook curriculum ${frame.curriculum} any more. Start a new run.`);
    if (now !== frame.versions.curriculum) return changed("the curriculum", frame.versions.curriculum, now);
    if ((deps.build ?? null) !== frame.versions.build) return changed("the site's code", frame.versions.build, deps.build ?? null);
    if (deps.ai.model !== frame.versions.model) return changed("the AI model", frame.versions.model, deps.ai.model);
    if (deps.solver.model !== frame.versions.solveModel) return changed("the solve check's model", frame.versions.solveModel, deps.solver.model);
    if ((frame.versions.gateModel ?? null) !== (deps.gates?.model ?? null)) return changed("the quality gate's model", frame.versions.gateModel ?? null, deps.gates?.model ?? null);
    const outline = bookOutline(frameInput(t, frame, name));
    if (outline !== frame.versions.outline) return changed("the planned book (its pages, layouts or rooms)", frame.versions.outline, outline);
    return null;
  })();
  return refusal?.message ?? null;
}

/**
 * The run's plan (R379-8-2): the one its first job call stored; else (this is the first call) the child's inputs read
 * now, planned and stored under the lease (the first stored stays, and is the one used). Refused when a later call finds
 * what the plan was made from changed: the curriculum, the planned book, the models or the deployed code. A run with
 * stored work but no plan was started before plans were stored: refused (it cannot be resumed safely). A resumed run
 * with no stored work can still make its first plan.
 * Workbook 1 with ready first pages (docs/first-pages.md): the first call plans with the id the first pages reserved and
 * keeps them when the plan makes the same pages, else it is refused before any AI call, and the admin chooses.
 */
async function runFrame(run: WorkbookRun, deps: WorkbookJobDeps & { ai: AiClient; solver: Solver }, lease: string, name: string, inputs: ChildInputs): Promise<RunFrame> {
  let frame = await deps.runs.frame(run.id);
  if (!frame) {
    if (await deps.runs.hasStoredWork(run.id)) {
      throw new Refusal("This run has no stored plan, so it cannot resume safely. Start a new run.");
    }
    const sample = run.number === 1 && !run.snapshotId ? await deps.source.firstPages?.(run.childId) ?? null : null;
    if (run.snapshotId) {
      // #476: a next-book run is made from its snapshot's saved plan only.
      const made = await makeNextBookFrame(targetOf(run), run.snapshotId, deps, name, inputs);
      if (!(await deps.runs.saveFrame(run.id, lease, made))) throw new Stopped("the run was taken up by another call");
    } else if (sample && sample.decision !== "drop") {
      await adoptFirstPages(run, deps, lease, name, inputs, sample);
    } else {
      const made = await makeRunFrame(targetOf(run), deps, name, inputs);
      if (!(await deps.runs.saveFrame(run.id, lease, made))) throw new Stopped("the run was taken up by another call");
    }
    frame = await deps.runs.frame(run.id);
    if (!frame) throw new Error("the run's plan was not stored");
  }
  // Every call, the first included, checks the stored plan against what this call would make it from.
  const problem = frameProblem(targetOf(run), frame, deps, name);
  if (problem) throw new Refusal(problem);
  return frame;
}

/** The first pages a Workbook 1 run may keep (docs/first-pages.md), as the run's source reads them. */
export interface ReadyFirstPages {
  id: string;
  /** The Workbook 1 id the first pages were written with: the draft id and the seed of the code's choices. */
  workbookId: string;
  /** The plan they were written from. */
  frame: RunFrame;
  /** The cover's QR code. */
  coverToken: string;
  /** The day pages, in book order. */
  pages: number[];
  /** pagesDigest of what they were made from. */
  digest: string;
  /** The admin's choice after a refusal: use the first pages' plan, or make the book without them. */
  decision: "keep-plan" | "drop" | null;
}

/** What the adoption answers: kept, the lease was lost, or why it could not keep them. */
export type AdoptResult = "adopted" | "lost" | { refused: string };

/** The refusal of a Workbook 1 run whose new plan no longer makes the first pages the parent saw. */
export const FIRST_PAGES_CHANGED = "The first pages we showed the parent are not in this plan any more: the child's profile, the book instructions or the code changed since they were made. On the child's page, choose \"Use the first pages' plan\" or \"Make it without the first pages\", then start the run again.";

async function adoptFirstPages(run: WorkbookRun, deps: WorkbookJobDeps & { ai: AiClient; solver: Solver }, lease: string, name: string, inputs: ChildInputs, sample: ReadyFirstPages) {
  if (!deps.runs.adoptFirstPages) throw new Refusal("This store cannot keep the first pages. Make the book without them.");
  const t: FrameTarget = { ...targetOf(run), workbookId: sample.workbookId };
  let made: RunFrame;
  if (sample.decision === "keep-plan") {
    // The admin chose the first pages' plan: the same plan, checked against this call's code and models.
    made = structuredClone(sample.frame);
    made.versions = { ...made.versions, model: deps.ai.model, solveModel: deps.solver.model, build: deps.build ?? null, curriculum: curriculumVersion(made.curriculum) ?? "", outline: "" };
    made.versions.outline = bookOutline(frameInput(t, made, name));
  } else {
    made = await makeRunFrame(t, deps, name, inputs);
  }
  if (pagesDigest(frameInput(t, made, name), sample.pages) !== sample.digest) throw new Refusal(FIRST_PAGES_CHANGED);
  made.firstPages = { id: sample.id, pages: [...sample.pages], coverToken: sample.coverToken, ...(sample.decision === "keep-plan" ? { decision: "keep-plan" as const } : {}) };
  const adopted = await deps.runs.adoptFirstPages(run.id, lease, sample.id, made);
  if (adopted === "lost") throw new Stopped("the run was taken up by another call");
  if (typeof adopted === "object") throw new Refusal(`The first pages could not be kept: ${adopted.refused}. On the child's page, choose "Make it without the first pages", then start the run again.`);
  // The run now writes the draft the first pages reserved.
  run.draftKey = sample.workbookId;
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
  const result = await generateWorkbook(frameInput(targetOf(run), frame, inputs.name), {
    ...(frame.firstPages ? { sample: { coverToken: frame.firstPages.coverToken, pages: frame.firstPages.pages } } : {}),
    ai: guardedAi, fit: deps.fit(run.parentId), store: guardedDrafts, qrToken: deps.qrToken, pages, attempts, calls,
    concurrency: deps.concurrency ?? PAGE_CONCURRENCY, stop: () => isLost() || outOfTime(), timeLimitMs: deps.timeLimitMs,
    progress: (done, total) => { void progress({ step: "write", done, total }); },
    solver: guardedSolver, now: deps.now,
    ...(deps.gates ? { questionGates: openQuestionGateRun(deps.gates, (await deps.runs.gates(run.id)).filter((r): r is StoredQuestionGate => !r.callKey.startsWith("page:")), async (row) => {
      if (isLost() || !(await deps.runs.saveGates(run.id, lease, [row]))) lose();
    }) } : {}),
  });
  if (isLost()) throw new Stopped("the run was taken up by another call");
  if (result.status === "paused") return "paused";
  if (result.status === "refused") throw new Refusal(result.reason.endsWith(".") ? result.reason : `The draft was not stored: ${result.reason}.`);
  return result.draft;
}
