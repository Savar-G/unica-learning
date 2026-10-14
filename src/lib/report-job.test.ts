import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportModel } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { memoryTransport } from "@/lib/email-delivery-memory";
import { runReportJob } from "@/lib/report-job";
import { memoryReportLedger } from "@/lib/report-row-ledger-memory";
import type { ReportLedger } from "@/lib/report-row-ledger";

// The report job (#65), through its public interface. A fake Supabase answers the job's reads and the report insert.
// The emails go through the delivery module (#151) with the in-memory transport and the in-memory report row ledger,
// which keeps the report row's claim rules. The network is a stub that records any request, so a test sees when the
// job calls Resend itself.
vi.mock("server-only", () => ({}));
let db: SupabaseClient;
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => db }));
vi.mock("@/lib/work-store", () => ({ loadShownWork: async () => [] }));

const ORIGIN = "https://unica.test";
const placement = takeTest({ grade: 4, province: "BC" }, 101, knowsUpTo(4)).placement;
const cohort = Array.from({ length: 400 }, (_, i) => ({
  id: String(i).padStart(6, "0"), child_id: `private-child-${i}`, status: "completed", completed_at: "2026-10-10T12:00:00Z",
  placement, parent: { email: "private-parent@family.ca" },
}));

interface StoredReport { id: string; model: ReportModel; questions: number; minutes: number }

/**
 * A fake Supabase with one finished test: Asha, grade 4 in BC, child of Priya; 400 completed tests in the cohort.
 * `unsubscribed`: Priya has an unsubscribe row in the email log. `parent`: null when the parent row is missing.
 */
function fakeStore({ unsubscribed = false, parent = { name: "Priya Shah", email: "priya@family.ca" } }: { unsubscribed?: boolean; parent?: { name: string; email: string } | null } = {}) {
  const state = { stored: null as StoredReport | null, sourceReads: 0, requests: [] as string[] };
  db = createClient("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1);
    const method = init?.method ?? "GET";
    state.requests.push(`${method} ${url.pathname}`);
    const headers: Record<string, string> = { "content-type": "application/json" };
    let result: unknown = [];
    if (table === "assessments" && url.searchParams.has("status")) {
      state.sourceReads++;
      headers["content-range"] = "0-399/400";
      result = url.searchParams.has("id") ? [] : cohort;
    } else if (table === "assessments") {
      result = { id: "000000", parent_id: "parent-1", child_id: "child-1", status: "completed", grade: 4, province: "BC", completed_at: "2026-10-10T12:00:00Z", placement, help: "no" };
    } else if (table === "reports" && method === "POST") {
      // One report per assessment: a second insert adds nothing (ignoreDuplicates), and the job reads the first.
      if (!state.stored) {
        const body = JSON.parse(String(init?.body));
        state.stored = { id: "report-1", model: body.model, questions: body.questions, minutes: body.minutes };
        result = [state.stored];
      }
    } else if (table === "reports" && method === "GET") result = state.stored;
    else if (table === "parents") result = parent;
    else if (table === "children") result = { first_name: "Asha" };
    else if (table === "email_log") headers["content-range"] = `*/${unsubscribed ? 1 : 0}`;
    return new Response(method === "HEAD" ? null : JSON.stringify(result), { headers });
  } } });
  return state;
}

const PARENT_EMAIL = { report: "report-1", email: "parent" } as const;
const ALERT = { report: "report-1", email: "alert" } as const;
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** Runs the job on the in-memory adapters, as the finish route does after its response. */
const run = (mail: ReturnType<typeof memoryTransport>, book: { ledger: ReportLedger<string> }) =>
  runReportJob("000000", ORIGIN, { reviewer: null, transport: mail.transport, ledger: book.ledger });

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

describe("report job comparison snapshot", () => {
  it("stores only the measured summary and reuses it when a job runs again", async () => {
    const store = fakeStore();
    const mail = memoryTransport();
    const book = memoryReportLedger();
    await run(mail, book);
    expect(store.stored).toMatchObject({ model: { comparison: { stage: "percentile", n: 400, percentile: 50 } } });
    expect(store.sourceReads).toBe(2);
    const snapshot = JSON.stringify(store.stored);
    for (const secret of ["private-child-", "private-parent@", "stage1", "excludedEmails", "tests"]) expect(snapshot).not.toContain(secret);
    await run(mail, book);
    expect(JSON.stringify(store.stored)).toBe(snapshot);
    expect(store.sourceReads).toBe(2);
    expect(store.requests.filter((r) => r === "POST /rest/v1/reports")).toHaveLength(1);
    expect(store.requests.every((r) => r.includes("/rest/v1/"))).toBe(true);
  });
});

describe("the report emails", () => {
  it("sends the parent email and the alert once each through the delivery module; a second run sends nothing", async () => {
    const store = fakeStore();
    const mail = memoryTransport();
    const book = memoryReportLedger();
    await run(mail, book);

    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
    const [report, alert] = mail.delivered;
    expect(report).toMatchObject({ sender: { to: "parent" }, replyTo: "savar.gupta1922@gmail.com", subject: "Asha's math report is ready" });
    expect(report.text).toContain(`See Asha's full report: ${ORIGIN}/account/report/report-1?src=email`);
    expect(alert).toMatchObject({ sender: { to: "savar", testSenderName: "Unica Learning reports" }, replyTo: "priya@family.ca" });
    expect(alert.text).toContain("Parent email: sent to priya@family.ca");

    // CASL (#80): the email offers a plan, so it carries the unsubscribe link and the one-click headers. The claim
    // stored the hash of the link's token, so the link works.
    const token = new URL(report.text.match(/Unsubscribe: (\S+)/)![1]).searchParams.get("t")!;
    expect(report.text).toContain(`Unsubscribe: ${ORIGIN}/unsubscribe?t=${token}`);
    expect(report.headers).toEqual({ "List-Unsubscribe": `<${ORIGIN}/api/unsubscribe?t=${token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(book.entry(PARENT_EMAIL)).toMatchObject({ state: "sent", emailId: "email-1", claims: 1, fields: { unsubscribe_hash: sha256(token) } });
    expect(book.entry(ALERT)).toMatchObject({ state: "sent", emailId: "email-2", claims: 1 });

    await run(mail, book);
    expect(mail.delivered).toHaveLength(2);
    // The job neither calls Resend nor writes a claim itself: the delivery module and the ledger do.
    expect(network).toEqual([]);
    expect(store.requests.filter((r) => !r.startsWith("GET ") && !r.startsWith("HEAD "))).toEqual(["POST /rest/v1/reports"]);
  });

  it("sends an unsubscribed parent the report without the offer and without the unsubscribe headers", async () => {
    fakeStore({ unsubscribed: true });
    const mail = memoryTransport();
    await run(mail, memoryReportLedger());
    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
    const [report] = mail.delivered;
    expect(report.headers).toBeUndefined();
    for (const body of [report.text, report.html!]) {
      expect(body).not.toMatch(/Choose a plan|Join the waitlist|step=|How we help|Unsubscribe:|unsubscribe\?t=/);
      expect(body).toContain("You unsubscribed from reminders and emails about our plans, so this email has only the report.");
    }
  });

  it("keeps the claim of a parent email whose outcome is unknown, and the alert says it is unknown", async () => {
    fakeStore();
    const mail = memoryTransport();
    const book = memoryReportLedger();
    // Resend took the email, then the answer was lost.
    mail.answerNext("lose_answer");
    await run(mail, book);

    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
    const [report, alert] = mail.delivered;
    const token = new URL(report.text.match(/Unsubscribe: (\S+)/)![1]).searchParams.get("t")!;
    const error = "Resend delivery is unknown: the answer was lost in the test. Check delivery before sending again.";
    expect(book.entry(PARENT_EMAIL)).toMatchObject({ state: "unknown", emailId: null, error, fields: { unsubscribe_hash: sha256(token) } });
    expect(alert.text).toContain(`Parent email: delivery UNKNOWN (${error}). Check delivery before sending again.`);
    expect(console.error).toHaveBeenCalledWith("[report] parent email failed", "report-1", "unknown", error);

    // Nothing sends it again automatically, and the token in the email that may have gone keeps working.
    await run(mail, book);
    expect(mail.delivered).toHaveLength(2);
    expect(book.entry(PARENT_EMAIL)).toMatchObject({ state: "unknown", claims: 1, fields: { unsubscribe_hash: sha256(token) } });
  });

  it("releases the claim of a refused parent email: the alert says it was not sent, and a later run sends it", async () => {
    fakeStore();
    const mail = memoryTransport();
    const book = memoryReportLedger();
    mail.answerNext("refuse");
    await run(mail, book);
    expect(mail.delivered.map((m) => m.to)).toEqual(["savar@unicalearning.com"]);
    expect(mail.delivered[0].text).toContain("Parent email: NOT SENT (Resend answered 422: refused in the test). Send the report link by hand.");
    expect(book.entry(PARENT_EMAIL)).toMatchObject({ state: "refused", error: "Resend answered 422: refused in the test" });

    await run(mail, book);
    // Savar gets one alert for the report; the parent gets the report once.
    expect(mail.delivered.map((m) => m.to)).toEqual(["savar@unicalearning.com", "priya@family.ca"]);
    expect(book.entry(PARENT_EMAIL)).toMatchObject({ state: "sent", claims: 2, error: null });
  });

  it("sends one parent email and one alert when two runs go at the same time", async () => {
    fakeStore();
    const mail = memoryTransport();
    const book = memoryReportLedger();
    await Promise.all([run(mail, book), run(mail, book)]);
    expect(mail.delivered.map((m) => m.to).sort()).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
    expect(mail.delivered.find((m) => m.to === "savar@unicalearning.com")?.text).toContain("Parent email: sent to priya@family.ca");
  });

  it("stops when another run holds the parent email's claim: that run sends the alert", async () => {
    fakeStore();
    const mail = memoryTransport();
    const book = memoryReportLedger();
    // Another run claimed the parent email and is sending it now.
    expect(await book.ledger.claim(PARENT_EMAIL, { unsubscribe_hash: "h1" })).not.toBeNull();
    await run(mail, book);
    expect(mail.delivered).toEqual([]);
    expect(book.entry(ALERT)).toBeUndefined();
  });

  it("sends the alert that did not go on a later run, without a second parent email", async () => {
    fakeStore();
    const mail = memoryTransport();
    const book = memoryReportLedger();
    mail.answerNext("deliver", "refuse");
    await run(mail, book);
    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca"]);
    expect(book.entry(ALERT)).toMatchObject({ state: "refused" });

    await run(mail, book);
    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
    expect(mail.delivered[1].text).toContain("Parent email: sent to priya@family.ca");
  });

  it("sends no alert when no alert address is set", async () => {
    vi.stubEnv("SIGNUP_NOTIFY_EMAIL", "");
    fakeStore();
    const mail = memoryTransport();
    const book = memoryReportLedger();
    await run(mail, book);
    expect(mail.delivered.map((m) => m.to)).toEqual(["priya@family.ca"]);
    expect(book.entry(ALERT)).toBeUndefined();
  });
});

describe("a report step that fails", () => {
  it("alerts Savar without a send key, so each failed run alerts again; the job does not throw", async () => {
    fakeStore({ parent: null });
    const mail = memoryTransport();
    const book = memoryReportLedger();
    await expect(run(mail, book)).resolves.toBeUndefined();
    await run(mail, book);
    expect(mail.delivered).toHaveLength(2);
    for (const alert of mail.delivered) {
      expect(alert).toMatchObject({ sender: { to: "savar", testSenderName: "Unica Learning reports" }, to: "savar@unicalearning.com", subject: "Report FAILED for assessment 000000" });
      expect(alert.text).toContain("The report step failed: parent or child not found");
    }
    expect(book.entry(PARENT_EMAIL)).toBeUndefined();
    expect(network).toEqual([]);
  });

  it("alerts Savar when a claim cannot be written; nothing goes to the parent", async () => {
    fakeStore();
    const mail = memoryTransport();
    const book = memoryReportLedger();
    const broken: ReportLedger<string> = { ...book.ledger, claim: async () => { throw new Error("claim emailed_at: database down"); } };
    await expect(runReportJob("000000", ORIGIN, { reviewer: null, transport: mail.transport, ledger: broken })).resolves.toBeUndefined();
    expect(mail.delivered.map((m) => [m.to, m.subject])).toEqual([["savar@unicalearning.com", "Report FAILED for assessment 000000"]]);
    expect(mail.delivered[0].text).toContain("The report step failed: claim emailed_at: database down");
  });
});
