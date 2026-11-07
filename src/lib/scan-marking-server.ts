import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { markedFamily } from "@/lib/scan-pages-access";
import { isUuid } from "@/lib/workbook-content";
import { changeScanMark, markingCommand, scanMarkingStore, type ParentMarkChoice } from "@/lib/scan-marking-store";
import { markingAiClient } from "@/lib/scan-marking-ai";
import { MARKING_MODEL, MARKING_PROMPT_VERSION, markingPageView, runScanMarking } from "@/lib/scan-marking";
import { SCAN_MARKING_LAUNCH_EVIDENCE, scanMarkingLaunchReadiness } from "@/lib/scan-marking-launch";
import { rebuildChildProfile } from "@/lib/child-profile";
import { childProfileStore } from "@/lib/child-profile-store";
import { learningEventStore } from "@/lib/learning-events-store";

type Env = Readonly<Record<string, string | undefined>>;

/** The marking switch. Only the exact values `test-only` and `families` turn it on; anything else is off. */
function markingMode(env: Env) {
  const value = env.SCAN_MARKING_ENABLED;
  return value === "test-only" || value === "families" ? value : "off" as const;
}

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

/** The shared stored child-plan gate's contract (owned by the parent dashboard, `src/lib/plan-access.ts`). */
export type ChildPlanReason = "open" | "ending_until_end" | "no_plan" | "ended" | "payment_failed" | "paused" | "unknown" | "read_failed";
export type ChildPlanAccess = (input: { parentId: string; childId: string }) => Promise<{ open: boolean; reason: ChildPlanReason }>;
const PLAN_REASONS: readonly ChildPlanReason[] = ["open", "ending_until_end", "no_plan", "ended", "payment_failed", "paused", "unknown", "read_failed"];

// TODO(plan-access): replace with `childPlanAccess` from `@/lib/plan-access` once the dashboard's gate is on main.
// Until then no real family's plan reads as running, so families mode admits only test families and admins.
const childPlanAccess: ChildPlanAccess = async () => ({ open: false, reason: "unknown" });

/** Where the marking happens: the child named by the page, or the child that owns the photo. */
export type MarkingScope = Readonly<{ child: string }> | Readonly<{ photo: string }>;
export type MarkingAccessReason = "off" | "test_family" | "not_test_family" | "child_unknown" | ChildPlanReason;
export type MarkingDecision = Readonly<{ open: boolean; reason: MarkingAccessReason }>;

/** null: the list is absent. false: present and malformed, which refuses everyone. Never exposes the identities. */
function testParentList(env: Env): Set<string> | null | false {
  const configured = env.SCAN_MARKING_TEST_PARENT_IDS;
  if (configured === undefined) return null;
  // At most 100 canonical UUIDs and 99 commas.
  if (!configured.length || configured.length > 3699) return false;
  const ids = configured.split(",");
  if (ids.length > 100 || ids.some(id => id.length !== 36 || !isUuid(id))) return false;
  const unique = new Set(ids.map(id => id.toLowerCase()));
  return unique.size === ids.length ? unique : false;
}

async function scopedChild(db: SupabaseClient<Database>, parent: string, scope: MarkingScope | undefined): Promise<string | null> {
  if (!scope) return null;
  if ("child" in scope) return isUuid(scope.child) ? scope.child : null;
  if (!isUuid(scope.photo)) return null;
  try {
    const row = await db.from("scan_photos").select("child_id").eq("id", scope.photo).eq("parent_id", parent).maybeSingle();
    return !row.error && row.data && isUuid(row.data.child_id) ? row.data.child_id : null;
  } catch { return null; }
}

/** Open only for an explicit running answer. Anything else, including a throw or an odd shape, is closed. */
async function planDecision(plan: ChildPlanAccess, parentId: string, childId: string): Promise<MarkingDecision> {
  let answer: unknown;
  try { answer = await plan({ parentId, childId }); } catch { return { open: false, reason: "read_failed" }; }
  const a = answer && typeof answer === "object" ? answer as { open?: unknown; reason?: unknown } : null;
  const reason = a && PLAN_REASONS.includes(a.reason as ChildPlanReason) ? a.reason as ChildPlanReason : "unknown";
  return { open: a?.open === true && (reason === "open" || reason === "ending_until_end"), reason };
}

/**
 * Marking admission, read on each call. `test-only`: test families and admins (and only listed ones when
 * SCAN_MARKING_TEST_PARENT_IDS is present). `families`: the same, plus a real family when the stored plan of the
 * scoped child is running. SCAN_PAGES_ENABLED and browser claims cannot grant it. The reason is for server code
 * and logs only; never show it to a parent.
 */
export async function markingDecision(db: SupabaseClient<Database>, parent: string, env: Env = process.env,
  scope?: MarkingScope, plan: ChildPlanAccess = childPlanAccess): Promise<MarkingDecision> {
  const mode = markingMode(env);
  if (mode === "off") return { open: false, reason: "off" };
  const list = testParentList(env);
  if (list === false) return { open: false, reason: "off" };
  if ((list === null || list.has(parent.toLowerCase())) && await markedFamily(parent, db)) return { open: true, reason: "test_family" };
  if (mode === "test-only") return { open: false, reason: "not_test_family" };
  const child = await scopedChild(db, parent, scope);
  if (!child) return { open: false, reason: "child_unknown" };
  return planDecision(plan, parent, child);
}

export async function markingAccess(db: SupabaseClient<Database>, parent: string, env: Env = process.env,
  scope?: MarkingScope, plan: ChildPlanAccess = childPlanAccess) {
  return (await markingDecision(db, parent, env, scope, plan)).open;
}
export async function processScanMarking(db: SupabaseClient<Database>, parent: string, photo: string, env: Env = process.env, plan: ChildPlanAccess = childPlanAccess) {
  if (!await markingAccess(db, parent, env, { photo }, plan)) return "off";
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
/** The persisted keyset cursor includes already-sent photos. No new Send action is needed after deployment. */
export async function recoverScanMarking(db: SupabaseClient<Database>, env: Env = process.env, plan: ChildPlanAccess = childPlanAccess) {
  if (markingMode(env) === "off") return { status: "off" };
  const rows = await db.rpc("recover_scan_marking", { p_limit: 1 });
  if (rows.error) throw new Error("marking_recovery");
  const value: unknown = rows.data;
  if (!Array.isArray(value)) throw new Error("marking_recovery_shape");
  const results: string[] = [];
  for (const ref of value) {
    if (!ref || typeof ref !== "object" || typeof ref.parent !== "string" || typeof ref.photo !== "string") throw new Error("marking_recovery_shape");
    results.push(await processScanMarking(db, ref.parent, ref.photo, env, plan));
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
