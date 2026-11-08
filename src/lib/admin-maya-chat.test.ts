import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
vi.mock("server-only", () => ({}));
import { setChatFamily, type ChatFamilyChange, type ChatFamilyResult } from "@/lib/admin-maya-chat";
import { setTestAccount } from "@/lib/admin-store";

// Exercise the exported admin functions through the real Supabase client. Direct table access fails, so these
// controls cannot pass while a writer still uses the old tuple-before-parent path. Postgres concurrency is checked
// separately by supabase/tests/maya_admin_lock_order.py.
function session(response: unknown = "ok", status = 200) {
  const requests: { path: string; body: unknown }[] = [];
  const db = createClient<Database>("https://test.invalid", "test", { global: { fetch: async (input, init) => {
    const path = new URL(String(input)).pathname;
    requests.push({ path, body: JSON.parse(String(init?.body ?? "null")) });
    if (!path.startsWith("/rest/v1/rpc/")) return Response.json({ message: "Direct table access refused" }, { status: 403 });
    return Response.json(response, { status });
  } } });
  return { db, userId: "admin", email: "admin@example.com", requests };
}

describe("admin family changes", () => {
  it.each<[ChatFamilyChange, string, boolean]>([
    [{ listed: true }, "listed", true], [{ listed: false }, "listed", false],
    [{ rehearsal: true }, "rehearsal", true], [{ rehearsal: false }, "rehearsal", false],
  ])("changes chat through the parent-first function: %j", async (change, kind, enabled) => {
    const a = session();
    expect(await setChatFamily(a, "p", change)).toBe("ok");
    expect(a.requests).toEqual([{ path: "/rest/v1/rpc/admin_set_maya_chat_family", body: { p_parent: "p", p_change: kind, p_enabled: enabled } }]);
  });

  it.each<ChatFamilyResult>(["ok", "not_test_family", "not_listed", "taken"])("keeps the database result: %s", async (result) => {
    expect(await setChatFamily(session(result), "p", { rehearsal: true })).toBe(result);
  });

  it.each([true, false])("changes the test mark through the parent-first function: %s", async (test) => {
    const a = session(null);
    await setTestAccount(a, "p", test);
    expect(a.requests).toEqual([{ path: "/rest/v1/rpc/admin_set_test_account", body: { p_parent: "p", p_test: test } }]);
  });

  it.each(["admin_required", "family_unavailable"])("reports a refused write: %s", async (message) => {
    await expect(setChatFamily(session({ message }, 403), "p", { listed: true })).rejects.toThrow(message);
    await expect(setTestAccount(session({ message }, 403), "p", false)).rejects.toThrow(message);
  });

  it.each([null, "unexpected"])("refuses an invalid database result: %s", async (result) => {
    await expect(setChatFamily(session(result), "p", { rehearsal: false })).rejects.toThrow();
  });
});
