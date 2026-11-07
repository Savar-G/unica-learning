import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/account/settings", useRouter: () => ({}), redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); } }));
const f = vi.hoisted(() => ({ dashboard: null as unknown, manage: false }));
vi.mock("@/lib/parent-dashboard-server", () => ({ parentDashboard: async () => f.dashboard }));
vi.mock("@/lib/parent-dashboard-access", () => ({ planManagementAccess: async () => f.manage }));
vi.mock("@/components/plan-closed-note", () => ({ PlanClosedNote: () => "Your plan is not running" }));
vi.mock("@/components/account-billing-section", () => ({ BillingSection: () => "Update card and invoices" }));
vi.mock("@/components/account-child-details", () => ({ childDetails: async () => "Child details and delete" }));
vi.mock("@/components/family-delete", () => ({ FamilyDelete: () => "Delete this family" }));
vi.mock("@/components/account", () => ({ AddChild: () => null, SignOut: () => null }));
vi.mock("@/lib/supabase-auth", () => ({
  parentId: async () => "p1",
  sessionClient: async () => ({
    from: () => ({
      select: () => {
        const query = { order: () => query, maybeSingle: async () => ({ data: { postal: null, time_zone: "America/Vancouver" } }), then: (resolve: (r: { data: unknown[] }) => unknown) => resolve({ data: [{ card_saved_at: "2026-10-01" }] }) };
        return query;
      },
    }),
  }),
}));
import AccountSettings from "./page";

const page = async () => renderToStaticMarkup(await AccountSettings({ searchParams: Promise.resolve({}), params: Promise.resolve({}) }));
beforeEach(() => { f.dashboard = null; f.manage = false; });

it("a closed family with a plan gets its card, its invoices and the deletes, with a plain note and no dashboard", async () => {
  f.manage = true;
  const out = await page();
  for (const text of ["Your plan is not running", "Update card and invoices", "Child details and delete", "Delete this family", "/account/plan"]) expect(out).toContain(text);
});

it("a family with no plan and no dashboard goes to Parent home, as before", async () => {
  await expect(page()).rejects.toThrow("REDIRECT /account");
});

it("a dashboard family sees no closed note", async () => {
  f.dashboard = { children: [] };
  const out = await page();
  expect(out).not.toContain("Your plan is not running");
  expect(out).toContain("Update card and invoices");
});
