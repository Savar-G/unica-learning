// Made-up families for the admin dashboard in local development only (?demo=1, D-099), so the layout can be checked
// with more than a handful of rows and without an admin sign-in. Seeded, so every reload shows the same numbers. No
// real person is in here, and nothing here reads the database.
import type { Province } from "@/lib/assessment";
import type { DashboardRows, RawCard, RawChild, RawEmail, RawParent, RawReport, RawSubscription, RawTest, RawWaitlist } from "@/lib/admin-dashboard";

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
  const out: DashboardRows = { parents: [], children: [], tests: [], reports: [], cards: [], waitlist: [], emails: [], subscriptions: [], stripeNote: null };
  let n = 0;
  const id = (p: string) => `${p}-${(++n).toString().padStart(4, "0")}`;

  for (let i = 0; i < 72; i++) {
    // more signups in recent days
    const daysAgo = Math.floor(Math.pow(r(), 1.4) * 35);
    const created = now.getTime() - daysAgo * 24 * H - r() * 20 * H;
    const pid = id("demo-parent");
    const first = pick(FIRST);
    const parent: RawParent = { id: pid, created_at: iso(created), name: `${first} ${pick(LAST)}`, email: `${first.toLowerCase()}${i}@example.com`, postal: pick(["V3S", "V4N", "V6B", "V5K", "T2P", "M5V"]) + " 1A1", source: { utm_source: pick(["facebook", "google", "instagram", "friend", "facebook", "google"]) } };
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
      out.emails.push({ id: id("demo-email"), created_at: iso(atMs), parent_id: pid, child_id: kid.id, assessment_id: assessment, kind, status: kind === "unsubscribe" ? null : fail ? "failed" : "sent", attempts: fail ? 3 : 1, sent_at: fail || kind === "unsubscribe" ? null : iso(atMs + 60_000), error: fail ? "Resend: rate limit (429)" : null });
    };

    // the funnel
    if (r() > 0.76) {
      email("start", created + 26 * H, null);
      if (r() < 0.5) email("start", created + 74 * H, null);
      if (r() < 0.08) email("unsubscribe", created + 80 * H, null);
      continue;
    }
    const startedMs = created + (r() < 0.6 ? r() * 2 * H : 26 * H + r() * 30 * H);
    if (startedMs > now.getTime()) continue;
    if (startedMs > created + 24 * H) email("start", created + 24 * H, null);
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
    const report: RawReport = { id: id("demo-report"), created_at: iso(finishedMs + 120_000), assessment_id: tid, parent_id: pid, child_id: kid.id, emailed_at: null, email_error: null, alerted_at: iso(finishedMs + 150_000), alert_error: null };
    if (r() < 0.04) report.email_error = "Resend: 500 internal error";
    else report.emailed_at = iso(finishedMs + 140_000);
    out.reports.push(report);

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
      if (payMs < now.getTime()) out.subscriptions.push({ customer: card.stripe_customer_id!, status: "active", created: iso(payMs), amount: card.price * 100 } satisfies RawSubscription);
    }
  }
  return out;
}
