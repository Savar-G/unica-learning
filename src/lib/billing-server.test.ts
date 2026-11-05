import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { CARD_UPDATE_SOURCE, stripeBillingProvider, supabaseBillingStore } from "@/lib/billing-server";
import { CardWriteRefused, convergeCard } from "@/lib/card-reconcile";
import { stripeCardProvider } from "@/lib/saved-card-server";

vi.mock("server-only", () => ({}));

const invoice = (over: Record<string, unknown> = {}) => ({
  id: "in_1", customer: "cus_1", status: "paid", created: 100, status_transitions: { paid_at: 200 }, amount_paid: 7999, amount_due: 7999, total: 7999, currency: "cad",
  hosted_invoice_url: "https://invoice.stripe.com/i/1", invoice_pdf: "https://pay.stripe.com/invoice/1/pdf", ...over,
});
const withInvoices = (list: ReturnType<typeof vi.fn>) => stripeBillingProvider({ invoices: { list } } as unknown as Stripe);
const page = (data: unknown[], has_more = false) => ({ data, has_more });

describe("the invoice read", () => {
  it("reads every page of one customer, and gives only the fields the module uses", async () => {
    const list = vi.fn().mockResolvedValueOnce(page([invoice({ id: "in_a" })], true)).mockResolvedValueOnce(page([invoice({ id: "in_b", customer: { id: "cus_1" } })]));
    expect(await withInvoices(list).invoices("cus_1")).toEqual([
      { id: "in_a", customer: "cus_1", status: "paid", created: 100, paidAt: 200, amountPaid: 7999, amountDue: 7999, total: 7999, currency: "cad", receiptUrl: "https://invoice.stripe.com/i/1" },
      { id: "in_b", customer: "cus_1", status: "paid", created: 100, paidAt: 200, amountPaid: 7999, amountDue: 7999, total: 7999, currency: "cad", receiptUrl: "https://invoice.stripe.com/i/1" },
    ]);
    expect(list.mock.calls[0][0]).toMatchObject({ customer: "cus_1", limit: 100 });
    expect(list.mock.calls[1][0]).toMatchObject({ customer: "cus_1", starting_after: "in_a" });
  });

  it("falls back to the PDF, and gives no link that is not Stripe's own https page", async () => {
    const link = async (over: Record<string, unknown>) => (await withInvoices(vi.fn().mockResolvedValue(page([invoice(over)]))).invoices("cus_1"))[0].receiptUrl;
    expect(await link({ hosted_invoice_url: null })).toBe("https://pay.stripe.com/invoice/1/pdf");
    expect(await link({ hosted_invoice_url: null, invoice_pdf: null })).toBeNull();
    expect(await link({ hosted_invoice_url: "http://invoice.stripe.com/i/1" })).toBeNull();
    expect(await link({ hosted_invoice_url: "https://stripe.com.evil.example/i/1" })).toBeNull();
    expect(await link({ hosted_invoice_url: "javascript:alert(1)" })).toBeNull();
    expect(await link({ hosted_invoice_url: "not a url" })).toBeNull();
  });

  it("throws instead of answering from part of the list", async () => {
    await expect(withInvoices(vi.fn().mockResolvedValue({ data: [invoice()] })).invoices("cus_1")).rejects.toThrow("pagination unreadable");
    await expect(withInvoices(vi.fn().mockResolvedValue(page([], true))).invoices("cus_1")).rejects.toThrow("did not advance");
    await expect(withInvoices(vi.fn().mockResolvedValue(page([invoice()], true))).invoices("cus_1")).rejects.toThrow("did not advance");
    let id = 0;
    const endless = vi.fn(async () => page([invoice({ id: `in_${++id}` })], true));
    await expect(withInvoices(endless).invoices("cus_1")).rejects.toThrow("Too many invoices");
    expect(endless).toHaveBeenCalledTimes(12);
    await expect(withInvoices(vi.fn().mockResolvedValueOnce(page([invoice()], true)).mockRejectedValueOnce(new Error("Stripe down"))).invoices("cus_1")).rejects.toThrow("Stripe down");
  });

  it("throws without a key", async () => {
    await expect(stripeBillingProvider(null).invoices("cus_1")).rejects.toThrow("No Stripe key");
  });
});

/** The real SDK over a fake transport, so the checks read what goes to Stripe. */
function recordingStripe(answer: (url: string, method: string) => { status?: number; body: unknown }) {
  const requests: { url: string; method: string; body: URLSearchParams }[] = [];
  const client = new Stripe("sk_test_billing", {
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(async (url, init) => {
      requests.push({ url: String(url), method: init?.method ?? "GET", body: new URLSearchParams(String(init?.body ?? "")) });
      const { status = 200, body } = answer(String(url), init?.method ?? "GET");
      return new Response(JSON.stringify(body), { status });
    }),
  });
  return { client, requests };
}

const REQUEST = { ref: "card-1", customer: "cus_1", parentId: "p1", childId: "c1", returnUrl: "https://unica.test/return", cancelUrl: "https://unica.test/cancel" };

describe("the card update on Stripe", () => {
  it("makes a hosted page in setup mode for this customer, with no address, plan or child's name", async () => {
    const { client, requests } = recordingStripe(() => ({ body: { id: "cs_test_1", url: "https://checkout.stripe.com/c/1" } }));
    expect(await stripeBillingProvider(client).createCardUpdate(REQUEST)).toBe("https://checkout.stripe.com/c/1");
    const body = requests[0].body;
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toMatch(/\/checkout\/sessions$/);
    expect(body.get("mode")).toBe("setup");
    expect(body.get("customer")).toBe("cus_1");
    // Cards only. Stripe refuses payment_method_types on a Checkout Session; allowed_payment_method_types gives a card-only page.
    expect(body.get("payment_method_types[0]")).toBeNull();
    expect(body.getAll("allowed_payment_method_types[0]")).toEqual(["card"]);
    expect(body.get("allowed_payment_method_types[1]")).toBeNull();
    expect(body.get("client_reference_id")).toBe("card-1");
    expect(body.get("metadata[ref]")).toBe("card-1");
    expect(body.get("metadata[source]")).toBe(CARD_UPDATE_SOURCE);
    expect(body.get("success_url")).toBe("https://unica.test/return?session_id={CHECKOUT_SESSION_ID}");
    expect(body.get("cancel_url")).toBe("https://unica.test/cancel");
    expect(body.get("shipping_address_collection[allowed_countries][0]")).toBeNull();
    expect(body.get("custom_text[submit][message]")).not.toMatch(/nothing is charged/i);
  });

  const session = (over: Record<string, unknown> = {}, intent: Record<string, unknown> = {}) => ({
    id: "cs_test_1", mode: "setup", status: "complete", created: 1_800_000_000, customer: "cus_1", metadata: { ref: "card-1", source: CARD_UPDATE_SOURCE },
    setup_intent: { status: "succeeded", customer: "cus_1", payment_method: "pm_new", ...intent }, ...over,
  });
  const read = (body: unknown, status = 200) => stripeBillingProvider(recordingStripe(() => ({ status, body })).client).readCardUpdate("cs_test_1");

  it("gives the card only once Stripe saved it on this customer", async () => {
    expect(await read(session())).toEqual({ id: "cs_test_1", ref: "card-1", customer: "cus_1", created: 1_800_000_000, paymentMethod: "pm_new" });
    expect((await read(session({ status: "open" })))?.paymentMethod).toBeNull();
    expect((await read(session({}, { status: "processing" })))?.paymentMethod).toBeNull();
    expect((await read(session({}, { customer: "cus_other" })))?.paymentMethod).toBeNull();
    expect((await read(session({ setup_intent: "seti_not_expanded" })))?.paymentMethod).toBeNull();
  });

  it("does not take a session this flow did not make", async () => {
    expect(await read(session({ metadata: { ref: "card-1", source: "report" } }))).toBeNull();
    expect(await read(session({ mode: "payment" }))).toBeNull();
    expect(await read(session({ metadata: { source: CARD_UPDATE_SOURCE } }))).toBeNull();
  });

  it("reads a session Stripe does not have as none, and throws when Stripe fails", async () => {
    expect(await read({ error: { type: "invalid_request_error", message: "No such session" } }, 404)).toBeNull();
    await expect(read({ error: { type: "api_error", message: "down" } }, 500)).rejects.toThrow();
    await expect(stripeBillingProvider(null).readCardUpdate("cs_test_1")).rejects.toThrow("No Stripe key");
  });

  /** A customer with no default card yet, whose list holds these subscriptions, all on the old card. */
  const onOldCard = (data: unknown[]) => recordingStripe((url, method) => (method === "POST"
    ? { body: { id: "written" } }
    : new URL(url).pathname === "/v1/subscriptions" ? { body: { object: "list", has_more: false, data } } : { body: { id: "cus_1", invoice_settings: { default_payment_method: null } } }));
  const running = (id: string, status: string) => ({ id, status, default_payment_method: "pm_old" });
  const write = (client: Stripe, canWrite = () => true) => convergeCard("cus_1", "pm_new", { stripe: stripeBillingProvider(client), canWrite });

  it("writes the card on each subscription that can still charge and on the customer, and reads the whole list first", async () => {
    const { client, requests } = onOldCard([running("sub_live", "active"), running("sub_trial", "trialing"), running("sub_late", "past_due"), running("sub_over", "canceled"), running("sub_gone", "incomplete_expired")]);
    await write(client);
    expect(requests[0].method).toBe("GET");
    const writes = requests.filter((r) => r.method === "POST");
    const customer = writes.at(-1)!;
    expect(new URL(customer.url).pathname).toBe("/v1/customers/cus_1");
    expect(customer.body.get("invoice_settings[default_payment_method]")).toBe("pm_new");
    const subscriptions = writes.slice(0, -1);
    expect(subscriptions.map((r) => r.url.split("/").at(-1))).toEqual(["sub_live", "sub_trial", "sub_late"]);
    for (const row of subscriptions) expect(row.body.get("default_payment_method")).toBe("pm_new");
  });

  it("stores the card on the customer when no subscription exists yet, so the plan start can use it", async () => {
    const { client, requests } = onOldCard([]);
    await write(client);
    const writes = requests.filter((r) => r.method === "POST");
    expect(writes.map((r) => new URL(r.url).pathname)).toEqual(["/v1/customers/cus_1"]);
    expect(writes[0].body.get("invoice_settings[default_payment_method]")).toBe("pm_new");
  });

  it("writes nothing when it cannot read the whole list", async () => {
    const { client, requests } = recordingStripe(() => ({ status: 500, body: { error: { type: "api_error", message: "down" } } }));
    await expect(write(client)).rejects.toThrow();
    expect(requests.filter((r) => r.method === "POST")).toEqual([]);
  });

  it("starts no Stripe write once its time is over, and stops between writes", async () => {
    const none = onOldCard([running("sub_live", "active")]);
    await expect(write(none.client, () => false)).rejects.toThrow("time for a card write");
    expect(none.requests.filter((r) => r.method === "POST")).toEqual([]);
    const one = onOldCard([running("sub_live", "active")]);
    let left = 1;
    await expect(write(one.client, () => left-- > 0)).rejects.toThrow("time for a card write");
    expect(one.requests.filter((r) => r.method === "POST").map((r) => new URL(r.url).pathname)).toEqual(["/v1/subscriptions/sub_live"]);
  });

  it("calls a refusal a refusal, and any other failure an unknown outcome", async () => {
    const answers: [number, string, new (...args: never[]) => Error][] = [
      [400, "invalid_request_error", CardWriteRefused], [402, "card_error", CardWriteRefused], [500, "api_error", Stripe.errors.StripeAPIError],
      [429, "rate_limit_error", Stripe.errors.StripeRateLimitError], [409, "idempotency_error", Stripe.errors.StripeAPIError], [400, "idempotency_error", Stripe.errors.StripeIdempotencyError],
    ];
    for (const [status, type, error] of answers) {
      const { client } = recordingStripe(() => ({ status, body: { error: { type, message: "No" } } }));
      await expect(stripeBillingProvider(client).setCustomerCard("cus_1", "pm_new")).rejects.toBeInstanceOf(error);
    }
  });

  it("reads a customer Stripe does not have, or that was deleted, as gone, and writes nothing", async () => {
    const missing = recordingStripe((url) => (new URL(url).pathname.startsWith("/v1/customers/") ? { status: 404, body: { error: { type: "invalid_request_error", message: "No such customer" } } } : { body: { object: "list", has_more: false, data: [] } }));
    expect(await write(missing.client)).toEqual({ wrote: 0, confirmed: true });
    expect(missing.requests.filter((r) => r.method === "POST")).toEqual([]);
    const deleted = recordingStripe((url) => (new URL(url).pathname.startsWith("/v1/customers/") ? { body: { id: "cus_1", deleted: true } } : { body: { object: "list", has_more: false, data: [] } }));
    expect(await write(deleted.client)).toEqual({ wrote: 0, confirmed: true });
    const down = recordingStripe(() => ({ status: 500, body: { error: { type: "api_error", message: "down" } } }));
    await expect(write(down.client)).rejects.toThrow();
  });

  it("leaves saved-card's first card on the row after an update", async () => {
    const first = { id: "cs_first", mode: "setup", status: "complete", created: 100, customer: "cus_1", client_reference_id: "card-1", metadata: { ref: "card-1", plan: "one", price: "79.99" }, setup_intent: { status: "succeeded", customer: "cus_1" } };
    const update = { id: "cs_update", mode: "setup", status: "complete", created: 200, customer: "cus_1", client_reference_id: "card-1", metadata: { ref: "card-1", source: CARD_UPDATE_SOURCE }, setup_intent: { status: "succeeded", customer: "cus_1" } };
    const { client } = recordingStripe(() => ({ body: { object: "list", has_more: false, data: [update, first] } }));
    const evidence = await stripeCardProvider(client).find({ id: "card-1", customer: "cus_1" });
    expect(evidence?.savedFor?.plan).toBe("one");
    expect(evidence?.savedAt).toBe(new Date(100_000).toISOString());
  });
});

describe("the billing store", () => {
  const P1 = "11111111-1111-4111-8111-111111111111";
  const db = (requests: URL[], rows: Record<string, unknown>, failing?: string) => createClient<never>("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    const table = url.pathname.replace("/rest/v1/", "");
    if (table === failing) return Response.json({ message: "boom" }, { status: 500 });
    return Response.json(rows[table] ?? []);
  } } }) as never;

  it("filters every read on the signed-in parent, and joins each child to its card", async () => {
    const requests: URL[] = [];
    const store = supabaseBillingStore(db(requests, {
      children: [{ id: "c1", first_name: "Leah" }, { id: "c2", first_name: "Omar" }],
      card_setups: [{ id: "card-1", child_id: "c1", stripe_customer_id: "cus_1", card_saved_at: "2026-11-01T00:00:00Z" }],
    }));
    expect(await store.family(P1)).toEqual([
      { childId: "c1", firstName: "Leah", cardId: "card-1", customer: "cus_1", cardSaved: true },
      { childId: "c2", firstName: "Omar", cardId: null, customer: null, cardSaved: false },
    ]);
    expect(requests.map((u) => u.searchParams.get("parent_id"))).toEqual([`eq.${P1}`, `eq.${P1}`]);
  });

  it("reads one card by the row and the parent, so another family's row reads as none", async () => {
    const requests: URL[] = [];
    const store = supabaseBillingStore(db(requests, { card_setups: { id: "card-1", child_id: "c1", stripe_customer_id: "cus_1", card_saved_at: null } }));
    expect(await store.card(P1, "card-1")).toEqual({ cardId: "card-1", childId: "c1", customer: "cus_1", cardSaved: false });
    expect(requests[0].searchParams.get("id")).toBe("eq.card-1");
    expect(requests[0].searchParams.get("parent_id")).toBe(`eq.${P1}`);
  });

  it.each(["children", "card_setups"])("throws when %s fails", async (table) => {
    await expect(supabaseBillingStore(db([], {}, table)).family(P1)).rejects.toThrow();
  });

  /** A store over a fake database whose functions answer in place, with the bodies they were sent. */
  const rpcStore = (answer: (name: string) => Response) => {
    const sent: { name: string; body: unknown }[] = [];
    const store = supabaseBillingStore(createClient<never>("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
      const name = new URL(String(input)).pathname.replace("/rest/v1/rpc/", "");
      sent.push({ name, body: JSON.parse(String(init?.body)) });
      return answer(name);
    } } }) as never);
    return { store, sent };
  };

  const CARD = { parentId: P1, session: "cs_test_1", created: 1_800_000_000, paymentMethod: "pm_new" };

  it("records a return's card with the parent, the row, the session, its time from Stripe and the card's id", async () => {
    const { store, sent } = rpcStore(() => Response.json({ state: "row", session: "cs_test_1", payment_method: "pm_new", needs_repair: true, recorded: true }));
    expect(await store.recordCard("card-1", CARD)).toEqual({ state: "row", session: "cs_test_1", paymentMethod: "pm_new", needsRepair: true, recorded: true });
    expect(sent).toEqual([{ name: "record_card_update", body: { p_parent: P1, p_card: "card-1", p_session: "cs_test_1", p_session_created_at: new Date(1_800_000_000_000).toISOString(), p_payment_method: "pm_new" } }]);
    expect(await rpcStore(() => Response.json({ state: "no_match" })).store.recordCard("card-1", CARD)).toEqual({ state: "no_match" });
  });

  it("throws on a record answer it cannot read or that fails, so no card is written", async () => {
    for (const answer of ["maybe", { state: "maybe" }, null]) await expect(rpcStore(() => Response.json(answer)).store.recordCard("card-1", CARD)).rejects.toThrow("unreadable");
    await expect(rpcStore(() => Response.json({ message: "boom" }, { status: 500 })).store.recordCard("card-1", CARD)).rejects.toThrow("record");
  });

  it("settles with the row, the session and whether a read confirmed it, and reads each answer", async () => {
    const { store, sent } = rpcStore(() => Response.json({ state: "newer", session: "cs_test_2", payment_method: "pm_b" }));
    expect(await store.settleCard("card-1", "cs_test_1", true)).toEqual({ state: "newer", session: "cs_test_2", paymentMethod: "pm_b" });
    expect(sent).toEqual([{ name: "settle_card_update", body: { p_card: "card-1", p_session: "cs_test_1", p_confirmed: true } }]);
    for (const state of ["settled", "flagged"]) expect(await rpcStore(() => Response.json({ state })).store.settleCard("card-1", "cs_test_1", false)).toEqual({ state });
    await expect(rpcStore(() => Response.json({ state: "maybe" })).store.settleCard("card-1", null, true)).rejects.toThrow("unreadable");
    await expect(rpcStore(() => Response.json({ message: "boom" }, { status: 500 })).store.settleCard("card-1", null, true)).rejects.toThrow("settle");
  });

  const noStart = { start_generation: null, start_key: null, start_card: null, start_at: null, start_state: null, start_subscription: null, start_first_charge: null, start_finished_at: null, start_email: null, start_alert: null };
  const rowColumns = { card_id: "card-1", customer: "cus_1", session_id: "cs_test_1", payment_method_id: "pm_new", needs_repair: true, ...noStart };
  const startAnswer = { admitted: false, generation: 2, key: "key-1", card: "pm_first", at: new Date(1000).toISOString(), state: "started", subscription: "sub_1", first_charge: "2026-12-05T18:00:00+00:00", finished_at: new Date(2000).toISOString(), email: "pending", alert: null };
  const planStart = { generation: 2, key: "key-1", card: "pm_first", at: 1000, state: "started", subscription: "sub_1", firstCharge: "2026-12-05T18:00:00.000Z", finished: 2000, email: "pending", alert: null };

  it("reads a row by card, by customer and for the sweep, with its newest plan start when there is one", async () => {
    const withStart = { ...rowColumns, start_generation: 2, start_key: "key-1", start_card: "pm_first", start_at: startAnswer.at, start_state: "started", start_subscription: "sub_1", start_first_charge: startAnswer.first_charge, start_finished_at: startAnswer.finished_at, start_email: "pending", start_alert: null };
    const { store, sent } = rpcStore(() => Response.json([withStart]));
    const row = { cardId: "card-1", customer: "cus_1", session: "cs_test_1", paymentMethod: "pm_new", needsRepair: true, planStart };
    expect(await store.cardRow("card-1")).toEqual(row);
    expect(await store.cardRowOfCustomer("cus_1")).toEqual(row);
    expect(await store.dueCardRows(5000, 10)).toEqual([row]);
    expect(sent.map((s) => s.name)).toEqual(["card_recovery_rows", "card_recovery_rows", "card_recovery_rows"]);
    expect(sent.map((s) => s.body)).toEqual([{ p_card: "card-1" }, { p_customer: "cus_1" }, { p_changed_after: new Date(5000).toISOString(), p_limit: 10 }]);
    expect(await rpcStore(() => Response.json([])).store.cardRow("card-1")).toBeNull();
    expect((await rpcStore(() => Response.json([rowColumns])).store.cardRow("card-1"))?.planStart).toBeNull();
    await expect(rpcStore(() => Response.json({ message: "boom" }, { status: 500 })).store.cardRow("card-1")).rejects.toThrow("read");
    await expect(rpcStore(() => Response.json([{ ...withStart, start_state: "maybe" }])).store.cardRow("card-1")).rejects.toThrow("unreadable");
  });

  it("admits a plan start with the generation, the key and the card, and reads the record that answers", async () => {
    const { store, sent } = rpcStore(() => Response.json(startAnswer));
    expect(await store.admitPlanStart("card-1", 2, "key-2", "pm_second")).toEqual(planStart);
    expect(sent).toEqual([{ name: "admit_plan_start", body: { p_card: "card-1", p_generation: 2, p_key: "key-2", p_payment_method: "pm_second" } }]);
    await expect(rpcStore(() => Response.json({ key: "key-1" })).store.admitPlanStart("card-1", 1, "k", "pm")).rejects.toThrow("unreadable");
    await expect(rpcStore(() => Response.json({ message: "boom" }, { status: 500 })).store.admitPlanStart("card-1", 1, "k", "pm")).rejects.toThrow("admission");
  });

  it("closes a record, notes its email and its alert, and lets an admin close it, each by generation", async () => {
    const { store, sent } = rpcStore(() => Response.json(true));
    await store.finishPlanStart("card-1", 2, { state: "started", subscription: "sub_1", firstCharge: "2026-12-05T18:00:00.000Z", email: true });
    await store.finishPlanStart("card-1", 3, { state: "other", subscription: "sub_2" });
    await store.finishPlanStart("card-1", 4, { state: "refused" });
    await store.notePlanEmail("card-1", 2, "sent");
    expect(await store.claimPlanAlert("card-1", 2)).toBe(true);
    await store.notePlanAlert("card-1", 2, { state: "released", error: "Resend answered 429" });
    expect(await store.teamEndPlanStart("card-1", 2, "admin-1")).toBe(true);
    await store.noteCardChecked("card-1");
    expect(sent).toEqual([
      { name: "finish_plan_start", body: { p_card: "card-1", p_generation: 2, p_state: "started", p_subscription: "sub_1", p_first_charge: "2026-12-05T18:00:00.000Z", p_email: true } },
      { name: "finish_plan_start", body: { p_card: "card-1", p_generation: 3, p_state: "other", p_subscription: "sub_2", p_first_charge: null, p_email: false } },
      { name: "finish_plan_start", body: { p_card: "card-1", p_generation: 4, p_state: "refused", p_subscription: null, p_first_charge: null, p_email: false } },
      { name: "note_plan_start_email", body: { p_card: "card-1", p_generation: 2, p_state: "sent" } },
      { name: "claim_plan_start_alert", body: { p_card: "card-1", p_generation: 2 } },
      { name: "note_plan_start_alert", body: { p_card: "card-1", p_generation: 2, p_state: "released", p_email_id: null, p_error: "Resend answered 429" } },
      { name: "team_end_plan_start", body: { p_card: "card-1", p_generation: 2, p_admin: "admin-1" } },
      { name: "note_card_checked", body: { p_card: "card-1" } },
    ]);
    await expect(rpcStore(() => Response.json({ message: "boom" }, { status: 500 })).store.finishPlanStart("card-1", 1, { state: "refused" })).rejects.toThrow("finish");
    await expect(rpcStore(() => Response.json({ message: "boom" }, { status: 500 })).store.teamEndPlanStart("card-1", 1, "a")).rejects.toThrow("team end");
  });
});
