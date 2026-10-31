import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { workbookDraftStore } from "@/lib/workbook-draft-store";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import type { GeneratedWorkbook, WorkbookDraftStore } from "@/lib/workbook-generator";

// The draft store's two adapters (#311) keep the same rules, through the store's interface: a sound draft is stored
// whole and read back as it was; a draft with a numbering problem, an unknown child or a used id is refused. The
// Supabase adapter talks to a fake PostgREST that keeps the rows and answers as Postgres does: the family write fence
// first (55000), then the foreign key (23503), then the primary key (23505).

const PARENT = "00000000-0000-4000-8000-0000000000a1";
const CHILD = "00000000-0000-4000-8000-0000000000c1";
const FENCED_PARENT = "00000000-0000-4000-8000-0000000000a2";
const FENCED_CHILD = "00000000-0000-4000-8000-0000000000c2";
const DRAFT = "00000000-0000-4000-8000-0000000000d1";

const page = (number: number, type: GeneratedWorkbook["pages"][number]["type"]) => ({
  number, type, dayLabel: null, day: null, pageOfDay: null, qrToken: `token-${String(number).padStart(12, "0")}`,
  fit: { status: "not-needed" as const }, attempts: 0 as const, questions: [], omissions: [],
  content: { kind: "blank" as const, id: `UL·LEAH·W01·BLANK·P${number}`, level: 10 },
});
const draft = (over: Partial<GeneratedWorkbook> = {}): GeneratedWorkbook => ({
  id: DRAFT, childId: CHILD, number: 1, levels: [10], profileBuild: null, model: "fake",
  pages: [page(1, "cover"), page(2, "how-plan"), page(3, "back-cover"), page(4, "blank")],
  counts: { pages: 4, questions: 0, checked: 0, notChecked: 0, failed: 0, failedPages: 0 },
  ...over,
});

function fakePostgrest(): WorkbookDraftStore & { requests: number } {
  const tables: Record<string, Record<string, unknown>[]> = {
    children: [{ id: CHILD, parent_id: PARENT }, { id: FENCED_CHILD, parent_id: FENCED_PARENT }],
    workbook_drafts: [],
  };
  let requests = 0;
  const db = createClient("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    requests++;
    const url = new URL(String(input));
    const table = url.pathname.replace("/rest/v1/", "");
    const rows = tables[table];
    if (!rows) throw new Error(`unexpected request ${url.pathname}`);
    const filters = [...url.searchParams].filter(([column]) => !["select", "columns"].includes(column));
    const hit = rows.filter((r) => filters.every(([column, test]) => String(r[column]) === test.slice(3)));
    const pick = (list: Record<string, unknown>[]) => list.map((r) => Object.fromEntries((url.searchParams.get("select") ?? "*").split(",").map((c) => c.trim()).map((c) => [c, r[c]])));
    const one = init?.headers && new Headers(init.headers).get("accept") === "application/vnd.pgrst.object+json";
    if (!init?.method || init.method === "GET") {
      return one ? (hit.length ? Response.json(pick(hit)[0]) : Response.json({ code: "PGRST116", message: "0 rows" }, { status: 406 })) : Response.json(pick(hit));
    }
    if (table !== "workbook_drafts" || init.method !== "POST") throw new Error(`unexpected write ${table}`);
    const body = JSON.parse(String(init.body));
    if (body.parent_id === FENCED_PARENT) return Response.json({ code: "55000", message: "family_unavailable" }, { status: 400 });
    if (!tables.children.some((c) => c.id === body.child_id && c.parent_id === body.parent_id)) return Response.json({ code: "23503", message: "foreign key" }, { status: 409 });
    if (rows.some((r) => r.id === body.id)) return Response.json({ code: "23505", message: "duplicate key" }, { status: 409 });
    rows.push(body);
    return new Response(null, { status: 201 });
  } } });
  const store = workbookDraftStore(db);
  return { ...store, get requests() { return requests; } };
}

describe.each([["Supabase", fakePostgrest], ["in-memory", () => memoryDraftStore({ [CHILD]: PARENT })]] as const)("the %s draft store", (_, open) => {
  it("stores a whole draft and reads it back as it was", async () => {
    const store = open();
    expect(await store.draft(DRAFT)).toBeNull();
    expect(await store.save(draft())).toEqual({ status: "saved", draftId: DRAFT });
    expect(await store.draft(DRAFT)).toEqual(draft());
  });

  it("refuses a used id and an unknown child", async () => {
    const store = open();
    await store.save(draft());
    expect(await store.save(draft())).toEqual({ status: "refused", reason: "the draft id is already used" });
    expect(await store.save(draft({ id: "00000000-0000-4000-8000-0000000000d2", childId: "00000000-0000-4000-8000-0000000000c9" })))
      .toEqual({ status: "refused", reason: "the child is not known" });
  });

  it("refuses a draft whose pages are not numbered from 1 in a multiple of 4", async () => {
    const store = open();
    expect(await store.save(draft({ pages: draft().pages.slice(0, 3) }))).toEqual({ status: "refused", reason: "the page count is not a multiple of 4" });
    const swapped = draft().pages.map((p, i) => ({ ...p, number: i === 1 ? 3 : i === 2 ? 2 : p.number }));
    expect(await store.save(draft({ pages: swapped }))).toEqual({ status: "refused", reason: "page 2 is numbered 3" });
    expect(await store.draft(DRAFT)).toBeNull();
  });
});

describe("the Supabase draft store", () => {
  it("refuses a family being deleted, and checks the draft before any request", async () => {
    const store = fakePostgrest();
    expect(await store.save(draft({ id: "00000000-0000-4000-8000-0000000000d3", childId: FENCED_CHILD }))).toEqual({ status: "refused", reason: "the family is being deleted" });
    const before = store.requests;
    await store.save(draft({ id: "nope" }));
    expect(store.requests).toBe(before);
  });
});
