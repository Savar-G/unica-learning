// The fit check of the generator (#311): the renderer's check (#309, src/lib/workbook-render.ts) on one page, through a
// template and a print engine. It lays the page out as the print would and reports what does not fit: a slot, a
// question or the page that overflows, a question with no printed content or answer space, or a page type the template
// has no layout for. With the real templates (#310, `workbookTemplate`) it is their strict fit check (#363): a slot
// holding more items than it takes, content past the content area, an answer box smaller than the band allows, a box
// over its own text, a work box or writing lines under their minimum. The real templates lay out a page from its
// content, so the generator lays its book out for them (GenerateInput.book) and every page it checks has content.
// Pure TypeScript: no Next.js, React, network, database or clock (the engine is passed in).
import type { FitCheck, GeneratedWorkbook } from "@/lib/workbook-generator";
import { renderWorkbook, type PrintEngine, type WorkbookDraft, type WorkbookTemplate } from "@/lib/workbook-render";

export function renderFitCheck(o: { template: WorkbookTemplate; engine: PrintEngine; parentId: string }): FitCheck {
  return {
    async fits(page, book) {
      const result = await renderWorkbook({ draft: { ...book, pages: [page] }, parentId: o.parentId, template: o.template, engine: o.engine });
      if (result.status === "rendered") return { ok: true };
      return { ok: false, problems: result.problems.map((p) => ({ question: p.question, reason: p.reason })) };
    },
  };
}

/**
 * A generated draft as the renderer reads it: every page with its content and the questions that have a package (a
 * question code could build nothing for is not on the page; the draft keeps it, marked failed).
 */
export function renderableDraft(d: GeneratedWorkbook): WorkbookDraft {
  return {
    id: d.id, childId: d.childId, number: d.number, levels: d.levels, profileBuild: d.profileBuild,
    pages: d.pages.map((p) => ({
      number: p.number, dayLabel: p.dayLabel, type: p.type, qrToken: p.qrToken,
      questions: p.questions.filter((q) => q.package).map((q) => ({ number: q.number, package: q.package! })),
      ...(p.content ? { content: p.content } : {}),
    })),
  };
}
