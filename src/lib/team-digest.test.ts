import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { adVisitRow } from "@/lib/ad-visits";
import { usageRow } from "@/lib/ai-usage";
import type { Database } from "@/lib/database";
import { memoryTransport } from "@/lib/email-delivery-memory";
import { buildTeamDigest, campaignLabel, digestDay, digestPeriod, readFrom, teamDigestEmail, type TeamDigestRows } from "@/lib/team-digest";
import { emptyDigestRows, memoryTeamDigestStore } from "@/lib/team-digest-memory";
import { runTeamDigest } from "@/lib/team-digest-send";
import { teamDigestStore } from "@/lib/team-digest-store";

vi.mock("server-only", () => ({}));

// The team's daily digest (docs/team-digest.md) through its builder, its run and the in-memory store, with a passed-in clock.
const ORIGIN = "https://unicalearning.com";
const TO = "team@unicalearning.com";
/** 2026-11-<day> at hh:mm in Vancouver (permanent PDT, UTC-7, as the family time rules have it). */
const pt = (day: number, hh: number, mm = 0) => Date.UTC(2026, 10, day, hh + 7, mm);
const iso = (ms: number) => new Date(ms).toISOString();
// 2026-11-12 is a Thursday, 2026-11-13 a Friday.
const THURSDAY = "2026-11-12";
const FRIDAY = "2026-11-13";

const REAL = "11111111-aaaa-4aaa-8aaa-000000000001";
const TEST = "22222222-bbbb-4bbb-8bbb-000000000002";
const ADMIN = "33333333-cccc-4ccc-8ccc-000000000003";
const CHILD = "44444444-dddd-4ddd-8ddd-000000000004";

function rows(patch: Partial<TeamDigestRows>): TeamDigestRows {
  return { ...emptyDigestRows(), testFamilies: [TEST, ADMIN], ...patch };
}

describe("the digest period", () => {
  it("covers 7 a.m. Pacific the day before up to 7 a.m. Pacific, and adds the weeks on a Friday only", () => {
    const thu = digestPeriod(THURSDAY);
    expect([thu.from, thu.to]).toEqual([pt(11, 7), pt(12, 7)]);
    expect(thu.week).toBeNull();
    expect(readFrom(thu)).toBe(pt(11, 7));
    const fri = digestPeriod(FRIDAY);
    expect(fri.week).toEqual({ from: pt(6, 7), to: pt(13, 7), previousFrom: Date.UTC(2026, 9, 30, 14) });
    expect(readFrom(fri)).toBe(fri.week!.previousFrom);
  });
  it("is due from 7 a.m. Pacific", () => {
    expect(digestDay(pt(13, 6, 59))).toEqual({ day: FRIDAY, due: false });
    expect(digestDay(pt(13, 7))).toEqual({ day: FRIDAY, due: true });
  });
});

describe("the digest builder", () => {
  it("on an empty day says nothing is new and has no sections", () => {
    const d = buildTeamDigest(emptyDigestRows(), digestPeriod(THURSDAY));
    expect(d.sections).toEqual([]);
    expect(d.quiet).toBe(true);
    expect(d.week).toBeNull();
    const email = teamDigestEmail(d, ORIGIN);
    expect(email.subject).toBe("Unica daily digest 2026-11-12: nothing new");
    expect(email.text).toContain("Nothing new in the last day");
  });

  it("leaves test and admin families out of the family signals, and keeps only the period", () => {
    const at = iso(pt(12, 3));
    const d = buildTeamDigest(rows({
      signups: [{ parentId: REAL, at }, { parentId: TEST, at }, { parentId: ADMIN, at }, { parentId: REAL, at: iso(pt(10, 9)) }],
      finishedTests: [{ id: "aaaaaaaa-0000-4000-8000-000000000001", parentId: TEST, at }],
      feedback: [{ parentId: TEST, status: "new", at }],
      workbookRuns: [{ id: "rrrrrrrr-0000-4000-8000-000000000001", childId: CHILD, parentId: TEST, status: "failed", at }],
      planStates: [{ childId: CHILD, parentId: TEST, kind: "payment_failed", eventAt: at }],
    }), digestPeriod(THURSDAY));
    expect(d.sections.map((s) => s.title)).toEqual(["New families"]);
    expect(d.sections[0].lines).toEqual([
      { text: "1 new parent signup", path: "/admin/dashboard" },
      { text: "Family 11111111", path: `/admin/parents/${REAL}` },
    ]);
  });

  it("keeps every safety alert, marks a test family's, and links each signal to its admin page", () => {
    const at = iso(pt(12, 1));
    const d = buildTeamDigest(rows({
      safetyAlerts: [{ callId: "cccccccc-0000-4000-8000-00000000000c", parentId: TEST, level: "safety_immediate", at }],
      emailProblems: [{ type: "bounced", parentId: REAL, at }, { type: "bounced", parentId: null, at }, { type: "complained", parentId: REAL, at }],
      feedback: [{ parentId: REAL, status: "new", at }, { parentId: REAL, status: "new", at }],
      scanWaiting: 3,
      workbookRuns: [{ id: "rrrrrrrr-0000-4000-8000-000000000001", childId: CHILD, parentId: REAL, status: "stale", at }],
      book1Pending: [{ draftId: "dddddddd-0000-4000-8000-000000000001", childId: CHILD, parentId: REAL, reason: "no-planning-capture", at }],
      planStates: [{ childId: CHILD, parentId: REAL, kind: "payment_failed", eventAt: iso(pt(1, 1)) }],
      planStarts: [{ parentId: REAL, state: "open", startedAt: iso(pt(10, 1)), finishedAt: null }, { parentId: REAL, state: "open", startedAt: iso(pt(12, 5)), finishedAt: null }],
      adVisits: [{ visitId: "v1", campaign: "bc-launch-test", at }, { visitId: "v2", campaign: "bc-launch-test", at }, { visitId: "v3", campaign: null, at }],
      adSteps: [{ visitId: "v1", step: "start_open", at }, { visitId: "v1", step: "code_sent", at }],
      aiUsage: [{ feature: "maya", provider: "openrouter", costUsd: 0.5, calls: 2, at }, { feature: "workbook", provider: "subscription", costUsd: null, calls: 1, at }],
    }), digestPeriod(THURSDAY));
    const section = (title: string) => d.sections.find((s) => s.title === title)!.lines;
    expect(section("Maya safety alerts")).toEqual([{ text: "immediate safety (test family), call cccccccc", path: "/admin/maya/cccccccc-0000-4000-8000-00000000000c" }]);
    expect(section("Email delivery problems")).toEqual([
      { text: "2 emails bounced", path: "/admin/emails" }, { text: "1 email marked as spam", path: "/admin/emails" },
    ]);
    expect(section("Parent feedback")).toEqual([{ text: "2 messages from 1 family", path: "/admin/feedback" }]);
    expect(section("Plans")).toEqual([
      { text: "Payment failed (now), child 44444444", path: `/admin/children/${CHILD}` },
      { text: "1 plan start open for more than 24 hours", path: "/admin/next-steps" },
    ]);
    expect(section("Waiting for the team").map((l) => l.path)).toEqual(["/admin/scans", "/admin/workbooks/runs/rrrrrrrr-0000-4000-8000-000000000001", "/admin/next-steps"]);
    expect(section("Ad visits by campaign").map((l) => l.text)).toEqual(["bc-launch-test: 2 visits, 1 opened /start, 1 got an email code", "(no campaign): 1 visit"]);
    expect(section("AI cost").map((l) => l.text)).toEqual([
      "USD 0.50 for 2 calls with a reported cost", "1 subscription call, no per-call charge", "maya: USD 0.50 for 2 calls", "workbook: 1 subscription call",
    ]);
    expect(d.quiet).toBe(false);
  });

  it("adds This week on a Friday: totals against the week before, and the rule-made things to look at", () => {
    const thisWeek = iso(pt(10, 12));
    const lastWeek = iso(pt(3, 12));
    const many = (n: number, at: string, parentId = REAL) => Array.from({ length: n }, () => ({ parentId, at }));
    const d = buildTeamDigest(rows({
      signups: [...many(2, thisWeek), ...many(6, lastWeek), ...many(9, thisWeek, TEST)],
      emailProblems: [{ type: "failed", parentId: REAL, at: thisWeek }, { type: "failed", parentId: REAL, at: thisWeek }, { type: "bounced", parentId: null, at: thisWeek }],
      aiUsage: [{ feature: "maya", provider: "openrouter", costUsd: 9, calls: 10, at: thisWeek }, { feature: "maya", provider: "openrouter", costUsd: 2, calls: 3, at: lastWeek }],
      adVisits: Array.from({ length: 20 }, (_, i) => ({ visitId: `w${i}`, campaign: "bc-round-3", at: thisWeek })),
    }), digestPeriod(FRIDAY));
    expect(d.weekly).toBe(true);
    expect(d.week!.current).toMatchObject({ signups: 2, finishedTests: 0, emailProblems: 3, adVisits: 20, adCodesSent: 0, aiCostUsd: 9 });
    expect(d.week!.previous).toMatchObject({ signups: 6, aiCostUsd: 2 });
    expect(d.week!.lookAt.map((l) => l.text)).toEqual([
      "2 families signed up this week and none finished a test.",
      "Signups fell from 6 to 2.",
      "3 emails had a delivery problem this week (last week 0).",
      "AI cost rose to USD 9.00 from USD 2.00.",
      'Campaign "bc-round-3" had 20 or more visits this week and no email code was sent.',
    ]);
    const email = teamDigestEmail(d, ORIGIN);
    expect(email.subject).toContain("with this week");
    expect(email.text).toContain("THIS WEEK");
    expect(email.text).toContain("- New parent signups: 2 (6)");
    expect(email.text).toContain(`THINGS TO LOOK AT\n- 2 families signed up this week and none finished a test: ${ORIGIN}/admin/dashboard`);
    expect(email.html).toContain("<h3 style=\"margin:24px 0 6px;font-size:15px\">This week</h3>");
  });

  it("puts no child name, parent email or message text in the email: the rows carry none, and the output holds only ids and counts", () => {
    const at = iso(pt(12, 2));
    // Extra fields a careless reader might pass through must not reach the email.
    const leaky = { parentId: REAL, status: "new", at, text: "My child Emma cannot log in", email: "parent@example.com", name: "Emma" };
    const d = buildTeamDigest(rows({ feedback: [leaky], signups: [leaky], finishedTests: [{ ...leaky, id: "aaaaaaaa-0000-4000-8000-000000000001" }] }), digestPeriod(FRIDAY));
    const email = teamDigestEmail(d, ORIGIN);
    for (const part of [email.subject, email.text, email.html]) {
      expect(part).not.toMatch(/Emma|example\.com|cannot log in|@/);
    }
  });

  it("never prints a campaign outside our tag style, and says when a read hit its row limit", () => {
    const at = iso(pt(12, 2));
    const d = buildTeamDigest(rows({ adVisits: [{ visitId: "x", campaign: "<b>x</b>", at }], capped: ["AI usage"] }), digestPeriod(THURSDAY));
    const email = teamDigestEmail(d, ORIGIN);
    expect(email.text).toContain("(other tagged visits): 1 visit");
    expect(email.html + email.text).not.toMatch(/<b>x|&lt;b&gt;/);
    expect(email.text).toContain("The AI usage read stopped at its row limit");
  });
});

describe("the digest run", () => {
  const setup = (data = emptyDigestRows()) => {
    const mail = memoryTransport();
    const db = memoryTeamDigestStore(data);
    const run = (now: number, enabled: string | undefined = "on") => runTeamDigest(db.store, now, { enabled, to: TO, origin: ORIGIN, transport: mail.transport });
    return { mail, db, run };
  };

  it("is off unless TEAM_DIGEST_EMAIL_ENABLED is exactly on: no read, no claim, no email", async () => {
    for (const enabled of [undefined, "", "true", "ON", " on"]) {
      const { mail, db } = setup();
      expect(await runTeamDigest(db.store, pt(12, 9), { enabled, to: TO, origin: ORIGIN, transport: mail.transport })).toEqual({ status: "off" });
      expect(db.reads).toHaveLength(0); expect(db.days.size).toBe(0); expect(mail.delivered).toHaveLength(0);
    }
  });

  it("waits for 7 a.m. Pacific, then sends once a day even when the run repeats every 15 minutes", async () => {
    const { mail, db, run } = setup();
    expect(await run(pt(12, 6, 45))).toEqual({ status: "too_early" });
    expect(await run(pt(12, 7, 5))).toEqual({ status: "sent", weekly: false });
    expect(await run(pt(12, 7, 20))).toEqual({ status: "already_sent" });
    expect(mail.delivered).toHaveLength(1);
    expect(mail.delivered[0]).toMatchObject({ to: TO, subject: "Unica daily digest 2026-11-12: nothing new" });
    expect(db.days.get(THURSDAY)).toMatchObject({ state: "sent", weekly: false });
    expect(db.reads).toEqual([{ from: pt(11, 7), to: pt(12, 7) }]);
  });

  it("reads two weeks on a Friday and marks the claim weekly", async () => {
    const { db, run } = setup();
    expect(await run(pt(13, 8))).toEqual({ status: "sent", weekly: true });
    expect(db.reads).toEqual([{ from: digestPeriod(FRIDAY).week!.previousFrom, to: pt(13, 7) }]);
    expect(db.days.get(FRIDAY)?.weekly).toBe(true);
  });

  it("gives the day back after a refused send, and keeps it after an unknown one", async () => {
    const refused = setup();
    refused.mail.answerNext("refuse");
    expect(await refused.run(pt(12, 8))).toEqual({ status: "refused", weekly: false });
    expect(refused.db.days.size).toBe(0);
    expect(await refused.run(pt(12, 8, 15))).toEqual({ status: "sent", weekly: false });

    const lost = setup();
    lost.mail.answerNext("lose_answer");
    expect(await lost.run(pt(12, 8))).toEqual({ status: "unknown", weekly: false });
    expect(await lost.run(pt(12, 8, 15))).toEqual({ status: "already_sent" });
    expect(lost.mail.delivered).toHaveLength(1);
  });
});

// The database reader on a fixture that answers each table with its rows (filters are not applied: the reader's own rules are
// what these tests prove).
function fixtureReader(tables: Record<string, unknown[]>) {
  const db = createClient<Database>("https://fixture.invalid", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const table = new URL(String(input)).pathname.split("/").pop()!;
      if (table === "scan_team_waiting_count") return Response.json(0);
      return Response.json(tables[table] ?? []);
    } },
  });
  const period = digestPeriod(FRIDAY);
  return { period, read: () => teamDigestStore(db).read(readFrom(period), period.to) };
}

describe("the review findings of PR #999", () => {
  const at = iso(pt(12, 9));

  it("never prints public campaign text that is not in our tag style, in either body", async () => {
    // Wrong if: a name, an email address or a message typed into utm_campaign reaches the email.
    const privateText = "Emma parent@example.com cannot log in";
    const accepted = adVisitRow({ visitId: REAL, utm_source: "meta", utm_campaign: privateText });
    expect(accepted?.utm_campaign).toBe(privateText);
    const fixture = fixtureReader({ ad_visits: [{ id: 1, ...accepted, visited_at: at }] });
    const email = teamDigestEmail(buildTeamDigest(await fixture.read(), fixture.period), ORIGIN);
    expect(email.text + email.html).not.toMatch(/Emma|example\.com|cannot log in|parent@/);
    expect(email.text).toContain("(other tagged visits): 1 visit");
    for (const ok of ["bc-launch-test", "bc_fee_research_20261101", "door-to-door"]) expect(campaignLabel(ok)).toBe(ok);
    for (const bad of ["Emma", "a@b.co", "two words", "x".repeat(41), "<b>", "emma-watson", "my-child-emma-needs-help"]) expect(campaignLabel(bad)).toBe("(other tagged visits)");
    expect(campaignLabel("  ")).toBe("(no campaign)");
  });

  it("leaves out an email problem whose copy belongs to a test family, and keeps one with no known family", async () => {
    const fixture = fixtureReader({
      test_accounts: [{ parent_id: TEST }],
      email_copies: [{ id: "copy1", parent_id: TEST, email_id: "email1" }, { id: "copy2", parent_id: REAL, email_id: "email2" }],
      email_events: [
        { id: "e1", email_id: "email1", type: "bounced", occurred_at: at },
        { id: "e2", email_id: "email2", type: "failed", occurred_at: at },
        { id: "e3", email_id: "email3", type: "bounced", occurred_at: at },
      ],
    });
    const d = buildTeamDigest(await fixture.read(), fixture.period);
    expect(d.sections.find((s) => s.title === "Email delivery problems")!.lines.map((l) => l.text)).toEqual(["1 email bounced", "1 email failed"]);
    expect(d.week!.current.emailProblems).toBe(2);
  });

  it("shows a Book 1 record only for the draft's newest approved revision with no baseline", async () => {
    const draft = "55555555-dddd-4ddd-8ddd-000000000005";
    const other = "66666666-dddd-4ddd-8ddd-000000000006";
    const pending = (draftId: string, revision: number) => ({ draft_id: draftId, revision, child_id: CHILD, parent_id: REAL, reason: "planning-capture-missing", created_at: at });
    const approved = (id: number, workbookId: string, revision: number) => ({ id, workbook_id: workbookId, action: "workbook-approved", detail: { revision }, at });
    // draft: revision 1 pending, then revision 2 approved and its baseline saved. other: revision 3 is still the newest.
    const fixture = fixtureReader({
      workbook_book1_baseline_pending: [pending(draft, 1), pending(other, 3)],
      workbook_audit: [approved(1, draft, 1), approved(2, draft, 2), approved(3, other, 3)],
      workbook_book1_baselines: [{ id: "b1", draft_id: draft, draft_revision: 2 }],
    });
    const rows = await fixture.read();
    expect(rows.book1Pending.map((b) => b.draftId)).toEqual([other]);
    const saved = fixtureReader({
      workbook_book1_baseline_pending: [pending(other, 3)],
      workbook_audit: [approved(3, other, 3)],
      workbook_book1_baselines: [{ id: "b2", draft_id: other, draft_revision: 3 }],
    });
    expect((await saved.read()).book1Pending).toEqual([]);
  });

  it("never shows an unknown API cost as zero dollars, and labels subscription calls", async () => {
    const api = usageRow({ feature: "maya" }, { provider: "openrouter", model: "test-model", costUsd: null, calls: 15 });
    const sub = usageRow({ feature: "workbook" }, { provider: "subscription", model: "claude", costUsd: null, calls: 4 });
    const paid = usageRow({ feature: "report" }, { provider: "openrouter", model: "test-model", costUsd: 0.25, calls: 1 });
    const fixture = fixtureReader({ ai_usage_events: [{ id: 1, ...api, created_at: at }, { id: 2, ...sub, created_at: at }, { id: 3, ...paid, created_at: at }] });
    const d = buildTeamDigest(await fixture.read(), fixture.period);
    const email = teamDigestEmail(d, ORIGIN);
    expect(email.text).toContain("USD 0.25 for 1 call with a reported cost");
    expect(email.text).toContain("15 calls with no cost reported: the total leaves them out");
    expect(email.text).toContain("4 subscription calls, no per-call charge");
    expect(email.text).not.toMatch(/USD 0\.00 for/);
    expect(d.week!.current).toMatchObject({ aiCostUsd: 0.25, aiUnpricedCalls: 15 });
    expect(email.text).toContain("- AI calls with no cost reported: 15 (0)");
  });

  it("counts only the week's new families in the finished-test rules", () => {
    const thisWeek = iso(pt(10, 12));
    const signups = Array.from({ length: 4 }, (_, i) => ({ parentId: `new-${i}`, at: thisWeek }));
    const older = buildTeamDigest(rows({ signups, finishedTests: [{ parentId: REAL, id: "old-family-test", at: thisWeek }] }), digestPeriod(FRIDAY));
    expect(older.week!.current).toMatchObject({ finishedTests: 1, newFamiliesTested: 0 });
    expect(older.week!.lookAt[0].text).toBe("4 families signed up this week and none finished a test.");
    const one = buildTeamDigest(rows({ signups, finishedTests: [{ parentId: "new-0", id: "t1", at: thisWeek }, { parentId: "new-0", id: "t2", at: thisWeek }] }), digestPeriod(FRIDAY));
    expect(one.week!.lookAt[0].text).toBe("Only 1 of 4 new families finished a test this week.");
  });
});
