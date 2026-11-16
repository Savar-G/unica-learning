// @vitest-environment happy-dom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatControls, useDeskChat, type DeskChatState } from "@/components/desk-chat";
import type { ChatReply, ChatView } from "@/lib/maya-chat";

// #1107: the desk reads a child turn's stream at the public hook. One Maya message grows from the checked sentences, the
// final reply replaces it with no echo, and a stream that breaks or stalls is a failed request: the words go, the message
// stays for its retry, and the desk is not busy any longer.

const book = "45100000-0000-4000-8000-000000000031";
const id = "45100000-0000-4000-8000-000000000021";
const CHILD = "45100000-0000-4000-8000-000000000041";
const view = (revision: number, transcript: ChatView["transcript"] = []): ChatView => ({ id, revision, pending: false, ended: false, transcript, batches: [], hint: 0, safetyMessage: null });
const reply = (revision: number, extra: Partial<ChatReply> = {}): ChatReply => ({ usage: { used: 1, left: 59, resetsAt: Date.now() + 86400000, backAt: "tomorrow" }, chat: view(revision), ...extra });
type Sent = { action: Record<string, unknown>; accept: string | null };
let root: Root, host: HTMLDivElement, state: DeskChatState;
const sent: Sent[] = [];
/** The open stream of the last child request: push lines, close it, or leave it open. */
let pipe: { push: (event: unknown) => void; close: () => void } | null = null;
let childAnswer: "stream" | "json" = "stream";

function Harness() {
  const chat = useDeskChat(reply(1).usage, { book, page: 1, question: 1 }, CHILD);
  useLayoutEffect(() => { state = chat; }, [chat]);
  return createElement(ChatControls, { state: chat, picked: true });
}
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear(); sessionStorage.clear(); sent.length = 0; pipe = null; childAnswer = "stream";
  vi.stubGlobal("fetch", async (_: string, options: RequestInit) => {
    const action = JSON.parse(String(options.body)) as Record<string, unknown>;
    sent.push({ action, accept: new Headers(options.headers).get("accept") });
    if (action.type !== "child" || childAnswer === "json") return Response.json(action.type === "child" ? reply(3, { admission: "accepted" }) : reply(1));
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        pipe = { push: (e) => c.enqueue(encoder.encode(`${JSON.stringify(e)}\n`)), close: () => c.close() };
        options.signal?.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")));
      },
    });
    return new Response(body, { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
  });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function opened() {
  await act(async () => root.render(createElement(Harness)));
  await act(async () => { await state.act("start"); });
}
const maya = () => state.chat!.transcript.filter((t) => t.speaker === "maya").map((t) => t.text);

describe("a child turn's stream on the desk", () => {
  it("grows one Maya message from the checked sentences, then the final reply replaces it with no echo", async () => {
    // Falsifier: the JSON-only desk cannot read the stream (no live words, and the reply fails to parse).
    await opened();
    let finished: Promise<boolean> = Promise.resolve(false);
    act(() => { finished = state.act("child", "Is it 36?"); });
    await flush();
    expect(sent.at(-1)!.accept).toContain("application/x-ndjson");
    expect(sent[0].accept).toBeNull();
    pipe!.push({ type: "say", index: 0, text: "12 minus 8 is 4." });
    await flush();
    expect(state.chat!.transcript.map((t) => [t.speaker, t.text])).toEqual([["child", "Is it 36?"], ["maya", "12 minus 8 is 4."]]);
    expect(state.busy).toBe(true);
    // The same sentence again (by index) is shown once; the next one grows the same message.
    pipe!.push({ type: "say", index: 0, text: "12 minus 8 is 4." });
    pipe!.push({ type: "say", index: 1, text: "What is 4 minus 2?" });
    await flush();
    expect(maya()).toEqual(["12 minus 8 is 4. What is 4 minus 2?"]);
    const saved: ChatView["transcript"] = [{ speaker: "child", text: "Is it 36?", second: 5 }, { speaker: "maya", text: "12 minus 8 is 4. What is 4 minus 2?", second: 5 }];
    pipe!.push({ type: "final", reply: reply(3, { chat: view(3, saved), admission: "accepted" }) });
    pipe!.close();
    await act(async () => { expect(await finished).toBe(true); });
    expect(state.chat!.transcript).toEqual(saved);
    expect(state.busy).toBe(false); expect(state.uncertain).toBe(false);
  });

  it("a sentence's drawing goes on the board with it, and the final reply holds it once", async () => {
    // Falsifier: the drawing waits for the final reply, or shows twice after it.
    await opened();
    let finished: Promise<boolean> = Promise.resolve(false);
    act(() => { finished = state.act("child", "I don't get 2 minus 8."); });
    await flush();
    const trade = { transactionId: `${id}-b2`, commands: [{ op: "regroup" }] } as never;
    pipe!.push({ type: "say", index: 0, text: "We trade 1 ten for 10 ones.", board: [trade] });
    await flush();
    expect(state.chat!.batches).toEqual([trade]);
    pipe!.push({ type: "final", reply: reply(3, { chat: { ...view(3), batches: [trade] }, admission: "accepted" }) });
    pipe!.close();
    await act(async () => { expect(await finished).toBe(true); });
    expect(state.chat!.batches).toEqual([trade]);
  });

  it("a stream cut before its final reply is a failed request: the words go, the message stays for the retry, the desk is free", async () => {
    // Falsifier: partial words kept as a finished turn, or the desk left busy.
    await opened();
    let finished: Promise<boolean> = Promise.resolve(true);
    act(() => { finished = state.act("child", "Is it 36?"); });
    await flush();
    pipe!.push({ type: "say", index: 0, text: "12 minus 8 is 4." });
    await flush();
    pipe!.close();
    await act(async () => { expect(await finished).toBe(false); });
    expect(state.chat!.transcript).toEqual([]);
    expect(state.busy).toBe(false); expect(state.uncertain).toBe(true);
    // The retry sends the same message (the server answers busy or done for it).
    childAnswer = "json";
    await act(async () => { await state.retry(); });
    expect(sent.at(-1)!.action).toEqual(sent.at(-2)!.action);
    expect(state.uncertain).toBe(false);
  });

  it("a stream that stalls is stopped at its limit: the desk is free and the message stays for the retry", async () => {
    await opened();
    let finished: Promise<boolean> = Promise.resolve(true);
    act(() => { finished = state.act("child", "Is it 36?"); });
    await flush();
    pipe!.push({ type: "say", index: 0, text: "12 minus 8 is 4." });
    await flush();
    expect(state.busy).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(125_000); });
    await act(async () => { expect(await finished).toBe(false); });
    expect(state.busy).toBe(false); expect(state.uncertain).toBe(true);
    expect(state.chat!.transcript).toEqual([]);
  });

  it("an answer in JSON (no sentence streamed) works as before", async () => {
    childAnswer = "json";
    await opened();
    await act(async () => { expect(await state.act("child", "Is it 36?")).toBe(true); });
    expect(state.chat!.revision).toBe(3);
    expect(state.uncertain).toBe(false);
  });
});
