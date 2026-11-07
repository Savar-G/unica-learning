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

it("reads all scan pages through pagination, scopes calibration and propagates failed reads", async () => {
  const photos = Array.from({ length: 101 }, (_, i) => ({ id: String(i).padStart(4, "0"), parent_id: "p1", child_id: "c1", workbook_id: "b1", page_id: "page1", printed_revision: "r1", state: "expired", sent_at: "then" }));
  const db = database({ scan_photos: photos, scan_calibrations: photos.map(p => ({ photo_id: p.id, parent_id: "p1", state: "ready", printed_revision: "r1", result: { sheetCheck: 1 } })) });
  const store = parentScheduleStore(db.client, db.client, "p1");
  const scans = await store.scans("p1", "c1", "b1");
  expect(scans).toHaveLength(101); expect(scans.every(s => s.calibration?.sheetCheck === 1)).toBe(true);
  expect(db.reads.filter(r => r.table === "scan_photos")).toHaveLength(3);
  expect(db.reads.every(r => r.filters.some(([k, v]) => k === "parent_id" && v === "p1"))).toBe(true);
  db.fail("scan_calibrations"); await expect(store.scans("p1", "c1", "b1")).rejects.toThrow("read failed");
});
