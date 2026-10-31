import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { aiClient } from "@/lib/ai-client";
import { chromiumPrintEngine } from "@/lib/print-engine-chromium";
import { adminClient } from "@/lib/supabase-auth";
import { workbookFakeAi } from "@/lib/workbook-ai-fake";
import { workbookDraftStore } from "@/lib/workbook-draft-store";
import { runWorkbookJob, type JobOutcome } from "@/lib/workbook-job";
import { workbookJobSource, workbookRunStore } from "@/lib/workbook-job-store";
import { workbookFiles } from "@/lib/workbook-store";
import type { WorkbookTemplate } from "@/lib/workbook-render";
import { fixedTemplate } from "@/lib/workbook-template-fixed";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";

// "Prepare next workbook" (#312) on the server: the job (src/lib/workbook-job.ts) with the secret key's stores, the AI
// client (OpenRouter; in development WORKBOOK_AI_FAKE gives the fake), headless Chromium and the page template.
// The admin route runs it with after(), the report job's pattern.

/**
 * The page template of drafts. Today the fixed test template on main (#309), which lays out the cover and practice
 * pages only; every other page shows as "not rendered" in the review. When the real templates (#310, PR #371) merge,
 * return their template here: this is the one place the job reads it.
 */
async function draftTemplate(): Promise<WorkbookTemplate> {
  return fixedTemplate(await fixedTemplateFonts());
}

/** A QR token: 22 URL-safe characters from 16 random bytes. */
const qrToken = () => randomBytes(16).toString("base64url");

/** Runs the job for one run. Never throws. Null without the secret key. */
export async function runWorkbookJobNow(runId: string): Promise<JobOutcome | null> {
  const admin = adminClient();
  if (!admin) return null;
  try {
    return await runWorkbookJob(runId, {
      runs: workbookRunStore(admin),
      source: workbookJobSource(admin),
      drafts: workbookDraftStore(admin),
      files: workbookFiles(admin),
      ai: workbookFakeAi() ?? aiClient(),
      template: await draftTemplate(),
      engine: chromiumPrintEngine(),
      newId: randomUUID,
      qrToken,
      fileKey: () => randomBytes(6).toString("hex"),
    });
  } catch (e) {
    console.error("[workbook job] failed", runId, e instanceof Error ? e.message : String(e));
    return null;
  }
}
