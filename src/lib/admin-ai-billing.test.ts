import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountCredits, parseUsage, periodFor, safeKeyLabel } from "@/lib/admin-ai-usage";
import { OPENROUTER_CHECK_MS, OPENROUTER_CREDITS_URL, openRouterBilling, readAiUsage } from "@/lib/admin-ai-usage-store";
import type { AdminSession } from "@/lib/admin-store";

beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const json = (data: unknown) => new Response(JSON.stringify({ data }));
const env = { OPENROUTER_BILLING_API_KEY: "billing-private", OPENROUTER_API_KEY: "main-private", SCAN_MARKING_OPENROUTER_API_KEY: "scan-private", PARENT_EXPLANATION_API_KEY: " main-private " };

describe("independent OpenRouter billing scopes", () => {
  it("keeps account credits, lifetime usage and key month usage distinct; asks one account and each unique server key once", async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.cache).toBe("no-store");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const key = (init?.headers as Record<string, string>).authorization;
      if (url === OPENROUTER_CREDITS_URL) { expect(key).toBe("Bearer billing-private"); return json({ total_credits: 65, total_usage: 64.633038488 }); }
      return json({ usage: 49.2, usage_monthly: key.endsWith("scan-private") ? 2 : 4.28 });
    });
    const out = await openRouterBilling(env, fetch as typeof globalThis.fetch);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(out.account).toMatchObject({ source: "billing", status: "ok", creditsUsd: 65, spentUsd: 64.633038488 });
    expect(out.account.balanceUsd).toBeCloseTo(0.366961512, 8);
    expect(out.month).toMatchObject({ monthUsd: 6.28, asked: 2, answered: 2 });
    expect(JSON.stringify(out)).not.toMatch(/billing-private|main-private|scan-private/);
    expect(out.checkedAt).toMatch(/Z$/);
  });
  it("uses the main key for the account only when the dedicated billing key is absent", async () => {
    const fetch = vi.fn(async () => json({ total_credits: 10, total_usage: 7, usage_monthly: 1 }));
    expect((await openRouterBilling({ OPENROUTER_API_KEY: "main" }, fetch)).account.source).toBe("main");
    const none = await openRouterBilling({}, fetch);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(none.account).toMatchObject({ status: "no-key", spentUsd: null, creditsUsd: null, balanceUsd: null });
    expect(none.month).toBe("no-key");
  });
  it("does not substitute usage or credit for missing fields or coerce unknowns to zero", () => {
    expect(accountCredits({ data: { total_credits: 65, usage: 64 } })).toEqual({ creditsUsd: 65, spentUsd: null, balanceUsd: null });
    for (const raw of [null, {}, { data: { total_usage: "64", total_credits: -2 } }, { data: { total_usage: NaN, total_credits: Infinity } }]) {
      expect(accountCredits(raw)).toEqual({ creditsUsd: null, spentUsd: null, balanceUsd: null });
    }
    expect(accountCredits({ data: { total_usage: 6, total_credits: 5 } }).balanceUsd).toBe(-1);
  });
  it("keeps successful key reads when the account fails, and successful account reads when keys fail", async () => {
    const accountDown = await openRouterBilling(env, (async (url) => url === OPENROUTER_CREDITS_URL ? new Response("private-error", { status: 403 }) : json({ usage_monthly: 4 })) as typeof globalThis.fetch);
    expect(accountDown.account.status).toBe("unavailable");
    expect(accountDown.month).toMatchObject({ monthUsd: 8 });
    const keysDown = await openRouterBilling(env, (async (url) => url === OPENROUTER_CREDITS_URL ? json({ total_usage: 64 }) : Promise.reject(new Error("private-error"))) as typeof globalThis.fetch);
    expect(keysDown.account).toMatchObject({ status: "partial", spentUsd: 64, creditsUsd: null });
    expect(keysDown.month).toBeNull();
    expect(JSON.stringify([accountDown, keysDown])).not.toContain("private-error");
  });
  it("bounds failed provider and body reads and reports the remaining key subtotal as partial", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; });
    const fetch = vi.fn((url: string, init?: RequestInit) => {
      const key = (init?.headers as Record<string, string>).authorization;
      if (key.endsWith("main-private") && url !== OPENROUTER_CREDITS_URL) return Promise.resolve(json({ usage_monthly: 4 }));
      return new Promise<Response>((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("timed out"))));
    });
    const pending = openRouterBilling(env, fetch as typeof globalThis.fetch);
    expect(fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(OPENROUTER_CHECK_MS);
    const out = await pending;
    expect(out.account.status).toBe("unavailable");
    expect(out.month).toMatchObject({ monthUsd: 4, asked: 2, answered: 1 });
  });
});

it("passes selected date bounds and the test filter to the public admin read; failed or empty reads remain unavailable", async () => {
  const rpc = vi.fn(async () => ({ data: { totals: { cost_usd: 2.92 } }, error: null }));
  const admin = { db: { rpc } } as unknown as AdminSession;
  for (const range of ["7d", "30d", "month", "year"] as const) {
    const period = periodFor(range, Date.parse("2026-11-16T20:00:00Z"));
    for (const withTests of [true, false]) {
      expect((await readAiUsage(admin, period, withTests, 1.4)).totals.costUsd).toBe(2.92);
      expect(rpc).toHaveBeenLastCalledWith("admin_ai_usage", expect.objectContaining({ p_from: period.from.toISOString(), p_to: period.to.toISOString(), p_with_tests: withTests, p_day_starts: expect.any(Array) }));
    }
  }
  rpc.mockResolvedValueOnce({ data: null, error: null } as never);
  await expect(readAiUsage(admin, periodFor("7d", Date.now()), true, 1.4)).rejects.toThrow("no totals");
  for (const totals of [{}, { cost_usd: null }, { cost_usd: "bad" }]) {
    rpc.mockResolvedValueOnce({ data: { totals }, error: null } as never);
    await expect(readAiUsage(admin, periodFor("7d", Date.now()), true, 1.4)).rejects.toThrow("no totals");
  }
});

it("retains missing dimension coverage as unknown and permits only safe key labels", () => {
  expect(parseUsage({ totals: {} }).details).toBeNull();
  expect(parseUsage({ totals: {}, dimensions_version: 1, dimensions: [], lifetime_receipts: [] }).lifetimeReceipts).toEqual([]);
  expect(safeKeyLabel("raw-private-key", "raw-private-key")).toBe("unknown");
  const bad = parseUsage({ dimensions_version: 1, dimensions: [{ cost_usd: "bad" }], lifetime_receipts: [{ key_id: "a".repeat(64), cost_usd: "bad" }] });
  expect(bad.details![0].costUsd).toBeNull();
  expect(bad.lifetimeReceipts).toBeNull();
});
