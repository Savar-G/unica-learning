import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { customerFilters, loadCustomerActivity, parseCustomerChildren, parseCustomerMetrics } from "@/lib/customer-activity-server";
vi.mock("server-only", () => ({}));
const now = Date.parse("2026-11-16T12:00:00Z"), id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("validates the complete date interval and resets malformed reference and cursor filters", () => {
  expect(customerFilters({ from: "2026-11-01", to: "2026-11-16", family: id, attention: "team" }, now)).toMatchObject({ parent: id, from: "2026-11-01", attention: "team" });
  for (const q of [{ from: "2026-02-30" }, { from: "2026-11-16", to: "2026-11-16" }, { from: "2020-01-01" }, { actor: "fake" }, { book: "secret" }, { after: "timestamp-only" }]) expect(() => customerFilters(q, now)).toThrow();
});
it("fails closed on malformed aggregate and child data instead of turning them into zero", () => {
  expect(() => parseCustomerMetrics({ families: 0 })).toThrow();
  expect(() => parseCustomerChildren([{}])).toThrow();
});
it("passes each scope and stable cursor to SQL and preserves independent partial failures", async () => {
  const requests: { name: string; body: Record<string, unknown> }[] = [];
  const db = createClient<Database>("https://synthetic.supabase.co", "fake", { global: { fetch: async (input, init) => {
    const name = String(input).split("/").at(-1)!;
    requests.push({ name, body: JSON.parse(String(init?.body)) });
    if (name === "admin_customer_children") return Response.json({ message: "synthetic error" }, { status: 500 });
    return Response.json(name === "admin_customer_history" ? [] : {});
  } }, db: { retry: false } });
  const f = customerFilters({ family: id, child: id, book: id, after: `2026-11-16T10:00:00Z|scan:${id}`, attention: "team", type: "scan" }, now);
  const data = await loadCustomerActivity({ db, userId: id, email: "synthetic@example.invalid" }, f, false);
  expect(requests).toHaveLength(3);
  expect(requests.find(r => r.name === "admin_customer_history")?.body).toMatchObject({ p_parent: id, p_child: id, p_book: id, p_after_at: "2026-11-16T10:00:00Z", p_after_key: `scan:${id}`, p_tests: false, p_type: "scan" });
  expect(requests.find(r => r.name === "admin_customer_children")?.body).toMatchObject({ p_attention: "team", p_parent: id, p_child: id });
  expect(data.history).toEqual({ data: [], error: false });
  expect(data.children).toEqual({ data: null, error: true });
  expect(data.metrics).toEqual({ data: null, error: true });
});
