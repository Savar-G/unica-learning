// @vitest-environment happy-dom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatBoard, ChatControls, showHeldNote, useDeskChat, type DeskChatState } from "@/components/desk-chat";
import { boardDraftKey, chatBoardKey, childStrokes, createHistory, drawStroke, encodeHistory, inkLog, mayaWrites, penHolder, saveDraft, takePen, type BoardHistory, type Change, type DraftStore } from "@/lib/board-history";
import type { ChatReply, ChatView } from "@/lib/maya-chat";

const book = "45100000-0000-4000-8000-000000000031";
const id = "45100000-0000-4000-8000-000000000021";
const CHILD = "45100000-0000-4000-8000-000000000041", SIBLING = "45100000-0000-4000-8000-000000000042";
const view = (revision: number, pending = false): ChatView => ({ id, revision, pending, ended: false, transcript: [], batches: [], hint: 0, safetyMessage: null });
const reply = (revision: number, extra: Partial<ChatReply> = {}): ChatReply => ({ usage: { used: 1, left: 59, resetsAt: Date.now() + 86400000, backAt: "tomorrow" }, chat: view(revision), ...extra });
type RequestAction = { type: string; id: string; revision?: number; messageId?: string; text?: string };
let root: Root, host: HTMLDivElement, state: DeskChatState;
let answer: (action: RequestAction) => Promise<ChatReply>;
const requests: RequestAction[] = [];
function Harness({ question = 1, held = false, child = CHILD }: { question?: number; held?: boolean; child?: string }) {
  const chat = useDeskChat(reply(1).usage, { book, page: 1, question }, child);
  useLayoutEffect(() => { state = chat; }, [chat]);
  return createElement(ChatControls, { state: chat, picked: true, held });
}
// The second argument: whether the question is held (#581), or which child's desk it is (main).
const render = async (question = 1, second: boolean | string = false) => act(async () => root.render(createElement(Harness, {
  question, held: typeof second === "boolean" ? second : false, child: typeof second === "string" ? second : CHILD,
})));
const send = async (type: "start" | "child" | "end", text?: string) => {
  let ok = false;
  await act(async () => { ok = await state.act(type, text); });
  return ok;
};
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === text)!;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear(); requests.length = 0;
  answer = async () => reply(1);
  vi.stubGlobal("fetch", async (_: string, options: RequestInit) => {
    const action: RequestAction = JSON.parse(String(options.body)); requests.push(action);
    return Response.json(await answer(action));
  });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("a question Maya cannot teach yet (#527)", () => {
  it("offers no chat to start, so nothing is sent", async () => {
    await render(1, true);
    expect([...host.querySelectorAll("button")].map((b) => b.textContent)).not.toContain("Chat with Maya");
    expect(host.querySelector("input")!.disabled).toBe(true);
    expect(requests).toEqual([]);
  });
  it("shows Maya's held words when an old ended chat on the question never said them", () => {
    const HELD = ["Hi, I'm Maya, an AI.", "Want to pick another question on this page?"];
    const old = { ...view(4), ended: true, transcript: [{ speaker: "maya" as const, text: "I had fun working with you.", second: 0 }] };
    const told = { ...view(4), ended: true, transcript: [{ speaker: "maya" as const, text: HELD.join(" "), second: 0 }] };
    const midCall = { ...view(4), ended: true, transcript: [{ speaker: "maya" as const, text: HELD[1], second: 10 }] };
    const former = { ...view(4), ended: true, transcript: [{ speaker: "maya" as const, text: "Hi, I'm Maya, an AI. I can't help with this kind of question yet. Pick another question, or ask a grown-up.", second: 0 }] };
    expect(showHeldNote(HELD, null)).toBe(true);
    expect(showHeldNote(HELD, old)).toBe(true);
    expect(showHeldNote(HELD, told)).toBe(false);
    expect(showHeldNote(HELD, midCall)).toBe(false);
    expect(showHeldNote(HELD, former)).toBe(true);
    expect(showHeldNote(HELD, view(4))).toBe(false);
    expect(showHeldNote(null, null)).toBe(false);
  });
  it("offers the chat on a question Maya teaches", async () => {
    await render(1, false);
    expect(button("Chat with Maya").disabled).toBe(false);
  });
});

describe("chat message admission at the public hook", () => {
  it("R451-2: releases a definitely refused request before sending new text at the returned revision", async () => {
    answer = async (action) => action.type === "start" ? reply(1) : requests.filter((r) => r.type === "child").length === 1
      ? reply(3, { error: "conflict", admission: "refused" }) : reply(5, { admission: "accepted" });
    await render(); await send("start");
    expect(await send("child", "first message")).toBe(false);
    expect(state.chat?.revision).toBe(3); expect(state.uncertain).toBe(false);
    expect(await send("child", "new message")).toBe(true);
    const children = requests.filter((r) => r.type === "child");
    expect(children.map((r) => [r.revision, r.text])).toEqual([[1, "first message"], [3, "new message"]]);
    expect(children[1].messageId).not.toBe(children[0].messageId);
  });
  it("retains the original ID and words after a lost result, then releases them after the retry settles", async () => {
    let failed = false;
    answer = async (action) => {
      if (action.type === "start") return reply(1);
      if (!failed) { failed = true; throw Error("Lost response after admission"); }
      return reply(3, { admission: "accepted" });
    };
    await render(); await send("start");
    expect(await send("child", "original words")).toBe(false);
    expect(state.uncertain).toBe(true); expect(host.querySelector("input")!.disabled).toBe(true);
    expect(button("Try again").disabled).toBe(false);
    await act(async () => { await state.retry(); });
    expect(requests[2]).toEqual(requests[1]); expect(state.uncertain).toBe(false);
    await send("child", "later words");
    expect(requests[3].revision).toBe(3); expect(requests[3].text).toBe("later words");
    expect(requests[3].messageId).not.toBe(requests[1].messageId);
  });
  it("retains an admitted but still running request after a busy reply", async () => {
    answer = async (action) => action.type === "start" ? reply(1) : requests.length === 2
      ? reply(2, { chat: view(2, true), error: "busy", admission: "accepted" }) : reply(3, { admission: "accepted" });
    await render(); await send("start"); await send("child", "one turn");
    await advance(3000);
    expect(requests[2]).toEqual(requests[1]); expect(state.chat?.pending).toBe(false); expect(state.uncertain).toBe(false);
  });
});

describe("chat recovery status", () => {
  it("R451-3: continues scheduled reads after a temporary failure with backoff", async () => {
    let reads = 0;
    answer = async (action) => {
      if (action.type === "start") return reply(2, { chat: view(2, true) });
      if (++reads === 1) throw Error("Temporary network failure");
      return reply(3);
    };
    await render(); await send("start"); await advance(3000);
    expect(reads).toBe(1); expect(state.chat?.pending).toBe(true);
    expect(button("Try again").disabled).toBe(false);
    await advance(3000); expect(reads).toBe(1);
    await advance(3000); expect(reads).toBe(2);
    expect(state.chat?.pending).toBe(false); expect(state.error).toBeNull();
    expect(host.querySelector("input")!.disabled).toBe(false); expect(button("End chat").disabled).toBe(false);
  });
  it("keeps a bounded retry delay and lets Try again recover without waiting for it", async () => {
    let offline = true;
    answer = async (action) => {
      if (action.type === "start") return reply(2, { chat: view(2, true) });
      if (offline) throw Error("Offline");
      return reply(3);
    };
    await render(); await send("start");
    for (const delay of [3000, 6000, 12000, 24000, 30000]) await advance(delay);
    expect(requests.filter((r) => r.type === "read")).toHaveLength(5);
    offline = false;
    await act(async () => { button("Try again").click(); });
    expect(state.chat?.pending).toBe(false); expect(state.error).toBeNull();
  });
  it("offers Try again when the initial resume read fails", async () => {
    sessionStorage.setItem(`unica-chat:${book}:1:1`, id);
    let failed = false;
    answer = async () => { if (!failed) { failed = true; throw Error("Offline"); } return reply(3); };
    await render(); expect(state.chat).toBeNull(); expect(button("Try again").disabled).toBe(false);
    await act(async () => { button("Try again").click(); });
    expect(state.chat?.revision).toBe(3); expect(state.error).toBeNull();
  });
  it("discards a late recovery response after the picked question changes", async () => {
    let release!: (value: ChatReply) => void;
    answer = async (action) => action.type === "start" ? reply(2, { chat: view(2, true) }) : new Promise((resolve) => { release = resolve; });
    await render(); await send("start"); await advance(3000);
    await render(2);
    await act(async () => { release(reply(99, { error: "old question failed" })); });
    expect(state.chat).toBeNull(); expect(state.error).toBeNull();
    const count = requests.length; await advance(30000); expect(requests).toHaveLength(count);
  });
  it("cancels scheduled recovery when the hook unmounts", async () => {
    answer = async () => reply(2, { chat: view(2, true) });
    await render(); await send("start");
    await act(async () => root.render(null)); await advance(30000);
    expect(requests).toHaveLength(1);
  });
});

it("shows only the approved Maya line at the cap", async () => {
  const cap = reply(3);
  cap.usage = { ...cap.usage, used: 60, left: 0 };
  answer = async () => cap;
  await render(); await send("start");
  expect(host.textContent).toBe("You used all your messages for today. We can chat again tomorrow.");
  expect(host.querySelector("input")).toBeNull();
  expect(host.querySelector("form")).toBeNull();
  expect(host.querySelector("button")).toBeNull();
});

describe("#534: the board in a chat", () => {
  const OUTBOX = `unica-chat-ink:${id}`;
  const accepted = (c: Change) => { if (!c.ok) throw Error(c.reason); return c.history; };
  /** A line of the child's at `x`, after the board's last event. */
  const drawn = (h: Change | BoardHistory, x: number) => {
    const from = "ok" in h ? accepted(h) : h;
    const at = from.events.length * 1000 + 1000;
    return accepted(drawStroke(from, { erase: false, w: 5, boardWidth: 800, page: 1, pts: [[x, 0.7, at], [x + 0.05, 0.75, at + 100]] }));
  };
  const work = { transactionId: "reply-1", commands: [{ op: "columns", id: "work", operation: "add", operands: [{ id: "a", value: "27" }, { id: "b", value: "39" }], place: { region: "main" } }] };

  it("keeps the pen on the chat's board: Maya's work shows, then the pen passes to the child, and each change goes to the call", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const boards: BoardHistory[] = [];
    await act(async () => root.render(createElement(ChatBoard, { chat: { ...view(1), batches: [work] }, still: true, onBoard: (h: BoardHistory) => boards.push(h) })));
    await advance(5000);
    expect(host.querySelector('button[aria-label="Pen"]')).not.toBeNull();
    expect(host.querySelector('button[aria-label="Eraser"]')).not.toBeNull();
    expect(host.textContent).toContain("You have the pen");
    expect(host.querySelector('button[aria-label="Pen"]')?.hasAttribute("disabled")).toBe(false);
    const last = boards.at(-1)!;
    expect(last.events.flatMap((e) => (e.kind === "maya" ? [e.batchId] : []))).toEqual(["reply-1"]);
    expect(penHolder(last)).toBe("child");
  });

  it("sends the child's ink to the call before the chat ends, from the first event the call does not hold", async () => {
    const urls: string[] = [];
    const bodies: { from: number; events: unknown[] }[] = [];
    vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
      urls.push(url);
      if (url === "/api/desk/chat/board") {
        const body = JSON.parse(String(options.body)) as { from: number; events: unknown[] };
        bodies.push(body);
        return Response.json({ held: body.from + body.events.length - 1 });
      }
      const action: RequestAction = JSON.parse(String(options.body)); requests.push(action);
      return Response.json(await answer(action));
    });
    await render(); await send("start");
    const one = drawn(takePen(createHistory(), 100), 0.4);
    await act(async () => state.saveBoard(id, one));
    await advance(2000);
    // A second line later: only the new event goes.
    await act(async () => state.saveBoard(id, drawn(one, 0.6)));
    expect(await send("end")).toBe(true);
    expect(urls).toEqual(["/api/desk/chat", "/api/desk/chat/board", "/api/desk/chat/board", "/api/desk/chat"]);
    expect(bodies.map((b) => [b.from, b.events.length])).toEqual([[1, 2], [3, 1]]);
    // The call holds it all: nothing waits on the device.
    expect(localStorage.getItem(OUTBOX)).toBeNull();
  });

  it("R625-4: carries the child's ink on the question's board into the chat when it starts", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    localStorage.clear();
    const accepted = (c: Change) => { if (!c.ok) throw Error(c.reason); return c.history; };
    const question = { transactionId: "desk-question", commands: work.commands };
    let before = accepted(mayaWrites(createHistory(), question, 0));
    before = accepted(takePen(before, 1000));
    before = accepted(drawStroke(before, { erase: false, w: 5, boardWidth: 800, page: 1, pts: [[0.1, 0.7, 1500], [0.2, 0.75, 1700]] }));
    const local: DraftStore = {
      read: (k) => localStorage.getItem(k), write: (k, v) => (localStorage.setItem(k, v), true),
      remove: (k) => localStorage.removeItem(k), keys: () => Object.keys(localStorage),
    };
    expect(saveDraft(local, boardDraftKey(book, 1, 1), before, null, Date.now()).status).toBe("saved");
    const boards: BoardHistory[] = [];
    await act(async () => root.render(createElement(ChatBoard, { chat: { ...view(1), batches: [work] }, still: true, carry: { book, page: 1, question: 1 }, onBoard: (h: BoardHistory) => boards.push(h) })));
    await advance(5000);
    expect(childStrokes(boards.at(-1)!)).toHaveLength(1);
    expect(childStrokes(boards.at(-1)!)[0].pts.map(([x, y]) => [x, y])).toEqual([[0.1, 0.7], [0.2, 0.75]]);
  });

  it("R625-5: tries the last ink again before the chat ends, keeps it on the device when it still fails, and sends it on the next desk load", async () => {
    localStorage.clear();
    let boardStatus = 503;
    const boards: string[] = [];
    vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
      if (url === "/api/desk/chat/board") {
        boards.push(String(options.body));
        const body = JSON.parse(String(options.body)) as { from: number; events: unknown[] };
        return boardStatus === 200 ? Response.json({ held: body.from + body.events.length - 1 }) : Response.json({ error: "unavailable" }, { status: boardStatus });
      }
      const action: RequestAction = JSON.parse(String(options.body)); requests.push(action);
      return Response.json(await answer(action));
    });
    await render(); await send("start");
    await act(async () => state.saveBoard(id, drawn(takePen(createHistory(), 100), 0.4)));
    let ended = false;
    await act(async () => {
      const ending = state.act("end").then((ok) => { ended = ok; });
      await vi.advanceTimersByTimeAsync(30_000);
      await ending;
    });
    expect(boards).toHaveLength(3);
    expect(ended).toBe(true);
    expect(requests.at(-1)?.type).toBe("end");
    expect(localStorage.getItem(OUTBOX)).not.toBeNull();
    // The next time the desk opens, the ink goes to the call, and the device forgets it.
    boardStatus = 200;
    expect(await reopen(boards)).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(boards.at(-1)!)).toEqual(JSON.parse(boards[0]));
    expect(localStorage.getItem(OUTBOX)).toBeNull();
  });

  /** A chat whose last ink cannot reach the call: it ends, and the ink waits on the device. */
  async function endWithInkLeft(boards: string[], status: () => number) {
    vi.stubGlobal("fetch", async (url: string, options: RequestInit = {}) => {
      if (url.startsWith("/api/desk/chat/board")) {
        if (options.method === "POST") boards.push(String(options.body));
        return Response.json({ error: "x" }, { status: status() });
      }
      const action: RequestAction = JSON.parse(String(options.body)); requests.push(action);
      return Response.json(await answer(action));
    });
    await render(); await send("start");
    await act(async () => state.saveBoard(id, drawn(takePen(createHistory(), 100), 0.4)));
    await act(async () => { void state.act("end"); await vi.advanceTimersByTimeAsync(60_000); });
    expect(localStorage.getItem(OUTBOX)).not.toBeNull();
  }
  /** The desk closes (it tries waiting ink once more as it goes) and opens again; the requests of the new desk. */
  const reopen = async (boards: string[]) => {
    await act(async () => root.unmount());
    await advance(100);
    const before = boards.length;
    root = createRoot(host);
    await render(); await advance(100);
    return boards.length - before;
  };

  it("R625b-2: ink that never gets an answer still lets the chat end, kept on the device before the first try", async () => {
    localStorage.clear();
    const boards: string[] = [];
    vi.stubGlobal("fetch", (url: string, options: RequestInit) => {
      if (url === "/api/desk/chat/board") {
        boards.push(String(options.body));
        return new Promise((_, reject) => options.signal?.addEventListener("abort", () => reject(new DOMException("The request took too long.", "AbortError"))));
      }
      const action: RequestAction = JSON.parse(String(options.body)); requests.push(action);
      return answer(action).then((r) => Response.json(r));
    });
    await render(); await send("start");
    await act(async () => state.saveBoard(id, drawn(takePen(createHistory(), 100), 0.4)));
    let ended = false;
    await act(async () => { void state.act("end").then((ok) => { ended = ok; }); await vi.advanceTimersByTimeAsync(100); });
    expect(boards).toHaveLength(1);
    expect(localStorage.getItem(OUTBOX)).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(ended).toBe(true);
    expect(requests.at(-1)?.type).toBe("end");
    expect(localStorage.getItem(OUTBOX)).not.toBeNull();
  });

  it("R625b-3: ink waiting on the device stays when a signed-out session, a closed desk or a server error says nothing about it, and goes when the call answers closed", async () => {
    localStorage.clear();
    const boards: string[] = [];
    let status = 503;
    await endWithInkLeft(boards, () => status);
    for (const refused of [404, 403, 401, 409]) {
      status = refused;
      expect(await reopen(boards)).toBe(1);
      expect(localStorage.getItem(OUTBOX), `after ${refused}`).not.toBeNull();
    }
    status = 410;
    await reopen(boards);
    expect(localStorage.getItem(OUTBOX)).toBeNull();
  });

  it("#635: a chat picked up again asks the call for its ink, waits for it, and the board starts from it", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    localStorage.clear();
    let saved = accepted(mayaWrites(createHistory(), work, 0));
    saved = drawn(accepted(takePen(saved, 1000)), 0.1);
    // The board on screen starts from the call's log.
    const boards: BoardHistory[] = [];
    await act(async () => root.render(createElement(ChatBoard, { chat: { ...view(1), batches: [work] }, still: true, restore: inkLog(saved), onBoard: (h: BoardHistory) => boards.push(h) })));
    await advance(5000);
    expect(childStrokes(boards.at(-1)!)).toHaveLength(1);
    expect(inkLog(boards.at(-1)!).slice(0, inkLog(saved).length)).toEqual(inkLog(saved));
    // While the call has not answered, the board says so and takes no line.
    await act(async () => root.render(createElement(ChatBoard, { chat: { ...view(1), batches: [work] }, still: true, restore: "loading" })));
    expect(host.textContent).toContain("Getting our board back");
    expect(host.querySelector("svg.child-ink")).toBeNull();
    await act(async () => root.unmount());
    root = createRoot(host);
    // The desk asks the call for this chat's log when it picks the chat up again.
    const gets: string[] = [];
    vi.stubGlobal("fetch", async (url: string, options: RequestInit = {}) => {
      if (url.startsWith("/api/desk/chat/board?")) { gets.push(url); return Response.json({ events: inkLog(saved) }); }
      const action: RequestAction = JSON.parse(String(options.body)); requests.push(action);
      return Response.json(await answer(action));
    });
    sessionStorage.setItem(`unica-chat:${book}:1:1`, id);
    await render(); await advance(100);
    expect(gets).toEqual([`/api/desk/chat/board?id=${id}`]);
    expect(state.callInk).toEqual({ id, log: inkLog(saved) });
  });
});

describe("#635: the child's ink in a chat never leaves the device until the call holds it", () => {
  const accepted = (c: Change) => { if (!c.ok) throw Error(c.reason); return c.history; };
  /** A chat's board with one line of the child's at a place no other test uses. */
  const withLine = () => {
    let h = accepted(takePen(createHistory(), 100));
    h = accepted(drawStroke(h, { erase: false, w: 5, boardWidth: 800, page: 1, pts: [[0.123, 0.7, 200], [0.2, 0.75, 300]] }));
    return h;
  };
  const kept = () => Object.keys(localStorage).filter((k) => k.includes(id)).map((k) => localStorage.getItem(k) ?? "").join("\n");
  const stub = (board: (options: RequestInit) => Promise<Response>) => vi.stubGlobal("fetch", async (url: string, options: RequestInit = {}) => {
    if (url.startsWith("/api/desk/chat/board")) return board(options);
    const action: RequestAction = JSON.parse(String(options.body)); requests.push(action);
    return Response.json(await answer(action));
  });

  it("R635-1: a save still on its way when the chat ends keeps the board on the device", async () => {
    localStorage.clear();
    // The board's request answers only after 3 s, and then with a server error.
    stub((options) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(Response.json({ error: "unavailable" }, { status: 503 })), 3000);
      options.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("too long", "AbortError")); });
    }));
    await render(); await send("start");
    await act(async () => state.saveBoard(id, withLine()));
    // The save 1.5 s after the change is on its way when the child ends the chat.
    await advance(1600);
    await act(async () => { void state.act("end"); await vi.advanceTimersByTimeAsync(60_000); });
    expect(requests.at(-1)?.type).toBe("end");
    expect(kept()).toContain("0.123");
  });

  it("R635-2: a conflict answer, once or twice, never drops the device's copy of a line the call does not hold", async () => {
    localStorage.clear();
    stub(async () => Response.json({ error: "stale", board: encodeHistory(createHistory()) }, { status: 409 }));
    await render(); await send("start");
    await act(async () => state.saveBoard(id, withLine()));
    await act(async () => { void state.act("end"); await vi.advanceTimersByTimeAsync(60_000); });
    expect(requests.at(-1)?.type).toBe("end");
    expect(kept()).toContain("0.123");
  });
});

describe("#639: ink stays on the device until the call holds it", () => {
  const OUTBOX = `unica-chat-ink:${id}`;
  const accepted = (c: Change) => { if (!c.ok) throw Error(c.reason); return c.history; };
  const line = (from: BoardHistory, x: number) => {
    const at = from.events.length * 1000 + 1000;
    return accepted(drawStroke(from, { erase: false, w: 5, boardWidth: 800, page: 1, pts: [[x, 0.7, at], [x + 0.05, 0.75, at + 100]] }));
  };
  /** The pen, then two lines: three events. */
  const threeEvents = () => line(line(accepted(takePen(createHistory(), 100)), 0.1), 0.2);
  const local: DraftStore = {
    read: (k) => localStorage.getItem(k), write: (k, v) => (localStorage.setItem(k, v), true),
    remove: (k) => localStorage.removeItem(k), keys: () => Object.keys(localStorage),
  };
  let boards: BoardHistory[];
  /** The desk's wiring: a chat picked up again, its board started from the call's answer, each change sent back. */
  function Desk() {
    const chat = useDeskChat(reply(1).usage, { book, page: 1, question: 1 }, CHILD);
    useLayoutEffect(() => { state = chat; }, [chat]);
    return chat.chat ? createElement(ChatBoard, {
      chat: chat.chat, still: true, restore: chat.callInk?.id === chat.chat.id ? chat.callInk.log : null,
      onBoard: (h: BoardHistory) => { boards.push(h); chat.saveBoard(chat.chat!.id, h); },
    }) : null;
  }
  /** The call: GET answers what it holds, POST answers from `post`. */
  const theCall = (held: () => unknown[], post: (body: { from: number; events: unknown[] }, raw: string) => Response | Promise<Response>) =>
    vi.stubGlobal("fetch", async (url: string, options: RequestInit = {}) => {
      if (url.startsWith("/api/desk/chat/board?")) return Response.json({ events: held() });
      if (url === "/api/desk/chat/board") return post(JSON.parse(String(options.body)), String(options.body));
      const action: RequestAction = JSON.parse(String(options.body)); requests.push(action);
      return Response.json(await answer(action));
    });
  const pickUp = async () => {
    sessionStorage.setItem(`unica-chat:${book}:1:1`, id);
    await act(async () => root.render(createElement(Desk)));
    await advance(100);
  };
  beforeEach(() => {
    boards = [];
    localStorage.clear();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  });

  it("R639-1: with no draft, the board takes the stroke still on the device, and a failed send keeps it there", async () => {
    const log = inkLog(threeEvents());
    localStorage.setItem(OUTBOX, JSON.stringify({ acked: 2, events: [log[2]], at: Date.now() }));
    const posts: { from: number; events: unknown[] }[] = [];
    theCall(() => log.slice(0, 2), (body) => { posts.push(body); return Response.json({ error: "unavailable" }, { status: 503 }); });
    await pickUp();
    expect(state.callInk).toEqual({ id, log });
    await advance(5000);
    expect(inkLog(boards.at(-1)!).slice(0, 3)).toEqual(log);
    expect(localStorage.getItem(OUTBOX)).toContain("0.2");
    expect(posts.every((p) => p.from === 3)).toBe(true);
  });

  it("R639-1: a board shorter than the ink on the device never shortens what waits to be sent", async () => {
    const log = inkLog(threeEvents());
    theCall(() => [], () => Response.json({ error: "unavailable" }, { status: 503 }));
    await render(); await send("start");
    await act(async () => state.saveBoard(id, threeEvents()));
    await act(async () => state.saveBoard(id, line(accepted(takePen(createHistory(), 100)), 0.1)));
    expect(JSON.parse(localStorage.getItem(OUTBOX)!).events).toEqual(log);
  });

  it("R639-2: a stale draft does not beat the call: the board starts from all the call holds", async () => {
    const whole = threeEvents();
    const log = inkLog(whole);
    const stale = line(accepted(takePen(createHistory(), 100)), 0.1);
    expect(saveDraft(local, chatBoardKey(id), stale, null, Date.now()).status).toBe("saved");
    const posts: { from: number; events: unknown[] }[] = [];
    theCall(() => log, (body) => { posts.push(body); return Response.json({ held: body.from + body.events.length - 1 }); });
    await pickUp();
    await advance(5000);
    expect(inkLog(boards.at(-1)!).slice(0, 3)).toEqual(log);
    expect(posts).toEqual([]);
  });

  it("R639-2: a line drawn on a board that fell behind goes to the next free sequence, never onto one the call holds", async () => {
    const log = inkLog(threeEvents());
    const posts: { from: number; events: unknown[] }[] = [];
    theCall(() => [], (body) => { posts.push(body); return Response.json({ held: body.from + body.events.length - 1 }); });
    await render(); await send("start");
    await act(async () => state.saveBoard(id, threeEvents()));
    await advance(2000);
    expect(posts.at(-1)).toMatchObject({ from: 1 });
    const behind = line(line(accepted(takePen(createHistory(), 100)), 0.1), 0.9);
    await act(async () => state.saveBoard(id, behind));
    await advance(2000);
    expect(posts.at(-1)!.from).toBe(log.length + 1);
    expect(JSON.stringify(posts.at(-1)!.events)).toContain("0.9");
    expect(localStorage.getItem(OUTBOX)).toBeNull();
  });

  it("R639-3: splits a long log by its encoded size, and every part reaches the call", async () => {
    let h = accepted(takePen(createHistory(), 100));
    for (let n = 0; n < 40; n++) {
      const start = h.events.length * 10_000;
      h = accepted(drawStroke(h, { erase: false, w: 5, boardWidth: 800, page: 1, pts: Array.from({ length: 2000 }, (_, i): [number, number, number] => [0.1234567 + i * 1e-6, 0.7654321 + i * 1e-6, start + i]) }));
    }
    expect(JSON.stringify(inkLog(h)).length).toBeGreaterThan(1_000_200);
    let held = 0, waiting = false;
    const sizes: number[] = [];
    theCall(() => [], (body, raw) => {
      sizes.push(new TextEncoder().encode(raw).length);
      // As the route and the database do: too big is refused, one append a second.
      if (raw.length > 1_000_200) return Response.json({ error: "invalid" }, { status: 400 });
      if (waiting) return Response.json({ error: "busy", held }, { status: 429 });
      waiting = true;
      setTimeout(() => { waiting = false; }, 1000);
      held = Math.max(held, body.from + body.events.length - 1);
      return Response.json({ held });
    });
    await render(); await send("start");
    await act(async () => state.saveBoard(id, h));
    await advance(120_000);
    expect(held).toBe(41);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(1_000_200);
    expect(localStorage.getItem(OUTBOX)).toBeNull();
  });

  it("R639-5: a seven-minute-old stroke is sent on desk load, not forgotten, and stays until the call answers", async () => {
    const log = inkLog(threeEvents());
    localStorage.setItem(OUTBOX, JSON.stringify({ acked: 0, events: log, at: Date.now() - 7 * 60_000 }));
    let status = 503;
    const posts: string[] = [];
    theCall(() => [], (body, raw) => {
      posts.push(raw);
      return status === 200 ? Response.json({ held: body.from + body.events.length - 1 }) : Response.json({ error: "x" }, { status });
    });
    await render(); await advance(100);
    expect(posts).toHaveLength(1);
    expect(localStorage.getItem(OUTBOX)).not.toBeNull();
    await act(async () => root.unmount());
    root = createRoot(host);
    status = 200;
    await render(); await advance(100);
    expect(localStorage.getItem(OUTBOX)).toBeNull();
    expect(JSON.parse(posts.at(-1)!).events).toEqual(log);
  });

  it("R639b-1: four reloads in a row after a stale board add no strokes, with the draft or without it", async () => {
    for (const keepDraft of [true, false]) {
      localStorage.clear(); sessionStorage.clear();
      const whole = threeEvents();
      // A third line whose time overlaps the line before it, as a board that fell behind sends it.
      const late = inkLog(line(accepted(takePen(createHistory(), 100)), 0.9))[1];
      const server: unknown[] = [...inkLog(whole), late];
      theCall(() => server, (body) => {
        body.events.forEach((e, i) => { if (body.from + i > server.length) server.push(e); });
        return Response.json({ held: server.length });
      });
      for (let reload = 0; reload < 4; reload++) {
        boards = [];
        if (!keepDraft) localStorage.removeItem(chatBoardKey(id));
        await pickUp();
        await advance(5000);
        expect(server, `reload ${reload}, draft kept: ${keepDraft}`).toHaveLength(4);
        expect(childStrokes(boards.at(-1)!)).toHaveLength(3);
        await act(async () => root.unmount());
        await advance(100);
        root = createRoot(host);
      }
    }
  });

  const OLD = Array.from({ length: 8 }, (_, i) => `45100000-0000-4000-8000-0000000001${10 + i}`);
  const leaveOldInk = () => {
    const log = inkLog(threeEvents());
    for (const old of OLD) localStorage.setItem(`unica-chat-ink:${old}`, JSON.stringify({ acked: 0, events: log }));
  };
  const oldLeft = () => OLD.filter((old) => localStorage.getItem(`unica-chat-ink:${old}`) !== null).length;

  it("R639b-2: old ink going slowly never holds the current chat, and a call that is gone leaves the device", async () => {
    leaveOldInk();
    const started: string[] = [];
    let inFlight = 0, most = 0;
    vi.stubGlobal("fetch", (url: string, options: RequestInit = {}) => {
      if (url === "/api/desk/chat/board") {
        const body = JSON.parse(String(options.body)) as { id: string; from: number; events: unknown[] };
        if (body.id === id) return Promise.resolve(Response.json({ held: body.from + body.events.length - 1 }));
        started.push(body.id);
        most = Math.max(most, ++inFlight);
        return new Promise((resolve) => setTimeout(() => { inFlight--; resolve(Response.json({ error: "not_found", held: 0 }, { status: 404 })); }, 4900));
      }
      const action: RequestAction = JSON.parse(String(options.body)); requests.push(action);
      return answer(action).then((r) => Response.json(r));
    });
    await render(); await send("start");
    await act(async () => state.saveBoard(id, threeEvents()));
    let ended = false;
    await act(async () => { void state.act("end").then((ok) => { ended = ok; }); await vi.advanceTimersByTimeAsync(500); });
    expect(ended).toBe(true);
    expect(localStorage.getItem(OUTBOX)).toBeNull();
    // One at a time, so a desk with much old ink makes one request at once.
    await advance(60_000);
    expect(most).toBe(1);
    expect(started).toHaveLength(8);
    expect(oldLeft()).toBe(0);
    // The next desk load asks about none of them.
    await act(async () => root.unmount());
    await advance(100);
    root = createRoot(host);
    started.length = 0;
    await render(); await advance(100);
    expect(started).toEqual([]);
  });

  it("R639b-2: a definite refusal removes the ink; a server error, no answer, or a 404 that is not the call's keeps it", async () => {
    const kept: [string, () => Promise<Response>][] = [
      ["503", async () => Response.json({ error: "unavailable" }, { status: 503 })],
      ["no answer", async () => { throw new TypeError("network"); }],
      ["401", async () => Response.json({ error: "signed_out" }, { status: 401 })],
      ["403", async () => Response.json({ error: "forbidden" }, { status: 403 })],
      ["a 404 that is not the route's", async () => new Response("<html>not here</html>", { status: 404 })],
    ];
    const log = inkLog(threeEvents());
    for (const [name, answerWith] of kept) {
      localStorage.clear();
      localStorage.setItem(OUTBOX, JSON.stringify({ acked: 0, events: log }));
      theCall(() => [], answerWith);
      await render(); await advance(100);
      expect(localStorage.getItem(OUTBOX), name).not.toBeNull();
      await act(async () => root.unmount());
      await advance(100);
      root = createRoot(host);
    }
    for (const [name, answerWith] of [
      ["the call is gone, or another child's", () => Response.json({ error: "not_found", held: 0 }, { status: 404 })],
      ["closed", () => Response.json({ error: "closed", held: 2 }, { status: 410 })],
    ] as const) {
      localStorage.clear();
      localStorage.setItem(OUTBOX, JSON.stringify({ acked: 0, events: log }));
      theCall(() => [], answerWith);
      await render(); await advance(100);
      expect(localStorage.getItem(OUTBOX), name).toBeNull();
      await act(async () => root.unmount());
      await advance(100);
      root = createRoot(host);
    }
  });

  it("R639b-2: a page going away sends this visit's ink first, not old ink that could use up what the browser allows", async () => {
    leaveOldInk();
    const sent: string[] = [];
    vi.stubGlobal("fetch", (url: string, options: RequestInit = {}) => {
      if (url === "/api/desk/chat/board") {
        const body = JSON.parse(String(options.body)) as { id: string; from: number; events: unknown[] };
        sent.push(body.id);
        return new Promise(() => {});
      }
      const action: RequestAction = JSON.parse(String(options.body)); requests.push(action);
      return answer(action).then((r) => Response.json(r));
    });
    await render(); await send("start");
    await act(async () => state.saveBoard(id, threeEvents()));
    sent.length = 0;
    await act(async () => { window.dispatchEvent(new Event("pagehide")); await vi.advanceTimersByTimeAsync(0); });
    expect(sent).toEqual([id]);
  });

  describe("R639c: a sibling's ink on a shared device", () => {
    const next = async () => { await act(async () => root.unmount()); await advance(100); root = createRoot(host); };
    const box = () => JSON.parse(localStorage.getItem(OUTBOX) ?? "null") as { acked: number; events: unknown[]; child?: string } | null;
    const ask = (posts: { id: string; from: number }[], answerWith: (body: { from: number; events: unknown[] }) => Response) =>
      theCall(() => [], (body) => { posts.push(body as unknown as { id: string; from: number }); return answerWith(body); });

    it("one child's desk leaves a sibling's ink untouched with no request, and the sibling's desk sends it", async () => {
      const log = inkLog(threeEvents());
      const left = JSON.stringify({ acked: 0, events: log, child: SIBLING });
      localStorage.setItem(OUTBOX, left);
      const posts: { id: string; from: number }[] = [];
      // This child's desk would be told not_found, as the route answers for another child's chat.
      ask(posts, () => Response.json({ error: "not_found", held: 0 }, { status: 404 }));
      await render(1, CHILD); await advance(60_000);
      expect(posts).toEqual([]);
      expect(localStorage.getItem(OUTBOX)).toBe(left);
      await next();
      // And it goes nowhere as this desk's page goes away.
      await render(1, CHILD); await advance(100);
      await act(async () => { window.dispatchEvent(new Event("pagehide")); await vi.advanceTimersByTimeAsync(0); });
      expect(posts).toEqual([]);
      await next();
      const sent: { from: number; events: unknown[] }[] = [];
      theCall(() => [], (body) => { sent.push(body); return Response.json({ held: body.from + body.events.length - 1 }); });
      await render(1, SIBLING); await advance(100);
      expect(sent).toHaveLength(1);
      expect(sent[0].events).toEqual(log);
      expect(localStorage.getItem(OUTBOX)).toBeNull();
    });

    it("a sibling's ink stays even when it cannot be read", async () => {
      const left = JSON.stringify({ acked: 0, events: [{ kind: "not an event" }], child: SIBLING });
      localStorage.setItem(OUTBOX, left);
      const posts: { id: string; from: number }[] = [];
      ask(posts, () => Response.json({ held: 0 }));
      await render(1, CHILD); await advance(100);
      expect(localStorage.getItem(OUTBOX)).toBe(left);
    });

    it("marks the ink a desk keeps with its child", async () => {
      const posts: { id: string; from: number }[] = [];
      ask(posts, () => Response.json({ error: "unavailable" }, { status: 503 }));
      await render(1, CHILD); await send("start");
      await act(async () => state.saveBoard(id, threeEvents()));
      expect(box()?.child).toBe(CHILD);
      await advance(2000);
      expect(box()?.child).toBe(CHILD);
    });

    it("this child's own ink still goes when the route answers not_found", async () => {
      localStorage.setItem(OUTBOX, JSON.stringify({ acked: 0, events: inkLog(threeEvents()), child: CHILD }));
      const posts: { id: string; from: number }[] = [];
      ask(posts, () => Response.json({ error: "not_found", held: 0 }, { status: 404 }));
      await render(1, CHILD); await advance(100);
      expect(posts).toHaveLength(1);
      expect(localStorage.getItem(OUTBOX)).toBeNull();
    });

    it("ink with no mark, from before the mark, is tried by any desk, dropped on not_found, and never takes that desk's mark", async () => {
      localStorage.setItem(OUTBOX, JSON.stringify({ acked: 0, events: inkLog(threeEvents()) }));
      const posts: { id: string; from: number }[] = [];
      ask(posts, () => Response.json({ error: "unavailable" }, { status: 503 }));
      await render(1, CHILD); await advance(100);
      expect(posts).toHaveLength(1);
      expect(box()).not.toBeNull();
      expect(box()?.child).toBeUndefined();
      await next();
      ask(posts, () => Response.json({ error: "not_found", held: 0 }, { status: 404 }));
      await render(1, SIBLING); await advance(100);
      expect(posts).toHaveLength(2);
      expect(box()).toBeNull();
    });
  });

  describe("#652: a send of one child's desk never goes on under another's", () => {
    const box = () => JSON.parse(localStorage.getItem(OUTBOX) ?? "null") as { acked: number; events: unknown[]; child?: string } | null;
    /** This child's desk with ink the call has not taken: its send was told "busy" and waits to try again. */
    async function waitingSend(posts: unknown[], answerNow: { fn: () => Response }) {
      localStorage.clear();
      theCall(() => [], (body) => { posts.push(body); return answerNow.fn(); });
      await render(1, CHILD); await send("start");
      await act(async () => state.saveBoard(id, threeEvents()));
      await advance(1600);
      expect(posts).toHaveLength(1);
      expect(box()?.child).toBe(CHILD);
    }
    const busy = () => Response.json({ error: "busy", held: 0 }, { status: 429 });
    // Under a sibling's desk the call is not this desk's: before #652 the route answered not_found for that too.
    const sibling = () => Response.json({ error: "not_found", held: 0 }, { status: 404 });

    it("stops when the desk closes, so a later answer under a sibling's desk never removes this child's ink", async () => {
      const posts: unknown[] = [];
      const answerNow = { fn: busy };
      await waitingSend(posts, answerNow);
      await act(async () => root.unmount());
      answerNow.fn = sibling;
      await advance(60_000);
      expect(posts).toHaveLength(1);
      expect(box()?.child).toBe(CHILD);
      root = createRoot(host);
    });

    it("stops when the desk turns to another child, and that child's desk leaves this child's ink alone", async () => {
      const posts: unknown[] = [];
      const answerNow = { fn: busy };
      await waitingSend(posts, answerNow);
      answerNow.fn = sibling;
      await render(1, SIBLING);
      await advance(60_000);
      expect(posts).toHaveLength(1);
      expect(box()?.child).toBe(CHILD);
    });
  });
});

