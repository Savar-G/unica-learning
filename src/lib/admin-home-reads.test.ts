// Home's extra reads (readHomeExtras) through a fake PostgREST server: Production's constant reads with no per-run
// reads, the plan records only for children whose Book 1 is delivered, the marking queue's real total, and what Home
// then shows. The fake answers the admin functions as admin-production-reads.test.ts does.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { buildDashboard, type DashboardRows } from "@/lib/admin-dashboard";
import { CHECK_PLAN } from "@/lib/admin-home";
import { readHomeExtras, type HomeExtras } from "@/lib/admin-home-load";
import type { AdminSession } from "@/lib/admin-store";
import type { Database } from "@/lib/database";
import { HomeView } from "@/components/admin-home";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }), usePathname: () => "/admin", useSearchParams: () => new URLSearchParams() }));

const now = new Date("2026-11-10T20:00:00.000Z");
const days = (n: number) => new Date(+now - n * 86_400_000).toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Row = Record<string, unknown>;
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function server(tables: Record<string, Row[]>, queue: { rows: Row[]; total: number } = { rows: [], total: 0 }, fail: string[] = []) {
  const requests: string[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const name = url.pathname.split("/").at(-1)!;
    requests.push(url.pathname.includes("/rpc/") ? `rpc:${name}` : name);
    if (fail.includes(name)) return Response.json({ code: "XX000", message: "down" }, { status: 500 });
    const args = (init?.body ? JSON.parse(String(init.body)) : {}) as Record<string, string[]>;
    if (name === "admin_scan_team_queue_v2") return Response.json(queue.rows.map((r) => ({ ...r, total: queue.total, real_total: queue.total })));
    let rows: Row[] =
      name === "admin_production_runs" ? tables.workbook_runs ?? []
      : name === "admin_production_books" ? tables.workbooks ?? []
      : name === "admin_card_setups" ? tables.card_setups ?? []
      : name === "admin_children" ? tables.children ?? []
      : name === "admin_parents" ? tables.parents ?? []
      : name === "admin_latest_draft_revisions" ? args.p_drafts.map((d) => ({ draft_id: d, revision: 1, counts: null, render_problems: [] }))
      : name === "admin_run_activity" ? args.p_runs.map((r) => ({ run_id: r, page_times: [], last_call_at: null, last_solve_at: null, plan_at: null, resumed_at: null }))
      : tables[name] ?? [];
    rows = [...rows];
    for (const [key, value] of url.searchParams) {
      if (["select", "order", "offset", "limit"].includes(key)) continue;
      if (value.startsWith("eq.")) rows = rows.filter((r) => String(r[key]) === value.slice(3));
      else if (value.startsWith("in.(")) rows = rows.filter((r) => value.slice(4, -1).split(",").includes(String(r[key])));
      else if (value.startsWith("not.in.(")) rows = rows.filter((r) => !value.slice(8, -1).split(",").includes(String(r[key])));
      else if (value === "not.is.null") rows = rows.filter((r) => r[key] != null);
      else throw new Error(`fake server: filter ${key}=${value}`);
    }
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? rows.length);
    return Response.json(rows.slice(offset, offset + limit));
  };
  const db = createClient<Database>("https://example.com", "test", { global: { fetch: fetch as typeof globalThis.fetch } });
  const count = () => requests.reduce((m, r) => ({ ...m, [r]: (m[r] ?? 0) + 1 }), {} as Record<string, number>);
  return { admin: { db, userId: id(9999), email: "admin@example.com" } as AdminSession, requests, count };
}

const off = { ids: [] as string[], show: false, isTest: () => false };
const book = (n: number, o: Row = {}): Row => ({
  id: id(n), parent_id: id(n + 100_000), child_id: id(n + 200_000), number: 1, levels: [4], status: "shipped", pdf_path: null,
  profile_build: null, created_at: days(3), approved_at: days(3), printed_at: days(2), shipped_at: days(2), ...o,
});
const run = (n: number, o: Row = {}): Row => ({
  id: id(n), parent_id: id(n + 100_000), child_id: id(n + 200_000), number: 1, status: "done", step: null, attempts: 1, max_attempts: 2,
  done_pages: null, total_pages: null, heartbeat_at: days(1), started_at: days(1), finished_at: days(1), error: null, errors: [],
  draft_id: null, draft_key: "k", resumes: 0, started_by: null, started_by_email: null, runner: "mac", stopped_by_email: null, created_at: days(1), ...o,
});

/** `drafts` waiting drafts, `running` books being made, and `delivered` delivered Book 1s, with a saved card when `cards`. */
function production(drafts: number, running: number, delivered: number, cards = true) {
  const runs = [
    ...Array.from({ length: drafts }, (_, i) => run(i + 1, { draft_id: id(300_000 + i) })),
    ...Array.from({ length: running }, (_, i) => run(1000 + i, { status: "running", step: "write", finished_at: null, heartbeat_at: now.toISOString() })),
  ];
  const books = Array.from({ length: delivered }, (_, i) => book(2000 + i));
  return {
    workbook_runs: runs, workbooks: books,
    workbook_drafts: Array.from({ length: drafts }, (_, i) => ({ id: id(300_000 + i), schema_version: 2, pages: 60, questions: 150, failed: 0, not_checked: 0, failed_pages: 0, cover: {} })),
    workbook_delivery_receipts: books.map((b) => ({ workbook_id: b.id, parent_id: b.parent_id, child_id: b.child_id, number: 1, delivered_at: days(1), audit_id: 1 })),
    card_setups: (cards ? books : []).map((b, i) => ({ id: id(400_000 + i), child_id: b.child_id, parent_id: b.parent_id, card_saved_at: days(5) })),
    children: [...runs, ...books].map((r) => ({ id: r.child_id, parent_id: r.parent_id, first_name: "Kid", created_at: days(9), grade: 2, province: "BC" })),
    parents: [...runs, ...books].map((r) => ({ id: r.parent_id, name: "Family", created_at: days(9), email: "f@example.com", postal: null, source: {} })),
  };
}

describe("requests (review #837 finding 3)", () => {
  it("reads 20 drafts and 10 books being made in the same requests as 1 and 1, with no per-run reads", async () => {
    const small = server(production(1, 1, 5, false));
    await readHomeExtras(small.admin, off, now);
    const big = server(production(20, 10, 5, false));
    const extras = await readHomeExtras(big.admin, off, now);
    expect(extras.books?.filter((b) => b.stage === "review")).toHaveLength(20);
    expect(extras.books?.filter((b) => b.stage === "making")).toHaveLength(10);
    // Production's 11 and the marking queue's 1; no plan records with no saved card on a delivered Book 1.
    expect(big.requests).toHaveLength(12);
    expect(small.requests).toHaveLength(12);
    expect(big.count()).toMatchObject({ "rpc:admin_latest_draft_revisions": 1, "rpc:admin_run_activity": 1, "rpc:admin_scan_team_queue_v2": 1 });
    expect(big.requests).not.toContain("plan_starts");
  });

  it("reads the plan records in 4 requests, for 1 or 30 delivered Book 1s", async () => {
    const one = server(production(20, 10, 1));
    await readHomeExtras(one.admin, off, now);
    const many = server(production(20, 10, 30));
    const extras = await readHomeExtras(many.admin, off, now);
    expect(one.requests).toHaveLength(16);
    expect(many.requests).toHaveLength(16);
    expect(many.count()).toMatchObject({ "rpc:admin_card_setups": 2, plan_starts: 1, workbook_emails: 1, child_plan_states: 2 });
    expect(extras.neverStarted?.size).toBe(30);
  });
});

describe("what Home shows from the reads", () => {
  // Two families, each with a delivered Book 1 and a saved card: one never started a plan, one had a completed start.
  const never = book(1), prior = book(2);
  const tables = () => ({
    workbooks: [never, prior],
    workbook_delivery_receipts: [never, prior].map((b) => ({ workbook_id: b.id, parent_id: b.parent_id, child_id: b.child_id, number: 1, delivered_at: days(1), audit_id: 1 })),
    card_setups: [never, prior].map((b, i) => ({ id: id(400_000 + i), child_id: b.child_id, parent_id: b.parent_id, card_saved_at: days(5), created_at: days(6), updated_at: days(5),
      plan: "one", price: 79.99, stripe_customer_id: `cus_${i}`, report_id: null })),
    plan_starts: [{ card_setup_id: id(400_001), parent_id: prior.parent_id, state: "started", generation: 1 }],
    children: [never, prior].map((b, i) => ({ id: b.child_id, parent_id: b.parent_id, first_name: i ? "Pia" : "Nico", created_at: days(9), grade: 2, province: "BC" })),
    parents: [never, prior].map((b, i) => ({ id: b.parent_id, name: i ? "Prior Start" : "Never Started", created_at: days(9), email: `${i}@example.com`, postal: null, source: {} })),
  });
  const dashboard = (t: ReturnType<typeof tables>) => buildDashboard({
    parents: t.parents, children: t.children, tests: [], reports: [], cards: t.card_setups, waitlist: [], emails: [], deliveries: [], subscriptions: [],
    testIds: [], stripeNote: null, stripeMode: null,
  } as unknown as DashboardRows, "7d", now);
  const render = (d: ReturnType<typeof dashboard>, extras: HomeExtras) => renderToStaticMarkup(createElement(HomeView, { d, ctx: { path: "/admin", query: {}, demo: false }, extras }));

  it("points only the never-started family to Plans and delivery, with no free month promise (review #837 finding 1)", async () => {
    const t = tables();
    const extras = await readHomeExtras(server(t).admin, off, now);
    expect([...extras.neverStarted!]).toEqual([never.child_id]);
    const html = render(dashboard(t), extras);
    const rows = text(html);
    expect(rows).toContain(`Never Started Nico · Card saved. Workbook delivered. ${CHECK_PLAN}`);
    expect(rows).toContain("Prior Start Pia · Card saved. Workbook delivered.");
    expect(rows).not.toContain(`Pia · Card saved. Workbook delivered. ${CHECK_PLAN}`);
    expect(html.match(/>Plans and delivery</g)).toHaveLength(1);
    expect(rows).not.toMatch(/Start free month|free month can start/);
  });

  it("gives no plan link when the plan records cannot be read", async () => {
    const t = tables();
    const extras = await readHomeExtras(server(t, undefined, ["plan_starts"]).admin, off, now);
    expect(extras.books).toHaveLength(2);
    expect(extras.neverStarted).toBeNull();
    expect(text(render(dashboard(t), extras))).not.toContain(CHECK_PLAN);
  });

  it("says Production's note and offers no Prepare when Production's read stopped before every child (review #837 finding 2)", () => {
    const t = tables();
    const books = [{ childId: never.child_id as string, parentId: never.parent_id as string, child: "Nico", family: "Never Started", test: false, number: 1,
      stage: "none" as const, at: days(5), tries: [], cardSavedAt: days(5) }];
    const base: HomeExtras = { books, incomplete: false, neverStarted: new Set(), queue: { items: [], total: 0 }, isTest: () => false, runner: "mac", now };
    expect(text(render(dashboard(t), base))).toContain("Prepare workbook");
    const html = text(render(dashboard(t), { ...base, incomplete: true }));
    expect(html).toContain("Some books could not be loaded. Showing the first 1.");
    expect(html).not.toContain("Prepare workbook");
    expect(html).toContain("Open Production");
  });

  it("shows the real total of 140 waiting answers, the breakdown labelled as of the oldest 100 (review #837 finding 6)", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ item_id: id(500_000 + i), parent_id: id(600_000), child_id: id(600_001), child_name: "Mira", book: 1,
      question_number: 1, page_number: 1, photo_id: null, issue: i % 2 ? "blurry" : null, read_text: null, waiting_since: days(1 - i / 1000), test_family: false }));
    const extras = await readHomeExtras(server({}, { rows, total: 140 }).admin, off, now);
    expect(extras.queue).toMatchObject({ total: 140 });
    const html = text(render(dashboard(tables()), extras));
    expect(html).toContain("140 answers wait for us");
    expect(html).toContain("Of the oldest 100");
    expect(html).not.toContain("100+");
  });
});
