// @vitest-environment happy-dom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { VoicePanel } from "./admin-maya-voice";

const rooms = vi.hoisted(() => [] as Array<{ emit(event: string, ...args: unknown[]): void; remoteParticipants: Map<string, unknown>; disconnect: ReturnType<typeof vi.fn> }>);
vi.mock("livekit-client", () => {
  class Room {
    remoteParticipants = new Map();
    handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    localParticipant = { registerRpcMethod: vi.fn(), setMicrophoneEnabled: async () => {}, performRpc: async () => {} };
    registerTextStreamHandler() {}
    constructor() { rooms.push(this); }
    on(event: string, fn: (...args: unknown[]) => void) { this.handlers.set(event, [...this.handlers.get(event) ?? [], fn]); }
    emit(event: string, ...args: unknown[]) { for (const fn of this.handlers.get(event) ?? []) fn(...args); }
    async connect() {}
    async startAudio() {}
    disconnect = vi.fn(async () => { this.emit("disconnected"); });
  }
  return { Room, RoomEvent: new Proxy({}, { get: (_, key) => String(key) === "Disconnected" ? "disconnected" : key }), Track: { Kind: { Audio: "audio" } }, ParticipantKind: { AGENT: 4 } };
});
let root: Root;
let host: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); vi.unstubAllGlobals(); rooms.length = 0; });


it.each(["obsolete identity", "old segment", "missing segment"])("R408-15 rejects %s while the replacement stays connected", async (kind) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ ok: true, ticket: { url: "ws://fake", token: "fake" } }) })));
  vi.stubGlobal("AudioContext", class {
    createAnalyser() { return { fftSize: 512, getByteTimeDomainData: (a: Uint8Array) => a.fill(128) }; }
    createMediaStreamSource() { return { connect() {} }; }
    async close() {}
  });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  const onEnded = vi.fn(async () => {});
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(VoicePanel, { callId: "call", childName: null, started: true, onUpdate: async () => {}, onEnded, onCancel: vi.fn(), busy: false })));
  const click = async (label: string) => {
    const button = [...host.querySelectorAll("button")].find(b => b.textContent === label);
    expect(button, label).toBeDefined(); await act(async () => button!.click());
  };
  await click("Check the microphone"); await click("Connect again");
  const r=rooms[0];
  const replacement={identity:"worker-B",kind:4,attributes:{"lk.agent.state":"listening","maya.segment":"9"}};
  await act(async()=>{r.remoteParticipants.set("worker-B",replacement);r.emit("ParticipantConnected",replacement);});
  expect(host.textContent).toContain("Maya is listening");expect(r.disconnect).not.toHaveBeenCalled();
  const obsolete={identity:"worker-A",kind:4,attributes:{"lk.agent.state":"listening","maya.segment":"1"}};
  await act(async()=>{r.remoteParticipants.set("worker-A",obsolete);r.emit("ParticipantConnected",obsolete);});
  await act(async()=>r.emit("DataReceived",new TextEncoder().encode(JSON.stringify({revision:5,segment:kind === "missing segment" ? undefined : 1,ended:false,error:"technical_issue"})),kind === "obsolete identity" ? obsolete : replacement,undefined,"maya.call"));
  console.log('PANEL_AFTER_OBSOLETE_MESSAGE',JSON.stringify({disconnects:r.disconnect.mock.calls.length,text:host.textContent}));
  expect(r.disconnect).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Maya is listening");expect(onEnded).not.toHaveBeenCalled();
  await act(async()=>{r.remoteParticipants.delete("worker-B");r.emit("ParticipantDisconnected",replacement);});
  await act(async()=>r.emit("DataReceived",new TextEncoder().encode(JSON.stringify({segment:1,error:"technical_issue"})),obsolete,undefined,"maya.call"));
  expect(r.disconnect).not.toHaveBeenCalled();
  await act(async()=>{r.remoteParticipants.set("worker-B",replacement);r.emit("ParticipantConnected",replacement);});
  expect(host.textContent).toContain("Maya is listening");
  expect(host.textContent).not.toContain("The connection is closed.");
  await act(async()=>r.emit("DataReceived",new TextEncoder().encode(JSON.stringify({revision:10,segment:9,ended:false,error:"technical_issue"})),replacement,undefined,"maya.call"));
  expect(r.disconnect).toHaveBeenCalledOnce();expect(onEnded).toHaveBeenCalledOnce();expect(host.textContent).toContain("Connect again");
});
