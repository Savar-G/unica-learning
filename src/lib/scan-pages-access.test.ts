import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { scanChildAccess, scanPagesAccess, scanReleased } from "./scan-pages-access";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));

const parent = "00000000-0000-4000-8000-000000000001";
const planRow = (child_id: string, kind: string, ends_at: string | null = null) => ({ child_id, kind, next_charge_at: kind === "free_month" ? "2099-01-01T00:00:00Z" : null, ends_at, monthly_cents: 7999, ending_free: false });
const state = { test: false, admin: false, failed: false, wrongParent: false, queries: [] as URL[], plans: [] as ReturnType<typeof planRow>[], starts: [] as unknown[] };
const db = createClient<Database>("https://scan-release.example.test", "synthetic-service-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input) => {
    const url = new URL(String(input));
    state.queries.push(url);
    if (state.failed) return Response.json({ message: "unavailable" }, { status: 503 });
    if (url.pathname.endsWith("/child_plan_states")) {
      expect(url.searchParams.get("parent_id")).toBe(`eq.${parent}`);
      const child = url.searchParams.get("child_id");
      return Response.json(state.plans.filter((p) => !child || `eq.${p.child_id}` === child));
    }
    if (url.pathname.endsWith("/plan_starts")) return Response.json(state.starts);
    const test = url.pathname.endsWith("/test_accounts");
    const column = test ? "parent_id" : "user_id";
    expect(url.searchParams.get(column)).toBe(`eq.${parent}`);
    const marked = test ? state.test : state.admin;
    return Response.json(marked ? [{ [column]: state.wrongParent ? "another-family" : parent }] : []);
  } },
});

beforeEach(() => { state.test = false; state.admin = false; state.failed = false; state.wrongParent = false; state.queries = []; state.plans = []; state.starts = []; });

it("allows a normal family only with the exact on value", async () => {
  expect(await scanPagesAccess(parent, db, { SCAN_PAGES_ENABLED: "on" })).toBe(true);
  expect(state.queries).toHaveLength(0);
});

it.each([undefined, "off", "true", "ON", "1", ""])('defaults off for a normal family in production: %s', async (flag) => {
  expect(await scanPagesAccess(parent, db, { NODE_ENV: "production", SCAN_PAGES_ENABLED: flag })).toBe(false);
  expect(state.queries).toHaveLength(3);
});

it.each(["test", "admin"] as const)("allows a verified %s while off, and checks again after removal", async (role) => {
  state[role] = true;
  expect(await scanPagesAccess(parent, db, {})).toBe(true);
  state[role] = false;
  expect(await scanPagesAccess(parent, db, {})).toBe(false);
  expect(state.queries).toHaveLength(5);
});

it("fails closed for missing credentials, failed lookups and mismatched identities", async () => {
  expect(await scanPagesAccess(parent, null, {})).toBe(false);
  state.failed = true;
  expect(await scanPagesAccess(parent, db, {})).toBe(false);
  state.failed = false; state.test = true; state.admin = true; state.wrongParent = true;
  expect(await scanPagesAccess(parent, db, {})).toBe(false);
});

const sibling = "00000000-0000-4000-8000-000000000009", kid = "00000000-0000-4000-8000-000000000008";

it.each(["free_month", "paying"])("a %s plan opens the family's way in and only its own child", async (kind) => {
  state.plans = [planRow(kid, kind)];
  expect(await scanPagesAccess(parent, db, {})).toBe(true);
  expect(await scanChildAccess(parent, kid, db, {})).toBe(true);
  expect(await scanChildAccess(parent, sibling, db, {})).toBe(false);
  expect(await scanReleased(parent, db, {})).toBe(false);
});

it.each(["not_started", "ended", "payment_failed", "paused"])("a %s plan opens nothing", async (kind) => {
  state.plans = [planRow(kid, kind)];
  expect(await scanPagesAccess(parent, db, {})).toBe(false);
  expect(await scanChildAccess(parent, kid, db, {})).toBe(false);
});

it("the switch and a mark still open every child, with no plan read", async () => {
  expect(await scanChildAccess(parent, sibling, db, { SCAN_PAGES_ENABLED: "on" })).toBe(true);
  expect(state.queries).toHaveLength(0);
  state.test = true;
  expect(await scanChildAccess(parent, sibling, db, {})).toBe(true);
  expect(state.queries.some((q) => q.pathname.endsWith("/child_plan_states"))).toBe(false);
});

it("a family with no plan reads closed for each child, and a failed read is closed", async () => {
  expect(await scanChildAccess(parent, kid, db, {})).toBe(false);
  state.plans = [planRow(kid, "paying")];
  state.failed = true;
  expect(await scanChildAccess(parent, kid, db, {})).toBe(false);
  expect(await scanChildAccess(parent, kid, null, {})).toBe(false);
});
