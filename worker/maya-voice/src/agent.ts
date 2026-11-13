// Maya in a voice call (#326): LiveKit Agents for Node around Maya's controller, through the text adapter. The voice
// agent is a thin layer: speech-to-text turns the child's speech into child turns for the call (src/lib/maya-call.ts,
// `openVoice`), and the voice says exactly the words the call's session accepted. LiveKit never asks a model itself:
// the agent's `llmNode` hands each finished turn to the call and returns only what it said (as the text mode does,
// src/lib/maya-livekit-text.ts). The placeholder LLM below exists because AgentSession wants one, and is never asked.
//
// A child's turn does not hold the speech back (#532): `llmNode` returns its stream at once, so a turn that is not ready
// within the limit can say a code-written acknowledgement first (src/lib/maya-voice-ack.ts), as a segment of its own with
// an empty board plan. The answer's board is staged only after that segment has played. A child who talks cancels it, and
// safety guidance or the deadline close stops it at once.
//
// Safety guidance reaches this worker as soon as the session accepts it, with the close call still out (#589). It stops
// the reply and queues at once. A child who is talking is heard first: LiveKit holds interruptible speech until they stop,
// and a disclosure must not be talked over. Words after the guidance wait for it.
// VoiceCallRun also measures each child turn (./turn-timing.ts).
//
// VoiceCallRun owns the call's life around the speech: the opening when the child is there, the ticks the session asks
// for silence (counted from the end of speech), an independent deadline, the connection leases, the
// hang-up, a dropped connection (the call ends if the child is not back within RECONNECT_GRACE_MS), and the end. It
// takes its clock and timers, so a test drives it without waiting.
import { ReadableStream, TransformStream } from "node:stream/web";
import { FlushSentinel, stt, voice, type llm, type tts, type VAD } from "@livekit/agents";
import type { AudioFrame } from "@livekit/rtc-node";
import type { FinishOptions } from "@/lib/maya-text";
import type { VoiceCall, VoiceTurn } from "@/lib/maya-call";
import { speechWords, type BoardSpeech, type SpeechScope } from "@/lib/board-speech";
import { CuePlaybackOutput } from "./cue-playback";
import { HeardSignals } from "./heard-signals";
import { boardAudio, countedSynthesis, type SilentSpeech } from "./speech-audio";
import { VOICE_METER_TICK_MS } from "@/lib/maya-spend";
import { limitsOf } from "@/lib/maya";
import { asksForNumber, CONNECTION_RENEW_MS, childTurnFrom, endsInOpenNumber, GREETING_ID, GREETING_TEXT, nextTickAt, RECONNECT_GRACE_MS, type Heard, type TurnSilence, type VoiceTuning } from "@/lib/maya-voice";
import { ACK_HOLD_LIMIT_MS, ACK_LIMIT_MS, ACK_PHRASES, nextAcknowledgement } from "@/lib/maya-voice-ack";
import { TurnClock, type AckSkip, type HeardMarks, type TurnOutcome, type VoiceTurnSample } from "./turn-timing";

const userTexts = (ctx: llm.ChatContext) =>
  ctx.items.flatMap((i) => (i.type === "message" && i.role === "user" ? [i.textContent ?? ""] : []));
/** When the child stopped speaking by LiveKit's turn metrics (seconds, on the system clock), if it knows. */
const stoppedSpeakingAt = (ctx: llm.ChatContext) => {
  const last = ctx.items.findLast((i) => i.type === "message" && i.role === "user");
  return last?.type === "message" ? last.metrics?.stoppedSpeakingAt : undefined;
};

/** The turn and interruption settings a real call sets (src/lib/maya-voice.ts `VoiceTuning`). */
export type TurnTuning = Pick<VoiceTuning, "turnMinDelayMs" | "interruptMinMs" | "interruptMinWords">;

/**
 * A session for a voice call: LiveKit's pipeline with Maya's agent. `fake` turns off voice activity detection. `tuning`
 * is for tests (shorter endpointing, no echo warm-up) and for a real call's `turn` settings: the endpointing `minDelay`
 * LiveKit adds after the speech-to-text end of turn (its default is 500 ms), and when the child's speech stops Maya
 * (`minDuration`, `minWords`). A test's `endpointingMs` wins over `turn.turnMinDelayMs`.
 */
export function voiceSession(providers: { stt: stt.STT; tts: tts.TTS; fake: boolean }, tuning: { endpointingMs?: number; aecWarmupDuration?: number; turn?: TurnTuning } = {}) {
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
      ...(tuning.endpointingMs !== undefined ? { endpointing: { minDelay: tuning.endpointingMs, maxDelay: tuning.endpointingMs } }
        : tuning.turn ? { endpointing: { minDelay: tuning.turn.turnMinDelayMs } } : {}),
      // Speech this long stops Maya, and (with `minWords` above 0) only once the speech-to-text has heard that many words.
      // The other options (the false interruption timeout and its resume) keep LiveKit's defaults.
      ...(tuning.turn ? { interruption: { minDuration: tuning.turn.interruptMinMs, minWords: tuning.turn.interruptMinWords } } : {}),
    },
    ...(tuning.aecWarmupDuration !== undefined ? { aecWarmupDuration: tuning.aecWarmupDuration } : {}),
    // The session's own pause policy (src/lib/maya) decides about silence, not LiveKit's away timer.
    userAwayTimeout: null,
  });
}

/** What the run gives the agent around a turn: the greeting to wait for, and the wait for a number that may go on. */
interface AgentHooks {
  /** Resolves when the greeting is over (at once when there is none). The opening is staged after it. */
  greetingOver(): Promise<void>;
  /** True when the child went on speaking within the wait; `text` ends in a number word that can go on. */
  childWentOn(text: string): Promise<boolean>;
}

/**
 * When one final transcript reached the worker, and when the child's last word in it ended by the speech-to-text's own
 * word times (null when the provider gave none). Both on the system clock.
 */
export interface FinalMark {
  finalAt: number;
  wordEndAt: number | null;
}

export class MayaVoiceAgent extends voice.Agent {
  private seen = 0;
  private opened = false;
  private finals: Heard[][] = [];
  /** One mark per entry of `finals`, kept and joined with them. */
  private marks: FinalMark[] = [];
  /** The held words were already waited on once, so the turn that joins them is not waited on again. */
  private extended = false;
  constructor(
    private readonly call: VoiceCall,
    private readonly onTurn: (turn: VoiceTurn) => Promise<boolean>,
    private readonly board: { sync: BoardSpeech; scope(): SpeechScope | null } | undefined,
    private readonly reply: (stoppedAt: number | undefined, work: () => Promise<VoiceTurn[]>, mark: FinalMark | null) => ReadableStream<string | FlushSentinel>,
    private readonly hooks: AgentHooks = { greetingOver: async () => {}, childWentOn: async () => false },
  ) {
    super({ instructions: "Maya's words come from her session through the text adapter, not from these instructions." });
  }

  /**
   * The speech-to-text as LiveKit runs it, keeping each final transcript's confidence and alternatives, and its time
   * marks (FinalMark). The child's last word ends at the time the first audio frame went in plus the transcript's end
   * time, as LiveKit reads it (`inputStartedAt` in voice/audio_recognition.js).
   */
  override async sttNode(audio: ReadableStream<AudioFrame> | AsyncIterable<AudioFrame>, settings: voice.ModelSettings) {
    let inputStartedAt: number | null = null;
    // The signals of each final transcript, for the worker log only: nothing is dropped on them (./heard-signals.ts).
    let vad: VAD | undefined;
    try { vad = this.session.vad; } catch { vad = undefined; }
    const signals = new HeardSignals(vad);
    const input = "pipeThrough" in audio
      ? audio.pipeThrough(new TransformStream<AudioFrame, AudioFrame>({
        transform(frame, controller) {
          inputStartedAt ??= Date.now() - (frame.samplesPerChannel / frame.sampleRate) * 1000;
          signals.frame(frame);
          controller.enqueue(frame);
        },
        flush() { signals.close(); },
      }))
      : audio;
    const stream = await voice.Agent.default.sttNode(this, input, settings);
    if (!stream) return null;
    const finals = this.finals;
    const marks = this.marks;
    const callId = this.call.id;
    return stream.pipeThrough(
      new TransformStream<stt.SpeechEvent | string, stt.SpeechEvent | string>({
        transform(event, controller) {
          if (typeof event !== "string" && event.type === stt.SpeechEventType.FINAL_TRANSCRIPT && event.alternatives) {
            finals.push(event.alternatives.map((a) => ({ text: a.text, confidence: a.confidence })));
            const finalAt = Date.now();
            const end = event.alternatives[0]?.endTime ?? 0;
            const wordEndAt = inputStartedAt !== null && end > 0 ? inputStartedAt + end * 1000 : null;
            // A word that "ends" after its transcript came is a clock that does not fit: no mark rather than a wrong one.
            marks.push({ finalAt, wordEndAt: wordEndAt !== null && wordEndAt <= finalAt ? wordEndAt : null });
            console.info("[maya voice] final transcript", callId, signals.final(event.alternatives));
          }
          controller.enqueue(event);
        },
      }),
    );
  }

  override async ttsNode(text: ReadableStream<string> | AsyncIterable<string>, settings: voice.ModelSettings) {
    // Every line reaches the voice provider here: replies, acknowledgement phrases and guidance said again.
    const synthesize = (input: ReadableStream<string> | AsyncIterable<string>) =>
      countedSynthesis(input, counted => voice.Agent.default.ttsNode(this, counted, settings), said => void this.call.spoken(said));
    // The worker's own opening has an empty plan, and must not wait for the board to connect.
    const ungated = this.ungatedNext;
    this.ungatedNext = false;
    if (!this.board) return synthesize(text);
    const scope = this.board.scope();
    if (!scope || !this.board.sync.owns(scope)) return null;
    return boardAudio(text, synthesize, this.board.sync, scope, speech => this.onSilent?.(speech), !ungated);
  }

  /** One-shot: the next speech's audio does not wait for its (empty) board plan to be sent (the worker's own opening). */
  ungatedNext = false;
  /** A speech with a board plan whose voice gave no audio (./speech-audio.ts `boardAudio`). */
  onSilent: ((speech: SilentSpeech) => void) | null = null;
  private starting: Promise<unknown> | null = null;
  /** The worker spoke the opening itself, and the call starts behind it: no opening reply, and a child turn waits for the start. */
  openedByWorker(starting: Promise<unknown>) {
    this.opened = true;
    this.starting = starting;
  }

  /** Opens the call (the first reply), then answers each finished child turn with what the call's session said. */
  override async llmNode(...[chatCtx]: Parameters<voice.Agent["llmNode"]>): ReturnType<voice.Agent["llmNode"]> {
    const users = userTexts(chatCtx);
    const before = this.seen;
    const fresh = users.slice(this.seen).filter((t) => t.trim());
    this.seen = users.length;
    const opening = !this.opened;
    this.opened = true;
    if (fresh.length > 0) {
      const held = this.finals.splice(0);
      const heldMarks = this.marks.splice(0);
      const heard = childTurnFrom(held) ?? { text: fresh.join(" "), uncertain: false, alternatives: [] };
      // A transcript that ends in "fifty" may be the start of "fifty six": wait once for more words (one extension). If
      // they come, these words are not answered: the child's next turn is read with them, as one answer.
      if (opening === false && !this.extended && await this.hooks.childWentOn(heard.text)) {
        this.seen = before;
        this.finals.unshift(...held);
        this.marks.unshift(...heldMarks);
        this.extended = true;
        return null;
      }
      this.extended = false;
      return this.reply(stoppedSpeakingAt(chatCtx), async () => [
        ...((await this.starting, opening) ? [await this.call.start()] : []),
        await this.call.child(heard.text, heard.uncertain ? { uncertain: true, alternatives: heard.alternatives } : undefined),
      ], heldMarks.at(-1) ?? null);
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
  /** Safety guidance of this turn already went out: its marks are taken, and only the close can follow. */
  guided: boolean;
  /** The phrase's end never came, so its speech was stopped at the limit. */
  ackStopped: boolean;
  /**
   * A phrase went into this reply's stream. The voice provider closes a stream about 1 s after its last audio
   * (Cartesia contexts), so words written later are lost with no sound: Savar's call of 2026-11-13 heard no answer.
   */
  ackWritten: boolean;
  /** The answer goes out as speech of its own, so the end of this reply's stream does not end the turn. */
  ownSpeech: boolean;
  limit: unknown;
  hold: unknown;
  ack: Promise<void> | null;
  ackOver: (() => void) | null;
  write(chunk: string | FlushSentinel): void;
  /** Ends the reply's stream. Nothing more can be written to it. */
  end(): void;
}

/** The greeting's own wait for its end of playback, if the audio never reports one (its words take about 8 s at a calm pace). */
export const GREETING_HOLD_LIMIT_MS = 20_000;

/** Lines with no teaching in them: when their audio does not come, they are not said again. */
const FILLERS = new Set([GREETING_TEXT, ...ACK_PHRASES.map(p => p.text)]);

const timeOf = (turns: readonly VoiceTurn[]) => ({
  modelMs: turns.reduce((sum, t) => sum + (t.time?.modelMs ?? 0), 0),
  repairMs: turns.reduce((sum, t) => sum + (t.time?.repairMs ?? 0), 0),
  reviewMs: turns.reduce((sum, t) => sum + (t.time?.reviewMs ?? 0), 0),
});

export class VoiceCallRun {
  private lastTickAt: number | null = null;
  private speechEndedAt: number | null = null;
  private tickTimer: unknown = null;
  private graceTimer: unknown = null;
  private limitTimer: unknown = null;
  private leaseTimer: unknown = null;
  private meterTimer: unknown = null;
  private finishing: Promise<void> | null = null;
  private childHere = false;
  private generation = 0;
  private speech: voice.SpeechHandle | null = null;
  private replayingFinal = false;
  private utterance = 0;
  private boardScope: SpeechScope | null = null;
  private boardAudio: CuePlaybackOutput | null = null;
  private childStoppedAt: number | null = null;
  /**
   * The first end of speech LiveKit reported since the child last started (system clock): in a real call its voice
   * activity detector, which reports it after its own silence window, so before the speech-to-text ends the turn.
   */
  private speechEndSeenAt: number | null = null;
  private pace: TurnPace | null = null;
  /** The plans of words said again after a silent speech: a second silence is not said a third time. */
  private resaid = new Set<string>();
  /** The guidance on its way to the child. */
  private guidance: { speech: voice.SpeechHandle; over: Promise<void>; scope: SpeechScope | null; cut: boolean; repeated: boolean } | null = null;
  /** Guidance cut while the child was away. They hear it when they are back. */
  private guidanceOwed: string | null = null;
  /** The last words of a call that ended while the child was away. They come first when the child is back, and then the stored call ends. */
  private finalOwed: VoiceTurn | null = null;
  /** The greeting's playout, while it is being said: the opening waits for it. */
  private greeted: Promise<void> | null = null;
  private greetStarted = false;
  private openingSaid = false;
  /** Words (transcripts, interim or final) the speech-to-text gave so far, and who waits for the next one. */
  private wordCount = 0;
  private wordWaiter: (() => void) | null = null;
  /** The speech-to-text now waits the longer limit, because Maya asked for a number. */
  private numberWait = false;
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
      /**
       * The words said once before Maya's first line (GREETING_TEXT). Said at most once per call: it is saved under
       * GREETING_ID in the call's acknowledged list before it is queued. Absent: no greeting.
       */
      greeting?: string;
      /**
       * The opening in the worker's own words (code-written, the same line the call's start records). With it, Maya
       * speaks the moment the child is here, and the call starts behind the speech. Absent: the call's start gives the words.
       */
      opening?: string;
      openingMark?: (name: string) => void;
      /**
       * The speech-to-text's silence limits for the one child turn after Maya asks for a number (`number`) and for every
       * other turn (`normal`), set through `set` while the call runs. Absent: the limits set at the start stay.
       */
      patience?: { normal: TurnSilence; number: TurnSilence; set(limits: TurnSilence): void };
      /** How long to wait once more when a transcript ends in a number word that can go on (ms). 0 or absent: no wait. */
      numberContinueMs?: number;
    },
  ) {
    this.segment = call.revision;
    this.agent = new MayaVoiceAgent(call, turn => this.after(turn), options.board ? { sync: options.board, scope: () => this.boardScope } : undefined,
      (stoppedAt, work, mark) => this.reply(stoppedAt, work, mark),
      { greetingOver: () => this.greetingOver(), childWentOn: text => this.childWentOn(text) });
    this.agent.onSilent = speech => this.silentSpeech(speech);
    call.onGuidance(turn => this.guidanceNow(turn));
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, ev => { if (ev.transcript.trim()) this.wordsHeard(); });
    session.on(voice.AgentSessionEventTypes.UserStateChanged, ev => {
      if (ev.newState === "speaking") {
        this.speechEndSeenAt = null;
        if (this.pace) this.cutAck(this.pace);
        if (this.boardScope) this.stopBoard(this.boardScope);
      } else if (ev.oldState === "speaking") {
        this.childStoppedAt = this.timers.now();
        this.speechEndSeenAt = ev.createdAt;
      }
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

  /** The speech-to-text gave words: a child who went on speaking ends the wait of `childWentOn`. */
  private wordsHeard() {
    this.wordCount++;
    this.wordWaiter?.();
  }

  /**
   * A transcript ends in a number word that can go on ("fifty"): waits at most `numberContinueMs` for more words. True
   * when some came (the turn is then read again with them); false when none did, and the turn goes on as it is.
   */
  private async childWentOn(text: string): Promise<boolean> {
    const ms = this.options.numberContinueMs ?? 0;
    if (ms <= 0 || !endsInOpenNumber(text) || this.finishing || !this.childHere) return false;
    const seen = this.wordCount;
    await new Promise<void>(resolve => {
      const timer = this.timers.set(ms, () => { this.wordWaiter = null; resolve(); });
      this.wordWaiter = () => { this.timers.clear(timer); this.wordWaiter = null; resolve(); };
    });
    return this.wordCount > seen && !this.finishing && this.childHere;
  }

  /** The speech-to-text's silence limit for the child's next turn: longer when Maya asked for a number. */
  private setPatience(number: boolean) {
    const patience = this.options.patience;
    if (!patience || this.numberWait === number) return;
    this.numberWait = number;
    // A live update that fails changes nothing: the limit set at the start stays.
    try { patience.set(number ? patience.number : patience.normal); } catch { /* keep the limit as it is */ }
  }

  /** After words Maya was accepted to say: does she ask for a number? Then the next child turn may wait longer. */
  private expectNumber(turn: VoiceTurn) {
    if (!turn.say.length) return;
    this.setPatience(!turn.ended && asksForNumber(turn.say.join(" "), this.call.session.state));
  }

  /**
   * Says the opening at once (Savar, 2026-11-13: under 1 s from the child's connection), with no board plan, and starts
   * the call behind it. The start's own words are not said again; its turn keeps the rest of `after`.
   */
  private openNow(text: string): voice.SpeechHandle {
    this.openingSaid = true;
    // An empty plan gives the opening's audio an owner (the call's audio output plays only audio that has one, which
    // is why an opening with no plan made no sound, 2026-11-13). Its audio does not wait for the board: `ungatedNext`.
    void this.stageBoard({}, false).catch(() => {});
    this.agent.ungatedNext = true;
    this.options.openingMark?.("say");
    const speech = this.session.say(text, { addToChatCtx: true });
    const generation = this.generation;
    void speech.waitForPlayout().catch(() => {}).then(() => this.options.openingMark?.(`playout:${speech.interrupted ? "interrupted" : "whole"}`));
    const starting = (async () => {
      const turn = await this.call.start();
      if (this.call.lost) return void this.finish({ detail: "the call could not be saved" });
      await this.after({ ...turn, say: [] }, speech, () => false);
    })().catch(() => { if (generation === this.generation && this.childHere) void this.finish({ detail: "the opening could not be saved" }); });
    this.agent.openedByWorker(starting);
    return speech;
  }

  /** The greeting is over (or there was none, or it never started). */
  private greetingOver(): Promise<void> { return this.greeted ?? Promise.resolve(); }

  /**
   * Says the greeting once, before the opening. It is a code line with an empty board plan, like an acknowledgement: it
   * sends no batch and is not in the transcript. A save under GREETING_ID comes first, so a worker that takes the call
   * over, or a child who rejoins before the opening is saved, never hears it twice. Never throws: no greeting is better
   * than none of Maya.
   */
  private async greet(generation: number) {
    const text = this.options.greeting;
    if (!text || this.greetStarted || this.call.acknowledged.includes(GREETING_ID)) return;
    // The child is already talking or being answered: a new plan would take that reply's audio. No greeting this call.
    if (this.pace || this.session.userState === "speaking") return;
    // Set before the first await: a child who rejoins while the greeting is being staged must not start a second one.
    this.greetStarted = true;
    const stale = () => this.finishing !== null || generation !== this.generation || !this.childHere;
    try { await this.stageBoard({}); } catch { return; }
    if (stale()) return;
    if (!(await this.call.acknowledge(GREETING_ID))) return;
    if (stale()) return;
    const speech = this.session.say(text, { addToChatCtx: true });
    // A speech whose playback never ends holds LiveKit's queue, and the opening with it: stop it after the longest wait.
    const hold = this.timers.set(GREETING_HOLD_LIMIT_MS, () => speech.interrupt(true));
    this.greeted = speech.waitForPlayout().catch(() => {}).then(() => { this.timers.clear(hold); });
  }

  /** The stream of a child turn's reply. It is returned at once: the turn runs behind it. */
  private reply(stoppedAt: number | undefined, work: () => Promise<VoiceTurn[]>, mark: FinalMark | null = null) {
    this.setPatience(false);
    this.closeTurn();
    const heardAt = this.timers.now();
    const systemNow = Date.now();
    /** A system-clock mark on the turn's clock: keep only how long ago it was. */
    const sinceThen = (at: number) => heardAt - Math.max(0, systemNow - at);
    // LiveKit's mark is on the system clock, and can be earlier than its user state change. Keep only how long ago it was.
    const speechEndedAt = stoppedAt === undefined ? this.childStoppedAt ?? heardAt : sinceThen(stoppedAt * 1000);
    // The child's own end of speech: the speech-to-text's end of the last word, else LiveKit's first end of speech if it
    // came before the final transcript (one at or after it is the speech-to-text's own end of turn, not the child's).
    const seen = this.speechEndSeenAt;
    const heard: HeardMarks = !mark ? { speechEndAt: null, source: null, finalAt: null }
      : mark.wordEndAt !== null ? { speechEndAt: sinceThen(mark.wordEndAt), source: "stt_words", finalAt: sinceThen(mark.finalAt) }
      : seen !== null && seen < mark.finalAt ? { speechEndAt: sinceThen(seen), source: "vad", finalAt: sinceThen(mark.finalAt) }
      : { speechEndAt: null, source: null, finalAt: sinceThen(mark.finalAt) };
    const pace: TurnPace = {
      clock: new TurnClock(this.timers.now, speechEndedAt, heardAt, heard), generation: this.generation,
      writable: true, ready: false, closed: false, handle: this.speech, guided: false, ackStopped: false, ackWritten: false, ownSpeech: false, limit: null, hold: null, ack: null, ackOver: null, write: () => {}, end: () => {},
    };
    this.pace = pace;
    return new ReadableStream<string | FlushSentinel>({
      start: controller => {
        pace.write = chunk => { if (pace.writable) controller.enqueue(chunk); };
        pace.end = () => { if (pace.writable) { pace.writable = false; controller.close(); } };
        this.runTurn(pace, speechEndedAt, work).then(
          () => pace.end(),
          error => { this.closeTurn(pace); if (pace.writable) { pace.writable = false; controller.error(error); } },
        );
      },
      cancel: () => {
        pace.writable = false;
        this.cutAck(pace);
        if (!pace.ownSpeech) this.closeTurn(pace);
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
    // The guidance went out on its own, and this turn's marks with it. What is left is the close.
    if (pace.guided) return this.sayFirst(null, turns);
    pace.clock.ready(timeOf(turns));
    // Safety comes first, and the deadline close with it: nothing that came before them holds them back.
    if (turns.some(t => t.priority)) return this.sayFirst(pace, turns);
    // A new plan takes the audio from the old one, so the answer's board waits until the acknowledgement has played.
    if (pace.ack) await pace.ack;
    // Its end never came: its speech was stopped at the limit, so a word in this reply could not be read. A phrase that
    // played has an ended voice stream, so the answer goes out as speech of its own, with a new stream.
    if (pace.ackStopped || pace.ackWritten) return this.sayFirst(pace, turns);
    pace.clock.held();
    const said: string[] = [];
    // A dropped turn must not stage: its speech cannot play, and its plan would take the board from the turn that
    // replaced it. It keeps the rest of `after` (the revision, the check-ins, the call's end). The turn's own save is
    // done (`VoiceCall.child` waits for it), so the words do not wait for later saves, and the plan goes out while the
    // voice makes the first sentence: its audio waits for the plan (`boardAudio`), so no cue word is heard first.
    for (const turn of turns) if (await this.after(turn, undefined, () => this.ownsReply(pace), true)) said.push(...turn.say);
    const text = said.join(" ");
    if (!text || !this.ownsReply(pace)) {
      pace.clock.staged();
      return this.closeTurn(pace, this.ownsReply(pace) ? "no_words" : "interrupted");
    }
    const scope = this.boardScope;
    if (scope && this.options.board) void this.options.board.sent(scope).then(() => pace.clock.planSent(), () => {});
    pace.clock.staged();
    pace.write(text);
  }

  /** The session accepted safety guidance, and the input behind it can still be waiting for the model's close (#589). */
  private guidanceNow(turn: VoiceTurn) {
    const pace = this.pace;
    if (pace) {
      pace.guided = true;
      pace.ready = true;
      this.clearLimit(pace);
      // A phrase still on its way never starts, and this turn's sample can be taken before that work comes back.
      if (pace.ack) pace.clock.ackSkipped("closing");
      pace.clock.ready(timeOf([turn]));
    }
    void this.sayFirst(pace, [turn]).catch(() => this.finish({ detail: "the safety guidance failed" }));
    // The reply is stopped, and its stream must not stay open for the close call.
    pace?.end();
  }

  /**
   * Stops the reply and queues the words as speech of their own. LiveKit plays a reply's segments in order, so words added
   * to the reply could not start until the phrase ended, and words in a stopped reply are never read at all. Null: the
   * marks of this turn are already taken.
   */
  private async sayFirst(pace: TurnPace | null, turns: VoiceTurn[]) {
    if (pace) {
      pace.ownSpeech = true;
      this.cutAck(pace);
      pace.clock.held();
    }
    const text = turns.flatMap(t => t.say).join(" ");
    const guidance = turns.findLast(t => t.guidance)?.guidance;
    const last = turns.at(-1)!;
    let speech: voice.SpeechHandle | null = null;
    if (text) {
      pace?.handle?.interrupt(true);
      // New guidance goes first. Anything else waits: a queued speech takes the board plan that is current when it starts,
      // so a later plan would take the guidance's audio.
      if (guidance) this.dropGuidance();
      else await this.guidance?.over;
      // Guidance is for the child who is here now, or who comes back. Other words belong to the connection that asked.
      if (guidance && !this.childHere && !this.finishing) {
        this.guidanceOwed = guidance;
        return this.closeTurn(pace);
      }
      const generation = guidance ? this.generation : pace?.generation ?? this.generation;
      // A plan with no batches has nothing to wait for, and a late board answer must not hold back these words.
      try { await this.stageBoard(last, !!last.boardCues?.length); }
      catch (error) { this.boardFailed(error); if (generation === this.generation && this.childHere) void this.finish({ detail: "the speech board could not be staged" }); return this.closeTurn(pace); }
      if (this.finishing || !this.childHere || generation !== this.generation) {
        this.finalDropped({ ...last, say: turns.flatMap(t => t.say) });
        return this.closeTurn(pace);
      }
      pace?.clock.staged();
      speech = this.session.say(text, { addToChatCtx: true });
      if (guidance) this.followGuidance(guidance, speech);
    } else this.closeTurn(pace, "no_words");
    for (const turn of turns) await this.after(turn, speech, () => false);
  }

  /**
   * A call's last words that the child was not there to hear. The controller has ended, so no later input can end the
   * stored call, and it would stay live until the deadline, with its note, alert and learning event waiting.
   */
  private finalDropped(turn: VoiceTurn) {
    if (!turn.ended || this.finishing) return;
    // A later ended turn with no words (a late transcript) keeps the close the child is already owed.
    if (!this.childHere) { if (turn.say.length || !this.finalOwed) this.finalOwed = turn; return; }
    void this.sayFirst(null, [turn]).catch(() => this.finish({ detail: "the final speech failed" }));
  }

  /** A guidance a newer one replaces stops, and is not said again. */
  private dropGuidance() {
    const old = this.guidance;
    this.guidance = null;
    old?.speech.interrupt(true);
  }

  /** Follows the guidance's speech. If it was cut it plays once more, and words after it wait for that too. */
  private followGuidance(text: string, speech: voice.SpeechHandle, repeated = false) {
    const followed = { speech, scope: this.boardScope, cut: false, repeated, over: Promise.resolve() };
    const run = async () => {
      await speech.waitForPlayout();
      if (this.guidance !== followed) return;
      if ((followed.cut || speech.interrupted) && !followed.repeated && !this.finishing) {
        if (this.childHere) await this.repeatGuidance(text);
        else this.guidanceOwed = text;
      }
      if (this.guidance === followed) this.guidance = null;
    };
    this.guidance = followed;
    followed.over = run().catch(() => { if (this.guidance === followed) this.guidance = null; });
  }

  /** The once more. Its plan has no batches, as the guidance has none. */
  private async repeatGuidance(text: string) {
    // A reply can hold the queue, as it waits for the model's close. It has no words to say in a flagged call.
    this.pace?.handle?.interrupt(true);
    await this.stageBoard({}, false);
    const speech = this.session.say(text, { addToChatCtx: true });
    this.followGuidance(text, speech, true);
    await speech.waitForPlayout();
  }

  /** No newer turn replaced this one, and its speech can still play. */
  private ownsReply(pace: TurnPace) { return this.pace === pace && pace.writable && !pace.handle?.interrupted; }

  /** Says the next phrase and waits for it to play. Never fails: the answer is what matters. */
  private async acknowledge(pace: TurnPace) {
    const skip = (reason: AckSkip) => pace.clock.ackSkipped(reason);
    // The answer, the child, the call and the safety state can each change during an await below, so all of it is read
    // again after each one, and nothing awaits between the last reading and queuing the phrase.
    const stopped = () => {
      if (pace.guided) { skip("closing"); return true; }
      if (pace.ready || this.pace !== pace || !pace.writable) return true;
      const state = this.call.session;
      const why: AckSkip | null = !this.childHere || this.finishing || pace.generation !== this.generation ? "child_away"
        : this.childTalking(pace) ? "child_talking"
        : state.safety.flagged || state.contentProblem !== null || state.outcome !== null || state.state === "TIME_CLOSE" ? "closing"
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
      // A speech whose playback never ends holds LiveKit's queue, so the answer must not depend on it.
      pace.hold = this.timers.set(ACK_HOLD_LIMIT_MS, () => {
        pace.ackStopped = pace.ownSpeech = true;
        pace.handle?.interrupt(true);
        this.cutAck(pace);
      });
      pace.ackWritten = true;
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
    // A retired plan's audio never reaches the child, whatever its speech handle says afterwards.
    if (this.guidance?.scope === scope && !this.guidance.repeated) this.guidance.cut = true;
    this.boardAudio?.cancelPending(scope);
    if (this.childHere) this.boardTask(board.interrupt(scope), scope);
    else board.detach(scope);
  }

  /**
   * A speech whose voice gave no audio: its batches are already on the board (`boardAudio`). The worker log shows it,
   * and when none of it was heard the words are said once more, with a fresh speech and an empty plan, if nothing came
   * after it. A filler (a thinking phrase, the greeting) is not said again, and a repeat that is silent too is only logged.
   */
  private silentSpeech(speech: SilentSpeech) {
    const { scope, text, heardAny, failed } = speech;
    const repeat = this.resaid.has(`${scope.utteranceId}:${scope.generation}`);
    console.warn("[maya voice] speech had no audio", this.call.id, { words: speechWords(text).length, heardAny, failed, repeat });
    if (heardAny || repeat || !text.trim() || FILLERS.has(text.trim())) return;
    const current = this.boardScope;
    const fresh = () => this.childHere && !this.finishing && !this.guidance && this.session.userState !== "speaking";
    if (current?.utteranceId !== scope.utteranceId || current.generation !== scope.generation || !fresh()) return;
    const generation = this.generation;
    const silentHandle = this.speech;
    void (async () => {
      // After the silent speech is over: LiveKit lets its "thinking" state go only when no speech waits behind it.
      await silentHandle?.waitForPlayout();
      if (generation !== this.generation || this.boardScope !== current || !fresh()) return;
      const staging = this.stageBoard({});
      const mine = this.boardScope;
      await staging;
      if (!mine || this.boardScope !== mine || generation !== this.generation || !fresh()) return;
      this.resaid.add(`${mine.utteranceId}:${mine.generation}`);
      this.session.say(text, { addToChatCtx: false });
    })().catch(() => {});
  }

  /** The trace keeps a fixed detail; the reason goes to the worker's log. */
  private boardFailed(error: unknown) {
    console.warn("[maya voice] board stage failed", this.call.id, error instanceof Error ? error.message : String(error));
  }

  private async stageBoard(turn: Pick<VoiceTurn, "boardCues">, wait = true) {
    if (!this.options.board) return;
    const id = `speech-${this.segment}-${++this.utterance}`;
    const staging = this.options.board.stage(id, turn.boardCues ?? []);
    // A batch the board core refused is not drawn, and the call goes on (board-speech.ts `stage`). Ids and codes only.
    void staging.then(r => { if (r.refused.length) console.warn("[maya voice] board batch refused", this.call.id, r.refused); }, () => {});
    const scope = this.options.board.capture(id);
    this.boardScope = scope;
    if (wait) await staging;
    else if (scope) this.boardTask(staging, scope);
  }

  private get timers() { return this.options.timers ?? realTimers; }

  async agentJoined() {
    // End any old worker segment. Its last lease bounds the crash gap.
    await this.call.connection("agent_left");
    await this.call.connection("agent_joined");
    if (this.call.lost) return this.finish({ detail: "the connection could not be saved" });
    this.renewLease();
    this.scheduleLimit();
    this.scheduleMeter();
  }

  /** Speech-to-text runs while the room is open, so its reservation is renewed on this timer, not at the child's turns. */
  private scheduleMeter() {
    if (this.finishing) return;
    this.meterTimer = this.timers.set(VOICE_METER_TICK_MS, () => void this.meterTick());
  }

  private async meterTick() {
    this.meterTimer = null;
    if (this.finishing) return;
    let close: VoiceTurn | null = null;
    try { close = await this.call.meter(); } catch { /* The next tick asks again. */ }
    if (this.finishing) return;
    if (!close) return this.scheduleMeter();
    // Whatever Maya is saying finishes first: this speech waits in LiveKit's queue, and the close ends the call after it.
    this.closeTurn();
    await this.sayFirst(null, [close]).catch(() => this.finish({ detail: "the final speech failed" }));
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
    // The opening is said before anything is waited for: the board, the rows and the call's start follow behind it.
    const opens = !this.openingSaid && !!this.options.opening && this.call.session.startedAt === null && !this.call.pendingFinal && !this.guidanceOwed && !this.finalOwed;
    let said: voice.SpeechHandle | null = null;
    const connectingScope = this.boardScope;
    // The connection row does not wait for the board's answer (the opening's speed, 2026-11-13).
    const row = this.call.connection("child_joined");
    try {
      if (this.options.board) {
        if (connectingScope) await this.options.board.reconnect(connectingScope);
        else {
          // The board's connection is under way, not awaited: the opening's empty plan is queued behind it, and its
          // audio does not wait for it.
          const connecting = this.options.board.connect();
          if (opens) said = this.openNow(this.options.opening!);
          await connecting;
        }
        if (this.boardScope === connectingScope) this.boardScope = null;
      } else if (opens) said = this.openNow(this.options.opening!);
    }
    catch { if (generation === this.generation && this.childHere) return this.finish({ detail: "the board reconnect failed" }); return; }
    // The opening does not wait for the row. A row that could not be saved ends the call when it reports.
    void row.then(() => { if (this.call.lost && !this.finishing) void this.finish({ detail: "the connection could not be saved" }); }, () => {});
    if (generation !== this.generation || !this.childHere || this.finishing) return;
    if (this.call.lost) return this.finish({ detail: "the connection could not be saved" });
    this.speechEndedAt = this.timers.now();
    this.lastTickAt = this.timers.now();
    const owed = this.guidanceOwed;
    const lastWords = this.finalOwed;
    this.guidanceOwed = this.finalOwed = null;
    if (owed || lastWords) {
      // The guidance first. Then the call that ended while the child was away ends here, after its own last words.
      void (async () => {
        if (owed) await this.repeatGuidance(owed);
        if (lastWords) await this.sayFirst(null, [lastWords]);
        else if (this.call.ended) await this.finish({ reason: "child_stopped" });
      })().catch(() => this.finish({ detail: "the final speech failed" }));
    }
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
    } else if (this.call.session.startedAt === null || said) {
      // The opening is Maya's first sound (Savar, 2026-11-13). The greeting follows it, unless the child cut the opening:
      // a new board plan takes the audio from the old one, so it is staged only after the opening has played.
      const opening = said ?? this.session.generateReply() as voice.SpeechHandle | undefined;
      void Promise.resolve(opening?.waitForPlayout()).catch(() => {}).then(() => {
        if (generation !== this.generation || !this.childHere || this.finishing || opening?.interrupted) return;
        return this.greet(generation);
      });
    } else {
      this.schedule();
      // A new worker took over after the guidance: the close call the old one waited for is gone.
      const { state, safety, outcome } = this.call.session;
      if (state === "SAFETY" && safety.guided && !outcome && !this.call.working) {
        if (this.tickTimer !== null) this.timers.clear(this.tickTimer);
        this.tickTimer = this.timers.set(0, () => void this.tick());
      }
    }
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
    const busy = this.session.agentState === "speaking" || this.session.agentState === "thinking" || this.session.userState === "speaking" || this.call.working;
    if (busy) { this.tickTimer = this.timers.set(1000, () => void this.tick()); return; }
    this.lastTickAt = this.timers.now();
    const generation = this.generation;
    try {
      const turn = await this.call.tick();
      if (this.call.lost) return this.finish({ detail: "the call could not be saved" });
      if (this.finishing) return;
      // A check-in's sound is not an earlier answer's.
      if (turn.priority) {
        // The same way as a child's reply: a new plan must not take the audio of guidance that is still playing.
        this.closeTurn();
        return await this.sayFirst(null, [turn]);
      }
      await this.stageBoard(turn);
      if (generation !== this.generation || !this.childHere || this.finishing) return this.finalDropped(turn);
      this.closeTurn();
      const speech = turn.say.length ? this.session.say(turn.say.join(" "), { addToChatCtx: true }) : null;
      await this.after(turn, speech, () => false);
    } catch { if (generation === this.generation && this.childHere) await this.finish({ detail: "the voice turn failed" }); }
  }

  /**
   * What follows a turn the call accepted: its board plan, the revision for the child's screen, the check-ins and the
   * call's end. `overlap` (a child turn's reply, whose own save is done): no wait for later saves, and the plan is not
   * waited for here, as the reply's audio waits for it (`boardAudio`); a plan that fails ends the call (`boardTask`).
   */
  private async after(turn: VoiceTurn, handle = this.speech, stage: () => boolean = () => true, overlap = false): Promise<boolean> {
    if (!overlap) await this.call.settled();
    if (this.call.lost) { void this.finish({ detail: "the call could not be saved" }); return false; }
    if (this.finishing || !this.childHere) { this.finalDropped(turn); return false; }
    const generation = this.generation;
    if (stage()) {
      try { await this.stageBoard(turn, !overlap); }
      catch (error) { this.boardFailed(error); if (generation === this.generation && this.childHere) void this.finish({ detail: "the speech board could not be staged" }); return false; }
    }
    if (this.finishing || generation !== this.generation || !this.childHere) { this.finalDropped(turn); return false; }
    this.options.notify({ revision: this.call.revision, segment: this.segment, ended: false });
    this.expectNumber(turn);
    this.scheduleLimit();
    if (turn.ended) {
      // Do not await inside llmNode: the speech handle needs its text before it can finish.
      void (async () => {
        try { await handle?.waitForPlayout(); await this.guidance?.over; await this.options.board?.settled(); }
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
      for (const t of [this.tickTimer, this.graceTimer, this.limitTimer, this.leaseTimer, this.meterTimer]) if (t !== null) this.timers.clear(t);
      this.tickTimer = this.graceTimer = this.limitTimer = this.leaseTimer = this.meterTimer = null;
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

  /**
   * The child never came to a worker that waited for them: this worker stops with no change to the call, which stays
   * live for its ticket. The session's close must not end it.
   */
  async standDown() {
    if (this.finishing || this.childHere) return;
    this.finishing = Promise.resolve();
    await this.session.close().catch(() => {});
  }
}
