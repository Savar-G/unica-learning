import { describe, expect, it, vi } from "vitest";
import { openRouterClient } from "@/lib/ai-openrouter";
import { callSpend, chargeOf, createSpendLedger, spendConfig, recordLocalSpend, usdToMicros, MICROS_PER_CAD, RESERVATION_TTL_MS, RESERVE_USD, VOICE_BLOCK_MS, VOICE_RENEW_EARLY_MS, WEEK_MICROS, type Charge } from "@/lib/maya-spend";
import { meteredAi, profileAi, SpendRefused } from "@/lib/maya-spend-ai";
import { memorySpendStore } from "@/lib/maya-spend-memory";

// The review of PR #640 through the ledger's public interface: no shared stop at the monthly total, one reservation for
// each provider attempt, one speech-to-text block at a time, reservations that expire, and the profile's AI behind the
// ledger.

const P = "11111111-1111-4111-8111-111111111111";
const C = "22222222-2222-4222-8222-222222222222";
const WEEK = "2026-11-02";
const MONTH = "2026-11-01";
const child: Charge = { kind: "child", parentId: P, childId: C };
const call = { id: "call-1", kind: "chat", parentId: P, childId: C };

function setup(env: Record<string, string> = {}) {
  let now = Date.parse("2026-11-05T18:00:00Z");
  let n = 0;
  const store = memorySpendStore({ clock: () => now });
  const alert = vi.fn(async () => {});
  const config = spendConfig(env);
  const ledger = createSpendLedger({ store, clock: () => now, config, zone: async () => "America/Vancouver", alert });
  const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  return { store, ledger, alert, config, newId, clock: () => now, advance: (ms: number) => { now += ms; } };
}
const answer = (cost: number | null, status = 200) => new Response(JSON.stringify({
  choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ ok: true }) } }],
  ...(cost === null ? {} : { usage: { cost } }),
}), { status });
const request = { name: "t", system: "s", content: [{ type: "text" as const, text: "x" }], schema: {} };
const signal = () => new AbortController().signal;
const used = async (t: ReturnType<typeof setup>) => (await t.ledger.week({ parentId: P, childId: C })).usedMicros;

describe("the monthly total", () => {
  it("emails the team once and stops nobody", async () => {
    const t = setup({ MAYA_MONTHLY_ALERT_CAD: "1" });
    t.store.spent({ charge: "global", parentId: null, childId: null, week: null, month: MONTH }, 5 * MICROS_PER_CAD);
    expect(await t.ledger.state(child)).toBe("open");
    expect(await t.ledger.reserve({ id: t.newId(), charge: child, what: "model", micros: 1000 })).toEqual({ ok: true });
    expect(await t.ledger.reserve({ id: t.newId(), charge: child, what: "model", micros: 1000 })).toEqual({ ok: true });
    expect(t.alert).toHaveBeenCalledTimes(1);
    expect((await t.ledger.week({ parentId: P, childId: C })).state).toBe("open");
  });

  it("never lets a practice run or an admin test touch a child's week or access", async () => {
    const t = setup({ MAYA_MONTHLY_ALERT_CAD: "1" });
    await recordLocalSpend(t.ledger, 500, t.newId());
    await t.ledger.reserve({ id: t.newId(), charge: chargeOf({ kind: "admin_test", parentId: P, childId: C }), what: "model", micros: MICROS_PER_CAD });
    expect(await used(t)).toBe(0);
    expect(await t.ledger.state(child)).toBe("open");
  });

  it("still says the ledger cannot be read, without calling it the monthly total", async () => {
    const t = setup();
    t.store.fail(true);
    expect(await t.ledger.state(child)).toBe("paused");
    expect(t.alert).not.toHaveBeenCalled();
  });
});

describe("a provider attempt", () => {
  const client = (t: ReturnType<typeof setup>, fetch: typeof globalThis.fetch, over: { safetyRead?: boolean } = {}) =>
    meteredAi((hooks) => openRouterClient({ apiKey: "k", model: "m", maxRetries: 1, ...hooks }), { ledger: t.ledger, charge: child, callId: null, newId: t.newId, ...over }, "model", fetch);

  it("reserves each attempt: CAD 0.21 left and two USD 0.14 attempts stay inside the week", async () => {
    const t = setup();
    t.store.spent({ charge: "child", parentId: P, childId: C, week: WEEK, month: MONTH }, WEEK_MICROS - usdToMicros(RESERVE_USD.model, t.config));
    const fetch = vi.fn(async () => answer(0.14, 500));
    await expect(client(t, fetch as typeof globalThis.fetch).json(request, signal())).rejects.toBeInstanceOf(SpendRefused);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await used(t)).toBeLessThanOrEqual(WEEK_MICROS);
  });

  it("keeps a known retry cost when the first attempt's cost is not known", async () => {
    const t = setup();
    let tries = 0;
    const fetch = vi.fn(async () => {
      if (++tries === 1) throw new TypeError("network");
      return answer(0.05);
    });
    expect(await client(t, fetch as typeof globalThis.fetch).json(request, signal())).toEqual({ ok: true });
    expect(t.store.rows().map((r) => [r.cost, r.settled])).toEqual([[null, true], [usdToMicros(0.05, t.config), true]]);
    expect(await used(t)).toBe(usdToMicros(RESERVE_USD.model, t.config) + usdToMicros(0.05, t.config));
  });

  it("settles an attempt that was never sent at nothing", async () => {
    const t = setup();
    const stopped = new AbortController();
    const fetch = vi.fn(async () => answer(0.05));
    const metered = meteredAi((hooks) => openRouterClient({ apiKey: "k", model: "m", ...hooks, onRequest: async () => { await hooks.onRequest(); stopped.abort(); } }), { ledger: t.ledger, charge: child, callId: null, newId: t.newId }, "model", fetch as typeof globalThis.fetch);
    await expect(metered.json(request, stopped.signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(await used(t)).toBe(0);
  });

  it("sends a safety read past the cap and with no ledger, off the child's week", async () => {
    const t = setup();
    t.store.spent({ charge: "child", parentId: P, childId: C, week: WEEK, month: MONTH }, WEEK_MICROS);
    const fetch = vi.fn(async () => answer(0.02));
    expect(await client(t, fetch as typeof globalThis.fetch, { safetyRead: true }).json(request, signal())).toEqual({ ok: true });
    expect(await used(t)).toBe(WEEK_MICROS);
    expect(t.store.rows().at(-1)).toMatchObject({ charge: "global", settled: true, cost: usdToMicros(0.02, t.config) });
    t.store.fail(true);
    expect(await client(t, fetch as typeof globalThis.fetch, { safetyRead: true }).json(request, signal())).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("a reservation left open", () => {
  it("stops counting after its time, so it cannot lock a child out; an unknown cost stays counted", async () => {
    const t = setup();
    await t.ledger.reserve({ id: t.newId(), charge: child, what: "model", micros: WEEK_MICROS });
    expect(await t.ledger.state(child)).toBe("week_used");
    t.advance(RESERVATION_TTL_MS + 1);
    expect(await t.ledger.state(child)).toBe("open");
    const unknown = t.newId();
    await t.ledger.reserve({ id: unknown, charge: child, what: "model", micros: WEEK_MICROS });
    await t.ledger.settle(unknown, null);
    t.advance(RESERVATION_TTL_MS + 1);
    expect(await t.ledger.state(child)).toBe("week_used");
  });
});

describe("the speech-to-text meter", () => {
  const stt = (t: ReturnType<typeof setup>) => t.store.rows().filter((r) => r.what === "speech_to_text");

  it("holds one block when two checks come together, and leaves nothing unsettled", async () => {
    const t = setup();
    const meter = callSpend(t.ledger, { clock: t.clock, newId: t.newId }).voice(call);
    await Promise.all([meter.ensure(), meter.ensure()]);
    expect(stt(t)).toHaveLength(1);
    await meter.stop();
    expect(stt(t).every((r) => r.settled)).toBe(true);
  });

  it("renews before the block ends, and adds nothing after the stop", async () => {
    const t = setup();
    const meter = callSpend(t.ledger, { clock: t.clock, newId: t.newId }).voice(call);
    await meter.ensure();
    t.advance(VOICE_BLOCK_MS - VOICE_RENEW_EARLY_MS);
    await meter.ensure();
    expect(stt(t)).toHaveLength(2);
    expect(stt(t)[0]).toMatchObject({ settled: true });
    await meter.stop();
    await meter.ensure();
    expect(stt(t)).toHaveLength(2);
  });

  it("counts the voice when asked, past the cap", async () => {
    const t = setup();
    t.store.spent({ charge: "child", parentId: P, childId: C, week: WEEK, month: MONTH }, WEEK_MICROS);
    const meter = callSpend(t.ledger, { clock: t.clock, newId: t.newId }).voice(call);
    await meter.spoken("x".repeat(1000));
    expect(t.store.rows().at(-1)).toMatchObject({ what: "voice", cost: usdToMicros(0.03, t.config), settled: true });
  });
});

describe("the profile's AI", () => {
  const make = (fetch: typeof globalThis.fetch) => (hooks: { fetch: typeof globalThis.fetch; onRequest: () => Promise<void> }) => openRouterClient({ apiKey: "k", model: "m", maxRetries: 0, ...hooks, fetch: hooks.fetch ?? fetch });

  it("is counted for the call's child", async () => {
    const t = setup();
    const fetch = vi.fn(async () => answer(0.1));
    const { ai, keepFindings } = await profileAi(t.ledger, call, t.newId, make(fetch as typeof globalThis.fetch), fetch as typeof globalThis.fetch);
    expect(keepFindings).toBe(false);
    await ai!.json(request, signal());
    expect(t.store.rows()).toMatchObject([{ what: "profile", charge: "child", cost: usdToMicros(0.1, t.config), settled: true }]);
  });

  it("makes no request and keeps the earlier findings when the week is used or the ledger cannot be read", async () => {
    const t = setup();
    const fetch = vi.fn(async () => answer(0.1));
    t.store.spent({ charge: "child", parentId: P, childId: C, week: WEEK, month: MONTH }, WEEK_MICROS);
    expect(await profileAi(t.ledger, call, t.newId, make(fetch as typeof globalThis.fetch), fetch as typeof globalThis.fetch)).toEqual({ ai: null, keepFindings: true });
    t.store.fail(true);
    expect(await profileAi(t.ledger, call, t.newId, make(fetch as typeof globalThis.fetch), fetch as typeof globalThis.fetch)).toEqual({ ai: null, keepFindings: true });
    expect(fetch).not.toHaveBeenCalled();
  });
});
