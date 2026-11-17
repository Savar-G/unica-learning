import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { childInactivity, customerFilters, loadCustomerActivity, parseCustomerChildren, parseCustomerMetrics } from "@/lib/customer-activity-server";
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

it("normalizes the exact All selections submitted by the filter form", () => {
  expect(customerFilters({ family: "", child: "", book: "", childrenAfter: "", booksBefore: "", attention: "" }, now)).toMatchObject({ parent: null, child: null, book: null, childrenAfter: null, booksBefore: null });
});
const childRow = (n: number, anchor: string | null) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, parent_id: id, first_name: "Child", family_name: "Family", test: false, time_zone: "America/Vancouver", postal: null, province: "BC", last_work: anchor, last_visit: null, plan: null, assessment: null, inactivity: anchor ? { workbook_id: id, delivered_at: anchor, anchor_at: anchor } : null, books: [], maya: { sessions: 0, seconds: null, unknownDuration: 0, ended: 0, withWork: 0, solved: 0, technical: 0, noOutcome: 0 } });
it("does not flag a finished or unsupported book when canonical identity is absent", () => {
  const child = parseCustomerChildren([childRow(2, null)])[0];
  expect(childInactivity(child, now).state).toBe("unknown");
});
it("selects inactive children after more than 25 recent candidates before the display limit", async () => {
  const recent = Array.from({ length: 26 }, (_, n) => childRow(n + 10, "2026-11-16T00:00:00Z"));
  const old = childRow(50, "2026-11-01T00:00:00Z");
  const positions: unknown[] = [];
  const db = createClient<Database>("https://synthetic.supabase.co", "fake", { global: { fetch: async (input, init) => {
    const name = String(input).split("/").at(-1);
    if (name !== "admin_customer_children") return Response.json(name === "admin_customer_history" ? [] : {});
    const body = JSON.parse(String(init?.body)); positions.push(body.p_after);
    expect(body.p_attention).toBe("inactive");
    return Response.json(body.p_after ? [old] : recent);
  } }, db: { retry: false } });
  const data = await loadCustomerActivity({ db, userId: id, email: "test@example.invalid" }, customerFilters({ attention: "inactive" }, now), false, now);
  expect(data.children.error).toBe(false); expect(data.children.data?.map(c => c.id)).toEqual([old.id]);
  expect(positions).toEqual([null, recent.at(-1)!.id]);
});
