// @vitest-environment happy-dom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { VoicePanel } from "./admin-maya-voice";

const rooms = vi.hoisted(() => [] as Array<{ emit(event: string, ...args: unknown[]): void; remoteParticipants: Map<string, unknown> }>);
vi.mock("livekit-client", () => {
  class Room {
    remoteParticipants = new Map();
    handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    localParticipant = { registerRpcMethod: vi.fn(), setMicrophoneEnabled: async () => {}, performRpc: async () => {} };
    constructor() { rooms.push(this); }
    on(event: string, fn: (...args: unknown[]) => void) { this.handlers.set(event, [...this.handlers.get(event) ?? [], fn]); }
    emit(event: string, ...args: unknown[]) { for (const fn of this.handlers.get(event) ?? []) fn(...args); }
    async connect() {}
    async startAudio() {}
    async disconnect() { this.emit("disconnected"); }
  }
  return { Room, RoomEvent: new Proxy({}, { get: (_, key) => String(key) === "Disconnected" ? "disconnected" : key }), Track: { Kind: { Audio: "audio" } }, ParticipantKind: { AGENT: 4 } };
});
let root: Root;
let host: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); vi.unstubAllGlobals(); rooms.length = 0; });

it("R408-13: a room disconnect keeps recovery controls until the saved call ends", async () => {
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
  await act(async () => root.render(createElement(VoicePanel, { callId: "call", childName: "Leah", started: false, onUpdate: async () => {}, onEnded, onCancel: vi.fn(), busy: false })));
  const click = async (label: string) => {
    const button = [...host.querySelectorAll("button")].find(b => b.textContent === label);
    expect(button, label).toBeDefined();
    await act(async () => button!.click());
  };
  await click("Check the microphone");
  await click("Connect");
  await act(async () => rooms[0].emit("disconnected"));
  expect(host.textContent).not.toContain("The call has ended.");
  expect(host.textContent).toContain("Connect");
  expect(host.textContent).toContain("Cancel the call");
  expect(onEnded).toHaveBeenCalled();
  await click("Connect");
  const agent = { identity: "current-worker", kind: 4, attributes: { "maya.segment": "9", "lk.agent.state": "listening" } };
  await act(async () => { rooms[1].remoteParticipants.set(agent.identity, agent); rooms[1].emit("ParticipantConnected", agent); });
  await act(async () => rooms[1].emit("DataReceived", new TextEncoder().encode(JSON.stringify({ ended: true, segment: 9 })), agent, undefined, "maya.call"));
  expect(host.textContent).toContain("The call has ended.");
  expect(host.textContent).not.toContain("The connection is closed.");
});
