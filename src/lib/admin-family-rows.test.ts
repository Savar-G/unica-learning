// The family and email pages read only their families' dashboard rows (familyDashboardRows): through a fake PostgREST
// server and a fake Stripe, the family buildDashboard works out from them equals the one from the whole read
// (dashboardRows), every database read filters by the family or by id, and Stripe is asked only about the family's cards.
import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";

const fake = vi.hoisted(() => ({ subscriptionLists: [] as (string | null)[], cardChecks: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/saved-card-server", () => ({ stripeCardProvider: () => ({}) }));
vi.mock("@/lib/saved-card", () => ({
  findSavedCard: async (c: { id: string }) => {
    fake.cardChecks.push(c.id);
    return c.id === CARD_A2 ? { state: "saved", evidence: { savedAt: "2026-11-05T00:00:00.000Z" } } : { state: "none" };
  },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    subscriptions: {
      list: (p: { customer?: string }) => ({
        autoPagingToArray: async () => {
          fake.subscriptionLists.push(p.customer ?? null);
          return SUBS.filter((s) => !p.customer || s.customer === p.customer);
        },
      }),
    },
  }),
}));
import { dashboardRows, emailParent, familyDashboardRows, type AdminSession } from "@/lib/admin-store";
import { buildDashboard } from "@/lib/admin-dashboard";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = id(1), B = id(2), C = id(3);
const CARD_A1 = id(31), CARD_A2 = id(32);
const at = (d: number) => new Date(Date.UTC(2026, 10, d)).toISOString();
const sub = (n: number, customer: string, status: string, d: number) => ({
  id: `sub_${n}`, customer, status, start_date: Date.UTC(2026, 10, d) / 1000, created: Date.UTC(2026, 10, d) / 1000, ended_at: null, canceled_at: null,
  trial_end: Date.UTC(2026, 11, d) / 1000, items: { data: [{ quantity: 1, price: { unit_amount: 7999, currency: "cad", recurring: { interval: "month", interval_count: 1 } } }] },
});
const SUBS = [sub(1, "cus_a", "trialing", 6), sub(2, "cus_b", "active", 4), sub(3, "cus_a", "canceled", 2)];

type Row = Record<string, unknown>;
const parent = (p: string, d: number) => ({ id: p, created_at: at(d), name: `Parent ${p.slice(-1)}`, email: `p${p.slice(-1)}@example.invalid`, phone: null, postal: null, source: {} });
const child = (n: number, p: string) => ({ id: id(n), created_at: at(1), parent_id: p, first_name: `Kid ${n}`, grade: 3, province: "bc" });
const test = (n: number, p: string, c: number, d: number) => ({
  id: id(n), created_at: at(d), status: "completed", parent_id: p, child_id: id(c), grade: 3, province: "bc", started_at: at(d), completed_at: at(d), last_answer_at: at(d), answers: [{ count: 30 }],
});
const report = (n: number, test: number, p: string, c: number) => ({
  id: id(n), created_at: at(3), assessment_id: id(test), parent_id: p, child_id: id(c), emailed_at: at(3), email_id: `re_r${n}`, email_error: null, alerted_at: at(3), alert_error: null, email_clicks: 0, email_first_clicked_at: null,
});
const email = (n: number, p: string, c: number | null, testId: number | null, kind: string) => ({
  id: id(n), created_at: at(2), parent_id: p, child_id: c && id(c), assessment_id: testId && id(testId), kind, status: "sent", attempts: 1, sent_at: at(2), error: null, clicks: 0, first_clicked_at: null,
});
const card = (cid: string, p: string, c: number, customer: string, saved: string | null) => ({
  id: cid, created_at: at(4), updated_at: at(4), parent_id: p, child_id: id(c), plan: "one", price: 79.99, stripe_customer_id: customer, card_saved_at: saved,
});
const tables: Record<string, Row[]> = {
  admin_parents: [parent(A, 1), parent(B, 1), parent(C, 1)],
  admin_children: [child(11, A), child(12, B), child(13, C)],
  // B's test 22 is named by A's email below (no constraint ties an email's test to its family)
  admin_assessments: [test(21, A, 11, 2), test(22, B, 12, 3), test(23, C, 13, 3)],
  // the report of A's test is filed under B (a lookup by test id, outside the family)
  admin_reports: [report(41, 21, B, 11), report(42, 22, B, 12)],
  admin_card_setups: [card(CARD_A1, A, 11, "cus_a", at(4)), card(CARD_A2, A, 11, "cus_a", null), card(id(33), B, 12, "cus_b", null)],
  admin_waitlist_joins: [{ id: id(51), created_at: at(2), parent_id: A, child_id: id(11), province: "bc" }],
  email_log: [email(61, A, 12, 22, "continue"), email(62, A, null, null, "unsubscribe"), email(63, B, 12, null, "start")],
  email_copies: [
    { id: id(71), email_id: "re_1", email_log_id: id(61), report_id: null, report_email: null },
    { id: id(72), email_id: "re_r41", email_log_id: null, report_id: id(41), report_email: "parent" },
    // another family's copy with the same Resend id and a higher id: the whole read joins re_1's events to it
    { id: id(73), email_id: "re_1", email_log_id: id(63), report_id: null, report_email: null },
    { id: id(74), email_id: "re_9", email_log_id: id(63), report_id: null, report_email: null },
  ],
  email_events: [
    { id: id(81), email_id: "re_1", type: "delivered", occurred_at: at(2), detail: null },
    { id: id(82), email_id: "re_r41", type: "bounced", occurred_at: at(3), detail: "full" },
    { id: id(83), email_id: "re_9", type: "delivered", occurred_at: at(3), detail: null },
  ],
  test_accounts: [{ parent_id: C }],
};

function server() {
  const requests: string[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const name = url.pathname.split("/").at(-1)!;
    requests.push(`${name}?${[...url.searchParams].filter(([k]) => !["select", "order", "offset", "limit"].includes(k)).map(([k, v]) => `${k}=${v}`).join("&")}`);
    if (name === "admin_team_ids") return Response.json([]);
    let rows = [...(tables[name] ?? [])];
    for (const [key, value] of url.searchParams) {
      if (["select", "order", "offset", "limit"].includes(key)) continue;
      if (value.startsWith("eq.")) rows = rows.filter((r) => String(r[key]) === value.slice(3));
      else if (value.startsWith("in.(")) rows = rows.filter((r) => value.slice(4, -1).split(",").includes(String(r[key])));
      else if (value === "not.is.null") rows = rows.filter((r) => r[key] != null);
      else throw new Error(`fake server: filter ${key}=${value}`);
    }
    const single = new Headers(init?.headers).get("accept") === "application/vnd.pgrst.object+json";
    if (single) return Response.json(rows[0] ?? null);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return Response.json(rows.slice(offset, offset + Number(url.searchParams.get("limit") ?? rows.length)));
  };
  const db = createClient<Database>("https://example.com", "test", { global: { fetch: fetch as typeof globalThis.fetch } });
  return { admin: { db, userId: id(9999), email: "admin@example.invalid" } as AdminSession, requests };
}

const now = new Date("2026-11-10T20:00:00.000Z");
const familyOf = (rows: Awaited<ReturnType<typeof dashboardRows>>, p: string) => {
  const d = buildDashboard(rows, "7d", now, { withTests: true });
  const f = d.families.find((x) => x.id === p) ?? null;
  return { f, needs: d.needs.filter((n) => n.families.some((x) => x.id === p)).map((n) => n.title) };
};

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  fake.subscriptionLists = [];
  fake.cardChecks = [];
});

it.each([[A], [B], [C], [A, B]])("gives family %s what the whole read gives it", async (...families) => {
  const whole = await dashboardRows(server().admin);
  const s = server();
  const scoped = await familyDashboardRows(s.admin, families);
  for (const p of families) expect(familyOf(scoped, p)).toEqual(familyOf(whole, p));
  // other families never show up
  expect(buildDashboard(scoped, "7d", now, { withTests: true }).families.map((f) => f.id).sort()).toEqual([...families].sort());
});

it("keeps the edge cases of the whole read: another family's report, test and copy", async () => {
  const { f } = familyOf(await familyDashboardRows(server().admin, [A]), A);
  // A's test has its report, filed under B; A's email names B's test and child
  expect(f!.tests[0].reportId).toBe(id(41));
  expect(f!.emails.find((e) => e.id === id(61))).toMatchObject({ childName: "Kid 12" });
  // re_1's events join B's later copy, as in the whole read, so A's email has no delivery event
  expect(f!.emails.find((e) => e.id === id(61))!.delivery).toBeNull();
  // the card found in Stripe and the family's subscriptions
  expect(f!.cards.map((c) => c.foundInStripe).sort()).toEqual([false, true]);
  expect(f!.subscriptions.map((x) => x.id)).toEqual(["sub_3", "sub_1"]);
});

it("filters every database read by the family or by id, and asks Stripe only about the family's cards", async () => {
  const s = server();
  await familyDashboardRows(s.admin, [A]);
  const unfiltered = s.requests.filter((r) => r.endsWith("?") && !r.startsWith("admin_team_ids") && !r.startsWith("test_accounts"));
  expect(unfiltered).toEqual([]);
  expect(fake.cardChecks).toEqual([CARD_A2]);
  expect(fake.subscriptionLists).toEqual(["cus_a"]);
});

it("the whole read still lists every subscription and checks every unsaved card", async () => {
  await dashboardRows(server().admin);
  expect(fake.subscriptionLists).toEqual([null]);
  expect(fake.cardChecks.sort()).toEqual([CARD_A2, id(33)].sort());
});

it("finds the family of an email page's email, or none", async () => {
  const { admin } = server();
  expect(await emailParent(admin, id(61))).toBe(A);
  expect(await emailParent(admin, `${id(41)}:report`)).toBe(B);
  expect(await emailParent(admin, `${id(41)}:alert`)).toBe(B);
  for (const bad of [id(99), `${id(41)}:other`, `${id(41)}:report:x`, "nope"]) expect(await emailParent(admin, bad)).toBeNull();
});
