// The draft store (#311) in memory, for tests: the same refusals as the Supabase adapter (src/lib/workbook-draft-store.ts).
// `children` maps each known child id to its parent id; a draft of another child is refused.
import { draftProblem, type GeneratedWorkbook, type WorkbookDraftStore } from "@/lib/workbook-generator";

export function memoryDraftStore(children: Record<string, string>): WorkbookDraftStore & { drafts: Map<string, GeneratedWorkbook> } {
  const drafts = new Map<string, GeneratedWorkbook>();
  return {
    drafts,
    async save(draft) {
      const problem = draftProblem(draft);
      if (problem) return { status: "refused", reason: problem };
      if (!Object.hasOwn(children, draft.childId)) return { status: "refused", reason: "the child is not known" };
      if (drafts.has(draft.id)) return { status: "refused", reason: "the draft id is already used" };
      drafts.set(draft.id, structuredClone(draft));
      return { status: "saved", draftId: draft.id };
    },
    async draft(id) {
      const d = drafts.get(id);
      return d ? structuredClone(d) : null;
    },
  };
}
