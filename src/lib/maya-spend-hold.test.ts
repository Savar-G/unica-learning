import { describe, expect, it, vi } from "vitest";
import { openRouterClient } from "@/lib/ai-openrouter";
import { callSpend, createSpendLedger, spendConfig, usdToMicros, RESERVE_USD, WEEK_MICROS, type Charge, type SpendCall } from "@/lib/maya-spend";
import { meteredAi } from "@/lib/maya-spend-ai";
import { memorySpendStore } from "@/lib/maya-spend-memory";

// One database request before a Maya turn's model request (Savar, 2026-11-13): the cap's check and the reservation of
// the turn's first model attempt are one call of `reserve_maya_spend` (one transaction under the child's lock), and the
// metered client's first attempt takes that reservation instead of reserving again. Through the ledger's public
// interface on the in-memory store, whose `log` holds one entry per database request.

const P = "11111111-1111-4111-8111-111111111111";
const C = "22222222-2222-4222-8222-222222222222";
const WEEK = "2026-11-02";
const MONTH = "2026-11-01";
const call: SpendCall = { id: "55555555-5555-4555-8555-555555555555", kind: "chat", parentId: P, childId: C };
const other: SpendCall = { ...call, id: "66666666-6666-4666-8666-666666666666" };
const child: Charge = { kind: "child", parentId: P, childId: C };

function setup() {
  const now = Date.parse("2026-11-05T18:00:00Z");
  let n = 0;
  const store = memorySpendStore({ clock: () => now });
  const config = spendConfig({});
  const ledger = createSpendLedger({ store, clock: () => now, config, zone: async () => "America/Vancouver", alert: vi.fn(async () => {}) });
  const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const spend = callSpend(ledger, { clock: () => now, newId });
  const room = usdToMicros(RESERVE_USD.model, config);
  /** The child's week used up to `left` micros of room. */
  const leave = (left: number) => store.spent({ charge: "child", parentId: P, childId: C, week: WEEK, month: MONTH }, WEEK_MICROS - left);
  return { store, config, ledger, newId, spend, room, leave };
}

const answer = (cost: number | null, status = 200) => new Response(JSON.stringify({
  choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ ok: true }) } }],
  ...(cost === null ? {} : { usage: { cost } }),
}), { status });
const streamed = (cost: number) => new Response(new ReadableStream({
  start(c) {
    for (const e of [
      `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify({ ok: true }) } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { cost } })}\n\n`,
      "data: [DONE]\n\n",
    ]) c.enqueue(new TextEncoder().encode(e));
    c.close();
  },
}), { status: 200, headers: { "content-type": "text/event-stream" } });
const request = { name: "t", system: "s", content: [{ type: "text" as const, text: "x" }], schema: {} };
const signal = () => new AbortController().signal;

/** Maya's model client for a call, as the server builds it (src/lib/maya-spend-server.ts `meteredClient`). */
const client = (t: ReturnType<typeof setup>, fetch: typeof globalThis.fetch, over: { call?: SpendCall; safetyRead?: boolean; what?: "model" | "review"; retries?: number } = {}) =>
  meteredAi((hooks) => openRouterClient({ apiKey: "k", model: "m", ...hooks, maxRetries: over.retries ?? 0 }), {
    ledger: t.ledger, charge: child, callId: (over.call ?? call).id, newId: t.newId, safetyRead: over.safetyRead,
  }, over.what ?? "model", fetch);

describe("one request before the model request", () => {
  it("checks the cap and reserves the model attempt in one store request; the request then sends with none", async () => {
    const t = setup();
    const atSend: string[][] = [];
    const fetch = vi.fn(async () => { atSend.push(t.store.log()); return answer(0.02); });
    const held = await t.spend.hold(call);
    expect(held.state).toBe("open");
    expect(t.store.log()).toEqual(["reserve"]);
    await client(t, fetch as typeof globalThis.fetch).json(request, signal());
    // Before the model request: the one reservation of the hold. After it: the settle.
    expect(atSend).toEqual([["reserve"]]);
    const rows = t.store.rows();
    expect(rows).toMatchObject([{ what: "model", callId: call.id, charge: "child", reserved: t.room, cost: usdToMicros(0.02, t.config), settled: true }]);
    // Taken by the request: a release changes nothing and asks the store nothing. (After a settle the ledger reads the
    // month's total for the team's alert, as before.)
    const log = t.store.log();
    expect(log.slice(0, 2)).toEqual(["reserve", "settle"]);
    await held.release();
    expect(t.store.log()).toEqual(log);
    expect(t.store.rows()).toEqual(rows);
  });

  it("at the cap writes no reservation and answers why", async () => {
    const t = setup();
    t.leave(t.room - 1);
    const held = await t.spend.hold(call);
    expect(held.state).toBe("week_used");
    expect(t.store.log()).toEqual(["reserve"]);
    expect(t.store.rows().filter((r) => !r.id.startsWith("spent-"))).toEqual([]);
    await held.release();
    expect(t.store.log()).toEqual(["reserve"]);
  });

  it("answers paused, and never throws, when the store cannot answer", async () => {
    const t = setup();
    t.store.fail(true);
    const held = await t.spend.hold(call);
    expect(held.state).toBe("paused");
    await held.release();
  });

  it("is open with the week's last room, the same as the cap's read", async () => {
    const t = setup();
    t.leave(t.room);
    expect(await t.ledger.state(child)).toBe("open");
    expect((await t.spend.hold(call)).state).toBe("open");
    // The room is now reserved: the read says what the next hold would.
    expect(await t.ledger.state(child)).toBe("week_used");
    expect((await t.spend.hold(other)).state).toBe("week_used");
  });
});

describe("a reservation for every paid request, settled after it", () => {
  it("settles a streamed request's held reservation with the stream's cost", async () => {
    const t = setup();
    const held = await t.spend.hold(call);
    expect(held.state).toBe("open");
    const fetch = vi.fn(async () => streamed(0.0123));
    expect(await client(t, fetch as typeof globalThis.fetch).json({ ...request, onText: () => {} }, signal())).toEqual({ ok: true });
    await vi.waitFor(() => expect(t.store.rows()).toMatchObject([{ what: "model", settled: true, cost: usdToMicros(0.0123, t.config) }]));
    expect(t.store.rows()).toHaveLength(1);
    await held.release();
    expect(t.store.rows()).toHaveLength(1);
  });

  it("reserves a second attempt of the same turn on its own", async () => {
    const t = setup();
    await t.spend.hold(call);
    let n = 0;
    const fetch = vi.fn(async () => (++n === 1 ? answer(0.01, 500) : answer(0.03)));
    await client(t, fetch as typeof globalThis.fetch, { retries: 1 }).json(request, signal());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(t.store.rows()).toMatchObject([
      { what: "model", settled: true, cost: usdToMicros(0.01, t.config) },
      { what: "model", settled: true, cost: usdToMicros(0.03, t.config) },
    ]);
    expect(t.store.log().filter((x) => x === "reserve")).toHaveLength(2);
  });

  it("settles a reservation no request took at nothing, once", async () => {
    const t = setup();
    const held = await t.spend.hold(call);
    await held.release();
    await held.release();
    expect(t.store.rows()).toMatchObject([{ what: "model", reserved: t.room, cost: 0, settled: true }]);
    expect(t.store.log().filter((x) => x !== "used")).toEqual(["reserve", "settle"]);
    // Released: the next request of the call reserves its own.
    await client(t, vi.fn(async () => answer(0.02)) as typeof globalThis.fetch).json(request, signal());
    expect(t.store.rows()).toHaveLength(2);
  });

  it("is taken only by the call's own model request: not a safety read, a review or another call", async () => {
    const t = setup();
    const held = await t.spend.hold(call);
    const fetch = vi.fn(async () => answer(0.01));
    await client(t, fetch as typeof globalThis.fetch, { safetyRead: true }).json(request, signal());
    await client(t, fetch as typeof globalThis.fetch, { what: "review" }).json(request, signal());
    await client(t, fetch as typeof globalThis.fetch, { call: other }).json(request, signal());
    const rows = t.store.rows();
    expect(rows.map((r) => [r.what, r.charge, r.callId, r.settled])).toEqual([
      ["model", "child", call.id, false],
      ["model", "global", call.id, true],
      ["review", "child", call.id, true],
      ["model", "child", other.id, true],
    ]);
    await held.release();
    expect(t.store.rows()[0]).toMatchObject({ settled: true, cost: 0 });
  });

  it("gives an admin test call's hold to its own request, toward the month only", async () => {
    const t = setup();
    const admin: SpendCall = { ...call, kind: "admin_test" };
    t.leave(0);
    expect((await t.spend.hold(admin)).state).toBe("open");
    await meteredAi((hooks) => openRouterClient({ apiKey: "k", model: "m", ...hooks, maxRetries: 0 }), { ledger: t.ledger, charge: { kind: "global", parentId: P, childId: C }, callId: admin.id, newId: t.newId }, "model", vi.fn(async () => answer(0.02)) as typeof globalThis.fetch).json(request, signal());
    expect(t.store.rows().filter((r) => !r.id.startsWith("spent-"))).toMatchObject([{ what: "model", charge: "global", week: null, settled: true, cost: usdToMicros(0.02, t.config) }]);
  });
});

/**
 * The cases `reserve_maya_spend` (migration maya_spend_no_monthly_stop) is written to satisfy, run against its memory
 * mirror (src/lib/maya-spend-memory.ts) through the hold: the check and the write are one step under the child's lock.
 */
describe("the hold's rules, as the database function's", () => {
  const cases: { name: string; left: number | null; kind?: string; state: string; written: boolean }[] = [
    { name: "a week with room for the attempt: reserved", left: null, state: "open", written: true },
    { name: "exactly the attempt's room left: reserved", left: 0, state: "open", written: true },
    { name: "one micro less than the attempt: not reserved", left: -1, state: "week_used", written: false },
    { name: "a week used up: not reserved", left: Number.NEGATIVE_INFINITY, state: "week_used", written: false },
    { name: "an admin test call at a used week: the month only, reserved", left: Number.NEGATIVE_INFINITY, kind: "admin_test", state: "open", written: true },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      const t = setup();
      if (c.left !== null) t.leave(Number.isFinite(c.left) ? t.room + c.left : 0);
      const held = await t.spend.hold({ ...call, kind: c.kind ?? "chat" });
      expect(held.state).toBe(c.state);
      expect(t.store.rows().filter((r) => !r.id.startsWith("spent-"))).toHaveLength(c.written ? 1 : 0);
    });
  }

  it("lets only one of two calls of one child at the cap hold the week's last room", async () => {
    const t = setup();
    t.leave(t.room + 1000);
    const both = await Promise.all([t.spend.hold(call), t.spend.hold(other)]);
    expect(both.map((h) => h.state).sort()).toEqual(["open", "week_used"]);
    const week = t.store.rows().filter((r) => r.charge === "child" && r.week === WEEK).reduce((s, r) => s + (r.cost ?? r.reserved), 0);
    expect(week).toBeLessThanOrEqual(WEEK_MICROS);
    // The open one's request goes; the other's call sends nothing and closes.
    const fetch = vi.fn(async () => answer(0.1));
    const open = both[0].state === "open" ? call : other;
    await client(t, fetch as typeof globalThis.fetch, { call: open }).json(request, signal());
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
