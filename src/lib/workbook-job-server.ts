import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { aiClient } from "@/lib/ai-client";
import { chromiumPrintEngine } from "@/lib/print-engine-chromium";
import { adminClient } from "@/lib/supabase-auth";
import { workbookFakeAi } from "@/lib/workbook-ai-fake";
import { workbookDraftStore } from "@/lib/workbook-draft-store";
import { renderFitCheck } from "@/lib/workbook-fit";
import { runWorkbookJob, type JobOutcome } from "@/lib/workbook-job";
import { workbookJobSource, workbookRunStore } from "@/lib/workbook-job-store";
import { workbookFiles } from "@/lib/workbook-store";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";

// "Prepare next workbook" (#312) on the server: the job (src/lib/workbook-job.ts) with the secret key's stores, the AI
// client (OpenRouter; in development WORKBOOK_AI_FAKE gives the fake), headless Chromium, the real page templates (#310)
// and their strict fit check through the renderer. The admin route runs it with after(), the report job's pattern;
// near the time limit the job hands the run on to the resume route (src/app/api/workbook-runs/[id]/resume), which runs
// the next call the same way.

/** A QR token: 22 URL-safe characters from 16 random bytes. */
const qrToken = () => randomBytes(16).toString("base64url");

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
    const template = workbookTemplate(await fixedTemplateFonts());
    const engine = chromiumPrintEngine();
    return await runWorkbookJob(runId, {
      runs: workbookRunStore(admin),
      source: workbookJobSource(admin),
      drafts: workbookDraftStore(admin),
      files: workbookFiles(admin),
      ai: workbookFakeAi() ?? aiClient(),
      template,
      fit: (parentId) => renderFitCheck({ template, engine, parentId }),
      engine,
      newId: randomUUID,
      qrToken,
      fileKey: () => randomBytes(6).toString("hex"),
      now: () => Date.now(),
      // One AI call stops after 60 s (the OpenRouter adapter's own limit), so a page in flight ends inside the budget.
      timeLimitMs: 60_000,
      handOff: (id) => handOff(o.origin, id),
      // Development only: WORKBOOK_CALL_BUDGET_MS shortens a call's budget, to watch the hand-over work.
      budgetMs: process.env.NODE_ENV !== "production" && Number(process.env.WORKBOOK_CALL_BUDGET_MS) > 0 ? Number(process.env.WORKBOOK_CALL_BUDGET_MS) : undefined,
    }, { resume: o.resume });
  } catch (e) {
    console.error("[workbook job] failed", runId, e instanceof Error ? e.message : String(e));
    return null;
  }
}
