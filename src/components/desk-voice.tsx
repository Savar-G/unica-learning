"use client";
import { useCallback, useRef, useState, type FormEvent } from "react";
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

const MAYA_TEXT: Record<Exclude<MayaState, null>, string> = { listening: "Maya is listening", thinking: "Maya is thinking", speaking: "Maya is speaking" };
const EMPTY_BOARD = { steps: [] as PlayStep[], viewBox: "0 0 1000 1000" };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type VoiceRequest =
  | { type: "start"; id: string; question: { source: "workbook"; workbookId: string; page: number; question: number } }
  | { type: "token" | "read" | "cancel"; id: string };

/** One request to the desk's voice route. Null when the server cannot be reached or does not answer in JSON. */
async function post(body: VoiceRequest): Promise<DeskVoiceReply | null> {
  try {
    const res = await fetch("/api/desk/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
  const ticket = useRef<VoiceTicket | null>(null);
  const live = useRef({ id: "", hungUp: false });
  const drawn = useRef(-1);

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

  const forget = () => {
    live.current = { id: "", hungUp: false };
    drawn.current = -1;
    ticket.current = null;
    setHungUp(false);
    setCall(null);
    setBoard(EMPTY_BOARD);
    setShown(0);
    setBase(null);
  };

  /** Opens the microphone check. `before` runs first (the desk ends an open chat); false from it stops here. */
  const open = async (before?: () => Promise<boolean>) => {
    if (!initial || flow !== "idle" || at.question === null || voiceWeekUsed(usage)) return;
    if (before && !(await before())) return;
    forget();
    const id = crypto.randomUUID();
    live.current.id = id;
    setCallId(id);
    setStartError(null);
    setFlow("mic");
    void mic.check();
  };

  const closeMic = () => {
    mic.release();
    live.current.id = "";
    setFlow("idle");
  };

  /** The microphone works: the server starts the call, then the room joins with the ticket it gave. */
  const begin = async () => {
    if (flow !== "mic" || mic.state !== "working" || at.question === null) return;
    const id = callId;
    setBase(usage);
    setFlow("starting");
    mic.release();
    const r = await post({ type: "start", id, question: { source: "workbook", workbookId: at.book, page: at.page, question: at.question } });
    if (live.current.id !== id) return;
    if (!r?.call || !r.ticket) {
      // No answer: the call may exist on the server, so ask it to end.
      if (!r) void post({ type: "cancel", id });
      if (r?.usage) setUsage(r.usage);
      setStartError(startErrorLine(r?.error, r?.usage ?? usage));
      live.current.id = "";
      setFlow("idle");
      return;
    }
    if (r.usage) setUsage(r.usage);
    ticket.current = r.ticket;
    setCall(r.call);
    setFlow("call");
    void room.connect();
  };

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
    forget();
    setFlow("idle");
  };

  const counting = base !== null && (flow === "starting" || flow === "call" || (flow === "after" && call?.ended !== true));
  /** Seconds of the week left now, while this call runs (null when no call runs: then `usage` holds the week). */
  const liveLeft = counting && base ? leftWhileLive(base, room.seconds) : null;
  const screen = voiceScreen({ flow, phase: room.phase, callEnded: call?.ended === true, hungUp, error: room.error });
  return {
    enabled: initial !== null, usage, liveLeft, flow, screen, call, mic, room: { phase: room.phase, maya: room.maya, error: room.error, seconds: room.seconds, fakeSpeech: room.fakeSpeech, sending: room.sending, say: room.say },
    audioHost: room.audioHost, startError, board, shown,
    /** A call is under way or just ended: the desk's own controls give way to the call's. */
    engaged: flow !== "idle",
    /** Maya's board shows for the call and until the child is back on the page. */
    showBoard: flow === "call" || flow === "after",
    picked: at.question !== null,
    open, closeMic, begin, hangUp, tryAgain, stop, done,
  };
}
export type DeskVoiceState = ReturnType<typeof useDeskVoice>;

/** The Calls limit in the desk header: the minutes left this week, or that the week is used. */
export function VoiceLimit({ state }: { state: DeskVoiceState }) {
  if (!state.enabled || !state.usage) return null;
  return <div><dt><Icon name="phone" size={14} />Calls</dt><dd>{voiceLeftLine(state.liveLeft ?? state.usage.leftSeconds) ?? "Used this week"}</dd></div>;
}

/** The call's talk, as chat shows it: Maya's lines and the child's, in order. */
export function VoiceTranscript({ state }: { state: DeskVoiceState }) {
  const { call } = state;
  if (!call) return null;
  return <>{call.transcript.map((line, i) => (
    <p key={`${call.id}-${i}`} className={`desk-bubble${line.speaker === "child" ? " desk-child-bubble" : ""}`}>
      <span className="sr-only">{line.speaker === "child" ? "You" : "Maya"}: </span>{line.text}
    </p>
  ))}</>;
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
  const used = voiceWeekUsed(usage);
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
          <button type="button" className="desk-chat-end" disabled={mic.state === "asking"} onClick={() => void mic.check()}>Check again</button>
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
        {usage && <p className="desk-event">{used ? voiceWeekUsedLine(usage) : voiceLeftLine(usage.leftSeconds)}</p>}
        <button type="button" className="desk-pick" onClick={state.done}><Icon name="page" />Back to my page</button>
      </>}
    </div>
  );
}
