import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { initializeLogger, type JobContext } from "@livekit/agents";
import { DisconnectReason, RoomEvent } from "@livekit/rtc-node";
import { childIdentity, voiceRoom } from "@/lib/maya-voice";

// Run main's public job entry with fake storage, providers, SDK session and run. This binds the transport callbacks
// to the public run methods. recovery.test.ts binds those same methods to the real call and close-origin records.
const f = vi.hoisted(() => ({
  hangUp: vi.fn(async () => {}), childLeft: vi.fn(async () => {}), shutdown: vi.fn(async () => {}),
  get: vi.fn(), open: vi.fn(), session: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }) }));
vi.mock("@/lib/maya-call-store", () => ({ mayaCallStore: () => ({ get: f.get }) }));
vi.mock("@/lib/maya-call-seams", () => ({ callSeams: () => ({}) }));
vi.mock("@/lib/maya-call", () => ({ mayaCalls: () => ({ openVoice: f.open }) }));
vi.mock("./opening", () => ({ voiceOpening: () => null, voiceContinuation: () => null, CONTINUE_ID: "continue.lesson" }));
vi.mock("./providers", () => ({ makeProviders: async () => ({ fake: true, stt: { provider: "fake" }, tts: { provider: "fake", prewarm() {} } }) }));
vi.mock("./child-wait", () => ({ waitForChild: async () => ({ child: {} }), presenceOf: () => "here" }));
vi.mock("@/lib/board-protocol", () => ({ createBoardSender: () => ({}) }));
vi.mock("@/lib/board-rpc", () => ({ boardRpcTransport: () => ({}) }));
vi.mock("@/lib/board-speech", () => ({ createBoardSpeech: () => ({}), cueReport: () => ({}) }));
vi.mock("./agent", () => ({
  voiceSession: f.session,
  VoiceCallRun: class {
    segment = 12; done = null;
    hangUp = f.hangUp; childLeft = f.childLeft; workerShutdown = f.shutdown;
    async agentJoined() {} async childJoined() {} attachBoardAudio() {} attachTurnTiming() {}
  },
}));
import main from "./main";

initializeLogger({ pretty: false, level: "silent" });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); });

async function job() {
  vi.stubEnv("SUPABASE_URL", "https://fake.invalid"); vi.stubEnv("SUPABASE_SECRET_KEY", "fake");
  vi.stubEnv("MAYA_STT", "fake"); vi.stubEnv("MAYA_TTS", "fake");
  const fetchBefore = globalThis.fetch;
  const id = "00000000-0000-4000-8000-000000000001", childId = "00000000-0000-4000-8000-000000000002";
  const identity = childIdentity(childId);
  const record = { id, childId, parentId: "parent", mode: "voice", status: "live" };
  f.get.mockResolvedValue(record); f.open.mockResolvedValue({ ok: true, call: { session: {}, boardSnapshot: null } });
  f.session.mockReturnValue(Object.assign(new EventEmitter(), { start: async () => {} }));
  const room = Object.assign(new EventEmitter(), { remoteParticipants: new Map([[identity, { identity }]]),
    localParticipant: { setAttributes: async () => {}, registerRpcMethod: (name: string, fn: (data: { callerIdentity: string; payload?: string }) => Promise<string>) => rpc.set(name, fn) } });
  const rpc = new Map<string, (data: { callerIdentity: string; payload?: string }) => Promise<string>>();
  let stop!: () => Promise<void>;
  const context = { job: { id: "close-job", room: { name: voiceRoom(id) }, metadata: JSON.stringify({ callId: id }) }, room,
    connect: async () => {}, shutdown: async () => {}, addShutdownCallback: (fn: () => Promise<void>) => { stop = fn; } };
  try { await main.entry(context as unknown as JobContext); } finally { globalThis.fetch = fetchBefore; }
  return { room, rpc, identity, stop };
}

it("accepts only the bound child's RPC and forwards the actual protocol reason without changing classification", async () => {
  const j = await job();
  await expect(j.rpc.get("maya.hang_up")!({ callerIdentity: "other" })).rejects.toThrow();
  expect(f.hangUp).not.toHaveBeenCalled();
  expect(await j.rpc.get("maya.hang_up")!({ callerIdentity: j.identity })).toBe("ok");
  expect(f.hangUp).toHaveBeenCalledOnce();
  j.room.emit(RoomEvent.ParticipantDisconnected, { identity: "other", disconnectReason: 1 });
  expect(f.childLeft).not.toHaveBeenCalled();
  j.room.emit(RoomEvent.ParticipantDisconnected, { identity: j.identity, disconnectReason: DisconnectReason.CLIENT_INITIATED });
  j.room.emit(RoomEvent.ParticipantDisconnected, { identity: j.identity, disconnectReason: DisconnectReason.SIGNAL_CLOSE });
  expect(f.childLeft.mock.calls).toEqual([["hang_up", DisconnectReason.CLIENT_INITIATED], ["dropped", DisconnectReason.SIGNAL_CLOSE]]);
  await j.stop(); expect(f.shutdown).toHaveBeenCalledOnce();
});

it("acknowledges an explicit hang-up with the read-only desk drain when requested", async () => {
  const j = await job();
  await expect(j.rpc.get("maya.hang_up")!({ callerIdentity: "other", payload: "board-status" })).rejects.toThrow();
  expect(await j.rpc.get("maya.hang_up")!({ callerIdentity: j.identity, payload: "board-status" })).toBe("board-status");
  expect(f.hangUp).toHaveBeenCalledOnce();
});
