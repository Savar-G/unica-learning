// The in-memory seams of the board history (#320) and of the one-writer board tab (src/lib/board-tab.ts): the test
// doubles of the browser's storage, Web Locks, BroadcastChannel and timers. Tabs made from one browser share them.
import type { DraftStore } from "@/lib/board-history";
import type { BoardChannel, BoardLocks, BoardMessage, TabTimers } from "@/lib/board-tab";

export interface MemoryDraftStore extends DraftStore {
  /** From now on every write fails. */
  fill(): void;
  /** What the store holds, by key. */
  readonly items: ReadonlyMap<string, string>;
}

/** The browser's storage. It can be full (every write fails, as when storage is full or off in private mode). */
export function createMemoryDraftStore(initial: Record<string, string> = {}): MemoryDraftStore {
  const items = new Map(Object.entries(initial));
  let full = false;
  return {
    items,
    read: (key) => items.get(key) ?? null,
    write(key, value) {
      if (full) return false;
      items.set(key, value);
      return true;
    },
    remove: (key) => void items.delete(key),
    keys: () => [...items.keys()],
    fill: () => void (full = true),
  };
}

/** Web Locks shared by the tabs of one browser. `crash(tab)` frees every lock the tab held, as closing it does. */
export function createMemoryLocks() {
  const held = new Map<string, string>();
  return {
    held: held as ReadonlyMap<string, string>,
    /** The locks of one tab. */
    tab(tabId: string): BoardLocks {
      return {
        async tryTake(name) {
          if (held.has(name)) return null;
          held.set(name, tabId);
          let gone = false;
          return {
            owned: () => !gone && held.get(name) === tabId,
            release() {
              gone = true;
              if (held.get(name) === tabId) held.delete(name);
            },
          };
        },
      };
    },
    crash(tabId: string) {
      for (const [name, tab] of held) if (tab === tabId) held.delete(name);
    },
  };
}

/** A BroadcastChannel shared by the tabs of one browser: a message reaches every other tab, a moment later. */
export function createMemoryChannels() {
  const listeners = new Map<string, Set<(m: BoardMessage) => void>>();
  const sent: BoardMessage[] = [];
  return {
    sent: sent as readonly BoardMessage[],
    tab(tabId: string): BoardChannel {
      return {
        post(m) {
          sent.push(m);
          for (const [tab, fns] of listeners) if (tab !== tabId) for (const fn of fns) queueMicrotask(() => fn(m));
        },
        listen(fn) {
          const fns = listeners.get(tabId) ?? new Set();
          fns.add(fn);
          listeners.set(tabId, fns);
          return () => void fns.delete(fn);
        },
      };
    },
  };
}

/** Timers on a clock the test moves: `sleep` resolves when `advance` passes its time. `now` reads the clock. */
export function createFakeTimers(start = 0): TabTimers & { now(): number; advance(ms: number): Promise<void> } {
  let clock = start;
  let waits: { at: number; done: () => void }[] = [];
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return {
    now: () => clock,
    sleep: (ms) => new Promise<void>((done) => waits.push({ at: clock + ms, done })),
    async advance(ms) {
      const end = clock + ms;
      for (;;) {
        await flush();
        const next = Math.min(end + 1, ...waits.map((w) => w.at));
        if (next > end) break;
        clock = next;
        const due = waits.filter((w) => w.at <= clock);
        waits = waits.filter((w) => w.at > clock);
        for (const w of due) w.done();
      }
      clock = end;
      await flush();
    },
  };
}
