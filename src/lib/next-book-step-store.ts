// Supabase NextBookDueReader for the next-book step (#476), with the service client. Read only: every write goes through
// prepareNextBook and its SQL functions. Any failed read, unexpected row or answer shorter than its own count throws, so
// the step stops reading for that run (with no writes when it was the first page).
//
// One page: each of the three sources is read oldest first from the cursor, at most `size` rows each.
// (b) chains: next_book_snapshots, revision 1, not held, no run yet.
// (a) claims: book 1 trigger claims with no snapshot row of their own (trigger_id), less the few whose book already has a
//     live chain (an admin chain made before the claim).
// (c) holds: book 1 backstop holds with no held row, no live chain and no claim. A recorded hold keeps its row in
//     workbook_scan_backstop_holds and no foreign key lets the read leave it out, so it is read and dropped here.
// The page returns the items up to the earliest last row of a source that has more (`next`), so the next page, which
// starts at `next`, keeps the order across sources. Rows at `next` come again and the step skips books it has seen.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { dueOrder, type NextBookDueItem, type NextBookDueReader } from "./next-book-step";
import { isUuid } from "./workbook-content";

const CANDIDATES = 100;
const CHUNK = 100;
/** Rows one chunk of related reads may hold: a book has one live chain and a few held rows. */
const RELATED_MAX = 1_000;

function bad(what: string): never { throw new Error(`next_book_due_${what}`); }
type Page<T> = { data: T[] | null; error: unknown; count: number | null };
/** The whole answer, or a throw: an error, no count, or fewer rows than the count allows (a cut answer). */
function exact<T>(page: Page<T>, limit: number, what: string): T[] {
  if (page.error || !Array.isArray(page.data) || page.count === null || page.data.length !== Math.min(page.count, limit)) bad(what);
  return page.data;
}
const time = (v: unknown, what: string): number => {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : bad(what);
};
const ids = (v: unknown, what: string): string => isUuid(v) ? v : bad(what);
const chunks = <T>(list: readonly T[]) => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));

export function nextBookDueStore(db: SupabaseClient<Database>): NextBookDueReader {
  /** Revision-1 rows (live and held) of these books. */
  async function chainsOf(books: readonly string[]) {
    const rows: { workbook_id: string; delivery_audit_id: number | null; held_reason: string | null }[] = [];
    for (const part of chunks([...new Set(books)])) {
      rows.push(...exact(await db.from("next_book_snapshots").select("workbook_id,delivery_audit_id,held_reason", { count: "exact" })
        .eq("revision", 1).in("workbook_id", part).order("id").limit(RELATED_MAX), RELATED_MAX, "related_chains"));
    }
    return rows;
  }
  async function claimedBooks(books: readonly string[]) {
    const out = new Set<string>();
    for (const part of chunks([...new Set(books)])) {
      for (const r of exact(await db.from("workbook_scan_trigger_claims").select("workbook_id", { count: "exact" })
        .in("workbook_id", part).order("workbook_id").limit(RELATED_MAX), RELATED_MAX, "related_claims")) out.add(r.workbook_id);
    }
    return out;
  }
  return {
    async page({ size, from, parents }) {
      if (!Number.isSafeInteger(size) || size < 1 || size > CANDIDATES) bad("size");
      if (from !== null && !Number.isSafeInteger(from)) bad("from");
      if (parents && parents.length === 0) return { items: [], next: null };
      const only = parents ? [...parents] : null;
      const since = from === null ? null : new Date(from).toISOString();

      let chainQuery = db.from("next_book_snapshots").select("id,workbook_id,parent_id,child_id,prepare_from", { count: "exact" })
        .eq("revision", 1).is("held_reason", null).is("run_id", null);
      if (only) chainQuery = chainQuery.in("parent_id", only);
      if (since) chainQuery = chainQuery.gte("prepare_from", since);
      const chainPage = await chainQuery.order("prepare_from").order("id").limit(size);
      const chains = exact(chainPage, size, "chains");

      let claimQuery = db.from("workbook_scan_trigger_claims")
        .select("id,workbook_id,parent_id,child_id,claimed_at,next_book_snapshots!left(id)", { count: "exact" })
        .eq("number", 1).is("next_book_snapshots", null);
      if (only) claimQuery = claimQuery.in("parent_id", only);
      if (since) claimQuery = claimQuery.gte("claimed_at", since);
      const claimPage = await claimQuery.order("claimed_at").order("id").limit(size);
      const claims = exact(claimPage, size, "claims");

      let holdQuery = db.from("workbook_scan_backstop_holds")
        .select("workbook_id,parent_id,child_id,delivery_audit_id,held_at,workbook_delivery_receipts!inner(number)", { count: "exact" })
        .eq("workbook_delivery_receipts.number", 1);
      if (only) holdQuery = holdQuery.in("parent_id", only);
      if (since) holdQuery = holdQuery.gte("held_at", since);
      const holdPage = await holdQuery.order("held_at").order("workbook_id").order("delivery_audit_id").limit(size);
      const holds = exact(holdPage, size, "holds");

      if (claims.some(c => Array.isArray(c.next_book_snapshots) && c.next_book_snapshots.length > 0)) bad("claims_filter");
      // Where each source that has more rows stops; the page covers only up to the earliest of those.
      const stops = [
        chainPage.count! > chains.length ? time(chains.at(-1)!.prepare_from, "chain_row") : null,
        claimPage.count! > claims.length ? time(claims.at(-1)!.claimed_at, "claim_row") : null,
        holdPage.count! > holds.length ? time(holds.at(-1)!.held_at, "hold_row") : null,
      ].filter((t): t is number => t !== null);
      const next = stops.length ? Math.min(...stops) : null;

      const related = await chainsOf([...claims.map(c => c.workbook_id), ...holds.map(h => h.workbook_id)]);
      const live = new Set(related.filter(r => r.held_reason === null).map(r => r.workbook_id));
      const recorded = new Set(related.filter(r => r.held_reason !== null).map(r => `${r.workbook_id}:${r.delivery_audit_id}`));
      const claimed = await claimedBooks(holds.map(h => h.workbook_id));

      const items: NextBookDueItem[] = [];
      for (const c of chains) {
        const id = ids(c.id, "chain_row");
        items.push({ kind: "chain", anchor: time(c.prepare_from, "chain_row"), id, workbookId: ids(c.workbook_id, "chain_row"),
          parentId: ids(c.parent_id, "chain_row"), childId: ids(c.child_id, "chain_row"), trigger: { kind: "snapshot", snapshotId: id } });
      }
      for (const c of claims) {
        const workbookId = ids(c.workbook_id, "claim_row");
        if (live.has(workbookId)) continue;
        const id = ids(c.id, "claim_row");
        items.push({ kind: "claim", anchor: time(c.claimed_at, "claim_row"), id, workbookId, parentId: ids(c.parent_id, "claim_row"),
          childId: ids(c.child_id, "claim_row"), trigger: { kind: "claim", triggerId: id } });
      }
      for (const h of holds) {
        const workbookId = ids(h.workbook_id, "hold_row");
        if (!Number.isSafeInteger(h.delivery_audit_id) || h.delivery_audit_id < 1) bad("hold_row");
        if (live.has(workbookId) || claimed.has(workbookId) || recorded.has(`${workbookId}:${h.delivery_audit_id}`)) continue;
        items.push({ kind: "hold", anchor: time(h.held_at, "hold_row"), id: `${workbookId}:${h.delivery_audit_id}`, workbookId,
          parentId: ids(h.parent_id, "hold_row"), childId: ids(h.child_id, "hold_row"),
          trigger: { kind: "backstop-hold", workbookId, deliveryAuditId: h.delivery_audit_id } });
      }
      return { items: items.filter(i => next === null || i.anchor <= next).sort(dueOrder), next };
    },
  };
}

/** test_accounts still marks this parent. Throws on a failed read (the step counts it as an error on that item). */
export async function isTestAccount(db: SupabaseClient<Database>, parentId: string): Promise<boolean> {
  const { data, error } = await db.from("test_accounts").select("parent_id").eq("parent_id", parentId).maybeSingle();
  if (error) throw new Error("next_book_test_gate_read");
  return data?.parent_id === parentId;
}
