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

it("reads marks through the scoped effective marking projection, page by page, and refuses another family", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const service = { rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return { data: [], error: null }; } } as unknown as SupabaseClient<Database>;
  const store = parentScheduleStore(service, service, "p1");
  expect(await store.marks("p1", "c1")).toEqual([]);
  expect(calls).toEqual([{ name: "scan_marking_command", args: { p_action: "effective", p_parent: "p1", p_photo: null, p_token: null, p_data: { child: "c1", after: null } } }]);
  await expect(store.marks("p2", "c1")).rejects.toThrow("family refused");
  expect(calls).toHaveLength(1);
});
