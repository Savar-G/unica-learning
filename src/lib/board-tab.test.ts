import { describe, expect, it } from "vitest";
import { createHistory, drawStroke, loadDraft, mayaWrites, takePen, childStrokes, type BoardHistory, type Change, type InkStroke } from "@/lib/board-history";
import { createFakeTimers, createMemoryChannels, createMemoryDraftStore, createMemoryLocks } from "@/lib/board-history-memory";
import { HAND_OVER_MS, LEASE_MS, OPEN_RETRY_MS, OPEN_TRIES, boardLockName, leaseLocks, openBoardTab, type TabRole } from "@/lib/board-tab";

// One tab writes a board (#320, R370-2-1, R370-2-2): the first tab holds it; another shows it read-only and can take it
// over with "Use it here". Every stroke is written by one tab, exactly once.

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

/** One browser: shared storage, locks and channel; each tab gets its own view of them and records what it is told. */
function browser() {
  const store = createMemoryDraftStore();
  const locks = createMemoryLocks();
  const channels = createMemoryChannels();
  const timers = createFakeTimers();
  const open = async (tabId: string) => {
    const seen: { role: TabRole; history: BoardHistory | null }[] = [];
    let screen: BoardHistory | null = null;
    const opening = openBoardTab({
      key: KEY, tabId, store, locks: locks.tab(tabId), channel: channels.tab(tabId), timers,
      onChange: (role, history) => {
        seen.push({ role, history });
        screen = history;
      },
      beforeRelease: () => {
        if (screen) tab.save(screen, timers.now());
      },
    });
    await timers.advance(OPEN_TRIES * OPEN_RETRY_MS);
    const tab = await opening;
    screen = tab.stored();
    return {
      tab,
      seen,
      /** What the tab shows: the board as the child changed it, or as it was last read. */
      screen: () => screen,
      /** A stroke on the screen whose save has not run yet. */
      change(x: number, t: number) {
        screen = ok(drawStroke(screen ?? start(), stroke(x, t)));
      },
      draw(x: number, t: number) {
        screen = ok(drawStroke(screen ?? start(), stroke(x, t)));
        return tab.save(screen, timers.now());
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
    expect(a.draw(0.1, 2100).status).toBe("saved");
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
    expect(c.tab.role()).toBe("holder");
    expect(a.tab.role()).toBe("reader");
    expect(a.seen.at(-1)?.role).toBe("reader");
    expect(xs(c.screen())).toEqual([0.1, 0.2]);
    // The new holder draws on from the stored board; the old one can no longer write.
    expect(c.draw(0.3, 2300).status).toBe("saved");
    expect(a.tab.save(ok(drawStroke(a.screen()!, stroke(0.9, 2400))), 4_000)).toEqual({ status: "reader" });
    await b.timers.advance(1);
    expect(xs(loadDraft(b.store, KEY))).toEqual([0.1, 0.2, 0.3]);
    expect(xs(a.screen())).toEqual([0.1, 0.2, 0.3]);
  });

  it("the holder saves what is on its screen before it lets go", async () => {
    const b = browser();
    const a = await b.open("a");
    const c = await b.open("c");
    a.draw(0.1, 2100);
    a.change(0.2, 2200);
    const taking = c.tab.takeOver();
    await b.timers.advance(1);
    expect(await taking).toBe(true);
    expect(xs(loadDraft(b.store, KEY))).toEqual([0.1, 0.2]);
    expect(xs(c.screen())).toEqual([0.1, 0.2]);
  });

  it("a page that opens the board again just after letting it go still gets it (the lock frees a moment later)", async () => {
    const b = browser();
    const release = await b.locks.tab("old").tryTake(boardLockName(KEY));
    setTimeout(() => release!(), 0);
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

  it("a crashed holder that never answers: after the wait, the board is free and the asking tab takes it", async () => {
    const b = browser();
    const a = await b.open("a");
    a.draw(0.1, 2100);
    const c = await b.open("c");
    a.tab.close = () => {};
    // The tab is gone: it hears nothing, and the browser frees its lock.
    b.locks.crash("a");
    const taking = c.tab.takeOver();
    await b.timers.advance(HAND_OVER_MS + 10);
    expect(await taking).toBe(true);
    expect(xs(c.screen())).toEqual([0.1]);
  });

  it("a holder that is alive but does not let go keeps the board: the asking tab stays read-only", async () => {
    const b = browser();
    await b.locks.tab("ghost").tryTake(boardLockName(KEY));
    const c = await b.open("c");
    const taking = c.tab.takeOver();
    await b.timers.advance(HAND_OVER_MS + 1000);
    expect(await taking).toBe(false);
    expect(c.tab.role()).toBe("reader");
  });
});

describe("storage leases where the browser has no Web Locks", () => {
  const leases = () => {
    const store = createMemoryDraftStore();
    const timers = createFakeTimers(1_000_000);
    const tab = (tabId: string) => leaseLocks({ store, tabId, now: timers.now, timers });
    return { store, timers, tab };
  };

  it("gives a lease to one tab at a time, renews it, and frees it when let go", async () => {
    const l = leases();
    const a = l.tab("a").tryTake("x");
    await l.timers.advance(100);
    const release = await a;
    expect(release).not.toBeNull();
    const second = l.tab("b").tryTake("x");
    await l.timers.advance(100);
    expect(await second).toBeNull();
    // Renewed: still held long after LEASE_MS.
    await l.timers.advance(LEASE_MS * 3);
    const third = l.tab("b").tryTake("x");
    await l.timers.advance(100);
    expect(await third).toBeNull();
    release!();
    const fourth = l.tab("b").tryTake("x");
    await l.timers.advance(100);
    expect(await fourth).not.toBeNull();
  });

  it("of two tabs that take a free lease at once, one gets it", async () => {
    const l = leases();
    const both = Promise.all([l.tab("a").tryTake("x"), l.tab("b").tryTake("x")]);
    await l.timers.advance(100);
    const got = (await both).filter(Boolean);
    expect(got).toHaveLength(1);
  });

  it("frees the lease of a tab that stopped renewing it (closed or crashed)", async () => {
    const l = leases();
    l.store.write("unica-board-lease:x", JSON.stringify({ tab: "gone", at: l.timers.now() }));
    await l.timers.advance(LEASE_MS + 1);
    const take = l.tab("b").tryTake("x");
    await l.timers.advance(100);
    expect(await take).not.toBeNull();
  });

  it("a holder whose lease another tab took is told it lost the board", async () => {
    const l = leases();
    let lost = false;
    const a = l.tab("a").tryTake("x", () => (lost = true));
    await l.timers.advance(100);
    expect(await a).not.toBeNull();
    l.store.write("unica-board-lease:x", JSON.stringify({ tab: "b", at: l.timers.now() }));
    await l.timers.advance(4_000);
    expect(lost).toBe(true);
  });
});
