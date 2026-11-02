import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { createMinutesLedger } from "@/lib/maya-minutes";
import { mayaMinutesStore } from "@/lib/maya-minutes-store";
import { mayaWeeklyStore } from "@/lib/maya-weekly-email-store";
vi.mock("server-only", () => ({}));

it("R425M-2: sends the new start instant to both public minutes RPCs", async () => {
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  const db = createClient<Database>("https://fixture.invalid", "key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const path = new URL(String(input)).pathname;
    requests.push({ path, body: JSON.parse(String(init?.body)) });
    return Response.json(path.endsWith("grant_maya_minutes") ? [{ granted: 0, used_before: 1800 }] : 1800);
  } } });
  const ledger = createMinutesLedger({ store: mayaMinutesStore(db), clock: () => Date.parse("2026-11-09T06:30:00Z") });
  const base = { parentId: "p", childId: "c", timeZone: "America/Vancouver" };
  expect(await ledger.usage(base)).toMatchObject({ usedSeconds: 1800 });
  expect(await ledger.grantChild({ ...base, callId: "call" })).toMatchObject({ ok: false });
  expect(requests.map((r) => r.body.p_period_start)).toEqual(["2026-11-02T07:00:00.000Z", "2026-11-02T07:00:00.000Z"]);
  expect(requests[0].body).not.toHaveProperty("p_period");
});

it("R425M-1: claims call IDs and the unsubscribe hash in one RPC", async () => {
  const requests: { path: string; body: unknown }[] = [];
  const db = createClient<Database>("https://fixture.invalid", "key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    requests.push({ path: new URL(String(input)).pathname, body: JSON.parse(String(init?.body)) });
    return Response.json("claim-id");
  } } });
  expect(await mayaWeeklyStore(db).ledger.claim({ parentId: "p", weekStart: "2026-11-02", zone: "America/Toronto", callIds: ["a", "b"], retry: null }, { unsubscribe_hash: "hash" })).toBe("claim-id");
  expect(requests).toEqual([{ path: "/rest/v1/rpc/claim_maya_weekly", body: { p_parent: "p", p_week: "2026-11-02", p_calls: ["a", "b"], p_hash: "hash", p_retry: null, p_attempts: 0 } }]);
});
