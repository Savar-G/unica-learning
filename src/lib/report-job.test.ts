import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportCard } from "@/components/report";
import {
  BANKS,
  BC_SKILL_MAP,
  createSession,
  MISCONCEPTIONS,
  PROFILE_AI_SCHEMA,
  PROFILE_SCHEMA_VERSION,
  REPORT_TEXT_NAME,
  storedProfile,
  storedTest,
  type ComparisonTest,
  type LearnerProfile,
  type MisconceptionId,
  type ProfileLearning,
} from "@/lib/assessment";
import type { AiClient, AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { memoryTransport } from "@/lib/email-delivery-memory";
import { rebuildLatestProfile, rebuildLearnerProfile } from "@/lib/learner-profile";
import { memoryLearnerProfileStore } from "@/lib/learner-profile-memory";
import { runReportJob } from "@/lib/report-job";
import { memoryReportJobStore } from "@/lib/report-job-memory";
import { loadReportView, type ComparisonRead } from "@/lib/report-loading";
import { leftOutLine, reliabilityNote } from "@/lib/report-view";
import { countRead, memoryReportReaders, type MemoryReportTables } from "@/lib/report-loading-memory";
import { memoryReportLedger } from "@/lib/report-row-ledger-memory";
import type { ReportLedger } from "@/lib/report-row-ledger";
import type { WorkReviewer } from "@/lib/work-review";
import { fakeReviewer } from "@/lib/work-review-fake";

// The report job (#65), through its public interface, on in-memory adapters only (#162): the report-loading module's
// reader with the secret key's access (src/lib/report-loading-memory.ts), the job's own store (the report insert, the
// stored AI reviews, the parent's contact details, the unsubscribe check; src/lib/report-job-memory.ts) over the same
// tables and with the same read counter, a comparison read that returns a cohort, and the AI step's fake reviewer. The
// emails go through the delivery module (#151) with the in-memory transport and the in-memory report row ledger, which
// keeps the report row's claim rules. The comparison read and the ledger count their reads in the same counter too. The
// learner profile (#196) goes to the in-memory profile store (src/lib/learner-profile-memory.ts), which reads the
// parent's answers on the learning card and counts its reads in the same counter. The network is a stub that records
// any request, so a test sees any call to Supabase or Resend.
vi.mock("server-only", () => ({}));

const ORIGIN = "https://unica.test";
const TEST = "test-1";

// Asha, grade 4 in BC, child of Priya, works at grade 4: every grade 4 question right, every grade 5 question wrong,
// 20 seconds each. 42 questions (18 above her school grade), 14 minutes. She showed work on her first two
// show-your-work questions: one drawn, one typed. She had "Read it to me" read the first question twice, and left the
// tab once, for 4 seconds, on the second (#184).
const { asked, placement } = takeTest({ grade: 4, province: "BC" }, 101, knowsUpTo(4));
const [DRAWN, TYPED] = asked.flatMap((q, n) => (q.showWork ? [n] : []));
const DRAWING = `parent-1/${TEST}/${asked[DRAWN].id}-x.png`;
const PRIYA = { name: "Priya Shah", email: "priya@family.ca" };

// 400 completed grade 4 tests with the same result, Asha's among them: she is at the 50th percentile.
const cohort: ComparisonTest[] = [
  { id: TEST, childId: "child-1", status: "completed", completedAt: "2026-10-10T12:00:00Z", email: PRIYA.email, placement },
  ...Array.from({ length: 399 }, (_, i) => ({
    id: `other-${i}`, childId: `private-child-${i}`, status: "completed", completedAt: "2026-10-10T12:00:00Z", email: "private-parent@family.ca", placement,
  })),
];

/**
 * The database in memory, with Asha's finished test. `unsubscribed`: Priya has unsubscribed. `parent`: null when the
 * parent row is missing. `child`: false when Asha's child row is missing. `helped`: Asha said someone helped, so the
 * report warns that the level may be too high. `learning`: Priya's answers on the "Tell us how Asha learns" card
 * (#126, #195). `comparison` counts the comparison reads.
 */
function database({
  unsubscribed = false, parent = PRIYA as typeof PRIYA | null, child = true, helped = false, rushed = false, learning = null as ProfileLearning | null,
} = {}) {
  const tables: MemoryReportTables = {
    reports: [],
    assessments: [{
      id: TEST, parentId: "parent-1", childId: "child-1", status: "completed", grade: 4, province: "BC", completedAt: "2026-10-10T12:00:00Z",
      placement: {
        ...placement,
        ...(helped ? { flags: [{ kind: "helped" as const, answer: "yes" as const }] } : {}),
        // #189: 12 of 36 answers very fast, 3 of them wrong ones in a run.
        ...(rushed ? { pace: { veryFast: 12, answers: 36, leftOut: ["s1-0", "s1-1", "s1-2"], unreliable: true } } : {}),
      },
      help: helped ? "yes" : "no",
      test: storedTest(createSession({ grade: 4, province: "BC" }, 101)),
    }],
    answers: asked.map((q, n) => ({
      assessmentId: TEST, position: n, questionId: q.id, response: q.level <= 4 ? q.answer : "no idea", correct: q.level <= 4, misconception: null,
      timeMs: 20_000, workRequired: q.showWork === true, workPath: n === DRAWN ? DRAWING : null, workText: n === TYPED ? "6 x 4 = 24" : null,
      readAloud: n === 0 ? 2 : 0, away: n === 1 ? { count: 1, ms: 4000 } : { count: 0, ms: 0 },
    })),
    children: child ? [{ id: "child-1", parentId: "parent-1", firstName: "Asha" }] : [],
    drawings: [DRAWING],
  };
  const readers = memoryReportReaders(tables);
  const job = memoryReportJobStore(tables, {
    reads: readers.reads,
    parents: parent ? [{ id: "parent-1", ...parent }] : [],
    unsubscribed: unsubscribed ? ["parent-1"] : [],
  });
  const profiles = memoryLearnerProfileStore(tables, { reads: readers.reads, learning: learning ? { "child-1": learning } : {} });
  // One comparison read is one scan of the completed tests (src/lib/comparison-store.ts): one request for each 500
  // tests, and one more. The count is of the scans, as the number of requests depends on how many tests there are.
  const comparison = vi.fn<ComparisonRead>(async (assessmentId) => {
    countRead(readers.reads, "comparison");
    return { assessmentId, tests: cohort };
  });
  return { tables, readers, job, profiles, comparison };
}
type Database = ReturnType<typeof database>;

const PARENT_EMAIL = { report: "report-1", email: "parent" } as const;
const ALERT = { report: "report-1", email: "alert" } as const;
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** Runs the job on the in-memory adapters, as the finish route does after its response. */
const run = (
  db: Database,
  mail: ReturnType<typeof memoryTransport>,
  book: { ledger: ReportLedger<string> },
  reviewer: WorkReviewer | null = fakeReviewer(),
) => runReportJob(TEST, ORIGIN, {
  reader: db.readers.key(), comparison: db.comparison, store: db.job.store, profiles: db.profiles.store, reviewer, transport: mail.transport, ledger: book.ledger,
});

let network: string[];
beforeEach(() => {
  network = [];
  vi.stubGlobal("fetch", async (input: unknown) => {
    network.push(String(input));
    return new Response(JSON.stringify({ id: "re_network" }), { status: 200 });
  });
  vi.stubEnv("RESEND_API_KEY", "re_synthetic");
  vi.stubEnv("EMAIL_FROM", "Unica Learning <hello@unicalearning.com>");
  vi.stubEnv("SIGNUP_NOTIFY_EMAIL", "savar@unicalearning.com");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the stored report", () => {
  it("is built once from the module's inputs, with the AI comments and only the measured comparison; a second run reuses it", async () => {
    const db = database();
    const mail = memoryTransport();
    const book = memoryReportLedger({ reads: db.readers.reads });
    await run(db, mail, book);

    expect(db.tables.reports).toHaveLength(1);
    const [report] = db.tables.reports!;
    expect(report).toMatchObject({ id: "report-1", assessmentId: TEST, parentId: "parent-1", childId: "child-1", questions: 42, minutes: 14 });
    expect(report.model.comparison).toEqual({ stage: "percentile", n: 400, percentile: 50 });
    // The fake reviewer's comment on each piece of work: both answers were right.
    expect(report.model.work?.map((w) => [w.questionId, w.image, w.text, w.comment])).toEqual([
      [asked[DRAWN].id, DRAWING, null, "Wrote each step in order, and the steps lead to the answer."],
      [asked[TYPED].id, null, "6 x 4 = 24", "Wrote each step in order, and the steps lead to the answer."],
    ]);
    // The reviews run at the same time, so they are stored in any order.
    expect(db.job.reviews().map((r) => [r.questionId, r.model]).sort()).toEqual([[asked[DRAWN].id, "fake"], [asked[TYPED].id, "fake"]].sort());
    expect(db.job.downloads).toEqual([DRAWING]);
    // The fake reviewer's report text passed the checks.
    expect(report.model.summary).toEqual(expect.any(String));
    // The stored report holds only the measured summary: none of the cohort's rows.
    const snapshot = JSON.stringify(report);
    for (const secret of ["private-child-", "private-parent@", "stage1", "excludedEmails", "tests"]) expect(snapshot).not.toContain(secret);
    // Every read that production makes, one for each database request: the stored test and its answers, through the
    // module; the check for a stored report, then the comparison scan and the stored AI reviews; the parent and the
    // stored report's view (#163; one request, with the test and the child), for the emails; then the ledger's check
    // that the parent email has not gone (src/lib/report-row-ledger.ts), and the unsubscribe check. The learner profile
    // (#196) is built from the same inputs: it reads only the parent's answers on the learning card (children).
    // The email uses this run's facts snapshot (#198), so it makes no stored profile read.
    expect(db.readers.reads).toEqual({ assessments: 1, answers: 1, reports: 3, comparison: 1, work_reviews: 1, parents: 1, email_log: 1, children: 1 });
    expect(db.comparison.mock.calls).toEqual([[TEST]]);

    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
    expect(mail.delivered[1].text).toContain("AI review (fake): 2 pieces of work, 2 reviewed, 2 sure enough to show a comment. Report text: kept.");
    expect(mail.delivered[1].text).toContain("Questions: 42 questions in 14 minutes");

    // A second run finds the report: no new report, no comparison read, no review, no email.
    await run(db, mail, book);
    expect(db.tables.reports).toHaveLength(1);
    expect(JSON.stringify(db.tables.reports![0])).toBe(snapshot);
    expect(db.comparison).toHaveBeenCalledTimes(1);
    expect(db.job.reviews()).toHaveLength(2);
    expect(mail.delivered).toHaveLength(2);
    // The second run reads its inputs, finds the stored report, and reads the parent and the view; the ledger finds
    // that the parent email went, so the run makes no unsubscribe check. It builds the profile again (#196). It calls no
    // network itself.
    expect(db.readers.reads).toEqual({ assessments: 2, answers: 2, reports: 6, comparison: 1, work_reviews: 1, parents: 2, email_log: 1, children: 2 });
    expect(network).toEqual([]);
  });

  it("has no AI parts when the AI step is off: no review, no drawing downloaded, and the alert says so", async () => {
    const db = database();
    const mail = memoryTransport();
    await run(db, mail, memoryReportLedger(), null);

    const [report] = db.tables.reports!;
    expect(report.model.work?.map((w) => [w.questionId, w.comment])).toEqual([[asked[DRAWN].id, null], [asked[TYPED].id, null]]);
    expect(report.model.summary).toBeUndefined();
    expect(db.job.reviews()).toEqual([]);
    expect(db.job.downloads).toEqual([]);
    expect(mail.delivered[1].text).toContain("AI review: off (no OPENROUTER_API_KEY). The report has no AI comments and no AI text.");
  });

  it("does nothing for a test that is not finished: no report, no email, no alert", async () => {
    const db = database();
    db.tables.assessments![0] = { ...db.tables.assessments![0], status: "in_progress", completedAt: null, placement: null };
    const mail = memoryTransport();
    await run(db, mail, memoryReportLedger());
    expect(db.tables.reports).toEqual([]);
    expect(mail.delivered).toEqual([]);
    expect(db.comparison).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[report] not a finished assessment", TEST);
  });
});

describe("the report emails", () => {
  it("sends the parent email and the alert once each through the delivery module; a second run sends nothing", async () => {
    const db = database();
    const mail = memoryTransport();
    const book = memoryReportLedger();
    await run(db, mail, book);

    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
    const [report, alert] = mail.delivered;
    expect(report).toMatchObject({ sender: { to: "parent" }, replyTo: "contact@unicalearning.com", subject: "Asha's math report is ready" });
    expect(report.text).toContain(`See Asha's full report: ${ORIGIN}/account/report/report-1?src=email`);
    expect(alert).toMatchObject({ sender: { to: "savar", testSenderName: "Unica Learning reports" }, replyTo: "priya@family.ca" });
    expect(alert.text).toContain("Parent email: sent to priya@family.ca");
    expect(alert.text).toContain(`Report: ${ORIGIN}/admin/assessments/${TEST}`);

    // CASL (#80): the email offers a plan, so it carries the unsubscribe link and the one-click headers. The claim
    // stored the hash of the link's token, so the link works.
    const token = new URL(report.text.match(/Unsubscribe: (\S+)/)![1]).searchParams.get("t")!;
    expect(report.text).toContain(`Unsubscribe: ${ORIGIN}/unsubscribe?t=${token}`);
    expect(report.headers).toEqual({ "List-Unsubscribe": `<${ORIGIN}/api/unsubscribe?t=${token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(book.entry(PARENT_EMAIL)).toMatchObject({ state: "sent", emailId: "email-1", claims: 1, fields: { unsubscribe_hash: sha256(token) } });
    expect(book.entry(ALERT)).toMatchObject({ state: "sent", emailId: "email-2", claims: 1 });

    await run(db, mail, book);
    expect(mail.delivered).toHaveLength(2);
    // The job neither calls Resend nor writes a claim itself: the delivery module and the ledger do.
    expect(network).toEqual([]);
  });

  it("sends an unsubscribed parent the report without the offer and without the unsubscribe headers", async () => {
    const db = database({ unsubscribed: true });
    const mail = memoryTransport();
    await run(db, mail, memoryReportLedger());
    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
    const [report] = mail.delivered;
    expect(report.headers).toBeUndefined();
    for (const body of [report.text, report.html!]) {
      expect(body).not.toMatch(/Choose a plan|Join the waitlist|step=|How we help|Unsubscribe:|unsubscribe\?t=/);
      expect(body).toContain("You unsubscribed from reminders and emails about our plans, so this email has only the report.");
    }
  });

  it("keeps the claim of a parent email whose outcome is unknown, and the alert says it is unknown", async () => {
    const db = database();
    const mail = memoryTransport();
    const book = memoryReportLedger();
    // Resend took the email, then the answer was lost.
    mail.answerNext("lose_answer");
    await run(db, mail, book);

    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
    const [report, alert] = mail.delivered;
    const token = new URL(report.text.match(/Unsubscribe: (\S+)/)![1]).searchParams.get("t")!;
    const error = "Resend delivery is unknown: the answer was lost in the test. Check delivery before sending again.";
    expect(book.entry(PARENT_EMAIL)).toMatchObject({ state: "unknown", emailId: null, error, fields: { unsubscribe_hash: sha256(token) } });
    expect(alert.text).toContain(`Parent email: delivery UNKNOWN (${error}). Check delivery before sending again.`);
    expect(console.error).toHaveBeenCalledWith("[report] parent email failed", "report-1", "unknown", error);

    // Nothing sends it again automatically, and the token in the email that may have gone keeps working.
    await run(db, mail, book);
    expect(mail.delivered).toHaveLength(2);
    expect(book.entry(PARENT_EMAIL)).toMatchObject({ state: "unknown", claims: 1, fields: { unsubscribe_hash: sha256(token) } });
  });

  it("releases the claim of a refused parent email: the alert says it was not sent, and a later run sends it", async () => {
    const db = database();
    const mail = memoryTransport();
    const book = memoryReportLedger();
    mail.answerNext("refuse");
    await run(db, mail, book);
    expect(mail.delivered.map((m) => m.to)).toEqual(["savar@unicalearning.com"]);
    expect(mail.delivered[0].text).toContain("Parent email: NOT SENT (Resend answered 422: refused in the test). Send the report link by hand.");
    expect(book.entry(PARENT_EMAIL)).toMatchObject({ state: "refused", error: "Resend answered 422: refused in the test" });

    await run(db, mail, book);
    // Savar gets one alert for the report; the parent gets the report once.
    expect(mail.delivered.map((m) => m.to)).toEqual(["savar@unicalearning.com", "priya@family.ca"]);
    expect(book.entry(PARENT_EMAIL)).toMatchObject({ state: "sent", claims: 2, error: null });
  });

  it("stores one report and sends one parent email and one alert when two runs go at the same time", async () => {
    const db = database();
    const mail = memoryTransport();
    const book = memoryReportLedger();
    await Promise.all([run(db, mail, book), run(db, mail, book)]);
    expect(db.tables.reports).toHaveLength(1);
    expect(mail.delivered.map((m) => m.to).sort()).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
    expect(mail.delivered.find((m) => m.to === "savar@unicalearning.com")?.text).toContain("Parent email: sent to priya@family.ca");
  });

  it("stops when another run holds the parent email's claim: that run sends the alert", async () => {
    const db = database();
    const mail = memoryTransport();
    const book = memoryReportLedger();
    // Another run claimed the parent email and is sending it now.
    expect(await book.ledger.claim(PARENT_EMAIL, { unsubscribe_hash: "h1" })).not.toBeNull();
    await run(db, mail, book);
    // This run stored the report, then stopped at the parent email.
    expect(db.tables.reports).toHaveLength(1);
    expect(mail.delivered).toEqual([]);
    expect(book.entry(ALERT)).toBeUndefined();
  });

  it("sends the alert that did not go on a later run, without a second parent email", async () => {
    const db = database();
    const mail = memoryTransport();
    const book = memoryReportLedger();
    mail.answerNext("deliver", "refuse");
    await run(db, mail, book);
    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca"]);
    expect(book.entry(ALERT)).toMatchObject({ state: "refused" });

    await run(db, mail, book);
    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
    expect(mail.delivered[1].text).toContain("Parent email: sent to priya@family.ca");
  });

  it("sends no alert when no alert address is set", async () => {
    vi.stubEnv("SIGNUP_NOTIFY_EMAIL", "");
    const db = database();
    const mail = memoryTransport();
    const book = memoryReportLedger();
    await run(db, mail, book);
    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca"]);
    expect(book.entry(ALERT)).toBeUndefined();
  });
});

/** The words of a page or an email, as the parent reads them: the HTML without its tags and entities. */
const words = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** The area rows of the report email's text, in order: "<area>: <status>, <n> of <m> right". */
function emailAreas(text: string): string[] {
  const block = text.split("\n\n").find((b) => b.startsWith("By area\n")) ?? "";
  return block.split("\n").filter((line) => /^.+: .+, \d+ of \d+ right( \(.+\))?$/.test(line));
}

/** The area rows of the report page, in order, each read from its own table row and written as the email writes it. */
function pageAreas(html: string): string[] {
  const table = html.match(/<table class="rpt-areas">([\s\S]*?)<\/table>/)?.[1] ?? "";
  // #189: the certainty label under the status chip, as the email writes it in brackets.
  const rows = table.matchAll(/<tr><th scope="row">([\s\S]*?)<span>[\s\S]*?class="rpt-chip[^"]*">([\s\S]*?)<\/span>(?:<span class="rpt-sure[^"]*">([\s\S]*?)<\/span>)?[\s\S]*?class="rpt-count">([\s\S]*?)<\/td><\/tr>/g);
  return [...rows].map(([, name, status, sure, count]) => `${words(name)}: ${words(status)}, ${words(count)} right${sure ? ` (${words(sure)})` : ""}`);
}

/** Each piece of text is in each place. */
function expectEverywhere(places: Record<string, string>, pieces: string[]) {
  for (const [where, text] of Object.entries(places)) {
    for (const piece of pieces) expect(text, `${where}: ${piece}`).toContain(piece);
  }
}

/**
 * The report page that Asha's parent opens, from the view of the parent's own reader (#161), as the page renders it:
 * its HTML, and its words. The next step row shows only its title: its buttons and the learning questions (#126) need
 * the browser's router, and they are not part of the report text.
 */
async function reportPage(db: Database) {
  const loaded = await loadReportView(db.readers.parent("parent-1"), "report-1");
  if (!loaded) throw new Error("the parent's reader found no report");
  const html = renderToStaticMarkup(createElement(ReportCard, { view: loaded.view, readOnly: true }));
  return { html, text: words(html) };
}

/** The parent email the job sent, and the report page, as places that must hold the same text. */
const places = (email: { text: string; html?: string }, page: { text: string }) =>
  ({ "email text": words(email.text), "email HTML": words(email.html!), page: page.text });

describe("the report email and the report page (#163)", () => {
  // The job builds the email from its own view (the secret key's reader); the page uses the parent's reader. For the
  // same stored report, each must hold the same report text. The expected words are written out, from Asha's test.
  it("hold the same report text: the child's name, the questions and minutes, the level, the areas and the comparison", async () => {
    const db = database();
    const mail = memoryTransport();
    await run(db, mail, memoryReportLedger());
    const [email] = mail.delivered;
    expect(email.to).toBe("priya@family.ca");
    const page = await reportPage(db);

    expectEverywhere(places(email, page), [
      "Asha",
      "42 questions in 14 minutes",
      "Asha is working at a grade 4 level.",
      "That matches Asha's school grade.",
      "Asha's result is at the 50th percentile among 400 grade 4 children who took this test.",
    ]);
    // Each area as one row: its name, its status and its count together, in order. Asha got every grade 4 question
    // right. A row is matched whole, so a count or a status in the AI text or the legend cannot stand in for it.
    const areas = [
      "Number and operations: Secure, 6 of 6 right (Clear)",
      "Fractions and decimals: Secure, 6 of 6 right (Clear)",
      "Patterns and algebra: Secure, 6 of 6 right (Clear)",
      "Shapes, measurement and data: Secure, 6 of 6 right (Clear)",
    ];
    expect(emailAreas(email.text)).toEqual(areas);
    expect(pageAreas(page.html)).toEqual(areas);
    // The AI text (the fake reviewer's), with the child's name in it, is the same in both.
    const summary = db.tables.reports![0].model.summary!.replaceAll(REPORT_TEXT_NAME, "Asha");
    expect(summary).toContain("Asha");
    expectEverywhere(places(email, page), [words(summary)]);
  });

  it("hold the same finish date: the retake date of a report that warns about help, in the family's time zone", async () => {
    // Asha said someone helped. The warning gives the first whole day of the retake, 30 days after the finish
    // (2026-10-10 12:00 UTC), in Vancouver time.
    const db = database({ helped: true });
    const mail = memoryTransport();
    await run(db, mail, memoryReportLedger());
    const [email] = mail.delivered;
    const page = await reportPage(db);

    expectEverywhere(places(email, page), [
      "This level may be too high",
      "For a level you can trust, Asha can take a new test alone, with new questions, from November 10, 2026.",
      "42 questions in 14 minutes",
    ]);
    // The page also shows the finish date itself.
    expect(page.text).toContain("October 10, 2026");
  });
});

// #189 (spec #181): the reliability note, the new test at once and the left-out answers, in the email and on the page.
// State and structure, not copy (spec #181): the same note and left-out line in each place, the count, the button.
describe("the reliability note on the report email and the report page", () => {
  /** Asha's rushed report as the parent's reader loads it, with the email the job sent and the read-only page. */
  const rushedReport = async () => {
    const db = database({ rushed: true });
    const mail = memoryTransport();
    await run(db, mail, memoryReportLedger());
    const loaded = (await loadReportView(db.readers.parent("parent-1"), "report-1"))!;
    return { email: mail.delivered[0], page: await reportPage(db), view: loaded.view };
  };

  it("both carry the same note, with the count and no retake time, and the same left-out line", async () => {
    const { email, page, view } = await rushedReport();
    const note = reliabilityNote(view)!;
    // The email and this copy of the page do not read the start rules (D-108).
    expect(note).toMatchObject({ veryFast: 12, answers: 36, when: { kind: "unknown" } });
    expect(view.model.leftOut).toBe(3);
    expectEverywhere(places(email, page), [note.title, note.text, note.offer, leftOutLine(view)!].map(words));
  });

  it("on the parent's page, shows the button only while a new test is open, and otherwise the day it opens (D-108)", async () => {
    const { view } = await rushedReport();
    const page = (newTest: Parameters<typeof ReportCard>[0]["newTest"]) => renderToStaticMarkup(createElement(ReportCard, { view, readOnly: true, newTest }));
    const open = page({ state: { kind: "open" }, href: "/account/start/child-1", label: "Start a new test" });
    expect(open).toContain('href="/account/start/child-1"');
    expect(words(open)).toContain(words(reliabilityNote(view, { kind: "open" })!.offer));
    const at = Date.parse("2026-11-09T12:00:00Z");
    const waiting = page({ state: { kind: "opens", at }, href: "/account/start/child-1", label: "" });
    expect(waiting).not.toContain('href="/account/start/child-1"');
    expect(reliabilityNote(view, { kind: "opens", at })!.when).toEqual({ kind: "from", date: "November 10, 2026" });
    expect(words(waiting)).toContain("November 10, 2026");
  });

  it("is on neither at a steady pace", async () => {
    const { view } = await rushedReport();
    const title = words(reliabilityNote(view)!.title);
    const db = database();
    const mail = memoryTransport();
    await run(db, mail, memoryReportLedger());
    const page = await reportPage(db);
    for (const text of Object.values(places(mail.delivered[0], page))) expect(text).not.toContain(title);
  });
});

describe("a report step that fails", () => {
  it("alerts Savar without a send key when the parent is missing, so each failed run alerts again; the job does not throw", async () => {
    const db = database({ parent: null });
    const mail = memoryTransport();
    const book = memoryReportLedger();
    await expect(run(db, mail, book)).resolves.toBeUndefined();
    await run(db, mail, book);
    expect(mail.delivered).toHaveLength(2);
    for (const alert of mail.delivered) {
      expect(alert).toMatchObject({ sender: { to: "savar", testSenderName: "Unica Learning reports" }, to: "savar@unicalearning.com", subject: `Report FAILED for assessment ${TEST}` });
      expect(alert.text).toContain("The report step failed: parent not found");
    }
    expect(book.entry(PARENT_EMAIL)).toBeUndefined();
    // The report itself is stored, and visible in the account.
    expect(db.tables.reports).toHaveLength(1);
    expect(network).toEqual([]);
  });

  it("alerts Savar as a failure when the child is missing: the report view is not found, and nothing goes to the parent", async () => {
    const db = database({ child: false });
    const mail = memoryTransport();
    const book = memoryReportLedger({ reads: db.readers.reads });
    await expect(run(db, mail, book)).resolves.toBeUndefined();
    expect(mail.delivered.map((m) => [m.to, m.subject])).toEqual([["savar@unicalearning.com", `Report FAILED for assessment ${TEST}`]]);
    expect(mail.delivered[0].text).toContain("The report step failed: report view not found");
    expect(book.entry(PARENT_EMAIL)).toBeUndefined();
    expect(book.entry(ALERT)).toBeUndefined();
    // The report is stored; the job checked for a stored report once, and asked the module for its view once. It
    // stopped before the parent email, so the ledger read nothing.
    expect(db.tables.reports).toHaveLength(1);
    expect(db.readers.reads.reports).toBe(2);
  });

  it("alerts Savar when the test cannot be read", async () => {
    const db = database();
    const mail = memoryTransport();
    const reader = { ...db.readers.key(), answers: async () => { throw new Error("answers load: database down"); } };
    await expect(runReportJob(TEST, ORIGIN, { reader, comparison: db.comparison, store: db.job.store, profiles: db.profiles.store, reviewer: null, transport: mail.transport, ledger: memoryReportLedger().ledger }))
      .resolves.toBeUndefined();
    expect(mail.delivered.map((m) => [m.to, m.subject])).toEqual([["savar@unicalearning.com", `Report FAILED for assessment ${TEST}`]]);
    expect(mail.delivered[0].text).toContain("The report step failed: answers load: database down");
    expect(db.tables.reports).toEqual([]);
  });

  it("alerts Savar when a claim cannot be written; nothing goes to the parent", async () => {
    const db = database();
    const mail = memoryTransport();
    const book = memoryReportLedger();
    const broken: ReportLedger<string> = { ...book.ledger, claim: async () => { throw new Error("claim emailed_at: database down"); } };
    await expect(run(db, mail, { ledger: broken })).resolves.toBeUndefined();
    expect(mail.delivered.map((m) => [m.to, m.subject])).toEqual([["savar@unicalearning.com", `Report FAILED for assessment ${TEST}`]]);
    expect(mail.delivered[0].text).toContain("The report step failed: claim emailed_at: database down");
  });
});

// The learner profile (#196, spec #181): built by the job from the same read as the report, stored in the profile store
// (public.learner_profiles), one per test, and built again on each later run of the job.
describe("the learner profile", () => {
  const PRIYAS_ANSWERS: ProfileLearning = { styles: ["pictures"], interests: ["space"], feeling: "okay", goal: "keep_up", weeklyTime: "1_to_2h" };

  it("is built and stored after finish, from the job's own read of the test, with its schema version", async () => {
    const db = database({ learning: PRIYAS_ANSWERS });
    await run(db, memoryTransport(), memoryReportLedger());

    expect(db.profiles.rows()).toHaveLength(1);
    const [row] = db.profiles.rows();
    expect(row).toMatchObject({ assessmentId: TEST, parentId: "parent-1", childId: "child-1", schemaVersion: PROFILE_SCHEMA_VERSION });
    const profile = storedProfile(row.profile)!;
    expect(profile.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    // Asha's test: every grade 4 question right, so no struggle, and each standard at her school grade is a strength.
    expect(profile.test).toEqual({ grade: 4, province: "BC", route: "up", answered: 42 });
    expect(profile.level).toMatchObject({ working: 4, certainty: "clear" });
    expect(profile.struggles).toEqual([]);
    expect(profile.strengths.length).toBeGreaterThan(0);
    // The stored answers' timeline and shown work (#184, #67), and Priya's answers on the card (#195).
    expect(profile.behaviour).toMatchObject({
      readAloud: { recorded: 42, questions: 1, uses: 2 },
      away: { recorded: 42, questions: 1, times: 1, ms: 4000 },
      whiteboard: { requiredWithWork: 2, optionalWithWork: 0 },
      help: { answer: "no", likely: false },
    });
    expect(profile.preferences).toEqual({ styles: ["pictures"], interests: ["space"] });
    expect(profile.parent).toEqual({ feeling: "okay", goal: "keep_up", weeklyTime: "1_to_2h" });
    // Never a name, the drawing or the typed working.
    const json = JSON.stringify(row.profile);
    for (const secret of ["Asha", "Priya", DRAWING, "6 x 4 = 24"]) expect(json).not.toContain(secret);
  });

  it("is built again in place on a later run, as when an extra round (#190) finishes: the new placement and answers count", async () => {
    const db = database();
    await run(db, memoryTransport(), memoryReportLedger());
    expect(storedProfile(db.profiles.rows()[0].profile)!.test.answered).toBe(42);

    // The extra round's stand-in: 8 more right answers to questions of the stored test that the route did not ask, and
    // the placement scored again. Meanwhile Priya answered the learning card on the report.
    const [test] = db.tables.assessments!;
    const more = test.test.stage2.stay.slice(0, 8);
    db.tables.answers!.push(...more.map((q, n) => ({
      assessmentId: TEST, position: 42 + n, questionId: q.id, response: q.answer, correct: true, misconception: null,
      timeMs: 20_000, workRequired: false, workPath: null, workText: null, readAloud: 0, away: { count: 0, ms: 0 },
    })));
    test.placement = { ...test.placement!, workingLevel: 5 };
    db.profiles.learning["child-1"] = PRIYAS_ANSWERS;
    await run(db, memoryTransport(), memoryReportLedger());

    expect(db.profiles.rows()).toHaveLength(1);
    const profile = storedProfile(db.profiles.rows()[0].profile)!;
    expect(profile.test.answered).toBe(50);
    expect(profile.standards.reduce((n, s) => n + s.total, 0)).toBe(50);
    expect(profile.level.working).toBe(5);
    expect(profile.parent).toEqual({ feeling: "okay", goal: "keep_up", weeklyTime: "1_to_2h" });
  });

  it("can be built again on its own: for one test (#190), and for the child's latest finished test when the parent answers the card", async () => {
    const db = database();
    // An older finished test of Asha's, from September.
    db.tables.assessments!.push({ ...structuredClone(db.tables.assessments![0]), id: "test-0", completedAt: "2026-09-01T12:00:00Z" });
    await run(db, memoryTransport(), memoryReportLedger());
    const options = { reader: db.readers.key(), store: db.profiles.store };

    db.tables.assessments![0].placement = { ...db.tables.assessments![0].placement!, workingLevel: 5 };
    expect((await rebuildLearnerProfile(TEST, options))?.level.working).toBe(5);
    expect(storedProfile(db.profiles.rows()[0].profile)!.level.working).toBe(5);

    db.profiles.learning["child-1"] = PRIYAS_ANSWERS;
    expect((await rebuildLatestProfile("child-1", options))?.parent).toEqual({ feeling: "okay", goal: "keep_up", weeklyTime: "1_to_2h" });
    expect(db.profiles.rows().map((r) => [r.assessmentId, storedProfile(r.profile)!.parent.goal])).toEqual([[TEST, "keep_up"]]);
    // A child with no finished test has no profile to build; a test that is not finished has none either.
    expect(await rebuildLatestProfile("child-2", options)).toBeNull();
    db.tables.assessments![1] = { ...db.tables.assessments![1], status: "in_progress", completedAt: null, placement: null };
    expect(await rebuildLearnerProfile("test-0", options)).toBeNull();
    expect(db.profiles.rows()).toHaveLength(1);
  });

  it("is not built for a test not scored against BC: the skill map and the tags are BC's", async () => {
    const db = database();
    db.tables.assessments![0].placement = { ...db.tables.assessments![0].placement!, scoredAgainst: "AB" };
    const mail = memoryTransport();
    await run(db, mail, memoryReportLedger());
    expect(db.profiles.rows()).toEqual([]);
    expect(db.tables.reports).toHaveLength(1);
    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
  });

  it("keeps the report and its emails when the profile cannot be stored, and logs the failure", async () => {
    const db = database();
    const mail = memoryTransport();
    const profiles = { ...db.profiles.store, save: async () => { throw new Error("profile save: database down"); } };
    await runReportJob(TEST, ORIGIN, { reader: db.readers.key(), comparison: db.comparison, store: db.job.store, profiles, reviewer: null, transport: mail.transport, ledger: memoryReportLedger().ledger });
    expect(db.tables.reports).toHaveLength(1);
    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
    expect(console.error).toHaveBeenCalledWith("[profile] failed", TEST, "profile save: database down");
  });
});

// The learner profile's AI parts (#197, spec #181): written through the AI client from the profile facts, the skill-map
// neighbours and the misconception descriptions, checked, and stored with the facts. Here with the fake client.
describe("the learner profile's AI parts", () => {
  const MODEL = "openai/gpt-5.5-mini";
  const PRIYAS_ANSWERS: ProfileLearning = { styles: ["pictures"], interests: ["space"], feeling: "avoids", goal: "catch_up", weeklyTime: "1_to_2h" };
  const STANDARD = new Map(BANKS["3-5"].map((t) => [t.id, t.standard]));
  /** The grade 4 standard Asha struggles with: she gives a coded wrong answer on each of its questions that has one. */
  const WEAK = STANDARD.get(asked.find((q) => q.level === 4 && q.wrong.length > 0)!.templateId)!;
  /** A standard above Asha's grade that builds on a skill of WEAK: its prerequisites are not secure, so it is no next challenge. */
  const NOT_READY = BC_SKILL_MAP.standards.find((s) => s.grade > 4 && s.skills.some((k) => k.requires.some((r) => r.startsWith(`${WEAK}-`))))!.code;

  function struggling(learning: ProfileLearning | null = null) {
    const db = database({ learning });
    for (const a of db.tables.answers!) {
      const q = asked[a.position];
      if (STANDARD.get(q.templateId) === WEAK && q.wrong[0]) Object.assign(a, { response: q.wrong[0].value, correct: false, misconception: q.wrong[0].misconception });
    }
    return db;
  }
  /** What the AI read: the JSON in the request's one text part. */
  const factsOf = (request: AiJsonRequest) => JSON.parse(request.content[0].type === "text" ? request.content[0].text : "null");
  /** Output that passes the checks, written from what the AI read. */
  const good = (request: AiJsonRequest) => {
    const f = factsOf(request);
    const ready: string[] = f.next_challenge_candidates.map((c: { code: string }) => c.code);
    return {
      struggles: f.profile.struggles.map((s: LearnerProfile["struggles"][number]) => ({
        code: s.code,
        likely_cause: `The wrong answers match a known mistake, and a skill this builds on may not be secure yet.`,
        how_to_help: `Practise ${s.text} in short daily sets, with ${REPORT_TEXT_NAME} saying each step aloud.`,
      })),
      next_challenge: ready.slice(0, 2),
      workbook_plan: {
        review: { percent: 20, standards: [f.profile.strengths[0].code] },
        practise: { percent: 60, standards: f.profile.struggles.map((s: { code: string }) => s.code) },
        stretch: { percent: 20, standards: ready.slice(0, 1) },
      },
    };
  };
  const runWith = (db: Database, profileAi: AiClient | null, mail = memoryTransport()) => runReportJob(TEST, ORIGIN, {
    reader: db.readers.key(), comparison: db.comparison, store: db.job.store, profiles: db.profiles.store, reviewer: null, profileAi, transport: mail.transport, ledger: memoryReportLedger().ledger,
  });
  const stored = (db: Database) => storedProfile(db.profiles.rows()[0].profile)!;
  /** The model id on each AI part of a profile. */
  const models = (profile: LearnerProfile) => Object.values(profile.ai ?? {}).map((part) => part.model);
  const PRIYAS_PARENT = { feeling: "avoids", goal: "catch_up", weeklyTime: "1_to_2h" };
  /** A fake client whose answers wait until the test lets them go, as a slow AI. */
  function held(model: string) {
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    return { client: fakeAiClient({ model, answer: async (r) => { await gate; return good(r); } }), release: () => release() };
  }
  /** The learning card's rebuild, as the learning route runs it after Priya saves the card. */
  const answerCard = (db: Database, ai: AiClient) => {
    db.profiles.learning["child-1"] = PRIYAS_ANSWERS;
    return rebuildLatestProfile("child-1", { reader: db.readers.key(), store: db.profiles.store, ai });
  };

  it("are written through the AI client from the facts, and stored with the facts, each labelled with the model id", async () => {
    const db = struggling(PRIYAS_ANSWERS);
    const ai = fakeAiClient({ model: MODEL, answer: good });
    const mail = memoryTransport();
    await runWith(db, ai, mail);

    // One request: the facts as JSON text, and the schema of the output.
    expect(ai.requests).toHaveLength(1);
    const [request] = ai.requests;
    expect(request).toMatchObject({ name: "learner_profile", schema: PROFILE_AI_SCHEMA });
    expect(request.content.map((c) => c.type)).toEqual(["text"]);
    const read = factsOf(request);
    const profile = stored(db);
    const { ai: parts, ...facts } = profile;
    // The AI read the stored facts, without the store's build id.
    expect({ ...read.profile, buildId: expect.any(String) }).toEqual(facts);
    expect(read.child).toBe(REPORT_TEXT_NAME);
    expect(read.profile.parent).toEqual({ feeling: "avoids", goal: "catch_up", weeklyTime: "1_to_2h" });
    expect(Object.keys(read.misconceptions).length).toBeGreaterThan(0);
    expect(read.struggle_skills.map((s: { code: string }) => s.code)).toEqual([WEAK]);
    // Never a name, the drawing or the typed working.
    const sent = JSON.stringify(request);
    for (const secret of ["Asha", "Priya", "priya@family.ca", DRAWING, "6 x 4 = 24", "child-1", "parent-1"]) expect(sent).not.toContain(secret);

    // The facts as code wrote them, and the four AI parts, each with the model id.
    expect(facts.struggles.map((s) => s.code)).toEqual([WEAK]);
    const answer = good(request);
    expect(parts).toEqual({
      likelyCauses: { model: MODEL, value: { [WEAK]: answer.struggles[0].likely_cause } },
      howToHelp: { model: MODEL, value: { [WEAK]: answer.struggles[0].how_to_help } },
      nextChallenge: { model: MODEL, value: answer.next_challenge },
      workbookPlan: { model: MODEL, value: answer.workbook_plan },
    });
    expect(profile.schemaVersion).toBe(1);
    // The report and its emails as without the AI parts.
    expect(db.tables.reports).toHaveLength(1);
    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
  });

  it("are left out when the output is not JSON or does not match the schema: the profile keeps its facts", async () => {
    for (const ai of [
      fakeAiClient({ model: MODEL, answer: () => { throw new Error("the output is not valid JSON"); } }),
      fakeAiClient({ model: MODEL, answer: (r) => ({ ...good(r), struggles: "none" }) }),
      fakeAiClient({ model: MODEL, answer: (r) => ({ ...good(r), workbook_plan: undefined }) }),
    ]) {
      const db = struggling();
      await runWith(db, ai);
      expect(ai.requests).toHaveLength(1);
      expect(db.profiles.rows()).toHaveLength(1);
      expect(stored(db).ai).toBeUndefined();
      expect(stored(db).struggles.map((s) => s.code)).toEqual([WEAK]);
    }
    expect(console.error).toHaveBeenCalledWith("[profile] AI failed", TEST, "the output is not valid JSON");
    expect(console.error).toHaveBeenCalledWith("[profile] AI failed", TEST, "the output does not match the schema: output.struggles is not an array");
  });

  it("drop a next challenge that names a standard whose prerequisites are not secure, and keep the rest", async () => {
    const db = struggling();
    const ai = fakeAiClient({ model: MODEL, answer: (r) => {
      const out = good(r);
      return { ...out, next_challenge: [NOT_READY, ...out.next_challenge], workbook_plan: { ...out.workbook_plan, stretch: { percent: 20, standards: [NOT_READY] } } };
    } });
    await runWith(db, ai);

    const candidates = factsOf(ai.requests[0]).next_challenge_candidates.map((c: { code: string }) => c.code);
    expect(candidates).not.toContain(NOT_READY);
    const parts = stored(db).ai!;
    expect(parts.nextChallenge).toEqual({ model: MODEL, value: candidates.slice(0, 2) });
    expect(parts.workbookPlan?.value.stretch).toEqual({ percent: 20, standards: [] });
    expect(parts.likelyCauses?.value).toHaveProperty(WEAK);
    expect(console.info).toHaveBeenCalledWith("[profile] AI parts dropped", TEST, JSON.stringify([
      { part: "nextChallenge", code: NOT_READY, problem: "prerequisites-not-secure" },
      { part: "workbookPlan", code: NOT_READY, problem: "prerequisites-not-secure" },
    ]));
  });

  it("are left out when the AI fails: the facts are stored, and the report and its emails go on", async () => {
    const db = struggling();
    const mail = memoryTransport();
    const ai = fakeAiClient({ model: MODEL, answer: () => { throw new Error("OpenRouter answered 503: no provider"); } });
    await runWith(db, ai, mail);

    expect(stored(db).ai).toBeUndefined();
    expect(stored(db).struggles.map((s) => s.code)).toEqual([WEAK]);
    expect(db.tables.reports).toHaveLength(1);
    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
    expect(console.error).toHaveBeenCalledWith("[profile] AI failed", TEST, "OpenRouter answered 503: no provider");
  });

  it("are left out when the AI takes too long, and the facts are stored before the AI answers", async () => {
    const db = struggling();
    const options = { reader: db.readers.key(), store: db.profiles.store };
    // A request that never answers, and ignores its signal: the time limit ends it.
    const silent = fakeAiClient({ model: MODEL, answer: () => new Promise(() => {}) });
    const built = rebuildLearnerProfile(TEST, { ...options, ai: silent, aiMs: 20 });
    await vi.waitFor(() => expect(silent.requests).toHaveLength(1));
    // The AI has not answered: the facts are already stored.
    expect(stored(db).struggles.map((s) => s.code)).toEqual([WEAK]);
    expect((await built)?.ai).toBeUndefined();
    expect(stored(db).ai).toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[profile] AI failed", TEST, "time is up");
  });

  it("are written again when the parent answers the learning card: the AI reads the parent's answers", async () => {
    const db = struggling();
    const ai = fakeAiClient({ model: MODEL, answer: good });
    await runWith(db, ai);
    expect(factsOf(ai.requests[0]).profile.parent).toEqual({ feeling: null, goal: null, weeklyTime: null });

    db.profiles.learning["child-1"] = PRIYAS_ANSWERS;
    await rebuildLatestProfile("child-1", { reader: db.readers.key(), store: db.profiles.store, ai });
    expect(ai.requests).toHaveLength(2);
    expect(factsOf(ai.requests[1]).profile.parent).toEqual({ feeling: "avoids", goal: "catch_up", weeklyTime: "1_to_2h" });
    expect(stored(db).parent.goal).toBe("catch_up");
    expect(stored(db).ai?.workbookPlan?.model).toBe(MODEL);
  });

  it("are asked for after the report's emails: a slow AI never holds up the parent's email", async () => {
    const db = struggling();
    const mail = memoryTransport();
    const job = held(MODEL);
    const running = runWith(db, job.client, mail);
    await vi.waitFor(() => expect(job.client.requests).toHaveLength(1));

    // The AI has not answered: the report, the profile's facts and both emails are done.
    expect(db.tables.reports).toHaveLength(1);
    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
    expect(stored(db).struggles.map((s) => s.code)).toEqual([WEAK]);
    expect(stored(db).ai).toBeUndefined();
    job.release();
    await running;
    expect(models(stored(db))).toEqual([MODEL, MODEL, MODEL, MODEL]);
    expect(mail.delivered).toHaveLength(2);
  });

  it("are not stored when the learning card's rebuild stored newer facts while the job's AI wrote: the card's answers stay", async () => {
    const CARD = ["card-model", "card-model", "card-model", "card-model"];
    for (const [cardAi, cardModels] of [
      [fakeAiClient({ model: "card-model", answer: good }), CARD],
      [fakeAiClient({ model: "card-model", answer: () => { throw new Error("OpenRouter answered 503: no provider"); } }), []],
    ] as const) {
      const db = struggling();
      const job = held("job-model");
      const running = runWith(db, job.client);
      // The job stored the facts and asked its AI, which has not answered.
      await vi.waitFor(() => expect(job.client.requests).toHaveLength(1));
      expect(factsOf(job.client.requests[0]).profile.parent).toEqual({ feeling: null, goal: null, weeklyTime: null });

      // Meanwhile Priya saves the learning card: its rebuild starts and finishes, with or without its AI parts.
      await answerCard(db, cardAi);
      const card = stored(db);
      expect(card.parent).toEqual(PRIYAS_PARENT);
      expect(models(card)).toEqual(cardModels);

      // Then the job's AI answers, from the facts without her answers: its parts are not stored, and her answers stay.
      job.release();
      await running;
      expect(db.profiles.rows()).toHaveLength(1);
      expect(stored(db)).toEqual(card);
      expect(stored(db).parent).toEqual(PRIYAS_PARENT);
      expect(stored(db).preferences).toEqual({ styles: ["pictures"], interests: ["space"] });
      expect(models(stored(db))).not.toContain("job-model");
    }
    expect(console.info).toHaveBeenCalledWith("[profile] AI parts not stored: a later build replaced the profile", TEST);
  });

  it("are stored by each build in turn when the job's AI answers before the parent saves the card", async () => {
    const db = struggling();
    const job = held("job-model");
    const running = runWith(db, job.client);
    await vi.waitFor(() => expect(job.client.requests).toHaveLength(1));
    job.release();
    await running;
    expect(models(stored(db))).toEqual(["job-model", "job-model", "job-model", "job-model"]);

    await answerCard(db, fakeAiClient({ model: "card-model", answer: good }));
    expect(stored(db).parent).toEqual(PRIYAS_PARENT);
    expect(models(stored(db))).toEqual(["card-model", "card-model", "card-model", "card-model"]);
  });

  it("of the later build are stored when both AIs write at once and the card's answers last", async () => {
    const db = struggling();
    const job = held("job-model");
    const card = held("card-model");
    const running = runWith(db, job.client);
    await vi.waitFor(() => expect(job.client.requests).toHaveLength(1));
    const rebuilt = answerCard(db, card.client);
    await vi.waitFor(() => expect(card.client.requests).toHaveLength(1));

    // The job's AI answers first: the card's build holds the row, so the job's parts are not stored.
    job.release();
    await running;
    expect(stored(db).parent).toEqual(PRIYAS_PARENT);
    expect(stored(db).ai).toBeUndefined();

    card.release();
    expect((await rebuilt)?.ai?.workbookPlan?.model).toBe("card-model");
    expect(stored(db).parent).toEqual(PRIYAS_PARENT);
    expect(models(stored(db))).toEqual(["card-model", "card-model", "card-model", "card-model"]);
  });

  it("keep the report and its emails when they cannot be stored, and log the failure", async () => {
    const db = struggling();
    const mail = memoryTransport();
    const profiles = { ...db.profiles.store, saveAi: async () => { throw new Error("profile AI save: database down"); } };
    await runReportJob(TEST, ORIGIN, {
      reader: db.readers.key(), comparison: db.comparison, store: db.job.store, profiles, reviewer: null, profileAi: fakeAiClient({ model: MODEL, answer: good }), transport: mail.transport, ledger: memoryReportLedger().ledger,
    });
    expect(db.tables.reports).toHaveLength(1);
    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
    expect(stored(db).struggles.map((s) => s.code)).toEqual([WEAK]);
    expect(stored(db).ai).toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[profile] failed", TEST, "profile AI save: database down");
  });

  it("are not asked for when the AI is off: no client, no call, the facts only", async () => {
    const db = struggling();
    await runWith(db, null);
    expect(db.profiles.rows()).toHaveLength(1);
    expect("ai" in (db.profiles.rows()[0].profile as object)).toBe(false);
  });

  it("do not enter a retried email when the new facts save fails and the stored profile still has AI (#198)", async () => {
    const db = struggling();
    await runWith(db, fakeAiClient({ model: MODEL, answer: good }));
    const cause = stored(db).ai!.likelyCauses!.value[WEAK];
    const mail = memoryTransport();
    await runReportJob(TEST, ORIGIN, {
      reader: db.readers.key(), comparison: db.comparison, store: db.job.store,
      profiles: { ...db.profiles.store, save: async () => { throw new Error("profile save unavailable"); } },
      reviewer: null, profileAi: null, transport: mail.transport, ledger: memoryReportLedger().ledger,
    });
    const [email] = mail.delivered;
    expect(email.to).toBe(PRIYA.email);
    for (const body of [email.text, email.html!]) expect(words(body)).not.toContain(cause);
    expect((await reportPage(db)).text).toContain(cause);
    expect(network).toEqual([]);
  });

  it("do not enter the email when a learning-card rebuild completes while the job reads the parent (#198)", async () => {
    const db = struggling();
    const mail = memoryTransport();
    let parentRead!: () => void;
    const readingParent = new Promise<void>((resolve) => { parentRead = resolve; });
    let rebuilt!: () => void;
    const rebuiltProfile = new Promise<void>((resolve) => { rebuilt = resolve; });
    const store = { ...db.job.store, parent: async (id: string) => {
      parentRead();
      await rebuiltProfile;
      return db.job.store.parent(id);
    } };
    const reader = db.readers.key();
    await Promise.all([
      runReportJob(TEST, ORIGIN, {
        reader: { ...reader, profile: async (id) => { await rebuiltProfile; return reader.profile(id); } },
        comparison: db.comparison, store, profiles: db.profiles.store,
        reviewer: null, profileAi: null, transport: mail.transport, ledger: memoryReportLedger().ledger,
      }),
      (async () => {
        await readingParent;
        await answerCard(db, fakeAiClient({ model: MODEL, answer: good }));
        rebuilt();
      })(),
    ]);
    const cause = stored(db).ai!.likelyCauses!.value[WEAK];
    const [email] = mail.delivered;
    for (const body of [email.text, email.html!]) expect(words(body)).not.toContain(cause);
    expect((await reportPage(db)).text).toContain(cause);
    const struggle = stored(db).struggles[0];
    const shown = struggle.wrong.find((w) => w.misconception)!;
    expect(words(email.text)).toContain(MISCONCEPTIONS[shown.misconception as MisconceptionId].description.toLowerCase());
  });

  it("reach the report page once stored; the report email, sent before they exist, shows the facts only (#198)", async () => {
    const db = struggling();
    const mail = memoryTransport();
    await runWith(db, fakeAiClient({ model: MODEL, answer: good }), mail);
    const [email] = mail.delivered;
    const page = await reportPage(db);
    const { struggles, strengths } = stored(db);
    const shown = struggles[0].wrong.find((w) => w.misconception)!;
    const mistake = MISCONCEPTIONS[shown.misconception as MisconceptionId].description.toLowerCase();

    // Both: a strength, the struggle with Asha's own wrong answer to one question, and the right answer.
    expect(strengths.length).toBeGreaterThan(0);
    expectEverywhere(places(email, page), [words(shown.prompt), shown.response, shown.rightAnswer]);
    // The email: the likely cause from the known mistake, and no workbook 1 preview: the AI wrote after it went.
    expect(words(email.text)).toContain(mistake);
    for (const body of [email.text, email.html]) expect(body).not.toContain("Workbook 1 focuses on");
    // The page, opened after the AI parts were stored: the AI's likely cause, and the preview.
    expect(page.text).toContain("The wrong answers match a known mistake, and a skill this builds on may not be secure yet.");
    expect(page.text).not.toContain(mistake);
    expect(page.text).toContain("Workbook 1 focuses on");
    // Never how to help, the model id or the build id: admin only.
    for (const body of [email.text, email.html, page.html]) {
      for (const secret of ["short daily sets", MODEL, "buildId"]) expect(body).not.toContain(secret);
    }
  });
});
