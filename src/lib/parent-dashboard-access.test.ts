import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { dashboardSwitchOpen, parentDashboardAccess, planManagementAccess } from "./parent-dashboard-access";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));

const parent = "00000000-0000-4000-8000-000000000001";
const planRow = (child_id: string, kind: string, ends_at: string | null = null) => ({ child_id, kind, next_charge_at: kind === "free_month" ? "2099-01-01T00:00:00Z" : null, ends_at, monthly_cents: 7999, ending_free: false });
const state = { test: false, admin: false, failed: false, wrongParent: false, queries: [] as URL[], plans: [] as ReturnType<typeof planRow>[], starts: [] as unknown[] };
const db = createClient<Database>("https://dashboard-release.example.test", "synthetic-service-key", {
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

it("opens to every family only with the exact value on", async () => {
  expect(await parentDashboardAccess(parent, db, { PARENT_DASHBOARD_ENABLED: "on" })).toBe(true);
  expect(state.queries).toHaveLength(0);
});

it.each([undefined, "off", "true", "ON", "on ", "1", ""])("keeps a normal family out while the value is %s", async (flag) => {
  expect(await parentDashboardAccess(parent, db, { NODE_ENV: "production", PARENT_DASHBOARD_ENABLED: flag })).toBe(false);
  expect(state.queries).toHaveLength(3);
});

it.each(["test", "admin"] as const)("lets a marked %s in while off, and reads the mark on each request", async (role) => {
  state[role] = true;
  expect(await parentDashboardAccess(parent, db, {})).toBe(true);
  state[role] = false;
  expect(await parentDashboardAccess(parent, db, {})).toBe(false);
  expect(state.queries).toHaveLength(5);
});

it("does not read the scan switch", async () => {
  expect(await parentDashboardAccess(parent, db, { SCAN_PAGES_ENABLED: "on" })).toBe(false);
});

it("keeps the family out when the marks cannot be read, when a mark names someone else, and with no secret key", async () => {
  state.failed = true;
  expect(await parentDashboardAccess(parent, db, {})).toBe(false);
  state.failed = false;
  state.test = true;
  state.wrongParent = true;
  expect(await parentDashboardAccess(parent, db, {})).toBe(false);
  expect(await parentDashboardAccess(parent, null, {})).toBe(false);
});

const kid = "00000000-0000-4000-8000-000000000008", sibling = "00000000-0000-4000-8000-000000000009";

it("any child's open plan opens the dashboard at family level, and the switch reads no plan", async () => {
  state.plans = [planRow(kid, "ended"), planRow(sibling, "free_month")];
  expect(await parentDashboardAccess(parent, db, {})).toBe(true);
  expect(await dashboardSwitchOpen(parent, db, {})).toBe(false);
});

it("an ending plan opens until its end date, and a stopped plan closes the dashboard", async () => {
  state.plans = [planRow(kid, "ending", "2099-01-01T00:00:00Z")];
  expect(await parentDashboardAccess(parent, db, {})).toBe(true);
  state.plans = [planRow(kid, "ending", "2000-01-01T00:00:00Z")];
  expect(await parentDashboardAccess(parent, db, {})).toBe(false);
  for (const kind of ["not_started", "ended", "payment_failed", "paused"]) {
    state.plans = [planRow(kid, kind)];
    expect(await parentDashboardAccess(parent, db, {})).toBe(false);
  }
});

describe("planManagementAccess", () => {
  it.each(["ended", "payment_failed", "paused"])("a closed family with a %s plan reaches its plan's controls", async (kind) => {
    state.plans = [planRow(kid, kind)];
    expect(await parentDashboardAccess(parent, db, {})).toBe(false);
    expect(await planManagementAccess(parent, db, {})).toBe(true);
  });
  it("a start with no plan row yet counts", async () => {
    state.starts = [{ state: "started" }];
    expect(await planManagementAccess(parent, db, {})).toBe(true);
  });
  it("a family with no plan is not let in, as before, and a saved card alone is no plan", async () => {
    expect(await planManagementAccess(parent, db, {})).toBe(false);
    state.plans = [planRow(kid, "not_started")];
    expect(await planManagementAccess(parent, db, {})).toBe(false);
  });
  it("every family the dashboard reached still reaches it, with no plan read", async () => {
    expect(await planManagementAccess(parent, db, { PARENT_DASHBOARD_ENABLED: "on" })).toBe(true);
    expect(state.queries).toHaveLength(0);
    state.test = true;
    expect(await planManagementAccess(parent, db, {})).toBe(true);
    state.test = false; state.admin = true;
    expect(await planManagementAccess(parent, db, {})).toBe(true);
  });
  it("a failed read is closed", async () => {
    state.plans = [planRow(kid, "ended")]; state.failed = true;
    expect(await planManagementAccess(parent, db, {})).toBe(false);
    expect(await planManagementAccess(parent, null, {})).toBe(false);
  });
});
