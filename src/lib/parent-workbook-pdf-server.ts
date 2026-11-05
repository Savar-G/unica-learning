import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { WorkbookPdfSource } from "@/lib/parent-workbook-pdf";
import { WORKBOOK_FILES_BUCKET } from "@/lib/workbook-content";

// The PDF source of src/lib/parent-workbook-pdf.ts, on the parent's own session: row-level security returns only the
// family's shipped workbooks (migration workbooks_parent_shipped_only), and the Storage policy signs only their files.
// A database error throws.
export function parentWorkbookPdfSource(session: SupabaseClient<Database>): WorkbookPdfSource {
  return {
    async workbook(id) {
      const { data: book, error } = await session.from("workbooks").select("child_id, number, pdf_path").eq("id", id).eq("status", "shipped").maybeSingle();
      if (error) throw new Error(`workbook read: ${error.message}`);
      if (!book) return null;
      const { data: child, error: childError } = await session.from("children").select("first_name").eq("id", book.child_id).maybeSingle();
      if (childError) throw new Error(`child read: ${childError.message}`);
      return child ? { number: book.number, pdfPath: book.pdf_path, childName: child.first_name } : null;
    },
    async sign(path, seconds, filename) {
      const { data, error } = await session.storage.from(WORKBOOK_FILES_BUCKET).createSignedUrl(path, seconds, { download: filename });
      if (error) console.error("[workbooks] pdf sign failed", error.message);
      return data?.signedUrl ?? null;
    },
  };
}
