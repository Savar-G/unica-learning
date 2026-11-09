import { createClient } from "@supabase/supabase-js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
import { listNextSteps, getParent } from "@/lib/admin-store";
import { CardsTable } from "@/components/admin-records";

const parent = "11111111-1111-4111-8111-111111111111";
const time = "2026-11-08T20:00:00Z";
beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-08T21:00:00Z")));
afterEach(() => vi.restoreAllMocks());
function admin(starts: { card_setup_id: string; state: string; generation: number; started_at: string }[], failRead = false) {
  const cards = ["new", "started", "other", "refused", "open", "stuck", "old-start"].map((id) => ({
    id, parent_id: parent, child_id: `child-${id}`, created_at: time, updated_at: time, report_id: null,
    plan: "one", price: 79.99, stripe_customer_id: `cus_${id}`, card_saved_at: time,
  }));
  const db = createClient<Database>("https://fixture.invalid", "synthetic", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      const name = url.pathname.split("/").at(-1);
      if (name === "admin_card_setups") return Response.json(cards);
      if (name === "admin_parents") {
        const row = { id: parent, name: "Parent", email: "parent@example.invalid" };
        return Response.json(new Headers(init?.headers).get("accept") === "application/vnd.pgrst.object+json" ? row : [row]);
      }
      if (name === "admin_children") return Response.json(cards.map((c) => ({ id: c.child_id, parent_id: parent, first_name: c.id })));
      if (name === "plan_starts") {
        if (failRead) return Response.json({ code: "XX000", message: "Start read failed" }, { status: 500 });
        if (url.searchParams.has("email_send_status")) return Response.json([]);
        const filter = url.searchParams.get("state");
        return Response.json(starts.filter((s) => !filter || filter === `eq.${s.state}` || filter.startsWith("in.") && filter.includes(s.state)));
      }
      if (["admin_waitlist_joins", "workbook_emails", "admin_assessments", "email_log", "admin_emails", "admin_tests"].includes(name ?? "")) return Response.json([]);
      throw Error(`Unexpected read: ${url.pathname}`);
    } },
  });
  return { db, userId: "admin", email: "admin@example.invalid" };
}
const starts = [
  { card_setup_id: "started", state: "started", generation: 1, started_at: time },
  { card_setup_id: "other", state: "other", generation: 1, started_at: time },
  { card_setup_id: "refused", state: "refused", generation: 1, started_at: time },
  { card_setup_id: "open", state: "open", generation: 1, started_at: time },
  { card_setup_id: "stuck", state: "open", generation: 1, started_at: "2026-10-01T00:00:00Z" },
  { card_setup_id: "old-start", state: "started", generation: 1, started_at: time },
  { card_setup_id: "old-start", state: "refused", generation: 2, started_at: time },
];
it.each(["next steps", "parent detail"])("%s reload shows a started state for any completed start, with no new free month button", async (page) => {
  const a = admin(starts);
  const cards = page === "next steps" ? (await listNextSteps(a)).cards.rows : (await getParent(a, parent))!.cards;
  const html = (id: string) => renderToStaticMarkup(createElement(CardsTable, { cards: cards.filter((c) => c.id === id) }));
  for (const id of ["started", "other", "old-start"]) {
    expect(html(id)).toContain("Plan started.");
    expect(html(id)).not.toContain("Workbook delivered: start free month");
  }
  for (const id of ["new", "refused", "open"]) expect(html(id)).toContain("Workbook delivered: start free month");
  expect(html("stuck")).toContain("Stripe did not answer");
  expect(html("stuck")).not.toContain("Workbook delivered: start free month");
});
it("does not offer a new start when the plan start read fails", async () => {
  await expect(listNextSteps(admin(starts, true))).rejects.toThrow("Start read failed");
});
