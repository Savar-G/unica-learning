import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({ db: null as ReturnType<typeof createClient> | null }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => f.db }));
import { loadFamilyPlanOffer } from "@/lib/family-plan-offer-server";

it.each(["new", "open", "ended"] as const)("loads the %s family offer for the owned child before a card exists", async window => {
  f.db = createClient("https://fixture.invalid", "synthetic", { global: { fetch: async (input, init) => {
    expect(new URL(String(input)).pathname).toBe("/rest/v1/rpc/family_plan_offer");
    expect(JSON.parse(String(init?.body))).toEqual({ p_parent: "parent", p_child: "child", p_agreed_cents: 7999 });
    return Response.json({ monthly_cents: 5999, window });
  } } });
  expect(await loadFamilyPlanOffer("parent", "child")).toEqual({ monthly: 59.99, window });
});

it.each([null, { monthly_cents: 5999, window: "unknown" }, { monthly_cents: 0, window: "new" }, { monthly_cents: 5999, window: "bad" }])("keeps unreadable or uncertain terms unavailable: %j", async answer => {
  f.db = createClient("https://fixture.invalid", "synthetic", { global: { fetch: async () => Response.json(answer) } });
  expect(await loadFamilyPlanOffer("parent", "child")).toBeNull();
});

it("keeps a failed database read unavailable", async () => {
  f.db = createClient("https://fixture.invalid", "synthetic", { global: { fetch: async () => Response.json({ message: "Synthetic failure" }, { status: 403 }) } });
  expect(await loadFamilyPlanOffer("parent", "child")).toBeNull();
  f.db = null;
  expect(await loadFamilyPlanOffer("parent", "child")).toBeNull();
});
