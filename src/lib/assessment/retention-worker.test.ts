import { expect, it } from "vitest";
import { workerConfiguration, runRetentionWorker, withDeletionHeartbeat } from "@/lib/assessment";

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
