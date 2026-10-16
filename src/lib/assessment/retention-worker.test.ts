import { describe, expect, it } from "vitest";
import { retentionDecision, workerConfiguration, runRetentionWorker, withDeletionHeartbeat } from "@/lib/assessment";

// The retention rules (#191, spec #181). A customer keeps their data. A former customer is deleted 6 calendar months
// (UTC) after the subscription ends in Stripe. A free-test family (no card ever saved) is deleted 12 calendar months
// after the latest test activity. Without a Stripe answer, the family is kept.
describe("retention rules", () => {
  const LONG_AGO = "2020-01-01T00:00:00Z";
  const NOW = Date.parse("2026-10-16T12:00:00Z");

  it("keeps a customer: a live subscription, or a saved card that waits for the first workbook", () => {
    for (const status of ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]) {
      expect(retentionDecision({ lastTestAt: LONG_AGO, payments: [{ savedCard: true, subscriptions: [{ status, endedAt: null }] }] }, NOW))
        .toEqual({ action: "keep", reason: "customer" });
    }
    expect(retentionDecision({ lastTestAt: LONG_AGO, payments: [{ savedCard: true, subscriptions: [] }] }, NOW))
      .toEqual({ action: "keep", reason: "customer" });
    // One child's subscription ended long ago, and another child's card waits for its first workbook.
    expect(retentionDecision({ lastTestAt: LONG_AGO, payments: [
      { savedCard: true, subscriptions: [{ status: "canceled", endedAt: LONG_AGO }] },
      { savedCard: true, subscriptions: [] },
    ] }, NOW)).toEqual({ action: "keep", reason: "customer" });
  });

  it("deletes a former customer 6 calendar months (UTC) after the latest subscription end in Stripe", () => {
    const former = (endedAt: string, lastTestAt: string | null = LONG_AGO) => ({ lastTestAt, payments: [
      // The card stays on the customer after the subscription ends. It no longer waits for a first workbook.
      { savedCard: true, subscriptions: [{ status: "canceled", endedAt: "2020-06-01T00:00:00Z" }, { status: "canceled", endedAt }] },
      { savedCard: false, subscriptions: [{ status: "incomplete_expired", endedAt: null }] },
    ] });
    expect(retentionDecision(former("2026-04-16T12:00:00Z"), Date.parse("2026-10-16T11:59:59.999Z"))).toEqual({ action: "keep", reason: "former_customer" });
    expect(retentionDecision(former("2026-04-16T12:00:00Z"), Date.parse("2026-10-16T12:00:00Z")))
      .toEqual({ action: "delete", rule: "former_customer", endedAt: "2026-04-16T12:00:00.000Z" });
    // 31 August + 6 months is the last day of February, as Postgres adds an interval in UTC.
    expect(retentionDecision(former("2025-08-31T10:00:00Z"), Date.parse("2026-02-28T09:59:59Z")).action).toBe("keep");
    expect(retentionDecision(former("2025-08-31T10:00:00Z"), Date.parse("2026-02-28T10:00:00Z")).action).toBe("delete");
    expect(retentionDecision(former("2023-08-31T10:00:00Z"), Date.parse("2024-02-29T09:59:59Z")).action).toBe("keep");
    expect(retentionDecision(former("2023-08-31T10:00:00Z"), Date.parse("2024-02-29T10:00:00Z")).action).toBe("delete");
    // Tests before or after the subscription end do not move its six-month deadline.
    expect(retentionDecision(former("2026-04-16T12:00:00Z", "2026-04-01T00:00:00Z"), NOW).action).toBe("delete");
    expect(retentionDecision(former("2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"), Date.parse("2026-06-30T23:59:59.999Z")))
      .toEqual({ action: "keep", reason: "former_customer" });
    expect(retentionDecision(former("2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"), Date.parse("2026-07-01T00:00:00Z")))
      .toEqual({ action: "delete", rule: "former_customer", endedAt: "2026-01-01T00:00:00.000Z" });
    expect(retentionDecision(former("2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"), NOW).action).toBe("delete");
    expect(retentionDecision(former("2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"), Date.parse("2027-03-01T00:00:00Z")).action).toBe("delete");
    expect(retentionDecision(former("2026-04-16T12:00:00Z", null), NOW).action).toBe("delete");
  });

  it("deletes a free-test family 12 calendar months (UTC) after the latest test activity", () => {
    const free = (lastTestAt: string | null) => ({ lastTestAt, payments: [] });
    expect(retentionDecision(free("2025-01-31T09:00:00Z"), Date.parse("2026-01-31T08:59:59Z"))).toEqual({ action: "keep", reason: "free_test" });
    expect(retentionDecision(free("2025-01-31T09:00:00Z"), Date.parse("2026-01-31T09:00:00Z"))).toEqual({ action: "delete", rule: "free_test" });
    // 29 February + 12 months is 28 February.
    expect(retentionDecision(free("2024-02-29T12:00:00Z"), Date.parse("2025-02-28T11:59:59Z")).action).toBe("keep");
    expect(retentionDecision(free("2024-02-29T12:00:00Z"), Date.parse("2025-02-28T12:00:00Z")).action).toBe("delete");
    // A Stripe customer with nothing saved (the parent left the card page), or a subscription that never started.
    expect(retentionDecision({ lastTestAt: LONG_AGO, payments: [{ savedCard: false, subscriptions: [] },
      { savedCard: false, subscriptions: [{ status: "incomplete_expired", endedAt: "2021-01-01T00:00:00Z" }] }] }, NOW)).toEqual({ action: "delete", rule: "free_test" });
    // With no test, there is no test-based deadline.
    expect(retentionDecision(free(null), NOW)).toEqual({ action: "keep", reason: "no_test" });
  });

  it("keeps the family when Stripe did not answer or holds a state the rules do not know", () => {
    const unknown = { action: "unknown" };
    expect(retentionDecision({ lastTestAt: LONG_AGO, payments: "unknown" }, NOW)).toEqual(unknown);
    for (const subscription of [{ status: "canceled", endedAt: null }, { status: "canceled", endedAt: "not a date" }, { status: "suspended", endedAt: null }]) {
      expect(retentionDecision({ lastTestAt: LONG_AGO, payments: [{ savedCard: false, subscriptions: [{ status: "canceled", endedAt: LONG_AGO }, subscription] }] }, NOW)).toEqual(unknown);
    }
    expect(retentionDecision({ lastTestAt: "bad", payments: [] }, NOW)).toEqual(unknown);
    expect(retentionDecision({ lastTestAt: LONG_AGO, payments: [] }, Number.NaN)).toEqual(unknown);
  });
});

// Format-only synthetic values. Only a transport preflight can establish real API authentication.
const env = {
  RETENTION_WORKER_ENABLED: "on",
  SUPABASE_URL: "https://cdjobwsyzndtltzfpyqa.supabase.co",
  SUPABASE_SECRET_KEY: `sb_secret_${"A".repeat(32)}`,
  STRIPE_SECRET_KEY: `rk_live_${"B".repeat(32)}`,
};

it("requires explicit activation and production credentials, and defaults manual execution to dry", () => {
  expect(workerConfiguration([], env)).toMatchObject({ kind: "run", mode: "dry" });
  expect(workerConfiguration(["--help"], {})).toEqual({ kind: "help" });
  expect(workerConfiguration(["--mode", "delete"], { ...env, RETENTION_WORKER_ENABLED: "off" })).toEqual({ kind: "disabled" });
  // The old app setting (removed in #82) has no effect on the worker.
  expect(workerConfiguration(["--mode", "delete"], { ...env, ASSESSMENT_PILOT: "off" })).toMatchObject({ kind: "run", mode: "delete" });
  for (const value of [undefined, "[SENSITIVE]", "sk_test_test", "rk_live_placeholder", "pk_live_publishable", `sk_live_${"B".repeat(32)}`]) {
    expect(() => workerConfiguration(["--mode", "delete"], { ...env, STRIPE_SECRET_KEY: value })).toThrow("Worker credentials unavailable");
  }
  for (const value of [undefined, "[SENSITIVE]", "sb_publishable_key", "sb_secret_placeholder"]) {
    expect(() => workerConfiguration(["--mode", "delete"], { ...env, SUPABASE_SECRET_KEY: value })).toThrow("Worker credentials unavailable");
  }
  expect(() => workerConfiguration(["--mode", "delete"], { ...env, SUPABASE_URL: "https://foreign.supabase.co" })).toThrow("Worker credentials unavailable");
  // Dry mode reads Stripe only with a valid restricted live key. Without one, families with Stripe history are unknown.
  expect(workerConfiguration(["--mode", "dry"], { ...env, STRIPE_SECRET_KEY: undefined })).toEqual(expect.objectContaining({ kind: "run", mode: "dry", stripeKey: undefined }));
  expect(workerConfiguration(["--mode", "dry"], env)).toMatchObject({ kind: "run", mode: "dry", stripeKey: env.STRIPE_SECRET_KEY });
  expect(() => workerConfiguration(["--mode", "dry"], { ...env, STRIPE_SECRET_KEY: `sk_live_${"B".repeat(32)}` })).toThrow("Worker credentials unavailable");
  expect(() => workerConfiguration(["--mode", "unsafe"], env)).toThrow("Invalid worker arguments");
});

describe("retention run", () => {
  const NOW = Date.parse("2026-10-16T12:00:00Z");
  const OLD = "2024-01-01T00:00:00Z";
  // Ids sort in the order the database pages them.
  const families = [
    { id: "a-request", queued: true, lastTestAt: null, cards: [] },
    { id: "b-free-test", queued: false, lastTestAt: OLD, cards: [] },
    { id: "c-former", queued: false, lastTestAt: OLD, cards: [{ customer: "cus_former", saved: true }] },
    { id: "d-customer", queued: false, lastTestAt: OLD, cards: [{ customer: "cus_paying", saved: true }] },
    { id: "e-waiting", queued: false, lastTestAt: OLD, cards: [{ customer: "cus_waiting", saved: true }] },
    { id: "f-recent-end", queued: false, lastTestAt: OLD, cards: [{ customer: "cus_recent", saved: true }] },
    { id: "g-stripe-down", queued: false, lastTestAt: OLD, cards: [{ customer: "cus_down", saved: false }] },
    { id: "h-no-test", queued: false, lastTestAt: null, cards: [{ customer: "cus_left_page", saved: false }] },
  ];
  const stripe: Record<string, { savedCard: boolean; subscriptions: { status: string; endedAt: string | null }[] }> = {
    cus_former: { savedCard: true, subscriptions: [{ status: "canceled", endedAt: "2026-03-01T00:00:00Z" }] },
    cus_paying: { savedCard: true, subscriptions: [{ status: "active", endedAt: null }] },
    cus_waiting: { savedCard: true, subscriptions: [] },
    cus_recent: { savedCard: true, subscriptions: [{ status: "canceled", endedAt: "2026-09-01T00:00:00Z" }] },
    cus_left_page: { savedCard: false, subscriptions: [] },
  };
  function store() {
    const calls: string[] = [];
    const runs: { id: string; endedAt: string | null }[] = [];
    let cursor: string | null = null;
    return { calls, runs, store: {
      async candidates() { calls.push("candidates"); return families.map((f) => ({ ...f, cards: [...f.cards] })); },
      async verifyPayments() { calls.push("verify"); },
      async customerPayments(customer: string) { calls.push(`stripe:${customer}`); if (!stripe[customer]) throw Error("Stripe unavailable"); return stripe[customer]; },
      async cursor() { calls.push("cursor"); return cursor; },
      async advance(id: string) { calls.push("advance"); cursor = id; },
      async run(id: string, _limit: number, claim: { endedAt: string | null }) { calls.push("run"); runs.push({ id, endedAt: claim.endedAt }); return { state: "deleted" as const, images: 0 }; },
    } };
  }
  const decisions = { queued: 1, delete_free_test: 1, delete_former_customer: 1, keep_customer: 2, keep_former_customer: 1, keep_free_test: 0, keep_no_test: 1, unknown: 1 };

  it("dry mode shows the decision for every family, reads Stripe only, and claims nothing", async () => {
    const s = store();
    expect(await runRetentionWorker(workerConfiguration([], env), s.store, () => 840_000, NOW))
      .toEqual({ ok: false, dry: true, eligible: 3, deferred: 0, ...decisions });
    expect(s.calls.filter((c) => !c.startsWith("stripe:"))).toEqual(["verify", "candidates"]);
    expect(s.runs).toEqual([]);
    // Without a Stripe key, no Stripe read runs, and every family with Stripe history is unknown, so it stays.
    const keyless = store();
    expect(await runRetentionWorker(workerConfiguration([], { ...env, STRIPE_SECRET_KEY: undefined }), keyless.store, () => 840_000, NOW))
      .toMatchObject({ ok: false, dry: true, eligible: 2, queued: 1, delete_free_test: 1, delete_former_customer: 0, unknown: 6 });
    expect(keyless.calls).toEqual(["candidates"]);
  });

  it("delete mode claims only the families the rules delete, with the Stripe end date", async () => {
    const s = store();
    expect(await runRetentionWorker(workerConfiguration(["--mode", "delete"], env), s.store, () => 840_000, NOW))
      .toEqual({ ok: false, eligible: 3, deleted: 3, busy: 0, excluded: 0, failed: 0, images: 0, deferred: 0, ...decisions });
    expect(s.runs).toEqual([
      { id: "a-request", endedAt: null },
      { id: "b-free-test", endedAt: null },
      { id: "c-former", endedAt: "2026-03-01T00:00:00.000Z" },
    ]);
    expect(s.calls[0]).toBe("verify");
  });

  it("retries queued work within each budget despite slow unrelated Stripe reads", async () => {
    const s = store();
    const queued = { id: "z-request", queued: true, lastTestAt: null, cards: [] };
    const unrelated = Array.from({ length: 29 }, (_, i) => ({
      id: `a-${String(i).padStart(2, "0")}`, queued: false, lastTestAt: OLD,
      cards: [{ customer: `cus_slow_${i}`, saved: true }],
    }));
    s.store.candidates = async () => [...unrelated, queued];
    let remaining = 0, attempts = 0;
    s.store.customerPayments = async () => {
      remaining -= 29_000;
      return stripe.cus_paying;
    };
    s.store.run = async (id, limitMs) => {
      expect(id).toBe("z-request");
      expect(limitMs).toBeGreaterThanOrEqual(600_000);
      attempts++;
      remaining -= 600_000;
      throw Error("Incomplete request, retry next run");
    };
    for (let attempt = 1; attempt <= 3; attempt++) {
      remaining = 840_000;
      expect(await runRetentionWorker(workerConfiguration(["--mode", "delete"], env), s.store, () => remaining, NOW))
        .toMatchObject({ ok: false, eligible: 1, queued: 1, failed: 1 });
      expect(attempts).toBe(attempt);
      expect(remaining).toBeGreaterThanOrEqual(0);
    }
  });

  it("resumes bounded read-only decisions after the saved cursor and reaches a later former customer", async () => {
    const s = store();
    const candidates = Array.from({ length: 30 }, (_, i) => ({
      id: `family-${String(i).padStart(2, "0")}`, queued: false, lastTestAt: OLD,
      cards: [{ customer: i === 29 ? "cus_former" : `cus_slow_${i}`, saved: true }],
    }));
    s.store.candidates = async () => candidates;
    let remaining = 0;
    const read: string[] = [];
    s.store.customerPayments = async (customer) => {
      read.push(customer);
      remaining -= 29_000;
      return customer === "cus_former" ? stripe.cus_former : stripe.cus_paying;
    };
    for (let attempt = 0; attempt < 4 && !s.runs.length; attempt++) {
      remaining = 840_000;
      const result = await runRetentionWorker(workerConfiguration(["--mode", "delete"], env), s.store, () => remaining, NOW);
      expect(remaining).toBeGreaterThanOrEqual(0);
      expect(result).toMatchObject({ ok: false, deferred: expect.any(Number) });
    }
    expect(s.runs).toEqual([{ id: "family-29", endedAt: "2026-03-01T00:00:00.000Z" }]);
    expect(read.slice(0, 30)).toEqual(candidates.map((f) => f.cards[0].customer));
  });

  it("rotates queued retries when one slow attempt uses the reserved budget", async () => {
    const s = store();
    s.store.candidates = async () => ["a", "b", "c"].map((id) => ({ id, queued: true, lastTestAt: null, cards: [] }));
    let remaining = 0;
    const attempted: string[] = [];
    s.store.run = async (id, limitMs) => {
      attempted.push(id);
      remaining -= limitMs;
      throw Error("Retry required");
    };
    for (let run = 0; run < 3; run++) {
      remaining = 840_000;
      expect(await runRetentionWorker(workerConfiguration(["--mode", "delete"], env), s.store, () => remaining, NOW))
        .toMatchObject({ ok: false, failed: 1, deferred: 2 });
    }
    expect(attempted).toEqual(["a", "b", "c"]);
  });

  it("does not read or claim a candidate if cursor persistence uses the remaining budget", async () => {
    const s = store();
    let remaining = 1_000;
    s.store.advance = async () => { remaining = 0; };
    expect(await runRetentionWorker(workerConfiguration(["--mode", "delete"], env), s.store, () => remaining, NOW))
      .toMatchObject({ ok: false, eligible: 0, deferred: 8, deleted: 0 });
    expect(s.runs).toEqual([]);
    expect(s.calls.filter((call) => call.startsWith("stripe:"))).toEqual([]);
  });

  it("reports a partial dry scan without changing the cursor or claiming a family", async () => {
    const s = store();
    s.store.candidates = async () => families.filter((f) => ["d-customer", "e-waiting"].includes(f.id));
    let remaining = 29_000;
    s.store.customerPayments = async () => { remaining = 0; return stripe.cus_paying; };
    expect(await runRetentionWorker(workerConfiguration([], env), s.store, () => remaining, NOW))
      .toMatchObject({ ok: false, dry: true, eligible: 0, keep_customer: 1, deferred: 1 });
    expect(s.calls).toEqual(["verify"]);
    expect(s.runs).toEqual([]);
  });

  it("disabled mode does nothing", async () => {
    const s = store();
    expect(await runRetentionWorker({ kind: "disabled" }, s.store, () => 840_000, NOW)).toEqual({ ok: true, disabled: true });
    expect(s.calls).toEqual([]);
  });
});

it.each(["false", "failed"])("%s renewal aborts work and awaits the started remote operation", async failure => {
  let pulse!: () => void, release!: () => void;
  const work = new AbortController();
  let finished = false, renews = 0;
  const result = withDeletionHeartbeat({
    wait: signal => new Promise<void>((resolve, reject) => { pulse = resolve; signal.addEventListener("abort", () => reject(Error("stopped")), { once: true }); }),
    async renew() { renews++; if (failure === "failed") throw Error("RPC lost"); return false; },
    abort() { work.abort(); },
  }, async () => { await new Promise<void>(resolve => { release = resolve; }); work.signal.throwIfAborted(); return "done"; }).finally(() => { finished = true; });
  const rejected = expect(result).rejects.toThrow();
  pulse(); for (let i = 0; i < 5; i++) await Promise.resolve();
  expect(work.signal.aborted).toBe(true); expect(finished).toBe(false); expect(renews).toBe(1);
  release(); await rejected;
});

it("stops its heartbeat and awaits an in-flight renewal before returning", async () => {
  let pulse!: () => void, settleRenew!: (value: boolean) => void, finishAction!: () => void;
  let finished = false, aborted = false;
  const result = withDeletionHeartbeat({
    wait: signal => new Promise<void>((resolve, reject) => { pulse = resolve; signal.addEventListener("abort", () => reject(Error("stopped")), { once: true }); }),
    renew: () => new Promise<boolean>(resolve => { settleRenew = resolve; }),
    abort() { aborted = true; },
  }, () => new Promise<string>(resolve => { finishAction = () => resolve("completed"); })).then(r => { finished = true; return r; });
  pulse(); for (let i = 0; i < 3; i++) await Promise.resolve();
  finishAction(); for (let i = 0; i < 3; i++) await Promise.resolve();
  expect(finished).toBe(false);
  settleRenew(false); expect(await result).toBe("completed"); expect(aborted).toBe(false);
});

it("keeps booking customers before the freeze and keeps unresolved bookings unknown", async () => {
  const cards = [{ customer: null, saved: false, booking: { email: "parent@example.invalid", ref: "booking_ref" } }];
  for (const payments of [
    { savedCard: true, subscriptions: [] },
    { savedCard: false, subscriptions: [{ status: "active", endedAt: null }] },
  ]) {
    const result = await runRetentionWorker(workerConfiguration([], env), {
      async candidates() { return [{ id: "booking_parent", queued: false, cards, lastTestAt: "2020-01-01T00:00:00Z" }]; },
      async bookingCustomers() { return ["booking_customer"]; },
      async customerPayments(customer) { expect(customer).toBe("booking_customer"); return payments; },
      async verifyPayments() {}, async cursor() { throw Error("dry cursor"); }, async advance() { throw Error("dry write"); }, async run() { throw Error("customer must not be claimed"); },
    }, () => 840_000, Date.parse("2026-10-16T00:00:00Z"));
    expect(result).toMatchObject({ ok: true, keep_customer: 1, eligible: 0, unknown: 0 });
  }
});

it("does not claim unresolved booking families or resolve them without a Stripe key", async () => {
  for (const missingKey of [false, true]) {
    for (const link of [null, { email: "parent@example.invalid", ref: "booking_ref" }]) {
      const result = await runRetentionWorker(workerConfiguration([], { ...env, STRIPE_SECRET_KEY: missingKey ? undefined : env.STRIPE_SECRET_KEY }), {
        async candidates() { return [{ id: "booking_parent", queued: false, cards: [{ customer: null, saved: false, booking: link }], lastTestAt: "2020-01-01T00:00:00Z" }]; },
        async bookingCustomers() { if (missingKey) throw Error("keyless read"); return []; },
        async customerPayments() { throw Error("unresolved customer read"); },
        async verifyPayments() {}, async cursor() { return null; }, async advance() { throw Error("dry write"); }, async run() { throw Error("unknown claim"); },
      }, () => 840_000, Date.parse("2026-10-16T00:00:00Z"));
      expect(result).toMatchObject({ ok: false, unknown: 1, eligible: 0, delete_free_test: 0 });
    }
  }
});
