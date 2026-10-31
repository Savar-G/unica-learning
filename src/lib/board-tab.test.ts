import { describe, expect, it } from "vitest";
import { childStrokes, createHistory, drawStroke, loadDraft, mayaWrites, takePen, type BoardHistory, type Change, type InkStroke } from "@/lib/board-history";
import { createFakeTimers, createMemoryChannels, createMemoryDraftStore, createMemoryLocks } from "@/lib/board-history-memory";
import { HAND_OVER_MS, LEASE_ROOT, OPEN_RETRY_MS, OPEN_TRIES, boardLockName, leaseLocks, openBoardTab, type BoardChannel, type TabRole } from "@/lib/board-tab";
import { addPoint, capturedPoints, startCapture, type Capture } from "@/lib/child-ink-svg";

// One tab writes a board (#320, R370-2-1, R370-2-2, R370-3-1, R370-3-2): the first tab holds it; another shows it
// read-only and can take it over with "Use it here". Every stroke is written by one tab, exactly once.

const KEY = "unica-board:book-1:2:3";
const QUESTION = {
  transactionId: "desk-question",
  commands: [{ op: "columns", id: "question", operation: "add", operands: [{ id: "top", value: "419" }, { id: "bottom", value: "193" }], place: { region: "main" } }],
};

function ok(c: Change): BoardHistory {
  if (!c.ok) throw new Error(`refused: ${c.code}`);
  return c.history;
}

const stroke = (x: number, t: number): InkStroke => ({ erase: false, w: 4, boardWidth: 800, page: 1, pts: [[x, 0.5, t], [x + 0.02, 0.52, t + 10]] });
const start = () => ok(takePen(ok(mayaWrites(createHistory(), QUESTION, 0)), 2000));
const xs = (h: BoardHistory | null) => (h ? childStrokes(h).map((s) => s.pts[0][0]) : []);

/** A tab that hears nothing (frozen in the background, or crashed without letting go). */
const deaf: BoardChannel = { post: () => {}, listen: () => () => {} };

/**
 * One browser: shared storage, locks and channel. Each tab works as the desk does: it checks that it holds the board
 * before every edit, saves after every finished stroke, and ends a stroke in progress before it lets the board go.
 */
function browser(options: { lease?: boolean } = {}) {
  const store = createMemoryDraftStore();
  const locks = createMemoryLocks();
  const channels = createMemoryChannels();
  const timers = createFakeTimers();
  const open = async (tabId: string, tabOptions: { frozen?: boolean } = {}) => {
    const seen: { role: TabRole; history: BoardHistory | null }[] = [];
    let screen: BoardHistory | null = null;
    let capture: Capture | null = null;
    const commit = () => {
      if (!capture) return;
      const pts = capturedPoints(capture).map(([x, y, t]): [number, number, number] => [x, y, t]);
      capture = null;
      screen = ok(drawStroke(screen ?? start(), { erase: false, w: 4, boardWidth: 800, page: 1, pts }));
    };
    const opening = openBoardTab({
      key: KEY, tabId, store, timers,
      locks: options.lease ? leaseLocks({ store, tabId, timers }) : locks.tab(tabId),
      channel: tabOptions.frozen ? deaf : channels.tab(tabId),
      onChange: (role, history) => {
        seen.push({ role, history });
        screen = history;
      },
      beforeRelease: () => {
        // As if the pointer went up: the stroke in progress is kept, then saved.
        commit();
        if (screen) tab.save(screen, timers.now());
      },
    });
    await timers.advance(OPEN_TRIES * OPEN_RETRY_MS);
    const tab = await opening;
    screen = tab.stored();
    return {
      tab,
      seen,
      /** What the tab shows. */
      screen: () => screen,
      /** A finished stroke: refused unless this tab holds the board now; saved after it is drawn. */
      draw(x: number, t: number): string {
        if (!tab.owns()) return "refused";
        screen = ok(drawStroke(screen ?? start(), stroke(x, t)));
        return tab.save(screen, timers.now()).status;
      },
      /** A stroke in progress: the pointer is still down. */
      begin(x: number, t: number) {
        capture = startCapture([x, 0.5, t]);
        for (let i = 1; i <= 5; i++) capture = addPoint(capture, [x + i * 0.004, 0.5 + i * 0.002, t + i * 8], 0).capture;
      },
    };
  };
  return { store, locks, channels, timers, open };
}

describe("one tab writes a board", () => {
  it("the first tab holds the board; a second shows it read-only, and only the holder's saves are written", async () => {
    const b = browser();
    const a = await b.open("a");
    const c = await b.open("c");
    expect(a.tab.role()).toBe("holder");
    expect(c.tab.role()).toBe("reader");
    expect(a.draw(0.1, 2100)).toBe("saved");
    expect(c.draw(0.5, 2200)).toBe("refused");
    expect(c.tab.save(ok(drawStroke(start(), stroke(0.5, 2200))), 3_000)).toEqual({ status: "reader" });
    expect(xs(loadDraft(b.store, KEY))).toEqual([0.1]);
    // The reader is told the holder saved, and shows the stored board.
    await b.timers.advance(1);
    expect(c.seen.at(-1)).toEqual({ role: "reader", history: loadDraft(b.store, KEY) });
  });

  it("a hand-over with \"Use it here\" keeps every stroke exactly once", async () => {
    const b = browser();
    const a = await b.open("a");
    const c = await b.open("c");
    a.draw(0.1, 2100);
    a.draw(0.2, 2200);
    const taking = c.tab.takeOver();
    await b.timers.advance(1);
    expect(await taking).toBe(true);
    expect([c.tab.role(), a.tab.role()]).toEqual(["holder", "reader"]);
    expect(xs(c.screen())).toEqual([0.1, 0.2]);
    expect(c.draw(0.3, 2300)).toBe("saved");
    expect(a.draw(0.9, 2400)).toBe("refused");
    await b.timers.advance(1);
    expect(xs(loadDraft(b.store, KEY))).toEqual([0.1, 0.2, 0.3]);
    expect(xs(a.screen())).toEqual([0.1, 0.2, 0.3]);
  });

  it("a stroke in progress when \"Use it here\" arrives is ended, kept and stored once (R370-3-2)", async () => {
    const b = browser();
    const a = await b.open("a");
    const c = await b.open("c");
    a.draw(0.1, 2100);
    a.begin(0.4, 2300);
    const taking = c.tab.takeOver();
    await b.timers.advance(1);
    expect(await taking).toBe(true);
    expect(xs(loadDraft(b.store, KEY))).toEqual([0.1, 0.4]);
    expect(childStrokes(loadDraft(b.store, KEY)!)[1].pts).toHaveLength(6);
    expect(xs(c.screen())).toEqual([0.1, 0.4]);
  });

  it("a page that opens the board again just after letting it go still gets it (the lock frees a moment later)", async () => {
    const b = browser();
    const old = await b.locks.tab("old").tryTake(boardLockName(KEY));
    setTimeout(() => old!.release(), 0);
    const a = await b.open("a");
    expect(a.tab.role()).toBe("holder");
  });

  it("a holder that closes lets the board go, and the next tab gets everything", async () => {
    const b = browser();
    const a = await b.open("a");
    a.draw(0.1, 2100);
    a.draw(0.2, 2200);
    a.tab.close();
    const c = await b.open("c");
    expect(c.tab.role()).toBe("holder");
    expect(xs(c.tab.stored())).toEqual([0.1, 0.2]);
  });

  it("with Web Locks, a crashed holder's lock is freed by the browser, and the asking tab takes the board", async () => {
    const b = browser();
    const a = await b.open("a", { frozen: true });
    a.draw(0.1, 2100);
    const c = await b.open("c");
    b.locks.crash("a");
    const taking = c.tab.takeOver();
    await b.timers.advance(HAND_OVER_MS + 1000);
    expect(await taking).toBe(true);
    expect(xs(c.screen())).toEqual([0.1]);
  });

  it("with Web Locks, a holder that is alive but does not let go keeps the board: the asking tab stays read-only", async () => {
    const b = browser();
    await b.locks.tab("ghost").tryTake(boardLockName(KEY));
    const c = await b.open("c");
    const taking = c.tab.takeOver();
    await b.timers.advance(HAND_OVER_MS + 1000);
    expect(await taking).toBe(false);
    expect(c.tab.role()).toBe("reader");
  });
});

describe("storage leases where the browser has no Web Locks (R370-3-1)", () => {
  it("never hand a board over because time passed: a background tab's timers may stop for long", async () => {
    const b = browser({ lease: true });
    const a = await b.open("a", { frozen: true });
    a.draw(0.1, 2100);
    await b.timers.advance(60 * 60_000);
    const c = await b.open("c");
    expect(c.tab.role()).toBe("reader");
    expect(a.tab.owns()).toBe(true);
    expect(a.draw(0.2, 2200)).toBe("saved");
    expect(xs(loadDraft(b.store, KEY))).toEqual([0.1, 0.2]);
  });

  it("a frozen holder and a forced \"Use it here\": after the wait the board moves, and no stroke is lost", async () => {
    const b = browser({ lease: true });
    const a = await b.open("a", { frozen: true });
    a.draw(0.1, 2100);
    a.draw(0.2, 2200);
    const c = await b.open("c");
    const taking = c.tab.takeOver();
    await b.timers.advance(HAND_OVER_MS + 1000);
    expect(await taking).toBe(true);
    expect(c.tab.role()).toBe("holder");
    expect(xs(c.screen())).toEqual([0.1, 0.2]);
    expect(c.draw(0.3, 2300)).toBe("saved");
    expect(xs(loadDraft(b.store, KEY))).toEqual([0.1, 0.2, 0.3]);
  });

  it("the old holder's edit after it lost the lease is refused, and its stored strokes stay as they are", async () => {
    const b = browser({ lease: true });
    const a = await b.open("a", { frozen: true });
    a.draw(0.1, 2100);
    const c = await b.open("c");
    const taking = c.tab.takeOver();
    await b.timers.advance(HAND_OVER_MS + 1000);
    await taking;
    // The frozen tab wakes up: it holds nothing now, so it neither draws nor saves.
    expect(a.tab.owns()).toBe(false);
    expect(a.tab.role()).toBe("reader");
    expect(a.draw(0.9, 2400)).toBe("refused");
    expect(a.tab.save(ok(drawStroke(a.screen()!, stroke(0.9, 2400))), 9_000)).toEqual({ status: "reader" });
    expect(xs(loadDraft(b.store, KEY))).toEqual([0.1]);
  });

  it("a tab that answers hands the board over at once, and a closed tab's lease is free", async () => {
    const b = browser({ lease: true });
    const a = await b.open("a");
    a.draw(0.1, 2100);
    const c = await b.open("c");
    const taking = c.tab.takeOver();
    await b.timers.advance(1000);
    expect(await taking).toBe(true);
    c.tab.close();
    expect(b.store.items.has(`${LEASE_ROOT}${boardLockName(KEY)}`)).toBe(false);
    const d = await b.open("d");
    expect(d.tab.role()).toBe("holder");
    expect(xs(d.tab.stored())).toEqual([0.1]);
  });

  it("of two tabs that take a free lease at once, one gets it", async () => {
    const store = createMemoryDraftStore();
    const timers = createFakeTimers();
    const both = Promise.all(["a", "b"].map((tabId) => leaseLocks({ store, tabId, timers }).tryTake("x")));
    await timers.advance(1000);
    expect((await both).filter(Boolean)).toHaveLength(1);
  });
});
