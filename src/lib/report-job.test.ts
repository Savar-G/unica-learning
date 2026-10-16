import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportCard } from "@/components/report";
import { createSession, REPORT_TEXT_NAME, storedTest, type ComparisonTest } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { memoryTransport } from "@/lib/email-delivery-memory";
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
// keeps the report row's claim rules. The comparison read and the ledger count their reads in the same counter too. The network is a stub that records any request, so a test sees any call to
// Supabase or Resend.
vi.mock("server-only", () => ({}));

const ORIGIN = "https://unica.test";
const TEST = "test-1";

// Asha, grade 4 in BC, child of Priya, works at grade 4: every grade 4 question right, every grade 5 question wrong,
// 20 seconds each. 36 questions (18 above her school grade), 12 minutes. She showed work on her first two
// show-your-work questions: one drawn, one typed.
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
 * report warns that the level may be too high. `comparison` counts the comparison reads.
 */
function database({ unsubscribed = false, parent = PRIYA as typeof PRIYA | null, child = true, helped = false, rushed = false } = {}) {
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
  // One comparison read is one scan of the completed tests (src/lib/comparison-store.ts): one request for each 500
  // tests, and one more. The count is of the scans, as the number of requests depends on how many tests there are.
  const comparison = vi.fn<ComparisonRead>(async (assessmentId) => {
    countRead(readers.reads, "comparison");
    return { assessmentId, tests: cohort };
  });
  return { tables, readers, job, comparison };
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
) => runReportJob(TEST, ORIGIN, { reader: db.readers.key(), comparison: db.comparison, store: db.job.store, reviewer, transport: mail.transport, ledger: book.ledger });

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
    expect(report).toMatchObject({ id: "report-1", assessmentId: TEST, parentId: "parent-1", childId: "child-1", questions: 36, minutes: 12 });
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
    // that the parent email has not gone (src/lib/report-row-ledger.ts), and the unsubscribe check.
    expect(db.readers.reads).toEqual({ assessments: 1, answers: 1, reports: 3, comparison: 1, work_reviews: 1, parents: 1, email_log: 1 });
    expect(db.comparison.mock.calls).toEqual([[TEST]]);

    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
    expect(mail.delivered[1].text).toContain("AI review (fake): 2 pieces of work, 2 reviewed, 2 sure enough to show a comment. Report text: kept.");
    expect(mail.delivered[1].text).toContain("Questions: 36 questions in 12 minutes");

    // A second run finds the report: no new report, no comparison read, no review, no email.
    await run(db, mail, book);
    expect(db.tables.reports).toHaveLength(1);
    expect(JSON.stringify(db.tables.reports![0])).toBe(snapshot);
    expect(db.comparison).toHaveBeenCalledTimes(1);
    expect(db.job.reviews()).toHaveLength(2);
    expect(mail.delivered).toHaveLength(2);
    // The second run reads its inputs, finds the stored report, and reads the parent and the view; the ledger finds
    // that the parent email went, so the run makes no unsubscribe check. It calls no network itself.
    expect(db.readers.reads).toEqual({ assessments: 2, answers: 2, reports: 6, comparison: 1, work_reviews: 1, parents: 2, email_log: 1 });
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
    expect(report).toMatchObject({ sender: { to: "parent" }, replyTo: "savar.gupta1922@gmail.com", subject: "Asha's math report is ready" });
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
      "36 questions in 12 minutes",
      "Asha is working at a grade 4 level.",
      "That matches Asha's school grade.",
      "Asha's result is at the 50th percentile among 400 grade 4 children who took this test.",
    ]);
    // Each area as one row: its name, its status and its count together, in order. Asha got every grade 4 question
    // right. A row is matched whole, so a count or a status in the AI text or the legend cannot stand in for it.
    const areas = [
      "Number and operations: Secure, 5 of 5 right (Clear)",
      "Fractions and decimals: Secure, 5 of 5 right (Clear)",
      "Patterns and algebra: Secure, 4 of 4 right (Clear)",
      "Shapes, measurement and data: Secure, 4 of 4 right (Clear)",
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
      "36 questions in 12 minutes",
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
    await expect(runReportJob(TEST, ORIGIN, { reader, comparison: db.comparison, store: db.job.store, reviewer: null, transport: mail.transport, ledger: memoryReportLedger().ledger }))
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
