// Maya in a voice call (#326): LiveKit Agents for Node around Maya's controller, through the text adapter. The voice
// agent is a thin layer: speech-to-text turns the child's speech into child turns for the call (src/lib/maya-call.ts,
// `openVoice`), and the voice says exactly the words the call's session accepted. LiveKit never asks a model itself:
// the agent's `llmNode` hands each finished turn to the call and returns only what it said (as the text mode does,
// src/lib/maya-livekit-text.ts). The placeholder LLM below exists because AgentSession wants one, and is never asked.
//
// VoiceCallRun owns the call's life around the speech: the opening when the child is there, the ticks the session asks
// for (pauses and the 9- and 10-minute limits, counted from the end of Maya's speech), the connection events, the
// hang-up, a dropped connection (the call ends if the child is not back within RECONNECT_GRACE_MS), and the end. It
// takes its clock and timers, so a test drives it without waiting.
import { ReadableStream, TransformStream } from "node:stream/web";
import { stt, voice, type llm, type tts } from "@livekit/agents";
import type { AudioFrame } from "@livekit/rtc-node";
import type { FinishOptions } from "@/lib/maya-text";
import type { VoiceCall, VoiceTurn } from "@/lib/maya-call";
import { childTurnFrom, nextTickAt, RECONNECT_GRACE_MS, type Heard } from "@/lib/maya-voice";

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
    private readonly onTurn: (turn: VoiceTurn) => void,
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
    const take = (turn: VoiceTurn) => {
      said.push(...turn.say);
      this.onTurn(turn);
    };
    if (!this.opened) {
      this.opened = true;
      take(await this.call.start());
    }
    if (fresh.length > 0) {
      const heard = childTurnFrom(this.finals.splice(0)) ?? { text: fresh.join(" "), uncertain: false, alternatives: [] };
      take(await this.call.child(heard.text, heard.uncertain ? { uncertain: true, alternatives: heard.alternatives } : undefined));
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
  ended: boolean;
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
  private finishing: Promise<void> | null = null;
  private childHere = false;
  readonly agent: MayaVoiceAgent;

  constructor(
    private readonly session: voice.AgentSession,
    private readonly call: VoiceCall,
    private readonly options: {
      timers?: Timers;
      /** Tells the child's screen; never throws. */
      notify(update: CallUpdate): void;
      /** After the call is stored: close the room and the job. */
      closed?(): Promise<void>;
    },
  ) {
    this.agent = new MayaVoiceAgent(call, (turn) => this.after(turn));
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      if (ev.oldState === "speaking" && ev.newState !== "speaking") {
        this.speechEndedAt = this.timers.now();
        this.schedule();
      }
    });
  }

  private get timers() {
    return this.options.timers ?? realTimers;
  }

  /** Maya has joined: stores it. Call before the child is linked. */
  async agentJoined() {
    await this.call.connection("agent_joined");
  }

  /** The child joined, or came back after a drop. The first time, Maya opens the call. */
  async childJoined() {
    if (this.finishing || this.childHere) return;
    this.childHere = true;
    if (this.graceTimer !== null) {
      this.timers.clear(this.graceTimer);
      this.graceTimer = null;
    }
    await this.call.connection("child_joined");
    if (this.call.session.startedAt === null) this.session.generateReply();
  }

  /** The child's connection ended: a hang-up ends the call now; a drop ends it unless they are back in time. */
  async childLeft(how: "hang_up" | "dropped") {
    if (this.finishing) return;
    if (this.childHere) {
      this.childHere = false;
      await this.call.connection("child_left");
    }
    if (how === "hang_up") return this.finish({ reason: "child_stopped" });
    if (this.graceTimer === null) {
      this.graceTimer = this.timers.set(RECONNECT_GRACE_MS, () => void this.finish({ detail: "the child's connection dropped and did not come back" }));
    }
  }

  /** The child pressed hang up. */
  hangUp() {
    return this.finish({ reason: "child_stopped" });
  }

  /** Gives the session its tick now, if it can act on one: Maya says what it brings. */
  async tick() {
    this.tickTimer = null;
    if (this.finishing || this.call.ended) return;
    const busy = this.session.agentState === "speaking" || this.session.agentState === "thinking" || this.session.userState === "speaking";
    if (busy) {
      this.tickTimer = this.timers.set(1000, () => void this.tick());
      return;
    }
    this.lastTickAt = this.timers.now();
    const turn = await this.call.tick();
    if (turn.say.length) this.session.say(turn.say.join(" "), { addToChatCtx: true });
    this.after(turn);
  }

  /** After each of Maya's turns: tell the screen once the turn is saved, plan the next tick, and end after a last turn. */
  private after(turn: VoiceTurn) {
    void this.call.settled().then(() => this.options.notify({ revision: this.call.revision, ended: false }));
    if (turn.ended) {
      void this.endAfterSpeech();
      return;
    }
    this.schedule();
  }

  private schedule() {
    if (this.tickTimer !== null) this.timers.clear(this.tickTimer);
    this.tickTimer = null;
    if (this.finishing) return;
    const at = nextTickAt(this.call.session, { speechEndedAt: this.speechEndedAt, lastTickAt: this.lastTickAt });
    if (at !== null) this.tickTimer = this.timers.set(at - this.timers.now(), () => void this.tick());
  }

  /** The session ended the call (solved, time, safety): let Maya finish speaking, then close. */
  private async endAfterSpeech() {
    for (let i = 0; i < 120 && this.session.agentState !== "speaking"; i++) await new Promise((r) => setTimeout(r, 50));
    while (this.session.agentState === "speaking") await new Promise((r) => setTimeout(r, 100));
    await this.finish({ reason: "child_stopped" });
  }

  /** Ends and stores the call (once), tells the screen, then closes. */
  finish(how: FinishOptions): Promise<void> {
    this.finishing ??= (async () => {
      for (const t of [this.tickTimer, this.graceTimer]) if (t !== null) this.timers.clear(t);
      this.tickTimer = this.graceTimer = null;
      await this.call.end(how);
      if (this.childHere) await this.call.connection("child_left");
      await this.call.connection("agent_left");
      this.options.notify({ revision: this.call.revision, ended: true });
      await this.session.close().catch(() => {});
      await this.options.closed?.();
    })();
    return this.finishing;
  }

  get done() {
    return this.finishing;
  }
}
