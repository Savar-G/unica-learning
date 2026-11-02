import type { WorkbookStore, WorkbookStatus } from "@/lib/workbook-content";
import { isLocked, type DraftForApproval, type ShipActor, type WorkbookShipStore } from "@/lib/workbook-ship";

// The ship store (#314) in memory, for tests: it keeps the database's behaviour (migration workbook_ship). Approval
// stores the workbook through a workbook store (memoryWorkbookStore) and refuses a revision that is not the draft's
// current one; marking moves approved -> printed -> shipped only; each step adds an audit entry with the actor. A
// printed or shipped workbook is locked: `addRevision` (a stand-in for #313's edits) is refused, as the database's
// lock trigger refuses it. `drafts`: each run's draft, by run id, as the job stored it.

export interface MemoryShipAudit {
  at: string;
  workbookId: string;
  actor: ShipActor;
  action: "workbook-approved" | "workbook-printed" | "workbook-shipped";
  detail: Record<string, unknown>;
}

export function memoryShipStore(o: {
  workbooks: WorkbookStore & { setStatus(id: string, status: WorkbookStatus): void };
  drafts: Map<string, DraftForApproval>;
  now: () => Date;
}): WorkbookShipStore & { audit: MemoryShipAudit[]; addRevision(runId: string): Promise<{ status: "added"; revision: number } | { status: "refused"; reason: string }> } {
  const audit: MemoryShipAudit[] = [];
  const statusOf = async (id: string) => (await o.workbooks.workbook(id))?.status ?? null;

  return {
    audit,

    async draftForApproval(runId) {
      const d = o.drafts.get(runId);
      return d ? structuredClone(d) : null;
    },

    async approve({ draftId, revision, workbook, actor }) {
      const d = [...o.drafts.values()].find((x) => x.draftId === draftId);
      if (!d) return { status: "refused", reason: "the draft is not known" };
      if (d.revision !== revision) return { status: "refused", reason: `version ${revision} is not the current version (${d.revision}): reload the page` };
      if (workbook.id !== draftId || workbook.childId !== d.draft.childId || workbook.number !== d.draft.number) {
        return { status: "refused", reason: "the workbook is not this draft" };
      }
      const written = await o.workbooks.write(workbook);
      if (written.status !== "written") return written;
      o.workbooks.setStatus(draftId, "approved");
      audit.push({ at: o.now().toISOString(), workbookId: draftId, actor, action: "workbook-approved", detail: { revision, number: workbook.number } });
      return { status: "approved", workbookId: draftId };
    },

    async mark({ workbookId, to, actor }) {
      const book = await o.workbooks.workbook(workbookId);
      if (!book) return { status: "not-found" };
      const from = to === "printed" ? "approved" : "printed";
      if (book.status !== from) return { status: "refused", reason: `the workbook is ${book.status}, not ${from}` };
      const firstShipped = to === "shipped" && !(await o.workbooks.childWorkbooks(book.childId)).some((w) => w.status === "shipped" && w.id !== workbookId);
      o.workbooks.setStatus(workbookId, to);
      const at = o.now().toISOString();
      audit.push({ at, workbookId, actor, action: `workbook-${to}`, detail: { number: book.number, ...(to === "shipped" ? { firstShipped } : {}) } });
      return { status: "marked", to, at, firstShipped };
    },

    async addRevision(runId) {
      const d = o.drafts.get(runId);
      if (!d) return { status: "refused", reason: "the draft is not known" };
      const status = await statusOf(d.draftId);
      if (status && isLocked(status)) return { status: "refused", reason: `workbook ${d.draftId} is ${status}: it cannot change` };
      d.revision += 1;
      return { status: "added", revision: d.revision };
    },
  };
}
