import { describe, expect, it } from "vitest";
import {
  EMAIL_KINDS, buildDashboard, buildFamilies, clickable, emailFailed, isTeamEmail, keepsNoCopy, parseEmailId, sendEmailId, workbookEmailId,
  type DashboardRows, type RawSend, type RawWorkbookEmail,
} from "@/lib/admin-dashboard";

// The admin Emails page shows every email the site sends: the send log (public.email_sends), the workbook emails
// (public.workbook_emails), and the team emails about no family, beside the email log and the report emails.

const NOW = new Date("2026-11-15T20:00:00Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const P = "11111111-1111-4111-8111-111111111111";
const K = "22222222-2222-4222-8222-222222222222";

function rows(over: Partial<DashboardRows> = {}): DashboardRows {
  return {
    parents: [{ id: P, created_at: ago(100), name: "Asha Rao", email: "asha@example.com", postal: null, source: null }],
    children: [{ id: K, created_at: ago(100), parent_id: P, first_name: "AARAV", grade: 3, province: "BC" }],
    tests: [], reports: [], cards: [], waitlist: [], emails: [], deliveries: [], subscriptions: [], testIds: [], stripeNote: null, stripeMode: null,
    ...over,
  };
}
const send = (id: string, kind: RawSend["kind"], hours: number, over: Partial<RawSend> = {}): RawSend => ({
  id, created_at: ago(hours), kind, parent_id: P, child_id: null, outcome: "sent", email_id: `re_${id}`, error: null, subject: null, ...over,
});
const workbook = (id: string, kind: RawWorkbookEmail["kind"], hours: number, over: Partial<RawWorkbookEmail> = {}): RawWorkbookEmail => ({
  id, created_at: ago(hours + 1), parent_id: P, child_id: K, kind, status: "sent", attempts: 1, sent_at: ago(hours), email_id: `re_${id}`, error: null, subject: null, ...over,
});

describe("workbook emails", () => {
  // The three rows in production on 2026-11-15: two welcomes and one dispatch notice, sent on 2026-11-13.
  const r = rows({
    workbookEmails: [
      workbook("w1", "welcome", 60, { subject: "Your first workbook with Unica Learning" }),
      workbook("w2", "dispatch", 50, { subject: "AARAV's workbook is on its way" }),
      workbook("w3", "welcome", 70, { status: "skipped", sent_at: null, email_id: null }),
      workbook("w4", "plan_start", 40, { status: "failed", sent_at: null, email_id: null, error: "Resend answered 422", attempts: 2 }),
    ],
  });

  it("lists each sent or tried workbook email in the family, with its stored subject, and leaves out a skipped one", () => {
    const [f] = buildFamilies(r, NOW);
    expect(f.emails.map((e) => [e.id, e.kind, e.status, e.subject])).toEqual([
      [workbookEmailId("w4"), "plan_start", "failed", "Welcome to Unica Learning: how AARAV's free month works"],
      [workbookEmailId("w2"), "workbook_dispatch", "sent", "AARAV's workbook is on its way"],
      [workbookEmailId("w1"), "workbook_welcome", "sent", "Your first workbook with Unica Learning"],
    ]);
    expect(f.emails[0]).toMatchObject({ familyId: P, familyName: "Asha Rao", childName: "AARAV", attempts: 2, error: "Resend answered 422" });
    expect(f.lastEmail?.kind).toBe("plan_start");
  });

  it("counts them on the Emails page and joins their Resend events by their own id", () => {
    const d = buildDashboard({ ...r, deliveries: [{ email_log_id: null, report_id: null, report_email: null, email_ref: workbookEmailId("w2"), type: "delivered", occurred_at: ago(49), detail: null }] }, "all", NOW);
    const kind = (k: string) => d.emailSummary.find((s) => s.kind === k)!;
    expect(kind("workbook_dispatch")).toMatchObject({ sent: 1, failed: 0 });
    expect(kind("workbook_welcome")).toMatchObject({ sent: 1 });
    expect(kind("plan_start")).toMatchObject({ sent: 0, failed: 1 });
    expect(d.real.emails.find((e) => e.id === workbookEmailId("w2"))?.delivery).toEqual({ type: "delivered", at: ago(49), detail: null });
    expect(d.kpis.find((k) => k.key === "emails")?.value).toBe(2);
  });
});

describe("the send log", () => {
  const r = rows({
    sends: [
      send("s1", "signup_welcome", 90, { child_id: K, subject: "Welcome to Unica Learning" }),
      send("s2", "sign_in_link", 80),
      send("s3", "scan_link", 30, { child_id: K, subject: "Take pictures of AARAV's workbook pages", outcome: "refused", email_id: null, error: "EMAIL_FROM is not set" }),
      send("s4", "maya_safety_alert", 20, { subject: "Maya safety flag: read the call today" }),
      send("t1", "team_digest", 10, { parent_id: null, subject: "Unica daily digest 2026-11-15: nothing new" }),
      send("t2", "contact_message", 5, { parent_id: null }),
    ],
    deliveries: [{ email_log_id: null, report_id: null, report_email: null, email_ref: sendEmailId("s2"), type: "bounced", occurred_at: ago(79), detail: "no such user" }],
  });

  it("puts a family's emails in its list and a team email about no family in the Emails page only", () => {
    const [f] = buildFamilies(r, NOW);
    expect(f.emails.map((e) => e.kind)).toEqual(["maya_safety_alert", "scan_link", "sign_in_link", "signup_welcome"]);
    const d = buildDashboard(r, "all", NOW);
    expect(d.emails.map((e) => e.kind)).toEqual(["contact_message", "team_digest", "maya_safety_alert", "scan_link", "sign_in_link", "signup_welcome"]);
    expect(d.real.emails).toHaveLength(6);
    expect(d.emails[1]).toMatchObject({ id: sendEmailId("t1"), familyId: null, familyName: null, subject: "Unica daily digest 2026-11-15: nothing new" });
  });

  it("names an email with no stored subject by its kind, and never counts a click", () => {
    const d = buildDashboard(r, "all", NOW);
    const byKind = Object.fromEntries(d.emails.map((e) => [e.kind, e]));
    expect(byKind.sign_in_link.subject).toBe("Open this on a laptop or tablet so Your child can start");
    expect(byKind.contact_message.subject).toBe("Contact form: name not kept");
    for (const e of d.emails) expect(clickable(e)).toBe(false);
  });

  it("shows a refused send as failed and a bounce as failed, and keeps team emails out of the parent's numbers", () => {
    const d = buildDashboard(r, "all", NOW);
    const byKind = Object.fromEntries(d.emails.map((e) => [e.kind, e]));
    expect(byKind.scan_link).toMatchObject({ status: "failed", state: "refused", error: "EMAIL_FROM is not set" });
    expect(emailFailed(byKind.sign_in_link)).toBe(true);
    expect(d.needs.find((n) => n.title === "Email failed")?.families.map((f) => f.id)).toEqual([P]);
    // The last email to the parent skips the safety alert to the team.
    expect(d.families[0].lastEmail?.kind).toBe("scan_link");
    // Emails to parents: the welcome and the sign-in link went; the refused one and the team emails do not count.
    expect(d.kpis.find((k) => k.key === "emails")?.value).toBe(2);
    expect(d.emailSummary.find((k) => k.kind === "team_digest")).toMatchObject({ sent: 1 });
  });

  it("counts a team email about no family once, also while the test families are listed", () => {
    const d = buildDashboard({ ...r, testIds: [P] }, "all", NOW, { withTests: true });
    expect(d.real.emails.map((e) => e.kind)).toEqual(["contact_message", "team_digest"]);
    expect(d.emails).toHaveLength(6);
  });
});

describe("email kinds", () => {
  it("tells the team emails and the emails that keep no copy apart", () => {
    expect(isTeamEmail("alert")).toBe(true);
    expect(isTeamEmail("team_digest")).toBe(true);
    expect(isTeamEmail("plan_start")).toBe(false);
    expect(isTeamEmail("workbook_dispatch")).toBe(false);
    expect(EMAIL_KINDS.filter((k) => keepsNoCopy(k.kind)).map((k) => k.kind).sort()).toEqual(["child_delete_code", "contact_message", "family_delete_code", "phone_welcome", "sign_in_link", "team_digest"]);
  });

  it("reads every kind of id in the email list, and nothing else", () => {
    expect(parseEmailId(P)).toEqual({ id: P });
    expect(parseEmailId(`${P}:report`)).toEqual({ id: P, which: "report" });
    expect(parseEmailId(`${P}:alert`)).toEqual({ id: P, which: "alert" });
    expect(parseEmailId(sendEmailId(P))).toEqual({ id: P, which: "send" });
    expect(parseEmailId(workbookEmailId(P))).toEqual({ id: P, which: "workbook" });
    for (const bad of [`${P}:other`, `${P}:send:x`, "not-a-uuid:send", ""]) expect(parseEmailId(bad)).toBeNull();
  });
});
