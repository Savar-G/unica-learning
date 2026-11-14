// @vitest-environment happy-dom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { voiceStartMarks, voiceStartTrace, type VoiceStartMark } from "@/lib/maya-voice-start-trace";
import { PREJOIN_WAIT_MS, useMayaVoiceRoom } from "./maya-voice-room";

// The start of a call through the hook's public interface (prepare, connect, hangUp, leave, markTap), with a fake
// LiveKit room whose connect and a ticket source that each wait until the test lets them go. What it proves: a tap
// during a join before the tap takes that join (one ticket, one room), taps and hang-ups that overlap, a join for a call
// id that was replaced, and the browser marks of the start. What it does not prove: real LiveKit timing, real audio, or
// Safari's autoplay rule.

interface TestRoom {
  remoteParticipants: Map<string, unknown>;
  emit(event: string, ...args: unknown[]): void;
  connected: unknown[];
  disconnect: ReturnType<typeof vi.fn>;
  startAudio: ReturnType<typeof vi.fn>;
  localParticipant: { setMicrophoneEnabled: ReturnType<typeof vi.fn> };
}
const lk = vi.hoisted(() => ({ connect: [] as Array<"ok" | "hold">, held: [] as Array<() => void>, rooms: [] as TestRoom[] }));
vi.mock("livekit-client", () => {
  class Room {
    remoteParticipants = new Map();
    handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    localParticipant = { registerRpcMethod: vi.fn(), setMicrophoneEnabled: vi.fn(async () => {}), performRpc: vi.fn(async () => {}), getTrackPublication: () => undefined, identity: "child" };
    connected: unknown[] = [];
    constructor() { lk.rooms.push(this as never); }
    registerTextStreamHandler() {}
    on(event: string, fn: (...args: unknown[]) => void) { this.handlers.set(event, [...this.handlers.get(event) ?? [], fn]); }
    emit(event: string, ...args: unknown[]) { for (const fn of this.handlers.get(event) ?? []) fn(...args); }
    async connect(url: string, token: string) {
      if (lk.connect.shift() === "hold") await new Promise<void>((resolve) => lk.held.push(resolve));
      this.connected = [url, token];
    }
    startAudio = vi.fn(async () => {});
    disconnect = vi.fn(async () => { this.emit("Disconnected"); });
  }
  return { Room, RoomEvent: new Proxy({}, { get: (_, key) => key }), Track: { Kind: { Audio: "audio" }, Source: { Microphone: "microphone" } }, ParticipantKind: { AGENT: 4 } };
});

type Api = ReturnType<typeof useMayaVoiceRoom>;
const latest: { api: Api | null } = { api: null };
/** The hook's newest value, read by the tests after each render. */
const api = new Proxy({} as Api, { get: (_, key) => (latest.api as unknown as Record<string | symbol, unknown>)[key] });
let root: Root | undefined;
let tickets = 0;
let ticketHold: Array<() => void> = [];
let holdTickets = false;

function Harness({ callId }: { callId: string }) {
  const value = useMayaVoiceRoom({
    callId,
    async getTicket() {
      const token = `t${++tickets}`;
      if (holdTickets) await new Promise<void>((resolve) => ticketHold.push(resolve));
      return { url: "ws://fake", token };
    },
    onUpdate: async () => {},
    onEnded: async () => {},
  });
  useEffect(() => { latest.api = value; });
  return createElement("div", { ref: value.audioHost, hidden: true });
}
const settle = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
async function mount(callId = "call-a") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(Harness, { callId })));
  return (next: string) => act(async () => root!.render(createElement(Harness, { callId: next })));
}
const micOn = () => lk.rooms.flatMap((r) => r.localParticipant.setMicrophoneEnabled.mock.calls);
const release = async () => { await act(async () => { lk.held.splice(0).forEach((go) => go()); ticketHold.splice(0).forEach((go) => go()); }); await settle(); };

beforeEach(() => { voiceStartTrace().clear(); });
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined; lk.rooms.length = 0; lk.connect.length = 0; lk.held.length = 0; tickets = 0; ticketHold = []; holdTickets = false;
  vi.unstubAllGlobals(); vi.useRealTimers();
});

it("prepare then connect at once, and a second connect in the same tick: one ticket, one room, one microphone", async () => {
  await mount();
  lk.connect.push("hold");
  await act(async () => { void api.prepare(); void api.connect(); void api.connect(); });
  await release();
  expect(tickets).toBe(1);
  expect(lk.rooms).toHaveLength(1);
  expect(micOn()).toHaveLength(1);
  expect(lk.rooms[0].startAudio).toHaveBeenCalledOnce();
  expect(lk.rooms[0].disconnect).not.toHaveBeenCalled();
  expect(api.phase).toBe("waiting");
});

it("a hang-up while the tap waits for the join leaves that room and turns nothing on", async () => {
  await mount();
  lk.connect.push("hold");
  await act(async () => { void api.prepare(); });
  await act(async () => { void api.connect(); });
  await act(async () => { void api.hangUp(); });
  await release();
  expect(tickets).toBe(1);
  expect(lk.rooms).toHaveLength(1);
  expect(lk.rooms[0].disconnect).toHaveBeenCalled();
  expect(micOn()).toHaveLength(0);
  expect(lk.rooms[0].startAudio).not.toHaveBeenCalled();
});

it("a join for a replaced call id is not used by the next call's tap, and leaves its room when it ends late", async () => {
  const rerender = await mount("call-a");
  lk.connect.push("hold");
  await act(async () => { void api.prepare(); });
  await rerender("call-b");
  await act(async () => { void api.connect(); });
  await settle();
  // The tap for call-b joins in full with its own ticket and room.
  expect(tickets).toBe(2);
  expect(lk.rooms).toHaveLength(2);
  expect(lk.rooms[1].localParticipant.setMicrophoneEnabled).toHaveBeenCalledOnce();
  await release();
  expect(lk.rooms[0].disconnect).toHaveBeenCalled();
  expect(lk.rooms[0].localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
  expect(lk.rooms[0].startAudio).not.toHaveBeenCalled();
});

it("a join that takes longer than the bound is left, and the tap joins in full once", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await mount();
  lk.connect.push("hold");
  await act(async () => { void api.prepare(); });
  await act(async () => { void api.connect(); });
  await act(async () => { vi.advanceTimersByTime(PREJOIN_WAIT_MS - 1); });
  expect(lk.rooms).toHaveLength(1);
  await act(async () => { vi.advanceTimersByTime(1); });
  await settle();
  expect(tickets).toBe(2);
  expect(lk.rooms).toHaveLength(2);
  expect(lk.rooms[0].disconnect).toHaveBeenCalled();
  expect(lk.rooms[1].localParticipant.setMicrophoneEnabled).toHaveBeenCalledOnce();
  // The first join ending after that changes nothing.
  await release();
  expect(lk.rooms[0].localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
  expect(lk.rooms).toHaveLength(2);
});

it("marks the start in order, on the browser clock, with closed fields only", async () => {
  await mount("call-m");
  holdTickets = true;
  await act(async () => { void api.prepare(); });
  await act(async () => { api.markTap("connect"); void api.connect(); });
  holdTickets = false;
  await release();
  const marks = voiceStartMarks().filter((m) => m.callId === "call-m");
  const attempt = marks.find((m) => m.event === "prepare_requested")!.attempt;
  expect(attempt).toEqual(expect.any(String));
  expect(marks.map((m) => m.event)).toEqual([
    "prepare_requested", "ticket_begin", "tap", "prejoin_decision", "ticket_end", "module_ready", "room_connect_begin",
    "room_connect_end", "prejoin_wait_end", "mic_begin", "mic_end", "start_audio_begin", "start_audio_end",
  ]);
  // One attempt from the join before the tap to the microphone: no second join.
  expect(new Set(marks.filter((m) => m.attempt !== null).map((m) => m.attempt))).toEqual(new Set([attempt]));
  expect(marks.find((m) => m.event === "tap")).toMatchObject({ attempt: null, label: "connect" });
  expect(marks.find((m) => m.event === "prejoin_decision")).toMatchObject({ decision: "reuse_pending", reason: "pending", prejoin: "ticket" });
  const allowed = new Set(["v", "clock", "callId", "attempt", "seq", "event", "at", "origin", "ok", "label", "decision", "reason", "prejoin", "drop", "premade"]);
  for (const m of marks) {
    expect(Object.keys(m).every((k) => allowed.has(k))).toBe(true);
    expect(m).toMatchObject({ v: 1, clock: "browser" });
    expect(typeof m.at).toBe("number");
  }
  const seqs = marks.map((m: VoiceStartMark) => m.seq);
  expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  expect(marks.some((m) => JSON.stringify(m).includes("t1"))).toBe(false);
});

it("marks a fresh join with its reason when nothing was joined before the tap", async () => {
  await mount("call-f");
  await act(async () => { api.markTap("connect_again"); void api.connect(); });
  await settle();
  const marks = voiceStartMarks().filter((m) => m.callId === "call-f");
  expect(marks.find((m) => m.event === "prejoin_decision")).toMatchObject({ decision: "fresh", reason: "not_prepared", prejoin: "none" });
  expect(marks.map((m) => m.event)).toEqual(["tap", "prejoin_decision", "ticket_begin", "ticket_end", "module_ready", "room_connect_begin", "room_connect_end", "mic_begin", "mic_end", "start_audio_begin", "start_audio_end"]);
});
