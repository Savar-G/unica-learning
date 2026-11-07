import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { workbookDeliveryStore } from "./workbook-delivery-store";
import type { FrozenSourceBook, WorkbookProgressSourceStore } from "./workbook-progress-source";

const BATCH = 100;
type Reply<T> = { data: T[] | null; count: number | null; error: unknown };
/** Exact remaining counts and an empty tail prove completion even below the requested API page size. */
async function all<T, K extends string | number>(load: (after: K | null) => PromiseLike<Reply<T>>, key: (r: T) => K, budget: { rows: number; requests: number }): Promise<T[]> {
  let after: K | null = null, remaining: number | null = null;
  const rows: T[] = [];
  for (let request = 0; request < 1000; request++) {
    if (++budget.requests > 3000) throw Error("source-bound");
    const p = await load(after);
    if (p.error || !Array.isArray(p.data) || p.count === null || !Number.isSafeInteger(p.count) || p.count < 0
      || remaining !== null && p.count !== remaining || p.data.length > BATCH || p.data.length > p.count
      || p.count > 0 && p.data.length === 0 || budget.rows + p.count > 20_000) throw Error("source-pagination");
    for (const r of p.data) {
      const k = key(r);
      if (!(typeof k === "string" ? k.length > 0 : Number.isSafeInteger(k) && Number(k) > 0) || after !== null && k <= after) throw Error("source-cursor");
      rows.push(r); after = k; budget.rows++;
    }
    if (p.count === 0) return rows;
    remaining = p.count - p.data.length;
  }
  throw Error("source-bound");
}
function one<T>(r: { data: T; error: unknown }): T { if (r.error) throw Error("source-read"); return r.data; }

/** Existing schema only. Session authorization belongs to workbook-preview-server, never this service adapter. */
export function workbookProgressSourceStore(db: SupabaseClient<Database>): WorkbookProgressSourceStore {
  return { async capture(r) {
    const budget = { rows: 0, requests: 0 };
    const parent = one(await db.from("parents").select("id,deletion_requested_at").eq("id", r.parentId).maybeSingle());
    const child = one(await db.from("children").select("id,parent_id").eq("id", r.childId).eq("parent_id", r.parentId).maybeSingle());
    const deletion = one(await db.from("family_deletions").select("parent_id").eq("parent_id", r.parentId).maybeSingle());
    const childDeletion = one(await db.from("child_deletions").select("child_id,parent_id").eq("parent_id", r.parentId).eq("child_id", r.childId).maybeSingle());
    if (!parent || parent.id !== r.parentId || parent.deletion_requested_at !== null || !child || child.id !== r.childId || child.parent_id !== r.parentId || deletion || childDeletion) return null;
    const revision = one(await db.from("scan_marking_revisions").select("parent_id,child_id,revision").eq("parent_id", r.parentId).eq("child_id", r.childId).maybeSingle());
    if (revision && (revision.parent_id !== r.parentId || revision.child_id !== r.childId)) return null;
    const headers = await all(after => {
      const q = db.from("workbooks").select("id,parent_id,child_id,number,status,printed_revision,print_manifest,profile_build", { count: "exact" })
        .eq("parent_id", r.parentId).eq("child_id", r.childId).order("id").limit(BATCH);
      return after === null ? q : q.gt("id", after);
    }, x => x.id, budget);
    if (headers.some(b => b.parent_id !== r.parentId || b.child_id !== r.childId)) return null;
    const selected = headers.find(b => b.id === r.workbookId);
    if (!selected || selected.printed_revision !== r.printedRevision || selected.status !== "shipped") return null;
    const books: FrozenSourceBook[] = [];
    const retained = headers.filter(b => b.status === "shipped" && b.number <= selected.number);
    if (retained.length > 20) throw Error("source-bound");
    for (const book of retained) {
      const receipt = await workbookDeliveryStore(db).receipt(book.id);
      if (!receipt || receipt.parentId !== r.parentId || receipt.childId !== r.childId || receipt.number !== book.number) return null;
      const pages = await all(after => {
        const q = db.from("workbook_pages").select("id,parent_id,workbook_id,page_number,day_label,page_type,print_contract,image_width,image_height", { count: "exact" })
          .eq("parent_id", r.parentId).eq("workbook_id", book.id).order("id").limit(BATCH);
        return after === null ? q : q.gt("id", after);
      }, x => x.id, budget);
      const questions = await all(after => {
        const q = db.from("workbook_questions").select("id,parent_id,workbook_id,page_id,question_number,schema_version,package,teaching,regions,box_x,box_y,box_width,box_height", { count: "exact" })
          .eq("parent_id", r.parentId).eq("workbook_id", book.id).order("id").limit(BATCH);
        return after === null ? q : q.gt("id", after);
      }, x => x.id, budget);
      const items = await all(after => {
        const q = db.from("scan_marking_items").select("id,parent_id,child_id,workbook_id,printed_revision,page_id,item_id,expected,observation,result_version,original_event,event_id,evidence_at,model,prompt", { count: "exact" })
          .eq("parent_id", r.parentId).eq("child_id", r.childId).eq("workbook_id", book.id).eq("printed_revision", book.printed_revision!).order("id").limit(BATCH);
        return after === null ? q : q.gt("id", after);
      }, x => x.id, budget);
      const joinedChanges = await all(after => {
        const q = db.from("scan_mark_changes").select("id,item_id,parent_id,child_id,from_version,to_version,actor,changed_at,previous,current,scan_marking_items!inner(workbook_id,printed_revision)", { count: "exact" })
          .eq("parent_id", r.parentId).eq("child_id", r.childId).eq("scan_marking_items.workbook_id", book.id).eq("scan_marking_items.printed_revision", book.printed_revision!).order("id").limit(BATCH);
        return after === null ? q : q.gt("id", after);
      }, x => x.id, budget);
      const changes = joinedChanges.map(({ scan_marking_items: joined, ...change }) => {
        if (joined.workbook_id !== book.id || joined.printed_revision !== book.printed_revision) throw Error("source-change-scope");
        return change;
      });
      const events = await all(after => {
        const q = db.from("learning_events").select("id,idempotency_key,parent_id,child_id,source,question_source,workbook_id,workbook_page,workbook_question,occurred_at,result,hints,evidence_kind,evidence_id,skill_standard,skills", { count: "exact" })
          .eq("parent_id", r.parentId).eq("child_id", r.childId).eq("question_source", "workbook").eq("workbook_id", book.id).order("id").limit(BATCH);
        return after === null ? q : q.gt("id", after);
      }, x => x.id, budget);
      const approvals = await all(after => {
        const q = db.from("workbook_audit").select("id,parent_id,child_id,workbook_id,run_id,action,at,detail", { count: "exact" })
          .eq("parent_id", r.parentId).eq("child_id", r.childId).eq("workbook_id", book.id).eq("action", "workbook-approved").order("id").limit(BATCH);
        return after === null ? q : q.gt("id", after);
      }, x => x.id, budget);
      if (approvals.length > 20) throw Error("source-bound");
      const frames: FrozenSourceBook["frames"] = [];
      for (const runId of new Set(approvals.map(a => a.run_id).filter((s): s is string => s !== null))) {
        const frame = one(await db.from("workbook_run_frames").select("run_id,parent_id,child_id,created_at,frame")
          .eq("parent_id", r.parentId).eq("child_id", r.childId).eq("run_id", runId).maybeSingle());
        if (frame) frames.push(frame);
      }
      books.push({ book, delivery: { auditId: receipt.correction?.auditId ?? receipt.auditId, deliveredAt: receipt.deliveredAt }, pages, questions, items, changes, events, approvals, frames });
      if (Buffer.byteLength(JSON.stringify(books), "utf8") > 3_500_000) throw Error("source-bound");
    }
    const profile = one(await db.from("child_profiles").select("parent_id,child_id,assessment_id,revision,schema_version,build_token,built_at")
      .eq("parent_id", r.parentId).eq("child_id", r.childId).maybeSingle());
    const assessmentReferences = await all(after => {
      const q = db.from("learner_profiles").select("id,parent_id,child_id,assessment_id,schema_version,built_at", { count: "exact" })
        .eq("parent_id", r.parentId).eq("child_id", r.childId).order("id").limit(BATCH);
      return after === null ? q : q.gt("id", after);
    }, x => x.id, budget);
    return { version: 1, parentId: r.parentId, childId: r.childId, markingRevision: revision?.revision ?? null,
      books, profileReferences: profile ? [profile] : [], assessmentReferences };
  } };
}
