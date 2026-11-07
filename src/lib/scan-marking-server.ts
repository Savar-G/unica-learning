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

export async function processScanMarking(db: SupabaseClient<Database>, parent: string, photo: string, env: Env = process.env, plan: ChildPlanAccess = childPlanAccess) {
  const decision = await markingDecision(db, parent, env, { photo }, plan);
  if (!decision.open) {
    // Families mode: a closed plan stops new (paid) marking, but marks already committed still reach the child's
    // learning events and profile. No claim, image read or model call happens here.
    if (markingMode(env) === "families" && decision.reason !== "off" && decision.reason !== "child_unknown") await publishCommitted(db, parent, photo);
    return "off";
  }
  const row = await db.from("scan_photos").select("child_id").eq("id", photo).eq("parent_id", parent).maybeSingle();
  if (row.error || !row.data) return "terminal";
  const store = scanMarkingStore(db), child = row.data.child_id;
  // Recover committed intents and profile work even after image expiry or a worker crash after application.
  await store.publish(parent, child);
  const result = await runScanMarking(store, { parent, photo }, crypto.randomUUID(), markingAiClient(env), () => new Date().toISOString());
  // No profile AI call is needed. This rebuild consumes the same canonical effective set as page results.
  const rebuilt = await rebuildChildProfile(child, { profiles: childProfileStore(db), events: learningEventStore(db) });
  if (!rebuilt.built && rebuilt.reason !== "nothing_to_build") throw new Error("marking_profile_pending");
  return result;
}
async function publishCommitted(db: SupabaseClient<Database>, parent: string, photo: string) {
  const row = await db.from("scan_photos").select("child_id").eq("id", photo).eq("parent_id", parent).maybeSingle();
  if (row.error || !row.data) return;
  const child = row.data.child_id;
  await scanMarkingStore(db).publish(parent, child);
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
const RECOVERY_STEPS = 10;
/** The persisted keyset cursor includes already-sent photos. No new Send action is needed after deployment. */
export async function recoverScanMarking(db: SupabaseClient<Database>, env: Env = process.env, plan: ChildPlanAccess = childPlanAccess) {
  if (markingMode(env) === "off") return { status: "off" };
  // In families mode a refused photo (closed plan) only publishes committed marks, then the run takes the next photo
  // on the same cursor, at most RECOVERY_STEPS in one run, so closed plans do not hold up other families.
  const steps = markingMode(env) === "families" ? RECOVERY_STEPS : 1;
  const results: string[] = [];
  for (let step = 0; step < steps; step++) {
    const rows = await db.rpc("recover_scan_marking", { p_limit: 1 });
    if (rows.error) throw new Error("marking_recovery");
    const value: unknown = rows.data;
    if (!Array.isArray(value)) throw new Error("marking_recovery_shape");
    if (!value.length) break;
    let worked = false;
    for (const ref of value) {
      if (!ref || typeof ref !== "object" || typeof ref.parent !== "string" || typeof ref.photo !== "string") throw new Error("marking_recovery_shape");
      const result = await processScanMarking(db, ref.parent, ref.photo, env, plan);
      results.push(result);
      if (result !== "off") worked = true;
    }
    if (worked) break;
  }
  return { status: "processed", results };
}

/** Recover the durable event/profile intent without invoking automatic marking or image work. */
export async function changeScanMarking(db: SupabaseClient<Database>, parent: string, photo: string, choice: ParentMarkChoice) {
  const changed = await changeScanMark(markingCommand(db), parent, photo, choice);
  if (changed.status === "refused") return changed;
  if (changed.status === "saved") {
    try {
      const child = await childForPhoto(db, parent, photo);
      await scanMarkingStore(db).publish(parent, child);
      const rebuilt = await rebuildChildProfile(child, { profiles: childProfileStore(db), events: learningEventStore(db) });
      if ((!rebuilt.built && rebuilt.reason !== "nothing_to_build") || (rebuilt.built && rebuilt.skillStates.outcome === "failed")) throw new Error("mark_change_profile_pending");
    } catch {
      // The transaction advanced the durable revision. The existing recovery cursor retries after image expiry.
      return { status: "saved" as const, recoveryPending: true };
    }
  }
  return { status: changed.status, recoveryPending: false };
}
async function childForPhoto(db: SupabaseClient<Database>, parent: string, photo: string) {
  const r = await db.from("scan_photos").select("child_id").eq("id", photo).eq("parent_id", parent).single();
  if (r.error || !r.data) throw new Error("mark_change_owner");
  return r.data.child_id;
}
