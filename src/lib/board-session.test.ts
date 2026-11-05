import { describe, expect, it } from "vitest";
import { boardScene, childStrokes, createHistory, historyFromLog, inkLog, loadDraft, mayaWrites, penHolder, refusedBatches, replayFrame, replayOf, withChildInk, type BoardHistory, type InkStroke } from "@/lib/board-history";
import { boardPaths } from "@/lib/board";
import { createFakeTimers, createMemoryChannels, createMemoryDraftStore, createMemoryLocks } from "@/lib/board-history-memory";
import { createBoardSession, type SessionNote } from "@/lib/board-session";
import { HAND_OVER_MS, OPEN_RETRY_MS, OPEN_TRIES, leaseLocks, openBoardTab, type BoardChannel } from "@/lib/board-tab";

// One tab's session on "Our board" (#320, R370-4-1, R370-4-2): a stroke in progress, and every way out of holding the
// board. Each case checks that the stroke ends up in exactly one place, stored or kept, with all its points.

const KEY = "unica-board:book-1:2:3";
const QUESTION = {
  transactionId: "desk-question",
  commands: [{ op: "columns", id: "question", operation: "add", operands: [{ id: "top", value: "419" }, { id: "bottom", value: "193" }], place: { region: "main" } }],
};
const question = (): BoardHistory => {
  const r = mayaWrites(createHistory(), QUESTION, 0);
  if (!r.ok) throw new Error("question");
  return r.history;
};

/** Points of a test line from x: the first one at pointer down, then MOVES more. */
const MOVES = 5;
const line = (x: number) => Array.from({ length: MOVES + 1 }, (_, i) => [x + i * 0.004, 0.5 + i * 0.002] as const);

/** A tab that hears only some messages: frozen in the background, it answers no "Use it here". */
const filtered = (channel: BoardChannel, drop: (kind: string) => boolean): BoardChannel => ({
  post: channel.post,
  listen: (fn) => channel.listen((m) => (drop(m.kind) ? undefined : fn(m))),
});

function browser(options: { lease?: boolean } = {}) {
  const store = createMemoryDraftStore();
  const locks = createMemoryLocks();
  const channels = createMemoryChannels();
  const timers = createFakeTimers();
  const open = async (tabId: string, tabOptions: { hears?: (kind: string) => boolean } = {}) => {
    const session = createBoardSession({ initial: loadDraft(store, KEY) ?? question(), restored: loadDraft(store, KEY) !== null, clock: timers.now, wall: timers.now });
    const notes: SessionNote[] = [];
    session.onNote((n) => notes.push(n));
    const channel = tabOptions.hears ? filtered(channels.tab(tabId), (k) => !tabOptions.hears!(k)) : channels.tab(tabId);
    const opening = openBoardTab({
      key: KEY, tabId, store, timers, channel,
      locks: options.lease ? leaseLocks({ store, tabId, timers }) : locks.tab(tabId),
      onChange: (role, stored) => session.tabChanged(role, stored),
      beforeRelease: () => session.endHolding("handover"),
    });
    await timers.advance(OPEN_TRIES * OPEN_RETRY_MS);
    const tab = await opening;
    session.attach(tab, tab.role(), tab.stored());
    return {
      session,
      tab,
      notes,
      /** A whole stroke. */
      draw(x: number) {
        const [first, ...rest] = line(x);
        if (!session.penDown(first, false, 800)) return false;
        session.penMove(rest);
        session.penUp();
        return true;
      },
      /** A stroke in progress: the pointer stays down. */
      begin(x: number) {
        const [first, ...rest] = line(x);
        expect(session.penDown(first, false, 800)).toBe(true);
        session.penMove(rest);
      },
      /** The page leaves or the board closes, as the desk does it: end holding, then let the board go. */
      leave(reason: "pagehide" | "close") {
        session.endHolding(reason);
        tab.close();
      },
    };
  };
  /** A first tab that holds the board, with Maya's question written and the pen passed to the child. */
  const first = async (tabId = "a", tabOptions: { hears?: (kind: string) => boolean } = {}) => {
    const t = await open(tabId, tabOptions);
    await timers.advance(2000);
    t.session.mayaDone();
    expect(penHolder(t.session.view().history)).toBe("child");
    return t;
  };
  return { store, timers, open, first };
}

/** Where a stroke from x is: stored strokes and kept ones with all its points (MOVES + 1). */
function places(b: { store: ReturnType<typeof createMemoryDraftStore> }, x: number, kept: readonly InkStroke[]) {
  const whole = (s: InkStroke) => s.pts[0][0] === x && s.pts.length === MOVES + 1;
  const stored = loadDraft(b.store, KEY);
  return { stored: (stored ? childStrokes(stored) : []).filter(whole).length, kept: kept.filter(whole).length };
}

describe("a stroke in progress, and every way out of holding the board", () => {
  it("a hand-over (\"Use it here\" answered): the stroke is ended, saved once, then the board moves", async () => {
    const b = browser();
    const a = await b.first();
    a.draw(0.1);
    a.begin(0.4);
    const c = await b.open("c");
    const taking = c.tab.takeOver();
    await b.timers.advance(1);
    expect(await taking).toBe(true);
    expect(places(b, 0.4, a.session.view().kept)).toEqual({ stored: 1, kept: 0 });
    expect(places(b, 0.4, c.session.view().kept)).toEqual({ stored: 1, kept: 0 });
    expect(a.session.view()).toMatchObject({ role: "reader", live: null });
    expect(c.session.view().role).toBe("holder");
  });

  it("a forced takeover noticed through the new holder's save: the stroke is kept, not stored, and \"Use it here\" adds it back once (R370-4-1)", async () => {
    const b = browser({ lease: true });
    // Frozen in the background: it hears no "Use it here", but it still hears that the board was saved.
    const a = await b.first("a", { hears: (k) => k !== "ask" });
    a.draw(0.1);
    a.begin(0.4);
    const c = await b.open("c");
    const taking = c.tab.takeOver();
    await b.timers.advance(HAND_OVER_MS + 1000);
    expect(await taking).toBe(true);
    expect(c.draw(0.7)).toBe(true);
    await b.timers.advance(1);
    // A heard C's save: the choke point ended its stroke and kept it.
    expect(a.session.view()).toMatchObject({ role: "reader", live: null });
    expect(places(b, 0.4, a.session.view().kept)).toEqual({ stored: 0, kept: 1 });
    expect(a.notes).toContain("moved");
    expect(places(b, 0.1, a.session.view().kept)).toEqual({ stored: 1, kept: 0 });
    // "Use it here" in A: C answers, and A adds its kept stroke back after the stored ones.
    const back = a.tab.takeOver();
    await b.timers.advance(1000);
    expect(await back).toBe(true);
    expect(places(b, 0.4, a.session.view().kept)).toEqual({ stored: 1, kept: 0 });
    const stored = childStrokes(loadDraft(b.store, KEY)!);
    expect(stored.filter((s) => s.pts.length === MOVES + 1 && Math.abs(s.pts[0][0] - 0.4) < 1e-9)).toHaveLength(1);
    expect(stored.map((s) => s.pts[0][0])).toEqual([0.1, 0.7, 0.4]);
  });

  it("ownership lost and noticed by this tab itself (pointer up, or an edit): the stroke is kept, nothing is written", async () => {
    const b = browser({ lease: true });
    // Hears nothing at all.
    const a = await b.first("a", { hears: () => false });
    a.draw(0.1);
    a.begin(0.4);
    const c = await b.open("c");
    const taking = c.tab.takeOver();
    await b.timers.advance(HAND_OVER_MS + 1000);
    await taking;
    a.session.penUp();
    expect(places(b, 0.4, a.session.view().kept)).toEqual({ stored: 0, kept: 1 });
    expect(a.session.view().role).toBe("reader");
    expect(a.draw(0.9)).toBe(false);
    expect(childStrokes(loadDraft(b.store, KEY)!).map((s) => s.pts[0][0])).toEqual([0.1]);
  });

  it("ownership lost and noticed before an edit while a stroke is in progress: the same, kept once", async () => {
    const b = browser({ lease: true });
    const a = await b.first("a", { hears: () => false });
    a.begin(0.4);
    const c = await b.open("c");
    const taking = c.tab.takeOver();
    await b.timers.advance(HAND_OVER_MS + 1000);
    await taking;
    expect(a.session.holds()).toBe(false);
    a.session.penUp();
    a.session.endHolding("pagehide");
    expect(places(b, 0.4, a.session.view().kept)).toEqual({ stored: 0, kept: 1 });
  });

  for (const reason of ["pagehide", "close"] as const) {
    it(`${reason === "pagehide" ? "leaving the page" : "closing the board (another question, or Leave)"}: the stroke is ended and saved once, and the next tab gets it (R370-4-2)`, async () => {
      const b = browser();
      const a = await b.first();
      a.draw(0.1);
      a.begin(0.4);
      a.leave(reason);
      expect(places(b, 0.4, a.session.view().kept)).toEqual({ stored: 1, kept: 0 });
      const c = await b.open("c");
      expect(c.tab.role()).toBe("holder");
      expect(childStrokes(c.session.view().history).map((s) => s.pts[0][0])).toEqual([0.1, 0.4]);
    });
  }

  it("giving the pen back mid-stroke ends the stroke first: it is saved once", async () => {
    const b = browser();
    const a = await b.first();
    a.begin(0.4);
    a.session.giveBack();
    expect(penHolder(a.session.view().history)).toBe("maya");
    expect(places(b, 0.4, [])).toEqual({ stored: 1, kept: 0 });
  });

  it("a cancelled pointer (the browser took it for a scroll) drops only that stroke", async () => {
    const b = browser();
    const a = await b.first();
    a.begin(0.4);
    a.session.penCancel();
    expect(a.session.view().live).toBeNull();
    expect(places(b, 0.4, a.session.view().kept)).toEqual({ stored: 0, kept: 0 });
  });

  it("a forced takeover, then Maya takes the pen, then \"Use it here\": the kept stroke is stored exactly once (R370-5-1)", async () => {
    const b = browser({ lease: true });
    const a = await b.first("a", { hears: (k) => k !== "ask" });
    a.draw(0.1);
    a.begin(0.4);
    const c = await b.open("c");
    const taking = c.tab.takeOver();
    await b.timers.advance(HAND_OVER_MS + 1000);
    expect(await taking).toBe(true);
    // The new holder gives the pen to Maya, and saves: A hears it and keeps its stroke.
    c.session.giveBack();
    await b.timers.advance(1);
    expect(penHolder(loadDraft(b.store, KEY)!)).toBe("maya");
    expect(places(b, 0.4, a.session.view().kept)).toEqual({ stored: 0, kept: 1 });
    const back = a.tab.takeOver();
    await b.timers.advance(1000);
    expect(await back).toBe(true);
    expect(places(b, 0.4, a.session.view().kept)).toEqual({ stored: 1, kept: 0 });
    // Logged as recovered ink, with its first times; the pen stays with Maya.
    const stored = loadDraft(b.store, KEY)!;
    const recovered = stored.events.filter((e) => e.kind === "recovered");
    expect(recovered).toHaveLength(1);
    expect(recovered[0].kind === "recovered" && recovered[0].pts[0][2] < recovered[0].t).toBe(true);
    expect(penHolder(stored)).toBe("maya");
    expect(a.notes).not.toContain("not_added");
  });

  it("a kept stroke the board cannot take back stays kept, never cleared", async () => {
    const b = browser({ lease: true });
    const a = await b.first("a", { hears: (k) => k !== "ask" });
    // A stroke on page 3, which the board does not have: it cannot be added back.
    expect(a.session.penDown([0.4, 0.5], false, 800, 0)).toBe(true);
    const c = await b.open("c");
    const taking = c.tab.takeOver();
    await b.timers.advance(HAND_OVER_MS + 1000);
    await taking;
    a.session.penUp(0);
    expect(a.session.view().kept).toHaveLength(1);
    const kept = a.session.view().kept[0];
    (kept as { page: number }).page = 3;
    const back = a.tab.takeOver();
    await b.timers.advance(1000);
    await back;
    expect(a.session.view().kept).toHaveLength(1);
    expect(a.notes).toContain("not_added");
  });

  it("only the pointer that started a stroke feeds it, lifts it or cancels it; a second finger draws nothing (R370-5-2)", async () => {
    const b = browser();
    const a = await b.first();
    expect(a.session.penDown([0.4, 0.5], true, 800, 1)).toBe(true);
    // A second finger: it starts nothing, and its moves, lift and cancel change nothing.
    expect(a.session.penDown([0.1, 0.1], true, 800, 2)).toBe(false);
    a.session.penMove([[0.1, 0.1], [0.12, 0.12]], 2);
    a.session.penCancel(2);
    a.session.penUp(2);
    a.session.penMove([[0.404, 0.502], [0.408, 0.504]], 1);
    expect(a.session.view().live?.pointer).toBe(1);
    a.session.penUp(1);
    const stored = childStrokes(loadDraft(b.store, KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].pts.map(([x]) => x)).toEqual([0.4, 0.404, 0.408]);
  });

  it("a tab showing the board read-only draws nothing and says so", async () => {
    const b = browser();
    await b.first();
    const c = await b.open("c");
    expect(c.draw(0.5)).toBe(false);
    expect(c.notes).toContain("elsewhere");
  });
});

describe("Maya's replies in a chat (#534)", () => {
  const REPLY = {
    transactionId: "reply-1",
    commands: [{ op: "columns", id: "work", operation: "add", operands: [{ id: "a", value: "27" }, { id: "b", value: "39" }], place: { region: "main" } }],
  };
  const mayaIds = (h: BoardHistory) => h.events.flatMap((e) => (e.kind === "maya" ? [e.batchId] : []));

  it("Maya's reply takes the pen while she writes, never removes the child's ink, and the pen comes back", async () => {
    const b = browser();
    const t = await b.first();
    expect(t.draw(0.1)).toBe(true);
    const ink = childStrokes(t.session.view().history);
    expect(ink).toHaveLength(1);

    expect(t.session.mayaReply([QUESTION, REPLY])).toBe(1);
    const written = t.session.view().history;
    expect(mayaIds(written)).toEqual(["desk-question", "reply-1"]);
    expect(childStrokes(written)).toEqual(ink);
    expect(penHolder(written)).toBe("maya");
    expect(t.draw(0.3)).toBe(false);
    expect(t.notes).toContain("pen_with_maya");

    t.session.handBack();
    expect(penHolder(t.session.view().history)).toBe("child");
    expect(t.draw(0.3)).toBe(true);
    // The same reply again writes nothing.
    expect(t.session.mayaReply([QUESTION, REPLY])).toBe(0);
    // The draft holds Maya's work and both of the child's lines.
    const stored = loadDraft(b.store, KEY)!;
    expect(mayaIds(stored)).toEqual(["desk-question", "reply-1"]);
    expect(childStrokes(stored)).toHaveLength(2);
  });

  it("a stroke in progress when Maya's reply comes ends and is kept, never dropped", async () => {
    const b = browser();
    const t = await b.first();
    t.begin(0.2);
    expect(t.session.mayaReply([REPLY])).toBe(1);
    expect(places(b, 0.2, t.session.view().kept)).toEqual({ stored: 1, kept: 0 });
    expect(t.session.view().live).toBeNull();
  });

  it("a tab showing the board read-only writes no reply", async () => {
    const b = browser();
    await b.first();
    const c = await b.open("c");
    expect(c.session.mayaReply([REPLY])).toBe(0);
    expect(mayaIds(loadDraft(b.store, KEY)!)).toEqual(["desk-question"]);
  });

  it("R625b-1: a reply the desk refused (it would cover the child's line) is not drawn in the replay, whatever the call's times say", () => {
    let t = 0;
    const desk = createBoardSession({ initial: createHistory(), restored: false, clock: () => t, wall: () => t, noStore: true });
    const glow = { transactionId: "glow", commands: [{ op: "mark", id: "onesGlow", target: { objectId: "question", part: "column", column: "ones" }, style: "highlight", ink: "yellow" }] };
    expect(desk.mayaReply([QUESTION])).toBe(1);
    desk.handBack();
    // The child draws across the sum at 6 s.
    const digits = boardPaths(boardScene(desk.view().history)).filter((p) => p.objectId === "question").flatMap((p) => p.pts);
    const y = (Math.min(...digits.map((p) => p[1])) + Math.max(...digits.map((p) => p[1]))) / 2;
    t = 6000;
    expect(desk.penDown([Math.min(...digits.map((p) => p[0])) - 0.02, y], false, 800)).toBe(true);
    t = 6300;
    desk.penMove([[Math.max(...digits.map((p) => p[0])) + 0.02, y]]);
    desk.penUp();
    // Maya's highlight was recorded at 5 s, but it reached the child's board at 7 s, over the line: the desk refused it.
    t = 7000;
    expect(desk.mayaReply([QUESTION, glow])).toBe(0);
    expect(desk.mayaReply([QUESTION, glow])).toBe(0);
    let call = mayaWrites(createHistory(), QUESTION, 0);
    if (!call.ok) throw new Error("question");
    call = mayaWrites(call.history, glow, 5000);
    if (!call.ok) throw new Error("glow");
    const merged = withChildInk(call.history, desk.view().history);
    expect(childStrokes(merged)).toHaveLength(1);
    expect(refusedBatches(merged)).toEqual(["glow"]);
    const frame = replayFrame(replayOf(merged), Infinity);
    expect(frame.maya.some((s) => s.path.objectId === "onesGlow")).toBe(false);
    expect(frame.child).toHaveLength(1);
  });

});

describe("a chat's board rebuilt from the call's ink log (#635)", () => {
  it("R639-2: a chat's board does not go back to a stale stored draft: the next line takes the next sequence", () => {
    let t = 0;
    const first = createBoardSession({ initial: createHistory(), restored: false, clock: () => t, wall: () => t, noStore: true });
    first.mayaReply([QUESTION]);
    first.handBack();
    for (const x of [0.1, 0.2]) {
      t += 2000;
      expect(first.penDown([x, 0.8], false, 800)).toBe(true);
      t += 100;
      first.penMove([[x + 0.05, 0.82]]);
      first.penUp();
    }
    const whole = first.view().history;
    const log = inkLog(whole);
    // The draft stopped before the last line: a storage write failed. The call holds all of it.
    const stale = historyFromLog(log.slice(0, -1), [QUESTION])!;
    const again = createBoardSession({ initial: historyFromLog(log, [QUESTION])!, restored: true, clock: () => t, wall: () => t, appendOnly: true });
    const saves: BoardHistory[] = [];
    again.attach({ owns: () => true, stored: () => stale, save: (h) => { saves.push(h); return { status: "saved", history: h }; } }, "holder", stale);
    expect(inkLog(again.view().history)).toEqual(log);
    // The draft catches up at once.
    expect(inkLog(saves.at(-1)!)).toEqual(log);
    t = 50;
    expect(again.penDown([0.6, 0.6], false, 800)).toBe(true);
    t = 150;
    again.penMove([[0.65, 0.62]]);
    again.penUp();
    const after = inkLog(again.view().history);
    expect(after).toHaveLength(log.length + 1);
    expect(after.slice(0, log.length)).toEqual(log);
  });

  it("R635-4: takes the child's next line, on a clock that goes on from where the board was left", () => {
    let t = 0;
    const first = createBoardSession({ initial: createHistory(), restored: false, clock: () => t, wall: () => t, noStore: true });
    first.mayaReply([QUESTION]);
    first.handBack();
    for (const x of [0.1, 0.2, 0.3]) {
      t += 2000;
      expect(first.penDown([x, 0.8], false, 800)).toBe(true);
      t += 100;
      first.penMove([[x + 0.05, 0.82]]);
      first.penUp();
    }
    // Another load of the desk, with no draft: the board comes from the call's log, and this page's clock starts at 0.
    t = 0;
    const again = createBoardSession({ initial: historyFromLog(inkLog(first.view().history), [QUESTION])!, restored: true, clock: () => t, wall: () => t, noStore: true });
    expect(penHolder(again.view().history)).toBe("child");
    t = 50;
    expect(again.penDown([0.6, 0.6], false, 800)).toBe(true);
    t = 150;
    again.penMove([[0.65, 0.62]]);
    again.penUp();
    expect(childStrokes(again.view().history)).toHaveLength(4);
  });
});
