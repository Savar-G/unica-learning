// One #1139 baseline call per job, on a self-hosted LiveKit server only (docs/maya-baseline.md). It runs the worker's
// VoiceCallRun with real speech and model providers and in-memory call stores. It registers as `maya-baseline`, never as
// `maya-voice`, and reads no database. Its rows go to the synthetic child over RPC when the call closes.
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { defineAgent, voice, type JobContext } from "@livekit/agents";
import { configureAiUsage, flushAiUsage } from "@/lib/ai-usage";
import { boardRpcTransport } from "@/lib/board-rpc";
import { createBoardSender } from "@/lib/board-protocol";
import { createBoardSpeech, type CueMeasurement, type CueSource } from "@/lib/board-speech";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { baselineTeaching, requestEffort, type BaselineGroup, type BaselineReceipt } from "@/lib/maya-baseline";
import { requestContext } from "@/lib/maya-request-trace";
import { mayaCalls, type CallModelOptions } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { callMathReviewer, callModel, callReviewer } from "@/lib/maya-call-seams";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createSpendLedger, spendConfig, type SpendCall } from "@/lib/maya-spend";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { mayaCallSpend } from "@/lib/maya-spend-server";
import { callKeyterms, childIdentity, HANG_UP_BOARD_DRAIN, turnSilences, voiceProviders } from "@/lib/maya-voice";
import { VoiceCallRun, voiceSession } from "../../worker/maya-voice/src/agent";
import { startVoiceBaselineProfile, voiceBaselineTurn } from "../../worker/maya-voice/src/baseline";
import { waitForChild } from "../../worker/maya-voice/src/child-wait";
import { voiceOpening } from "../../worker/maya-voice/src/opening";
import { makeProviders } from "../../worker/maya-voice/src/providers";
import { CallTelemetry, markedFetch, setTelemetry, telemetry } from "../../worker/maya-voice/src/telemetry";
import type { VoiceTurnSample } from "../../worker/maya-voice/src/turn-timing";
import { configureDelivery } from "../../worker/maya-voice/src/voice-delivery";

export const BASELINE_AGENT = "maya-baseline";
export const REPORT_RPC = "maya.baseline.report";

/** The provider label of every row of a run: the call's model and both speech providers, as the worker resolves them. */
export function baselineProvider(env: Readonly<Record<string, string | undefined>>): string {
  const providers = voiceProviders(env);
  if (!providers.ok) throw Error(providers.problems.join("; "));
  return `${callModel(null, env)?.id ?? "default"}+${providers.ids.speechToText}+${providers.ids.voice}`;
}

/**
 * Local-only AI usage for one job: no hosted write, even with a Supabase key in the environment. Each receipt gets the
 * request's role and the effort its body asked for. Both are read in the request's own context: the metered client
 * opens a new context for each request, so the fetch and the receipt of one request share it.
 */
function localUsage(receipts: string) {
  const efforts = new WeakMap<object, string>();
  const inner = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    efforts.set(requestContext(), requestEffort(init?.body));
    return inner(input, init);
  };
  configureAiUsage({ local: row => {
    const ctx = requestContext();
    const receipt: BaselineReceipt & typeof row = { ...row, role: ctx.source ?? "unlabelled", effort: efforts.get(ctx) ?? "unknown" };
    appendFileSync(receipts, JSON.stringify(receipt) + "\n", { mode: 0o600 });
  } });
}

export interface BaselineJob {
  callId: string;
  parentId: string;
  childId: string;
  teaching: "existing" | "checked";
  /** Date.now() just before the dispatch request. Same machine clock as the job. */
  dispatchAt: number;
  receipts: string;
  concurrency: number;
  network: string;
  device: string;
}

/** One released board cue observed during a turn: whether it fired on a word timestamp or sentence fallback. */
export interface ReportedCue {
  batchId: string;
  source: CueSource;
  state: string;
  audioMs: number;
  acknowledgementMs: number;
}

/** One child turn transcript received by the controller. */
export interface ReportedChildTranscript {
  at: number;
  text: string;
  uncertain: boolean;
  alternatives: string[];
}

/** One playout of the room's audio output on the machine clock, from its start event to its finish event. */
export interface Playout { start: number; end: number | null }
/** Enough for a call's fillers and answers, and well under the RPC payload limit. */
const MAX_PLAYOUTS = 300;

/** What the child receives at close: one message per RPC, each well under the RPC payload limit. */
export type ReportMessage =
  | { kind: "turn"; row: ReturnType<typeof voiceBaselineTurn>; t0: number | null; turnStart: number | null; answerPlayback: number | null; ackPlayback: number | null; ttsChars: number; cues: ReportedCue[]; childText: string | null }
  | { kind: "call"; workerQueueMs: number; profile: Record<string, unknown> | null; discardedPreparation: unknown; speechUsd: { stt: number; tts: number }; playouts: Playout[]; ttsChars: number; openingTtsChars: number; models: { stt: string; tts: string }; childTranscripts: ReportedChildTranscript[] }
  | { kind: "done" };

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const entryAt = Date.now();
    // Never write to hosted Supabase or override the baseline agent name from a caller shell.
    for (const key of Object.keys(process.env)) if (key.startsWith("SUPABASE_")) delete process.env[key];
    delete process.env.LIVEKIT_AGENT_NAME_OVERRIDE;
    const job = JSON.parse(ctx.job.metadata) as BaselineJob;
    localUsage(job.receipts);
    globalThis.fetch = markedFetch(globalThis.fetch);
    setTelemetry(new CallTelemetry({ callId: job.callId, scopeId: ctx.job.id }));
    configureDelivery({ callId: job.callId });
    const providers = voiceProviders(process.env);
    if (!providers.ok) throw Error(providers.problems.join("; "));
    const checked = job.teaching === "checked";
    const clock = Date.now;
    const store = memoryCallStore({ clock, testFamilies: [job.parentId] });
    // The production metered clients and spend seams over an in-memory ledger: request roles and speech charges match
    // the worker, and nothing reaches the database.
    const spendStore = memorySpendStore({ clock });
    const config = spendConfig(process.env);
    const ledger = createSpendLedger({ store: spendStore, config, clock, zone: async () => "America/Vancouver" });
    const meter = (call: SpendCall | undefined, how?: CallModelOptions) => (call ? { ledger, call, newId: randomUUID, ...how } : undefined);
    const calls = mayaCalls({
      store, connections: memoryConnectionLog(store, clock), history: memoryWordingHistoryStore(),
      events: learningEvents(memoryLearningEventStore({ children: [{ id: job.childId, parentId: job.parentId }] })),
      rebuild: async () => true, spend: mayaCallSpend(ledger, randomUUID),
      model: (id, call, how) => callModel(id, process.env, meter(call, how)), reviewer: (id, call) => callReviewer(id, process.env, meter(call)),
      mathReviewer: (id, call) => callMathReviewer(id, process.env, meter(call)),
      isTestFamily: async () => true, canCallVoice: async () => true, checkedExchange: checked, checkedRoutine: checked,
      alerts: { send: async () => {}, list: async () => [] }, clock, newId: randomUUID, seed: () => 42,
    });
    const pkg = { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook" as const, workbookId: randomUUID(), page: 1, question: 1 } };
    const started = await calls.startVoice({ id: job.callId, kind: "admin_test", parentId: job.parentId, childId: job.childId, childName: null, startedBy: job.parentId, package: pkg });
    if (!started.ok) throw Error(started.error);
    const opened = await calls.openVoice(job.callId, providers.ids, null);
    if (!opened.ok) throw Error(opened.error);
    const spokenEvents: { at: number; chars: number }[] = [];
    const origSpoken = opened.call.spoken.bind(opened.call);
    opened.call.spoken = (said: string) => {
      spokenEvents.push({ at: clock(), chars: said.length });
      return origSpoken(said);
    };
    const childTranscripts: ReportedChildTranscript[] = [];
    const origChild = opened.call.child.bind(opened.call);
    opened.call.child = (text, options, say) => {
      childTranscripts.push({ at: clock(), text, uncertain: Boolean(options?.uncertain), alternatives: [...(options?.alternatives ?? [])] });
      return origChild(text, options, say);
    };
    const made = await makeProviders(providers, { keyterms: callKeyterms(opened.call.session.package) });
    const { tuning } = providers;
    const session = voiceSession(made, made.fake ? {} : { turn: tuning });
    await ctx.connect();
    const identity = childIdentity(job.childId);
    const local = ctx.room.localParticipant!;
    const samples: CueMeasurement[] = [];
    const sender = createBoardSender({ sessionId: job.callId, senderId: randomUUID(), snapshot: opened.call.boardSnapshot, transport: boardRpcTransport(local, identity, randomUUID) });
    const board = createBoardSpeech({ sender, now: clock, observe: s => opened.call.observeBoard(s), measure: s => samples.push(s) });
    const group: BaselineGroup = {
      evidence: made.fake ? "simulated" : "worker", mode: "voice", turnType: "unknown", provider: baselineProvider(process.env),
      teaching: baselineTeaching(checked, checked), device: job.device, network: job.network, concurrency: job.concurrency,
    };
    // The ledger's speech estimates (configured rates, CAD micro-units) in USD.
    const speechUsd = () => {
      const usd = (what: string) => spendStore.rows().filter(r => r.what === what).reduce((n, r) => n + (r.cost ?? 0), 0) / 1e6 / config.usdToCad;
      return { stt: Math.round(usd("speech_to_text") * 1e6) / 1e6, tts: Math.round(usd("voice") * 1e6) / 1e6 };
    };
    const turns: VoiceTurnSample[] = [];
    const playouts: Playout[] = [];
    const owners = new Map<string, { turnId: string; batchIds: readonly string[] }>();
    let profile: ReturnType<typeof startVoiceBaselineProfile> | null = null;
    const send = (message: ReportMessage) => local.performRpc({ destinationIdentity: identity, method: REPORT_RPC, payload: JSON.stringify(message), responseTimeout: 10_000 });
    const encoder = new TextEncoder();
    const patience = made.patience;
    const run = new VoiceCallRun(session, opened.call, {
      board, ...(voiceOpening(opened.call.session) ? { opening: voiceOpening(opened.call.session)! } : {}),
      notify: update => { void local.publishData(encoder.encode(JSON.stringify(update)), { reliable: true, topic: "maya.call", destination_identities: [identity] }).catch(() => {}); },
      ...(made.fake ? {} : { numberContinueMs: tuning.numberContinueMs, dropSilentPeakDbfs: tuning.dropSilentPeakDbfs, detectorMinSilenceMs: tuning.detectorMinSilenceMs }),
      ...(patience ? { patience: { ...turnSilences(tuning), set: limits => patience.setSilence(limits) } } : {}),
      measureTurn: sample => { turns.push(sample); },
      measureBoardPlan: (utteranceId, turnId, batchIds) => { owners.set(utteranceId, { turnId, batchIds }); },
      closed: async () => {
        try {
          // Read request marks at close: a review or repair can finish after playout starts.
          const clocks = turns.map(sample => telemetry().turnClock(sample.turnId));
          const turnStarts = clocks.map(tc => tc && typeof tc.turnStart === "number" ? tc.t0 + tc.turnStart : tc?.t0 ?? null);
          const firstTurnStart = turnStarts.find((t): t is number => t !== null) ?? Infinity;
          const openingTtsChars = spokenEvents.filter(e => e.at < firstTurnStart).reduce((n, e) => n + e.chars, 0);
          const totalTtsChars = spokenEvents.reduce((n, e) => n + e.chars, 0);
          for (let i = 0; i < turns.length; i++) {
            const sample = turns[i];
            const turnClock = clocks[i];
            const cues = samples.filter(c => { const o = owners.get(c.utteranceId); return !!o && o.turnId === sample.turnId && o.batchIds.includes(c.batchId); });
            const at = (kind: "answer" | "ack") => {
              const u = turnClock?.utterances.find(x => x.kind === kind && typeof x.playbackStarted === "number");
              return u && turnClock ? turnClock.t0 + (u.playbackStarted as number) : null;
            };
            const startAt = turnStarts[i];
            const nextStartAt = turnStarts.slice(i + 1).find((t): t is number => t !== null) ?? Infinity;
            const ttsChars = startAt === null ? 0 : spokenEvents.filter(e => e.at >= startAt && e.at < nextStartAt).reduce((n, e) => n + e.chars, 0);
            const matchedChild = startAt === null ? null : childTranscripts.find(c => c.at >= startAt - 500 && c.at < nextStartAt)?.text ?? null;
            await send({
              kind: "turn",
              row: voiceBaselineTurn(group, sample, turnClock, cues),
              t0: turnClock?.t0 ?? null,
              turnStart: startAt,
              answerPlayback: at("answer"),
              ackPlayback: at("ack"),
              ttsChars,
              cues: cues.map(c => ({ batchId: c.batchId, source: c.source, state: c.state, audioMs: c.audioMs, acknowledgementMs: c.acknowledgementMs })),
              childText: matchedChild,
            });
          }
          const sttModel = providers.speechToText.provider === "inference" ? providers.speechToText.model : providers.ids.speechToText;
          const ttsModel = providers.voice.provider === "inference" ? providers.voice.model : providers.ids.voice;
          await send({
            kind: "call",
            workerQueueMs: entryAt - job.dispatchAt,
            profile: profile ? profile() : null,
            discardedPreparation: telemetry().discardedPreparationSummary(),
            speechUsd: speechUsd(),
            playouts: playouts.slice(-MAX_PLAYOUTS),
            ttsChars: totalTtsChars,
            openingTtsChars,
            models: { stt: sttModel, tts: ttsModel },
            childTranscripts,
          });
          await send({ kind: "done" });
        } finally {
          await flushAiUsage();
          ctx.shutdown("call ended");
        }
      },
    });
    await local.setAttributes({ "maya.speech": "live", "maya.segment": String(run.segment) });
    local.registerRpcMethod("maya.hang_up", async data => {
      if (data.callerIdentity !== identity) throw Error("not this call's child");
      void run.hangUp();
      return data.payload === HANG_UP_BOARD_DRAIN ? HANG_UP_BOARD_DRAIN : "ok";
    });
    if (made.fakeSpeech) {
      const speech = made.fakeSpeech;
      local.registerRpcMethod("maya.fake.say", async data => speech.say(String(JSON.parse(data.payload).text)) ? "heard" : "not listening");
    }
    await session.start({ agent: run.agent, room: ctx.room, inputOptions: { participantIdentity: identity, textEnabled: false, closeOnDisconnect: false }, record: false });
    run.attachBoardAudio();
    run.attachTurnTiming();
    // The same output events as the turn timing: the child matches received sound to these playouts.
    const output = session.output.audio;
    output?.on(voice.AudioOutput.EVENT_PLAYBACK_STARTED, () => { playouts.push({ start: Date.now(), end: null }); });
    output?.on(voice.AudioOutput.EVENT_PLAYBACK_FINISHED, () => { const last = playouts.at(-1); if (last && last.end === null) last.end = Date.now(); });
    made.tts.prewarm();
    const waited = await waitForChild(ctx.room, { id: job.callId, parentId: job.parentId, childId: job.childId, mode: "voice", status: "live" });
    if (!waited.child) { await run.standDown(); return ctx.shutdown(waited.why); }
    profile = startVoiceBaselineProfile();
    await Promise.all([run.agentJoined(), run.childJoined()]);
  },
});
