// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { VoicePanel } from "./admin-maya-voice";

type Participant = { identity: string; kind: number; attributes: Record<string, string> };
interface TestRoom {
  remoteParticipants: Map<string, Participant>;
  emit(event: string, ...args: unknown[]): void;
  disconnect: ReturnType<typeof vi.fn>;
  localParticipant: { performRpc: ReturnType<typeof vi.fn> };
}
const rooms = vi.hoisted(() => [] as TestRoom[]);
vi.mock("livekit-client", () => {
  class Room {
    remoteParticipants = new Map<string, Participant>();
    handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    localParticipant = { registerRpcMethod: vi.fn(), setMicrophoneEnabled: vi.fn(async () => {}), performRpc: vi.fn(async () => {}) };
    registerTextStreamHandler() {}
    constructor() { rooms.push(this); }
    on(event: string, fn: (...args: unknown[]) => void) { this.handlers.set(event, [...this.handlers.get(event) ?? [], fn]); }
    emit(event: string, ...args: unknown[]) { for (const fn of this.handlers.get(event) ?? []) fn(...args); }
    async connect() {}
    async startAudio() {}
    disconnect = vi.fn(async () => { this.emit("Disconnected"); });
  }
  return { Room, RoomEvent: new Proxy({}, { get: (_, key) => key }), Track: { Kind: { Audio: "audio" } }, ParticipantKind: { AGENT: 4 } };
});
let root: Root | undefined;
let host: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; host?.remove(); rooms.length = 0; vi.unstubAllGlobals(); });

async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ ok: true, ticket: { url: "ws://fake", token: "fake" } }) })));
  vi.stubGlobal("AudioContext", class {
    createAnalyser() { return { fftSize: 512, getByteTimeDomainData: (a: Uint8Array) => a.fill(128) }; }
    createMediaStreamSource() { return { connect() {} }; }
    async close() {}
  });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  const onEnded = vi.fn(async () => {});
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(createElement(VoicePanel, { callId: "end-once", childName: null, started: true, onUpdate: async () => {}, onEnded, onCancel: vi.fn(), busy: false })));
  const click = async (label: string) => {
    const button = [...host.querySelectorAll("button")].find((b) => b.textContent === label);
    expect(button, label).toBeDefined(); await act(async () => button!.click());
  };
  await click("Check the microphone"); await click("Connect again");
  return { onEnded, click, room: rooms[0] };
}
const worker = (identity = "A", segment = 1): Participant => ({ identity, kind: 4, attributes: { "maya.segment": String(segment), "lk.agent.state": "listening" } });
const join = async (room: TestRoom, p = worker()) => act(async () => { room.remoteParticipants.set(p.identity, p); room.emit("ParticipantConnected", p); });

it("notifies once when Hang up receives the normal disconnect event", async () => {
  const f = await mount(); await join(f.room); await f.click("Hang up");
  expect(f.room.disconnect).toHaveBeenCalledOnce(); expect(f.onEnded).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Connect again");
});

it("notifies without a disconnect event and ignores a later duplicate event", async () => {
  const f = await mount(); await join(f.room); f.room.disconnect.mockImplementation(async () => {});
  await f.click("Hang up"); expect(f.onEnded).toHaveBeenCalledOnce(); expect(host.textContent).toContain("Connect again");
  await act(async () => f.room.emit("Disconnected")); expect(f.onEnded).toHaveBeenCalledOnce();
});

it("keeps the terminal outcome when its packet arrives during Hang up", async () => {
  const f = await mount(), p = worker(); await join(f.room, p);
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  f.room.localParticipant.performRpc.mockImplementation(() => held);
  await f.click("Hang up");
  await act(async () => f.room.emit("DataReceived", new TextEncoder().encode(JSON.stringify({ segment: 1, ended: true })), p, undefined, "maya.call"));
  await act(async () => release());
  expect(f.onEnded).toHaveBeenCalledOnce(); expect(host.textContent).toContain("The call has ended.");
  expect(host.textContent).not.toContain("The connection is closed.");
});

it("does not notify twice or clear a replacement while the old Hang up is held", async () => {
  const f = await mount(); await join(f.room);
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  f.room.localParticipant.performRpc.mockImplementation(() => held);
  await f.click("Hang up"); await act(async () => f.room.emit("Disconnected"));
  await f.click("Connect again"); const current = rooms[1]; await join(current, worker("B", 9));
  await act(async () => release());
  expect(f.onEnded).toHaveBeenCalledOnce(); expect(current.disconnect).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Maya is listening");
  await f.click("Hang up"); expect(current.disconnect).toHaveBeenCalledOnce(); expect(f.onEnded).toHaveBeenCalledTimes(2);
});
