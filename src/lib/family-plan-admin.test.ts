import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { listNextSteps } from "@/lib/admin-store";
vi.mock("server-only", () => ({}));
const card = "11111111-1111-4111-8111-111111111111", child = "22222222-2222-4222-8222-222222222222";
function fixture(state: "open" | "started") {
  const db = createClient<Database>("https://synthetic.invalid", "synthetic", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async input => {
    const u = new URL(String(input)), table = u.pathname.split("/").at(-1);
    if (table === "admin_card_setups") return Response.json([{ id: card, parent_id: "parent", child_id: child, plan: "one", price: 79.99, stripe_customer_id: null, card_saved_at: "2026-11-10", created_at: "2026-11-10", updated_at: "2026-11-10" }]);
    if (table === "plan_starts") {
      if (u.searchParams.has("email_send_status")) return Response.json([]);
      const filter = u.searchParams.get("state");
      if (filter?.startsWith("eq.") && filter !== `eq.${state}` || filter?.startsWith("in.") && !filter.includes(state)) return Response.json([]);
      return Response.json([{ card_setup_id: card, generation: 2, state, monthly_cents: 5999, first_charge_at: state === "started" ? "2026-12-10T18:00:00Z" : null, started_at: new Date().toISOString() }]);
    }
    if (table === "child_plan_states") return Response.json([{ child_id: child, kind: "free_month", monthly_cents: state === "open" ? 7999 : 5999, next_charge_at: state === "open" ? "2026-01-01T18:00:00Z" : "2026-12-24T18:00:00Z" }]);
    return Response.json([]);
  } } });
  return { db, userId: "admin", email: "admin@example.invalid" };
}
it("shows an uncertain start's admitted sibling amount without an old plan's charge date", async () => {
  const result = await listNextSteps(fixture("open"));
  expect(result.cards.rows[0]).toMatchObject({ planMonthly: 59.99, planFirstCharge: null });
});
it("keeps the selected child's confirmed pause date beside its actual sibling price", async () => {
  const result = await listNextSteps(fixture("started"));
  expect(result.cards.rows[0]).toMatchObject({ planMonthly: 59.99, planFirstCharge: "2026-12-24T18:00:00Z" });
});
