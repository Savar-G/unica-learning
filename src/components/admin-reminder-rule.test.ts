import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-store", () => ({ LIST_MAX: 100, requireAdmin: async () => ({ email: "admin@example.invalid" }), listNextSteps: async () => ({ cards: { rows: [], more: false }, waitlist: { rows: [], more: false } }) }));
vi.mock("@/lib/admin-book1-baselines-server", () => ({ loadAdminBook1Baselines: async () => ({ rows: [], more: false, unavailable: false }) }));
vi.mock("@/lib/admin-scan-progress-server", () => ({ loadAdminScanHolds: async () => ({ rows: [], more: false, unavailable: false }) }));
// The frame reads the request (the test families switch, the sidebar counts); this test checks the page inside it.
vi.mock("@/components/admin-frame", () => ({ AdminFrame: ({ children }: { children: unknown }) => children }));
vi.mock("@/lib/admin-test-families-server", () => ({ loadTestFamilies: async () => ({ show: false, isTest: () => false, keep: () => true, hidden: [], ids: [] }) }));
import Page from "@/app/(product)/admin/next-steps/page";
import { STAGE_ACTION } from "@/lib/admin-dashboard";
import { planReminderDue } from "@/lib/plan-reminder";

it("states the reminder condition on the admin page", async () => {
 const html = renderToStaticMarkup(await Page({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })).replaceAll("<!-- -->", "");
 expect(html).toContain("If at least 7 days remain when the plan starts, Stripe emails the parent a reminder 7 days before the first charge");
});

it("states the same rule on the dashboard's free trial stage, with no day 30 for a late sibling", () => {
 expect(STAGE_ACTION.trial).toBe("In the free first month. If at least 7 days remain when the plan starts, Stripe emails the parent a reminder 7 days before the first charge.");
});

it("keeps both stage lines after the merge with main: main's start action and this branch's reminder rule", () => {
 expect(STAGE_ACTION.card_saved).toBe("After you confirm the first workbook has arrived at the family's home, press \"Workbook delivered: start plan\" under Plans and delivery.");
 expect(STAGE_ACTION.trial).toBe("In the free first month. If at least 7 days remain when the plan starts, Stripe emails the parent a reminder 7 days before the first charge.");
});

it("decides the reminder by the time left at the plan start, with exactly 7 days included", () => {
 const start = Date.parse("2026-11-10T18:00:00Z"), day = 86_400_000;
 expect(planReminderDue(start, start + 30 * day)).toBe(true);
 expect(planReminderDue(start, start + 7 * day)).toBe(true);
 expect(planReminderDue(start, start + 7 * day - 1)).toBe(false);
 expect(planReminderDue(start, start)).toBe(false);
});
