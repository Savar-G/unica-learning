import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { scanPagesAccess } from "./scan-pages-access";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));

const parent = "00000000-0000-4000-8000-000000000001";
const state = { test: false, admin: false, failed: false, wrongParent: false, queries: [] as URL[] };
const db = createClient<Database>("https://scan-release.example.test", "synthetic-service-key", {
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

it("allows a normal family only with the exact on value", async () => {
  expect(await scanPagesAccess(parent, db, { SCAN_PAGES_ENABLED: "on" })).toBe(true);
  expect(state.queries).toHaveLength(0);
});

it.each([undefined, "off", "true", "ON", "1", ""])('defaults off for a normal family in production: %s', async (flag) => {
  expect(await scanPagesAccess(parent, db, { NODE_ENV: "production", SCAN_PAGES_ENABLED: flag })).toBe(false);
  expect(state.queries).toHaveLength(2);
});

it.each(["test", "admin"] as const)("allows a verified %s while off, and checks again after removal", async (role) => {
  state[role] = true;
  expect(await scanPagesAccess(parent, db, {})).toBe(true);
  state[role] = false;
  expect(await scanPagesAccess(parent, db, {})).toBe(false);
  expect(state.queries).toHaveLength(4);
});

it("fails closed for missing credentials, failed lookups and mismatched identities", async () => {
  expect(await scanPagesAccess(parent, null, {})).toBe(false);
  state.failed = true;
  expect(await scanPagesAccess(parent, db, {})).toBe(false);
  state.failed = false; state.test = true; state.admin = true; state.wrongParent = true;
  expect(await scanPagesAccess(parent, db, {})).toBe(false);
});
