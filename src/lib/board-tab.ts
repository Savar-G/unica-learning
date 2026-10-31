// One tab writes a board (#320, review R370-2-1 and R370-2-2): the tab that opens a board first holds it, and only that
// tab draws, erases, undoes, clears and saves. Another tab on the same board shows it read-only, from the stored draft,
// with "Use it here": that asks the holder (through the channel) to save and let go, then takes the board and reads the
// draft again. Every stroke is written by exactly one tab, so none is lost or doubled. A child uses one desk on one
// device: two tabs on one board are an edge case to block, not to merge.
//
// The seams: the draft store (src/lib/board-history.ts), the locks (the browser's Web Locks; a storage lease where there
// are none, `leaseLocks`), the channel between tabs (BroadcastChannel) and the timers. The in-memory versions are in
// src/lib/board-history-memory.ts. No DOM, clock or randomness here: the caller passes the tab's id and the clock.
import { loadDraft, saveDraft, type BoardHistory, type DraftStore, type SaveResult } from "@/lib/board-history";

/** A lock this tab holds. */
export interface HeldLock {
  release(): void;
  /** True while this tab still holds the lock: checked, synchronously, before every edit and every save. */
  owned(): boolean;
}

/** The lock of one board: the tab that holds it writes the board. */
export interface BoardLocks {
  /** Takes the lock `name` if no tab holds it, or null. */
  tryTake(name: string): Promise<HeldLock | null>;
  /**
   * Takes the lock from a holder that did not answer "Use it here" within HAND_OVER_MS (a frozen or crashed tab). Locks
   * whose holder the browser frees when its tab crashes (Web Locks) have none.
   */
  force?(name: string): Promise<HeldLock | null>;
}

/** What tabs say to each other about a board. */
export type BoardMessage =
  /** A tab asks the holder to save and let go. */
  | { kind: "ask"; key: string; from: string }
  /** The holder let go. */
  | { kind: "released"; key: string; from: string }
  /** The holder saved: tabs showing the board read-only read the draft again. */
  | { kind: "saved"; key: string; from: string };

export interface BoardChannel {
  post(message: BoardMessage): void;
  /** Calls `fn` with every message from other tabs; returns the function that stops it. */
  listen(fn: (message: BoardMessage) => void): () => void;
}

export interface TabTimers {
  /** Resolves after `ms`. */
  sleep(ms: number): Promise<void>;
}

/** The lock name of a board. */
export const boardLockName = (key: string) => `unica-board-lock:${key}`;

/**
 * How long "Use it here" waits for the holder to let go. After that it takes the board anyway: a holder that does not
 * answer is frozen or gone, and the board saves after every finished stroke, so such a tab has nothing unsaved.
 */
export const HAND_OVER_MS = 3000;

export type TabRole = "holder" | "reader";

/** A tab opening a board tries the lock this many times, this far apart, before it shows the board read-only. */
export const OPEN_TRIES = 4;
export const OPEN_RETRY_MS = 150;

export interface BoardTab {
  role(): TabRole;
  /**
   * True while this tab holds the board, checked now: the caller asks before every edit. A tab that lost its lock (its
   * lease went to another tab) is a reader from then on.
   */
  owns(): boolean;
  /** The stored draft as this tab last loaded or saved it, or null when there is none. */
  stored(): BoardHistory | null;
  /**
   * Saves the board. Only the holder writes; a tab that does not hold the board now gets `reader` and writes nothing. On
   * any difference from what this tab last loaded or saved, nothing is written and the stored board comes back (`reload`).
   */
  save(h: BoardHistory, now: number): SaveResult | { status: "reader" };
  /** "Use it here": asks the holder to let go, then takes the board. True when this tab holds it now. */
  takeOver(): Promise<boolean>;
  /** Lets the board go (the tab closes, hides or leaves the board). */
  close(): void;
}

export interface OpenTabOptions {
  key: string;
  tabId: string;
  store: DraftStore;
  locks: BoardLocks;
  channel: BoardChannel;
  timers: TabTimers;
  /**
   * The tab's role or the stored board changed: the board became this tab's, went to another tab, or the holder saved.
   * `history` is the stored draft to show (null when there is none).
   */
  onChange(role: TabRole, history: BoardHistory | null): void;
  /**
   * Called before the board goes to another tab: the holder's last chance to end a stroke in progress and save what is
   * on screen (with `save`, which still writes at that moment).
   */
  beforeRelease?(): void;
}

/** Opens a board in a tab: it holds the board when no other tab does, and shows it read-only otherwise. */
export async function openBoardTab(o: OpenTabOptions): Promise<BoardTab> {
  const name = boardLockName(o.key);
  let closed = false;
  let waiting: (() => void) | null = null;
  let held: HeldLock | null = null;
  // A lock let go a moment ago (the same page opening the board again) may not be free yet: try a few times.
  for (let tries = 0; tries < OPEN_TRIES && !held; tries++) {
    if (tries > 0) await o.timers.sleep(OPEN_RETRY_MS);
    held = await o.locks.tryTake(name);
  }
  let base = loadDraft(o.store, o.key);

  const owns = () => {
    if (held && !held.owned()) held = null;
    return held !== null && !closed;
  };

  const letGo = () => {
    o.beforeRelease?.();
    held?.release();
    held = null;
    base = loadDraft(o.store, o.key);
    o.channel.post({ kind: "released", key: o.key, from: o.tabId });
    o.onChange("reader", base);
  };

  const stop = o.channel.listen((m) => {
    if (m.key !== o.key || m.from === o.tabId || closed) return;
    if (m.kind === "ask" && owns()) letGo();
    else if (m.kind === "released") waiting?.();
    else if (m.kind === "saved" && !owns()) {
      base = loadDraft(o.store, o.key);
      o.onChange("reader", base);
    }
  });

  return {
    role: () => (owns() ? "holder" : "reader"),
    owns,
    stored: () => base,
    save(h, now) {
      if (!owns()) return { status: "reader" };
      const result = saveDraft(o.store, o.key, h, base, now);
      if (result.status !== "failed") base = result.history;
      if (result.status === "saved") o.channel.post({ kind: "saved", key: o.key, from: o.tabId });
      return result;
    },
    async takeOver() {
      if (owns()) return true;
      if (closed) return false;
      const answered = new Promise<void>((resolve) => (waiting = resolve));
      o.channel.post({ kind: "ask", key: o.key, from: o.tabId });
      await Promise.race([answered, o.timers.sleep(HAND_OVER_MS)]);
      waiting = null;
      // A lock just let go may take a moment to be free; the browser frees a closed or crashed tab's Web Lock.
      for (let tries = 0; tries < 5 && !held && !closed; tries++) {
        held = await o.locks.tryTake(name);
        if (!held) await o.timers.sleep(100);
      }
      // No answer and still held: the holder is frozen or gone. Take the board anyway where the lock allows it.
      if (!held && !closed && o.locks.force) held = await o.locks.force(name);
      if (!held || closed) return false;
      base = loadDraft(o.store, o.key);
      o.onChange("holder", base);
      return true;
    },
    close() {
      closed = true;
      stop();
      held?.release();
      held = null;
    },
  };
}

/** A lease kept in storage, where the browser has no Web Locks. */
export const LEASE_ROOT = "unica-board-lease:";
/** After writing a lease, a tab waits this long and reads it back: of two tabs that wrote at once, the last one wins. */
export const LEASE_SETTLE_MS = 80;

/**
 * Locks made of leases in storage, for browsers without Web Locks: `{ tab }` under LEASE_ROOT + name. A lease never
 * expires while its tab is open (R370-3-1: a background tab's timers can stop for long, so time alone never hands a
 * board over). The tab removes it when it lets go, closes or hides (`pagehide`); only "Use it here" takes it from a tab
 * that did not answer (`force`). A tab takes a free lease, waits LEASE_SETTLE_MS and reads it back, so two tabs taking
 * it at once agree on one. `owned` reads the lease: a tab whose lease another tab took holds nothing from then on.
 */
export function leaseLocks(o: { store: DraftStore; tabId: string; timers: TabTimers }): BoardLocks {
  const read = (key: string): string | null => {
    try {
      const v = JSON.parse(o.store.read(key) ?? "null");
      return v && typeof v.tab === "string" ? v.tab : null;
    } catch {
      return null;
    }
  };
  const take = async (name: string, force: boolean): Promise<HeldLock | null> => {
    const key = `${LEASE_ROOT}${name}`;
    const holder = read(key);
    if (!force && holder !== null && holder !== o.tabId) return null;
    if (!o.store.write(key, JSON.stringify({ tab: o.tabId }))) return null;
    await o.timers.sleep(LEASE_SETTLE_MS);
    if (read(key) !== o.tabId) return null;
    let gone = false;
    return {
      owned: () => !gone && read(key) === o.tabId,
      release() {
        if (gone) return;
        gone = true;
        if (read(key) === o.tabId) o.store.remove(key);
      },
    };
  };
  return { tryTake: (name) => take(name, false), force: (name) => take(name, true) };
}
