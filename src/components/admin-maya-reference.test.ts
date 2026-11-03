// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { MayaReferenceMicrophone } from "./admin-maya-reference";
import { REFERENCE_TOPIC } from "@/lib/maya-workbook-speech";

const rooms = vi.hoisted(() => [] as Array<{ emit(event: string, ...args: unknown[]): void; remoteParticipants: Map<string, unknown>; disconnect: ReturnType<typeof vi.fn> }>);
vi.mock("livekit-client", () => {
  class Room {
    remoteParticipants = new Map();
    handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    localParticipant = { setMicrophoneEnabled: vi.fn(async () => {}), performRpc: vi.fn(async () => "heard") };
    constructor() { rooms.push(this); }
    on(event: string, fn: (...args: unknown[]) => void) { this.handlers.set(event, [...this.handlers.get(event) ?? [], fn]); }
    emit(event: string, ...args: unknown[]) { for (const fn of this.handlers.get(event) ?? []) fn(...args); }
    async connect() {}
    disconnect = vi.fn(async () => {});
  }
  return { Room, RoomEvent: new Proxy({}, { get: (_, key) => key }), ParticipantKind: { AGENT: 4 } };
});

let root: Root;
let host: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); vi.unstubAllGlobals(); rooms.length = 0; });

async function mount(reply: { ok: boolean; id?: string; url?: string; token?: string; say?: string } = { ok: true, id: "selection-A", url: "wss://fake.invalid", token: "fake" }) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => reply })));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const selected = vi.fn();
  await act(async () => root.render(createElement(MayaReferenceMicrophone, { childId: "child", workbookId: "book", available: true, disabled: false, onReference: selected })));
  await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent === "Say page and number")!.click());
  return { selected, room: rooms[0] };
}

it("accepts one current worker reference, stops the microphone and ignores other participants and late packets", async () => {
  const { selected, room } = await mount();
  const current = { identity: "worker", kind: 4, attributes: { "maya.reference": "selection-A", "maya.speech": "fake" } };
  await act(async () => { room.remoteParticipants.set("worker", current); room.emit("ParticipantConnected", current); });
  expect(host.textContent).toContain("Send test speech");
  const bytes = new TextEncoder().encode(JSON.stringify({ text: "page four number three" }));
  for (const participant of [{ ...current, kind: 1 }, { ...current, attributes: { "maya.reference": "older-selection" } }]) {
    await act(async () => room.emit("DataReceived", bytes, participant, undefined, REFERENCE_TOPIC));
    expect(selected).not.toHaveBeenCalled();
  }
  await act(async () => room.emit("DataReceived", bytes, current, undefined, REFERENCE_TOPIC));
  expect(selected).toHaveBeenCalledExactlyOnceWith("page four number three");
  expect(room.disconnect).toHaveBeenCalledWith(true);
  await act(async () => room.emit("DataReceived", bytes, current, undefined, REFERENCE_TOPIC));
  expect(selected).toHaveBeenCalledTimes(1);
});

it("drops late speech after Stop listening", async () => {
  const { selected, room } = await mount();
  await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent === "Stop listening")!.click());
  await act(async () => room.emit("DataReceived", new TextEncoder().encode(JSON.stringify({ text: "page 4 number 3" })), { kind: 4, attributes: { "maya.reference": "selection-A" } }, undefined, REFERENCE_TOPIC));
  expect(selected).not.toHaveBeenCalled();
  expect(room.disconnect).toHaveBeenCalledWith(true);
});

it.each(["This workbook is not printed yet.", "I can't find that question in this child's workbook.", "Only test families can start a Maya session."])("shows the server refusal without a microphone permission error: %s", async say => {
  const { selected } = await mount({ ok: false, say });
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(say);
  expect(rooms).toHaveLength(0);
  expect(selected).not.toHaveBeenCalled();
});
