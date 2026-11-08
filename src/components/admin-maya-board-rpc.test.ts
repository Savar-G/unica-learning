// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { createBoardSender, type BoardSnapshot } from "@/lib/board-protocol";
import { boardRpcTransport } from "@/lib/board-rpc";
import { VoicePanel } from "./admin-maya-voice";

const SCOPE = { utteranceId: "plan", generation: 1 };
type FakeRoom = {
  remoteParticipants: Map<string, unknown>;
  emit(event: string, ...args: unknown[]): void;
  rpc: Map<string, (data: { callerIdentity: string; payload: string }) => Promise<string>>;
};
const rooms = vi.hoisted(() => [] as FakeRoom[]);
vi.mock("livekit-client", () => {
  class Room {
    remoteParticipants = new Map();
    handlers = new Map<string, ((...args: unknown[]) => void)[]>();
    rpc = new Map();
    localParticipant = {
      registerRpcMethod: (method: string, handler: unknown) => this.rpc.set(method, handler),
      setMicrophoneEnabled: async () => {}, performRpc: async () => "ok",
    };
    constructor() { rooms.push(this); }
    on(event: string, handler: (...args: unknown[]) => void) { this.handlers.set(event, [...this.handlers.get(event) ?? [], handler]); }
    emit(event: string, ...args: unknown[]) { for (const handler of this.handlers.get(event) ?? []) handler(...args); }
    async connect() {}
    async startAudio() {}
    async disconnect() { this.emit("Disconnected"); }
  }
  return { Room, RoomEvent: new Proxy({}, { get: (_, k) => k }), Track: { Kind: { Audio: "audio" } }, ParticipantKind: { AGENT: 4 } };
});
let root: Root;
let host: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); rooms.length = 0; sessionStorage.clear(); vi.unstubAllGlobals(); });

it("renders only released board state, restores it on remount, and refuses the replaced worker", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ ok: true, ticket: { url: "ws://fake", token: "fake" } }) })));
  vi.stubGlobal("AudioContext", class {
    createAnalyser() { return { fftSize: 512, getByteTimeDomainData: (a: Uint8Array) => a.fill(128) }; }
    createMediaStreamSource() { return { connect() {} }; }
    async close() {}
  });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  let snapshot: BoardSnapshot = { events: [] };
  const mount = async () => {
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    await act(async () => root.render(createElement(VoicePanel, { callId: "board-call", childName: null, started: true,
      onUpdate: async () => {}, onEnded: async () => {}, onCancel() {}, busy: false,
      onBoard: s => { snapshot = s; } })));
    for (const label of ["Check the microphone", "Connect again"]) {
      const b = [...host.querySelectorAll("button")].find(b => b.textContent === label)!;
      expect(b).toBeDefined(); await act(async () => b.click());
    }
    const r = rooms.at(-1)!;
    const agent = { identity: "worker", kind: 4, attributes: { "maya.segment": "10", "lk.agent.state": "listening" } };
    await act(async () => { r.remoteParticipants.set(agent.identity, agent); r.emit("ParticipantConnected", agent); });
    return r;
  };
  let r = await mount();
  let id = 0;
  const transport = () => boardRpcTransport({ performRpc: args => r.rpc.get(args.method)!({ callerIdentity: "worker", payload: args.payload }) }, "child", () => String(++id));
  const sender = createBoardSender({ sessionId: "board-call", senderId: "worker", transport: transport() });
  await act(async () => { expect(await sender.connect()).toEqual({ ok: true }); });
  await act(async () => { expect((await sender.send({ transactionId: "columns", commands: [{ op: "columns", id: "sum", operation: "add", operands: [{ id: "top", value: "27" }, { id: "bottom", value: "39" }], place: { region: "main" } }] }, { scope: SCOPE })).ok).toBe(true); });
  expect(snapshot.events).toEqual([]);
  await act(async () => { expect((await sender.release("columns", SCOPE)).ok).toBe(true); });
  expect(snapshot.events.filter(e => e.kind === "batch")).toHaveLength(1);
  const shown = structuredClone(snapshot);
  await act(async () => root.unmount()); host.remove();
  r = await mount();
  expect(snapshot).toEqual(shown);
  sender.useTransport(transport());
  await act(async () => { expect((await sender.connect()).ok).toBe(true); });
  const newer = { identity: "new-worker", kind: 4, attributes: { "maya.segment": "20", "lk.agent.state": "listening" } };
  await act(async () => { r.remoteParticipants.set(newer.identity, newer); r.emit("ParticipantConnected", newer); });
  await expect(transport().call({ type: "status", sessionId: "board-call", since: 0 })).rejects.toThrow("does not own");
  expect(snapshot).toEqual(shown);
});
