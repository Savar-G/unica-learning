import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "./database";
import { workbookProgressHistoryStore } from "./workbook-progress-history-store";
import { previewNextWorkbookPlanFromHistory, readWorkbookProgressHistory } from "./workbook-progress-history";
import { historyFixture, historyId } from "./workbook-progress-history.fixture";
vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
type Call = { table: string; params: URLSearchParams; method: string; prefer: string; path: string };
type Reply = { rows: unknown; count?: number | null; status?: number };
function setup(options: { cap?: number; hook?: (c: Call, rows: Row[], count: number, calls: Call[], tables: Record<string, Row[]>) => Reply | undefined } = {}) {
  const f = historyFixture(), calls: Call[] = [], tables = f.tables;
  const db = createClient<Database>("https://history.example.invalid", "synthetic-no-credentials", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const c: Call = { table: url.pathname.split("/").at(-1)!, params: url.searchParams, method: init?.method ?? "GET",
        prefer: new Headers(init?.headers).get("prefer") ?? "", path: url.pathname };
      calls.push(c);
      if (!Object.hasOwn(tables, c.table) || !["GET", "HEAD"].includes(c.method) || !c.path.startsWith("/rest/v1/")) throw Error("forbidden synthetic boundary");
      let rows: Row[] = tables[c.table].map(r => {
        if (c.table !== "scan_mark_changes") return { ...r };
        const mark = tables.scan_marking_items.find(m => m.id === r.item_id);
        return { ...r, scan_marking_items: mark && { workbook_id: mark.workbook_id, printed_revision: mark.printed_revision } };
      });
      const value = (r: Row, field: string): unknown => field.split(".").reduce<unknown>((v, k) => v && typeof v === "object" ? (v as Row)[k] : undefined, r);
      for (const [field, condition] of c.params) {
        if (condition.startsWith("eq.")) rows = rows.filter(r => String(value(r, field)) === condition.slice(3));
        if (condition.startsWith("gt.")) rows = rows.filter(r => typeof value(r, field) === "number"
          ? Number(value(r, field)) > Number(condition.slice(3)) : String(value(r, field)) > condition.slice(3));
        if (condition.startsWith("in.(")) {
          const accepted = condition.slice(4, -1).split(",").map(x => x.replace(/^"|"$/g, ""));
          rows = rows.filter(r => accepted.includes(String(value(r, field))));
        }
      }
      const order = c.params.get("order")?.split(".")[0];
      if (order) rows.sort((a, b) => a[order]! < b[order]! ? -1 : a[order]! > b[order]! ? 1 : 0);
      const count = rows.length, limit = c.params.get("limit");
      if (limit !== null) rows = rows.slice(0, Math.min(Number(limit), options.cap ?? Infinity));
      const reply = options.hook?.(c, rows, count, calls, tables) ?? { rows, count };
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (c.prefer.includes("count=exact") && reply.count !== null) headers["Content-Range"] = `*/${reply.count ?? count}`;
      return new Response(c.method === "HEAD" ? null : JSON.stringify(reply.rows), { status: reply.status ?? 200, headers });
    } },
  });
  return { ...f, calls, tables, store: workbookProgressHistoryStore(db) };
}

describe("read-only typed Supabase history store with synthetic fetch", () => {
  // Falsifiers: any service/image/Storage access, wrong filters, offset, truncated success, missing count,
  // or loss of the old written answer at the public planner boundary.
  it("paginates canonical items, journal and relevant events into the real preview with a smaller server cap", async () => {
    const f = setup({ cap: 37 });
    for (let n = 0; n < 105; n++) f.parentChange(n, n < 100 ? "right" : "wrong");
    const result = await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning);
    expect(result.ok, result.ok ? undefined : result.reason).toBe(true);
    if (!result.ok) return;
    expect(result.preview.decision).toMatchObject({ action: "repeat-new-numbers", target: { step: 2 }, score: { required: 123, independentFirstRight: 100 } });
    expect(result.preview.decision.items.filter(i => i.first?.observation.readAnswerText === "56")).toHaveLength(23);
    const parts = result.preview.plan.days.flatMap(d => d.pages.flatMap(p => p.parts));
    expect(parts.filter(p => p.step?.skill === f.input.curriculum.skill.id).every(p => p.step?.step === 2)).toBe(true);
    const fix = parts.flatMap(p => p.fixIt ?? []).find(p => p.skill === f.input.curriculum.skill.id)!;
    expect(fix.avoid.events).toContain(historyId(5122));
    expect(fix.avoid.questions).toContainEqual({ source: "workbook", workbookId: f.input.books[1].workbookId, page: 123, question: 1 });
    expect(result.retained.proof.counts).toMatchObject({ items: 126, changes: 105, events: 126 });
    expect(result.retained.held.map(h => h.original.day)).toEqual([8, 9, 10]);
    for (const table of ["scan_marking_items", "scan_mark_changes", "learning_events"]) {
      const pages = f.calls.filter(c => c.table === table && c.method === "GET");
      expect(pages.length).toBeGreaterThan(3);
      expect(pages.every(c => c.params.get("order") === "id.asc" && c.params.get("limit") === "100" && c.prefer.includes("count=exact"))).toBe(true);
      expect(pages.some(c => c.params.get("id")?.startsWith("gt."))).toBe(true);
    }
    expect(f.calls.every(c => !c.params.has("offset"))).toBe(true);
    expect(f.calls.every(c => !/photo|storage|profile|job|cost|auth/.test(c.path))).toBe(true);
    expect(f.calls.every(c => ["GET", "HEAD"].includes(c.method))).toBe(true);
    expect(f.calls.every(c => !c.params.get("select")?.includes("*"))).toBe(true);
    for (const c of f.calls.filter(c => ["scan_marking_items", "scan_mark_changes", "learning_events"].includes(c.table))) {
      expect(c.params.get("parent_id")).toBe(`eq.${f.input.snapshot.parentId}`);
      expect(c.params.get("child_id")).toBe(`eq.${f.input.snapshot.childId}`);
      if (c.table === "scan_mark_changes") {
        expect(c.params.get("scan_marking_items.workbook_id")).toMatch(/^eq\./);
        expect(c.params.get("scan_marking_items.printed_revision")).toBe(`eq.${f.input.books[0].printedRevision}`);
      } else expect(c.params.get("workbook_id")).toMatch(/^eq\./);
    }
  });

  it("repeated reads of the same photo identities do not create attempts or change old readings", async () => {
    const f = setup();
    for (const e of f.events) e.evidence_id = historyId(999);
    const laterCutoff = f.input.snapshot.cutoff;
    f.input.snapshot.cutoff = Date.parse("2026-02-01T12:00:00Z");
    const first = await readWorkbookProgressHistory(f.store, f.input);
    f.input.snapshot.cutoff = laterCutoff;
    const later = await readWorkbookProgressHistory(f.store, f.input);
    expect(first.ok && later.ok).toBe(true);
    if (!first.ok || !later.ok) return;
    expect(later.history).toEqual(first.history);
    expect(later.proof.usedVersions).toEqual(first.proof.usedVersions);
    expect(first.history.originals).toHaveLength(123);
  });

  it.each(["scan_marking_items", "scan_mark_changes", "learning_events"])("refuses a dropped second response page in %s", async table => {
    const f = setup({ hook(c, rows, count) {
      if (c.table === table && c.method === "GET" && c.params.has("id")) return { rows: [], count: 0 };
      return { rows, count };
    } });
    for (let n = 0; n < 105; n++) f.parentChange(n, n < 100 ? "right" : "wrong");
    const r = await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning);
    expect(r).toMatchObject({ ok: false, availability: "unavailable" });
    expect(r).not.toHaveProperty("preview");
  });

  it.each(["source-error", "no-count", "truncated", "repeat-cursor", "cap-zero", "oversize"])("refuses %s from synthetic PostgREST", async mode => {
    const f = setup({ hook(c, rows, count, _calls, tables) {
      if (c.table !== "scan_marking_items" || c.method !== "GET") return { rows, count };
      if (mode === "source-error") return { rows: { message: "synthetic failure", code: "XX000" }, status: 500, count: null };
      if (mode === "no-count") return { rows, count: null };
      if (mode === "truncated") return { rows: rows.slice(0, 50), count: 50 };
      if (mode === "repeat-cursor" && c.params.has("id")) return { rows: [tables.scan_marking_items[0]], count };
      if (mode === "cap-zero") return { rows: [], count };
      if (mode === "oversize") return { rows: Array(101).fill(rows[0]), count };
      return { rows, count };
    } });
    expect(await readWorkbookProgressHistory(f.store, f.input)).toMatchObject({ ok: false, availability: "unavailable" });
  });

  it.each(["revision", "freeze", "family-deletion", "child-deletion", "child-gone", "book-revision", "book-manifest", "book-owner", "page-day", "event-append"])("detects %s during pagination", async mode => {
    let changed = false;
    const f = setup({ hook(c, rows, count, _calls, tables) {
      if (!changed && c.table === "scan_marking_items" && c.method === "GET" && c.params.get("id")?.startsWith("gt.")) {
        changed = true;
        if (mode === "revision") tables.scan_marking_revisions[0].revision = 51;
        if (mode === "freeze") tables.parents[0].deletion_requested_at = "2026-11-07T13:00:00Z";
        if (mode === "family-deletion") tables.family_deletions.push({ parent_id: tables.parents[0].id });
        if (mode === "child-deletion") tables.child_deletions.push({ parent_id: tables.parents[0].id, child_id: tables.children[0].id });
        if (mode === "child-gone") tables.children.length = 0;
        if (mode === "book-revision") tables.workbooks[0].printed_revision = "b".repeat(28);
        if (mode === "book-manifest") tables.workbooks[0].print_manifest = {};
        if (mode === "book-owner") tables.workbooks[0].parent_id = historyId(999);
        if (mode === "page-day") tables.workbook_pages[0].print_contract = { version: 1, day: 8 };
        if (mode === "event-append") tables.learning_events.push({ ...tables.learning_events[0], id: historyId(9999) });
      }
      return { rows, count };
    } });
    expect(await readWorkbookProgressHistory(f.store, f.input)).toMatchObject({ ok: false, availability: "unavailable" });
    expect(changed).toBe(true);
  });

  it.each(["parent_id", "child_id", "workbook_id", "printed_revision"])("refuses returned rows with foreign %s despite query scope", async field => {
    const f = setup({ hook(c, rows, count) {
      if (c.table === "scan_marking_items" && c.method === "GET") return { rows: rows.map((r, n) => n === 0 ? { ...r, [field]: historyId(999) } : r), count };
      return { rows, count };
    } });
    expect(await readWorkbookProgressHistory(f.store, f.input)).toMatchObject({ ok: false });
  });

  it("returns no retained text after deletion and distinguishes missing scope from a source error", async () => {
    const f = setup(); f.tables.parents.length = 0;
    expect(await readWorkbookProgressHistory(f.store, f.input)).toEqual({ ok: false, availability: "unavailable", reason: "scope-unavailable" });
    const failed = setup({ hook(c, rows, count) { return c.table === "parents" ? { rows: { message: "unreadable" }, status: 500 } : { rows, count }; } });
    expect(await readWorkbookProgressHistory(failed.store, failed.input)).toEqual({ ok: false, availability: "unavailable", reason: "source-error" });
  });
});
