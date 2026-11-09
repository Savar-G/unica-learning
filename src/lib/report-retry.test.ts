import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StartTest } from "@/components/account";
import { createSession, storedTest, type ComparisonTest } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { memoryTransport } from "@/lib/email-delivery-memory";
import { memoryLearnerProfileStore } from "@/lib/learner-profile-memory";
import { listChildren } from "@/lib/parent-view";
import { memoryParentViewReaders } from "@/lib/parent-view-memory";
import { runReportJob } from "@/lib/report-job";
import { memoryReportJobStore } from "@/lib/report-job-memory";
import { reportLate } from "@/lib/report-late";
import type { ComparisonRead } from "@/lib/report-loading";
import { memoryReportReaders, type MemoryReportTables } from "@/lib/report-loading-memory";
import { REPORT_RETRY, runReportRetries, type ReportRetryPolicy } from "@/lib/report-retry";
import { memoryReportRetryStore } from "@/lib/report-retry-memory";
import { memoryReportLedger } from "@/lib/report-row-ledger-memory";

// Report retries (#771), through their public interface: the run's part (runReportRetries) over the in-memory retries'
// store, which keeps the rules of migration report_retries, and the report job itself (runReportJob) on the in-memory
// report tables, report row ledger and transport, as the retry route runs it. The clock is the store's, as the
// database's. Parent home's line and the parent's stage are read from the same facts.
vi.mock("server-only", () => ({}));

const ORIGIN = "https://unica.test";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const T0 = Date.parse("2026-11-09T12:00:00Z");

const { asked, placement } = takeTest({ grade: 4, province: "BC" }, 101, knowsUpTo(4));

interface Family {
  test: string;
  parent: string;
  child: string;
  email: string;
  /** Minutes after T0 the test finished. */
  finished: number;
}

const family = (n: number, finished = 0): Family => ({ test: `test-${n}`, parent: `parent-${n}`, child: `child-${n}`, email: `parent${n}@family.ca`, finished });

/**
 * The database in memory with each family's finished test and no report. `failing`: how many times more the report
 * insert of a test fails before it works (Infinity: always). `testFamilies`, `team`: parent ids of test families and
 * team accounts. `policy`: the retry policy.
 */
function world(families: Family[], { testFamilies = [] as string[], team = [] as string[], policy = REPORT_RETRY as ReportRetryPolicy } = {}) {
  let now = T0;
  const tables: MemoryReportTables = {
    reports: [],
    assessments: families.map((f) => ({
      id: f.test, parentId: f.parent, childId: f.child, status: "completed" as const, grade: 4 as const, province: "BC" as const,
      completedAt: new Date(T0 + f.finished * MINUTE).toISOString(), placement, help: "no" as const,
      test: storedTest(createSession({ grade: 4, province: "BC" }, 101)),
    })),
    answers: families.flatMap((f) => asked.map((q, n) => ({
      assessmentId: f.test, position: n, questionId: q.id, response: q.level <= 4 ? q.answer : "no idea", correct: q.level <= 4,
      misconception: null, timeMs: 20_000, workRequired: false, workPath: null, workText: null,
    }))),
    children: families.map((f) => ({ id: f.child, parentId: f.parent, firstName: `Kid ${f.child}` })),
    drawings: [],
  };
  const readers = memoryReportReaders(tables);
  const job = memoryReportJobStore(tables, { reads: readers.reads, parents: families.map((f) => ({ id: f.parent, name: "Pat Lee", email: f.email })) });
  const failing = new Map<string, number>();
  const insert = job.store.insertReport;
  job.store.insertReport = async (r) => {
    const left = failing.get(r.assessmentId) ?? 0;
    if (left > 0) {
      failing.set(r.assessmentId, left - 1);
      throw new Error("report insert: the function was stopped");
    }
    return insert(r);
  };
  const profiles = memoryLearnerProfileStore(tables, { reads: readers.reads });
  const comparison: ComparisonRead = async (assessmentId) => ({
    assessmentId,
    tests: families.map((f): ComparisonTest => ({ id: f.test, childId: f.child, status: "completed", completedAt: new Date(T0).toISOString(), email: f.email, placement })),
  });
  const book = memoryReportLedger({ now: () => now });
  const mail = memoryTransport();
  const retries = memoryReportRetryStore(tables, { now: () => now, parentEmail: book.entry, testFamilies, team, policy });

  /** The report job, as the finish route's after() or the retry route runs it. */
  const job_ = (test: string, o: { email?: boolean; failureAlert?: boolean; mayEmail?: () => Promise<boolean> } = {}) => runReportJob(test, ORIGIN, {
    reader: readers.key(), comparison, store: job.store, profiles: profiles.store, reviewer: null, profileAi: null,
    transport: mail.transport, ledger: book.ledger, ...o,
  });
  /**
   * The job as the retry route runs it: `email` is the caller's flag, which only narrows; the job asks the store again
   * right before the email, by the store's clock.
   */
  const routeJob = (test: string, email: boolean) => job_(test, { email, failureAlert: false, mayEmail: () => retries.store.mayEmail(test) });
  /**
   * One /api/reminders run's part, at `at` minutes after T0. `startsAfter`: minutes between a retry's claim and its job
   * (the route call, the function start): the clock moves on before the job runs.
   */
  const sweep = (at: number, signal = new AbortController().signal, { startsAfter = 0 } = {}) => {
    now = T0 + at * MINUTE;
    return runReportRetries({
      store: retries.store, signal, origin: ORIGIN, transport: mail.transport, alertTo: "savar@unicalearning.com", policy,
      retry: async (test, o) => {
        now += startsAfter * MINUTE;
        await routeJob(test, o.email);
      },
    });
  };
  const sent = (to: string) => mail.delivered.filter((m) => m.to === to);
  const subjects = (start: string) => mail.delivered.filter((m) => m.subject.startsWith(start)).length;
  const reportOf = (test: string) => tables.reports!.filter((r) => r.assessmentId === test);
  return {
    tables, mail, book, retries, failing, sent, subjects, reportOf, sweep, routeJob,
    finish: (test: string) => job_(test),
    setNow: (at: number) => { now = T0 + at * MINUTE; },
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", async () => { throw new Error("no network in this test"); });
  vi.stubEnv("SIGNUP_NOTIFY_EMAIL", "savar@unicalearning.com");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const ALERT_TO = "savar@unicalearning.com";

describe("a finished test with no report row", () => {
  it("is not picked up before the minimum age, so it does not race the finish route's own job", async () => {
    const w = world([family(1)]);
    expect((await w.sweep(9)).due).toBe(0);
    expect(w.reportOf("test-1")).toHaveLength(0);
  });

  it("gets its report and one parent email from the next run, and the team its one report alert; later runs send nothing", async () => {
    const w = world([family(1)]);
    expect(await w.sweep(10)).toMatchObject({ due: 1, retried: 1, emailing: 1 });
    expect(w.reportOf("test-1")).toHaveLength(1);
    expect(w.sent("parent1@family.ca")).toHaveLength(1);
    expect(w.sent(ALERT_TO)).toHaveLength(1);
    const before = w.mail.delivered.length;
    for (const at of [25, 40, 100, 300]) expect((await w.sweep(at)).due).toBe(0);
    expect(w.mail.delivered).toHaveLength(before);
    expect(w.retries.row("test-1")?.attempts).toBe(1);
  });

  it("whose job failed is retried after its delay, and the email goes once; a failed retry alerts no one", async () => {
    const w = world([family(1)]);
    w.failing.set("test-1", 2);
    await w.finish("test-1");
    expect(w.subjects("Report FAILED")).toBe(1);
    expect(await w.sweep(10)).toMatchObject({ retried: 1 });
    expect(w.reportOf("test-1")).toHaveLength(0);
    // The next retry waits its delay.
    expect((await w.sweep(20)).due).toBe(0);
    expect(await w.sweep(25)).toMatchObject({ retried: 1, emailing: 1 });
    expect(w.reportOf("test-1")).toHaveLength(1);
    for (const at of [40, 55, 200]) await w.sweep(at);
    expect(w.sent("parent1@family.ca")).toHaveLength(1);
    expect(w.subjects("Report FAILED")).toBe(1);
    expect(w.subjects("Report still not sent")).toBe(0);
  });

  it("gets one report row and one email when two runs go at the same time", async () => {
    const w = world([family(1)]);
    const results = await Promise.all([w.sweep(10), w.sweep(10)]);
    expect(results.map((r) => r.retried).sort()).toEqual([0, 1]);
    expect(w.reportOf("test-1")).toHaveLength(1);
    expect(w.sent("parent1@family.ca")).toHaveLength(1);
    expect(w.sent(ALERT_TO)).toHaveLength(1);
  });

  it("gets one report row and one email when the finish route's job and a retry go at the same time", async () => {
    const w = world([family(1)]);
    await Promise.all([w.finish("test-1"), w.sweep(10)]);
    expect(w.reportOf("test-1")).toHaveLength(1);
    expect(w.sent("parent1@family.ca")).toHaveLength(1);
    expect(w.sent(ALERT_TO)).toHaveLength(1);
  });

  it("starts nothing once the run's signal ended", async () => {
    const w = world([family(1)]);
    const stop = new AbortController();
    stop.abort();
    expect(await w.sweep(10, stop.signal)).toMatchObject({ due: 0, retried: 0 });
    expect(w.reportOf("test-1")).toHaveLength(0);
  });
});

describe("the report email", () => {
  it("that the provider refused is sent again by a retry, once, and the report alert does not double", async () => {
    const w = world([family(1)]);
    w.mail.answerNext("refuse");
    await w.finish("test-1");
    expect(w.sent("parent1@family.ca")).toHaveLength(0);
    expect(w.book.entry({ report: "report-1", email: "parent" })?.state).toBe("refused");
    expect(await w.sweep(10)).toMatchObject({ retried: 1, emailing: 1 });
    for (const at of [25, 40, 100]) await w.sweep(at);
    expect(w.sent("parent1@family.ca")).toHaveLength(1);
    expect(w.sent(ALERT_TO)).toHaveLength(1);
    expect(w.reportOf("test-1")).toHaveLength(1);
  });

  it.each(["lose_answer", "no_answer"] as const)("whose outcome is unknown (%s) is never sent again", async (answer) => {
    const w = world([family(1)]);
    w.mail.answerNext(answer);
    await w.finish("test-1");
    expect(w.book.entry({ report: "report-1", email: "parent" })?.state).toBe("unknown");
    const parentEmails = w.sent("parent1@family.ca").length;
    for (const at of [10, 25, 55, 120, 600]) expect((await w.sweep(at)).due).toBe(0);
    expect(w.sent("parent1@family.ca")).toHaveLength(parentEmails);
    expect(w.retries.row("test-1")).toBeUndefined();
  });
});

describe("a report that always fails", () => {
  it("stops after the bounded retries, does not hold up a later test, and alerts the team once", async () => {
    const policy = { ...REPORT_RETRY, perRun: 1 };
    const w = world([family(1, 0), family(2, 5)], { policy });
    w.failing.set("test-1", Infinity);
    // The first run takes the older test (perRun 1); its retry fails and moves it back.
    expect(await w.sweep(15)).toMatchObject({ retried: 1 });
    expect(w.retries.row("test-1")?.attempts).toBe(1);
    // The next run takes the later test first: it gets its report and its email.
    await w.sweep(30);
    expect(w.reportOf("test-2")).toHaveLength(1);
    expect(w.sent("parent2@family.ca")).toHaveLength(1);
    // The failing test goes on until its retries are used up, then two runs at once give up once.
    for (let at = 45; at <= 135; at += 15) await w.sweep(at);
    expect(w.retries.row("test-1")?.attempts).toBe(REPORT_RETRY.maxAttempts);
    expect(w.subjects("Report still not sent")).toBe(0);
    // The give-up waits for the last retry's delay.
    const gaveUp = await Promise.all([w.sweep(150), w.sweep(150)]);
    expect(gaveUp.map((r) => r.gaveUp).sort()).toEqual([0, 1]);
    for (let at = 165; at <= 400; at += 15) await w.sweep(at);
    expect(w.retries.row("test-1")?.attempts).toBe(REPORT_RETRY.maxAttempts);
    expect(w.reportOf("test-1")).toHaveLength(0);
    expect(w.subjects("Report still not sent")).toBe(1);
    expect(w.subjects("Report FAILED")).toBe(0);
    expect(w.sent("parent1@family.ca")).toHaveLength(0);
    for (const at of [500, 2000]) expect((await w.sweep(at)).due).toBe(0);
    expect(w.subjects("Report still not sent")).toBe(1);
  });
});

describe("the 48-hour email limit, by the store's clock", () => {
  it("emails a test finished 48 hours minus one minute ago", async () => {
    const w = world([family(1)]);
    expect(await w.sweep(48 * 60 - 1)).toMatchObject({ retried: 1, emailing: 1 });
    expect(w.sent("parent1@family.ca")).toHaveLength(1);
  });

  it("builds the report with no email for a test finished 48 hours plus one minute ago", async () => {
    const w = world([family(1)]);
    expect(await w.sweep(48 * 60 + 1)).toMatchObject({ retried: 1, emailing: 0 });
    expect(w.reportOf("test-1")).toHaveLength(1);
    expect(w.mail.delivered).toHaveLength(0);
    expect((await w.sweep(48 * 60 + 100)).due).toBe(0);
  });

  it("builds with no email a test still waiting when it passes 48 hours", async () => {
    const w = world([family(1)]);
    w.failing.set("test-1", 1);
    expect(await w.sweep(48 * 60 - 5)).toMatchObject({ retried: 1, emailing: 1 });
    expect(w.reportOf("test-1")).toHaveLength(0);
    expect(await w.sweep(48 * 60 + 10)).toMatchObject({ retried: 1, emailing: 0 });
    expect(w.reportOf("test-1")).toHaveLength(1);
    expect(w.mail.delivered).toHaveLength(0);
  });

  it("sends no email when a retry claimed at 47 h 59 min reaches the send after 48 hours: the rule is asked again at the send", async () => {
    const w = world([family(1)]);
    // Claimed while the email may still go; the job reaches the send 5.7 minutes later.
    expect(await w.sweep(48 * 60 - 1, undefined, { startsAfter: 5.7 })).toMatchObject({ retried: 1, emailing: 1 });
    expect(w.reportOf("test-1")).toHaveLength(1);
    expect(w.mail.delivered).toHaveLength(0);
    expect(w.book.entry({ report: "report-1", email: "parent" })).toBeUndefined();
    // And no later run sends it.
    for (const at of [48 * 60 + 20, 48 * 60 + 200]) expect((await w.sweep(at)).due).toBe(0);
    expect(w.mail.delivered).toHaveLength(0);
  });

  it("sends the email when the send is still inside 48 hours", async () => {
    const w = world([family(1)]);
    expect(await w.sweep(48 * 60 - 10, undefined, { startsAfter: 5.7 })).toMatchObject({ emailing: 1 });
    expect(w.sent("parent1@family.ca")).toHaveLength(1);
  });

  it("sends nothing for a caller's email flag on a test finished more than 48 hours ago", async () => {
    const w = world([family(1)]);
    w.setNow(48 * 60 + 1);
    await w.routeJob("test-1", true);
    expect(w.reportOf("test-1")).toHaveLength(1);
    expect(w.mail.delivered).toHaveLength(0);
  });

  it("does not retry a refused email of a test finished more than 48 hours ago", async () => {
    const w = world([family(1)]);
    w.mail.answerNext("refuse");
    await w.finish("test-1");
    const before = w.mail.delivered.length;
    expect((await w.sweep(48 * 60 + 1)).due).toBe(0);
    expect(w.mail.delivered).toHaveLength(before);
  });
});

describe("test families and team accounts", () => {
  it("get their report built by a retry, with no email", async () => {
    const w = world([family(1), family(2)], { testFamilies: ["parent-1"], team: ["parent-2"] });
    expect(await w.sweep(10)).toMatchObject({ retried: 2, emailing: 0 });
    expect(w.reportOf("test-1")).toHaveLength(1);
    expect(w.reportOf("test-2")).toHaveLength(1);
    expect(w.mail.delivered).toHaveLength(0);
  });

  it("get no email from a caller's email flag at the retry route", async () => {
    const w = world([family(1), family(2), family(3)], { testFamilies: ["parent-1"], team: ["parent-2"] });
    w.setNow(30);
    for (const test of ["test-1", "test-2", "test-3"]) await w.routeJob(test, true);
    expect(["test-1", "test-2", "test-3"].map((t) => w.reportOf(t).length)).toEqual([1, 1, 1]);
    // Only the real family, inside the rule, gets its email.
    expect(w.mail.delivered.filter((m) => m.to !== ALERT_TO).map((m) => m.to)).toEqual(["parent3@family.ca"]);
  });

  it("get no retried email after a refusal", async () => {
    const w = world([family(1)], { testFamilies: ["parent-1"] });
    w.mail.answerNext("refuse");
    await w.finish("test-1");
    expect((await w.sweep(10)).due).toBe(0);
    expect(w.sent("parent1@family.ca")).toHaveLength(0);
  });
});

describe("what the parent sees", () => {
  const wait = { kind: "wait" as const, completedAt: T0, opensAt: T0 + 30 * 24 * HOUR };
  const line = (late: boolean, report?: string) =>
    renderToStaticMarkup(createElement(StartTest, { childId: "child-1", name: "Leah", state: wait, when: "Dec 9", report, late }));

  it("on Parent home: the report comes by email for the first hour, then the late line, and the report link once it exists", () => {
    expect(reportLate(wait, undefined, T0 + HOUR)).toBe(false);
    expect(reportLate(wait, undefined, T0 + HOUR + 1)).toBe(true);
    expect(reportLate(wait, "/account/report/report-1", T0 + 5 * HOUR)).toBe(false);
    expect(reportLate({ kind: "start", retake: false }, undefined, T0 + 5 * HOUR)).toBe(false);
    expect(line(false)).toContain("The report comes by email.");
    expect(line(true)).toContain("taking longer than it should");
    expect(line(true)).not.toContain("comes by email");
    expect(line(false, "/account/report/report-1")).toContain("See the report");
  });

  it("on the dashboard: the stage moves on from the test once a retry stored the report", async () => {
    const w = world([family(1)]);
    const stage = async () => {
      const reader = memoryParentViewReaders({
        children: [{ id: "child-1", parentId: "parent-1", firstName: "Leah", grade: 4, createdAt: "2026-10-01T00:00:00Z" }],
        tests: [{ id: "test-1", parentId: "parent-1", childId: "child-1", province: "BC", status: "completed", startedAt: T0 - HOUR, lastAnswerAt: T0, resumeUntil: T0 + 23 * HOUR, completedAt: T0 }],
        reports: w.tables.reports!.map((r) => ({ id: r.id, parentId: r.parentId, childId: r.childId, assessmentId: r.assessmentId })),
      }).parent("parent-1");
      return (await listChildren(reader, T0 + 2 * HOUR))[0].stage;
    };
    expect(await stage()).toBe("test_running");
    await w.sweep(10);
    expect(await stage()).toBe("report_ready_bc");
  });
});
