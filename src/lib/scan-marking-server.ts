import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { markedFamily } from "@/lib/scan-pages-access";
import { markingCommand, scanMarkingStore } from "@/lib/scan-marking-store";
import { markingAiClient } from "@/lib/scan-marking-ai";
import { markingPageView, runScanMarking } from "@/lib/scan-marking";
import { rebuildChildProfile } from "@/lib/child-profile";
import { childProfileStore } from "@/lib/child-profile-store";
import { learningEventStore } from "@/lib/learning-events-store";

/** S4 is restricted to marked families even if the wider scan release switch changes. Off is the default. */
export async function markingAccess(db: SupabaseClient<Database>, parent: string, env: Readonly<Record<string, string | undefined>> = process.env) {
  return env.SCAN_MARKING_ENABLED === "test-only" && await markedFamily(parent, db);
}
export async function processScanMarking(db: SupabaseClient<Database>, parent: string, photo: string, env: Readonly<Record<string, string | undefined>> = process.env) {
  if (!await markingAccess(db, parent, env)) return "off";
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
  return { ...markingPageView(marks), budgetHeld: held === "budget", photoAvailable: p.state === "saved" && Date.parse(p.expires_at) > Date.now(), marks, detail };
}
/** The persisted keyset cursor includes already-sent photos. No new Send action is needed after deployment. */
export async function recoverScanMarking(db: SupabaseClient<Database>, env: Readonly<Record<string, string | undefined>> = process.env) {
  if (env.SCAN_MARKING_ENABLED !== "test-only") return { status: "off" };
  const rows = await db.rpc("recover_scan_marking", { p_limit: 1 });
  if (rows.error) throw new Error("marking_recovery");
  const value: unknown = rows.data;
  if (!Array.isArray(value)) throw new Error("marking_recovery_shape");
  const results: string[] = [];
  for (const ref of value) {
    if (!ref || typeof ref !== "object" || typeof ref.parent !== "string" || typeof ref.photo !== "string") throw new Error("marking_recovery_shape");
    results.push(await processScanMarking(db, ref.parent, ref.photo, env));
  }
  return { status: "processed", results };
}
