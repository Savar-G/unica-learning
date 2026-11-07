import type { ParentPlan } from "@/lib/parent-plan";
import { statusFor, type CurriculumId } from "@/lib/signup";

// The child stage rule (spec #544, D-235). Pure: no database, network or clock. One child has one stage, which sets the
// dashboard's opening page and its tabs. The first match wins, in this order: ended, active, first_book_coming,
// test_running, report_ready_bc, report_ready_waitlist, no_test.

export type ChildStage = "ended" | "active" | "first_book_coming" | "test_running" | "report_ready_bc" | "report_ready_waitlist" | "no_test";

/** The dashboard's tabs, in the order they show. */
export type ChildTab = "overview" | "progress" | "workbooks" | "schedule" | "scan_pages" | "maya" | "assessment" | "account";

export type OpeningPage = "start_test" | "continue_or_wait" | "report_start_free_month" | "report_waitlist" | "overview";

/** Where the child's test stands. `running` is a test still open, or a finished test whose report is not ready. */
export type TestFact = { state: "none" } | { state: "running" } | { state: "report_ready"; curriculum: CurriculumId };

export interface ChildStageFacts {
  test: TestFact;
  cardSaved: boolean;
  /** A delivery of a workbook to the family is confirmed. */
  delivered: boolean;
  plan: ParentPlan["kind"];
}

/** The server switches. Off hides the tab: a tab is never locked. */
export interface TabSwitches {
  /** On after the skill map review (#194). */
  progress: boolean;
  /** On when the child can call Maya (#337). */
  maya: boolean;
  /** On when marking is live (#457). */
  scanPages: boolean;
}

export interface StageView {
  stage: ChildStage;
  opensOn: OpeningPage;
  tabs: ChildTab[];
  /** The plan ended: past work reads, and nothing new starts except a restart. */
  readOnly: boolean;
}

function stageOf({ test, cardSaved, delivered, plan }: ChildStageFacts): ChildStage {
  if (plan === "ended") return "ended";
  if (delivered) return "active";
  if (cardSaved) return "first_book_coming";
  if (test.state === "running") return "test_running";
  if (test.state === "none") return "no_test";
  // The same rule as the report's own offer (report.ts, callToAction). Not `scoredAgainst`, which is also BC for a test
  // outside the listed provinces: that family's report offers the waitlist, so it must not open on Start free month.
  return statusFor(test.curriculum) === "reserved" ? "report_ready_bc" : "report_ready_waitlist";
}

const OPENS_ON: Record<ChildStage, OpeningPage> = {
  ended: "overview",
  active: "overview",
  first_book_coming: "overview",
  test_running: "continue_or_wait",
  report_ready_bc: "report_start_free_month",
  report_ready_waitlist: "report_waitlist",
  no_test: "start_test",
};

function tabsOf(stage: ChildStage, on: TabSwitches): ChildTab[] {
  if (OPENS_ON[stage] !== "overview") return ["assessment", "account"];
  const delivered = stage !== "first_book_coming";
  return [
    "overview",
    ...(on.progress ? (["progress"] as const) : []),
    "workbooks",
    ...(stage === "active" && on.scanPages ? (["scan_pages"] as const) : []),
    ...(delivered && on.maya ? (["maya"] as const) : []),
    "assessment",
    "account",
  ];
}

export function childStage(facts: ChildStageFacts, switches: TabSwitches): StageView {
  const stage = stageOf(facts);
  return { stage, opensOn: OPENS_ON[stage], tabs: tabsOf(stage, switches), readOnly: stage === "ended" };
}
