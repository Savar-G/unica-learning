// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceUsage } from "@/lib/maya-voice-desk";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement("a", { href, ...rest }, children as never) }));

type Participant = { identity: string; kind: number; attributes: Record<string, string> };
interface FakeRoom {
  remoteParticipants: Map<string, Participant>;
  emit(event: string, ...args: unknown[]): void;
  disconnect: ReturnType<typeof vi.fn>;
}
const rooms = vi.hoisted(() => [] as FakeRoom[]);
vi.mock("livekit-client", () => {
  class Room {
    remoteParticipants = new Map<string, Participant>();
    handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    localParticipant = {
      registerRpcMethod: vi.fn(), setMicrophoneEnabled: vi.fn(async () => {}), performRpc: vi.fn(async () => {}),
      getTrackPublication: () => ({ track: { stop: vi.fn() } }), unpublishTrack: vi.fn(async () => {}),
    };
    registerTextStreamHandler() {}
    constructor() { rooms.push(this as never); }
    on(event: string, fn: (...args: unknown[]) => void) { this.handlers.set(event, [...this.handlers.get(event) ?? [], fn]); }
    emit(event: string, ...args: unknown[]) { for (const fn of this.handlers.get(event) ?? []) fn(...args); }
    async connect() {}
    async startAudio() {}
    disconnect = vi.fn(async () => { this.emit("Disconnected"); });
  }
  return { Room, RoomEvent: new Proxy({}, { get: (_, key) => key }), Track: { Kind: { Audio: "audio" }, Source: { Microphone: "microphone" } }, ParticipantKind: { AGENT: 4 } };
});

const { Desk } = await import("@/components/desk");
const { EXCHANGE_OBJECT } = await import("@/lib/maya/checked-exchange");
const { LEASE_SETTLE_MS } = await import("@/lib/board-tab");

const CHILD = "45100000-0000-4000-8000-000000000041";
const BOOK = { id: "45100000-0000-4000-8000-000000000031", number: 1, sent: null };
const VOICE_USAGE: VoiceUsage = { usedSeconds: 600, leftSeconds: 1200, limitSeconds: 600, resetsAt: "2026-11-24T03:00:00.000Z", zone: "America/Vancouver" };
const WORKER: Participant = { identity: "maya-1", kind: 4, attributes: { "maya.segment": "1", "lk.agent.state": "listening" } };
type ReadyProps = Extract<ComponentProps<typeof Desk>, { books: unknown }>;
const props = (extra: Partial<ReadyProps> = {}): ReadyProps => ({
  name: "Sam", childId: CHILD, chatUsage: { used: 0, left: 60, resetsAt: Date.now() + 86_400_000, backAt: "tomorrow" },
  books: [BOOK], book: BOOK, page: { number: 4, dayLabel: "Day 2", pages: [3, 4, 5] }, image: null, areas: [],
  questions: [{ number: 3, text: "52 − 28", crop: null, board: null }], picked: 3, openPicker: false, fromQr: false, ...extra,
});

function stubMic() {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("AudioContext", class {
    createAnalyser() { return { fftSize: 512, getByteTimeDomainData: (a: Uint8Array) => a.fill(128) }; }
    createMediaStreamSource() { return { connect() {} }; }
    async close() {}
  });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
}

function cssRules(css: string): { media: string | null; selector: string; body: string }[] {
  const out: { media: string | null; selector: string; body: string }[] = [];
  const read = (text: string, media: string | null) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) { depth += text[j] === "{" ? 1 : text[j] === "}" ? -1 : 0; j++; }
      const head = text.slice(i, open).trim();
      const inner = text.slice(open + 1, j - 1);
      if (head.startsWith("@media")) read(inner, head.slice(6).trim());
      else if (!head.startsWith("@")) out.push({ media, selector: head, body: inner });
      i = j;
    }
  };
  read(css.replace(/\/\*[\s\S]*?\*\//g, ""), null);
  return out;
}

let root: Root, host: HTMLDivElement;
const render = (p: ReadyProps = props()) => act(async () => root.render(createElement(Desk, p)));
const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  vi.clearAllMocks();
  rooms.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));
  localStorage.clear(); sessionStorage.clear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); rooms.length = 0; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("the board-led lesson (#1151)", () => {
  it("keeps the question, board and reply controls ahead of a collapsed transcript and collapsed navigation", async () => {
    await render();
    const question = host.querySelector('[aria-label="Current question"]')!;
    expect(question.textContent).toContain("52 − 28");
    expect(question.textContent).toContain("Workbook 1");
    const board = host.querySelector(".desk-board")!;
    const reply = host.querySelector('input[aria-label="Page and question number"]')!;
    const transcript = [...host.querySelectorAll("details")].find((d) => d.querySelector("summary")?.textContent === "Transcript")!;
    const nav = [...host.querySelectorAll("details")].find((d) => d.querySelector("summary")?.textContent === "Workbook navigation")!;
    expect(transcript.open).toBe(false);
    expect(nav.open).toBe(false);
    expect(before(question, board) && before(board, reply) && before(reply, transcript) && before(transcript, nav)).toBe(true);
    // Maya's latest words show outside the transcript; the whole conversation stays inside it.
    const says = host.querySelector('[aria-label="Maya says"]')!;
    expect(says.textContent).toContain("Which question are you on?");
    expect(transcript.textContent).toContain("Which question are you on?");
    expect(nav.textContent).toContain("Workbooks");
  });

  it("shows Leave desk in the top bar, before the lesson", async () => {
    await render();
    const leave = button("Leave desk")!;
    expect(leave.closest("header")?.classList.contains("desk-top")).toBe(true);
    expect(before(leave, host.querySelector('[aria-label="Current question"]')!)).toBe(true);
  });

  it("switches to paper and back without losing the question or the board underneath", async () => {
    await render();
    const board = host.querySelector(".desk-board")!;
    await act(async () => button("Use paper")!.click());
    expect(button("Show board")!.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector(".desk-root")!.getAttribute("data-paper")).toBe("true");
    expect(host.textContent).toContain("Write this step in your workbook.");
    expect(host.querySelector('[aria-label="Current question"]')!.textContent).toContain("52 − 28");
    // The same board stays mounted, so its ink and a completed step are there when the child comes back.
    expect(host.querySelector(".desk-board")).toBe(board);
    await act(async () => button("Show board")!.click());
    expect(host.querySelector(".desk-root")!.hasAttribute("data-paper")).toBe(false);
    expect(host.querySelector(".desk-board")).toBe(board);
    expect(button("Use paper")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps paper on when a chat starts, and gives the checked move the single paper choice of the question", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const id = "45100000-0000-4000-8000-000000000021";
    const target = { lessonId: "lesson", turnId: "prompt", boardRevision: 2, objectId: EXCHANGE_OBJECT, batchId: "show-tens" };
    const show = { transactionId: target.batchId, commands: [{ op: "model", id: target.objectId, model: { kind: "base_ten", hundreds: 0, tens: 5, ones: 2 }, place: { region: "main" } }] };
    const chat = { id, revision: 2, pending: false, ended: false, transcript: [{ speaker: "maya", text: "How can you get more ones?" }], batches: [show], hint: 0, safetyMessage: null, exchange: target };
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) =>
      url === "/api/desk/chat" && JSON.parse(String(options?.body)).type === "start"
        ? Response.json({ usage: { used: 1, left: 59, resetsAt: Date.now() + 86_400_000, backAt: "tomorrow" }, chat })
        : Response.json({ ok: true, acked: 0 })));
    try {
      await render();
      await act(async () => button("Use paper")!.click());
      await act(async () => button("Chat with Maya")!.click());
      await act(async () => { await vi.advanceTimersByTimeAsync(LEASE_SETTLE_MS); });
      expect(host.querySelector('[aria-label="Maya says"]')!.textContent).toContain("How can you get more ones?");
      // The chat's board took over from the question's board; paper stays on and the checked move waits for the board.
      expect(button("Show board")!.getAttribute("aria-pressed")).toBe("true");
      expect(button("Exchange one ten")).toBeUndefined();
      expect(host.textContent).toContain("Show the trade on your paper.");
      // One paper control on the desk: the checked move follows the question's choice and offers no second toggle.
      expect(button("Use board")).toBeUndefined();
      await act(async () => button("Show board")!.click());
      expect([...host.querySelectorAll("button")].filter((b) => /^Use (paper|board)$/.test(b.textContent!.trim()))).toHaveLength(1);
      expect(button("Exchange one ten")).toBeDefined();
    } finally { vi.useRealTimers(); }
  });

  it("disables the question picker and ignores question changes while a call is engaged", async () => {
    stubMic();
    let voiceId = "v1";
    const voiceCall = (ended = false) => ({ id: voiceId, revision: 1, ended, transcript: [], batches: [], hint: 0, safetyMessage: null, mode: "voice" as const, started: !ended, status: ended ? "ended" as const : "live" as const });
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      if (url === "/api/desk/voice") {
        const body = JSON.parse(String(options?.body)) as { type: string; id: string };
        voiceId = body.id;
        return Response.json({
          call: voiceCall(body.type === "cancel" || body.type === "read"),
          usage: VOICE_USAGE,
          ...(body.type === "start" ? { ticket: { url: "ws://fake", token: "t1", room: "r", identity: "child", expiresAt: "x" } } : {}),
        });
      }
      return Response.json({});
    }));
    await render(props({
      voice: { usage: VOICE_USAGE },
      image: { url: "/page-4.png", width: 850, height: 1100 },
      areas: [
        { question: 3, left: 5, top: 10, width: 40, height: 30 },
        { question: 4, left: 50, top: 10, width: 40, height: 30 },
      ],
      questions: [
        { number: 3, text: "52 − 28", crop: null, board: null },
        { number: 4, text: "63 − 27", crop: null, board: null },
      ],
      picked: 3,
    }));
    expect(button("Pick another question")!.disabled).toBe(false);
    await act(async () => button("Call Maya")!.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(button("Pick another question")!.disabled).toBe(true);
    expect(button("Workbooks")!.disabled).toBe(true);
    const q4 = host.querySelector<HTMLButtonElement>('button[aria-label="Question 4"]')!;
    expect(q4.disabled).toBe(true);
    await act(async () => q4.click());
    expect(host.querySelector('[aria-label="Current question"]')!.textContent).toContain("52 − 28");

    await act(async () => button("Start the call")!.click());
    await act(async () => {
      rooms[0].remoteParticipants.set(WORKER.identity, WORKER);
      rooms[0].emit("ParticipantConnected", WORKER);
    });
    expect(host.textContent).toContain("On the call");
    expect(button("Pick another question")!.disabled).toBe(true);
    // Even if a picker tap area is invoked directly (e.g., programmatic click), the live call's question stays fixed.
    q4.disabled = false;
    await act(async () => q4.click());
    expect(host.querySelector('[aria-label="Current question"]')!.textContent).toContain("52 − 28");
    expect(host.querySelector('[aria-label="Current question"]')!.textContent).not.toContain("63 − 27");

    await act(async () => rooms[0].emit("DataReceived", new TextEncoder().encode(JSON.stringify({ segment: 1, ended: true })), WORKER, undefined, "maya.call"));
    await act(async () => button("Back to my page")!.click());
    expect(button("Pick another question")!.disabled).toBe(false);
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Question 4"]')!.disabled).toBe(false);
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Question 4"]')!.click());
    expect(host.querySelector('[aria-label="Current question"]')!.textContent).toContain("63 − 27");
  });

  it("shows 'Show me on the board' only when the chat board drawing is visible", async () => {
    stubMic();
    const id = "45100000-0000-4000-8000-000000000022";
    const show = { transactionId: "show-tens", commands: [{ op: "model", id: EXCHANGE_OBJECT, model: { kind: "base_ten", hundreds: 0, tens: 5, ones: 2 }, place: { region: "main" } }] };
    const chat = (ended = false) => ({ id, revision: ended ? 3 : 2, pending: false, ended, transcript: [{ speaker: "maya", text: "Look at the blocks." }], batches: [show], hint: 0, safetyMessage: null });
    let voiceId = "v2";
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body ?? "{}")) as { type?: string; id?: string };
      if (url === "/api/desk/chat") {
        return Response.json({ usage: { used: 1, left: 59, resetsAt: Date.now() + 86_400_000, backAt: "tomorrow" }, chat: chat(body.type === "end") });
      }
      if (url === "/api/desk/voice") {
        voiceId = body.id ?? voiceId;
        return Response.json({
          call: { id: voiceId, revision: 1, ended: body.type === "cancel", transcript: [], batches: [], hint: 0, safetyMessage: null, mode: "voice", started: true, status: body.type === "cancel" ? "ended" : "live" },
          usage: VOICE_USAGE,
          ...(body.type === "start" ? { ticket: { url: "ws://fake", token: "t1", room: "r", identity: "child", expiresAt: "x" } } : {}),
        });
      }
      return Response.json({ ok: true, held: 0 });
    }));
    await render(props({ voice: { usage: VOICE_USAGE } }));
    await act(async () => button("Chat with Maya")!.click());
    expect(host.querySelector("#chat-board")).not.toBeNull();
    expect(button("Show me on the board")).toBeDefined();

    // Paper mode hides the board canvas: the scroll-to-board action hides with it.
    await act(async () => button("Use paper")!.click());
    expect(button("Show me on the board")).toBeUndefined();
    await act(async () => button("Show board")!.click());
    expect(button("Show me on the board")).toBeDefined();

    // During a call, VoiceBoard replaces #chat-board: the chat board action must not point to an unmounted node.
    await act(async () => button("Call Maya")!.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await act(async () => button("Start the call")!.click());
    await act(async () => {
      rooms[0].remoteParticipants.set(WORKER.identity, WORKER);
      rooms[0].emit("ParticipantConnected", WORKER);
    });
    expect(host.querySelector("#chat-board")).toBeNull();
    expect(button("Show me on the board")).toBeUndefined();

    // After returning from the call, #chat-board is visible again, so the action returns.
    await act(async () => rooms[0].emit("DataReceived", new TextEncoder().encode(JSON.stringify({ segment: 1, ended: true })), WORKER, undefined, "maya.call"));
    await act(async () => button("Back to my page")!.click());
    expect(host.querySelector("#chat-board")).not.toBeNull();
    expect(button("Show me on the board")).toBeDefined();
  });

  it("gives the board row a usable minimum height and lets the desk scroll when rows exceed the viewport", () => {
    const rules = cssRules(readFileSync("src/components/desk.css", "utf8"));
    const base = (selector: string) => rules.filter((r) => r.media === null && r.selector === selector).map((r) => r.body).join(";");
    const rootCss = base(".desk-root");
    expect(rootCss).toMatch(/min-height:\s*100dvh/);
    expect(rootCss).not.toMatch(/(?<![a-z-])height:\s*100dvh/);
    const bodyCss = base(".desk-body");
    const boardMin = bodyCss.match(/grid-template-rows:\s*auto\s+minmax\((\d+)px,\s*1fr\)\s+auto\s+auto/);
    expect(boardMin, `expected a pixel floor on the board row in .desk-body: ${bodyCss}`).not.toBeNull();
    expect(Number(boardMin![1])).toBeGreaterThanOrEqual(320);
  });
});
