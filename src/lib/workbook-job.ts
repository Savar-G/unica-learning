// "Prepare next workbook" (#312, spec #296): the background job that makes a child's next draft workbook, the same
// pattern as the report job (src/lib/report-job.ts): the admin route starts a run and answers at once, and the job runs
// after the response. Its state is stored on the run (public.workbook_runs, migration add_workbook_runs):
//   1. plan: the child's grade, curriculum, profile and stored workbooks (the source seam), placed and planned
//      (src/lib/workbook-placement.ts, the two-week plan #308).
//   2. write: the generator (#311, src/lib/workbook-generator.ts) writes every day page with the AI and checks every
//      answer; the run stores each page done ("12 of 80 day pages"). The draft is stored as one unit.
//   3. render: the renderer on main (#309) makes one image per page and the PDF, into the workbook bucket at
//      <parent id>/<draft id>/. A page that does not render (the template has no layout for its type yet, or a check
//      fails) is left out of the images, with its problems; the other pages render.
//   4. save: the run ends as done, naming the draft, and the draft gets revision 1 with its rendering, in one step.
//
// Retries: an error that throws (a database or Storage error, a print engine crash) is kept on the run and the job
// tries again, up to RUN_ATTEMPTS attempts in all; a stored draft is not written again, only rendered again. A refusal
// (no curriculum, the AI off, a plan or draft refused) fails the run at once: trying again gives the same answer.
// Stale runs: each job call takes the run with a new lease, and every write names it; a run with no progress for
// STALE_SECONDS is stopped by the next start for that child, which drops its lease. A stopped run's later writes change
// nothing: its AI calls stop, its draft is not stored (the lease is checked first), and its finish is refused, so its
// files are removed and a newer run's draft is never replaced. A draft stored just before the stop is never named by a
// run, so no list shows it; it goes with the family.
// Pure TypeScript: no Next.js, React, network, database or clock (the stores, the AI, the engine and ids are passed in).
import type { Grade } from "@/lib/assessment";
import type { AiClient } from "@/lib/ai-client";
import type { ChildLearnerProfile } from "@/lib/child-profile";
import type { PageImage, QuestionBox, WorkbookFiles } from "@/lib/workbook-content";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { renderFitCheck } from "@/lib/workbook-fit";
import {
  generateWorkbook,
  type FitCheck,
  type GeneratedPage,
  type GeneratedWorkbook,
  type WorkbookDraftStore,
} from "@/lib/workbook-generator";
import { planNextWorkbook } from "@/lib/workbook-placement";
import { pageUrl, qrSvg, renderWorkbook, type DraftPage, type PrintEngine, type RenderProblem, type WorkbookTemplate } from "@/lib/workbook-render";

/** Attempts of one run in all: the first and one retry. */
export const RUN_ATTEMPTS = 2;
/** A run with no progress for this long has stopped: past the 300 s function limit, with a margin. */
export const STALE_SECONDS = 360;

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
  startedBy: { id: string | null; email: string | null };
}

/** A draft revision's rendering: the PDF of the pages that rendered, and each such page's image and question boxes. */
export interface DraftRendering {
  pdfPath: string;
  pages: { number: number; image: PageImage; questions: { number: number; box: QuestionBox }[] }[];
}

export type StartResult =
  | { status: "started"; runId: string }
  | { status: "busy"; runId: string }
  | { status: "refused"; reason: string };

/** Who starts a run: the admin. */
export interface RunActor {
  id: string;
  email: string;
}

/**
 * The runs' store. Adapters: Supabase (src/lib/workbook-job-store.ts, the functions of migration add_workbook_runs) and
 * in memory (src/lib/workbook-job-memory.ts). Every write after the start names the lease and changes nothing (false)
 * when the lease no longer holds the run. A database error throws.
 */
export interface WorkbookRunStore {
  /** Stops the child's stale runs, then adds a queued run, unless one is active. Writes the audit entries. */
  start(childId: string, by: RunActor, o: { maxAttempts: number; staleSeconds: number }): Promise<StartResult>;
  /** Takes a queued run: running, attempt 1. Null when it is not queued. */
  claim(runId: string, lease: string): Promise<WorkbookRun | null>;
  /** The step and progress, with a heartbeat. */
  progress(runId: string, lease: string, p: { step: RunStep; done?: number; total?: number }): Promise<boolean>;
  held(runId: string, lease: string): Promise<boolean>;
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
  template: WorkbookTemplate;
  engine: PrintEngine;
  /** A new UUID: leases and draft ids. */
  newId(): string;
  /** A new QR token for a page. */
  qrToken(): string;
  /** A new file key for a render's file names. */
  fileKey(): string;
  /** The time limit of one AI call; the generator's default when not given. */
  timeLimitMs?: number;
}

export type JobOutcome = "done" | "failed" | "stale" | "not-claimed";

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

/** The lease was lost: the run was stopped, and this job call must write nothing more. */
class Stopped extends Error {}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The curriculum key of a signup curriculum: only BC has a map. */
const CURRICULUM_KEYS: Record<string, string> = { BC: "bc" };

/**
 * The fit check of the job: the renderer's own measure (src/lib/workbook-fit.ts) through the template. A page type the
 * template has no layout for is not measured here (it would fail the same way twice and cost a second AI call); the
 * render step then names it as a page that did not render, so the reviewer still sees it.
 */
function fitCheck(template: WorkbookTemplate, engine: PrintEngine, parentId: string): FitCheck {
  const measure = renderFitCheck({ template, engine, parentId });
  return {
    async fits(page, book) {
      const probe = template.page(page, { qr: qrSvg(pageUrl(page.qrToken)), qrUrl: pageUrl(page.qrToken) }, { ...book, pages: [page] });
      return probe === null ? { ok: true } : measure.fits(page, book);
    },
  };
}

const draftPage = (p: GeneratedPage): DraftPage => ({
  number: p.number,
  dayLabel: p.dayLabel,
  type: p.type,
  qrToken: p.qrToken,
  questions: p.questions.flatMap((q) => (q.package ? [{ number: q.number, package: q.package }] : [])),
});

/** Render rounds: each leaves out the pages that failed the last. */
const RENDER_ROUNDS = 3;

/**
 * Renders the draft and stores the files. The pages that do not render are left out, with their problems. Returns the
 * paths stored, so a refused finish removes them.
 */
async function renderDraft(draft: GeneratedWorkbook, parentId: string, deps: WorkbookJobDeps) {
  const problems: RenderProblem[] = [];
  let pages = draft.pages.map(draftPage);
  const key = deps.fileKey();
  for (let round = 0; round < RENDER_ROUNDS && pages.length > 0; round++) {
    const result = await renderWorkbook({
      draft: { id: draft.id, childId: draft.childId, number: draft.number, levels: draft.levels, profileBuild: draft.profileBuild, pages },
      parentId, template: deps.template, engine: deps.engine, fileKey: `${key}r${round}`,
    });
    if (result.status === "failed") {
      problems.push(...result.problems);
      const bad = new Set(result.problems.map((p) => p.page));
      pages = pages.filter((p) => !bad.has(p.number));
      continue;
    }
    const stored: string[] = [];
    try {
      for (const file of result.files) {
        stored.push(file.path);
        await deps.files.put(file);
      }
    } catch (e) {
      await deps.files.remove(stored).catch(() => undefined);
      throw e;
    }
    const rendering: DraftRendering = {
      pdfPath: result.workbook.pdfPath!,
      pages: result.workbook.pages.map((p) => ({ number: p.number, image: p.image!, questions: p.questions.map((q) => ({ number: q.number, box: q.box })) })),
    };
    return { rendering, problems, paths: stored };
  }
  return { rendering: null, problems, paths: [] as string[] };
}

/**
 * Runs one queued run to its end. Never throws: every failure is stored on the run. "not-claimed": the run was not
 * queued (another call took it, or it was stopped).
 */
export async function runWorkbookJob(runId: string, deps: WorkbookJobDeps): Promise<JobOutcome> {
  const { runs } = deps;
  const lease = deps.newId();
  let run: WorkbookRun | null;
  try {
    run = await runs.claim(runId, lease);
  } catch (e) {
    console.error("[workbook job] claim failed", runId, message(e));
    return "not-claimed";
  }
  if (!run) return "not-claimed";
  const claimed = run;

  // The lease, as the last progress write saw it. Progress writes go one after another, and never fail the job.
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
    if (lost) throw new Stopped("the run was stopped");
  };

  let draft: GeneratedWorkbook | null = null;
  for (;;) {
    try {
      if (!draft) draft = await write(claimed, deps, lease, progress, check, () => lost, (v) => { lost = v; });
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

/** Steps 1 and 2: the plan, then the draft, stored. */
async function write(
  run: WorkbookRun, deps: WorkbookJobDeps, lease: string,
  progress: (p: Parameters<WorkbookRunStore["progress"]>[2]) => Promise<void>, check: () => Promise<void>,
  isLost: () => boolean, setLost: (v: boolean) => void,
): Promise<GeneratedWorkbook> {
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
      if (isLost()) throw new Stopped("the run was stopped");
      return ai.json(request, signal);
    },
  };
  const guardedDrafts: WorkbookDraftStore = {
    draft: (id) => deps.drafts.draft(id),
    async save(d) {
      await check();
      if (!(await deps.runs.held(run.id, lease))) {
        setLost(true);
        return { status: "refused", reason: "the run was stopped" };
      }
      return deps.drafts.save(d);
    },
  };
  const result = await generateWorkbook(
    {
      workbookId: deps.newId(), childId: run.childId, number: run.number,
      profileBuild: inputs.profile ? `child profile revision ${inputs.profile.revision}` : null,
      plan: planned.plan, curriculum,
    },
    {
      ai: guardedAi, fit: fitCheck(deps.template, deps.engine, inputs.parentId), store: guardedDrafts, qrToken: deps.qrToken,
      timeLimitMs: deps.timeLimitMs,
      progress: (done, total) => { void progress({ step: "write", done, total }); },
    },
  );
  if (isLost()) throw new Stopped("the run was stopped");
  if (result.status === "refused") throw new Refusal(`The draft was not stored: ${result.reason}.`);
  return result.draft;
}
