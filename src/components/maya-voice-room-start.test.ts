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
  state?: string;
  emit(event: string, ...args: unknown[]): void;
  connected: unknown[];
  disconnect: ReturnType<typeof vi.fn>;
  startAudio: ReturnType<typeof vi.fn>;
  localParticipant: { setMicrophoneEnabled: ReturnType<typeof vi.fn>; performRpc: ReturnType<typeof vi.fn> };
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


it("a new call does not share the old call's claimed pending join", async () => {
  const rerender = await mount("call-a");
  lk.connect.push("hold");
  await act(async () => { void api.prepare(); void api.connect(); });
  await rerender("call-b");
  await act(async () => { void api.connect(); });
  await settle();
  expect(tickets).toBe(2);
  expect(lk.rooms).toHaveLength(2);
  expect(lk.rooms[0].disconnect).toHaveBeenCalled();
  await release();
  expect(lk.rooms[0].localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
  expect(lk.rooms[0].startAudio).not.toHaveBeenCalled();
  expect(lk.rooms[1].localParticipant.setMicrophoneEnabled).toHaveBeenCalledOnce();
  expect(api.phase).toBe("waiting");
});

it.each(["resolve", "reject"])("retry after disconnection owns its room when the old microphone later %ss", async (outcome) => {
  await mount();
  await act(async () => { void api.prepare(); });
  await settle();
  let finishMic!: () => void;
  lk.rooms[0].localParticipant.setMicrophoneEnabled.mockImplementationOnce(() => new Promise<void>((resolve, reject) => {
    finishMic = () => outcome === "resolve" ? resolve() : reject(new Error("not connected"));
  }));
  await act(async () => { void api.connect(); });
  await act(async () => { lk.rooms[0].emit("Disconnected"); });
  expect(api.phase).toBe("failed");
  await act(async () => { void api.connect(); });
  await settle();
  expect(tickets).toBe(2);
  expect(lk.rooms).toHaveLength(2);
  expect(api.phase).toBe("waiting");
  await act(async () => { finishMic(); });
  await settle();
  expect(lk.rooms[1].disconnect).not.toHaveBeenCalled();
  expect(lk.rooms[1].localParticipant.setMicrophoneEnabled).toHaveBeenCalledOnce();
  expect(api.phase).toBe("waiting");
  expect(api.error).toBeNull();
});

it.each(["ticket", "connect"])("replacement during claimed pending %s never activates the old call", async (stage) => {
  const rerender = await mount("call-a");
  holdTickets = stage === "ticket";
  if (stage === "connect") lk.connect.push("hold");
  await act(async () => { void api.prepare(); void api.connect(); });
  await rerender("call-b");
  holdTickets = false;
  await act(async () => { void api.connect(); });
  await release();
  const oldAudio = voiceStartMarks().filter(m => m.callId === "call-a" && ["mic_begin", "start_audio_begin"].includes(m.event));
  expect(oldAudio).toEqual([]);
  expect(tickets).toBe(2);
});

it("cancelled ready attempt cannot disconnect a later successful connection on delayed mic rejection", async () => {
  await mount();
  await act(async () => { await api.prepare(); });
  let rejectMic!: (e: Error) => void;
  lk.rooms[0].localParticipant.setMicrophoneEnabled.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectMic = reject; }));
  await act(async () => { void api.connect(); });
  await act(async () => { await api.hangUp(); });
  await act(async () => { await api.connect(); });
  expect(lk.rooms).toHaveLength(2);
  expect(lk.rooms[1].disconnect).not.toHaveBeenCalled();
  await act(async () => { rejectMic(new Error("old-permission-failed")); });
  await settle();
  expect(lk.rooms[1].disconnect).not.toHaveBeenCalled();
  expect(api.phase).toBe("waiting");
});

it("cancelled pending reuse cannot disconnect a later successful connection on delayed audio rejection", async () => {
  await mount();
  lk.connect.push("hold");
  await act(async () => { void api.prepare(); });
  let rejectAudio!: (e: Error) => void;
  lk.rooms[0].startAudio.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectAudio = reject; }));
  await act(async () => { void api.connect(); });
  await release();
  await act(async () => { await api.hangUp(); });
  await act(async () => { await api.connect(); });
  expect(lk.rooms).toHaveLength(2);
  await act(async () => { rejectAudio(new Error("old-audio-failed")); });
  await settle();
  expect(lk.rooms[1].disconnect).not.toHaveBeenCalled();
  expect(api.phase).toBe("waiting");
});

it("unmount during pending reuse mic await cannot start audio after unmount", async () => {
  await mount();
  lk.connect.push("hold");
  await act(async () => { void api.prepare(); });
  let releaseMic!: () => void;
  lk.rooms[0].localParticipant.setMicrophoneEnabled.mockImplementationOnce(() => new Promise<void>(resolve => { releaseMic = resolve; }));
  await act(async () => { void api.connect(); });
  await release();
  expect(lk.rooms[0].startAudio).not.toHaveBeenCalled();
  await act(async () => { root!.unmount(); root = undefined; });
  await act(async () => { releaseMic(); });
  await settle();
  expect(lk.rooms[0].startAudio).not.toHaveBeenCalled();
});

it("fresh join attaches an already subscribed real SDK audio track only once", async () => {
  const { RemoteAudioTrack } = await vi.importActual<typeof import('livekit-client')>('livekit-client');
  class Stream {
    tracks: MediaStreamTrack[] = [];
    getTracks() { return this.tracks; }
    getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
    getVideoTracks() { return []; }
    addTrack(t: MediaStreamTrack) { this.tracks.push(t); }
    removeTrack(t: MediaStreamTrack) { this.tracks = this.tracks.filter(x => x !== t); }
  }
  vi.stubGlobal('MediaStream', Stream);
  const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject')!;
  const streams = new WeakMap<HTMLMediaElement, unknown>();
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, get() { return streams.get(this) ?? null; }, set(value) { streams.set(this, value); } });
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  try {
    await mount();
    lk.connect.push('hold');
    await act(async () => { void api.connect(); });
    const track = new RemoteAudioTrack({ id: 'audio-1', kind: 'audio', enabled: true } as MediaStreamTrack, 'TR_1', {} as RTCRtpReceiver);
    const maya = { identity: 'maya-1', kind: 4, attributes: { 'maya.segment': '1' }, audioTrackPublications: new Map([['TR_1', { track }]]) };
    lk.rooms[0].remoteParticipants.set(maya.identity, maya);
    await act(async () => lk.rooms[0].emit('TrackSubscribed', track, {}, maya));
    expect(track.attachedElements).toHaveLength(1);
    await release();
    // The first element is already in the host. Reusing a track must not make a second audible player.
    expect(track.attachedElements).toHaveLength(1);
    expect(play).toHaveBeenCalledOnce();
  } finally { play.mockRestore(); Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', srcDescriptor); }
});

const closeEvents = () => voiceStartMarks().filter(m => /hang_up|sdk_|component_close|page_lifecycle|call_replaced/.test(m.event));
const addAgent = async (room: TestRoom) => {
  const p = { identity: "maya", kind: 4, attributes: { "maya.segment": "1", "lk.agent.state": "listening" } };
  await act(async () => { room.remoteParticipants.set("maya", p); room.emit("ParticipantConnected", p); });
};

it.each([true, false])("marks Hang up RPC success=%s on the room's own call and attempt", async ok => {
  await mount("close-a"); await act(async () => { await api.connect(); }); await addAgent(lk.rooms[0]);
  const attempt = voiceStartMarks().find(m => m.event === "mic_begin")!.attempt;
  if (!ok) lk.rooms[0].localParticipant.performRpc.mockRejectedValueOnce(Error("private rpc failure"));
  await act(async () => { await api.hangUp("button"); });
  expect(closeEvents().map(m => m.event)).toEqual(["hang_up_button", "hang_up_requested", "hang_up_rpc_begin", "hang_up_rpc_end", "sdk_disconnected"]);
  expect(closeEvents().every(m => m.callId === "close-a" && m.attempt === attempt)).toBe(true);
  expect(closeEvents().find(m => m.event === "hang_up_rpc_end")?.ok).toBe(ok);
  expect(lk.rooms[0].disconnect).toHaveBeenCalledOnce();
  expect(JSON.stringify(closeEvents())).not.toContain("private");
});

it("records reconnect observations without a Hang up mark or a new close", async () => {
  await mount(); await act(async () => { await api.connect(); }); await addAgent(lk.rooms[0]);
  await act(async () => { lk.rooms[0].emit("Reconnecting"); lk.rooms[0].emit("SignalReconnecting"); lk.rooms[0].emit("Reconnected"); });
  expect(closeEvents().map(m => m.event)).toEqual(["sdk_reconnecting", "sdk_signal_reconnecting", "sdk_reconnected"]);
  expect(api.phase).toBe("live"); expect(lk.rooms[0].disconnect).not.toHaveBeenCalled();
});

// #992: livekit-client 2.23.0's full reconnect removes every remote participant, then enters Reconnecting in the same
// task, and joins again. The screen waits through it; Maya missing after Reconnected, or with no reconnect, fails.
const fullReconnect = async (room: TestRoom) => {
  await act(async () => {
    const p = room.remoteParticipants.get("maya");
    room.remoteParticipants.delete("maya");
    room.emit("ParticipantDisconnected", p);
    room.state = "reconnecting";
    room.emit("Reconnecting");
  });
  await settle();
};

it("waits while the room makes a full reconnect, and is live again when Maya is back", async () => {
  await mount(); await act(async () => { await api.connect(); }); await addAgent(lk.rooms[0]);
  await fullReconnect(lk.rooms[0]);
  expect(api.phase).toBe("live"); expect(api.error).toBeNull();
  await act(async () => { lk.rooms[0].state = "connected"; });
  await addAgent(lk.rooms[0]);
  await act(async () => { lk.rooms[0].emit("Reconnected"); });
  await settle();
  expect(api.phase).toBe("live"); expect(lk.rooms[0].disconnect).not.toHaveBeenCalled();
});

it("shows the call as disconnected when Maya is not back after the reconnect", async () => {
  await mount("call-a"); await act(async () => { await api.connect(); }); await addAgent(lk.rooms[0]);
  await fullReconnect(lk.rooms[0]);
  await act(async () => { lk.rooms[0].state = "connected"; lk.rooms[0].emit("Reconnected"); });
  await settle();
  expect(api.phase).toBe("failed"); expect(api.error).toBe("disconnected");
});

it("shows the call as disconnected when Maya leaves a connected room", async () => {
  await mount(); await act(async () => { await api.connect(); }); await addAgent(lk.rooms[0]);
  await act(async () => { const p = lk.rooms[0].remoteParticipants.get("maya"); lk.rooms[0].remoteParticipants.delete("maya"); lk.rooms[0].emit("ParticipantDisconnected", p); });
  await settle();
  expect(api.phase).toBe("failed"); expect(api.error).toBe("disconnected");
});

it.each([1, 9, "https://private.invalid/token"])("records the closed disconnected reason %s without implying a button press", async reason => {
  await mount(); await act(async () => { await api.connect(); });
  await act(async () => { lk.rooms[0].emit("Disconnected", reason); });
  expect(closeEvents()).toMatchObject([{ event: "sdk_disconnected", disconnectReason: reason === 1 ? "client_initiated" : reason === 9 ? "signal_close" : "unknown" }]);
  expect(api.phase).toBe("failed");
  expect(JSON.stringify(closeEvents())).not.toContain("private");
});

it("marks actual page lifecycle events and unmount, and keeps existing disconnect behavior", async () => {
  await mount(); await act(async () => { await api.connect(); });
  window.dispatchEvent(new Event("pagehide")); window.dispatchEvent(new Event("beforeunload")); document.dispatchEvent(new Event("freeze"));
  expect(closeEvents().map(m => m.lifecycle)).toEqual(["pagehide", "beforeunload", "freeze"]);
  expect(lk.rooms[0].disconnect).not.toHaveBeenCalled();
  await act(async () => { root!.unmount(); root = undefined; });
  expect(closeEvents().map(m => m.event)).toEqual(["page_lifecycle", "page_lifecycle", "page_lifecycle", "component_close", "sdk_disconnected"]);
  expect(lk.rooms[0].localParticipant.performRpc).not.toHaveBeenCalled();
  expect(lk.rooms[0].disconnect).toHaveBeenCalledOnce();
  const count = closeEvents().length; window.dispatchEvent(new Event("pagehide"));
  expect(closeEvents()).toHaveLength(count);
});

it("an old RPC completion and room event cannot borrow a new call's attempt", async () => {
  const render = await mount("old-call"); await act(async () => { await api.connect(); }); await addAgent(lk.rooms[0]);
  let releaseRpc!: () => void;
  lk.rooms[0].localParticipant.performRpc.mockImplementationOnce(() => new Promise<void>(resolve => { releaseRpc = resolve; }));
  let ending!: Promise<void>; await act(async () => { ending = api.hangUp("button"); });
  const oldAttempt = closeEvents().find(m => m.event === "hang_up_rpc_begin")!.attempt;
  await render("new-call"); await act(async () => { await api.connect(); });
  await act(async () => { releaseRpc(); await ending; lk.rooms[0].emit("Reconnected"); });
  window.dispatchEvent(new Event("pagehide"));
  const old = closeEvents().filter(m => m.event === "hang_up_rpc_end" || m.event === "sdk_reconnected" || m.event === "call_replaced");
  expect(old).toHaveLength(3);
  expect(old.every(m => m.callId === "old-call" && m.attempt === oldAttempt)).toBe(true);
  expect(closeEvents().at(-1)).toMatchObject({ callId: "new-call", event: "page_lifecycle" });
  expect(closeEvents().at(-1)!.attempt).not.toBe(oldAttempt);
  expect(lk.rooms[1].disconnect).not.toHaveBeenCalled();
});

it("a failed browser diagnostic observer cannot prevent the RPC or media close", async () => {
  await mount(); await act(async () => { await api.connect(); }); await addAgent(lk.rooms[0]);
  const observer = vi.spyOn(voiceStartTrace(), "mark").mockImplementation(() => { throw Error("observer"); });
  try {
    await act(async () => { await api.hangUp("button"); });
    expect(lk.rooms[0].localParticipant.performRpc).toHaveBeenCalledOnce(); expect(lk.rooms[0].disconnect).toHaveBeenCalledOnce();
  } finally { observer.mockRestore(); }
});
