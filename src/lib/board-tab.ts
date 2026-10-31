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

/** The lock of one board: the tab that holds it writes the board. */
export interface BoardLocks {
  /**
   * Takes the lock `name` if no tab holds it: resolves with the function that lets it go, or null. `onLost`: the lock was
   * taken away (only a storage lease can be; a Web Lock is held until let go).
   */
  tryTake(name: string, onLost?: () => void): Promise<(() => void) | null>;
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
  /** Calls `fn` every `ms`; returns the function that stops it. */
  every(ms: number, fn: () => void): () => void;
}

/** The lock name of a board. */
export const boardLockName = (key: string) => `unica-board-lock:${key}`;

/** How long "Use it here" waits for the holder to let go before it tries the lock anyway (a crashed tab has none). */
export const HAND_OVER_MS = 3000;

export type TabRole = "holder" | "reader";

/** A tab opening a board tries the lock this many times, this far apart, before it shows the board read-only. */
export const OPEN_TRIES = 4;
export const OPEN_RETRY_MS = 150;

export interface BoardTab {
  role(): TabRole;
  /** The stored draft, or null when there is none. */
  stored(): BoardHistory | null;
  /**
   * Saves the board. Only the holder writes; a reader gets `reader`. On any difference from what this tab last loaded or
   * saved, nothing is written and the stored board comes back (`reload`).
   */
  save(h: BoardHistory, now: number): SaveResult | { status: "reader" };
  /** "Use it here": asks the holder to let go, then takes the board. True when this tab holds it now. */
  takeOver(): Promise<boolean>;
  /** Lets the board go (the tab closes or leaves the board). */
  close(): void;
}

export interface OpenTabOptions {
  key: string;
  tabId: string;
  store: DraftStore;
  locks: BoardLocks;
  channel: BoardChannel;
  timers: Pick<TabTimers, "sleep">;
  /**
   * The tab's role or the stored board changed: the board became this tab's, went to another tab, or the holder saved.
   * `history` is the stored draft to show (null when there is none).
   */
  onChange(role: TabRole, history: BoardHistory | null): void;
  /** Called before the board goes to another tab: the holder's last chance to save what is on screen. */
  beforeRelease?(): void;
}

/** Opens a board in a tab: it holds the board when no other tab does, and shows it read-only otherwise. */
export async function openBoardTab(o: OpenTabOptions): Promise<BoardTab> {
  const name = boardLockName(o.key);
  let closed = false;
  let waiting: (() => void) | null = null;
  let release: (() => void) | null = null;
  let base: BoardHistory | null = null;
  const lost = () => {
    release = null;
    base = loadDraft(o.store, o.key);
    if (!closed) o.onChange("reader", base);
  };
  // A lock let go a moment ago (the same page opening the board again) may not be free yet: try a few times.
  for (let tries = 0; tries < OPEN_TRIES && !release; tries++) {
    if (tries > 0) await o.timers.sleep(OPEN_RETRY_MS);
    release = await o.locks.tryTake(name, lost);
  }
  base = loadDraft(o.store, o.key);

  const letGo = () => {
    o.beforeRelease?.();
    release?.();
    release = null;
    base = loadDraft(o.store, o.key);
    o.channel.post({ kind: "released", key: o.key, from: o.tabId });
    o.onChange("reader", base);
  };

  const stop = o.channel.listen((m) => {
    if (m.key !== o.key || m.from === o.tabId || closed) return;
    if (m.kind === "ask" && release) letGo();
    else if (m.kind === "released") waiting?.();
    else if (m.kind === "saved" && !release) {
      base = loadDraft(o.store, o.key);
      o.onChange("reader", base);
    }
  });

  return {
    role: () => (release ? "holder" : "reader"),
    stored: () => base,
    save(h, now) {
      if (!release || closed) return { status: "reader" };
      const result = saveDraft(o.store, o.key, h, base, now);
      if (result.status !== "failed") base = result.history;
      if (result.status === "saved") o.channel.post({ kind: "saved", key: o.key, from: o.tabId });
      return result;
    },
    async takeOver() {
      if (release) return true;
      if (closed) return false;
      const answered = new Promise<void>((resolve) => (waiting = resolve));
      o.channel.post({ kind: "ask", key: o.key, from: o.tabId });
      await Promise.race([answered, o.timers.sleep(HAND_OVER_MS)]);
      waiting = null;
      // The browser lets a closed or crashed tab's lock go; a lock just let go may take a moment to be free.
      for (let tries = 0; tries < 5 && !release && !closed; tries++) {
        release = await o.locks.tryTake(name, lost);
        if (!release) await o.timers.sleep(100);
      }
      if (!release) return false;
      base = loadDraft(o.store, o.key);
      o.onChange("holder", base);
      return true;
    },
    close() {
      closed = true;
      stop();
      release?.();
      release = null;
    },
  };
}

/** A lease kept in storage, where the browser has no Web Locks. */
export const LEASE_ROOT = "unica-board-lease:";
/** A lease not renewed for this long is free: its tab has closed or crashed. */
export const LEASE_MS = 10_000;
/** The holder renews its lease this often. */
export const LEASE_EVERY_MS = 3_000;
/** After writing a lease, a tab waits this long and reads it back: of two tabs that wrote at once, the last one wins. */
export const LEASE_SETTLE_MS = 80;

/**
 * Locks made of leases in storage, for browsers without Web Locks: `{ tab, at }` under LEASE_ROOT + name. A tab takes a
 * free or expired lease, waits LEASE_SETTLE_MS and reads it back, so two tabs taking it at once agree on one; the
 * holder renews it every LEASE_EVERY_MS and removes it when it lets go. A holder whose lease another tab took stops
 * renewing and loses the board (`onLost`), and the draft's compare-and-set check stops any late save.
 */
export function leaseLocks(o: { store: DraftStore; tabId: string; now: () => number; timers: TabTimers }): BoardLocks {
  const read = (key: string): { tab: string; at: number } | null => {
    try {
      const v = JSON.parse(o.store.read(key) ?? "null");
      return v && typeof v.tab === "string" && Number.isFinite(v.at) ? v : null;
    } catch {
      return null;
    }
  };
  return {
    async tryTake(name, onLost) {
      const key = `${LEASE_ROOT}${name}`;
      const held = read(key);
      if (held && held.tab !== o.tabId && o.now() - held.at < LEASE_MS) return null;
      const write = () => o.store.write(key, JSON.stringify({ tab: o.tabId, at: o.now() }));
      if (!write()) return null;
      await o.timers.sleep(LEASE_SETTLE_MS);
      if (read(key)?.tab !== o.tabId) return null;
      let mine = true;
      const stop = o.timers.every(LEASE_EVERY_MS, () => {
        if (!mine) return;
        if (read(key)?.tab !== o.tabId) {
          mine = false;
          stop();
          onLost?.();
          return;
        }
        write();
      });
      return () => {
        if (!mine) return;
        mine = false;
        stop();
        if (read(key)?.tab === o.tabId) o.store.remove(key);
      };
    },
  };
}
