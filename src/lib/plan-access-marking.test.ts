import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));
vi.mock("@/lib/parent-problem-explanation-store", () => ({ parentExplanationStore: () => ({}) }));
vi.mock("@/lib/parent-problem-explanation-ai", () => ({ explanationAiClient: () => ({}) }));
vi.mock("@/lib/parent-problem-explanation", () => ({ explainParentProblem: vi.fn() }));
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { childPlanAccess } from "@/lib/plan-access";
import { explanationAccess } from "@/lib/parent-problem-explanation-server";
import { markingAccess, scanChecksAccess } from "@/lib/scan-marking-access";
import { scanChildAccess, scanPagesAccess } from "@/lib/scan-pages-access";
import { parentDashboardAccess } from "@/lib/parent-dashboard-access";

// Two gates, kept apart. The plan gate decides reaching Scan pages, the dashboard and Explain. src/lib/scan-marking-access.ts
// decides marking, Send, the photo checks, crops and recovery. An open plan must not grant marking: production stays `test-only`.
const parent = "11111111-1111-4111-8111-111111111111", kid = "22222222-2222-4222-8222-222222222222", sibling = "33333333-3333-4333-8333-333333333333", photo = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;
const fake = (tables: Record<string, Row[]>) => ({
  from(table: string) {
    const filters: [string, unknown][] = [];
    const answer = () => (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
    const chain = {
      select: () => chain,
      eq(column: string, value: unknown) { filters.push([column, value]); return chain; },
      abortSignal: () => chain,
      async maybeSingle() { return { data: answer()[0] ?? null, error: null }; },
      then<T>(resolve: (r: { data: Row[]; error: null }) => T) { return Promise.resolve({ data: answer(), error: null }).then(resolve); },
    };
    return chain;
  },
}) as unknown as SupabaseClient<Database>;

const planFamily = fake({
  child_plan_states: [{ parent_id: parent, child_id: kid, kind: "paying", next_charge_at: null, ends_at: null, monthly_cents: 7999, ending_free: false }],
  children: [{ id: kid, parent_id: parent }, { id: sibling, parent_id: parent }],
  scan_photos: [{ id: photo, parent_id: parent, child_id: kid }],
});
const testFamily = fake({ test_accounts: [{ parent_id: parent }], children: [{ id: kid, parent_id: parent }], scan_photos: [{ id: photo, parent_id: parent, child_id: kid }] });

describe("a family whose only access is an open plan", () => {
  it("reaches Scan pages for its own child, the dashboard and Explain", async () => {
    expect((await childPlanAccess({ parentId: parent, childId: kid }, { db: planFamily })).open).toBe(true);
    expect(await scanPagesAccess(parent, planFamily, {})).toBe(true);
    expect(await scanChildAccess(parent, kid, planFamily, {})).toBe(true);
    expect(await scanChildAccess(parent, sibling, planFamily, {})).toBe(false);
    expect(await parentDashboardAccess(parent, planFamily, {})).toBe(true);
    expect(await explanationAccess(planFamily, parent, photo)).toBe(true);
  });

  it.each([undefined, "off", "test-only"])("gains no marking, Send or checks with SCAN_MARKING_ENABLED=%s", async (value) => {
    const env = { SCAN_MARKING_ENABLED: value };
    expect(await markingAccess(planFamily, parent, env, { child: kid })).toBe(false);
    expect(await markingAccess(planFamily, parent, env, { photo })).toBe(false);
    expect(await scanChecksAccess(planFamily, parent, env, { child: kid })).toBe(false);
    expect(await scanChecksAccess(planFamily, parent, env, { photo })).toBe(false);
  });

  it("gains none in families mode either, while the stand-in in scan-marking-access.ts stays: the marking thread swaps it", async () => {
    const env = { SCAN_MARKING_ENABLED: "families" };
    expect(await markingAccess(planFamily, parent, env, { child: kid })).toBe(false);
    expect(await scanChecksAccess(planFamily, parent, env, { child: kid })).toBe(false);
  });
});

describe("marking does not open what the plan gate decides", () => {
  it("a family with no plan and no mark reaches nothing, in every marking mode", async () => {
    const none = fake({ children: [{ id: kid, parent_id: parent }], scan_photos: [{ id: photo, parent_id: parent, child_id: kid }] });
    expect(await scanPagesAccess(parent, none, {})).toBe(false);
    expect(await parentDashboardAccess(parent, none, {})).toBe(false);
    for (const value of [undefined, "test-only", "families"]) expect(await markingAccess(none, parent, { SCAN_MARKING_ENABLED: value }, { child: kid })).toBe(false);
  });

  it("a test family keeps marking under test-only and its way to Scan pages, with no plan", async () => {
    expect(await markingAccess(testFamily, parent, { SCAN_MARKING_ENABLED: "test-only" }, { child: kid })).toBe(true);
    expect(await scanChildAccess(parent, kid, testFamily, {})).toBe(true);
  });
});
