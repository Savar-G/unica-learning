import type { EditCheckpoint, EditFrame, EditSnapshot, ReviewComment } from "@/lib/workbook-edit";
import type { DraftRendering } from "@/lib/workbook-job";
import type { RenderProblem } from "@/lib/workbook-render";
import { workbookCommentRoute } from "@/lib/workbook-comment-route";
import { pageContentFingerprint, storedPrintContract } from "@/lib/workbook-print-contract";
import { expectedItems } from "@/lib/scan-observation";
import { markingRegions } from "@/lib/scan-marking-regions";
import type { GeneratedPage } from "@/lib/workbook-generator";

export interface LayoutResolution {
  id: string; page: number; status: "applied" | "partial" | "unsupported"; note: string;
}
export interface LayoutEditPlan { build: string; pages: number[]; contentFingerprints: Record<number, string>; results: LayoutResolution[] }

/** A human must review the template correction and state each comment's actual result before it can be queued. */
export function layoutEditPlan(value: unknown, comments: readonly ReviewComment[], snapshot: EditSnapshot, build: string | null): LayoutEditPlan | null {
  if (!value || typeof value !== "object" || !build) return null;
  const v = value as { reviewed?: unknown; pages?: unknown; results?: unknown };
  if (v.reviewed !== true || !Array.isArray(v.pages) || !v.pages.length || v.pages.length > 500
    || !Array.isArray(v.results) || !v.results.length || v.results.length > 500) return null;
  const pages = v.pages;
  if (pages.some(n => !Number.isInteger(n) || !snapshot.draft.pages.some(p => p.number === n)) || new Set(pages).size !== pages.length) return null;
  const results: LayoutResolution[] = [];
  for (const item of v.results) {
    if (!item || typeof item !== "object") return null;
    const r = item as LayoutResolution;
    const c = comments.find(c => c.id === r.id);
    if (!c || c.revision !== snapshot.revision || !["pending", "failed"].includes(c.status)
      || workbookCommentRoute(snapshot.draft.pages.find(p => p.number === c.page), c.note, c.route) !== "layout"
      || !["applied", "partial", "unsupported"].includes(r.status) || typeof r.note !== "string" || !r.note.trim() || r.note.length > 2000
      || !pages.includes(c.page) || results.some(x => x.id === r.id)) return null;
    results.push({ id: c.id, page: c.page, status: r.status, note: r.note.trim() });
  }
  // The authenticated server computes these from its saved snapshot. Ignore any client-supplied fingerprints.
  const contentFingerprints = Object.fromEntries(pages.map(number => [number, pageContentFingerprint(snapshot.draft.pages.find(p => p.number === number)!)]));
  return { build, pages: [...pages].sort((a, b) => a - b), contentFingerprints, results };
}

export interface LayoutEditStore {
  claim(id: string, lease: string): Promise<{ draftId: string; revision: number; plan: LayoutEditPlan } | null>;
  load(draftId: string): Promise<EditSnapshot | null>;
  frame(id: string, lease: string, frame: EditFrame): Promise<EditFrame | null>;
  checkpoints(id: string): Promise<EditCheckpoint[]>;
  checkpoint(id: string, lease: string, result: EditCheckpoint): Promise<boolean>;
  finish(id: string, lease: string, result: { rendering: DraftRendering; results: LayoutResolution[]; problems: RenderProblem[] } | { error: string }): Promise<boolean>;
}
export interface LayoutEditDeps {
  store: LayoutEditStore; build: string | null; runner: "mac" | "server"; newId(): string;
  renderPage(snapshot: EditSnapshot, page: number): Promise<{ page: DraftRendering["pages"][number]; paths: string[] }>;
  assemble(snapshot: EditSnapshot, pages: DraftRendering["pages"]): Promise<{ pdfPath: string; pdfSha256?: string; paths: string[] }>;
}

function protectedPage(workbookId: string, source: GeneratedPage, after: DraftRendering["pages"][number]): boolean {
  const contract = storedPrintContract(after.printContract, { workbookId, page: source.number, image: after.image });
  const content = source.content, day = content?.kind === "day" && !content.extraPractice ? content : null;
  return !!contract && !after.proof && !after.contractProblem && after.number === source.number
    && contract.label === (content?.id ?? null) && contract.day === (day?.day ?? null) && contract.pageOfDay === (day?.page ?? null)
    && contract.fingerprints.content === pageContentFingerprint(source)
    && JSON.stringify(source.questions.map(q => q.number)) === JSON.stringify(after.questions.map(q => q.number));
}

/** A layout correction must not remove the regions used by the existing marking paths. */
export function layoutCoverageProblem(workbookId: string, source: Pick<GeneratedPage, "number" | "questions">, rendered: DraftRendering["pages"][number]): string | null {
  const expected = expectedItems({ workbookId, printedRevision: "layout-check", pageId: `page-${source.number}`,
    questions: source.questions.map(q => ({ number: q.number, package: q.package, teaching: null })) });
  if (source.questions.length !== rendered.questions.length) return "The rendered question count changed.";
  for (const e of expected) {
    const original = source.questions.find(q => q.number === e.number), printed = rendered.questions.find(q => q.number === e.number);
    const question = { package: original?.package ?? null, regions: printed?.regions ?? null };
    if (!printed || e.method === "unavailable" || e.method === "code" && !markingRegions(question).length) return `Question ${e.number} has no complete marking region. This comment stays open.`;
  }
  return null;
}

/** No writer, solver, planner or package builder is available to this path. It renders only the saved draft. */
export async function runWorkbookLayoutEdit(id: string, deps: LayoutEditDeps): Promise<"done" | "failed" | "not-claimed"> {
  if (deps.runner !== "mac") return "not-claimed";
  const lease = deps.newId(), edit = await deps.store.claim(id, lease);
  if (!edit) return "not-claimed";
  try {
    if (!deps.build || edit.plan.build !== deps.build) throw new Error("The reviewed layout version changed. Review it again before rendering.");
    const frame: EditFrame = { calls: 1, build: deps.build, model: null, solveModel: "layout-no-model", layoutPages: edit.plan.pages };
    const keptFrame = await deps.store.frame(id, lease, frame);
    if (!keptFrame) return "not-claimed";
    if (keptFrame.calls !== frame.calls || keptFrame.build !== frame.build || keptFrame.model !== frame.model || keptFrame.solveModel !== frame.solveModel
      || JSON.stringify(keptFrame.layoutPages) !== JSON.stringify(frame.layoutPages)) throw new Error("The reviewed layout version changed. Review it again before rendering.");
    const snapshot = await deps.store.load(edit.draftId);
    if (!snapshot || snapshot.revision !== edit.revision || !snapshot.rendering) throw new Error("This workbook changed. Reload the page.");
    const original = JSON.stringify(snapshot.draft);
    const images = new Map(snapshot.rendering.pages.map(p => [p.number, p]));
    const checkpoints = new Map((await deps.store.checkpoints(id)).map(p => [p.number, p]));
    const problems: RenderProblem[] = [], changed = new Set<number>();
    for (const number of edit.plan.pages) {
      const prior = images.get(number);
      const source = snapshot.draft.pages.find(p => p.number === number);
      if (!prior || !source) throw new Error("A saved page image is unavailable.");
      if (edit.plan.contentFingerprints[number] !== pageContentFingerprint(source)) throw new Error("The saved page content changed after layout review.");
      let result = checkpoints.get(number);
      if (!result) {
        try {
          const next = await deps.renderPage(snapshot, number);
          if (!protectedPage(snapshot.draft.id, source, next.page)) throw new Error("The layout check could not preserve the page identity and question data.");
          const coverage = layoutCoverageProblem(snapshot.draft.id, source, next.page);
          if (coverage) throw new Error(coverage);
          if (JSON.stringify(snapshot.draft) !== original) throw new Error("The renderer changed the saved questions.");
          result = { number, image: next.page };
        } catch (e) { result = { number, error: e instanceof Error ? e.message : "This page could not be rendered." }; }
        // Keep files on an uncertain checkpoint response. Another holder can already reference them.
        try { if (!await deps.store.checkpoint(id, lease, result)) return "not-claimed"; }
        catch { return "failed"; }
      }
      if (result.error) problems.push({ page: number, question: null, reason: result.error });
      else if (result.image && protectedPage(snapshot.draft.id, source, result.image)
        && !layoutCoverageProblem(snapshot.draft.id, source, result.image)) {
        if (prior.proof || !prior.printContract || result.image.printContract!.fingerprints.image !== prior.printContract.fingerprints.image) {
          images.set(number, result.image); changed.add(number);
        }
      } else throw new Error("The saved layout checkpoint does not match this page.");
    }
    const results = edit.plan.results.map(r => changed.has(r.page) ? r : {
      ...r, status: "unsupported" as const,
      note: problems.find(p => p.page === r.page)?.reason ?? "The page did not change. This comment stays open.",
    });
    if (!changed.size || !results.some(r => r.status !== "unsupported")) throw new Error("No reviewed page changes could be saved. All comments stay open.");
    if (JSON.stringify(snapshot.draft) !== original) throw new Error("The renderer changed the saved questions.");
    const pages = snapshot.rendering.pages.map(p => images.get(p.number)!);
    const pdf = await deps.assemble(snapshot, pages);
    // An uncertain finish can follow a committed revision. Never delete its images or PDF on that response.
    try {
      return await deps.store.finish(id, lease, { rendering: { pdfPath: pdf.pdfPath, pdfSha256: pdf.pdfSha256 ?? null, pages }, results, problems }) ? "done" : "failed";
    } catch { return "failed"; }
  } catch (e) {
    try { await deps.store.finish(id, lease, { error: e instanceof Error ? e.message : "The layout change stopped." }); } catch { /* Read the stored batch after an uncertain response. */ }
    return "failed";
  }
}
