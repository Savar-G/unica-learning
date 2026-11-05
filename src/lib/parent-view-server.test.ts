import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { PROFILE_SCHEMA_VERSION, createSession, finish, nextQuestion, reportModel, storedTest, submitAnswer, testAreaAnswers, testStep, type Placement, type Session } from "@/lib/assessment";
import { checked } from "@/lib/assessment/scripted-child";
import { listChildren, readMonthlySummary, readOverview, readWorkbooks } from "@/lib/parent-view";
import { parentViewReader } from "@/lib/parent-view-server";

// The parent view's Supabase reader, through its interface, against a fake PostgREST. It checks what the memory reader
// cannot: the tables and columns asked for, the parent's filter on secret-key reads, and that a failed read throws.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/parent-pin-server", () => ({ pinIsSet: async () => true }));

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const TEST = "33333333-3333-4333-8333-333333333333";
const NOW = Date.parse("2026-11-04T18:00:00Z");
const WORKBOOK = "44444444-4444-4444-8444-444444444444";

function grantedColumns(file: string, table: string): Set<string> {
  const grant = readFileSync(`supabase/migrations/${file}`, "utf8").match(new RegExp(`grant select \\(([^)]+)\\)\\s+on table public\\.${table} to authenticated`, "i"));
  if (!grant) throw new Error(`Missing SELECT grant for ${table}`);
  return new Set(grant[1].split(",").map((c) => c.trim()));
}
const GRANTED: Record<string, Set<string>> = {
  reports: grantedColumns("20261011_add_reports.sql", "reports"),
  assessments: grantedColumns("20261010_add_assessments.sql", "assessments"),
  card_setups: grantedColumns("20261011_add_report_card_waitlist.sql", "card_setups"),
};

const ROWS: Record<string, unknown> = {
  children: [{ id: CHILD, first_name: "Leah", grade: 3 }],
  reports: [{ id: "report-1", child_id: CHILD, assessment_id: TEST, assessment: { province: "BC" } }],
  card_setups: [{ child_id: CHILD }],
  workbook_delivery_receipts: [],
  workbooks: [{ id: WORKBOOK, child_id: CHILD, number: 1, shipped_at: "2026-11-03T04:30:00Z", pdf_path: `${PARENT}/${WORKBOOK}/workbook.pdf` }],
  workbook_delivery_corrections: [],
  workbook_emails: [{ child_id: CHILD, workbook_number: 1, delivery: { method: "mail", carrier: "Canada Post", trackingNumber: "7023", trackingUrl: "https://track.example/7023" } }],
  parents: { time_zone: "America/Toronto", postal: null },
  assessments: [{ id: TEST, child_id: CHILD, seed: 1, status: "completed", started_at: "2026-11-01T00:00:00Z", last_answer_at: "2026-11-01T00:30:00Z", resume_until: "2026-11-02T00:30:00Z", completed_at: "2026-11-01T00:40:00Z", unreliable: null }],
  test_accounts: null,
  admin_users: null,
};

function client(requests: URL[], failing?: string) {
  return createClient<never>("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    const table = url.pathname.replace("/rest/v1/", "");
    if (table === failing) return Response.json({ message: "boom" }, { status: 500 });
    return Response.json(ROWS[table] ?? []);
  } } }) as never;
}
function reader(failing?: string, env: Record<string, string> = {}) {
  const session: URL[] = [];
  const admin: URL[] = [];
  return { session, admin, reader: parentViewReader(client(session, failing), PARENT, client(admin, failing), env) };
}
const tables = (requests: URL[]) => [...new Set(requests.map((u) => u.pathname.replace("/rest/v1/", "")))].sort();

describe("the Supabase reader", () => {
  it("gives the stage from the stored rows, with no plan row as unknown", async () => {
    const r = reader();
    const [child] = await listChildren(r.reader, NOW);
    expect(child).toEqual({ id: CHILD, firstName: "Leah", schoolGrade: 3, stage: "first_book_coming", opensOn: "overview", tabs: ["overview", "workbooks", "assessment", "account"], readOnly: false, currentWorkbook: { number: 1 }, reportIds: ["report-1"], finishedTests: [{ reportId: "report-1", finishedAt: expect.any(Number) }] });
  });
  it("reads only the tables it needs, and no raw profile, event or call table", async () => {
    const r = reader();
    await listChildren(r.reader, NOW);
    expect(tables(r.session)).toEqual(["card_setups", "children", "reports", "workbook_delivery_receipts", "workbooks"]);
    expect(tables(r.admin)).toEqual(["admin_users", "assessments", "test_accounts"]);
  });
  it("keeps the parent's session within the database's column grants", async () => {
    const r = reader();
    await listChildren(r.reader, NOW);
    const select = (table: string) => r.session.find((u) => u.pathname.endsWith(`/${table}`))!.searchParams.get("select")!;
    expect(select("reports")).toBe("id,child_id,assessment_id,assessment:assessments!inner(province)");
    for (const column of ["id", "child_id", "assessment_id"]) expect(GRANTED.reports.has(column)).toBe(true);
    expect(GRANTED.assessments.has("province")).toBe(true);
    expect(select("card_setups")).toBe("child_id");
    for (const column of ["child_id", "card_saved_at"]) expect(GRANTED.card_setups.has(column)).toBe(true);
  });
  it("filters every secret-key read on the signed-in parent", async () => {
    const r = reader();
    await listChildren(r.reader, NOW);
    expect(r.admin.find((u) => u.pathname.endsWith("/assessments"))!.searchParams.get("parent_id")).toBe(`eq.${PARENT}`);
    expect(r.admin.find((u) => u.pathname.endsWith("/test_accounts"))!.searchParams.get("parent_id")).toBe(`eq.${PARENT}`);
  });
  it("asks only for shipped workbooks and saved cards", async () => {
    const r = reader();
    await listChildren(r.reader, NOW);
    expect(r.session.find((u) => u.pathname.endsWith("/workbooks"))!.searchParams.get("status")).toBe("eq.shipped");
    expect(r.session.find((u) => u.pathname.endsWith("/card_setups"))!.searchParams.get("card_saved_at")).toBe("not.is.null");
  });
  it.each(["children", "reports", "card_setups", "workbook_delivery_receipts", "workbooks", "assessments"])("throws when %s fails", async (table) => {
    await expect(listChildren(reader(table).reader, NOW)).rejects.toThrow();
  });
  it("throws without the secret key, so a family never reads as having no tests", async () => {
    await expect(listChildren(parentViewReader(client([]), PARENT, null, {}), NOW)).rejects.toThrow("no secret key");
  });
  it("turns Progress on only with its server switch", async () => {
    expect((await listChildren(reader(undefined, { PROGRESS_TAB_ENABLED: "on" }).reader, NOW))[0].tabs).toContain("progress");
    expect((await listChildren(reader(undefined, { PROGRESS_TAB_ENABLED: "off" }).reader, NOW))[0].tabs).not.toContain("progress");
  });
});

describe("the Supabase reader of the Workbooks tab (#558)", () => {
  it("gives the current book, its tracking and the range, in family time", async () => {
    const view = await readWorkbooks(reader().reader, CHILD, NOW);
    expect(view?.current).toEqual({ id: WORKBOOK, number: 1, shippedOn: "2026-11-02", deliveredOn: null, delivery: { method: "mail", carrier: "Canada Post", trackingNumber: "7023", trackingUrl: "https://track.example/7023" } });
    expect(view?.next).toEqual({ kind: "range", earliest: "2026-11-16", latest: "2026-12-07" });
    expect(view?.books).toEqual([{ id: WORKBOOK, number: 1, shippedOn: "2026-11-02", hasPdf: true }]);
  });
  it("reads books, deliveries and the family with the parent's session, and only the dispatch details with the secret key, filtered on the parent", async () => {
    const r = reader();
    await readWorkbooks(r.reader, CHILD, NOW);
    expect(tables(r.session)).toEqual(["card_setups", "children", "parents", "reports", "workbook_delivery_corrections", "workbook_delivery_receipts", "workbooks"]);
    expect(tables(r.admin)).toEqual(["admin_users", "assessments", "test_accounts", "workbook_emails"]);
    const emails = r.admin.find((u) => u.pathname.endsWith("/workbook_emails"))!.searchParams;
    expect(emails.get("select")).toBe("child_id,workbook_number,delivery");
    expect(emails.get("parent_id")).toBe(`eq.${PARENT}`);
    expect(emails.get("kind")).toBe("eq.dispatch");
    expect(r.session.find((u) => u.pathname.endsWith("/workbooks"))!.searchParams.get("status")).toBe("eq.shipped");
  });
  it.each(["workbook_delivery_corrections", "workbook_emails", "parents"])("throws when %s fails", async (table) => {
    await expect(readWorkbooks(reader(table).reader, CHILD, NOW)).rejects.toThrow();
  });
});

describe("the Supabase reader of the Overview (#560)", () => {
  /** A whole test. The first `rushed` answers are wrong and very fast, which leaves them out of the score (#189). */
  const take = (rushed = 0): Session => {
    let session = createSession({ grade: 3, province: "BC" }, 7);
    let n = 0;
    for (let step = testStep(session); step.status === "question"; step = testStep(session)) {
      const q = nextQuestion(session)!;
      const fast = n < rushed;
      session = checked(submitAnswer(session, { questionId: step.question.id, response: fast ? "wrong" : n % 3 === 0 ? "0" : q.answer, timeMs: fast ? 100 : 9_000 }));
      n++;
    }
    return session;
  };
  /** The report the report job made from a stored score. */
  const modelOf = (placement: Placement) => reportModel(placement, { workReviews: [] });
  const scored = (session: Session, over: Record<string, unknown> = {}, model = modelOf(finish(session))) => ({
    reports: [{ id: "report-1", child_id: CHILD, assessment_id: TEST, assessment: { province: "BC" }, model }],
    assessments: [{ ...(ROWS.assessments as object[])[0], test: storedTest(session), route: session.route, break_started_at: null, break_ended_at: null, help: null, placement: finish(session) }],
    answers: session.answers.map((a) => ({ question_id: a.questionId, response: a.response, time_ms: a.timeMs })),
    ...over,
  });
  function overviewReader(rows: Record<string, unknown>) {
    const children = [{ ...(ROWS.children as object[])[0], learning_styles: null, interests: ["space"], learning_note: null, math_feeling: null, learning_goal: null, weekly_time: null }];
    const all: Record<string, unknown> = { ...ROWS, children, ...rows };
    const session: URL[] = [];
    const admin: URL[] = [];
    const fake = (requests: URL[]) => createClient<never>("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      // A count (HEAD) reads its number from this header; no Maya call in these rows.
      return Response.json(all[url.pathname.replace("/rest/v1/", "")] ?? [], { headers: { "content-range": "*/0" } });
    } } }) as never;
    return { session, admin, reader: parentViewReader(fake(session), PARENT, fake(admin), {}) };
  }
  const select = (requests: URL[], table: string) => requests.find((u) => u.pathname.endsWith(`/${table}`))!.searchParams;

  it("replays the stored test with the assessment core and keeps the stored report's level", async () => {
    const session = take();
    const r = overviewReader(scored(session));
    expect(await r.reader.testResult(TEST)).toEqual({ level: modelOf(finish(session)).level, answers: testAreaAnswers(session), unreliable: false });
    expect(select(r.admin, "assessments").get("parent_id")).toBe(`eq.${PARENT}`);
    expect(select(r.admin, "assessments").get("id")).toBe(`eq.${TEST}`);
    expect(select(r.session, "reports").get("select")).toBe("model");
    expect(GRANTED.reports.has("model")).toBe(true);
  });
  it("a replay that agrees with the stored score gives the bars, with rushed answers left out by both", async () => {
    const session = take(4);
    expect(testAreaAnswers(session).length).toBe(session.answers.length - 4);
    const view = await readOverview(overviewReader(scored(session)).reader, CHILD, NOW);
    expect(view?.level?.working).toBe(finish(session).workingLevel);
    expect(view?.areas.length).toBeGreaterThan(0);
  });
  it("a test the report calls unreliable (pace.unreliable) gives no bars on the Overview and in the monthly summary (D-258)", async () => {
    const session = take(16);
    const placement = finish(session);
    expect(placement.pace?.unreliable).toBe(true);
    const rows = { ...scored(session), workbook_delivery_receipts: [{ child_id: CHILD, workbook_id: WORKBOOK, delivered_at: "2026-09-20T18:00:00Z" }] };
    // The replay adds up: only the report's flag takes the bars away.
    expect(await overviewReader(rows).reader.testResult(TEST)).toEqual({ level: modelOf(placement).level, answers: testAreaAnswers(session), unreliable: true });
    const overview = await readOverview(overviewReader(rows).reader, CHILD, NOW);
    expect(overview?.level).toMatchObject({ working: placement.workingLevel, unreliable: true });
    expect(overview?.areas).toEqual([]);
    const summary = await readMonthlySummary(overviewReader(rows).reader, CHILD, "2026-10", NOW);
    expect(summary?.level?.unreliable).toBe(true);
    expect(summary?.areas).toEqual([]);
  });
  it("a score stored before the rushing rule differs from the replay: the Level tile stays and no bar shows", async () => {
    const session = take(4);
    // As a test stored before #189: the report counted the rushed answers, and the stored score has no pace.
    const counted = finish({ ...session, answers: session.answers.map((a) => ({ ...a, timeMs: 9_000 })) });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const old = { ...counted, pace: undefined };
    const r = overviewReader(scored(session, { assessments: [{ ...scored(session).assessments[0], placement: old }] }, modelOf(old)));
    expect(await r.reader.testResult(TEST)).toEqual({ level: modelOf(old).level, answers: null, unreliable: false });
    const view = await readOverview(r.reader, CHILD, NOW);
    expect(view?.level?.working).toBe(old.workingLevel);
    expect(view?.areas).toEqual([]);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it("a test with no stored score has no bars", async () => {
    const session = take();
    const r = overviewReader(scored(session, { assessments: [{ ...scored(session).assessments[0], placement: null }] }));
    expect(await r.reader.testResult(TEST)).toEqual({ level: modelOf(finish(session)).level, answers: null, unreliable: false });
  });
  it("a score stored again after the report was made (a rescore) gives no bars beside the report's older level, on the Overview and the monthly summary", async () => {
    const session = take();
    const now = finish(session);
    // The report was made from an earlier score: Kindergarten, with other counts. The stored score and the replay agree
    // with each other, and not with the report the parent reads.
    const before: Placement = { ...now, workingLevel: 0, confidence: "low", strands: now.strands.map((s) => ({ ...s, correct: 0 })) };
    expect(before.workingLevel).not.toBe(now.workingLevel);
    const rows = { ...scored(session, {}, modelOf(before)), workbook_delivery_receipts: [{ child_id: CHILD, workbook_id: WORKBOOK, delivered_at: "2026-09-20T18:00:00Z" }] };
    const r = overviewReader(rows);
    expect(await r.reader.testResult(TEST)).toEqual({ level: modelOf(before).level, answers: null, unreliable: false });
    const overview = await readOverview(r.reader, CHILD, NOW);
    expect(overview?.level?.working).toBe(0);
    expect(overview?.areas).toEqual([]);
    const summary = await readMonthlySummary(overviewReader(rows).reader, CHILD, "2026-10", NOW);
    expect(summary?.level?.working).toBe(0);
    expect(summary?.areas).toEqual([]);
    // The same rows with the report made from the stored score show the bars.
    const fresh = { ...rows, reports: scored(session).reports };
    expect((await readMonthlySummary(overviewReader(fresh).reader, CHILD, "2026-10", NOW))?.areas.length).toBeGreaterThan(0);
  });
  it("a report whose level matches but whose area counts differ from the stored score gives no bars", async () => {
    const session = take();
    const now = finish(session);
    const other: Placement = { ...now, strands: now.strands.map((s, i) => (i === 0 ? { ...s, total: s.total + 1 } : s)) };
    expect(await overviewReader(scored(session, {}, modelOf(other))).reader.testResult(TEST)).toMatchObject({ answers: null });
  });
  it("reads the stored score with the secret key, filtered on the parent", async () => {
    const r = overviewReader(scored(take()));
    await r.reader.testResult(TEST);
    const score = r.admin.find((u) => u.pathname.endsWith("/assessments") && u.searchParams.get("select") === "placement")!.searchParams;
    expect(score.get("parent_id")).toBe(`eq.${PARENT}`);
    expect(score.get("id")).toBe(`eq.${TEST}`);
    expect(r.session.filter((u) => u.pathname.endsWith("/assessments"))).toEqual([]);
  });
  it("a failed read of the stored score throws", async () => {
    const failing = (requests: URL[]) => createClient<never>("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.searchParams.get("select") === "placement") return Response.json({ message: "boom" }, { status: 500 });
      return Response.json(({ ...ROWS, ...scored(take()) } as Record<string, unknown>)[url.pathname.replace("/rest/v1/", "")] ?? []);
    } } }) as never;
    await expect(parentViewReader(failing([]), PARENT, failing([]), {}).testResult(TEST)).rejects.toThrow("stored score read");
  });
  it("a test the family does not have, or one with no report, is null", async () => {
    expect(await overviewReader(scored(take(), { assessments: [] })).reader.testResult(TEST)).toBeNull();
    expect(await overviewReader(scored(take(), { reports: [] })).reader.testResult(TEST)).toBeNull();
  });
  it("a stored test that cannot be replayed keeps the level with no answers, and is logged", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = overviewReader(scored(take(), { answers: [] }));
    expect(await r.reader.testResult(TEST)).toEqual({ level: modelOf(finish(take())).level, answers: null, unreliable: false });
    expect(log).toHaveBeenCalledWith("[parent-view] test replay failed", expect.any(String));
    log.mockRestore();
  });
  it("reads saved scans, a workbook's pages and the learning card with the parent's session, and no raw profile, event or call table", async () => {
    const r = overviewReader({
      ...scored(take()),
      scan_photos: [{ workbook_id: WORKBOOK, page_id: "p1", expires_at: "2027-01-01T00:00:00Z", created_at: "2026-10-20T18:00:00Z" }],
      workbook_pages: [{ id: "p1", day_label: "Day 1" }],
      children: [{ id: CHILD, first_name: "Leah", grade: 3, learning_styles: null, interests: ["space"], learning_note: null, math_feeling: null, learning_goal: null, weekly_time: null }],
    });
    expect(await r.reader.savedScans()).toEqual([{ workbookId: WORKBOOK, pageId: "p1", expiresAt: "2027-01-01T00:00:00Z", takenAt: "2026-10-20T18:00:00Z" }]);
    expect(select(r.session, "scan_photos").get("state")).toBe("eq.saved");
    expect(await r.reader.workbookPages(WORKBOOK)).toEqual([{ id: "p1", dayLabel: "Day 1" }]);
    expect(select(r.session, "workbook_pages").get("workbook_id")).toBe(`eq.${WORKBOOK}`);
    expect((await r.reader.learningCards())[0]).toMatchObject({ childId: CHILD, interests: ["space"] });
    await readOverview(r.reader, CHILD, NOW);
    expect(tables(r.session)).toEqual(["card_setups", "children", "parents", "reports", "scan_photos", "workbook_delivery_corrections", "workbook_delivery_receipts", "workbook_pages", "workbooks"]);
    expect(tables(r.admin)).toEqual(["admin_users", "answers", "assessments", "test_accounts"]);
  });
});

describe("the Supabase reader of the monthly summary (#562)", () => {
  // October 2026 in Toronto: from 04:00 UTC on October 1 to 04:00 UTC on November 1.
  const FROM = Date.parse("2026-10-01T04:00:00Z");
  const TO = Date.parse("2026-11-01T04:00:00Z");
  it("counts the child's Maya calls of the month in the database, with the parent's session alone, and reads no row", async () => {
    const asked: { url: URL; method: string; prefer: string | null }[] = [];
    const own = parentViewReader(createClient<never>("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
      asked.push({ url: new URL(String(input)), method: init?.method ?? "GET", prefer: new Headers(init?.headers).get("prefer") });
      // A thousand calls in September would fill a page of rows; a count has no page.
      return new Response(null, { status: 200, headers: { "content-range": "*/1" } });
    } } }) as never, PARENT, null);
    expect(await own.mayaCalls(CHILD, FROM, TO)).toBe(1);
    expect(asked).toHaveLength(1);
    const { url, method, prefer } = asked[0];
    expect(url.pathname).toBe("/rest/v1/maya_minute_grants");
    expect(method).toBe("HEAD");
    expect(prefer).toContain("count=exact");
    expect(url.searchParams.get("kind")).toBe("eq.child");
    expect(url.searchParams.get("child_id")).toBe(`eq.${CHILD}`);
    expect(url.searchParams.get("used_seconds")).toBe("gt.0");
    expect(url.searchParams.getAll("created_at")).toEqual(["gte.2026-10-01T04:00:00.000Z", "lt.2026-11-01T04:00:00.000Z"]);
  });
  it("throws when the ledger cannot be counted", async () => {
    await expect(reader("maya_minute_grants").reader.mayaCalls(CHILD, FROM, TO)).rejects.toThrow("maya calls read");
  });
});

describe("the Supabase reader of the Progress tab (#561)", () => {
  const FINISHED = "2026-10-30T18:00:00Z";
  const profile = { schemaVersion: PROFILE_SCHEMA_VERSION, standards: [{ code: "3.1", text: "number concepts", correct: 2, total: 2, grade: 3, strand: "number", aboveGrade: false, status: "secure", certainty: "clear" }], struggles: [], level: { working: 3 }, unknowns: { earlySigns: { strands: [] } }, test: { grade: 3 }, ai: { likelyCauses: { model: "m", value: { "3.1": "AI-GUESS" } } } };
  function progressClient(requests: URL[], rows: Record<string, unknown>, failing?: string) {
    return createClient<never>("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      const table = url.pathname.replace("/rest/v1/", "");
      if (table === failing) return Response.json({ message: "boom" }, { status: 500 });
      return Response.json(rows[table] ?? []);
    } } }) as never;
  }
  const ADMIN_ROWS = {
    assessments: [{ id: TEST, completed_at: FINISHED }, { id: "open", completed_at: null }],
    learner_profiles: [{ assessment_id: TEST, profile }, { assessment_id: "open", profile }, { assessment_id: "gone", profile }],
    reports: [{ assessment_id: TEST, reliability: null }],
  };

  it("reads the tallies with the secret key, filtered on the parent and the child, and gives only the tally", async () => {
    const admin: URL[] = [];
    const session: URL[] = [];
    const r = parentViewReader(progressClient(session, {}), PARENT, progressClient(admin, ADMIN_ROWS), {});
    expect(await r.skillTests(CHILD)).toEqual([{ standard: "3.1", correct: 2, total: 2, at: new Date(FINISHED).toISOString(), unreliable: false }]);
    expect(session).toEqual([]);
    for (const url of admin) {
      expect(url.searchParams.get("parent_id"), url.pathname).toBe(`eq.${PARENT}`);
      expect(url.searchParams.get("child_id"), url.pathname).toBe(`eq.${CHILD}`);
    }
    expect(admin.find((u) => u.pathname.endsWith("/assessments"))?.searchParams.get("status")).toBe("eq.completed");
  });
  it("marks a tally of a test whose stored report has the reliability note, and reads only that part of the report", async () => {
    const admin: URL[] = [];
    const rows = { ...ADMIN_ROWS, reports: [{ assessment_id: TEST, reliability: { veryFast: 28, answers: 42 } }] };
    const r = parentViewReader(progressClient([], {}), PARENT, progressClient(admin, rows), {});
    expect(await r.skillTests(CHILD)).toEqual([{ standard: "3.1", correct: 2, total: 2, at: new Date(FINISHED).toISOString(), unreliable: true }]);
    expect(admin.find((u) => u.pathname.endsWith("/reports"))?.searchParams.get("select")).toBe("assessment_id,reliability:model->reliability");
  });
  it("reads no child profile, event, history or call table", async () => {
    const admin: URL[] = [];
    const r = parentViewReader(progressClient([], {}), PARENT, progressClient(admin, ADMIN_ROWS), {});
    await r.skillTests(CHILD);
    expect(tables(admin)).toEqual(["assessments", "learner_profiles", "reports"]);
  });
  it("throws with no secret key, and on a failed read", async () => {
    await expect(parentViewReader(progressClient([], {}), PARENT, null, {}).skillTests(CHILD)).rejects.toThrow("no secret key");
    await expect(parentViewReader(progressClient([], {}), PARENT, progressClient([], ADMIN_ROWS, "learner_profiles"), {}).skillTests(CHILD)).rejects.toThrow("learner profiles read");
    await expect(parentViewReader(progressClient([], {}), PARENT, progressClient([], ADMIN_ROWS, "assessments"), {}).skillTests(CHILD)).rejects.toThrow("skill tests read");
    await expect(parentViewReader(progressClient([], {}), PARENT, progressClient([], ADMIN_ROWS, "reports"), {}).skillTests(CHILD)).rejects.toThrow("skill reports read");
  });
  it("reads a workbook's standards through the parent's session, each once, and only the code", async () => {
    const session: URL[] = [];
    const admin: URL[] = [];
    const rows = { workbook_questions: [{ standard: "3.1" }, { standard: "3.1" }, { standard: null }, { standard: "2.1" }] };
    const r = parentViewReader(progressClient(session, rows), PARENT, progressClient(admin, {}), {});
    expect(await r.workbookStandards(WORKBOOK)).toEqual(["3.1", "2.1"]);
    expect(admin).toEqual([]);
    expect(session[0].searchParams.get("select")).toBe("standard:package->skill->>standard");
    expect(session[0].searchParams.get("workbook_id")).toBe(`eq.${WORKBOOK}`);
    await expect(parentViewReader(progressClient([], rows, "workbook_questions"), PARENT, null, {}).workbookStandards(WORKBOOK)).rejects.toThrow("workbook standards read");
  });
});
