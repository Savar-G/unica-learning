import { describe, expect, it } from "vitest";
import { scoredAgainst } from "@/lib/assessment";
import { childStage, type ChildStageFacts, type TabSwitches } from "@/lib/child-stage";
import type { ParentPlan } from "@/lib/parent-plan";
import { CURRICULA, type CurriculumId } from "@/lib/signup";

// The child stage rule (spec #544, D-235): one stage per child, the first match in the spec's order wins.

const NONE: ChildStageFacts = { test: { state: "none" }, cardSaved: false, delivered: false, plan: "unknown" };
const BC_REPORT = { state: "report_ready", curriculum: "BC" } as const;
const ALL_OFF: TabSwitches = { progress: false, maya: false, scanPages: false };
const ALL_ON: TabSwitches = { progress: true, maya: true, scanPages: true };

const stage = (facts: Partial<ChildStageFacts>) => childStage({ ...NONE, ...facts }, ALL_OFF).stage;

describe("each stage, with its opening page and tabs", () => {
  it.each([
    ["no_test", {}, "start_test", ["assessment", "account"], false],
    ["test_running", { test: { state: "running" } }, "continue_or_wait", ["assessment", "account"], false],
    ["report_ready_bc", { test: BC_REPORT }, "report_start_free_month", ["assessment", "account"], false],
    ["report_ready_waitlist", { test: { state: "report_ready", curriculum: "ON" } }, "report_waitlist", ["assessment", "account"], false],
    ["first_book_coming", { test: BC_REPORT, cardSaved: true }, "overview", ["overview", "progress", "workbooks", "assessment", "account"], false],
    ["active", { test: BC_REPORT, cardSaved: true, delivered: true, plan: "paying" }, "overview", ["overview", "progress", "workbooks", "scan_pages", "maya", "assessment", "account"], false],
    ["ended", { test: BC_REPORT, cardSaved: true, delivered: true, plan: "ended" }, "overview", ["overview", "progress", "workbooks", "maya", "assessment", "account"], true],
  ] as const)("%s", (name, facts, opensOn, tabs, readOnly) => {
    expect(childStage({ ...NONE, ...facts }, ALL_ON)).toEqual({ stage: name, opensOn, tabs: [...tabs], readOnly });
  });
});

describe("the first match in the spec's order wins, for each pair of neighbours", () => {
  it("ended over active: a delivered book and an ended plan", () => {
    expect(stage({ delivered: true, plan: "ended" })).toBe("ended");
  });
  it("ended also without a delivery, because it is first in the order", () => {
    expect(stage({ cardSaved: true, plan: "ended" })).toBe("ended");
  });
  it("active over first_book_coming: a saved card and a delivered book", () => {
    expect(stage({ cardSaved: true, delivered: true })).toBe("active");
  });
  it("first_book_coming over test_running: a saved card and a test open", () => {
    expect(stage({ cardSaved: true, test: { state: "running" } })).toBe("first_book_coming");
  });
  it("first_book_coming with a saved card and no finished test", () => {
    expect(stage({ cardSaved: true })).toBe("first_book_coming");
  });
  it("a saved card outside BC is also first_book_coming, not the waitlist", () => {
    expect(stage({ cardSaved: true, test: { state: "report_ready", curriculum: "AB" } })).toBe("first_book_coming");
  });
  it("report_ready_bc and report_ready_waitlist are one test's curriculum, so they never both fit", () => {
    expect(stage({ test: BC_REPORT })).toBe("report_ready_bc");
    expect(stage({ test: { state: "report_ready", curriculum: "other" } })).toBe("report_ready_waitlist");
  });
  it("report_ready before no_test: a child with a report has a test", () => {
    expect(stage({ test: BC_REPORT })).not.toBe("no_test");
  });
  it("a new test during active does not change the stage", () => {
    expect(stage({ delivered: true, plan: "paying", test: { state: "running" } })).toBe("active");
  });
});

describe("the plan state", () => {
  it("unknown keeps a delivered child in active", () => {
    expect(stage({ delivered: true, plan: "unknown" })).toBe("active");
  });
  it.each(["not_started", "free_month", "paying", "payment_failed", "ending", "unknown"] satisfies ParentPlan["kind"][])(
    "%s with a delivered book is active: only ended ends a plan",
    (plan) => expect(stage({ delivered: true, plan })).toBe("active"),
  );
  it("unknown with a saved card and no delivery stays first_book_coming", () => {
    expect(stage({ cardSaved: true, plan: "unknown" })).toBe("first_book_coming");
  });
});

describe("BC or waitlist follows the report's own offer", () => {
  it.each(Object.keys(CURRICULA) as CurriculumId[])("%s", (curriculum) => {
    expect(stage({ test: { state: "report_ready", curriculum } })).toBe(curriculum === "BC" ? "report_ready_bc" : "report_ready_waitlist");
  });
  it("a test outside the listed provinces is scored with BC's tags and still waits: its report offers the waitlist", () => {
    expect(scoredAgainst("other")).toBe("BC");
    expect(stage({ test: { state: "report_ready", curriculum: "other" } })).toBe("report_ready_waitlist");
  });
});

describe("the server switches hide a tab, never lock it", () => {
  const active = { ...NONE, delivered: true, plan: "paying" } satisfies ChildStageFacts;
  const ended = { ...NONE, delivered: true, plan: "ended" } satisfies ChildStageFacts;
  const coming = { ...NONE, cardSaved: true } satisfies ChildStageFacts;

  it("with every switch off, active has Overview, Workbooks, Assessment and Account", () => {
    expect(childStage(active, ALL_OFF).tabs).toEqual(["overview", "workbooks", "assessment", "account"]);
  });
  it("Progress follows its switch in each stage that has it", () => {
    for (const facts of [active, ended, coming]) {
      expect(childStage(facts, { ...ALL_OFF, progress: true }).tabs).toContain("progress");
      expect(childStage(facts, ALL_OFF).tabs).not.toContain("progress");
    }
  });
  it("Maya follows its switch in active and ended, and never shows in first_book_coming", () => {
    expect(childStage(active, { ...ALL_OFF, maya: true }).tabs).toContain("maya");
    expect(childStage(ended, { ...ALL_OFF, maya: true }).tabs).toContain("maya");
    expect(childStage(coming, ALL_ON).tabs).not.toContain("maya");
  });
  it("Scan pages shows only in active", () => {
    expect(childStage(active, { ...ALL_OFF, scanPages: true }).tabs).toContain("scan_pages");
    expect(childStage(ended, ALL_ON).tabs).not.toContain("scan_pages");
    expect(childStage(coming, ALL_ON).tabs).not.toContain("scan_pages");
  });
  it("no switch adds a tab before the first book is coming", () => {
    expect(childStage(NONE, ALL_ON).tabs).toEqual(["assessment", "account"]);
  });
});
