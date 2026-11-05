import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
vi.mock("server-only", () => ({}));
import { setChatFamily } from "@/lib/admin-maya-chat";

// The admin's rehearsal change (#530, review of PR #584). The database refuses a rehearsal row for a family without
// its test mark (trigger maya_chat_family_guard). Here the admin's read still sees the test mark, as when another admin
// removed it in between, and the database refuses the update: the admin gets the plain refusal, not a failure.

type Row = Record<string, unknown>;
function adminDb(tables: Record<string, Row[]>, refuseUpdate = false) {
  return createClient<Database>("https://test.invalid", "test", { global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop()!;
    let rows = tables[table] ?? [];
    for (const [key, raw] of url.searchParams) if (raw.startsWith("eq.")) rows = rows.filter((r) => String(r[key]) === raw.slice(3));
    if (init?.method === "PATCH") {
      if (refuseUpdate) return Response.json({ code: "55000", message: "maya_chat_rehearsal_not_test_family" }, { status: 400 });
      const change = JSON.parse(String(init.body));
      for (const r of rows) Object.assign(r, change);
      return Response.json(rows);
    }
    const single = (init?.headers as Record<string, string> | undefined)?.Accept === "application/vnd.pgrst.object+json"
      || new Headers(init?.headers).get("accept") === "application/vnd.pgrst.object+json";
    return Response.json(single ? rows[0] ?? null : rows);
  } } });
}
const session = (db: ReturnType<typeof adminDb>) => ({ db, userId: "admin", email: "admin@example.com" });

describe("rehearsal changes by an admin", () => {
  it("reports the database refusal when the test mark went away after the admin's read", async () => {
    const db = adminDb({ maya_chat_families: [{ parent_id: "p", rehearsal: false }], test_accounts: [{ parent_id: "p" }] }, true);
    expect(await setChatFamily(session(db), "p", { rehearsal: true })).toBe("not_test_family");
  });
  it("marks a listed test family", async () => {
    const families = [{ parent_id: "p", rehearsal: false }];
    const db = adminDb({ maya_chat_families: families, test_accounts: [{ parent_id: "p" }] });
    expect(await setChatFamily(session(db), "p", { rehearsal: true })).toBe("ok");
    expect(families[0].rehearsal).toBe(true);
  });
  it("refuses a family that is not a test family before writing", async () => {
    const db = adminDb({ maya_chat_families: [{ parent_id: "p", rehearsal: false }], test_accounts: [] });
    expect(await setChatFamily(session(db), "p", { rehearsal: true })).toBe("not_test_family");
  });
  it("says so when the family left the list before the change", async () => {
    const db = adminDb({ maya_chat_families: [], test_accounts: [{ parent_id: "p" }] });
    expect(await setChatFamily(session(db), "p", { rehearsal: false })).toBe("not_listed");
  });
});
