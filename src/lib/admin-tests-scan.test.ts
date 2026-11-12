// The tests list with a filter that runs in code (help likely, flagged, low AI): it checks at most TEST_SCAN_PAGES database
// pages, newest first, and says when older tests were left unchecked, through a fake PostgREST server.
import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { LIST_MAX, TEST_SCAN_PAGES, listTests, type AdminSession } from "@/lib/admin-store";
import { parseFilters } from "@/lib/admin-view";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** `total` tests, newest first; the test at each index in `low` has a low-confidence AI review. */
function server(total: number, low: number[] = []) {
  const pages: number[] = [];
  const test = (i: number) => ({
    id: id(i), created_at: "2026-11-01T00:00:00.000Z", status: "completed", grade: 3, province: "bc", child_id: id(900_000), parent_id: id(800_000),
    started_at: "2026-11-01T00:00:00.000Z", completed_at: null, last_answer_at: null, route: null, stage3_route: null, help: null, placement: null,
    answers: [{ count: 0 }], work_reviews: low.includes(i) ? [{ confidence: "low" }] : [],
  });
  const fetch = async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const name = url.pathname.split("/").at(-1);
    if (name !== "admin_assessments") return Response.json([]);
    const offset = Number(url.searchParams.get("offset") ?? 0), limit = Number(url.searchParams.get("limit") ?? total);
    pages.push(offset);
    return Response.json(Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, k) => test(offset + k)));
  };
  const db = createClient<Database>("https://example.com", "test", { global: { fetch: fetch as typeof globalThis.fetch } });
  return { admin: { db, userId: id(9999), email: "admin@example.com" } as AdminSession, pages };
}

const lowAi = parseFilters({ ai: "low" });

it("stops after TEST_SCAN_PAGES pages and says the list was cut", async () => {
  const total = TEST_SCAN_PAGES * LIST_MAX + 700;
  const s = server(total, [3, total - 1]);
  const result = await listTests(s.admin, lowAi);
  expect(s.pages).toHaveLength(TEST_SCAN_PAGES);
  expect(result).toMatchObject({ more: false, cut: true });
  // the match inside the checked pages is listed; the one past the cap is not
  expect(result.rows.map((r) => r.id)).toEqual([id(3)]);
});

it("reads every page, with no cut, when the tests end before the cap", async () => {
  const total = (TEST_SCAN_PAGES - 1) * LIST_MAX + 10;
  const s = server(total, [3, total - 1]);
  const result = await listTests(s.admin, lowAi);
  expect(s.pages).toHaveLength(TEST_SCAN_PAGES);
  expect(result).toMatchObject({ more: false, cut: false });
  expect(result.rows.map((r) => r.id)).toEqual([id(3), id(total - 1)]);
});

it("never cuts a list with no filter that runs in code", async () => {
  const s = server(TEST_SCAN_PAGES * LIST_MAX + 700);
  const result = await listTests(s.admin, parseFilters({}));
  expect(s.pages).toEqual([0]);
  expect(result).toMatchObject({ more: true, cut: false });
  expect(result.rows).toHaveLength(LIST_MAX);
});
