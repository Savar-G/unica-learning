import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/scan-photo-server", () => ({ SCAN_BUCKET: "scan-photos", scanPath: (parent: string, photo: string) => `${parent}/${photo}/photo.jpg` }));
import { scanCropStore } from "@/lib/scan-crops-store";

// Which of the child's other pages the crop job compares with. A page left out of the list is a near twin that nobody
// checks, so a sheet of that page can pass as this one. The fake answers as PostgREST does: at most `maxRows` rows, with no
// word that it cut the answer short.

const PARENT = "11111111-1111-4111-8111-111111111111", CHILD = "22222222-2222-4222-8222-222222222222", PHOTO = "33333333-3333-4333-8333-333333333333";
const BOOK = "44444444-4444-4444-8444-444444444444", PAGE = "55555555-5555-4555-8555-555555555555";
const SIZE = { image_width: 1275, image_height: 1650 };
type Row = Record<string, unknown>;
const pageId = (n: number) => `66666666-6666-4666-8666-${String(n).padStart(12, "0")}`;

function fakeDb(tables: Record<string, Row[]>, o: { maxRows?: number; failPagesAfter?: number } = {}) {
  let pageReads = 0;
  const query = (table: string) => {
    const tests: ((r: Row) => boolean)[] = [];
    let sorted: string | null = null, limit = Infinity;
    const builder = {
      select: () => builder,
      eq: (c: string, v: unknown) => { tests.push((r) => r[c] === v); return builder; },
      neq: (c: string, v: unknown) => { tests.push((r) => r[c] !== v); return builder; },
      gt: (c: string, v: string) => { tests.push((r) => String(r[c]) > v); return builder; },
      in: (c: string, v: unknown[]) => { tests.push((r) => v.includes(r[c])); return builder; },
      not: (c: string) => { tests.push((r) => r[c] !== null); return builder; },
      order: (c: string) => { sorted = c; return builder; },
      limit: (n: number) => { limit = n; return builder; },
      rows: () => {
        const found = tables[table].filter((r) => tests.every((t) => t(r)));
        if (sorted) found.sort((a, b) => (String(a[sorted!]) < String(b[sorted!]) ? -1 : 1));
        return found.slice(0, Math.min(limit, o.maxRows ?? 1000));
      },
      maybeSingle: async () => ({ data: builder.rows()[0] ?? null, error: null }),
      then: (done: (v: unknown) => unknown) => {
        if (table === "workbook_pages" && ++pageReads > (o.failPagesAfter ?? Infinity)) return Promise.resolve({ data: null, error: { message: "down" } }).then(done);
        return Promise.resolve({ data: builder.rows(), error: null }).then(done);
      },
    };
    return builder;
  };
  return { db: { from: query } as unknown as SupabaseClient<Database>, pageReads: () => pageReads };
}

function family(pages: Row[]) {
  return {
    scan_photos: [{ id: PHOTO, parent_id: PARENT, state: "saved", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86_400_000).toISOString(), printed_revision: "r", page_id: PAGE, workbook_id: BOOK }],
    workbooks: [{ id: BOOK, parent_id: PARENT, child_id: CHILD, printed_revision: "r" }],
    workbook_questions: [],
    workbook_pages: [{ id: PAGE, parent_id: PARENT, workbook_id: BOOK, page_number: 5, page_type: "practice", image_path: "self.png", print_contract: null, qr_token: "t", ...SIZE }, ...pages],
  };
}
const other = (n: number, path = `other-${n}.png`, more: Row = {}) => ({ id: pageId(n), parent_id: PARENT, workbook_id: BOOK, page_number: n, page_type: "practice", image_path: path, ...SIZE, ...more });
const othersOf = async (db: SupabaseClient<Database>) => (await scanCropStore(db).frame({ parent: PARENT, photo: PHOTO }))!.page.others;

describe("the child's other pages", () => {
  it("finds the only near twin when it is candidate 1,001 of 1,001", async () => {
    // Disproved if the answer stops at the database's 1,000-row limit.
    const pages = Array.from({ length: 1000 }, (_, i) => other(i + 1));
    const { db } = fakeDb(family([...pages, other(1001, "the-twin.png")]));
    const found = await othersOf(db);
    expect(found).toHaveLength(1001);
    expect(found).toContain("the-twin.png");
  });

  it("gets every page in the same order, whatever order the database holds them in", async () => {
    // Disproved if pages are repeated or skipped between one read and the next.
    const pages = Array.from({ length: 1203 }, (_, i) => other(i + 1));
    const a = await othersOf(fakeDb(family(pages)).db), b = await othersOf(fakeDb(family([...pages].reverse())).db);
    expect(new Set(a).size).toBe(1203);
    expect(b).toEqual(a);
  });

  it("gets every page when the database's limit is smaller than a read asks for", async () => {
    // A shorter answer than asked for does not mean the last one.
    const { db } = fakeDb(family(Array.from({ length: 250 }, (_, i) => other(i + 1))), { maxRows: 100 });
    expect(await othersOf(db)).toHaveLength(250);
  });

  it("fails the job when a later read fails, so no page goes unchecked", async () => {
    const { db } = fakeDb(family(Array.from({ length: 1001 }, (_, i) => other(i + 1))), { failPagesAfter: 2 });
    await expect(othersOf(db)).rejects.toThrow(/other pages/);
  });

  it("leaves out another size, another kind, another child's book and this page", async () => {
    const pages = [other(1), other(2, "wide.png", { image_width: 2000 }), other(3, "review.png", { page_type: "review" }), other(4, "their.png", { workbook_id: "77777777-7777-4777-8777-777777777777" })];
    expect(await othersOf(fakeDb(family(pages)).db)).toEqual(["other-1.png"]);
  });
});
