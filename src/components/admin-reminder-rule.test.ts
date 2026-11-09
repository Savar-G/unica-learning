import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-store", () => ({ LIST_MAX: 100, requireAdmin: async () => ({ email: "admin@example.invalid" }), listNextSteps: async () => ({ cards: { rows: [], more: false }, waitlist: { rows: [], more: false } }) }));
vi.mock("@/lib/admin-scan-progress-server", () => ({ loadAdminScanHolds: async () => ({ rows: [], more: false, unavailable: false }) }));
import Page from "@/app/(product)/admin/next-steps/page";

it("states the reminder condition on the admin page", async () => {
 const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) })).replaceAll("<!-- -->", "");
 expect(html).toContain("If at least 7 days remain when the plan starts, Stripe emails the parent a reminder 7 days before the first charge");
});
