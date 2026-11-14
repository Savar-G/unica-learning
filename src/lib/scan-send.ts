import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { scanChecksDecision, type Env } from "@/lib/scan-marking-access";

// Sending pages for marking (D-270), for every child of the family at once. A page's code files its photo with the
// child whose book it is (#915 sibling filing), so one scan can hold pages of several children: Send groups the ids by
// the child each photo is filed with, and each child's pages go only when Send's own rule (`scanChecksAccess`) opens for
// that child. A sibling whose plan is closed has none of its pages sent. Server only, on the secret key.

/** The Undo's wait on the server: a page held on the phone comes due this long after its hold (#3, scan edge sweep). */
export const HOLD_SECONDS = 10;
/** The longest hold: while the capture screen is open, the phone holds its pages this long, so none sends meanwhile. */
export const MAX_HOLD_SECONDS = 600;

export type SendDecide = (parent: string, child: string) => Promise<{ open: boolean; reason: string }>;
const decideOf = (db: SupabaseClient<Database>, env: Env): SendDecide =>
  (parent, child) => scanChecksDecision(db, parent, env, { child }).catch(() => ({ open: false, reason: "read_failed" }));

export interface ChildSend { child: string; sent: string[] }
export interface FamilySend {
  /** False when no child of these photos may send: the route answers as before, refused. */
  open: boolean;
  sent: string[];
  byChild: ChildSend[];
  /** Children Send refused, with the reason (server logs only). */
  closed: { child: string; ids: string[]; reason: string }[];
  /** Ids of children whose send failed. */
  failed: string[];
}

/** Groups ids by the child each photo is filed with. Only this family's photos are read. Throws on a failed read. */
export async function photosByChild(db: SupabaseClient<Database>, parent: string, ids: readonly string[]): Promise<Map<string, string[]>> {
  const rows = await db.from("scan_photos").select("id,child_id").eq("parent_id", parent).in("id", [...new Set(ids)]);
  if (rows.error) throw new Error("scan_send_read");
  const groups = new Map<string, string[]>();
  for (const r of rows.data ?? []) groups.set(r.child_id, [...(groups.get(r.child_id) ?? []), r.id]);
  return groups;
}

/**
 * Sends each child's pages with `send_scan_photos`, child by child, after that child's access check. One child's failed
 * send does not stop the others; when every open child's send failed, it throws, so the route answers "unavailable".
 */
export async function sendGroups(db: SupabaseClient<Database>, parent: string, groups: ReadonlyMap<string, readonly string[]>, decide: SendDecide,
  send: "send_scan_photos" | "send_due_scan_photos" = "send_scan_photos"): Promise<FamilySend> {
  const out: FamilySend = { open: false, sent: [], byChild: [], closed: [], failed: [] };
  let failed = 0, tried = 0;
  for (const [child, ids] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const decision = await decide(parent, child);
    if (!decision.open) { out.closed.push({ child, ids: [...ids], reason: decision.reason }); continue; }
    out.open = true; tried++;
    const { data, error } = await db.rpc(send, { p_parent: parent, p_child: child, p_ids: [...new Set(ids)] });
    if (error) { failed++; out.failed.push(...ids); continue; }
    const sent = Array.isArray(data) ? data : [];
    out.byChild.push({ child, sent });
    out.sent.push(...sent);
  }
  if (tried && failed === tried) throw new Error("scan_send_failed");
  out.sent.sort();
  return out;
}

/** Send for the parent's Send button and the phone's automatic send: any of the family's photos, grouped by child. */
export async function sendFamilyPhotos(db: SupabaseClient<Database>, parent: string, ids: readonly string[], env: Env = process.env, decide: SendDecide = decideOf(db, env)): Promise<FamilySend> {
  return sendGroups(db, parent, await photosByChild(db, parent, ids), decide);
}

/**
 * Reasons that will not change by themselves: a page held for such a child is let go, so it never sends later on its
 * own. `off` is not one: a malformed parent list closes every family at once and is a mistake to fix, not a decision.
 */
const SETTLED_CLOSED = new Set(["not_test_family", "child_unknown", "no_plan", "ended"]);
/** How long a due page that cannot send now waits before the next try, so it does not push newer pages out of the limit. */
export const DEFER_SECONDS = 3600;

export interface DueSend { parent: string; byChild: ChildSend[] }

/**
 * Sends the held pages whose Undo has passed (`due_scan_sends`, by the database's clock): one family's on its next load of
 * Scan pages, or every family's from the recovery run. Grouped by family and child, each with Send's access check, and
 * sent by `send_due_scan_photos`, which sends only rows that still match the due rule under the family lock (an Undo
 * that lands after the read wins). A page of a child whose access is settled closed is let go (`release_scan_holds`);
 * one that cannot send now (a plan paused, payment failed or unreadable, a failed send, a family being deleted) waits
 * DEFER_SECONDS more (`defer_scan_sends`), so stuck pages never fill the run's limit. Never throws; returns what was sent.
 */
export async function sendDuePhotos(db: SupabaseClient<Database>, o: { parent?: string; limit?: number; env?: Env; decide?: SendDecide } = {}): Promise<DueSend[]> {
  const env = o.env ?? process.env, decide = o.decide ?? decideOf(db, env);
  let rows: { id: string; parent_id: string; child_id: string }[];
  try {
    const due = await db.rpc("due_scan_sends", { p_parent: o.parent ?? null, p_limit: o.limit ?? 100 });
    if (due.error || !Array.isArray(due.data)) return [];
    rows = due.data;
  } catch { return []; }
  const families = new Map<string, Map<string, string[]>>();
  for (const r of rows) {
    const children = families.get(r.parent_id) ?? new Map<string, string[]>();
    children.set(r.child_id, [...(children.get(r.child_id) ?? []), r.id]);
    families.set(r.parent_id, children);
  }
  const out: DueSend[] = [];
  const defer = async (parent: string, ids: string[]) => {
    if (!ids.length) return;
    try { await db.rpc("defer_scan_sends", { p_parent: parent, p_ids: ids, p_seconds: DEFER_SECONDS }); } catch { /* the next run tries again */ }
  };
  for (const [parent, groups] of families) {
    try {
      const result = await sendGroups(db, parent, groups, decide, "send_due_scan_photos");
      const settled = result.closed.filter((c) => SETTLED_CLOSED.has(c.reason)).flatMap((c) => c.ids);
      if (settled.length) await db.rpc("release_scan_holds", { p_parent: parent, p_ids: settled });
      await defer(parent, [...result.closed.filter((c) => !SETTLED_CLOSED.has(c.reason)).flatMap((c) => c.ids), ...result.failed]);
      if (result.sent.length) out.push({ parent, byChild: result.byChild.filter((c) => c.sent.length) });
    } catch { await defer(parent, [...groups.values()].flat()); }
  }
  return out;
}
