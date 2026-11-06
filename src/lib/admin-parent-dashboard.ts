import { PLANS } from "@/lib/site";
import { childStage, type ChildStage, type ChildStageFacts } from "@/lib/child-stage";
import type { ParentPlan } from "@/lib/parent-plan";
import type { ChildView } from "@/lib/parent-view";

export const PARENT_EXPLORER_PATH = "/admin/dashboard";
export const SAMPLE_NOW = Date.parse("2026-11-05T20:00:00Z");

// Exhaustive records make a new product stage or plan a compile failure until this catalog covers it.
export const SAMPLE_STAGE_FACTS = {
  no_test: { test: { state: "none" }, cardSaved: false, delivered: false, plan: "unknown" },
  test_running: { test: { state: "running" }, cardSaved: false, delivered: false, plan: "unknown" },
  report_ready_bc: { test: { state: "report_ready", curriculum: "BC" }, cardSaved: false, delivered: false, plan: "not_started" },
  report_ready_waitlist: { test: { state: "report_ready", curriculum: "ON" }, cardSaved: false, delivered: false, plan: "unknown" },
  first_book_coming: { test: { state: "report_ready", curriculum: "BC" }, cardSaved: true, delivered: false, plan: "not_started" },
  active: { test: { state: "report_ready", curriculum: "BC" }, cardSaved: true, delivered: true, plan: "paying" },
  ended: { test: { state: "report_ready", curriculum: "BC" }, cardSaved: true, delivered: true, plan: "ended" },
} satisfies Record<ChildStage, ChildStageFacts>;

export const SAMPLE_PLANS = {
  not_started: { kind: "not_started" },
  free_month: { kind: "free_month", firstCharge: "2026-11-26T20:00:00Z", monthly: PLANS.one.price },
  paying: { kind: "paying", nextCharge: "2026-11-26T20:00:00Z", monthly: PLANS.one.price },
  payment_failed: { kind: "payment_failed" },
  paused: { kind: "paused", resumesOn: "2026-12-10T20:00:00Z", monthly: PLANS.one.price },
  ending: { kind: "ending", endsOn: "2026-11-26T20:00:00Z", free: false },
  ended: { kind: "ended", endedOn: "2026-10-26T20:00:00Z" },
  unknown: { kind: "unknown" },
} satisfies { [K in ParentPlan["kind"]]: Extract<ParentPlan, { kind: K }> };

type Scenario = { id: string; label: string; stage: ChildStage };
const scenario = (id: string, label: string, stage: ChildStage = "active"): Scenario => ({ id, label, stage });
export const PARENT_PREVIEW_VIEWS = [
  { id: "assessment", label: "Assessment / start", scenarios: [
    scenario("no_test", "No test", "no_test"), scenario("test_running", "Test in progress", "test_running"),
    scenario("finish", "All answers saved", "test_running"), scenario("expired", "Expired test", "no_test"),
    scenario("report_pending", "Report being prepared", "test_running"), scenario("wait", "Next test not open", "active"),
  ] },
  { id: "report", label: "Assessment report / offer", scenarios: [
    scenario("choose", "BC: start free month", "report_ready_bc"), scenario("checking", "BC: checking card", "report_ready_bc"),
    scenario("unknown", "BC: card check unavailable", "report_ready_bc"), scenario("error", "BC: payment page failed", "report_ready_bc"),
    scenario("busy_card", "BC: opening card page", "report_ready_bc"),
    scenario("cancelled", "BC: card not saved", "report_ready_bc"), scenario("later", "BC: card link by email", "report_ready_bc"),
    scenario("saved", "BC: card saved before reload", "report_ready_bc"), scenario("waitlist", "Other curriculum: join waitlist", "report_ready_waitlist"),
    scenario("busy_waitlist", "Other curriculum: joining", "report_ready_waitlist"),
    scenario("joined", "Other curriculum: joined", "report_ready_waitlist"), scenario("waitlist_error", "Waitlist unavailable", "report_ready_waitlist"),
    scenario("unreliable", "Result needs a new test", "active"), scenario("ended", "Past report after plan ended", "ended"),
  ] },
  { id: "overview", label: "Overview", scenarios: [
    scenario("active", "Active child"), scenario("first_book_coming", "First workbook not sent", "first_book_coming"),
    scenario("ended", "Plan ended", "ended"), scenario("early", "Early result"), scenario("unreliable", "Unreliable result"),
    scenario("preparing", "New result being prepared"), scenario("late", "New result delayed"),
    scenario("empty", "No result or scanned days", "first_book_coming"), scenario("payment_failed", "Payment failed"),
    scenario("no_pin", "PIN needed"), scenario("learning_card_empty", "Learning card needed"),
  ] },
  { id: "workbooks", label: "Workbooks", scenarios: [
    scenario("delivered", "Current and past books"), scenario("mail", "In the mail"), scenario("hand", "Delivery by hand"),
    scenario("first_book_coming", "First workbook not sent", "first_book_coming"), scenario("late", "Later than estimate"),
    scenario("paused", "Pause moves next mailing"), scenario("ended", "Past books only", "ended"),
  ] },
  { id: "progress", label: "Progress / skill panel", scenarios: [
    scenario("map", "Skill map"), scenario("panel", "Selected skill"), scenario("empty", "No test report", "first_book_coming"),
    scenario("unreliable", "Unreliable result"), scenario("ended", "Past skills", "ended"),
  ] },
  { id: "maya", label: "Maya notes", scenarios: [
    scenario("notes", "Call and chat notes"), scenario("empty", "No notes"), scenario("used", "Weekly minutes used"),
    scenario("session", "Call transcript"), scenario("chat", "Chat transcript"), scenario("missing", "Transcript unavailable"),
    scenario("ended", "Past notes", "ended"),
  ] },
  { id: "account", label: "Account", scenarios: [
    scenario("loaded", "Plans, invoices and settings"), scenario("empty", "No plans or invoices", "no_test"),
    scenario("loading", "Billing loading"), scenario("unavailable", "Billing unavailable"), scenario("invoices_unavailable", "Invoices unavailable"),
    scenario("updated", "Card updated"), scenario("unchanged", "Card unchanged"), scenario("unconfirmed", "Card not confirmed"), scenario("failed", "Card update failed"),
  ] },
  { id: "plan", label: "Plan / Pause / Restart", scenarios: [
    ...Object.keys(SAMPLE_PLANS).map(id => scenario(id, id.replaceAll("_", " "), id === "ended" ? "ended" : "active")),
    scenario("none", "No saved card", "no_test"), scenario("unavailable", "Plan unavailable"),
    scenario("pause", "Pause: choose weeks"), scenario("pause_review", "Pause: review dates"), scenario("pause_late", "Pause: next workbook already in preparation"),
    scenario("pause_pending", "Pause: confirmation pending"), scenario("restart", "Restart: review price", "ended"),
    scenario("restart_review", "Restart: confirm paid price", "ended"), scenario("restart_declined", "Restart: payment declined", "ended"),
    scenario("restart_pending", "Restart: confirmation pending", "ended"),
    scenario("pause_saved", "Pause: saved before reload"), scenario("restart_started", "Restart: confirmed before reload", "ended"),
    scenario("cancel_review", "Cancel: confirmation"), scenario("cancel_pending", "Cancel: confirmation pending"),
  ] },
  { id: "scan", label: "Scan pages", scenarios: [
    scenario("empty", "No photos"), scenario("loading", "Loading photos"), scenario("unavailable", "Photos unavailable"),
    scenario("ready", "Ready to send"), scenario("sent", "Sent for marking"), scenario("refused", "Needs another photo"),
  ] },
  { id: "scan_results", label: "Scan results", scenarios: [
    scenario("scored", "Scored answers"), scenario("uncertain", "Please check the answer"), scenario("unscored", "Not scored"),
    scenario("expired", "Photo no longer available"), scenario("budget", "Checking limit reached"), scenario("pending", "Waiting to be checked"),
  ] },
] as const;

export type PreviewView = typeof PARENT_PREVIEW_VIEWS[number]["id"];
export const PREVIEW_SIZES = { desktop: { label: "Desktop", width: 1280, height: 900 }, tablet: { label: "Tablet", width: 820, height: 1000 }, phone: { label: "Phone", width: 390, height: 844 } } as const;
export const PREVIEW_FAMILIES = { one: "One child", two: "Two children", long: "Long first name", none: "No children" } as const;
export interface PreviewSelection { view: PreviewView; scenario: string; size: keyof typeof PREVIEW_SIZES; family: keyof typeof PREVIEW_FAMILIES; child: "first" | "second" }
export type PreviewQuery = Record<string, string | string[] | undefined>;
export function previewSelection(raw: PreviewQuery): PreviewSelection {
  const view = PARENT_PREVIEW_VIEWS.find(v => v.id === raw.view) ?? PARENT_PREVIEW_VIEWS[0];
  return {
    view: view.id, scenario: view.scenarios.find(s => s.id === raw.scenario)?.id ?? view.scenarios[0].id,
    size: typeof raw.size === "string" && Object.hasOwn(PREVIEW_SIZES, raw.size) ? raw.size as PreviewSelection["size"] : "desktop",
    family: typeof raw.family === "string" && Object.hasOwn(PREVIEW_FAMILIES, raw.family) ? raw.family as PreviewSelection["family"] : "one",
    child: raw.family === "two" && raw.child === "second" ? "second" : "first",
  };
}
export function previewUrl(selection: PreviewSelection): string {
  return `${PARENT_EXPLORER_PATH}?${new URLSearchParams({ ...selection })}`;
}
export function selectedScenario(selection: PreviewSelection): Scenario {
  return PARENT_PREVIEW_VIEWS.find(v => v.id === selection.view)!.scenarios.find(s => s.id === selection.scenario)!;
}
export function sampleChildren(selection: PreviewSelection): ChildView[] {
  if (selection.family === "none") return [];
  const make = (id: string, firstName: string): ChildView => {
    const stage = selectedScenario(selection).stage;
    return { id, firstName, schoolGrade: 3, ...childStage(SAMPLE_STAGE_FACTS[stage], { progress: true, maya: true, scanPages: true }),
      currentWorkbook: stage === "active" || stage === "ended" ? { number: 3 } : null,
      reportIds: SAMPLE_STAGE_FACTS[stage].test.state === "report_ready" ? ["sample-report"] : [],
      finishedTests: SAMPLE_STAGE_FACTS[stage].test.state === "report_ready" ? [{ reportId: "sample-report", finishedAt: SAMPLE_NOW - 86400000 }] : [],
    };
  };
  return [make("sample-child-1", selection.family === "long" ? "Alexandria Rose Montgomery" : "Leah"), ...(selection.family === "two" ? [make("sample-child-2", "Kai")] : [])];
}
