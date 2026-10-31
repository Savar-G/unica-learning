import { describe, expect, it } from "vitest";
import { boardPaths, childInk, type Batch } from "@/lib/board";
import {
  BOARD_DRAFT_ROOT,
  HARD_MAX_DRAFTS,
  MAX_DRAFTS,
  OPEN_ROOT,
  RECENT_MS,
  boardDraftKey,
  boardScene,
  childStrokes,
  clear,
  createHistory,
  decodeHistory,
  drawStroke,
  encodeHistory,
  givePen,
  historyFromRecording,
  historyLength,
  loadDraft,
  markClosed,
  markOpen,
  mayaFinished,
  mayaWrites,
  mayaWritingEnds,
  newestHistory,
  penHolder,
  replayFrame,
  replayOf,
  saveDraft,
  takePen,
  undo,
  type BoardHistory,
  type Change,
  type InkStroke,
} from "@/lib/board-history";
import { createMemoryDraftStore } from "@/lib/board-history-memory";
import { boardAt, readStrokes, replayLength, type TimedPoint } from "@/lib/strokes";

// The history of "Our board" (#320): who holds the pen, the child's ink, the draft that brings the board back after a
// reload, and the replay of a saved board, which also plays the old test whiteboard recordings unchanged.

const QUESTION: Batch = {
  transactionId: "desk-question",
  commands: [{ op: "columns", id: "question", operation: "add", operands: [{ id: "top", value: "419" }, { id: "bottom", value: "193" }], place: { region: "main" } }],
};

function ok(c: Change): BoardHistory {
  if (!c.ok) throw new Error(`refused: ${c.code} ${c.reason}`);
  return c.history;
}

/** A pencil stroke of the child's from (x, y), starting at `t`, one point every 10 ms. */
const stroke = (x: number, y: number, t: number, extra: Partial<InkStroke> = {}): InkStroke => ({
  erase: false,
  w: 3.2,
  boardWidth: 800,
  page: 1,
  pts: [[x, y, t], [x + 0.02, y + 0.01, t + 10], [x + 0.04, y + 0.02, t + 20]],
  ...extra,
});

/** Maya writes the question, then the child takes the pen at 2 s. */
const withPen = () => ok(takePen(ok(mayaWrites(createHistory(), QUESTION, 0)), 2000));

describe("the pen", () => {
  it("starts with Maya: a stroke of the child's is refused until the child takes the pen", () => {
    const h = ok(mayaWrites(createHistory(), QUESTION, 0));
    expect(penHolder(h)).toBe("maya");
    expect(drawStroke(h, stroke(0.1, 0.3, 1000))).toMatchObject({ ok: false, code: "pen_with_maya" });
    expect(undo(h, 1000)).toMatchObject({ ok: false, code: "pen_with_maya" });
    expect(clear(h, 1000)).toMatchObject({ ok: false, code: "pen_with_maya" });

    const taken = ok(takePen(h, 2000));
    expect(penHolder(taken)).toBe("child");
    expect(childStrokes(ok(drawStroke(taken, stroke(0.1, 0.3, 2100))))).toHaveLength(1);
  });

  it("refuses drawing after the pen moves to Maya, also a stroke the child began while holding it", () => {
    const drawn = ok(drawStroke(withPen(), stroke(0.1, 0.3, 2100)));
    const back = ok(givePen(drawn, 3000));
    expect(penHolder(back)).toBe("maya");
    expect(drawStroke(back, stroke(0.3, 0.3, 3100))).toMatchObject({ ok: false, code: "pen_with_maya" });
    // Begun at 2.9 s with the pen in hand, finished after it went to Maya at 3 s.
    expect(drawStroke(back, stroke(0.3, 0.3, 2900))).toMatchObject({ ok: false, code: "pen_with_maya" });
    // The pen came back at 4 s: a stroke begun before that was drawn while Maya held it.
    expect(drawStroke(ok(takePen(back, 4000)), stroke(0.3, 0.3, 3500))).toMatchObject({ ok: false, code: "pen_with_maya" });
    expect(childStrokes(back)).toEqual(childStrokes(drawn));
  });

  it("lets Maya write only while she holds the pen, and only what the board core accepts", () => {
    const more: Batch = { transactionId: "b2", commands: [{ op: "write", id: "note", text: "carry", place: { below: "question" } }] };
    expect(mayaWrites(withPen(), more, 3000)).toMatchObject({ ok: false, code: "pen_with_child" });
    expect(mayaWrites(ok(givePen(withPen(), 3000)), more, 3000).ok).toBe(true);
    expect(mayaWrites(createHistory(), { transactionId: "bad", commands: [{ op: "nope" }] }, 0)).toMatchObject({ ok: false, code: "refused" });
  });

  it("counts each move as a change, and taking a pen already held changes nothing", () => {
    const h = withPen();
    const twice = ok(takePen(ok(givePen(h, 2500)), 2600));
    expect(penHolder(twice)).toBe("child");
    expect(twice.revision).toBe(h.revision + 2);
    expect(ok(takePen(h, 2700))).toBe(h);
  });
});

describe("a new question (D-184): the pen passes to the child when Maya has finished writing it", () => {
  const written = () => ok(mayaWrites(createHistory(), QUESTION, 0));

  it("logs an ordinary pen move at the end of Maya's writing, so replay and reload show it", () => {
    const h = written();
    const ends = mayaWritingEnds(h);
    expect(ends).toBeGreaterThan(0);
    const passed = ok(mayaFinished(h, ends + 40));
    expect(penHolder(passed)).toBe("child");
    expect(passed.events.at(-1)).toEqual({ kind: "pen", t: ends + 40, to: "child" });
    expect(passed.revision).toBe(h.revision + 1);
    const r = replayOf(passed);
    expect(replayFrame(r, ends + 39).pen).toBe("maya");
    expect(replayFrame(r, ends + 40).pen).toBe("child");
  });

  it("never logs the move before her last stroke is finished", () => {
    const h = written();
    expect(ok(mayaFinished(h, 5)).events.at(-1)).toEqual({ kind: "pen", t: mayaWritingEnds(h), to: "child" });
  });

  it("lets the child write without a tap, but refuses a stroke begun while Maya was still writing", () => {
    const h = written();
    const ends = mayaWritingEnds(h);
    const passed = ok(mayaFinished(h, ends));
    expect(drawStroke(h, stroke(0.1, 0.3, ends - 100))).toMatchObject({ ok: false, code: "pen_with_maya" });
    expect(drawStroke(passed, stroke(0.1, 0.3, ends - 100))).toMatchObject({ ok: false, code: "pen_with_maya" });
    expect(childStrokes(ok(drawStroke(passed, stroke(0.1, 0.3, ends + 10))))).toHaveLength(1);
  });

  it("changes nothing when the child already has the pen", () => {
    const taken = ok(takePen(written(), 100));
    expect(ok(mayaFinished(taken, mayaWritingEnds(taken)))).toBe(taken);
  });

  it("comes back after a reload with the child holding the pen", () => {
    const store = createMemoryDraftStore();
    const key = boardDraftKey("book-1", 2, 3);
    const passed = ok(mayaFinished(written(), 0));
    expect(saveDraft(store, key, passed, null, 1_000)).toMatchObject({ status: "saved" });
    const restored = loadDraft(store, key)!;
    expect(penHolder(restored)).toBe("child");
    expect(restored).toEqual(passed);
  });

  it("still lets Maya take the pen back to show a step, and the child give it back", () => {
    const passed = ok(mayaFinished(written(), 0));
    const back = ok(givePen(passed, mayaWritingEnds(passed) + 500));
    expect(penHolder(back)).toBe("maya");
    expect(drawStroke(back, stroke(0.1, 0.3, mayaWritingEnds(passed) + 600))).toMatchObject({ ok: false, code: "pen_with_maya" });
  });
});

describe("the child's ink", () => {
  it("undoes and clears the child's own strokes only; Maya's work stays as it was", () => {
    let h = withPen();
    const maya = boardPaths(boardScene(h));
    h = ok(drawStroke(h, stroke(0.1, 0.3, 2100)));
    h = ok(drawStroke(h, stroke(0.1, 0.4, 2200, { erase: true, w: 26 })));
    h = ok(drawStroke(h, stroke(0.2, 0.4, 2300)));
    expect(childStrokes(h).map((s) => s.erase)).toEqual([false, true, false]);
    h = ok(undo(h, 2400));
    expect(childStrokes(h).map((s) => s.erase)).toEqual([false, true]);
    h = ok(clear(h, 2500));
    expect(childStrokes(h)).toEqual([]);
    expect(undo(h, 2600)).toMatchObject({ ok: false, code: "nothing_to_undo" });
    expect(boardPaths(boardScene(h))).toEqual(maya);
  });

  it("keeps every stroke on the board core, so Maya never covers ink the child drew", () => {
    const h = ok(drawStroke(withPen(), stroke(0.1, 0.3, 2100)));
    expect(childInk(boardScene(h))).toHaveLength(1);
  });

  it("puts point times on the board's clock: never before the last event, never backwards", () => {
    const h = ok(drawStroke(withPen(), { ...stroke(0.1, 0.3, 0), pts: [[0.1, 0.3, 2100], [0.11, 0.31, 2050], [0.12, 0.32, 2150.6]] }));
    expect(childStrokes(h)[0].pts.map(([, , t]) => t)).toEqual([2100, 2100, 2151]);
  });

  it("refuses a stroke that is not one: no points, a bad width, a page the board does not have", () => {
    const h = withPen();
    expect(drawStroke(h, { ...stroke(0.1, 0.3, 2100), pts: [] })).toMatchObject({ ok: false, code: "invalid_stroke" });
    expect(drawStroke(h, stroke(0.1, 0.3, 2100, { w: 0 }))).toMatchObject({ ok: false, code: "invalid_stroke" });
    expect(drawStroke(h, stroke(0.1, 0.3, 2100, { page: 3 }))).toMatchObject({ ok: false, code: "invalid_stroke" });
    expect(drawStroke(h, { ...stroke(0.1, 0.3, 2100), pts: [[Number.NaN, 0.3, 2100]] })).toMatchObject({ ok: false, code: "invalid_stroke" });
  });
});

describe("the draft: a reload restores the board", () => {
  const key = boardDraftKey("book-1", 3, 7);

  it("brings back Maya's question, the child's ink and who held the pen", () => {
    const store = createMemoryDraftStore();
    const h = ok(drawStroke(withPen(), stroke(0.1, 0.3, 2100)));
    expect(saveDraft(store, key, h, null, 1_000)).toEqual({ status: "saved", history: h });

    const restored = loadDraft(store, key)!;
    expect(restored).toEqual(h);
    expect(penHolder(restored)).toBe("child");
    expect(childStrokes(restored)).toEqual(childStrokes(h));
    expect(boardPaths(boardScene(restored))).toEqual(boardPaths(boardScene(h)));
    // The clock goes on from where the board was left.
    expect(historyLength(restored)).toBe(2120);
  });

  it("starts again when there is no draft, or it does not read back", () => {
    const store = createMemoryDraftStore({ [key]: "1000@{not json" });
    expect(loadDraft(store, key)).toBeNull();
    expect(loadDraft(store, boardDraftKey("book-1", 3, 8))).toBeNull();
    expect(loadDraft(createMemoryDraftStore({ [key]: "no stamp" }), key)).toBeNull();
  });

  it("an empty board leaves no draft", () => {
    const store = createMemoryDraftStore();
    saveDraft(store, boardDraftKey("book-1", 3, null), createHistory(), null, 3_000);
    expect(store.items.has(boardDraftKey("book-1", 3, null))).toBe(false);
  });

  it("says when storage is full: the board is still on the screen", () => {
    const store = createMemoryDraftStore();
    store.fill();
    expect(saveDraft(store, key, withPen(), null, 1_000)).toEqual({ status: "failed" });
  });
});

describe("the save's safety net: it writes only over what this tab last loaded or saved", () => {
  const key = boardDraftKey("book-1", 3, 7);

  it("writes nothing over a board it did not load, and returns the stored board to show", () => {
    const store = createMemoryDraftStore();
    const start = withPen();
    saveDraft(store, key, start, null, 1_000);
    const other = ok(drawStroke(start, stroke(0.5, 0.3, 2150)));
    saveDraft(store, key, other, start, 1_500);
    const mine = ok(drawStroke(start, stroke(0.1, 0.3, 2100)));
    expect(saveDraft(store, key, mine, start, 2_000)).toEqual({ status: "reload", history: other });
    expect(loadDraft(store, key)).toEqual(other);
  });

  it("writes over a broken draft: it holds nothing to lose", () => {
    const store = createMemoryDraftStore({ [key]: "1000@{broken" });
    expect(saveDraft(store, key, withPen(), null, 2_000).status).toBe("saved");
  });
});

describe("old drafts make room, never a board a tab has open (R370-3)", () => {
  const DAY = RECENT_MS;
  const k = (i: number) => boardDraftKey("book-1", 1, i);
  const drafts = (store: ReturnType<typeof createMemoryDraftStore>) => [...store.items.keys()].filter((x) => x.startsWith(BOARD_DRAFT_ROOT));

  it(`keeps at most ${MAX_DRAFTS} drafts not touched for a day: the oldest go first; other keys stay`, () => {
    const store = createMemoryDraftStore({ "unica-work:t1:q1": "a test draft stays" });
    const h = withPen();
    for (let i = 0; i < MAX_DRAFTS + 5; i++) saveDraft(store, k(i), h, null, 1_000 + i * DAY);
    expect(drafts(store)).toHaveLength(MAX_DRAFTS);
    expect(drafts(store)).not.toContain(k(0));
    expect(drafts(store)).toContain(k(MAX_DRAFTS + 4));
    expect(store.items.get("unica-work:t1:q1")).toBe("a test draft stays");
  });

  it("keeps a board open in another tab, and recent drafts, going over the cap up to the hard ceiling", () => {
    const store = createMemoryDraftStore();
    const h = withPen();
    const open = boardDraftKey("book-1", 9, 1);
    saveDraft(store, open, h, null, 0);
    const now = 3 * DAY;
    markOpen(store, open, now);
    // Another tab saves 40 other boards within a few minutes: all recent, so none goes.
    for (let i = 0; i < 40; i++) saveDraft(store, k(i), h, null, now + i * 1000);
    expect(drafts(store)).toHaveLength(41);
    expect(loadDraft(store, open)).toEqual(h);
    // Past the hard ceiling the oldest go, recent or not; the open board stays.
    for (let i = 40; i < 80; i++) saveDraft(store, k(i), h, null, now + i * 1000);
    expect(drafts(store)).toHaveLength(HARD_MAX_DRAFTS);
    expect(drafts(store)).toContain(open);
    expect(drafts(store)).not.toContain(k(0));
  });

  it("lets a board go once its tab has closed (or stopped saying it is open) and it is a day old", () => {
    const store = createMemoryDraftStore();
    const h = withPen();
    const board = boardDraftKey("book-1", 9, 1);
    saveDraft(store, board, h, null, 0);
    markOpen(store, board, 0);
    for (let i = 0; i < MAX_DRAFTS; i++) saveDraft(store, k(i), h, null, 2 * DAY + i);
    // Its tab last said it was open at 0: long ago, so it is closed, and its draft is two days old.
    expect(drafts(store)).not.toContain(board);
    expect(store.items.has(`${OPEN_ROOT}${board}`)).toBe(false);
    markClosed(store, k(0));
    expect(drafts(store)).toHaveLength(MAX_DRAFTS);
  });
});

describe("copies of a board", () => {
  it("takes the newest copy of a board by its revision", () => {
    const older = withPen();
    const newer = ok(drawStroke(older, stroke(0.1, 0.3, 2100)));
    expect(newestHistory([encodeHistory(older), encodeHistory(newer), "junk", null])).toEqual(newer);
    expect(newestHistory([null, "junk"])).toBeNull();
  });

  it("reads back only a history in time order that replays on an empty board", () => {
    const h = ok(drawStroke(withPen(), stroke(0.1, 0.3, 2100)));
    const data = JSON.parse(encodeHistory(h));
    expect(decodeHistory(JSON.stringify(data))).toEqual(h);
    expect(decodeHistory(JSON.stringify({ ...data, events: [...data.events].reverse() }))).toBeNull();
    expect(decodeHistory(JSON.stringify({ ...data, events: [{ kind: "maya", t: 0, batchId: "x", commands: [{ op: "nope" }] }] }))).toBeNull();
    expect(decodeHistory(JSON.stringify({ ...data, v: 2 }))).toBeNull();
    expect(decodeHistory(JSON.stringify({ ...data, events: [{ kind: "stroke", erase: false, w: 3, boardWidth: 800, page: 1, pts: [[0.1, 0.1, 5], [0.2, 0.2, 4]] }] }))).toBeNull();
  });
});

describe("the replay of a saved board", () => {
  const saved = () => {
    let h = withPen();
    h = ok(drawStroke(h, stroke(0.1, 0.3, 2100)));
    h = ok(givePen(h, 2500));
    return h;
  };

  it("ends on the board as it was left", () => {
    const h = saved();
    const end = replayFrame(replayOf(h), Infinity);
    expect(end.child).toEqual(childStrokes(h));
    expect(end.maya.map((s) => s.path)).toEqual(boardPaths(boardScene(h)));
    expect(end.maya.every((s) => s.progress === 1)).toBe(true);
    expect(end.pen).toBe("maya");
  });

  it("draws in order: Maya's question first, then the child's stroke point by point, with the pen where it was", () => {
    const r = replayOf(saved());
    const start = replayFrame(r, 0);
    expect(start.maya).toEqual([]);
    expect(start.child).toEqual([]);
    expect(start.pen).toBe("maya");

    const mid = replayFrame(r, 50);
    expect(mid.maya.length).toBeGreaterThan(0);
    expect(mid.maya.length).toBeLessThan(boardPaths(boardScene(saved())).length);

    const drawing = replayFrame(r, 2110);
    expect(drawing.pen).toBe("child");
    expect(drawing.child[0].pts).toHaveLength(2);
    expect(replayFrame(r, 2600).pen).toBe("maya");
    expect(r.durationMs).toBe(Math.max(historyLength(saved()), r.maya.durationMs));
  });
});

describe("old test whiteboard recordings", () => {
  // As stored in the shown-work bucket (#186): a stroke, an eraser stroke, an undo, a clear and a last stroke.
  const STORED = JSON.stringify({
    v: 1,
    width: 812,
    height: 640,
    events: [
      { kind: "stroke", erase: false, w: 3.2, pts: [[0.1, 0.2, 400], [0.15, 0.25, 480], [0.2, 0.27, 520]] },
      { kind: "stroke", erase: true, w: 26, pts: [[0.12, 0.22, 1000], [0.13, 0.23, 1040]] },
      { kind: "undo", t: 1500 },
      { kind: "stroke", erase: false, w: 3.2, pts: [[0.3, 0.3, 1800], [0.32, 0.36, 1900]] },
      { kind: "clear", t: 2000 },
      { kind: "stroke", erase: false, w: 3.2, pts: [[0.5, 0.5, 3000], [0.6, 0.6, 3100]] },
    ],
  });

  it("still read and replay as before", () => {
    const rec = readStrokes(JSON.parse(STORED))!;
    expect(replayLength(rec)).toBe(3100);
    expect(boardAt(rec, 450)).toEqual([{ erase: false, w: 3.2, pts: [[0.1, 0.2, 400]] }]);
    expect(boardAt(rec, 1200).map((s) => s.erase)).toEqual([false, true]);
    expect(boardAt(rec, 1600).map((s) => s.erase)).toEqual([false]);
    expect(boardAt(rec, 2500)).toEqual([]);
    expect(boardAt(rec, Infinity)).toEqual([{ erase: false, w: 3.2, pts: [[0.5, 0.5, 3000], [0.6, 0.6, 3100]] }]);
  });

  it("play through the board replay exactly as the stroke replay shows them, at every moment", () => {
    const rec = readStrokes(JSON.parse(STORED))!;
    const r = replayOf(historyFromRecording(rec));
    for (const t of [0, 399, 400, 450, 480, 500, 1000, 1020, 1499, 1500, 1850, 1999, 2000, 3050, 3100, Infinity]) {
      const child = replayFrame(r, t).child.map(({ erase, w, pts }) => ({ erase, w, pts }));
      expect(child, `at ${t} ms`).toEqual(boardAt(rec, t));
      expect(replayFrame(r, t).maya).toEqual([]);
    }
    expect(r.durationMs).toBe(replayLength(rec));
    expect(replayFrame(r, Infinity).child.every((s) => s.boardWidth === 812)).toBe(true);
  });

  it("keep their exact points", () => {
    const rec = readStrokes(JSON.parse(STORED))!;
    const pts = (historyFromRecording(rec).events.filter((e) => e.kind === "stroke") as { pts: TimedPoint[] }[]).map((e) => e.pts);
    expect(pts).toEqual(rec.events.filter((e) => e.kind === "stroke").map((e) => (e as { pts: TimedPoint[] }).pts));
  });
});
