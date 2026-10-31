// Variety in Maya's words (D-196): each line and each warm-talk purpose has several wordings, and code picks the one the
// child has heard least lately. Within a call a wording is not repeated until every other wording of its line has been
// said; across calls, wordings the child has not heard lately come first (the wording history, wording-history.ts).
// Ties are broken by a random number generator whose seed the caller passes in, and the times are the events' times,
// so the controller stays pure and a test can replay a call exactly. The child's name, from the profile, is said now
// and then: at most once in any 3 of Maya's turns, and only when the generator says so.

/** A wording's id: `<template key>#<index>` for a line, `phrase:<group>.<index>` for warm talk. */
export type WordingId = string;
/** When the child last heard each wording, in ms since 1970. */
export type WordingHistory = Record<WordingId, number>;

/** The variety state of one call. Plain data, kept in the session. */
export interface Variety {
  /** The generator's state (mulberry32). */
  rng: number;
  /** Wordings picked so far in this call. */
  seq: number;
  /** Wordings heard in this call: the pick number and the time. */
  heard: Record<WordingId, [number, number]>;
  /** Wordings the child heard in earlier calls, as the caller read them before the call. */
  history: WordingHistory;
  name: string | null;
  /** Maya's turn count when the name was last said, or null. */
  nameAt: number | null;
}

/** Turns between two uses of the child's name, at least. */
export const NAME_GAP = 3;

export function newVariety(input: { random: number; history?: WordingHistory; name?: string | null }): Variety {
  const history: WordingHistory = {};
  for (const [id, at] of Object.entries(input.history ?? {})) if (Number.isFinite(at)) history[id] = at;
  const name = typeof input.name === "string" && input.name.trim() !== "" ? input.name.trim() : null;
  return { rng: input.random >>> 0, seq: 0, heard: {}, history, name, nameAt: null };
}

/** The next number in [0, 1) from the generator (mulberry32); it moves the state on. */
export function nextRandom(v: Variety): number {
  v.rng = (v.rng + 0x6d2b79f5) >>> 0;
  let t = v.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Picks one of `ids` and records it as heard at `at`: first a wording not heard in this call (else the one heard
 * longest ago in it), then one the child has not heard in earlier calls (else the one heard longest ago), then at
 * random.
 */
export function chooseWording(v: Variety, ids: readonly WordingId[], at: number): number {
  const call = (id: WordingId) => (Object.hasOwn(v.heard, id) ? v.heard[id][0] : -1);
  const past = (id: WordingId) => (Object.hasOwn(v.history, id) ? v.history[id] : -Infinity);
  const firstCall = Math.min(...ids.map(call));
  let pool = ids.map((id, i) => [id, i] as const).filter(([id]) => call(id) === firstCall);
  const oldest = Math.min(...pool.map(([id]) => past(id)));
  pool = pool.filter(([id]) => past(id) === oldest);
  const [id, index] = pool[Math.floor(nextRandom(v) * pool.length)];
  v.seq += 1;
  v.heard[id] = [v.seq, at];
  return index;
}

/** The name may be said in this turn (Maya's `turn`-th): it is set, not said in the last few turns, and the coin agrees. */
export function nameNow(v: Variety, turn: number): boolean {
  if (v.name === null || (v.nameAt !== null && turn - v.nameAt < NAME_GAP)) return false;
  return nextRandom(v) < 0.5;
}

/** Fills or leaves out the name in a phrase: ", {name}" becomes ", Leah" or nothing. */
export function withName(text: string, name: string | null): string {
  return name === null ? text.replace(/,? ?\{name\}/g, "") : text.replace(/\{name\}/g, name);
}

/** The wordings heard in this call with their times, for the caller to add to the child's wording history. */
export const heardInCall = (v: Variety): WordingHistory => Object.fromEntries(Object.entries(v.heard).map(([id, [, at]]) => [id, at]));
