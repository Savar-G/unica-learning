// The scan stack poll (GET /api/account/scans) reads the family's test mark and the child's plan once per request
// (scanAccessReads), not once per check, and the next request reads them again: a changed plan or a removed test mark
// counts at once. Through the real route, with a fake database that counts each read.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";

vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ db: null as SupabaseClient<Database> | null }));
const parent = "00000000-0000-4000-8000-000000000001";
const child = "00000000-0000-4000-8000-000000000003";
vi.mock("@/lib/supabase-auth", () => ({
  adminClient: () => auth.db,
  sessionClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-000000000001" } }, error: null }),
      getClaims: async () => ({ data: { claims: { sub: "00000000-0000-4000-8000-000000000001", session_id: "session" } }, error: null }),
    },
  }),
}));
vi.mock("@/lib/scan-stack-server", () => ({ readScanStack: async () => ({ photos: [], pages: [] }) }));
import { GET } from "@/app/api/account/scans/route";

const planRow = (kind: string) => ({ child_id: child, parent_id: parent, kind, next_charge_at: null, ends_at: null, monthly_cents: 7999, ending_free: false });
const state = { marked: false, plans: [] as ReturnType<typeof planRow>[], reads: {} as Record<string, number> };
auth.db = createClient<Database>("https://scan-reads.example.test", "synthetic-service-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1)!;
    state.reads[table] = (state.reads[table] ?? 0) + 1;
    if (table === "scan_session_active") return Response.json(true);
    if (table === "test_accounts") return Response.json(state.marked ? [{ parent_id: parent }] : []);
    if (table === "admin_users") return Response.json([]);
    if (table === "child_plan_states") {
      const named = url.searchParams.get("child_id");
      return Response.json(state.plans.filter((p) => !named || named === `eq.${p.child_id}`));
    }
    if (table === "children") return Response.json(url.searchParams.get("id") === `eq.${child}` ? [{ id: child }] : []);
    throw new Error(`Unexpected read: ${url.pathname}`);
  } },
});

const poll = () => GET(new Request(`https://unicalearning.com/api/account/scans?child=${child}`));
beforeEach(() => {
  Object.assign(state, { marked: false, plans: [], reads: {} });
  vi.stubEnv("SCAN_MARKING_ENABLED", "families");
  vi.stubEnv("SCAN_PAGES_ENABLED", "");
});
afterEach(() => vi.unstubAllEnvs());

it("reads the test mark once and the child's plan once in one poll, with the same answer", async () => {
  state.plans = [planRow("paying")];
  const r = await poll();
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ checks: true, marking: true });
  // the gate, the child check, the checks and the marking: one test mark read, one family plan read and one child plan read
  expect(state.reads).toMatchObject({ scan_session_active: 1, test_accounts: 1, admin_users: 1, child_plan_states: 2 });
});

it("reads again on the next poll and sees a plan that closed", async () => {
  state.plans = [planRow("paying")];
  expect((await poll()).status).toBe(200);
  state.plans = [planRow("ended")];
  await expect(poll()).rejects.toThrow();
  expect(state.reads.child_plan_states).toBe(3);
});

it("reads again on the next poll and sees a removed test mark", async () => {
  state.marked = true;
  const first = await poll();
  expect(await first.json()).toMatchObject({ checks: true, marking: true });
  expect(state.reads).toMatchObject({ test_accounts: 1, admin_users: 1 });
  state.marked = false;
  await expect(poll()).rejects.toThrow();
  expect(state.reads).toMatchObject({ test_accounts: 2, admin_users: 2 });
});

it("a closed child plan still refuses the poll for that child while a sibling's plan opens the family", async () => {
  state.plans = [{ ...planRow("paying"), child_id: "00000000-0000-4000-8000-000000000004" }];
  const r = await poll();
  expect(r.status).toBe(404);
});
