import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { Database } from "./database";
import type { NextBookDueCursor } from "./next-book-step";
import { isoMicroseconds, microseconds, nextBookDueStore } from "./next-book-step-store";

// #476: the Supabase due reader against a fixture PostgREST. It only reads, it asks for book 1 and the selection's
// filters, and any error or answer shorter than its own count throws, so the step writes nothing that run.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Answer = { rows: unknown[]; total?: number; status?: number };

function fixture(answers: Record<string, Answer | ((url: URL) => Answer)>) {
  const requests: URL[] = [];
  const db = createClient<Database>("https://fixture.invalid", "synthetic-key", {
    auth: { persistSession: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      requests.push(url);
      expect(init?.method ?? "GET").toBe("GET");
      const table = url.pathname.split("/").pop()!;
      const entry = answers[table];
      const a = typeof entry === "function" ? entry(url) : entry ?? { rows: [] };
      if (a.status) return Response.json({ message: "synthetic failure" }, { status: a.status });
      const total = a.total ?? a.rows.length;
      return Response.json(a.rows, { headers: { "content-range": a.rows.length ? `0-${a.rows.length - 1}/${total}` : `*/${total}` } });
    } },
  });
  return { db, requests, reader: nextBookDueStore(db) };
}

const chain = { id: id(1), workbook_id: id(4), parent_id: id(2), child_id: id(3), prepare_from: "2026-11-08T18:05:00.000Z" };
const claimA = { id: id(10), workbook_id: id(11), parent_id: id(12), child_id: id(13), claimed_at: "2026-11-08T18:00:00.000Z", next_book_snapshots: [] };
/** Its book got an admin chain before the claim: not due. */
const claimB = { id: id(20), workbook_id: id(21), parent_id: id(22), child_id: id(23), claimed_at: "2026-11-08T17:00:00.000Z", next_book_snapshots: [] };
const holdA = { workbook_id: id(31), parent_id: id(32), child_id: id(33), delivery_audit_id: 5, held_at: "2026-11-08T18:10:00.000Z", workbook_delivery_receipts: { number: 1 } };
/** Already recorded: not due. */
const holdB = { workbook_id: id(41), parent_id: id(42), child_id: id(43), delivery_audit_id: 6, held_at: "2026-11-08T18:20:00.000Z", workbook_delivery_receipts: { number: 1 } };

const healthy = () => ({
  next_book_snapshots: (url: URL) => url.searchParams.has("workbook_id")
    ? { rows: [{ workbook_id: id(21), delivery_audit_id: null, held_reason: null }, { workbook_id: id(41), delivery_audit_id: 6, held_reason: "no-accepted-scans-at-backstop" }] }
    : { rows: [chain] },
  workbook_scan_trigger_claims: (url: URL) => url.searchParams.has("workbook_id") ? { rows: [] } : { rows: [claimA, claimB] },
  workbook_scan_backstop_holds: { rows: [holdA, holdB] },
});
const page = (reader: ReturnType<typeof fixture>["reader"], after: NextBookDueCursor | null = null, parents: string[] | null = null, size = 20) =>
  reader.page({ size, after, parents });
const us = (iso: string) => Date.parse(iso) * 1000;

describe("nextBookDueStore", () => {
  it("builds the due list from chains, claims and holds, oldest first, with the selection's filters", async () => {
    const f = fixture(healthy());
    const due = await page(f.reader);
    expect(due.next).toBeNull();
    expect(due.items.map(d => [d.kind, d.trigger])).toEqual([
      ["claim", { kind: "claim", triggerId: id(10) }],
      ["chain", { kind: "snapshot", snapshotId: id(1) }],
      ["hold", { kind: "backstop-hold", workbookId: id(31), deliveryAuditId: 5 }],
    ]);
    const [chains, claims, holds] = f.requests;
    expect(Object.fromEntries(chains.searchParams)).toMatchObject({ revision: "eq.1", held_reason: "is.null", run_id: "is.null", order: "prepare_from.asc,id.asc", limit: "20" });
    expect(Object.fromEntries(claims.searchParams)).toMatchObject({ number: "eq.1", next_book_snapshots: "is.null", order: "claimed_at.asc,id.asc" });
    expect(claims.searchParams.get("select")).toContain("next_book_snapshots!left(id)");
    expect(Object.fromEntries(holds.searchParams)).toMatchObject({ "workbook_delivery_receipts.number": "eq.1", order: "held_at.asc,workbook_id.asc,delivery_audit_id.asc" });
    expect(f.requests.some(r => r.searchParams.has("parent_id"))).toBe(false);
  });

  it("limits every candidate read to the released parents before the limit", async () => {
    const f = fixture(healthy());
    await page(f.reader, null, [id(2), id(12)]);
    for (const r of f.requests.slice(0, 3)) expect(r.searchParams.get("parent_id")).toBe(`in.(${id(2)},${id(12)})`);
    expect(await page(fixture(healthy()).reader, null, [])).toEqual({ items: [], next: null });
  });

  it("pages strictly after a keyset cursor and returns only the items up to the earliest source that has more", async () => {
    // Claims have more rows than the page holds, up to 18:00; the chain at 18:05 and the hold at 18:10 wait for the next page.
    const f = fixture({ ...healthy(), workbook_scan_trigger_claims: (url: URL) => url.searchParams.has("workbook_id") ? { rows: [] } : { rows: [claimB, claimA], total: 40 } });
    const cursor: NextBookDueCursor = { anchorUs: us("2026-11-08T16:00:00.000Z") + 250, kind: "claim", id: id(5) };
    const first = await page(f.reader, cursor, null, 2);
    expect(first.next).toEqual({ anchorUs: us(claimA.claimed_at), kind: "claim", id: id(10) });
    expect(first.items.map(i => i.id)).toEqual([id(10)]);
    const [chains, claims, holds] = f.requests;
    const at = "2026-11-08T16:00:00.000250Z";
    // An earlier kind at the cursor's time came before it; a later kind starts at it; the same kind starts after its id.
    expect(chains.searchParams.get("prepare_from")).toBe(`gt.${at}`);
    expect(claims.searchParams.get("or")).toBe(`(claimed_at.gt."${at}",and(claimed_at.eq."${at}",id.gt.${id(5)}))`);
    expect(holds.searchParams.get("held_at")).toBe(`gte.${at}`);
  });

  it("moves through equal times on holds by book and delivery audit", async () => {
    const f = fixture(healthy());
    const at = "2026-11-08T18:10:00.000000Z";
    await page(f.reader, { anchorUs: us("2026-11-08T18:10:00.000Z"), kind: "hold", id: `${id(31)}:${"5".padStart(19, "0")}` });
    const [chains, claims, holds] = f.requests;
    expect(chains.searchParams.get("prepare_from")).toBe(`gt.${at}`);
    expect(claims.searchParams.get("claimed_at")).toBe(`gt.${at}`);
    expect(holds.searchParams.get("or")).toBe(`(held_at.gt."${at}",and(held_at.eq."${at}",workbook_id.gt.${id(31)}),`
      + `and(held_at.eq."${at}",workbook_id.eq.${id(31)},delivery_audit_id.gt.5))`);
  });

  it("keeps the database's microseconds in the cursor", () => {
    expect(microseconds("2026-11-08T18:00:00.123456+00:00")).toBe(us("2026-11-08T18:00:00.123Z") + 456);
    expect(microseconds("2026-11-08T10:00:00-08:00")).toBe(us("2026-11-08T18:00:00.000Z"));
    expect(isoMicroseconds(us("2026-11-08T18:00:00.123Z") + 456)).toBe("2026-11-08T18:00:00.123456Z");
    expect(() => microseconds("2026-11-08 18:00")).toThrow();
  });

  it("throws on an answer shorter than its count, on a failed read and on a malformed row", async () => {
    await expect(page(fixture({ ...healthy(), next_book_snapshots: { rows: [chain], total: 3 } }).reader))
      .rejects.toThrow("next_book_due_chains");
    await expect(page(fixture({ ...healthy(), workbook_scan_backstop_holds: { rows: [], status: 500 } }).reader))
      .rejects.toThrow("next_book_due_holds");
    await expect(page(fixture({ ...healthy(), workbook_scan_trigger_claims: { rows: [{ ...claimA, claimed_at: "not a time" }] } }).reader))
      .rejects.toThrow();
    await expect(page(fixture({ ...healthy(), workbook_scan_trigger_claims: { rows: [{ ...claimA, next_book_snapshots: [{ id: id(99) }] }] } }).reader))
      .rejects.toThrow("next_book_due_claims_filter");
  });
});
