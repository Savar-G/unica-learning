"use client";
import { useRef, useState, useEffect, useCallback, useMemo, type FormEvent } from "react";
import { growInkLog, historyFromLog, inkLog, readInkEvent, type BoardHistory, type InkEvent } from "@/lib/board-history";
import { chatCapLine, chatSpendLine, type ChatUsage, type ChatView, type ChatReply } from "@/lib/maya-chat";
import { OurBoard } from "@/components/our-board";
import { Icon } from "@/components/desk-icons";

const ERROR = "Your message could not be sent. Try again in a moment.";
class ChatRefusal extends Error {}
/** How long the chat's ink waits after a change before it goes to the call (#534). */
const BOARD_SAVE_MS = 1500;
/** A browser sends a request after the page has gone (keepalive) only below about 64 KB. */
const KEEPALIVE_MAX = 60_000;
/** The last ink before a chat ends is tried this many times, waiting 1 s, then 2 s, between tries (R625-5). */
const FINAL_TRIES = 3;
/** One request gives up after this long (R625b-2): a request that never answers never holds the chat. */
const BOARD_TRY_MS = 5000;
/** The most events one request carries (MAX_INK_EVENTS in src/lib/maya-call.ts). */
const EVENTS_PER_REQUEST = 200;
/**
 * The most encoded bytes of events one request carries (R639-3): far below the route's limit (MAX_INK_TEXT in
 * src/lib/maya-call.ts), so a part can reach the call inside BOARD_TRY_MS on a slow connection.
 */
const BYTES_PER_REQUEST = 250_000;
/** The call takes one append a second (INK_SAVE_GAP_MS in src/lib/maya-call.ts): the wait between two parts of a log. */
const PART_GAP_MS = 1100;
/** How many "busy" answers in a row one send waits through before it stops and tries again later. */
const BUSY_TRIES = 5;
/**
 * Ink events the call does not hold yet, kept on this device by the chat's id (#635), with the child they are of (R639c):
 * two children can share a device, and a desk sends and removes only its own child's ink.
 */
const OUTBOX_ROOT = "unica-chat-ink:";

/**
 * One chat's ink on this device (#635): its log (`log[i]` has sequence i + 1; null where only the call still has it, for
 * an outbox read back after a reload), the last sequence the call said it holds, and the child it is of. `null`: an outbox
 * from before the mark, which only test families can hold; it stays unmarked until this desk's call owns it.
 */
type Ink = { log: (InkEvent | null)[]; acked: number; child: string | null };
/**
 * What one request did: "sent" (the call holds more now), "again" (the call asked for an earlier start: send at once),
 * "final" (the call will never take this ink: it ended long ago, it is gone, or it is not this child's, R639b-2), "busy"
 * (the call took an append less than a second ago), "retry" (anything else: a server error, no answer, or a refusal of
 * this session or desk, which says nothing about the ink, R625b-3).
 */
type Sent = "sent" | "again" | "final" | "busy" | "retry";

/** The next part of the log to send (R639-3): by count and by encoded size; always at least one event. Null: not sendable yet. */
function nextPart(ink: Ink): InkEvent[] | null {
  const part: InkEvent[] = [];
  let bytes = 0;
  for (let i = ink.acked; i < ink.log.length && part.length < EVENTS_PER_REQUEST; i++) {
    const e = ink.log[i];
    if (e === null) return null;
    bytes += new TextEncoder().encode(JSON.stringify(e)).length + 1;
    if (part.length > 0 && bytes > BYTES_PER_REQUEST) break;
    part.push(e);
  }
  return part.length > 0 ? part : null;
}

async function sendInk(id: string, ink: Ink): Promise<Sent> {
  const from = ink.acked + 1;
  const events = nextPart(ink);
  if (!events) return "retry";
  const body = JSON.stringify({ id, from, events });
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), BOARD_TRY_MS);
  try {
    const res = await fetch("/api/desk/chat/board", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: body.length < KEEPALIVE_MAX, signal: stop.signal });
    if (res.status === 410) return "final";
    if (res.status === 429) return "busy";
    const answer = (await res.json().catch(() => null)) as { held?: unknown; error?: unknown } | null;
    // Only the route's own answer: another 404 (a page that is not this route) says nothing about the call. Since #652 the
    // route says not_found only when no chat of this desk's family has this id; a sibling's chat is 403 "not_this_desk",
    // which, like any refusal of the desk that asked, keeps the ink.
    if (res.status === 404 && answer?.error === "not_found") return "final";
    const held = Number.isInteger(answer?.held) ? (answer!.held as number) : null;
    if (res.ok && held !== null && held >= ink.acked) {
      ink.acked = Math.min(held, ink.log.length);
      return "sent";
    }
    // `from` is past what the call holds: it holds less than this device thought, so send again from there.
    if (res.status === 409 && held !== null && held < ink.acked && ink.log.slice(held, ink.acked).every((e) => e !== null)) {
      ink.acked = held;
      return "again";
    }
    return "retry";
  } catch {
    return "retry";
  } finally {
    clearTimeout(timer);
  }
}

const storage = {
  keys: (): string[] => { try { return Object.keys(window.localStorage).filter((k) => k.startsWith(OUTBOX_ROOT)); } catch { return []; } },
  read: (key: string): string | null => { try { return window.localStorage.getItem(key); } catch { return null; } },
  write: (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* Storage can be full or off. */ } },
  remove: (key: string) => { try { window.localStorage.removeItem(key); } catch { /* Nothing to remove. */ } },
};

/** An outbox read back for this child's desk: its ink; "sibling" when it is another child's, read no further; null when it cannot be read. */
function readOutbox(raw: string, child: string): Ink | "sibling" | null {
  try {
    const box = JSON.parse(raw) as { acked?: unknown; events?: unknown; child?: unknown };
    if (typeof box.child === "string" && box.child !== child) return "sibling";
    const events = Array.isArray(box.events) ? box.events.map(readInkEvent) : null;
    if (!Number.isInteger(box.acked) || (box.acked as number) < 0 || !events || events.some((e) => e === null)) return null;
    return { log: [...Array<null>(box.acked as number).fill(null), ...events], acked: box.acked as number, child: typeof box.child === "string" ? box.child : null };
  } catch {
    return null;
  }
}

/**
 * Sends the child's ink of a chat to the call (#534, #635) as an append-only log. Every change is first kept on this
 * device (the outbox: the events the call does not hold yet), then sent 1.5 s after the last change, at once before the
 * chat ends, and when the page goes. Each request carries only events from the first one the call does not hold, and
 * the call answers with the last sequence it holds; nothing is ever replaced, so there is no conflict to resolve.
 * Before the chat ends, the ink is tried three times; the chat ends either way (R625-5, R625b-2). The outbox goes from
 * the device only when the call holds every event in it, or says it never will (R625b-3, R635-1, R635-2, R639-5,
 * R639b-2): the call alone knows when its time is past. The next desk load sends what is left: each chat has its own
 * queue, and old chats go one at a time in the background, so they never hold the chat on the desk. A sibling's outbox is
 * never read, sent or removed here: it waits on the device for that child's desk (R639c).
 *
 * A send belongs to the desk that started it (#652): when the desk closes or turns to another child, every send of it
 * stops before its next request or wait, and an answer that comes back after that changes nothing on the device. The
 * next desk asks again under its own lock.
 */
function useInkSaver(child: string) {
  /** Counts the desks this saver has served: a send of an earlier one stops. */
  const generation = useRef(0);
  const chats = useRef(new Map<string, Ink>());
  const queues = useRef(new Map<string, Promise<boolean>>());
  /** The chats of this visit: what a page going away sends, before old ink can use up what the browser allows. */
  const visit = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Keeps what the call does not hold on this device, or forgets it once the call holds all of it. */
  const keep = useCallback((id: string, ink: Ink) => {
    const key = `${OUTBOX_ROOT}${id}`;
    if (ink.acked >= ink.log.length) storage.remove(key);
    else storage.write(key, JSON.stringify({ acked: ink.acked, events: ink.log.slice(ink.acked), ...(ink.child ? { child: ink.child } : {}) }));
  }, []);
  /** Sends a chat's events the call does not hold, one request after another; true when it holds them all. */
  const flush = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    const mine = generation.current;
    const stopped = () => generation.current !== mine;
    const run = (queues.current.get(id) ?? Promise.resolve(true)).then(async () => {
      const ink = chats.current.get(id);
      if (!ink || stopped()) return !ink;
      let busy = 0;
      while (ink.acked < ink.log.length) {
        // Work on a copy: an answer for a desk that has closed must not move this device's place in the log.
        const tried: Ink = { ...ink };
        const sent = await sendInk(id, tried);
        if (stopped()) return false;
        ink.acked = tried.acked;
        if (sent === "final") {
          // The call will never take this chat's ink.
          chats.current.delete(id);
          storage.remove(`${OUTBOX_ROOT}${id}`);
          return true;
        }
        keep(id, ink);
        if (sent === "retry" || (sent === "busy" && ++busy > BUSY_TRIES)) return false;
        if (sent === "sent") busy = 0;
        // The next part waits for the call's one append a second (R639-3).
        if ((sent === "busy" || sent === "sent") && ink.acked < ink.log.length) await new Promise((resolve) => setTimeout(resolve, PART_GAP_MS));
        if (stopped()) return false;
      }
      return true;
    });
    queues.current.set(id, run);
    return run;
  }, [keep]);
  /** The last ink before the chat ends: it is on the device already; tried with a pause between tries. */
  const finish = useCallback(async (id: string) => {
    const mine = generation.current;
    for (let i = 0; i < FINAL_TRIES && generation.current === mine; i++) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (i - 1)));
      if (generation.current !== mine) break;
      if (await flush(id)) return true;
    }
    return false;
  }, [flush]);
  /** A change of the chat's board. The log only grows: a board that fell behind never takes back a sequence (R639-1, R639-2). */
  const save = useCallback((id: string, history: BoardHistory) => {
    visit.current.add(id);
    const ink = chats.current.get(id) ?? { log: [], acked: 0, child };
    ink.child = child;
    ink.log = growInkLog(ink.log, inkLog(history));
    ink.acked = Math.min(ink.acked, ink.log.length);
    chats.current.set(id, ink);
    keep(id, ink);
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => void flush(id), BOARD_SAVE_MS));
  }, [child, flush, keep]);
  /**
   * The call's log of a chat read back: the whole log the board starts from, the call's events first, then the ink still
   * on this device past them (R639-1). Ink of this device that the call does not hold at its place goes after them.
   */
  const restore = useCallback((id: string, held: InkEvent[]): InkEvent[] => {
    visit.current.add(id);
    const ink = chats.current.get(id) ?? { log: [], acked: 0, child };
    // The call answered this child's desk with this chat's log, so the chat is this child's.
    ink.child = child;
    const device = ink.log.map((e, i) => e ?? held[i] ?? null).filter((e): e is InkEvent => e !== null);
    const log = growInkLog(held, device);
    // A device's place in the log counts only where its log is the call's.
    ink.acked = log === device ? Math.max(ink.acked, held.length) : held.length;
    ink.log = log;
    chats.current.set(id, ink);
    keep(id, ink);
    return log;
  }, [child, keep]);
  useEffect(() => {
    // Ink an earlier visit could not send: each chat's outbox is tried once now, one after another, behind the desk.
    const waiting: string[] = [];
    for (const key of storage.keys()) {
      const raw = storage.read(key);
      const box = raw ? readOutbox(raw, child) : null;
      if (box === "sibling") continue;
      if (!box) {
        storage.remove(key);
        continue;
      }
      const id = key.slice(OUTBOX_ROOT.length);
      if (!chats.current.has(id)) chats.current.set(id, box);
      waiting.push(id);
    }
    let left = true;
    void (async () => {
      for (const id of waiting) {
        if (!left) return;
        await flush(id);
      }
    })();
    // A page going away sends this visit's ink, under this desk's lock while the page still holds it.
    const gone = () => { for (const id of visit.current) void flush(id); };
    window.addEventListener("pagehide", gone);
    const pending = timers.current;
    const chatsNow = chats.current, queuesNow = queues.current, visitNow = visit.current, desks = generation;
    return () => {
      // The desk closes or turns to another child (#652): every send of this desk stops, and nothing of it is sent
      // later under another desk's lock. What the call does not hold stays on the device for this child's next desk.
      left = false;
      desks.current++;
      window.removeEventListener("pagehide", gone);
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
      chatsNow.clear();
      queuesNow.clear();
      visitNow.clear();
    };
  }, [child, flush]);
  return { save, flush, finish, restore };
}

export function useDeskChat(initial: ChatUsage | null, at: { book: string; page: number; question: number | null }, child: string) {
  const [usage, setUsage] = useState(initial);
  const [chat, setChat] = useState<ChatView | null>(null);
  const [ownerKey, setOwnerKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startId = useRef<string | null>(null);
  const pending = useRef<{ id: string; messageId: string; revision: number; text: string } | null>(null);
  const epoch = useRef(0);
  const requestBusy = useRef(false);
  const referenceStart = useRef<{ id: string; text: string } | null>(null);
  const key = `unica-chat:${at.book}:${at.page}:${at.question}`;
  const [uncertain, setUncertain] = useState(false);
  /**
   * A chat picked up again (#635): the ink log the call holds for it, with the ink still on this device after it, which
   * the board starts from. "loading" until the call answers (the board waits, so no line is drawn on a board the call's
   * log would not match).
   */
  const [callInk, setCallInk] = useState<{ id: string; log: InkEvent[] | "loading" } | null>(null);
  const board = useInkSaver(child);
  const request = useCallback(async (action: { type: string; [field: string]: unknown }, generation = epoch.current) => {
    if (generation !== epoch.current) return null;
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
    // The message cap and Maya's spending cap (D-290) are told by the usage, not as an error.
    if (answer.error && !["cap", "week_used", "paused"].includes(answer.error)) throw new ChatRefusal(answer.errorLine ?? ERROR);
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
      pending.current = null; startId.current = id; referenceStart.current = null;
      if (initial && id) {
        const chatId = id;
        void request({ type: "read", id: chatId }, generation).catch(() => { if (generation === epoch.current) setError(ERROR); });
        // The ink the call holds for this chat: a board with no draft on this device starts from it (#635). Tried again
        // until the call answers; a chat the call does not know for this desk has none.
        setCallInk({ id: chatId, log: "loading" });
        const readInk = async (wait: number): Promise<void> => {
          try {
            const res = await fetch(`/api/desk/chat/board?id=${chatId}`);
            const answer = (await res.json().catch(() => null)) as { events?: unknown; error?: unknown } | null;
            if (generation !== epoch.current) return;
            const log = res.ok && Array.isArray(answer?.events) ? answer.events.map(readInkEvent) : null;
            if (log && log.every((e) => e !== null)) {
              setCallInk({ id: chatId, log: board.restore(chatId, log as InkEvent[]) });
              return;
            }
            // No such chat, or not this desk's (#652): the board starts with what this device holds.
            if (res.status === 404 || (res.status === 403 && answer?.error === "not_this_desk")) { setCallInk({ id: chatId, log: [] }); return; }
          } catch { /* Tried again below. */ }
          if (generation !== epoch.current) return;
          await new Promise((resolve) => setTimeout(resolve, wait));
          if (generation === epoch.current) await readInk(Math.min(30_000, wait * 2));
        };
        void readInk(3000);
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
    if (requestBusy.current || (type === "start" && !text?.trim() && at.question === null && !chat?.question)) return false;
    requestBusy.current = true;
    setBusy(true); setError(null);
    const generation = epoch.current;
    try {
      if (type === "start") {
        const reference = text?.trim();
        if (reference && chat && !chat.ended) {
          await board.finish(chat.id);
          const ended = await request({ type: "end", id: chat.id, revision: chat.revision }, generation);
          if (!ended?.chat?.ended) return false;
        }
        if (reference && referenceStart.current?.text !== reference) referenceStart.current = { id: crypto.randomUUID(), text: reference };
        const id = reference ? referenceStart.current!.id : (chat?.ended ? null : startId.current) ?? crypto.randomUUID();
        startId.current = id;
        try { sessionStorage.setItem(key, id); } catch { /* A reload can start a new session. */ }
        await request(reference ? { type, id, workbookId: at.book, reference }
          : { type, id, question: chat?.question ?? { source: "workbook", workbookId: at.book, page: at.page, question: at.question } }, generation);
        referenceStart.current = null;
      } else if (chat) {
        if (type === "child") {
          pending.current ??= { id: chat.id, messageId: crypto.randomUUID(), revision: chat.revision, text: text ?? "" };
          await request({ type, ...pending.current }, generation);
        } else {
          // The child's ink goes with the call before it ends (#534); if it cannot, it stays on this device (R625-5).
          await board.finish(chat.id);
          await request({ type, id: chat.id, revision: chat.revision }, generation);
        }
      }
      return true;
    } catch (failure) {
      if (generation === epoch.current) {
        setError(failure instanceof ChatRefusal ? failure.message : ERROR);
        if (pending.current) setUncertain(true);
      }
      return false;
    } finally { requestBusy.current = false; if (generation === epoch.current) setBusy(false); }
  };
  return { usage, chat: ownerKey === key ? chat : null, busy, error, act, retry: refresh, uncertain, saveBoard: board.save, callInk };
}
export type DeskChatState = ReturnType<typeof useDeskChat>;

export function ChatControls({ state, picked, held = false }: { state: DeskChatState; picked: boolean; held?: boolean }) {
  const [text, setText] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    const selecting = !state.chat || state.chat.ended || /^\s*page\b/i.test(text);
    if (await state.act(selecting ? "start" : "child", text)) setText("");
  };
  if (state.usage?.left === 0) return <p className="desk-bubble" role="status">{chatCapLine()}</p>;
  const stopped = chatSpendLine(state.usage);
  if (stopped && (!state.chat || state.chat.ended)) return <p className="desk-bubble" role="status">{stopped}</p>;
  const closed = !state.usage?.left;
  const selecting = !state.chat || state.chat.ended;
  return <>
    {state.chat?.pending && <p className="desk-event" role="status">Maya is working on your message…</p>}
    {state.error && <><p className="desk-error" role="alert">{state.error}</p><button type="button" className="desk-chat-end" onClick={() => void state.retry()}>Try again</button></>}
    {!state.chat || state.chat.ended ? !held && <button className="desk-pick" type="button" disabled={!picked || state.busy || !state.usage?.left}
      onClick={() => void state.act("start")}>{state.busy ? "Opening chat…" : state.chat?.ended ? "Chat again" : "Chat with Maya"}</button>
      : <button className="desk-chat-end" type="button" disabled={state.busy || state.uncertain || state.chat?.pending} onClick={() => void state.act("end")}>End chat</button>}
    <form className="desk-compose" onSubmit={submit}>
      <input type="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={selecting ? 100 : 500} disabled={state.busy || state.uncertain || state.chat?.pending || !!closed}
        placeholder={selecting ? "Page 4, number 3" : "Write to Maya"} aria-label={selecting ? "Page and question number" : "Write to Maya"} />
      <button type="submit" disabled={state.busy || state.uncertain || state.chat?.pending || !!closed || !text.trim()} aria-label="Send"><Icon name="send" size={20} /></button>
    </form>
  </>;
}

/**
 * The chat's board (#534): "Our board" with Maya's replies on it. The child keeps the pen tools all through the chat;
 * Maya takes the pen only while she writes, never removes the child's ink, and every change goes to `onBoard`.
 */
/**
 * The chat's board (#534): "Our board" with Maya's replies on it. The child keeps the pen tools all through the chat;
 * Maya takes the pen only while she writes, never removes the child's ink, and every change goes to `onBoard`. A chat
 * picked up again starts from the ink the call holds and the ink on this device (`restore`), unless a draft holds all of
 * it; until the call answers, the board says it is coming.
 */
export function ChatBoard({ chat, still, carry, restore, onBoard }: {
  chat: ChatView;
  still: boolean;
  /** The question's board the chat started from: its ink comes onto the chat's board. */
  carry?: { book: string; page: number; question: number | null };
  /** The ink log the call holds for this chat with the ink on this device, "loading" while the desk asks, or null for a new chat. */
  restore?: InkEvent[] | "loading" | null;
  onBoard?: (history: BoardHistory) => void;
}) {
  // Read once, when the board starts: the board takes it only then.
  const restored = useMemo(() => (Array.isArray(restore) && restore.length > 0 ? historyFromLog(restore, chat.batches) : null), [restore, chat.batches]);
  if (restore === "loading") {
    return <section className="desk-board" id="chat-board" aria-labelledby="desk-board-title" aria-busy="true">
      <header><h2 id="desk-board-title">Our board</h2></header>
      <p className="desk-caption" role="status">Getting our board back…</p>
    </section>;
  }
  return <OurBoard
    key={chat.id}
    question={null}
    at={{ book: "chat", page: 0, question: null }}
    chat={{ id: chat.id, batches: chat.batches, carry }}
    onChange={onBoard}
    restore={restored}
    still={still}
    label="Maya's drawing for your question"
    caption="Follow each step. Then write on your paper."
  />;
}
