"use client";
import { useRef, useState, useEffect, useCallback, type FormEvent } from "react";
import { encodeHistory, type BoardHistory } from "@/lib/board-history";
import { chatCapLine, type ChatUsage, type ChatView, type ChatReply } from "@/lib/maya-chat";
import { OurBoard } from "@/components/our-board";
import { Icon } from "@/components/desk-icons";

const ERROR = "Your message could not be sent. Try again in a moment.";
/** How long the chat's board waits after a change before it goes to the call (#534). */
const BOARD_SAVE_MS = 1500;
/** A browser sends a request after the page has gone (keepalive) only below about 64 KB. */
const KEEPALIVE_MAX = 60_000;

/**
 * Sends the chat's board to the call (#534): the newest copy, one request at a time, 1.5 s after the last change, and
 * at once before the chat ends or the page goes. A copy that could not be sent goes again with the next one.
 */
function useBoardSaver() {
  const next = useRef<{ id: string; board: string } | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    queue.current = queue.current.then(async () => {
      const save = next.current;
      if (!save) return;
      next.current = null;
      const body = JSON.stringify(save);
      try {
        const res = await fetch("/api/desk/chat/board", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: body.length < KEEPALIVE_MAX });
        if (res.status >= 500) next.current ??= save;
      } catch {
        next.current ??= save;
      }
    });
    return queue.current;
  }, []);
  const save = useCallback((id: string, history: BoardHistory) => {
    next.current = { id, board: encodeHistory(history) };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), BOARD_SAVE_MS);
  }, [flush]);
  useEffect(() => {
    const gone = () => void flush();
    window.addEventListener("pagehide", gone);
    return () => {
      window.removeEventListener("pagehide", gone);
      void flush();
    };
  }, [flush]);
  return { save, flush };
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
  const board = useBoardSaver();
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
      if (initial && id) void request({ type: "read", id }, generation).catch(() => { if (generation === epoch.current) setError(ERROR); });
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
          // The child's ink goes with the call before it ends (#534).
          await board.flush();
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
  return { usage, chat: ownerKey === key ? chat : null, busy, error, act, retry: refresh, uncertain, saveBoard: board.save };
}
export type DeskChatState = ReturnType<typeof useDeskChat>;

export function ChatControls({ state, picked }: { state: DeskChatState; picked: boolean }) {
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
    {!state.chat || state.chat.ended ? <button className="desk-pick" type="button" disabled={!picked || state.busy || !state.usage?.left}
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
export function ChatBoard({ chat, still, onBoard }: { chat: ChatView; still: boolean; onBoard?: (history: BoardHistory) => void }) {
  return <OurBoard
    key={chat.id}
    question={null}
    at={{ book: "chat", page: 0, question: null }}
    chat={{ id: chat.id, batches: chat.batches }}
    onChange={onBoard}
    still={still}
    label="Maya's drawing for your question"
    caption="Follow each step. Then write on your paper."
  />;
}
