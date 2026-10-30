import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { QUESTION_PACKAGE_VERSION } from "@/lib/question-package";
import type { WorkbookInput, WorkbookStore } from "@/lib/workbook-content";
import { sampleWorkbook } from "@/lib/workbook-sample";
import { workbookStore } from "@/lib/workbook-store";
import { memoryWorkbookStore } from "@/lib/workbook-store-memory";

// The workbook store (#299): the Supabase store and the in-memory store pass the same tests, through the store's
// interface. A whole workbook is written as one unit and read back; a question is read by workbook, page number and
// question number as its question package (#298); numbering rules and conflicts are refused, and a refused write
// stores nothing. The Supabase store talks to a fake PostgREST that keeps the three tables and runs write_workbook the
// way the migration's function does (add_workbooks): every row or none, with the same refusals.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const OTHER_PARENT = "33333333-3333-4333-8333-333333333333";
const OTHER_CHILD = "44444444-4444-4444-8444-444444444444";
const WORKBOOK = "55555555-5555-4555-8555-555555555555";
const SECOND = "66666666-6666-4666-8666-666666666666";
const NOW = "2026-10-29T18:00:00.000Z";
const CHILDREN = [{ id: CHILD, parentId: PARENT }, { id: OTHER_CHILD, parentId: OTHER_PARENT }];

const tokens = (prefix: string) => [1, 2, 3].map((n) => `${prefix}-page-token-${n}`.padEnd(20, "x"));
const sample = (o: Partial<{ workbookId: string; childId: string; parentId: string; number: number; prefix: string }> = {}): WorkbookInput =>
  sampleWorkbook({ workbookId: o.workbookId ?? WORKBOOK, childId: o.childId ?? CHILD, parentId: o.parentId ?? PARENT, number: o.number, qrTokens: tokens(o.prefix ?? "first") });

// ---------- A fake PostgREST for the Supabase store ----------

type Row = Record<string, unknown>;
interface Tables { workbooks: Row[]; workbook_pages: Row[]; workbook_questions: Row[] }

/** Unique keys of each table, with the reason write_workbook gives when one is taken. */
const UNIQUE: Record<keyof Tables, [string[], (r: Row) => string][]> = {
  workbooks: [[["id"], () => "the workbook id is already used"], [["child_id", "number"], (r) => `the child already has workbook ${r.number}`]],
  workbook_pages: [[["workbook_id", "page_number"], () => "a page number is used twice"], [["qr_token"], () => "a QR token is already used"]],
  workbook_questions: [[["page_id", "question_number"], () => "a question number is used twice on a page"], [["workbook_id", "question_key"], () => "a question id is used twice"]],
};

let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

/** write_workbook as the migration writes it: every row, or none and a refusal. */
function writeWorkbook(tables: Tables, w: WorkbookInput): unknown {
  const child = CHILDREN.find((c) => c.id === w.childId);
  if (!child) return { status: "refused", reason: "the child is not known" };
  const paths = [w.pdfPath, ...w.pages.map((p) => p.image?.path ?? null)].filter((p): p is string => p !== null);
  if (paths.some((p) => !p.startsWith(`${child.parentId}/${w.id}/`))) return { status: "refused", reason: "a file is not in the family's folder" };
  const staged: Tables = { workbooks: [...tables.workbooks], workbook_pages: [...tables.workbook_pages], workbook_questions: [...tables.workbook_questions] };
  const insert = (table: keyof Tables, row: Row): string | null => {
    for (const [cols, reason] of UNIQUE[table]) {
      if (staged[table].some((r) => cols.every((c) => r[c] === row[c]))) return reason(row);
    }
    staged[table].push(row);
    return null;
  };
  const refused = insert("workbooks", {
    id: w.id, created_at: NOW, parent_id: child.parentId, child_id: w.childId, number: w.number, levels: w.levels, status: "draft",
    pdf_path: w.pdfPath, profile_build: w.profileBuild, approved_at: null, printed_at: null, shipped_at: null,
  }) ?? w.pages.reduce<string | null>((done, p) => done ?? (() => {
    const pageId = uuid();
    return insert("workbook_pages", {
      id: pageId, workbook_id: w.id, parent_id: child.parentId, page_number: p.number, day_label: p.dayLabel, page_type: p.type,
      image_path: p.image?.path ?? null, image_width: p.image?.width ?? null, image_height: p.image?.height ?? null, qr_token: p.qrToken,
    }) ?? p.questions.reduce<string | null>((d, q) => d ?? insert("workbook_questions", {
      id: uuid(), workbook_id: w.id, page_id: pageId, parent_id: child.parentId, question_number: q.number, question_key: q.package.id,
      schema_version: QUESTION_PACKAGE_VERSION, package: q.package, box_x: q.box.x, box_y: q.box.y, box_width: q.box.width, box_height: q.box.height,
    }), null);
  })(), null);
  if (refused) return { status: "refused", reason: refused };
  Object.assign(tables, staged);
  return { status: "written", workbookId: w.id };
}

/** Applies a GET's eq filters, order and limit to a table, the way PostgREST does. */
function select(rows: Row[], params: URLSearchParams): Row[] {
  let out = rows.filter((r) => [...params].every(([k, v]) => ["select", "order", "limit"].includes(k) || (v.startsWith("eq.") && String(r[k]) === v.slice(3))));
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(".");
    out = [...out].sort((a, b) => (Number(a[col]) - Number(b[col])) * (dir === "desc" ? -1 : 1));
  }
  const limit = params.get("limit");
  return (limit ? out.slice(0, Number(limit)) : out).map((r) => JSON.parse(JSON.stringify(r)));
}

function supabase(tables: Tables = { workbooks: [], workbook_pages: [], workbook_questions: [] }) {
  const db = createClient("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (method === "POST" && url.pathname === "/rest/v1/rpc/write_workbook") {
      return Response.json(writeWorkbook(tables, JSON.parse(String(init?.body)).p_workbook));
    }
    const table = url.pathname.replace("/rest/v1/", "") as keyof Tables;
    if (method !== "GET" || !(table in tables)) throw new Error(`unexpected ${method} ${url.pathname}`);
    const rows = select(tables[table], url.searchParams);
    // maybeSingle asks for one object.
    if (new Headers(init?.headers).get("accept") === "application/vnd.pgrst.object+json") {
      return rows.length ? Response.json(rows[0]) : Response.json({ code: "PGRST116", message: "no rows" }, { status: 406 });
    }
    return Response.json(rows);
  } } });
  return { store: workbookStore(db), tables };
}

const stores: [string, () => WorkbookStore][] = [
  ["Supabase", () => supabase().store],
  ["in memory", () => memoryWorkbookStore({ children: CHILDREN, now: () => new Date(NOW) })],
];

describe.each(stores)("the %s workbook store", (_name, make) => {
  it("writes a whole workbook and reads it back", async () => {
    const store = make();
    const input = sample();
    expect(await store.write(input)).toEqual({ status: "written", workbookId: WORKBOOK });
    const book = await store.workbook(WORKBOOK);
    if (!book) throw new Error("the workbook was not read back");
    expect(book).toMatchObject({
      id: WORKBOOK, parentId: PARENT, childId: CHILD, number: 1, levels: [10], status: "draft", pdfPath: null, profileBuild: null,
      createdAt: NOW, approvedAt: null, printedAt: null, shippedAt: null,
    });
    expect(book.pages.map((p) => [p.number, p.type, p.dayLabel, p.questions.length])).toEqual([[1, "cover", null, 0], [2, "practice", "Day 1", 4], [3, "practice", "Day 2", 4]]);
    expect(book.pages[1].image).toEqual({ path: `${PARENT}/${WORKBOOK}/page-2.png`, width: 850, height: 1100 });
    expect(book.pages[1].qrToken).toBe(tokens("first")[1]);
    const q = book.pages[2].questions[1];
    expect(q.number).toBe(2);
    expect(q.box).toEqual({ x: 440, y: 230, width: 350, height: 360 });
    expect(q.content.status === "found" && q.content.package).toEqual(input.pages[2].questions[1].package);
  });

  it("reads a question by page number and question number as its package", async () => {
    const store = make();
    await store.write(sample());
    const result = await store.question({ source: "workbook", workbookId: WORKBOOK, page: 2, question: 3 });
    if (result.status !== "found") throw new Error(`expected a package, got ${JSON.stringify(result)}`);
    expect(result.package.text).toBe("419 + 193 = ?");
    expect(result.package.answer.value).toEqual({ type: "number", value: 612 });
    expect(result.package.ref).toEqual({ source: "workbook", workbookId: WORKBOOK, page: 2, question: 3 });
    expect(result.package.easierExample.text).toBe("57 + 26 = ?");
    const subtraction = await store.question({ source: "workbook", workbookId: WORKBOOK, page: 3, question: 2 });
    expect(subtraction.status === "found" && subtraction.package.answer.value).toEqual({ type: "number", value: 448 });
  });

  it("does not find a question, page or workbook that is not there", async () => {
    const store = make();
    await store.write(sample());
    const ref = { source: "workbook" as const, workbookId: WORKBOOK, page: 2, question: 5 };
    expect(await store.question(ref)).toEqual({ status: "not-found" });
    expect(await store.question({ ...ref, page: 9, question: 1 })).toEqual({ status: "not-found" });
    expect(await store.question({ ...ref, page: 1, question: 1 })).toEqual({ status: "not-found" });
    expect(await store.question({ ...ref, workbookId: SECOND })).toEqual({ status: "not-found" });
    expect(await store.question({ ...ref, workbookId: "not-a-workbook" })).toEqual({ status: "not-found" });
    expect(await store.page(WORKBOOK, 4)).toBeNull();
    expect(await store.workbook(SECOND)).toBeNull();
    expect(await store.workbook("not-a-workbook")).toBeNull();
  });

  it("reads one page with its questions", async () => {
    const store = make();
    await store.write(sample());
    const page = await store.page(WORKBOOK, 3);
    expect(page?.dayLabel).toBe("Day 2");
    expect(page?.questions.map((q) => q.content.status === "found" && q.content.package.text)).toEqual(["532 − 178 = ?", "704 − 256 = ?", "615 − 349 = ?", "823 − 467 = ?"]);
  });

  it("lists a child's workbooks, newest first", async () => {
    const store = make();
    await store.write(sample());
    await store.write(sample({ workbookId: SECOND, number: 2, prefix: "second" }));
    expect((await store.childWorkbooks(CHILD)).map((w) => [w.id, w.number])).toEqual([[SECOND, 2], [WORKBOOK, 1]]);
    expect(await store.childWorkbooks(OTHER_CHILD)).toEqual([]);
    expect(await store.childWorkbooks("not-a-child")).toEqual([]);
  });

  it.each([
    ["a page number used twice", (w: WorkbookInput) => { w.pages[2].number = 2; }, /page number 2 is used twice/],
    ["a question number used twice on a page", (w: WorkbookInput) => { w.pages[1].questions[1].number = 1; }, /question number 1 is used twice on page 2/],
    ["a package that names another place", (w: WorkbookInput) => { w.pages[1].questions[0].package.ref = { source: "workbook", workbookId: WORKBOOK, page: 3, question: 1 }; }, /names page 3, question 1/],
    ["a package with a wrong answer", (w: WorkbookInput) => { w.pages[1].questions[0].package.answer.value = { type: "number", value: 424 }; }, /page 2, question 1: the question's answer is not what its operation gives/],
    ["a box outside the page image", (w: WorkbookInput) => { w.pages[1].questions[3].box.y = 900; }, /page 2, question 4: the box is not inside the page image/],
    ["a page with questions and no image", (w: WorkbookInput) => { w.pages[1].image = null; }, /page 2 has questions but no image/],
    ["a QR token used twice", (w: WorkbookInput) => { w.pages[2].qrToken = w.pages[1].qrToken; }, /a QR token is used twice/],
    ["a level outside U1 to U30", (w: WorkbookInput) => { w.levels = [31]; }, /levels/],
    ["no pages", (w: WorkbookInput) => { w.pages = []; }, /no pages/],
    // One read gives a whole workbook, and PostgREST stops a read at 1000 rows without an error.
    ["more than 1000 questions", (w: WorkbookInput) => { w.pages[1].questions = Array.from({ length: 1001 }, () => w.pages[1].questions[0]); }, /more than 1000 questions/],
    ["an image outside the workbook's folder", (w: WorkbookInput) => { w.pages[0].image!.path = `${PARENT}/${SECOND}/page-1.png`; }, /a file is not in the workbook's folder/],
  ])("refuses %s and stores nothing", async (_case, change, reason) => {
    const store = make();
    const input = sample();
    change(input);
    const result = await store.write(input);
    expect(result.status).toBe("refused");
    if (result.status === "refused") expect(result.reason).toMatch(reason);
    expect(await store.workbook(WORKBOOK)).toBeNull();
  });

  it("refuses a workbook for a child that is not known", async () => {
    const store = make();
    expect(await store.write(sample({ childId: "77777777-7777-4777-8777-777777777777" }))).toEqual({ status: "refused", reason: "the child is not known" });
  });

  it("refuses files in another family's folder", async () => {
    const store = make();
    expect(await store.write(sample({ parentId: OTHER_PARENT }))).toEqual({ status: "refused", reason: "a file is not in the family's folder" });
    expect(await store.workbook(WORKBOOK)).toBeNull();
  });

  it("refuses a second workbook with the same number for the child, or the same id", async () => {
    const store = make();
    await store.write(sample());
    expect(await store.write(sample({ workbookId: SECOND, prefix: "second" }))).toEqual({ status: "refused", reason: "the child already has workbook 1" });
    expect(await store.write(sample({ number: 2, prefix: "second" }))).toEqual({ status: "refused", reason: "the workbook id is already used" });
    expect(await store.workbook(SECOND)).toBeNull();
  });

  it("stores nothing when the last page's QR token is already used: the write is one unit", async () => {
    const store = make();
    await store.write(sample());
    const second = sample({ workbookId: SECOND, number: 2, prefix: "second" });
    second.pages[2].qrToken = tokens("first")[0];
    expect(await store.write(second)).toEqual({ status: "refused", reason: "a QR token is already used" });
    expect(await store.workbook(SECOND)).toBeNull();
    expect(await store.page(SECOND, 1)).toBeNull();
    expect((await store.childWorkbooks(CHILD)).map((w) => w.id)).toEqual([WORKBOOK]);
  });

  it("keeps what it stored apart from the caller's objects", async () => {
    const store = make();
    const input = sample();
    await store.write(input);
    input.pages[1].questions[0].package.text = "changed";
    const read = await store.question({ source: "workbook", workbookId: WORKBOOK, page: 2, question: 1 });
    expect(read.status === "found" && read.package.text).toBe("268 + 157 = ?");
  });
});

describe("the Supabase workbook store reading stored packages", () => {
  async function stored(change: (row: Row) => void) {
    const { store, tables } = supabase();
    await store.write(sample());
    change(tables.workbook_questions[0]);
    return store.question({ source: "workbook", workbookId: WORKBOOK, page: 2, question: 1 });
  }

  it("says content unavailable for a package of another schema version", async () => {
    expect(await stored((r) => { r.schema_version = QUESTION_PACKAGE_VERSION + 1; })).toEqual({
      status: "unavailable", reason: "invalid-package", detail: `the stored package is schema version ${QUESTION_PACKAGE_VERSION + 1}, not ${QUESTION_PACKAGE_VERSION}`,
    });
  });

  it("says content unavailable for a stored package that does not pass the check", async () => {
    expect(await stored((r) => { (r.package as { steps: unknown[] }).steps = []; })).toEqual({
      status: "unavailable", reason: "invalid-package", detail: "the question's worked steps are not the steps of its operation",
    });
  });

  it("says content unavailable for a stored package that names another place", async () => {
    expect(await stored((r) => { (r.package as { ref: { question: number } }).ref.question = 4; })).toEqual({
      status: "unavailable", reason: "invalid-package", detail: "the stored package names page 2, question 4",
    });
  });
});
