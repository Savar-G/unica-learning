// The job's live deps (#312, D-200), shared by the two places that make a run: the site on the server
// (src/lib/workbook-job-server.ts: the API, Vercel's time limit and the hand-over to the resume route) and the workbook
// worker on Savar's Mac (scripts/workbook-worker.ts: the subscription first, no time limit). Both use the secret key's
// stores, headless Chromium, the real page templates (#310) with their strict fit check, and log each AI call of the
// run with its provider and cost (public.workbook_run_ai_calls). In development WORKBOOK_AI_FAKE gives the fakes.
// No "server-only" import: the worker is plain Node.
import { runWorkbookEditWith } from "@/lib/workbook-edit-deps";
import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { workbookProfileBuilder } from "@/lib/child-profile-server";
import { chromiumPrintEngine } from "@/lib/print-engine-chromium";
import { workbookAi, type WorkbookAiOptions } from "@/lib/workbook-ai";
import { workbookFakeAi, workbookFakeSolver } from "@/lib/workbook-ai-fake";
import { workbookDraftStore } from "@/lib/workbook-draft-store";
import { renderFitCheck } from "@/lib/workbook-fit";
import { runWorkbookJob, type JobOutcome, type WorkbookJobDeps } from "@/lib/workbook-job";
import { excludeRunProvider, loadRunProviderGate, runAiCallLog, saveRunAiCalls, workbookJobSource, workbookRunStore } from "@/lib/workbook-job-store";
import { nextBookSnapshotStore } from "@/lib/next-book-snapshot-store";
import { readNextBookSnapshot } from "@/lib/next-book-snapshot";
import { workbookFiles } from "@/lib/workbook-store";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";

/** A QR token: 22 URL-safe characters from 16 random bytes. */
const qrToken = () => randomBytes(16).toString("base64url");

export interface RunPlace {
  /** Whether `claude -p` may run here (the Mac). */
  subscription: boolean;
  /** Overrides WORKBOOK_AI_PRIMARY. */
  primary?: WorkbookAiOptions["primary"];
  /** The code's version: a run goes on only on the code it started on (R379-8-2). */
  build: string;
  /** How long one job call works before it hands the run on. */
  budgetMs?: number;
  /** The time limit of one AI call. */
  timeLimitMs: number;
  handOff?: WorkbookJobDeps["handOff"];
  env?: Record<string, string | undefined>;
}

/** Makes one job call of a run with the live deps. Throws only when the deps cannot be made (fonts, the template). */
export async function runWorkbookJobWith(admin: SupabaseClient<Database>, runId: string, place: RunPlace, o: { resume?: boolean } = {}): Promise<JobOutcome> {
  const edit = await admin.from("workbook_edits").select("id").eq("id", runId).maybeSingle();
  if (edit.error) throw new Error(edit.error.message);
  if (edit.data) return runWorkbookEditWith(admin, runId, place);
  const env = place.env ?? process.env;
  const template = workbookTemplate(await fixedTemplateFonts());
  const engine = chromiumPrintEngine();
  const fake = workbookFakeAi();
  const log = runAiCallLog(saveRunAiCalls(admin, runId));
  const live = fake ? null : workbookAi(env, { subscription: place.subscription, primary: place.primary, onCall: log.add, onStart: log.add,
    gate: await loadRunProviderGate(admin, runId),
    onExclude: (provider, reason) => excludeRunProvider(admin, runId, provider, reason) });
  try {
    return await runWorkbookJob(runId, {
      runs: workbookRunStore(admin),
      runner: place.subscription ? "mac" : "server",
      readSnapshot: (id) => readNextBookSnapshot(nextBookSnapshotStore(admin), id),
      source: workbookJobSource(admin, workbookProfileBuilder(admin, env)),
      drafts: workbookDraftStore(admin),
      files: workbookFiles(admin),
      ai: fake ?? live!.ai,
      solver: fake ? workbookFakeSolver() : live!.solve?.solver ?? null,
      ...(live?.solve ? { solveCost: live.solve.cost } : {}),
      template,
      fit: (parentId, signal) => renderFitCheck({ template, engine: { print: (job) => engine.print({ ...job, signal }) }, parentId, fullness: true }),
      engine,
      newId: randomUUID,
      qrToken,
      fileKey: () => randomBytes(6).toString("hex"),
      now: () => Date.now(),
      timeLimitMs: place.timeLimitMs,
      handOff: place.handOff,
      build: place.build,
      budgetMs: place.budgetMs,
    }, o);
  } finally {
    await log.flush();
  }
}
