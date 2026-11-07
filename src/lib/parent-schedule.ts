import type { GeneratedWorkbook } from "@/lib/workbook-generator";
import type { DraftRendering } from "@/lib/workbook-job";
import { isPrintedRevision, manifestProblem, pageContentFingerprint, printedRevision, type PagePrintContract, type RevisionSource, type ScanManifest } from "@/lib/workbook-print-contract";
import { savedScheduleV1, type SavedScheduleRow } from "@/lib/parent-schedule-v1";
import { canonical } from "@/lib/workbook-digest";

export const SCHEDULE_PATH = "/account/schedule";
export const schedulePath = (child: string) => `${SCHEDULE_PATH}?child=${encodeURIComponent(child)}`;
export interface ScheduleChild { id: string; parentId: string; firstName: string }
export interface ScheduleBook {
  id: string; parentId: string; childId: string; number: number; status: string;
  printedRevision: string | null; pdfPath: string | null; pdfSha256: string | null; manifest: ScanManifest | null;
}
export interface ScheduleApproval { parentId: string; childId: string; draftId: string | null; workbookId: string | null; revision: number; number: number; printedRevision: string | null }
export interface ScheduleRevision { parentId: string; childId: string; number: number; draft: GeneratedWorkbook; rendering: DraftRendering | null }
export interface SchedulePage { id: string; number: number; contract: PagePrintContract | null; qrToken: string; questions: RevisionSource["pages"][number]["questions"] }
export interface ScheduleReceipt {
  parentId: string; childId: string; workbookId: string; pageId: string;
  revision: string; status: string;
}

/** One read seam. Implementations must scope every service read to this parent and child. No writes. */
export interface ScheduleStore {
  children(parent: string): Promise<ScheduleChild[]>;
  books(parent: string, child: string): Promise<ScheduleBook[]>;
  approvals(parent: string, child: string, book: string): Promise<ScheduleApproval[]>;
  revision(parent: string, child: string, book: string, revision: number): Promise<ScheduleRevision | null>;
  pages(parent: string, child: string, book: string): Promise<SchedulePage[]>;
  receipts(parent: string, child: string, book: string, revision: string): Promise<ScheduleReceipt[]>;
}
export type ScheduleScanState = { kind: "known"; accepted: number; required: number } | { kind: "unknown" };
export interface ScheduleRow extends SavedScheduleRow { scan: ScheduleScanState }
export type ScheduleView =
  | { kind: "not-found" }
  | { kind: "waiting"; child: ScheduleChild | null }
  | { kind: "unavailable"; child: ScheduleChild | null }
  | { kind: "ready"; child: ScheduleChild; book: { id: string; number: number }; rows: ScheduleRow[]; dailyTime: string };

const eligible = (b: ScheduleBook) => b.status === "printed" || b.status === "shipped";

/** Plain email URLs use the owned remembered child, then the oldest owned child. Explicit foreign ids never fall back. */
export async function readSchedule(store: ScheduleStore, parent: string, request: { child?: string | null; remembered?: string | null; book?: string | null } = {}): Promise<ScheduleView> {
  let child: ScheduleChild | null = null;
  try {
    const children = (await store.children(parent)).filter(c => c.parentId === parent);
    const explicitChild = request.child != null, explicitBook = request.book != null;
    child = children.find(c => c.id === (request.child ?? request.remembered)) ?? (explicitChild ? null : children[0] ?? null);
    if (explicitChild && !child) return { kind: "not-found" };
    if (!child) return explicitBook ? { kind: "not-found" } : { kind: "waiting", child: null };
    const books = (await store.books(parent, child.id)).filter(b => b.parentId === parent && b.childId === child!.id);
    const book = explicitBook ? books.find(b => b.id === request.book) : books.filter(eligible).sort((a, b) => b.number - a.number || a.id.localeCompare(b.id))[0];
    if (explicitBook && !book) return { kind: "not-found" };
    if (!book || !eligible(book)) return { kind: "waiting", child };
    if (!isPrintedRevision(book.printedRevision) || !book.pdfPath || !/^[a-f0-9]{64}$/.test(book.pdfSha256 ?? "") || !book.manifest) return { kind: "unavailable", child };
    const approvals = (await store.approvals(parent, child.id, book.id)).filter(a => a.parentId === parent && a.childId === child!.id
      && a.workbookId === book.id && a.draftId === book.id && a.number === book.number && a.printedRevision === book.printedRevision);
    const revisions = new Set(approvals.map(a => a.revision));
    const revision = approvals[0]?.revision;
    if (revisions.size !== 1 || !Number.isInteger(revision) || revision < 1) return { kind: "unavailable", child };
    const [source, pages] = await Promise.all([store.revision(parent, child.id, book.id, revision), store.pages(parent, child.id, book.id)]);
    if (!source || source.parentId !== parent || source.childId !== child.id || source.number !== book.number
      || source.draft.childId !== child.id || source.draft.number !== book.number || source.draft.id !== book.id
      || source.rendering?.pdfPath !== book.pdfPath || source.rendering?.pdfSha256 !== book.pdfSha256) return { kind: "unavailable", child };
    const draft = source.draft;
    if (pages.length !== draft.pages.length || new Set(pages.map(p => p.number)).size !== pages.length
      || manifestProblem(book.manifest, draft.pages)) return { kind: "unavailable", child };
    if (printedRevision({ ...book, printManifest: book.manifest, pages: pages.map(p => ({ ...p, printContract: p.contract })) }) !== book.printedRevision) return { kind: "unavailable", child };
    for (const p of draft.pages) {
      const stored = pages.find(s => s.number === p.number)?.contract;
      const rendered = source.rendering.pages.find(r => !r.proof && r.number === p.number)?.printContract;
      if (!stored || !rendered || stored.workbookId !== book.id || stored.page !== p.number
        || stored.version !== 1 || JSON.stringify(canonical(stored)) !== JSON.stringify(canonical(rendered)) || stored.fingerprints.content !== pageContentFingerprint({ ...p,
          questions: p.questions.flatMap(q => q.package ? [{ number: q.number, package: q.package }] : []),
        })) return { kind: "unavailable", child };
    }
    const saved = savedScheduleV1(draft);
    if (!saved) return { kind: "unavailable", child };
    // The frozen manifest owns required-page semantics. Extra practice is not inferred from a range.
    if (book.manifest.days.length !== saved.rows.length || saved.rows.some(r => {
      const required = book.manifest!.days.find(d => d.day === r.day)?.pages;
      return !required?.length || required.some(n => n < r.pages[0] || n > r.pages[1]);
    })) return { kind: "unavailable", child };
    let receipts: ScheduleReceipt[] | null;
    try { receipts = await store.receipts(parent, child.id, book.id, book.printedRevision); } catch { receipts = null; }
    const rows = saved.rows.map(r => {
      const required = book.manifest!.days.find(d => d.day === r.day)!.pages;
      const accepted = new Set<number>();
      for (const s of receipts ?? []) {
        const page = pages.find(p => p.id === s.pageId);
        // Immutable accepted facts survive calibration rechecks and image cleanup.
        if (s.parentId === parent && s.childId === child!.id && s.workbookId === book.id && s.revision === book.printedRevision
          && s.status === "accepted" && page && required.includes(page.number)) accepted.add(page.number);
      }
      // Receipts have no historical backfill. Absence cannot prove that a page was never scanned.
      return { ...r, scan: accepted.size ? { kind: "known" as const, accepted: accepted.size, required: required.length } : { kind: "unknown" as const } };
    });
    // Only the safe projection leaves this module. No draft, PDF path, questions or contracts.
    return { kind: "ready", child, book: { id: book.id, number: book.number }, rows, dailyTime: saved.dailyTime };
  } catch { return { kind: "unavailable", child }; }
}
