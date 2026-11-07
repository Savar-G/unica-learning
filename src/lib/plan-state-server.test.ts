import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";

vi.mock("server-only", () => ({}));
import { stripePlanProvider, supabasePlanReads, supabasePlanStore } from "@/lib/plan-state-server";

const when = (seconds: number) => new Date(seconds * 1000).toISOString();

const subscription = (over: Partial<Stripe.Subscription> & { end?: number; cents?: number | null } = {}) => {
  const { end = 1_800_000_000, cents = 7999, ...rest } = over;
  return {
    status: "active", cancel_at_period_end: false, trial_end: null, created: 1, ended_at: null,
    items: { data: [{ current_period_end: end, price: { unit_amount: cents } }] }, ...rest,
  } as unknown as Stripe.Subscription;
};
const stripeWith = (list: ReturnType<typeof vi.fn>) => ({ subscriptions: { list } }) as unknown as Stripe;
const page = (data: Stripe.Subscription[], has_more = false) => ({ data, has_more });

describe("Stripe as the plan provider", () => {
  it("reads every subscription of the customer through the parent's plan rule", async () => {
    const cancelled = Array.from({ length: 100 }, (_, i) => subscription({ id: `sub_new_${i}`, status: "canceled", created: 2000 - i, ended_at: 1_800_000_500 }));
    const list = vi.fn()
      .mockResolvedValueOnce(page(cancelled, true))
      .mockResolvedValueOnce(page([subscription({ id: "sub_old_active", created: 1 })]));
    expect(await stripePlanProvider(stripeWith(list)).plan("cus_1")).toEqual({ kind: "paying", nextCharge: when(1_800_000_000), monthly: 79.99 });
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[0][0]).toMatchObject({ customer: "cus_1", status: "all" });
    expect(list.mock.calls[0][0].starting_after).toBeUndefined();
    expect(list.mock.calls[1][0]).toMatchObject({ customer: "cus_1", status: "all", starting_after: "sub_new_99" });
  });

  it("keeps the date a plan ended", async () => {
    const list = vi.fn().mockResolvedValue(page([subscription({ status: "canceled", ended_at: 1_800_000_500 })]));
    expect(await stripePlanProvider(stripeWith(list)).plan("cus_1")).toEqual({ kind: "ended", endedOn: when(1_800_000_500) });
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("throws instead of answering from part of the list", async () => {
    const plan = (list: ReturnType<typeof vi.fn>) => stripePlanProvider(stripeWith(list)).plan("cus_1");
    await expect(plan(vi.fn().mockResolvedValue({ data: [subscription({ id: "sub_1" })] }))).rejects.toThrow("pagination unreadable");
    await expect(plan(vi.fn().mockResolvedValue(page([], true)))).rejects.toThrow("did not advance");
    await expect(plan(vi.fn().mockResolvedValue(page([subscription({ id: "sub_1" })], true)))).rejects.toThrow("did not advance");
    let id = 0;
    const endless = vi.fn(async () => page([subscription({ id: `sub_${++id}`, status: "canceled" })], true));
    await expect(plan(endless)).rejects.toThrow("Too many subscriptions");
    expect(endless).toHaveBeenCalledTimes(10);
  });

  it("throws when the second page fails", async () => {
    const list = vi.fn().mockResolvedValueOnce(page([subscription({ id: "sub_1", status: "canceled" })], true)).mockRejectedValueOnce(new Error("Stripe down"));
    await expect(stripePlanProvider(stripeWith(list)).plan("cus_1")).rejects.toThrow("Stripe down");
  });

  it("throws when Stripe fails, and without a key", async () => {
    await expect(stripePlanProvider(stripeWith(vi.fn().mockRejectedValue(new Error("Stripe down")))).plan("cus_1")).rejects.toThrow("Stripe down");
    await expect(stripePlanProvider(null).plan("cus_1")).rejects.toThrow();
  });
});

/** The parts of a Supabase client the store uses, answering what each test sets. */
function fakeDb(answers: { card?: unknown; state?: unknown; rpc?: unknown; error?: { message: string } | null }) {
  const filters: Record<string, Record<string, unknown>> = {};
  const rpc = vi.fn(async () => ({ data: answers.rpc ?? null, error: answers.error ?? null }));
  const from = (table: string) => {
    filters[table] = {};
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => { filters[table][column] = value; return chain; },
      abortSignal: () => chain,
      maybeSingle: async () => ({ data: table === "card_setups" ? answers.card ?? null : answers.state ?? null, error: answers.error ?? null }),
    };
    return chain;
  };
  return { db: { from, rpc } as unknown as SupabaseClient<Database>, rpc, filters };
}

const key = { parentId: "parent-1", childId: "child-1" };

describe("the plan state store on Supabase", () => {
  it("finds the owner of a customer and of a child", async () => {
    const row = { parent_id: "parent-1", child_id: "child-1", stripe_customer_id: "cus_1", card_saved_at: "2026-11-01T00:00:00.000Z" };
    const owner = { parentId: "parent-1", childId: "child-1", customer: "cus_1", cardSaved: true };
    const byCustomer = fakeDb({ card: row });
    expect(await supabasePlanStore(byCustomer.db).ownerOfCustomer("cus_1")).toEqual(owner);
    expect(byCustomer.filters.card_setups).toEqual({ stripe_customer_id: "cus_1" });
    const byChild = fakeDb({ card: row });
    expect(await supabasePlanStore(byChild.db).ownerOfChild(key)).toEqual(owner);
    expect(byChild.filters.card_setups).toEqual({ child_id: "child-1", parent_id: "parent-1" });
  });

  it("reads a child with no customer as no owner", async () => {
    const { db } = fakeDb({ card: { parent_id: "parent-1", child_id: "child-1", stripe_customer_id: null, card_saved_at: null } });
    expect(await supabasePlanStore(db).ownerOfChild(key)).toBeNull();
  });

  it("loads a child's row by child and parent", async () => {
    const { db, filters } = fakeDb({ state: { kind: "payment_failed", next_charge_at: null, ends_at: null, monthly_cents: null, ending_free: false, event_at: "2026-11-01T00:00:00+00:00", event_id: "evt_1" } });
    expect(await supabasePlanStore(db).load(key)).toEqual({ plan: { kind: "payment_failed" }, eventAt: "2026-11-01T00:00:00+00:00", eventId: "evt_1" });
    expect(filters.child_plan_states).toEqual({ child_id: "child-1", parent_id: "parent-1" });
  });

  it("sends one atomic write, and returns what the database decided", async () => {
    const { db, rpc } = fakeDb({ rpc: "stored" });
    const write = { plan: { kind: "free_month", firstCharge: when(1_800_000_000), monthly: 79.99 } as const, eventAt: when(100), eventId: "evt_1", readOrder: 7 };
    expect(await supabasePlanStore(db).save("cus_1", write)).toBe("stored");
    expect(rpc).toHaveBeenCalledWith("save_child_plan_state", {
      p_customer: "cus_1", p_kind: "free_month", p_next_charge_at: when(1_800_000_000), p_ends_at: null, p_monthly_cents: 7999, p_ending_free: false,
      p_event_at: when(100), p_event_id: "evt_1", p_read_order: 7,
    });
  });

  it("takes the read order from the database", async () => {
    const { db, rpc } = fakeDb({ rpc: 42 });
    expect(await supabasePlanStore(db).takeReadOrder()).toBe(42);
    expect(rpc).toHaveBeenCalledWith("take_plan_read_order");
  });

  it.each([null, "42", 1.5, Number.MAX_SAFE_INTEGER + 1])("throws on a read order it cannot compare: %j", async (answer) => {
    const { db } = fakeDb({ rpc: answer });
    await expect(supabasePlanStore(db).takeReadOrder()).rejects.toThrow("read order");
  });

  it("throws when a read or a write fails", async () => {
    const { db } = fakeDb({ error: { message: "down" } });
    const store = supabasePlanStore(db);
    await expect(store.ownerOfCustomer("cus_1")).rejects.toThrow("down");
    await expect(store.ownerOfChild(key)).rejects.toThrow("down");
    await expect(store.load(key)).rejects.toThrow("down");
    await expect(store.takeReadOrder()).rejects.toThrow("down");
    await expect(store.save("cus_1", { plan: { kind: "ended" }, eventAt: null, eventId: null, readOrder: 1 })).rejects.toThrow("down");
  });

  it("throws on an answer it does not know", async () => {
    const { db } = fakeDb({ rpc: "something" });
    await expect(supabasePlanStore(db).save("cus_1", { plan: { kind: "ended" }, eventAt: null, eventId: null, readOrder: 1 })).rejects.toThrow();
  });
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the row read during a page render", () => {
  it("opts out of the render's fetch memoization, so a read after a fill sees the fill", async () => {
    const signals: unknown[] = [];
    const db = createClient<never>("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (_input, init) => {
      signals.push(init?.signal);
      return Response.json(null);
    } } }) as never;
    await supabasePlanStore(db).load({ parentId: "p1", childId: "c1" });
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });
});

describe("the re-read's rows in the database", () => {
  const client = (answer: (name: string, body: Record<string, unknown>) => Response) => createClient<Database>("https://synthetic.invalid", "synthetic", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => answer(new URL(String(input)).pathname.split("/").at(-1)!, JSON.parse(String(init?.body ?? "{}"))) },
  });
  const row = { child_id: "c", parent_id: "p", customer: "cus_1", kind: "ending", event_at: null };

  it("reads the due rows by the database's clock, with no time from the app", async () => {
    const calls: unknown[] = [];
    const rows = supabasePlanReads(client((name, body) => { calls.push([name, body]); return Response.json([row]); }));
    expect(await rows.duePlanReads(50)).toEqual([{ parentId: "p", childId: "c", customer: "cus_1", kind: "ending", eventAt: null }]);
    expect(calls).toEqual([["due_plan_reads", { p_limit: 50 }]]);
  });

  it("reads the closed kinds too", async () => {
    for (const kind of ["payment_failed", "paused"]) expect(await supabasePlanReads(client(() => Response.json([{ ...row, kind }]))).duePlanReads(1)).toMatchObject([{ kind }]);
  });

  it("refuses a kind the re-read does not look at, and a failed read throws", async () => {
    await expect(supabasePlanReads(client(() => Response.json([{ ...row, kind: "ended" }]))).duePlanReads(1)).rejects.toThrow("unreadable");
    await expect(supabasePlanReads(client(() => Response.json([{ ...row, kind: "not_started" }]))).duePlanReads(1)).rejects.toThrow("unreadable");
    await expect(supabasePlanReads(client(() => Response.json({ message: "down" }, { status: 500 }))).duePlanReads(1)).rejects.toThrow("down");
  });

  it("notes a row, and a failed note throws", async () => {
    const calls: unknown[] = [];
    await supabasePlanReads(client((name, body) => { calls.push([name, body]); return Response.json(null); })).notePlanReadTried("c");
    expect(calls).toEqual([["note_plan_read_tried", { p_child: "c" }]]);
    await expect(supabasePlanReads(client(() => Response.json({ message: "fenced" }, { status: 400 }))).notePlanReadTried("c")).rejects.toThrow("fenced");
  });
});
