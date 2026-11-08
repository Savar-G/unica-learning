import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { childPlanAccess, markingDecision, markingMode, type ChildPlanAccess, type Env } from "@/lib/scan-marking-access";
import { changeScanMark, markingCommand, scanMarkingStore, type ParentMarkChoice } from "@/lib/scan-marking-store";
import { markingAiClient } from "@/lib/scan-marking-ai";
import { MARKING_MODEL, MARKING_PROMPT_VERSION, markingPageView, runScanMarking } from "@/lib/scan-marking";
import { SCAN_MARKING_LAUNCH_EVIDENCE, scanMarkingLaunchReadiness } from "@/lib/scan-marking-launch";
import { rebuildChildProfile } from "@/lib/child-profile";
import { childProfileStore } from "@/lib/child-profile-store";
import { learningEventStore } from "@/lib/learning-events-store";

export { markingAccess, markingDecision, type ChildPlanAccess, type ChildPlanAccessDeps, type ChildPlanReason, type MarkingDecision, type MarkingScope } from "@/lib/scan-marking-access";

/**
 * Evidence readiness. `familyReady` reads only the source-controlled launch record; it is not the switch. The
 * `families` mode is Savar's release switch and admits real families through the plan gate below.
 */
export function scanMarkingServerReadiness(env: Env = process.env, now: string = new Date().toISOString()) {
  const saved = SCAN_MARKING_LAUNCH_EVIDENCE;
  const current = saved.candidate ? { ...saved.candidate, model: env.SCAN_MARKING_MODEL?.trim() || MARKING_MODEL, prompt: MARKING_PROMPT_VERSION } : null;
  const evidence = scanMarkingLaunchReadiness(current, saved, now);
  return {
    mode: markingMode(env),
    familyReady: false as const,
    blockers: [...evidence.blockers, "family-release-held"],
  };
}

export interface ProcessMarkingOptions {
  /** The time left for the model call (`runScanMarking`). The recovery run sets it from its database deadline. */
  aiTimeLeftMs?: () => number;
  /**
   * Given: the child's profile rebuild is left to the caller, which rebuilds each child once (the recovery run, #726).
   * Absent: the rebuild runs here, after this photo.
   */
  deferRebuild?: (child: string) => void;
}
export async function processScanMarking(db: SupabaseClient<Database>, parent: string, photo: string, env: Env = process.env, plan: ChildPlanAccess = childPlanAccess, options: ProcessMarkingOptions = {}) {
  const decision = await markingDecision(db, parent, env, { photo }, plan);
  if (!decision.open) {
    // Families mode: a closed plan stops new (paid) marking, but marks already committed still reach the child's
    // learning events and profile. No claim, image read or model call happens here.
    if (markingMode(env) === "families" && decision.reason !== "off" && decision.reason !== "child_unknown") await publishCommitted(db, parent, photo, options);
    return "off";
  }
  const row = await db.from("scan_photos").select("child_id").eq("id", photo).eq("parent_id", parent).maybeSingle();
  if (row.error || !row.data) return "terminal";
  const store = scanMarkingStore(db), child = row.data.child_id;
  // Recover committed intents and profile work even after image expiry or a worker crash after application.
  await store.publish(parent, child);
  const result = await runScanMarking(store, { parent, photo }, crypto.randomUUID(), markingAiClient(env), () => new Date().toISOString(),
    { aiTimeLeftMs: options.aiTimeLeftMs });
  await rebuildOrDefer(db, child, options);
  return result;
}
async function publishCommitted(db: SupabaseClient<Database>, parent: string, photo: string, options: ProcessMarkingOptions) {
  const row = await db.from("scan_photos").select("child_id").eq("id", photo).eq("parent_id", parent).maybeSingle();
  if (row.error || !row.data) return;
  const child = row.data.child_id;
  await scanMarkingStore(db).publish(parent, child);
  await rebuildOrDefer(db, child, options);
}
async function rebuildOrDefer(db: SupabaseClient<Database>, child: string, options: ProcessMarkingOptions) {
  if (options.deferRebuild) { options.deferRebuild(child); return; }
  await rebuildChildNow(db, child);
}
// No profile AI call is needed. This rebuild consumes the same canonical effective set as page results.
async function rebuildChildNow(db: SupabaseClient<Database>, child: string) {
  const rebuilt = await rebuildChildProfile(child, { profiles: childProfileStore(db), events: learningEventStore(db) });
  if (!rebuilt.built && rebuilt.reason !== "nothing_to_build") throw new Error("marking_profile_pending");
}
/** Stable results read. Photo expiry is deliberately not a history filter. */
export async function readScanMarking(db: SupabaseClient<Database>, parent: string, photo: string) {
  const row = await db.from("scan_photos").select("id,child_id,workbook_id,page_id,printed_revision,state,expires_at").eq("id", photo).eq("parent_id", parent).maybeSingle();
  if (row.error || !row.data) return null;
  const p = row.data;
  const marks = (await scanMarkingStore(db).effective(parent, p.child_id)).filter((m) => m.expected.identity.workbookId === p.workbook_id && m.expected.identity.pageId === p.page_id && m.expected.identity.printedRevision === p.printed_revision);
  const detail = await markingCommand(db)("detail", parent, photo, null);
  const held = detail && typeof detail === "object" && "job" in detail && detail.job && typeof detail.job === "object" && "blocked_reason" in detail.job ? detail.job.blocked_reason : null;
  const view = markingPageView(marks);
  const evidenceIds = [...new Set(view.items.flatMap((i) => i.evidencePhoto ? [i.evidencePhoto] : []))];
  const evidence = evidenceIds.length ? await db.from("scan_photos").select("id,state,expires_at").eq("parent_id", parent).in("id", evidenceIds) : { data: [], error: null };
  if (evidence.error) throw new Error("marking_evidence_state");
  const activeEvidence = new Set((evidence.data ?? []).filter((p) => p.state === "saved" && Date.parse(p.expires_at) > Date.now()).map((p) => p.id));
  const items = view.items.map((i) => ({ ...i, photoAvailable: i.evidencePhoto !== null && activeEvidence.has(i.evidencePhoto) }));
  return { ...view, items, budgetHeld: held === "budget", photoAvailable: p.state === "saved" && Date.parse(p.expires_at) > Date.now(), marks, detail };
}
/**
 * One recovery run (#726): the cron route `/api/scan-marking` (the pg_cron job `scan-marking-recovery` every 15 minutes,
 * and the daily Vercel cron) calls this. It takes the waiting photos one at a time, the oldest sent first
 * (`recover_scan_marking_oldest`), and marks each through `processScanMarking`, until the start rule below stops it or
 * no photo is left.
 *
 * Numbers (2026-11-07):
 * - The route may run 180 s (`maxDuration`); its database client stops every request 170 s after the request started
 *   (`RECOVERY_DB_LIMIT_MS`).
 * - Start rule: a new photo starts only while less than 40 s has passed (`RECOVERY_START_MS`). At about 8 s a photo
 *   (measured Sonnet calls in the marking ledger: median 2.7 s, 90th percentile 3.3 s), one run marks about 5 photos,
 *   about 20 an hour from the job.
 * - The model call's timeout: the time left before the database deadline less `RECOVERY_AFTER_AI_MS` (25 s for
 *   extract, apply, publish, finish and the profile rebuilds at the end of the run), and at most 120 s
 *   (`markingAiTimeout`). With less than 20 s left the call does not start and the photo waits as `pending`. So a
 *   paid answer always has time to be saved before the database client stops; the image read and the claim before
 *   the call count against the same deadline.
 * - The claim's lease (180 s) is longer than any run, so a lease a run takes can outlive the call when the function is
 *   stopped; the next run then gets `busy` for that photo and a later run takes it.
 * - Profile rebuilds: each child's profile is rebuilt once, after the run's photos (a busy or closed-plan photo still
 *   publishes its committed marks at once). A failed rebuild is retried by a later run: the list keeps every child whose
 *   profile is behind its marks.
 * - At most 100 photos are asked for in one run (`RECOVERY_MAX_PHOTOS`), so a list of closed plans cannot keep a run
 *   going without end.
 *
 * Every answer of a photo goes on to the next photo: `busy` (the family's one slot, or a claim another run holds),
 * `off` (a closed plan: committed marks are published, no claim and no model call), `pending`, `budget`, `terminal`
 * and an error. Such a photo stays in the list, so a later run takes it again. Only a failed list read ends the run.
 * When the list ends (an empty answer), the function has set its cursor back to the start; the run asks once more, so
 * the restart does not waste the run. The run stops at the first photo it already had, because the list has wrapped.
 *
 * Two runs at once (the job and the daily cron, or a slow run): each list call locks the cursor, so the two get
 * different photos, and when they meet the same photo the claim in `scan_marking_command` gives one lease and the other
 * run `busy`. No photo is marked twice. A rare double charge is still possible: the known lease gap, when a lease ends
 * while its paid call is still out and another run claims the photo again.
 *
 * A family whose slot is busy for the whole run (Send is marking its pages) keeps its photos waiting; the run reaches
 * them again on its next pass (#726, P3-4, left as it is).
 *
 * `test-only` follows the same rule as `families` (#726 decision): only listed test families and admins pass
 * `markingDecision`, so every other photo answers `off` at no cost, and the test families see the same drain the
 * families will see. Before #726 `test-only` took one step per run.
 */
export const RECOVERY_START_MS = 40_000;
export const RECOVERY_DB_LIMIT_MS = 170_000;
export const RECOVERY_AFTER_AI_MS = 25_000;
export const RECOVERY_MAX_PHOTOS = 100;
export type RecoveryResult = Awaited<ReturnType<typeof processScanMarking>> | "error";
export interface RecoveryDeps {
  /** When the request started: the start rule counts from then. Default: when this run starts. */
  startedAt?: number;
  now?: () => number;
  mark?: typeof processScanMarking;
  /** The profile rebuild of one child. Default: `rebuildChildProfile` with the database stores. */
  rebuild?: (child: string) => Promise<void>;
}
export async function recoverScanMarking(db: SupabaseClient<Database>, env: Env = process.env, plan: ChildPlanAccess = childPlanAccess, deps: RecoveryDeps = {}) {
  if (markingMode(env) === "off") return { status: "off" };
  const now = deps.now ?? Date.now, mark = deps.mark ?? processScanMarking, startedAt = deps.startedAt ?? now();
  const results: RecoveryResult[] = [], seen = new Set<string>(), children = new Set<string>();
  const options: ProcessMarkingOptions = {
    aiTimeLeftMs: () => startedAt + RECOVERY_DB_LIMIT_MS - RECOVERY_AFTER_AI_MS - now(),
    deferRebuild: (child) => { children.add(child); },
  };
  let restarted = false;
  while (seen.size < RECOVERY_MAX_PHOTOS && now() - startedAt < RECOVERY_START_MS) {
    const rows = await db.rpc("recover_scan_marking_oldest", { p_limit: 1 });
    if (rows.error) throw new Error("marking_recovery");
    const value: unknown = rows.data;
    if (!Array.isArray(value)) throw new Error("marking_recovery_shape");
    if (!value.length) {
      // The end of the list: the cursor is back at the start. Ask once more in this run.
      if (restarted) break;
      restarted = true;
      continue;
    }
    const ref: unknown = value[0];
    if (!ref || typeof ref !== "object" || !("parent" in ref) || !("photo" in ref) || typeof ref.parent !== "string" || typeof ref.photo !== "string") throw new Error("marking_recovery_shape");
    // The list has wrapped (this run's restart, or another run's): every photo from here on was this run's already.
    if (seen.has(ref.photo)) break;
    seen.add(ref.photo);
    try { results.push(await mark(db, ref.parent, ref.photo, env, plan, options)); }
    catch { results.push("error"); }
  }
  // One profile rebuild per child, after its photos. A failure stays in the list for a later run.
  let profilesPending = 0;
  for (const child of children) {
    try { await (deps.rebuild ?? ((c: string) => rebuildChildNow(db, c)))(child); }
    catch { profilesPending++; }
  }
  const counts: Record<string, number> = {};
  for (const r of results) counts[r] = (counts[r] ?? 0) + 1;
  if (profilesPending) counts.profile_pending = profilesPending;
  // Counts only: no family, child or photo id.
  console.info("[scan-marking-recovery]", JSON.stringify(counts));
  return { status: "processed", results };
}

/**
 * After a person's mark (a parent's correction or our team's mark): publish the effective event and rebuild the child's
 * profile from the same canonical set. True when that work is still pending; the recovery cursor retries it.
 */
export async function publishMarkChange(db: SupabaseClient<Database>, parent: string, child: string): Promise<boolean> {
  try {
    await scanMarkingStore(db).publish(parent, child);
    const rebuilt = await rebuildChildProfile(child, { profiles: childProfileStore(db), events: learningEventStore(db) });
    return (!rebuilt.built && rebuilt.reason !== "nothing_to_build") || (rebuilt.built && rebuilt.skillStates.outcome === "failed");
  } catch {
    // The transaction advanced the durable revision. The existing recovery cursor retries after image expiry.
    return true;
  }
}
/**
 * A parent corrects a finished mark (#715): an answer with no mark yet is the AI's and our team's, so its change is
 * refused. A version's mark never changes, so checking the version the parent sent is race free; a newer version
 * answers conflict from the store as before.
 */
export async function changeScanMarking(db: SupabaseClient<Database>, parent: string, photo: string, choice: ParentMarkChoice) {
  if (await unmarkedVersion(db, parent, photo, choice)) return { status: "refused" as const };
  const changed = await changeScanMark(markingCommand(db), parent, photo, choice);
  if (changed.status === "refused") return changed;
  if (changed.status === "saved") {
    let child: string;
    try { child = await childForPhoto(db, parent, photo); } catch { return { status: "saved" as const, recoveryPending: true }; }
    if (await publishMarkChange(db, parent, child)) return { status: "saved" as const, recoveryPending: true };
  }
  return { status: changed.status, recoveryPending: false };
}
async function unmarkedVersion(db: SupabaseClient<Database>, parent: string, photo: string, choice: ParentMarkChoice) {
  const p = await db.from("scan_photos").select("child_id,workbook_id,page_id,printed_revision").eq("id", photo).eq("parent_id", parent).maybeSingle();
  if (p.error) throw new Error("mark_change_read");
  if (!p.data || !p.data.workbook_id || !p.data.page_id || !p.data.printed_revision) return false;
  const m = await db.from("scan_marking_items").select("result_version,observation").eq("parent_id", parent).eq("child_id", p.data.child_id)
    .eq("workbook_id", p.data.workbook_id).eq("page_id", p.data.page_id).eq("printed_revision", p.data.printed_revision).eq("item_id", choice.itemId).maybeSingle();
  if (m.error) throw new Error("mark_change_read");
  const o = m.data?.observation;
  return !!m.data && m.data.result_version === choice.version && !!o && typeof o === "object" && !Array.isArray(o) && (o.result === null || o.result === undefined);
}
async function childForPhoto(db: SupabaseClient<Database>, parent: string, photo: string) {
  const r = await db.from("scan_photos").select("child_id").eq("id", photo).eq("parent_id", parent).single();
  if (r.error || !r.data) throw new Error("mark_change_owner");
  return r.data.child_id;
}
