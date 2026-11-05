import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ statuses: [] as string[], fail: false, customers: [] as string[], wrongCustomer: false }));
vi.mock("@/lib/stripe", () => ({ stripe: () => ({ subscriptions: { list: ({ customer }: { customer: string }) => (async function* () {
  state.customers.push(customer);
  if (state.fail) throw Error("Stripe unavailable");
  for (const status of state.statuses) yield { status, customer: state.wrongCustomer ? "someone-else" : customer };
})() } }) }));
import { chatAccess, chatGate } from "@/lib/maya-chat-server";

type Row = Record<string, unknown>;
/** PostgREST in memory: eq filters, one object for maybeSingle, and a failure for a table named in `broken`. */
const db = ({ test = false, listed = false, broken = "" } = {}) => {
  const tables: Record<string, Row[]> = {
    test_accounts: test ? [{ parent_id: "parent" }] : [],
    maya_chat_families: listed ? [{ parent_id: "parent", rehearsal: false }] : [],
  };
  return createClient<Database>("https://test.invalid", "test", { global: { fetch: async (input) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop()!;
    if (table === broken) return Response.json({ message: "read failed" }, { status: 500 });
    if (table === "family_retention_cards") return Response.json([{ customer: "cus_family", saved: true }]);
    if (!(table in tables)) throw Error(url.pathname);
    let rows = tables[table];
    for (const [key, raw] of url.searchParams) if (raw.startsWith("eq.")) rows = rows.filter((r) => String(r[key]) === raw.slice(3));
    return Response.json(rows[0] ?? null);
  } } });
};
afterEach(() => { vi.unstubAllEnvs(); state.statuses = []; state.fail = false; state.customers = []; state.wrongCustomer = false; });
describe("server chat plan access", () => {
  it("hides chat by default before reading Stripe", async () => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "");
    expect(await chatAccess(db({ listed: true }), "parent")).toBe(false); expect(state.customers).toEqual([]);
  });
  it("lets a marked test family use the fake path with the release switch off", async () => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "");
    expect(await chatAccess(db({ test: true }), "parent")).toBe(true); expect(state.customers).toEqual([]);
  });
  it.each(["active", "trialing"])("permits a listed family's %s plan when enabled", async (status) => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "on"); state.statuses = [status];
    expect(await chatAccess(db({ listed: true }), "parent")).toBe(true); expect(state.customers).toEqual(["cus_family"]);
  });
  it.each(["canceled", "past_due", "unpaid", "paused", "incomplete"])("refuses a listed family's %s plan", async (status) => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "on"); state.statuses = [status];
    expect(await chatAccess(db({ listed: true }), "parent")).toBe(false);
  });
  it("fails closed when the provider is unavailable or returns another customer", async () => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "on"); state.fail = true;
    await expect(chatAccess(db({ listed: true }), "parent")).rejects.toThrow();
    state.fail = false; state.statuses = ["active"]; state.wrongCustomer = true;
    await expect(chatAccess(db({ listed: true }), "parent")).rejects.toThrow("scope changed");
  });
});

describe("one family at a time, Grade 3 and up (#530)", () => {
  it("refuses a paying family that is not on the list, with the switch on, before Stripe is read", async () => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "on"); state.statuses = ["active"];
    expect(await chatAccess(db(), "parent")).toBe(false);
    expect(await chatGate(db(), "parent", 5)).toBe("closed");
    expect(state.customers).toEqual([]);
  });
  it("reads the list for this family only", async () => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "on"); state.statuses = ["active"];
    expect(await chatAccess(db({ listed: true }), "another-parent")).toBe(false);
  });
  it("fails closed when the list cannot be read", async () => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "on"); state.statuses = ["active"];
    await expect(chatAccess(db({ listed: true, broken: "maya_chat_families" }), "parent")).rejects.toThrow();
  });
  it.each([0, 1, 2])("refuses Grade %s for a listed paying family and for a test family", async (grade) => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "on"); state.statuses = ["active"];
    expect(await chatGate(db({ listed: true }), "parent", grade)).toBe("too_young");
    expect(await chatGate(db({ test: true }), "parent", grade)).toBe("too_young");
  });
  it.each([3, 8, 9])("opens Grade %s for a listed paying family", async (grade) => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "on"); state.statuses = ["active"];
    expect(await chatGate(db({ listed: true }), "parent", grade)).toBe("open");
  });
  it("keeps the plan check: a listed family without a running plan is closed at any grade", async () => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "on"); state.statuses = ["canceled"];
    expect(await chatGate(db({ listed: true }), "parent", 5)).toBe("closed");
  });
});
