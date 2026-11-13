// Maya's voice worker (#326): a LiveKit Agents for Node worker, outside the Vercel build (docs/maya-voice.md). LiveKit
// sends it a job when a child joins a voice call's room with a token from the web server (src/lib/maya-voice-token.ts,
// agent name maya-voice, the call id in the job's metadata). For each job it:
//
// 1. checks that the room is the call's own and the call is a live voice call;
// 2. waits for the call's own child (checkJoiner: identity and the token's family attributes) and ignores anyone else;
// 3. opens the call (src/lib/maya-call.ts `openVoice`), which records the speech-to-text and voice ids on it;
// 4. runs Maya there with the configured speech-to-text and voice (src/lib/maya-voice.ts `voiceProviders`): the child's
//    microphone only, no typed chat, no recording; stores when the child and Maya join and leave;
// 5. ends and stores the call on a hang-up, at the session's own end, when the child's connection does not come back,
//    or when the worker stops.
//
// The child's screen calls two RPC methods on Maya: "maya.hang_up", and with the fake speech-to-text "maya.fake.say"
// ({ text }: what the child "says"). Maya tells the screen on the "maya.call" data topic ({ revision, ended }) after
// each saved turn; the screen reads the call from the web server then.
import { randomUUID } from "node:crypto";
import { createBoardSender } from "@/lib/board-protocol";
import { boardRpcTransport } from "@/lib/board-rpc";
import { createBoardSpeech, cueReport, type CueMeasurement } from "@/lib/board-speech";
import { fileURLToPath } from "node:url";
import { cli, defineAgent, ServerOptions, voice, type JobContext } from "@livekit/agents";
import { DisconnectReason, RoomEvent, RpcError, type RemoteParticipant, type Room } from "@livekit/rtc-node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { callSeams } from "@/lib/maya-call-seams";
import { mayaCalls } from "@/lib/maya-call";
import { codeOpening } from "@/lib/maya-voice-opening";
import { mayaCallStore } from "@/lib/maya-call-store";
import { asksWordTimings, callKeyterms, callOfRoom, checkJoiner, GREETING_TEXT, JOIN_WAIT_MS, turnSilences, VOICE_AGENT_NAME, voiceProviders, type TurnSilence, type VoiceCallFacts } from "@/lib/maya-voice";
import { VoiceCallRun, voiceSession, type CallUpdate } from "./agent";
import { voiceTurnReport, type VoiceTurnSample } from "./turn-timing";
import { makeProviders } from "./providers";
import { referenceJob, referenceRoomName } from "@/lib/maya-workbook-speech";
import { runWorkbookReference } from "./workbook-reference";

const log = (...a: unknown[]) => console.log("[maya voice]", ...a);

/** The worker's database client: the secret key of the worker's own Supabase key (docs/maya-voice.md). */
function database() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The call's child once they are in the room (any other joiner is ignored), or null after JOIN_WAIT_MS. */
function waitForChild(room: Room, call: VoiceCallFacts): Promise<RemoteParticipant | null> {
  const fits = (p: RemoteParticipant) => checkJoiner({ room: room.name ?? "", call, identity: p.identity, attributes: p.attributes }).ok;
  const already = [...room.remoteParticipants.values()].find(fits);
  if (already) return Promise.resolve(already);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      room.off(RoomEvent.ParticipantConnected, on);
      resolve(null);
    }, JOIN_WAIT_MS);
    const on = (p: RemoteParticipant) => {
      if (!fits(p)) return log("ignored a joiner that is not the call's child", call.id);
      clearTimeout(timer);
      room.off(RoomEvent.ParticipantConnected, on);
      resolve(p);
    };
    room.on(RoomEvent.ParticipantConnected, on);
  });
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const jobAt = Date.now();
    let selection = null;
    try { selection = referenceJob(JSON.parse(ctx.job.metadata || "{}").reference); } catch { /* Not a reference job. */ }
    if (selection) {
      if (ctx.job.room?.name !== referenceRoomName(selection.id)) return ctx.shutdown("wrong reference room");
      return runWorkbookReference(ctx, selection, database());
    }
    const callId = (() => {
      try {
        return (JSON.parse(ctx.job.metadata || "{}") as { callId?: unknown }).callId;
      } catch {
        return null;
      }
    })();
    const roomName = ctx.job.room?.name ?? "";
    if (typeof callId !== "string" || callOfRoom(roomName) !== callId) {
      log("refused a job whose room is not its call's");
      return ctx.shutdown("not a call room");
    }
    const providers = voiceProviders(process.env);
    if (!providers.ok) {
      log("the speech-to-text or voice is not set up:", providers.problems.join("; "));
      return ctx.shutdown("providers not set up");
    }
    const db = database();
    const record = await mayaCallStore(db).get(callId);
    if (!record || record.mode !== "voice" || record.status !== "live") {
      log("no live voice call", callId);
      return ctx.shutdown("no live voice call");
    }
    const facts: VoiceCallFacts = { id: record.id, parentId: record.parentId, childId: record.childId, mode: record.mode, status: record.status };

    await ctx.connect();
    const child = await waitForChild(ctx.room, facts);
    const childAt = Date.now();
    const marks: Record<string, number> = {};
    const mark = (name: string) => { marks[name] = Date.now() - childAt; };
    if (!child) {
      log("the child did not join", callId);
      return ctx.shutdown("the child did not join");
    }
    // The opening needs no model call: code answers that one request (src/lib/maya-voice-opening.ts).
    const seams = callSeams(db);
    const calls = mayaCalls({ ...seams, model: (...args) => { const model = seams.model(...args); return model ? codeOpening(model) : model; } });
    const opened = await calls.openVoice(callId, providers.ids, null);
    if (!opened.ok) {
      log("the call could not be opened", callId, opened.error);
      return ctx.shutdown("call not opened");
    }
    mark("opened");
    // The call's question is known now: its answer and its likely wrong answers go to the speech-to-text as keyterms
    // (numbers only, never the question's text or a name).
    const made = await makeProviders(providers, { keyterms: callKeyterms(opened.call.session.package) });
    // The turn delay and interruption settings are for real providers. The fakes keep LiveKit's defaults, as the tests do.
    mark("providers");
    const { tuning } = providers;
    const session = voiceSession(made, made.fake ? {} : { turn: tuning });
    const patience = made.patience;
    // The opening's speed: the child in the room (or the job, when the child was there first) to Maya's first sound.
    let firstSound = false;
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, ev => {
      if (firstSound || ev.newState !== "speaking") return;
      firstSound = true;
      log("opening first sound", { callId, sinceChildMs: Date.now() - childAt, sinceJobMs: Date.now() - jobAt, marks });
    });
    const encoder = new TextEncoder();
    const notify = (update: CallUpdate) => {
      ctx.room.localParticipant?.publishData(encoder.encode(JSON.stringify(update)), { reliable: true, topic: "maya.call", destination_identities: [child.identity] }).catch(() => {});
    };
    const sender = createBoardSender({ sessionId: callId, senderId: randomUUID(), snapshot: opened.call.boardSnapshot, transport: boardRpcTransport(ctx.room.localParticipant!, child.identity, randomUUID) });
    const samples: CueMeasurement[] = [];
    const board = createBoardSpeech({ sender, now: () => Date.now(), observe: snapshot => opened.call.observeBoard(snapshot), measure: sample => {
      samples.push(sample);
      log("board cue", { callId, fakeAudio: made.tts.provider === "fake", ...sample });
    } });
    const turnSamples: VoiceTurnSample[] = [];
    const ackLimit = Number(process.env.MAYA_ACK_LIMIT_MS);
    const run = new VoiceCallRun(session, opened.call, { board, notify, greeting: GREETING_TEXT,
      ...(made.fake ? {} : { numberContinueMs: tuning.numberContinueMs }),
      ...(patience ? { patience: { ...turnSilences(tuning), set: (limits: TurnSilence) => patience.setSilence(limits) } } : {}),
      ...(process.env.MAYA_ACK_LIMIT_MS?.trim() && Number.isFinite(ackLimit) && ackLimit >= 0 ? { ackLimitMs: ackLimit } : {}),
      measureTurn: sample => {
        turnSamples.push(sample);
        log("voice turn", { callId, fakeProviders: { speechToText: made.stt.provider === "fake", voice: made.tts.provider === "fake" }, ...sample });
      },
      closed: async () => {
        log("board cue report", { callId, fakeAudio: made.tts.provider === "fake", groups: cueReport(samples) });
        log("voice turn report", { callId, fakeProviders: { speechToText: made.stt.provider === "fake", voice: made.tts.provider === "fake" }, ...voiceTurnReport(turnSamples) });
        await ctx.shutdown("call ended");
      } });
    ctx.addShutdownCallback(() => run.finish({ detail: "the voice worker stopped" }));

    const local = ctx.room.localParticipant!;
    // What the child's screen shows: whether to offer the typed stand-in for speech.
    await local.setAttributes({ "maya.speech": made.fakeSpeech ? "fake" : "live", "maya.segment": String(run.segment) });
    local.registerRpcMethod("maya.hang_up", async (data) => {
      if (data.callerIdentity !== child.identity) throw new RpcError(1403, "not this call's child");
      void run.hangUp();
      return "ok";
    });
    if (made.fakeSpeech) {
      const speech = made.fakeSpeech;
      local.registerRpcMethod("maya.fake.say", async (data) => {
        if (data.callerIdentity !== child.identity) throw new RpcError(1403, "not this call's child");
        const text = (JSON.parse(data.payload || "{}") as { text?: unknown }).text;
        if (typeof text !== "string" || !text.trim() || text.length > 500) throw new RpcError(1400, "say 1 to 500 characters");
        return speech.say(text.trim()) ? "heard" : "not listening";
      });
    }
    ctx.room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      if (p.identity !== child.identity) return;
      void run.childLeft(p.disconnectReason === DisconnectReason.CLIENT_INITIATED ? "hang_up" : "dropped");
    });
    ctx.room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
      if (checkJoiner({ room: roomName, call: facts, identity: p.identity, attributes: p.attributes }).ok) void run.childJoined();
    });

    mark("setup");
    await run.agentJoined();
    mark("agentJoined");
    if (run.done) { await run.done; return; }
    await session.start({
      agent: run.agent,
      room: ctx.room,
      // The call's child only, by microphone: no typed chat, no video, and the call (not LiveKit) decides when it ends.
      inputOptions: { participantIdentity: child.identity, textEnabled: false, closeOnDisconnect: false },
      // Disable session recording. Direct-provider retention needs separate verified settings (docs/maya-voice.md).
      record: false,
    });
    mark("sessionStarted");
    run.attachBoardAudio();
    run.attachTurnTiming();
    await run.childJoined();
    mark("childJoined");
    // Word timings are asked for, not known to arrive: the "board cue" lines show `word` or `sentence` for each batch.
    log("call running", callId, providers.ids.speechToText, providers.ids.voice, { wordTimings: asksWordTimings(providers.voice) ? "requested" : "sentence ends only", tuning: made.fake ? "fake providers: LiveKit defaults" : tuning });
  },
});

// Run as the worker (`node dist/main.mjs start` or `dev`); a job's process imports this file for the agent above.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.length > 2) {
  // MAYA_VOICE_LOAD_LIMIT (0 to 1): the machine load above which the worker takes no new call. LiveKit's default
  // otherwise; a busy laptop may need 1 to take calls in local runs.
  const limit = Number(process.env.MAYA_VOICE_LOAD_LIMIT);
  cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: VOICE_AGENT_NAME, ...(limit > 0 && limit <= 1 ? { loadThreshold: limit } : {}) }));
}
