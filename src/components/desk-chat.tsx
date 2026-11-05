"use client";
import { useRef, useState, useEffect, useCallback, type FormEvent } from "react";
import { decodeHistory, encodeHistory, historyLength, rebaseOnto, type BoardHistory } from "@/lib/board-history";
import { chatCapLine, type ChatUsage, type ChatView, type ChatReply } from "@/lib/maya-chat";
import { OurBoard } from "@/components/our-board";
import { Icon } from "@/components/desk-icons";

const ERROR = "Your message could not be sent. Try again in a moment.";
/** How long the chat's board waits after a change before it goes to the call (#534). */
const BOARD_SAVE_MS = 1500;
/** A browser sends a request after the page has gone (keepalive) only below about 64 KB. */
const KEEPALIVE_MAX = 60_000;
/** The last board before a chat ends is tried this many times, waiting 1 s, then 2 s, between tries (R625-5). */
const FINAL_TRIES = 3;
/** One try of sending a board gives up after this long (R625b-2): a request that never answers never holds the chat. */
const BOARD_TRY_MS = 5000;
/** A chat's board that could not reach the call before the chat ended, kept on this device by the chat's id. */
const UNSENT_ROOT = "unica-chat-board-unsent:";
/**
 * How long a board waits on the device: the call takes it until 5 minutes after the chat's end (INK_AFTER_END_MS in
 * src/lib/maya-call.ts), and a minute more for the clocks. Past that the device forgets it without asking.
 */
const UNSENT_KEEP_MS = 6 * 60_000;

type BoardSave = { id: string; board: string };
/**
 * What one try did: "sent"; "stale" (the call keeps a newer board, given back); "closed" (the call takes no more boards:
 * it ended long ago); "retry" (anything else: busy, a server error, no answer, or a refusal of this session or desk,
 * which says nothing about the board, R625b-3).
 */
type Sent = { kind: "sent" | "closed" | "retry" } | { kind: "stale"; board: BoardHistory };
async function sendBoard(save: BoardSave): Promise<Sent> {
  const body = JSON.stringify(save);
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), BOARD_TRY_MS);
  try {
    const res = await fetch("/api/desk/chat/board", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: body.length < KEEPALIVE_MAX, signal: stop.signal });
    if (res.ok) return { kind: "sent" };
    if (res.status === 410) return { kind: "closed" };
    if (res.status === 409) {
      const answer = (await res.json()) as { board?: unknown };
      const board = typeof answer.board === "string" ? decodeHistory(answer.board) : null;
      if (board) return { kind: "stale", board };
    }
    return { kind: "retry" };
  } catch {
    return { kind: "retry" };
  } finally {
    clearTimeout(timer);
  }
}

/** A board kept on this device: the board and when it was kept. A copy kept as the board alone counts from now. */
function readUnsent(raw: string): { board: string; at: number } | null {
  try {
    const entry = JSON.parse(raw) as { board?: unknown; at?: unknown; v?: unknown };
    if (typeof entry.board === "string") return { board: entry.board, at: typeof entry.at === "number" ? entry.at : Date.now() };
    return entry.v === 1 ? { board: raw, at: Date.now() } : null;
  } catch {
    return null;
  }
}

const storage = {
  keys: (): string[] => { try { return Object.keys(window.localStorage).filter((k) => k.startsWith(UNSENT_ROOT)); } catch { return []; } },
  read: (key: string): string | null => { try { return window.localStorage.getItem(key); } catch { return null; } },
  write: (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* Storage can be full or off. */ } },
  remove: (key: string) => { try { window.localStorage.removeItem(key); } catch { /* Nothing to remove. */ } },
};

/**
 * Sends the chat's board to the call (#534): the newest copy, one request at a time, 1.5 s after the last change, and
 * at once before the chat ends or the page goes. Each try gives up after 5 s. A copy that could not be sent goes again
 * with the next one. When the call keeps a newer board (`stale`), this copy is rebuilt on it and sent again, and
 * `onSaved` hears the call's board so the board on screen takes it too (R625b-4).
 *
 * Before the chat ends, the last copy is first kept on this device, then tried three times (R625-5, R625b-2); the chat
 * ends either way. A copy left on the device is sent the next time the desk opens. It goes from the device only when
 * the call took it or said it is closed, or once the call's time for it is past (R625b-3): never because this session
 * or this desk was refused, which is about the desk, not the board.
 */
function useBoardSaver(onSaved: (id: string, board: BoardHistory) => void) {
  const next = useRef<BoardSave | null>(null);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const heard = useRef(onSaved);
  useEffect(() => {
    heard.current = onSaved;
  });
  /** One try, with a conflict resolved once: this copy rebuilt on the call's board, and sent again when it adds to it. */
  const send = useCallback(async (save: BoardSave): Promise<Sent> => {
    const sent = await sendBoard(save);
    if (sent.kind !== "stale") return sent;
    heard.current(save.id, sent.board);
    const mine = decodeHistory(save.board);
    const rebuilt = mine ? rebaseOnto(sent.board, mine, Math.max(historyLength(mine), historyLength(sent.board)) + 1) : sent.board;
    if (rebuilt === sent.board) return { kind: "sent" };
    return sendBoard({ id: save.id, board: encodeHistory(rebuilt) });
  }, []);
  /** Sends the newest copy; true when nothing is left to send. */
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    queue.current = queue.current.then(async () => {
      const save = next.current;
      if (!save) return true;
      next.current = null;
      if ((await send(save)).kind !== "retry") return true;
      next.current ??= save;
      return false;
    });
    return queue.current;
  }, [send]);
  /** The last copy before the chat ends: kept on this device first, then tried with a pause between tries. */
  const finish = useCallback(async () => {
    const last = next.current;
    const key = last && `${UNSENT_ROOT}${last.id}`;
    if (last && key) storage.write(key, JSON.stringify({ board: last.board, at: Date.now() }));
    for (let i = 0; i < FINAL_TRIES; i++) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (i - 1)));
      if (await flush()) {
        if (key) storage.remove(key);
        return true;
      }
    }
    // Still not sent: it stays on this device for the next time the desk opens.
    next.current = null;
    return false;
  }, [flush]);
  const save = useCallback((id: string, history: BoardHistory) => {
    next.current = { id, board: encodeHistory(history) };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), BOARD_SAVE_MS);
  }, [flush]);
  useEffect(() => {
    // Boards an earlier visit could not send: each is tried once.
    for (const key of storage.keys()) {
      const raw = storage.read(key);
      const entry = raw ? readUnsent(raw) : null;
      if (!entry || Date.now() - entry.at > UNSENT_KEEP_MS) {
        storage.remove(key);
        continue;
      }
      queue.current = queue.current.then(async () => {
        if ((await send({ id: key.slice(UNSENT_ROOT.length), board: entry.board })).kind !== "retry") storage.remove(key);
        return true;
      });
    }
    const gone = () => void flush();
    window.addEventListener("pagehide", gone);
    return () => {
      window.removeEventListener("pagehide", gone);
      void flush();
    };
  }, [flush, send]);
  return { save, flush, finish };
}

export function useDeskChat(initial: ChatUsage | null, at: { book: string; page: number; question: number | null }) {
  const [usage, setUsage] = useState(initial);
  const [chat, setChat] = useState<ChatView | null>(null);
  const [ownerKey, setOwnerKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startId = useRef<string | null>(null);
  const pending = useRef<{ id: string; messageId: string; revision: number; text: string } | null>(null);
  const epoch = useRef(0);
  const requestBusy = useRef(false);
  const key = `unica-chat:${at.book}:${at.page}:${at.question}`;
  const [uncertain, setUncertain] = useState(false);
  /** The call's board for a chat, when the desk took it from the call (`n` counts each time it did, R625b-4). */
  const [savedBoard, setSavedBoard] = useState<{ id: string; history: BoardHistory; n: number } | null>(null);
  const takeSaved = useCallback((id: string, history: BoardHistory) => setSavedBoard((was) => ({ id, history, n: (was?.n ?? 0) + 1 })), []);
  const board = useBoardSaver(takeSaved);
  const request = useCallback(async (action: { type: string; [field: string]: unknown }, generation = epoch.current) => {
    const res = await fetch("/api/desk/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
    const answer = await res.json() as ChatReply;
    if (generation !== epoch.current) return null;
    if (!res.ok || !answer.usage) throw Error(ERROR);
    setUsage(answer.usage);
    setChat(answer.chat);
    if (action.type === "child") {
      // Only a known refusal or a settled turn releases this ID. Lost replies keep it for a safe retry.
      if (answer.admission === "refused" || !answer.error) {
        pending.current = null;
        setUncertain(false);
      } else setUncertain(true);
    }
    if (answer.error && answer.error !== "cap") throw Error(ERROR);
    setError(null);
    return answer;
  }, []);
  const refresh = useCallback(async (generation = epoch.current) => {
    if (requestBusy.current) return false;
    const id = chat?.id ?? startId.current;
    if (!id) return false;
    requestBusy.current = true;
    try {
      const turn = pending.current;
      await request(turn ? { type: "child", ...turn } : { type: "read", id }, generation);
      return true;
    } catch {
      if (generation === epoch.current) setError(ERROR);
      return false;
    } finally { requestBusy.current = false; }
  }, [chat?.id, request]);
  useEffect(() => {
    epoch.current++;
    const generation = epoch.current;
    let id: string | null = null;
    try { id = sessionStorage.getItem(key); } catch { /* Storage can be off. */ }
    queueMicrotask(() => {
      if (generation !== epoch.current) return;
      setChat(null); setError(null); setBusy(false); setUncertain(false); setOwnerKey(key);
      pending.current = null; startId.current = id;
      if (initial && id) {
        const chatId = id;
        void request({ type: "read", id: chatId }, generation).catch(() => { if (generation === epoch.current) setError(ERROR); });
        // The chat's board as the call keeps it: a board with no draft on this device takes it back (R625b-4).
        void fetch(`/api/desk/chat/board?id=${chatId}`)
          .then((res) => (res.ok ? (res.json() as Promise<{ board?: unknown }>) : null))
          .then((answer) => {
            const saved = typeof answer?.board === "string" ? decodeHistory(answer.board) : null;
            if (saved && generation === epoch.current) takeSaved(chatId, saved);
          })
          .catch(() => { /* The board on this device stands as it is. */ });
      }
    });
    return () => { epoch.current = generation + 1; };
    // Each picked question owns its conversation. No child text goes in browser storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, request]);
  useEffect(() => {
    if (!usage) return;
    const timer = setTimeout(() => window.location.reload(), Math.max(1000, usage.resetsAt - Date.now() + 1000));
    return () => clearTimeout(timer);
  }, [usage]);
  useEffect(() => {
    if (!chat?.pending && !uncertain) return;
    const generation = epoch.current;
    let stopped = false, failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (stopped || generation !== epoch.current) return;
      const ok = await refresh(generation);
      if (stopped || generation !== epoch.current) return;
      failures = ok ? 0 : failures + 1;
      timer = setTimeout(() => void poll(), Math.min(30_000, 3000 * 2 ** Math.min(failures, 4)));
    };
    timer = setTimeout(() => void poll(), 3000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [chat?.pending, uncertain, refresh]);
  const act = async (type: "start" | "child" | "end", text?: string): Promise<boolean> => {
    if (requestBusy.current || at.question === null) return false;
    requestBusy.current = true;
    setBusy(true); setError(null);
    const generation = epoch.current;
    try {
      if (type === "start") {
        const id = (chat?.ended ? null : startId.current) ?? crypto.randomUUID();
        startId.current = id;
        try { sessionStorage.setItem(key, id); } catch { /* A reload can start a new session. */ }
        await request({ type, id, question: { source: "workbook", workbookId: at.book, page: at.page, question: at.question } }, generation);
      } else if (chat) {
        if (type === "child") {
          pending.current ??= { id: chat.id, messageId: crypto.randomUUID(), revision: chat.revision, text: text ?? "" };
          await request({ type, ...pending.current }, generation);
        } else {
          // The child's ink goes with the call before it ends (#534); if it cannot, it stays on this device (R625-5).
          await board.finish();
          await request({ type, id: chat.id, revision: chat.revision }, generation);
        }
      }
      return true;
    } catch {
      if (generation === epoch.current) {
        setError(ERROR);
        if (pending.current) setUncertain(true);
      }
      return false;
    } finally { requestBusy.current = false; if (generation === epoch.current) setBusy(false); }
  };
  return { usage, chat: ownerKey === key ? chat : null, busy, error, act, retry: refresh, uncertain, saveBoard: board.save, savedBoard };
}
export type DeskChatState = ReturnType<typeof useDeskChat>;

/**
 * Whether the desk shows Maya's held words for the picked question (#527): it is held, and no chat is open on it, or an
 * old ended chat on it never said them (a chat from before, which closed with other words).
 */
export function showHeldNote(held: readonly string[] | null, chat: ChatView | null): boolean {
  if (!held) return false;
  if (!chat) return true;
  if (!chat.ended) return false;
  const explained = held.slice(-2).join(" ");
  return !chat.transcript.some((line) => line.speaker === "maya" && line.text.includes(explained));
}

/** `held`: the picked question is one Maya cannot teach yet (#527), so no chat starts on it. */
export function ChatControls({ state, picked, held = false }: { state: DeskChatState; picked: boolean; held?: boolean }) {
  const [text, setText] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    if (await state.act("child", text)) setText("");
  };
  if (state.usage?.left === 0) return <p className="desk-bubble" role="status">{chatCapLine()}</p>;
  const closed = !state.usage?.left || state.chat?.ended;
  return <>
    {state.chat?.pending && <p className="desk-event" role="status">Maya is working on your message…</p>}
    {state.error && <><p className="desk-error" role="alert">{state.error}</p><button type="button" className="desk-chat-end" onClick={() => void state.retry()}>Try again</button></>}
    {held && (!state.chat || state.chat.ended) ? null : !state.chat || state.chat.ended ? <button className="desk-pick" type="button" disabled={!picked || state.busy || !state.usage?.left}
      onClick={() => void state.act("start")}>{state.busy ? "Opening chat…" : state.chat?.ended ? "Chat again" : "Chat with Maya"}</button>
      : <button className="desk-chat-end" type="button" disabled={state.busy || state.uncertain || state.chat?.pending} onClick={() => void state.act("end")}>End chat</button>}
    <form className="desk-compose" onSubmit={submit}>
      <input type="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} disabled={state.busy || state.uncertain || state.chat?.pending || !state.chat || !!closed}
        placeholder="Write to Maya" aria-label="Write to Maya" />
      <button type="submit" disabled={state.busy || state.uncertain || state.chat?.pending || !state.chat || !!closed || !text.trim()} aria-label="Send"><Icon name="send" size={20} /></button>
    </form>
  </>;
}

/**
 * The chat's board (#534): "Our board" with Maya's replies on it. The child keeps the pen tools all through the chat;
 * Maya takes the pen only while she writes, never removes the child's ink, and every change goes to `onBoard`.
 */
export function ChatBoard({ chat, still, carry, saved, onBoard }: {
  chat: ChatView;
  still: boolean;
  /** The question's board the chat started from: its ink comes onto the chat's board. */
  carry?: { book: string; page: number; question: number | null };
  /** The call's board for this chat, when the desk took it from the call: the board is rebuilt on it (R625b-4). */
  saved?: BoardHistory | null;
  onBoard?: (history: BoardHistory) => void;
}) {
  return <OurBoard
    key={chat.id}
    question={null}
    at={{ book: "chat", page: 0, question: null }}
    chat={{ id: chat.id, batches: chat.batches, carry }}
    onChange={onBoard}
    saved={saved ?? null}
    still={still}
    label="Maya's drawing for your question"
    caption="Follow each step. Then write on your paper."
  />;
}
