import { describe, expect, it } from "vitest";
import { applyBatch, boardPaths, childInk, createScene, type Batch, type Scene } from "@/lib/board";
import { MAX_BATCH_BYTES, createBoardReceiver, createBoardSender, restoreScene, type BoardRequest, type BoardSender } from "@/lib/board-protocol";
import { createMemoryTransport, type MemoryTransport } from "@/lib/board-protocol-memory";

// The board batch protocol (#328, spec #297): Maya's side sends board batches one at a time; the child's browser checks,
// stages, shows and acknowledges them. These tests drive both sides only through their public interface, over the
// in-memory transport, with the real board core behind the receiver.

const SESSION = "call-1";

const sum = (id: string, a: string, b: string, below?: string): Batch => ({
  transactionId: id,
  commands: [
    {
      op: "columns",
      id,
      operation: "add",
      operands: [
        { id: "top", value: a },
        { id: "bottom", value: b },
      ],
      place: below ? { below } : { region: "main" },
    },
  ],
});
const put = (id: string, objectId: string, column: string, value: string): Batch => ({
  transactionId: id,
  commands: [{ op: "put", target: { objectId, part: "cell", rowId: "answer", column }, value }],
});

/** The board the core draws for these batches applied directly, one after another: the independent expectation. */
function direct(...batches: Batch[]): Scene {
  let scene = createScene();
  for (const b of batches) {
    const r = applyBatch(scene, b);
    if (!r.ok) throw new Error(`refused: ${r.refusal.code}`);
    scene = r.scene;
  }
  return scene;
}
/** Lets every pending promise and microtask run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const ids = (scene: Scene) => boardPaths(scene).map((p) => p.id);

async function setup() {
  const receiver = createBoardReceiver({ sessionId: SESSION });
  const transport = createMemoryTransport(receiver);
  const sender = createBoardSender({ sessionId: SESSION, senderId: "agent-1", transport });
  expect(await sender.connect()).toMatchObject({ ok: true });
  return { receiver, transport, sender };
}

describe("one batch", () => {
  it("is staged on acceptance, drawn on release, and acknowledged once the child has seen it", async () => {
    const { receiver, sender } = await setup();
    const batch = sum("a", "27", "39");

    expect(await sender.send(batch)).toMatchObject({ ok: true, state: "accepted" });
    // Accepted is not shown: the child's board is still empty until the speech reaches the step.
    expect(boardPaths(receiver.scene())).toEqual([]);
    expect(receiver.staged().map((s) => s.batchId)).toEqual(["a"]);

    const [released] = receiver.release("a");
    expect(released.batchId).toBe("a");
    expect(released.drawn.map((p) => p.id)).toEqual(ids(direct(batch)));
    expect(ids(receiver.scene())).toEqual(ids(direct(batch)));
    await sender.sync();
    expect(sender.batchState("a")).toBe("shown");

    receiver.presented("a");
    await sender.sync();
    expect(sender.batchState("a")).toBe("presented");
  });
});

describe("a lost acknowledgement", () => {
  it("after the receiver applied the batch does not duplicate strokes when the sender retries", async () => {
    const { receiver, transport, sender } = await setup();
    const first = sum("a", "27", "39");
    const second = put("b", "a", "ones", "6");

    transport.loseNextAnswer();
    expect(await sender.send(first)).toMatchObject({ ok: true, state: "accepted" });
    // The receiver saw the batch twice (the lost one and the retry) and staged it once.
    expect(transport.delivered.filter((r) => r.type === "apply").map((r) => r.type === "apply" && r.batchId)).toEqual(["a", "a"]);
    expect(receiver.staged().map((s) => s.batchId)).toEqual(["a"]);

    // The next batch still lines up: its sequence and revision follow the first one.
    expect(await sender.send(second)).toMatchObject({ ok: true, state: "accepted" });
    receiver.release("b");
    expect(ids(receiver.scene())).toEqual(ids(direct(first, second)));
  });

  it("for a batch already shown answers with what the child has seen", async () => {
    const { receiver, transport, sender } = await setup();
    transport.hold();
    const sent = sender.send(sum("a", "27", "39"));
    await settle();
    transport.loseNextAnswer();
    transport.flush();
    // The answer is lost; the speech reaches the step and the child sees it before the retry arrives.
    transport.hold();
    await settle();
    receiver.release("a");
    receiver.presented("a");
    transport.flush();
    expect(await sent).toMatchObject({ ok: true, state: "presented" });
    expect(ids(receiver.scene())).toEqual(ids(direct(sum("a", "27", "39"))));
  });

  it("gives up after its retries and needs a new connect", async () => {
    const { transport, sender } = await setup();
    transport.cut();
    expect(await sender.send(sum("a", "27", "39"))).toMatchObject({ ok: false, code: "unreachable" });
    expect(await sender.send(sum("b", "1", "2"))).toMatchObject({ ok: false, code: "unreachable" });
  });
});

describe("order", () => {
  it("sends one batch at a time, numbered in order, even when the caller does not wait", async () => {
    const { receiver, transport, sender } = await setup();
    const results = await Promise.all([sender.send(sum("a", "27", "39")), sender.send(put("b", "a", "ones", "6")), sender.send(put("c", "a", "tens", "6"))]);
    expect(results.map((r) => r.ok)).toEqual([true, true, true]);
    expect(transport.maxInFlight).toBe(1);
    const applies = transport.delivered.flatMap((r) => (r.type === "apply" ? [[r.batchId, r.sequence]] : []));
    expect(applies).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    expect(receiver.staged().map((s) => s.batchId)).toEqual(["a", "b", "c"]);
  });

  it("refuses a batch out of order or under a used id, and keeps the board as it was", async () => {
    const receiver = createBoardReceiver({ sessionId: SESSION });
    const base = { sessionId: SESSION, epoch: 1, baseRevision: 0 };
    expect(receiver.handle({ type: "reset", sessionId: SESSION, senderId: "agent-1", epoch: 1, observedEpoch: 0, snapshot: { events: [] } })).toMatchObject({ ok: true });
    expect(receiver.handle({ type: "apply", ...base, sequence: 2, ...sum("a", "1", "2"), batchId: "a" })).toMatchObject({ ok: false, code: "out_of_order" });
    expect(receiver.handle({ type: "apply", ...base, sequence: 1, batchId: "a", commands: sum("a", "1", "2").commands })).toMatchObject({ ok: true, revision: 1 });
    expect(receiver.handle({ type: "apply", ...base, baseRevision: 1, sequence: 2, batchId: "a", commands: sum("a", "1", "2").commands })).toMatchObject({ ok: false, code: "duplicate_batch" });
    expect(receiver.staged().map((s) => s.batchId)).toEqual(["a"]);
  });

  it("refuses a batch planned on an older revision of the board", async () => {
    const receiver = createBoardReceiver({ sessionId: SESSION });
    receiver.handle({ type: "reset", sessionId: SESSION, senderId: "agent-1", epoch: 1, observedEpoch: 0, snapshot: { events: [] } });
    receiver.handle({ type: "apply", sessionId: SESSION, epoch: 1, sequence: 1, baseRevision: 0, batchId: "a", commands: sum("a", "1", "2").commands });
    const stale = receiver.handle({ type: "apply", sessionId: SESSION, epoch: 1, sequence: 2, baseRevision: 0, batchId: "b", commands: put("b", "a", "ones", "3").commands });
    expect(stale).toMatchObject({ ok: false, code: "stale_revision", revision: 1 });
    // A stale revision is not a decision about the batch: sent again on the current revision, it is accepted.
    expect(receiver.handle({ type: "apply", sessionId: SESSION, epoch: 1, sequence: 2, baseRevision: 1, batchId: "b", commands: put("b", "a", "ones", "3").commands })).toMatchObject({ ok: true });
  });

  it("keeps the core's refusal for a batch, so a retry gets the same answer and the next batch follows it", async () => {
    const { receiver, sender } = await setup();
    const wrong = put("w", "nothing", "ones", "1");
    const first = await sender.send(wrong);
    expect(first).toMatchObject({ ok: false, code: "refused", refusal: { code: "unknown_target" } });
    expect(await sender.send(sum("a", "1", "2"))).toMatchObject({ ok: true, state: "accepted" });
    expect(receiver.staged().map((s) => s.batchId)).toEqual(["a"]);
  });
});

describe("reconnect", () => {
  it("restores the board on a reloaded browser from the snapshot of what the child had seen", async () => {
    const { receiver, sender } = await setup();
    const first = sum("a", "27", "39");
    const second = put("b", "a", "ones", "6");
    await sender.send(first);
    await sender.send(second);
    receiver.release("b");
    receiver.presented("b");
    await sender.sync();

    // The browser reloads: a new receiver with an empty board, on a new line.
    const reloaded = createBoardReceiver({ sessionId: SESSION });
    sender.useTransport(createMemoryTransport(reloaded));
    expect(await sender.connect()).toMatchObject({ ok: true });
    expect(ids(reloaded.scene())).toEqual(ids(direct(first, second)));
    expect(boardPaths(reloaded.scene())).toEqual(boardPaths(receiver.scene()));

    // Maya carries on from the restored board.
    expect(await sender.send(put("c", "a", "tens", "6"))).toMatchObject({ ok: true });
    reloaded.release("c");
    expect(ids(reloaded.scene())).toEqual(ids(direct(first, second, put("c", "a", "tens", "6"))));
  });

  it("refuses a batch from before the reconnect that arrives late, and keeps the restored board", async () => {
    const { receiver, transport, sender } = await setup();
    await sender.send(sum("a", "27", "39"));
    receiver.release("a");
    await sender.sync();
    const before = ids(receiver.scene());

    // The agent's process stops with a batch stuck in flight. A new process starts from the stored snapshot and connects.
    transport.hold();
    const late = sender.send(put("b", "a", "ones", "6"));
    await settle();
    const restarted = createBoardSender({ sessionId: SESSION, senderId: "agent-2", transport: createMemoryTransport(receiver), snapshot: sender.snapshot() });
    expect(await restarted.connect()).toMatchObject({ ok: true });

    // The old batch arrives after the reconnect: refused, and the board is the restored one.
    transport.flush();
    expect(await late).toMatchObject({ ok: false, code: "stale_epoch" });
    expect(receiver.staged()).toEqual([]);
    expect(ids(receiver.scene())).toEqual(before);
    expect(await restarted.send(put("c", "a", "ones", "6"))).toMatchObject({ ok: true });

    // The old process is still alive and connects again: it cannot take the board back from the new one.
    transport.flush();
    expect(await sender.connect()).toMatchObject({ ok: false, code: "superseded" });
    expect(receiver.staged().map((s) => s.batchId)).toEqual(["c"]);
    expect(await restarted.send(put("d", "a", "tens", "6"))).toMatchObject({ ok: true });
  });

  it("keeps what the child saw while the reconnect was under way", async () => {
    const { receiver, transport, sender } = await setup();
    await sender.send(sum("a", "27", "39"));
    await sender.send(put("b", "a", "ones", "6"));
    receiver.release("a");

    // The connect reads the log; then the speech reaches "b" before the reset arrives.
    transport.hold();
    const connecting = sender.connect();
    await settle();
    transport.flush();
    transport.hold();
    await settle();
    receiver.release("b");
    transport.flush();
    // Every later request goes straight through.
    expect(await connecting).toMatchObject({ ok: true });
    // The first reset was refused (the log had grown); the connect read on and tried again.
    expect(transport.delivered.filter((r) => r.type === "reset")).toHaveLength(3);
    expect(ids(receiver.scene())).toEqual(ids(direct(sum("a", "27", "39"), put("b", "a", "ones", "6"))));
    expect(sender.snapshot().events.filter((e) => e.kind === "batch").map((e) => e.kind === "batch" && e.batchId)).toEqual(["a", "b"]);
  });

  it("survives a lost answer to the reset", async () => {
    const { receiver, transport, sender } = await setup();
    await sender.send(sum("a", "27", "39"));
    receiver.release("a");
    const epoch = sender.epoch();
    transport.loseNextAnswer("reset");
    // The reset acts; its answer is lost and the retry answers the same.
    expect(await sender.connect()).toMatchObject({ ok: true });
    expect(transport.delivered.filter((r) => r.type === "reset").map((r) => r.type === "reset" && r.epoch)).toEqual([1, 2, 2]);
    expect(sender.epoch()).toBe(epoch + 1);
    expect(ids(receiver.scene())).toEqual(ids(direct(sum("a", "27", "39"))));
    expect(await sender.send(put("b", "a", "ones", "6"))).toMatchObject({ ok: true });
  });

  it("never goes back to an older epoch", () => {
    const receiver = createBoardReceiver({ sessionId: SESSION });
    const reset = (epoch: number, observedEpoch: number, senderId = "agent-1") => receiver.handle({ type: "reset", sessionId: SESSION, senderId, epoch, observedEpoch, snapshot: { events: [] } });
    expect(reset(2, 0)).toMatchObject({ ok: true, epoch: 2 });
    expect(reset(1, 0)).toMatchObject({ ok: false, code: "stale_epoch", epoch: 2 });
    expect(reset(2, 0, "agent-2")).toMatchObject({ ok: false, code: "stale_epoch", epoch: 2 });
    // A claim made on an epoch the board has left: another sender claimed it in between.
    expect(reset(3, 1, "agent-2")).toMatchObject({ ok: false, code: "stale_epoch", epoch: 2 });
    // The same sender's reset again (its answer was lost) changes nothing.
    expect(reset(2, 0)).toMatchObject({ ok: true, epoch: 2 });
    const old = { type: "apply", sessionId: SESSION, epoch: 1, sequence: 1, baseRevision: 0, batchId: "a", commands: sum("a", "1", "2").commands };
    expect(receiver.handle(old)).toMatchObject({ ok: false, code: "stale_epoch" });
    expect(receiver.handle({ type: "cancel", sessionId: SESSION, epoch: 1, cancelId: "c", through: 1 })).toMatchObject({ ok: false, code: "stale_epoch" });
  });

  it("drops staged batches the child never saw, and the sender counts them as cancelled", async () => {
    const { receiver, sender } = await setup();
    await sender.send(sum("a", "27", "39"));
    receiver.release("a");
    await sender.send(put("b", "a", "ones", "6"));
    // The line blips; the same browser answers the new connect.
    expect(await sender.connect()).toMatchObject({ ok: true });
    expect(receiver.staged()).toEqual([]);
    expect(ids(receiver.scene())).toEqual(ids(direct(sum("a", "27", "39"))));
    expect(sender.batchState("a")).toBe("shown");
    expect(sender.batchState("b")).toBe("cancelled");
  });

  it("refuses a snapshot that does not replay and keeps the board", async () => {
    const { receiver, sender } = await setup();
    await sender.send(sum("a", "27", "39"));
    receiver.release("a");
    await sender.sync();
    const events = [...sender.snapshot().events, { kind: "batch", batchId: "x", commands: [{ op: "remove", objectId: "nothing" }] }];
    const bad = { type: "reset", sessionId: SESSION, senderId: "agent-1", epoch: 9, observedEpoch: 1, snapshot: { events } };
    expect(receiver.handle(bad)).toMatchObject({ ok: false, code: "invalid_request", epoch: 1 });
    expect(ids(receiver.scene())).toEqual(ids(direct(sum("a", "27", "39"))));
  });
});

describe("an interruption", () => {
  it("cancels the staged batches the child has not seen and keeps the strokes already shown", async () => {
    const { receiver, transport, sender } = await setup();
    const first = sum("a", "27", "39");
    await sender.send(first, { utteranceId: "u1" });
    await sender.send(put("b", "a", "ones", "6"), { utteranceId: "u1" });
    await sender.send(put("c", "a", "tens", "6"), { utteranceId: "u2" });
    expect(receiver.staged()).toEqual([
      { batchId: "a", utteranceId: "u1" },
      { batchId: "b", utteranceId: "u1" },
      { batchId: "c", utteranceId: "u2" },
    ]);
    receiver.release("a");

    // The child starts talking over Maya.
    expect(await sender.cancel()).toEqual({ ok: true, cancelled: ["b", "c"] });
    expect(receiver.staged()).toEqual([]);
    expect(ids(receiver.scene())).toEqual(ids(direct(first)));
    expect(receiver.release("b")).toEqual([]);
    expect(sender.batchState("a")).toBe("shown");
    expect(sender.batchState("b")).toBe("cancelled");

    // A late retry of a cancelled batch does not bring it back.
    const retry = transport.delivered.find((r) => r.type === "apply" && r.batchId === "b")!;
    expect(receiver.handle(retry)).toMatchObject({ ok: true, state: "cancelled" });
    expect(receiver.staged()).toEqual([]);

    // Maya carries on from the board the child sees: the same step under its own new id.
    expect(await sender.send(put("b2", "a", "ones", "6"))).toMatchObject({ ok: true, state: "accepted" });
    receiver.release("b2");
    expect(ids(receiver.scene())).toEqual(ids(direct(first, put("b2", "a", "ones", "6"))));
  });

  it("with nothing staged changes nothing", async () => {
    const { receiver, sender } = await setup();
    await sender.send(sum("a", "27", "39"));
    receiver.release("a");
    expect(await sender.cancel()).toEqual({ ok: true, cancelled: [] });
    expect(await sender.send(put("b", "a", "ones", "6"))).toMatchObject({ ok: true });
  });
});

describe("the pen", () => {
  // A short stroke in the board's empty bottom-right corner, in board widths, as the test whiteboard records it.
  const stroke = { page: 1, boardWidth: 800, stroke: { erase: false, w: 3, pts: [[0.85, 0.55], [0.9, 0.58]] as [number, number][] } };

  it("taken by the child while a batch is in flight: the batch is refused when it arrives and sent again after", async () => {
    const { receiver, transport, sender } = await setup();
    await sender.send(sum("a", "27", "39"));
    receiver.release("a");

    transport.hold();
    const inFlight = sender.send(put("b", "a", "ones", "6"));
    await settle();
    expect(receiver.takePen()).toEqual({ cancelled: [] });
    transport.flush();
    expect(await inFlight).toMatchObject({ ok: false, code: "pen_with_child" });
    expect(receiver.staged()).toEqual([]);

    expect(receiver.addInk(stroke)).toMatchObject({ ok: true });
    receiver.givePen();
    // The child wrote on the board: Maya's plan is from before, so it is refused until Maya reads the board again.
    expect(await sender.send(put("b", "a", "ones", "6"))).toMatchObject({ ok: false, code: "stale_revision" });
    expect(await sender.send(put("b", "a", "ones", "6"))).toMatchObject({ ok: false, code: "stale_revision" });
    await sender.sync();
    expect(sender.snapshot().events.map((e) => e.kind)).toEqual(["batch", "ink"]);
    expect(await sender.send(put("b", "a", "ones", "6"))).toMatchObject({ ok: true, state: "accepted" });
    receiver.release("b");
    expect(childInk(receiver.scene())).toHaveLength(1);
    expect(boardPaths(receiver.scene()).filter((p) => p.objectId === "a").length).toBeGreaterThan(boardPaths(direct(sum("a", "27", "39"))).length);
  });

  it("taken while batches are staged: the unshown ones are cancelled, the one being drawn stays", async () => {
    const { receiver, sender } = await setup();
    await sender.send(sum("a", "27", "39"));
    await sender.send(put("b", "a", "ones", "6"));
    await sender.send(put("c", "a", "tens", "6"));
    receiver.release("a");

    expect(receiver.takePen()).toEqual({ cancelled: ["b", "c"] });
    // The renderer finishes drawing what was released before the pen moved.
    receiver.presented("a");
    expect(ids(receiver.scene())).toEqual(ids(direct(sum("a", "27", "39"))));
    await sender.sync();
    expect([sender.batchState("a"), sender.batchState("b"), sender.batchState("c")]).toEqual(["presented", "cancelled", "cancelled"]);
    expect(sender.pen()).toBe("child");
  });

  it("is needed to write: the child cannot write while Maya holds it", async () => {
    const { receiver } = await setup();
    expect(receiver.addInk(stroke)).toMatchObject({ ok: false });
    expect(childInk(receiver.scene())).toEqual([]);
  });

  it("the child's ink comes back after a reconnect", async () => {
    const { receiver, sender } = await setup();
    await sender.send(sum("a", "27", "39"));
    receiver.release("a");
    receiver.takePen();
    receiver.addInk(stroke);
    await sender.sync();

    const reloaded = createBoardReceiver({ sessionId: SESSION });
    sender.useTransport(createMemoryTransport(reloaded));
    expect(await sender.connect()).toMatchObject({ ok: true });
    expect(childInk(reloaded.scene())).toEqual(childInk(receiver.scene()));
    expect(boardPaths(reloaded.scene())).toEqual(boardPaths(receiver.scene()));
    // A reconnect gives the pen back to Maya: the turn starts again.
    expect(sender.pen()).toBe("maya");
  });
});

describe("untrusted requests", () => {
  it("are checked before anything changes", async () => {
    const { receiver } = await setup();
    const apply = { type: "apply", sessionId: SESSION, epoch: 1, sequence: 1, baseRevision: 0, batchId: "a", commands: sum("a", "1", "2").commands };
    for (const bad of [null, 7, "apply", {}, { type: "draw" }, { ...apply, sequence: "1" }, { ...apply, batchId: "" }, { ...apply, commands: "x" }, { type: "status", sessionId: SESSION, since: -1 }, { type: "reset", sessionId: SESSION, epoch: 5, snapshot: { events: [{ kind: "ink", page: 1 }] } }])
      expect(receiver.handle(bad)).toMatchObject({ ok: false, code: "invalid_request", epoch: 1, revision: 0 });
    expect(receiver.handle({ ...apply, sessionId: "call-2" })).toMatchObject({ ok: false, code: "wrong_session" });
    expect(receiver.staged()).toEqual([]);
    expect(receiver.handle(apply)).toMatchObject({ ok: true });
  });

  it("a batch over the size limit is refused on both sides", async () => {
    const { receiver, transport, sender } = await setup();
    const big: Batch = { transactionId: "big", commands: [{ op: "write", id: "w", text: "x".repeat(9000), place: { region: "main" } }] };
    expect(await sender.send(big)).toMatchObject({ ok: false, code: "too_large" });
    expect(transport.delivered.some((r) => r.type === "apply")).toBe(false);
    const raw = { type: "apply", sessionId: SESSION, epoch: 1, sequence: 1, baseRevision: 0, batchId: "big", commands: big.commands };
    expect(receiver.handle(raw)).toMatchObject({ ok: false, code: "too_large" });
    expect(await sender.send(sum("a", "1", "2"))).toMatchObject({ ok: true });
  });
});

describe("sync", () => {
  it("reads a long board log in pages small enough for one answer", async () => {
    const { receiver, transport, sender } = await setup();
    receiver.takePen();
    const long = { erase: false, w: 3, pts: Array.from({ length: 120 }, (_, i) => [0.05 + i * 0.007, 0.6] as [number, number]) };
    for (let i = 0; i < 12; i++) expect(receiver.addInk({ page: 1, boardWidth: 800, stroke: long })).toMatchObject({ ok: true });
    expect(await sender.sync()).toBe(true);
    expect(sender.snapshot().events).toHaveLength(12);
    const statuses = transport.delivered.filter((r) => r.type === "status");
    expect(statuses.length).toBeGreaterThan(2);
  });
});

describe("batch states", () => {
  it("reach the sender through the paged log, however many batches the call has", async () => {
    const { receiver, transport, sender } = await setup();
    await sender.send(sum("a", "27", "39"));
    receiver.release("a");
    for (let i = 0; i < 200; i++) {
      expect(await sender.send({ transactionId: `m${i}`, commands: [{ op: "focus", target: { objectId: "a", part: "whole" } }] })).toMatchObject({ ok: true });
      receiver.release(`m${i}`);
      receiver.presented(`m${i}`);
    }
    await sender.send(put("x", "a", "ones", "6"));
    await sender.cancel();
    expect(await sender.sync()).toBe(true);
    expect([sender.batchState("a"), sender.batchState("m0"), sender.batchState("m199"), sender.batchState("x")]).toEqual(["shown", "presented", "presented", "cancelled"]);
    expect(transport.largestAnswerBytes).toBeLessThan(15 * 1024);
  });
});

describe("a lost acknowledgement while the child writes", () => {
  it("does not let Maya plan past the child's ink", async () => {
    const { receiver, transport, sender } = await setup();
    const stroke = { page: 1, boardWidth: 800, stroke: { erase: false, w: 3, pts: [[0.85, 0.55], [0.9, 0.58]] as [number, number][] } };
    await sender.send(sum("a", "27", "39"));
    transport.hold();
    const sent = sender.send(put("b", "a", "ones", "6"));
    await settle();
    transport.loseNextAnswer();
    transport.flush();
    transport.hold();
    await settle();
    // Before the retry arrives, "b" is shown, and the child takes the pen, writes and gives it back.
    receiver.release("b");
    receiver.takePen();
    receiver.addInk(stroke);
    receiver.givePen();
    transport.flush();
    expect(await sent).toMatchObject({ ok: true, state: "shown" });
    expect(await sender.send(put("c", "a", "tens", "6"))).toMatchObject({ ok: false, code: "stale_revision" });
    await sender.sync();
    expect(await sender.send(put("c", "a", "tens", "6"))).toMatchObject({ ok: true });
  });
});

// ---------- review findings on #359 ----------

const shortStroke = { page: 1, boardWidth: 800, stroke: { erase: false, w: 3, pts: [[0.85, 0.55], [0.9, 0.58]] as [number, number][] } };
const focus = (id: string): Batch => ({ transactionId: id, commands: [{ op: "focus", target: { objectId: "a", part: "whole" } }] });

describe("a reset", () => {
  it("never replaces the receiver's log: a snapshot that differs in an existing event is refused and the child's ink stays", async () => {
    const { receiver, sender } = await setup();
    await sender.send(sum("a", "27", "39"));
    receiver.release("a");
    receiver.takePen();
    receiver.addInk(shortStroke);
    receiver.givePen();
    await sender.sync();
    const log = sender.snapshot().events;
    expect(log.map((e) => e.kind)).toEqual(["batch", "ink"]);
    const reset = (events: unknown[]) => receiver.handle({ type: "reset", sessionId: SESSION, senderId: "other", epoch: 2, observedEpoch: 1, snapshot: { events } });

    // The same length, the ink replaced; longer, the ink replaced; the shown batch left out.
    for (const events of [[log[0], { kind: "presented", batchId: "a" }], [log[0], { kind: "presented", batchId: "a" }, { kind: "presented", batchId: "a" }], [log[1], log[1]]])
      expect(reset(events)).toMatchObject({ ok: false, code: "conflict", epoch: 1, logLength: 2 });
    expect(childInk(receiver.scene())).toHaveLength(1);
    expect(ids(receiver.scene())).toEqual(ids(direct(sum("a", "27", "39"))));

    // The same events (in another key order, as another encoder writes them) and one more: accepted, the ink kept.
    const ink = log[1] as Extract<(typeof log)[number], { kind: "ink" }>;
    const reordered = { stroke: { pts: ink.stroke.pts, w: ink.stroke.w, erase: ink.stroke.erase }, boardWidth: ink.boardWidth, page: ink.page, kind: "ink" };
    expect(reset([log[0], reordered, { kind: "presented", batchId: "a" }])).toMatchObject({ ok: true, epoch: 2, logLength: 3 });
    expect(childInk(receiver.scene())).toHaveLength(1);
  });
});

describe("a cancel", () => {
  it("delivered late, after its retry and the next plan, changes nothing", async () => {
    const { receiver, transport, sender } = await setup();
    await sender.send(sum("a", "27", "39"));
    receiver.release("a");
    await sender.send(focus("old-plan"));

    // The first cancel times out before it reaches the board; its retry gets through.
    transport.delayNext("cancel");
    expect(await sender.cancel()).toEqual({ ok: true, cancelled: ["old-plan"] });
    expect(await sender.send(focus("new-plan"))).toMatchObject({ ok: true, state: "accepted" });
    // The first cancel arrives now: the board keeps the new plan.
    expect(transport.deliverDelayed()).toMatchObject([{ ok: true, type: "cancel" }]);
    expect(receiver.staged().map((s) => s.batchId)).toEqual(["new-plan"]);
    expect(sender.batchState("new-plan")).toBe("accepted");
  });

  it("answers its retry after a lost answer with what it cancelled the first time", async () => {
    const { receiver, transport, sender } = await setup();
    await sender.send(sum("a", "27", "39"));
    receiver.release("a");
    await sender.send(focus("old-plan"));
    transport.loseNextAnswer("cancel");
    expect(await sender.cancel()).toEqual({ ok: true, cancelled: ["old-plan"] });
    expect(transport.delivered.filter((r) => r.type === "cancel")).toHaveLength(2);
  });

  it("cancels only the batches sent before it", async () => {
    const { receiver, sender } = await setup();
    await sender.send(sum("a", "27", "39"));
    receiver.release("a");
    await sender.send(focus("b"));
    await sender.send(focus("c"));
    // A cancel that names batches 1 and 2 of this epoch: "c" (number 3) stays.
    expect(receiver.handle({ type: "cancel", sessionId: SESSION, epoch: 1, cancelId: "x", through: 2 })).toMatchObject({ ok: true, type: "cancel" });
    expect(receiver.staged().map((s) => s.batchId)).toEqual(["c"]);
    await sender.sync();
    expect([sender.batchState("b"), sender.batchState("c")]).toEqual(["cancelled", "accepted"]);
  });
});

describe("answers", () => {
  it("stay under the size limit when one stroke of the child's is larger than an answer", async () => {
    const { receiver, transport, sender } = await setup();
    receiver.takePen();
    const stroke = { erase: false, w: 3, pts: Array.from({ length: 1200 }, (_, i) => [0.5 + i / 10000, 0.6 + Math.sin(i) / 100] as [number, number]) };
    expect(receiver.addInk({ page: 1, boardWidth: 800, stroke })).toMatchObject({ ok: true });
    receiver.addInk(shortStroke);
    expect(await sender.sync()).toBe(true);
    const events = sender.snapshot().events;
    expect(events.map((e) => e.kind)).toEqual(["ink", "ink"]);
    expect(events[0]).toEqual({ kind: "ink", page: 1, boardWidth: 800, stroke });
    expect(transport.largestAnswerBytes).toBeLessThanOrEqual(MAX_BATCH_BYTES);

    // The read log restores the same board on a reloaded browser.
    const reloaded = createBoardReceiver({ sessionId: SESSION });
    sender.useTransport(createMemoryTransport(reloaded));
    expect(await sender.connect()).toMatchObject({ ok: true });
    expect(childInk(reloaded.scene())).toEqual(childInk(receiver.scene()));
  });

  it("stay under the size limit for a large cancellation and a refusal", async () => {
    const { receiver, transport, sender } = await setup();
    await sender.send(sum("a", "27", "39"));
    receiver.release("a");
    const long = (i: number) => `${String(i).padStart(3, "0")}-${"x".repeat(60)}`;
    for (let i = 0; i < 150; i++) expect(await sender.send(focus(long(i)))).toMatchObject({ ok: true });
    const cancelled = await sender.cancel();
    expect(cancelled).toMatchObject({ ok: true });
    expect(cancelled.ok && cancelled.cancelled).toHaveLength(150);
    expect(sender.batchState(long(149))).toBe("cancelled");
    const refused = await sender.send({ transactionId: "w", commands: [{ op: "remove", objectId: "y".repeat(7800) }] });
    expect(refused).toMatchObject({ ok: false, code: "refused" });
    expect(transport.largestAnswerBytes).toBeLessThanOrEqual(MAX_BATCH_BYTES);
  });
});

describe("ownership", () => {
  it("an old sender whose first reset answer was lost does not take the board back from its replacement", async () => {
    const receiver = createBoardReceiver({ sessionId: SESSION });
    const line = createMemoryTransport(receiver);
    let replacement: ReturnType<typeof createBoardSender> | undefined;
    const original = createBoardSender({
      sessionId: SESSION,
      senderId: "original",
      transport: {
        async call(req) {
          const r = await line.call(req);
          if (req.type === "reset" && r.ok && !replacement) {
            // The reset acted; before its answer comes back, a replacement process takes the board.
            replacement = createBoardSender({ sessionId: SESSION, senderId: "replacement", transport: createMemoryTransport(receiver) });
            expect(await replacement.connect()).toMatchObject({ ok: true });
            throw new Error("The answer was lost.");
          }
          return r;
        },
      },
    });
    expect(await original.connect()).toMatchObject({ ok: false, code: "superseded" });
    expect(await original.send(sum("o", "1", "2"))).toMatchObject({ ok: false });
    expect(await replacement!.send(sum("a", "27", "39"))).toMatchObject({ ok: true, state: "accepted" });
    expect(receiver.staged().map((s) => s.batchId)).toEqual(["a"]);
  });

  it("an old sender that gave up on its first reset does not take the board back on its next connect", async () => {
    const receiver = createBoardReceiver({ sessionId: SESSION });
    const line = createMemoryTransport(receiver);
    const original = createBoardSender({ sessionId: SESSION, senderId: "original", transport: line, retries: 0 });
    // The reset acts, and its answer is lost: the original does not know it had the board.
    line.loseNextAnswer("reset");
    expect(await original.connect()).toMatchObject({ ok: false, code: "unreachable" });
    const replacement = createBoardSender({ sessionId: SESSION, senderId: "replacement", transport: createMemoryTransport(receiver) });
    expect(await replacement.connect()).toMatchObject({ ok: true });
    expect(await original.connect()).toMatchObject({ ok: false, code: "superseded" });
    expect(await replacement.send(sum("a", "27", "39"))).toMatchObject({ ok: true, state: "accepted" });
  });
});

describe("a reconnect with a lost reset answer", () => {
  it("reads the child's ink written before the retry before Maya plans again", async () => {
    const { receiver, transport, sender } = await setup();
    await sender.send(sum("a", "27", "39"));
    receiver.release("a");
    await sender.sync();
    let lost = false;
    sender.useTransport({
      async call(req) {
        const r = await transport.call(req);
        if (req.type === "reset" && r.ok && !lost) {
          lost = true;
          // The reset acted; the child takes the pen, writes and gives it back before the retry.
          receiver.takePen();
          receiver.addInk(shortStroke);
          receiver.givePen();
          throw new Error("The answer was lost.");
        }
        return r;
      },
    });
    expect(await sender.connect()).toMatchObject({ ok: true });
    expect(sender.snapshot().events.map((e) => e.kind)).toEqual(["batch", "ink"]);
    expect(await sender.send(focus("next"))).toMatchObject({ ok: true, state: "accepted" });
  });
});

describe("random interleavings", () => {
  /** A seeded pseudo-random source (mulberry32): the same seed gives the same run. */
  function random(seed: number) {
    let t = seed >>> 0;
    return () => {
      t = (t + 0x6d2b79f5) >>> 0;
      let x = Math.imul(t ^ (t >>> 15), t | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  const TYPES: BoardRequest["type"][] = ["apply", "cancel", "status", "reset"];

  async function run(seed: number, steps: number) {
    const rand = random(seed);
    const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];
    const receiver = createBoardReceiver({ sessionId: SESSION });
    /**
     * `replaced`: another sender connected after this one had a reset on the board, so this one must never act again.
     * The test decides it from what was delivered, not from what the sender says.
     */
    type Agent = { name: string; sender: BoardSender; line: MemoryTransport; replaced: boolean };
    const agents: Agent[] = [];
    const spawn = (from?: Agent) => {
      const line = createMemoryTransport(receiver);
      const name = `s${agents.length}`;
      // When the receiver acted and the answer is lost, something may happen before the retry: the child acts, or a new
      // process takes over.
      const transport = {
        async call(req: BoardRequest) {
          const before = line.delivered.length;
          try {
            return await line.call(req);
          } catch (e) {
            if (line.delivered.length > before && rand() < 0.6) {
              const r = rand();
              if (r < 0.5) childTurn();
              else if (r < 0.75) child();
              else await takeOver();
            }
            throw e;
          }
        },
      };
      const agent: Agent = { name, line, replaced: false, sender: createBoardSender({ sessionId: SESSION, senderId: name, transport, snapshot: from?.sender.snapshot() }) };
      agents.push(agent);
      return agent;
    };
    const connected = (agent: Agent) => {
      expect(agent.replaced, `${agent.name} took the board back after it was replaced`).toBe(false);
      for (const a of agents) if (a !== agent && a.line.delivered.some((r) => r.type === "reset")) a.replaced = true;
      // Maya plans on the whole board: the connect read every stroke of the child's.
      expect(agent.sender.snapshot().events.filter((e) => e.kind === "ink")).toHaveLength(inkAdded);
    };
    const takeOver = async () => {
      const next = spawn(pick(agents));
      const c = await next.sender.connect();
      trace.push(`${next.name} takes over: ${c.ok ? `epoch ${next.sender.epoch()}` : c.code}`);
      if (c.ok) connected(next);
    };
    // Reads the receiver's log as it grows and never reads an event twice: a log that changes behind it shows up below.
    const auditor = createBoardSender({ sessionId: SESSION, senderId: "auditor", transport: createMemoryTransport(receiver) });
    let inkAdded = 0;
    let batches = 0;
    const released = new Set<string>();
    const trace: string[] = [];

    /** The child takes the pen, writes and gives it back. */
    const childTurn = () => {
      receiver.takePen();
      if (receiver.addInk({ page: 1, boardWidth: 800, stroke: { erase: false, w: 3, pts: [[0.85, 0.6], [0.9, 0.62]] } }).ok) inkAdded++;
      receiver.givePen();
    };
    const child = () => {
      const r = rand();
      if (r < 0.15) receiver.takePen();
      else if (r < 0.4) receiver.givePen();
      else if (r < 0.6) {
        const long = rand() < 0.15;
        const n = long ? 1200 : 2 + Math.floor(rand() * 20);
        const pts = Array.from({ length: n }, (_, i) => [0.8 + (i / n) * 0.15, 0.5 + rand() * 0.1] as [number, number]);
        if (receiver.addInk({ page: 1, boardWidth: 800, stroke: { erase: false, w: 3, pts } }).ok) inkAdded++;
      } else {
        const staged = receiver.staged();
        if (staged.length > 0)
          for (const out of receiver.release(pick(staged).batchId)) {
            expect(released.has(out.batchId), `${out.batchId} released twice`).toBe(false);
            released.add(out.batchId);
          }
        else if (released.size > 0) receiver.presented(pick([...released]));
      }
    };

    const act = async (agent: Agent) => {
      const wasReplaced = agent.replaced;
      const ok = await actOnce(agent);
      // A replaced sender never acts again.
      if (wasReplaced) expect(ok, `${agent.name} acted after it was replaced`).toBe(false);
      return ok;
    };
    const actOnce = async (agent: Agent) => {
      const { sender } = agent;
      const r = rand();
      if (r < 0.45) {
        const id = `${agent.name}.${batches++}`;
        const batch: Batch = rand() < 0.3 ? { ...sum("a", "27", "39"), transactionId: id } : { transactionId: id, commands: [{ op: "focus", target: { objectId: "a", part: "whole" } }] };
        const sent = await sender.send(batch);
        trace.push(`${agent.name} send ${id}: ${sent.ok ? sent.state : sent.code}`);
        if (sent.ok && sent.state === "accepted") {
          // Planned on the whole board: Maya had read every stroke of the child's when the batch was taken.
          const inkRead = sender.snapshot().events.filter((e) => e.kind === "ink").length;
          expect(inkRead, `${id} planned past the child's ink`).toBe(inkAdded);
        }
        return sent.ok;
      }
      if (r < 0.7) {
        const mine = receiver.staged().flatMap((b) => (b.batchId.startsWith(`${agent.name}.`) ? [b.batchId] : []));
        // A cancel's answer is often lost, or the request is late: its retry must answer as the first one did.
        const wire = rand();
        if (wire < 0.25) agent.line.loseNextAnswer("cancel");
        else if (wire < 0.4) agent.line.delayNext("cancel");
        const c = await sender.cancel();
        trace.push(`${agent.name} cancel: ${c.ok ? c.cancelled.join(",") : c.code}`);
        if (c.ok) {
          // The answer names every batch of this sender's a cancel dropped, even when it came on a retry; a batch the
          // child's pen dropped first is not in it.
          await auditor.sync();
          const dropped = new Map(auditor.snapshot().events.flatMap((e) => (e.kind === "cancelled" ? e.batchIds.map((id) => [id, e.cancelId] as const) : [])));
          for (const id of mine) if (dropped.get(id) !== undefined) expect(c.cancelled, trace.slice(-10).join("\n")).toContain(id);
          for (const id of c.cancelled) expect(dropped.get(id), `${id} reported cancelled`).toBeDefined();
        }
        return c.ok;
      }
      if (r < 0.82) {
        const ok = await sender.sync();
        trace.push(`${agent.name} sync: ${ok}`);
        return false;
      }
      const c = await sender.connect();
      trace.push(`${agent.name} connect: ${c.ok ? `epoch ${sender.epoch()}` : c.code}`);
      if (c.ok) connected(agent);
      return c.ok;
    };

    const first = spawn();
    expect(await first.sender.connect()).toMatchObject({ ok: true });
    connected(first);

    for (let step = 0; step < steps; step++) {
      const r = rand();
      const agent = rand() < 0.75 ? agents.at(-1)! : pick(agents);
      if (r < 0.3) child();
      else if (r < 0.36) agent.line.loseNextAnswer(pick(TYPES));
      else if (r < 0.42) agent.line.delayNext(pick(TYPES));
      else if (r < 0.47) {
        const late = agent.line.deliverDelayed();
        trace.push(`${agent.name} late: ${late.length}`);
      } else if (r < 0.52) {
        // A duplicate: a copy of an earlier request arrives again.
        const all = agents.flatMap((a) => a.line.delivered);
        if (all.length > 0) receiver.handle(pick(all));
      } else if (r < 0.54) {
        // A new process takes over, from what some sender stored.
        await takeOver();
      } else if (r < 0.56) {
        // A reset with a corrupt copy of the log: a stroke of the child's left out, the length kept. It changes nothing.
        await auditor.sync();
        const events = auditor.snapshot().events;
        const ink = events.findIndex((e) => e.kind === "ink");
        if (ink >= 0) {
          const corrupt = [...events.slice(0, ink), ...events.slice(ink + 1), { kind: "presented", batchId: "none" }];
          const at = receiver.handle({ type: "status", sessionId: SESSION, since: Number.MAX_SAFE_INTEGER }).epoch;
          expect(receiver.handle({ type: "reset", sessionId: SESSION, senderId: "forger", epoch: at + 1, observedEpoch: at, snapshot: { events: corrupt } })).toMatchObject({ ok: false });
        }
      } else if (r < 0.7) {
        // The child acts while the request is on the wire.
        agent.line.hold();
        const running = act(agent);
        await settle();
        if (rand() < 0.5) child();
        else childTurn();
        agent.line.flush();
        await running;
      } else await act(agent);

      // No child ink lost, and the board is its log replayed: nothing applied twice, nothing taken out of the log.
      expect(childInk(receiver.scene()), trace.join("\n")).toHaveLength(inkAdded);
      expect(await auditor.sync()).toBe(true);
      const log = auditor.snapshot();
      const replayed = restoreScene(log);
      expect(replayed && boardPaths(replayed)).toEqual(boardPaths(receiver.scene()));
      expect(replayed && childInk(replayed)).toEqual(childInk(receiver.scene()));
      const shownIds = log.events.flatMap((e) => (e.kind === "batch" ? [e.batchId] : []));
      expect(new Set(shownIds).size).toBe(shownIds.length);
      // A cancel drops only the batches sent before it, however late a copy of it arrives.
      for (const e of log.events) {
        if (e.kind !== "cancelled" || e.cancelId === undefined) continue;
        for (const batchId of e.batchIds) {
          const owner = agents.find((a) => batchId.startsWith(`${a.name}.`))!;
          const sent = owner.line.delivered.find((q) => q.type === "apply" && q.batchId === batchId);
          const cancel = owner.line.delivered.find((q) => q.type === "cancel" && q.cancelId === e.cancelId);
          expect(sent?.type === "apply" && cancel?.type === "cancel" && sent.sequence <= cancel.through, `${e.cancelId} dropped ${batchId}, sent after it`).toBe(true);
        }
      }
      // Only the sender that holds the board's epoch has batches staged on it.
      const now = receiver.handle({ type: "status", sessionId: SESSION, since: Number.MAX_SAFE_INTEGER });
      for (const { batchId } of receiver.staged()) {
        const owner = agents.find((a) => batchId.startsWith(`${a.name}.`))!;
        expect(owner.sender.epoch(), `${batchId} staged by a sender off the board's epoch`).toBe(now.epoch);
        expect(owner.replaced).toBe(false);
      }
      for (const a of agents) expect(a.line.largestAnswerBytes).toBeLessThanOrEqual(MAX_BATCH_BYTES);
    }
    return { agents: agents.length, ink: inkAdded, shown: released.size, trace };
  }

  it("with lost requests and answers, duplicates, late cancels, resets and pen changes keep every invariant", async () => {
    const totals = { agents: 0, ink: 0, shown: 0, superseded: 0, cancelled: 0, accepted: 0, late: 0 };
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597]) {
      const r = await run(seed, 200);
      totals.agents += r.agents;
      totals.ink += r.ink;
      totals.shown += r.shown;
      totals.superseded += r.trace.filter((t) => t.endsWith("superseded")).length;
      totals.cancelled += r.trace.filter((t) => /cancel: \S/.test(t) && !/cancel: (unreachable|superseded|stale)/.test(t)).length;
      totals.accepted += r.trace.filter((t) => t.endsWith(": accepted")).length;
      totals.late += r.trace.filter((t) => /late: [1-9]/.test(t)).length;
    }
    // The runs reached every path the invariants are about.
    expect(totals.agents).toBeGreaterThan(24);
    expect(totals.ink).toBeGreaterThan(20);
    expect(totals.shown).toBeGreaterThan(20);
    expect(totals.superseded).toBeGreaterThan(0);
    expect(totals.cancelled).toBeGreaterThan(0);
    expect(totals.accepted).toBeGreaterThan(20);
    expect(totals.late).toBeGreaterThan(5);
  }, 60_000);
});
