"use client";

// The browser side of one Maya voice call (#326), shared by the admin test call (admin-maya-voice.tsx) and the child's
// desk (desk-voice.tsx). It joins the call's LiveKit room with a ticket from the server (one room, one child), plays
// Maya's voice, receives her board over the "maya.board" RPC, and follows the worker's data messages on "maya.call".
// Audio goes from this device to LiveKit and back, never through the web server. The screens differ only in where the
// ticket comes from and what words they show, so this file holds no copy: it reports a phase and an error code.
//
// Rules kept here (R408): only the newest worker segment counts (`maya.segment`); a fatal message needs that worker's
// own segment; a room that drops keeps the recovery controls until the saved call says it ended. livekit-client loads
// only when a call connects or is prepared.
//
// The child joins the room before the Connect tap (docs/maya-voice.md): `prepare` joins with the microphone off and
// plays nothing, so Maya's voice track is already subscribed when the child taps. The tap (`connect`) then only turns
// the microphone on, starts the audio (Safari plays remote audio only inside a tap) and attaches Maya's voice. Maya's
// worker counts the child as here only when the microphone is published, so nothing of the call starts before the tap.
// A room that is not ready at the tap is left, and the tap joins in full as before.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Room as LkRoom } from "livekit-client";
import { createBoardReceiver, type BoardSnapshot } from "@/lib/board-protocol";
import { BOARD_RPC, boardRpcHandler } from "@/lib/board-rpc";
import type { VoiceTicket } from "@/lib/maya-voice";
import { addHeard, childTranscription, clearHeard, heardFinals, heardSegment, heardText, TRANSCRIPTION_TOPIC, type HeardSegment } from "@/lib/maya-voice-hearing";

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

/**
 * How long a room joined before the Connect tap waits for the tap (ms). Shorter than the worker's wait for the
 * microphone (MIC_WAIT_MS in src/lib/maya-voice.ts, the ticket's life), so the screen leaves first and the worker never
 * waits for a room the screen still holds. A tap after it joins in full, with a new ticket.
 */
export const PREJOIN_LIFE_MS = 4.5 * 60_000;

const MIC_OPTIONS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

type LiveKit = typeof import("livekit-client");
/** A room with every handler on it. `use` makes it the call's room; until then its handlers do nothing. */
interface BuiltRoom { room: LkRoom; use(): void; readMaya(): void; watchJoin(): void }
/** A room joined before the Connect tap: `ready` once it is connected (the microphone off, nothing played). */
interface Prepared { built: BuiltRoom | null; ready: boolean; timer: ReturnType<typeof setTimeout> | null }

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
 * One call's room. `prepare` joins before the Connect tap, with the microphone off and no sound (optional; `leave`
 * leaves that room); `connect` is the tap: it uses the prepared room when it is ready, else it joins in full (the caller
 * releases its microphone check first); `hangUp` asks Maya's worker to end the call, then leaves; `say` sends typed
 * words to a worker that runs fake speech-to-text. The hook always uses the newest callbacks, so a screen may pass
 * inline functions.
 */
export function useMayaVoiceRoom(options: MayaVoiceRoomOptions) {
  const { callId } = options;
  const [phase, setPhase] = useState<CallPhase>("ready");
  const [maya, setMaya] = useState<MayaState>(null);
  const [error, setError] = useState<VoiceErrorCode | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [fakeSpeech, setFakeSpeech] = useState(false);
  const [sending, setSending] = useState(false);
  // The child's words as Maya hears them (src/lib/maya-voice-hearing.ts): on this screen only, never saved, and cleared
  // when the saved call is read again after Maya's turn.
  const [heard, setHeard] = useState<HeardSegment[]>([]);
  const heardLine = useRef<HeardSegment[]>([]);
  const setLine = useCallback((line: HeardSegment[]) => { heardLine.current = line; setHeard(line); }, []);
  const room = useRef<LkRoom | null>(null);
  const latest = useRef(options);
  useEffect(() => { latest.current = options; });
  const endNotification = useRef<{ room: LkRoom; notify(): Promise<void> } | null>(null);
  const agent = useRef<string | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  /** Put this on a hidden div: Maya's voice plays from audio elements kept in it. */
  const audioHost = useCallback((el: HTMLDivElement | null) => { host.current = el; }, []);
  const liveSince = useRef<number | null>(null);
  /** The room joined before the Connect tap, while it waits for the tap. Never the call's room (`room`) at once. */
  const prepared = useRef<Prepared | null>(null);

  /** Leaves the room joined before the Connect tap, if there is one: the call was cancelled or the screen closed. */
  const leave = useCallback(() => {
    const p = prepared.current;
    prepared.current = null;
    if (p?.timer) clearTimeout(p.timer);
    void p?.built?.room.disconnect();
  }, []);

  // The live timer.
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSeconds(liveSince.current ? Math.floor((Date.now() - liveSince.current) / 1000) : 0), 500);
    return () => clearInterval(t);
  }, [phase]);

  // Leaving the page hangs up, and leaves a room joined before the tap.
  useEffect(() => () => {
    void room.current?.disconnect();
    leave();
  }, [leave]);

  // While live, read the call now and then too, in case a data message was missed.
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => void latest.current.onUpdate(), 8000);
    return () => clearInterval(t);
  }, [phase]);

  /**
   * A new room with every handler on it. The handlers act only while it is the call's room (`room.current`), so a room
   * joined before the Connect tap shows nothing, plays nothing and answers no board request until `use`.
   */
  const build = useCallback(({ Room, RoomEvent, Track, ParticipantKind }: LiveKit): BuiltRoom => {
    const onUpdate = () => latest.current.onUpdate();
    const onEnded = () => latest.current.onEnded();
    const r = new Room({ adaptiveStream: false, dynacast: false });
    let terminal = false;
    let newestSegment = -1;
    let notification: Promise<void> | null = null;
    const refreshEnded = () => notification ??= Promise.resolve().then(onEnded);
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
    // The child's words as LiveKit's worker hears them, interim and final, from this device's microphone only.
    r.registerTextStreamHandler(TRANSCRIPTION_TOPIC, (reader, from) => {
      void (async () => {
        if (room.current !== r || terminal) return;
        const microphone = r.localParticipant.getTrackPublication(Track.Source.Microphone)?.trackSid ?? null;
        const attributes = reader.info.attributes;
        if (!childTranscription({ identity: from.identity, attributes, child: r.localParticipant.identity, maya: agent.current, microphone })) return;
        let text = "";
        try { text = await reader.readAll(); } catch { return; }
        const segment = heardSegment(attributes, text);
        if (segment && room.current === r && !terminal) setLine(addHeard(heardLine.current, segment));
      })();
    });
    // Maya's voice plays only in the call's room: a room joined before the tap keeps her track subscribed, not attached.
    r.on(RoomEvent.TrackSubscribed, (track) => {
      if (room.current !== r || track.kind !== Track.Kind.Audio) return;
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
        setLine([]);
        setError(null);
        setPhase("ended");
        void r.disconnect();
        refreshEnded();
      } else {
        // A saved turn: once the screen has read it, its final words are in the transcript, so the heard line drops
        // them. Words heard after this message stay.
        const saved = heardFinals(heardLine.current);
        void onUpdate().then(() => { if (room.current === r) setLine(clearHeard(heardLine.current, saved)); }, () => {});
      }
    });
    r.on(RoomEvent.Disconnected, () => {
      // A room joined before the tap that drops is forgotten: the tap joins in full.
      const early = prepared.current;
      if (early?.built?.room === r) {
        if (early.timer) clearTimeout(early.timer);
        prepared.current = null;
      }
      if (room.current !== r) return;
      room.current = null;
      agent.current = null;
      liveSince.current = null;
      setMaya(null);
      setLine([]);
      if (terminal) return;
      // A room event cannot establish the saved call's outcome.
      setPhase("failed");
      setError((current) => current ?? "disconnected");
      refreshEnded();
    });
    return {
      room: r,
      use() {
        room.current = r;
        endNotification.current = { room: r, notify: refreshEnded };
        changed(true);
        // Maya's voice tracks the room subscribed before the tap.
        for (const p of r.remoteParticipants.values()) {
          for (const publication of p.audioTrackPublications?.values() ?? []) {
            if (publication.track) host.current?.appendChild(publication.track.attach());
          }
        }
      },
      readMaya,
      watchJoin() {
        setTimeout(() => {
          if (liveSince.current === null && room.current === r) {
            setError("no_maya");
            setPhase("failed");
            void r.disconnect();
            room.current = null;
          }
        }, MAYA_JOIN_MS);
      },
    };
  }, [callId, setLine]);

  /**
   * Joins the call's room before the Connect tap, with the microphone off and no sound: Maya's voice track is then
   * subscribed when the child taps (the opening's speed, Savar 2026-11-13). The screen shows nothing of it: the phase
   * stays as it is. Does nothing while a call's room or a prepared room exists. The room is left after PREJOIN_LIFE_MS,
   * by `leave`, when it drops, and when the screen closes; a failure leaves nothing behind. The tap then joins in full.
   */
  const prepare = useCallback(async () => {
    if (room.current || prepared.current) return;
    const mine: Prepared = { built: null, ready: false, timer: null };
    prepared.current = mine;
    const gone = () => prepared.current !== mine;
    try {
      const ticket = await latest.current.getTicket();
      if (gone()) return;
      const built = build(await import("livekit-client"));
      if (gone()) return;
      mine.built = built;
      // No `prepareConnection` first: it only warms the same connection that `connect` opens at once.
      await built.room.connect(ticket.url, ticket.token);
      if (gone()) return void built.room.disconnect();
      mine.ready = true;
      mine.timer = setTimeout(() => { if (!gone()) leave(); }, PREJOIN_LIFE_MS);
    } catch {
      if (!gone()) prepared.current = null;
      void mine.built?.room.disconnect();
    }
  }, [build, leave]);

  const connect = useCallback(async () => {
    setError(null);
    setPhase("connecting");
    setLine([]);
    liveSince.current = null;
    agent.current = null;
    const early = prepared.current;
    prepared.current = null;
    if (early?.timer) clearTimeout(early.timer);
    if (early?.ready && early.built) {
      // The room is joined: the tap only turns the microphone on and starts the audio, with no wait before the audio
      // starts (Safari plays remote audio only inside a tap).
      const b = early.built;
      try {
        b.use();
        // Maya is known before the microphone goes on: her worker connects her board as soon as it hears the child.
        b.readMaya();
        const audio = b.room.startAudio();
        audio.catch(() => {});
        await b.room.localParticipant.setMicrophoneEnabled(true, MIC_OPTIONS);
        await audio;
        setPhase((c) => (c === "connecting" ? "waiting" : c));
        b.readMaya();
        b.watchJoin();
      } catch (e) {
        setError(e instanceof Error ? e.message || "failed" : "failed");
        setPhase("failed");
        void room.current?.disconnect();
        room.current = null;
      }
      return;
    }
    // Not prepared, or not joined yet: leave that room and join in full, as before.
    void early?.built?.room.disconnect();
    try {
      const ticket = await latest.current.getTicket();
      const b = build(await import("livekit-client"));
      b.use();
      await b.room.connect(ticket.url, ticket.token);
      await b.room.localParticipant.setMicrophoneEnabled(true, MIC_OPTIONS);
      // Safari plays remote audio only after a tap: this runs inside the Connect tap.
      await b.room.startAudio();
      setPhase((c) => (c === "connecting" ? "waiting" : c));
      b.readMaya();
      b.watchJoin();
    } catch (e) {
      setError(e instanceof Error ? e.message || "failed" : "failed");
      setPhase("failed");
      void room.current?.disconnect();
      room.current = null;
    }
  }, [build, setLine]);

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

  /** The child's words Maya is hearing now, for the child's last bubble in light text; null when there are none. */
  const hearing = heardText(heard);
  return { phase, maya, error, seconds, fakeSpeech, sending, hearing, audioHost, prepare, leave, connect, hangUp, say };
}
