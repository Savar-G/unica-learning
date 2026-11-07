import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import type { HistoryBook, HistoryFence, HistoryPage, WorkbookProgressHistoryInput, WorkbookProgressHistoryStore } from "./workbook-progress-history";

const MARK_COLUMNS = "id,parent_id,child_id,workbook_id,printed_revision,page_id,item_id,expected,observation,result_version,original_event,event_id,evidence_at,model,prompt";
const CHANGE_COLUMNS = "id,item_id,parent_id,child_id,from_version,to_version,actor,changed_at,previous,current,scan_marking_items!inner(workbook_id,printed_revision)";
const EVENT_COLUMNS = "id,idempotency_key,parent_id,child_id,source,question_source,workbook_id,workbook_page,workbook_question,occurred_at,result,hints,evidence_kind,evidence_id,skill_standard,skills";
const uuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const same = isDeepStrictEqual;
function checked<T>(r: { data: T[] | null; count: number | null; error: unknown }): HistoryPage<T> {
  if (r.error || !Array.isArray(r.data) || r.count === null || !Number.isSafeInteger(r.count) || r.count < 0) throw new Error("history_source");
  return { rows: r.data, remaining: r.count };
}
function count(r: { count: number | null; error: unknown }): number {
  if (r.error || r.count === null || !Number.isSafeInteger(r.count) || r.count < 0) throw new Error("history_count");
  return r.count;
}

/**
 * Read-only service adapter. Credentials DO NOT authorize a caller. The server caller must check the live
 * parent/admin session, then supply trusted frozen packages, sample, issuance and prior-mastery proof.
 * All queries use generated table/column/relationship types. No RPC, Auth, Storage, image, profile or job read occurs.
 */
export function workbookProgressHistoryStore(db: SupabaseClient<Database>): WorkbookProgressHistoryStore {
  function items(i: WorkbookProgressHistoryInput, b: HistoryBook) {
    return db.from("scan_marking_items").select(MARK_COLUMNS, { count: "exact" })
      .eq("parent_id", i.snapshot.parentId).eq("child_id", i.snapshot.childId)
      .eq("workbook_id", b.workbookId).eq("printed_revision", b.printedRevision);
  }
  function changes(i: WorkbookProgressHistoryInput, b: HistoryBook) {
    return db.from("scan_mark_changes").select(CHANGE_COLUMNS, { count: "exact" })
      .eq("parent_id", i.snapshot.parentId).eq("child_id", i.snapshot.childId)
      .eq("scan_marking_items.workbook_id", b.workbookId).eq("scan_marking_items.printed_revision", b.printedRevision);
  }
  function events(i: WorkbookProgressHistoryInput, b: HistoryBook) {
    // All retained workbook events, including late rows, are read and validated. No photo-age window applies.
    return db.from("learning_events").select(EVENT_COLUMNS, { count: "exact" })
      .eq("parent_id", i.snapshot.parentId).eq("child_id", i.snapshot.childId)
      .eq("question_source", "workbook").eq("workbook_id", b.workbookId);
  }
  async function revision(i: WorkbookProgressHistoryInput) {
    const r = await db.from("scan_marking_revisions").select("parent_id,child_id,revision")
      .eq("parent_id", i.snapshot.parentId).eq("child_id", i.snapshot.childId).maybeSingle();
    if (r.error) throw new Error("history_revision");
    if (!r.data) return null;
    if (r.data.parent_id !== i.snapshot.parentId || r.data.child_id !== i.snapshot.childId
      || !Number.isSafeInteger(r.data.revision) || r.data.revision < 0) throw new Error("history_revision");
    return r.data.revision;
  }
  return {
    async items(i, b, after, limit) {
      const q = items(i, b).order("id").limit(limit);
      return checked(await (after === null ? q : q.gt("id", after)));
    },
    async changes(i, b, after, limit) {
      const q = changes(i, b).order("id").limit(limit);
      return checked(await (after === null ? q : q.gt("id", after)));
    },
    async events(i, b, after, limit) {
      const q = events(i, b).order("id").limit(limit);
      return checked(await (after === null ? q : q.gt("id", after)));
    },
    async fence(i) {
      if (![i.snapshot.parentId, i.snapshot.childId, ...i.books.map(b => b.workbookId)].every(uuid)) return null;
      const markingRevision = await revision(i);
      const parent = await db.from("parents").select("id,deletion_requested_at").eq("id", i.snapshot.parentId).maybeSingle();
      if (parent.error) throw new Error("history_parent");
      if (!parent.data || parent.data.id !== i.snapshot.parentId || parent.data.deletion_requested_at !== null) return null;
      const child = await db.from("children").select("id,parent_id").eq("id", i.snapshot.childId).eq("parent_id", i.snapshot.parentId).maybeSingle();
      if (child.error) throw new Error("history_child");
      if (!child.data || child.data.id !== i.snapshot.childId || child.data.parent_id !== i.snapshot.parentId) return null;
      const family = await db.from("family_deletions").select("parent_id").eq("parent_id", i.snapshot.parentId).maybeSingle();
      const deletion = await db.from("child_deletions").select("parent_id,child_id")
        .eq("parent_id", i.snapshot.parentId).eq("child_id", i.snapshot.childId).maybeSingle();
      if (family.error || deletion.error) throw new Error("history_fence");
      if (family.data || deletion.data) return null;
      const books: HistoryFence["books"][number][] = [];
      for (const b of i.books) {
        const result = await db.from("workbooks").select("id,parent_id,child_id,status,printed_revision,print_manifest")
          .eq("id", b.workbookId).eq("parent_id", i.snapshot.parentId).eq("child_id", i.snapshot.childId).maybeSingle();
        if (result.error) throw new Error("history_book");
        const r = result.data;
        if (!r || r.id !== b.workbookId || r.parent_id !== i.snapshot.parentId || r.child_id !== i.snapshot.childId
          || r.status !== "shipped" || r.printed_revision !== b.printedRevision || !r.print_manifest || !same(r.print_manifest, b.manifest)) return null;
        // Check catalog page identity and frozen printed-day context without loading images or page content.
        const pageIds = b.pages.map(p => p.pageId);
        if (new Set(pageIds).size !== pageIds.length || pageIds.some(p => !uuid(p)) || pageIds.length > 2000) return null;
        for (let n = 0; n < pageIds.length; n += 100) {
          const ids = pageIds.slice(n, n + 100);
          const pages = await db.from("workbook_pages").select("id,parent_id,workbook_id,page_number,print_contract")
            .eq("parent_id", i.snapshot.parentId).eq("workbook_id", b.workbookId).in("id", ids);
          if (pages.error) throw new Error("history_pages");
          if (!pages.data || pages.data.length !== ids.length || new Set(pages.data.map(p => p.id)).size !== ids.length) return null;
          for (const p of pages.data) {
            const expected = b.pages.find(x => x.pageId === p.id);
            if (!expected || p.parent_id !== i.snapshot.parentId || p.workbook_id !== b.workbookId || p.page_number !== expected.number
              || !p.print_contract || p.print_contract.version !== 1 || p.print_contract.workbookId !== b.workbookId
              || p.print_contract.page !== expected.number || p.print_contract.day !== expected.day) return null;
          }
        }
        const itemCount = count(await db.from("scan_marking_items").select("id", { count: "exact", head: true })
          .eq("parent_id", i.snapshot.parentId).eq("child_id", i.snapshot.childId).eq("workbook_id", b.workbookId).eq("printed_revision", b.printedRevision));
        const changeCount = count(await db.from("scan_mark_changes").select("id,scan_marking_items!inner(workbook_id,printed_revision)", { count: "exact", head: true })
          .eq("parent_id", i.snapshot.parentId).eq("child_id", i.snapshot.childId)
          .eq("scan_marking_items.workbook_id", b.workbookId).eq("scan_marking_items.printed_revision", b.printedRevision));
        const eventCount = count(await db.from("learning_events").select("id", { count: "exact", head: true })
          .eq("parent_id", i.snapshot.parentId).eq("child_id", i.snapshot.childId).eq("question_source", "workbook").eq("workbook_id", b.workbookId));
        books.push({ workbookId: r.id, printedRevision: b.printedRevision, manifest: r.print_manifest,
          counts: { items: itemCount, changes: changeCount, events: eventCount } });
      }
      // Each fence itself must be stable while its scoped tables are checked.
      if (await revision(i) !== markingRevision) throw new Error("history_fence_changed");
      return { parentId: i.snapshot.parentId, childId: i.snapshot.childId, markingRevision, books };
    },
  };
}
