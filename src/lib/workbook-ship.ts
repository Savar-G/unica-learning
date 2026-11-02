// Approve, print and ship (#314, spec #296). An admin approves the current revision of a run's draft: it is stored as a
// workbook for print (public.workbooks, status approved) with the draft's id, pages, QR tokens, question packages,
// page images, question boxes and PDF. Then the admin downloads the PDF, marks the workbook printed, then shipped.
//
// Approval is refused, on the server, while anything fails (approvalProblems): the run is not done, the draft is in an
// old format or not laid out for the real templates (a page with no template content), a question failed its check
// (code or the solve check), a page failed the fit check, a page did not render (a proof image, or no rendering or
// PDF at all), a question has no measured box, or the admin approves a revision that is no longer the current one.
// The store (migration workbook_ship) checks again what only the database knows (the current revision, the number and
// ids already used) and writes the workbook, its status and the audit entry in one step.
//
// Status: approved -> printed -> shipped, each with its time and an audit entry with the actor. A printed or shipped
// workbook is locked: the store refuses any change to it or to its draft (#313 edits). Shipping the child's first
// workbook answers firstShipped, so the admin is led to the existing "Workbook shipped: start plan" step (D-140); no
// plan starts here.
//
// Pure TypeScript: no Next.js, React, network, database or clock. Adapters: Supabase (src/lib/workbook-ship-store.ts)
// and in memory (src/lib/workbook-ship-memory.ts).
import type { WorkbookInput, WorkbookStatus } from "@/lib/workbook-content";
import type { GeneratedWorkbook } from "@/lib/workbook-generator";
import type { DraftRendering } from "@/lib/workbook-job";
import type { RenderProblem } from "@/lib/workbook-render";

/** Who approves or marks: the admin. */
export interface ShipActor {
  id: string;
  email: string;
}

/** A run's draft at its current (latest) revision, as approval reads it. */
export interface DraftForApproval {
  runId: string;
  /** The run is done (it stored the draft). */
  runDone: boolean;
  draftId: string;
  /** The draft's current revision. */
  revision: number;
  /** The draft is stored in a shape this code does not read as the current one. */
  oldFormat: boolean;
  /** The content of the current revision. */
  draft: GeneratedWorkbook;
  rendering: DraftRendering | null;
  renderProblems: RenderProblem[];
}

export type ApproveResult =
  | { status: "approved"; workbookId: string }
  | { status: "refused"; reasons: string[] }
  | { status: "not-found" };

export type MarkResult =
  | { status: "marked"; to: "printed" | "shipped"; at: string; firstShipped: boolean }
  | { status: "refused"; reason: string }
  | { status: "not-found" };

export interface WorkbookShipStore {
  /** The run's draft at its current revision, or null when there is no such run or it has no draft. */
  draftForApproval(runId: string): Promise<DraftForApproval | null>;
  /**
   * Stores `workbook` as approved, with an audit entry, in one step; refused (nothing stored) when `revision` is not
   * the draft's current revision, the workbook is not the draft, or the workbook store refuses it.
   */
  approve(o: { draftId: string; revision: number; workbook: WorkbookInput; actor: ShipActor }): Promise<{ status: "approved"; workbookId: string } | { status: "refused"; reason: string }>;
  /** Moves a workbook approved -> printed or printed -> shipped, with an audit entry. */
  mark(o: { workbookId: string; to: "printed" | "shipped"; actor: ShipActor }): Promise<MarkResult>;
}

/** A printed or shipped workbook cannot change: no edit, no new rendering, no new revision of its draft. */
export const isLocked = (status: WorkbookStatus) => status === "printed" || status === "shipped";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Why the draft cannot be approved, in plain words, or [] when it can. `seenRevision`: the revision the admin looked
 * at; approval takes only the current one.
 */
export function approvalProblems(d: DraftForApproval, seenRevision: number = d.revision): string[] {
  if (!d.runDone) return ["The run is not done."];
  if (d.oldFormat) return ["The draft is in an old format. Prepare a new draft."];
  const problems: string[] = [];
  if (seenRevision !== d.revision) problems.push(`Version ${seenRevision} is not the current version (${d.revision}). Reload the page.`);
  const pages = d.draft.pages;
  const noTemplate = pages.filter((p) => !p.content);
  if (noTemplate.length) problems.push(`${plural(noTemplate.length, "page")} ${noTemplate.length === 1 ? "is" : "are"} not laid out with the real templates.`);
  const failed = pages.flatMap((p) => p.questions.filter((q) => q.check.status === "failed" || !q.package));
  if (failed.length) problems.push(`${plural(failed.length, "question")} failed ${failed.length === 1 ? "its check" : "their checks"}.`);
  const unfit = pages.filter((p) => p.fit.status === "failed");
  if (unfit.length) problems.push(`${plural(unfit.length, "page")} failed the fit check.`);
  const r = d.rendering;
  if (!r || !r.pdfPath) {
    problems.push("The draft has no PDF.");
  } else {
    const rendered = new Map(r.pages.filter((p) => !p.proof).map((p) => [p.number, p]));
    const missing = pages.filter((p) => !rendered.has(p.number));
    const notRendered = new Set([...missing.map((p) => p.number), ...d.renderProblems.map((x) => x.page)]);
    if (notRendered.size) problems.push(`${plural(notRendered.size, "page")} ${notRendered.size === 1 ? "is" : "are"} not in the PDF.`);
    const unboxed = pages.flatMap((p) => {
      const boxes = new Set(rendered.get(p.number)?.questions.map((q) => q.number) ?? []);
      return rendered.has(p.number) ? p.questions.filter((q) => !boxes.has(q.number)) : [];
    });
    if (unboxed.length) problems.push(`${plural(unboxed.length, "question")} ${unboxed.length === 1 ? "has" : "have"} no place measured on ${unboxed.length === 1 ? "its" : "their"} page.`);
  }
  return problems;
}

/** The workbook to store from a draft that passes approvalProblems: the draft's id, pages, packages and rendering. */
export function approvedWorkbook(d: DraftForApproval): WorkbookInput {
  const r = d.rendering!;
  const rendered = new Map(r.pages.map((p) => [p.number, p]));
  return {
    id: d.draftId, childId: d.draft.childId, number: d.draft.number, levels: d.draft.levels, pdfPath: r.pdfPath,
    profileBuild: d.draft.profileBuild,
    pages: d.draft.pages.map((p) => {
      const page = rendered.get(p.number)!;
      const boxes = new Map(page.questions.map((q) => [q.number, q.box]));
      return {
        number: p.number, dayLabel: p.dayLabel, type: p.type, image: page.image, qrToken: p.qrToken,
        questions: p.questions.map((q) => ({ number: q.number, box: boxes.get(q.number)!, package: q.package! })),
      };
    }),
  };
}

/** Approves the current revision of a run's draft, refused while any check fails. */
export async function approveDraft(store: WorkbookShipStore, o: { runId: string; revision: number; actor: ShipActor }): Promise<ApproveResult> {
  const d = await store.draftForApproval(o.runId);
  if (!d) return { status: "not-found" };
  const problems = approvalProblems(d, o.revision);
  if (problems.length) return { status: "refused", reasons: problems };
  const done = await store.approve({ draftId: d.draftId, revision: o.revision, workbook: approvedWorkbook(d), actor: o.actor });
  return done.status === "approved" ? done : { status: "refused", reasons: [done.reason] };
}

/** Marks a workbook printed (from approved) or shipped (from printed). */
export function markWorkbook(store: WorkbookShipStore, o: { workbookId: string; to: "printed" | "shipped"; actor: ShipActor }): Promise<MarkResult> {
  return store.mark(o);
}
