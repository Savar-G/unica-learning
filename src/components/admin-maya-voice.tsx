"use client";

// Maya's admin voice call (#326): the microphone check, then connect and hang up. The screen joins the call's LiveKit
// room with a short-lived token from the server (one room, this test family's child only); Maya's voice worker joins
// it too (worker/maya-voice). Audio goes from this device to LiveKit and back, never through the web server. After
// each of Maya's turns the worker says so on the "maya.call" data topic, and the screen reads the saved call again
// (the transcript and the board). With the fake speech-to-text (no account), a box takes what the child "says" as
// text and sends it to Maya over LiveKit instead of a microphone she could not understand.
//
// livekit-client loads only when the admin connects. Labels are plain: no provider errors, no ids.
import { useEffect, useState, type FormEvent } from "react";
import type { BoardSnapshot } from "@/lib/board-protocol";
import type { VoiceTicket } from "@/lib/maya-voice";
import { clock, useMayaVoiceRoom, useMicCheck, type MayaState, type MicState } from "@/components/maya-voice-room";

// The call itself (joining the room, Maya's board, recovery, the fake speech) is the shared hook in
// maya-voice-room.ts; this screen holds the admin's words and controls.

const MIC_TEXT: Record<MicState, string> = {
  idle: "Check the microphone before you connect.",
  asking: "Allow the microphone when your browser asks.",
  working: "The microphone works. Say something: the bar moves when it hears you.",
  blocked: "The browser blocked the microphone. Allow it from the address bar, then check again.",
  none: "No microphone was found. Plug one in, then check again.",
  failed: "The microphone could not start. Close other apps that use it, then check again.",
};

const ERROR_TEXT: Record<string, string> = {
  voice_unavailable: "Voice calls are not set up on this server yet.",
  ended: "This call has ended.",
  technical_issue: "The voice connection failed. Check the saved call below, or connect again.",
  disconnected: "The connection is closed. Check the saved call, or connect again.",
  connect: "Could not connect to the call. Check the internet connection and try again.",
  no_maya: "Maya did not join the call. The voice helper may be off. Try again in a minute.",
  failed: "Something went wrong. Try again.",
};

const MAYA_TEXT: Record<Exclude<MayaState, null>, string> = { listening: "Maya is listening", thinking: "Maya is thinking", speaking: "Maya is speaking" };

export function VoicePanel({ callId, childName, started, onUpdate, onEnded, onCancel, onBoard, onHearing, busy }: {
  callId: string;
  childName: string | null;
  /** The call has started (Maya joined once). */
  started: boolean;
  /** Read the saved call again. */
  onUpdate(): Promise<void>;
  onEnded(): Promise<void>;
  /** Ends a call that never started (no Maya). */
  onCancel(): void;
  onBoard?(snapshot: BoardSnapshot, restored: boolean): void;
  /** The child's words Maya is hearing now (null when none), for the transcript's last line. Never saved. */
  onHearing?(words: string | null): void;
  busy: boolean;
}) {
  const mic = useMicCheck();
  const [said, setSaid] = useState("");
  const { phase: call, maya, error: errorCode, seconds, fakeSpeech, sending, hearing, audioHost, connect: join, hangUp, say: sendSaid } = useMayaVoiceRoom({
    callId,
    async getTicket() {
      const res = await fetch(`/api/admin/maya/calls/${callId}/token`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; ticket?: VoiceTicket } | null;
      if (!body?.ok || !body.ticket) throw new Error(body?.error ?? "failed");
      return body.ticket;
    },
    onUpdate,
    onEnded,
    onBoard,
  });
  const error = errorCode ? ERROR_TEXT[errorCode] ?? ERROR_TEXT.connect : null;
  const name = childName ?? "the child";
  const live = call === "live";
  useEffect(() => { onHearing?.(live ? hearing : null); }, [onHearing, live, hearing]);
  useEffect(() => () => onHearing?.(null), [onHearing]);

  function connect() {
    mic.release();
    void join();
  }

  async function say(e: FormEvent) {
    e.preventDefault();
    if (await sendSaid(said)) setSaid("");
  }

  const connected = call === "live" || call === "waiting";
  return (
    <div className="mv" aria-label="Voice call">
      <div ref={audioHost} hidden />
      {!connected && call !== "ending" && call !== "ended" && (
        <div className="mv-mic">
          <div className="mv-mic-row">
            <span className={`mv-dot is-${mic.state === "working" ? "ok" : mic.state === "blocked" || mic.state === "none" || mic.state === "failed" ? "bad" : "idle"}`} aria-hidden="true" />
            <p className="mv-mic-text" role="status">{MIC_TEXT[mic.state]}</p>
          </div>
          {mic.state === "working" && (
            <div className="mv-meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(mic.level * 100)}>
              <span style={{ transform: `scaleX(${mic.level})` }} />
            </div>
          )}
          <div className="mv-row">
            <button type="button" className={`btn sm adm-btn ${mic.state === "working" ? "ghost" : ""}`} onClick={() => void mic.check()} disabled={mic.state === "asking"}>
              {mic.state === "working" ? "Check again" : "Check the microphone"}
            </button>
            <button type="button" className={`btn sm adm-btn ${mic.state === "working" ? "" : "ghost"}`} onClick={connect} disabled={mic.state !== "working" || call === "connecting"}>
              {call === "connecting" ? "Connecting…" : started ? "Connect again" : "Connect"}
            </button>
            {!started && (
              <button type="button" className="btn sm ghost adm-btn mv-hang" onClick={onCancel} disabled={busy || call === "connecting"}>Cancel the call</button>
            )}
          </div>
        </div>
      )}

      {connected && (
        <div className="mv-live">
          <div className="mv-live-row">
            <span className={`mv-live-chip ${call === "live" ? "is-live" : ""}`}>
              {call === "live" ? <>Live · <span className="adm-mono">{clock(seconds)}</span></> : "Waiting for Maya to join…"}
            </span>
            {maya && <span className={`mv-maya is-${maya}`} role="status">{MAYA_TEXT[maya]}</span>}
            <button type="button" className="btn sm ghost adm-btn mv-hang" onClick={() => void hangUp()}>Hang up</button>
          </div>
          {call === "live" && !fakeSpeech && <p className="mv-hint">Speak as {name}. Maya hears the microphone.</p>}
          {call === "live" && fakeSpeech && (
            <form className="mv-say" onSubmit={say}>
              <label className="mv-say-box">
                <span>Test speech: type what {name} says</span>
                <input value={said} maxLength={500} onChange={(e) => setSaid(e.target.value)} placeholder="I got 66." disabled={sending} />
              </label>
              <button type="submit" className="btn sm adm-btn" disabled={sending || !said.trim()}>Say it</button>
              <p className="mv-hint">This server&apos;s voice helper has no speech-to-text account yet, so it hears typed words instead of the microphone.</p>
            </form>
          )}
        </div>
      )}

      {call === "ending" && <p className="mv-hint" role="status">Hanging up…</p>}
      {call === "ended" && <p className="mv-hint" role="status">The call has ended. Its record is below.</p>}
      {error && <p className="mc-error" role="alert">{error}</p>}
    </div>
  );
}
