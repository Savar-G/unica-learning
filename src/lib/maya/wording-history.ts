// The child's wording history (D-196): which of Maya's wordings each child heard, and when, so a later call prefers the
// ones the child has not heard lately. Read it before a call (`createSession({ history })`) and record what the call
// said after it (`heardWordings(session)`). One seam, so the database store can come later (#375); the
// in-memory store is the reference and the test double. Only the newest MAX_WORDINGS are kept per child.
import type { WordingHistory } from "./variety";

export const MAX_WORDINGS = 600;

export interface WordingHistoryStore {
  /** The child's history: an empty one for a child with none. */
  read(childId: string): Promise<WordingHistory>;
  /** Adds what a call said; a wording keeps its newest time. */
  record(childId: string, heard: WordingHistory): Promise<void>;
}

/** Merges two histories: each wording's newest time, then only the newest MAX_WORDINGS wordings. */
export function mergeHistory(old: WordingHistory, heard: WordingHistory): WordingHistory {
  const merged = new Map<string, number>(Object.entries(old));
  for (const [id, at] of Object.entries(heard)) {
    if (!Number.isFinite(at)) continue;
    merged.set(id, Math.max(at, merged.get(id) ?? -Infinity));
  }
  return Object.fromEntries([...merged].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, MAX_WORDINGS));
}

export function memoryWordingHistoryStore(initial: Record<string, WordingHistory> = {}): WordingHistoryStore {
  const rows = new Map<string, WordingHistory>(Object.entries(initial).map(([id, h]) => [id, { ...h }]));
  return {
    async read(childId) {
      return { ...(rows.get(childId) ?? {}) };
    },
    async record(childId, heard) {
      rows.set(childId, mergeHistory(rows.get(childId) ?? {}, heard));
    },
  };
}
