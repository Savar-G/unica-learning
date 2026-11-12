// The first pages' live deps (docs/first-pages.md), shared by the two places that make them, as the workbook runs do:
// the site on the server (WORKBOOK_RUNNER=server: the API) and the workbook worker on Savar's Mac (the subscription
// first). Both use the secret key's stores, headless Chromium, the real templates with their strict fit check, and the
// same AI and solve check as the workbook job. In development WORKBOOK_AI_FAKE gives the fakes.
// No "server-only" import: the worker is plain Node.
import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { workbookProfileBuilder } from "@/lib/child-profile-server";
import { runFirstPagesJob, type AiCallCost, type FirstPagesOutcome } from "@/lib/first-pages";
import { firstPagesStore } from "@/lib/first-pages-store";
import { chromiumPrintEngine } from "@/lib/print-engine-chromium";
import { workbookAi } from "@/lib/workbook-ai";
import { workbookFakeAi, workbookFakeSolver } from "@/lib/workbook-ai-fake";
import { renderFitCheck } from "@/lib/workbook-fit";
import type { RunPlace } from "@/lib/workbook-job-deps";
import { workbookJobSource } from "@/lib/workbook-job-store";
import { workbookFiles } from "@/lib/workbook-store";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";

/** Whether this id is a set of first pages (the worker's queue holds runs, edits and first pages). */
export async function isFirstPages(admin: SupabaseClient<Database>, id: string): Promise<boolean> {
  const { data, error } = await admin.from("workbook_first_pages").select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

/** Makes one job call of a set with the live deps. Throws only when the deps cannot be made (fonts, the template). */
export async function runFirstPagesWith(admin: SupabaseClient<Database>, id: string, place: Omit<RunPlace, "handOff" | "budgetMs">): Promise<FirstPagesOutcome> {
  const env = place.env ?? process.env;
  const template = workbookTemplate(await fixedTemplateFonts());
  const engine = chromiumPrintEngine();
  const fake = workbookFakeAi();
  const calls: AiCallCost[] = [];
  const live = fake ? null : workbookAi(env, {
    subscription: place.subscription, primary: place.primary,
    onCall: (kind, r) => { if (r.outcome !== "started") calls.push({ kind: kind === "solve" ? "solve" : "writer", model: r.model, provider: r.provider, usd: r.usd, ms: Math.round(r.ms) }); },
  });
  return runFirstPagesJob(id, {
    store: firstPagesStore(admin),
    runner: place.subscription ? "mac" : "server",
    source: workbookJobSource(admin, workbookProfileBuilder(admin, env)),
    files: workbookFiles(admin),
    ai: fake ?? live!.ai,
    solver: fake ? workbookFakeSolver() : live!.solve?.solver ?? null,
    ...(live?.solve ? { solveCost: live.solve.cost } : {}),
    aiCalls: () => calls.splice(0, calls.length),
    template,
    fit: (parentId, signal) => renderFitCheck({ template, engine: { print: (job) => engine.print({ ...job, signal }) }, parentId, fullness: true }),
    engine,
    newId: randomUUID,
    qrToken: () => randomBytes(16).toString("base64url"),
    fileKey: () => randomBytes(6).toString("hex"),
    now: () => Date.now(),
    timeLimitMs: place.timeLimitMs,
    build: place.build,
  });
}
