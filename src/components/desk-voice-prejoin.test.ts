// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PREMADE_LIFE_MS, useDeskVoice, VoiceControls, VoiceLimit } from "./desk-voice";
import type { DeskVoiceCall, DeskVoiceReply, VoiceUsage } from "@/lib/maya-voice-desk";

// The desk makes the call when the microphone check opens, and joins its room before "Start the call"
// (docs/maya-voice.md, "The child joins the room before the Connect tap"). Driven through the desk's hook and screen,
// with a fake LiveKit room and a fake route that keeps the server's one rule that matters here: one live call per child
// (index maya_calls_one_live_family_call), "busy" for a second one. What it proves: when the call is made, joined,
// taken and cancelled, and what is sent. What it does not prove: real audio, a real microphone, a real tab that the
// browser freezes, or the real route (src/lib/maya-voice-desk-server.test.ts covers the server).

type Participant = { identity: string; kind: number; attributes: Record<string, string> };
interface TestRoom {
  remoteParticipants: Map<string, Participant>;
  emit(event: string, ...args: unknown[]): void;
  connected: unknown[];
  disconnect: ReturnType<typeof vi.fn>;
  startAudio: ReturnType<typeof vi.fn>;
  localParticipant: { setMicrophoneEnabled: ReturnType<typeof vi.fn>; performRpc: ReturnType<typeof vi.fn> };
}
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
    async connect(url: string, token: string) { this.connected = [url, token]; }
    startAudio = vi.fn(async () => {});
    disconnect = vi.fn(async () => { this.emit("Disconnected"); });
  }
  return { Room, RoomEvent: new Proxy({}, { get: (_, key) => key }), Track: { Kind: { Audio: "audio" }, Source: { Microphone: "microphone" } }, ParticipantKind: { AGENT: 4 } };
});

const USAGE: VoiceUsage = { usedSeconds: 600, leftSeconds: 1200, limitSeconds: 600, resetsAt: "2026-11-17T03:00:00.000Z", zone: "America/Vancouver" };

/** The route in memory: the calls it made, which are live, and every request with its keepalive flag. */
const server = {
  live: new Set<string>(),
  ended: new Set<string>(),
  tickets: 0,
  sent: [] as Array<{ type: string; id: string; keepalive: boolean }>,
  /** Requests that get no answer (the network failed), by type. */
  lose: [] as string[],
  /** Requests whose answer waits until the test lets it go, by type. */
  hold: [] as string[],
  held: [] as Array<() => void>,
  /** The start's answer when the week is used or the server refuses. */
  refuse: null as DeskVoiceReply | null,
};
const view = (id: string, over: Partial<DeskVoiceCall> = {}): DeskVoiceCall => ({ id, revision: 1, ended: server.ended.has(id), transcript: [], batches: [], hint: 0, safetyMessage: null, mode: "voice", started: false, status: server.live.has(id) ? "live" : "ended", ...over });
function route(body: { type: string; id: string }): DeskVoiceReply {
  const ticket = () => ({ url: "ws://fake", token: `t${++server.tickets}`, room: `maya-call-${body.id}`, identity: "child", expiresAt: "x" });
  // The server counts a live call at its whole limit (10 minutes).
  const counted = { ...USAGE, usedSeconds: 1200, leftSeconds: 600 };
  switch (body.type) {
    case "start":
      if (server.refuse) return server.refuse;
      if (server.live.has(body.id)) return { call: view(body.id), ticket: ticket(), usage: counted };
      if (server.live.size > 0) return { call: null, usage: USAGE, error: "busy" };
      server.live.add(body.id);
      return { call: view(body.id), ticket: ticket(), usage: counted };
    case "token": return server.live.has(body.id) ? { call: view(body.id), ticket: ticket(), usage: counted } : { call: null, usage: USAGE, error: "not_found" };
    case "cancel":
      if (!server.live.has(body.id) && !server.ended.has(body.id)) return { call: null, usage: USAGE, error: "not_found" };
      server.live.delete(body.id); server.ended.add(body.id);
      return { call: view(body.id), usage: USAGE };
    default: return server.live.has(body.id) || server.ended.has(body.id) ? { call: view(body.id), usage: USAGE } : { call: null, usage: USAGE, error: "not_found" };
  }
}
const sentOf = (type: string) => server.sent.filter((s) => s.type === type);

let root: Root | undefined;
let host: HTMLDivElement;
let visibility: DocumentVisibilityState = "visible";
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined; host?.remove(); rooms.length = 0;
  Object.assign(server, { live: new Set(), ended: new Set(), tickets: 0, sent: [], lose: [], hold: [], held: [], refuse: null });
  visibility = "visible";
  vi.unstubAllGlobals(); vi.useRealTimers();
});

const settle = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });

function Harness({ question = 2, usage = USAGE }: { question?: number | null; usage?: VoiceUsage }) {
  const state = useDeskVoice({ usage }, { book: "wb1", page: 3, question });
  return createElement("div", null, createElement("dl", null, createElement(VoiceLimit, { state })), createElement(VoiceControls, { state }));
}

let micMode: "ok" | "none" = "ok";
async function mount(opts: { strict?: boolean; mic?: "ok" | "none"; usage?: VoiceUsage } = {}) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string; keepalive?: boolean }) => {
    const body = JSON.parse(init.body) as { type: string; id: string };
    server.sent.push({ type: body.type, id: body.id, keepalive: init.keepalive === true });
    if (server.hold.includes(body.type)) {
      server.hold.splice(server.hold.indexOf(body.type), 1);
      await new Promise<void>((resolve) => server.held.push(resolve));
    }
    if (server.lose.includes(body.type)) {
      server.lose.splice(server.lose.indexOf(body.type), 1);
      throw new Error("offline");
    }
    const answer = route(body);
    return { json: async () => answer };
  }));
  vi.stubGlobal("AudioContext", class {
    createAnalyser() { return { fftSize: 512, getByteTimeDomainData: (a: Uint8Array) => a.fill(128) }; }
    createMediaStreamSource() { return { connect() {} }; }
    async close() {}
  });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  micMode = opts.mic ?? "ok";
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
    getUserMedia: async () => {
      if (micMode === "none") throw new DOMException("no", "NotFoundError");
      return { getTracks: () => [{ stop() {} }] };
    },
  } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const render = (question: number | null = 2) => {
    const app = createElement(Harness, { question, usage: opts.usage ?? USAGE });
    return act(async () => root!.render(opts.strict ? createElement(StrictMode, null, app) : app));
  };
  await render();
  const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === label);
  const click = async (label: string) => { const b = button(label); expect(b, label).toBeDefined(); await act(async () => b!.click()); await settle(); };
  return { click, button, render };
}
/** Rooms still joined: every room the screen made and has not left. */
const joined = () => rooms.filter((r) => r.connected.length > 0 && r.disconnect.mock.calls.length === 0);

it("makes the call and its ticket when the microphone check opens, and joins the room with the microphone off", async () => {
  const f = await mount();
  await f.click("Call Maya");
  expect(server.sent).toEqual([{ type: "start", id: expect.stringMatching(/^[0-9a-f-]{36}$/), keepalive: false }]);
  expect(rooms).toHaveLength(1);
  expect(rooms[0].connected).toEqual(["ws://fake", "t1"]);
  expect(rooms[0].localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
  expect(rooms[0].startAudio).not.toHaveBeenCalled();
  // The screen is still the microphone check, and the minutes are the week before the call, not the server's count of
  // the call made for the check at its whole limit.
  expect(host.textContent).toContain("Your microphone works.");
  expect(host.textContent).toContain("Calls20 minutes left this week");

  // "Start the call" only goes live: no new start, no new ticket, no new room.
  await f.click("Start the call");
  expect(server.sent.map((s) => s.type)).toEqual(["start"]);
  expect(rooms).toHaveLength(1);
  expect(rooms[0].localParticipant.setMicrophoneEnabled).toHaveBeenCalledOnce();
  expect(rooms[0].startAudio).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Maya is joining…");
  expect(host.textContent).toContain("Calls20 minutes left this week");
});

it("cancels a call made for the check after 60 s with no tap; Start the call then starts in full with a new call", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const f = await mount();
  await f.click("Call Maya");
  const first = sentOf("start")[0].id;
  await act(async () => { vi.advanceTimersByTime(PREMADE_LIFE_MS - 1); });
  await settle();
  expect(sentOf("cancel")).toEqual([]);
  expect(rooms[0].disconnect).not.toHaveBeenCalled();
  await act(async () => { vi.advanceTimersByTime(1); });
  await settle();
  // Cancel = leave the room and the route's cancel: the server holds no live call.
  expect(sentOf("cancel")).toEqual([{ type: "cancel", id: first, keepalive: false }]);
  expect(rooms[0].disconnect).toHaveBeenCalledOnce();
  expect(server.live.size).toBe(0);
  // The screen still lets the child start.
  expect(host.textContent).toContain("Your microphone works.");
  expect(f.button("Start the call")?.hasAttribute("disabled")).toBe(false);

  await f.click("Start the call");
  const starts = sentOf("start");
  expect(starts).toHaveLength(2);
  expect(starts[1].id).not.toBe(first);
  expect(rooms).toHaveLength(2);
  expect(rooms[1].connected).toEqual(["ws://fake", "t2"]);
  expect(rooms[1].localParticipant.setMicrophoneEnabled).toHaveBeenCalledOnce();
  expect(server.live).toEqual(new Set([starts[1].id]));
  expect(host.textContent).toContain("Maya is joining…");
});

it("cancels the call made for the check when the child taps Not now, and opening it again waits for that cancel", async () => {
  const f = await mount();
  await f.click("Call Maya");
  const first = sentOf("start")[0].id;
  server.hold.push("cancel");
  await f.click("Not now");
  expect(rooms[0].disconnect).toHaveBeenCalledOnce();
  expect(sentOf("cancel").map((s) => s.id)).toEqual([first]);
  expect(host.textContent).toContain("Call Maya");

  // Opening the check again at once: no start goes until the cancel answered, so the second start is not "busy".
  await f.click("Call Maya");
  expect(sentOf("start")).toHaveLength(1);
  await act(async () => { server.held.forEach((go) => go()); });
  await settle();
  const starts = sentOf("start");
  expect(starts).toHaveLength(2);
  expect(starts[1].id).not.toBe(first);
  expect(server.live).toEqual(new Set([starts[1].id]));
  expect(joined()).toHaveLength(1);
  expect(host.textContent).toContain("Your microphone works.");
});

it("reads and cancels this screen's own live call when a start answers busy, then starts (a cancel that was lost)", async () => {
  const f = await mount();
  await f.click("Call Maya");
  const first = sentOf("start")[0].id;
  server.lose.push("cancel");
  await f.click("Not now");
  // The cancel got no answer: the first call is still live on the server.
  expect(server.live).toEqual(new Set([first]));

  await f.click("Call Maya");
  expect(server.sent.slice(2).map((s) => `${s.type}:${s.id === first ? "first" : "new"}`)).toEqual(["start:new", "read:first", "cancel:first", "start:new"]);
  const second = sentOf("start")[1].id;
  expect(server.live).toEqual(new Set([second]));
  expect(host.textContent).toContain("Your microphone works.");
  expect(host.textContent).not.toContain("Maya cannot take a call right now.");
  expect(joined()).toHaveLength(1);
});

it("shows today's busy words when the live call is not one this screen made (another tab)", async () => {
  const f = await mount();
  server.live.add("99999999-9999-4999-8999-999999999999");
  await f.click("Call Maya");
  expect(server.sent.map((s) => s.type)).toEqual(["start"]);
  expect(host.textContent).toContain("Maya cannot take a call right now. Try again later.");
  expect(f.button("Call Maya")).toBeDefined();
  expect(rooms).toHaveLength(0);
});

it("shows a child over the week the used-up words as the check opens, with no room and no broken screen", async () => {
  server.refuse = { call: null, usage: { ...USAGE, usedSeconds: 1790, leftSeconds: 10 }, error: "voice_week_used" };
  const f = await mount();
  await f.click("Call Maya");
  expect(host.textContent).toContain("You've used Maya's call time for this week. She'll be back on Monday.");
  expect(host.textContent).toContain("Used this week");
  expect(host.textContent).not.toContain("Your microphone works.");
  expect(f.button("Call Maya")).toBeUndefined();
  expect(rooms).toHaveLength(0);
});

it("makes one call and holds one room in React strict mode", async () => {
  const f = await mount({ strict: true });
  await f.click("Call Maya");
  expect(sentOf("start")).toHaveLength(1);
  expect(server.live.size).toBe(1);
  expect(joined()).toHaveLength(1);
  await f.click("Start the call");
  expect(sentOf("start")).toHaveLength(1);
  expect(joined()).toHaveLength(1);
  expect(joined()[0].localParticipant.setMicrophoneEnabled).toHaveBeenCalledOnce();
});

it("cancels with keepalive when the desk closes during the check, and leaves the room", async () => {
  const f = await mount();
  await f.click("Call Maya");
  const first = sentOf("start")[0].id;
  void f;
  await act(async () => root!.unmount());
  root = undefined;
  await settle();
  expect(sentOf("cancel")).toEqual([{ type: "cancel", id: first, keepalive: true }]);
  expect(rooms[0].disconnect).toHaveBeenCalledOnce();
  expect(server.live.size).toBe(0);
});

it("cancels with keepalive on pagehide; Start the call afterwards starts in full", async () => {
  const f = await mount();
  await f.click("Call Maya");
  const first = sentOf("start")[0].id;
  await act(async () => { window.dispatchEvent(new Event("pagehide")); });
  await settle();
  expect(sentOf("cancel")).toEqual([{ type: "cancel", id: first, keepalive: true }]);
  expect(rooms[0].disconnect).toHaveBeenCalledOnce();
  await f.click("Start the call");
  expect(sentOf("start")[1].id).not.toBe(first);
  expect(rooms[1].localParticipant.setMicrophoneEnabled).toHaveBeenCalledOnce();
});

it("cancels the call made for the check when the child picks another question", async () => {
  const f = await mount();
  await f.click("Call Maya");
  await f.render(3);
  await settle();
  expect(sentOf("cancel")).toHaveLength(1);
  expect(server.live.size).toBe(0);
  expect(rooms[0].disconnect).toHaveBeenCalledOnce();
  expect(f.button("Call Maya")).toBeDefined();
});

it("cancels it when the tab shows again after more than 60 s hidden, though the hidden tab's timer never ran", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-11-12T20:00:00Z"));
  const f = await mount();
  await f.click("Call Maya");
  visibility = "hidden";
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  vi.setSystemTime(Date.parse("2026-11-12T20:00:59Z"));
  visibility = "visible";
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  await settle();
  expect(sentOf("cancel")).toEqual([]);
  visibility = "hidden";
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  vi.setSystemTime(Date.parse("2026-11-12T20:01:01Z"));
  visibility = "visible";
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  await settle();
  expect(sentOf("cancel")).toHaveLength(1);
  expect(rooms[0].disconnect).toHaveBeenCalledOnce();
  expect(server.live.size).toBe(0);
  expect(f.button("Start the call")?.hasAttribute("disabled")).toBe(false);
});

it("cancels it when the microphone fails, and Check again makes a new one once the microphone works", async () => {
  const f = await mount({ mic: "none" });
  await f.click("Call Maya");
  expect(host.textContent).toContain("We cannot find a microphone.");
  const first = sentOf("start")[0].id;
  expect(sentOf("cancel").map((s) => s.id)).toEqual([first]);
  expect(server.live.size).toBe(0);
  expect(joined()).toHaveLength(0);

  micMode = "ok";
  await f.click("Check again");
  expect(host.textContent).toContain("Your microphone works.");
  const starts = sentOf("start");
  expect(starts).toHaveLength(2);
  expect(starts[1].id).not.toBe(first);
  expect(server.live).toEqual(new Set([starts[1].id]));
  expect(joined()).toHaveLength(1);
  // Check again while that call is ready makes no other call.
  await f.click("Check again");
  expect(sentOf("start")).toHaveLength(2);
});

it("rejoins after a drop with a new ticket for the same call, and never makes a second call", async () => {
  const f = await mount();
  await f.click("Call Maya");
  await f.click("Start the call");
  const id = sentOf("start")[0].id;
  await act(async () => rooms[0].emit("Disconnected"));
  expect(host.textContent).toContain("The call was cut off. Tap Try again.");
  await f.click("Try again");
  expect(sentOf("token")).toEqual([{ type: "token", id, keepalive: false }]);
  expect(rooms).toHaveLength(2);
  expect(rooms[1].connected).toEqual(["ws://fake", "t2"]);
  expect(sentOf("start")).toHaveLength(1);
  expect(server.live).toEqual(new Set([id]));
});

it("waits for a start still under way when the child taps quickly, and joins with its ticket", async () => {
  const f = await mount();
  server.hold.push("start");
  await f.click("Call Maya");
  await f.click("Start the call");
  expect(host.textContent).toContain("Starting the call…");
  await act(async () => { server.held.forEach((go) => go()); });
  await settle();
  expect(sentOf("start")).toHaveLength(1);
  expect(rooms).toHaveLength(1);
  expect(rooms[0].connected).toEqual(["ws://fake", "t1"]);
  expect(rooms[0].localParticipant.setMicrophoneEnabled).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Maya is joining…");
});
