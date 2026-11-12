"use client";

// The browser side of one Maya voice call (#326), shared by the admin test call (admin-maya-voice.tsx) and the child's
// desk (desk-voice.tsx). It joins the call's LiveKit room with a ticket from the server (one room, one child), plays
// Maya's voice, receives her board over the "maya.board" RPC, and follows the worker's data messages on "maya.call".
// Audio goes from this device to LiveKit and back, never through the web server. The screens differ only in where the
// ticket comes from and what words they show, so this file holds no copy: it reports a phase and an error code.
//
// Rules kept here (R408): only the newest worker segment counts (`maya.segment`); a fatal message needs that worker's
// own segment; a room that drops keeps the recovery controls until the saved call says it ended. livekit-client loads
// only when a call connects.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Room as LkRoom } from "livekit-client";
import { createBoardReceiver, type BoardSnapshot } from "@/lib/board-protocol";
import { BOARD_RPC, boardRpcHandler } from "@/lib/board-rpc";
import type { VoiceTicket } from "@/lib/maya-voice";

export type MicState = "idle" | "asking" | "working" | "blocked" | "none" | "failed";
export type CallPhase = "ready" | "connecting" | "waiting" | "live" | "ending" | "ended" | "failed";
export type MayaState = "listening" | "thinking" | "speaking" | null;

/**
 * Codes a call reports. The caller turns a code into its own words. A code a ticket request threw (for example
 * "voice_unavailable") comes through as it is; any code a screen has no words for is a connection problem.
 */
export type VoiceErrorCode = "technical_issue" | "disconnected" | "no_maya" | "failed" | (string & {});

/** How long the screen waits for Maya to join after connecting. */
export const MAYA_JOIN_MS = 45_000;

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function micError(e: unknown): MicState {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "blocked";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "none";
  return "failed";
}

/** The microphone check: asks for the microphone and shows how loud it hears, until stopped. */
export function useMicCheck() {
  const [state, setState] = useState<MicState>("idle");
  const [level, setLevel] = useState(0);
  const stop = useRef<(() => void) | null>(null);
  // Each check and each release takes a new number. A check whose permission answer comes after a release (the child
  // tapped "Not now" or left the page) stops the tracks it got and starts nothing.
  const generation = useRef(0);

  const check = useCallback(async () => {
    stop.current?.();
    const mine = ++generation.current;
    if (!navigator.mediaDevices?.getUserMedia) return setState("failed");
    setState("asking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (mine !== generation.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
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
      if (mine === generation.current) setState(micError(e));
    }
  }, []);

  const release = useCallback(() => {
    generation.current++;
    stop.current?.();
    stop.current = null;
  }, []);
  useEffect(() => release, [release]);
  return { state, level, check, release };
}

export interface MayaVoiceRoomOptions {
  callId: string;
  /** A fresh ticket for this call. Throw `new Error(code)` to report a code. Called on every connect. */
  getTicket(): Promise<Pick<VoiceTicket, "url" | "token">>;
  /** Read the saved call again (the transcript and the call's state). */
  onUpdate(): Promise<void>;
  /** The call ended or the room dropped: read the saved call until it shows the end. */
  onEnded(): Promise<void>;
  /** Maya's board as the browser has it: every change, and whether it is the first read after a reload. */
  onBoard?(snapshot: BoardSnapshot, restored: boolean): void;
}

/**
 * One call's room. `connect` joins (the caller releases its microphone check first); `hangUp` asks Maya's worker to end
 * the call, then leaves; `say` sends typed words to a worker that runs fake speech-to-text. The hook always uses the
 * newest callbacks, so a screen may pass inline functions.
 */
export function useMayaVoiceRoom(options: MayaVoiceRoomOptions) {
  const { callId } = options;
  const [phase, setPhase] = useState<CallPhase>("ready");
  const [maya, setMaya] = useState<MayaState>(null);
  const [error, setError] = useState<VoiceErrorCode | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [fakeSpeech, setFakeSpeech] = useState(false);
  const [sending, setSending] = useState(false);
  const room = useRef<LkRoom | null>(null);
  const latest = useRef(options);
  useEffect(() => { latest.current = options; });
  const endNotification = useRef<{ room: LkRoom; notify(): Promise<void> } | null>(null);
  const agent = useRef<string | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  /** Put this on a hidden div: Maya's voice plays from audio elements kept in it. */
  const audioHost = useCallback((el: HTMLDivElement | null) => { host.current = el; }, []);
  const liveSince = useRef<number | null>(null);

  // The live timer.
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSeconds(liveSince.current ? Math.floor((Date.now() - liveSince.current) / 1000) : 0), 500);
    return () => clearInterval(t);
  }, [phase]);

  // Leaving the page hangs up.
  useEffect(() => () => void room.current?.disconnect(), []);

  // While live, read the call now and then too, in case a data message was missed.
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => void latest.current.onUpdate(), 8000);
    return () => clearInterval(t);
  }, [phase]);

  const connect = useCallback(async () => {
    setError(null);
    setPhase("connecting");
    liveSince.current = null;
    agent.current = null;
    const onUpdate = () => latest.current.onUpdate();
    const onEnded = () => latest.current.onEnded();
    try {
      const ticket = await latest.current.getTicket();
      const { Room, RoomEvent, Track, ParticipantKind } = await import("livekit-client");
      const r = new Room({ adaptiveStream: false, dynacast: false });
      room.current = r;
      let terminal = false;
      let newestSegment = -1;
      let notification: Promise<void> | null = null;
      const refreshEnded = () => notification ??= Promise.resolve().then(onEnded);
      endNotification.current = { room: r, notify: refreshEnded };
      const isMaya = (p: { kind?: unknown } | undefined) => p?.kind === ParticipantKind.AGENT;
      const segmentOf = (p: { attributes: Record<string, string> }) => {
        const raw = p.attributes["maya.segment"];
        const n = raw === undefined || raw === "" ? -1 : Number(raw);
        return Number.isSafeInteger(n) && n >= 0 ? n : -1;
      };
      const readMaya = () => {
        if (room.current !== r || terminal) return;
        const candidates = [...r.remoteParticipants.values()].filter((p) => isMaya(p) && segmentOf(p) >= newestSegment);
        const p = candidates.sort((a, b) => segmentOf(b) - segmentOf(a) || Number(b.identity === agent.current) - Number(a.identity === agent.current))[0];
        agent.current = p?.identity ?? null;
        if (!p) {
          setMaya(null);
          if (liveSince.current !== null) {
            liveSince.current = null;
            setError("disconnected");
            setPhase("failed");
            void onUpdate();
          }
          return;
        }
        newestSegment = Math.max(newestSegment, segmentOf(p));
        setFakeSpeech(p.attributes["maya.speech"] === "fake");
        const s = p.attributes["lk.agent.state"];
        setMaya(s === "listening" || s === "thinking" || s === "speaking" ? s : null);
        if (liveSince.current === null) {
          liveSince.current = Date.now();
          setError(null);
          setPhase("live");
        }
      };
      const storageKey = `unica-voice-board:${callId}`;
      let saved: { epoch?: number; snapshot?: BoardSnapshot } = {};
      try { saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}"); } catch {}
      let receiver: ReturnType<typeof createBoardReceiver>;
      try { receiver = createBoardReceiver({ sessionId: callId, epoch: saved.epoch, snapshot: saved.snapshot, clock: () => Date.now() }); }
      catch { receiver = createBoardReceiver({ sessionId: callId, clock: () => Date.now() }); }
      const changed = (restored = false) => {
        const snapshot = receiver.snapshot();
        try { sessionStorage.setItem(storageKey, JSON.stringify({ epoch: receiver.epoch(), snapshot })); } catch {}
        latest.current.onBoard?.(snapshot, restored);
      };
      const handleBoard = boardRpcHandler(receiver, { changed, allowed: identity => {
        const p = [...r.remoteParticipants.values()].find(p => p.identity === identity);
        return room.current === r && !terminal && identity === agent.current && isMaya(p) && !!p && segmentOf(p) === newestSegment;
      } });
      r.localParticipant.registerRpcMethod(BOARD_RPC, async data => handleBoard(data.callerIdentity, data.payload));
      changed(true);
      r.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        host.current?.appendChild(el);
      });
      r.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
      r.on(RoomEvent.ParticipantConnected, readMaya);
      r.on(RoomEvent.ParticipantDisconnected, readMaya);
      r.on(RoomEvent.ParticipantAttributesChanged, readMaya);
      r.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (room.current !== r || topic !== "maya.call" || !isMaya(participant) || !participant || participant.identity !== agent.current) return;
        let update: { ended?: boolean; error?: string; segment?: number } = {};
        try {
          update = JSON.parse(new TextDecoder().decode(payload));
        } catch {}
        // Fatal messages require the current worker's immutable claim, including messages delayed across replacement.
        if (segmentOf(participant) < 0 || update.segment !== segmentOf(participant)) { void onUpdate(); return; }
        if (update.error === "technical_issue") {
          setError("technical_issue");
          setPhase("failed");
          void r.disconnect();
          refreshEnded();
        } else if (update.ended) {
          terminal = true;
          setError(null);
          setPhase("ended");
          void r.disconnect();
          refreshEnded();
        } else void onUpdate();
      });
      r.on(RoomEvent.Disconnected, () => {
        if (room.current !== r) return;
        room.current = null;
        agent.current = null;
        liveSince.current = null;
        setMaya(null);
        if (terminal) return;
        // A room event cannot establish the saved call's outcome.
        setPhase("failed");
        setError((current) => current ?? "disconnected");
        refreshEnded();
      });
      await r.connect(ticket.url, ticket.token);
      await r.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      // Safari plays remote audio only after a tap: this runs inside the Connect tap.
      await r.startAudio();
      setPhase((c) => (c === "connecting" ? "waiting" : c));
      readMaya();
      setTimeout(() => {
        if (liveSince.current === null && room.current === r) {
          setError("no_maya");
          setPhase("failed");
          void r.disconnect();
          room.current = null;
        }
      }, MAYA_JOIN_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message || "failed" : "failed");
      setPhase("failed");
      void room.current?.disconnect();
      room.current = null;
    }
  }, [callId]);

  const hangUp = useCallback(async () => {
    const r = room.current;
    if (!r) return;
    const notify = endNotification.current?.room === r ? endNotification.current.notify : null;
    setPhase("ending");
    try {
      if (agent.current) await r.localParticipant.performRpc({ destinationIdentity: agent.current, method: "maya.hang_up", payload: "", responseTimeout: 5000 });
    } catch {}
    try {
      await r.disconnect();
    } finally {
      if (room.current === r) {
        room.current = null;
        agent.current = null;
        liveSince.current = null;
        setMaya(null);
        setPhase("failed");
        setError("disconnected");
      }
      await notify?.();
    }
  }, []);

  /** Typed words for a worker with fake speech-to-text. True when Maya's worker took them. */
  const say = useCallback(async (words: string): Promise<boolean> => {
    const text = words.trim();
    if (!text || !room.current || !agent.current || sending) return false;
    setSending(true);
    try {
      await room.current.localParticipant.performRpc({ destinationIdentity: agent.current, method: "maya.fake.say", payload: JSON.stringify({ text }), responseTimeout: 5000 });
      return true;
    } catch {
      setError("failed");
      return false;
    } finally {
      setSending(false);
    }
  }, [sending]);

  return { phase, maya, error, seconds, fakeSpeech, sending, audioHost, connect, hangUp, say };
}
