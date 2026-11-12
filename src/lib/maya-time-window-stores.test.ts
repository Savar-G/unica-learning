import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { mayaWeeklyStore } from "@/lib/maya-weekly-email-store";
vi.mock("server-only", () => ({}));

it("R425M-1: claims call IDs and the unsubscribe hash in one RPC", async () => {
  const requests: { path: string; body: unknown }[] = [];
  const db = createClient<Database>("https://fixture.invalid", "key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    requests.push({ path: new URL(String(input)).pathname, body: JSON.parse(String(init?.body)) });
    return Response.json("claim-id");
  } } });
  expect(await mayaWeeklyStore(db).ledger.claim({ parentId: "p", weekStart: "2026-11-02", zone: "America/Toronto", callIds: ["a", "b"], retry: null }, { unsubscribe_hash: "hash" })).toBe("claim-id");
  expect(requests).toEqual([{ path: "/rest/v1/rpc/claim_maya_weekly", body: { p_parent: "p", p_week: "2026-11-02", p_calls: ["a", "b"], p_hash: "hash", p_retry: null, p_attempts: 0 } }]);
});
