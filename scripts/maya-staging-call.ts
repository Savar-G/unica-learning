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
//   (false stops: Maya quiet for 700 ms within 2 s of the sound).
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
import { callsOn } from "@/lib/maya-call-seams";
import { assessmentQuestionReader } from "@/lib/assessment-questions";
import { livekitProject } from "@/lib/maya-voice";
import { mintVoiceToken } from "@/lib/maya-voice-token";
import { audibleStop, interruptReport, type Level } from "../worker/maya-voice/src/interrupt-measure";

const { values: args } = parseArgs({ options: {
  assessment: { type: "string" }, question: { type: "string" }, admin: { type: "string" }, clips: { type: "string" }, out: { type: "string" },
  mode: { type: "string" }, lab: { type: "string", default: "{}" }, trials: { type: "string", default: "20" }, deployment: { type: "string", default: "staging" },
} });
if (!args.assessment || !args.question || !args.admin || !args.clips || !args.out || !["interrupt", "turns", "background"].includes(args.mode ?? "")) {
  throw new Error("see the usage in scripts/maya-staging-call.ts");
}
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

// ---------- clips (48 kHz mono 16-bit) ----------
const RATE = 48_000;
const FRAME = 480;
function wav(name: string): Int16Array {
  const b = readFileSync(join(args.clips!, name));
  for (let at = 12; at < b.length;) {
    const size = b.readUInt32LE(at + 4);
    if (b.toString("ascii", at, at + 4) === "data") return new Int16Array(b.buffer.slice(b.byteOffset + at + 8, b.byteOffset + at + 8 + size));
    at += 8 + size + (size % 2);
  }
  throw new Error("no data chunk in " + name);
}
const db10 = (s: Int16Array) => {
  let sum = 0;
  for (const v of s) sum += v * v;
  return 10 * Math.log10(sum / Math.max(1, s.length) / 32768 ** 2 + 1e-12);
};
const gain = (pcm: Int16Array, dB: number) => pcm.map(v => Math.round(v * 10 ** (dB / 20)));
let seed = 7;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------- the call ----------
// As the admin voice route reads it (src/lib/maya-call-server.ts `testQuestion`, which needs Next's request scope).
const { data: assessment } = await db.from("assessments").select("id, parent_id, child_id, children(first_name, grade)").eq("id", args.assessment).maybeSingle();
const found = assessment && await assessmentQuestionReader(db).question({ source: "assessment", assessmentId: assessment.id, questionId: args.question });
if (!assessment || !found || found.status !== "found") throw new Error("no such test question");
const question = { parentId: assessment.parent_id, childId: assessment.child_id, childName: assessment.children?.first_name ?? null, grade: assessment.children?.grade, package: found.package };
const calls = callsOn(db);
const started = await calls.startVoice({ kind: "admin_test", ...question, startedBy: args.admin });
if (!started.ok) throw new Error(started.error);
const v = started.view;
const lab = JSON.parse(args.lab!) as Record<string, string>;
const minted = await mintVoiceToken({
  call: { id: v.id, parentId: v.parentId, childId: v.childId, kind: v.kind, mode: v.mode, status: v.status }, notice: null,
  parentId: question.parentId, childId: question.childId, project, name: question.childName, staging: { deployment: args.deployment!, lab },
});
if (!minted.ok) throw new Error(minted.error);
console.log("call", v.id, "deployment", args.deployment, "lab", lab);

// ---------- the headless child ----------
const room = new Room();
await room.connect(minted.ticket.url, minted.ticket.token, { autoSubscribe: true, dynacast: false });
const receiver = createBoardReceiver({ sessionId: v.id, clock });
const handle = boardRpcHandler(receiver, { allowed: id => id !== minted.ticket.identity, changed: () => {} });
room.localParticipant!.registerRpcMethod(BOARD_RPC, async data => handle(data.callerIdentity, data.payload));
const levels: Level[] = [];
room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
  if (track.kind !== TrackKind.KIND_AUDIO) return;
  void (async () => { for await (const frame of new AudioStream(track, { sampleRate: RATE, numChannels: 1 })) levels.push({ at: clock(), db: db10(frame.data), ms: (frame.samplesPerChannel / RATE) * 1000 }); })();
});
const source = new AudioSource(RATE, 1);
await room.localParticipant!.publishTrack(LocalAudioTrack.createAudioTrack("microphone", source), new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }));
const queue: Int16Array[] = [];
const marks = new Map<Int16Array, number>();
let pumping = true;
const t0 = clock();
let sent = 0;
void (async () => {
  while (pumping) {
    for (const due = Math.floor((clock() - t0) / 10) + 2; sent < due; sent++) {
      const f = queue.shift() ?? new Int16Array(FRAME);
      if (marks.has(f)) marks.set(f, t0 + sent * 10);
      await source.captureFrame(new AudioFrame(f, RATE, 1, FRAME));
    }
    await pause(4);
  }
})();
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
  while (marks.get(last) === -1) await pause(2);
  const at = { onsetAt: marks.get(first)!, endAt: marks.get(last)! + 10 };
  marks.delete(first);
  marks.delete(last);
  return at;
}
const audibleAt = () => levels.filter(l => l.db >= -45).at(-1)?.at ?? 0;
const quietFor = (ms: number) => clock() - audibleAt() >= ms;
async function until(test: () => boolean, ms: number) {
  const end = clock() + ms;
  while (!test()) { if (clock() > end) return false; await pause(10); }
  return true;
}
/** Time Maya's current audio started: the first audible frame after a 700 ms quiet. */
function audioStart() {
  const audible = levels.filter(l => l.db >= -45);
  for (let i = audible.length - 1; i > 0; i--) if (audible[i].at - audible[i - 1].at > 700) return audible[i].at;
  return audible[0]?.at ?? 0;
}
const firstSoundAfter = (at: number) => levels.find(l => l.at > at && l.db >= -45)?.at ?? null;
const callDone = async () => (await db.from("maya_calls").select("status").eq("id", v.id).maybeSingle()).data?.status !== "live";

// The opening: Maya speaks first.
if (!await until(() => !quietFor(50), 40_000)) throw new Error("Maya did not speak: is the staging deployment up?");
await until(() => quietFor(1200), 40_000);
const loadAtStart = loadavg()[0];
const deadline = clock() + 6 * 60_000;
const rows: Record<string, unknown>[] = [];

if (args.mode === "interrupt") {
  const requests = ["int1.wav", "int3.wav", "int5.wav", "int7.wav", "int9.wav"].map(wav);
  const incidental = [{ clip: "mmhm", pcm: wav("mmhm.wav") }, { clip: "okay", pcm: wav("okay.wav") },
    { clip: "noise-burst", pcm: Int16Array.from({ length: RATE * 0.15 }, () => Math.round((random() * 2 - 1) * 9000)) },
    { clip: "request-at-minus-26-db", pcm: gain(requests[0], -26) },
    // A wordless hum (#1147's clip): long enough to pause Maya, with no words for the speech-to-text.
    ...(existsSync(join(args.clips!, "hum.wav")) ? [{ clip: "hum", pcm: wav("hum.wav") }] : [])];
  let next = 0;
  while (rows.filter(r => r.kind === "intentional").length < Number(args.trials) && clock() < deadline && !(await callDone())) {
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
      // Maya quiet for 700 ms within 2 s of the sound. Whether LiveKit resumed her comes from the worker log.
      const back = stop.stopMs !== null ? firstSoundAfter(onsetAt + stop.stopMs) : null;
      rows.push({ kind: "incidental", clip: c.clip, onsetAt, speaking: stop.speaking, falseStop: stop.speaking && stop.stopMs !== null, stopMs: stop.stopMs,
        silenceMs: back !== null && stop.stopMs !== null ? back - (onsetAt + stop.stopMs) : null, soundBackMs: back && back - onsetAt });
      continue;
    }
    const delay = 400 + Math.round(random() * 2200);
    await pause(Math.max(0, start + delay - clock()));
    if (quietFor(200)) continue;
    const { onsetAt } = await play(requests[index % requests.length]);
    await until(() => quietFor(900), 3000);
    const stop = audibleStop(levels, onsetAt);
    rows.push({ kind: "intentional", onsetAt, speaking: stop.speaking, stopMs: stop.stopMs });
    await until(() => !quietFor(50), 15_000);
  }
} else if (args.mode === "turns") {
  const answers = ["num-four.wav", "num-fourteen-pause.wav", "num-twenty-four.wav", "num-thinking.wav"];
  for (let i = 0; i < Number(args.trials) && clock() < deadline && !(await callDone()); i++) {
    await until(() => quietFor(1500), 30_000);
    const clip = answers[i % answers.length];
    const { onsetAt, endAt } = await play(wav(clip));
    await until(() => !quietFor(50), 15_000);
    const first = firstSoundAfter(onsetAt);
    rows.push({ kind: "turn", clip, onsetAt, endAt, cutIn: first !== null && first < endAt, replyMs: first !== null && first >= endAt ? first - endAt : null });
    await until(() => quietFor(1500), 40_000);
  }
} else {
  const voice = gain(wav("background.wav"), -18);
  for (let i = 0; i < Number(args.trials) && clock() < deadline && !(await callDone()); i++) {
    await until(() => quietFor(1500), 30_000);
    const { onsetAt, endAt } = await play(voice);
    await pause(4000);
    const first = firstSoundAfter(onsetAt);
    rows.push({ kind: "background", onsetAt, endAt, replied: first !== null && first < endAt + 4000, replyMs: first !== null ? first - endAt : null });
    // A reply to the background voice is a turn of its own: let it finish before the next sound.
    await until(() => quietFor(1500), 40_000);
  }
}

// ---------- hang up ----------
const worker = [...room.remoteParticipants.values()].find(p => p.identity !== minted.ticket.identity);
if (worker) await room.localParticipant!.performRpc({ destinationIdentity: worker.identity, method: "maya.hang_up", payload: "", responseTimeout: 5000 }).catch(() => {});
await until(() => false, 3000);
pumping = false;
await room.disconnect();
const { data: ended } = await db.from("maya_calls").select("status, outcome_reason, child_turns, maya_turns, call_seconds, trace").eq("id", v.id).maybeSingle();
// The call's child turns (worker clock, NTP-close to this one): each request must reach a turn of its own window.
const childTurns = ((ended?.trace as { turns?: { kind?: string; at?: number; text?: string }[] } | null)?.turns ?? [])
  .filter(t => t.kind === "child" && typeof t.at === "number").map(t => ({ at: t.at!, text: t.text ?? "" }));
for (const [i, r] of rows.entries()) {
  if (r.kind !== "intentional") continue;
  const until = Math.min((rows[i + 1]?.onsetAt as number | undefined) ?? Infinity, (r.onsetAt as number) + 10_000);
  r.lost = !childTurns.some(t => t.at >= (r.onsetAt as number) && t.at < until);
}

// ---------- report ----------
const intent = rows.filter(r => r.kind === "intentional" && r.speaking) as { stopMs: number | null }[];
const incid = rows.filter(r => r.kind === "incidental" && r.speaking) as { clip: string; falseStop: boolean }[];
const turns = rows.filter(r => r.kind === "turn") as { clip: string; cutIn: boolean; replyMs: number | null }[];
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.max(0, Math.ceil(p * s.length) - 1)] : null; };
const report = {
  at: new Date().toISOString(), callId: v.id, deployment: args.deployment, lab, mode: args.mode, load: { start: loadAtStart, end: loadavg()[0] },
  call: ended && { status: ended.status, outcome_reason: ended.outcome_reason, child_turns: ended.child_turns, maya_turns: ended.maya_turns, call_seconds: ended.call_seconds },
  ...(args.mode === "interrupt" ? {
    stop: interruptReport(intent, 300), endedOnTheirOwn: intent.filter(r => r.stopMs === null).length,
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
