// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useDeskVoice, VoiceBoard, VoiceControls, VoiceLimit, VoiceTranscript } from "./desk-voice";
import type { DeskVoiceCall, DeskVoiceReply, VoiceUsage } from "@/lib/maya-voice-desk";

// The child's voice call on the desk, driven through its public pieces (the hook and the screens) with a fake LiveKit
// room and a fake route. What it proves: the order of the screens, what is sent to the route, and the words shown. What
// it does not prove: real audio, a real microphone, or the real route (the server side is another branch).

type Participant = { identity: string; kind: number; attributes: Record<string, string> };
interface TestRoom { remoteParticipants: Map<string, Participant>; emit(event: string, ...args: unknown[]): void; disconnect: ReturnType<typeof vi.fn>; localParticipant: { performRpc: ReturnType<typeof vi.fn> } }
const rooms = vi.hoisted(() => [] as TestRoom[]);
vi.mock("livekit-client", () => {
  class Room {
    remoteParticipants = new Map<string, Participant>();
    handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    localParticipant = { registerRpcMethod: vi.fn(), setMicrophoneEnabled: vi.fn(async () => {}), performRpc: vi.fn(async () => {}) };
    connected: unknown[] = [];
    constructor() { rooms.push(this as never); }
    on(event: string, fn: (...args: unknown[]) => void) { this.handlers.set(event, [...this.handlers.get(event) ?? [], fn]); }
    emit(event: string, ...args: unknown[]) { for (const fn of this.handlers.get(event) ?? []) fn(...args); }
    async connect(url: string, token: string) { this.connected = [url, token]; }
    async startAudio() {}
    disconnect = vi.fn(async () => { this.emit("Disconnected"); });
  }
  return { Room, RoomEvent: new Proxy({}, { get: (_, key) => key }), Track: { Kind: { Audio: "audio" } }, ParticipantKind: { AGENT: 4 } };
});

const USAGE: VoiceUsage = { usedSeconds: 600, leftSeconds: 1200, limitSeconds: 1800, resetsAt: "2026-11-17T03:00:00.000Z", zone: "America/Vancouver" };
/** The route answers with the call id the browser made. */
let lastId = "c1";
const call = (over: Partial<DeskVoiceCall> = {}): DeskVoiceCall => ({ id: lastId, revision: 1, ended: false, transcript: [], batches: [], hint: 0, safetyMessage: null, mode: "voice", started: false, status: over.ended ? "ended" : "live", ...over });

let root: Root | undefined;
let host: HTMLDivElement;
const sent: Array<Record<string, unknown>> = [];
let answer: (body: Record<string, unknown>) => DeskVoiceReply;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; host?.remove(); rooms.length = 0; sent.length = 0; vi.unstubAllGlobals(); });

function Harness({ voice, question = 2 }: { voice: { usage: VoiceUsage } | null; question?: number | null }) {
  const state = useDeskVoice(voice, { book: "wb1", page: 3, question });
  return createElement("div", null,
    createElement("dl", null, createElement(VoiceLimit, { state })),
    createElement(VoiceTranscript, { state }),
    state.showBoard ? createElement(VoiceBoard, { state, still: true }) : null,
    createElement("footer", { className: state.engaged ? "is-calling" : "" }, createElement(VoiceControls, { state })));
}

async function mount(opts: { voice?: { usage: VoiceUsage } | null; mic?: "ok" | "blocked" | "none"; question?: number | null } = {}) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    sent.push(body);
    if (typeof body.id === "string") lastId = body.id;
    return { json: async () => answer(body) };
  }));
  vi.stubGlobal("AudioContext", class {
    createAnalyser() { return { fftSize: 512, getByteTimeDomainData: (a: Uint8Array) => a.fill(128) }; }
    createMediaStreamSource() { return { connect() {} }; }
    async close() {}
  });
  const mic = opts.mic ?? "ok";
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
    getUserMedia: async () => {
      if (mic === "blocked") throw new DOMException("no", "NotAllowedError");
      if (mic === "none") throw new DOMException("no", "NotFoundError");
      return { getTracks: () => [{ stop() {} }] };
    },
  } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(createElement(Harness, { voice: opts.voice === undefined ? { usage: USAGE } : opts.voice, question: opts.question === undefined ? 2 : opts.question })));
  const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === label);
  const click = async (label: string) => { const b = button(label); expect(b, label).toBeDefined(); await act(async () => b!.click()); };
  return { click, button };
}
const worker = (segment = 1): Participant => ({ identity: "maya-1", kind: 4, attributes: { "maya.segment": String(segment), "lk.agent.state": "listening" } });
const join = (room: TestRoom, p = worker()) => act(async () => { room.remoteParticipants.set(p.identity, p); room.emit("ParticipantConnected", p); });

it("shows no call control at all when voice is closed for this child", async () => {
  await mount({ voice: null });
  expect(host.textContent).toBe("");
});

it("shows the minutes left this week and the Call Maya control; the control waits for a picked question", async () => {
  const f = await mount();
  expect(host.textContent).toContain("Calls20 minutes left this week");
  expect(f.button("Call Maya")?.hasAttribute("disabled")).toBe(false);
  await act(async () => root!.unmount());
  const g = await mount({ question: null });
  expect(g.button("Call Maya")?.hasAttribute("disabled")).toBe(true);
});

it("says the week is used, with the day it starts again, and offers no call", async () => {
  const f = await mount({ voice: { usage: { ...USAGE, usedSeconds: 1790, leftSeconds: 10 } } });
  expect(host.textContent).toContain("Used this week");
  expect(host.textContent).toContain("You've used Maya's call time for this week. She'll be back on Monday.");
  expect(f.button("Call Maya")).toBeUndefined();
});

it("counts the live call once: the week before the call minus the call's own time, not the server's reserved count", async () => {
  // The server counts a live call at its whole limit (10 minutes), so its usage during the call is 1200 - 600 = 600.
  answer = (body) => body.type === "start"
    ? { call: call(), ticket: { url: "ws://fake", token: "t-start", room: "r", identity: "child", expiresAt: "x" }, usage: { ...USAGE, usedSeconds: 1200, leftSeconds: 600 } }
    : { call: call({ started: true }), usage: { ...USAGE, usedSeconds: 1200, leftSeconds: 600 } };
  const f = await mount();
  await f.click("Call Maya");
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await f.click("Start the call");
  await join(rooms[0]);
  expect(host.textContent).toContain("On the call");
  expect(host.textContent).toContain("20 minutes left this week");
  expect(host.textContent).not.toContain("10 minutes left this week");

  // Hang up while the server has not saved the end yet: it still counts the call at its whole limit.
  await f.click("Hang up");
  await act(async () => { await new Promise((r) => setTimeout(r, 4700)); });
  expect(host.textContent).toContain("The call is over.");
  expect(host.textContent).toContain("20 minutes left this week");
  await f.click("Back to my page");
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(host.textContent).toContain("Calls20 minutes left this week");
  expect(host.textContent).not.toContain("10 minutes left this week");
});

it("goes from the microphone check to a live call and back to the page", async () => {
  answer = (body) => body.type === "start"
    ? { call: call(), ticket: { url: "ws://fake", token: "t-start", room: "r", identity: "child", expiresAt: "x" }, usage: USAGE }
    : { call: call({ ended: true, started: true, transcript: [{ speaker: "maya", text: "Hi! Let us start.", second: 1 }] }), usage: { ...USAGE, usedSeconds: 700, leftSeconds: 1100 } };
  const f = await mount();
  await f.click("Call Maya");
  expect(host.textContent).toContain("Your microphone works.");
  expect(host.querySelector('[role="meter"]')).not.toBeNull();
  expect(f.button("Start the call")?.hasAttribute("disabled")).toBe(false);
  expect(host.querySelector("footer")?.className).toBe("is-calling");

  await f.click("Start the call");
  // The route got the picked question, with an id the browser made, and the room joined with the ticket the start gave.
  expect(sent[0]).toMatchObject({ type: "start", question: { source: "workbook", workbookId: "wb1", page: 3, question: 2 } });
  expect(String(sent[0].id)).toMatch(/^[0-9a-f-]{36}$/);
  expect((rooms[0] as unknown as { connected: unknown[] }).connected).toEqual(["ws://fake", "t-start"]);
  expect(host.textContent).toContain("Maya is joining…");

  await join(rooms[0]);
  expect(host.textContent).toContain("On the call");
  expect(host.textContent).toContain("Maya is listening");
  expect(host.textContent).toContain("Hang up");
  expect(host.querySelector("#voice-board")).not.toBeNull();

  // The worker says the call ended: the saved call is read again, and its lines show.
  await act(async () => rooms[0].emit("DataReceived", new TextEncoder().encode(JSON.stringify({ segment: 1, ended: true })), worker(), undefined, "maya.call"));
  expect(host.textContent).toContain("The call is over. Look at our board.");
  await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
  expect(sent.some((b) => b.type === "read" && b.id === sent[0].id)).toBe(true);
  expect(host.textContent).toContain("Hi! Let us start.");
  // Until the child is back on the page, the time left counts from the week before the call.
  expect(host.textContent).toContain("20 minutes left this week");

  await f.click("Back to my page");
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  // Back on the page, the week is read again: the ended call counts its real time.
  expect(host.textContent).toContain("Calls18 minutes left this week");
  expect(host.textContent).toContain("Call Maya");
  expect(host.textContent).not.toContain("Hi! Let us start.");
  expect(host.querySelector("#voice-board")).toBeNull();
  expect(host.querySelector("footer")?.className).toBe("");
});

it("hangs up through Maya's worker and shows Hanging up, never a failed connection", async () => {
  answer = (body) => body.type === "start"
    ? { call: call(), ticket: { url: "ws://fake", token: "t", room: "r", identity: "child", expiresAt: "x" }, usage: USAGE }
    : { call: call({ ended: true, started: true }), usage: USAGE };
  const f = await mount();
  await f.click("Call Maya"); await f.click("Start the call"); await join(rooms[0]);
  await f.click("Hang up");
  expect(rooms[0].localParticipant.performRpc).toHaveBeenCalledWith(expect.objectContaining({ method: "maya.hang_up", destinationIdentity: "maya-1" }));
  expect(rooms[0].disconnect).toHaveBeenCalledOnce();
  expect(host.textContent).not.toContain("cut off");
  await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
  expect(host.textContent).toContain("Back to my page");
});

it("lets the child try again after a drop with a new ticket, and stop a call Maya never joined", async () => {
  answer = (body) => body.type === "token"
    ? { call: null, ticket: { url: "ws://fake", token: "t-new", room: "r", identity: "child", expiresAt: "x" }, usage: USAGE }
    : body.type === "start" ? { call: call(), ticket: { url: "ws://fake", token: "t0", room: "r", identity: "child", expiresAt: "x" }, usage: USAGE }
    : { call: call(), usage: USAGE };
  const f = await mount();
  await f.click("Call Maya"); await f.click("Start the call");
  // The room drops before Maya joined.
  await act(async () => rooms[0].emit("Disconnected"));
  expect(host.textContent).toContain("The call was cut off. Tap Try again.");
  expect(f.button("Stop the call")).toBeDefined();
  await f.click("Try again");
  expect(sent.some((b) => b.type === "token")).toBe(true);
  expect((rooms[1] as unknown as { connected: unknown[] }).connected).toEqual(["ws://fake", "t-new"]);
  await act(async () => rooms[1].emit("Disconnected"));
  await f.click("Stop the call");
  expect(sent.some((b) => b.type === "cancel" && b.id === sent[0].id)).toBe(true);
  expect(host.textContent).toContain("Call Maya");
});

it("tells a child whose microphone is blocked how to allow it, and starts no call", async () => {
  const f = await mount({ mic: "blocked" });
  await f.click("Call Maya");
  expect(host.textContent).toContain("The microphone is turned off for this page.");
  expect(host.textContent).toContain("Then tap Check again.");
  expect(f.button("Start the call")?.hasAttribute("disabled")).toBe(true);
  expect(sent).toEqual([]);
  await f.click("Not now");
  expect(host.textContent).toContain("Call Maya");
});

it("says a missing microphone plainly", async () => {
  const f = await mount({ mic: "none" });
  await f.click("Call Maya");
  expect(host.textContent).toContain("We cannot find a microphone.");
});

it("shows the refusal of a start in plain words, and returns to the control", async () => {
  answer = () => ({ call: null, usage: { ...USAGE, leftSeconds: 5 }, error: "voice_week_used" });
  const f = await mount();
  await f.click("Call Maya"); await f.click("Start the call");
  expect(rooms).toHaveLength(0);
  expect(host.textContent).toContain("You've used Maya's call time for this week. She'll be back on Monday.");
  expect(host.textContent).toContain("Used this week");
  expect(f.button("Call Maya")).toBeUndefined();
});

it("asks the server to end a call whose start got no answer, then lets the child try again", async () => {
  let calls = 0;
  const f = await mount();
  answer = () => { calls++; throw new Error("offline"); };
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => { sent.push(JSON.parse(init.body)); throw new Error("offline"); }));
  await f.click("Call Maya"); await f.click("Start the call");
  expect(sent.map((b) => b.type)).toEqual(["start", "cancel"]);
  expect(sent[1].id).toBe(sent[0].id);
  expect(host.textContent).toContain("The call did not start. Try again in a moment.");
  expect(f.button("Call Maya")).toBeDefined();
  expect(calls).toBe(0);
});
