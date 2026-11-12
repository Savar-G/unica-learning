// familyProduction (the family and child pages' Production stages) through a fake PostgREST server: it reads only the
// one family's rows, and gives the same current book as the Production page's reader.
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { buildBooks } from "@/lib/admin-production";
import { familyProduction, listProduction, type AdminSession } from "@/lib/admin-store";
import type { Database } from "@/lib/database";

vi.mock("server-only", () => ({}));

const now = new Date("2026-11-10T20:00:00.000Z");
const days = (n: number) => new Date(+now - n * 86_400_000).toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Row = Record<string, unknown>;

function server(tables: Record<string, Row[]>) {
  const requests: string[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const name = url.pathname.split("/").at(-1)!;
    requests.push(`${name}?${url.searchParams.toString()}`);
    let rows: Row[] = [...(name === "admin_production_runs" ? tables.workbook_runs ?? [] : name === "admin_production_books" ? tables.workbooks ?? []
      : name === "admin_card_setups" ? tables.card_setups ?? [] : tables[name] ?? [])];
    for (const [key, value] of url.searchParams) {
      if (["select", "order", "offset", "limit"].includes(key)) continue;
      if (value.startsWith("eq.")) rows = rows.filter((r) => String(r[key]) === value.slice(3));
      else if (value.startsWith("in.(")) rows = rows.filter((r) => value.slice(4, -1).split(",").map((v) => v.replace(/"/g, "")).includes(String(r[key])));
      else if (value.startsWith("not.in.(")) rows = rows.filter((r) => !value.slice(8, -1).split(",").includes(String(r[key])));
      else if (value === "not.is.null") rows = rows.filter((r) => r[key] != null);
      else throw new Error(`fake server: filter ${key}=${value}`);
    }
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? rows.length);
    const accept = new Headers(init?.headers).get("accept") ?? "";
    const out = rows.slice(offset, offset + limit);
    return Response.json(accept.includes("vnd.pgrst.object") ? out[0] ?? null : out);
  };
  const db = createClient<Database>("https://example.com", "test", { global: { fetch: fetch as typeof globalThis.fetch } });
  return { admin: { db, userId: id(9999), email: "admin@example.com" } as AdminSession, requests };
}

const FAMILY = id(100), OTHER = id(200);
const book = (n: number, parent: string, child: string, o: Row = {}): Row => ({
  id: id(n), parent_id: parent, child_id: child, number: 1, levels: [4], status: "approved", pdf_path: null, profile_build: null,
  created_at: days(3), approved_at: days(2), printed_at: null, shipped_at: null, ...o,
});

describe("familyProduction", () => {
  it("reads only the family's rows and gives the same stages as the Production reader", async () => {
    const tables = {
      workbooks: [book(1, FAMILY, id(101)), book(2, OTHER, id(201), { status: "printed", printed_at: days(1) })],
      card_setups: [
        { id: id(301), child_id: id(102), parent_id: FAMILY, card_saved_at: days(4) },
        { id: id(302), child_id: id(202), parent_id: OTHER, card_saved_at: days(4) },
      ],
    };
    const { admin, requests } = server(tables);
    const mine = await familyProduction(admin, FAMILY, now);
    const tests = { show: true, isTest: () => false };
    const books = buildBooks({ ...mine, tests }, now);
    expect(books.map((b) => [b.childId, b.stage]).sort()).toEqual([[id(101), "approved"], [id(102), "none"]]);
    const sources = requests.filter((r) => r.startsWith("admin_production") || r.startsWith("admin_card_setups") || r.startsWith("child_plan_states"));
    expect(sources.length).toBe(4);
    expect(sources.every((r) => decodeURIComponent(r).includes(`parent_id=in.(${FAMILY})`))).toBe(true);
    const all = buildBooks({ ...(await listProduction(server(tables).admin, { ids: [], show: false }, now)), tests }, now);
    for (const b of books) expect(all.find((x) => x.childId === b.childId)?.stage).toBe(b.stage);
  });

  it("reads nothing for an id that is not a uuid", async () => {
    const { admin, requests } = server({});
    expect(await familyProduction(admin, "not-an-id", now)).toEqual({ runs: [], workbooks: [], cards: [], plans: [], deliveries: [] });
    expect(requests).toEqual([]);
  });
});
