import { describe, expect, it } from "vitest";
import { boardPaths, type Batch } from "@/lib/board";
import { createBoardReceiver, createBoardSender } from "@/lib/board-protocol";
import { createMemoryTransport } from "@/lib/board-protocol-memory";
import { boardRpcHandler, boardRpcTransport } from "@/lib/board-rpc";
import { createBoardSpeech, cueReport, type CueMeasurement } from "@/lib/board-speech";

const columns: Batch = { transactionId: "columns", commands: [{ op: "columns", id: "sum", operation: "add", operands: [{ id: "top", value: "27" }, { id: "bottom", value: "39" }], place: { region: "main" } }] };
const answer: Batch = { transactionId: "answer", commands: [{ op: "put", target: { objectId: "sum", part: "cell", rowId: "answer", column: "ones" }, value: "6" }] };
async function setup() {
  const receiver = createBoardReceiver({ sessionId: "call" });
  const transport = createMemoryTransport(receiver);
  const sender = createBoardSender({ sessionId: "call", senderId: "worker", transport });
  const samples: CueMeasurement[] = [];
  let now = 100;
  const speech = createBoardSpeech({ sender, now: () => now, measure: s => samples.push(s) });
  await speech.reconnect();
  return { receiver, sender, transport, speech, samples, time: (t: number) => { now = t; } };
}

describe("board speech through the real receiver and fake transport", () => {
  it("releases at the cue word only after playback reaches it, and reports worker-clock acknowledgement time", async () => {
    const c = await setup();
    await c.speech.stage("one", [{ batch: columns, word: 2 }, { batch: answer, word: 5 }]);
    await c.speech.timing("one", 2, 200, "word");
    await c.speech.timing("one", 5, 500, "word");
    expect(boardPaths(c.receiver.scene())).toEqual([]);
    await c.speech.played("one", 199);
    expect(boardPaths(c.receiver.scene())).toEqual([]);
    c.time(300);
    await c.speech.played("one", 200);
    expect(c.receiver.snapshot().events.filter(e => e.kind === "batch").map(e => e.batchId)).toEqual(["columns"]);
    c.sender.useTransport({ call: request => {
      if (request.type === "release") c.time(625);
      return c.transport.call(request);
    } });
    c.time(600);
    await c.speech.played("one", 500);
    expect(c.receiver.staged()).toEqual([]);
    expect(c.samples).toMatchObject([{ batchId: "columns", source: "word", audioMs: 200, reachedAt: 300 }, { batchId: "answer", source: "word", audioMs: 500, reachedAt: 600 }]);
    expect(cueReport(c.samples)[0]).toMatchObject({ source: "word", count: 2, shown: 2, p50AcknowledgementMs: 0, p95AcknowledgementMs: 25 });
  });

  it("interrupts only unshown batches and refuses late timing and playback from that speech", async () => {
    const c = await setup();
    await c.speech.stage("one", [{ batch: columns, word: 2 }, { batch: answer, word: 5 }]);
    await c.speech.timing("one", 2, 200, "word");
    await c.speech.played("one", 200);
    const visible = boardPaths(c.receiver.scene());
    const cancel = c.speech.interrupt();
    await Promise.all([c.speech.timing("one", 5, 500, "word"), c.speech.played("one", 1000), cancel]);
    expect(boardPaths(c.receiver.scene())).toEqual(visible);
    await c.sender.sync();
    expect(c.sender.batchState("answer")).toBe("cancelled");
    expect(c.sender.batchState("columns")).toBe("shown");
    expect(c.receiver.staged()).toEqual([]);
  });

  it("cancels a stage in flight and does not let its late callback show it", async () => {
    const c = await setup();
    c.transport.hold();
    const stage = c.speech.stage("one", [{ batch: columns, word: 1 }]);
    const interrupt = c.speech.interrupt();
    c.transport.flush();
    await Promise.all([stage, interrupt]);
    await c.speech.played("one", 1000);
    expect(boardPaths(c.receiver.scene())).toEqual([]);
    expect(c.receiver.staged()).toEqual([]);
  });

  it("restores a new receiver from its snapshot, starts a new epoch and refuses an old release", async () => {
    const c = await setup();
    await c.speech.stage("one", [{ batch: columns, word: 1 }, { batch: answer, word: 2 }]);
    await c.speech.timing("one", 1, 100, "word");
    await c.speech.played("one", 100);
    const oldEpoch = c.receiver.epoch();
    const replacement = createBoardReceiver({ sessionId: "call", epoch: oldEpoch, snapshot: c.receiver.snapshot() });
    c.sender.useTransport(createMemoryTransport(replacement));
    await c.speech.reconnect();
    expect(boardPaths(replacement.scene())).toEqual(boardPaths(c.receiver.scene()));
    expect(replacement.staged()).toEqual([]);
    expect(replacement.handle({ type: "release", sessionId: "call", epoch: oldEpoch, batchId: "answer" })).toMatchObject({ ok: false, code: "stale_epoch" });
    await c.speech.played("one", 1000);
    expect(replacement.snapshot().events.filter(e => e.kind === "batch")).toHaveLength(1);
  });

  it("uses completed sentence audio boundaries when there are no word timestamps", async () => {
    const c = await setup();
    await c.speech.stage("one", [{ batch: columns, word: 2 }, { batch: answer, word: 5 }]);
    await c.speech.timing("one", 3, 300, "sentence");
    await c.speech.timing("one", 6, 600, "sentence");
    await c.speech.played("one", 299);
    expect(boardPaths(c.receiver.scene())).toEqual([]);
    await c.speech.played("one", 300);
    expect(c.receiver.staged().map(s => s.batchId)).toEqual(["answer"]);
    await c.speech.played("one", 600);
    expect(c.sender.batchState("answer")).toBe("shown");
    expect(cueReport(c.samples)[1]).toMatchObject({ count: 2, shown: 2 });
  });

  it("does not duplicate a release after a lost answer", async () => {
    const c = await setup();
    await c.speech.stage("one", [{ batch: columns, word: 1 }]);
    c.transport.loseNextAnswer("release");
    await c.speech.timing("one", 1, 100, "word");
    await c.speech.played("one", 100);
    expect(c.receiver.snapshot().events.filter(e => e.kind === "batch")).toHaveLength(1);
  });
});

it("carries a large reconnect snapshot through bounded LiveKit RPC parts and rejects an obsolete worker", async () => {
  const c = await setup();
  await c.speech.stage("one", [{ batch: columns, word: 1 }]);
  await c.speech.timing("one", 1, 1, "word");
  await c.speech.played("one", 1);
  c.receiver.takePen();
  for (let i = 0; i < 150; i++) expect(c.receiver.addInk({ page: 1, boardWidth: 1000, stroke: { erase: false, w: 5, pts: [[0.1, i / 1000], [0.2, i / 1000]] } }).ok).toBe(true);
  await c.sender.sync();
  expect(JSON.stringify(c.sender.snapshot()).length).toBeGreaterThan(15 * 1024);
  const replacement = createBoardReceiver({ sessionId: "call" });
  const handle = boardRpcHandler(replacement, { allowed: identity => identity === "current", changed() {} });
  let serial = 0;
  const sizes: number[] = [];
  const transport = boardRpcTransport({ performRpc: async args => {
    sizes.push(new TextEncoder().encode(args.payload).length);
    return handle("current", args.payload);
  } }, "child", () => String(++serial));
  c.sender.useTransport(transport);
  await c.speech.reconnect();
  expect(replacement.snapshot()).toEqual(c.sender.snapshot());
  expect(Math.max(...sizes)).toBeLessThan(8192);
  const concurrent = await Promise.all([
    transport.call({ type: "status", sessionId: "call", since: 0 }),
    transport.call({ type: "stop", sessionId: "call", epoch: replacement.epoch(), utteranceId: "old-speech" }),
  ]);
  expect(concurrent.every(r => r.ok)).toBe(true);
  expect(() => handle("old", JSON.stringify({ id: "old", commit: true }))).toThrow("does not own");
});

it("a priority stop cancels a release already in flight before it reaches the receiver", async () => {
  const c = await setup();
  let delayed: (() => void) | undefined;
  c.sender.useTransport({ call: request => {
    if (request.type === "release") return new Promise(resolve => { delayed = () => resolve(c.receiver.handle(request)); });
    return c.transport.call(request);
  } });
  await c.speech.stage("one", [{ batch: columns, word: 1 }]);
  await c.speech.timing("one", 1, 100, "word");
  const playback = c.speech.played("one", 100);
  for (let i = 0; i < 20 && !delayed; i++) await Promise.resolve();
  expect(delayed).toBeDefined();
  await c.speech.interrupt();
  delayed!();
  await playback;
  expect(boardPaths(c.receiver.scene())).toEqual([]);
  expect(c.sender.batchState("columns")).toBe("cancelled");
});

it("a priority stop retires an apply still in flight and the next utterance can draw", async () => {
  const c = await setup();
  let delayed: (() => void) | undefined;
  c.sender.useTransport({ call: request => {
    if (request.type === "apply" && request.utteranceId === "one") return new Promise(resolve => { delayed = () => resolve(c.receiver.handle(request)); });
    return c.transport.call(request);
  } });
  const stage = c.speech.stage("one", [{ batch: columns, word: 1 }]);
  for (let i = 0; i < 30 && !delayed; i++) await Promise.resolve();
  expect(delayed).toBeDefined();
  await c.speech.interrupt();
  delayed!();
  await stage;
  expect(boardPaths(c.receiver.scene())).toEqual([]);
  expect(c.receiver.staged()).toEqual([]);
  await c.speech.stage("two", [{ batch: { ...columns, transactionId: "new-columns" }, word: 1 }]);
  await c.speech.timing("two", 1, 100, "word");
  await c.speech.played("two", 100);
  expect(c.receiver.snapshot().events.filter(e => e.kind === "batch").map(e => e.batchId)).toEqual(["new-columns"]);
});
