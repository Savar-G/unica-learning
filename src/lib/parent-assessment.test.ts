import { describe, expect, it, vi } from "vitest";
import { formatInZone } from "@/lib/family-time";
import { freeMonthWords, openingPath, otherTests, reportAction, whatHappensNext } from "@/lib/parent-assessment";
import type { ChildView } from "@/lib/parent-view";
import { nextStep } from "@/lib/report-view";
import { sampleReportView } from "@/lib/sample-children";
import { PLANS } from "@/lib/site";
import { cardTerms } from "@/lib/stripe";

vi.mock("server-only", () => ({}));

const child = (over: Partial<ChildView> = {}): ChildView => ({
  id: "c1", firstName: "Leah", schoolGrade: 3, stage: "no_test", opensOn: "start_test", tabs: ["assessment", "account"], readOnly: false, currentWorkbook: null, reportIds: [], finishedTests: [], ...over,
});

describe("where a child opens", () => {
  it.each([
    ["report_start_free_month"],
    ["report_waitlist"],
  ] as const)("opens %s on the newest report", (opensOn) => {
    expect(openingPath(child({ opensOn, reportIds: ["r2", "r1"] }), {})).toBe("/account/report/r2");
  });

  it.each([["start_test"], ["continue_or_wait"], ["overview"]] as const)("stays on the home page for %s", (opensOn) => {
    expect(openingPath(child({ opensOn, reportIds: ["r1"] }), {})).toBeNull();
  });

  it("stays on the home page when the report has no id, rather than a broken address", () => {
    expect(openingPath(child({ opensOn: "report_waitlist" }), {})).toBeNull();
  });

  it("carries the saved messages to the report, and nothing else", () => {
    const path = openingPath(child({ opensOn: "report_start_free_month", reportIds: ["r1"] }), { password: "1", pin: "1", existing: "1", desk: "error", child: "c1", other: "x" });
    expect(path).toBe("/account/report/r1?password=1&pin=1&existing=1&desk=error");
  });
});

describe("which report offers the action", () => {
  it("offers the card only on a card report of a family with no card", () => {
    expect(reportAction("report_ready_bc", "card")).toBe(true);
    expect(reportAction("report_ready_bc", "waitlist")).toBe(false);
  });
  it("offers the waitlist only on a waitlist report of a waitlist family", () => {
    expect(reportAction("report_ready_waitlist", "waitlist")).toBe(true);
    expect(reportAction("report_ready_waitlist", "card")).toBe(false);
  });
  it("keeps the offer while a new test is open: a family must not lose the button for 24 hours", () => {
    expect(reportAction("test_running", "card")).toBe(true);
  });
  it.each([["first_book_coming"], ["active"], ["ended"], ["no_test"]] as const)("offers nothing in %s", (stage) => {
    expect(reportAction(stage, "card")).toBe(false);
    expect(reportAction(stage, "waitlist")).toBe(false);
  });
});

describe("older tests", () => {
  const zone = "America/Vancouver";
  const date = (at: number) => formatInZone(at, zone, { dateStyle: "long" });
  const OCT = Date.parse("2026-10-05T20:00:00Z");
  const SEP = Date.parse("2026-09-01T20:00:00Z");

  it("lists nothing for one test", () => {
    expect(otherTests(child({ finishedTests: [{ reportId: "r1", finishedAt: OCT }] }), "r1", date)).toEqual([]);
  });

  it("lists the tests newest first, by date, and marks the one in view", () => {
    expect(otherTests(child({ finishedTests: [{ reportId: "r2", finishedAt: OCT }, { reportId: "r1", finishedAt: SEP }] }), "r1", date)).toEqual([
      { href: "/account/report/r2", date: "October 5, 2026", current: false },
      { href: "/account/report/r1", date: "September 1, 2026", current: true },
    ]);
  });

  it("uses the family's day, not the server's", () => {
    const late = Date.parse("2026-10-06T02:00:00Z");
    expect(otherTests(child({ finishedTests: [{ reportId: "r2", finishedAt: late }, { reportId: "r1", finishedAt: SEP }] }), "r2", date)[0].date).toBe("October 5, 2026");
  });
});

describe("the free month's words", () => {
  const terms = cardTerms(PLANS.one.price);
  const words = freeMonthWords("Leah");

  it("says free month, on the button and in the heading, with the child's name", () => {
    expect(words.button).toBe("Start free month");
    expect(words.title).toBe("Start Leah's free month");
  });

  it("uses the Stripe page's own wording for what is charged and when", () => {
    expect(terms.startsWith("Nothing is charged today.")).toBe(true);
    expect(words.note).toContain("Nothing is charged today.");
    expect(words.bar).toContain("Nothing is charged today.");
    expect(terms).toContain("your first workbook arrives at your home");
    expect(words.bar).toContain("your first workbook arrives at your home");
    const reminder = "We email you a reminder 7 days before the first charge";
    expect(terms).toContain(reminder);
    expect(whatHappensNext("Leah").map((s) => s.detail)).toContain(`${reminder}.`);
  });

  it("gives the same price as the Stripe page, in the report's own sentence", () => {
    const text = nextStep(sampleReportView()).text;
    expect(terms).toContain(`CAD ${PLANS.one.price.toFixed(2)}`);
    expect(text).toContain(`CAD ${PLANS.one.price.toFixed(2)} a month`);
  });

  it("never says free trial, she or her", () => {
    const all = [...Object.values(words), ...whatHappensNext("Leah").flatMap((s) => [s.title, s.detail])].join(" ");
    expect(all).not.toMatch(/\b(?:trial|she|her)\b/i);
    expect(all).toContain("Leah");
  });
});
