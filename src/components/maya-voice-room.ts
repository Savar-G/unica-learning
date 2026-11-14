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
// A room still joining at the tap is taken as it is: the tap waits for that join (at most PREJOIN_WAIT_MS) instead of
// asking for a second ticket and a second room. Only a join that failed, timed out, dropped or belongs to another call
// id is left, and the tap then joins in full as before. Browser marks of the start: src/lib/maya-voice-start-trace.ts.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Room as LkRoom } from "livekit-client";
import { createBoardReceiver, type BoardSnapshot } from "@/lib/board-protocol";
import { BOARD_RPC, boardRpcHandler } from "@/lib/board-rpc";
import type { VoiceTicket } from "@/lib/maya-voice";
import { newAttemptId, voiceStartTrace, type PrejoinDropReason, type PrejoinReason, type PrejoinStage, type VoiceStartDetail, type VoiceStartEvent, type VoiceTapLabel } from "@/lib/maya-voice-start-trace";
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

/**
 * The longest the tap waits for a join before the tap that is still under way (ms). After it, that join is left and the
 * tap joins in full. Network trouble can still make either join fail; this only bounds the wait on the first.
 */
export const PREJOIN_WAIT_MS = 10_000;

const MIC_OPTIONS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

type LiveKit = typeof import("livekit-client");
/** A room with every handler on it. `use` makes it the call's room; until then its handlers do nothing. */
interface BuiltRoom { room: LkRoom; use(): void; readMaya(): void; watchJoin(): void; closed(): boolean }
/**
 * A room joined before the Connect tap, for one call id. `stage` is how far the join is; `state` is who owns it: the
 * join itself (`pending`, then `ready`), the tap (`claimed`: the join goes on and hands its room to the tap), or nobody
 * (`dropped`: the join leaves its room when it ends). `settled` gives the joined room, or null when the join failed or
 * was dropped.
 */
interface Prepared {
  callId: string;
  attempt: string;
  built: BuiltRoom | null;
  stage: Exclude<PrejoinStage, "none">;
  state: "pending" | "ready" | "claimed" | "dropped";
  timer: ReturnType<typeof setTimeout> | null;
  settled: Promise<BuiltRoom | null>;
}

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
  /** The call id of the call's room (`room`). */
  const roomCall = useRef<string | null>(null);
  /** Each tap, hang-up and close takes a new number: a tap still waiting when the number changed does nothing. */
  const turn = useRef(0);
  const tapping = useRef<{ callId: string; turn: number; done: Promise<void> } | null>(null);
  const claimed = useRef<Prepared | null>(null);
  const previousCall = useRef(callId);
  /** The connection attempt of the call's room, for the marks. */
  const roomAttempt = useRef<string | null>(null);
  const mark = useCallback((attempt: string | null, event: VoiceStartEvent, detail?: VoiceStartDetail) => {
    try { voiceStartTrace().mark(callId, attempt, event, detail); } catch {}
  }, [callId]);

  /** Drops a room joined before the tap: its join leaves the room when it ends, and a joined room is left now. */
  const dropPrepared = useCallback((p: Prepared, drop: PrejoinDropReason) => {
    if (prepared.current === p) prepared.current = null;
    if (p.state === "dropped") return;
    p.state = "dropped";
    if (p.timer) clearTimeout(p.timer);
    try { voiceStartTrace().mark(p.callId, p.attempt, "prepare_dropped", { drop }); } catch {}
    void p.built?.room.disconnect();
  }, []);

  const invalidate = useCallback(() => {
    turn.current++;
    tapping.current = null;
    const p = claimed.current;
    claimed.current = null;
    if (p) dropPrepared(p, "abandoned");
  }, [dropPrepared]);

  /** Leaves the room joined before the Connect tap, if there is one: the call was cancelled or the screen closed. */
  const leave = useCallback(() => {
    const p = prepared.current;
    if (p) dropPrepared(p, "left");
  }, [dropPrepared]);

  // The live timer.
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSeconds(liveSince.current ? Math.floor((Date.now() - liveSince.current) / 1000) : 0), 500);
    return () => clearInterval(t);
  }, [phase]);

  // Leaving the page hangs up, and leaves a room joined before the tap. A tap still waiting for its join stops.
  useEffect(() => () => {
    invalidate();
    void room.current?.disconnect();
    leave();
  }, [leave, invalidate]);

  // Another call id (the desk's next call): the room of the call before is left, so it never stays joined with its
  // microphone on, and never stops the next call's room from joining before the tap. A room the call before still holds
  // is one whose worker left without its end message (the screen keeps a dropped room for its recovery controls).
  useEffect(() => {
    if (previousCall.current === callId) return;
    previousCall.current = callId;
    invalidate();
    const early = prepared.current;
    if (early && early.callId !== callId) dropPrepared(early, "other_call");
    const r = room.current;
    if (!r || roomCall.current === callId) return;
    room.current = null;
    roomCall.current = null;
    agent.current = null;
    liveSince.current = null;
    void r.disconnect();
  }, [callId, invalidate, dropPrepared]);

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
  const build = useCallback(({ Room, RoomEvent, Track, ParticipantKind }: LiveKit, attempt: string): BuiltRoom => {
    const onUpdate = () => latest.current.onUpdate();
    const onEnded = () => latest.current.onEnded();
    const r = new Room({ adaptiveStream: false, dynacast: false });
    let terminal = false;
    let closed = false;
    let used = false;
    const once = new Set<VoiceStartEvent>();
    const markOnce = (event: VoiceStartEvent) => {
      if (once.has(event)) return;
      once.add(event);
      try { voiceStartTrace().mark(callId, attempt, event); } catch {}
    };
    /** Marks the first time an attached voice element of Maya plays. */
    const watchPlayback = (el: HTMLMediaElement) => {
      try { el.addEventListener("playing", () => { if (room.current === r) markOnce("remote_playback"); }, { once: true }); } catch {}
    };
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
      markOnce("agent_present");
      setFakeSpeech(p.attributes["maya.speech"] === "fake");
      const s = p.attributes["lk.agent.state"];
      setMaya(s === "listening" || s === "thinking" || s === "speaking" ? s : null);
      if (liveSince.current === null) {
        liveSince.current = Date.now();
        markOnce("maya_live");
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
    r.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (track.kind === Track.Kind.Audio && isMaya(participant)) markOnce("agent_track_subscribed");
      if (room.current !== r || track.kind !== Track.Kind.Audio) return;
      const el = track.attach();
      watchPlayback(el);
      host.current?.appendChild(el);
    });
    r.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
    r.on(RoomEvent.ParticipantConnected, (p) => {
      if (isMaya(p)) markOnce("agent_present");
      readMaya();
    });
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
      closed = true;
      // A room joined before the tap that drops is forgotten: the tap joins in full.
      const early = prepared.current;
      if (early?.built?.room === r) dropPrepared(early, "disconnected");
      if (room.current !== r) return;
      room.current = null;
      roomCall.current = null;
      invalidate();
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
        if (used) return;
        used = true;
        room.current = r;
        roomCall.current = callId;
        roomAttempt.current = attempt;
        endNotification.current = { room: r, notify: refreshEnded };
        changed(true);
        // Maya's voice tracks the room subscribed before the tap.
        for (const p of r.remoteParticipants.values()) {
          for (const publication of p.audioTrackPublications?.values() ?? []) {
            if (!publication.track) continue;
            const el = publication.track.attach();
            watchPlayback(el);
            host.current?.appendChild(el);
          }
        }
      },
      closed: () => closed,
      readMaya,
      watchJoin() {
        setTimeout(() => {
          if (liveSince.current === null && room.current === r) {
            setError("no_maya");
            setPhase("failed");
            void r.disconnect();
            room.current = null;
            roomCall.current = null;
          }
        }, MAYA_JOIN_MS);
      },
    };
  }, [callId, setLine, dropPrepared, invalidate]);

  /**
   * Joins the call's room before the Connect tap, with the microphone off and no sound: Maya's voice track is then
   * subscribed when the child taps (the opening's speed, Savar 2026-11-13). The screen shows nothing of it: the phase
   * stays as it is. Does nothing while a call's room of this call or a room joined before the tap exists. The room is
   * left after PREJOIN_LIFE_MS, by `leave`, when it drops, and when the screen closes; a failure leaves nothing behind.
   * A tap during the join takes it (`connect`), and the join then hands its room to the tap instead of keeping it.
   */
  const prepare = useCallback(async () => {
    if ((room.current && roomCall.current === callId) || prepared.current) return;
    let settle: (b: BuiltRoom | null) => void = () => {};
    const settled = new Promise<BuiltRoom | null>((resolve) => { settle = resolve; });
    const mine: Prepared = { callId, attempt: newAttemptId(), built: null, stage: "ticket", state: "pending", timer: null, settled };
    prepared.current = mine;
    const at = mine.attempt;
    const dropped = () => mine.state === "dropped";
    mark(at, "prepare_requested");
    let step: "ticket" | "module" | "connect" = "ticket";
    try {
      mark(at, "ticket_begin");
      const ticket = await latest.current.getTicket();
      mark(at, "ticket_end", { ok: true });
      if (dropped()) return settle(null);
      step = "module";
      mine.stage = "module";
      const lk = await import("livekit-client");
      mark(at, "module_ready");
      if (dropped()) return settle(null);
      const built = build(lk, at);
      mine.built = built;
      step = "connect";
      mine.stage = "connect";
      mark(at, "room_connect_begin");
      // No `prepareConnection` first: it only warms the same connection that `connect` opens at once.
      await built.room.connect(ticket.url, ticket.token);
      mark(at, "room_connect_end", { ok: true });
      if (dropped()) {
        void built.room.disconnect();
        return settle(null);
      }
      mine.stage = "ready";
      if (mine.state === "pending") {
        mine.state = "ready";
        mark(at, "prepare_ready");
        mine.timer = setTimeout(() => { if (prepared.current === mine) dropPrepared(mine, "expired"); }, PREJOIN_LIFE_MS);
      }
      settle(built);
    } catch {
      if (step === "ticket") mark(at, "ticket_end", { ok: false });
      else if (step === "connect") mark(at, "room_connect_end", { ok: false });
      if (prepared.current === mine) prepared.current = null;
      if (mine.state !== "dropped") {
        mine.state = "dropped";
        mark(at, "prepare_dropped", { drop: "failed" });
      }
      void mine.built?.room.disconnect();
      settle(null);
    }
  }, [build, callId, mark, dropPrepared]);

  /** Marks the named start control. The screen calls it in the tap's own handler, before any wait. */
  const markTap = useCallback((label: VoiceTapLabel, premade?: "ready" | "starting" | "none") => {
    mark(null, "tap", premade ? { label, premade } : { label });
  }, [mark]);

  /** The tap on a joined room: Maya's subscribed voice, the microphone on and the audio started. */
  const goLive = useCallback(async (b: BuiltRoom, attempt: string, audioFirst: boolean, current: () => boolean) => {
    if (!current()) { void b.room.disconnect(); return; }
    if (claimed.current?.built === b) claimed.current = null;
    b.use();
    // Maya is known before the microphone goes on: her worker connects her board as soon as it hears the child.
    b.readMaya();
    const startAudio = () => {
      mark(attempt, "start_audio_begin");
      const audio = b.room.startAudio().then(() => mark(attempt, "start_audio_end", { ok: true }), (e) => { mark(attempt, "start_audio_end", { ok: false }); throw e; });
      audio.catch(() => {});
      return audio;
    };
    // A room joined before the tap starts the audio at once, inside the tap (Safari plays remote audio only in a tap).
    const audio = audioFirst ? startAudio() : null;
    mark(attempt, "mic_begin");
    try { await b.room.localParticipant.setMicrophoneEnabled(true, MIC_OPTIONS); } catch (e) { mark(attempt, "mic_end", { ok: false }); throw e; }
    mark(attempt, "mic_end", { ok: true });
    if (!current()) { void b.room.disconnect(); return; }
    await (audio ?? startAudio());
    if (!current()) { void b.room.disconnect(); return; }
    setPhase((c) => (c === "connecting" ? "waiting" : c));
    b.readMaya();
    b.watchJoin();
  }, [mark]);

  /** One tap (`connect`) with its turn: takes the room joined before the tap, or joins in full. */
  const join = useCallback(async (mine: number) => {
    const current = () => turn.current === mine && latest.current.callId === callId;
    setError(null);
    setPhase("connecting");
    setLine([]);
    liveSince.current = null;
    agent.current = null;
    const fail = (e: unknown) => {
      if (!current()) return;
      setError(e instanceof Error ? e.message || "failed" : "failed");
      setPhase("failed");
      void room.current?.disconnect();
      room.current = null;
      roomCall.current = null;
    };
    const early = prepared.current;
    prepared.current = null;
    claimed.current = early;
    if (early?.timer) clearTimeout(early.timer);
    const stage: PrejoinStage = early ? early.stage : "none";
    let reason: PrejoinReason = "not_prepared";
    if (early && early.callId !== callId) {
      reason = "other_call";
      dropPrepared(early, "other_call");
    } else if (early && early.state === "ready" && early.built && !early.built.closed()) {
      // The room is joined: the tap only turns the microphone on and starts the audio, with no wait before the audio
      // starts (Safari plays remote audio only inside a tap).
      early.state = "claimed";
      mark(early.attempt, "prejoin_decision", { decision: "reuse_ready", reason: "ready", prejoin: stage });
      try { await goLive(early.built, early.attempt, true, current); } catch (e) { fail(e); }
      return;
    } else if (early && early.state === "pending") {
      // Still joining: the tap takes that join, with its ticket and its room, and waits for it (at most PREJOIN_WAIT_MS).
      early.state = "claimed";
      mark(early.attempt, "prejoin_decision", { decision: "reuse_pending", reason: "pending", prejoin: stage });
      let timer: ReturnType<typeof setTimeout> | null = null;
      const late = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), PREJOIN_WAIT_MS); });
      const got = await Promise.race([early.settled, late]);
      if (timer) clearTimeout(timer);
      if (!current()) {
        // Hung up or closed while waiting: that room is left, and nothing is turned on.
        dropPrepared(early, "abandoned");
        if (got && got !== "timeout") void got.room.disconnect();
        return;
      }
      if (got && got !== "timeout" && !got.closed()) {
        mark(early.attempt, "prejoin_wait_end", { ok: true });
        try { await goLive(got, early.attempt, false, current); } catch (e) { fail(e); }
        return;
      }
      mark(early.attempt, "prejoin_wait_end", { ok: false });
      reason = got === "timeout" ? "prejoin_timeout" : "prejoin_failed";
      dropPrepared(early, got === "timeout" ? "abandoned" : "failed");
    } else if (early) {
      reason = "closed";
      dropPrepared(early, "disconnected");
    }
    // Not prepared, or that join cannot be used: join in full, as before.
    const attempt = newAttemptId();
    mark(attempt, "prejoin_decision", { decision: "fresh", reason, prejoin: stage });
    let step: "ticket" | "connect" | "other" = "ticket";
    try {
      mark(attempt, "ticket_begin");
      const ticket = await latest.current.getTicket();
      mark(attempt, "ticket_end", { ok: true });
      if (!current()) return;
      step = "other";
      const lk = await import("livekit-client");
      mark(attempt, "module_ready");
      if (!current()) return;
      const b = build(lk, attempt);
      b.use();
      step = "connect";
      mark(attempt, "room_connect_begin");
      await b.room.connect(ticket.url, ticket.token);
      mark(attempt, "room_connect_end", { ok: true });
      step = "other";
      if (!current()) {
        if (room.current === b.room) { room.current = null; roomCall.current = null; }
        void b.room.disconnect();
        return;
      }
      // Safari plays remote audio only after a tap: this runs inside the Connect tap.
      await goLive(b, attempt, false, current);
    } catch (e) {
      if (step === "ticket") mark(attempt, "ticket_end", { ok: false });
      else if (step === "connect") mark(attempt, "room_connect_end", { ok: false });
      if (current()) fail(e);
    }
  }, [build, callId, dropPrepared, goLive, mark, setLine]);

  /** The tap under way, by its turn: a second tap during it joins the same one (no second ticket or room). */
  const connect = useCallback((): Promise<void> => {
    const now = tapping.current;
    if (now && now.callId === callId && now.turn === turn.current) return now.done;
    const mine = ++turn.current;
    const done = join(mine).finally(() => {
      if (tapping.current?.turn === mine) { tapping.current = null; claimed.current = null; }
    });
    tapping.current = { callId, turn: mine, done };
    return done;
  }, [join, callId]);

  const hangUp = useCallback(async () => {
    // A tap still waiting for its join stops: nothing of it turns on.
    invalidate();
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
        roomCall.current = null;
        agent.current = null;
        liveSince.current = null;
        setMaya(null);
        setPhase("failed");
        setError("disconnected");
      }
      await notify?.();
    }
  }, [invalidate]);

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
  return { phase, maya, error, seconds, fakeSpeech, sending, hearing, audioHost, prepare, leave, connect, hangUp, say, markTap };
}
