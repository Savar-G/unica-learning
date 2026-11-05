import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mail = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/email-delivery", () => ({ sendEmail: mail.send }));
const { familyDeleteAlert, stripeFamilyPlans, supabaseDeleteStore } = await import("@/lib/family-delete-server");

const parent = "11111111-1111-4111-8111-111111111111";
const json = (answer: unknown, status = 200) => new Response(JSON.stringify(answer), { status, headers: { "content-type": "application/json" } });

function database(answers: Record<string, unknown>, calls: { name: string; args: Record<string, unknown> }[] = []) {
  return createClient("https://database.example.invalid", "synthetic-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const name = new URL(String(input)).pathname.split("/").at(-1)!;
      calls.push({ name, args: JSON.parse(String(init?.body ?? "{}")) });
      if (!(name in answers)) throw new Error(`Unsupported database call: ${name}`);
      return json(answers[name]);
    } },
  });
}

function provider(subscriptions: Record<string, unknown[]>, customers: unknown[] = []) {
  const writes: { method: string; path: string; body: string }[] = [];
  const client = new Stripe("sk_test_family_delete", { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(async (input, init) => {
    const url = new URL(String(input)), method = init?.method ?? "GET";
    if (method !== "GET") {
      // The SDK sends a DELETE's parameters in the query.
      writes.push({ method, path: url.pathname, body: url.search.slice(1) || String(init?.body ?? "") });
      return json({ id: url.pathname.split("/").at(-1), status: "canceled" });
    }
    if (url.pathname === "/v1/customers") return json({ object: "list", data: customers, has_more: false, url: "/v1/customers" });
    if (url.pathname === "/v1/subscriptions") return json({ object: "list", data: subscriptions[url.searchParams.get("customer") ?? ""] ?? [], has_more: false, url: "/v1/subscriptions" });
    throw new Error(`Unexpected Stripe read: ${url.pathname}`);
  }) });
  return { client, writes };
}

describe("the Stripe seam", () => {
  it("stops a plan at once, with no proration and no new invoice, so nothing is refunded or charged", async () => {
    const p = provider({});
    await stripeFamilyPlans(database({}), p.client).stop("sub_1");
    expect(p.writes).toEqual([{ method: "DELETE", path: "/v1/subscriptions/sub_1", body: "invoice_now=false&prorate=false" }]);
  });
  it("counts every state that is not over as running, a state Stripe adds later too", async () => {
    const p = provider({ cus_1: ["trialing", "active", "past_due", "unpaid", "paused", "incomplete", "some_new_state", "canceled", "incomplete_expired"].map((status, i) => ({ id: `sub_${i}`, status })) });
    expect(await stripeFamilyPlans(database({}), p.client).running("cus_1")).toEqual(["sub_0", "sub_1", "sub_2", "sub_3", "sub_4", "sub_5", "sub_6"]);
  });
  it("finds each child's customer and the customer of an old booking, once each", async () => {
    const cards = [{ customer: "cus_1", saved: true }, { customer: "cus_1", saved: true }, { customer: "cus_2", saved: false }, { customer: null, saved: false, booking: { email: "parent@example.invalid", ref: "ref-1" } }];
    const p = provider({}, [{ id: "cus_old", email: "parent@example.invalid", metadata: { ref: "ref-1" } }, { id: "cus_other", email: "parent@example.invalid", metadata: { ref: "ref-2" } }]);
    expect(await stripeFamilyPlans(database({ family_retention_cards: cards }), p.client).customers(parent)).toEqual(["cus_1", "cus_2", "cus_old"]);
  });
  it.each([
    ["a booking with no link", [{ customer: null, saved: false, booking: null }]],
    ["a booking that matches no customer", [{ customer: null, saved: false, booking: { email: "parent@example.invalid", ref: "ref-9" } }]],
    ["a row it cannot read", [{ saved: true }]],
  ])("throws for %s, so no plan is left behind by a guess", async (_name, cards) => {
    const p = provider({}, []);
    await expect(stripeFamilyPlans(database({ family_retention_cards: cards }), p.client).customers(parent)).rejects.toThrow();
  });
});

describe("the database seam", () => {
  it("passes the limit to the claim and reads its answer", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const store = supabaseDeleteStore(database({ claim_family_delete_attempt: [{ out_status: "open", out_attempts_left: 4, out_locked_until: null }] }, calls));
    expect(await store.claimAttempt(parent, 0, { maxAttempts: 5, lockMs: 900_000 })).toEqual({ kind: "open", attemptsLeft: 4, lockedUntil: null });
    expect(calls[0].args).toEqual({ p_parent: parent, p_now: "1970-01-01T00:00:00.000Z", p_max: 5, p_lock_seconds: 900 });
  });
  it("reads a lock", async () => {
    const store = supabaseDeleteStore(database({ claim_family_delete_attempt: [{ out_status: "locked", out_attempts_left: null, out_locked_until: "2026-11-05T00:15:00Z" }] }));
    expect(await store.claimAttempt(parent, 0, { maxAttempts: 5, lockMs: 900_000 })).toEqual({ kind: "locked", until: Date.parse("2026-11-05T00:15:00Z") });
  });
  it("checks without queueing, and then queues with the same function", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const db = database({ request_parent_family_deletion: "ready" }, calls);
    expect(await supabaseDeleteStore(db).check(parent)).toBe("ready");
    expect(calls[0]).toEqual({ name: "request_parent_family_deletion", args: { p: parent, check_only: true } });
    const queued = supabaseDeleteStore(database({ request_parent_family_deletion: "requested" }, calls));
    expect(await queued.request(parent)).toBe("requested");
    expect(calls[1]).toEqual({ name: "request_parent_family_deletion", args: { p: parent, check_only: false } });
  });
  it("throws on an answer the function never gives", async () => {
    await expect(supabaseDeleteStore(database({ request_parent_family_deletion: "maybe" })).request(parent)).rejects.toThrow("unexpected");
  });
});

describe("the team's alert", () => {
  beforeEach(() => {
    mail.send.mockReset().mockResolvedValue({ status: "sent" });
    vi.stubEnv("SIGNUP_NOTIFY_EMAIL", "team@example.invalid");
  });
  it("says what happened and names no child", async () => {
    await familyDeleteAlert(parent, { plansStopped: 2, state: "deleted" });
    const text = mail.send.mock.calls[0][0].text as string;
    expect(text).toContain("Plans stopped: 2");
    expect(text).toContain("Do not prepare or mail another workbook");
  });
  it("tells the team when plans stopped and the family was not queued", async () => {
    await familyDeleteAlert(parent, { plansStopped: 1, state: "not_queued" });
    expect(mail.send.mock.calls[0][0].text).toContain(parent);
    expect(mail.send.mock.calls[0][0].subject).toContain("not finished");
  });
  it("sends nothing without an address, and does not throw when the send fails", async () => {
    mail.send.mockRejectedValueOnce(new Error("Email down"));
    await expect(familyDeleteAlert(parent, { plansStopped: 0, state: "queued" })).resolves.toBeUndefined();
    mail.send.mockClear();
    vi.stubEnv("SIGNUP_NOTIFY_EMAIL", "");
    await familyDeleteAlert(parent, { plansStopped: 0, state: "queued" });
    expect(mail.send).not.toHaveBeenCalled();
  });
});
