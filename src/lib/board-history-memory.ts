// The in-memory draft store for the board history (#320): the test double of the browser's storage. It can be full
// (every write fails, as when storage is full or off in private mode).
import type { DraftStore } from "@/lib/board-history";

export interface MemoryDraftStore extends DraftStore {
  /** From now on every write fails. */
  fill(): void;
  /** What the store holds, by key. */
  readonly items: ReadonlyMap<string, string>;
}

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
