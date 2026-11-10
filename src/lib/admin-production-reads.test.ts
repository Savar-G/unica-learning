// The Production reader (readProductionBase, listProduction) through a fake PostgREST server: complete rows per child,
// test families on their own read, the delivery corrections, and a constant number of requests for any number of runs.
// The fake server holds tables and answers the admin functions by their SQL contract
// (supabase/migrations/20261110213908_admin_production_reads.sql): runs and books from each child's floor up.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { buildBooks, groupBooks, needsYouCount } from "@/lib/admin-production";
import { listProduction, PRODUCTION_MAX, readProductionBase, type AdminSession } from "@/lib/admin-store";
import { workbookDeliveryStore } from "@/lib/workbook-delivery-store";
import type { Database } from "@/lib/database";
import { ProductionBoard } from "@/components/admin-production";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }), usePathname: () => "/admin/workbooks", useSearchParams: () => new URLSearchParams() }));

const now = new Date("2026-11-10T20:00:00.000Z");
const days = (n: number) => new Date(+now - n * 86_400_000).toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Row = Record<string, unknown>;
const ACTIVE = ["queued", "running"];

/** The floor rule of admin_production_runs and admin_production_books. */
function floors(tables: Record<string, Row[]>) {
  const top = new Map<string, number>(), live = new Map<string, number>();
  for (const w of tables.workbooks ?? []) top.set(String(w.child_id), Math.max(top.get(String(w.child_id)) ?? 0, Number(w.number)));
  for (const r of tables.workbook_runs ?? []) if (ACTIVE.includes(String(r.status))) live.set(String(r.child_id), Math.min(live.get(String(r.child_id)) ?? Infinity, Number(r.number)));
  return (child: string) => Math.min(top.get(child) ?? 0, live.get(child) ?? top.get(child) ?? 0);
}

function server(tables: Record<string, Row[]>) {
  const requests: string[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const name = url.pathname.split("/").at(-1)!;
    const rpc = url.pathname.includes("/rpc/");
    requests.push(rpc ? `rpc:${name}` : name);
    const args = (init?.body ? JSON.parse(String(init.body)) : {}) as Record<string, string[]>;
    const floor = floors(tables);
    let rows: Row[] =
      name === "admin_production_runs" ? (tables.workbook_runs ?? []).filter((r) => Number(r.number) >= floor(String(r.child_id)))
      : name === "admin_production_books" ? (tables.workbooks ?? []).filter((w) => Number(w.number) >= floor(String(w.child_id)))
      : name === "admin_card_setups" ? tables.card_setups ?? []
      : name === "admin_children" ? tables.children ?? []
      : name === "admin_parents" ? tables.parents ?? []
      : name === "admin_latest_draft_revisions" ? args.p_drafts.flatMap((d) => {
        const latest = (tables.workbook_draft_revisions ?? []).filter((r) => r.draft_id === d).sort((x, y) => Number(y.revision) - Number(x.revision))[0];
        return latest ? [{ draft_id: d, revision: latest.revision, counts: (latest.content as Row | null)?.counts ?? null, render_problems: latest.render_problems }] : [];
      })
      : name === "admin_run_activity" ? args.p_runs.map((r) => ({ run_id: r, page_times: [days(0.01)], last_call_at: null, last_solve_at: null, plan_at: days(0.02), resumed_at: null }))
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
    const order = url.searchParams.get("order");
    if (order) {
      const keys = order.split(",").map((o) => o.split("."));
      rows.sort((a, b) => {
        for (const [key, dir] of keys) {
          const c = String(a[key]).localeCompare(String(b[key]), "en", { numeric: true });
          if (c) return dir === "desc" ? -c : c;
        }
        return 0;
      });
    }
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? rows.length);
    const accept = new Headers(init?.headers).get("accept") ?? "";
    const out = rows.slice(offset, offset + limit);
    return Response.json(accept.includes("vnd.pgrst.object") ? out[0] ?? null : out);
  };
  const db = createClient<Database>("https://example.com", "test", { global: { fetch: fetch as typeof globalThis.fetch } });
  const count = () => requests.reduce((m, r) => ({ ...m, [r]: (m[r] ?? 0) + 1 }), {} as Record<string, number>);
  return { admin: { db, userId: id(9999), email: "admin@example.com" } as AdminSession, requests, count };
}

const book = (n: number, o: Row = {}): Row => ({
  id: id(n), parent_id: id(n + 100_000), child_id: id(n + 200_000), number: 1, levels: [4], status: "shipped", pdf_path: null,
  profile_build: null, created_at: days(2), approved_at: days(2), printed_at: days(1), shipped_at: days(1), ...o,
});
const run = (n: number, o: Row = {}): Row => ({
  id: id(n), parent_id: id(n + 100_000), child_id: id(n + 200_000), number: 1, status: "done", step: null, attempts: 1, max_attempts: 2,
  done_pages: null, total_pages: null, heartbeat_at: days(1), started_at: days(1), finished_at: days(1), error: null, errors: [],
  draft_id: null, draft_key: "k", resumes: 0, started_by: null, started_by_email: null, runner: "mac", stopped_by_email: null, created_at: days(1), ...o,
});
const off = { show: false, isTest: () => false };
const asInput = (base: Awaited<ReturnType<typeof readProductionBase>>, tests: { show: boolean; isTest: (p: string) => boolean } = off) =>
  ({ ...base, runs: base.runs.map((r) => ({ run: r })), deliveries: [], tests });

describe("complete rows per child (review #835 finding 1, #837 finding 2)", () => {
  it("keeps an older child's shipped stage when 500 other stored books are newer", async () => {
    const old = book(1, { created_at: days(100) });
    const { admin } = server({
      workbooks: [old, ...Array.from({ length: 500 }, (_, i) => book(i + 2))],
      card_setups: [{ id: id(700_000), child_id: old.child_id, parent_id: old.parent_id, card_saved_at: days(101) }],
    });
    const base = await readProductionBase(admin, []);
    expect(base.workbooks).toHaveLength(501);
    expect(base.incomplete).toBe(false);
    const books = buildBooks(asInput(base), now);
    expect(books.find((b) => b.childId === old.child_id)?.stage).toBe("shipped");
  });

  it("keeps real children and their count when 500 newer test cards are shown", async () => {
    const testParents = Array.from({ length: 63 }, (_, i) => id(10_000 + i));
    const isTest = (p: string) => testParents.includes(p);
    const realParent = id(19_001), realChild = id(19_002);
    const { admin } = server({ card_setups: [
      ...Array.from({ length: 500 }, (_, i) => ({ id: id(30_000 + i), child_id: id(i + 1), parent_id: testParents[Math.floor(i / 8)], card_saved_at: days(1) })),
      { id: id(40_000), child_id: realChild, parent_id: realParent, card_saved_at: days(2) },
    ] });
    const hidden = buildBooks(asInput(await readProductionBase(admin, testParents), { show: false, isTest }), now);
    const shown = buildBooks(asInput(await readProductionBase(admin, testParents, { withTests: true }), { show: true, isTest }), now);
    expect(needsYouCount(hidden)).toBe(1);
    expect(needsYouCount(shown)).toBe(1);
    expect(shown.some((b) => b.childId === realChild)).toBe(true);
    expect(shown).toHaveLength(501);
  });

  it("fails closed past PRODUCTION_MAX rows: the children from the cut on are left out whole, and the page says so", async () => {
    // 1,001 children with two failed runs each (no stored book): 2,002 runs, more than one read holds.
    const runs = Array.from({ length: 1001 }, (_, i) => [run(2 * i + 1, { child_id: id(500_000 + i), parent_id: id(600_000 + i), status: "failed" }),
      run(2 * i + 2, { child_id: id(500_000 + i), parent_id: id(600_000 + i), status: "failed" })]).flat();
    // A saved card of the last child: its runs are past the cut, so it must not get "Prepare workbook" from partial rows.
    const last = runs.at(-1)!;
    const { admin } = server({ workbook_runs: runs, card_setups: [{ id: id(800_000), child_id: last.child_id, parent_id: last.parent_id, card_saved_at: days(3) }] });
    const base = await readProductionBase(admin, []);
    expect(runs.length).toBeGreaterThan(PRODUCTION_MAX);
    expect(base.incomplete).toBe(true);
    const books = buildBooks(asInput(base), now);
    expect(books.length).toBeLessThan(1001);
    // Every child shown has both of its runs; the last child (and its card) is left out.
    expect(books.every((b) => b.tries.length === 2)).toBe(true);
    expect(books.some((b) => b.childId === last.child_id)).toBe(false);
    const html = renderToStaticMarkup(createElement(ProductionBoard, { books, now, runner: "mac", incomplete: true }));
    expect(html).toContain(`Some books could not be loaded. Showing the first ${books.length}.`);
  });
});

describe("delivery times (review #835 finding 2)", () => {
  it("uses the corrected delivery time in Production, like the workbook detail reader", async () => {
    const w = book(1, { created_at: days(62), approved_at: days(62), printed_at: days(61), shipped_at: days(61) });
    const receipt = { workbook_id: w.id, child_id: w.child_id, parent_id: w.parent_id, number: 1, delivered_at: days(60), local_time: "2026-09-11T13:00",
      time_zone: "America/Vancouver", zone_override: false, recorded_at: days(1), actor_id: id(7000), audit_id: 1 };
    const correction = { ...receipt, id: id(8000), delivered_at: days(1), previous_delivered_at: days(60), reason: "Correct date", audit_id: 2 };
    const older = { ...correction, id: id(8001), delivered_at: days(30), audit_id: 1 };
    const { admin } = server({ workbooks: [w], workbook_delivery_receipts: [receipt], workbook_delivery_corrections: [older, correction] });
    const canonical = await workbookDeliveryStore(admin.db).receipt(String(w.id));
    expect(canonical?.deliveredAt).toBe(days(1));
    const data = await listProduction(admin, { ids: [], show: false }, now);
    const current = buildBooks({ ...data, tests: off }, now)[0];
    expect(current.deliveredAt).toBe(canonical?.deliveredAt);
    expect(current.stage).toBe("delivered");
  });

  it("gives no delivery when the latest correction is of another book, like the workbook detail reader", async () => {
    const w = book(1);
    const receipt = { workbook_id: w.id, child_id: w.child_id, parent_id: w.parent_id, number: 1, delivered_at: days(1), local_time: "2026-11-09T12:00",
      time_zone: "America/Vancouver", zone_override: false, recorded_at: days(1), actor_id: id(7000), audit_id: 1 };
    const wrong = { ...receipt, id: id(8000), number: 2, previous_delivered_at: days(1), reason: "x", audit_id: 2 };
    const { admin } = server({ workbooks: [w], workbook_delivery_receipts: [receipt], workbook_delivery_corrections: [wrong] });
    expect(await workbookDeliveryStore(admin.db).receipt(String(w.id))).toBeNull();
    const data = await listProduction(admin, { ids: [], show: false }, now);
    expect(buildBooks({ ...data, tests: off }, now)[0].stage).toBe("shipped");
  });
});

describe("Done with test families showing (review #835 finding 3)", () => {
  it("keeps test books out of Show older and out of the Done cut", () => {
    const workbooks = Array.from({ length: 13 }, (_, i) => ({
      id: id(i + 1), childId: id(i + 1), parentId: i ? id(9000 + Math.floor((i - 1) / 8)) : id(9999), number: 1, levels: [4],
      status: "shipped" as const, pdfPath: null, profileBuild: null, createdAt: days(62), approvedAt: days(62), printedAt: days(61), shippedAt: days(61),
    }));
    const data = { runs: [], cards: [], plans: [], workbooks, deliveries: workbooks.map((w) => ({ workbookId: w.id, deliveredAt: days(60) })),
      tests: { show: true, isTest: (p: string) => p !== id(9999) } };
    const done = groupBooks(buildBooks(data, now), now).at(-1)!;
    expect(done).toMatchObject({ count: 1, older: 0, olderTests: 0 });
    expect(done.books.some((b) => !b.test)).toBe(true);
  });

  it("counts only real books in Show older when the real list is long", () => {
    const real = Array.from({ length: 14 }, (_, i) => ({ parent: id(20_000 + i), at: days(i < 2 ? 40 : 1) }));
    const tests = Array.from({ length: 5 }, (_, i) => ({ parent: id(30_000 + i), at: days(50) }));
    const all = [...real, ...tests].map((x, i) => ({ ...x, book: {
      id: id(40_000 + i), childId: id(50_000 + i), parentId: x.parent, number: 1, levels: [4], status: "shipped" as const, pdfPath: null, profileBuild: null,
      createdAt: days(70), approvedAt: days(70), printedAt: days(70), shippedAt: days(70) } }));
    const isTest = (p: string) => tests.some((t) => t.parent === p);
    const data = { runs: [], cards: [], plans: [], workbooks: all.map((x) => x.book), deliveries: all.map((x) => ({ workbookId: x.book.id, deliveredAt: x.at })) };
    const on = groupBooks(buildBooks({ ...data, tests: { show: true, isTest } }, now), now).at(-1)!;
    const hidden = groupBooks(buildBooks({ ...data, tests: { show: false, isTest } }, now), now).at(-1)!;
    expect(on).toMatchObject({ count: 14, older: 2, olderTests: 5 });
    expect(hidden).toMatchObject({ count: 14, older: 2, olderTests: 0 });
    expect(on.books.filter((b) => !b.test).map((b) => b.childId)).toEqual(hidden.books.map((b) => b.childId));
    const html = renderToStaticMarkup(createElement(ProductionBoard, { books: buildBooks({ ...data, tests: { show: true, isTest } }, now), now, runner: "mac" }));
    expect(html).toContain("Show older (2)");
  });
});

describe("requests (review #837 finding 3)", () => {
  // `drafts` children with a finished draft waiting, `running` children with a book being made, 5 delivered books.
  function production(drafts: number, running: number) {
    const runs = [
      ...Array.from({ length: drafts }, (_, i) => run(i + 1, { draft_id: id(300_000 + i) })),
      ...Array.from({ length: running }, (_, i) => run(1000 + i, { status: "running", step: "write", finished_at: null, heartbeat_at: now.toISOString() })),
    ];
    const books = Array.from({ length: 5 }, (_, i) => book(2000 + i));
    return {
      workbook_runs: runs, workbooks: books,
      workbook_drafts: Array.from({ length: drafts }, (_, i) => ({ id: id(300_000 + i), schema_version: 2, pages: 60, questions: 150, failed: 1, not_checked: 0, failed_pages: 0, cover: {} })),
      workbook_draft_revisions: Array.from({ length: drafts }, (_, i) => [1, 2].map((revision) => ({ draft_id: id(300_000 + i), revision,
        content: { counts: { pages: 60, questions: 150, failed: 2 - revision, notChecked: 0, failedPages: 0 } }, render_problems: revision === 2 ? [{ page: 3 }, { page: 3 }] : [] }))).flat(),
      workbook_delivery_receipts: books.map((b) => ({ workbook_id: b.id, parent_id: b.parent_id, child_id: b.child_id, number: 1, delivered_at: days(1), audit_id: 1 })),
      children: [...runs, ...books].map((r) => ({ id: r.child_id, parent_id: r.parent_id, first_name: "Kid", created_at: days(9), grade: 2, province: "BC" })),
      parents: [...runs, ...books].map((r) => ({ id: r.parent_id, name: "Family", created_at: days(9), email: "f@example.com", postal: null, source: {} })),
    };
  }

  it("reads 20 drafts and 10 books being made in a constant 11 requests, with every detail", async () => {
    const small = server(production(1, 1));
    await listProduction(small.admin, { ids: [], show: false }, now);
    const { admin, requests, count } = server(production(20, 10));
    const data = await listProduction(admin, { ids: [], show: false }, now);
    expect(requests).toHaveLength(11);
    expect(small.requests).toHaveLength(11);
    expect(count()).toEqual({
      "rpc:admin_production_runs": 1, "rpc:admin_production_books": 1, "rpc:admin_card_setups": 1, child_plan_states: 1,
      "rpc:admin_children": 1, "rpc:admin_parents": 1, workbook_delivery_receipts: 1, workbook_delivery_corrections: 1,
      workbook_drafts: 1, "rpc:admin_latest_draft_revisions": 1, "rpc:admin_run_activity": 1,
    });
    const books = buildBooks({ ...data, tests: off }, now);
    const review = books.filter((b) => b.stage === "review");
    const making = books.filter((b) => b.stage === "making");
    expect(review).toHaveLength(20);
    expect(making).toHaveLength(10);
    // The latest revision's counts and its pages that did not render (one page, named twice).
    expect(review.every((b) => b.run?.counts?.failed === 0 && b.run?.notRendered === 1)).toBe(true);
    expect(making.every((b) => b.run?.activity?.writingStartedAt === days(0.02))).toBe(true);
    expect(books.filter((b) => b.stage === "delivered")).toHaveLength(5);
  });

  it("the sidebar badge reads only the 4 base sources, never a run's details", async () => {
    const { admin, requests } = server(production(20, 10));
    const base = await readProductionBase(admin, []);
    expect(requests.sort()).toEqual(["child_plan_states", "rpc:admin_card_setups", "rpc:admin_production_books", "rpc:admin_production_runs"]);
    const page = await listProduction(server(production(20, 10)).admin, { ids: [], show: false }, now);
    // The same Needs you count as the page.
    expect(needsYouCount(buildBooks(asInput(base), now))).toBe(needsYouCount(buildBooks({ ...page, tests: off }, now)));
    expect(needsYouCount(buildBooks(asInput(base), now))).toBe(20);
  });
});
