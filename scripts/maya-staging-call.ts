// One admin test voice call on the `staging` LiveKit deployment of Maya's worker (#1137, docs/maya-voice-deploy.md).
// It measures what only LiveKit Cloud runs: adaptive interruption, the multimodal turn detector and Krisp filters.
//
// The call is a real admin test call of a test family (the database refuses any other family), made with the site's
// own call and token code. The token names the deployment, so only the staging worker takes it; a family's call, which
// names none, goes to production. A headless child joins the Cloud room and plays recorded clips into its microphone.
// It refuses to start while a family voice call is live.
//
// Modes:
// - interrupt: requests while Maya speaks (audible stop), and "mm hm", "okay", a noise burst and a -26 dB request
//   (false stops: 700 ms of quiet within 2 s, with a matching worker pause or clear).
// - turns: answers that end in a number, two with a pause inside ("four ... teen", "twenty ... four"). Measures the
//   child's last sound to Maya's first sound, and whether Maya spoke inside the pause (cut in).
// - background: another voice, 18 dB quieter, with no child speech. Counts a reply within 4 s of its end.
//
// Usage (env: SUPABASE_SECRET_KEY = the worker's key, MAYA_OPENROUTER_API_KEY, LIVEKIT_URL/API_KEY/API_SECRET of the
// Cloud project):
//   node scripts/maya-staging-call.mjs --assessment <id> --question <id> --admin <user id> --clips <dir> --out <file>
//     --mode interrupt|turns|background [--lab '{"interruption":"adaptive"}'] [--trials 20]
// Not measured: a device speaker, echo cancellation, a browser, or a child's voice. Times are at the headless child, so
// they include the Mac-to-Cloud network both ways.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadavg } from "node:os";
import { parseArgs } from "node:util";
import { setTimeout as pause } from "node:timers/promises";
import { AudioFrame, AudioSource, AudioStream, LocalAudioTrack, Room, RoomEvent, TrackKind, TrackPublishOptions, TrackSource, type RemoteTrack } from "@livekit/rtc-node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { BOARD_RPC, boardRpcHandler } from "@/lib/board-rpc";
import { createBoardReceiver } from "@/lib/board-protocol";
import { assessmentQuestionReader } from "@/lib/assessment-questions";
import { livekitProject } from "@/lib/maya-voice";
import { assertStagingDeploymentName, mintVoiceToken } from "@/lib/maya-voice-token";
import { audibleStop, interruptReport, readWav, stagingStop, type Level } from "../worker/maya-voice/src/interrupt-measure";
import { authorizedStagingCall, stagingLab } from "../worker/maya-voice/src/staging";
import { STAGING_STOP_TOPIC, type StopTiming } from "../worker/maya-voice/src/stop-timing";
import { callSeams } from "@/lib/maya-call-seams";
import { mayaCallStore } from "@/lib/maya-call-store";
import { mayaCalls } from "@/lib/maya-call";
import { sweepSeams } from "@/lib/maya-call-sweep";
import { withoutProductMonitoring } from "@/lib/product-monitoring";

const { values: args } = parseArgs({ options: {
  assessment: { type: "string" }, question: { type: "string" }, admin: { type: "string" }, clips: { type: "string" }, out: { type: "string" },
  mode: { type: "string" }, lab: { type: "string", default: "{}" }, trials: { type: "string", default: "20" }, deployment: { type: "string", default: "staging" },
} });
if (!args.assessment || !args.question || !args.admin || !args.clips || !args.out || !["interrupt", "turns", "background"].includes(args.mode ?? "")) {
  throw new Error("see the usage in scripts/maya-staging-call.ts");
}
const deployment = args.deployment!;
assertStagingDeploymentName(deployment);
const trials = Number(args.trials);
if (!Number.isSafeInteger(trials) || trials < 1) throw new Error("--trials must be a positive integer");
const parsedLab: unknown = JSON.parse(args.lab!);
if (!parsedLab || typeof parsedLab !== "object" || Array.isArray(parsedLab)) throw new Error("--lab must be an object");
const settings = stagingLab({ LIVEKIT_AGENT_DEPLOYMENT: deployment }, JSON.stringify({ deployment, lab: parsedLab }));
if (!settings || Object.keys(settings.lab).length !== Object.keys(parsedLab).length) throw new Error("--lab contains an unknown setting or value");
const { lab } = settings;

// ---------- clips (48 kHz mono 16-bit) ----------
const RATE = 48_000;
const FRAME = 480;
function wav(name: string): Int16Array {
  const pcm = readWav(readFileSync(join(args.clips!, name)), RATE);
  if (!pcm.length) throw new Error("empty clip: " + name);
  return pcm;
}
const db10 = (s: Int16Array) => {
  let sum = 0;
  for (const v of s) sum += v * v;
  return 10 * Math.log10(sum / Math.max(1, s.length) / 32768 ** 2 + 1e-12);
};
const gain = (pcm: Int16Array, dB: number) => pcm.map(v => Math.round(v * 10 ** (dB / 20)));
let seed = 7;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const requests = args.mode === "interrupt" ? ["int1.wav", "int3.wav", "int5.wav", "int7.wav", "int9.wav"].map(wav) : [];
const incidental = args.mode === "interrupt" ? [{ clip: "mmhm", pcm: wav("mmhm.wav") }, { clip: "okay", pcm: wav("okay.wav") },
  { clip: "noise-burst", pcm: Int16Array.from({ length: RATE * 0.15 }, () => Math.round((random() * 2 - 1) * 9000)) },
  { clip: "request-at-minus-26-db", pcm: gain(requests[0], -26) },
  // A wordless hum (#1147's clip): long enough to pause Maya, with no words for the speech-to-text.
  ...(existsSync(join(args.clips!, "hum.wav")) ? [{ clip: "hum", pcm: wav("hum.wav") }] : [])] : [];
const answers = args.mode === "turns" ? ["num-four.wav", "num-fourteen-pause.wav", "num-twenty-four.wav", "num-thinking.wav"].map(clip => ({ clip, pcm: wav(clip) })) : [];
const background = args.mode === "background" ? gain(wav("background.wav"), -18) : null;

const project = livekitProject(process.env);
if (!project) throw new Error("LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set");
const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const clock = Date.now;

// ---------- no family call may be live ----------
const [{ data: live, error: liveError }, { data: tests, error: testError }] = await Promise.all([
  db.from("maya_calls").select("id, parent_id, kind").eq("status", "live").eq("mode", "voice"),
  db.from("test_accounts").select("parent_id"),
]);
if (liveError || testError) throw new Error("live call check failed");
const testParents = new Set((tests ?? []).map(t => t.parent_id));
const families = (live ?? []).filter(c => c.kind !== "admin_test" && !testParents.has(c.parent_id));
if (families.length) throw new Error(`a family voice call is live (${families.length}): try later`);

// ---------- the call ----------
// As the admin voice route reads it (src/lib/maya-call-server.ts `testQuestion`, which needs Next's request scope).
const { data: assessment } = await db.from("assessments").select("id, parent_id, child_id, children(first_name, grade)").eq("id", args.assessment).maybeSingle();
const found = assessment && await assessmentQuestionReader(db).question({ source: "assessment", assessmentId: assessment.id, questionId: args.question });
if (!assessment || !found || found.status !== "found") throw new Error("no such test question");
const question = { parentId: assessment.parent_id, childId: assessment.child_id, childName: assessment.children?.first_name ?? null, grade: assessment.children?.grade, package: found.package };
if (!await authorizedStagingCall(db, { kind: "admin_test", mode: "voice", status: "live", startedBy: args.admin, parentId: question.parentId })) {
  throw new Error("staging requires an admin and a test family");
}
const calls = mayaCalls(sweepSeams(callSeams(db)));
const started = await calls.startVoice({ kind: "admin_test", ...question, startedBy: args.admin });
if (!started.ok) throw new Error(started.error);
const v = started.view;
const store = mayaCallStore(db);
const rows: Record<string, unknown>[] = [];
const controls: StopTiming[] = [];
const clipOnsets: number[] = [];
let loadAtStart = 0;
let room: Room | undefined;
let source: AudioSource | undefined;
let pumping = false;
let pump: Promise<void> | undefined;
const readers = new Set<ReadableStreamDefaultReader<AudioFrame>>();
const listening: Promise<void>[] = [];

function stagingWorker() {
  return [...(room?.remoteParticipants.values() ?? [])].filter(p => p.attributes[STAGING_STOP_TOPIC] === "1")
    .sort((a, b) => Number(b.attributes["maya.segment"]) - Number(a.attributes["maya.segment"]))[0];
}

async function endCall(waitMs: number): Promise<void> {
  const deadline = clock() + waitMs;
  do {
    const record = await store.get(v.id);
    if (!record) throw new Error("call missing: " + v.id);
    if (record.status === "ended") return;
    if (record.startedAt === null) {
      const ended = await withoutProductMonitoring(() => calls.input(record.id, record.revision, { type: "end" }, null));
      if (ended.ok) return;
      if (ended.error !== "conflict" && ended.error !== "voice_call") throw new Error("could not end " + v.id + ": " + ended.error);
    }
    if (clock() < deadline) await pause(500);
  } while (clock() < deadline);
  throw new Error("call still live: " + v.id);
}

let runError: unknown;
try {
  const minted = await mintVoiceToken({
    call: { id: v.id, parentId: v.parentId, childId: v.childId, kind: v.kind, mode: v.mode, status: v.status }, notice: null,
    parentId: question.parentId, childId: question.childId, project, name: question.childName, staging: { deployment, lab: { ...lab } },
  });
  if (!minted.ok) throw new Error(minted.error);
  console.log("call", v.id, "deployment", deployment, "lab", lab);

  // ---------- the headless child ----------
  room = new Room();
  const receiver = createBoardReceiver({ sessionId: v.id, clock });
  const handle = boardRpcHandler(receiver, { allowed: id => id !== minted.ticket.identity, changed: () => {} });
  const levels: Level[] = [];
  const decoder = new TextDecoder();
  room.on(RoomEvent.DataReceived, (payload, sender, _kind, topic) => {
    if (topic !== STAGING_STOP_TOPIC || sender?.attributes[STAGING_STOP_TOPIC] !== "1") return;
    try {
      const record = JSON.parse(decoder.decode(payload)) as StopTiming | null;
      if (record && Number.isFinite(record.speakingAt)) controls.push(record);
    } catch { /* An invalid message provides no stop evidence. */ }
  });
  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
    if (track.kind !== TrackKind.KIND_AUDIO) return;
    const reader = new AudioStream(track, { sampleRate: RATE, numChannels: 1 }).getReader();
    readers.add(reader);
    listening.push((async () => {
      try {
        for (;;) {
          const { done, value: frame } = await reader.read();
          if (done) return;
          levels.push({ at: clock(), db: db10(frame.data), ms: frame.samplesPerChannel / RATE * 1000 });
        }
      } catch (error) {
        if (pumping) console.warn("could not read Maya's audio", error);
      } finally {
        readers.delete(reader);
        reader.releaseLock();
      }
    })());
  });
  await room.connect(minted.ticket.url, minted.ticket.token, { autoSubscribe: true, dynacast: false });
  room.localParticipant!.registerRpcMethod(BOARD_RPC, async data => handle(data.callerIdentity, data.payload));
  const workerDeadline = clock() + 20_000;
  while (!stagingWorker() && clock() < workerDeadline) await pause(100);
  if (!stagingWorker()) throw new Error("no authorized staging worker with stop reporting joined the room");
  const micSource = source = new AudioSource(RATE, 1);
  const track = LocalAudioTrack.createAudioTrack("microphone", micSource);
  await room.localParticipant!.publishTrack(track, new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }));
  const queue: Int16Array[] = [];
  const marks = new Map<Int16Array, number>();
  pumping = true;
  let pumpFailure: unknown;
  const t0 = clock();
  let sent = 0;
  pump = (async () => {
    while (pumping) {
      for (const due = Math.floor((clock() - t0) / 10) + 2; pumping && sent < due; sent++) {
        const f = queue.shift() ?? new Int16Array(FRAME);
        if (marks.has(f)) marks.set(f, t0 + sent * 10);
        await micSource.captureFrame(new AudioFrame(f, RATE, 1, FRAME));
      }
      await pause(4);
    }
  })().catch(error => { if (pumping) pumpFailure = error; });
  /** Queues a clip. Resolves with the times its first and last audible frames play. */
  async function play(pcm: Int16Array): Promise<{ onsetAt: number; endAt: number }> {
    const frames: Int16Array[] = [];
    for (let i = 0; i < pcm.length; i += FRAME) { const f = new Int16Array(FRAME); f.set(pcm.subarray(i, i + FRAME)); frames.push(f); }
    const audible = frames.filter(f => db10(f) >= -50);
    const first = audible[0] ?? frames[0];
    const last = audible.at(-1) ?? frames.at(-1)!;
    marks.set(first, -1);
    marks.set(last, -1);
    queue.push(...frames);
    while (marks.get(last) === -1) {
      if (pumpFailure) throw pumpFailure;
      await pause(2);
    }
    const at = { onsetAt: marks.get(first)!, endAt: marks.get(last)! + 10 };
    marks.delete(first);
    marks.delete(last);
    clipOnsets.push(at.onsetAt);
    return at;
  }
  const audibleAt = () => levels.filter(l => l.db >= -45).at(-1)?.at ?? 0;
  const quietFor = (ms: number) => clock() - audibleAt() >= ms;
  async function until(test: () => boolean, ms: number) {
    const end = clock() + ms;
    while (!test()) { if (pumpFailure) throw pumpFailure; if (clock() > end) return false; await pause(10); }
    return true;
  }
  /** Time Maya's current audio started: the first audible frame after a 700 ms quiet. */
  function audioStart() {
    const audible = levels.filter(l => l.db >= -45);
    for (let i = audible.length - 1; i > 0; i--) if (audible[i].at - audible[i - 1].at > 700) return audible[i].at;
    return audible[0]?.at ?? 0;
  }
  const firstSoundAfter = (at: number) => levels.find(l => l.at > at && l.db >= -45)?.at ?? null;
  const callDone = async () => (await store.get(v.id))?.status !== "live";

  // The opening: Maya speaks first.
  if (!await until(() => !quietFor(50), 40_000)) throw new Error("Maya did not speak: is the staging deployment up?");
  await until(() => quietFor(1200), 40_000);
  loadAtStart = loadavg()[0];
  const deadline = clock() + 6 * 60_000;

  if (args.mode === "interrupt") {
    let next = 0;
    while (rows.filter(r => r.kind === "intentional").length < trials && clock() < deadline && !(await callDone())) {
      if (quietFor(1500)) { await play(requests[0]); await until(() => !quietFor(50), 15_000); continue; }
      if (!await until(() => !quietFor(50), 12_000)) continue;
      const start = audioStart();
      const index = next++;
      if (index % 2 === 1) {
        const c = incidental[Math.floor(index / 2) % incidental.length];
        await pause(Math.max(0, start + 700 - clock()));
        if (quietFor(200)) continue;
        const { onsetAt } = await play(c.pcm);
        await pause(2500);
        const stop = audibleStop(levels, onsetAt, { windowMs: 2000 });
        // Keep received timing until the matching worker record is available.
        const back = stop.stopMs !== null ? firstSoundAfter(onsetAt + stop.stopMs) : null;
        rows.push({ kind: "incidental", clip: c.clip, onsetAt, speaking: stop.speaking, audibleStopMs: stop.stopMs,
          silenceMs: back !== null && stop.stopMs !== null ? back - (onsetAt + stop.stopMs) : null, soundBackMs: back && back - onsetAt });
        continue;
      }
      const delay = 400 + Math.round(random() * 2200);
      await pause(Math.max(0, start + delay - clock()));
      if (quietFor(200)) continue;
      const { onsetAt } = await play(requests[index % requests.length]);
      await until(() => quietFor(900), 3000);
      const stop = audibleStop(levels, onsetAt);
      rows.push({ kind: "intentional", onsetAt, speaking: stop.speaking, audibleStopMs: stop.stopMs });
      await until(() => !quietFor(50), 15_000);
    }
  } else if (args.mode === "turns") {
    for (let i = 0; i < trials && clock() < deadline && !(await callDone()); i++) {
      await until(() => quietFor(1500), 30_000);
      const { clip, pcm } = answers[i % answers.length];
      const { onsetAt, endAt } = await play(pcm);
      await until(() => !quietFor(50), 15_000);
      const first = firstSoundAfter(onsetAt);
      rows.push({ kind: "turn", clip, onsetAt, endAt, cutIn: first !== null && first < endAt, replyMs: first !== null && first >= endAt ? first - endAt : null });
      await until(() => quietFor(1500), 40_000);
    }
  } else {
    for (let i = 0; i < trials && clock() < deadline && !(await callDone()); i++) {
      await until(() => quietFor(1500), 30_000);
      const { onsetAt, endAt } = await play(background!);
      await pause(4000);
      const first = firstSoundAfter(onsetAt);
      rows.push({ kind: "background", onsetAt, endAt, replied: first !== null && first < endAt + 4000, replyMs: first !== null ? first - endAt : null });
      // A reply to the background voice is a turn of its own: let it finish before the next sound.
      await until(() => quietFor(1500), 40_000);
    }
  }
} catch (error) {
  runError = error;
  throw error;
} finally {
  let cleanupError: unknown;
  try {
    // A connected worker owns the end. Leave the room connected long enough for it to send its last stop record.
    const local = room?.localParticipant;
    const worker = stagingWorker() ?? [...(room?.remoteParticipants.values() ?? [])].find(p => p.attributes["maya.segment"] !== undefined);
    if (local && worker) {
      await local.performRpc({ destinationIdentity: worker.identity, method: "maya.hang_up", payload: "", responseTimeout: 5000 }).catch(() => {});
      await endCall(3000).catch(() => {}); // The disconnect below is a second hang-up signal.
    }
  } catch (error) { cleanupError = error; }
  finally {
    pumping = false;
    const closed = await Promise.allSettled([
      room?.disconnect(),
      ...[...readers].map(reader => reader.cancel()),
    ]);
    await source?.close().catch(error => { cleanupError ??= error; });
    await Promise.allSettled([pump, ...listening]);
    cleanupError ??= closed.find(result => result.status === "rejected")?.reason;
    await endCall(45_000).catch(error => { cleanupError ??= error; });
  }
  if (cleanupError && runError) throw new AggregateError([runError, cleanupError], "the call and its cleanup failed");
  if (cleanupError) throw cleanupError;
}
const { data: ended, error: endedError } = await db.from("maya_calls").select("status, outcome_reason, child_turns, maya_turns, call_seconds, trace").eq("id", v.id).maybeSingle();
if (endedError || ended?.status !== "ended") throw new Error("could not read ended call: " + v.id);
// The call's child turns (worker clock, NTP-close to this one): each request must reach a turn of its own window.
const childTurns = ((ended?.trace as { turns?: { kind?: string; at?: number; text?: string }[] } | null)?.turns ?? [])
  .filter(t => t.kind === "child" && typeof t.at === "number").map(t => ({ at: t.at!, text: t.text ?? "" }));
for (const r of rows) {
  if (r.kind !== "intentional" && r.kind !== "incidental") continue;
  const onsetAt = r.onsetAt as number;
  const nextOnset = clipOnsets.find(at => at > onsetAt) ?? Infinity;
  r.stopMs = stagingStop({ onsetAt, stopMs: r.audibleStopMs as number | null, speaking: r.speaking === true }, controls, nextOnset);
  if (r.kind === "incidental") {
    r.falseStop = r.stopMs !== null;
    if (!r.falseStop) { r.silenceMs = null; r.soundBackMs = null; }
    continue;
  }
  const until = Math.min(nextOnset, onsetAt + 10_000);
  r.lost = !childTurns.some(t => t.at >= onsetAt && t.at < until);
}

// ---------- report ----------
const intent = rows.filter(r => r.kind === "intentional" && r.speaking) as { stopMs: number | null; audibleStopMs: number | null }[];
const incid = rows.filter(r => r.kind === "incidental" && r.speaking) as { clip: string; falseStop: boolean }[];
const turns = rows.filter(r => r.kind === "turn") as { clip: string; cutIn: boolean; replyMs: number | null }[];
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.max(0, Math.ceil(p * s.length) - 1)] : null; };
const report = {
  at: new Date().toISOString(), callId: v.id, deployment, lab, mode: args.mode, load: { start: loadAtStart, end: loadavg()[0] },
  call: ended && { status: ended.status, outcome_reason: ended.outcome_reason, child_turns: ended.child_turns, maya_turns: ended.maya_turns, call_seconds: ended.call_seconds },
  ...(args.mode === "interrupt" ? {
    stop: interruptReport(intent, 300), unconfirmedQuiet: intent.filter(r => r.stopMs === null && r.audibleStopMs !== null).length,
    lostSpeech: { n: rows.filter(r => r.kind === "intentional").length, lost: rows.filter(r => r.kind === "intentional" && r.lost).length },
    falseStops: { n: incid.length, stopped: incid.filter(r => r.falseStop).length,
      byClip: [...new Set(incid.map(r => r.clip))].map(clip => ({ clip, n: incid.filter(r => r.clip === clip).length, stopped: incid.filter(r => r.clip === clip && r.falseStop).length })) },
  } : {}),
  ...(args.mode === "turns" ? {
    byClip: [...new Set(turns.map(t => t.clip))].map(clip => {
      const of = turns.filter(t => t.clip === clip);
      const ms = of.flatMap(t => (t.replyMs === null ? [] : [t.replyMs]));
      return { clip, n: of.length, cutIn: of.filter(t => t.cutIn).length, replyP50: pct(ms, 0.5), replyP95: pct(ms, 0.95) };
    }),
  } : {}),
  ...(args.mode === "background" ? { replied: rows.filter(r => r.replied).length, n: rows.length } : {}),
  rows,
};
writeFileSync(args.out!, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, rows: rows.length }, null, 1));
process.exit(0);
