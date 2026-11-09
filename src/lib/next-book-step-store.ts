// Supabase NextBookDueReader for the next-book step (#476), with the service client. Read only: every write goes through
// prepareNextBook and its SQL functions. Any failed read, unexpected row or answer shorter than its own count throws, so
// the step stops reading for that run (with no writes when it was the first page).
//
// One page: each of the three sources is read in due order strictly after the keyset cursor (anchor time to the
// microsecond, kind, id), at most `size` rows each.
// (b) chains: next_book_snapshots, revision 1, not held, no run yet.
// (a) claims: book 1 trigger claims with no snapshot row of their own (trigger_id), less the few whose book already has a
//     live chain (an admin chain made before the claim).
// (c) holds: book 1 backstop holds with no held row, no live chain and no claim. A recorded hold keeps its row in
//     workbook_scan_backstop_holds and no foreign key lets the read leave it out, so it is read and dropped here.
// The page returns the items up to the earliest last row of a source that has more (`next`), so the next page, which
// starts strictly after `next`, keeps the order across sources and reads no row twice.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { dueOrder, holdId, KIND_ORDER, type NextBookDueCursor, type NextBookDueItem, type NextBookDueKind,
  type NextBookDueReader } from "./next-book-step";
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
/**
 * A timestamptz as PostgREST answers it ("2026-11-08T18:00:00.123456+00:00"), in microseconds. The cursor compares at the
 * database's own precision, so a page and the next agree on the order of rows in the same millisecond.
 */
export function microseconds(v: unknown, what = "time"): number {
  const m = typeof v === "string" ? /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:?\d\d)$/.exec(v) : null;
  const base = m ? Date.parse(`${m[1]}${m[3]}`) : NaN;
  const us = base * 1000 + Number((m?.[2] ?? "").padEnd(6, "0"));
  return Number.isSafeInteger(us) ? us : bad(what);
}
/** Microseconds as a UTC timestamp PostgREST reads back exactly. */
export function isoMicroseconds(us: number): string {
  if (!Number.isSafeInteger(us)) bad("cursor");
  const ms = Math.floor(us / 1000);
  return `${new Date(ms).toISOString().slice(0, 19)}.${String(us - Math.floor(ms / 1000) * 1_000_000).padStart(6, "0")}Z`;
}
const ids = (v: unknown, what: string): string => isUuid(v) ? v : bad(what);
const chunks = <T>(list: readonly T[]) => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));

/** One filter on the source: `gt` or `gte` on its anchor column with `value`, or `or` with `value` as the whole filter. */
type Keyset = { op: "gt" | "gte" | "or"; value: string } | null;
/**
 * The rows of one source strictly after the cursor. Earlier kinds at the cursor's time come before it, so they start after
 * that time; later kinds start at it; the cursor's own kind starts after its id at that time.
 */
function keyset(after: NextBookDueCursor | null, kind: NextBookDueKind, column: string, idFilter: (id: string, at: string) => string[]): Keyset {
  if (!after) return null;
  const at = isoMicroseconds(after.anchorUs);
  if (KIND_ORDER[kind] < KIND_ORDER[after.kind]) return { op: "gt", value: at };
  if (KIND_ORDER[kind] > KIND_ORDER[after.kind]) return { op: "gte", value: at };
  return { op: "or", value: [`${column}.gt."${at}"`, ...idFilter(after.id, at)].join(",") };
}
const uuidAfter = (column: string) => (id: string, at: string) => [`and(${column}.eq."${at}",id.gt.${ids(id, "cursor")})`];
function holdAfter(id: string, at: string) {
  const m = /^([0-9a-f-]{36}):(\d{19})$/.exec(id);
  if (!m || !isUuid(m[1])) bad("cursor");
  const audit = String(Number(m[2]));
  return [`and(held_at.eq."${at}",workbook_id.gt.${m[1]})`, `and(held_at.eq."${at}",workbook_id.eq.${m[1]},delivery_audit_id.gt.${audit})`];
}

export function nextBookDueStore(db: SupabaseClient<Database>): NextBookDueReader {
  /** Revision-1 rows (live and held) of these books. */
  async function chainsOf(books: readonly string[], signal?: AbortSignal) {
    const rows: { workbook_id: string; delivery_audit_id: number | null; held_reason: string | null }[] = [];
    for (const part of chunks([...new Set(books)])) {
      let q = db.from("next_book_snapshots").select("workbook_id,delivery_audit_id,held_reason", { count: "exact" })
        .eq("revision", 1).in("workbook_id", part).order("id").limit(RELATED_MAX);
      if (signal) q = q.abortSignal(signal);
      rows.push(...exact(await q, RELATED_MAX, "related_chains"));
    }
    return rows;
  }
  async function claimedBooks(books: readonly string[], signal?: AbortSignal) {
    const out = new Set<string>();
    for (const part of chunks([...new Set(books)])) {
      let q = db.from("workbook_scan_trigger_claims").select("workbook_id", { count: "exact" })
        .in("workbook_id", part).order("workbook_id").limit(RELATED_MAX);
      if (signal) q = q.abortSignal(signal);
      for (const r of exact(await q, RELATED_MAX, "related_claims")) out.add(r.workbook_id);
    }
    return out;
  }
  return {
    async page({ size, after, parents, signal }) {
      if (!Number.isSafeInteger(size) || size < 1 || size > CANDIDATES) bad("size");
      if (parents && parents.length === 0) return { items: [], next: null };
      const only = parents ? [...parents] : null;

      let chainQuery = db.from("next_book_snapshots").select("id,workbook_id,parent_id,child_id,prepare_from", { count: "exact" })
        .eq("revision", 1).is("held_reason", null).is("run_id", null);
      if (only) chainQuery = chainQuery.in("parent_id", only);
      const chainKeyset = keyset(after, "chain", "prepare_from", uuidAfter("prepare_from"));
      if (chainKeyset?.op === "gt") chainQuery = chainQuery.gt("prepare_from", chainKeyset.value);
      else if (chainKeyset?.op === "gte") chainQuery = chainQuery.gte("prepare_from", chainKeyset.value);
      else if (chainKeyset?.op === "or") chainQuery = chainQuery.or(chainKeyset.value);
      chainQuery = chainQuery.order("prepare_from").order("id").limit(size);
      if (signal) chainQuery = chainQuery.abortSignal(signal);
      const chainPage = await chainQuery;
      const chains = exact(chainPage, size, "chains");

      let claimQuery = db.from("workbook_scan_trigger_claims")
        .select("id,workbook_id,parent_id,child_id,claimed_at,next_book_snapshots!left(id)", { count: "exact" })
        .eq("number", 1).is("next_book_snapshots", null);
      if (only) claimQuery = claimQuery.in("parent_id", only);
      const claimKeyset = keyset(after, "claim", "claimed_at", uuidAfter("claimed_at"));
      if (claimKeyset?.op === "gt") claimQuery = claimQuery.gt("claimed_at", claimKeyset.value);
      else if (claimKeyset?.op === "gte") claimQuery = claimQuery.gte("claimed_at", claimKeyset.value);
      else if (claimKeyset?.op === "or") claimQuery = claimQuery.or(claimKeyset.value);
      claimQuery = claimQuery.order("claimed_at").order("id").limit(size);
      if (signal) claimQuery = claimQuery.abortSignal(signal);
      const claimPage = await claimQuery;
      const claims = exact(claimPage, size, "claims");

      let holdQuery = db.from("workbook_scan_backstop_holds")
        .select("workbook_id,parent_id,child_id,delivery_audit_id,held_at,workbook_delivery_receipts!inner(number)", { count: "exact" })
        .eq("workbook_delivery_receipts.number", 1);
      if (only) holdQuery = holdQuery.in("parent_id", only);
      const holdKeyset = keyset(after, "hold", "held_at", holdAfter);
      if (holdKeyset?.op === "gt") holdQuery = holdQuery.gt("held_at", holdKeyset.value);
      else if (holdKeyset?.op === "gte") holdQuery = holdQuery.gte("held_at", holdKeyset.value);
      else if (holdKeyset?.op === "or") holdQuery = holdQuery.or(holdKeyset.value);
      holdQuery = holdQuery.order("held_at").order("workbook_id").order("delivery_audit_id").limit(size);
      if (signal) holdQuery = holdQuery.abortSignal(signal);
      const holdPage = await holdQuery;
      const holds = exact(holdPage, size, "holds");

      if (claims.some(c => Array.isArray(c.next_book_snapshots) && c.next_book_snapshots.length > 0)) bad("claims_filter");
      const keyed = {
        chains: chains.map(c => ({ row: c, key: { anchorUs: microseconds(c.prepare_from, "chain_row"), kind: "chain" as const, id: ids(c.id, "chain_row") } })),
        claims: claims.map(c => ({ row: c, key: { anchorUs: microseconds(c.claimed_at, "claim_row"), kind: "claim" as const, id: ids(c.id, "claim_row") } })),
        holds: holds.map(h => {
          if (!Number.isSafeInteger(h.delivery_audit_id) || h.delivery_audit_id < 1) bad("hold_row");
          return { row: h, key: { anchorUs: microseconds(h.held_at, "hold_row"), kind: "hold" as const, id: holdId(ids(h.workbook_id, "hold_row"), h.delivery_audit_id) } };
        }),
      };
      // Each source that has more rows stops at its last row; the page covers only up to the earliest of those, and the
      // next page starts strictly after it. Every row returned is strictly after the cursor, so the cursor always moves on.
      const stops = [
        chainPage.count! > chains.length ? keyed.chains.at(-1)!.key : null,
        claimPage.count! > claims.length ? keyed.claims.at(-1)!.key : null,
        holdPage.count! > holds.length ? keyed.holds.at(-1)!.key : null,
      ].filter((k): k is NonNullable<typeof k> => k !== null).sort(dueOrder);
      const next: NextBookDueCursor | null = stops[0] ?? null;

      const related = await chainsOf([...claims.map(c => c.workbook_id), ...holds.map(h => h.workbook_id)], signal);
      const live = new Set(related.filter(r => r.held_reason === null).map(r => r.workbook_id));
      const recorded = new Set(related.filter(r => r.held_reason !== null).map(r => `${r.workbook_id}:${r.delivery_audit_id}`));
      const claimed = await claimedBooks(holds.map(h => h.workbook_id), signal);

      const items: NextBookDueItem[] = [];
      for (const { row: c, key } of keyed.chains) {
        items.push({ ...key, workbookId: ids(c.workbook_id, "chain_row"), parentId: ids(c.parent_id, "chain_row"), childId: ids(c.child_id, "chain_row"),
          trigger: { kind: "snapshot", snapshotId: key.id } });
      }
      for (const { row: c, key } of keyed.claims) {
        const workbookId = ids(c.workbook_id, "claim_row");
        if (live.has(workbookId)) continue;
        items.push({ ...key, workbookId, parentId: ids(c.parent_id, "claim_row"), childId: ids(c.child_id, "claim_row"),
          trigger: { kind: "claim", triggerId: key.id } });
      }
      for (const { row: h, key } of keyed.holds) {
        const workbookId = h.workbook_id;
        if (live.has(workbookId) || claimed.has(workbookId) || recorded.has(`${workbookId}:${h.delivery_audit_id}`)) continue;
        items.push({ ...key, workbookId, parentId: ids(h.parent_id, "hold_row"), childId: ids(h.child_id, "hold_row"),
          trigger: { kind: "backstop-hold", workbookId, deliveryAuditId: h.delivery_audit_id } });
      }
      return { items: items.filter(i => next === null || dueOrder(i, next) <= 0).sort(dueOrder), next };
    },
  };
}

/** test_accounts still marks this parent. Throws on a failed read (the step counts it as an error on that item). */
export async function isTestAccount(db: SupabaseClient<Database>, parentId: string, signal?: AbortSignal): Promise<boolean> {
  let q = db.from("test_accounts").select("parent_id").eq("parent_id", parentId);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error("next_book_test_gate_read");
  return data?.parent_id === parentId;
}
