import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient } from "@/lib/supabase-auth";
import type { JobOutcome } from "@/lib/workbook-job";
import { runWorkbookJobWith } from "@/lib/workbook-job-deps";

// "Prepare next workbook" (#312) on the server: the job with the live deps (src/lib/workbook-job-deps.ts) and the API
// only (OpenRouter; there is no `claude` on Vercel), within Vercel's time limit. Since D-200 the server makes a run only
// when WORKBOOK_RUNNER is "server", or when the admin presses "Run on the server with the API" on a run that waits for
// the Mac; else the workbook worker on Savar's Mac makes it. Near the time limit the job hands the run on to the resume
// route (src/app/api/workbook-runs/[id]/resume), which runs the next call the same way.

/**
 * This server's code, where no deploy commit names it (development): a new value each time this module loads, so a
 * restart or a reload after a code change (prompts, wordings, checks) gives another, and a run started on other code
 * is refused rather than resumed with results from two code versions (R379-9-1).
 */
const CODE_LOAD = `load-${randomUUID()}`;

/** The resume route's path for a run. */
export const resumePath = (runId: string) => `/api/workbook-runs/${runId}/resume`;

/** Starts the next job call of a run through the resume route, with CRON_SECRET (and the preview bypass when set). */
async function handOff(origin: string, runId: string): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET is not set");
  const headers: Record<string, string> = { authorization: `Bearer ${secret}` };
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  const res = await fetch(`${origin}${resumePath(runId)}`, { method: "POST", headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`the resume route answered ${res.status}`);
}

/**
 * Runs one job call of a run. `resume`: take up a running run (a hand-over, or one that stopped). `origin`: this site,
 * for the hand-over. Never throws. Null without the secret key.
 */
export async function runWorkbookJobNow(runId: string, o: { origin: string; resume?: boolean }): Promise<JobOutcome | null> {
  const admin = adminClient();
  if (!admin) return null;
  try {
    return await runWorkbookJobWith(admin, runId, {
      subscription: false,
      // One AI call stops after 60 s (the OpenRouter adapter's own limit), so a page in flight ends inside the budget.
      timeLimitMs: 60_000,
      handOff: (id) => handOff(o.origin, id),
      // A run goes on only on the code it started on (R379-8-2, R379-9-1): the deploy's commit, else this server's own
      // code load (CODE_LOAD), so a run never resumes across a restart or a code reload in development.
      build: process.env.VERCEL_GIT_COMMIT_SHA || CODE_LOAD,
      // Development only: WORKBOOK_CALL_BUDGET_MS shortens a call's budget, to watch the hand-over work.
      budgetMs: process.env.NODE_ENV !== "production" && Number(process.env.WORKBOOK_CALL_BUDGET_MS) > 0 ? Number(process.env.WORKBOOK_CALL_BUDGET_MS) : undefined,
    }, { resume: o.resume });
  } catch (e) {
    console.error("[workbook job] failed", runId, e instanceof Error ? e.message : String(e));
    return null;
  }
}
