import { describe, expect, it, vi } from "vitest";
import { loadWorkbookProgressSources } from "./workbook-progress-source";
import { workbookProgressSourceStore } from "./workbook-progress-source-store";
import { sourceDbFixture } from "./workbook-progress-source.fixture";
import { historyId } from "./workbook-progress-history.fixture";
vi.mock("server-only", () => ({}));

describe("typed complete source loading through the real Supabase client", () => {
  it.each([1, 37, 100])("retains full catalogs and old written readings with an API cap of %s", async cap => {
    const f = sourceDbFixture({ cap });
    const result = await loadWorkbookProgressSources(workbookProgressSourceStore(f.db), f.request);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.outcome.requiredSample).toHaveLength(123);
    expect(result.frozen.books.reduce((n, b) => n + b.items.length, 0)).toBe(126);
    expect(result.frozen.books.flatMap(b => b.items).some(m => (m.observation as { readAnswerText: string }).readAnswerText === "56")).toBe(true);
    expect(f.calls.every(c => c.method === "GET")).toBe(true);
    for (const c of f.calls) {
      expect(c.params.has("offset")).toBe(false);
      expect(c.params.get("select")).not.toMatch(/photo|qr_token|image_path|pdf_path/);
      if (["workbook_pages", "workbook_questions", "scan_marking_items", "learning_events", "workbook_audit", "workbook_run_frames"].includes(c.table)) expect(c.params.get("parent_id")).toBe(`eq.${f.request.parentId}`);
      if (c.table === "child_profiles") expect(c.params.get("select")).not.toMatch(/(^|,)profile(,|$)/);
      if (c.table === "scan_marking_items") expect(c.params.get("printed_revision")).toBe(`eq.${f.request.printedRevision}`);
    }
    expect(f.calls.filter(c => c.table === "workbook_questions" && c.params.has("id")).length).toBeGreaterThan(0);
  });
  it("paginates retained parent changes and help without treating them as second tries", async () => {
    const f = sourceDbFixture({ cap: 37 });
    for (let n = 0; n < 105; n++) f.h.parentChange(n, "right");
    f.h.help(0);
    f.tables.scan_mark_changes = f.h.changes.map(c => ({ ...c }));
    f.tables.learning_events = f.h.events.map(e => ({ ...e }));
    const result = await loadWorkbookProgressSources(workbookProgressSourceStore(f.db), f.request);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.frozen.books.flatMap(b => b.changes)).toHaveLength(105);
    expect(result.frozen.books.flatMap(b => b.events).filter(e => e.source === "call")).toHaveLength(1);
    expect(result.outcome.sourceStatus.corrections).toBe("unavailable");
    expect(result.outcome.plan).toBeNull();
    expect(f.calls.filter(c => c.table === "scan_mark_changes" && c.params.has("id")).length).toBeGreaterThan(2);
  });
  it.each(["missing-count", "empty-positive", "count-drift", "duplicate-cursor"])("refuses %s pagination", async kind => {
    let n = 0;
    const f = sourceDbFixture({ cap: 37, hook: (c, tables) => {
      if (c.table !== "workbook_questions") return;
      n++;
      if (kind === "missing-count") return { missingCount: true };
      if (kind === "empty-positive") return { empty: true };
      if (kind === "count-drift" && n === 2) return { count: 999 };
      if (kind === "duplicate-cursor" && n === 2) return { rows: [tables.workbook_questions[0]] };
    } });
    expect(await loadWorkbookProgressSources(workbookProgressSourceStore(f.db), f.request)).toEqual({ ok: false, reason: "source-error" });
  });
  it.each(["parent-freeze", "family-deleting", "child-deleting", "deleted", "foreign-child", "missing-delivery", "legacy"])("refuses %s", async kind => {
    const f = sourceDbFixture();
    if (kind === "parent-freeze") f.tables.parents[0].deletion_requested_at = "2026-11-07";
    if (kind === "family-deleting") f.tables.family_deletions.push({ parent_id: f.request.parentId });
    if (kind === "child-deleting") f.tables.child_deletions.push({ parent_id: f.request.parentId, child_id: f.request.childId });
    if (kind === "deleted") f.tables.parents = [];
    if (kind === "foreign-child") f.tables.children[0].parent_id = historyId(88);
    if (kind === "missing-delivery") f.tables.workbook_delivery_receipts = [];
    if (kind === "legacy") f.tables.workbooks[0].printed_revision = null;
    expect(await loadWorkbookProgressSources(workbookProgressSourceStore(f.db), f.request)).toEqual({ ok: false, reason: "scope-unavailable" });
  });
  it("detects a family freeze between the two captures", async () => {
    let n = 0;
    const f = sourceDbFixture({ hook: (c, t) => { if (c.table === "parents" && ++n === 2) t.parents[0].deletion_requested_at = "2026-11-07"; } });
    expect(await loadWorkbookProgressSources(workbookProgressSourceStore(f.db), f.request)).toEqual({ ok: false, reason: "changed-during-read" });
  });
});
