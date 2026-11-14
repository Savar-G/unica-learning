import { describe, expect, it, vi } from "vitest";
import { initializeLogger } from "@livekit/agents";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { mayaCalls, type CallSeams, type VoiceCall } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { requestContext, withRequestContext } from "@/lib/maya-request-trace";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { callSpend, createSpendLedger, spendConfig } from "@/lib/maya-spend";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { VoiceCallRun, voiceSession } from "./agent";
import { makeProviders } from "./providers";
import { voiceProviders } from "@/lib/maya-voice";
import { CallTelemetry, LIMITS, setTelemetry, type Emitted } from "./telemetry";

vi.mock("server-only", () => ({}));
initializeLogger({ pretty: false, level: "silent" });

// The worker's consumer of the controller's preparation decisions (VoiceCall.onPreparation), through public interfaces:
// the real openVoice call (its prepareModel, shared diagnostic-handle getter and onPreparation), VoiceCallRun's
// registration, and CallTelemetry's records. `used` is the controller's SELECTION, never validator acceptance, and a
// turn with no decision stays `unreported`.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const PKG = { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook" as const, workbookId: "44444444-4444-4444-8444-444444444444", page: 1, question: 1 } };
const good = () => reply("Let's look at the ones. What is 12 minus 8?", "guide", { step: "ones", level: 2 });

function registry() {
  const events: Emitted[] = [];
  let at = 5_000;
  const t = new CallTelemetry({ callId: "c1", scopeId: "job", now: () => (at += 10), sink: (e) => events.push(e) });
  const of = <K extends Emitted["ev"]>(ev: K) => events.filter((e) => e.ev === ev) as Extract<Emitted, { ev: K }>[];
  return { t, events, of };
}

/** One real voice call whose prepared factory model sends a physical request through the registry's fetch. */
async function realCall(t: CallTelemetry, wrap: (c: VoiceCall) => VoiceCall = (c) => c) {
  const now = Date.parse("2026-11-14T18:00:00Z");
  let n = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const store = memoryCallStore({ testFamilies: [PARENT], clock: () => now });
  const ledger = createSpendLedger({ store: memorySpendStore({ clock: () => now }), config: spendConfig({}), clock: () => now, zone: async () => "America/Vancouver" });
  const inner = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
  const physical = t.fetch(inner);
  const seams: CallSeams = {
    store, connections: memoryConnectionLog(store, () => now), history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }] })),
    rebuild: async () => true,
    // As the real prepared client does (src/lib/maya-prepared-ai.ts): the request's own context carries the factory's handle id.
    model: (_id, _call, how) => {
      const id = how?.prepared?.diagnosticHandleId;
      return conversationalFake({ answer: async () => {
        const source = requestContext().source;
        await withRequestContext(id ? { ...(source ? { source } : {}), turnId: null, diagnosticHandleId: id } : {}, () => physical("https://openrouter.ai/api/v1/chat", { method: "POST" }));
        return good();
      } });
    },
    reviewer: () => fakeTalkReviewer(),
    isTestFamily: async () => true, canChat: async () => true,
    alerts: { send: async () => {}, list: async () => [] },
    spend: callSpend(ledger, { clock: () => now, newId }), clock: () => now, newId, seed: () => 42,
  };
  const calls = mayaCalls(seams);
  const started = await calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Ava", package: PKG, startedBy: "admin-1" });
  if (!started.ok) throw new Error(started.error);
  const opened = await calls.openVoice(started.view.id, { speechToText: "fake", voice: "fake" }, "Ava");
  if (!opened.ok) throw new Error(opened.error);
  await opened.call.start();
  const providers = await makeProviders((() => { const c = voiceProviders({}); if (!c.ok) throw new Error("fake"); return c; })(), { fakeMsPerChar: 1 });
  const session = voiceSession(providers, { endpointingMs: 20, aecWarmupDuration: 0 });
  const call = wrap(opened.call);
  const run = new VoiceCallRun(session, call, { notify: () => {} });
  return { call: opened.call, run, store };
}

/** A hint the way the worker gives it: its own source and hint id, no turn yet. */
const hint = (t: CallTelemetry, call: VoiceCall, text: string, source: "prepared_interim" | "prepared_expected" = "prepared_interim") =>
  withRequestContext({ source, turnId: null, prepareId: t.reserveHint() }, () => call.prepare({ text, reason: "interim" }));

describe("the real call, the shared handle getter and the registered consumer", () => {
  it("joins a selected prepared request to its decision by the exact handle, and the child's turn to the decision, not the request", async () => {
    const r = registry();
    setTelemetry(r.t);
    const c = await realCall(r.t);
    expect(hint(r.t, c.call, "6")).toBe(true);
    // Immediate child turn, no delay: the prepared request is already under way with its handle.
    const turnId = r.t.turn([r.t.final({ at: 5_000 })]);
    await r.t.runInTurn(turnId, () => c.call.child("6"));
    await c.call.end({ reason: "child_stopped" });
    await c.call.settled();
    const request = r.of("request").find((e) => e.source === "prepared_interim")!;
    expect(request).toMatchObject({ binding: "unbound", turnId: null });
    expect(request.handleId).toMatch(/#h\d+$/);
    const used = r.of("preparation_decision").find((d) => d.status === "used")!;
    expect(used).toMatchObject({ kind: "interim", handleId: request.handleId, requestId: request.requestId, binding: "exact", turnId });
    expect(used.usd).toBeNull();
    // The decision joins the turn's view with its exact request and marks, while the request keeps its own clock.
    const view = r.t.turnClock(turnId) as { preparationSelection: string; preparations: { id: string; requestId: string | null; request?: { source: string } }[]; requests: unknown[] };
    expect(view.preparationSelection).toBe("reported");
    expect(view.preparations).toContainEqual(expect.objectContaining({ id: used.decisionId, requestId: request.requestId, request: expect.objectContaining({ source: "prepared_interim" }) }));
    // A decision whose request never reached the registry stays unresolved, with no request invented for it.
    for (const p of view.preparations.filter((x) => x.id !== used.decisionId)) expect(p).toMatchObject({ requestId: null });
    // The end's discards are outside a turn: null turn, still linked by their exact handle when known.
    // A discard made while a child turn runs belongs to that turn; one at the end of the call has none.
    const discards = r.of("preparation_decision").filter((x) => x.status === "discarded");
    expect(discards.length).toBeGreaterThan(0);
    for (const d of discards) {
      expect(d.reason).toMatch(/^(key|text|not_plain|stale|ended)$/);
      expect(d.turnId).toBe(d.reason === "ended" ? null : turnId);
    }
    // Never read as acceptance: no field says so.
    expect(JSON.stringify(r.events)).not.toMatch(/accept/i);
  });

  it("keeps the same words, trace and records with the log on, throwing, or the setter missing or failing", async () => {
    const outcome = async (mode: "on" | "sink-throws" | "no-setter" | "setter-throws") => {
      const r = registry();
      const t = mode === "sink-throws" ? new CallTelemetry({ scopeId: "job", sink: () => { throw new Error("sink"); } }) : r.t;
      setTelemetry(t);
      const wrap = (call: VoiceCall): VoiceCall => mode === "no-setter" || mode === "setter-throws"
        ? new Proxy(call, { get: (target, key, rx) => key === "onPreparation" ? (mode === "no-setter" ? undefined : () => { throw new Error("setter"); }) : Reflect.get(target, key, rx) })
        : call;
      const c = await realCall(t, wrap);
      hint(t, c.call, "6");
      await c.call.child("6");
      await c.call.end({ reason: "child_stopped" });
      await c.call.settled();
      const row = c.store.rows()[0];
      return { turns: JSON.stringify(row.trace?.turns.map((x) => ("output" in x ? x.output : null))), prep: row.trace?.preparations?.map(({ kind, status, reason, leadMs }) => ({ kind, status, reason, leadMs })), decisions: mode === "on" ? r.of("preparation_decision").length : null };
    };
    const base = await outcome("on");
    expect(base.decisions).toBeGreaterThan(0);
    for (const mode of ["sink-throws", "no-setter", "setter-throws"] as const) {
      const other = await outcome(mode);
      expect(other.turns).toEqual(base.turns);
      expect(other.prep).toEqual(base.prep);
    }
  });

  it("logs a late decision only in the registry the run captured, never a replacement call's", async () => {
    const a = registry();
    setTelemetry(a.t);
    const c = await realCall(a.t);
    const b = registry();
    setTelemetry(b.t);
    hint(a.t, c.call, "6");
    await c.call.end({ reason: "child_stopped" });
    await c.call.settled();
    expect(a.of("preparation_decision").some((d) => d.status === "discarded" && d.reason === "ended")).toBe(true);
    expect(b.of("preparation_decision")).toEqual([]);
  });

  it("leaves selection unreported for a call with no setter", async () => {
    const r = registry();
    setTelemetry(r.t);
    const c = await realCall(r.t, (call) => new Proxy(call, { get: (t, k, rx) => k === "onPreparation" ? undefined : Reflect.get(t, k, rx) }));
    const turnId = r.t.turn([r.t.final({ at: 5_000 })]);
    await r.t.runInTurn(turnId, () => c.call.child("6"));
    await c.call.end({ reason: "child_stopped" });
    expect((r.t.turnClock(turnId) as { preparationSelection: string }).preparationSelection).toBe("unreported");
    expect(r.of("preparation_decision")).toEqual([]);
  });
});

describe("decisions, through the registry's public interface", () => {
  const rec = (over: Record<string, unknown> = {}) => ({ kind: "interim", leadMs: 120, status: "used", ...over });
  const physical = async (t: CallTelemetry, handle: string | null, source: "prepared_interim" | "prepared_expected" | "model" | "review" = "prepared_interim") => {
    await withRequestContext({ source, turnId: null, diagnosticHandleId: handle }, () => t.fetch((async () => new Response("{}", { status: 200 })) as unknown as typeof fetch)("https://openrouter.ai/x", { method: "POST" }));
  };

  it("reports selected interim and expected and each closed discard reason, with exact lead", () => {
    const r = registry();
    for (const [kind, status, reason] of [["interim", "used", undefined], ["expected", "used", undefined], ["interim", "discarded", "key"], ["interim", "discarded", "text"], ["expected", "discarded", "stale"], ["expected", "discarded", "ended"], ["interim", "discarded", "not_plain"]] as const) {
      r.t.preparationDecision(rec({ kind, status, ...(reason ? { reason } : {}), leadMs: 77 }));
    }
    const d = r.of("preparation_decision");
    expect(d.map((x) => [x.kind, x.status, x.reason, x.leadMs])).toEqual([["interim", "used", null, 77], ["expected", "used", null, 77], ["interim", "discarded", "key", 77], ["interim", "discarded", "text", 77], ["expected", "discarded", "stale", 77], ["expected", "discarded", "ended", 77], ["interim", "discarded", "not_plain", 77]]);
    expect(new Set(d.map((x) => x.decisionId)).size).toBe(7);
  });

  it("drops malformed records and never copies other fields, text or malformed ids into the log", () => {
    const r = registry();
    expect(r.t.preparationDecision(rec({ kind: "text" }))).toBeNull();
    expect(r.t.preparationDecision(rec({ status: "accepted" }))).toBeNull();
    expect(r.t.preparationDecision(rec({ leadMs: -1 }))).toBeNull();
    expect(r.t.preparationDecision(rec({ leadMs: Number.NaN }))).toBeNull();
    expect(r.t.preparationDecision(null)).toBeNull();
    r.t.preparationDecision(rec({ reason: "my secret words", diagnosticHandleId: "sk-secret words here", text: "the child said 6", url: "https://x.test/?k=1", error: "provider boom", name: "Ava", usd: Number.NaN }));
    const [d] = r.of("preparation_decision");
    expect(d).toMatchObject({ reason: null, handleId: null, binding: "none", usd: null });
    expect(Object.keys(d).sort()).toEqual(["at", "binding", "callId", "decisionId", "estimated", "ev", "handleId", "kind", "leadMs", "reason", "requestId", "seq", "status", "turnId", "usd", "v"]);
    expect(JSON.stringify(r.events)).not.toMatch(/secret|child said|x\.test|boom|Ava/);
  });

  it("keeps an absent cost null and a stated zero zero, and states estimated only when explicit", () => {
    const r = registry();
    r.t.preparationDecision(rec());
    r.t.preparationDecision(rec({ usd: 0 }));
    r.t.preparationDecision(rec({ usd: 0.002, estimated: true }));
    expect(r.of("preparation_decision").map((d) => [d.usd, d.estimated])).toEqual([[null, null], [0, null], [0.002, true]]);
  });

  it("matches only by the exact handle: ordinary requests, unseen ids and no id stay unbound", async () => {
    const r = registry();
    await physical(r.t, "job#h1", "model");
    await physical(r.t, "job#h1", "review");
    await physical(r.t, "job#h2", "prepared_expected");
    r.t.preparationDecision(rec({ diagnosticHandleId: "job#h1" }));
    r.t.preparationDecision(rec({ diagnosticHandleId: "job#h9" }));
    r.t.preparationDecision(rec());
    const d = r.of("preparation_decision");
    expect(d.map((x) => [x.binding, x.requestId])).toEqual([["unresolved", null], ["unresolved", null], ["none", null]]);
    // The one prepared request was never chosen by latest, time or kind.
    expect(r.of("preparation_binding")).toEqual([]);
  });

  it("holds a decision that came before its request, then adds one exact binding when that request appears", async () => {
    const r = registry();
    r.t.preparationDecision(rec({ status: "discarded", reason: "stale", diagnosticHandleId: "job#h3" }));
    await physical(r.t, "job#h4");
    expect(r.of("preparation_binding")).toEqual([]);
    await physical(r.t, "job#h3", "prepared_expected");
    const request = r.of("request").find((e) => e.handleId === "job#h3")!;
    expect(r.of("preparation_binding")).toEqual([expect.objectContaining({ requestId: request.requestId, binding: "exact" })]);
    // The request's own record stays unbound and unchanged.
    expect(request).toMatchObject({ binding: "unbound", turnId: null });
  });

  it("leaves an ambiguous handle unknown, also when a second request with the id appears after an exact join", async () => {
    const r = registry();
    await physical(r.t, "job#h5");
    await physical(r.t, "job#h5");
    r.t.preparationDecision(rec({ diagnosticHandleId: "job#h5" }));
    expect(r.of("preparation_decision")[0]).toMatchObject({ binding: "ambiguous", requestId: null });
    await physical(r.t, "job#h6");
    r.t.preparationDecision(rec({ diagnosticHandleId: "job#h6" }));
    expect(r.of("preparation_decision")[1]).toMatchObject({ binding: "exact" });
    await physical(r.t, "job#h6");
    expect(r.of("preparation_binding")).toEqual([expect.objectContaining({ requestId: null, binding: "ambiguous" })]);
  });

  it("takes the turn only from the async context, and a foreign or missing turn stays null", () => {
    const r = registry();
    const turnId = r.t.turn([r.t.final({ at: 5_000 })]);
    r.t.runInTurn(turnId, () => r.t.preparationDecision(rec()));
    withRequestContext({ turnId: "other-job:t9" }, () => r.t.preparationDecision(rec()));
    r.t.preparationDecision(rec());
    expect(r.of("preparation_decision").map((d) => d.turnId)).toEqual([turnId, null, null]);
    // A turn with no decision is unreported, never "none".
    const quiet = r.t.turn([r.t.final({ at: 5_100 })]);
    expect((r.t.turnClock(quiet) as { preparationSelection: string; preparations: unknown[] }).preparationSelection).toBe("unreported");
  });

  it("is bounded: the kept decisions, and the log's own event limit", () => {
    const r = registry();
    for (let i = 0; i < LIMITS.decisions + 10; i++) r.t.preparationDecision(rec({ diagnosticHandleId: `job#h${i + 1}` }));
    expect(r.of("preparation_decision")).toHaveLength(LIMITS.decisions + 10);
    const small = registry();
    for (let i = 0; i < LIMITS.events + 5; i++) small.t.preparationDecision(rec());
    expect(small.events.length).toBeLessThanOrEqual(LIMITS.events + 1);
    expect(small.t.droppedEvents).toBeGreaterThan(0);
  });
});

describe("preparation reporting after eviction", () => {
  const setup = () => {
    const r = registry();
    const request = async (handle: string, source: "model" | "prepared_interim" = "prepared_interim") => {
      const response = await withRequestContext({ source, turnId: null, diagnosticHandleId: handle }, () =>
        r.t.fetch(async () => new Response(null, { status: 204 }))("https://openrouter.ai/test"));
      expect(response.status).toBe(204);
    };
    const decide = (handle: string) => r.t.preparationDecision({ kind: "interim", status: "used", leadMs: 50, diagnosticHandleId: handle });
    return { ...r, request, decide };
  };

  it("keeps a normal exact join, but does not invent details for an evicted unique request", async () => {
    const r = setup();
    await r.request("job#h1");
    r.decide("job#h1");
    expect(r.of("preparation_decision").at(-1)).toMatchObject({ binding: "exact", requestId: "job:r1" });
    for (let i = 0; i < LIMITS.requests; i++) await r.request("job#h99", "model");
    r.decide("job#h1");
    expect(r.of("preparation_decision").at(-1)).toMatchObject({ binding: "unresolved", requestId: null });
  });

  it("never restores uniqueness when eviction removes one of two requests under a handle", async () => {
    const r = setup();
    await r.request("job#h1");
    await r.request("job#h1");
    for (let i = 0; i < LIMITS.requests - 1; i++) await r.request("job#h99", "model");
    r.decide("job#h1");
    expect(r.of("request")).toHaveLength(LIMITS.requests + 1);
    expect(r.of("preparation_decision").at(-1)).toMatchObject({ binding: "ambiguous", requestId: null });
  });

  it("does not claim uniqueness when the bounded handle history itself has forgotten a handle", async () => {
    const r = setup();
    for (let i = 0; i <= LIMITS.requests; i++) await r.request(`job#h${i + 1}`);
    // A retained handle with complete history still has a proved exact match.
    r.decide(`job#h${LIMITS.requests + 1}`);
    expect(r.of("preparation_decision").at(-1)?.binding).toBe("exact");
    await r.request("job#h1");
    r.decide("job#h1");
    expect(r.of("preparation_decision").at(-1)?.binding).not.toBe("exact");
    expect(r.of("preparation_decision").at(-1)?.requestId).toBeNull();
  });

  it("keeps a retained turn reported when the bounded decision details leave", () => {
    const r = setup();
    const first = r.t.turn([r.t.final({ at: 5_000 })]);
    r.t.runInTurn(first, () => r.decide("job#h1"));
    expect(r.t.turnClock(first)).toMatchObject({ preparationSelection: "reported" });
    for (let i = 0; i < LIMITS.decisions / 2; i++) {
      const later = r.t.turn([r.t.final({ at: 5_100 + i })]);
      r.t.runInTurn(later, () => { r.decide(`job#h${i * 2 + 2}`); r.decide(`job#h${i * 2 + 3}`); });
    }
    expect(r.t.turnClock(first)).toMatchObject({ preparationSelection: "reported", preparationDecisionCount: 1, preparationDetailsEvicted: 1, preparations: [] });
  });

  it("bounds one turn's retained detail IDs while keeping its reporting count", () => {
    const r = setup();
    const turn = r.t.turn([r.t.final({ at: 5_000 })]);
    r.t.runInTurn(turn, () => {
      for (let i = 0; i < LIMITS.decisions + 10; i++) r.decide(`job#h${i + 1}`);
    });
    const view = r.t.turnClock(turn) as { preparations: unknown[] };
    expect(view).toMatchObject({ preparationSelection: "reported", preparationDecisionCount: LIMITS.decisions + 10, preparationDetailsEvicted: 10 });
    expect(view.preparations).toHaveLength(LIMITS.decisions);
  });
});
