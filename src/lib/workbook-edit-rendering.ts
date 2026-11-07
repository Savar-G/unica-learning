import { createHash, randomBytes } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { EditSnapshot } from "@/lib/workbook-edit";
import type { GeneratedWorkbook } from "@/lib/workbook-generator";
import type { DraftRendering } from "@/lib/workbook-job";
import { renderableDraft } from "@/lib/workbook-fit";
import { renderedPages, renderWorkbook, type PrintEngine, type WorkbookTemplate } from "@/lib/workbook-render";
import { workbookFiles } from "@/lib/workbook-store";

/** Shared file adapter. The full saved book remains the context when one selected page is rendered. */
export function workbookEditRendering(db: SupabaseClient<Database>, template: WorkbookTemplate, engine: PrintEngine) {
  const files = workbookFiles(db);
  return {
    async renderPage(snapshot: EditSnapshot, draft: GeneratedWorkbook, page: number) {
      const full = renderableDraft(draft);
      const one = { ...full, pages: full.pages.filter(p => p.number === page) };
      const result = await renderWorkbook({ draft: one, parentId: snapshot.parentId,
        template: { ...template, page: (p, parts) => template.page(p, parts, full) }, engine, fileKey: randomBytes(12).toString("hex") });
      if (result.status !== "rendered") throw new Error(result.problems.map(p => p.reason).join(" "));
      const image = result.files.find(f => f.path === result.workbook.pages[0].image!.path)!;
      try { await files.put(image); } catch (e) { await files.remove([image.path]).catch(() => undefined); throw e; }
      return { page: renderedPages(result)[0], paths: [image.path] };
    },
    async assemble(snapshot: EditSnapshot, pages: DraftRendering["pages"]) {
      const pdf = await PDFDocument.create();
      for (const page of pages) {
        const source = await db.storage.from("workbook-pages").download(page.image.path);
        if (source.error) throw new Error(source.error.message);
        const image = await pdf.embedPng(await source.data.arrayBuffer());
        pdf.addPage([612, 792]).drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
      }
      const pdfPath = `${snapshot.parentId}/${snapshot.draft.id}/workbook-${randomBytes(12).toString("hex")}.pdf`;
      const bytes = await pdf.save();
      try { await files.put({ path: pdfPath, bytes, contentType: "application/pdf" }); }
      catch (e) { await files.remove([pdfPath]).catch(() => undefined); throw e; }
      return { pdfPath, pdfSha256: createHash("sha256").update(bytes).digest("hex"), paths: [pdfPath] };
    },
  };
}
