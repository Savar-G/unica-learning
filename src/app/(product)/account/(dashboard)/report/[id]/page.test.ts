import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReportPage from "./page";
import type { ParentDashboard } from "@/lib/parent-dashboard-server";
import { sampleReportView } from "@/lib/sample-children";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({}),
  notFound: () => { throw new Error("NOT FOUND"); },
  redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); },
}));
vi.mock("next/server", () => ({ after: () => undefined }));
const ID = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const state = vi.hoisted(() => ({
  dashboard: null as ParentDashboard | null,
  report: null as { view: ReturnType<typeof import("@/lib/sample-children").sampleReportView>; childId: string } | null,
  retake: null as import("@/lib/report-view").RetakeState | null,
  saved: false,
  joined: false,
}));
vi.mock("@/lib/parent-dashboard-server", () => ({ parentDashboard: async () => state.dashboard }));
vi.mock("@/lib/report-loading", () => ({ loadReportView: async () => state.report }));
vi.mock("@/lib/report-loading-server", () => ({ parentReportReader: () => ({}) }));
vi.mock("@/lib/email-clicks", () => ({ recordReportEmailClick: async () => undefined }));
vi.mock("@/lib/test-attempt-server", () => ({ parentRetakeState: async () => state.retake }));
vi.mock("@/lib/supabase-auth", () => ({
  adminClient: () => null,
  parentId: async () => "p1",
  sessionClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "card_setups" ? (state.saved ? { plan: "one", card_saved_at: "2026-11-01T00:00:00Z" } : null)
              : table === "waitlist_joins" ? (state.joined ? { child_id: CHILD } : null)
              : {},
          }),
        }),
      }),
    }),
  }),
}));

const open = async (query: Record<string, string> = {}) =>
  renderToStaticMarkup(createElement("div", null, await ReportPage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve(query) })));

beforeEach(() => {
  state.dashboard = null;
  state.report = { view: { ...sampleReportView(), id: ID }, childId: CHILD };
  state.retake = null;
  state.saved = false;
  state.joined = false;
});

// The golden files were written from the page before the rail existed (#552). They may change only with a change to the
// report itself.
describe("a family the switch does not open to", () => {
  it("gets today's report page, byte for byte", async () => {
    const out = await open();
    await expect(out).toMatchFileSnapshot("./report-bc.golden.html");
    expect(out).not.toContain("pd-");
    expect(out).toContain("Math, CAD 79.99 a month");
    expect(out).not.toContain("Start free month");
  });

  it("gets today's report from the email's plan link, with a saved card, byte for byte", async () => {
    state.saved = true;
    await expect(await open({ src: "email", step: "plan" })).toMatchFileSnapshot("./report-bc-saved.golden.html");
  });

  it("gets today's waitlist report, byte for byte", async () => {
    state.report = { view: { ...sampleReportView(), id: ID, province: "ON", model: { ...sampleReportView().model, callToAction: "waitlist" } }, childId: CHILD };
    const out = await open();
    await expect(out).toMatchFileSnapshot("./report-waitlist.golden.html");
    expect(out).toContain("Join the waitlist");
    expect(out).not.toContain("pd-");
  });
});
