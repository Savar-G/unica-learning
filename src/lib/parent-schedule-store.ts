import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { ScheduleStore } from "@/lib/parent-schedule";

const checked = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error("Schedule read failed");
  return r.data;
};

/** Session proves ownership. The service key reads frozen approval records, always with explicit family filters. */
export function parentScheduleStore(session: SupabaseClient<Database>, service: SupabaseClient<Database>, signedInParent: string): ScheduleStore {
  const scope = (parent: string) => { if (parent !== signedInParent) throw new Error("Schedule family refused"); };
  return {
    async children(parent) {
      scope(parent);
      const deleted = checked(await session.rpc("my_family_deletion_state"));
      if (deleted) throw new Error("Schedule family unavailable");
      const [children, deletions] = await Promise.all([
        session.from("children").select("id,parent_id,first_name").eq("parent_id", parent).order("created_at").order("id"),
        service.from("child_deletions").select("child_id").eq("parent_id", parent),
      ]);
      const removed = new Set(checked(deletions)?.map(d => d.child_id));
      return checked(children)?.filter(c => !removed.has(c.id)).map(c => ({ id: c.id, parentId: c.parent_id, firstName: c.first_name })) ?? [];
    },
    async books(parent, child) {
      scope(parent);
      const rows = checked(await service.from("workbooks").select("id,parent_id,child_id,number,status,printed_revision,pdf_path,pdf_sha256,print_manifest")
        .eq("parent_id", parent).eq("child_id", child).order("number", { ascending: false }).limit(500));
      if (rows?.length === 500) throw new Error("Schedule book list incomplete");
      return rows?.map(b => ({ id: b.id, parentId: b.parent_id, childId: b.child_id, number: b.number, status: b.status,
        printedRevision: b.printed_revision, pdfPath: b.pdf_path, pdfSha256: b.pdf_sha256, manifest: b.print_manifest })) ?? [];
    },
    async approvals(parent, child, book) {
      scope(parent);
      const rows = checked(await service.from("workbook_audit").select("parent_id,child_id,draft_id,workbook_id,detail")
        .eq("parent_id", parent).eq("child_id", child).eq("workbook_id", book).eq("action", "workbook-approved").limit(500));
      if (rows?.length === 500) throw new Error("Schedule approval list incomplete");
      return rows?.map(a => ({ parentId: a.parent_id, childId: a.child_id, draftId: a.draft_id, workbookId: a.workbook_id,
        revision: typeof a.detail.revision === "number" ? a.detail.revision : NaN,
        number: typeof a.detail.number === "number" ? a.detail.number : NaN,
        printedRevision: typeof a.detail.printedRevision === "string" ? a.detail.printedRevision : null })) ?? [];
    },
    async revision(parent, child, book, revision) {
      scope(parent);
      const draft = checked(await service.from("workbook_drafts").select("parent_id,child_id,number,draft,schema_version")
        .eq("parent_id", parent).eq("child_id", child).eq("id", book).maybeSingle());
      if (!draft || ![1, 2].includes(draft.schema_version)) return null;
      // A revision has no parent column. The explicitly owned draft above is its only read admission.
      const saved = checked(await service.from("workbook_draft_revisions").select("content,rendering").eq("draft_id", book).eq("revision", revision).maybeSingle());
      if (!saved || (!saved.content && revision !== 1)) return null;
      return { parentId: draft.parent_id, childId: draft.child_id, number: draft.number, draft: saved.content ?? draft.draft, rendering: saved.rendering };
    },
    async pages(parent, child, book) {
      scope(parent);
      // `book` was read with both family and child by readSchedule. Pages also carry the family key.
      // Question ids, geometry and teaching participate in printedRevision. No question text leaves this adapter.
      const rows = checked(await service.from("workbook_pages").select("id,page_number,qr_token,print_contract,workbook_questions(question_number,package,box_x,box_y,box_width,box_height,regions,teaching)")
        .eq("parent_id", parent).eq("workbook_id", book).eq("workbook_questions.parent_id", parent).order("page_number").limit(500));
      if (rows?.length === 500) throw new Error("Schedule page list incomplete");
      return rows?.map(p => ({ id: p.id, number: p.page_number, contract: p.print_contract, qrToken: p.qr_token,
        questions: p.workbook_questions.map(q => {
          const pkg = q.package;
          if (!pkg || typeof pkg !== "object" || Array.isArray(pkg) || typeof pkg.id !== "string") throw new Error("Schedule question identity unavailable");
          return { number: q.question_number, package: { id: pkg.id }, box: { x: q.box_x, y: q.box_y, width: q.box_width, height: q.box_height }, regions: q.regions, teaching: q.teaching };
        }),
      })) ?? [];
    },
    async receipts(parent, child, book, revision) {
      scope(parent);
      const result: Awaited<ReturnType<ScheduleStore["receipts"]>> = [];
      // Read immutable accepted facts only. Calibration and photo lifecycle cannot retract them.
      for (let after: string | null = null; ;) {
        const query = service.from("workbook_scan_receipts").select("id,parent_id,child_id,workbook_id,page_id,printed_revision,status")
          .eq("parent_id", parent).eq("child_id", child).eq("workbook_id", book).eq("printed_revision", revision).eq("status", "accepted");
        const response: { data: Pick<Database["public"]["Tables"]["workbook_scan_receipts"]["Row"], "id" | "parent_id" | "child_id" | "workbook_id" | "page_id" | "printed_revision" | "status">[] | null; error: { message: string } | null } = await (after ? query.gt("id", after) : query).order("id").limit(100);
        const receipts = checked(response);
        if (!receipts?.length) break;
        result.push(...receipts.map(r => ({ parentId: r.parent_id, childId: r.child_id, workbookId: r.workbook_id,
          pageId: r.page_id, revision: r.printed_revision, status: r.status })));
        after = receipts[receipts.length - 1].id;
      }
      return result;
    },
  };
}
