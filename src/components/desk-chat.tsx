"use client";
import { useMemo, useRef, useState, useEffect, type FormEvent } from "react";
import { applyBatch, boardView, createScene } from "@/lib/board";
import { fitView, type PlayStep } from "@/lib/board-svg";
import { chatCapLine, type ChatUsage, type ChatView, type ChatReply } from "@/lib/maya-chat";
import { MayaBoard } from "@/components/maya-board";
import { Icon } from "@/components/desk-icons";

const ERROR = "Your message could not be sent. Try again in a moment.";
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
  const request = async (action: object, generation = epoch.current) => {
    const res = await fetch("/api/desk/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
    const answer = await res.json() as ChatReply;
    if (generation !== epoch.current) return null;
    if (!res.ok || !answer.usage) throw Error(ERROR);
    setUsage(answer.usage);
    setChat(answer.chat);
    if (answer.error && answer.error !== "cap") throw Error(ERROR);
    return answer;
  };
  useEffect(() => {
    epoch.current++;
    const generation = epoch.current;
    queueMicrotask(() => {
      if (generation !== epoch.current) return;
      setChat(null); setError(null); setBusy(false); setOwnerKey(key);
      pending.current = null; startId.current = null;
    });
    let id: string | null = null;
    try { id = sessionStorage.getItem(key); } catch { /* Storage can be off. */ }
    if (initial && id) void request({ type: "read", id }, generation).catch(() => { if (generation === epoch.current) setError(ERROR); });
    return () => { epoch.current = generation + 1; };
    // Each picked question owns its conversation. No child text goes in browser storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!usage) return;
    const timer = setTimeout(() => window.location.reload(), Math.max(1000, usage.resetsAt - Date.now() + 1000));
    return () => clearTimeout(timer);
  }, [usage]);
  useEffect(() => {
    if (!chat?.pending) return;
    const timer = setTimeout(() => void request({ type: "read", id: chat.id }).catch(() => setError(ERROR)), 3000);
    return () => clearTimeout(timer);
    // The reply changes the pending state and schedules the next read.
  }, [chat]);
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
          pending.current = null;
        } else await request({ type, id: chat.id, revision: chat.revision }, generation);
      }
      return true;
    } catch { if (generation === epoch.current) setError(ERROR); return false; }
    finally { requestBusy.current = false; if (generation === epoch.current) setBusy(false); }
  };
  return { usage, chat: ownerKey === key ? chat : null, busy, error, act };
}
export type DeskChatState = ReturnType<typeof useDeskChat>;

export function ChatControls({ state, picked }: { state: DeskChatState; picked: boolean }) {
  const [text, setText] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    if (await state.act("child", text)) setText("");
  };
  const closed = !state.usage?.left || state.chat?.ended;
  return <>
    {state.chat?.pending && <p className="desk-event" role="status">Maya is working on your message…</p>}
    {state.error && <p className="desk-error" role="alert">{state.error}</p>}
    {state.usage?.left === 0 && <p className="desk-bubble" role="status">{chatCapLine(state.usage)}</p>}
    {!state.chat || state.chat.ended ? <button className="desk-pick" type="button" disabled={!picked || state.busy || !state.usage?.left}
      onClick={() => void state.act("start")}>{state.busy ? "Opening chat…" : state.chat?.ended ? "Chat again" : "Chat with Maya"}</button>
      : <button className="desk-chat-end" type="button" disabled={state.busy || state.chat?.pending} onClick={() => void state.act("end")}>End chat</button>}
    <form className="desk-compose" onSubmit={submit}>
      <input type="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} disabled={state.busy || state.chat?.pending || !state.chat || !!closed}
        placeholder="Write to Maya" aria-label="Write to Maya" />
      <button type="submit" disabled={state.busy || state.chat?.pending || !state.chat || !!closed || !text.trim()} aria-label="Send"><Icon name="send" size={20} /></button>
    </form>
  </>;
}

export function ChatBoard({ chat, still }: { chat: ChatView; still: boolean }) {
  const playback = useMemo(() => {
    let scene = createScene();
    const steps: PlayStep[] = [];
    for (const batch of chat.batches) {
      const applied = applyBatch(scene, batch);
      if (!applied.ok) break;
      scene = applied.scene;
      steps.push({ drawn: applied.drawn, erased: applied.erased, view: boardView(scene) });
    }
    return { steps, viewBox: fitView(steps.flatMap((s) => s.drawn), 0.06) };
  }, [chat.batches]);
  return <section className="desk-board desk-chat-board" id="chat-board" aria-labelledby="desk-board-title">
    <header><h2 id="desk-board-title">Our board</h2><p>Maya draws here</p></header>
    <div className="desk-canvas">
      <MayaBoard steps={playback.steps} viewBox={playback.viewBox} instant={still} label="Maya's drawing for your question" />
      <p className="desk-caption">Follow each step. Then write on your paper.</p>
    </div>
  </section>;
}
