"use client";

// Maya's admin voice call (#326): the microphone check, then connect and hang up. The screen joins the call's LiveKit
// room with a short-lived token from the server (one room, this test family's child only); Maya's voice worker joins
// it too (worker/maya-voice). Audio goes from this device to LiveKit and back, never through the web server. After
// each of Maya's turns the worker says so on the "maya.call" data topic, and the screen reads the saved call again
// (the transcript and the board). With the fake speech-to-text (no account), a box takes what the child "says" as
// text and sends it to Maya over LiveKit instead of a microphone she could not understand.
//
// livekit-client loads only when the admin connects. Labels are plain: no provider errors, no ids.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Room as LkRoom } from "livekit-client";
import type { VoiceTicket } from "@/lib/maya-voice";

type MicState = "idle" | "asking" | "working" | "blocked" | "none" | "failed";
type CallState = "ready" | "connecting" | "waiting" | "live" | "ending" | "ended" | "failed";
type MayaState = "listening" | "thinking" | "speaking" | null;

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
  connect: "Could not connect to the call. Check the internet connection and try again.",
  no_maya: "Maya did not join the call. The voice helper may be off. Try again in a minute.",
  failed: "Something went wrong. Try again.",
};

const MAYA_TEXT: Record<Exclude<MayaState, null>, string> = { listening: "Maya is listening", thinking: "Maya is thinking", speaking: "Maya is speaking" };

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** How long the screen waits for Maya to join after connecting. */
const MAYA_JOIN_MS = 45_000;

function micError(e: unknown): MicState {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "blocked";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "none";
  return "failed";
}

/** The microphone check: asks for the microphone and shows how loud it hears, until stopped. */
function useMicCheck() {
  const [state, setState] = useState<MicState>("idle");
  const [level, setLevel] = useState(0);
  const stop = useRef<(() => void) | null>(null);

  const check = useCallback(async () => {
    stop.current?.();
    if (!navigator.mediaDevices?.getUserMedia) return setState("failed");
    setState("asking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const audio = new AudioContext();
      const analyser = audio.createAnalyser();
      analyser.fftSize = 512;
      audio.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let frame = 0;
      const read = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
        setLevel(Math.min(1, peak * 2.5));
        frame = requestAnimationFrame(read);
      };
      read();
      stop.current = () => {
        cancelAnimationFrame(frame);
        stream.getTracks().forEach((t) => t.stop());
        void audio.close();
        setLevel(0);
      };
      setState("working");
    } catch (e) {
      setState(micError(e));
    }
  }, []);

  const release = useCallback(() => {
    stop.current?.();
    stop.current = null;
  }, []);
  useEffect(() => release, [release]);
  return { state, level, check, release };
}

export function VoicePanel({ callId, childName, started, onUpdate, onEnded, onCancel, busy }: {
  callId: string;
  childName: string | null;
  /** The call has started (Maya joined once). */
  started: boolean;
  /** Read the saved call again. */
  onUpdate(): Promise<void>;
  onEnded(): Promise<void>;
  /** Ends a call that never started (no Maya). */
  onCancel(): void;
  busy: boolean;
}) {
  const mic = useMicCheck();
  const [call, setCall] = useState<CallState>("ready");
  const [maya, setMaya] = useState<MayaState>(null);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [fakeSpeech, setFakeSpeech] = useState(false);
  const [said, setSaid] = useState("");
  const [sending, setSending] = useState(false);
  const room = useRef<LkRoom | null>(null);
  const agent = useRef<string | null>(null);
  const audioHost = useRef<HTMLDivElement>(null);
  const liveSince = useRef<number | null>(null);
  const name = childName ?? "the child";

  // The live timer.
  useEffect(() => {
    if (call !== "live") return;
    const t = setInterval(() => setSeconds(liveSince.current ? Math.floor((Date.now() - liveSince.current) / 1000) : 0), 500);
    return () => clearInterval(t);
  }, [call]);

  // Leaving the page hangs up.
  useEffect(() => () => void room.current?.disconnect(), []);

  // While live, read the call now and then too, in case a data message was missed.
  useEffect(() => {
    if (call !== "live") return;
    const t = setInterval(() => void onUpdate(), 8000);
    return () => clearInterval(t);
  }, [call, onUpdate]);

  async function connect() {
    setError(null);
    setCall("connecting");
    mic.release();
    try {
      const res = await fetch(`/api/admin/maya/calls/${callId}/token`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; ticket?: VoiceTicket } | null;
      if (!body?.ok || !body.ticket) throw new Error(body?.error ?? "failed");
      const { Room, RoomEvent, Track, ParticipantKind } = await import("livekit-client");
      const r = new Room({ adaptiveStream: false, dynacast: false });
      room.current = r;
      const isMaya = (p: { kind?: unknown } | undefined) => p?.kind === ParticipantKind.AGENT;
      const readMaya = () => {
        const p = [...r.remoteParticipants.values()].find(isMaya);
        agent.current = p?.identity ?? null;
        if (!p) return;
        setFakeSpeech(p.attributes["maya.speech"] === "fake");
        const s = p.attributes["lk.agent.state"];
        setMaya(s === "listening" || s === "thinking" || s === "speaking" ? s : null);
        if (liveSince.current === null) {
          liveSince.current = Date.now();
          setCall("live");
        }
      };
      r.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        audioHost.current?.appendChild(el);
      });
      r.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
      r.on(RoomEvent.ParticipantConnected, readMaya);
      r.on(RoomEvent.ParticipantAttributesChanged, readMaya);
      r.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (topic !== "maya.call" || !isMaya(participant)) return;
        let update: { ended?: boolean } = {};
        try {
          update = JSON.parse(new TextDecoder().decode(payload));
        } catch {}
        if (update.ended) {
          setCall("ended");
          void r.disconnect();
          void onEnded();
        } else void onUpdate();
      });
      r.on(RoomEvent.Disconnected, () => {
        setMaya(null);
        setCall((c) => (c === "ended" || c === "ending" ? c : "ended"));
        void onEnded();
      });
      await r.connect(body.ticket.url, body.ticket.token);
      await r.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      // Safari plays remote audio only after a tap: this runs inside the Connect tap.
      await r.startAudio();
      setCall((c) => (c === "connecting" ? "waiting" : c));
      readMaya();
      setTimeout(() => {
        if (liveSince.current === null && room.current === r) {
          setError(ERROR_TEXT.no_maya);
          setCall("failed");
          void r.disconnect();
          room.current = null;
        }
      }, MAYA_JOIN_MS);
    } catch (e) {
      const code = e instanceof Error ? e.message : "failed";
      setError(ERROR_TEXT[code] ?? (code === "failed" ? ERROR_TEXT.failed : ERROR_TEXT.connect));
      setCall("failed");
      void room.current?.disconnect();
      room.current = null;
    }
  }

  async function hangUp() {
    const r = room.current;
    if (!r) return;
    setCall("ending");
    try {
      if (agent.current) await r.localParticipant.performRpc({ destinationIdentity: agent.current, method: "maya.hang_up", payload: "", responseTimeout: 5000 });
    } catch {}
    await r.disconnect();
    room.current = null;
    setCall("ended");
    await onEnded();
  }

  async function say(e: FormEvent) {
    e.preventDefault();
    const text = said.trim();
    if (!text || !room.current || !agent.current || sending) return;
    setSending(true);
    try {
      await room.current.localParticipant.performRpc({ destinationIdentity: agent.current, method: "maya.fake.say", payload: JSON.stringify({ text }), responseTimeout: 5000 });
      setSaid("");
    } catch {
      setError(ERROR_TEXT.failed);
    } finally {
      setSending(false);
    }
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
            <button type="button" className={`btn sm adm-btn ${mic.state === "working" ? "" : "ghost"}`} onClick={() => void connect()} disabled={mic.state !== "working" || call === "connecting"}>
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
