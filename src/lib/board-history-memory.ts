// The in-memory draft store for the board history (#320): the test double of the browser's storage. It can be full
// (every write fails, as when storage is full or off in private mode), and it locks as Web Locks do, or not at all.
// `beforeWrite` runs just before each write, so a test can put another tab's save in between a read and a write.
import type { DraftStore } from "@/lib/board-history";

export interface MemoryDraftStore extends DraftStore {
  /** From now on every write fails. */
  fill(): void;
  /** What the store holds, by key. */
  readonly items: ReadonlyMap<string, string>;
}

export function createMemoryDraftStore(
  initial: Record<string, string> = {},
  options: { locks?: boolean; beforeWrite?: (key: string) => void } = {},
): MemoryDraftStore {
  const items = new Map(Object.entries(initial));
  const queues = new Map<string, Promise<unknown>>();
  let full = false;
  let writing = false;
  return {
    items,
    read: (key) => items.get(key) ?? null,
    write(key, value) {
      if (full) return false;
      // The hook runs once per write, never inside a write it started itself.
      if (options.beforeWrite && !writing) {
        writing = true;
        try {
          options.beforeWrite(key);
        } finally {
          writing = false;
        }
      }
      items.set(key, value);
      return true;
    },
    remove: (key) => void items.delete(key),
    keys: () => [...items.keys()],
    exclusive<T>(key: string, fn: () => T): Promise<T> {
      if (options.locks === false) return Promise.resolve().then(fn);
      const run = (queues.get(key) ?? Promise.resolve()).then(fn);
      queues.set(key, run.catch(() => undefined));
      return run;
    },
    fill: () => void (full = true),
  };
}
