import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import PlanPage from "./page";
import type { ChildPlan } from "@/lib/parent-plan-server";
import { canCancel } from "@/lib/parent-plan";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/account/plan", useRouter: () => ({}), redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); } }));
const f = vi.hoisted(() => ({ dashboard: null as unknown, plans: [] as unknown[], pending: new Map<string, "pause" | "restart" | "cancel">() }));
vi.mock("@/lib/parent-dashboard-server", () => ({ parentDashboard: async () => f.dashboard }));
vi.mock("@/lib/plan-controls-server", () => ({ familyPendingControls: async () => f.pending }));
vi.mock("@/lib/parent-plan-server", () => ({ familyPlans: async () => f.plans }));
vi.mock("@/lib/supabase-auth", () => ({
  parentId: async () => "p1",
  sessionClient: async () => ({
    from: () => ({
      select: () => {
        const query = { order: () => query, maybeSingle: async () => ({ data: { postal: null, time_zone: "America/Vancouver" } }), then: (resolve: (r: { data: unknown[] }) => unknown) => resolve({ data: [{ id: "c1", created_at: "2026-01-01", province: "BC" }] }) };
        return query;
      },
    }),
  }),
}));

const failed: ChildPlan = { cardId: "card-1", childName: "Leah", plan: { kind: "payment_failed" } };
const page = async () => renderToStaticMarkup(await PlanPage());

beforeEach(() => { f.dashboard = null; f.plans = [failed]; f.pending = new Map(); });

it("keeps today's words for a family the dashboard's switch does not open to", async () => {
  const out = await page();
  expect(out).toContain("Your last payment did not go through. To update your card, email");
  expect(out).not.toContain('href="/account/settings"');
  expect(out).not.toContain("Update card");
  expect(canCancel(failed.plan)).toBe(true);
  expect(out).toContain("Cancel plan");
});

it("points a dashboard family to the card update on the Account tab, and keeps the cancel button here", async () => {
  f.dashboard = { children: [] };
  const out = await page();
  expect(out).toContain('Please <a href="/account/settings">update your card</a>.');
  expect(out).not.toContain("To update your card, email");
  expect(out).toContain("Cancel plan");
});

it("keeps the recovery action visible after a lost pause response, including when the provider is already paused", async () => {
  f.dashboard = { children: [] }; f.pending.set("card-1", "pause");
  f.plans = [{ cardId: "card-1", childName: "Leah", plan: { kind: "paused", resumesOn: "2026-12-01T18:00:00Z", monthly: 79.99 } }];
  expect(await page()).toContain("Check pause");
});
