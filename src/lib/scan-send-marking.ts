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
 * - A claim holds its lease for 180 s (`scan_marking_command` claim). A photo starts only while a whole lease plus a
 *   15 s margin still fits before the limit, so no lease the run takes outlives the function call: with 300 s the last
 *   start is 105 s after the request started. The work of one photo is shorter than its lease: at most 120 s of AI
 *   (one `AbortSignal.timeout(120_000)` over both attempts in `runScanMarking`) plus the image read and the database.
 *   Measured Sonnet calls in the marking ledger: median 2.7 s, 90th percentile 3.3 s.
 * - At most 6 photos start per Send, so the Send answer can say how many. At about 8 s a photo, 6 photos start well
 *   before 105 s; on a slow run the time rule stops first and the cron marks the rest.
 * Photos run one at a time. The family has one processing slot (`scan_limits.active_jobs = 1`, counted by
 * `scan_active_jobs`), shared by uploads, photo checks and marking, and a claim while it is taken answers "busy". So
 * before each photo the run waits, with a read only, until the slot is free (`familySlotFree`), with backoff, up to the
 * start rule's deadline. Then it calls `processScanMarking` once for that photo, never again in this run.
 *
 * The cron `/api/scan-marking` stays the retry for photos this run does not reach, that fail or that stop. The claim
 * belongs to the marking lane: one claim, one lease and one budget charge per photo, so two starts never mark twice.
 */
export const SEND_MARKING_LIMIT_MS = 300_000;
export const SEND_MARKING_MAX_PHOTOS = 6;
/** The marking lane's lease: `lease_until = now + 180 seconds` in the claim. */
export const SEND_MARKING_LEASE_MS = 180_000;
export const SEND_MARKING_MARGIN_MS = 15_000;
/** Waits between reads of the family's slot: 1, 2, 4, then 8 s each, until the start rule's deadline. */
export const SEND_MARKING_SLOT_WAITS_MS = [1_000, 2_000, 4_000, 8_000] as const;

/**
 * Read only: true when no upload, photo check or marking job of the family holds a live lease, as the claim counts it
 * (`scan_active_jobs`, which the secret key may not call: these are the same three reads). A failed read is false.
 * The claim stays the authority: this read only avoids a claim that would answer "busy".
 */
export async function familySlotFree(db: SupabaseClient<Database>, parent: string, at: string): Promise<boolean> {
  try {
    const [uploads, checks, jobs] = await Promise.all([
      db.from("scan_photos").select("id").eq("parent_id", parent).eq("state", "processing").gt("lease_until", at).gt("expires_at", at).limit(1),
      db.from("scan_calibrations").select("photo_id").eq("parent_id", parent).eq("state", "running").gt("lease_until", at).limit(1),
      db.from("scan_marking_jobs").select("photo_id").eq("parent_id", parent).in("state", ["running", "extracted"]).gt("lease_until", at).limit(1),
    ]);
    if (uploads.error || checks.error || jobs.error) return false;
    return !uploads.data.length && !checks.data.length && !jobs.data.length;
  } catch { return false; }
}

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
  slot?: typeof familySlotFree;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Marks the photos one at a time, after the Send answer. Before each photo it waits for the family's slot; it calls
 * `processScanMarking` at most once per photo. Each photo's error is caught: it does not stop the others.
 * `startedAt` is when the request started, because the function's time limit counts from then.
 */
export async function markSentPhotos(parent: string, photos: readonly string[], startedAt: number, deps: SendMarkingDeps = {}): Promise<Record<string, SendMarkingResult>> {
  const env = deps.env ?? process.env, plan = deps.plan ?? childPlanAccess, mark = deps.mark ?? processScanMarking, slot = deps.slot ?? familySlotFree;
  const now = deps.now ?? Date.now, sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const results: Record<string, SendMarkingResult> = Object.fromEntries(photos.map((p) => [p, "not-started" as const]));
  const end = startedAt + SEND_MARKING_LIMIT_MS - SEND_MARKING_MARGIN_MS;
  // The start rule: a whole lease plus the margin still fits before the limit.
  const fits = (wait = 0) => now() + wait + SEND_MARKING_LEASE_MS <= end;
  const left = end - now();
  if (!photos.length || left <= 0) return results;
  const db = (deps.db ?? adminClient)(AbortSignal.timeout(left));
  if (!db) return results;
  const slotFree = async () => {
    for (let n = 0; fits(); n++) {
      if (await slot(db, parent, new Date(now()).toISOString())) return fits();
      const wait = SEND_MARKING_SLOT_WAITS_MS[Math.min(n, SEND_MARKING_SLOT_WAITS_MS.length - 1)];
      if (!fits(wait)) return false;
      await sleep(wait);
    }
    return false;
  };
  for (const photo of photos) {
    if (!await slotFree()) break;
    try { results[photo] = await mark(db, parent, photo, env, plan); }
    catch { results[photo] = "error"; }
  }
  const counts: Record<string, number> = {};
  for (const r of Object.values(results)) counts[r] = (counts[r] ?? 0) + 1;
  // Counts only: no family, child or photo id.
  console.info("[scan-send-marking]", JSON.stringify(counts));
  return results;
}
