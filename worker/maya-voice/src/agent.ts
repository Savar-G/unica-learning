// Maya in a voice call (#326): LiveKit Agents for Node around Maya's controller, through the text adapter. The voice
// agent is a thin layer: speech-to-text turns the child's speech into child turns for the call (src/lib/maya-call.ts,
// `openVoice`), and the voice says exactly the words the call's session accepted. LiveKit never asks a model itself:
// the agent's `llmNode` hands each finished turn to the call and returns only what it said (as the text mode does,
// src/lib/maya-livekit-text.ts). The placeholder LLM below exists because AgentSession wants one, and is never asked.
//
// A child's turn does not hold the speech back (#532): `llmNode` returns its stream at once, so a turn that is not ready
// within the limit can say a code-written acknowledgement first (src/lib/maya-voice-ack.ts), as a segment of its own with
// an empty board plan. The answer's board is staged only after that segment has played. A child who talks cancels it.
// VoiceCallRun also measures each child turn (./turn-timing.ts).
//
// VoiceCallRun owns the call's life around the speech: the opening when the child is there, the ticks the session asks
// for silence (counted from the end of speech), an independent deadline, the connection leases, the
// hang-up, a dropped connection (the call ends if the child is not back within RECONNECT_GRACE_MS), and the end. It
// takes its clock and timers, so a test drives it without waiting.
import { ReadableStream, TransformStream } from "node:stream/web";
import { FlushSentinel, stt, voice, type llm, type tts } from "@livekit/agents";
import type { AudioFrame } from "@livekit/rtc-node";
import type { FinishOptions } from "@/lib/maya-text";
import type { VoiceCall, VoiceTurn } from "@/lib/maya-call";
import type { BoardSpeech, SpeechScope } from "@/lib/board-speech";
import { CuePlaybackOutput } from "./cue-playback";
import { boardAudio } from "./speech-audio";
import { limitsOf } from "@/lib/maya";
import { CONNECTION_RENEW_MS, childTurnFrom, nextTickAt, RECONNECT_GRACE_MS, type Heard } from "@/lib/maya-voice";
import { ACK_HOLD_LIMIT_MS, ACK_LIMIT_MS, nextAcknowledgement } from "@/lib/maya-voice-ack";
import { TurnClock, type AckSkip, type TurnOutcome, type VoiceTurnSample } from "./turn-timing";

const userTexts = (ctx: llm.ChatContext) =>
  ctx.items.flatMap((i) => (i.type === "message" && i.role === "user" ? [i.textContent ?? ""] : []));
/** When the child stopped speaking by LiveKit's turn metrics (seconds, on the system clock), if it knows. */
const stoppedSpeakingAt = (ctx: llm.ChatContext) => {
  const last = ctx.items.findLast((i) => i.type === "message" && i.role === "user");
  return last?.type === "message" ? last.metrics?.stoppedSpeakingAt : undefined;
};

/**
 * A session for a voice call: LiveKit's pipeline with Maya's agent. `fake` turns off voice activity detection. `tuning`
 * is for tests (shorter endpointing, no echo warm-up).
 */
export function voiceSession(providers: { stt: stt.STT; tts: tts.TTS; fake: boolean }, tuning: { endpointingMs?: number; aecWarmupDuration?: number } = {}) {
  return new voice.AgentSession({
    stt: providers.stt,
    tts: providers.tts,
    // Never asked: MayaVoiceAgent.llmNode answers every turn.
    llm: new voice.testing.FakeLLM([]),
    // The fakes need no voice activity detection; the real speech-to-text gets LiveKit's local Silero model.
    ...(providers.fake ? { vad: null } : {}),
    // The speech-to-text says when the child's turn ends (AssemblyAI's end of turn; the fake's end of speech).
    turnHandling: {
      turnDetection: "stt",
      preemptiveGeneration: { enabled: false },
      ...(tuning.endpointingMs !== undefined ? { endpointing: { minDelay: tuning.endpointingMs, maxDelay: tuning.endpointingMs } } : {}),
    },
    ...(tuning.aecWarmupDuration !== undefined ? { aecWarmupDuration: tuning.aecWarmupDuration } : {}),
    // The session's own pause policy (src/lib/maya) decides about silence, not LiveKit's away timer.
    userAwayTimeout: null,
  });
}

export class MayaVoiceAgent extends voice.Agent {
  private seen = 0;
  private opened = false;
  private finals: Heard[][] = [];
  constructor(
    private readonly call: VoiceCall,
    private readonly onTurn: (turn: VoiceTurn) => Promise<boolean>,
    private readonly board: { sync: BoardSpeech; scope(): SpeechScope | null } | undefined,
    private readonly reply: (stoppedAt: number | undefined, work: () => Promise<VoiceTurn[]>) => ReadableStream<string | FlushSentinel>,
  ) {
    super({ instructions: "Maya's words come from her session through the text adapter, not from these instructions." });
  }

  /** The speech-to-text as LiveKit runs it, keeping each final transcript's confidence and alternatives. */
  override async sttNode(audio: ReadableStream<AudioFrame> | AsyncIterable<AudioFrame>, settings: voice.ModelSettings) {
    const stream = await voice.Agent.default.sttNode(this, audio, settings);
    if (!stream) return null;
    const finals = this.finals;
    return stream.pipeThrough(
      new TransformStream<stt.SpeechEvent | string, stt.SpeechEvent | string>({
        transform(event, controller) {
          if (typeof event !== "string" && event.type === stt.SpeechEventType.FINAL_TRANSCRIPT && event.alternatives) {
            finals.push(event.alternatives.map((a) => ({ text: a.text, confidence: a.confidence })));
          }
          controller.enqueue(event);
        },
      }),
    );
  }

  override async ttsNode(text: ReadableStream<string> | AsyncIterable<string>, settings: voice.ModelSettings) {
    if (!this.board) return voice.Agent.default.ttsNode(this, text, settings);
    const scope = this.board.scope();
    if (!scope || !this.board.sync.owns(scope)) return null;
    return boardAudio(text, input => voice.Agent.default.ttsNode(this, input, settings), this.board.sync, scope);
  }

  /** Opens the call (the first reply), then answers each finished child turn with what the call's session said. */
  override async llmNode(...[chatCtx]: Parameters<voice.Agent["llmNode"]>): ReturnType<voice.Agent["llmNode"]> {
    const users = userTexts(chatCtx);
    const fresh = users.slice(this.seen).filter((t) => t.trim());
    this.seen = users.length;
    const opening = !this.opened;
    this.opened = true;
    if (fresh.length > 0) {
      const heard = childTurnFrom(this.finals.splice(0)) ?? { text: fresh.join(" "), uncertain: false, alternatives: [] };
      return this.reply(stoppedSpeakingAt(chatCtx), async () => [
        ...(opening ? [await this.call.start()] : []),
        await this.call.child(heard.text, heard.uncertain ? { uncertain: true, alternatives: heard.alternatives } : undefined),
      ]);
    }
    if (!opening) return null;
    const turn = await this.call.start();
    const text = (await this.onTurn(turn)) ? turn.say.join(" ") : "";
    if (!text) return null;
    return new ReadableStream<string>({
      start(controller) {
        controller.enqueue(text);
        controller.close();
      },
    });
  }
}

/** What the child's screen is told: the call changed (read it again), or it ended. */
export interface CallUpdate {
  revision: number;
  segment: number;
  ended: boolean;
  error?: "technical_issue";
}

export interface Timers {
  now(): number;
  set(ms: number, run: () => void): unknown;
  clear(handle: unknown): void;
}

export const realTimers: Timers = { now: () => Date.now(), set: (ms, run) => setTimeout(run, Math.max(0, ms)), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/** One child turn on its way to the child: its marks, and the acknowledgement that may come before the answer. */
interface TurnPace {
  clock: TurnClock;
  generation: number;
  /** The reply's stream can still take words. */
  writable: boolean;
  /** The controller's turn is done, so no acknowledgement starts now. */
  ready: boolean;
  closed: boolean;
  /** This reply's speech. LiveKit stops reading the stream when it is interrupted, and does not cancel it. */
  handle: voice.SpeechHandle | null;
  limit: unknown;
  hold: unknown;
  ack: Promise<void> | null;
  ackOver: (() => void) | null;
  write(chunk: string | FlushSentinel): void;
}

export class VoiceCallRun {
  private lastTickAt: number | null = null;
  private speechEndedAt: number | null = null;
  private tickTimer: unknown = null;
  private graceTimer: unknown = null;
  private limitTimer: unknown = null;
  private leaseTimer: unknown = null;
  private finishing: Promise<void> | null = null;
  private childHere = false;
  private generation = 0;
  private speech: voice.SpeechHandle | null = null;
  private replayingFinal = false;
  private utterance = 0;
  private boardScope: SpeechScope | null = null;
  private boardAudio: CuePlaybackOutput | null = null;
  private childStoppedAt: number | null = null;
  private pace: TurnPace | null = null;
  readonly agent: MayaVoiceAgent;
  /** Immutable revision claimed when this worker opened the call. */
  readonly segment: number;

  constructor(
    private readonly session: voice.AgentSession,
    private readonly call: VoiceCall,
    private readonly options: {
      timers?: Timers;
      board?: BoardSpeech;
      notify(update: CallUpdate): void;
      closed?(): Promise<void>;
      /** The child's end of speech to the acknowledgement. Default ACK_LIMIT_MS; 0 turns it off. */
      ackLimitMs?: number;
      /** One sample per child turn (./turn-timing.ts). */
      measureTurn?(sample: VoiceTurnSample): void;
    },
  ) {
    this.segment = call.revision;
    this.agent = new MayaVoiceAgent(call, turn => this.after(turn), options.board ? { sync: options.board, scope: () => this.boardScope } : undefined,
      (stoppedAt, work) => this.reply(stoppedAt, work));
    session.on(voice.AgentSessionEventTypes.UserStateChanged, ev => {
      if (ev.newState === "speaking") {
        if (this.pace) this.cutAck(this.pace);
        if (this.boardScope) this.stopBoard(this.boardScope);
      } else if (ev.oldState === "speaking") this.childStoppedAt = this.timers.now();
    });
    session.on(voice.AgentSessionEventTypes.SpeechCreated, ev => { this.speech = ev.speechHandle; });
    session.on(voice.AgentSessionEventTypes.Close, () => { void this.finish({ detail: "the voice session closed unexpectedly" }); });
    session.on(voice.AgentSessionEventTypes.Error, ev => {
      if (!ev.error.recoverable) void this.finish({ detail: "the voice provider failed" });
    });
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, ev => {
      if (ev.oldState === "speaking" && ev.newState !== "speaking") {
        this.speechEndedAt = this.timers.now();
        this.schedule();
      }
    });
  }

  /** Attach after AgentSession.start, so these are the room's actual audio output events. */
  attachBoardAudio() {
    const audio = this.session.output.audio;
    if (!audio || !this.options.board) return;
    this.boardAudio = new CuePlaybackOutput(audio, this.options.board, this.timers,
      (work, scope) => this.boardTask(work, scope), scope => this.stopBoard(scope));
    this.session.output.audio = this.boardAudio.audio;
  }

  /** Attach after attachBoardAudio, so these are the events of the output LiveKit actually plays through. */
  attachTurnTiming() {
    const audio = this.session.output.audio;
    audio?.on(voice.AudioOutput.EVENT_PLAYBACK_STARTED, () => {
      if (this.pace?.clock.sound() === "answer") this.closeTurn(this.pace, "answered");
    });
    audio?.on(voice.AudioOutput.EVENT_PLAYBACK_FINISHED, () => {
      if (this.pace?.clock.ackHeard) this.cutAck(this.pace);
    });
  }

  /** The stream of a child turn's reply. It is returned at once: the turn runs behind it. */
  private reply(stoppedAt: number | undefined, work: () => Promise<VoiceTurn[]>) {
    this.closeTurn();
    const heardAt = this.timers.now();
    // LiveKit's mark is on the system clock, and can be earlier than its user state change. Keep only how long ago it was.
    const speechEndedAt = stoppedAt === undefined ? this.childStoppedAt ?? heardAt : heardAt - Math.max(0, Date.now() - stoppedAt * 1000);
    const pace: TurnPace = {
      clock: new TurnClock(this.timers.now, speechEndedAt, heardAt), generation: this.generation,
      writable: true, ready: false, closed: false, handle: this.speech, limit: null, hold: null, ack: null, ackOver: null, write: () => {},
    };
    this.pace = pace;
    return new ReadableStream<string | FlushSentinel>({
      start: controller => {
        pace.write = chunk => { if (pace.writable) controller.enqueue(chunk); };
        this.runTurn(pace, speechEndedAt, work).then(
          () => { if (pace.writable) { pace.writable = false; controller.close(); } },
          error => { this.closeTurn(pace); if (pace.writable) { pace.writable = false; controller.error(error); } },
        );
      },
      cancel: () => {
        pace.writable = false;
        this.cutAck(pace);
        this.closeTurn(pace);
      },
    });
  }

  private async runTurn(pace: TurnPace, speechEndedAt: number, work: () => Promise<VoiceTurn[]>) {
    const limit = this.options.ackLimitMs ?? ACK_LIMIT_MS;
    if (limit > 0) {
      pace.limit = this.timers.set(speechEndedAt + limit - this.timers.now(), () => {
        pace.limit = null;
        pace.ack = this.acknowledge(pace);
      });
    }
    let turns: VoiceTurn[];
    try { turns = await work(); }
    finally {
      pace.ready = true;
      this.clearLimit(pace);
    }
    pace.clock.ready({
      modelMs: turns.reduce((sum, t) => sum + (t.time?.modelMs ?? 0), 0),
      repairMs: turns.reduce((sum, t) => sum + (t.time?.repairMs ?? 0), 0),
      reviewMs: turns.reduce((sum, t) => sum + (t.time?.reviewMs ?? 0), 0),
    });
    // A new plan takes the audio from the old one, so the answer's board waits until the acknowledgement has played.
    if (pace.ack) await pace.ack;
    pace.clock.held();
    const said: string[] = [];
    // A dropped turn must not stage: its speech cannot play, and its plan would take the board from the turn that
    // replaced it. It keeps the rest of `after` (the revision, the check-ins, the call's end).
    for (const turn of turns) if (await this.after(turn, undefined, () => this.ownsReply(pace))) said.push(...turn.say);
    pace.clock.staged();
    const text = said.join(" ");
    if (!text || !this.ownsReply(pace)) return this.closeTurn(pace, this.ownsReply(pace) ? "no_words" : "interrupted");
    pace.write(text);
  }

  /** No newer turn replaced this one, and its speech can still play. */
  private ownsReply(pace: TurnPace) { return this.pace === pace && pace.writable && !pace.handle?.interrupted; }

  /** Says the next phrase and waits for it to play. Never fails: the answer is what matters. */
  private async acknowledge(pace: TurnPace) {
    const skip = (reason: AckSkip) => pace.clock.ackSkipped(reason);
    // The answer, the child, the call and the safety state can each change during an await below, so all of it is read
    // again after each one, and nothing awaits between the last reading and queuing the phrase.
    const stopped = () => {
      if (pace.ready || this.pace !== pace || !pace.writable) return true;
      const state = this.call.session;
      const why: AckSkip | null = !this.childHere || this.finishing || pace.generation !== this.generation ? "child_away"
        : this.childTalking(pace) ? "child_talking"
        : state.safety.flagged || state.contentProblem !== null || state.outcome !== null ? "closing"
        : null;
      if (why) skip(why);
      return why !== null;
    };
    if (stopped()) return;
    const phrase = nextAcknowledgement(this.call.id, this.call.acknowledged);
    if (!phrase) return skip("bank_used");
    // The empty plan gives the phrase's audio an owner, and no batch. A child's speech stops it like any other plan.
    try { await this.stageBoard({}); } catch { return skip("board"); }
    if (stopped()) return;
    // Saved before it is heard, so a replacement worker cannot say it again. A refused save means this worker was replaced.
    if (!(await this.call.acknowledge(phrase.id))) return skip("save");
    if (stopped()) return;
    pace.clock.ackQueued(phrase.id);
    await new Promise<void>(resolve => {
      pace.ackOver = resolve;
      pace.hold = this.timers.set(ACK_HOLD_LIMIT_MS, () => this.cutAck(pace));
      pace.write(phrase.text);
      pace.write(FlushSentinel);
    });
  }

  private childTalking(pace: TurnPace) { return this.session.userState === "speaking" || !!pace.handle?.interrupted; }

  private clearLimit(pace: TurnPace) {
    if (pace.limit !== null) this.timers.clear(pace.limit);
    pace.limit = null;
  }

  /** The child talked, left, or the phrase is done: no acknowledgement starts, and a ready answer stops waiting for one. */
  private cutAck(pace: TurnPace) {
    this.clearLimit(pace);
    if (pace.hold !== null) this.timers.clear(pace.hold);
    pace.hold = null;
    pace.clock.ackEnded();
    pace.ackOver?.();
    pace.ackOver = null;
  }

  /** Reports the turn once. A turn nothing more can happen to, with no answer heard, was interrupted. */
  private closeTurn(pace = this.pace, outcome: TurnOutcome = "interrupted") {
    if (!pace || pace.closed) return;
    pace.closed = true;
    this.cutAck(pace);
    if (this.pace === pace) this.pace = null;
    this.options.measureTurn?.(pace.clock.sample(outcome));
  }

  private boardTask(task: Promise<unknown>, scope: SpeechScope) {
    const generation = this.generation;
    void task.catch(() => {
      // An absent peer cannot answer an RPC. Its snapshot is reconciled when it returns.
      if (!this.finishing && (this.call.lost || (generation === this.generation && this.childHere && this.options.board?.owns(scope)))) void this.finish({ detail: "the speech board connection failed" });
    });
  }
  private stopBoard(scope: SpeechScope) {
    const board = this.options.board;
    if (!board?.owns(scope)) return;
    this.boardAudio?.cancelPending(scope);
    if (this.childHere) this.boardTask(board.interrupt(scope), scope);
    else board.detach(scope);
  }

  private async stageBoard(turn: Pick<VoiceTurn, "boardCues">) {
    if (!this.options.board) return;
    const id = `speech-${this.segment}-${++this.utterance}`;
    const staging = this.options.board.stage(id, turn.boardCues ?? []);
    this.boardScope = this.options.board.capture(id);
    await staging;
  }

  private get timers() { return this.options.timers ?? realTimers; }

  async agentJoined() {
    // End any old worker segment. Its last lease bounds the crash gap.
    await this.call.connection("agent_left");
    await this.call.connection("agent_joined");
    if (this.call.lost) return this.finish({ detail: "the connection could not be saved" });
    this.renewLease();
    this.scheduleLimit();
  }

  private renewLease() {
    if (this.finishing) return;
    this.leaseTimer = this.timers.set(CONNECTION_RENEW_MS, () => {
      void (async () => {
        await this.call.connection("agent_joined");
        if (this.call.lost) await this.finish({ detail: "the connection lease could not be saved" });
        else this.renewLease();
      })();
    });
  }

  async childJoined() {
    if (this.finishing || this.childHere) return;
    const generation = ++this.generation;
    this.childHere = true;
    if (this.graceTimer !== null) this.timers.clear(this.graceTimer);
    this.graceTimer = null;
    const connectingScope = this.boardScope;
    try {
      if (this.options.board) {
        if (connectingScope) await this.options.board.reconnect(connectingScope);
        else await this.options.board.connect();
        if (this.boardScope === connectingScope) this.boardScope = null;
      }
    }
    catch { if (generation === this.generation && this.childHere) return this.finish({ detail: "the board reconnect failed" }); return; }
    if (generation !== this.generation || !this.childHere || this.finishing) return;
    await this.call.connection("child_joined");
    if (generation !== this.generation || !this.childHere || this.finishing) return;
    if (this.call.lost) return this.finish({ detail: "the connection could not be saved" });
    this.speechEndedAt = this.timers.now();
    this.lastTickAt = this.timers.now();
    // Bound the opening model request too, before the first session state can be saved.
    this.scheduleLimit(this.call.session.startedAt ?? this.timers.now());
    const final = this.call.pendingFinal;
    if (final && !this.replayingFinal) {
      this.replayingFinal = true;
      try {
        await this.stageBoard(final);
        const speech = final.say.length ? this.session.say(final.say.join(" "), { addToChatCtx: true }) : null;
        await this.after(final, speech, () => false);
      } catch { await this.finish({ detail: "the saved final speech failed" }); }
    } else if (this.call.session.startedAt === null) this.session.generateReply();
    else this.schedule();
  }

  async childLeft(how: "hang_up" | "dropped") {
    if (this.finishing) return;
    const generation = ++this.generation;
    this.childHere = false;
    if (this.pace) this.cutAck(this.pace);
    if (this.boardScope) this.stopBoard(this.boardScope);
    if (this.tickTimer !== null) this.timers.clear(this.tickTimer);
    this.tickTimer = null;
    await this.call.connection("child_left");
    if (this.finishing || this.childHere || generation !== this.generation) return;
    if (this.call.lost) return this.finish({ detail: "the disconnect could not be saved" });
    if (how === "hang_up") return this.finish({ reason: "child_stopped" });
    if (this.graceTimer === null) {
      this.graceTimer = this.timers.set(RECONNECT_GRACE_MS, () => {
        if (!this.childHere && generation === this.generation) void this.finish({ detail: "the child's connection dropped and did not come back" });
      });
    }
  }

  hangUp() { return this.finish({ reason: "child_stopped" }); }

  async tick() {
    this.tickTimer = null;
    if (this.finishing) return;
    const started = this.call.session.startedAt;
    if (started !== null && this.timers.now() >= started + limitsOf(this.call.session).endAtMs) return this.finish({}, true);
    if (!this.childHere || this.call.ended) return;
    const busy = this.session.agentState === "speaking" || this.session.agentState === "thinking" || this.session.userState === "speaking";
    if (busy) { this.tickTimer = this.timers.set(1000, () => void this.tick()); return; }
    this.lastTickAt = this.timers.now();
    const generation = this.generation;
    try {
      const turn = await this.call.tick();
      if (this.call.lost) return this.finish({ detail: "the call could not be saved" });
      if (this.finishing) return;
      await this.stageBoard(turn);
      if (generation !== this.generation || !this.childHere || this.finishing) return;
      // A check-in's sound is not an earlier answer's.
      this.closeTurn();
      const speech = turn.say.length ? this.session.say(turn.say.join(" "), { addToChatCtx: true }) : null;
      await this.after(turn, speech, () => false);
    } catch { if (generation === this.generation && this.childHere) await this.finish({ detail: "the voice turn failed" }); }
  }

  private async after(turn: VoiceTurn, handle = this.speech, stage: () => boolean = () => true): Promise<boolean> {
    await this.call.settled();
    if (this.call.lost) { void this.finish({ detail: "the call could not be saved" }); return false; }
    if (this.finishing || !this.childHere) return false;
    const generation = this.generation;
    if (stage()) {
      try { await this.stageBoard(turn); }
      catch { if (generation === this.generation && this.childHere) void this.finish({ detail: "the speech board could not be staged" }); return false; }
    }
    if (this.finishing || generation !== this.generation || !this.childHere) return false;
    this.options.notify({ revision: this.call.revision, segment: this.segment, ended: false });
    this.scheduleLimit();
    if (turn.ended) {
      // Do not await inside llmNode: the speech handle needs its text before it can finish.
      void (async () => {
        try { await handle?.waitForPlayout(); await this.options.board?.settled(); }
        catch { await this.finish({ detail: "the final speech failed" }); return; }
        await this.finish({ reason: "child_stopped" });
      })();
    } else this.schedule();
    return true;
  }

  private scheduleLimit(startedAt = this.call.session.startedAt) {
    if (this.limitTimer !== null || this.finishing || startedAt === null) return;
    this.limitTimer = this.timers.set(startedAt + limitsOf(this.call.session).endAtMs - this.timers.now(), () => void this.finish({}, true));
  }

  private schedule() {
    if (this.tickTimer !== null) this.timers.clear(this.tickTimer);
    this.tickTimer = null;
    if (this.finishing || !this.childHere) return;
    const at = nextTickAt(this.call.session, { speechEndedAt: this.speechEndedAt, lastTickAt: this.lastTickAt });
    if (at !== null) this.tickTimer = this.timers.set(at - this.timers.now(), () => void this.tick());
  }

  finish(how: FinishOptions, limit = false): Promise<void> {
    const scope = this.boardScope;
    // Set the promise before calling close, whose event can call finish again.
    this.finishing ??= Promise.resolve().then(async () => {
      for (const t of [this.tickTimer, this.graceTimer, this.limitTimer, this.leaseTimer]) if (t !== null) this.timers.clear(t);
      this.tickTimer = this.graceTimer = this.limitTimer = this.leaseTimer = null;
      this.closeTurn();
      if (scope) this.stopBoard(scope);
      // Stop media immediately for a deadline, hang-up, failure or lost ownership.
      const closing = this.session.close().catch(() => {});
      let failed = this.call.lost;
      try {
        if (this.childHere) {
          try { await this.options.board?.settled(); } catch { /* Keep the last confirmed snapshot on transport failure. */ }
        }
        // Store the media-close boundary before counting, using the database's clock.
        if (this.childHere) await this.call.connection("child_left");
        await this.call.connection("agent_left");
        if (limit) await this.call.limit();
        else await this.call.end(how);
        failed ||= this.call.lost;
      } catch { failed = true; }
      if (!this.call.replaced) this.options.notify({ revision: this.call.revision, segment: this.segment, ended: !failed, ...(failed ? { error: "technical_issue" as const } : {}) });
      await closing;
      await this.options.closed?.();
    });
    return this.finishing;
  }

  get done() { return this.finishing; }
}
