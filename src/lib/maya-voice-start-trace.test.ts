import { expect, it } from "vitest";
import { createVoiceStartTrace } from "./maya-voice-start-trace";

// The browser marks of a voice call's start, with a passed-in clock: their shape, order and limit.

it("stamps each mark with the version, the browser clock, the origin and an order, rounded to 0.1 ms", () => {
  let t = 10.04;
  const trace = createVoiceStartTrace({ now: () => t, origin: () => 1_000 });
  trace.mark("c1", "a1", "ticket_begin");
  t = 12.36;
  trace.mark("c1", "a1", "ticket_end", { ok: true });
  expect(trace.marks()).toEqual([
    { v: 1, clock: "browser", callId: "c1", attempt: "a1", seq: 1, event: "ticket_begin", at: 10, origin: 1_000 },
    { v: 1, clock: "browser", callId: "c1", attempt: "a1", seq: 2, event: "ticket_end", at: 12.4, origin: 1_000, ok: true },
  ]);
});

it("keeps only the closed detail fields, so a caller cannot add words", () => {
  const trace = createVoiceStartTrace({ now: () => 0, origin: () => 0 });
  const m = trace.mark("c1", null, "tap", { label: "connect", words: "hello", token: "secret" } as never);
  expect(m).toEqual({ v: 1, clock: "browser", callId: "c1", attempt: null, seq: 1, event: "tap", at: 0, origin: 0, label: "connect" });
});

it("keeps the newest marks up to its limit", () => {
  const trace = createVoiceStartTrace({ now: () => 0, origin: () => 0, max: 3 });
  for (let i = 0; i < 5; i++) trace.mark("c1", null, "tap");
  expect(trace.marks().map((m) => m.seq)).toEqual([3, 4, 5]);
  trace.clear();
  expect(trace.marks()).toEqual([]);
});
