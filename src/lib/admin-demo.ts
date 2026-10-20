// Made-up families for the admin dashboard in local development only (?demo=1, D-099), so the layout can be checked
// with more than a handful of rows and without an admin sign-in. Seeded, so every reload shows the same numbers. No
// real person is in here, and nothing here reads the database.
import { bandFor, type Grade, type Province } from "@/lib/assessment";
import { progressSnapshot, type ProgressInput, type ProgressSnapshot } from "@/lib/admin-progress";
import type { DashboardRows, EmailCopyView, EmailEvent, Family, RawCard, RawDelivery, RawChild, RawEmail, RawParent, RawReport, RawSubscription, RawTest, RawWaitlist } from "@/lib/admin-dashboard";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { reminderEmail } from "@/lib/reminder-email";

const FIRST = ["Priya", "Daniel", "Mei", "Omar", "Sarah", "Arjun", "Lina", "Jason", "Fatima", "Chris", "Aisha", "Kevin", "Nora", "Raj", "Elena", "Tom", "Harpreet", "Grace", "Wei", "Maya"];
const LAST = ["Sandhu", "Chen", "Patel", "Nguyen", "Smith", "Gill", "Kim", "Singh", "Brown", "Ali", "Wong", "Dhillon", "Garcia", "Lee", "Martin"];
const KIDS = ["Ava", "Leo", "Zara", "Noah", "Isha", "Ethan", "Mila", "Aarav", "Sofia", "Kabir", "Emma", "Liam", "Anaya", "Lucas", "Ria", "Owen"];

// mulberry32: a small seeded generator
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoRows(now: Date): DashboardRows {
  const r = rng(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const iso = (ms: number) => new Date(Math.min(ms, now.getTime() - 60_000)).toISOString();
  const H = 3_600_000;
  const out: DashboardRows = { parents: [], children: [], tests: [], reports: [], cards: [], waitlist: [], emails: [], deliveries: [], subscriptions: [], testIds: [], stripeNote: null, stripeMode: "test" };
  // Delivery events (D-104) draw from their own sequence, so the rest of the demo stays the same.
  const rd = rng(7);
  const deliver = (to: Pick<RawDelivery, "email_log_id" | "report_id" | "report_email">, sentMs: number) => {
    const x = rd();
    const type: RawDelivery["type"] = x < 0.04 ? "bounced" : x < 0.05 ? "complained" : "delivered";
    const detail = type === "bounced" ? "Permanent, General: 550 5.1.1 <[address]>: Recipient address rejected" : null;
    if (type === "complained") out.deliveries.push({ ...to, type: "delivered", occurred_at: iso(sentMs + 20_000), detail: null });
    out.deliveries.push({ ...to, type, occurred_at: iso(sentMs + (type === "complained" ? 3 * 3_600_000 : 20_000)), detail });
  };
  let n = 0;
  const id = (p: string) => `${p}-${(++n).toString().padStart(4, "0")}`;

  for (let i = 0; i < 72; i++) {
    // more signups in recent days
    const daysAgo = Math.floor(Math.pow(r(), 1.4) * 35);
    const created = now.getTime() - daysAgo * 24 * H - r() * 20 * H;
    const pid = id("demo-parent");
    const first = pick(FIRST);
    const parent: RawParent = { id: pid, created_at: iso(created), name: `${first} ${pick(LAST)}`, email: `${first.toLowerCase()}${i}@example.ca`, postal: pick(["V3S", "V4N", "V6B", "V5K", "T2P", "M5V"]) + " 1A1", source: { utm_source: pick(["facebook", "google", "instagram", "friend", "facebook", "google"]) } };
    out.parents.push(parent);
    const province: Province = r() < 0.72 ? "BC" : pick(["AB", "ON", "other"] as Province[]);
    const kidCount = r() < 0.18 ? 2 : 1;
    const kids: RawChild[] = [];
    for (let k = 0; k < kidCount; k++) {
      const c: RawChild = { id: id("demo-child"), created_at: parent.created_at, parent_id: pid, first_name: KIDS[(i * 3 + k * 7) % KIDS.length], grade: 1 + Math.floor(r() * 7), province };
      kids.push(c);
      out.children.push(c);
    }
    const kid = kids[0];
    const email = (kind: RawEmail["kind"], atMs: number, assessment: string | null, fail = r() < 0.05): void => {
      if (atMs > now.getTime()) return;
      const row: RawEmail = { id: id("demo-email"), created_at: iso(atMs), parent_id: pid, child_id: kid.id, assessment_id: assessment, kind, status: kind === "unsubscribe" ? null : fail ? "failed" : "sent", attempts: fail ? 3 : 1, sent_at: fail || kind === "unsubscribe" ? null : iso(atMs + 60_000), error: fail ? "Resend: rate limit (429)" : null, clicks: 0, first_clicked_at: null };
      // About a third of parents click a reminder (D-105); some come back to it later.
      if (row.status === "sent" && kind !== "unsubscribe" && rd() < 0.35) Object.assign(row, { clicks: rd() < 0.7 ? 1 : 2, first_clicked_at: iso(atMs + (0.2 + rd() * 6) * H) });
      out.emails.push(row);
      if (row.status === "sent") deliver({ email_log_id: row.id, report_id: null, report_email: null }, atMs + 60_000);
    };

    // the funnel
    if (r() > 0.76) {
      email("start", created + 26 * H, null);
      if (r() < 0.5) email("start_followup", created + 72 * H, null);
      if (r() < 0.08) email("unsubscribe", created + 80 * H, null);
      continue;
    }
    const startedMs = created + (r() < 0.6 ? r() * 2 * H : 26 * H + r() * 30 * H);
    if (startedMs > now.getTime()) continue;
    if (startedMs > created + 24 * H) email("start", created + 24 * H, null);
    if (startedMs > created + 72 * H) email("start_followup", created + 72 * H, null);
    const tid = id("demo-test");
    const finishes = r() < 0.72;
    const finishedMs = startedMs + (r() < 0.7 ? 0.4 * H + r() * 0.5 * H : 20 * H + r() * 40 * H);
    const done = finishes && finishedMs < now.getTime();
    const expired = !done && now.getTime() - startedMs > 7 * 24 * H;
    const test: RawTest = { id: tid, created_at: iso(startedMs), status: done ? "completed" : expired ? "expired" : "in_progress", parent_id: pid, child_id: kid.id, grade: kid.grade, province, started_at: iso(startedMs), completed_at: done ? iso(finishedMs) : null, last_answer_at: iso(done ? finishedMs : startedMs + r() * 0.3 * H), answered: done ? 24 + Math.floor(r() * 8) : 3 + Math.floor(r() * 14) };
    out.tests.push(test);
    if (!done) {
      email("continue", startedMs + 24 * H, tid);
      if (r() < 0.5) email("continue", startedMs + 72 * H, tid);
      if (expired) email("come_back", startedMs + 8 * 24 * H, tid);
      continue;
    }
    const report: RawReport = { id: id("demo-report"), created_at: iso(finishedMs + 120_000), assessment_id: tid, parent_id: pid, child_id: kid.id, emailed_at: null, email_error: null, alerted_at: iso(finishedMs + 150_000), alert_error: null, email_clicks: 0, email_first_clicked_at: null };
    if (r() < 0.04) report.email_error = "Resend: 500 internal error";
    else report.emailed_at = iso(finishedMs + 140_000);
    if (report.emailed_at && rd() < 0.6) Object.assign(report, { email_clicks: rd() < 0.6 ? 1 : 3, email_first_clicked_at: iso(finishedMs + (0.5 + rd() * 20) * H) });
    out.reports.push(report);
    if (report.emailed_at) deliver({ email_log_id: null, report_id: report.id, report_email: "parent" }, finishedMs + 140_000);
    deliver({ email_log_id: null, report_id: report.id, report_email: "alert" }, finishedMs + 150_000);

    if (province !== "BC") {
      if (r() < 0.55) out.waitlist.push({ id: id("demo-wait"), created_at: iso(finishedMs + 0.3 * H), parent_id: pid, child_id: kid.id, province } satisfies RawWaitlist);
      continue;
    }
    if (r() > 0.45) continue;
    const cardMs = finishedMs + (r() < 0.6 ? 0.2 * H : 18 * H + r() * 30 * H);
    if (cardMs > now.getTime()) continue;
    const saved = r() < 0.68;
    const savedMs = cardMs + 0.05 * H;
    const plan = r() < 0.7 ? "one" : "both";
    const card: RawCard = { id: id("demo-card"), created_at: iso(cardMs), updated_at: iso(saved ? savedMs : cardMs), parent_id: pid, child_id: kid.id, plan, price: plan === "one" ? 99 : 179, stripe_customer_id: `cus_demo${i}`, card_saved_at: saved ? iso(savedMs) : null };
    out.cards.push(card);
    if (saved && r() < 0.5) {
      const payMs = savedMs + (2 + r() * 6) * 24 * H;
      if (payMs < now.getTime()) out.subscriptions.push({
        id: `sub_demo${i}`, customer: card.stripe_customer_id!, status: r() < 0.85 ? "active" : "canceled", created: iso(payMs),
        endedAt: null, amount: card.price * 100, quantity: 1, interval: "month", intervalCount: 1, currency: "cad",
      } satisfies RawSubscription);
      const sub = out.subscriptions.at(-1)!;
      if (sub.status === "canceled") sub.endedAt = iso(payMs + 5 * 24 * H);
    }
  }
  // two made-up test families, so the "hidden" note and its toggle show
  out.testIds = out.parents.slice(0, 2).map((p) => p.id);
  return out;
}

/**
 * A made-up copy of a demo reminder (D-103), built with the real reminder template, so the email view has something to
 * show in local development. Null for the report emails: the demo has no reports to build them from.
 */
export function demoEmailCopy(e: EmailEvent, f: Family | undefined): EmailCopyView | null {
  if (!f || (e.kind !== "start" && e.kind !== "start_followup" && e.kind !== "continue" && e.kind !== "come_back")) return null;
  const child = e.childName ?? f.children[0]?.name ?? "Maya";
  const common = { parentName: f.name, childName: child, url: "https://unicalearning.com/account/start/demo?reminder=" + e.kind, unsubscribeUrl: "https://unicalearning.com/unsubscribe?t=hidden", postal: f.postal, total: 30 };
  const mail = e.kind === "continue"
    ? reminderEmail({ ...common, kind: "continue", answered: 12, resumeUntil: Date.parse(e.at) + 23 * 3_600_000 })
    : reminderEmail({ ...common, kind: e.kind });
  return { outcome: e.status === "failed" ? "refused" : "sent", from: "Unica Learning <contact@unicalearning.com>", to: f.email, replyTo: SUPPORT_EMAIL, subject: mail.subject, text: mail.text, html: mail.html, keptAt: e.at, events: e.delivery ? [e.delivery] : [] };
}

/**
 * Made-up live progress for the demo's open tests (admin-progress.ts): the grade band's lengths, and the child on a
 * question served a few minutes ago, so the table cell and the panel show in local development.
 */
export function demoProgress(rows: DashboardRows, now: Date): ProgressSnapshot {
  const r = rng(11);
  const inputs = new Map<string, ProgressInput>();
  for (const t of rows.tests.filter((x) => x.status === "in_progress")) {
    const band = bandFor(t.grade as Grade);
    const rest = band.length - band.stage1;
    const answered = Math.min(t.answered, band.length - 1);
    const shownMs = now.getTime() - Math.floor(r() * 25) * 60_000;
    inputs.set(t.id, {
      status: "in_progress", route: answered > band.stage1 ? "stay" : null, answered, nextPrompt: `What is ${3 + (answered % 7)} × ${4 + (answered % 5)}?`,
      lengths: { stage1: band.stage1, up: rest + 3, stay: rest, down: rest, extra: 0 },
      lastShown: { position: answered, at: new Date(shownMs).toISOString() },
      startedAt: t.started_at, lastAnswerAt: new Date(shownMs).toISOString(), completedAt: null, resumeUntil: new Date(shownMs + 24 * 3_600_000).toISOString(),
      breakStartedAt: null, breakEndedAt: null, factsStartedAt: null, factsAnswered: 0, extraOfferedAt: null, extraSkippedAt: null, extraStartedAt: null, extraFinishedAt: null,
    });
  }
  return progressSnapshot(inputs, now);
}
