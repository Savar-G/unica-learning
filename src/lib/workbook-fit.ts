// The fit check on main (#311): the renderer's own check (#309, src/lib/workbook-render.ts) on one page, through a
// template and a print engine. It lays the page out as the print would and reports what does not fit: a slot, a
// question or the page that overflows, a question with no printed content or answer space, or a page type the template
// has no layout for. The real templates' strict fit check (#310) is another FitCheck adapter for the generator.
// Pure TypeScript: no Next.js, React, network, database or clock (the engine is passed in).
import type { FitCheck } from "@/lib/workbook-generator";
import { renderWorkbook, type PrintEngine, type WorkbookTemplate } from "@/lib/workbook-render";

export function renderFitCheck(o: { template: WorkbookTemplate; engine: PrintEngine; parentId: string }): FitCheck {
  return {
    async fits(page, book) {
      const result = await renderWorkbook({ draft: { ...book, pages: [page] }, parentId: o.parentId, template: o.template, engine: o.engine });
      if (result.status === "rendered") return { ok: true };
      return { ok: false, problems: result.problems.map((p) => ({ question: p.question, reason: p.reason })) };
    },
  };
}
