"use client";

import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { FeedbackFormView } from "@/components/feedback-form";
import { AdminFrame } from "@/components/admin";
import { AdminFeedbackList } from "@/components/admin-feedback";
import { FEEDBACK_MESSAGES, type FeedbackError } from "@/lib/feedback";
import { ParentShell } from "@/components/parent-shell";
import { ParentTestStart, ParentReport } from "@/components/parent-assessment";
import { ParentOverview } from "@/components/parent-overview";
import { ParentWorkbookAnswerKey } from "@/components/parent-workbook-answers";
import { workbookAnswerPages, type ParentWorkbookAnswers } from "@/lib/parent-workbook-answers";
import { sampleWorkbook } from "@/lib/workbook-sample";
import { storedQuestion } from "@/lib/workbook-content";
import { ParentWorkbooks } from "@/components/parent-workbooks";
import { ScanHistoryView, type HistoryListing, type HistoryState } from "@/components/scan-history";
import { HISTORY_LABELS, type HistoryStatus } from "@/lib/scan-history";
import { ParentSchedule } from "@/components/parent-schedule";
import { ParentProgress } from "@/components/parent-progress";
import { SkillPanel } from "@/components/parent-skill-map";
import { NoteCard, ParentSessionView } from "@/components/parent-maya-notes";
import { MayaChatRow } from "@/components/parent-home-rows";
import { AccountBilling } from "@/components/account-billing";
import { ChildDetailsView } from "@/components/account-child-details";
import { ParentAccountSettings } from "@/components/parent-account-settings";
import { ParentPlanView } from "@/components/parent-plan-view";
import { CancelPlanView, PlanControlView, type PlanControlViewProps } from "@/components/account-plan";
import { ReportNextView, type CardState } from "@/components/report-next";
import { ScanPages, type ScanListing } from "@/components/scan-pages";
import { ScanProblemExplanationView, type ExplanationState } from "@/components/scan-problem-explanation";
import { ScanMarkingResults } from "@/components/scan-marking-results";
import { SupportPage } from "@/components/support-page";
import type { StartState } from "@/lib/assessment";
import { SAMPLE_NOW, SAMPLE_PLANS, sampleChildren, type PreviewSelection } from "@/lib/admin-parent-dashboard";
import { parentPreviewDocument, type PreviewStyles } from "@/lib/admin-parent-preview-document";
import type { FamilyBilling } from "@/lib/billing";
import { familyZone, startWhen } from "@/lib/family-time";
import type { LearningRow } from "@/lib/learning-style";
import type { ParentNoteSession } from "@/lib/parent-maya-notes";
import type { ParentPlan } from "@/lib/parent-plan";
import type { ChildView, OverviewView, WorkbooksView } from "@/lib/parent-view";
import { freeMonthWords } from "@/lib/parent-assessment";
import { tabLinks } from "@/lib/parent-shell";
import { nextStep } from "@/lib/report-view";
import { PLANS } from "@/lib/site";
import { sampleReportView } from "@/lib/sample-children";
import { skillMapView } from "@/lib/skill-map-view";
import "@/ds/styles/base.css";
import "@/ds/styles/warm.css";
import "@/ds/styles/support.css";
import "./parent-progress.css";

const zone = familyZone({ timeZone: "America/Vancouver" });
const noAction = () => { throw new Error("Static preview cannot run an action"); };
// Next hooks need a router context during static rendering. Every method fails closed. No router is attached to the HTML.
const staticRouter: AppRouterInstance = { bfcacheId: "static-parent-preview", back: noAction, forward: noAction, refresh: noAction, push: noAction, replace: noAction, prefetch: noAction };
const learning: LearningRow = { learning_styles: null, interests: null, learning_note: null, math_feeling: null, learning_goal: null, weekly_time: null };
const alerts = { password: false, pin: false, deskError: false, existing: false };
const chatUsage = { used: 12, left: 48, backAt: "12:00 a.m. on Friday, November 6", resetsAt: Date.parse("2026-11-06T07:00:00Z") };
let report: ReturnType<typeof sampleReportView> | undefined;
const baseReport = () => report ??= sampleReportView();

function sampleNote(child: ChildView, chat = false, missing = false): ParentNoteSession {
  return {
    child_id: child.id, call_id: "sample-session", channel: chat ? "chat" : "call", startedAt: "2026-11-04T19:00:00Z", call_ended_at: "2026-11-04T19:05:00Z",
    facts: { question: { source: "workbook", page: 4, number: 2, text: "24 + 18 = ?" }, finished: "with_help", reason: "solved", help: "hint", stuckOn: "adding the ones", paper: "child_confirmed", minutes: 5, safety: false },
    sentences: ["{child} worked on page 4, question 2.", "{child} finished with a hint about adding the ones."], warm: null,
    transcript: missing ? [] : [{ speaker: "child", text: "I need help with the ones.", second: 4 }, { speaker: "maya", text: "Add the ones first. What do you get?", second: 7 }],
  };
}

function overview(child: ChildView, state: string): OverviewView {
  const preparing = state === "preparing" || state === "late";
  const empty = preparing || state === "empty" || state === "first_book_coming";
  return { child, level: empty ? null : { working: 2, earlySign: state === "early", testedOn: "2026-10-22", unreliable: state === "unreliable" },
    areas: empty || state === "unreliable" ? [] : [
      { area: "number", name: "Number", level: 2, label: "building-up", earlySign: state === "early" },
      { area: "fractions", name: "Fractions", level: 3, label: "at-grade", earlySign: false },
      { area: "shapes", name: "Shapes and measurement", level: 4, label: "ahead", earlySign: false },
    ], resultPreparing: preparing, resultLate: state === "late", workbook: child.currentWorkbook ? { number: 3, scannedDays: 4, days: 10 } : null,
    action: state === "payment_failed" || state === "no_pin" || state === "learning_card_empty" ? state : null, summaryMonth: child.stage === "active" || child.stage === "ended" ? "2026-10" : null };
}

function workbooks(child: ChildView, state: string): WorkbooksView {
  const mailed = state === "mail" || state === "hand";
  return { child, current: state === "first_book_coming" ? null : { id: "sample-book", number: 3, shippedOn: "2026-10-28", deliveredOn: mailed ? null : "2026-11-01", delivery: state === "hand" ? { method: "hand" } : { method: "mail", carrier: "Canada Post", trackingNumber: "SAMPLE 000 000", trackingUrl: "https://example.invalid/track" } },
    next: child.readOnly || state === "first_book_coming" ? { kind: "none" } : state === "late" ? { kind: "past_estimate" } : { kind: "range", earliest: state === "paused" ? "2026-12-10" : "2026-11-26", latest: state === "paused" ? "2026-12-15" : "2026-12-01" },
    books: state === "first_book_coming" ? [] : [3, 2, 1].map(number => ({ id: `sample-book-${number}`, number, shippedOn: "2026-10-28", deliveredOn: number === 3 && mailed ? null : "2026-11-01" })) };
}

/** Inert canonical history for the selected child's current book. More pages keeps past books behind this book. */
function workbookHistory(child: ChildView, state: string) {
  const status: HistoryState = state === "history_loading" ? "loading" : state === "history_error" ? "failed" : state === "history_unavailable" ? "unavailable" : "ready";
  const states: HistoryStatus[] = state === "history_empty" || state === "first_book_coming" ? []
    : state === "history_review" ? ["review"] : state === "history_pending" ? ["pending"] : state === "history_failed" ? ["failed"]
      : state === "history_expired" || state === "history_missing_photo" ? ["ready"] : ["ready", "review", "pending", "failed", "blank", "unscored", "never-scanned"];
  const pages: HistoryListing["pages"] = states.map((pageStatus, index) => ({
    id: `${child.id}-page-${index}`, childId: child.id, childName: child.firstName, workbookId: "sample-book-3",
    book: 3, revision: "synthetic-frozen", day: child.id === "sample-child-2" ? "Day 2" : "Day 1", pageNumber: index + 4,
    status: pageStatus, label: HISTORY_LABELS[pageStatus], photo: pageStatus === "never-scanned" || state === "history_missing_photo" ? null : `${child.id}-photo-${index}`,
    photoAvailable: state !== "history_expired", failedJob: pageStatus === "failed",
    counts: { scored: pageStatus === "ready" ? 3 : pageStatus === "blank" ? 1 : 0, unscored: pageStatus === "unscored" ? 1 : 0, parentChecks: pageStatus === "review" ? 1 : 0, pending: pageStatus === "pending" ? 1 : 0 },
    right: pageStatus === "ready" ? 2 : 0, wrong: pageStatus === "ready" ? 1 : 0, blank: pageStatus === "blank" ? 1 : 0,
  }));
  const listing = { pages, counts: Object.fromEntries(states.map(value => [value, pages.filter(page => page.status === value).length])), after: null };
  return <ScanHistoryView state={status} listing={listing} workbookScoped={state !== "first_book_coming"}
    hasMore={status === "ready" && state !== "first_book_coming"} />;
}

function answerKey(child: ChildView, state: string): ParentWorkbookAnswers {
  const draft = sampleWorkbook({ workbookId: "sample-book", childId: child.id, parentId: "sample-parent", qrTokens: ["sample-page-token-0001", "sample-page-token-0002", "sample-page-token-0003"] });
  const pages = workbookAnswerPages({ id: draft.id, pages: draft.pages.map(page => ({ ...page, printContract: null,
    questions: page.questions.map(q => storedQuestion({ number: q.number, box: q.box, schemaVersion: 2, package: q.package }, { source: "workbook", workbookId: draft.id, page: page.number, question: q.number })) })) }) ?? [];
  if (state === "empty") return { childId: child.id, childName: child.firstName, workbookId: draft.id, number: 1, pages: [] };
  if (state === "mixed" && pages[0]) pages[0].questions = [
    { number: 1, kind: "fixed", answers: [{ part: 1, value: "+", alternatives: [] }, { part: 2, value: "425", alternatives: [] }], hasOpenWork: true },
    { number: 2, kind: "example", answers: [{ part: 1, value: "3", alternatives: [] }, { part: 2, value: "9", alternatives: [] }], hasOpenWork: false },
    { number: 3, kind: "open", answers: [], hasOpenWork: true },
    { number: 4, kind: "unavailable", answers: [], hasOpenWork: false },
  ];
  return { childId: child.id, childName: child.firstName, workbookId: draft.id, number: 1, pages };
}

function billing(kids: ChildView[], state: string): FamilyBilling {
  if (state === "unavailable") return { state: "unavailable" };
  return { state: "loaded", plans: state === "empty" ? [] : kids.map(child => ({ childId: child.id, firstName: child.firstName, cardId: `sample-card-${child.id}`, plan: SAMPLE_PLANS.paying })),
    invoices: state === "invoices_unavailable" ? { state: "unavailable" } : { state: "loaded", invoices: state === "empty" ? [] : kids.flatMap(child => (["paid", "no_charge", "due"] as const).map((status, i) => ({ id: `sample-invoice-${child.id}-${i}`, childId: child.id, childName: child.firstName, at: "2026-11-01T20:00:00Z", cents: i === 1 ? 0 : 9900, currency: "cad", status, receiptUrl: "https://example.invalid/receipt" }))) } };
}

function planControl(name: string, state: string, cardId: string) {
  const restart = state.startsWith("restart");
  const pending = state.endsWith("pending");
  const preview = state === "pause_review" || state === "pause_late";
  const props: PlanControlViewProps = { name, mode: restart ? "restart" : "pause", pending, open: true, busy: false, weeks: 2,
    preview: preview ? { token: "sample-token", weeks: 2, remaining: 6, year: 2026, late: state === "pause_late", targetNumber: 5, charge: "December 10, 2026", earliest: state === "pause_late" ? null : "December 10", latest: state === "pause_late" ? null : "December 15" } : null,
    restart: state === "restart_review" ? { price: PLANS.one.price, token: "sample-token" } : null,
    error: pending ? "We cannot confirm this change yet. Check again before you make another change or delete the account." : state === "restart_declined" ? "Your payment did not go through. Please update your card. Then return here to restart the plan." : null,
    done: state === "pause_saved" || state === "restart_started", onOpen: noAction, setWeeks: noAction, setPreview: noAction, send: noAction, close: noAction, cardId };
  return <PlanControlView {...props} />;
}

function scanListing(state: string): ScanListing | null {
  if (state === "loading" || state === "unavailable") return null;
  return { checks: true, marking: true, pages: [{ id: "sample-page", workbookId: "sample-book", book: 3, pageNumber: 4, day: "Day 1", pageOfDay: 1, pagesInDay: 2 }],
    photos: state === "empty" ? [] : [{ id: "sample-photo", pageId: "sample-page", workbookId: "sample-book", book: 3, pageNumber: 4, state: "saved", check: state === "refused" ? "refused" : "ready", reason: state === "refused" ? "marks-missing" : null, sentAt: state === "sent" ? "2026-11-05T20:00:00Z" : null, createdAt: "2026-11-05T19:00:00Z" }] };
}

function scanResult(state: string): Parameters<typeof ScanMarkingResults>[0]["result"] {
  const pending = state === "pending" || state === "budget";
  const uncertain = state === "uncertain";
  const unscored = state === "unscored";
  return { photoAvailable: state !== "expired", budgetHeld: state === "budget", solutionsAvailable: !pending && !uncertain && !unscored,
    completion: { total: pending ? 0 : 1, status: pending ? "no-items" : uncertain ? "incomplete" : "complete", finished: pending || uncertain ? 0 : 1, items: pending ? [] : [{ itemId: "sample-question", number: 1, progress: uncertain ? "pending" : "finished" }] },
    counts: { scored: pending || uncertain || unscored ? 0 : 1, unscored: unscored ? 1 : 0, parentChecks: 0, pending: pending || uncertain ? 1 : 0 },
    items: pending ? [] : [{ number: 1, itemId: "sample-question", version: 1, state: uncertain ? "pending" : unscored ? "unscored" : "scored", result: uncertain || unscored ? null : state.startsWith("explain_") ? "wrong" : "right", readAnswerText: uncertain ? "4?" : state.startsWith("explain_") ? "41" : "42",
      canChange: !unscored, actor: "system", at: "2026-11-05T20:00:00Z", evidencePhoto: "sample-photo", photoAvailable: state !== "expired",
      label: uncertain ? "Please check this answer" : unscored ? "Not scored" : state.startsWith("explain_") ? "Wrong" : "Right" }] };
}

function previewContent(selection: PreviewSelection, child: ChildView | undefined, kids: ChildView[]) {
  const state = selection.scenario;
  if (!child && selection.view === "account") return <ParentAccountSettings card={state} hasCard={false} province="BC" billing={<AccountBilling billing={billing([], "empty")} zone={zone} />} details={null} />;
  if (!child && selection.view === "plan") return <ParentPlanView plans={[]} zone={zone} controls />;
  if (!child && selection.view === "scan") return <SupportPage label="Your account" title="Scan pages"><ScanPages childrenList={[]} parent="sample-parent" noticeAcknowledged initial={{ listing: scanListing("empty") }} /></SupportPage>;
  if (selection.view === "feedback") {
    if (state === "admin_rows") return <AdminFrame email="admin@example.invalid" section="feedback" title="Feedback"><AdminFeedbackList product={null} rows={[
      { id: "sample-1", parent_id: "sample-parent-1", child_id: null, product: "workbook", text: "The space for the written answer was helpful.\nCould you add more room for working?", source: "/account/workbooks", created_at: "2026-11-05T19:00:00Z", status: "new" },
      { id: "sample-2", parent_id: "sample-parent-2", child_id: null, product: "parent_dashboard", text: "I found the report quickly on my phone.", source: "/account", created_at: "2026-11-05T18:00:00Z", status: "read" },
    ]} /></AdminFrame>;
    const error = Object.hasOwn(FEEDBACK_MESSAGES, state) ? state as FeedbackError : null;
    return <SupportPage label="Your account" title="Feedback"><p className="lead">Tell us what worked well or what we can improve.</p>
      <FeedbackFormView product={state === "form" || state === "no_product" || state.startsWith("stage_") ? "" : "workbook"} text={state === "too_long" ? "Thank you for the workbook. ".repeat(193) : state === "unavailable" || state === "no_product" ? "Could you add more room for working?" : ""}
        busy={false} result={state === "sent" ? { ok: true } : error ? { ok: false, error } : null} />
    </SupportPage>;
  }
  if (!child) return <SupportPage label="Your account" title="Your account"><p className="lead">Add a child on the <a href="/account/settings">Account</a> page to start.</p></SupportPage>;
  switch (selection.view) {
    case "assessment": {
      const start: StartState = state === "test_running" ? { kind: "resume", attemptId: "sample-test", resumeUntil: SAMPLE_NOW + 3600000 }
        : state === "finish" ? { kind: "finish", attemptId: "sample-test" } : state === "expired" ? { kind: "expired", attemptId: "sample-test" }
          : state === "report_pending" || state === "wait" ? { kind: "wait", completedAt: SAMPLE_NOW - 86400000, opensAt: SAMPLE_NOW + 29 * 86400000 } : { kind: "start", retake: false };
      return <ParentTestStart childId={child.id} name={child.firstName} state={start} when={startWhen(start, zone)} report={state === "wait" ? "/account/report/sample-report" : undefined} phone={selection.size === "phone"} sent={false} parentEmail="parent@example.invalid" alerts={alerts} learning={null} />;
    }
    case "report": {
      const base = baseReport();
      const view = { ...base, id: "sample-report", childName: child.firstName, province: child.stage === "report_ready_waitlist" ? "ON" as const : "BC" as const,
        completedAt: "2026-11-04T20:00:00Z", timeZone: zone, findings: child.stage === "report_ready_waitlist" ? null : base.findings, model: { ...base.model, ...(state === "unreliable" ? { reliability: { veryFast: 18, answers: 20 } } : {}), callToAction: child.stage === "report_ready_waitlist" ? "waitlist" as const : "card" as const } };
      const start = { saved: state === "saved" ? "one" as const : null, joined: state === "joined", cancelled: state === "cancelled" };
      const card: CardState = ["checking", "unknown", "error", "later", "saved"].includes(state) ? state as CardState : "choose";
      const next = { src: "account" as const, asked: false, start };
      return <ParentReport view={view} child={child} next={next} newTest={state === "unreliable" ? { state: { kind: "open" }, href: `/account/start/${child.id}`, label: "Start a new test" } : null} learning={null} alerts={alerts} tracked={false} src="account"
        nextActions={<ReportNextView reportId={view.id} step={nextStep(view)} words={view.model.callToAction === "card" ? freeMonthWords(child.firstName) : undefined} childName={child.firstName} province={view.province} {...next} card={card} wait={state === "joined" ? "joined" : state === "waitlist_error" ? "error" : "join"} busy={state === "busy_card" ? "one" : state === "busy_waitlist" ? "waitlist" : null} announce="" savedPlan={start.saved} choose={noAction} join={noAction} checkAgain={noAction} pinned />} />;
    }
    case "overview": return <SupportPage label="Overview" title={child.firstName}><ParentOverview overview={overview(child, state)} /></SupportPage>;
    case "workbook_answers": return <ParentWorkbookAnswerKey answerKey={answerKey(child, state)} />;
    case "workbooks": return <ParentWorkbooks {...workbooks(child, state)} history={workbookHistory(child, state)} />;
    case "schedule": return <ParentSchedule schedule={state === "waiting" || state === "unavailable" ? { kind: state, child: { ...child, parentId: "sample-parent" } } : {
      kind: "ready", child: { ...child, parentId: "sample-parent" }, book: { id: "sample-printed-book", number: child.id === "sample-child-2" ? 2 : 1 }, dailyTime: "about 20 minutes, plus Extra if there's time",
      rows: Array.from({ length: 10 }, (_, i) => ({ day: i + 1, topic: child.id === "sample-child-2" ? "Multiplication" : "Addition", second: i === 6 ? "Level check" : "Number practice",
        pages: [3 + i * 8, 10 + i * 8], requiredMinutes: 20, extra: true,
        scan: state === "accepted" || state === "expired" ? { kind: "known", accepted: 8, required: 8 } : state === "partial" && i === 0 ? { kind: "known", accepted: 3, required: 8 } : { kind: "unknown" },
      })),
    }} />;
    case "progress": {
      const areas = state === "empty" ? [] : skillMapView({ firstName: child.firstName, schoolGrade: child.schoolGrade, workingLevel: 2, tests: [{ standard: "2.1", correct: 4, total: 4, unreliable: false, at: "2026-11-04T20:00:00Z" }, { standard: "2.3", correct: 0, total: 4, unreliable: false, at: "2026-11-04T20:00:00Z" }], workbookStandards: ["2.1", "2.2"], workbookNumber: 3, day: at => at.slice(0, 10) });
      return <ParentProgress child={child} level={state === "empty" ? null : { working: 2, earlySign: false, testedOn: "2026-11-04", unreliable: state === "unreliable" }} workbookNumber={3} areas={areas}
        panel={state === "panel" && areas[0]?.tiles[0] ? <dialog open className="pp-panel" aria-labelledby="pp-panel-title"><SkillPanel tile={areas[0].tiles[0]} onClose={noAction} /></dialog> : undefined} />;
    }
    case "maya": {
      const note = sampleNote(child, state === "chat", state === "missing");
      if (["session", "chat", "missing"].includes(state)) return <ParentSessionView note={note} name={child.firstName} zone={zone} back={{ href: `/account/notes/${child.id}`, label: "← Back to Maya" }} />;
      return <SupportPage label="Maya" title={child.firstName}>{child.stage !== "ended" && state !== "closed" && <div className="maya-tab-week"><MayaChatRow name={child.firstName} chat={state === "used" ? { ...chatUsage, used: 60, left: 0 } : chatUsage} /></div>}<h2 className="maya-tab-notes">Notes from Maya</h2>
        {state === "empty" ? <p>There are no notes from Maya yet.</p> : <ul className="maya-notes-list">{[note, sampleNote(child, true)].map(n => <li key={n.channel}><NoteCard note={n} name={child.firstName} zone={zone} /></li>)}</ul>}</SupportPage>;
    }
    case "account": return <ParentAccountSettings card={state} hasCard={state !== "empty"} province="BC" billing={state === "loading" ? <p role="status">Loading billing...</p> : <AccountBilling billing={billing(kids, state)} zone={zone} />} details={<ChildDetailsView kids={kids.map(k => ({ id: k.id, first_name: k.firstName, grade: k.schoolGrade, ...learning }))} />} />;
    case "plan": {
      const control = state.startsWith("pause") && state !== "paused" || state.startsWith("restart");
      const plan: ParentPlan = Object.hasOwn(SAMPLE_PLANS, state) ? SAMPLE_PLANS[state as keyof typeof SAMPLE_PLANS] : state.startsWith("restart") ? SAMPLE_PLANS.ended : SAMPLE_PLANS.paying;
      return <ParentPlanView zone={zone} controls plans={state === "unavailable" ? null : state === "none" ? [] : kids.map(k => ({ cardId: `sample-card-${k.id}`, childName: k.firstName, plan }))} control={control ? row => planControl(row.childName, state, row.cardId) : undefined}
        cancellation={state.startsWith("cancel_") ? row => <CancelPlanView name={row.childName} consequence="The plan ends on November 26, 2026. We will not charge your card again." asking busy={false} failed={state === "cancel_pending"} cancel={noAction} keep={noAction} ask={noAction} /> : undefined} />;
    }
    case "scan": return <SupportPage label="Your account" title="Scan pages"><ScanPages childrenList={[child, ...kids.filter(k => k.id !== child.id)].map(k => ({ id: k.id, first_name: k.firstName }))} parent="sample-parent" noticeAcknowledged mode={selection.size === "desktop" ? "desktop" : "phone"} initial={{ listing: scanListing(state), loadFailed: state === "unavailable" }} /></SupportPage>;
    case "scan_results": return <SupportPage label="Your account" title="Page results"><div className="scan-pages"><a href="/account/scan">Back to Scan pages</a><ScanMarkingResults result={scanResult(state)} showHeading={false} itemExplanation={state.startsWith("explain_") ? item => <ScanProblemExplanationView number={item.number} state={state.slice(8) as ExplanationState} result={state === "explain_ready" ? { status: "ready", context: "synthetic", correctAnswer: "42", explanation: { steps: ["Add the ones: 4 plus 8 is 12. Write 2 and carry 1 ten.", "Add the tens and the carried ten: 2 plus 1 plus 1 is 4."], say: "Let us add one column at a time." } } : undefined} /> : undefined} /></div></SupportPage>;
  }
}

/** Render the actual parent components as HTML, with no mounted tree, event handlers, or effect lifecycle. */
export function renderParentPreview(selection: PreviewSelection, styles: PreviewStyles): string {
  const kids = sampleChildren(selection);
  const child = kids[selection.child === "second" ? 1 : 0];
  const tab = selection.view === "report" ? "assessment" : selection.view === "scan" || selection.view === "scan_results" ? "scan_pages" : selection.view === "plan" ? "account" : selection.view === "workbook_answers" ? "workbooks" : selection.view;
  const pathname = tabLinks(child).find(l => l.tab === tab)?.href.split("?")[0] ?? "/account/settings";
  const content = previewContent(selection, child, kids);
  const isAdminFeedback = selection.view === "feedback" && selection.scenario === "admin_rows";
  const markup = renderToStaticMarkup(<AppRouterContext.Provider value={staticRouter}><PathnameContext.Provider value={pathname}><SearchParamsContext.Provider value={new URLSearchParams(child ? { child: child.id } : {})}>
    {isAdminFeedback ? content : <ParentShell kids={kids} remembered={child?.id ?? null} pinSet={selection.scenario !== "no_pin"} timeZoneSaved>{content}</ParentShell>}
  </SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>);
  return parentPreviewDocument(markup, styles);
}
