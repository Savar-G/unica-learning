"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Avatar, Icon } from "@/components/desk-icons";
import { MayaBoard } from "@/components/maya-board";
import { clock, useMayaVoiceRoom, useMicCheck, type MayaState } from "@/components/maya-voice-room";
import type { BoardSnapshot } from "@/lib/board-protocol";
import type { PlayStep } from "@/lib/board-svg";
import {
  afterCallLine, boardOfSnapshot, leftWhileLive, MIC_LINE, roomErrorLine, startErrorLine, voiceLeftLine, voiceScreen, voiceWeekUsed, voiceWeekUsedLine,
  type VoiceFlow,
} from "@/lib/desk-voice-screen";
import type { DeskVoiceCall, DeskVoiceReply, VoiceTicket, VoiceUsage } from "@/lib/maya-voice-desk";

// The child's voice call with Maya on the desk (D-197 voice MVP). One call control beside chat: the child picks a
// question, taps Call Maya, checks the microphone, and the call starts on the server (POST /api/desk/voice). The room
// itself (LiveKit, the microphone, Maya's board over RPC) is the shared hook in maya-voice-room.ts, the same one the
// admin test call uses. During a call Maya's board shows in the desk's board area, read-only: the child's pen is not
// part of a voice call. The screen to show is decided by src/lib/desk-voice-screen.ts.
//
// The call is made when the microphone check opens (docs/maya-voice.md, "The child joins the room before the Connect
// tap"): its start (with the weekly check) and its ticket come while the child checks the microphone, and the room
// joins in the background with the microphone off. "Start the call" then only goes live. A call made for the check is
// cancelled (the room left, and the route's "cancel") when the child leaves the check, when the microphone does not
// work, when the page is closed, and PREMADE_LIFE_MS after it was made with no tap. After that, "Start the call" starts
// in full, with a new call and a new ticket, as before. Maya never joined a cancelled call, so it counts nothing.

const MAYA_TEXT: Record<Exclude<MayaState, null>, string> = { listening: "Maya is listening", thinking: "Maya is thinking", speaking: "Maya is speaking" };
const EMPTY_BOARD = { steps: [] as PlayStep[], viewBox: "0 0 1000 1000" };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** How long a call made for the microphone check waits for "Start the call" before it is cancelled (ms). */
export const PREMADE_LIFE_MS = 60_000;
/** The longest a new start waits for the last cancel to answer (ms), so the child's one live call is free first. */
const CANCEL_WAIT_MS = 5000;

type VoiceQuestion = { source: "workbook"; workbookId: string; page: number; question: number };
type VoiceRequest =
  | { type: "start"; id: string; question: VoiceQuestion }
  | { type: "token" | "read" | "cancel"; id: string };

/** A call made when the microphone check opened, until "Start the call" takes it or the check drops it. */
interface Premade {
  id: string;
  state: "starting" | "ready" | "taken" | "dropped";
  /** The start was sent: the call can exist on the server. */
  sent: boolean;
  answer: Promise<DeskVoiceReply | null>;
  reply: DeskVoiceReply | null;
  readyAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * One request to the desk's voice route. Null when the server cannot be reached or does not answer in JSON. `keepalive`
 * lets a request finish after the page is gone (a cancel on pagehide); the route takes it as any other POST.
 */
async function post(body: VoiceRequest, keepalive = false): Promise<DeskVoiceReply | null> {
  try {
    const res = await fetch("/api/desk/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), ...(keepalive ? { keepalive: true } : {}) });
    return (await res.json()) as DeskVoiceReply;
  } catch {
    return null;
  }
}

export function useDeskVoice(initial: { usage: VoiceUsage } | null, at: { book: string; page: number; question: number | null }) {
  const [usage, setUsage] = useState<VoiceUsage | null>(initial?.usage ?? null);
  const [flow, setFlow] = useState<VoiceFlow>("idle");
  const [call, setCall] = useState<DeskVoiceCall | null>(null);
  const [callId, setCallId] = useState("");
  const [startError, setStartError] = useState<string | null>(null);
  const [hungUp, setHungUp] = useState(false);
  const [board, setBoard] = useState(EMPTY_BOARD);
  const [shown, setShown] = useState(0);
  // The week as it was before this call: the server counts a live call at its whole limit, so the time left during
  // the call is this minus the call's own seconds, never the server's count minus them again.
  const [base, setBase] = useState<VoiceUsage | null>(null);
  const mic = useMicCheck();
  const { release: releaseMic } = mic;
  const ticket = useRef<VoiceTicket | null>(null);
  const live = useRef({ id: "", hungUp: false });
  const drawn = useRef(-1);
  /** The call made for the microphone check (see the top of this file). */
  const premade = useRef<Premade | null>(null);
  /** The call whose room joins before the tap. */
  const [joinEarly, setJoinEarly] = useState<string | null>(null);
  /** The last cancel this screen sent: a new start waits for it, so the child's one live call is free first. */
  const cancelling = useRef<Promise<unknown>>(Promise.resolve());
  /** Calls this screen made whose end it has not seen: a "busy" start asks about them. */
  const loose = useRef(new Set<string>());
  /** The question the microphone check was opened for. */
  const opened = useRef("");
  const questionKey = `${at.book}:${at.page}:${at.question}`;

  /** Reads the saved call again: its transcript, whether it ended, and the week's time left. */
  const read = useCallback(async () => {
    const id = live.current.id;
    if (!id) return;
    const r = await post({ type: "read", id });
    if (!r || live.current.id !== id) return;
    if (r.usage) setUsage(r.usage);
    const next = r.call;
    if (next && next.id === id) setCall((prev) => (prev && (prev.ended || prev.revision > next.revision) ? prev : next));
  }, []);

  const room = useMayaVoiceRoom({
    callId,
    async getTicket() {
      // The first join uses the ticket the start gave; a later join (after a drop) asks for a new one.
      const first = ticket.current;
      ticket.current = null;
      if (first) return first;
      const r = await post({ type: "token", id: callId });
      if (!r?.ticket) throw new Error(r?.error ?? "failed");
      return r.ticket;
    },
    onUpdate: read,
    async onEnded() {
      // The worker stores the end a moment after the room closes.
      for (const ms of [300, 1200, 3000]) {
        await wait(ms);
        await read();
      }
      if (live.current.hungUp) setFlow((f) => (f === "call" ? "after" : f));
    },
    onBoard(snapshot: BoardSnapshot, restored: boolean) {
      const next = boardOfSnapshot(snapshot);
      if (!next) return;
      if (!restored && next.steps.length === drawn.current) return;
      setShown(restored ? next.steps.length : Math.max(0, drawn.current));
      drawn.current = next.steps.length;
      setBoard(next);
    },
  });

  const { prepare, leave } = room;

  const forget = () => {
    live.current.id = "";
    live.current.hungUp = false;
    drawn.current = -1;
    ticket.current = null;
    setHungUp(false);
    setCall(null);
    setBoard(EMPTY_BOARD);
    setShown(0);
    setBase(null);
  };

  /** A new id for the screen's call: the next start makes a new call. */
  const renew = useCallback(() => {
    const id = crypto.randomUUID();
    live.current.id = id;
    setCallId(id);
    return id;
  }, []);

  /** Cancels a call this screen made, which Maya never joined. It is remembered until the server says it ended. */
  const cancel = useCallback((id: string, keepalive = false) => {
    loose.current.add(id);
    const sent = post({ type: "cancel", id }, keepalive).then((r) => {
      if (r?.call?.status === "ended") loose.current.delete(id);
      return r;
    });
    cancelling.current = sent;
    return sent;
  }, []);

  /**
   * Drops the call made for the microphone check: leaves its room and cancels it. A start that has not answered yet is
   * cancelled when it answers, and at once too on pagehide (`keepalive`), since the page may be gone by then.
   */
  const drop = useCallback((keepalive = false) => {
    const p = premade.current;
    if (!p) return;
    premade.current = null;
    const was = p.state;
    p.state = "dropped";
    if (p.timer) clearTimeout(p.timer);
    ticket.current = null;
    setJoinEarly(null);
    leave();
    if (!p.sent) return;
    if (was !== "starting") return void cancel(p.id, keepalive);
    if (keepalive) void cancel(p.id, true);
    cancelling.current = p.answer.then((r) => (!r || r.call?.status === "live" ? cancel(p.id, keepalive) : null));
  }, [cancel, leave]);

  /**
   * Starts the call `id` on the server, after the last cancel has answered. "busy" with no call means another call of
   * this child is live: when it is one this screen made and Maya never joined, it is read, cancelled, and the start is
   * asked once more. Otherwise the answer is the refusal.
   */
  const startCall = useCallback(async (id: string, question: VoiceQuestion) => {
    await Promise.race([cancelling.current, wait(CANCEL_WAIT_MS)]);
    const r = await post({ type: "start", id, question });
    if (r?.error !== "busy" || r.call) return r;
    let freed = false;
    for (const other of [...loose.current]) {
      if (other === id) continue;
      const seen = await post({ type: "read", id: other });
      if (seen?.call?.status === "live" && !seen.call.started) freed = (await cancel(other))?.call?.status === "ended" || freed;
      else if (seen?.call || seen?.error === "not_found") loose.current.delete(other);
    }
    return freed ? post({ type: "start", id, question }) : r;
  }, [cancel]);

  /** A start the server refused or did not answer: its words, and back to the Call Maya control. */
  const refuse = (r: DeskVoiceReply | null) => {
    releaseMic();
    if (r?.usage) setUsage(r.usage);
    setStartError(startErrorLine(r?.error, r?.usage ?? usage));
    live.current.id = "";
    setFlow("idle");
  };

  /** Makes the call for the microphone check: its start and ticket now; its room joins early once they come. */
  const premake = (id: string, question: VoiceQuestion) => {
    const p: Premade = { id, state: "starting", sent: false, answer: Promise.resolve(null), reply: null, readyAt: 0, timer: null };
    premade.current = p;
    p.answer = (async () => {
      await Promise.race([cancelling.current, wait(CANCEL_WAIT_MS)]);
      if (p.state === "dropped") return null;
      p.sent = true;
      return startCall(id, question);
    })();
    void p.answer.then((r) => {
      // Dropped, or taken by "Start the call", which reads the answer itself.
      if (p.state !== "starting") return;
      premade.current = null;
      p.state = "dropped";
      if (!r) {
        // No answer: the call may exist, so ask it to end. "Start the call" then starts in full.
        void cancel(id);
        renew();
        return;
      }
      // Refused (the week is used, another call is live, ...): the words and the screen of a refused start.
      if (!r.call || !r.ticket) return refuse(r);
      premade.current = p;
      p.state = "ready";
      p.reply = r;
      p.readyAt = Date.now();
      ticket.current = r.ticket;
      p.timer = setTimeout(() => {
        if (premade.current !== p) return;
        drop();
        renew();
      }, PREMADE_LIFE_MS);
      setJoinEarly(id);
    });
  };
  const take = (p: Premade) => {
    p.state = "taken";
    if (p.timer) clearTimeout(p.timer);
    premade.current = null;
    setJoinEarly(null);
  };

  /** Opens the microphone check, and makes the call. `before` runs first (the desk ends an open chat); false from it stops here. */
  const open = async (before?: () => Promise<boolean>) => {
    const q = at.question;
    if (!initial || flow !== "idle" || q === null || voiceWeekUsed(usage)) return;
    if (before && !(await before())) return;
    forget();
    const id = renew();
    opened.current = questionKey;
    setStartError(null);
    setFlow("mic");
    void mic.check();
    premake(id, { source: "workbook", workbookId: at.book, page: at.page, question: q });
  };

  /** The microphone check again. A call the check cancelled (the microphone did not work, or no tap came) is made again. */
  const recheck = () => {
    void mic.check();
    if (flow === "mic" && !premade.current && at.question !== null) premake(callId, { source: "workbook", workbookId: at.book, page: at.page, question: at.question });
  };

  const closeMic = useCallback(() => {
    drop();
    releaseMic();
    live.current.id = "";
    setFlow("idle");
  }, [drop, releaseMic]);

  /**
   * The microphone works. A call made for the check and ready goes live at once: the room joined before the tap (or
   * joins now, with its ticket). Else the server starts the call (or the start under way answers), then the room joins.
   */
  const begin = async () => {
    if (flow !== "mic" || mic.state !== "working" || at.question === null) return;
    const id = callId;
    const p = premade.current?.id === id ? premade.current : null;
    setBase(usage);
    releaseMic();
    if (p?.state === "ready" && p.reply?.call) {
      take(p);
      if (p.reply.usage) setUsage(p.reply.usage);
      setCall(p.reply.call);
      setFlow("call");
      void room.connect();
      return;
    }
    setFlow("starting");
    if (p) take(p);
    const r = p ? await p.answer : await startCall(id, { source: "workbook", workbookId: at.book, page: at.page, question: at.question });
    if (live.current.id !== id) {
      // The child left while it started (the desk closed): the call is not needed.
      if (!r || r.call?.status === "live") void cancel(id);
      return;
    }
    if (!r?.call || !r.ticket) {
      // No answer: the call may exist on the server, so ask it to end.
      if (!r) void cancel(id);
      return refuse(r);
    }
    if (r.usage) setUsage(r.usage);
    ticket.current = r.ticket;
    setCall(r.call);
    setFlow("call");
    void room.connect();
  };

  // The room of the call made for the check joins early, with the microphone off (maya-voice-room.ts, `prepare`).
  useEffect(() => {
    if (flow !== "mic" || !joinEarly || joinEarly !== callId) return;
    void prepare();
    return leave;
  }, [flow, joinEarly, callId, prepare, leave]);

  // A microphone that does not work cancels the call made for the check; "Check again" makes a new one.
  const micBad = mic.state === "blocked" || mic.state === "none" || mic.state === "failed";
  useEffect(() => {
    if (flow !== "mic" || !micBad || !premade.current) return;
    drop();
    renew();
  }, [flow, micBad, drop, renew]);

  // Another question leaves the check.
  useEffect(() => {
    if (flow === "mic" && opened.current !== questionKey) closeMic();
  }, [flow, questionKey, closeMic]);

  // The page closed or put away (pagehide) cancels the call made for the check. A tab hidden so long that its timer
  // could not run (a hidden tab's timers can be slowed or stopped) cancels it as soon as it shows again.
  useEffect(() => {
    if (flow !== "mic") return;
    const hide = () => {
      if (!premade.current) return;
      drop(true);
      renew();
    };
    const shown = () => {
      const p = premade.current;
      if (document.visibilityState !== "visible" || p?.state !== "ready" || Date.now() - p.readyAt < PREMADE_LIFE_MS) return;
      drop();
      renew();
    };
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", shown);
    return () => {
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", shown);
    };
  }, [flow, drop, renew]);

  // The desk closes: the call made for the check is cancelled, and a start still under way is cancelled when it answers.
  useEffect(() => {
    const current = live.current;
    return () => {
      drop(true);
      current.id = "";
    };
  }, [drop]);

  const hangUp = () => {
    live.current.hungUp = true;
    setHungUp(true);
    void room.hangUp();
  };

  /** Joins again after a drop, with a new ticket. */
  const tryAgain = () => {
    live.current.hungUp = false;
    setHungUp(false);
    void room.connect();
  };

  /** Ends a call Maya never joined. */
  const stop = () => {
    const id = callId;
    live.current.hungUp = true;
    void room.hangUp();
    void post({ type: "cancel", id }).then((r) => { if (r?.usage) setUsage(r.usage); });
    live.current.id = "";
    forget();
    setFlow("idle");
  };

  /** Back to the page after a call. */
  const done = () => {
    const id = live.current.id;
    // Until the server has saved the call's end, it counts the call at its whole limit: show the week before the call
    // minus the call's own time, and take the server's count only once it says the call ended.
    if (base) setUsage({ ...base, usedSeconds: base.usedSeconds + room.seconds, leftSeconds: leftWhileLive(base, room.seconds) });
    forget();
    setFlow("idle");
    if (id) void post({ type: "read", id }).then((r) => { if (r?.usage && r.call?.ended) setUsage(r.usage); });
  };

  // Also on the after-call screen: a read made as the call ended can still count it at its whole limit.
  const counting = base !== null && (flow === "starting" || flow === "call" || flow === "after");
  /** Seconds of the week left now, while this call runs (null when no call runs: then `usage` holds the week). */
  const liveLeft = counting && base ? leftWhileLive(base, room.seconds) : null;
  const screen = voiceScreen({ flow, phase: room.phase, callEnded: call?.ended === true, hungUp, error: room.error });
  return {
    enabled: initial !== null, usage, liveLeft, flow, screen, call, mic, room: { phase: room.phase, maya: room.maya, error: room.error, seconds: room.seconds, fakeSpeech: room.fakeSpeech, sending: room.sending, hearing: room.hearing, say: room.say },
    audioHost: room.audioHost, startError, board, shown,
    /** A call is under way or just ended: the desk's own controls give way to the call's. */
    engaged: flow !== "idle",
    /** Maya's board shows for the call and until the child is back on the page. */
    showBoard: flow === "call" || flow === "after",
    picked: at.question !== null,
    open, recheck, closeMic, begin, hangUp, tryAgain, stop, done,
  };
}
export type DeskVoiceState = ReturnType<typeof useDeskVoice>;

/** The Calls limit in the desk header: the minutes left this week, or that the week is used. */
export function VoiceLimit({ state }: { state: DeskVoiceState }) {
  if (!state.enabled || !state.usage) return null;
  return <div><dt><Icon name="phone" size={14} />Calls</dt><dd>{voiceLeftLine(state.liveLeft ?? state.usage.leftSeconds) ?? "Used this week"}</dd></div>;
}

/**
 * The call's talk, as chat shows it: Maya's lines and the child's, in order. While Maya hears the child, their words
 * show as the last bubble in light text, until the saved turn takes its place. That line is for this screen only: it is
 * not saved, and a screen reader reads the saved turn instead.
 */
export function VoiceTranscript({ state }: { state: DeskVoiceState }) {
  const { call } = state;
  if (!call) return null;
  const hearing = state.flow === "call" ? state.room.hearing : null;
  return <>{call.transcript.map((line, i) => (
    <p key={`${call.id}-${i}`} className={`desk-bubble${line.speaker === "child" ? " desk-child-bubble" : ""}`}>
      <span className="sr-only">{line.speaker === "child" ? "You" : "Maya"}: </span>{line.text}
    </p>
  ))}
  {hearing && <p className="desk-bubble desk-child-bubble desk-hearing" aria-hidden="true">{hearing}</p>}</>;
}

/** Maya's board during a call: read-only. The child's pen is not part of a voice call. */
export function VoiceBoard({ state, still }: { state: DeskVoiceState; still: boolean }) {
  const { board, shown } = state;
  return (
    <section className="desk-board" id="voice-board" aria-labelledby="desk-board-title">
      <header>
        <h2 id="desk-board-title">Our board</h2>
        <p><Avatar size={22} />Maya draws here</p>
      </header>
      <div className="desk-board-body desk-board-solo">
        <div className="desk-canvas">
          {board.steps.length > 0 && <MayaBoard steps={board.steps} viewBox={board.viewBox} instant={still} shown={shown} label="Maya's drawing for your question" />}
          <p className="desk-caption">{board.steps.length > 0 ? "Follow each step. Then write on your paper." : "Maya writes here while she talks."}</p>
        </div>
      </div>
    </section>
  );
}

/** The hidden element Maya's voice plays from. */
function AudioHost({ attach }: { attach: (el: HTMLDivElement | null) => void }) {
  return <div ref={attach} hidden />;
}

/** The call control and every screen of a call, in Maya's column. While a call is under way the desk's other controls are hidden (desk.css). */
export function VoiceControls({ state, beforeOpen }: { state: DeskVoiceState; beforeOpen?: () => Promise<boolean> }) {
  const { screen, usage, mic, room, call } = state;
  const [said, setSaid] = useState("");
  if (!state.enabled) return null;
  const used = voiceWeekUsed(usage && state.liveLeft !== null ? { leftSeconds: state.liveLeft } : usage);
  const left = usage ? voiceLeftLine(state.liveLeft ?? usage.leftSeconds) ?? "Less than a minute left this week" : null;
  const error = roomErrorLine(room.error);

  const say = async (event: FormEvent) => {
    event.preventDefault();
    if (await room.say(said)) setSaid("");
  };

  return (
    <div className="desk-voice" aria-label="Call with Maya">
      <AudioHost attach={state.audioHost} />
      {screen === "idle" && <>
        {state.startError && <p className="desk-error" role="alert">{state.startError}</p>}
        {used && usage ? <p className="desk-bubble" role="status">{voiceWeekUsedLine(usage)}</p>
          : <button type="button" className="desk-call" disabled={!state.picked} onClick={() => void state.open(beforeOpen)}><Icon name="phone" />Call Maya</button>}
      </>}

      {screen === "mic" && <>
        <div className="desk-mic-row">
          <span className={`desk-dot is-${mic.state === "working" ? "ok" : mic.state === "blocked" || mic.state === "none" || mic.state === "failed" ? "bad" : "idle"}`} aria-hidden="true" />
          <p role="status">{MIC_LINE[mic.state]}</p>
        </div>
        {mic.state === "working" && (
          <div className="desk-meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(mic.level * 100)}>
            <span style={{ transform: `scaleX(${mic.level})` }} />
          </div>
        )}
        <button type="button" className="desk-call" disabled={mic.state !== "working"} onClick={() => void state.begin()}><Icon name="phone" />Start the call</button>
        <div className="desk-voice-row">
          <button type="button" className="desk-chat-end" disabled={mic.state === "asking"} onClick={state.recheck}>Check again</button>
          <button type="button" className="desk-chat-end" onClick={state.closeMic}>Not now</button>
        </div>
      </>}

      {screen === "starting" && <p className="desk-event" role="status">Starting the call…</p>}
      {screen === "connecting" && <p className="desk-event" role="status">Connecting…</p>}
      {screen === "joining" && <>
        <p className="desk-event" role="status">Maya is joining…</p>
        <button type="button" className="desk-chat-end" onClick={state.stop}>Stop the call</button>
      </>}

      {screen === "live" && <>
        <div className="desk-live-row">
          <span className="desk-live-chip">On the call · <span className="desk-mono">{clock(room.seconds)}</span></span>
          {room.maya && <span className={`desk-maya-state is-${room.maya}`} role="status">{MAYA_TEXT[room.maya]}</span>}
        </div>
        {left && <p className="desk-event">{left}</p>}
        {room.fakeSpeech && (
          <form className="desk-compose" onSubmit={say}>
            <input type="text" value={said} onChange={(e) => setSaid(e.target.value)} maxLength={500} disabled={room.sending}
              placeholder="Test speech: type what you say" aria-label="Test speech: type what you say" />
            <button type="submit" disabled={room.sending || !said.trim()} aria-label="Send"><Icon name="send" size={20} /></button>
          </form>
        )}
        <button type="button" className="desk-hang" onClick={state.hangUp}>Hang up</button>
      </>}

      {screen === "ending" && <p className="desk-event" role="status">Hanging up…</p>}

      {screen === "retry" && <>
        {error && <p className="desk-error" role="alert">{error}</p>}
        <button type="button" className="desk-call" onClick={state.tryAgain}><Icon name="phone" />Try again</button>
        {call && !call.started && <button type="button" className="desk-chat-end" onClick={state.stop}>Stop the call</button>}
      </>}

      {screen === "after" && <>
        <p className="desk-bubble" role="status">{afterCallLine(call)}</p>
        {usage && <p className="desk-event">{used ? voiceWeekUsedLine(usage) : left}</p>}
        <button type="button" className="desk-pick" onClick={state.done}><Icon name="page" />Back to my page</button>
      </>}
    </div>
  );
}
