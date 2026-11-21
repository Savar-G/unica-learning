import { describe, expect, it, vi } from "vitest";
import type { FamilyZone } from "@/lib/family-time";
import {
  callSpend,
  childSpendLine,
  createSpendLedger,
  parentSpendLine,
  spendConfig,
  recordLocalSpend,
  usdToMicros,
  MICROS_PER_CAD,
  PAUSED_LINE,
  RESERVE_USD,
  WEEK_MICROS,
  type Charge,
} from "@/lib/maya-spend";
import { meteredAi, SpendRefused } from "@/lib/maya-spend-ai";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { openRouterClient } from "@/lib/ai-openrouter";

// Maya's spending ledger (D-290, D-291) through its public interface on the in-memory store: reservations before each
// paid request, settles with the actual cost, the child's week in family time, the monthly total and its one alert,
// and the parent's and child's words.

const P = "11111111-1111-4111-8111-111111111111";
const C = "22222222-2222-4222-8222-222222222222";
const C2 = "33333333-3333-4333-8333-333333333333";
const CAD = MICROS_PER_CAD;
const child: Charge = { kind: "child", parentId: P, childId: C };

function setup(options: { start?: string; zone?: FamilyZone; env?: Record<string, string> } = {}) {
  let now = Date.parse(options.start ?? "2026-11-05T18:00:00Z");
  let n = 0;
  const store = memorySpendStore();
  const alert = vi.fn(async () => {});
  const config = spendConfig(options.env ?? {});
  const ledger = createSpendLedger({ store, clock: () => now, config, zone: async () => options.zone ?? "America/Vancouver", alert });
  const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  return { store, ledger, alert, config, newId, at: (iso: string) => { now = Date.parse(iso); }, advance: (ms: number) => { now += ms; } };
}

const model = (t: ReturnType<typeof setup>) => usdToMicros(RESERVE_USD.model, t.config);

describe("the configuration", () => {
  it("turns US dollars into CAD at 1.40 by default, and reads the rate and the monthly total from the environment", () => {
    expect(spendConfig({})).toMatchObject({ usdToCad: 1.4, monthlyAlertMicros: 400 * CAD });
    expect(usdToMicros(1, spendConfig({}))).toBe(1.4 * CAD);
    expect(spendConfig({ MAYA_USD_TO_CAD: "1.37", MAYA_MONTHLY_ALERT_CAD: "250" })).toMatchObject({ usdToCad: 1.37, monthlyAlertMicros: 250 * CAD });
    // A value that is not a positive number keeps the default.
    expect(spendConfig({ MAYA_USD_TO_CAD: "zero", MAYA_MONTHLY_ALERT_CAD: "-5" })).toMatchObject({ usdToCad: 1.4, monthlyAlertMicros: 400 * CAD });
  });
});

describe("reservations", () => {
  it("lets only one of two requests sent together take the week's last room", async () => {
    const t = setup();
    // Room for one model request, not two.
    t.store.spent({ charge: "child", parentId: P, childId: C, week: "2026-11-02", month: "2026-11-01" }, WEEK_MICROS - model(t) - 1000);
    const both = await Promise.all([1, 2].map(() => t.ledger.reserve({ id: t.newId(), charge: child, what: "model", micros: model(t) })));
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(both.find((r) => !r.ok)).toEqual({ ok: false, state: "week_used" });
    expect(await t.ledger.state(child)).toBe("week_used");
    // Another child of the family has its own week.
    expect(await t.ledger.state({ kind: "child", parentId: P, childId: C2 })).toBe("open");
  });

  it("emails the team once a month when the total is reached", async () => {
    const t = setup({ env: { MAYA_MONTHLY_ALERT_CAD: "1" } });
    t.store.spent({ charge: "global", parentId: null, childId: null, week: null, month: "2026-11-01" }, CAD);
    await t.ledger.reserve({ id: t.newId(), charge: child, what: "model", micros: model(t) });
    await t.ledger.reserve({ id: t.newId(), charge: child, what: "model", micros: model(t) });
    expect(t.alert).toHaveBeenCalledTimes(1);
    expect(t.alert).toHaveBeenCalledWith("2026-11-01");
    // A new month counts from nothing, with its own alert when it is reached.
    t.at("2026-12-01T08:00:00Z");
    await t.ledger.reserve({ id: t.newId(), charge: child, what: "model", micros: model(t) });
    expect(t.alert).toHaveBeenCalledTimes(1);
    await t.ledger.reserve({ id: t.newId(), charge: child, what: "model", micros: CAD });
    expect(t.alert).toHaveBeenCalledTimes(2);
    expect(t.alert).toHaveBeenLastCalledWith("2026-12-01");
  });

  it("emails the team when a settle carries the month past the alert amount (review 2 of PR #640)", async () => {
    const t = setup();
    t.store.spent({ charge: "global", parentId: null, childId: null, week: null, month: "2026-11-01" }, 399.75 * CAD);
    const id = t.newId();
    // CAD 399.75 and a CAD 0.21 reservation stay under CAD 400.
    await t.ledger.reserve({ id, charge: child, what: "model", micros: model(t) });
    expect(t.alert).not.toHaveBeenCalled();
    // Settled at CAD 0.30: CAD 400.05.
    await t.ledger.settle(id, 0.3 * CAD);
    expect(t.alert).toHaveBeenCalledTimes(1);
    expect(t.alert).toHaveBeenCalledWith("2026-11-01");
  });

  it("checks the reservation's own month when it settles after the month changed (review 3 of PR #640)", async () => {
    const t = setup({ start: "2026-12-01T06:59:00Z" }); // Nov 30, 23:59 in Vancouver (UTC-7 all year)
    t.store.spent({ charge: "global", parentId: null, childId: null, week: null, month: "2026-11-01" }, 399.75 * CAD);
    const id = t.newId();
    await t.ledger.reserve({ id, charge: child, what: "model", micros: model(t) });
    expect(t.alert).not.toHaveBeenCalled();
    t.at("2026-12-01T07:01:00Z"); // December 1, 00:01 in Vancouver
    await t.ledger.settle(id, 0.3 * CAD);
    expect(t.alert).toHaveBeenCalledWith("2026-11-01");
  });

  it("settles a request at a lower actual cost, a higher one, or keeps it reserved when the cost is not known", async () => {
    const t = setup();
    const [low, high, unknown] = [t.newId(), t.newId(), t.newId()];
    for (const id of [low, high, unknown]) expect(await t.ledger.reserve({ id, charge: child, what: "model", micros: model(t) })).toEqual({ ok: true });
    await t.ledger.settleUsd(low, 0.05);
    await t.ledger.settleUsd(high, 0.4);
    await t.ledger.settleUsd(unknown, null);
    // The first settle stays.
    await t.ledger.settleUsd(low, 0);
    const week = await t.ledger.week({ parentId: P, childId: C });
    expect(week.usedMicros).toBe(usdToMicros(0.05, t.config) + usdToMicros(0.4, t.config) + model(t));
    expect(t.store.rows().map((r) => r.cost)).toEqual([0.07 * CAD, 0.56 * CAD, null]);
  });

  it("counts an admin test call only toward the monthly total, never a child's week", async () => {
    const t = setup();
    const r = await t.ledger.reserve({ id: t.newId(), charge: { kind: "global", parentId: P, childId: C }, what: "model", micros: model(t) });
    expect(r).toEqual({ ok: true });
    expect((await t.ledger.week({ parentId: P, childId: C })).usedMicros).toBe(0);
    expect(t.store.rows()).toMatchObject([{ charge: "global", week: null, month: "2026-11-01" }]);
  });

  it("counts a local practice run toward the month's total only, and it stops nobody", async () => {
    const t = setup({ env: { MAYA_MONTHLY_ALERT_CAD: "1" } });
    await recordLocalSpend(t.ledger, 2, t.newId());
    expect(t.store.rows()).toMatchObject([{ charge: "global", childId: null, week: null, cost: 2.8 * CAD }]);
    expect(await t.ledger.state(child)).toBe("open");
    expect((await t.ledger.week({ parentId: P, childId: C })).usedMicros).toBe(0);
  });

  it("refuses new paid work when the ledger cannot be read", async () => {
    const t = setup();
    t.store.fail(true);
    expect(await t.ledger.state(child)).toBe("paused");
    await expect(t.ledger.reserve({ id: t.newId(), charge: child, what: "model", micros: model(t) })).rejects.toThrow();
  });
});

describe("the week in family time", () => {
  it("gives the amount back at Monday 00:00 in the family's own time zone", async () => {
    // Sunday 2026-11-08 23:30 in Vancouver; already Monday 02:30 in Toronto.
    const vancouver = setup({ start: "2026-11-09T06:30:00Z", zone: "America/Vancouver" });
    const toronto = setup({ start: "2026-11-09T06:30:00Z", zone: "America/Toronto" });
    for (const t of [vancouver, toronto]) {
      t.store.spent({ charge: "child", parentId: P, childId: C, week: "2026-11-02", month: "2026-11-01" }, WEEK_MICROS);
    }
    const v = await vancouver.ledger.week({ parentId: P, childId: C });
    expect(v).toMatchObject({ usedMicros: WEEK_MICROS, state: "week_used", notice: true, resetsAt: Date.parse("2026-11-09T07:00:00Z") });
    expect(childSpendLine(v.state, v.resetsAt, v.zone)).toBe("You've used Maya's time for this week. She'll be back on Monday.");
    // Toronto's week of 2026-11-09 has started: nothing used.
    expect(await toronto.ledger.week({ parentId: P, childId: C })).toMatchObject({ usedMicros: 0, state: "open", notice: false });
    vancouver.at("2026-11-09T07:00:00Z");
    expect(await vancouver.ledger.state(child)).toBe("open");
  });
});

describe("the words", () => {
  it("tells the parent at 80% of the week, when it is used up, and when the ledger cannot be read", async () => {
    const t = setup();
    t.store.spent({ charge: "child", parentId: P, childId: C, week: "2026-11-02", month: "2026-11-01" }, 0.79 * WEEK_MICROS);
    expect(parentSpendLine(await t.ledger.week({ parentId: P, childId: C }), "Leah")).toBeNull();
    t.store.spent({ charge: "child", parentId: P, childId: C, week: "2026-11-02", month: "2026-11-01" }, 0.01 * WEEK_MICROS);
    expect(parentSpendLine(await t.ledger.week({ parentId: P, childId: C }), "Leah"))
      .toBe("Leah has used most of Maya's time for this week. It resets on Monday, November 9. There's no extra charge.");
    t.store.spent({ charge: "child", parentId: P, childId: C, week: "2026-11-02", month: "2026-11-01" }, 0.2 * WEEK_MICROS);
    expect(parentSpendLine(await t.ledger.week({ parentId: P, childId: C }), "Leah"))
      .toBe("Maya's weekly time is used up. It resets on Monday, November 9. There's no extra charge.");
    // The state a page shows when the ledger cannot be read (src/lib/maya-chat-server.ts).
    const week = await t.ledger.week({ parentId: P, childId: C });
    expect(parentSpendLine({ ...week, state: "paused" }, "Leah")).toBe(PAUSED_LINE);
    expect(childSpendLine("paused", week.resetsAt, week.zone)).toBe("Maya is taking a short break. There's no extra charge.");
  });
});

describe("a metered AI client", () => {
  /** An OpenRouter answer with this cost; `null`: an answer with no cost. */
  const answer = (cost: number | null) => new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ ok: true }) } }],
    ...(cost === null ? {} : { usage: { cost } }),
  }), { status: 200 });
  const request = { name: "t", system: "s", content: [{ type: "text" as const, text: "x" }], schema: {} };

  function client(t: ReturnType<typeof setup>, fetch: typeof globalThis.fetch) {
    return meteredAi((hooks) => openRouterClient({ apiKey: "k", model: "m", ...hooks, maxRetries: 0 }), { ledger: t.ledger, charge: child, callId: null, newId: t.newId }, "model", fetch);
  }

  it("reserves before the request, asks OpenRouter for the cost, and settles with it", async () => {
    const t = setup();
    const sent: string[] = [];
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      sent.push(String(init?.body));
      expect(t.store.rows()).toMatchObject([{ what: "model", reserved: model(t), settled: false }]);
      return answer(0.02);
    });
    expect(await client(t, fetch as typeof globalThis.fetch).json(request, new AbortController().signal)).toEqual({ ok: true });
    expect(JSON.parse(sent[0]).usage).toEqual({ include: true });
    expect(t.store.rows()).toMatchObject([{ cost: usdToMicros(0.02, t.config), settled: true }]);
  });

  it("sends nothing when the week is used up or the ledger cannot answer", async () => {
    const t = setup();
    const fetch = vi.fn(async () => answer(0.01));
    t.store.spent({ charge: "child", parentId: P, childId: C, week: "2026-11-02", month: "2026-11-01" }, WEEK_MICROS);
    await expect(client(t, fetch as typeof globalThis.fetch).json(request, new AbortController().signal)).rejects.toBeInstanceOf(SpendRefused);
    t.store.fail(true);
    await expect(client(t, fetch as typeof globalThis.fetch).json(request, new AbortController().signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the reservation when the cost is not known: no answer, or an answer with no cost", async () => {
    const t = setup();
    const lost = vi.fn(async () => { throw new TypeError("network"); });
    await expect(client(t, lost as typeof globalThis.fetch).json(request, new AbortController().signal)).rejects.toThrow();
    const silent = vi.fn(async () => answer(null));
    await client(t, silent as typeof globalThis.fetch).json(request, new AbortController().signal);
    expect(t.store.rows()).toMatchObject([{ cost: null, settled: true }, { cost: null, settled: true }]);
    expect((await t.ledger.week({ parentId: P, childId: C })).usedMicros).toBe(2 * model(t));
  });
});

describe("a voice call's meter", () => {
  it("reserves speech-to-text a block ahead, counts the voice of each line, and settles the last block at the time used", async () => {
    const t = setup({ env: { MAYA_STT_USD_PER_MINUTE: "0.01", MAYA_VOICE_USD_PER_1K_CHARS: "0.03" } });
    let elapsed = 0;
    const meter = callSpend(t.ledger, { clock: () => Date.parse("2026-11-05T18:00:00Z") + elapsed, newId: t.newId }).voice({ id: "call-1", kind: "chat", parentId: P, childId: C });
    expect(await meter.ensure()).toBe("open");
    await meter.spoken("x".repeat(1000));
    elapsed = 30_000;
    expect(await meter.ensure()).toBe("open");
    elapsed = 90_000;
    expect(await meter.ensure()).toBe("open");
    elapsed = 100_000;
    await meter.stop();
    const rows = t.store.rows();
    expect(rows.map((r) => [r.what, r.cost])).toEqual([
      ["speech_to_text", usdToMicros(0.015, t.config)],
      ["voice", usdToMicros(0.03, t.config)],
      ["speech_to_text", usdToMicros(0.01 / 6, t.config)],
    ]);
  });

  it("says why when no more speech-to-text fits, and still counts the voice of the closing line", async () => {
    const t = setup();
    t.store.spent({ charge: "child", parentId: P, childId: C, week: "2026-11-02", month: "2026-11-01" }, WEEK_MICROS);
    const meter = callSpend(t.ledger, { clock: () => Date.now(), newId: t.newId }).voice({ id: "call-1", kind: "chat", parentId: P, childId: C });
    expect(await meter.ensure()).toBe("week_used");
    await meter.spoken("That's all our time for this week.");
    // The speech-to-text that runs until the call ends is counted past the cap, settled at the time used (review 2).
    expect(t.store.rows().filter((r) => !r.id.startsWith("spent-")).map((r) => r.what)).toEqual(["speech_to_text", "voice"]);
    expect(await meter.ensure()).toBe("week_used");
    await meter.stop();
    expect(t.store.rows().filter((r) => r.what === "speech_to_text")).toMatchObject([{ settled: true }]);
  });
});
