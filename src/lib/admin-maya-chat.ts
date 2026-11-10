import "server-only";
import type { AdminSession } from "@/lib/admin-store";

// The Maya chat list (#530, D-241): the families an admin opened chat for, one at a time, and the one rehearsal family
// (a test family that receives the parent notes and weekly recap). Read and changed with the admin's own session;
// row-level security allows admins only. The chat check itself is in src/lib/maya-chat-server.ts.

export interface ChatFamilyState { listed: boolean; rehearsal: boolean; test: boolean }
export interface ChatFamilyRow { parentId: string; name: string; email: string; addedAt: string; rehearsal: boolean; test: boolean }

function fail(what: string, error: { message: string } | null): asserts error is null {
  if (error) throw new Error(`[admin] ${what}: ${error.message}`);
}

/** One family's place on the list. */
export async function chatFamilyState(a: AdminSession, parentId: string): Promise<ChatFamilyState> {
  const [row, test] = await Promise.all([
    a.db.from("maya_chat_families").select("rehearsal").eq("parent_id", parentId).maybeSingle(),
    a.db.from("test_accounts").select("parent_id").eq("parent_id", parentId).maybeSingle(),
  ]);
  fail("chat family", row.error);
  fail("test account", test.error);
  return { listed: !!row.data, rehearsal: !!row.data?.rehearsal, test: !!test.data };
}

/** The whole list, newest first, with each family's name and email. */
export async function chatFamilyList(a: AdminSession): Promise<ChatFamilyRow[]> {
  const rows = await a.db.from("maya_chat_families").select("parent_id, added_at, rehearsal").order("added_at", { ascending: false });
  fail("chat families", rows.error);
  const ids = (rows.data ?? []).map((r) => r.parent_id);
  if (ids.length === 0) return [];
  const [parents, tests] = await Promise.all([
    a.db.rpc("admin_parents").select("id, name, email").in("id", ids),
    a.db.from("test_accounts").select("parent_id").in("parent_id", ids),
  ]);
  fail("parents", parents.error);
  fail("test accounts", tests.error);
  const byId = new Map((parents.data ?? []).map((p) => [p.id, p]));
  const testIds = new Set((tests.data ?? []).map((t) => t.parent_id));
  return (rows.data ?? []).map((r) => ({
    parentId: r.parent_id, name: byId.get(r.parent_id)?.name ?? "-", email: byId.get(r.parent_id)?.email ?? "-",
    addedAt: r.added_at, rehearsal: r.rehearsal, test: testIds.has(r.parent_id),
  }));
}

export type ChatFamilyChange = { listed: boolean } | { rehearsal: boolean };
export type ChatFamilyResult = "ok" | "not_test_family" | "not_listed" | "taken";

/** Adds or removes a family, or marks or unmarks the rehearsal family. */
export async function setChatFamily(a: AdminSession, parentId: string, change: ChatFamilyChange): Promise<ChatFamilyResult> {
  // The database locks the parent before any chat/test tuple and checks the current state under that lock (#621).
  const { data, error } = await a.db.rpc("admin_set_maya_chat_family", {
    p_parent: parentId, p_change: "listed" in change ? "listed" : "rehearsal",
    p_enabled: "listed" in change ? change.listed : change.rehearsal,
  });
  fail("chat family", error);
  if (data === "ok" || data === "not_test_family" || data === "not_listed" || data === "taken") return data;
  throw new Error("[admin] chat family: invalid result");
}

/**
 * The chat switch in plain words, for the family page and the chat list. `MAYA_CHAT_ENABLED`: "on" opens chat to
 * families on the list; "off" is the emergency stop (only test families keep chat); unset leaves only open plans.
 */
export function chatSwitchText(value: string | undefined = process.env.MAYA_CHAT_ENABLED): string {
  if (value === "on") return "Maya chat is on for families on the list and for every child with an open plan.";
  if (value === "off") return "Maya chat is off for everyone. Only test families can still use it.";
  return "Maya chat is on only for children with an open plan. Families on the list do not get it yet.";
}
