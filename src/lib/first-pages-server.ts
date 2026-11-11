import "server-only";
import { randomUUID } from "node:crypto";
import type { FirstPagesResult } from "@/lib/first-pages";
import { runFirstPagesWith } from "@/lib/first-pages-deps";
import type { AdminFirstPagesSet } from "@/components/admin-first-pages";
import { firstPagesCandidates, firstPagesOfChild, queueFirstPages, type QueueAnswer } from "@/lib/first-pages-store";
import { STALE_SECONDS } from "@/lib/workbook-job";
import { adminClient } from "@/lib/supabase-auth";
import { workbookRunner } from "@/lib/workbook-ai";
import { WORKBOOK_FILES_BUCKET } from "@/lib/workbook-content";

// The first pages of Workbook 1 on the site (docs/first-pages.md): queued after the report job (only with
// FIRST_PAGES_ENABLED "on"), or by an admin for one test; made by the Mac worker, or (WORKBOOK_RUNNER "server") here
// through the protected run route; read for the parent's own report, with each page image signed for 15 minutes.

/** Only the exact value "on" lets the report job queue first pages. Read on each call. */
export const firstPagesEnabled = (env: Record<string, string | undefined> = process.env) => env.FIRST_PAGES_ENABLED === "on";
/** Only the exact value "on" lets the /api/reminders run send the sample email. Read on each call. */
export const firstPagesEmailEnabled = (env: Record<string, string | undefined> = process.env) => env.FIRST_PAGES_EMAIL_ENABLED === "on";

/** The run route's path for a set. */
export const firstPagesRunPath = (id: string) => `/api/first-pages/${id}/run`;
/** Signed page images live this long, as the desk's. */
const IMAGE_URL_SECONDS = 15 * 60;

/** This server's code where no deploy commit names it (development): a set never goes on across a code reload. */
const CODE_LOAD = `load-${randomUUID()}`;

/** Starts a server job call of a set through the run route, with CRON_SECRET. */
async function startOnServer(origin: string, id: string): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET is not set");
  const headers: Record<string, string> = { authorization: `Bearer ${secret}` };
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  const res = await fetch(`${origin}${firstPagesRunPath(id)}`, { method: "POST", headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`the first pages run route answered ${res.status}`);
}

/**
 * Queues the first pages of a test and, on the server runner, starts them. `by` "report": the report job, only when the
 * switch is on; "admin": an admin's one test (the switch does not apply; the 48-hour window does not either). Never throws.
 */
export async function queueFirstPagesNow(assessmentId: string, origin: string, by: "report" | "admin"): Promise<QueueAnswer | { status: "off" } | null> {
  if (by === "report" && !firstPagesEnabled()) return { status: "off" };
  const admin = adminClient();
  if (!admin) return null;
  try {
    const runner = workbookRunner();
    const answer = await queueFirstPages(admin, assessmentId, { runner, by });
    if (answer.status === "queued" && runner === "server") await startOnServer(origin, answer.id).catch((e) => console.error("[first pages] start failed", answer.id, e instanceof Error ? e.message : e));
    if (answer.status === "refused") console.info("[first pages] not queued", assessmentId, answer.reason);
    return answer;
  } catch (e) {
    console.error("[first pages] queue failed", assessmentId, e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * On the server runner only: starts again each server set that is queued or stopped (no progress for STALE_SECONDS),
 * at most 3 a run. The count started. Never throws.
 */
export async function restartFirstPagesNow(origin: string): Promise<number> {
  if (workbookRunner() !== "server") return 0;
  const admin = adminClient();
  if (!admin) return 0;
  try {
    const ids = (await firstPagesCandidates(admin, "server", STALE_SECONDS)).slice(0, 3);
    for (const id of ids) await startOnServer(origin, id).catch((e) => console.error("[first pages] restart failed", id, e instanceof Error ? e.message : e));
    return ids.length;
  } catch (e) {
    console.error("[first pages] restart failed", e instanceof Error ? e.message : String(e));
    return 0;
  }
}

/** One job call of a set on the server (the API only). Never throws. */
export async function runFirstPagesNow(id: string) {
  const admin = adminClient();
  if (!admin) return null;
  try {
    return await runFirstPagesWith(admin, id, { subscription: false, timeLimitMs: 60_000, build: process.env.VERCEL_GIT_COMMIT_SHA || CODE_LOAD });
  } catch (e) {
    console.error("[first pages] job failed", id, e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** One page as the report shows it. */
export interface FirstPageImage {
  number: number;
  kind: "cover" | "lesson" | "practice";
  url: string;
  width: number;
  height: number;
}

/**
 * The ready first pages of this parent's own test, with each page image signed, or null: none, not ready, hidden, or
 * not this parent's. The caller has already read the report with the parent's session, so the test is theirs; the row
 * is read with the secret key and filtered on the parent too, and only paths in the parent's own folder for the
 * reserved Workbook 1 id are signed.
 */
export async function firstPagesForReport(parentId: string, assessmentId: string): Promise<FirstPageImage[] | null> {
  const admin = adminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin.from("workbook_first_pages").select("workbook_id, result, status")
      .eq("assessment_id", assessmentId).eq("parent_id", parentId).eq("status", "ready").maybeSingle();
    if (error || !data?.result) return null;
    const result = data.result as unknown as FirstPagesResult;
    const folder = `${parentId}/${data.workbook_id}/`;
    const images = result.files?.images ?? [];
    if (images.length !== 4 || !images.every((i) => i.path.startsWith(folder))) return null;
    const signed = await admin.storage.from(WORKBOOK_FILES_BUCKET).createSignedUrls(images.map((i) => i.path), IMAGE_URL_SECONDS);
    if (signed.error || !signed.data) return null;
    const urls = new Map(signed.data.map((s) => [s.path, s.signedUrl]));
    const kindOf = (n: number): FirstPageImage["kind"] => (n === 1 ? "cover" : n === result.numbers.lesson ? "lesson" : "practice");
    const out = images.map((i) => ({ number: i.number, kind: kindOf(i.number), url: urls.get(i.path) ?? "", width: i.width, height: i.height }));
    return out.every((p) => p.url) ? out : null;
  } catch (e) {
    console.error("[first pages] report read failed", assessmentId, e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * The admin child page's first pages: each set of the child, newest first, with its pages and PDF signed for 10
 * minutes, and the child's newest finished test whose report offers the plan. The caller has checked the admin's session.
 */
export async function loadAdminFirstPages(childId: string): Promise<{ sets: AdminFirstPagesSet[]; newestTest: string | null }> {
  const admin = adminClient();
  if (!admin) return { sets: [], newestTest: null };
  const [sets, test] = await Promise.all([
    firstPagesOfChild(admin, childId),
    admin.from("assessments").select("id").eq("child_id", childId).eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const holders = sets.flatMap((s) => (s.keptBy ? [s.keptBy] : []));
  const active = new Set(holders.length ? ((await admin.from("workbook_runs").select("id, status").in("id", holders)).data ?? [])
    .filter((r) => r.status === "queued" || r.status === "running" || r.status === "done").map((r) => r.id) : []);
  const out: AdminFirstPagesSet[] = [];
  for (const s of sets) {
    const r = s.result;
    const paths = r ? [...r.files.images.map((i) => i.path), r.files.pdf.path] : [];
    const signed = paths.length ? (await admin.storage.from(WORKBOOK_FILES_BUCKET).createSignedUrls(paths, 600)).data ?? [] : [];
    const url = new Map(signed.map((x) => [x.path, x.signedUrl]));
    out.push({
      id: s.id, assessmentId: s.assessmentId, status: s.status, attempts: s.attempts, error: s.error, createdAt: s.createdAt, readyAt: s.readyAt,
      keptBy: s.keptBy, keptActive: !!s.keptBy && active.has(s.keptBy), decision: s.decision,
      counts: r ? { dayPages: r.counts.dayPages, writerCalls: r.counts.writerCalls, solveChecks: r.counts.solveChecks, usd: r.counts.usd } : null,
      images: r ? r.files.images.flatMap((i) => (url.get(i.path) ? [{ number: i.number, url: url.get(i.path)! }] : [])) : [],
      pdfUrl: r ? url.get(r.files.pdf.path) ?? null : null,
    });
  }
  return { sets: out, newestTest: test.data?.id ?? null };
}
