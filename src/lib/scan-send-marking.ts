import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { adminClient } from "@/lib/supabase-auth";
import { childPlanAccess, markingDecision, type ChildPlanAccess } from "@/lib/scan-marking-access";
import { processScanMarking } from "@/lib/scan-marking-server";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Marking starts when the parent presses Send (docs/scan-pages.md, "Marking after Send"). The Send route answers first,
 * then marks the sent photos in the same function call with `after()`, which shares the route's `maxDuration`
 * (Next.js `after`; Vercel: promises passed to `waitUntil` "have the same timeout as the function itself").
 *
 * Numbers (2026-11-07):
 * - Vercel Hobby with Fluid compute: 300 s default and maximum. The team is on Hobby, so the route uses 300.
 * - One photo: at most 120 s for the AI (one `AbortSignal.timeout(120_000)` over both attempts in `runScanMarking`,
 *   each attempt at most 60 s), plus the image read and the database work. 140 s is the worst case we plan for.
 *   Measured Sonnet calls in the marking ledger: median 2.7 s, 90th percentile 3.3 s.
 * - A new photo starts only while one more worst-case photo still fits before the limit, with a margin.
 *
 * Photos run one at a time. The database admits one active job per family (`scan_limits.active_jobs = 1`, counted by
 * `scan_active_jobs`), so a second photo of the same family at the same time would only answer "busy".
 *
 * The cron `/api/scan-marking` stays the retry for photos this run does not reach, that fail or that stop. The claim
 * belongs to the marking lane: one claim, one lease and one budget charge per photo, so two starts never mark twice.
 */
export const SEND_MARKING_LIMIT_MS = 300_000;
export const SEND_MARKING_MAX_PHOTOS = 6;
export const SEND_MARKING_PHOTO_WORST_MS = 140_000;
export const SEND_MARKING_MARGIN_MS = 15_000;
/** A "busy" photo (another scan job of the family holds the one slot) is tried again after this wait, while time remains. */
export const SEND_MARKING_BUSY_WAIT_MS = 10_000;
export const SEND_MARKING_BUSY_PASSES = 3;

/**
 * The photos marking starts on now: none when the marking rule (`markingDecision`, the same rule `processScanMarking`
 * runs for each photo) is closed for this family and child, else the sent photos up to the cap. Never throws.
 */
export async function sendMarkingStart(db: SupabaseClient<Database>, parent: string, child: string, sent: readonly string[],
  env: Env = process.env, plan: ChildPlanAccess = childPlanAccess): Promise<string[]> {
  if (!sent.length) return [];
  try {
    if (!(await markingDecision(db, parent, env, { child }, plan)).open) return [];
  } catch { return []; }
  return [...new Set(sent)].sort().slice(0, SEND_MARKING_MAX_PHOTOS);
}

export type SendMarkingResult = Awaited<ReturnType<typeof processScanMarking>> | "error" | "not-started";
export interface SendMarkingDeps {
  env?: Env;
  plan?: ChildPlanAccess;
  /** A database client whose requests stop at the deadline. Default: the secret-key client with that signal. */
  db?: (signal: AbortSignal) => SupabaseClient<Database> | null;
  mark?: typeof processScanMarking;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Marks the photos one at a time, after the Send answer. Each photo's error is caught: it does not stop the others.
 * `startedAt` is when the request started, because the function's time limit counts from then.
 */
export async function markSentPhotos(parent: string, photos: readonly string[], startedAt: number, deps: SendMarkingDeps = {}): Promise<Record<string, SendMarkingResult>> {
  const env = deps.env ?? process.env, plan = deps.plan ?? childPlanAccess, mark = deps.mark ?? processScanMarking;
  const now = deps.now ?? Date.now, sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const results: Record<string, SendMarkingResult> = Object.fromEntries(photos.map((p) => [p, "not-started" as const]));
  const end = startedAt + SEND_MARKING_LIMIT_MS - SEND_MARKING_MARGIN_MS;
  const fits = () => now() + SEND_MARKING_PHOTO_WORST_MS <= end;
  const left = end - now();
  if (!photos.length || left <= 0) return results;
  const db = (deps.db ?? adminClient)(AbortSignal.timeout(left));
  if (!db) return results;
  let queue = [...photos];
  for (let pass = 0; queue.length && pass <= SEND_MARKING_BUSY_PASSES; pass++) {
    if (pass > 0) {
      if (now() + SEND_MARKING_BUSY_WAIT_MS + SEND_MARKING_PHOTO_WORST_MS > end) break;
      await sleep(SEND_MARKING_BUSY_WAIT_MS);
    }
    const busy: string[] = [];
    for (const photo of queue) {
      if (!fits()) break;
      try { results[photo] = await mark(db, parent, photo, env, plan); }
      catch { results[photo] = "error"; }
      if (results[photo] === "busy") busy.push(photo);
    }
    queue = busy;
  }
  const counts: Record<string, number> = {};
  for (const r of Object.values(results)) counts[r] = (counts[r] ?? 0) + 1;
  // Counts only: no family, child or photo id.
  console.info("[scan-send-marking]", JSON.stringify(counts));
  return results;
}
