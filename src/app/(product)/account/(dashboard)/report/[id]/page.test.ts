import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReportPage from "./page";
import type { ParentDashboard } from "@/lib/parent-dashboard-server";
import type { ChildView } from "@/lib/parent-view";
import { sampleReportView } from "@/lib/sample-children";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/account/report/sample-report",
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
  retake: null as Awaited<ReturnType<typeof import("@/lib/test-attempt-server").parentRetakeState>>,
  offer: { monthly: 79.99, window: "new" } as import("@/lib/family-plan-words").FamilyPlanOffer | null,
  saved: false,
  joined: false,
}));
vi.mock("@/lib/family-plan-offer-server", () => ({ loadFamilyPlanOffer: async () => state.offer }));
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
  state.offer = { monthly: 79.99, window: "new" };
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
    expect(out).toContain("CAD 79.99 a month.");
    expect(out).toContain("Start Leah&#x27;s plan");
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

describe("a family the switch opens to", () => {
  const child = (over: Partial<ChildView> = {}): ChildView => ({
    id: CHILD, firstName: "Leah", schoolGrade: 3, stage: "report_ready_bc", opensOn: "report_start_free_month", tabs: ["assessment", "account"], readOnly: false, currentWorkbook: null,
    reportIds: [ID], finishedTests: [{ reportId: ID, finishedAt: Date.parse("2026-10-05T23:00:00Z") }], ...over,
  });
  const family = (over: Partial<ChildView> = {}) => { state.dashboard = { children: [child(over)], remembered: null, pinSet: true, timeZoneSaved: true }; };
  const waitlist = () => {
    state.report = { view: { ...sampleReportView(), id: ID, province: "ON", model: { ...sampleReportView().model, callToAction: "waitlist" } }, childId: CHILD };
    family({ stage: "report_ready_waitlist", opensOn: "report_waitlist" });
  };
  const count = (text: string, part: string) => text.split(part).length - 1;
  const rail = (out: string) => out.slice(out.indexOf('class="pd-split-rail"'), out.indexOf("</aside>", out.indexOf('class="pd-split-rail"')));
  const main = (out: string) => out.slice(out.indexOf('class="pd-split-main"'), out.indexOf('class="pd-split-rail"'));

  describe("report_ready_bc", () => {
    beforeEach(() => family());

    it("shows the whole report, with one Start plan button beside it and none in it", async () => {
      const out = await open();
      expect(main(out)).toContain("rpt-overall");
      expect(main(out)).toContain("How we help");
      expect(count(out, "Start plan")).toBe(1);
      expect(rail(out)).toContain("Start plan");
      expect(count(out, 'class="rpt-plans"')).toBe(1);
      expect(main(out)).not.toContain("rpt-plans");
    });

    it("has no new form: only a button, on the current route, off until the card check", async () => {
      const out = await open();
      expect(rail(out)).not.toContain("<form");
      expect(rail(out)).not.toContain("<input");
      expect(rail(out)).toContain("Checking your card");
      expect(rail(out)).toMatch(/<button class="btn" type="button" disabled=""[^>]*>Start plan/);
    });

    it("gives the email's plan link somewhere to land, once", async () => {
      const out = await open({ src: "email", step: "plan" });
      expect(count(out, 'id="rpt-next"')).toBe(1);
      expect(rail(out)).toContain('id="rpt-next"');
      expect(out).toContain("is-asked");
    });

    it("says free month and the price, names the child, and never says trial, she or her", async () => {
      const out = await open();
      const side = rail(out);
      expect(side).toContain("Start Leah&#x27;s plan");
      expect(side).toContain("CAD 79.99 a month");
      expect(side).toContain("Nothing is charged today.");
      expect(side).toContain("What happens next");
      expect(side).toContain("Tell us how Leah learns");
      expect(side).not.toMatch(/\b(?:trial|she|her)\b/i);
    });

    it("has no plan wording on the button", async () => {
      expect(rail(await open())).not.toContain("Math, CAD 79.99 a month");
    });

    it("keeps the frame's page parts: the heading, the finish date, and no way back to a list", async () => {
      const out = await open();
      expect(out).toContain("<h1>Leah&#x27;s report</h1>");
      expect(out).toContain("Finished on");
      expect(out).not.toContain("rpt-back");
    });

    it("keeps the free call at the end of the report, once", async () => {
      const out = await open();
      expect(count(out, "Book a call")).toBe(1);
      expect(main(out)).toContain("Book a call");
    });

    it("shows the saved messages that came through /account", async () => {
      expect(await open({ password: "1" })).toContain("Your password is saved.");
      expect(await open()).not.toContain("Your password is saved.");
    });
  });

  describe("report_ready_waitlist", () => {
    beforeEach(waitlist);

    it("offers the waitlist and no free month", async () => {
      const out = await open();
      expect(rail(out)).toContain("Join the waitlist");
      expect(out).not.toContain("free month");
      expect(out).not.toContain("What happens next");
    });

    it("shows the status once the child is on it, in the part a phone keeps in view", async () => {
      state.joined = true;
      const side = rail(await open());
      expect(side).toContain("You are on the waitlist.");
      expect(side).toContain("pd-go-status");
      expect(side).not.toContain("<button");
    });
  });

  describe("once a card is saved", () => {
    it.each([["first_book_coming"], ["active"], ["ended"]] as const)("%s offers no action on the report", async (stage) => {
      family({ stage, opensOn: "overview", tabs: ["overview", "assessment", "account"], readOnly: stage === "ended" });
      const out = await open();
      expect(out).not.toContain("Start plan");
      expect(out).not.toContain('class="rpt-plans"');
      expect(out).not.toContain("Card saved");
    });
  });

  describe("older tests and a new test", () => {
    const OLDER = "33333333-3333-4333-8333-333333333333";
    const tests = { reportIds: [OLDER, ID], finishedTests: [{ reportId: OLDER, finishedAt: Date.parse("2026-10-05T23:00:00Z") }, { reportId: ID, finishedAt: Date.parse("2026-09-01T23:00:00Z") }] };

    it("lists no tests for one test", async () => {
      family();
      expect(await open()).not.toContain("pd-tests");
    });

    it("lists the tests by date, newest first, each a link, and marks the one in view", async () => {
      family(tests);
      const side = rail(await open());
      expect(side.indexOf("October 5, 2026")).toBeGreaterThan(-1);
      expect(side.indexOf("October 5, 2026")).toBeLessThan(side.indexOf("September 1, 2026"));
      expect(side).toContain(`href="/account/report/${OLDER}"`);
      expect(side).toMatch(new RegExp(`aria-current="page" href="/account/report/${ID}"`));
    });

    it("says when the next test opens, with no button, inside the 30 days", async () => {
      family();
      state.retake = { kind: "opens", at: Date.parse("2026-11-04T23:12:00Z") };
      const out = await open();
      expect(out).toContain("The next test opens at 4:12 p.m. on Wednesday, November 4.");
      expect(out).not.toContain("Start a new test");
    });

    it("offers a new test after the 30 days, under the one action", async () => {
      family();
      state.retake = { kind: "open", resume: false };
      const side = rail(await open());
      expect(side).toContain("Start a new test");
      expect(side).toContain(`href="/account/start/${CHILD}"`);
      expect(side).toContain("btn ghost pd-new-test");
      expect(side.indexOf("Start plan")).toBeLessThan(side.indexOf("Start a new test"));
    });

    it("continues a new test that is open", async () => {
      family();
      state.retake = { kind: "open", resume: true };
      expect(rail(await open())).toContain("Continue the new test");
    });

    it("starts nothing new after a plan ended", async () => {
      family({ stage: "ended", opensOn: "overview", readOnly: true });
      state.retake = { kind: "open", resume: false };
      const out = await open();
      expect(out).not.toContain("Start a new test");
      state.retake = { kind: "opens", at: Date.parse("2026-11-04T23:12:00Z") };
      expect(await open()).not.toContain("The next test opens");
    });
  });

  it("keeps today's page for a child who is not in the family's list", async () => {
    family();
    state.report = { view: { ...sampleReportView(), id: ID }, childId: "another-child" };
    expect(await open()).not.toContain("pd-split");
  });

  it("finds nothing for a report the parent may not read", async () => {
    family();
    state.report = null;
    await expect(open()).rejects.toThrow("NOT FOUND");
  });
});

it.each([false, true])("renders current late sibling terms with saved card=%s", async saved => {
  state.offer = { monthly: 59.99, window: "ended" };
  state.saved = saved;
  const out = await open();
  expect(out).toContain("CAD 59.99 a month.");
  expect(out).toContain("A child who starts after that window is charged when their plan starts.");
  expect(out).not.toContain("79.99");
  expect(out).not.toContain("Your first month is free");
});
