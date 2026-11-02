// Maya in a voice call (#326): LiveKit Agents for Node around Maya's controller, through the text adapter. The voice
// agent is a thin layer: speech-to-text turns the child's speech into child turns for the call (src/lib/maya-call.ts,
// `openVoice`), and the voice says exactly the words the call's session accepted. LiveKit never asks a model itself:
// the agent's `llmNode` hands each finished turn to the call and returns only what it said (as the text mode does,
// src/lib/maya-livekit-text.ts). The placeholder LLM below exists because AgentSession wants one, and is never asked.
//
// VoiceCallRun owns the call's life around the speech: the opening when the child is there, the ticks the session asks
// for silence (counted from the end of speech), an independent deadline, the connection leases, the
// hang-up, a dropped connection (the call ends if the child is not back within RECONNECT_GRACE_MS), and the end. It
// takes its clock and timers, so a test drives it without waiting.
import { ReadableStream, TransformStream } from "node:stream/web";
import { stt, voice, type llm, type tts } from "@livekit/agents";
import type { AudioFrame } from "@livekit/rtc-node";
import type { FinishOptions } from "@/lib/maya-text";
import type { VoiceCall, VoiceTurn } from "@/lib/maya-call";
import { limitsOf } from "@/lib/maya";
import { CONNECTION_RENEW_MS, childTurnFrom, nextTickAt, RECONNECT_GRACE_MS, type Heard } from "@/lib/maya-voice";

const userTexts = (ctx: llm.ChatContext) =>
  ctx.items.flatMap((i) => (i.type === "message" && i.role === "user" ? [i.textContent ?? ""] : []));

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

  /** Opens the call (the first reply), then answers each finished child turn with what the call's session said. */
  override async llmNode(...[chatCtx]: Parameters<voice.Agent["llmNode"]>): ReturnType<voice.Agent["llmNode"]> {
    const users = userTexts(chatCtx);
    const fresh = users.slice(this.seen).filter((t) => t.trim());
    this.seen = users.length;
    const said: string[] = [];
    const take = async (turn: VoiceTurn) => {
      if (await this.onTurn(turn)) said.push(...turn.say);
    };
    if (!this.opened) {
      this.opened = true;
      await take(await this.call.start());
    }
    if (fresh.length > 0) {
      const heard = childTurnFrom(this.finals.splice(0)) ?? { text: fresh.join(" "), uncertain: false, alternatives: [] };
      await take(await this.call.child(heard.text, heard.uncertain ? { uncertain: true, alternatives: heard.alternatives } : undefined));
    }
    const text = said.join(" ");
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
  readonly agent: MayaVoiceAgent;
  /** Immutable revision claimed when this worker opened the call. */
  readonly segment: number;

  constructor(
    private readonly session: voice.AgentSession,
    private readonly call: VoiceCall,
    private readonly options: {
      timers?: Timers;
      notify(update: CallUpdate): void;
      closed?(): Promise<void>;
    },
  ) {
    this.segment = call.revision;
    this.agent = new MayaVoiceAgent(call, turn => this.after(turn));
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
        const speech = final.say.length ? this.session.say(final.say.join(" "), { addToChatCtx: true }) : null;
        await this.after(final, speech);
      } catch { await this.finish({ detail: "the saved final speech failed" }); }
    } else if (this.call.session.startedAt === null) this.session.generateReply();
    else this.schedule();
  }

  async childLeft(how: "hang_up" | "dropped") {
    if (this.finishing) return;
    const generation = ++this.generation;
    this.childHere = false;
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
    try {
      const turn = await this.call.tick();
      if (this.call.lost) return this.finish({ detail: "the call could not be saved" });
      if (this.finishing) return;
      const speech = turn.say.length ? this.session.say(turn.say.join(" "), { addToChatCtx: true }) : null;
      await this.after(turn, speech);
    } catch { await this.finish({ detail: "the voice turn failed" }); }
  }

  private async after(turn: VoiceTurn, handle = this.speech): Promise<boolean> {
    await this.call.settled();
    if (this.call.lost) { void this.finish({ detail: "the call could not be saved" }); return false; }
    if (this.finishing) return false;
    this.options.notify({ revision: this.call.revision, segment: this.segment, ended: false });
    this.scheduleLimit();
    if (turn.ended) {
      // Do not await inside llmNode: the speech handle needs its text before it can finish.
      void (async () => {
        try { await handle?.waitForPlayout(); }
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
    // Set the promise before calling close, whose event can call finish again.
    this.finishing ??= Promise.resolve().then(async () => {
      for (const t of [this.tickTimer, this.graceTimer, this.limitTimer, this.leaseTimer]) if (t !== null) this.timers.clear(t);
      this.tickTimer = this.graceTimer = this.limitTimer = this.leaseTimer = null;
      // Stop media immediately for a deadline, hang-up, failure or lost ownership.
      const closing = this.session.close().catch(() => {});
      let failed = this.call.lost;
      try {
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
