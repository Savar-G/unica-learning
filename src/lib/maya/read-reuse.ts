// Reads kept for one text session (PR #941: the behaviour gate's time). A call reads the same turn and the same line
// many times: every check of a step reads the child's turn again, every replay of a committed control steps it again, and
// every line offered is counted again. The readers that use this (readNumbers and readAnswer in numbers.ts, speechWords
// in speech.ts) are pure: their result depends only on their text and read options. A text session makes one ReadReuse
// and installs it only around its own synchronous work (withReadReuse); a reader with one installed keeps each result
// under its exact input and gives every caller its own copy. Nothing is kept with none installed, nothing is shared
// between two ReadReuses, a read that throws keeps nothing, and each kind holds at most READ_REUSE_LIMIT results (when
// it is full, it is emptied and fills again). It keeps no session, package or clock. Pure TypeScript.
import type { AnswerRead, NumbersRead } from "./numbers";

export interface ReadReuse {
  numbers: Map<string, NumbersRead>;
  answers: Map<string, { read: AnswerRead; sureApart: boolean }>;
  words: Map<string, number>;
}
export const READ_REUSE_LIMIT = 2048;

/** An empty ReadReuse, for one text session. */
export const readReuse = (): ReadReuse => ({ numbers: new Map(), answers: new Map(), words: new Map() });

/** The ReadReuse in use while a text session runs its own synchronous work, or null. */
let installed: ReadReuse | null = null;
export const reuseInUse = (): ReadReuse | null => installed;

/**
 * Runs `run` with `reuse` in use for its synchronous part only. The ReadReuse in use before comes back after it, also
 * after a throw, so a nested or interleaved session never reads with another session's results. Work after an await
 * inside `run` runs with none, and reads as it always did.
 */
export function withReadReuse<T>(reuse: ReadReuse, run: () => T): T {
  const before = installed;
  installed = reuse;
  try {
    return run();
  } finally {
    installed = before;
  }
}

/** The result kept in `map` under `key`, else `read()`, kept there as a copy. Every caller gets its own copy (`copy`). */
export function reuseRead<T>(map: Map<string, T>, key: string, read: () => T, copy: (value: T) => T): T {
  const kept = map.get(key);
  if (kept !== undefined) return copy(kept);
  const value = read();
  if (map.size >= READ_REUSE_LIMIT) map.clear();
  map.set(key, copy(value));
  return value;
}
