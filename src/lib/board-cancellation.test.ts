import { expect, it } from "vitest";
import { MAX_BATCH_BYTES, createBoardReceiver, createBoardSender } from "@/lib/board-protocol";
import { BOARD_RPC, boardRpcHandler, boardRpcTransport } from "@/lib/board-rpc";
import { createBoardSpeech } from "@/lib/board-speech";

const batch = (id: string) => ({ transactionId: id, commands: [{ op: "write", id, text: "1", place: { region: "main" } }] });
async function setup() {
  const receiver = createBoardReceiver({ sessionId: "call" });
  let id = 0;
  const handle = boardRpcHandler(receiver, { allowed: identity => identity === "worker", changed() {} });
  const rawRpc = (request: unknown) => {
    const key = String(++id);
    handle("worker", JSON.stringify({ id: key, index: 0, count: 1, data: JSON.stringify(request) }));
    return JSON.parse(handle("worker", JSON.stringify({ id: key, commit: true })));
  };
  const transport = boardRpcTransport({ performRpc: async args => {
    expect(args.method).toBe(BOARD_RPC);
    return handle("worker", args.payload);
  } }, "child", () => String(++id));
  const sender = createBoardSender({ sessionId: "call", senderId: "worker", transport });
  const board = createBoardSpeech({ sender, now: () => 10000 });
  await board.connect();
  await board.stage("reused", [{ word: 1, batch: batch("old") }]);
  const old = board.capture("reused")!;
  await board.interrupt(old);
  await board.settled();
  await board.stage("reused", [{ word: 1, batch: batch("new") }]);
  const scope = board.capture("reused")!;
  const request = { sessionId: "call", epoch: sender.epoch(), cancelId: "late", through: 2 };
  return { receiver, sender, transport, board, old, scope, request, rawRpc };
}

it("R450-10 the sender refuses missing or obsolete cancellation ownership", async () => {
  const c = await setup();
  expect(await Reflect.apply(c.sender.cancel, c.sender, [])).toMatchObject({ ok: false, code: "invalid_request" });
  expect(await c.sender.cancel(c.old)).toMatchObject({ ok: false, code: "invalid_request" });
  expect(c.receiver.staged().map(b => b.batchId)).toEqual(["new"]);
  expect(c.board.owns(c.scope)).toBe(true);
  expect(await c.sender.cancel(c.scope)).toEqual({ ok: true, cancelled: ["new"] });
});

it("R450-10 the browser RPC rejects scopeless and obsolete cancellation without changing the plan", async () => {
  const c = await setup();
  for (const type of ["cancel", "stop"]) {
    for (const extra of [{}, { scope: c.old }, { scope: { ...c.scope, utteranceId: "other" } }, { scope: null }]) {
      const before = c.receiver.snapshot();
      expect(c.rawRpc({ ...c.request, type, ...extra })).toMatchObject({ ok: false, code: "invalid_request" });
      expect(c.receiver.snapshot()).toEqual(before);
      expect(c.receiver.staged().map(b => b.batchId)).toEqual(["new"]);
    }
  }
  expect(c.rawRpc({ ...c.request, type: "cancel", scope: c.scope })).toMatchObject({ ok: true, type: "cancel" });
  expect(c.receiver.staged()).toEqual([]);
});

it("R450-10 a reset or pen change cannot clear a plan it did not observe", async () => {
  const c = await setup();
  const request = { type: "reset", sessionId: "call", senderId: "worker", epoch: c.sender.epoch() + 1, observedEpoch: c.sender.epoch(), snapshot: c.receiver.snapshot() };
  for (const extra of [{}, { scope: null }, { scope: c.old }])
    expect(c.rawRpc({ ...request, ...extra })).toMatchObject({ ok: false, code: "invalid_request" });
  expect(Reflect.apply(c.receiver.takePen, c.receiver, [])).toEqual({ cancelled: [] });
  expect(c.receiver.takePen(c.old)).toEqual({ cancelled: [] });
  expect(c.receiver.staged().map(b => b.batchId)).toEqual(["new"]);
  expect(c.rawRpc({ type: "status", sessionId: "call", since: 0 })).toMatchObject({ pen: "maya" });
  expect(c.rawRpc({ ...request, scope: c.scope })).toMatchObject({ ok: true, type: "reset" });
  expect(c.receiver.staged()).toEqual([]);
});

it("R450-10 an immediate interruption of a queued replacement retires its original prior plan", async () => {
  const c = await setup();
  let resume!: () => void;
  const gate = new Promise<void>(resolve => { resume = resolve; });
  c.sender.useTransport({ async call(request) {
    if (request.type === "stop" && request.scope.generation === c.scope.generation) await gate;
    return c.transport.call(request);
  } });
  const stage = c.board.stage("third", [{ word: 1, batch: batch("third") }]);
  const scope = c.board.capture("third")!;
  const stopping = c.board.interrupt(scope);
  const replacement = c.board.stage("fourth", [{ word: 1, batch: batch("fourth") }]);
  const result = Promise.allSettled([stage, stopping, replacement]);
  await new Promise<void>(resolve => setImmediate(resolve));
  resume();
  expect((await result).map(r => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
  await c.board.settled();
  expect(c.receiver.staged().map(b => b.batchId)).toEqual(["fourth"]);
  const next = c.board.capture("fourth")!;
  await c.board.timing(next, 1, 100, "word");
  await c.board.played(next, 100);
  expect(c.receiver.snapshot().events.filter(e => e.kind === "batch").map(e => e.batchId)).toEqual(["fourth"]);
});

it("scoped snapshot parts fit the RPC bound with the longest escaped owner ID", async () => {
  const receiver = createBoardReceiver({ sessionId: "call" });
  const sizes: number[] = [];
  const sender = createBoardSender({ sessionId: "call", senderId: "worker", transport: { async call(request) {
    const response = receiver.handle(request);
    sizes.push(new TextEncoder().encode(JSON.stringify(response)).length);
    return response;
  } } });
  const scope = { utteranceId: "\u0000".repeat(64), generation: Number.MAX_SAFE_INTEGER };
  expect(await sender.connect()).toEqual({ ok: true });
  expect((await sender.send(batch("base"), { scope })).ok).toBe(true);
  receiver.release("base", scope);
  for (let i = 0; i < 150; i++)
    expect((await sender.send({ transactionId: `focus-${i}`.padEnd(64, "x"), commands: [{ op: "focus", target: { objectId: "base", part: "whole" } }] }, { scope })).ok).toBe(true);
  expect(await sender.cancel(scope)).toMatchObject({ ok: true });
  expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_BATCH_BYTES);
  expect(sender.snapshot()).toEqual(receiver.snapshot());
});
