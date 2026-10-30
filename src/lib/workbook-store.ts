import type { SupabaseClient } from "@supabase/supabase-js";
import { toJson, type Database, type Tables } from "@/lib/database";
import { QUESTION_PACKAGE_VERSION } from "@/lib/question-package";
import {
  isUuid,
  storedQuestion,
  workbookProblem,
  type WorkbookPage,
  type WorkbookStore,
  type WorkbookSummary,
  type WorkbookWrite,
} from "@/lib/workbook-content";

// The workbook store (#299) in Supabase (migration add_workbooks). Writes go through the service-only function
// write_workbook, so pass a client with the secret key to write; it stores a whole workbook in one transaction or
// nothing. Reads work with any client: with a parent's session, row-level security gives only that family's workbooks
// (another family's workbook reads as not found); with an admin's session or the secret key, any workbook. Every read
// names a workbook or a child. Tests use src/lib/workbook-store-memory.ts and pass the same tests. No Next.js or React.

type BookRow = Tables<"workbooks">;
type PageRow = Tables<"workbook_pages">;
type QuestionRow = Tables<"workbook_questions">;

const BOOK_COLUMNS = "id, created_at, parent_id, child_id, number, levels, status, pdf_path, profile_build, approved_at, printed_at, shipped_at";
const PAGE_COLUMNS = "id, page_number, day_label, page_type, image_path, image_width, image_height, qr_token";
const QUESTION_COLUMNS = "page_id, question_number, schema_version, package, box_x, box_y, box_width, box_height";

function summary(r: Pick<BookRow, "id" | "created_at" | "parent_id" | "child_id" | "number" | "levels" | "status" | "pdf_path" | "profile_build" | "approved_at" | "printed_at" | "shipped_at">): WorkbookSummary {
  return {
    id: r.id, parentId: r.parent_id, childId: r.child_id, number: r.number, levels: r.levels, status: r.status,
    pdfPath: r.pdf_path, profileBuild: r.profile_build,
    // PostgREST writes timestamps as Postgres does; the shape here is the ISO form the rest of the site reads.
    createdAt: new Date(r.created_at).toISOString(),
    approvedAt: r.approved_at && new Date(r.approved_at).toISOString(),
    printedAt: r.printed_at && new Date(r.printed_at).toISOString(),
    shippedAt: r.shipped_at && new Date(r.shipped_at).toISOString(),
  };
}

function page(workbookId: string, p: Pick<PageRow, "page_number" | "day_label" | "page_type" | "image_path" | "image_width" | "image_height" | "qr_token">,
  questions: Pick<QuestionRow, "question_number" | "schema_version" | "package" | "box_x" | "box_y" | "box_width" | "box_height">[]): WorkbookPage {
  return {
    number: p.page_number, dayLabel: p.day_label, type: p.page_type,
    image: p.image_path !== null && p.image_width !== null && p.image_height !== null ? { path: p.image_path, width: p.image_width, height: p.image_height } : null,
    qrToken: p.qr_token,
    questions: questions.map((q) => storedQuestion(
      { number: q.question_number, box: { x: q.box_x, y: q.box_y, width: q.box_width, height: q.box_height }, schemaVersion: q.schema_version, package: q.package },
      { source: "workbook", workbookId, page: p.page_number, question: q.question_number },
    )),
  };
}

export function workbookStore(db: SupabaseClient<Database>): WorkbookStore {
  return {
    async write(input) {
      const problem = workbookProblem(input);
      if (problem) return { status: "refused", reason: problem };
      const { data, error } = await db.rpc("write_workbook", { p_workbook: toJson(input), p_schema_version: QUESTION_PACKAGE_VERSION });
      if (error) throw new Error(`workbook write: ${error.message}`);
      // jsonb: the answer write_workbook builds.
      return data as unknown as WorkbookWrite;
    },

    async workbook(id) {
      if (!isUuid(id)) return null;
      const [book, pages, questions] = await Promise.all([
        db.from("workbooks").select(BOOK_COLUMNS).eq("id", id).maybeSingle(),
        db.from("workbook_pages").select(PAGE_COLUMNS).eq("workbook_id", id).order("page_number", { ascending: true }),
        db.from("workbook_questions").select(QUESTION_COLUMNS).eq("workbook_id", id).order("question_number", { ascending: true }),
      ]);
      const error = book.error ?? pages.error ?? questions.error;
      if (error) throw new Error(`workbook load: ${error.message}`);
      if (!book.data) return null;
      return {
        ...summary(book.data),
        pages: (pages.data ?? []).map((p) => page(id, p, (questions.data ?? []).filter((q) => q.page_id === p.id))),
      };
    },

    async childWorkbooks(childId) {
      if (!isUuid(childId)) return [];
      const { data, error } = await db.from("workbooks").select(BOOK_COLUMNS).eq("child_id", childId).order("number", { ascending: false });
      if (error) throw new Error(`child workbooks load: ${error.message}`);
      return data.map(summary);
    },

    async page(workbookId, pageNumber) {
      if (!isUuid(workbookId) || !Number.isInteger(pageNumber)) return null;
      const { data: p, error } = await db.from("workbook_pages").select(PAGE_COLUMNS).eq("workbook_id", workbookId).eq("page_number", pageNumber).maybeSingle();
      if (error) throw new Error(`workbook page load: ${error.message}`);
      if (!p) return null;
      const questions = await db.from("workbook_questions").select(QUESTION_COLUMNS).eq("page_id", p.id).order("question_number", { ascending: true });
      if (questions.error) throw new Error(`workbook page load: ${questions.error.message}`);
      return page(workbookId, p, questions.data);
    },

    async question(ref) {
      if (!isUuid(ref.workbookId) || !Number.isInteger(ref.page) || !Number.isInteger(ref.question)) return { status: "not-found" };
      const { data: p, error } = await db.from("workbook_pages").select("id").eq("workbook_id", ref.workbookId).eq("page_number", ref.page).maybeSingle();
      if (error) throw new Error(`workbook question load: ${error.message}`);
      if (!p) return { status: "not-found" };
      const { data: q, error: qError } = await db.from("workbook_questions").select(QUESTION_COLUMNS)
        .eq("page_id", p.id).eq("question_number", ref.question).maybeSingle();
      if (qError) throw new Error(`workbook question load: ${qError.message}`);
      if (!q) return { status: "not-found" };
      return storedQuestion({ number: q.question_number, box: { x: q.box_x, y: q.box_y, width: q.box_width, height: q.box_height }, schemaVersion: q.schema_version, package: q.package }, ref).content;
    },
  };
}
