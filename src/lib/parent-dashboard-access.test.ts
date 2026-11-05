import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { parentDashboardAccess } from "./parent-dashboard-access";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));

const parent = "00000000-0000-4000-8000-000000000001";
const state = { test: false, admin: false, failed: false, wrongParent: false, queries: [] as URL[] };
const db = createClient<Database>("https://dashboard-release.example.test", "synthetic-service-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input) => {
    const url = new URL(String(input));
    state.queries.push(url);
    if (state.failed) return Response.json({ message: "unavailable" }, { status: 503 });
    const test = url.pathname.endsWith("/test_accounts");
    const column = test ? "parent_id" : "user_id";
    expect(url.searchParams.get(column)).toBe(`eq.${parent}`);
    const marked = test ? state.test : state.admin;
    return Response.json(marked ? [{ [column]: state.wrongParent ? "another-family" : parent }] : []);
  } },
});

beforeEach(() => { state.test = false; state.admin = false; state.failed = false; state.wrongParent = false; state.queries = []; });

it("opens to every family only with the exact value on", async () => {
  expect(await parentDashboardAccess(parent, db, { PARENT_DASHBOARD_ENABLED: "on" })).toBe(true);
  expect(state.queries).toHaveLength(0);
});

it.each([undefined, "off", "true", "ON", "on ", "1", ""])("keeps a normal family out while the value is %s", async (flag) => {
  expect(await parentDashboardAccess(parent, db, { NODE_ENV: "production", PARENT_DASHBOARD_ENABLED: flag })).toBe(false);
  expect(state.queries).toHaveLength(2);
});

it.each(["test", "admin"] as const)("lets a marked %s in while off, and reads the mark on each request", async (role) => {
  state[role] = true;
  expect(await parentDashboardAccess(parent, db, {})).toBe(true);
  state[role] = false;
  expect(await parentDashboardAccess(parent, db, {})).toBe(false);
  expect(state.queries).toHaveLength(4);
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
