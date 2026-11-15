import { describe, expect, it } from "vitest";
import type { TutorBrief } from "@/lib/maya";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession, readFateReports, type SavedTextSession } from "@/lib/maya-text";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { checkTrace, TRACE_VERSION } from "@/lib/maya-trace";
import { foldTextEvent, initialTextState, restoreTextCheckpoint, saveTextCheckpoint, type TextLogEvent, type TextLogInitial } from "@/lib/maya-text-log";
import type { TurnBrief } from "@/lib/maya-model";
import type { OperationPackage } from "@/lib/question-package";

// B1 ("shown means shown"), through the text adapter's public interface: a drawing counts as on the board only when the
// child's screen says it showed it. A fake model and a passed-in clock; no network.

const PKG = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const T0 = Date.UTC(2026, 10, 15, 16, 0, 0);
const TRADE = reply("You can't take 8 from 2, so we trade 1 ten for 10 ones. How many ones are there now?", "guide", { draw: [{ offer: "trade", place: "" }] });
const ASK = reply("How many ones are there now?", "guide");

function call(script: unknown[], callId = "fate-1") {
  let now = T0;
  const model = conversationalFake({ answer: ((_: TurnBrief, n: number) => script[Math.min(n, script.length - 1)]) as unknown as (brief: TurnBrief, n: number) => unknown });
  const session = createTextSession({ callId, package: PKG, model, clock: () => (now += 500), random: 3, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(), tutor: true });
  return { session, briefs: model.briefs as unknown as TutorBrief[] };
}

/** The trade batch Maya sent in her first teaching turn, and its keys. */
async function traded(script: unknown[], callId?: string) {
  const c = call(script, callId);
  await c.session.start();
  const out = await c.session.child("I don't get 2 minus 8.");
  const batch = out.board.find((b) => b.commands.some((x) => (x as { op?: string }).op === "regroup"));
  expect(batch).toBeDefined();
  return { ...c, batch: batch!.transactionId };
}

describe("a drawing counts as drawn only when the child's screen showed it (B1)", () => {
  it("a sent drawing with no word from the screen is listed as sent, never as drawn", async () => {
    const { session, briefs } = await traded([TRADE, ASK, ASK]);
    expect(session.session.tutor?.sent?.map((x) => x.keys)).toEqual([["trade:ones"]]);
    await session.child("12?");
    // Fail closed: no report means not shown.
    expect(briefs[1].drawn).not.toContain("trade:ones");
    expect(briefs[1].sent).toEqual(["trade:ones"]);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.version).toBe(TRACE_VERSION);
    expect(TRACE_VERSION).toBe(14);
    expect(trace.board.every((b) => b.fate === undefined)).toBe(true);
    expect(trace.counts.boardFates).toEqual({ shown: 0, skipped: 0, cancelled: 0, unreported: trace.board.length });
    expect(checkTrace(trace).ok).toBe(true);
  });

  it("a shown drawing keeps its keys and is listed as drawn", async () => {
    const { session, briefs, batch } = await traded([TRADE, ASK, ASK]);
    session.boardFates([{ batchId: batch, fate: "shown" }]);
    expect(session.session.tutor?.sent).toBeUndefined();
    expect(session.session.tutor?.drawn).toContain("trade:ones");
    await session.child("12?");
    expect(briefs[1].drawn).toContain("trade:ones");
    expect(briefs[1]).not.toHaveProperty("sent");
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.board.find((b) => b.transactionId === batch)?.fate).toBe("shown");
    expect(trace.counts.boardFates).toMatchObject({ shown: 1 });
    expect(checkTrace(trace).ok).toBe(true);
  });

  for (const fate of ["skipped", "cancelled"] as const) {
    it(`a ${fate} drawing leaves drawn and sent, and Maya can draw it again on a board that matches the screen`, async () => {
      // The next turn asks for the trade again: the kind offers it again, and the server's board takes it.
      const { session, briefs, batch } = await traded([TRADE, TRADE, ASK]);
      session.boardFates([{ batchId: batch, fate }]);
      expect(session.session.tutor?.drawn).not.toContain("trade:ones");
      expect(session.session.tutor?.sent).toBeUndefined();
      const again = await session.child("I still don't get it.");
      expect(briefs[1].drawn).not.toContain("trade:ones");
      expect(briefs[1]).not.toHaveProperty("sent");
      const redrawn = again.board.find((b) => b.commands.some((x) => (x as { op?: string }).op === "regroup"));
      expect(redrawn).toBeDefined();
      expect(redrawn!.transactionId).not.toBe(batch);
      expect(session.session.tutor?.drawn).toContain("trade:ones");
      // A second word for the first batch changes nothing: the first word stands.
      session.boardFates([{ batchId: batch, fate: "shown" }]);
      expect(session.session.tutor?.sent?.map((x) => x.batch)).toEqual([redrawn!.transactionId]);
      const trace = await session.finish({ reason: "child_stopped" });
      expect(trace.board.find((b) => b.transactionId === batch)?.fate).toBe(fate);
      expect(trace.counts.boardFates?.[fate]).toBe(1);
      expect(checkTrace(trace).ok).toBe(true);
    });
  }

  it("a word for a batch Maya did not send, or a malformed report, changes nothing", async () => {
    const { session, batch } = await traded([TRADE, ASK]);
    const before = structuredClone(session.session);
    session.boardFates([{ batchId: "another-call-b1", fate: "skipped" }]);
    expect(session.session).toEqual(before);
    expect(readFateReports([{ batchId: batch, fate: "hidden" }])).toBeNull();
    expect(readFateReports(Array.from({ length: 33 }, (_, i) => ({ batchId: `b${i}`, fate: "shown" })))).toBeNull();
    expect(readFateReports([{ batchId: batch, fate: "shown" }, { batchId: batch, fate: "skipped" }])).toEqual([{ batchId: batch, fate: "shown" }]);
  });

  it("a saved call keeps the words and the undone board: resumed, and restored from a checkpoint", async () => {
    const { session, batch } = await traded([TRADE, TRADE], "fate-saved");
    session.boardFates([{ batchId: batch, fate: "skipped" }]);
    const saved = await session.saved() as SavedTextSession & { initial: TextLogInitial; log: TextLogEvent[] };
    // Resumed from the saved log: the trade is not drawn, and it can be drawn again.
    let now = T0 + 60_000;
    const model = conversationalFake({ answer: (() => TRADE) as unknown as (brief: TurnBrief, n: number) => unknown });
    const resumed = createTextSession({ callId: "fate-saved", package: PKG, model, clock: () => (now += 500), random: 3, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(), tutor: true, resume: saved });
    expect(resumed.session.tutor?.drawn).not.toContain("trade:ones");
    const out = await resumed.child("Show me again.");
    expect(out.board.some((b) => b.commands.some((x) => (x as { op?: string }).op === "regroup"))).toBe(true);
    // A checkpoint taken after the undo restores the same board: the undo goes back after its batch.
    let fold = initialTextState(saved.initial);
    for (const e of saved.log) fold = foldTextEvent(fold, e);
    expect(fold.undos).toEqual([{ at: fold.board.length, transactionId: batch }]);
    const restored = restoreTextCheckpoint(saveTextCheckpoint(fold));
    expect(JSON.stringify(restored.scene.state)).toBe(JSON.stringify(fold.scene.state));
  });
});
