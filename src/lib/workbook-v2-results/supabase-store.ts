// The BookStore in Supabase (migration 20261127205443_child_sheet_results). Pass a client with the secret key: the
// tables have no browser writes, and write_child_sheet_results is service-only. Every read pages past PostgREST's cap of
// 1,000 rows: a full v2 book prints about 2,000 questions.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { SHEET_RESULTS, type SheetResultKind } from "@/lib/workbook-v2/results/sheet-results";
import { LEVEL_TEST_STATES, PAGES_REQUESTS, type BookStore, type ChildBankState, type LevelTestState, type PagesRequest, type WriteResultsOutcome } from "./types";

/** Rows of one read; PostgREST never gives more than 1,000, whatever the range asks. */
export const BOOK_PAGE_ROWS = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Every row, one range after another, until a page comes back short. */
async function allPages<T>(what: string, page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += BOOK_PAGE_ROWS) {
    const { data, error } = await page(from, from + BOOK_PAGE_ROWS - 1);
    if (error) throw new Error(`book store read ${what}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < BOOK_PAGE_ROWS) return rows;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const oneOf = <T extends string>(list: readonly T[], value: string, what: string): T => {
  if (!(list as readonly string[]).includes(value)) throw new Error(`book store read: unexpected ${what} ${JSON.stringify(value)}`);
  return value as T;
};

/** write_child_sheet_results's answer, checked: a change of its shape fails here, not in a caller. */
export function writeAnswer(data: unknown): WriteResultsOutcome {
  if (isObject(data) && data.status === "refused" && typeof data.reason === "string") return { status: "refused", reason: data.reason };
  if (isObject(data) && data.status === "written" && isCount(data.written) && isCount(data.stale) && (data.marksVersion === null || isCount(data.marksVersion))) {
    return { status: "written", written: data.written, stale: data.stale, marksVersion: data.marksVersion };
  }
  throw new Error("child sheet results: unexpected answer");
}

export function supabaseBookStore(db: SupabaseClient<Database>): BookStore {
  const books = async (childId: string) => (await allPages("books", (from, to) => db.from("workbooks")
    .select("id, parent_id, number, printed_revision, levels").eq("child_id", childId).eq("generator", "v2").order("number").range(from, to)))
    .map((b) => ({ workbookId: b.id, parentId: b.parent_id, number: b.number, printedRevision: b.printed_revision, levels: b.levels }));

  return {
    books,

    async issuedSheets(childId) {
      return (await allPages("sheets", (from, to) => db.from("workbook_sheets")
        .select("workbook_id, sheet_id, attempt, front_page_number, back_page_number").eq("child_id", childId).order("id").range(from, to)))
        .map((s) => ({ workbookId: s.workbook_id, sheetId: s.sheet_id, attempt: s.attempt, frontPage: s.front_page_number, backPage: s.back_page_number }));
    },

    async bookItems(childId) {
      return (await allPages("items", (from, to) => db.from("workbook_item_answers")
        .select("workbook_id, printed_revision, item_id, sheet_id, attempt").eq("child_id", childId).order("id").range(from, to)))
        .map((i) => ({ workbookId: i.workbook_id, printedRevision: i.printed_revision, itemId: i.item_id, sheetId: i.sheet_id, attempt: i.attempt }));
    },

    async receipts(childId) {
      const own = await books(childId);
      if (own.length === 0) return [];
      const revisionOf = new Map(own.map((b) => [b.workbookId, b.printedRevision]));
      const ids = [...revisionOf.keys()];
      const [receipts, pages] = await Promise.all([
        allPages("receipts", (from, to) => db.from("workbook_scan_receipts")
          .select("workbook_id, page_id, printed_revision").eq("child_id", childId).eq("status", "accepted").order("id").range(from, to)),
        allPages("pages", (from, to) => db.from("workbook_pages").select("id, page_number").in("workbook_id", ids).order("id").range(from, to)),
      ]);
      const numberOf = new Map(pages.map((p) => [p.id, p.page_number]));
      return receipts.flatMap((r) => {
        const pageNumber = numberOf.get(r.page_id);
        return revisionOf.get(r.workbook_id) === r.printed_revision && pageNumber !== undefined ? [{ workbookId: r.workbook_id, pageNumber }] : [];
      });
    },

    async sheetResults(childId) {
      return (await allPages("results", (from, to) => db.from("child_sheet_results")
        .select("workbook_id, printed_revision, sheet_id, attempt, items_total, items_scored, mistakes, result, marks_version").eq("child_id", childId).order("id").range(from, to)))
        .map((r) => ({
          workbookId: r.workbook_id, printedRevision: r.printed_revision, sheetId: r.sheet_id, attempt: r.attempt, itemsTotal: r.items_total,
          itemsScored: r.items_scored, mistakes: r.mistakes, result: oneOf<SheetResultKind>(SHEET_RESULTS, r.result, "result"), marksVersion: r.marks_version,
        }));
    },

    async writeSheetResults(childId, marksVersion, rows) {
      const { data, error } = await db.rpc("write_child_sheet_results", {
        p_child: childId, p_marks_version: marksVersion,
        p_results: rows.map((r) => ({ workbookId: r.workbookId, printedRevision: r.printedRevision, sheetId: r.sheetId, attempt: r.attempt, itemsTotal: r.itemsTotal, itemsScored: r.itemsScored, mistakes: r.mistakes, result: r.result })),
      });
      if (error) throw new Error(`child sheet results: ${error.message}`);
      return writeAnswer(data);
    },

    async childState(childId, levelId): Promise<ChildBankState | null> {
      const { data, error } = await db.from("child_bank_state").select("child_id, level_id, start_sheet_id, level_test_state, pages_request")
        .eq("child_id", childId).eq("level_id", levelId).maybeSingle();
      if (error) throw new Error(`child bank state: ${error.message}`);
      return data && {
        childId: data.child_id, levelId: data.level_id, startSheetId: data.start_sheet_id,
        levelTestState: oneOf<LevelTestState>(LEVEL_TEST_STATES, data.level_test_state, "level-test state"),
        pagesRequest: oneOf<PagesRequest>(PAGES_REQUESTS, data.pages_request, "pages request"),
      };
    },

    async saveChildState(state) {
      const { data: child, error: childError } = await db.from("children").select("parent_id").eq("id", state.childId).maybeSingle();
      if (childError) throw new Error(`child bank state: ${childError.message}`);
      if (!child) throw new Error("child bank state: the child is not known");
      const { error } = await db.from("child_bank_state").upsert({
        child_id: state.childId, parent_id: child.parent_id, level_id: state.levelId, start_sheet_id: state.startSheetId,
        level_test_state: state.levelTestState, pages_request: state.pagesRequest,
      }, { onConflict: "child_id,level_id" });
      if (error) throw new Error(`child bank state: ${error.message}`);
    },
  };
}
