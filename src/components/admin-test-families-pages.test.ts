import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as store from "@/lib/admin-store";
import * as auth from "@/lib/supabase-auth";
import { buildDashboard, type Dashboard, type DashboardRows } from "@/lib/admin-dashboard";
import { ActivityView } from "@/components/admin-activity";
import { DashboardView } from "@/components/admin-dashboard";
import { FamilyDrawer } from "@/components/admin-family";
import { loadAdminBadges } from "@/lib/admin-badges";
import { showTestFamilies } from "@/lib/admin-test-families-server";
import AdminScans from "@/app/(product)/admin/scans/page";
import MayaChatPage from "@/app/(product)/admin/maya-chat/page";
import EmailsPage from "@/app/(product)/admin/emails/page";

// The "Show test families" switch (D-313) across the admin pages: off, test and team families are left out of every
// list, before any limit; on, they are listed and tagged; either way every count, total, chart and cost is of the real
// families only. Each page runs against a fake database that answers the way PostgREST does.

const state = vi.hoisted(() => ({ cookie: "", dash: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (state.cookie ? { value: state.cookie } : undefined) }) }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin", useRouter: () => ({ refresh() {}, replace() {} }), notFound: () => { throw new Error("404"); } }));
vi.mock("@/components/admin-frame", () => ({
  AdminFrame: ({ children, testNote }: { children: unknown; testNote?: unknown }) => createElement("div", { "data-test-note": testNote ? "on" : "off" }, children as never),
}));
vi.mock("@/lib/admin-dashboard-load", () => ({ loadDashboard: async () => state.dash }));
afterEach(() => { vi.restoreAllMocks(); state.cookie = ""; state.dash = null; });

const TEST = "11111111-1111-4111-8111-111111111111";
const TEAM = "22222222-2222-4222-8222-222222222222";
const REAL = "33333333-3333-4333-8333-333333333333";
const CHILD = "44444444-4444-4444-8444-444444444444";
const TEST_CHILD = "55555555-5555-4555-8555-555555555555";
const at = "2026-11-10T20:00:00.000Z";
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

type Read = (name: string, req: { params: URLSearchParams; body: Record<string, unknown> | null }) => unknown;
/** A Supabase client whose every request goes to `read` (the table or function name, the query and the JSON body). */
function fakeDb(read: Read) {
  return createClient("https://db.example.invalid", "test", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    const answer = read(url.pathname.split("/").at(-1)!, { params: url.searchParams, body: init?.body ? JSON.parse(String(init.body)) : null });
    return Response.json(answer);
  } } });
}
/** PostgREST's `parent_id=not.in.(a,b)`: the ids a read leaves out. */
const notInIds = (params: URLSearchParams, column = "parent_id") => {
  const v = params.get(column);
  return new Set(v?.startsWith("not.in.(") ? v.slice(8, -1).split(",") : []);
};
const admin = (db: ReturnType<typeof fakeDb>) => ({ db, userId: TEAM, email: "admin@example.invalid" }) as store.AdminSession;
/** The test family ids: TEST is marked in test_accounts, TEAM is an admin's own family (no test_accounts row). */
const familyTables: Read = (name) => {
  if (name === "admin_team_ids") return [TEAM];
  if (name === "test_accounts") return [{ parent_id: TEST }];
  if (name === "admin_children") return [{ id: TEST_CHILD }];
  return undefined;
};

describe("marking: the waiting answers (finding 1)", () => {
  /** The queue as admin_scan_team_queue_v2 answers it: test rows first (older), the real one last; filtered before the limit. */
  function queueDb(tests: number) {
    const all = Array.from({ length: tests + 1 }, (_, i) => {
      const test = i < tests;
      return { item_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, parent_id: test ? TEST : REAL, child_id: test ? TEST_CHILD : CHILD,
        child_name: test ? "Test child" : "Real waiting child", workbook_id: "w", book: 1, page_number: 1, question_number: 1, photo_id: `photo-${i}`,
        issue: null, read_text: "8", waiting_since: at, test_family: test };
    });
    const calls: Record<string, unknown>[] = [];
    const db = fakeDb((name, { body }) => {
      const known = familyTables(name, { params: new URLSearchParams(), body });
      if (known !== undefined) return known;
      if (name === "admin_scan_team_queue_v2") {
        calls.push(body!);
        const listed = all.filter((r) => body!.p_with_tests || !r.test_family);
        const real = all.filter((r) => !r.test_family).length;
        return listed.slice(0, Number(body!.p_limit)).map((r) => ({ ...r, total: listed.length, real_total: real }));
      }
      if (name === "scan_marking_command") return { pages: [], budget: null };
      return [];
    });
    return { db, calls };
  }

  it("switch off: 100 older test answers do not push the real answer off the list, and the badge counts it", async () => {
    const { db, calls } = queueDb(100);
    vi.spyOn(store, "requireAdmin").mockResolvedValue(admin(db));
    vi.spyOn(store, "renderAdmin").mockResolvedValue(admin(db));
    vi.spyOn(auth, "adminClient").mockReturnValue(db as never);
    const html = renderToStaticMarkup(await AdminScans({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Real waiting child");
    expect(html).not.toContain("Test child");
    expect(text(html)).toContain("1 answer is waiting for our team to mark");
    expect(calls[0]).toEqual({ p_limit: 100, p_with_tests: false });
    expect((await loadAdminBadges()).marking).toMatchObject({ text: "1", label: "1 answer waits for the team" });
    expect(calls.at(-1)).toEqual({ p_limit: 1, p_with_tests: false });
  });

  it("switch on: test answers are listed and tagged, and the count is still the real one", async () => {
    state.cookie = "1";
    const { db } = queueDb(1);
    vi.spyOn(store, "requireAdmin").mockResolvedValue(admin(db));
    vi.spyOn(auth, "adminClient").mockReturnValue(db as never);
    const html = renderToStaticMarkup(await AdminScans({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Test child");
    expect(html).toContain("Real waiting child");
    expect(text(html)).toContain("1 answer is waiting for our team to mark");
  });
});

describe("marking: the scanned pages' counts and costs (finding 2)", () => {
  const page = (id: string, childId: string, name: string, charged: number) => ({
    id, childId, childName: name, workbookId: "w", book: 1, revision: "r", day: "Day 1", pageNumber: 1, marks: [], photos: [], jobs: [],
    spend: [{ id: `spend-${id}`, model: "m", at, reserved: 0, charged, outcome: "ok" }],
  });
  it("switch on: a test page is listed but its cost and its count are not", async () => {
    state.cookie = "1";
    const db = fakeDb((name, req) => {
      const known = familyTables(name, req);
      if (known !== undefined) return known;
      if (name === "admin_scan_team_queue_v2") return [];
      if (name === "scan_marking_command") {
        const data = req.body!.p_data as { after?: string };
        return { pages: data.after ? [] : [page("a1", CHILD, "Real page child", 1_000_000), page("a2", TEST_CHILD, "Test page child", 5_000_000)], budget: null };
      }
      return [];
    });
    vi.spyOn(store, "requireAdmin").mockResolvedValue(admin(db));
    vi.spyOn(auth, "adminClient").mockReturnValue(db as never);
    const t = text(renderToStaticMarkup(await AdminScans({ searchParams: Promise.resolve({}) })));
    expect(t).toContain("Test page child");
    expect(t).toContain("1 page shown, not counting test families.");
    expect(t).toContain("USD 1.0000 reported");
  });
});

describe("Home, Activity and Emails count real families only (finding 2)", () => {
  const rows = (): DashboardRows => ({
    parents: [REAL, TEST].map((id) => ({ id, created_at: at, name: id === TEST ? "Test family" : "Real family", email: `${id}@example.invalid`, postal: null, source: null })),
    children: [], tests: [], reports: [], cards: [], waitlist: [], deliveries: [], subscriptions: [], testIds: [TEST], stripeNote: null, stripeMode: null,
    emails: [REAL, TEST].map((id, i) => ({ id: `email${i}`, created_at: at, parent_id: id, child_id: null, assessment_id: null, kind: "continue", status: "sent", attempts: 1, sent_at: at, error: null, clicks: 0, first_clicked_at: null })),
  }) as DashboardRows;
  const ctx = (path: string, query: Record<string, string> = {}) => ({ path, query, demo: false });

  it("switch on: the test family is listed, and no total, tab or chart counts it", async () => {
    const d = buildDashboard(rows(), "today", new Date(at), { withTests: true });
    expect(d.families.map((f) => f.name).sort()).toEqual(["Real family", "Test family"]);
    expect(d.kpis.find((k) => k.key === "accounts")?.value).toBe(1);
    const activity = renderToStaticMarkup(createElement(ActivityView, { d, ctx: ctx("/admin/activity") }));
    expect(activity).toMatch(/New accounts<\/dt><dd><b>1<\/b>/);
    expect(activity).toMatch(/<dt>Families<\/dt><dd><b>1<\/b>/);
    expect(text(activity)).toContain("All families 1");
    expect(text(activity)).toContain("All emails 1");
    const home = renderToStaticMarkup(createElement(DashboardView, { d, ctx: ctx("/admin"), progress: { now: at, tests: {} } }));
    expect(text(home)).toContain("1 sent at any time");
    expect(text(home)).toContain("All 1");
    expect(home).toContain("Test family");
    const log = text(renderToStaticMarkup(createElement(ActivityView, { d, ctx: ctx("/admin/activity", { view: "emails" }) })));
    expect(log).toContain("All emails 1");
    state.dash = { who: "admin@example.invalid", d, progress: { now: at, tests: {} }, query: {}, demo: false };
    const emails = text(renderToStaticMarkup(await EmailsPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) } as never)));
    expect(emails).toContain("All 1");
    expect(emails).toContain("Test family");
  });
});

describe("AI reviews (finding 3)", () => {
  it("switch off: test reviews are left out in the query, so page 1 holds the real review", async () => {
    const reviews = Array.from({ length: 501 }, (_, i) => ({ id: `review${i}`, created_at: at, assessment_id: `assessment${i}`, parent_id: i === 500 ? REAL : TEST,
      question_id: "q", confidence: "low", score: 0, kind: "none", error_type: "", comment: "", model: "fake" }));
    const db = fakeDb((name, { params }) => {
      if (name === "work_reviews") {
        const out = notInIds(params);
        const from = Number(params.get("offset") ?? 0), limit = Number(params.get("limit") ?? 9999);
        return reviews.filter((r) => !out.has(r.parent_id)).slice(from, from + limit);
      }
      if (name === "admin_assessments") return reviews.map((r) => ({ id: r.assessment_id, grade: 3, province: "BC", child_id: CHILD, parent_id: r.parent_id }))
        .filter((r) => (params.get("id") ?? "").includes(r.id));
      if (name === "admin_children") return [{ id: CHILD, first_name: "Child", parent_id: REAL }];
      return [];
    });
    const first = await store.listReviews(admin(db), { lowOnly: false }, 0, [TEST, TEAM]);
    expect(first.rows.map((r) => r.assessment_id)).toEqual(["assessment500"]);
    expect(first.more).toBe(false);
  });
});

describe("the Maya chat list (finding 5)", () => {
  const chatDb = () => fakeDb((name, req) => {
    const known = familyTables(name, req);
    if (known !== undefined) return known;
    if (name === "maya_chat_families") return [TEST, TEAM, REAL].map((parent_id) => ({ parent_id, added_at: at, rehearsal: false }));
    if (name === "admin_parents") return [{ id: TEST, name: "Marked test family", email: "t@example.invalid" }, { id: TEAM, name: "Team family", email: "a@example.invalid" },
      { id: REAL, name: "Real family", email: "r@example.invalid" }];
    return [];
  });

  it("switch off: leaves the marked test family and the team family out", async () => {
    vi.spyOn(store, "requireAdmin").mockResolvedValue(admin(chatDb()));
    const html = renderToStaticMarkup(await MayaChatPage());
    expect(html).toContain("Real family");
    expect(html).not.toContain("Marked test family");
    expect(html).not.toContain("Team family");
    expect(html).toContain('data-test-note="off"');
  });

  it("switch on: lists both with the test tag, the team family too", async () => {
    state.cookie = "1";
    vi.spyOn(store, "requireAdmin").mockResolvedValue(admin(chatDb()));
    const html = renderToStaticMarkup(await MayaChatPage());
    expect(html.match(/adm-chip is-test/g)).toHaveLength(2);
    expect(html).toContain('data-test-note="on"');
  });
});

describe("only the switch decides, never the address (finding 6)", () => {
  it("an old ?tests=1 does not show test families while the switch is off", async () => {
    expect(await showTestFamilies()).toBe(false);
    const db = fakeDb((name, req) => {
      const known = familyTables(name, req);
      if (known !== undefined) return known;
      if (name === "admin_scan_team_queue_v2") return req.body!.p_with_tests
        ? [{ item_id: CHILD, parent_id: TEST, child_id: TEST_CHILD, child_name: "Test child", workbook_id: "w", book: 1, page_number: 1, question_number: 1, photo_id: "p", issue: null, read_text: "8", waiting_since: at, test_family: true, total: 1, real_total: 0 }]
        : [];
      if (name === "scan_marking_command") return { pages: [], budget: null };
      return [];
    });
    vi.spyOn(store, "requireAdmin").mockResolvedValue(admin(db));
    vi.spyOn(auth, "adminClient").mockReturnValue(db as never);
    const html = renderToStaticMarkup(await AdminScans({ searchParams: Promise.resolve({ tests: "1" } as never) }));
    expect(html).not.toContain("Test child");
    expect(html).toContain('data-test-note="off"');
  });

  it("a test family opened on Home with the switch off says why it is not shown", () => {
    const d: Dashboard = buildDashboard({
      parents: [{ id: TEST, created_at: at, name: "Test family", email: "t@example.invalid", postal: null, source: null }],
      children: [], tests: [], reports: [], cards: [], waitlist: [], deliveries: [], subscriptions: [], testIds: [TEST], stripeNote: null, stripeMode: null, emails: [],
    } as DashboardRows, "today", new Date(at));
    const html = renderToStaticMarkup(createElement(FamilyDrawer, { ctx: { path: "/admin", query: { family: TEST }, demo: false }, d, id: TEST, progress: { now: at, tests: {} } }));
    expect(text(html)).toContain("This is a test family. Turn on Show test families to see it.");
    expect(renderToStaticMarkup(createElement(FamilyDrawer, { ctx: { path: "/admin", query: {}, demo: false }, d, id: REAL, progress: { now: at, tests: {} } }))).toBe("");
  });
});
