import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { parentScheduleStore } from "@/lib/parent-schedule-store";
vi.mock("server-only", () => ({}));

function database(tables: Record<string, Record<string, unknown>[]>, deleted = false) {
  const reads: { table: string; filters: [string, unknown][] }[] = [];
  let fail = "";
  const client = {
    rpc: async (name: string) => { expect(name).toBe("my_family_deletion_state"); return { data: deleted, error: null }; },
    from(table: string) {
      const filters: [string, unknown][] = []; let after: [string, string] | null = null, limit = 1000, single = false;
      const query = {
        select: () => query, eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        in: (key: string, value: unknown[]) => { filters.push([key, value]); return query; },
        gt: (key: string, value: string) => { after = [key, value]; return query; }, order: () => query,
        limit: (n: number) => { limit = n; return query; }, maybeSingle: () => { single = true; return query; },
        then(resolve: (value: unknown) => unknown) {
          reads.push({ table, filters: [...filters] });
          const rows = (tables[table] ?? []).filter(r => filters.every(([k, v]) => Array.isArray(v) ? v.includes(r[k]) : r[k] === v))
            .filter(r => !after || String(r[after[0]]) > after[1]).sort((a, b) => String(a.id).localeCompare(String(b.id))).slice(0, limit);
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: table === fail ? { message: "failed" } : null }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, reads, fail: (table: string) => { fail = table; } };
}

it("uses the owned session child and removes pending child deletions before any schedule read", async () => {
  const db = database({ children: [{ id: "c1", parent_id: "p1", first_name: "Leah" }, { id: "c2", parent_id: "p2", first_name: "Other" }], child_deletions: [{ child_id: "c1", parent_id: "p1" }] });
  const store = parentScheduleStore(db.client, db.client, "p1");
  expect(await store.children("p1")).toEqual([]);
  await expect(store.children("p2")).rejects.toThrow("family refused");
  expect(db.reads.every(r => r.filters.some(([key, value]) => key === "parent_id" && value === "p1"))).toBe(true);
  const fenced = database({}, true);
  await expect(parentScheduleStore(fenced.client, fenced.client, "p1").children("p1")).rejects.toThrow("family unavailable");
  expect(fenced.reads).toEqual([]);
});

it("reads the named approval revision and allows the original draft fallback only for revision 1", async () => {
  const db = database({ workbook_drafts: [{ id: "b1", parent_id: "p1", child_id: "c1", number: 1, schema_version: 2, draft: { id: "frozen-original" } }],
    workbook_draft_revisions: [{ draft_id: "b1", revision: 1, content: null, rendering: null }, { draft_id: "b1", revision: 2, content: { id: "UNAPPROVED" } }, { draft_id: "b1", revision: 3, content: null }] });
  const store = parentScheduleStore(db.client, db.client, "p1");
  expect(await store.revision("p1", "c1", "b1", 1)).toMatchObject({ draft: { id: "frozen-original" } });
  expect(db.reads.find(r => r.table === "workbook_draft_revisions")?.filters).toEqual([["draft_id", "b1"], ["revision", 1]]);
  expect(await store.revision("p1", "c1", "b1", 3)).toBeNull();
  expect(await store.revision("p1", "foreign", "b1", 1)).toBeNull();
});

it("reads every immutable receipt with exact family, child, book and revision scope", async () => {
  const receipts = Array.from({ length: 101 }, (_, i) => ({ id: String(i).padStart(4, "0"), parent_id: "p1", child_id: "c1", workbook_id: "b1", page_id: "page1", printed_revision: "r1", status: "accepted" }));
  const foreign = [
    { ...receipts[0], id: "foreign", parent_id: "p2" }, { ...receipts[0], id: "sibling", child_id: "c2" },
    { ...receipts[0], id: "book", workbook_id: "b2" }, { ...receipts[0], id: "revision", printed_revision: "r2" },
  ];
  const db = database({ workbook_scan_receipts: [...receipts, ...foreign],
    scan_photos: [{ id: "unrecorded", state: "saved", sent_at: "then" }], scan_calibrations: [{ state: "ready", result: { sheetCheck: 1 } }] });
  const store = parentScheduleStore(db.client, db.client, "p1");
  expect(await store.receipts("p1", "c1", "b1", "r1")).toHaveLength(101);
  expect(db.reads).toHaveLength(3);
  for (const read of db.reads) {
    expect(read.table).toBe("workbook_scan_receipts");
    expect(read.filters).toEqual([["parent_id", "p1"], ["child_id", "c1"], ["workbook_id", "b1"], ["printed_revision", "r1"], ["status", "accepted"]]);
  }
  db.fail("workbook_scan_receipts"); await expect(store.receipts("p1", "c1", "b1", "r1")).rejects.toThrow("read failed");
});

it("reads the effective marks of this book and printed revision only, page by page, and refuses another family", async () => {
  // Wrong if (review 9): the read takes every book's marks of the child, or stops after one page of rows.
  const identity = (i: number, workbookId = "b1", printedRevision = "r1") => ({ workbookId, printedRevision, pageId: "page1", itemId: `q${i}` });
  const row = (id: string, i: number, over: Record<string, unknown> = {}) => {
    const ident = identity(i, (over.workbook_id as string) ?? "b1", (over.printed_revision as string) ?? "r1");
    return { id, parent_id: "p1", child_id: "c1", workbook_id: ident.workbookId, printed_revision: ident.printedRevision, evidence_at: "2026-11-05T00:00:00Z",
      model: null, prompt: null, original_event: null, event_id: null,
      expected: { identity: ident, number: 1, method: "code", scoredRegions: ["a"], mastery: { eligible: false, reason: "no-teaching-context" }, teaching: null },
      observation: { version: 1, identity: ident, evidence: null, readAnswerText: "7", regions: [{ regionId: "a", text: "7", value: "7", certainty: "certain" }],
        certainty: "certain", state: "parent-checked", method: "parent", result: "right", teaching: null, mastery: { eligible: false, reason: "no-teaching-context" },
        help: "none", actor: "parent", resultVersion: 1 }, ...over };
  };
  const own = Array.from({ length: 501 }, (_, i) => row(String(i).padStart(4, "0"), i));
  const db = database({ scan_marking_items: [...own, row("x-book", 1, { workbook_id: "b2" }), row("x-print", 1, { printed_revision: "r2" }),
    row("x-family", 1, { parent_id: "p2" }), row("x-child", 1, { child_id: "c2" })] });
  const store = parentScheduleStore(db.client, db.client, "p1");
  const marks = await store.marks("p1", "c1", "b1", "r1");
  expect(marks).toHaveLength(501);
  expect(marks.every(m => m.expected.identity.workbookId === "b1" && m.expected.identity.printedRevision === "r1")).toBe(true);
  for (const read of db.reads) {
    expect(read.table).toBe("scan_marking_items");
    expect(read.filters).toEqual([["parent_id", "p1"], ["child_id", "c1"], ["workbook_id", "b1"], ["printed_revision", "r1"]]);
  }
  await expect(store.marks("p2", "c1", "b1", "r1")).rejects.toThrow("family refused");
  db.fail("scan_marking_items"); await expect(store.marks("p1", "c1", "b1", "r1")).rejects.toThrow("read failed");
});
