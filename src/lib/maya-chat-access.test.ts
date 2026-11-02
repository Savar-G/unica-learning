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
import { chatAccess } from "@/lib/maya-chat-server";
const db = (test = false) => createClient<Database>("https://test.invalid", "test", { global: { fetch: async (input) => {
  const url = new URL(String(input));
  if (url.pathname.endsWith("test_accounts")) return Response.json(test ? { parent_id: "parent" } : null);
  if (url.pathname.endsWith("family_retention_cards")) return Response.json([{ customer: "cus_family", saved: true }]);
  throw Error(url.pathname);
} } });
afterEach(() => { vi.unstubAllEnvs(); state.statuses = []; state.fail = false; state.customers = []; state.wrongCustomer = false; });
describe("server chat plan access", () => {
  it("hides chat by default before reading Stripe", async () => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "");
    expect(await chatAccess(db(), "parent")).toBe(false); expect(state.customers).toEqual([]);
  });
  it("lets a marked test family use the fake path with the release switch off", async () => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "");
    expect(await chatAccess(db(true), "parent")).toBe(true); expect(state.customers).toEqual([]);
  });
  it.each(["active", "trialing"])("permits a family's %s plan when enabled", async (status) => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "on"); state.statuses = [status];
    expect(await chatAccess(db(), "parent")).toBe(true); expect(state.customers).toEqual(["cus_family"]);
  });
  it.each(["canceled", "past_due", "unpaid", "paused", "incomplete"])("refuses a %s plan", async (status) => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "on"); state.statuses = [status];
    expect(await chatAccess(db(), "parent")).toBe(false);
  });
  it("fails closed when the provider is unavailable or returns another customer", async () => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "on"); state.fail = true;
    await expect(chatAccess(db(), "parent")).rejects.toThrow();
    state.fail = false; state.statuses = ["active"]; state.wrongCustomer = true;
    await expect(chatAccess(db(), "parent")).rejects.toThrow("scope changed");
  });
});
