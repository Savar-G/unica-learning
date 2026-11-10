import "server-only";
// Our team's marks (#715, D-266): when the AI is unsure of an answer, an admin sets its mark. No screen asks a parent
// to judge an answer. The team list and the mark go through the admin's own session (admin_scan_team_queue and
// admin_set_scan_mark check public.admin_users); the event and profile work after a mark uses the server's key, the
// same way as after a parent's correction. A parent can still change a team mark afterwards.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { isUuid } from "@/lib/workbook-content";
import { publishMarkChange } from "@/lib/scan-marking-server";

export interface TeamMarkChoice { item: string; version: number; result: "right" | "wrong" | "blank" }
export function teamMarkChoice(value: unknown): TeamMarkChoice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some((key) => !["item", "version", "result"].includes(key)) || typeof v.item !== "string" || !isUuid(v.item)
    || typeof v.version !== "number" || !Number.isSafeInteger(v.version) || v.version < 1 || v.version > 999_999_999
    || (v.result !== "right" && v.result !== "wrong" && v.result !== "blank")) return null;
  return { item: v.item, version: v.version, result: v.result };
}

/**
 * One rule for "can be marked", the same as admin_set_scan_mark: an answer that counts toward progress, with no learning
 * event yet, needs a photo, because its event must name the photo it came from. Without one, the list says so instead of
 * offering a mark, and the function answers no_photo.
 */
export const teamMarkNeedsPhoto = (a: { eligible: boolean; hasEvent: boolean; photo: string | null }) => a.eligible && !a.hasEvent && !a.photo;

export type TeamMarkResult =
  | { status: "saved"; version: number; recoveryPending: boolean }
  | { status: "conflict" | "not_waiting" | "no_photo"; version: number }
  | { status: "refused" };
/** Set the mark with the admin's session, then publish the event and rebuild the profile with the server's key. */
export async function setScanTeamMark(adminDb: SupabaseClient<Database>, serviceDb: SupabaseClient<Database>, choice: TeamMarkChoice): Promise<TeamMarkResult> {
  const r = await adminDb.rpc("admin_set_scan_mark", { p_item: choice.item, p_version: choice.version, p_result: choice.result });
  if (r.error) throw new Error("team_mark_store");
  const v = r.data;
  if (v === "refused") return { status: "refused" };
  if (!v || typeof v !== "object" || Array.isArray(v) || typeof v.version !== "number") throw new Error("team_mark_shape");
  if (v.status === "conflict" || v.status === "not_waiting" || v.status === "no_photo") return { status: v.status, version: v.version };
  if (v.status !== "saved" || typeof v.parent !== "string" || typeof v.child !== "string") throw new Error("team_mark_shape");
  return { status: "saved", version: v.version, recoveryPending: await publishMarkChange(serviceDb, v.parent, v.child) };
}

export interface TeamQueueItem {
  item: string; parent: string; child: string; childName: string; book: number; page: number; question: number;
  photo: string | null; issue: string | null; read: string | null; since: string; testFamily: boolean;
}
const text = (v: unknown) => (typeof v === "string" ? v : null);
/**
 * The items waiting for our team, oldest first. `withTests`: the "Show test families" switch (D-313). Off, the test and
 * team families are left out in the database, before the limit, so test answers never push a real one off the list.
 * `total`: the rows the list could hold (it can be more than the list). `realTotal`: the real families' answers only,
 * whatever the switch says: the one number the page and the sidebar badge show.
 */
export async function readScanTeamQueue(adminDb: SupabaseClient<Database>, limit = 100, { withTests = false } = {}): Promise<{ items: TeamQueueItem[]; total: number; realTotal: number }> {
  const r = await adminDb.rpc("admin_scan_team_queue_v2", { p_limit: limit, p_with_tests: withTests });
  if (r.error || !Array.isArray(r.data)) throw new Error("team_queue_store");
  // Generated return types say not null; the issue, reading and photo can be null, so each value is checked here.
  const items = r.data.map((row: Record<string, unknown>) => {
    if (typeof row.item_id !== "string" || typeof row.parent_id !== "string" || typeof row.child_id !== "string"
      || typeof row.question_number !== "number" || typeof row.page_number !== "number" || typeof row.book !== "number"
      || typeof row.waiting_since !== "string") throw new Error("team_queue_shape");
    return { item: row.item_id, parent: row.parent_id, child: row.child_id, childName: text(row.child_name) ?? "", book: row.book,
      page: row.page_number, question: row.question_number, photo: text(row.photo_id), issue: text(row.issue), read: text(row.read_text),
      since: row.waiting_since, testFamily: row.test_family === true };
  });
  const first = r.data[0] as { total?: unknown; real_total?: unknown } | undefined;
  const total = first ? Number(first.total) : 0, realTotal = first ? Number(first.real_total) : 0;
  if (!Number.isSafeInteger(total) || total < items.length || !Number.isSafeInteger(realTotal) || realTotal < 0
    || realTotal < items.filter((i) => !i.testFamily).length || (!withTests && (realTotal !== total || items.some((i) => i.testFamily)))) throw new Error("team_queue_shape");
  return { items, total, realTotal };
}
