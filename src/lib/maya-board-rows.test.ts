import { describe, expect, it } from "vitest";
import { applyBatch, boardPaths, createScene } from "@/lib/board";
import { boardHistoryOf, boardPlayback } from "@/lib/maya-call";
import { replayOf, replayFrame } from "@/lib/board-history";
import { createTextSession } from "@/lib/maya-text";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";

describe("shared Maya teaching rows", () => {
  it.each([undefined, "chat"] as const)("keeps the complete example above the target for %s", async (channel) => {
    const s = createTextSession({ callId: "board-rows", package: SAMPLE_PACKAGES["add-27-39"], model: ruleMayaModel(), clock: () => 1000, channel, grade: 2, random: 42 });
    await s.start(); await s.child("I don't know how to start."); await s.child("Okay.");
    let scene = createScene();
    const trace = s.trace();
    for (const batch of trace.board) {
      const r = applyBatch(scene, batch); expect(r.ok).toBe(true); if (r.ok) scene = r.scene;
    }
    const paths = boardPaths(scene), ids = [...new Set(paths.map((p) => p.objectId))];
    expect(ids).toContain("example"); expect(ids).toContain("question"); expect(ids.length).toBeGreaterThan(2);
    const rows = ids.map((id) => {
      const own = paths.filter((p) => p.objectId === id);
      return { id, left: Math.min(...own.flatMap((p) => p.pts.map((pt) => pt[0]))), right: Math.max(...own.flatMap((p) => p.pts.map((pt) => pt[0]))), top: Math.min(...own.flatMap((p) => p.pts.map((pt) => pt[1]))), bottom: Math.max(...own.flatMap((p) => p.pts.map((pt) => pt[1]))) };
    });
    expect(new Set(paths.map((p) => p.page)).size).toBe(1);
    const target = rows.find((r) => r.id === "question")!, example = rows.filter((r) => r.id !== "question");
    expect(target.top).toBeGreaterThan(Math.max(...example.map((r) => r.bottom)) + 0.02);
    for (let i = 0; i < example.length; i++) for (const other of example.slice(i + 1)) {
      const a = example[i];
      expect(a.right + 0.02 < other.left || other.right + 0.02 < a.left || a.bottom + 0.02 < other.top || other.bottom + 0.02 < a.top).toBe(true);
    }
    expect(rows.at(-1)?.id).toBe("question");
    expect(boardPlayback(trace.board.map((b) => ({ transactionId: b.transactionId, commands: b.commands }))).steps).toHaveLength(trace.board.length);
    const replay = replayOf(boardHistoryOf(trace));
    expect(replayFrame(replay, Infinity).maya.map((p) => [p.path.objectId, p.path.pts])).toEqual(paths.map((p) => [p.objectId, p.pts]));
  });
});
