import { describe, expect, it } from "vitest";
import { applyBatch, boardPaths, childInk, createScene, type Batch, type Scene } from "@/lib/board";
import { createBoardReceiver, createBoardSender } from "@/lib/board-protocol";
import { createMemoryTransport } from "@/lib/board-protocol-memory";

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
  const sender = createBoardSender({ sessionId: SESSION, transport });
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
    expect(receiver.handle({ type: "reset", sessionId: SESSION, epoch: 1, snapshot: { events: [] } })).toMatchObject({ ok: true });
    expect(receiver.handle({ type: "apply", ...base, sequence: 2, ...sum("a", "1", "2"), batchId: "a" })).toMatchObject({ ok: false, code: "out_of_order" });
    expect(receiver.handle({ type: "apply", ...base, sequence: 1, batchId: "a", commands: sum("a", "1", "2").commands })).toMatchObject({ ok: true, revision: 1 });
    expect(receiver.handle({ type: "apply", ...base, baseRevision: 1, sequence: 2, batchId: "a", commands: sum("a", "1", "2").commands })).toMatchObject({ ok: false, code: "duplicate_batch" });
    expect(receiver.staged().map((s) => s.batchId)).toEqual(["a"]);
  });

  it("refuses a batch planned on an older revision of the board", async () => {
    const receiver = createBoardReceiver({ sessionId: SESSION });
    receiver.handle({ type: "reset", sessionId: SESSION, epoch: 1, snapshot: { events: [] } });
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
    const restarted = createBoardSender({ sessionId: SESSION, transport: createMemoryTransport(receiver), snapshot: sender.snapshot() });
    expect(await restarted.connect()).toMatchObject({ ok: true });

    // The old batch arrives after the reconnect: refused, and the board is the restored one.
    transport.flush();
    expect(await late).toMatchObject({ ok: false, code: "stale_epoch" });
    expect(receiver.staged()).toEqual([]);
    expect(ids(receiver.scene())).toEqual(before);
    expect(await restarted.send(put("c", "a", "ones", "6"))).toMatchObject({ ok: true });
  });

  it("never goes back to an older epoch", () => {
    const receiver = createBoardReceiver({ sessionId: SESSION });
    const reset = (epoch: number) => receiver.handle({ type: "reset", sessionId: SESSION, epoch, snapshot: { events: [] } });
    expect(reset(2)).toMatchObject({ ok: true, epoch: 2 });
    expect(reset(1)).toMatchObject({ ok: false, code: "stale_epoch", epoch: 2 });
    expect(reset(2)).toMatchObject({ ok: false, code: "stale_epoch", epoch: 2 });
    const old = { type: "apply", sessionId: SESSION, epoch: 1, sequence: 1, baseRevision: 0, batchId: "a", commands: sum("a", "1", "2").commands };
    expect(receiver.handle(old)).toMatchObject({ ok: false, code: "stale_epoch" });
    expect(receiver.handle({ type: "cancel", sessionId: SESSION, epoch: 1 })).toMatchObject({ ok: false, code: "stale_epoch" });
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
    const bad = { type: "reset", sessionId: SESSION, epoch: 9, snapshot: { events: [{ kind: "batch", batchId: "x", commands: [{ op: "remove", objectId: "nothing" }] }] } };
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
