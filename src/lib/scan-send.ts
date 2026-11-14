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
export async function sendGroups(db: SupabaseClient<Database>, parent: string, groups: ReadonlyMap<string, readonly string[]>, decide: SendDecide): Promise<FamilySend> {
  const out: FamilySend = { open: false, sent: [], byChild: [], closed: [] };
  let failed = 0, tried = 0;
  for (const [child, ids] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const decision = await decide(parent, child);
    if (!decision.open) { out.closed.push({ child, ids: [...ids], reason: decision.reason }); continue; }
    out.open = true; tried++;
    const { data, error } = await db.rpc("send_scan_photos", { p_parent: parent, p_child: child, p_ids: [...new Set(ids)] });
    if (error) { failed++; continue; }
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

/** Reasons that will not change by themselves: a page held for such a child is let go, so it never sends later on its own. */
const SETTLED_CLOSED = new Set(["off", "not_test_family", "child_unknown", "no_plan", "ended"]);

export interface DueSend { parent: string; byChild: ChildSend[] }

/**
 * Sends the held pages whose Undo has passed (`due_scan_sends`, by the database's clock): one family's on its next load of
 * Scan pages, or every family's from the recovery run. Grouped by family and child, each with Send's access check; a
 * page of a child whose access is settled closed is let go (`unhold_scan_photos`). A family whose send fails is left for
 * the next run. Never throws; returns what was sent.
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
  for (const [parent, groups] of families) {
    try {
      const result = await sendGroups(db, parent, groups, decide);
      const settled = result.closed.filter((c) => SETTLED_CLOSED.has(c.reason)).flatMap((c) => c.ids);
      if (settled.length) await db.rpc("unhold_scan_photos", { p_parent: parent, p_ids: settled });
      if (result.sent.length) out.push({ parent, byChild: result.byChild.filter((c) => c.sent.length) });
    } catch { /* the next run tries this family again */ }
  }
  return out;
}
