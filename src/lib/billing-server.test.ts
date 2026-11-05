import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { CARD_UPDATE_SOURCE, stripeBillingProvider, supabaseBillingStore } from "@/lib/billing-server";
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

  it("sets the card on the customer and on each subscription that can still charge, and reads the whole list first", async () => {
    const running = (id: string, status: string) => ({ id, status });
    const { client, requests } = recordingStripe((url, method) => (method === "POST"
      ? { body: { id: "written" } }
      : { body: { object: "list", has_more: false, data: [running("sub_live", "active"), running("sub_trial", "trialing"), running("sub_late", "past_due"), running("sub_over", "canceled"), running("sub_gone", "incomplete_expired")] } }));
    await stripeBillingProvider(client).setCardDefault("cus_1", "pm_new");
    expect(requests[0].method).toBe("GET");
    const [customer, ...subscriptions] = requests.filter((r) => r.method === "POST");
    expect(new URL(customer.url).pathname).toBe("/v1/customers/cus_1");
    expect(customer.body.get("invoice_settings[default_payment_method]")).toBe("pm_new");
    expect(subscriptions.map((r) => r.url.split("/").at(-1))).toEqual(["sub_live", "sub_trial", "sub_late"]);
    for (const write of subscriptions) expect(write.body.get("default_payment_method")).toBe("pm_new");
  });

  it("stores the card on the customer when no subscription exists yet, so the plan start can use it", async () => {
    const { client, requests } = recordingStripe((url, method) => (method === "POST" ? { body: { id: "cus_1" } } : { body: { object: "list", has_more: false, data: [] } }));
    await stripeBillingProvider(client).setCardDefault("cus_1", "pm_new");
    const writes = requests.filter((r) => r.method === "POST");
    expect(writes.map((r) => new URL(r.url).pathname)).toEqual(["/v1/customers/cus_1"]);
    expect(writes[0].body.get("invoice_settings[default_payment_method]")).toBe("pm_new");
  });

  it("writes nothing when it cannot read the whole list", async () => {
    const { client, requests } = recordingStripe(() => ({ status: 500, body: { error: { type: "api_error", message: "down" } } }));
    await expect(stripeBillingProvider(client).setCardDefault("cus_1", "pm_new")).rejects.toThrow();
    expect(requests.filter((r) => r.method === "POST")).toEqual([]);
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

  it("claims with the parent, the row, the session and its time from Stripe", async () => {
    const { store, sent } = rpcStore(() => Response.json("apply"));
    expect(await store.claimCardUpdate(P1, "card-1", { id: "cs_test_1", created: 1_800_000_000 })).toBe("apply");
    expect(sent).toEqual([{ name: "claim_card_update", body: { p_parent: P1, p_card: "card-1", p_session: "cs_test_1", p_session_created_at: new Date(1_800_000_000_000).toISOString() } }]);
  });

  it.each(["stale", "no_match"])("passes the claim's answer %s on", async (answer) => {
    expect(await rpcStore(() => Response.json(answer)).store.claimCardUpdate(P1, "card-1", { id: "cs_test_1", created: 1 })).toBe(answer);
  });

  it("throws on a claim it cannot read or that fails, so no card is written", async () => {
    await expect(rpcStore(() => Response.json("maybe")).store.claimCardUpdate(P1, "card-1", { id: "cs_test_1", created: 1 })).rejects.toThrow("unreadable");
    await expect(rpcStore(() => Response.json({ message: "boom" }, { status: 500 })).store.claimCardUpdate(P1, "card-1", { id: "cs_test_1", created: 1 })).rejects.toThrow("claim");
  });

  it("finishes with the parent, the row and the session, and answers the newest session", async () => {
    const { store, sent } = rpcStore(() => Response.json("cs_test_2"));
    expect(await store.finishCardUpdate(P1, "card-1", "cs_test_1")).toBe("cs_test_2");
    expect(sent).toEqual([{ name: "finish_card_update", body: { p_parent: P1, p_card: "card-1", p_session: "cs_test_1" } }]);
    await expect(rpcStore(() => Response.json({ message: "boom" }, { status: 500 })).store.finishCardUpdate(P1, "card-1", "cs_test_1")).rejects.toThrow("finish");
  });
});
