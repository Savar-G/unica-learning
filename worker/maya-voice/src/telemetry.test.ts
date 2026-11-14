import { describe, expect, it } from "vitest";
import { withRequestContext } from "@/lib/maya-request-trace";
import { CallTelemetry, LIMITS, type Emitted } from "./telemetry";

// The turn-bound telemetry of the latency audit (2026-11-14), through its public interface: the falsifiers are an earlier
// turn that gets a later final's marks, two requests that share an id, a prepared request that loses its marks at the
// final, a repair or review that vanishes, an acknowledgement labelled as the answer, and a log that holds child or
// provider text.

function harness() {
  let at = 1_000;
  const events: Emitted[] = [];
  const t = new CallTelemetry({ callId: "call-1", now: () => at, sink: (e) => events.push(e) });
  return { t, events, tick: (ms = 10) => { at += ms; return at; }, now: () => at };
}

/** A model provider whose answer is held by the test: headers first, then body chunks. */
function provider() {
  const calls: { release: () => void }[] = [];
  const fetchFake = ((_input: unknown, init?: RequestInit) => {
    void init;
    return new Promise<Response>((resolve) => {
      const body = new ReadableStream<Uint8Array>({
        start(c) { calls.push({ release: () => { c.enqueue(new TextEncoder().encode("data: x\n\n")); c.close(); } }); },
      });
      resolve(new Response(body, { status: 200 }));
    });
  }) as unknown as typeof fetch;
  return { fetch: fetchFake, calls };
}
const drain = async (r: Response) => { await r.text(); };

describe("a turn's clock", () => {
  it("is never given a later final's marks, and a paused answer keeps both finals under their own ids", () => {
    const h = harness();
    const f1 = h.t.final({ at: h.now(), detectorEndAt: 900, levelEndAt: 880 });
    const t1 = h.t.turn([f1]);
    h.tick(500);
    // A second final arrives while the first turn is still open: nothing of the first changes.
    const f2 = h.t.final({ at: h.now(), detectorEndAt: 1_300, levelEndAt: 1_290 });
    const joined = h.t.turn([f1, f2]);
    const first = h.t.turnClock(t1) as { finals: { id: string; sttFinal: number }[] };
    expect(first.finals.map((f) => f.id)).toEqual([f1]);
    expect(JSON.stringify(first)).not.toContain(f2);
    // The paused answer lists both finals, each with its own time, and its own marks are the last final's.
    const both = h.t.turnClock(joined) as { finals: { id: string; sttFinal: number }[]; sttFinal: number; detectorEnd: number };
    expect(both.finals.map((f) => f.id)).toEqual([f1, f2]);
    expect(both.finals[1].sttFinal - both.finals[0].sttFinal).toBe(500);
    expect(both.sttFinal - both.detectorEnd).toBe(1_500 - 1_300);
    expect(h.events.filter((e) => e.ev === "turn").map((e) => (e as { finalIds: string[] }).finalIds)).toEqual([[f1], [f1, f2]]);
  });
});

describe("model requests", () => {
  it("gives each physical request its own id and marks, also when two run at once", async () => {
    const h = harness();
    const p = provider();
    const f = h.t.fetch(p.fetch);
    const t1 = h.t.turn([h.t.final({ at: h.now() })]);
    const t2 = h.t.turn([h.t.final({ at: h.now() })]);
    const a = h.t.runInTurn(t1, () => f("https://openrouter.ai/v1/chat", { method: "POST" }));
    h.tick(7);
    const b = h.t.runInTurn(t2, () => f("https://openrouter.ai/v1/chat", { method: "POST" }));
    const [ra, rb] = await Promise.all([a, b]);
    h.tick(30);
    p.calls[1].release();
    await drain(rb);
    h.tick(40);
    p.calls[0].release();
    await drain(ra);
    const sent = h.events.filter((e) => e.ev === "request") as Extract<Emitted, { ev: "request" }>[];
    expect(new Set(sent.map((e) => e.requestId)).size).toBe(2);
    expect(sent.map((e) => e.turnId)).toEqual([t1, t2]);
    const c1 = h.t.turnClock(t1) as { requests: { id: string; sent: number; headers: number; firstBodyChunk: number }[] };
    const c2 = h.t.turnClock(t2) as { requests: { id: string; sent: number; firstBodyChunk: number }[] };
    expect(c1.requests).toHaveLength(1);
    expect(c2.requests).toHaveLength(1);
    expect(c1.requests[0].id).not.toBe(c2.requests[0].id);
    // The second request's chunk came first, the first request's after: each request has its own mark.
    expect(c2.requests[0].firstBodyChunk).toBeLessThan(c1.requests[0].firstBodyChunk);
    expect(h.events.filter((e) => e.ev === "request_end")).toHaveLength(2);
  });

  it("keeps a prepared request's marks through the final, unbound, and lists it as a candidate only", async () => {
    const h = harness();
    const p = provider();
    const f = h.t.fetch(p.fetch);
    const prepareId = h.t.reserveHint();
    const prepared = withRequestContext({ source: "prepared_interim", turnId: null, prepareId }, () => f("https://openrouter.ai/v1/chat", { method: "POST" }));
    h.t.hintAccepted(prepareId);
    const r = await prepared;
    h.tick(300);
    p.calls[0].release();
    await drain(r);
    const finalId = h.t.final({ at: h.now() });
    const turnId = h.t.turn([finalId]);
    const request = h.events.find((e) => e.ev === "request") as Extract<Emitted, { ev: "request" }>;
    expect(request).toMatchObject({ source: "prepared_interim", turnId: null, binding: "unbound", prepareId, handleId: null });
    // The final lists it as a candidate, never as the turn's own: selection is the controller's to report.
    expect(h.events.find((e) => e.ev === "prepare_candidates")).toMatchObject({ finalId, prepareIds: [prepareId], requestIds: [request.requestId], selection: "unreported" });
    expect((h.t.turnClock(turnId) as { requests: unknown[] }).requests).toEqual([]);
    // Its marks are still there, under its own id.
    const marks = h.events.filter((e) => e.ev === "mark" && e.scope === "request" && e.id === request.requestId).map((e) => (e as { name: string }).name);
    expect(marks).toEqual(["sent", "headers", "firstBodyChunk", "end"]);
  });

  it("keeps a repair and a review beside the first request of the turn, each with its source and order", async () => {
    const h = harness();
    const p = provider();
    const f = h.t.fetch(p.fetch);
    const turnId = h.t.turn([h.t.final({ at: h.now() })]);
    const send = (source: "model" | "review") => h.t.runInTurn(turnId, () => withRequestContext({ source }, () => f("https://openrouter.ai/v1/chat", { method: "POST" })));
    for (const source of ["model", "model", "review"] as const) {
      const r = await send(source);
      h.tick(20);
      p.calls.at(-1)!.release();
      await drain(r);
    }
    const clock = h.t.turnClock(turnId) as { requests: { source: string }[]; modelSent: number };
    expect(clock.requests.map((r) => r.source)).toEqual(["model", "model", "review"]);
    const sent = h.events.filter((e) => e.ev === "request") as Extract<Emitted, { ev: "request" }>[];
    expect(sent.map((e) => e.ordinalInTurn)).toEqual([1, 2, 3]);
  });

  it("is not a turn's request when its turn is unknown, and records an error and a cut with closed codes", async () => {
    const h = harness();
    const failing = h.t.fetch((async () => { throw new Error("secret provider error text"); }) as unknown as typeof fetch);
    await expect(failing("https://openrouter.ai/v1/chat")).rejects.toThrow();
    const controller = new AbortController();
    const waiting = h.t.fetch((() => new Promise<Response>(() => {})) as unknown as typeof fetch);
    void waiting("https://openrouter.ai/v1/chat", { signal: controller.signal });
    controller.abort();
    expect(h.events.filter((e) => e.ev === "request_end")).toMatchObject([{ outcome: "error", status: null }, { outcome: "aborted" }]);
    expect(JSON.stringify(h.events)).not.toContain("secret provider error text");
  });

  it("leaves requests to other hosts alone", async () => {
    const h = harness();
    const seen: string[] = [];
    const f = h.t.fetch((async (input: RequestInfo | URL) => { seen.push(String(input)); return new Response("ok"); }) as unknown as typeof fetch);
    await f("https://example.com/x");
    expect(seen).toEqual(["https://example.com/x"]);
    expect(h.events).toEqual([]);
  });
});

describe("speeches", () => {
  it("keeps an acknowledgement and an answer apart, each with its own voice request, frame and playback", () => {
    const h = harness();
    const turnId = h.t.turn([h.t.final({ at: h.now() })]);
    let ackWritten = true;
    const ack = h.t.utterance({ turnId, kind: () => (ackWritten ? "ack" : "answer") });
    h.tick(5); ack.request(); h.tick(20); ack.firstFrame(); h.tick(3); h.t.playbackStarted(turnId, "ack"); h.t.published();
    ackWritten = false;
    const answer = h.t.utterance({ turnId, kind: "answer" });
    h.tick(400); answer.request(); h.tick(30); answer.firstFrame(); h.tick(3); h.t.playbackStarted(turnId, "answer"); h.t.published();
    const spoken = h.events.filter((e) => e.ev === "utterance") as Extract<Emitted, { ev: "utterance" }>[];
    expect(spoken.map((u) => u.kind)).toEqual(["ack", "answer"]);
    expect(new Set(spoken.map((u) => u.utteranceId)).size).toBe(2);
    const clock = h.t.turnClock(turnId) as { ttsRequest: number; ttsFirstFrame: number; ackTtsRequest: number; ackTtsFirstFrame: number; utterances: { kind: string; playbackStarted: number; published: number }[] };
    // The legacy first-only names are the answer's; the acknowledgement's audio is under its own names.
    expect(clock.ackTtsRequest).toBeLessThan(clock.ttsRequest);
    expect(clock.ttsRequest - clock.ackTtsRequest).toBe(423);
    expect(clock.ttsFirstFrame - clock.ttsRequest).toBe(30);
    expect(clock.utterances.map((u) => u.kind)).toEqual(["ack", "answer"]);
    expect(clock.utterances.every((u) => u.playbackStarted !== undefined && u.published !== undefined)).toBe(true);
  });

  it("counts a first sentence once per turn and never for a whole reply that already streamed", () => {
    const h = harness();
    const turnId = h.t.turn([h.t.final({ at: h.now() })]);
    expect(h.t.sentence(turnId, 0, "stream")).toBe(`${turnId}.s1`);
    expect(h.t.sentence(turnId, 1, "stream")).toBe(`${turnId}.s2`);
    expect(h.t.sentence(turnId, 0, "turn_end")).toBeNull();
    expect(h.events.filter((e) => e.ev === "mark" && e.name === "firstSentence")).toHaveLength(1);
  });
});

describe("the log", () => {
  it("holds ids, codes and times only: no words, prompts, headers, URLs or provider text", async () => {
    const h = harness();
    const f = h.t.fetch((async () => new Response("the child said purple monkey dishwasher", { status: 200, headers: { authorization: "Bearer sk-SECRET" } })) as unknown as typeof fetch);
    const turnId = h.t.turn([h.t.final({ at: h.now() })]);
    const r = await h.t.runInTurn(turnId, () => f("https://openrouter.ai/api?key=sk-SECRET", { method: "POST", body: JSON.stringify({ messages: [{ content: "prompt text about Leah" }] }), headers: { authorization: "Bearer sk-SECRET" } }));
    await drain(r);
    h.t.admission(turnId, { startedAt: 1, endedAt: 9, stt: "cached", sttMs: 0, block: "memory", blockMs: 0, outcome: "admitted" });
    const log = JSON.stringify(h.events) + JSON.stringify(h.t.turnClock(turnId));
    for (const leak of ["purple monkey", "sk-SECRET", "prompt text", "Leah", "openrouter.ai", "authorization"]) expect(log).not.toContain(leak);
    expect(h.events.find((e) => e.ev === "admission")).toMatchObject({ turnId, ms: 8, stt: "cached", block: "memory", outcome: "admitted" });
  });

  it("is bounded: events stop at the limit with one truncation line, and old entries leave memory", () => {
    const h = harness();
    for (let i = 0; i < LIMITS.turns + 20; i++) h.t.turn([h.t.final({ at: h.now() })]);
    expect(h.t.turnClock("t1")).toBeNull();
    expect(h.t.turnClock(`t${LIMITS.turns + 20}`)).not.toBeNull();
    for (let i = 0; i < LIMITS.events; i++) h.t.turn([]);
    expect(h.events.filter((e) => e.ev === "truncated")).toHaveLength(1);
    expect(h.events.length).toBeLessThanOrEqual(LIMITS.events + 1);
    expect(h.t.droppedEvents).toBeGreaterThan(0);
  });

  it("never fails a call when the sink throws", () => {
    const t = new CallTelemetry({ sink: () => { throw new Error("disk full"); } });
    expect(() => t.turn([t.final({ at: 1 })])).not.toThrow();
  });

  it("logs a closed diagnostic handle id on the request and drops any other text", async () => {
    const h = harness();
    const f = h.t.fetch(provider().fetch);
    await withRequestContext({ source: "prepared_expected", turnId: null, diagnosticHandleId: "abc-123#h2" }, () => f("https://openrouter.ai/v1/chat", { method: "POST" }));
    await withRequestContext({ source: "prepared_expected", turnId: null, diagnosticHandleId: "sk-secret text here" }, () => f("https://openrouter.ai/v1/chat", { method: "POST" }));
    const sent = h.events.filter((e) => e.ev === "request") as Extract<Emitted, { ev: "request" }>[];
    expect(sent.map((e) => e.handleId)).toEqual(["abc-123#h2", null]);
  });
});
