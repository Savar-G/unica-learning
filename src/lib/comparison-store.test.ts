import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { comparisonFor } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { loadComparisonInput } from "@/lib/comparison-store";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());
const placement = takeTest({ grade: 4, province: "BC" }, 101, knowsUpTo(4)).placement;
const rows = Array.from({ length: 1207 }, (_, i) => ({
  id: String(i).padStart(6, "0"), child_id: `child-${i}`, status: "completed", completed_at: "2026-10-10T12:00:00Z",
  placement, parent: { email: "parent@family.ca" },
}));

describe("server comparison source", () => {
  it("reads the exact full ID set despite a 73-row response cap, without using a grade prefilter", async () => {
    const requests: URL[] = [];
    const db = createClient("https://fixture.invalid", "synthetic-key", { global: { fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      const cursor = url.searchParams.get("id")?.slice(3);
      const page = rows.filter((r) => !cursor || r.id > cursor).slice(0, 73);
      return new Response(JSON.stringify(page), { headers: { "content-type": "application/json", "content-range": `0-${page.length - 1}/${rows.length}` } });
    } }, auth: { persistSession: false } });
    const input = await loadComparisonInput(db, "000000");
    expect(input.tests.map((t) => t.id)).toEqual(rows.map((r) => r.id));
    expect(new Set(input.tests.map((t) => t.id)).size).toBe(1207);
    expect(requests).toHaveLength(18);
    expect(requests.every((r) => r.searchParams.get("status") === "eq.completed" && r.searchParams.get("order") === "id.asc" && !r.searchParams.has("grade"))).toBe(true);
    expect(new Set(requests.map((r) => r.searchParams.get("completed_at"))).size).toBe(1);
    expect(comparisonFor(input)).toEqual({ stage: "percentile", n: 1207, percentile: 50 });
  });

  it("selects the latest child across capped pages before filtering, at 399 and 400 eligible children", async () => {
    const dataset = rows.map((r, i) => ({ ...r, parent: { email: i < 400 ? "parent@family.ca" : "qa@example.com" } }));
    dataset[1206] = { ...dataset[1206], child_id: "child-0", completed_at: "2026-10-11T12:00:00Z", placement: { ...placement, grade: 5 } };
    const db = createClient("https://fixture.invalid", "synthetic-key", { global: { fetch: async (input) => {
      const cursor = new URL(String(input)).searchParams.get("id")?.slice(3);
      const page = dataset.filter((r) => !cursor || r.id > cursor).slice(0, 73);
      return new Response(JSON.stringify(page), { headers: { "content-type": "application/json", "content-range": `0-${page.length - 1}/${dataset.length}` } });
    } }, auth: { persistSession: false } });
    expect(comparisonFor(await loadComparisonInput(db, "000001"))).toEqual({ stage: "bands", n: 399, band: "middle" });
    dataset[400].parent.email = "new@family.ca";
    expect(comparisonFor(await loadComparisonInput(db, "000001"))).toEqual({ stage: "percentile", n: 400, percentile: 50 });
  });

  it("keeps the configurable named list on the server and applies it to the same cohort", async () => {
    vi.stubEnv("ASSESSMENT_COMPARISON_EXCLUDED_EMAILS", " parent@family.ca, OTHER@FAMILY.CA ");
    const db = createClient("https://fixture.invalid", "synthetic-key", { global: { fetch: async (input) => {
      const cursor = new URL(String(input)).searchParams.get("id");
      return new Response(JSON.stringify(cursor ? [] : rows.slice(0, 400)), { headers: { "content-type": "application/json", "content-range": "0-399/400" } });
    } }, auth: { persistSession: false } });
    const input = await loadComparisonInput(db, "000000");
    expect(input.excludedEmails).toEqual(["parent@family.ca", "OTHER@FAMILY.CA"]);
    expect(comparisonFor(input)).toEqual({ stage: "scale", n: 0 });
  });

  it.each(["page error", "missing count", "changed count", "no advance", "missing parent"])("rejects %s rather than returning an incomplete cohort", async (failure) => {
    let calls = 0;
    const db = createClient("https://fixture.invalid", "synthetic-key", { global: { fetch: async () => {
      calls++;
      if (failure === "page error" && calls === 2) return new Response(JSON.stringify({ message: "synthetic page failure" }), { status: 500 });
      const page = calls === 1 || failure === "no advance" ? [failure === "missing parent" ? { ...rows[0], parent: null } : rows[0]] : [];
      return new Response(JSON.stringify(page), { headers: { "content-type": "application/json", ...(failure === "missing count" ? {} : { "content-range": `0-0/${failure === "changed count" ? 2 : 1}` }) } });
    } }, auth: { persistSession: false } });
    await expect(loadComparisonInput(db, "000000")).rejects.toThrow(/comparison source:/);
  });
});
