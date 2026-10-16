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
    // A test during the subscription does not move the deadline. A free test after the end keeps 12 months from it.
    expect(retentionDecision(former("2026-04-16T12:00:00Z", "2026-04-01T00:00:00Z"), NOW).action).toBe("delete");
    expect(retentionDecision(former("2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"), NOW)).toEqual({ action: "keep", reason: "former_customer" });
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
  expect(workerConfiguration(["--mode", "dry"], { ...env, STRIPE_SECRET_KEY: undefined })).toMatchObject({ kind: "run", mode: "dry" });
  expect(() => workerConfiguration(["--mode", "unsafe"], env)).toThrow("Invalid worker arguments");
});

it("dry mode reads every candidate but performs no claim, cursor, renewal or payment check", async () => {
  const calls: string[] = [];
  const store = {
    async candidates() { calls.push("candidates"); return Array.from({ length: 1007 }, (_, i) => String(i)); },
    async verifyPayments() { calls.push("payments"); }, async cursor() { calls.push("cursor"); return null; },
    async advance() { calls.push("advance"); }, async run() { calls.push("run"); return { state: "deleted" as const, images: 0 }; },
  };
  expect(await runRetentionWorker(workerConfiguration([], env), store, () => 840_000)).toEqual({ ok: true, dry: true, eligible: 1007 });
  expect(calls).toEqual(["candidates"]);
  calls.length = 0;
  expect(await runRetentionWorker({ kind: "disabled" }, store, () => 840_000)).toEqual({ ok: true, disabled: true });
  expect(calls).toEqual([]);
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
