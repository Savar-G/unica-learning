// #1139 baseline runner: a synthetic child on a self-hosted LiveKit server (docs/maya-baseline.md). The child and the
// worker share this machine's clock. It writes capture lines for scripts/maya-baseline-report.mjs.
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cpus, loadavg } from "node:os";
import { setTimeout as pause } from "node:timers/promises";
import { AgentServer, initializeLogger, ServerOptions } from "@livekit/agents";
import { TrackSource } from "@livekit/protocol";
import { AudioFrame, AudioSource, AudioStream, LocalAudioTrack, Room, RoomEvent, TrackKind, TrackPublishOptions, TrackSource as MediaSource, type RemoteTrack } from "@livekit/rtc-node";
import { AccessToken, AgentDispatchClient } from "livekit-server-sdk";
import { BOARD_RPC, boardRpcHandler } from "@/lib/board-rpc";
import { createBoardReceiver } from "@/lib/board-protocol";
import { BASELINE_COST_PREFIX, BASELINE_PREFIX, BASELINE_PROFILE_PREFIX, deviceTurn, type BaselineCost, type BaselineTurn } from "@/lib/maya-baseline";
import { ATTR, childGrant, childIdentity, HANG_UP_BOARD_DRAIN, voiceRoom } from "@/lib/maya-voice";
import { BASELINE_AGENT, REPORT_RPC, type BaselineJob, type ReportMessage } from "./agent";

export interface Prompt { name: string; turnType: "routine" | "complex"; file: string; leadMs?: number }
/** The matched speech cases (#1137). `interrupt` plays its second prompt while the answer to the first is playing. */
export const CASES: readonly ({ kind: "say"; prompt: string } | { kind: "interrupt"; prompt: string; cut: string } | { kind: "background"; prompt: string })[] = [
  { kind: "say", prompt: "first" }, { kind: "say", prompt: "regroup" }, { kind: "say", prompt: "four" }, { kind: "say", prompt: "fourteen-pause" },
  { kind: "say", prompt: "correction" }, { kind: "say", prompt: "why" }, { kind: "background", prompt: "background" },
  { kind: "interrupt", prompt: "regroup", cut: "question" }, { kind: "say", prompt: "thinking" },
];
export const TURN_TYPES: Record<string, "routine" | "complex"> = {
  first: "routine", regroup: "complex", four: "routine", "fourteen-pause": "routine", correction: "routine", why: "complex",
  thinking: "routine", question: "routine", background: "routine",
};

/** The same cases as text, for a run with the speech doubles (no audio, no device timing). */
const TEXT: Record<string, string> = {
  first: "What do I do first?", regroup: "Can you show me how to regroup?", four: "four", "fourteen-pause": "fourteen",
  correction: "four. no, fourteen", why: "Why do we have to trade a ten for ten ones?", thinking: "is it thirty four?",
  question: "wait, I have a question.", background: "",
};
const FAKE_TURN_MS = 9000;

const RATE = 24_000;
const FRAME = RATE / 100;
const LOUD = 0.008 * 32768;
const MERGE_MS = 250;
const QUIET_MS = 2000;
const TURN_LIMIT_MS = 25_000;

function pcm(file: string): Int16Array {
  const b = readFileSync(file);
  let at = 12;
  while (at < b.length - 8) {
    const id = b.toString("ascii", at, at + 4), size = b.readUInt32LE(at + 4);
    if (id === "data") return new Int16Array(b.buffer.slice(b.byteOffset + at + 8, b.byteOffset + at + 8 + size));
    at += 8 + size + (size % 2);
  }
  throw Error(`No PCM data in ${file}`);
}
const loud = (frame: Int16Array) => Math.sqrt(frame.reduce((s, x) => s + x * x, 0) / frame.length) >= LOUD;

interface Step { prompt: string; turnType: "routine" | "complex" | "background"; inputEnd: number; interruptionAt?: number }

/** One synthetic child: microphone frames out, Maya's audio and board in, all stamped with Date.now(). */
async function child(o: { url: string; job: BaselineJob; prompts: Map<string, Int16Array> }) {
  const room = new Room();
  const identity = childIdentity(o.job.childId);
  const token = new AccessToken("devkey", "secret", { identity, ttl: 600, attributes: { [ATTR.child]: o.job.childId, [ATTR.parent]: o.job.parentId, [ATTR.call]: o.job.callId } });
  token.addGrant({ ...childGrant(o.job.callId), canPublishSources: [TrackSource.MICROPHONE] });
  const bursts: { start: number; end: number }[] = [];
  const board: number[] = [];
  const messages: ReportMessage[] = [];
  let done!: () => void;
  const reported = new Promise<void>(resolve => { done = resolve; });
  // The board shows a staged batch at its release. Stamp the receipt of each accepted release.
  const receiver = createBoardReceiver({ sessionId: o.job.callId });
  const stamped = { handle: (request: Parameters<typeof receiver.handle>[0]) => {
    const response = receiver.handle(request);
    if (response.ok && (request as { type?: string }).type === "release") board.push(Date.now());
    return response;
  } } as typeof receiver;
  const handle = boardRpcHandler(stamped, { allowed: () => true, changed: () => {} });
  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
    if (track.kind !== TrackKind.KIND_AUDIO) return;
    void (async () => {
      for await (const frame of new AudioStream(track, { sampleRate: RATE, numChannels: 1 })) {
        if (!loud(frame.data)) continue;
        const at = Date.now(), last = bursts.at(-1);
        if (last && at - last.end < MERGE_MS) last.end = at; else bursts.push({ start: at, end: at });
      }
    })();
  });
  await room.connect(o.url, await token.toJwt(), { autoSubscribe: true, dynacast: false });
  const local = room.localParticipant!;
  local.registerRpcMethod(BOARD_RPC, async data => handle(data.callerIdentity, data.payload));
  local.registerRpcMethod(REPORT_RPC, async data => {
    const m = JSON.parse(data.payload) as ReportMessage;
    messages.push(m);
    if (m.kind === "done") done();
    return "ok";
  });
  const source = new AudioSource(RATE, 1, 100);
  await local.publishTrack(LocalAudioTrack.createAudioTrack("microphone", source), new TrackPublishOptions({ source: MediaSource.SOURCE_MICROPHONE }));
  // The microphone sends frames all the time, as a browser does. `queue` holds the next prompt's samples.
  let queue: Int16Array[] = [];
  let lastLoud = 0, firstLoud = 0, running = true;
  const pump = (async () => {
    const silence = new Int16Array(FRAME);
    while (running) {
      const data = queue.shift() ?? silence;
      await source.captureFrame(new AudioFrame(data, RATE, 1, FRAME));
      if (data !== silence && loud(data)) {
        const at = Date.now() + source.queuedDuration;
        lastLoud = at;
        if (!firstLoud) firstLoud = at;
      }
    }
  })();
  const play = async (name: string) => {
    const samples = o.prompts.get(name)!;
    lastLoud = 0; firstLoud = 0;
    const frames: Int16Array[] = [];
    for (let i = 0; i < samples.length; i += FRAME) { const f = new Int16Array(FRAME); f.set(samples.subarray(i, i + FRAME)); frames.push(f); }
    queue = frames;
    const started = Date.now();
    while (queue.length) await pause(10);
    await pause(150);
    return { first: firstLoud || started, end: lastLoud || Date.now() };
  };
  const quiet = async (after: number, limit = TURN_LIMIT_MS) => {
    const until = Date.now() + limit;
    while (Date.now() < until) {
      const last = bursts.at(-1);
      if (last && last.start >= after && Date.now() - last.end >= QUIET_MS) return true;
      await pause(50);
    }
    return false;
  };
  return { room, local, bursts, board, messages, reported, play, quiet, stop: async () => { running = false; await pump; } };
}

async function runCall(o: { url: string; dispatch: AgentDispatchClient; job: Omit<BaselineJob, "dispatchAt">; prompts: Map<string, Int16Array>; capture: string; cases: string; fake: boolean }) {
  const job: BaselineJob = { ...o.job, dispatchAt: Date.now() };
  await o.dispatch.createDispatch(voiceRoom(job.callId), BASELINE_AGENT, { metadata: JSON.stringify(job) });
  const c = await child({ url: o.url, job, prompts: o.prompts });
  const steps: Step[] = [];
  const caseRows: unknown[] = [];
  const callStart = Date.now();
  try {
    if (o.fake) {
      // The doubles speak silence, so the child waits a fixed time per turn and records no device rows.
      await pause(4000);
      const agent = () => [...c.room.remoteParticipants.values()].find(p => p.identity !== childIdentity(job.childId));
      for (const item of CASES) {
        if (item.kind === "background") continue;
        for (const name of item.kind === "interrupt" ? [item.prompt, item.cut] : [item.prompt]) {
          const at = Date.now();
          const peer = agent();
          if (peer) await c.local.performRpc({ destinationIdentity: peer.identity, method: "maya.fake.say", payload: JSON.stringify({ text: TEXT[name] }), responseTimeout: 5000 }).catch(() => {});
          steps.push({ prompt: name, turnType: TURN_TYPES[name], inputEnd: at });
          await pause(item.kind === "interrupt" && name === item.prompt ? 1500 : FAKE_TURN_MS);
        }
      }
      return;
    }
    await c.quiet(0, 30_000);
    for (const item of CASES) {
      if (item.kind === "background") {
        const at = Date.now();
        const heard = await c.play(item.prompt);
        await pause(6000);
        steps.push({ prompt: item.prompt, turnType: "background", inputEnd: heard.end });
        await c.quiet(at, 10_000);
        continue;
      }
      const heard = await c.play(item.prompt);
      steps.push({ prompt: item.prompt, turnType: TURN_TYPES[item.prompt], inputEnd: heard.end });
      if (item.kind === "interrupt") {
        // Interrupt a sound that has lasted 1 s and is still playing: the answer, not a short filler.
        const until = Date.now() + TURN_LIMIT_MS;
        const playing = () => c.bursts.some(b => b.start >= heard.end && b.end - b.start >= 1000 && Date.now() - b.end < 60);
        while (Date.now() < until && !playing()) await pause(10);
        const cutHeard = await c.play(item.cut);
        steps.at(-1)!.interruptionAt = cutHeard.first;
        caseRows.push({ case: "interruption", overlapped: c.bursts.some(b => b.start <= cutHeard.first && b.end >= cutHeard.first) });
        steps.push({ prompt: item.cut, turnType: TURN_TYPES[item.cut], inputEnd: cutHeard.end });
        await c.quiet(cutHeard.end);
      } else await c.quiet(heard.end);
    }
  } finally {
    const callMinutes = (Date.now() - callStart) / 60_000;
    const agent = [...c.room.remoteParticipants.values()].find(p => p.identity !== childIdentity(job.childId));
    if (agent) await c.local.performRpc({ destinationIdentity: agent.identity, method: "maya.hang_up", payload: HANG_UP_BOARD_DRAIN, responseTimeout: 10_000 }).catch(() => {});
    await Promise.race([c.reported, pause(60_000)]);
    await c.stop();
    await c.room.disconnect();
    write(o.capture, o.cases, job, steps, c, caseRows, callMinutes, o.fake);
  }
}

function write(capture: string, cases: string, job: BaselineJob, steps: Step[], c: Awaited<ReturnType<typeof child>>, caseRows: unknown[], callMinutes: number, fake: boolean) {
  const lines: string[] = [];
  const turns = c.messages.filter((m): m is Extract<ReportMessage, { kind: "turn" }> => m.kind === "turn");
  const call = c.messages.find((m): m is Extract<ReportMessage, { kind: "call" }> => m.kind === "call");
  const teaching = job.teaching === "checked" ? "checked-exchange+checked-routine" as const : "existing" as const;
  const stepOf = (t0: number | null) => t0 === null ? -1 : steps.findLastIndex(s => s.inputEnd - 3000 <= t0);
  let first = true;
  for (const t of turns) {
    const s = steps[stepOf(t.t0)];
    const row: BaselineTurn = { ...t.row, turnType: s && s.turnType !== "background" ? s.turnType : "unknown" };
    if (first && call) { row.ms = { ...row.ms, workerQueue: call.workerQueueMs }; first = false; }
    lines.push(BASELINE_PREFIX + JSON.stringify(row));
  }
  steps.forEach((s, i) => {
    const end = steps[i + 1]?.inputEnd ?? Infinity;
    const mine = turns.filter(t => stepOf(t.t0) === i);
    // Background speech should get no reply: any Maya sound before the next step is a false response.
    caseRows.push({ case: s.prompt, workerTurns: mine.length, outcomes: mine.map(t => t.row.outcome), answered: mine.some(t => t.answerPlayback !== null),
      ...(s.turnType === "background" ? { falseResponse: c.bursts.some(b => b.start >= s.inputEnd && b.start < end) } : {}) });
    if (s.turnType === "background" || fake) return;
    const provider = turns[0]?.row.provider ?? "unknown";
    lines.push(BASELINE_PREFIX + JSON.stringify(deviceTurn({
      group: { evidence: "device", mode: "voice", turnType: s.turnType, provider, teaching, device: job.device, network: job.network, concurrency: job.concurrency },
      inputEnd: s.inputEnd, bursts: c.bursts.filter(b => b.start < end), answerPlayback: mine.find(t => t.answerPlayback !== null)?.answerPlayback ?? null,
      boardAt: c.board.find(at => at >= s.inputEnd && at < end) ?? null, ...(s.interruptionAt ? { interruptionAt: s.interruptionAt } : {}),
    })));
  });
  // Machine load biases CPU and event-loop figures: record it beside them.
  const machine = { loadAverage1m: Math.round(loadavg()[0] * 100) / 100, cores: cpus().length };
  if (call?.profile) lines.push(BASELINE_PROFILE_PREFIX + JSON.stringify({ teaching, concurrency: job.concurrency, machine, workerQueueMs: call.workerQueueMs, ...call.profile, discardedPreparation: call.discardedPreparation }));
  lines.push(...costs(job, teaching, callMinutes, fake, call?.speechUsd ?? null).map(r => BASELINE_COST_PREFIX + JSON.stringify(r)));
  // Discarded preparation is already inside the provider receipts. These rows only make its share visible.
  const d = call?.discardedPreparation as { decisions: number; reported: number; estimated: number; unknown: number; reportedUsd: number; estimatedUsd: number } | undefined;
  if (d?.decisions) {
    const base = { v: 1 as const, mode: "voice" as const, teaching, concurrency: job.concurrency, work: "discardedPreparation" as const, model: "lesson-model", effort: "code-default" };
    if (d.reported) lines.push(BASELINE_COST_PREFIX + JSON.stringify({ ...base, basis: "provider", calls: d.reported, usd: d.reportedUsd }));
    if (d.estimated) lines.push(BASELINE_COST_PREFIX + JSON.stringify({ ...base, basis: "estimate", calls: d.estimated, usd: d.estimatedUsd }));
    if (d.unknown) lines.push(BASELINE_COST_PREFIX + JSON.stringify({ ...base, basis: "unknown", calls: d.unknown, usd: null }));
  }
  appendFileSync(capture, lines.join("\n") + "\n");
  appendFileSync(cases, JSON.stringify({ callId: job.callId, teaching, concurrency: job.concurrency, reported: c.messages.some(m => m.kind === "done"), cases: caseRows }) + "\n");
}

/** Provider receipts for model work; configured-rate estimates for speech; transport has no local price. */
function costs(job: BaselineJob, teaching: BaselineCost["teaching"], callMinutes: number, fake: boolean, speech: { stt: number; tts: number } | null): BaselineCost[] {
  const base = { v: 1 as const, mode: "voice" as const, teaching, concurrency: job.concurrency };
  const rows: BaselineCost[] = [];
  if (existsSync(job.receipts)) for (const line of readFileSync(job.receipts, "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(line) as { feature: string; model: string; cost_usd: number | null; cost_basis: BaselineCost["basis"]; calls: number };
    const basis = r.cost_usd === null ? "unknown" : r.cost_basis === "unknown" ? "provider" : r.cost_basis;
    rows.push({ ...base, work: r.feature.includes("review") ? "review" : "model", model: r.model, effort: "code-default", basis, calls: r.calls, usd: r.cost_usd });
  }
  if (fake) return rows;
  const minutes = Math.round(callMinutes * 1e4) / 1e4;
  // The worker ledger's own estimates: speech-to-text by covered minute block, voice by characters returned as audio.
  rows.push(speech
    ? { ...base, work: "stt", model: "assemblyai/universal-3-6-pro", effort: "none", basis: "estimate", calls: 1, usd: speech.stt, quantity: { unit: "minutes", value: minutes } }
    : { ...base, work: "stt", model: "assemblyai/universal-3-6-pro", effort: "none", basis: "unknown", calls: 1, usd: null, quantity: { unit: "minutes", value: minutes } });
  rows.push(speech
    ? { ...base, work: "tts", model: "cartesia/sonic-3.6", effort: "none", basis: "estimate", calls: 1, usd: speech.tts }
    : { ...base, work: "tts", model: "cartesia/sonic-3.6", effort: "none", basis: "unknown", calls: 1, usd: null });
  rows.push({ ...base, work: "transport", model: "livekit-server-dev", effort: "none", basis: "unknown", calls: 1, usd: null, quantity: { unit: "participantMinutes", value: Math.round(minutes * 2 * 1e4) / 1e4 } });
  return rows;
}

export async function main(o: { url: string; agent: string; out: string; teachings: ("existing" | "checked")[]; calls: number; concurrency: number; network: string; device: string; healthPort: number; fake: boolean }) {
  initializeLogger({ pretty: false, level: "warn" });
  const prompts = new Map(Object.keys(TURN_TYPES).map(name => [name, pcm(join(o.out, "prompts", `${name}.wav`))]));
  // Background speech plays 18 dB below the child's prompts.
  prompts.set("background", prompts.get("background")!.map(x => Math.round(x * 10 ** (-18 / 20))));
  const server = new AgentServer(new ServerOptions({ agent: o.agent, agentName: BASELINE_AGENT, wsURL: o.url, apiKey: "devkey", apiSecret: "secret", numIdleProcesses: o.concurrency, loadThreshold: 1, port: o.healthPort }));
  void server.run();
  await pause(3000);
  const dispatch = new AgentDispatchClient(o.url.replace(/^ws/, "http"), "devkey", "secret");
  const capture = join(o.out, "capture.log"), cases = join(o.out, "cases.jsonl");
  for (const teaching of o.teachings) {
    for (let start = 0; start < o.calls; start += o.concurrency) {
      const batch = Array.from({ length: Math.min(o.concurrency, o.calls - start) }, () => {
        const callId = randomUUID();
        return runCall({ url: o.url, dispatch, prompts, capture, cases, fake: o.fake, job: {
          callId, parentId: randomUUID(), childId: randomUUID(), teaching, receipts: join(o.out, "receipts", `${callId}.jsonl`),
          concurrency: o.concurrency, network: o.network, device: o.device,
        } }).catch(e => { console.error(`call ${callId} failed:`, e); appendFileSync(cases, JSON.stringify({ callId, teaching, concurrency: o.concurrency, error: String(e) }) + "\n"); });
      });
      await Promise.all(batch);
      console.log(`${teaching}: ${Math.min(start + o.concurrency, o.calls)}/${o.calls} calls at concurrency ${o.concurrency}`);
    }
  }
  await server.close();
}
