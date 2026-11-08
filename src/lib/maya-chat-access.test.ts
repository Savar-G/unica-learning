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
import { chatAccess, chatGate, parentChatChildren } from "@/lib/maya-chat-server";

type Row = Record<string, unknown>;
/** PostgREST in memory: eq filters, one object for maybeSingle, and a failure for a table named in `broken`. */
const planRow = (child_id: string, kind: string, ends_at: string | null = null) => ({ parent_id: "parent", child_id, kind, next_charge_at: kind === "free_month" ? "2099-01-01T00:00:00Z" : null, ends_at, monthly_cents: 7999, ending_free: false });
const db = ({ test = false, listed = false, broken = "", plans = [] as Row[] } = {}) => {
  const tables: Record<string, Row[]> = {
    child_plan_states: plans,
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
    if (table === "child_plan_states") return Response.json(rows);
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

describe("a child's open plan (src/lib/plan-access.ts)", () => {
  const plans = [planRow("open", "paying"), planRow("stopped", "ended")];

  it.each([undefined, "", "on"])("opens that child with no list row, with no Stripe read, with the switch at %j", async (value) => {
    if (value !== undefined) vi.stubEnv("MAYA_CHAT_ENABLED", value);
    expect(await chatAccess(db({ plans }), "parent", "open")).toBe(true);
    expect(state.customers).toEqual([]);
  });

  it("does not open a sibling", async () => {
    expect(await chatAccess(db({ plans }), "parent", "stopped")).toBe(false);
    expect(await chatAccess(db({ plans }), "parent", "no-row")).toBe(false);
    expect(state.customers).toEqual([]);
  });

  it("MAYA_CHAT_ENABLED=off stops a plan child and a listed family, and not a test family, as before", async () => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "off");
    expect(await chatAccess(db({ plans }), "parent", "open")).toBe(false);
    expect(await chatAccess(db({ plans, listed: true }), "parent", "open")).toBe(false);
    expect(await chatAccess(db({ test: true }), "parent", "open")).toBe(true);
    expect(state.customers).toEqual([]);
  });

  it("keeps the Grade 3 rule", async () => {
    expect(await chatGate(db({ plans }), "parent", 2, "open")).toBe("too_young");
    expect(await chatGate(db({ plans }), "parent", 3, "open")).toBe("open");
    expect(await chatGate(db({ plans }), "parent", 5, "stopped")).toBe("closed");
  });

  it.each(["not_started", "ended", "payment_failed", "paused"])("a %s plan stays closed", async (kind) => {
    expect(await chatGate(db({ plans: [planRow("open", kind)] }), "parent", 5, "open")).toBe("closed");
  });

  it("an ending plan stays open until its end date", async () => {
    expect(await chatAccess(db({ plans: [planRow("open", "ending", "2099-01-01T00:00:00Z")] }), "parent", "open")).toBe(true);
    expect(await chatAccess(db({ plans: [planRow("open", "ending", "2000-01-01T00:00:00Z")] }), "parent", "open")).toBe(false);
  });

  it("a failed plan read is closed", async () => {
    expect(await chatAccess(db({ plans, broken: "child_plan_states" }), "parent", "open")).toBe(false);
  });

  it("a listed family with a running plan keeps every child, reading Stripe once for the family", async () => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "on"); state.statuses = ["active"];
    const kids = [{ id: "a", grade: 4 }, { id: "b", grade: 5 }, { id: "young", grade: 2 }];
    expect([...await parentChatChildren(db({ listed: true }), "parent", kids)]).toEqual(["a", "b"]);
    expect(state.customers).toEqual(["cus_family"]);
  });

  it("Parent home names only the open child of the right grade", async () => {
    const kids = [{ id: "open", grade: 4 }, { id: "stopped", grade: 5 }, { id: "young", grade: 2 }];
    expect([...await parentChatChildren(db({ plans: [...plans, planRow("young", "paying")] }), "parent", kids)]).toEqual(["open"]);
    expect((await parentChatChildren(db(), "parent", kids)).size).toBe(0);
  });
});
