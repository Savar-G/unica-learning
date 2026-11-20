// The real-audio interruption and cue check for #1147 (and the cue part of #329). It never registers a worker with
// LiveKit Cloud: the worker and a headless child join one room on a self-hosted `livekit-server` (your own port), and
// only the speech-to-text and voice go to LiveKit Inference (LIVEKIT_API_KEY / LIVEKIT_API_SECRET). The teaching
// model is the code's rule fake on the checked regrouping lesson, so no model provider is called and no family data
// is used.
//
// Each trial waits until Maya is audible at the child, then plays a recorded clip into the child's microphone track:
// - intentional: a full request ("Can you show me how to regroup?"). Measures the audible stop (interrupt-measure.ts),
//   and whether the child's words reached the call as a turn (lost speech).
// - incidental: "mm hm", "okay", a 150 ms noise burst, or a request at -26 dB. Counts a false stop when the worker's
//   output paused or cleared, or Maya went quiet for 700 ms, within 2 s of the sound.
// Board cues: each released batch's arrival at the child is compared with when its cue word reached the child, using
// the measured worker-to-child audio delay. `--cues sentence` asks the voice for no word times.
//
// `--trials 0` plays one request and lets the demonstration finish (cue timing only).
// `--rescore <file.json>` scores a saved run again.
// Usage: LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... MAYA_STT=inference MAYA_TTS=inference \
//   node scripts/maya-interrupt-proof.mjs --url ws://127.0.0.1:7380 --key devkey --secret <dev secret> \
//   --clips <dir with int*.wav, mmhm.wav, okay.wav> --out <file.json> [--cues word|sentence] [--trials 25]
//
// Not measured: a device speaker, echo cancellation, the browser's output buffer, paint, or a child's voice.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cpus, loadavg } from "node:os";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { setTimeout as pause } from "node:timers/promises";
import { initializeLogger, voice } from "@livekit/agents";
import {
  AudioFrame, AudioSource, AudioStream, LocalAudioTrack, Room, RoomEvent, TrackKind, TrackPublishOptions, TrackSource as RtcSource,
  type RemoteTrack,
} from "@livekit/rtc-node";
import { AccessToken } from "livekit-server-sdk";
import { TrackSource } from "@livekit/protocol";
import { BOARD_RPC, boardRpcHandler, boardRpcTransport } from "@/lib/board-rpc";
import { ATTR, childGrant, childIdentity, voiceProviders, voiceRoom } from "@/lib/maya-voice";
import { createBoardReceiver, createBoardSender } from "@/lib/board-protocol";
import { createBoardSpeech, type CueMeasurement } from "@/lib/board-speech";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { mayaCalls } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { ruleConversationalModel } from "@/lib/maya-model-fake";
import { VoiceCallRun, voiceSession } from "../worker/maya-voice/src/agent";
import { waitForChild } from "../worker/maya-voice/src/child-wait";
import { makeProviders } from "../worker/maya-voice/src/providers";
import { audibleStop, pace, readWav, scoreTrials, type Level, type TrialRow } from "../worker/maya-voice/src/interrupt-measure";

const { values: args } = parseArgs({ options: {
  url: { type: "string" }, key: { type: "string" }, secret: { type: "string" }, clips: { type: "string" }, out: { type: "string" },
  cues: { type: "string", default: "word" }, trials: { type: "string", default: "25" }, rescore: { type: "string" },
} });
if (!args.rescore && (!args.url || !args.key || !args.secret || !args.clips || !args.out)) throw new Error("see the usage in scripts/maya-interrupt-proof.ts");
if (/livekit\.cloud/.test(args.url ?? "")) throw new Error("use a self-hosted livekit-server room, not the Cloud project");
initializeLogger({ pretty: false, level: "warn" });

const INCIDENTAL = ["mmhm", "okay", "noise-burst", "request-at-minus-26-db", "hum"];
if (args.rescore) {
  const saved = JSON.parse(readFileSync(args.rescore, "utf8"));
  // Runs saved before 2026-11-20 kept no child turns with times: their turn match cannot be scored again.
  const result = scoreTrials(saved.rows.map((r: TrialRow) => ({ ...r, transcripts: r.transcripts ?? [], resumed: r.resumed ?? false })), saved.childTurns ?? [], 300, INCIDENTAL, saved.restartOnsets ?? []);
  const scored = { ...saved, ...result, lostSpeech: { ...result.lostSpeech, notATurn: saved.childTurns ? result.lostSpeech.notATurn : null } };
  writeFileSync(args.rescore, JSON.stringify(scored, null, 2));
  console.log(JSON.stringify({ stop: scored.stop, lostSpeech: scored.lostSpeech, falseStops: scored.falseStops, cueSummary: scored.cueSummary }, null, 1));
  process.exit(0);
}

// ---------- worker telemetry (the worker logs it as JSON lines) ----------
const telemetry: { ev: string; name?: string; id?: string; at: number }[] = [];
const log = console.log.bind(console);
console.log = (...parts: unknown[]) => {
  if (parts[0] === "[maya voice] telemetry" && typeof parts[1] === "string") { try { telemetry.push(JSON.parse(parts[1])); } catch { /* not JSON */ } return; }
  if (typeof parts[0] === "string" && parts[0].startsWith("[maya voice] telemetry ")) {
    try { telemetry.push(JSON.parse(parts[0].slice("[maya voice] telemetry ".length))); } catch { /* not JSON */ }
    return;
  }
  log(...parts);
};

// ---------- clips ----------
const RATE = 48_000;
const FRAME = 480;
const wav = (path: string) => readWav(readFileSync(path), RATE);
const db = (s: Int16Array) => {
  let sum = 0;
  for (const v of s) sum += v * v;
  return 10 * Math.log10(sum / Math.max(1, s.length) / 32768 ** 2 + 1e-12);
};
const intentional = readdirSync(args.clips!).filter(f => /^int\d+\.wav$/.test(f)).sort().map(f => ({ name: f, pcm: wav(join(args.clips!, f)) }));
const quietRequest = intentional[0].pcm.map(v => Math.round(v * 0.05));
let seed = 7;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const noise = Int16Array.from({ length: RATE * 0.15 }, () => Math.round((random() * 2 - 1) * 9000));
const incidental = [
  { name: INCIDENTAL[0], pcm: wav(join(args.clips!, "mmhm.wav")) }, { name: INCIDENTAL[1], pcm: wav(join(args.clips!, "okay.wav")) },
  { name: INCIDENTAL[2], pcm: noise }, { name: INCIDENTAL[3], pcm: Int16Array.from(quietRequest) },
  // A wordless hum: long enough to pause Maya, with no words for the speech-to-text (where a resume can happen).
  ...(existsSync(join(args.clips!, "hum.wav")) ? [{ name: INCIDENTAL[4], pcm: wav(join(args.clips!, "hum.wav")) }] : []),
];

// ---------- the call ----------
// CPU contention delays the local VAD and the worker loop, so each report records the machine load.
const loadAtStart = loadavg()[0];
const clock = Date.now;
const parentId = randomUUID();
const childId = randomUUID();
const store = memoryCallStore({ clock, testFamilies: [parentId] });
const speech = voiceProviders(process.env);
if (!speech.ok) throw new Error(speech.problems.join(", "));
if (args.cues === "sentence" && speech.voice.provider === "inference") {
  (speech.voice as { modelOptions: Record<string, unknown> }).modelOptions = {};
}
const providers = await makeProviders(speech, { keyterms: ["52", "28"] });
const pkg = { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook" as const, workbookId: randomUUID(), page: 1, question: 1 } };
const calls = mayaCalls({
  store, connections: memoryConnectionLog(store, clock), history: memoryWordingHistoryStore(),
  events: learningEvents(memoryLearningEventStore({ children: [{ id: childId, parentId }] })),
  rebuild: async () => true, model: ruleConversationalModel, reviewer: () => null, mathReviewer: () => null,
  isTestFamily: async () => true, canCallVoice: async () => true, checkedExchange: true, checkedRoutine: true, tutorFamilies: true,
  alerts: { send: async () => {}, list: async () => [] }, clock, newId: randomUUID, seed: () => 42,
});
const started = await calls.startVoice({ kind: "admin_test", parentId, childId, childName: null, startedBy: parentId, package: pkg });
if (!started.ok) throw new Error(started.error);
const opened = await calls.openVoice(started.view.id, speech.ids, null);
if (!opened.ok) throw new Error(opened.error);
const call = opened.call;
const callId = started.view.id;
const name = voiceRoom(callId);
const identity = childIdentity(childId);
const workerIdentity = "interrupt-proof-worker";
const workerToken = new AccessToken(args.key, args.secret, { identity: workerIdentity, ttl: 900 });
workerToken.kind = "agent";
workerToken.addGrant({ room: name, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true, canUpdateOwnMetadata: true });
const childToken = new AccessToken(args.key, args.secret, { identity, ttl: 900, attributes: { [ATTR.child]: childId, [ATTR.parent]: parentId, [ATTR.call]: callId } });
childToken.addGrant({ ...childGrant(callId), canPublishSources: [TrackSource.MICROPHONE] });

// ---------- the headless child ----------
const childRoom = new Room();
await childRoom.connect(args.url!, await childToken.toJwt(), { autoSubscribe: true, dynacast: false });
const receiver = createBoardReceiver({ sessionId: callId, clock });
const releases: { batchId: string; at: number; ok: boolean }[] = [];
const handle = boardRpcHandler({
  ...receiver,
  handle: (request: Parameters<typeof receiver.handle>[0]) => {
    const response = receiver.handle(request);
    if (request && (request as { type?: string }).type === "release") releases.push({ batchId: (request as { batchId: string }).batchId, at: clock(), ok: response.ok });
    return response;
  },
} as typeof receiver, { allowed: id => id === workerIdentity, changed: () => {} });
childRoom.localParticipant!.registerRpcMethod(BOARD_RPC, async data => handle(data.callerIdentity, data.payload));
const levels: Level[] = [];
childRoom.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
  if (track.kind !== TrackKind.KIND_AUDIO) return;
  void (async () => {
    for await (const frame of new AudioStream(track, { sampleRate: RATE, numChannels: 1 })) levels.push({ at: clock(), db: db(frame.data), ms: frame.samplesPerChannel / frame.sampleRate * 1000 });
  })();
});
const source = new AudioSource(RATE, 1);
const mic = LocalAudioTrack.createAudioTrack("microphone", source);
await childRoom.localParticipant!.publishTrack(mic, new TrackPublishOptions({ source: RtcSource.SOURCE_MICROPHONE }));
const queue: Int16Array[] = [];
let pumping = true;
const schedule = { start: clock(), sent: 0 };
const onsets = new Map<Int16Array, number>();
void (async () => {
  while (pumping) {
    // After an event-loop stall the schedule moves to now (`pace`), so an onset is its frame's send time.
    for (let due = pace(schedule, clock()); due > 0; due--) {
      const f = queue.shift() ?? new Int16Array(FRAME);
      if (onsets.has(f)) onsets.set(f, Math.max(schedule.start + schedule.sent * 10, clock()));
      await source.captureFrame(new AudioFrame(f, RATE, 1, FRAME));
      schedule.sent++;
    }
    await pause(4);
  }
})();
/** Queues a clip on the child's microphone. Resolves with the time its first audible frame plays. */
async function play(pcm: Int16Array): Promise<number> {
  const frames: Int16Array[] = [];
  for (let i = 0; i < pcm.length; i += FRAME) {
    const f = new Int16Array(FRAME);
    f.set(pcm.subarray(i, i + FRAME));
    frames.push(f);
  }
  const first = frames.find(f => db(f) >= -40) ?? frames[0];
  onsets.set(first, -1);
  queue.push(...frames);
  while (onsets.get(first) === -1) await pause(2);
  const at = onsets.get(first)!;
  onsets.delete(first);
  return at;
}

// ---------- the worker ----------
const workerRoom = new Room();
await workerRoom.connect(args.url!, await workerToken.toJwt(), { autoSubscribe: true, dynacast: false });
const local = workerRoom.localParticipant!;
const sender = createBoardSender({ sessionId: callId, senderId: randomUUID(), snapshot: call.boardSnapshot, transport: boardRpcTransport(local, identity, randomUUID) });
const cues: CueMeasurement[] = [];
const board = createBoardSpeech({ sender, now: clock, observe: s => call.observeBoard(s), measure: cue => cues.push(cue) });
const session = voiceSession(providers, { turn: speech.tuning, aecWarmupDuration: 0 });
const run = new VoiceCallRun(session, call, {
  board, notify: () => {}, measureTurn: () => {},
  closed: async () => {},
});
await local.setAttributes({ "maya.speech": "live", "maya.segment": String(run.segment) });
const finals: { text: string; at: number }[] = [];
const speeches: { id: string; createdAt: number; doneAt?: number; interrupted?: boolean }[] = [];
const falseInterruptions: { at: number; resumed: boolean }[] = [];
session.on(voice.AgentSessionEventTypes.UserInputTranscribed, e => { if (e.isFinal) finals.push({ text: e.transcript, at: clock() }); });
session.on(voice.AgentSessionEventTypes.SpeechCreated, e => {
  const row: (typeof speeches)[number] = { id: e.speechHandle.id, createdAt: clock() };
  speeches.push(row);
  e.speechHandle.addDoneCallback(h => { row.doneAt = clock(); row.interrupted = h.interrupted; });
});
const states: { who: "user" | "agent"; state: string; at: number }[] = [];
session.on(voice.AgentSessionEventTypes.UserStateChanged, e => { states.push({ who: "user", state: e.newState, at: clock() }); });
session.on(voice.AgentSessionEventTypes.AgentStateChanged, e => { states.push({ who: "agent", state: e.newState, at: clock() }); });
const overlaps: { at: number; isInterruption: boolean }[] = [];
session.on(voice.AgentSessionEventTypes.OverlappingSpeech, e => { overlaps.push({ at: clock(), isInterruption: Boolean((e as { isInterruption?: boolean }).isInterruption) }); });
session.on(voice.AgentSessionEventTypes.AgentFalseInterruption, e => { falseInterruptions.push({ at: clock(), resumed: Boolean((e as { resumed?: boolean }).resumed) }); });
await run.agentJoined();
await session.start({ agent: run.agent, room: workerRoom, inputOptions: { participantIdentity: identity, textEnabled: false, closeOnDisconnect: false }, record: false });
run.attachBoardAudio();
run.attachTurnTiming();
const detectorOn = Boolean((session as unknown as { _activity?: { isInterruptionDetectionEnabled?: boolean } })._activity?.isInterruptionDetectionEnabled);
const outputs: { kind: "pause" | "clear" | "resume"; at: number }[] = [];
const out = session.output.audio!;
for (const kind of ["pause", "clear", "resume"] as const) {
  const method = kind === "clear" ? "clearBuffer" : kind;
  const original = (out as unknown as Record<string, (...a: unknown[]) => unknown>)[method].bind(out);
  (out as unknown as Record<string, (...a: unknown[]) => unknown>)[method] = (...a: unknown[]) => { outputs.push({ kind, at: clock() }); return original(...a); };
}
providers.tts.prewarm();
const selected = await waitForChild(workerRoom, { id: callId, parentId, childId, mode: "voice", status: "live" });
if (!selected.child) throw new Error(selected.why);
await run.childJoined();

// ---------- trials ----------
const audibleAt = () => levels.filter(l => l.db >= -45).at(-1)?.at ?? 0;
const quietFor = (ms: number) => clock() - audibleAt() >= ms;
/** Time Maya's current audio started at the child: the first audible frame after a 700 ms quiet. */
function audioStart() {
  const audible = levels.filter(l => l.db >= -45);
  for (let i = audible.length - 1; i > 0; i--) if (audible[i].at - audible[i - 1].at > 700) return audible[i].at;
  return audible[0]?.at ?? 0;
}
async function until(test: () => boolean, ms: number) {
  const end = clock() + ms;
  while (!test()) { if (clock() > end) return false; await pause(10); }
  return true;
}
const trials: { kind: "intentional" | "incidental"; clip: string; onsetAt: number; audioStartAt: number }[] = [];
const wanted = Number(args.trials);
let restarts = 0;
/** The onsets of the restart requests the script plays when Maya is silent: each bounds the trial before it. */
const restartOnsets: number[] = [];
const deadline = clock() + 8 * 60_000;
await until(() => !quietFor(50), 30_000);
await until(() => quietFor(900), 30_000);
let next = 0;
if (wanted === 0) {
  // Cue-only: one request, and Maya's whole demonstration plays with no interruption.
  restartOnsets.push(await play(intentional[0].pcm));
  await until(() => !quietFor(50), 15_000);
  await until(() => quietFor(2500), 40_000);
}
while (trials.filter(t => t.kind === "intentional").length < wanted && clock() < deadline && !call.session.done.length) {
  // Longer than a resumed pause (about 2 s), so a restart request never lands inside one.
  if (quietFor(3500)) {
    restarts++;
    restartOnsets.push(await play(intentional[0].pcm));
    await until(() => !quietFor(50), 12_000);
    continue;
  }
  if (!await until(() => !quietFor(50), 12_000)) continue;
  const start = audioStart();
  const index = next++;
  if (index % 3 === 1) {
    const clip = incidental[Math.floor(index / 3) % incidental.length];
    await pause(Math.max(0, start + 700 - clock()));
    if (quietFor(200)) continue;
    trials.push({ kind: "incidental", clip: clip.name, onsetAt: await play(clip.pcm), audioStartAt: start });
    await pause(1500);
  }
  const delay = 400 + Math.round(random() * 2200);
  await pause(Math.max(0, start + delay - clock()));
  if (quietFor(200)) { await until(() => quietFor(900), 15_000); continue; }
  const clip = intentional[index % intentional.length];
  trials.push({ kind: "intentional", clip: clip.name, onsetAt: await play(clip.pcm), audioStartAt: start });
  await until(() => quietFor(900), 3000);
  await until(() => !quietFor(50), 12_000);
}
await pause(4000);
await call.settled();
await board.settled();
pumping = false;
await run.finish({ reason: "child_stopped", detail: "interrupt proof complete" });
await childRoom.disconnect();
await workerRoom.disconnect();

// ---------- report ----------
const childTurns = call.session.turns.filter(t => t.speaker === "child").map(t => ({ at: t.at, text: t.text }));
const rows: TrialRow[] = trials.map((t, i) => {
  // A trial owns what happens before the next trial's onset, and at most 10 s.
  // The next clip, a trial or a restart request, owns what follows its onset.
  const until = Math.min(trials[i + 1]?.onsetAt ?? Infinity, ...restartOnsets.filter(at => at > t.onsetAt), t.onsetAt + 10_000);
  const within = (at: number) => at >= t.onsetAt && at < until;
  const heard = finals.filter(f => within(f.at));
  const stop = audibleStop(levels, t.onsetAt);
  const after = (who: string, state: string) => { const hit = states.find(x => x.who === who && x.state === state && within(x.at)); return hit ? hit.at - t.onsetAt : null; };
  const done = speeches.find(x => x.doneAt !== undefined && within(x.doneAt) && x.createdAt < t.onsetAt);
  return {
    ...t, speaking: stop.speaking, stopMs: stop.stopMs, vadMs: after("user", "speaking"), agentListeningMs: after("agent", "listening"),
    speechInterrupted: done?.interrupted ?? null, output: outputs.filter(o => within(o.at)).map(o => `${o.kind}@${o.at - t.onsetAt}`),
    transcripts: heard.map(h => h.text), resumed: falseInterruptions.some(f => f.resumed && within(f.at)),
    overlaps: overlaps.filter(o => within(o.at)).map(o => `${o.isInterruption ? "barge-in" : "backchannel"}@${o.at - t.onsetAt}`),
  };
});
const scored = scoreTrials(rows, childTurns, 300, INCIDENTAL, restartOnsets);
// Worker-to-child audio delay: each utterance's first audible frame at the child against the worker's playback start.
const starts = telemetry.filter(t => t.ev === "mark" && t.name === "playbackStarted").map(t => t.at);
const delays = starts.map(at => levels.find(l => l.at >= at && l.db >= -45)?.at).map((at, i) => (at === undefined ? NaN : at - starts[i])).filter(d => d >= 0 && d < 1000).sort((a, b) => a - b);
const delay = delays.length ? delays[Math.floor(delays.length / 2)] : NaN;
const cueRows = cues.map(c => {
  const release = releases.find(r => r.batchId === c.batchId && r.ok);
  // A cue released after a resumed false interruption of the same speech (within 10 s) shows sync after the resume.
  const afterResume = falseInterruptions.some(f => f.resumed && f.at < c.reachedAt && c.reachedAt - f.at < 10_000);
  return { source: c.source, state: c.state, audioMs: c.audioMs, afterResume, boardMinusHeardMs: release ? Math.round(release.at - (c.reachedAt + delay)) : null };
});
const cueSummary = (["word", "sentence", "after-resume"] as const).map(s => {
  const of = cueRows.filter(r => (s === "after-resume" ? r.afterResume : r.source === s));
  const lags = of.filter(r => r.boardMinusHeardMs !== null).map(r => r.boardMinusHeardMs!).sort((a, b) => a - b);
  const at = (p: number) => (lags.length ? lags[Math.max(0, Math.ceil(p * lags.length) - 1)] : null);
  return { source: s, n: of.length, shown: lags.length, p50: at(0.5), p95: at(0.95), min: lags[0] ?? null, max: lags.at(-1) ?? null };
});
const checked = call.session.checkedExchange?.turns.map(t => ({ playback: t.playback, prompt: Boolean(t.prompt), actions: t.actions.map(a => a.fate) }));
const report = {
  at: new Date().toISOString(), load: { start: loadAtStart, end: loadavg()[0], cores: cpus().length }, cues: args.cues, interruptMode: speech.tuning.interruptMode ?? "unset", interruptMinMs: speech.tuning.interruptMinMs, falseInterruptionMs: speech.tuning.falseInterruptionMs, backchannels: run.backchannels ?? null, devMode: process.env.LIVEKIT_DEV_MODE === "1", providers: speech.ids, restarts,
  stop: scored.stop, lostSpeech: scored.lostSpeech, resumeGapMs: scored.resumeGapMs, falseStops: scored.falseStops,
  workerToChildAudioMs: { n: delays.length, median: delay },
  cueSummary, falseInterruptionEvents: falseInterruptions.length, detectorOn,
  overlapEvents: { n: overlaps.length, bargeIns: overlaps.filter(o => o.isInterruption).length },
  speeches: { n: speeches.length, interrupted: speeches.filter(s => s.interrupted).length },
  checked, boardEvents: receiver.snapshot().events.map(e => e.kind),
  rows: scored.rows, childTurns, restartOnsets, cueRows,
};
writeFileSync(args.out!, JSON.stringify(report, null, 2));
log(JSON.stringify({ stop: report.stop, lostSpeech: report.lostSpeech, falseStops: report.falseStops, cueSummary, workerToChildAudioMs: report.workerToChildAudioMs }, null, 1));
process.exit(0);
