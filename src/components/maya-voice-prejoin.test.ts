// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { MIC_WAIT_MS } from "@/lib/maya-voice";
import { VoicePanel } from "./admin-maya-voice";
import { PREJOIN_LIFE_MS } from "./maya-voice-room";

// The child joins the call's room before the Connect tap (docs/maya-voice.md), through the admin call's screen with a
// fake LiveKit room. What it proves: when the screen joins, what the tap does, and when the joined room is left. What
// it does not prove: real audio, Safari's autoplay rule, or how long a real subscription takes.

type Track = { kind: string; attach: ReturnType<typeof vi.fn> };
type Participant = { identity: string; kind: number; attributes: Record<string, string>; audioTrackPublications: Map<string, { track?: Track }> };
interface TestRoom {
  remoteParticipants: Map<string, Participant>;
  emit(event: string, ...args: unknown[]): void;
  connected: unknown[];
  disconnect: ReturnType<typeof vi.fn>;
  startAudio: ReturnType<typeof vi.fn>;
  localParticipant: { setMicrophoneEnabled: ReturnType<typeof vi.fn>; performRpc: ReturnType<typeof vi.fn> };
}
/** How the next room's connect behaves: at once, never (until the test lets it), or with an error. */
const control = vi.hoisted(() => ({ connect: [] as Array<"ok" | "hold" | "fail">, held: [] as Array<() => void> }));
const rooms = vi.hoisted(() => [] as TestRoom[]);
vi.mock("livekit-client", () => {
  class Room {
    remoteParticipants = new Map<string, Participant>();
    handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    localParticipant = { registerRpcMethod: vi.fn(), setMicrophoneEnabled: vi.fn(async () => {}), performRpc: vi.fn(async () => {}), getTrackPublication: () => undefined, identity: "child" };
    connected: unknown[] = [];
    constructor() { rooms.push(this as never); }
    registerTextStreamHandler() {}
    on(event: string, fn: (...args: unknown[]) => void) { this.handlers.set(event, [...this.handlers.get(event) ?? [], fn]); }
    emit(event: string, ...args: unknown[]) { for (const fn of this.handlers.get(event) ?? []) fn(...args); }
    async connect(url: string, token: string) {
      const how = control.connect.shift() ?? "ok";
      if (how === "fail") throw new Error("connect");
      if (how === "hold") await new Promise<void>((resolve) => control.held.push(resolve));
      this.connected = [url, token];
    }
    startAudio = vi.fn(async () => {});
    disconnect = vi.fn(async () => { this.emit("Disconnected"); });
  }
  return { Room, RoomEvent: new Proxy({}, { get: (_, key) => key }), Track: { Kind: { Audio: "audio" }, Source: { Microphone: "microphone" } }, ParticipantKind: { AGENT: 4 } };
});

let root: Root | undefined;
let host: HTMLDivElement;
let tickets = 0;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined; host?.remove(); rooms.length = 0; control.connect.length = 0; control.held.length = 0; tickets = 0;
  vi.unstubAllGlobals(); vi.useRealTimers();
});

const settle = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });

async function mount(opts: { started?: boolean } = {}) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ ok: true, ticket: { url: "ws://fake", token: `t${++tickets}` } }) })));
  vi.stubGlobal("AudioContext", class {
    createAnalyser() { return { fftSize: 512, getByteTimeDomainData: (a: Uint8Array) => a.fill(128) }; }
    createMediaStreamSource() { return { connect() {} }; }
    async close() {}
  });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  const onCancel = vi.fn();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(createElement(VoicePanel, { callId: "prejoin", childName: "Leah", started: opts.started ?? false, onUpdate: async () => {}, onEnded: async () => {}, onCancel, busy: false })));
  await settle();
  const click = async (label: string) => {
    const b = [...host.querySelectorAll("button")].find((b) => b.textContent === label);
    expect(b, label).toBeDefined(); await act(async () => b!.click());
  };
  return { click, onCancel };
}
/** Maya's worker in the room, with her voice track subscribed. */
function mayaIn(room: TestRoom) {
  const element = document.createElement("audio");
  const track: Track = { kind: "audio", attach: vi.fn(() => element) };
  const maya: Participant = { identity: "maya-1", kind: 4, attributes: { "maya.segment": "1", "lk.agent.state": "listening" }, audioTrackPublications: new Map([["TR_maya", { track }]]) };
  room.remoteParticipants.set(maya.identity, maya);
  room.emit("ParticipantConnected", maya);
  room.emit("TrackSubscribed", track, {}, maya);
  return { track, element };
}
const audioHost = () => host.querySelector("div[hidden]")!;

it("joins the room on the page, before the Connect tap, with the microphone off and Maya's voice not attached", async () => {
  await mount();
  expect(rooms).toHaveLength(1);
  expect(rooms[0].connected).toEqual(["ws://fake", "t1"]);
  const voice = mayaIn(rooms[0]);
  await settle();
  expect(rooms[0].localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
  expect(rooms[0].startAudio).not.toHaveBeenCalled();
  expect(voice.track.attach).not.toHaveBeenCalled();
  expect(audioHost().children).toHaveLength(0);
  // The screen shows nothing of it: still the microphone check, not "Waiting for Maya" or "Live".
  expect(host.textContent).toContain("Check the microphone");
  expect(host.textContent).not.toContain("Waiting for Maya");
  expect(host.textContent).not.toContain("Live");
});

it("makes the tap turn on the microphone, start the audio and attach Maya's subscribed voice, with no new join", async () => {
  const f = await mount();
  const voice = mayaIn(rooms[0]);
  await settle();
  await f.click("Check the microphone");
  await f.click("Connect");
  expect(rooms).toHaveLength(1);
  expect(tickets).toBe(1);
  expect(rooms[0].localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
  expect(rooms[0].startAudio).toHaveBeenCalledOnce();
  expect(voice.track.attach).toHaveBeenCalledOnce();
  expect([...audioHost().children]).toEqual([voice.element]);
  expect(host.textContent).toContain("Live");
  expect(host.textContent).toContain("Maya is listening");
  // A voice track that comes after the tap is attached as before.
  const later = { kind: "audio", attach: vi.fn(() => document.createElement("audio")) };
  await act(async () => rooms[0].emit("TrackSubscribed", later, {}, rooms[0].remoteParticipants.get("maya-1")));
  expect(later.attach).toHaveBeenCalledOnce();
  expect(audioHost().children).toHaveLength(2);
});

it("leaves the joined room when the call is cancelled before the tap, and when the screen closes", async () => {
  const f = await mount();
  await f.click("Cancel the call");
  expect(f.onCancel).toHaveBeenCalledOnce();
  expect(rooms[0].disconnect).toHaveBeenCalledOnce();
  expect(rooms[0].localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
  await act(async () => root!.unmount());
  root = undefined;

  await mount();
  const r = rooms.at(-1)!;
  await act(async () => root!.unmount());
  root = undefined;
  expect(r.disconnect).toHaveBeenCalledOnce();
});

it("falls back to the full join in the tap when the early join failed", async () => {
  control.connect.push("fail");
  const f = await mount();
  expect(rooms[0].disconnect).toHaveBeenCalled();
  await f.click("Check the microphone");
  await f.click("Connect");
  // A new ticket and a new room, joined and with the microphone on, as before the early join existed.
  expect(tickets).toBe(2);
  expect(rooms).toHaveLength(2);
  expect(rooms[1].connected).toEqual(["ws://fake", "t2"]);
  expect(rooms[1].localParticipant.setMicrophoneEnabled).toHaveBeenCalledOnce();
  expect(rooms[1].startAudio).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Waiting for Maya to join");
  mayaIn(rooms[1]);
  await settle();
  expect(host.textContent).toContain("Maya is listening");
});

it("falls back to the full join when the early join is not done at the tap, and leaves the unfinished room", async () => {
  control.connect.push("hold");
  const f = await mount();
  await f.click("Check the microphone");
  await f.click("Connect");
  expect(rooms).toHaveLength(2);
  expect(rooms[0].disconnect).toHaveBeenCalled();
  expect(rooms[0].localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
  expect(rooms[1].localParticipant.setMicrophoneEnabled).toHaveBeenCalledOnce();
  // The early join that ends after the tap changes nothing.
  await act(async () => { control.held.forEach((go) => go()); });
  await settle();
  expect(rooms).toHaveLength(2);
  expect(host.textContent).toContain("Waiting for Maya to join");
});

it("falls back to the full join when the joined room dropped before the tap", async () => {
  const f = await mount();
  await act(async () => rooms[0].emit("Disconnected"));
  // The screen shows no failure for a room the child never used.
  expect(host.textContent).not.toContain("The connection is closed.");
  await f.click("Check the microphone");
  await f.click("Connect");
  expect(rooms).toHaveLength(2);
  expect(rooms[1].localParticipant.setMicrophoneEnabled).toHaveBeenCalledOnce();
});

it("leaves the joined room before the worker stops waiting for the microphone; a later tap joins in full", async () => {
  expect(PREJOIN_LIFE_MS).toBeLessThan(MIC_WAIT_MS);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const f = await mount();
  expect(rooms[0].connected).toEqual(["ws://fake", "t1"]);
  await act(async () => { vi.advanceTimersByTime(PREJOIN_LIFE_MS - 1); });
  expect(rooms[0].disconnect).not.toHaveBeenCalled();
  await act(async () => { vi.advanceTimersByTime(1); });
  expect(rooms[0].disconnect).toHaveBeenCalledOnce();
  await f.click("Check the microphone");
  await f.click("Connect");
  expect(rooms).toHaveLength(2);
  expect(rooms[1].connected).toEqual(["ws://fake", "t2"]);
});

it("does not join early for a call that has started, which may be live in another tab", async () => {
  const f = await mount({ started: true });
  expect(rooms).toHaveLength(0);
  await f.click("Check the microphone");
  await f.click("Connect again");
  expect(rooms).toHaveLength(1);
  expect(rooms[0].localParticipant.setMicrophoneEnabled).toHaveBeenCalledOnce();
});
