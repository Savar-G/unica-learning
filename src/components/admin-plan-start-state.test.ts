// @vitest-environment happy-dom
import { createClient } from "@supabase/supabase-js";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
// The family's free window (service read): "child-unknown" is a sibling in a family with an open window; the rest are first children.
vi.mock("@/lib/family-plan-offer-server", () => ({
  loadFamilyPlanOffer: async (_parent: string, child: string) => ({ monthly: child === "child-unknown" ? 59.99 : 79.99, window: child === "child-unknown" ? "open" : "new" }),
}));
import { listNextSteps, getParent } from "@/lib/admin-store";
import { CardsTable } from "@/components/admin-records";

const parent = "11111111-1111-4111-8111-111111111111";
const time = "2026-11-08T20:00:00Z";
let clientId = 0;
beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-08T21:00:00Z")));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
type Evidence = { failPrices?: boolean; failPrice?: "plan_starts" | "child_plan_states"; cents?: { starts?: Record<string, number>; states?: Record<string, number> }; failRead?: string; emailStatus?: string; emailKind?: string; planKind?: string; missingPlan?: boolean; wrongParent?: boolean; noReceipt?: string[]; noBook?: string[] };
const bookOf = (cardIndex: number) => `00000000-0000-4000-8000-${String(cardIndex + 1).padStart(12, "0")}`;
function admin(starts: { card_setup_id: string; state: string; generation: number; started_at: string }[], evidence: Evidence = {}) {
  const cards = ["new", "started", "other", "refused", "open", "stuck", "old-start", "restart", "legacy-email", "legacy-state", "unknown"].map((id) => ({
    id, parent_id: parent, child_id: `child-${id}`, created_at: time, updated_at: time, report_id: null,
    plan: "one", price: 79.99, stripe_customer_id: `cus_${id}`, card_saved_at: time,
  }));
  const db = createClient<Database>("https://fixture.invalid", "synthetic", {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: `fixture-${++clientId}` },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      const name = url.pathname.split("/").at(-1);
      const read = name === "plan_starts" && url.searchParams.has("email_send_status") ? "plan_emails" : name;
      if (evidence.failPrices && (name === "plan_starts" && url.searchParams.get("select")?.includes("monthly_cents") || name === "child_plan_states" && url.searchParams.get("select")?.includes("monthly_cents"))) return Response.json({ code: "XX000", message: "Price read failed" }, { status: 500 });
      if (name === evidence.failPrice && url.searchParams.get("select")?.includes("monthly_cents")) return Response.json({ code: "XX000", message: "Price read failed" }, { status: 500 });
      if (read === evidence.failRead) return Response.json({ code: "XX000", message: "Evidence read failed" }, { status: 500 });
      if (name === "workbook_emails") return Response.json([{
        id: "email", card_setup_id: "legacy-email", kind: evidence.emailKind ?? "plan_start", workbook_number: ["dispatch", "ready"].includes(evidence.emailKind ?? "plan_start") ? 1 : 0,
        status: evidence.emailStatus ?? "sent", claimed_at: time, sent_at: time, delivery: {}, subject: "Confirmation", text_body: "Your confirmation.",
      }]);
      if (name === "child_plan_states") return Response.json(cards.filter((c) => c.id !== "unknown" && !(c.id === "legacy-state" && evidence.missingPlan)).map((c) => ({
        child_id: c.child_id, parent_id: evidence.wrongParent && c.id === "legacy-state" ? "another-parent" : parent,
        kind: c.id === "legacy-state" ? evidence.planKind ?? "paying" : "not_started", monthly_cents: evidence.cents?.states?.[c.id] ?? null,
      })));
      if (name === "admin_card_setups") return Response.json(cards);
      // Every child has a shipped workbook 1 with its delivery receipt, unless the evidence says otherwise.
      if (name === "workbooks") return Response.json(cards.flatMap((c, i) => evidence.noBook?.includes(c.id) ? []
        : [{ id: bookOf(i), parent_id: parent, child_id: c.child_id, number: 1, status: "shipped" }]));
      if (name === "workbook_delivery_receipts") {
        const i = cards.findIndex((_, i) => url.searchParams.get("workbook_id") === `eq.${bookOf(i)}`);
        return Response.json(i < 0 || evidence.noReceipt?.includes(cards[i].id) ? [] : [{
          workbook_id: bookOf(i), parent_id: parent, child_id: cards[i].child_id, number: 1, delivered_at: time, local_time: "12:00",
          time_zone: "America/Vancouver", zone_override: false, recorded_at: time, actor_id: "admin", audit_id: 1,
        }]);
      }
      if (name === "workbook_delivery_corrections") return Response.json([]);
      if (name === "admin_parents") {
        const row = { id: parent, name: "Parent", email: "parent@example.invalid" };
        return Response.json(new Headers(init?.headers).get("accept") === "application/vnd.pgrst.object+json" ? row : [row]);
      }
      if (name === "admin_children") return Response.json(cards.map((c) => ({ id: c.child_id, parent_id: parent, first_name: c.id })));
      if (name === "plan_starts") {
        if (url.searchParams.has("email_send_status")) return Response.json([]);
        const filter = url.searchParams.get("state");
        return Response.json(starts.filter((s) => !filter || filter === `eq.${s.state}` || filter.startsWith("in.") && filter.includes(s.state))
          .map((s) => ({ ...s, monthly_cents: evidence.cents?.starts?.[s.card_setup_id] ?? null })));
      }
      if (["admin_waitlist_joins", "admin_assessments", "email_log", "admin_emails", "admin_tests"].includes(name ?? "")) return Response.json([]);
      throw Error(`Unexpected read: ${url.pathname}`);
    } },
  });
  return { db, userId: "admin", email: "admin@example.invalid" };
}
const starts = [
  { card_setup_id: "restart", state: "started", generation: 1, started_at: time },
  { card_setup_id: "restart", state: "open", generation: 2, started_at: "2026-10-01T00:00:00Z" },
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
    expect(html(id)).not.toContain("Workbook delivered: start plan");
  }
  for (const id of ["new", "refused", "open"]) expect(html(id)).toContain("Workbook delivered: start plan");
  expect(html("stuck")).toContain("Stripe did not answer");
  expect(html("stuck")).not.toContain("Workbook delivered: start plan");
});

async function readCards(page: string, evidence: Evidence = {}) {
  const a = admin(starts, evidence);
  if (page === "next steps") return (await listNextSteps(a)).cards.rows;
  const family = (await getParent(a, parent))!;
  return family.cards.map((c) => ({ ...c, parent: family.parent, child: family.children.find((child) => child.id === c.child_id) ?? null }));
}
function cardHtml(cards: Awaited<ReturnType<typeof readCards>>, id: string) {
  return renderToStaticMarkup(createElement(CardsTable, { cards: cards.filter((c) => c.id === id) }));
}
it.each(["next steps", "parent detail"])("%s keeps recovery for an unresolved restart after a completed start", async (page) => {
  const html = cardHtml(await readCards(page), "restart");
  expect(html).toContain("Plan started.");
  expect(html).toContain("I checked Stripe: close this start");
  expect(html).not.toContain("Workbook delivered: start plan");
});
it.each(["next steps", "parent detail"])("%s recognises a sent legacy plan confirmation with no start row", async (page) => {
  const html = cardHtml(await readCards(page), "legacy-email");
  expect(html).toContain("Plan started.");
  expect(html).not.toContain("Workbook delivered: start plan");
});
for (const page of ["next steps", "parent detail"]) {
  it.each(["free_month", "paying", "payment_failed", "paused", "ending", "ended"])(`${page} recognises the legacy %s plan with no start row`, async (planKind) => {
    const html = cardHtml(await readCards(page, { planKind }), "legacy-state");
    expect(html).toContain("Plan started.");
    expect(html).not.toContain("Workbook delivered: start plan");
  });
  it.each(["plan_starts", "plan_emails", "workbook_emails", "child_plan_states"])(`${page} shows a Stripe check and no start after a failed %s read`, async (failRead) => {
    const html = cardHtml(await readCards(page, { failRead }), "new");
    expect(html).toContain("Check the plan in Stripe before starting a free month.");
    expect(html).not.toContain("Workbook delivered: start plan");
    expect(html).not.toContain("Plan started.");
    if (failRead === "workbook_emails" || failRead === "plan_emails") {
      expect(html).toContain("Workbook email history is unavailable. Reload this page.");
      expect(html).not.toContain("Preview welcome email");
    }
  });
  it(`${page} offers the first free month for a saved card with no start and no stored plan row (#790 re-review)`, async () => {
    // A parent saved the first card and never opened the Account tab, so no plan state row exists. startPlan can start it.
    for (const id of ["unknown"]) {
      const html = cardHtml(await readCards(page), id);
      expect(html).toContain("Workbook delivered: start plan");
      expect(html).not.toContain("Check the plan in Stripe before starting a free month.");
    }
    const missing = cardHtml(await readCards(page, { missingPlan: true }), "legacy-state");
    expect(missing).toContain("Workbook delivered: start plan");
  });
  it(`${page} shows the receipt sentence and a link to workbook 1, and no start button, when workbook 1 has no delivery receipt`, async () => {
    const html = cardHtml(await readCards(page, { noReceipt: ["new"] }), "new");
    expect(html).not.toContain("Workbook delivered: start plan");
    expect(html).toContain("Open this child&#x27;s workbook 1 and confirm its delivery.");
    expect(html).toContain(`href="/admin/workbooks/${bookOf(0)}"`);
  });
  it(`${page} links to the child when there is no workbook 1 yet`, async () => {
    const html = cardHtml(await readCards(page, { noBook: ["new"] }), "new");
    expect(html).not.toContain("Workbook delivered: start plan");
    expect(html).toContain("Open this child&#x27;s workbook 1 and confirm its delivery.");
    expect(html).toContain('href="/admin/children/child-new"');
  });
  it(`${page} shows no start button when the delivery read fails`, async () => {
    const html = cardHtml(await readCards(page, { failRead: "workbook_delivery_receipts" }), "new");
    expect(html).not.toContain("Workbook delivered: start plan");
    expect(html).toContain("We could not read the delivery of workbook 1. Reload this page.");
  });
  it.each([{ planKind: "unknown" }, { wrongParent: true }])(`${page} shows a Stripe check when the plan evidence is unknown: %j`, async (evidence) => {
    const html = cardHtml(await readCards(page, evidence), "legacy-state");
    expect(html).toContain("Check the plan in Stripe before starting a free month.");
    expect(html).not.toContain("Workbook delivered: start plan");
  });
}
it.each(["pending", "sending", "failed", "unknown", "skipped"])("a %s legacy email does not prove a completed start", async (emailStatus) => {
  const html = cardHtml(await readCards("next steps", { emailStatus }), "legacy-email");
  expect(html).not.toContain("Plan started.");
});
it.each(["welcome", "dispatch", "ready"])("a sent %s email does not prove a completed start", async (emailKind) => {
  const html = cardHtml(await readCards("next steps", { emailKind }), "legacy-email");
  expect(html).not.toContain("Plan started.");
});
it("keeps recovery when another evidence read fails", async () => {
  const html = cardHtml(await readCards("next steps", { failRead: "child_plan_states" }), "restart");
  expect(html).toContain("I checked Stripe: close this start");
  expect(html).not.toContain("Workbook delivered: start plan");
});
it.each(["restart", "stuck"])("closing %s offers an initial free month only when none has completed", async (cardId) => {
  const cards = (await readCards("next steps")).filter((c) => c.id === cardId);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("confirm", vi.fn(() => true));
  const fetcher = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(CardsTable, { cards })));
    const close = [...container.querySelectorAll("button")].find((b) => b.textContent === "I checked Stripe: close this start");
    expect(close).toBeDefined();
    await act(async () => close!.click());
    expect(fetcher).toHaveBeenCalledWith(`/api/admin/cards/${cardId}/plan-start`, expect.objectContaining({
      body: JSON.stringify({ generation: cardId === "restart" ? 2 : 1, checkedStripe: true }),
    }));
    expect(container.textContent).toContain("Start closed.");
    if (cardId === "restart") expect(container.textContent).not.toContain("Workbook delivered: start plan");
    else expect(container.textContent).toContain("Workbook delivered: start plan");
  } finally { await act(async () => root.unmount()); }
});

it.each([["new", false], ["unknown", true]] as const)("the %s card's start confirm names an existing free window only for a family that has one", async (cardId, sibling) => {
  const cards = (await readCards("next steps")).filter((c) => c.id === cardId);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const ask = vi.fn(() => false);
  vi.stubGlobal("confirm", ask);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(CardsTable, { cards })));
    const start = [...container.querySelectorAll("button")].find((b) => b.textContent === "Workbook delivered: start plan");
    await act(async () => start!.click());
    const text = String((ask.mock.calls[0] as unknown[])[0]);
    if (sibling) expect(text).toContain("The family's existing free window applies.");
    else expect(text).not.toContain("existing free window");
  } finally { await act(async () => root.unmount()); }
});

const priceCards = ["new", "started", "other", "refused", "old-start", "legacy-state"];
it.each(["next steps", "parent detail"])("%s keeps the saved price, with no ceiling label, when both price reads succeed with no price row", async (page) => {
  const cards = await readCards(page);
  for (const id of priceCards) {
    const html = cardHtml(cards, id);
    expect(html).toContain("CAD 79.99");
    expect(html).not.toContain("up to CAD");
    expect(html).not.toContain("price not read");
  }
});

it.each(["next steps", "parent detail"])("%s labels the ceiling when both price reads fail and start evidence succeeds", async (page) => {
  const cards = await readCards(page, { failPrices: true });
  expect(cardHtml(cards, "started")).toContain("Plan started.");
  for (const id of priceCards) expect(cardHtml(cards, id)).toContain("up to CAD 79.99 (price not read)");
});

// One price read fails (PR #803 review, P3): the ceiling label shows only where the failed read could hold the card's price.
// "started" is a sibling with a stored price in both reads, "legacy-state" has a stored state price only, "open" is an open start
// with a price, and "new" has no start and no price.
const cents = { starts: { started: 5999, open: 5999 }, states: { started: 5999, "legacy-state": 5999 } };
it.each(["next steps", "parent detail"])("%s labels the ceiling only where a failed price-terms read could hold the price", async (page) => {
  const cards = await readCards(page, { cents, failPrice: "plan_starts" });
  expect(cardHtml(cards, "started")).toContain("CAD 59.99");
  expect(cardHtml(cards, "legacy-state")).toContain("CAD 59.99");
  for (const id of ["started", "legacy-state"]) expect(cardHtml(cards, id)).not.toContain("price not read");
  for (const id of ["open", "new"]) expect(cardHtml(cards, id)).toContain("up to CAD 79.99 (price not read)");
});

it.each(["next steps", "parent detail"])("%s labels the ceiling only where a failed plan-states read could hold the price", async (page) => {
  const cards = await readCards(page, { cents, failPrice: "child_plan_states" });
  expect(cardHtml(cards, "started")).toContain("CAD 59.99");
  expect(cardHtml(cards, "open")).toContain("CAD 59.99");
  for (const id of ["started", "open"]) expect(cardHtml(cards, id)).not.toContain("price not read");
  for (const id of ["legacy-state", "new"]) expect(cardHtml(cards, id)).toContain("up to CAD 79.99 (price not read)");
});
