// The plans page's card records (withWorkbookEmails through listNextSteps): with 500 cards listed, every read sends at most 100
// ids, and each card still gets its own emails, price, start and plan state.
import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { listNextSteps } from "@/lib/admin-store";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/family-plan-offer-server", () => ({ loadFamilyPlanOffer: async () => null }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CARDS = 501;
const cards = Array.from({ length: CARDS }, (_, i) => ({
  id: id(10_000 + i), parent_id: id(1), child_id: id(20_000 + i), created_at: "2026-11-01T00:00:00Z", updated_at: new Date(Date.UTC(2026, 10, 1) + i * 1000).toISOString(),
  report_id: null, plan: "one", price: 79.99, stripe_customer_id: null, card_saved_at: "2026-11-01T00:00:00Z",
}));
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {
  admin_card_setups: cards,
  workbook_emails: cards.map((c, i) => ({ id: id(30_000 + i), card_setup_id: c.id, kind: "dispatch", workbook_number: 1, status: "sent", claimed_at: null, sent_at: null, delivery: {}, subject: `Email ${i}`, text_body: "" })),
  plan_starts: cards.map((c, i) => ({ card_setup_id: c.id, generation: 1, state: "started", monthly_cents: 5000 + i, first_charge_at: null, started_at: "2026-11-01T00:00:00Z", email_send_status: "sent", email_claimed_at: null, email_sent_at: null, email_subject: `Start ${i}`, email_text: "" })),
  child_plan_states: cards.map((c, i) => ({ child_id: c.child_id, parent_id: c.parent_id, kind: "paying", monthly_cents: 5000 + i, next_charge_at: null })),
};

it("sends at most 100 ids per read and keeps each card's own records", async () => {
  const longest: Record<string, number> = {};
  const fetch = async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const name = url.pathname.split("/").at(-1)!;
    let rows = [...(tables[name] ?? [])];
    for (const [key, value] of url.searchParams) {
      if (["select", "order", "offset", "limit"].includes(key)) continue;
      if (value.startsWith("in.(")) {
        const list = value.slice(4, -1).split(",");
        longest[name] = Math.max(longest[name] ?? 0, list.length);
        rows = rows.filter((r) => list.includes(String(r[key])));
      } else if (value === "not.is.null") rows = rows.filter((r) => r[key] != null);
      else if (value.startsWith("eq.")) rows = rows.filter((r) => String(r[key]) === value.slice(3));
      else throw new Error(`fake server: filter ${key}=${value}`);
    }
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return Response.json(rows.slice(offset, offset + Number(url.searchParams.get("limit") ?? rows.length)));
  };
  const db = createClient<Database>("https://example.com", "test", { global: { fetch: fetch as typeof globalThis.fetch } });
  const { cards: listed } = await listNextSteps({ db, userId: id(9999), email: "admin@example.invalid" });
  expect(listed.rows).toHaveLength(500);
  for (const name of ["workbook_emails", "plan_starts", "child_plan_states"]) expect(longest[name]).toBe(100);
  for (const c of listed.rows) {
    const i = Number(c.id.slice(-5)) - 10_000;
    expect(c.workbookEmails?.map((e) => e.subject)).toEqual([`Email ${i}`, `Start ${i}`]);
    expect(c).toMatchObject({ planMonthly: (5000 + i) / 100, planStarted: true, planKind: "paying" });
  }
});
